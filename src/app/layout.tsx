import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { themeInitScript } from "@/components/ThemeToggle";
import { env } from "@/lib/env";
import { brand } from "@/lib/brand";

// Computed per request so SITE_URL is read at runtime, not baked in at build time.
export function generateMetadata(): Metadata {
  return {
  metadataBase: new URL(env.siteUrl),
  title: { default: `${brand.community} — ${brand.tagline}`, template: `%s · ${brand.community}` },
  description: `${brand.pitch} Shared projects, a materials database with per-paper citations, and a forum.`,
  openGraph: { type: "website", siteName: brand.community },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-screen flex-col">{children}</body>
    </html>
  );
}
