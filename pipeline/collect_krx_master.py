from __future__ import annotations

import argparse
import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

import FinanceDataReader as fdr
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "data" / "generated" / "kr_stocks.json"
SUPPORTED_MARKETS = {"KOSPI", "KOSDAQ", "KONEX"}
COMMON_NAMES_ENDING_WITH_U = {"성우", "에코글로우", "이오플로우"}


def text(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def iso_date(value: Any) -> str | None:
    if value is None or pd.isna(value) or text(value) == "":
        return None
    if isinstance(value, (date, datetime, pd.Timestamp)):
        return value.strftime("%Y-%m-%d")
    parsed = pd.to_datetime(value, errors="coerce")
    return None if pd.isna(parsed) else parsed.strftime("%Y-%m-%d")


def security_type(name: str) -> str:
    compact = re.sub(r"\s+", "", name)
    if compact in COMMON_NAMES_ENDING_WITH_U:
        return "common"
    if "스팩" in compact or compact.endswith("SPAC"):
        return "spac"
    if "리츠" in compact or compact.endswith("REIT"):
        return "reit"
    if re.search(r"(우|우B|우C|우선주)$", compact):
        return "preferred"
    return "common"


def first_existing(row: pd.Series, *columns: str) -> Any:
    for column in columns:
        if column in row.index:
            value = row[column]
            if not pd.isna(value) and text(value):
                return value
    return None


def normalize(frame: pd.DataFrame) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for _, row in frame.iterrows():
        symbol = text(first_existing(row, "Code", "Symbol", "Ticker")).zfill(6)
        name = text(first_existing(row, "Name", "CodeName"))
        market = text(first_existing(row, "Market", "MarketName")).upper()

        if not symbol or not name or market not in SUPPORTED_MARKETS:
            continue

        records.append(
            {
                "symbol": symbol,
                "name": name,
                "market": market,
                "sector": text(first_existing(row, "Industry")),
                "industry": text(first_existing(row, "Industry")),
                "products": text(first_existing(row, "Products")),
                "marketSegment": text(first_existing(row, "MarketSegment")),
                "isin": text(first_existing(row, "ISU_CD", "ISIN")),
                "listingDate": iso_date(first_existing(row, "ListingDate")),
                "securityType": security_type(name),
                "marketCap": int(first_existing(row, "Marcap") or 0),
                "sharesOutstanding": int(first_existing(row, "Stocks") or 0),
                "homepage": text(first_existing(row, "HomePage")),
                "region": text(first_existing(row, "Region")),
            }
        )

    unique = {record["symbol"]: record for record in records}
    return sorted(unique.values(), key=lambda item: (item["market"], item["name"], item["symbol"]))


def validate(records: list[dict[str, Any]]) -> None:
    if len(records) < 2_000:
        raise RuntimeError(f"KRX stock master is unexpectedly small: {len(records)}")
    symbols = [record["symbol"] for record in records]
    if len(symbols) != len(set(symbols)):
        raise RuntimeError("Duplicate symbols remain after normalization")
    if "005930" not in symbols:
        raise RuntimeError("Samsung Electronics (005930) is missing")
    if any(not re.fullmatch(r"[0-9A-Z]{6}", symbol) for symbol in symbols):
        raise RuntimeError("Invalid Korean stock symbol detected")
    if sum(bool(record["industry"]) for record in records) < 2_500:
        raise RuntimeError("KRX descriptive industry coverage is unexpectedly low")


def write_snapshot(records: list[dict[str, Any]], output: Path) -> None:
    today = date.today().isoformat()
    counts = {
        market: sum(record["market"] == market for record in records)
        for market in sorted(SUPPORTED_MARKETS)
    }
    counts["total"] = len(records)
    payload = {
        "schemaVersion": 2,
        "asOf": today,
        "source": "FinanceDataReader.StockListing(KRX + KRX-DESC)",
        "counts": counts,
        "stocks": records,
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    temporary.replace(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate the versioned Korean stock master snapshot")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    frame = fdr.StockListing("KRX")
    descriptions = fdr.StockListing("KRX-DESC").rename(columns={"Sector": "MarketSegment"})
    descriptive_columns = [
        column
        for column in ("Code", "MarketSegment", "Industry", "Products", "ListingDate", "HomePage", "Region")
        if column in descriptions.columns
    ]
    frame = frame.merge(
        descriptions[descriptive_columns].drop_duplicates(subset="Code"),
        how="left",
        on="Code",
    )
    records = normalize(frame)
    validate(records)
    write_snapshot(records, args.output)
    print(f"KRX master saved: {len(records)} stocks -> {args.output}")


if __name__ == "__main__":
    main()
