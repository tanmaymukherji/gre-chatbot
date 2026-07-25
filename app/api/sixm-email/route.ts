import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { getSurfaceConfigByHost } from "@/lib/surface";
import { createServerSupabaseClient } from "@/lib/supabase";
import { incrementImpactCounterOnServer } from "@/lib/server-impact";
import { recordSolutionDeliveryImpactOnServer } from "@/lib/server-solution-delivery-impact";

const requestSchema = z.object({
  keyword: z.string().min(1),
  solutions: z.array(z.object({
    providerName: z.string(),
    offeringName: z.string(),
    detailUrl: z.string(),
    mDomains: z.array(z.string()).optional()
  })).min(1),
  senderEmail: z.string().optional(),
  senderName: z.string().optional()
});

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
  try {
    const cookieStore = request.cookies;
    const summaryStr = cookieStore.get("grameee_user_summary")?.value;
    if (!summaryStr) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }
    const session = JSON.parse(summaryStr);
    const senderName = session?.fullName || session?.username || "User";
    const sessionEmail = session?.email || session?.username || "";
    const surface = getSurfaceConfigByHost(request.headers.get("host"));

    const body = requestSchema.parse(await request.json());
    const env = getServerEnv();

    const senderEmail = env.greMailSender || "help@greenruraleconomy.in";
    const accessToken = await refreshAccessToken();

    const solutionLines = body.solutions.map((s, i) => {
      const mCategory = s.mDomains?.length ? `[${s.mDomains[0]}]` : "[M]";
      return `${i + 1}. ${mCategory} ${s.providerName} — ${s.offeringName}\n   ${s.detailUrl}`;
    }).join("\n\n");

    const subject = `6M Mix for ${body.keyword}`;

    const supabase = createServerSupabaseClient();
    const { data: templateRow } = await supabase
      .from("filter_options_cache")
      .select("payload")
      .eq("surface_slug", "askgre")
      .maybeSingle();
    const rawTemplate = String(templateRow?.payload?.sixmEmailTemplate || "");
    const DEFAULT_TEMPLATE = `Hello,\n\nThis is the selected mix of 6M Solutions for the thematic area of {{keyword}}.\n\n{{solutions}}\n\nRegards,\nTeam GRE`;
    const template = rawTemplate || DEFAULT_TEMPLATE;
    const textBody = template
      .replace(/\{\{name\}\}/g, senderName)
      .replace(/\{\{keyword\}\}/g, body.keyword)
      .replace(/\{\{solutions\}\}/g, solutionLines);

    const raw = [
      `From: ${senderEmail}`,
      `To: ${sessionEmail || body.senderEmail}`,
      `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(textBody, "utf8").toString("base64")
    ].join("\r\n");

    const encoded = toBase64Url(raw);
    const gmailResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ raw: encoded })
      }
    );

    if (!gmailResponse.ok) {
      const errorText = await gmailResponse.text();
      return NextResponse.json({ error: `Gmail send failed: ${errorText}` }, { status: 502 });
    }

    const recipientEmail = sessionEmail || body.senderEmail || "";
    await Promise.all([
      incrementImpactCounterOnServer("connections_made", 1, {
        kind: "email",
        surface: surface.slug,
        action: "sixm_solution_mix_email",
        senderEmail,
        senderName,
        recipientEmail,
        itemLabel: `6M Mix for ${body.keyword}`,
        itemSource: `${surface.slug}-sixm-email`,
        meta: {
          keyword: body.keyword,
          solutionCount: body.solutions.length,
        },
      }),
      recordSolutionDeliveryImpactOnServer({
        source: `${surface.slug || "askgre"}-sixm-email`,
        action: "sixm_solution_mix_email",
        keyword: body.keyword,
        solutions: body.solutions.map((solution) => ({
          providerName: solution.providerName,
          offeringName: solution.offeringName,
          detailUrl: solution.detailUrl,
          mDomains: solution.mDomains || [],
        })),
        actorEmail: senderEmail,
        actorName: senderName,
        actorRole: "user",
        recipientEmail,
        subject,
      }),
    ]);

    return NextResponse.json({ success: true, message: "6M selection emailed successfully." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email could not be sent." },
      { status: 500 }
    );
  }
}
