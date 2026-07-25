import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { runSearch, inferSearchFilters } from "@/lib/database";
import type { SearchFilters } from "@/lib/types";
import { translateToEnglish, detectLanguage } from "@/lib/translate";
import { recordSolutionDeliveryImpactOnServer } from "@/lib/server-solution-delivery-impact";

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

function splitQuery(query: string): string[] {
  const parts = query
    .split(/[,;.]+/)
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter((p) => p.split(/\s+/).filter(Boolean).length >= 2);
  return parts.length > 1 ? parts : [];
}

async function searchSingleQuery(searchQuery: string) {
  const inferredFilters = inferSearchFilters({ surfaceSlug: "askgre" as any, q: searchQuery, limit: 50 }, searchQuery);

  const results = await runSearch({
    ...inferredFilters,
    surfaceSlug: "askgre" as any,
    q: inferredFilters.q,
    strictKeyword: false,
  });

  return results.filter((row) => (row.matchScore || row.score || 0) > MIN_RELEVANCE_SCORE);
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

    const subQueries = splitQuery(searchQuery);
    let allResults: any[];

    if (subQueries.length > 0) {
      const resultSets = await Promise.all(subQueries.map((sq) => searchSingleQuery(sq)));
      const merged = new Map<string, any>();
      for (const set of resultSets) {
        for (const row of set) {
          const key = row.offering_id || row.offering_name;
          if (!key) continue;
          const existing = merged.get(key);
          if (!existing || (row.matchScore || 0) > (existing.matchScore || 0)) {
            merged.set(key, row);
          }
        }
      }
      allResults = Array.from(merged.values());
    } else {
      allResults = await searchSingleQuery(searchQuery);
    }

    const prioritized = applyCategoryPrioritization(allResults).slice(0, 50);

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

    if (solutions.length) {
      recordSolutionDeliveryImpactOnServer({
        source: "askgre-match-api",
        action: "match_api_solution_links_returned",
        keyword: rawQuery,
        solutions: solutions.map((solution) => ({
          providerName: solution.provider_name,
          offeringName: solution.offering_name,
          detailUrl: solution.offering_link,
          mDomains: [solution["6m_type"]].filter(Boolean),
        })),
        actorEmail: request.headers.get("api_key") || request.headers.get("x-api-key") || "system:match-api",
        actorName: "AskGRE Match API",
        actorRole: "api",
        recipientName: "API user",
        subject: `Match API returned ${solutions.length} solution link${solutions.length === 1 ? "" : "s"}`,
      }).catch((error) => {
        console.error("[/api/match] Impact logging failed:", error);
      });
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
