import { readFile } from "node:fs/promises";

const [catalog, krxRaw, dartCorpRaw] = await Promise.all([
  readFile(new URL("../lib/data/catalog.ts", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/kr_stocks.json", import.meta.url), "utf8"),
  readFile(new URL("../data/generated/dart_corp_codes.json", import.meta.url), "utf8"),
]);
const krx = JSON.parse(krxRaw);
const dartCorp = JSON.parse(dartCorpRaw);
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
console.log(
  `Snapshot OK: ${krx.counts.total} Korean stocks, ${dartCorp.counts.mapped} DART mappings, ` +
    `${assetCount} enriched assets, ${relationBlocks} relation sets`,
);
