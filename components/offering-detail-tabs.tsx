"use client";

import { useEffect, useMemo, useState } from "react";
import { OfferingDetailChat } from "@/components/offering-detail-chat";

type DetailRow = {
  label: string;
  value: string;
};

type DocumentItem = {
  title: string;
  url: string;
  typeLabel: string;
};

type MediaItem = {
  title: string;
  url: string;
  kind: "image" | "video" | "external";
  embedUrl?: string;
};

type TabItem = {
  id: string;
  label: string;
  intro?: string;
  rows?: DetailRow[];
  cards?: Array<{
    title: string;
    body: string;
  }>;
  documents?: DocumentItem[];
  media?: MediaItem[];
  note?: string;
};

type Props = {
  tabs: TabItem[];
  offeringId: string;
  offeringName: string;
};

function DocumentCard({ item }: { item: DocumentItem }) {
  return (
    <a className="offering-document-card" href={item.url} target="_blank" rel="noreferrer">
      <span className="offering-document-icon" aria-hidden="true">
        {item.typeLabel === "PDF" ? "PDF" : "DOC"}
      </span>
      <span>
        <strong>{item.title}</strong>
        <small>{item.typeLabel} resource</small>
      </span>
      <span className="offering-document-action">Open</span>
    </a>
  );
}

function MediaCard({ item, onOpenImage }: { item: MediaItem; onOpenImage: (item: MediaItem) => void }) {
  if (item.kind === "image") {
    return (
      <button className="offering-media-card offering-media-button" type="button" onClick={() => onOpenImage(item)}>
        <img src={item.url} alt={item.title} loading="lazy" referrerPolicy="no-referrer" />
        <span>{item.title}</span>
      </button>
    );
  }

  if (item.kind === "video" && item.embedUrl) {
    return (
      <div className="offering-media-card">
        <iframe
          src={item.embedUrl}
          title={item.title}
          allow="fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        <span>{item.title}</span>
      </div>
    );
  }

  if (item.kind === "video") {
    return (
      <div className="offering-media-card">
        <video controls preload="metadata">
          <source src={item.url} />
          Your browser does not support embedded video playback.
        </video>
        <span>{item.title}</span>
      </div>
    );
  }

  return (
    <a className="offering-document-card" href={item.url} target="_blank" rel="noreferrer">
      <span className="offering-document-icon" aria-hidden="true">EXT</span>
      <span>
        <strong>{item.title}</strong>
        <small>External media</small>
      </span>
      <span className="offering-document-action">Open</span>
    </a>
  );
}

export function OfferingDetailTabs({ tabs, offeringId, offeringName }: Props) {
  const fallbackTab = tabs[0]?.id || "overview";
  const [activeTab, setActiveTab] = useState(fallbackTab);
  const [lightboxItem, setLightboxItem] = useState<MediaItem | null>(null);

  useEffect(() => {
    function syncHash() {
      const hash = window.location.hash.replace("#", "");
      if (hash === "offering-chat") {
        setActiveTab("chat");
        return;
      }
      if (tabs.some((tab) => tab.id === hash)) {
        setActiveTab(hash);
      }
    }

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [tabs]);

  const active = useMemo(() => tabs.find((tab) => tab.id === activeTab) || tabs[0], [activeTab, tabs]);

  if (!active) {
    return null;
  }

  return (
    <section className="offering-tabs-card" id="offering-detail-tabs">
      <div className="offering-tab-list" role="tablist" aria-label="Offering detail sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`offering-tab-${tab.id}`}
            className={`offering-tab-button ${active.id === tab.id ? "active" : ""}`}
            type="button"
            role="tab"
            aria-selected={active.id === tab.id}
            aria-controls={`offering-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id={`offering-panel-${active.id}`}
        className="offering-tab-panel"
        role="tabpanel"
        aria-labelledby={`offering-tab-${active.id}`}
      >
        {active.id === "chat" ? (
          <div id="offering-chat">
            <OfferingDetailChat offeringId={offeringId} offeringName={offeringName} />
          </div>
        ) : (
          <>
            {active.intro ? <p className="section-copy">{active.intro}</p> : null}

            {active.cards?.length ? (
              <div className="offering-tab-card-grid">
                {active.cards.map((card) => (
                  <article className="offering-tab-info-card" key={`${active.id}-${card.title}`}>
                    <h3>{card.title}</h3>
                    <p>{card.body}</p>
                  </article>
                ))}
              </div>
            ) : null}

            {active.rows?.length ? (
              <div className="offering-detail-rows">
                {active.rows.map((row) => (
                  <div className="offering-detail-row" key={`${active.id}-${row.label}`}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
            ) : null}

            {active.media?.length ? (
              <div className="offering-media-grid">
                {active.media.map((item) => (
                  <MediaCard key={`${active.id}-${item.title}-${item.url}`} item={item} onOpenImage={setLightboxItem} />
                ))}
              </div>
            ) : null}

            {active.documents?.length ? (
              <div className="offering-document-grid">
                {active.documents.map((item) => (
                  <DocumentCard key={`${active.id}-${item.title}-${item.url}`} item={item} />
                ))}
              </div>
            ) : null}

            {active.note ? <div className="offering-note">{active.note}</div> : null}
          </>
        )}
      </div>

      {lightboxItem ? (
        <div className="offering-lightbox" role="dialog" aria-modal="true" aria-label={lightboxItem.title}>
          <button className="offering-lightbox-backdrop" type="button" onClick={() => setLightboxItem(null)} />
          <div className="offering-lightbox-dialog">
            <button className="offering-lightbox-close" type="button" onClick={() => setLightboxItem(null)}>
              Close
            </button>
            <img src={lightboxItem.url} alt={lightboxItem.title} referrerPolicy="no-referrer" />
            <p>{lightboxItem.title}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
