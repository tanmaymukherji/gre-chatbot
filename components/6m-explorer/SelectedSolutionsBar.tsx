"use client";

import type { Solution } from "@/lib/sixm-explorer";

export function SelectedSolutionsBar({
  solutions,
  onRemove,
  onVisualize,
  onEmailSelection
}: {
  solutions: Solution[];
  onRemove: (id: string) => void;
  onVisualize: () => void;
  onEmailSelection?: () => void;
}) {
  if (!solutions.length) {
    return null;
  }

  return (
    <section className="sixm-selected-bar">
      <div className="sixm-selected-copy">
        <strong>Selected Solutions</strong>
        <span className="sixm-selected-count">{solutions.length}</span>
      </div>

      <div className="sixm-selected-list">
        {solutions.map((solution) => (
          <article className="sixm-selected-chip" key={solution.id}>
            <div>
              <strong>{solution.title}</strong>
              <small>
                {solution.providerName} - {solution.sixMDomains.join(", ")}
              </small>
            </div>
            <button type="button" onClick={() => onRemove(solution.id)} aria-label={`Remove ${solution.title}`}>
              x
            </button>
          </article>
        ))}
      </div>

      <div className="sixm-selected-actions">
        <button type="button" className="btn sixm-primary-btn" onClick={onVisualize}>
          Visualize Selected Solutions under 6M
        </button>
        {onEmailSelection ? (
          <button type="button" className="btn sixm-primary-btn" onClick={onEmailSelection} style={{ background: "#1d5a42", borderColor: "#1d5a42" }}>
            Email 6M Selection to Self
          </button>
        ) : null}
      </div>
    </section>
  );
}
