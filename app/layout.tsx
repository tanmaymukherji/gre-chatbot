import "./globals.css";
import Script from "next/script";

export const metadata = {
  title: "GRE Solutions Copilot",
  description: "Search and chat with Green Rural Economy solution and trader data."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://grameee.org/shared-shell.css?v=20260518b" />
        <Script src="https://grameee.org/supabase-config.js" strategy="beforeInteractive" />
        <Script src="https://grameee.org/shared-shell.js?v=20260518b" strategy="beforeInteractive" />
        <Script src="https://grameee.org/auth.js?v=20260518b" strategy="beforeInteractive" />
      </head>
      <body>
        <div id="grameeeShellSlot" suppressHydrationWarning />
        {children}
      </body>
    </html>
  );
}
