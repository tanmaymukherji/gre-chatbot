import { createServerSupabaseClient } from "@/lib/supabase";
import type { ImportBundle, SearchFilters } from "@/lib/types";

const FILTER_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_DATA_CACHE_TTL_MS = 10 * 60 * 1000;

type CachedFilterOptions = {
  solutionProviders: string[];
  categories: string[];
  domains6m: string[];
  offeringTypes: string[];
  valueChains: string[];
  applications: string[];
  tags: string[];
  languages: string[];
  geographies: string[];
};

type SearchOfferingRow = any;
type TraderLookupRow = {
  trader_id: string;
  organisation_name: string | null;
  trader_name: string | null;
};

let filterOptionsCache:
  | {
      expiresAt: number;
      value: CachedFilterOptions;
    }
  | null = null;
let searchDataCache:
  | {
      expiresAt: number;
      offerings: SearchOfferingRow[];
      traders: TraderLookupRow[];
    }
  | null = null;

function chunk<T>(rows: T[], size = 250) {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

function normalizeComparable(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizeLooseComparable(value: string) {
  return normalizeComparable(value).replace(/([aeiou])\1+/g, "$1");
}

const GEOGRAPHY_ALIASES: Record<string, string[]> = {
  karnataka: [
    "bengaluru",
    "bangalore",
    "mysore",
    "mysuru",
    "tiptur",
    "tumkur",
    "tumakuru",
    "chamarajanagar",
    "chikmagalur",
    "chikkamagaluru",
    "ramanagara",
    "raichur",
    "hassan",
    "kolar",
    "uttara kannada",
    "karwar"
  ],
  "madhya pradesh": [
    "indore",
    "dewas",
    "barwani",
    "bhopal",
    "ujjain",
    "jabalpur",
    "gwalior"
  ],
  odisha: [
    "odisha",
    "orissa",
    "kalahandi",
    "bhubaneswar"
  ],
  maharashtra: [
    "mumbai",
    "pune",
    "kolhapur",
    "nashik",
    "solapur",
    "jalgaon"
  ],
  telangana: [
    "hyderabad",
    "ranga reddy",
    "mahabubnagar",
    "nalgonda"
  ]
};

function expandProbeVariants(probe: string | undefined) {
  if (!probe) {
    return [];
  }

  const normalized = normalizeComparable(probe);
  const variants = new Set([normalized]);

  if (["hindi", "hin", "हिंदी", "हिन्दी"].includes(normalized)) {
    variants.add("hindi");
    variants.add("hin");
  }

  if (["english", "eng", "अंग्रेजी"].includes(normalized)) {
    variants.add("english");
    variants.add("eng");
  }

  if (["odia", "oriya", "odiya", "od"].includes(normalized)) {
    variants.add("odia");
    variants.add("oriya");
    variants.add("od");
  }

  return [...variants];
}

function matchesArray(rows: string[] | null | undefined, probe: string | undefined) {
  if (!probe) {
    return true;
  }
  const variants = expandProbeVariants(probe);
  const geographyAliases = variants.flatMap((variant) => GEOGRAPHY_ALIASES[variant] || []);
  return (rows || []).some((value) => {
    const normalizedValue = normalizeComparable(value);
    return (
      variants.some((variant) => normalizedValue.includes(variant) || variant.includes(normalizedValue)) ||
      geographyAliases.some((alias) => normalizedValue.includes(alias))
    );
  });
}

function getTopLevelGeographies(row: any) {
  const values = [
    ...(Array.isArray(row?.geographies) ? row.geographies : []),
    typeof row?.geographies_raw === "string" ? row.geographies_raw : null
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/[;|\n]+/))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(values)];
}

function geographyComponents(entry: string) {
  const whole = normalizeComparable(entry);
  const parts = entry
    .split(",")
    .map((part) => normalizeComparable(part))
    .filter(Boolean);

  return [...new Set([whole, ...parts])];
}

