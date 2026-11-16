import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOfferingDetail, getExternalOfferingDetail } from "@/lib/database";
import { getServerEnv } from "@/lib/env";
import {
  claimPrivilegedAction,
  completePrivilegedAction,
  PrivilegedActionQuotaError
} from "@/lib/privileged-action-security";
import { getProviderEmailTemplateDefaults, renderProviderEmailTemplate } from "@/lib/provider-email-template";
import { getSurfaceConfigByHost } from "@/lib/surface";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireVerifiedPrincipal, VerifiedSessionError } from "@/lib/verified-session";

const requestSchema = z.object({
  offeringId: z.string().trim().min(1).max(200),
  detailPath: z.string().trim().max(500).optional()
}).strict();

function toBase64Url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

async function refreshAccessToken() {
  const env = getServerEnv();
  if (!env.greMailClientId || !env.greMailClientSecret || !env.greMailRefreshToken) {
    throw new Error("Provider email environment variables are missing.");
  }
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.greMailClientId,
      client_secret: env.greMailClientSecret,
      refresh_token: env.greMailRefreshToken,
      grant_type: "refresh_token"
    })
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || "Could not refresh Gmail access token.");
  }
  return tokenData.access_token as string;
}

async function sendViaGmail(raw: string, accessToken: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw })
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function loadCanonicalOffering(offeringId: string, detailPath?: string) {
  const match = detailPath?.match(/^\/detail\/([^/?#]+)\/([^/?#]+)$/);
  if (!match) {
    const offering = await getOfferingDetail(offeringId);
    return { offering, detailPath: `/offering/${encodeURIComponent(offeringId)}` };
  }
  const source = decodeURIComponent(match[1]);
  const recordId = decodeURIComponent(match[2]);
  if (recordId !== offeringId) throw new Error("Offering reference does not match.");
  const offering = await getExternalOfferingDetail(source, recordId);
  return { offering, detailPath: `/detail/${encodeURIComponent(source)}/${encodeURIComponent(recordId)}` };
}

export async function POST(request: NextRequest) {
  let auditEventId: string | null = null;
  try {
    const principal = await requireVerifiedPrincipal(request, "contact:provider");
    if (!principal.email) throw new VerifiedSessionError("A verified email address is required.", 403);

    const body = requestSchema.parse(await request.json());
    const env = getServerEnv();
    const surface = getSurfaceConfigByHost(request.headers.get("x-forwarded-host") || request.headers.get("host"));
    const appBaseUrl = surface.appBaseUrl || env.appUrl || "https://askgre.grameee.org";
    const { offering, detailPath } = await loadCanonicalOffering(body.offeringId, body.detailPath);
    const providerEmail = String(offering.preferred_contact_email || offering.solution?.trader?.email || "").trim().toLowerCase();
    const providerName = String(
      offering.preferred_contact_name
      || offering.solution?.trader?.organisation_name
      || offering.solution?.trader?.trader_name
      || "Solution provider"
    ).trim();
    const solutionTitle = String(offering.offering_name || offering.solution?.solution_name || "GRE solution").trim();
    const solutionSummary = String(offering.about_offering_text || offering.solution?.about_solution_text || "").trim();
    if (!z.string().email().safeParse(providerEmail).success) {
      return NextResponse.json({ error: "This offering does not have a valid provider email." }, { status: 400 });
    }

    auditEventId = await claimPrivilegedAction({
      userId: principal.userId,
      action: "provider_email",
      surfaceSlug: surface.slug,
      targetRef: String(offering.offering_id || body.offeringId),
      limit: 5,
      windowSeconds: 3600
    });

    const supabase = createServerSupabaseClient();
    const { data: templateRow, error: templateError } = await supabase
      .from("filter_options_cache")
      .select("payload")
      .eq("surface_slug", surface.slug)
      .maybeSingle();
    if (templateError) throw new Error("Could not load provider email template.");

    const senderEmail = env.greMailSender || "help@greenruraleconomy.in";
    const senderName = principal.displayName || principal.email.split("@")[0];
    const detailUrl = new URL(detailPath, appBaseUrl).toString();
    const templateBody = typeof templateRow?.payload?.providerEmailTemplate === "string"
      && templateRow.payload.providerEmailTemplate.trim()
      ? templateRow.payload.providerEmailTemplate
      : getProviderEmailTemplateDefaults(surface.slug).templateBody;
    const mailBody = renderProviderEmailTemplate(templateBody, {
      providerName,
      providerEmail,
      senderName,
      senderEmail: principal.email,
      senderPhone: principal.phone || "",
      solutionTitle,
      solutionSummary,
      detailUrl,
      surfaceHeading: surface.heading
    });
    const subject = `GRE introduction for ${solutionTitle}`.replace(/[\r\n]+/g, " ");
    const raw = toBase64Url([
      `From: Team GRE <${senderEmail}>`,
      `To: ${providerEmail}`,
      `Cc: ${principal.email}`,
      `Reply-To: ${principal.email}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      mailBody
    ].join("\r\n"));

    const initialToken = env.greMailAccessToken || (await refreshAccessToken());
    let result = await sendViaGmail(raw, initialToken);
    if (!result.ok && (result.status === 401 || result.status === 403)) {
      result = await sendViaGmail(raw, await refreshAccessToken());
    }
    if (!result.ok) throw new Error(result.data?.error?.message || "Could not send provider email.");

    await completePrivilegedAction(auditEventId, "succeeded").catch(() => {});
    return NextResponse.json({ success: true });
  } catch (error) {
    if (auditEventId) await completePrivilegedAction(auditEventId, "failed").catch(() => {});
    const status = error instanceof VerifiedSessionError || error instanceof PrivilegedActionQuotaError
      ? error.status
      : error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send provider email." },
      { status }
    );
  }
}
