import { readFile } from "node:fs/promises";

const [catalog, krxRaw, dartCorpRaw, profilesRaw, similarityRaw, globalLinksRaw, holdingsRaw] = await Promise.all([
  readFile(new URL("../lib/data/catalog.ts", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/kr_stocks.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/dart_corp_codes.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/business_profiles.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/kr_similarity.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/global_links.json", import.meta.url), "utf8"),
  readFile(new URL("../data/curated/etf_holdings.json", import.meta.url), "utf8"),
]);
const krx = JSON.parse(krxRaw);
const dartCorp = JSON.parse(dartCorpRaw);
const profiles = JSON.parse(profilesRaw);
const similarity = JSON.parse(similarityRaw);
const globalLinks = JSON.parse(globalLinksRaw);
const holdings = JSON.parse(holdingsRaw);
const assetCount = (catalog.match(/asset\(\{/g) ?? []).length;
const relationBlocks = (catalog.match(/^  "[a-z0-9-]+": \[$/gm) ?? []).length;
if (assetCount < 45) throw new Error(`Expected at least 45 curated assets, found ${assetCount}`);
if (relationBlocks < 15) throw new Error(`Expected at least 15 Korean relation sets, found ${relationBlocks}`);
if (!catalog.includes("return1yKrw")) throw new Error("KRW-converted returns are missing");
if (!catalog.includes("fxAsOf")) throw new Error("FX snapshot date is missing");
if (krx.counts.total < 2000) throw new Error(`KRX master is unexpectedly small: ${krx.counts.total}`);
if (!krx.stocks.some((stock) => stock.symbol === "005930" && stock.name === "삼성전자")) {
  throw new Error("KRX master does not include Samsung Electronics");
}
if (new Set(krx.stocks.map((stock) => stock.symbol)).size !== krx.stocks.length) {
  throw new Error("KRX master contains duplicate symbols");
}
if (krx.stocks.filter((stock) => stock.industry).length < 2500) {
  throw new Error("KRX master industry coverage is unexpectedly low");
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
if (profiles.aliases["005935"] !== "005930") {
  throw new Error("Samsung Electronics preferred stock does not share the common stock profile");
}
if (similarity.method.reportType !== "annual" || similarity.method.llmUsed !== false) {
  throw new Error("Similarity method must use annual reports without an LLM");
}
if (similarity.method.industryExactMatchUsed !== false || !similarity.method.standardWeights.businessExposures) {
  throw new Error("Similarity method must use multi-label business exposures instead of exact KRX industry matching");
}
if (similarity.counts.companies < 2500 || similarity.counts.recommendations < 25000) {
  throw new Error(`Similarity coverage is unexpectedly low: ${JSON.stringify(similarity.counts)}`);
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
if (globalLinks.method.llmUsed !== false || globalLinks.counts.mappedStocks < 400) {
  throw new Error(`Global link coverage or method is invalid: ${JSON.stringify(globalLinks.counts)}`);
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
if (!catalog.includes('ticker: "449450", name: "PLUS K방산"')) {
  throw new Error("449450 product identity is incorrect");
}
if (!catalog.includes('ticker: "266360", name: "KODEX K콘텐츠"')) {
  throw new Error("266360 product identity is incorrect");
}
console.log(
  `Snapshot OK: ${krx.counts.total} Korean stocks, ${dartCorp.counts.mapped} DART mappings, ` +
    `${profiles.counts.profiles} business profiles, ${similarity.counts.companies} similarity companies, ` +
    `${globalLinks.counts.mappedStocks} global-link stocks, ${requiredEtfs.length} ETF holdings, ` +
    `${assetCount} enriched assets, ${relationBlocks} relation sets`,
);
