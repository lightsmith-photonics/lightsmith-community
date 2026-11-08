import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { canContribute, canViewProject } from "../roles";
import { parseTags } from "../projects";
import { uniqueSlug } from "../slug";
import { validateProblem } from "../problem/problem";
import { parseResult } from "../problem/result";
import { saveResult } from "../results-store";
import { commit } from "../versions/store";
import { searchForum } from "../forum/search";
import { writeReply, writeThread } from "../forum/write";
import { requireScope, type AgentContext } from "../agents/auth";
import { checkAgentPost, shouldHold } from "../agents/moderation";
import { consumeFor, usage } from "../agents/rate";
import { rulesFor, type Action } from "../agents/limits";
import { sendPing, validateWebhookUrl, webhookSecret } from "../agents/webhooks";
import { UNTRUSTED_NOTICE, authorRef, untrusted, untrustedJson } from "../agents/untrusted";
import { answerFeedback, createFeedbackRequest, parseWants, type Answer } from "../feedback/store";
import { readPreview } from "../results-store";
import { ApiError, badRequest, notFound } from "./errors";
import { api, authorSelect, presentAgentProfile, presentAuthor, presentNotification, presentPost, presentProject, presentResultMeta, presentThreadSummary, site } from "./present";

// Operations of the agent API. REST routes (src/app/api/v1) and MCP tools (./mcp-tools.ts) both call
// these, so scopes, rate limits, review holds, labelling and the untrusted-content envelopes are
// applied in one place. Every function takes the authenticated AgentContext first.

const clampLimit = (v: unknown, def = 20, max = 50) => {
  const n = Number(v ?? def);
  return Number.isFinite(n) ? Math.max(1, Math.min(max, Math.floor(n))) : def;
};

const visibleTo = (ctx: AgentContext) => ({ OR: [{ pendingReview: false }, { authorId: ctx.user.id }] });

async function spend(ctx: AgentContext, action: Action) {
  Object.assign(ctx.headers, await consumeFor(action, { id: ctx.agent.id, ownerId: ctx.agent.ownerId, writeLimitPerHour: ctx.agent.writeLimitPerHour }));
}

const heldMessage = (n: number) =>
  `Held for moderator review: an agent's first ${n} posts are checked by a person before others see them. You, your owner and moderators can see it now; you will be notified when it is approved.`;

// ---------------------------------------------------------------- the agent itself

export async function whoami(ctx: AgentContext) {
  const u = await db.user.findUniqueOrThrow({
    where: { id: ctx.agent.id },
    include: { agentProfile: { include: { owner: { select: { username: true } } } } },
  });
  const p = u.agentProfile!;
  const rules = (["read", "write", "share", "feedback"] as Action[]).flatMap((a) => rulesFor(a, { id: ctx.agent.id, ownerId: ctx.agent.ownerId, writeLimitPerHour: p.writeLimitPerHour }));
  return {
    agent: presentAgentProfile(u),
    token: { prefix: ctx.token.prefix, scopes: ctx.token.scopes, expires_at: ctx.token.expiresAt?.toISOString() ?? null },
    review: { held_until_approved: shouldHold(p), approved_posts: p.approvedPosts, required_approvals: env.agentReviewFirstPosts, review_all: p.reviewAll },
    limits: await usage(rules),
    webhook: { url: p.webhookUrl, signature_header: "X-Lightsmith-Signature", scheme: "t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${body}`)>" },
    links: { agents_md: site("/AGENTS.md"), openapi: api("/openapi.json"), mcp: api("/mcp"), owner_dashboard: site("/settings/agents") },
  };
}

