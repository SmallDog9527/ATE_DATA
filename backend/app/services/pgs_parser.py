"""
PGS 文件解析服务
===================
支持版本：1007, 1006, 1003, 1002
输出：
  params  - Param 表行列表（与 XLS Sheet1 一致）
  summary - Summary 表行列表（与 XLS Sheet2 一致）

QA 支持（StartFunctionNum > 1）：
  - function_index < StartFunctionNum  → 初测行（is_qa=False）
    qa_min / qa_max 填入对应 QA Function 的 Limit
  - function_index >= StartFunctionNum → QA 重测行（is_qa=True）
    qa_min / qa_max = 自身的 lower / upper
"""

import csv
import re
from typing import Optional
from collections import defaultdict


# ─────────────────────────────────────────
# 内部工具函数
# ─────────────────────────────────────────

def _strip_len_prefix(s: str) -> str:
    """去掉 4 位长度前缀，返回实际字符串。例：'0007SITE_CK' → 'SITE_CK'"""
    if len(s) >= 4 and s[:4].isdigit():
        return s[4:]
    return s


def _decode_unit(field: str) -> str:
    """
    解码单位字段，格式：TTTTLLLLunit
      TTTT=总长, LLLL=单位长度, unit=单位字符串
    例：'00070002DB' → 'DB'；'00060001V' → 'V'
    """
    if len(field) >= 8 and field[:4].isdigit() and field[4:8].isdigit():
        unit_len = int(field[4:8])
        return field[8: 8 + unit_len]
    return field


def _decode_subunit(field: str) -> str:
    """
    解码子单位字段，格式：LLLLunit
    例：'0002DB' → 'DB'
    """
    if len(field) >= 4 and field[:4].isdigit():
        unit_len = int(field[:4])
        return field[4: 4 + unit_len]
    return field


def _decode_format(field: str) -> str:
    """
    解码 format 字段，格式：LLLLvalue
    例：'0000' → ''；'0003%+g' → '%+g'
    """
    if len(field) >= 4 and field[:4].isdigit():
        val_len = int(field[:4])
        return field[4: 4 + val_len]
    return field


def _decode_lower_limit(field: str) -> Optional[float]:
    """
    解码下限字段，格式：TTTTLLLLVVVVvalue
      TTTT=总长, LLLL=段长, VVVV=值长度, value=实际值
    例：'0024001600030.9' → 0.9
        '001800100000'    → None（值长=0，无限制）
    """
    if len(field) < 12:
        return None
    try:
        val_len = int(field[8:12])
        if val_len == 0:
            return None
        val_str = field[12: 12 + val_len]
        return float(val_str)
    except (ValueError, IndexError):
        return None


def _decode_upper_limit(field: str) -> Optional[float]:
    """
    解码上限字段，格式：VVVVvalue
    例：'00031.1' → 1.1；'0000' → None
    """
    if len(field) < 4:
        return None
    try:
        val_len = int(field[:4])
        if val_len == 0:
            return None
        val_str = field[4: 4 + val_len]
        return float(val_str)
    except (ValueError, IndexError):
        return None


def _parse_float(value: str) -> Optional[float]:
    """解析普通数字字段，空值或非法值返回 None。"""
    text = str(value).strip()
    if text == '':
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _split_csv_fields(text: str) -> list:
    """按 CSV 规则拆分一行，支持双引号包裹字段。"""
    return next(csv.reader([text], skipinitialspace=True))


def _should_skip_no_limit_param(symbol: str, lower: Optional[float], upper: Optional[float]) -> bool:
    """跳过明确无上下限的 RDS_0P4V 占位测试项。"""
    return lower is None and upper is None and 'RDS_0P4V' in (symbol or '')


def _is_qa_by_swbin(sw_bin: Optional[int]) -> bool:
    """PGS 中部分版本未设置 QA 分区，使用 SWBin=4 作为 QA 补充判定。"""
    return sw_bin == 4


def _extract_version_from_filename(filename: str) -> Optional[str]:
    """使用文件名（去除扩展名）作为程序版本标识，如 'HL5083ACP00_204KM_A00_V08.pgs' → 'HL5083ACP00_204KM_A00_V08'"""
    if not filename:
        return None
    if filename.lower().endswith('.pgs'):
        return filename[:-4]
    return filename


