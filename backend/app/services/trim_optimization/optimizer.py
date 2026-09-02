"""
Trim Shift Optimizer Module
Generates candidate shifts, calculates yield and CPK predictions, ranks candidates,
evaluates risk levels, and provides engineering recommendations.
"""

from typing import Dict, Any, Optional, List
import pandas as pd
import numpy as np

from .validation import validate_trim_data
from .statistics import calculate_current_statistics
from .step import calculate_trim_step
from .model import predict_measurement, check_code_boundary


def optimize_trim(
    df: pd.DataFrame,
    measurement_col: str,
    trim_code_col: Optional[str] = None,
    pre_col: Optional[str] = None,
    post_col: Optional[str] = None,
    post_bit_col: Optional[str] = None,
    target: Optional[float] = None,
    lsl: Optional[float] = None,
    usl: Optional[float] = None,
    trim_min: int = 0,
    trim_max: int = 31,
    search_range: int = 3,
    min_samples: int = 30,
    recommended_samples: int = 100,
    yield_improvement_recommended: float = 0.01,
    yield_improvement_optional: float = 0.002,
) -> Dict[str, Any]:
    """
    Execute full end-to-end Trim Optimization analysis.
    """
    # 1. Validation
    val_res = validate_trim_data(
        df=df,
        measurement_col=measurement_col,
        trim_code_col=trim_code_col,
        target=target,
        lsl=lsl,
        usl=usl,
        trim_min=trim_min,
        trim_max=trim_max,
        min_samples=min_samples,
        recommended_samples=recommended_samples,
    )

    if not val_res["valid"]:
        return {
            "status": "error",
            "validation": val_res,
            "errors": val_res["errors"],
            "warnings": val_res["warnings"],
        }

    # Extract clean measurements
    meas_data = df[measurement_col]
    if isinstance(meas_data, pd.DataFrame):
        meas_data = meas_data.iloc[:, 0]
    valid_mask = meas_data.notna() & np.isfinite(pd.to_numeric(meas_data, errors="coerce"))
    clean_df = df[valid_mask].copy()
    c_meas = clean_df[measurement_col]
    if isinstance(c_meas, pd.DataFrame):
        c_meas = c_meas.iloc[:, 0]
    measurements = c_meas.values.astype(float)

    # Extract codes if available
    codes = None
    if trim_code_col and trim_code_col in clean_df.columns:
        codes = pd.to_numeric(clean_df[trim_code_col], errors="coerce").fillna(0).values.astype(float)
    elif post_bit_col and post_bit_col in clean_df.columns:
        codes = pd.to_numeric(clean_df[post_bit_col], errors="coerce").fillna(0).values.astype(float)

    # Auto-align trim_max if data is clearly a 4-bit trim (max code 12~15) and trim_max was default 31
    if codes is not None and len(codes) > 0:
        valid_codes = codes[np.isfinite(codes)]
        if len(valid_codes) > 0:
            data_max_code = int(np.max(valid_codes))
            if trim_max == 31 and 12 <= data_max_code <= 15:
                trim_max = data_max_code

    # 2. Current Statistics
    curr_stats = calculate_current_statistics(measurements, target=target, lsl=lsl, usl=usl)
    current_mean = curr_stats["mean"]
    current_stdev = curr_stats["stdev"]
    current_yield = curr_stats["yield"]
    current_cpk = curr_stats["cpk"]

    # 3. Trim Step Analysis
    step_res = calculate_trim_step(
        df=clean_df,
        measurement_col=measurement_col,
        trim_code_col=trim_code_col,
        pre_col=pre_col,
        post_col=post_col,
        post_bit_col=post_bit_col,
    )

    step_val = abs(step_res["step"])
    direction = step_res["direction"]
    effective_step = step_val * direction

    # 4. Theoretical Shift
    if target is not None and abs(effective_step) > 1e-12 and current_mean is not None:
        raw_shift = (target - current_mean) / effective_step
        theoretical_shift = float(raw_shift)
        center_shift = int(round(raw_shift))
    else:
        theoretical_shift = 0.0
        center_shift = 0

    # 5. Candidate Shifts Generation
    candidate_shifts_set = set(range(center_shift - search_range, center_shift + search_range + 1))
    candidate_shifts_set.add(0)  # Always include baseline (Shift = 0)
    candidate_shifts = sorted(list(candidate_shifts_set))

    candidates: List[Dict[str, Any]] = []

    for s in candidate_shifts:
        pred_vals = predict_measurement(measurements, shift=s, step=step_val, direction=direction)
        pred_stats = calculate_current_statistics(pred_vals, target=target, lsl=lsl, usl=usl)
        bound_res = check_code_boundary(codes, shift=s, trim_min=trim_min, trim_max=trim_max)

        pred_mean = pred_stats["mean"]
        target_error = abs(pred_mean - target) if (target is not None and pred_mean is not None) else 0.0

        candidates.append({
            "shift": int(s),
            "predicted_mean": pred_mean,
            "predicted_stdev": current_stdev,  # Local linear assumption
            "predicted_yield": pred_stats["yield"],
            "predicted_cpk": pred_stats["cpk"],
            "lsl_fail": pred_stats["lsl_fail"],
            "usl_fail": pred_stats["usl_fail"],
            "total_fail": pred_stats["fail_count"],
            "code_min": bound_res["code_min"],
            "code_max": bound_res["code_max"],
            "lower_margin": bound_res["lower_margin"],
            "upper_margin": bound_res["upper_margin"],
            "min_margin": bound_res["min_margin"],
            "boundary_risk": bound_res["boundary_risk"],
            "valid": bound_res["valid"],
            "target_error": target_error,
            "is_baseline": (s == 0),
        })

    # 6. Rank Candidates to Select Best Shift
    # Valid candidates first, then Yield DESC, Target Error ASC (align to target),
    # CPK DESC, Margin DESC, |Shift| ASC
    def rank_key(c: Dict[str, Any]):
        return (
            1 if c["valid"] else 0,
            c["predicted_yield"] if c["predicted_yield"] is not None else -1.0,
            -c["target_error"],
            c["predicted_cpk"] if c["predicted_cpk"] is not None else -999.0,
            c["min_margin"],
            -abs(c["shift"]),
        )

    ranked_candidates = sorted(candidates, key=rank_key, reverse=True)
    best_candidate = ranked_candidates[0] if ranked_candidates else candidates[0]

    # Tag candidate status
    for c in candidates:
        if c["shift"] == best_candidate["shift"]:
            c["status"] = "Best"
        elif not c["valid"]:
            c["status"] = "Invalid_OutOfBounds"
        elif c["boundary_risk"] == "HIGH_RISK_AT_BOUNDARY":
            c["status"] = "HighRisk_Boundary"
        else:
            c["status"] = "Valid"

    # 7. Yield & CPK Improvement
    opt_yield = best_candidate["predicted_yield"]
    yield_improvement = float(opt_yield - current_yield) if (opt_yield is not None and current_yield is not None) else 0.0

    opt_cpk = best_candidate["predicted_cpk"]
    cpk_improvement = float(opt_cpk - current_cpk) if (opt_cpk is not None and current_cpk is not None) else None

    # 8. Recommendation Status
    if best_candidate["shift"] == 0 or yield_improvement < yield_improvement_optional:
        recommendation_status = "NO_SIGNIFICANT_IMPROVEMENT"
    elif yield_improvement >= yield_improvement_recommended:
        recommendation_status = "RECOMMENDED"
    else:
        recommendation_status = "OPTIONAL"

    # 9. Comprehensive Risk Evaluation
    step_cv = step_res.get("step_cv", 0.0)
    r2 = step_res.get("r_squared", 1.0)
    min_margin = best_candidate.get("min_margin", 0)

    if not best_candidate["valid"] or min_margin < 1 or step_cv > 0.20 or r2 < 0.90:
        risk_level = "HIGH"
    elif min_margin < 3 or step_cv > 0.10 or r2 < 0.95:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    # 10. Natural Language Engineering Recommendation
    sign_str = f"+{best_candidate['shift']}" if best_candidate["shift"] > 0 else str(best_candidate["shift"])
    opt_mean_str = f"{best_candidate['predicted_mean']:.4f}" if best_candidate['predicted_mean'] is not None else "-"
    opt_cpk_str = f"{opt_cpk:.3f}" if opt_cpk is not None else "-"
    curr_cpk_str = f"{current_cpk:.3f}" if current_cpk is not None else "-"

    rec_text = (
        f"Recommendation: Shift Trim parameter by {sign_str} Code(s).\n"
        f"Expected Mean: {opt_mean_str}, "
        f"Expected Yield: {opt_yield * 100:.2f}% (Improvement: {yield_improvement * 100:+.2f}%).\n"
        f"Expected CPK: {opt_cpk_str} (Current: {curr_cpk_str}).\n"
        f"Trim Boundary Margin: {min_margin} Steps remaining. Risk Assessment: {risk_level}.\n"
        f"Note: This is an engineering recommendation. Validation is required before production release."
    )

    # 11. Pre-trim Decision Windows & Thresholds
    pre_meas = None
    if pre_col and pre_col in clean_df.columns:
        p_data = clean_df[pre_col]
        if isinstance(p_data, pd.DataFrame):
            p_data = p_data.iloc[:, 0]
        pre_meas = pd.to_numeric(p_data, errors="coerce").dropna().values.astype(float)
    elif len(measurements) > 0 and codes is not None:
        pre_meas = measurements - codes * step_val * direction

    pre_trim_windows = calculate_pre_trim_windows(
        target=target,
        step_val=step_val,
        direction=direction,
        trim_min=trim_min,
        trim_max=trim_max,
        recommended_shift=best_candidate["shift"],
        pre_values=pre_meas,
        code_deltas=step_res.get("code_deltas"),
    )

    return {
        "status": "success",
        "validation": val_res,
        "current_statistics": curr_stats,
        "step_analysis": step_res,
        "theoretical_shift": theoretical_shift,
        "recommended_shift": best_candidate["shift"],
        "yield_improvement": yield_improvement,
        "cpk_improvement": cpk_improvement,
        "recommendation_status": recommendation_status,
        "risk_level": risk_level,
        "recommendation_text": rec_text,
        "best_candidate": best_candidate,
        "candidates": candidates,
        "pre_trim_windows": pre_trim_windows,
        "before_after": {
            "current": {
                "mean": current_mean,
                "stdev": current_stdev,
                "yield": current_yield,
                "cpk": current_cpk,
                "lsl_fail": curr_stats["lsl_fail"],
                "usl_fail": curr_stats["usl_fail"],
                "total_fail": curr_stats["fail_count"],
            },
            "optimized": {
                "shift": best_candidate["shift"],
                "mean": best_candidate["predicted_mean"],
                "stdev": best_candidate["predicted_stdev"],
                "yield": best_candidate["predicted_yield"],
                "cpk": best_candidate["predicted_cpk"],
                "lsl_fail": best_candidate["lsl_fail"],
                "usl_fail": best_candidate["usl_fail"],
                "total_fail": best_candidate["total_fail"],
            },
            "delta": {
                "yield": yield_improvement,
                "cpk": cpk_improvement,
                "mean": (best_candidate["predicted_mean"] - current_mean) if (best_candidate["predicted_mean"] is not None and current_mean is not None) else None,
                "fail_reduction": curr_stats["fail_count"] - best_candidate["total_fail"],
            },
        },
    }


