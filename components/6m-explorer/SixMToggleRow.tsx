"use client";

import { SIX_M_META, type SixMDomain } from "@/lib/sixm-explorer";

export function SixMToggleRow({
  activeM,
  onSelect,
  onCloseAll,
  counts
}: {
  activeM: SixMDomain | null;
  onSelect: (domain: SixMDomain) => void;
  onCloseAll: () => void;
  counts: Partial<Record<SixMDomain, number>>;
}) {
  return (
    <div className="sixm-toggle-row">
      {SIX_M_META.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`sixm-toggle-btn ${activeM === item.key ? "active" : ""}`}
          onClick={() => onSelect(item.key)}
        >
          <span>{item.key}</span>
          <span className="sixm-toggle-count">{counts[item.key] ?? 0}</span>
        </button>
      ))}
      <button type="button" className="sixm-toggle-btn close-all" onClick={onCloseAll}>
        Close All
      </button>
    </div>
  );
}

