import { notFound } from "next/navigation";
import { loadResult } from "@/lib/projects";
import { env } from "@/lib/env";
import { brand } from "@/lib/brand";
import { ResultPanel } from "@/components/charts/ResultPanel";

// Framable plot (frame-ancestors * for /embed/*). Private results never render here.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadResult(id, null);
  return r ? { title: `${r.name} — ${r.project.title}`, robots: { index: false } } : {};
}

export default async function EmbedResult({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadResult(id, null);
  if (!r || r.project.visibility === "private") notFound();
  return (
    <main className="p-2">
      <ResultPanel resultId={r.id} title={`${r.project.title}: ${r.name}`} compact />
      <p className="mt-1 flex justify-between text-xs text-muted">
        <span>
          {r.method} via {r.backend}
        </span>
        <a href={`${env.siteUrl}/p/${r.project.slug}#result-${r.id}`} target="_blank" rel="noopener" className="link">
          View on {brand.community}
        </a>
      </p>
    </main>
  );
}
