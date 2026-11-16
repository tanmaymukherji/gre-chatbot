import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOfferingDetail } from "@/lib/database";
import { getServerEnv } from "@/lib/env";
import {
  claimPrivilegedAction,
  completePrivilegedAction,
  PrivilegedActionQuotaError
} from "@/lib/privileged-action-security";
import { incrementImpactCounterOnServer } from "@/lib/server-impact";
import { recordSolutionDeliveryImpactOnServer } from "@/lib/server-solution-delivery-impact";
import { getSurfaceConfigByHost } from "@/lib/surface";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireVerifiedPrincipal, VerifiedSessionError } from "@/lib/verified-session";

const requestSchema = z.object({
  keyword: z.string().trim().min(1).max(160),
  offeringIds: z.array(z.string().trim().min(1).max(200)).min(1).max(12)
}).strict().refine((value) => new Set(value.offeringIds).size === value.offeringIds.length, {
  message: "Duplicate offerings are not allowed."
});

function toBase64Url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

async function refreshAccessToken() {
  const env = getServerEnv();
  if (!env.greMailClientId || !env.greMailClientSecret || !env.greMailRefreshToken) {
    throw new Error("Gmail credentials not configured.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.greMailClientId,
      client_secret: env.greMailClientSecret,
      refresh_token: env.greMailRefreshToken,
      grant_type: "refresh_token"
    })
  });
  if (!response.ok) throw new Error("Failed to refresh Gmail access token.");
  const data = await response.json();
  return String(data.access_token || "");
}

export async function POST(request: NextRequest) {
  let auditEventId: string | null = null;
  try {
    const principal = await requireVerifiedPrincipal(request, "contact:sixm");
    if (!principal.email) throw new VerifiedSessionError("A verified email address is required.", 403);
    const body = requestSchema.parse(await request.json());
    const surface = getSurfaceConfigByHost(request.headers.get("x-forwarded-host") || request.headers.get("host"));
    const env = getServerEnv();
    const appBaseUrl = surface.appBaseUrl || env.appUrl || "https://askgre.grameee.org";
    const offerings = await Promise.all(body.offeringIds.map((id) => getOfferingDetail(id)));
    const solutions = offerings.map((offering, index) => ({
      providerName: String(
        offering.preferred_contact_name
        || offering.solution?.trader?.organisation_name
        || offering.solution?.trader?.trader_name
        || "Solution provider"
      ),
      offeringName: String(offering.offering_name || offering.solution?.solution_name || "GRE solution"),
      detailUrl: new URL(`/offering/${encodeURIComponent(body.offeringIds[index])}`, appBaseUrl).toString(),
      mDomains: Array.isArray(offering.domain_6m)
        ? offering.domain_6m.map(String)
        : [String(offering.domain_6m || "")].filter(Boolean)
    }));

    auditEventId = await claimPrivilegedAction({
      userId: principal.userId,
      action: "sixm_email",
      surfaceSlug: surface.slug,
      targetRef: `${solutions.length}-offerings`,
      limit: 5,
      windowSeconds: 3600
    });

    const supabase = createServerSupabaseClient();
    const { data: templateRow } = await supabase
      .from("filter_options_cache")
      .select("payload")
      .eq("surface_slug", "askgre")
      .maybeSingle();
    const defaultTemplate = "Hello,\n\nThis is the selected mix of 6M Solutions for the thematic area of {{keyword}}.\n\n{{solutions}}\n\nRegards,\nTeam GRE";
    const senderName = principal.displayName || principal.email.split("@")[0];
    const solutionLines = solutions.map((solution, index) => {
      const category = solution.mDomains.length ? `[${solution.mDomains[0]}]` : "[M]";
      return `${index + 1}. ${category} ${solution.providerName} — ${solution.offeringName}\n   ${solution.detailUrl}`;
    }).join("\n\n");
    const subject = `6M Mix for ${body.keyword}`;
    const textBody = String(templateRow?.payload?.sixmEmailTemplate || defaultTemplate)
      .replace(/\{\{name\}\}/g, senderName)
      .replace(/\{\{keyword\}\}/g, body.keyword)
      .replace(/\{\{solutions\}\}/g, solutionLines);
    const senderEmail = env.greMailSender || "help@greenruraleconomy.in";
    const raw = toBase64Url([
      `From: ${senderEmail}`,
      `To: ${principal.email}`,
      `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(textBody, "utf8").toString("base64")
    ].join("\r\n"));
    const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${await refreshAccessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw })
    });
    if (!gmailResponse.ok) throw new Error("Email delivery failed.");

    await completePrivilegedAction(auditEventId, "succeeded").catch(() => {});
    await Promise.allSettled([
      incrementImpactCounterOnServer("connections_made", 1, {
        kind: "email",
        surface: surface.slug,
        action: "sixm_solution_mix_email",
        senderEmail,
        senderName,
        recipientEmail: principal.email,
        itemLabel: subject,
        itemSource: `${surface.slug}-sixm-email`,
        meta: { keyword: body.keyword, solutionCount: solutions.length, actorUserId: principal.userId }
      }),
      recordSolutionDeliveryImpactOnServer({
        source: `${surface.slug}-sixm-email`,
        action: "sixm_solution_mix_email",
        keyword: body.keyword,
        solutions,
        actorEmail: principal.email,
        actorName: senderName,
        actorRole: principal.role,
        recipientEmail: principal.email,
        subject
      })
    ]);
    return NextResponse.json({ success: true, message: "6M selection emailed successfully." });
  } catch (error) {
    if (auditEventId) await completePrivilegedAction(auditEventId, "failed").catch(() => {});
    const status = error instanceof VerifiedSessionError || error instanceof PrivilegedActionQuotaError
      ? error.status
      : error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email could not be sent." },
      { status }
    );
  }
}
