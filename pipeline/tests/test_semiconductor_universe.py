import unittest

from build_semiconductor_universe import build_universe


class SemiconductorUniverseTest(unittest.TestCase):
    def test_uses_krx_signals_and_report_roles_without_llm(self):
        master = {
            "stocks": [
                {
                    "symbol": "000001",
                    "name": "메모리테스트",
                    "market": "KOSPI",
                    "industry": "반도체 제조업",
                    "products": "DRAM 및 NAND",
                    "marketCap": 100,
                    "securityType": "common",
                },
                {
                    "symbol": "000002",
                    "name": "장비테스트",
                    "market": "KOSDAQ",
                    "industry": "기계 제조업",
                    "products": "증착 장비",
                    "marketCap": 50,
                    "securityType": "common",
                },
                {
                    "symbol": "000003",
                    "name": "일반테스트",
                    "market": "KOSDAQ",
                    "industry": "전자부품 제조업",
                    "products": "전자부품",
                    "marketCap": 10,
                    "securityType": "common",
                },
            ]
        }
        business = {
            "companies": {
                "000001": {"status": "ok", "reportPeriod": "2025.12", "textConfidence": "standard", "text": "DRAM과 NAND 메모리 반도체를 생산합니다."},
                "000002": {"status": "ok", "reportPeriod": "2025.12", "textConfidence": "standard", "text": "당사는 반도체 증착 장비와 반도체 식각 장비를 공급하며 반도체 고객에 판매합니다."},
                "000003": {"status": "ok", "reportPeriod": "2025.12", "textConfidence": "standard", "text": "반도체 시장이 성장하고 있습니다."},
            }
        }

        result = build_universe(master, business)
        by_symbol = {company["symbol"]: company for company in result["companies"]}

        self.assertEqual(set(by_symbol), {"000001", "000002"})
        self.assertIn("memory", [category["id"] for category in by_symbol["000001"]["categories"]])
        self.assertIn("equipment", [category["id"] for category in by_symbol["000002"]["categories"]])
        self.assertFalse(result["method"]["llmUsed"])


if __name__ == "__main__":
    unittest.main()
