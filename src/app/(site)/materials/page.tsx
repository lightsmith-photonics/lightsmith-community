import Link from "next/link";
import { materialsApi } from "@/lib/materials";
import { MaterialsMockBanner } from "@/components/materials/MockBanner";

export const metadata = { title: "Materials", description: "Optical constants with per-paper citations: n, k and permittivity of metals, semiconductors and dielectrics." };
export const dynamic = "force-dynamic";

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const category = sp.category ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const api = materialsApi();
  const [categories, results] = await Promise.all([api.categories(), api.search({ q, category, page, per_page: 24 })]);
  const pages = Math.ceil(results.total / results.per_page);
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(category ? { category } : {}), ...over });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `/materials?${p}`;
  };

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Materials</h1>
          <p className="mt-1 text-muted">Optical constants with the paper they came from.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/materials/compare" className="btn">
            Compare datasets
          </Link>
          <Link href="/materials/contribute" className="btn-primary">
            Contribute data
          </Link>
        </div>
      </div>
      <div className="mt-4">
        <MaterialsMockBanner />
      </div>

      <form role="search" action="/materials" className="mt-6 flex gap-2">
        <label htmlFor="mq" className="sr-only">
          Search materials
        </label>
        <input id="mq" name="q" defaultValue={q} className="input" placeholder="Search by name, formula, alias or author (e.g. gold, TiO2, Johnson)" />
        {category && <input type="hidden" name="category" value={category} />}
        <button className="btn-primary" type="submit">
          Search
        </button>
      </form>

      <nav aria-label="Categories" className="mt-4">
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link href={qs({ category: "", page: "" })} aria-current={!category ? "page" : undefined} className={`badge !px-3 !py-1 ${!category ? "!bg-accent !text-accent-fg" : "hover:text-fg"}`}>
              All
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <Link
                href={qs({ category: c.id, page: "" })}
                aria-current={category === c.id ? "page" : undefined}
                className={`badge !px-3 !py-1 ${category === c.id ? "!bg-accent !text-accent-fg" : "hover:text-fg"}`}
              >
                {c.name} <span className="ml-1 opacity-80">{c.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="mt-6 text-sm text-muted" aria-live="polite">
        {results.total} material{results.total === 1 ? "" : "s"}
        {q && <> matching “{q}”</>}
      </p>
      <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {results.items.map((m) => (
          <li key={m.id}>
            <Link href={`/materials/${encodeURIComponent(m.id)}`} className="card block h-full hover:border-accent">
              <span className="flex items-baseline justify-between">
                <span className="text-xl font-semibold">{m.formula}</span>
                <span className="badge">{m.category}</span>
              </span>
              <span className="mt-1 block text-sm">{m.name}</span>
              <span className="mt-2 block text-xs text-muted">
                {m.datasets.length} dataset{m.datasets.length === 1 ? "" : "s"}:{" "}
                {m.datasets
                  .slice(0, 3)
                  .map((d) => d.name)
                  .join(", ")}
                {m.datasets.length > 3 && "…"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex gap-2">
          {page > 1 && (
            <Link className="btn" href={qs({ page: String(page - 1) })}>
              Previous
            </Link>
          )}
          <span className="px-2 py-1.5 text-sm text-muted">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link className="btn" href={qs({ page: String(page + 1) })}>
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
