import Link from "next/link";
import { notFound } from "next/navigation";
import { OfferingDetailChat } from "@/components/offering-detail-chat";
import { getOfferingDetail } from "@/lib/database";

function formatValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }
  return String(value || "").trim();
}

function isPresent(value: unknown) {
  return formatValue(value).length > 0;
}

function buildOfferingRows(offering: any) {
  const commonRows = [
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
    ["Audience", offering.audience],
    ["Contact Details", offering.contact_details]
  ];

  const serviceRows = [
    ["Trainer Name", offering.trainer_name],
    ["Trainer Email", offering.trainer_email],
    ["Trainer Phone", offering.trainer_phone],
    ["Trainer Details", offering.trainer_details_text],
    ["Duration", offering.duration],
    ["Prerequisites", offering.prerequisites],
    ["Service Cost", offering.service_cost],
    ["Support Post Service", offering.support_post_service],
    ["Support Post Service Cost", offering.support_post_service_cost],
    ["Delivery Mode", offering.delivery_mode],
    ["Certification Offered", offering.certification_offered],
    ["Cost Remarks", offering.cost_remarks],
    ["Service Brochure", offering.service_brochure_url]
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
  const relevantRows =
    group === "service" ? serviceRows :
    group === "product" ? productRows :
    group === "knowledge" ? knowledgeRows :
    [];

  return [...commonRows, ...relevantRows].filter(([, value]) => isPresent(value));
}

function buildProviderRows(offering: any) {
  const trader = offering.solution?.trader;
  return [
    ["Solution Name", offering.solution?.solution_name],
    ["Provider", trader?.organisation_name || trader?.trader_name],
    ["Association Status", trader?.association_status],
    ["Email", trader?.email],
    ["Website", trader?.website],
    ["Phone", trader?.mobile],
    ["Point of Contact", trader?.poc_name],
    ["Tagline", trader?.tagline],
    ["Short Description", trader?.short_description]
  ].filter(([, value]) => isPresent(value));
}

export default async function OfferingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let offering: any;
  try {
    offering = await getOfferingDetail(id);
  } catch {
    notFound();
  }

  const detailRows = buildOfferingRows(offering);
  const providerRows = buildProviderRows(offering);

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="detail-hero-top">
          <Link className="btn hero-link" href="/">
            Back to Search
          </Link>
          {offering.gre_link ? (
            <a className="btn hero-link" href={offering.gre_link} target="_blank" rel="noreferrer">
              View on GRE
            </a>
          ) : null}
        </div>
        <h1>{offering.offering_name || "Untitled offering"}</h1>
        <p className="hero-copy">
          {offering.about_offering_text || offering.solution?.about_solution_text || "This page shows the available GRE dataset details for this offering."}
        </p>
      </section>

      <section className="detail-grid" style={{ marginTop: 24 }}>
        <section className="panel panel-pad">
          <h2 className="section-title">Offering Details</h2>
          <p className="section-copy">
            Only the parameters relevant to this {String(offering.offering_group || "offering").toLowerCase()} offering are shown below.
          </p>
          <table className="detail-table">
            <tbody>
              {detailRows.map(([label, value]) => (
                <tr key={label}>
                  <th>{label}</th>
                  <td>
                    {String(value).startsWith("http") ? (
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

        <section className="stack">
          <section className="panel panel-pad">
            <h2 className="section-title">Provider and Solution</h2>
            <table className="detail-table">
              <tbody>
                {providerRows.map(([label, value]) => (
                  <tr key={label}>
                    <th>{label}</th>
                    <td>
                      {String(value).startsWith("http") ? (
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
            {isPresent(offering.solution?.about_solution_text) ? (
              <div style={{ marginTop: 18 }}>
                <h3 className="section-title">About the Solution</h3>
                <p className="section-copy" style={{ marginBottom: 0 }}>
                  {offering.solution?.about_solution_text}
                </p>
              </div>
            ) : null}
          </section>

          <OfferingDetailChat offeringId={offering.offering_id} offeringName={offering.offering_name || "this offering"} />
        </section>
      </section>
    </main>
  );
}
