"use client";

import { useEffect, useState } from "react";
import type { ConsortiumPartnerItem, GreFeatureItem } from "@/lib/showcase-content";
import { ApiKeyManager } from "@/components/admin/api-key-manager";

type ShowcaseDraft = {
  features: GreFeatureItem[];
  partners: ConsortiumPartnerItem[];
};

const TABS = [
  { id: "data", label: "Data Sync" },
  { id: "provider-template", label: "Provider Email Template" },
  { id: "sixm-template", label: "6M Email Template" },
  { id: "showcase", label: "GRE Features & Partners" },
  { id: "api-keys", label: "API Keys" },
];

const EMPTY_SHOWCASE_DRAFT: ShowcaseDraft = {
  features: [],
  partners: []
};

function createDraftId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

export function AdminConsole() {
  const [password, setPassword] = useState("");
  const [sessionUsername, setSessionUsername] = useState<string | null>(null);
  const [sessionSource, setSessionSource] = useState<"grameee" | "legacy" | null>(null);
  const [askgreTemplate, setAskgreTemplate] = useState("");
  const [supergreTemplate, setSupergreTemplate] = useState("");
  const [status, setStatus] = useState<string>("Checking admin access...");
  const [templateStatus, setTemplateStatus] = useState<string>("Loading provider email templates...");
  const [sixmTemplate, setSixmTemplate] = useState("");
  const [sixmTemplateStatus, setSixmTemplateStatus] = useState("Loading 6M email template...");
  const [showcaseStatus, setShowcaseStatus] = useState<string>("Loading GRE feature and partner content...");
  const [featureBusy, setFeatureBusy] = useState(false);
  const [partnerBusy, setPartnerBusy] = useState(false);
  const [sharedShowcase, setSharedShowcase] = useState<ShowcaseDraft>(EMPTY_SHOWCASE_DRAFT);
  const [busy, setBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("data");

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

  useEffect(() => {
    fetch("/api/gre-admin/provider-email-template")
      .then((response) => response.json())
      .then((data) => {
        const items = Array.isArray(data?.items) ? data.items : [];
        const askgre = items.find((item: { surfaceSlug?: string }) => item.surfaceSlug === "askgre");
        const supergre = items.find((item: { surfaceSlug?: string }) => item.surfaceSlug === "supergre");
        setAskgreTemplate(String(askgre?.templateBody || ""));
        setSupergreTemplate(String(supergre?.templateBody || ""));
        setTemplateStatus("Provider email templates ready.");
      })
      .catch(() => {
        setTemplateStatus("Provider email templates could not be loaded.");
      });
  }, []);

  useEffect(() => {
    fetch("/api/gre-admin/sixm-email-template")
      .then((response) => response.json())
      .then((data) => {
        setSixmTemplate(String(data?.templateBody || ""));
        setSixmTemplateStatus("6M email template ready.");
      })
      .catch(() => {
        setSixmTemplateStatus("6M email template could not be loaded.");
      });
  }, []);

  useEffect(() => {
    fetch("/api/gre-admin/showcase")
      .then((response) => response.json())
      .then((data) => {
        setSharedShowcase({
          features: Array.isArray(data?.features) ? data.features : [],
          partners: Array.isArray(data?.partners) ? data.partners : []
        });
        setShowcaseStatus("GRE feature and partner content ready.");
      })
      .catch(() => {
        setShowcaseStatus("GRE feature and partner content could not be loaded.");
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

  async function saveSixmTemplate(templateBody: string) {
    setSixmTemplateStatus("Saving 6M email template...");
    const response = await fetch("/api/gre-admin/sixm-email-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateBody })
    });
    const payload = await response.json();
    setSixmTemplateStatus(response.ok ? "6M email template updated." : payload.error || "Template could not be saved.");
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

  async function saveTemplate(surfaceSlug: "askgre" | "supergre", templateBody: string) {
    setTemplateBusy(true);
    setTemplateStatus(`Saving ${surfaceSlug === "askgre" ? "AskGRE" : "SuperGRE"} email template...`);

    const response = await fetch("/api/gre-admin/provider-email-template", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        surfaceSlug,
        templateBody
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      setTemplateStatus(payload.error || "Template could not be saved.");
    } else {
      setTemplateStatus(`${surfaceSlug === "askgre" ? "AskGRE" : "SuperGRE"} email template updated.`);
    }
    setTemplateBusy(false);
  }

  function updateShowcase(updater: (current: ShowcaseDraft) => ShowcaseDraft) {
    setSharedShowcase((current) => updater(current));
  }

  async function saveAllShowcase(features: GreFeatureItem[], partners: ConsortiumPartnerItem[]) {
    setShowcaseStatus("Saving GRE feature and partner content...");
    const response = await fetch("/api/gre-admin/showcase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features, partners })
    });
    const payload = await response.json();
    setShowcaseStatus(response.ok ? "GRE feature and partner content saved." : payload.error || "Content could not be saved.");
  }

  async function saveShowcaseFeatures(features: GreFeatureItem[]) {
    setFeatureBusy(true);
    setShowcaseStatus("Saving GRE features...");
    await saveAllShowcase(features, sharedShowcase.partners);
    setFeatureBusy(false);
  }

  async function saveShowcasePartners(partners: ConsortiumPartnerItem[]) {
    setPartnerBusy(true);
    setShowcaseStatus("Saving consortium partners...");
    await saveAllShowcase(sharedShowcase.features, partners);
    setPartnerBusy(false);
  }

  function renderShowcaseEditor(draft: ShowcaseDraft) {
    return (
      <div className="showcase-editor">
        <h3>Shared GRE Features</h3>
        <div className="stack">
          {draft.features.map((feature, index) => (
            <div className="admin-mini-card" key={feature.id}>
              <div className="field">
                <label>Feature Name</label>
                <input
                  value={feature.name}
                  onChange={(event) => updateShowcase((current) => ({
                    ...current,
                    features: current.features.map((item) => item.id === feature.id ? { ...item, name: event.target.value } : item)
                  }))}
                />
              </div>
              <div className="field">
                <label>Writeup</label>
                <textarea
                  value={feature.writeup}
                  onChange={(event) => updateShowcase((current) => ({
                    ...current,
                    features: current.features.map((item) => item.id === feature.id ? { ...item, writeup: event.target.value } : item)
                  }))}
                />
              </div>
              <div className="field">
                <label>Clickable Link (optional)</label>
                <input
                  value={feature.linkUrl || ""}
                  onChange={(event) => updateShowcase((current) => ({
                    ...current,
                    features: current.features.map((item) => item.id === feature.id ? { ...item, linkUrl: event.target.value } : item)
                  }))}
                />
              </div>
              <div className="field">
                <label>Feature Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const imageUrl = await readFileAsDataUrl(file);
                    updateShowcase((current) => ({
                      ...current,
                      features: current.features.map((item) => item.id === feature.id ? { ...item, imageUrl } : item)
                    }));
                  }}
                />
              </div>
              <div className="actions">
                <button className="btn ghost" type="button" onClick={() => updateShowcase((current) => ({
                  ...current,
                  features: current.features.filter((item) => item.id !== feature.id)
                }))}>
                  Delete Feature {index + 1}
                </button>
              </div>
            </div>
          ))}
          <button className="btn secondary" type="button" onClick={() => updateShowcase((current) => ({
            ...current,
            features: [
              ...current.features,
              { id: createDraftId("feature"), name: "", writeup: "", imageUrl: "", linkUrl: "" }
            ]
          }))}>
            Add GRE Feature
          </button>
        </div>

        <h3>Shared Consortium Partners</h3>
        <div className="stack">
          {draft.partners.map((partner, index) => (
            <div className="admin-mini-card" key={partner.id}>
              <div className="field">
                <label>Partner Name</label>
                <input
                  value={partner.name}
                  onChange={(event) => updateShowcase((current) => ({
                    ...current,
                    partners: current.partners.map((item) => item.id === partner.id ? { ...item, name: event.target.value } : item)
                  }))}
                />
              </div>
              <div className="field">
                <label>Website</label>
                <input
                  value={partner.websiteUrl || ""}
                  onChange={(event) => updateShowcase((current) => ({
                    ...current,
                    partners: current.partners.map((item) => item.id === partner.id ? { ...item, websiteUrl: event.target.value } : item)
                  }))}
                />
              </div>
              <div className="field">
                <label>Logo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const logoUrl = await readFileAsDataUrl(file);
                    updateShowcase((current) => ({
                      ...current,
                      partners: current.partners.map((item) => item.id === partner.id ? { ...item, logoUrl } : item)
                    }));
                  }}
                />
              </div>
              <div className="actions">
                <button className="btn ghost" type="button" onClick={() => updateShowcase((current) => ({
                  ...current,
                  partners: current.partners.filter((item) => item.id !== partner.id)
                }))}>
                  Delete Partner {index + 1}
                </button>
              </div>
            </div>
          ))}
          <button className="btn secondary" type="button" onClick={() => updateShowcase((current) => ({
            ...current,
            partners: [
              ...current.partners,
              { id: createDraftId("partner"), name: "", logoUrl: "", websiteUrl: "" } as ConsortiumPartnerItem
            ]
          }))}>
            Add Consortium Partner
          </button>
        </div>

        <div className="actions">
          <button className="btn secondary" type="button" disabled={featureBusy} onClick={() => saveShowcaseFeatures(draft.features)}>
            {featureBusy ? "Saving..." : "Save GRE Features"}
          </button>
          <button className="btn secondary" type="button" disabled={partnerBusy} onClick={() => saveShowcasePartners(draft.partners)}>
            {partnerBusy ? "Saving..." : "Save Consortium Partners"}
          </button>
        </div>
      </div>
    );
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
        <>
          <div className="panel panel-pad">
            <div className="split">
              <div>
                <h2 className="section-title">Data sync moved to GRE MIS Dashboard</h2>
                <p className="section-copy">
                  The solution and trader workbook upload feature has been consolidated into the{" "}
                  <a href="https://gre.grameee.org/" target="_blank" rel="noopener noreferrer">GRE MIS Dashboard</a>.
                  Use the <strong>Desk - Data Sync</strong> tab there to upload workbooks or sync live from the GRE platform.
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

              <div className="notice">
                <strong>Dataset upload is now available in the&nbsp;
                <a href="https://gre.grameee.org/" target="_blank" rel="noopener noreferrer">GRE MIS Dashboard</a>
                &nbsp;→ Desk → Data Sync.</strong>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e5e7eb", marginBottom: 24, overflowX: "auto" }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "10px 18px",
                  border: "none",
                  borderBottom: activeTab === tab.id ? "3px solid #16a34a" : "3px solid transparent",
                  background: activeTab === tab.id ? "#f0fdf4" : "transparent",
                  color: activeTab === tab.id ? "#16a34a" : "#6b7280",
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontSize: "0.9em",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </>
      )}

      {activeTab === "provider-template" && (
      <div className="panel panel-pad">
        <div className="split">
          <div>
            <h2 className="section-title">Provider Email Templates</h2>
            <p className="section-copy">
              Edit the locked email text shown in AskGRE and SuperGRE before a user sends mail to a provider.
            </p>
          </div>
        </div>

        <div className="stack">
          <div className="field">
            <label htmlFor="askgre-provider-template">AskGRE Email Text</label>
            <textarea
              id="askgre-provider-template"
              value={askgreTemplate}
              onChange={(event) => setAskgreTemplate(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="supergre-provider-template">SuperGRE Email Text</label>
            <textarea
              id="supergre-provider-template"
              value={supergreTemplate}
              onChange={(event) => setSupergreTemplate(event.target.value)}
            />
          </div>

          <div className="notice">
            Supported placeholders: {"{{providerName}}"}, {"{{providerEmail}}"}, {"{{senderName}}"}, {"{{senderEmail}}"}, {"{{senderPhone}}"}, {"{{solutionTitle}}"}, {"{{solutionSummary}}"}, {"{{detailUrl}}"}, {"{{surfaceHeading}}"}
          </div>

          <div className="actions">
            <button
              className="btn secondary"
              type="button"
              onClick={() => saveTemplate("askgre", askgreTemplate)}
              disabled={templateBusy || !askgreTemplate.trim()}
            >
              {templateBusy ? "Saving..." : "Save AskGRE Text"}
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => saveTemplate("supergre", supergreTemplate)}
              disabled={templateBusy || !supergreTemplate.trim()}
            >
              {templateBusy ? "Saving..." : "Save SuperGRE Text"}
            </button>
          </div>

          <div className="notice">{templateStatus}</div>
        </div>
      </div>
      )}

      {activeTab === "sixm-template" && (
      <div className="panel panel-pad">
        <div className="split">
          <div>
            <h2 className="section-title">6M Explorer Email Template</h2>
            <p className="section-copy">
              Edit the email text sent when a user emails their 6M solution selection to themselves.
            </p>
          </div>
        </div>

        <div className="stack">
          <div className="field">
            <label htmlFor="sixm-email-template">6M Email Body</label>
            <textarea
              id="sixm-email-template"
              value={sixmTemplate}
              onChange={(event) => setSixmTemplate(event.target.value)}
              rows={12}
            />
          </div>

          <div className="notice">
            Supported placeholders: {"{{keyword}}"}, {"{{solutions}}"}
          </div>

          <div className="actions">
            <button
              className="btn secondary"
              type="button"
              onClick={() => saveSixmTemplate(sixmTemplate)}
              disabled={!sixmTemplate.trim()}
            >
              Save 6M Email Template
            </button>
          </div>

          <div className="notice">{sixmTemplateStatus}</div>
        </div>
      </div>
      )}

      {activeTab === "showcase" && (
      <div className="panel panel-pad">
        <div className="split">
          <div>
            <h2 className="section-title">GRE Feature and Consortium Partner Content</h2>
            <p className="section-copy">
              Manage the shared public carousel below search results and the partner logo strip at the bottom of both AskGRE and SuperGRE.
            </p>
          </div>
        </div>

        <div className="admin-showcase-grid">
          {renderShowcaseEditor(sharedShowcase)}
        </div>

        <div className="notice">{showcaseStatus}</div>
      </div>
      )}

      {activeTab === "api-keys" && (
      <div className="panel panel-pad">
        <div className="split">
          <div>
            <h2 className="section-title">API Keys</h2>
            <p className="section-copy">
              Create and manage API keys for the /api/match endpoint. Keys are shown once at creation — store them safely.
            </p>
          </div>
        </div>
        <ApiKeyManager />
      </div>
      )}
    </div>
  );
}
