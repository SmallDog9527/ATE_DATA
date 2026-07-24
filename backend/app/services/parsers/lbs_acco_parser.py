"""
lbs_acco_parser.py  —  LBS log2csv 转换格式专用解析器（STS8200）

与 acco_parser.py 基于相同框架，针对 LBS 格式做以下适配：
1. 程序名：从 "Test program" 行提取
2. 批号：从 "Datalog for Lot Number" 行提取
3. 晶圆编号：从 "Datalog for SubLot Number" 行提取
4. 测试时间：从 "Test Time (start-end)" 行提取，格式
           "2026/03/19 13:41:27 - 2026/03/19 17:53:50"
           前半为开始时间，后半为结束时间
5. 外部显示 tester 仍为 STS8200
"""

import re
import os
import pandas as pd
from datetime import datetime
from typing import Optional
from app.services.parsers.base import ParsedData
from app.services.parsers.identity import resolve_lot_wafer


# ══════════════════════════════════════════════════════════════════════════════
# 注册表
# ══════════════════════════════════════════════════════════════════════════════

META_KEYS: dict[str, list[str]] = {
    'program': [
        'Test program',           # LBS: "Test program,HL5099WL01_102KL_A00_V01"
        '[TestProgram]', 'Program:',
    ],
    'lot_id': [
        'Datalog for Lot Number', # LBS: "Datalog for Lot Number,KA07426"
        '[LotID]', 'LOT_ID:', 'Lot Id:', 'LotID:',
    ],
    'wafer_id': [
        'Datalog for SubLot Number',  # LBS: "Datalog for SubLot Number,1"
        '[WaferNo]', 'WAFER_ID:', 'Wafer No:', 'WaferNo:',
    ],
    'handler': [
        'Handler/Prober ID',      # LBS: "Handler/Prober ID,UF200"
        '[HandlerID]', 'Handler:',
    ],
    'test_date_raw': [
        '[TestDate]', 'Date:', 'TestDate:', '测试日期:', '测试日期',
        'On',                     # LBS: "On,2026-03-19 13:41"
    ],
    # LBS 专用：开始-结束时间合并字段，特殊解析
    'test_time_range': [
        'Test Time (start-end)',  # LBS: "Test Time (start-end),2026/03/19 13:41:27 - 2026/03/19 17:53:50"
    ],
    'beginning_time': [
        '[Beginning Time]', 'Beginning Time:', 'BeginningTime:',
    ],
    'ending_time': [
        '[Ending Time]', 'Ending Time:', 'EndingTime:',
    ],
    'tester_id': [
        '[TesterID]', 'Tester ID:', 'Data collected on station,',
    ],
}

COL_ALIASES: dict[str, list[str]] = {
    'SITE_NUM': ['SITE_NUM', 'SITE', 'Site #', 'Site', 'SiteNum'],
    'SOFT_BIN': ['SOFT_BIN', 'BIN', 'Bin', 'Soft Bin', 'SBin', 'HBin', 'S-Bin', 'H-Bin'],
    'X_COORD':  ['X_COORD', 'X', 'XCoord', 'X_Coord', 'X-Coord', 'Coordinate X', 'X_POS'],
    'Y_COORD':  ['Y_COORD', 'Y', 'YCoord', 'Y_Coord', 'Y-Coord', 'Coordinate Y', 'Y_POS'],
    'SERIES':   ['PART_ID', 'Part ID', 'PART ID', 'SERIAL', 'Serial #', 'Serial#'],
}

LIMIT_ROW_KEYS: dict[str, list[str]] = {
    'upper': ['HLIMIT', 'LimitU', 'Upper Limit', 'Upper Limit'],
    'lower': ['LLIMIT', 'LimitL', 'Lower Limit', 'Lower Limit'],
    'unit':  ['UNITS',  'Unit',   'Units'],
}

_FILENAME_SKIP_TOKENS = {
    'FT', 'FTH', 'FTL', 'FTC', 'EQC', 'RT', 'CP', 'WT', 'QA',
    'R1', 'R2', 'R3', 'W', 'V', 'A', 'H',
    'ACCO', 'LBS', 'ETS',
}


