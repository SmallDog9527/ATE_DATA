import csv
import os
import re
from datetime import datetime
from typing import Optional

import pandas as pd

from app.services.parsers.base import ParsedData
from app.services.parsers.identity import resolve_lot_wafer
from app.services.parsers.detector import detect_test_stage


def _value_after_colon(line: str) -> Optional[str]:
    if ":" not in line:
        return None
    value = line.split(":", 1)[1].strip()
    return value or None


def _parse_stop_datetime(date_value: Optional[str], time_value: Optional[str]) -> Optional[str]:
    if not date_value:
        return None
    raw = f"{date_value.strip()} {time_value.strip() if time_value else '00:00:00'}"
    for fmt in ("%Y.%m.%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
    return None


def _to_float(value: str) -> Optional[float]:
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _site_number(value: str) -> Optional[int]:
    match = re.search(r'\d+', str(value))
    return int(match.group(0)) if match else None


def _unique_names(names: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    output: list[str] = []
    for raw in names:
        name = (raw or "").strip()
        if not name:
            name = "PARAM"
        if name in seen:
            seen[name] += 1
            output.append(f"{name}.{seen[name]}")
        else:
            seen[name] = 0
            output.append(name)
    return output


def _metadata(lines: list[str]) -> dict:
    meta = {
        "program": None,
        "lot_id": None,
        "ending_time": None,
    }
    stop_date = None
    stop_time = None
    for line in lines[:20]:
        stripped = line.strip()
        if stripped.startswith("Program Name"):
            meta["program"] = _value_after_colon(stripped)
        elif stripped.startswith("Lot Number"):
            meta["lot_id"] = _value_after_colon(stripped)
        elif stripped.startswith("Stop DATE"):
            stop_date = _value_after_colon(stripped)
        elif stripped.startswith("Stop TIME"):
            stop_time = _value_after_colon(stripped)
    meta["ending_time"] = _parse_stop_datetime(stop_date, stop_time)
    return meta


def parse_t2k(filepath: str, tester: str) -> ParsedData:
    result = ParsedData(tester="T2K")

    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore", newline="") as f:
            lines = f.readlines()
    except Exception as exc:
        result.error = f"File read failed: {exc}"
        return result

    if len(lines) < 13:
        result.error = "T2K file is missing required header rows"
        return result

    meta = _metadata(lines)
    result.program = meta.get("program")
    result.ending_time = meta.get("ending_time")
    result.test_date = result.ending_time

    rows = list(csv.reader(lines))
    name_row_idx = next(
        (
            idx for idx, row in enumerate(rows[:20])
            if len(row) > 7 and row[7].strip() and row[6].strip().upper() != "TESTNUMBER"
        ),
        None,
    )
    key_row_idx = next(
        (
            idx for idx, row in enumerate(rows[:30])
            if len(row) > 6
            and row[0].strip().upper() == "NUMBER"
            and row[1].strip().upper() == "SITE"
        ),
        None,
    )
    if name_row_idx is None or key_row_idx is None:
        result.error = "T2K parameter header rows not found"
        return result

    raw_param_names = rows[name_row_idx][7:]
    param_names = _unique_names(raw_param_names)
    result.param_names = param_names

    unit_row = rows[key_row_idx]
    usl_row = rows[key_row_idx + 1] if key_row_idx + 1 < len(rows) else []
    lsl_row = rows[key_row_idx + 2] if key_row_idx + 2 < len(rows) else []

    for idx, name in enumerate(param_names, start=7):
        result.param_units[name] = unit_row[idx].strip() if idx < len(unit_row) else ""
        result.param_ul[name] = _to_float(usl_row[idx]) if idx < len(usl_row) else None
        result.param_ll[name] = _to_float(lsl_row[idx]) if idx < len(lsl_row) else None

    records = []
    for row in rows[key_row_idx + 3:]:
        if len(row) < 7:
            continue
        if not row[0].strip().isdigit():
            continue
        site = _site_number(row[1])
        if site is None:
            continue
        record = {
            "SITE_NUM": site,
            "SOFT_BIN": _to_float(row[4]),
            "X_COORD": _to_float(row[2]),
            "Y_COORD": _to_float(row[3]),
        }
        for offset, name in enumerate(param_names, start=7):
            record[name] = _to_float(row[offset]) if offset < len(row) else None
        records.append(record)

    if not records:
        result.error = "T2K data rows not found"
        return result

    result.data = pd.DataFrame(records)
    for col in ["SITE_NUM", "SOFT_BIN", "X_COORD", "Y_COORD"]:
        result.data[col] = pd.to_numeric(result.data[col], errors="coerce")
    for name in param_names:
        result.data[name] = pd.to_numeric(result.data[name], errors="coerce")

    result.data = result.data.dropna(subset=["SITE_NUM", "SOFT_BIN"]).reset_index(drop=True)
    has_coords = (
        "X_COORD" in result.data.columns
        and "Y_COORD" in result.data.columns
        and result.data[["X_COORD", "Y_COORD"]].notna().all(axis=1).any()
        and ((result.data["X_COORD"] != 0) | (result.data["Y_COORD"] != 0)).any()
    )
    result.test_stage = detect_test_stage(os.path.basename(filepath), bool(has_coords))
    identity = resolve_lot_wafer(
        os.path.basename(filepath),
        meta.get("lot_id"),
        None,
        strict_lot_id=(result.test_stage == "CP"),
    )
    result.lot_id = identity["lot_id"]
    result.wafer_id = identity["wafer_id"]
    return result
