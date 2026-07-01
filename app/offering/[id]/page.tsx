import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { OfferingDetailTabs } from "@/components/offering-detail-tabs";
import { ProviderEmailButton } from "@/components/provider-email-button";
import { TrackedAnchor } from "@/components/tracked-links";
import { getOfferingDetail } from "@/lib/database";
import { maskPhoneNumber, parseSharedUserSummaryCookie } from "@/lib/auth";
import { getSurfaceConfigByHost } from "@/lib/surface";

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

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean).join(", ");
  }
  return cleanText(value);
}

function present(value: unknown) {
  return formatValue(value).length > 0;
}

function normalizeLabel(value: unknown) {
  return cleanText(value).toLowerCase();
}

function uniqueValues(values: unknown[]) {
  const seen = new Set<string>();
  return values
    .flatMap((value) => {
      if (Array.isArray(value)) return value;
      return cleanText(value).split(/[;,|\n]/);
    })
    .map((value) => cleanText(value))
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getPayload(offering: any) {
  const raw = offering?.raw_payload && typeof offering.raw_payload === "object" ? offering.raw_payload : {};
  const nested = raw?.payload && typeof raw.payload === "object" ? raw.payload : {};
  return { ...raw, ...nested };
}

function getAttachmentUrl(value: any) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return cleanText(value.dataUrl || value.url || value.href || value.link);
  }
  return "";
}

