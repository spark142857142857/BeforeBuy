import Link from "next/link";
import { getAssetByTicker, type Asset } from "@/lib/data/catalog";
import { getEtfHoldings, getGlobalStockInsight } from "@/lib/data/global-insights";
import { getKoreanStockBySymbol } from "@/lib/data/krx-master";
import { pct } from "@/lib/format";

function productExposures(products: string, industry: string) {
  const items = products
    .split(/[,/]/)
    .map((item) => item.replace(/\([^)]*\)/g, "").trim())
    .filter((item) => item && item !== "-");
  return Array.from(new Set(items)).slice(0, 3).length
    ? Array.from(new Set(items)).slice(0, 3)
    : [industry || "사업 정보 확인 필요"];
}

function companyRisks(asset: Asset | undefined, industry: string) {
  return asset?.risks.slice(0, 3) ?? [
    "단일 기업 실적과 경영 판단",
    "공시·제품·고객사 이벤트",
    `${industry || "해당"} 업황 변동`,
  ];
}

function inclusionText(symbol: string, slug: string) {
  const snapshot = getEtfHoldings(slug);
  if (!snapshot) return "구성 자료 확인 필요";
  const holding = snapshot.holdings.find((item) => item.ticker === symbol);
  if (!holding) return `표시된 주요 ${snapshot.holdings.length}개에는 없음`;
  return holding.weight !== undefined
    ? `주요 구성 종목에 ${holding.weight.toFixed(2)}% 포함`
    : "대표 구성 종목에 포함";
}

function concentrationText(slug: string) {
  const snapshot = getEtfHoldings(slug);
  if (!snapshot) return "구성 자료 확인 필요";
  const weights = snapshot.holdings.map((item) => item.weight);
  if (weights.every((weight) => weight !== undefined)) {
    const sum = weights.reduce<number>((total, weight) => total + (weight ?? 0), 0);
    return `표시 상위 ${snapshot.holdings.length}개 합계 ${sum.toFixed(1)}%`;
  }
  return `대표 ${snapshot.holdings.length}개 공개 · 비중은 원문 확인`;
}

function MetricComparison({ stock, etf }: { stock: Asset; etf: Asset }) {
  return (
    <div className="stock-etf-metrics">
      <span><small>1년 수익률</small><strong>{pct(stock.metrics.return1y)} vs {pct(etf.metrics.return1y)}</strong></span>
      <span><small>연환산 변동성</small><strong>{stock.metrics.volatility.toFixed(1)}% vs {etf.metrics.volatility.toFixed(1)}%</strong></span>
      <span><small>최대 낙폭</small><strong>{pct(stock.metrics.maxDrawdown)} vs {pct(etf.metrics.maxDrawdown)}</strong></span>
    </div>
  );
}

export function StockEtfComparisonSection({ symbol, compact = false }: { symbol: string; compact?: boolean }) {
  const stock = getKoreanStockBySymbol(symbol);
  const insight = getGlobalStockInsight(symbol);
  if (!stock || !insight.etfs.length) return null;

  const selectedAsset = getAssetByTicker(symbol, "KR");
  const exposures = selectedAsset?.exposures ?? productExposures(stock.products, stock.industry);
  const risks = companyRisks(selectedAsset, stock.industry);

  return (
    <section className={`stock-etf-comparison-section ${compact ? "compact" : ""}`}>
      <div className="shell">
        <div className="section-heading">
          <div>
            <p className="eyebrow">STOCK VS ETF</p>
            <h2>개별 종목과 ETF 직접 비교</h2>
          </div>
          <p>구성 종목·집중도·선택 종목 편입 비중을 기준으로 구조적 차이를 확인합니다.</p>
        </div>

        {compact ? (
          <details className="stock-etf-disclosure">
            <summary>
              <span>관련 ETF {insight.etfs.length}개</span>
              <strong>{insight.etfs.map(({ asset }) => asset.name).join(" · ")}</strong>
              <small>구성·집중도·편입 비중 비교 펼치기</small>
            </summary>
            <div className="stock-etf-compare-stack">
              {renderEtfCards()}
            </div>
          </details>
        ) : (
          <div className="stock-etf-compare-stack">
            {renderEtfCards()}
          </div>
        )}
      </div>
    </section>
  );

  function renderEtfCards() {
    return insight.etfs.map(({ asset: etf, themeLabel }) => {
      const holdings = getEtfHoldings(etf.slug);
      return (
        <article className="stock-etf-card" key={etf.slug}>
          <div className="stock-etf-card-heading">
            <div>
              <span>{themeLabel}</span>
              <h3>{stock.name} <i>vs</i> {etf.name}</h3>
            </div>
            <Link href={`/stocks/${etf.slug}`}>ETF 상세 →</Link>
          </div>

          <div className="stock-etf-table">
            <div className="stock-etf-row header">
              <strong>비교 항목</strong><strong>{stock.name}</strong><strong>{etf.name}</strong>
            </div>
            <div className="stock-etf-row">
              <b>투자 단위</b>
              <p>상장 기업 1개</p>
              <p>{holdings?.totalHoldings ? `전체 ${holdings.totalHoldings}개 구성` : "복수 기업 바스켓"}</p>
            </div>
            <div className="stock-etf-row">
              <b>핵심 노출</b>
              <div className="comparison-chip-row">{exposures.map((item) => <span key={item}>{item}</span>)}</div>
              <div className="comparison-chip-row">{etf.exposures.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
            <div className="stock-etf-row">
              <b>선택 종목 편입</b>
              <p>{stock.name} 자체에 100% 직접 노출</p>
              <p>{inclusionText(symbol, etf.slug)}</p>
            </div>
            <div className="stock-etf-row">
              <b>집중도</b>
              <p>단일 기업 위험 100%</p>
              <p>{concentrationText(etf.slug)}</p>
            </div>
            <div className="stock-etf-row">
              <b>추가 확인 위험</b>
              <div className="comparison-risk-row">{risks.map((risk) => <span key={risk}>{risk}</span>)}</div>
              <div className="comparison-risk-row">
                {etf.risks.slice(0, 3).map((risk) => <span key={risk}>{risk}</span>)}
                {etf.market === "US" && <span>원/달러 환율</span>}
              </div>
            </div>
          </div>

          {selectedAsset && <MetricComparison stock={selectedAsset} etf={etf} />}

          <div className="stock-etf-decision">
            <p><b>{stock.name} 쪽을 더 볼 때</b> 기업의 제품 경쟁력·고객·실적 변화를 직접 분석하고 싶은 경우</p>
            <p><b>{etf.name} 쪽을 더 볼 때</b> 개별 기업보다 {themeLabel} 산업의 장기 방향에 투자하고 싶은 경우</p>
          </div>

          {holdings && (
            <small className="stock-etf-source">
              ETF 구성 기준 {holdings.asOf} · 표시 구성은 전체 포트폴리오의 일부입니다.
            </small>
          )}
        </article>
      );
    });
  }
}
