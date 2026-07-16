from __future__ import annotations

import argparse
import gzip
import json
import re
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neighbors import NearestNeighbors


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = ROOT / "data" / "generated" / "kr_stocks.json"
BUSINESS_PATH = ROOT / "data" / "generated" / "dart_business.json.gz"
DEFAULT_OUTPUT = ROOT / "data" / "generated" / "kr_similarity.json"
TOKEN = re.compile(r"[0-9A-Za-z가-힣]{2,}")
STOP_WORDS = {
    "관련",
    "기타",
    "대한",
    "사업",
    "서비스",
    "업종",
    "제품",
    "제조",
    "제조업",
    "판매",
    "통한",
}


def read_json(path: Path) -> dict[str, Any]:
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as file:
            return json.load(file)
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    temporary.replace(path)


def tokens(value: str) -> set[str]:
    return {
        token.lower()
        for token in TOKEN.findall(value)
        if token.lower() not in STOP_WORDS
    }


def industry_similarity(left: dict[str, Any], right: dict[str, Any]) -> float:
    left_industry = left.get("industry", "").strip()
    right_industry = right.get("industry", "").strip()
    if left_industry and left_industry == right_industry:
        return 1.0
    left_tokens = tokens(left_industry)
    right_tokens = tokens(right_industry)
    union = left_tokens | right_tokens
    return len(left_tokens & right_tokens) / len(union) if union else 0.0


def shared_terms(left: dict[str, Any], right: dict[str, Any]) -> list[str]:
    left_terms = tokens(f"{left.get('industry', '')} {left.get('products', '')}")
    right_terms = tokens(f"{right.get('industry', '')} {right.get('products', '')}")
    common = left_terms & right_terms
    return sorted(common, key=lambda value: (-len(value), value))[:3]


def reason_for(left: dict[str, Any], right: dict[str, Any], terms: list[str]) -> str:
    same_industry = left.get("industry") and left.get("industry") == right.get("industry")
    parts = []
    if same_industry:
        parts.append(f"동일 KRX 업종({left['industry']})")
    elif industry_similarity(left, right) > 0:
        parts.append("KRX 업종 설명이 일부 겹침")
    if terms:
        parts.append(f"주요 제품 키워드 {', '.join(terms)} 공통")
    return ", ".join(parts) if parts else "DART 사업 내용의 로컬 텍스트 유사도가 높음"


def document_for(stock: dict[str, Any], business: dict[str, Any]) -> str:
    industry = stock.get("industry", "")
    products = stock.get("products", "")
    business_text = business.get("text", "")[:8_000]
    return " ".join([industry] * 4 + [products] * 2 + [business_text])


def build_similarity(
    master: dict[str, Any],
    business: dict[str, Any],
    *,
    top_k: int,
    min_companies: int,
) -> dict[str, Any]:
    stocks_by_symbol = {stock["symbol"]: stock for stock in master.get("stocks", [])}
    eligible = [
        stocks_by_symbol[symbol]
        for symbol, item in business.get("companies", {}).items()
        if (
            symbol in stocks_by_symbol
            and item.get("status") == "ok"
            and item.get("text")
            and stocks_by_symbol[symbol].get("securityType") == "common"
        )
    ]
    eligible.sort(key=lambda stock: stock["symbol"])
    if len(eligible) < min_companies:
        raise RuntimeError(
            f"Only {len(eligible)} companies have usable DART business text; "
            f"at least {min_companies} are required"
        )

    documents = [
        document_for(stock, business["companies"][stock["symbol"]])
        for stock in eligible
    ]
    vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(2, 5),
        min_df=2,
        max_df=0.98,
        max_features=60_000,
        sublinear_tf=True,
        dtype=np.float32,
    )
    embeddings = vectorizer.fit_transform(documents)
    neighbor_count = min(len(eligible), max(top_k * 4 + 1, 25))
    neighbors = NearestNeighbors(metric="cosine", algorithm="brute", n_jobs=-1)
    neighbors.fit(embeddings)
    distances, indices = neighbors.kneighbors(embeddings, n_neighbors=neighbor_count)

    results: dict[str, list[dict[str, Any]]] = {}
    for row, stock in enumerate(eligible):
        candidates: list[dict[str, Any]] = []
        for distance, candidate_index in zip(distances[row], indices[row], strict=True):
            candidate = eligible[int(candidate_index)]
            if candidate["symbol"] == stock["symbol"]:
                continue
            text_score = max(0.0, 1.0 - float(distance))
            industry_score = industry_similarity(stock, candidate)
            score = text_score * 0.7 + industry_score * 0.3
            terms = shared_terms(stock, candidate)
            candidates.append(
                {
                    "symbol": candidate["symbol"],
                    "name": candidate["name"],
                    "market": candidate["market"],
                    "score": round(score, 4),
                    "textSimilarity": round(text_score, 4),
                    "industrySimilarity": round(industry_score, 4),
                    "sharedTerms": terms,
                    "reason": reason_for(stock, candidate, terms),
                }
            )
        candidates.sort(
            key=lambda item: (
                -item["score"],
                -int(stocks_by_symbol[item["symbol"]].get("marketCap", 0)),
                item["symbol"],
            )
        )
        results[stock["symbol"]] = candidates[:top_k]

    return {
        "schemaVersion": 1,
        "asOf": date.today().isoformat(),
        "method": {
            "name": "local-char-tfidf-plus-industry",
            "textWeight": 0.7,
            "industryWeight": 0.3,
            "textLimitChars": 8_000,
            "features": int(embeddings.shape[1]),
            "llmUsed": False,
        },
        "counts": {
            "companies": len(eligible),
            "recommendations": sum(len(items) for items in results.values()),
        },
        "similar": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build deterministic Korean stock similarity scores")
    parser.add_argument("--master", type=Path, default=MASTER_PATH)
    parser.add_argument("--business", type=Path, default=BUSINESS_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--min-companies", type=int, default=2_000)
    args = parser.parse_args()

    payload = build_similarity(
        read_json(args.master),
        read_json(args.business),
        top_k=max(1, args.top_k),
        min_companies=max(2, args.min_companies),
    )
    write_json(args.output, payload)
    print(
        f"Similarity saved: {payload['counts']['companies']} companies, "
        f"{payload['counts']['recommendations']} recommendations -> {args.output}"
    )


if __name__ == "__main__":
    main()
