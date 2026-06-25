"""
程序变更页面相关 API
===================
GET  /api/programs/list                       一级列表（按产品名聚合）
GET  /api/programs/product/{product_name}     二级：该产品所有版本
GET  /api/programs/lot/{lot_id}/compare       三级：与前版对比
POST /api/programs/upload_pgs                 上传并解析 .pgs 文件
PUT  /api/programs/lot/{lot_id}/extra         更新 engineer/package/hardware_info
GET  /api/programs/suggestions/{field}        历史填写值下拉建议
GET  /api/programs/pgs_list/{product_name}    该产品的 PGS 上传列表
GET  /api/programs/pgs/{upload_id}/params     解析出的 Param 表
GET  /api/programs/pgs/{upload_id}/summary    解析出的 Summary 表
POST /api/programs/placeholder                新增产品名占位
GET  /api/programs/placeholders               所有占位产品名
"""

import json
import io
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import PurePosixPath
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.bin_summary import BinSummary
from app.models.lot import Lot
from app.models.pgs_upload import PgsUpload
from app.models.pgs_placeholder import PgsPlaceholder
from app.models.program_data_snapshot import ProgramDataSnapshot
from app.models.program_change_extra import ProgramChangeExtra
from app.models.test_item import TestItem
from app.models.user import User
from app.services.pgs_parser import parse_pgs, _version_sort_key

router = APIRouter(prefix="/programs", tags=["programs"])

UPLOAD_DIR = os.path.expanduser(settings.UPLOAD_DIR)
CPP_RESPONSE_CACHE: dict[int, dict] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_extra(db: Session, lot_id: int) -> Optional[ProgramChangeExtra]:
    return db.query(ProgramChangeExtra).filter(ProgramChangeExtra.lot_id == lot_id).first()


def _is_qa_text(text: str | None) -> bool:
    if not text:
        return False
    up = str(text).upper()
    return "QA" in up or "(QA)" in up


def _fmt_dt(dt) -> Optional[str]:
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _months_cutoff(now: datetime, months: float) -> datetime:
    if months >= 1 and float(months).is_integer():
        return now - relativedelta(months=int(months))
    whole_months = int(months)
    fractional_days = round((months - whole_months) * 30)
    return now - relativedelta(months=whole_months) - timedelta(days=fractional_days)


