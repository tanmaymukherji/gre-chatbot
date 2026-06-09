import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdminUser } from "@/lib/auth";
import {
  SHARED_SHOWCASE_PAYLOAD_KEY,
  SHOWCASE_SURFACE_SLUGS,
  hasShowcaseContent,
  normalizeShowcaseContentFromCachePayload
} from "@/lib/showcase-content";

const featureSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  writeup: z.string().trim().min(1),
  imageUrl: z.string().trim().min(1),
  linkUrl: z.string().trim().optional()
});

const partnerSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  logoUrl: z.string().trim().optional().default(""),
  websiteUrl: z.string().trim().optional()
});

const updateSchema = z.object({
  features: z.array(featureSchema).optional(),
  partners: z.array(partnerSchema).optional()
});

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Admin login required." },
      { status: 401 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("filter_options_cache")
      .select("surface_slug, payload")
      .in("surface_slug", SHOWCASE_SURFACE_SLUGS);

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const content = rows
      .map((row) => normalizeShowcaseContentFromCachePayload(row?.payload))
      .find(hasShowcaseContent)
      || normalizeShowcaseContentFromCachePayload(rows[0]?.payload);

    return NextResponse.json(content);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Showcase content could not be loaded." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireAdminUser(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Admin login required." },
      { status: 401 }
    );
  }

  try {
    const payload = updateSchema.parse(await request.json());
    const supabase = createServerSupabaseClient();
    const { data: existingRow, error: readError } = await supabase
      .from("filter_options_cache")
      .select("surface_slug, payload")
      .in("surface_slug", SHOWCASE_SURFACE_SLUGS);

    if (readError) throw readError;
    const existingBySurface = new Map((existingRow || []).map((row) => [String(row.surface_slug), row.payload]));

    const { error } = await supabase
      .from("filter_options_cache")
      .upsert(
        SHOWCASE_SURFACE_SLUGS.map((surfaceSlug) => {
          const existingPayload = existingBySurface.get(surfaceSlug);
          const currentShowcase = (existingPayload && typeof existingPayload === "object"
            ? (existingPayload as Record<string, unknown>)[SHARED_SHOWCASE_PAYLOAD_KEY]
            : {}) as Record<string, unknown> || {};
          return {
            surface_slug: surfaceSlug,
            payload: {
              ...(existingPayload && typeof existingPayload === "object" ? existingPayload : {}),
              [SHARED_SHOWCASE_PAYLOAD_KEY]: {
                greFeatures: payload.features !== undefined ? payload.features : (currentShowcase.greFeatures || []),
                consortiumPartners: payload.partners !== undefined ? payload.partners : (currentShowcase.consortiumPartners || [])
              }
            },
            updated_at: new Date().toISOString()
          };
        }),
        { onConflict: "surface_slug" }
      );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Showcase content could not be saved." },
      { status: 400 }
    );
  }
}
