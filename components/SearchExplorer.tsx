"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StockSearchResult } from "@/lib/data/krx-master";

export function SearchExplorer({ featured }: { featured: StockSearchResult[] }) {
  const router = useRouter();
  const requestId = useRef(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(featured);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (!value) return;

    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(value)}`);
        if (!response.ok) throw new Error("search failed");
        const payload = await response.json() as { results: StockSearchResult[] };
        if (requestId.current === currentRequest) setResults(payload.results);
      } catch {
        if (requestId.current === currentRequest) setResults([]);
      } finally {
        if (requestId.current === currentRequest) setLoading(false);
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [featured, query]);

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
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            setOpen(true);
            if (!value.trim()) {
              requestId.current += 1;
              setResults(featured);
              setLoading(false);
            } else {
              setLoading(true);
            }
          }}
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
          {loading ? (
            <p className="empty-result">전체 상장 종목에서 찾는 중...</p>
          ) : results.length ? results.map((stock) => (
            <button key={stock.symbol} type="button" role="option" aria-selected="false" onMouseDown={() => go(stock.slug)}>
              <span className="result-symbol">{stock.name.slice(0, 1)}</span>
              <span>
                <strong>{stock.name}</strong>
                <small>
                  {stock.symbol} · {stock.market}
                  {stock.enriched ? " · 상세 비교 제공" : ""}
                </small>
              </span>
              <span className="result-arrow">→</span>
            </button>
          )) : <p className="empty-result">일치하는 한국 상장 종목을 찾지 못했습니다.</p>}
        </div>
      )}
    </div>
  );
}
