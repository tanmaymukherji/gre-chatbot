export function decideAdminAuthorization({
  principal,
  legacySession,
  requiredCapability
}) {
  if (principal?.capabilities?.includes(requiredCapability)) {
    return {
      ok: true,
      session: {
        username: principal.email || principal.userId,
        source: "grameee",
        principal
      }
    };
  }

  if (legacySession?.username) {
    return {
      ok: true,
      session: {
        ...legacySession,
        source: "legacy"
      }
    };
  }

  return {
    ok: false,
    status: principal ? 403 : 401
  };
}
