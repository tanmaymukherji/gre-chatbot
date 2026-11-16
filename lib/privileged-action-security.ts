import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase";

export type PrivilegedAction = "provider_email" | "sixm_email";

export class PrivilegedActionQuotaError extends Error {
  readonly status = 429;

  constructor() {
    super("Email limit reached. Please try again later.");
    this.name = "PrivilegedActionQuotaError";
  }
}

export async function claimPrivilegedAction(input: {
  userId: string;
  action: PrivilegedAction;
  surfaceSlug: "askgre" | "supergre";
  targetRef: string;
  limit: number;
  windowSeconds: number;
}) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("gre_claim_privileged_action", {
    p_user_id: input.userId,
    p_action: input.action,
    p_surface_slug: input.surfaceSlug,
    p_target_ref: input.targetRef,
    p_limit: input.limit,
    p_window_seconds: input.windowSeconds
  });

  if (error) throw new Error("Could not verify the email quota.");
  if (!data) throw new PrivilegedActionQuotaError();
  return String(data);
}

export async function completePrivilegedAction(
  eventId: string,
  outcome: "succeeded" | "failed"
) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("gre_privileged_action_events")
    .update({ outcome, completed_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("outcome", "claimed");

  if (error) throw new Error("Could not complete the privileged action audit record.");
}
