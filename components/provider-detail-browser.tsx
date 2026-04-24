"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const PROVIDER_PAGE_SIZE = 12;

function normalizeSearchText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function includesQuery(haystackParts: unknown[], query: string) {
  if (!query) {
    return true;
  }

  const haystack = haystackParts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .map((part) => normalizeSearchText(part))
    .join(" ");

  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export function ProviderDetailBrowser({ offerings }: { offerings: any[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const normalizedQuery = normalizeSearchText(query);
  const filteredOfferings = useMemo(
    () =>
      offerings.filter((offering) =>
        includesQuery(
          [
            offering.offering_name,
            offering.about_offering_text,
            offering.offering_group,
            offering.offering_type,
            offering.domain_6m,
            offering.primary_valuechain,
            offering.primary_application,
            offering.valuechains,
            offering.applications,
            offering.tags,
            offering.languages,
            offering.geographies,
            offering.solution?.solution_name,
            offering.solution?.about_solution_text,
            offering.search_document
          ],
          normalizedQuery
        )
      ),
    [offerings, normalizedQuery]
  );

  const totalPages = Math.max(1, Math.ceil(filteredOfferings.length / PROVIDER_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filteredOfferings.slice((currentPage - 1) * PROVIDER_PAGE_SIZE, currentPage * PROVIDER_PAGE_SIZE);

  const groupedOfferings = useMemo(() => {
    const groups = new Map<string, Map<string, any[]>>();

    for (const offering of pageItems) {
      const valueChain = offering.primary_valuechain || "Other Value Chains";
      const application = offering.primary_application || "Other Applications";
      if (!groups.has(valueChain)) {
        groups.set(valueChain, new Map());
      }
      const applicationMap = groups.get(valueChain)!;
      if (!applicationMap.has(application)) {
        applicationMap.set(application, []);
      }
      applicationMap.get(application)!.push(offering);
    }

    return [...groups.entries()];
  }, [pageItems]);

  return (
    <section className="stack">
      <section className="panel panel-pad">
        <div className="split">
          <div>
            <h2 className="section-title">Provider Offerings</h2>
            <p className="section-copy">
              Browse this provider&apos;s offerings grouped by value chain and application. Tags are shown on each card for quick scanning.
            </p>
          </div>
          <span className="pill">{filteredOfferings.length} offerings</span>
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="provider-offering-search">Find a solution</label>
          <input
            id="provider-offering-search"
            type="text"
            placeholder="Search offering names, keywords, tags, value chains..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </section>

      {filteredOfferings.length === 0 ? (
        <div className="notice warn">No provider offerings matched this search. Try a broader keyword.</div>
      ) : (
        groupedOfferings.map(([valueChain, applicationGroups]) => (
          <section className="panel panel-pad" key={valueChain}>
            <h3 className="section-title">{valueChain}</h3>
            <div className="stack" style={{ marginTop: 14 }}>
              {[...applicationGroups.entries()].map(([application, items]) => (
                <div key={`${valueChain}-${application}`} className="stack">
                  <h4 className="provider-application-heading">{application}</h4>
                  <div className="results-list">
                    {items.map((offering) => (
                      <article className="card" key={offering.offering_id}>
                        <h3>
                          <Link className="result-title-link" href={`/offering/${offering.offering_id}`}>
                            {offering.offering_name || "Untitled offering"}
                          </Link>
                        </h3>
                        <p>
                          {offering.offering_group || "Uncategorized"}
                          {" | "}
                          {offering.domain_6m || "No 6M domain"}
                          {" | "}
                          {offering.offering_type || "No offering type"}
                        </p>
                        {offering.about_offering_text ? <p style={{ marginTop: 14 }}>{offering.about_offering_text}</p> : null}
                        {(offering.tags || []).length ? (
                          <div style={{ marginTop: 14 }}>
                            <strong className="provider-tags-heading">Tags</strong>
                            <div className="meta-row" style={{ marginTop: 8 }}>
                              {(offering.tags || []).map((tag: string) => (
                                <span className="tag" key={`${offering.offering_id}-${tag}`}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div className="provider-offering-links" style={{ marginTop: 14 }}>
                          <Link className="result-link" href={`/offering/${offering.offering_id}`}>
                            View details
                          </Link>
                          {offering.gre_link ? (
                            <a className="result-link" href={offering.gre_link} target="_blank" rel="noreferrer">
                              View on GRE
                            </a>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {filteredOfferings.length > PROVIDER_PAGE_SIZE ? (
        <div className="results-pagination">
          <button className="btn ghost" type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            Previous
          </button>
          <span className="pill">
            Page {currentPage} of {totalPages}
          </span>
          <button className="btn ghost" type="button" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}
