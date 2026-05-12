type GeographySource = {
  geographies?: string[] | null;
  geographies_raw?: string | null;
};

const COUNTRY_KEYS = new Set(["india"]);
const STATE_KEYS = new Set([
  "karnataka",
  "madhya pradesh",
  "odisha",
  "maharashtra",
  "telangana",
  "tamil nadu",
  "bihar",
  "uttar pradesh",
  "jharkhand",
  "rajasthan",
  "goa",
]);

export function normalizeGeographyValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}, ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function geographySpecificity(value: string) {
  const normalized = normalizeGeographyValue(value);
  if (COUNTRY_KEYS.has(normalized)) return 1;
  if (STATE_KEYS.has(normalized)) return 2;
  return 3;
}

export function splitGeographyParts(value: string) {
  return normalizeGeographyValue(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function dedupePreserveOrder(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const key = normalizeGeographyValue(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push(value.trim());
  });
  return output;
}

export function extractFlatGeographyEntries(source: GeographySource) {
  const values = [
    ...(Array.isArray(source?.geographies) ? source.geographies : []),
    typeof source?.geographies_raw === "string" ? source.geographies_raw : null,
  ]
    .filter(Boolean)
    .flatMap((entry) => String(entry).split(/[;|\n]+/))
    .map((entry) => entry.trim())
    .filter(Boolean);

  return dedupePreserveOrder(values);
}

function pushGroup(groups: string[][], current: string[]) {
  const group = dedupePreserveOrder(current);
  if (group.length) groups.push(group);
}

export function extractGeographyGroups(source: GeographySource) {
  const entries = extractFlatGeographyEntries(source);
  const groups: string[][] = [];
  let current: string[] = [];

  for (const entry of entries) {
    const specificity = geographySpecificity(entry);
    const currentSpecificities = current.map((item) => geographySpecificity(item));
    const hasCountry = currentSpecificities.includes(1);
    const hasState = currentSpecificities.includes(2);
    const hasSpecific = currentSpecificities.includes(3);

    if (specificity === 3) {
      pushGroup(groups, current);
      current = [entry];
      continue;
    }

    if (specificity === 2) {
      if (!current.length) {
        current = [entry];
        continue;
      }
      if (hasCountry || hasState) {
        pushGroup(groups, current);
        current = [entry];
        continue;
      }
      current.push(entry);
      continue;
    }

    if (!current.length) {
      current = [entry];
      continue;
    }

    if (hasCountry) {
      pushGroup(groups, current);
      current = [entry];
      continue;
    }

    current.push(entry);
  }

  pushGroup(groups, current);
  return groups;
}

export function geographyGroupLabel(group: string[]) {
  return dedupePreserveOrder(group).join(", ");
}

export function geographyGroupComponents(group: string[]) {
  const joined = geographyGroupLabel(group);
  const components = [
    normalizeGeographyValue(joined),
    ...group.flatMap((entry) => splitGeographyParts(entry)),
  ].filter(Boolean);
  return [...new Set(components)];
}

export function isStandaloneIndiaGroup(group: string[]) {
  const normalized = group.map((entry) => normalizeGeographyValue(entry)).filter(Boolean);
  return normalized.length > 0 && normalized.every((entry) => entry === "india");
}
