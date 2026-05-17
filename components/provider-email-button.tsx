"use client";

import { useState } from "react";

type Props = {
  providerEmail: string;
  providerName: string;
  offeringId: string;
  solutionTitle: string;
  solutionSummary: string;
};

export function ProviderEmailButton({ providerEmail, providerName, offeringId, solutionTitle, solutionSummary }: Props) {
  const [open, setOpen] = useState(false);
  const [seekerName, setSeekerName] = useState("");
  const [seekerEmail, setSeekerEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = !providerEmail;

  async function sendEmail() {
    if (disabled || sending) {
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
          seekerName,
          seekerEmail,
          offeringId,
          solutionTitle,
          solutionSummary
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not send email.");
      }

      setMessage("Introduction email sent to the provider.");
      setOpen(false);
      setSeekerName("");
      setSeekerEmail("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="provider-email-action">
      <button
        className="btn hero-link"
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((current) => !current);
          setError(null);
        }}
        title={disabled ? "Provider email is not available for this solution." : "Email Provider"}
      >
        Email Provider
      </button>

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

      {open ? (
        <div className="panel panel-pad provider-email-panel">
          <h3 className="section-title">Email Provider</h3>
          <p className="section-copy">
            Send an introduction to <strong>{providerName}</strong> and copy yourself on the mail.
          </p>
          <div className="stack">
            <div className="field">
              <label htmlFor="seeker-name">Your name</label>
              <input
                id="seeker-name"
                className="input"
                value={seekerName}
                onChange={(event) => setSeekerName(event.target.value)}
                placeholder="Enter your name"
              />
            </div>
            <div className="field">
              <label htmlFor="seeker-email">Your email</label>
              <input
                id="seeker-email"
                className="input"
                type="email"
                value={seekerEmail}
                onChange={(event) => setSeekerEmail(event.target.value)}
                placeholder="Enter your email"
              />
            </div>
            <div className="actions">
              <button
                className="btn"
                type="button"
                onClick={sendEmail}
                disabled={sending || !seekerName.trim() || !seekerEmail.trim()}
              >
                {sending ? "Sending..." : "Send Email"}
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
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
