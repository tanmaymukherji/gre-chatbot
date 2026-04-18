import { AdminConsole } from "@/components/admin-console";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <h1>GRE Admin Console</h1>
        <p>
          Approved admins can sign in, upload the latest Excel exports, and refresh the Supabase data that powers the
          public chatbot and search experience.
        </p>
        <div className="hero-meta">
          <span className="pill">Magic link admin login</span>
          <span className="pill">Excel import workflow</span>
          <span className="pill">Audit-friendly data sync</span>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <AdminConsole />
      </section>
    </main>
  );
}
