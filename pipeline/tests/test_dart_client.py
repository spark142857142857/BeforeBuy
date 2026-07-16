from __future__ import annotations

import sys
import unittest
from pathlib import Path


PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))

from dart_client import annual_report_candidates  # noqa: E402


class AnnualReportSelectionTest(unittest.TestCase):
    def test_prefers_latest_period_content_correction_and_excludes_attachments(self) -> None:
        reports = [
            {"report_nm": "분기보고서 (2026.03)", "rcept_dt": "20260515", "rcept_no": "4"},
            {"report_nm": "[첨부정정]사업보고서 (2025.12)", "rcept_dt": "20260325", "rcept_no": "3"},
            {"report_nm": "사업보고서 (2025.12)", "rcept_dt": "20260320", "rcept_no": "2"},
            {"report_nm": "[기재정정]사업보고서 (2025.12)", "rcept_dt": "20260401", "rcept_no": "5"},
            {"report_nm": "사업보고서 (2024.12)", "rcept_dt": "20250320", "rcept_no": "1"},
        ]

        selected = annual_report_candidates(reports)

        self.assertEqual(
            [report["rcept_no"] for report in selected],
            ["5", "2", "1"],
        )


if __name__ == "__main__":
    unittest.main()
