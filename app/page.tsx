import { PublicExperience } from "@/components/public-experience";

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
          <div className="stat">
            Current Source
            <strong>1,659</strong>
            Solution Offerings
          </div>
          <div className="stat">
            Solution Providers
            <strong>233</strong>
            Providers
          </div>
          <div className="stat">
            Main groups
            <strong>3</strong>
            Product, Knowledge, Service
          </div>
          <div className="stat">
            Frameworks
            <strong>6</strong>
            Manpower, Method, Material, Machine, Money and Market
          </div>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <PublicExperience mapplsPublicKey={mapplsPublicKey} />
      </section>
    </main>
  );
}
