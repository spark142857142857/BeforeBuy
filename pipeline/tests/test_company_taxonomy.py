import unittest

from build_company_taxonomy import build_taxonomy


class CompanyTaxonomyTest(unittest.TestCase):
    def test_keeps_external_krx_fields_and_generates_our_own_tags(self):
        master = {
            "asOf": "2026-07-22",
            "source": "test KRX",
            "stocks": [
                {
                    "symbol": "005930",
                    "name": "삼성전자",
                    "market": "KOSPI",
                    "securityType": "common",
                    "industry": "통신 및 방송 장비 제조업",
                    "products": "DRAM, NAND, 스마트폰",
                },
                {
                    "symbol": "000990",
                    "name": "DB하이텍",
                    "market": "KOSPI",
                    "securityType": "common",
                    "industry": "반도체 제조업",
                    "products": "8인치 파운드리, 전력반도체",
                },
                {
                    "symbol": "123456",
                    "name": "우선주",
                    "market": "KOSPI",
                    "securityType": "preferred",
                    "industry": "반도체 제조업",
                    "products": "DRAM",
                },
            ],
        }
        business = {
            "source": "test DART",
            "companies": {
                "005930": {
                    "status": "ok",
                    "reportPeriod": "2025.12",
                    "textConfidence": "standard",
                    "sourceUrl": "https://dart.example/samsung",
                    "text": "당사의 주력 제품은 DRAM과 NAND Flash 중심의 메모리 반도체이며, DRAM과 NAND Flash를 생산·판매하고 Foundry 사업도 병행합니다.",
                },
                "000990": {
                    "status": "ok",
                    "text": "당사는 8인치 순수 파운드리 기업으로 전력반도체를 생산·판매합니다.",
                },
            },
        }

        result = build_taxonomy(master, business)
        by_symbol = {company["symbol"]: company for company in result["companies"]}

        self.assertEqual(set(by_symbol), {"005930", "000990"})
        self.assertEqual(by_symbol["005930"]["external"]["krxIndustry"], "통신 및 방송 장비 제조업")
        self.assertEqual(
            by_symbol["005930"]["classification"]["primaryComparisonSector"]["id"],
            "semiconductors",
        )
        self.assertEqual(
            by_symbol["005930"]["classification"]["wics"]["primarySector"]["id"],
            "information-technology",
        )
        self.assertIn(
            "memory-manufacturing",
            [tag["id"] for tag in by_symbol["005930"]["classification"]["tags"]["businessModels"]],
        )
        self.assertEqual(by_symbol["005930"]["classification"]["primaryRole"]["id"], "memory")
        db = by_symbol["000990"]
        self.assertEqual(db["classification"]["primaryComparisonSector"]["id"], "semiconductors")
        self.assertIn("foundry", [tag["id"] for tag in db["classification"]["tags"]["businessModels"]])
        self.assertIn("foundry", [sector["id"] for sector in db["classification"]["subSectors"]])
        self.assertEqual(db["classification"]["primaryRole"]["id"], "foundry")
        self.assertIn("mature-process", [tag["id"] for tag in db["classification"]["tags"]["technologies"]])
        self.assertEqual(
            next(tag["source"] for tag in by_symbol["005930"]["classification"]["tags"]["products"] if tag["id"] == "dram"),
            "both",
        )
        self.assertFalse(result["method"]["llmUsed"])

    def test_leaves_unsupported_primary_sector_empty(self):
        result = build_taxonomy(
            {
                "stocks": [
                    {
                        "symbol": "000001",
                        "name": "분류불가",
                        "market": "KOSDAQ",
                        "securityType": "common",
                        "industry": "기타 서비스업",
                        "products": "기타",
                    }
                ]
            },
            {"companies": {}},
        )

        self.assertIsNone(result["companies"][0]["classification"]["primaryComparisonSector"])
        self.assertEqual(result["counts"]["unclassified"], 1)

    def test_dart_customer_and_process_mentions_do_not_create_business_models(self):
        result = build_taxonomy(
            {
                "stocks": [
                    {
                        "symbol": "000001",
                        "name": "테스트소켓",
                        "market": "KOSDAQ",
                        "securityType": "common",
                        "industry": "반도체 제조업",
                        "products": "반도체 테스트 소켓",
                    },
                    {
                        "symbol": "000002",
                        "name": "순수파운드리",
                        "market": "KOSDAQ",
                        "securityType": "common",
                        "industry": "반도체 제조업",
                        "products": "8인치 파운드리",
                    },
                ]
            },
            {
                "companies": {
                    "000001": {
                        "status": "ok",
                        "text": "당사는 HBM 및 DRAM 식각공정에 사용하는 테스트 소켓을 공급합니다. 글로벌 팹리스 고객과 파운드리 업체에 납품합니다.",
                    },
                    "000002": {
                        "status": "ok",
                        "text": "당사는 8인치 순수 파운드리 기업으로 웨이퍼 수탁 생산 사업을 영위합니다.",
                    },
                }
            },
        )
        by_symbol = {company["symbol"]: company for company in result["companies"]}
        socket_models = {
            tag["id"] for tag in by_symbol["000001"]["classification"]["tags"]["businessModels"]
        }
        self.assertFalse(socket_models.intersection({"memory-manufacturing", "foundry", "fabless"}))
        foundry_models = {
            tag["id"] for tag in by_symbol["000002"]["classification"]["tags"]["businessModels"]
        }
        self.assertIn("foundry", foundry_models)

    def test_distinguishes_direct_semiconductor_roles_from_context_mentions(self):
        result = build_taxonomy(
            {
                "stocks": [
                    {"symbol": "000030", "name": "위탁팹리스", "market": "KOSDAQ", "securityType": "common", "industry": "반도체 제조업", "products": "SSD 컨트롤러"},
                    {"symbol": "000031", "name": "DSP회사", "market": "KOSDAQ", "securityType": "common", "industry": "반도체 제조업", "products": "파운드리 디자인 솔루션"},
                    {"symbol": "000032", "name": "보안칩", "market": "KOSDAQ", "securityType": "common", "industry": "반도체 제조업", "products": "보안 반도체"},
                    {"symbol": "000033", "name": "검사장비", "market": "KOSDAQ", "securityType": "common", "industry": "반도체 제조업", "products": "반도체 검사장비"},
                    {"symbol": "000034", "name": "OSAT회사", "market": "KOSDAQ", "securityType": "common", "industry": "반도체 제조업", "products": "반도체 패키징 OSAT"},
                ]
            },
            {"companies": {
                "000030": {"status": "ok", "text": "당사는 SSD 컨트롤러를 개발하며 생산은 디자인하우스에게 위탁합니다."},
                "000031": {"status": "ok", "text": "당사는 삼성 파운드리의 공식 디자인 솔루션 파트너입니다."},
                "000032": {"status": "ok", "text": "당사는 하드웨어 기반 보안 반도체 설계 전문기업입니다."},
                "000033": {"status": "ok", "text": "당사는 반도체 패키징 공정에서 적용되는 3D 정밀 측정 검사장비를 생산합니다."},
                "000034": {"status": "ok", "text": "당사는 반도체 패키징 사업과 OSAT 서비스를 영위합니다."},
            }},
        )
        models = {
            company["symbol"]: {tag["id"] for tag in company["classification"]["tags"]["businessModels"]}
            for company in result["companies"]
        }
        self.assertNotIn("design-house", models["000030"])
        self.assertIn("design-house", models["000031"])
        self.assertIn("fabless", models["000032"])
        self.assertNotIn("design-house", models["000032"])
        self.assertIn("test-inspection", models["000033"])
        self.assertNotIn("packaging-osat", models["000033"])
        self.assertIn("packaging-osat", models["000034"])

    def test_semiconductor_value_chain_roles_are_separate_subsectors(self):
        result = build_taxonomy(
            {
                "stocks": [
                    {
                        "symbol": "000010",
                        "name": "후공정",
                        "market": "KOSDAQ",
                        "securityType": "common",
                        "industry": "반도체 제조업",
                        "products": "반도체 패키징, OSAT",
                    },
                    {
                        "symbol": "000011",
                        "name": "장비",
                        "market": "KOSDAQ",
                        "securityType": "common",
                        "industry": "특수 목적용 기계 제조업",
                        "products": "반도체 제조 장비",
                    },
                    {
                        "symbol": "000012",
                        "name": "소재",
                        "market": "KOSDAQ",
                        "securityType": "common",
                        "industry": "기초 화학물질 제조업",
                        "products": "반도체 소재",
                    },
                    {
                        "symbol": "000013",
                        "name": "IP",
                        "market": "KOSDAQ",
                        "securityType": "common",
                        "industry": "소프트웨어 개발 및 공급업",
                        "products": "반도체 IP 라이선스",
                    },
                ]
            },
            {"companies": {}},
        )
        by_symbol = {company["symbol"]: company for company in result["companies"]}
        expected = {
            "000010": "packaging-osat",
            "000011": "semiconductor-equipment",
            "000012": "semiconductor-materials-parts",
            "000013": "semiconductor-ip",
        }
        for symbol, subsector in expected.items():
            self.assertIn(
                subsector,
                [item["id"] for item in by_symbol[symbol]["classification"]["subSectors"]],
            )

    def test_primary_role_keeps_test_business_ahead_of_packaging_exposure(self):
        result = build_taxonomy(
            {
                "stocks": [
                    {
                        "symbol": "000020",
                        "name": "테스트전문",
                        "market": "KOSDAQ",
                        "securityType": "common",
                        "industry": "반도체 제조업",
                        "products": "반도체 패키징 OSAT, 반도체 테스트",
                    }
                ]
            },
            {"companies": {}},
        )
        classification = result["companies"][0]["classification"]
        self.assertEqual(classification["primaryRole"]["id"], "test-inspection")
        self.assertIn("packaging-osat", [role["id"] for role in classification["secondaryRoles"]])

    def test_role_tags_are_scoped_to_the_company_comparison_sector(self):
        result = build_taxonomy(
            {"stocks": [
                {"symbol": "000040", "name": "양극재", "market": "KOSDAQ", "securityType": "common", "industry": "일차전지 및 이차전지 제조업", "products": "이차전지 양극활물질"},
                {"symbol": "000041", "name": "자동차부품", "market": "KOSDAQ", "securityType": "common", "industry": "자동차 신품 부품 제조업", "products": "자동차부품 제조"},
            ]},
            {"companies": {
                "000040": {"status": "ok", "text": "당사는 이차전지 양극활물질을 생산하며 완성차 고객사에 공급합니다."},
                "000041": {"status": "ok", "text": "당사는 자동차부품을 생산하며 석유와 가스 가격 변동을 원가에 반영합니다."},
            }},
        )
        by_symbol = {company["symbol"]: company for company in result["companies"]}
        self.assertEqual(by_symbol["000040"]["classification"]["primaryRole"]["id"], "battery-cathode")
        self.assertEqual(by_symbol["000041"]["classification"]["primaryRole"]["id"], "auto-parts")
        self.assertNotIn("complete-vehicle", [role["id"] for role in by_symbol["000041"]["classification"]["subSectors"]])

    def test_keeps_wics_only_status_when_no_service_sector_rule_exists(self):
        result = build_taxonomy(
            {"stocks": [{"symbol": "000050", "name": "전자부품", "market": "KOSDAQ", "securityType": "common", "industry": "전자부품 제조업", "products": "전자부품"}]},
            {"companies": {}},
        )
        classification = result["companies"][0]["classification"]
        self.assertEqual(classification["status"], "wics-only")
        self.assertEqual(classification["wics"]["primarySector"]["id"], "information-technology")
        self.assertIsNone(classification["primaryComparisonSector"])

    def test_battery_cell_rule_excludes_parts_and_material_context(self):
        result = build_taxonomy(
            {"stocks": [
                {"symbol": "000060", "name": "셀제조", "market": "KOSPI", "securityType": "common", "industry": "일차전지 및 이차전지 제조업", "products": "2차전지 (소형, ESS, 자동차전지)"},
                {"symbol": "000061", "name": "안전부품", "market": "KOSDAQ", "securityType": "common", "industry": "일차전지 및 이차전지 제조업", "products": "2차전지용 안전 부품"},
                {"symbol": "000062", "name": "전해액", "market": "KOSDAQ", "securityType": "common", "industry": "기초 화학물질 제조업", "products": "2차전지 전해액"},
            ]},
            {"companies": {
                "000060": {"status": "ok", "text": "당사는 중대형전지와 소형전지 등의 리튬이온 2차전지를 생산 판매합니다."},
                "000061": {"status": "ok", "text": "당사는 리튬이온 2차전지에 들어가는 안전 관련 부품을 생산 판매합니다."},
                "000062": {"status": "ok", "text": "당사는 이차전지 전해액을 생산 판매합니다."},
            }},
        )
        by_symbol = {company["symbol"]: company for company in result["companies"]}
        self.assertEqual(by_symbol["000060"]["classification"]["primaryRole"]["id"], "battery-cell")
        self.assertIsNone(by_symbol["000061"]["classification"]["primaryRole"])
        self.assertEqual(by_symbol["000062"]["classification"]["primaryRole"]["id"], "battery-electrolyte")

    def test_biosimilar_brand_company_uses_the_pharma_industry_rule(self):
        result = build_taxonomy(
            {"stocks": [{"symbol": "000070", "name": "바이오기업", "market": "KOSPI", "securityType": "common", "industry": "기초 의약물질 제조업", "products": "브랜드 의약품"}]},
            {"companies": {"000070": {"status": "ok", "text": "당사는 바이오시밀러 제품을 개발하고 글로벌 시장에 판매합니다."}}},
        )
        classification = result["companies"][0]["classification"]
        self.assertEqual(classification["primaryComparisonSector"]["id"], "biopharma")
        self.assertEqual(classification["primaryRole"]["id"], "biosimilar-manufacturing")

    def test_cdmo_requires_the_company_to_operate_the_service(self):
        result = build_taxonomy(
            {"stocks": [
                {"symbol": "000080", "name": "일반제약", "market": "KOSPI", "securityType": "common", "industry": "의약품 제조업", "products": "완제의약품"},
                {"symbol": "000081", "name": "수탁제조", "market": "KOSDAQ", "securityType": "common", "industry": "의약품 제조업", "products": "바이오의약품 위탁개발생산(CDMO) 서비스"},
            ]},
            {"companies": {
                "000080": {"status": "ok", "text": "당사는 의약품을 판매하며 CDMO 시장의 성장과 경쟁 환경을 분석합니다."},
                "000081": {"status": "ok", "text": "당사는 바이오의약품 CDMO 서비스를 제공하는 사업을 영위합니다."},
            }},
        )
        by_symbol = {company["symbol"]: company for company in result["companies"]}
        self.assertNotIn("biopharma-cdmo", [role["id"] for role in by_symbol["000080"]["classification"]["subSectors"]])
        self.assertEqual(by_symbol["000081"]["classification"]["primaryRole"]["id"], "biopharma-cdmo")

    def test_biosimilar_role_splits_manufacturing_and_development(self):
        result = build_taxonomy(
            {"stocks": [
                {"symbol": "000090", "name": "바이오시밀러제조", "market": "KOSPI", "securityType": "common", "industry": "기초 의약물질 제조업", "products": "바이오시밀러 의약품 제조·판매"},
                {"symbol": "000091", "name": "바이오시밀러개발", "market": "KOSDAQ", "securityType": "common", "industry": "자연과학 및 공학 연구개발업", "products": "바이오시밀러 및 바이오베터 개발"},
                {"symbol": "000092", "name": "원료공급", "market": "KOSDAQ", "securityType": "common", "industry": "기초 의약물질 제조업", "products": "바이오시밀러 원료 소재"},
            ]},
            {"companies": {
                "000090": {"status": "ok", "text": "당사는 바이오시밀러 의약품을 생산하고 판매합니다."},
                "000091": {"status": "ok", "text": "당사는 바이오시밀러 개발과 기술이전을 수행합니다."},
                "000092": {"status": "ok", "text": "당사는 바이오시밀러 생산에 쓰이는 원료 소재를 공급합니다."},
            }},
        )
        by_symbol = {company["symbol"]: company for company in result["companies"]}
        self.assertEqual(by_symbol["000090"]["classification"]["primaryRole"]["id"], "biosimilar-manufacturing")
        self.assertEqual(by_symbol["000091"]["classification"]["primaryRole"]["id"], "biosimilar-development")
        self.assertEqual(by_symbol["000092"]["classification"]["primaryRole"]["id"], "biopharma")

    def test_platform_and_telecom_roles_do_not_mix_adjacent_businesses(self):
        result = build_taxonomy(
            {"stocks": [
                {"symbol": "000100", "name": "포털", "market": "KOSPI", "securityType": "common", "industry": "자료처리, 호스팅, 포털 및 기타 인터넷 정보매개 서비스업", "products": "포털 서비스 및 온라인 광고"},
                {"symbol": "000101", "name": "커머스", "market": "KOSDAQ", "securityType": "common", "industry": "자료처리, 호스팅, 포털 및 기타 인터넷 정보매개 서비스업", "products": "기업간 전자상거래 서비스"},
                {"symbol": "000102", "name": "이동통신", "market": "KOSPI", "securityType": "common", "industry": "전기 통신업", "products": "이동전화, 부가통신"},
                {"symbol": "000103", "name": "통신장비", "market": "KOSDAQ", "securityType": "common", "industry": "통신 및 방송 장비 제조업", "products": "이동통신중계기 제조"},
            ]},
            {"companies": {}},
        )
        by_symbol = {company["symbol"]: company for company in result["companies"]}
        self.assertEqual(by_symbol["000100"]["classification"]["primaryRole"]["id"], "portal-platform")
        self.assertEqual(by_symbol["000101"]["classification"]["primaryRole"]["id"], "commerce-platform")
        self.assertEqual(by_symbol["000102"]["classification"]["primaryRole"]["id"], "mobile-carrier")
        self.assertEqual(by_symbol["000103"]["classification"]["primaryRole"]["id"], "telecom-network-equipment")


if __name__ == "__main__":
    unittest.main()
