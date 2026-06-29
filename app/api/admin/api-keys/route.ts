import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdminUser } from "@/lib/auth";
import bcrypt from "bcryptjs";

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "gre_";
  const randomValues = new Uint8Array(24);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(randomValues);
  } else {
    for (let i = 0; i < 24; i++) {
      randomValues[i] = Math.floor(Math.random() * 256);
    }
  }
  for (let i = 0; i < 24; i++) {
    key += chars.charAt(randomValues[i] % chars.length);
  }
  return key;
}

const createSchema = z.object({
  org_name: z.string().trim().min(1, "Organisation name is required"),
});

const updateSchema = z.object({
  is_active: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireAdminUser(request);
  } catch {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("gre_api_keys")
      .select("id, api_key_prefix, org_name, created_at, last_used_at, is_active")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      keys: (data || []).map((k: any) => ({
        id: k.id,
        prefix: k.api_key_prefix,
        org_name: k.org_name,
        created_at: k.created_at,
        last_used_at: k.last_used_at,
        is_active: k.is_active,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load API keys." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireAdminUser(request);
  } catch {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }

  try {
    const body = createSchema.parse(await request.json());
    const plainKey = generateApiKey();
    const prefix = plainKey.slice(0, 12);
    const hash = await bcrypt.hash(plainKey, 12);

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("gre_api_keys")
      .insert({
        api_key_hash: hash,
        api_key_prefix: prefix,
        org_name: body.org_name,
        is_active: true,
      })
      .select("id, api_key_prefix, org_name, created_at, is_active")
      .single();

    if (error) throw error;

    return NextResponse.json(
      {
        id: data.id,
        prefix: data.api_key_prefix,
        org_name: data.org_name,
        created_at: data.created_at,
        is_active: data.is_active,
        api_key: plainKey,
        warning:
          "This is the only time the full API key will be shown. Copy it now and store it securely.",
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || "Invalid input." }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create API key." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  let session;
  try {
    session = await requireAdminUser(request);
  } catch {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }

  try {
    const body = updateSchema.parse(await request.json());
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing key id." }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const updates: Record<string, unknown> = {};
    if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

    const { error } = await supabase
      .from("gre_api_keys")
      .update(updates)
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message || "Invalid input." }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update API key." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  let session;
  try {
    session = await requireAdminUser(request);
  } catch {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing key id." }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("gre_api_keys").delete().eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete API key." },
      { status: 500 }
    );
  }
}