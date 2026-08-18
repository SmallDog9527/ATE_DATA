import csv
import os
import zipfile
from typing import Optional, Set

import numpy as np
import pandas as pd
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.idle_check_config import IdleCheckConfig
from app.models.lot import Lot
from app.models.test_item import TestItem


META_COLS = {
    "SERIES",
    "SITE_NUM",
    "SOFT_BIN",
    "HARD_BIN",
    "T_TIME",
    "TEST_NUM",
    "Cor_X",
    "Cor_Y",
    "X_COORD",
    "Y_COORD",
    "Product_name",
    "Product_sub_name",
    "Version_Flag",
    "Pgs_Flag",
    "Tempera_Flag",
    "Efuse_Flag",
    "AMR_Flag",
    "Board_ID",
    "DUT",
    "BIN_NO",
    "DUT_NO",
    "DUT_ID",
    "fingerprint",
    "is_alarm",
    "chip_id",
    "CHIP_NO",
    "calc_chip_id",
}


def _round_value(value):
    try:
        num = float(value)
        if pd.isna(num):
            return None
        return round(num, 5)
    except (TypeError, ValueError):
        return None


def _parse_exclude_chips(exclude_chips: Optional[str]) -> Set[int]:
    result = set()
    if not exclude_chips:
        return result
    for part in exclude_chips.split(","):
        part = part.strip()
        if part.isdigit():
            result.add(int(part))
    return result


