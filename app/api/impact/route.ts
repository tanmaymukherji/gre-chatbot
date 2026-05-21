import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";

function impactFunctionUrl() {
  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return {
    url: `${env.supabaseUrl}/functions/v1/grameee-admin`,
    anonKey: env.supabaseAnonKey,
  };
}

async function callImpactFunction(body: Record<string, unknown>) {
  const { url, anonKey } = impactFunctionUrl();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "Impact request failed.");
  }

  return data;
}

export async function GET() {
  try {
    const data = await callImpactFunction({ action: "getImpactCounters" });
    return NextResponse.json({ counters: data?.counters || {} }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impact counters could not be loaded." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({}));
    const data = await callImpactFunction({
      action: "incrementImpactCounter",
      counterKey: payload?.counterKey,
      delta: payload?.delta,
    });
    return NextResponse.json({ ok: true, counters: data?.counters || {} });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impact counter could not be updated." },
      { status: 400 },
    );
  }
}