def _version_sort_key(version_str: Optional[str]) -> int:
    """版本号排序键：优先识别 _VNN 后缀，如 'HL5083ACP00_204KM_A00_V08' → 8"""
    if not version_str:
        return 9999
    m = re.search(r'_[Vv](\d+)', version_str)
    if m:
        return int(m.group(1))
    m = re.search(r'\d+', version_str)
    return int(m.group()) if m else 9999


# ─────────────────────────────────────────
# 版本检测
# ─────────────────────────────────────────

def detect_version(content: str) -> Optional[int]:
    """检测 PGS 文件版本，返回整数（如 1007/1006/1003/1002），找不到返回 None"""
    for line in content.splitlines():
        if 'iPgsVersion' in line and '=' in line:
            try:
                return int(line.split('=')[1].strip())
            except ValueError:
                pass
    return None


# ─────────────────────────────────────────
# QA 工具函数
# ─────────────────────────────────────────

def _parse_start_function_num(lines: list) -> int:
    """
    从 [QA Setting Block] 中解析 StartFunctionNum。
    返回解析到的整数值（可为负数或 1 表示无 QA 分区）。
    找不到时返回 1。
    """
    in_qa = False
    for line in lines:
        stripped = line.strip()
        if stripped == '[QA Setting Block]':
            in_qa = True
            continue
        if in_qa:
            if stripped.startswith('[') and stripped.endswith(']'):
                break  # 遇到下一个块，退出
            if 'StartFunctionNum' in stripped and '=' in stripped:
                try:
                    return int(stripped.split('=')[1].strip())
                except (ValueError, IndexError):
                    pass
    return 1


def _fuzzy_param_match(p1: str, p2: str) -> bool:
    """
    模糊匹配两个参数名（用于 QA Param 与初测 Param 对应）。
    策略（按优先级）：
      1. 完全相同
      2. 去掉末尾 _数字 后缀后相同
      3. 较短的名称是较长名称前 80% 长度的前缀
    """
    if not p1 or not p2:
        return False
    if p1 == p2:
        return True
    # 去掉末尾数字/下划线后缀后比较
    b1 = re.sub(r'_?\d+$', '', p1)
    b2 = re.sub(r'_?\d+$', '', p2)
    if b1 and b2 and b1 == b2:
        return True
    # 前缀匹配
    shorter, longer = (p1, p2) if len(p1) <= len(p2) else (p2, p1)
    if len(shorter) >= 4:
        prefix_len = max(4, int(len(shorter) * 0.8))
        if longer.startswith(shorter[:prefix_len]):
            return True
    return False


def _group_by_function_blocks(raw_params: list) -> list:
    """
    将 raw_params 按连续的 function_index 值分组，返回：
      [ (function_index, function_name, [params, ...]), ... ]
    """
    blocks: list = []
    cur_idx: Optional[int] = None
    cur_name: Optional[str] = None
    cur_list: list = []
    for rp in raw_params:
        if rp['function_index'] != cur_idx:
            if cur_idx is not None:
                blocks.append((cur_idx, cur_name, cur_list))
            cur_idx = rp['function_index']
            cur_name = rp['function']
            cur_list = [rp]
        else:
            cur_list.append(rp)
    if cur_idx is not None:
        blocks.append((cur_idx, cur_name, cur_list))
    return blocks


# ─────────────────────────────────────────
# v1007 解析
# ─────────────────────────────────────────

