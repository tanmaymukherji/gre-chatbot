"use client";

import { TrackedAnchor } from "@/components/tracked-links";
import type { SolutionDetail } from "@/services/sixm-search-service";

export function SolutionDetailsModal({
  solution,
  parked,
  onClose,
  onPark
}: {
  solution: SolutionDetail | null;
  parked: boolean;
  onClose: () => void;
  onPark: () => void;
}) {
  if (!solution) {
    return null;
  }

  const infoRows: Array<[string, string | string[] | undefined]> = [
    ["Provider", solution.providerName],
    ["6M classification", solution.sixMClassification || solution.sixMDomains.join(", ")],
    ["Category", solution.category],
    ["Offering type", solution.offeringType],
    ["Value chain", solution.valueChains],
    ["Application", solution.applications],
    ["Geography", solution.geographyList?.length ? solution.geographyList : solution.geography],
    ["Contact", solution.contactEmail || solution.contactPhone || solution.contact],
    ["Provider link", solution.providerWebsite]
  ];

  return (
    <div className="sixm-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="sixm-modal" role="dialog" aria-modal="true" aria-label={solution.title} onClick={(event) => event.stopPropagation()}>
        <div className="sixm-modal-head">
          <div>
            <p className="sixm-eyebrow">Solution Detail</p>
            <h2>{solution.title}</h2>
          </div>
          <button type="button" className="sixm-icon-btn" onClick={onClose} aria-label="Close details">
            x
          </button>
        </div>

        <p className="sixm-modal-summary">{solution.summary || solution.description}</p>

        <div className="sixm-detail-grid">
          {infoRows.map(([label, value]) =>
            value && (Array.isArray(value) ? value.length : String(value).trim()) ? (
              <div className="sixm-detail-cell" key={label}>
                <span>{label}</span>
                <strong>{Array.isArray(value) ? value.join(", ") : value}</strong>
              </div>
            ) : null
          )}
        </div>

        <div className="sixm-modal-actions">
          {solution.greUrl ? (
            <TrackedAnchor
              className="btn"
              href={solution.greUrl}
              target="_blank"
              rel="noreferrer"
              auditEvent={{
                kind: "view",
                action: "view_portal",
                itemId: solution.offeringId,
                itemLabel: solution.title,
                itemSource: solution.sourceLabel || "gre",
                portalUrl: solution.greUrl
              }}
            >
              View on GRE
            </TrackedAnchor>
          ) : null}
          <button type="button" className={`btn ${parked ? "ghost" : ""}`} onClick={onPark} disabled={parked}>
            {parked ? "Already Parked" : "Park Solution"}
          </button>
        </div>
      </div>
    </div>
  );
}

