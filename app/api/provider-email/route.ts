import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";

const requestSchema = z.object({
  providerEmail: z.string().email(),
  providerName: z.string().min(1),
  seekerName: z.string().min(1),
  seekerEmail: z.string().email(),
  solutionTitle: z.string().min(1),
  solutionSummary: z.string().min(1)
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

export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json());
    const env = getServerEnv();

    if (!env.greMailSender) {
      throw new Error("Provider email sender is not configured.");
    }

    const subject = `GRE introduction for ${body.solutionTitle}`;
    const summary = body.solutionSummary.trim();
    const mailBody = [
      `Hello ${body.providerName},`,
      "",
      `${body.seekerName} is interested in knowing more about your solution of ${summary}. We are reaching out to you so that you connect with them and help attend to their need.`,
      "",
      "Warm Regards,",
      "Team GRE"
    ].join("\n");

    const raw = toBase64Url(
      [
        `From: Team GRE <${env.greMailSender}>`,
        `To: ${body.providerEmail}`,
        `Cc: ${body.seekerEmail}`,
        `Reply-To: ${body.seekerEmail}`,
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

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send provider email." },
      { status: 400 }
    );
  }
}
