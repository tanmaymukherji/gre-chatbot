import Link from "next/link";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ProviderEmailButton } from "@/components/provider-email-button";
import { TrackedAnchor } from "@/components/tracked-links";
import { DetailBackButton } from "@/components/detail-back-button";
import { getExternalOfferingDetail } from "@/lib/database";
import { maskPhoneNumber, parseSharedUserSummaryCookie } from "@/lib/auth";
import { getSurfaceConfigByHost } from "@/lib/surface";

type DetailMediaItem = {
  kind: "image" | "video";
  url: string;
  label?: string;
};

type DetailExtraSection = {
  title: string;
  rows?: Array<[string, unknown]>;
  mediaItems?: DetailMediaItem[];
};

function formatValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .flatMap((item) => (Array.isArray(item) ? item : [item]))
      .filter(Boolean)
      .join(", ");
  }
  return String(value || "").trim();
}

function isPresent(value: unknown) {
  return formatValue(value).length > 0;
}

function isLinkValue(value: unknown) {
  const text = String(value || "").trim().toLowerCase();
  return text.startsWith("http://") || text.startsWith("https://") || text.startsWith("data:");
}

function renderCell(value: unknown) {
  if (isLinkValue(value)) {
    return (
      <a className="result-link" href={String(value)} target="_blank" rel="noreferrer">
        Open link
      </a>
    );
  }
  return formatValue(value);
}

function rowsOf(entries: Array<[string, unknown]>) {
  return entries.filter(([, value]) => isPresent(value));
}

function uniqueMediaUrls(values: unknown) {
  const urls = flattenObjectStrings(values).filter((value) => isLinkValue(value));
  return [...new Set(urls)];
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url) ||
    /youtube\.com\/watch\?/i.test(url) ||
    /youtu\.be\//i.test(url) ||
    /youtube\.com\/embed\//i.test(url) ||
    /vimeo\.com\//i.test(url);
}

