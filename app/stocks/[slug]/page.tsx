import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ComparisonDashboard } from "./ComparisonDashboard";
import { DetailFooter, DetailHeader } from "@/components/DetailChrome";
import { DomesticPeerSection } from "@/components/DomesticPeerSection";
import { EtfHoldingsSection } from "@/components/EtfHoldingsSection";
import { GlobalPeerEtfSection } from "@/components/GlobalPeerEtfSection";
import { StockEtfComparisonSection } from "@/components/StockEtfComparisonSection";
import { assets, getAlternatives, getAsset, snapshotMeta } from "@/lib/data/catalog";
import { getGlobalStockInsight } from "@/lib/data/global-insights";
import { getKoreanStockMaster, krxSnapshotMeta, type KoreanStockMasterRecord } from "@/lib/data/krx-master";
import { getDomesticStockInsight } from "@/lib/data/stock-insights";

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
      <DetailHeader showIndustryMap />

      <section className="asset-hero shell">
        <div className="breadcrumb"><Link href="/">홈</Link><span>/</span><span>{selected.sector}</span><span>/</span><strong>{selected.name}</strong></div>
        <div className="asset-title-row">
          <div>
            <div className="asset-badges"><span>{selected.market}</span><span>{selected.type === "etf" ? "ETF" : selected.ticker}</span><span>{selected.industry}</span></div>
            <h1>{selected.name}</h1>
            <p className="asset-name-en">{selected.nameEn}</p>
          </div>
          <div className="snapshot-card">
            <span className="reference-dot" />
            <div><strong>데이터 기준</strong><small>{snapshotMeta.asOf}</small></div>
          </div>
        </div>
        <p className="asset-summary">{selected.summary}</p>
        <div className="exposure-row">
          {selected.exposures.map((item) => <span key={item}>{item}</span>)}
        </div>
      </section>

      {selected.type === "etf" && <EtfHoldingsSection slug={selected.slug} />}

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

      {selected.market === "KR" && selected.type === "stock" && (
        <StockEtfComparisonSection symbol={selected.ticker} compact />
      )}

      {selected.market === "KR" && selected.type === "stock" && (
        <DomesticPeerSection symbol={selected.ticker} />
      )}

      <DetailFooter>비교를 돕기 위한 참고 정보입니다.</DetailFooter>
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
  const domesticInsight = getDomesticStockInsight(stock.symbol);
  const globalInsight = getGlobalStockInsight(stock.symbol);
  const hasBusinessProfile = Boolean(domesticInsight.profile);
  const hasDomesticPeers = domesticInsight.peers.length > 0;
  const hasGlobalPeers = globalInsight.peers.length > 0;
  const hasEtfs = globalInsight.etfs.length > 0;
  const hasExpandedAlternatives = hasGlobalPeers || hasEtfs;
  const steps = [
    { number: "01", label: "한국 상장 종목 검색", state: "done", note: "완료" },
    {
      number: "02",
      label: "DART 연간 사업 내용",
      state: hasBusinessProfile ? "done" : "limited",
      note: hasBusinessProfile ? "완료" : domesticInsight.unavailable ? "대상 제외·자료 없음" : "연결 없음",
    },
    {
      number: "03",
      label: "자동 국내 유사 종목",
      state: hasDomesticPeers ? "done" : "limited",
      note: hasDomesticPeers ? `${domesticInsight.peers.length}개 연결` : "후보 없음",
    },
    {
      number: "04",
      label: "글로벌 peer 규칙 연결",
      state: hasGlobalPeers ? "done" : "limited",
      note: hasGlobalPeers ? `${globalInsight.peers.length}개 연결` : "규칙 미통과",
    },
    {
      number: "05",
      label: "관련 ETF·구성 종목",
      state: hasEtfs ? "done" : "limited",
      note: hasEtfs ? `${globalInsight.etfs.length}개 연결` : "연결 없음",
    },
    {
      number: "06",
      label: "개별 종목 vs ETF",
      state: hasEtfs ? "done" : "limited",
      note: hasEtfs ? "비교 가능" : "ETF 연결 필요",
    },
  ];

  return (
    <main className="detail-page">
      <DetailHeader />

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
            <div><strong>종목 목록 연결</strong><small>{krxSnapshotMeta.asOf} 목록 기준</small></div>
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
          <h2>{hasDomesticPeers && hasExpandedAlternatives
            ? "국내외 비교 후보가 연결됐습니다"
            : "연결된 데이터 범위를 구분해 표시합니다"}</h2>
          <p>
            최신 연간 사업보고서와 KRX 업종·주요 제품으로 국내 유사 종목을 계산하고,
            설명 가능한 테마 규칙으로 글로벌 peer와 ETF 후보를 연결합니다.
          </p>
          <ol>
            {steps.map((step) => (
              <li className={step.state} key={step.number}>
                <span>{step.number}</span><strong>{step.label}</strong><small>{step.note}</small>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <DomesticPeerSection symbol={stock.symbol} />
      <GlobalPeerEtfSection symbol={stock.symbol} />
      <StockEtfComparisonSection symbol={stock.symbol} />

      <DetailFooter>투자 권유가 아닌 정보 비교 서비스입니다. 종목 목록은 로컬 배치 스냅샷을 사용합니다.</DetailFooter>
    </main>
  );
}
