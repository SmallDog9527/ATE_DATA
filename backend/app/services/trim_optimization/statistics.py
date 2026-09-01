"""
Trim Statistical Metrics Module
Calculates Mean, Stdev (ddof=1), CP, CPU, CPL, CPK, Yield, and Fail counts.
"""

from typing import Dict, Any, Optional
import numpy as np


def calculate_current_statistics(
    values: np.ndarray,
    target: Optional[float] = None,
    lsl: Optional[float] = None,
    usl: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Calculate full distribution statistics, process capability (CPK), and yield.
    """
    clean_vals = values[np.isfinite(values)]
    n = len(clean_vals)

    if n == 0:
        return {
            "count": 0,
            "min": None,
            "max": None,
            "mean": None,
            "stdev": None,
            "target": target,
            "lsl": lsl,
            "usl": usl,
            "cp": None,
            "cpu": None,
            "cpl": None,
            "cpk": None,
            "yield": 0.0,
            "pass_count": 0,
            "fail_count": 0,
            "lsl_fail": 0,
            "usl_fail": 0,
        }

    mean_val = float(np.mean(clean_vals))
    min_val = float(np.min(clean_vals))
    max_val = float(np.max(clean_vals))
    stdev_val = float(np.std(clean_vals, ddof=1)) if n > 1 else 0.0

    # LSL / USL Fails
    has_lsl = lsl is not None and np.isfinite(lsl)
    has_usl = usl is not None and np.isfinite(usl)

    lsl_fail_mask = (clean_vals < lsl) if has_lsl else np.zeros(n, dtype=bool)
    usl_fail_mask = (clean_vals > usl) if has_usl else np.zeros(n, dtype=bool)

    lsl_fail_count = int(np.sum(lsl_fail_mask))
    usl_fail_count = int(np.sum(usl_fail_mask))

    total_fail_mask = lsl_fail_mask | usl_fail_mask
    total_fail_count = int(np.sum(total_fail_mask))
    pass_count = n - total_fail_count
    yield_val = float(pass_count / n)

    # Capability metrics (CPK)
    cp = None
    cpu = None
    cpl = None
    cpk = None

    if stdev_val > 1e-12:
        if has_usl:
            cpu = float((usl - mean_val) / (3.0 * stdev_val))
        if has_lsl:
            cpl = float((mean_val - lsl) / (3.0 * stdev_val))

        if has_lsl and has_usl:
            cp = float((usl - lsl) / (6.0 * stdev_val))
            cpk = float(min(cpu, cpl))
        elif has_usl:
            cpk = cpu
        elif has_lsl:
            cpk = cpl

    return {
        "count": n,
        "min": min_val,
        "max": max_val,
        "mean": mean_val,
        "stdev": stdev_val,
        "target": target,
        "lsl": lsl,
        "usl": usl,
        "cp": cp,
        "cpu": cpu,
        "cpl": cpl,
        "cpk": cpk,
        "yield": yield_val,
        "pass_count": pass_count,
        "fail_count": total_fail_count,
        "lsl_fail": lsl_fail_count,
        "usl_fail": usl_fail_count,
    }
