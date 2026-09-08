from fastapi import APIRouter, Depends, Query, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, case, or_, desc, asc, not_, and_
from sqlalchemy.future import select
from app.core.database import get_db
from app.models.lot import Lot, DataSource, ProcessStatus
from app.models.bin_summary import BinSummary
from app.models.user import User
from app.api.deps import get_current_user, require_admin_or_eng
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from typing import Optional, List
from pydantic import BaseModel
import json
import os
import io
from app.services.user_log_service import record_user_log

router = APIRouter(prefix="/lots", tags=["ft_yield"])



@router.get("/ft-yield/overview")
def get_ft_yield_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    range_type: str = Query("month"),
    range_value: Optional[int] = Query(3),
    months: Optional[int] = Query(None),
    product_name: Optional[str] = None,
    bypass_cache: bool = False,
):
    """
    Get per-product overview statistics for the FT Yield overview tab.
    Only counts FTP-sourced data. Returns:
    - Per-product: wafer count, bin1_k (PASS/1000 integer), avg yield,
                   avg_wafer_time_h, top5 fail bins (pct = bin_cnt/total_die)
    - Weekly trend: output (wafers/week) and avg yield per week
    """
    try:
        from app.models.lot import DataSource
        from collections import defaultdict

        # Sanitize parameters if called directly in python outside FastAPI request context
        if type(months).__name__ == 'Query':
            months = None
        if type(range_value).__name__ == 'Query':
            range_value = None
        if type(range_type).__name__ == 'Query':
            range_type = "month"
        if type(product_name).__name__ == 'Query':
            product_name = None

        if range_type == "all":
            range_value = None

        redis_key = f"ft_yield_overview:{range_type}:{range_value}:{months}:{product_name or ''}"
        from app.core.redis_client import get_redis
        import json
        
        r_client = None
        try:
            r_client = get_redis()
        except Exception as re:
            print(f"[redis] Failed to get redis client: {re}")
            
        if r_client and not bypass_cache:
            try:
                cached_val = r_client.get(redis_key)
                if cached_val:
                    print(f"[redis] Cache hit for key: {redis_key}")
                    return json.loads(cached_val)
            except Exception as re:
                print(f"[redis] Cache read failed for key {redis_key}: {re}")

        if months is not None:
            range_type = "month"
            range_value = months

        # All users have read access to FT_Yield summary metrics
        filters = [
            Lot.data_type == "FT_Yield",
            Lot.status != "deleted",
            ~Lot.program.ilike("%_QA%"),
        ]

        if range_type == "month":
            val = range_value if range_value is not None else 3
            cutoff = datetime.now(timezone.utc) - timedelta(days=val * 30)
            filters.append(Lot.test_date >= cutoff)
        elif range_type == "year":
            val = range_value if range_value is not None else 1
            cutoff = datetime.now(timezone.utc) - timedelta(days=val * 365)
            filters.append(Lot.test_date >= cutoff)
        elif range_type == "lot":
            val = range_value if range_value is not None else 20
            # Get recent N distinct lot IDs for FT_Yield
            recent_lots_q = (
                db.query(Lot.lot_id)
                .filter(
                    Lot.data_type == "FT_Yield",
                    Lot.status != "deleted",
                    ~Lot.program.ilike("%_QA%"),
                )
            )
            # All users can query recent lot list
            if product_name:
                recent_lots_q = recent_lots_q.filter(Lot.product_name.ilike(f"%{product_name}%"))
            recent_lots_results = (
                recent_lots_q.group_by(Lot.lot_id)
                .order_by(func.max(Lot.test_date).desc())
                .limit(val)
                .all()
            )
            recent_lot_ids = [r[0] for r in recent_lots_results] if recent_lots_results else []
            if not recent_lot_ids:
                return {"products": [], "weekly_output": [], "weekly_yield": []}
            filters.append(Lot.lot_id.in_(recent_lot_ids))
        elif range_type == "all":
            # No date/lot filter
            pass

        # ── Build dedup filter subquery ──────────────────────────────────────
        def _latest_ids_filter(extra_filter=None):
            q = db.query(func.max(Lot.id)).filter(*filters)
            if extra_filter is not None:
                q = q.filter(extra_filter)
            return q.group_by(Lot.lot_id, Lot.wafer_id).subquery()

        pname_filter = Lot.product_name.ilike(f"%{product_name}%") if product_name else None

        base_q = db.query(Lot).filter(*filters)
        if pname_filter is not None:
            base_q = base_q.filter(pname_filter)

        latest_ids_sq = _latest_ids_filter(pname_filter)
        lots = base_q.filter(Lot.id.in_(latest_ids_sq)).all()

        if not lots:
            return {"products": [], "weekly_output": [], "weekly_yield": [], "osats": []}

        lot_ids = [lot.id for lot in lots]

        # Fetch bin summaries (site=0 = all-site)
        bins = (
            db.query(BinSummary)
            .filter(BinSummary.lot_id.in_(lot_ids), BinSummary.site == 0)
            .all()
        )
        bin_map: dict = {}
        for b in bins:
            bin_map.setdefault(b.lot_id, {})[b.bin_number] = b.count

        # ── Grouping by (product_name, osat_name) ─────────────────────────────
        group_lots: dict = defaultdict(list)
        for lot in lots:
            pname = lot.product_name or "(unknown)"
            osat = lot.osat_name or "chipmore"
            temp = lot.temperature or "-"
            prog = lot.program or "-"
            group_lots[(pname, osat, temp, prog)].append(lot)

        products = []
        for (pname, osat, temp, prog), plots in group_lots.items():
            wafer_count = len(plots)
            total_pass = sum((lot.pass_count or 0) for lot in plots)
            total_die  = sum((lot.die_count  or 0) for lot in plots)
            avg_yield  = (total_pass / total_die * 100.0) if total_die > 0 else 0.0

            # Fail bin aggregation
            fail_bin_totals: dict = defaultdict(int)
            for lot in plots:
                for bin_num, cnt in bin_map.get(lot.id, {}).items():
                    if bin_num != 1:   # bin1 = PASS
                        fail_bin_totals[bin_num] += cnt

            top5_bins = sorted(fail_bin_totals.items(), key=lambda x: -x[1])[:5]
            # pct = bin_count / total_die
            top5 = [
                {
                    "bin": f"Sbin{b}",
                    "count": cnt,
                    "pct": round(cnt / total_die * 100, 2) if total_die > 0 else 0.0,
                }
                for b, cnt in top5_bins
            ]

            durations_h = []
            for lot in plots:
                if lot.beginning_time and lot.ending_time:
                    diff_s = (lot.ending_time - lot.beginning_time).total_seconds()
                    if diff_s > 0:
                        durations_h.append(diff_s / 3600.0)
            
            avg_wafer_time_h = None
            if durations_h:
                durations_h.sort(reverse=True)
                n = len(durations_h)
                drop_count = int(n * 0.3)
                if drop_count > 0 and n - 2 * drop_count > 0:
                    middle = durations_h[drop_count : n - drop_count]
                else:
                    middle = durations_h
                if middle:
                    avg_wafer_time_h = round(sum(middle) / len(middle), 2)

            products.append({
                "product_name": pname,
                "osat": osat.upper() if osat.lower() in ("ksht", "htks") else osat,
                "temperature": temp,
                "program": prog,
                "lots_count": wafer_count,
                "wafers": wafer_count,
                "bin1_k": int(total_pass // 1000),       # integer K
                "avg_yield": round(avg_yield, 2),
                "avg_wafer_time_h": avg_wafer_time_h,
                "top5_fail_bins": top5,
            })

        # Sort by lot count descending
        products.sort(key=lambda x: -x["lots_count"])

        # ── Weekly trend ─────────────────────────────────────────────────────
        week_data: dict = defaultdict(lambda: {"pass": 0, "die": 0, "wafers": 0})
        for lot in lots:
            if lot.test_date:
                td = lot.test_date
                if td.tzinfo is None:
                    td = td.replace(tzinfo=timezone.utc)
                year, week, _ = td.isocalendar()
                wkey = f"{year}-W{week:02d}"
                week_data[wkey]["pass"]   += lot.pass_count or 0
                week_data[wkey]["die"]    += lot.die_count  or 0
                week_data[wkey]["wafers"] += 1

        sorted_weeks = sorted(week_data.keys())

        weekly_output = [{"week": w, "wafers": week_data[w]["wafers"]} for w in sorted_weeks]
        weekly_yield  = [
            {
                "week": w,
                "yield": round(week_data[w]["pass"] / week_data[w]["die"] * 100.0, 2)
                if week_data[w]["die"] > 0 else 0.0,
            }
            for w in sorted_weeks
        ]

        # ── OSAT aggregation ─────────────────────────────────────────────────
        osat_bin1_totals = defaultdict(int)
        for lot in lots:
            osat = lot.osat_name or "chipmore"
            osat_bin1_totals[osat] += lot.pass_count or 0

        osats = [
            {
                "osat_name": name,
                "bin1_k": int(total_pass // 1000)
            }
            for name, total_pass in osat_bin1_totals.items()
        ]

        result_data = {
            "products": products,
            "weekly_output": weekly_output,
            "weekly_yield": weekly_yield,
            "osats": osats,
        }

        if r_client:
            try:
                r_client.setex(redis_key, 691200, json.dumps(result_data))
                print(f"[redis] Cache set for key: {redis_key}")
            except Exception as re:
                print(f"[redis] Cache write failed for key {redis_key}: {re}")

        return result_data

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))





