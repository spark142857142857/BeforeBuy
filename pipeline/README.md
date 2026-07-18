# Data pipeline

웹사이트가 읽는 공개 데이터 스냅샷을 로컬에서 생성합니다. API 키와 토큰은 출력 파일에 포함하지 않습니다.

## 한국 상장 종목 마스터

```powershell
uv sync
uv run python pipeline/collect_krx_master.py
```

결과는 `data/generated/kr_stocks.json`에 저장하며 이 파일만 GitHub에 커밋합니다.

## DART 기업 매핑과 연간 사업 내용

```powershell
# 전체 상장 종목과 DART 고유번호 매핑
uv run python pipeline/collect_dart_business.py --corp-codes-only

# 대표 종목으로 연간 사업보고서 선택과 원문 추출 검증
npm run data:dart:sample

# 전체 수집은 3개 작업으로 제한하고 100종목마다 압축 체크포인트 저장
uv run python pipeline/collect_dart_business.py
```

사업 내용은 최신 연간 사업보고서 원문에서 `II. 사업의 내용` 구간만 추출합니다.
분기·반기보고서와 첨부정정·첨부추가 보고서는 유사도 입력에서 제외합니다.
동일 결산기간에서는 기재정정 보고서를 우선하며, 원문이나 사업 섹션을 사용할 수
없으면 원본 사업보고서 또는 직전 연간 사업보고서로 후퇴합니다.
추출 본문이 3,000자 미만이면 `textConfidence: low`로 기록하며, 이후 유사도
계산에서 KRX 업종과 주요 제품의 비중을 높이는 근거로 사용합니다.
전체 결과는 `data/generated/dart_business.json.gz`에 저장하며, 다시 실행하면
성공 후 120일이 지나지 않은 종목은 건너뛰고 실패·미수집·재검사 대상만 수집합니다.
새 갱신이 실패하면 마지막 정상 사업 내용은 유지하고 `lastAttempt`에 실패 상태와
시각을 기록합니다. `--refresh`는 캐시 나이와 무관하게 전체 종목을 재검사합니다.
이 파일은 전체 공시 원문을 담는 로컬 배치 캐시이므로 GitHub에는 커밋하지 않습니다.
검증 후 웹에는 짧은 사업 프로필과 유사도 결과만 별도 생성해 저장합니다.

## 웹용 사업 프로필

```powershell
uv run python pipeline/prepare_web_profiles.py
```

연간 사업 본문은 600자 미리보기로 줄이고, 우선주는 보통주 사업 프로필을
참조하도록 별도 alias로 저장합니다. 스팩, 신규 상장 기업, 인프라 펀드는
일반 기업과 섞이지 않도록 사용할 수 없는 이유와 자산 유형을 기록합니다.

## 로컬 유사 종목 점수

```powershell
uv run python pipeline/build_similarity.py
```

DART 사업 내용을 문자 단위 TF-IDF 임베딩으로 변환한 뒤, 텍스트 40%,
다중 사업 노출 40%, 주요 제품 10%, 기업 규모 10%를 합산합니다.
KRX 단일 업종 문자열의 완전 일치 점수는 사용하지 않습니다.

다중 사업 노출은 `data/curated/business_exposure_rules.json`의 태그를
주요 제품과 DART 사업 개요에서 추출하고, KRX 업종은 soft prior로만 더합니다.
`productKeywords`는 제품 필드에만 쓰고 DART 본문에는 일반 `keywords`만 적용합니다.
2차전지는 약한 공통 밸류체인 태그와 셀 제조·소재·부품·장비 역할로 분리하고,
지주회사는 증권·투자와, 통신 서비스는 통신장비 제조와 별도 태그로 둡니다.
노출 유사도는 좌·우 포함도 40%/30%와 가중 Jaccard 30%를 결합합니다.
제품 점수는 Dice, 기업 규모는 시가총액 비율의 4제곱근입니다. 규모 점수는
중복 스냅샷 용량을 줄이기 위해 종목 마스터의 시가총액으로 화면에서 다시 계산합니다.
공통 사업 노출이 없고 종합 점수가 0.25 미만인 후보는 제거하지 않고
`confidence: low`로 저장해 화면에서 비교 근거가 제한적임을 알립니다.

삼성전자·SK하이닉스·현대차·기아처럼 KRX 단일 업종이나 부수 제품이 핵심
사업을 왜곡하는 대표 기업은 DART 사업부문을 근거로 검토된 노출 강도를 별도로
기록합니다. 자동 추출과 구분해 데이터 파일에 근거를 공개합니다.

연간 사업 본문이 3,000자 미만인 기업이 포함되면 텍스트 15%, 사업 노출 55%,
주요 제품 20%, 규모 10%로 보수적으로 조정합니다. LLM이나 외부 AI API는
호출하지 않으며, 배포 결과에는 임베딩을 저장하지 않고 종목별 상위 후보와
점수 구성요소만 저장합니다.

## 글로벌 peer와 관련 ETF 규칙

```powershell
uv run python pipeline/build_global_links.py
```

`data/curated/global_rules.json`의 검토 가능한 키워드 규칙을 사용해 KRX 업종·주요
제품과 로컬 DART 연간 사업 원문의 앞 1,200자를 연결합니다. 웹 미리보기 길이와
규칙 계산 입력을 분리해 배포 용량을 줄여도 연결 범위가 변하지 않게 합니다. 한 종목에는 최대 두 개 테마만
허용하고, 기준 점수를 넘지 못하면 글로벌 peer나 ETF를 강제로 추천하지 않습니다.
출력에는 매칭된 키워드, 규칙 점수, 추천 근거, 글로벌 자산과 ETF slug만 저장합니다.

ETF 주요 구성 종목은 `data/curated/etf_holdings.json`에 운용사 기준일·출처 URL과
함께 관리합니다. 화면에는 전체 포트폴리오가 아니라 대표 상위 5개만 표시합니다.
