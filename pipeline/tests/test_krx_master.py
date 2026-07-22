import sys
import json
import unittest
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import patch

import pandas as pd


PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))

from collect_krx_master import normalize, security_type, write_snapshot  # noqa: E402


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

    def test_market_normalization_handles_case_and_rejects_unknown_markets(self):
        records = normalize(
            pd.DataFrame(
                [
                    {"Code": "196170", "Name": "알테오젠", "Market": " kosdaq global "},
                    {"Code": "005930", "Name": "삼성전자", "Market": "kospi"},
                    {"Code": "US0001", "Name": "해외종목", "Market": "NASDAQ"},
                ]
            )
        )

        self.assertEqual(
            [(record["symbol"], record["market"]) for record in records],
            [("196170", "KOSDAQ"), ("005930", "KOSPI")],
        )

    def test_snapshot_write_replaces_atomically_and_removes_temporary_file(self):
        records = [
            {
                "symbol": "196170",
                "name": "알테오젠",
                "market": "KOSDAQ",
                "industry": "연구개발업",
            }
        ]
        with TemporaryDirectory() as directory:
            output = Path(directory) / "kr_stocks.json"
            output.write_text("previous", encoding="utf-8")

            write_snapshot(records, output)

            payload = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(payload["counts"]["total"], 1)
            self.assertEqual(payload["stocks"], records)
            self.assertFalse(output.with_suffix(".tmp").exists())

    def test_failed_snapshot_replace_preserves_previous_snapshot(self):
        records = [{"symbol": "196170", "name": "알테오젠", "market": "KOSDAQ"}]
        with TemporaryDirectory() as directory:
            output = Path(directory) / "kr_stocks.json"
            output.write_text("previous", encoding="utf-8")

            with patch.object(Path, "replace", side_effect=OSError("disk error")):
                with self.assertRaises(OSError):
                    write_snapshot(records, output)

            self.assertEqual(output.read_text(encoding="utf-8"), "previous")

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
