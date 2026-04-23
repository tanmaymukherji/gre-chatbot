import { NextRequest, NextResponse } from "next/server";
import { inferSearchFilters, runSearch } from "@/lib/database";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const baseFilters = {
      q: params.get("q") || undefined,
      strictKeyword: Boolean(params.get("q") || undefined),
      solutionProvider: params.get("solutionProvider") || undefined,
      category: params.get("category") || undefined,
      domain6m: params.get("domain6m") || undefined,
      offeringType: params.get("offeringType") || undefined,
      valueChain: params.get("valueChain") || undefined,
      application: params.get("application") || undefined,
      tag: params.get("tag") || undefined,
      language: params.get("language") || undefined,
      geography: params.get("geography") || undefined,
      limit: Number(params.get("limit") || 250)
    };
    const inferredFilters = inferSearchFilters(baseFilters, baseFilters.q);
    const inferredStructuredKeyword = Boolean(
      baseFilters.q &&
        !baseFilters.solutionProvider &&
        !baseFilters.category &&
        !baseFilters.domain6m &&
        !baseFilters.offeringType &&
        !baseFilters.valueChain &&
        !baseFilters.application &&
        !baseFilters.tag &&
        !baseFilters.language &&
        !baseFilters.geography &&
        (
          inferredFilters.category ||
          inferredFilters.domain6m ||
          inferredFilters.offeringType ||
          inferredFilters.valueChain ||
          inferredFilters.application ||
          inferredFilters.tag ||
          inferredFilters.language ||
          inferredFilters.geography
        )
    );

    const results = await runSearch({
      ...inferredFilters,
      q: inferredStructuredKeyword ? undefined : baseFilters.q,
      strictKeyword: inferredStructuredKeyword ? false : baseFilters.strictKeyword
    });

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed." },
      { status: 500 }
    );
  }
}
