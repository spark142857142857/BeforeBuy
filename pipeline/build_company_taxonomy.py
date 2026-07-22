from __future__ import annotations

import argparse
import gzip
import json
import re
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = ROOT / "data" / "generated" / "kr_stocks.json"
BUSINESS_PATH = ROOT / "data" / "generated" / "dart_business.json.gz"
DEFAULT_OUTPUT = ROOT / "data" / "generated" / "kr_company_taxonomy.json"


# WICS is a reference taxonomy, not a copied company-to-WICS mapping. The
# service keeps the official KRX description and calculates its own labels so
# the result remains reproducible from public source data.
WICS_SECTORS = (
    ("energy", "에너지"),
    ("materials", "소재"),
    ("industrials", "산업재"),
    ("consumer-discretionary", "경기관련소비재"),
    ("consumer-staples", "필수소비재"),
    ("health-care", "건강관리"),
    ("financials", "금융"),
    ("information-technology", "IT"),
    ("communication-services", "커뮤니케이션서비스"),
    ("utilities", "유틸리티"),
)


def rule(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern, re.IGNORECASE)


# These labels intentionally stop at an investment-comparison level. They are
# not a claim that the company has only one business; a company can have several
# comparison sectors while just one is selected as its primary profile.
COMPARISON_SECTOR_RULES: tuple[tuple[str, str, str, re.Pattern[str]], ...] = (
    ("semiconductors", "반도체", "information-technology", rule(r"반도체|DRAM|NAND|HBM|파운드리|fabless")),
    ("secondary-battery", "2차전지", "materials", rule(r"2차\s*전지|이차\s*전지|리튬\s*이온|양극재|음극재|전해질|분리막|배터리\s*셀")),
    ("biopharma", "바이오·제약", "health-care", rule(r"바이오|의약품|의약물질|신약|바이오시밀러|의료용\s*의약|진단\s*(시약|키트)")),
    ("health-care-equipment", "의료기기", "health-care", rule(r"의료용\s*기기|의료기기|임플란트|치과용|체외\s*진단")),
    ("automotive", "자동차·부품", "consumer-discretionary", rule(r"자동차|완성차|차량용|전기차\s*(부품|충전)|모빌리티")),
    ("software", "소프트웨어", "information-technology", rule(r"소프트웨어|\bSaaS\b|시스템\s*(통합|개발)|IT\s*서비스|인공지능\s*(서비스|솔루션)")),
    ("internet-platform", "인터넷·플랫폼", "communication-services", rule(r"인터넷\s*(서비스|플랫폼)|온라인\s*플랫폼|전자상거래|이커머스|포털\s*(서비스|사업)?|\bO2O\b")),
    ("telecom", "통신", "communication-services", rule(r"통신\s*(서비스|업)|이동통신|무선통신|위성방송")),
    ("media-entertainment", "미디어·엔터", "communication-services", rule(r"영화\s*(제작|배급)|방송프로그램\s*(제작|배급)|음반\s*(제작|유통)|엔터테인먼트|게임\s*(소프트웨어|개발)|웹툰")),
    ("financials", "금융", "financials", rule(r"은행|증권|보험|신탁|집합투자|여신|금융\s*(업|서비스)")),
    ("chemicals", "화학", "materials", rule(r"화학제품|석유화학|정밀\s*화학|합성수지|폴리머|고분자")),
    ("metals", "철강·비철", "materials", rule(r"철강|금속|알루미늄|동\s*(압연|가공)|비철")),
    ("energy", "에너지", "energy", rule(r"석유|도시\s*가스|연료용\s*가스|\bLPG\b|태양광|풍력|발전\s*(설비|사업)|재생에너지")),
    ("industrial-equipment", "산업장비", "industrials", rule(r"산업용\s*기계|특수\s*목적용\s*기계|일반\s*목적용\s*기계|공작기계|로봇|자동화\s*(?:장비|기기)|플랜트")),
    ("defense", "방산·항공우주", "industrials", rule(r"방산|국방|항공기|항공우주|미사일|함정")),
    ("construction", "건설·건자재", "industrials", rule(r"건설|토목|시멘트|레미콘|건축\s*(자재|제품)")),
    ("transport-logistics", "운송·물류", "industrials", rule(r"운송|물류|해운|항공\s*화물|택배|항만")),
    ("retail", "유통", "consumer-discretionary", rule(r"소매|백화점|할인점|홈쇼핑")),
    ("food-beverage", "식품·음료", "consumer-staples", rule(r"식품|음료|주류|담배|사료")),
    ("consumer-goods", "소비재", "consumer-discretionary", rule(r"화장품|의류|신발|가구|레저|생활용품")),
    ("real-estate", "부동산", "financials", rule(r"부동산|리츠|임대\s*및\s*공급")),
    ("utilities", "유틸리티", "utilities", rule(r"전기\s*유틸리티|가스\s*유틸리티|수도\s*(사업|공급)")),
)


# A comparison sector needs a fairly specific business signal. WICS-level
# coverage is broader: when a company cannot yet receive a defensible service
# comparison sector, retain a deterministic broad classification rather than
# pretending that it has a direct peer group.
WICS_FALLBACK_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("information-technology", rule(r"전자부품|통신\s*및\s*방송\s*장비|영상\s*및\s*음향|컴퓨터\s*및\s*주변장치|정밀기기|광학기기")),
    ("health-care", rule(r"연구개발|의약물질|의약\s*관련|의료용품")),
    ("financials", rule(r"금융\s*(지원|서비스)|보험|은행|증권")),
    ("communication-services", rule(r"광고업|출판|방송|정보\s*서비스|포털|예술")),
    ("industrials", rule(r"기계|선박|건축|엔지니어링|사업지원|전기\s*및\s*통신\s*공사|운송|도매")),
    ("materials", rule(r"화학|플라스틱|고무|종이|판지|섬유|유리|요업|금속|비료|농약")),
    ("consumer-staples", rule(r"식품|음료|담배|사료|농축산|어업")),
    ("consumer-discretionary", rule(r"의복|가죽|숙박|여행|레저|가정용\s*기기|소매")),
    ("utilities", rule(r"전력|가스|수도")),
)


