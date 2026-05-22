import { PublicExperience } from "@/components/public-experience";
import { ImpactStats } from "@/components/impact-stats";
import { headers } from "next/headers";
import { getSurfaceConfigByHost } from "@/lib/surface";
import { getDirectorySummaryStats } from "@/lib/database";
import Link from "next/link";

const FALLBACK_DIRECTORY_STATS = {
  offeringCount: 0,
  providerCount: 0,
  sourceCount: 1
};

async function loadDirectorySummaryStats(surfaceSlug: "askgre" | "supergre") {
  try {
    return await Promise.race([
      getDirectorySummaryStats(surfaceSlug),
      new Promise<typeof FALLBACK_DIRECTORY_STATS>((resolve) =>
        setTimeout(() => resolve(FALLBACK_DIRECTORY_STATS), 4000)
      )
    ]);
  } catch {
    return FALLBACK_DIRECTORY_STATS;
  }
}

export default async function HomePage() {
  const mapplsPublicKey = process.env.MAPPLS_PUBLIC_KEY || null;
  const headerStore = await headers();
  const surface = getSurfaceConfigByHost(headerStore.get("host"));
  const directoryStats = await loadDirectorySummaryStats(surface.slug);

  return (
    <main className="page-shell">
      <section className="hero">
        {surface.slug === "askgre" ? (
          <div className="hero-actions hero-actions-top">
            <Link className="btn hero-link" href="https://supergre.grameee.org/">
              SuperGRE
            </Link>
          </div>
        ) : null}
        <h1>{surface.heading}</h1>
        <p className="hero-copy">
          {surface.heroDescription}
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <div className="stats-grid">
          <ImpactStats surfaceLabel={surface.heading} directoryStats={directoryStats} />
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <PublicExperience mapplsPublicKey={mapplsPublicKey} surface={surface} />
      </section>
    </main>
  );
}
