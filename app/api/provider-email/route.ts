import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { getSurfaceConfigByHost } from "@/lib/surface";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getSharedUserSummary } from "@/lib/auth";
import { getProviderEmailTemplateDefaults, renderProviderEmailTemplate } from "@/lib/provider-email-template";

const requestSchema = z.object({
  providerEmail: z.string().email(),
  providerName: z.string().min(1),
  offeringId: z.string().min(1),
  solutionTitle: z.string().min(1),
  solutionSummary: z.string().min(1),
  detailPath: z.string().optional()
});

const IMPACT_EMAIL_AUDIT_LOG_KEY = "impact_email_audit_log";
const MAX_IMPACT_AUDIT_ENTRIES = 2500;

function toBase64Url(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function refreshAccessToken() {
  const env = getServerEnv();
  if (!env.greMailClientId || !env.greMailClientSecret || !env.greMailRefreshToken) {
    throw new Error("Provider email environment variables are missing.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
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
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw })
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function appendImpactEmailAuditLog(supabase: ReturnType<typeof createServerSupabaseClient>, entry: Record<string, unknown>) {
  const { data: existingRow } = await supabase
    .from("gre_mis_settings")
    .select("id, value_json")
    .eq("key", IMPACT_EMAIL_AUDIT_LOG_KEY)
    .maybeSingle();

  const existingEntries = Array.isArray(existingRow?.value_json?.entries)
    ? existingRow.value_json.entries
    : [];
  const nextEntries = [entry, ...existingEntries].slice(0, MAX_IMPACT_AUDIT_ENTRIES);

  if (existingRow?.id) {
    await supabase
      .from("gre_mis_settings")
      .update({
        value_json: {
          entries: nextEntries,
          updated_at: new Date().toISOString(),
        },
      })
      .eq("id", existingRow.id);
    return;
  }

  await supabase
    .from("gre_mis_settings")
    .insert({
      key: IMPACT_EMAIL_AUDIT_LOG_KEY,
      value_json: {
        entries: nextEntries,
        updated_at: new Date().toISOString(),
      },
    });
}

export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json());
    const env = getServerEnv();
    const senderEmail = env.greMailSender || "help@greenruraleconomy.in";
    const forwardedHost = request.headers.get("x-forwarded-host");
    const originHost = forwardedHost || request.headers.get("host");
    const surface = getSurfaceConfigByHost(originHost);
    const appBaseUrl = surface.appBaseUrl || env.appUrl || "https://askgre.grameee.org";
    const senderSummary = getSharedUserSummary(request);
    const senderName = String(senderSummary?.fullName || senderSummary?.username || "").trim();
    const senderReplyEmail = String(senderSummary?.email || "").trim().toLowerCase();

    if (!senderName || !senderReplyEmail) {
      throw new Error("Please log in through GramEEE before sending a provider email.");
    }

    const supabase = createServerSupabaseClient();
    const { data: templateRow, error: templateError } = await supabase
      .from("filter_options_cache")
      .select("payload")
      .eq("surface_slug", surface.slug)
      .maybeSingle();

    if (templateError) {
      throw new Error(templateError.message || "Could not load provider email template.");
    }

    const subject = `GRE introduction for ${body.solutionTitle}`;
    const summary = body.solutionSummary.trim();
    const detailUrl = new URL(body.detailPath || `/offering/${body.offeringId}`, appBaseUrl).toString();
    const templateBody =
      typeof templateRow?.payload?.providerEmailTemplate === "string" && templateRow.payload.providerEmailTemplate.trim()
        ? templateRow.payload.providerEmailTemplate
        : getProviderEmailTemplateDefaults(surface.slug).templateBody;
    const mailBody = renderProviderEmailTemplate(templateBody, {
      providerName: body.providerName,
      providerEmail: body.providerEmail,
      senderName,
      senderEmail: senderReplyEmail,
      senderPhone: String(senderSummary?.phone || "").trim(),
      solutionTitle: body.solutionTitle,
      solutionSummary: summary,
      detailUrl,
      surfaceHeading: surface.heading
    });

    const raw = toBase64Url(
      [
        `From: Team GRE <${senderEmail}>`,
        `To: ${body.providerEmail}`,
        `Cc: ${senderReplyEmail}`,
        `Reply-To: ${senderReplyEmail}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "",
        mailBody
      ].join("\r\n")
    );

    const initialToken = env.greMailAccessToken || (await refreshAccessToken());
    let result = await sendViaGmail(raw, initialToken);

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      const refreshedToken = await refreshAccessToken();
      result = await sendViaGmail(raw, refreshedToken);
    }

    if (!result.ok) {
      throw new Error(result.data?.error?.message || "Could not send provider email.");
    }

    try {
      await appendImpactEmailAuditLog(supabase, {
        at: new Date().toISOString(),
        surface: surface.slug,
        action: "email_provider",
        sender_name: senderName,
        sender_email: senderEmail,
        actor_name: senderName,
        actor_email: senderReplyEmail,
        recipient_email: body.providerEmail,
        recipient_name: body.providerName,
        cc_email: [senderReplyEmail],
        reply_to_email: [senderReplyEmail],
        subject,
        item_id: String(body.offeringId),
        item_label: body.solutionTitle,
        item_source: surface.slug,
        detail_path: detailUrl,
        led_to_counter: true,
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send provider email." },
      { status: 400 }
    );
  }
}
