import { NextResponse } from "next/server";
import { clearAdminCookie } from "@/lib/admin-session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const cookie = clearAdminCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
