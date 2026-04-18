import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminCookie } from "@/lib/admin-session";
import { getServerEnv } from "@/lib/env";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: NextRequest) {
  try {
    const body = loginSchema.parse(await request.json());
    const allowedEmails = getServerEnv().adminEmails;
    const configuredPassword = process.env.ADMIN_LOGIN_PASSWORD || "";
    const email = body.email.toLowerCase().trim();

    if (!allowedEmails.includes(email)) {
      return NextResponse.json({ error: "This account is not allowed to upload data." }, { status: 403 });
    }

    if (!configuredPassword || body.password !== configuredPassword) {
      return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, email });
    const cookie = createAdminCookie(email);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed." },
      { status: 400 }
    );
  }
}
