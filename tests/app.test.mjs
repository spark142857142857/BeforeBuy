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

test("basic stock page includes annual business profile and domestic peers", async () => {
  const response = await render("/stocks/kr-000020");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /동화약품/);
  assert.match(html, /전체 검색 연결 완료/);
  assert.match(html, /DART 연간 사업 내용/);
  assert.match(html, /연간 사업보고서 기반 국내 비교/);
  assert.match(html, /자동 국내 유사 종목/);
  assert.match(html, /삼진제약/);
  assert.match(html, /DART 원문/);
  assert.match(html, /국내외 대안으로 범위 넓히기/);
  assert.match(html, /일라이 릴리/);
  assert.match(html, /TIGER 200 헬스케어/);
  assert.match(html, /개별 종목과 ETF 직접 비교/);
  assert.match(html, /동화약품/);
  assert.match(html, /자체에 100% 직접 노출/);
  assert.match(html, /표시된 주요 5개에는 없음/);
});

test("Samsung detail includes global peers, ETFs and explanations", async () => {
  const response = await render("/stocks/samsung-electronics");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /같이 검토할 대안[\s\S]*5[\s\S]*개/);
  assert.match(html, /마이크론/);
  assert.match(html, /TSMC/);
  assert.match(html, /KODEX 반도체/);
  assert.match(html, /메모리·AI 반도체/);
  assert.match(html, /주요 구성 종목/);
  assert.match(html, /삼성전자/);
  assert.match(html, /자체에 100% 직접 노출/);
  assert.match(html, /주요 구성 종목에 17\.60% 포함/);
  assert.match(html, /1년 수익률/);
  assert.match(html, /공통점과 결정 전 차이/);
  assert.match(html, /2026-07-15/);
  assert.match(html, /원화 수익률/);
});

test("low-evidence domestic comparisons are disclosed", async () => {
  const response = await render("/stocks/kr-033780");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /KT&amp;G|KT&G/);
  assert.match(html, /비교 근거 제한적 · 추가 확인 필요/);
  assert.match(html, /정형 사업 노출 근거 부족/);
});

test("ETF detail shows representative holdings, coverage and official source", async () => {
  const response = await render("/stocks/xlf");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /이 ETF에는 무엇이 들어 있나/);
  assert.match(html, /JPMorgan Chase/);
  assert.match(html, /Berkshire Hathaway/);
  assert.match(html, /전체 구성/);
  assert.match(html, /76/);
  assert.match(html, /State Street/);
  assert.match(html, /공식 자료에서 확인/);
});

test("snapshot endpoint exposes freshness and asset count", async () => {
  const response = await render("/api/snapshot");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.stale, false);
  assert.ok(payload.assetCount >= 45);
  assert.equal(payload.fxAsOf, "2026-07-15");
});