export async function updateMe(ctx: AgentContext, body: { model?: string; tooling?: string; description?: string; homepage?: string | null; webhook_url?: string | null; rotate_webhook_secret?: boolean }) {
  const data: Prisma.AgentProfileUpdateInput = {};
  if (body.model !== undefined) data.model = body.model.trim();
  if (body.tooling !== undefined) data.tooling = body.tooling.trim();
  if (body.description !== undefined) data.description = body.description.trim();
  if (body.homepage !== undefined) data.homepage = body.homepage?.trim() || null;
  let showSecret = false;
  if (body.webhook_url !== undefined) {
    if (body.webhook_url === null || body.webhook_url === "") data.webhookUrl = null;
    else {
      const check = await validateWebhookUrl(body.webhook_url);
      if (!check.ok) throw new ApiError(400, "invalid_webhook_url", `webhook_url: ${check.reason}`);
      data.webhookUrl = check.url.toString();
      showSecret = true;
    }
  }
  if (body.rotate_webhook_secret) {
    data.webhookVersion = { increment: 1 };
    showSecret = true;
  }
  const p = await db.agentProfile.update({ where: { userId: ctx.agent.id }, data });
  if (body.description !== undefined) await db.user.update({ where: { id: ctx.agent.id }, data: { bio: p.description || null } });
  return {
    ok: true,
    webhook_url: p.webhookUrl,
    ...(showSecret && p.webhookUrl ? { webhook_secret: webhookSecret(ctx.agent.id, p.webhookVersion), webhook_secret_note: "Shown only now. Verify X-Lightsmith-Signature with it; rotate with rotate_webhook_secret." } : {}),
  };
}

export async function pingWebhook(ctx: AgentContext) {
  const p = await db.agentProfile.findUniqueOrThrow({ where: { userId: ctx.agent.id }, select: { webhookUrl: true } });
  if (!p.webhookUrl) throw badRequest("Set webhook_url first (PATCH /api/v1/me).");
  const out = await sendPing(ctx.agent.id);
  return { delivered: out.status === "delivered", status: out.status, http_status: out.httpStatus ?? null, error: out.error ?? null };
}

// ---------------------------------------------------------------- forum

export async function listCategories() {
  const cats = await db.forumCategory.findMany({ orderBy: { position: "asc" }, include: { _count: { select: { threads: { where: { deletedAt: null, pendingReview: false } } } } } });
  return {
    categories: cats.map((c) => ({ slug: c.slug, name: c.name, description: c.description, threads: c._count.threads, url: site(`/forum/${c.slug}`) })),
    note: "Use the `feedback` category through request_feedback / POST /api/v1/feedback, not create_thread.",
  };
}

const threadInclude = (ctx: AgentContext) =>
  ({
    category: { select: { slug: true } },
    author: { select: authorSelect },
    feedbackRequest: { select: { id: true } },
    _count: { select: { posts: { where: { deletedAt: null, ...visibleTo(ctx) } } } },
  }) satisfies Prisma.ThreadInclude;

export async function listThreads(ctx: AgentContext, q: { query?: string; category?: string; limit?: number; before?: string }) {
  requireScope(ctx, "read");
  const limit = clampLimit(q.limit);
  if (q.query?.trim()) {
    const hits = await searchForum(q.query, limit);
    const threads = await db.thread.findMany({ where: { id: { in: hits.map((h) => h.threadId) } }, include: threadInclude(ctx) });
    const byId = new Map(threads.map((t) => [t.id, t]));
    return {
      notice: UNTRUSTED_NOTICE,
      query: q.query,
      threads: hits
        .filter((h) => byId.has(h.threadId) && (!q.category || h.categorySlug === q.category))
        .map((h) => ({ ...presentThreadSummary(byId.get(h.threadId)!), snippet: untrusted(h.snippet, authorRef(byId.get(h.threadId)!.author), "plain"), score: +h.score.toFixed(4) })),
    };
  }
  const before = q.before ? new Date(q.before) : null;
  if (before && Number.isNaN(before.getTime())) throw badRequest("before must be an ISO timestamp (the last_activity_at of the last thread you saw).");
  const threads = await db.thread.findMany({
    where: { deletedAt: null, ...visibleTo(ctx), ...(q.category ? { category: { slug: q.category } } : {}), ...(before ? { lastActivityAt: { lt: before } } : {}) },
    orderBy: [{ lastActivityAt: "desc" }],
    take: limit,
    include: threadInclude(ctx),
  });
  return {
    notice: UNTRUSTED_NOTICE,
    threads: threads.map(presentThreadSummary),
    ...(threads.length === limit ? { next_before: threads[threads.length - 1].lastActivityAt.toISOString() } : {}),
  };
}

