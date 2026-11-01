import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listVersions, loadProjectForVersions, loadVersion } from "@/lib/projects";
import { RESULT_KIND_LABELS, type ResultKind } from "@/lib/problem/result";
import { diffSnapshots, formatDelta, formatPath, formatValue, type SpecDiff } from "@/lib/versions/diff";
import { pairResults } from "@/lib/versions/overlay";
import { parseVersionNumber } from "@/lib/versions/api";
import { ResultOverlay } from "@/components/charts/ResultOverlay";
import { VersionNav } from "@/components/projects/VersionNav";

export const dynamic = "force-dynamic";

export const metadata = { title: "Compare versions", robots: { index: false } };

const STATUS_LABEL: Record<SpecDiff["status"], string> = { added: "added", removed: "removed", changed: "changed", unchanged: "unchanged" };

export default async function DiffPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { slug } = await params;
  const q = await searchParams;
  const me = await getCurrentUser();
  const p = await loadProjectForVersions(slug, me);
  if (!p) notFound();
  const current = p.currentVersion?.number ?? 1;
  const to = parseVersionNumber(q.to ?? "") ?? current;
  const from = parseVersionNumber(q.from ?? "") ?? Math.max(1, to - 1);
  const [a, b, versions] = await Promise.all([loadVersion(p.id, from), loadVersion(p.id, to), listVersions(p.id)]);
  if (!a || !b) notFound();
  const specs = diffSnapshots(a.specs, b.specs);
  const overlays = pairResults(a.results, b.results);
  const api = (n: number, id: string) => `/api/projects/${p.slug}/versions/${n}/results/${id}`;

  return (
    <div className="container-page py-10">
      <VersionNav project={p} here={`v${from} → v${to}`} />
      <h1 className="mt-1 text-3xl font-bold">
        Compare <Link className="link" href={`/p/${p.slug}/v/${from}`}>v{from}</Link> with <Link className="link" href={`/p/${p.slug}/v/${to}`}>v{to}</Link>
      </h1>
      <p className="mt-1 text-sm text-muted">
        v{from}: {a.message || "—"} · v{to}: {b.message || "—"}
      </p>

      <form method="get" className="card mt-6 flex flex-wrap items-end gap-3" aria-label="Choose versions">
        <label className="text-sm">
          <span className="label">From</span>
          <select name="from" className="input !w-auto" defaultValue={String(from)}>
            {versions.map((v) => (
              <option key={v.number} value={v.number}>v{v.number}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">To</span>
          <select name="to" className="input !w-auto" defaultValue={String(to)}>
            {versions.map((v) => (
              <option key={v.number} value={v.number}>v{v.number}</option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">Compare</button>
        <Link className="btn" href={`/p/${p.slug}/versions`}>History</Link>
      </form>

      <section className="mt-8" aria-labelledby="spec-changes">
        <h2 id="spec-changes" className="text-xl font-semibold">Spec changes</h2>
        {specs.length === 0 && <p className="mt-2 text-sm text-muted">Neither version has specs.</p>}
        {specs.every((s) => s.status === "unchanged") && specs.length > 0 && <p className="mt-2 text-sm text-muted">The specs are identical.</p>}
        <ul className="mt-4 space-y-4">
          {specs.map((s, i) => (
            <li key={i} className="card">
              <h3 className="font-mono font-semibold">
                {s.beforeName && s.beforeName !== s.name ? `${s.beforeName} → ${s.name}` : s.name} <span className="badge ml-1 font-sans">{STATUS_LABEL[s.status]}</span>
              </h3>
              {s.status === "added" && <p className="mt-1 text-sm text-muted">New in v{to}.</p>}
              {s.status === "removed" && <p className="mt-1 text-sm text-muted">Not in v{to}.</p>}
              {s.entries.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Changes to {s.name} from v{from} to v{to}</caption>
                    <thead className="text-muted">
                      <tr>
                        <th scope="col" className="py-1 pr-4 font-medium">Field</th>
                        <th scope="col" className="py-1 pr-4 font-medium">v{from}</th>
                        <th scope="col" className="py-1 pr-4 font-medium">v{to}</th>
                        <th scope="col" className="py-1 font-medium">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.entries.map((e, k) => (
                        <tr key={k} className="border-t border-line align-top" data-op={e.op}>
                          <th scope="row" className="py-1 pr-4 font-mono text-xs font-normal">{formatPath(e.path)}</th>
                          <td className="py-1 pr-4 font-mono text-xs">{e.op === "added" ? <span className="text-muted">absent</span> : formatValue(e.before, e.unit)}</td>
                          <td className="py-1 pr-4 font-mono text-xs">{e.op === "removed" ? <span className="text-muted">absent</span> : formatValue(e.after, e.unit)}</td>
                          <td className="py-1 font-mono text-xs">{e.delta !== undefined ? formatDelta(e.delta, e.before, e.unit) : e.op}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="result-changes">
        <h2 id="result-changes" className="text-xl font-semibold">Results</h2>
        <p className="mt-1 text-sm text-muted">
          v{from} has {a.results.length} result{a.results.length === 1 ? "" : "s"}, v{to} has {b.results.length}. Spectra of the same spec and kind are overlaid below.
        </p>
        {overlays.length === 0 && <p className="mt-2 text-sm text-muted">No spectra to overlay: both versions need a spectrum or cross-section result of the same spec.</p>}
        <ul className="mt-4 space-y-6">
          {overlays.map((o) => (
            <li key={`${o.spec}-${o.kind}`} className="card">
              <h3 className="mb-3 font-semibold">
                {o.spec ?? "Results"} <span className="badge ml-1">{RESULT_KIND_LABELS[o.kind as ResultKind]}</span>
              </h3>
              <ResultOverlay
                title={`${p.title}: ${o.spec ?? o.kind}, v${from} and v${to}`}
                before={{ url: api(from, o.before.id), label: `v${from}` }}
                after={{ url: api(to, o.after.id), label: `v${to}` }}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
