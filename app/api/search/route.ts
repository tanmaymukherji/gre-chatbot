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
    const keywordAddedStructuredFilter = Boolean(
      baseFilters.q &&
        (
          (!baseFilters.category && inferredFilters.category) ||
          (!baseFilters.domain6m && inferredFilters.domain6m) ||
          (!baseFilters.offeringType && inferredFilters.offeringType) ||
          (!baseFilters.valueChain && inferredFilters.valueChain) ||
          (!baseFilters.application && inferredFilters.application) ||
          (!baseFilters.tag && inferredFilters.tag) ||
          (!baseFilters.language && inferredFilters.language) ||
          (!baseFilters.geography && inferredFilters.geography)
        )
    );

    const results = await runSearch({
      ...inferredFilters,
      q: keywordAddedStructuredFilter ? undefined : baseFilters.q,
      strictKeyword: keywordAddedStructuredFilter ? false : baseFilters.strictKeyword
    });

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed." },
      { status: 500 }
    );
  }
}
