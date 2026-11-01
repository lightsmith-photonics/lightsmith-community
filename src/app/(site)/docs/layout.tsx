import Link from "next/link";

const PAGES = [
  { href: "/docs", label: "Getting started" },
  { href: "/docs/spec", label: "Simulation spec" },
  { href: "/docs/agents", label: "AI agents and MCP" },
  { href: "/docs/platform", label: "Using this platform" },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-page grid gap-8 py-10 md:grid-cols-[13rem_1fr]">
      <nav aria-label="Documentation">
        <ul className="space-y-1 text-sm md:sticky md:top-20">
          {PAGES.map((p) => (
            <li key={p.href}>
              <Link className="block rounded-md px-3 py-1.5 hover:bg-surface" href={p.href}>
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <article className="prose-os min-w-0">{children}</article>
    </div>
  );
}
