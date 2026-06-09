import { MOCK_SOLUTIONS, type SixMDomain, type Solution, SIX_M_DOMAINS } from "@/data/mockSolutions";

export { MOCK_SOLUTIONS, SIX_M_DOMAINS };
export type { SixMDomain, Solution };

export const SIX_M_META: Array<{
  key: SixMDomain;
  description: string;
  accent: string;
  iconLabel: string;
}> = [
  { key: "Manpower", description: "People, skills and capacity building", accent: "#0b7a34", iconLabel: "MP" },
  { key: "Method", description: "Processes, practices and techniques", accent: "#1b8f53", iconLabel: "MD" },
  { key: "Material", description: "Inputs, resources and supplies", accent: "#4f9d69", iconLabel: "MT" },
  { key: "Machine", description: "Equipment, tools and technology", accent: "#0f8a43", iconLabel: "MC" },
  { key: "Money", description: "Finance, funding and incentives", accent: "#6aa84f", iconLabel: "MN" },
  { key: "Market", description: "Customers, channels and opportunities", accent: "#3f8f5c", iconLabel: "MK" }
];

export function normalizeKeyword(keyword: string) {
  return String(keyword || "").trim().toLowerCase();
}

export function getMockSolutionsForKeyword(keyword: string, sixMDomain?: SixMDomain) {
  const rows = MOCK_SOLUTIONS[normalizeKeyword(keyword)] || [];
  if (!sixMDomain) {
    return rows;
  }
  return rows.filter((item) => item.sixMDomains.includes(sixMDomain));
}

export function mapSearchResultToSolution(row: any): Solution {
  const providerName =
    row?.preferred_contact_name ||
    row?.solution?.trader?.organisation_name ||
    row?.solution?.trader?.trader_name ||
    "Unknown provider";

  const domains = Array.from(
    new Set(
      [row?.domain_6m]
        .flat()
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter((value): value is SixMDomain => SIX_M_DOMAINS.includes(value as SixMDomain))
    )
  );

  return {
    id: String(row?.offering_id || row?.id || ""),
    offeringId: String(row?.offering_id || row?.id || ""),
    title: String(row?.offering_name || row?.solution?.solution_name || "Untitled offering"),
    providerName,
    description: row?.about_offering_text || row?.solution?.about_solution_text || "",
    sixMDomains: domains.length ? domains : [],
    category: row?.offering_category || row?.offering_group || "",
    offeringType: row?.offering_type || "",
    valueChains: Array.isArray(row?.valuechains) ? row.valuechains : row?.primary_valuechain ? [row.primary_valuechain] : [],
    applications: Array.isArray(row?.applications) ? row.applications : row?.primary_application ? [row.primary_application] : [],
    geography: row?.geographies_raw || row?.location_availability || row?.product_location_text || row?.primary_geography || "",
    thumbnailUrl: row?.solution?.solution_image_url || row?.thumbnail_url || "",
    greUrl: row?.portal_url || row?.gre_link || "",
    contact: row?.preferred_contact_details || row?.contact_details || row?.solution?.trader?.email || "",
    tags: Array.isArray(row?.tags) ? row.tags : [],
    sourceLabel: row?.source_label || "GRE",
    detailHref: row?.detail_href || (row?.offering_id ? `/offering/${row.offering_id}` : "")
  };
}

export function buildSummaryText(keyword: string, selectedSolutions: Solution[]) {
  const groups = SIX_M_DOMAINS.map((domain) => {
    const rows = selectedSolutions.filter((solution) => solution.sixMDomains.includes(domain));
    return `${domain}: ${rows.length ? rows.map((row) => `${row.title} | ${row.providerName} | View Details: ${row.detailHref?.startsWith("http") ? row.detailHref : `https://askgre.grameee.org${row.detailHref || `/offering/${row.offeringId}`}`}`).join("\n") : "No selected solutions"}`;
  });

  return [`6M Explorer summary for "${keyword}"`, ...groups].join("\n");
}