@router.get("/ft-yield/list")
def get_ft_yield_list(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    lot_id: Optional[str] = None,
    wafer_id: Optional[str] = None,
    product_name: Optional[str] = None,
    mp_tester: Optional[str] = None,
    osat_name: Optional[str] = None,
    program: Optional[str] = None,
    test_date_from: Optional[str] = None,
    test_date_to: Optional[str] = None,
    range_type: Optional[str] = None,
    range_value: Optional[int] = None,
    include_syl: bool = Query(False),
    syl_over_total: bool = Query(False),
    syl_session_id: Optional[int] = None,
):
    """
    Get a list of FT Yield records with horizontally pivoted sbin1-sbin130 values.
    """
    try:
        query = _ft_yield_scope_query(
            db,
            lot_id=lot_id, wafer_id=wafer_id, product_name=product_name,
            mp_tester=mp_tester, osat_name=osat_name, program=program,
            test_date_from=test_date_from, test_date_to=test_date_to,
            range_type=range_type, range_value=range_value,
        )
        total = query.count()
        lots = query.order_by(desc(Lot.test_date), desc(Lot.id)).offset(
            (page - 1) * page_size
        ).limit(page_size).all()
        
        lot_ids = [lot.id for lot in lots]
        bin_summaries_map = {}
        if lot_ids:
            bins = db.query(BinSummary).filter(BinSummary.lot_id.in_(lot_ids)).all()
            for b in bins:
                if b.lot_id not in bin_summaries_map:
                    bin_summaries_map[b.lot_id] = {}
                bin_summaries_map[b.lot_id][b.bin_number] = b.count
                
        # Load SYL sessions for page products (used only when include_syl=1)
        syl_sessions_map = {}
        if include_syl:
            page_products = {(lot.product_name or "").strip().lower() for lot in lots if lot.product_name}
            syl_sessions_map = _load_sessions_by_products(db, page_products)

        # 计算当前页各 Lot 在 OSAT_CP 中的已上传去重 wafer 数量
        cp_counts_map = {}
        lot_keys = list(set((lot.product_name, lot.lot_id) for lot in lots if lot.product_name and lot.lot_id))
        if lot_keys:
            lot_ids_in_page = [k[1] for k in lot_keys]
            product_names_in_page = [k[0] for k in lot_keys]
            
            from sqlalchemy import not_
            counts_q = (
                db.query(
                    Lot.product_name,
                    Lot.lot_id,
                    func.count(func.distinct(Lot.wafer_id))
                )
                .filter(
                    Lot.data_type == 'CP',
                    Lot.status != 'deleted',
                    Lot.lot_id.in_(lot_ids_in_page),
                    Lot.product_name.in_(product_names_in_page),
                    not_(Lot.filename.ilike("%qa%")),
                    not_(Lot.filename.ilike("%cp_lot%")),
                    not_(Lot.filename.ilike("%merged%")),
                    not_(Lot.filename.ilike("%合并%"))
                )
                .group_by(Lot.product_name, Lot.lot_id)
                .all()
            )
            for prod, lid, cnt in counts_q:
                if prod and lid:
                    cp_counts_map[(prod.strip().lower(), lid.strip().lower())] = cnt

        items = []
        for lot in lots:
            lot_bins = bin_summaries_map.get(lot.id, {})
            test_date_str = ""
            if lot.test_date:
                test_date_str = lot.test_date.strftime("%Y-%m-%d %H:%M:%S")
                
            test_start_str = ""
            if lot.beginning_time:
                test_start_str = lot.beginning_time.strftime("%Y-%m-%d %H:%M:%S")
                
            duration_h = None
            if lot.beginning_time and lot.ending_time:
                diff_s = (lot.ending_time - lot.beginning_time).total_seconds()
                if diff_s > 0:
                    duration_h = round(diff_s / 3600.0, 2)
                    
            prod_key = (lot.product_name.strip().lower() if lot.product_name else "",
                        lot.lot_id.strip().lower() if lot.lot_id else "")
            cp_wafer_count = cp_counts_map.get(prod_key, 0)

            item = {
                "id": lot.id,
                "osat_name": lot.osat_name or "chipmore",
                "test_start": test_start_str,
                "test_date": test_date_str,
                "duration_h": duration_h,
                "product_name": lot.product_name or "",
                "lot_id": lot.lot_id or "",
                "wafer_id": lot.wafer_id or "",
                "package": lot.package or "",
                "temperature": lot.temperature or "-",
                "total": lot.die_count or 0,
                "pass": lot.pass_count or 0,
                "yield_rate": round((lot.yield_rate or 0.0) * 100.0, 2),
                "program": lot.program or "",
                "mp_tester": lot.mp_tester or "",
                "probecard": lot.probecard or "",
                "cp_wafer_count": cp_wafer_count,
            }
            
            for sbin_idx in range(1, 131):
                item[f"sbin{sbin_idx}"] = lot_bins.get(sbin_idx, 0)
            if include_syl:
                sess_list = syl_sessions_map.get((lot.product_name or "").strip().lower())
                syl_res = _judge_lot_syl(lot, lot_bins, sess_list, fixed_session_id=syl_session_id) if sess_list else None
                item["syl"] = syl_res
                item["syl_over"] = bool(syl_res and syl_res.get("over"))
                
            items.append(item)
            
        payload = {
            "total": total,
            "items": items,
            "page": page,
            "page_size": page_size
        }
        if include_syl and syl_over_total:
            scope_q = _ft_yield_scope_query(
                db,
                lot_id=lot_id, wafer_id=wafer_id, product_name=product_name,
                mp_tester=mp_tester, osat_name=osat_name, program=program,
                test_date_from=test_date_from, test_date_to=test_date_to,
                range_type=range_type, range_value=range_value,
            )
            scope_q = scope_q.order_by(desc(Lot.test_date), desc(Lot.id))
            payload["syl_over_total"] = len(_collect_syl_over_ids(db, scope_q, fixed_session_id=syl_session_id, has_date_filter=bool(test_date_from or test_date_to or range_type)))
        return payload
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ── MP-Yield SYL/SBL setup sessions ─────────────────────────────────────────