def _parse_bindata(lines: list) -> dict:
    """
    解析 BINData 行，建立 param_name → {item_number, sw_bin, hw_bin} 映射表。
    格式：BINData = SW_BIN, HW_BIN, ?, ?, NNNNN, ?, NNNNname,...
      parts[0] = SW_BIN（软件Bin号）
      parts[1] = HW_BIN（硬件Bin号）
      parts[4] = item_number（测试项编号）
      parts[6] = 带长度前缀的参数名
    """
    mapping = {}  # param_name → {"item_number": int, "sw_bin": int, "hw_bin": int}
    for line in lines:
        stripped = line.strip()
        if not stripped.startswith('BINData'):
            continue
        if '=' not in stripped:
            continue
        _, rest = stripped.split('=', 1)
        parts = [p.strip() for p in rest.split(',')]
        if len(parts) < 7:
            continue
        try:
            sw_bin   = int(parts[0])
            hw_bin   = int(parts[1])
            item_num = int(parts[4])
        except ValueError:
            continue
        raw_name = parts[6]               # 如 '0007SITE_CK'
        param_name = _strip_len_prefix(raw_name)
        if param_name and item_num not in (0,):
            mapping[param_name] = {"item_number": item_num, "sw_bin": sw_bin, "hw_bin": hw_bin}
    return mapping


def _parse_bindata_summary(lines: list) -> list:
    """
    从 BINData 行提取唯一 bin_name 对应的 (sw_bin, hw_bin)，用于 Summary 表。
    格式：BINData = SW_BIN, HW_BIN, ?, ?, item_number, ?, param_name, ?, ?, ?, bin_name
      parts[0]  = SW_BIN（软件Bin号）
      parts[1]  = HW_BIN（硬件Bin号）
      parts[-1] = bin_name（带长度前缀的Bin分组名，如 0007OS_OPEN → OS_OPEN）

    只统计 parts[-1] 有实际名称的行（跳过末字段为 0000/空 的行），
    按 bin_name 去重（同一 bin_name 只取首次出现的 sw_bin/hw_bin）。
    """
    seen: set = set()   # 已出现的 bin_name
    rows = []
    for line in lines:
        stripped = line.strip()
        if not stripped.startswith('BINData'):
            continue
        if '=' not in stripped:
            continue
        _, rest = stripped.split('=', 1)
        parts = [p.strip() for p in rest.split(',')]
        if len(parts) < 11:
            continue
        try:
            sw_bin = int(parts[0])
            hw_bin = int(parts[1])
        except ValueError:
            continue
        bin_name_raw = parts[-1]
        bin_name = _strip_len_prefix(bin_name_raw) if bin_name_raw else ''
        if not bin_name:          # 跳过末字段为空或全零的行
            continue
        if bin_name not in seen:  # 按 bin_name 去重
            seen.add(bin_name)
            rows.append({'sw_bin': sw_bin, 'hw_bin': hw_bin, 'bin_name': bin_name})
    return rows


def _parse_bindata_hw_by_sw(lines: list) -> dict:
    hw_by_sw: dict[int, int] = {}
    for line in lines:
        stripped = line.strip()
        if not stripped.startswith('BINData') or '=' not in stripped:
            continue
        _, rest = stripped.split('=', 1)
        parts = [p.strip() for p in rest.split(',')]
        if len(parts) < 2:
            continue
        try:
            sw_bin = int(parts[0])
            hw_bin = int(parts[1])
        except ValueError:
            continue
        hw_by_sw.setdefault(sw_bin, hw_bin)
    return hw_by_sw


def _parse_swbin_name_summary(lines: list) -> list:
    in_block = False
    seen: set[int] = set()
    rows = []
    hw_by_sw = _parse_bindata_hw_by_sw(lines)

    for line in lines:
        stripped = line.strip()
        if stripped.startswith('[SWBinName Definition Block]'):
            in_block = True
            continue
        if in_block and stripped.startswith('[') and stripped.endswith(']'):
            if stripped != '[SWBinName Definition Block]':
                break
            continue
        if not in_block or not stripped or stripped.lower().startswith('count'):
            continue
        if not stripped.startswith('BINName') or '=' not in stripped:
            continue

        _, rest = stripped.split('=', 1)
        parts = [p.strip() for p in rest.split(',')]
        if len(parts) < 4:
            continue
        try:
            sw_bin = int(parts[0])
        except ValueError:
            continue
        bin_name = _strip_len_prefix(parts[3]) if parts[3] else ''
        if not bin_name or sw_bin in seen:
            continue

        seen.add(sw_bin)
        rows.append({
            'sw_bin': sw_bin,
            'hw_bin': hw_by_sw.get(sw_bin, sw_bin),
            'bin_name': bin_name,
        })
    return rows


