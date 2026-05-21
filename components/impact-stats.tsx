"use client";

import { useEffect, useState } from "react";
import { fetchImpactCounters } from "@/lib/impact";

type ImpactCounters = {
  solutions_discovered: number;
  connections_made: number;
};

const INITIAL_COUNTERS: ImpactCounters = {
  solutions_discovered: 0,
  connections_made: 0,
};

export function ImpactStats() {
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

    load();
    window.addEventListener("grameee-impact-updated", handleUpdate as EventListener);
    const intervalId = window.setInterval(load, 30000);

    return () => {
      disposed = true;
      window.removeEventListener("grameee-impact-updated", handleUpdate as EventListener);
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <>
      <div className="stat">
        Current Source
        <strong>1,659</strong>
        Solution Offerings
      </div>
      <div className="stat">
        Solution Providers
        <strong>233</strong>
        Providers
      </div>
      <div className="stat">
        Main groups
        <strong>3</strong>
        Product, Knowledge, Service
      </div>
      <div className="stat">
        Frameworks
        <strong>6</strong>
        Manpower, Method, Material, Machine, Money and Market
      </div>
      <div className="stat">
        Solutions Discovered
        <strong>{counters.solutions_discovered.toLocaleString("en-IN")}</strong>
        View-driven discoveries
      </div>
      <div className="stat">
        Connections Made
        <strong>{counters.connections_made.toLocaleString("en-IN")}</strong>
        Outreach actions triggered
      </div>
    </>
  );
}
