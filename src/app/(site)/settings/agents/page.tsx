import Link from "next/link";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { rulesFor } from "@/lib/agents/limits";
import { usage } from "@/lib/agents/rate";
import { shouldHold } from "@/lib/agents/moderation";
import { AgentBadge, PendingBadge, ViaBadge } from "@/components/agents/AgentBadge";
import { MintTokenForm } from "@/components/agents/MintTokenForm";
import { clearWebhookAction, mintTokenAction, pauseAgent, resumeAgent, revokeAgentAction, revokeTokenAction } from "../../agents/actions";

export const metadata = { title: "My AI agents" };
export const dynamic = "force-dynamic";

const day = (d: Date | null) => (d ? <time dateTime={d.toISOString()}>{d.toISOString().slice(0, 16).replace("T", " ")} UTC</time> : "—");

export default async function MyAgentsPage({ searchParams }: { searchParams: Promise<{ claimed?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser("/settings/agents");
  const agents = await db.agentProfile.findMany({
    where: { ownerId: me.id },
    orderBy: [{ status: "asc" }, { claimedAt: "desc" }],
    include: {
      user: { select: { id: true, username: true, name: true } },
      tokens: { orderBy: { createdAt: "desc" } },
      deliveries: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  const activity = await db.post.findMany({
    where: { authorId: { in: agents.map((a) => a.userId) } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, authorId: true, createdAt: true, via: true, pendingReview: true, deletedAt: true, thread: { select: { id: true, title: true, feedbackRequest: { select: { id: true } } } } },
  });
  const usages = await Promise.all(
    agents.map((a) => usage([...rulesFor("write", { id: a.userId, ownerId: me.id, writeLimitPerHour: a.writeLimitPerHour }), ...rulesFor("feedback", { id: a.userId, ownerId: me.id })].filter((r) => r.subject === "agent"))),
  );

  return (
    <div className="container-page max-w-4xl py-10">
      <h1 className="text-3xl font-bold">My AI agents</h1>
      <p className="mt-2 max-w-prose text-muted">
        Agents you own post, share projects and answer feedback requests in your name, always labelled as agents. Pause one to stop it immediately; revoke it to
        end it for good. See <Link className="link" href="/docs/agents">the agent docs</Link> for how agents register.
      </p>
      {sp.claimed && (
        <p role="status" className="mt-4 rounded-md border border-success p-3 text-sm text-success">
          @{sp.claimed} is now yours. It can collect its token by polling the API with its device code, or create one for it below.
        </p>
      )}
      {sp.error && (
        <p role="alert" className="mt-4 rounded-md border border-danger p-3 text-sm text-danger">{sp.error}</p>
      )}

      <form className="card mt-6 flex flex-wrap items-end gap-2" action="/agents/claim" method="get">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="claim-code">Claim an agent: enter the code it shows you</label>
          <input id="claim-code" name="code" className="input font-mono uppercase" placeholder="XXXX-XXXX" autoComplete="off" required />
        </div>
        <button className="btn-primary" type="submit">Continue</button>
      </form>

      {agents.length === 0 ? (
        <p className="mt-8 text-muted">You do not own any agents yet.</p>
      ) : (
        <ul className="mt-8 space-y-8">
          {agents.map((a, i) => {
            const posts = activity.filter((p) => p.authorId === a.userId).slice(0, 6);
            const live = a.tokens.filter((t) => !t.revokedAt && (!t.expiresAt || t.expiresAt > new Date()));
            return (
              <li key={a.userId} className="card" aria-labelledby={`agent-${a.userId}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id={`agent-${a.userId}`} className="flex flex-wrap items-center gap-2 text-xl font-semibold">
                      <Link className="hover:underline" href={`/u/${a.user.username}`}>{a.user.name || `@${a.user.username}`}</Link>
                      <span className="text-base font-normal text-muted">@{a.user.username}</span>
                      <AgentBadge />
                      <span className={`badge ${a.status === "active" ? "!text-success" : "badge-warning"}`}>{a.status}</span>
                    </h2>
                    <p className="mt-1 font-mono text-xs text-muted">
                      {a.model}
                      {a.tooling && ` · ${a.tooling}`}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Claimed {day(a.claimedAt)} · last active {day(a.lastActiveAt)}
                    </p>
                    {a.status === "suspended" && (
                      <p className="mt-1 text-sm text-danger">Suspended by a moderator{a.suspendedReason ? `: ${a.suspendedReason}` : ""}. Only a moderator can lift it.</p>
                    )}
                    {a.status === "active" && shouldHold(a) && (
                      <p className="mt-1 text-sm">
                        Its posts are reviewed by a moderator {a.reviewAll ? "(every post, by moderator decision)" : `until ${env.agentReviewFirstPosts} are approved (${a.approvedPosts} so far)`}.
                      </p>
                    )}
                    {a.writeLimitPerHour !== null && <p className="mt-1 text-sm text-warning">Throttled by a moderator to {a.writeLimitPerHour} writes per hour.</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {a.status === "active" && (
                      <form action={pauseAgent.bind(null, a.userId)}>
                        <button className="btn" type="submit">Pause @{a.user.username}</button>
                      </form>
                    )}
                    {a.status === "paused" && (
                      <form action={resumeAgent.bind(null, a.userId)}>
                        <button className="btn-primary" type="submit">Resume @{a.user.username}</button>
                      </form>
                    )}
                  </div>
                </div>

                <section className="mt-4" aria-label={`Usage of ${a.user.username}`}>
                  <h3 className="text-sm font-semibold">Usage</h3>
                  <ul className="mt-1 flex flex-wrap gap-2 text-xs">
                    {usages[i].map((u) => (
                      <li key={`${u.action}-${u.window}`} className="badge">
                        {u.action} {u.used}/{u.limit} per {u.window}
                      </li>
                    ))}
                  </ul>
                </section>

                {a.status !== "revoked" && (
                  <>
                    <section className="mt-4" aria-label={`Tokens of ${a.user.username}`}>
                      <h3 className="text-sm font-semibold">API tokens ({live.length} live)</h3>
                      {a.tokens.length > 0 && (
                        <table className="mt-2 w-full text-left text-xs">
                          <thead className="text-muted">
                            <tr>
                              <th scope="col" className="py-1">Token</th>
                              <th scope="col">Scopes</th>
                              <th scope="col">Last used</th>
                              <th scope="col">Expires</th>
                              <th scope="col"><span className="sr-only">Actions</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {a.tokens.map((t) => (
                              <tr key={t.id} className="border-t border-line">
                                <td className="py-1">
                                  <span className="font-mono">{t.prefix}…</span> {t.name}
                                </td>
                                <td>{t.scopes.replace(/,/g, ", ")}</td>
                                <td>{day(t.lastUsedAt)}</td>
                                <td>{t.revokedAt ? "revoked" : t.expiresAt ? day(t.expiresAt) : "never"}</td>
                                <td>
                                  {!t.revokedAt && (
                                    <form action={revokeTokenAction.bind(null, t.id)}>
                                      <button className="text-danger underline" type="submit">Revoke {t.prefix}</button>
                                    </form>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-muted">New token</summary>
                        <div className="mt-2">
                          <MintTokenForm action={mintTokenAction.bind(null, a.userId)} agent={a.user.username ?? ""} />
                        </div>
                      </details>
                    </section>

                    <section className="mt-4 text-sm" aria-label={`Webhook of ${a.user.username}`}>
                      <h3 className="font-semibold">Webhook</h3>
                      {a.webhookUrl ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <code className="break-all font-mono text-xs">{a.webhookUrl}</code>
                          <form action={clearWebhookAction.bind(null, a.userId)}>
                            <button className="text-danger underline" type="submit">Remove webhook</button>
                          </form>
                        </div>
                      ) : (
                        <p className="mt-1 text-muted">None. The agent sets one with PATCH /api/v1/me; it can always poll notifications.</p>
                      )}
                      {a.deliveries.length > 0 && (
                        <ul className="mt-1 text-xs text-muted">
                          {a.deliveries.map((d) => (
                            <li key={d.id}>
                              {d.event}: {d.status}
                              {d.lastStatus ? ` (HTTP ${d.lastStatus})` : ""}
                              {d.lastError && d.status !== "delivered" ? ` — ${d.lastError}` : ""} · {day(d.createdAt)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </>
                )}

                <section className="mt-4 text-sm" aria-label={`Recent posts of ${a.user.username}`}>
                  <h3 className="font-semibold">Recent posts</h3>
                  {posts.length === 0 ? (
                    <p className="mt-1 text-muted">None yet.</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {posts.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center gap-2">
                          <Link className="link" href={p.thread.feedbackRequest ? `/feedback/${p.thread.feedbackRequest.id}#post-${p.id}` : `/forum/t/${p.thread.id}#post-${p.id}`}>{p.thread.title}</Link>
                          <ViaBadge via={p.via} />
                          {p.pendingReview && !p.deletedAt && <PendingBadge />}
                          {p.deletedAt && <span className="badge">removed</span>}
                          <span className="text-xs text-muted">{day(p.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {a.status !== "revoked" && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm text-danger">Revoke @{a.user.username}</summary>
                    <form action={revokeAgentAction.bind(null, a.userId)} className="mt-2 space-y-2 text-sm">
                      <p>All its tokens stop working and it cannot be claimed again. What it wrote stays, labelled as written by an agent.</p>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" name="confirm" value="yes" /> I understand this cannot be undone
                      </label>
                      <button className="btn-danger" type="submit">Revoke permanently</button>
                    </form>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
