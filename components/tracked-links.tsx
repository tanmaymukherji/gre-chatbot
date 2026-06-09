"use client";

import Link, { LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { ImpactAuditEvent, ImpactCounterKey, incrementImpactCounter, trackImpactCounter } from "@/lib/impact";

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const parts = document.cookie ? document.cookie.split("; ") : [];
  const prefix = `${name}=`;
  for (const part of parts) {
    if (part.indexOf(prefix) === 0) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return "";
}

function buildAuditEvent(auditEvent?: ImpactAuditEvent) {
  if (typeof window === "undefined") {
    return auditEvent;
  }

  let summary: Record<string, unknown> | null = null;
  const rawSummary = readCookie("grameee_user_summary");
  if (rawSummary) {
    try {
      summary = JSON.parse(rawSummary) as Record<string, unknown>;
    } catch {
      summary = null;
    }
  }

  const hostname = window.location.hostname || "";
  const surface = auditEvent?.surface || (hostname.startsWith("supergre.") ? "supergre" : hostname.startsWith("askgre.") ? "askgre" : hostname);
  return {
    ...auditEvent,
    kind: auditEvent?.kind || "view",
    surface,
    actorEmail: auditEvent?.actorEmail || String(summary?.email || "").trim().toLowerCase() || undefined,
    actorName: auditEvent?.actorName || String(summary?.fullName || summary?.username || "").trim() || undefined,
  } satisfies ImpactAuditEvent;
}

function hasSharedLoginSummary() {
  return Boolean(readCookie("grameee_user_summary"));
}

function promptSharedLogin() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem("grameee-return-to", window.location.href);
  } catch {}

  const authLink = document.querySelector("[data-auth-link]") as HTMLAnchorElement | null;
  if (authLink) {
    authLink.click();
    return;
  }

  window.location.href = "https://grameee.org/login.html?returnTo=" + encodeURIComponent(window.location.href);
}

type TrackedLinkProps = LinkProps & {
  children: ReactNode;
  className?: string;
  counterKey?: ImpactCounterKey;
  auditEvent?: ImpactAuditEvent;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

type TrackedAnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  counterKey?: ImpactCounterKey;
  auditEvent?: ImpactAuditEvent;
};

export function TrackedLink({
  children,
  className,
  counterKey = "solutions_discovered",
  auditEvent,
  onClick,
  ...props
}: TrackedLinkProps) {
  const router = useRouter();

  return (
    <Link
      {...props}
      className={className}
      onClick={async (event) => {
        onClick?.(event);
        if (event.defaultPrevented) {
          return;
        }

        if (!hasSharedLoginSummary()) {
          event.preventDefault();
          promptSharedLogin();
          return;
        }

        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          typeof props.href !== "string"
        ) {
          trackImpactCounter(counterKey, 1, buildAuditEvent(auditEvent));
          return;
        }

        event.preventDefault();
        await incrementImpactCounter(counterKey, 1, buildAuditEvent(auditEvent));
        if (props.replace) {
          router.replace(props.href);
          return;
        }
        router.push(props.href);
      }}
    >
      {children}
    </Link>
  );
}

export function TrackedAnchor({
  children,
  className,
  counterKey = "solutions_discovered",
  auditEvent,
  onClick,
  ...props
}: TrackedAnchorProps) {
  return (
    <a
      {...props}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (!hasSharedLoginSummary()) {
          event.preventDefault();
          promptSharedLogin();
          return;
        }
        trackImpactCounter(counterKey, 1, buildAuditEvent(auditEvent));
      }}
    >
      {children}
    </a>
  );
}
