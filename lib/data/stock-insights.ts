import profilesSnapshot from "@/data/generated/business_profiles.json";
import similaritySnapshot from "@/data/generated/kr_similarity.json";
import {
  getKoreanStockBySymbol,
  getKoreanStockResultBySymbol,
  type KoreanStockMasterRecord,
} from "./krx-master";

type BusinessProfile = {
  reportPeriod: string;
  receiptDate: string;
  sourceUrl: string;
  textConfidence: "standard" | "low";
  textLength: number;
  fallbackCount: number;
  excerpt: string;
  refreshWarning?: {
    status: string;
    attemptedAt: string;
  };
};

type UnavailableProfile = {
  category: "spac" | "fund" | "limited" | "collection_error";
  reason: string;
};

type BusinessProfilesSnapshot = {
  asOf: string;
  profiles: Record<string, BusinessProfile>;
  aliases: Record<string, string>;
  unavailable: Record<string, UnavailableProfile>;
};

type SimilarityCandidate = {
  symbol: string;
  score: number;
  textSimilarity: number;
  exposureSimilarity: number;
  productSimilarity: number;
  sharedExposures: string[];
  sharedTerms: string[];
  confidence?: "low";
};

type SimilaritySnapshot = {
  asOf: string;
  method: {
    name: string;
    reportType: string;
    llmUsed: boolean;
  };
  similar: Record<string, SimilarityCandidate[]>;
};

const profiles = profilesSnapshot as BusinessProfilesSnapshot;
const similarity = similaritySnapshot as SimilaritySnapshot;

export type DomesticPeer = SimilarityCandidate & {
  stock: KoreanStockMasterRecord;
  slug: string;
  reason: string;
  scaleSimilarity: number;
};

function scaleSimilarity(left: KoreanStockMasterRecord, right: KoreanStockMasterRecord) {
  if (left.marketCap <= 0 || right.marketCap <= 0) return 0;
  const ratio = Math.min(left.marketCap, right.marketCap) / Math.max(left.marketCap, right.marketCap);
  return ratio ** 0.25;
}

function reasonFor(candidate: SimilarityCandidate) {
  const reasons = [];
  if (candidate.sharedExposures.length) {
    reasons.push(`공통 사업 노출 ${candidate.sharedExposures.join(", ")}`);
  }
  if (candidate.sharedTerms.length) {
    reasons.push(`공통 제품 키워드 ${candidate.sharedTerms.join(", ")}`);
  }
  if (!reasons.length) reasons.push("연간 사업보고서 본문 유사 · 정형 사업 노출 근거 부족");
  return reasons.join(" · ");
}

export function getDomesticStockInsight(symbol: string, limit = 5) {
  const requestedSymbol = symbol.toUpperCase();
  const businessSymbol = profiles.aliases[requestedSymbol] ?? requestedSymbol;
  const selected = getKoreanStockBySymbol(businessSymbol);
  const profile = profiles.profiles[businessSymbol];
  const unavailable =
    profiles.unavailable[requestedSymbol] ?? profiles.unavailable[businessSymbol];
  const peers = (similarity.similar[businessSymbol] ?? [])
    .slice(0, limit)
    .map((candidate) => {
      const stock = getKoreanStockBySymbol(candidate.symbol);
      const result = getKoreanStockResultBySymbol(candidate.symbol);
      if (!stock || !result || !selected) return undefined;
      return {
        ...candidate,
        stock,
        slug: result.slug,
        reason: reasonFor(candidate),
        scaleSimilarity: scaleSimilarity(selected, stock),
      };
    })
    .filter((item): item is DomesticPeer => Boolean(item));

  return {
    requestedSymbol,
    businessSymbol,
    isAlias: requestedSymbol !== businessSymbol,
    profile,
    unavailable,
    peers,
    profileAsOf: profiles.asOf,
    similarityAsOf: similarity.asOf,
  };
}
