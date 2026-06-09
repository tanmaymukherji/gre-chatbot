import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { OfferingDetailChat } from "@/components/offering-detail-chat";
import { ProviderEmailButton } from "@/components/provider-email-button";
import { TrackedAnchor } from "@/components/tracked-links";
import { getOfferingDetail } from "@/lib/database";
import { maskPhoneNumber, parseSharedUserSummaryCookie } from "@/lib/auth";
import { getSurfaceConfigByHost } from "@/lib/surface";

function formatValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
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

function buildOfferingRows(offering: any, viewerSummary: any) {
  const primaryRows = [
    ["Offering Category", offering.offering_category],
    ["Offering Group", offering.offering_group],
    ["Offering Type", offering.offering_type],
    ["6M Domain", offering.domain_6m],
    ["Primary Value Chain", offering.primary_valuechain],
    ["Primary Application", offering.primary_application],
    ["All Value Chains", offering.valuechains],
    ["All Applications", offering.applications],
    ["Tags", offering.tags],
    ["Languages", offering.languages],
    ["Geography", offering.geographies],
    ["Location Availability", offering.location_availability],
    ["Audience", offering.audience]
  ];

  const secondaryRows = [
    ["Contact Details", offering.preferred_contact_details || offering.contact_details]
  ];

  const serviceRows = [
    ["Trainer Name", offering.trainer_name],
    ["Trainer Email", offering.trainer_email],
    ["Trainer Phone", maskPhoneNumber(offering.trainer_phone, viewerSummary)],
    ["Trainer Details", offering.trainer_details_text],
    ["Duration", offering.duration],
    ["Prerequisites", offering.prerequisites],
    ["Service Cost", offering.service_cost],
    ["Support Post Service", offering.support_post_service],
    ["Support Post Service Cost", offering.support_post_service_cost],
    ["Delivery Mode", offering.delivery_mode],
    ["Certification Offered", offering.certification_offered],
    ["Cost Remarks", offering.cost_remarks],
    ["Service Brochure", offering.service_brochure_url || offering.product_brochure_url]
  ];

  const productRows = [
    ["Grade or Capacity", offering.grade_capacity],
    ["Product Cost", offering.product_cost],
    ["Lead Time", offering.lead_time],
    ["Support Details", offering.support_details],
    ["Cost Remarks", offering.cost_remarks],
    ["Product Brochure", offering.product_brochure_url]
  ];

  const knowledgeRows = [
    ["Delivery Mode", offering.delivery_mode],
    ["Duration", offering.duration],
    ["Prerequisites", offering.prerequisites],
    ["Certification Offered", offering.certification_offered],
    ["Knowledge Content", offering.knowledge_content_url]
  ];

  const group = String(offering.offering_group || "").toLowerCase();
  const category = String(offering.offering_category || "").toLowerCase();
  const relevantRows =
    (group === "service" || category.includes("service")) ? serviceRows :
    (group === "product" || category.includes("product")) ? productRows :
    (group === "knowledge" || category.includes("knowledge")) ? knowledgeRows :
    [];

  return {
    primaryRows: primaryRows.filter(([, value]) => isPresent(value)),
    secondaryRows: [...secondaryRows, ...relevantRows].filter(([, value]) => isPresent(value))
  };
}

