"use client";

import type { CSSProperties } from "react";
import type { SixMDomain } from "@/lib/sixm-explorer";

export function SixMCard({
  domain,
  description,
  iconLabel,
  active,
  onClick,
  count,
  className = "",
  style
}: {
  domain: SixMDomain;
  description: string;
  iconLabel: string;
  active?: boolean;
  onClick?: () => void;
  count?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      className={`sixm-node-card ${active ? "active" : ""} ${className}`.trim()}
      onClick={onClick}
      style={style}
      aria-label={`${domain} solutions`}
    >
      <span className="sixm-node-icon" aria-hidden="true">
        {iconLabel}
      </span>
      <span className="sixm-node-copy">
        <strong>{domain}</strong>
        <small>{description}</small>
      </span>
      {typeof count === "number" ? <span className="sixm-node-count">{count}</span> : null}
    </button>
  );
}
