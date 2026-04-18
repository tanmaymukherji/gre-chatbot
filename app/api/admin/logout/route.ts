import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, clearAdminCookie, revokeAdminSession } from "@/lib/grameee-admin-auth";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const token = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.split("=")[1];
  await revokeAdminSession(token);
  const response = NextResponse.json({ ok: true });
  const cookie = clearAdminCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
