from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = ROOT / "data" / "generated" / "kr_stocks.json"
PROFILES_PATH = ROOT / "data" / "generated" / "business_profiles.json"
RULES_PATH = ROOT / "data" / "curated" / "global_rules.json"
DEFAULT_OUTPUT = ROOT / "data" / "generated" / "global_links.json"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    temporary.replace(path)


def keyword_hits(text: str, keywords: list[str]) -> list[str]:
    lowered = text.lower()
    return [keyword for keyword in keywords if keyword.lower() in lowered]


def score_rule(stock: dict[str, Any], profile: dict[str, Any], rule: dict[str, Any]) -> tuple[int, list[str]]:
    name = stock.get("name", "")
    industry = f"{stock.get('sector', '')} {stock.get('industry', '')}"
    products = stock.get("products", "")
    business = profile.get("excerpt", "")
    name_hits = keyword_hits(name, rule.get("nameKeywords", []))
    industry_hits = keyword_hits(industry, rule.get("industryKeywords", []))
    required_industry_hits = keyword_hits(industry, rule.get("requiredIndustryKeywords", []))
    product_hits = keyword_hits(products, rule.get("productKeywords", []))
    business_hits = keyword_hits(business, rule.get("businessKeywords", []))
    if rule.get("requireNameMatch") and not name_hits:
        return 0, []
    if rule.get("requiredIndustryKeywords") and not required_industry_hits:
        return 0, []
    score = (
        min(4, len(name_hits) * 2)
        + min(6, len(industry_hits) * 4)
        + min(6, len(product_hits) * 2)
        + min(4, len(business_hits))
    )
    matched = list(dict.fromkeys(name_hits + industry_hits + product_hits + business_hits))[:6]
    return score, matched


def build_links(
    master: dict[str, Any],
    profiles: dict[str, Any],
    rules: dict[str, Any],
) -> dict[str, Any]:
    stocks = {stock["symbol"]: stock for stock in master.get("stocks", [])}
    aliases = profiles.get("aliases", {})
    scored: dict[str, list[dict[str, Any]]] = {}

    for requested_symbol, requested_stock in stocks.items():
        if requested_stock.get("securityType") in {"spac", "reit"}:
            continue
        business_symbol = aliases.get(requested_symbol, requested_symbol)
        stock = stocks.get(business_symbol, stocks[requested_symbol])
        profile = profiles.get("profiles", {}).get(business_symbol)
        if not profile:
            continue
        matches = []
        for rule in rules.get("rules", []):
            score, terms = score_rule(stock, profile, rule)
            if score < int(rule.get("minimumScore", 1)):
                continue
            matches.append(
                {
                    "id": rule["id"],
                    "theme": rule["theme"],
                    "label": rule["label"],
                    "score": score,
                    "matchedTerms": terms,
                    "reason": rule["reason"],
                    "peerSlugs": rule.get("peerSlugs", []),
                    "etfSlugs": rule.get("etfSlugs", []),
                }
            )
        matches.sort(key=lambda item: (-item["score"], item["id"]))
        selected = []
        seen_themes: set[str] = set()
        for match in matches:
            if match["theme"] in seen_themes:
                continue
            selected.append(match)
            seen_themes.add(match["theme"])
            if len(selected) == 2:
                break
        if selected:
            scored[requested_symbol] = selected

    theme_counts = Counter(
        match["theme"]
        for matches in scored.values()
        for match in matches
    )
    return {
        "schemaVersion": 1,
        "asOf": date.today().isoformat(),
        "method": {
            "name": "curated-keyword-business-rules",
            "inputs": ["KRX industry", "KRX products", "annual DART business excerpt"],
            "llmUsed": False,
            "maximumThemesPerStock": 2,
        },
        "counts": {
            "stocks": len(stocks),
            "mappedStocks": len(scored),
            "themeMatches": sum(len(matches) for matches in scored.values()),
            "byTheme": dict(sorted(theme_counts.items())),
        },
        "links": scored,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build deterministic global peer and ETF links")
    parser.add_argument("--master", type=Path, default=MASTER_PATH)
    parser.add_argument("--profiles", type=Path, default=PROFILES_PATH)
    parser.add_argument("--rules", type=Path, default=RULES_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    payload = build_links(
        read_json(args.master),
        read_json(args.profiles),
        read_json(args.rules),
    )
    write_json(args.output, payload)
    print(
        f"Global links saved: {payload['counts']['mappedStocks']} mapped stocks, "
        f"{payload['counts']['themeMatches']} theme matches -> {args.output}"
    )


if __name__ == "__main__":
    main()
