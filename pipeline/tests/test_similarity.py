from __future__ import annotations

import sys
import unittest
from pathlib import Path


PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))

from build_similarity import build_similarity  # noqa: E402


class SimilarityPipelineTest(unittest.TestCase):
    def test_same_industry_and_business_rank_first_without_llm(self) -> None:
        master = {
            "stocks": [
                {
                    "symbol": "000001",
                    "name": "메모리A",
                    "market": "KOSPI",
                    "industry": "반도체 제조업",
                    "products": "DRAM HBM 메모리 반도체",
                    "securityType": "common",
                    "marketCap": 300,
                },
                {
                    "symbol": "000002",
                    "name": "메모리B",
                    "market": "KOSDAQ",
                    "industry": "반도체 제조업",
                    "products": "HBM DRAM 메모리 모듈",
                    "securityType": "common",
                    "marketCap": 200,
                },
                {
                    "symbol": "000003",
                    "name": "제약C",
                    "market": "KOSPI",
                    "industry": "의약품 제조업",
                    "products": "전문의약품 신약 백신",
                    "securityType": "common",
                    "marketCap": 100,
                },
            ]
        }
        business = {
            "companies": {
                "000001": {"status": "ok", "reportType": "annual", "textConfidence": "standard", "text": "메모리 반도체와 HBM을 생산하고 데이터센터에 공급합니다."},
                "000002": {"status": "ok", "reportType": "annual", "textConfidence": "standard", "text": "DRAM과 HBM 메모리 반도체를 생산합니다."},
                "000003": {"status": "ok", "reportType": "annual", "textConfidence": "standard", "text": "전문의약품과 백신을 연구하고 판매합니다."},
            }
        }

        result = build_similarity(master, business, top_k=2, min_companies=3)

        self.assertEqual(result["similar"]["000001"][0]["symbol"], "000002")
        self.assertEqual(result["similar"]["000001"][0]["industrySimilarity"], 1.0)
        self.assertGreater(result["similar"]["000001"][0]["productSimilarity"], 0)
        self.assertTrue(result["similar"]["000001"][0]["sharedTerms"])
        self.assertFalse(result["method"]["llmUsed"])


if __name__ == "__main__":
    unittest.main()
