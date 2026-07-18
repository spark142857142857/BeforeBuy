import sys
import unittest
from datetime import date
from pathlib import Path


PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))

from collect_dart_business import cache_is_fresh, merge_company_result  # noqa: E402


class CollectionCacheTest(unittest.TestCase):
    def test_successful_cache_expires_after_configured_age(self):
        company = {"status": "ok", "updatedAt": "2026-07-16"}

        self.assertTrue(
            cache_is_fresh(company, today=date(2026, 7, 18), max_age_days=120)
        )
        self.assertFalse(
            cache_is_fresh(company, today=date(2027, 1, 1), max_age_days=120)
        )

    def test_failed_refresh_preserves_last_good_company(self):
        previous = {
            "status": "ok",
            "receiptNo": "20260318000123",
            "updatedAt": "2026-03-18",
            "text": "정상 사업 내용",
        }
        incoming = {
            "status": "error",
            "updatedAt": "2026-07-18",
            "error": "temporary timeout",
        }

        merged = merge_company_result(previous, incoming)

        self.assertEqual(merged["status"], "ok")
        self.assertEqual(merged["receiptNo"], previous["receiptNo"])
        self.assertEqual(merged["lastAttempt"]["status"], "error")
        self.assertEqual(merged["lastAttempt"]["attemptedAt"], "2026-07-18")

    def test_successful_refresh_replaces_old_warning(self):
        previous = {
            "status": "ok",
            "lastAttempt": {"status": "error", "attemptedAt": "2026-07-17"},
        }
        incoming = {"status": "ok", "updatedAt": "2026-07-18", "text": "새 내용"}

        merged = merge_company_result(previous, incoming)

        self.assertEqual(merged["text"], "새 내용")
        self.assertNotIn("lastAttempt", merged)


if __name__ == "__main__":
    unittest.main()
