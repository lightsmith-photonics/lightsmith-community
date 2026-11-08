import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, displayName } from "@/lib/session";
import { hasRole } from "@/lib/roles";
import { linkMentions, extractMentions } from "@/lib/forum/mentions";
import { attachmentOptions } from "@/lib/forum/attachments";
import { summarizeProblem, validateProblem } from "@/lib/problem/problem";
import { RESULT_KIND_LABELS, type ResultKind } from "@/lib/problem/result";
import { Markdown } from "@/components/Markdown";
import { ResultPanel } from "@/components/charts/ResultPanel";
import { FlagForm, ReplyForm } from "@/components/forum/PostComposer";
import { acceptAnswer, deletePost, flagPost, reply, setThreadFlag, vote } from "../../actions";
import { approveHeldPost, rejectHeldPost } from "../../../moderation/agents/actions";
import { AgentBadge, PendingBadge, ViaBadge, canSeeHeld, userTagSelect } from "@/components/agents/AgentBadge";
import { describeResponse } from "@/lib/forum/write";
import { threadProjectSelect, threadVisibleTo } from "@/lib/feedback/visibility";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await db.thread.findUnique({ where: { id }, include: { posts: { take: 1, orderBy: { createdAt: "asc" } }, feedbackRequest: threadProjectSelect } });
  if (!t || t.deletedAt || t.pendingReview || !threadVisibleTo(t, await getCurrentUser())) return {};
  return { title: t.title, description: t.posts[0]?.body.replace(/\s+/g, " ").slice(0, 160) };
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  const isMod = Boolean(me && hasRole(me.role, "moderator"));
  const thread = await db.thread.findUnique({
    where: { id },
    include: {
      category: true,
      author: { select: userTagSelect },
      feedbackRequest: { select: { id: true, status: true, ...threadProjectSelect.select } },
      posts: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { ...userTagSelect, role: true } },
          feedbackResponse: { select: { kind: true, outcome: true } },
          attachedSpec: { include: { project: { select: { slug: true, title: true, visibility: true } } } },
          attachedResult: { include: { project: { select: { slug: true, title: true, visibility: true } } } },
          votes: me ? { where: { userId: me.id }, select: { value: true } } : false,
        },
      },
    },
  });
  if (!thread || (thread.deletedAt && !isMod)) notFound();
  // A feedback thread goes with its project: the same rule as /feedback.
  if (!threadVisibleTo(thread, me)) notFound();
  // Held posts (an agent's first posts) are visible to moderators and the agent's owner only.
  if (thread.pendingReview && !canSeeHeld(thread.author, me, isMod)) notFound();
  thread.posts = thread.posts.filter((p) => !p.pendingReview || canSeeHeld(p.author, me, isMod));

  const allMentions = [...new Set(thread.posts.flatMap((p) => extractMentions(p.body)))];
  const known = new Set(
    (await db.user.findMany({ where: { username: { in: allMentions } }, select: { username: true } })).map((u) => u.username!),
  );
  const attachments = me ? await attachmentOptions(me.id) : [];
  const [first, ...replies] = thread.posts;
  // Accepted answer first, then by score, then by date.
  const ordered = [...replies].sort((a, b) =>
    a.id === thread.acceptedPostId ? -1 : b.id === thread.acceptedPostId ? 1 : b.score - a.score || +a.createdAt - +b.createdAt,
  );
  const canAccept = Boolean(me && (me.id === thread.authorId || isMod));

  const renderPost = (p: (typeof thread.posts)[number], isFirst: boolean) => {
    const myVote = Array.isArray(p.votes) ? (p.votes[0]?.value ?? 0) : 0;
    const accepted = thread.acceptedPostId === p.id;
    const deleted = Boolean(p.deletedAt);
    const isAgent = p.author.kind === "agent";
    return (
      <article
        key={p.id}
        id={`post-${p.id}`}
        className={`flex gap-4 rounded-lg border p-4 ${accepted ? "border-success" : p.pendingReview ? "border-dashed border-warning" : "border-line"}`}
        aria-label={`Post by ${p.author.username}${isAgent ? " (AI agent)" : ""}`}
        data-author-kind={p.author.kind}
      >
        <div className="flex w-10 shrink-0 flex-col items-center gap-1">
          {me && me.id !== p.author.id && !deleted && !p.pendingReview ? (
            <>
              <form action={vote.bind(null, p.id, 1)}>
                <button className={`btn !px-2 !py-0.5 ${myVote === 1 ? "!border-accent !text-accent" : ""}`} aria-pressed={myVote === 1} aria-label="Upvote" type="submit">▲</button>
              </form>
              <span className="font-semibold tabular-nums" aria-label={`Score ${p.score}`}>{p.score}</span>
              <form action={vote.bind(null, p.id, -1)}>
                <button className={`btn !px-2 !py-0.5 ${myVote === -1 ? "!border-danger !text-danger" : ""}`} aria-pressed={myVote === -1} aria-label="Downvote" type="submit">▼</button>
              </form>
            </>
          ) : (
            <span className="font-semibold tabular-nums" aria-label={`Score ${p.score}`}>{p.score}</span>
          )}
          {accepted && <span className="mt-1 text-xl text-success" role="img" aria-label="Accepted answer">✓</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">
            <Link className="font-medium text-fg hover:underline" href={`/u/${p.author.username}`}>{displayName(p.author)}</Link>{" "}
            @{p.author.username}
            {p.author.role !== "user" && <span className="badge ml-1">{p.author.role}</span>}
            {isAgent && <AgentBadge className="ml-1" owner={p.author.agentProfile?.owner?.username} />} <ViaBadge via={p.via} /> ·{" "}
            <time dateTime={p.createdAt.toISOString()}>{p.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</time>
            {accepted && <span className="badge ml-2 !text-success">accepted answer</span>}
            {p.pendingReview && !deleted && <PendingBadge />}
          </p>
          {isAgent && p.author.agentProfile?.owner && (
            <p className="text-xs text-muted">
              AI agent operated by <Link className="link" href={`/u/${p.author.agentProfile.owner.username}`}>@{p.author.agentProfile.owner.username}</Link>
            </p>
          )}
          {p.feedbackResponse && thread.feedbackRequest && (
            <p className="mt-1 text-sm">
              <Link className="badge hover:text-fg" href={`/feedback/${thread.feedbackRequest.id}#answer-${p.id}`}>
                {p.feedbackResponse.kind === "reproduction" ? "Re-run" : "Experiment"}: {describeResponse(p.feedbackResponse).replace(/ with$/, "")}
              </Link>
            </p>
          )}
          {deleted ? (
            <p className="mt-2 italic text-muted">This post was removed.</p>
          ) : (
            <Markdown className="mt-2">{linkMentions(p.body, known)}</Markdown>
          )}
          {!deleted && p.attachedSpec && (
            <div className="mt-3 rounded-md border border-line bg-bg p-3 text-sm">
              <p className="font-medium">
                Attached spec: <span className="font-mono">{p.attachedSpec.name}</span> from{" "}
                <Link className="link" href={`/p/${p.attachedSpec.project.slug}#spec-${p.attachedSpec.id}`}>{p.attachedSpec.project.title}</Link>
              </p>
              {(() => {
                const v = validateProblem(p.attachedSpec.json);
                return v.ok ? <p className="text-muted">{summarizeProblem(v.kind, v.problem)}</p> : null;
              })()}
            </div>
          )}
          {!deleted && p.attachedResult && (
            <div className="mt-3 rounded-md border border-line bg-bg p-3">
              <p className="mb-2 text-sm font-medium">
                Attached {RESULT_KIND_LABELS[p.attachedResult.kind as ResultKind]?.toLowerCase() ?? "result"}: {p.attachedResult.name} from{" "}
                <Link className="link" href={`/p/${p.attachedResult.project.slug}#result-${p.attachedResult.id}`}>{p.attachedResult.project.title}</Link>
              </p>
              <ResultPanel resultId={p.attachedResult.id} title={p.attachedResult.name} compact />
            </div>
          )}
          {!deleted && p.pendingReview && isMod && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-line p-2 text-xs" aria-label="Review this post">
              <form action={approveHeldPost.bind(null, p.id)}>
                <button className="btn !py-1" type="submit">Approve post</button>
              </form>
              <form action={rejectHeldPost.bind(null, p.id)} className="flex items-center gap-1">
                <label className="sr-only" htmlFor={`reject-${p.id}`}>Reason for rejecting</label>
                <input id={`reject-${p.id}`} name="reason" className="input !w-48 !py-1" placeholder="Reason (sent to the owner)" />
                <button className="btn-danger !py-1" type="submit">Reject</button>
              </form>
            </div>
          )}
          {!deleted && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              {canAccept && !isFirst && !p.pendingReview && (
                <form action={acceptAnswer.bind(null, thread.id, p.id)}>
                  <button className="link" type="submit">{accepted ? "Unaccept answer" : "Accept as answer"}</button>
                </form>
              )}
              {me && (me.id === p.author.id || isMod) && (
                <form action={deletePost.bind(null, p.id)}>
                  <button className="text-danger underline" type="submit">{isFirst ? "Delete thread" : "Delete"}</button>
                </form>
              )}
              {me && me.id !== p.author.id && (
                <details>
                  <summary className="cursor-pointer text-muted underline">Report</summary>
                  <FlagForm action={flagPost.bind(null, p.id)} />
                </details>
              )}
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="container-page max-w-4xl py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link className="hover:underline" href="/forum">Forum</Link> /{" "}
        <Link className="hover:underline" href={`/forum/${thread.category.slug}`}>{thread.category.name}</Link>
      </nav>
      {thread.feedbackRequest && (
        <p className="mt-3 rounded-md border border-line bg-surface p-3 text-sm">
          This thread discusses a <Link className="link" href={`/feedback/${thread.feedbackRequest.id}`}>feedback request</Link> ({thread.feedbackRequest.status}): the simulation, re-runs and
          experimental comparisons are there.
        </p>
      )}
      <h1 className="mt-2 text-3xl font-bold">
        {thread.title}
        {thread.locked && <span className="badge ml-3 align-middle">locked</span>}
        {thread.deletedAt && <span className="badge ml-3 align-middle !text-danger">deleted</span>}
      </h1>
      {isMod && (
        <div className="mt-3 flex flex-wrap gap-2 rounded-md border border-dashed border-line p-2 text-sm" aria-label="Moderator tools">
          <span className="self-center text-xs font-semibold text-muted">Moderator:</span>
          <form action={setThreadFlag.bind(null, thread.id, "locked", !thread.locked)}>
            <button className="btn !py-1" type="submit">{thread.locked ? "Unlock" : "Lock"}</button>
          </form>
          <form action={setThreadFlag.bind(null, thread.id, "pinned", !thread.pinned)}>
            <button className="btn !py-1" type="submit">{thread.pinned ? "Unpin" : "Pin"}</button>
          </form>
        </div>
      )}
      <div className="mt-6 space-y-4">
        {first && renderPost(first, true)}
        <h2 className="pt-4 text-lg font-semibold">
          {replies.filter((r) => !r.deletedAt).length} {replies.length === 1 ? "reply" : "replies"}
        </h2>
        {ordered.map((p) => renderPost(p, false))}
      </div>
      <section className="mt-8" aria-labelledby="reply">
        <h2 id="reply" className="sr-only">Reply</h2>
        {!me ? (
          <p className="card text-sm">
            <Link className="link" href={`/signin?callbackUrl=/forum/t/${thread.id}`}>Sign in</Link> to reply.
          </p>
        ) : thread.locked && !isMod ? (
          <p className="card text-sm text-muted">This thread is locked.</p>
        ) : (
          <ReplyForm action={reply.bind(null, thread.id)} attachments={attachments} />
        )}
      </section>
    </div>
  );
}
