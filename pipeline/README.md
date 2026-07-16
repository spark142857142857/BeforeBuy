# Data pipeline

웹사이트가 읽는 공개 데이터 스냅샷을 로컬에서 생성합니다. API 키와 토큰은 출력 파일에 포함하지 않습니다.

## 한국 상장 종목 마스터

```powershell
uv sync
uv run python pipeline/collect_krx_master.py
```

결과는 `data/generated/kr_stocks.json`에 저장하며 이 파일만 GitHub에 커밋합니다.
