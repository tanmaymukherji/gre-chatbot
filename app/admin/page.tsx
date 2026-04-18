import Link from "next/link";
import { AdminConsole } from "@/components/admin-console";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Admin Console</h1>
        <div className="hero-actions">
          <Link className="btn hero-link" href="/">
            Back to Home
          </Link>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <AdminConsole />
      </section>
    </main>
  );
}