function matchesGeography(row: any, probe: string | undefined) {
  if (!probe) {
    return true;
  }

  const variants = expandProbeVariants(probe);
  const geographyAliases = variants.flatMap((variant) => GEOGRAPHY_ALIASES[variant] || []);
  const entries = getTopLevelGeographies(row);
  const hasNationwideIndia = entries.some((entry) => normalizeComparable(entry) === "india");

  if (hasNationwideIndia) {
    return true;
  }

  return entries.some((entry) => {
    const components = geographyComponents(entry);
    return (
      variants.some((variant) => components.some((component) => component.includes(variant) || variant.includes(component))) ||
      geographyAliases.some((alias) => components.some((component) => component.includes(alias)))
    );
  });
}

function matchesScalar(value: string | null | undefined, probe: string | undefined) {
  if (!probe) {
    return true;
  }
  return (value || "").toLowerCase().includes(probe.toLowerCase());
}

function matchesProvider(row: any, probe: string | undefined) {
  if (!probe) {
    return true;
  }

  const normalizedProbe = normalizeComparable(probe);
  const providerNames = [
    row.solution?.trader?.organisation_name,
    row.solution?.trader?.trader_name
  ]
    .filter(Boolean)
    .map((value: string) => normalizeComparable(value));

  return providerNames.some((name) => name.includes(normalizedProbe) || normalizedProbe.includes(name));
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

async function getCachedSearchData() {
  const now = Date.now();
  if (searchDataCache && searchDataCache.expiresAt > now) {
    return searchDataCache;
  }

  const supabase = createServerSupabaseClient();

  const offeringColumns = `
      offering_id,
      trader_id,
      offering_name,
      offering_category,
      offering_group,
      offering_type,
      domain_6m,
      primary_valuechain,
      primary_application,
      applications,
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
    `;

  const offeringPages: SearchOfferingRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("offerings")
      .select(offeringColumns)
      .eq("publish_status", "Published")
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    offeringPages.push(...(data || []));
    if (!data || data.length < pageSize) {
      break;
    }
  }

  const { data: traders, error: tradersError } = await supabase
    .from("traders")
    .select("trader_id, organisation_name, trader_name")
    .limit(1000);

  if (tradersError) {
    throw tradersError;
  }

  searchDataCache = {
    expiresAt: now + SEARCH_DATA_CACHE_TTL_MS,
    offerings: offeringPages,
    traders: (traders || []) as TraderLookupRow[]
  };

  return searchDataCache;
}

function inferSolutionProvider(query: string | undefined, options: string[] = []) {
  return inferOptionFromQuery(query, options);
}

function inferOptionFromQuery(query: string | undefined, options: string[] = []) {
  if (!query) {
    return undefined;
  }

  const normalizedQuery = normalizeComparable(query);
  const looseQuery = normalizeLooseComparable(query);

  const matches = options
    .map((option) => {
      const normalizedOption = normalizeComparable(option);
      const looseOption = normalizeLooseComparable(option);
      if (!normalizedOption) {
        return null;
      }

      if (
        normalizedQuery.includes(normalizedOption) ||
        normalizedOption.includes(normalizedQuery) ||
        looseQuery.includes(looseOption) ||
        looseOption.includes(looseQuery)
      ) {
        return { option, score: normalizedOption.length + 20 };
      }

      const optionTokens = normalizedOption.split(/\s+/).filter(Boolean);
      const matchingTokens = optionTokens.filter((token) => normalizedQuery.includes(token)).length;
      if (matchingTokens >= Math.max(1, Math.ceil(optionTokens.length * 0.75))) {
        return { option, score: matchingTokens * 4 };
      }

      const looseOptionTokens = looseOption.split(/\s+/).filter(Boolean);
      const looseMatchingTokens = looseOptionTokens.filter((token) => looseQuery.includes(token) || token.includes(looseQuery)).length;
      if (looseMatchingTokens >= 1) {
        return { option, score: looseMatchingTokens * 5 };
      }

      return null;
    })
    .filter(Boolean)
    .sort((left: any, right: any) => right.score - left.score);

  return matches[0]?.option;
}

