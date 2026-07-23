import directSnapshot from "@/data/generated/kr_direct_candidates.json";
import taxonomySnapshot from "@/data/generated/kr_company_taxonomy.json";
import { getKoreanStockResultBySymbol, type StockSearchResult } from "./krx-master";

type Role = {
  id: string;
  label: string;
  comparisonSectorId: string;
  source: "krx" | "dart" | "both" | "derived";
};

type DirectCandidate = {
  symbol: string;
  name: string;
  role: Pick<Role, "id" | "label">;
  reason: string;
  similarityScore: number | null;
  sharedExposures: string[];
};

type DirectLink = {
  status: "available" | "no-direct-peer" | "role-under-review" | "no-qualified-role";
  primaryRole?: Role;
  directCandidates: DirectCandidate[];
};

type DirectSnapshot = {
  asOf: string;
  links: Record<string, DirectLink>;
};

type TaxonomyCompany = {
  symbol: string;
  classification: {
    primaryComparisonSector: { id: string; label: string } | null;
  };
};

type TaxonomySnapshot = {
  companies: TaxonomyCompany[];
};

const direct = directSnapshot as DirectSnapshot;
const taxonomy = taxonomySnapshot as TaxonomySnapshot;
const taxonomyBySymbol = new Map(taxonomy.companies.map((company) => [company.symbol, company]));

export type DirectPeerStatus = DirectLink["status"] | "not-covered";

export type DirectPeerInsight = {
  status: DirectPeerStatus;
  role?: Role;
  sector?: { id: string; label: string };
  candidates: Array<DirectCandidate & { stock: StockSearchResult; slug: string }>;
  asOf: string;
};

export function directPeerStatusMessage(insight: DirectPeerInsight) {
  if (insight.status === "role-under-review") {
    return `${insight.role?.label ?? "현재 사업 역할"}은 세부 비교 규칙을 검토 중입니다.`;
  }
  if (insight.status === "no-direct-peer") {
    return `같은 주력 역할(${insight.role?.label ?? "확인된 역할"})의 국내 상장 후보를 더 찾지 못했습니다.`;
  }
  if (insight.status === "no-qualified-role") {
    return "직접 비교에 쓸 만큼 구체적인 사업 역할을 아직 확인하지 못했습니다.";
  }
  return "이 종목은 현재 직접 비교 스냅샷 범위 밖입니다.";
}

export function getDirectPeerInsight(symbol: string): DirectPeerInsight {
  const requestedSymbol = symbol.toUpperCase();
  const link = direct.links[requestedSymbol];
  const classification = taxonomyBySymbol.get(requestedSymbol)?.classification;
  if (!link) {
    return {
      status: "not-covered",
      sector: classification?.primaryComparisonSector ?? undefined,
      candidates: [],
      asOf: direct.asOf,
    };
  }

  return {
    status: link.status,
    role: link.primaryRole,
    sector: classification?.primaryComparisonSector ?? undefined,
    candidates: link.directCandidates
      .map((candidate) => {
        const result = getKoreanStockResultBySymbol(candidate.symbol);
        if (!result) return undefined;
        return { ...candidate, stock: result, slug: result.slug };
      })
      .filter((candidate): candidate is DirectPeerInsight["candidates"][number] => Boolean(candidate)),
    asOf: direct.asOf,
  };
}
