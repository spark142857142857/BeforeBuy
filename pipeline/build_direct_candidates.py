from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
TAXONOMY_PATH = ROOT / "data" / "generated" / "kr_company_taxonomy.json"
MASTER_PATH = ROOT / "data" / "generated" / "kr_stocks.json"
SIMILARITY_PATH = ROOT / "data" / "generated" / "kr_similarity.json"
DEFAULT_OUTPUT = ROOT / "data" / "generated" / "kr_direct_candidates.json"
MAX_DIRECT_CANDIDATES = 6

# A taxonomy role says what a business is exposed to; it does not automatically
# mean that every company with that broad label is a defensible direct peer.
# Only roles that have passed sector review can produce a direct-candidate link.
# Other classified companies remain searchable and keep their sector tags, but
# are honestly shown as having no qualified direct peer until a narrower role
# rule exists.
DIRECT_CANDIDATE_ROLES = {
    ("automotive", "complete-vehicle"),
    ("automotive", "tire"),
    ("biopharma", "biopharma"),
    ("biopharma", "biopharma-cdmo"),
    ("biopharma", "biosimilar-development"),
    ("biopharma", "biosimilar-manufacturing"),
    ("biopharma", "diagnostics"),
    ("biopharma", "drug-discovery"),
    ("financials", "bank"),
    ("financials", "securities"),
    ("financials", "life-insurance"),
    ("financials", "non-life-insurance"),
    ("financials", "reinsurance"),
    ("financials", "guarantee-insurance"),
    ("financials", "credit-finance"),
    ("financials", "financial-holding"),
    ("internet-platform", "portal-platform"),
    ("internet-platform", "commerce-platform"),
    ("internet-platform", "content-platform"),
    ("internet-platform", "platform-infrastructure"),
    ("secondary-battery", "battery-cell"),
    ("secondary-battery", "battery-cathode"),
    ("secondary-battery", "battery-anode"),
    ("secondary-battery", "battery-separator"),
    ("secondary-battery", "battery-electrolyte"),
    ("secondary-battery", "battery-equipment"),
    ("secondary-battery", "battery-recycling"),
    ("semiconductors", "integrated-device"),
    ("semiconductors", "memory"),
    ("semiconductors", "foundry"),
    ("semiconductors", "fabless"),
    ("semiconductors", "design-house"),
    ("semiconductors", "semiconductor-ip"),
    ("semiconductors", "packaging-osat"),
    ("semiconductors", "test-inspection"),
    ("semiconductors", "semiconductor-equipment"),
    ("semiconductors", "semiconductor-materials-parts"),
    ("software", "game"),
    ("telecom", "mobile-carrier"),
    ("telecom", "telecom-reseller"),
    ("telecom", "telecom-network-equipment"),
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(path)


def eligible_role(company: dict[str, Any]) -> dict[str, Any] | None:
    role = company["classification"].get("primaryRole")
    if not role or role.get("source") not in {"krx", "dart", "both"}:
        return None
    if role_key(role) not in DIRECT_CANDIDATE_ROLES:
        return None
    return role


def role_key(role: dict[str, Any]) -> tuple[str, str]:
    return role["comparisonSectorId"], role["id"]


def build_candidates(
    taxonomy: dict[str, Any],
    master: dict[str, Any],
    similarity: dict[str, Any],
) -> dict[str, Any]:
    market_caps = {stock["symbol"]: stock.get("marketCap", 0) for stock in master.get("stocks", [])}
    companies = taxonomy.get("companies", [])
    company_by_symbol = {company["symbol"]: company for company in companies}
    roles = {
        company["symbol"]: role
        for company in companies
        if (role := eligible_role(company)) is not None
    }
    by_role: dict[tuple[str, str], list[str]] = {}
    for symbol, role in roles.items():
        by_role.setdefault(role_key(role), []).append(symbol)

    links: dict[str, dict[str, Any]] = {}
    for company in companies:
        symbol = company["symbol"]
        role = roles.get(symbol)
        if role is None:
            links[symbol] = {
                "status": "no-qualified-role",
                "directCandidates": [],
            }
            continue

        similarity_by_symbol = {
            candidate["symbol"]: candidate
            for candidate in similarity.get("similar", {}).get(symbol, [])
        }
        candidates = []
        for candidate_symbol in by_role[role_key(role)]:
            if candidate_symbol == symbol:
                continue
            similarity_item = similarity_by_symbol.get(candidate_symbol, {})
            candidate = company_by_symbol[candidate_symbol]
            candidates.append(
                {
                    "symbol": candidate_symbol,
                    "name": candidate["name"],
                    "role": {"id": role["id"], "label": role["label"]},
                    "reason": f"같은 주력 역할: {role['label']}",
                    "similarityScore": similarity_item.get("score"),
                    "sharedExposures": similarity_item.get("sharedExposures", []),
                    "marketCap": market_caps.get(candidate_symbol, 0),
                }
            )
        candidates.sort(
            key=lambda candidate: (
                -(candidate["similarityScore"] if candidate["similarityScore"] is not None else -1),
                -candidate["marketCap"],
                candidate["symbol"],
            )
        )
        links[symbol] = {
            "status": "available" if candidates else "no-direct-peer",
            "primaryRole": {
                "id": role["id"],
                "label": role["label"],
                "comparisonSectorId": role["comparisonSectorId"],
                "source": role["source"],
            },
            "directCandidates": candidates[:MAX_DIRECT_CANDIDATES],
        }

    status_counts = Counter(entry["status"] for entry in links.values())
    role_counts = Counter(
        (entry["primaryRole"]["comparisonSectorId"], entry["primaryRole"]["id"])
        for entry in links.values()
        if "primaryRole" in entry
    )
    return {
        "schemaVersion": 1,
        "asOf": taxonomy.get("asOf", date.today().isoformat()),
        "source": {"taxonomy": "kr_company_taxonomy.json", "similarity": "kr_similarity.json"},
        "method": {
            "llmUsed": False,
            "selection": "Only sector-reviewed roles with the same confirmed primary role can be direct candidates; no quota is forced.",
            "rolePolicy": "Broad taxonomy roles remain visible for search and sector context, but they do not create direct peers until a sector-specific rule is reviewed.",
            "ordering": "Existing local similarity score, then market capitalization; the shared role is the eligibility rule.",
        },
        "counts": {
            "companies": len(links),
            "status": dict(sorted(status_counts.items())),
            "roles": {
                f"{sector}:{role}": count
                for (sector, role), count in sorted(role_counts.items())
            },
        },
        "links": links,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build deterministic direct-peer candidates for all classified Korean stocks")
    parser.add_argument("--taxonomy", type=Path, default=TAXONOMY_PATH)
    parser.add_argument("--master", type=Path, default=MASTER_PATH)
    parser.add_argument("--similarity", type=Path, default=SIMILARITY_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    payload = build_candidates(read_json(args.taxonomy), read_json(args.master), read_json(args.similarity))
    write_json(args.output, payload)
    print(f"Direct candidates saved: {payload['counts']} -> {args.output} ({args.output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