def _parse_datasheet_block(lines: list) -> list:
    """
    解析 [DataSheet Variable Block] 中的 FUNCTION 块，
    返回原始参数行列表，每项包含：
      function_index（1-based FUNCTION 计数）, function, param, symbol, bin_no,
      unit, subunit, fmt, lower, upper, description
    """
    in_block = False
    current_func = None
    current_bin = None
    func_index = 0          # 1-based，每遇到一个 FUNCTION 行就 +1
    raw_params = []

    for line in lines:
        stripped = line.strip()

        # 定位数据块
        if stripped.startswith('[DataSheet Variable Block]'):
            in_block = True
            continue
        if in_block and stripped.startswith('[') and stripped.endswith(']'):
            # 遇到下一个块，结束
            if stripped != '[DataSheet Variable Block]':
                in_block = False
            continue

        if not in_block:
            continue

        # FUNCTION 行
        if stripped.startswith('FUNCTION'):
            if '=' not in stripped:
                continue
            _, rest = stripped.split('=', 1)
            parts = [p.strip() for p in rest.split(',')]
            raw_func = parts[0]
            func_name = _strip_len_prefix(raw_func)
            if func_name:
                current_func = func_name
                func_index += 1          # ← 计数递增
            try:
                current_bin = int(parts[1]) if len(parts) > 1 else None
            except ValueError:
                current_bin = None
            continue

        # 子项行（以空格/tab 缩进，且不是空行）
        if current_func and line and line[0] in (' ', '\t'):
            parts = [p for p in stripped.split(',')]
            if len(parts) < 20:
                continue

            param   = _strip_len_prefix(parts[0])
            symbol  = _strip_len_prefix(parts[1])

            # unit
            unit_raw = parts[14] if len(parts) > 14 else ''
            unit = _decode_unit(unit_raw)

            # subunit
            su_raw = parts[16] if len(parts) > 16 else ''
            subunit = _decode_subunit(su_raw)

            # format
            fmt_raw = parts[17] if len(parts) > 17 else ''
            fmt = _decode_format(fmt_raw)

            # limits
            ll_raw = parts[18] if len(parts) > 18 else ''
            ul_raw = parts[19] if len(parts) > 19 else ''
            lower = _decode_lower_limit(ll_raw)
            upper = _decode_upper_limit(ul_raw)
            if _should_skip_no_limit_param(symbol, lower, upper):
                continue

            # description
            desc = parts[20].strip() if len(parts) > 20 else ''

            raw_params.append({
                'function_index': func_index,
                'function': current_func,
                'bin_no':   current_bin,
                'param':    param,
                'symbol':   symbol,
                'unit':     unit,
                'subunit':  subunit,
                'format':   fmt,
                'lower':    lower,
                'upper':    upper,
                'description': desc,
            })

    return raw_params


