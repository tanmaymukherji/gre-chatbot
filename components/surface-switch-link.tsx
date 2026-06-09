"use client";

type Props = {
  className?: string;
  href: string;
  children: React.ReactNode;
};

type SharedUserSummary = {
  id?: string;
  email?: string;
  fullName?: string;
  organization?: string;
  organizationLink?: string;
  phone?: string;
  username?: string;
  role?: string;
  privileges?: Record<string, boolean>;
};

function readCookie(name: string) {
  const parts = typeof document === "undefined" ? [] : document.cookie.split("; ");
  const prefix = `${name}=`;

  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }

  return "";
}

function encodeTransfer(payload: unknown) {
  try {
    return window.btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  } catch {
    return "";
  }
}

export function SurfaceSwitchLink({ className, href, children }: Props) {
  return (
    <a
      className={className}
      href={href}
      onClick={(event) => {
        if (typeof window === "undefined") {
          return;
        }

        const authApi = (window as typeof window & {
          grameeeAuth?: {
            getStoredSummary?: () => SharedUserSummary | null;
          };
        }).grameeeAuth;

        const summary = authApi?.getStoredSummary?.() || null;
        const accessToken = readCookie("grameee_access_token");
        const refreshToken = readCookie("grameee_refresh_token");

        if (!summary || !accessToken || !refreshToken) {
          return;
        }

        let targetUrl: URL;
        try {
          targetUrl = new URL(href, window.location.origin);
        } catch {
          return;
        }

        const encoded = encodeTransfer({
          summary,
          accessToken,
          refreshToken,
        });

        if (!encoded) {
          return;
        }

        event.preventDefault();
        targetUrl.searchParams.set("grameeeAuthState", encoded);
        window.location.href = targetUrl.toString();
      }}
    >
      {children}
    </a>
  );
}