class SylRuleItem(BaseModel):
    """One parsed SYL/SBL rule belonging to a session."""
    label: str = ""
    bins: List[int] = []
    param: str = ""
    pct: float = 0.0
    direction: str = "lte"  # "gte": yield lower bound (e.g. Bin1), "lte": fail-bin upper bound


class SylSessionCreate(BaseModel):
    product_name: str
    raw_text: str = ""
    rules: List[SylRuleItem] = []




@router.get("/ft-yield/export")
def export_ft_yield_excel(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    lot_id: Optional[str] = None,
    wafer_id: Optional[str] = None,
    product_name: Optional[str] = None,
    mp_tester: Optional[str] = None,
    osat_name: Optional[str] = None,
    program: Optional[str] = None,
    test_date_from: Optional[str] = None,
    test_date_to: Optional[str] = None,
    range_type: Optional[str] = None,
    range_value: Optional[int] = None,
    syl_over_only: bool = Query(False),
    syl_session_id: Optional[int] = None,
    sort_col: Optional[str] = None,
    sort_dir: Optional[str] = None,
    req_id: Optional[str] = Query(None, alias="t"),
):
    """Export the filtered MP-Yield rows (same filters as the detail list) to
    an Excel workbook with two sheets: raw bin counts and bin percentages.
    When sort_col/sort_dir are given the rows follow that order (matching the
    grid sort) instead of the default test-date order."""
    try:
        from functools import cmp_to_key
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment

        query = _ft_yield_scope_query(
            db,
            lot_id=lot_id, wafer_id=wafer_id, product_name=product_name,
            mp_tester=mp_tester, osat_name=osat_name, program=program,
            test_date_from=test_date_from, test_date_to=test_date_to,
            range_type=range_type, range_value=range_value,
        )
        base_q = query.order_by(desc(Lot.test_date), desc(Lot.id))

        hit_ids = None
        if syl_over_only:
            has_date_filter = bool(test_date_from or test_date_to or range_type)
            hit_ids = _collect_syl_over_ids(
                db, base_q, fixed_session_id=syl_session_id, has_date_filter=has_date_filter
            )

        item_keys = ["osat_name", "package", "product_name", "lot_id", "wafer_id", "temperature", "total", "pass",
                     "yield_rate", "program", "mp_tester", "probecard", "test_start",
                     "test_date", "duration_h"]
        numeric_keys = {"total", "pass", "yield_rate", "duration_h"}

        rows: list = []

        step = 1500
        offset = 0
        while True:
            if hit_ids is not None:
                chunk_ids = hit_ids[offset: offset + step]
                if not chunk_ids:
                    break
                lot_map = {l.id: l for l in db.query(Lot).filter(Lot.id.in_(chunk_ids)).all()}
                chunk_lots = [lot_map[i] for i in chunk_ids if i in lot_map]
                offset += step
            else:
                chunk_lots = base_q.offset(offset).limit(step).all()
                if not chunk_lots:
                    break
                offset += step
            if not chunk_lots:
                continue
            cids = [l.id for l in chunk_lots]
            bin_rows = db.query(BinSummary).filter(BinSummary.lot_id.in_(cids)).all()
            bins_map: dict = {}
            for b in bin_rows:
                bins_map.setdefault(b.lot_id, {})[b.bin_number] = b.count
            chunk_products = {(l.product_name or "").strip().lower() for l in chunk_lots if l.product_name}
            session_map = _load_sessions_by_products(db, chunk_products)
            for lot in chunk_lots:
                test_start = lot.beginning_time.strftime("%Y-%m-%d %H:%M:%S") if lot.beginning_time else ""
                test_date = lot.test_date.strftime("%Y-%m-%d %H:%M:%S") if lot.test_date else ""
                duration_h = ""
                if lot.beginning_time and lot.ending_time:
                    diff_s = (lot.ending_time - lot.beginning_time).total_seconds()
                    if diff_s > 0:
                        duration_h = round(diff_s / 3600.0, 2)
                bins = bins_map.get(lot.id, {})
                prod_key = (lot.product_name or "").strip().lower()
                sess = session_map.get(prod_key)
                syl_res = _judge_lot_syl(lot, bins, sess, fixed_session_id=syl_session_id) if sess else None
                syl_details = (syl_res.get("details") or []) if (syl_res and syl_res.get("over")) else []
                row = {
                    "osat_name": lot.osat_name or "chipmore",
                    "package": lot.package or "",
                    "temperature": lot.temperature or "",
                    "product_name": lot.product_name or "",
                    "lot_id": lot.lot_id or "",
                    "wafer_id": lot.wafer_id or "",
                    "total": lot.die_count or 0,
                    "pass": lot.pass_count or 0,
                    "yield_rate": round((lot.yield_rate or 0.0) * 100.0, 2),
                    "program": lot.program or "",
                    "mp_tester": lot.mp_tester or "",
                    "probecard": lot.probecard or "",
                    "test_start": test_start,
                    "test_date": test_date,
                    "duration_h": duration_h,
                    "syl_details": syl_details,
                }
                for bi in range(1, 131):
                    row[f"sbin{bi}"] = bins.get(bi, 0)
                rows.append(row)

        sort_field = (sort_col or "").strip()
        sort_direction = (sort_dir or "").strip().lower()
        print("ft_yield_export req", req_id, "sort_col=", sort_col, "sort_dir=", sort_dir)
        if sort_field and sort_direction in ("asc", "desc"):
            allowed = set(item_keys) | {f"sbin{i}" for i in range(1, 131)}
            if sort_field in allowed:
                desc_order = sort_direction == "desc"

                def _num_val(v):
                    try:
                        return float(v)
                    except (TypeError, ValueError):
                        return None

                def _row_key(row):

                    raw = row.get(sort_field)
                    if raw is None or raw == "":
                        return (1, None)
                    if sort_field in numeric_keys or sort_field.startswith("sbin"):
                        return (0, _num_val(raw))
                    return (0, str(raw))

                _row_vals = [_row_key(r) for r in rows]

                def _cmp_values(ka, kb, desc):
                    if ka[0] != kb[0]:
                        return -1 if ka[0] < kb[0] else 1
                    if ka[1] is None and kb[1] is None:
                        return 0
                    if ka[1] is None:
                        return 1
                    if kb[1] is None:
                        return -1
                    if desc:
                        return -1 if ka[1] > kb[1] else (1 if ka[1] < kb[1] else 0)
                    return -1 if ka[1] < kb[1] else (1 if ka[1] > kb[1] else 0)

                def _cmp(a, b):
                    return _cmp_values(_row_vals[a], _row_vals[b], desc_order)

                order = sorted(range(len(rows)), key=cmp_to_key(_cmp))
                rows = [rows[i] for i in order]

        wb = Workbook()
        ws_count = wb.active
        ws_count.title = "数量"
        ws_pct = wb.create_sheet("百分比")
        headers = ["OSAT", "Package", "Device", "LOT ID", "WAFER ID", "Stage / 温度", "TOTAL", "PASS", "YIELD",
                   "Test Program", "MP Tester", "Probe Card", "Test Start", "Test End", "Time(h)"]
        active_bins = []
        for i in range(1, 131):
            if any(r.get(f"sbin{i}", 0) > 0 for r in rows):
                active_bins.append(i)
        bin_headers = [f"Sbin{i}" for i in active_bins]
        full_headers = headers + bin_headers

        head_font = Font(bold=True, color="FFFFFF")
        head_fill = PatternFill("solid", fgColor="2563EB")
        for ws in (ws_count, ws_pct):
            ws.append(full_headers)
            for c_idx in range(1, len(full_headers) + 1):
                cell = ws.cell(row=1, column=c_idx)
                cell.font = head_font
                cell.fill = head_fill
                cell.alignment = Alignment(horizontal="center")
            ws.freeze_panes = "A2"

        red_fill = PatternFill("solid", fgColor="FEE2E2")
        red_font = Font(color="B91C1C", bold=True)

        for row in rows:
            head = [row[k] for k in item_keys]
            bin_vals = [row[f"sbin{i}"] for i in active_bins]
            ws_count.append(head + bin_vals)
            die = row["total"] or 0
            pct_vals = [round((v / die * 100.0), 2) if die > 0 and v else 0 for v in bin_vals]
            ws_pct.append(head + pct_vals)

            details = row.get("syl_details") or []
            if details:
                is_yield_over = any(
                    d.get("direction") == "gte" or (d.get("bins") and (1 in d["bins"] or 2 in d["bins"]))
                    for d in details
                )
                if is_yield_over:
                    for ws in (ws_count, ws_pct):
                        cell = ws.cell(row=ws.max_row, column=7)
                        cell.fill = red_fill
                        cell.font = red_font

                for d in details:
                    if d.get("direction") == "lte" and d.get("bins"):
                        for b in d["bins"]:
                            if b in active_bins:
                                col_idx = len(headers) + active_bins.index(b) + 1
                                for ws in (ws_count, ws_pct):
                                    cell = ws.cell(row=ws.max_row, column=col_idx)
                                    cell.fill = red_fill
                                    cell.font = red_font

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        fname = "FT_Yield_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".xlsx"
        record_user_log(
            db=db,
            action="DOWNLOAD",
            target_type="REPORT",
            target_name=fname,
            user=current_user,
            request=request,
            detail="Exported MP yield Excel report",
        )
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ── MP-Yield SYL judgement helpers ───────────────────────────────────────────




