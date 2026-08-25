"""
density_fallback_parser.py  —  Universal Density Fallback Parser for ENG and non-standard ATE data.

Design:
1. Column density analysis across the entire file to locate the rectangular data matrix.
2. Locates data start row where density is high and multiple columns are numeric.
3. Locates or constructs parameter column headers.
4. Auto-fills missing critical columns (defaults SITE_NUM=1, SOFT_BIN=1 if not found).
5. Extracts metadata (lot_id, wafer_id, program, test_date) from header lines or filename tokens.
"""

import io
import os
import re
import pandas as pd
from typing import Optional
from app.services.parsers.base import ParsedData
from app.services.parsers.acco_parser import parse_datetime_str, _extract_date_from_filename


def parse_density_fallback(filepath: str, tester: str = 'ENG') -> ParsedData:
    """
    Universal density fallback parser.
    Ensures that any tabular ENG data file can be parsed into valid parameter and data rows.
    """
    result = ParsedData(tester=tester)

    # 1. Read all non-empty lines
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            raw_lines = [line.rstrip('\r\n') for line in f if line.strip()]
    except Exception as e:
        result.error = f"Failed to read file: {e}"
        return result

    if not raw_lines:
        result.error = "File is empty"
        return result

    # 2. Compute column density across lines
    col_counts = [len(ln.split(',')) for ln in raw_lines]
    max_cols = max(col_counts) if col_counts else 0
    if max_cols < 2:
        result.error = "Insufficient columns found in file"
        return result

    # 3. Locate data start row using column density and numeric validation
    data_start_row = -1
    threshold_col = max(max_cols // 4, 1)

    for i, line in enumerate(raw_lines):
        cols = [c.strip() for c in line.split(',')]
        if len(cols) < threshold_col:
            continue
        c0 = cols[0]
        # Check if first column or second column is numeric
        if c0.lstrip('-').isdigit() or (len(cols) > 1 and cols[1].lstrip('-').isdigit()):
            num_numeric = 0
            for val in cols[:min(len(cols), 25)]:
                try:
                    float(val)
                    num_numeric += 1
                except ValueError:
                    pass
            if num_numeric >= min(len(cols), 3):
                data_start_row = i
                break

    # Secondary heuristic if first check didn't locate
    if data_start_row == -1:
        for i, line in enumerate(raw_lines):
            cols = [c.strip() for c in line.split(',')]
            num_numeric = sum(1 for c in cols if c.replace('.', '', 1).lstrip('-').isdigit())
            if num_numeric >= max_cols * 0.3 and num_numeric >= 2:
                data_start_row = i
                break

    if data_start_row == -1 or data_start_row >= len(raw_lines):
        result.error = "Could not locate data start row using density analysis"
        return result

    header_lines = raw_lines[:data_start_row]
    data_lines = raw_lines[data_start_row:]

    # 4. Extract metadata from header lines (Program, Lot, Wafer, Date, Tester)
    meta_keys = {
        'program': ['[TestProgram]', 'Program:', 'Test program,', 'Test Name,', 'Program Name :', 'Program Name:', 'Program Name'],
        'lot_id': ['[LotID]', 'LOT_ID:', 'Lot Id:', 'LotID:', 'Lot Number :', 'Lot Number:', 'Lot Number', 'Datalog for Lot Number,'],
        'wafer_id': ['[WaferNo]', 'WAFER_ID:', 'Wafer No:', 'WaferNo:', 'Wafer Number :', 'Wafer Number:', 'Datalog for SubLot Number,'],
        'handler': ['[HandlerID]', 'Handler:', 'Handler/Prober ID,'],
        'test_date_raw': ['[TestDate]', 'Date:', 'TestDate:', '测试日期:', '测试日期', 'Start DATE :', 'Start DATE:', 'Start Date:'],
        'beginning_time': ['[Beginning Time]', 'Beginning Time:', 'BeginningTime:', 'Beginning:', 'Beginning', 'Start TIME :', 'Start TIME:', 'Start Time:'],
        'ending_time': ['[Ending Time]', 'Ending Time:', 'EndingTime:'],
        'tester_id': ['[TesterID]', 'Tester ID:', 'Tester Name :', 'Tester Name:', 'Data collected on station,'],
    }

    meta: dict[str, Optional[str]] = {k: None for k in meta_keys}
    for line in header_lines:
        parts = [p.strip() for p in line.split(',')]
        c0 = parts[0] if parts else ''
        c0_norm = re.sub(r'\s+', ' ', c0)
        c1 = parts[1] if len(parts) > 1 else ''

        for field, key_variants in meta_keys.items():
            if meta[field] is not None:
                continue
            for kv in key_variants:
                kv_clean = re.sub(r'\s+', ' ', kv.rstrip(','))
                if kv_clean.upper() in c0_norm.upper():
                    val = c1
                    if not val:
                        idx = c0_norm.upper().find(kv_clean.upper())
                        rem = c0_norm[idx + len(kv_clean):].strip()
                        if rem.startswith(':'):
                            rem = rem[1:].strip()
                        if rem:
                            val = rem
                        else:
                            pos = line.find(':')
                            if pos > 0:
                                val = line[pos + 1:].split(',')[0].strip()
                    if val:
                        if field == 'program':
                            val = re.split(r'[/\\]', val)[-1].strip()
                        elif field == 'handler':
                            val = re.sub(r'\.(dll|cfg)$', '', val, flags=re.IGNORECASE).strip()
                        meta[field] = val
                        break

    # 5. Extract test_date
    _test_date_str = None
    if meta.get('beginning_time'):
        _test_date_str = parse_datetime_str(meta['beginning_time'])
    if not _test_date_str and meta.get('test_date_raw'):
        _test_date_str = parse_datetime_str(meta['test_date_raw'])
    if not _test_date_str:
        _test_date_str = _extract_date_from_filename(filepath)

    result.program = meta.get('program')
    result.lot_id = meta.get('lot_id')
    result.wafer_id = meta.get('wafer_id')
    result.handler = meta.get('handler')
    result.beginning_time = meta.get('beginning_time')
    result.ending_time = meta.get('ending_time')
    result.test_date = _test_date_str

    # Filename fallback for program/lot
    filename_base = os.path.splitext(os.path.basename(filepath))[0]
    if not result.lot_id:
        tokens = re.split(r'[_\-\s]+', filename_base)
        for tok in tokens:
            if len(tok) >= 4 and not tok.isdigit() and tok.upper() not in ('ENG', 'DATA', 'LOG', 'CSV', 'TEST', 'AFTER', 'LOOP', 'TIMES'):
                result.lot_id = tok
                break
        if not result.lot_id:
            result.lot_id = filename_base

    if not result.program:
        if '_' in filename_base:
            result.program = filename_base.split('_')[0]
        else:
            result.program = result.lot_id or 'ENG_PROGRAM'

    # 6. Locate best parameter column header line
    best_header_idx = -1
    best_header_cols = []
    
    # Check backwards from data_start_row
    for i in range(len(header_lines) - 1, -1, -1):
        cols = [c.strip() for c in header_lines[i].split(',')]
        non_empty = sum(1 for c in cols if c)
        if non_empty >= max_cols * 0.25:
            best_header_idx = i
            best_header_cols = cols
            break

    unit_row_extracted = None
    # Merge split parameter name & unit row if applicable
    if best_header_idx > 0:
        prev_cols = [c.strip() for c in header_lines[best_header_idx - 1].split(',')]
        units = {'MV', 'V', 'UA', 'MA', 'A', 'MS', 'US', 'NS', 'S', 'HZ', 'KHZ', 'MHZ', 'OHM', 'KOHM', 'MOHM', 'P/F', 'CODE', 'INT', 'COORD'}
        is_unit_row = sum(1 for c in best_header_cols[4:20] if c.upper() in units) >= 3
        if is_unit_row and sum(1 for c in prev_cols[4:20] if c) >= 3:
            unit_row_extracted = list(best_header_cols)
            merged = list(best_header_cols)
            for j in range(len(prev_cols)):
                if prev_cols[j]:
                    merged[j] = prev_cols[j]
            best_header_cols = merged
            if not best_header_cols[0] and len(best_header_cols) > 1 and best_header_cols[1].upper() in ('X_AXIS', 'X_COORD', 'X'):
                best_header_cols[0] = 'SITE_NUM'

    # If no header line found, generate Col_1, Col_2...
    if not best_header_cols:
        best_header_cols = [f"Param_{j+1}" for j in range(max_cols)]

    # Clean and deduplicate column names
    clean_cols = []
    seen = {}
    for j, c in enumerate(best_header_cols):
        name = c.strip() if c and c.strip() else f"Col_{j+1}"
        if name in seen:
            seen[name] += 1
            name = f"{name}_{seen[name]}"
        else:
            seen[name] = 0
        clean_cols.append(name)

    while len(clean_cols) < max_cols:
        clean_cols.append(f"Col_{len(clean_cols)+1}")

    # 7. Extract limit rows if available between header and data rows
    limit_row_keys = {
        'upper': ['HLIMIT', 'LimitU', 'Upper Limit', 'USL', 'High Limit', 'Hi Limit', 'UpperLimit'],
        'lower': ['LLIMIT', 'LimitL', 'Lower Limit', 'LSL', 'Low Limit', 'Lo Limit', 'LowerLimit'],
        'unit':  ['UNITS',  'Unit',   'Units', 'UNIT'],
    }
    found_limits = {'upper': None, 'lower': None, 'unit': None}
    if best_header_idx >= 0:
        between_lines = [ln for ln in raw_lines[best_header_idx + 1: data_start_row] if any(c.strip() for c in ln.split(','))]
        for line in between_lines:
            parts = [p.strip() for p in line.split(',')]
            kw_candidate = parts[0].upper().strip('"')
            if not kw_candidate:
                for p in parts[1:6]:
                    if p.upper().strip('"') in ('USL', 'LSL', 'HLIMIT', 'LLIMIT', 'UNIT', 'UNITS', 'LIMITU', 'LIMITL'):
                        kw_candidate = p.upper().strip('"')
                        break
            for limit_type, keywords in limit_row_keys.items():
                if found_limits[limit_type] is not None:
                    continue
                for kw in keywords:
                    if kw_candidate == kw.upper():
                        found_limits[limit_type] = parts
                        break

    if unit_row_extracted and not found_limits['unit']:
        found_limits['unit'] = unit_row_extracted

    # 8. Load Data into DataFrame
    valid_data_lines = [ln for ln in data_lines if any(c.strip() for c in ln.split(','))]
    df = pd.read_csv(io.StringIO('\n'.join(valid_data_lines)), header=None, dtype=str)
    
    # Align columns
    col_count = df.shape[1]
    df.columns = clean_cols[:col_count]

    # 9. Ensure standard columns (SITE_NUM, SOFT_BIN, X_COORD, Y_COORD)
    col_upper_map = {c.upper(): c for c in df.columns}

    # SITE_NUM
    site_col = None
    for alias in ['SITE_NUM', 'SITE', 'SITE #', 'SITENUM', 'SITE_NO', 'SITENO', 'SITEN']:
        if alias in col_upper_map:
            site_col = col_upper_map[alias]
            break
    if site_col and site_col != 'SITE_NUM':
        df.rename(columns={site_col: 'SITE_NUM'}, inplace=True)
    elif not site_col:
        # Check if first col is integer site numbers
        try:
            col0_vals = pd.to_numeric(df.iloc[:, 0], errors='coerce')
            if col0_vals.notna().all() and col0_vals.min() >= 1 and col0_vals.max() <= 128:
                df.rename(columns={df.columns[0]: 'SITE_NUM'}, inplace=True)
            else:
                df.insert(0, 'SITE_NUM', 1)
        except Exception:
            df.insert(0, 'SITE_NUM', 1)

    # SOFT_BIN
    bin_col = None
    for alias in ['SOFT_BIN', 'SOFTBIN', 'SOFT_BIN_NUM', 'BIN', 'SBIN', 'S-BIN', 'SOFT BIN', 'HBIN', 'HARD_BIN']:
        if alias in col_upper_map:
            bin_col = col_upper_map[alias]
            break
    if bin_col and bin_col != 'SOFT_BIN':
        df.rename(columns={bin_col: 'SOFT_BIN'}, inplace=True)
    elif not bin_col:
        df.insert(1, 'SOFT_BIN', 1)

    # X_COORD, Y_COORD
    for alias in ['X_COORD', 'X_AXIS', 'X_COORDINATE', 'X_POS', 'X', 'DIE_X', 'DIEX']:
        if alias in col_upper_map and col_upper_map[alias] in df.columns:
            if col_upper_map[alias] != 'X_COORD':
                df.rename(columns={col_upper_map[alias]: 'X_COORD'}, inplace=True)
            break
    for alias in ['Y_COORD', 'Y_AXIS', 'Y_COORDINATE', 'Y_POS', 'Y', 'DIE_Y', 'DIEY']:
        if alias in col_upper_map and col_upper_map[alias] in df.columns:
            if col_upper_map[alias] != 'Y_COORD':
                df.rename(columns={col_upper_map[alias]: 'Y_COORD'}, inplace=True)
            break

    # Convert SITE_NUM and SOFT_BIN to int
    df['SITE_NUM'] = pd.to_numeric(df['SITE_NUM'], errors='coerce').fillna(1).astype(int)
    df['SOFT_BIN'] = pd.to_numeric(df['SOFT_BIN'], errors='coerce').fillna(1).astype(int)

    # Convert numeric parameters to float
    reserved_cols = {'SITE_NUM', 'SOFT_BIN', 'HARD_BIN', 'X_COORD', 'Y_COORD', 'PASSFG', 'T_TIME', 'TEST_NUM', 'PART_ID', 'SERIAL'}
    param_names = []
    ul_row = found_limits['upper']
    ll_row = found_limits['lower']
    unit_row = found_limits['unit']

    for col in df.columns:
        if col in reserved_cols:
            continue
        param_names.append(col)
        df[col] = pd.to_numeric(df[col], errors='coerce')
        
        col_idx = clean_cols.index(col) if col in clean_cols else -1
        if col_idx >= 0:
            if unit_row and col_idx < len(unit_row):
                result.param_units[col] = unit_row[col_idx].strip()
            if ul_row and col_idx < len(ul_row):
                try:
                    result.param_ul[col] = float(ul_row[col_idx].strip())
                except (ValueError, TypeError):
                    pass
            if ll_row and col_idx < len(ll_row):
                try:
                    result.param_ll[col] = float(ll_row[col_idx].strip())
                except (ValueError, TypeError):
                    pass

    has_coords = ('X_COORD' in df.columns and 'Y_COORD' in df.columns)
    result.test_stage = 'CP' if has_coords else 'FT'
    result.param_names = param_names
    result.data = df
    result.error = None
    print(f"[density_fallback] Successfully parsed {filepath}: shape={df.shape}, params={len(param_names)}")
    return result
