import globalLinksSnapshot from "@/data/generated/global_links.json";
import holdingsSnapshot from "@/data/curated/etf_holdings.json";
import { getAlternatives, getAsset, getAssetByTicker, type Asset } from "./catalog";

type GlobalRuleMatch = {
  id: string;
  theme: string;
  label: string;
  score: number;
  matchedTerms: string[];
  reason: string;
  peerSlugs: string[];
  etfSlugs: string[];
};

type GlobalLinksSnapshot = {
  asOf: string;
  method: {
    name: string;
    inputs: string[];
    llmUsed: boolean;
    maximumThemesPerStock: number;
  };
  counts: {
    stocks: number;
    mappedStocks: number;
    themeMatches: number;
    byTheme: Record<string, number>;
  };
  links: Record<string, GlobalRuleMatch[]>;
};

export type EtfHolding = {
  ticker: string;
  name: string;
  weight?: number;
};

export type EtfHoldings = {
  asOf: string;
  totalHoldings?: number;
  sourceName: string;
  sourceUrl: string;
  holdings: EtfHolding[];
};

type HoldingsSnapshot = {
  funds: Record<string, EtfHoldings>;
};

export type LinkedAsset = {
  asset: Asset;
  reason: string;
  themeLabel: string;
};

const globalLinks = globalLinksSnapshot as GlobalLinksSnapshot;
const holdings = holdingsSnapshot as HoldingsSnapshot;

function uniqueAssets(matches: GlobalRuleMatch[], key: "peerSlugs" | "etfSlugs") {
  const seen = new Set<string>();
  const linked: LinkedAsset[] = [];
  for (const match of matches) {
    for (const slug of match[key]) {
      if (seen.has(slug)) continue;
      const asset = getAsset(slug);
      if (!asset) continue;
      seen.add(slug);
      linked.push({ asset, reason: match.reason, themeLabel: match.label });
    }
  }
  return linked;
}

export function getGlobalStockInsight(symbol: string) {
  const matches = globalLinks.links[symbol.toUpperCase()] ?? [];
  return {
    matches,
    peers: uniqueAssets(matches, "peerSlugs").filter((item) => item.asset.type === "stock"),
    etfs: uniqueAssets(matches, "etfSlugs").filter((item) => item.asset.type === "etf"),
    asOf: globalLinks.asOf,
    method: globalLinks.method,
  };
}

export function getRelatedEtfs(symbol: string) {
  const normalizedSymbol = symbol.toUpperCase();
  const selected = getAssetByTicker(normalizedSymbol, "KR");
  const automatic = getGlobalStockInsight(normalizedSymbol).etfs;
  const automaticBySlug = new Map(automatic.map((item) => [item.asset.slug, item]));
  const curated = selected
    ? getAlternatives(selected.slug)
        .filter((item) => item.asset.type === "etf")
        .map((item) => ({
          asset: item.asset,
          reason: item.reason,
          themeLabel: automaticBySlug.get(item.asset.slug)?.themeLabel ?? "검수된 비교 대안",
        }))
    : [];
  const seen = new Set<string>();

  return [...curated, ...automatic].filter(({ asset }) => {
    if (seen.has(asset.slug)) return false;
    seen.add(asset.slug);
    return true;
  });
}

export function getEtfHoldings(slug: string) {
  return holdings.funds[slug];
}

export const globalInsightMeta = {
  asOf: globalLinks.asOf,
  mappedStocks: globalLinks.counts.mappedStocks,
  themeMatches: globalLinks.counts.themeMatches,
  llmUsed: globalLinks.method.llmUsed,
};
