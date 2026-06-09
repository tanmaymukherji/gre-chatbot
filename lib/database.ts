import { createServerSupabaseClient } from "@/lib/supabase";
import type { SearchFilters } from "@/lib/types";
import type { GreSurfaceSlug } from "@/lib/surface";

const FILTER_CACHE_TTL_MS = 60 * 1000;
const SEARCH_DATA_CACHE_TTL_MS = 30 * 1000;

type CachedFilterOptions = {
  solutionProviders: string[];
  categories: string[];
  domains6m: string[];
  offeringTypes: string[];
  offeringTypesByDomain: Record<string, string[]>;
  valueChains: string[];
  applications: string[];
  tags: string[];
  languages: string[];
  geographies: string[];
  providerEmailTemplate?: string;
};

type DirectorySummaryStats = {
  offeringCount: number;
  providerCount: number;
  sourceCount: number;
};

const CANONICAL_SUPERGRE_DOMAINS = ["Manpower", "Method", "Machine", "Material", "Market", "Money"];
const CANONICAL_SUPERGRE_OFFERING_TYPES = [
  "Blogs",
  "Community Support",
  "Consulting",
  "Financial Support",
  "Innovation",
  "Institutional Support",
  "Machinery",
  "Market Reports",
  "Market Support",
  "Practice",
  "Raw Material",
  "SOP Manuals",
  "Technology Transfer",
  "Training"
];

type SearchOfferingRow = any;
type TraderLookupRow = {
  trader_id: string;
  organisation_name: string | null;
  trader_name: string | null;
};

let filterOptionsCache: Partial<Record<GreSurfaceSlug, {
  expiresAt: number;
  value: CachedFilterOptions;
}>> = {};
let directorySummaryCache: Partial<Record<GreSurfaceSlug, {
  expiresAt: number;
  value: DirectorySummaryStats;
}>> = {};
let searchDataCache:
  | {
      expiresAt: number;
      offerings: SearchOfferingRow[];
      traders: TraderLookupRow[];
    }
  | null = null;
let selcoSearchCache:
  | {
      expiresAt: number;
      rows: any[];
    }
  | null = null;
let innovationGuildSearchCache:
  | {
      expiresAt: number;
      rows: any[];
    }
  | null = null;
let gianSearchCache:
  | {
      expiresAt: number;
      rows: any[];
    }
  | null = null;
let gridSearchCache:
  | {
      expiresAt: number;
      rows: any[];
    }
  | null = null;
let betterIndiaSearchCache:
  | {
      expiresAt: number;
      rows: any[];
    }
  | null = null;
let livelihoodSearchCache:
  | {
      expiresAt: number;
      rows: any[];
    }
  | null = null;

export function invalidateSearchCaches() {
  filterOptionsCache = {};
  directorySummaryCache = {};
  searchDataCache = null;
  selcoSearchCache = null;
  innovationGuildSearchCache = null;
  gianSearchCache = null;
  gridSearchCache = null;
  betterIndiaSearchCache = null;
  livelihoodSearchCache = null;
}



import {
  extractFlatGeographyEntries,
  extractGeographyGroups,
  geographyGroupComponents,
  isStandaloneIndiaGroup,
} from "@/lib/geography-hierarchy";

