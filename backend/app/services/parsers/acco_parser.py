"""
parse_acco.py  —  通用 ACCO/STS8200/STS8300/T2K/TMT/ETS364 数据解析器

设计原则
────────
1. 列密度定位数据区
   统计每行非空列数，取整体最大列数 m；
   第一个「在 m//4 列位置非空 且 第0列是纯数字」的行即为数据起始行，
   其之前所有行构成「表头区」。

2. 元数据提取（META_KEYS 注册表）
   遍历表头区每一行，按多名映射提取元数据，找不到就留 None。
   后续可直接在 META_KEYS 追加新的键名变体，无需改动提取逻辑。

3. 列名标准化（COL_ALIASES 注册表）
   找到参数列头行后，将实际列名映射为标准名
   SITE_NUM / SOFT_BIN / X_COORD / Y_COORD。

4. 限值行识别（LIMIT_ROW_KEYS 注册表）
   扫描列头行与数据起始行之间的行，按行首关键字识别上限/下限/单位行，
   不依赖固定偏移，兼容各格式中间夹杂的辅助行（NUMBER 行等）。

5. 文件名交叉验证
   将文件名拆分为 token，与表头提取的 lot_id / wafer_id 做三级匹配
   （完全一致 > 包含关系 > 不一致），两者来源分别保存，冲突时打标记。

6. QA 参数截断
   找第一个有效数据行，统计实际非空参数数量，截断 QA 附加参数。
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

# 元数据多名映射
# key   : ParsedData 标准字段名
# value : 可能出现在表头行「第0列」的所有键名（大小写不敏感匹配）
META_KEYS: dict[str, list[str]] = {
    'program': [
        '[TestProgram]', 'Program:', 'Test program,', 'Test Name,',
    ],
    'lot_id': [
        '[LotID]', 'LOT_ID:', 'Lot Id:', 'LotID:',
        'Datalog for Lot Number,',
    ],
    'wafer_id': [
        '[WaferNo]', 'WAFER_ID:', 'Wafer No:', 'WaferNo:',
        'Datalog for SubLot Number,',
    ],
    'handler': [
        '[HandlerID]', 'Handler:', 'Handler/Prober ID,',
    ],
    'test_date_raw': [
        '[TestDate]', 'Date:', 'TestDate:', '测试日期:', '测试日期',
    ],
    'test_time_range': [
        'Test Time (start-end)',
    ],
    'beginning_time': [
        '[Beginning Time]', 'Beginning Time:', 'BeginningTime:', 'Beginning:', 'Beginning', 'Beginning 测试日期', 'Beginning   测试日期'
    ],
    'ending_time': [
        '[Ending Time]', 'Ending Time:', 'EndingTime:',
    ],
    'tester_id': [
        '[TesterID]', 'Tester ID:', 'Data collected on station,',
    ],
}

# 关键列的多名映射 → 标准列名
COL_ALIASES: dict[str, list[str]] = {
    'SITE_NUM': ['SITE_NUM', 'SITE', 'Site #', 'Site', 'SiteNum'],
    'SOFT_BIN': ['SOFT_BIN', 'BIN', 'Bin', 'Soft Bin', 'SBin', 'HBin', 'S-Bin', 'H-Bin'],
    'X_COORD':  ['X_COORD', 'X', 'XCoord', 'X_Coord', 'X-Coord', 'Coordinate X', 'X_POS'],
    'Y_COORD':  ['Y_COORD', 'Y', 'YCoord', 'Y_Coord', 'Y-Coord', 'Coordinate Y', 'Y_POS'],
    'SERIES':   ['PART_ID', 'Part ID', 'PART ID', 'SERIAL', 'Serial #', 'Serial#'],  # 序列号
}

# 限值行行首关键字 → 标准限值类型
LIMIT_ROW_KEYS: dict[str, list[str]] = {
    'upper': ['HLIMIT', 'LimitU', 'Upper Limit'],
    'lower': ['LLIMIT', 'LimitL', 'Lower Limit'],
    'unit':  ['UNITS',  'Unit',   'Units'],
}

# 文件名 token 中无意义的内容，排除后再做 lot/wafer 匹配
_FILENAME_SKIP_TOKENS = {
    'FT', 'FTH', 'FTL', 'FTC', 'EQC', 'RT', 'CP', 'WT', 'QA',
    'R1', 'R2', 'R3', 'W', 'V', 'A', 'H',
    'ACCO', 'LBS', 'ETS',
}


# ══════════════════════════════════════════════════════════════════════════════
# 工具函数
# ══════════════════════════════════════════════════════════════════════════════

# 测试时间解析：支持的时间格式列表（精确时间 > 仅日期）
_DATETIME_FMTS = [
    '%Y-%m-%d %H:%M:%S',      # 2025-03-18 17:28:07
    '%Y-%m-%d %I:%M:%S %p',   # 2025-3-18 5:28:07 PM
    '%Y-%m-%d %H:%M',         # 2026/3/23 11:25  (分隔符归一化后)
    '%Y/%m/%d %H:%M:%S',
    '%Y/%m/%d %H:%M',
    '%Y/%m/%d',
    '%Y-%m-%d',
    '%Y-%m-%dT%H:%M:%S',      # ISO 8601
    '%Y/%m/%d %I:%M:%S %p',
    '%m/%d/%Y %H:%M:%S',      # 月/日/年
    '%m/%d/%Y %I:%M:%S %p',
    '%m/%d/%Y',
    '%m-%d-%Y',
    '%Y%m%d%H%M%S',           # 纯数字 20250314114627
    '%Y%m%d',
]


def parse_datetime_str(raw: str) -> Optional[str]:
    """
    尝试将任意格式的时间字符串解析为标准格式。
    返回 'YYYY-MM-DD HH:MM:SS'（精确时间）或 'YYYY-MM-DD'（仅日期）。
    """
    if not raw:
        return None
    
    # 去除尾部的 .数字（毫秒/秒小数，如 22:42:17.0）
    s = re.sub(r'\.\d+$', '', raw.strip())
    
    # 统一分隔符：日期部分 / → -
    s = s.replace('/', '-')
    
    # 规范化月日（补前导零），处理 YYYY-M-D 或 M-D-YYYY
    # 先处理 YYYY-M-D
    s = re.sub(
        r'^(\d{4})-(\d{1,2})-(\d{1,2})',
        lambda m: f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}",
        s
    )
    # 处理 M-D-YYYY
    s = re.sub(
        r'^(\d{1,2})-(\d{1,2})-(\d{4})',
        lambda m: f"{int(m.group(1)):02d}-{int(m.group(2)):02d}-{m.group(3)}",
        s
    )

    # 规范化 12 小时制： 5:28:07 PM → 17:28:07
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
            # 如果格式中包含时间部分，返回完整格式
            if any(x in fmt for x in ('%H', '%I', '%M', '%p')):
                return dt.strftime('%Y-%m-%d %H:%M:%S')
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None


def _extract_date_from_filename(filename: str) -> Optional[str]:
    """
    从文件名（去扩展名）末尾提取测试时间戳。
    
    规则：
      1. 找文件名末尾的纯数字 token（至少 8 位为日期，最多 14 位为日期时间）。
      2. 兼容 YYYYMMDDHHMMSS, YYYYMMDD, MMDDYYYY。
      3. 兼容 Time_Date 模式（如 114627_20250314）。
    """
    name = os.path.splitext(os.path.basename(filename))[0]
    tokens = re.split(r'[_\-\s]+', name)
    
    # 逆序评估候选者
    for i in range(len(tokens) - 1, -1, -1):
        tok = tokens[i]
        
        # 情况 A: 14位 (YYYYMMDDHHMMSS)
        if len(tok) == 14 and tok.isdigit():
            res = parse_datetime_str(tok)
            if res: return res
            
        # 情况 B: 8位 (YYYYMMDD 或 MMDDYYYY)
        if len(tok) == 8 and tok.isdigit():
            # 尝试 YYYYMMDD
            if 1990 <= int(tok[:4]) <= 2100:
                # 检查前面是否紧跟 6 位时间 token (HHMMSS)
                if i > 0 and len(tokens[i-1]) == 6 and tokens[i-1].isdigit():
                    res = parse_datetime_str(tok + tokens[i-1])
                    if res: return res
                return parse_datetime_str(tok)
            # 尝试 MMDDYYYY
            if 1990 <= int(tok[4:]) <= 2100:
                reordered = tok[4:] + tok[:4]
                return parse_datetime_str(reordered)
                
    return None


def _nonblank_count(line: str) -> int:
    """统计一行中非空列数"""
    return sum(1 for v in line.strip().split(',') if v.strip())


def _is_data_row(cols: list[str]) -> bool:
    """判断一行是否为数据行：第0列是纯整数（含负号）"""
    v = cols[0].strip()
    return bool(v) and v.lstrip('-').isdigit()


def _col0(line: str) -> str:
    return line.strip().split(',')[0].strip()


def _col1(line: str) -> str:
    parts = line.strip().split(',')
    return parts[1].strip().strip('"') if len(parts) > 1 else ''


def _get_valid_param_count(raw_lines: list[str],
                           data_start_row: int,
                           data_start_col: int) -> Optional[int]:
    """
    找第一个有效数据行，统计实际非空参数数量，用于截断 QA 附加参数。
    """
    for line in raw_lines[data_start_row: data_start_row + 50]:
        cols = line.strip().split(',')
        if not _is_data_row(cols):
            continue
        data_cols = cols[data_start_col:]
        last_valid = 0
        for i, v in enumerate(data_cols):
            if v.strip() not in ('', 'NaN', 'nan'):
                last_valid = i
        return last_valid + 1
    return None


# ══════════════════════════════════════════════════════════════════════════════
# 第一步：列密度定位数据起始行
# ══════════════════════════════════════════════════════════════════════════════

def _locate_data_start(raw_lines: list[str]) -> int:
    """
    用列密度法定位数据起始行。

    算法：
    1. 统计所有行非空列数，取最大值 m
    2. 第一个满足以下两个条件的行即为数据起始行：
       - 第 m//4 列（0-indexed）非空
       - 第 0 列是纯数字
    返回行索引；找不到时返回 len(raw_lines)。
    """
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
# 第二步：表头区元数据提取
# ══════════════════════════════════════════════════════════════════════════════

def _extract_meta(header_lines: list[str]) -> dict[str, Optional[str]]:
    """
    遍历表头区，按 META_KEYS 注册表提取元数据。
    同一字段取第一个匹配到的值（优先级由列表顺序决定）。
    """
    result: dict[str, Optional[str]] = {k: None for k in META_KEYS}

    for line in header_lines:
        stripped = line.strip().rstrip('\r\n')
        c0 = _col0(stripped)
        c1 = _col1(stripped)

        # ── LBS 专属：sLotsetupinfo 行，lot 取第4列 ──────────────
        if c0.lower() == 'slotsetupinfo':
            parts = stripped.split(',')
            if result['lot_id'] is None and len(parts) > 3 and parts[3].strip():
                result['lot_id'] = parts[3].strip()
            continue

        # ── 通用 META_KEYS 匹配 ──────────────────────────────────
        for field, key_variants in META_KEYS.items():
            if result[field] is not None:
                continue
            for kv in key_variants:
                kv_clean = kv.rstrip(',')
                
                # Check if keyword is in c0
                kv_upper = kv_clean.upper()
                c0_upper = c0.upper()
                if kv_upper not in c0_upper:
                    continue

                value = c1
                if not value:
                    # Look for value right after the keyword in the same cell
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
                    value = re.sub(r'\.(dll|cfg)$', '', value,
                                   flags=re.IGNORECASE).strip()

                elif field == 'lot_id':
                    # Datalog for Lot Number 占位符不含数字，跳过
                    if kv_clean.lower().startswith('datalog'):
                        if not any(ch.isdigit() for ch in value):
                            break

                elif field == 'test_time_range':
                    parts = value.split(' - ', 1)
                    if len(parts) == 2:
                        result['beginning_time'] = parts[0].strip()
                        result['ending_time']    = parts[1].strip()

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
    """在表头区中找列头行（含 COL_ALIASES 关键字的行）"""
    all_aliases = {a.upper() for aliases in COL_ALIASES.values()
                   for a in aliases}
    for i, line in enumerate(header_lines):
        cols_upper = [c.strip().upper() for c in line.strip().split(',')]
        if any(c in all_aliases for c in cols_upper):
            return i
    return None


def _normalize_columns(header_cols: list[str]) -> dict[str, str]:
    """返回 {原始列名: 标准列名} 映射"""
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

def _extract_limit_rows(
        lines_between: list[str]
) -> dict[str, Optional[list[str]]]:
    """按行首关键字识别上限/下限/单位行"""
    found: dict[str, Optional[list[str]]] = {
        'upper': None, 'lower': None, 'unit': None
    }
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
    """
    将文件名（去扩展名）拆分为候选 token。
    过滤：长度 < 4、纯8位日期、无意义标记 token。
    """
    name = os.path.splitext(os.path.basename(filename))[0]
    raw_tokens = re.split(r'[_\-\s]+', name)
    result = []
    for t in raw_tokens:
        if len(t) < 4:
            continue
        if re.fullmatch(r'\d{8,}', t):    # 纯日期/时间戳
            continue
        if t.upper() in _FILENAME_SKIP_TOKENS:
            continue
        result.append(t)
    return result


def _match_level(val_header: Optional[str],
                 val_file: Optional[str]) -> int:
    """
    三级匹配：
    3 = 完全一致（大小写不敏感）
    2 = 一方包含另一方
    1 = 都有值但不匹配
    0 = 至少一方为空
    """
    if not val_header or not val_file:
        return 0
    h, f = val_header.upper(), val_file.upper()
    if h == f:
        return 3
    if h in f or f in h:
        return 2
    return 1


def _cross_validate(filename: str,
                    lot_header: Optional[str],
                    wafer_header: Optional[str]) -> dict:
    """
    用文件名 token 交叉验证 lot_id / wafer_id。
    返回最终采用值、来源标记、冲突标记。
    """
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
        if level >= 2:                        # 一致或包含关系，取较长的
            val = (header_val
                   if len(header_val) >= len(file_token)
                   else file_token)
            return val, 'both', False
        if level == 1:                        # 都有值但不一致，优先表头
            return header_val, 'header', True
        if header_val:
            return header_val, 'header', False
        if file_token:
            return file_token, 'filename', False
        return None, None, False

    final_lot,   lot_src,   lot_conflict   = _resolve(lot_header,   best_lot_token,   best_lot_level)
    final_wafer, wafer_src, wafer_conflict = _resolve(wafer_header, best_wafer_token, best_wafer_level)

    return {
        'lot_id':          final_lot,
        'wafer_id':        final_wafer,
        'lot_id_source':   lot_src,
        'wafer_id_source': wafer_src,
        'lot_conflict':    lot_conflict,
        'wafer_conflict':  wafer_conflict,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 主解析入口
# ══════════════════════════════════════════════════════════════════════════════

def parse_acco(filepath: str, tester: str) -> ParsedData:
    """
    通用 ACCO 格式解析器，兼容所有已知表头格式。
    """
    result = ParsedData(tester=tester)

    # ── 读文件 ────────────────────────────────────────────────────
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
    # 优先级：数据中的精确时间 > 数据中的日期 > 文件名中的时间戳
    _test_date_str: Optional[str] = None

    # 1) 尝试 Beginning Time（已提取到 result.beginning_time）
    if result.beginning_time:
        _test_date_str = parse_datetime_str(result.beginning_time)

    # 2) 尝试 [TestDate] / Date: 字段
    if not _test_date_str:
        raw_td = meta.get('test_date_raw')
        if raw_td:
            _test_date_str = parse_datetime_str(raw_td)

    # 3) 文件名兜底
    if not _test_date_str:
        _test_date_str = _extract_date_from_filename(filepath)

    # 4) 如果 beginning_time 只有日期但文件名有精确时间，用文件名补充时间
    if _test_date_str and len(_test_date_str) == 10:  # 仅日期
        fn_dt = _extract_date_from_filename(filepath)
        if fn_dt and len(fn_dt) == 19:  # 文件名有精确时间
            # 验证日期部分是否一致，不一致则保留数据内日期
            if fn_dt[:10] == _test_date_str:
                _test_date_str = fn_dt

    result.test_date = _test_date_str
    print(f"[parser] test_date={result.test_date}  "
          f"(beginning_time={result.beginning_time!r}, "
          f"test_date_raw={meta.get('test_date_raw')!r})")

    # SBin 定义（兼容逗号分隔和空格分隔，同时支持 Bin 名称中包含空格）
    _sbin_re = re.compile(
        r'SBin\[(\d+)\][\s,]+(.*?)(?:[\s,]+\d+[\s,]+[\d.]+%[\s,]*\d*)',
        re.IGNORECASE
    )
    for line in header_lines:
        m = _sbin_re.search(line.strip())
        if m:
            result.bin_definitions[int(m.group(1))] = {
                'name':     m.group(2).strip() or None,
                'hard_bin': None, # hard_bin is not reliably present in all formats
            }

    # ── 3. 列头行识别与列名标准化 ─────────────────────────────────
    col_header_idx = _find_col_header_row(header_lines)
    if col_header_idx is None:
        result.error = "未找到列头行（含 SITE/SITE_NUM/Site # 等关键字）"
        return result

    col_header_clean = [c.strip()
                        for c in header_lines[col_header_idx].strip().split(',')]

    # LBS 等格式：列头行只有前几列有名字，参数列为空
    # 需要从上方的 "Test Name" 行获取参数名
    if tester == 'LBS' or all(not c for c in col_header_clean[5:]):
        for line in header_lines[:col_header_idx]:
            cols = [c.strip() for c in line.strip().split(',')]
            if cols[0] == 'Test Name' and len(cols) > 5 and cols[5]:
                # 用 Test Name 行的参数名补齐列头
                for j in range(5, len(cols)):
                    if j < len(col_header_clean):
                        col_header_clean[j] = cols[j]
                    else:
                        col_header_clean.append(cols[j])
                print(f"[parser] LBS模式: 从 Test Name 行补齐 {len(cols)-5} 个参数名")
                break

    rename_map       = _normalize_columns(col_header_clean)

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
    # 先在列头行和数据行之间找（标准 ACCO 格式）
    col_header_raw_idx = raw_lines.index(header_lines[col_header_idx])
    between_lines = [
        ln for ln in raw_lines[col_header_raw_idx + 1: data_start_row]
        if _col0(ln).strip().strip('"')   # 过滤空行和 "" 占位行
    ]
    limit_rows = _extract_limit_rows(between_lines)

    # LBS 等格式：限值行在列头行上方，需要到表头区找
    if not any(limit_rows.values()):
        above_lines = raw_lines[:col_header_raw_idx]
        limit_rows = _extract_limit_rows(above_lines)

    ul_line   = limit_rows['upper']
    ll_line   = limit_rows['lower']
    unit_line = limit_rows['unit']

    # ── 5. QA 参数截断 + 提取参数信息 ────────────────────────────
    # 处理重复列名：加后缀去重
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
    print(f"[parser] 参数列起止: {data_start_col} ~ {param_end}, "
          f"表头总参数: {param_end - data_start_col}")

    for i in range(data_start_col, param_end):
        pname = unique_names[i]
        if not pname:
            continue
        result.param_names.append(pname)
        result.param_units[pname] = (
            unit_line[i].strip()
            if unit_line and i < len(unit_line) else ''
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

    # ── 6. 文件名交叉验证 lot_id / wafer_id ──────────────────────
    cv = resolve_lot_wafer(
        os.path.basename(filepath),
        meta.get('lot_id'),
        meta.get('wafer_id'),
        strict_lot_id=False,
    )
    result.lot_id   = cv['lot_id']
    result.wafer_id = cv['wafer_id']
    if cv['lot_conflict']:
        print(f"[parser] ⚠ lot_id 冲突: "
              f"header='{meta.get('lot_id')}' vs filename='{cv['lot_id']}'")
    if cv['wafer_conflict']:
        print(f"[parser] ⚠ wafer_id 冲突: "
              f"header='{meta.get('wafer_id')}' vs filename='{cv['wafer_id']}'")

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

    for col in ['SITE_NUM', 'SOFT_BIN', 'X_COORD', 'Y_COORD']:
        if col not in df.columns:
            df[col] = None
        df[col] = pd.to_numeric(df[col], errors='coerce')

    for pname in result.param_names:
        if pname in df.columns:
            df[pname] = pd.to_numeric(df[pname], errors='coerce')

    df = df.dropna(subset=['SITE_NUM']).reset_index(drop=True)

    # 判定是否有坐标：除了存在列且有非空值外，还需要至少有一个非 (0,0) 的坐标
    # 这能有效区分「带 0,0 占位符的 FT 数据」和「真正的 CP 数据」
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

    # ── 9. 组装最终列 ─────────────────────────────────────────────
    # SERIES 列放在最前面（如果数据中存在）
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