TAG_RULES: dict[str, tuple[tuple[str, str, re.Pattern[str]], ...]] = {
    "valueChainRoles": (
        ("design", "설계", rule(r"팹리스|fabless|반도체\s*설계")),
        ("manufacturing", "제조", rule(r"제조|생산|파운드리|foundry")),
        ("equipment", "장비", rule(r"반도체\s*(제조\s*)?장비|\bALD\b|\bCVD\b|\bPVD\b|증착\s*장비|식각\s*장비")),
        ("materials", "소재", rule(r"반도체\s*소재|양극재|음극재|전해질|분리막")),
        ("service", "서비스", rule(r"서비스|플랫폼|운영|컨설팅")),
    ),
    "businessModels": (
        ("memory-manufacturing", "메모리 제조", rule(r"반도체\s*제조\s*\(\s*메모리|메모리\s*반도체\s*(?:제조|생산)")),
        ("foundry", "파운드리", rule(r"파운드리\s*(?:사업|제조|기업)|foundry\s*(?:business|manufactur|company)|웨이퍼\s*수탁")),
        ("fabless", "팹리스", rule(r"팹리스\s*(?:기업|회사|전문)|fabless\s*(?:company|firm)")),
        # "반도체 설계 전문기업"은 팹리스도 넓게 쓰는 표현이다. 설계 전문이라는
        # 말만으로 디자인하우스로 분류하지 않고, DSP/디자인하우스 사업을 직접
        # 가리키는 표현만 사용한다.
        ("design-house", "디자인하우스", rule(r"디자인하우스\s*(?:기업|사업|서비스|DSP)|(?:파운드리\s*)?디자인\s*(?:솔루션|서비스)\s*(?:기업|사업|파트너|DSP)")),
        ("semiconductor-ip", "반도체 IP", rule(r"반도체\s*IP|\bIP\s*(?:코어|라이선스)")),
        # 패키징 공정에 쓰이는 검사 장비까지 OSAT로 분류하지 않는다.
        ("packaging-osat", "패키징·OSAT", rule(r"반도체\s*(?:패키징|후공정)\s*(?:사업|서비스|전문\s*기업|조립\s*서비스)|\bOSAT\b")),
        ("test-inspection", "테스트·검사", rule(r"반도체\s*(?:테스트|검사)|테스트\s*(?:핸들러|소켓)|프로브\s*(?:카드|핀)")),
        ("semiconductor-equipment", "반도체 장비", rule(r"반도체\s*(?:제조\s*)?장비|반도체\s*(?:증착|식각|세정)\s*장비")),
        ("semiconductor-materials-parts", "반도체 소재·부품", rule(r"반도체\s*(?:소재|부품)|반도체용\s*(?:소재|부품|케미컬|가스)")),
        ("battery-cell", "배터리 셀", rule(r"배터리\s*셀|리튬\s*이온\s*전지|(?:이차|2차)\s*전지\s*(?:셀|완제품|\(\s*(?:소형|ESS|자동차전지))")),
        ("battery-cathode", "양극재", rule(r"양극(?:재|활물질|소재)")),
        ("battery-anode", "음극재", rule(r"음극(?:재|활물질|소재)")),
        ("battery-separator", "분리막", rule(r"분리막")),
        ("battery-electrolyte", "전해질", rule(r"전해(?:질|액)")),
        ("battery-equipment", "배터리 장비", rule(r"(?:이차|2차)\s*전지\s*(?:제조\s*)?장비|배터리\s*(?:제조\s*)?장비")),
        ("battery-recycling", "배터리 재활용", rule(r"폐\s*배터리|배터리\s*(?:재활용|리사이클)")),
        ("biopharma", "바이오·제약", rule(r"의약품|신약|바이오시밀러")),
        ("biopharma-cdmo", "CDMO", rule(r"\bCDMO\b|위탁\s*(?:개발|생산)|바이오\s*의약품\s*생산")),
        ("biosimilar", "바이오시밀러", rule(r"바이오시밀러")),
        ("biosimilar-manufacturing", "바이오시밀러 제조·판매", rule(r"바이오시밀러\s*(?:의약품|제품)?[\s,·ㆍ]*(?:제조|생산|판매|품목허가)")),
        ("biosimilar-development", "바이오시밀러 개발·플랫폼", rule(r"바이오시밀러\s*(?:및\s*바이오베터|개발|기술(?:수출|이전)?|임상|후보)")),
        ("drug-discovery", "신약 개발", rule(r"신약\s*(?:개발|후보|파이프라인)|임상\s*(?:시험|개발)")),
        ("diagnostics", "진단", rule(r"체외\s*진단|진단\s*(?:시약|키트)")),
        ("complete-vehicle", "완성차", rule(r"완성차|자동차용\s*엔진\s*및\s*자동차\s*제조업")),
        ("auto-parts", "자동차 부품", rule(r"자동차\s*부품|차량용\s*부품")),
        ("tire", "타이어", rule(r"타이어")),
        ("ev-components", "전동화 부품", rule(r"전기차\s*부품|전동화\s*부품|전기\s*구동")),
        ("it-service", "IT 서비스", rule(r"IT\s*서비스|시스템\s*(?:통합|개발)|\bSI\b")),
        ("saas", "SaaS", rule(r"\bSaaS\b")),
        ("game", "게임", rule(r"게임\s*(?:소프트웨어|개발|서비스)")),
        ("security-software", "보안 소프트웨어", rule(r"정보\s*보안\s*(?:소프트웨어|서비스)|보안\s*소프트웨어")),
        ("bank", "은행", rule(r"은행")),
        ("securities", "증권", rule(r"증권")),
        ("insurance", "보험", rule(r"보험")),
        ("credit-finance", "여신·카드", rule(r"여신|신용카드|할부금융")),
        ("financial-holding", "금융지주", rule(r"금융지주(?:회사)?")),
        ("oil-gas", "석유·가스", rule(r"석유|가스")),
        ("renewable-energy", "재생에너지", rule(r"태양광|풍력|재생에너지")),
        ("utility-service", "유틸리티", rule(r"전기\s*유틸리티|가스\s*유틸리티|수도\s*(?:사업|공급)")),
        ("defense-aerospace", "방산·항공우주", rule(r"방산|국방|항공우주|미사일|함정")),
        ("telecom-service", "통신 서비스", rule(r"이동통신|통신\s*서비스|통신\s*업")),
        ("platform-service", "플랫폼", rule(r"인터넷\s*(?:서비스|플랫폼)|온라인\s*플랫폼|전자상거래|이커머스|포털\s*(?:서비스|사업)?")),
        ("portal-platform", "포털·광고 플랫폼", rule(r"포털\s*서비스|인터넷\s*서비스\s*\([^)]*광고|온라인\s*광고")),
        ("commerce-platform", "커머스 플랫폼", rule(r"전자상거래|이커머스|쇼핑몰\s*(?:솔루션|플랫폼)|기업간\s*전자상거래|B2B\s*전자상거래")),
        ("content-platform", "콘텐츠 플랫폼", rule(r"웹툰|웹소설|콘텐츠\s*플랫폼")),
        # KRX's broad "자료처리·호스팅·포털" industry label applies to portal
        # operators too, so do not treat the word "호스팅" in that label as an
        # infrastructure business. Require a product-level service instead.
        ("platform-infrastructure", "인터넷 인프라", rule(r"인터넷\s*연동\s*서비스|데이터센터|호스팅\s*(?:서비스|솔루션)")),
        ("mobile-carrier", "이동통신 사업자", rule(r"이동전화|개인휴대통신|유무선통신사업|공중전기통신")),
        ("telecom-reseller", "통신 재판매", rule(r"알뜰폰|국제전화")),
        ("telecom-network-equipment", "통신망 장비", rule(r"이동통신\s*(?:중계기|장비)|통신\s*(?:중계기|장비)|기지국")),
        ("financial-service", "금융 서비스", rule(r"은행|증권|보험|여신")),
        ("software-service", "소프트웨어·서비스", rule(r"소프트웨어|\bSaaS\b|IT\s*서비스")),
    ),
    "technologies": (
        ("advanced-process", "첨단 공정", rule(r"첨단\s*공정|\bEUV\b")),
        ("mature-process", "성숙 공정", rule(r"성숙\s*공정|8\s*인치|아날로그\s*반도체|전력\s*반도체")),
        ("integrated-device", "종합 반도체", rule(r"종합\s*반도체|\bIDM\b")),
        ("biologics", "바이오의약품", rule(r"바이오시밀러|항체\s*의약품|세포\s*치료")),
    ),
    "products": (
        ("hbm", "HBM", rule(r"HBM")),
        ("dram", "DRAM", rule(r"DRAM")),
        ("nand", "NAND", rule(r"NAND")),
        ("power-analog", "전력·아날로그", rule(r"전력\s*반도체|아날로그\s*반도체|\bMOSFET\b|\bIGBT\b|\bSiC\b|\bGaN\b")),
        ("storage-controller", "스토리지 컨트롤러", rule(r"(?:SSD|낸드)\s*컨트롤러|스토리지\s*컨트롤러")),
        ("battery-materials", "배터리 소재", rule(r"양극재|음극재|전해질|분리막")),
        ("biosimilar", "바이오시밀러", rule(r"바이오시밀러")),
    ),
    "demandMarkets": (
        ("ai-data-center", "AI 데이터센터", rule(r"AI\s*(데이터센터|서버)|인공지능\s*(데이터센터|서버)|HBM")),
        ("mobile", "모바일", rule(r"모바일|스마트폰|휴대폰")),
        ("automotive", "자동차", rule(r"자동차|전기차|차량용")),
        ("industrial", "산업", rule(r"산업용|공장|플랜트")),
        ("health-care", "의료", rule(r"의료|병원|의약품")),
    ),
    "earningsDrivers": (
        ("memory-prices", "메모리 가격", rule(r"메모리\s*(가격|시황|수요|시장)|(?:DRAM|NAND).{0,28}(?:가격|수요|시장)")),
        ("foundry-utilization", "파운드리 가동률", rule(r"파운드리|foundry|웨이퍼\s*수탁")),
        ("semiconductor-capex", "반도체 CAPEX", rule(r"반도체\s*(장비|공정)|반도체\s*용\s*(ALD|CVD|PVD)")),
        ("battery-demand", "전기차·배터리 수요", rule(r"2차\s*전지|이차\s*전지|전기차|배터리")),
        ("drug-approval", "허가·판매 확대", rule(r"신약|의약품|바이오시밀러|임상")),
        ("interest-rates", "금리", rule(r"은행|증권|보험|여신")),
    ),
}


