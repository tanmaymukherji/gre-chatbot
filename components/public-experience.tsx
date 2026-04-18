"use client";

import { useState } from "react";

const CATEGORY_OPTIONS = ["", "Knowledge", "Service", "Product"];
const DOMAIN_OPTIONS = ["", "Manpower", "Method", "Machine", "Material", "Market", "Money"];

type Filters = {
  category: string;
  domain6m: string;
  offeringType: string;
  valueChain: string;
  application: string;
  language: string;
  geography: string;
};

const EMPTY_FILTERS: Filters = {
  category: "",
  domain6m: "",
  offeringType: "",
  valueChain: "",
  application: "",
  language: "",
  geography: ""
};

export function PublicExperience() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [chatLog, setChatLog] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function runSearch() {
    setSearching(true);
    setNotice(null);

    const params = new URLSearchParams();
    if (query) params.set("q", query);
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    try {
      const response = await fetch(`/api/search?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Search failed.");
      }
      setSearchResults(data.results || []);
      if (!data.results?.length) {
        setNotice("No exact matches yet. Try broader language, geography, or 6M filters.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function askChat() {
    if (!query.trim()) {
      setNotice("Enter a question before sending it to the chatbot.");
      return;
    }

    setChatting(true);
    setNotice(null);
    setChatLog((current) => [...current, { role: "user", content: query }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: query,
          filters
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Chat failed.");
      }

      setSearchResults(data.results || []);
      setChatLog((current) => [...current, { role: "assistant", content: data.answer }]);
    } catch (error) {
      setChatLog((current) => [
        ...current,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Chat failed."
        }
      ]);
    } finally {
      setChatting(false);
    }
  }

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="layout-grid">
      <aside className="panel panel-pad">
        <h2 className="section-title">Guided search</h2>
        <p className="section-copy">
          Blend structured filters with natural language so people can browse offerings by category, 6M domain,
          value chain, application, geography, and language.
        </p>

        <div className="stack">
          <div className="field">
            <label htmlFor="query">Question or search term</label>
            <textarea
              id="query"
              placeholder="Example: Find knowledge offerings in goat farming available in Hindi."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" value={filters.category} onChange={(event) => updateFilter("category", event.target.value)}>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option || "all"} value={option}>
                  {option || "All categories"}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="domain6m">6M domain</label>
            <select id="domain6m" value={filters.domain6m} onChange={(event) => updateFilter("domain6m", event.target.value)}>
              {DOMAIN_OPTIONS.map((option) => (
                <option key={option || "all"} value={option}>
                  {option || "All 6M domains"}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="offeringType">Offering type</label>
            <input
              id="offeringType"
              value={filters.offeringType}
              onChange={(event) => updateFilter("offeringType", event.target.value)}
              placeholder="Training, SOP manuals, consulting..."
            />
          </div>

          <div className="field">
            <label htmlFor="valueChain">Value chain</label>
            <input
              id="valueChain"
              value={filters.valueChain}
              onChange={(event) => updateFilter("valueChain", event.target.value)}
              placeholder="Fruits, Bamboo, Livestock..."
            />
          </div>

          <div className="field">
            <label htmlFor="application">Application</label>
            <input
              id="application"
              value={filters.application}
              onChange={(event) => updateFilter("application", event.target.value)}
              placeholder="Business Training, Goat, Food Processing..."
            />
          </div>

          <div className="field">
            <label htmlFor="language">Language</label>
            <input
              id="language"
              value={filters.language}
              onChange={(event) => updateFilter("language", event.target.value)}
              placeholder="HIN, ENG, KANNADA..."
            />
          </div>

          <div className="field">
            <label htmlFor="geography">Geography</label>
            <input
              id="geography"
              value={filters.geography}
              onChange={(event) => updateFilter("geography", event.target.value)}
              placeholder="India, Karnataka, Mysore..."
            />
          </div>

          <div className="actions">
            <button className="btn" type="button" disabled={searching} onClick={runSearch}>
              {searching ? "Searching..." : "Search records"}
            </button>
            <button className="btn secondary" type="button" disabled={chatting} onClick={askChat}>
              {chatting ? "Thinking..." : "Ask chatbot"}
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setQuery("");
                setSearchResults([]);
                setChatLog([]);
                setNotice(null);
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </aside>

      <section className="stack">
        {notice ? <div className="notice warn">{notice}</div> : null}

        <div className="panel panel-pad">
          <div className="split">
            <div>
              <h2 className="section-title">Chat transcript</h2>
              <p className="section-copy">Responses stay grounded in the retrieved GRE records.</p>
            </div>
            <span className="pill">{chatLog.length} messages</span>
          </div>

          <div className="chat-log">
            {chatLog.length === 0 ? (
              <div className="notice">
                Start with a question like "Show service offerings in natural farming available offline in Karnataka."
              </div>
            ) : (
              chatLog.map((entry, index) => (
                <div className={`chat-bubble ${entry.role}`} key={`${entry.role}-${index}`}>
                  <strong>{entry.role === "user" ? "You" : "GRE Copilot"}</strong>
                  <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{entry.content}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel panel-pad">
          <div className="split">
            <div>
              <h2 className="section-title">Matching offerings</h2>
              <p className="section-copy">These cards are what the chatbot reasons over before answering.</p>
            </div>
            <span className="pill">{searchResults.length} results</span>
          </div>

          <div className="results-list">
            {searchResults.length === 0 ? (
              <div className="notice">No search results yet. Run a search or ask the chatbot to populate this panel.</div>
            ) : (
              searchResults.map((result) => {
                const trader =
                  result.solution?.trader?.organisation_name || result.solution?.trader?.trader_name || "Unknown provider";
                return (
                  <article className="card" key={result.offering_id}>
                    <h3>{result.offering_name}</h3>
                    <p>
                      {trader}
                      {" | "}
                      {result.offering_group || "Uncategorized"}
                      {" | "}
                      {result.domain_6m || "No 6M domain"}
                    </p>
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
                    {result.gre_link ? (
                      <p style={{ marginTop: 14 }}>
                        <a href={result.gre_link} target="_blank" rel="noreferrer">
                          View on GRE
                        </a>
                      </p>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
