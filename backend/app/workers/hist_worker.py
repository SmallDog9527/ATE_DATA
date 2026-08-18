# -*- coding: utf-8 -*-
"""
Pure histogram rendering worker for parallel export.
ZERO imports from app package - keeps spawn subprocess import fast.
Self-contains the stats algorithms needed (mirror of app.services.stats).
Figure is REUSED via ax.clear() for ~5x speedup over close+subplots.
"""
import io
import math
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

# module-global state, set once per export by setup
_G = {}

SITE_COLORS = ['#ff6b6b', '#4dabf7', '#69db7c', '#ffd43b', '#e599f7', '#74c0fc', '#a9e34b', '#ffa94d']


def _draw_site_legend(ax, sites_data, colors):
    """Draw chip-style site legend: colored capsule badges, white text, max 16/row, centered."""
    if not sites_data:
        return
    n = len(sites_data)
    max_per_row = 16
    # Build (label, color) pairs
    entries = []
    for sidx, s in enumerate(sites_data):
        label = s.get('label', f"S{s['site']}")
        if s['site'] == 0:
            # LOT mode: use a neutral dark color for the single badge
            color = '#555555'
        else:
            color = colors[(sidx) % len(colors)]
        entries.append((label, color))
    # Calculate rows and reserve space
    # Badge layout params
    xlim = ax.get_xlim()
    ylim = ax.get_ylim()
    x_range = xlim[1] - xlim[0]
    # Expand y-axis to fit legend inside axes bounds
    row_height = (ylim[1] - ylim[0]) * 0.04
    rows = (n + max_per_row - 1) // max_per_row
    total_legend_h = rows * row_height
    new_ylim_min = ylim[0] - total_legend_h * 1.3
    ax.set_ylim(new_ylim_min, ylim[1])
    y_top = new_ylim_min

    badge_w = x_range * 0.06
    badge_h = row_height * 0.7
    gap_x = x_range * 0.015
    for row_i in range(rows):
        row_entries = entries[row_i * max_per_row: (row_i + 1) * max_per_row]
        row_n = len(row_entries)
        total_w = row_n * badge_w + (row_n - 1) * gap_x
        start_x = xlim[0] + (x_range - total_w) / 2
        y_center = y_top - row_i * row_height
        rs = badge_h / 2
        for j, (label, color) in enumerate(row_entries):
            x_left = start_x + j * (badge_w + gap_x)
            # Draw rounded rectangle (capsule) with numeric rounding_size
            boxstyle = f"round,pad=0,rounding_size={rs:.4f}"
            rect = mpatches.FancyBboxPatch(
                (x_left, y_center - badge_h / 2), badge_w, badge_h,
                boxstyle=boxstyle,
                facecolor=color, edgecolor='none', zorder=10,
                transform=ax.transData, clip_on=False,
            )
            ax.add_patch(rect)
            ax.text(x_left + badge_w / 2, y_center, label,
                    ha='center', va='center', fontsize=6.5, fontweight='bold',
                    color='white', zorder=11, clip_on=False)


def _calc_cpk(data, ll, ul):
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


def _apply_filter(data, filter_type='all', ll=None, ul=None, sigma=None):
    data = data[~np.isnan(data)]
    if filter_type == 'all':
        return data
    elif filter_type == 'robust':
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
        return data
    return data


def _calc_param_stats(values, ll, ul, exec_qty):
    clean = values[~np.isnan(values)]
    if len(clean) == 0:
        return {'exec_qty': exec_qty, 'fail_count': 0, 'fail_rate': 0, 'yield_rate': 1.0,
                'mean': None, 'stdev': None, 'min_val': None, 'max_val': None,
                'cpu': None, 'cpl': None, 'cpk': None}
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
    cpk, cpl, cpu = _calc_cpk(clean, ll, ul)
    return {'exec_qty': exec_qty, 'fail_count': fail_count, 'fail_rate': round(fail_rate, 6),
            'yield_rate': round(yield_rate, 6), 'mean': round(mean, 6), 'stdev': round(stdev, 6),
            'min_val': round(min_val, 6), 'max_val': round(max_val, 6),
            'cpu': round(cpu, 6) if cpu is not None else None,
            'cpl': round(cpl, 6) if cpl is not None else None,
            'cpk': round(cpk, 6) if cpk is not None else None}


