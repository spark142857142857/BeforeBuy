import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

function render(pathname = "/") {
  return worker.fetch(new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("home renders Korean stock search and industry map", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /이 종목을 사기 전/);
  assert.match(html, /한국 종목 검색/);
  assert.match(html, /INDUSTRY MAP/);
  assert.match(html, /삼성전자/);
  assert.match(html, /한국 상장 종목[\s\S]*[0-9,]+[\s\S]*개 검색/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("search API finds stocks outside the curated demo catalog", async () => {
  const response = await render("/api/stocks/search?q=동화약품");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.results.some((stock) => stock.symbol === "000020" && stock.slug === "kr-000020"));
});

test("basic stock page explains the staged data pipeline", async () => {
  const response = await render("/stocks/kr-000020");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /동화약품/);
  assert.match(html, /전체 검색 연결 완료/);
  assert.match(html, /DART 사업 내용 수집/);
});

test("Samsung detail includes global peers, ETFs and explanations", async () => {
  const response = await render("/stocks/samsung-electronics");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /같이 검토할 대안[\s\S]*5[\s\S]*개/);
  assert.match(html, /마이크론/);
  assert.match(html, /TSMC/);
  assert.match(html, /KODEX 반도체/);
  assert.match(html, /공통점과 결정 전 차이/);
  assert.match(html, /2026-07-15/);
  assert.match(html, /원화 수익률/);
});

test("snapshot endpoint exposes freshness and asset count", async () => {
  const response = await render("/api/snapshot");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.stale, false);
  assert.ok(payload.assetCount >= 45);
  assert.equal(payload.fxAsOf, "2026-07-15");
});
