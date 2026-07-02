"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { OfferingDetailTabs } from "@/components/offering-detail-tabs";
import { ProviderEmailButton } from "@/components/provider-email-button";
import { TrackedAnchor } from "@/components/tracked-links";
import { OFFERING_TRANSLATION_LANGUAGES } from "@/lib/offering-translation-languages";

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

type QuickCard = {
  label: string;
  value: string;
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

type OfferingCopy = {
  kind: "product" | "service" | "knowledge";
  kindLabel: string;
  title: string;
  description: string;
  chips: string[];
  quickCards: QuickCard[];
  summaryTitle: string;
  summaryBullets: string[];
  snapshotTitle: string;
  providerRows: DetailRow[];
  documents: DocumentItem[];
  media: MediaItem[];
  tabs: TabItem[];
  actionLabels: {
    backToSearch: string;
    askCopilot: string;
    viewContent: string;
    viewMedia: string;
    readOverview: string;
    downloadGuide: string;
    downloadBrochure: string;
    portalLabel: string;
  };
};

type Props = {
  offeringId: string;
  providerEmail: string;
  providerName: string;
  greLink: string;
  surfaceSlug: string;
  surfaceCopilotLabel: string;
  originalTitle: string;
  originalDescription: string;
  actorEmail?: string;
  actorName?: string;
  copy: OfferingCopy;
};

function SnapshotCard({ title, rows }: { title: string; rows: DetailRow[] }) {
  return (
    <section className="offering-summary-card">
      <h2>{title}</h2>
      <div className="offering-snapshot-rows">
        {rows.slice(0, 7).map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            {/^https?:\/\//i.test(row.value) ? (
              <a href={row.value} target="_blank" rel="noreferrer">{row.value}</a>
            ) : (
              <strong>{row.value}</strong>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SummaryCard({ title, bullets }: { title: string; bullets: string[] }) {
  return (
    <section className="offering-summary-card">
      <h2>{title}</h2>
      <div className="offering-help-list">
        {bullets.map((bullet, index) => (
          <div key={`${title}-${index}`}>
            <span aria-hidden="true">OK</span>
            <p>{bullet}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HeroMedia({ media, documents, title }: { media: MediaItem[]; documents: DocumentItem[]; title: string }) {
  const primaryImage = media.find((item) => item.kind === "image");
  const primaryDoc = documents[0];

  if (!primaryImage && !primaryDoc) return null;

  return (
    <div className="offering-hero-media">
      {primaryImage ? (
        <figure className="offering-hero-image-card">
          <img src={primaryImage.url} alt={primaryImage.title || title} referrerPolicy="no-referrer" />
          <figcaption>{primaryImage.title || title}</figcaption>
        </figure>
      ) : null}

      {primaryDoc ? (
        <a className="offering-hero-doc-card" href={primaryDoc.url} target="_blank" rel="noreferrer">
          <span>{primaryDoc.typeLabel}</span>
          <strong>{primaryDoc.title}</strong>
          <small>Open resource</small>
        </a>
      ) : null}
    </div>
  );
}

function FeaturedMedia({ media, documents, title }: { media: MediaItem[]; documents: DocumentItem[]; title: string }) {
  const featured = media.find((item) => item.kind === "video" || item.kind === "external");
  const images = media.filter((item) => item.kind === "image").slice(0, 4);

  if (!featured && !images.length && !documents.length) return null;

  return (
    <section className="offering-featured-media" id="media" aria-labelledby="offering-media-title">
      <div>
        <p className="offering-section-kicker">Embedded content and resources</p>
        <h2 id="offering-media-title">Media and documents</h2>
      </div>

      <div className="offering-featured-media-grid">
        {featured ? (
          <div className="offering-featured-player">
            {featured.kind === "video" && featured.embedUrl ? (
              <iframe
                src={featured.embedUrl}
                title={featured.title}
                allow="fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : featured.kind === "video" ? (
              <video controls preload="metadata">
                <source src={featured.url} />
                Your browser does not support embedded video playback.
              </video>
            ) : (
              <a className="offering-external-media-card" href={featured.url} target="_blank" rel="noreferrer">
                <span>External content</span>
                <strong>{featured.title || title}</strong>
                <small>Open video or learning page</small>
              </a>
            )}
          </div>
        ) : null}

        <div className="offering-featured-resource-list">
          {documents.map((document) => (
            <a className="offering-featured-resource" key={`${document.title}-${document.url}`} href={document.url} target="_blank" rel="noreferrer">
              <span>{document.typeLabel}</span>
              <strong>{document.title}</strong>
              <small>Open resource</small>
            </a>
          ))}
          {images.map((image) => (
            <a className="offering-featured-resource offering-featured-image-link" key={`${image.title}-${image.url}`} href={image.url} target="_blank" rel="noreferrer">
              <img src={image.url} alt={image.title || title} referrerPolicy="no-referrer" />
              <strong>{image.title || title}</strong>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OfferingTranslatedDetail({
  offeringId,
  providerEmail,
  providerName,
  greLink,
  surfaceSlug,
  surfaceCopilotLabel,
  originalTitle,
  originalDescription,
  actorEmail,
  actorName,
  copy
}: Props) {
  const [language, setLanguage] = useState("en");
  const [translatedCopy, setTranslatedCopy] = useState<OfferingCopy | null>(null);
  const [translationError, setTranslationError] = useState("");
  const [isPending, startTransition] = useTransition();

  const activeCopy = translatedCopy || copy;
  const primaryDoc = activeCopy.documents[0];
  const hasFeaturedMedia = activeCopy.media.some((item) => item.kind === "video" || item.kind === "external");
  const hasHeroMedia = Boolean(primaryDoc || activeCopy.media.some((item) => item.kind === "image"));
  const knowledgeContentUrl = activeCopy.kind === "knowledge"
    ? primaryDoc?.url || activeCopy.media.find((item) => item.kind === "external")?.url || ""
    : "";

  const sourcePayload = useMemo(() => copy, [copy]);

  function changeLanguage(nextLanguage: string) {
    setLanguage(nextLanguage);
    setTranslationError("");
    if (nextLanguage === "en") {
      setTranslatedCopy(null);
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/offering-translation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offeringId,
            language: nextLanguage,
            payload: sourcePayload
          })
        });
        if (!response.ok) {
          throw new Error("Translation request failed.");
        }
        const data = await response.json();
        setTranslatedCopy(data.payload as OfferingCopy);
      } catch {
        setTranslatedCopy(null);
        setTranslationError("Translation is temporarily unavailable. Showing English content.");
      }
    });
  }

  return (
    <main className="page-shell offering-page-shell">
      <section className="offering-language-card" aria-label="Language translation">
        <label htmlFor="offering-language-select">Page language</label>
        <select
          id="offering-language-select"
          value={language}
          onChange={(event) => changeLanguage(event.target.value)}
          disabled={isPending}
        >
          <option value="en">English</option>
          {OFFERING_TRANSLATION_LANGUAGES.map((item) => (
            <option key={item.code} value={item.code}>{item.label}</option>
          ))}
        </select>
        <span>{isPending ? "Translating page..." : "Attachments and videos remain unchanged."}</span>
      </section>
      {translationError ? <div className="notice warn">{translationError}</div> : null}

      <section
        className={`offering-action-hero offering-${activeCopy.kind}${hasHeroMedia ? "" : " offering-hero-no-media"}`}
        aria-labelledby="offering-hero-title"
      >
        <div className="offering-hero-copy">
          <div className="offering-hero-topbar">
            <p className="offering-page-kicker">{activeCopy.kindLabel}</p>
            <Link className="offering-hero-back" href="/">{activeCopy.actionLabels.backToSearch}</Link>
          </div>
          <h2 id="offering-hero-title">{activeCopy.title}</h2>
          <p>{activeCopy.description}</p>
          <div className="offering-chip-row">
            {activeCopy.chips.map((chip) => <span key={chip}>{chip}</span>)}
          </div>
        </div>

        <HeroMedia media={activeCopy.media} documents={activeCopy.documents} title={activeCopy.title} />

        <div className="offering-hero-actions" aria-label="Offering actions">
          <ProviderEmailButton
            providerEmail={providerEmail}
            providerName={providerName}
            offeringId={offeringId}
            solutionTitle={activeCopy.title}
            solutionSummary={activeCopy.description}
            unavailableLabel={surfaceSlug === "supergre" ? "Contact currently unavailable." : ""}
          />

          <a className="offering-cta offering-cta-secondary" href="#offering-chat">
            {activeCopy.actionLabels.askCopilot}
          </a>

          {activeCopy.kind === "knowledge" ? (
            <a
              className="offering-cta offering-cta-soft"
              href={knowledgeContentUrl || (hasFeaturedMedia ? "#media" : "#overview")}
              target={knowledgeContentUrl ? "_blank" : undefined}
              rel={knowledgeContentUrl ? "noreferrer" : undefined}
            >
              {knowledgeContentUrl ? activeCopy.actionLabels.viewContent : hasFeaturedMedia ? activeCopy.actionLabels.viewMedia : activeCopy.actionLabels.readOverview}
            </a>
          ) : null}

          {primaryDoc ? (
            <a className="offering-cta offering-cta-soft" href={primaryDoc.url} target="_blank" rel="noreferrer">
              {activeCopy.kind === "knowledge" ? activeCopy.actionLabels.downloadGuide : activeCopy.actionLabels.downloadBrochure}
            </a>
          ) : null}

          {greLink ? (
            <TrackedAnchor
              className="offering-cta offering-cta-outline"
              href={greLink}
              target="_blank"
              rel="noreferrer"
              auditEvent={{
                kind: "view",
                surface: surfaceSlug,
                action: "view_portal",
                actorEmail,
                actorName,
                itemId: offeringId,
                itemLabel: originalTitle,
                itemSource: surfaceSlug,
                portalUrl: greLink,
              }}
            >
              {activeCopy.actionLabels.portalLabel}
            </TrackedAnchor>
          ) : null}
        </div>
      </section>

      <FeaturedMedia media={activeCopy.media} documents={activeCopy.documents} title={activeCopy.title} />

      <section className="offering-quick-grid" aria-label="Quick decision details">
        {activeCopy.quickCards.map((card) => (
          <article className="offering-quick-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>

      <section className="offering-summary-grid">
        <SummaryCard title={activeCopy.summaryTitle} bullets={activeCopy.summaryBullets} />
        <SnapshotCard title={activeCopy.snapshotTitle} rows={activeCopy.providerRows} />
      </section>

      <OfferingDetailTabs tabs={activeCopy.tabs} offeringId={offeringId} offeringName={activeCopy.title} />

      <div className="offering-page-bottom-actions">
        <Link className="offering-cta offering-cta-outline" href="/">
          {activeCopy.actionLabels.backToSearch}
        </Link>
      </div>

      <div className="offering-mobile-sticky-actions">
        <ProviderEmailButton
          providerEmail={providerEmail}
          providerName={providerName}
          offeringId={offeringId}
          solutionTitle={activeCopy.title || originalTitle}
          solutionSummary={activeCopy.description || originalDescription}
          unavailableLabel={surfaceSlug === "supergre" ? "Contact currently unavailable." : ""}
        />
        <a className="offering-cta offering-cta-secondary" href="#offering-chat">
          Ask {surfaceCopilotLabel}
        </a>
      </div>
    </main>
  );
}
