import { buildAlternativeRelation, scoreAlternativeCandidate } from "./alternative-relations";

export type Market = "KR" | "US";
export type AssetType = "stock" | "etf";

export type Metrics = {
  per: number | null;
  pbr: number | null;
  revenueGrowth: number;
  shareholderReturn: number;
  volatility: number;
  maxDrawdown: number;
  return3m?: number;
  return1y: number;
  return3y?: number;
  return1yKrw?: number;
};

export type Asset = {
  slug: string;
  ticker: string;
  name: string;
  nameEn: string;
  market: Market;
  type: AssetType;
  sector: string;
  industry: string;
  summary: string;
  profile: string;
  exposures: string[];
  risks: string[];
  metrics: Metrics;
};

export type Alternative = {
  slug: string;
  reason: string;
  common: string;
  difference: string;
  relationType?: "direct" | "structural-comparison" | "exposure-shift" | "diversified";
  sharedDrivers?: string[];
  strongerExposures?: string[];
  weakerExposures?: string[];
  newRisks?: string[];
  tradeoffSummary?: string;
  confidence?: "high" | "medium" | "limited";
  evidence?: string[];
};

type AlternativeSeed = Pick<Alternative, "slug"> & Partial<Omit<Alternative, "slug">>;

const baseMetrics: Metrics = {
  per: 18,
  pbr: 2,
  revenueGrowth: 8,
  shareholderReturn: 1.8,
  volatility: 27,
  maxDrawdown: -24,
  return1y: 14,
};

function asset(
  core: Omit<Asset, "metrics"> & { metrics?: Partial<Metrics> },
): Asset {
  return { ...core, metrics: { ...baseMetrics, ...core.metrics } };
}

