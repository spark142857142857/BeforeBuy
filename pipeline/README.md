# Data pipeline

웹사이트가 읽는 공개 데이터 스냅샷을 로컬에서 생성합니다. API 키와 토큰은 출력 파일에 포함하지 않습니다.

## 한국 상장 종목 마스터

```powershell
uv sync
uv run python pipeline/collect_krx_master.py
```

결과는 `data/generated/kr_stocks.json`에 저장하며 이 파일만 GitHub에 커밋합니다.

## DART 기업 매핑과 사업 내용

```powershell
# 전체 상장 종목과 DART 고유번호 매핑
uv run python pipeline/collect_dart_business.py --corp-codes-only

# 소수 종목으로 원문 추출 검증
uv run python pipeline/collect_dart_business.py --symbols 005930,000020,035420 --output work/dart_sample.json

# 전체 수집은 3개 작업으로 제한하고 100종목마다 압축 체크포인트 저장
uv run python pipeline/collect_dart_business.py
```

사업 내용은 최근 정기보고서 원문에서 `II. 사업의 내용` 구간만 추출합니다.
전체 결과는 `data/generated/dart_business.json.gz`에 저장하며, 다시 실행하면
이미 성공한 종목은 건너뛰고 실패하거나 미수집된 종목만 이어서 수집합니다.

## 로컬 유사 종목 점수

```powershell
uv run python pipeline/build_similarity.py
```

DART 사업 내용과 KRX 주요 제품을 문자 단위 TF-IDF 임베딩으로 변환한 뒤,
텍스트 유사도 70%와 업종 일치도 30%를 합산합니다. LLM이나 외부 AI API는
호출하지 않으며, 추천 이유는 공통 업종과 제품 키워드로 생성합니다.
