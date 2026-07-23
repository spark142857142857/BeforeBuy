import unittest

from build_semiconductor_candidates import build_candidates


def taxonomy_company(symbol, name, role):
    return {
        "symbol": symbol,
        "name": name,
        "classification": {
            "primaryRole": role,
        },
    }


class SemiconductorCandidatesTest(unittest.TestCase):
    def test_uses_same_primary_role_without_forcing_candidates(self):
        taxonomy = {
            "asOf": "2026-07-22",
            "companies": [
                taxonomy_company("005930", "삼성전자", {"id": "memory", "label": "메모리 제조", "comparisonSectorId": "semiconductors", "source": "both"}),
                taxonomy_company("000660", "SK하이닉스", {"id": "memory", "label": "메모리 제조", "comparisonSectorId": "semiconductors", "source": "dart"}),
                taxonomy_company("000990", "DB하이텍", {"id": "foundry", "label": "파운드리", "comparisonSectorId": "semiconductors", "source": "dart"}),
                taxonomy_company("006400", "삼성SDI", {"id": "battery-cell", "label": "배터리 셀", "comparisonSectorId": "secondary-battery", "source": "both"}),
            ],
        }
        master = {
            "stocks": [
                {"symbol": "005930", "marketCap": 300},
                {"symbol": "000660", "marketCap": 200},
                {"symbol": "000990", "marketCap": 100},
            ]
        }
        similarity = {"similar": {"005930": [{"symbol": "000660", "score": 0.7, "sharedExposures": ["메모리"]}]}}

        result = build_candidates(taxonomy, master, similarity)

        self.assertEqual(result["links"]["005930"]["directCandidates"][0]["symbol"], "000660")
        self.assertEqual(result["links"]["000990"]["coverage"], "none")
        self.assertNotIn("006400", result["links"])
        self.assertFalse(result["method"]["llmUsed"])


if __name__ == "__main__":
    unittest.main()