export const assets: Asset[] = [
  asset({ slug: "samsung-electronics", ticker: "005930", name: "삼성전자", nameEn: "Samsung Electronics", market: "KR", type: "stock", sector: "반도체", industry: "메모리·종합반도체", summary: "메모리, 파운드리, 모바일과 가전을 함께 보유한 종합 기술 기업입니다.", profile: "메모리 업황 회복과 주주환원을 함께 보는 대형주형 선택지", exposures: ["DRAM", "NAND", "파운드리", "모바일"], risks: ["메모리 가격 사이클", "파운드리 적자", "대규모 CAPEX"], metrics: { per: 22.7, pbr: 1.8, revenueGrowth: 16.4, shareholderReturn: 2.7, volatility: 24, maxDrawdown: -22, return3m: 12.4, return1y: 34.6, return3y: 39.1 } }),
  asset({ slug: "sk-hynix", ticker: "000660", name: "SK하이닉스", nameEn: "SK hynix", market: "KR", type: "stock", sector: "반도체", industry: "메모리·AI반도체", summary: "DRAM과 HBM 비중이 높은 메모리 반도체 기업입니다.", profile: "AI 메모리 성장에 더 직접적으로 노출된 고변동 성장형 선택지", exposures: ["HBM", "DRAM", "NAND"], risks: ["메모리 단일 산업 집중", "높은 변동성", "CAPEX 부담"], metrics: { per: 11.9, pbr: 3.2, revenueGrowth: 28.1, shareholderReturn: 1.1, volatility: 39, maxDrawdown: -34, return3m: 22.1, return1y: 78.2, return3y: 154.4 } }),
  asset({ slug: "db-hitek", ticker: "000990", name: "DB하이텍", nameEn: "DB HiTek", market: "KR", type: "stock", sector: "반도체", industry: "파운드리", summary: "성숙 공정 중심의 국내 파운드리 기업입니다.", profile: "전력반도체와 아날로그 수요에 노출된 중형 파운드리 선택지", exposures: ["8인치 파운드리", "전력반도체", "아날로그"], risks: ["고객 집중", "성숙 공정 경쟁", "설비 가동률"], metrics: { per: 14.2, pbr: 1.7, revenueGrowth: 6.2, shareholderReturn: 1.6, volatility: 33, maxDrawdown: -31, return1y: 19.3 } }),
  asset({ slug: "micron", ticker: "MU", name: "마이크론", nameEn: "Micron Technology", market: "US", type: "stock", sector: "반도체", industry: "메모리·AI반도체", summary: "DRAM과 NAND에 집중한 미국 메모리 반도체 기업입니다.", profile: "메모리 순수 노출과 적극적인 자본환원을 함께 비교할 수 있는 글로벌 peer", exposures: ["HBM", "DRAM", "NAND"], risks: ["메모리 사이클", "중국 매출 규제", "달러 환율"], metrics: { per: 13.1, pbr: 3.6, revenueGrowth: 35.3, shareholderReturn: 2.9, volatility: 42, maxDrawdown: -39, return3m: 29.3, return1y: 66.7, return1yKrw: 73.1, return3y: 122.6 } }),
  asset({ slug: "tsmc", ticker: "TSM", name: "TSMC", nameEn: "Taiwan Semiconductor", market: "US", type: "stock", sector: "반도체", industry: "첨단 파운드리", summary: "첨단 공정 점유율이 높은 글로벌 파운드리 기업입니다.", profile: "메모리보다 AI 칩 생산 수요에 노출된 품질 성장형 peer", exposures: ["첨단 파운드리", "AI 가속기", "애플"], risks: ["대만 지정학", "대형 고객 집중", "해외 팹 비용"], metrics: { per: 24.8, pbr: 7.1, revenueGrowth: 29.4, shareholderReturn: 1.5, volatility: 31, maxDrawdown: -27, return3m: 18.7, return1y: 45.3, return1yKrw: 51.1, return3y: 118.8 } }),
  asset({ slug: "nvidia", ticker: "NVDA", name: "엔비디아", nameEn: "NVIDIA", market: "US", type: "stock", sector: "반도체", industry: "AI 가속기", summary: "AI 가속기와 데이터센터 플랫폼을 공급하는 팹리스 기업입니다.", profile: "AI 수요에 가장 직접적으로 노출되지만 밸류에이션과 변동성이 높은 peer", exposures: ["GPU", "AI 데이터센터", "CUDA"], risks: ["높은 기대치", "수출 규제", "고객 자체 칩"], metrics: { per: 34.2, pbr: 28.6, revenueGrowth: 61.1, shareholderReturn: 0.7, volatility: 48, maxDrawdown: -38, return3m: 24.5, return1y: 82.4, return1yKrw: 89.1, return3y: 421.3 } }),
  asset({ slug: "kodex-semiconductor", ticker: "091160", name: "KODEX 반도체", nameEn: "KODEX Semiconductor", market: "KR", type: "etf", sector: "반도체", industry: "국내 반도체 ETF", summary: "국내 반도체 대형주와 장비·소재 기업에 분산 투자하는 ETF입니다.", profile: "단일 기업 위험을 줄이며 국내 반도체 생태계에 투자", exposures: ["메모리", "장비", "소재"], risks: ["국내 산업 집중", "반도체 사이클", "상위 종목 쏠림"], metrics: { per: 17.6, pbr: 2.8, revenueGrowth: 19.2, shareholderReturn: 0.9, volatility: 31, maxDrawdown: -29, return1y: 49.1, return3y: 83.2 } }),
  asset({ slug: "soxx", ticker: "SOXX", name: "iShares 반도체 ETF", nameEn: "iShares Semiconductor ETF", market: "US", type: "etf", sector: "반도체", industry: "글로벌 반도체 ETF", summary: "설계, 제조, 장비를 아우르는 미국 상장 반도체 ETF입니다.", profile: "글로벌 반도체 가치사슬을 한 번에 담는 분산 대안", exposures: ["AI 칩", "파운드리", "장비"], risks: ["미국 기술주 밸류에이션", "산업 집중", "환율"], metrics: { per: 29.4, pbr: 7.4, revenueGrowth: 24, shareholderReturn: 1.1, volatility: 34, maxDrawdown: -31, return1y: 52.8, return1yKrw: 59.2, return3y: 142.5 } }),

  asset({ slug: "hyundai-motor", ticker: "005380", name: "현대차", nameEn: "Hyundai Motor", market: "KR", type: "stock", sector: "모빌리티", industry: "완성차", summary: "내연기관, 하이브리드, 전기차를 판매하는 글로벌 완성차 기업입니다.", profile: "낮은 밸류에이션과 주주환원을 겸한 글로벌 판매형 선택지", exposures: ["하이브리드", "전기차", "북미 판매"], risks: ["관세", "자동차 경기", "전기차 전환 비용"], metrics: { per: 6.8, pbr: 0.8, revenueGrowth: 7.8, shareholderReturn: 5.2, volatility: 25, maxDrawdown: -23, return1y: 31.2 } }),
  asset({ slug: "kia", ticker: "000270", name: "기아", nameEn: "Kia", market: "KR", type: "stock", sector: "모빌리티", industry: "완성차", summary: "SUV와 친환경차 비중이 높은 글로벌 완성차 기업입니다.", profile: "현대차보다 단순한 사업 구조와 높은 자본효율을 비교할 수 있는 peer", exposures: ["SUV", "하이브리드", "북미 판매"], risks: ["관세", "제품 믹스", "그룹 의존"], metrics: { per: 6.1, pbr: 1.0, revenueGrowth: 8.9, shareholderReturn: 6.1, volatility: 28, maxDrawdown: -25, return1y: 38.6 } }),
  asset({ slug: "hyundai-mobis", ticker: "012330", name: "현대모비스", nameEn: "Hyundai Mobis", market: "KR", type: "stock", sector: "모빌리티", industry: "자동차 부품", summary: "모듈과 핵심 전장 부품, A/S 부품을 공급합니다.", profile: "완성차 판매보다 부품·전장과 안정적인 A/S 수익에 노출", exposures: ["전장", "모듈", "A/S 부품"], risks: ["그룹 고객 집중", "전동화 투자", "낮은 마진"], metrics: { per: 8.4, pbr: 0.7, revenueGrowth: 5.1, shareholderReturn: 3.4, volatility: 22, maxDrawdown: -21, return1y: 16.8 } }),
  asset({ slug: "toyota", ticker: "TM", name: "토요타", nameEn: "Toyota Motor", market: "US", type: "stock", sector: "모빌리티", industry: "완성차", summary: "하이브리드 경쟁력이 높은 일본 글로벌 완성차 기업입니다.", profile: "현대차와 글로벌 판매·하이브리드 전략을 비교하기 좋은 peer", exposures: ["하이브리드", "글로벌 판매", "금융"], risks: ["엔화", "품질 인증", "전기차 전환"], metrics: { per: 9.4, pbr: 1.1, revenueGrowth: 6.2, shareholderReturn: 4.4, volatility: 21, maxDrawdown: -19, return1y: 23.7, return1yKrw: 29.4 } }),
  asset({ slug: "tesla", ticker: "TSLA", name: "테슬라", nameEn: "Tesla", market: "US", type: "stock", sector: "모빌리티", industry: "전기차·에너지", summary: "전기차, 에너지 저장장치와 자율주행 소프트웨어를 개발합니다.", profile: "전기차와 소프트웨어 기대가 결합된 고성장·고변동 peer", exposures: ["전기차", "자율주행", "에너지저장"], risks: ["높은 밸류에이션", "가격 경쟁", "경영자 리스크"], metrics: { per: 71.3, pbr: 13.2, revenueGrowth: 12.8, shareholderReturn: 0, volatility: 59, maxDrawdown: -51, return1y: 41.4, return1yKrw: 47.2 } }),
  asset({ slug: "kodex-auto", ticker: "091180", name: "KODEX 자동차", nameEn: "KODEX Auto", market: "KR", type: "etf", sector: "모빌리티", industry: "국내 자동차 ETF", summary: "국내 완성차와 핵심 부품사에 분산 투자합니다.", profile: "현대차그룹과 부품 생태계를 함께 담는 국내 분산 대안", exposures: ["완성차", "부품", "타이어"], risks: ["현대차그룹 쏠림", "관세", "경기 민감"], metrics: { per: 7.4, pbr: 1.0, revenueGrowth: 7.2, shareholderReturn: 3.8, volatility: 24, maxDrawdown: -22, return1y: 29.8 } }),
  asset({ slug: "driv", ticker: "DRIV", name: "Global X 자율주행 ETF", nameEn: "Global X Autonomous & EV ETF", market: "US", type: "etf", sector: "모빌리티", industry: "글로벌 모빌리티 ETF", summary: "전기차, 자율주행, 반도체 기업을 함께 담는 ETF입니다.", profile: "완성차보다 미래 모빌리티 가치사슬에 분산 투자", exposures: ["전기차", "자율주행", "반도체"], risks: ["테마 밸류에이션", "기술주 쏠림", "환율"], metrics: { per: 25.8, pbr: 3.9, revenueGrowth: 14.1, shareholderReturn: 0.7, volatility: 29, maxDrawdown: -27, return1y: 24.1, return1yKrw: 29.8 } }),

  asset({ slug: "lg-energy-solution", ticker: "373220", name: "LG에너지솔루션", nameEn: "LG Energy Solution", market: "KR", type: "stock", sector: "2차전지", industry: "배터리 셀", summary: "전기차와 에너지저장장치용 배터리 셀을 생산합니다.", profile: "북미 생산능력과 글로벌 고객 기반에 투자하는 대형 배터리 선택지", exposures: ["EV 배터리", "북미 공장", "ESS"], risks: ["전기차 수요 둔화", "보조금 의존", "대규모 CAPEX"], metrics: { per: null, pbr: 3.5, revenueGrowth: 9.2, shareholderReturn: 0, volatility: 36, maxDrawdown: -42, return1y: -8.4 } }),
  asset({ slug: "samsung-sdi", ticker: "006400", name: "삼성SDI", nameEn: "Samsung SDI", market: "KR", type: "stock", sector: "2차전지", industry: "배터리 셀", summary: "프리미엄 전기차용 각형 배터리와 전자재료를 공급합니다.", profile: "수익성 중심의 보수적 증설 전략을 비교할 수 있는 배터리 peer", exposures: ["각형 배터리", "전고체", "전자재료"], risks: ["고객 집중", "증설 속도", "전기차 수요"], metrics: { per: 28.4, pbr: 1.4, revenueGrowth: -4.2, shareholderReturn: 0.5, volatility: 41, maxDrawdown: -53, return1y: -19.7 } }),
  asset({ slug: "posco-future-m", ticker: "003670", name: "포스코퓨처엠", nameEn: "POSCO Future M", market: "KR", type: "stock", sector: "2차전지", industry: "배터리 소재", summary: "양극재와 음극재를 함께 생산하는 배터리 소재 기업입니다.", profile: "셀 제조보다 소재 가격과 증설에 직접 노출된 선택지", exposures: ["양극재", "음극재", "리튬 가치사슬"], risks: ["원재료 가격", "증설 부담", "고객사 수요"], metrics: { per: 62.1, pbr: 3.9, revenueGrowth: 11.4, shareholderReturn: 0.2, volatility: 48, maxDrawdown: -61, return1y: -24.8 } }),
  asset({ slug: "albemarle", ticker: "ALB", name: "앨버말", nameEn: "Albemarle", market: "US", type: "stock", sector: "2차전지", industry: "리튬 소재", summary: "글로벌 리튬 채굴·정제 기업입니다.", profile: "배터리 제조보다 리튬 가격에 직접 노출되는 상류 대안", exposures: ["리튬", "광산", "정제"], risks: ["리튬 가격", "중국 공급", "CAPEX"], metrics: { per: null, pbr: 1.3, revenueGrowth: -12.6, shareholderReturn: 1.7, volatility: 47, maxDrawdown: -58, return1y: -11.2, return1yKrw: -5.1 } }),
  asset({ slug: "lit", ticker: "LIT", name: "Global X 리튬·배터리 ETF", nameEn: "Global X Lithium & Battery Tech ETF", market: "US", type: "etf", sector: "2차전지", industry: "글로벌 배터리 ETF", summary: "리튬 채굴부터 배터리 셀까지 가치사슬 전반에 투자합니다.", profile: "단일 셀 업체 대신 글로벌 배터리 공급망을 담는 대안", exposures: ["리튬", "배터리 셀", "소재"], risks: ["중국 비중", "원자재 사이클", "환율"], metrics: { per: 20.4, pbr: 2.0, revenueGrowth: 5.1, shareholderReturn: 1.2, volatility: 37, maxDrawdown: -44, return1y: -7.5, return1yKrw: -1.4 } }),
  asset({ slug: "tiger-secondary-battery", ticker: "305540", name: "TIGER 2차전지테마", nameEn: "TIGER Secondary Battery Theme", market: "KR", type: "etf", sector: "2차전지", industry: "국내 배터리 ETF", summary: "국내 배터리 셀과 소재 기업에 분산 투자합니다.", profile: "국내 2차전지 가치사슬을 함께 담는 고변동 분산 대안", exposures: ["배터리 셀", "양극재", "장비"], risks: ["국내 산업 집중", "고변동성", "원재료 가격"], metrics: { per: 31.2, pbr: 2.2, revenueGrowth: 7.8, shareholderReturn: 0.4, volatility: 42, maxDrawdown: -49, return1y: -17.1 } }),

  asset({ slug: "naver", ticker: "035420", name: "NAVER", nameEn: "NAVER", market: "KR", type: "stock", sector: "플랫폼", industry: "검색·커머스", summary: "검색, 광고, 커머스, 핀테크와 콘텐츠 사업을 운영합니다.", profile: "국내 검색 지배력과 커머스·AI 확장을 함께 보는 플랫폼 선택지", exposures: ["검색광고", "커머스", "핀테크", "AI"], risks: ["내수 광고 경기", "AI 투자비", "규제"], metrics: { per: 19.6, pbr: 1.5, revenueGrowth: 10.7, shareholderReturn: 1.9, volatility: 29, maxDrawdown: -31, return1y: 27.8 } }),
  asset({ slug: "kakao", ticker: "035720", name: "카카오", nameEn: "Kakao", market: "KR", type: "stock", sector: "플랫폼", industry: "메신저·콘텐츠", summary: "메신저를 기반으로 광고, 커머스, 금융과 콘텐츠를 운영합니다.", profile: "국민 메신저 기반 트래픽의 수익화 정상화에 투자하는 선택지", exposures: ["메신저", "광고", "금융", "콘텐츠"], risks: ["규제", "계열사 구조", "수익성 회복"], metrics: { per: 32.4, pbr: 1.2, revenueGrowth: 6.3, shareholderReturn: 0.4, volatility: 36, maxDrawdown: -42, return1y: 14.2 } }),
  asset({ slug: "alphabet", ticker: "GOOGL", name: "알파벳", nameEn: "Alphabet", market: "US", type: "stock", sector: "플랫폼", industry: "검색·클라우드", summary: "검색 광고, 유튜브, 클라우드와 AI 모델을 운영합니다.", profile: "NAVER와 검색 광고·AI 경쟁력을 비교하는 글로벌 대형 peer", exposures: ["검색광고", "유튜브", "클라우드", "AI"], risks: ["검색 전환", "반독점", "AI CAPEX"], metrics: { per: 21.8, pbr: 6.9, revenueGrowth: 14.2, shareholderReturn: 1.4, volatility: 26, maxDrawdown: -25, return1y: 37.5, return1yKrw: 43.4 } }),
  asset({ slug: "meta", ticker: "META", name: "메타", nameEn: "Meta Platforms", market: "US", type: "stock", sector: "플랫폼", industry: "소셜·광고", summary: "소셜 네트워크 기반 광고와 AI 추천 서비스를 운영합니다.", profile: "카카오와 메시징·광고 수익화를 비교하는 글로벌 peer", exposures: ["소셜광고", "메신저", "AI 추천"], risks: ["광고 경기", "규제", "메타버스 투자"], metrics: { per: 24.9, pbr: 8.1, revenueGrowth: 18.1, shareholderReturn: 1.6, volatility: 31, maxDrawdown: -29, return1y: 48.6, return1yKrw: 54.7 } }),
  asset({ slug: "coupang", ticker: "CPNG", name: "쿠팡", nameEn: "Coupang", market: "US", type: "stock", sector: "플랫폼", industry: "이커머스", summary: "한국 중심의 이커머스와 물류 네트워크를 운영합니다.", profile: "NAVER 커머스와 직접 물류 모델의 차이를 볼 수 있는 peer", exposures: ["이커머스", "물류", "대만"], risks: ["낮은 마진", "경쟁", "해외 확장"], metrics: { per: 42.7, pbr: 7.3, revenueGrowth: 17.5, shareholderReturn: 0, volatility: 34, maxDrawdown: -36, return1y: 33.8, return1yKrw: 39.6 } }),
  asset({ slug: "kodex-internet", ticker: "266360", name: "KODEX K콘텐츠", nameEn: "KODEX K-Content", market: "KR", type: "etf", sector: "플랫폼", industry: "국내 미디어·콘텐츠 ETF", summary: "국내 플랫폼, 게임, 엔터테인먼트 기업을 담는 ETF입니다.", profile: "NAVER·카카오 단일 기업 위험을 콘텐츠 산업으로 넓힌 국내 대안", exposures: ["플랫폼", "게임", "엔터테인먼트"], risks: ["내수 성장", "흥행 변동성", "상위 종목 쏠림"], metrics: { per: 25.1, pbr: 1.7, revenueGrowth: 9.4, shareholderReturn: 0.8, volatility: 30, maxDrawdown: -34, return1y: 19.6 } }),
  asset({ slug: "qqq", ticker: "QQQ", name: "Invesco QQQ", nameEn: "Invesco QQQ", market: "US", type: "etf", sector: "플랫폼", industry: "미국 대형 기술주 ETF", summary: "나스닥 대형 비금융 기업에 투자하는 대표 ETF입니다.", profile: "플랫폼 한 종목 대신 미국 기술주 전반으로 분산", exposures: ["플랫폼", "반도체", "소프트웨어"], risks: ["대형 기술주 쏠림", "밸류에이션", "환율"], metrics: { per: 31.3, pbr: 8.7, revenueGrowth: 18.2, shareholderReturn: 0.7, volatility: 24, maxDrawdown: -24, return1y: 39.2, return1yKrw: 45.2 } }),

  asset({ slug: "samsung-biologics", ticker: "207940", name: "삼성바이오로직스", nameEn: "Samsung Biologics", market: "KR", type: "stock", sector: "바이오", industry: "바이오 위탁생산", summary: "글로벌 제약사의 바이오의약품을 위탁 개발·생산합니다.", profile: "대규모 생산능력과 장기 수주에 투자하는 품질 성장형 선택지", exposures: ["CDMO", "바이오시밀러", "글로벌 제약"], risks: ["높은 밸류에이션", "고객 집중", "증설 실행"], metrics: { per: 57.3, pbr: 9.2, revenueGrowth: 24.1, shareholderReturn: 0, volatility: 26, maxDrawdown: -23, return1y: 42.1 } }),
  asset({ slug: "celltrion", ticker: "068270", name: "셀트리온", nameEn: "Celltrion", market: "KR", type: "stock", sector: "바이오", industry: "바이오시밀러", summary: "바이오시밀러를 개발·생산하고 글로벌 판매합니다.", profile: "제품 출시와 직접 판매 확대에 투자하는 바이오 선택지", exposures: ["바이오시밀러", "미국 판매", "신약"], risks: ["약가 경쟁", "재고", "임상"], metrics: { per: 39.8, pbr: 2.2, revenueGrowth: 18.5, shareholderReturn: 0.6, volatility: 31, maxDrawdown: -33, return1y: 21.4 } }),
  asset({ slug: "alteogen", ticker: "196170", name: "알테오젠", nameEn: "Alteogen", market: "KR", type: "stock", sector: "바이오", industry: "바이오 플랫폼", summary: "정맥주사를 피하주사로 전환하는 플랫폼 기술을 기술수출합니다.", profile: "플랫폼 기술의 로열티 잠재력에 투자하는 고변동 바이오 선택지", exposures: ["SC 제형", "기술수출", "로열티"], risks: ["파트너 임상", "특허", "높은 밸류에이션"], metrics: { per: null, pbr: 34.1, revenueGrowth: 71.4, shareholderReturn: 0, volatility: 58, maxDrawdown: -47, return1y: 119.3 } }),
  asset({ slug: "lilly", ticker: "LLY", name: "일라이 릴리", nameEn: "Eli Lilly", market: "US", type: "stock", sector: "바이오", industry: "글로벌 제약", summary: "비만·당뇨와 항암제를 중심으로 성장하는 글로벌 제약사입니다.", profile: "개별 바이오 기술보다 상용화된 블록버스터 성장에 투자", exposures: ["비만 치료제", "당뇨", "항암"], risks: ["높은 밸류에이션", "공급 부족", "특허"], metrics: { per: 45.8, pbr: 31.4, revenueGrowth: 32.7, shareholderReturn: 1.0, volatility: 29, maxDrawdown: -27, return1y: 55.4, return1yKrw: 61.6 } }),
  asset({ slug: "amgen", ticker: "AMGN", name: "암젠", nameEn: "Amgen", market: "US", type: "stock", sector: "바이오", industry: "글로벌 바이오제약", summary: "항암·면역질환 중심의 대형 바이오제약사입니다.", profile: "성숙 제품 현금흐름과 배당을 제공하는 방어적 바이오 peer", exposures: ["항암", "면역질환", "바이오시밀러"], risks: ["특허 만료", "인수 부채", "신약 파이프라인"], metrics: { per: 18.7, pbr: 18.2, revenueGrowth: 9.1, shareholderReturn: 4.0, volatility: 23, maxDrawdown: -19, return1y: 18.3, return1yKrw: 24.1 } }),
  asset({ slug: "tiger-bio", ticker: "227540", name: "TIGER 200 헬스케어", nameEn: "TIGER 200 Healthcare", market: "KR", type: "etf", sector: "바이오", industry: "국내 헬스케어 ETF", summary: "코스피200 헬스케어 구성 종목에 분산 투자합니다.", profile: "임상과 단일 제품 위험을 낮추는 국내 바이오 대안", exposures: ["바이오시밀러", "CDMO", "신약"], risks: ["국내 바이오 쏠림", "임상 이벤트", "고밸류"], metrics: { per: 38.2, pbr: 4.7, revenueGrowth: 17.4, shareholderReturn: 0.5, volatility: 30, maxDrawdown: -28, return1y: 38.5 } }),
  asset({ slug: "xlv", ticker: "XLV", name: "Health Care Select ETF", nameEn: "Health Care Select Sector SPDR", market: "US", type: "etf", sector: "바이오", industry: "미국 헬스케어 ETF", summary: "미국 대형 제약·보험·의료기기 기업에 투자합니다.", profile: "개별 바이오보다 안정적인 헬스케어 전반의 분산 대안", exposures: ["제약", "보험", "의료기기"], risks: ["약가 정책", "대형주 쏠림", "환율"], metrics: { per: 20.8, pbr: 4.9, revenueGrowth: 9.8, shareholderReturn: 2.1, volatility: 17, maxDrawdown: -16, return1y: 15.7, return1yKrw: 21.5 } }),

  asset({ slug: "hanwha-aerospace", ticker: "012450", name: "한화에어로스페이스", nameEn: "Hanwha Aerospace", market: "KR", type: "stock", sector: "산업재", industry: "방산·항공", summary: "지상 방산, 항공엔진과 우주 사업을 운영합니다.", profile: "수출 수주잔고와 지정학적 국방 지출에 투자하는 성장형 산업재", exposures: ["K9 자주포", "항공엔진", "우주"], risks: ["수주 변동", "정책", "높아진 밸류에이션"], metrics: { per: 21.4, pbr: 5.6, revenueGrowth: 31.5, shareholderReturn: 1.2, volatility: 44, maxDrawdown: -33, return1y: 114.6 } }),
  asset({ slug: "hd-hyundai-heavy", ticker: "329180", name: "HD현대중공업", nameEn: "HD Hyundai Heavy Industries", market: "KR", type: "stock", sector: "산업재", industry: "조선", summary: "상선, 특수선과 해양플랜트를 건조합니다.", profile: "고선가 수주잔고가 실적으로 전환되는 조선 사이클 선택지", exposures: ["LNG선", "특수선", "엔진"], risks: ["원가 상승", "인력 부족", "수주 사이클"], metrics: { per: 26.8, pbr: 4.1, revenueGrowth: 19.7, shareholderReturn: 0.4, volatility: 35, maxDrawdown: -29, return1y: 72.8 } }),
  asset({ slug: "doosan-enerbility", ticker: "034020", name: "두산에너빌리티", nameEn: "Doosan Enerbility", market: "KR", type: "stock", sector: "산업재", industry: "원전·발전", summary: "원전 주기기와 가스터빈 등 발전 설비를 공급합니다.", profile: "글로벌 원전 재개와 전력 인프라 투자에 노출된 선택지", exposures: ["원전", "가스터빈", "SMR"], risks: ["프로젝트 지연", "정책", "재무 레버리지"], metrics: { per: 38.1, pbr: 2.9, revenueGrowth: 12.8, shareholderReturn: 0, volatility: 40, maxDrawdown: -37, return1y: 63.9 } }),
  asset({ slug: "ge-aerospace", ticker: "GE", name: "GE 에어로스페이스", nameEn: "GE Aerospace", market: "US", type: "stock", sector: "산업재", industry: "항공엔진", summary: "상업·군용 항공엔진과 유지보수 서비스를 제공합니다.", profile: "한화에어로와 항공엔진 사업·장기 서비스 매출을 비교하는 peer", exposures: ["항공엔진", "MRO", "방산"], risks: ["공급망", "항공 경기", "품질"], metrics: { per: 32.6, pbr: 11.2, revenueGrowth: 17.9, shareholderReturn: 1.5, volatility: 27, maxDrawdown: -22, return1y: 58.4, return1yKrw: 64.5 } }),
  asset({ slug: "caterpillar", ticker: "CAT", name: "캐터필러", nameEn: "Caterpillar", market: "US", type: "stock", sector: "산업재", industry: "건설·에너지 장비", summary: "건설·광산 장비와 에너지 시스템을 공급합니다.", profile: "글로벌 설비투자와 인프라 사이클에 노출된 현금창출형 peer", exposures: ["건설장비", "광산", "에너지"], risks: ["경기 민감", "원자재", "딜러 재고"], metrics: { per: 17.9, pbr: 8.4, revenueGrowth: 4.8, shareholderReturn: 3.1, volatility: 24, maxDrawdown: -22, return1y: 26.1, return1yKrw: 31.9 } }),
  asset({ slug: "kodex-defense", ticker: "449450", name: "PLUS K방산", nameEn: "PLUS K-Defense", market: "KR", type: "etf", sector: "산업재", industry: "국내 방산 ETF", summary: "국내 방산 수출 기업에 집중 투자합니다.", profile: "개별 수주 리스크를 낮추며 K-방산 생태계에 투자", exposures: ["지상 방산", "항공", "조선 방산"], risks: ["정책", "높은 변동성", "상위 종목 쏠림"], metrics: { per: 23.4, pbr: 4.2, revenueGrowth: 25.6, shareholderReturn: 0.9, volatility: 38, maxDrawdown: -30, return1y: 89.2 } }),
  asset({ slug: "ita", ticker: "ITA", name: "iShares 미국 항공우주·방산 ETF", nameEn: "iShares U.S. Aerospace & Defense ETF", market: "US", type: "etf", sector: "산업재", industry: "미국 방산 ETF", summary: "미국 항공우주·방산 대형주에 투자합니다.", profile: "K-방산과 다른 미국 국방 예산·항공 수요에 분산", exposures: ["항공", "미사일", "국방 시스템"], risks: ["정부 예산", "대형주 쏠림", "환율"], metrics: { per: 27.2, pbr: 5.8, revenueGrowth: 10.4, shareholderReturn: 1.3, volatility: 19, maxDrawdown: -17, return1y: 31.6, return1yKrw: 37.5 } }),

  asset({ slug: "kb-financial", ticker: "105560", name: "KB금융", nameEn: "KB Financial", market: "KR", type: "stock", sector: "금융", industry: "금융지주", summary: "은행, 증권, 보험, 카드를 보유한 종합 금융지주입니다.", profile: "높은 자본환원과 국내 금융 전반에 투자하는 가치주형 선택지", exposures: ["은행", "증권", "보험"], risks: ["가계대출 규제", "금리 하락", "대손비용"], metrics: { per: 7.1, pbr: 0.7, revenueGrowth: 8.1, shareholderReturn: 8.2, volatility: 27, maxDrawdown: -22, return1y: 52.4 } }),
  asset({ slug: "shinhan-financial", ticker: "055550", name: "신한지주", nameEn: "Shinhan Financial", market: "KR", type: "stock", sector: "금융", industry: "금융지주", summary: "은행을 중심으로 카드, 증권, 보험을 운영하는 금융지주입니다.", profile: "KB금융과 자본비율·비은행 포트폴리오를 비교하는 peer", exposures: ["은행", "카드", "증권"], risks: ["금리 하락", "충당금", "규제"], metrics: { per: 7.6, pbr: 0.6, revenueGrowth: 6.7, shareholderReturn: 7.4, volatility: 25, maxDrawdown: -21, return1y: 44.1 } }),
  asset({ slug: "jpmorgan", ticker: "JPM", name: "JP모건", nameEn: "JPMorgan Chase", market: "US", type: "stock", sector: "금융", industry: "글로벌 은행", summary: "소매은행과 투자은행을 함께 보유한 미국 최대 은행입니다.", profile: "국내 금융지주와 글로벌 투자은행·자본환원을 비교하는 peer", exposures: ["소매은행", "투자은행", "자산관리"], risks: ["미국 경기", "규제 자본", "금리"], metrics: { per: 13.2, pbr: 2.3, revenueGrowth: 11.4, shareholderReturn: 4.1, volatility: 21, maxDrawdown: -18, return1y: 36.7, return1yKrw: 42.6 } }),
  asset({ slug: "bank-of-america", ticker: "BAC", name: "뱅크오브아메리카", nameEn: "Bank of America", market: "US", type: "stock", sector: "금융", industry: "미국 은행", summary: "소매금융과 자산관리 비중이 큰 미국 대형 은행입니다.", profile: "금리 민감도가 높은 대형 은행 peer", exposures: ["소매은행", "자산관리", "채권 포트폴리오"], risks: ["금리", "채권 평가", "신용 비용"], metrics: { per: 12.1, pbr: 1.4, revenueGrowth: 8.5, shareholderReturn: 4.0, volatility: 25, maxDrawdown: -23, return1y: 29.2, return1yKrw: 35.1 } }),
  asset({ slug: "kodex-bank", ticker: "091170", name: "KODEX 은행", nameEn: "KODEX Banks", market: "KR", type: "etf", sector: "금융", industry: "국내 은행 ETF", summary: "국내 금융지주와 은행에 분산 투자합니다.", profile: "개별 금융사의 비은행·대손 위험을 분산하는 고배당 대안", exposures: ["은행", "금융지주", "자본환원"], risks: ["국내 금리", "가계대출", "업종 집중"], metrics: { per: 7.3, pbr: 0.6, revenueGrowth: 7.4, shareholderReturn: 6.8, volatility: 24, maxDrawdown: -20, return1y: 48.8 } }),
  asset({ slug: "xlf", ticker: "XLF", name: "Financial Select ETF", nameEn: "Financial Select Sector SPDR", market: "US", type: "etf", sector: "금융", industry: "미국 금융 ETF", summary: "미국 은행, 보험, 결제 기업에 분산 투자합니다.", profile: "국내 금융주 대신 미국 금융 생태계 전반을 담는 대안", exposures: ["은행", "보험", "결제"], risks: ["미국 금리", "신용 사이클", "환율"], metrics: { per: 16.4, pbr: 2.1, revenueGrowth: 9.6, shareholderReturn: 2.5, volatility: 19, maxDrawdown: -18, return1y: 30.5, return1yKrw: 36.4 } }),
];

