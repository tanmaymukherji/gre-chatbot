import "server-only";

import type { NextRequest } from "next/server";
import { createServerAnonSupabaseClient, createServerSupabaseClient } from "@/lib/supabase";
import {
  ACCESS_TOKEN_COOKIE,
  extractAccessToken,
  verifyAccessToken
} from "@/lib/verified-session-core.mjs";
import type {
  PrincipalCapability,
  VerifiedPrincipal,
  VerifiedRole
} from "@/lib/verified-session-core.mjs";

export type { PrincipalCapability, VerifiedPrincipal, VerifiedRole };

export class VerifiedSessionError extends Error {
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403 = 401) {
    super(message);
    this.name = "VerifiedSessionError";
    this.status = status;
  }
}

export async function getVerifiedPrincipal(request: NextRequest): Promise<VerifiedPrincipal | null> {
  const accessToken = extractAccessToken({
    authorization: request.headers.get("authorization"),
    cookieToken: request.cookies.get(ACCESS_TOKEN_COOKIE)?.value
  });

  if (!accessToken) return null;

  const userClient = createServerAnonSupabaseClient();
  const serviceClient = createServerSupabaseClient();

  return verifyAccessToken({
    accessToken,
    getUserByToken: (token) => userClient.auth.getUser(token),
    isSessionActive: async ({ sessionId, userId }) => {
      const { data, error } = await serviceClient.rpc("grameee_is_active_session", {
        p_session_id: sessionId,
        p_user_id: userId
      });

      return !error && data === true;
    }
  });
}

export async function requireVerifiedPrincipal(
  request: NextRequest,
  requiredCapability?: PrincipalCapability
): Promise<VerifiedPrincipal> {
  const principal = await getVerifiedPrincipal(request);

  if (!principal) {
    throw new VerifiedSessionError("Authentication required.", 401);
  }

  if (requiredCapability && !principal.capabilities.includes(requiredCapability)) {
    throw new VerifiedSessionError("Insufficient permission.", 403);
  }

  return principal;
}
