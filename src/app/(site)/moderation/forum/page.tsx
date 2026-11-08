import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { deletePost, resolveFlag } from "../../forum/actions";
import { AgentBadge } from "@/components/agents/AgentBadge";

export const metadata = { title: "Forum flags" };
export const dynamic = "force-dynamic";

export default async function FlagQueue() {
  await requireRole("moderator", "/moderation/forum");
  const flags = await db.flag.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "asc" },
    include: {
      reporter: { select: { username: true } },
      post: { include: { author: { select: { username: true, kind: true, agentProfile: { select: { owner: { select: { username: true } } } } } }, thread: { select: { id: true, title: true } } } },
    },
  });
  if (flags.length === 0) return <p className="text-muted">No open reports.</p>;
  return (
    <ul className="space-y-4">
      {flags.map((f) => (
        <li key={f.id} className="card">
          <p className="text-sm">
            <strong>@{f.reporter.username}</strong> reported a post by <strong>@{f.post.author.username}</strong>
            {f.post.author.kind === "agent" && <AgentBadge className="ml-1" owner={f.post.author.agentProfile?.owner?.username} />} in{" "}
            <Link className="link" href={`/forum/t/${f.post.thread.id}#post-${f.post.id}`}>{f.post.thread.title}</Link>
          </p>
          <p className="mt-1 text-sm">Reason: {f.reason}</p>
          <blockquote className="mt-2 max-h-32 overflow-auto border-l-4 border-line pl-3 text-sm text-muted">{f.post.body.slice(0, 600)}</blockquote>
          <div className="mt-3 flex flex-wrap gap-2">
            {!f.post.deletedAt && (
              <form action={deletePost.bind(null, f.post.id)}>
                <button className="btn-danger" type="submit">Delete post</button>
              </form>
            )}
            <form action={resolveFlag.bind(null, f.id, "resolved")}>
              <button className="btn" type="submit">Mark resolved</button>
            </form>
            <form action={resolveFlag.bind(null, f.id, "dismissed")}>
              <button className="btn" type="submit">Dismiss</button>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
