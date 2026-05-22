"use client";

import { useEffect, useState } from "react";

export function AdminConsole() {
  const [password, setPassword] = useState("");
  const [sessionUsername, setSessionUsername] = useState<string | null>(null);
  const [sessionSource, setSessionSource] = useState<"grameee" | "legacy" | null>(null);
  const [solutionFile, setSolutionFile] = useState<File | null>(null);
  const [traderFile, setTraderFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("Checking admin access...");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/gre-admin/session")
      .then((response) => response.json())
      .then((data) => {
        setSessionUsername(data.username || null);
        setSessionSource(data.source || null);
        setStatus(
          data.source === "grameee"
            ? "Admin access is available through your GramEEE login."
            : data.username
              ? "Admin login successful. You can now upload the latest GRE workbooks."
              : "Enter the admin password to continue."
        );
      })
      .catch(() => {
        setSessionUsername(null);
        setSessionSource(null);
        setStatus("Enter the admin password to continue.");
      });
  }, []);

  async function logIn() {
    setBusy(true);
    setStatus("Signing in...");

    const response = await fetch("/api/gre-admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "admin",
        password
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || "Login failed.");
      setSessionUsername(null);
      setSessionSource(null);
    } else {
      setSessionUsername(payload.username);
      setSessionSource("legacy");
      setPassword("");
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

    const response = await fetch("/api/gre-admin/import", {
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
    if (sessionSource === "grameee") {
      setStatus("This page is using your shared GramEEE admin session.");
      return;
    }

    await fetch("/api/gre-admin/logout", {
      method: "POST"
    });
    setSessionUsername(null);
    setSessionSource(null);
    setPassword("");
    setStatus("Signed out.");
  }

  return (
    <div className="admin-grid">
      {!sessionUsername ? (
        <div className="panel panel-pad">
          <div className="field">
            <label htmlFor="admin-username">User name</label>
            <input id="admin-username" type="text" value="Admin" readOnly />
          </div>

          <div className="field">
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter admin password"
            />
          </div>

          <div className="actions">
            <button className="btn" type="button" onClick={logIn} disabled={busy || !password}>
              {busy ? "Working..." : "Log in"}
            </button>
          </div>

          <div className="notice" style={{ marginTop: 16 }}>{status}</div>
        </div>
      ) : (
        <div className="panel panel-pad">
          <div className="split">
            <div>
              <h2 className="section-title">Dataset upload</h2>
              <p className="section-copy">
                Upload the latest `solution_data...xlsx` and `trader_data...xlsx` exports. The importer will normalize and
                upsert the rows into the GRE database.
              </p>
            </div>
            {sessionSource === "legacy" ? (
              <button className="btn ghost" type="button" onClick={signOut} disabled={busy}>
                Sign out
              </button>
            ) : null}
          </div>

          <div className="stack">
            <div className="notice">
              Signed in as: <span className="mono">{sessionUsername}</span>
            </div>

            {sessionSource === "grameee" ? (
              <div className="notice">Access is being provided by your active GramEEE admin session.</div>
            ) : null}

            <div className="field">
              <label htmlFor="solution-file">Solution workbook</label>
              <input id="solution-file" type="file" accept=".xlsx,.xls" onChange={(event) => setSolutionFile(event.target.files?.[0] || null)} />
            </div>

            <div className="field">
              <label htmlFor="trader-file">Trader workbook</label>
              <input id="trader-file" type="file" accept=".xlsx,.xls" onChange={(event) => setTraderFile(event.target.files?.[0] || null)} />
            </div>

            <div className="actions">
              <button className="btn secondary" type="button" onClick={uploadFiles} disabled={busy}>
                {busy ? "Importing..." : "Upload and import"}
              </button>
            </div>

            <div className="notice">{status}</div>
          </div>
        </div>
      )}
    </div>
  );
}
