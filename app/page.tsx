import { PublicExperience } from "@/components/public-experience";
import { ImpactStats } from "@/components/impact-stats";

export default function HomePage() {
  const mapplsPublicKey = process.env.MAPPLS_PUBLIC_KEY || null;

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Ask GRE</h1>
        <p className="hero-copy">
          A retrieval-first search and chatbot experience for Green Rural Economy offerings, designed to surface grounded recommendations across Product, Knowledge, Service, 6M domains, value chains, applications, tags, language, and geography.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <div className="stats-grid">
          <ImpactStats />
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <PublicExperience mapplsPublicKey={mapplsPublicKey} />
      </section>
    </main>
  );
}
