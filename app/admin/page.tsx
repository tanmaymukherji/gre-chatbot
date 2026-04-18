import { AdminConsole } from "@/components/admin-console";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Admin Console</h1>
      </section>

      <section style={{ marginTop: 24 }}>
        <AdminConsole />
      </section>
    </main>
  );
}
