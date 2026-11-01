import Link from "next/link";

export interface ProjectCardData {
  slug: string;
  title: string;
  description: string;
  visibility: string;
  tags: string;
  updatedAt: Date;
  owner: { username: string | null; name: string | null };
  _count: { stars: number; specs: number; results: number; forks: number };
}

export function ProjectCard({ p }: { p: ProjectCardData }) {
  return (
    <article className="card flex h-full flex-col">
      <h3 className="font-semibold">
        <Link href={`/p/${p.slug}`} className="hover:underline">
          {p.title}
        </Link>
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        by {p.owner.username ? <Link href={`/u/${p.owner.username}`} className="hover:underline">@{p.owner.username}</Link> : (p.owner.name ?? "unknown")}
        {p.visibility !== "public" && <span className="badge ml-2">{p.visibility}</span>}
      </p>
      <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted">{p.description || "No description."}</p>
      <div className="mt-3 flex flex-wrap gap-1">
        {p.tags
          .split(",")
          .filter(Boolean)
          .slice(0, 4)
          .map((t) => (
            <Link key={t} href={`/projects?tag=${encodeURIComponent(t)}`} className="badge hover:text-fg">
              {t}
            </Link>
          ))}
      </div>
      <p className="mt-3 flex gap-4 text-xs text-muted">
        <span aria-label={`${p._count.stars} stars`}>★ {p._count.stars}</span>
        <span>{p._count.specs} specs</span>
        <span>{p._count.results} results</span>
        <span>{p._count.forks} forks</span>
      </p>
    </article>
  );
}

export const projectCardSelect = {
  slug: true,
  title: true,
  description: true,
  visibility: true,
  tags: true,
  updatedAt: true,
  owner: { select: { username: true, name: true } },
  _count: { select: { stars: true, specs: true, results: true, forks: true } },
} as const;
