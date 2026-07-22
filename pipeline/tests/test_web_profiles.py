from __future__ import annotations

import sys
import unittest
from pathlib import Path


PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))

from prepare_web_profiles import build_profiles, preferred_base_name  # noqa: E402


class WebProfileTest(unittest.TestCase):
    def test_normalizes_preferred_share_names(self) -> None:
        self.assertEqual(preferred_base_name("CJ4우(전환)"), "CJ")
        self.assertEqual(preferred_base_name("DL이앤씨2우(전환)"), "DL이앤씨")
        self.assertEqual(preferred_base_name("JW중외제약2우B"), "JW중외제약")
        self.assertEqual(preferred_base_name("LG전자우"), "LG전자")

    def test_exposes_collection_errors_and_preserved_refresh_warnings(self) -> None:
        master = {
            "stocks": [
                {
                    "symbol": "000001",
                    "name": "정상기업",
                    "securityType": "common",
                    "industry": "제조업",
                },
                {
                    "symbol": "000002",
                    "name": "오류기업",
                    "securityType": "common",
                    "industry": "제조업",
                },
            ]
        }
        business = {
            "companies": {
                "000001": {
                    "status": "ok",
                    "reportPeriod": "2025.12",
                    "receiptDate": "2026-03-18",
                    "sourceUrl": "https://dart.example/1",
                    "textConfidence": "standard",
                    "textLength": 5_000,
                    "text": "사업 내용" * 1_000,
                    "lastAttempt": {"status": "error", "attemptedAt": "2026-07-18"},
                },
                "000002": {"status": "error", "error": "temporary timeout"},
            }
        }

        result = build_profiles(master, business)

        self.assertEqual(result["counts"]["refreshWarnings"], 1)
        self.assertEqual(result["schemaVersion"], 2)
        self.assertNotIn("excerpt", result["profiles"]["000001"])
        self.assertEqual(
            result["profiles"]["000001"]["refreshWarning"]["attemptedAt"],
            "2026-07-18",
        )
        self.assertEqual(
            result["unavailable"]["000002"]["category"], "collection_error"
        )

    def test_ignores_companies_that_are_no_longer_in_the_krx_master(self) -> None:
        master = {
            "stocks": [
                {
                    "symbol": "000001",
                    "name": "현재기업",
                    "securityType": "common",
                    "industry": "제조업",
                }
            ]
        }
        company = {
            "status": "ok",
            "reportPeriod": "2025.12",
            "receiptDate": "2026-03-18",
            "sourceUrl": "https://dart.example/1",
            "textConfidence": "standard",
            "textLength": 5_000,
            "text": "사업 내용" * 1_000,
        }
        business = {
            "companies": {
                "000001": company,
                "999999": {**company, "status": "unmapped"},
            }
        }

        result = build_profiles(master, business)

        self.assertEqual(set(result["profiles"]), {"000001"})
        self.assertNotIn("999999", result["aliases"])
        self.assertNotIn("999999", result["unavailable"])

    def test_marks_current_stock_without_collection_result_as_unavailable(self) -> None:
        master = {
            "stocks": [
                {
                    "symbol": "000001",
                    "name": "신규상장기업",
                    "securityType": "common",
                    "industry": "제조업",
                }
            ]
        }

        result = build_profiles(master, {"companies": {}})

        self.assertEqual(
            result["unavailable"]["000001"],
            {"category": "collection_error", "reason": "not_collected"},
        )

    def test_unmapped_common_stock_does_not_enter_preferred_alias_resolution(self) -> None:
        master = {
            "stocks": [
                {
                    "symbol": "000001",
                    "name": "신규상장기업",
                    "securityType": "common",
                    "industry": "제조업",
                }
            ]
        }
        business = {"companies": {"000001": {"status": "unmapped"}}}

        result = build_profiles(master, business)

        self.assertEqual(result["aliases"], {})
        self.assertEqual(
            result["unavailable"]["000001"],
            {"category": "collection_error", "reason": "unmapped"},
        )

    def test_unmapped_preferred_share_uses_the_common_stock_profile(self) -> None:
        master = {
            "stocks": [
                {
                    "symbol": "005930",
                    "name": "삼성전자",
                    "securityType": "common",
                    "industry": "반도체 제조업",
                },
                {
                    "symbol": "005935",
                    "name": "삼성전자우",
                    "securityType": "preferred",
                    "industry": "",
                },
            ]
        }
        business = {
            "companies": {
                "005930": {
                    "status": "ok",
                    "reportPeriod": "2025.12",
                    "receiptDate": "2026-03-18",
                    "sourceUrl": "https://dart.example/005930",
                    "textConfidence": "standard",
                    "textLength": 5_000,
                    "text": "반도체 사업 내용" * 1_000,
                },
                "005935": {"status": "unmapped"},
            }
        }

        result = build_profiles(master, business)

        self.assertEqual(result["aliases"]["005935"], "005930")
        self.assertIn("005930", result["profiles"])
        self.assertNotIn("005935", result["unavailable"])
