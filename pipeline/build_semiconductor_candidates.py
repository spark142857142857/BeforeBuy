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
DEFAULT_OUTPUT = ROOT / "data" / "generated" / "kr_semiconductor_candidates.json"
MAX_DIRECT_CANDIDATES = 6
ROLE_PRIORITIES = {
    "memory": 100,
    "foundry": 95,
    "semiconductor-ip": 95,
    "design-house": 90,
    "fabless": 85,
    "test-inspection": 80,
    "packaging-osat": 70,
    "semiconductor-equipment": 65,
    "semiconductor-materials-parts": 60,
    "integrated-device": 40,
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(path)


def semiconductor_role(company: dict[str, Any]) -> dict[str, Any] | None:
    # Equipment and materials companies can have an industrial KRX primary
    # sector while still having a confirmed semiconductor business role. This
    # specialized snapshot intentionally keeps that semiconductor comparison
    # path; the all-company direct snapshot remains stricter and uses primary
    # roles only.
    primary_role = company["classification"].get("primaryRole")
    if primary_role and primary_role.get("comparisonSectorId") == "semiconductors":
        return primary_role
    roles = [
        role
        for role in company["classification"].get("subSectors", [])
        if role.get("comparisonSectorId") == "semiconductors"
    ]
    if not roles:
        return None
    return sorted(
        roles,
        key=lambda role: (-ROLE_PRIORITIES.get(role["id"], 0), role["id"]),
    )[0]


def build_candidates(
    taxonomy: dict[str, Any],
    master: dict[str, Any],
    similarity: dict[str, Any],
) -> dict[str, Any]:
    market_caps = {stock["symbol"]: stock.get("marketCap", 0) for stock in master.get("stocks", [])}
    companies = taxonomy.get("companies", [])
    roles = {
        company["symbol"]: role
        for company in companies
        if (role := semiconductor_role(company)) is not None
    }
    by_role: dict[str, list[str]] = {}
    for symbol, role in roles.items():
        by_role.setdefault(role["id"], []).append(symbol)

    company_by_symbol = {company["symbol"]: company for company in companies}
    links: dict[str, dict[str, Any]] = {}
    for symbol, role in sorted(roles.items()):
        similarity_by_symbol = {
            candidate["symbol"]: candidate
            for candidate in similarity.get("similar", {}).get(symbol, [])
        }
        candidates = []
        for candidate_symbol in by_role[role["id"]]:
            if candidate_symbol == symbol:
                continue
            similarity_item = similarity_by_symbol.get(candidate_symbol, {})
            candidate = company_by_symbol[candidate_symbol]
            candidates.append(
                {
                    "symbol": candidate_symbol,
                    "name": candidate["name"],
                    "role": {
                        "id": role["id"],
                        "label": role["label"],
                    },
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
            "primaryRole": {
                "id": role["id"],
                "label": role["label"],
                "source": role["source"],
            },
            "directCandidates": candidates[:MAX_DIRECT_CANDIDATES],
            "coverage": "available" if candidates else "none",
        }

    role_counts = Counter(entry["primaryRole"]["id"] for entry in links.values())
    return {
        "schemaVersion": 1,
        "asOf": taxonomy.get("asOf", date.today().isoformat()),
        "source": {
            "taxonomy": "kr_company_taxonomy.json",
            "similarity": "kr_similarity.json",
        },
        "method": {
            "llmUsed": False,
            "selection": "Same semiconductor primaryRole only; no quota is forced when a role has no domestic peer.",
            "ordering": "Existing local similarity score, then market capitalization; the role match is the eligibility rule.",
        },
        "counts": {
            "coveredCompanies": len(links),
            "roles": dict(sorted(role_counts.items())),
            "withoutDirectCandidate": sum(entry["coverage"] == "none" for entry in links.values()),
        },
        "links": links,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build conservative domestic semiconductor direct-peer candidates")
    parser.add_argument("--taxonomy", type=Path, default=TAXONOMY_PATH)
    parser.add_argument("--master", type=Path, default=MASTER_PATH)
    parser.add_argument("--similarity", type=Path, default=SIMILARITY_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    payload = build_candidates(
        read_json(args.taxonomy),
        read_json(args.master),
        read_json(args.similarity),
    )
    write_json(args.output, payload)
    print(f"Semiconductor candidates saved: {payload['counts']} -> {args.output} ({args.output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
