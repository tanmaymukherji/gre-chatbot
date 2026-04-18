import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAdmin, createAdminCookie } from "@/lib/grameee-admin-auth";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export async function POST(request: NextRequest) {
  try {
    const body = loginSchema.parse(await request.json());
    const session = await authenticateAdmin(body.username, body.password);

    if (!session) {
      return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, username: session.username });
    const cookie = createAdminCookie(session.token);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed." },
      { status: 400 }
    );
  }
}