def parse_v1007(content: str) -> dict:
    """
    解析 v1007 格式 PGS 文件。
    返回：
      {
        "params":  [ {row_no, test_no, function, param, symbol, min, max, unit, format, subunit,
                       description, sw_bin, hw_bin, qa_min, qa_max, is_qa}, ... ],
        "summary": [ {sw_bin, hw_bin, bin_name}, ... ],
        "start_function_num": int,
      }

    当 StartFunctionNum > 1 时：
      - 初测行（function_index <= start_func_num，is_qa=False）：
          qa_min/qa_max 填入对应 QA Function 的 Limit。
      - QA 重测行（function_index > start_func_num，is_qa=True）：
          附加在 params 末尾；qa_min/qa_max 均为 None（前端 QA 列留空，
          避免与自身 min/max 重复显示）。

    QA 匹配规则（issue 3 修正）：
      对同一函数名，若初测出现 N 次、QA 出现 M 次（M<=N），
      则 QA 与初测从末尾对齐：QA[i] 对应 init[N-M+i]（最后 M 个初测块）。
    """
    lines = content.splitlines()

    # 1. 解析 StartFunctionNum
    start_func_num = _parse_start_function_num(lines)
    has_qa = start_func_num > 1

    # 2. 解析 BINData → item_number / bin 映射
    bin_map = _parse_bindata(lines)

    # 3. 解析所有 FUNCTION 块（含 function_index）
    raw_params = _parse_datasheet_block(lines)

    # 4. 按 StartFunctionNum 分割 初测 / QA
    #    初测：function_index <= start_func_num
    #    QA  ：function_index >  start_func_num  （起始为 start_func_num + 1）
    if has_qa:
        initial_raws = [rp for rp in raw_params if rp['function_index'] <= start_func_num]
        qa_raws      = [rp for rp in raw_params if rp['function_index'] >  start_func_num]
    else:
        initial_raws = [
            rp for rp in raw_params
            if not _is_qa_by_swbin((bin_map.get(rp['symbol']) or {}).get('sw_bin'))
        ]
        qa_raws = [
            rp for rp in raw_params
            if _is_qa_by_swbin((bin_map.get(rp['symbol']) or {}).get('sw_bin'))
        ]

    # 5. 按连续 Function 块分组
    initial_blocks = _group_by_function_blocks(initial_raws)
    qa_blocks      = _group_by_function_blocks(qa_raws)

    # 6. 匹配 QA 块 → 初测块，构建 Limit 映射
    #
    #  策略：按函数名分组后，从末尾对齐。
    #   初测 TEST_P2P_LKG 出现 2 次，QA 出现 1 次 → QA 对应初测第 2 个（最后一个）。
    #   初测 TEST_OS      出现 3 次，QA 出现 2 次 → QA[0]→初测[-2]，QA[1]→初测[-1]。
    #
    #  initial_qa_map: (initial_block_idx, param_name) -> (qa_lower, qa_upper)

    from collections import defaultdict
    init_by_name: dict = defaultdict(list)   # name -> [(bi, params_list), ...]
    for bi, (_, name, plist) in enumerate(initial_blocks):
        init_by_name[name].append((bi, plist))

    qa_by_name: dict = defaultdict(list)     # name -> [(qi, params_list), ...]
    for qi, (_, name, plist) in enumerate(qa_blocks):
        qa_by_name[name].append((qi, plist))

    initial_qa_map: dict = {}

    for func_name, qa_occ_list in qa_by_name.items():
        init_occ_list = init_by_name.get(func_name, [])
        if not init_occ_list:
            continue

        count = min(len(qa_occ_list), len(init_occ_list))
        # 从末尾对齐：初测取最后 count 个，QA 取最后 count 个
        matched_init = init_occ_list[-count:]
        matched_qa   = qa_occ_list[-count:]

        for (bi, init_plist), (_, qa_plist) in zip(matched_init, matched_qa):
            init_param_names = [rp['param'] for rp in init_plist]
            for qa_rp in qa_plist:
                qp = qa_rp['param']
                if qp in init_param_names:
                    initial_qa_map[(bi, qp)] = (qa_rp['lower'], qa_rp['upper'], (bin_map.get(qa_rp['symbol']) or {}).get('sw_bin'))
                else:
                    # 模糊匹配兜底
                    for iname in init_param_names:
                        if _fuzzy_param_match(qp, iname):
                            initial_qa_map[(bi, iname)] = (qa_rp['lower'], qa_rp['upper'], (bin_map.get(qa_rp['symbol']) or {}).get('sw_bin'))
                            break

    # ── 辅助：从 bin_map 取行信息 ──
    def _bin_info(symbol: str):
        info = bin_map.get(symbol)
        if info:
            return info['item_number'], info['sw_bin'], info['hw_bin']
        return None, None, None

    # 7. 组合 Param 表
    params_out = []
    row_no = 1

    # 7-A. 初测行（is_qa=False）
    for bi, (_, func_name, params_list) in enumerate(initial_blocks):
        for rp in params_list:
            test_no, sw_bin, hw_bin = _bin_info(rp['symbol'])
            key = (bi, rp['param'])
            qa_limits = initial_qa_map.get(key)
            is_qa = _is_qa_by_swbin(sw_bin)
            params_out.append({
                'row_no':      row_no,
                'test_no':     test_no,
                'function':    rp['function'],
                'param':       rp['param'],
                'symbol':      rp['symbol'],
                'min':         rp['lower'],
                'max':         rp['upper'],
                'unit':        rp['unit'],
                'format':      rp['format'],
                'subunit':     rp['subunit'],
                'description': rp['description'],
                'sw_bin':      sw_bin,
                'hw_bin':      hw_bin,
                'qa_min':      None if is_qa else (qa_limits[0] if qa_limits else None),
                'qa_max':      None if is_qa else (qa_limits[1] if qa_limits else None),
                'qa_sw_bin':   None if is_qa else (qa_limits[2] if qa_limits else None),
                'is_qa':       is_qa,
            })
            row_no += 1

    # 7-B. QA 重测行（is_qa=True）
    #   qa_min/qa_max 均置 None：前端 QA_MIN/QA_MAX 列对 QA 行留空，
    #   避免与 min/max 列内容重复（用户要求）。
    for _fi, _fn, params_list in qa_blocks:
        for rp in params_list:
            test_no, sw_bin, hw_bin = _bin_info(rp['symbol'])
            params_out.append({
                'row_no':      row_no,
                'test_no':     test_no,
                'function':    rp['function'],
                'param':       rp['param'],
                'symbol':      rp['symbol'],
                'min':         rp['lower'],
                'max':         rp['upper'],
                'unit':        rp['unit'],
                'format':      rp['format'],
                'subunit':     rp['subunit'],
                'description': rp['description'],
                'sw_bin':      sw_bin,
                'hw_bin':      hw_bin,
                'qa_min':      None,
                'qa_max':      None,
                'qa_sw_bin':   sw_bin,
                'is_qa':       True,
            })
            row_no += 1

    # 8. 组合 Summary 表
    summary_out = _parse_bindata_summary(lines)

    return {
        'params':             params_out,
        'summary':            summary_out,
        'start_function_num': start_func_num,
    }


