import snapshot from "@/data/generated/kr_stocks.json";
import { assets } from "./catalog";

export type KoreanStockMasterRecord = {
  symbol: string;
  name: string;
  market: "KOSPI" | "KOSDAQ" | "KONEX";
  sector: string;
  industry: string;
  products: string;
  marketSegment: string;
  isin: string;
  listingDate: string | null;
  securityType: "common" | "preferred" | "reit" | "spac";
  marketCap: number;
  sharesOutstanding: number;
  homepage: string;
  region: string;
};

export type StockSearchResult = Pick<
  KoreanStockMasterRecord,
  "symbol" | "name" | "market" | "sector" | "industry" | "securityType"
> & {
  slug: string;
  enriched: boolean;
};

const records = snapshot.stocks as KoreanStockMasterRecord[];
const curatedSlugByTicker = new Map(
  assets
    .filter((item) => item.market === "KR" && item.type === "stock")
    .map((item) => [item.ticker, item.slug]),
);

function resultFor(record: KoreanStockMasterRecord): StockSearchResult {
  const curatedSlug = curatedSlugByTicker.get(record.symbol);
  return {
    symbol: record.symbol,
    name: record.name,
    market: record.market,
    sector: record.sector,
    industry: record.industry,
    securityType: record.securityType,
    slug: curatedSlug ?? `kr-${record.symbol.toLowerCase()}`,
    enriched: Boolean(curatedSlug),
  };
}

function normalized(value: string) {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

function rank(record: KoreanStockMasterRecord, query: string) {
  const symbol = record.symbol.toLowerCase();
  const name = normalized(record.name);
  if (symbol === query || name === query) return 0;
  if (symbol.startsWith(query) || name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  if (
    normalized(record.sector).includes(query) ||
    normalized(record.industry).includes(query) ||
    normalized(record.products).includes(query)
  ) return 3;
  return 9;
}

export function searchKoreanStocks(query: string, limit = 10) {
  const value = normalized(query);
  if (!value) return getFeaturedStockResults().slice(0, limit);

  return records
    .map((record) => ({ record, score: rank(record, value) }))
    .filter((item) => item.score < 9)
    .sort((a, b) => a.score - b.score || b.record.marketCap - a.record.marketCap || a.record.name.localeCompare(b.record.name, "ko"))
    .slice(0, limit)
    .map((item) => resultFor(item.record));
}

export function getFeaturedStockResults() {
  const featured = ["005930", "000660", "005380", "035420", "105560", "207940"];
  return featured
    .map((symbol) => records.find((record) => record.symbol === symbol))
    .filter((record): record is KoreanStockMasterRecord => Boolean(record))
    .map(resultFor);
}

export function getKoreanStockMaster(slug: string) {
  const match = /^kr-([0-9a-z]{6})$/i.exec(slug);
  if (!match) return undefined;
  const symbol = match[1].toUpperCase();
  return records.find((record) => record.symbol === symbol);
}

export function getKoreanStockBySymbol(symbol: string) {
  return records.find((record) => record.symbol === symbol.toUpperCase());
}

export function getKoreanStockResultBySymbol(symbol: string) {
  const record = getKoreanStockBySymbol(symbol);
  return record ? resultFor(record) : undefined;
}

export function getKoreanStockCount() {
  return snapshot.counts.total;
}

export const krxSnapshotMeta = {
  asOf: snapshot.asOf,
  source: snapshot.source,
  counts: snapshot.counts,
};
