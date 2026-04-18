"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export function AdminConsole() {
  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const [email, setEmail] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [solutionFile, setSolutionFile] = useState<File | null>(null);
  const [traderFile, setTraderFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("Sign in with an approved admin email to enable uploads.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setStatus("Supabase public keys are not configured yet.");
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSessionEmail(data.session?.user?.email || null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email || null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function sendMagicLink() {
    if (!supabase) return;
    setBusy(true);
    setStatus("Sending admin sign-in link...");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/admin` : undefined
      }
    });

    setStatus(error ? error.message : "Magic link sent. Open the email on this browser, then return to upload files.");
    setBusy(false);
  }

  async function uploadFiles() {
    if (!supabase) return;
    if (!solutionFile || !traderFile) {
      setStatus("Attach both the solution and trader Excel files first.");
      return;
    }

    setBusy(true);
    setStatus("Uploading files and starting the Supabase import...");

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setStatus("Admin session missing. Sign in again.");
      setBusy(false);
      return;
    }

    const formData = new FormData();
    formData.append("solutionFile", solutionFile);
    formData.append("traderFile", traderFile);

    const response = await fetch("/api/admin/import", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || "Import failed.");
    } else {
      setStatus(
        `Import completed. Traders: ${payload.summary.traders}, solutions: ${payload.summary.solutions}, offerings: ${payload.summary.offerings}.`
      );
    }
    setBusy(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSessionEmail(null);
    setStatus("Signed out.");
  }

  return (
    <div className="admin-grid">
      <div className="panel panel-pad">
        <h2 className="section-title">Admin access</h2>
        <p className="section-copy">
          This page is for GRE admins who upload the latest Excel exports and refresh the Supabase-backed search index.
        </p>

        <div className="field">
          <label htmlFor="admin-email">Admin email</label>
          <input
            id="admin-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.org"
          />
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={sendMagicLink} disabled={busy || !email}>
            {busy ? "Working..." : "Send magic link"}
          </button>
          <button className="btn ghost" type="button" onClick={signOut} disabled={busy || !sessionEmail}>
            Sign out
          </button>
        </div>

        <div className="notice" style={{ marginTop: 16 }}>
          Signed in as: <span className="mono">{sessionEmail || "Not signed in"}</span>
        </div>
      </div>

      <div className="panel panel-pad">
        <h2 className="section-title">Dataset upload</h2>
        <p className="section-copy">
          Upload the latest `solution_data...xlsx` and `trader_data...xlsx` exports. The importer will normalize and
          upsert the rows into Supabase.
        </p>

        <div className="stack">
          <div className="field">
            <label htmlFor="solution-file">Solution workbook</label>
            <input id="solution-file" type="file" accept=".xlsx,.xls" onChange={(event) => setSolutionFile(event.target.files?.[0] || null)} />
          </div>

          <div className="field">
            <label htmlFor="trader-file">Trader workbook</label>
            <input id="trader-file" type="file" accept=".xlsx,.xls" onChange={(event) => setTraderFile(event.target.files?.[0] || null)} />
          </div>

          <div className="actions">
            <button className="btn secondary" type="button" onClick={uploadFiles} disabled={busy || !sessionEmail}>
              {busy ? "Importing..." : "Upload and import"}
            </button>
          </div>

          <div className="notice">{status}</div>
        </div>
      </div>
    </div>
  );
}
