"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProviderMapPanel } from "@/components/provider-map-panel";
import { ShowcaseSections } from "@/components/showcase-sections";
import { TrackedAnchor, TrackedLink } from "@/components/tracked-links";
import type { GreSurfaceConfig } from "@/lib/surface";

const CATEGORY_OPTIONS = ["", "Knowledge", "Service", "Product"];
const DOMAIN_OPTIONS = ["", "Manpower", "Method", "Machine", "Material", "Market", "Money"];

type Filters = {
  q: string;
  solutionProvider: string;
  category: string;
  domain6m: string;
  offeringType: string;
  valueChain: string;
  application: string;
  language: string;
  geography: string;
};

type FilterOptions = {
  solutionProviders: string[];
  categories: string[];
  domains6m: string[];
  offeringTypes: string[];
  offeringTypesByDomain: Record<string, string[]>;
  valueChains: string[];
  applications: string[];
  tags: string[];
  languages: string[];
  geographies: string[];
};

const EMPTY_FILTERS: Filters = {
  q: "",
  solutionProvider: "",
  category: "",
  domain6m: "",
  offeringType: "",
  valueChain: "",
  application: "",
  language: "",
  geography: ""
};

const EMPTY_OPTIONS: FilterOptions = {
  solutionProviders: [],
  categories: [],
  domains6m: [],
  offeringTypes: [],
  offeringTypesByDomain: {},
  valueChains: [],
  applications: [],
  tags: [],
  languages: [],
  geographies: []
};

const DEFAULT_FILTER_OPTIONS: FilterOptions = {
  solutionProviders: [],
  categories: CATEGORY_OPTIONS.filter(Boolean),
  domains6m: DOMAIN_OPTIONS.filter(Boolean),
  offeringTypes: ["Blogs", "Consulting", "Financial support", "Machinery", "Market reports", "Market support", "Raw material", "Sop manuals", "Tech transfer", "Training", "Videos"],
  offeringTypesByDomain: {
    Manpower: ["Training"],
    Method: ["Blogs", "Consulting", "Sop manuals", "Tech transfer", "Videos"],
    Machine: ["Machinery"],
    Material: ["Raw material"],
    Market: ["Market reports", "Market support"],
    Money: ["Financial support"]
  },
  valueChains: [
    "Livestock",
    "Dairy",
    "Poultry",
    "Goat",
    "Agriculture",
    "Bamboo",
    "Food Processing"
  ],
  applications: [
    "Goat",
    "Dairy For Milk",
    "Biscuit",
    "Baked Goods",
    "Poultry",
    "Organic Farming"
  ],
  tags: [],
  languages: ["English", "Hindi", "KANNADA", "MARATHI", "ODIA", "TELUGU", "TAMIL", "GUJARATI"],
  geographies: ["India", "Karnataka", "Madhya Pradesh", "Odisha", "Maharashtra", "Telangana", "Jharkhand", "Bihar"]
};

const SEARCH_STATE_KEY = "gre-public-search-state";
const RESULTS_PAGE_SIZE = 12;

