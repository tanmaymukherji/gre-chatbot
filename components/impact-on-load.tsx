"use client";

import { useEffect, useRef } from "react";
import { ImpactCounterKey, trackImpactCounter } from "@/lib/impact";

type Props = {
  counterKey?: ImpactCounterKey;
  enabled?: boolean;
};

export function ImpactOnLoad({ counterKey = "solutions_discovered", enabled = false }: Props) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (!enabled || trackedRef.current) {
      return;
    }

    trackedRef.current = true;
    trackImpactCounter(counterKey);
  }, [counterKey, enabled]);

  return null;
}
