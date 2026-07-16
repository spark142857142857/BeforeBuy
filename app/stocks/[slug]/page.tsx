import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ComparisonDashboard } from "./ComparisonDashboard";
import { assets, getAlternatives, getAsset, snapshotMeta } from "@/lib/data/catalog";

export function generateStaticParams() {
  return assets.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = getAsset(slug);
  return item ? {
    title: `${item.name} 대안 비교`,
    description: `${item.name}와 사업이 닮은 국내외 기업·ETF의 차이를 비교합니다.`,
  } : {};
}

export default async function StockDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const selected = getAsset(slug);
  if (!selected) notFound();
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