function normalizeComparable(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function offeringTypesForDomain(offeringTypes: string[], domain6m: string) {
  return offeringTypes;
}

function renderOptions(options: string[], emptyLabel: string) {
  return [
    <option key="all" value="">
      {emptyLabel}
    </option>,
    ...options.map((option) => (
      <option key={option} value={option}>
        {option}
      </option>
    ))
  ];
}

export function PublicExperience({
  mapplsPublicKey,
  surface
}: {
  mapplsPublicKey?: string | null;
  surface: GreSurfaceConfig;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [chatQuery, setChatQuery] = useState("");
  const [beyondGre, setBeyondGre] = useState(surface.enableBeyondGre);
  const [activeTab, setActiveTab] = useState<"parameters" | "chat">("parameters");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [assistantAnswer, setAssistantAnswer] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<"chat" | "parameters" | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(DEFAULT_FILTER_OPTIONS);
  const [loadedLiveFilters, setLoadedLiveFilters] = useState(false);
  const [loadingLiveFilters, setLoadingLiveFilters] = useState(false);
  const [resultsPage, setResultsPage] = useState(1);
  const availableOfferingTypes = filters.domain6m
    ? (filterOptions.offeringTypesByDomain[filters.domain6m] || filterOptions.offeringTypes)
    : filterOptions.offeringTypes;

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(SEARCH_STATE_KEY);
      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved);
      setFilters({ ...EMPTY_FILTERS, ...(parsed.filters || {}) });
      setChatQuery(parsed.chatQuery || "");
      setSearchResults(Array.isArray(parsed.searchResults) ? parsed.searchResults : []);
      setAssistantAnswer(parsed.assistantAnswer || null);
      setNotice(parsed.notice || null);
      setActiveMode(parsed.activeMode || null);
      setResultsPage(parsed.resultsPage || 1);
      setBeyondGre(surface.enableBeyondGre ? true : Boolean(parsed.beyondGre));
    } catch {
      window.sessionStorage.removeItem(SEARCH_STATE_KEY);
    }
  }, [surface.enableBeyondGre]);

  useEffect(() => {
    void loadFilterOptions();
  }, [surface.slug]);

  async function loadFilterOptions() {
    if (loadedLiveFilters || loadingLiveFilters) {
      return;
    }

    setLoadingLiveFilters(true);

    return fetch("/api/filters", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!data.error) {
          setFilterOptions((current) => ({
            solutionProviders: data.solutionProviders?.length ? data.solutionProviders : current.solutionProviders,
            categories: data.categories?.length ? data.categories : current.categories,
            domains6m: data.domains6m?.length ? data.domains6m : current.domains6m,
            offeringTypes: data.offeringTypes?.length ? data.offeringTypes : current.offeringTypes,
            offeringTypesByDomain: Object.keys(data.offeringTypesByDomain || {}).length ? data.offeringTypesByDomain : current.offeringTypesByDomain,
            valueChains: data.valueChains?.length ? data.valueChains : current.valueChains,
            applications: data.applications?.length ? data.applications : current.applications,
            tags: data.tags?.length ? data.tags : current.tags,
            languages: data.languages?.length ? data.languages : current.languages,
            geographies: data.geographies?.length ? data.geographies : current.geographies
          }));
          setLoadedLiveFilters(true);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setLoadingLiveFilters(false);
      });
  }

  function ensureLiveFilters() {
    void loadFilterOptions();
  }

  useEffect(() => {
    window.sessionStorage.setItem(
      SEARCH_STATE_KEY,
      JSON.stringify({
        filters,
        chatQuery,
        searchResults,
        assistantAnswer,
        notice,
        activeMode,
        resultsPage,
        beyondGre
      })
    );
  }, [filters, chatQuery, searchResults, assistantAnswer, notice, activeMode, resultsPage, beyondGre]);

  useEffect(() => {
    if (filters.offeringType && !availableOfferingTypes.includes(filters.offeringType)) {
      setFilters((current) => ({ ...current, offeringType: "" }));
    }
  }, [availableOfferingTypes, filters.offeringType]);

  async function runSearch() {
    ensureLiveFilters();
    setSearching(true);
    setNotice(null);
    setAssistantAnswer(null);
    setActiveMode("parameters");

    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    if (surface.enableBeyondGre && beyondGre) {
      params.set("beyondGre", "true");
    }

    try {
      const response = await fetch(`/api/search?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Search failed.");
      }
      setSearchResults(data.results || []);
      setResultsPage(1);
      if (!data.results?.length) {
        setNotice("No exact matches yet. Try broader filter combinations.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function askChat() {
    if (!chatQuery.trim()) {
      setNotice("Enter a chatbot question first.");
      return;
    }

    setChatting(true);
    setNotice(null);
    setActiveMode("chat");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: chatQuery,
          filters: {},
          beyondGre: surface.enableBeyondGre && beyondGre
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Chat failed.");
      }

      setSearchResults(data.results || []);
      setAssistantAnswer(data.answer || null);
      setResultsPage(1);
    } catch (error) {
      setAssistantAnswer(error instanceof Error ? error.message : "Chat failed.");
    } finally {
      setChatting(false);
    }
  }

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function resetAll() {
    setFilters(EMPTY_FILTERS);
    setChatQuery("");
    setSearchResults([]);
    setAssistantAnswer(null);
    setNotice(null);
    setActiveMode(null);
    setResultsPage(1);
    setBeyondGre(surface.enableBeyondGre);
    window.sessionStorage.removeItem(SEARCH_STATE_KEY);
  }

  const totalPages = Math.max(1, Math.ceil(searchResults.length / RESULTS_PAGE_SIZE));
  const paginatedResults = searchResults.slice((resultsPage - 1) * RESULTS_PAGE_SIZE, resultsPage * RESULTS_PAGE_SIZE);

  return (
    <div className="stack">
      <div className="home-top-grid">
        <section className="panel panel-pad query-panel query-tabs-panel">
          <div className="tab-header">
            <button
              className={`tab-btn ${activeTab === "parameters" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("parameters")}
            >
              Parameter Search
            </button>
            <button
              className={`tab-btn ${activeTab === "chat" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("chat")}
            >
              Chatbot
            </button>
            {surface.slug === "askgre" ? (
              <Link className="tab-btn sixm-entry-btn" href={`/6m-explorer${filters.q ? `?q=${encodeURIComponent(filters.q)}` : ""}`}>
                6M Explorer
              </Link>
            ) : null}
          </div>

          {activeTab === "parameters" ? (
            <>
              <h2 className="section-title">Parameter Search</h2>
              <p className="section-copy">
                Use structured filters first. Explicit choices here override the default relevance ordering used for ranking.
              </p>

              <div className="filter-grid query-panel-body" onFocusCapture={ensureLiveFilters} onMouseEnter={ensureLiveFilters}>
                <div className="field">
                  <label htmlFor="keywordSearch">Keyword search</label>
                  <input
                    id="keywordSearch"
                    type="text"
                    placeholder="Search tags, offering text, provider, value chain..."
                    value={filters.q}
                    onChange={(event) => updateFilter("q", event.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="solutionProvider">Solution provider</label>
                  <select id="solutionProvider" value={filters.solutionProvider} onChange={(event) => updateFilter("solutionProvider", event.target.value)}>
                    {renderOptions(filterOptions.solutionProviders, "All solution providers")}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="category">Category</label>
                  <select id="category" value={filters.category} onChange={(event) => updateFilter("category", event.target.value)}>
                    {renderOptions(filterOptions.categories.length ? filterOptions.categories : CATEGORY_OPTIONS.filter(Boolean), "All categories")}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="domain6m">6M domain</label>
                  <select id="domain6m" value={filters.domain6m} onChange={(event) => updateFilter("domain6m", event.target.value)}>
                    {renderOptions(filterOptions.domains6m.length ? filterOptions.domains6m : DOMAIN_OPTIONS.filter(Boolean), "All 6M domains")}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="offeringType">Offering type</label>
                  <select id="offeringType" value={filters.offeringType} onChange={(event) => updateFilter("offeringType", event.target.value)}>
                    {renderOptions(availableOfferingTypes, "All offering types")}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="valueChain">Value chain</label>
                  <select id="valueChain" value={filters.valueChain} onChange={(event) => updateFilter("valueChain", event.target.value)}>
                    {renderOptions(filterOptions.valueChains, "All value chains")}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="application">Application</label>
                  <select id="application" value={filters.application} onChange={(event) => updateFilter("application", event.target.value)}>
                    {renderOptions(filterOptions.applications, "All applications")}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="language">Language</label>
                  <select id="language" value={filters.language} onChange={(event) => updateFilter("language", event.target.value)}>
                    {renderOptions(filterOptions.languages, "All languages")}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="geography">Geography</label>
                  <select id="geography" value={filters.geography} onChange={(event) => updateFilter("geography", event.target.value)}>
                    {renderOptions(filterOptions.geographies, "All geographies")}
                  </select>
                </div>
              </div>

              <div className="actions query-actions" style={{ marginTop: 18 }}>
                <button className="btn" type="button" disabled={searching} onClick={runSearch}>
                  {searching ? "Searching..." : "Run parameter search"}
                </button>
                <button className="btn ghost" type="button" onClick={resetAll}>
                  Reset all
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="section-title">Chatbot</h2>
              <p className="section-copy">
                Ask a natural-language question. The chatbot can translate, interpret, and then rank matching offerings against the {surface.datasetLabel}.
              </p>

              <div className="stack query-panel-body">
                <div className="field">
                  <label htmlFor="chatQuery">Question for {surface.copilotLabel}</label>
                  <textarea
                    className="chat-query"
                    id="chatQuery"
                    placeholder='Example: Show knowledge offerings for goat farming in Hindi.'
                    value={chatQuery}
                    onChange={(event) => setChatQuery(event.target.value)}
                  />
                </div>

                <div className="actions query-actions">
                  <button className="btn" type="button" disabled={chatting} onClick={askChat}>
                    {chatting ? "Thinking..." : "Ask chatbot"}
                  </button>
                  <button className="btn ghost" type="button" onClick={resetAll}>
                    Reset all
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <div className="stack">
          <ProviderMapPanel results={searchResults} mapplsPublicKey={mapplsPublicKey || null} surface={surface} />
        </div>
      </div>

      {notice ? <div className="notice warn">{notice}</div> : null}

      <section className="panel panel-pad results-panel">
        <div className="split">
          <div>
            <h2 className="section-title">Results</h2>
            <p className="section-copy">
              {activeMode === "chat"
                ? "Chatbot answer and matching offerings."
                : activeMode === "parameters"
                  ? "Matches from the selected parameters."
                  : "Results from either the chatbot or the parameter search will appear here."}
            </p>
          </div>
          <span className="pill">{searchResults.length} offerings total</span>
        </div>

        {assistantAnswer ? (
          <div className="chat-bubble assistant" style={{ marginBottom: 18 }}>
            <strong>{surface.copilotLabel}</strong>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{assistantAnswer}</div>
          </div>
        ) : null}

        <div className="results-list results-list-two-col">
          {searchResults.length === 0 ? (
            <div className="notice">
              Use either the chatbot or the parameter search above. The matching GRE offerings will show up here.
            </div>
          ) : (
            paginatedResults.map((result) => {
              const trader =
                result.solution?.trader?.organisation_name || result.solution?.trader?.trader_name || "Unknown provider";
              const matchScore = Number(result.matchScore || 0);
              const scoreTone = matchScore >= 100 ? "match-score-high" : "match-score-medium";
              const detailHref = result.detail_href || `/offering/${result.offering_id}`;
              const portalHref = result.portal_url || result.gre_link || "";
              return (
                <article className={`card result-card ${scoreTone}`} key={result.offering_id}>
                  <span className={`match-score-pill ${scoreTone}`}>Relevance Score {matchScore}</span>
                  <div className="result-card-top">
                    <div>
                      {result.source_label ? <span className="tag">{result.source_label}</span> : null}
                      <h3>
                        <TrackedLink
                          className="result-title-link"
                          href={detailHref}
                          prefetch={false}
                          auditEvent={{
                            kind: "view",
                            action: "view_details",
                            itemId: result.offering_id,
                            itemLabel: result.offering_name || "Untitled offering",
                            itemSource: result.source_slug || surface.slug,
                            detailPath: detailHref,
                          }}
                        >
                          {result.offering_name}
                        </TrackedLink>
                      </h3>
                      <p>
                        {trader}
                        {" | "}
                        {result.offering_group || "Uncategorized"}
                        {" | "}
                        {result.domain_6m || "No 6M domain"}
                      </p>
                    </div>
                  </div>
                  <div className="meta-row">
                    {result.primary_valuechain ? <span className="tag">{result.primary_valuechain}</span> : null}
                    {result.primary_application ? <span className="tag">{result.primary_application}</span> : null}
                    {(result.languages || []).slice(0, 3).map((language: string) => (
                      <span className="tag" key={language}>
                        {language}
                      </span>
                    ))}
                  </div>
                  {result.about_offering_text ? <p style={{ marginTop: 14 }}>{result.about_offering_text}</p> : null}
                  <div className="provider-offering-links" style={{ marginTop: 14 }}>
                    <TrackedLink
                      className="result-link"
                      href={detailHref}
                      prefetch={false}
                      auditEvent={{
                        kind: "view",
                        action: "view_details",
                        itemId: result.offering_id,
                        itemLabel: result.offering_name || "Untitled offering",
                        itemSource: result.source_slug || surface.slug,
                        detailPath: detailHref,
                      }}
                    >
                      View details
                    </TrackedLink>
                    {portalHref ? (
                      <TrackedAnchor
                        className="result-link"
                        href={portalHref}
                        target="_blank"
                        rel="noreferrer"
                        auditEvent={{
                          kind: "view",
                          action: "view_portal",
                          itemId: result.offering_id,
                          itemLabel: result.offering_name || "Untitled offering",
                          itemSource: result.source_slug || surface.slug,
                          portalUrl: portalHref,
                        }}
                      >
                        {surface.portalLabel}
                      </TrackedAnchor>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>

        {searchResults.length > RESULTS_PAGE_SIZE ? (
          <div className="results-pagination">
            <button className="btn ghost" type="button" disabled={resultsPage === 1} onClick={() => setResultsPage((page) => Math.max(1, page - 1))}>
              Previous
            </button>
            <span className="pill">
              Page {resultsPage} of {totalPages}
            </span>
            <button className="btn ghost" type="button" disabled={resultsPage === totalPages} onClick={() => setResultsPage((page) => Math.min(totalPages, page + 1))}>
              Next
            </button>
          </div>
        ) : null}
      </section>
      <ShowcaseSections />
    </div>
  );
}
