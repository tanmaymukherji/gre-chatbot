export type GreSurfaceSlug = "askgre" | "supergre";

export type GreSurfaceConfig = {
  slug: GreSurfaceSlug;
  hostnames: string[];
  heading: string;
  adminDataLabel: string;
  heroDescription: string;
  appBaseUrl: string;
  enableBeyondGre: boolean;
  forceLoginOnEntry: boolean;
  portalLabel: string;
  copilotLabel: string;
  datasetLabel: string;
};

const ASK_GRE_SURFACE: GreSurfaceConfig = {
  slug: "askgre",
  hostnames: ["askgre.grameee.org"],
  heading: "Ask GRE",
  adminDataLabel: "AskGRE Data",
  heroDescription:
    "A retrieval-first search and chatbot experience for Green Rural Economy offerings, designed to surface grounded recommendations across Product, Knowledge, Service, 6M domains, value chains, applications, tags, language, and geography.",
  appBaseUrl: "https://askgre.grameee.org",
  enableBeyondGre: false,
  forceLoginOnEntry: false,
  portalLabel: "View on GRE",
  copilotLabel: "GRE Copilot",
  datasetLabel: "GRE dataset"
};

const SUPER_GRE_SURFACE: GreSurfaceConfig = {
  slug: "supergre",
  hostnames: ["supergre.grameee.org"],
  heading: "SuperGRE",
  adminDataLabel: "SuperGRE Data",
  heroDescription:
    "A protected SuperGRE workspace that starts with the AskGRE experience and expands toward multi-source discovery across GramEEE and Beyond GRE datasets.",
  appBaseUrl: "https://supergre.grameee.org",
  enableBeyondGre: true,
  forceLoginOnEntry: true,
  portalLabel: "View on Portal",
  copilotLabel: "SuperGRE Copilot",
  datasetLabel: "GRE and connected source datasets"
};

const ALL_SURFACES = [SUPER_GRE_SURFACE, ASK_GRE_SURFACE];

export function getSurfaceConfigByHost(host: string | null | undefined): GreSurfaceConfig {
  const normalizedHost = String(host || "").toLowerCase().trim();
  return ALL_SURFACES.find((surface) => surface.hostnames.includes(normalizedHost)) || ASK_GRE_SURFACE;
}

export function getClientSurfaceConfig(): GreSurfaceConfig {
  if (typeof window === "undefined") {
    return ASK_GRE_SURFACE;
  }
  return getSurfaceConfigByHost(window.location.hostname);
}
