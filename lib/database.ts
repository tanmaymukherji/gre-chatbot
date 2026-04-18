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

function tokenizeQuery(query: string | undefined) {
  if (!query) {
    return [];
  }

  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "available",
    "can",
    "do",
    "for",
    "find",
    "from",
    "give",
    "i",
    "in",
    "is",
    "me",
    "need",
    "of",
    "on",
    "or",
    "please",
    "service",
    "show",
    "solution",
    "solutions",
    "the",
    "to",
    "with"
  ]);

  return [...new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !stopWords.has(token))
  )];
}

function buildHaystack(row: any) {
  return [
    row.offering_name,
    row.offering_category,
    row.offering_group,
    row.offering_type,
    row.domain_6m,
    row.primary_valuechain,
    row.primary_application,
    row.about_offering_text,
    row.search_document,
    ...(row.tags || []),
    ...(row.languages || []),
    ...(row.geographies || []),
    row.solution?.solution_name,
    row.solution?.about_solution_text,
    row.solution?.trader?.organisation_name,
    row.solution?.trader?.trader_name
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();
}

function scoreRow(row: any, query: string | undefined) {
  if (!query) {
    return 1;
  }

  const haystack = buildHaystack(row);
  const normalizedQuery = query.toLowerCase().trim();
  const tokens = tokenizeQuery(query);

  let score = 0;

  if (normalizedQuery && haystack.includes(normalizedQuery)) {
    score += 8;
  }

  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 2;
    }
  }

  if (row.offering_name && normalizedQuery && row.offering_name.toLowerCase().includes(normalizedQuery)) {
    score += 10;
  }

  if (row.primary_valuechain && tokens.some((token) => row.primary_valuechain.toLowerCase().includes(token))) {
    score += 3;
  }

  if (row.primary_application && tokens.some((token) => row.primary_application.toLowerCase().includes(token))) {
    score += 3;
  }

  return score;
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
      search_document,
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
    .limit(2000);

  if (filters.category) query = query.eq("offering_group", filters.category);
  if (filters.domain6m) query = query.eq("domain_6m", filters.domain6m);
  if (filters.offeringType) query = query.ilike("offering_type", `%${filters.offeringType}%`);

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const filtered = (data || [])
    .filter((row: any) => {
      return (
        matchesArray(row.languages, filters.language) &&
        matchesArray(row.geographies, filters.geography) &&
        matchesScalar(row.primary_valuechain, filters.valueChain) &&
        matchesScalar(row.primary_application, filters.application)
      );
    })
    .map((row: any) => ({
      row,
      score: scoreRow(row, q)
    }))
    .filter(({ score }) => !q || score > 0)
    .sort((left, right) => right.score - left.score || String(left.row.offering_name || "").localeCompare(String(right.row.offering_name || "")))
    .slice(0, limit)
    .map(({ row }) => row);

  return filtered;
}
