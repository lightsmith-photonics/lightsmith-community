import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadProject } from "@/lib/projects";
import { canContribute, canEditProject, operatesOwner } from "@/lib/roles";
import { env, computeMocked } from "@/lib/env";
import { brand } from "@/lib/brand";
import { studioLink } from "@/lib/studio";
import { KIND_LABELS, isProblemKind, summarizeProblem, validateProblem } from "@/lib/problem/problem";
import { RESULT_KIND_LABELS, type ResultKind } from "@/lib/problem/result";
import { readPreview } from "@/lib/results-store";
import { Markdown } from "@/components/Markdown";
import { ResultPanel } from "@/components/charts/ResultPanel";
import { CodeBlock } from "@/components/CodeBlock";
import { CopyButton } from "@/components/CopyButton";
import { SpecEditor } from "@/components/projects/SpecEditor";
import { ResultUpload } from "@/components/projects/ResultUpload";
import { RunButton } from "@/components/projects/RunButton";
import { deleteResult, deleteSpec, forkProject, saveSpec, toggleStar, uploadResult } from "../actions";
import { AgentBadge } from "@/components/agents/AgentBadge";

export const dynamic = "force-dynamic";

const MOCK_KINDS = new Set(["scattering", "layer_stack"]);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await loadProject(slug, await getCurrentUser());
  if (!p) return {};
  return {
    title: p.title,
    description: p.description || `Photonics simulation project by @${p.owner.username}`,
    robots: p.visibility === "public" ? undefined : { index: false },
    openGraph: { title: p.title, description: p.description, url: `/p/${p.slug}` },
    twitter: { card: "summary_large_image" },
  };
}