def _ft_yield_scope_query(
    db: Session,
    *,
    lot_id=None, wafer_id=None, product_name=None, mp_tester=None,
    osat_name=None, program=None, test_date_from=None, test_date_to=None,
    range_type=None, range_value=None,
):
    """Build the filtered, de-duplicated MP-Yield scope query (no ordering)."""
    from app.models.lot import DataSource
    query = db.query(Lot).filter(Lot.data_type == 'FT_Yield', Lot.status != 'deleted', ~Lot.program.ilike('%_QA%'))

    from sqlalchemy import select
    latest_wafer_run_ids = (
        db.query(func.max(Lot.id))
        .filter(Lot.data_type == 'FT_Yield', Lot.status != 'deleted', ~Lot.program.ilike("%_QA%"))
        .group_by(Lot.lot_id, Lot.wafer_id)
        .subquery()
    )
    query = query.filter(Lot.id.in_(select(latest_wafer_run_ids.c[0])))

    if lot_id:
        query = query.filter(Lot.lot_id.ilike(f"%{lot_id}%"))
    if wafer_id:
        query = query.filter(Lot.wafer_id.ilike(f"%{wafer_id}%"))
    if product_name:
        query = query.filter(Lot.product_name.ilike(f"%{product_name}%"))
    if osat_name:
        if osat_name.upper() in ("HTKS", "HTJS", "KSHT"):
            query = query.filter(or_(
                Lot.osat_name.ilike("%HTKS%"),
                Lot.osat_name.ilike("%HTJS%"),
                Lot.osat_name.ilike("%KSHT%")
            ))
        elif osat_name.lower() == "chipmore":
            query = query.filter(or_(Lot.osat_name.ilike(f"%{osat_name}%"), Lot.osat_name.is_(None)))
        else:
            query = query.filter(Lot.osat_name.ilike(f"%{osat_name}%"))
    if program:
        query = query.filter(Lot.program.ilike(f"%{program}%"))
    if mp_tester:
        if mp_tester == "(unknown)":
            query = query.filter(or_(Lot.mp_tester == "(unknown)", Lot.mp_tester.is_(None)))
        else:
            query = query.filter(Lot.mp_tester.ilike(f"%{mp_tester}%"))

    if range_type:
        if range_type == "month":
            val = range_value if range_value is not None else 3
            cutoff = datetime.now(timezone.utc) - timedelta(days=val * 30)
            query = query.filter(Lot.test_date >= cutoff)
        elif range_type == "year":
            val = range_value if range_value is not None else 1
            cutoff = datetime.now(timezone.utc) - timedelta(days=val * 365)
            query = query.filter(Lot.test_date >= cutoff)
        elif range_type == "lot":
            val = range_value if range_value is not None else 20
            recent_lots_q = (
                db.query(Lot.lot_id)
                .filter(
                    Lot.data_type == "FT_Yield",
                    Lot.status != "deleted",
                    ~Lot.program.ilike("%_QA%"),
                )
            )
            if product_name:
                recent_lots_q = recent_lots_q.filter(Lot.product_name.ilike(f"%{product_name}%"))
            recent_lots_results = (
                recent_lots_q.group_by(Lot.lot_id)
                .order_by(func.max(Lot.test_date).desc())
                .limit(val)
                .all()
            )
            recent_lot_ids = [r[0] for r in recent_lots_results] if recent_lots_results else []
            query = query.filter(Lot.lot_id.in_(recent_lot_ids))
        elif range_type == "all":
            pass
    else:
        def _parse_filter_date(val):
            if not val:
                return None
            s = str(val).strip()
            for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y%m%d"):
                try:
                    return datetime.strptime(s, fmt)
                except ValueError:
                    pass
            return None

        dt_from = _parse_filter_date(test_date_from)
        if dt_from:
            query = query.filter(func.coalesce(Lot.beginning_time, Lot.test_date) >= dt_from)
        dt_to = _parse_filter_date(test_date_to)
        if dt_to:
            query = query.filter(Lot.test_date < dt_to + timedelta(days=1))
    return query





