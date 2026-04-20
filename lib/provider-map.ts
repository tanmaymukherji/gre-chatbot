type ProviderResult = {
  geographies?: string[] | null;
  geographies_raw?: string | null;
  solution?: {
    trader?: {
      trader_id?: string | null;
      trader_name?: string | null;
      organisation_name?: string | null;
      email?: string | null;
      website?: string | null;
      association_status?: string | null;
    } | null;
  } | null;
  offering_id?: string | null;
  offering_name?: string | null;
  offering_group?: string | null;
  primary_valuechain?: string | null;
  primary_application?: string | null;
  gre_link?: string | null;
};

export type ProviderMarker = {
  markerId: string;
  providerId: string;
  providerName: string;
  lat: number;
  lng: number;
  locationLabel: string;
  email: string | null;
  website: string | null;
  associationStatus: string | null;
  offerings: Array<{
    offeringId: string | null;
    offeringName: string | null;
    offeringGroup: string | null;
    valueChain: string | null;
    application: string | null;
    greLink: string | null;
  }>;
};

const LOCATION_COORDINATES: Record<string, { lat: number; lng: number }> = {
  india: { lat: 22.5, lng: 79.0 },
  karnataka: { lat: 15.3, lng: 75.7 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  "bengaluru rural": { lat: 13.225, lng: 77.575 },
  "bengaluru urban": { lat: 12.9716, lng: 77.5946 },
  mysore: { lat: 12.2958, lng: 76.6394 },
  mysuru: { lat: 12.2958, lng: 76.6394 },
  tiptur: { lat: 13.2586, lng: 76.4787 },
  tumkur: { lat: 13.3409, lng: 77.101 },
  tumakuru: { lat: 13.3409, lng: 77.101 },
  ramanagara: { lat: 12.7219, lng: 77.2815 },
  karwar: { lat: 14.8167, lng: 74.1333 },
  "uttara kannada": { lat: 14.8002, lng: 74.124 },
  chamarajanagar: { lat: 11.9231, lng: 76.9395 },
  chikmagalur: { lat: 13.3161, lng: 75.772 },
  chikkamagaluru: { lat: 13.3161, lng: 75.772 },
  hassan: { lat: 13.0072, lng: 76.0962 },
  kolar: { lat: 13.1367, lng: 78.1299 },
  raichur: { lat: 16.2076, lng: 77.3463 },
  "madhya pradesh": { lat: 23.4733, lng: 77.947998 },
  indore: { lat: 22.7196, lng: 75.8577 },
  dewas: { lat: 22.9676, lng: 76.0534 },
  barwani: { lat: 22.0323, lng: 74.9009 },
  odisha: { lat: 20.9517, lng: 85.0985 },
  kalahandi: { lat: 19.914, lng: 83.1643 },
  maharashtra: { lat: 19.7515, lng: 75.7139 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  pune: { lat: 18.5204, lng: 73.8567 },
  kolhapur: { lat: 16.705, lng: 74.2433 },
  nashik: { lat: 19.9975, lng: 73.7898 },
  jalgaon: { lat: 21.0077, lng: 75.5626 },
  solapur: { lat: 17.6599, lng: 75.9064 },
  telangana: { lat: 18.1124, lng: 79.0193 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  "ranga reddy": { lat: 17.3891, lng: 78.4011 },
  mahabubnagar: { lat: 16.7488, lng: 77.9854 },
  nalgonda: { lat: 17.0575, lng: 79.2671 },
  "tamil nadu": { lat: 11.1271, lng: 78.6569 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  bihar: { lat: 25.0961, lng: 85.3131 },
  "uttar pradesh": { lat: 26.8467, lng: 80.9462 },
  jharkhand: { lat: 23.6102, lng: 85.2799 },
  rajasthan: { lat: 27.0238, lng: 74.2179 }
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}, ]+/gu, " ").replace(/\s+/g, " ").trim();
}

function splitGeographyParts(value: string) {
  return normalize(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveCoordinate(geography: string) {
  const parts = splitGeographyParts(geography);

  for (const part of parts) {
    if (LOCATION_COORDINATES[part]) {
      return {
        ...LOCATION_COORDINATES[part],
        label: geography
      };
    }
  }

  const whole = normalize(geography);
  if (LOCATION_COORDINATES[whole]) {
    return {
      ...LOCATION_COORDINATES[whole],
      label: geography
    };
  }

  return null;
}

function collectGeographies(result: ProviderResult) {
  const values = [
    ...(result.geographies || []),
    result.geographies_raw || null
  ]
    .filter(Boolean)
    .flatMap((entry) => String(entry).split(/[;|\n]+/))
    .map((entry) => entry.trim())
    .filter(Boolean);

  return [...new Set(values)];
}

export function buildProviderMarkers(results: ProviderResult[]) {
  const markers = new Map<string, ProviderMarker>();

  for (const result of results) {
    const trader = result.solution?.trader;
    const providerId = trader?.trader_id || `provider-${result.offering_id || Math.random()}`;
    const providerName = trader?.organisation_name || trader?.trader_name || "Unknown provider";
    const geographies = collectGeographies(result);
    const resolvedGeographies = geographies
      .map((geography) => ({ geography, resolved: resolveCoordinate(geography) }))
      .filter((entry) => entry.resolved);

    const targetGeographies = resolvedGeographies.length > 0
      ? resolvedGeographies
      : [{ geography: "India", resolved: LOCATION_COORDINATES.india ? { ...LOCATION_COORDINATES.india, label: "India" } : null }].filter((entry) => entry.resolved);

    for (const entry of targetGeographies) {
      const resolved = entry.resolved!;
      const markerId = `${providerId}::${normalize(entry.geography) || "india"}`;

      if (!markers.has(markerId)) {
        markers.set(markerId, {
          markerId,
          providerId,
          providerName,
          lat: resolved.lat,
          lng: resolved.lng,
          locationLabel: resolved.label,
          email: trader?.email || null,
          website: trader?.website || null,
          associationStatus: trader?.association_status || null,
          offerings: []
        });
      }

      markers.get(markerId)?.offerings.push({
        offeringId: result.offering_id || null,
        offeringName: result.offering_name || null,
        offeringGroup: result.offering_group || null,
        valueChain: result.primary_valuechain || null,
        application: result.primary_application || null,
        greLink: result.gre_link || null
      });
    }
  }

  return [...markers.values()];
}
