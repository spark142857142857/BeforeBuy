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
};

type UnavailableProfile = {
  category: "spac" | "fund" | "limited";
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
  industrySimilarity: number;
  productSimilarity: number;
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
};

function reasonFor(candidate: SimilarityCandidate, selected: KoreanStockMasterRecord) {
  const reasons = [];
  if (candidate.industrySimilarity === 1) {
    reasons.push(`동일 KRX 업종(${selected.industry})`);
  } else if (candidate.industrySimilarity > 0) {
    reasons.push("업종 설명 일부 공통");
  }
  if (candidate.sharedTerms.length) {
    reasons.push(`공통 키워드 ${candidate.sharedTerms.join(", ")}`);
  }
  if (!reasons.length) reasons.push("연간 사업보고서의 사업 내용이 유사");
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
        reason: reasonFor(candidate, selected),
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