function normalizeComparable(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizeLooseComparable(value: string) {
  return normalizeComparable(value).replace(/([aeiou])\1+/g, "$1");
}

function canonicalizeLanguageLabel(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = normalizeComparable(text);
  if (["eng", "english"].includes(normalized)) return "ENGLISH";
  if (["hin", "hindi"].includes(normalized)) return "HINDI";
  if (["odia", "oriya", "odiya", "od"].includes(normalized)) return "ODIA";
  return text.toUpperCase();
}

function canonicalizeLanguageArray(values: unknown) {
  const rows = Array.isArray(values) ? values : typeof values === "string" ? values.split(/[;,|]/) : [];
  return [...new Set(rows.map((item) => canonicalizeLanguageLabel(String(item || ""))).filter(Boolean))];
}

function parseContactDetails(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return { text: "", name: "", email: "", phone: "" };
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  const lines = text.split(/\r?\n|[,;|]/).map((item) => String(item || "").trim()).filter(Boolean);
  const firstLine = lines[0] || "";
  const looksLikeName = firstLine && !/@/.test(firstLine) && !/\d{5,}/.test(firstLine);
  return {
    text,
    name: looksLikeName ? firstLine : "",
    email: emailMatch ? emailMatch[0] : "",
    phone: phoneMatch ? phoneMatch[0].trim() : "",
  };
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
  return extractFlatGeographyEntries(row);
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
  const groups = extractGeographyGroups(row);
  const hasNationwideIndia = groups.some((group) => isStandaloneIndiaGroup(group));

  const directMatch = groups.some((group) => {
    const components = geographyGroupComponents(group);
    return (
      variants.some((variant) => components.some((component) => component.includes(variant) || variant.includes(component))) ||
      geographyAliases.some((alias) => components.some((component) => component.includes(alias)))
    );
  });

  if (directMatch) {
    return true;
  }

  if (hasNationwideIndia) {
    return true;
  }

  return false;
}

function matchesScalar(value: string | null | undefined, probe: string | undefined) {
  if (!probe) {
    return true;
  }
  return (value || "").toLowerCase().includes(probe.toLowerCase());
}

function canonicalizeOfferingType(value: string | null | undefined) {
  const text = normalizeComparable(String(value || ""));
  if (!text) return "";
  if (/(^| )training( |$)/.test(text)) return "training";
  if (/(consult|consulting|mentoring)/.test(text)) return "consulting";
  if (/(tech transfer|technology transfer)/.test(text)) return "technology transfer";
  if (/(video|videos)/.test(text)) return "videos";
  if (/(sop|manual|manuals)/.test(text)) return "sop manuals";
  if (/(blog|blogs)/.test(text)) return "blogs";
  if (/(machinery|machine)/.test(text)) return "machinery";
  if (/(raw material)/.test(text)) return "raw material";
  if (/(market support)/.test(text)) return "market support";
  if (/(market report|market reports)/.test(text)) return "market reports";
  if (/(financial support|finance|financial)/.test(text)) return "financial support";
  return text;
}

function matchesOfferingType(value: string | null | undefined, probe: string | undefined) {
  if (!probe) {
    return true;
  }

  const normalizedValue = normalizeComparable(String(value || ""));
  const normalizedProbe = normalizeComparable(String(probe || ""));
  if (normalizedValue.includes(normalizedProbe) || normalizedProbe.includes(normalizedValue)) {
    return true;
  }

  const canonicalValue = canonicalizeOfferingType(value);
  const canonicalProbe = canonicalizeOfferingType(probe);
  return (
    canonicalValue === canonicalProbe ||
    canonicalValue.includes(canonicalProbe) ||
    canonicalProbe.includes(canonicalValue)
  );
}

function canonicalize6MValue(value: string | null | undefined) {
  const text = normalizeComparable(String(value || ""));
  if (!text) return "";
  if (/(^| )manpower( |$)|training|capacity building|skills?/.test(text)) return "Manpower";
  if (/(^| )method( |$)|consult|mentoring|technology transfer|manual|video|sop|blog|advisory/.test(text)) return "Method";
  if (/(^| )machine( |$)|machinery|equipment|plant setup|street light/.test(text)) return "Machine";
  if (/(^| )material( |$)|raw material|input|supply/.test(text)) return "Material";
  if (/(^| )market( |$)|branding|packaging|marketplace|buyer|marketing/.test(text)) return "Market";
  if (/(^| )money( |$)|financial|finance|funding|credit|loan/.test(text)) return "Money";
  return "";
}

function matchesDomain6M(value: string | null | undefined, probe: string | undefined) {
  if (!probe) {
    return true;
  }
  const normalizedProbe = canonicalize6MValue(probe) || normalizeComparable(probe);
  const parts = String(value || "")
    .split(/[;,|]/)
    .map((item) => canonicalize6MValue(item) || normalizeComparable(item))
    .filter(Boolean);

  return parts.some((part) =>
    part === normalizedProbe ||
    part.includes(normalizedProbe) ||
    normalizedProbe.includes(part),
  );
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

function matchingEntityNames(row: any) {
  return [
    row?.offering_name,
    row?.solution?.solution_name,
    row?.solution?.trader?.organisation_name,
    row?.solution?.trader?.trader_name,
    row?.preferred_contact_name,
    row?.raw_payload?.entity?.entity_name,
    row?.raw_payload?.entity?.contact_name
  ]
    .filter(Boolean)
    .map((value: string) => normalizeComparable(value))
    .filter(Boolean);
}

function matchesDirectEntityName(row: any, query: string | undefined) {
  const normalizedQuery = normalizeComparable(query || "");
  if (!normalizedQuery) {
    return false;
  }

  return matchingEntityNames(row).some((name) =>
    name === normalizedQuery ||
    name.includes(normalizedQuery) ||
    normalizedQuery.includes(name)
  );
}

function directEntityNameBoost(row: any, query: string | undefined) {
  const normalizedQuery = normalizeComparable(query || "");
  if (!normalizedQuery) {
    return 0;
  }

  let best = 0;
  for (const name of matchingEntityNames(row)) {
    if (name === normalizedQuery) {
      best = Math.max(best, 220);
      continue;
    }
    if (name.includes(normalizedQuery) || normalizedQuery.includes(name)) {
      best = Math.max(best, 140);
      continue;
    }

    const tokens = tokenizeQuery(query).filter(Boolean);
    if (tokens.length > 1 && tokens.every((token) => matchesTokenVariant(name, token))) {
      best = Math.max(best, 90);
    }
  }

  return best;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function inferDomain6M(row: any) {
  const existing = String(row?.domain_6m || "").trim();
  if (existing) {
    const canonicalParts = existing
      .split(/[;,|]/)
      .map((item) => canonicalize6MValue(item))
      .filter(Boolean);
    if (canonicalParts.length) {
      return [...new Set(canonicalParts)].join(", ");
    }
  }

  const text = [
    row?.offering_name,
    row?.offering_category,
    row?.offering_group,
    row?.offering_type,
    row?.primary_valuechain,
    row?.primary_application,
    ...(Array.isArray(row?.applications) ? row.applications : []),
    ...(Array.isArray(row?.valuechains) ? row.valuechains : []),
    ...(Array.isArray(row?.tags) ? row.tags : []),
    row?.about_offering_text,
    row?.solution?.solution_name,
    row?.solution?.about_solution_text
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  const sixM = [
    ["training", "capacity building"].some((pattern) => text.includes(pattern)) ? "Manpower" : "",
    ["consulting", "consultancy", "mentoring", "technology transfer", "manual", "video", "sop", "blog", "advisory"].some((pattern) => text.includes(pattern)) ? "Method" : "",
    ["machine", "machinery", "equipment", "plant setup", "street light"].some((pattern) => text.includes(pattern)) ? "Machine" : "",
    ["raw material", "raw materials", "material supply", "supply"].some((pattern) => text.includes(pattern)) ? "Material" : "",
    ["market", "branding", "packaging", "marketplace", "market report", "market reports"].some((pattern) => text.includes(pattern)) ? "Market" : "",
    ["financial", "finance", "funding", "credit", "loan"].some((pattern) => text.includes(pattern)) ? "Money" : ""
  ].filter(Boolean);

  return [...new Set(sixM)].join(", ");
}

function getDataUrlFromAttachment(value: any) {
  if (value && typeof value === "object" && typeof value.dataUrl === "string") {
    return value.dataUrl;
  }
  return "";
}

function fallbackAttachmentUrl(row: any, keys: string[]) {
  const payload = row?.raw_payload?.payload;
  if (!payload || typeof payload !== "object") return "";
  for (const key of keys) {
    const url = getDataUrlFromAttachment(payload[key]);
    if (url) return url;
  }
  return "";
}

function normalizeOfferingRow(row: any) {
  const normalizedServiceBrochure =
    row?.service_brochure_url ||
    fallbackAttachmentUrl(row, ["service_brochure_attachment", "product_brochure_attachment"]);
  const normalizedProductBrochure =
    row?.product_brochure_url ||
    fallbackAttachmentUrl(row, ["product_brochure_attachment", "service_brochure_attachment"]);
  const normalizedKnowledgeContent =
    row?.knowledge_content_url ||
    fallbackAttachmentUrl(row, ["knowledge_content_attachment"]);
  const normalizedSolutionImage =
    row?.solution?.solution_image_url ||
    fallbackAttachmentUrl(row, ["offering_image_attachment"]);
  const normalizedLanguages = canonicalizeLanguageArray(row?.languages);
  const parsedContact = parseContactDetails(row?.contact_details);
  const preferredContactName = parsedContact.name || row?.trainer_name || row?.solution?.trader?.poc_name || "";
  const preferredContactEmail = parsedContact.email || row?.trainer_email || row?.solution?.trader?.email || "";
  const preferredContactPhone = parsedContact.phone || row?.trainer_phone || row?.solution?.trader?.mobile || "";
  return {
    ...row,
    domain_6m: inferDomain6M(row),
    languages: normalizedLanguages,
    service_brochure_url: normalizedServiceBrochure || null,
    product_brochure_url: normalizedProductBrochure || null,
    knowledge_content_url: normalizedKnowledgeContent || null,
    preferred_contact_details: parsedContact.text || row?.trainer_details_text || "",
    preferred_contact_name: preferredContactName || null,
    preferred_contact_email: preferredContactEmail || null,
    preferred_contact_phone: preferredContactPhone || null,
    solution: row?.solution
      ? {
          ...row.solution,
          solution_image_url: normalizedSolutionImage || row.solution.solution_image_url || null,
        }
      : row?.solution,
  };
}

function asArrayOfStrings(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[;,|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeSelcoGeographies(vendor: any) {
  return uniqueSorted([
    vendor.location_text,
    vendor.city,
    vendor.state,
    vendor.country,
    vendor.final_contact_address,
    ...(Array.isArray(vendor.service_locations) ? vendor.service_locations : [])
  ].flatMap((value) => asArrayOfStrings(value)));
}

function normalizeSelcoTags(vendor: any, product: any) {
  const specifications = Array.isArray(product?.product_specifications) ? product.product_specifications : [];
  return uniqueSorted([
    ...(vendor?.tags || []),
    ...(product?.tags || []),
    ...specifications.flatMap((item: any) => [item?.key, item?.value])
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function buildSelcoSearchDocument(vendor: any, product: any, geographies: string[], tags: string[]) {
  const specifications = Array.isArray(product?.product_specifications) ? product.product_specifications : [];
  return [
    product?.product_name,
    product?.product_description,
    vendor?.vendor_name,
    vendor?.about_vendor,
    vendor?.location_text,
    vendor?.city,
    vendor?.state,
    vendor?.country,
    vendor?.final_contact_address,
    vendor?.portal_contact_name,
    vendor?.portal_email,
    vendor?.portal_phone,
    vendor?.final_contact_email,
    vendor?.final_contact_phone,
    vendor?.website_details,
    vendor?.contact_notes,
    vendor?.search_text,
    product?.search_text,
    ...geographies,
    ...tags,
    ...specifications.flatMap((item: any) => [item?.key, item?.value])
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function normalizeInnovationGuildGeographies(vendor: any, product: any) {
  return uniqueSorted([
    product?.product_location_text,
    vendor.location_text,
    vendor.city,
    vendor.state,
    vendor.country,
    vendor.final_contact_address,
    ...(Array.isArray(vendor.service_locations) ? vendor.service_locations : [])
  ].flatMap((value) => asArrayOfStrings(value)));
}

function normalizeInnovationGuildTags(vendor: any, product: any) {
  const specifications = Array.isArray(product?.product_specifications) ? product.product_specifications : [];
  return uniqueSorted([
    ...(vendor?.tags || []),
    ...(product?.tags || []),
    ...(product?.product_categories || []),
    ...(product?.product_subcategories || []),
    ...specifications.flatMap((item: any) => [item?.key, item?.value])
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function buildInnovationGuildSearchDocument(vendor: any, product: any, geographies: string[], tags: string[]) {
  const specifications = Array.isArray(product?.product_specifications) ? product.product_specifications : [];
  return [
    product?.product_name,
    product?.product_description,
    vendor?.vendor_name,
    vendor?.about_vendor,
    vendor?.location_text,
    product?.product_location_text,
    vendor?.city,
    vendor?.state,
    vendor?.country,
    vendor?.final_contact_address,
    vendor?.portal_contact_name,
    vendor?.portal_email,
    vendor?.portal_phone,
    vendor?.final_contact_email,
    vendor?.final_contact_phone,
    vendor?.website_details,
    vendor?.contact_notes,
    vendor?.search_text,
    product?.search_text,
    ...(product?.product_categories || []),
    ...(product?.product_subcategories || []),
    ...geographies,
    ...tags,
    ...specifications.flatMap((item: any) => [item?.key, item?.value])
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function normalizeGianGeographies(vendor: any, product: any) {
  return uniqueSorted([
    product?.product_location_text,
    vendor.location_text,
    vendor.city,
    vendor.state,
    vendor.country,
    vendor.final_contact_address,
    ...(Array.isArray(vendor.service_locations) ? vendor.service_locations : [])
  ].flatMap((value) => asArrayOfStrings(value)));
}

function normalizeGianTags(vendor: any, product: any) {
  const specifications = Array.isArray(product?.product_specifications) ? product.product_specifications : [];
  const rawProduct = product?.raw_product && typeof product.raw_product === "object" ? product.raw_product : {};
  return uniqueSorted([
    ...(vendor?.tags || []),
    ...(product?.tags || []),
    ...(product?.product_categories || []),
    ...(product?.product_subcategories || []),
    ...(Array.isArray(rawProduct?.tags) ? rawProduct.tags : []),
    ...specifications.flatMap((item: any) => [item?.key, item?.value])
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function buildGianSearchDocument(vendor: any, product: any, geographies: string[], tags: string[]) {
  const specifications = Array.isArray(product?.product_specifications) ? product.product_specifications : [];
  const rawProduct = product?.raw_product && typeof product.raw_product === "object" ? product.raw_product : {};
  return [
    product?.product_name,
    product?.product_description,
    vendor?.vendor_name,
    vendor?.about_vendor,
    vendor?.location_text,
    product?.product_location_text,
    vendor?.city,
    vendor?.state,
    vendor?.country,
    vendor?.final_contact_address,
    vendor?.portal_contact_name,
    vendor?.portal_email,
    vendor?.portal_phone,
    vendor?.final_contact_email,
    vendor?.final_contact_phone,
    vendor?.website_details,
    vendor?.contact_notes,
    vendor?.search_text,
    product?.search_text,
    rawProduct?.innovation_title,
    rawProduct?.innovation_details,
    rawProduct?.innovator_bio,
    ...(product?.product_categories || []),
    ...(product?.product_subcategories || []),
    ...geographies,
    ...tags,
    ...specifications.flatMap((item: any) => [item?.key, item?.value])
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function normalizeGridGeographies(vendor: any, practice: any) {
  return uniqueSorted([
    practice?.product_location_text,
    vendor.location_text,
    vendor.city,
    vendor.district,
    vendor.state,
    vendor.country,
    vendor.final_contact_address,
    vendor.agro_ecological_zone,
    ...(Array.isArray(vendor.service_locations) ? vendor.service_locations : [])
  ].flatMap((value) => asArrayOfStrings(value)));
}

function normalizeGridTags(vendor: any, practice: any) {
  const specifications = Array.isArray(practice?.product_specifications) ? practice.product_specifications : [];
  const aiSummary = practice?.ai_summary && typeof practice.ai_summary === "object" ? practice.ai_summary : {};
  return uniqueSorted([
    ...(vendor?.tags || []),
    ...(practice?.tags || []),
    ...(practice?.reviewed_tags || []),
    ...(practice?.product_categories || []),
    ...(practice?.product_subcategories || []),
    ...(practice?.six_m_categories || []),
    ...(Array.isArray(aiSummary?.keywords) ? aiSummary.keywords : []),
    ...specifications.flatMap((item: any) => [item?.key, item?.value])
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function buildGridSearchDocument(vendor: any, practice: any, geographies: string[], tags: string[]) {
  const specifications = Array.isArray(practice?.product_specifications) ? practice.product_specifications : [];
  const rawProduct = practice?.raw_product && typeof practice.raw_product === "object" ? practice.raw_product : {};
  const aiSummary = practice?.ai_summary && typeof practice.ai_summary === "object" ? practice.ai_summary : {};
  return [
    practice?.product_name,
    practice?.product_description,
    practice?.practice_summary,
    practice?.innovator_details,
    practice?.practice_details,
    practice?.source_reference,
    vendor?.vendor_name,
    vendor?.about_vendor,
    vendor?.location_text,
    practice?.product_location_text,
    vendor?.city,
    vendor?.district,
    vendor?.state,
    vendor?.country,
    vendor?.agro_ecological_zone,
    vendor?.final_contact_address,
    vendor?.portal_contact_name,
    vendor?.portal_email,
    vendor?.portal_phone,
    vendor?.final_contact_email,
    vendor?.final_contact_phone,
    vendor?.website_details,
    vendor?.contact_notes,
    vendor?.search_text,
    practice?.search_text,
    rawProduct?.practice_details,
    rawProduct?.reference_text,
    aiSummary?.summary,
    aiSummary?.problem,
    aiSummary?.solution,
    ...(practice?.product_categories || []),
    ...(practice?.product_subcategories || []),
    ...geographies,
    ...tags,
    ...specifications.flatMap((item: any) => [item?.key, item?.value])
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function normalizeBetterIndiaGeographies(story: any) {
  return uniqueSorted([
    story?.place_label,
    story?.location_text,
    story?.state,
    story?.country,
    story?.contact_address
  ].flatMap((value) => asArrayOfStrings(value)));
}

function normalizeBetterIndiaTags(story: any) {
  const aiSummary = story?.ai_summary && typeof story.ai_summary === "object" ? story.ai_summary : {};
  return uniqueSorted([
    ...(story?.tags || []),
    ...(story?.six_m_categories || []),
    ...(Array.isArray(aiSummary?.tags) ? aiSummary.tags : []),
    ...(Array.isArray(aiSummary?.six_m_categories) ? aiSummary.six_m_categories : []),
    ...(Array.isArray(aiSummary?.contributors) ? aiSummary.contributors.flatMap((item: any) => [item?.name, item?.contribution]) : []),
    ...(Array.isArray(aiSummary?.process_steps) ? aiSummary.process_steps : []),
    story?.thematic_area,
    story?.author_name
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function buildBetterIndiaSearchDocument(story: any, geographies: string[], tags: string[]) {
  const aiSummary = story?.ai_summary && typeof story.ai_summary === "object" ? story.ai_summary : {};
  return [
    story?.title,
    story?.person_name,
    story?.author_name,
    story?.thematic_area,
    story?.place_label,
    story?.location_text,
    story?.state,
    story?.country,
    story?.contact_address,
    story?.contact_email,
    story?.contact_phone,
    story?.summary_of_work,
    story?.story_excerpt,
    story?.search_text,
    aiSummary?.summary_of_work,
    aiSummary?.thematic_area,
    aiSummary?.place,
    ...(Array.isArray(aiSummary?.contributors) ? aiSummary.contributors.flatMap((item: any) => [item?.name, item?.contribution]) : []),
    ...(Array.isArray(aiSummary?.process_steps) ? aiSummary.process_steps : []),
    ...geographies,
    ...tags
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
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

function normalizeLivelihoodGeographies(entity: any) {
  return uniqueSorted([
    entity?.location_label,
    entity?.primary_address,
    entity?.district,
    entity?.state,
    entity?.country,
    ...(Array.isArray(entity?.office_locations) ? entity.office_locations.flatMap((item: any) => flattenObjectStrings(item)) : []),
    ...(entity?.type_specific_data?.geography_served ? flattenObjectStrings(entity.type_specific_data.geography_served) : [])
  ].flatMap((value) => asArrayOfStrings(value)));
}

function normalizeLivelihoodTags(entity: any) {
  return uniqueSorted([
    ...(entity?.tags || []),
    ...(entity?.keywords || []),
    entity?.entity_type_label,
    entity?.entity_type_slug,
    ...flattenObjectStrings(entity?.type_specific_data || {})
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function buildLivelihoodSearchDocument(entity: any, geographies: string[], tags: string[]) {
  return [
    entity?.entity_name,
    entity?.summary,
    entity?.description,
    entity?.location_label,
    entity?.primary_address,
    entity?.district,
    entity?.state,
    entity?.country,
    entity?.contact_email,
    entity?.contact_phone,
    entity?.website_url,
    entity?.source_label,
    entity?.source_url,
    entity?.admin_notes,
    entity?.search_text,
    ...geographies,
    ...tags,
    ...flattenObjectStrings(entity?.type_specific_data || {}),
    ...flattenObjectStrings(entity?.social_media || {}),
    ...flattenObjectStrings(entity?.office_locations || {})
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function livelihoodTypeDomains(typeSlug: string) {
  switch (typeSlug) {
    case "mentor":
    case "community_steward":
    case "incubation_centre":
    case "accelerator":
    case "institute":
    case "cso":
      return ["Method"];
    case "volunteer":
    case "intern":
      return ["Manpower"];
    case "trader_association":
      return ["Market"];
    default:
      return ["Method"];
  }
}

function livelihoodSecondaryDomains(typeSlug: string, entity: any) {
  const haystack = normalizeComparable(buildLivelihoodSearchDocument(entity, normalizeLivelihoodGeographies(entity), normalizeLivelihoodTags(entity)));
  const domains: string[] = [];
  const add = (value: string) => {
    if (value && !domains.includes(value)) domains.push(value);
  };

  if (["accelerator", "incubation_centre"].includes(typeSlug) && /(funding|fund|capital|grant|investment|seed)/.test(haystack)) add("Money");
  if (["institute", "cso", "community_steward"].includes(typeSlug) && /(market|buyer|sell|branding|distribution)/.test(haystack)) add("Market");
  if (["institute", "mentor", "cso"].includes(typeSlug) && /(training|skilling|fellowship|internship|volunteer)/.test(haystack)) add("Manpower");
  if (typeSlug === "trader_association" && /(advis|policy|capacity|training)/.test(haystack)) add("Method");
  return domains;
}

function livelihoodOfferingType(typeSlug: string) {
  switch (typeSlug) {
    case "mentor":
    case "community_steward":
    case "cso":
      return "Consulting";
    case "volunteer":
    case "intern":
    case "institute":
      return "Training";
    case "incubation_centre":
      return "Technology Transfer";
    case "accelerator":
      return "Financial Support";
    case "trader_association":
      return "Market Support";
    default:
      return "Consulting";
  }
}

function livelihoodPrimaryApplication(entity: any, tags: string[]) {
  return String(
    entity?.type_specific_data?.thematic_areas?.[0] ||
    entity?.type_specific_data?.support_services?.[0] ||
    entity?.type_specific_data?.domain_expertise?.[0] ||
    tags[0] ||
    ""
  ).trim() || null;
}

function livelihoodPrimaryValueChain(entity: any, tags: string[]) {
  return String(
    entity?.type_specific_data?.geography_served?.[0] ||
    entity?.type_specific_data?.thematic_areas?.[0] ||
    entity?.type_specific_data?.support_services?.[0] ||
    tags[1] ||
    tags[0] ||
    ""
  ).trim() || null;
}

function inferBetterIndiaDomains(story: any) {
  const structured = uniqueSorted(
    asArrayOfStrings(story?.six_m_categories)
      .map((value) => canonicalize6MValue(value) || "")
      .filter(Boolean)
  );
  if (structured.length > 0) {
    return structured;
  }

  const aiSummary = story?.ai_summary && typeof story.ai_summary === "object" ? story.ai_summary : {};
  const aiDomains = uniqueSorted(
    asArrayOfStrings(aiSummary?.six_m_categories)
      .map((value) => canonicalize6MValue(value) || "")
      .filter(Boolean)
  );
  if (aiDomains.length > 0) {
    return aiDomains;
  }

  const haystack = normalizeComparable(buildBetterIndiaSearchDocument(story, normalizeBetterIndiaGeographies(story), normalizeBetterIndiaTags(story)));
  const domains: string[] = [];
  const add = (value: string) => {
    if (value && !domains.includes(value)) domains.push(value);
  };

  if (/(loan|finance|funding|credit|investment|money|income|profit|capital)/.test(haystack)) add("Money");
  if (/(market|buyer|sell|selling|branding|packaging|demand|export|orders|commercial)/.test(haystack)) add("Market");
  if (/(training|mentor|mentoring|guide|process|practice|awareness|campaign|method|workshop|knowledge|story)/.test(haystack)) add("Method");
  if (/(employment|livelihood|women|youth|artisan|community|farmer|worker|people)/.test(haystack)) add("Manpower");
  if (/(seed|raw material|material|leaf|leaves|fiber|soil|compost|bamboo|cow dung|input)/.test(haystack)) add("Material");
  if (/(machine|device|tool|equipment|technology|prototype|system|dryer|cooler|bike|filter)/.test(haystack)) add("Machine");

  if (domains.length === 0) add("Method");
  return domains;
}

function inferBetterIndiaCategory(domains: string[]) {
  if (domains.includes("Machine") || domains.includes("Material")) return "Knowledge";
  if (domains.includes("Market") || domains.includes("Money") || domains.includes("Manpower") || domains.includes("Method")) return "Knowledge";
  return "Knowledge";
}

function inferBetterIndiaOfferingType(domains: string[], story: any) {
  const haystack = normalizeComparable(buildBetterIndiaSearchDocument(story, [], []));
  if (/(video)/.test(haystack)) return "Videos";
  if (/(guide|manual|how to)/.test(haystack)) return "SOP Manuals";
  if (domains.includes("Money")) return "Financial Support";
  if (domains.includes("Market")) return "Market Reports";
  if (domains.includes("Machine")) return "Blogs";
  return "Blogs";
}

function inferBetterIndiaPrimaryApplication(story: any, tags: string[]) {
  return String(story?.thematic_area || tags[0] || "").trim() || null;
}

function inferBetterIndiaPrimaryValueChain(story: any, tags: string[]) {
  return String(tags[1] || tags[0] || story?.thematic_area || "").trim() || null;
}

function inferGridDomains(vendor: any, practice: any) {
  const structured = uniqueSorted(
    asArrayOfStrings(practice?.six_m_categories)
      .map((value) => canonicalize6MValue(value) || "")
      .filter(Boolean)
  );
  if (structured.length > 0) {
    return structured;
  }

  const haystack = normalizeComparable(buildGridSearchDocument(vendor, practice, normalizeGridGeographies(vendor, practice), normalizeGridTags(vendor, practice)));
  const domains: string[] = [];
  const add = (value: string) => {
    if (value && !domains.includes(value)) {
      domains.push(value);
    }
  };

  if (/(loan|finance|financial|funding|credit|insurance|microfinance|investment)/.test(haystack)) add("Money");
  if (/(market|buyer|buyers|branding|packaging|distribution|supply chain|sales|selling|price|enterprise|commercial)/.test(haystack)) add("Market");
  if (/(training|skill|workshop|mentor|mentoring|consult|advis|guide|manual|video|practice|community process|capacity building|knowledge)/.test(haystack)) add("Method");
  if (/(worker|employment|livelihood|artisan|producer group|shg|women|youth|operator|community member)/.test(haystack)) add("Manpower");
  if (/(seed|seeds|raw material|material|input|soil|mulch|fodder|biomass|leaf|leaves|bamboo|fiber|compost|herbal)/.test(haystack)) add("Material");
  if (/(machine|machinery|device|devices|tool|tools|equipment|dryer|processing|filter|irrigation system|sprayer|mechanical|unit)/.test(haystack)) add("Machine");

  if (domains.length === 0) {
    add("Method");
  }
  return domains;
}

function inferGridCategory(domains: string[], vendor: any, practice: any) {
  const haystack = normalizeComparable(buildGridSearchDocument(vendor, practice, [], []));
  if (/(story|case study)/.test(haystack)) return "Knowledge";
  if (domains.includes("Machine") || domains.includes("Material")) return "Product";
  if (domains.includes("Method") || /(practice|training|manual|knowledge|guide|community process)/.test(haystack)) return "Knowledge";
  if (domains.includes("Market") || domains.includes("Money") || domains.includes("Manpower")) return "Service";
  return "Knowledge";
}

function inferGridOfferingType(domains: string[], vendor: any, practice: any) {
  const haystack = normalizeComparable(buildGridSearchDocument(vendor, practice, [], []));
  if (domains.includes("Machine")) return "Machinery";
  if (domains.includes("Material")) return "Raw Material";
  if (domains.includes("Money")) return "Financial Support";
  if (domains.includes("Market")) return "Market Support";
  if (/(video)/.test(haystack)) return "Videos";
  if (/(manual|guide|sop)/.test(haystack)) return "SOP Manuals";
  if (/(training|workshop|capacity building)/.test(haystack)) return "Training";
  if (domains.includes("Method")) return "Technology Transfer";
  if (domains.includes("Manpower")) return "Training";
  return "Practice";
}

function inferGridPrimaryApplication(practice: any, tags: string[]) {
  return String(
    practice?.product_subcategories?.[0] ||
    practice?.product_categories?.[0] ||
    practice?.reviewed_tags?.[0] ||
    tags[0] ||
    ""
  ).trim() || null;
}

function inferGridPrimaryValueChain(practice: any, tags: string[]) {
  return String(
    practice?.product_categories?.[0] ||
    practice?.product_subcategories?.[0] ||
    practice?.reviewed_tags?.[1] ||
    tags[1] ||
    tags[0] ||
    ""
  ).trim() || null;
}

function extractGianStructuredDomains(vendor: any, product: any) {
  const rawProduct = product?.raw_product && typeof product.raw_product === "object" ? product.raw_product : {};
  const candidates = [
    rawProduct?.primary_domain_6m,
    rawProduct?.domain_6m,
    rawProduct?.domain6m,
    ...(Array.isArray(rawProduct?.secondary_domains_6m) ? rawProduct.secondary_domains_6m : []),
    ...(Array.isArray(rawProduct?.domains_6m) ? rawProduct.domains_6m : []),
    ...(Array.isArray(rawProduct?.domains6m) ? rawProduct.domains6m : [])
  ];

  return uniqueSorted(
    candidates
      .flatMap((value) => asArrayOfStrings(value))
      .map((value) => canonicalize6MValue(value) || "")
      .filter(Boolean)
  );
}

function inferGianDomains(vendor: any, product: any) {
  const structuredDomains = extractGianStructuredDomains(vendor, product);
  if (structuredDomains.length > 0) {
    return structuredDomains;
  }

  const haystack = normalizeComparable(buildGianSearchDocument(vendor, product, normalizeGianGeographies(vendor, product), normalizeGianTags(vendor, product)));
  const domains: string[] = [];
  const add = (value: string) => {
    if (value && !domains.includes(value)) {
      domains.push(value);
    }
  };

  if (/(loan|finance|financial|funding|credit|investment|insurance|microfinance)/.test(haystack)) add("Money");
  if (/(market|marketing|buyer|buyers|branding|packaging|distribution|sales|sell|selling|commerciali|enterprise|startup)/.test(haystack)) add("Market");
  if (/(training|skill|capacity building|workshop|mentor|mentoring|consult|advis|guide|process|practice|method|manual|awareness|technology transfer)/.test(haystack)) add("Method");
  if (/(employment|worker|workers|artisan|intern|volunteer|operator|livelihood|human resource|farmer producer)/.test(haystack)) add("Manpower");
  if (/(seed|seeds|variet|fertili|herbal formulation|raw material|material|input|bamboo|biomass|cow dung|leaf|leaves|soil|mulch|fodder)/.test(haystack)) add("Material");
  if (/(machine|machinery|device|devices|tool|tools|equipment|bike|crane|dryer|stove|cart|weeder|sprayer|tractor|filter|processing machine|system|automated|portable)/.test(haystack)) add("Machine");

  if (domains.length === 0) {
    add("Method");
  }

  return domains;
}

function inferGianCategory(domains: string[], vendor: any, product: any) {
  const haystack = normalizeComparable(buildGianSearchDocument(vendor, product, [], []));
  if (domains.includes("Machine") || domains.includes("Material")) {
    return "Product";
  }
  if (/(training|manual|guide|awareness|knowledge|method|practice|how to)/.test(haystack)) {
    return "Knowledge";
  }
  if (domains.includes("Method") || domains.includes("Manpower") || domains.includes("Market") || domains.includes("Money")) {
    return "Service";
  }
  return "Product";
}

function inferGianOfferingType(domains: string[], vendor: any, product: any) {
  const haystack = normalizeComparable(buildGianSearchDocument(vendor, product, [], []));
  if (domains.includes("Machine")) return "Machinery";
  if (domains.includes("Material")) return "Raw Material";
  if (domains.includes("Money")) return "Financial Support";
  if (domains.includes("Market")) return "Market Support";
  if (/(training|workshop|capacity building|skills?)/.test(haystack)) return "Training";
  if (/(manual|guide|sop|video)/.test(haystack)) return "SOP Manuals";
  if (domains.includes("Method")) return "Technology Transfer";
  if (domains.includes("Manpower")) return "Training";
  return "Innovation";
}

function inferGianPrimaryApplication(product: any, tags: string[]) {
  return String(
    product?.product_subcategories?.[0] ||
    product?.product_categories?.[0] ||
    tags[0] ||
    ""
  ).trim() || null;
}

function inferGianPrimaryValueChain(product: any, tags: string[]) {
  return String(
    product?.product_categories?.[0] ||
    product?.product_subcategories?.[0] ||
    tags[1] ||
    tags[0] ||
    ""
  ).trim() || null;
}

function normalizeSelcoRow(vendor: any, product: any) {
  const geographies = normalizeSelcoGeographies(vendor);
  const tags = normalizeSelcoTags(vendor, product);
  const portalUrl = String(product?.product_link || vendor?.portal_vendor_link || "").trim() || null;
  const providerEmail = String(vendor?.final_contact_email || vendor?.portal_email || vendor?.website_email || "").trim() || null;
  const providerPhone = String(vendor?.final_contact_phone || vendor?.portal_phone || vendor?.website_phone || "").trim() || null;
  const providerWebsite = String(vendor?.website_details || "").trim();
  const detailId = String(product?.portal_product_id || "").trim();

  return {
    source_slug: "selco",
    source_label: "SELCO Solution Portal",
    source_record_id: detailId,
    offering_id: `selco:${detailId}`,
    detail_source: "selco",
    detail_id: detailId,
    offering_name: product?.product_name || vendor?.vendor_name || "Untitled SELCO entry",
    offering_category: "Product",
    offering_group: "Product",
    offering_type: "Machinery",
    domain_6m: "Machine",
    primary_valuechain: null,
    primary_application: null,
    valuechains: [],
    applications: [],
    tags,
    languages: [],
    geographies,
    geographies_raw: geographies.join(", "),
    about_offering_text: String(product?.product_description || vendor?.about_vendor || "").trim() || null,
    product_cost: null,
    lead_time: null,
    grade_capacity: null,
    support_details: vendor?.contact_notes || null,
    product_brochure_url: null,
    knowledge_content_url: null,
    service_brochure_url: null,
    gre_link: portalUrl,
    portal_url: portalUrl,
    detail_href: `/detail/selco/${encodeURIComponent(detailId)}`,
    search_document: buildSelcoSearchDocument(vendor, product, geographies, tags),
    preferred_contact_name: String(vendor?.portal_contact_name || vendor?.vendor_name || "").trim() || null,
    preferred_contact_email: providerEmail,
    preferred_contact_phone: providerPhone,
    preferred_contact_details: [providerEmail, providerPhone, vendor?.final_contact_address].filter(Boolean).join(" | ") || null,
    map_lat: Number(vendor?.latitude) || null,
    map_lng: Number(vendor?.longitude) || null,
    solution: {
      solution_id: `selco:${detailId}`,
      solution_name: product?.product_name || vendor?.vendor_name || "SELCO solution",
      about_solution_text: String(vendor?.about_vendor || product?.product_description || "").trim() || null,
      solution_image_url: product?.product_image_url || null,
      trader: {
        trader_id: vendor?.portal_vendor_id || `selco-vendor:${detailId}`,
        trader_name: vendor?.vendor_name || null,
        organisation_name: vendor?.vendor_name || null,
        email: providerEmail,
        website: providerWebsite || portalUrl,
        mobile: providerPhone,
        poc_name: vendor?.portal_contact_name || null,
        description: vendor?.about_vendor || null,
        short_description: vendor?.about_vendor || null,
        tagline: vendor?.website_status || null,
        association_status: "External Source: SELCO"
      }
    },
    raw_payload: {
      vendor,
      product
    }
  };
}

function normalizeInnovationGuildRow(vendor: any, product: any) {
  const geographies = normalizeInnovationGuildGeographies(vendor, product);
  const tags = normalizeInnovationGuildTags(vendor, product);
  const portalUrl = String(product?.product_link || vendor?.contact_source_url || vendor?.portal_vendor_link || "").trim() || null;
  const providerEmail = String(vendor?.final_contact_email || vendor?.portal_email || vendor?.website_email || "").trim() || null;
  const providerPhone = String(vendor?.final_contact_phone || vendor?.portal_phone || vendor?.website_phone || "").trim() || null;
  const providerWebsite = String(vendor?.website_details || "").trim();
  const detailId = String(product?.portal_product_id || "").trim();
  const galleryUrls = Array.isArray(product?.product_gallery_urls) ? product.product_gallery_urls : [];
  const videoUrls = Array.isArray(product?.product_video_urls) ? product.product_video_urls : [];

  return {
    source_slug: "innovation-guild",
    source_label: "Innovation Guild",
    source_record_id: detailId,
    offering_id: `innovation-guild:${detailId}`,
    detail_source: "innovation-guild",
    detail_id: detailId,
    offering_name: product?.product_name || vendor?.vendor_name || "Untitled Innovation Guild entry",
    offering_category: "Product",
    offering_group: "Product",
    offering_type: "Machinery",
    domain_6m: "Machine",
    primary_valuechain: null,
    primary_application: null,
    valuechains: product?.product_subcategories || [],
    applications: product?.product_categories || [],
    tags,
    languages: [],
    geographies,
    geographies_raw: geographies.join(", "),
    about_offering_text: String(product?.product_description || vendor?.about_vendor || "").trim() || null,
    product_cost: null,
    lead_time: null,
    grade_capacity: null,
    support_details: vendor?.contact_notes || null,
    product_brochure_url: null,
    knowledge_content_url: null,
    service_brochure_url: null,
    gre_link: portalUrl,
    portal_url: portalUrl,
    detail_href: `/detail/innovation-guild/${encodeURIComponent(detailId)}`,
    search_document: buildInnovationGuildSearchDocument(vendor, product, geographies, tags),
    preferred_contact_name: String(vendor?.portal_contact_name || vendor?.vendor_name || "").trim() || null,
    preferred_contact_email: providerEmail,
    preferred_contact_phone: providerPhone,
    preferred_contact_details: [providerEmail, providerPhone, vendor?.final_contact_address].filter(Boolean).join(" | ") || null,
    map_lat: Number(vendor?.latitude) || null,
    map_lng: Number(vendor?.longitude) || null,
    solution: {
      solution_id: `innovation-guild:${detailId}`,
      solution_name: product?.product_name || vendor?.vendor_name || "Innovation Guild solution",
      about_solution_text: String(vendor?.about_vendor || product?.product_description || "").trim() || null,
      solution_image_url: product?.product_image_url || galleryUrls[0] || null,
      trader: {
        trader_id: vendor?.portal_vendor_id || `innovation-guild-vendor:${detailId}`,
        trader_name: vendor?.vendor_name || null,
        organisation_name: vendor?.vendor_name || null,
        email: providerEmail,
        website: providerWebsite || portalUrl,
        mobile: providerPhone,
        poc_name: vendor?.portal_contact_name || null,
        description: vendor?.about_vendor || null,
        short_description: vendor?.about_vendor || null,
        tagline: vendor?.website_status || null,
        association_status: "External Source: Innovation Guild"
      }
    },
    raw_payload: {
      vendor,
      product,
      galleryUrls,
      videoUrls
    }
  };
}

function normalizeGianRow(vendor: any, product: any) {
  const geographies = normalizeGianGeographies(vendor, product);
  const tags = normalizeGianTags(vendor, product);
  const domains = inferGianDomains(vendor, product);
  const category = inferGianCategory(domains, vendor, product);
  const offeringType = inferGianOfferingType(domains, vendor, product);
  const portalUrl = String(product?.product_link || vendor?.contact_source_url || vendor?.portal_vendor_link || "").trim() || null;
  const providerEmail = String(vendor?.final_contact_email || vendor?.portal_email || vendor?.website_email || "").trim() || null;
  const providerPhone = String(vendor?.final_contact_phone || vendor?.portal_phone || vendor?.website_phone || "").trim() || null;
  const providerWebsite = String(vendor?.website_details || "").trim();
  const detailId = String(product?.portal_product_id || "").trim();
  const galleryUrls = Array.isArray(product?.product_gallery_urls) ? product.product_gallery_urls : [];
  const videoUrls = Array.isArray(product?.product_video_urls) ? product.product_video_urls : [];
  const primaryApplication = inferGianPrimaryApplication(product, tags);
  const primaryValueChain = inferGianPrimaryValueChain(product, tags);

  return {
    source_slug: "gian",
    source_label: "GIAN Grassroots Directory",
    source_record_id: detailId,
    offering_id: `gian:${detailId}`,
    detail_source: "gian",
    detail_id: detailId,
    offering_name: product?.product_name || vendor?.vendor_name || "Untitled GIAN entry",
    offering_category: category,
    offering_group: category,
    offering_type: offeringType,
    domain_6m: domains.join("; "),
    primary_valuechain: primaryValueChain,
    primary_application: primaryApplication,
    valuechains: uniqueSorted([...(product?.product_categories || []), ...(product?.product_subcategories || [])]),
    applications: uniqueSorted([...(product?.product_subcategories || []), ...tags.slice(0, 5)]),
    tags,
    languages: [],
    geographies,
    geographies_raw: geographies.join(", "),
    about_offering_text: String(product?.product_description || vendor?.about_vendor || "").trim() || null,
    product_cost: null,
    lead_time: null,
    grade_capacity: null,
    support_details: vendor?.contact_notes || null,
    product_brochure_url: null,
    knowledge_content_url: null,
    service_brochure_url: null,
    gre_link: portalUrl,
    portal_url: portalUrl,
    detail_href: `/detail/gian/${encodeURIComponent(detailId)}`,
    search_document: buildGianSearchDocument(vendor, product, geographies, tags),
    preferred_contact_name: String(vendor?.portal_contact_name || vendor?.vendor_name || "").trim() || null,
    preferred_contact_email: providerEmail,
    preferred_contact_phone: providerPhone,
    preferred_contact_details: [providerEmail, providerPhone, vendor?.final_contact_address].filter(Boolean).join(" | ") || null,
    map_lat: Number(vendor?.latitude) || null,
    map_lng: Number(vendor?.longitude) || null,
    solution: {
      solution_id: `gian:${detailId}`,
      solution_name: product?.product_name || vendor?.vendor_name || "GIAN innovation",
      about_solution_text: String(vendor?.about_vendor || product?.product_description || "").trim() || null,
      solution_image_url: product?.product_image_url || galleryUrls[0] || null,
      trader: {
        trader_id: vendor?.portal_vendor_id || `gian-vendor:${detailId}`,
        trader_name: vendor?.vendor_name || null,
        organisation_name: vendor?.vendor_name || null,
        email: providerEmail,
        website: providerWebsite || portalUrl,
        mobile: providerPhone,
        poc_name: vendor?.portal_contact_name || null,
        description: vendor?.about_vendor || null,
        short_description: vendor?.about_vendor || null,
        tagline: vendor?.website_status || null,
        association_status: "External Source: GIAN"
      }
    },
    raw_payload: {
      vendor,
      product,
      galleryUrls,
      videoUrls,
      inferredDomains: domains
    }
  };
}

function normalizeGridRow(vendor: any, practice: any) {
  const geographies = normalizeGridGeographies(vendor, practice);
  const tags = normalizeGridTags(vendor, practice);
  const domains = inferGridDomains(vendor, practice);
  const category = inferGridCategory(domains, vendor, practice);
  const offeringType = inferGridOfferingType(domains, vendor, practice);
  const portalUrl = String(practice?.product_link || vendor?.contact_source_url || vendor?.portal_vendor_link || "").trim() || null;
  const providerEmail = String(vendor?.final_contact_email || vendor?.portal_email || vendor?.website_email || "").trim() || null;
  const providerPhone = String(vendor?.final_contact_phone || vendor?.portal_phone || vendor?.website_phone || "").trim() || null;
  const providerWebsite = String(vendor?.website_details || "").trim();
  const detailId = String(practice?.portal_product_id || "").trim();
  const galleryUrls = Array.isArray(practice?.product_gallery_urls) ? practice.product_gallery_urls : [];
  const videoUrls = Array.isArray(practice?.product_video_urls) ? practice.product_video_urls : [];
  const attachmentUrls = Array.isArray(practice?.product_attachment_urls) ? practice.product_attachment_urls : [];
  const primaryApplication = inferGridPrimaryApplication(practice, tags);
  const primaryValueChain = inferGridPrimaryValueChain(practice, tags);

  return {
    source_slug: "grid",
    source_label: "GRID Innovation Directory",
    source_record_id: detailId,
    offering_id: `grid:${detailId}`,
    detail_source: "grid",
    detail_id: detailId,
    offering_name: practice?.product_name || vendor?.vendor_name || "Untitled GRID practice",
    offering_category: category,
    offering_group: category,
    offering_type: offeringType,
    domain_6m: domains.join("; "),
    primary_valuechain: primaryValueChain,
    primary_application: primaryApplication,
    valuechains: uniqueSorted([...(practice?.product_categories || []), ...(practice?.product_subcategories || []), ...(practice?.reviewed_tags || [])]),
    applications: uniqueSorted([...(practice?.product_subcategories || []), ...(practice?.reviewed_tags || []), ...tags.slice(0, 5)]),
    tags,
    languages: [],
    geographies,
    geographies_raw: geographies.join(", "),
    about_offering_text: String(practice?.practice_summary || practice?.product_description || vendor?.about_vendor || "").trim() || null,
    product_cost: null,
    lead_time: null,
    grade_capacity: null,
    support_details: vendor?.contact_notes || practice?.source_reference || null,
    product_brochure_url: attachmentUrls[0] || null,
    knowledge_content_url: null,
    service_brochure_url: null,
    gre_link: portalUrl,
    portal_url: portalUrl,
    detail_href: `/detail/grid/${encodeURIComponent(detailId)}`,
    search_document: buildGridSearchDocument(vendor, practice, geographies, tags),
    preferred_contact_name: String(vendor?.portal_contact_name || vendor?.vendor_name || "").trim() || null,
    preferred_contact_email: providerEmail,
    preferred_contact_phone: providerPhone,
    preferred_contact_details: [providerEmail, providerPhone, vendor?.final_contact_address].filter(Boolean).join(" | ") || null,
    map_lat: Number(vendor?.latitude) || null,
    map_lng: Number(vendor?.longitude) || null,
    solution: {
      solution_id: `grid:${detailId}`,
      solution_name: practice?.product_name || vendor?.vendor_name || "GRID practice",
      about_solution_text: String(practice?.practice_details || practice?.innovator_details || practice?.product_description || vendor?.about_vendor || "").trim() || null,
      solution_image_url: practice?.product_image_url || galleryUrls[0] || null,
      trader: {
        trader_id: vendor?.portal_vendor_id || `grid-vendor:${detailId}`,
        trader_name: vendor?.vendor_name || null,
        organisation_name: vendor?.vendor_name || null,
        email: providerEmail,
        website: providerWebsite || portalUrl,
        mobile: providerPhone,
        poc_name: vendor?.portal_contact_name || null,
        description: vendor?.about_vendor || null,
        short_description: vendor?.about_vendor || null,
        tagline: vendor?.website_status || null,
        association_status: "External Source: GRID"
      }
    },
    raw_payload: {
      vendor,
      practice,
      galleryUrls,
      videoUrls,
      attachmentUrls,
      inferredDomains: domains
    }
  };
}

function normalizeBetterIndiaRow(story: any) {
  const geographies = normalizeBetterIndiaGeographies(story);
  const tags = normalizeBetterIndiaTags(story);
  const domains = inferBetterIndiaDomains(story);
  const category = inferBetterIndiaCategory(domains);
  const offeringType = inferBetterIndiaOfferingType(domains, story);
  const detailId = String(story?.story_uid || "").trim();
  const galleryUrls = Array.isArray(story?.story_image_urls) ? story.story_image_urls : [];
  const aiSummary = story?.ai_summary && typeof story.ai_summary === "object" ? story.ai_summary : {};

  return {
    source_slug: "better-india",
    source_label: "The Better India",
    source_record_id: detailId,
    offering_id: `better-india:${detailId}`,
    detail_source: "better-india",
    detail_id: detailId,
    offering_name: story?.title || story?.person_name || "Untitled Better India story",
    offering_category: category,
    offering_group: category,
    offering_type: offeringType,
    domain_6m: domains.join("; "),
    primary_valuechain: inferBetterIndiaPrimaryValueChain(story, tags),
    primary_application: inferBetterIndiaPrimaryApplication(story, tags),
    valuechains: uniqueSorted([story?.thematic_area, ...tags.slice(0, 6)].filter(Boolean) as string[]),
    applications: uniqueSorted([story?.thematic_area, ...tags.slice(0, 6)].filter(Boolean) as string[]),
    tags,
    languages: [],
    geographies,
    geographies_raw: geographies.join(", "),
    about_offering_text: String(story?.summary_of_work || story?.story_excerpt || "").trim() || null,
    product_cost: null,
    lead_time: null,
    grade_capacity: null,
    support_details: story?.admin_notes || null,
    product_brochure_url: null,
    knowledge_content_url: story?.story_url || null,
    service_brochure_url: null,
    gre_link: story?.story_url || null,
    portal_url: story?.story_url || null,
    detail_href: `/detail/better-india/${encodeURIComponent(detailId)}`,
    search_document: buildBetterIndiaSearchDocument(story, geographies, tags),
    preferred_contact_name: String(story?.person_name || story?.author_name || "").trim() || null,
    preferred_contact_email: String(story?.contact_email || "").trim() || null,
    preferred_contact_phone: String(story?.contact_phone || "").trim() || null,
    preferred_contact_details: [story?.contact_email, story?.contact_phone, story?.contact_address].filter(Boolean).join(" | ") || null,
    map_lat: Number(story?.latitude) || null,
    map_lng: Number(story?.longitude) || null,
    solution: {
      solution_id: `better-india:${detailId}`,
      solution_name: story?.title || story?.person_name || "Better India story",
      about_solution_text: String(story?.story_excerpt || story?.summary_of_work || "").trim() || null,
      solution_image_url: story?.cover_image_url || galleryUrls[0] || null,
      trader: {
        trader_id: detailId,
        trader_name: story?.person_name || null,
        organisation_name: story?.person_name || story?.author_name || null,
        email: String(story?.contact_email || "").trim() || null,
        website: story?.story_url || null,
        mobile: String(story?.contact_phone || "").trim() || null,
        poc_name: story?.person_name || null,
        description: story?.summary_of_work || story?.story_excerpt || null,
        short_description: story?.story_excerpt || null,
        tagline: story?.thematic_area || null,
        association_status: "External Source: Better India"
      }
    },
    raw_payload: {
      story,
      galleryUrls,
      aiSummary,
      inferredDomains: domains
    }
  };
}

function normalizeLivelihoodRow(entity: any) {
  const geographies = normalizeLivelihoodGeographies(entity);
  const tags = normalizeLivelihoodTags(entity);
  const primaryDomains = livelihoodTypeDomains(String(entity?.entity_type_slug || "").trim());
  const secondaryDomains = livelihoodSecondaryDomains(String(entity?.entity_type_slug || "").trim(), entity);
  const domains = uniqueSorted([...primaryDomains, ...secondaryDomains]);
  const offeringType = livelihoodOfferingType(String(entity?.entity_type_slug || "").trim());
  const detailId = String(entity?.entity_uid || "").trim();
  const website = String(entity?.website_url || entity?.source_url || "").trim() || null;

  return {
    source_slug: "livelihood",
    source_label: "Livelihood Directory",
    source_record_id: detailId,
    offering_id: `livelihood:${detailId}`,
    detail_source: "livelihood",
    detail_id: detailId,
    offering_name: entity?.entity_name || "Untitled Livelihood entity",
    offering_category: "Service",
    offering_group: "Service",
    offering_type: offeringType,
    domain_6m: domains.join("; "),
    primary_valuechain: livelihoodPrimaryValueChain(entity, tags),
    primary_application: livelihoodPrimaryApplication(entity, tags),
    valuechains: uniqueSorted([...(entity?.tags || []), ...(entity?.keywords || []), ...(entity?.type_specific_data?.thematic_areas || [])].filter(Boolean)),
    applications: uniqueSorted([...(entity?.type_specific_data?.support_services || []), ...(entity?.type_specific_data?.domain_expertise || []), ...tags.slice(0, 5)].filter(Boolean)),
    tags,
    languages: [],
    geographies,
    geographies_raw: geographies.join(", "),
    about_offering_text: String(entity?.summary || entity?.description || "").trim() || null,
    product_cost: null,
    lead_time: null,
    grade_capacity: null,
    support_details: entity?.admin_notes || null,
    product_brochure_url: null,
    knowledge_content_url: website,
    service_brochure_url: null,
    gre_link: website,
    portal_url: website,
    detail_href: `/detail/livelihood/${encodeURIComponent(detailId)}`,
    search_document: buildLivelihoodSearchDocument(entity, geographies, tags),
    preferred_contact_name: String(entity?.entity_name || "").trim() || null,
    preferred_contact_email: String(entity?.contact_email || "").trim() || null,
    preferred_contact_phone: String(entity?.contact_phone || "").trim() || null,
    preferred_contact_details: [entity?.contact_email, entity?.contact_phone, entity?.primary_address].filter(Boolean).join(" | ") || null,
    map_lat: Number(entity?.latitude) || null,
    map_lng: Number(entity?.longitude) || null,
    solution: {
      solution_id: `livelihood:${detailId}`,
      solution_name: entity?.entity_name || "Livelihood entity",
      about_solution_text: String(entity?.description || entity?.summary || "").trim() || null,
      solution_image_url: null,
      trader: {
        trader_id: detailId,
        trader_name: entity?.entity_name || null,
        organisation_name: entity?.entity_name || null,
        email: String(entity?.contact_email || "").trim() || null,
        website,
        mobile: String(entity?.contact_phone || "").trim() || null,
        poc_name: entity?.entity_name || null,
        description: entity?.description || entity?.summary || null,
        short_description: entity?.summary || null,
        tagline: entity?.entity_type_label || null,
        association_status: "External Source: Livelihood Directory"
      }
    },
    raw_payload: {
      entity,
      inferredDomains: domains
    }
  };
}

async function getCachedSelcoRows() {
  const now = Date.now();
  if (selcoSearchCache && selcoSearchCache.expiresAt > now) {
    return selcoSearchCache.rows;
  }

  const supabase = createServerSupabaseClient();
  const [vendorsResult, productsResult] = await Promise.all([
    supabase
      .from("selco_vendors")
      .select("portal_vendor_id,vendor_name,about_vendor,website_details,location_text,city,state,country,service_locations,tags,portal_vendor_link,portal_contact_name,portal_email,portal_phone,website_email,website_phone,final_contact_email,final_contact_phone,final_contact_address,website_status,contact_notes,search_text,latitude,longitude")
      .order("vendor_name", { ascending: true }),
    supabase
      .from("selco_products")
      .select("portal_product_id,portal_vendor_id,vendor_name,product_name,product_description,product_link,tags,search_text,product_image_url,product_specifications")
      .order("product_name", { ascending: true })
  ]);

  if (vendorsResult.error) {
    throw vendorsResult.error;
  }
  if (productsResult.error) {
    throw productsResult.error;
  }

  const vendorsById = new Map((vendorsResult.data || []).map((vendor: any) => [vendor.portal_vendor_id, vendor]));
  const rows = (productsResult.data || [])
    .map((product: any) => {
      const vendor = vendorsById.get(product.portal_vendor_id);
      if (!vendor) {
        return null;
      }
      return normalizeSelcoRow(vendor, product);
    })
    .filter(Boolean);

  selcoSearchCache = {
    expiresAt: now + SEARCH_DATA_CACHE_TTL_MS,
    rows
  };

  return rows;
}

async function getCachedInnovationGuildRows() {
  const now = Date.now();
  if (innovationGuildSearchCache && innovationGuildSearchCache.expiresAt > now) {
    return innovationGuildSearchCache.rows;
  }

  const supabase = createServerSupabaseClient();
  const [vendorsResult, productsResult] = await Promise.all([
    supabase
      .from("innovation_guild_vendors")
      .select("portal_vendor_id,vendor_name,about_vendor,website_details,location_text,city,state,country,service_locations,tags,portal_vendor_link,portal_contact_name,portal_email,portal_phone,website_email,website_phone,final_contact_email,final_contact_phone,final_contact_address,contact_source_url,website_status,contact_notes,search_text,latitude,longitude")
      .order("vendor_name", { ascending: true }),
    supabase
      .from("innovation_guild_products")
      .select("portal_product_id,portal_vendor_id,vendor_name,product_name,product_description,product_link,product_image_url,product_gallery_urls,product_video_urls,product_location_text,product_categories,product_subcategories,product_specifications,tags,search_text")
      .order("product_name", { ascending: true })
  ]);

  if (vendorsResult.error) {
    throw vendorsResult.error;
  }
  if (productsResult.error) {
    throw productsResult.error;
  }

  const vendorsById = new Map((vendorsResult.data || []).map((vendor: any) => [vendor.portal_vendor_id, vendor]));
  const rows = (productsResult.data || [])
    .map((product: any) => {
      const vendor = vendorsById.get(product.portal_vendor_id);
      if (!vendor) {
        return null;
      }
      return normalizeInnovationGuildRow(vendor, product);
    })
    .filter(Boolean);

  innovationGuildSearchCache = {
    expiresAt: now + SEARCH_DATA_CACHE_TTL_MS,
    rows
  };

  return rows;
}

async function getCachedGianRows() {
  const now = Date.now();
  if (gianSearchCache && gianSearchCache.expiresAt > now) {
    return gianSearchCache.rows;
  }

  const supabase = createServerSupabaseClient();
  const [vendorsResult, productsResult] = await Promise.all([
    supabase
      .from("gian_innovators")
      .select("portal_vendor_id,vendor_name,about_vendor,website_details,location_text,city,state,country,service_locations,tags,portal_vendor_link,portal_contact_name,portal_email,portal_phone,website_email,website_phone,website_address,final_contact_email,final_contact_phone,final_contact_address,contact_source_url,website_status,contact_notes,innovator_image_urls,innovator_media_urls,search_text,raw_vendor,latitude,longitude")
      .order("vendor_name", { ascending: true }),
    supabase
      .from("gian_innovations")
      .select("portal_product_id,portal_vendor_id,vendor_name,product_name,product_description,product_link,product_image_url,product_gallery_urls,product_video_urls,product_location_text,product_categories,product_subcategories,product_specifications,tags,search_text,raw_product")
      .order("product_name", { ascending: true })
  ]);

  if (vendorsResult.error) {
    throw vendorsResult.error;
  }
  if (productsResult.error) {
    throw productsResult.error;
  }

  const vendorsById = new Map((vendorsResult.data || []).map((vendor: any) => [vendor.portal_vendor_id, vendor]));
  const rows = (productsResult.data || [])
    .map((product: any) => {
      const vendor = vendorsById.get(product.portal_vendor_id);
      if (!vendor) {
        return null;
      }
      return normalizeGianRow(vendor, product);
    })
    .filter(Boolean);

  gianSearchCache = {
    expiresAt: now + SEARCH_DATA_CACHE_TTL_MS,
    rows
  };

  return rows;
}

async function getCachedGridRows() {
  const now = Date.now();
  if (gridSearchCache && gridSearchCache.expiresAt > now) {
    return gridSearchCache.rows;
  }

  const supabase = createServerSupabaseClient();
  const [vendorsResult, practicesResult] = await Promise.all([
    supabase
      .from("grid_innovators")
      .select("portal_vendor_id,vendor_name,about_vendor,website_details,location_text,city,state,country,district,pin_code,agro_ecological_zone,service_locations,tags,portal_vendor_link,portal_contact_name,portal_email,portal_phone,website_email,website_phone,website_address,final_contact_email,final_contact_phone,final_contact_address,contact_source_url,website_status,contact_notes,innovator_image_urls,innovator_media_urls,search_text,raw_vendor,latitude,longitude")
      .order("vendor_name", { ascending: true }),
    supabase
      .from("grid_practices")
      .select("portal_product_id,portal_vendor_id,vendor_name,product_name,product_description,product_link,product_image_url,product_gallery_urls,product_video_urls,product_attachment_urls,product_location_text,product_categories,product_subcategories,product_specifications,practice_summary,innovator_details,practice_details,source_reference,tags,search_text,raw_product,six_m_categories,reviewed_tags,admin_notes,ai_model,ai_summary,ai_classified_at,ai_source_hash")
      .order("product_name", { ascending: true })
  ]);

  if (vendorsResult.error) {
    throw vendorsResult.error;
  }
  if (practicesResult.error) {
    throw practicesResult.error;
  }

  const vendorsById = new Map((vendorsResult.data || []).map((vendor: any) => [vendor.portal_vendor_id, vendor]));
  const rows = (practicesResult.data || [])
    .map((practice: any) => {
      const vendor = vendorsById.get(practice.portal_vendor_id);
      if (!vendor) {
        return null;
      }
      return normalizeGridRow(vendor, practice);
    })
    .filter(Boolean);

  gridSearchCache = {
    expiresAt: now + SEARCH_DATA_CACHE_TTL_MS,
    rows
  };

  return rows;
}

async function getCachedBetterIndiaRows() {
  const now = Date.now();
  if (betterIndiaSearchCache && betterIndiaSearchCache.expiresAt > now) {
    return betterIndiaSearchCache.rows;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("better_india_stories")
    .select("story_uid,story_url,title,person_name,person_slug,author_name,thematic_area,place_label,location_text,state,country,contact_email,contact_phone,contact_address,summary_of_work,story_excerpt,six_m_categories,tags,cover_image_url,story_image_urls,latitude,longitude,source_published_at,source_listing_page,source_listing_position,source_status,admin_notes,ai_model,ai_summary,raw_story,search_text")
    .order("source_published_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  const rows = (data || []).map((story: any) => normalizeBetterIndiaRow(story)).filter(Boolean);
  betterIndiaSearchCache = {
    expiresAt: now + SEARCH_DATA_CACHE_TTL_MS,
    rows
  };
  return rows;
}

async function getCachedLivelihoodRows() {
  const now = Date.now();
  if (livelihoodSearchCache && livelihoodSearchCache.expiresAt > now) {
    return livelihoodSearchCache.rows;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ecosystem_directory_entities")
    .select("entity_uid,entity_name,entity_type_slug,entity_type_label,entity_kind,color_hex,summary,description,location_label,primary_address,district,state,country,contact_email,contact_phone,website_url,social_media,office_locations,tags,keywords,latitude,longitude,source_label,source_url,admin_notes,search_text,type_specific_data,approval_status,is_deleted")
    .order("entity_name", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data || []).map((entity: any) => normalizeLivelihoodRow(entity)).filter(Boolean);
  livelihoodSearchCache = {
    expiresAt: now + SEARCH_DATA_CACHE_TTL_MS,
    rows
  };
  return rows;
}

async function runLivelihoodDirectEntityLookup(filters: SearchFilters) {
  const query = String(filters.q || "").trim();
  if (!query) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ecosystem_directory_entities")
    .select("entity_uid,entity_name,entity_type_slug,entity_type_label,entity_kind,color_hex,summary,description,location_label,primary_address,district,state,country,contact_email,contact_phone,website_url,social_media,office_locations,tags,keywords,latitude,longitude,source_label,source_url,admin_notes,search_text,type_specific_data,approval_status,is_deleted")
    .ilike("entity_name", `%${query}%`)
    .limit(Math.min(filters.limit || 25, 25));

  if (error) {
    throw error;
  }

  const preserveKeywordForExplicitSearch = hasExplicitNonKeywordFilters(filters);
  const inferredFilters = filters.disableKeywordPromotion || preserveKeywordForExplicitSearch
    ? { ...filters }
    : inferSearchFilters(filters, filters.q);

  return (data || [])
    .map((entity: any) => normalizeLivelihoodRow(entity))
    .filter((row: any) =>
      row &&
      (!inferredFilters.category || row.offering_group === inferredFilters.category) &&
      matchesDomain6M(row.domain_6m, inferredFilters.domain6m) &&
      matchesOfferingType(row.offering_type, inferredFilters.offeringType) &&
      matchesArray(row.tags, inferredFilters.tag) &&
      matchesGeography(row, inferredFilters.geography) &&
      matchesScalar(row.primary_valuechain, inferredFilters.valueChain) &&
      matchesScalar(row.primary_application, inferredFilters.application) &&
      matchesDirectEntityName(row, query)
    )
    .map((row: any) => {
      const nameBoost = directEntityNameBoost(row, query);
      return {
        ...row,
        score: scoreRow(row, query) + providerScore(row, inferredFilters.solutionProvider) + nameBoost,
        matchScore: computeRelevanceScore(row, query, inferredFilters, filters) + nameBoost
      };
    });
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
      .in("publish_status", ["Published", "MIS Published"])
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
    offerings: offeringPages.map(normalizeOfferingRow),
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
  const compact = normalized.replace(/\s+/g, "");
  if (compact && compact !== normalized) {
    variants.add(compact);
  }

  if (!normalized.includes(" ") && /streetlights?/.test(normalized)) {
    variants.add(normalized.replace(/streetlights?/, (match) => (match === "streetlights" ? "street lights" : "street light")));
  }

  if (!normalized.includes(" ") && /lights?/.test(normalized)) {
    variants.add(normalized.replace(/lights?/, (match) => (match === "lights" ? " lights" : " light")).trim());
  }

  if (normalized.includes(" ")) {
    variants.add(normalized.replace(/\s+/g, ""));
  }

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

function getOfferingKind(row: any) {
  const offeringGroup = normalizeComparable(String(row?.offering_group || ""));
  const offeringType = normalizeComparable(String(row?.offering_type || ""));
  const category = normalizeComparable(String(row?.offering_category || ""));
  if (offeringGroup.includes("service")) return "service";
  if (offeringGroup.includes("product")) return "product";
  if (offeringGroup.includes("knowledge")) return "knowledge";
  if (offeringType.includes("manual") || offeringType.includes("video") || offeringType.includes("sop")) return "knowledge";
  if (category.includes("service")) return "service";
  if (category.includes("product")) return "product";
  if (category.includes("knowledge")) return "knowledge";
  return "";
}

function hasExplicitCategoryIntent(filters: SearchFilters) {
  return Boolean(filters.category);
}

function hasExplicitStructuredSearch(filters: SearchFilters) {
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

function countExplicitStructuredSearch(filters: SearchFilters) {
  return [
    filters.solutionProvider,
    filters.category,
    filters.domain6m,
    filters.offeringType,
    filters.valueChain,
    filters.application,
    filters.tag,
    filters.language,
    filters.geography
  ].filter(Boolean).length;
}

function computeRelevanceScore(row: any, query: string | undefined, inferredFilters: SearchFilters, originalFilters: SearchFilters) {
  const haystack = buildHaystack(row);
  const tokens = tokenizeQuery(query);
  const normalizedQuery = normalizeComparable(query || "");
  const looseQuery = normalizeLooseComparable(query || "");
  const offeringName = String(row.offering_name || "").toLowerCase();
  const normalizedOfferingName = normalizeComparable(String(row.offering_name || ""));
  const looseOfferingName = normalizeLooseComparable(String(row.offering_name || ""));
  const application = String(row.primary_application || "").toLowerCase();
  const valueChain = String(row.primary_valuechain || "").toLowerCase();
  const about = String(row.about_offering_text || row.solution?.about_solution_text || "").toLowerCase();
  const tags = (row.tags || []).map((tag: string) => String(tag).toLowerCase());
  const applications = (row.applications || []).map((item: string) => String(item).toLowerCase());
  const valueChains = (row.valuechains || []).map((item: string) => String(item).toLowerCase());
  const geographies = (row.geographies || []).map((item: string) => String(item).toLowerCase());
  const languages = (row.languages || []).map((item: string) => String(item).toLowerCase());
  const offeringKind = getOfferingKind(row);
  const explicitStructuredCount = countExplicitStructuredSearch(originalFilters);

  let score = 0;

  if (looseQuery && looseOfferingName === looseQuery) score += 130;
  else if (looseQuery && looseOfferingName.includes(looseQuery)) score += 105;
  else if (normalizedQuery && normalizedOfferingName === normalizedQuery) score += 120;
  else if (normalizedQuery && normalizedOfferingName.includes(normalizedQuery)) score += 90;

  if (normalizedQuery && offeringName.includes(normalizedQuery)) score += 60;
  else if (normalizedQuery && application.includes(normalizedQuery)) score += 52;
  else if (normalizedQuery && valueChain.includes(normalizedQuery)) score += 44;
  else if (normalizedQuery && haystack.includes(normalizedQuery)) score += 28;

  if (
    tokens.length > 1 &&
    tokens.every((token) => matchesTokenVariant(offeringName, token))
  ) {
    score += 40;
  }

  if (
    tokens.length > 1 &&
    tokens.every((token) => matchesTokenVariant(looseOfferingName, normalizeLooseComparable(token)))
  ) {
    score += 45;
  }

  if (
    tokens.length > 1 &&
    tokens.every((token) => matchesTokenVariant(application, token))
  ) {
    score += 36;
  }

  tokens.forEach((token) => {
    if (tags.some((tag) => matchesTokenVariant(tag, token))) score += 16;
    else if (matchesTokenVariant(application, token) || applications.some((item) => matchesTokenVariant(item, token))) score += 18;
    else if (matchesTokenVariant(valueChain, token) || valueChains.some((item) => matchesTokenVariant(item, token))) score += 16;
    else if (matchesTokenVariant(offeringName, token)) score += 12;
    else if (about.includes(token)) score += 5;
  });

  if (inferredFilters.solutionProvider && matchesProvider(row, inferredFilters.solutionProvider)) score += 55;
  if (inferredFilters.valueChain && matchesScalar(row.primary_valuechain, inferredFilters.valueChain)) score += 24;
  if (inferredFilters.application && matchesScalar(row.primary_application, inferredFilters.application)) score += 28;
  if (inferredFilters.tag && matchesArray(row.tags, inferredFilters.tag)) score += 20;
  if (inferredFilters.language && languages.some((item) => matchesTokenVariant(item, inferredFilters.language!))) score += 10;
  if (inferredFilters.geography && (matchesGeography(row, inferredFilters.geography) || geographies.some((item) => matchesTokenVariant(item, inferredFilters.geography!)))) score += 10;
  if (inferredFilters.domain6m && matchesScalar(row.domain_6m, inferredFilters.domain6m)) score += 16;
  if (inferredFilters.offeringType && matchesScalar(row.offering_type, inferredFilters.offeringType)) score += 18;
  if (inferredFilters.category && matchesScalar(row.offering_group, inferredFilters.category)) score += 18;
  if (inferredFilters.domain6m && inferredFilters.offeringType && matchesScalar(row.domain_6m, inferredFilters.domain6m) && matchesScalar(row.offering_type, inferredFilters.offeringType)) score += 72;
  if (explicitStructuredCount >= 2) score += explicitStructuredCount * 8;

  if (!hasExplicitCategoryIntent(originalFilters) && !inferredFilters.category && explicitStructuredCount === 0) {
    if (offeringKind === "service") score += 14;
    else if (offeringKind === "product") score += 5;
    else if (offeringKind === "knowledge") score -= 8;
  } else if (inferredFilters.category) {
    const preferredKind = normalizeComparable(inferredFilters.category);
    if (offeringKind === preferredKind) score += 12;
  }

  if (hasExplicitStructuredSearch(originalFilters) && !originalFilters.category && explicitStructuredCount <= 1) {
    if (offeringKind === "knowledge" && (inferredFilters.application || inferredFilters.valueChain || inferredFilters.solutionProvider)) {
      score -= 10;
    }
  }

  if (!tokens.length && !hasExplicitStructuredSearch(inferredFilters)) {
    score += 1;
  }

  return Math.round(score);
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

    if (/\bsolar\b/i.test(normalized) && /\b(light|lights|streetlight|streetlights|led)\b/i.test(normalized)) {
      if (!filters.application) {
        inferred.application = "Solar Lights";
      }
      if (!filters.valueChain) {
        inferred.valueChain = "Solar";
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

function strictKeywordMatch(row: any, query: string | undefined, useBroadHaystack = false) {
  if (!query) {
    return true;
  }

  const haystack = useBroadHaystack ? buildHaystack(row) : buildKeywordHaystack(row);
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

  if (
    row.offering_name &&
    tokens.length > 1 &&
    tokens.every((token) => matchesTokenVariant(String(row.offering_name).toLowerCase(), token))
  ) {
    score += 16;
  }

  if (row.primary_valuechain && tokens.some((token) => matchesTokenVariant(row.primary_valuechain.toLowerCase(), token))) {
    score += 4;
  }

  if (row.primary_application && tokens.some((token) => matchesTokenVariant(row.primary_application.toLowerCase(), token))) {
    score += 8;
  }

  if (
    row.primary_application &&
    tokens.length > 1 &&
    tokens.every((token) => matchesTokenVariant(String(row.primary_application).toLowerCase(), token))
  ) {
    score += 18;
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

export async function runSearch(filters: SearchFilters) {
  const baseFilters = {
    ...filters,
    surfaceSlug: "askgre" as const,
    beyondGre: false
  };
  const results = await runSearchInternal(baseFilters);
  const shouldIncludeMachineSources = Boolean(filters.beyondGre) && shouldSearchExternalMachineSources(filters);
  const shouldIncludeGian = Boolean(filters.beyondGre);
  const shouldIncludeGrid = Boolean(filters.beyondGre);
  const shouldIncludeBetterIndia = Boolean(filters.beyondGre);
  const shouldIncludeLivelihood = Boolean(filters.beyondGre);
  const externalResults: any[] = [];

  if (shouldIncludeGian) {
    const gianResults = await runGianSearch(baseFilters);
    externalResults.push(...gianResults);
  }
  if (shouldIncludeGrid) {
    const gridResults = await runGridSearch(baseFilters);
    externalResults.push(...gridResults);
  }
  if (shouldIncludeBetterIndia) {
    const betterIndiaResults = await runBetterIndiaSearch(baseFilters);
    externalResults.push(...betterIndiaResults);
  }
  if (shouldIncludeLivelihood) {
    const directLivelihoodResults = await runLivelihoodDirectEntityLookup(baseFilters);
    externalResults.push(...directLivelihoodResults);
    const livelihoodResults = await runLivelihoodSearch(baseFilters);
    externalResults.push(...livelihoodResults);
  }

  if (shouldIncludeMachineSources) {
    const machineSourceResults = await runExternalMachineSourceSearch(baseFilters);
    externalResults.push(...machineSourceResults);
  }

  if (externalResults.length > 0) {
    const merged = mergeSuperGreResults(results, externalResults, filters);
    if (merged.length > 0) {
      return merged;
    }
  }

  if (results.length > 0) {
    return results;
  }

  if (filters.q && !hasExplicitNonKeywordFilters(filters)) {
    const fallbackResults = await runSearchInternal({
      ...baseFilters,
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

    if (shouldIncludeMachineSources) {
      const fallbackExternalResults: any[] = [];
      const fallbackFilters = {
        ...baseFilters,
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
      };

      if (shouldIncludeGian) {
        fallbackExternalResults.push(...await runGianSearch(fallbackFilters));
      }
      if (shouldIncludeGrid) {
        fallbackExternalResults.push(...await runGridSearch(fallbackFilters));
      }
      if (shouldIncludeBetterIndia) {
        fallbackExternalResults.push(...await runBetterIndiaSearch(fallbackFilters));
      }
      if (shouldIncludeLivelihood) {
        fallbackExternalResults.push(...await runLivelihoodDirectEntityLookup(fallbackFilters));
        fallbackExternalResults.push(...await runLivelihoodSearch(fallbackFilters));
      }
      fallbackExternalResults.push(...await runExternalMachineSourceSearch(fallbackFilters));
      return mergeSuperGreResults(fallbackResults, fallbackExternalResults, filters);
    }

    if (shouldIncludeGian) {
      const gianResults = await runGianSearch({
        ...baseFilters,
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
      return mergeSuperGreResults(fallbackResults, gianResults, filters);
    }

    if (shouldIncludeGrid) {
      const gridResults = await runGridSearch({
        ...baseFilters,
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
      return mergeSuperGreResults(fallbackResults, gridResults, filters);
    }

    if (shouldIncludeBetterIndia) {
      const betterIndiaResults = await runBetterIndiaSearch({
        ...baseFilters,
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
      return mergeSuperGreResults(fallbackResults, betterIndiaResults, filters);
    }

    if (shouldIncludeLivelihood) {
      const directLivelihoodResults = await runLivelihoodDirectEntityLookup({
        ...baseFilters,
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
      const livelihoodResults = await runLivelihoodSearch({
        ...baseFilters,
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
      return mergeSuperGreResults(fallbackResults, [...directLivelihoodResults, ...livelihoodResults], filters);
    }

    return fallbackResults;
  }

  return results;
}

function shouldSearchExternalMachineSources(filters: SearchFilters) {
  if (filters.category && normalizeComparable(filters.category) !== "product") {
    return false;
  }
  if (filters.domain6m && canonicalize6MValue(filters.domain6m) !== "Machine") {
    return false;
  }
  if (filters.offeringType && canonicalizeOfferingType(filters.offeringType) !== "machinery") {
    return false;
  }
  return true;
}

function rankUnifiedResults(rows: any[]) {
  return rows
    .sort((left, right) =>
      Number(right.matchScore || 0) - Number(left.matchScore || 0) ||
      Number(right.score || 0) - Number(left.score || 0) ||
      String(left.offering_name || "").localeCompare(String(right.offering_name || ""))
    );
}

function mergeSuperGreResults(greResults: any[], externalResults: any[], filters: SearchFilters) {
  const rankedGre = rankUnifiedResults(dedupeOfferingsById(greResults));
  const rankedExternal = rankUnifiedResults(dedupeOfferingsById(externalResults));
  const rankedMerged = rankUnifiedResults(dedupeOfferingsById([...greResults, ...externalResults]));

  if ((filters.surfaceSlug || "askgre") !== "supergre" || !filters.beyondGre || rankedGre.length === 0) {
    return rankedMerged;
  }

  const greIds = new Set(rankedGre.map((row) => String(row.offering_id || "")));
  return [...rankedGre, ...rankedExternal.filter((row) => !greIds.has(String(row.offering_id || "")))];
}

async function runSelcoSearch(filters: SearchFilters) {
  const rows = await getCachedSelcoRows();
  const filterOptions = await getFilterOptions(filters.surfaceSlug || "askgre");
  const preserveKeywordForExplicitSearch = hasExplicitNonKeywordFilters(filters);
  const inferredFilters = filters.disableKeywordPromotion || preserveKeywordForExplicitSearch
    ? { ...filters }
    : inferSearchFilters(filters, filters.q);
  const q = simplifyQueryText(inferredFilters.q, inferredFilters).trim() || String(inferredFilters.q || "").trim();

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

  const selcoRows = rows
    .filter((row: any) =>
      (!inferredFilters.category || row.offering_group === inferredFilters.category) &&
      matchesDomain6M(row.domain_6m, inferredFilters.domain6m) &&
      matchesOfferingType(row.offering_type, inferredFilters.offeringType) &&
      matchesProvider(row, inferredFilters.solutionProvider) &&
      matchesArray(row.tags, inferredFilters.tag) &&
      matchesGeography(row, inferredFilters.geography) &&
      (!filters.strictKeyword || strictKeywordMatch(row, q, true))
    )
    .map((row: any) => ({
      ...row,
      score: scoreRow(row, q) + providerScore(row, inferredFilters.solutionProvider),
      matchScore: computeRelevanceScore(row, q || inferredFilters.q, inferredFilters, filters)
    }));

  const positive = selcoRows.filter((row: any) => !q || Number(row.score || 0) > 0);
  const ranked = (positive.length || structuredFilterCount === 0 ? positive : selcoRows)
    .sort((left: any, right: any) =>
      Number(right.matchScore || 0) - Number(left.matchScore || 0) ||
      Number(right.score || 0) - Number(left.score || 0) ||
      String(left.offering_name || "").localeCompare(String(right.offering_name || ""))
    );

  const topScore = Number(ranked[0]?.matchScore || ranked[0]?.score || 0);
  const relevanceFloor = q && topScore > 0
    ? Math.max(4, Math.ceil(topScore * 0.55), topScore - 4)
    : 0;

  return ranked
    .filter((row: any) => inferredFilters.solutionProvider || !q || structuredFilterCount > 0 || Number(row.matchScore || 0) >= relevanceFloor || Number(row.score || 0) >= relevanceFloor)
    .slice(0, Math.min(filters.limit || 100, 150));
}

async function runInnovationGuildSearch(filters: SearchFilters) {
  const rows = await getCachedInnovationGuildRows();
  const preserveKeywordForExplicitSearch = hasExplicitNonKeywordFilters(filters);
  const inferredFilters = filters.disableKeywordPromotion || preserveKeywordForExplicitSearch
    ? { ...filters }
    : inferSearchFilters(filters, filters.q);
  const q = simplifyQueryText(inferredFilters.q, inferredFilters).trim() || String(inferredFilters.q || "").trim();

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

  const innovationRows = rows
    .filter((row: any) =>
      (!inferredFilters.category || row.offering_group === inferredFilters.category) &&
      matchesDomain6M(row.domain_6m, inferredFilters.domain6m) &&
      matchesOfferingType(row.offering_type, inferredFilters.offeringType) &&
      matchesProvider(row, inferredFilters.solutionProvider) &&
      matchesArray(row.tags, inferredFilters.tag) &&
      matchesGeography(row, inferredFilters.geography) &&
      (!filters.strictKeyword || strictKeywordMatch(row, q, true))
    )
    .map((row: any) => ({
      ...row,
      score: scoreRow(row, q) + providerScore(row, inferredFilters.solutionProvider),
      matchScore: computeRelevanceScore(row, q || inferredFilters.q, inferredFilters, filters)
    }));

  const positive = innovationRows.filter((row: any) => !q || Number(row.score || 0) > 0);
  const ranked = (positive.length || structuredFilterCount === 0 ? positive : innovationRows)
    .sort((left: any, right: any) =>
      Number(right.matchScore || 0) - Number(left.matchScore || 0) ||
      Number(right.score || 0) - Number(left.score || 0) ||
      String(left.offering_name || "").localeCompare(String(right.offering_name || ""))
    );

  const topScore = Number(ranked[0]?.matchScore || ranked[0]?.score || 0);
  const relevanceFloor = q && topScore > 0
    ? Math.max(4, Math.ceil(topScore * 0.55), topScore - 4)
    : 0;

  return ranked
    .filter((row: any) => inferredFilters.solutionProvider || !q || structuredFilterCount > 0 || Number(row.matchScore || 0) >= relevanceFloor || Number(row.score || 0) >= relevanceFloor)
    .slice(0, Math.min(filters.limit || 100, 150));
}

async function runExternalMachineSourceSearch(filters: SearchFilters) {
  const [selcoResults, innovationGuildResults] = await Promise.all([
    runSelcoSearch(filters),
    runInnovationGuildSearch(filters)
  ]);

  return rankUnifiedResults(
    dedupeOfferingsById([
      ...selcoResults,
      ...innovationGuildResults
    ])
  );
}

async function runGianSearch(filters: SearchFilters) {
  const rows = await getCachedGianRows();
  const preserveKeywordForExplicitSearch = hasExplicitNonKeywordFilters(filters);
  const inferredFilters = filters.disableKeywordPromotion || preserveKeywordForExplicitSearch
    ? { ...filters }
    : inferSearchFilters(filters, filters.q);
  const q = simplifyQueryText(inferredFilters.q, inferredFilters).trim() || String(inferredFilters.q || "").trim();

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

  const gianRows = rows
    .filter((row: any) =>
      (!inferredFilters.category || row.offering_group === inferredFilters.category) &&
      matchesDomain6M(row.domain_6m, inferredFilters.domain6m) &&
      matchesOfferingType(row.offering_type, inferredFilters.offeringType) &&
      matchesProvider(row, inferredFilters.solutionProvider) &&
      matchesArray(row.tags, inferredFilters.tag) &&
      matchesGeography(row, inferredFilters.geography) &&
      matchesScalar(row.primary_valuechain, inferredFilters.valueChain) &&
      matchesScalar(row.primary_application, inferredFilters.application) &&
      (!filters.strictKeyword || strictKeywordMatch(row, q, true))
    )
    .map((row: any) => ({
      ...row,
      score: scoreRow(row, q) + providerScore(row, inferredFilters.solutionProvider),
      matchScore: computeRelevanceScore(row, q || inferredFilters.q, inferredFilters, filters)
    }));

  const positive = gianRows.filter((row: any) => !q || Number(row.score || 0) > 0);
  const ranked = (positive.length || structuredFilterCount === 0 ? positive : gianRows)
    .sort((left: any, right: any) =>
      Number(right.matchScore || 0) - Number(left.matchScore || 0) ||
      Number(right.score || 0) - Number(left.score || 0) ||
      String(left.offering_name || "").localeCompare(String(right.offering_name || ""))
    );

  const topScore = Number(ranked[0]?.matchScore || ranked[0]?.score || 0);
  const relevanceFloor = q && topScore > 0
    ? Math.max(4, Math.ceil(topScore * 0.55), topScore - 4)
    : 0;

  return ranked
    .filter((row: any) => inferredFilters.solutionProvider || !q || structuredFilterCount > 0 || Number(row.matchScore || 0) >= relevanceFloor || Number(row.score || 0) >= relevanceFloor)
    .slice(0, Math.min(filters.limit || 100, 150));
}

async function runGridSearch(filters: SearchFilters) {
  const rows = await getCachedGridRows();
  const preserveKeywordForExplicitSearch = hasExplicitNonKeywordFilters(filters);
  const inferredFilters = filters.disableKeywordPromotion || preserveKeywordForExplicitSearch
    ? { ...filters }
    : inferSearchFilters(filters, filters.q);
  const q = simplifyQueryText(inferredFilters.q, inferredFilters).trim() || String(inferredFilters.q || "").trim();

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

  const gridRows = rows
    .filter((row: any) =>
      (!inferredFilters.category || row.offering_group === inferredFilters.category) &&
      matchesDomain6M(row.domain_6m, inferredFilters.domain6m) &&
      matchesOfferingType(row.offering_type, inferredFilters.offeringType) &&
      matchesProvider(row, inferredFilters.solutionProvider) &&
      matchesArray(row.tags, inferredFilters.tag) &&
      matchesGeography(row, inferredFilters.geography) &&
      matchesScalar(row.primary_valuechain, inferredFilters.valueChain) &&
      matchesScalar(row.primary_application, inferredFilters.application) &&
      (!filters.strictKeyword || strictKeywordMatch(row, q, true))
    )
    .map((row: any) => ({
      ...row,
      score: scoreRow(row, q) + providerScore(row, inferredFilters.solutionProvider),
      matchScore: computeRelevanceScore(row, q || inferredFilters.q, inferredFilters, filters)
    }));

  const positive = gridRows.filter((row: any) => !q || Number(row.score || 0) > 0);
  const ranked = (positive.length || structuredFilterCount === 0 ? positive : gridRows)
    .sort((left: any, right: any) =>
      Number(right.matchScore || 0) - Number(left.matchScore || 0) ||
      Number(right.score || 0) - Number(left.score || 0) ||
      String(left.offering_name || "").localeCompare(String(right.offering_name || ""))
    );

  const topScore = Number(ranked[0]?.matchScore || ranked[0]?.score || 0);
  const relevanceFloor = q && topScore > 0
    ? Math.max(4, Math.ceil(topScore * 0.55), topScore - 4)
    : 0;

  return ranked
    .filter((row: any) => inferredFilters.solutionProvider || !q || structuredFilterCount > 0 || Number(row.matchScore || 0) >= relevanceFloor || Number(row.score || 0) >= relevanceFloor)
    .slice(0, Math.min(filters.limit || 100, 150));
}

async function runBetterIndiaSearch(filters: SearchFilters) {
  const rows = await getCachedBetterIndiaRows();
  const preserveKeywordForExplicitSearch = hasExplicitNonKeywordFilters(filters);
  const inferredFilters = filters.disableKeywordPromotion || preserveKeywordForExplicitSearch
    ? { ...filters }
    : inferSearchFilters(filters, filters.q);
  const q = simplifyQueryText(inferredFilters.q, inferredFilters).trim() || String(inferredFilters.q || "").trim();

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

  const storyRows = rows
    .filter((row: any) =>
      (!inferredFilters.category || row.offering_group === inferredFilters.category) &&
      matchesDomain6M(row.domain_6m, inferredFilters.domain6m) &&
      matchesOfferingType(row.offering_type, inferredFilters.offeringType) &&
      matchesProvider(row, inferredFilters.solutionProvider) &&
      matchesArray(row.tags, inferredFilters.tag) &&
      matchesGeography(row, inferredFilters.geography) &&
      matchesScalar(row.primary_valuechain, inferredFilters.valueChain) &&
      matchesScalar(row.primary_application, inferredFilters.application) &&
      (!filters.strictKeyword || strictKeywordMatch(row, q, true))
    )
    .map((row: any) => ({
      ...row,
      score: scoreRow(row, q) + providerScore(row, inferredFilters.solutionProvider),
      matchScore: computeRelevanceScore(row, q || inferredFilters.q, inferredFilters, filters)
    }));

  const positive = storyRows.filter((row: any) => !q || Number(row.score || 0) > 0);
  const ranked = (positive.length || structuredFilterCount === 0 ? positive : storyRows)
    .sort((left: any, right: any) =>
      Number(right.matchScore || 0) - Number(left.matchScore || 0) ||
      Number(right.score || 0) - Number(left.score || 0) ||
      String(left.offering_name || "").localeCompare(String(right.offering_name || ""))
    );

  const topScore = Number(ranked[0]?.matchScore || ranked[0]?.score || 0);
  const relevanceFloor = q && topScore > 0
    ? Math.max(4, Math.ceil(topScore * 0.55), topScore - 4)
    : 0;

  return ranked
    .filter((row: any) => inferredFilters.solutionProvider || !q || structuredFilterCount > 0 || Number(row.matchScore || 0) >= relevanceFloor || Number(row.score || 0) >= relevanceFloor)
    .slice(0, Math.min(filters.limit || 100, 150));
}

async function runLivelihoodSearch(filters: SearchFilters) {
  const rows = await getCachedLivelihoodRows();
  const preserveKeywordForExplicitSearch = hasExplicitNonKeywordFilters(filters);
  const inferredFilters = filters.disableKeywordPromotion || preserveKeywordForExplicitSearch
    ? { ...filters }
    : inferSearchFilters(filters, filters.q);
  const q = simplifyQueryText(inferredFilters.q, inferredFilters).trim() || String(inferredFilters.q || "").trim();

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

  const directNameMatches = q
    ? rows
      .filter((row: any) =>
        (!inferredFilters.category || row.offering_group === inferredFilters.category) &&
        matchesDomain6M(row.domain_6m, inferredFilters.domain6m) &&
        matchesOfferingType(row.offering_type, inferredFilters.offeringType) &&
        matchesArray(row.tags, inferredFilters.tag) &&
        matchesGeography(row, inferredFilters.geography) &&
        matchesScalar(row.primary_valuechain, inferredFilters.valueChain) &&
        matchesScalar(row.primary_application, inferredFilters.application) &&
        matchesDirectEntityName(row, q || inferredFilters.q)
      )
      .map((row: any) => {
        const nameBoost = directEntityNameBoost(row, q || inferredFilters.q);
        return {
          ...row,
          score: scoreRow(row, q) + providerScore(row, inferredFilters.solutionProvider) + nameBoost,
          matchScore: computeRelevanceScore(row, q || inferredFilters.q, inferredFilters, filters) + nameBoost
        };
      })
    : [];

  const livelihoodRows = rows
    .filter((row: any) =>
      (!inferredFilters.category || row.offering_group === inferredFilters.category) &&
      matchesDomain6M(row.domain_6m, inferredFilters.domain6m) &&
      matchesOfferingType(row.offering_type, inferredFilters.offeringType) &&
      matchesProvider(row, inferredFilters.solutionProvider) &&
      matchesArray(row.tags, inferredFilters.tag) &&
      matchesGeography(row, inferredFilters.geography) &&
      matchesScalar(row.primary_valuechain, inferredFilters.valueChain) &&
      matchesScalar(row.primary_application, inferredFilters.application) &&
      (!filters.strictKeyword || strictKeywordMatch(row, q, true))
    )
    .map((row: any) => {
      const nameBoost = directEntityNameBoost(row, q || inferredFilters.q);
      return {
        ...row,
        score: scoreRow(row, q) + providerScore(row, inferredFilters.solutionProvider) + nameBoost,
        matchScore: computeRelevanceScore(row, q || inferredFilters.q, inferredFilters, filters) + nameBoost
      };
    });

  const combinedCandidates = dedupeOfferingsById([...directNameMatches, ...livelihoodRows]);

  const positive = combinedCandidates.filter((row: any) => !q || Number(row.score || 0) > 0);
  const ranked = (positive.length || structuredFilterCount === 0 ? positive : combinedCandidates)
    .sort((left: any, right: any) =>
      Number(right.matchScore || 0) - Number(left.matchScore || 0) ||
      Number(right.score || 0) - Number(left.score || 0) ||
      String(left.offering_name || "").localeCompare(String(right.offering_name || ""))
    );

  const topScore = Number(ranked[0]?.matchScore || ranked[0]?.score || 0);
  const relevanceFloor = q && topScore > 0
    ? Math.max(4, Math.ceil(topScore * 0.55), topScore - 4)
    : 0;

  return ranked
    .filter((row: any) =>
      matchesDirectEntityName(row, q || inferredFilters.q) ||
      inferredFilters.solutionProvider ||
      !q ||
      structuredFilterCount > 0 ||
      Number(row.matchScore || 0) >= relevanceFloor ||
      Number(row.score || 0) >= relevanceFloor
    )
    .slice(0, Math.min(filters.limit || 100, 150));
}

async function runSearchInternal(filters: SearchFilters) {
  const { offerings, traders } = await getCachedSearchData();
  const limit = Math.min(filters.limit || 100, 500);
  const filterOptions = await getFilterOptions(filters.surfaceSlug || "askgre");
  const preserveKeywordForExplicitSearch = hasExplicitNonKeywordFilters(filters);
  const primaryKeywordFilter = filters.disableKeywordPromotion || preserveKeywordForExplicitSearch
    ? null
    : resolvePrimaryKeywordFilter(filters.q, filterOptions);
  const baseInferredFilters = filters.disableKeywordPromotion || preserveKeywordForExplicitSearch
    ? { ...filters }
    : inferSearchFilters(filters, filters.q);
  const inferredFilters = {
    ...baseInferredFilters,
    solutionProvider:
      filters.solutionProvider ||
      (primaryKeywordFilter?.field === "solutionProvider" ? primaryKeywordFilter.value : undefined) ||
      baseInferredFilters.solutionProvider ||
      (filters.disableKeywordPromotion || preserveKeywordForExplicitSearch
        ? undefined
        : inferSolutionProvider(filters.q, filterOptions.solutionProviders)),
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
  const structuredMatchFromKeyword = !filters.disableKeywordPromotion && !preserveKeywordForExplicitSearch && [
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
        matchesDomain6M(row.domain_6m, inferredFilters.domain6m) &&
        matchesOfferingType(row.offering_type, inferredFilters.offeringType) &&
        (providerIds.length === 0 || providerIds.includes(row.trader_id))
      );
    });

  const scored = baseRows
    .filter((row: any) => {
      return (
        (!filters.strictKeyword || strictKeywordMatch(row, q, preserveKeywordForExplicitSearch)) &&
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
      score: scoreRow(row, q) + providerScore(row, inferredFilters.solutionProvider),
      matchScore: computeRelevanceScore(row, q || inferredFilters.q, inferredFilters, filters)
    }));

  const positiveScoreRows = scored.filter(({ score }) => !q || score > 0);
  if (filters.strictKeyword && q && positiveScoreRows.length === 0 && structuredFilterCount === 0) {
    return [];
  }
  const scoredForRanking = positiveScoreRows.length || structuredFilterCount === 0
    ? positiveScoreRows
    : scored;

  const ranked = scoredForRanking
    .sort((left, right) =>
      right.matchScore - left.matchScore ||
      right.score - left.score ||
      String(left.row.offering_name || "").localeCompare(String(right.row.offering_name || ""))
    );

  const topScore = ranked[0]?.matchScore || ranked[0]?.score || 0;
  const relevanceFloor = q && topScore > 0
    ? Math.max(4, Math.ceil(topScore * 0.55), topScore - 4)
    : 0;

  const filtered = ranked
    .filter(({ score, matchScore }) => inferredFilters.solutionProvider || !q || structuredFilterCount > 0 || matchScore >= relevanceFloor || score >= relevanceFloor)
    .slice(0, limit)
    .map(({ row, matchScore }) => ({
      ...row,
      matchScore
    }));

  return dedupeOfferingsByContent(dedupeOfferingsById(filtered));
}

export async function getFilterOptions(surface: GreSurfaceSlug = "askgre") {
  const now = Date.now();
  const inMemory = filterOptionsCache[surface];
  if (inMemory && inMemory.expiresAt > now) {
    return inMemory.value;
  }

  const supabase = createServerSupabaseClient();
  const [state, cached] = await Promise.all([
    ensureSurfaceCacheState(surface),
    supabase
      .from("filter_options_cache")
      .select("payload,updated_at")
      .eq("surface_slug", surface)
      .maybeSingle()
  ]);

  if (cached.error) {
    throw toError(cached.error, "Failed to read filter options cache.");
  }

  const cachedValue = cached.data?.payload
    ? mergeFilterOptionsWithDefaults(surface, cached.data.payload as CachedFilterOptions)
    : null;
  const cacheLooksIncomplete =
    surface === "askgre" &&
    Boolean(cachedValue) &&
    (!cachedValue.solutionProviders?.length || !cachedValue.valueChains?.length || !cachedValue.applications?.length);

  if ((state.filters_dirty || cacheLooksIncomplete) && cached.data?.payload) {
    try {
      return mergeFilterOptionsWithDefaults(surface, await refreshFilterOptionsCache(surface));
    } catch {
      filterOptionsCache[surface] = {
        expiresAt: now + FILTER_CACHE_TTL_MS,
        value: cachedValue!,
      };
      return cachedValue!;
    }
  }

  if (!state.filters_dirty && cached.data?.payload) {
    const value = cachedValue!;
    filterOptionsCache[surface] = {
      expiresAt: now + FILTER_CACHE_TTL_MS,
      value
    };
    return value;
  }

  if (cached.data?.payload) {
    const value = cachedValue!;
    filterOptionsCache[surface] = {
      expiresAt: now + FILTER_CACHE_TTL_MS,
      value
    };
    return value;
  }

  try {
    return mergeFilterOptionsWithDefaults(surface, await refreshFilterOptionsCache(surface));
  } catch {
    const fallback = defaultServerFilterOptions(surface);
    void seedFilterOptionsCache(surface, fallback);
    filterOptionsCache[surface] = {
      expiresAt: now + FILTER_CACHE_TTL_MS,
      value: fallback
    };
    return fallback;
  }
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
      raw_payload,
      solution:solutions (
        solution_id,
        solution_name,
        about_solution_text,
        solution_image_url,
        raw_payload,
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

  return normalizeOfferingRow(data);
}

export async function getExternalOfferingDetail(source: string, recordId: string) {
  const supabase = createServerSupabaseClient();
  if (source === "selco") {
    const { data: product, error: productError } = await supabase
      .from("selco_products")
      .select("portal_product_id,portal_vendor_id,vendor_name,product_name,product_description,product_link,tags,search_text,product_image_url,product_specifications")
      .eq("portal_product_id", recordId)
      .single();

    if (productError || !product) {
      throw productError || new Error("SELCO product not found.");
    }

    const { data: vendor, error: vendorError } = await supabase
      .from("selco_vendors")
      .select("portal_vendor_id,vendor_name,about_vendor,website_details,location_text,city,state,country,service_locations,tags,portal_vendor_link,portal_contact_name,portal_email,portal_phone,website_email,website_phone,final_contact_email,final_contact_phone,final_contact_address,website_status,contact_notes,search_text,latitude,longitude")
      .eq("portal_vendor_id", product.portal_vendor_id)
      .single();

    if (vendorError || !vendor) {
      throw vendorError || new Error("SELCO vendor not found.");
    }

    return normalizeSelcoRow(vendor, product);
  }

  if (source === "innovation-guild" || source === "innovation_guild") {
    const { data: product, error: productError } = await supabase
      .from("innovation_guild_products")
      .select("portal_product_id,portal_vendor_id,vendor_name,product_name,product_description,product_link,product_image_url,product_gallery_urls,product_video_urls,product_location_text,product_categories,product_subcategories,product_specifications,tags,search_text")
      .eq("portal_product_id", recordId)
      .single();

    if (productError || !product) {
      throw productError || new Error("Innovation Guild product not found.");
    }

    const { data: vendor, error: vendorError } = await supabase
      .from("innovation_guild_vendors")
      .select("portal_vendor_id,vendor_name,about_vendor,website_details,location_text,city,state,country,service_locations,tags,portal_vendor_link,portal_contact_name,portal_email,portal_phone,website_email,website_phone,final_contact_email,final_contact_phone,final_contact_address,contact_source_url,website_status,contact_notes,search_text,latitude,longitude")
      .eq("portal_vendor_id", product.portal_vendor_id)
      .single();

    if (vendorError || !vendor) {
      throw vendorError || new Error("Innovation Guild vendor not found.");
    }

    return normalizeInnovationGuildRow(vendor, product);
  }

  if (source === "gian") {
    const { data: product, error: productError } = await supabase
      .from("gian_innovations")
      .select("portal_product_id,portal_vendor_id,vendor_name,product_name,product_description,product_link,product_image_url,product_gallery_urls,product_video_urls,product_location_text,product_categories,product_subcategories,product_specifications,tags,search_text,raw_product")
      .eq("portal_product_id", recordId)
      .single();

    if (productError || !product) {
      throw productError || new Error("GIAN innovation not found.");
    }

    const { data: vendor, error: vendorError } = await supabase
      .from("gian_innovators")
      .select("portal_vendor_id,vendor_name,about_vendor,website_details,location_text,city,state,country,service_locations,tags,portal_vendor_link,portal_contact_name,portal_email,portal_phone,website_email,website_phone,website_address,final_contact_email,final_contact_phone,final_contact_address,contact_source_url,website_status,contact_notes,innovator_image_urls,innovator_media_urls,search_text,raw_vendor,latitude,longitude")
      .eq("portal_vendor_id", product.portal_vendor_id)
      .single();

    if (vendorError || !vendor) {
      throw vendorError || new Error("GIAN innovator not found.");
    }

    return normalizeGianRow(vendor, product);
  }

  if (source === "grid") {
    const { data: practice, error: practiceError } = await supabase
      .from("grid_practices")
      .select("portal_product_id,portal_vendor_id,vendor_name,product_name,product_description,product_link,product_image_url,product_gallery_urls,product_video_urls,product_attachment_urls,product_location_text,product_categories,product_subcategories,product_specifications,practice_summary,innovator_details,practice_details,source_reference,tags,search_text,raw_product,six_m_categories,reviewed_tags,admin_notes,ai_model,ai_summary,ai_classified_at,ai_source_hash")
      .eq("portal_product_id", recordId)
      .single();

    if (practiceError || !practice) {
      throw practiceError || new Error("GRID practice not found.");
    }

    const { data: vendor, error: vendorError } = await supabase
      .from("grid_innovators")
      .select("portal_vendor_id,vendor_name,about_vendor,website_details,location_text,city,state,country,district,pin_code,agro_ecological_zone,service_locations,tags,portal_vendor_link,portal_contact_name,portal_email,portal_phone,website_email,website_phone,website_address,final_contact_email,final_contact_phone,final_contact_address,contact_source_url,website_status,contact_notes,innovator_image_urls,innovator_media_urls,search_text,raw_vendor,latitude,longitude")
      .eq("portal_vendor_id", practice.portal_vendor_id)
      .single();

    if (vendorError || !vendor) {
      throw vendorError || new Error("GRID innovator not found.");
    }

    return normalizeGridRow(vendor, practice);
  }

  if (source === "better-india" || source === "better_india") {
    const { data: story, error: storyError } = await supabase
      .from("better_india_stories")
      .select("story_uid,story_url,title,person_name,person_slug,author_name,thematic_area,place_label,location_text,state,country,contact_email,contact_phone,contact_address,summary_of_work,story_excerpt,six_m_categories,tags,cover_image_url,story_image_urls,latitude,longitude,source_published_at,source_listing_page,source_listing_position,source_status,admin_notes,ai_model,ai_summary,raw_story,search_text")
      .eq("story_uid", recordId)
      .single();

    if (storyError || !story) {
      throw storyError || new Error("Better India story not found.");
    }

    return normalizeBetterIndiaRow(story);
  }

  if (source === "livelihood" || source === "livelihood-directory") {
    const { data: entity, error: entityError } = await supabase
      .from("ecosystem_directory_entities")
      .select("entity_uid,entity_name,entity_type_slug,entity_type_label,entity_kind,color_hex,summary,description,location_label,primary_address,district,state,country,contact_email,contact_phone,website_url,social_media,office_locations,tags,keywords,latitude,longitude,source_label,source_url,admin_notes,search_text,type_specific_data,approval_status,is_deleted")
      .eq("entity_uid", recordId)
      .single();

    if (entityError || !entity) {
      throw entityError || new Error("Livelihood entity not found.");
    }

    return normalizeLivelihoodRow(entity);
  }

  throw new Error("Unsupported external source.");
}

export async function getDirectorySummaryStats(surface: GreSurfaceSlug = "askgre") {
  const now = Date.now();
  const inMemory = directorySummaryCache[surface];
  if (inMemory && inMemory.expiresAt > now) {
    return inMemory.value;
  }

  const supabase = createServerSupabaseClient();
  const [state, cached] = await Promise.all([
    ensureSurfaceCacheState(surface),
    supabase
      .from("directory_summary_cache")
      .select("offering_count,provider_count,source_count,updated_at")
      .eq("surface_slug", surface)
      .maybeSingle()
  ]);

  if (cached.error) {
    throw toError(cached.error, "Failed to read directory summary cache.");
  }

  if (!state.directory_dirty && cached.data) {
    const value = {
      offeringCount: Number(cached.data.offering_count || 0),
      providerCount: Number(cached.data.provider_count || 0),
      sourceCount: Number(cached.data.source_count || 0)
    };
    directorySummaryCache[surface] = {
      expiresAt: now + FILTER_CACHE_TTL_MS,
      value
    };
    return value;
  }

  if (cached.data) {
    const value = {
      offeringCount: Number(cached.data.offering_count || 0),
      providerCount: Number(cached.data.provider_count || 0),
      sourceCount: Number(cached.data.source_count || 0)
    };
    directorySummaryCache[surface] = {
      expiresAt: now + FILTER_CACHE_TTL_MS,
      value
    };
    return value;
  }

  try {
    return await refreshDirectorySummaryCache(surface);
  } catch {
    const fallback = surface === "supergre"
      ? { offeringCount: 0, providerCount: 0, sourceCount: 7 }
      : { offeringCount: 0, providerCount: 0, sourceCount: 1 };
    void seedDirectorySummaryCache(surface, fallback);
    directorySummaryCache[surface] = {
      expiresAt: now + FILTER_CACHE_TTL_MS,
      value: fallback
    };
    return fallback;
  }
}

function providerNamesForRow(row: { organisation_name?: string | null; trader_name?: string | null }) {
  return [row.organisation_name, row.trader_name]
    .filter(Boolean)
    .map((value) => normalizeComparable(String(value)));
}

function toError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return new Error(String((error as { message?: unknown }).message || fallback));
  }
  return new Error(fallback);
}

async function getUnifiedRowsForSurface(surface: GreSurfaceSlug = "askgre") {
  const { offerings, traders } = await getCachedSearchData();

  if (surface !== "supergre") {
    return { offerings, traders, rows: offerings };
  }

  const [selcoRows, innovationGuildRows, gianRows, gridRows, betterIndiaRows, livelihoodRows] = await Promise.all([
    getCachedSelcoRows(),
    getCachedInnovationGuildRows(),
    getCachedGianRows(),
    getCachedGridRows(),
    getCachedBetterIndiaRows(),
    getCachedLivelihoodRows()
  ]);

  const rows = dedupeOfferingsById([
    ...offerings,
    ...selcoRows,
    ...innovationGuildRows,
    ...gianRows,
    ...gridRows,
    ...betterIndiaRows,
    ...livelihoodRows
  ]);

  return { offerings, traders, rows };
}

function buildDirectorySummaryStats(rows: any[], traders: TraderLookupRow[], surface: GreSurfaceSlug): DirectorySummaryStats {
  if (surface !== "supergre") {
    return {
      offeringCount: rows.length,
      providerCount: uniqueSorted(
        (traders || [])
          .map((row: any) => row.organisation_name || row.trader_name)
          .filter(Boolean)
      ).length,
      sourceCount: 1
    };
  }

  const providerKeys = new Set<string>();
  for (const row of rows) {
    const providerKey = String(
      row?.solution?.trader?.trader_id ||
      row?.solution?.trader?.organisation_name ||
      row?.solution?.trader?.trader_name ||
      row?.preferred_contact_name ||
      row?.offering_name ||
      ""
    ).trim();
    if (providerKey) {
      providerKeys.add(providerKey);
    }
  }

  const sourceCount = new Set(
    rows
      .map((row: any) => String(row?.source_slug || "gre").trim())
      .filter(Boolean)
  ).size;

  return {
    offeringCount: rows.length,
    providerCount: providerKeys.size,
    sourceCount
  };
}

function buildFilterOptionsFromRows(rows: any[], traders: TraderLookupRow[], surface: GreSurfaceSlug): CachedFilterOptions {
  const providerCandidates = uniqueSorted(rows.flatMap((row: any) => [
    row?.solution?.trader?.organisation_name,
    row?.solution?.trader?.trader_name,
    row?.organisation_name,
    row?.trader_name,
    row?.preferred_contact_name,
  ].filter(Boolean)));
  const solutionProviders = surface === "supergre"
    ? providerCandidates
    : uniqueSorted([
      ...(traders || [])
        .map((row: any) => row.organisation_name || row.trader_name)
        .filter(Boolean),
      ...providerCandidates,
    ]);

  const domains6m = uniqueSorted(
    rows.flatMap((row: any) =>
      String(row.domain_6m || "")
        .split(/[;,|]/)
        .map((item) => canonicalize6MValue(item) || item.trim())
        .filter(Boolean),
    ),
  );

  return {
    solutionProviders,
    categories: uniqueSorted(rows.map((row: any) => row.offering_group).filter(Boolean)),
    domains6m,
    offeringTypes: uniqueSorted(rows.map((row: any) => row.offering_type).filter(Boolean)),
    offeringTypesByDomain: Object.fromEntries(
      domains6m.map((domain) => [
        domain,
        uniqueSorted(
          rows
            .filter((row: any) => matchesDomain6M(row.domain_6m, domain))
            .map((row: any) => row.offering_type)
            .filter(Boolean),
        )
      ])
    ),
    valueChains: uniqueSorted(rows.flatMap((row: any) => [
      row.primary_valuechain,
      ...(Array.isArray(row.valuechains) ? row.valuechains : []),
    ]).filter(Boolean)),
    applications: uniqueSorted(rows.flatMap((row: any) => [
      row.primary_application,
      ...(Array.isArray(row.applications) ? row.applications : []),
    ]).filter(Boolean)),
    tags: uniqueSorted(rows.flatMap((row: any) => row.tags || [])),
    languages: uniqueSorted(rows.flatMap((row: any) => row.languages || [])),
    geographies: uniqueSorted(rows.flatMap((row: any) => row.geographies || []))
  };
}

function defaultServerFilterOptions(surface: GreSurfaceSlug): CachedFilterOptions {
  const offeringTypesByDomain: Record<string, string[]> = {
    Manpower: ["Training"],
    Method: ["Blogs", "Community Support", "Consulting", "Institutional Support", "SOP Manuals", "Technology Transfer", "Training"],
    Machine: ["Machinery", "Innovation", "Practice"],
    Material: ["Raw Material"],
    Market: ["Market Reports", "Market Support"],
    Money: ["Financial Support"]
  };

  if (surface !== "supergre") {
    return {
      solutionProviders: [],
      categories: ["Knowledge", "Product", "Service"],
      domains6m: CANONICAL_SUPERGRE_DOMAINS,
      offeringTypes: [
        "Blogs",
        "Consulting",
        "Financial support",
        "Machinery",
        "Market reports",
        "Market support",
        "Raw material",
        "SOP manuals",
        "Tech transfer",
        "Training",
        "Videos"
      ],
      offeringTypesByDomain: {
        Manpower: ["Training"],
        Method: ["Blogs", "Consulting", "SOP manuals", "Tech transfer", "Videos"],
        Machine: ["Machinery"],
        Material: ["Raw material"],
        Market: ["Market reports", "Market support"],
        Money: ["Financial support"]
      },
      valueChains: [
        "Livestock",
        "Dairy",
        "Poultry",
        "Goat",
        "Agriculture",
        "Bamboo",
        "Food Processing"
      ],
      applications: [
        "Goat",
        "Dairy For Milk",
        "Biscuit",
        "Baked Goods",
        "Poultry",
        "Organic Farming"
      ],
      tags: [],
      languages: ["English", "Hindi", "KANNADA", "MARATHI", "ODIA", "TELUGU", "TAMIL", "GUJARATI"],
      geographies: ["India", "Karnataka", "Madhya Pradesh", "Odisha", "Maharashtra", "Telangana", "Jharkhand", "Bihar"]
    };
  }

  return {
    solutionProviders: [],
    categories: ["Knowledge", "Product", "Service"],
    domains6m: CANONICAL_SUPERGRE_DOMAINS,
    offeringTypes: CANONICAL_SUPERGRE_OFFERING_TYPES,
    offeringTypesByDomain,
    valueChains: [],
    applications: [],
    tags: [],
    languages: ["English", "Hindi", "KANNADA", "MARATHI", "ODIA", "TELUGU", "TAMIL", "GUJARATI", "Bangla"],
    geographies: ["India", "Karnataka", "Madhya Pradesh", "Odisha", "Maharashtra", "Telangana", "Jharkhand", "Bihar", "Pan-India"]
  };
}

function mergeFilterOptionsWithDefaults(surface: GreSurfaceSlug, options: CachedFilterOptions): CachedFilterOptions {
  const defaults = defaultServerFilterOptions(surface);
  return {
    solutionProviders: options.solutionProviders?.length ? options.solutionProviders : defaults.solutionProviders,
    categories: options.categories?.length ? options.categories : defaults.categories,
    domains6m: options.domains6m?.length ? options.domains6m : defaults.domains6m,
    offeringTypes: options.offeringTypes?.length ? options.offeringTypes : defaults.offeringTypes,
    offeringTypesByDomain: Object.keys(options.offeringTypesByDomain || {}).length ? options.offeringTypesByDomain : defaults.offeringTypesByDomain,
    valueChains: options.valueChains?.length ? options.valueChains : defaults.valueChains,
    applications: options.applications?.length ? options.applications : defaults.applications,
    tags: options.tags?.length ? options.tags : defaults.tags,
    languages: options.languages?.length ? options.languages : defaults.languages,
    geographies: options.geographies?.length ? options.geographies : defaults.geographies,
    ...(typeof options.providerEmailTemplate === "string" && options.providerEmailTemplate.trim()
      ? { providerEmailTemplate: options.providerEmailTemplate }
      : {}),
  };
}

function addValues(target: Set<string>, values: unknown) {
  for (const value of flattenObjectStrings(values)) {
    const text = String(value || "").trim();
    if (text) {
      target.add(text);
    }
  }
}

function addDomains(target: Set<string>, values: unknown) {
  for (const value of flattenObjectStrings(values)) {
    const text = canonicalize6MValue(String(value || "").trim()) || String(value || "").trim();
    if (text) {
      target.add(text);
    }
  }
}

function addGeographies(target: Set<string>, values: unknown) {
  addValues(target, values);
}

async function buildAskGreFilterOptionsLightweight(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const { offerings, traders } = await getCachedSearchData();
  return mergeFilterOptionsWithDefaults("askgre", buildFilterOptionsFromRows(offerings || [], traders || [], "askgre"));
}

async function buildSuperGreFilterOptionsLightweight(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const defaultOptions = defaultServerFilterOptions("supergre");
  const [greOfferings, greTraders, selcoVendors, innovationProducts, innovationVendors, gianProducts, gianVendors, gridPractices, gridInnovators, betterIndiaStories, livelihoodEntities] = await Promise.all([
    supabase.from("offerings").select("offering_group,domain_6m,offering_type,primary_valuechain,primary_application,tags,languages,geographies"),
    supabase.from("traders").select("organisation_name,trader_name"),
    supabase.from("selco_vendors").select("vendor_name,city,state,country,service_locations,tags"),
    supabase.from("innovation_guild_products").select("product_categories,product_subcategories,tags"),
    supabase.from("innovation_guild_vendors").select("vendor_name,city,state,country,service_locations,tags"),
    supabase.from("gian_innovations").select("product_categories,product_subcategories,tags,raw_product"),
    supabase.from("gian_innovators").select("vendor_name,city,state,country,service_locations,tags"),
    supabase.from("grid_practices").select("product_categories,product_subcategories,tags,reviewed_tags,six_m_categories"),
    supabase.from("grid_innovators").select("vendor_name,city,state,country,service_locations,tags"),
    supabase.from("better_india_stories").select("person_name,thematic_area,tags,six_m_categories,place_label,state,country"),
    supabase.from("ecosystem_directory_entities").select("entity_name,entity_type_slug,entity_type_label,tags,keywords,location_label,state,country,office_locations,type_specific_data")
  ]);

  [
    greOfferings,
    greTraders,
    selcoVendors,
    innovationProducts,
    innovationVendors,
    gianProducts,
    gianVendors,
    gridPractices,
    gridInnovators,
    betterIndiaStories,
    livelihoodEntities
  ].forEach((result, index) => {
    if (result.error) {
      const labels = [
        "GRE offerings",
        "GRE providers",
        "SELCO vendors",
        "Innovation Guild products",
        "Innovation Guild vendors",
        "GIAN innovations",
        "GIAN innovators",
        "GRID practices",
        "GRID innovators",
        "Better India stories",
        "Livelihood entities"
      ];
      throw toError(result.error, `Failed to load ${labels[index]} for filter cache.`);
    }
  });

  const solutionProviders = new Set<string>();
  const categories = new Set<string>(defaultOptions.categories);
  const domains6m = new Set<string>(defaultOptions.domains6m);
  const offeringTypes = new Set<string>(defaultOptions.offeringTypes);
  const valueChains = new Set<string>();
  const applications = new Set<string>();
  const tags = new Set<string>();
  const languages = new Set<string>(defaultOptions.languages);
  const geographies = new Set<string>(defaultOptions.geographies);

  for (const row of greTraders.data || []) {
    addValues(solutionProviders, [row.organisation_name, row.trader_name]);
  }
  for (const row of greOfferings.data || []) {
    addValues(categories, row.offering_group);
    addDomains(domains6m, String(row.domain_6m || "").split(/[;,|]/));
    addValues(offeringTypes, row.offering_type);
    addValues(valueChains, row.primary_valuechain);
    addValues(applications, row.primary_application);
    addValues(tags, row.tags);
    addValues(languages, row.languages);
    addGeographies(geographies, row.geographies);
  }

  for (const vendor of selcoVendors.data || []) {
    addValues(solutionProviders, vendor.vendor_name);
    addValues(tags, vendor.tags);
    addGeographies(geographies, [vendor.city, vendor.state, vendor.country, vendor.service_locations]);
  }

  addValues(offeringTypes, "Machinery");
  addDomains(domains6m, "Machine");
  addValues(categories, "Product");

  for (const product of innovationProducts.data || []) {
    addValues(valueChains, product.product_categories);
    addValues(applications, product.product_subcategories);
    addValues(tags, product.tags);
  }
  for (const vendor of innovationVendors.data || []) {
    addValues(solutionProviders, vendor.vendor_name);
    addValues(tags, vendor.tags);
    addGeographies(geographies, [vendor.city, vendor.state, vendor.country, vendor.service_locations]);
  }

  for (const product of gianProducts.data || []) {
    addValues(valueChains, product.product_categories);
    addValues(applications, product.product_subcategories);
    addValues(tags, product.tags);
    addDomains(domains6m, [
      product?.raw_product?.primary_domain_6m,
      ...(Array.isArray(product?.raw_product?.secondary_domains_6m) ? product.raw_product.secondary_domains_6m : []),
      ...(Array.isArray(product?.raw_product?.domains_6m) ? product.raw_product.domains_6m : [])
    ]);
  }
  for (const vendor of gianVendors.data || []) {
    addValues(solutionProviders, vendor.vendor_name);
    addValues(tags, vendor.tags);
    addGeographies(geographies, [vendor.city, vendor.state, vendor.country, vendor.service_locations]);
  }
  addValues(offeringTypes, ["Innovation", "Market Support", "Financial Support", "Raw Material", "Training", "Technology Transfer"]);

  for (const practice of gridPractices.data || []) {
    addValues(valueChains, [...(practice.product_categories || []), ...(practice.reviewed_tags || [])]);
    addValues(applications, productSubcategoriesOrReviewed(practice));
    addValues(tags, [...(practice.tags || []), ...(practice.reviewed_tags || [])]);
    addDomains(domains6m, practice.six_m_categories);
  }
  for (const innovator of gridInnovators.data || []) {
    addValues(solutionProviders, innovator.vendor_name);
    addValues(tags, innovator.tags);
    addGeographies(geographies, [innovator.city, innovator.state, innovator.country, innovator.service_locations]);
  }
  addValues(offeringTypes, ["Practice"]);

  for (const story of betterIndiaStories.data || []) {
    addValues(solutionProviders, story.person_name);
    addValues(valueChains, [story.thematic_area, ...(story.tags || [])]);
    addValues(applications, [story.thematic_area, ...(story.tags || [])]);
    addValues(tags, story.tags);
    addDomains(domains6m, story.six_m_categories);
    addGeographies(geographies, [story.place_label, story.state, story.country]);
  }
  addValues(categories, "Knowledge");
  addValues(offeringTypes, ["Blogs", "Market Reports"]);

  for (const entity of livelihoodEntities.data || []) {
    addValues(solutionProviders, entity.entity_name);
    addValues(tags, [...(entity.tags || []), ...(entity.keywords || [])]);
    addValues(valueChains, [...(entity.keywords || []), ...(entity.tags || [])]);
    addValues(applications, [
      ...(Array.isArray(entity?.type_specific_data?.domain_expertise) ? entity.type_specific_data.domain_expertise : []),
      ...(Array.isArray(entity?.type_specific_data?.support_services) ? entity.type_specific_data.support_services : [])
    ]);
    addGeographies(geographies, [entity.location_label, entity.state, entity.country, entity.office_locations, entity?.type_specific_data?.geography_served]);
    addValues(languages, entity?.type_specific_data?.languages_spoken);
    addDomains(domains6m, [
      ...livelihoodTypeDomains(String(entity.entity_type_slug || "").trim()),
      ...livelihoodSecondaryDomains(String(entity.entity_type_slug || "").trim(), entity)
    ]);
    addValues(offeringTypes, livelihoodOfferingType(String(entity.entity_type_slug || "").trim()));
  }
  addValues(categories, "Service");

  const normalizedDomains = uniqueSorted(Array.from(domains6m));
  const normalizedOfferingTypes = uniqueSorted(Array.from(offeringTypes));

  return {
    solutionProviders: uniqueSorted(Array.from(solutionProviders)),
    categories: uniqueSorted(Array.from(categories)),
    domains6m: normalizedDomains,
    offeringTypes: normalizedOfferingTypes,
    offeringTypesByDomain: Object.fromEntries(
      normalizedDomains.map((domain) => [
        domain,
        domain === "Machine"
          ? normalizedOfferingTypes.filter((value) => ["Machinery", "Innovation", "Practice"].includes(value))
          : domain === "Method"
            ? normalizedOfferingTypes.filter((value) => ["Blogs", "Community Support", "Consulting", "Institutional Support", "SOP Manuals", "Technology Transfer", "Training"].includes(value))
            : domain === "Material"
              ? normalizedOfferingTypes.filter((value) => ["Raw Material"].includes(value))
              : domain === "Market"
                ? normalizedOfferingTypes.filter((value) => ["Market Reports", "Market Support"].includes(value))
                : domain === "Money"
                  ? normalizedOfferingTypes.filter((value) => ["Financial Support"].includes(value))
                  : normalizedOfferingTypes.filter((value) => ["Training"].includes(value))
      ])
    ),
    valueChains: uniqueSorted(Array.from(valueChains)).slice(0, 400),
    applications: uniqueSorted(Array.from(applications)).slice(0, 400),
    tags: uniqueSorted(Array.from(tags)).slice(0, 800),
    languages: uniqueSorted(Array.from(languages)),
    geographies: uniqueSorted(Array.from(geographies)).slice(0, 500)
  };
}

function productSubcategoriesOrReviewed(practice: any) {
  return [
    ...(practice?.product_subcategories || []),
    ...(practice?.reviewed_tags || [])
  ];
}

async function ensureSurfaceCacheState(surface: GreSurfaceSlug) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("surface_cache_state")
    .select("surface_slug,directory_dirty,filters_dirty")
    .eq("surface_slug", surface)
    .maybeSingle();

  if (error) {
    throw toError(error, "Failed to load surface cache state.");
  }

  if (data) {
    return data;
  }

  const defaultState = {
    surface_slug: surface,
    directory_dirty: true,
    filters_dirty: true
  };

  const { data: inserted, error: insertError } = await supabase
    .from("surface_cache_state")
    .upsert(defaultState, { onConflict: "surface_slug" })
    .select("surface_slug,directory_dirty,filters_dirty")
    .single();

  if (insertError) {
    throw toError(insertError, "Failed to initialize surface cache state.");
  }

  return inserted;
}

async function markSurfaceCacheDirty(surface: GreSurfaceSlug, targets: Array<"directory" | "filters">) {
  const supabase = createServerSupabaseClient();
  const current = await ensureSurfaceCacheState(surface);

  const { error } = await supabase
    .from("surface_cache_state")
    .upsert({
      surface_slug: surface,
      directory_dirty: targets.includes("directory") ? true : Boolean(current.directory_dirty),
      filters_dirty: targets.includes("filters") ? true : Boolean(current.filters_dirty),
      updated_at: new Date().toISOString()
    }, { onConflict: "surface_slug" });

  if (error) {
    throw toError(error, "Failed to mark surface cache dirty.");
  }
}

async function refreshDirectorySummaryCache(surface: GreSurfaceSlug) {
  const supabase = createServerSupabaseClient();
  let stats: DirectorySummaryStats;

  if (surface !== "supergre") {
    const [offeringsCount, tradersRows] = await Promise.all([
      supabase.from("offerings").select("offering_id", { count: "exact", head: true }),
      supabase.from("traders").select("organisation_name,trader_name")
    ]);

    if (offeringsCount.error) throw toError(offeringsCount.error, "Failed to count GRE offerings.");
    if (tradersRows.error) throw toError(tradersRows.error, "Failed to load GRE providers.");

    stats = {
      offeringCount: Number(offeringsCount.count || 0),
      providerCount: uniqueSorted(
        (tradersRows.data || [])
          .flatMap((row: any) => [row.organisation_name, row.trader_name])
          .filter(Boolean)
      ).length,
      sourceCount: 1
    };
  } else {
    const countQueries = await Promise.all([
      supabase.from("offerings").select("offering_id", { count: "exact", head: true }),
      supabase.from("selco_products").select("portal_product_id", { count: "exact", head: true }),
      supabase.from("innovation_guild_products").select("portal_product_id", { count: "exact", head: true }),
      supabase.from("gian_innovations").select("portal_product_id", { count: "exact", head: true }),
      supabase.from("grid_practices").select("portal_product_id", { count: "exact", head: true }),
      supabase.from("better_india_stories").select("story_uid", { count: "exact", head: true }),
      supabase.from("ecosystem_directory_entities").select("entity_uid", { count: "exact", head: true })
    ]);

    countQueries.forEach((result, index) => {
      if (result.error) {
        const labels = ["GRE offerings", "SELCO products", "Innovation Guild products", "GIAN innovations", "GRID practices", "Better India stories", "Livelihood entities"];
        throw toError(result.error, `Failed to count ${labels[index]}.`);
      }
    });

    const providerQueries = await Promise.all([
      supabase.from("traders").select("organisation_name,trader_name"),
      supabase.from("selco_vendors").select("vendor_name"),
      supabase.from("innovation_guild_vendors").select("vendor_name"),
      supabase.from("gian_innovators").select("vendor_name"),
      supabase.from("grid_innovators").select("vendor_name"),
      supabase.from("better_india_stories").select("person_name"),
      supabase.from("ecosystem_directory_entities").select("entity_name")
    ]);

    providerQueries.forEach((result, index) => {
      if (result.error) {
        const labels = ["GRE providers", "SELCO vendors", "Innovation Guild vendors", "GIAN innovators", "GRID innovators", "Better India people", "Livelihood entities"];
        throw toError(result.error, `Failed to load ${labels[index]}.`);
      }
    });

    const providerCount = uniqueSorted([
      ...(providerQueries[0].data || []).flatMap((row: any) => [row.organisation_name, row.trader_name]),
      ...(providerQueries[1].data || []).map((row: any) => row.vendor_name),
      ...(providerQueries[2].data || []).map((row: any) => row.vendor_name),
      ...(providerQueries[3].data || []).map((row: any) => row.vendor_name),
      ...(providerQueries[4].data || []).map((row: any) => row.vendor_name),
      ...(providerQueries[5].data || []).map((row: any) => row.person_name),
      ...(providerQueries[6].data || []).map((row: any) => row.entity_name)
    ].filter(Boolean)).length;

    stats = {
      offeringCount: countQueries.reduce((sum, result) => sum + Number(result.count || 0), 0),
      providerCount,
      sourceCount: 7
    };
  }

  const { error: cacheError } = await supabase
    .from("directory_summary_cache")
    .upsert({
      surface_slug: surface,
      offering_count: stats.offeringCount,
      provider_count: stats.providerCount,
      source_count: stats.sourceCount,
      updated_at: new Date().toISOString()
    }, { onConflict: "surface_slug" });

  if (cacheError) {
    throw toError(cacheError, "Failed to refresh directory summary cache.");
  }

  const { error: stateError } = await supabase
    .from("surface_cache_state")
    .upsert({
      surface_slug: surface,
      directory_dirty: false,
      updated_at: new Date().toISOString()
    }, { onConflict: "surface_slug" });

  if (stateError) {
    throw toError(stateError, "Failed to update directory summary cache state.");
  }

  directorySummaryCache[surface] = {
    expiresAt: Date.now() + FILTER_CACHE_TTL_MS,
    value: stats
  };

  return stats;
}

async function refreshFilterOptionsCache(surface: GreSurfaceSlug) {
  const supabase = createServerSupabaseClient();
  const { data: existingCache, error: existingCacheError } = await supabase
    .from("filter_options_cache")
    .select("payload")
    .eq("surface_slug", surface)
    .maybeSingle();

  if (existingCacheError) {
    throw toError(existingCacheError, "Failed to read existing filter options cache.");
  }

  const options = surface === "supergre"
    ? await buildSuperGreFilterOptionsLightweight(supabase)
    : await buildAskGreFilterOptionsLightweight(supabase);

  const normalizedOptions = mergeFilterOptionsWithDefaults(surface, options);
  const payload = {
    ...normalizedOptions,
    ...(typeof existingCache?.payload?.providerEmailTemplate === "string" && existingCache.payload.providerEmailTemplate.trim()
      ? { providerEmailTemplate: existingCache.payload.providerEmailTemplate }
      : {})
  };

  const { error: cacheError } = await supabase
    .from("filter_options_cache")
    .upsert({
      surface_slug: surface,
      payload,
      updated_at: new Date().toISOString()
    }, { onConflict: "surface_slug" });

  if (cacheError) {
    throw toError(cacheError, "Failed to refresh filter options cache.");
  }

  const { error: stateError } = await supabase
    .from("surface_cache_state")
    .upsert({
      surface_slug: surface,
      filters_dirty: false,
      updated_at: new Date().toISOString()
    }, { onConflict: "surface_slug" });

  if (stateError) {
    throw toError(stateError, "Failed to update filter options cache state.");
  }

  filterOptionsCache[surface] = {
    expiresAt: Date.now() + FILTER_CACHE_TTL_MS,
    value: normalizedOptions
  };

  return normalizedOptions;
}

async function seedFilterOptionsCache(surface: GreSurfaceSlug, options: CachedFilterOptions) {
  const supabase = createServerSupabaseClient();
  const { data: existingCache } = await supabase
    .from("filter_options_cache")
    .select("payload")
    .eq("surface_slug", surface)
    .maybeSingle();

  await supabase
    .from("filter_options_cache")
    .upsert({
      surface_slug: surface,
      payload: {
        ...options,
        ...(typeof existingCache?.payload?.providerEmailTemplate === "string" && existingCache.payload.providerEmailTemplate.trim()
          ? { providerEmailTemplate: existingCache.payload.providerEmailTemplate }
          : {})
      },
      updated_at: new Date().toISOString()
    }, { onConflict: "surface_slug" });
}

async function seedDirectorySummaryCache(surface: GreSurfaceSlug, stats: DirectorySummaryStats) {
  const supabase = createServerSupabaseClient();
  await supabase
    .from("directory_summary_cache")
    .upsert({
      surface_slug: surface,
      offering_count: stats.offeringCount,
      provider_count: stats.providerCount,
      source_count: stats.sourceCount,
      updated_at: new Date().toISOString()
    }, { onConflict: "surface_slug" });
}

export async function refreshSurfaceCaches(surface: GreSurfaceSlug | "all" = "all") {
  const surfaces: GreSurfaceSlug[] = surface === "all" ? ["askgre", "supergre"] : [surface];
  const results: Record<string, { summary: DirectorySummaryStats; filters: CachedFilterOptions }> = {};

  for (const slug of surfaces) {
    const [summary, filters] = await Promise.all([
      refreshDirectorySummaryCache(slug),
      refreshFilterOptionsCache(slug)
    ]);
    results[slug] = { summary, filters };
  }

  return results;
}

function scoreProviderMatch(providerName: string, row: { organisation_name?: string | null; trader_name?: string | null }) {
  const probe = normalizeComparable(providerName);
  if (!probe) {
    return -1;
  }

  const names = providerNamesForRow(row);
  let bestScore = -1;

  for (const name of names) {
    if (!name) {
      continue;
    }

    if (name === probe) {
      bestScore = Math.max(bestScore, 1000);
    } else if (name.includes(probe) || probe.includes(name)) {
      bestScore = Math.max(bestScore, 700 - Math.abs(name.length - probe.length));
    } else {
      const probeTokens = probe.split(/\s+/).filter(Boolean);
      const matchCount = probeTokens.filter((token) => name.includes(token)).length;
      if (matchCount > 0) {
        bestScore = Math.max(bestScore, matchCount * 100);
      }
    }
  }

  return bestScore;
}

function dedupeOfferingsById<T extends { offering_id?: string | null }>(rows: T[]) {
  const seen = new Set<string>();
  const uniqueRows: T[] = [];

  for (const row of rows) {
    const key = String(row.offering_id || "").trim();
    if (!key) {
      uniqueRows.push(row);
      continue;
    }

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueRows.push(row);
  }

  return uniqueRows;
}

function canonicalGreLink(link: string | null | undefined) {
  const value = String(link || "").trim();
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    url.searchParams.delete("productSkuId");
    return url.toString();
  } catch {
    return value;
  }
}

function dedupeOfferingsByContent<T extends {
  trader_id?: string | null;
  offering_name?: string | null;
  offering_type?: string | null;
  offering_group?: string | null;
  domain_6m?: string | null;
  primary_valuechain?: string | null;
  primary_application?: string | null;
  about_offering_text?: string | null;
  gre_link?: string | null;
  solution?: { solution_id?: string | null } | null;
}>(rows: T[]) {
  const seen = new Set<string>();
  const uniqueRows: T[] = [];

  for (const row of rows) {
    const signature = [
      String(row.trader_id || "").trim(),
      String(row.solution?.solution_id || "").trim(),
      normalizeComparable(String(row.offering_name || "")),
      normalizeComparable(String(row.offering_type || "")),
      normalizeComparable(String(row.offering_group || "")),
      normalizeComparable(String(row.domain_6m || "")),
      normalizeComparable(String(row.primary_valuechain || "")),
      normalizeComparable(String(row.primary_application || "")),
      normalizeComparable(String(row.about_offering_text || "")),
      canonicalGreLink(row.gre_link)
    ].join("::");

    if (signature.replace(/[:]/g, "").length === 0) {
      uniqueRows.push(row);
      continue;
    }

    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    uniqueRows.push(row);
  }

  return uniqueRows;
}

export async function getProviderDetail(providerName: string) {
  const supabase = createServerSupabaseClient();
  const trimmedProviderName = providerName.trim();
  if (!trimmedProviderName) {
    throw new Error("Provider name is required.");
  }

  const { data: traders, error: traderError } = await supabase
    .from("traders")
    .select(
      `
      trader_id,
      trader_name,
      organisation_name,
      mobile,
      email,
      poc_name,
      description,
      short_description,
      tagline,
      website,
      association_status
    `
    )
    .limit(2000);

  if (traderError) {
    throw traderError;
  }

  const matchedTrader = (traders || [])
    .map((row: any) => ({ row, score: scoreProviderMatch(trimmedProviderName, row) }))
    .filter(({ score }) => score >= 0)
    .sort((left, right) => right.score - left.score)[0]?.row;

  if (!matchedTrader) {
    throw new Error("Provider not found.");
  }

  const { data: offerings, error: offeringError } = await supabase
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
      about_offering_text,
      gre_link,
      search_document,
      solution:solutions (
        solution_id,
        solution_name,
        about_solution_text
      )
    `
    )
    .in("publish_status", ["Published", "MIS Published"])
    .eq("trader_id", matchedTrader.trader_id)
    .order("primary_valuechain", { ascending: true })
    .order("primary_application", { ascending: true })
    .order("offering_name", { ascending: true });

  if (offeringError) {
    throw offeringError;
  }

  return {
    provider: matchedTrader,
    offerings: offerings || []
  };
}
