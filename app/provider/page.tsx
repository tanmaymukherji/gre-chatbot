import Link from "next/link";
import { notFound } from "next/navigation";
import { ProviderDetailBrowser } from "@/components/provider-detail-browser";
import { getProviderDetail } from "@/lib/database";

function formatValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }
  return String(value || "").trim();
}

function isPresent(value: unknown) {
  return formatValue(value).length > 0;
}

export default async function ProviderPage({
  searchParams
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const { name } = await searchParams;
  if (!name) {
    notFound();
  }

  let data: Awaited<ReturnType<typeof getProviderDetail>>;
  try {
    data = await getProviderDetail(name);
  } catch {
    notFound();
  }

  const provider = data.provider;
  const summaryRows = [
    ["Provider", provider.organisation_name || provider.trader_name],
    ["Association Status", provider.association_status],
    ["Email", provider.email],
    ["Website", provider.website],
    ["Phone", provider.mobile],
    ["Point of Contact", provider.poc_name],
    ["Tagline", provider.tagline]
  ].filter(([, value]) => isPresent(value));

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="detail-hero-top">
          <Link className="btn hero-link" href="/">
            Back to Search
          </Link>
        </div>
        <h1>{provider.organisation_name || provider.trader_name || "Solution Provider"}</h1>
        <p className="hero-copy">
          {provider.description || provider.short_description || "This page shows the available GRE dataset summary and offerings for the selected provider."}
        </p>
      </section>

      <section className="detail-grid" style={{ marginTop: 24 }}>
        <section className="panel panel-pad">
          <h2 className="section-title">Provider Summary</h2>
          <table className="detail-table">
            <tbody>
              {summaryRows.map(([label, value]) => (
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
          {isPresent(provider.short_description) ? (
            <div style={{ marginTop: 18 }}>
              <h3 className="section-title">Short Description</h3>
              <p className="section-copy" style={{ marginBottom: 0 }}>
                {provider.short_description}
              </p>
            </div>
          ) : null}
        </section>

        <section className="panel panel-pad">
          <h2 className="section-title">Offering Snapshot</h2>
          <div className="stats-grid">
            <div className="stat">
              Offerings
              <strong>{data.offerings.length}</strong>
              Published entries
            </div>
            <div className="stat">
              Value Chains
              <strong>{new Set(data.offerings.map((item) => item.primary_valuechain).filter(Boolean)).size}</strong>
              Active chains
            </div>
            <div className="stat">
              Applications
              <strong>{new Set(data.offerings.map((item) => item.primary_application).filter(Boolean)).size}</strong>
              Covered uses
            </div>
          </div>
        </section>
      </section>

      <section style={{ marginTop: 24 }}>
        <ProviderDetailBrowser offerings={data.offerings} />
      </section>

      <div className="page-bottom-actions">
        <Link className="btn hero-link" href="/">
          Back to Search
        </Link>
      </div>
    </main>
  );
}
