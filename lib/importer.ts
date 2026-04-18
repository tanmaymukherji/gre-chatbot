import * as XLSX from "xlsx";
import type { ImportBundle, OfferingRecord, SolutionRecord, TraderRecord } from "@/lib/types";
import { buildSearchDocument, normalizeCell, splitGeographies, splitLooseList, stripHtml } from "@/lib/text";

type Row = Record<string, unknown>;

function toJsonRows(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json<Row>(workbook.Sheets[firstSheet], {
    defval: "",
    raw: false
  });
}

function normalizeTraderRow(row: Row): TraderRecord {
  return {
    trader_id: String(row.TraderId).trim(),
    trader_name: normalizeCell(row.TraderName),
    organisation_name: normalizeCell(row.TraderOrganisation),
    mobile: normalizeCell(row.TraderMobile),
    email: normalizeCell(row.TraderMail),
    poc_name: normalizeCell(row.TraderPOC),
    tenant_id: normalizeCell(row.TraderTenantId),
    profile_id: normalizeCell(row.TraderProfileId),
    description: normalizeCell(row.TraderDescription),
    short_description: normalizeCell(row.TraderShortDescription),
    tagline: normalizeCell(row.TraderTagLine),
    website: normalizeCell(row.TraderWebsite),
    created_at_source: normalizeCell(row.TraderCreatedDate),
    association_status: normalizeCell(row.TraderAssociationStatus),
    raw_payload: row
  };
}

function normalizeSolutionRow(row: Row): SolutionRecord {
  return {
    solution_id: String(row.SolutionId).trim(),
    trader_id: normalizeCell(row.TraderId),
    solution_name: normalizeCell(row.SolutionName),
    solution_status: normalizeCell(row.SolutionStatus),
    publish_status: normalizeCell(row.SolutionPublishStatus),
    created_at_source: normalizeCell(row.SolutionCreationDate),
    about_solution_html: normalizeCell(row.AboutSolution),
    about_solution_text: stripHtml(normalizeCell(row.AboutSolution)),
    solution_image_url: normalizeCell(row.SolutionImage),
    raw_payload: row
  };
}

function normalizeOfferingRow(row: Row): OfferingRecord {
  const aboutOfferingHtml = normalizeCell(row.AboutOffering);
  const trainerDetailsHtml = normalizeCell(row["Trainer Details"]);

  const valuechains = splitLooseList(normalizeCell(row.Valuechains));
  const applications = splitLooseList(normalizeCell(row.Applications));
  const tags = splitLooseList(normalizeCell(row.Tags));
  const languages = splitLooseList(normalizeCell(row.Languages));
  const geographiesRaw = normalizeCell(row.Geographies);
  const geographies = splitGeographies(geographiesRaw);

  return {
    offering_id: String(row.OfferingId).trim().replace(/\.0$/, ""),
    solution_id: normalizeCell(row.SolutionId),
    trader_id: normalizeCell(row.TraderId),
    offering_name: normalizeCell(row.OfferingName),
    publish_status: normalizeCell(row.OfferingPublishStatus),
    created_at_source: normalizeCell(row.OfferingCreationDate),
    offering_category: normalizeCell(row.OfferingCategory),
    offering_group: normalizeCell(row.OfferingGroup),
    offering_type: normalizeCell(row.OfferingType),
    domain_6m: normalizeCell(row["6M"]),
    primary_valuechain_id: normalizeCell(row.PrimaryValuechainId),
    primary_valuechain: normalizeCell(row.PrimaryValuechain),
    primary_application_id: normalizeCell(row.PrimaryApplicationId),
    primary_application: normalizeCell(row.PrimaryApplication),
    valuechains,
    applications,
    tags,
    languages,
    geographies,
    geographies_raw: geographiesRaw,
    about_offering_html: aboutOfferingHtml,
    about_offering_text: stripHtml(aboutOfferingHtml),
    audience: normalizeCell(row["Who Can avail it"]),
    trainer_name: normalizeCell(row["Trainer Name"]),
    trainer_email: normalizeCell(row["Trainer Email Address"]),
    trainer_phone: normalizeCell(row["Trainer Phone Number"]),
    trainer_details_html: trainerDetailsHtml,
    trainer_details_text: stripHtml(trainerDetailsHtml),
    duration: normalizeCell(row.Duration),
    prerequisites: normalizeCell(row["Prerequisites - Participants and Training"]),
    service_cost: normalizeCell(row["Cost (Service)"]),
    support_post_service: normalizeCell(row["Support post Service"]),
    support_post_service_cost: normalizeCell(row["Support post Service Cost"]),
    delivery_mode: normalizeCell(row["Is it offered - Online or Offline"]),
    certification_offered: normalizeCell(row["Certification Offered"]),
    cost_remarks: normalizeCell(row["Remarks on Cost"]),
    location_availability: normalizeCell(row["Location Availability"]),
    service_brochure_url: normalizeCell(row["Service offering Brochure"]),
    grade_capacity: normalizeCell(row["Grade/Capacity"]),
    product_cost: normalizeCell(row["Cost (Product)"]),
    lead_time: normalizeCell(row["Lead Time"]),
    support_details: normalizeCell(row.Support),
    product_brochure_url: normalizeCell(row["Product Brochure"]),
    knowledge_content_url: normalizeCell(row["Knowledge Offering Content"]),
    contact_details: normalizeCell(row["Contact Details"]),
    gre_link: normalizeCell(row["Offering Link on GRE"]),
    search_document: buildSearchDocument([
      normalizeCell(row.SolutionName),
      normalizeCell(row.OfferingName),
      normalizeCell(row.OfferingCategory),
      normalizeCell(row.OfferingGroup),
      normalizeCell(row.OfferingType),
      normalizeCell(row["6M"]),
      normalizeCell(row.PrimaryValuechain),
      normalizeCell(row.PrimaryApplication),
      valuechains,
      applications,
      tags,
      languages,
      geographies,
      stripHtml(normalizeCell(row.AboutSolution)),
      stripHtml(aboutOfferingHtml),
      normalizeCell(row.TraderOrganisation)
    ]),
    raw_payload: row
  };
}

function dedupeById<T extends { [key: string]: unknown }>(rows: T[], key: keyof T) {
  const map = new Map<string, T>();
  rows.forEach((row) => {
    const value = String(row[key] ?? "").trim();
    if (value) {
      map.set(value, row);
    }
  });
  return [...map.values()];
}

export async function buildImportBundle(solutionBuffer: ArrayBuffer, traderBuffer: ArrayBuffer): Promise<ImportBundle> {
  const solutionRows = toJsonRows(solutionBuffer);
  const traderRows = toJsonRows(traderBuffer);

  const traders = dedupeById(traderRows.map(normalizeTraderRow), "trader_id");
  const solutions = dedupeById(solutionRows.map(normalizeSolutionRow), "solution_id");
  const offerings = dedupeById(solutionRows.map(normalizeOfferingRow), "offering_id");

  return {
    traders,
    solutions,
    offerings,
    stats: {
      solutionRows: solutionRows.length,
      traderRows: traderRows.length
    }
  };
}