function toEmbedUrl(url: string) {
  const text = String(url || "").trim();
  const youtubeWatch = text.match(/[?&]v=([^&]+)/i);
  if (/youtube\.com\/watch\?/i.test(text) && youtubeWatch?.[1]) {
    return `https://www.youtube.com/embed/${youtubeWatch[1]}`;
  }

  const youtuBe = text.match(/youtu\.be\/([^?&#/]+)/i);
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

  return text;
}

function mediaSection(title: string, values: unknown, kind?: "image" | "video"): DetailExtraSection | null {
  const urls = uniqueMediaUrls(values);
  if (!urls.length) {
    return null;
  }

  return {
    title,
    mediaItems: urls.map((url) => ({
      kind: kind || (isVideoUrl(url) ? "video" : "image"),
      url
    }))
  };
}

function flattenObjectStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenObjectStrings(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => flattenObjectStrings(item));
  }
  const text = String(value || "").trim();
  return text ? [text] : [];
}

function baseProviderRows(offering: any, viewerSummary: any) {
  const trader = offering.solution?.trader;
  return rowsOf([
    ["Solution Name", offering.solution?.solution_name],
    ["Provider", trader?.organisation_name || trader?.trader_name || offering.preferred_contact_name],
    ["Association Status", trader?.association_status],
    ["Email", offering.preferred_contact_email || trader?.email],
    ["Website", trader?.website || offering.portal_url],
    ["Phone", maskPhoneNumber(offering.preferred_contact_phone || trader?.mobile, viewerSummary)],
    ["Point of Contact", offering.preferred_contact_name || trader?.poc_name],
    ["Contact Details", offering.preferred_contact_details],
    ["Tagline", trader?.tagline],
    ["Short Description", trader?.short_description]
  ]);
}

function buildStructuredDetailSections(offering: any, viewerSummary: any) {
  const source = String(offering.source_slug || "").trim();
  const payload = offering.raw_payload || {};
  const providerRows = baseProviderRows(offering, viewerSummary);

  if (source === "selco" || source === "innovation-guild" || source === "gian" || source === "grid") {
    const product = payload.product || payload.practice || {};
    const vendor = payload.vendor || payload.entity || {};
    const specifications = Array.isArray(product.product_specifications) ? product.product_specifications : [];
    const mediaRows = rowsOf([
      ["Primary Image", product.product_image_url || offering.solution?.solution_image_url],
      ["Gallery", payload.galleryUrls],
      ["Videos", payload.videoUrls],
      ["Attachments", payload.attachmentUrls],
      ["Portal Page", offering.portal_url]
    ]);

    return {
      introTitle: source === "grid" ? "About the Practice" : "About the Solution",
      introText:
        offering.solution?.about_solution_text ||
        offering.about_offering_text ||
        product.practice_details ||
        product.innovator_details ||
        vendor.about_vendor ||
        null,
      primaryRows: rowsOf([
        ["Offering Category", offering.offering_category],
        ["Offering Group", offering.offering_group],
        ["Offering Type", offering.offering_type],
        ["6M Domain", offering.domain_6m],
        ["Primary Value Chain", offering.primary_valuechain],
        ["Primary Application", offering.primary_application],
        ["All Value Chains", offering.valuechains],
        ["All Applications", offering.applications],
        ["Tags", offering.tags],
        ["Geography", offering.geographies],
        ["Source", offering.source_label],
        ["Source Categories", product.product_categories],
        ["Source Subcategories", product.product_subcategories]
      ]),
      secondaryRows: rowsOf([
        ["Summary", product.practice_summary || product.product_description || offering.about_offering_text],
        ["Location", product.product_location_text || vendor.location_text],
        ["Service Locations", vendor.service_locations],
        ["Source Reference", product.source_reference],
        ["Support Details", offering.support_details],
        ["Contact Notes", vendor.contact_notes]
      ]),
      providerRows,
      extraSections: [
        specifications.length ? {
          title: source === "grid" ? "Practice Specifications" : "Offering Specifications",
          rows: rowsOf(specifications.map((item: any) => [String(item?.key || "Specification"), item?.value]))
        } : null,
        mediaSection("Images", [product.product_image_url || offering.solution?.solution_image_url, payload.galleryUrls], "image"),
        mediaSection("Videos", payload.videoUrls, "video"),
        mediaSection("Attachments", payload.attachmentUrls),
        mediaRows.length ? {
          title: "Media and Source Links",
          rows: rowsOf(mediaRows.filter(([label]) => !["Primary Image", "Gallery", "Videos", "Attachments"].includes(label)))
        } : null
      ].filter(Boolean)
    };
  }

  if (source === "better-india") {
    const story = payload.story || {};
    const aiSummary = payload.aiSummary || {};
    return {
      introTitle: "About the Story",
      introText: story.summary_of_work || story.story_excerpt || offering.solution?.about_solution_text || null,
      primaryRows: rowsOf([
        ["Story Title", story.title || offering.offering_name],
        ["Person", story.person_name],
        ["Author", story.author_name],
        ["Thematic Area", story.thematic_area],
        ["6M Domain", offering.domain_6m],
        ["Tags", offering.tags],
        ["Place", story.place_label],
        ["Location", story.location_text],
        ["State", story.state],
        ["Published", story.source_published_at]
      ]),
      secondaryRows: rowsOf([
        ["Summary of Work", story.summary_of_work],
        ["Excerpt", story.story_excerpt],
        ["Contributors", Array.isArray(aiSummary.contributors) ? aiSummary.contributors.map((item: any) => [item?.name, item?.contribution].filter(Boolean).join(": ")) : []],
        ["Process Steps", aiSummary.process_steps],
        ["Source Story", story.story_url]
      ]),
      providerRows: rowsOf([
        ["Person / Entity", story.person_name],
        ["Email", story.contact_email],
        ["Phone", maskPhoneNumber(story.contact_phone, viewerSummary)],
        ["Address", story.contact_address],
        ["Portal Page", story.story_url]
      ]),
      extraSections: [
        mediaSection("Story Images", [story.cover_image_url, payload.galleryUrls], "image")
      ].filter(Boolean)
    };
  }

  if (source === "livelihood") {
    const entity = payload.entity || {};
    const typeSpecific = entity.type_specific_data || {};
    const typeSpecificRows = Object.entries(typeSpecific).map(([key, value]) => [
      key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase()),
      Array.isArray(value) ? value : flattenObjectStrings(value)
    ] as [string, unknown]);

    return {
      introTitle: "About the Entity",
      introText: entity.summary || entity.description || offering.solution?.about_solution_text || null,
      primaryRows: rowsOf([
        ["Entity Name", entity.entity_name],
        ["Entity Type", entity.entity_type_label || entity.entity_type_slug],
        ["Entity Kind", entity.entity_kind],
        ["Offering Type", offering.offering_type],
        ["6M Domain", offering.domain_6m],
        ["Tags", offering.tags],
        ["Keywords", entity.keywords],
        ["Location", entity.location_label],
        ["District", entity.district],
        ["State", entity.state],
        ["Country", entity.country]
      ]),
      secondaryRows: rowsOf([
        ["Summary", entity.summary],
        ["Description", entity.description],
        ["Primary Address", entity.primary_address],
        ["Office Locations", entity.office_locations],
        ["Website", entity.website_url],
        ["Source Label", entity.source_label],
        ["Source URL", entity.source_url]
      ]),
      providerRows: rowsOf([
        ["Contact Name", entity.entity_name],
        ["Email", entity.contact_email],
        ["Phone", maskPhoneNumber(entity.contact_phone, viewerSummary)],
        ["Website", entity.website_url],
        ["Portal Page", entity.website_url || entity.source_url]
      ]),
      extraSections: [
        typeSpecificRows.length ? {
          title: "Entity-Specific Details",
          rows: rowsOf(typeSpecificRows)
        } : null
      ].filter(Boolean)
    };
  }

  return {
    introTitle: "About the Solution",
    introText: offering.solution?.about_solution_text || offering.about_offering_text || null,
    primaryRows: rowsOf([
      ["Source", offering.source_label],
      ["Category", offering.offering_group],
      ["Offering Type", offering.offering_type],
      ["6M Domain", offering.domain_6m],
      ["Provider", offering.preferred_contact_name],
      ["Geography", offering.geographies],
      ["Tags", offering.tags]
    ]),
      secondaryRows: rowsOf([
        ["Summary", offering.about_offering_text],
        ["Portal Page", offering.portal_url]
      ]),
      providerRows,
      extraSections: [
        offering.knowledge_content_url ? mediaSection("Videos", [offering.knowledge_content_url], "video") : null,
        offering.service_brochure_url || offering.product_brochure_url ? mediaSection("Attachments", [
          offering.service_brochure_url,
          offering.product_brochure_url,
        ].filter(Boolean)) : null,
      ].filter(Boolean)
    };
}

