export const ACCESS_TOKEN_COOKIE: "grameee_access_token";

export type VerifiedRole = "admin" | "moderator" | "curator" | "user";

export type PrincipalCapability =
  | "surface:askgre"
  | "surface:supergre"
  | "contact:provider"
  | "contact:sixm"
  | "phone:protected"
  | "admin:console"
  | "admin:api-keys"
  | "admin:cache"
  | "admin:imports"
  | "admin:showcase"
  | "admin:templates"
  | "admin:uploads";

export type VerifiedPrincipal = Readonly<{
  userId: string;
  email: string | null;
  role: VerifiedRole;
  sessionId: string;
  capabilities: readonly PrincipalCapability[];
}>;

export function extractAccessToken(input: {
  authorization?: string | null;
  cookieToken?: string | null;
}): string | null;

export function decodeAccessTokenClaims(accessToken: string): {
  subject: string;
  sessionId: string;
  expiresAt: number;
  audience: unknown;
} | null;

export function normalizeTrustedRole(value: unknown): VerifiedRole;

export function capabilitiesFor(
  roleValue: unknown,
  appMetadata?: Record<string, unknown>
): readonly PrincipalCapability[];

export function verifyAccessToken(input: {
  accessToken: string;
  getUserByToken: (accessToken: string) => Promise<{
    data?: { user?: Record<string, any> | null };
    error?: unknown;
  }>;
  isSessionActive: (identity: { sessionId: string; userId: string }) => Promise<boolean>;
  nowSeconds?: number;
}): Promise<VerifiedPrincipal | null>;
