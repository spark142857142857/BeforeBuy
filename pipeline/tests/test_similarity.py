from __future__ import annotations

import sys
import unittest
from pathlib import Path


PIPELINE = Path(__file__).resolve().parents[1]
ROOT = PIPELINE.parent
sys.path.insert(0, str(PIPELINE))

from build_similarity import (  # noqa: E402
    build_similarity,
    extract_business_exposures,
    read_json,
)


class SimilarityPipelineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.rules = read_json(ROOT / "data" / "curated" / "business_exposure_rules.json")

    def test_shared_business_exposures_rank_first_without_llm(self) -> None:
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

        result = build_similarity(
            master,
            business,
            top_k=2,
            min_companies=3,
            exposure_rules=self.rules,
        )

        self.assertEqual(result["similar"]["000001"][0]["symbol"], "000002")
        self.assertGreater(result["similar"]["000001"][0]["exposureSimilarity"], 0.7)
        self.assertGreater(result["similar"]["000001"][0]["productSimilarity"], 0)
        self.assertNotIn("scaleSimilarity", result["similar"]["000001"][0])
        self.assertIn("메모리 반도체", result["similar"]["000001"][0]["sharedExposures"])
        self.assertTrue(result["similar"]["000001"][0]["sharedTerms"])
        self.assertTrue(result["method"]["industrySoftPriorsUsed"])
        self.assertFalse(result["method"]["llmUsed"])

    def test_industry_soft_prior_does_not_force_telecom_peers_for_memory(self) -> None:
        master = {
            "stocks": [
                {
                    "symbol": "005930",
                    "name": "삼성전자",
                    "market": "KOSPI",
                    "industry": "통신 및 방송 장비 제조업",
                    "products": "반도체 제조(메모리) 제품, 통신 및 방송 장비 제조(무선) 제품",
                    "securityType": "common",
                    "marketCap": 400,
                },
                {
                    "symbol": "000660",
                    "name": "SK하이닉스",
                    "market": "KOSPI",
                    "industry": "반도체 제조업",
                    "products": "반도체, DRAM, HBM",
                    "securityType": "common",
                    "marketCap": 200,
                },
                {
                    "symbol": "032750",
                    "name": "삼진",
                    "market": "KOSDAQ",
                    "industry": "통신 및 방송 장비 제조업",
                    "products": "리모컨",
                    "securityType": "common",
                    "marketCap": 10,
                },
            ]
        }
        business = {
            "companies": {
                "005930": {
                    "status": "ok",
                    "reportType": "annual",
                    "textConfidence": "standard",
                    "text": "메모리 반도체와 DRAM, NAND, HBM을 생산합니다.",
                },
                "000660": {
                    "status": "ok",
                    "reportType": "annual",
                    "textConfidence": "standard",
                    "text": "DRAM과 HBM 메모리 반도체를 생산합니다.",
                },
                "032750": {
                    "status": "ok",
                    "reportType": "annual",
                    "textConfidence": "standard",
                    "text": "가전용 리모컨을 제조합니다.",
                },
            }
        }

        result = build_similarity(
            master,
            business,
            top_k=2,
            min_companies=3,
            exposure_rules=self.rules,
        )
        self.assertEqual(result["similar"]["005930"][0]["symbol"], "000660")
        self.assertNotEqual(result["similar"]["005930"][0]["symbol"], "032750")

    def test_battery_materials_do_not_outrank_cell_peers(self) -> None:
        master = {
            "stocks": [
                {
                    "symbol": "373220",
                    "name": "LG에너지솔루션",
                    "market": "KOSPI",
                    "industry": "일차전지 및 이차전지 제조업",
                    "products": "2차전지 (소형,ESS,자동차전지)",
                    "securityType": "common",
                    "marketCap": 300,
                },
                {
                    "symbol": "006400",
                    "name": "삼성SDI",
                    "market": "KOSPI",
                    "industry": "일차전지 및 이차전지 제조업",
                    "products": "2차전지, 전자재료 제조 판매",
                    "securityType": "common",
                    "marketCap": 200,
                },
                {
                    "symbol": "066970",
                    "name": "엘앤에프",
                    "market": "KOSDAQ",
                    "industry": "일차전지 및 이차전지 제조업",
                    "products": "이차전지 양극활물질",
                    "securityType": "common",
                    "marketCap": 50,
                },
            ]
        }
        business = {
            "companies": {
                "373220": {
                    "status": "ok",
                    "reportType": "annual",
                    "textConfidence": "standard",
                    "text": "전기차용 배터리 셀과 에너지저장장치를 제조합니다.",
                },
                "006400": {
                    "status": "ok",
                    "reportType": "annual",
                    "textConfidence": "standard",
                    "text": "자동차용 배터리 셀과 소형전지를 제조합니다.",
                },
                "066970": {
                    "status": "ok",
                    "reportType": "annual",
                    "textConfidence": "standard",
                    "text": "이차전지 양극활물질과 전구체를 제조합니다.",
                },
            }
        }

        materials = extract_business_exposures(
            master["stocks"][2],
            business["companies"]["066970"],
            self.rules,
        )
        self.assertIn("battery-materials", materials)
        self.assertIn("battery-value-chain", materials)
        self.assertNotIn("battery-cell", materials)

        result = build_similarity(
            master,
            business,
            top_k=2,
            min_companies=3,
            exposure_rules=self.rules,
        )
        self.assertEqual(result["similar"]["373220"][0]["symbol"], "006400")

    def test_product_keywords_do_not_classify_from_dart_mention_alone(self) -> None:
        optical = {
            "symbol": "190580",
            "name": "코셋",
            "market": "KOSDAQ",
            "industry": "통신 및 방송 장비 제조업",
            "products": "광통신 증폭기",
            "securityType": "common",
            "marketCap": 20,
        }
        traffic = {
            "symbol": "217500",
            "name": "APS",
            "market": "KOSDAQ",
            "industry": "소프트웨어 개발 및 공급업",
            "products": "인터넷 트래픽 솔루션",
            "securityType": "common",
            "marketCap": 15,
        }
        wafer = {
            "symbol": "060310",
            "name": "3S",
            "market": "KOSDAQ",
            "industry": "측정, 시험, 항해, 제어 및 기타 정밀기기 제조업; 광학기기 제외",
            "products": "반도체 웨이퍼 캐리어",
            "securityType": "common",
            "marketCap": 12,
        }
        for stock in (optical, traffic):
            exposures = extract_business_exposures(
                stock,
                {
                    "status": "ok",
                    "reportType": "annual",
                    "textConfidence": "standard",
                    "text": "당사는 고객 산업 동향으로 2차전지 시장을 한 차례 언급합니다.",
                },
                self.rules,
            )
            self.assertNotIn("battery-cell", exposures, stock["name"])

        wafer_exp = extract_business_exposures(
            wafer,
            {
                "status": "ok",
                "reportType": "annual",
                "textConfidence": "standard",
                "text": "구성에 따라서는 제일 작은 단위인 배터리 셀, 셀을 모아놓은 모듈이 있습니다.",
            },
            self.rules,
        )
        self.assertNotIn("battery-cell", wafer_exp)

    def test_battery_equipment_is_not_classified_as_cell(self) -> None:
        equipment_stocks = [
            {
                "symbol": "131970",
                "name": "두산테스나",
                "market": "KOSDAQ",
                "industry": "특수 목적용 기계 제조업",
                "products": "2차전지 자동화 설비, 조립설비",
                "securityType": "common",
                "marketCap": 40,
            },
            {
                "symbol": "299030",
                "name": "하나기술",
                "market": "KOSDAQ",
                "industry": "특수 목적용 기계 제조업",
                "products": "이차전지 제조 장비, 믹싱시스템, 검사시스템",
                "securityType": "common",
                "marketCap": 35,
            },
        ]
        for stock in equipment_stocks:
            exposures = extract_business_exposures(
                stock,
                {
                    "status": "ok",
                    "reportType": "annual",
                    "textConfidence": "standard",
                    "text": "이차전지 생산 라인용 자동화 설비를 공급합니다.",
                },
                self.rules,
            )
            self.assertIn("battery-equipment", exposures, stock["name"])
            self.assertIn("battery-value-chain", exposures, stock["name"])
            self.assertNotIn("battery-cell", exposures, stock["name"])

    def test_battery_role_tags_separate_cell_materials_parts_equipment(self) -> None:
        samples = {
            "cell": {
                "stock": {
                    "symbol": "373220",
                    "name": "셀기업",
                    "market": "KOSPI",
                    "industry": "일차전지 및 이차전지 제조업",
                    "products": "2차전지 (자동차전지)",
                    "securityType": "common",
                    "marketCap": 100,
                },
                "text": "배터리 셀을 제조합니다.",
                "expect": "battery-cell",
                "forbid": ["battery-materials", "battery-equipment", "battery-parts"],
            },
            "materials": {
                "stock": {
                    "symbol": "066970",
                    "name": "소재기업",
                    "market": "KOSDAQ",
                    "industry": "일차전지 및 이차전지 제조업",
                    "products": "이차전지 양극활물질",
                    "securityType": "common",
                    "marketCap": 50,
                },
                "text": "양극재를 생산합니다.",
                "expect": "battery-materials",
                "forbid": ["battery-cell"],
            },
            "parts": {
                "stock": {
                    "symbol": "055490",
                    "name": "부품기업",
                    "market": "KOSDAQ",
                    "industry": "플라스틱제품 제조업",
                    "products": "2차전지용 테이프",
                    "securityType": "common",
                    "marketCap": 20,
                },
                "text": "전지용 부품을 공급합니다.",
                "expect": "battery-parts",
                "forbid": ["battery-cell"],
            },
            "equipment": {
                "stock": {
                    "symbol": "217820",
                    "name": "장비기업",
                    "market": "KOSDAQ",
                    "industry": "특수 목적용 기계 제조업",
                    "products": "2차전지 자동화 설비",
                    "securityType": "common",
                    "marketCap": 25,
                },
                "text": "전지 설비를 만듭니다.",
                "expect": "battery-equipment",
                "forbid": ["battery-cell"],
            },
        }
        for label, sample in samples.items():
            exposures = extract_business_exposures(
                sample["stock"],
                {
                    "status": "ok",
                    "reportType": "annual",
                    "textConfidence": "standard",
                    "text": sample["text"],
                },
                self.rules,
            )
            self.assertIn(sample["expect"], exposures, label)
            self.assertIn("battery-value-chain", exposures, label)
            for forbidden in sample["forbid"]:
                self.assertNotIn(forbidden, exposures, label)

    def test_cell_components_and_safety_products_are_not_cell_manufacturers(self) -> None:
        parts_samples = [
            {
                "symbol": "241690",
                "name": "셀케이스기업",
                "market": "KOSPI",
                "industry": "자동차 신품 부품 제조업",
                "products": "배터리 셀케이스, ESS 배터리 모듈",
                "securityType": "common",
                "marketCap": 30,
            },
            {
                "symbol": "047310",
                "name": "보호회로기업",
                "market": "KOSDAQ",
                "industry": "전자부품 제조업",
                "products": "2차전지 보호회로 및 배터리팩",
                "securityType": "common",
                "marketCap": 25,
            },
            {
                "symbol": "493330",
                "name": "안전제품기업",
                "market": "KOSDAQ",
                "industry": "일반 목적용 기계 제조업",
                "products": "2차전지 소화안전제품",
                "securityType": "common",
                "marketCap": 15,
            },
        ]
        for stock in parts_samples:
            exposures = extract_business_exposures(
                stock,
                {
                    "status": "ok",
                    "reportType": "annual",
                    "textConfidence": "standard",
                    "text": "배터리 셀 생산 공정에 사용되는 부품을 공급합니다.",
                },
                self.rules,
            )
            self.assertIn("battery-value-chain", exposures, stock["name"])
            self.assertIn("battery-parts", exposures, stock["name"])
            self.assertNotIn("battery-cell", exposures, stock["name"])

    def test_holding_company_is_not_labeled_as_securities(self) -> None:
        holding = {
            "symbol": "003550",
            "name": "LG",
            "market": "KOSPI",
            "industry": "회사 본부 및 경영 컨설팅 서비스업",
            "products": "지주회사",
            "securityType": "common",
            "marketCap": 200,
        }
        broker = {
            "symbol": "039490",
            "name": "키움증권",
            "market": "KOSPI",
            "industry": "증권 중개업",
            "products": "증권중개",
            "securityType": "common",
            "marketCap": 80,
        }
        holding_exp = extract_business_exposures(
            holding,
            {
                "status": "ok",
                "reportType": "annual",
                "textConfidence": "standard",
                "text": "순수지주회사로서 자회사 지분을 보유합니다.",
            },
            self.rules,
        )
        broker_exp = extract_business_exposures(
            broker,
            {
                "status": "ok",
                "reportType": "annual",
                "textConfidence": "standard",
                "text": "증권 중개와 투자매매를 영위합니다.",
            },
            self.rules,
        )
        self.assertIn("holding-company", holding_exp)
        self.assertNotIn("securities", holding_exp)
        self.assertIn("securities", broker_exp)
        self.assertNotIn("holding-company", broker_exp)

        venture = {
            "symbol": "440290",
            "name": "벤처투자기업",
            "market": "KOSDAQ",
            "industry": "기타 금융업",
            "products": "벤처투자조합 결성 및 운영",
            "securityType": "common",
            "marketCap": 20,
        }
        venture_exp = extract_business_exposures(
            venture,
            {
                "status": "ok",
                "reportType": "annual",
                "textConfidence": "standard",
                "text": "벤처기업 투자를 주요 사업으로 영위합니다.",
            },
            self.rules,
        )
        self.assertIn("securities", venture_exp)
        self.assertNotIn("holding-company", venture_exp)

        operating_company = {
            "symbol": "207940",
            "name": "바이오제조사",
            "market": "KOSPI",
            "industry": "기초 의약물질 제조업",
            "products": "바이오의약품 위탁생산",
            "securityType": "common",
            "marketCap": 150,
        }
        operating_exp = extract_business_exposures(
            operating_company,
            {
                "status": "ok",
                "reportType": "annual",
                "textConfidence": "standard",
                "text": "관계회사인 바이오에피스홀딩스와 지주회사 현황을 설명합니다.",
            },
            self.rules,
        )
        self.assertNotIn("holding-company", operating_exp)

    def test_telecom_services_are_separate_from_equipment_makers(self) -> None:
        operator = {
            "symbol": "017670",
            "name": "통신사업자",
            "market": "KOSPI",
            "industry": "전기 통신업",
            "products": "유무선통신사업, 이동전화 및 이동통신서비스",
            "securityType": "common",
            "marketCap": 100,
        }
        equipment = {
            "symbol": "032500",
            "name": "통신장비기업",
            "market": "KOSDAQ",
            "industry": "통신 및 방송 장비 제조업",
            "products": "기지국 안테나와 광통신 장비",
            "securityType": "common",
            "marketCap": 20,
        }
        operator_exp = extract_business_exposures(
            operator,
            {
                "status": "ok",
                "reportType": "annual",
                "textConfidence": "standard",
                "text": "전국 이동통신서비스를 제공합니다.",
            },
            self.rules,
        )
        equipment_exp = extract_business_exposures(
            equipment,
            {
                "status": "ok",
                "reportType": "annual",
                "textConfidence": "standard",
                "text": "무선통신 기지국용 장비를 제조합니다.",
            },
            self.rules,
        )
        self.assertIn("telecom-services", operator_exp)
        self.assertNotIn("telecom-equipment", operator_exp)
        self.assertIn("telecom-equipment", equipment_exp)
        self.assertNotIn("telecom-services", equipment_exp)

    def test_securities_and_venture_firms_do_not_gain_banking_from_generic_text(self) -> None:
        stock = {
            "symbol": "039490",
            "name": "증권사",
            "market": "KOSPI",
            "industry": "증권 중개업",
            "products": "유가증권 매매, 위탁, 인수, 주선",
            "securityType": "common",
            "marketCap": 50,
        }
        exposures = extract_business_exposures(
            stock,
            {
                "status": "ok",
                "reportType": "annual",
                "textConfidence": "standard",
                "text": "고객 자산을 수신하고 투자 여신 환경을 분석합니다.",
            },
            self.rules,
        )
        self.assertIn("securities", exposures)
        self.assertNotIn("banking", exposures)


if __name__ == "__main__":
    unittest.main()