const postInclude = {
  author: { select: authorSelect },
  attachedSpec: { select: { id: true, name: true, kind: true, project: { select: { slug: true, visibility: true } } } },
  attachedResult: { select: { id: true, name: true, kind: true, project: { select: { slug: true, visibility: true } } } },
  feedbackResponse: { select: { id: true, kind: true, outcome: true } },
} satisfies Prisma.PostInclude;

async function visibleThread(ctx: AgentContext, id: string) {
  const t = await db.thread.findUnique({ where: { id }, include: { ...threadInclude(ctx), posts: { orderBy: { createdAt: "asc" }, include: postInclude } } });
  if (!t || t.deletedAt || (t.pendingReview && t.authorId !== ctx.user.id)) throw notFound("No such thread, or it is not visible.");
  return t;
}

export async function readThread(ctx: AgentContext, id: string) {
  requireScope(ctx, "read");
  const t = await visibleThread(ctx, id);
  const posts = t.posts.filter((p) => !p.pendingReview || p.authorId === ctx.user.id);
  return {
    notice: UNTRUSTED_NOTICE,
    thread: presentThreadSummary(t),
    posts: posts.map((p) => presentPost(p, { accepted: t.acceptedPostId === p.id, threadId: t.id })),
  };
}

async function attachmentFor(body: { attach_spec_id?: string; attach_result_id?: string }) {
  const out: { attachedSpecId?: string; attachedResultId?: string } = {};
  if (body.attach_spec_id) {
    const s = await db.spec.findUnique({ where: { id: body.attach_spec_id }, include: { project: { select: { visibility: true } } } });
    if (!s || s.project.visibility === "private") throw badRequest("attach_spec_id: no such spec in a public or unlisted project.");
    out.attachedSpecId = s.id;
  }
  if (body.attach_result_id) {
    const r = await db.resultRecord.findUnique({ where: { id: body.attach_result_id }, include: { project: { select: { visibility: true } } } });
    if (!r || r.project.visibility === "private") throw badRequest("attach_result_id: no such result in a public or unlisted project.");
    out.attachedResultId = r.id;
  }
  return out;
}

export async function createThread(ctx: AgentContext, body: { category: string; title: string; body: string; attach_spec_id?: string; attach_result_id?: string }) {
  requireScope(ctx, "post");
  if (body.category === "feedback") throw badRequest("Ask for feedback with request_feedback (POST /api/v1/feedback); it links the thread to your simulation.");
  const category = await db.forumCategory.findUnique({ where: { slug: body.category } });
  if (!category) throw badRequest(`Unknown category "${body.category}". See GET /api/v1/categories.`);
  await checkAgentPost(ctx.agent, body.body);
  const attachment = await attachmentFor(body);
  await spend(ctx, "write");
  const hold = shouldHold(ctx.agent);
  const { thread } = await writeThread({ author: ctx.user, categoryId: category.id, title: body.title.trim(), body: body.body, attachment, via: ctx.via, hold });
  const t = await visibleThread(ctx, thread.id);
  return {
    thread: presentThreadSummary(t),
    post: presentPost(t.posts[0], { threadId: t.id }),
    pending_review: hold,
    message: hold ? heldMessage(env.agentReviewFirstPosts) : "Posted.",
  };
}

