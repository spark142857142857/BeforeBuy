import { readFile } from "node:fs/promises";
import ts from "typescript";

const [catalog, krxRaw, dartCorpRaw, profilesRaw, similarityRaw, taxonomyRaw, directCandidatesRaw, semiconductorCandidatesRaw, globalLinksRaw, holdingsRaw] = await Promise.all([
  readFile(new URL("../lib/data/catalog.ts", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/kr_stocks.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/dart_corp_codes.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/business_profiles.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/kr_similarity.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/kr_company_taxonomy.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/kr_direct_candidates.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/kr_semiconductor_candidates.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/global_links.json", import.meta.url), "utf8"),
  readFile(new URL("../data/curated/etf_holdings.json", import.meta.url), "utf8"),
]);
const krx = JSON.parse(krxRaw);
const dartCorp = JSON.parse(dartCorpRaw);
const profiles = JSON.parse(profilesRaw);
const similarity = JSON.parse(similarityRaw);
const taxonomy = JSON.parse(taxonomyRaw);
const directCandidates = JSON.parse(directCandidatesRaw);
const semiconductorCandidates = JSON.parse(semiconductorCandidatesRaw);
const globalLinks = JSON.parse(globalLinksRaw);
const holdings = JSON.parse(holdingsRaw);
const catalogForStaticCheck = catalog.replace(/^import .*from "\.\/alternative-relations";\r?\n/m, "");
const catalogJavaScript = ts.transpileModule(catalogForStaticCheck, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const catalogModule = await import(`data:text/javascript;base64,${Buffer.from(catalogJavaScript).toString("base64")}`);
const { assets, alternatives, snapshotMeta } = catalogModule;
const assetCount = assets.length;
const assetSlugs = new Set(assets.map((asset) => asset.slug));
const relationBlocks = Object.keys(alternatives).length;
if (assetCount < 45) throw new Error(`Expected at least 45 curated assets, found ${assetCount}`);
if (relationBlocks < 15) throw new Error(`Expected at least 15 Korean relation sets, found ${relationBlocks}`);
for (const asset of assets.filter((item) => item.market === "US")) {
  if (!Number.isFinite(asset.metrics.return1yKrw)) {
    throw new Error(`KRW-converted return is missing: ${asset.slug}`);
  }
}
if (!snapshotMeta.fxAsOf) throw new Error("FX snapshot date is missing");
if (krx.counts.total < 2000) throw new Error(`KRX master is unexpectedly small: ${krx.counts.total}`);
if (!krx.stocks.some((stock) => stock.symbol === "005930" && stock.name === "삼성전자")) {
  throw new Error("KRX master does not include Samsung Electronics");
}
if (new Set(krx.stocks.map((stock) => stock.symbol)).size !== krx.stocks.length) {
  throw new Error("KRX master contains duplicate symbols");
}
const stockSymbols = new Set(krx.stocks.map((stock) => stock.symbol));
for (const asset of assets.filter((item) => item.market === "KR" && item.type === "stock")) {
  if (!stockSymbols.has(asset.ticker)) {
    throw new Error(`Curated Korean stock is missing from the KRX master: ${asset.ticker} (${asset.name})`);
  }
}
if (krx.stocks.filter((stock) => stock.industry).length < 2500) {
  throw new Error("KRX master industry coverage is unexpectedly low");
}
const dartSymbols = new Set(Object.keys(dartCorp.companies));
if (
  dartSymbols.size !== dartCorp.counts.mapped ||
  [...dartSymbols].some((symbol) => !stockSymbols.has(symbol)) ||
  dartCorp.counts.mapped + dartCorp.counts.unmapped !== stockSymbols.size
) {
  throw new Error("DART mapped and unmapped counts do not cover the KRX master exactly");
}
for (const symbol of ["138040", "369370"]) {
  if (krx.stocks.find((stock) => stock.symbol === symbol)?.securityType !== "common") {
    throw new Error(`A common stock is misclassified as a REIT: ${symbol}`);
  }
}
for (const symbol of ["00104K", "37550L"]) {
  if (krx.stocks.find((stock) => stock.symbol === symbol)?.securityType !== "preferred") {
    throw new Error(`A conversion preferred share is misclassified: ${symbol}`);
  }
}
if (dartCorp.counts.listedStocks !== krx.counts.total) {
  throw new Error("DART corporation mapping does not match the KRX master size");
}
if (dartCorp.counts.mapped < 2500) {
  throw new Error(`DART corporation mapping is unexpectedly small: ${dartCorp.counts.mapped}`);
}
if (dartCorp.companies["005930"]?.corpCode !== "00126380") {
  throw new Error("DART corporation mapping does not include Samsung Electronics");
}
if (profiles.counts.profiles < 2600 || profiles.counts.preferredAliases < 100) {
  throw new Error(`Business profile coverage is unexpectedly low: ${JSON.stringify(profiles.counts)}`);
}
if (profiles.counts.profiles + profiles.counts.preferredAliases + profiles.counts.unavailable !== krx.counts.total) {
  throw new Error("Business profile, alias and unavailable counts do not cover the KRX master exactly");
}
const profileSymbols = new Set(Object.keys(profiles.profiles));
const aliasSymbols = new Set(Object.keys(profiles.aliases));
const unavailableSymbols = new Set(Object.keys(profiles.unavailable));
for (const symbol of stockSymbols) {
  const memberships = [profileSymbols, aliasSymbols, unavailableSymbols].filter((group) => group.has(symbol)).length;
  if (memberships !== 1) throw new Error(`Business profile coverage is not exclusive: ${symbol}`);
}
for (const [symbol, target] of Object.entries(profiles.aliases)) {
  if (
    krx.stocks.find((stock) => stock.symbol === symbol)?.securityType !== "preferred" ||
    !profileSymbols.has(target)
  ) {
    throw new Error(`Preferred-share profile alias is invalid: ${symbol} -> ${target}`);
  }
}
if (profiles.schemaVersion < 2 || typeof profiles.counts.refreshWarnings !== "number") {
  throw new Error("Business profile schema or refresh warning metadata is invalid");
}
if (Object.values(profiles.profiles).some((profile) => "excerpt" in profile)) {
  throw new Error("Web business profiles must not bundle DART report excerpts");
}
if (profiles.aliases["005935"] !== "005930") {
  throw new Error("Samsung Electronics preferred stock does not share the common stock profile");
}
if (similarity.method.reportType !== "annual" || similarity.method.llmUsed !== false) {
  throw new Error("Similarity method must use annual reports without an LLM");
}
if (similarity.method.industryExactMatchUsed !== false || !similarity.method.standardWeights.businessExposures) {
  throw new Error("Similarity method must use multi-label business exposures instead of exact KRX industry matching");
}
if (similarity.method.industrySoftPriorsUsed !== true) {
  throw new Error("Similarity method must use soft KRX industry priors");
}
if (similarity.schemaVersion < 4) {
  throw new Error("Similarity snapshot must use schemaVersion >= 4");
}
if (similarity.counts.companiesWithExposures < 2200) {
  throw new Error(`Exposure coverage is unexpectedly low: ${similarity.counts.companiesWithExposures}`);
}
if (similarity.counts.companies < 2500 || similarity.counts.recommendations < 25000) {
  throw new Error(`Similarity coverage is unexpectedly low: ${JSON.stringify(similarity.counts)}`);
}
for (const [symbol, candidates] of Object.entries(similarity.similar)) {
  if (!stockSymbols.has(symbol) || candidates.length !== 10) {
    throw new Error(`Similarity source or candidate count is invalid: ${symbol}`);
  }
  const candidateSymbols = new Set();
  for (const candidate of candidates) {
    if (
      candidate.symbol === symbol ||
      candidateSymbols.has(candidate.symbol) ||
      !stockSymbols.has(candidate.symbol)
    ) {
      throw new Error(`Similarity candidate identity is invalid: ${symbol} -> ${candidate.symbol}`);
    }
    candidateSymbols.add(candidate.symbol);
    for (const key of ["score", "textSimilarity", "exposureSimilarity", "productSimilarity"]) {
      if (!Number.isFinite(candidate[key]) || candidate[key] < 0 || candidate[key] > 1) {
        throw new Error(`Similarity score is outside 0..1: ${symbol} -> ${candidate.symbol} ${key}`);
      }
    }
    if (
      !candidate.sharedExposures?.length &&
      !candidate.sharedTerms?.length &&
      candidate.textSimilarity < 0.35 &&
      candidate.confidence !== "low"
    ) {
      throw new Error(`Similarity evidence is too weak without a low-confidence disclosure: ${symbol} -> ${candidate.symbol}`);
    }
  }
}
if (!similarity.counts.lowConfidenceRecommendations) {
  throw new Error("Similarity snapshot must disclose recommendations with limited comparison evidence");
}
if (taxonomy.method.llmUsed !== false || taxonomy.schemaVersion < 2) {
  throw new Error("Company taxonomy must be deterministic and versioned");
}
if (taxonomy.counts.commonStocks !== krx.stocks.filter((stock) => stock.securityType === "common").length) {
  throw new Error("Company taxonomy does not cover every KRX common stock");
}
if (taxonomy.counts.classificationStatus?.["comparison-ready"] < 1800 || taxonomy.counts.classificationStatus?.["wics-only"] < 500) {
  throw new Error(`Company taxonomy classification coverage is unexpectedly low: ${JSON.stringify(taxonomy.counts.classificationStatus)}`);
}
const taxonomyBySymbol = new Map(taxonomy.companies.map((company) => [company.symbol, company]));
for (const symbol of ["005930", "000990", "000660"]) {
  const company = taxonomyBySymbol.get(symbol);
  if (company?.classification?.primaryComparisonSector?.id !== "semiconductors") {
    throw new Error(`Representative semiconductor taxonomy classification is invalid: ${symbol}`);
  }
}
if (taxonomyBySymbol.get("005930")?.classification?.wics?.primarySector?.id !== "information-technology") {
  throw new Error("Samsung Electronics taxonomy is missing its WICS-style information-technology layer");
}
if (!taxonomyBySymbol.get("000990")?.classification?.tags?.businessModels?.some((tag) => tag.id === "foundry")) {
  throw new Error("DB HiTek taxonomy is missing the foundry business-model tag");
}
if (taxonomyBySymbol.get("005930")?.classification?.primaryRole?.id !== "memory") {
  throw new Error("Samsung Electronics taxonomy must use memory as the primary semiconductor role");
}
if (taxonomyBySymbol.get("000990")?.classification?.primaryRole?.id !== "foundry") {
  throw new Error("DB HiTek taxonomy must use foundry as the primary semiconductor role");
}
if (semiconductorCandidates.method.llmUsed !== false || semiconductorCandidates.schemaVersion < 1) {
  throw new Error("Semiconductor direct-candidate snapshot must be deterministic and versioned");
}
if (directCandidates.method.llmUsed !== false || directCandidates.counts.companies !== taxonomy.counts.commonStocks) {
  throw new Error("All-company direct-candidate snapshot must be deterministic and cover every common stock");
}
for (const [symbol, entry] of Object.entries(directCandidates.links)) {
  if (!taxonomyBySymbol.has(symbol)) throw new Error(`Direct-candidate source is unknown: ${symbol}`);
  if (entry.status === "available" && !entry.directCandidates.length) {
    throw new Error(`Direct-candidate status contradicts candidate list: ${symbol}`);
  }
  for (const candidate of entry.directCandidates) {
    const sourceRole = entry.primaryRole;
    const targetRole = taxonomyBySymbol.get(candidate.symbol)?.classification?.primaryRole;
    if (candidate.symbol === symbol || !sourceRole || targetRole?.id !== sourceRole.id || targetRole?.comparisonSectorId !== sourceRole.comparisonSectorId) {
      throw new Error(`Direct candidate must share the source sector and primary role: ${symbol} -> ${candidate.symbol}`);
    }
  }
}
if (directCandidates.links["005930"]?.directCandidates?.[0]?.symbol !== "000660") {
  throw new Error("Samsung Electronics must keep SK hynix as its all-company direct candidate");
}
if (semiconductorCandidates.counts.coveredCompanies < 50) {
  throw new Error(`Semiconductor candidate coverage is unexpectedly low: ${JSON.stringify(semiconductorCandidates.counts)}`);
}
for (const [symbol, entry] of Object.entries(semiconductorCandidates.links)) {
  const source = taxonomyBySymbol.get(symbol);
  if (!source?.classification?.subSectors?.some((role) => role.comparisonSectorId === "semiconductors" && role.id === entry.primaryRole.id)) {
    throw new Error(`Semiconductor candidate source role is invalid: ${symbol}`);
  }
  if (entry.coverage === "none" && entry.directCandidates.length) {
    throw new Error(`Semiconductor candidate coverage contradicts candidate list: ${symbol}`);
  }
  for (const candidate of entry.directCandidates) {
    const target = taxonomyBySymbol.get(candidate.symbol);
    if (candidate.symbol === symbol || !target?.classification?.subSectors?.some((role) => role.comparisonSectorId === "semiconductors" && role.id === entry.primaryRole.id)) {
      throw new Error(`Semiconductor direct candidate must share the source primary role: ${symbol} -> ${candidate.symbol}`);
    }
  }
}
if (semiconductorCandidates.links["005930"]?.directCandidates?.[0]?.symbol !== "000660") {
  throw new Error("Samsung Electronics must keep SK hynix as its direct memory candidate");
}
if (semiconductorCandidates.links["000990"]?.coverage !== "none") {
  throw new Error("DB HiTek must disclose that no domestic pure-foundry direct candidate exists");
}
if (!similarity.similar["005380"]?.some((candidate) => candidate.symbol === "000270")) {
  throw new Error("Hyundai Motor similarity results do not include Kia");
}
if (!similarity.similar["035420"]?.some((candidate) => candidate.symbol === "035720")) {
  throw new Error("NAVER similarity results do not include Kakao");
}
if (similarity.similar["005930"]?.[0]?.symbol !== "000660") {
  throw new Error("Samsung Electronics must rank SK hynix first");
}
if (similarity.similar["000660"]?.[0]?.symbol !== "005930") {
  throw new Error("SK hynix must rank Samsung Electronics first");
}
if (similarity.similar["005380"]?.[0]?.symbol !== "000270") {
  throw new Error("Hyundai Motor must rank Kia first");
}
if (similarity.similar["035420"]?.[0]?.symbol !== "035720") {
  throw new Error("NAVER must rank Kakao first");
}
if (similarity.similar["373220"]?.[0]?.symbol !== "006400") {
  throw new Error("LG Energy Solution must rank Samsung SDI first");
}
if (!similarity.similar["373220"]?.[0]?.sharedExposures?.includes("2차전지 밸류체인")) {
  throw new Error("Battery-cell peers must share the secondary-battery value-chain exposure");
}
if (similarity.similar["373220"]?.slice(0, 5).some((candidate) => !candidate.sharedExposures?.includes("배터리 셀 제조"))) {
  throw new Error("LG Energy Solution top five must remain battery-cell manufacturers");
}
for (const symbol of ["393970", "446540", "241690", "493330", "047310", "452450"]) {
  const candidate = similarity.similar["373220"]?.find((item) => item.symbol === symbol);
  if (candidate?.sharedExposures?.includes("배터리 셀 제조")) {
    throw new Error(`Battery material/parts/equipment stock is mislabeled as a cell manufacturer: ${symbol}`);
  }
}
if (!similarity.similar["005930"]?.[0]?.sharedExposures?.includes("메모리 반도체")) {
  throw new Error("Samsung Electronics top peer must share memory-semiconductor exposure");
}
if (!similarity.similar["207940"]?.some((candidate) => candidate.symbol === "068270")) {
  throw new Error("Samsung Biologics must include Celltrion among domestic peers");
}
if (!similarity.similar["068270"]?.some((candidate) => candidate.symbol === "207940")) {
  throw new Error("Celltrion must include Samsung Biologics among domestic peers");
}
if (similarity.similar["017670"]?.[0]?.symbol !== "030200" || similarity.similar["017670"]?.[1]?.symbol !== "032640") {
  throw new Error("SK Telecom must rank KT and LG Uplus as its first two telecom-service peers");
}
if (!similarity.similar["105560"]?.slice(0, 3).some((candidate) => ["055550", "086790", "316140"].includes(candidate.symbol))) {
  throw new Error("KB Financial must include a major financial holding company in its top three peers");
}
if (!similarity.similar["329180"]?.slice(0, 5).some((candidate) => candidate.symbol === "042660")) {
  throw new Error("HD Hyundai Heavy Industries must include Hanwha Ocean in its top five peers");
}
if (!similarity.similar["090430"]?.slice(0, 3).some((candidate) => candidate.symbol === "051900")) {
  throw new Error("Amorepacific must include LG Household & Health Care in its top three peers");
}
if (!similarity.similar["035900"]?.slice(0, 3).every((candidate) => ["122870", "041510", "352820"].includes(candidate.symbol))) {
  throw new Error("JYP Entertainment must rank YG, SM and HYBE as its top three peers");
}
if (!similarity.similar["086520"]?.slice(0, 3).some((candidate) => ["450080", "066970"].includes(candidate.symbol))) {
  throw new Error("EcoPro must include a major battery-material peer in its top three");
}
if (!similarity.similar["247540"]?.slice(0, 5).some((candidate) => candidate.symbol === "066970")) {
  throw new Error("EcoPro BM must include L&F among its top five battery peers");
}
if (similarity.similar["196170"]?.slice(0, 5).some((candidate) => !candidate.sharedExposures?.includes("바이오"))) {
  throw new Error("Alteogen top five peers must share biotechnology exposure");
}
if (globalLinks.method.llmUsed !== false || globalLinks.counts.mappedStocks < 400) {
  throw new Error(`Global link coverage or method is invalid: ${JSON.stringify(globalLinks.counts)}`);
}
for (const [symbol, matches] of Object.entries(globalLinks.links)) {
  if (!stockSymbols.has(symbol)) throw new Error(`Global link source is unknown: ${symbol}`);
  if (matches.length > 2 || new Set(matches.map((match) => match.id)).size !== matches.length) {
    throw new Error(`Global link theme count or identity is invalid: ${symbol}`);
  }
  for (const match of matches) {
    if (!match.reason || !match.matchedTerms.length) {
      throw new Error(`Global link evidence is missing: ${symbol} ${match.id}`);
    }
    for (const slug of [...match.peerSlugs, ...match.etfSlugs]) {
      if (!assetSlugs.has(slug)) throw new Error(`Global link asset is unknown: ${slug}`);
    }
  }
}
if (!globalLinks.links["005930"]?.some((match) => match.peerSlugs.includes("micron") && match.etfSlugs.includes("soxx"))) {
  throw new Error("Samsung Electronics does not include the expected global semiconductor links");
}
if (!globalLinks.links["005380"]?.some((match) => match.peerSlugs.includes("toyota") && match.etfSlugs.includes("driv"))) {
  throw new Error("Hyundai Motor does not include the expected global mobility links");
}
const requiredEtfs = [
  "kodex-semiconductor", "soxx", "kodex-auto", "driv", "tiger-secondary-battery", "lit",
  "kodex-internet", "qqq", "tiger-bio", "xlv", "kodex-defense", "ita", "kodex-bank", "xlf",
];
for (const slug of requiredEtfs) {
  const fund = holdings.funds[slug];
  if (!fund || fund.holdings.length < 5 || !fund.sourceUrl || !fund.asOf) {
    throw new Error(`ETF holdings snapshot is incomplete for ${slug}`);
  }
}
for (const slug of Object.keys(holdings.funds)) {
  if (!assetSlugs.has(slug)) throw new Error(`ETF holdings reference an unknown asset: ${slug}`);
}
if (!assets.some((asset) => asset.ticker === "449450" && asset.name === "PLUS K방산")) {
  throw new Error("449450 product identity is incorrect");
}
if (!assets.some((asset) => asset.ticker === "266360" && asset.name === "KODEX K콘텐츠")) {
  throw new Error("266360 product identity is incorrect");
}
console.log(
  `Snapshot OK: ${krx.counts.total} Korean stocks, ${dartCorp.counts.mapped} DART mappings, ` +
    `${profiles.counts.profiles} business profiles, ${taxonomy.counts.commonStocks} taxonomy companies, ${directCandidates.counts.status.available} direct-peer candidate sources, ${semiconductorCandidates.counts.coveredCompanies} semiconductor direct-peer companies, ${similarity.counts.companies} similarity companies, ` +
    `${globalLinks.counts.mappedStocks} global-link stocks, ${requiredEtfs.length} ETF holdings, ` +
    `${assetCount} enriched assets, ${relationBlocks} relation sets`,
);
