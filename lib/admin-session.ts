import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "gre_admin_session";

function getPassword() {
  return process.env.ADMIN_LOGIN_PASSWORD || "";
}

function signPayload(email: string) {
  const secret = getPassword();
  if (!secret) {
    throw new Error("Admin login password is not configured.");
  }

  const payload = JSON.stringify({
    email,
    issuedAt: Date.now()
  });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const secret = getPassword();
  if (!secret) {
    return null;
  }

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);

  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return decoded?.email ? decoded : null;
  } catch {
    return null;
  }
}

export function createAdminCookie(email: string) {
  return {
    name: COOKIE_NAME,
    value: signPayload(email),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 12
    }
  };
}

export function clearAdminCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: true,
      path: "/",
      maxAge: 0
    }
  };
}

export function readAdminSession(cookieValue: string | undefined) {
  return verifyToken(cookieValue);
}
