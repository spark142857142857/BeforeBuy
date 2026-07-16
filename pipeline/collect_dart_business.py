from __future__ import annotations

import argparse
import gzip
import json
import os
from datetime import date
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from dart_client import DartClient, DartError, extract_business_section


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = ROOT / "data" / "generated" / "kr_stocks.json"
CORP_OUTPUT = ROOT / "data" / "generated" / "dart_corp_codes.json"
BUSINESS_OUTPUT = ROOT / "data" / "generated" / "dart_business.json.gz"


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
    checkpoint_every: int = 100,
) -> dict[str, Any]:
    previous = read_json(output, {"companies": {}})
    companies = dict(previous.get("companies", {}))

    def payload() -> dict[str, Any]:
        statuses: dict[str, int] = {}
        for company in companies.values():
            status = company.get("status", "unknown")
            statuses[status] = statuses.get(status, 0) + 1
        return {
            "schemaVersion": 1,
            "asOf": date.today().isoformat(),
            "source": "OpenDART regular report original documents",
            "counts": {"total": len(companies), **statuses},
            "companies": companies,
        }

    for index, symbol in enumerate(symbols, start=1):
        if not refresh and companies.get(symbol, {}).get("status") == "ok":
            print(f"[{index}/{len(symbols)}] {symbol}: cached")
            continue

        corp = corp_map["companies"].get(symbol)
        if not corp:
            companies[symbol] = {"status": "unmapped", "updatedAt": date.today().isoformat()}
        else:
            try:
                report = client.latest_regular_report(corp["corpCode"])
                if not report:
                    companies[symbol] = {
                        "corpCode": corp["corpCode"],
                        "corpName": corp["corpName"],
                        "status": "no_regular_report",
                        "updatedAt": date.today().isoformat(),
                    }
                else:
                    receipt = str(report["rcept_no"])
                    text = extract_business_section(client.document_files(receipt))
                    companies[symbol] = {
                        "corpCode": corp["corpCode"],
                        "corpName": corp["corpName"],
                        "reportName": report.get("report_nm", ""),
                        "receiptNo": receipt,
                        "receiptDate": report.get("rcept_dt", ""),
                        "sourceUrl": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={receipt}",
                        "text": text,
                        "status": "ok" if text else "section_not_found",
                        "updatedAt": date.today().isoformat(),
                    }
            except (DartError, OSError, ValueError) as error:
                companies[symbol] = {
                    "corpCode": corp["corpCode"],
                    "corpName": corp["corpName"],
                    "status": "error",
                    "error": str(error)[:300],
                    "updatedAt": date.today().isoformat(),
                }

        print(f"[{index}/{len(symbols)}] {symbol}: {companies[symbol]['status']}")
        if index % checkpoint_every == 0:
            write_json(output, payload())

    result = payload()
    write_json(output, result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect DART corporation mapping and business sections")
    parser.add_argument("--corp-codes-only", action="store_true")
    parser.add_argument("--symbols", help="Comma-separated KRX symbols")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--output", type=Path, default=BUSINESS_OUTPUT)
    parser.add_argument("--refresh", action="store_true", help="Re-download successful records")
    parser.add_argument("--checkpoint-every", type=int, default=100)
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
        checkpoint_every=max(1, args.checkpoint_every),
    )


if __name__ == "__main__":
    main()