# Unlike KRX product text, an annual report also describes customers, suppliers
# and the market. These narrower patterns require a direct product/operation
# claim before DART can add a detailed tag. They deliberately do not infer
# demand or earnings-driver tags from a single report mention.
DART_TAG_RULES: dict[str, tuple[tuple[str, str, re.Pattern[str]], ...]] = {
    "valueChainRoles": (
        ("design", "설계", rule(r"(?:당사|회사|사업부)[\s\S]{0,110}(?:팹리스|fabless)[\s\S]{0,80}(?:설계|개발|사업|전문)")),
        ("equipment", "장비", rule(r"반도체\s*장비[\s\S]{0,80}(?:생산|제조|판매|주력)|(?:당사|회사)[\s\S]{0,90}반도체\s*장비")),
        ("materials", "소재", rule(r"반도체\s*소재[\s\S]{0,80}(?:생산|제조|판매|주력)|(?:당사|회사)[\s\S]{0,90}반도체\s*소재")),
    ),
    "businessModels": (
        ("memory-manufacturing", "메모리 제조", rule(r"(?:당사(?:\s*및\s*(?:당사의\s*)?종속기업)?의?\s*주력\s*제품(?:은|으로)?|(?:DS|반도체)\s*부문)[\s\S]{0,100}(?:DRAM|NAND|HBM)[\s\S]{0,80}메모리\s*반도체")),
        ("foundry", "파운드리", rule(r"(?:당사|회사)(?:는|가)[\s\S]{0,70}(?:(?:순수\s*)?파운드리\s*기업|(?:파운드리|Foundry)\s*사업(?:을|도)[\s\S]{0,24}(?:영위|병행))")),
        ("fabless", "팹리스", rule(r"(?:당사|연결회사)(?:는|가)[\s\S]{0,70}(?:팹리스(?:\s*\([^)]*\))?\s*(?:기업|회사|전문\s*기업|전문\s*회사)|(?:반도체|시스템\s*반도체|보안\s*반도체)\s*설계\s*전문\s*기업|fabless\s*(?:company|firm))")),
        ("design-house", "디자인하우스", rule(r"(?:당사|회사)(?:는|가)[\s\S]{0,80}(?:디자인하우스\s*(?:기업|사업|서비스|DSP)|(?:파운드리\s*)?디자인\s*(?:솔루션|서비스)\s*(?:기업|사업|파트너|DSP))")),
        ("semiconductor-ip", "반도체 IP", rule(r"(?:당사|회사)(?:는|가)[\s\S]{0,80}(?:반도체\s*IP|IP\s*(?:코어|라이선스))[\s\S]{0,60}(?:사업|개발|판매|제공)")),
        ("packaging-osat", "패키징·OSAT", rule(r"(?:당사|회사)(?:는|가)[\s\S]{0,90}(?:반도체\s*(?:패키징|후공정)\s*(?:사업|서비스|전문\s*기업|조립\s*서비스)|OSAT\s*(?:사업|서비스|전문|기업))")),
        ("test-inspection", "테스트·검사", rule(r"(?:당사|회사)(?:는|가)[\s\S]{0,90}반도체\s*(?:테스트|검사)[\s\S]{0,60}(?:사업|전문|서비스|장비|제품)")),
        ("semiconductor-equipment", "반도체 장비", rule(r"(?:당사|회사)(?:는|가)[\s\S]{0,90}반도체\s*(?:제조\s*)?장비[\s\S]{0,60}(?:생산|제조|판매|사업|전문)")),
        ("semiconductor-materials-parts", "반도체 소재·부품", rule(r"(?:당사|회사)(?:는|가)[\s\S]{0,90}반도체\s*(?:소재|부품)[\s\S]{0,60}(?:생산|제조|판매|사업|전문)")),
        # Component makers often describe the battery cells their parts enter.
        # Keep the company subject close to a cell product and reject an
        # immediately following component/material relationship.
        ("battery-cell", "배터리 셀", rule(r"당사(?:는|가)(?![\s\S]{0,110}(?:전지\s*에\s*들어가는|전지용\s*(?:부품|소재)|안전\s*관련\s*부품|보호회로))[\s\S]{0,35}(?:배터리\s*셀|리튬\s*이온\s*(?:2차\s*)?전지|(?:중[ㆍ·-]?대형|소형)\s*(?:2차\s*)?전지)(?![\s,·ㆍ]*(?:에\s*들어가는|용\s*(?:부품|소재)|부품|소재))[\s\S]{0,65}(?:생산|제조|판매|사업)")),
        ("battery-cathode", "양극재", rule(r"(?:당사|회사)[\s\S]{0,90}양극(?:재|활물질|소재)[\s\S]{0,60}(?:생산|제조|판매|사업)")),
        ("battery-anode", "음극재", rule(r"(?:당사|회사)[\s\S]{0,90}음극(?:재|활물질|소재)[\s\S]{0,60}(?:생산|제조|판매|사업)")),
        ("battery-separator", "분리막", rule(r"(?:당사|회사)[\s\S]{0,90}분리막[\s\S]{0,60}(?:생산|제조|판매|사업)")),
        ("battery-electrolyte", "전해질", rule(r"(?:당사|회사)[\s\S]{0,90}전해(?:질|액)[\s\S]{0,60}(?:생산|제조|판매|사업)")),
        ("battery-equipment", "배터리 장비", rule(r"(?:당사|회사)[\s\S]{0,90}(?:이차|2차)\s*전지\s*(?:제조\s*)?장비[\s\S]{0,60}(?:생산|제조|판매|사업)")),
        ("battery-recycling", "배터리 재활용", rule(r"(?:당사|회사)[\s\S]{0,90}(?:폐\s*배터리|배터리\s*(?:재활용|리사이클))[\s\S]{0,60}(?:사업|처리|회수)")),
        ("biopharma", "바이오·제약", rule(r"(?:당사|회사)[\s\S]{0,110}(?:의약품|신약|바이오시밀러)[\s\S]{0,90}(?:개발|생산|판매|사업)")),
        # A generic discussion of the CDMO market is not enough. The opening
        # business overview must state that the company itself operates the
        # contract-development/manufacturing service.
        ("biopharma-cdmo", "CDMO", rule(r"(?:당사|회사)(?:는|가)?[\s\S]{0,70}(?:CDMO\s*서비스[\s\S]{0,55}(?:사업|제공|영위)|\bCDO/CDMO\b[\s\S]{0,55}(?:서비스[\s\S]{0,25}(?:사업|제공|영위)|사업(?:을|으로)?[\s\S]{0,20}(?:영위|운영|제공))|바이오\s*의약품\s*위탁개발생산[\s\S]{0,55}(?:서비스|사업|영위))")),
        ("biosimilar", "바이오시밀러", rule(r"당사[\s\S]{0,120}바이오시밀러[\s\S]{0,45}(?:제품|의약품|개발|생산|판매|품목허가)")),
        # Keep the subject close to the biosimilar claim. This prevents a
        # supplier, customer, or corporate-restructuring disclosure from
        # becoming the company's direct biosimilar role.
        # "바이오시밀러 생산에 쓰이는 원료" is a supplier claim, not a
        # biosimilar manufacturer's own product.  Keep the direct-role tag for
        # the company that makes or sells the medicine itself.
        ("biosimilar-manufacturing", "바이오시밀러 제조·판매", rule(r"당사(?:는|가)[\s\S]{0,75}바이오시밀러[\s\S]{0,45}(?:(?:제품|의약품)[\s\S]{0,45}(?:판매|출시|상업화|품목허가)|생산(?!에\s*(?:쓰이는|사용(?:되는)?|필요한))|제조|판매)")),
        ("biosimilar-development", "바이오시밀러 개발·플랫폼", rule(r"당사(?:는|가)[\s\S]{0,75}바이오시밀러[\s\S]{0,55}(?:개발|기술(?:수출|이전)?|임상|후보)")),
        ("drug-discovery", "신약 개발", rule(r"(?:당사|회사)[\s\S]{0,110}(?:신약\s*(?:개발|후보|파이프라인)|임상\s*(?:시험|개발))[\s\S]{0,90}(?:개발|사업|진행)")),
        ("diagnostics", "진단", rule(r"(?:당사|회사)[\s\S]{0,110}(?:체외\s*진단|진단\s*(?:시약|키트))[\s\S]{0,90}(?:개발|생산|판매|사업)")),
        # KRX's "자동차용 엔진 및 자동차 제조업" distinguishes vehicle makers
        # from parts suppliers. Annual reports frequently use "완성차 생산" for
        # customers, so they are deliberately not used to add this role.
        ("complete-vehicle", "완성차", rule(r"(?!)")),
        ("auto-parts", "자동차 부품", rule(r"(?:당사|회사)[\s\S]{0,100}(?:자동차|차량용)\s*부품[\s\S]{0,70}(?:생산|제조|판매|사업)")),
        ("tire", "타이어", rule(r"(?:당사|회사)[\s\S]{0,100}타이어[\s\S]{0,70}(?:생산|제조|판매|사업)")),
        ("ev-components", "전동화 부품", rule(r"(?:당사|회사)[\s\S]{0,100}(?:전기차|전동화)\s*부품[\s\S]{0,70}(?:생산|제조|판매|사업)")),
        ("financial-service", "금융 서비스", rule(r"(?:당사|회사)[\s\S]{0,110}(?:은행|증권|보험|여신)[\s\S]{0,90}(?:사업|서비스|영위)")),
        ("bank", "은행", rule(r"(?:당사|회사)[\s\S]{0,110}은행[\s\S]{0,90}(?:사업|서비스|영위)")),
        ("securities", "증권", rule(r"(?:당사|회사)[\s\S]{0,110}증권[\s\S]{0,90}(?:사업|서비스|영위)")),
        ("insurance", "보험", rule(r"(?:당사|회사)[\s\S]{0,110}보험[\s\S]{0,90}(?:사업|서비스|영위)")),
        ("credit-finance", "여신·카드", rule(r"(?:당사|회사)[\s\S]{0,110}(?:여신|신용카드|할부금융)[\s\S]{0,90}(?:사업|서비스|영위)")),
        ("financial-holding", "금융지주", rule(r"당사[\s\S]{0,60}(?:금융지주|금융업\s*지주회사|순수\s*지주회사)[\s\S]{0,100}(?:은행업|금융투자업|보험업|여신전문업|금융그룹)")),
        ("software-service", "소프트웨어·서비스", rule(r"(?:당사|회사)[\s\S]{0,110}(?:소프트웨어|SaaS|IT\s*서비스)[\s\S]{0,90}(?:개발|판매|서비스|사업)")),
        ("it-service", "IT 서비스", rule(r"(?:당사|회사)[\s\S]{0,110}(?:IT\s*서비스|시스템\s*(?:통합|개발)|SI)[\s\S]{0,90}(?:개발|판매|서비스|사업)")),
        ("saas", "SaaS", rule(r"(?:당사|회사)[\s\S]{0,110}SaaS[\s\S]{0,90}(?:개발|판매|서비스|사업)")),
        ("game", "게임", rule(r"(?:당사|회사)[\s\S]{0,110}게임\s*(?:소프트웨어|개발|서비스)[\s\S]{0,90}(?:개발|판매|서비스|사업)")),
        ("security-software", "보안 소프트웨어", rule(r"(?:당사|회사)[\s\S]{0,110}(?:정보\s*보안|보안)\s*(?:소프트웨어|서비스)[\s\S]{0,90}(?:개발|판매|서비스|사업)")),
        ("oil-gas", "석유·가스", rule(r"(?:당사|회사)[\s\S]{0,110}(?:석유|가스)[\s\S]{0,90}(?:생산|판매|사업|공급)")),
        ("renewable-energy", "재생에너지", rule(r"(?:당사|회사)[\s\S]{0,110}(?:태양광|풍력|재생에너지)[\s\S]{0,90}(?:생산|발전|사업|공급)")),
        ("utility-service", "유틸리티", rule(r"(?:당사|회사)[\s\S]{0,110}(?:전기|가스|수도)\s*(?:사업|공급)[\s\S]{0,90}(?:사업|공급|서비스|영위)")),
        ("defense-aerospace", "방산·항공우주", rule(r"(?:당사|회사)[\s\S]{0,110}(?:방산|국방|항공우주|미사일|함정)[\s\S]{0,90}(?:생산|제조|판매|사업)")),
        ("telecom-service", "통신 서비스", rule(r"(?:당사|회사)[\s\S]{0,110}(?:이동통신|통신\s*서비스|통신\s*업)[\s\S]{0,90}(?:사업|서비스|영위)")),
        ("platform-service", "플랫폼", rule(r"(?:당사|회사)[\s\S]{0,110}(?:인터넷\s*(?:서비스|플랫폼)|온라인\s*플랫폼|전자상거래|이커머스)[\s\S]{0,90}(?:사업|서비스|운영)")),
        ("portal-platform", "포털·광고 플랫폼", rule(r"(?:당사|회사)(?:는|가)[\s\S]{0,80}(?:포털\s*서비스|인터넷\s*서비스[\s\S]{0,30}광고|온라인\s*광고)[\s\S]{0,60}(?:사업|서비스|운영|판매)")),
        ("commerce-platform", "커머스 플랫폼", rule(r"(?:당사|회사)(?:는|가)[\s\S]{0,80}(?:전자상거래|이커머스|쇼핑몰\s*(?:솔루션|플랫폼)|기업간\s*전자상거래)[\s\S]{0,60}(?:사업|서비스|운영|판매)")),
        ("content-platform", "콘텐츠 플랫폼", rule(r"(?:당사|회사)(?:는|가)[\s\S]{0,80}(?:웹툰|웹소설|콘텐츠\s*플랫폼)[\s\S]{0,60}(?:사업|서비스|운영|판매)")),
        ("platform-infrastructure", "인터넷 인프라", rule(r"(?:당사|회사)(?:는|가)[\s\S]{0,80}(?:호스팅|인터넷\s*연동|데이터센터)[\s\S]{0,60}(?:사업|서비스|운영|제공)")),
        ("mobile-carrier", "이동통신 사업자", rule(r"(?:당사|회사)(?:는|가)[\s\S]{0,80}(?:이동전화|개인휴대통신|유무선통신|공중전기통신)[\s\S]{0,60}(?:사업|서비스|영위|제공)")),
        ("telecom-reseller", "통신 재판매", rule(r"(?:당사|회사)(?:는|가)[\s\S]{0,80}(?:알뜰폰|국제전화)[\s\S]{0,60}(?:사업|서비스|영위|제공)")),
        ("telecom-network-equipment", "통신망 장비", rule(r"(?:당사|회사)(?:는|가)[\s\S]{0,80}(?:이동통신\s*(?:중계기|장비)|통신\s*(?:중계기|장비)|기지국)[\s\S]{0,60}(?:생산|제조|판매|사업)")),
    ),
    "technologies": (
        ("advanced-process", "첨단 공정", rule(r"(?:당사|회사|사업부)[\s\S]{0,100}(?:첨단\s*공정|EUV)")),
        ("mature-process", "성숙 공정", rule(r"(?:당사|회사|사업부)[\s\S]{0,100}(?:성숙\s*공정|8\s*인치|레거시\s*공정)")),
        ("biologics", "바이오의약품", rule(r"(?:당사|회사)[\s\S]{0,100}(?:바이오시밀러|항체\s*의약품|세포\s*치료)")),
    ),
    "products": (
        ("hbm", "HBM", rule(r"(?:HBM)[\s\S]{0,80}(?:생산|제조|판매|주력|제품)")),
        ("dram", "DRAM", rule(r"(?:DRAM)[\s\S]{0,80}(?:생산|제조|판매|주력|제품)")),
        ("nand", "NAND", rule(r"(?:NAND)[\s\S]{0,80}(?:생산|제조|판매|주력|제품)")),
        ("power-analog", "전력·아날로그", rule(r"(?:전력\s*반도체|아날로그\s*반도체|MOSFET|IGBT|SiC|GaN)[\s\S]{0,80}(?:생산|제조|판매|주력|제품)")),
        ("storage-controller", "스토리지 컨트롤러", rule(r"(?:SSD|낸드|스토리지)\s*컨트롤러[\s\S]{0,80}(?:개발|생산|판매|주력|제품)")),
        ("battery-materials", "배터리 소재", rule(r"(?:양극재|음극재|전해질|분리막)[\s\S]{0,80}(?:생산|제조|판매|주력|제품)")),
        ("biosimilar", "바이오시밀러", rule(r"바이오시밀러[\s\S]{0,80}(?:개발|생산|판매|제품)")),
    ),
    "demandMarkets": (),
    "earningsDrivers": (),
}


