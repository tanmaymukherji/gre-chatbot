import { NextRequest, NextResponse } from "next/server";
import { readAdminSession } from "@/lib/admin-session";

export async function GET(request: NextRequest) {
  const session = readAdminSession(request.cookies.get("gre_admin_session")?.value);
  return NextResponse.json({
    authenticated: Boolean(session),
    email: session?.email || null
  });
}
