"""
Trim Optimization Service Layer Module
Coordinates dataset loading from Parquet, applies filter ranges, executes optimization,
and builds die recovery wafer map data for frontend consumption.
"""

import os
from typing import Dict, Any, Optional, List
import pandas as pd
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.lot import Lot
from app.models.test_item import TestItem
from .optimizer import optimize_trim


def run_trim_optimization(
    db: Session,
    lot_ids: List[int],
    param_name: Optional[str] = None,
    pre_param: Optional[str] = None,
    post_param: Optional[str] = None,
    post_bit_param: Optional[str] = None,
    target_param: Optional[str] = None,
    target: Optional[float] = None,
    lsl: Optional[float] = None,
    usl: Optional[float] = None,
    trim_min: int = 0,
    trim_max: int = 31,
    search_range: int = 3,
    data_range: str = "final",
    filter_type: str = "all",
) -> Dict[str, Any]:
    """
    Load dataset for given lots, execute Trim Optimization, and return comprehensive analysis result.
    """
    lots = db.query(Lot).filter(Lot.id.in_(lot_ids)).all()
    if not lots:
        return {"status": "error", "errors": ["No matching lots found."]}

    lot_map = {l.id: l for l in lots}
    ordered_lots = [lot_map[i] for i in lot_ids if i in lot_map]
    primary_lot = ordered_lots[0]

    # Auto-infer trim columns if meas_col is a base parameter name or missing from direct columns
    first_parquet = next((l.parquet_path for l in ordered_lots if l.parquet_path and os.path.exists(l.parquet_path)), None)
    if first_parquet:
        try:
            avail_cols = list(pd.read_parquet(first_parquet, engine="pyarrow").columns)
            base_prefix = param_name or ""
            if "." in base_prefix:
                base_prefix = base_prefix.split(".", 1)[-1]
            if "_" in base_prefix and base_prefix.split("_", 1)[0].isdigit():
                base_prefix = base_prefix.split("_", 1)[-1]

            # Strip number prefixes from params if needed
            if pre_param and pre_param not in avail_cols and "." in pre_param:
                pre_param = pre_param.split(".", 1)[-1]
            if post_param and post_param not in avail_cols and "." in post_param:
                post_param = post_param.split(".", 1)[-1]
            if post_bit_param and post_bit_param not in avail_cols and "." in post_bit_param:
                post_bit_param = post_bit_param.split(".", 1)[-1]
            if target_param and target_param not in avail_cols and "." in target_param:
                target_param = target_param.split(".", 1)[-1]

            # If post_param or pre_param are not provided, or param_name not in columns, try prefix/suffix matching
            if (not post_param and not pre_param) or (param_name and param_name not in avail_cols):
                matching_cols = [c for c in avail_cols if base_prefix.lower() in c.lower() or (len(base_prefix) >= 3 and c.lower().startswith(base_prefix.lower()[:4]))]
                if not pre_param:
                    pre_cand = next((c for c in matching_cols if c.lower().endswith(('_pre', 'pre', '_pre1')) and 'bit' not in c.lower() and 'code' not in c.lower()), None)
                    if pre_cand:
                        pre_param = pre_cand
                if not post_param:
                    post_cand = next((c for c in matching_cols if c.lower().endswith(('_post', 'post', '_post1', '_sim', '_after')) and 'bit' not in c.lower() and 'code' not in c.lower()), None)
                    if post_cand:
                        post_param = post_cand
                if not post_bit_param:
                    bit_cand = next((c for c in matching_cols if ('post_bit' in c.lower() or 'postbit' in c.lower() or 'post_code' in c.lower() or 'trimcode' in c.lower() or ('code' in c.lower() and 'pre' not in c.lower()))), None)
                    if bit_cand:
                        post_bit_param = bit_cand
                if not target_param:
                    tgt_cand = next((c for c in matching_cols if c.lower().endswith(('_target', 'target'))), None)
                    if tgt_cand:
                        target_param = tgt_cand
        except Exception:
            pass

    # Resolve target column and primary measurement column
    meas_col = post_param or pre_param or param_name
    if meas_col and "." in meas_col and first_parquet:
        try:
            avail_cols = list(pd.read_parquet(first_parquet, engine="pyarrow").columns)
            if meas_col not in avail_cols and meas_col.split(".", 1)[-1] in avail_cols:
                meas_col = meas_col.split(".", 1)[-1]
        except Exception:
            pass

    if not meas_col:
        return {"status": "error", "errors": ["No valid measurement parameter specified."]}

    # Resolve limits and units from database TestItem if not explicitly overridden
    if lsl is None or usl is None or target is None:
        db_items = db.query(TestItem).filter(
            and_(
                TestItem.lot_id == primary_lot.id,
                TestItem.site == 0,
                TestItem.item_name.in_([c for c in [meas_col, pre_param, post_param, target_param, param_name] if c])
            )
        ).all()
        item_dict = {it.item_name: it for it in db_items}
        ref_it = item_dict.get(meas_col) or item_dict.get(post_param) or item_dict.get(pre_param) or item_dict.get(param_name)

        if ref_it:
            if lsl is None:
                lsl = ref_it.lower_limit
            if usl is None:
                usl = ref_it.upper_limit

        if target is None:
            if target_param and target_param in item_dict:
                tit = item_dict[target_param]
                target = tit.lower_limit if tit.lower_limit is not None else tit.upper_limit
            elif ref_it and lsl is not None and usl is not None:
                target = (lsl + usl) / 2.0

    # Load Parquet Data
    dfs: List[pd.DataFrame] = []
    cols_to_load = list(dict.fromkeys([c for c in [meas_col, pre_param, post_param, post_bit_param, target_param] if c]))
    extra_cols = ["SITE_NUM", "X_COORD", "Y_COORD", "SOFT_BIN", "HARD_BIN"]

    for lot in ordered_lots:
        if not lot.parquet_path or not os.path.exists(lot.parquet_path):
            continue
        try:
            available_cols = list(pd.read_parquet(lot.parquet_path, engine="pyarrow").columns)
        except Exception:
            continue

        needed = list(dict.fromkeys([c for c in cols_to_load + extra_cols if c in available_cols]))
        if meas_col not in needed:
            continue

        try:
            df_lot = pd.read_parquet(lot.parquet_path, columns=needed)
            df_lot = df_lot.loc[:, ~df_lot.columns.duplicated()].copy()
            df_lot["_lot_id"] = lot.id
            df_lot["_lot_display"] = lot.wafer_id or lot.lot_id or lot.filename

            # Auto-extract target from parquet column if not resolved yet
            if target is None and target_param and target_param in df_lot.columns:
                t_vals = pd.to_numeric(df_lot[target_param], errors="coerce").dropna()
                if len(t_vals) > 0:
                    target = float(t_vals.iloc[0])

            if lot.data_type == "CP" and "X_COORD" in df_lot.columns and "Y_COORD" in df_lot.columns:
                if data_range == "final":
                    df_lot = df_lot.drop_duplicates(subset=["X_COORD", "Y_COORD"], keep="last")
                elif data_range == "original":
                    df_lot = df_lot.drop_duplicates(subset=["X_COORD", "Y_COORD"], keep="first")

            if filter_type == "pass" and "SOFT_BIN" in df_lot.columns:
                df_lot = df_lot[pd.to_numeric(df_lot["SOFT_BIN"], errors="coerce").fillna(-1).astype(int).isin([1, 2])].copy()

            dfs.append(df_lot)
        except Exception as e:
            continue

    if not dfs:
        return {"status": "error", "errors": ["No valid parquet data found for specified lots."]}

    merged_df = pd.concat(dfs, ignore_index=True)
    merged_df = merged_df.loc[:, ~merged_df.columns.duplicated()].copy()

    # Fallback target to midpoint of limits if still None
    if target is None and lsl is not None and usl is not None:
        target = float((lsl + usl) / 2.0)

    # Run optimizer core
    result = optimize_trim(
        df=merged_df,
        measurement_col=meas_col,
        trim_code_col=post_bit_param,
        pre_col=pre_param,
        post_col=post_param,
        post_bit_col=post_bit_param,
        target=target,
        lsl=lsl,
        usl=usl,
        trim_min=trim_min,
        trim_max=trim_max,
        search_range=search_range,
    )

    if result.get("status") != "success":
        return result

    # Compute Die-Level Wafer Recovery Map (if coordinates exist)
    best_shift = result["recommended_shift"]
    step_val = result["step_analysis"]["step"]
    direction = result["step_analysis"]["direction"]

    has_coords = "X_COORD" in merged_df.columns and "Y_COORD" in merged_df.columns
    wafer_dies: List[Dict[str, Any]] = []

    if has_coords:
        valid_meas = merged_df[meas_col].notna() & np.isfinite(pd.to_numeric(merged_df[meas_col], errors="coerce"))
        coord_df = merged_df[valid_meas].copy()
        raw_vals = coord_df[meas_col].values.astype(float)
        pred_vals = raw_vals + (best_shift * step_val * direction)

        has_lsl = lsl is not None and np.isfinite(lsl)
        has_usl = usl is not None and np.isfinite(usl)

        curr_pass = np.ones(len(raw_vals), dtype=bool)
        pred_pass = np.ones(len(pred_vals), dtype=bool)

        if has_lsl:
            curr_pass &= (raw_vals >= lsl)
            pred_pass &= (pred_vals >= lsl)
        if has_usl:
            curr_pass &= (raw_vals <= usl)
            pred_pass &= (pred_vals <= usl)

        # Classify die state
        # 1: Pass -> Pass, 2: Fail -> Recovered Pass, 3: Fail -> Still Fail, 4: Pass -> Lost Fail
        recovered_count = 0
        lost_count = 0

        for i, (_, row) in enumerate(coord_df.iterrows()):
            cp = bool(curr_pass[i])
            pp = bool(pred_pass[i])
            if not cp and pp:
                die_state = "recovered"
                recovered_count += 1
            elif cp and not pp:
                die_state = "lost"
                lost_count += 1
            elif cp and pp:
                die_state = "pass"
            else:
                die_state = "fail"

            wafer_dies.append({
                "lot_id": int(row["_lot_id"]),
                "x": int(row["X_COORD"]) if pd.notna(row["X_COORD"]) else 0,
                "y": int(row["Y_COORD"]) if pd.notna(row["Y_COORD"]) else 0,
                "raw_val": float(raw_vals[i]),
                "pred_val": float(pred_vals[i]),
                "curr_pass": cp,
                "pred_pass": pp,
                "state": die_state,
            })

        result["wafer_recovery_stats"] = {
            "total_dies": len(wafer_dies),
            "recovered_dies": recovered_count,
            "lost_dies": lost_count,
            "net_gain": recovered_count - lost_count,
        }
        # Keep response compact: if too many dies, sample or aggregate
        result["wafer_map"] = wafer_dies[:5000] if len(wafer_dies) > 5000 else wafer_dies
    else:
        result["wafer_recovery_stats"] = None
        result["wafer_map"] = []

    result["meta"] = {
        "lot_ids": lot_ids,
        "param_name": meas_col,
        "pre_param": pre_param,
        "post_param": post_param,
        "post_bit_param": post_bit_param,
        "target": target,
        "lsl": lsl,
        "usl": usl,
    }

    return result
