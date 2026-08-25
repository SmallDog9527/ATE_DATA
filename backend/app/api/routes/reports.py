from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timedelta
import re
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.report import Report
from app.models.lot import Lot, DataSource
from app.models.bin_summary import BinSummary
from app.schemas.report import ReportCreate, ReportUpdate, ReportResponse

router = APIRouter(prefix="/reports", tags=["reports"])


def _lot_time(lot: Lot) -> datetime:
    return lot.test_date or lot.beginning_time or lot.ending_time or lot.upload_date or datetime.max


def _natural_key(value: str) -> list:
    parts = re.split(r"(\d+)", (value or "").strip())
    return [int(part) if part.isdigit() else part.lower() for part in parts]


def _order_osat_lots(lots: List[Lot]) -> List[Lot]:
    earliest_time_by_lot = {}
    for lot in lots:
        lot_key = (lot.lot_id or lot.filename or str(lot.id)).strip()
        lot_time = _lot_time(lot)
        if lot_key not in earliest_time_by_lot or lot_time < earliest_time_by_lot[lot_key]:
            earliest_time_by_lot[lot_key] = lot_time

    return sorted(
        lots,
        key=lambda lot: (
            earliest_time_by_lot.get((lot.lot_id or lot.filename or str(lot.id)).strip(), datetime.max),
            _natural_key(lot.lot_id or lot.filename or str(lot.id)),
            _natural_key(lot.wafer_id or ""),
            _lot_time(lot),
            lot.id,
        ),
    )


def _serialize_report(report: Report, include_snapshot: bool = True) -> dict:
    config_data = report.config_data
    if isinstance(config_data, dict) and not include_snapshot:
        config_data = dict(config_data)
        config_data.pop("multi_bin_snapshot", None)

    return {
        "id": report.id,
        "name": report.name,
        "product_name": report.product_name,
        "url": report.url,
        "type": report.type,
        "source": report.source,
        "comment": report.comment,
        "config_data": config_data,
        "user_id": report.user_id,
        "username": report.username,
        "created_at": report.created_at,
        "updated_at": report.updated_at,
    }


def _build_multi_bin_snapshot(db: Session, ordered_lots: List[Lot], data_range: str = "final") -> dict:
    all_bin_numbers = set()
    lot_bin_data = {}

    for lot in ordered_lots:
        bins = db.query(BinSummary).filter(
            BinSummary.lot_id == lot.id,
            BinSummary.site == 0,
            BinSummary.data_range == data_range,
        ).all()
        lot_bin_data[lot.id] = {b.bin_number: b for b in bins}
        all_bin_numbers.update(b.bin_number for b in bins)

    bin_names = {}
    for lot in ordered_lots:
        for bin_number, bin_row in lot_bin_data[lot.id].items():
            if bin_number not in bin_names:
                bin_names[bin_number] = bin_row.bin_name

    rows = []
    for bin_number in sorted(all_bin_numbers):
        row = {
            "bin_number": bin_number,
            "bin_name": bin_names.get(bin_number, f"Bin{bin_number}"),
            "lots": {},
            "global_comment": "",
        }
        for lot in ordered_lots:
            bin_row = lot_bin_data[lot.id].get(bin_number)
            row["lots"][str(lot.id)] = {
                "count": bin_row.count if bin_row else 0,
                "pct": bin_row.percentage if bin_row else 0.0,
                "comment": bin_row.comment if bin_row else "",
            }
        rows.append(row)

    return {
        "data_range": data_range,
        "lots": [
            {
                "id": lot.id,
                "filename": lot.filename,
                "lot_id": lot.lot_id,
                "wafer_id": lot.wafer_id,
                "product_name": lot.product_name,
                "width": 120,
            }
            for lot in ordered_lots
        ],
        "bins": rows,
        "maps": [
            {
                "lot_id": lot.id,
                "filename": lot.filename,
                "wafer_id": lot.wafer_id,
                "lot_id_str": lot.lot_id,
                "has_map": False,
                "data": [],
            }
            for lot in ordered_lots
        ],
    }

@router.post("", response_model=ReportResponse)
def create_report(
    report_in: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    report = Report(
        name=report_in.name,
        product_name=report_in.product_name,
        url=report_in.url,
        type=report_in.type,
        source=(report_in.source or "eng").lower().strip(),
        comment=report_in.comment,
        config_data=report_in.config_data,
        user_id=current_user.id
    )
    db.add(report)
    db.commit()
    # 重新加载获取关联的 user 信息
    report = db.query(Report).options(joinedload(Report.user)).filter(Report.id == report.id).first()
    return report

@router.get("", response_model=List[ReportResponse])
def get_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Report).options(joinedload(Report.user))
    
    # 角色鉴权隔离：非 admin 且非 eng 的普通用户，只能拉取自己名下的报表
    role = (current_user.role or "").lower().strip()
    if role != "admin" and role != "eng":
        query = query.filter(Report.user_id == current_user.id)
        
    reports = query.order_by(Report.created_at.desc()).all()
    return [_serialize_report(report, include_snapshot=False) for report in reports]


