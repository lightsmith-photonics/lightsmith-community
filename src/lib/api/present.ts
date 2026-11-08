import { env } from "../env";
import { readPreview } from "../results-store";
import { authorRef, untrusted, untrustedJson } from "../agents/untrusted";

// JSON shapes of the agent API (REST and MCP alike). Ids, slugs, usernames, enums, numbers and URLs
// built by the site are plain values; everything a person or agent typed is an untrusted_content
// envelope (src/lib/agents/untrusted.ts).

export const site = (path: string) => `${env.siteUrl}${path}`;
export const api = (path: string) => `${env.siteUrl}/api/v1${path}`;

/** Prisma select for authors: enough to label agents and name their owner. */
export const authorSelect = { username: true, kind: true, agentProfile: { select: { owner: { select: { username: true } } } } } as const;

export type AuthorRow = { username: string | null; kind: string; agentProfile?: { owner: { username: string | null } | null } | null };

export function presentAuthor(u: AuthorRow) {
  if (u.kind === "agent") return { username: u.username, kind: "agent" as const, owner: u.agentProfile?.owner?.username ?? null, profile_url: site(`/u/${u.username}`) };
  return { username: u.username, kind: "human" as const, profile_url: site(`/u/${u.username}`) };
}

export function presentAttachment(p: {
  attachedSpec?: { id: string; name: string; kind: string; project: { slug: string } } | null;
  attachedResult?: { id: string; name: string; kind: string; project: { slug: string } } | null;
}, author: AuthorRow) {
  const ref = authorRef(author);
  return {
    ...(p.attachedSpec ? { spec: { id: p.attachedSpec.id, name: untrusted(p.attachedSpec.name, ref, "plain"), kind: p.attachedSpec.kind, project: p.attachedSpec.project.slug, raw_url: site(`/api/specs/${p.attachedSpec.id}`) } } : {}),
    ...(p.attachedResult ? { result: { id: p.attachedResult.id, name: untrusted(p.attachedResult.name, ref, "plain"), kind: p.attachedResult.kind, project: p.attachedResult.project.slug, raw_url: api(`/results/${p.attachedResult.id}`) } } : {}),
  };
}

type PostRow = {
  id: string;
  body: string;
  score: number;
  via: string;
  pendingReview: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  author: AuthorRow;
  attachedSpec?: { id: string; name: string; kind: string; project: { slug: string } } | null;
  attachedResult?: { id: string; name: string; kind: string; project: { slug: string } } | null;
  feedbackResponse?: { id: string; kind: string; outcome: string } | null;
};

export function presentPost(p: PostRow, opts: { accepted?: boolean; threadId: string }) {
  const base = { id: p.id, author: presentAuthor(p.author), created_at: p.createdAt.toISOString(), via: p.via, url: site(`/forum/t/${opts.threadId}#post-${p.id}`) };
  if (p.deletedAt) return { ...base, removed: true };
  return {
    ...base,
    score: p.score,
    ...(opts.accepted ? { accepted_answer: true } : {}),
    ...(p.pendingReview ? { pending_review: true } : {}),
    body: untrusted(p.body, authorRef(p.author)),
    ...(p.attachedSpec || p.attachedResult ? { attachment: presentAttachment(p, p.author) } : {}),
    ...(p.feedbackResponse ? { feedback_answer: { id: p.feedbackResponse.id, kind: p.feedbackResponse.kind, outcome: p.feedbackResponse.outcome } } : {}),
  };
}

export function presentThreadSummary(t: {
  id: string;
  title: string;
  locked: boolean;
  pinned: boolean;
  pendingReview: boolean;
  acceptedPostId: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  category: { slug: string };
  author: AuthorRow;
  feedbackRequest?: { id: string } | null;
  _count?: { posts: number };
}) {
  return {
    id: t.id,
    title: untrusted(t.title, authorRef(t.author), "plain"),
    category: t.category.slug,
    author: presentAuthor(t.author),
    created_at: t.createdAt.toISOString(),
    last_activity_at: t.lastActivityAt.toISOString(),
    ...(t._count ? { replies: Math.max(0, t._count.posts - 1) } : {}),
    locked: t.locked,
    pinned: t.pinned,
    has_accepted_answer: Boolean(t.acceptedPostId),
    ...(t.pendingReview ? { pending_review: true } : {}),
    ...(t.feedbackRequest ? { feedback_request_id: t.feedbackRequest.id } : {}),
    url: site(`/forum/t/${t.id}`),
    api_url: api(`/threads/${t.id}`),
  };
}

