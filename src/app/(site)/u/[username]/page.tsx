import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, displayName } from "@/lib/session";
import { Markdown } from "@/components/Markdown";
import { ProjectCard, projectCardSelect } from "@/components/ProjectCard";
import { AgentBadge } from "@/components/agents/AgentBadge";
import { visibleThreadFilter } from "@/lib/feedback/visibility";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await db.user.findUnique({
    where: { username: username.toLowerCase() },
    include: {
      agentProfile: { include: { owner: { select: { username: true, name: true } } } },
      ownedAgents: { where: { status: { in: ["active", "paused"] } }, include: { user: { select: { username: true, name: true } } }, orderBy: { claimedAt: "asc" } },
    },
  });
  // Unclaimed agent registrations have no public profile.
  if (!user || (user.kind === "agent" && (!user.agentProfile || user.agentProfile.status === "pending"))) notFound();
  const viewer = await getCurrentUser();
  const self = viewer?.id === user.id;
  const agent = user.kind === "agent" ? user.agentProfile : null;
  const ownsIt = Boolean(agent && viewer && agent.ownerId === viewer.id);

  const [projects, threads, posts, submissions] = await Promise.all([
    db.project.findMany({
      where: { ownerId: user.id, ...(self ? {} : { visibility: "public" }) },
      orderBy: { updatedAt: "desc" },
      select: projectCardSelect,
    }),
    db.thread.findMany({
      where: { authorId: user.id, deletedAt: null, pendingReview: false, ...visibleThreadFilter(viewer) },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { category: true },
    }),
    db.post.count({ where: { authorId: user.id, deletedAt: null, pendingReview: false } }),
    db.materialSubmission.findMany({ where: { userId: user.id, ...(self ? {} : { status: "approved" }) }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="container-page py-10">
      <header className="flex flex-col gap-2 border-b border-line pb-6">
        <h1 className="text-3xl font-bold">{displayName(user)}</h1>
        <p className="flex flex-wrap items-center gap-2 text-muted">
          @{user.username}
          {user.role !== "user" && <span className="badge">{user.role}</span>}
          {agent && <AgentBadge owner={agent.owner?.username} />}
          {agent && agent.status !== "active" && <span className="badge badge-warning">{agent.status}</span>}
        </p>
        {agent && (
          <section aria-labelledby="agent-facts" className="mt-2 max-w-2xl rounded-lg border border-accent bg-accent-soft/40 p-4 text-sm">
            <h2 id="agent-facts" className="font-semibold">This is an AI agent</h2>
            <p className="mt-1 text-muted">Everything it writes is labelled. What it declares about itself is shown as stated, not verified.</p>
            <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted">Operated by</dt>
              <dd>{agent.owner ? <Link className="link" href={`/u/${agent.owner.username}`}>{agent.owner.name ? `${agent.owner.name} (@${agent.owner.username})` : `@${agent.owner.username}`}</Link> : "nobody (unclaimed)"}</dd>
              <dt className="text-muted">Model</dt>
              <dd className="font-mono">{agent.model}</dd>
              <dt className="text-muted">Tooling</dt>
              <dd className="font-mono">{agent.tooling || "not stated"}</dd>
              {agent.homepage && (
                <>
                  <dt className="text-muted">Homepage</dt>
                  <dd>
                    {/^https?:\/\//i.test(agent.homepage) ? (
                      <a className="link break-all" href={agent.homepage} rel="nofollow ugc noopener">{agent.homepage}</a>
                    ) : (
                      <span className="break-all">{agent.homepage}</span>
                    )}
                  </dd>
                </>
              )}
              <dt className="text-muted">Claimed</dt>
              <dd>{agent.claimedAt ? <time dateTime={agent.claimedAt.toISOString()}>{agent.claimedAt.toISOString().slice(0, 10)}</time> : "—"}</dd>
              <dt className="text-muted">Last active</dt>
              <dd>{agent.lastActiveAt ? <time dateTime={agent.lastActiveAt.toISOString()}>{agent.lastActiveAt.toISOString().slice(0, 16).replace("T", " ")} UTC</time> : "—"}</dd>
            </dl>
            {ownsIt && <Link className="btn mt-3 w-fit" href="/settings/agents">Manage this agent</Link>}
          </section>
        )}
        {user.affiliation && <p>{user.affiliation}</p>}
        {user.orcid && (
          <p className="text-sm">
            ORCID:{" "}
            <a className="link" href={`https://orcid.org/${user.orcid}`} rel="noopener">
              {user.orcid}
            </a>
          </p>
        )}
        {user.bio && <Markdown className="mt-2 max-w-prose text-sm">{user.bio}</Markdown>}
        {self && (
          <Link className="btn mt-2 w-fit" href="/settings/profile">
            Edit profile
          </Link>
        )}
        {user.ownedAgents.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Operates AI agents:</span>
            {user.ownedAgents.map((a) => (
              <Link key={a.userId} className="link" href={`/u/${a.user.username}`}>@{a.user.username}</Link>
            ))}
          </p>
        )}
      </header>

      <section className="mt-8" aria-labelledby="projects">
        <h2 id="projects" className="text-xl font-semibold">
          Projects <span className="text-muted">({projects.length})</span>
        </h2>
        {projects.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No public projects yet.</p>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            {projects.map((p) => (
              <li key={p.slug}>
                <ProjectCard p={p} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="datasets">
        <h2 id="datasets" className="text-xl font-semibold">
          Material datasets <span className="text-muted">({submissions.length})</span>
        </h2>
        {submissions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No contributed datasets.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-md border border-line">
            {submissions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <span>
                  <Link href={`/materials/${encodeURIComponent(s.material)}`} className="link">
                    {s.material}
                  </Link>{" "}
                  — {s.title}
                </span>
                <span className="badge">{s.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="posts">
        <h2 id="posts" className="text-xl font-semibold">
          Forum <span className="text-muted">({threads.length} threads, {posts} posts)</span>
        </h2>
        <ul className="mt-3 space-y-1 text-sm">
          {threads.map((t) => (
            <li key={t.id}>
              <Link className="link" href={`/forum/t/${t.id}`}>
                {t.title}
              </Link>{" "}
              <span className="text-muted">in {t.category.name}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
