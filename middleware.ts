import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/api/search",
  "/api/chat",
  "/api/filters",
  "/api/6m-explorer",
  "/api/provider",
  "/api/offering",
  "/api/showcase",
  "/api/impact",
  "/api/map-config",
];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith("/api/match")) {
    return NextResponse.next();
  }

  const apiKey =
    request.nextUrl.searchParams.get("api_key") ||
    request.headers.get("Authorization")?.replace("Bearer ", "");

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "API key required. Pass ?api_key=<key> or Authorization: Bearer <key>",
      },
      { status: 401 }
    );
  }

  const valid = await validateApiKey(apiKey);
  if (!valid) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/match/:path*"],
};

async function validateApiKey(key: string): Promise<boolean> {
  try {
    const { createServerSupabaseClient } = await import("@/lib/supabase");
    const supabase = createServerSupabaseClient();

    if (!key || key.length < 8) {
      return false;
    }

    const prefix = key.slice(0, 12);

    const { data, error } = await supabase
      .from("gre_api_keys")
      .select("id, is_active")
      .eq("api_key_prefix", prefix)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data) {
      return false;
    }

    const bcrypt = await import("bcryptjs");
    const { data: keyData } = await supabase
      .from("gre_api_keys")
      .select("api_key_hash")
      .eq("id", data.id)
      .single();

    if (!keyData?.api_key_hash) {
      return false;
    }

    const valid = await bcrypt.compare(key, keyData.api_key_hash);

    if (valid) {
      await supabase
        .from("gre_api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", data.id);
    }

    return valid;
  } catch {
    return false;
  }
}