# ══════════════════════════════════════════════════════════════════════════════
# 工具函数（与 acco_parser 一致）
# ══════════════════════════════════════════════════════════════════════════════

_DATETIME_FMTS = [
    '%Y-%m-%d %H:%M:%S',
    '%Y-%m-%d %I:%M:%S %p',
    '%Y-%m-%d %H:%M',
    '%Y/%m/%d %H:%M:%S',
    '%Y/%m/%d %H:%M',
    '%Y/%m/%d',
    '%Y-%m-%d',
    '%Y-%m-%dT%H:%M:%S',
    '%Y/%m/%d %I:%M:%S %p',
    '%m/%d/%Y %H:%M:%S',
    '%m/%d/%Y %I:%M:%S %p',
    '%m/%d/%Y',
    '%m-%d-%Y',
    '%Y%m%d%H%M%S',
    '%Y%m%d',
]


def parse_datetime_str(raw: str) -> Optional[str]:
    if not raw:
        return None
    s = re.sub(r'\.\d+$', '', raw.strip())
    s = s.replace('/', '-')
    s = re.sub(
        r'^(\d{4})-(\d{1,2})-(\d{1,2})',
        lambda m: f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}",
        s
    )
    s = re.sub(
        r'^(\d{1,2})-(\d{1,2})-(\d{4})',
        lambda m: f"{int(m.group(1)):02d}-{int(m.group(2)):02d}-{m.group(3)}",
        s
    )
    pm_match = re.search(r'(\d{1,2}):(\d{2})(:(\d{2}))?\s*(AM|PM)$', s, re.IGNORECASE)
    if pm_match:
        h, m_val, _, sec, period = pm_match.groups()
        h = int(h)
        if period.upper() == 'PM' and h != 12:
            h += 12
        elif period.upper() == 'AM' and h == 12:
            h = 0
        sec_str = f":{sec}" if sec else ":00"
        s = s[:pm_match.start()] + f"{h:02d}:{m_val}{sec_str}"
    for fmt in _DATETIME_FMTS:
        try:
            dt = datetime.strptime(s, fmt)
            if any(x in fmt for x in ('%H', '%I', '%M', '%p')):
                return dt.strftime('%Y-%m-%d %H:%M:%S')
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None


def _extract_date_from_filename(filename: str) -> Optional[str]:
    name = os.path.splitext(os.path.basename(filename))[0]
    tokens = re.split(r'[_\-\s]+', name)
    for i in range(len(tokens) - 1, -1, -1):
        tok = tokens[i]
        if len(tok) == 14 and tok.isdigit():
            res = parse_datetime_str(tok)
            if res: return res
        if len(tok) == 8 and tok.isdigit():
            if 1990 <= int(tok[:4]) <= 2100:
                if i > 0 and len(tokens[i-1]) == 6 and tokens[i-1].isdigit():
                    res = parse_datetime_str(tok + tokens[i-1])
                    if res: return res
                return parse_datetime_str(tok)
            if 1990 <= int(tok[4:]) <= 2100:
                reordered = tok[4:] + tok[:4]
                return parse_datetime_str(reordered)
    return None


def _nonblank_count(line: str) -> int:
    return sum(1 for v in line.strip().split(',') if v.strip())


def _is_data_row(cols: list[str]) -> bool:
    v = cols[0].strip()
    return bool(v) and v.lstrip('-').isdigit()


def _col0(line: str) -> str:
    return line.strip().split(',')[0].strip()


def _col1(line: str) -> str:
    parts = line.strip().split(',')
    return parts[1].strip().strip('"') if len(parts) > 1 else ''


# ══════════════════════════════════════════════════════════════════════════════
# 第一步：列密度定位数据起始行
# ══════════════════════════════════════════════════════════════════════════════