from app.models.ft_yield_syl import FtYieldSylSession
from pydantic import BaseModel
from typing import Optional, List

class FtYieldSylRuleDict(BaseModel):
    label: Optional[str] = None
    bins: Optional[List[int]] = None
    param: Optional[str] = None
    pct: Optional[float] = 0.0
    direction: Optional[str] = "lte"

class FtYieldSylSessionCreate(BaseModel):
    product_name: str
    raw_text: Optional[str] = ""
    rules: Optional[List[FtYieldSylRuleDict]] = None

def _syl_session_to_dict(sess: FtYieldSylSession) -> dict:
    return {
        "id": sess.id,
        "product_name": sess.product_name,
        "setup_time": sess.setup_time.isoformat() if sess.setup_time else None,
        "raw_text": sess.raw_text,
        "rules": sess.rules or [],
        "created_by": sess.created_by,
        "created_at": sess.created_at.isoformat() if sess.created_at else None,
    }

def _load_sessions_by_products(db, product_names) -> dict:
    out: dict = {}
    names = {(p or "").strip().lower() for p in product_names if p and (p or "").strip()}
    if not names:
        return out
    from sqlalchemy import func
    rows = (
        db.query(FtYieldSylSession)
        .filter(func.lower(FtYieldSylSession.product_name).in_(list(names)))
        .order_by(FtYieldSylSession.setup_time.asc(), FtYieldSylSession.id.asc())
        .all()
    )
    for row in rows:
        out.setdefault((row.product_name or "").strip().lower(), []).append(row)
    return out

