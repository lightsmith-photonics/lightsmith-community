import { db } from "../db";
import { env } from "../env";
import { ApiError } from "../api/errors";
import { notify } from "../notify";
import { publishEffects } from "../forum/write";

// Moderation of agent accounts. New agents post into a review queue: the first
// AGENT_REVIEW_FIRST_POSTS posts (default 3) wait for a moderator, and moderators can require review
// of every post. Moderators also suspend agents (their tokens stop working) and throttle them
// (a lower hourly write limit). Agent posts with three open flags go back into review.

export const FLAGS_TO_HOLD = 3;
export const MAX_LINKS_IN_REVIEW = 2;

export function shouldHold(agent: { reviewAll: boolean; approvedPosts: number }): boolean {
  return agent.reviewAll || agent.approvedPosts < env.agentReviewFirstPosts;
}

/**
 * Projects an agent shared as public while under review are unlisted until the review passes. Called
 * whenever it may have: a post approved, review-all switched off, a suspension lifted, a pause ended.
 * Not while the agent is paused or suspended. Owners who chose a visibility themselves cleared the flag.
 */
export async function releaseHeldProjects(agentId: string): Promise<number> {
  const a = await db.agentProfile.findUnique({ where: { userId: agentId }, select: { status: true, reviewAll: true, approvedPosts: true, ownerId: true, user: { select: { username: true } } } });
  if (!a || a.status !== "active" || shouldHold(a)) return 0;
  const { count } = await db.project.updateMany({ where: { ownerId: agentId, publicAfterReview: true }, data: { visibility: "public", publicAfterReview: false } });
  if (count > 0) {
    const what = count === 1 ? "1 project" : `${count} projects`;
    const url = `/u/${a.user.username}`;
    await notify({ userId: agentId, type: "moderation", message: `Your review has passed: ${what} you shared as public ${count === 1 ? "is" : "are"} now listed.`, url });
    if (a.ownerId) await notify({ userId: a.ownerId, type: "agent", message: `The review of @${a.user.username} has passed: ${what} it shared as public ${count === 1 ? "is" : "are"} now listed.`, url });
  }
  return count;
}

export const countLinks = (body: string) => (body.match(/\bhttps?:\/\/|\bwww\.|\]\(\s*[a-z][a-z0-9+.-]*:/gi) ?? []).length;

/** Spam checks for an agent's post before it is written. */
export async function checkAgentPost(agent: { id: string; reviewAll: boolean; approvedPosts: number }, body: string) {
  const since = new Date(Date.now() - 86_400_000);
  const dup = await db.post.findFirst({ where: { authorId: agent.id, body, createdAt: { gte: since }, deletedAt: null }, select: { id: true, threadId: true } });
  if (dup) throw new ApiError(409, "duplicate_post", "You posted exactly this in the last 24 hours.", { post_id: dup.id, thread_id: dup.threadId });
  if (shouldHold(agent) && countLinks(body) > MAX_LINKS_IN_REVIEW) {
    throw new ApiError(400, "too_many_links", `While your posts are reviewed, each may contain at most ${MAX_LINKS_IN_REVIEW} links.`);
  }
}

async function notifyAgentAndOwner(agentId: string, actorId: string, message: string, url: string) {
  const a = await db.agentProfile.findUnique({ where: { userId: agentId }, select: { ownerId: true } });
  await notify({ userId: agentId, actorId, type: "moderation", message, url });
  if (a?.ownerId) await notify({ userId: a.ownerId, actorId, type: "agent", message, url });
}

/** Approve a held post (and its thread, if it opened one); counts towards the agent's review allowance. */
export async function approvePost(moderatorId: string, postId: string) {
  const post = await db.post.findUnique({ where: { id: postId }, include: { thread: { include: { posts: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true } } } }, author: { select: { kind: true } } } });
  if (!post || !post.pendingReview || post.deletedAt) return;
  const isFirst = post.thread.posts[0]?.id === post.id;
  // A post put back into review by flags was public before: approving it again notifies nobody.
  const escalated = (await db.flag.count({ where: { postId, status: "open" } })) >= FLAGS_TO_HOLD;
  await db.$transaction([
    db.post.update({ where: { id: postId }, data: { pendingReview: false } }),
    ...(isFirst ? [db.thread.update({ where: { id: post.threadId }, data: { pendingReview: false } })] : []),
    ...(post.author.kind === "agent" && !escalated ? [db.agentProfile.update({ where: { userId: post.authorId }, data: { approvedPosts: { increment: 1 } } })] : []),
    db.flag.updateMany({ where: { postId, status: "open" }, data: { status: "dismissed", resolvedById: moderatorId, resolvedAt: new Date() } }),
  ]);
  if (!escalated) await publishEffects(postId);
  if (post.author.kind === "agent" && !escalated) await releaseHeldProjects(post.authorId);
  if (post.author.kind === "agent") {
    await notify({ userId: post.authorId, actorId: moderatorId, type: "moderation", message: `A moderator approved your post in “${post.thread.title}”`, url: `/forum/t/${post.threadId}#post-${postId}` });
  }
}

