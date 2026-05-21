"use client";

export type ImpactCounterKey = "solutions_discovered" | "connections_made";

export type ImpactCounters = {
  solutions_discovered: number;
  connections_made: number;
};

const IMPACT_API_PATH = "/api/impact";
const IMPACT_PENDING_KEY = "grameee-impact-pending";

function normalizeCounters(value: unknown): ImpactCounters {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    solutions_discovered: Number(source.solutions_discovered || 0),
    connections_made: Number(source.connections_made || 0),
  };
}

function readPendingCounters(): ImpactCounters {
  if (typeof window === "undefined") {
    return normalizeCounters({});
  }

  try {
    const raw = window.sessionStorage.getItem(IMPACT_PENDING_KEY);
    if (!raw) {
      return normalizeCounters({});
    }
    return normalizeCounters(JSON.parse(raw));
  } catch {
    return normalizeCounters({});
  }
}

function writePendingCounters(counters: ImpactCounters) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(IMPACT_PENDING_KEY, JSON.stringify(counters));
  } catch {}
}

function bumpPendingCounter(counterKey: ImpactCounterKey, delta: number) {
  const current = readPendingCounters();
  current[counterKey] = Number(current[counterKey] || 0) + Math.max(1, Number(delta || 1));
  writePendingCounters(current);
  return current;
}

function clearPendingCounters() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(IMPACT_PENDING_KEY);
  } catch {}
}

async function postImpactIncrement(counterKey: ImpactCounterKey, delta = 1) {
  return fetch(IMPACT_API_PATH, {
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
}

async function flushPendingCounters() {
  const pending = readPendingCounters();
  const jobs = Object.entries(pending)
    .filter(([, value]) => Number(value) > 0)
    .map(([counterKey, value]) => ({
      counterKey: counterKey as ImpactCounterKey,
      delta: Number(value),
    }));

  if (!jobs.length) {
    return null;
  }

  let latestCounters: ImpactCounters | null = null;

  for (const job of jobs) {
    const response = await postImpactIncrement(job.counterKey, job.delta);
    if (!response) {
      return null;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return null;
    }

    latestCounters = normalizeCounters(data?.counters);
  }

  clearPendingCounters();
  return latestCounters;
}

export async function fetchImpactCounters(): Promise<ImpactCounters> {
  const flushedCounters = await flushPendingCounters();

  if (flushedCounters) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("grameee-impact-updated", {
        detail: { counters: flushedCounters },
      }));
    }
    return flushedCounters;
  }

  const response = await fetch(IMPACT_API_PATH, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "Impact counters could not be loaded.");
  }

  return normalizeCounters(data?.counters);
}

export async function incrementImpactCounter(counterKey: ImpactCounterKey, delta = 1) {
  bumpPendingCounter(counterKey, delta);

  const response = await postImpactIncrement(counterKey, delta);

  if (!response) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return null;
  }

  const counters = normalizeCounters(data?.counters);
  const remainingPending = readPendingCounters();
  remainingPending[counterKey] = Math.max(0, Number(remainingPending[counterKey] || 0) - Math.max(1, Number(delta || 1)));
  if (!remainingPending.solutions_discovered && !remainingPending.connections_made) {
    clearPendingCounters();
  } else {
    writePendingCounters(remainingPending);
  }

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
