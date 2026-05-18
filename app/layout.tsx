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
        <link rel="stylesheet" href="https://grameee.org/shared-shell.css" />
        <Script src="https://grameee.org/supabase-config.js" strategy="beforeInteractive" />
        <Script src="https://grameee.org/shared-shell.js" strategy="beforeInteractive" />
        <Script src="https://grameee.org/auth.js" strategy="beforeInteractive" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
