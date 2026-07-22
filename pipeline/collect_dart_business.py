from __future__ import annotations

import argparse
import gzip
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from dart_client import DartClient, DartError, extract_business_section, report_period


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = ROOT / "data" / "generated" / "kr_stocks.json"
CORP_OUTPUT = ROOT / "data" / "generated" / "dart_corp_codes.json"
BUSINESS_OUTPUT = ROOT / "data" / "generated" / "dart_business.json.gz"
LOW_CONFIDENCE_TEXT_CHARS = 3_000
DEFAULT_MAX_CACHE_AGE_DAYS = 120


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as file:
            return json.load(file)
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    if path.suffix == ".gz":
        with gzip.open(temporary, "wt", encoding="utf-8", compresslevel=6) as file:
            json.dump(payload, file, ensure_ascii=False, separators=(",", ":"))
    else:
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
    temporary.replace(path)


def text_confidence(text: str) -> str:
    return "low" if len(text) < LOW_CONFIDENCE_TEXT_CHARS else "standard"


def cache_is_fresh(
    company: dict[str, Any],
    *,
    today: date | None = None,
    max_age_days: int = DEFAULT_MAX_CACHE_AGE_DAYS,
) -> bool:
    if company.get("status") != "ok" or max_age_days <= 0:
        return False
    try:
        updated_at = datetime.strptime(company["updatedAt"], "%Y-%m-%d").date()
    except (KeyError, TypeError, ValueError):
        return False
    age_days = ((today or date.today()) - updated_at).days
    return 0 <= age_days <= max_age_days


def merge_company_result(
    previous: dict[str, Any] | None,
    incoming: dict[str, Any],
) -> dict[str, Any]:
    if previous and previous.get("status") == "ok" and incoming.get("status") != "ok":
        preserved = dict(previous)
        preserved["lastAttempt"] = {
            "status": incoming.get("status", "unknown"),
            "attemptedAt": incoming.get("updatedAt", date.today().isoformat()),
            **({"error": incoming["error"]} if incoming.get("error") else {}),
        }
        return preserved
    if incoming.get("status") == "ok":
        incoming = dict(incoming)
        incoming.pop("lastAttempt", None)
    return incoming


def build_corp_map(client: DartClient) -> dict[str, Any]:
    master = read_json(MASTER_PATH, {})
    listed_symbols = {stock["symbol"] for stock in master.get("stocks", [])}
    corps = client.corp_codes()
    mapped = {
        corp.stock_code: {
            "corpCode": corp.corp_code,
            "corpName": corp.corp_name,
            "corpEngName": corp.corp_eng_name,
            "modifyDate": corp.modify_date,
        }
        for corp in corps
        if corp.stock_code in listed_symbols
    }
    payload = {
        "schemaVersion": 1,
        "asOf": date.today().isoformat(),
        "source": "OpenDART corpCode.xml",
        "counts": {
            "listedStocks": len(listed_symbols),
            "mapped": len(mapped),
            "unmapped": len(listed_symbols - set(mapped)),
        },
        "companies": mapped,
    }
    write_json(CORP_OUTPUT, payload)
    return payload


