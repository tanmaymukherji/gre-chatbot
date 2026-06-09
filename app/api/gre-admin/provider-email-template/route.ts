import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdminUser } from "@/lib/auth";
import { getProviderEmailTemplateDefaults } from "@/lib/provider-email-template";
import { z } from "zod";

const updateSchema = z.object({
  surfaceSlug: z.enum(["askgre", "supergre"]),
  templateBody: z.string().trim().min(1)
});

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("filter_options_cache")
      .select("surface_slug, payload")
      .in("surface_slug", ["askgre", "supergre"]);

    if (error) {
      throw error;
    }

    const rows = new Map(
      (data || []).map((item) => [
        String(item.surface_slug),
        typeof item.payload?.providerEmailTemplate === "string" ? String(item.payload.providerEmailTemplate) : ""
      ])
    );

    return NextResponse.json({
      items: ["askgre", "supergre"].map((surfaceSlug) => ({
        surfaceSlug,
        templateBody: rows.get(surfaceSlug) || getProviderEmailTemplateDefaults(surfaceSlug as "askgre" | "supergre").templateBody
      }))
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Admin login required."
      },
      { status: 401 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const payload = updateSchema.parse(await request.json());
    const supabase = createServerSupabaseClient();
    const { data: existingRow, error: readError } = await supabase
      .from("filter_options_cache")
      .select("payload")
      .eq("surface_slug", payload.surfaceSlug)
      .maybeSingle();

    if (readError) {
      throw readError;
    }

    const { error } = await supabase
      .from("filter_options_cache")
      .upsert(
        {
          surface_slug: payload.surfaceSlug,
          payload: {
            ...(existingRow?.payload && typeof existingRow.payload === "object" ? existingRow.payload : {}),
            providerEmailTemplate: payload.templateBody
          },
          updated_at: new Date().toISOString()
        },
        { onConflict: "surface_slug" }
      );

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Provider email template could not be saved."
      },
      { status: 400 }
    );
  }
}
