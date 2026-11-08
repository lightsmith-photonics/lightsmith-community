import Link from "next/link";

/** Previous / next links for lists paged with ?page=N. Nothing when everything fits on one page. */
export function Pagination({ page, perPage, total, href, label = "Pagination" }: { page: number; perPage: number; total: number; href: (page: number) => string; label?: string }) {
  if (total <= perPage && page <= 1) return null;
  const pages = Math.max(1, Math.ceil(total / perPage));
  return (
    <nav aria-label={label} className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      {page > 1 && <Link className="btn" rel="prev" href={href(Math.min(page - 1, pages))}>Previous</Link>}
      {page < pages && <Link className="btn" rel="next" href={href(page + 1)}>Next</Link>}
      <span className="text-muted">Page {page} of {pages} · {total} in all</span>
    </nav>
  );
}
