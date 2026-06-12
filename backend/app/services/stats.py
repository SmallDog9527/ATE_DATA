import numpy as np
import pandas as pd
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from app.models.test_item import TestItem
from app.models.lot import Lot
from app.models.bin_summary import BinSummary
from app.services.parsers.base import ParsedData


def calculate_cpk(data: np.ndarray, ll: Optional[float], ul: Optional[float]) -> tuple:
    """计算 CPK/CPL/CPU"""
    if len(data) < 2:
        return None, None, None

    mean = np.mean(data)
    std = np.std(data, ddof=1)

    if std == 0:
        return None, None, None

    cpu = float((ul - mean) / (3 * std)) if ul is not None else None
    cpl = float((mean - ll) / (3 * std)) if ll is not None else None

    if cpu is not None and cpl is not None:
        cpk = min(cpu, cpl)
    elif cpu is not None:
        cpk = cpu
    elif cpl is not None:
        cpk = cpl
    else:
        cpk = None

    return cpk, cpl, cpu


def apply_filter(
    data: np.ndarray,
    filter_type: str = 'all',
    ll: Optional[float] = None,
    ul: Optional[float] = None,
    sigma: Optional[float] = None,
    custom_min: Optional[float] = None,
    custom_max: Optional[float] = None,
) -> np.ndarray:
    """
    按Filter类型筛选数据
    filter_type: all / robust / filter_by_limit / filter_by_sigma / custom
    """
    data = data[~np.isnan(data)]

    if filter_type == 'all':
        return data

    elif filter_type == 'robust':
        # IQR方法去除离群值
        q1 = np.percentile(data, 25)
        q3 = np.percentile(data, 75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        return data[(data >= lower) & (data <= upper)]

    elif filter_type == 'filter_by_limit':
        if ll is not None:
            data = data[data >= ll]
        if ul is not None:
            data = data[data <= ul]
        return data

    elif filter_type == 'filter_by_sigma':
        # 按 sigma 筛选时不改变极值，仅通过更新 limit 并重新统计，这里不实际过滤数据
        return data

    elif filter_type == 'custom':
        if custom_min is not None:
            data = data[data >= custom_min]
        if custom_max is not None:
            data = data[data <= custom_max]
        return data

    return data


def calc_param_stats(
    values: np.ndarray,
    ll: Optional[float],
    ul: Optional[float],
    exec_qty: int
) -> dict:
    """计算单个参数的统计数据"""
    clean = values[~np.isnan(values)]

    if len(clean) == 0:
        return {
            'exec_qty': exec_qty,
            'fail_count': 0,
            'fail_rate': 0,
            'yield_rate': 1.0,
            'mean': None,
            'stdev': None,
            'min_val': None,
            'max_val': None,
            'cpu': None,
            'cpl': None,
            'cpk': None,
        }

    # 计算fail（超出limit的数量）
    fail_mask = np.zeros(len(clean), dtype=bool)
    if ll is not None:
        fail_mask |= (clean < ll)
    if ul is not None:
        fail_mask |= (clean > ul)

    fail_count = int(fail_mask.sum())
    fail_rate = fail_count / exec_qty if exec_qty > 0 else 0
    yield_rate = 1 - fail_rate

    mean = float(np.mean(clean))
    stdev = float(np.std(clean, ddof=1)) if len(clean) > 1 else 0.0
    min_val = float(np.min(clean))
    max_val = float(np.max(clean))

    cpk, cpl, cpu = calculate_cpk(clean, ll, ul)

    return {
        'exec_qty': exec_qty,
        'fail_count': fail_count,
        'fail_rate': round(fail_rate, 6),
        'yield_rate': round(yield_rate, 6),
        'mean': round(mean, 6),
        'stdev': round(stdev, 6),
        'min_val': round(min_val, 6),
        'max_val': round(max_val, 6),
        'cpu': round(cpu, 6) if cpu is not None else None,
        'cpl': round(cpl, 6) if cpl is not None else None,
        'cpk': round(cpk, 6) if cpk is not None else None,
    }


def calc_hist_edges(filtered_all: np.ndarray, ll: Optional[float], ul: Optional[float]) -> tuple:
    """
    Calculate global histogram edges and return:
    (edges, exceeds_limit, ll_bin_index, ul_bin_index)
    """
    NUM_BINS = 50
    if len(filtered_all) > 1:
        global_min = float(np.min(filtered_all))
        global_max = float(np.max(filtered_all))

        if global_min == global_max:
            center = global_min
            half = abs(center) * 0.5 if center != 0 else 0.5
            global_min = center - half
            global_max = center + half
            _, global_edges = np.histogram(filtered_all, bins=NUM_BINS, range=(global_min, global_max))
            return global_edges, False, None, None
            
        elif ll is not None and ul is not None and ll != ul and (global_min < ll or global_max > ul):
            # Data exceeds limits, use non-uniform bins
            exceeds_limit = True
            n_below = 10
            n_mid = 30
            n_above = 10
            ll_bin_index = n_below
            ul_bin_index = n_below + n_mid

            left_bound = min(global_min, ll)
            left_margin = (ul - ll) * 0.03
            left_bound = left_bound - left_margin

            right_bound = max(global_max, ul)
            right_margin = (ul - ll) * 0.03
            right_bound = right_bound + right_margin

            edges_below = np.linspace(left_bound, ll, n_below + 1)
            edges_mid = np.linspace(ll, ul, n_mid + 1)
            edges_above = np.linspace(ul, right_bound, n_above + 1)

            global_edges = np.concatenate([edges_below, edges_mid[1:], edges_above[1:]])
            return global_edges, True, ll_bin_index, ul_bin_index
        else:
            _, global_edges = np.histogram(filtered_all, bins=NUM_BINS, range=(global_min, global_max))
            return global_edges, False, None, None
    else:
        global_edges = np.linspace(0, 1, NUM_BINS + 1)
        return global_edges, False, None, None


def calc_hist_x_range(
    data_min: float, data_max: float,
    ll: Optional[float], ul: Optional[float],
    edges_min: Optional[float] = None, edges_max: Optional[float] = None
) -> dict:
    """
    Mirror the frontend calcHistXRange logic for consistent Excel exports.
    Returns {x_min, x_max, ticks}
    """
    has_ll = ll is not None
    has_ul = ul is not None
    has_both = has_ll and has_ul

    # Case D: Fixed value (LL == UL and data no change)
    if data_min == data_max and (not has_both or ll == ul):
        center = data_min
        half = abs(center) * 0.5 if center != 0 else 0.5
        x_min, x_max = center - half, center + half
        ticks = np.linspace(x_min, x_max, 11)
        return {"x_min": x_min, "x_max": x_max, "ticks": ticks}

    # Case C: No Limit or LL == UL but data has change
    if has_both and ll == ul:
        range_min = edges_min if edges_min is not None else data_min
        range_max = edges_max if edges_max is not None else data_max
        padding = (range_max - range_min) * 0.05 or abs(range_max) * 0.01 or 0.1
        x_min, x_max = range_min - padding, range_max + padding
        ticks = np.linspace(x_min, x_max, 11)
        return {"x_min": x_min, "x_max": x_max, "ticks": ticks}

    if has_both:
        eff_min = edges_min if edges_min is not None else data_min
        eff_max = edges_max if edges_max is not None else data_max
        data_exceeds = eff_min < ll or eff_max > ul

        if not data_exceeds:
            # Case A: Within limits (LL at 10%, UL at 90%)
            limit_range = ul - ll
            total_range = limit_range / 0.8
            x_min = ll - total_range * 0.1
            x_max = ul + total_range * 0.1
            ticks = np.linspace(x_min, x_max, 11)
            return {"x_min": x_min, "x_max": x_max, "ticks": ticks}
        else:
            # Case B: Exceeds limits (LL at 20%, UL at 80%)
            limit_range = ul - ll
            total_range = limit_range / 0.6
            center = (ll + ul) / 2
            x_min = center - total_range / 2
            x_max = center + total_range / 2

            # Dynamic expansion
            if eff_min < x_min:
                x_min = eff_min - (limit_range * 0.05 if eff_min == ll else (ll - eff_min) * 0.1)
            if eff_max > x_max:
                x_max = eff_max + (limit_range * 0.05 if eff_max == ul else (eff_max - ul) * 0.1)

            ticks = np.linspace(x_min, x_max, 11)
            return {"x_min": x_min, "x_max": x_max, "ticks": ticks}

    if has_ll or has_ul:
        # Case E: Single limit
        eff_min = edges_min if edges_min is not None else data_min
        eff_max = edges_max if edges_max is not None else data_max
        range_min = min(eff_min, ll) if has_ll else eff_min
        range_max = max(eff_max, ul) if has_ul else eff_max
        padding = (range_max - range_min) * 0.05 or abs(range_max) * 0.01 or 0.1
        x_min, x_max = range_min - padding, range_max + padding
        ticks = np.linspace(x_min, x_max, 11)
        return {"x_min": x_min, "x_max": x_max, "ticks": ticks}

    # Default Case C: No limits
    eff_min = edges_min if edges_min is not None else data_min
    eff_max = edges_max if edges_max is not None else data_max
    padding = (eff_max - eff_min) * 0.05 or abs(eff_max) * 0.01 or 0.1
    x_min, x_max = eff_min - padding, eff_max + padding
    ticks = np.linspace(x_min, x_max, 11)
    return {"x_min": x_min, "x_max": x_max, "ticks": ticks}


def save_stats_to_db(
    lot: Lot,
    parsed: ParsedData,
    db: Session,
    PASS_BINS: List[int]
):
    def is_default_bin_name(bin_number: int, bin_name: Optional[str]) -> bool:
        if int(bin_number) == 4:
            return False
        name = (bin_name or '').strip()
        return not name or name.lower() == f'bin{int(bin_number)}'.lower()

    def resolve_bin_name(bin_number: int, bin_def: dict) -> str:
        if int(bin_number) == 4:
            return 'QA'
        parsed_name = (bin_def.get('name') or '').strip()
        if parsed_name and not is_default_bin_name(bin_number, parsed_name):
            return parsed_name

        custom_name = None
        if lot.program:
            from app.models.program_bin_name import ProgramBinName
            from sqlalchemy import and_
            custom_rec = db.query(ProgramBinName).filter(
                and_(
                    ProgramBinName.program == lot.program,
                    ProgramBinName.bin_number == int(bin_number)
                )
            ).first()
            if custom_rec:
                custom_name = custom_rec.bin_name

        return custom_name or parsed_name or f'Bin{int(bin_number)}'
    # ── ETS Bin Name 保存与同步逻辑 ──
    is_ets = (parsed.tester == 'ETS364' or lot.test_machine == 'ETS364')
    if is_ets and lot.program:
        from app.models.program_bin_name import ProgramBinName
        from sqlalchemy import and_
        
        # 检查 parsed 是否带有有效 Bin Name 定义（非默认占位符）
        has_real_summary = False
        if parsed.bin_definitions:
            for b_num, b_def in parsed.bin_definitions.items():
                b_name = b_def.get('name')
                if b_name and b_name.strip() and not is_default_bin_name(int(b_num), b_name):
                    has_real_summary = True
                    break

        if has_real_summary:
            print(f"[ets_bin_sync] ETS 数据带 Summary, 开始保存 Bin Name 到缓存库. Program: {lot.program}")
            for bin_num, bin_def in parsed.bin_definitions.items():
                bin_name = bin_def.get('name')
                if bin_name and bin_name.strip() and not is_default_bin_name(int(bin_num), bin_name):
                    prog_rec = db.query(ProgramBinName).filter(
                        and_(
                            ProgramBinName.program == lot.program,
                            ProgramBinName.bin_number == int(bin_num)
                        )
                    ).first()
                    if prog_rec:
                        prog_rec.bin_name = bin_name
                    else:
                        prog_rec = ProgramBinName(
                            program=lot.program,
                            bin_number=int(bin_num),
                            bin_name=bin_name
                        )
                        db.add(prog_rec)
            db.commit()
        else:
            # 文件中没有 summary / 真实 bin 名，从缓存库查询并填入
            print(f"[ets_bin_sync] ETS 数据不带 Summary / 无效 Summary, 尝试从缓存库载入 Bin Name. Program: {lot.program}")
            prog_recs = db.query(ProgramBinName).filter(
                ProgramBinName.program == lot.program
            ).all()
            if prog_recs:
                if parsed.bin_definitions is None:
                    parsed.bin_definitions = {}
                for rec in prog_recs:
                    parsed.bin_definitions[int(rec.bin_number)] = {
                        'name': rec.bin_name,
                        'hard_bin': None
                    }
                print(f"[ets_bin_sync] 成功从缓存库补全 {len(prog_recs)} 个 Bin Name 定义")

    df = parsed.data.copy()

    if 'X_COORD' in df.columns and 'Y_COORD' in df.columns:
        #has_coords = df['X_COORD'].notna().any()
        has_coords =(
            df['X_COORD'].notna().any() and
            ((df['X_COORD'] != 0) | (df['Y_COORD'] != 0)).any()
        )
    else:
        has_coords = False

    if has_coords:
        # Ensure 'SOFT_BIN' is numeric for robust comparison
        df['SOFT_BIN'] = pd.to_numeric(df['SOFT_BIN'], errors='coerce').fillna(-1).astype(int)

        # Create df_original (first occurrence)
        df_original = df.drop_duplicates(subset=['X_COORD', 'Y_COORD'], keep='first').reset_index(drop=True)

        # Create df_final based on the complex rule
        # Step 1: Get the last occurrence of each (X_COORD, Y_COORD) pair, retaining all columns
        df_final_base = df.drop_duplicates(subset=['X_COORD', 'Y_COORD'], keep='last').copy()

        # Step 2: For each (X_COORD, Y_COORD) pair, check if any of its SOFT_BINs were PASS
        # This will create a Series where the index is (X_COORD, Y_COORD) and value is True/False
        ever_pass = df.groupby(['X_COORD', 'Y_COORD'])['SOFT_BIN'].apply(lambda x: x.isin(PASS_BINS).any())

        # Step 3: Update SOFT_BIN in df_final_base based on 'ever_pass'
        df_final_base = df_final_base.set_index(['X_COORD', 'Y_COORD'])
        df_final_base['SOFT_BIN'] = df_final_base.index.map(lambda idx: PASS_BINS[0] if ever_pass.loc[idx] else df_final_base.loc[idx, 'SOFT_BIN'])
        df_final = df_final_base.reset_index()

        # --- Debugging: Investigate chips that are never PASS (ever_pass is False) ---
        never_pass_coords = ever_pass[~ever_pass].index.tolist()
        if never_pass_coords:
            print(f"DEBUG: Found {len(never_pass_coords)} unique (X,Y) coords that never passed (SOFT_BIN not in {PASS_BINS}):")
            # For these coords, get their full SOFT_BIN history from the original df
            never_pass_history = df[df.set_index(['X_COORD', 'Y_COORD']).index.isin(never_pass_coords)][['X_COORD', 'Y_COORD', 'SOFT_BIN']].drop_duplicates().sort_values(by=['X_COORD', 'Y_COORD'])
            print(f"DEBUG: SOFT_BIN history for never-pass chips:\n{never_pass_history.to_string()}")
        else:
            print("DEBUG: All chips have at least one PASS SOFT_BIN in their history.")
        # --- End Debugging ---

    else:
        # If no coordinates, then original and final are the same as the raw data
        df_final = df.copy()
        df_original = df.copy()

    # 计算 final 统计
    lot.die_count = len(df_final)
    # The conversion to numeric and print for df_final is now done above, within the if has_coords block for the base df
    print(f"DEBUG: df_final SOFT_BIN unique values after conversion: {df_final['SOFT_BIN'].unique()}")
    print(f"DEBUG: df_final SOFT_BIN pass/fail check (isin {PASS_BINS}): {df_final['SOFT_BIN'].isin(PASS_BINS).value_counts()}")
    lot.pass_count = int(df_final['SOFT_BIN'].isin(PASS_BINS).sum())
    lot.fail_count = lot.die_count - lot.pass_count
    lot.yield_rate = lot.pass_count / lot.die_count if lot.die_count > 0 else 0

    # 计算 original 统计
    lot.original_die_count = len(df_original)
    # The conversion to numeric and print for df_original is now done above, within the if has_coords block for the base df
    print(f"DEBUG: df_original SOFT_BIN unique values after conversion: {df_original['SOFT_BIN'].unique()}")
    print(f"DEBUG: df_original SOFT_BIN pass/fail check (isin {PASS_BINS}): {df_original['SOFT_BIN'].isin(PASS_BINS).value_counts()}")
    lot.original_pass_count = int(df_original['SOFT_BIN'].isin(PASS_BINS).sum())
    lot.original_fail_count = lot.original_die_count - lot.original_pass_count
    lot.original_yield_rate = lot.original_pass_count / lot.original_die_count if lot.original_die_count > 0 else 0

    # 删除旧数据
    db.query(TestItem).filter(TestItem.lot_id == lot.id).delete()
    db.query(BinSummary).filter(BinSummary.lot_id == lot.id).delete()

    # ── 参数统计（用 final 数据）──────────────────────────
    df_for_stats = df_final
    sites = sorted(df_for_stats['SITE_NUM'].dropna().unique().astype(int).tolist())

    test_items_to_add = []
    for idx, param_name in enumerate(parsed.param_names):
        if param_name not in df_for_stats.columns:
            continue
        ll = parsed.param_ll.get(param_name)
        ul = parsed.param_ul.get(param_name)
        unit = parsed.param_units.get(param_name, '')

        all_values = df_for_stats[param_name].values.astype(float)
        exec_qty = int(df_for_stats[param_name].notna().sum())
        stats = calc_param_stats(all_values, ll, ul, exec_qty)
        test_items_to_add.append(TestItem(
            lot_id=lot.id, item_number=idx+1, site=0,
            item_name=param_name, unit=unit,
            lower_limit=ll, upper_limit=ul, **stats
        ))

        for site in sites:
            site_df = df_for_stats[df_for_stats['SITE_NUM'] == site]
            site_values = site_df[param_name].values.astype(float)
            site_exec_qty = int(site_df[param_name].notna().sum())
            site_stats = calc_param_stats(site_values, ll, ul, site_exec_qty)
            test_items_to_add.append(TestItem(
                lot_id=lot.id, item_number=idx+1, site=int(site),
                item_name=param_name, unit=unit,
                lower_limit=ll, upper_limit=ul, **site_stats
            ))

    db.bulk_save_objects(test_items_to_add)
    lot.item_count = len(parsed.param_names)
    print(f"[stats] test_items 写入完成")

    # ── Bin 统计（Final 和 Original 各存一份）────────────
    bin_items_to_add = []

    for dr_label, df_dr in [('final', df_final), ('original', df_original)]:
        sites_dr = sorted(df_dr['SITE_NUM'].dropna().unique().astype(int).tolist())
        total = len(df_dr)

        # All Sites
        bin_counts = df_dr['SOFT_BIN'].value_counts()
        for bin_num, count in bin_counts.items():
            bin_def = parsed.bin_definitions.get(int(bin_num), {})
            bin_name = resolve_bin_name(int(bin_num), bin_def)

            bin_items_to_add.append(BinSummary(
                lot_id=lot.id,
                bin_number=int(bin_num),
                bin_name=bin_name,
                site=0,
                count=int(count),
                percentage=round(count / total * 100, 4) if total > 0 else 0,
                data_range=dr_label
            ))

        # 各 Site
        for site in sites_dr:
            site_df = df_dr[df_dr['SITE_NUM'] == site]
            site_total = len(site_df)
            for bin_num, count in site_df['SOFT_BIN'].value_counts().items():
                bin_def = parsed.bin_definitions.get(int(bin_num), {})
                bin_name = resolve_bin_name(int(bin_num), bin_def)

                bin_items_to_add.append(BinSummary(
                    lot_id=lot.id,
                    bin_number=int(bin_num),
                    bin_name=bin_name,
                    site=int(site),
                    count=int(count),
                    percentage=round(count / site_total * 100, 4) if site_total > 0 else 0,
                    data_range=dr_label
                ))

    db.bulk_save_objects(bin_items_to_add)
    db.commit()
    print(f"[stats] bin_summary 写入完成")


def run_lot_auto_check(lot, db):
    """
    运行 Lot 的自动 Check 校验：
    1. 先用阈值为 2 的连续报警判定（10 次随机算法）。
    2. 如果阈值 2 下 10 次模拟的报警数均大于 0，说明存在失效，接下来再用阈值为 3 跑一遍：
       - 如果阈值 3 下 10 次模拟的报警数也均大于 0（第二次失效），底色标记为红色（red）；
       - 如果阈值 3 下未出现每次都失效（第二次没有失效），底色标记为黄色（yellow）。
    3. 如果阈值 2 下不满足每次都失效的条件：
       - 如果 10 次模拟报警数均等于 0，底色标记为绿色（green）；
       - 否则，保持无底色（'none'）。
    """
    from app.models.idle_check_config import IdleCheckConfig
    from app.models.lot import Lot
    import numpy as np
    import pandas as pd
    import random
    import os

    if not lot.parquet_path or not os.path.exists(lot.parquet_path):
        return None

    config = db.query(IdleCheckConfig).filter(IdleCheckConfig.program_name == lot.program).first()
    if not config or not config.params:
        return None

    try:
        df_original = pd.read_parquet(lot.parquet_path)
        # 默认按照前端的 pass_only 过滤数据 (Bin1+2)，确保自动 Check 与手动点击 100% 一致
        if 'SOFT_BIN' in df_original.columns:
            df_original = df_original[df_original['SOFT_BIN'].isin([1, 2])].copy()

        selected_params = [p for p in config.params if p in df_original.columns]
        if not selected_params:
            return None

        n_total = len(df_original)
        if n_total == 0:
            return 'green'

        # 生成 10 组随机权重（两轮判定使用相同的权重序列以保证对比的一致性）
        weights_runs = [[random.uniform(1.0, 99.0) for _ in range(len(selected_params))] for _ in range(10)]

        def run_simulation(threshold):
            alarm_counts = []
            for run in range(10):
                use_weights = weights_runs[run]
                df = df_original.copy()

                # 计算指纹值
                param_data = df[selected_params].astype(float)
                fingerprints = []
                for idx, p in enumerate(selected_params):
                    fingerprints.append(param_data[p] * use_weights[idx])
                
                df['fingerprint'] = pd.concat(fingerprints, axis=1).sum(axis=1)
                
                site_col = 'SITE_NUM' if 'SITE_NUM' in df.columns else None
                alarm_count = 0

                if site_col:
                    sites = df[site_col].unique()
                    for site in sites:
                        site_mask = df[site_col] == site
                        site_df = df[site_mask]
                        fp_values = site_df['fingerprint'].values
                        n_sub = len(fp_values)
                        if n_sub > 0:
                            count = 1
                            for i in range(1, n_sub):
                                if fp_values[i] == fp_values[i-1] and not np.isnan(fp_values[i]):
                                    count += 1
                                else:
                                    if count >= threshold:
                                        alarm_count += count
                                    count = 1
                            if count >= threshold:
                                alarm_count += count
                else:
                    fp_values = df['fingerprint'].values
                    n_sub = len(fp_values)
                    if n_sub > 0:
                        count = 1
                        for i in range(1, n_sub):
                            if fp_values[i] == fp_values[i-1] and not np.isnan(fp_values[i]):
                                count += 1
                            else:
                                if count >= threshold:
                                    alarm_count += count
                                count = 1
                        if count >= threshold:
                            alarm_count += count
                alarm_counts.append(alarm_count)
            return alarm_counts

        # 1. 阈值 = 2 跑一遍
        alarm_counts_2 = run_simulation(threshold=2)

        if all(c > 0 for c in alarm_counts_2):
            # 阈值 2 每次都失效，使用阈值 3 再跑一遍
            alarm_counts_3 = run_simulation(threshold=3)
            if all(c > 0 for c in alarm_counts_3):
                return 'red'
            else:
                return 'yellow'
        elif all(c == 0 for c in alarm_counts_2):
            return 'green'
        else:
            return 'none'

    except Exception as e:
        print(f"Error running auto check for lot {lot.id}: {e}")
        return None
