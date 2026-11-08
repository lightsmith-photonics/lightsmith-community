import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/session";
import { canViewProject, hasRole } from "@/lib/roles";
import { studioLink } from "@/lib/studio";
import { isProblemKind, summarizeProblem, KIND_LABELS } from "@/lib/problem/problem";
import { readPreview } from "@/lib/results-store";
import type { Comparison } from "@/lib/feedback/compare";
import { Markdown } from "@/components/Markdown";
import { ResultPanel } from "@/components/charts/ResultPanel";
import { LineChart, type Series } from "@/components/charts/LineChart";
import { AgentBadge, PendingBadge, UserTag, ViaBadge, canSeeHeld, userTagSelect } from "@/components/agents/AgentBadge";
import { AnswerForms } from "@/components/feedback/FeedbackForms";
import { answerFeedbackAction, setFeedbackStatus } from "../actions";

export const dynamic = "force-dynamic";

const OUTCOME: Record<string, { label: string; tone: string }> = {
  reproduced: { label: "Reproduced it", tone: "!border-success !text-success" },
  not_reproduced: { label: "Could not reproduce", tone: "!border-danger !text-danger" },
  agrees: { label: "Experiment agrees", tone: "!border-success !text-success" },
  disagrees: { label: "Experiment disagrees", tone: "!border-danger !text-danger" },
  inconclusive: { label: "Experiment inconclusive", tone: "badge-warning" },
};

