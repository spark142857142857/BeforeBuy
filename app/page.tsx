import Link from "next/link";
import { SearchExplorer } from "@/components/SearchExplorer";
import { getKoreanStocks } from "@/lib/data/catalog";
import { getFeaturedStockResults, getKoreanStockCount, krxSnapshotMeta } from "@/lib/data/krx-master";

export default function Home() {
  const stocks = getKoreanStocks();
  const featured = getFeaturedStockResults();
  const stockCount = getKoreanStockCount();

  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="비포바이 홈">
          <span className="brand-mark">B</span>
          <span>BEFORE BUY</span>
        </Link>
        <div className="header-meta">
          <span className="live-dot" /> 종목 목록 {krxSnapshotMeta.asOf}
        </div>
      </header>

      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow">KOREAN STOCK COMPARISON</p>
          <h1>
            관심 종목과
            <br />다른 선택지를 비교해보세요
          </h1>
          <p className="hero-description">
            한국 종목을 검색하면 같은 사업 역할의 국내 기업과 관련 글로벌 기업·ETF를 함께 볼 수 있습니다.
          </p>
          <SearchExplorer featured={featured} />
          <div className="quick-links" aria-label="인기 검색">
            <span>바로 찾아보기</span>
            {stocks.slice(0, 4).map((stock) => (
              <Link key={stock.slug} href={`/stocks/${stock.slug}`}>
                {stock.name}
              </Link>
            ))}
          </div>
        </div>

        <aside className="hero-panel" aria-label="서비스 이용 순서">
          <div className="panel-kicker">HOW TO USE</div>
          <ol className="decision-steps">
            <li>
              <span>01</span>
              <div><strong>종목을 검색합니다</strong><p>한국 상장 종목 {stockCount.toLocaleString("ko-KR")}개</p></div>
            </li>
            <li>
              <span>02</span>
              <div><strong>같은 역할의 기업을 봅니다</strong><p>확인된 직접 비교를 먼저 표시</p></div>
            </li>
            <li>
              <span>03</span>
              <div><strong>글로벌·ETF까지 비교합니다</strong><p>사업 구조와 위험의 차이 확인</p></div>
            </li>
          </ol>
          <div className="panel-note">수익률보다 사업 구조와 차이를 먼저 확인해 보세요.</div>
        </aside>
      </section>

      <footer className="site-footer shell">
        <div className="brand"><span className="brand-mark">B</span><span>BEFORE BUY</span></div>
        <p>투자 권유가 아닌 정보 비교 서비스입니다. 데이터는 지연되거나 오류가 있을 수 있습니다.</p>
      </footer>
    </main>
  );
}