# DART business reports describe suppliers, customers, finance and general
# market conditions as well as the company's own products. A DART-only match is
# therefore accepted only when KRX already placed the company in the compatible
# comparison sector. KRX remains the gatekeeper for a primary sector.
DART_TAG_SECTOR_SCOPE: dict[str, dict[str, set[str]]] = {
    "valueChainRoles": {
        "design": {"semiconductors"},
        "equipment": {"semiconductors", "industrial-equipment"},
        "materials": {"semiconductors", "secondary-battery", "chemicals"},
    },
    "businessModels": {
        "memory-manufacturing": {"semiconductors"},
        "foundry": {"semiconductors"},
        "fabless": {"semiconductors"},
        "design-house": {"semiconductors"},
        "semiconductor-ip": {"semiconductors"},
        "packaging-osat": {"semiconductors"},
        "test-inspection": {"semiconductors"},
        "semiconductor-equipment": {"semiconductors"},
        "semiconductor-materials-parts": {"semiconductors"},
        "battery-cell": {"secondary-battery"},
        "battery-cathode": {"secondary-battery"},
        "battery-anode": {"secondary-battery"},
        "battery-separator": {"secondary-battery"},
        "battery-electrolyte": {"secondary-battery"},
        "battery-equipment": {"secondary-battery"},
        "battery-recycling": {"secondary-battery"},
        "biopharma": {"biopharma"},
        "biopharma-cdmo": {"biopharma"},
        "biosimilar": {"biopharma"},
        "biosimilar-manufacturing": {"biopharma"},
        "biosimilar-development": {"biopharma"},
        "drug-discovery": {"biopharma"},
        "diagnostics": {"biopharma"},
        "complete-vehicle": {"automotive"},
        "auto-parts": {"automotive"},
        "tire": {"automotive"},
        "ev-components": {"automotive"},
        "financial-service": {"financials"},
        "bank": {"financials"},
        "securities": {"financials"},
        "insurance": {"financials"},
        "credit-finance": {"financials"},
        "financial-holding": {"financials"},
        "software-service": {"software"},
        "it-service": {"software"},
        "saas": {"software"},
        "game": {"software", "media-entertainment"},
        "security-software": {"software"},
        "oil-gas": {"energy"},
        "renewable-energy": {"energy"},
        "utility-service": {"utilities"},
        "defense-aerospace": {"defense"},
        "telecom-service": {"telecom"},
        "platform-service": {"internet-platform"},
        "portal-platform": {"internet-platform"},
        "commerce-platform": {"internet-platform"},
        "content-platform": {"internet-platform"},
        "platform-infrastructure": {"internet-platform"},
        "mobile-carrier": {"telecom"},
        "telecom-reseller": {"telecom"},
        "telecom-network-equipment": {"telecom"},
    },
    "technologies": {
        "advanced-process": {"semiconductors"},
        "mature-process": {"semiconductors"},
        "integrated-device": {"semiconductors"},
        "biologics": {"biopharma"},
    },
    "products": {
        "hbm": {"semiconductors"},
        "dram": {"semiconductors"},
        "nand": {"semiconductors"},
        "power-analog": {"semiconductors"},
        "storage-controller": {"semiconductors"},
        "battery-materials": {"secondary-battery"},
        "biosimilar": {"biopharma"},
    },
    "demandMarkets": {
        "ai-data-center": {"semiconductors"},
        "mobile": {"semiconductors", "secondary-battery", "automotive"},
        "automotive": {"semiconductors", "secondary-battery", "automotive"},
        "industrial": {"semiconductors", "industrial-equipment", "energy"},
        "health-care": {"biopharma", "health-care-equipment"},
    },
    "earningsDrivers": {
        "memory-prices": {"semiconductors"},
        "foundry-utilization": {"semiconductors"},
        "semiconductor-capex": {"semiconductors"},
        "battery-demand": {"secondary-battery"},
        "drug-approval": {"biopharma"},
        "interest-rates": {"financials"},
    },
}