function DetailTable({ rows }: { rows: Array<[string, unknown]> }) {
  return (
    <table className="detail-table">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th>{label}</th>
            <td>{renderCell(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MediaCard({ item }: { item: DetailMediaItem }) {
  const embedUrl = toEmbedUrl(item.url);
  const isHostedVideo = /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(item.url);
  const canFrame = /youtube\.com\/embed\/|player\.vimeo\.com\/video\//i.test(embedUrl);

  return (
    <div className="detail-media-card">
      {item.kind === "image" ? (
        <img className="detail-media-image" src={item.url} alt={item.label || "Detail media"} loading="lazy" />
      ) : isHostedVideo ? (
        <video className="detail-media-video" controls preload="metadata">
          <source src={item.url} />
          Your browser does not support embedded video playback.
        </video>
      ) : canFrame ? (
        <iframe
          className="detail-media-frame"
          src={embedUrl}
          title={item.label || "Embedded video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <a className="result-link" href={item.url} target="_blank" rel="noreferrer">
          Open media
        </a>
      )}
      <div className="detail-media-caption">
        <a className="result-link" href={item.url} target="_blank" rel="noreferrer">
          Open original
        </a>
      </div>
    </div>
  );
}

function DetailExtraSectionBlock({ section }: { section: DetailExtraSection }) {
  return (
    <section className="panel panel-pad">
      <h2 className="section-title">{section.title}</h2>
      {section.rows?.length ? <DetailTable rows={section.rows} /> : null}
      {section.mediaItems?.length ? (
        <div className="detail-media-grid">
          {section.mediaItems.map((item, index) => (
            <MediaCard item={item} key={`${section.title}-${item.url}-${index}`} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default async function ExternalDetailPage({
  params
}: {
  params: Promise<{ source: string; id: string }>;
}) {
  const { source, id } = await params;
  const headerStore = await headers();
  const cookieStore = await cookies();
  const surface = getSurfaceConfigByHost(headerStore.get("host"));
  const viewerSummary = parseSharedUserSummaryCookie(cookieStore.get("grameee_user_summary")?.value);

  let offering: any;
  try {
    offering = await getExternalOfferingDetail(source, id);
  } catch {
    notFound();
  }

  const providerName =
    offering.preferred_contact_name ||
    offering.solution?.trader?.organisation_name ||
    offering.solution?.trader?.trader_name ||
    "Solution Provider";
  const providerEmail = offering.preferred_contact_email || offering.solution?.trader?.email || "";
  const detailPath = `/detail/${encodeURIComponent(source)}/${encodeURIComponent(id)}`;
  const sections = buildStructuredDetailSections(offering, viewerSummary);

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="detail-hero-top">
          <div className="detail-hero-actions-left">
            {offering.portal_url ? (
              <TrackedAnchor
                className="btn hero-link"
                href={offering.portal_url}
                target="_blank"
                rel="noreferrer"
                auditEvent={{
                  kind: "view",
                  surface: surface.slug,
                  action: "view_portal",
                  actorEmail: viewerSummary?.email,
                  actorName: viewerSummary?.fullName || viewerSummary?.username,
                  itemId: offering.offering_id,
                  itemLabel: offering.offering_name || "External offering",
                  itemSource: source,
                  portalUrl: offering.portal_url,
                }}
              >
                {surface.portalLabel}
              </TrackedAnchor>
            ) : null}
            <ProviderEmailButton
              providerEmail={providerEmail}
              providerName={providerName}
              offeringId={offering.offering_id}
              solutionTitle={offering.offering_name || "External offering"}
              solutionSummary={offering.about_offering_text || offering.solution?.about_solution_text || offering.offering_name || "this solution"}
              detailPath={detailPath}
              unavailableLabel="Contact currently unavailable."
            />
          </div>
          <DetailBackButton className="btn hero-link detail-hero-back" />
        </div>
        <div className="detail-hero-main">
          <div className="detail-hero-copy">
            <h1>{offering.offering_name || "Untitled offering"}</h1>
            <p className="hero-copy">
              {offering.about_offering_text || offering.solution?.about_solution_text || "This page shows the source-specific SuperGRE detail view for this record."}
            </p>
          </div>
          {offering.solution?.solution_image_url ? (
            <div className="detail-hero-image-wrap">
              <img className="detail-hero-image" src={offering.solution.solution_image_url} alt={offering.offering_name || "Offering image"} />
            </div>
          ) : null}
        </div>
      </section>

      <section className="detail-stack" style={{ marginTop: 24 }}>
        {isPresent(sections.introText) ? (
          <section className="panel panel-pad">
            <h2 className="section-title">{sections.introTitle}</h2>
            <p className="section-copy detail-panel-copy" style={{ marginBottom: 0 }}>
              {sections.introText}
            </p>
          </section>
        ) : null}

        <section className="detail-grid">
          <section className="stack">
            {sections.primaryRows.length ? (
              <section className="panel panel-pad">
                <h2 className="section-title">Offering Category</h2>
                <p className="section-copy">
                  The source-specific fields below follow the structure of the original detail view while staying inside SuperGRE.
                </p>
                <DetailTable rows={sections.primaryRows} />
              </section>
            ) : null}

            {sections.secondaryRows.length ? (
              <section className="panel panel-pad">
                <h2 className="section-title">Offering Details</h2>
                <DetailTable rows={sections.secondaryRows} />
              </section>
            ) : null}

            {sections.extraSections.map((section: any) => (
              <DetailExtraSectionBlock section={section} key={section.title} />
            ))}
          </section>

          <section className="stack">
            <section className="panel panel-pad">
              <h2 className="section-title">Provider and Solution</h2>
              <DetailTable rows={sections.providerRows} />
            </section>
          </section>
        </section>
      </section>

      <div className="page-bottom-actions">
        <DetailBackButton className="btn hero-link" />
      </div>
    </main>
  );
}