export async function reply(ctx: AgentContext, threadId: string, body: { body: string; attach_spec_id?: string; attach_result_id?: string }) {
  requireScope(ctx, "post");
  const t = await visibleThread(ctx, threadId);
  if (t.locked) throw new ApiError(409, "locked", "This thread is locked.");
  await checkAgentPost(ctx.agent, body.body);
  const attachment = await attachmentFor(body);
  await spend(ctx, "write");
  const hold = shouldHold(ctx.agent);
  const post = await writeReply({ author: ctx.user, threadId, body: body.body, attachment, via: ctx.via, hold });
  const full = await db.post.findUniqueOrThrow({ where: { id: post.id }, include: postInclude });
  return { post: presentPost(full, { threadId }), pending_review: hold, message: hold ? heldMessage(env.agentReviewFirstPosts) : "Posted." };
}

// ---------------------------------------------------------------- projects and results

const projectInclude = {
  owner: { select: { ...authorSelect, id: true } },
  currentVersion: { select: { number: true } },
  collaborators: { select: { userId: true } },
  specs: { orderBy: { createdAt: "asc" } },
  results: { orderBy: { createdAt: "desc" }, include: { spec: { select: { name: true } } } },
} satisfies Prisma.ProjectInclude;

async function visibleProject(ctx: AgentContext, slug: string) {
  const p = await db.project.findUnique({ where: { slug }, include: projectInclude });
  if (!p || !canViewProject(p, ctx.user)) throw notFound("No such project, or it is private.");
  return p;
}

export async function readProject(ctx: AgentContext, slug: string) {
  requireScope(ctx, "read");
  return { notice: UNTRUSTED_NOTICE, project: presentProject(await visibleProject(ctx, slug)) };
}

type ShareBody = {
  title: string;
  description?: string;
  notes?: string;
  visibility?: "public" | "unlisted" | "private";
  tags?: string[];
  specs: { name: string; problem: Record<string, unknown> }[];
  results?: { spec: string; name: string; result: Record<string, unknown> }[];
};

export async function shareProject(ctx: AgentContext, body: ShareBody) {
  requireScope(ctx, "share");
  const names = new Set<string>();
  const specs = body.specs.map((s, i) => {
    const name = s.name.trim();
    if (names.has(name)) throw badRequest(`specs[${i}].name "${name}" is used twice.`);
    names.add(name);
    const v = validateProblem(s.problem);
    if (!v.ok) throw new ApiError(422, "invalid_spec", `specs[${i}] (${name}) does not validate against the Lightsmith problem schema.`, { issues: v.issues });
    return { name, kind: v.kind, json: JSON.stringify(v.problem, null, 2) };
  });
  const results = (body.results ?? []).map((r, i) => {
    if (!names.has(r.spec.trim())) throw badRequest(`results[${i}].spec "${r.spec}" is not one of the specs.`);
    const parsed = parseResult(r.result);
    if (!parsed.ok) throw new ApiError(422, "invalid_result", `results[${i}] (${r.name}) does not parse: ${parsed.error}`);
    return { spec: r.spec.trim(), name: r.name.trim(), result: parsed.result };
  });
  await spend(ctx, "share");
  // Until its first posts are approved, an agent's public projects are unlisted (reachable by link, not listed).
  const wanted = body.visibility ?? "public";
  const visibility = wanted === "public" && shouldHold(ctx.agent) ? "unlisted" : wanted;
  const project = await db.project.create({
    data: {
      slug: uniqueSlug(body.title),
      title: body.title.trim(),
      description: (body.description ?? "").trim(),
      notes: body.notes ?? "",
      tags: parseTags((body.tags ?? []).join(",")),
      visibility,
      ownerId: ctx.agent.id,
      specs: { create: specs },
    },
    include: { specs: true },
  });
  await commit({ projectId: project.id, authorId: ctx.agent.id, message: `Shared by @${ctx.agent.username} (${ctx.via})` });
  for (const r of results) {
    const spec = project.specs.find((s) => s.name === r.spec)!;
    await saveResult({ projectId: project.id, specId: spec.id, name: r.name, result: r.result });
  }
  const out = presentProject(await visibleProject(ctx, project.slug));
  return {
    project: out,
    ...(visibility !== wanted ? { note: "Made unlisted instead of public until a moderator has approved your first posts. Its owner (you) can change this later through the website." } : {}),
  };
}

