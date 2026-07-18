import sys
import unittest
from pathlib import Path


PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))

from collect_krx_master import security_type  # noqa: E402


class KrxMasterTest(unittest.TestCase):
    def test_reit_requires_reit_business_context(self):
        self.assertEqual(security_type("SK리츠", "부동산 임대 및 공급업"), "reit")
        self.assertEqual(security_type("이리츠코크렙", "부동산 임대 및 공급업"), "reit")
        self.assertEqual(security_type("메리츠금융지주", "기타 금융업"), "common")
        self.assertEqual(
            security_type("블리츠웨이엔터테인먼트", "창작 및 예술관련 서비스업"),
            "common",
        )

    def test_conversion_preferred_shares_are_detected(self):
        self.assertEqual(security_type("CJ4우(전환)"), "preferred")
        self.assertEqual(security_type("DL이앤씨2우(전환)"), "preferred")
        self.assertEqual(security_type("현대차2우B"), "preferred")


if __name__ == "__main__":
    unittest.main()
