import sys
import unittest
from pathlib import Path

import pandas as pd


PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))

from collect_krx_master import normalize, security_type  # noqa: E402


class KrxMasterTest(unittest.TestCase):
    def test_kosdaq_global_is_normalized_to_kosdaq(self):
        records = normalize(
            pd.DataFrame(
                [
                    {
                        "Code": "196170",
                        "Name": "알테오젠",
                        "Market": "KOSDAQ GLOBAL",
                        "Industry": "자연과학 및 공학 연구개발업",
                    }
                ]
            )
        )

        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["market"], "KOSDAQ")
        self.assertEqual(records[0]["symbol"], "196170")

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