const kb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`);

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await getCurrentUser();
  const p = await loadProject(slug, me);
  if (!p) notFound();
  const isOwner = canEditProject(p, me);
  // Owner and collaborators change specs and results; every spec save is a new version.
  const canEdit = canContribute(p, me);
  const version = p.currentVersion?.number;
  const permalink = `${env.siteUrl}/p/${p.slug}`;
  const mocked = computeMocked();

  return (
    <div className="container-page py-10">
      <header className="border-b border-line pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted">
              <Link href={`/u/${p.owner.username}`} className="hover:underline">@{p.owner.username}</Link>
              {p.owner.kind === "agent" && (
                <>
                  {" "}
                  <AgentBadge owner={p.owner.agentProfile?.owner?.username} />
                </>
              )}{" "}
              / <span className="badge">{p.visibility}</span>
              {operatesOwner(p, me) && (
                <>
                  {" "}
                  <Link className="link" href={`/settings/agents/${p.owner.username}/projects`}>Change visibility</Link>
                </>
              )}
              {version && (
                <>
                  {" "}
                  <Link className="badge hover:text-fg" href={`/p/${p.slug}/v/${version}`} aria-label={`Current version v${version}`}>v{version}</Link>
                </>
              )}
            </p>
            <h1 className="mt-1 text-3xl font-bold">{p.title}</h1>
            {p.forkedFrom && (
              <p className="mt-1 text-sm text-muted">
                Forked from{" "}
                <Link className="link" href={`/p/${p.forkedFrom.slug}`}>
                  @{p.forkedFrom.owner.username}/{p.forkedFrom.title}
                </Link>
                {p.forkedFromVersion && (
                  <>
                    {" "}
                    <Link className="link" href={`/p/${p.forkedFrom.slug}/v/${p.forkedFromVersion.number}`}>v{p.forkedFromVersion.number}</Link>
                  </>
                )}
              </p>
            )}
            {p.collaborators.length > 0 && (
              <p className="mt-1 text-sm text-muted">
                With{" "}
                {p.collaborators.map((c, i) => (
                  <span key={c.userId}>
                    {i > 0 && ", "}
                    <Link className="hover:underline" href={`/u/${c.user.username}`}>@{c.user.username}</Link>
                  </span>
                ))}
              </p>
            )}
            {p.description && <p className="mt-2 max-w-prose text-muted">{p.description}</p>}
            {p.tags && (
              <ul className="mt-2 flex flex-wrap gap-1" aria-label="Tags">
                {p.tags.split(",").map((t) => (
                  <li key={t}>
                    <Link className="badge hover:text-fg" href={`/projects?tag=${encodeURIComponent(t)}`}>{t}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {me ? (
              <form action={toggleStar.bind(null, p.id)}>
                <button className="btn" type="submit" aria-pressed={p.starred}>
                  {p.starred ? "★ Starred" : "☆ Star"} <span className="badge">{p._count.stars}</span>
                </button>
              </form>
            ) : (
              <Link className="btn" href={`/signin?callbackUrl=/p/${p.slug}`}>
                ☆ Star <span className="badge">{p._count.stars}</span>
              </Link>
            )}
            <Link className="btn" href={`/p/${p.slug}/versions`}>
              History <span className="badge">{p._count.versions}</span>
            </Link>
            {me && (
              <form action={forkProject.bind(null, p.id, null)}>
                <button className="btn" type="submit">
                  Fork <span className="badge">{p._count.forks}</span>
                </button>
              </form>
            )}
            {isOwner && <Link className="btn" href={`/p/${p.slug}/settings`}>Settings</Link>}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Permalink:</span>
          <code className="rounded bg-surface-2 px-2 py-0.5">{permalink}</code>
          <CopyButton text={permalink} label="Copy link" />
        </div>
      </header>

      <section className="mt-8" aria-labelledby="specs">
        <h2 id="specs" className="text-xl font-semibold">Problem specs ({p.specs.length})</h2>
        {p.specs.length === 0 && <p className="mt-2 text-sm text-muted">No specs yet.</p>}
        <ul className="mt-4 space-y-4">
          {p.specs.map((s) => {
            const v = validateProblem(s.json);
            const kind = isProblemKind(s.kind) ? s.kind : "scattering";
            const studio = studioLink({ studioUrl: env.studioUrl, siteUrl: env.siteUrl, specId: s.id, specJson: s.json, name: s.name, projectUrl: permalink, allowUrl: p.visibility !== "private" });
            const runnable = v.ok && (!mocked || MOCK_KINDS.has(kind));
            return (
              <li key={s.id} className="card" id={`spec-${s.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-mono font-semibold">
                      {s.name} <span className="badge ml-1 font-sans">{KIND_LABELS[kind]}</span>
                    </h3>
                    {v.ok ? (
                      <p className="text-sm text-muted">{summarizeProblem(v.kind, v.problem)}</p>
                    ) : (
                      <p className="text-sm text-danger">Does not validate against the current schema: {v.issues[0]?.path} {v.issues[0]?.message}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a className="btn" href={studio} target="_blank" rel="noopener">Open in Studio</a>
                    <a className="btn" href={`/api/specs/${s.id}`} download={`${s.name}.json`}>Download</a>
                    {canEdit && (
                      <form action={deleteSpec.bind(null, p.id, s.id)}>
                        <button className="btn-danger" type="submit" aria-label={`Delete spec ${s.name}`}>Delete</button>
                      </form>
                    )}
                  </div>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-muted">JSON</summary>
                  <div className="mt-2">
                    <CodeBlock code={s.json} label={`Spec ${s.name}`} />
                  </div>
                </details>
                {canEdit && (
                  <>
                    <div className="mt-3">
                      <RunButton specId={s.id} disabled={!runnable} />
                      {v.ok && !runnable && (
                        <p className="mt-1 text-xs text-muted">
                          The built-in mock runner solves scattering and thin-film problems only. Connect {brand.cloud} (<code>COMPUTE_API_URL</code>) to run{" "}
                          {KIND_LABELS[kind].toLowerCase()} problems.
                        </p>
                      )}
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-muted">Edit</summary>
                      <div className="mt-2">
                        <SpecEditor action={saveSpec.bind(null, p.id, s.id)} defaultName={s.name} defaultJson={s.json} submitLabel="Update spec" withMessage />
                      </div>
                    </details>
                  </>
                )}
                {!canEdit && me && <p className="mt-3 text-xs text-muted">Fork this project to run or change its specs.</p>}
              </li>
            );
          })}
        </ul>
        {canEdit && (
          <details className="card mt-4">
            <summary className="cursor-pointer font-medium">Add a spec</summary>
            <div className="mt-3">
              <SpecEditor action={saveSpec.bind(null, p.id, null)} submitLabel="Add spec" withMessage />
            </div>
          </details>
        )}
      </section>

      {p.feedback.length > 0 && (
        <section className="mt-10" aria-labelledby="feedback">
          <h2 id="feedback" className="text-xl font-semibold">Feedback requests ({p.feedback.length})</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {p.feedback.map((f) => (
              <li key={f.id}>
                <Link className="link" href={`/feedback/${f.id}`}>{f.title}</Link> <span className="badge">{f.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10" aria-labelledby="results">
        <h2 id="results" className="text-xl font-semibold">Results ({p.results.length})</h2>
        {p.results.length === 0 && <p className="mt-2 text-sm text-muted">No results yet. Run a spec or upload a result JSON.</p>}
        <ul className="mt-4 space-y-6">
          {p.results.map((r) => {
            const preview = readPreview(r.preview);
            const embed = `<iframe src="${env.siteUrl}/embed/results/${r.id}" width="760" height="460" style="border:0" title="${r.name.replace(/"/g, "&quot;")} — ${brand.community}" loading="lazy"></iframe>`;
            return (
              <li key={r.id} className="card" id={`result-${r.id}`}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">
                      {r.name} <span className="badge ml-1">{RESULT_KIND_LABELS[r.kind as ResultKind] ?? r.kind}</span>
                    </h3>
                    <p className="text-sm text-muted">
                      {r.method} via {r.backend}
                      {r.spec && (
                        <>
                          {" "}· from <a className="link" href={`#spec-${r.spec.id}`}>{r.spec.name}</a>
                        </>
                      )}
                      {preview && <> · {preview.headline}</>} · {kb(r.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a className="btn" href={`/api/results/${r.id}`} download={`${r.name}.json`}>Download JSON</a>
                    {canEdit && p.visibility !== "private" && (
                      <Link className="btn" href={`/feedback/new?project=${p.slug}&spec=${r.spec?.id ?? ""}&result=${r.id}`} aria-label={`Ask for feedback on ${r.name}`}>Ask for feedback</Link>
                    )}
                    {canEdit && (
                      <form action={deleteResult.bind(null, p.id, r.id)}>
                        <button className="btn-danger" type="submit" aria-label={`Delete result ${r.name}`}>Delete</button>
                      </form>
                    )}
                  </div>
                </div>
                <ResultPanel resultId={r.id} title={`${p.title}: ${r.name}`} />
                {p.visibility !== "private" && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-muted">Embed this plot</summary>
                    <div className="mt-2">
                      <CodeBlock code={embed} label="Embed code" />
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
        {canEdit && (
          <details className="card mt-4">
            <summary className="cursor-pointer font-medium">Upload a result</summary>
            <div className="mt-3">
              <ResultUpload action={uploadResult.bind(null, p.id)} specs={p.specs.map((s) => ({ id: s.id, name: s.name }))} />
            </div>
          </details>
        )}
      </section>

      <section className="mt-10" aria-labelledby="notes">
        <h2 id="notes" className="text-xl font-semibold">Notes</h2>
        {p.notes ? <Markdown className="mt-3">{p.notes}</Markdown> : <p className="mt-2 text-sm text-muted">No notes.{isOwner && " Add some in Settings."}</p>}
      </section>
    </div>
  );
}