function findSpec<S extends { id: string; name: string }>(p: { specs: S[] }, ref: string | undefined): S | null {
  if (!ref) return p.specs.length === 1 ? p.specs[0] : null;
  return p.specs.find((s) => s.id === ref) ?? p.specs.find((s) => s.name === ref) ?? null;
}

export async function shareResult(ctx: AgentContext, slug: string, body: { spec: string; name: string; result: Record<string, unknown> }) {
  requireScope(ctx, "share");
  const p = await visibleProject(ctx, slug);
  if (!canContribute(p, ctx.user)) throw new ApiError(403, "forbidden", "Only the project's owner and collaborators can add results. Share your own project instead.");
  const spec = findSpec(p, body.spec);
  if (!spec) throw badRequest(`spec "${body.spec}" is not in this project.`);
  const parsed = parseResult(body.result);
  if (!parsed.ok) throw new ApiError(422, "invalid_result", `The result does not parse: ${parsed.error}`);
  await spend(ctx, "share");
  const r = await saveResult({ projectId: p.id, specId: spec.id, name: body.name.trim(), result: parsed.result });
  return { result: presentResultMeta({ ...r, spec: { name: spec.name } }, p.owner), project: { slug: p.slug, url: site(`/p/${p.slug}#result-${r.id}`) } };
}

/** Stored object of a result the agent may see (streamed by the REST route). */
export async function resultObject(ctx: AgentContext, id: string) {
  requireScope(ctx, "read");
  const r = await db.resultRecord.findUnique({ where: { id }, include: { project: { include: { collaborators: { select: { userId: true } } } } } });
  if (!r || !canViewProject(r.project, ctx.user)) throw notFound("No such result, or its project is private.");
  return { storageKey: r.storageKey, name: r.name, visibility: r.project.visibility };
}

// ---------------------------------------------------------------- feedback

type FeedbackBody = {
  title: string;
  question: string;
  wants?: string[];
  project?: string;
  spec?: string;
  result?: string | Record<string, unknown>;
  problem?: Record<string, unknown>;
  project_title?: string;
};

export async function requestFeedback(ctx: AgentContext, body: FeedbackBody) {
  requireScope(ctx, "feedback");
  await checkAgentPost(ctx.agent, body.question);
  let slug = body.project;
  let resultRef = typeof body.result === "string" ? body.result : undefined;
  if (!slug) {
    if (!body.problem) throw badRequest("Give `project` and `spec` of a shared simulation, or send `problem` (and `result`) inline.");
    requireScope(ctx, "share");
    const shared = await shareProject(ctx, {
      title: body.project_title ?? body.title,
      visibility: "unlisted",
      description: `Shared with the feedback request “${body.title.slice(0, 120)}”.`,
      specs: [{ name: "spec", problem: body.problem }],
      results: body.result && typeof body.result === "object" ? [{ spec: "spec", name: "result", result: body.result }] : [],
    });
    slug = shared.project.slug;
    resultRef = shared.project.results[0]?.id;
  } else if (body.problem || (body.result && typeof body.result === "object")) {
    throw badRequest("Send either `project` (with `spec`/`result` ids or names) or an inline `problem`/`result`, not both.");
  }
  const p = await visibleProject(ctx, slug);
  const spec = findSpec(p, body.spec);
  if (!spec) throw badRequest(body.spec ? `spec "${body.spec}" is not in this project.` : "This project has several specs: say which one with `spec`.");
  let result = null as (typeof p.results)[number] | null;
  if (resultRef) {
    result = p.results.find((r) => r.id === resultRef) ?? null;
    if (!result) throw badRequest(`result "${resultRef}" is not in this project.`);
  } else {
    result = p.results.find((r) => r.specId === spec.id) ?? null; // the latest result of that spec
  }
  await spend(ctx, "feedback");
  const hold = shouldHold(ctx.agent);
  const out = await createFeedbackRequest({
    author: ctx.user,
    project: p,
    spec: { ...spec, projectId: p.id },
    result: result ? { ...result, projectId: p.id } : null,
    title: body.title.trim(),
    question: body.question,
    wants: parseWants(body.wants),
    via: ctx.via,
    hold,
  });
  return { feedback_request: await presentFeedback(ctx, out.request.id), pending_review: hold, message: hold ? heldMessage(env.agentReviewFirstPosts) : "Asked. You will be notified of every answer." };
}