const assetsBySlug = new Map(assets.map((item) => [item.slug, item]));
const assetsByTicker = new Map<string, Asset>();
const assetsByMarketTicker = new Map<string, Asset>();
for (const item of assets) {
  if (!assetsByTicker.has(item.ticker)) assetsByTicker.set(item.ticker, item);
  assetsByMarketTicker.set(`${item.market}:${item.ticker}`, item);
}

export const alternatives: Record<string, AlternativeSeed[]> = {
  "samsung-electronics": [],
  "sk-hynix": [],
  "db-hitek": [],
  "hyundai-motor": [
    { slug: "kia", reason: "같은 그룹 플랫폼을 쓰지만 제품 믹스와 자본효율이 다릅니다.", common: "북미 판매, 하이브리드 경쟁력, 관세 위험을 공유합니다.", difference: "현대차는 금융·제네시스·수소 등 사업 범위가 더 넓습니다." },
    { slug: "toyota", reason: "하이브리드 중심 글로벌 완성차 전략을 비교하기 좋습니다.", common: "하이브리드 수요와 글로벌 생산망이 핵심입니다.", difference: "토요타는 엔화, 현대차는 원화와 북미 투자에 더 민감합니다." },
    { slug: "tesla", reason: "전통 완성차 대신 전기차·소프트웨어 중심 대안을 비교합니다.", common: "전기차 시장과 배터리 비용의 영향을 받습니다.", difference: "테슬라는 성장 기대와 변동성이 훨씬 높고 배당이 없습니다." },
    { slug: "kodex-auto", reason: "완성차와 부품사를 함께 담아 단일 브랜드 위험을 낮춥니다.", common: "국내 자동차 수출과 환율의 수혜를 공유합니다.", difference: "부품·타이어까지 포함해 수익원이 분산됩니다." },
    { slug: "driv", reason: "글로벌 전기차·자율주행 가치사슬로 범위를 넓힙니다.", common: "차량 전동화와 소프트웨어 전환에 투자합니다.", difference: "미국 기술주와 반도체 비중, 환율 위험이 추가됩니다." },
  ],
  "kia": [
    { slug: "hyundai-motor", reason: "동일 그룹 내 가장 직접적인 기업 대안입니다.", common: "플랫폼·공급망·북미 생산 전략을 공유합니다.", difference: "기아는 사업 구조가 단순하고 현대차는 금융·고급차 비중이 높습니다." },
    { slug: "toyota", reason: "글로벌 하이브리드 경쟁력과 밸류에이션을 비교합니다.", common: "내연기관에서 전동화로 전환하는 대형 완성차입니다.", difference: "시장·환율·지역별 판매 구성이 다릅니다." },
    { slug: "kodex-auto", reason: "기아 단일 종목 대신 국내 완성차·부품으로 분산합니다.", common: "국내 자동차 수출 사이클에 함께 노출됩니다.", difference: "ETF는 그룹과 부품사의 이익을 함께 담습니다." },
  ],
  "hyundai-mobis": [
    { slug: "hyundai-motor", reason: "완성차 판매와 부품·A/S 수익 구조를 비교합니다.", common: "현대차그룹의 글로벌 판매량 영향을 받습니다.", difference: "모비스는 A/S 현금흐름이 안정적이지만 고객 집중도가 높습니다." },
    { slug: "kodex-auto", reason: "개별 부품사 대신 국내 자동차 가치사슬로 분산합니다.", common: "자동차 수출과 전동화 투자에 노출됩니다.", difference: "완성차·타이어 등 다른 수익원을 포함합니다." },
  ],
  "lg-energy-solution": [
    { slug: "samsung-sdi", reason: "국내 배터리 셀 기업 중 증설 전략과 수익성을 비교합니다.", common: "전기차 수요와 배터리 판가, 원재료 가격에 민감합니다.", difference: "LG에너지솔루션은 규모·북미, 삼성SDI는 프리미엄 각형 전략 비중이 높습니다." },
    { slug: "posco-future-m", reason: "셀 제조 대신 양극재·음극재 공급망에 투자하는 대안입니다.", common: "전기차 배터리 생산량 확대가 성장 동력입니다.", difference: "소재 기업은 리튬·니켈 가격과 고객사 증설에 더 민감합니다." },
    { slug: "lit", reason: "리튬부터 셀까지 글로벌 배터리 가치사슬로 분산합니다.", common: "전기차 침투율과 배터리 가격의 영향을 받습니다.", difference: "중국 기업·원자재·환율 위험이 추가됩니다." },
    { slug: "tiger-secondary-battery", reason: "국내 셀·소재·장비를 함께 담는 분산 대안입니다.", common: "국내 2차전지 산업 사이클을 공유합니다.", difference: "단일 고객·공장 위험을 낮추는 대신 산업 전체 변동성은 남습니다." },
  ],
  "samsung-sdi": [
    { slug: "lg-energy-solution", reason: "같은 국내 배터리 셀 업체로 규모와 고객 구성을 비교합니다.", common: "전기차 수요와 배터리 기술 전환에 노출됩니다.", difference: "삼성SDI는 수익성 중심, LG에너지솔루션은 대규모 북미 증설 중심입니다." },
    { slug: "lit", reason: "단일 셀 업체에서 글로벌 배터리 공급망으로 분산합니다.", common: "배터리 수요 성장의 장기 방향을 공유합니다.", difference: "리튬·중국 기업·환율 노출이 추가됩니다." },
  ],
  "posco-future-m": [
    { slug: "albemarle", reason: "배터리 소재의 중류와 리튬 상류 수익 구조를 비교합니다.", common: "리튬 가격과 전기차 배터리 수요의 영향을 받습니다.", difference: "앨버말은 광산·정제, 포스코퓨처엠은 양극재·음극재 제조 중심입니다." },
    { slug: "tiger-secondary-battery", reason: "개별 소재 기업 대신 국내 배터리 생태계에 분산합니다.", common: "국내 2차전지 증설 사이클을 공유합니다.", difference: "ETF는 셀과 장비 업체도 포함합니다." },
  ],
  "naver": [
    { slug: "kakao", reason: "국내 플랫폼 트래픽의 광고·커머스 수익화를 직접 비교합니다.", common: "국내 규제와 광고 경기, AI 투자비 영향을 받습니다.", difference: "NAVER는 검색·커머스, 카카오는 메신저·콘텐츠 비중이 높습니다." },
    { slug: "alphabet", reason: "검색광고와 AI 전환을 글로벌 리더와 비교합니다.", common: "검색 트래픽, 광고와 생성형 AI가 핵심 경쟁 축입니다.", difference: "알파벳은 글로벌 시장·클라우드·유튜브로 더 분산됩니다." },
    { slug: "coupang", reason: "커머스에서 플랫폼 중개와 직접 물류 모델을 비교합니다.", common: "국내 온라인 소비 성장에 노출됩니다.", difference: "쿠팡은 물류자산과 직매입 비중이 높아 마진 구조가 다릅니다." },
    { slug: "kodex-internet", reason: "국내 플랫폼·게임·핀테크로 분산하는 대안입니다.", common: "국내 디지털 소비와 광고 회복의 수혜를 공유합니다.", difference: "개별 기업의 AI·경영 리스크를 낮춥니다." },
    { slug: "qqq", reason: "국내 플랫폼 한 종목 대신 미국 기술주 전반에 분산합니다.", common: "디지털 광고·클라우드·AI 성장에 노출됩니다.", difference: "반도체·소프트웨어 비중과 환율 위험이 추가됩니다." },
  ],
  "kakao": [
    { slug: "naver", reason: "국내 양대 플랫폼의 사업 포트폴리오를 비교합니다.", common: "국내 광고·커머스·핀테크와 규제 영향을 공유합니다.", difference: "카카오는 메신저·콘텐츠, NAVER는 검색·커머스 중심입니다." },
    { slug: "meta", reason: "메신저 트래픽의 광고 수익화를 글로벌 플랫폼과 비교합니다.", common: "메시징·소셜 관계망과 AI 추천이 체류시간을 좌우합니다.", difference: "메타는 글로벌 광고 규모와 자본환원이 훨씬 큽니다." },
    { slug: "kodex-internet", reason: "카카오 단일 기업의 구조적 위험을 국내 인터넷 섹터로 분산합니다.", common: "국내 디지털 소비·광고 회복에 노출됩니다.", difference: "게임·핀테크 기업을 함께 담습니다." },
  ],
  "samsung-biologics": [
    { slug: "celltrion", reason: "바이오 생산과 제품 판매라는 서로 다른 수익 구조를 비교합니다.", common: "글로벌 바이오의약품 시장과 규제 승인의 영향을 받습니다.", difference: "삼성바이오로직스는 위탁생산, 셀트리온은 자체 제품 판매 중심입니다." },
    { slug: "amgen", reason: "대형 바이오 기업의 현금흐름과 밸류에이션을 글로벌 기준으로 비교합니다.", common: "바이오의약품 생산·판매와 특허가 핵심입니다.", difference: "암젠은 성숙 제품과 배당, 삼성바이오로직스는 증설 성장 비중이 높습니다." },
    { slug: "tiger-bio", reason: "CDMO 한 종목에서 국내 바이오 전반으로 분산합니다.", common: "국내 바이오 투자심리와 글로벌 허가 이벤트에 노출됩니다.", difference: "바이오시밀러·신약 기업을 함께 포함합니다." },
    { slug: "xlv", reason: "개별 바이오 대신 미국 헬스케어 전반의 방어적 대안입니다.", common: "고령화와 의료 지출 증가를 장기 동력으로 둡니다.", difference: "보험·의료기기까지 포함해 변동성이 낮고 환율 위험이 있습니다." },
  ],
  "celltrion": [
    { slug: "samsung-biologics", reason: "자체 제품 판매와 위탁생산 모델을 비교합니다.", common: "바이오의약품 수요와 생산 경쟁력을 공유합니다.", difference: "셀트리온은 판매·약가 경쟁, 삼성바이오로직스는 수주·가동률이 핵심입니다." },
    { slug: "amgen", reason: "바이오시밀러와 오리지널 바이오의약품 포트폴리오를 비교합니다.", common: "항암·면역질환 시장과 특허 주기의 영향을 받습니다.", difference: "암젠은 배당과 성숙 현금흐름이 더 큽니다." },
    { slug: "tiger-bio", reason: "개별 제품·허가 위험을 국내 헬스케어 바스켓으로 낮춥니다.", common: "국내 바이오 투자심리의 영향을 공유합니다.", difference: "CDMO·신약·진단 기업을 함께 담습니다." },
  ],
  "alteogen": [
    { slug: "lilly", reason: "플랫폼 기술수출과 상용화된 블록버스터 성장을 대비합니다.", common: "신약 파이프라인의 임상·허가 가치가 주가에 반영됩니다.", difference: "알테오젠은 파트너 성과 의존, 릴리는 자체 판매와 현금흐름 중심입니다." },
    { slug: "tiger-bio", reason: "단일 기술·파트너 위험을 국내 바이오 포트폴리오로 분산합니다.", common: "바이오 투자심리와 임상 이벤트 영향을 받습니다.", difference: "ETF는 성숙 기업도 포함해 변동성을 완화합니다." },
  ],
  "hanwha-aerospace": [
    { slug: "ge-aerospace", reason: "항공엔진 사업과 장기 유지보수 매출을 글로벌 리더와 비교합니다.", common: "항공 운항량과 국방 지출의 영향을 받습니다.", difference: "한화는 지상 방산 수출, GE는 상업 항공 MRO 비중이 큽니다." },
    { slug: "hd-hyundai-heavy", reason: "K-방산 수출과 조선 수주 사이클을 비교합니다.", common: "대형 장기 수주와 정부 정책이 실적 가시성을 결정합니다.", difference: "한화는 지상·항공, HD현대중공업은 상선·특수선 중심입니다." },
    { slug: "kodex-defense", reason: "한화에어로 한 종목 대신 국내 방산 수출 기업으로 분산합니다.", common: "유럽·중동 국방비 확대의 수혜를 공유합니다.", difference: "항공·조선·전자 방산을 함께 담아 수주 편중을 낮춥니다." },
    { slug: "ita", reason: "미국 방산 생태계와 국방 예산에 분산하는 대안입니다.", common: "지정학적 긴장과 국방 지출 증가에 노출됩니다.", difference: "미국 정부 예산·달러·대형 항공사 비중이 추가됩니다." },
  ],
  "hd-hyundai-heavy": [
    { slug: "hanwha-aerospace", reason: "장기 수주 산업 내 조선과 지상·항공 방산을 비교합니다.", common: "수주잔고와 원가 관리가 미래 이익을 좌우합니다.", difference: "조선은 선가·해운 사이클, 방산은 정부 예산에 더 민감합니다." },
    { slug: "kodex-defense", reason: "특수선·방산 노출을 국내 방산 포트폴리오로 넓힙니다.", common: "국내 방산 수출 정책의 수혜를 공유합니다.", difference: "지상·항공·전자 방산을 함께 담습니다." },
  ],
  "doosan-enerbility": [
    { slug: "caterpillar", reason: "대형 설비·에너지 장비 산업의 글로벌 수요를 비교합니다.", common: "인프라 투자와 장기 경기 사이클에 노출됩니다.", difference: "두산은 원전·발전 프로젝트, 캐터필러는 건설·광산 장비 중심입니다." },
    { slug: "kodex-defense", reason: "정책·인프라 테마의 국내 산업재 바스켓을 함께 검토합니다.", common: "정부 정책과 대형 수주가 실적을 좌우합니다.", difference: "ETF는 방산 중심으로 원전과 직접 사업은 다릅니다." },
  ],
  "kb-financial": [
    { slug: "shinhan-financial", reason: "국내 금융지주의 자본환원과 비은행 구성을 직접 비교합니다.", common: "금리·대손비용·주주환원 정책의 영향을 공유합니다.", difference: "KB는 보험·증권 비중, 신한은 카드·글로벌 사업 구성이 다릅니다." },
    { slug: "jpmorgan", reason: "금융지주 모델을 글로벌 투자은행과 비교합니다.", common: "예대마진, 신용 사이클, 자본규제가 핵심입니다.", difference: "JP모건은 투자은행·자산관리 비중과 밸류에이션이 높습니다." },
    { slug: "kodex-bank", reason: "개별 금융사의 대손·비은행 위험을 국내 은행 바스켓으로 분산합니다.", common: "국내 금리와 밸류업 정책 수혜를 공유합니다.", difference: "여러 금융지주를 담아 개별 경영 위험을 낮춥니다." },
    { slug: "xlf", reason: "국내 은행에서 미국 금융 생태계로 지역·사업을 분산합니다.", common: "금리와 신용 사이클, 자본환원이 핵심입니다.", difference: "보험·결제와 달러 환율 노출이 추가됩니다." },
  ],
  "shinhan-financial": [
    { slug: "kb-financial", reason: "국내 대표 금융지주 간 자본효율과 환원 정책을 비교합니다.", common: "금리·대출 성장·대손비용 영향을 공유합니다.", difference: "비은행 자회사 구성과 자본비율이 다릅니다." },
    { slug: "bank-of-america", reason: "금리 민감도가 높은 미국 소매은행과 비교합니다.", common: "예대마진과 가계 신용 사이클에 노출됩니다.", difference: "미국 금리·채권 포트폴리오·환율 위험이 추가됩니다." },
    { slug: "kodex-bank", reason: "신한지주 한 종목 대신 국내 은행 업종으로 분산합니다.", common: "국내 밸류업과 주주환원 확대의 수혜를 공유합니다.", difference: "여러 금융지주의 자본정책을 함께 담습니다." },
  ],
};

