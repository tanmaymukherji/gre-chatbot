import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminSession } from "@/lib/grameee-admin-auth";
import { decideAdminAuthorization } from "@/lib/admin-authorization-core.mjs";
import {
  getVerifiedPrincipal,
  VerifiedSessionError
} from "@/lib/verified-session";
import type { PrincipalCapability } from "@/lib/verified-session";
import type { VerifiedPrincipal } from "@/lib/verified-session";

const SHARED_SUMMARY_COOKIE = "grameee_user_summary";

export type SharedUserSummary = {
  email?: string;
  fullName?: string;
  organization?: string;
  organizationLink?: string;
  phone?: string;
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

export function parseSharedUserSummaryCookie(rawValue: string | undefined) {
  return parseSharedUserSummary(rawValue);
}

export function canViewProtectedPhones(principal: Pick<VerifiedPrincipal, "capabilities"> | null | undefined) {
  return principal?.capabilities.includes("phone:protected") === true;
}

export function maskPhoneNumber(
  value: unknown,
  principal: Pick<VerifiedPrincipal, "capabilities"> | null | undefined
) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (canViewProtectedPhones(principal)) return text;
  const digits = text.replace(/\D/g, "");
  if (digits.length < 4) return "Hidden";
  const visible = digits.slice(-4);
  return `Hidden for users (ending ${visible})`;
}

export function getSharedUserSummary(request: NextRequest) {
  return parseSharedUserSummary(request.cookies.get(SHARED_SUMMARY_COOKIE)?.value);
}

export async function requireAdminUser(
  request: NextRequest,
  requiredCapability: PrincipalCapability = "admin:console"
) {
  const principal = await getVerifiedPrincipal(request).catch(() => null);
  const verifiedDecision = decideAdminAuthorization({
    principal,
    legacySession: null,
    requiredCapability
  });

  if (verifiedDecision.ok) return verifiedDecision.session;

  const legacySession = await getAdminSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
  const finalDecision = decideAdminAuthorization({
    principal,
    legacySession,
    requiredCapability
  });

  if (finalDecision.ok) return finalDecision.session;

  if (!("status" in finalDecision)) {
    throw new VerifiedSessionError("Admin login required.", 401);
  }

  throw new VerifiedSessionError(
    finalDecision.status === 403 ? "Insufficient permission." : "Admin login required.",
    finalDecision.status
  );
}

export function adminAuthorizationErrorResponse(error: unknown) {
  const status = error instanceof VerifiedSessionError ? error.status : 401;
  return NextResponse.json(
    { error: status === 403 ? "Insufficient permission." : "Admin login required." },
    { status }
  );
}
