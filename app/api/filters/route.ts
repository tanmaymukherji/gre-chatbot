import { NextRequest, NextResponse } from "next/server";
import { getFilterOptions } from "@/lib/database";
import { getSurfaceConfigByHost } from "@/lib/surface";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const surface = getSurfaceConfigByHost(request.headers.get("host"));
    const options = await getFilterOptions(surface.slug);
    return NextResponse.json(options, {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=600"
      }
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "object"
        ? JSON.stringify(error)
        : String(error || "Failed to load filter options.");
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
