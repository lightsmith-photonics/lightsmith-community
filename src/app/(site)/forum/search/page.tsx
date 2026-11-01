import Link from "next/link";
import { searchForum } from "@/lib/forum/search";

export const metadata = { title: "Search the forum" };
export const dynamic = "force-dynamic";

export default async function ForumSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim() ?? "";
  const hits = q ? await searchForum(q) : [];
  return (
    <div className="container-page max-w-3xl py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link className="hover:underline" href="/forum">Forum</Link> / Search
      </nav>
      <h1 className="mt-2 text-3xl font-bold">Search</h1>
      <form role="search" className="mt-4 flex gap-2">
        <label htmlFor="sq" className="sr-only">Search terms</label>
        <input id="sq" name="q" defaultValue={q} className="input" placeholder="e.g. DDA convergence gold" autoFocus />
        <button className="btn-primary" type="submit">Search</button>
      </form>
      {q && (
        <p className="mt-4 text-sm text-muted" aria-live="polite">
          {hits.length} result{hits.length === 1 ? "" : "s"} for “{q}”
        </p>
      )}
      <ol className="mt-4 space-y-4">
        {hits.map((h) => (
          <li key={h.threadId} className="card">
            <h2 className="font-semibold">
              <Link className="hover:underline" href={`/forum/t/${h.threadId}`}>{h.title}</Link>
            </h2>
            <p className="text-xs text-muted">in {h.categoryName}</p>
            <p className="mt-2 text-sm">{h.snippet}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
