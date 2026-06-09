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

  const [keyword, setKeyword] = useState(initialKeyword || "Goat");
  const [currentKeyword, setCurrentKeyword] = useState(initialKeyword || "Goat");
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
    } else {
      const seed = "Goat";
      void handleSearch(seed, false);
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
      <SixMSearchBar keyword={keyword} onKeywordChange={setKeyword} onSubmit={() => void handleSearch()} loading={loading} />

      {notice ? <div className="sixm-toast notice">{notice}</div> : null}

      {selectedVisualisationOpen ? (
        <SelectedSolutionsVisualization
          keyword={currentKeyword}
          solutions={selectedSolutions}
          onBack={() => setSelectedVisualisationOpen(false)}
          onClearAll={() => setSelectedSolutions([])}
          onCopySummary={copySummary}
          onViewDetails={(solution) => void openDetails(solution)}
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
    </main>
  );
}
