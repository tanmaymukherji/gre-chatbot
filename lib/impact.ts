"use client";

export type ImpactCounterKey = "solutions_discovered" | "connections_made";

export type ImpactCounters = {
  solutions_discovered: number;
  connections_made: number;
};

const IMPACT_API_PATH = "/api/impact";

function normalizeCounters(value: unknown): ImpactCounters {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    solutions_discovered: Number(source.solutions_discovered || 0),
    connections_made: Number(source.connections_made || 0),
  };
}

export async function fetchImpactCounters(): Promise<ImpactCounters> {
  const response = await fetch(IMPACT_API_PATH, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "Impact counters could not be loaded.");
  }

  return normalizeCounters(data?.counters);
}

export async function incrementImpactCounter(counterKey: ImpactCounterKey, delta = 1) {
  const response = await fetch(IMPACT_API_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      counterKey,
      delta,
    }),
    keepalive: true,
  }).catch(() => null);

  if (!response) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return null;
  }

  const counters = normalizeCounters(data?.counters);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("grameee-impact-updated", {
      detail: { counters },
    }));
  }

  return counters;
}

export function trackImpactCounter(counterKey: ImpactCounterKey, delta = 1) {
  void incrementImpactCounter(counterKey, delta);
}
