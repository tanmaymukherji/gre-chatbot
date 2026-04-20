import { NextResponse } from "next/server";
import { getFilterOptions } from "@/lib/database";

export const revalidate = 600;

export async function GET() {
  try {
    const options = await getFilterOptions();
    return NextResponse.json(options, {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=600"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load filter options." },
      { status: 500 }
    );
  }
}
