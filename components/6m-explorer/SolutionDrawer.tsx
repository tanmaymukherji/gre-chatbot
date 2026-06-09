"use client";

import { useMemo } from "react";
import { SolutionCard } from "@/components/6m-explorer/SolutionCard";
import type { SixMDomain, Solution } from "@/lib/sixm-explorer";

function sortSolutions(rows: Solution[], sortBy: string) {
  const list = [...rows];
  if (sortBy === "provider") {
    list.sort((a, b) => a.providerName.localeCompare(b.providerName));
  } else if (sortBy === "geography") {
    list.sort((a, b) => String(a.geography || "").localeCompare(String(b.geography || "")));
  } else if (sortBy === "offeringType") {
    list.sort((a, b) => String(a.offeringType || "").localeCompare(String(b.offeringType || "")));
  }
  return list;
}

export function SolutionDrawer({
  open,
  activeM,
  keyword,
  solutions,
  parkedIds,
  sortBy,
  onSortChange,
  onClose,
  onViewDetails,
  onPark
}: {
  open: boolean;
  activeM: SixMDomain | null;
  keyword: string;
  solutions: Solution[];
  parkedIds: string[];
  sortBy: string;
  onSortChange: (value: string) => void;
  onClose: () => void;
  onViewDetails: (solution: Solution) => void;
  onPark: (solution: Solution) => void;
}) {
  const sorted = useMemo(() => sortSolutions(solutions, sortBy), [solutions, sortBy]);

  return (
    <aside className={`sixm-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="sixm-drawer-head">
        <div>
          <h2>{activeM ? `${activeM} Solutions for ${keyword}` : "Solutions"}</h2>
          <p>Showing {sorted.length} results</p>
        </div>
        <button type="button" className="sixm-icon-btn" onClick={onClose} aria-label="Close drawer">
          x
        </button>
      </div>

      <div className="sixm-sort-row">
        <label htmlFor="sixm-sort-select">Sort by</label>
        <select id="sixm-sort-select" value={sortBy} onChange={(event) => onSortChange(event.target.value)}>
          <option value="relevance">Relevance</option>
          <option value="provider">Provider Name</option>
          <option value="geography">Geography</option>
          <option value="offeringType">Offering Type</option>
        </select>
      </div>

      <div className="sixm-drawer-list">
        {!sorted.length && activeM ? (
          <div className="notice">
            No solutions found under {activeM} for this keyword. Try another M or broaden the search.
          </div>
        ) : null}

        {sorted.map((solution) => (
          <SolutionCard
            key={solution.id}
            solution={solution}
            parked={parkedIds.includes(solution.id)}
            onViewDetails={() => onViewDetails(solution)}
            onPark={() => onPark(solution)}
          />
        ))}
      </div>
    </aside>
  );
}

