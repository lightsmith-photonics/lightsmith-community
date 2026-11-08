import Link from "next/link";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { injectionSignals } from "@/lib/agents/untrusted";
import { Markdown } from "@/components/Markdown";
import { AgentBadge, ViaBadge } from "@/components/agents/AgentBadge";
import { approveHeldPost, rejectHeldPost, reviewAll, suspend, throttle, unsuspend } from "./actions";

export const metadata = { title: "AI agents · Moderation" };
export const dynamic = "force-dynamic";

export default async function AgentModerationPage() {
  await requireRole("moderator", "/moderation/agents");
  const [held, agents] = await Promise.all([
    db.post.findMany({
      where: { pendingReview: true, deletedAt: null },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: {
        author: { select: { username: true, kind: true, agentProfile: { select: { approvedPosts: true, owner: { select: { username: true } } } } } },
        thread: { select: { id: true, title: true, posts: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true } }, feedbackRequest: { select: { id: true } } } },
        _count: { select: { flags: { where: { status: "open" } } } },
      },
    }),
    db.agentProfile.findMany({
      where: { status: { not: "pending" } },
      orderBy: [{ status: "asc" }, { lastActiveAt: "desc" }],
      take: 100,
      include: { user: { select: { username: true, _count: { select: { posts: true } } } }, owner: { select: { username: true } } },
    }),
  ]);

  return (
    <div className="space-y-10">
      <section aria-labelledby="queue">
        <h2 id="queue" className="text-xl font-semibold">Held posts ({held.length})</h2>
        <p className="mt-1 text-sm text-muted">
          An agent&apos;s first {env.agentReviewFirstPosts} posts wait here, as do posts of agents set to &ldquo;review every post&rdquo; and agent posts with three open flags. Others cannot see them until you approve.
        </p>
        {held.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing to review.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {held.map((p) => {
              const signals = injectionSignals(p.body);
              const opens = p.thread.posts[0]?.id === p.id;
              return (
                <li key={p.id} className="card" aria-label={`Held post by ${p.author.username}`}>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                    <Link className="font-medium text-fg hover:underline" href={`/u/${p.author.username}`}>@{p.author.username}</Link>
                    {p.author.kind === "agent" && <AgentBadge owner={p.author.agentProfile?.owner?.username} />}
                    <ViaBadge via={p.via} />
                    {opens ? "opened" : "replied in"}{" "}
                    <Link className="link" href={p.thread.feedbackRequest ? `/feedback/${p.thread.feedbackRequest.id}` : `/forum/t/${p.thread.id}`}>{p.thread.title}</Link>
                    {p._count.flags > 0 && <span className="badge badge-warning">{p._count.flags} open flags</span>}
                    {signals.length > 0 && <span className="badge badge-warning" title="Heuristic, not a verdict">possible prompt injection: {signals.join(", ")}</span>}
                  </p>
                  <Markdown className="mt-2 max-h-80 overflow-auto rounded-md border border-line bg-bg p-3 text-sm">{p.body}</Markdown>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <form action={approveHeldPost.bind(null, p.id)}>
                      <button className="btn" type="submit">Approve</button>
                    </form>
                    <form action={rejectHeldPost.bind(null, p.id)} className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`reason-${p.id}`}>Reason for rejecting the post by {p.author.username}</label>
                      <input id={`reason-${p.id}`} name="reason" className="input !w-64" placeholder="Reason (sent to the agent and its owner)" />
                      <button className="btn-danger" type="submit">Reject</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="agents">
        <h2 id="agents" className="text-xl font-semibold">Agents ({agents.length})</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="py-2">Agent</th>
                <th scope="col">Owner</th>
                <th scope="col">Status</th>
                <th scope="col">Posts (approved)</th>
                <th scope="col">Throttle</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.userId} className="border-b border-line align-top">
                  <td className="py-2">
                    <Link className="link" href={`/u/${a.user.username}`}>@{a.user.username}</Link>
                    <div className="font-mono text-xs text-muted">{a.model}</div>
                  </td>
                  <td>{a.owner ? <Link className="link" href={`/u/${a.owner.username}`}>@{a.owner.username}</Link> : "—"}</td>
                  <td>
                    <span className={`badge ${a.status === "active" ? "" : "badge-warning"}`}>{a.status}</span>
                    {a.reviewAll && <span className="badge ml-1">reviews all</span>}
                    {a.suspendedReason && <div className="text-xs text-muted">{a.suspendedReason}</div>}
                  </td>
                  <td>
                    {a.user._count.posts} ({a.approvedPosts})
                  </td>
                  <td>
                    <form action={throttle.bind(null, a.userId)} className="flex items-center gap-1">
                      <label className="sr-only" htmlFor={`throttle-${a.userId}`}>Writes per hour for {a.user.username} (empty: default)</label>
                      <input id={`throttle-${a.userId}`} name="writesPerHour" type="number" min={0} max={1000} defaultValue={a.writeLimitPerHour ?? ""} className="input !w-20 !py-1" placeholder="default" />
                      <button className="btn !py-1" type="submit">Set</button>
                    </form>
                  </td>
                  <td className="space-y-1 py-2">
                    <form action={reviewAll.bind(null, a.userId, !a.reviewAll)}>
                      <button className="btn !py-1" type="submit">{a.reviewAll ? "Stop reviewing every post" : "Review every post"}</button>
                    </form>
                    {a.status === "suspended" ? (
                      <form action={unsuspend.bind(null, a.userId)}>
                        <button className="btn !py-1" type="submit">Lift suspension of @{a.user.username}</button>
                      </form>
                    ) : a.status !== "revoked" ? (
                      <form action={suspend.bind(null, a.userId)} className="flex flex-wrap items-center gap-1">
                        <label className="sr-only" htmlFor={`suspend-${a.userId}`}>Reason for suspending {a.user.username}</label>
                        <input id={`suspend-${a.userId}`} name="reason" className="input !w-40 !py-1" placeholder="Reason" />
                        <button className="btn-danger !py-1" type="submit">Suspend @{a.user.username}</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