def _parse_float_cell(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        num = float(text)
        if pd.isna(num):
            return None
        return num
    except (TypeError, ValueError):
        return None


def _find_raw_header_rows(lines):
    for idx, line in enumerate(lines[:300]):
        try:
            cells = next(csv.reader([line]))
        except csv.Error:
            continue
        if not cells:
            continue
        first = cells[0].strip().upper()
        if first == "SITE_NUM" or "SITE_NUM" in "".join(cells[:3]).upper():
            rows = []
            for j in range(idx, min(idx + 8, len(lines))):
                try:
                    rows.append(next(csv.reader([lines[j]])))
                except csv.Error:
                    rows.append([])
            return rows
    return None


def _parse_param_meta_from_raw(path: str, test_params):
    if not path or not os.path.exists(path):
        return {}

    if path.lower().endswith(".zip"):
        try:
            with zipfile.ZipFile(path) as zf:
                csv_names = [
                    name
                    for name in zf.namelist()
                    if name.lower().endswith((".csv", ".txt"))
                ]
                csv_names.sort()
                for name in csv_names:
                    try:
                        text = zf.read(name).decode("utf-8", errors="replace")
                    except Exception:
                        continue
                    rows = _find_raw_header_rows(text.splitlines())
                    if rows:
                        return _map_raw_meta_rows(rows, test_params)
        except Exception:
            return {}
        return {}

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
    except OSError:
        return {}
    rows = _find_raw_header_rows(lines)
    if not rows:
        return {}
    return _map_raw_meta_rows(rows, test_params)


def _map_raw_meta_rows(rows, test_params):
    header = rows[0] if rows else []
    unit_row = rows[1] if len(rows) > 1 else []
    low_row = rows[2] if len(rows) > 2 else []
    high_row = rows[3] if len(rows) > 3 else []

    meta = {}
    for col_idx, raw_name in enumerate(header):
        param = raw_name.strip() if raw_name else ""
        if param not in test_params:
            continue
        unit = unit_row[col_idx].strip() if col_idx < len(unit_row) and unit_row[col_idx] else ""
        low = _parse_float_cell(low_row[col_idx]) if col_idx < len(low_row) else None
        high = _parse_float_cell(high_row[col_idx]) if col_idx < len(high_row) else None
        meta[param] = {"number": None, "unit": unit, "low": low, "high": high}
    return meta


def _load_param_meta(lot, test_params, db: Optional[Session]):
    if lot:
        candidates = []
        storage_path = getattr(lot, "storage_path", None)
        if storage_path:
            candidates.append(storage_path)

        parquet_path = getattr(lot, "parquet_path", None)
        if parquet_path and os.path.exists(parquet_path):
            parquet_dir = os.path.dirname(parquet_path)
            upload_dir = os.path.dirname(parquet_dir)
            filename = getattr(lot, "filename", "")
            candidates.append(os.path.join(upload_dir, "Data", filename))
            candidates.append(os.path.join(upload_dir, "Data", f"{filename}.zip"))
            candidates.append(os.path.join(upload_dir, filename))

        raw_meta = {}
        for candidate in candidates:
            meta = _parse_param_meta_from_raw(candidate, test_params)
            if meta:
                raw_meta = meta
                break

    db_meta = {}
    if db is not None:
        try:
            items = (
                db.query(TestItem)
                .filter(
                    TestItem.lot_id == lot.id,
                    TestItem.item_name.in_(test_params),
                )
                .all()
            )
        except Exception:
            items = []

        meta = {}
        for item in items:
            existing = meta.get(item.item_name)
            if existing is None or item.site == 0:
                meta[item.item_name] = {
                    "number": item.item_number,
                    "unit": item.unit or "",
                    "low": item.lower_limit,
                    "high": item.upper_limit,
                }
        db_meta = meta

    if raw_meta:
        for param, meta in raw_meta.items():
            db_entry = db_meta.get(param) or {}
            meta["number"] = meta.get("number") or db_entry.get("number")
            meta["unit"] = meta.get("unit") or db_entry.get("unit") or ""
            meta["low"] = meta.get("low") if meta.get("low") is not None else db_entry.get("low")
            meta["high"] = meta.get("high") if meta.get("high") is not None else db_entry.get("high")
        return raw_meta

    if db_meta:
        return db_meta
    return {}


def _compute_fingerprint(
    df: pd.DataFrame,
    test_params,
    params: Optional[str],
    weights: Optional[str],
    lot,
    db: Optional[Session],
):
    fp_param_list = []
    fp_weights_list = []

    if params:
        fp_param_list = [p.strip() for p in params.split(",") if p.strip() in df.columns]
    elif "fingerprint" not in df.columns and db is not None:
        config = db.query(IdleCheckConfig).filter(IdleCheckConfig.program_name == lot.program).first()
        if config and config.params:
            fp_param_list = [p for p in config.params if p in df.columns]

    if not fp_param_list and "fingerprint" not in df.columns:
        fp_param_list = list(test_params)

    if fp_param_list:
        if weights:
            try:
                parsed_weights = [int(w.strip()) for w in weights.split(",") if w.strip().lstrip("-").isdigit()]
                fp_weights_list = parsed_weights
            except ValueError:
                fp_weights_list = []
        if len(fp_weights_list) < len(fp_param_list):
            fp_weights_list = [i + 1 for i in range(len(fp_param_list))]

        fp_weights_list = fp_weights_list[: len(fp_param_list)]
        param_values = df[fp_param_list].astype(float).fillna(0.0).values
        df["fingerprint"] = param_values @ np.array(fp_weights_list, dtype=float)

    return fp_param_list, fp_weights_list, df


def _align_group(
    df_group: pd.DataFrame,
    site_start: int,
    site_end: int,
    test_params,
    exclude_set: Set[int],
):
    expected_site_count = site_end - site_start + 1
    sites = list(range(site_start, site_end + 1))

    if df_group is None or len(df_group) == 0:
        return {
            "sites": sites,
            "chips": [],
            "site_series": {},
            "matched_count": 0,
            "required_site_count": expected_site_count,
        }

    df_group = df_group.copy()
    df_group["SITE_NUM"] = df_group["SITE_NUM"].astype(int)

    matched_keys = []
    fallback_fingerprint = False

    if "SERIES" in df_group.columns:
        df_group["SERIES"] = df_group["SERIES"].astype(int)
        df_group["calc_chip_id"] = df_group["SERIES"] + (site_end - df_group["SITE_NUM"])
        agg = (
            df_group.groupby("calc_chip_id")["SITE_NUM"]
            .agg(["nunique", "size"])
            .reset_index()
        )
        matched = agg[
            (agg["nunique"] == expected_site_count) & (agg["size"] == expected_site_count)
        ]
        matched_keys = sorted(matched["calc_chip_id"].tolist())

    if not matched_keys and "fingerprint" in df_group.columns:
        fallback_fingerprint = True
        site_dfs = {
            s: df_group[df_group["SITE_NUM"] == s]
            for s in sites
        }
        common_fps = None
        for s in sites:
            vals = set(
                pd.to_numeric(site_dfs[s]["fingerprint"], errors="coerce")
                .dropna()
                .round(4)
                .tolist()
            )
            common_fps = vals if common_fps is None else common_fps & vals

        if common_fps:
            ref_site = sites[0]
            seen = set()
            for fp in site_dfs[ref_site]["fingerprint"]:
                try:
                    fp_num = round(float(fp), 4)
                except (TypeError, ValueError):
                    continue
                if pd.isna(fp_num):
                    continue
                if fp_num in common_fps and fp_num not in seen:
                    seen.add(fp_num)
                    matched_keys.append(fp_num)

    chips = []
    chip_no = 0
    for key in matched_keys:
        chip_no += 1
        if chip_no in exclude_set:
            continue

        if fallback_fingerprint:
            rows = pd.concat(
                [
                    site_dfs[s][site_dfs[s]["fingerprint"].round(4) == key].head(1)
                    for s in sites
                ]
            )
        else:
            rows = df_group[df_group["calc_chip_id"] == key].copy()

        row_map = {int(row["SITE_NUM"]): row for row in rows.to_dict("records")}
        params_by_site = {}
        for p in test_params:
            params_by_site[p] = [
                _round_value(row_map.get(s, {}).get(p)) if s in row_map else None
                for s in sites
            ]

        fp_value = None
        if "fingerprint" in rows.columns:
            for _, row in rows.iterrows():
                fp_value = _round_value(row.get("fingerprint"))
                if fp_value is not None:
                    break

        chips.append(
            {
                "chip_no": chip_no,
                "orig_chip_id": None if fallback_fingerprint else int(key),
                "fingerprint": fp_value,
                "params": params_by_site,
            }
        )

    site_series = {}
    for p in test_params:
        site_series[p] = [
            [chip["params"][p][site_idx] for chip in chips]
            for site_idx in range(expected_site_count)
        ]

    return {
        "sites": sites,
        "chips": chips,
        "site_series": site_series,
        "matched_count": len(chips),
        "required_site_count": expected_site_count,
    }


def build_site_corr_payload(
    df: pd.DataFrame,
    filename: str,
    program_name: str,
    params: Optional[str],
    weights: Optional[str],
    exclude_chips: Optional[str],
    db: Optional[Session] = None,
    lot=None,
):
    if "SITE_NUM" not in df.columns:
        raise HTTPException(status_code=400, detail="Missing SITE_NUM column in lot data")

    df = df.copy()
    df["SITE_NUM"] = df["SITE_NUM"].astype(int)
    if "SERIES" in df.columns:
        df["SERIES"] = df["SERIES"].astype(int)

    test_params = [
        c
        for c in df.columns
        if c not in META_COLS and pd.api.types.is_numeric_dtype(df[c])
    ]

    lot_stub = type("LotStub", (), {"program": program_name})()
    fp_params, fp_weights, df = _compute_fingerprint(
        df, test_params, params, weights, lot_stub, db
    )
    param_meta = _load_param_meta(lot, test_params, db) if lot is not None else {}

    exclude_set = _parse_exclude_chips(exclude_chips)
    sites = sorted(df["SITE_NUM"].unique().tolist())
    max_site = max(sites) if sites else 0

    group1 = _align_group(
        df[(df["SITE_NUM"] >= 1) & (df["SITE_NUM"] <= 16)],
        1,
        16,
        test_params,
        exclude_set,
    )

    if max_site > 16:
        group2 = _align_group(
            df[(df["SITE_NUM"] >= 17) & (df["SITE_NUM"] <= 32)],
            17,
            32,
            test_params,
            exclude_set,
        )
    else:
        group2 = {
            "sites": [],
            "chips": [],
            "site_series": {},
            "matched_count": 0,
            "required_site_count": 16,
        }

    all_sites_summary = {"sites": sites, "params": {}}
    for p in test_params:
        site_means = []
        site_mins = []
        site_maxs = []
        for s in sites:
            s_vals = df[df["SITE_NUM"] == s][p].dropna().tolist()
            if s_vals:
                site_means.append(round(float(np.mean(s_vals)), 5))
                site_mins.append(round(float(np.min(s_vals)), 5))
                site_maxs.append(round(float(np.max(s_vals)), 5))
            else:
                site_means.append(None)
                site_mins.append(None)
                site_maxs.append(None)
        all_sites_summary["params"][p] = {
            "means": site_means,
            "mins": site_mins,
            "maxs": site_maxs,
        }

    return {
        "filename": filename,
        "program": program_name,
        "test_params": test_params,
        "fp_params": fp_params,
        "fp_weights": fp_weights,
        "group1": group1,
        "group2": group2,
        "all_sites_summary": all_sites_summary,
        "param_meta": param_meta,
        "excluded_chips": sorted(exclude_set),
    }


def build_site_corr_response(
    lot_id: int,
    params: Optional[str],
    weights: Optional[str],
    exclude_chips: Optional[str],
    db: Session,
):
    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if not lot or not lot.parquet_path:
        raise HTTPException(status_code=404, detail="Lot data not found")

    df = pd.read_parquet(lot.parquet_path)
    payload = build_site_corr_payload(
        df,
        lot.filename,
        lot.program,
        params,
        weights,
        exclude_chips,
        db,
        lot,
    )
    return {"lot_id": lot_id, **payload}
