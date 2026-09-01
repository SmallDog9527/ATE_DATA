"""
Trim Prediction Model and Code Boundary Analysis Module
Provides vectorized prediction of measurements and code boundary constraint checking.
"""

from typing import Dict, Any, Optional
import numpy as np


def predict_measurement(
    values: np.ndarray,
    shift: int,
    step: float,
    direction: int,
) -> np.ndarray:
    """
    Vectorized prediction of measurement values after applying Trim Shift.
    Predicted = Original + Shift * Step * Direction
    """
    return values + (shift * step * direction)


def check_code_boundary(
    codes: Optional[np.ndarray],
    shift: int,
    trim_min: int = 0,
    trim_max: int = 31,
    default_code: int = 0,
) -> Dict[str, Any]:
    """
    Check if candidate Trim Shift violates code min/max boundaries.
    Calculates lower/upper margins and boundary risk level.
    """
    if codes is None or len(codes) == 0:
        base_codes = np.array([default_code])
    else:
        clean = codes[np.isfinite(codes)]
        base_codes = clean if len(clean) > 0 else np.array([default_code])

    new_codes = base_codes + shift
    min_new_code = int(np.min(new_codes))
    max_new_code = int(np.max(new_codes))

    lower_margin = int(min_new_code - trim_min)
    upper_margin = int(trim_max - max_new_code)
    min_margin = min(lower_margin, upper_margin)

    is_valid = (min_new_code >= trim_min) and (max_new_code <= trim_max)

    if not is_valid or min_margin < 0:
        boundary_risk = "HIGH_RISK_OUT_OF_BOUNDS"
    elif min_margin == 0:
        boundary_risk = "HIGH_RISK_AT_BOUNDARY"
    elif min_margin == 1:
        boundary_risk = "WARNING"
    else:
        boundary_risk = "LOW"

    return {
        "valid": is_valid,
        "code_min": min_new_code,
        "code_max": max_new_code,
        "lower_margin": lower_margin,
        "upper_margin": upper_margin,
        "min_margin": min_margin,
        "boundary_risk": boundary_risk,
    }
