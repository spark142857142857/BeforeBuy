import { readFile } from "node:fs/promises";

const catalog = await readFile(new URL("../lib/data/catalog.ts", import.meta.url), "utf8");
const assetCount = (catalog.match(/asset\(\{/g) ?? []).length;
const relationBlocks = (catalog.match(/^  "[a-z0-9-]+": \[$/gm) ?? []).length;
if (assetCount < 45) throw new Error(`Expected at least 45 curated assets, found ${assetCount}`);
if (relationBlocks < 15) throw new Error(`Expected at least 15 Korean relation sets, found ${relationBlocks}`);
if (!catalog.includes("return1yKrw")) throw new Error("KRW-converted returns are missing");
if (!catalog.includes("fxAsOf")) throw new Error("FX snapshot date is missing");
console.log(`Snapshot OK: ${assetCount} assets, ${relationBlocks} Korean relation sets`);