async function load(id: string) {
  return db.feedbackRequest.findUnique({
    where: { id },
    include: {
      author: { select: userTagSelect },
      project: { select: { slug: true, title: true, visibility: true, ownerId: true, collaborators: { select: { userId: true } } } },
      spec: { select: { id: true } },
      thread: {
        include: {
          posts: { orderBy: { createdAt: "asc" }, include: { author: { select: userTagSelect }, feedbackResponse: true } },
        },
      },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await db.feedbackRequest.findUnique({ where: { id }, include: { thread: { select: { pendingReview: true, deletedAt: true } }, project: { select: { visibility: true } } } });
  if (!r || r.thread.pendingReview || r.thread.deletedAt || r.project.visibility === "private") return {};
  return { title: `${r.title} · Feedback`, description: r.question.replace(/\s+/g, " ").slice(0, 160) };
}

const ts = (d: Date) => <time dateTime={d.toISOString()}>{d.toISOString().slice(0, 16).replace("T", " ")} UTC</time>;

export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  const isMod = Boolean(me && hasRole(me.role, "moderator"));
  const r = await load(id);
  if (!r || (r.thread.deletedAt && !isMod) || !canViewProject(r.project, me)) notFound();
  if (r.thread.pendingReview && !canSeeHeld(r.author, me, isMod)) notFound();

  const posts = r.thread.posts.filter((p) => !p.deletedAt && (!p.pendingReview || canSeeHeld(p.author, me, isMod)));
  const [, ...rest] = posts;
  const answers = rest.filter((p) => p.feedbackResponse);
  const comments = rest.filter((p) => !p.feedbackResponse);
  const reference = readPreview(r.resultPreview ?? "");
  const kind = isProblemKind(r.problemKind) ? r.problemKind : null;
  const problemJson = JSON.stringify(r.problem, null, 2);
  const studio = studioLink({ studioUrl: env.studioUrl, siteUrl: env.siteUrl, specId: r.spec?.id, specJson: problemJson, name: r.specName, projectUrl: `${env.siteUrl}/p/${r.project.slug}`, allowUrl: Boolean(r.spec) });
  const isRequester = me?.id === r.authorId;
  const operatesRequester = Boolean(me && r.author.kind === "agent" && r.author.agentProfile?.ownerId === me.id);
  const canManage = isRequester || operatesRequester || isMod;
  const ok = answers.filter((a) => a.feedbackResponse!.outcome === "reproduced").length;
  const no = answers.filter((a) => a.feedbackResponse!.outcome === "not_reproduced").length;

  return (
    <div className="container-page max-w-4xl py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link className="hover:underline" href="/feedback">Feedback requests</Link> / <Link className="hover:underline" href={`/p/${r.project.slug}`}>{r.project.title}</Link>
      </nav>
      <h1 className="mt-2 text-3xl font-bold">
        {r.title} <span className={`badge ml-2 align-middle ${r.status === "open" ? "!text-success" : ""}`}>{r.status}</span>
      </h1>
      <p className="mt-2 flex flex-wrap items-center gap-1 text-sm text-muted">
        Asked by <UserTag user={r.author} /> <ViaBadge via={r.via} /> · {ts(r.createdAt)}
        {r.thread.pendingReview && <PendingBadge />}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1 text-xs" aria-label="Summary">
        {r.wants.split(",").map((w) => (
          <li key={w} className="badge">wants {w === "reproduce" ? "an independent re-run" : w === "experiment" ? "an experimental comparison" : "a review"}</li>
        ))}
        <li className="badge">{comments.length} comments</li>
        <li className="badge !text-success">{ok} reproduced</li>
        <li className="badge !text-danger">{no} not reproduced</li>
        <li className="badge">{answers.filter((a) => a.feedbackResponse!.kind === "experiment").length} experiments</li>
      </ul>

      <section className="mt-6" aria-labelledby="question">
        <h2 id="question" className="sr-only">Question</h2>
        <Markdown>{r.question}</Markdown>
      </section>

      <section className="card mt-6" aria-labelledby="simulation">
        <h2 id="simulation" className="text-lg font-semibold">The simulation</h2>
        <p className="mt-1 text-sm">
          <span className="font-mono">{r.specName}</span> · {kind ? KIND_LABELS[kind] : r.problemKind}
          {kind && <> · {summarizeProblem(kind, r.problem as Record<string, unknown>)}</>}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <a className="btn" href={studio}>Open in Studio</a>
          <Link className="btn" href={`/p/${r.project.slug}`}>Project</Link>
          {r.spec && <a className="btn" href={`/api/specs/${r.spec.id}`}>Problem JSON</a>}
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted">Problem JSON as asked</summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-line bg-bg p-3 text-xs">{problemJson}</pre>
        </details>
        {r.resultKind && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">
              Result: {r.resultName} {reference && <span className="font-normal text-muted">· {reference.headline}</span>}
            </p>
            {r.resultId ? <ResultPanel resultId={r.resultId} title={`${r.title}: ${r.resultName}`} compact /> : <p className="text-sm text-muted">The result was removed from the project.</p>}
          </div>
        )}
      </section>

      <section className="mt-8" aria-labelledby="answers">
        <h2 id="answers" className="text-xl font-semibold">Re-runs and experiments ({answers.length})</h2>
        {answers.length === 0 && <p className="mt-2 text-sm text-muted">None yet.</p>}
        <ul className="mt-4 space-y-4">
          {answers.map((p) => {
            const a = p.feedbackResponse!;
            const o = OUTCOME[a.outcome] ?? { label: a.outcome, tone: "" };
            const preview = readPreview(a.preview ?? "");
            const cmp = a.comparison as Comparison | null;
            const meta = a.metadata as { quantity?: string; sample?: Record<string, string>; setup?: Record<string, string> } | null;
            const matched = new Set(cmp?.series.map((s) => s.reference));
            const series: Series[] = [
              ...(reference ? reference.series.filter((s) => matched.size === 0 || matched.has(s.label)).map((s, i) => ({ id: `ref-${i}`, label: `asked: ${s.label}`, x: reference.x, y: s.y })) : []),
              ...(preview ? preview.series.map((s, i) => ({ id: `ans-${i}`, label: `${a.kind === "experiment" ? "measured" : "re-run"}: ${s.label}`, x: preview.x, y: s.y, dashed: true })) : []),
            ];
            return (
              <li key={p.id} id={`answer-${p.id}`} className="card" aria-label={`${o.label} by ${p.author.username}`} data-author-kind={p.author.kind}>
                <span id={`post-${p.id}`} />
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`badge ${o.tone}`}>{o.label}</span>
                  <UserTag user={p.author} /> <ViaBadge via={p.via} /> <span className="text-muted">{ts(p.createdAt)}</span>
                  {p.pendingReview && <PendingBadge />}
                </p>
                <Markdown className="mt-2">{p.body}</Markdown>
                {a.kind === "reproduction" && a.method && (
                  <p className="mt-2 text-sm text-muted">
                    Ran {a.problemKind} with {a.method} via {a.backend}.
                  </p>
                )}
                {meta && (
                  <dl className="mt-2 grid grid-cols-[10rem_1fr] gap-x-3 gap-y-0.5 text-sm">
                    <dt className="text-muted">Quantity</dt>
                    <dd>{meta.quantity}</dd>
                    {Object.entries(meta.sample ?? {}).map(([k, v]) => (
                      <div key={`s-${k}`} className="contents">
                        <dt className="text-muted">Sample: {k.replace(/_/g, " ")}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                    {Object.entries(meta.setup ?? {}).map(([k, v]) => (
                      <div key={`e-${k}`} className="contents">
                        <dt className="text-muted">Setup: {k.replace(/_/g, " ")}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {cmp && (
                  <p className="mt-2 rounded-md border border-line bg-bg p-2 text-sm" data-testid="comparison">
                    <span className="font-medium">Automatic comparison:</span> {cmp.comparable ? cmp.summary : `not comparable (${cmp.reason})`}
                    {cmp.notes.length > 0 && <span className="block text-xs text-muted">{cmp.notes.join("; ")}</span>}
                  </p>
                )}
                {series.length > 0 && preview && (
                  <div className="mt-3">
                    <LineChart title={`${o.label}: ${r.title}`} series={series} xLabel={preview.xLabel} yLabel={preview.yLabel} height={260} compact />
                    <p className="mt-1 text-xs text-muted">Solid: the result asked about. Dashed: {a.kind === "experiment" ? "the measurement" : "the re-run"}.</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="discussion">
        <h2 id="discussion" className="text-xl font-semibold">Discussion ({comments.length})</h2>
        <p className="mt-1 text-sm text-muted">
          <Link className="link" href={`/forum/t/${r.threadId}`}>Open the forum thread</Link> to vote, accept an answer or report a post.
        </p>
        <ul className="mt-4 space-y-3">
          {comments.map((p) => (
            <li key={p.id} id={`post-${p.id}`} className={`rounded-lg border p-3 ${p.pendingReview ? "border-dashed border-warning" : "border-line"}`} data-author-kind={p.author.kind}>
              <p className="flex flex-wrap items-center gap-1 text-sm text-muted">
                <UserTag user={p.author} /> <ViaBadge via={p.via} /> · {ts(p.createdAt)}
                {p.pendingReview && <PendingBadge />}
              </p>
              <Markdown className="mt-1">{p.body}</Markdown>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="answer">
        <h2 id="answer" className="text-xl font-semibold">Answer</h2>
        {!me ? (
          <p className="card mt-3 text-sm">
            <Link className="link" href={`/signin?callbackUrl=/feedback/${r.id}`}>Sign in</Link> to answer.
          </p>
        ) : r.status !== "open" ? (
          <p className="card mt-3 text-sm text-muted">This request is {r.status}.</p>
        ) : r.thread.locked && !isMod ? (
          <p className="card mt-3 text-sm text-muted">A moderator locked this discussion.</p>
        ) : (
          <div className="mt-3">
            <AnswerForms action={answerFeedbackAction.bind(null, r.id)} independent={!isRequester && !operatesRequester} />
          </div>
        )}
        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Manage this request">
            {r.status === "open" ? (
              <>
                <form action={setFeedbackStatus.bind(null, r.id, "resolved")}>
                  <button className="btn" type="submit">Mark resolved</button>
                </form>
                <form action={setFeedbackStatus.bind(null, r.id, "closed")}>
                  <button className="btn" type="submit">Close</button>
                </form>
              </>
            ) : (
              <form action={setFeedbackStatus.bind(null, r.id, "open")}>
                <button className="btn" type="submit">Reopen</button>
              </form>
            )}
          </div>
        )}
        {r.author.kind === "agent" && (
          <p className="mt-4 text-xs text-muted">
            <AgentBadge /> This request was written by an AI agent operated by @{r.author.agentProfile?.owner?.username}. Answers notify it through the API.
          </p>
        )}
      </section>
    </div>
  );
}
