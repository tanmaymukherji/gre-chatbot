"use client";

import { TrackedAnchor } from "@/components/tracked-links";
import type { Solution } from "@/lib/sixm-explorer";

export function SolutionCard({
  solution,
  parked,
  onViewDetails,
  onPark
}: {
  solution: Solution;
  parked: boolean;
  onViewDetails: () => void;
  onPark: () => void;
}) {
  return (
    <article className="sixm-solution-card">
      <div className="sixm-solution-card-top">
        <div className="sixm-solution-thumb" aria-hidden="true">
          {solution.thumbnailUrl ? <img src={solution.thumbnailUrl} alt="" /> : <span>{solution.title.slice(0, 1).toUpperCase()}</span>}
        </div>
        <div>
          <h3>{solution.title}</h3>
          <p>{solution.providerName}</p>
        </div>
      </div>

      <div className="sixm-chip-row">
        {solution.sixMDomains.map((domain) => (
          <span className="tag" key={`${solution.id}-${domain}`}>
            {domain}
          </span>
        ))}
        {solution.offeringType ? <span className="tag">{solution.offeringType}</span> : null}
        {solution.geography ? <span className="tag">{solution.geography}</span> : null}
      </div>

      {solution.description ? <p className="sixm-solution-summary">{solution.description}</p> : null}

      <div className="sixm-solution-actions">
        <button type="button" className="result-link" onClick={onViewDetails}>
          View Details
        </button>
        {solution.greUrl ? (
          <TrackedAnchor
            className="result-link"
            href={solution.greUrl}
            target="_blank"
            rel="noreferrer"
          >
            View on GRE
          </TrackedAnchor>
        ) : null}
        <button type="button" className={`result-link sixm-park-btn ${parked ? "parked" : ""}`} onClick={onPark} disabled={parked}>
          {parked ? "Parked" : "Park Solution"}
        </button>
      </div>
    </article>
  );
}
