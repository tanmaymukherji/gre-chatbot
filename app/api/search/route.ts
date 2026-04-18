import { NextRequest, NextResponse } from "next/server";
import { runSearch } from "@/lib/database";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const results = await runSearch({
      q: params.get("q") || undefined,
      category: params.get("category") || undefined,
      domain6m: params.get("domain6m") || undefined,
      offeringType: params.get("offeringType") || undefined,
      valueChain: params.get("valueChain") || undefined,
      application: params.get("application") || undefined,
      language: params.get("language") || undefined,
      geography: params.get("geography") || undefined,
      limit: Number(params.get("limit") || 12)
    });

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed." },
      { status: 500 }
    );
  }
}
