"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StockSearchResult } from "@/lib/data/krx-master";
import { moveSearchSelection, selectedSearchResult } from "@/lib/search-navigation.mjs";

export function SearchExplorer({ featured }: { featured: StockSearchResult[] }) {
  const router = useRouter();
  const requestId = useRef(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(featured);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const value = query.trim();
    if (!value) return;

    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(value)}`);
        if (!response.ok) throw new Error("search failed");
        const payload = await response.json() as { results: StockSearchResult[] };
        if (requestId.current === currentRequest) {
          setResults(payload.results);
          setActiveIndex(0);
        }
      } catch {
        if (requestId.current === currentRequest) {
          setResults([]);
          setActiveIndex(0);
        }
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
          aria-activedescendant={open && results[activeIndex] ? `stock-option-${results[activeIndex].symbol}` : undefined}
          placeholder="종목명 또는 종목코드 입력"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            requestId.current += 1;
            setQuery(value);
            setOpen(true);
            if (!value.trim()) {
              setResults(featured);
              setLoading(false);
              setActiveIndex(0);
            } else {
              setResults([]);
              setLoading(true);
              setActiveIndex(0);
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && results.length) {
              event.preventDefault();
              setActiveIndex((current) => moveSearchSelection(current, results.length, 1));
            }
            if (event.key === "ArrowUp" && results.length) {
              event.preventDefault();
              setActiveIndex((current) => moveSearchSelection(current, results.length, -1));
            }
            const selected = selectedSearchResult(results, activeIndex, loading);
            if (event.key === "Enter" && selected) {
              event.preventDefault();
              go(selected.slug);
            }
            if (event.key === "Escape") setOpen(false);
          }}
        />
        <button
          type="button"
          disabled={loading || !results.length}
          onClick={() => {
            const selected = selectedSearchResult(results, activeIndex, loading);
            if (selected) go(selected.slug);
          }}
        >
          비교 시작
        </button>
      </div>
      {open && (
        <div className="search-results" id="stock-search-results" role="listbox">
          {loading ? (
            <p className="empty-result">전체 상장 종목에서 찾는 중...</p>
          ) : results.length ? results.map((stock, index) => (
            <button
              key={stock.symbol}
              id={`stock-option-${stock.symbol}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => go(stock.slug)}
            >
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
