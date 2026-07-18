from __future__ import annotations

import argparse
import gzip
import json
import math
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
EXPOSURE_RULES_PATH = ROOT / "data" / "curated" / "business_exposure_rules.json"
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


def product_similarity(left: dict[str, Any], right: dict[str, Any]) -> float:
    left_tokens = tokens(left.get("products", ""))
    right_tokens = tokens(right.get("products", ""))
    denominator = len(left_tokens) + len(right_tokens)
    return (2 * len(left_tokens & right_tokens) / denominator) if denominator else 0.0


def scale_similarity(left: dict[str, Any], right: dict[str, Any]) -> float:
    left_cap = int(left.get("marketCap", 0))
    right_cap = int(right.get("marketCap", 0))
    if left_cap <= 0 or right_cap <= 0:
        return 0.0
    ratio = min(left_cap, right_cap) / max(left_cap, right_cap)
    return math.pow(ratio, 0.25)


def shared_terms(left: dict[str, Any], right: dict[str, Any]) -> list[str]:
    left_terms = tokens(left.get("products", ""))
    right_terms = tokens(right.get("products", ""))
    common = left_terms & right_terms
    return sorted(common, key=lambda value: (-len(value), value))[:3]


def keyword_hits(value: str, keywords: list[str]) -> list[str]:
    lowered = value.lower()
    return [keyword for keyword in keywords if keyword.lower() in lowered]


def _merge_exposure(
    exposures: dict[str, dict[str, Any]],
    exposure_id: str,
    label: str,
    strength: int,
) -> None:
    if strength <= 0:
        return
    current = exposures.get(exposure_id)
    if current is None or strength > int(current["strength"]):
        exposures[exposure_id] = {"label": label, "strength": strength}