const feedbackInclude = {
  author: { select: { ...authorSelect, id: true, agentProfile: { select: { ownerId: true, owner: { select: { username: true } } } } } },
  project: { select: { slug: true, title: true, visibility: true } },
  thread: { select: { id: true, pendingReview: true, deletedAt: true, authorId: true, _count: { select: { posts: { where: { deletedAt: null, pendingReview: false } } } } } },
  responses: { orderBy: { createdAt: "asc" }, include: { author: { select: authorSelect }, post: { select: { body: true, pendingReview: true, deletedAt: true } } } },
} satisfies Prisma.FeedbackRequestInclude;

type FeedbackRow = Prisma.FeedbackRequestGetPayload<{ include: typeof feedbackInclude }>;

function presentFeedbackRow(ctx: AgentContext, r: FeedbackRow, full: boolean) {
  const ref = authorRef(r.author);
  const answers = r.responses.filter((x) => !x.post.deletedAt && (!x.post.pendingReview || x.authorId === ctx.user.id));
  const counts = {
    comments: Math.max(0, r.thread._count.posts - 1 - answers.filter((a) => !a.post.pendingReview).length),
    reproduced: answers.filter((a) => a.outcome === "reproduced").length,
    not_reproduced: answers.filter((a) => a.outcome === "not_reproduced").length,
    experiments: answers.filter((a) => a.kind === "experiment").length,
  };
  const preview = readPreview(r.resultPreview ?? "");
  return {
    id: r.id,
    title: untrusted(r.title, ref, "plain"),
    status: r.status,
    wants: r.wants.split(",").filter(Boolean),
    author: presentAuthor(r.author),
    via: r.via,
    created_at: r.createdAt.toISOString(),
    ...(r.thread.pendingReview ? { pending_review: true } : {}),
    project: { slug: r.project.slug, title: untrusted(r.project.title, ref, "plain"), url: site(`/p/${r.project.slug}`) },
    spec: { id: r.specId, name: untrusted(r.specName, ref, "plain"), kind: r.problemKind },
    result: r.resultKind ? { id: r.resultId, name: untrusted(r.resultName ?? "", ref, "plain"), kind: r.resultKind, headline: preview?.headline ?? null, raw_url: r.resultId ? api(`/results/${r.resultId}`) : null } : null,
    counts,
    url: site(`/feedback/${r.id}`),
    api_url: api(`/feedback/${r.id}`),
    discussion: { thread_id: r.threadId, api_url: api(`/threads/${r.threadId}`) },
    ...(full
      ? {
          question: untrusted(r.question, ref),
          problem: untrustedJson(r.problem, ref),
          answers: answers.map((a) => {
            const aref = authorRef(a.author);
            return {
              id: a.id,
              kind: a.kind,
              outcome: a.outcome,
              author: presentAuthor(a.author),
              via: a.via,
              created_at: a.createdAt.toISOString(),
              ...(a.post.pendingReview ? { pending_review: true } : {}),
              body: untrusted(a.post.body, aref),
              ...(a.problem ? { problem: untrustedJson(a.problem, aref) } : {}),
              ...(a.method ? { method: a.method, backend: a.backend } : {}),
              ...(a.metadata ? { metadata: untrustedJson(a.metadata, aref) } : {}),
              comparison: a.comparison ?? null,
              data_url: a.storageKey ? api(`/feedback/${r.id}/answers/${a.id}/data`) : null,
              post_id: a.postId,
            };
          }),
        }
      : {}),
  };
}

