import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

const DEFAULT_TEMPLATE = `Hello,

This is the selected mix of 6M Solutions for the thematic area of {{keyword}}.

{{solutions}}

Regards,
Team GRE`;

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("filter_options_cache")
      .select("payload")
      .in("surface_slug", ["askgre", "supergre"]);

    if (error) throw error;

    const row = (data || []).find((item) =>
      typeof item.payload?.sixmEmailTemplate === "string"
    );

    return NextResponse.json({
      templateBody: row?.payload?.sixmEmailTemplate || DEFAULT_TEMPLATE
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Template could not be loaded." },
      { status: 500 }
    );
  }
}