def _load_program_data_snapshot(db: Session, product_name: str) -> list:
    snapshot = (
        db.query(ProgramDataSnapshot)
        .filter(ProgramDataSnapshot.product_name == product_name)
        .first()
    )
    if not snapshot:
        return []
    try:
        rows = json.loads(snapshot.rows_json or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    return rows if isinstance(rows, list) else []


def _save_program_data_snapshot(
    db: Session,
    product_name: str,
    rows: list,
    days: int,
    months: Optional[float],
) -> None:
    snapshot = (
        db.query(ProgramDataSnapshot)
        .filter(ProgramDataSnapshot.product_name == product_name)
        .first()
    )
    rows_json = json.dumps(rows, ensure_ascii=False)
    months_text = None if months is None else str(months)
    if snapshot:
        snapshot.days = days
        snapshot.months = months_text
        snapshot.row_count = len(rows)
        snapshot.rows_json = rows_json
        snapshot.updated_at = datetime.now()
    else:
        snapshot = ProgramDataSnapshot(
            product_name=product_name,
            days=days,
            months=months_text,
            row_count=len(rows),
            rows_json=rows_json,
        )
        db.add(snapshot)
    db.commit()


def _calc_avg_touch_down(db: Session, product_name: str) -> Optional[float]:
    """
    计算平均 TouchDown 时间（秒/片）
    逻辑：
      1. 优先使用 OSAT (data_source='ftp') 数据，无则用 ENG_DATA (data_source='manual')
      2. 取已完成的 lot（status='processed'，有 beginning_time 和 ending_time）
      3. 按 ending_time 降序取最多 50 条候选
      4. 过滤：die_count >= max_die_count * 0.98（完整晶圆）
      5. 过滤：yield_rate >= avg_yield - 0.05（排除异常片）
      6. 取最近 25 条符合条件的记录，计算平均测试时长（秒/颗）
    """
    def _query_lots(data_source: str):
        return (
            db.query(Lot)
            .filter(
                Lot.product_name == product_name,
                Lot.data_source == data_source,
                Lot.status == "processed",
                Lot.beginning_time.isnot(None),
                Lot.ending_time.isnot(None),
                Lot.die_count.isnot(None),
                Lot.die_count > 0,
            )
            .order_by(desc(Lot.ending_time))
            .limit(50)
            .all()
        )

    candidates = _query_lots("ftp")
    if not candidates:
        candidates = _query_lots("manual")
    if not candidates:
        return None

    max_die = max(lot.die_count for lot in candidates)
    yields = [lot.yield_rate for lot in candidates if lot.yield_rate is not None]
    avg_yield = sum(yields) / len(yields) if yields else 0.0

    filtered = []
    for lot in candidates:
        if lot.die_count < max_die * 0.98:
            continue
        yr = lot.yield_rate or 0.0
        if yr < avg_yield - 0.05:
            continue
        filtered.append(lot)

    filtered = filtered[:25]
    if not filtered:
        return None

    durations = []
    for lot in filtered:
        start = lot.beginning_time
        end = lot.ending_time
        if start and end:
            diff = (end - start).total_seconds()
            if diff > 0 and lot.die_count:
                durations.append(diff / lot.die_count)

    if not durations:
        return None
    return round(sum(durations) / len(durations), 2)


def _calc_wafer_test_time(lot: Lot) -> Optional[float]:
    """CP 数据：直接用该 lot 的测试时长（秒）作为单片测试时间"""
    if lot.beginning_time and lot.ending_time:
        diff = (lot.ending_time - lot.beginning_time).total_seconds()
        return round(diff, 1) if diff > 0 else None
    return None


def _calc_avg_wafer_time(
    db: Session, product_name: str, tester: Optional[str] = None
) -> Optional[float]:
    """
    计算平均每片 Wafer 测试时间（秒）
    过滤规则：
      - 程序名不含 _QA 或 _RT（大小写不敏感）
      - die_count >= max_die_count * 0.70
      - 0.70 <= yield_rate < 1.0（排除异常低良率和100%满良率）
      - 取最近 25 条符合条件的记录，计算平均测试时长
    """
    q = db.query(Lot).filter(
        Lot.product_name == product_name,
        Lot.status == "processed",
        Lot.beginning_time.isnot(None),
        Lot.ending_time.isnot(None),
        Lot.die_count.isnot(None),
        Lot.die_count > 0,
        Lot.yield_rate.isnot(None),
        Lot.program.isnot(None),
    )
    if tester:
        q = q.filter(Lot.test_machine == tester)
    q = q.order_by(desc(Lot.ending_time)).limit(100)

    candidates = q.all()

    # Python 侧过滤程序名（含 _QA 或 _RT 的跳过）
    candidates = [
        lot for lot in candidates
        if not _is_qa_text(lot.program)
        and "_RT" not in (lot.program or "").upper()
    ]

    if not candidates:
        return None

    max_die = max(lot.die_count for lot in candidates)

    filtered = [
        lot for lot in candidates
        if lot.die_count >= max_die * 0.70
        and lot.yield_rate is not None
        and 0.70 <= lot.yield_rate < 1.0
    ][:25]

    if not filtered:
        return None

    durations = []
    for lot in filtered:
        diff = (lot.ending_time - lot.beginning_time).total_seconds()
        if diff > 0:
            durations.append(diff)

    return round(sum(durations) / len(durations), 0) if durations else None


def _calc_program_wafer_stats(
    db: Session,
    product_name: str,
    program: str,
    tester: Optional[str],
    cutoff: datetime,
) -> dict:
    q = (
        db.query(Lot)
        .filter(
            Lot.product_name == product_name,
            Lot.program == program,
            Lot.status == "processed",
            ~Lot.filename.ilike("%QA%"),
            Lot.test_date.isnot(None),
            Lot.test_date >= cutoff,
            Lot.beginning_time.isnot(None),
            Lot.ending_time.isnot(None),
            Lot.die_count.isnot(None),
            Lot.die_count > 0,
        )
    )
    if tester:
        q = q.filter(Lot.test_machine == tester)
    lots = q.all()
    if not lots:
        return {"uph_s": None, "test_yield": None}

    max_die = max(lot.die_count or 0 for lot in lots)
    qualified = [lot for lot in lots if (lot.die_count or 0) >= max_die * 0.95]
    durations = []
    yields = []
    for lot in qualified:
        diff = (lot.ending_time - lot.beginning_time).total_seconds()
        if diff > 0:
            durations.append(diff)
        if lot.yield_rate is not None:
            yields.append(lot.yield_rate)

    return {
        "uph_s": round(sum(durations) / len(durations), 1) if durations else None,
        "test_yield": round(sum(yields) / len(yields), 6) if yields else None,
    }


def _get_lot_params(db: Session, lot_id: int) -> List[dict]:
    """返回参数列表（序号/bin/item_name/lower_limit/upper_limit/unit）"""
    items = (
        db.query(TestItem)
        .filter(TestItem.lot_id == lot_id, TestItem.site == 0)
        .order_by(TestItem.item_number)
        .all()
    )
    return [
        {
            "item_number": it.item_number,
            "bin": None,
            "item_name": it.item_name,
            "lower_limit": it.lower_limit,
            "upper_limit": it.upper_limit,
            "unit": it.unit,
        }
        for it in items
    ]


def _get_lot_bins(db: Session, lot_id: int) -> List[dict]:
    """返回 Bin 汇总（site=0, data_range=final）"""
    bins = (
        db.query(BinSummary)
        .filter(
            BinSummary.lot_id == lot_id,
            BinSummary.site == 0,
            BinSummary.data_range == "final",
        )
        .order_by(BinSummary.bin_number)
        .all()
    )
    return [
        {
            "bin_number": b.bin_number,
            "bin_name": b.bin_name,
            "count": b.count,
            "percentage": b.percentage,
        }
        for b in bins
    ]


def _get_lot_data_params(db: Session, lot_id: int) -> List[dict]:
    items = (
        db.query(TestItem)
        .filter(TestItem.lot_id == lot_id, TestItem.site == 0)
        .order_by(TestItem.item_number)
        .all()
    )
    rows = []
    for idx, it in enumerate(items, 1):
        rows.append({
            "row_no": idx,
            "test_no": it.item_number,
            "function": "",
            "param": it.item_name,
            "symbol": it.item_name,
            "min": it.lower_limit,
            "max": it.upper_limit,
            "unit": it.unit,
            "format": "",
            "subunit": "",
            "description": "",
            "sw_bin": None,
            "hw_bin": None,
            "qa_min": None,
            "qa_max": None,
            "qa_sw_bin": None,
            "is_qa": False,
        })
    return rows


def _get_lot_data_summary(db: Session, lot_id: int) -> List[dict]:
    bins = (
        db.query(BinSummary)
        .filter(
            BinSummary.lot_id == lot_id,
            BinSummary.site == 0,
            BinSummary.data_range == "final",
        )
        .order_by(BinSummary.bin_number)
        .all()
    )
    return [
        {
            "sw_bin": b.bin_number,
            "hw_bin": b.bin_number,
            "bin_name": b.bin_name or f"Bin{b.bin_number}",
        }
        for b in bins
    ]


def _data_param_signature(params: List[dict]) -> tuple:
    return tuple(sorted(
        (
            p.get("symbol") or "",
            p.get("min"),
            p.get("max"),
            p.get("unit") or "",
        )
        for p in params
    ))


def _data_summary_signature(summary: List[dict]) -> tuple:
    return tuple(
        (
            s.get("sw_bin"),
            s.get("hw_bin"),
            s.get("bin_name") or "",
        )
        for s in summary
    )


def _data_version_signature(params: List[dict], summary: List[dict]) -> tuple:
    return _data_param_signature(params)


def _lot_is_osat(lot: Lot) -> bool:
    return getattr(lot.data_source, "value", lot.data_source) == "ftp"


def _summary_bin_name(value) -> str:
    return str(value or "").strip()


def _summary_sw_key(row: dict) -> str:
    return str(row.get("sw_bin") if row.get("sw_bin") is not None else "")


def _summary_max_sw(rows: List[dict]) -> int:
    values = []
    for row in rows:
        try:
            values.append(int(row.get("sw_bin")))
        except (TypeError, ValueError):
            continue
    return max(values) if values else 0


def _expand_summary_by_sw(rows: List[dict], max_sw: Optional[int] = None) -> List[dict]:
    by_sw = {_summary_sw_key(row): row for row in rows}
    upper = max_sw if max_sw is not None else _summary_max_sw(rows)
    expanded = []
    for sw in range(1, upper + 1):
        row = by_sw.get(str(sw))
        expanded.append({
            "sw_bin": sw,
            "hw_bin": row.get("hw_bin", sw) if row else sw,
            "bin_name": row.get("bin_name", "") if row else "",
        })
    return expanded


def _compare_summary_to_pgm_standard(current: List[dict], standard: List[dict]) -> tuple[bool, List[dict]]:
    """PGM standard mode: missing current bins are ignored; added/renamed bins are different."""
    current_map = {_summary_sw_key(row): row for row in current}
    standard_map = {_summary_sw_key(row): row for row in standard}
    rows = []
    passed = True

    for cur in sorted(current, key=lambda row: _summary_max_sw([row]) or 999999):
        key = _summary_sw_key(cur)
        ref = standard_map.get(key)
        if not ref:
            status = "added"
            passed = False
        elif _summary_bin_name(cur.get("bin_name")) != _summary_bin_name(ref.get("bin_name")):
            status = "changed"
            passed = False
        else:
            status = "same"
        rows.append({"left": cur, "right": ref, "status": status})

    return passed, rows


def _build_data_param_changes_summary(old_params: list, new_params: list) -> str:
    if not old_params:
        return "首版"

    old_map = {_pgs_param_key(p): p for p in old_params}
    new_map = {_pgs_param_key(p): p for p in new_params}
    added = [key for key in new_map if key not in old_map]
    removed = [key for key in old_map if key not in new_map]
    limit_changed = sum(
        1 for key in new_map
        if key in old_map and (
            old_map[key].get("min") != new_map[key].get("min") or
            old_map[key].get("max") != new_map[key].get("max")
        )
    )

    parts = []
    if added:
        parts.append(f"+{len(added)}参数")
    if removed:
        parts.append(f"-{len(removed)}参数")
    if limit_changed:
        parts.append(f"更新{limit_changed}Limit")
    return "，".join(parts) if parts else "无变化"


def _build_changes_summary(old_params: List[dict], new_params: List[dict]) -> str:
    """对比两版参数，返回变更摘要文字"""
    if not old_params:
        return "首版"
    old_map = {p["item_name"]: p for p in old_params}
    new_map = {p["item_name"]: p for p in new_params}

    added = [n for n in new_map if n not in old_map]
    removed = [n for n in old_map if n not in new_map]
    limit_changed = sum(
        1 for name in new_map
        if name in old_map and (
            old_map[name]["lower_limit"] != new_map[name]["lower_limit"] or
            old_map[name]["upper_limit"] != new_map[name]["upper_limit"]
        )
    )

    parts = []
    if added:
        parts.append(f"+{len(added)}参数")
    if removed:
        parts.append(f"-{len(removed)}参数")
    if limit_changed:
        parts.append(f"更新{limit_changed}Limit")
    return "、".join(parts) if parts else "无变化"


def _compare_params(old_params: List[dict], new_params: List[dict]) -> list:
    """逐行对比，返回两侧数据及差异类型"""
    old_map = {p["item_name"]: p for p in old_params}
    new_map = {p["item_name"]: p for p in new_params}
    all_names = list(dict.fromkeys(
        [p["item_name"] for p in new_params] +
        [p["item_name"] for p in old_params]
    ))

    rows = []
    for name in all_names:
        in_new = name in new_map
        in_old = name in old_map
        if in_new and not in_old:
            rows.append({"name": name, "new": new_map[name], "old": None,
                         "row_type": "added", "limit_direction": None})
        elif in_old and not in_new:
            rows.append({"name": name, "new": None, "old": old_map[name],
                         "row_type": "removed", "limit_direction": None})
        else:
            np_ = new_map[name]
            op = old_map[name]
            if np_["lower_limit"] != op["lower_limit"] or np_["upper_limit"] != op["upper_limit"]:
                direction = _limit_direction(op, np_)
                rows.append({"name": name, "new": np_, "old": op,
                             "row_type": "limit_changed", "limit_direction": direction})
            else:
                rows.append({"name": name, "new": np_, "old": op,
                             "row_type": "same", "limit_direction": None})
    return rows


def _limit_direction(old_p: dict, new_p: dict) -> str:
    old_ll, old_ul = old_p.get("lower_limit"), old_p.get("upper_limit")
    new_ll, new_ul = new_p.get("lower_limit"), new_p.get("upper_limit")
    if old_ll is not None and old_ul is not None and new_ll is not None and new_ul is not None:
        old_w = old_ul - old_ll
        new_w = new_ul - new_ll
        if new_w > old_w:
            return "loose"
        elif new_w < old_w:
            return "tight"
    return "mixed"


def _find_prev_lot(db: Session, lot: Lot) -> Optional[Lot]:
    """查找同一产品同一 tester 下，比当前 lot 更早的 lot"""
    q = (
        db.query(Lot)
        .filter(
            Lot.product_name == lot.product_name,
            Lot.test_machine == lot.test_machine,
            Lot.status == "processed",
            Lot.id != lot.id,
            or_(Lot.data_type.is_(None), Lot.data_type != "MP_Yield"),
        )
        .order_by(desc(Lot.test_date))
    )
    if lot.test_date:
        q = q.filter(Lot.test_date < lot.test_date)
    return q.first()


def _get_max_item_count(db: Session, product_name: str, program: str) -> int:
    """获取同产品同程序下最大测试项数量"""
    lots = (
        db.query(Lot.item_count)
        .filter(
            Lot.product_name == product_name,
            Lot.program == program,
            Lot.status == "processed",
            Lot.item_count.isnot(None),
            Lot.item_count > 0,
        )
        .all()
    )
    if not lots:
        return 0
    return max(r[0] for r in lots)


def _next_available_path(directory: str, filename: str) -> str:
    base, ext = os.path.splitext(filename)
    path = os.path.join(directory, filename)
    counter = 1
    while os.path.exists(path):
        path = os.path.join(directory, f"{base}_{counter}{ext}")
        counter += 1
    return path


def _is_first_layer_member(name: str) -> bool:
    normalized = name.replace("\\", "/").strip("/")
    if not normalized:
        return False
    parts = PurePosixPath(normalized).parts
    return 1 <= len(parts) <= 2 and not any(part in ("", ".", "..") for part in parts)


def _archive_rel_path(root_dir: str, file_path: str) -> str:
    return os.path.relpath(file_path, root_dir).replace("\\", "/")


def _extract_with_unar(path: str, tmpdir: str, ext: str) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            ["unar", "-quiet", "-force-overwrite", "-output-directory", tmpdir, path],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise ValueError(f"Server is missing unar and cannot parse {ext} files") from exc


def _walk_extracted_files(tmpdir: str) -> list[tuple[str, str]]:
    matches: list[tuple[str, str]] = []
    for root, _dirs, files in os.walk(tmpdir):
        for filename in files:
            full_path = os.path.join(root, filename)
            matches.append((_archive_rel_path(tmpdir, full_path), full_path))
    matches.sort(key=lambda item: item[0].lower())
    return matches


def _read_pgs_from_zip(path: str, archive_base: str) -> tuple[bytes, str]:
    target = f"{archive_base}.pgs".lower()
    with zipfile.ZipFile(path, "r") as zf:
        exact_first_layer = [
            info for info in zf.infolist()
            if not info.is_dir()
            and _is_first_layer_member(info.filename)
            and PurePosixPath(info.filename.replace("\\", "/")).name.lower() == target
        ]
        exact_recursive = [
            info for info in zf.infolist()
            if not info.is_dir()
            and PurePosixPath(info.filename.replace("\\", "/")).name.lower() == target
        ]
        all_pgs = [
            info for info in zf.infolist()
            if not info.is_dir()
            and PurePosixPath(info.filename.replace("\\", "/")).name.lower().endswith(".pgs")
        ]
        candidates = exact_first_layer or exact_recursive
        if not candidates and len(all_pgs) == 1:
            candidates = all_pgs
        if not candidates:
            raise ValueError(f"压缩包中未找到 {archive_base}.pgs")
        candidates.sort(key=lambda info: len(PurePosixPath(info.filename.replace("\\", "/")).parts))
        picked = candidates[0]
        return zf.read(picked), PurePosixPath(picked.filename.replace("\\", "/")).name


def _read_pgs_from_rar(path: str, archive_base: str) -> tuple[bytes, str]:
    try:
        import rarfile
    except ImportError as exc:
        raise ValueError("Server is missing the rarfile dependency and cannot parse .rar files") from exc

    target = f"{archive_base}.pgs".lower()
    with rarfile.RarFile(path, "r") as rf:
        exact_first_layer = [
            info for info in rf.infolist()
            if not info.isdir()
            and _is_first_layer_member(info.filename)
            and PurePosixPath(info.filename.replace("\\", "/")).name.lower() == target
        ]
        exact_recursive = [
            info for info in rf.infolist()
            if not info.isdir()
            and PurePosixPath(info.filename.replace("\\", "/")).name.lower() == target
        ]
        all_pgs = [
            info for info in rf.infolist()
            if not info.isdir()
            and PurePosixPath(info.filename.replace("\\", "/")).name.lower().endswith(".pgs")
        ]
        candidates = exact_first_layer or exact_recursive
        if not candidates and len(all_pgs) == 1:
            candidates = all_pgs
        if not candidates:
            raise ValueError(f"压缩包中未找到 {archive_base}.pgs")
        candidates.sort(key=lambda info: len(PurePosixPath(info.filename.replace("\\", "/")).parts))
        picked = candidates[0]
        return rf.read(picked), PurePosixPath(picked.filename.replace("\\", "/")).name


def _read_pgs_from_unar_archive(path: str, archive_base: str, ext: str) -> tuple[bytes, str]:
    target = f"{archive_base}.pgs".lower()
    with tempfile.TemporaryDirectory() as tmpdir:
        result = _extract_with_unar(path, tmpdir, ext)
        files = _walk_extracted_files(tmpdir)

        exact_first_layer = [
            item for item in files
            if _is_first_layer_member(item[0])
            and PurePosixPath(item[0]).name.lower() == target
        ]
        exact_recursive = [
            item for item in files
            if PurePosixPath(item[0]).name.lower() == target
        ]
        all_pgs = [
            item for item in files
            if PurePosixPath(item[0]).name.lower().endswith(".pgs")
        ]
        candidates = exact_first_layer or exact_recursive
        if not candidates and len(all_pgs) == 1:
            candidates = all_pgs
        if not candidates:
            if result.returncode != 0:
                msg = result.stderr.decode("utf-8", errors="ignore").strip()
                raise ValueError(f"Failed to extract {ext}: {msg or 'unar failed'}")
            raise ValueError(f"压缩包中未找到 {archive_base}.pgs")

        candidates.sort(key=lambda item: len(PurePosixPath(item[0]).parts))
        picked_rel, picked_path = candidates[0]
        with open(picked_path, "rb") as fp:
            return fp.read(), PurePosixPath(picked_rel).name


def _read_pgs_from_archive(path: str, original_filename: str) -> tuple[bytes, str]:
    archive_base, ext = os.path.splitext(os.path.basename(original_filename))
    ext = ext.lower()
    if ext == ".zip":
        return _read_pgs_from_zip(path, archive_base)
    if ext == ".rar":
        return _read_pgs_from_rar(path, archive_base)
    if ext == ".7z":
        return _read_pgs_from_unar_archive(path, archive_base, ext)
    raise ValueError("Only .zip/.rar/.7z archives are supported")


def _is_source_test_cpp_member(name: str) -> bool:
    normalized = name.replace("\\", "/").strip("/")
    if not normalized:
        return False
    parts = PurePosixPath(normalized).parts
    return (
        len(parts) >= 3
        and not any(part in ("", ".", "..") for part in parts)
        and parts[-2].lower() == "source"
        and parts[-1].lower() == "test.cpp"
    )


def _read_cpp_from_zip(path: str) -> tuple[bytes, str]:
    with zipfile.ZipFile(path, "r") as zf:
        candidates = [
            info for info in zf.infolist()
            if not info.is_dir() and _is_source_test_cpp_member(info.filename)
        ]
        if not candidates:
            raise ValueError("Archive does not contain source/test.cpp under a program directory")
        candidates.sort(key=lambda info: info.filename.lower())
        picked = candidates[0]
        return zf.read(picked), picked.filename.replace("\\", "/")


def _read_cpp_from_rar(path: str) -> tuple[bytes, str]:
    try:
        import rarfile
    except ImportError as exc:
        raise ValueError("Server is missing the rarfile dependency and cannot parse .rar files") from exc

    with rarfile.RarFile(path, "r") as rf:
        candidates = [
            info for info in rf.infolist()
            if not info.isdir() and _is_source_test_cpp_member(info.filename)
        ]
        if not candidates:
            raise ValueError("Archive does not contain source/test.cpp under a program directory")
        candidates.sort(key=lambda info: info.filename.lower())
        picked = candidates[0]
        picked_name = picked.filename.replace("\\", "/")
        try:
            with rf.open(picked) as fp:
                return fp.read(), picked_name
        except Exception:
            return _read_cpp_from_rar_with_unar(path, picked_name)


def _read_cpp_from_rar_with_unar(path: str, picked_name: str) -> tuple[bytes, str]:
    with tempfile.TemporaryDirectory() as tmpdir:
        result = _extract_with_unar(path, tmpdir, ".rar")
        matches = [
            full_path for rel, full_path in _walk_extracted_files(tmpdir)
            if _is_source_test_cpp_member(rel)
        ]

        if matches:
            matches.sort()
            with open(matches[0], "rb") as fp:
                return fp.read(), picked_name

        if result.returncode != 0:
            msg = result.stderr.decode("utf-8", errors="ignore").strip()
            raise ValueError(f"Failed to extract .rar: {msg or 'unar failed'}")
        else:
            raise ValueError("Archive does not contain source/test.cpp under a program directory")


def _read_cpp_from_unar_archive(path: str, ext: str) -> tuple[bytes, str]:
    with tempfile.TemporaryDirectory() as tmpdir:
        result = _extract_with_unar(path, tmpdir, ext)
        candidates = [
            (rel, full_path) for rel, full_path in _walk_extracted_files(tmpdir)
            if _is_source_test_cpp_member(rel)
        ]
        if not candidates:
            if result.returncode != 0:
                msg = result.stderr.decode("utf-8", errors="ignore").strip()
                raise ValueError(f"Failed to extract {ext}: {msg or 'unar failed'}")
            raise ValueError("Archive does not contain source/test.cpp under a program directory")

        candidates.sort(key=lambda item: item[0].lower())
        picked_rel, picked_path = candidates[0]
        with open(picked_path, "rb") as fp:
            return fp.read(), picked_rel


def _read_cpp_from_archive(path: str, original_filename: str) -> tuple[bytes, str]:
    ext = os.path.splitext(os.path.basename(original_filename))[1].lower()
    if ext == ".zip":
        return _read_cpp_from_zip(path)
    if ext == ".rar":
        return _read_cpp_from_rar(path)
    if ext == ".7z":
        return _read_cpp_from_unar_archive(path, ext)
    raise ValueError("Only .zip/.rar/.7z archives are supported")


def _archive_base_name(filename: str) -> str:
    return os.path.splitext(os.path.basename(filename))[0]


def _extract_cache_dir(filename: str) -> str:
    return os.path.join(UPLOAD_DIR, "pgs_extract", _archive_base_name(filename))


def _cached_pgs_path(filename: str) -> str:
    base = _archive_base_name(filename)
    return os.path.join(_extract_cache_dir(filename), f"{base}.pgs")


def _cached_cpp_path(filename: str) -> str:
    return os.path.join(_extract_cache_dir(filename), "source", "test.cpp")


def _write_cached_file(path: str, raw_bytes: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fp:
        fp.write(raw_bytes)


def _cache_program_files(path: str, filename: str) -> dict:
    cached: dict = {}

    ext = os.path.splitext(os.path.basename(filename))[1].lower()
    is_t2k = False

    if ext == ".zip":
        try:
            with zipfile.ZipFile(path, "r") as zf:
                names = [info.filename.lower() for info in zf.infolist() if not info.is_dir()]
                has_pgs = any(name.endswith(".pgs") for name in names)
                has_t2k = any(name.endswith(".ls") or name.endswith(".bdefs") for name in names)
                if not has_pgs and has_t2k:
                    is_t2k = True
        except Exception:
            pass
    elif ext == ".rar":
        try:
            import rarfile
            with rarfile.RarFile(path, "r") as rf:
                names = [info.filename.lower() for info in rf.infolist() if not info.isdir()]
                has_pgs = any(name.endswith(".pgs") for name in names)
                has_t2k = any(name.endswith(".ls") or name.endswith(".bdefs") for name in names)
                if not has_pgs and has_t2k:
                    is_t2k = True
        except Exception:
            try:
                with tempfile.TemporaryDirectory() as tmpdir:
                    _extract_with_unar(path, tmpdir, ext)
                    files = _walk_extracted_files(tmpdir)
                    names = [item[0].lower() for item in files]
                    has_pgs = any(name.endswith(".pgs") for name in names)
                    has_t2k = any(name.endswith(".ls") or name.endswith(".bdefs") for name in names)
                    if not has_pgs and has_t2k:
                        is_t2k = True
            except Exception:
                pass
    elif ext == ".7z":
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                _extract_with_unar(path, tmpdir, ext)
                files = _walk_extracted_files(tmpdir)
                names = [item[0].lower() for item in files]
                has_pgs = any(name.endswith(".pgs") for name in names)
                has_t2k = any(name.endswith(".ls") or name.endswith(".bdefs") for name in names)
                if not has_pgs and has_t2k:
                    is_t2k = True
        except Exception:
            pass

    if is_t2k:
        dest_dir = _extract_cache_dir(filename)
        if not os.path.exists(dest_dir):
            os.makedirs(dest_dir, exist_ok=True)
            if ext == ".zip":
                with zipfile.ZipFile(path, "r") as zf:
                    zf.extractall(dest_dir)
            elif ext == ".rar":
                try:
                    import rarfile
                    with rarfile.RarFile(path, "r") as rf:
                        rf.extractall(dest_dir)
                except Exception:
                    res = _extract_with_unar(path, dest_dir, ext)
                    if res.returncode != 0:
                        raise ValueError("Failed to extract RAR archive")
            elif ext == ".7z":
                res = _extract_with_unar(path, dest_dir, ext)
                if res.returncode != 0:
                    raise ValueError("Failed to extract 7Z archive")

        try:
            from app.services.parsers.t2k_parser import find_t2k_main_cpp, _collect_program_files
            _, _, all_cpps = _collect_program_files(dest_dir)
            picked_cpp = find_t2k_main_cpp(all_cpps)
            if picked_cpp and os.path.exists(picked_cpp):
                cpp_dest_path = _cached_cpp_path(filename)
                os.makedirs(os.path.dirname(cpp_dest_path), exist_ok=True)
                shutil.copy2(picked_cpp, cpp_dest_path)
                cached["cpp_path"] = cpp_dest_path
                cached["cpp_archive_path"] = os.path.relpath(picked_cpp, dest_dir).replace("\\", "/")
            else:
                cached["cpp_error"] = "No main cpp file found"
        except Exception as exc:
            cached["cpp_error"] = str(exc)
        return cached

    pgs_bytes, pgs_filename = _read_pgs_from_archive(path, filename)
    pgs_path = _cached_pgs_path(filename)
    _write_cached_file(pgs_path, pgs_bytes)
    cached["pgs_path"] = pgs_path
    cached["pgs_filename"] = pgs_filename

    try:
        cpp_bytes, cpp_archive_path = _read_cpp_from_archive(path, filename)
        cpp_path = _cached_cpp_path(filename)
        _write_cached_file(cpp_path, cpp_bytes)
        cached["cpp_path"] = cpp_path
        cached["cpp_archive_path"] = cpp_archive_path
    except Exception as exc:
        cached["cpp_error"] = str(exc)

    return cached


def _decode_pgs_bytes(raw_bytes: bytes) -> str:
    for enc in ("utf-8", "gbk", "latin-1"):
        try:
            return raw_bytes.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ValueError("Unable to decode file; please check the file encoding")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ExtraUpdate(BaseModel):
    engineer: Optional[str] = None
    package: Optional[str] = None
    hardware_info: Optional[str] = None
    data_type_override: Optional[str] = None   # 'CP' | 'FT' | None
    ft_touch_down_s: Optional[float] = None     # FT 手动填写的 TouchDown 时间


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/list")
def get_program_list(db: Session = Depends(get_db)):
    """一级列表：每个产品名下，按 tester 取最新程序版本"""
    # 查出所有非删除状态且不只包含 MP_Yield 的 product_name
    all_active_products = (
        db.query(Lot.product_name)
        .filter(
            Lot.product_name.isnot(None),
            Lot.status != "deleted",
            or_(Lot.data_type.is_(None), Lot.data_type != "MP_Yield")
        )
        .distinct()
        .all()
    )
    all_product_names = {r[0] for r in all_active_products}

    all_lots = (
        db.query(Lot)
        .filter(
            Lot.product_name.isnot(None),
            Lot.program.isnot(None),
            Lot.status == "processed",
            or_(Lot.data_type.is_(None), Lot.data_type != "MP_Yield"),
        )
        .order_by(Lot.product_name, Lot.test_machine, desc(Lot.test_date))
        .all()
    )

    # 按 (product_name, test_machine) 聚合最新（跳过 _QA / _RT 程序）
    seen = {}
    for lot in all_lots:
        prog = (lot.program or "").upper()
        if _is_qa_text(prog) or "_RT" in prog:
            continue
        key = (lot.product_name, lot.test_machine or "")
        if key not in seen:
            seen[key] = lot

    # 按产品名进一步聚合
    product_map: dict = {}
    for (product_name, tester), lot in seen.items():
        if product_name not in product_map:
            product_map[product_name] = []
        extra = _get_extra(db, lot.id)
        dt = extra.data_type_override if extra and extra.data_type_override else lot.data_type
        pgs_rows = _build_pgs_list(db, product_name)
        latest_pgm = pgs_rows[0] if pgs_rows else {}

        # 平均 Wafer 测试时间（秒），CP 自动计算，FT 用户填写
        if dt == "CP":
            uph_s = _calc_avg_wafer_time(db, product_name, tester)
        else:
            uph_s = extra.ft_touch_down_s if extra else None

        product_map[product_name].append({
            "lot_id": lot.id,
            "program": lot.program,
            "pgm_upload_id": latest_pgm.get("id"),
            "pgm_program": latest_pgm.get("program_version") or latest_pgm.get("filename"),
            "tester": tester,
            "test_date": _fmt_dt(lot.test_date),
            "site": lot.station_count,
            "data_type": dt or "",
            "uph_s": uph_s,
            "osat": lot.osat_name,
            "engineer": extra.engineer if extra else None,
            "package": extra.package if extra else None,
            "hardware_info": extra.hardware_info if extra else None,
            "data_source": "ftp" if lot.data_source == "ftp" else "manual",
        })

    # 补全所有在数据列表中存在但没有匹配程序的 product_name
    for prod_name in all_product_names:
        if prod_name not in product_map:
            product_map[prod_name] = []

    avg_td_cache: dict = {}
    result = []
    idx = 1
    for product_name, programs in sorted(product_map.items()):
        if product_name not in avg_td_cache:
            avg_td_cache[product_name] = _calc_avg_touch_down(db, product_name)
        result.append({
            "index": idx,
            "product_name": product_name,
            "programs": programs,
            "avg_touch_down_s": avg_td_cache[product_name],
        })
        idx += 1

    return result


@router.get("/product/{product_name}")
def get_product_programs(product_name: str, db: Session = Depends(get_db)):
    """
    二级页面：该产品所有版本的程序记录
    合并规则：
      - 同程序名下找到最大 item_count，排除 < 70% 的 lot（通常是 QA 数据）
      - 程序名 + 参数指纹（item_name/limits）完全相同 → 认为是同一版本，合并为一行
      - 同名程序但参数内容不同时，程序名加最早测试时间后缀以区分
      - earliest_lot_id：该版本最早出现的 lot，用于跳转原始数据
    """
    all_lots = (
        db.query(Lot)
        .filter(
            Lot.product_name == product_name,
            Lot.program.isnot(None),
            Lot.status == "processed",
            or_(Lot.data_type.is_(None), Lot.data_type != "MP_Yield"),
        )
        .order_by(Lot.test_machine, desc(Lot.test_date))
        .all()
    )

    # 按程序名分组，找各程序最大 item_count，用于 70% 过滤
    program_max_items: dict = {}
    for lot in all_lots:
        prog = lot.program or ""
        ic = lot.item_count or 0
        if prog not in program_max_items or ic > program_max_items[prog]:
            program_max_items[prog] = ic

    # 第一遍：过滤并获取每个 lot 的参数指纹
    # 结构: { (tester, raw_program, param_signature): [lot, ...] }
    from collections import defaultdict
    version_groups: dict = defaultdict(list)   # key -> list of lots
    lot_sigs: dict = {}   # lot.id -> param_signature
    lot_extras: dict = {}  # lot.id -> extra

    for lot in all_lots:
        prog = lot.program or ""
        # 跳过 _QA / _RT 程序
        if _is_qa_text(prog) or "_RT" in prog.upper():
            continue
        max_ic = program_max_items.get(prog, 0)
        lot_ic = lot.item_count or 0
        if max_ic > 0 and lot_ic < max_ic * 0.70:
            continue

        items = (
            db.query(TestItem.item_name, TestItem.lower_limit, TestItem.upper_limit)
            .filter(TestItem.lot_id == lot.id, TestItem.site == 0)
            .order_by(TestItem.item_number)
            .all()
        )
        sig = tuple((i.item_name, i.lower_limit, i.upper_limit) for i in items)
        lot_sigs[lot.id] = sig

        extra = _get_extra(db, lot.id)
        lot_extras[lot.id] = extra

        key = (lot.test_machine or "", prog, sig)
        version_groups[key].append(lot)

    # 对每个版本组，选代表 lot（最新 lot 用于展示信息），最早 lot 用于原始数据链接
    # 并计算与上一版的 Changes（以代表 lot 为准）
    avg_td = _calc_avg_touch_down(db, product_name)

    # 先收集所有 (tester, raw_program) 下的版本签名列表，用于加后缀区分同名不同版
    # key: (tester, raw_program) -> [sig, ...] 按代表 lot test_date 降序
    tester_prog_sigs: dict = defaultdict(list)
    for (tester, prog, sig), lots in version_groups.items():
        tester_prog_sigs[(tester, prog)].append(sig)

    rows = []
    idx = 1

    # 按代表 lot 的 test_date 降序排序后输出
    sorted_groups = sorted(
        version_groups.items(),
        key=lambda kv: max(l.test_date or "" for l in kv[1]),
        reverse=True,
    )

    for (tester, prog, sig), lots in sorted_groups:
        # 代表 lot：最新的（test_date 最大）
        rep_lot = max(lots, key=lambda l: l.test_date or "")
        # 最早 lot：test_date 最小
        earliest_lot = min(lots, key=lambda l: l.test_date or "")

        extra = lot_extras.get(rep_lot.id)
        dt = extra.data_type_override if extra and extra.data_type_override else rep_lot.data_type

        if dt == "CP":
            uph_s = _calc_wafer_test_time(rep_lot)
        else:
            uph_s = extra.ft_touch_down_s if extra else None

        # 程序名：同 tester 同名但有多个不同 sig → 加最早时间后缀
        sigs_for_name = tester_prog_sigs[(tester, prog)]
        if len(sigs_for_name) > 1:
            display_program = f"{prog}({_fmt_dt(earliest_lot.test_date)})"
        else:
            display_program = prog

        # Changes：代表 lot 与其前一版对比
        prev_lot = _find_prev_lot(db, rep_lot)
        if prev_lot:
            old_params = _get_lot_params(db, prev_lot.id)
            new_params = _get_lot_params(db, rep_lot.id)
            changes = _build_changes_summary(old_params, new_params)
        else:
            changes = "首版"

        item_count = len(sig)

        rows.append({
            "index": idx,
            "lot_id": rep_lot.id,
            "earliest_lot_id": earliest_lot.id,
            "product_name": product_name,
            "program": display_program,
            "raw_program": prog,
            "item_count": item_count,
            "test_date": _fmt_dt(rep_lot.test_date),
            "site": rep_lot.station_count,
            "avg_touch_down_s": avg_td,
            "data_type": dt or "",
            "uph_s": uph_s,
            "tester": tester,
            "engineer": extra.engineer if extra else None,
            "package": extra.package if extra else None,
            "hardware_info": extra.hardware_info if extra else None,
            "osat": rep_lot.osat_name,
            "data_source": "ftp" if rep_lot.data_source == "ftp" else "Data",
            "changes": changes,
            "prev_lot_id": prev_lot.id if prev_lot else None,
        })
        idx += 1

    return rows


@router.get("/lot/{lot_id}/compare")
def get_lot_compare(lot_id: int, db: Session = Depends(get_db)):
    """三级页面：当前 lot 与前一版的参数/Bin 对比"""
    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="LOT 不存在")

    new_params = _get_lot_params(db, lot_id)
    new_bins = _get_lot_bins(db, lot_id)
    prev_lot = _find_prev_lot(db, lot)

    old_params = _get_lot_params(db, prev_lot.id) if prev_lot else []
    old_bins = _get_lot_bins(db, prev_lot.id) if prev_lot else []
    param_diff = _compare_params(old_params, new_params)

    extra_new = _get_extra(db, lot_id)
    extra_old = _get_extra(db, prev_lot.id) if prev_lot else None

    def _lot_summary(l: Lot, extra: Optional[ProgramChangeExtra]) -> dict:
        if not l:
            return {}
        return {
            "lot_id": l.id,
            "product_name": l.product_name,
            "program": l.program,
            "test_date": _fmt_dt(l.test_date),
            "tester": l.test_machine,
            "site": l.station_count,
            "osat": l.osat_name,
            "engineer": extra.engineer if extra else None,
            "package": extra.package if extra else None,
            "hardware_info": extra.hardware_info if extra else None,
            "data_source": "ftp" if l.data_source == "ftp" else "Data",
        }

    return {
        "new": _lot_summary(lot, extra_new),
        "old": _lot_summary(prev_lot, extra_old) if prev_lot else None,
        "param_diff": param_diff,
        "bin_new": new_bins,
        "bin_old": old_bins,
    }


@router.post("/upload_pgs")
async def upload_pgs(
    file: UploadFile = File(...),
    product_name: str = Form(...),
    tester: Optional[str] = Form(None),
    datasheet_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """上传 .zip/.rar/.7z 程序压缩包，提取同名 .pgs 后解析入库"""
    original_filename = file.filename or ""
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in {".zip", ".rar", ".7z"}:
        raise HTTPException(status_code=400, detail="只支持 .zip/.rar/.7z 压缩包")

    pgs_dir = os.path.join(UPLOAD_DIR, "pgs_files")
    os.makedirs(pgs_dir, exist_ok=True)

    save_path = _next_available_path(pgs_dir, os.path.basename(original_filename))

    raw_bytes = await file.read()
    with open(save_path, "wb") as f:
        f.write(raw_bytes)

    # ── 解析 PGS ──
    parse_status = "pending"
    parse_error = None
    parsed_params_json = None
    parsed_summary_json = None
    program_version = None
    pgs_version = None

    try:
        saved_filename = os.path.basename(save_path)
        is_t2k = (tester == "T2K")
        if not is_t2k:
            if ext == ".zip":
                try:
                    with zipfile.ZipFile(save_path, "r") as zf:
                        names = [info.filename.lower() for info in zf.infolist() if not info.is_dir()]
                        has_pgs = any(name.endswith(".pgs") for name in names)
                        has_t2k = any(name.endswith(".ls") or name.endswith(".bdefs") for name in names)
                        if not has_pgs and has_t2k:
                            is_t2k = True
                except Exception:
                    pass
            elif ext == ".rar":
                try:
                    import rarfile
                    with rarfile.RarFile(save_path, "r") as rf:
                        names = [info.filename.lower() for info in rf.infolist() if not info.isdir()]
                        has_pgs = any(name.endswith(".pgs") for name in names)
                        has_t2k = any(name.endswith(".ls") or name.endswith(".bdefs") for name in names)
                        if not has_pgs and has_t2k:
                            is_t2k = True
                except Exception:
                    try:
                        with tempfile.TemporaryDirectory() as tmpdir:
                            _extract_with_unar(save_path, tmpdir, ext)
                            files = _walk_extracted_files(tmpdir)
                            names = [item[0].lower() for item in files]
                            has_pgs = any(name.endswith(".pgs") for name in names)
                            has_t2k = any(name.endswith(".ls") or name.endswith(".bdefs") for name in names)
                            if not has_pgs and has_t2k:
                                is_t2k = True
                    except Exception:
                        pass
            elif ext == ".7z":
                try:
                    with tempfile.TemporaryDirectory() as tmpdir:
                        _extract_with_unar(save_path, tmpdir, ext)
                        files = _walk_extracted_files(tmpdir)
                        names = [item[0].lower() for item in files]
                        has_pgs = any(name.endswith(".pgs") for name in names)
                        has_t2k = any(name.endswith(".ls") or name.endswith(".bdefs") for name in names)
                        if not has_pgs and has_t2k:
                            is_t2k = True
                except Exception:
                    pass

        if is_t2k:
            from app.services.parsers.t2k_parser import parse_t2k_folder
            dest_dir = _extract_cache_dir(saved_filename)
            if os.path.exists(dest_dir):
                shutil.rmtree(dest_dir)
            os.makedirs(dest_dir, exist_ok=True)
            
            if ext == ".zip":
                with zipfile.ZipFile(save_path, "r") as zf:
                    zf.extractall(dest_dir)
            elif ext == ".rar":
                try:
                    import rarfile
                    with rarfile.RarFile(save_path, "r") as rf:
                        rf.extractall(dest_dir)
                except Exception:
                    res = _extract_with_unar(save_path, dest_dir, ext)
                    if res.returncode != 0:
                        raise ValueError("Failed to extract RAR archive")
            elif ext == ".7z":
                res = _extract_with_unar(save_path, dest_dir, ext)
                if res.returncode != 0:
                    raise ValueError("Failed to extract 7Z archive")
            else:
                raise ValueError(f"Unsupported archive extension: {ext}")
            
            result = parse_t2k_folder(dest_dir)
            program_version = result.get("program_version")
            pgs_version = None
            
            from app.services.parsers.t2k_parser import find_t2k_main_cpp, _collect_program_files
            _, _, all_cpps = _collect_program_files(dest_dir)
            picked_cpp = find_t2k_main_cpp(all_cpps)
            if picked_cpp and os.path.exists(picked_cpp):
                cpp_dest_path = _cached_cpp_path(saved_filename)
                os.makedirs(os.path.dirname(cpp_dest_path), exist_ok=True)
                shutil.copy2(picked_cpp, cpp_dest_path)
        else:
            cached = _cache_program_files(save_path, saved_filename)
            with open(cached["pgs_path"], "rb") as fp:
                text = _decode_pgs_bytes(fp.read())
            result = parse_pgs(text, cached["pgs_filename"])
            pgs_version = result.get("pgs_version")
            program_version = result.get("program_version")
        
        # ── 自动继承机制：如果解析出的 summary 列表为空，尝试从同产品历史上传的正常 Summary 中继承 Bin Name ──
        summary_list = result.get("summary", [])
        if not summary_list and result.get("params"):
            # 收集当前参数中包含的所有唯一 (sw_bin, hw_bin)
            distinct_bins = {}
            for p in result["params"]:
                sb = p.get("sw_bin")
                hb = p.get("hw_bin")
                if sb is not None and hb is not None:
                    distinct_bins[sb] = hb
            
            if distinct_bins:
                prev_upload = db.query(PgsUpload).filter(
                    PgsUpload.product_name == product_name,
                    PgsUpload.parse_status == "ok",
                    PgsUpload.parsed_summary.isnot(None),
                    PgsUpload.parsed_summary != "[]"
                ).order_by(PgsUpload.upload_date.desc()).first()
                
                if prev_upload:
                    try:
                        prev_summary = json.loads(prev_upload.parsed_summary)
                        prev_map = {row["sw_bin"]: row.get("bin_name") for row in prev_summary if row.get("bin_name")}
                        
                        inherited_summary = []
                        for sb, hb in sorted(distinct_bins.items()):
                            bin_name = prev_map.get(sb, "")
                            inherited_summary.append({
                                "sw_bin": sb,
                                "hw_bin": hb,
                                "bin_name": bin_name
                            })
                        
                        if inherited_summary:
                            result["summary"] = inherited_summary
                            print(f"[upload] Inherited {len(inherited_summary)} bin names from previous upload id={prev_upload.id} for product={product_name!r}")
                    except Exception as e:
                        print(f"[upload] Failed to inherit bin names: {e}")

        parsed_params_json = json.dumps(result["params"], ensure_ascii=False)
        parsed_summary_json = json.dumps(result["summary"], ensure_ascii=False)
        parse_status = "ok"
    except Exception as exc:
        parse_status = "error"
        parse_error = str(exc)

    # ── 自动继承机制：继承上一版的 SBL/SYL 管控输入 ──
    prev_sbl_upload = db.query(PgsUpload).filter(
        PgsUpload.product_name == product_name,
        PgsUpload.parse_status == "ok",
        PgsUpload.sbl_input.isnot(None),
        PgsUpload.sbl_input != ""
    ).order_by(PgsUpload.upload_date.desc()).first()
    
    inherited_sbl_input = prev_sbl_upload.sbl_input if prev_sbl_upload else None

    record = PgsUpload(
        filename=os.path.basename(save_path),
        product_name=product_name,
        storage_path=save_path,
        upload_date=datetime.now(timezone.utc),
        uploader_id=current_user.id,
        program_version=program_version,
        pgs_version=pgs_version,
        parse_status=parse_status,
        parse_error=parse_error,
        parsed_params=parsed_params_json,
        parsed_summary=parsed_summary_json,
        sbl_input=inherited_sbl_input,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    # ── Handle optional Datasheet upload ──
    if datasheet_file and datasheet_file.filename:
        base_name = os.path.basename(datasheet_file.filename)
        if base_name.endswith((".docx", ".doc")):
            ds_dir = os.path.join(UPLOAD_DIR, "datasheets")
            os.makedirs(ds_dir, exist_ok=True)
            ds_save_path = os.path.join(ds_dir, f"ds_{record.id}_{base_name}")
            
            ds_bytes = await datasheet_file.read()
            with open(ds_save_path, "wb") as f:
                f.write(ds_bytes)
                
            record.datasheet_filename = base_name
            record.datasheet_path = ds_save_path
            db.commit()
            
            # Parse docx datasheet EC table
            if base_name.endswith(".docx"):
                try:
                    from app.services.spec_service import import_docx_datasheet
                    import_docx_datasheet(db, ds_save_path, product_name)
                except Exception:
                    pass


    return {
        "id": record.id,
        "filename": record.filename,
        "product_name": product_name,
        "program_version": program_version,
        "pgs_version": pgs_version,
        "parse_status": parse_status,
        "parse_error": parse_error,
    }


@router.get("/pgs/{upload_id}/download")
def download_pgs_archive(
    upload_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """下载已上传的程序压缩包；旧 .pgs 记录会打包为 .zip。"""
    rec = db.query(PgsUpload).filter(PgsUpload.id == upload_id).first()
    if not rec or rec.parse_status == "deleted":
        raise HTTPException(status_code=404, detail="记录不存在或已删除")
    if not rec.storage_path or not os.path.exists(rec.storage_path):
        raise HTTPException(status_code=404, detail="文件不存在")

    download_name = rec.filename or os.path.basename(rec.storage_path)
    ext = os.path.splitext(download_name)[1].lower()
    if ext in {".zip", ".rar", ".7z"}:
        return FileResponse(
            rec.storage_path,
            media_type="application/octet-stream",
            filename=download_name,
        )

    zip_name = os.path.splitext(download_name)[0] + ".zip"
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(rec.storage_path, arcname=download_name)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )


@router.delete("/pgs/{upload_id}")
def delete_pgs_upload(
    upload_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除 PGS 上传记录（将状态改为删除，同时删除本地文件）"""
    rec = db.query(PgsUpload).filter(PgsUpload.id == upload_id).first()
    if not rec or rec.parse_status == "deleted":
        raise HTTPException(status_code=404, detail="记录不存在")
    if rec.storage_path and os.path.exists(rec.storage_path):
        try:
            os.remove(rec.storage_path)
        except OSError:
            pass
    cache_dir = _extract_cache_dir(rec.filename)
    if os.path.isdir(cache_dir):
        shutil.rmtree(cache_dir, ignore_errors=True)
    CPP_RESPONSE_CACHE.pop(upload_id, None)
    rec.parse_status = "deleted"
    db.commit()
    return {"success": True}


def _pgs_param_key(param: dict) -> str:
    return f"{param.get('function') or ''}|{param.get('symbol') or param.get('param') or ''}"


def _build_pgs_changes_summary(old_params: list, new_params: list) -> str:
    """对比两版 PGS 参数，返回增删和 Limit 变化摘要。"""
    if not old_params:
        return "首版"

    old_map = {_pgs_param_key(p): p for p in old_params}
    new_map = {_pgs_param_key(p): p for p in new_params}

    added = [key for key in new_map if key not in old_map]
    removed = [key for key in old_map if key not in new_map]
    limit_changed = sum(
        1 for key in new_map
        if key in old_map and (
            old_map[key].get("min") != new_map[key].get("min") or
            old_map[key].get("max") != new_map[key].get("max")
        )
    )

    parts = []
    if added:
        parts.append(f"+{len(added)}参数")
    if removed:
        parts.append(f"-{len(removed)}参数")
    if limit_changed:
        parts.append(f"更新{limit_changed}Limit")
    return "、".join(parts) if parts else "无变化"


def _build_pgs_list(db: Session, product_name: str) -> list:
    """返回该产品所有 PGS 上传记录，按程序版本号降序排列"""
    records = (
        db.query(PgsUpload)
        .filter(
            PgsUpload.product_name == product_name,
            PgsUpload.parse_status != 'deleted'
        )
        .order_by(PgsUpload.upload_date)
        .all()
    )
    rows = []
    for r in records:
        params = []
        if r.parse_status == "ok" and r.parsed_params:
            try:
                params = json.loads(r.parsed_params)
            except (TypeError, json.JSONDecodeError):
                params = []
        rows.append({
            "id": r.id,
            "filename": r.filename,
            "product_name": r.product_name,
            "program_version": r.program_version,
            "pgs_version": r.pgs_version,
            "parse_status": r.parse_status,
            "parse_error": r.parse_error,
            "upload_date": _fmt_dt(r.upload_date),
            "data_source": "PGM",
            "ft_count": sum(1 for p in params if not p.get("is_qa")),
            "qa_count": sum(1 for p in params if p.get("is_qa")),
            "datasheet_filename": r.datasheet_filename,
            "datasheet_path": r.datasheet_path,
            "sbl_input": r.sbl_input,
            "_params": params,
        })
    # 先按版本号升序计算 changes，保证“上一版”含义正确。
    rows.sort(key=lambda x: _version_sort_key(x.get("program_version")))
    prev_params = []
    for row in rows:
        if row.get("parse_status") == "ok":
            row["changes"] = _build_pgs_changes_summary(prev_params, row.get("_params") or [])
            prev_params = row.get("_params") or []
        else:
            row["changes"] = ""
        row.pop("_params", None)

    # 页面展示按程序版本从高到低。
    rows.reverse()
    for idx, row in enumerate(rows, 1):
        row["index"] = idx
    return rows


@router.get("/pgs_list/{product_name}")
def get_pgs_list(product_name: str, db: Session = Depends(get_db)):
    """杩斿洖璇ヤ骇鍝佹墍鏈?PGS 涓婁紶璁板綍锛屾寜绋嬪簭鐗堟湰鍙烽檷搴忔帓鍒?"""
    return _build_pgs_list(db, product_name)


def _build_data_program_list(
    db: Session,
    product_name: str,
    days: int,
    months: Optional[float],
) -> list:
    """Return unique Data/OSAT program versions in the requested test-date window."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cutoff = _months_cutoff(now, months) if months is not None else now - timedelta(days=days)
    lots = (
        db.query(Lot)
        .filter(
            Lot.product_name == product_name,
            Lot.program.isnot(None),
            Lot.status == "processed",
            Lot.test_date.isnot(None),
            Lot.test_date >= cutoff,
            ~Lot.filename.ilike("%QA%"),
        )
        .order_by(Lot.test_machine, Lot.test_date, Lot.upload_date)
        .all()
    )

    unique_by_signature: dict[tuple, dict] = {}
    avg_td = _calc_avg_touch_down(db, product_name)
    stats_cache: dict[tuple, dict] = {}
    for lot in lots:
        params = _get_lot_data_params(db, lot.id)
        if not params:
            continue
        tester = lot.test_machine or ""
        program = lot.program or ""
        if _is_qa_text(lot.filename) or _is_qa_text(program):
            continue
        signature = (tester, program, _data_version_signature(params, []))
        existing = unique_by_signature.get(signature)
        lot_time = lot.test_date or lot.upload_date or datetime.max
        if existing:
            existing_lot = existing["_lot"]
            existing_time = existing_lot.test_date or existing_lot.upload_date or datetime.max
            existing_is_osat = _lot_is_osat(existing_lot)
            current_is_osat = _lot_is_osat(lot)
            if existing_is_osat and not current_is_osat:
                continue
            if existing_is_osat == current_is_osat and existing_time >= lot_time:
                continue

        extra = _get_extra(db, lot.id)
        dt = extra.data_type_override if extra and extra.data_type_override else lot.data_type
        stats_key = (program, tester)
        if stats_key not in stats_cache:
            stats_cache[stats_key] = _calc_program_wafer_stats(db, product_name, program, tester, cutoff)
        wafer_stats = stats_cache[stats_key]
        unique_by_signature[signature] = {
            "_lot": lot,
            "_params": params,
            "id": lot.id,
            "lot_id": lot.id,
            "earliest_lot_id": lot.id,
            "filename": lot.filename,
            "product_name": product_name,
            "program_version": program,
            "program": program,
            "raw_program": program,
            "pgs_version": None,
            "parse_status": "ok",
            "parse_error": None,
            "upload_date": _fmt_dt(lot.upload_date),
            "test_date": _fmt_dt(lot.test_date),
            "data_source": "Data",
            "source_type": "ftp" if _lot_is_osat(lot) else "manual",
            "item_count": len(params),
            "ft_count": len(params),
            "qa_count": 0,
            "avg_touch_down_s": avg_td,
            "uph_s": wafer_stats.get("uph_s"),
            "test_yield": wafer_stats.get("test_yield"),
            "site": lot.station_count,
            "tester": tester,
            "data_type": dt or "",
            "osat": lot.osat_name,
            "engineer": extra.engineer if extra else None,
            "package": extra.package if extra else None,
            "hardware_info": extra.hardware_info if extra else None,
        }

    rows = list(unique_by_signature.values())
    tester_count = len({row.get("tester") or "" for row in rows})
    versions_by_name: dict[tuple, list] = {}
    for row in rows:
        key = (row.get("tester") or "", row.get("raw_program") or "")
        versions_by_name.setdefault(key, []).append(row)

    for group in versions_by_name.values():
        if len(group) <= 1:
            continue
        group.sort(key=lambda row: row.get("test_date") or row.get("upload_date") or "", reverse=True)
        for row in group[1:]:
            date_text = (row.get("test_date") or row.get("upload_date") or "")[:10].replace("-", "")
            if date_text:
                row["program"] = f"{row.get('raw_program')}_{date_text}"
                row["program_version"] = row["program"]

    rows.sort(key=lambda row: (
        row.get("tester") or "" if tester_count >= 2 else "",
        row.get("test_date") or row.get("upload_date") or "",
    ))
    prev_params_by_tester: dict[str, list] = {}
    for row in rows:
        tester = row.get("tester") or ""
        prev_params = prev_params_by_tester.get(tester, [])
        row["changes"] = _build_data_param_changes_summary(prev_params, row.get("_params") or [])
        prev_params_by_tester[tester] = row.get("_params") or []
        row.pop("_params", None)
        row.pop("_lot", None)

    rows.sort(key=lambda row: row.get("test_date") or row.get("upload_date") or "", reverse=True)
    if tester_count >= 2:
        rows.sort(key=lambda row: row.get("tester") or "")
    for idx, row in enumerate(rows, 1):
        row["index"] = idx
    return rows


@router.get("/data_list/{product_name}")
def get_data_program_list(
    product_name: str,
    db: Session = Depends(get_db),
):
    """Return the last saved Data tab snapshot for a product."""
    return _load_program_data_snapshot(db, product_name)


@router.post("/data_list/{product_name}/refresh")
def refresh_data_program_list(
    product_name: str,
    days: int = Query(30, ge=1, le=3650),
    months: Optional[float] = Query(None, gt=0, le=120),
    db: Session = Depends(get_db),
):
    """Recalculate the Data tab rows and persist them as the product snapshot."""
    rows = _build_data_program_list(db, product_name, days, months)
    _save_program_data_snapshot(db, product_name, rows, days, months)
    return rows


@router.get("/data/{lot_id}/params")
def get_data_program_params(lot_id: int, db: Session = Depends(get_db)):
    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="LOT 不存在")
    return _get_lot_data_params(db, lot_id)


@router.get("/data/{lot_id}/summary")
def get_data_program_summary(lot_id: int, db: Session = Depends(get_db)):
    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="LOT 不存在")
    return _get_lot_data_summary(db, lot_id)


@router.get("/data/{lot_id}/summary_standard")
def get_data_program_summary_standard(lot_id: int, db: Session = Depends(get_db)):
    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="LOT 不存在")

    current = _get_lot_data_summary(db, lot_id)
    pgm_records = (
        db.query(PgsUpload)
        .filter(
            PgsUpload.product_name == lot.product_name,
            PgsUpload.program_version == lot.program,
            PgsUpload.parse_status == "ok",
            PgsUpload.parsed_summary.isnot(None),
        )
        .order_by(desc(PgsUpload.upload_date))
        .all()
    )
    if "QA" in (lot.program or "").upper():
        pgm_records = []

    comparisons = []
    for rec in pgm_records:
        try:
            standard = json.loads(rec.parsed_summary or "[]")
        except (TypeError, json.JSONDecodeError):
            continue
        passed, rows = _compare_summary_to_pgm_standard(current, standard)
        comparisons.append({
            "pgm_id": rec.id,
            "program_version": rec.program_version,
            "filename": rec.filename,
            "upload_date": _fmt_dt(rec.upload_date),
            "pass": passed,
            "rows": rows,
            "standard": standard,
        })

    if comparisons:
        selected = next((item for item in comparisons if item["pass"]), comparisons[0])
        return {
            "mode": "pgm",
            "pass": selected["pass"],
            "current": current,
            "reference": {
                "id": selected["pgm_id"],
                "program_version": selected["program_version"],
                "filename": selected["filename"],
                "upload_date": selected["upload_date"],
            },
            "rows": selected["rows"],
            "comparisons": [
                {k: v for k, v in item.items() if k not in ("rows", "standard")}
                for item in comparisons
            ],
        }

    return {
        "mode": "expanded",
        "pass": None,
        "current": current,
        "reference": None,
        "rows": [{"left": row, "right": None, "status": "base"} for row in _expand_summary_by_sw(current)],
        "comparisons": [],
    }


@router.get("/pgs/{upload_id}/params")
def get_pgs_params(upload_id: int, db: Session = Depends(get_db)):
    """返回解析出的 Param 表数据"""
    rec = db.query(PgsUpload).filter(PgsUpload.id == upload_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="记录不存在")
    if rec.parse_status != "ok" or not rec.parsed_params:
        raise HTTPException(
            status_code=422,
            detail=f"解析状态：{rec.parse_status}，{rec.parse_error or '数据为空'}"
        )
    return json.loads(rec.parsed_params)


@router.get("/pgs/{upload_id}/summary")
def get_pgs_summary(upload_id: int, db: Session = Depends(get_db)):
    """返回解析出的 Summary 表数据"""
    rec = db.query(PgsUpload).filter(PgsUpload.id == upload_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="记录不存在")
    if rec.parse_status != "ok" or not rec.parsed_summary:
        raise HTTPException(
            status_code=422,
            detail=f"解析状态：{rec.parse_status}，{rec.parse_error or '数据为空'}"
        )
    return json.loads(rec.parsed_summary)


class SblInputUpdate(BaseModel):
    sbl_input: str

@router.post("/pgs/{upload_id}/sbl")
def update_pgs_sbl(
    upload_id: int,
    payload: SblInputUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """保存或更新程序版本的 SBL/SYL 解析输入框内容"""
    rec = db.query(PgsUpload).filter(PgsUpload.id == upload_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="记录不存在")
    
    rec.sbl_input = payload.sbl_input.strip()
    db.commit()
    return {"status": "success", "message": "SBL input updated successfully"}


@router.get("/pgs/{upload_id}/cpp")
def get_pgs_cpp(
    upload_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return source/test.cpp from the uploaded program archive."""
    rec = db.query(PgsUpload).filter(PgsUpload.id == upload_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    cached_response = CPP_RESPONSE_CACHE.get(upload_id)
    if cached_response:
        return cached_response
    try:
        cpp_path = _cached_cpp_path(rec.filename)
        if not os.path.exists(cpp_path):
            if not rec.storage_path or not os.path.exists(rec.storage_path):
                raise ValueError("Uploaded file does not exist")
            _cache_program_files(rec.storage_path, rec.filename)
        if not os.path.exists(cpp_path):
            raise ValueError("Program cache does not contain source/test.cpp")
        with open(cpp_path, "rb") as fp:
            content = _decode_pgs_bytes(fp.read())
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    response = {
        "filename": PurePosixPath(cpp_path).name,
        "path": f"{_archive_base_name(rec.filename)}/source/test.cpp",
        "content": content,
    }
    CPP_RESPONSE_CACHE[upload_id] = response
    return response


# ── 产品占位（新增产品名）──

class PlaceholderCreate(BaseModel):
    product_name: str


@router.post("/placeholder")
def add_product_placeholder(
    data: PlaceholderCreate,
    db: Session = Depends(get_db),
):
    """新增产品名占位（若已存在则直接返回）"""
    existing = (
        db.query(PgsPlaceholder)
        .filter(PgsPlaceholder.product_name == data.product_name)
        .first()
    )
    if existing:
        return {"id": existing.id, "product_name": existing.product_name, "created": False}
    ph = PgsPlaceholder(product_name=data.product_name)
    db.add(ph)
    db.commit()
    db.refresh(ph)
    return {"id": ph.id, "product_name": ph.product_name, "created": True}


@router.get("/placeholders")
def get_product_placeholders(db: Session = Depends(get_db)):
    """返回所有用户手动新增的产品名"""
    rows = db.query(PgsPlaceholder).order_by(PgsPlaceholder.created_at).all()
    return [{"id": r.id, "product_name": r.product_name} for r in rows]


@router.put("/lot/{lot_id}/extra")
def update_lot_extra(
    lot_id: int,
    data: ExtraUpdate,
    db: Session = Depends(get_db),
):
    """更新或创建该 lot 的附加信息"""
    extra = db.query(ProgramChangeExtra).filter(ProgramChangeExtra.lot_id == lot_id).first()
    if extra:
        if data.engineer is not None:
            extra.engineer = data.engineer
        if data.package is not None:
            extra.package = data.package
        if data.hardware_info is not None:
            extra.hardware_info = data.hardware_info
        if data.data_type_override is not None:
            extra.data_type_override = data.data_type_override
        if data.ft_touch_down_s is not None:
            extra.ft_touch_down_s = data.ft_touch_down_s
    else:
        extra = ProgramChangeExtra(
            lot_id=lot_id,
            engineer=data.engineer,
            package=data.package,
            hardware_info=data.hardware_info,
            data_type_override=data.data_type_override,
            ft_touch_down_s=data.ft_touch_down_s,
        )
        db.add(extra)
    db.commit()
    return {"status": "ok"}


@router.get("/suggestions/{field}")
def get_field_suggestions(field: str, db: Session = Depends(get_db)):
    """返回历史填写值列表"""
    allowed = {"engineer", "package", "hardware_info"}
    if field not in allowed:
        raise HTTPException(status_code=400, detail=f"field 必须是 {allowed} 之一")

    col = getattr(ProgramChangeExtra, field)
    rows = (
        db.query(col)
        .filter(col.isnot(None), col != "")
        .distinct()
        .all()
    )
    return [r[0] for r in rows if r[0]]
