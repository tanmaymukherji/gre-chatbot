import { createServerSupabaseClient } from "@/lib/supabase";
import { getServerEnv } from "@/lib/env";

export async function requireAdminUser(accessToken: string | null) {
  if (!accessToken) {
    throw new Error("Missing bearer token.");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user?.email) {
    throw new Error("Unable to verify admin session.");
  }

  const allowedEmails = getServerEnv().adminEmails;
  const email = data.user.email.toLowerCase();

  if (!allowedEmails.includes(email)) {
    throw new Error("This account is not allowed to import data.");
  }

  return data.user;
}