def _calc_hist_edges(filtered_all, ll, ul):
    NUM_BINS = 50
    if len(filtered_all) > 1:
        gmin = float(np.min(filtered_all))
        gmax = float(np.max(filtered_all))
        if gmin == gmax:
            center = gmin
            half = abs(center) * 0.5 if center != 0 else 0.5
            gmin = center - half
            gmax = center + half
            _, edges = np.histogram(filtered_all, bins=NUM_BINS, range=(gmin, gmax))
            return edges, False, None, None
        elif ll is not None and ul is not None and ll != ul and (gmin < ll or gmax > ul):
            exceeds = True
            n_below, n_mid, n_above = 10, 30, 10
            ll_bin_idx = n_below
            ul_bin_idx = n_below + n_mid
            left_bound = min(gmin, ll)
            left_margin = (ul - ll) * 0.03
            left_bound = left_bound - left_margin
            right_bound = max(gmax, ul)
            right_margin = (ul - ll) * 0.03
            right_bound = right_bound + right_margin
            edges_below = np.linspace(left_bound, ll, n_below + 1)
            edges_mid = np.linspace(ll, ul, n_mid + 1)
            edges_above = np.linspace(ul, right_bound, n_above + 1)
            edges = np.concatenate([edges_below, edges_mid[1:], edges_above[1:]])
            return edges, True, ll_bin_idx, ul_bin_idx
        else:
            _, edges = np.histogram(filtered_all, bins=NUM_BINS, range=(gmin, gmax))
            return edges, False, None, None
    else:
        edges = np.linspace(0, 1, NUM_BINS + 1)
        return edges, False, None, None


def _calc_hist_x_range(data_min, data_max, ll, ul, edges_min=None, edges_max=None):
    has_ll = ll is not None
    has_ul = ul is not None
    has_both = has_ll and has_ul
    if data_min == data_max and (not has_both or ll == ul):
        center = data_min
        half = abs(center) * 0.5 if center != 0 else 0.5
        x_min, x_max = center - half, center + half
        return {'x_min': x_min, 'x_max': x_max, 'ticks': np.linspace(x_min, x_max, 11)}
    if has_both and ll == ul:
        range_min = edges_min if edges_min is not None else data_min
        range_max = edges_max if edges_max is not None else data_max
        padding = (range_max - range_min) * 0.05 or abs(range_max) * 0.01 or 0.1
        x_min, x_max = range_min - padding, range_max + padding
        return {'x_min': x_min, 'x_max': x_max, 'ticks': np.linspace(x_min, x_max, 11)}
    if has_both:
        eff_min = edges_min if edges_min is not None else data_min
        eff_max = edges_max if edges_max is not None else data_max
        data_exceeds = eff_min < ll or eff_max > ul
        if not data_exceeds:
            limit_range = ul - ll
            total_range = limit_range / 0.8
            x_min = ll - total_range * 0.1
            x_max = ul + total_range * 0.1
            return {'x_min': x_min, 'x_max': x_max, 'ticks': np.linspace(x_min, x_max, 11)}
        else:
            limit_range = ul - ll
            total_range = limit_range / 0.6
            center = (ll + ul) / 2
            x_min = center - total_range / 2
            x_max = center + total_range / 2
            if eff_min < x_min:
                x_min = eff_min - (limit_range * 0.05 if eff_min == ll else (ll - eff_min) * 0.1)
            if eff_max > x_max:
                x_max = eff_max + (limit_range * 0.05 if eff_max == ul else (eff_max - ul) * 0.1)
            return {'x_min': x_min, 'x_max': x_max, 'ticks': np.linspace(x_min, x_max, 11)}
    # no limits
    pad = (data_max - data_min) * 0.05 or 0.1
    x_min, x_max = data_min - pad, data_max + pad
    return {'x_min': x_min, 'x_max': x_max, 'ticks': np.linspace(x_min, x_max, 11)}


def _draw_stats_line(ax_obj, y_pos, items_groups):
    for idx, group in enumerate(items_groups):
        line_text = "   ".join([f"{k}{v}" for k, v in group])
        current_y = y_pos - (idx * 0.05)
        ax_obj.text(0.5, current_y, line_text, transform=ax_obj.transAxes,
                    color='#000000', fontweight='bold', fontsize=8, ha='center')


def _hist_worker_init(parquet_path, needed_cols, items_data, site_mode, lot_label, filter_type, sigma):
    """Initializer: read parquet (column-selective) + create reusable figure."""
    g = {}
    g['df'] = pd.read_parquet(parquet_path, columns=needed_cols)
    g['items'] = items_data
    g['site_mode'] = site_mode
    g['lot_label'] = lot_label
    g['filter_type'] = filter_type
    g['sigma'] = sigma
    g['fig'], g['ax'] = plt.subplots(figsize=(5.47, 4.5))
    _G.clear()
    _G.update(g)