def _judge_lot_syl(lot, lot_bins: dict, sessions_asc, fixed_session_id: Optional[int] = None) -> Optional[dict]:
    if not sessions_asc:
        return None
    chosen = None
    if fixed_session_id is not None:
        for s in sessions_asc:
            if s.id == fixed_session_id:
                chosen = s
                break
    else:
        ref_time = lot.beginning_time or lot.test_date
        if ref_time is None:
            return None
        if getattr(ref_time, "tzinfo", None) is not None:
            ref_time = ref_time.replace(tzinfo=None)
        first_st = sessions_asc[0].setup_time
        if first_st and getattr(first_st, "tzinfo", None) is not None:
            first_st = first_st.replace(tzinfo=None)
        from datetime import timedelta
        if first_st and ref_time < first_st:
            if ref_time >= first_st - timedelta(days=183):
                chosen = sessions_asc[0]
        else:
            for s in reversed(sessions_asc):
                st = s.setup_time
                if st and getattr(st, "tzinfo", None) is not None:
                    st = st.replace(tzinfo=None)
                if st and ref_time >= st:
                    chosen = s
                    break
    if chosen is None:
        return None
    die = lot.die_count or 0
    details = []
    for r in chosen.rules or []:
        bins = r.get("bins") or []
        if not bins:
            continue
        cnt = 0
        for b in bins:
            try:
                cnt += int(lot_bins.get(int(b), 0) or 0)
            except (TypeError, ValueError):
                pass
        ratio = (cnt / die * 100.0) if die > 0 else 0.0
        pct = float(r.get("pct") or 0.0)
        direction = r.get("direction") or ("gte" if 1 in bins else "lte")
        if direction == "gte":
            over = ratio < pct
        else:
            over = ratio > pct
        if over:
            details.append({
                "label": r.get("label") or ("Bin" + "+".join(str(b) for b in bins)),
                "bins": [int(b) for b in bins],
                "param": r.get("param") or "",
                "pct": round(pct, 4),
                "actual": round(ratio, 4),
                "direction": direction,
            })
    return {
        "session_id": chosen.id,
        "setup_time": chosen.setup_time.isoformat() if chosen.setup_time else None,
        "over": len(details) > 0,
        "details": details,
    }

