"use client";

import { useMemo, useState } from "react";
import { SixMOrbitCanvas } from "@/components/6m-explorer/SixMOrbitCanvas";
import { SixMToggleRow } from "@/components/6m-explorer/SixMToggleRow";
import { SolutionDrawer } from "@/components/6m-explorer/SolutionDrawer";
import { buildSummaryText, SIX_M_DOMAINS, type SixMDomain, type Solution } from "@/lib/sixm-explorer";

export function SelectedSolutionsVisualization({
  keyword,
  solutions,
  onBack,
  onClearAll,
  onCopySummary,
  onViewDetails
}: {
  keyword: string;
  solutions: Solution[];
  onBack: () => void;
  onClearAll: () => void;
  onCopySummary: (text: string) => void;
  onViewDetails: (solution: Solution) => void;
}) {
  const summaryText = buildSummaryText(keyword, solutions);
  const [activeM, setActiveM] = useState<SixMDomain | null>(
    SIX_M_DOMAINS.find((domain) => solutions.some((solution) => solution.sixMDomains.includes(domain))) || null
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        SIX_M_DOMAINS.map((domain) => [domain, solutions.filter((solution) => solution.sixMDomains.includes(domain)).length])
      ) as Partial<Record<SixMDomain, number>>,
    [solutions]
  );
  const activeSolutions = activeM ? solutions.filter((solution) => solution.sixMDomains.includes(activeM)) : [];

  return (
    <section className="sixm-visualization-view">
      <div className="sixm-visualization-head">
        <div>
          <p className="sixm-eyebrow">Selected Solutions</p>
          <h2>6M Mapping Preview</h2>
          <p className="sixm-subtitle">Curated solutions remapped under the 6M framework.</p>
        </div>
        <div className="sixm-visualization-actions">
          <button type="button" className="btn ghost" onClick={onBack}>
            Back to 6M Explorer
          </button>
          <button type="button" className="btn ghost" onClick={onClearAll}>
            Clear All
          </button>
          <button type="button" className="btn sixm-primary-btn" onClick={() => onCopySummary(summaryText)}>
            Export/Copy Summary
          </button>
        </div>
      </div>

      <div className="sixm-layout-stack">
        <SixMToggleRow activeM={activeM} onSelect={setActiveM} onCloseAll={() => setActiveM(null)} counts={counts} />

        <div className="sixm-explorer-layout sixm-explorer-layout-selected">
          <section className="sixm-main-column">
            <div className="sixm-hub-shell sixm-hub-shell-selected">
              <SixMOrbitCanvas keyword={keyword} activeM={activeM} onSelect={setActiveM} counts={counts} />
            </div>
          </section>

          <SolutionDrawer
            open={Boolean(activeM)}
            activeM={activeM}
            keyword={keyword}
            solutions={activeSolutions}
            parkedIds={solutions.map((solution) => solution.id)}
            sortBy="relevance"
            onSortChange={() => undefined}
            onClose={() => setActiveM(null)}
            onViewDetails={onViewDetails}
            onPark={() => undefined}
          />
        </div>
      </div>
    </section>
  );
}