def extract_business_exposures(
    stock: dict[str, Any],
    business: dict[str, Any],
    exposure_rules: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    industry = stock.get("industry", "")
    products = stock.get("products", "")
    business_text_chars = int(exposure_rules.get("businessTextChars", 2_500))
    business_text = business.get("text", "")[:business_text_chars]
    exposures: dict[str, dict[str, Any]] = {}
    labels = {
        rule["id"]: rule["label"]
        for rule in exposure_rules.get("rules", [])
    }
    rules_by_id = {
        rule["id"]: rule
        for rule in exposure_rules.get("rules", [])
    }
    battery_context_cues = [
        "2차전지",
        "이차전지",
        "배터리",
        "축전지",
        "리튬전지",
    ]
    equipment_cues = [
        "장비",
        "금형",
        "설비",
        "자동화",
        "믹싱",
        "검사시스템",
        "충방전",
        "포메이션",
        "조립설비",
        "자동화 설비",
    ]
    materials_cues = [
        "양극",
        "음극",
        "전극",
        "소재",
        "전구체",
        "전해액",
        "분리막",
        "코팅액",
        "활물질",
        "양극재료",
        "음극재료",
        "전지소재",
        "전지 소재",
        "동박",
    ]
    parts_cues = [
        "부품",
        "테이프",
        "캡 어셈블리",
        "cid",
        "보호회로",
        "배터리팩",
        "배터리 팩",
        "셀케이스",
        "셀 케이스",
        "배터리 핀",
        "테스트 pin",
        "트레이",
        "필름",
        "소화안전",
        "안전제품",
    ]

    for rule in exposure_rules.get("rules", []):
        keywords = rule.get("keywords", [])
        # productKeywords는 KRX 주요 제품 필드 전용. DART 본문에는 일반 keywords만 사용합니다.
        product_only_keywords = rule.get("productKeywords", [])
        name_hits = keyword_hits(stock.get("name", ""), rule.get("nameKeywords", []))
        industry_hits = keyword_hits(industry, keywords)
        product_hits = keyword_hits(products, keywords + product_only_keywords)
        business_hits = keyword_hits(business_text, keywords)
        minimum_business_hits = int(rule.get("minBusinessHits", 2))
        business_only_match = (
            bool(rule.get("allowBusinessOnly"))
            and len(business_hits) >= minimum_business_hits
        )
        if not name_hits and not industry_hits and not product_hits and not business_only_match:
            continue
        strength = (
            (2 if name_hits else 0)
            + (3 if industry_hits else 0)
            + (2 if product_hits else 0)
            + min(2, len(business_hits))
        )
        _merge_exposure(exposures, rule["id"], rule["label"], strength)

    for exposure_id, strength in (
        exposure_rules.get("industryPriors", {}).get(industry, {}) or {}
    ).items():
        if exposure_id not in labels:
            continue
        _merge_exposure(exposures, exposure_id, labels[exposure_id], int(strength))

    # 2차전지 관련성(밸류체인)과 실제 역할(셀·소재·부품·장비)을 분리합니다.
    product_has_battery_context = bool(
        keyword_hits(products, battery_context_cues)
    )
    business_has_battery_context = bool(
        keyword_hits(business_text, battery_context_cues)
    )
    exact_battery_industry = industry == "일차전지 및 이차전지 제조업"
    cell_product_evidence = keyword_hits(
        products,
        [
            "자동차전지",
            "리튬이온전지",
            "리튬이온 전지",
            "전고체 배터리",
            "원통형 전지",
            "파우치형 전지",
            "각형 전지",
            "축전지",
            "밧데리",
        ],
    )
    generic_cell_product = bool(
        exact_battery_industry
        and keyword_hits(products, ["2차전지", "이차전지"])
    )

    product_equipment = product_has_battery_context and bool(
        keyword_hits(products, equipment_cues)
    )
    product_parts = product_has_battery_context and bool(
        keyword_hits(products, parts_cues)
    )
    product_materials = product_has_battery_context and bool(
        keyword_hits(products, materials_cues)
    )
    business_equipment = bool(
        "기계" in industry
        and keyword_hits(
            business_text,
            rules_by_id["battery-equipment"].get("keywords", []),
        )
    )

    battery_role: str | None = None
    if product_equipment or business_equipment:
        battery_role = "battery-equipment"
    elif product_materials:
        battery_role = "battery-materials"
    elif product_parts:
        battery_role = "battery-parts"
    elif cell_product_evidence or generic_cell_product:
        battery_role = "battery-cell"

    for role in (
        "battery-cell",
        "battery-materials",
        "battery-parts",
        "battery-equipment",
    ):
        if role != battery_role:
            exposures.pop(role, None)
    if battery_role:
        _merge_exposure(exposures, battery_role, labels[battery_role], 4)

    battery_related = bool(
        battery_role
        or product_has_battery_context
        or exact_battery_industry
        or business_equipment
        or "battery-value-chain" in exposures
    )
    if battery_related:
        exposures["battery-value-chain"] = {
            "label": labels["battery-value-chain"],
            "strength": 1,
        }
    else:
        exposures.pop("battery-value-chain", None)

    override = exposure_rules.get("reviewedOverrides", {}).get(stock["symbol"])
    if override:
        exposures = {
            exposure: {
                "label": labels[exposure],
                "strength": int(strength),
            }
            for exposure, strength in override.get("exposures", {}).items()
            if exposure in labels and int(strength) > 0
        }
    return exposures


def business_exposure_similarity(
    left: dict[str, dict[str, Any]],
    right: dict[str, dict[str, Any]],
) -> tuple[float, list[str]]:
    shared = set(left) & set(right)
    if not shared:
        return 0.0, []
    shared_weight = sum(
        min(left[tag]["strength"], right[tag]["strength"])
        for tag in shared
    )
    left_weight = sum(item["strength"] for item in left.values())
    right_weight = sum(item["strength"] for item in right.values())
    if left_weight <= 0 or right_weight <= 0:
        return 0.0, []
    # min(left,right) containment는 태그 1개 순수기업에 점수가 과도하게 붙습니다.
    left_containment = shared_weight / left_weight
    right_containment = shared_weight / right_weight
    union_weight = sum(
        max(
            left.get(tag, {}).get("strength", 0),
            right.get(tag, {}).get("strength", 0),
        )
        for tag in set(left) | set(right)
    )
    weighted_jaccard = shared_weight / union_weight if union_weight else 0.0
    score = left_containment * 0.4 + right_containment * 0.3 + weighted_jaccard * 0.3
    labels = [
        left[tag]["label"]
        for tag in sorted(
            shared,
            key=lambda tag: (
                -min(left[tag]["strength"], right[tag]["strength"]),
                left[tag]["label"],
            ),
        )
    ][:4]
    return score, labels


def document_for(stock: dict[str, Any], business: dict[str, Any]) -> str:
    industry = stock.get("industry", "")
    products = stock.get("products", "")
    business_text = business.get("text", "")[:8_000]
    low_confidence = business.get("textConfidence") == "low"
    industry_repeats = 2 if low_confidence else 1
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
    exposure_rules: dict[str, Any] | None = None,
) -> dict[str, Any]:
    exposure_rules = exposure_rules or read_json(EXPOSURE_RULES_PATH)
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
    exposures_by_symbol = {
        stock["symbol"]: extract_business_exposures(
            stock,
            business["companies"][stock["symbol"]],
            exposure_rules,
        )
        for stock in eligible
    }
    exposure_indices: dict[str, set[int]] = {}
    product_indices: dict[str, set[int]] = {}
    for index, stock in enumerate(eligible):
        for exposure in exposures_by_symbol[stock["symbol"]]:
            exposure_indices.setdefault(exposure, set()).add(index)
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
        for exposure in exposures_by_symbol[stock["symbol"]]:
            matches = exposure_indices.get(exposure, set())
            if len(matches) <= 500:
                candidate_indices.update(matches)
            else:
                # 태그가 매우 흔하면 전수 대신 시총 상위 후보를 넣어 대형 peer 누락을 막습니다.
                ranked = sorted(
                    matches,
                    key=lambda index: (
                        -int(eligible[index].get("marketCap", 0)),
                        eligible[index]["symbol"],
                    ),
                )
                candidate_indices.update(ranked[:500])
        for term in tokens(stock.get("products", "")):
            matches = product_indices.get(term, set())
            if len(matches) <= 250:
                candidate_indices.update(matches)
            else:
                ranked = sorted(
                    matches,
                    key=lambda index: (
                        -int(eligible[index].get("marketCap", 0)),
                        eligible[index]["symbol"],
                    ),
                )
                candidate_indices.update(ranked[:250])
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
            exposure_score, shared_exposures = business_exposure_similarity(
                exposures_by_symbol[stock["symbol"]],
                exposures_by_symbol[candidate["symbol"]],
            )
            product_score = product_similarity(stock, candidate)
            scale_score = scale_similarity(stock, candidate)
            left_business = business["companies"][stock["symbol"]]
            right_business = business["companies"][candidate["symbol"]]
            low_confidence = (
                left_business.get("textConfidence") == "low"
                or right_business.get("textConfidence") == "low"
            )
            if low_confidence:
                text_weight, exposure_weight, product_weight, scale_weight = 0.15, 0.55, 0.2, 0.1
            else:
                text_weight, exposure_weight, product_weight, scale_weight = 0.4, 0.4, 0.1, 0.1
            score = (
                text_score * text_weight
                + exposure_score * exposure_weight
                + product_score * product_weight
                + scale_score * scale_weight
            )
            terms = shared_terms(stock, candidate)
            result = {
                "symbol": candidate["symbol"],
                "score": round(score, 4),
                "textSimilarity": round(text_score, 4),
                "exposureSimilarity": round(exposure_score, 4),
                "productSimilarity": round(product_score, 4),
                "sharedExposures": shared_exposures,
                "sharedTerms": terms,
            }
            limited_comparison_evidence = not shared_exposures and score < 0.25
            if low_confidence or limited_comparison_evidence:
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
        "schemaVersion": 4,
        "asOf": date.today().isoformat(),
        "method": {
            "name": "annual-business-char-tfidf-plus-multi-exposure",
            "reportType": "annual",
            "standardWeights": {"text": 0.4, "businessExposures": 0.4, "products": 0.1, "scale": 0.1},
            "lowConfidenceWeights": {"text": 0.15, "businessExposures": 0.55, "products": 0.2, "scale": 0.1},
            "exposureSimilarity": "40% left containment + 30% right containment + 30% weighted Jaccard",
            "industryExactMatchUsed": False,
            "industrySoftPriorsUsed": True,
            "industrySoftPriorCount": len(exposure_rules.get("industryPriors", {})),
            "textLimitChars": 8_000,
            "features": int(embeddings.shape[1]),
            "exposureRules": len(exposure_rules.get("rules", [])),
            "reviewedExposureOverrides": len(
                exposure_rules.get("reviewedOverrides", {})
            ),
            "llmUsed": False,
        },
        "counts": {
            "companies": len(eligible),
            "recommendations": sum(len(items) for items in results.values()),
            "lowConfidenceCompanies": sum(
                business["companies"][stock["symbol"]].get("textConfidence") == "low"
                for stock in eligible
            ),
            "companiesWithExposures": sum(
                bool(exposures_by_symbol[stock["symbol"]])
                for stock in eligible
            ),
            "lowConfidenceRecommendations": sum(
                item.get("confidence") == "low"
                for items in results.values()
                for item in items
            ),
        },
        "similar": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build deterministic Korean stock similarity scores")
    parser.add_argument("--master", type=Path, default=MASTER_PATH)
    parser.add_argument("--business", type=Path, default=BUSINESS_PATH)
    parser.add_argument("--exposure-rules", type=Path, default=EXPOSURE_RULES_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--min-companies", type=int, default=2_000)
    args = parser.parse_args()

    payload = build_similarity(
        read_json(args.master),
        read_json(args.business),
        top_k=max(1, args.top_k),
        min_companies=max(2, args.min_companies),
        exposure_rules=read_json(args.exposure_rules),
    )
    write_json(args.output, payload)
    print(
        f"Similarity saved: {payload['counts']['companies']} companies, "
        f"{payload['counts']['recommendations']} recommendations -> {args.output}"
    )


if __name__ == "__main__":
    main()
