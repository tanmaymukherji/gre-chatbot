import { getServerEnv } from "@/lib/env";

export type DeliveredSolutionImpact = {
  providerName?: string;
  offeringName?: string;
  detailUrl?: string;
  mDomains?: string[];
};

export async function recordSolutionDeliveryImpactOnServer({
  source,
  action = "api_solution_links_sent",
  keyword,
  solutions,
  actorEmail = "system:api",
  actorName = "API delivery",
  actorRole = "api",
  recipientEmail = "",
  recipientName = "API user",
  subject = "",
}: {
  source: string;
  action?: string;
  keyword: string;
  solutions: DeliveredSolutionImpact[];
  actorEmail?: string;
  actorName?: string;
  actorRole?: string;
  recipientEmail?: string;
  recipientName?: string;
  subject?: string;
}) {
  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey || !solutions.length) return;

  await fetch(`${env.supabaseUrl}/functions/v1/gre-mis-admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${env.supabaseAnonKey}`,
    },
    body: JSON.stringify({
      action: "recordExternalSolutionDeliveryImpact",
      deliveryAction: action,
      source,
      actorEmail,
      actorName,
      actorRole,
      recipientEmail,
      recipientName,
      keyword,
      subject,
      itemLabel: `${solutions.length} solution link${solutions.length === 1 ? "" : "s"} returned for ${keyword}`,
      linkCount: solutions.length,
      links: solutions.map((solution) => solution.detailUrl).filter(Boolean),
      solutions: solutions.map((solution) => ({
        providerName: solution.providerName || "",
        offeringName: solution.offeringName || "",
        detailUrl: solution.detailUrl || "",
        mDomains: solution.mDomains || [],
      })),
    }),
    cache: "no-store",
  });
}