# A comparison sector is still broad: memory and foundry should not look like
# the same choice just because both are semiconductors. These sub-sectors are
# derived from business-model tags, so they can remain empty rather than force a
# guess for a company with insufficient source evidence.
SUBSECTOR_RULES: dict[str, tuple[tuple[str, str, str], ...]] = {
    "semiconductors": (
        ("integrated-device", "IDM", "integrated-device"),
        ("memory", "메모리 제조", "memory-manufacturing"),
        ("foundry", "파운드리", "foundry"),
        ("fabless", "팹리스", "fabless"),
        ("design-house", "디자인하우스", "design-house"),
        ("semiconductor-ip", "반도체 IP", "semiconductor-ip"),
        ("packaging-osat", "패키징·OSAT", "packaging-osat"),
        ("test-inspection", "테스트·검사", "test-inspection"),
        ("semiconductor-equipment", "반도체 장비", "semiconductor-equipment"),
        ("semiconductor-materials-parts", "반도체 소재·부품", "semiconductor-materials-parts"),
    ),
    "secondary-battery": (
        ("battery-cell", "배터리 셀", "battery-cell"),
        ("battery-cathode", "양극재", "battery-cathode"),
        ("battery-anode", "음극재", "battery-anode"),
        ("battery-separator", "분리막", "battery-separator"),
        ("battery-electrolyte", "전해질", "battery-electrolyte"),
        ("battery-equipment", "배터리 장비", "battery-equipment"),
        ("battery-recycling", "배터리 재활용", "battery-recycling"),
    ),
    "biopharma": (
        ("biopharma-cdmo", "CDMO", "biopharma-cdmo"),
        ("biosimilar-manufacturing", "바이오시밀러 제조·판매", "biosimilar-manufacturing"),
        ("biosimilar-development", "바이오시밀러 개발·플랫폼", "biosimilar-development"),
        ("drug-discovery", "신약 개발", "drug-discovery"),
        ("diagnostics", "진단", "diagnostics"),
        ("biopharma", "바이오·제약", "biopharma"),
    ),
    "automotive": (
        ("complete-vehicle", "완성차", "complete-vehicle"),
        ("auto-parts", "자동차 부품", "auto-parts"),
        ("tire", "타이어", "tire"),
        ("ev-components", "전동화 부품", "ev-components"),
    ),
    "software": (
        ("it-service", "IT 서비스", "it-service"),
        ("saas", "SaaS", "saas"),
        ("game", "게임", "game"),
        ("security-software", "보안 소프트웨어", "security-software"),
        ("software-service", "소프트웨어·서비스", "software-service"),
    ),
    "financials": (
        ("bank", "은행", "bank"),
        ("securities", "증권", "securities"),
        ("insurance", "보험", "insurance"),
        ("credit-finance", "여신·카드", "credit-finance"),
        ("financial-holding", "금융지주", "financial-holding"),
        ("financial-service", "금융 서비스", "financial-service"),
    ),
    "energy": (
        ("oil-gas", "석유·가스", "oil-gas"),
        ("renewable-energy", "재생에너지", "renewable-energy"),
    ),
    "utilities": (
        ("utility-service", "유틸리티", "utility-service"),
    ),
    "defense": (
        ("defense-aerospace", "방산·항공우주", "defense-aerospace"),
    ),
    "telecom": (
        ("mobile-carrier", "이동통신 사업자", "mobile-carrier"),
        ("telecom-reseller", "통신 재판매", "telecom-reseller"),
        ("telecom-network-equipment", "통신망 장비", "telecom-network-equipment"),
    ),
    "internet-platform": (
        ("portal-platform", "포털·광고 플랫폼", "portal-platform"),
        ("commerce-platform", "커머스 플랫폼", "commerce-platform"),
        ("content-platform", "콘텐츠 플랫폼", "content-platform"),
        ("platform-infrastructure", "인터넷 인프라", "platform-infrastructure"),
    ),
}


