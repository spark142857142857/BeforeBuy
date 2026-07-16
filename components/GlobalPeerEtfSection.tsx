import Link from "next/link";
import { getEtfHoldings, getGlobalStockInsight } from "@/lib/data/global-insights";

function HoldingsPreview({ slug }: { slug: string }) {
  const snapshot = getEtfHoldings(slug);
  if (!snapshot) return null;
  return (
    <div className="holding-preview">
      <small>주요 구성 종목 · {snapshot.asOf}</small>
      <div>
        {snapshot.holdings.slice(0, 3).map((holding) => (
          <span key={`${holding.ticker}-${holding.name}`}>
            {holding.name}{holding.weight !== undefined ? ` ${holding.weight.toFixed(1)}%` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export function GlobalPeerEtfSection({ symbol }: { symbol: string }) {
  const insight = getGlobalStockInsight(symbol);
  if (!insight.matches.length) return null;

  return (
    <section className="global-link-section">
      <div className="shell">
        <div className="section-heading">
          <div>
            <p className="eyebrow">GLOBAL PEERS & ETF</p>
            <h2>국내외 대안으로 범위 넓히기</h2>
          </div>
          <p>연간 사업 내용과 업종·제품 규칙이 충분히 일치할 때만 후보를 연결합니다.</p>
        </div>

        <div className="theme-evidence-grid">
          {insight.matches.map((match) => (
            <article key={match.id}>
              <div><strong>{match.label}</strong><span>규칙 점수 {match.score}</span></div>
              <p>{match.reason}</p>
              <div className="matched-term-row">
                {match.matchedTerms.map((term) => <span key={term}>{term}</span>)}
              </div>
            </article>
          ))}
        </div>

        {insight.peers.length > 0 && (
          <div className="global-asset-block">
            <div className="global-block-heading">
              <strong>글로벌 peer</strong>
              <small>동일 기업이 아니라 사업 노출과 수익 구조의 차이를 확인하는 비교군입니다.</small>
            </div>
            <div className="global-peer-grid">
              {insight.peers.map(({ asset, reason, themeLabel }) => (
                <article key={asset.slug}>
                  <div className="global-card-meta"><span>{asset.market}</span><small>{themeLabel}</small></div>
                  <h3>{asset.name}</h3>
                  <p className="peer-symbol">{asset.ticker} · {asset.industry}</p>
                  <p>{reason}</p>
                  <div className="exposure-mini-row">
                    {asset.exposures.slice(0, 3).map((item) => <span key={item}>{item}</span>)}
                  </div>
                  <Link href={`/stocks/${asset.slug}`}>상세 비교 보기 →</Link>
                </article>
              ))}
            </div>
          </div>
        )}

        {insight.etfs.length > 0 && (
          <div className="global-asset-block">
            <div className="global-block-heading">
              <strong>관련 ETF</strong>
              <small>아래 구성 종목은 전체 포트폴리오가 아닌 운용사 자료의 주요 편입 종목입니다.</small>
            </div>
            <div className="related-etf-grid">
              {insight.etfs.map(({ asset, reason, themeLabel }) => (
                <article key={asset.slug}>
                  <div className="global-card-meta"><span>ETF · {asset.market}</span><small>{themeLabel}</small></div>
                  <h3>{asset.name}</h3>
                  <p className="peer-symbol">{asset.ticker} · {asset.industry}</p>
                  <p>{reason}</p>
                  <HoldingsPreview slug={asset.slug} />
                  <Link href={`/stocks/${asset.slug}`}>ETF 구성 자세히 보기 →</Link>
                </article>
              ))}
            </div>
          </div>
        )}

        <p className="global-method-note">
          LLM 미사용 · KRX 업종/제품 + DART 연간 사업보고서 규칙 매칭 · 생성일 {insight.asOf}
        </p>
      </div>
    </section>
  );
}