def calculate_pre_trim_windows(
    target: Optional[float],
    step_val: float,
    direction: int,
    trim_min: int = 0,
    trim_max: int = 31,
    recommended_shift: int = 0,
    pre_values: Optional[np.ndarray] = None,
    code_deltas: Optional[Dict[int, float]] = None,
) -> List[Dict[str, Any]]:
    """
    Calculate Original vs Optimized Pre-trim decision windows and thresholds for each Code/Step
    using actual physical delta mapping (all_mean) and optimal target positioning.
    Steps not present in measured codes are left blank.
    """
    windows: List[Dict[str, Any]] = []
    if target is None or abs(step_val) < 1e-12:
        return windows

    total_dies = len(pre_values) if (pre_values is not None and len(pre_values) > 0) else 0

    # Determine active codes present in measured data
    if code_deltas and len(code_deltas) > 0:
        active_codes = sorted([int(c) for c in code_deltas.keys()])
        min_code = min(trim_min, min(active_codes))
        max_code = max(trim_min, max(active_codes))
        all_codes = list(range(min_code, max_code + 1))
    else:
        active_codes = list(range(trim_min, trim_max + 1))
        all_codes = active_codes

    def get_delta(c: int) -> float:
        if code_deltas and c in code_deltas:
            return code_deltas[c]
        return c * step_val * direction

    # 1. Original Pre Windows (Target = target) for active codes only
    items_orig = [{"code": c, "nominal": target - get_delta(c)} for c in active_codes]
    sorted_orig = sorted(items_orig, key=lambda x: x["nominal"])
    for i in range(len(sorted_orig)):
        low = None if i == 0 else (sorted_orig[i - 1]["nominal"] + sorted_orig[i]["nominal"]) / 2.0
        high = None if i == len(sorted_orig) - 1 else (sorted_orig[i]["nominal"] + sorted_orig[i + 1]["nominal"]) / 2.0
        sorted_orig[i]["low"] = low
        sorted_orig[i]["high"] = high
        if low is not None and high is not None:
            sorted_orig[i]["range_str"] = f"[{low:.4f}, {high:.4f}]"
        elif low is None and high is not None:
            sorted_orig[i]["range_str"] = f"<= {high:.4f}"
        else:
            sorted_orig[i]["range_str"] = f"> {low:.4f}"
    map_orig = {it["code"]: it for it in sorted_orig}

    # 2. Optimized Pre Windows for active codes only
    opt_target = target + (recommended_shift * step_val * direction)
    items_opt = [{"code": c, "nominal": opt_target - get_delta(c)} for c in active_codes]
    sorted_opt = sorted(items_opt, key=lambda x: x["nominal"])
    for i in range(len(sorted_opt)):
        low = None if i == 0 else (sorted_opt[i - 1]["nominal"] + sorted_opt[i]["nominal"]) / 2.0
        high = None if i == len(sorted_opt) - 1 else (sorted_opt[i]["nominal"] + sorted_opt[i + 1]["nominal"]) / 2.0
        sorted_opt[i]["low"] = low
        sorted_opt[i]["high"] = high
        if low is not None and high is not None:
            sorted_opt[i]["range_str"] = f"[{low:.4f}, {high:.4f}]"
        elif low is None and high is not None:
            sorted_opt[i]["range_str"] = f"<= {high:.4f}"
        else:
            sorted_opt[i]["range_str"] = f"> {low:.4f}"
    map_opt = {it["code"]: it for it in sorted_opt}

    active_set = set(active_codes)
    min_active = sorted_opt[0]["code"] if sorted_opt else None
    max_active = sorted_opt[-1]["code"] if sorted_opt else None

    # 3. Assemble full result for all codes from min_code to max_code in numerical order
    for code in all_codes:
        if code not in active_set:
            windows.append({
                "step": code,
                "delta": None,
                "delta_str": "-",
                "orig_pre_nominal": None,
                "orig_pre_low": None,
                "orig_pre_high": None,
                "orig_pre_range_str": "-",
                "opt_pre_nominal": None,
                "opt_pre_low": None,
                "opt_pre_high": None,
                "opt_pre_range_str": "-",
                "range_width": None,
                "range_width_str": "-",
                "expected_post": None,
                "die_count": 0,
                "die_ratio": 0.0,
                "boundary_status": "UNUSED",
            })
            continue

        o = map_orig[code]
        op = map_opt[code]
        delta_val = get_delta(code)

        die_count = 0
        die_ratio = 0.0
        expected_post_val = None
        if total_dies > 0 and pre_values is not None:
            if op["low"] is None and op["high"] is not None:
                mask = pre_values <= op["high"]
            elif op["high"] is None and op["low"] is not None:
                mask = pre_values > op["low"]
            elif op["low"] is not None and op["high"] is not None:
                mask = (pre_values > op["low"]) & (pre_values <= op["high"])
            else:
                mask = np.zeros(len(pre_values), dtype=bool)
            die_count = int(np.sum(mask))
            die_ratio = float(die_count / total_dies)

            step_dies = pre_values[mask]
            if len(step_dies) > 0:
                die_pre_mean = float(np.mean(step_dies))
                expected_post_val = round(die_pre_mean + delta_val, 6)
            else:
                expected_post_val = None

        if code == min_active:
            boundary_status = "MIN_BOUNDARY"
        elif code == max_active:
            boundary_status = "MAX_BOUNDARY"
        elif die_count > 0:
            boundary_status = "ACTIVE"
        else:
            boundary_status = "NORMAL"

        range_width = (op["high"] - op["low"]) if (op["low"] is not None and op["high"] is not None) else None

        windows.append({
            "step": code,
            "delta": round(delta_val, 6),
            "delta_str": f"{delta_val * 1000:+.2f} mV" if abs(delta_val) < 1.0 else f"{delta_val:+.4f}",
            "orig_pre_nominal": round(o["nominal"], 6),
            "orig_pre_low": round(o["low"], 6) if o["low"] is not None else None,
            "orig_pre_high": round(o["high"], 6) if o["high"] is not None else None,
            "orig_pre_range_str": o["range_str"],
            "opt_pre_nominal": round(op["nominal"], 6),
            "opt_pre_low": round(op["low"], 6) if op["low"] is not None else None,
            "opt_pre_high": round(op["high"], 6) if op["high"] is not None else None,
            "opt_pre_range_str": op["range_str"],
            "range_width": round(range_width, 6) if range_width is not None else None,
            "range_width_str": f"{range_width * 1000:.1f} mV" if range_width is not None else "-",
            "expected_post": expected_post_val,
            "die_count": die_count,
            "die_ratio": round(die_ratio, 4),
            "boundary_status": boundary_status,
        })

    return windows
