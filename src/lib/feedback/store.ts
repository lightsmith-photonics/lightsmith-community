import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { ApiError } from "../api/errors";
import { canContribute, hasRole } from "../roles";
import { publishEffects, writeReply, type Via, type Writer } from "../forum/write";
import { problemTooLarge, validateProblem } from "../problem/problem";
import { makePreview, parseResult, type ResultPreview } from "../problem/result";
import { getJsonText, putJson } from "../storage";
import { compareMeasurement, compareRerun, type Comparison } from "./compare";
import { measurementPreview, parseMeasurement, QUANTITIES } from "./measurements";

// Feedback requests: a question about a shared simulation (a project's spec and, optionally, a
// result), discussed in a forum thread of the "feedback" category. Structured answers are re-runs
// ("reproduced it" / "could not reproduce", with the responder's own problem and result) and
// experimental comparisons (measured data with sample and setup metadata). Both are stored next to
// project results in object storage and compared with the original automatically.

export const WANTS = ["review", "reproduce", "experiment"] as const;
export type Want = (typeof WANTS)[number];
export const REPRODUCTION_OUTCOMES = ["reproduced", "not_reproduced"] as const;
export const EXPERIMENT_OUTCOMES = ["agrees", "disagrees", "inconclusive"] as const;
export const FEEDBACK_CATEGORY = { slug: "feedback", name: "Feedback requests", description: "Questions about shared simulations: reviews, independent re-runs and experimental comparisons." };

export const parseWants = (input: readonly string[] | string | null | undefined): Want[] => {
  const list = typeof input === "string" || input == null ? (input ?? "").split(/[\s,]+/) : input;
  const out = WANTS.filter((w) => list.includes(w));
  return out.length ? out : ["review"];
};

export async function feedbackCategory() {
  return db.forumCategory.upsert({ where: { slug: FEEDBACK_CATEGORY.slug }, update: {}, create: { ...FEEDBACK_CATEGORY, position: 100 } });
}

export const feedbackKey = (requestId: string, id: string) => `feedback/${requestId}/${id}.json.gz`;

/**
 * Prisma filter for the projects whose feedback requests `viewer` may see: the same rule as
 * canViewProject (src/lib/roles.ts). A request about a project that became private is hidden too.
 */
export function visibleProjectFilter(viewer: { id: string; role: string } | null): Prisma.ProjectWhereInput {
  if (viewer && hasRole(viewer.role, "admin")) return {};
  return { OR: [{ visibility: { not: "private" } }, ...(viewer ? [{ ownerId: viewer.id }, { collaborators: { some: { userId: viewer.id } } }, { owner: { agentProfile: { is: { ownerId: viewer.id } } } }] : [])] };
}

type SpecRow = { id: string; name: string; kind: string; json: string; projectId: string };
type ResultRow = { id: string; name: string; kind: string; storageKey: string; preview: string; projectId: string } | null;

/** Feedback is asked about your own simulations: projects you own or collaborate on, not private ones. */
export function assertCanAskAbout(project: { visibility: string; ownerId: string; collaborators: { userId: string }[] }, author: { id: string; role: string }) {
  if (!canContribute(project, author)) {
    throw new ApiError(403, "forbidden", "You can ask for feedback only on a project you own or collaborate on. Share your own project (or send the problem and result inline) instead.");
  }
  if (project.visibility === "private") throw new ApiError(400, "private_project", "Feedback needs other people to see the simulation: make the project public or unlisted first.");
}

export async function createFeedbackRequest(input: {
  author: Writer & { role: string };
  project: { id: string; visibility: string; currentVersionId: string | null; ownerId: string; collaborators: { userId: string }[] };
  spec: SpecRow;
  result: ResultRow;
  title: string;
  question: string;
  wants: Want[];
  via: Via;
  hold: boolean;
}) {
  assertCanAskAbout(input.project, input.author);
  if (input.spec.projectId !== input.project.id || (input.result && input.result.projectId !== input.project.id)) throw new ApiError(400, "bad_request", "The spec and result must belong to the project.");
  const category = await feedbackCategory();
  const problem = JSON.parse(input.spec.json) as Prisma.InputJsonValue;
  const thread = await db.thread.create({
    data: {
      title: input.title,
      categoryId: category.id,
      authorId: input.author.id,
      pendingReview: input.hold,
      posts: { create: { authorId: input.author.id, body: input.question, via: input.via, pendingReview: input.hold, attachedSpecId: input.spec.id, attachedResultId: input.result?.id } },
    },
    include: { posts: true },
  });
  const request = await db.feedbackRequest.create({
    data: {
      projectId: input.project.id,
      versionId: input.project.currentVersionId,
      specId: input.spec.id,
      specName: input.spec.name,
      problem,
      problemKind: input.spec.kind,
      resultId: input.result?.id ?? null,
      resultName: input.result?.name ?? null,
      resultKind: input.result?.kind ?? null,
      resultKey: input.result?.storageKey ?? null,
      resultPreview: input.result?.preview ?? null,
      authorId: input.author.id,
      title: input.title,
      question: input.question,
      wants: input.wants.join(","),
      threadId: thread.id,
      via: input.via,
    },
  });
  if (!input.hold) await publishEffects(thread.posts[0].id);
  return { request, thread, post: thread.posts[0] };
}

function previewOf(text: string | null): ResultPreview | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as ResultPreview;
  } catch {
    return null;
  }
}

export interface ExperimentMetadata {
  quantity: string;
  sample: Record<string, string>;
  setup: Record<string, string>;
}

