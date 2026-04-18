import { NextRequest } from "next/server";
import { readAdminSession } from "@/lib/admin-session";
import { getServerEnv } from "@/lib/env";

export async function requireAdminUser(request: NextRequest) {
  const session = readAdminSession(request.cookies.get("gre_admin_session")?.value);
  if (!session?.email) {
    throw new Error("Admin login required.");
  }
  const allowedEmails = getServerEnv().adminEmails;
  const email = session.email.toLowerCase();

  if (!allowedEmails.includes(email)) {
    throw new Error("This account is not allowed to import data.");
  }

  return { email };
}