function queryCoveredByOption(query: string | undefined, option: string | undefined) {
  if (!query || !option) {
    return false;
  }

  const normalizedQuery = normalizeComparable(query);
  const normalizedOption = normalizeComparable(option);
  const looseQuery = normalizeLooseComparable(query);
  const looseOption = normalizeLooseComparable(option);

  return (
    normalizedQuery === normalizedOption ||
    normalizedOption.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedOption) ||
    looseQuery === looseOption ||
    looseOption.includes(looseQuery) ||
    looseQuery.includes(looseOption)
  );
}

function resolvePrimaryKeywordFilter(query: string | undefined, options: CachedFilterOptions) {
  const provider = inferSolutionProvider(query, options.solutionProviders);
  if (queryCoveredByOption(query, provider)) {
    return { field: "solutionProvider" as const, value: provider };
  }

  const category = inferOptionFromQuery(query, options.categories);
  if (queryCoveredByOption(query, category)) {
    return { field: "category" as const, value: category };
  }

  const domain6m = inferOptionFromQuery(query, options.domains6m);
  if (queryCoveredByOption(query, domain6m)) {
    return { field: "domain6m" as const, value: domain6m };
  }

  const offeringType = inferOptionFromQuery(query, options.offeringTypes);
  if (queryCoveredByOption(query, offeringType)) {
    return { field: "offeringType" as const, value: offeringType };
  }

  const valueChain = inferOptionFromQuery(query, options.valueChains);
  if (queryCoveredByOption(query, valueChain)) {
    return { field: "valueChain" as const, value: valueChain };
  }

  const application = inferOptionFromQuery(query, options.applications);
  if (queryCoveredByOption(query, application)) {
    return { field: "application" as const, value: application };
  }

  const tag = inferOptionFromQuery(query, options.tags);
  if (queryCoveredByOption(query, tag)) {
    return { field: "tag" as const, value: tag };
  }

  const language = inferOptionFromQuery(query, options.languages);
  if (queryCoveredByOption(query, language)) {
    return { field: "language" as const, value: language };
  }

  const geography = inferOptionFromQuery(query, options.geographies);
  if (queryCoveredByOption(query, geography)) {
    return { field: "geography" as const, value: geography };
  }

  return null;
}

function hasExplicitNonKeywordFilters(filters: SearchFilters) {
  return Boolean(
    filters.solutionProvider ||
      filters.category ||
      filters.domain6m ||
      filters.offeringType ||
      filters.valueChain ||
      filters.application ||
      filters.tag ||
      filters.language ||
      filters.geography
  );
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

  const baseTokens = query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !stopWords.has(token));

  const expandedTokens = new Set(baseTokens);

  if (expandedTokens.has("bakri") || expandedTokens.has("bakra") || expandedTokens.has("goat")) {
    expandedTokens.add("goat");
    expandedTokens.add("bakri");
  }

  if (expandedTokens.has("palan") || expandedTokens.has("rearing")) {
    expandedTokens.add("farming");
    expandedTokens.add("rearing");
  }

  if (expandedTokens.has("jankari") || expandedTokens.has("sikhaye") || expandedTokens.has("training")) {
    expandedTokens.add("training");
    expandedTokens.add("knowledge");
    expandedTokens.add("guide");
  }

  if (expandedTokens.has("hindi") || expandedTokens.has("hin")) {
    expandedTokens.add("hindi");
    expandedTokens.add("hin");
  }

  return [...expandedTokens];
}

function expandTokenVariants(token: string) {
  const normalized = normalizeComparable(token);
  if (!normalized) {
    return [];
  }

  const variants = new Set([normalized]);

  if (normalized.endsWith("ies") && normalized.length > 3) {
    variants.add(`${normalized.slice(0, -3)}y`);
  }

  if (normalized.endsWith("es") && normalized.length > 4) {
    variants.add(normalized.slice(0, -2));
  }

  if (normalized.endsWith("s") && normalized.length > 3) {
    variants.add(normalized.slice(0, -1));
  } else {
    variants.add(`${normalized}s`);
    variants.add(`${normalized}es`);
    if (normalized.endsWith("y") && normalized.length > 2) {
      variants.add(`${normalized.slice(0, -1)}ies`);
    }
  }

  return [...variants];
}

