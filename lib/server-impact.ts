import { getServerEnv } from "@/lib/env";
import { ImpactCounterKey } from "@/lib/impact";

export async function incrementImpactCounterOnServer(counterKey: ImpactCounterKey, delta = 1) {
  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return;
  }

  try {
    await fetch(`${env.supabaseUrl}/functions/v1/grameee-admin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${env.supabaseAnonKey}`,
      },
      body: JSON.stringify({
        action: "incrementImpactCounter",
        counterKey,
        delta,
      }),
      cache: "no-store",
    });
  } catch {
    // Intentionally ignore analytics write failures.
  }
}
