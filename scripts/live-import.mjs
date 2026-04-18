import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const cwd = process.cwd();

function readEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

function normalizeCell(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function splitLooseList(value, separators = [",", ";", "\n"]) {
  if (!value) return [];
  let working = value;
  for (const separator of separators) {
    working = working.split(separator).join("|");
  }
  return unique(
    working
      .split("|")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

function splitGeographies(value) {
  if (!value) return [];
  if (value.includes(";") || value.includes("\n") || value.includes("|")) {
    return splitLooseList(value, [";", "\n", "|"]);
  }
  return [value.trim()].filter(Boolean);
}

function buildSearchDocument(parts) {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter(Boolean)
    .join(" | ")
    .replace(/\s+/g, " ")
    .trim();
}

function readRows(fileName) {
  const workbook = XLSX.readFile(path.join(cwd, fileName), { cellDates: false });
  const firstSheet = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
    defval: "",
    raw: false
  });
}

function dedupeById(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = String(row[key] ?? "").trim();
    if (value) map.set(value, row);
  }
  return [...map.values()];
}

function buildBundle() {
  const solutionRows = readRows("solution_data_1776533608338.xlsx");
  const traderRows = readRows("trader_data_1776533597806.xlsx");

  const traders = dedupeById(
    traderRows.map((row) => ({
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
    })),
    "trader_id"
  );

  const solutions = dedupeById(
    solutionRows.map((row) => ({
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
    })),
    "solution_id"
  );

  const offerings = dedupeById(
    solutionRows.map((row) => {
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
    }),
    "offering_id"
  );

  return { traders, solutions, offerings, stats: { solutionRows: solutionRows.length, traderRows: traderRows.length } };
}

function chunk(rows, size = 250) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

const env = readEnvFile(path.join(cwd, ".env.local"));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const bundle = buildBundle();

const { data: importRow, error: importError } = await supabase
  .from("data_imports")
  .insert({
    solution_file_name: "solution_data_1776533608338.xlsx",
    trader_file_name: "trader_data_1776533597806.xlsx",
    status: "running",
    source_solution_rows: bundle.stats.solutionRows,
    source_trader_rows: bundle.stats.traderRows
  })
  .select("id")
  .single();

if (importError) throw importError;
const importId = importRow.id;

try {
  for (const rows of chunk(bundle.traders)) {
    const { error } = await supabase.from("traders").upsert(rows, { onConflict: "trader_id" });
    if (error) throw error;
  }

  for (const rows of chunk(bundle.solutions)) {
    const { error } = await supabase.from("solutions").upsert(rows, { onConflict: "solution_id" });
    if (error) throw error;
  }

  for (const rows of chunk(bundle.offerings)) {
    const withImportId = rows.map((row) => ({ ...row, last_import_id: importId }));
    const { error } = await supabase.from("offerings").upsert(withImportId, { onConflict: "offering_id" });
    if (error) throw error;
  }

  await supabase
    .from("data_imports")
    .update({
      status: "completed",
      inserted_traders: bundle.traders.length,
      inserted_solutions: bundle.solutions.length,
      inserted_offerings: bundle.offerings.length,
      completed_at: new Date().toISOString()
    })
    .eq("id", importId);

  const [{ count: traderCount, error: traderCountError }, { count: solutionCount, error: solutionCountError }, { count: offeringCount, error: offeringCountError }] = await Promise.all([
    supabase.from("traders").select("*", { count: "exact", head: true }),
    supabase.from("solutions").select("*", { count: "exact", head: true }),
    supabase.from("offerings").select("*", { count: "exact", head: true })
  ]);

  if (traderCountError || solutionCountError || offeringCountError) {
    throw traderCountError || solutionCountError || offeringCountError;
  }

  console.log(
    JSON.stringify(
      {
        importId,
        imported: {
          traders: bundle.traders.length,
          solutions: bundle.solutions.length,
          offerings: bundle.offerings.length
        },
        totals: {
          traders: traderCount,
          solutions: solutionCount,
          offerings: offeringCount
        }
      },
      null,
      2
    )
  );
} catch (error) {
  await supabase
    .from("data_imports")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error)
    })
    .eq("id", importId);
  throw error;
}
