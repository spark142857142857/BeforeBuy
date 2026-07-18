"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Alternative, Asset } from "@/lib/data/catalog";
import { multiple, pct } from "@/lib/format";

type Related = Alternative & { asset: Asset };

function MarketBadge({ asset }: { asset: Asset }) {
  return <span className={`market-badge ${asset.market === "US" ? "global" : ""}`}>{asset.type === "etf" ? "ETF" : asset.market}</span>;
}

function MetricCell({ value, suffix = "" }: { value: string | number; suffix?: string }) {
  return <td>{value}{suffix}</td>;
}

export function ComparisonDashboard({ selected, alternatives, fxAsOf }: { selected: Asset; alternatives: Related[]; fxAsOf: string }) {
  const [active, setActive] = useState(() => alternatives.slice(0, 3).map((item) => item.slug));
  const compared = useMemo(() => [selected, ...alternatives.filter((item) => active.includes(item.slug)).map((item) => item.asset)], [selected, alternatives, active]);

  function toggle(slug: string) {
    setActive((current) => current.includes(slug)
      ? current.filter((item) => item !== slug)
      : current.length < 4 ? [...current, slug] : current,
    );
  }

  return (
    <>
      <section className="alternative-section">
        <div className="shell">
          <div className="section-heading">
            <div><p className="eyebrow">ALTERNATIVES</p><h2>같이 검토할 대안 {alternatives.length}개</h2></div>
            <p>최대 4개를 골라 아래 표에서 비교할 수 있습니다.</p>
          </div>
          <div className="alternative-grid">
            {alternatives.map((item) => {
              const isActive = active.includes(item.slug);
              return (
                <article className={`alternative-card ${isActive ? "selected" : ""}`} key={item.slug}>
                  <div className="alt-card-top">
                    <MarketBadge asset={item.asset} />
                    <button type="button" aria-pressed={isActive} onClick={() => toggle(item.slug)}>{isActive ? "비교 중 ✓" : "비교 추가"}</button>
                  </div>
                  <div className="alt-name"><h3>{item.asset.name}</h3><span>{item.asset.ticker}</span></div>
                  <p className="alt-reason">{item.reason}</p>
                  <div className="mini-metrics">
                    <span><small>1년</small><strong className={item.asset.metrics.return1y >= 0 ? "positive" : "negative"}>{pct(item.asset.metrics.return1y)}</strong></span>
                    <span><small>변동성</small><strong>{item.asset.metrics.volatility.toFixed(1)}%</strong></span>
                    <span><small>주주환원</small><strong>{item.asset.metrics.shareholderReturn.toFixed(1)}%</strong></span>
                  </div>
                  <Link href={`/stocks/${item.asset.slug}`}>자산 상세 보기 →</Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="comparison-section shell">
        <div className="section-heading">
          <div><p className="eyebrow">SIDE BY SIDE</p><h2>한눈에 비교하기</h2></div>
          <p className="fx-note">미국 자산 원화 수익률 환율 기준일 {fxAsOf}</p>
        </div>
        <div className="table-scroll">
          <table className="comparison-table">
            <thead><tr><th>비교 항목</th>{compared.map((item) => <th key={item.slug}><MarketBadge asset={item} />{item.name}</th>)}</tr></thead>
            <tbody>
              <tr><th>투자 성격</th>{compared.map((item) => <td className="profile-cell" key={item.slug}>{item.profile}</td>)}</tr>
              <tr><th>PER</th>{compared.map((item) => <MetricCell key={item.slug} value={multiple(item.metrics.per)} />)}</tr>
              <tr><th>PBR</th>{compared.map((item) => <MetricCell key={item.slug} value={multiple(item.metrics.pbr)} />)}</tr>
              <tr><th>매출 성장률</th>{compared.map((item) => <MetricCell key={item.slug} value={pct(item.metrics.revenueGrowth)} />)}</tr>
              <tr><th>주주환원율</th>{compared.map((item) => <MetricCell key={item.slug} value={item.metrics.shareholderReturn.toFixed(1)} suffix="%" />)}</tr>
              <tr><th>1년 수익률</th>{compared.map((item) => <td key={item.slug} className={item.metrics.return1y >= 0 ? "positive" : "negative"}>{pct(item.metrics.return1y)}</td>)}</tr>
              <tr className="krw-row"><th>1년 원화 수익률</th>{compared.map((item) => <td key={item.slug}>{item.market === "US" ? pct(item.metrics.return1yKrw ?? item.metrics.return1y) : "기준 통화와 동일"}</td>)}</tr>
              <tr><th>연환산 변동성</th>{compared.map((item) => <MetricCell key={item.slug} value={item.metrics.volatility.toFixed(1)} suffix="%" />)}</tr>
              <tr><th>최대 낙폭</th>{compared.map((item) => <td className="negative" key={item.slug}>{pct(item.metrics.maxDrawdown)}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <p className="data-provenance-note">
          밸류에이션·성과·위험 지표는 화면 구조 검증을 위한 큐레이션 참고값입니다. 실제 투자 판단 전 거래소·운용사·기업 공시의 최신 값을 확인하세요.
        </p>
      </section>

      <section className="difference-section">
        <div className="shell">
          <div className="section-heading"><div><p className="eyebrow">BEFORE YOU DECIDE</p><h2>공통점과 결정 전 차이</h2></div></div>
          <div className="difference-grid">
            {alternatives.filter((item) => active.includes(item.slug)).map((item) => (
              <article key={item.slug}>
                <div className="difference-title"><span>{item.asset.name.slice(0, 1)}</span><div><small>{selected.name} vs</small><h3>{item.asset.name}</h3></div></div>
                <div className="insight good"><b>공통점</b><p>{item.common}</p></div>
                <div className="insight caution"><b>확인할 차이</b><p>{item.difference}</p></div>
                <div className="risk-list"><b>{item.asset.name} 주요 위험</b><div>{item.asset.risks.map((risk) => <span key={risk}>{risk}</span>)}</div></div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
