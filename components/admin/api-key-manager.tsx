"use client";

import { useEffect, useState } from "react";

type ApiKeyEntry = {
  id: string;
  prefix: string;
  org_name: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
};

type NewKeyResponse = ApiKeyEntry & {
  api_key: string;
  warning: string;
};

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showNewKey, setShowNewKey] = useState<NewKeyResponse | null>(null);
  const [toggleConfirm, setToggleConfirm] = useState<{ id: string; current: boolean } | null>(null);

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/api-keys");
      const data = await res.json();
      if (res.ok && Array.isArray(data.keys)) {
        setKeys(data.keys);
      } else {
        setStatus(data.error || "Failed to load API keys.");
      }
    } catch {
      setStatus("Network error loading API keys.");
    }
    setLoading(false);
  }

  async function createKey() {
    if (!newOrgName.trim()) {
      setStatus("Organisation name is required.");
      return;
    }
    setCreating(true);
    setStatus("Generating API key...");
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_name: newOrgName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowNewKey(data as NewKeyResponse);
        setNewOrgName("");
        setShowCreateForm(false);
        setStatus("");
        await fetchKeys();
      } else {
        setStatus(data.error || "Failed to create API key.");
      }
    } catch {
      setStatus("Network error creating API key.");
    }
    setCreating(false);
  }

  async function toggleActive(id: string, currentActive: boolean) {
    setToggleConfirm({ id, current: currentActive });
  }

  async function confirmToggle() {
    if (!toggleConfirm) return;
    const { id, current } = toggleConfirm;
    setToggleConfirm(null);

    try {
      const res = await fetch(`/api/admin/api-keys?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !current }),
      });
      const data = await res.json();
      if (res.ok) {
        setKeys((prev) =>
          prev.map((k) => (k.id === id ? { ...k, is_active: !current } : k))
        );
        setStatus(
          !current ? "API key reactivated." : "API key revoked."
        );
      } else {
        setStatus(data.error || "Failed to update API key.");
      }
    } catch {
      setStatus("Network error updating API key.");
    }
  }

  async function deleteKey(id: string) {
    if (!confirm("Permanently delete this API key? This cannot be undone.")) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/api-keys?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
        setStatus("API key deleted.");
      } else {
        setStatus(data.error || "Failed to delete API key.");
      }
    } catch {
      setStatus("Network error deleting API key.");
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return "Never";
    try {
      return new Date(iso).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="panel panel-pad">
      <div className="split" style={{ marginBottom: 20 }}>
        <div>
          <h2 className="section-title">AskGRE Match API Keys</h2>
          <p className="section-copy">
            Generate and manage API keys that external webpages can use to query the{" "}
            <code>GET /api/match</code> endpoint for solution recommendations.
          </p>
        </div>
        {!showCreateForm && !showNewKey && (
          <button
            className="btn"
            type="button"
            onClick={() => setShowCreateForm(true)}
          >
            Generate New Key
          </button>
        )}
      </div>

      {showCreateForm && (
        <div className="admin-mini-card" style={{ marginBottom: 20 }}>
          <div className="field">
            <label htmlFor="new-org-name">Organisation Name</label>
            <input
              id="new-org-name"
              type="text"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="e.g., Pradan, IRMA, UNDP India"
              onKeyDown={(e) => {
                if (e.key === "Enter") createKey();
              }}
            />
          </div>
          <div className="actions">
            <button
              className="btn"
              type="button"
              onClick={createKey}
              disabled={creating || !newOrgName.trim()}
            >
              {creating ? "Generating..." : "Generate Key"}
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setNewOrgName("");
                setStatus("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showNewKey && (
        <div className="admin-mini-card" style={{ marginBottom: 20, background: "#f0fdf4", border: "1px solid #16a34a" }}>
          <div className="notice" style={{ background: "transparent", border: "none", padding: 0, marginBottom: 12 }}>
            <strong>New API key generated</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.875em" }}>{showNewKey.warning}</p>
          </div>
          <div className="field">
            <label>Full API Key (copy now — not stored in plain text)</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                readOnly
                value={showNewKey.api_key}
                style={{ fontFamily: "monospace", fontSize: "0.875em", flex: 1 }}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                className="btn secondary btn-compact"
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(showNewKey.api_key).catch(() => null);
                  setStatus("Copied to clipboard.");
                }}
              >
                Copy
              </button>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Prefix stored:</strong> <code style={{ fontSize: "0.875em" }}>{showNewKey.prefix}</code>
          </div>
          <div className="actions" style={{ marginTop: 12 }}>
            <button
              className="btn ghost"
              type="button"
              onClick={() => setShowNewKey(null)}
            >
              Done — Close
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="notice">Loading API keys...</div>
      ) : keys.length === 0 ? (
        <div className="notice">No API keys found. Click "Generate New Key" to create one.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9em" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                <th style={{ padding: "8px 12px 8px 0", whiteSpace: "nowrap" }}>Organisation</th>
                <th style={{ padding: "8px 12px 8px 0" }}>Key Prefix</th>
                <th style={{ padding: "8px 12px 8px 0" }}>Created</th>
                <th style={{ padding: "8px 12px 8px 0" }}>Last Used</th>
                <th style={{ padding: "8px 12px 8px 0" }}>Status</th>
                <th style={{ padding: "8px 0 8px 0" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px 12px 10px 0", fontWeight: 500 }}>
                    {key.org_name}
                  </td>
                  <td style={{ padding: "10px 12px 10px 0" }}>
                    <code style={{ fontSize: "0.875em", color: "#666" }}>
                      {key.prefix}...
                    </code>
                  </td>
                  <td style={{ padding: "10px 12px 10px 0", whiteSpace: "nowrap", color: "#666" }}>
                    {formatDate(key.created_at)}
                  </td>
                  <td style={{ padding: "10px 12px 10px 0", whiteSpace: "nowrap", color: "#666" }}>
                    {formatDate(key.last_used_at)}
                  </td>
                  <td style={{ padding: "10px 12px 10px 0" }}>
                    {key.is_active ? (
                      <span style={{ color: "#16a34a", fontWeight: 600, fontSize: "0.875em" }}>Active</span>
                    ) : (
                      <span style={{ color: "#dc2626", fontWeight: 600, fontSize: "0.875em" }}>Revoked</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 0 10px 0", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn ghost btn-compact"
                        type="button"
                        onClick={() => toggleActive(key.id, key.is_active)}
                        title={key.is_active ? "Revoke key" : "Reactivate key"}
                      >
                        {key.is_active ? "Revoke" : "Activate"}
                      </button>
                      <button
                        className="btn ghost btn-compact"
                        type="button"
                        onClick={() => deleteKey(key.id)}
                        style={{ color: "#dc2626" }}
                        title="Permanently delete key"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toggleConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setToggleConfirm(null)}
        >
          <div
            className="panel panel-pad"
            style={{ maxWidth: 400, width: "90%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 12 }}>
              {toggleConfirm.current ? "Revoke this API key?" : "Reactivate this API key?"}
            </h3>
            <p style={{ marginBottom: 16, color: "#666", fontSize: "0.9em" }}>
              {toggleConfirm.current
                ? "The key will stop working immediately. Users with this key will receive 401 errors."
                : "The key will be reactivated and usable again."}
            </p>
            <div className="actions">
              <button className="btn" type="button" onClick={confirmToggle}>
                {toggleConfirm.current ? "Yes, Revoke" : "Yes, Activate"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setToggleConfirm(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="notice" style={{ marginTop: 16 }}>{status}</div>
    </div>
  );
}