function matchesTokenVariant(haystack: string, token: string) {
  const variants = expandTokenVariants(token);
  return variants.some((variant) => haystack.includes(variant));
}

function simplifyQueryText(query: string | undefined, filters: SearchFilters) {
  if (!query) {
    return "";
  }

  let simplified = query;

  if (filters.offeringType && /training/i.test(filters.offeringType)) {
    simplified = simplified.replace(/\btraining\b/gi, " ");
  }

  if (filters.domain6m) {
    if (/machine/i.test(filters.domain6m)) {
      simplified = simplified.replace(/\b(machine|machinery|equipment)\b/gi, " ");
    } else if (/method/i.test(filters.domain6m)) {
      simplified = simplified.replace(/\b(method|methods|process|processes|practice|practices)\b/gi, " ");
    } else if (/manpower/i.test(filters.domain6m)) {
      simplified = simplified.replace(/\b(manpower|skill|skills)\b/gi, " ");
    } else if (/material/i.test(filters.domain6m)) {
      simplified = simplified.replace(/\b(material|materials|input|inputs|raw material|raw materials)\b/gi, " ");
    } else if (/market/i.test(filters.domain6m)) {
      simplified = simplified.replace(/\b(market|markets|marketing|buyer|buyers)\b/gi, " ");
    } else if (/money/i.test(filters.domain6m)) {
      simplified = simplified.replace(/\b(money|finance|financial|loan|loans|credit)\b/gi, " ");
    }
  }

  return simplified.replace(/\s+/g, " ").trim();
}

