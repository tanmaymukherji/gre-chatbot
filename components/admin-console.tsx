"use client";

import { useEffect, useState } from "react";

export function AdminConsole() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [solutionFile, setSolutionFile] = useState<File | null>(null);
  const [traderFile, setTraderFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("Log in with an approved admin email and password to upload the latest GRE datasets.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((response) => response.json())
      .then((data) => {
        setSessionEmail(data.email || null);
      })
      .catch(() => {
        setSessionEmail(null);
      });
  }, []);

  async function logIn() {
    setBusy(true);
    setStatus("Signing in...");

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || "Login failed.");
      setSessionEmail(null);
    } else {
      setSessionEmail(payload.email);
      setStatus("Admin login successful. You can now upload the latest GRE workbooks.");
    }
    setBusy(false);
  }

  async function uploadFiles() {
    if (!solutionFile || !traderFile) {
      setStatus("Attach both the solution and trader Excel files first.");
      return;
    }

    setBusy(true);
    setStatus("Uploading files and starting the Supabase import...");

    const formData = new FormData();
    formData.append("solutionFile", solutionFile);
    formData.append("traderFile", traderFile);

    const response = await fetch("/api/admin/import", {
      method: "POST",
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
    await fetch("/api/admin/logout", {
      method: "POST"
    });
    setSessionEmail(null);
    setStatus("Signed out.");
  }

  return (
    <div className="admin-grid">
      <div className="panel panel-pad">
        <h2 className="section-title">Admin access</h2>
        <p className="section-copy">
          This page is for GRE admins who upload the latest Excel exports and refresh the data stored in the GRE database.
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

        <div className="field">
          <label htmlFor="admin-password">Admin password</label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter admin password"
          />
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={logIn} disabled={busy || !email || !password}>
            {busy ? "Working..." : "Log in"}
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
          upsert the rows into the GRE database.
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
