"use client";

import { useEffect, useState } from "react";
import { fetchImpactCounters } from "@/lib/impact";

type ImpactCounters = {
  solutions_discovered: number;
  connections_made: number;
};

type DirectoryStats = {
  offeringCount: number;
  providerCount: number;
  sourceCount?: number;
};

const INITIAL_COUNTERS: ImpactCounters = {
  solutions_discovered: 0,
  connections_made: 0,
};

export function ImpactStats({
  surfaceLabel = "Ask GRE",
  directoryStats,
}: {
  surfaceLabel?: string;
  directoryStats?: DirectoryStats;
}) {
  const [counters, setCounters] = useState<ImpactCounters>(INITIAL_COUNTERS);

  useEffect(() => {
    let disposed = false;

    async function load() {
      try {
        const nextCounters = await fetchImpactCounters();
        if (!disposed) {
          setCounters(nextCounters);
        }
      } catch {
        // keep zero fallback if the shared counter service is briefly unavailable
      }
    }

    function handleUpdate(event: Event) {
      const customEvent = event as CustomEvent<{ counters?: ImpactCounters }>;
      if (customEvent.detail?.counters && !disposed) {
        setCounters(customEvent.detail.counters);
      }
    }

    function handlePageReturn() {
      void load();
    }

    load();
    window.addEventListener("grameee-impact-updated", handleUpdate as EventListener);
    window.addEventListener("pageshow", handlePageReturn);
    window.addEventListener("focus", handlePageReturn);
    const intervalId = window.setInterval(load, 30000);

    return () => {
      disposed = true;
      window.removeEventListener("grameee-impact-updated", handleUpdate as EventListener);
      window.removeEventListener("pageshow", handlePageReturn);
      window.removeEventListener("focus", handlePageReturn);
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <>
      <div className="stat stat-centered">
        {surfaceLabel}
        <strong>{Number(directoryStats?.offeringCount || 0).toLocaleString("en-IN")}</strong>
        Solution Offerings
      </div>
      <div className="stat stat-centered">
        Solution Providers
        <strong>{Number(directoryStats?.providerCount || 0).toLocaleString("en-IN")}</strong>
        Providers
      </div>
      <div className="stat stat-centered">
        Main groups
        <strong>3</strong>
        Product, Knowledge, Service
      </div>
      <div className="stat stat-centered">
        Frameworks
        <strong>6</strong>
        Manpower, Method, Material, Machine, Money and Market
      </div>
      <div className="stat stat-centered stat-impact">
        Solutions Discovered
        <strong>{counters.solutions_discovered.toLocaleString("en-IN")}</strong>
        View-Driven Discoveries
      </div>
      <div className="stat stat-centered stat-impact">
        Connections Made
        <strong>{counters.connections_made.toLocaleString("en-IN")}</strong>
        Outreach Actions Triggered
      </div>
    </>
  );
}
