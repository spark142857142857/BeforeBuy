import type { Alternative, Asset } from "./catalog";
import { buildSectorProfile, sharedTags, uniqueTags, type SectorProfile } from "./sector-profiles";

type RelationType = NonNullable<Alternative["relationType"]>;

function labels(tags: Array<{ label: string }>, limit = 3) {
  return tags.map((tag) => tag.label).slice(0, limit);
}

function primaryBusiness(profile: SectorProfile) {
  return profile.businessModels[0] ?? profile.valueChainRoles[0] ?? { id: `sector:${profile.sector}`, label: profile.sector };
}

function relationTypeFor(selected: Asset, candidate: Asset, selectedProfile: SectorProfile, candidateProfile: SectorProfile): RelationType {
  if (candidate.type === "etf") return "diversified";
  const sharedBusiness = sharedTags(selectedProfile.businessModels, candidateProfile.businessModels);
  const sharedRole = sharedTags(selectedProfile.valueChainRoles, candidateProfile.valueChainRoles);
  const sharedProduct = sharedTags(selectedProfile.products, candidateProfile.products);
  const sharedDemand = sharedTags(selectedProfile.demandMarkets, candidateProfile.demandMarkets);

  // A direct peer needs more than the same broad industry label. It must share
  // a business model and at least one product or demand market that can drive
  // its results. For example, two foundries with different process generations
  // and end markets remain useful, but belong in a business-structure comparison.
  if (sharedBusiness.length && (sharedProduct.length || sharedDemand.length)) return "direct";
  if (sharedBusiness.length || sharedRole.length) return "structural-comparison";
  return "exposure-shift";
}

function comparisonDetails(selectedProfile: SectorProfile, candidateProfile: SectorProfile) {
  const sharedDrivers = labels(sharedTags(selectedProfile.drivers, candidateProfile.drivers));
  const sharedProducts = labels(sharedTags(selectedProfile.products, candidateProfile.products));
  const selectedOnly = labels([
    ...uniqueTags(selectedProfile.technologies, candidateProfile.technologies),
    ...uniqueTags(selectedProfile.products, candidateProfile.products),
    ...uniqueTags(selectedProfile.demandMarkets, candidateProfile.demandMarkets),
  ]);
  const candidateOnly = labels([
    ...uniqueTags(candidateProfile.technologies, selectedProfile.technologies),
    ...uniqueTags(candidateProfile.products, selectedProfile.products),
    ...uniqueTags(candidateProfile.demandMarkets, selectedProfile.demandMarkets),
  ]);
  return { sharedDrivers, sharedProducts, selectedOnly, candidateOnly };
}

function newRiskLabels(selected: Asset, candidate: Asset, relationType: RelationType) {
  const selectedRisks = new Set(selected.risks);
  const values = candidate.risks.filter((risk) => !selectedRisks.has(risk));
  if (selected.market !== candidate.market && candidate.market === "US" && relationType !== "diversified") {
    values.unshift("달러 환율");
  }
  return [...new Set(values)].slice(0, 2);
}

function joined(values: string[], fallback: string) {
  return values.length ? values.join("·") : fallback;
}

function summaryFor(type: RelationType, candidateOnly: string[], selectedOnly: string[], sharedProducts: string[], candidate: Asset) {
  if (type === "direct" && !candidateOnly.length && !selectedOnly.length) {
    return `${joined(sharedProducts, candidate.industry)} 구성이 비슷하고, 시장과 위험 구조가 다릅니다.`;
  }
  const strongerText = joined(candidateOnly, candidate.industry);
  const weakerText = joined(selectedOnly, "선택 종목의 고유 사업");
  if (type === "diversified") {
    const wider = candidateOnly.filter((value) => value !== "여러 기업으로 분산");
    const narrower = selectedOnly.filter((value) => value !== "단일 기업 직접성");
    return `${joined(wider, candidate.industry)}까지 여러 기업에 나눠 담고, ${joined(narrower, "선택 종목")} 비중은 줄어듭니다.`;
  }
  return `${strongerText}에 더 집중하고, ${weakerText} 비중은 줄어듭니다.`;
}