export function inferSearchFilters<T extends SearchFilters>(filters: T, query: string | undefined) {
  if (!query) {
    return { ...filters };
  }

  const normalized = query.toLowerCase();
  const inferred: Partial<SearchFilters> = {};

  if (!filters.language) {
    if (
      normalized.includes("hindi") ||
      normalized.includes("हिंदी") ||
      normalized.includes("हिन्दी")
    ) {
      inferred.language = "Hindi";
    } else if (normalized.includes("odia") || normalized.includes("oriya") || normalized.includes("ओड़िया")) {
      inferred.language = "Odia";
    } else if (normalized.includes("english") || normalized.includes("अंग्रेजी")) {
      inferred.language = "English";
    }
  }

  if (!filters.geography) {
    if (normalized.includes("madhya pradesh") || /\bmp\b/.test(normalized)) {
      inferred.geography = "Madhya Pradesh";
    } else if (normalized.includes("uttar pradesh") || /\bup\b/.test(normalized)) {
      inferred.geography = "Uttar Pradesh";
    } else if (normalized.includes("jharkhand")) {
      inferred.geography = "Jharkhand";
    } else if (normalized.includes("bihar")) {
      inferred.geography = "Bihar";
    } else if (normalized.includes("odisha") || normalized.includes("orissa")) {
      inferred.geography = "Odisha";
    } else if (normalized.includes("rajasthan")) {
      inferred.geography = "Rajasthan";
    } else if (normalized.includes("karnataka")) {
      inferred.geography = "Karnataka";
    } else if (normalized.includes("chhattisgarh")) {
      inferred.geography = "Chhattisgarh";
    }
  }

  if (!filters.application || !filters.valueChain) {
    if (
      normalized.includes("bakri") ||
      normalized.includes("bakra") ||
      normalized.includes("goat")
    ) {
      if (!filters.application) {
        inferred.application = "Goat";
      }
      if (!filters.valueChain) {
        inferred.valueChain = "Livestock";
      }
    }

    if (/\bbiscuits?\b/i.test(normalized)) {
      if (!filters.application) {
        inferred.application = "Biscuits";
      }
      if (!filters.valueChain) {
        inferred.valueChain = "Bakery";
      }
    }
  }

  if (!filters.offeringType) {
    if (/\btraining\b/i.test(normalized)) {
      inferred.offeringType = "Training";
    }
  }

  if (!filters.domain6m) {
    if (/\b(machine|machinery|equipment)\b/i.test(normalized)) {
      inferred.domain6m = "Machine";
    } else if (/\b(method|methods|process|processes|practice|practices)\b/i.test(normalized)) {
      inferred.domain6m = "Method";
    } else if (/\b(manpower|skill|skills)\b/i.test(normalized)) {
      inferred.domain6m = "Manpower";
    } else if (/\b(material|materials|input|inputs|raw material|raw materials)\b/i.test(normalized)) {
      inferred.domain6m = "Material";
    } else if (/\b(market|markets|marketing|buyer|buyers)\b/i.test(normalized)) {
      inferred.domain6m = "Market";
    } else if (/\b(money|finance|financial|loan|loans|credit)\b/i.test(normalized)) {
      inferred.domain6m = "Money";
    }
  }

  if (!filters.solutionProvider) {
    const provider = inferSolutionProvider(query, []);
    if (provider) {
      inferred.solutionProvider = provider;
    }
  }

  return {
    ...filters,
    ...inferred
  };
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

function buildKeywordHaystack(row: any) {
  return [
    row.offering_name,
    row.offering_category,
    row.offering_group,
    row.offering_type,
    row.domain_6m,
    row.primary_valuechain,
    row.primary_application,
    ...(row.tags || []),
    ...(row.languages || []),
    ...(row.geographies || []),
    row.solution?.solution_name,
    row.solution?.trader?.organisation_name,
    row.solution?.trader?.trader_name
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();
}

function strictKeywordMatch(row: any, query: string | undefined) {
  if (!query) {
    return true;
  }

  const haystack = buildKeywordHaystack(row);
  const normalizedQuery = query.toLowerCase().trim();
  if (normalizedQuery && haystack.includes(normalizedQuery)) {
    return true;
  }

  const tokens = tokenizeQuery(query).filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }

  return tokens.every((token) => matchesTokenVariant(haystack, token));
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
    if (matchesTokenVariant(haystack, token)) {
      score += 2;
    }
  }

  if (row.offering_name && normalizedQuery && row.offering_name.toLowerCase().includes(normalizedQuery)) {
    score += 10;
  }

  if (row.primary_valuechain && tokens.some((token) => matchesTokenVariant(row.primary_valuechain.toLowerCase(), token))) {
    score += 4;
  }

  if (row.primary_application && tokens.some((token) => matchesTokenVariant(row.primary_application.toLowerCase(), token))) {
    score += 8;
  }

  if ((row.tags || []).some((tag: string) => tokens.some((token) => matchesTokenVariant(String(tag).toLowerCase(), token)))) {
    score += 8;
  }

  if ((row.applications || []).some((application: string) => tokens.some((token) => matchesTokenVariant(String(application).toLowerCase(), token)))) {
    score += 6;
  }

  return score;
}

function providerScore(row: any, probe: string | undefined) {
  if (!probe) {
    return 0;
  }

  const normalizedProbe = normalizeComparable(probe);
  const providerNames = [
    row.solution?.trader?.organisation_name,
    row.solution?.trader?.trader_name
  ]
    .filter(Boolean)
    .map((value: string) => normalizeComparable(value));

  if (providerNames.some((name) => name === normalizedProbe)) {
    return 40;
  }

  if (providerNames.some((name) => name.includes(normalizedProbe) || normalizedProbe.includes(name))) {
    return 24;
  }

  return 0;
}

async function getProviderIdsByName(providerName: string | undefined, traders?: TraderLookupRow[]) {
  if (!providerName) {
    return [];
  }

  const normalizedProbe = normalizeComparable(providerName);
  return (traders || [])
    .filter((row: any) => {
      const names = [row.organisation_name, row.trader_name]
        .filter(Boolean)
        .map((value: string) => normalizeComparable(value));
      return names.some((name) => name.includes(normalizedProbe) || normalizedProbe.includes(name));
    })
    .map((row: any) => row.trader_id)
    .filter(Boolean);
}