def parse_v1006(content: str) -> dict:
    """解析 v1006 格式 PGS；参数结构沿用 v1007，Summary 使用 SWBinName 定义。"""
    lines = content.splitlines()
    result = parse_v1007(content)
    swbin_summary = _parse_swbin_name_summary(lines)
    if swbin_summary:
        result['summary'] = swbin_summary
    return result


# ─────────────────────────────────────────
# v1002 解析
# ─────────────────────────────────────────

def _parse_datasheet_block_v1002(lines: list) -> list:
    """
    解析 v1002 的 [DataSheet Variable Block]。

    v1002 使用普通 CSV 明文字段：
      FUNCTION = TEST_OS,1,48
          param,symbol,?, ?,lower,upper,"unit",subunit,"format",?, ?,description
    """
    in_block = False
    current_func = None
    current_bin = None
    func_index = 0
    raw_params = []

    for line in lines:
        stripped = line.strip()

        if stripped.startswith('[DataSheet Variable Block]'):
            in_block = True
            continue
        if in_block and stripped.startswith('[') and stripped.endswith(']'):
            if stripped != '[DataSheet Variable Block]':
                break
            continue

        if not in_block:
            continue

        if stripped.startswith('FUNCTION'):
            if '=' not in stripped:
                continue
            _, rest = stripped.split('=', 1)
            parts = _split_csv_fields(rest)
            func_name = parts[0].strip() if parts else ''
            if func_name and func_name != '0000':
                current_func = func_name
                func_index += 1
            try:
                current_bin = int(parts[1]) if len(parts) > 1 and parts[1] != '' else None
            except ValueError:
                current_bin = None
            continue

        if current_func and line and line[0] in (' ', '\t'):
            parts = _split_csv_fields(stripped)
            if len(parts) < 6:
                continue

            param = parts[0].strip()
            symbol = parts[1].strip() if len(parts) > 1 else param
            if not param or not symbol:
                continue
            lower = _parse_float(parts[4]) if len(parts) > 4 else None
            upper = _parse_float(parts[5]) if len(parts) > 5 else None
            if _should_skip_no_limit_param(symbol, lower, upper):
                continue

            raw_params.append({
                'function_index': func_index,
                'function': current_func,
                'bin_no':   current_bin,
                'param':    param,
                'symbol':   symbol,
                'unit':     parts[6].strip() if len(parts) > 6 else '',
                'subunit':  parts[7].strip() if len(parts) > 7 else '',
                'format':   parts[8].strip() if len(parts) > 8 else '',
                'lower':    lower,
                'upper':    upper,
                'description': parts[11].strip() if len(parts) > 11 else '',
            })

    return raw_params


