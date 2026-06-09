"use client";

import type { SixMDomain, Solution } from "@/lib/sixm-explorer";

export type SixMSearchResponse = {
  keyword: string;
  sixMDomain: SixMDomain;
  results: Solution[];
  source: "live" | "mock";
};

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

  const response = await fetch(`/api/6m-explorer/search?${params.toString()}`, {
    cache: "no-store"
  });
  const payload = (await response.json()) as SixMSearchResponse | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Unable to load 6M solutions.");
  }

  return payload as SixMSearchResponse;
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

