function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeCell(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length ? text : null;
}

export function stripHtml(html: string | null) {
  if (!html) {
    return "";
  }
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitLooseList(value: string | null, separators = [",", ";", "\n"]) {
  if (!value) {
    return [];
  }

  let working = value;
  separators.forEach((separator) => {
    working = working.split(separator).join("|");
  });

  return unique(
    working
      .split("|")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export function splitGeographies(value: string | null) {
  if (!value) {
    return [];
  }

  if (value.includes(";") || value.includes("\n") || value.includes("|")) {
    return splitLooseList(value, [";", "\n", "|"]);
  }

  return [value.trim()].filter(Boolean);
}

export function buildSearchDocument(parts: Array<string | null | string[]>) {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter(Boolean)
    .join(" | ")
    .replace(/\s+/g, " ")
    .trim();
}
