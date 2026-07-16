import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ComparisonDashboard } from "./ComparisonDashboard";
import { assets, getAlternatives, getAsset, snapshotMeta } from "@/lib/data/catalog";
import { getKoreanStockMaster, krxSnapshotMeta, type KoreanStockMasterRecord } from "@/lib/data/krx-master";

export function generateStaticParams() {
  return assets.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = getAsset(slug);
  if (item) {
    return {
      title: `${item.name} 대안 비교`,
      description: `${item.name}와 사업이 닮은 국내외 기업·ETF의 차이를 비교합니다.`,
    };
  }
  const master = getKoreanStockMaster(slug);
  return master ? {
    title: `${master.name} 종목 정보`,
    description: `${master.name}의 기본 정보와 향후 비교 데이터 연결 상태를 확인합니다.`,
  } : {};
}

export default async function StockDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const selected = getAsset(slug);
  if (!selected) {
    const master = getKoreanStockMaster(slug);
    if (!master) notFound();
    return <BasicStockDetail stock={master} />;
  }
  const peers = getAlternatives(slug);

  return (
    <main className="detail-page">
      <header className="site-header detail-header">
        <Link className="brand" href="/">
          <span className="brand-mark">B</span><span>BEFORE BUY</span>
        </Link>
        <nav>
          <Link href="/#industry-map">산업 맵</Link>
          <Link href="/">다른 종목 찾기</Link>
        </nav>
      </header>

      <section className="asset-hero shell">
        <div className="breadcrumb"><Link href="/">홈</Link><span>/</span><span>{selected.sector}</span><span>/</span><strong>{selected.name}</strong></div>
        <div className="asset-title-row">
          <div>
            <div className="asset-badges"><span>{selected.market}</span><span>{selected.type === "etf" ? "ETF" : selected.ticker}</span><span>{selected.industry}</span></div>
            <h1>{selected.name}</h1>
            <p className="asset-name-en">{selected.nameEn}</p>
          </div>
          <div className="snapshot-card">
            <span className="live-dot" />
            <div><strong>데이터 정상</strong><small>{snapshotMeta.asOf} 종가 기준</small></div>
          </div>
        </div>
        <p className="asset-summary">{selected.summary}</p>
        <div className="exposure-row">
          {selected.exposures.map((item) => <span key={item}>{item}</span>)}
        </div>
      </section>

      {peers.length ? (
        <ComparisonDashboard selected={selected} alternatives={peers} fxAsOf={snapshotMeta.fxAsOf} />
      ) : (
        <section className="shell no-peer-panel">
          <p className="eyebrow">REFERENCE ASSET</p>
          <h2>이 자산은 비교 후보로 등록되어 있습니다</h2>
          <p>한국 종목을 검색하면 이 자산이 어떤 투자 대안으로 연결되는지 확인할 수 있습니다.</p>
          <Link className="primary-link" href="/">한국 종목 검색하기 →</Link>
        </section>
      )}

      <footer className="site-footer shell">
        <div className="brand"><span className="brand-mark">B</span><span>BEFORE BUY</span></div>
        <p>투자 권유가 아닌 정보 비교 서비스입니다. 지표는 최근 저장된 일별 스냅샷입니다.</p>
      </footer>
    </main>
  );
}

function formatMarketCap(value: number) {
  if (!value) return "수집 전";
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}조원`;
  return `${Math.round(value / 100_000_000).toLocaleString("ko-KR")}억원`;
}

function securityTypeLabel(type: KoreanStockMasterRecord["securityType"]) {
  return { common: "보통주", preferred: "우선주", reit: "리츠", spac: "스팩" }[type];
}

function BasicStockDetail({ stock }: { stock: KoreanStockMasterRecord }) {
  return (
    <main className="detail-page">
      <header className="site-header detail-header">
        <Link className="brand" href="/">
          <span className="brand-mark">B</span><span>BEFORE BUY</span>
        </Link>
        <nav><Link href="/">다른 종목 찾기</Link></nav>
      </header>

      <section className="asset-hero shell basic-asset-hero">
        <div className="breadcrumb"><Link href="/">홈</Link><span>/</span><span>{stock.market}</span><span>/</span><strong>{stock.name}</strong></div>
        <div className="asset-title-row">
          <div>
            <div className="asset-badges">
              <span>{stock.market}</span><span>{stock.symbol}</span><span>{securityTypeLabel(stock.securityType)}</span>
            </div>
            <h1>{stock.name}</h1>
            <p className="asset-name-en">{stock.isin || "KRX listed security"}</p>
          </div>
          <div className="snapshot-card">
            <span className="live-dot" />
            <div><strong>전체 검색 연결 완료</strong><small>{krxSnapshotMeta.asOf} 목록 기준</small></div>
          </div>
        </div>

        <div className="master-metric-grid">
          <article><small>시장</small><strong>{stock.market}</strong></article>
          <article><small>시가총액</small><strong>{formatMarketCap(stock.marketCap)}</strong></article>
          <article><small>발행주식수</small><strong>{stock.sharesOutstanding ? stock.sharesOutstanding.toLocaleString("ko-KR") : "수집 전"}</strong></article>
          <article><small>종목 유형</small><strong>{securityTypeLabel(stock.securityType)}</strong></article>
        </div>

        <div className="pipeline-status">
          <p className="eyebrow">DATA PIPELINE STATUS</p>
          <h2>종목 검색은 연결됐고, 사업 비교 데이터는 다음 단계입니다</h2>
          <p>
            현재 KRX 종목 마스터 정보까지 제공됩니다. 다음 단계에서 DART 사업 내용을 연결한 뒤
            업종과 사업 설명을 기반으로 유사 종목 점수를 계산합니다.
          </p>
          <ol>
            <li className="done"><span>01</span><strong>한국 상장 종목 검색</strong><small>완료</small></li>
            <li><span>02</span><strong>DART 사업 내용 수집</strong><small>다음 작업</small></li>
            <li><span>03</span><strong>유사 종목·ETF 비교</strong><small>준비 중</small></li>
          </ol>
        </div>
      </section>

      <footer className="site-footer shell">
        <div className="brand"><span className="brand-mark">B</span><span>BEFORE BUY</span></div>
        <p>투자 권유가 아닌 정보 비교 서비스입니다. 종목 목록은 로컬 배치 스냅샷을 사용합니다.</p>
      </footer>
    </main>
  );
}