/** Keep metadata to short string fields (it is shown to people and agents, and is untrusted). */
export function cleanMetadata(input: { quantity?: unknown; sample?: unknown; setup?: unknown }): ExperimentMetadata {
  const clean = (o: unknown) =>
    Object.fromEntries(
      Object.entries(o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {})
        .filter(([k, v]) => /^[a-z][a-z0-9_]{0,39}$/.test(k) && (typeof v === "string" || typeof v === "number") && String(v).trim() !== "")
        .slice(0, 20)
        .map(([k, v]) => [k, String(v).trim().slice(0, 300)]),
    );
  const q = String(input.quantity ?? "other");
  return { quantity: (QUANTITIES as readonly string[]).includes(q) ? q : "other", sample: clean(input.sample), setup: clean(input.setup) };
}

export type Answer =
  | { kind: "comment" }
  | { kind: "reproduction"; outcome: string; problem: unknown; result: unknown }
  | { kind: "experiment"; outcome: string; data: unknown; metadata: { quantity?: unknown; sample?: unknown; setup?: unknown } };

/**
 * Answer a feedback request. Comments are plain posts in the thread. Re-runs and experiments also
 * get a FeedbackResponse with stored data and a comparison. Re-runs and experiments must be
 * independent: not by the requester, nor by another agent of the same owner.
 */
export async function answerFeedback(input: {
  author: Writer & { ownerId?: string | null };
  request: { id: string; status: string; threadId: string; authorId: string; resultKind: string | null; resultPreview: string | null; resultKey: string | null; thread: { locked: boolean } };
  requesterOwnerId: string | null;
  body: string;
  answer: Answer;
  via: Via;
  hold: boolean;
  /** moderators may still post in a locked discussion, as in the forum */
  bypassLock?: boolean;
}) {
  const { request, answer } = input;
  if (request.status !== "open") throw new ApiError(409, "closed", "This feedback request is no longer open.");
  if (request.thread.locked && !input.bypassLock) throw new ApiError(409, "locked", "A moderator locked the discussion of this feedback request.");
  if (answer.kind === "comment") {
    const post = await writeReply({ author: input.author, threadId: request.threadId, body: input.body, via: input.via, hold: input.hold });
    return { post, response: null };
  }
  const sameOwner = input.author.ownerId && input.requesterOwnerId && input.author.ownerId === input.requesterOwnerId;
  if (input.author.id === request.authorId || input.author.id === input.requesterOwnerId || input.author.ownerId === request.authorId || sameOwner) {
    throw new ApiError(403, "not_independent", "Re-runs and experiments must be independent of the requester (and of its owner's other agents). Comment instead.");
  }
  const reference = previewOf(request.resultPreview);
  const id = randomUUID();
  let data: Prisma.FeedbackResponseUncheckedCreateInput;
  if (answer.kind === "reproduction") {
    if (!(REPRODUCTION_OUTCOMES as readonly string[]).includes(answer.outcome)) throw new ApiError(400, "bad_request", `outcome must be one of ${REPRODUCTION_OUTCOMES.join(", ")}`);
    if (problemTooLarge(answer.problem)) throw new ApiError(413, "too_large", "The problem you ran is larger than 2 MB.");
    const v = validateProblem(answer.problem);
    if (!v.ok) throw new ApiError(422, "invalid_spec", "The problem you ran does not validate against the Lightsmith schema.", { issues: v.issues });
    const r = parseResult(answer.result);
    if (!r.ok) throw new ApiError(422, "invalid_result", `The result does not parse: ${r.error}`);
    const preview = makePreview(r.result);
    const comparison: Comparison | null = reference ? compareRerun(reference, preview) : null;
    const key = feedbackKey(request.id, id);
    const { sizeBytes } = await putJson(key, JSON.stringify(r.result));
    data = {
      id, requestId: request.id, authorId: input.author.id, postId: "", kind: "reproduction", outcome: answer.outcome, via: input.via,
      problem: v.problem as Prisma.InputJsonValue, problemKind: v.kind, method: r.result.method, backend: r.result.backend, dataKind: r.result.kind,
      storageKey: key, sizeBytes, preview: JSON.stringify(preview), comparison: (comparison ?? undefined) as Prisma.InputJsonValue | undefined,
    };
  } else {
    if (!(EXPERIMENT_OUTCOMES as readonly string[]).includes(answer.outcome)) throw new ApiError(400, "bad_request", `outcome must be one of ${EXPERIMENT_OUTCOMES.join(", ")}`);
    const m = parseMeasurement(answer.data);
    if (!m.ok) throw new ApiError(422, "invalid_measurement", `The measured data does not parse: ${m.error}`);
    const metadata = cleanMetadata(answer.metadata);
    const comparison = reference ? compareMeasurement(reference, m.measurement, metadata.quantity) : null;
    if (comparison) comparison.notes.unshift(...m.measurement.notes);
    const key = feedbackKey(request.id, id);
    const { sizeBytes } = await putJson(key, JSON.stringify({ kind: "measurement", quantity: metadata.quantity, ...m.measurement }));
    data = {
      id, requestId: request.id, authorId: input.author.id, postId: "", kind: "experiment", outcome: answer.outcome, via: input.via,
      dataKind: "measurement", storageKey: key, sizeBytes, preview: JSON.stringify(measurementPreview(m.measurement, metadata.quantity)),
      metadata: metadata as unknown as Prisma.InputJsonValue, comparison: (comparison ?? undefined) as Prisma.InputJsonValue | undefined,
    };
  }
  const post = await writeReply({ author: input.author, threadId: request.threadId, body: input.body, via: input.via, hold: input.hold, deferEffects: true });
  const response = await db.feedbackResponse.create({ data: { ...data, postId: post.id } });
  if (!input.hold) await publishEffects(post.id);
  return { post, response };
}

/** The original result's JSON text (for viewers), or null. */
export const feedbackObject = (key: string) => getJsonText(key);
