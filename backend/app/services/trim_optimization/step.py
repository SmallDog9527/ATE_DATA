"""
Trim Step Calculation and Linearity Analysis Module
Estimates Step size using robust median diffs, determines direction, stability CV, and R-squared linearity.
"""

from typing import Dict, Any, Optional, List, Tuple
import pandas as pd
import numpy as np
from scipy import stats


def calculate_trim_step(
    df: pd.DataFrame,
    measurement_col: str,
    trim_code_col: Optional[str] = None,
    pre_col: Optional[str] = None,
    post_col: Optional[str] = None,
    post_bit_col: Optional[str] = None,
    cv_good_threshold: float = 0.10,
    cv_warning_threshold: float = 0.20,
    r2_good_threshold: float = 0.95,
    r2_warning_threshold: float = 0.90,
) -> Dict[str, Any]:
    """
    Calculate robust Trim Step, Direction (+1 or -1), Stability CV, and Linearity (R^2).
    """
    # 1. Sweep step data with Pre & Post columns (True Physical Trim Mode)
    code_col = post_bit_col if (post_bit_col and post_bit_col in df.columns) else (trim_code_col if (trim_code_col and trim_code_col in df.columns) else None)
    if pre_col and post_col and pre_col in df.columns and post_col in df.columns:
        valid_df = df.dropna(subset=[pre_col, post_col]).copy()
        valid_df[pre_col] = pd.to_numeric(valid_df[pre_col], errors="coerce")
        valid_df[post_col] = pd.to_numeric(valid_df[post_col], errors="coerce")
        valid_df = valid_df.dropna(subset=[pre_col, post_col])
        valid_df["_delta"] = valid_df[post_col] - valid_df[pre_col]

        if code_col and code_col in valid_df.columns:
            valid_df[code_col] = pd.to_numeric(valid_df[code_col], errors="coerce")
            valid_df = valid_df.dropna(subset=[code_col])
            unique_codes = sorted(valid_df[code_col].unique())
            if len(unique_codes) >= 2:
                grouped = valid_df.groupby(code_col)["_delta"].median().sort_index()
                codes = grouped.index.to_numpy(dtype=float)
                values = grouped.values.astype(float)

                code_deltas = {int(c): float(v) for c, v in zip(codes, values)}

                d_code = np.diff(codes)
                d_val = np.diff(values)
                nz = d_code != 0
                if np.any(nz):
                    raw_steps = d_val[nz] / d_code[nz]
                    # Filter out possible polarity transition jump (e.g. between negative & positive trim banks)
                    med_raw = float(np.median(raw_steps))
                    if abs(med_raw) > 1e-6:
                        inliers = raw_steps[np.abs(raw_steps) <= 5.0 * abs(med_raw)]
                        steps = inliers if len(inliers) > 0 else raw_steps
                    else:
                        steps = raw_steps

                    step_median = float(np.median(steps))
                    step_mean = float(np.mean(steps))
                    step_std = float(np.std(steps, ddof=1)) if len(steps) > 1 else 0.0
                    step_cv = float(step_std / abs(step_mean)) if abs(step_mean) > 1e-12 else 0.0
                else:
                    step_median = 0.0
                    step_mean = 0.0
                    step_std = 0.0
                    step_cv = 0.0

                reg = stats.linregress(codes, values) if len(codes) >= 2 else None
                r_squared = float(reg.rvalue ** 2) if reg and np.isfinite(reg.rvalue) else 1.0
                slope = float(reg.slope) if reg else step_median
                intercept = float(reg.intercept) if reg else 0.0
                direction = 1 if step_median >= 0 else -1

                stability = "GOOD" if step_cv <= cv_good_threshold else ("WARNING" if step_cv <= cv_warning_threshold else "UNSTABLE")
                linearity = "GOOD" if r_squared >= r2_good_threshold else ("WARNING" if r_squared >= r2_warning_threshold else "NONLINEAR")

                return {
                    "step": step_median,
                    "signed_step": step_median,
                    "step_mean": step_mean,
                    "step_median": step_median,
                    "step_std": step_std,
                    "step_cv": step_cv,
                    "direction": direction,
                    "stability": stability,
                    "linearity": linearity,
                    "r_squared": r_squared,
                    "slope": slope,
                    "intercept": intercept,
                    "code_points": [[float(c), float(v)] for c, v in zip(codes, values)],
                    "code_deltas": code_deltas,
                    "method": "delta_sweep_bit_median",
                }

        # Fallback to overall delta
        delta_vals = valid_df["_delta"].dropna().values
        if len(delta_vals) > 0:
            step_median = float(np.median(delta_vals))
            direction = 1 if step_median >= 0 else -1
            return {
                "step": step_median,
                "signed_step": step_median,
                "step_mean": float(np.mean(delta_vals)),
                "step_median": step_median,
                "step_std": float(np.std(delta_vals, ddof=1)) if len(delta_vals) > 1 else 0.0,
                "step_cv": 0.0,
                "direction": direction,
                "stability": "GOOD",
                "linearity": "GOOD",
                "r_squared": 1.0,
                "slope": step_median,
                "intercept": 0.0,
                "code_points": [[0.0, 0.0], [1.0, step_median]],
                "code_deltas": {0: 0.0, 1: step_median},
                "method": "pre_post_delta",
            }

    # 2. Check if direct code-measurement mapping is available (Scan / Measurement relative mode)
    if code_col and code_col in df.columns:
        valid_df = df[[code_col, measurement_col]].dropna().copy()
        valid_df[code_col] = pd.to_numeric(valid_df[code_col], errors="coerce")
        valid_df[measurement_col] = pd.to_numeric(valid_df[measurement_col], errors="coerce")
        valid_df = valid_df.dropna()

        if not valid_df.empty and valid_df[code_col].nunique() >= 2:
            grouped = valid_df.groupby(code_col)[measurement_col].median().sort_index()
            codes = grouped.index.to_numpy(dtype=float)
            values = grouped.values.astype(float)
            code_deltas = {int(c): float(v) for c, v in zip(codes, values)}

            delta_code = np.diff(codes)
            delta_val = np.diff(values)
            nz = delta_code != 0
            if np.any(nz):
                steps = delta_val[nz] / delta_code[nz]
                step_median = float(np.median(steps))
                step_mean = float(np.mean(steps))
                step_std = float(np.std(steps, ddof=1)) if len(steps) > 1 else 0.0
                step_cv = float(step_std / abs(step_mean)) if abs(step_mean) > 1e-12 else 0.0
            else:
                step_median = 0.0
                step_mean = 0.0
                step_std = 0.0
                step_cv = 0.0

            reg = stats.linregress(codes, values) if len(codes) >= 2 else None
            r_squared = float(reg.rvalue ** 2) if reg and np.isfinite(reg.rvalue) else 1.0
            slope = float(reg.slope) if reg else step_median
            intercept = float(reg.intercept) if reg else 0.0
            direction = 1 if step_median >= 0 else -1

            stability = "GOOD" if step_cv <= cv_good_threshold else ("WARNING" if step_cv <= cv_warning_threshold else "UNSTABLE")
            linearity = "GOOD" if r_squared >= r2_good_threshold else ("WARNING" if r_squared >= r2_warning_threshold else "NONLINEAR")

            return {
                "step": step_median,
                "signed_step": step_median,
                "step_mean": step_mean,
                "step_median": step_median,
                "step_std": step_std,
                "step_cv": step_cv,
                "direction": direction,
                "stability": stability,
                "linearity": linearity,
                "r_squared": r_squared,
                "slope": slope,
                "intercept": intercept,
                "code_points": [[float(c), float(v)] for c, v in zip(codes, values)],
                "code_deltas": code_deltas,
                "method": "code_grouped_median",
            }

    # Default fallback
    return {
        "step": 0.0,
        "step_mean": 0.0,
        "step_median": 0.0,
        "step_std": 0.0,
        "step_cv": 0.0,
        "direction": 1,
        "stability": "UNKNOWN",
        "linearity": "UNKNOWN",
        "r_squared": 0.0,
        "slope": 0.0,
        "intercept": 0.0,
        "code_points": [],
        "method": "fallback",
    }
