from __future__ import annotations

import argparse
import gzip
import json
import re
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = ROOT / "data" / "generated" / "kr_stocks.json"
BUSINESS_PATH = ROOT / "data" / "generated" / "dart_business.json.gz"
DEFAULT_OUTPUT = ROOT / "data" / "generated" / "business_profiles.json"
PREFERRED_MANUAL_ALIASES = {
    "008355": "008350",  # 남선알미우 → 남선알미늄
    "007815": "007810",  # 코리아써우 → 코리아써키트
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


def preferred_base_name(name: str) -> str:
    compact = re.sub(r"\s+", "", name)
    patterns = (
        r"\d+우\(전환\)$",
        r"우\(전환\)$",
        r"\d+우[A-Z]$",
        r"\d+우$",
        r"우[A-Z]$",
        r"우$",
    )
    for pattern in patterns:
        base = re.sub(pattern, "", compact)
        if base != compact:
            return base
    return compact


def preferred_aliases(
    stocks: list[dict[str, Any]],
    business_companies: dict[str, dict[str, Any]],
) -> dict[str, str]:
    by_name = {
        re.sub(r"\s+", "", stock["name"]): stock["symbol"]
        for stock in stocks
        if stock["securityType"] == "common"
    }
    aliases: dict[str, str] = {}
    unresolved: list[str] = []
    for stock in stocks:
        if stock["securityType"] != "preferred":
            continue
        symbol = stock["symbol"]
        company = business_companies.get(symbol, {})
        if company.get("status") != "unmapped":
            continue
        target = PREFERRED_MANUAL_ALIASES.get(symbol)
        if not target:
            target = by_name.get(preferred_base_name(stock["name"]))
        if not target or business_companies.get(target, {}).get("status") != "ok":
            unresolved.append(symbol)
            continue
        aliases[symbol] = target
    if unresolved:
        raise RuntimeError(f"Preferred share aliases are unresolved: {', '.join(unresolved)}")
    return aliases


def no_annual_category(stock: dict[str, Any]) -> str:
    if stock["securityType"] == "spac":
        return "spac"
    if stock.get("industry") == "신탁업 및 집합투자업":
        return "fund"
    return "limited"


def build_profiles(master: dict[str, Any], business: dict[str, Any]) -> dict[str, Any]:
    stocks = master["stocks"]
    companies = business["companies"]
    aliases = preferred_aliases(stocks, companies)
    profiles: dict[str, dict[str, Any]] = {}
    unavailable: dict[str, dict[str, str]] = {}

    for stock in stocks:
        symbol = stock["symbol"]
        if symbol in aliases:
            continue
        company = companies.get(symbol)
        if not company:
            unavailable[symbol] = {
                "category": "collection_error",
                "reason": "not_collected",
            }
            continue
        if company.get("status") == "ok":
            profiles[symbol] = {
                "reportPeriod": company["reportPeriod"],
                "receiptDate": company["receiptDate"],
                "sourceUrl": company["sourceUrl"],
                "textConfidence": company["textConfidence"],
                "textLength": company["textLength"],
                "fallbackCount": company.get("fallbackCount", 0),
            }
            if company.get("lastAttempt"):
                profiles[symbol]["refreshWarning"] = {
                    "status": company["lastAttempt"].get("status", "unknown"),
                    "attemptedAt": company["lastAttempt"].get("attemptedAt", ""),
                }
        elif company.get("status") == "no_annual_report":
            unavailable[symbol] = {
                "category": no_annual_category(stock),
                "reason": "annual_report_not_available",
            }
        elif company.get("status") in {"error", "annual_report_unusable", "unmapped"}:
            unavailable[symbol] = {
                "category": "collection_error",
                "reason": company.get("status", "collection_error"),
            }

    categories: dict[str, int] = {}
    for item in unavailable.values():
        categories[item["category"]] = categories.get(item["category"], 0) + 1

    return {
        "schemaVersion": 2,
        "asOf": date.today().isoformat(),
        "source": "OpenDART annual business reports + KRX aliases",
        "counts": {
            "profiles": len(profiles),
            "preferredAliases": len(aliases),
            "unavailable": len(unavailable),
            "refreshWarnings": sum(
                bool(profile.get("refreshWarning")) for profile in profiles.values()
            ),
            **categories,
        },
        "profiles": profiles,
        "aliases": aliases,
        "unavailable": unavailable,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build compact business profiles for the web app")
    parser.add_argument("--master", type=Path, default=MASTER_PATH)
    parser.add_argument("--business", type=Path, default=BUSINESS_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    payload = build_profiles(read_json(args.master), read_json(args.business))
    write_json(args.output, payload)
    print(
        f"Web profiles saved: {payload['counts']} -> {args.output} "
        f"({args.output.stat().st_size:,} bytes)"
    )


if __name__ == "__main__":
    main()
