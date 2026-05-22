import { redirect } from "next/navigation";
import { incrementImpactCounterOnServer } from "@/lib/server-impact";

export default async function OfferingViewRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await incrementImpactCounterOnServer("solutions_discovered");
  redirect(`/offering/${id}`);
}
