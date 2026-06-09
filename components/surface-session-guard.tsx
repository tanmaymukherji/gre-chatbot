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
    let authUpdated = false;

    const hasSharedSessionHints = () => {
      const cookieText = typeof document === "undefined" ? "" : document.cookie;
      return cookieText.includes("grameee_user_summary=") ||
        (cookieText.includes("grameee_access_token=") && cookieText.includes("grameee_refresh_token="));
    };

    const onAuthUpdated = () => {
      authUpdated = true;
    };

    const runGuard = async () => {
      if (cancelled) {
        return;
      }

      const authApi = (window as typeof window & {
        grameeeAuth?: {
          requireLoggedInUser?: () => Promise<unknown>;
          getStoredSummary?: () => unknown;
          hydrateAuthSession?: () => Promise<unknown>;
          updateNavForUser?: (user: unknown) => void;
        };
      }).grameeeAuth;

      if (!authApi?.requireLoggedInUser) {
        attempts += 1;
        if (attempts < 20) {
          window.setTimeout(runGuard, 150);
        }
        return;
      }

      const storedSummary = authApi.getStoredSummary?.();
      if (storedSummary) {
        authApi.updateNavForUser?.(storedSummary);
        authUpdated = true;
      }

      if (!authUpdated && hasSharedSessionHints()) {
        const hydratedUser = await authApi.hydrateAuthSession?.().catch(() => null);
        if (hydratedUser) {
          authApi.updateNavForUser?.(hydratedUser);
          authUpdated = true;
        } else {
          attempts += 1;
          if (attempts < 20) {
            window.setTimeout(runGuard, 150);
          }
          return;
        }
      }

      try {
        const user = await authApi.requireLoggedInUser();
        authApi.updateNavForUser?.(user);
      } catch {
        // The shared GramEEE auth flow performs the redirect itself.
      }
    };

    void runGuard();
    document.body.dataset.greSurface = surfaceSlug;
    document.addEventListener("grameee:auth-updated", onAuthUpdated);

    return () => {
      cancelled = true;
      document.removeEventListener("grameee:auth-updated", onAuthUpdated);
    };
  }, [forceLoginOnEntry, surfaceSlug]);

  return null;
}