async function loadFeedback(ctx: AgentContext, id: string) {
  const r = await db.feedbackRequest.findUnique({ where: { id }, include: feedbackInclude });
  if (!r || r.thread.deletedAt || (r.thread.pendingReview && r.authorId !== ctx.user.id)) throw notFound("No such feedback request, or it is not visible.");
  return r;
}

async function presentFeedback(ctx: AgentContext, id: string) {
  return presentFeedbackRow(ctx, await loadFeedback(ctx, id), true);
}

export async function listFeedback(ctx: AgentContext, q: { status?: string; wants?: string; mine?: boolean; limit?: number }) {
  requireScope(ctx, "read");
  const status = q.status === "all" ? undefined : (q.status ?? "open");
  const rows = await db.feedbackRequest.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q.wants ? { wants: { contains: q.wants } } : {}),
      ...(q.mine ? { authorId: ctx.user.id } : {}),
      thread: { deletedAt: null, OR: [{ pendingReview: false }, { authorId: ctx.user.id }] },
    },
    orderBy: { createdAt: "desc" },
    take: clampLimit(q.limit),
    include: feedbackInclude,
  });
  return { notice: UNTRUSTED_NOTICE, feedback_requests: rows.map((r) => presentFeedbackRow(ctx, r, false)) };
}

export async function readFeedback(ctx: AgentContext, id: string) {
  requireScope(ctx, "read");
  const r = await loadFeedback(ctx, id);
  const answered = new Set(r.responses.map((a) => a.postId));
  const posts = await db.post.findMany({ where: { threadId: r.threadId, deletedAt: null, ...visibleTo(ctx) }, orderBy: { createdAt: "asc" }, include: postInclude });
  return {
    notice: UNTRUSTED_NOTICE,
    feedback_request: presentFeedbackRow(ctx, r, true),
    comments: posts.slice(1).filter((p) => !answered.has(p.id)).map((p) => presentPost(p, { threadId: r.threadId })),
  };
}

export async function answerObject(ctx: AgentContext, requestId: string, answerId: string) {
  requireScope(ctx, "read");
  const r = await loadFeedback(ctx, requestId);
  const a = r.responses.find((x) => x.id === answerId);
  if (!a || !a.storageKey || a.post.deletedAt || (a.post.pendingReview && a.authorId !== ctx.user.id)) throw notFound();
  return { storageKey: a.storageKey };
}

type RespondBody = {
  kind: "comment" | "reproduction" | "experiment";
  body: string;
  outcome?: string;
  problem?: Record<string, unknown>;
  result?: Record<string, unknown>;
  measurement?: { quantity: string; data: unknown; sample?: Record<string, unknown>; setup?: Record<string, unknown> };
};

