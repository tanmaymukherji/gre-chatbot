import { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminSession } from "@/lib/grameee-admin-auth";

const SHARED_SUMMARY_COOKIE = "grameee_user_summary";

type SharedUserSummary = {
  email?: string;
  fullName?: string;
  username?: string;
  role?: string;
  privileges?: {
    gre?: boolean;
  };
};

function parseSharedUserSummary(rawValue: string | undefined) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as SharedUserSummary;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function isSharedAdmin(summary: SharedUserSummary | null) {
  const role = String(summary?.role || "").trim().toLowerCase();
  return role === "admin";
}

export function getSharedGrameeeAdminSession(request: NextRequest) {
  const summary = parseSharedUserSummary(request.cookies.get(SHARED_SUMMARY_COOKIE)?.value);

  if (!isSharedAdmin(summary)) {
    return null;
  }

  return {
    username: String(summary?.username || summary?.email || "admin").trim() || "admin",
    source: "grameee" as const
  };
}

export async function requireAdminUser(request: NextRequest) {
  const sharedSession = getSharedGrameeeAdminSession(request);
  if (sharedSession?.username) {
    return sharedSession;
  }

  const legacySession = await getAdminSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
  if (!legacySession?.username) {
    throw new Error("Admin login required.");
  }

  return {
    ...legacySession,
    source: "legacy" as const
  };
}