@router.post("/osat/update-summary")
def update_osat_summary_reports(
    range_value: int = 2,
    range_unit: str = "weeks",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    role = (current_user.role or "").lower().strip()
    if role not in ("admin", "eng"):
        raise HTTPException(status_code=403, detail="Only admin/eng can update OSAT summaries")

    if range_value < 1 or range_value > 52:
        raise HTTPException(status_code=400, detail="range_value must be between 1 and 52")

    normalized_unit = (range_unit or "").lower().strip()
    if normalized_unit not in ("weeks", "months"):
        raise HTTPException(status_code=400, detail="range_unit must be weeks or months")

    now = datetime.utcnow()
    days = range_value * (30 if normalized_unit == "months" else 7)
    start_time = now - timedelta(days=days)
    test_time = func.coalesce(Lot.test_date, Lot.beginning_time, Lot.ending_time, Lot.upload_date)

    lots = (
        db.query(Lot)
        .filter(
            Lot.data_source == DataSource.ftp,
            Lot.product_name.isnot(None),
            test_time >= start_time,
            test_time <= now,
        )
        .order_by(Lot.product_name.asc(), test_time.desc(), Lot.id.desc())
        .all()
    )

    lots_by_product = {}
    for lot in lots:
        product_name = (lot.product_name or "").strip()
        if not product_name:
            continue
        lots_by_product.setdefault(product_name, []).append(lot)

    updated_reports = []
    period_label = f"Recent {range_value} {'Months' if normalized_unit == 'months' else 'Weeks'}"
    for product_name, product_lots in lots_by_product.items():
        product_lots = _order_osat_lots(product_lots)
        lot_ids = [str(lot.id) for lot in product_lots]
        config_data = {
            "osat_summary": True,
            "range_value": range_value,
            "range_unit": normalized_unit,
            "start_time": start_time.isoformat(),
            "end_time": now.isoformat(),
            "lot_count": len(product_lots),
            "lot_ids": [lot.id for lot in product_lots],
            "lot_order": [lot.id for lot in product_lots],
            "lot_widths": {str(lot.id): 120 for lot in product_lots},
            "global_comments": {},
            "note_text": "",
            "global_comment_width": 300,
            "all_comment_width": 500,
            "multi_bin_snapshot": _build_multi_bin_snapshot(db, product_lots, "final"),
            "updated_by": current_user.username,
            "updated_at": now.isoformat(),
        }

        existing_reports = (
            db.query(Report)
            .options(joinedload(Report.user))
            .filter(
                Report.source == "osat",
                Report.product_name == product_name,
            )
            .all()
        )
        report = None
        for existing in existing_reports:
            cfg = existing.config_data or {}
            if (
                cfg.get("osat_summary") is True
                and cfg.get("range_value") == range_value
                and cfg.get("range_unit") == normalized_unit
            ):
                report = existing
                break

        if report is None:
            report = Report(
                name=f"{product_name} OSAT Summary - {period_label}",
                product_name=product_name,
                url="",
                type="OSAT Summary",
                source="osat",
                comment="",
                config_data=config_data,
                user_id=current_user.id,
            )
            db.add(report)
        else:
            report.name = f"{product_name} OSAT Summary - {period_label}"
            report.type = "OSAT Summary"
            report.config_data = config_data
            report.user_id = current_user.id

        db.flush()
        report.url = f"/multi-bin?lot_ids={','.join(lot_ids)}&report_id={report.id}"
        updated_reports.append(report)

    db.commit()

    return {
        "message": f"Updated {len(updated_reports)} OSAT summary report(s)",
        "updated_count": len(updated_reports),
        "lot_count": len(lots),
        "start_time": start_time,
        "end_time": now,
    }

@router.get("/{report_id}", response_model=ReportResponse)
def get_report_detail(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    report = db.query(Report).options(joinedload(Report.user)).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="报表未找到")
        
    # 鉴权：非 admin 且非 eng 的普通用户，只能查看自己拥有的报表
    role = (current_user.role or "").lower().strip()
    if role != "admin" and role != "eng" and report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权查看此报表")
        
    return report

@router.put("/{report_id}", response_model=ReportResponse)
def update_report(
    report_id: int,
    report_in: ReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    report = db.query(Report).options(joinedload(Report.user)).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="报表未找到")
        
    # 鉴权：仅管理员 (admin) 或报表所有者本人可以修改报表
    role = (current_user.role or "").lower().strip()
    is_admin = role == "admin"
    is_owner = report.user_id == current_user.id
    
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="无权修改他人报表")
        
    if report_in.name is not None:
        report.name = report_in.name
    if report_in.product_name is not None:
        report.product_name = report_in.product_name
    if report_in.url is not None:
        report.url = report_in.url
    if report_in.comment is not None:
        report.comment = report_in.comment
    if report_in.config_data is not None:
        report.config_data = report_in.config_data
        
    db.commit()
    db.refresh(report)
    return report


@router.delete("/{report_id}")
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="报表未找到")
        
    # 鉴权：仅管理员 (admin) 或报表所有者本人可以删除报表（ENG 角色仅可查看他人报表，无权删除他人内容）
    role = (current_user.role or "").lower().strip()
    is_admin = role == "admin"
    is_owner = report.user_id == current_user.id
    
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="无权删除他人报表")
        
    db.delete(report)
    db.commit()
    return {"message": "报表删除成功"}