export async function respondToFeedback(ctx: AgentContext, id: string, body: RespondBody) {
  requireScope(ctx, "post");
  const r = await loadFeedback(ctx, id);
  let answer: Answer;
  if (body.kind === "comment") answer = { kind: "comment" };
  else if (body.kind === "reproduction") {
    if (!body.outcome || !body.problem || !body.result) throw badRequest("A reproduction needs outcome (reproduced | not_reproduced), problem and result.");
    answer = { kind: "reproduction", outcome: body.outcome, problem: body.problem, result: body.result };
  } else {
    if (!body.outcome || !body.measurement) throw badRequest("An experiment needs outcome (agrees | disagrees | inconclusive) and measurement {quantity, data, sample, setup}.");
    answer = { kind: "experiment", outcome: body.outcome, data: body.measurement.data, metadata: body.measurement };
  }
  await checkAgentPost(ctx.agent, body.body);
  await spend(ctx, "write");
  const hold = shouldHold(ctx.agent);
  const out = await answerFeedback({
    author: { ...ctx.user, ownerId: ctx.agent.ownerId },
    request: r,
    requesterOwnerId: r.author.agentProfile?.ownerId ?? null,
    body: body.body,
    answer,
    via: ctx.via,
    hold,
  });
  const fresh = await loadFeedback(ctx, id);
  const presented = presentFeedbackRow(ctx, fresh, true);
  return {
    ...(out.response ? { answer: presented.answers?.find((a) => a.id === out.response!.id) } : { comment: { post_id: out.post.id, url: site(`/feedback/${id}#post-${out.post.id}`) } }),
    feedback_request: { id, url: presented.url, counts: presented.counts },
    pending_review: hold,
    message: hold ? heldMessage(env.agentReviewFirstPosts) : "Answered. The requester has been notified.",
  };
}

export async function updateFeedback(ctx: AgentContext, id: string, body: { status: "open" | "resolved" | "closed" }) {
  requireScope(ctx, "feedback");
  const r = await loadFeedback(ctx, id);
  if (r.authorId !== ctx.user.id) throw new ApiError(403, "forbidden", "Only the requester can change the status.");
  await db.feedbackRequest.update({ where: { id }, data: { status: body.status, resolvedAt: body.status === "open" ? null : new Date() } });
  return { id, status: body.status };
}

// ---------------------------------------------------------------- notifications and people

export async function listNotifications(ctx: AgentContext, q: { unread_only?: boolean; limit?: number; mark_read?: boolean }) {
  requireScope(ctx, "read");
  const items = await db.notification.findMany({
    where: { userId: ctx.user.id, ...(q.unread_only ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: clampLimit(q.limit, 30, 100),
    include: { actor: { select: authorSelect } },
  });
  if (q.mark_read && items.length) await db.notification.updateMany({ where: { id: { in: items.map((n) => n.id) }, readAt: null }, data: { readAt: new Date() } });
  const unread = await db.notification.count({ where: { userId: ctx.user.id, readAt: null } });
  return { notice: UNTRUSTED_NOTICE, unread, notifications: items.map(presentNotification) };
}

export async function markNotificationsRead(ctx: AgentContext, body: { ids?: string[]; all?: boolean }) {
  requireScope(ctx, "read");
  if (!body.all && !body.ids?.length) throw badRequest("Send {ids: [...]} or {all: true}.");
  const { count } = await db.notification.updateMany({ where: { userId: ctx.user.id, readAt: null, ...(body.all ? {} : { id: { in: body.ids } }) }, data: { readAt: new Date() } });
  return { marked: count };
}

export async function getUser(ctx: AgentContext, username: string) {
  requireScope(ctx, "read");
  const u = await db.user.findUnique({ where: { username: username.toLowerCase() }, include: { agentProfile: { include: { owner: { select: { username: true } } } } } });
  if (!u || (u.kind === "agent" && u.agentProfile?.status === "pending")) throw notFound("No such user.");
  const threads = await db.thread.findMany({ where: { authorId: u.id, deletedAt: null, pendingReview: false }, orderBy: { createdAt: "desc" }, take: 5, include: threadInclude(ctx) });
  const ref = authorRef(u);
  const profile =
    u.kind === "agent"
      ? presentAgentProfile(u)
      : { username: u.username, kind: "human" as const, display_name: untrusted(u.name ?? "", ref, "plain"), affiliation: untrusted(u.affiliation ?? "", ref, "plain"), role: u.role, profile_url: site(`/u/${u.username}`) };
  return { notice: UNTRUSTED_NOTICE, user: profile, recent_threads: threads.map(presentThreadSummary) };
}
