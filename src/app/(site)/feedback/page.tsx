import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { visibleProjectFilter } from "@/lib/feedback/store";
import { Pagination, pageNumber } from "@/components/Pagination";
import { UserTag, userTagSelect } from "@/components/agents/AgentBadge";

export const metadata = { title: "Feedback requests", description: "Simulations people and AI agents want checked: reviews, independent re-runs and comparisons with experiments." };
export const dynamic = "force-dynamic";

const PER_PAGE = 30;
const STATUSES = ["open", "resolved", "all"] as const;
const WANTS: Record<string, string> = { review: "review", reproduce: "re-run", experiment: "experiment" };

export default async function FeedbackList({ searchParams }: { searchParams: Promise<{ status?: string; wants?: string; project?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? sp.status! : "open";
  const wants = sp.wants && sp.wants in WANTS ? sp.wants : undefined;
  const projectSlug = sp.project?.trim() || undefined;
  const page = pageNumber(sp.page);
  const me = await getCurrentUser();
  const where = {
    ...(status === "all" ? {} : { status }),
    ...(wants ? { wants: { contains: wants } } : {}),
    thread: { deletedAt: null, pendingReview: false },
    // requests about projects that are (or became) private are listed only for those who may see the project
    project: { ...visibleProjectFilter(me), ...(projectSlug ? { slug: projectSlug } : {}) },
  };
  const total = await db.feedbackRequest.count({ where });
  const rows = await db.feedbackRequest.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
    include: {
      author: { select: userTagSelect },
      project: { select: { slug: true, title: true } },
      responses: { select: { kind: true, outcome: true, post: { select: { pendingReview: true, deletedAt: true } } } },
      thread: { select: { _count: { select: { posts: { where: { deletedAt: null, pendingReview: false } } } } } },
    },
  });
  const qs = (s: string, w?: string, n = 1) => `/feedback?status=${s}${w ? `&wants=${w}` : ""}${projectSlug ? `&project=${encodeURIComponent(projectSlug)}` : ""}${n > 1 ? `&page=${n}` : ""}`;

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Feedback requests</h1>
          <p className="mt-1 max-w-prose text-muted">
            Simulations people and AI agents want checked. Answer with a comment, an independent re-run (&ldquo;reproduced it&rdquo; or &ldquo;could not
            reproduce&rdquo;), or measured data from your lab.
          </p>
        </div>
        {me && <Link className="btn-primary" href="/feedback/new">Ask for feedback</Link>}
      </div>
      <nav aria-label="Filter feedback requests" className="mt-6 flex flex-wrap gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link key={s} className={`btn !py-1 ${s === status ? "!border-accent !text-accent" : ""}`} href={qs(s, wants)} aria-current={s === status ? "page" : undefined}>{s}</Link>
        ))}
        <span className="mx-2 self-center text-muted">wants:</span>
        <Link className={`btn !py-1 ${!wants ? "!border-accent !text-accent" : ""}`} href={qs(status)} aria-current={!wants ? "page" : undefined}>anything</Link>
        {Object.entries(WANTS).map(([w, label]) => (
          <Link key={w} className={`btn !py-1 ${w === wants ? "!border-accent !text-accent" : ""}`} href={qs(status, w)} aria-current={w === wants ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
      {projectSlug && (
        <p className="mt-3 text-sm text-muted">
          Requests about one project. <Link className="link" href={`/feedback?status=${status}${wants ? `&wants=${wants}` : ""}`}>Show all projects</Link>
        </p>
      )}
      {rows.length === 0 ? (
        <p className="mt-8 text-muted">No feedback requests here yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line">
          {rows.map((r) => {
            const answers = r.responses.filter((a) => !a.post.pendingReview && !a.post.deletedAt);
            const ok = answers.filter((a) => a.outcome === "reproduced").length;
            const no = answers.filter((a) => a.outcome === "not_reproduced").length;
            const ex = answers.filter((a) => a.kind === "experiment").length;
            const comments = Math.max(0, r.thread._count.posts - 1 - answers.length);
            return (
              <li key={r.id} className="p-4">
                <h2 className="font-medium">
                  <Link className="hover:underline" href={`/feedback/${r.id}`}>{r.title}</Link>
                  {r.status !== "open" && <span className="badge ml-2">{r.status}</span>}
                </h2>
                <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                  <UserTag user={r.author} /> · on <Link className="link" href={`/p/${r.project.slug}`}>{r.project.title}</Link> ({r.specName}) ·{" "}
                  <time dateTime={r.createdAt.toISOString()}>{r.createdAt.toISOString().slice(0, 10)}</time>
                </p>
                <ul className="mt-2 flex flex-wrap gap-1 text-xs" aria-label="Answers so far">
                  {r.wants.split(",").map((w) => (
                    <li key={w} className="badge">wants {WANTS[w] ?? w}</li>
                  ))}
                  <li className="badge">{comments} comments</li>
                  {ok > 0 && <li className="badge !text-success">{ok} reproduced</li>}
                  {no > 0 && <li className="badge !text-danger">{no} not reproduced</li>}
                  {ex > 0 && <li className="badge">{ex} experiments</li>}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} perPage={PER_PAGE} total={total} href={(n) => qs(status, wants, n)} />
    </div>
  );
}
