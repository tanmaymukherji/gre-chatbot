"use client";

import { useEffect } from "react";
import type { GreSurfaceSlug } from "@/lib/surface";

type Props = {
  forceLoginOnEntry: boolean;
  surfaceSlug: GreSurfaceSlug;
};

export function SurfaceSessionGuard({ forceLoginOnEntry, surfaceSlug }: Props) {
  useEffect(() => {
    if (!forceLoginOnEntry || typeof window === "undefined") {
      return;
    }

    let attempts = 0;
    let cancelled = false;

    const runGuard = async () => {
      if (cancelled) {
        return;
      }

      const authApi = (window as typeof window & {
        grameeeAuth?: {
          requireLoggedInUser?: () => Promise<unknown>;
        };
      }).grameeeAuth;

      if (!authApi?.requireLoggedInUser) {
        attempts += 1;
        if (attempts < 20) {
          window.setTimeout(runGuard, 150);
        }
        return;
      }

      try {
        await authApi.requireLoggedInUser();
      } catch {
        // The shared GramEEE auth flow performs the redirect itself.
      }
    };

    void runGuard();
    document.body.dataset.greSurface = surfaceSlug;

    return () => {
      cancelled = true;
    };
  }, [forceLoginOnEntry, surfaceSlug]);

  return null;
}
