"""
Trim Data Validation Module
Validates input dataset, columns, sample size, specification limits, and code boundaries.
"""

from typing import Dict, Any, Optional, List
import pandas as pd
import numpy as np


def validate_trim_data(
    df: pd.DataFrame,
    measurement_col: str,
    trim_code_col: Optional[str] = None,
    target: Optional[float] = None,
    lsl: Optional[float] = None,
    usl: Optional[float] = None,
    trim_min: Optional[int] = None,
    trim_max: Optional[int] = None,
    min_samples: int = 30,
    recommended_samples: int = 100,
) -> Dict[str, Any]:
    """
    Validate input DataFrame and configuration for Trim Optimization.
    Returns dictionary with validation status, errors, warnings, and summary stats.
    """
    errors: List[str] = []
    warnings: List[str] = []

    if df is None or df.empty:
        return {
            "valid": False,
            "errors": ["No valid Trim data available. DataFrame is empty."],
            "warnings": warnings,
            "sample_count": 0,
            "unique_codes": 0,
        }

    if measurement_col not in df.columns:
        return {
            "valid": False,
            "errors": [f"Measurement column '{measurement_col}' not found in data."],
            "warnings": warnings,
            "sample_count": 0,
            "unique_codes": 0,
        }

    # Filter non-null measurements
    meas_data = df[measurement_col]
    if isinstance(meas_data, pd.DataFrame):
        meas_data = meas_data.iloc[:, 0]
    valid_meas_mask = meas_data.notna() & np.isfinite(pd.to_numeric(meas_data, errors="coerce"))
    sample_count = int(valid_meas_mask.sum())

    if sample_count == 0:
        return {
            "valid": False,
            "errors": ["No valid numeric measurement data available."],
            "warnings": warnings,
            "sample_count": 0,
            "unique_codes": 0,
        }

    if sample_count < min_samples:
        errors.append(
            f"Insufficient data for Trim optimization. Sample count ({sample_count}) is below minimum threshold ({min_samples})."
        )
    elif sample_count < recommended_samples:
        warnings.append(
            f"Sample size ({sample_count}) is below recommended threshold ({recommended_samples}). Prediction confidence may be reduced."
        )

    # Validate specification limits
    has_lsl = lsl is not None and np.isfinite(lsl)
    has_usl = usl is not None and np.isfinite(usl)
    has_target = target is not None and np.isfinite(target)

    if not has_lsl and not has_usl:
        errors.append("At least one specification limit (LSL or USL) must be provided.")

    if has_lsl and has_usl and lsl >= usl:
        errors.append(f"Invalid specification limits: LSL ({lsl}) must be strictly less than USL ({usl}).")

    if has_target:
        if has_lsl and has_usl:
            if target < lsl or target > usl:
                warnings.append(f"Target value ({target}) is outside specification range [{lsl}, {usl}].")
        elif has_lsl and target < lsl:
            warnings.append(f"Target value ({target}) is below LSL ({lsl}).")
        elif has_usl and target > usl:
            warnings.append(f"Target value ({target}) is above USL ({usl}).")

    # Validate trim code column if present
    unique_codes = 0
    if trim_code_col and trim_code_col in df.columns:
        valid_codes = df.loc[valid_meas_mask, trim_code_col].dropna()
        numeric_codes = pd.to_numeric(valid_codes, errors="coerce").dropna()
        unique_codes = int(numeric_codes.nunique())
        if unique_codes == 0:
            warnings.append(f"No numeric Trim Codes found in column '{trim_code_col}'.")
        elif unique_codes == 1:
            warnings.append(f"Trim Code column has only 1 unique value ({numeric_codes.iloc[0]}). Step estimation requires multiple code values or multi-step sweeps.")

        if trim_min is not None and trim_max is not None and trim_min >= trim_max:
            errors.append(f"Invalid Trim Code boundary: trim_min ({trim_min}) must be less than trim_max ({trim_max}).")

    valid = len(errors) == 0

    return {
        "valid": valid,
        "errors": errors,
        "warnings": warnings,
        "sample_count": sample_count,
        "unique_codes": unique_codes,
    }
