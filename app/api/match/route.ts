import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { runSearch, inferSearchFilters } from "@/lib/database";
import type { SearchFilters } from "@/lib/types";
import { translateToEnglish, detectLanguage } from "@/lib/translate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

const MIN_RELEVANCE_SCORE = 20;
const CATEGORY_ORDER: Record<string, number> = {
  Service: 1,
  Product: 2,
  Knowledge: 3,
};
const DEFAULT_CATEGORY_SCORE = 99;

function get6mType(domain6m: string | null | undefined): string {
  if (!domain6m) return "Method";
  const d = domain6m.toLowerCase();
  if (d.includes("manpower") || d.includes("man")) return "Manpower";
  if (d.includes("machine") || d.includes("machine") || d.includes("equipment")) return "Machine";
  if (d.includes("material") || d.includes("raw material")) return "Material";
  if (d.includes("market") || d.includes("market")) return "Market";
  if (d.includes("money") || d.includes("finance") || d.includes("fund")) return "Money";
  return "Method";
}

function applyCategoryPrioritization(rows: any[]): any[] {
  return rows.sort((a, b) => {
    const scoreA = a.matchScore ?? a.score ?? 0;
    const scoreB = b.matchScore ?? b.score ?? 0;
    const gap = Math.abs(scoreB - scoreA);
    if (gap > 5) return scoreB - scoreA;
    const catA = CATEGORY_ORDER[a.offering_group] ?? DEFAULT_CATEGORY_SCORE;
    const catB = CATEGORY_ORDER[b.offering_group] ?? DEFAULT_CATEGORY_SCORE;
    if (catA !== catB) return catA - catB;
    return scoreB - scoreA;
  });
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const rawQuery = String(params.get("q") || "").trim();

    if (!rawQuery) {
      return NextResponse.json(
        { error: "Missing required parameter: q (the need statement)" },
        { status: 400 }
      );
    }

    const detectedLang = detectLanguage(rawQuery);
    let searchQuery = rawQuery;
    let translatedFrom: string | undefined;

    if (detectedLang !== "en") {
      const { translated, detectedLang: detected } = await translateToEnglish(rawQuery, detectedLang);
      if (translated !== rawQuery) {
        searchQuery = translated;
        translatedFrom = detectedLang;
      }
    }

    const inferredFilters = inferSearchFilters({ surfaceSlug: "askgre" as any, q: searchQuery, limit: 50 }, searchQuery);

    const results = await runSearch({
      ...inferredFilters,
      surfaceSlug: "askgre" as any,
      q: inferredFilters.q,
      strictKeyword: false,
    });

    const filtered = results.filter((row) => (row.matchScore || row.score || 0) > MIN_RELEVANCE_SCORE);
    const prioritized = applyCategoryPrioritization(filtered);

    const solutions = prioritized.map((row, index) => ({
      serial: index + 1,
      "6m_type": get6mType(row.domain_6m),
      provider_name:
        row.solution?.trader?.organisation_name ||
        row.solution?.trader?.trader_name ||
        "Unknown",
      offering_name: row.offering_name || "Untitled offering",
      offering_link: `https://askgre.grameee.org/offering/${row.offering_id}`,
    }));

    const response: Record<string, any> = {
      query: rawQuery,
      total: solutions.length,
      solutions,
    };

    if (translatedFrom) {
      response.translated_from = translatedFrom;
      response.translated_query = searchQuery;
    }

    const inferred: Record<string, string> = {};
    const filters = inferredFilters as SearchFilters;
    if (filters.language) inferred.language = filters.language;
    if (filters.geography) inferred.geography = filters.geography;
    if (filters.application) inferred.application = filters.application;
    if (filters.valueChain) inferred.valueChain = filters.valueChain;
    if (filters.domain6m) inferred.domain6m = filters.domain6m;
    if (filters.offeringType) inferred.offeringType = filters.offeringType;
    if (Object.keys(inferred).length > 0) {
      response.filters_inferred = inferred;
    }

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[/api/match] Error:", error);
    return NextResponse.json(
      {
        error: "Search service temporarily unavailable. Please try again.",
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, api_key",
    },
  });
}