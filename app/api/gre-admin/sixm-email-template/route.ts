import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdminUser } from "@/lib/auth";
import { z } from "zod";

const DEFAULT_TEMPLATE = `Hello,

This is the selected mix of 6M Solutions for the thematic area of {{keyword}}.

{{solutions}}

Regards,
Team GRE`;

const updateSchema = z.object({
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

    if (error) throw error;

    const rows = (data || []).filter((r) =>
      typeof r.payload?.sixmEmailTemplate === "string"
    );
    const templateBody = rows[0]?.payload?.sixmEmailTemplate || DEFAULT_TEMPLATE;

    return NextResponse.json({ templateBody });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Admin login required." },
      { status: 401 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const payload = updateSchema.parse(await request.json());
    const supabase = createServerSupabaseClient();

    const { data: existingRow } = await supabase
      .from("filter_options_cache")
      .select("payload")
      .eq("surface_slug", "askgre")
      .maybeSingle();

    const { error } = await supabase
      .from("filter_options_cache")
      .upsert(
        {
          surface_slug: "askgre",
          payload: {
            ...(existingRow?.payload && typeof existingRow.payload === "object" ? existingRow.payload : {}),
            sixmEmailTemplate: payload.templateBody
          },
          updated_at: new Date().toISOString()
        },
        { onConflict: "surface_slug" }
      );

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Template could not be saved." },
      { status: 400 }
    );
  }
}
