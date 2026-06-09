"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trackImpactCounter } from "@/lib/impact";
import { SIX_M_DOMAINS, SIX_M_META, type SixMDomain, type Solution } from "@/lib/sixm-explorer";
import { getSolutionDetails, searchSolutionsByKeywordAndM, type SolutionDetail } from "@/services/sixm-search-service";
import { SelectedSolutionsBar } from "@/components/6m-explorer/SelectedSolutionsBar";
import { SelectedSolutionsVisualization } from "@/components/6m-explorer/SelectedSolutionsVisualization";
import { SixMHub } from "@/components/6m-explorer/SixMHub";
import { SixMSearchBar } from "@/components/6m-explorer/SixMSearchBar";
import { SixMToggleRow } from "@/components/6m-explorer/SixMToggleRow";
import { SolutionDetailsModal } from "@/components/6m-explorer/SolutionDetailsModal";
import { SolutionDrawer } from "@/components/6m-explorer/SolutionDrawer";

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const parts = document.cookie ? document.cookie.split("; ") : [];
  const prefix = `${name}=`;
  for (const part of parts) {
    if (part.indexOf(prefix) === 0) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return "";
}

function promptSharedLogin() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem("grameee-return-to", window.location.href);
  } catch {}
  const authLink = document.querySelector("[data-auth-link]") as HTMLAnchorElement | null;
  if (authLink) {
    authLink.click();
    return;
  }
  window.location.href = `https://grameee.org/login.html?returnTo=${encodeURIComponent(window.location.href)}`;
}

function ensureViewerAccess() {
  if (readCookie("grameee_user_summary")) {
    return true;
  }
  promptSharedLogin();
  return false;
}

