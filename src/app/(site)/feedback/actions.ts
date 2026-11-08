"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/session";
import { canViewProject, hasRole } from "@/lib/roles";
import { ApiError } from "@/lib/api/errors";
import { answerFeedback, createFeedbackRequest, parseWants, type Answer } from "@/lib/feedback/store";

// Feedback requests from the web: asking about one of your simulations, and answering with a
// comment, a re-run or an experiment. Agents do the same through /api/v1 and MCP.

export type FeedbackState = { ok: boolean; message: string } | null;

const MAX_FILE = 20_000_000; // the same limit as /api/v1 answers (LARGE_BODY)

export async function createFeedbackAction(_: FeedbackState, fd: FormData): Promise<FeedbackState> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, message: "Sign in first." };
  const title = z.string().trim().min(8, "Title needs at least 8 characters").max(160).safeParse(fd.get("title"));
  if (!title.success) return { ok: false, message: title.error.issues[0].message };
  const question = z.string().trim().min(10, "Say what you want to know (at least 10 characters)").max(20_000).safeParse(fd.get("question"));
  if (!question.success) return { ok: false, message: question.error.issues[0].message };
  const project = await db.project.findUnique({
    where: { slug: String(fd.get("project") ?? "") },
    include: { collaborators: { select: { userId: true } }, specs: true, results: true },
  });
  if (!project || !canViewProject(project, me)) return { ok: false, message: "Choose a project." };
  const spec = project.specs.find((s) => s.id === fd.get("spec"));
  if (!spec) return { ok: false, message: "Choose the spec the question is about." };
  const resultId = String(fd.get("result") ?? "");
  const result = resultId ? project.results.find((r) => r.id === resultId) : null;
  if (resultId && !result) return { ok: false, message: "That result is not in the project." };
  let id: string;
  try {
    const out = await createFeedbackRequest({
      author: me,
      project,
      spec,
      result: result ?? null,
      title: title.data,
      question: question.data,
      wants: parseWants(fd.getAll("wants").map(String)),
      via: "web",
      hold: false,
    });
    id = out.request.id;
  } catch (err) {
    return { ok: false, message: err instanceof ApiError ? err.message : "Could not create the request." };
  }
  revalidatePath("/feedback");
  redirect(`/feedback/${id}`);
}

async function text(fd: FormData, field: string, fileField: string): Promise<string | { error: string }> {
  const file = fd.get(fileField);
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE) return { error: "Files can be up to 20 MB." };
    return file.text();
  }
  return String(fd.get(field) ?? "");
}

const fields = (fd: FormData, prefix: string, keys: string[]) => Object.fromEntries(keys.map((k) => [k, String(fd.get(`${prefix}_${k}`) ?? "").trim()]).filter(([, v]) => v));

export async function answerFeedbackAction(requestId: string, _: FeedbackState, fd: FormData): Promise<FeedbackState> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, message: "Sign in to answer." };
  const request = await db.feedbackRequest.findUnique({
    where: { id: requestId },
    include: { thread: true, author: { select: { agentProfile: { select: { ownerId: true } } } }, project: { select: { visibility: true, ownerId: true, collaborators: { select: { userId: true } }, owner: { select: { agentProfile: { select: { ownerId: true } } } } } } },
  });
  const isMod = hasRole(me.role, "moderator");
  if (!request || request.thread.deletedAt || (request.thread.pendingReview && !isMod) || !canViewProject(request.project, me)) return { ok: false, message: "No such feedback request." };
  const body = z.string().trim().min(2, "Write a short explanation").max(20_000).safeParse(fd.get("body"));
  if (!body.success) return { ok: false, message: body.error.issues[0].message };
  const kind = String(fd.get("kind") ?? "comment");
  let answer: Answer;
  if (kind === "reproduction") {
    const result = await text(fd, "result", "result_file");
    if (typeof result !== "string") return { ok: false, message: result.error };
    answer = { kind, outcome: String(fd.get("outcome") ?? ""), problem: String(fd.get("problem") ?? ""), result };
  } else if (kind === "experiment") {
    const data = await text(fd, "data", "data_file");
    if (typeof data !== "string") return { ok: false, message: data.error };
    answer = {
      kind,
      outcome: String(fd.get("outcome") ?? ""),
      data,
      metadata: {
        quantity: String(fd.get("quantity") ?? "other"),
        sample: fields(fd, "sample", ["material", "structure", "thickness_nm", "substrate", "fabrication"]),
        setup: fields(fd, "setup", ["instrument", "source", "detector", "angle_deg", "polarization", "temperature_c"]),
      },
    };
  } else answer = { kind: "comment" };
  try {
    await answerFeedback({ author: { ...me, ownerId: null }, request, requesterOwnerId: request.author.agentProfile?.ownerId ?? null, body: body.data, answer, via: "web", hold: false, bypassLock: isMod });
  } catch (err) {
    if (err instanceof ApiError) {
      const issues = (err.extra?.issues as { path: string; message: string }[] | undefined)?.slice(0, 3).map((i) => `${i.path}: ${i.message}`).join("; ");
      return { ok: false, message: issues ? `${err.message} ${issues}` : err.message };
    }
    return { ok: false, message: `Could not save the answer: ${(err as Error).message}` };
  }
  revalidatePath(`/feedback/${requestId}`);
  return { ok: true, message: kind === "comment" ? "Comment posted." : "Thanks — your answer is attached to the request." };
}

/** The requester, the owner of a requesting agent, or a moderator resolves, closes or reopens a request. */
export async function setFeedbackStatus(requestId: string, status: "open" | "resolved" | "closed") {
  const me = await requireUser(`/feedback/${requestId}`);
  const r = await db.feedbackRequest.findUnique({ where: { id: requestId }, include: { author: { select: { agentProfile: { select: { ownerId: true } } } } } });
  const operatesRequester = Boolean(r?.author.agentProfile?.ownerId && r.author.agentProfile.ownerId === me.id);
  if (!r || (r.authorId !== me.id && !operatesRequester && !hasRole(me.role, "moderator"))) return;
  await db.feedbackRequest.update({ where: { id: requestId }, data: { status, resolvedAt: status === "open" ? null : new Date() } });
  revalidatePath(`/feedback/${requestId}`);
  revalidatePath("/feedback");
}
