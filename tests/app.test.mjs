import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

function render(pathname = "/", headers = {}) {
  return worker.fetch(new Request(`http://localhost${pathname}`, { headers: { accept: "text/html", ...headers } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

function withoutReactMarkers(html) {
  return html.replace(/<!--.*?-->/gs, "");
}

test("home renders Korean stock search and industry map", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = withoutReactMarkers(await response.text());
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

test("search API includes KOSDAQ GLOBAL stocks after market normalization", async () => {
  const [byName, bySymbol] = await Promise.all([
    render("/api/stocks/search?q=알테오젠"),
    render("/api/stocks/search?q=196170"),
  ]);
  assert.equal(byName.status, 200);
  assert.equal(bySymbol.status, 200);
  const namePayload = await byName.json();
  const symbolPayload = await bySymbol.json();
  const nameResult = namePayload.results.find((stock) => stock.symbol === "196170");
  const symbolResult = symbolPayload.results.find((stock) => stock.symbol === "196170");

  assert.equal(nameResult?.name, "알테오젠");
  assert.equal(nameResult?.slug, "alteogen");
  assert.equal(symbolResult?.slug, "alteogen");
});

test("basic stock page includes annual business profile and domestic peers", async () => {
  const response = await render("/stocks/kr-000020");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /동화약품/);
  assert.match(html, /종목 목록 연결/);
  assert.match(html, /DART 연간 사업 내용/);
  assert.match(html, /사업이 비슷한 국내 기업/);
  assert.match(html, /비슷한 기업[\s\S]*5[\s\S]*개/);
  assert.match(html, /삼진제약/);
  assert.match(html, /DART 원문/);
  assert.doesNotMatch(html, /class="business-excerpt"/);
  assert.match(html, /국내외 대안으로 범위 넓히기/);
  assert.match(html, /일라이 릴리/);
  assert.match(html, /TIGER 200 헬스케어/);
  assert.match(html, /종목과 ETF 비교/);
  assert.match(html, /동화약품/);
  assert.match(html, /자체에 100% 직접 노출/);
  assert.match(html, /표시된 주요 5개에는 없음/);
});

test("Samsung detail keeps the alternative comparison concise", async () => {
  const response = await render("/stocks/samsung-electronics");
  assert.equal(response.status, 200);
  const html = withoutReactMarkers(await response.text());
  assert.match(html, /함께 볼 만한 종목과 ETF/);
  assert.match(html, /비슷한 종목/);
  assert.match(html, /사업 구조 비교/);
  assert.match(html, /ETF로 넓게/);
  assert.match(html, /HBM·AI 데이터센터에 더 집중하고, 종합 반도체·모바일 비중은 줄어듭니다/);
  assert.match(html, /성숙 공정·전력반도체·아날로그에 더 집중하고, 종합 반도체·DRAM·NAND 비중은 줄어듭니다/);
  assert.match(html, /사업 메모리 제조 → 파운드리/);
  assert.match(html, /사업 메모리 제조 → 반도체 ETF/);
  assert.match(html, /마이크론/);
  assert.doesNotMatch(html, /href="\/stocks\/tsmc"/);
  assert.match(html, /KODEX 반도체/);
  assert.match(html, /비교하면 달라지는 점/);
  assert.match(html, /더 커지는 비중/);
  assert.match(html, /줄어드는 비중/);
  assert.match(html, /새로 확인할 점/);
  assert.match(html, /주요 구성 종목/);
  assert.match(html, /삼성전자/);
  assert.match(html, /자체에 100% 직접 노출/);
  assert.match(html, /주요 구성 종목에 17\.60% 포함/);
  assert.match(html, /1년 수익률/);
  assert.match(html, /1년 수익률\(원화 환산\)/);
  assert.match(html, /\+34\.6% vs \+59\.2%/);
  assert.match(html, /숫자로 비교/);
  assert.match(html, /2026-07-15/);
  assert.match(html, /원화 수익률/);
  assert.match(html, /참고용 데이터입니다/);
  assert.doesNotMatch(html, /큐레이션 참고값/);
  assert.doesNotMatch(html, /이 목록은 매수 추천이 아니라/);
  assert.doesNotMatch(html, /ALTERNATIVE LANDSCAPE/);
  assert.doesNotMatch(html, /유사도 순위가 아니라 대체했을 때/);
  assert.doesNotMatch(html, /구성 종목·집중도·선택 종목 편입 비중을 기준으로/);
});

test("semiconductor profiles reuse the same rules for SK hynix and DB HiTek", async () => {
  const skResponse = await render("/stocks/sk-hynix");
  const dbResponse = await render("/stocks/db-hitek");
  assert.equal(skResponse.status, 200);
  assert.equal(dbResponse.status, 200);
  const skHtml = withoutReactMarkers(await skResponse.text());
  const dbHtml = withoutReactMarkers(await dbResponse.text());

  assert.match(skHtml, /HBM·DRAM·NAND 구성이 비슷하고, 시장과 위험 구조가 다릅니다/);
  assert.match(skHtml, /공통 제품 HBM · DRAM · NAND/);
  assert.match(skHtml, /함께 보는 변수 메모리 가격 · AI 인프라 투자 · 반도체 업황/);
  assert.doesNotMatch(skHtml, /HBM을 포함한 메모리 순수 노출을 글로벌 기준으로 비교합니다/);

  assert.match(dbHtml, /같은 사업 파운드리/);
  assert.match(dbHtml, /relation-structural-comparison/);
  assert.match(dbHtml, /첨단 공정·AI 가속기·AI 데이터센터에 더 집중하고, 성숙 공정·전력반도체·아날로그 비중은 줄어듭니다/);
  assert.match(dbHtml, /함께 보는 변수 파운드리 가동률/);
  assert.match(dbHtml, /사업 파운드리 → 메모리 제조/);
  assert.match(dbHtml, /겹치는 사업 파운드리/);
  assert.doesNotMatch(dbHtml, /파운드리라는 공통 사업을 첨단 공정 글로벌 리더와 비교합니다/);
});

test("curated ETF alternatives also appear in the direct comparison section", async () => {
  const response = await render("/stocks/alteogen");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /종목과 ETF 비교/);
  assert.match(html, /알테오젠[\s\S]*TIGER 200 헬스케어/);
});

test("restored KOSDAQ GLOBAL detail includes the complete comparison path", async () => {
  const response = await render("/stocks/alteogen");
  assert.equal(response.status, 200);
  const html = withoutReactMarkers(await response.text());

  assert.match(html, /알테오젠/);
  assert.match(html, /2025\.12 사업보고서 · KRX 주요 제품/);
  assert.match(html, /DART 원문/);
  assert.match(html, /사업이 비슷한 국내 기업/);
  assert.match(html, /지씨셀/);
  assert.match(html, /일라이 릴리/);
  assert.match(html, /TIGER 200 헬스케어/);
  assert.match(html, /종목과 ETF 비교/);
});

test("basic detail discloses global and ETF coverage gaps", async () => {
  const response = await render("/stocks/kr-278990");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /EMB/);
  assert.match(html, /글로벌 peer 규칙 연결/);
  assert.match(html, /규칙 미통과/);
  assert.match(html, /ETF 연결 필요/);
  assert.doesNotMatch(html, /국내외 peer와 관련 ETF까지 자동 연결됐습니다/);
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
  assert.equal(typeof payload.stale, "boolean");
  assert.ok(payload.assetCount >= 45);
  assert.equal(payload.fxAsOf, "2026-07-15");
  assert.equal(payload.provider, "수동 검수 큐레이션 참고값");
});

test("metadata ignores untrusted forwarded hosts", async () => {
  const response = await render("/", {
    "x-forwarded-host": "attacker.example",
    "x-forwarded-proto": "https",
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /attacker\.example/);
});