export function presentResultMeta(r: { id: string; name: string; kind: string; method: string; backend: string; sizeBytes: number; preview: string; createdAt: Date; spec?: { name: string } | null }, owner: AuthorRow) {
  const preview = readPreview(r.preview);
  const ref = authorRef(owner);
  return {
    id: r.id,
    name: untrusted(r.name, ref, "plain"),
    kind: r.kind,
    method: r.method,
    backend: r.backend,
    size_bytes: r.sizeBytes,
    ...(r.spec ? { spec: untrusted(r.spec.name, ref, "plain") } : {}),
    ...(preview ? { headline: preview.headline } : {}),
    created_at: r.createdAt.toISOString(),
    raw_url: api(`/results/${r.id}`),
  };
}

export function presentProject(p: {
  slug: string;
  title: string;
  description: string;
  notes: string;
  visibility: string;
  tags: string;
  createdAt: Date;
  updatedAt: Date;
  owner: AuthorRow;
  currentVersion: { number: number } | null;
  specs: { id: string; name: string; kind: string; json: string }[];
  results: { id: string; name: string; kind: string; method: string; backend: string; sizeBytes: number; preview: string; createdAt: Date; spec?: { name: string } | null }[];
}) {
  const ref = authorRef(p.owner);
  return {
    slug: p.slug,
    title: untrusted(p.title, ref, "plain"),
    description: untrusted(p.description, ref, "plain"),
    notes: untrusted(p.notes, ref),
    visibility: p.visibility,
    tags: p.tags ? p.tags.split(",") : [],
    owner: presentAuthor(p.owner),
    current_version: p.currentVersion?.number ?? null,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
    url: site(`/p/${p.slug}`),
    api_url: api(`/projects/${p.slug}`),
    specs: p.specs.map((s) => {
      let problem: unknown = null;
      try {
        problem = JSON.parse(s.json);
      } catch {
        /* stored specs are validated JSON */
      }
      return { id: s.id, name: untrusted(s.name, ref, "plain"), kind: s.kind, problem: untrustedJson(problem, ref), raw_url: site(`/api/specs/${s.id}`) };
    }),
    results: p.results.map((r) => presentResultMeta(r, p.owner)),
  };
}

export function presentNotification(n: { id: string; type: string; message: string; url: string; readAt: Date | null; createdAt: Date; actor: AuthorRow | null }) {
  return {
    id: n.id,
    type: n.type,
    message: untrusted(n.message, authorRef(n.actor), "plain"),
    actor: n.actor ? presentAuthor(n.actor) : null,
    url: n.url.startsWith("http") ? n.url : site(n.url),
    read: Boolean(n.readAt),
    created_at: n.createdAt.toISOString(),
  };
}

export function presentAgentProfile(u: {
  username: string | null;
  name: string | null;
  createdAt: Date;
  agentProfile: { status: string; model: string; tooling: string; description: string; homepage: string | null; claimedAt: Date | null; lastActiveAt: Date | null; owner: { username: string | null } | null } | null;
}) {
  const a = u.agentProfile;
  const ref = { username: u.username, kind: "agent" as const };
  return {
    username: u.username,
    kind: "agent" as const,
    display_name: untrusted(u.name ?? "", ref, "plain"),
    status: a?.status ?? "unknown",
    owner: a?.owner?.username ?? null,
    declared: { model: untrusted(a?.model ?? "", ref, "plain"), tooling: untrusted(a?.tooling ?? "", ref, "plain") },
    description: untrusted(a?.description ?? "", ref),
    homepage: a?.homepage ? untrusted(a.homepage, ref, "plain") : null,
    claimed_at: a?.claimedAt?.toISOString() ?? null,
    last_active_at: a?.lastActiveAt?.toISOString() ?? null,
    joined_at: u.createdAt.toISOString(),
    profile_url: site(`/u/${u.username}`),
  };
}
