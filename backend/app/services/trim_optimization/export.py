"""
Trim Optimization Excel Export Module
Exports comprehensive multi-sheet Excel reports (Summary, Statistics, Step, Candidates, Before/After, Wafer Results).
"""

import io
from typing import Dict, Any
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter


def export_trim_optimization_excel(result_data: Dict[str, Any]) -> io.BytesIO:
    """
    Generate standard 6-Sheet Trim Optimization Excel Report.
    """
    wb = openpyxl.Workbook()
    # Remove default sheet
    wb.remove(wb.active)

    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    best_fill = PatternFill(start_color="E2EFDA", end_color="E2EFDA", fill_type="solid")
    thin_border = Border(
        left=Side(style="thin", color="D9D9D9"),
        right=Side(style="thin", color="D9D9D9"),
        top=Side(style="thin", color="D9D9D9"),
        bottom=Side(style="thin", color="D9D9D9"),
    )
    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")

    meta = result_data.get("meta", {})
    curr = result_data.get("current_statistics", {})
    step = result_data.get("step_analysis", {})
    best = result_data.get("best_candidate", {})
    ba = result_data.get("before_after", {})

    # ── Sheet 1: Summary ──
    ws_summary = wb.create_sheet(title="Summary")
    ws_summary.append(["Trim Optimization Summary Report"])
    ws_summary.merge_cells("A1:D1")
    ws_summary["A1"].font = Font(name="Calibri", size=14, bold=True, color="1F497D")

    summary_rows = [
        ["Parameter", meta.get("param_name", "-")],
        ["Pre Parameter", meta.get("pre_param", "-")],
        ["Post Parameter", meta.get("post_param", "-")],
        ["Target", meta.get("target", "-")],
        ["LSL", meta.get("lsl", "-")],
        ["USL", meta.get("usl", "-")],
        ["", ""],
        ["Current Mean", curr.get("mean", "-")],
        ["Current Stdev", curr.get("stdev", "-")],
        ["Current Yield", f"{curr.get('yield', 0) * 100:.2f}%" if curr.get("yield") is not None else "-"],
        ["Current CPK", curr.get("cpk", "-")],
        ["", ""],
        ["Estimated Step", step.get("step", "-")],
        ["Direction", "+1 (Positive)" if step.get("direction") == 1 else "-1 (Negative)"],
        ["Step Stability (CV)", f"{step.get('step_cv', 0) * 100:.2f}% ({step.get('stability', '-')})"],
        ["Linearity (R2)", f"{step.get('r_squared', 0):.4f} ({step.get('linearity', '-')})"],
        ["", ""],
        ["Theoretical Shift", f"{result_data.get('theoretical_shift', 0):.2f} Steps"],
        ["Recommended Shift", f"{result_data.get('recommended_shift', 0):+d} Steps"],
        ["Predicted Yield", f"{best.get('predicted_yield', 0) * 100:.2f}%" if best.get("predicted_yield") is not None else "-"],
        ["Yield Improvement", f"{result_data.get('yield_improvement', 0) * 100:+.2f}%"],
        ["Predicted CPK", best.get("predicted_cpk", "-")],
        ["Risk Assessment", result_data.get("risk_level", "-")],
        ["Recommendation Status", result_data.get("recommendation_status", "-")],
    ]

    for row in summary_rows:
        ws_summary.append(row)

    # ── Sheet 2: Candidate Shifts ──
    ws_cand = wb.create_sheet(title="Candidate Shifts")
    cand_headers = [
        "Shift", "Predicted Mean", "Predicted Stdev", "Predicted Yield",
        "Predicted CPK", "LSL Fail", "USL Fail", "Total Fail",
        "Code Min", "Code Max", "Min Margin", "Boundary Risk", "Status"
    ]
    ws_cand.append(cand_headers)
    for col_idx in range(1, len(cand_headers) + 1):
        cell = ws_cand.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = align_center

    for c in result_data.get("candidates", []):
        r_vals = [
            f"{c['shift']:+d}",
            round(c["predicted_mean"], 4) if c["predicted_mean"] is not None else "-",
            round(c["predicted_stdev"], 4) if c["predicted_stdev"] is not None else "-",
            f"{c['predicted_yield'] * 100:.2f}%" if c["predicted_yield"] is not None else "-",
            round(c["predicted_cpk"], 3) if c["predicted_cpk"] is not None else "-",
            c["lsl_fail"],
            c["usl_fail"],
            c["total_fail"],
            c["code_min"],
            c["code_max"],
            c["min_margin"],
            c["boundary_risk"],
            c["status"],
        ]
        ws_cand.append(r_vals)
        if c.get("status") == "Best":
            row_num = ws_cand.max_row
            for col_idx in range(1, len(cand_headers) + 1):
                ws_cand.cell(row=row_num, column=col_idx).fill = best_fill

    # ── Sheet 3: Before & After ──
    ws_ba = wb.create_sheet(title="Before After")
    ba_headers = ["Metric", "Current Condition", "Optimized Condition (Best Shift)", "Delta"]
    ws_ba.append(ba_headers)
    for col_idx in range(1, len(ba_headers) + 1):
        cell = ws_ba.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = align_center

    c_ba = ba.get("current", {})
    o_ba = ba.get("optimized", {})
    d_ba = ba.get("delta", {})

    ba_rows = [
        ["Shift", "0", f"{o_ba.get('shift', 0):+d}", f"{o_ba.get('shift', 0):+d}"],
        ["Mean", round(c_ba.get("mean", 0), 4) if c_ba.get("mean") is not None else "-", round(o_ba.get("mean", 0), 4) if o_ba.get("mean") is not None else "-", f"{d_ba.get('mean', 0):+.4f}" if d_ba.get("mean") is not None else "-"],
        ["Stdev", round(c_ba.get("stdev", 0), 4) if c_ba.get("stdev") is not None else "-", round(o_ba.get("stdev", 0), 4) if o_ba.get("stdev") is not None else "-", "0.0000"],
        ["Yield", f"{c_ba.get('yield', 0) * 100:.2f}%" if c_ba.get("yield") is not None else "-", f"{o_ba.get('yield', 0) * 100:.2f}%" if o_ba.get("yield") is not None else "-", f"{d_ba.get('yield', 0) * 100:+.2f}%"],
        ["CPK", round(c_ba.get("cpk", 0), 3) if c_ba.get("cpk") is not None else "-", round(o_ba.get("cpk", 0), 3) if o_ba.get("cpk") is not None else "-", f"{d_ba.get('cpk', 0):+.3f}" if d_ba.get("cpk") is not None else "-"],
        ["LSL Fail", c_ba.get("lsl_fail", 0), o_ba.get("lsl_fail", 0), o_ba.get("lsl_fail", 0) - c_ba.get("lsl_fail", 0)],
        ["USL Fail", c_ba.get("usl_fail", 0), o_ba.get("usl_fail", 0), o_ba.get("usl_fail", 0) - c_ba.get("usl_fail", 0)],
        ["Total Failures", c_ba.get("total_fail", 0), o_ba.get("total_fail", 0), o_ba.get("total_fail", 0) - c_ba.get("total_fail", 0)],
    ]
    for r in ba_rows:
        ws_ba.append(r)

    # ── Sheet 4: Wafer Results (Sample Dies) ──
    wafer_dies = result_data.get("wafer_map", [])
    if wafer_dies:
        ws_w = wb.create_sheet(title="Wafer Dies")
        w_headers = ["X_COORD", "Y_COORD", "Original Value", "Predicted Value", "Current Pass", "Predicted Pass", "State"]
        ws_w.append(w_headers)
        for col_idx in range(1, len(w_headers) + 1):
            cell = ws_w.cell(row=1, column=col_idx)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = align_center

        for d in wafer_dies[:2000]:
            ws_w.append([
                d["x"], d["y"], round(d["raw_val"], 4), round(d["pred_val"], 4),
                "PASS" if d["curr_pass"] else "FAIL",
                "PASS" if d["pred_pass"] else "FAIL",
                d["state"].upper()
            ])

    # ── Sheet 5: Pre-Trim Decision Windows ──
    pre_windows = result_data.get("pre_trim_windows", [])
    if pre_windows:
        ws_pw = wb.create_sheet(title="Pre_Trim_Windows")
        pw_headers_row1 = [
            "Trim Step / Code",
            "Measured Delta (all_mean)",
            "Original Pre Nominal",
            "Original Pre Range",
            "",
            "Optimized Pre Nominal",
            "Optimized Pre Range",
            "",
            "Range Width",
            "Expected Post",
            "Die Count",
            "Die Ratio (%)",
            "Boundary Status",
        ]
        pw_headers_row2 = [
            "",
            "",
            "",
            "Low (L)",
            "High (H)",
            "",
            "Low (L)",
            "High (H)",
            "",
            "",
            "",
            "",
            "",
        ]
        ws_pw.append(pw_headers_row1)
        ws_pw.append(pw_headers_row2)

        ws_pw.merge_cells("D1:E1")
        ws_pw.merge_cells("G1:H1")

        for r_idx in [1, 2]:
            for col_idx in range(1, len(pw_headers_row1) + 1):
                cell = ws_pw.cell(row=r_idx, column=col_idx)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = align_center

        for w in pre_windows:
            if w.get("delta") is None:
                ws_pw.append([
                    f"Step {w.get('step', 0)}",
                    "-",
                    "-",
                    "-",
                    "-",
                    "-",
                    "-",
                    "-",
                    "-",
                    "-",
                    "-",
                    "-",
                    "-",
                ])
            else:
                orig_low = w.get("orig_pre_low")
                orig_high = w.get("orig_pre_high")
                opt_low = w.get("opt_pre_low")
                opt_high = w.get("opt_pre_high")
                ws_pw.append([
                    f"Step {w.get('step', 0)}",
                    w.get("delta_str", "-"),
                    w.get("orig_pre_nominal", "-"),
                    orig_low if orig_low is not None else "-",
                    orig_high if orig_high is not None else "-",
                    w.get("opt_pre_nominal", "-"),
                    opt_low if opt_low is not None else "-",
                    opt_high if opt_high is not None else "-",
                    w.get("range_width_str", "-"),
                    w.get("expected_post", "-"),
                    w.get("die_count", 0),
                    f"{w.get('die_ratio', 0) * 100:.2f}%",
                    w.get("boundary_status", "-"),
                ])

    # Auto-adjust column widths
    for sheet in wb.worksheets:
        for col in sheet.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            sheet.column_dimensions[col_letter].width = max(max_len + 3, 12)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output
