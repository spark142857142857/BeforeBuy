import { getEtfHoldings } from "@/lib/data/global-insights";

export function EtfHoldingsSection({ slug }: { slug: string }) {
  const snapshot = getEtfHoldings(slug);
  if (!snapshot) return null;
  const weightSum = snapshot.holdings.reduce((sum, holding) => sum + (holding.weight ?? 0), 0);
  const weightedCount = snapshot.holdings.filter((holding) => holding.weight !== undefined).length;

  return (
    <section className="etf-holdings-section">
      <div className="shell">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ETF HOLDINGS</p>
            <h2>이 ETF에는 무엇이 들어 있나</h2>
          </div>
          <p>운용사 자료에서 확인한 주요 구성 종목만 표시하며 실제 편입 비중은 계속 변할 수 있습니다.</p>
        </div>

        <div className="holding-summary-row">
          <span>기준일 <strong>{snapshot.asOf}</strong></span>
          <span>표시 범위 <strong>상위·대표 {snapshot.holdings.length}개</strong></span>
          {snapshot.totalHoldings && <span>전체 구성 <strong>{snapshot.totalHoldings}개</strong></span>}
          {weightedCount === snapshot.holdings.length && (
            <span>표시 종목 비중 합계 <strong>{weightSum.toFixed(1)}%</strong></span>
          )}
        </div>

        <div className="holding-list">
          {snapshot.holdings.map((holding, index) => (
            <article key={`${holding.ticker}-${holding.name}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{holding.name}</strong><small>{holding.ticker}</small></div>
              <b>{holding.weight !== undefined ? `${holding.weight.toFixed(2)}%` : "비중 변동"}</b>
            </article>
          ))}
        </div>

        <a className="holding-source" href={snapshot.sourceUrl} target="_blank" rel="noreferrer">
          {snapshot.sourceName} 공식 자료에서 확인 ↗
        </a>
      </div>
    </section>
  );
}
