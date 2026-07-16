import Link from "next/link";
import type { Asset } from "@/lib/data/catalog";

type Group = { sector: string; industries: { industry: string; assets: Asset[] }[] };

export function IndustryMap({ groups }: { groups: Group[] }) {
  return (
    <div className="industry-map">
      {groups.map((group, index) => (
        <details className="sector-card" key={group.sector} open={index < 2}>
          <summary>
            <span className="sector-number">0{index + 1}</span>
            <strong>{group.sector}</strong>
            <span>{group.industries.reduce((sum, item) => sum + item.assets.length, 0)} assets</span>
            <i aria-hidden="true">+</i>
          </summary>
          <div className="industry-branches">
            {group.industries.map((industry) => (
              <div className="industry-branch" key={industry.industry}>
                <h3>{industry.industry}</h3>
                <div className="asset-chips">
                  {industry.assets.map((item) => (
                    <Link
                      className={`${item.market === "US" ? "is-global" : ""} ${item.type === "etf" ? "is-etf" : ""}`}
                      href={`/stocks/${item.slug}`}
                      key={item.slug}
                    >
                      <span>{item.name}</span>
                      <small>{item.type === "etf" ? "ETF" : item.market}</small>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