# A company can touch several parts of a value chain, but direct peer selection
# needs one stable starting role. Business-model role outweighs an incidental
# product mention; the source strength only breaks ties between role candidates.
ROLE_PRIORITIES = {
    "battery-cell": 100,
    "battery-cathode": 100,
    "battery-anode": 100,
    "battery-separator": 100,
    "battery-electrolyte": 100,
    "battery-equipment": 100,
    "battery-recycling": 100,
    "biopharma-cdmo": 110,
    "biosimilar-manufacturing": 115,
    "biosimilar-development": 110,
    "drug-discovery": 110,
    "diagnostics": 110,
    "complete-vehicle": 110,
    "auto-parts": 100,
    "tire": 100,
    "ev-components": 105,
    "it-service": 110,
    "saas": 110,
    "game": 110,
    "security-software": 110,
    "bank": 110,
    "securities": 110,
    "insurance": 110,
    "credit-finance": 110,
    "financial-holding": 120,
    "oil-gas": 110,
    "renewable-energy": 110,
    "utility-service": 110,
    "defense-aerospace": 110,
    "telecom-service": 110,
    "platform-service": 110,
    "portal-platform": 130,
    "commerce-platform": 120,
    "content-platform": 120,
    "platform-infrastructure": 100,
    "mobile-carrier": 115,
    "telecom-reseller": 115,
    "telecom-network-equipment": 115,
    "biopharma": 100,
    "software-service": 100,
    "financial-service": 100,
    "memory": 100,
    "foundry": 95,
    "semiconductor-ip": 95,
    "design-house": 90,
    "fabless": 85,
    "test-inspection": 80,
    "packaging-osat": 70,
    "semiconductor-equipment": 65,
    "semiconductor-materials-parts": 60,
    "integrated-device": 40,
}
ROLE_SOURCE_WEIGHTS = {"both": 8, "dart": 5, "krx": 3, "derived": 1}


