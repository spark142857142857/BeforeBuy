import Link from "next/link";
import { getDomesticStockInsight } from "@/lib/data/stock-insights";
import { getKoreanStockBySymbol } from "@/lib/data/krx-master";

function unavailableMessage(category: "spac" | "fund" | "limited") {
  if (category === "spac") return "스팩은 영업 사업이 없어 일반 기업 유사도에서 제외했습니다.";
  if (category === "fund") return "인프라·부동산 펀드는 일반 기업과 분리해 ETF 비교 단계에서 다룹니다.";
  return "아직 연간 사업보고서가 없어 KRX 업종과 주요 제품 정보만 제공합니다.";
}

function score(value: number) {
  return (value * 100).toFixed(1);
}

export function DomesticPeerSection({ symbol }: { symbol: string }) {
  const insight = getDomesticStockInsight(symbol);
  const businessStock = getKoreanStockBySymbol(insight.businessSymbol);

  return (
    <section className="domestic-insight-section">
      <div className="shell">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ANNUAL BUSINESS PROFILE</p>
            <h2>연간 사업보고서 기반 국내 비교</h2>
          </div>
          <p>LLM 없이 사업 본문·다중 사업 노출·주요 제품·기업 규모를 로컬에서 계산했습니다.</p>
        </div>

        {insight.isAlias && businessStock && (
          <div className="insight-notice">
            우선주는 별도 사업을 운영하지 않아 {businessStock.name}({businessStock.symbol})의 사업 프로필을 사용합니다.
          </div>
        )}

        {insight.profile ? (
          <div className="business-profile-card">
            <div className="business-profile-meta">
              <span>사업 기준 {insight.profile.reportPeriod}</span>
              <span>접수일 {insight.profile.receiptDate}</span>
              <span className={insight.profile.textConfidence === "low" ? "confidence-low" : ""}>
                텍스트 신뢰도 {insight.profile.textConfidence === "low" ? "낮음" : "보통"}
              </span>
              <a href={insight.profile.sourceUrl} target="_blank" rel="noreferrer">DART 원문 ↗</a>
            </div>
            <p className="business-excerpt">{insight.profile.excerpt}</p>
          </div>
        ) : insight.unavailable ? (
          <div className="insight-notice caution">
            {unavailableMessage(insight.unavailable.category)}
          </div>
        ) : (
          <div className="insight-notice caution">연결 가능한 연간 사업 프로필이 없습니다.</div>
        )}

        {insight.peers.length > 0 && (
          <div className="domestic-peer-block">
            <div className="domestic-peer-heading">
              <div><strong>자동 국내 유사 종목</strong><span>상위 {insight.peers.length}개</span></div>
              <small>점수는 투자 매력도가 아니라 사업 유사도를 의미합니다.</small>
            </div>
            <div className="domestic-peer-grid">
              {insight.peers.map((peer) => (
                <article key={peer.symbol}>
                  <div className="peer-card-top">
                    <span>{peer.stock.market}</span>
                    <strong>{score(peer.score)}</strong>
                  </div>
                  <h3>{peer.stock.name}</h3>
                  <p className="peer-symbol">{peer.symbol} · {peer.stock.industry || "업종 정보 없음"}</p>
                  <p className="peer-reason">{peer.reason}</p>
                  {peer.confidence === "low" && (
                    <p className="peer-confidence-low">비교 근거 제한적 · 추가 확인 필요</p>
                  )}
                  <div className="peer-score-row">
                    <span>본문 {score(peer.textSimilarity)}</span>
                    <span>사업 노출 {score(peer.exposureSimilarity)}</span>
                    <span>제품 {score(peer.productSimilarity)}</span>
                    <span>규모 {score(peer.scaleSimilarity)}</span>
                  </div>
                  <Link href={`/stocks/${peer.slug}`}>상세 보기 →</Link>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
