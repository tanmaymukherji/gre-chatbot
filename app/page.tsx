import { PublicExperience } from "@/components/public-experience";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <h1>GRE Solution Stack</h1>
        <p>
          A retrieval-first search and chatbot experience for Green Rural Economy offerings, designed to surface grounded recommendations across Product, Knowledge, Service, 6M domains, value chains, applications, tags, language, and geography.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <div className="stats-grid">
          <div className="stat">
            Current source
            <strong>1,659</strong>
            solution offering rows
          </div>
          <div className="stat">
            Provider file
            <strong>233</strong>
            trader rows
          </div>
          <div className="stat">
            Main groups
            <strong>3</strong>
            Product, Knowledge, Service
          </div>
          <div className="stat">
            Sector lens
            <strong>6</strong>
            Manpower through Money
          </div>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <PublicExperience />
      </section>
    </main>
  );
}
