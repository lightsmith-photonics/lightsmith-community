import Link from "next/link";
import { db } from "@/lib/db";

export const metadata = { title: "Forum", description: "Questions and discussion about nanophotonics simulation, materials and methods." };
export const dynamic = "force-dynamic";

export default async function ForumHome() {
  const categories = await db.forumCategory.findMany({
    orderBy: { position: "asc" },
    include: {
      _count: { select: { threads: { where: { deletedAt: null } } } },
      threads: { where: { deletedAt: null }, orderBy: { lastActivityAt: "desc" }, take: 1, select: { id: true, title: true, lastActivityAt: true } },
    },
  });
  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Forum</h1>
          <p className="mt-1 text-muted">Markdown, LaTeX maths and code welcome. Attach specs and results from your projects.</p>
        </div>
        <Link className="btn-primary" href="/forum/new">New thread</Link>
      </div>
      <form role="search" action="/forum/search" className="mt-6 flex max-w-xl gap-2">
        <label htmlFor="fq" className="sr-only">Search the forum</label>
        <input id="fq" name="q" className="input" placeholder="Search threads and posts" />
        <button className="btn" type="submit">Search</button>
      </form>
      <ul className="mt-8 divide-y divide-line rounded-lg border border-line">
        {categories.map((c) => (
          <li key={c.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_6rem_18rem] sm:items-center">
            <div>
              <h2 className="font-semibold">
                <Link className="hover:underline" href={`/forum/${c.slug}`}>{c.name}</Link>
              </h2>
              <p className="text-sm text-muted">{c.description}</p>
            </div>
            <p className="text-sm text-muted">{c._count.threads} threads</p>
            <p className="truncate text-sm">
              {c.threads[0] ? (
                <>
                  <span className="text-muted">Latest: </span>
                  <Link className="link" href={`/forum/t/${c.threads[0].id}`}>{c.threads[0].title}</Link>
                </>
              ) : (
                <span className="text-muted">No threads yet</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
