"use client";

import { useState } from "react";

const CATEGORY_OPTIONS = ["", "Knowledge", "Service", "Product"];
const DOMAIN_OPTIONS = ["", "Manpower", "Method", "Machine", "Material", "Market", "Money"];
const OFFERING_TYPE_OPTIONS = [
  "",
  "Sop manuals",
  "Tech transfer",
  "Training",
  "Machinery",
  "Videos",
  "Consulting",
  "Market support",
  "Blogs",
  "Market reports",
  "Product bought",
  "Raw material",
  "Plant setup",
  "Financial support"
];
const VALUE_CHAIN_OPTIONS = [
  "",
  "Entrepreneurship",
  "Livestock",
  "Farming",
  "Bamboo",
  "Millets",
  "Food Products",
  "Cereals",
  "Bakery",
  "Fruits",
  "Beverages",
  "Vegetables",
  "Poultry",
  "Rural"
];
const APPLICATION_OPTIONS = [
  "",
  "Business Training",
  "Goat",
  "Nano Enterprises",
  "Food Processing",
  "Natural Farming",
  "Food Products",
  "Vegetables",
  "Chicken",
  "Fruits",
  "Community Development"
];
const LANGUAGE_OPTIONS = [
  "",
  "ENG",
  "HIN",
  "KANNADA",
  "MARATHI",
  "MALAYALAM",
  "TAMIL",
  "TELGU",
  "BENGALI",
  "ODIA",
  "PUNJABI"
];
const GEOGRAPHY_OPTIONS = [
  "",
  "India",
  "Karnataka",
  "Mysore, Karnataka, India",
  "Jharkhand",
  "Maharashtra",
  "Punjab",
  "Odisha",
  "Kerala",
  "Tamil Nadu",
  "Telangana",
  "Bihar",
  "Uttar Pradesh"
];

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
  const [chatQuery, setChatQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [assistantAnswer, setAssistantAnswer] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<"chat" | "parameters" | null>(null);

  async function runSearch() {
    setSearching(true);
    setNotice(null);
    setAssistantAnswer(null);
    setActiveMode("parameters");

    const params = new URLSearchParams();
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
          filters: {}
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Chat failed.");
      }

      setSearchResults(data.results || []);
      setAssistantAnswer(data.answer || null);
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
  }

  return (
    <div className="stack">
      <div className="query-grid">
        <section className="panel panel-pad">
          <h2 className="section-title">Chatbot</h2>
          <p className="section-copy">
            Ask a natural-language question here. This mode ignores the parameter form and searches the GRE dataset as a chat request.
          </p>

          <div className="stack">
            <div className="field">
              <label htmlFor="chatQuery">Question for GRE Copilot</label>
              <textarea
                id="chatQuery"
                placeholder='Example: Show knowledge offerings for goat farming in Hindi.'
                value={chatQuery}
                onChange={(event) => setChatQuery(event.target.value)}
              />
            </div>

            <div className="actions">
              <button className="btn secondary" type="button" disabled={chatting} onClick={askChat}>
                {chatting ? "Thinking..." : "Ask chatbot"}
              </button>
            </div>
          </div>
        </section>

        <section className="panel panel-pad">
          <h2 className="section-title">Parameter Search</h2>
          <p className="section-copy">
            Use filters only. This mode does not need a chatbot question and works independently of the chat box.
          </p>

          <div className="filter-grid">
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
              <select id="offeringType" value={filters.offeringType} onChange={(event) => updateFilter("offeringType", event.target.value)}>
                {OFFERING_TYPE_OPTIONS.map((option) => (
                  <option key={option || "all"} value={option}>
                    {option || "All offering types"}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="valueChain">Value chain</label>
              <select id="valueChain" value={filters.valueChain} onChange={(event) => updateFilter("valueChain", event.target.value)}>
                {VALUE_CHAIN_OPTIONS.map((option) => (
                  <option key={option || "all"} value={option}>
                    {option || "All value chains"}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="application">Application</label>
              <select id="application" value={filters.application} onChange={(event) => updateFilter("application", event.target.value)}>
                {APPLICATION_OPTIONS.map((option) => (
                  <option key={option || "all"} value={option}>
                    {option || "All applications"}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="language">Language</label>
              <select id="language" value={filters.language} onChange={(event) => updateFilter("language", event.target.value)}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option || "all"} value={option}>
                    {option || "All languages"}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="geography">Geography</label>
              <select id="geography" value={filters.geography} onChange={(event) => updateFilter("geography", event.target.value)}>
                {GEOGRAPHY_OPTIONS.map((option) => (
                  <option key={option || "all"} value={option}>
                    {option || "All geographies"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="actions" style={{ marginTop: 18 }}>
            <button className="btn" type="button" disabled={searching} onClick={runSearch}>
              {searching ? "Searching..." : "Run parameter search"}
            </button>
            <button className="btn ghost" type="button" onClick={resetAll}>
              Reset all
            </button>
          </div>
        </section>
      </div>

      {notice ? <div className="notice warn">{notice}</div> : null}

      <section className="panel panel-pad">
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
          <span className="pill">{searchResults.length} results</span>
        </div>

        {assistantAnswer ? (
          <div className="chat-bubble assistant" style={{ marginBottom: 18 }}>
            <strong>GRE Copilot</strong>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{assistantAnswer}</div>
          </div>
        ) : null}

        <div className="results-list">
          {searchResults.length === 0 ? (
            <div className="notice">
              Use either the chatbot or the parameter search above. The matching GRE offerings will show up here.
            </div>
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
      </section>
    </div>
  );
}
