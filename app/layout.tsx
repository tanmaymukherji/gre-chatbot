import "./globals.css";
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
        <link rel="stylesheet" href="https://grameee.org/shared-shell.css?v=20260531b" />
        <script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
        <script defer src="https://grameee.org/supabase-config.js?v=20260522m"></script>
        <script defer src="https://grameee.org/shared-shell.js?v=20260531b"></script>
        <script
          defer
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
        <script defer src="https://grameee.org/auth.js?v=20260531b"></script>
      </head>
      <body data-gre-surface={surface.slug}>
        <div id="grameeeShellSlot" suppressHydrationWarning />
        <SurfaceSessionGuard forceLoginOnEntry={surface.forceLoginOnEntry} surfaceSlug={surface.slug} />
        {children}
      </body>
    </html>
  );
}
