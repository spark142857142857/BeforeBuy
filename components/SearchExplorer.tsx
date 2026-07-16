"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Asset } from "@/lib/data/catalog";

export function SearchExplorer({ stocks }: { stocks: Asset[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return stocks.slice(0, 6);
    return stocks
      .filter((stock) =>
        [stock.name, stock.nameEn, stock.ticker, stock.sector, stock.industry]
          .join(" ")
          .toLowerCase()
          .includes(value),
      )
      .slice(0, 7);
  }, [query, stocks]);

  function go(slug: string) {
    setOpen(false);
    router.push(`/stocks/${slug}`);
  }

  return (
    <div className="search-wrap">
      <div className="search-box">
        <span className="search-icon" aria-hidden="true" />
        <input
          role="combobox"
          aria-label="한국 종목 검색"
          aria-expanded={open}
          aria-controls="stock-search-results"
          aria-autocomplete="list"
          placeholder="종목명 또는 종목코드 입력"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results[0]) go(results[0].slug);
            if (event.key === "Escape") setOpen(false);
          }}
        />
        <button type="button" onClick={() => results[0] && go(results[0].slug)}>
          비교 시작
        </button>
      </div>
      {open && (
        <div className="search-results" id="stock-search-results" role="listbox">
          {results.length ? results.map((stock) => (
            <button key={stock.slug} type="button" role="option" aria-selected="false" onMouseDown={() => go(stock.slug)}>
              <span className="result-symbol">{stock.name.slice(0, 1)}</span>
              <span><strong>{stock.name}</strong><small>{stock.ticker} · {stock.industry}</small></span>
              <span className="result-arrow">→</span>
            </button>
          )) : <p className="empty-result">지원하는 한국 종목을 찾지 못했습니다.</p>}
        </div>
      )}
    </div>
  );
}
