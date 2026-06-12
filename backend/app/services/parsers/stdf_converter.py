"""
stdf_converter.py  —  STDF/STD/STD.gz → 标准 CSV 转换器

支持格式：
  - .stdf / .std          : 原始 STDF v4 二进制文件
  - .stdf.gz / .std.gz    : gzip 压缩的 STDF 文件

输出 CSV 格式（与 acco_parser 兼容）：
  表头区：
    [TestProgram],{job_nam}
    [LotID],{lot_id}
    [WaferNo],{sublot_id}
    [Beginning Time],{start_t}
    [Ending Time],{finish_t}
  列头行：
    SITE_NUM,SOFT_BIN,X_COORD,Y_COORD,{param1},{param2},...
  限值行：
    HLIMIT,,,, {ul1},{ul2},...
    LLIMIT,,,, {ll1},{ll2},...
    UNITS,,,, {u1},{u2},...
  数据区：
    1,1,5,10,0.123,0.456,...
"""

import os
import gzip
import io
from typing import Optional
from datetime import datetime


# ── STDF 记录类型常量 ────────────────────────────────────────────────────────
REC_MIR = (1, 10)    # Master Information Record
REC_MRR = (1, 20)    # Master Results Record
REC_SDR = (1, 80)    # Site Description Record
REC_PIR = (5, 10)    # Part Information Record
REC_PRR = (5, 20)    # Part Results Record
REC_PTR = (15, 10)   # Parametric Test Record
REC_FTR = (15, 20)   # Functional Test Record
REC_DTR = (50, 30)   # Datalog Text Record


def _is_stdf_file(filepath: str) -> bool:
    """检查文件名扩展名是否为 STDF 格式"""
    name = filepath.lower()
    return (name.endswith('.stdf') or
            name.endswith('.std') or
            name.endswith('.stdf.gz') or
            name.endswith('.std.gz'))


def _open_stdf(filepath: str):
    """打开 STDF 文件（自动处理 gzip 压缩）"""
    name = filepath.lower()
    if name.endswith('.gz'):
        return gzip.open(filepath, 'rb')
    return open(filepath, 'rb')


def _stdf_timestamp_to_str(seconds: int) -> Optional[str]:
    """将 STDF 时间戳（自1970年起的秒数）转为字符串"""
    if not seconds:
        return None
    try:
        dt = datetime.utcfromtimestamp(seconds)
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return None


def _safe_str(val) -> str:
    """安全转换为字符串，None 返回空字符串"""
    if val is None:
        return ''
    s = str(val).strip()
    # 去除 pystdf 有时带的引号
    if s.startswith("b'") and s.endswith("'"):
        s = s[2:-1]
    return s.strip()