def _locate_data_start(raw_lines: list[str]) -> int:
    col_counts = [_nonblank_count(ln) for ln in raw_lines]
    m = max(col_counts) if col_counts else 0
    threshold_col = max(m // 4, 1)
    for i, line in enumerate(raw_lines):
        cols = line.strip().split(',')
        if not _is_data_row(cols):
            continue
        if len(cols) > threshold_col and cols[threshold_col].strip():
            return i
    return len(raw_lines)


# ══════════════════════════════════════════════════════════════════════════════
# 第二步：表头区元数据提取（LBS 专用）
# ══════════════════════════════════════════════════════════════════════════════

def _extract_meta(header_lines: list[str]) -> dict[str, Optional[str]]:
    """
    遍历表头区，按 META_KEYS 注册表提取元数据。
    LBS 特殊处理：
    - 跳过 sLotsetupinfo 行（lot/wafer 通过显式字段行提取更准确）
    - 识别 test_time_range 并拆分为 beginning_time / ending_time
    """
    result: dict[str, Optional[str]] = {k: None for k in META_KEYS}

    for line in header_lines:
        stripped = line.strip().rstrip('\r\n')
        c0 = _col0(stripped)
        c1 = _col1(stripped)

        # ── 跳过 sLotsetupinfo（LBS 格式不从此行提取）──────────
        if c0.lower() == 'slotsetupinfo':
            continue

        # ── 通用 META_KEYS 匹配 ──────────────────────────────────
        for field, key_variants in META_KEYS.items():
            if result[field] is not None:
                continue
            for kv in key_variants:
                kv_clean = kv.rstrip(',')
                kv_upper = kv_clean.upper()
                c0_upper = c0.upper()
                if kv_upper not in c0_upper:
                    continue

                value = c1
                if not value:
                    idx = c0_upper.find(kv_upper)
                    remainder = c0[idx + len(kv_clean):].strip()
                    if remainder.startswith(':'):
                        remainder = remainder[1:].strip()
                    if remainder:
                        value = remainder
                    else:
                        colon_pos = stripped.find(':')
                        if colon_pos > 0:
                            value = stripped[colon_pos + 1:].split(',')[0].strip()

                if not value:
                    continue

                # 字段专属后处理
                if field == 'program':
                    value = re.split(r'[/\\]', value)[-1].strip()

                elif field == 'handler':
                    value = re.sub(r'\.(dll|cfg)$', '', value, flags=re.IGNORECASE).strip()

                elif field == 'lot_id':
                    if kv_clean.lower().startswith('datalog'):
                        if not any(ch.isdigit() for ch in value):
                            break

                elif field == 'test_time_range':
                    # "2026/03/19 13:41:27 - 2026/03/19 17:53:50"
                    # 拆分为 beginning_time 和 ending_time
                    parts = value.split(' - ', 1)
                    if len(parts) == 2:
                        result['beginning_time'] = parts[0].strip()
                        result['ending_time']    = parts[1].strip()
                    result[field] = value
                    break

                elif field == 'beginning_time':
                    value = value.split(' - ')[0].strip()

                elif field == 'ending_time':
                    value = value.split(' - ')[-1].strip()

                result[field] = value
                break

    return result


# ══════════════════════════════════════════════════════════════════════════════
# 第三步：列头行识别与列名标准化
# ══════════════════════════════════════════════════════════════════════════════

def _find_col_header_row(header_lines: list[str]) -> Optional[int]:
    all_aliases = {a.upper() for aliases in COL_ALIASES.values() for a in aliases}
    for i, line in enumerate(header_lines):
        cols_upper = [c.strip().upper() for c in line.strip().split(',')]
        if any(c in all_aliases for c in cols_upper):
            return i
    return None


def _normalize_columns(header_cols: list[str]) -> dict[str, str]:
    rename: dict[str, str] = {}
    col_upper_map = {c.strip().upper(): c.strip() for c in header_cols}
    for std_name, aliases in COL_ALIASES.items():
        for alias in aliases:
            if alias.upper() in col_upper_map:
                orig = col_upper_map[alias.upper()]
                rename[orig] = std_name
                break
    return rename


# ══════════════════════════════════════════════════════════════════════════════
# 第四步：限值行识别
# ══════════════════════════════════════════════════════════════════════════════

def _extract_limit_rows(lines_between: list[str]) -> dict[str, Optional[list[str]]]:
    found: dict[str, Optional[list[str]]] = {'upper': None, 'lower': None, 'unit': None}
    for line in lines_between:
        c0_upper = _col0(line).upper().strip('"')
        for limit_type, keywords in LIMIT_ROW_KEYS.items():
            if found[limit_type] is not None:
                continue
            for kw in keywords:
                if c0_upper == kw.upper():
                    found[limit_type] = line.strip().split(',')
                    break
    return found


# ══════════════════════════════════════════════════════════════════════════════
# 第五步：文件名交叉验证
# ══════════════════════════════════════════════════════════════════════════════

def _filename_tokens(filename: str) -> list[str]:
    name = os.path.splitext(os.path.basename(filename))[0]
    raw_tokens = re.split(r'[_\-\s]+', name)
    result = []
    for t in raw_tokens:
        if len(t) < 4:
            continue
        if re.fullmatch(r'\d{8,}', t):
            continue
        if t.upper() in _FILENAME_SKIP_TOKENS:
            continue
        result.append(t)
    return result


def _match_level(val_header: Optional[str], val_file: Optional[str]) -> int:
    if not val_header or not val_file:
        return 0
    h, f = val_header.upper(), val_file.upper()
    if h == f: return 3
    if h in f or f in h: return 2
    return 1


def _cross_validate(filename: str, lot_header: Optional[str], wafer_header: Optional[str]) -> dict:
    tokens = _filename_tokens(filename)
    best_lot_token:   Optional[str] = None
    best_lot_level    = 0
    best_wafer_token: Optional[str] = None
    best_wafer_level  = 0
    for token in tokens:
        lv = _match_level(lot_header, token)
        if lv > best_lot_level:
            best_lot_level, best_lot_token = lv, token
        lv = _match_level(wafer_header, token)
        if lv > best_wafer_level:
            best_wafer_level, best_wafer_token = lv, token

    def _resolve(header_val, file_token, level):
        if level >= 2:
            val = header_val if len(header_val) >= len(file_token) else file_token
            return val, 'both', False
        if level == 1:
            return header_val, 'header', True
        if header_val:
            return header_val, 'header', False
        if file_token:
            return file_token, 'filename', False
        return None, None, False

    final_lot,   lot_src,   lot_conflict   = _resolve(lot_header,   best_lot_token,   best_lot_level)
    final_wafer, wafer_src, wafer_conflict = _resolve(wafer_header, best_wafer_token, best_wafer_level)

    return {
        'lot_id':        final_lot,
        'wafer_id':      final_wafer,
        'lot_conflict':  lot_conflict,
        'wafer_conflict': wafer_conflict,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 主解析入口
# ══════════════════════════════════════════════════════════════════════════════

def parse_lbs(filepath: str, tester: str) -> ParsedData:
    """
    LBS log2csv 格式专用解析器。
    外部显示 tester='STS8200'，内部走本文件逻辑。
    """
    # 外部始终显示 STS8200
    result = ParsedData(tester='STS8200')

    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            raw_lines = f.readlines()
    except Exception as e:
        result.error = f"文件读取失败: {e}"
        return result

    # ── 1. 列密度定位数据起始行 ───────────────────────────────────
    data_start_row = _locate_data_start(raw_lines)
    if data_start_row >= len(raw_lines):
        result.error = "未找到有效数据行"
        return result

    header_lines = raw_lines[:data_start_row]

    # ── 2. 元数据提取 ─────────────────────────────────────────────
    meta = _extract_meta(header_lines)
    result.program        = meta.get('program')
    result.beginning_time = meta.get('beginning_time')
    result.ending_time    = meta.get('ending_time')
    result.handler        = meta.get('handler')

    # ── 测试时间综合提取 ─────────────────────────────────────────
    _test_date_str: Optional[str] = None
    # 优先用 beginning_time（从 test_time_range 精确提取）
    if result.beginning_time:
        _test_date_str = parse_datetime_str(result.beginning_time)
    # 备选：On 行的日期
    if not _test_date_str:
        raw_td = meta.get('test_date_raw')
        if raw_td:
            _test_date_str = parse_datetime_str(raw_td)
    # 兜底：文件名时间戳
    if not _test_date_str:
        _test_date_str = _extract_date_from_filename(filepath)

    result.test_date = _test_date_str
    print(f"[lbs_parser] test_date={result.test_date}  "
          f"(beginning_time={result.beginning_time!r}, "
          f"ending_time={result.ending_time!r})")

    # SBin 定义
    _sbin_re = re.compile(
        r'SBin\[(\d+)\][\s,]+(.*?)(?:[\s,]+\d+[\s,]+[\d.]+%[\s,]*\d*)',
        re.IGNORECASE
    )
    for line in header_lines:
        m = _sbin_re.search(line.strip())
        if m:
            result.bin_definitions[int(m.group(1))] = {
                'name':     m.group(2).strip() or None,
                'hard_bin': None,
            }

    # ── 3. 列头行识别与列名标准化 ─────────────────────────────────
    col_header_idx = _find_col_header_row(header_lines)
    if col_header_idx is None:
        result.error = "未找到列头行（含 Site #/SITE_NUM 等关键字）"
        return result

    col_header_clean = [c.strip() for c in header_lines[col_header_idx].strip().split(',')]

    # LBS 格式：列头行（Site #,Serial #,Bin,...）后面参数列为空
    # 参数名在上方的 "Test Name" 行，需要补齐
    for line in header_lines[:col_header_idx]:
        cols = [c.strip() for c in line.strip().split(',')]
        if cols[0] == 'Test Name' and len(cols) > 5 and cols[5]:
            for j in range(5, len(cols)):
                if j < len(col_header_clean):
                    col_header_clean[j] = cols[j]
                else:
                    col_header_clean.append(cols[j])
            print(f"[lbs_parser] 从 Test Name 行补齐 {len(cols)-5} 个参数名")
            break

    rename_map = _normalize_columns(col_header_clean)

    def _find_std_col(std_name: str) -> Optional[int]:
        for i, orig in enumerate(col_header_clean):
            if rename_map.get(orig, orig) == std_name:
                return i
        return None

    site_col = _find_std_col('SITE_NUM')
    bin_col  = _find_std_col('SOFT_BIN')
    x_col    = _find_std_col('X_COORD')
    y_col    = _find_std_col('Y_COORD')

    if site_col is None or bin_col is None:
        result.error = "列头行中未找到 SITE 或 BIN 列"
        return result

    key_cols       = [c for c in [site_col, bin_col, x_col, y_col] if c is not None]
    data_start_col = max(key_cols) + 1

    # ── 4. 限值行识别 ─────────────────────────────────────────────
    col_header_raw_idx = raw_lines.index(header_lines[col_header_idx])
    between_lines = [
        ln for ln in raw_lines[col_header_raw_idx + 1: data_start_row]
        if _col0(ln).strip().strip('"')
    ]
    limit_rows = _extract_limit_rows(between_lines)
    if not any(limit_rows.values()):
        above_lines = raw_lines[:col_header_raw_idx]
        limit_rows = _extract_limit_rows(above_lines)

    ul_line   = limit_rows['upper']
    ll_line   = limit_rows['lower']
    unit_line = limit_rows['unit']

    # ── 5. 参数信息提取 ───────────────────────────────────────────
    seen = {}
    unique_names = []
    for name in col_header_clean:
        if name in seen:
            seen[name] += 1
            unique_names.append(f"{name}.{seen[name]}")
        else:
            seen[name] = 0
            unique_names.append(name)

    param_end = len(unique_names)
    print(f"[lbs_parser] 参数列起止: {data_start_col} ~ {param_end}, "
          f"表头总参数: {param_end - data_start_col}")

    for i in range(data_start_col, param_end):
        pname = unique_names[i]
        if not pname:
            continue
        result.param_names.append(pname)
        result.param_units[pname] = (
            unit_line[i].strip() if unit_line and i < len(unit_line) else ''
        )
        try:
            result.param_ll[pname] = (
                float(ll_line[i].strip())
                if ll_line and i < len(ll_line) and ll_line[i].strip()
                else None
            )
        except ValueError:
            result.param_ll[pname] = None
        try:
            result.param_ul[pname] = (
                float(ul_line[i].strip())
                if ul_line and i < len(ul_line) and ul_line[i].strip()
                else None
            )
        except ValueError:
            result.param_ul[pname] = None

    # ── 6. lot_id 用 cross_validate，wafer_id 专用文件名提取 ──────
    cv = resolve_lot_wafer(
        os.path.basename(filepath),
        meta.get('lot_id'),
        meta.get('wafer_id'),
        strict_lot_id=False,
    )
    result.lot_id = cv['lot_id']
    if cv['lot_conflict']:
        print(f"[lbs_parser] ⚠ lot_id 冲突: header='{meta.get('lot_id')}' vs filename")

    # LBS wafer_id 特别处理：
    # 表头 "Datalog for SubLot Number" 只给出序号（如 '1'），是单字符，
    # cross_validate 会把它当成很多长 token 的子串（如 HL5099WL01 含 '1'），
    # 导致错误地取了产品名作为 wafer_id。
    # 正确做法：直接从文件名中搜索 _W\d+ 模式（如 _W01_）提取晶圆号。
    _fn = os.path.basename(filepath)
    _wm = re.search(r'(?:^|_)(W\d+)(?:_|\.)', _fn, re.IGNORECASE)
    if _wm:
        result.wafer_id = f"{int(_wm.group(1)[1:]):02d}"
        print(f"[lbs_parser] wafer_id 从文件名提取: {result.wafer_id!r}")
    elif cv['wafer_id']:
        result.wafer_id = cv['wafer_id']
    else:
        result.wafer_id = ''

    # ── 7. 读取数据 ───────────────────────────────────────────────
    try:
        df = pd.read_csv(
            filepath,
            skiprows=data_start_row,
            header=None,
            names=unique_names,
            on_bad_lines='skip',
            dtype=str,
            encoding='utf-8',
            encoding_errors='ignore',
        )
    except Exception as e:
        result.error = f"数据读取失败: {e}"
        return result

    df = df.rename(columns=rename_map)

    # Bulk convert columns to numeric to avoid DataFrame copy-on-write fragmentation
    cols_to_convert = []
    for col in ['SITE_NUM', 'SOFT_BIN', 'X_COORD', 'Y_COORD']:
        if col not in df.columns:
            df[col] = None
        cols_to_convert.append(col)

    for pname in result.param_names:
        if pname in df.columns:
            cols_to_convert.append(pname)

    if cols_to_convert:
        df[cols_to_convert] = df[cols_to_convert].apply(pd.to_numeric, errors='coerce')

    df = df.dropna(subset=['SITE_NUM']).reset_index(drop=True)

    has_coords = (
        x_col is not None and
        df['X_COORD'].notna().any() and
        ((df['X_COORD'] != 0) | (df['Y_COORD'] != 0)).any()
    )

    # ── 8. 测试阶段识别 ───────────────────────────────────────────
    from app.services.parsers.detector import detect_test_stage
    result.test_stage = detect_test_stage(os.path.basename(filepath), has_coords)
    cv = resolve_lot_wafer(
        os.path.basename(filepath),
        meta.get('lot_id'),
        meta.get('wafer_id'),
        strict_lot_id=(result.test_stage == 'CP'),
    )
    result.lot_id = cv['lot_id']
    result.wafer_id = cv['wafer_id']

    # ── 9. 组装最终列（SERIES 放首列） ───────────────────────────
    series_col = 'SERIES' if 'SERIES' in df.columns else None
    final_cols = []
    if series_col:
        final_cols += ['SERIES']
    final_cols += ['SITE_NUM', 'SOFT_BIN']
    if has_coords:
        final_cols += ['X_COORD', 'Y_COORD']

    final_cols += [p for p in result.param_names if p in df.columns]
    result.data = df[final_cols]

    if has_coords:
        result.data = result.data[result.data['X_COORD'].abs() <= 999]

    return result
