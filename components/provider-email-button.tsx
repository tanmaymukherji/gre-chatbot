"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { trackImpactCounter } from "@/lib/impact";
import { getClientSurfaceConfig } from "@/lib/surface";
import { DEFAULT_PROVIDER_EMAIL_TEMPLATE, renderProviderEmailTemplate } from "@/lib/provider-email-template";

type Props = {
  providerEmail: string;
  providerName: string;
  offeringId: string;
  solutionTitle: string;
  solutionSummary: string;
  unavailableLabel?: string;
  detailPath?: string;
  surfaceHeading?: string;
};

type SharedUserSummary = {
  email?: string;
  fullName?: string;
  phone?: string;
  username?: string;
};

export function ProviderEmailButton({
  providerEmail,
  providerName,
  offeringId,
  solutionTitle,
  solutionSummary,
  unavailableLabel = "",
  detailPath,
  surfaceHeading
}: Props) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailableOpen, setUnavailableOpen] = useState(false);
  const [senderSummary, setSenderSummary] = useState<SharedUserSummary | null>(null);
  const [templateBody, setTemplateBody] = useState(DEFAULT_PROVIDER_EMAIL_TEMPLATE);
  const [portalReady, setPortalReady] = useState(false);

  const disabled = !providerEmail;
  const surface = getClientSurfaceConfig();
  const resolvedSurfaceHeading = surfaceHeading || surface.heading;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function readSummary() {
      const authApi = (window as typeof window & {
        grameeeAuth?: {
          getStoredSummary?: () => SharedUserSummary | null;
        };
      }).grameeeAuth;

      setSenderSummary(authApi?.getStoredSummary?.() || null);
    }

    readSummary();

    function onAuthUpdated() {
      readSummary();
    }

    document.addEventListener("grameee:auth-updated", onAuthUpdated);
    window.addEventListener("focus", onAuthUpdated);

    return () => {
      document.removeEventListener("grameee:auth-updated", onAuthUpdated);
      window.removeEventListener("focus", onAuthUpdated);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const authApi = (window as typeof window & {
      grameeeAuth?: {
        getStoredSummary?: () => SharedUserSummary | null;
      };
    }).grameeeAuth;
    if (!senderSummary && authApi?.getStoredSummary?.()) {
      setSenderSummary(authApi.getStoredSummary() || null);
    }
  }, [senderSummary]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/provider-email-template")
      .then((response) => response.json())
      .then((data) => {
        if (!active) {
          return;
        }
        if (typeof data?.templateBody === "string" && data.templateBody.trim()) {
          setTemplateBody(data.templateBody);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  function hasSharedLogin() {
    return Boolean(senderSummary?.email);
  }

  function promptLogin() {
    if (typeof window === "undefined") {
      return;
    }

    const authLink = document.querySelector("[data-auth-link]") as HTMLAnchorElement | null;
    if (authLink) {
      authLink.click();
      return;
    }

    window.location.href = "https://grameee.org/login.html?returnTo=" + encodeURIComponent(window.location.href);
  }

  const detailUrl = useMemo(() => {
    if (typeof window === "undefined") {
      const base = surface.appBaseUrl || "https://askgre.grameee.org";
      return new URL(detailPath || `/offering/${offeringId}`, base).toString();
    }

    return new URL(detailPath || `/offering/${offeringId}`, window.location.origin).toString();
  }, [detailPath, offeringId, surface.appBaseUrl]);

  const senderName = String(senderSummary?.fullName || senderSummary?.username || "").trim();
  const senderEmail = String(senderSummary?.email || "").trim().toLowerCase();
  const senderPhone = String(senderSummary?.phone || "").trim();

  const previewBody = renderProviderEmailTemplate(templateBody, {
    providerName,
    providerEmail,
    senderName,
    senderEmail,
    senderPhone,
    solutionTitle,
    solutionSummary: solutionSummary.trim(),
    detailUrl,
    surfaceHeading: resolvedSurfaceHeading
  });

  async function sendEmail() {
    if (disabled || sending) {
      return;
    }

    if (!hasSharedLogin()) {
      promptLogin();
      return;
    }

    setSending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/provider-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          providerEmail,
          providerName,
          offeringId,
          solutionTitle,
          solutionSummary,
          detailPath
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not send email.");
      }

      setMessage("Introduction email sent to the provider.");
      trackImpactCounter("connections_made");
      setOpen(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="provider-email-action">
      <button
        className="btn hero-link-super provider-email-trigger"
        type="button"
        onClick={() => {
          if (disabled && unavailableLabel) {
            setUnavailableOpen((current) => !current);
            setOpen(false);
            setError(null);
            return;
          }
          if (!hasSharedLogin()) {
            promptLogin();
            return;
          }
          setOpen(true);
          setUnavailableOpen(false);
          setError(null);
        }}
        title={disabled ? "Provider email is not available for this solution." : "Email Provider"}
      >
        <span className="hero-link-super-lines provider-email-trigger-lines">
          <span>Review & Send</span>
          <span>Reach out to</span>
          <span>Email Provider</span>
        </span>
      </button>

      {unavailableOpen ? (
        <div className="provider-email-status provider-email-status-error">
          <strong>{unavailableLabel}</strong>
        </div>
      ) : null}

      {message ? (
        <button
          className="provider-email-status provider-email-status-success"
          type="button"
          onClick={() => {
            setMessage(null);
            setOpen(false);
          }}
        >
          Mail Sent. Click to close.
        </button>
      ) : null}

      {error ? (
        <div className="provider-email-status provider-email-status-error">
          <strong>Could not send email.</strong>
          <div style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      {open && portalReady ? createPortal(
        <div className="provider-email-modal" role="dialog" aria-modal="true" aria-labelledby="providerEmailModalTitle">
          <button
            aria-label="Close email review"
            className="provider-email-modal-backdrop"
            type="button"
            onClick={() => {
              if (!sending) {
                setOpen(false);
                setError(null);
              }
            }}
          />
          <div className="panel panel-pad provider-email-modal-dialog">
            <div className="provider-email-modal-head">
              <div>
                <h3 className="section-title" id="providerEmailModalTitle">Email Provider</h3>
                <p className="section-copy">
                  Review the provider outreach email before it is sent.
                </p>
              </div>
            </div>

            <div className="provider-email-summary-grid">
              <div className="provider-email-summary-card">
                <span className="provider-email-summary-label">From</span>
                <strong>Team GRE &lt;help@greenruraleconomy.in&gt;</strong>
              </div>
              <div className="provider-email-summary-card">
                <span className="provider-email-summary-label">To</span>
                <strong>{providerName}</strong>
                <small>{providerEmail}</small>
              </div>
              <div className="provider-email-summary-card">
                <span className="provider-email-summary-label">Cc</span>
                <strong>{senderName || "Logged-in sender"}</strong>
                <small>{senderEmail || "No sender email found"}</small>
              </div>
            </div>

            <div className="provider-email-meta">
              <div className="provider-email-meta-row">
                <span className="provider-email-meta-label">Reply-To</span>
                <span>{senderEmail || "Not available"}</span>
              </div>
              {senderPhone ? (
                <div className="provider-email-meta-row">
                  <span className="provider-email-meta-label">Phone</span>
                  <span>{senderPhone}</span>
                </div>
              ) : null}
              <div className="provider-email-meta-row">
                <span className="provider-email-meta-label">Surface</span>
                <span>{resolvedSurfaceHeading}</span>
              </div>
            </div>

            <div className="provider-email-preview">
              <div className="provider-email-preview-title">Mail Body</div>
              <pre className="provider-email-preview-body">{previewBody}</pre>
            </div>

            <div className="actions provider-email-modal-actions">
              <button
                className="btn provider-email-send"
                type="button"
                onClick={sendEmail}
                disabled={sending || !senderName || !senderEmail}
              >
                {sending ? "Sending..." : "Send"}
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                disabled={sending}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      , document.body) : null}
    </div>
  );
}
