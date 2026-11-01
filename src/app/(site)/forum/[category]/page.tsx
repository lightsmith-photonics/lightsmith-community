import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const c = await db.forumCategory.findUnique({ where: { slug: category } });
  return c ? { title: `${c.name} · Forum`, description: c.description } : {};
}

const PER_PAGE = 30;

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ category: string }>; searchParams: Promise<{ page?: string }> }) {
  const { category } = await params;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const c = await db.forumCategory.findUnique({ where: { slug: category } });
  if (!c) notFound();
  const [threads, total] = await Promise.all([
    db.thread.findMany({
      where: { categoryId: c.id, deletedAt: null },
      orderBy: [{ pinned: "desc" }, { lastActivityAt: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        author: { select: { username: true } },
        _count: { select: { posts: { where: { deletedAt: null } } } },
        posts: { orderBy: { createdAt: "asc" }, take: 1, select: { score: true } },
      },
    }),
    db.thread.count({ where: { categoryId: c.id, deletedAt: null } }),
  ]);
  return (
    <div className="container-page py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link className="hover:underline" href="/forum">Forum</Link> / {c.name}
      </nav>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{c.name}</h1>
          <p className="mt-1 text-muted">{c.description}</p>
        </div>
        <Link className="btn-primary" href={`/forum/new?category=${c.slug}`}>New thread</Link>
      </div>
      {threads.length === 0 ? (
        <p className="mt-8 text-muted">No threads yet — start one.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line">
          {threads.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex w-16 flex-col items-center text-xs text-muted" aria-label={`${t.posts[0]?.score ?? 0} votes`}>
                <span className="text-lg font-semibold text-fg">{t.posts[0]?.score ?? 0}</span>votes
              </div>
              <div className={`flex w-16 flex-col items-center rounded-md text-xs ${t.acceptedPostId ? "border border-success text-success" : "text-muted"}`}>
                <span className="text-lg font-semibold">{Math.max(0, t._count.posts - 1)}</span>replies
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">
                  {t.pinned && <span className="badge mr-2">pinned</span>}
                  {t.locked && <span className="badge mr-2">locked</span>}
                  <Link className="hover:underline" href={`/forum/t/${t.id}`}>{t.title}</Link>
                  {t.acceptedPostId && <span className="sr-only"> (answered)</span>}
                </h2>
                <p className="text-xs text-muted">
                  by @{t.author.username} · active <time dateTime={t.lastActivityAt.toISOString()}>{t.lastActivityAt.toISOString().slice(0, 10)}</time>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {total > PER_PAGE && (
        <nav aria-label="Pagination" className="mt-4 flex gap-2">
          {page > 1 && <Link className="btn" href={`?page=${page - 1}`}>Previous</Link>}
          {page * PER_PAGE < total && <Link className="btn" href={`?page=${page + 1}`}>Next</Link>}
        </nav>
      )}
    </div>
  );
}
