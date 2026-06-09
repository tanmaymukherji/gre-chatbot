import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getSurfaceConfigByHost } from "@/lib/surface";
import { getProviderEmailTemplateDefaults } from "@/lib/provider-email-template";

const rowSchema = z.object({
  surface_slug: z.enum(["askgre", "supergre"]),
  payload: z.record(z.string(), z.unknown()).default({})
});

export async function GET(request: NextRequest) {
  try {
    const surface = getSurfaceConfigByHost(request.headers.get("host"));
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("filter_options_cache")
      .select("surface_slug, payload")
      .eq("surface_slug", surface.slug)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const fallback = getProviderEmailTemplateDefaults(surface.slug);
    const parsed = data ? rowSchema.safeParse(data) : null;

    return NextResponse.json({
      surfaceSlug: surface.slug,
      templateBody:
        parsed?.success && typeof parsed.data.payload.providerEmailTemplate === "string" && parsed.data.payload.providerEmailTemplate.trim()
          ? parsed.data.payload.providerEmailTemplate
          : fallback.templateBody
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not load provider email template."
      },
      { status: 500 }
    );
  }
}
