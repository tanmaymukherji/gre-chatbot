import { createServerSupabaseClient } from "@/lib/supabase";
import type { ImportBundle, SearchFilters } from "@/lib/types";

function chunk<T>(rows: T[], size = 250) {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

function matchesArray(rows: string[] | null | undefined, probe: string | undefined) {
  if (!probe) {
    return true;
  }
  const target = probe.toLowerCase();
  return (rows || []).some((value) => value.toLowerCase().includes(target));
}

function matchesScalar(value: string | null | undefined, probe: string | undefined) {
  if (!probe) {
    return true;
  }
  return (value || "").toLowerCase().includes(probe.toLowerCase());
}

export async function applyImportBundle(bundle: ImportBundle, fileNames: { solutionFileName: string; traderFileName: string }) {
  const supabase = createServerSupabaseClient();

  const { data: importRow, error: importError } = await supabase
    .from("data_imports")
    .insert({
      solution_file_name: fileNames.solutionFileName,
      trader_file_name: fileNames.traderFileName,
      status: "running",
      source_solution_rows: bundle.stats.solutionRows,
      source_trader_rows: bundle.stats.traderRows
    })
    .select("id")
    .single();

  if (importError) {
    throw importError;
  }

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
      const rowsWithImport = rows.map((row) => ({ ...row, last_import_id: importId }));
      const { error } = await supabase.from("offerings").upsert(rowsWithImport, { onConflict: "offering_id" });
      if (error) throw error;
    }

    const { error: completeError } = await supabase
      .from("data_imports")
      .update({
        status: "completed",
        inserted_traders: bundle.traders.length,
        inserted_solutions: bundle.solutions.length,
        inserted_offerings: bundle.offerings.length,
        completed_at: new Date().toISOString()
      })
      .eq("id", importId);

    if (completeError) {
      throw completeError;
    }

    return {
      importId,
      traders: bundle.traders.length,
      solutions: bundle.solutions.length,
      offerings: bundle.offerings.length
    };
  } catch (error) {
    await supabase
      .from("data_imports")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : "Unknown import error"
      })
      .eq("id", importId);

    throw error;
  }
}

export async function runSearch(filters: SearchFilters) {
  const supabase = createServerSupabaseClient();
  const limit = Math.min(filters.limit || 12, 50);
  const q = filters.q?.trim();

  let query = supabase
    .from("offerings")
    .select(
      `
      offering_id,
      offering_name,
      offering_category,
      offering_group,
      offering_type,
      domain_6m,
      primary_valuechain,
      primary_application,
      tags,
      languages,
      geographies,
      geographies_raw,
      about_offering_text,
      service_cost,
      product_cost,
      delivery_mode,
      certification_offered,
      gre_link,
      solution:solutions (
        solution_id,
        solution_name,
        about_solution_text,
        solution_image_url,
        trader:traders (
          trader_id,
          trader_name,
          organisation_name,
          email,
          website,
          association_status
        )
      )
    `
    )
    .eq("publish_status", "Published")
    .order("offering_name", { ascending: true })
    .limit(200);

  if (filters.category) query = query.eq("offering_group", filters.category);
  if (filters.domain6m) query = query.eq("domain_6m", filters.domain6m);
  if (filters.offeringType) query = query.eq("offering_type", filters.offeringType);
  if (filters.valueChain) query = query.ilike("search_document", `%${filters.valueChain}%`);
  if (filters.application) query = query.ilike("search_document", `%${filters.application}%`);
  if (q) query = query.ilike("search_document", `%${q}%`);

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const filtered = (data || []).filter((row: any) => {
    return (
      matchesArray(row.tags, filters.q) &&
      matchesArray(row.languages, filters.language) &&
      matchesArray(row.geographies, filters.geography) &&
      matchesScalar(row.primary_valuechain, filters.valueChain) &&
      matchesScalar(row.primary_application, filters.application)
    );
  });

  return filtered.slice(0, limit);
}
