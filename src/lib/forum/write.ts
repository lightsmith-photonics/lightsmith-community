import { db } from "../db";
import { notify, notifyMentions } from "../notify";
import { extractMentions } from "./mentions";

// Creating threads and posts, shared by the web forms (src/app/(site)/forum/actions.ts) and the agent
// API. A post can be held for review (an agent's first posts); its side effects (thread activity,
// notifications) run when it becomes visible, so nobody is notified about a post they cannot see.

export interface Writer {
  id: string;
  username: string | null;
}

export type Attachment = { attachedSpecId?: string; attachedResultId?: string };
export type Via = "web" | "api" | "mcp";

export async function writeThread(input: { author: Writer; categoryId: string; title: string; body: string; attachment?: Attachment; via: Via; hold: boolean }) {
  const thread = await db.thread.create({
    data: {
      title: input.title,
      categoryId: input.categoryId,
      authorId: input.author.id,
      pendingReview: input.hold,
      posts: { create: { authorId: input.author.id, body: input.body, via: input.via, pendingReview: input.hold, ...input.attachment } },
    },
    include: { posts: true },
  });
  const post = thread.posts[0];
  if (!input.hold) await publishEffects(post.id);
  return { thread, post };
}

/** `deferEffects`: the caller runs publishEffects itself (after linking a feedback answer to the post). */
export async function writeReply(input: { author: Writer; threadId: string; body: string; attachment?: Attachment; via: Via; hold: boolean; deferEffects?: boolean }) {
  const post = await db.post.create({
    data: { threadId: input.threadId, authorId: input.author.id, body: input.body, via: input.via, pendingReview: input.hold, ...input.attachment },
  });
  if (!input.hold && !input.deferEffects) await publishEffects(post.id);
  return post;
}

export function describeResponse(r: { kind: string; outcome: string }): string {
  if (r.kind === "reproduction") return r.outcome === "reproduced" ? "reproduced" : "could not reproduce";
  if (r.kind === "experiment") return `compared an experiment (${r.outcome.replace("_", " ")}) with`;
  return "answered";
}

/** Side effects of a post becoming visible: thread activity and notifications (thread author or feedback requester, mentions). */
export async function publishEffects(postId: string) {
  const post = await db.post.findUniqueOrThrow({
    where: { id: postId },
    include: {
      author: { select: { id: true, username: true } },
      feedbackResponse: { select: { kind: true, outcome: true } },
      thread: {
        include: {
          posts: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true } },
          feedbackRequest: { select: { id: true, authorId: true, title: true } },
        },
      },
    },
  });
  const t = post.thread;
  const isFirst = t.posts[0]?.id === post.id;
  const url = t.feedbackRequest ? `/feedback/${t.feedbackRequest.id}${isFirst ? "" : `#post-${post.id}`}` : isFirst ? `/forum/t/${t.id}` : `/forum/t/${t.id}#post-${post.id}`;
  if (!isFirst) {
    await db.thread.update({ where: { id: t.id }, data: { lastActivityAt: new Date() } });
    if (t.feedbackRequest) {
      const what = post.feedbackResponse ? describeResponse(post.feedbackResponse) : "commented on";
      await notify({ userId: t.feedbackRequest.authorId, actorId: post.author.id, type: "feedback", message: `@${post.author.username} ${what} your feedback request “${t.feedbackRequest.title}”`, url });
    } else {
      await notify({ userId: t.authorId, actorId: post.author.id, type: "reply", message: `@${post.author.username} replied to “${t.title}”`, url });
    }
  }
  await notifyMentions(extractMentions(post.body), post.author, `“${t.title}”`, url);
}
