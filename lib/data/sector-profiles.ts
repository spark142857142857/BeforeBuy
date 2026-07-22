import type { Asset } from "./catalog";

export type ProfileTag = {
  id: string;
  label: string;
};

export type SectorProfile = {
  sector: string;
  valueChainRoles: ProfileTag[];
  businessModels: ProfileTag[];
  technologies: ProfileTag[];
  products: ProfileTag[];
  demandMarkets: ProfileTag[];
  drivers: ProfileTag[];
};

type TagRule = ProfileTag & { pattern: RegExp };

const semiconductorRules: Record<Exclude<keyof SectorProfile, "sector">, TagRule[]> = {
  valueChainRoles: [
    { id: "design", label: "설계", pattern: /팹리스|gpu|cuda|ai 가속기|칩 설계/i },
    { id: "manufacturing", label: "제조", pattern: /메모리|dram|nand|hbm|파운드리|웨이퍼/i },
    { id: "equipment", label: "장비", pattern: /반도체 장비|장비 기업/i },
    { id: "materials", label: "소재", pattern: /반도체 소재|소재 기업/i },
  ],
  businessModels: [
    { id: "memory", label: "메모리 제조", pattern: /메모리|dram|nand|hbm/i },
    { id: "foundry", label: "파운드리", pattern: /파운드리/i },
    { id: "fabless", label: "팹리스", pattern: /팹리스|gpu|cuda|ai 가속기/i },
    { id: "equipment", label: "반도체 장비", pattern: /반도체 장비|장비 기업/i },
    { id: "materials", label: "반도체 소재", pattern: /반도체 소재|소재 기업/i },
  ],
  technologies: [
    { id: "advanced-process", label: "첨단 공정", pattern: /첨단 공정|첨단 파운드리/i },
    { id: "mature-process", label: "성숙 공정", pattern: /성숙 공정|8인치/i },
    { id: "integrated", label: "종합 반도체", pattern: /종합반도체|종합 기술/i },
  ],
  products: [
    { id: "hbm", label: "HBM", pattern: /hbm/i },
    { id: "dram", label: "DRAM", pattern: /dram/i },
    { id: "nand", label: "NAND", pattern: /nand/i },
    { id: "gpu", label: "AI 가속기", pattern: /gpu|ai 가속기|ai 칩/i },
    { id: "power-semiconductor", label: "전력반도체", pattern: /전력반도체/i },
    { id: "analog", label: "아날로그", pattern: /아날로그/i },
    { id: "equipment", label: "반도체 장비", pattern: /반도체 장비|장비 기업/i },
    { id: "materials", label: "반도체 소재", pattern: /반도체 소재|소재 기업/i },
  ],
  demandMarkets: [
    { id: "ai-datacenter", label: "AI 데이터센터", pattern: /hbm|gpu|ai 가속기|ai 칩|ai 데이터센터/i },
    { id: "mobile", label: "모바일", pattern: /모바일|애플/i },
    { id: "automotive", label: "자동차", pattern: /전력반도체|자동차/i },
    { id: "industrial", label: "산업용", pattern: /전력반도체|아날로그|산업용/i },
  ],
  drivers: [
    { id: "memory-price", label: "메모리 가격", pattern: /메모리|dram|nand|hbm/i },
    { id: "foundry-utilization", label: "파운드리 가동률", pattern: /파운드리/i },
    { id: "ai-investment", label: "AI 인프라 투자", pattern: /hbm|gpu|ai 가속기|ai 칩|ai 데이터센터/i },
    { id: "semiconductor-capex", label: "반도체 설비투자", pattern: /반도체 장비|장비 기업/i },
    { id: "semiconductor-cycle", label: "반도체 업황", pattern: /반도체/i },
  ],
};

function matchRules(rules: TagRule[], text: string) {
  return rules
    .filter((rule) => rule.pattern.test(text))
    .map(({ id, label }) => ({ id, label }));
}

function genericProfile(asset: Asset): SectorProfile {
  const role = asset.type === "etf"
    ? [{ id: "basket", label: `${asset.sector} ETF` }]
    : [{ id: `industry:${asset.industry}`, label: asset.industry || asset.sector }];
  return {
    sector: asset.sector,
    valueChainRoles: role,
    businessModels: role,
    technologies: [],
    products: asset.exposures.map((label) => ({ id: `exposure:${label}`, label })),
    demandMarkets: [],
    drivers: [{ id: `sector:${asset.sector}`, label: `${asset.sector} 업황` }],
  };
}

export function buildSectorProfile(asset: Asset): SectorProfile {
  if (asset.type === "etf") {
    const base = asset.sector === "반도체"
      ? buildSemiconductorProfile(asset)
      : genericProfile(asset);
    return {
      ...base,
      valueChainRoles: [{ id: "basket", label: `${asset.sector} ETF` }],
      businessModels: [{ id: "basket", label: `${asset.sector} ETF` }],
    };
  }
  return asset.sector === "반도체" ? buildSemiconductorProfile(asset) : genericProfile(asset);
}

function buildSemiconductorProfile(asset: Asset): SectorProfile {
  const text = [asset.industry, asset.summary, ...asset.exposures].join(" ");
  const profile = Object.fromEntries(
    Object.entries(semiconductorRules).map(([key, rules]) => [key, matchRules(rules, text)]),
  ) as Omit<SectorProfile, "sector">;
  return { sector: asset.sector, ...profile };
}

export function sharedTags(left: ProfileTag[], right: ProfileTag[]) {
  const rightIds = new Set(right.map((tag) => tag.id));
  return left.filter((tag) => rightIds.has(tag.id));
}

export function uniqueTags(source: ProfileTag[], target: ProfileTag[]) {
  const targetIds = new Set(target.map((tag) => tag.id));
  return source.filter((tag) => !targetIds.has(tag.id));
}