def read_json(path: Path) -> dict[str, Any]:
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as file:
            return json.load(file)
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(path)


def match_tags(text: str, rules: tuple[tuple[str, str, re.Pattern[str]], ...], source: str) -> list[dict[str, str]]:
    return [
        {"id": identifier, "label": label, "source": source}
        for identifier, label, pattern in rules
        if pattern.search(text)
    ]


def merge_tags(
    krx_tags: list[dict[str, str]],
    dart_tags: list[dict[str, str]],
) -> list[dict[str, str]]:
    merged = {tag["id"]: tag for tag in krx_tags}
    for tag in dart_tags:
        existing = merged.get(tag["id"])
        if existing:
            existing["source"] = "both"
        else:
            merged[tag["id"]] = tag
    return list(merged.values())


def detailed_report_text(report: dict[str, Any]) -> str:
    """Use the report's opening business overview, not raw-material appendices.

    The DART collector extracts only the business section. Its first part holds
    the company overview and product tables, while later sections frequently
    mention a customer's or supplier's industry. Detailed DART tags are only
    supporting evidence, so keeping this conservative window prevents a
    peripheral mention from becoming a service tag.
    """
    if report.get("status") != "ok":
        return ""
    return str(report.get("text", ""))[:16_000]


def scoped_dart_tags(
    group: str,
    text: str,
    comparison_sector_ids: set[str],
) -> list[dict[str, str]]:
    allowed = DART_TAG_SECTOR_SCOPE.get(group, {})
    return [
        tag
        for tag in match_tags(text, DART_TAG_RULES[group], "dart")
        if comparison_sector_ids.intersection(allowed.get(tag["id"], set()))
    ]


def scoped_krx_tags(
    group: str,
    text: str,
    comparison_sector_ids: set[str],
) -> list[dict[str, str]]:
    """Keep a role tag inside the sector that gives the term its meaning.

    KRX product text is a strong source, but product lists can include customer
    industries and adjacent businesses. Business-model tags are therefore
    allowed only where the company already has a matching comparison sector.
    """
    tags = match_tags(text, TAG_RULES[group], "krx")
    if group != "businessModels":
        return tags
    allowed = DART_TAG_SECTOR_SCOPE.get(group, {})
    return [
        tag
        for tag in tags
        if comparison_sector_ids.intersection(allowed.get(tag["id"], set()))
    ]


def with_match_score(match: dict[str, Any]) -> dict[str, Any]:
    score = sum({"krxIndustry": 3, "krxProducts": 2}[source] for source in match["evidence"])
    confidence = "high" if score == 5 else "medium"
    return {**match, "matchScore": score, "confidence": confidence}


def build_sub_sectors(comparison_sector_ids: set[str], tag_groups: dict[str, list[dict[str, str]]]) -> list[dict[str, str]]:
    models = {tag["id"]: tag for tag in tag_groups["businessModels"]}
    return [
        {
            "id": identifier,
            "label": label,
            "comparisonSectorId": comparison_sector_id,
            "sourceTag": source_tag,
            "source": models[source_tag]["source"],
        }
        for comparison_sector_id in sorted(comparison_sector_ids)
        for identifier, label, source_tag in SUBSECTOR_RULES.get(comparison_sector_id, ())
        if source_tag in models
    ]


