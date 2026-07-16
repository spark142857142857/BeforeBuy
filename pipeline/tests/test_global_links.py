import unittest

from build_global_links import build_links


class GlobalLinksTest(unittest.TestCase):
    def test_maps_platform_and_automotive_rules_without_llm(self):
        master = {
            "stocks": [
                {
                    "symbol": "035420",
                    "sector": "자료처리, 호스팅, 포털 및 기타 인터넷 정보매개 서비스업",
                    "industry": "자료처리, 호스팅, 포털 및 기타 인터넷 정보매개 서비스업",
                    "products": "포털 서비스 및 온라인 광고",
                },
                {
                    "symbol": "005380",
                    "sector": "자동차용 엔진 및 자동차 제조업",
                    "industry": "자동차용 엔진 및 자동차 제조업",
                    "products": "자동차(승용차, 버스, 트럭)",
                },
            ]
        }
        profiles = {
            "profiles": {
                "035420": {"excerpt": "검색 포털을 기반으로 광고와 커머스 사업을 운영합니다."},
                "005380": {"excerpt": "승용차와 하이브리드 완성차를 생산하고 판매합니다."},
            },
            "aliases": {},
        }
        rules = {
            "rules": [
                {
                    "id": "platform",
                    "theme": "platform",
                    "label": "플랫폼",
                    "industryKeywords": ["포털"],
                    "productKeywords": ["온라인 광고"],
                    "businessKeywords": ["검색 포털", "커머스"],
                    "minimumScore": 5,
                    "peerSlugs": ["alphabet"],
                    "etfSlugs": ["qqq"],
                    "reason": "플랫폼 비교",
                },
                {
                    "id": "automaker",
                    "theme": "mobility",
                    "label": "완성차",
                    "industryKeywords": ["자동차용 엔진 및 자동차 제조업"],
                    "productKeywords": ["승용차"],
                    "businessKeywords": ["완성차", "하이브리드"],
                    "minimumScore": 5,
                    "peerSlugs": ["toyota"],
                    "etfSlugs": ["driv"],
                    "reason": "완성차 비교",
                },
            ]
        }

        result = build_links(master, profiles, rules)

        self.assertEqual(result["links"]["035420"][0]["peerSlugs"], ["alphabet"])
        self.assertEqual(result["links"]["005380"][0]["etfSlugs"], ["driv"])
        self.assertFalse(result["method"]["llmUsed"])

    def test_required_name_and_industry_reduce_finance_false_positives(self):
        master = {
            "stocks": [
                {
                    "symbol": "105560",
                    "name": "KB금융",
                    "sector": "기타 금융업",
                    "industry": "기타 금융업",
                    "products": "-",
                    "securityType": "common",
                },
                {
                    "symbol": "199480",
                    "name": "뱅크웨어글로벌",
                    "sector": "소프트웨어 개발 및 공급업",
                    "industry": "소프트웨어 개발 및 공급업",
                    "products": "은행 시스템",
                    "securityType": "common",
                },
                {
                    "symbol": "477760",
                    "name": "DB금융스팩12호",
                    "sector": "기타 금융업",
                    "industry": "기타 금융업",
                    "products": "-",
                    "securityType": "spac",
                },
            ]
        }
        profiles = {
            "profiles": {
                "105560": {"excerpt": "은행업과 대출 및 여신 사업을 운영합니다."},
                "199480": {"excerpt": "은행의 수신 및 여신 소프트웨어를 공급합니다."},
                "477760": {"excerpt": "기업 인수를 목적으로 설립되었습니다."},
            },
            "aliases": {},
        }
        rules = {
            "rules": [
                {
                    "id": "banking",
                    "theme": "finance",
                    "label": "은행",
                    "industryKeywords": ["은행 및 저축기관", "기타 금융업"],
                    "requiredIndustryKeywords": ["은행 및 저축기관", "기타 금융업"],
                    "nameKeywords": ["금융", "은행", "뱅크"],
                    "requireNameMatch": True,
                    "productKeywords": ["은행"],
                    "businessKeywords": ["은행업", "대출", "수신", "여신"],
                    "minimumScore": 5,
                    "peerSlugs": ["jpmorgan"],
                    "etfSlugs": ["xlf"],
                    "reason": "은행 비교",
                }
            ]
        }

        result = build_links(master, profiles, rules)

        self.assertIn("105560", result["links"])
        self.assertNotIn("199480", result["links"])
        self.assertNotIn("477760", result["links"])


if __name__ == "__main__":
    unittest.main()
