"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Alternative, Asset } from "@/lib/data/catalog";
import { multiple, pct } from "@/lib/format";

type Related = Alternative & { asset: Asset };
type RelationType = NonNullable<Alternative["relationType"]>;

const relationOrder: RelationType[] = ["direct", "structural-comparison", "exposure-shift", "diversified"];
const relationMeta: Record<RelationType, { label: string }> = {
  direct: { label: "비슷한 종목" },
  "structural-comparison": { label: "사업 구조 비교" },
  "exposure-shift": { label: "다른 사업에 집중" },
  diversified: { label: "ETF로 넓게" },
};

function MarketBadge({ asset }: { asset: Asset }) {
  return <span className={`market-badge ${asset.market === "US" ? "global" : ""}`}>{asset.type === "etf" ? "ETF" : asset.market}</span>;
}

function MetricCell({ value, suffix = "" }: { value: string | number; suffix?: string }) {
  return <td>{value}{suffix}</td>;
}

function PickerButton({
  active,
  limitReached,
  onClick,
}: {
  active: boolean;
  limitReached: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={!active && limitReached}
      onClick={onClick}
    >
      {active ? "비교 중 ✓" : limitReached ? "최대 4개" : "비교 추가"}
    </button>
  );
}

function LegacyAlternatives({
  alternatives,
  active,
  toggle,
}: {
  alternatives: Related[];
  active: string[];
  toggle: (slug: string) => void;
}) {
  return (
    <section className="alternative-section">
      <div className="shell">
        <div className="section-heading">
          <div><h2>함께 볼 만한 종목과 ETF</h2></div>
        </div>
        <div className="alternative-grid">
          {alternatives.map((item) => {
            const isActive = active.includes(item.slug);
            const limitReached = active.length >= 4;
            return (
              <article className={`alternative-card ${isActive ? "selected" : ""}`} key={item.slug}>
                <div className="alt-card-top">
                  <MarketBadge asset={item.asset} />
                  <PickerButton active={isActive} limitReached={limitReached} onClick={() => toggle(item.slug)} />
                </div>
                <div className="alt-name"><h3>{item.asset.name}</h3><span>{item.asset.ticker}</span></div>
                <p className="alt-reason">{item.reason}</p>
                <div className="mini-metrics">
                  <span><small>1년</small><strong className={item.asset.metrics.return1y >= 0 ? "positive" : "negative"}>{pct(item.asset.metrics.return1y)}</strong></span>
                  <span><small>변동성</small><strong>{item.asset.metrics.volatility.toFixed(1)}%</strong></span>
                  <span><small>주주환원</small><strong>{item.asset.metrics.shareholderReturn.toFixed(1)}%</strong></span>
                </div>
                <Link href={`/stocks/${item.asset.slug}`}>자세히 보기 →</Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RelationshipLandscape({
  alternatives,
  active,
  toggle,
}: {
  alternatives: Related[];
  active: string[];
  toggle: (slug: string) => void;
}) {
  return (
    <section className="alternative-section relationship-section">
      <div className="shell">
        <div className="section-heading">
          <div><h2>함께 볼 만한 종목과 ETF</h2></div>
        </div>

        <div className="relationship-groups">
          {relationOrder.map((type) => {
            const items = alternatives.filter((item) => item.relationType === type);
            if (!items.length) return null;
            const meta = relationMeta[type];
            return (
              <section className={`relationship-group relation-${type}`} key={type}>
                <div className="relationship-group-intro">
                  <span>{meta.label}</span>
                </div>
                <div className="relationship-card-grid">
                  {items.map((item) => {
                    const isActive = active.includes(item.slug);
                    const limitReached = active.length >= 4;
                    return (
                      <article className={`alternative-card relationship-card ${isActive ? "selected" : ""}`} key={item.slug}>
                        <div className="alt-card-top">
                          <div className="alternative-badges">
                            <MarketBadge asset={item.asset} />
                          </div>
                          <PickerButton active={isActive} limitReached={limitReached} onClick={() => toggle(item.slug)} />
                        </div>
                        <div className="alt-name"><h3>{item.asset.name}</h3><span>{item.asset.ticker}</span></div>
                        <p className="landscape-tradeoff">{item.tradeoffSummary}</p>
                        <div className="evidence-row">
                          {(item.evidence ?? []).map((evidence) => <span key={evidence}>{evidence}</span>)}
                        </div>
                        <Link href={`/stocks/${item.asset.slug}`}>자세히 보기 →</Link>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function LegacyDifferences({ selected, alternatives, active }: { selected: Asset; alternatives: Related[]; active: string[] }) {
  return (
    <section className="difference-section">
      <div className="shell">
        <div className="section-heading"><div><h2>종목별로 다른 점</h2></div></div>
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
  );
}

function ExposureChanges({ selected, alternatives, active }: { selected: Asset; alternatives: Related[]; active: string[] }) {
  return (
    <section className="difference-section exposure-change-section">
      <div className="shell">
        <div className="section-heading">
          <div><h2>비교하면 달라지는 점</h2></div>
        </div>
        <div className="difference-grid exposure-change-grid">
          {alternatives.filter((item) => active.includes(item.slug)).map((item) => {
            const type = item.relationType ?? "direct";
            return (
              <article key={item.slug}>
                <div className="difference-title">
                  <span>{item.asset.name.slice(0, 1)}</span>
                  <div><small>{selected.name} → {relationMeta[type].label}</small><h3>{item.asset.name}</h3></div>
                </div>
                <p className="tradeoff-summary">{item.tradeoffSummary}</p>
                <div className="exposure-change-list">
                  <div className="shared"><b>함께 보는 요소</b><div>{(item.sharedDrivers ?? []).map((value) => <span key={value}>{value}</span>)}</div></div>
                  <div className="stronger"><b>더 커지는 비중</b><div>{(item.strongerExposures ?? []).map((value) => <span key={value}>{value}</span>)}</div></div>
                  <div className="weaker"><b>줄어드는 비중</b><div>{(item.weakerExposures ?? []).map((value) => <span key={value}>{value}</span>)}</div></div>
                  <div className="risk"><b>새로 확인할 점</b><div>{(item.newRisks ?? []).map((value) => <span key={value}>{value}</span>)}</div></div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ComparisonDashboard({ selected, alternatives, fxAsOf }: { selected: Asset; alternatives: Related[]; fxAsOf: string }) {
  const [active, setActive] = useState(() => alternatives.slice(0, 3).map((item) => item.slug));
  const compared = useMemo(() => [selected, ...alternatives.filter((item) => active.includes(item.slug)).map((item) => item.asset)], [selected, alternatives, active]);
  const hasRelationshipModel = alternatives.length > 0 && alternatives.every((item) => (
    item.relationType
    && item.tradeoffSummary
    && item.sharedDrivers?.length
    && item.strongerExposures?.length
    && item.weakerExposures?.length
    && item.newRisks?.length
  ));

  function toggle(slug: string) {
    setActive((current) => current.includes(slug)
      ? current.filter((item) => item !== slug)
      : current.length < 4 ? [...current, slug] : current,
    );
  }

  return (
    <>
      {hasRelationshipModel ? (
        <RelationshipLandscape alternatives={alternatives} active={active} toggle={toggle} />
      ) : (
        <LegacyAlternatives alternatives={alternatives} active={active} toggle={toggle} />
      )}

      {hasRelationshipModel ? (
        <ExposureChanges selected={selected} alternatives={alternatives} active={active} />
      ) : (
        <LegacyDifferences selected={selected} alternatives={alternatives} active={active} />
      )}

      <section className="comparison-section shell">
        <div className="section-heading">
          <div><h2>숫자로 비교</h2></div>
          <p className="fx-note">원화 환산 기준 {fxAsOf}</p>
        </div>
        <div className="table-scroll">
          <table className="comparison-table">
            <thead><tr><th>비교 항목</th>{compared.map((item) => <th key={item.slug}><MarketBadge asset={item} />{item.name}</th>)}</tr></thead>
            <tbody>
              <tr><th>한 줄 특징</th>{compared.map((item) => <td className="profile-cell" key={item.slug}>{item.profile}</td>)}</tr>
              <tr><th>PER</th>{compared.map((item) => <MetricCell key={item.slug} value={multiple(item.metrics.per)} />)}</tr>
              <tr><th>PBR</th>{compared.map((item) => <MetricCell key={item.slug} value={multiple(item.metrics.pbr)} />)}</tr>
              <tr><th>매출 성장률</th>{compared.map((item) => <MetricCell key={item.slug} value={pct(item.metrics.revenueGrowth)} />)}</tr>
              <tr><th>주주환원율</th>{compared.map((item) => <MetricCell key={item.slug} value={item.metrics.shareholderReturn.toFixed(1)} suffix="%" />)}</tr>
              <tr><th>1년 수익률</th>{compared.map((item) => <td key={item.slug} className={item.metrics.return1y >= 0 ? "positive" : "negative"}>{pct(item.metrics.return1y)}</td>)}</tr>
              <tr className="krw-row"><th>1년 원화 수익률</th>{compared.map((item) => <td key={item.slug}>{item.market === "US" ? (item.metrics.return1yKrw == null ? "자료 없음" : pct(item.metrics.return1yKrw)) : "기준 통화와 동일"}</td>)}</tr>
              <tr><th>연환산 변동성</th>{compared.map((item) => <MetricCell key={item.slug} value={item.metrics.volatility.toFixed(1)} suffix="%" />)}</tr>
              <tr><th>최대 낙폭</th>{compared.map((item) => <td className="negative" key={item.slug}>{pct(item.metrics.maxDrawdown)}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <p className="data-provenance-note">
          참고용 데이터입니다. 실제 수치는 최신 공시를 확인해 주세요.
        </p>
      </section>
    </>
  );
}
