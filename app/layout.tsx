import "./globals.css";
import Script from "next/script";
import { headers } from "next/headers";
import { SurfaceSessionGuard } from "@/components/surface-session-guard";
import { getSurfaceConfigByHost } from "@/lib/surface";

export const metadata = {
  title: "GRE Solutions Copilot",
  description: "Search and chat with Green Rural Economy solution and trader data."
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const surface = getSurfaceConfigByHost(headerStore.get("host"));

  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://grameee.org/shared-shell.css?v=20260518b" />
        <Script src="https://grameee.org/supabase-config.js" strategy="beforeInteractive" />
        <Script src="https://grameee.org/shared-shell.js?v=20260518b" strategy="beforeInteractive" />
        <Script
          id="grameee-page-menu-config"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.grameeePageMenuConfig = ${JSON.stringify({
              menuItems: [
                {
                  label: surface.adminDataLabel,
                  href: `${surface.appBaseUrl}/admin`,
                  requiresAdmin: true,
                  sameWindow: true
                }
              ]
            })};`
          }}
        />
        <Script src="https://grameee.org/auth.js?v=20260518b" strategy="beforeInteractive" />
      </head>
      <body data-gre-surface={surface.slug}>
        <div id="grameeeShellSlot" suppressHydrationWarning />
        <SurfaceSessionGuard forceLoginOnEntry={surface.forceLoginOnEntry} surfaceSlug={surface.slug} />
        {children}
      </body>
    </html>
  );
}
