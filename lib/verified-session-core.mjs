export const ACCESS_TOKEN_COOKIE = "grameee_access_token";

const TRUSTED_ROLES = new Set(["admin", "moderator", "curator", "user"]);

const ADMIN_CAPABILITIES = [
  "admin:console",
  "admin:api-keys",
  "admin:cache",
  "admin:imports",
  "admin:showcase",
  "admin:templates",
  "admin:uploads"
];

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function verifiedProfile(user) {
  const metadata = user?.user_metadata && typeof user.user_metadata === "object"
    ? user.user_metadata
    : {};

  return {
    displayName: text(metadata.full_name)
      || text(metadata.fullName)
      || text(metadata.name)
      || text(metadata.username)
      || null,
    phone: text(user?.phone)
      || text(metadata.phone)
      || text(metadata.phone_number)
      || null
  };
}

export function extractAccessToken({ authorization, cookieToken }) {
  const header = text(authorization);

  if (header) {
    const match = header.match(/^Bearer[\t ]+([^\s,]+)$/i);
    return match ? text(match[1]) || null : null;
  }

  return text(cookieToken) || null;
}

export function decodeAccessTokenClaims(accessToken) {
  const parts = text(accessToken).split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const subject = text(payload?.sub);
    const sessionId = text(payload?.session_id);
    const expiresAt = Number(payload?.exp);

    if (!subject || !sessionId || !Number.isFinite(expiresAt)) return null;

    return {
      subject,
      sessionId,
      expiresAt,
      audience: payload?.aud
    };
  } catch {
    return null;
  }
}

export function normalizeTrustedRole(value) {
  const role = text(value).toLowerCase();
  return TRUSTED_ROLES.has(role) ? role : "user";
}

function trustedPrivileges(appMetadata) {
  const privileges = appMetadata?.grameee_privileges;
  return privileges && typeof privileges === "object" && !Array.isArray(privileges)
    ? privileges
    : {};
}

export function capabilitiesFor(roleValue, appMetadata = {}) {
  const role = normalizeTrustedRole(roleValue);
  const privileges = trustedPrivileges(appMetadata);
  const capabilities = new Set();
  const canAskGre = role === "admin" || privileges.askGre !== false;
  const defaultGreAccess = ["admin", "moderator", "curator"].includes(role);
  const canUseSuperGre = role === "admin"
    || (typeof privileges.gre === "boolean" ? privileges.gre : defaultGreAccess);

  if (canAskGre) {
    capabilities.add("surface:askgre");
    capabilities.add("contact:provider");
    capabilities.add("contact:sixm");
  }

  if (canUseSuperGre) capabilities.add("surface:supergre");
  if (["admin", "moderator", "curator"].includes(role)) {
    capabilities.add("phone:protected");
  }

  if (role === "admin") {
    ADMIN_CAPABILITIES.forEach((capability) => capabilities.add(capability));
  }

  return Object.freeze(Array.from(capabilities).sort());
}

function isRemovedUser(user) {
  const appMetadata = user?.app_metadata || {};
  const userMetadata = user?.user_metadata || {};
  return appMetadata.grameee_removed === true
    || userMetadata.grameee_removed === true
    || text(appMetadata.grameee_role).toLowerCase() === "removed";
}

export async function verifyAccessToken({
  accessToken,
  getUserByToken,
  isSessionActive,
  nowSeconds = Math.floor(Date.now() / 1000)
}) {
  const token = text(accessToken);
  const claims = decodeAccessTokenClaims(token);

  if (!claims || claims.expiresAt <= nowSeconds) return null;
  if (claims.audience !== "authenticated"
      && !(Array.isArray(claims.audience) && claims.audience.includes("authenticated"))) {
    return null;
  }

  try {
    const result = await getUserByToken(token);
    const user = result?.data?.user;

    if (result?.error || !user || text(user.id) !== claims.subject || isRemovedUser(user)) {
      return null;
    }

    const active = await isSessionActive({
      sessionId: claims.sessionId,
      userId: text(user.id)
    });

    if (!active) return null;

    const appMetadata = user.app_metadata && typeof user.app_metadata === "object"
      ? user.app_metadata
      : {};
    const role = normalizeTrustedRole(appMetadata.grameee_role);
    const profile = verifiedProfile(user);

    return Object.freeze({
      userId: text(user.id),
      email: text(user.email).toLowerCase() || null,
      displayName: profile.displayName,
      phone: profile.phone,
      role,
      sessionId: claims.sessionId,
      capabilities: capabilitiesFor(role, appMetadata)
    });
  } catch {
    return null;
  }
}
