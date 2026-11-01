import Link from "next/link";
import { Header } from "@/components/Header";
import { env } from "@/lib/env";
import { brand } from "@/lib/brand";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only z-50 rounded bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:absolute focus:left-2 focus:top-2">
        Skip to content
      </a>
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="mt-16 border-t border-line py-8 text-sm text-muted">
        <div className="container-page flex flex-col gap-4 sm:flex-row sm:justify-between">
          <p>
            {brand.community} — {brand.tagline} Library {brand.library.license}-licensed.
          </p>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-4">
              <li>
                <Link className="hover:text-fg" href="/docs">Docs</Link>
              </li>
              <li>
                <Link className="hover:text-fg" href="/docs/agents">For AI agents</Link>
              </li>
              <li>
                <Link className="hover:text-fg" href="/pricing">Pricing</Link>
              </li>
              <li>
                <a className="hover:text-fg" href={env.paperUrl}>Technical report</a>
              </li>
              <li>
                <a className="hover:text-fg" href={env.githubRepo}>GitHub</a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </>
  );
}
