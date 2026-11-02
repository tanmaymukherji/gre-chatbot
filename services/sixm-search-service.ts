"use client";

import type { SixMDomain, Solution } from "@/lib/sixm-explorer";

export type SixMSearchResponse = {
  keyword: string;
  sixMDomain: SixMDomain;
  results: Solution[];
  source: "live";
};

export type SixMGroupedSearchResponse = {
  keyword: string;
  resultsByDomain: Partial<Record<SixMDomain, Solution[]>>;
  source: "live";
};

const SIX_M_SEARCH_TIMEOUT_MS = 45_000;

async function fetchSixMSearch(params: URLSearchParams) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SIX_M_SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(`/api/6m-explorer/search?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal
    });
    const payload = (await response.json()) as SixMSearchResponse | SixMGroupedSearchResponse | { error?: string };

    if (!response.ok) {
      throw new Error("error" in payload && payload.error ? payload.error : "Unable to load 6M solutions.");
    }

    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The 6M search took too long. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function searchSolutionsByKeyword(keyword: string) {
  const params = new URLSearchParams({ keyword });
  return (await fetchSixMSearch(params)) as SixMGroupedSearchResponse;
}

export type SolutionDetail = Solution & {
  sourceSlug?: string;
  providerWebsite?: string;
  sixMClassification?: string;
  offeringGroup?: string;
  geographyList?: string[];
  languages?: string[];
  contactEmail?: string;
  contactPhone?: string;
  trainerName?: string;
  summary?: string;
};

export async function searchSolutionsByKeywordAndM(keyword: string, sixMDomain: SixMDomain) {
  const params = new URLSearchParams({
    keyword,
    sixMDomain
  });

  return (await fetchSixMSearch(params)) as SixMSearchResponse;
}

export async function getSolutionDetails(offeringId: string) {
  const response = await fetch(`/api/6m-explorer/offering/${encodeURIComponent(offeringId)}`, {
    cache: "no-store"
  });
  const payload = (await response.json()) as SolutionDetail | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Unable to load solution details.");
  }

  return payload as SolutionDetail;
}