def _render_hist_png(idx):
    """Render one histogram, return (idx, png_bytes) or (idx, None)."""
    df = _G['df']
    ax = _G['ax']
    fig = _G['fig']
    item = _G['items'][idx]
    p_name = item['item_name']
    p_num = item['item_number']
    if p_name not in df.columns:
        return (idx, None)
    ll = item.get('lower_limit')
    ul = item.get('upper_limit')
    unit = item.get('unit') or ''
    vals = df[p_name].dropna().values.astype(float)
    if len(vals) == 0:
        return (idx, None)
    filter_type = _G['filter_type']
    sigma = _G['sigma']
    site_mode = _G['site_mode']
    lot_label = _G['lot_label']
    filtered_all = _apply_filter(vals, filter_type, ll, ul, sigma)
    if len(filtered_all) == 0:
        return (idx, None)
    edges, exceeds_limit, ll_bin_idx, ul_bin_idx = _calc_hist_edges(filtered_all, ll, ul)
    sites_data = []
    if site_mode == 'lot':
        counts, _ = np.histogram(filtered_all, bins=edges)
        sites_data.append({'site': 0, 'counts': counts, 'label': lot_label})
    else:
        if 'SITE_NUM' in df.columns:
            site_groups = df.dropna(subset=[p_name]).groupby('SITE_NUM')
            for site_num, site_df in site_groups:
                if site_num == 0:
                    continue
                site_vals = site_df[p_name].values.astype(float)
                site_filtered = _apply_filter(site_vals, filter_type, ll, ul, sigma)
                if len(site_filtered) > 0:
                    counts, _ = np.histogram(site_filtered, bins=edges)
                    sites_data.append({'site': int(site_num), 'counts': counts, 'label': f"S{int(site_num)}"})
        if not sites_data:
            counts, _ = np.histogram(filtered_all, bins=edges)
            sites_data.append({'site': 0, 'counts': counts, 'label': lot_label})

    ax.clear()
    ax.set_axisbelow(True)
    ax.yaxis.grid(True, linestyle='--', alpha=0.5, zorder=0)
    s0_stats = _calc_param_stats(filtered_all, ll, ul, len(filtered_all))
    data_min, data_max = float(np.min(filtered_all)), float(np.max(filtered_all))
    edges_min, edges_max = float(edges[0]), float(edges[-1])
    x_range_info = _calc_hist_x_range(data_min, data_max, ll, ul, edges_min, edges_max)
    x_min, x_max = x_range_info['x_min'], x_range_info['x_max']

    if exceeds_limit:
        max_count = np.max([np.max(s['counts']) for s in sites_data]) if sites_data else 1
        min_h = max_count * 0.02
        outlier_h = max_count * 0.05
        for sidx, s in enumerate(sites_data):
            color = SITE_COLORS[sidx % len(SITE_COLORS)]
            sigma_l = s0_stats['mean'] - 6 * s0_stats['stdev'] if s0_stats.get('mean') is not None and s0_stats.get('stdev') is not None else None
            sigma_u = s0_stats['mean'] + 6 * s0_stats['stdev'] if s0_stats.get('mean') is not None and s0_stats.get('stdev') is not None else None
            final_normal, final_outlier = [], []
            for i_bin, cnt in enumerate(s['counts']):
                center = (edges[i_bin] + edges[i_bin + 1]) / 2
                is_outlier_type = sigma_l is not None and (center < sigma_l or center > sigma_u) and 0 < cnt < 5
                if is_outlier_type:
                    final_normal.append(0); final_outlier.append(max(cnt, outlier_h))
                elif cnt > 0:
                    val = max(cnt, min_h) if cnt < 5 else cnt
                    final_normal.append(val); final_outlier.append(0)
                else:
                    final_normal.append(0); final_outlier.append(0)
            bar_w = 0.9
            ax.bar(range(len(final_normal)), final_normal, width=bar_w, alpha=0.7, color=color, label=s['label'], zorder=3, edgecolor='none')
            if any(v > 0 for v in final_outlier):
                ax.bar(range(len(final_outlier)), final_outlier, width=bar_w, alpha=0.8, color=color, zorder=4, edgecolor='none')
        if ll_bin_idx is not None:
            ax.axvline(ll_bin_idx, color='red', linestyle='--', linewidth=1.5, zorder=4)
            ax.text(ll_bin_idx, ax.get_ylim()[1] * 0.5, f'LL:{ll}', color='red', fontsize=7, ha='left', va='center')
        if ul_bin_idx is not None:
            ax.axvline(ul_bin_idx, color='red', linestyle='--', linewidth=1.5, zorder=4)
            ax.text(ul_bin_idx, ax.get_ylim()[1] * 0.5, f'UL:{ul}', color='red', fontsize=7, ha='right', va='center')
        tick_indices = np.linspace(0, len(edges) - 2, 11).astype(int)
        ax.set_xticks(tick_indices)
        ax.set_xticklabels([f"{edges[t]:.3f}" for t in tick_indices], rotation=30)
    else:
        bin_centers = (edges[:-1] + edges[1:]) / 2
        bin_w = edges[1] - edges[0] if len(edges) > 1 else 1
        max_count = np.max([np.max(s['counts']) for s in sites_data]) if sites_data else 1
        min_h = max_count * 0.02
        outlier_h = max_count * 0.05
        for sidx, s in enumerate(sites_data):
            color = SITE_COLORS[sidx % len(SITE_COLORS)]
            sigma_l = s0_stats['mean'] - 6 * s0_stats['stdev'] if s0_stats.get('mean') is not None and s0_stats.get('stdev') is not None else None
            sigma_u = s0_stats['mean'] + 6 * s0_stats['stdev'] if s0_stats.get('mean') is not None and s0_stats.get('stdev') is not None else None
            final_normal, final_outlier = [], []
            for i_bin, cnt in enumerate(s['counts']):
                center = (edges[i_bin] + edges[i_bin + 1]) / 2
                is_outlier_type = sigma_l is not None and (center < sigma_l or center > sigma_u) and 0 < cnt < 5
                if is_outlier_type:
                    final_normal.append(0); final_outlier.append(max(cnt, outlier_h))
                elif cnt > 0:
                    val = max(cnt, min_h) if cnt < 5 else cnt
                    final_normal.append(val); final_outlier.append(0)
                else:
                    final_normal.append(0); final_outlier.append(0)
            bar_w = max(bin_w * 0.9, (x_max - x_min) * 0.015)
            ax.bar(bin_centers, final_normal, width=bar_w, alpha=0.7, color=color, label=s['label'], zorder=3, edgecolor='none')
            if any(v > 0 for v in final_outlier):
                ax.bar(bin_centers, final_outlier, width=bar_w, alpha=0.8, color=color, zorder=4, edgecolor='none')
        ax.set_xlim(x_min, x_max)
        if ll is not None:
            ax.axvline(ll, color='red', linestyle='--', linewidth=1.5, zorder=4)
            ax.text(ll, ax.get_ylim()[1] * 0.5, f'LL:{ll}', color='red', fontsize=7, ha='left', va='center')
        if ul is not None:
            ax.axvline(ul, color='red', linestyle='--', linewidth=1.5, zorder=4)
            ax.text(ul, ax.get_ylim()[1] * 0.5, f'UL:{ul}', color='red', fontsize=7, ha='right', va='center')
        ax.set_xticks(x_range_info['ticks'])
        ax.xaxis.set_major_formatter(plt.FormatStrFormatter('%.3f'))
        ax.tick_params(axis='x', rotation=30)

    if filter_type == 'filter_by_sigma':
        sigma_val = float(sigma) if sigma else 3.0
        sigma_l, sigma_u = s0_stats['mean'] - sigma_val * s0_stats['stdev'], s0_stats['mean'] + sigma_val * s0_stats['stdev']
        if exceeds_limit:
            def find_bin(val):
                for b_i in range(len(edges) - 1):
                    if edges[b_i] <= val <= edges[b_i + 1]:
                        return b_i
                return 0 if val < edges[0] else len(edges) - 2
            ax.axvline(find_bin(sigma_l), color='#00c853', linestyle='--', linewidth=1, zorder=4)
            ax.axvline(find_bin(sigma_u), color='#00c853', linestyle='--', linewidth=1, zorder=4)
        else:
            ax.axvline(sigma_l, color='#00c853', linestyle='--', linewidth=1, zorder=4)
            ax.axvline(sigma_u, color='#00c853', linestyle='--', linewidth=1, zorder=4)

    ax.set_title(f"{p_num}.{p_name}", fontsize=12, fontweight='bold', color='black', pad=32)
    cpk_val = s0_stats['cpk'] if s0_stats['cpk'] is not None else 0
    stats_info = [("Min=", f"{s0_stats['min_val']:.4f}"),
                  ("Max=", f"{s0_stats['max_val']:.4f}"),
                  ("Mean=", f"{s0_stats['mean']:.4f}"),
                  ("Stdev=", f"{s0_stats['stdev']:.4f}"),
                  ("CPK=", f"{cpk_val:.4f}")]
    _draw_stats_line(ax, 1.05, [stats_info])
    ax.set_ylabel("Parts", fontsize=8)
    ax.set_xlabel(unit, fontsize=12, fontweight='bold', color='black')
    ax.tick_params(labelsize=7)
    _draw_site_legend(ax, sites_data, SITE_COLORS)
    fig.tight_layout()
    img_data = io.BytesIO()
    fig.savefig(img_data, format='png', dpi=100, bbox_inches='tight')
    img_data.seek(0)
    return (idx, img_data.getvalue())
