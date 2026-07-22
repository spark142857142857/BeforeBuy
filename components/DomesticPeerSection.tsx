import Link from "next/link";
import { getDomesticStockInsight } from "@/lib/data/stock-insights";
import { getKoreanStockBySymbol } from "@/lib/data/krx-master";

function unavailableMessage(category: "spac" | "fund" | "limited" | "collection_error") {
  if (category === "spac") return "스팩은 영업 사업이 없어 일반 기업 유사도에서 제외했습니다.";
  if (category === "fund") return "인프라·부동산 펀드는 일반 기업과 분리해 ETF 비교 단계에서 다룹니다.";
  if (category === "collection_error") return "최근 수집에서 연간 사업 내용을 확인하지 못했습니다. 다음 배치에서 다시 시도합니다.";
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
            <h2>사업이 비슷한 국내 기업</h2>
          </div>
        </div>

        {insight.isAlias && businessStock && (
          <div className="insight-notice">
            우선주는 별도 사업을 운영하지 않아 {businessStock.name}({businessStock.symbol})의 사업 프로필을 사용합니다.
          </div>
        )}

        {insight.profile ? (
          <div className="peer-source-strip">
            <div>
              <small>사용한 데이터</small>
              <strong>{insight.profile.reportPeriod} 사업보고서 · KRX 주요 제품</strong>
            </div>
            <div className="peer-source-meta">
              <span>접수 {insight.profile.receiptDate}</span>
              <span className={insight.profile.textConfidence === "low" ? "confidence-low" : ""}>
                텍스트 신뢰도 {insight.profile.textConfidence === "low" ? "낮음" : "보통"}
              </span>
              {insight.profile.refreshWarning && (
                <span className="confidence-low">
                  최근 갱신 실패 · {insight.profile.refreshWarning.attemptedAt} 정상본 유지
                </span>
              )}
              <a href={insight.profile.sourceUrl} target="_blank" rel="noreferrer">DART 원문 ↗</a>
            </div>
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
              <div><strong>비슷한 기업 {insight.peers.length}개</strong></div>
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