def _parse_bindef_v1002(lines: list) -> dict:
    """
    解析 v1002 的 [Bin Definition Block]，建立 symbol → bin 信息映射。

    格式：
      sw_bin,hw_bin,?,?, "symbol","lower","upper","?","bin_name"
    """
    in_block = False
    mapping = {}
    item_number = 1

    for line in lines:
        stripped = line.strip()

        if stripped.startswith('[Bin Definition Block]'):
            in_block = True
            continue
        if in_block and stripped.startswith('[') and stripped.endswith(']'):
            if stripped != '[Bin Definition Block]':
                break
            continue

        if not in_block or not stripped or stripped.startswith('AllBinCount'):
            continue

        parts = _split_csv_fields(stripped)
        if len(parts) < 9:
            continue

        symbol = parts[4].strip()
        if not symbol:
            continue

        try:
            sw_bin = int(parts[0])
            hw_bin = int(parts[1])
        except ValueError:
            continue

        mapping[symbol] = {
            'item_number': item_number,
            'sw_bin': sw_bin,
            'hw_bin': hw_bin,
            'bin_name': parts[8].strip(),
        }
        item_number += 1

    return mapping


def _parse_bindef_summary_v1002(lines: list) -> list:
    """从 v1002 Bin Definition 中生成 Summary 表，字段与 v1007 保持一致。"""
    in_block = False
    seen = set()
    rows = []

    for line in lines:
        stripped = line.strip()

        if stripped.startswith('[Bin Definition Block]'):
            in_block = True
            continue
        if in_block and stripped.startswith('[') and stripped.endswith(']'):
            if stripped != '[Bin Definition Block]':
                break
            continue

        if not in_block or not stripped or stripped.startswith('AllBinCount'):
            continue

        parts = _split_csv_fields(stripped)
        if len(parts) < 9:
            continue

        symbol = parts[4].strip()
        if not symbol:
            continue

        bin_name = parts[8].strip()
        if not bin_name or bin_name in seen:
            continue

        try:
            sw_bin = int(parts[0])
            hw_bin = int(parts[1])
        except ValueError:
            continue

        seen.add(bin_name)
        rows.append({'sw_bin': sw_bin, 'hw_bin': hw_bin, 'bin_name': bin_name})

    return rows


