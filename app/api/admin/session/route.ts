import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminSession } from "@/lib/grameee-admin-auth";

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
  return NextResponse.json({
    authenticated: Boolean(session),
    username: session?.username || null
  });
}
