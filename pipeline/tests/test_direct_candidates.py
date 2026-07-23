import unittest

from build_direct_candidates import build_candidates


def company(symbol, name, role=None):
    return {"symbol": symbol, "name": name, "classification": {"primaryRole": role}}


class DirectCandidatesTest(unittest.TestCase):
    def test_requires_the_same_sector_and_confirmed_primary_role(self):
        memory = {"id": "memory", "label": "메모리 제조", "comparisonSectorId": "semiconductors", "source": "both"}
        battery = {"id": "battery-cell", "label": "배터리 셀", "comparisonSectorId": "secondary-battery", "source": "both"}
        taxonomy = {"companies": [company("A", "삼성", memory), company("B", "SK", memory), company("C", "다른섹터", battery), company("D", "미분류")]}
        master = {"stocks": [{"symbol": symbol, "marketCap": 1} for symbol in "ABCD"]}
        similarity = {"similar": {"A": [{"symbol": "B", "score": 0.8, "sharedExposures": ["메모리"]}]}}

        result = build_candidates(taxonomy, master, similarity)

        self.assertEqual(result["links"]["A"]["directCandidates"][0]["symbol"], "B")
        self.assertEqual(result["links"]["C"]["status"], "no-direct-peer")
        self.assertEqual(result["links"]["D"]["status"], "no-qualified-role")
        self.assertFalse(result["method"]["llmUsed"])

    def test_broad_unreviewed_roles_do_not_create_direct_peers(self):
        broad = {"id": "software-service", "label": "소프트웨어·서비스", "comparisonSectorId": "software", "source": "both"}
        taxonomy = {"companies": [company("A", "서비스A", broad), company("B", "서비스B", broad)]}
        master = {"stocks": [{"symbol": "A", "marketCap": 1}, {"symbol": "B", "marketCap": 1}]}

        result = build_candidates(taxonomy, master, {"similar": {}})

        self.assertEqual(result["links"]["A"]["status"], "no-qualified-role")
        self.assertEqual(result["links"]["B"]["status"], "no-qualified-role")


if __name__ == "__main__":
    unittest.main()
