import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getSurfaceConfigByHost } from "@/lib/surface";
import {
  SHOWCASE_SURFACE_SLUGS,
  hasShowcaseContent,
  normalizeShowcaseContentFromCachePayload
} from "@/lib/showcase-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOWCASE_ALLOWED_ORIGINS = new Set([
  "https://grameee.org",
  "https://www.grameee.org"
]);

function buildShowcaseCorsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  const headers = new Headers();
  if (SHOWCASE_ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return headers;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: buildShowcaseCorsHeaders(request)
  });
}

export async function GET(request: NextRequest) {
  const headers = buildShowcaseCorsHeaders(request);
  try {
    const surface = getSurfaceConfigByHost(request.headers.get("host"));
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("filter_options_cache")
      .select("surface_slug, payload")
      .in("surface_slug", SHOWCASE_SURFACE_SLUGS);

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const ownContent = normalizeShowcaseContentFromCachePayload(
      rows.find((row) => row.surface_slug === surface.slug)?.payload
    );
    const fallbackContent = rows
      .map((row) => normalizeShowcaseContentFromCachePayload(row?.payload))
      .find(hasShowcaseContent);

    return NextResponse.json(hasShowcaseContent(ownContent) ? ownContent : (fallbackContent || ownContent), {
      headers
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Showcase content could not be loaded." },
      { status: 500, headers }
    );
  }
}
