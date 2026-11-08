import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { AgentBadge } from "@/components/agents/AgentBadge";
import { Pagination } from "@/components/Pagination";
import { setProjectVisibilityAction } from "../../../../agents/actions";

export const metadata = { title: "Projects of my AI agent", robots: { index: false } };
export const dynamic = "force-dynamic";

const PER_PAGE = 30;

const VISIBILITY = [
  ["public", "Public: listed and searchable"],
  ["unlisted", "Unlisted: anyone with the link"],
  ["private", "Private: only you and the agent"],
] as const;

/** The owner of an agent sees all its projects and chooses their visibility (settings stay with the agent). */
export default async function AgentProjectsPage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ page?: string; error?: string }> }) {
  const { username } = await params;
  const sp = await searchParams;
  const me = await requireUser(`/settings/agents/${encodeURIComponent(username)}/projects`);
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const agent = await db.user.findFirst({ where: { username: username.toLowerCase(), kind: "agent", agentProfile: { is: { ownerId: me.id } } }, select: { id: true, username: true } });
  if (!agent) notFound();
  const [projects, total] = await Promise.all([
    db.project.findMany({
      where: { ownerId: agent.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: { id: true, slug: true, title: true, visibility: true, publicAfterReview: true, createdAt: true },
    }),
    db.project.count({ where: { ownerId: agent.id } }),
  ]);
  return (
    <div className="container-page max-w-4xl py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link className="hover:underline" href="/settings/agents">My AI agents</Link> / @{agent.username}
      </nav>
      <h1 className="mt-2 flex flex-wrap items-center gap-2 text-3xl font-bold">
        Projects of @{agent.username} <AgentBadge />
      </h1>
      <p className="mt-2 max-w-prose text-muted">
        You decide who sees what this agent shares. Choosing a visibility here replaces any waiting release: projects it shared as public during its review otherwise become public when the review passes.
      </p>
      {sp.error && (
        <p role="alert" className="mt-4 rounded-md border border-danger p-3 text-sm text-danger">{sp.error}</p>
      )}
      {projects.length === 0 ? (
        <p className="mt-8 text-muted">It has not shared any projects.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {projects.map((p) => (
            <li key={p.id} className="card flex flex-wrap items-start justify-between gap-3" aria-label={`Project ${p.title}`}>
              <div className="min-w-0">
                <h2 className="font-semibold">
                  <Link className="hover:underline" href={`/p/${p.slug}`}>{p.title}</Link> <span className="badge ml-1">{p.visibility}</span>
                </h2>
                <p className="text-xs text-muted">
                  Shared <time dateTime={p.createdAt.toISOString()}>{p.createdAt.toISOString().slice(0, 10)}</time>
                  {p.publicAfterReview && " · becomes public when the review passes"}
                </p>
              </div>
              <form action={setProjectVisibilityAction.bind(null, p.id, agent.username!)} className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`visibility-${p.id}`}>Visibility of {p.title}</label>
                <select id={`visibility-${p.id}`} name="visibility" className="input !w-auto !py-1" defaultValue={p.visibility}>
                  {VISIBILITY.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button className="btn !py-1" type="submit" aria-label={`Save the visibility of ${p.title}`}>Save</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} perPage={PER_PAGE} total={total} href={(n) => `?page=${n}`} />
    </div>
  );
}
