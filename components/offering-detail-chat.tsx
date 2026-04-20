"use client";

import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function OfferingDetailChat({ offeringId, offeringName }: { offeringId: string; offeringName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || loading) {
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/offering-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          offeringId,
          message: trimmed,
          history: nextMessages
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Offering chat failed.");
      }

      setMessages((current) => [...current, { role: "assistant", content: data.answer || "" }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Offering chat failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel panel-pad">
      <h2 className="section-title">Offering Chat</h2>
      <p className="section-copy">
        Ask follow-up questions about <strong>{offeringName}</strong> in your own language. The answers stay grounded in the offering record shown on this page.
      </p>

      <div className="offering-chat-log">
        {messages.length === 0 ? (
          <div className="notice">Start a conversation to learn more about this offering.</div>
        ) : (
          messages.map((message, index) => (
            <div className={`chat-bubble ${message.role === "user" ? "user" : "assistant"}`} key={`${message.role}-${index}`}>
              <strong>{message.role === "user" ? "You" : "GRE Copilot"}</strong>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{message.content}</div>
            </div>
          ))
        )}
      </div>

      {error ? <div className="notice warn" style={{ marginTop: 14 }}>{error}</div> : null}

      <div className="stack" style={{ marginTop: 16 }}>
        <div className="field">
          <label htmlFor="offering-chat-input">Ask about this offering</label>
          <textarea
            id="offering-chat-input"
            className="chat-query offering-chat-input"
            placeholder="Ask in Hindi, Kannada, English, or any other language you prefer."
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </div>
        <div className="actions">
          <button className="btn" type="button" onClick={sendMessage} disabled={loading}>
            {loading ? "Thinking..." : "Ask about this offering"}
          </button>
        </div>
      </div>
    </section>
  );
}