function buildProviderRows(offering: any, viewerSummary: any) {
  const trader = offering.solution?.trader;
  return [
    ["Solution Name", offering.solution?.solution_name],
    ["Provider", trader?.organisation_name || trader?.trader_name],
    ["Association Status", trader?.association_status],
    ["Email", offering.preferred_contact_email || trader?.email],
    ["Website", trader?.website],
    ["Phone", maskPhoneNumber(offering.preferred_contact_phone || trader?.mobile, viewerSummary)],
    ["Point of Contact", offering.preferred_contact_name || trader?.poc_name],
    ["Contact Details", offering.preferred_contact_details || offering.contact_details],
    ["Tagline", trader?.tagline],
    ["Short Description", trader?.short_description]
  ].filter(([, value]) => isPresent(value));
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

  const { primaryRows, secondaryRows } = buildOfferingRows(offering, viewerSummary);
  const providerRows = buildProviderRows(offering, viewerSummary);
  const providerName =
    offering.preferred_contact_name ||
    offering.solution?.trader?.organisation_name ||
    offering.solution?.trader?.trader_name ||
    offering.trainer_name ||
    "Solution Provider";
  const providerEmail = offering.preferred_contact_email || offering.solution?.trader?.email || offering.trainer_email || "";
  const solutionTitle = offering.solution?.solution_name || offering.offering_name || "GRE solution";
  const solutionSummary =
    offering.solution?.solution_name ||
    offering.about_offering_text ||
    offering.solution?.about_solution_text ||
    offering.offering_name ||
    "this solution";

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="detail-hero-top">
          <div className="detail-hero-actions-left">
            {offering.gre_link ? (
              <TrackedAnchor
                className="btn hero-link"
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
                  itemLabel: offering.offering_name || solutionTitle,
                  itemSource: surface.slug,
                  portalUrl: offering.gre_link,
                }}
              >
                {surface.portalLabel}
              </TrackedAnchor>
            ) : null}
            <ProviderEmailButton
              providerEmail={providerEmail}
              providerName={providerName}
              offeringId={offering.offering_id}
              solutionTitle={solutionTitle}
              solutionSummary={solutionSummary}
              unavailableLabel={surface.slug === "supergre" ? "Contact currently unavailable." : ""}
            />
          </div>
          <Link className="btn hero-link detail-hero-back" href="/">
            Back to Search
          </Link>
        </div>
        <div className="detail-hero-main">
          <div className="detail-hero-copy">
            <h1>{offering.offering_name || "Untitled offering"}</h1>
            <p className="hero-copy">
              {offering.about_offering_text || offering.solution?.about_solution_text || "This page shows the available GRE dataset details for this offering."}
            </p>
          </div>
          {offering.solution?.solution_image_url ? (
            <div className="detail-hero-image-wrap">
              <img
                className="detail-hero-image"
                src={offering.solution.solution_image_url}
                alt={offering.offering_name || "Offering image"}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="detail-stack" style={{ marginTop: 24 }}>
        {isPresent(offering.solution?.about_solution_text) ? (
          <section className="panel panel-pad">
            <h2 className="section-title">About the Solution</h2>
            <p className="section-copy detail-panel-copy" style={{ marginBottom: 0 }}>
              {offering.solution?.about_solution_text}
            </p>
          </section>
        ) : null}

        <section className="detail-grid">
          <section className="stack">
            <section className="panel panel-pad">
              <h2 className="section-title">Offering Category</h2>
              <p className="section-copy">
                Only the parameters relevant to this {String(offering.offering_group || "offering").toLowerCase()} offering are shown below.
              </p>
              <table className="detail-table">
                <tbody>
                  {primaryRows.map(([label, value]) => (
                    <tr key={label}>
                      <th>{label}</th>
                      <td>
                        {isLinkValue(value) ? (
                          <a className="result-link" href={String(value)} target="_blank" rel="noreferrer">
                            Open link
                          </a>
                        ) : (
                          formatValue(value)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {secondaryRows.length ? (
              <section className="panel panel-pad">
                <h2 className="section-title">Offering Details</h2>
                <table className="detail-table">
                  <tbody>
                    {secondaryRows.map(([label, value]) => (
                      <tr key={label}>
                        <th>{label}</th>
                        <td>
                          {isLinkValue(value) ? (
                            <a className="result-link" href={String(value)} target="_blank" rel="noreferrer">
                              Open link
                            </a>
                          ) : (
                            formatValue(value)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
          </section>

          <section className="stack">
            <section className="panel panel-pad">
              <h2 className="section-title">Provider and Solution</h2>
              <table className="detail-table">
                <tbody>
                  {providerRows.map(([label, value]) => (
                    <tr key={label}>
                      <th>{label}</th>
                      <td>
                        {isLinkValue(value) ? (
                          <a className="result-link" href={String(value)} target="_blank" rel="noreferrer">
                            Open link
                          </a>
                        ) : (
                          formatValue(value)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <OfferingDetailChat offeringId={offering.offering_id} offeringName={offering.offering_name || "this offering"} />
          </section>
        </section>
      </section>

      <div className="page-bottom-actions">
        <Link className="btn hero-link" href="/">
          Back to Search
        </Link>
      </div>
    </main>
  );
}
