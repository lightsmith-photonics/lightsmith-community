import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listVersions, loadProjectForVersions } from "@/lib/projects";
import { defaultMessage } from "@/lib/versions/snapshot";
import { VersionNav, utcTime } from "@/components/projects/VersionNav";
import { UserTag } from "@/components/agents/AgentBadge";
import { forkProject } from "../../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await loadProjectForVersions(slug, await getCurrentUser());
  return p ? { title: `History · ${p.title}`, robots: p.visibility === "public" ? undefined : { index: false } } : {};
}

export default async function VersionHistory({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await getCurrentUser();
  const p = await loadProjectForVersions(slug, me);
  if (!p) notFound();
  const versions = await listVersions(p.id);
  const current = p.currentVersion?.number ?? versions[0]?.number ?? 0;

  return (
    <div className="container-page py-10">
      <VersionNav project={p} here="History" />
      <h1 className="mt-1 text-3xl font-bold">Version history</h1>
      <p className="mt-2 max-w-prose text-muted">
        Every save of this project&apos;s specs is kept as an immutable version with a permanent link. Restoring an old version adds it again as the newest one.
      </p>

      {versions.length > 1 && (
        <form action={`/p/${p.slug}/diff`} method="get" className="card mt-6 flex flex-wrap items-end gap-3" aria-label="Compare versions">
          <label className="text-sm">
            <span className="label">From</span>
            <select name="from" className="input !w-auto" defaultValue={String(Math.max(1, current - 1))}>
              {versions.map((v) => (
                <option key={v.number} value={v.number}>v{v.number}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">To</span>
            <select name="to" className="input !w-auto" defaultValue={String(current)}>
              {versions.map((v) => (
                <option key={v.number} value={v.number}>v{v.number}</option>
              ))}
            </select>
          </label>
          <button className="btn-primary" type="submit">Compare</button>
        </form>
      )}

      <ol className="mt-6 space-y-3" aria-label="Versions, newest first">
        {versions.map((v) => (
          <li key={v.id} className="card" id={`v${v.number}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">
                  <Link className="link" href={`/p/${p.slug}/v/${v.number}`}>v{v.number}</Link> <span className="font-normal">{v.message || defaultMessage(v)}</span>
                  {v.number === current && <span className="badge ml-2">current</span>}
                  {v.restoredFrom && <span className="badge ml-2">restored from v{v.restoredFrom}</span>}
                </h2>
                <p className="text-sm text-muted">
                  {v.author ? <UserTag user={v.author} /> : "deleted user"} ·{" "}
                  <time dateTime={v.createdAt.toISOString()}>{utcTime(v.createdAt)}</time> · {v.specs.length} spec{v.specs.length === 1 ? "" : "s"}
                  {v.specs.length > 0 && <> ({v.specs.map((s) => s.name).join(", ")})</>} · {v._count.results} result{v._count.results === 1 ? "" : "s"}
                  {v._count.forks > 0 && <> · {v._count.forks} fork{v._count.forks === 1 ? "" : "s"}</>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {v.number > 1 && (
                  <Link className="btn" href={`/p/${p.slug}/diff?from=${v.number - 1}&to=${v.number}`} aria-label={`Changes in v${v.number}`}>
                    Changes
                  </Link>
                )}
                {me && (
                  <form action={forkProject.bind(null, p.id, v.number)}>
                    <button className="btn" type="submit" aria-label={`Fork v${v.number}`}>Fork</button>
                  </form>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
