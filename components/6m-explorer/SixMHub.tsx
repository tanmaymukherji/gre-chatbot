"use client";

import type { SixMDomain } from "@/lib/sixm-explorer";
import { SixMOrbitCanvas } from "@/components/6m-explorer/SixMOrbitCanvas";

export function SixMHub({
  keyword,
  activeM,
  onSelect,
  counts
}: {
  keyword: string;
  activeM: SixMDomain | null;
  onSelect: (domain: SixMDomain) => void;
  counts: Partial<Record<SixMDomain, number>>;
}) {
  return (
    <section className="sixm-hub-shell">
      <div className="sixm-hint">Click any M to explore matching solutions.</div>
      <SixMOrbitCanvas keyword={keyword} activeM={activeM} onSelect={onSelect} counts={counts} emptyCenterHint="Enter a search term" />
    </section>
  );
}
