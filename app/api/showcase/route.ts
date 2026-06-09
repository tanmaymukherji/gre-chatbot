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

export async function GET(request: NextRequest) {
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

    return NextResponse.json(hasShowcaseContent(ownContent) ? ownContent : (fallbackContent || ownContent));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Showcase content could not be loaded." },
      { status: 500 }
    );
  }
}
