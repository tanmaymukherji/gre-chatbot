import { NextRequest, NextResponse } from "next/server";
import { runSearch } from "@/lib/database";
import { getSurfaceConfigByHost } from "@/lib/surface";
import { getMockSolutionsForKeyword, mapSearchResultToSolution, type SixMDomain } from "@/lib/sixm-explorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const keyword = String(request.nextUrl.searchParams.get("keyword") || "").trim();
  const sixMDomain = String(request.nextUrl.searchParams.get("sixMDomain") || "").trim() as SixMDomain;

  if (!keyword || !sixMDomain) {
    return NextResponse.json({ error: "Keyword and sixMDomain are required." }, { status: 400 });
  }

  try {
    const surface = getSurfaceConfigByHost(request.headers.get("host"));
    const results = await runSearch({
      surfaceSlug: surface.slug,
      q: keyword,
      strictKeyword: true,
      domain6m: sixMDomain,
      limit: 60
    });

    return NextResponse.json({
      keyword,
      sixMDomain,
      results: results.map(mapSearchResultToSolution),
      source: "live"
    });
  } catch {
    return NextResponse.json({
      keyword,
      sixMDomain,
      results: getMockSolutionsForKeyword(keyword, sixMDomain),
      source: "mock"
    });
  }
}