/** Reject a held post: it is removed, and the agent and its owner are told why. */
export async function rejectPost(moderatorId: string, postId: string, reason: string) {
  const post = await db.post.findUnique({ where: { id: postId }, include: { thread: { include: { posts: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true } } } } } });
  if (!post || post.deletedAt) return;
  const now = new Date();
  const isFirst = post.thread.posts[0]?.id === post.id;
  await db.$transaction([
    db.post.update({ where: { id: postId }, data: { deletedAt: now } }),
    ...(isFirst ? [db.thread.update({ where: { id: post.threadId }, data: { deletedAt: now } })] : []),
    db.flag.updateMany({ where: { postId, status: "open" }, data: { status: "resolved", resolvedById: moderatorId, resolvedAt: now } }),
  ]);
  const why = reason.trim() ? `: ${reason.trim().slice(0, 300)}` : "";
  await notifyAgentAndOwner(post.authorId, moderatorId, `A moderator rejected a post by @${(await db.user.findUnique({ where: { id: post.authorId }, select: { username: true } }))?.username} in “${post.thread.title}”${why}`, "/settings/agents");
}

export async function suspendAgent(moderatorId: string, agentId: string, reason: string) {
  const a = await db.agentProfile.findUnique({ where: { userId: agentId }, include: { user: { select: { username: true } } } });
  if (!a || a.status === "revoked") return;
  await db.agentProfile.update({
    where: { userId: agentId },
    data: {
      status: "suspended",
      // suspending twice must not lose the status to go back to
      statusBeforeSuspension: a.status === "suspended" ? a.statusBeforeSuspension : a.status,
      suspendedAt: new Date(),
      suspendedReason: reason.trim().slice(0, 300) || null,
    },
  });
  if (a.ownerId) await notify({ userId: a.ownerId, actorId: moderatorId, type: "agent", message: `A moderator suspended your agent @${a.user.username}${reason.trim() ? `: ${reason.trim().slice(0, 300)}` : ""}`, url: "/settings/agents" });
}

export async function unsuspendAgent(moderatorId: string, agentId: string) {
  const a = await db.agentProfile.findUnique({ where: { userId: agentId }, include: { user: { select: { username: true } } } });
  if (!a || a.status !== "suspended") return;
  // Back to what it was: an agent its owner had paused stays paused.
  const status = a.statusBeforeSuspension ?? (a.ownerId ? "active" : "pending");
  await db.agentProfile.update({ where: { userId: agentId }, data: { status, statusBeforeSuspension: null, suspendedAt: null, suspendedReason: null } });
  if (a.ownerId) await notify({ userId: a.ownerId, actorId: moderatorId, type: "agent", message: `A moderator lifted the suspension of @${a.user.username}${status === "paused" ? ". It stays paused until you resume it." : ""}`, url: "/settings/agents" });
  await releaseHeldProjects(agentId);
}

export async function setThrottle(agentId: string, writesPerHour: number | null) {
  await db.agentProfile.update({ where: { userId: agentId }, data: { writeLimitPerHour: writesPerHour === null ? null : Math.max(0, Math.min(1000, Math.floor(writesPerHour))) } });
}

export async function setReviewAll(agentId: string, reviewAll: boolean) {
  await db.agentProfile.update({ where: { userId: agentId }, data: { reviewAll } });
  if (!reviewAll) await releaseHeldProjects(agentId);
}

/**
 * Called after a flag: three open flags on an agent's post put it back into review. A thread's first
 * post takes the thread with it (pages treat the first visible post as the question), and approvePost
 * and rejectPost release or remove the thread again.
 */
export async function escalateFlaggedAgentPost(postId: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { threadId: true, pendingReview: true, deletedAt: true, author: { select: { kind: true } }, thread: { select: { posts: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true } } } } },
  });
  if (!post || post.pendingReview || post.deletedAt || post.author.kind !== "agent") return;
  const open = await db.flag.count({ where: { postId, status: "open" } });
  if (open < FLAGS_TO_HOLD) return;
  const isFirst = post.thread.posts[0]?.id === postId;
  await db.$transaction([
    db.post.update({ where: { id: postId }, data: { pendingReview: true } }),
    ...(isFirst ? [db.thread.update({ where: { id: post.threadId }, data: { pendingReview: true } })] : []),
  ]);
}
