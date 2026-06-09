"use client";

import Link from "next/link";

export function SixMSearchBar({
  keyword,
  onKeywordChange,
  onSubmit,
  loading
}: {
  keyword: string;
  onKeywordChange: (value: string) => void;
  onSubmit: () => void;
  loading?: boolean;
}) {
  return (
    <section className="sixm-search-card">
      <div className="sixm-search-head">
        <div>
          <p className="sixm-eyebrow">Ask GRE</p>
          <h1>6M Explorer</h1>
          <p className="sixm-subtitle">Explore Green Rural Economy solutions across the 6M framework</p>
        </div>
        <Link className="btn ghost sixm-back-btn" href="/">
          Back to Ask GRE
        </Link>
      </div>

      <div className="sixm-search-row">
        <label className="sr-only" htmlFor="sixm-keyword-search">
          Search keyword
        </label>
        <input
          id="sixm-keyword-search"
          type="text"
          value={keyword}
          placeholder="Search for goat, bamboo, dairy, millet, turmeric..."
          onChange={(event) => onKeywordChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSubmit();
            }
          }}
        />
        <button className="btn sixm-primary-btn" type="button" onClick={onSubmit} disabled={loading}>
          {loading ? "Searching..." : "Find Ms"}
        </button>
      </div>
    </section>
  );
}
