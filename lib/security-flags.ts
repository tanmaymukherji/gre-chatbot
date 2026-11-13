import { createServerSupabaseClient } from "@/lib/supabase";

export const SECURITY_FLAGS = {
  adminCookieBridge: "admin_cookie_bridge_enabled"
} as const;

export async function isSecurityFlagEnabled(flagKey: string) {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("grameee_security_flags")
      .select("enabled")
      .eq("flag_key", flagKey)
      .maybeSingle();

    if (error) {
      return false;
    }

    return data?.enabled === true;
  } catch {
    return false;
  }
}

