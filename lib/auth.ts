import { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminSession } from "@/lib/grameee-admin-auth";

export async function requireAdminUser(request: NextRequest) {
  const session = await getAdminSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
  if (!session?.username) {
    throw new Error("Admin login required.");
  }

  return session;
}