export const snapshotMeta = {
  asOf: "2026-07-15",
  fxAsOf: "2026-07-15",
  status: "reference" as const,
  source: "수동 검수 큐레이션 참고값",
};

export function getAsset(slug: string) {
  return assetsBySlug.get(slug);
}

export function getAssetByTicker(ticker: string, market?: Market) {
  return market
    ? assetsByMarketTicker.get(`${market}:${ticker}`)
    : assetsByTicker.get(ticker);
}

export function getAlternatives(slug: string) {
  const selected = getAsset(slug);
  const usesSectorProfile = selected?.market === "KR" && selected.type === "stock" && selected.sector === "반도체";
  if (selected && usesSectorProfile) {
    // These are caps, not quotas. A category is omitted when the available
    // candidates do not have enough business evidence to support it.
    const relationLimits: Record<NonNullable<Alternative["relationType"]>, number> = {
      direct: 2,
      "structural-comparison": 2,
      "exposure-shift": 1,
      diversified: 1,
    };
    const minimumScores: Record<NonNullable<Alternative["relationType"]>, number> = {
      direct: 30,
      // A shared value-chain role plus a shared industry driver is enough for
      // a structural comparison, but not for a direct peer.
      "structural-comparison": 18,
      "exposure-shift": 24,
      // An ETF is judged by its sector coverage and remains an optional,
      // single diversification choice rather than a forced second peer.
      diversified: 0,
    };
    const candidates = assets
      .filter((asset) => asset.slug !== selected.slug && asset.sector === selected.sector)
      .map((asset) => ({ ...buildAlternativeRelation(selected, asset), asset }));
    return (["direct", "structural-comparison", "exposure-shift", "diversified"] as const).flatMap((type) => candidates
      .filter((item) => item.relationType === type && scoreAlternativeCandidate(selected, item.asset) >= minimumScores[type])
      .sort((left, right) => scoreAlternativeCandidate(selected, right.asset) - scoreAlternativeCandidate(selected, left.asset))
      .slice(0, relationLimits[type]));
  }
  return (alternatives[slug] ?? [])
    .map((relation) => {
      const asset = getAsset(relation.slug);
      if (!asset) return undefined;
      if (!relation.reason || !relation.common || !relation.difference) return undefined;
      return { ...relation, reason: relation.reason, common: relation.common, difference: relation.difference, asset };
    })
    .filter((item): item is Alternative & { asset: Asset } => Boolean(item));
}

export function getKoreanStocks() {
  return assets.filter((item) => item.market === "KR" && item.type === "stock");
}