export async function applyImportBundle(bundle: ImportBundle, fileNames: { solutionFileName: string; traderFileName: string }) {
  const supabase = createServerSupabaseClient();
  filterOptionsCache = null;
  searchDataCache = null;

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

    filterOptionsCache = null;
    searchDataCache = null;

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
  const results = await runSearchInternal(filters);
  if (results.length > 0) {
    return results;
  }

  if (filters.q && !hasExplicitNonKeywordFilters(filters)) {
    return runSearchInternal({
      ...filters,
      strictKeyword: false,
      disableKeywordPromotion: true,
      solutionProvider: undefined,
      category: undefined,
      domain6m: undefined,
      offeringType: undefined,
      valueChain: undefined,
      application: undefined,
      tag: undefined,
      language: undefined,
      geography: undefined
    });
  }

  return results;
}

async function runSearchInternal(filters: SearchFilters) {
  const { offerings, traders } = await getCachedSearchData();
  const limit = Math.min(filters.limit || 100, 500);
  const filterOptions = await getFilterOptions();
  const primaryKeywordFilter = filters.disableKeywordPromotion
    ? null
    : resolvePrimaryKeywordFilter(filters.q, filterOptions);
  const baseInferredFilters = filters.disableKeywordPromotion
    ? { ...filters }
    : inferSearchFilters(filters, filters.q);
  const inferredFilters = {
    ...baseInferredFilters,
    solutionProvider:
      filters.solutionProvider ||
      (primaryKeywordFilter?.field === "solutionProvider" ? primaryKeywordFilter.value : undefined) ||
      baseInferredFilters.solutionProvider ||
      (filters.disableKeywordPromotion ? undefined : inferSolutionProvider(filters.q, filterOptions.solutionProviders)),
    category:
      filters.category ||
      (primaryKeywordFilter?.field === "category" ? primaryKeywordFilter.value : undefined) ||
      baseInferredFilters.category,
    domain6m:
      filters.domain6m ||
      (primaryKeywordFilter?.field === "domain6m" ? primaryKeywordFilter.value : undefined) ||
      baseInferredFilters.domain6m,
    offeringType:
      filters.offeringType ||
      (primaryKeywordFilter?.field === "offeringType" ? primaryKeywordFilter.value : undefined) ||
      baseInferredFilters.offeringType,
    valueChain:
      filters.valueChain ||
      (primaryKeywordFilter?.field === "valueChain" ? primaryKeywordFilter.value : undefined) ||
      baseInferredFilters.valueChain,
    application:
      filters.application ||
      (primaryKeywordFilter?.field === "application" ? primaryKeywordFilter.value : undefined) ||
      baseInferredFilters.application,
    tag:
      filters.tag ||
      baseInferredFilters.tag ||
      undefined,
    language:
      filters.language ||
      (primaryKeywordFilter?.field === "language" ? primaryKeywordFilter.value : undefined) ||
      baseInferredFilters.language,
    geography:
      filters.geography ||
      (primaryKeywordFilter?.field === "geography" ? primaryKeywordFilter.value : undefined) ||
      baseInferredFilters.geography
  };
  const structuredMatchFromKeyword = !filters.disableKeywordPromotion && [
    inferredFilters.solutionProvider,
    inferredFilters.category,
    inferredFilters.domain6m,
    inferredFilters.offeringType,
    inferredFilters.valueChain,
    inferredFilters.application,
    inferredFilters.tag,
    inferredFilters.language,
    inferredFilters.geography
  ].some((value) => queryCoveredByOption(filters.q, value));
  const simplifiedQuery = structuredMatchFromKeyword ? "" : simplifyQueryText(inferredFilters.q, inferredFilters);
  const q = (simplifiedQuery || (structuredMatchFromKeyword ? "" : inferredFilters.q) || "").trim();
  const providerIds = await getProviderIdsByName(inferredFilters.solutionProvider, traders);

  const structuredFilterCount = [
    inferredFilters.solutionProvider,
    inferredFilters.category,
    inferredFilters.domain6m,
    inferredFilters.offeringType,
    inferredFilters.valueChain,
    inferredFilters.application,
    inferredFilters.language,
    inferredFilters.geography
  ].filter(Boolean).length;

  const baseRows = offerings
    .filter((row: any) => {
      return (
        (!inferredFilters.category || row.offering_group === inferredFilters.category) &&
        (!inferredFilters.domain6m || row.domain_6m === inferredFilters.domain6m) &&
        (!inferredFilters.offeringType || String(row.offering_type || "").toLowerCase().includes(String(inferredFilters.offeringType || "").toLowerCase())) &&
        (providerIds.length === 0 || providerIds.includes(row.trader_id))
      );
    });

  const scored = baseRows
    .filter((row: any) => {
      return (
        (!filters.strictKeyword || strictKeywordMatch(row, q)) &&
        matchesProvider(row, inferredFilters.solutionProvider) &&
        matchesArray(row.tags, inferredFilters.tag) &&
        matchesArray(row.languages, inferredFilters.language) &&
        matchesGeography(row, inferredFilters.geography) &&
        matchesScalar(row.primary_valuechain, inferredFilters.valueChain) &&
        matchesScalar(row.primary_application, inferredFilters.application)
      );
    })
    .map((row: any) => ({
      row,
      score: scoreRow(row, q) + providerScore(row, inferredFilters.solutionProvider)
    }));

  const positiveScoreRows = scored.filter(({ score }) => !q || score > 0);
  if (filters.strictKeyword && q && positiveScoreRows.length === 0) {
    return [];
  }
  const scoredForRanking = positiveScoreRows;

  const ranked = scoredForRanking
    .sort((left, right) => right.score - left.score || String(left.row.offering_name || "").localeCompare(String(right.row.offering_name || "")));

  const topScore = ranked[0]?.score || 0;
  const relevanceFloor = q && topScore > 0
    ? Math.max(4, Math.ceil(topScore * 0.55), topScore - 4)
    : 0;

  const filtered = ranked
    .filter(({ score }) => inferredFilters.solutionProvider || !q || structuredFilterCount > 0 || score >= relevanceFloor)
    .slice(0, limit)
    .map(({ row }) => row);

  return filtered;
}

