import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { createServerSupabaseClient } from "@/lib/supabase";

const COOKIE_NAME = "grameee_admin_token";
const SESSION_HOURS = 12;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function authenticateAdmin(username: string, password: string) {
  const normalizedUsername = username.trim().toLowerCase();
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("grameee_admin_accounts")
    .select("username, password_hash")
    .eq("username", normalizedUsername)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.password_hash) {
    return null;
  }

  const matches = await bcrypt.compare(password, data.password_hash);
  if (!matches) {
    return null;
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();

  const { error: sessionError } = await supabase.from("grameee_admin_sessions").insert({
    id: randomUUID(),
    username: normalizedUsername,
    token_hash: tokenHash,
    expires_at: expiresAt,
    last_used_at: new Date().toISOString()
  });

  if (sessionError) {
    throw sessionError;
  }

  return {
    username: normalizedUsername,
    token
  };
}

export async function getAdminSession(token: string | undefined) {
  if (!token) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("grameee_admin_sessions")
    .select("id, username, expires_at")
    .eq("token_hash", tokenHash)
    .gt("expires_at", now)
    .maybeSingle();

  if (error || !data?.username) {
    return null;
  }

  await supabase
    .from("grameee_admin_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    username: data.username
  };
}

export async function revokeAdminSession(token: string | undefined) {
  if (!token) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const tokenHash = hashToken(token);
  await supabase.from("grameee_admin_sessions").delete().eq("token_hash", tokenHash);
}

export function createAdminCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: true,
      path: "/",
      maxAge: SESSION_HOURS * 60 * 60
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

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
