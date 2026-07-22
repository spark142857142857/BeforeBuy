import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("use-cases", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

function render(pathname) {
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function htmlFor(pathname) {
  const response = await render(pathname);
  assert.equal(response.status, 200, `${pathname} should render successfully`);
  return response.text();
}

function withoutReactMarkers(html) {
  return html.replace(/<!--.*?-->/gs, "");
}

test("UC01 삼성전자: SK하이닉스가 첫 국내 peer이고 글로벌·ETF 대안을 제공한다", async () => {
  const html = await htmlFor("/stocks/samsung-electronics");
  const skHynix = html.indexOf("SK하이닉스");
  const micron = html.indexOf("마이크론");
  const dbHitek = html.indexOf("DB하이텍");
  const structuralComparison = html.indexOf("relation-structural-comparison");
  const nextDomesticPeer = html.indexOf("칩스앤미디어");
  const alternativeLandscape = html.indexOf("함께 볼 만한 종목과 ETF");
  const domesticSimilarity = html.indexOf("사업이 비슷한 국내 기업");

  assert.ok(skHynix >= 0, "SK하이닉스가 표시되어야 한다");
  assert.ok(micron >= 0 && skHynix < micron, "가장 가까운 국내 메모리 peer인 SK하이닉스가 마이크론보다 먼저 표시되어야 한다");
  assert.ok(dbHitek > structuralComparison, "DB하이텍은 메모리 직접 대안이 아니라 사업 구조 비교로 표시되어야 한다");
  assert.ok(nextDomesticPeer < 0 || skHynix < nextDomesticPeer, "SK하이닉스가 다른 국내 후보보다 먼저 표시되어야 한다");
  assert.ok(alternativeLandscape >= 0 && alternativeLandscape < domesticSimilarity, "정제된 비교 대안이 자동 국내 유사도보다 먼저 표시되어야 한다");
  assert.match(html, /비슷한 종목/);
  assert.match(html, /사업 구조 비교/);
  assert.match(html, /ETF로 넓게/);
  assert.match(html, /공통 제품 DRAM · NAND/);
  assert.match(html, /같은 사업 메모리 제조/);
  assert.match(html, /마이크론/);
  assert.doesNotMatch(html, /href="\/stocks\/tsmc"/);
  assert.match(html, /KODEX 반도체/);
  assert.match(html, /메모리·AI 반도체/);
  assert.match(html, /원화 수익률/);
});

test("UC09 반도체 공통 프로필: DB하이텍은 파운드리 역할과 공정 차이로 비교한다", async () => {
  const html = await htmlFor("/stocks/db-hitek");
  const refinedComparison = html.indexOf("함께 볼 만한 종목과 ETF");
  const broadSimilarity = html.indexOf("사업이 비슷한 국내 기업");

  assert.ok(refinedComparison >= 0 && refinedComparison < broadSimilarity);
  assert.match(html, /relation-structural-comparison/);
  assert.match(html, /TSMC/);
  assert.match(html, /같은 사업 파운드리/);
  assert.match(html, /첨단 공정/);
  assert.match(html, /성숙 공정/);
  assert.match(html, /전력반도체/);
  assert.match(html, /파운드리 가동률/);
  assert.match(html, /겹치는 사업 파운드리/);
});

test("UC02 LG에너지솔루션: 같은 배터리 셀 기업과 ETF 분산안을 연결한다", async () => {
  const html = await htmlFor("/stocks/lg-energy-solution");

  assert.match(html, /LG에너지솔루션/);
  assert.match(html, /삼성SDI/);
  assert.match(html, /배터리 셀 제조/);
  assert.match(html, /TIGER 2차전지테마/);
  assert.match(html, /종목과 ETF 비교/);
});

test("UC03 NAVER: 국내 플랫폼 peer와 미국 플랫폼·ETF를 함께 보여준다", async () => {
  const html = await htmlFor("/stocks/naver");

  assert.match(html, /카카오/);
  assert.match(html, /알파벳/);
  assert.match(html, /Invesco QQQ/);
  assert.match(html, /종목별로 다른 점/);
});

test("UC04 규칙 미통과 종목: 확보된 국내 비교와 글로벌·ETF 공백을 구분한다", async () => {
  const html = await htmlFor("/stocks/kr-278990");

  assert.match(html, /EMB/);
  assert.match(html, /비슷한 기업[\s\S]*5[\s\S]*개/);
  assert.match(html, /규칙 미통과/);
  assert.match(html, /ETF 연결 필요/);
  assert.doesNotMatch(html, /국내외 peer와 관련 ETF까지 자동 연결됐습니다/);
});

test("UC05 우선주: 보통주의 사업 프로필을 사용한다는 근거를 공개한다", async () => {
  const html = withoutReactMarkers(await htmlFor("/stocks/kr-005935"));

  assert.match(html, /삼성전자우/);
  assert.match(html, /우선주/);
  assert.match(html, /별도 사업을 운영하지 않아 삼성전자\(005930\)의 사업 프로필을 사용합니다/);
  assert.match(html, /SK하이닉스/);
});

test("UC06 스팩: 영업기업 유사도 대상에서 제외하고 이유를 설명한다", async () => {
  const html = await htmlFor("/stocks/kr-0134x0");

  assert.match(html, /스팩/);
  assert.match(html, /영업 사업이 없어 일반 기업 유사도에서 제외했습니다/);
  assert.doesNotMatch(html, /class="domestic-peer-block"/);
});

test("UC07 ETF: 주요 구성 종목·비중·기준일·공식 출처를 확인할 수 있다", async () => {
  const html = await htmlFor("/stocks/kodex-semiconductor");

  assert.match(html, /이 ETF에는 무엇이 들어 있나/);
  assert.match(html, /삼성전자/);
  assert.match(html, /SK하이닉스/);
  assert.match(html, /기준일/);
  assert.match(html, /표시 종목 비중 합계/);
  assert.match(html, /공식 자료에서 확인/);
});

test("UC08 검색: 종목명과 종목코드가 같은 상세 URL로 연결된다", async () => {
  const [byName, bySymbol] = await Promise.all([
    render("/api/stocks/search?q=삼성전자"),
    render("/api/stocks/search?q=005930"),
  ]);

  assert.equal(byName.status, 200);
  assert.equal(bySymbol.status, 200);
  const namePayload = await byName.json();
  const symbolPayload = await bySymbol.json();
  const nameResult = namePayload.results.find((stock) => stock.symbol === "005930");
  const symbolResult = symbolPayload.results.find((stock) => stock.symbol === "005930");

  assert.equal(nameResult?.slug, "samsung-electronics");
  assert.equal(symbolResult?.slug, "samsung-electronics");
});
