import type { PrincipalCapability, VerifiedPrincipal } from "./verified-session-core.mjs";

export type LegacyAdminSession = {
  username: string;
  expiresAt?: string;
};

export type AuthorizedAdminSession =
  | (LegacyAdminSession & { source: "legacy" })
  | {
      username: string;
      source: "grameee";
      principal: VerifiedPrincipal;
    };

export function decideAdminAuthorization(input: {
  principal: VerifiedPrincipal | null;
  legacySession: LegacyAdminSession | null;
  requiredCapability: PrincipalCapability;
}):
  | { ok: true; session: AuthorizedAdminSession }
  | { ok: false; status: 401 | 403 };