def parse_v1002(content: str) -> dict:
    """解析 v1002 / v1003 格式 PGS，输出结构与 v1007 一致。"""
    lines = content.splitlines()
    start_func_num = _parse_start_function_num(lines)
    has_qa = start_func_num > 1
    bin_map = _parse_bindef_v1002(lines)
    raw_params = _parse_datasheet_block_v1002(lines)

    if has_qa:
        initial_raws = [rp for rp in raw_params if rp['function_index'] <= start_func_num]
        qa_raws      = [rp for rp in raw_params if rp['function_index'] >  start_func_num]
    else:
        initial_raws = [
            rp for rp in raw_params
            if not _is_qa_by_swbin((bin_map.get(rp['symbol']) or {}).get('sw_bin'))
        ]
        qa_raws = [
            rp for rp in raw_params
            if _is_qa_by_swbin((bin_map.get(rp['symbol']) or {}).get('sw_bin'))
        ]

    initial_blocks = _group_by_function_blocks(initial_raws)
    qa_blocks      = _group_by_function_blocks(qa_raws)

    init_by_name: dict = defaultdict(list)
    for bi, (_, name, plist) in enumerate(initial_blocks):
        init_by_name[name].append((bi, plist))

    qa_by_name: dict = defaultdict(list)
    for qi, (_, name, plist) in enumerate(qa_blocks):
        qa_by_name[name].append((qi, plist))

    initial_qa_map: dict = {}
    for func_name, qa_occ_list in qa_by_name.items():
        init_occ_list = init_by_name.get(func_name, [])
        if not init_occ_list:
            continue
        count = min(len(qa_occ_list), len(init_occ_list))
        for (bi, init_plist), (_, qa_plist) in zip(init_occ_list[-count:], qa_occ_list[-count:]):
            init_param_names = [rp['param'] for rp in init_plist]
            for qa_rp in qa_plist:
                qp = qa_rp['param']
                if qp in init_param_names:
                    initial_qa_map[(bi, qp)] = (qa_rp['lower'], qa_rp['upper'], (bin_map.get(qa_rp['symbol']) or {}).get('sw_bin'))
                else:
                    for iname in init_param_names:
                        if _fuzzy_param_match(qp, iname):
                            initial_qa_map[(bi, iname)] = (qa_rp['lower'], qa_rp['upper'], (bin_map.get(qa_rp['symbol']) or {}).get('sw_bin'))
                            break

    def _bin_info(symbol: str):
        info = bin_map.get(symbol)
        if info:
            return info['item_number'], info['sw_bin'], info['hw_bin']
        return None, None, None

    params_out = []
    row_no = 1

    for bi, (_, _func_name, params_list) in enumerate(initial_blocks):
        for rp in params_list:
            test_no, sw_bin, hw_bin = _bin_info(rp['symbol'])
            qa_limits = initial_qa_map.get((bi, rp['param']))
            is_qa = _is_qa_by_swbin(sw_bin)
            params_out.append({
                'row_no':      row_no,
                'test_no':     test_no,
                'function':    rp['function'],
                'param':       rp['param'],
                'symbol':      rp['symbol'],
                'min':         rp['lower'],
                'max':         rp['upper'],
                'unit':        rp['unit'],
                'format':      rp['format'],
                'subunit':     rp['subunit'],
                'description': rp['description'],
                'sw_bin':      sw_bin,
                'hw_bin':      hw_bin,
                'qa_min':      None if is_qa else (qa_limits[0] if qa_limits else None),
                'qa_max':      None if is_qa else (qa_limits[1] if qa_limits else None),
                'qa_sw_bin':   None if is_qa else (qa_limits[2] if qa_limits else None),
                'is_qa':       is_qa,
            })
            row_no += 1

    for _fi, _fn, params_list in qa_blocks:
        for rp in params_list:
            test_no, sw_bin, hw_bin = _bin_info(rp['symbol'])
            params_out.append({
                'row_no':      row_no,
                'test_no':     test_no,
                'function':    rp['function'],
                'param':       rp['param'],
                'symbol':      rp['symbol'],
                'min':         rp['lower'],
                'max':         rp['upper'],
                'unit':        rp['unit'],
                'format':      rp['format'],
                'subunit':     rp['subunit'],
                'description': rp['description'],
                'sw_bin':      sw_bin,
                'hw_bin':      hw_bin,
                'qa_min':      None,
                'qa_max':      None,
                'qa_sw_bin':   sw_bin,
                'is_qa':       True,
            })
            row_no += 1

    return {
        'params':             params_out,
        'summary':            _parse_bindef_summary_v1002(lines),
        'start_function_num': start_func_num,
    }


# ─────────────────────────────────────────
# 统一入口
# ─────────────────────────────────────────

def parse_pgs(content: str, filename: str = '') -> dict:
    """
    自动检测版本并解析 PGS 文件。
    返回：
      {
        "pgs_version": 1007,
        "program_version": "V08",
        "start_function_num": 46,   # >1 时表示有 QA 分区
        "params": [...],
        "summary": [...],
      }
    若解析失败，抛出 ValueError。
    """
    version = detect_version(content)
    if version is None:
        raise ValueError("无法识别 PGS 版本（未找到 iPgsVersion 字段）")

    if version == 1007:
        result = parse_v1007(content)
    elif version == 1006:
        result = parse_v1006(content)
    elif version in (1002, 1003):
        result = parse_v1002(content)
    else:
        raise ValueError(f"暂不支持 PGS 版本 {version}（目前支持：1007, 1006, 1003, 1002）")

    program_version = _extract_version_from_filename(filename)
    result['pgs_version'] = version
    result['program_version'] = program_version
    return result