function comparisonEvidence(
  selectedProfile: SectorProfile,
  candidateProfile: SectorProfile,
  sharedProducts: string[],
  sharedDrivers: string[],
  candidate: Asset,
  risks: string[],
) {
  const selectedBusiness = primaryBusiness(selectedProfile);
  const candidateBusiness = primaryBusiness(candidateProfile);
  const sharedBusiness = labels(sharedTags(selectedProfile.businessModels, candidateProfile.businessModels));
  const evidence = [
    selectedBusiness.id === candidateBusiness.id
      ? `같은 사업 ${selectedBusiness.label}`
      : `사업 ${selectedBusiness.label} → ${candidateBusiness.label}`,
    selectedBusiness.id !== candidateBusiness.id && sharedBusiness.length
      ? `겹치는 사업 ${sharedBusiness.join(" · ")}`
      : undefined,
    sharedProducts.length ? `공통 제품 ${sharedProducts.join(" · ")}` : undefined,
    sharedDrivers.length ? `함께 보는 변수 ${sharedDrivers.join(" · ")}` : undefined,
    candidate.type === "etf" ? "여러 종목에 분산" : undefined,
    risks.length ? `확인할 점 ${risks[0]}` : undefined,
  ];
  return evidence.filter((value): value is string => Boolean(value)).slice(0, 4);
}

export function scoreAlternativeCandidate(selected: Asset, candidate: Asset) {
  const selectedProfile = buildSectorProfile(selected);
  const candidateProfile = buildSectorProfile(candidate);
  const selectedBusiness = primaryBusiness(selectedProfile);
  const candidateBusiness = primaryBusiness(candidateProfile);
  const samePrimaryBusiness = selectedBusiness.id === candidateBusiness.id ? 50 : 0;
  const sharedBusiness = sharedTags(selectedProfile.businessModels, candidateProfile.businessModels).length * 20;
  const sharedValueChain = sharedTags(selectedProfile.valueChainRoles, candidateProfile.valueChainRoles).length * 12;
  const sharedProduct = sharedTags(selectedProfile.products, candidateProfile.products).length * 8;
  const sharedDriver = sharedTags(selectedProfile.drivers, candidateProfile.drivers).length * 6;
  const sharedDemand = sharedTags(selectedProfile.demandMarkets, candidateProfile.demandMarkets).length * 4;
  const sharedTechnology = sharedTags(selectedProfile.technologies, candidateProfile.technologies).length * 3;
  const globalComparison = selectedBusiness.id !== candidateBusiness.id
    && selected.market !== candidate.market
    && candidate.type === "stock"
    ? 6
    : 0;
  return samePrimaryBusiness + sharedBusiness + sharedValueChain + sharedProduct + sharedDriver + sharedDemand + sharedTechnology + globalComparison;
}

export function buildAlternativeRelation(selected: Asset, candidate: Asset): Alternative {
  const selectedProfile = buildSectorProfile(selected);
  const candidateProfile = buildSectorProfile(candidate);
  const relationType = relationTypeFor(selected, candidate, selectedProfile, candidateProfile);
  const details = comparisonDetails(selectedProfile, candidateProfile);
  const risks = newRiskLabels(selected, candidate, relationType);
  const candidateOnly = relationType === "diversified"
    ? ["여러 기업으로 분산", ...details.candidateOnly].slice(0, 3)
    : details.candidateOnly;
  const selectedOnly = relationType === "diversified"
    ? ["단일 기업 직접성", ...details.selectedOnly].slice(0, 3)
    : details.selectedOnly;
  const strongerExposures = candidateOnly.length ? candidateOnly : [candidate.industry];
  const weakerExposures = selectedOnly.length ? selectedOnly : [selected.industry];
  const sharedDrivers = details.sharedDrivers.length ? details.sharedDrivers : [`${selected.sector} 업황`];
  const tradeoffSummary = summaryFor(relationType, candidateOnly, selectedOnly, details.sharedProducts, candidate);
  const evidence = comparisonEvidence(
    selectedProfile,
    candidateProfile,
    details.sharedProducts,
    details.sharedDrivers,
    candidate,
    risks,
  );
  const relationLabel = relationType === "direct"
    ? "비슷한 종목"
    : relationType === "structural-comparison"
      ? "사업 구조 비교"
      : relationType === "exposure-shift"
        ? "다른 사업의 종목"
        : "관련 ETF";

  return {
    slug: candidate.slug,
    reason: `${joined(sharedDrivers, selected.sector)}을 함께 보는 ${relationLabel}입니다.`,
    common: `${joined(sharedDrivers, selected.sector)}의 영향을 함께 받습니다.`,
    difference: tradeoffSummary,
    relationType,
    sharedDrivers,
    strongerExposures,
    weakerExposures,
    newRisks: risks.length ? risks : candidate.risks.slice(0, 2),
    tradeoffSummary,
    confidence: evidence.length >= 3 ? "high" : evidence.length >= 2 ? "medium" : "limited",
    evidence,
  };
}