def collect_business(
    client: DartClient,
    corp_map: dict[str, Any],
    symbols: list[str],
    output: Path,
    *,
    refresh: bool = False,
    max_cache_age_days: int = DEFAULT_MAX_CACHE_AGE_DAYS,
    checkpoint_every: int = 100,
    workers: int = 3,
) -> dict[str, Any]:
    previous = read_json(output, {"companies": {}})
    companies = dict(previous.get("companies", {}))

    def payload() -> dict[str, Any]:
        statuses: dict[str, int] = {}
        for company in companies.values():
            status = company.get("status", "unknown")
            statuses[status] = statuses.get(status, 0) + 1
        refresh_warnings = sum(
            bool(company.get("lastAttempt")) for company in companies.values()
        )
        return {
            "schemaVersion": 2,
            "asOf": date.today().isoformat(),
            "source": "OpenDART latest valid annual business reports",
            "selectionPolicy": {
                "reportType": "annual",
                "prefer": "content-corrected then original",
                "exclude": ["quarterly", "half-year", "attachment-corrected", "attachment-added"],
            },
            "counts": {
                "total": len(companies),
                **statuses,
                "refreshWarnings": refresh_warnings,
            },
            "companies": companies,
        }

    def collect_one(worker_client: DartClient, symbol: str) -> dict[str, Any]:
        corp = corp_map["companies"].get(symbol)
        if not corp:
            return {"status": "unmapped", "updatedAt": date.today().isoformat()}
        try:
            reports = worker_client.annual_reports(corp["corpCode"])
            if not reports:
                return {
                    "corpCode": corp["corpCode"],
                    "corpName": corp["corpName"],
                    "status": "no_annual_report",
                    "updatedAt": date.today().isoformat(),
                }
            attempts = []
            for fallback_count, report in enumerate(reports[:6]):
                receipt = str(report["rcept_no"])
                try:
                    text = extract_business_section(worker_client.document_files(receipt))
                except (DartError, OSError, ValueError) as error:
                    attempts.append(
                        {
                            "receiptNo": receipt,
                            "reportName": report.get("report_nm", ""),
                            "result": str(error)[:180],
                        }
                    )
                    continue
                if not text:
                    attempts.append(
                        {
                            "receiptNo": receipt,
                            "reportName": report.get("report_nm", ""),
                            "result": "business_section_not_found",
                        }
                    )
                    continue

                period_year, period_month = report_period(report)
                return {
                    "corpCode": corp["corpCode"],
                    "corpName": corp["corpName"],
                    "reportName": report.get("report_nm", ""),
                    "reportType": "annual",
                    "reportPeriod": f"{period_year:04d}.{period_month:02d}",
                    "receiptNo": receipt,
                    "receiptDate": report.get("rcept_dt", ""),
                    "sourceUrl": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={receipt}",
                    "fallbackCount": fallback_count,
                    "text": text,
                    "textLength": len(text),
                    "textConfidence": text_confidence(text),
                    "status": "ok",
                    "updatedAt": date.today().isoformat(),
                }
            return {
                "corpCode": corp["corpCode"],
                "corpName": corp["corpName"],
                "status": "annual_report_unusable",
                "attempts": attempts,
                "updatedAt": date.today().isoformat(),
            }
        except (DartError, OSError, ValueError) as error:
            return {
                "corpCode": corp["corpCode"],
                "corpName": corp["corpName"],
                "status": "error",
                "error": str(error)[:300],
                "updatedAt": date.today().isoformat(),
            }

    pending = [
        symbol
        for symbol in symbols
        if refresh
        or not cache_is_fresh(
            companies.get(symbol, {}),
            max_age_days=max_cache_age_days,
        )
    ]
    cached = len(symbols) - len(pending)
    if cached:
        print(f"Skipping {cached} successful cached companies")

    local = threading.local()

    def collect_with_thread_client(symbol: str) -> tuple[str, dict[str, Any]]:
        if not hasattr(local, "client"):
            local.client = DartClient(client.api_key, delay=client.delay)
        return symbol, collect_one(local.client, symbol)

    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = [executor.submit(collect_with_thread_client, symbol) for symbol in pending]
        for index, future in enumerate(as_completed(futures), start=1):
            symbol, incoming = future.result()
            previous_company = companies.get(symbol)
            company = merge_company_result(previous_company, incoming)
            companies[symbol] = company
            preserved = previous_company and company.get("status") == "ok" and incoming.get("status") != "ok"
            suffix = " (preserved last good snapshot)" if preserved else ""
            print(f"[{index}/{len(pending)}] {symbol}: {incoming['status']}{suffix}")
            if index % checkpoint_every == 0:
                write_json(output, payload())

    result = payload()
    write_json(output, result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect DART corporation mapping and annual business sections")
    parser.add_argument("--corp-codes-only", action="store_true")
    parser.add_argument("--symbols", help="Comma-separated KRX symbols")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--output", type=Path, default=BUSINESS_OUTPUT)
    parser.add_argument("--refresh", action="store_true", help="Re-download successful records")
    parser.add_argument(
        "--max-cache-age-days",
        type=int,
        default=DEFAULT_MAX_CACHE_AGE_DAYS,
        help="Re-check successful records older than this many days (0 always refreshes)",
    )
    parser.add_argument("--checkpoint-every", type=int, default=100)
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()

    load_dotenv(ROOT / ".env.local")
    client = DartClient(os.getenv("DART_API_KEY", ""))
    corp_map = build_corp_map(client)
    print(f"DART corp mapping: {corp_map['counts']}")
    if args.corp_codes_only:
        return

    master = read_json(MASTER_PATH, {})
    available = [stock["symbol"] for stock in master.get("stocks", [])]
    if args.symbols:
        requested = [symbol.strip().upper() for symbol in args.symbols.split(",") if symbol.strip()]
        symbols = [symbol for symbol in requested if symbol in set(available)]
    else:
        symbols = available
    if args.limit:
        symbols = symbols[: args.limit]
    collect_business(
        client,
        corp_map,
        symbols,
        args.output,
        refresh=args.refresh,
        max_cache_age_days=max(0, args.max_cache_age_days),
        checkpoint_every=max(1, args.checkpoint_every),
        workers=max(1, args.workers),
    )


if __name__ == "__main__":
    main()
