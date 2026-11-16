import { NextRequest, NextResponse } from "next/server";
import { adminAuthorizationErrorResponse, requireAdminUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireAdminUser(request, "admin:console");
  } catch (error) {
    return adminAuthorizationErrorResponse(error);
  }

  return NextResponse.json({
    authenticated: true,
    username: session.username,
    source: session.source
  });
}
