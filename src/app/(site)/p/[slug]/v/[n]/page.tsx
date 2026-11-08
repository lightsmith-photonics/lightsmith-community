import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadProjectForVersions, loadVersion } from "@/lib/projects";
import { canContribute } from "@/lib/roles";
import { env } from "@/lib/env";
import { studioLink } from "@/lib/studio";
import { KIND_LABELS, isProblemKind, summarizeProblem, validateProblem } from "@/lib/problem/problem";
import { RESULT_KIND_LABELS, type ResultKind } from "@/lib/problem/result";
import { readPreview } from "@/lib/results-store";
import { defaultMessage, specJson } from "@/lib/versions/snapshot";
import { parseVersionNumber } from "@/lib/versions/api";
import { ResultPanel } from "@/components/charts/ResultPanel";
import { CodeBlock } from "@/components/CodeBlock";
import { CopyButton } from "@/components/CopyButton";
import { RestoreForm } from "@/components/projects/VersionForms";
import { VersionNav, utcTime } from "@/components/projects/VersionNav";
import { UserTag } from "@/components/agents/AgentBadge";
import { forkProject, restoreVersionAction } from "../../../actions";

export const dynamic = "force-dynamic";

async function load(slug: string, n: string) {
  const me = await getCurrentUser();
  const p = await loadProjectForVersions(slug, me);
  const number = parseVersionNumber(n);
  const v = p && number ? await loadVersion(p.id, number) : null;
  return p && v ? { me, p, v } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; n: string }> }) {
  const { slug, n } = await params;
  const x = await load(slug, n);
  if (!x) return {};
  return { title: `${x.p.title} v${x.v.number}`, robots: x.p.visibility === "public" ? undefined : { index: false } };
}

export default async function VersionPage({ params }: { params: Promise<{ slug: string; n: string }> }) {
  const { slug, n } = await params;
  const x = await load(slug, n);
  if (!x) notFound();
  const { me, p, v } = x;
  const current = p.currentVersion?.number ?? null;
  const isCurrent = v.number === current;
  const permalink = `${env.siteUrl}/p/${p.slug}/v/${v.number}`;
  const apiBase = `/api/projects/${p.slug}/versions/${v.number}`;

  return (
    <div className="container-page py-10">
      <header className="border-b border-line pb-6">
        <VersionNav project={p} here={`v${v.number}`} />
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              {p.title} <span className="text-muted">v{v.number}</span>
            </h1>
            <p className="mt-1">{v.message || defaultMessage(v)}</p>
            <p className="mt-1 text-sm text-muted">
              {v.author ? <UserTag user={v.author} /> : "deleted user"} ·{" "}
              <time dateTime={v.createdAt.toISOString()}>{utcTime(v.createdAt)}</time>
              {v.restoredFrom && (
                <>
                  {" "}· restored from <Link className="link" href={`/p/${p.slug}/v/${v.restoredFrom}`}>v{v.restoredFrom}</Link>
                </>
              )}
            </p>
            {isCurrent ? (
              <p className="mt-2"><span className="badge">current version</span></p>
            ) : (
              <p className="mt-2 text-sm" role="note">
                This is an earlier version. The project is at{" "}
                <Link className="link" href={current ? `/p/${p.slug}/v/${current}` : `/p/${p.slug}`}>v{current}</Link>.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn" href={`/p/${p.slug}/versions`}>History</Link>
            {v.number > 1 && <Link className="btn" href={`/p/${p.slug}/diff?from=${v.number - 1}&to=${v.number}`}>Changes in v{v.number}</Link>}
            {!isCurrent && current && <Link className="btn" href={`/p/${p.slug}/diff?from=${v.number}&to=${current}`}>Compare with current</Link>}
            {me && (
              <form action={forkProject.bind(null, p.id, v.number)}>
                <button className="btn" type="submit">Fork v{v.number}</button>
              </form>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Permalink:</span>
          <code className="rounded bg-surface-2 px-2 py-0.5">{permalink}</code>
          <CopyButton text={permalink} label="Copy link" />
        </div>
        {!isCurrent && canContribute(p, me) && (
          <div className="card mt-4">
            <RestoreForm action={restoreVersionAction.bind(null, p.id, v.number)} number={v.number} />
          </div>
        )}
      </header>

      <section className="mt-8" aria-labelledby="specs">
        <h2 id="specs" className="text-xl font-semibold">Problem specs ({v.specs.length})</h2>
        {v.specs.length === 0 && <p className="mt-2 text-sm text-muted">This version has no specs.</p>}
        <ul className="mt-4 space-y-4">
          {v.specs.map((s, i) => {
            const json = specJson(s);
            const check = validateProblem(s.problem);
            const kind = isProblemKind(s.kind) ? s.kind : "scattering";
            const studio = studioLink({
              studioUrl: env.studioUrl,
              siteUrl: env.siteUrl,
              specUrl: `${env.siteUrl}${apiBase}/specs/${i}`,
              specJson: json,
              name: `${s.name} (v${v.number})`,
              projectUrl: permalink,
              allowUrl: p.visibility !== "private",
            });
            return (
              <li key={i} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-mono font-semibold">
                      {s.name} <span className="badge ml-1 font-sans">{KIND_LABELS[kind]}</span>
                    </h3>
                    {check.ok ? (
                      <p className="text-sm text-muted">{summarizeProblem(check.kind, check.problem)}</p>
                    ) : (
                      <p className="text-sm text-muted">Does not validate against the current schema: {check.issues[0]?.path} {check.issues[0]?.message}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a className="btn" href={studio} target="_blank" rel="noopener" aria-label={`Open ${s.name} v${v.number} in Studio`}>Open in Studio</a>
                    <a className="btn" href={`${apiBase}/specs/${i}`} download={`${s.name}-v${v.number}.json`}>Download</a>
                  </div>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-muted">JSON</summary>
                  <div className="mt-2">
                    <CodeBlock code={json} label={`Spec ${s.name} v${v.number}`} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="results">
        <h2 id="results" className="text-xl font-semibold">Results ({v.results.length})</h2>
        {v.results.length === 0 && <p className="mt-2 text-sm text-muted">No results are linked to this version.</p>}
        <ul className="mt-4 space-y-6">
          {v.results.map((r) => {
            const preview = readPreview(r.preview);
            return (
              <li key={r.id} className="card">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">
                      {r.name} <span className="badge ml-1">{RESULT_KIND_LABELS[r.kind as ResultKind] ?? r.kind}</span>
                    </h3>
                    <p className="text-sm text-muted">
                      {r.method} via {r.backend}
                      {r.specName && <> · from {r.specName}</>}
                      {preview && <> · {preview.headline}</>}
                    </p>
                  </div>
                  <a className="btn" href={`${apiBase}/results/${r.id}`} download={`${r.name}.json`}>Download JSON</a>
                </div>
                <ResultPanel resultId={r.id} src={`${apiBase}/results/${r.id}`} title={`${p.title} v${v.number}: ${r.name}`} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