def _collect_syl_over_ids(db, base_q, fixed_session_id=None, has_date_filter=False) -> List[int]:
    lots = base_q.all()
    if not lots:
        return []
    page_products = {(lot.product_name or "").strip().lower() for lot in lots if lot.product_name}
    syl_sessions_map = _load_sessions_by_products(db, page_products)
    if not syl_sessions_map:
        return []
    lot_ids = [lot.id for lot in lots]
    from app.models.bin_summary import BinSummary
    bins = db.query(BinSummary).filter(BinSummary.lot_id.in_(lot_ids)).all()
    bin_summaries_map = {}
    for b in bins:
        bin_summaries_map.setdefault(b.lot_id, {})[b.bin_number] = b.count
    hit_ids = []
    for lot in lots:
        sess_list = syl_sessions_map.get((lot.product_name or "").strip().lower())
        if not sess_list:
            continue
        lot_bins = bin_summaries_map.get(lot.id, {})
        res = _judge_lot_syl(lot, lot_bins, sess_list, fixed_session_id)
        if res and res.get("over"):
            hit_ids.append(lot.id)
    return hit_ids

@router.get("/ft-yield/syl")
def get_ft_yield_syl_sessions(
    product_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = (product_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="product_name is required")
    from sqlalchemy import func
    sessions = (
        db.query(FtYieldSylSession)
        .filter(func.lower(FtYieldSylSession.product_name) == name.lower())
        .order_by(FtYieldSylSession.setup_time.asc(), FtYieldSylSession.id.asc())
        .all()
    )
    return {"sessions": [_syl_session_to_dict(s) for s in sessions]}

@router.post("/ft-yield/syl")
def create_ft_yield_syl_session(
    payload: FtYieldSylSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "eng"):
        raise HTTPException(status_code=403, detail="No permission")
    name = (payload.product_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="product_name is required")
    rules = []
    for r in payload.rules or []:
        if not r.bins or r.pct < 0:
            continue
        rules.append({
            "label": r.label or "",
            "bins": list(dict.fromkeys(int(b) for b in r.bins if b >= 1)),
            "param": r.param or "",
            "pct": float(r.pct),
            "direction": r.direction if r.direction in ("gte", "lte") else "lte",
        })
    if not rules:
        raise HTTPException(status_code=400, detail="No valid rules")
    from datetime import datetime, timezone
    sess = FtYieldSylSession(
        product_name=name,
        setup_time=datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None),
        raw_text=payload.raw_text or "",
        rules=rules,
        created_by=current_user.id,
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    return _syl_session_to_dict(sess)

@router.delete("/ft-yield/syl/{session_id}")
def delete_ft_yield_syl_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sess = db.query(FtYieldSylSession).filter(FtYieldSylSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Not found")
    if current_user.role not in ("admin", "eng") and sess.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="No permission")
    db.delete(sess)
    db.commit()
    return {"status": "success", "id": session_id}

@router.get("/ft-yield/syl-over")
def get_ft_yield_syl_over(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    lot_id: Optional[str] = None,
    wafer_id: Optional[str] = None,
    product_name: Optional[str] = None,
    mp_tester: Optional[str] = None,
    osat_name: Optional[str] = None,
    program: Optional[str] = None,
    test_date_from: Optional[str] = None,
    test_date_to: Optional[str] = None,
    range_type: Optional[str] = None,
    range_value: Optional[int] = None,
    syl_session_id: Optional[int] = None,
):
    try:
        query = _ft_yield_scope_query(
            db,
            lot_id=lot_id, wafer_id=wafer_id, product_name=product_name,
            mp_tester=mp_tester, osat_name=osat_name, program=program,
            test_date_from=test_date_from, test_date_to=test_date_to,
            range_type=range_type, range_value=range_value,
        )
        from sqlalchemy import desc
        base_q = query.order_by(desc(Lot.test_date), desc(Lot.id))
        
        has_date_filter = bool(test_date_from or test_date_to or range_type)
        hit_ids = _collect_syl_over_ids(
            db, base_q, fixed_session_id=syl_session_id, has_date_filter=has_date_filter
        )
        total = len(hit_ids)
        page_ids = hit_ids[(page - 1) * page_size: (page - 1) * page_size + page_size]
        
        lots = []
        if page_ids:
            lot_map = {l.id: l for l in db.query(Lot).filter(Lot.id.in_(page_ids)).all()}
            lots = [lot_map[i] for i in page_ids if i in lot_map]
            
        page_products = {(lot.product_name or "").strip().lower() for lot in lots if lot.product_name}
        syl_sessions_map = _load_sessions_by_products(db, page_products)
        
        lot_ids = [lot.id for lot in lots]
        bin_summaries_map = {}
        if lot_ids:
            from app.models.bin_summary import BinSummary
            bins = db.query(BinSummary).filter(BinSummary.lot_id.in_(lot_ids)).all()
            for b in bins:
                bin_summaries_map.setdefault(b.lot_id, {})[b.bin_number] = b.count
                
        items = []
        for lot in lots:
            duration_h = None
            if lot.beginning_time and lot.ending_time:
                diff = (lot.ending_time - lot.beginning_time).total_seconds()
                if diff > 0:
                    duration_h = round(diff / 3600.0, 2)
            
            lot_bins = bin_summaries_map.get(lot.id, {})
            item = {
                "id": lot.id,
                "test_date": lot.test_date.isoformat() if lot.test_date else None,
                "duration_h": duration_h,
                "product_name": lot.product_name or "",
                "lot_id": lot.lot_id or "",
                "wafer_id": lot.wafer_id or "",
                "package": lot.package or "",
                "temperature": lot.temperature or "-",
                "total": lot.die_count or 0,
                "pass": lot.pass_count or 0,
                "yield_rate": round((lot.yield_rate or 0.0) * 100.0, 2),
                "program": lot.program or "",
                "mp_tester": lot.mp_tester or "",
                "probecard": lot.probecard or "",
            }
            for sbin_idx in range(1, 131):
                item[f"sbin{sbin_idx}"] = lot_bins.get(sbin_idx, 0)
                
            sess_list = syl_sessions_map.get((lot.product_name or "").strip().lower())
            syl_res = _judge_lot_syl(lot, lot_bins, sess_list, fixed_session_id=syl_session_id) if sess_list else None
            item["syl"] = syl_res
            item["syl_over"] = bool(syl_res and syl_res.get("over"))
            
            items.append(item)
            
        return {
            "total": total,
            "items": items,
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

