from __future__ import annotations

import argparse
import gzip
import json
import re
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = ROOT / "data" / "generated" / "kr_stocks.json"
BUSINESS_PATH = ROOT / "data" / "generated" / "dart_business.json.gz"
DEFAULT_OUTPUT = ROOT / "data" / "generated" / "kr_semiconductor_universe.json"


# A company is not added merely because its report mentions semiconductors.
# The rules look for a listed product/industry signal or a repeated, specific
# business-role signal in the annual report. The output keeps those signals so
# every inclusion is auditable without an LLM.
CATEGORY_RULES: tuple[tuple[str, str, re.Pattern[str]], ...] = (
    ("memory", "메모리", re.compile(r"메모리\s*반도체|\bDRAM\b|\bNAND\b|\bHBM\b|낸드", re.I)),
    ("foundry", "파운드리", re.compile(r"파운드리|\bfoundry\b|웨이퍼\s*(생산|제조)|wafer\s*(production|manufactur)", re.I)),
    ("design", "팹리스·설계", re.compile(r"팹리스|\bfabless\b|반도체\s*(설계|design)|\bASIC\b|\bSoC\b|반도체\s*\bIP\b", re.I)),
    ("power-analog", "전력·아날로그", re.compile(r"전력\s*반도체|아날로그\s*반도체|\bMOSFET\b|\bIGBT\b|\bSiC\b|\bGaN\b", re.I)),
    ("packaging-test", "후공정·테스트", re.compile(r"반도체\s*(후공정|패키징|검사|테스트)|\btest\s*(handler|socket)\b|\bprobe\b|프로브|소켓", re.I)),
    ("equipment", "장비", re.compile(r"반도체.{0,16}(장비|공정|제조용\s*기계)|\b(ALD|CVD|PVD|EUV)\b|증착|식각|노광|어닐링", re.I)),
    ("materials", "소재", re.compile(r"반도체.{0,16}(소재|재료|화학)|포토레지스트|식각액|\bCMP\b|슬러리|웨이퍼", re.I)),
)
SEMICONDUCTOR = re.compile(r"반도체|semiconductor", re.I)


def read_json(path: Path) -> dict[str, Any]:
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as file:
            return json.load(file)
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(path)


def matched_categories(text: str) -> list[dict[str, str]]:
    return [
        {"id": category_id, "label": label}
        for category_id, label, pattern in CATEGORY_RULES
        if pattern.search(text)
    ]


def focused_business_text(report_text: str) -> str:
    """Keep only report sentences that attribute a semiconductor activity to the company."""
    segments = re.split(r"(?<=[.!?])|[\n\r]+", report_text)
    subject = re.compile(r"당사|연결회사|회사는|회사의|사업부|주력\s*(제품|사업)")
    activity = re.compile(r"사업|제품|생산|제조|개발|판매|공급|납품|장비|소재")
    return " ".join(
        segment.strip()
        for segment in segments
        if SEMICONDUCTOR.search(segment) and subject.search(segment) and activity.search(segment)
    )


def source_signals(stock: dict[str, Any]) -> list[str]:
    signals: list[str] = []
    if SEMICONDUCTOR.search(stock.get("industry", "")):
        signals.append("KRX 업종")
    if SEMICONDUCTOR.search(stock.get("products", "")):
        signals.append("KRX 주요 제품")
    return signals


def classify_stock(stock: dict[str, Any], company: dict[str, Any] | None) -> dict[str, Any] | None:
    if stock.get("securityType") != "common":
        return None

    report_text = company.get("text", "") if company and company.get("status") == "ok" else ""
    source_text = " ".join((stock.get("industry", ""), stock.get("products", "")))
    focused_text = focused_business_text(report_text)
    categories = matched_categories(f"{source_text} {focused_text}")
    signals = source_signals(stock)
    report_mentions = len(SEMICONDUCTOR.findall(report_text))
    report_categories = matched_categories(focused_text)
    has_specific_role = bool(report_categories)

    # KRX product/industry data is strong enough on its own. If it is absent,
    # require both repeated annual-report evidence and a specific role pattern.
    if not signals and not (report_mentions >= 2 and has_specific_role):
        return None

    if not categories:
        categories = [{"id": "device-other", "label": "반도체 제품"}]

    confidence = "high" if len(signals) == 2 and has_specific_role else "standard"
    if not signals:
        confidence = "report-only"

    return {
        "symbol": stock["symbol"],
        "name": stock["name"],
        "market": stock["market"],
        "industry": stock.get("industry", ""),
        "products": stock.get("products", ""),
        "marketCap": stock.get("marketCap", 0),
        "categories": categories,
        "evidence": {
            "signals": signals,
            "annualReportMentions": report_mentions,
            "focusedBusinessMentions": len(SEMICONDUCTOR.findall(focused_text)),
            "reportPeriod": company.get("reportPeriod") if company else None,
            "textConfidence": company.get("textConfidence") if company else None,
        },
        "confidence": confidence,
    }


def build_universe(master: dict[str, Any], business: dict[str, Any]) -> dict[str, Any]:
    companies = business.get("companies", {})
    candidates = [
        candidate
        for stock in master["stocks"]
        if (candidate := classify_stock(stock, companies.get(stock["symbol"]))) is not None
    ]
    candidates.sort(key=lambda item: (-item["marketCap"], item["symbol"]))
    category_counts = Counter(
        category["id"]
        for candidate in candidates
        for category in candidate["categories"]
    )
    confidence_counts = Counter(candidate["confidence"] for candidate in candidates)
    return {
        "schemaVersion": 1,
        "asOf": date.today().isoformat(),
        "source": "KRX industry/products + OpenDART annual business reports",
        "method": {
            "llmUsed": False,
            "selection": "KRX semiconductor signal or repeated DART evidence with a specific business role",
            "categories": [
                {"id": category_id, "label": label}
                for category_id, label, _ in CATEGORY_RULES
            ],
        },
        "counts": {
            "candidates": len(candidates),
            "categories": dict(sorted(category_counts.items())),
            "confidence": dict(sorted(confidence_counts.items())),
        },
        "companies": candidates,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a deterministic Korean listed semiconductor candidate universe")
    parser.add_argument("--master", type=Path, default=MASTER_PATH)
    parser.add_argument("--business", type=Path, default=BUSINESS_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    payload = build_universe(read_json(args.master), read_json(args.business))
    write_json(args.output, payload)
    print(f"Semiconductor universe saved: {payload['counts']} -> {args.output} ({args.output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
