import { readFile } from "node:fs/promises";

const [catalog, krxRaw, dartCorpRaw, profilesRaw, similarityRaw] = await Promise.all([
  readFile(new URL("../lib/data/catalog.ts", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/kr_stocks.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/dart_corp_codes.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/business_profiles.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/kr_similarity.json", import.meta.url), "utf8"),
]);
const krx = JSON.parse(krxRaw);
const dartCorp = JSON.parse(dartCorpRaw);
const profiles = JSON.parse(profilesRaw);
const similarity = JSON.parse(similarityRaw);
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
if (similarity.counts.companies < 2500 || similarity.counts.recommendations < 25000) {
  throw new Error(`Similarity coverage is unexpectedly low: ${JSON.stringify(similarity.counts)}`);
}
if (!similarity.similar["005380"]?.some((candidate) => candidate.symbol === "000270")) {
  throw new Error("Hyundai Motor similarity results do not include Kia");
}
if (!similarity.similar["035420"]?.some((candidate) => candidate.symbol === "035720")) {
  throw new Error("NAVER similarity results do not include Kakao");
}
console.log(
  `Snapshot OK: ${krx.counts.total} Korean stocks, ${dartCorp.counts.mapped} DART mappings, ` +
    `${profiles.counts.profiles} business profiles, ${similarity.counts.companies} similarity companies, ` +
    `${assetCount} enriched assets, ${relationBlocks} relation sets`,
);
