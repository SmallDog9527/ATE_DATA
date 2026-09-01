"""
Unit tests for Trim Optimization Module.
Verifies step calculation, direction detection, theoretical shift,
boundary checking, yield optimization ranking, and fail die retention.
"""

import unittest
import numpy as np
import pandas as pd

from app.services.trim_optimization.validation import validate_trim_data
from app.services.trim_optimization.statistics import calculate_current_statistics
from app.services.trim_optimization.step import calculate_trim_step
from app.services.trim_optimization.model import predict_measurement, check_code_boundary
from app.services.trim_optimization.optimizer import optimize_trim


class TestTrimOptimization(unittest.TestCase):

    def test_positive_trim_direction_and_step(self):
        """Test 1: Code increases -> Measurement increases (Direction = +1)."""
        codes = np.repeat(np.arange(0, 8), 20)
        measurements = 1.0 + codes * 0.005 + np.random.normal(0, 0.0001, len(codes))
        df = pd.DataFrame({"trim_code": codes, "meas": measurements})

        res = calculate_trim_step(df, measurement_col="meas", trim_code_col="trim_code")
        self.assertEqual(res["direction"], 1)
        self.assertAlmostEqual(res["step"], 0.005, delta=0.0005)
        self.assertGreaterEqual(res["r_squared"], 0.98)
        self.assertEqual(res["stability"], "GOOD")

    def test_negative_trim_direction_and_step(self):
        """Test 2: Code increases -> Measurement decreases (Direction = -1)."""
        codes = np.repeat(np.arange(0, 8), 20)
        measurements = 1.5 - codes * 0.01 + np.random.normal(0, 0.0001, len(codes))
        df = pd.DataFrame({"trim_code": codes, "meas": measurements})

        res = calculate_trim_step(df, measurement_col="meas", trim_code_col="trim_code")
        self.assertEqual(res["direction"], -1)
        self.assertAlmostEqual(res["step"], -0.01, delta=0.001)

    def test_theoretical_shift_calculation(self):
        """Test 3: Theoretical shift calculation."""
        # Target = 1.200, Current Mean = 1.185, Step = 0.0025, Direction = +1 => Shift = +6
        np.random.seed(42)
        measurements = np.random.normal(1.185, 0.008, 200)
        df = pd.DataFrame({"meas": measurements, "code": np.zeros(200)})

        res = optimize_trim(
            df=df,
            measurement_col="meas",
            trim_code_col="code",
            target=1.200,
            lsl=1.150,
            usl=1.250,
            trim_min=0,
            trim_max=31,
            search_range=3,
        )

        self.assertEqual(res["status"], "success")
        self.assertIsNotNone(res["recommended_shift"])
        self.assertGreater(res["recommended_shift"], 0)

    def test_code_boundary_check(self):
        """Test 4: Trim boundary check."""
        codes = np.array([29, 30])
        # Shift = +5 -> Max code = 35 > 31 -> Invalid
        bound = check_code_boundary(codes, shift=5, trim_min=0, trim_max=31)
        self.assertFalse(bound["valid"])
        self.assertEqual(bound["boundary_risk"], "HIGH_RISK_OUT_OF_BOUNDS")

        # Shift = +1 -> Max code = 31 == 31 -> Valid but at boundary
        bound_edge = check_code_boundary(codes, shift=1, trim_min=0, trim_max=31)
        self.assertTrue(bound_edge["valid"])
        self.assertEqual(bound_edge["boundary_risk"], "HIGH_RISK_AT_BOUNDARY")

    def test_yield_optimization_ranking(self):
        """Test 5: Yield optimization ranking and best shift selection."""
        # Mean biased towards LSL (1.160), LSL=1.150, USL=1.250, Target=1.200
        # Positive shift should move distribution towards Target and increase Yield
        np.random.seed(42)
        measurements = np.random.normal(1.165, 0.010, 500)
        codes = np.zeros(500)
        df = pd.DataFrame({"meas": measurements, "trim_code": codes})

        # Inject known step via mock code data
        codes_step = np.repeat([0, 1, 2, 3, 4], 100)
        meas_step = 1.165 + codes_step * 0.005 + np.random.normal(0, 0.001, 500)
        df_sweep = pd.DataFrame({"meas": meas_step, "trim_code": codes_step})

        res = optimize_trim(
            df=df_sweep,
            measurement_col="meas",
            trim_code_col="trim_code",
            target=1.200,
            lsl=1.150,
            usl=1.250,
            trim_min=0,
            trim_max=31,
            search_range=4,
        )

        self.assertEqual(res["status"], "success")
        self.assertGreater(res["recommended_shift"], 0)
        self.assertGreaterEqual(res["yield_improvement"], 0.0)
        self.assertIn("Recommendation:", res["recommendation_text"])

    def test_fail_die_retention_principle(self):
        """Test 6: Total sample count is strictly preserved in prediction."""
        np.random.seed(42)
        measurements = np.random.normal(1.18, 0.02, 1000)
        df = pd.DataFrame({"meas": measurements, "code": np.zeros(1000)})

        res = optimize_trim(
            df=df,
            measurement_col="meas",
            trim_code_col="code",
            target=1.200,
            lsl=1.150,
            usl=1.250,
        )

        curr_n = res["current_statistics"]["count"]
        self.assertEqual(curr_n, 1000)
        for c in res["candidates"]:
            # Sum of pass and fail must equal total count
            pred_pass = int(round(c["predicted_yield"] * curr_n))
            self.assertEqual(pred_pass + c["total_fail"], curr_n)


if __name__ == "__main__":
    unittest.main()
