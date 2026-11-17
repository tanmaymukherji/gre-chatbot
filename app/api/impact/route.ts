import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { getVerifiedPrincipal } from "@/lib/verified-session";

const impactAuditSchema = z.object({
  kind: z.literal("view").default("view"),
  surface: z.string().trim().max(120).optional(),
  action: z.string().trim().max(120).optional(),
  itemId: z.union([z.string().trim().max(200), z.number()]).optional(),
  itemLabel: z.string().trim().max(500).optional(),
  itemSource: z.string().trim().max(200).optional(),
  portalUrl: z.string().trim().url().max(1000).optional(),
  detailPath: z.string().trim().max(1000).optional(),
}).strip();

const impactIncrementSchema = z.object({
  counterKey: z.enum(["solutions_discovered", "connections_made"]),
  delta: z.coerce.number().int().min(1).max(10).default(1),
  auditEvent: impactAuditSchema.optional(),
}).strict();

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

function sourcePageFromRequest(request: NextRequest) {
  const referer = request.headers.get("referer");
  if (!referer) return undefined;
  try {
    const url = new URL(referer);
    return `${url.origin}${url.pathname}`.slice(0, 1000);
  } catch {
    return undefined;
  }
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
    const payload = impactIncrementSchema.parse(await request.json().catch(() => ({})));
    const principal = await getVerifiedPrincipal(request).catch(() => null);
    const auditEvent = payload.auditEvent ? {
      ...payload.auditEvent,
      actorEmail: principal?.email || undefined,
      actorName: principal?.displayName || undefined,
      actorRole: principal?.role || undefined,
      actorUserId: principal?.userId || undefined,
      sourcePage: sourcePageFromRequest(request),
    } : undefined;
    const data = await callImpactFunction({
      action: "incrementImpactCounter",
      counterKey: payload.counterKey,
      delta: payload.delta,
      auditEvent,
    });
    return NextResponse.json({ ok: true, counters: data?.counters || {} });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impact counter could not be updated." },
      { status: 400 },
    );
  }
}
