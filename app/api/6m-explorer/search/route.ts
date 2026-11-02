import { NextRequest, NextResponse } from "next/server";
import { runSearch } from "@/lib/database";
import { getSurfaceConfigByHost } from "@/lib/surface";
import { mapSearchResultToSolution, SIX_M_DOMAINS, type SixMDomain } from "@/lib/sixm-explorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const keyword = String(request.nextUrl.searchParams.get("keyword") || "").trim();
  const sixMDomain = String(request.nextUrl.searchParams.get("sixMDomain") || "").trim() as SixMDomain;

  if (!keyword) {
    return NextResponse.json({ error: "Keyword is required." }, { status: 400 });
  }

  if (sixMDomain && !SIX_M_DOMAINS.includes(sixMDomain)) {
    return NextResponse.json({ error: "Invalid sixMDomain." }, { status: 400 });
  }

  try {
    const surface = getSurfaceConfigByHost(request.headers.get("host"));
    const searchDomain = async (domain: SixMDomain) => {
      const results = await runSearch({
        surfaceSlug: surface.slug,
        q: keyword,
        strictKeyword: true,
        domain6m: domain,
        limit: 60
      });

      return results.map(mapSearchResultToSolution);
    };

    if (!sixMDomain) {
      const resultsByDomain: Partial<Record<SixMDomain, Awaited<ReturnType<typeof searchDomain>>>> = {};

      // Keep these searches in one server invocation. The first search loads the
      // shared data once; the remaining domains reuse that data without creating
      // six simultaneous full-table Supabase queries on a cold start.
      for (const domain of SIX_M_DOMAINS) {
        resultsByDomain[domain] = await searchDomain(domain);
      }

      return NextResponse.json({
        keyword,
        resultsByDomain,
        source: "live"
      });
    }

    const results = await searchDomain(sixMDomain);

    return NextResponse.json({
      keyword,
      sixMDomain,
      results,
      source: "live"
    });
  } catch (error) {
    console.error("6M Explorer search failed", {
      keyword,
      sixMDomain: sixMDomain || "all",
      message: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { error: "The 6M search service is temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }
}

