export type GreFeatureItem = {
  id: string;
  name: string;
  writeup: string;
  imageUrl: string;
  linkUrl?: string;
};

export type ConsortiumPartnerItem = {
  id: string;
  name: string;
  logoUrl?: string;
  websiteUrl?: string;
};

export type ShowcaseContent = {
  features: GreFeatureItem[];
  partners: ConsortiumPartnerItem[];
};

export const EMPTY_SHOWCASE_CONTENT: ShowcaseContent = {
  features: [],
  partners: []
};

export const SHARED_SHOWCASE_PAYLOAD_KEY = "greShowcase";
export const SHOWCASE_SURFACE_SLUGS = ["askgre", "supergre"] as const;

export function normalizeShowcaseContent(payload: unknown): ShowcaseContent {
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return {
    features: Array.isArray(source.greFeatures)
      ? source.greFeatures
          .map((item) => normalizeFeatureItem(item))
          .filter((item): item is GreFeatureItem => Boolean(item))
      : [],
    partners: Array.isArray(source.consortiumPartners)
      ? source.consortiumPartners
          .map((item) => normalizePartnerItem(item))
          .filter((item): item is ConsortiumPartnerItem => Boolean(item))
      : []
  };
}

export function normalizeShowcaseContentFromCachePayload(payload: unknown): ShowcaseContent {
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return normalizeShowcaseContent(
    source[SHARED_SHOWCASE_PAYLOAD_KEY]
      || source.askgreShowcase
      || source.supergreShowcase
      || source
  );
}

export function hasShowcaseContent(content: ShowcaseContent) {
  return content.features.length > 0 || content.partners.length > 0;
}

function normalizeFeatureItem(item: unknown): GreFeatureItem | null {
  if (!item || typeof item !== "object") return null;
  const source = item as Record<string, unknown>;
  const id = String(source.id || crypto.randomUUID()).trim();
  const name = String(source.name || "").trim();
  const writeup = String(source.writeup || "").trim();
  const imageUrl = String(source.imageUrl || "").trim();
  const linkUrl = String(source.linkUrl || "").trim();
  if (!id || !name || !writeup || !imageUrl) return null;
  return { id, name, writeup, imageUrl, linkUrl: linkUrl || undefined };
}

function normalizePartnerItem(item: unknown): ConsortiumPartnerItem | null {
  if (!item || typeof item !== "object") return null;
  const source = item as Record<string, unknown>;
  const id = String(source.id || crypto.randomUUID()).trim();
  const name = String(source.name || "").trim();
  const logoUrl = String(source.logoUrl || "").trim();
  const websiteUrl = String(source.websiteUrl || "").trim();
  if (!id || !name) return null;
  return { id, name, logoUrl: logoUrl || undefined, websiteUrl: websiteUrl || undefined };
}