def select_roles(
    sub_sectors: list[dict[str, str]],
    primary_comparison_sector_id: str | None,
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    # A company can have adjacent-sector exposure (for example, an auto-parts
    # supplier using battery materials). Its direct-peer role must still come
    # from the primary comparison sector rather than whichever secondary tag
    # happens to have the highest generic role priority.
    candidates = [
        {
            **sub_sector,
            "roleScore": ROLE_PRIORITIES.get(sub_sector["id"], 0) + ROLE_SOURCE_WEIGHTS[sub_sector["source"]],
        }
        for sub_sector in sub_sectors
        if sub_sector["comparisonSectorId"] == primary_comparison_sector_id
    ]
    candidates.sort(key=lambda role: (-role["roleScore"], role["id"], role["comparisonSectorId"]))
    primary = candidates[0] if candidates else None
    return primary, candidates[1:]


def classify_stock(stock: dict[str, Any], company: dict[str, Any] | None) -> dict[str, Any] | None:
    if stock.get("securityType") != "common":
        return None

    industry = stock.get("industry", "")
    products = stock.get("products", "")
    source_text = f"{industry} {products}"
    sector_matches = [
        with_match_score(
            {
                "id": identifier,
                "label": label,
                "wicsSectorId": wics_sector_id,
                "evidence": [
                    field
                    for field, value in (("krxIndustry", industry), ("krxProducts", products))
                    if pattern.search(value)
                ],
            }
        )
        for identifier, label, wics_sector_id, pattern in COMPARISON_SECTOR_RULES
        if pattern.search(source_text)
    ]
    sector_matches.sort(key=lambda match: (-match["matchScore"], match["id"]))
    primary = sector_matches[0] if sector_matches else None
    report = company or {}
    report_text = detailed_report_text(report)
    comparison_sector_ids = {match["id"] for match in sector_matches}
    tag_groups = {
        group: merge_tags(
            scoped_krx_tags(group, source_text, comparison_sector_ids),
            scoped_dart_tags(group, report_text, comparison_sector_ids),
        )
        for group, rules in TAG_RULES.items()
    }

    # This is a deterministic derived tag, not a DART keyword match: a company
    # that has both memory and foundry as confirmed business models is an IDM.
    model_ids = {tag["id"] for tag in tag_groups["businessModels"]}
    if primary and primary["id"] == "semiconductors" and "memory-manufacturing" in model_ids:
        tag_groups["businessModels"].append(
            {"id": "integrated-device", "label": "IDM", "source": "derived"}
        )
        model_ids.add("integrated-device")
    if {"memory-manufacturing", "foundry"}.issubset(model_ids):
        tag_groups["technologies"].append(
            {"id": "integrated-device", "label": "종합 반도체", "source": "derived"}
        )

    # A DRAM/HBM/NAND reference is a memory-product tag only when the company
    # itself is already identified as a memory manufacturer. This keeps test,
    # packaging and distribution companies out of the memory peer pool.
    if "memory-manufacturing" not in model_ids:
        tag_groups["products"] = [
            tag for tag in tag_groups["products"] if tag["id"] not in {"hbm", "dram", "nand"}
        ]

    primary_wics = (
        {
            "id": primary["wicsSectorId"],
            "label": dict(WICS_SECTORS)[primary["wicsSectorId"]],
            "source": "derived-from-comparison-sector",
        }
        if primary
        else None
    )
    if primary_wics is None:
        fallback_wics = next(
            (identifier for identifier, pattern in WICS_FALLBACK_RULES if pattern.search(industry)),
            None,
        )
        if fallback_wics:
            primary_wics = {
                "id": fallback_wics,
                "label": dict(WICS_SECTORS)[fallback_wics],
                "source": "derived-from-krx-industry-fallback",
            }
    secondary_exposures = [
        {
            "id": match["id"],
            "label": match["label"],
            "wicsSectorId": match["wicsSectorId"],
            "evidence": match["evidence"],
            "confidence": match["confidence"],
        }
        for match in sector_matches[1:]
    ]
    sub_sectors = build_sub_sectors(comparison_sector_ids, tag_groups)
    primary_role, secondary_roles = select_roles(sub_sectors, primary["id"] if primary else None)
    return {
        "symbol": stock["symbol"],
        "name": stock["name"],
        "market": stock["market"],
        "external": {
            "krxIndustry": industry,
            "krxProducts": products,
        },
        "classification": {
            "status": "comparison-ready" if primary else ("wics-only" if primary_wics else "unclassified"),
            "wics": {"primarySector": primary_wics},
            "primaryComparisonSector": primary,
            "comparisonSectors": sector_matches,
            "subSectors": sub_sectors,
            "primaryRole": primary_role,
            "secondaryRoles": secondary_roles,
            "secondaryExposures": secondary_exposures,
            "tags": tag_groups,
        },
        "evidence": {
            "classificationSource": "KRX industry/products",
            "annualBusinessReport": {
                "available": report.get("status") == "ok",
                "reportPeriod": report.get("reportPeriod"),
                "textConfidence": report.get("textConfidence"),
                "sourceUrl": report.get("sourceUrl"),
            },
        },
    }
def build_taxonomy(master: dict[str, Any], business: dict[str, Any]) -> dict[str, Any]:
    companies = business.get("companies", {})
    classifications = [
        result
        for stock in master.get("stocks", [])
        if (result := classify_stock(stock, companies.get(stock["symbol"]))) is not None
    ]
    classifications.sort(key=lambda entry: entry["symbol"])
    primary_counts = Counter(
        entry["classification"]["primaryComparisonSector"]["id"]
        for entry in classifications
        if entry["classification"]["primaryComparisonSector"]
    )
    wics_counts = Counter(
        entry["classification"]["wics"]["primarySector"]["id"]
        for entry in classifications
        if entry["classification"]["wics"]["primarySector"]
    )
    sub_sector_counts = Counter(
        sub_sector["id"]
        for entry in classifications
        for sub_sector in entry["classification"]["subSectors"]
    )
    status_counts = Counter(entry["classification"]["status"] for entry in classifications)
    return {
        "schemaVersion": 2,
        "asOf": master.get("asOf", date.today().isoformat()),
        "source": {
            "krxMaster": master.get("source"),
            "dartBusiness": business.get("source"),
            "referenceTaxonomy": "WICS public methodology (structure reference only)",
            "referenceUrl": "https://www.wiseindex.com/About/WICS",
        },
        "method": {
            "llmUsed": False,
            "companyMapping": "Generated from KRX industry/products; no third-party company classification is copied.",
            "dartRole": "The opening annual business overview can support detailed tags; it never selects a primary sector by itself.",
            "unknownPolicy": "Leave the primary comparison sector null when KRX data cannot support a rule.",
        },
        "reference": {
            "wicsSectors": [{"id": identifier, "label": label} for identifier, label in WICS_SECTORS],
        },
        "counts": {
            "commonStocks": len(classifications),
            "wicsPrimarySectors": dict(sorted(wics_counts.items())),
            "primaryComparisonSectors": dict(sorted(primary_counts.items())),
            "subSectors": dict(sorted(sub_sector_counts.items())),
            "classificationStatus": dict(sorted(status_counts.items())),
            "unclassified": status_counts["unclassified"],
        },
        "companies": classifications,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a reproducible Korean listed-company classification snapshot")
    parser.add_argument("--master", type=Path, default=MASTER_PATH)
    parser.add_argument("--business", type=Path, default=BUSINESS_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    payload = build_taxonomy(read_json(args.master), read_json(args.business))
    write_json(args.output, payload)
    print(f"Company taxonomy saved: {payload['counts']} -> {args.output} ({args.output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