def convert_stdf_to_csv(stdf_path: str, csv_path: str) -> dict:
    """
    将 STDF 文件转换为 CSV 并保存。

    参数:
        stdf_path: 输入 STDF 文件路径
        csv_path:  输出 CSV 文件路径

    返回:
        info dict:
            lot_id, wafer_id, program, beginning_time, ending_time,
            row_count, param_count, error
    """
    info = {
        'lot_id': None,
        'wafer_id': None,
        'program': None,
        'beginning_time': None,
        'ending_time': None,
        'row_count': 0,
        'param_count': 0,
        'error': None,
    }

    try:
        from pystdf.IO import Parser
        from pystdf.Importer import STDF2DataFrame
    except ImportError:
        info['error'] = "pystdf 库未安装，请运行 pip install pystdf"
        return info

    try:
        # pystdf 的 ImportSTDF 内部调用 open(fname, 'rb')，必须传文件路径字符串
        # 对于 .gz 压缩文件，先解压到临时文件再传路径
        import tempfile
        name_lower = stdf_path.lower()
        tmp_path = None

        if name_lower.endswith('.gz'):
            # 解压 gzip 到临时文件
            suffix = '.stdf' if name_lower.endswith('.stdf.gz') else '.std'
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp_path = tmp.name
            with gzip.open(stdf_path, 'rb') as gz_in:
                with open(tmp_path, 'wb') as out:
                    out.write(gz_in.read())
            parse_path = tmp_path
        else:
            parse_path = stdf_path

        tables = STDF2DataFrame(parse_path)

    except Exception as e:
        info['error'] = f"STDF 文件读取失败: {e}"
        return info
    finally:
        # 清理临时文件
        if 'tmp_path' in dir() and tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    # ── 提取 MIR 元数据 ──────────────────────────────────────────────────────
    mir_df = tables.get('MIR')
    if mir_df is not None and not mir_df.empty:
        row = mir_df.iloc[0]
        info['lot_id']          = _safe_str(row.get('LOT_ID', ''))
        info['wafer_id']        = _safe_str(row.get('SBLOT_ID', ''))
        info['program']         = _safe_str(row.get('JOB_NAM', ''))
        start_t                 = row.get('START_T', None)
        finish_t                = row.get('FINISH_T', None)
        if start_t:
            info['beginning_time'] = _stdf_timestamp_to_str(int(start_t))
        if finish_t:
            info['ending_time'] = _stdf_timestamp_to_str(int(finish_t))

    # ── 从 MRR 补充 finish_t ─────────────────────────────────────────────────
    if not info['ending_time']:
        mrr_df = tables.get('MRR')
        if mrr_df is not None and not mrr_df.empty:
            finish_t = mrr_df.iloc[0].get('FINISH_T', None)
            if finish_t:
                info['ending_time'] = _stdf_timestamp_to_str(int(finish_t))

    # ── 提取 PTR 参数测试数据 ─────────────────────────────────────────────────
    ptr_df = tables.get('PTR')
    if ptr_df is None or ptr_df.empty:
        info['error'] = "STDF 文件中没有 PTR 参数测试记录"
        return info

    # 过滤出可能需要的列（pystdf 1.3.x 的列名可能有差异）
    ptr_cols = list(ptr_df.columns)

    # 识别关键列
    head_num_col  = next((c for c in ptr_cols if c.upper() == 'HEAD_NUM'), None)
    site_num_col  = next((c for c in ptr_cols if c.upper() == 'SITE_NUM'), None)
    test_num_col  = next((c for c in ptr_cols if c.upper() == 'TEST_NUM'), None)
    test_txt_col  = next((c for c in ptr_cols if c.upper() == 'TEST_TXT'), None)
    result_col    = next((c for c in ptr_cols if c.upper() == 'RESULT'), None)
    lo_limit_col  = next((c for c in ptr_cols if c.upper() == 'LO_LIMIT'), None)
    hi_limit_col  = next((c for c in ptr_cols if c.upper() == 'HI_LIMIT'), None)
    units_col     = next((c for c in ptr_cols if c.upper() == 'UNITS'), None)

    if site_num_col is None or result_col is None:
        info['error'] = "PTR 记录缺少 SITE_NUM 或 RESULT 列"
        return info

    # ── 构建参数名列表（按 TEST_NUM 排序，确保列顺序稳定）────────────────────
    import pandas as pd
    import numpy as np

    # 使用 TEST_NUM + TEST_TXT 构造唯一参数名
    if test_txt_col and test_num_col:
        param_key_df = (
            ptr_df[[test_num_col, test_txt_col]]
            .drop_duplicates(subset=[test_num_col])
            .sort_values(test_num_col)
        )
        param_num_to_name = {}
        seen_names = {}
        for _, r in param_key_df.iterrows():
            tnum = int(r[test_num_col]) if pd.notna(r[test_num_col]) else 0
            tname = _safe_str(r[test_txt_col]) or f"T{tnum}"
            # 去重处理
            if tname in seen_names:
                seen_names[tname] += 1
                tname = f"{tname}_{seen_names[tname]}"
            else:
                seen_names[tname] = 0
            param_num_to_name[tnum] = tname
    elif test_num_col:
        tnums = sorted(ptr_df[test_num_col].dropna().unique().astype(int))
        param_num_to_name = {t: f"T{t}" for t in tnums}
    else:
        info['error'] = "PTR 记录缺少 TEST_NUM 列，无法识别参数"
        return info

    param_nums   = list(param_num_to_name.keys())   # 排序后的 TEST_NUM 列表
    param_names  = [param_num_to_name[n] for n in param_nums]

    # ── 提取限值和单位（每个参数取第一个非空值）────────────────────────────
    param_ul   = {}
    param_ll   = {}
    param_unit = {}

    for tnum, pname in param_num_to_name.items():
        mask = ptr_df[test_num_col].astype(float).astype(int) == tnum
        sub  = ptr_df[mask].iloc[:1]
        if sub.empty:
            param_ul[pname] = ''
            param_ll[pname] = ''
            param_unit[pname] = ''
            continue
        row = sub.iloc[0]
        ul = row.get(hi_limit_col, None) if hi_limit_col else None
        ll = row.get(lo_limit_col, None) if lo_limit_col else None
        u  = row.get(units_col,    '') if units_col    else ''
        param_ul[pname]   = '' if (ul is None or (isinstance(ul, float) and np.isnan(ul))) else str(ul)
        param_ll[pname]   = '' if (ll is None or (isinstance(ll, float) and np.isnan(ll))) else str(ll)
        param_unit[pname] = _safe_str(u)

    # ── 提取 PRR 数据（SOFT_BIN / HARD_BIN / X_COORD / Y_COORD）────────────
    prr_df = tables.get('PRR')
    has_prr = prr_df is not None and not prr_df.empty

    prr_cols = list(prr_df.columns) if has_prr else []
    prr_head_col  = next((c for c in prr_cols if c.upper() == 'HEAD_NUM'),  None)
    prr_site_col  = next((c for c in prr_cols if c.upper() == 'SITE_NUM'),  None)
    prr_sbin_col  = next((c for c in prr_cols if c.upper() == 'SOFT_BIN'),  None)
    prr_hbin_col  = next((c for c in prr_cols if c.upper() == 'HARD_BIN'),  None)
    prr_x_col     = next((c for c in prr_cols if c.upper() == 'X_INT'),     None)
    prr_y_col     = next((c for c in prr_cols if c.upper() == 'Y_INT'),     None)
    prr_part_col  = next((c for c in prr_cols if c.upper() == 'PART_ID'),   None)

    # ── 透视 PTR 数据：每行对应一个 die ────────────────────────────────────
    # 使用 (HEAD_NUM, SITE_NUM, 累计 PIR 序号) 作为 die key
    # 由于 pystdf 按记录顺序展平，我们需要追踪每个 die 的索引

    # 给 PTR 加上 die_index（在同一 SITE 内的 PTR 批次序号）
    ptr_work = ptr_df.copy()

    # 创建 die_index：HEAD_NUM+SITE_NUM 组合内，每遇到 test_num == 第一个参数时 +1
    first_tnum = param_nums[0] if param_nums else None

    if head_num_col and site_num_col and first_tnum is not None:
        ptr_work['_key'] = (
            ptr_work[head_num_col].astype(str) + '_' +
            ptr_work[site_num_col].astype(str)
        )
        counters = {}
        die_idx  = []
        for _, r in ptr_work.iterrows():
            k    = r['_key']
            tnum = int(float(r[test_num_col])) if pd.notna(r[test_num_col]) else -1
            if tnum == first_tnum:
                counters[k] = counters.get(k, -1) + 1
            die_idx.append(counters.get(k, 0))
        ptr_work['_die_idx'] = die_idx
        group_cols = [head_num_col, site_num_col, '_die_idx']
    else:
        # 如果没有 HEAD_NUM，只用 SITE_NUM
        ptr_work['_die_idx'] = ptr_work.groupby(site_num_col).cumcount() // len(param_nums)
        group_cols = [site_num_col, '_die_idx']

    # 透视
    ptr_work['_tnum'] = ptr_work[test_num_col].astype(float).astype(int)
    pivot_data = []
    for group_key, grp in ptr_work.groupby(group_cols):
        row_dict = {}
        if head_num_col:
            row_dict['HEAD_NUM'] = grp[head_num_col].iloc[0]
        row_dict['SITE_NUM'] = grp[site_num_col].iloc[0]
        for _, r in grp.iterrows():
            tnum = int(r['_tnum'])
            if tnum in param_num_to_name:
                pname = param_num_to_name[tnum]
                val = r[result_col]
                row_dict[pname] = val
        pivot_data.append(row_dict)

    pivot_df = pd.DataFrame(pivot_data)
    if pivot_df.empty:
        info['error'] = "无法从 PTR 记录透视生成数据表"
        return info

    # 确保 SITE_NUM 列存在
    if 'SITE_NUM' not in pivot_df.columns:
        info['error'] = "透视后数据缺少 SITE_NUM 列"
        return info

    pivot_df['SITE_NUM'] = pd.to_numeric(pivot_df['SITE_NUM'], errors='coerce').fillna(0).astype(int)

    # ── 合并 PRR 数据 ─────────────────────────────────────────────────────
    if has_prr and prr_site_col:
        prr_work = prr_df.copy()
        prr_work['SITE_NUM'] = pd.to_numeric(prr_work[prr_site_col], errors='coerce').fillna(0).astype(int)
        if prr_head_col:
            prr_work['HEAD_NUM'] = prr_work[prr_head_col]

        if prr_sbin_col:
            prr_work['SOFT_BIN'] = pd.to_numeric(prr_work[prr_sbin_col], errors='coerce').fillna(0).astype(int)
        if prr_x_col:
            prr_work['X_COORD'] = pd.to_numeric(prr_work[prr_x_col], errors='coerce').fillna(0).astype(int)
        if prr_y_col:
            prr_work['Y_COORD'] = pd.to_numeric(prr_work[prr_y_col], errors='coerce').fillna(0).astype(int)

        # 给 PRR 也加 die_index
        if prr_head_col:
            prr_work['_key'] = (
                prr_work[prr_head_col].astype(str) + '_' +
                prr_work['SITE_NUM'].astype(str)
            )
        else:
            prr_work['_key'] = prr_work['SITE_NUM'].astype(str)

        prr_work['_die_idx'] = prr_work.groupby('_key').cumcount()

        merge_left_cols  = ['SITE_NUM', '_die_idx']
        merge_right_cols = ['SITE_NUM', '_die_idx']
        if 'HEAD_NUM' in pivot_df.columns and prr_head_col:
            prr_work['HEAD_NUM'] = pd.to_numeric(prr_work['HEAD_NUM'], errors='coerce').fillna(0).astype(int)
            pivot_df['HEAD_NUM'] = pd.to_numeric(pivot_df.get('HEAD_NUM', 0), errors='coerce').fillna(0).astype(int)
            merge_left_cols  = ['HEAD_NUM', 'SITE_NUM', '_die_idx']
            merge_right_cols = ['HEAD_NUM', 'SITE_NUM', '_die_idx']

        prr_select = merge_right_cols + [c for c in ['SOFT_BIN', 'X_COORD', 'Y_COORD']
                                         if c in prr_work.columns]
        pivot_df['_die_idx'] = pivot_df.groupby(['SITE_NUM']).cumcount()
        pivot_df = pivot_df.merge(
            prr_work[prr_select].drop_duplicates(subset=merge_right_cols),
            left_on=merge_left_cols,
            right_on=merge_right_cols,
            how='left'
        )
    else:
        pivot_df['SOFT_BIN'] = 1
        pivot_df['X_COORD']  = 0
        pivot_df['Y_COORD']  = 0

    # 确保必要列存在
    for col in ['SOFT_BIN', 'X_COORD', 'Y_COORD']:
        if col not in pivot_df.columns:
            pivot_df[col] = 0

    pivot_df['SOFT_BIN'] = pd.to_numeric(pivot_df['SOFT_BIN'], errors='coerce').fillna(1).astype(int)
    pivot_df['X_COORD']  = pd.to_numeric(pivot_df['X_COORD'],  errors='coerce').fillna(0).astype(int)
    pivot_df['Y_COORD']  = pd.to_numeric(pivot_df['Y_COORD'],  errors='coerce').fillna(0).astype(int)

    # 判断是否有坐标（非全零）
    has_coords = ((pivot_df['X_COORD'] != 0) | (pivot_df['Y_COORD'] != 0)).any()

    # 最终列顺序
    final_cols = ['SITE_NUM', 'SOFT_BIN']
    if has_coords:
        final_cols += ['X_COORD', 'Y_COORD']

    # 只保留实际存在的参数列
    valid_params = [p for p in param_names if p in pivot_df.columns]
    final_cols  += valid_params

    result_df = pivot_df[final_cols].copy()

    info['row_count']   = len(result_df)
    info['param_count'] = len(valid_params)

    # ── 写入 CSV ─────────────────────────────────────────────────────────────
    lines = []

    # 表头区
    if info['program']:
        lines.append(f"[TestProgram],{info['program']}")
    if info['lot_id']:
        lines.append(f"[LotID],{info['lot_id']}")
    if info['wafer_id']:
        lines.append(f"[WaferNo],{info['wafer_id']}")
    if info['beginning_time']:
        lines.append(f"[Beginning Time],{info['beginning_time']}")
    if info['ending_time']:
        lines.append(f"[Ending Time],{info['ending_time']}")

    # 列头行
    lines.append(','.join(final_cols))

    # 限值行（HLIMIT / LLIMIT / UNITS）
    # 格式：行首标识 + 与 meta 列对应的空列 + 参数限值
    meta_empty = ',' * (len(final_cols) - len(valid_params) - 1)  # 空占位

    ul_vals   = [param_ul.get(p,   '') for p in valid_params]
    ll_vals   = [param_ll.get(p,   '') for p in valid_params]
    unit_vals = [param_unit.get(p, '') for p in valid_params]

    lines.append('HLIMIT'  + meta_empty + ',' + ','.join(ul_vals))
    lines.append('LLIMIT'  + meta_empty + ',' + ','.join(ll_vals))
    lines.append('UNITS'   + meta_empty + ',' + ','.join(unit_vals))

    # 数据行
    for _, row in result_df.iterrows():
        vals = []
        for col in final_cols:
            v = row[col]
            if pd.isna(v):
                vals.append('')
            elif col in ('SITE_NUM', 'SOFT_BIN', 'X_COORD', 'Y_COORD'):
                vals.append(str(int(v)))
            else:
                vals.append(str(v))
        lines.append(','.join(vals))

    with open(csv_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))

    print(f"[stdf_converter] 转换完成: {os.path.basename(stdf_path)} "
          f"→ {os.path.basename(csv_path)} "
          f"({info['row_count']} 行, {info['param_count']} 参数)")

    return info
