"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireUser } from "@/lib/session";
import { hasRole } from "@/lib/roles";
import { notify } from "@/lib/notify";
import { writeReply, writeThread } from "@/lib/forum/write";
import { escalateFlaggedAgentPost } from "@/lib/agents/moderation";

export type ForumState = { ok: boolean; message: string } | null;

const Body = z.string().trim().min(2, "Write something first").max(40_000, "Posts are limited to 40 000 characters");

/** "spec:<id>" or "result:<id>" from the attachment picker; must be from a non-private project. */
async function attachment(value: FormDataEntryValue | null) {
  const v = String(value ?? "");
  const [kind, id] = v.split(":");
  if (!id) return {};
  if (kind === "spec") {
    const s = await db.spec.findUnique({ where: { id }, include: { project: true } });
    if (s && s.project.visibility !== "private") return { attachedSpecId: s.id };
  }
  if (kind === "result") {
    const r = await db.resultRecord.findUnique({ where: { id }, include: { project: true } });
    if (r && r.project.visibility !== "private") return { attachedResultId: r.id };
  }
  return {};
}

export async function createThread(_: ForumState, fd: FormData): Promise<ForumState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in to post." };
  const title = z.string().trim().min(8, "Title needs at least 8 characters").max(160).safeParse(fd.get("title"));
  if (!title.success) return { ok: false, message: title.error.issues[0].message };
  const body = Body.safeParse(fd.get("body"));
  if (!body.success) return { ok: false, message: body.error.issues[0].message };
  const category = await db.forumCategory.findUnique({ where: { slug: String(fd.get("category") ?? "") } });
  if (!category) return { ok: false, message: "Choose a category." };
  const { thread } = await writeThread({
    author: user,
    categoryId: category.id,
    title: title.data,
    body: body.data,
    attachment: await attachment(fd.get("attachment")),
    via: "web",
    hold: false,
  });
  redirect(`/forum/t/${thread.id}`);
}

export async function reply(threadId: string, _: ForumState, fd: FormData): Promise<ForumState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in to reply." };
  const thread = await db.thread.findUnique({ where: { id: threadId } });
  if (!thread || thread.deletedAt || (thread.pendingReview && !hasRole(user.role, "moderator"))) return { ok: false, message: "Thread not found." };
  if (thread.locked && !hasRole(user.role, "moderator")) return { ok: false, message: "This thread is locked." };
  const body = Body.safeParse(fd.get("body"));
  if (!body.success) return { ok: false, message: body.error.issues[0].message };
  await writeReply({ author: user, threadId, body: body.data, attachment: await attachment(fd.get("attachment")), via: "web", hold: false });
  revalidatePath(`/forum/t/${threadId}`);
  revalidatePath("/feedback", "layout");
  return { ok: true, message: "Posted." };
}

export async function vote(postId: string, value: 1 | -1) {
  const user = await requireUser();
  const post = await db.post.findUnique({ where: { id: postId } });
  if (!post || post.deletedAt || post.pendingReview || post.authorId === user.id) return;
  const key = { userId_postId: { userId: user.id, postId } };
  const existing = await db.vote.findUnique({ where: key });
  if (existing?.value === value) await db.vote.delete({ where: key });
  else await db.vote.upsert({ where: key, create: { userId: user.id, postId, value }, update: { value } });
  const agg = await db.vote.aggregate({ where: { postId }, _sum: { value: true } });
  await db.post.update({ where: { id: postId }, data: { score: agg._sum.value ?? 0 } });
  revalidatePath(`/forum/t/${post.threadId}`);
}

export async function acceptAnswer(threadId: string, postId: string) {
  const user = await requireUser();
  const thread = await db.thread.findUnique({ where: { id: threadId } });
  if (!thread || (thread.authorId !== user.id && !hasRole(user.role, "moderator"))) return;
  const post = await db.post.findFirst({ where: { id: postId, threadId } });
  if (!post) return;
  const unaccept = thread.acceptedPostId === postId;
  await db.thread.update({ where: { id: threadId }, data: { acceptedPostId: unaccept ? null : postId } });
  if (!unaccept) {
    await notify({ userId: post.authorId, actorId: user.id, type: "accepted", message: `Your answer in “${thread.title}” was accepted`, url: `/forum/t/${threadId}#post-${postId}` });
  }
  revalidatePath(`/forum/t/${threadId}`);
}

export async function flagPost(postId: string, _: ForumState, fd: FormData): Promise<ForumState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in to report." };
  const reason = z.string().trim().min(3, "Say briefly what is wrong").max(500).safeParse(fd.get("reason"));
  if (!reason.success) return { ok: false, message: reason.error.issues[0].message };
  const dup = await db.flag.findFirst({ where: { postId, reporterId: user.id, status: "open" } });
  if (!dup) await db.flag.create({ data: { postId, reporterId: user.id, reason: reason.data } });
  await escalateFlaggedAgentPost(postId);
  return { ok: true, message: "Thanks — a moderator will take a look." };
}

export async function deletePost(postId: string) {
  const user = await requireUser();
  const post = await db.post.findUnique({ where: { id: postId }, include: { thread: { include: { posts: { orderBy: { createdAt: "asc" }, take: 1 } } } } });
  if (!post) return;
  const isMod = hasRole(user.role, "moderator");
  if (post.authorId !== user.id && !isMod) return;
  const isFirst = post.thread.posts[0]?.id === post.id;
  if (isFirst) {
    await db.thread.update({ where: { id: post.threadId }, data: { deletedAt: new Date() } });
  }
  await db.post.update({ where: { id: postId }, data: { deletedAt: new Date() } });
  await db.flag.updateMany({ where: { postId, status: "open" }, data: { status: "resolved", resolvedById: user.id, resolvedAt: new Date() } });
  if (isMod && post.authorId !== user.id) {
    await notify({ userId: post.authorId, actorId: user.id, type: "moderation", message: `A moderator removed your post in “${post.thread.title}”`, url: `/forum/t/${post.threadId}` });
  }
  revalidatePath(`/forum/t/${post.threadId}`);
  if (isFirst) redirect("/forum");
}

export async function setThreadFlag(threadId: string, field: "locked" | "pinned", value: boolean) {
  await requireRole("moderator");
  await db.thread.update({ where: { id: threadId }, data: { [field]: value } });
  revalidatePath(`/forum/t/${threadId}`);
}

export async function resolveFlag(flagId: string, status: "resolved" | "dismissed") {
  const mod = await requireRole("moderator");
  await db.flag.update({ where: { id: flagId }, data: { status, resolvedById: mod.id, resolvedAt: new Date() } });
  revalidatePath("/moderation/forum");
}
