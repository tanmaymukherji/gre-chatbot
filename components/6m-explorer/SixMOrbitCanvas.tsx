"use client";

import { useMemo } from "react";
import { SixMCard } from "@/components/6m-explorer/SixMCard";
import { SIX_M_META, type SixMDomain } from "@/lib/sixm-explorer";

type Position = { x: number; y: number };

const DEFAULT_POSITIONS: Record<SixMDomain, Position> = {
  Manpower: { x: 0.24, y: 0.22 },
  Method: { x: 0.76, y: 0.22 },
  Material: { x: 0.18, y: 0.5 },
  Machine: { x: 0.82, y: 0.5 },
  Money: { x: 0.24, y: 0.78 },
  Market: { x: 0.76, y: 0.78 }
};

export function SixMOrbitCanvas({
  keyword,
  activeM,
  onSelect,
  counts,
  centerBadge,
  emptyCenterHint
}: {
  keyword: string;
  activeM: SixMDomain | null;
  onSelect: (domain: SixMDomain) => void;
  counts: Partial<Record<SixMDomain, number>>;
  centerBadge?: string;
  emptyCenterHint?: string;
}) {
  const connectorPaths = useMemo(
    () =>
      SIX_M_META.map((item) => {
        const point = DEFAULT_POSITIONS[item.key];
        const targetX = point.x * 100;
        const targetY = point.y * 100;
        const controlX = targetX < 50 ? 35 : 65;
        const controlY = targetY < 50 ? 34 : 70;
        const nearX = targetX < 50 ? targetX + 7 : targetX - 7;
        return `M 50 50 C ${controlX} ${controlY}, ${nearX} ${targetY}, ${targetX} ${targetY}`;
      }),
    []
  );

  return (
    <div className="sixm-orbit-shell">
      <div className="sixm-orbit-stage">
        <svg className="sixm-connectors" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {connectorPaths.map((path, index) => (
            <path key={SIX_M_META[index].key} d={path} />
          ))}
        </svg>

        <div className="sixm-center-node">
          <span className="sixm-center-search-icon" aria-hidden="true">
            6M
          </span>
          {centerBadge ? <span className="sixm-center-badge">{centerBadge}</span> : null}
          <strong>{keyword || "Keyword"}</strong>
          {!keyword && emptyCenterHint ? <span>{emptyCenterHint}</span> : null}
        </div>

        {SIX_M_META.map((item) => (
          <SixMCard
            key={item.key}
            domain={item.key}
            description={item.description}
            iconLabel={item.iconLabel}
            active={activeM === item.key}
            count={counts[item.key]}
            className="sixm-orbit-card"
            style={{
              left: `${DEFAULT_POSITIONS[item.key].x * 100}%`,
              top: `${DEFAULT_POSITIONS[item.key].y * 100}%`
            }}
            onClick={() => onSelect(item.key)}
          />
        ))}
      </div>
    </div>
  );
}