function collectResourceValues(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(collectResourceValues);
  if (typeof value === "object") {
    const direct = getAttachmentUrl(value);
    const nested = Object.values(value as Record<string, unknown>).flatMap(collectResourceValues);
    return direct ? [direct, ...nested] : nested;
  }

  const text = cleanText(value);
  if (!text) return [];
  const urlMatches = text.match(/(?:https?:\/\/|www\.|youtube\.com|youtu\.be|vimeo\.com)[^\s<>"')]+/gi);
  return urlMatches?.length ? urlMatches : [text];
}

function normalizeResourceUrl(url: string) {
  const text = cleanText(url);
  if (!text) return "";
  if (/^data:/i.test(text) || /^https?:\/\//i.test(text)) return text;
  if (/^(www\.|youtube\.com|youtu\.be|vimeo\.com)/i.test(text)) return `https://${text}`;
  return text;
}

function urlList(...values: unknown[]) {
  return uniqueValues(values.flatMap(collectResourceValues).map(normalizeResourceUrl))
    .filter((url) => /^https?:\/\//i.test(url) || /^data:/i.test(url));
}

function isPdfUrl(url: string) {
  return /\.pdf(?:[?#]|$)/i.test(url) || /^data:application\/pdf/i.test(url);
}

function isImageUrl(url: string) {
  return /^data:image\//i.test(url) || /\.(jpe?g|png|webp|gif|avif)(?:[?#]|$)/i.test(url);
}

function isDirectVideoUrl(url: string) {
  return /\.(mp4|webm|ogg|mov)(?:[?#]|$)/i.test(url);
}

function isVideoUrl(url: string) {
  return isDirectVideoUrl(url) ||
    /youtube\.com\/watch\?/i.test(url) ||
    /youtube\.com\/embed\//i.test(url) ||
    /youtu\.be\//i.test(url) ||
    /vimeo\.com\//i.test(url);
}

function toEmbedUrl(url: string) {
  const text = cleanText(url);
  const youtubeWatch = text.match(/[?&]v=([^&]+)/i);
  if (/youtube\.com\/watch\?/i.test(text) && youtubeWatch?.[1]) {
    return `https://www.youtube.com/embed/${youtubeWatch[1]}`;
  }
  const youtuBe = text.match(/youtu\.be\/([^?&]+)/i);
  if (youtuBe?.[1]) {
    return `https://www.youtube.com/embed/${youtuBe[1]}`;
  }
  if (/youtube\.com\/embed\//i.test(text)) {
    return text;
  }
  const vimeoMatch = text.match(/vimeo\.com\/(\d+)/i);
  if (vimeoMatch?.[1]) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }
  return "";
}

function documentType(url: string) {
  if (isPdfUrl(url)) return "PDF";
  const extension = url.split(/[?#]/)[0]?.split(".").pop()?.toUpperCase();
  return extension && extension.length <= 5 ? extension : "DOC";
}

function offeringKind(offering: any): "product" | "service" | "knowledge" {
  const text = [
    offering.offering_group,
    offering.offering_category,
    offering.offering_type
  ].map(normalizeLabel).join(" ");
  if (text.includes("knowledge") || text.includes("manual") || text.includes("video") || text.includes("sop") || text.includes("blog")) {
    return "knowledge";
  }
  if (text.includes("product") || text.includes("machinery") || text.includes("plant setup") || text.includes("raw material")) {
    return "product";
  }
  return "service";
}

function rowsOf(rows: Array<[string, unknown]>): DetailRow[] {
  return rows
    .map(([label, value]) => ({ label, value: formatValue(value) }))
    .filter((row) => row.value);
}

function chipList(offering: any, kind: "product" | "service" | "knowledge") {
  return uniqueValues([
    kind === "product" ? "Product offering" : kind === "service" ? "Service offering" : "Knowledge offering",
    offering.offering_type,
    offering.domain_6m ? `${offering.domain_6m} - 6M` : "",
    offering.primary_valuechain,
    offering.primary_application
  ]).slice(0, 6);
}

function buildDocuments(offering: any, kind: "product" | "service" | "knowledge"): DocumentItem[] {
  const payload = getPayload(offering);
  const values = [
    kind === "service" ? offering.service_brochure_url : "",
    kind === "product" ? offering.product_brochure_url : "",
    kind === "knowledge" && isPdfUrl(cleanText(offering.knowledge_content_url)) ? offering.knowledge_content_url : "",
    kind === "service" ? payload["Service offering Brochure"] : "",
    kind === "product" ? payload["Product Brochure"] : "",
    kind === "knowledge" && isPdfUrl(cleanText(payload["Knowledge Offering Content"])) ? payload["Knowledge Offering Content"] : "",
    payload.brochure,
    payload.brochure_url,
    payload.service_brochure_attachment,
    payload.product_brochure_attachment,
    payload.knowledge_content_attachment,
    payload.document,
    payload.document_url,
    payload.documentLink,
    payload.documentLinks,
    payload.documents,
    payload.document_urls,
    payload.attachmentUrls,
    payload.attachments
  ];
  const urls = urlList(...values).filter((url) => !isImageUrl(url) && !isVideoUrl(url));
  return urls.map((url, index) => ({
    title: index === 0 ? (kind === "knowledge" ? "Knowledge guide" : kind === "service" ? "Service brochure" : "Product brochure") : `Resource ${index + 1}`,
    url,
    typeLabel: documentType(url)
  }));
}

function buildMedia(offering: any): MediaItem[] {
  const payload = getPayload(offering);
  const primaryImage = offering.solution?.solution_image_url || payload.SolutionImage || payload.solutionImage;
  const gallery = urlList(
    primaryImage,
    payload.OfferingImage,
    payload.offering_image,
    payload.offering_image_attachment,
    payload.galleryUrls,
    payload.imageUrls,
    payload.images,
    payload.product_gallery_urls
  ).filter(isImageUrl);

  const knowledgeUrls = urlList(
    offering.knowledge_content_url,
    payload["Knowledge Offering Content"],
    payload.knowledge_content,
    payload.knowledgeContent,
    payload.video,
    payload.video_url,
    payload.Video,
    payload.VideoUrl,
    payload["Video Link"],
    payload["Video URL"],
    payload.videoUrls,
    payload.videos,
    payload.product_video_urls
  );

  const media: MediaItem[] = [];
  gallery.forEach((url, index) => {
    media.push({
      title: index === 0 ? cleanText(offering.offering_name) || "Offering image" : `Image ${index + 1}`,
      url,
      kind: "image"
    });
  });
  knowledgeUrls.forEach((url, index) => {
    if (isPdfUrl(url) || isImageUrl(url)) return;
    media.push({
      title: index === 0 ? cleanText(offering.offering_name) || "Offering media" : `Media ${index + 1}`,
      url,
      kind: isVideoUrl(url) ? "video" : "external",
      embedUrl: isDirectVideoUrl(url) ? undefined : toEmbedUrl(url)
    });
  });
  return media;
}

function buildProviderRows(offering: any, viewerSummary: any) {
  const trader = offering.solution?.trader;
  return rowsOf([
    ["Provider", trader?.organisation_name || trader?.trader_name],
    ["Point of contact", offering.preferred_contact_name || trader?.poc_name],
    ["Email", offering.preferred_contact_email || trader?.email],
    ["Phone", maskPhoneNumber(offering.preferred_contact_phone || trader?.mobile, viewerSummary)],
    ["Website", trader?.website],
    ["Association status", trader?.association_status],
    ["Contact details", offering.preferred_contact_details || offering.contact_details],
    ["Tagline", trader?.tagline],
    ["Short description", trader?.short_description]
  ]);
}

function buildQuickCards(offering: any, kind: "product" | "service" | "knowledge", providerName: string, documents: DocumentItem[], media: MediaItem[]): QuickCard[] {
  if (kind === "product") {
    return rowsOf([
      ["Capacity / Grade", offering.grade_capacity || "To be discussed"],
      ["Product cost", offering.product_cost || offering.cost_remarks || "Quote after scope"],
      ["Lead time", offering.lead_time || "To be discussed"],
      ["Support", offering.support_details || "To be discussed"],
      ["Audience", offering.audience || "Groups, individuals, organisations, SHGs"]
    ]);
  }

  if (kind === "knowledge") {
    const format = [
      media.some((item) => item.kind === "video") ? "Video" : "",
      documents.length ? "PDF" : "",
      media.some((item) => item.kind === "image") ? "Images" : ""
    ].filter(Boolean).join(" + ") || "Content";
    return rowsOf([
      ["Format", format],
      ["Value chain", offering.primary_valuechain],
      ["Applications", offering.applications || offering.primary_application],
      ["Best for", offering.primary_application || offering.tags],
      ["Provider", providerName]
    ]);
  }

  return rowsOf([
    ["Duration", offering.duration || "To be discussed"],
    ["Service cost", offering.service_cost || offering.cost_remarks || "Quote after scope"],
    ["Languages", offering.languages],
    ["Delivery mode", offering.delivery_mode || offering.location_availability],
    ["Certification", offering.certification_offered || "To be discussed"],
    ["Support", offering.support_post_service || offering.support_details || "At service location"]
  ]);
}

function summaryBullets(offering: any, kind: "product" | "service" | "knowledge") {
  const source = cleanText(offering.solution?.about_solution_text || offering.about_offering_text);
  const parts = source
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, kind === "knowledge" ? 4 : 3);

  if (parts.length) return parts;

  if (kind === "product") return ["Helps evaluate the product quickly for deployment decisions."];
  if (kind === "knowledge") return ["Helps understand the practice, process, or knowledge resource."];
  return ["Helps evaluate the service, training, or advisory support."];
}

function buildTabs(
  offering: any,
  kind: "product" | "service" | "knowledge",
  providerRows: DetailRow[],
  documents: DocumentItem[],
  media: MediaItem[]
): TabItem[] {
  const commonRows = rowsOf([
    ["Offering category", offering.offering_category],
    ["Offering group", offering.offering_group],
    ["Offering type", offering.offering_type],
    ["6M domain", offering.domain_6m],
    ["Primary value chain", offering.primary_valuechain],
    ["Primary application", offering.primary_application],
    ["All value chains", offering.valuechains],
    ["All applications", offering.applications],
    ["Tags", offering.tags],
    ["Languages", offering.languages],
    ["Geography", offering.geographies],
    ["Location availability", offering.location_availability],
    ["Audience", offering.audience]
  ]);

  if (kind === "product") {
    return [
      {
        id: "overview",
        label: "Overview",
        intro: offering.about_offering_text || offering.solution?.about_solution_text,
        rows: commonRows,
        cards: summaryBullets(offering, kind).map((body, index) => ({ title: index === 0 ? "Product use case" : `Decision point ${index + 1}`, body }))
      },
      {
        id: "specs",
        label: "Specs",
        rows: rowsOf([
          ["Capacity / Grade", offering.grade_capacity],
          ["Product cost", offering.product_cost],
          ["Lead time", offering.lead_time],
          ["Support details", offering.support_details],
          ["Cost remarks", offering.cost_remarks]
        ])
      },
      {
        id: "deployment",
        label: "Deployment",
        rows: rowsOf([
          ["Geography", offering.geographies],
          ["Location availability", offering.location_availability],
          ["Audience", offering.audience],
          ["Contact details", offering.preferred_contact_details || offering.contact_details]
        ])
      },
      { id: "documents", label: "Documents", documents, media: media.filter((item) => item.kind === "image"), note: documents.length ? "" : "No documents added." },
      { id: "provider", label: "Provider", rows: providerRows },
      { id: "chat", label: "Chat" }
    ];
  }

  if (kind === "knowledge") {
    return [
      {
        id: "overview",
        label: "Overview",
        intro: offering.about_offering_text || offering.solution?.about_solution_text,
        rows: commonRows,
        cards: summaryBullets(offering, kind).map((body, index) => ({ title: index === 0 ? "What you will learn" : `Learning point ${index + 1}`, body }))
      },
      { id: "media", label: "Media", media, documents, note: !media.length && !documents.length ? "No media resources added." : "" },
      {
        id: "step-by-step",
        label: "Step-by-step",
        cards: summaryBullets(offering, kind).map((body, index) => ({ title: `Step ${index + 1}`, body }))
      },
      { id: "downloads", label: "Downloads", documents, note: documents.length ? "" : "No downloadable guides added." },
      { id: "provider", label: "Provider", rows: providerRows },
      { id: "chat", label: "Chat" }
    ];
  }

  return [
    {
      id: "overview",
      label: "Overview",
      intro: offering.about_offering_text || offering.solution?.about_solution_text,
      rows: commonRows,
      cards: summaryBullets(offering, kind).map((body, index) => ({ title: index === 0 ? "Service use case" : `Outcome ${index + 1}`, body }))
    },
    {
      id: "training-format",
      label: "Training format",
      rows: rowsOf([
        ["Trainer", offering.trainer_name],
        ["Trainer details", offering.trainer_details_text],
        ["Duration", offering.duration],
        ["Delivery mode", offering.delivery_mode],
        ["Training venue", offering.geographies || offering.location_availability],
        ["Languages", offering.languages]
      ])
    },
    {
      id: "costs",
      label: "Costs",
      rows: rowsOf([
        ["Service cost", offering.service_cost],
        ["Cost remarks", offering.cost_remarks],
        ["Support post service", offering.support_post_service],
        ["Support post service cost", offering.support_post_service_cost]
      ])
    },
    {
      id: "eligibility",
      label: "Eligibility",
      rows: rowsOf([
        ["Prerequisites", offering.prerequisites],
        ["Certification offered", offering.certification_offered],
        ["Audience", offering.audience],
        ["Contact details", offering.preferred_contact_details || offering.contact_details]
      ]),
      documents,
      media
    },
    { id: "provider", label: "Provider", rows: providerRows },
    { id: "chat", label: "Chat" }
  ];
}

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

export default async function OfferingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const headerStore = await headers();
  const cookieStore = await cookies();
  const surface = getSurfaceConfigByHost(headerStore.get("host"));
  const viewerSummary = parseSharedUserSummaryCookie(cookieStore.get("grameee_user_summary")?.value);

  let offering: any;
  try {
    offering = await getOfferingDetail(id);
  } catch {
    notFound();
  }

  const kind = offeringKind(offering);
  const title = offering.offering_name || offering.solution?.solution_name || "Untitled offering";
  const description = offering.about_offering_text || offering.solution?.about_solution_text || "This page shows the available GRE dataset details for this offering.";
  const providerName =
    offering.preferred_contact_name ||
    offering.solution?.trader?.organisation_name ||
    offering.solution?.trader?.trader_name ||
    offering.trainer_name ||
    "Solution Provider";
  const providerEmail = offering.preferred_contact_email || offering.solution?.trader?.email || offering.trainer_email || "";
  const providerRows = buildProviderRows(offering, viewerSummary);
  const documents = buildDocuments(offering, kind);
  const media = buildMedia(offering);
  const quickCards = buildQuickCards(offering, kind, providerRows[0]?.value || providerName, documents, media);
  const tabs = buildTabs(offering, kind, providerRows, documents, media);
  const chips = chipList(offering, kind);
  const primaryDoc = documents[0];
  const hasFeaturedMedia = media.some((item) => item.kind === "video" || item.kind === "external");
  const hasHeroMedia = Boolean(primaryDoc || media.some((item) => item.kind === "image"));
  const knowledgeContentUrl = kind === "knowledge"
    ? primaryDoc?.url || media.find((item) => item.kind === "external")?.url || ""
    : "";
  const summaryTitle =
    kind === "product" ? "What this product helps with" :
    kind === "knowledge" ? "What you will learn" :
    "What this service helps with";
  const snapshotTitle =
    kind === "product" ? "Provider snapshot" :
    kind === "knowledge" ? "Knowledge source snapshot" :
    "Trainer & provider snapshot";

  return (
    <main className="page-shell offering-page-shell">
      <section
        className={`offering-action-hero offering-${kind}${hasHeroMedia ? "" : " offering-hero-no-media"}`}
        aria-labelledby="offering-hero-title"
      >
        <div className="offering-hero-copy">
          <div className="offering-hero-topbar">
            <p className="offering-page-kicker">
              {kind === "product" ? "Product Offering View" : kind === "knowledge" ? "Knowledge Offering View" : "Service Offering View"}
            </p>
            <Link className="offering-hero-back" href="/">
              Back to Search
            </Link>
          </div>
          <h2 id="offering-hero-title">{title}</h2>
          <p>{description}</p>
          <div className="offering-chip-row">
            {chips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
        </div>

        <HeroMedia media={media} documents={documents} title={title} />

        <div className="offering-hero-actions" aria-label="Offering actions">
          <ProviderEmailButton
            providerEmail={providerEmail}
            providerName={providerName}
            offeringId={offering.offering_id}
            solutionTitle={title}
            solutionSummary={description}
            unavailableLabel={surface.slug === "supergre" ? "Contact currently unavailable." : ""}
          />

          <a className="offering-cta offering-cta-secondary" href="#offering-chat">
            Ask {surface.copilotLabel}
          </a>

          {kind === "knowledge" ? (
            <a
              className="offering-cta offering-cta-soft"
              href={knowledgeContentUrl || (hasFeaturedMedia ? "#media" : "#overview")}
              target={knowledgeContentUrl ? "_blank" : undefined}
              rel={knowledgeContentUrl ? "noreferrer" : undefined}
            >
              {knowledgeContentUrl ? "View content" : hasFeaturedMedia ? "View media" : "Read overview"}
            </a>
          ) : null}

          {primaryDoc ? (
            <a className="offering-cta offering-cta-soft" href={primaryDoc.url} target="_blank" rel="noreferrer">
              {kind === "knowledge" ? "Download guide" : "Download brochure"}
            </a>
          ) : null}

          {offering.gre_link ? (
            <TrackedAnchor
              className="offering-cta offering-cta-outline"
              href={offering.gre_link}
              target="_blank"
              rel="noreferrer"
              auditEvent={{
                kind: "view",
                surface: surface.slug,
                action: "view_portal",
                actorEmail: viewerSummary?.email,
                actorName: viewerSummary?.fullName || viewerSummary?.username,
                itemId: offering.offering_id,
                itemLabel: title,
                itemSource: surface.slug,
                portalUrl: offering.gre_link,
              }}
            >
              {surface.portalLabel}
            </TrackedAnchor>
          ) : null}
        </div>
      </section>

      <FeaturedMedia media={media} documents={documents} title={title} />

      <section className="offering-quick-grid" aria-label="Quick decision details">
        {quickCards.map((card) => (
          <article className="offering-quick-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>

      <section className="offering-summary-grid">
        <SummaryCard title={summaryTitle} bullets={summaryBullets(offering, kind)} />
        <SnapshotCard title={snapshotTitle} rows={providerRows} />
      </section>

      <OfferingDetailTabs tabs={tabs} offeringId={offering.offering_id} offeringName={title} />

      <div className="offering-page-bottom-actions">
        <Link className="offering-cta offering-cta-outline" href="/">
          Back to Search
        </Link>
      </div>

      <div className="offering-mobile-sticky-actions">
        <ProviderEmailButton
          providerEmail={providerEmail}
          providerName={providerName}
          offeringId={offering.offering_id}
          solutionTitle={title}
          solutionSummary={description}
          unavailableLabel={surface.slug === "supergre" ? "Contact currently unavailable." : ""}
        />
        <a className="offering-cta offering-cta-secondary" href="#offering-chat">
          Ask GRE
        </a>
      </div>
    </main>
  );
}