export async function getFilterOptions() {
  const now = Date.now();
  if (filterOptionsCache && filterOptionsCache.expiresAt > now) {
    return filterOptionsCache.value;
  }

  const { offerings: rows, traders } = await getCachedSearchData();

  const value = {
    solutionProviders: uniqueSorted(
      (traders || [])
        .map((row: any) => row.organisation_name || row.trader_name)
        .filter(Boolean)
    ),
    categories: uniqueSorted(rows.map((row: any) => row.offering_group).filter(Boolean)),
    domains6m: uniqueSorted(rows.map((row: any) => row.domain_6m).filter(Boolean)),
    offeringTypes: uniqueSorted(rows.map((row: any) => row.offering_type).filter(Boolean)),
    valueChains: uniqueSorted(rows.map((row: any) => row.primary_valuechain).filter(Boolean)),
    applications: uniqueSorted(rows.map((row: any) => row.primary_application).filter(Boolean)),
    tags: uniqueSorted(rows.flatMap((row: any) => row.tags || [])),
    languages: uniqueSorted(rows.flatMap((row: any) => row.languages || [])),
    geographies: uniqueSorted(rows.flatMap((row: any) => row.geographies || []))
  };

  filterOptionsCache = {
    expiresAt: now + FILTER_CACHE_TTL_MS,
    value
  };

  return value;
}

export async function getOfferingDetail(offeringId: string) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
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
      valuechains,
      applications,
      tags,
      languages,
      geographies,
      geographies_raw,
      about_offering_text,
      audience,
      trainer_name,
      trainer_email,
      trainer_phone,
      trainer_details_text,
      duration,
      prerequisites,
      service_cost,
      support_post_service,
      support_post_service_cost,
      delivery_mode,
      certification_offered,
      cost_remarks,
      location_availability,
      service_brochure_url,
      grade_capacity,
      product_cost,
      lead_time,
      support_details,
      product_brochure_url,
      knowledge_content_url,
      contact_details,
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
          mobile,
          poc_name,
          description,
          short_description,
          tagline,
          association_status
        )
      )
    `
    )
    .eq("offering_id", offeringId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}
