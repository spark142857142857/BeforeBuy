import Link from "next/link";
import { IndustryMap } from "@/components/IndustryMap";
import { SearchExplorer } from "@/components/SearchExplorer";
import { getKoreanStocks, getSectorGroups, snapshotMeta } from "@/lib/data/catalog";

export default function Home() {
  const stocks = getKoreanStocks();
  const groups = getSectorGroups();

  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="비포바이 홈">
          <span className="brand-mark">B</span>
          <span>BEFORE BUY</span>
        </Link>
        <div className="header-meta">
          <span className="live-dot" /> 데이터 기준 {snapshotMeta.asOf}
        </div>
      </header>

      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow">BUY LESS BLINDLY</p>
          <h1>
            이 종목을 사기 전,
            <br />다른 선택지도 보셨나요?
          </h1>
          <p className="hero-description">
            관심 있는 한국 종목을 입력하면 사업이 닮은 국내외 기업과 ETF를
            찾아드립니다. 추천이 아니라, 비교할 근거를 제공합니다.
          </p>
          <SearchExplorer stocks={stocks} />
          <div className="quick-links" aria-label="인기 검색">
            <span>빠른 비교</span>
            {stocks.slice(0, 4).map((stock) => (
              <Link key={stock.slug} href={`/stocks/${stock.slug}`}>
                {stock.name}
              </Link>
            ))}
          </div>
        </div>

        <aside className="hero-panel" aria-label="서비스 이용 순서">
          <div className="panel-kicker">DECISION CHECK</div>
          <ol className="decision-steps">
            <li>
              <span>01</span>
              <div><strong>관심 종목을 고릅니다</strong><p>한국 대표 종목 {stocks.length}개 지원</p></div>
            </li>
            <li>
              <span>02</span>
              <div><strong>대안을 펼쳐봅니다</strong><p>국내외 peer와 관련 ETF</p></div>
            </li>
            <li>
              <span>03</span>
              <div><strong>차이를 확인합니다</strong><p>사업·투자 특성·리스크 비교</p></div>
            </li>
          </ol>
          <div className="panel-note">매수 신호를 제공하지 않습니다. 판단의 시야를 넓히는 도구입니다.</div>
        </aside>
      </section>

      <section className="map-section" id="industry-map">
        <div className="shell">
          <div className="section-heading">
            <div>
              <p className="eyebrow">INDUSTRY MAP</p>
              <h2>산업에서 시작해도 됩니다</h2>
            </div>
            <p>섹터 → 세부 산업 → 기업·ETF 순서로 관계를 따라가세요.</p>
          </div>
          <IndustryMap groups={groups} />
        </div>
      </section>

      <section className="principles shell">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">OUR PRINCIPLES</p>
            <h2>설명할 수 있는 대안만</h2>
          </div>
        </div>
        <div className="principle-grid">
          <article><span>01</span><h3>사업을 먼저 봅니다</h3><p>주가가 같이 움직였다는 이유만으로 유사 종목이라 부르지 않습니다.</p></article>
          <article><span>02</span><h3>수익률은 맥락입니다</h3><p>성과는 보조 지표입니다. 성장성·환원·위험과 함께 읽습니다.</p></article>
          <article><span>03</span><h3>추천 이유를 남깁니다</h3><p>모든 대안에 공통점과 결정 전 확인할 차이를 명시합니다.</p></article>
        </div>
      </section>

      <footer className="site-footer shell">
        <div className="brand"><span className="brand-mark">B</span><span>BEFORE BUY</span></div>
        <p>투자 권유가 아닌 정보 비교 서비스입니다. 데이터는 지연되거나 오류가 있을 수 있습니다.</p>
      </footer>
    </main>
  );
}
