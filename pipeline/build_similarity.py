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


def product_similarity(left: dict[str, Any], right: dict[str, Any]) -> float:
    left_tokens = tokens(left.get("products", ""))
    right_tokens = tokens(right.get("products", ""))
    denominator = min(len(left_tokens), len(right_tokens))
    return len(left_tokens & right_tokens) / denominator if denominator else 0.0


def shared_terms(left: dict[str, Any], right: dict[str, Any]) -> list[str]:
    left_terms = tokens(f"{left.get('industry', '')} {left.get('products', '')}")
    right_terms = tokens(f"{right.get('industry', '')} {right.get('products', '')}")
    common = left_terms & right_terms
    return sorted(common, key=lambda value: (-len(value), value))[:3]


def document_for(stock: dict[str, Any], business: dict[str, Any]) -> str:
    industry = stock.get("industry", "")
    products = stock.get("products", "")
    business_text = business.get("text", "")[:8_000]
    low_confidence = business.get("textConfidence") == "low"
    industry_repeats = 8 if low_confidence else 4
    product_repeats = 4 if low_confidence else 2
    return " ".join(
        [industry] * industry_repeats
        + [products] * product_repeats
        + [business_text]
    )


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
            and item.get("reportType") == "annual"
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
    industry_indices: dict[str, set[int]] = {}
    product_indices: dict[str, set[int]] = {}
    for index, stock in enumerate(eligible):
        industry = stock.get("industry", "").strip()
        if industry:
            industry_indices.setdefault(industry, set()).add(index)
        for term in tokens(stock.get("products", "")):
            product_indices.setdefault(term, set()).add(index)

    results: dict[str, list[dict[str, Any]]] = {}
    for row, stock in enumerate(eligible):
        candidates: list[dict[str, Any]] = []
        text_neighbor_scores = {
            int(candidate_index): max(0.0, 1.0 - float(distance))
            for distance, candidate_index in zip(distances[row], indices[row], strict=True)
        }
        candidate_indices = set(text_neighbor_scores)
        candidate_indices.update(industry_indices.get(stock.get("industry", "").strip(), set()))
        for term in tokens(stock.get("products", "")):
            matches = product_indices.get(term, set())
            if len(matches) <= 250:
                candidate_indices.update(matches)
        candidate_indices.discard(row)
        ordered_indices = sorted(candidate_indices)
        missing_text_indices = [
            candidate_index
            for candidate_index in ordered_indices
            if candidate_index not in text_neighbor_scores
        ]
        if missing_text_indices:
            similarities = (
                embeddings[row] @ embeddings[missing_text_indices].T
            ).toarray()[0]
            text_neighbor_scores.update(
                {
                    candidate_index: max(0.0, float(similarity))
                    for candidate_index, similarity in zip(
                        missing_text_indices,
                        similarities,
                        strict=True,
                    )
                }
            )

        for candidate_index in ordered_indices:
            candidate = eligible[candidate_index]
            text_score = text_neighbor_scores[candidate_index]
            industry_score = industry_similarity(stock, candidate)
            product_score = product_similarity(stock, candidate)
            left_business = business["companies"][stock["symbol"]]
            right_business = business["companies"][candidate["symbol"]]
            low_confidence = (
                left_business.get("textConfidence") == "low"
                or right_business.get("textConfidence") == "low"
            )
            if low_confidence:
                text_weight, industry_weight, product_weight = 0.3, 0.45, 0.25
            else:
                text_weight, industry_weight, product_weight = 0.55, 0.3, 0.15
            score = (
                text_score * text_weight
                + industry_score * industry_weight
                + product_score * product_weight
            )
            terms = shared_terms(stock, candidate)
            result = {
                "symbol": candidate["symbol"],
                "score": round(score, 4),
                "textSimilarity": round(text_score, 4),
                "industrySimilarity": round(industry_score, 4),
                "productSimilarity": round(product_score, 4),
                "sharedTerms": terms,
            }
            if low_confidence:
                result["confidence"] = "low"
            candidates.append(result)
        candidates.sort(
            key=lambda item: (
                -item["score"],
                -int(stocks_by_symbol[item["symbol"]].get("marketCap", 0)),
                item["symbol"],
            )
        )
        results[stock["symbol"]] = candidates[:top_k]

    return {
        "schemaVersion": 2,
        "asOf": date.today().isoformat(),
        "method": {
            "name": "annual-business-char-tfidf-plus-industry",
            "reportType": "annual",
            "standardWeights": {"text": 0.55, "industry": 0.3, "products": 0.15},
            "lowConfidenceWeights": {"text": 0.3, "industry": 0.45, "products": 0.25},
            "textLimitChars": 8_000,
            "features": int(embeddings.shape[1]),
            "llmUsed": False,
        },
        "counts": {
            "companies": len(eligible),
            "recommendations": sum(len(items) for items in results.values()),
            "lowConfidenceCompanies": sum(
                business["companies"][stock["symbol"]].get("textConfidence") == "low"
                for stock in eligible
            ),
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