export function SixMExplorerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialKeyword = String(searchParams.get("q") || "").trim();

  const [keyword, setKeyword] = useState(initialKeyword || "");
  const [currentKeyword, setCurrentKeyword] = useState(initialKeyword || "");
  const [activeM, setActiveM] = useState<SixMDomain | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("relevance");
  const [currentResults, setCurrentResults] = useState<Partial<Record<SixMDomain, Solution[]>>>({});
  const [selectedSolutions, setSelectedSolutions] = useState<Solution[]>([]);
  const [detailsModalSolution, setDetailsModalSolution] = useState<SolutionDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedVisualisationOpen, setSelectedVisualisationOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailTemplate, setEmailTemplate] = useState("");

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (initialKeyword) {
      void handleSearch(initialKeyword, false);
    }
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      setDrawerOpen(false);
      setActiveM(null);
      setDetailsModalSolution(null);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        SIX_M_DOMAINS.map((domain) => [domain, currentResults[domain]?.length || 0])
      ) as Partial<Record<SixMDomain, number>>,
    [currentResults]
  );

  async function handleSearch(nextKeyword = keyword, openDefault = true) {
    const trimmed = String(nextKeyword || "").trim();
    if (!trimmed) {
      setNotice("Enter a keyword first to explore the 6M framework.");
      return;
    }

    setLoading(true);
    setNotice(null);
    setCurrentKeyword(trimmed);
    router.replace(`/6m-explorer?q=${encodeURIComponent(trimmed)}`);

    try {
      const responses = await Promise.all(SIX_M_META.map((item) => searchSolutionsByKeywordAndM(trimmed, item.key)));
      const nextResults = responses.reduce((accumulator, response) => {
        accumulator[response.sixMDomain] = response.results;
        return accumulator;
      }, {} as Partial<Record<SixMDomain, Solution[]>>);

      setCurrentResults(nextResults);

      if (openDefault) {
        const firstWithResults = SIX_M_DOMAINS.find((domain) => (nextResults[domain] || []).length > 0) || "Manpower";
        setActiveM(firstWithResults);
        setDrawerOpen(true);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load explorer results.");
    } finally {
      setLoading(false);
    }
  }

  async function openDomain(domain: SixMDomain) {
    setActiveM(domain);
    setDrawerOpen(true);

    if (currentResults[domain]) {
      return;
    }

    setLoading(true);
    try {
      const response = await searchSolutionsByKeywordAndM(currentKeyword, domain);
      setCurrentResults((current) => ({ ...current, [domain]: response.results }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load solutions.");
    } finally {
      setLoading(false);
    }
  }

  function parkSolution(solution: Solution) {
    setSelectedSolutions((current) => {
      if (current.some((item) => item.id === solution.id)) {
        return current;
      }
      return [...current, solution];
    });
  }

  async function openDetails(solution: Solution) {
    if (!ensureViewerAccess()) {
      return;
    }

    setDetailsLoading(true);
    trackImpactCounter("solutions_discovered", 1);

    try {
      const detail = await getSolutionDetails(solution.offeringId);
      setDetailsModalSolution(detail);
    } catch {
      setDetailsModalSolution({
        ...solution,
        summary: solution.description || ""
      });
    } finally {
      setDetailsLoading(false);
    }
  }

  function copySummary(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setNotice("6M summary copied to clipboard.");
    }).catch(() => {
      setNotice("Unable to copy summary right now.");
    });
  }

  return (
    <main className="page-shell sixm-page-shell">
      <SixMSearchBar keyword={keyword} onKeywordChange={setKeyword} onSubmit={() => void handleSearch()} onClearAll={() => { setKeyword(""); setCurrentKeyword(""); setSelectedSolutions([]); setActiveM(null); setDrawerOpen(false); setCurrentResults({}); }} loading={loading} />

      {notice ? <div className="sixm-toast notice">{notice}</div> : null}

      {selectedVisualisationOpen ? (
        <SelectedSolutionsVisualization
          keyword={currentKeyword}
          solutions={selectedSolutions}
          onBack={() => setSelectedVisualisationOpen(false)}
          onCopySummary={copySummary}
          onViewDetails={(solution) => void openDetails(solution)}
          onEmailSelection={async () => {
            setEmailError(null);
            try {
              const tmplResp = await fetch("/api/gre-admin/sixm-email-template");
              const tmplData = await tmplResp.json();
              setEmailTemplate(tmplData?.templateBody || "");
            } catch {}
            setEmailModalOpen(true);
          }}
        />
      ) : (
        <div className="sixm-layout-stack">
          <SixMToggleRow
            activeM={activeM}
            onSelect={(domain) => void openDomain(domain)}
            onCloseAll={() => {
              setDrawerOpen(false);
              setActiveM(null);
            }}
            counts={counts}
          />

          <div className="sixm-explorer-layout">
            <section className="sixm-main-column">
              <SixMHub keyword={currentKeyword} activeM={activeM} onSelect={(domain) => void openDomain(domain)} counts={counts} />
            </section>

            <SolutionDrawer
              open={drawerOpen}
              activeM={activeM}
              keyword={currentKeyword}
              solutions={activeM ? currentResults[activeM] || [] : []}
              parkedIds={selectedSolutions.map((item) => item.id)}
              sortBy={sortBy}
              onSortChange={setSortBy}
              onClose={() => {
                setDrawerOpen(false);
                setActiveM(null);
              }}
              onViewDetails={(solution) => void openDetails(solution)}
              onPark={parkSolution}
            />
          </div>
        </div>
      )}

      {detailsLoading ? <div className="sixm-loading-inline">Loading solution details...</div> : null}

      <SolutionDetailsModal
        solution={detailsModalSolution}
        parked={Boolean(detailsModalSolution && selectedSolutions.some((item) => item.id === detailsModalSolution.id))}
        onClose={() => setDetailsModalSolution(null)}
        onPark={() => {
          if (detailsModalSolution) {
            parkSolution(detailsModalSolution);
          }
        }}
      />

      {!selectedVisualisationOpen ? (
        <SelectedSolutionsBar
          solutions={selectedSolutions}
          onRemove={(id) => setSelectedSolutions((current) => current.filter((item) => item.id !== id))}
          onVisualize={() => setSelectedVisualisationOpen(true)}
        />
      ) : null}

      {emailModalOpen ? (
        <div className="sixm-modal-backdrop" onClick={() => { if (!emailSending) { setEmailModalOpen(false); setEmailError(null); setEmailTemplate(""); } }}>
          <div className="panel panel-pad sixm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="sixm-modal-head">
              <div>
                <h3 className="section-title">Email 6M Selection</h3>
                <p className="section-copy">Review the email before it is sent.</p>
              </div>
            </div>

            <div className="sixm-email-summary" style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              <div style={{ padding: "10px 14px", background: "#f8faf8", borderRadius: 12, border: "1px solid #e7efe8" }}>
                <div style={{ fontSize: "0.82rem", color: "#64806a", marginBottom: 4 }}>From</div>
                <strong>Team GRE &lt;help@greenruraleconomy.in&gt;</strong>
              </div>
              <div style={{ padding: "10px 14px", background: "#f8faf8", borderRadius: 12, border: "1px solid #e7efe8" }}>
                <div style={{ fontSize: "0.82rem", color: "#64806a", marginBottom: 4 }}>To</div>
                <strong>You</strong>
                <small style={{ display: "block", color: "#607064" }}>(logged-in email)</small>
              </div>
              <div style={{ padding: "10px 14px", background: "#f8faf8", borderRadius: 12, border: "1px solid #e7efe8" }}>
                <div style={{ fontSize: "0.82rem", color: "#64806a", marginBottom: 4 }}>Subject</div>
                <strong>6M Mix for {currentKeyword}</strong>
              </div>
            </div>

            <div style={{ padding: 16, background: "#fcfdfc", borderRadius: 12, border: "1px solid #edf3ee", whiteSpace: "pre-wrap", fontSize: "0.88rem", lineHeight: 1.6, maxHeight: 320, overflow: "auto" }}>
              {(() => {
                const solLines = selectedSolutions.map((s, i) => `${i + 1}. [${s.sixMDomains?.[0] || "M"}] ${s.providerName} — ${s.title}\n   ${window.location.origin}/offering/${s.offeringId}`).join("\n\n");
                return (emailTemplate || "Hello,\n\nThis is the selected mix of 6M Solutions for the thematic area of {{keyword}}.\n\n{{solutions}}\n\nRegards,\nTeam GRE")
                  .replace(/\{\{keyword\}\}/g, currentKeyword)
                  .replace(/\{\{solutions\}\}/g, solLines);
              })()}
            </div>

            {emailError ? (
              <div style={{ marginTop: 12, padding: 12, background: "#fef2f2", borderRadius: 12, color: "#991b1b", fontSize: "0.85rem" }}>
                {emailError}
              </div>
            ) : null}

            <div className="sixm-modal-actions" style={{ marginTop: 20 }}>
              <button className="btn ghost" type="button" onClick={() => { setEmailModalOpen(false); setEmailError(null); setEmailTemplate(""); }} disabled={emailSending}>
                Cancel
              </button>
              <button className="btn sixm-primary-btn" type="button" disabled={emailSending} onClick={async () => {
                setEmailSending(true);
                setEmailError(null);
                try {
                  const response = await fetch("/api/sixm-email", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      keyword: currentKeyword,
                      solutions: selectedSolutions.map((s) => ({
                        providerName: s.providerName,
                        offeringName: s.title,
                        detailUrl: `${window.location.origin}/offering/${s.offeringId}`,
                        mDomains: s.sixMDomains || []
                      }))
                    })
                  });
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.error || "Send failed.");
                  setEmailModalOpen(false);
                  setEmailTemplate("");
                  setNotice("6M selection emailed successfully.");
                } catch (error) {
                  setEmailError(error instanceof Error ? error.message : "Email could not be sent.");
                } finally {
                  setEmailSending(false);
                }
              }}>
                {emailSending ? "Sending..." : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
