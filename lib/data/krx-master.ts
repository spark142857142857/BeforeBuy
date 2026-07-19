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
const recordsBySymbol = new Map(records.map((record) => [record.symbol, record]));
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

const searchIndex = records.map((record) => ({
  record,
  symbol: record.symbol.toLowerCase(),
  name: normalized(record.name),
  sector: normalized(record.sector),
  industry: normalized(record.industry),
  products: normalized(record.products),
}));

function rank(item: (typeof searchIndex)[number], query: string) {
  if (item.symbol === query || item.name === query) return 0;
  if (item.symbol.startsWith(query) || item.name.startsWith(query)) return 1;
  if (item.name.includes(query)) return 2;
  if (
    item.sector.includes(query) ||
    item.industry.includes(query) ||
    item.products.includes(query)
  ) return 3;
  return 9;
}

export function searchKoreanStocks(query: string, limit = 10) {
  const value = normalized(query);
  if (!value) return getFeaturedStockResults().slice(0, limit);

  return searchIndex
    .map((item) => ({ record: item.record, score: rank(item, value) }))
    .filter((item) => item.score < 9)
    .sort((a, b) => a.score - b.score || b.record.marketCap - a.record.marketCap || a.record.name.localeCompare(b.record.name, "ko"))
    .slice(0, limit)
    .map((item) => resultFor(item.record));
}

export function getFeaturedStockResults() {
  const featured = ["005930", "000660", "005380", "035420", "105560", "207940"];
  return featured
    .map((symbol) => recordsBySymbol.get(symbol))
    .filter((record): record is KoreanStockMasterRecord => Boolean(record))
    .map(resultFor);
}

export function getKoreanStockMaster(slug: string) {
  const match = /^kr-([0-9a-z]{6})$/i.exec(slug);
  if (!match) return undefined;
  const symbol = match[1].toUpperCase();
  return recordsBySymbol.get(symbol);
}

export function getKoreanStockBySymbol(symbol: string) {
  return recordsBySymbol.get(symbol.toUpperCase());
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
