import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ProjectCard, projectCardSelect } from "@/components/ProjectCard";

export const metadata = { title: "Projects", description: "Shared nanophotonics simulations: specs, results and notes." };
export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; sort?: string; view?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  const q = sp.q?.trim() ?? "";
  const view = sp.view === "mine" && me ? "mine" : sp.view === "starred" && me ? "starred" : "explore";
  const sort = sp.sort === "stars" ? "stars" : "recent";
  const where: Prisma.ProjectWhereInput = {
    ...(view === "mine" ? { ownerId: me!.id } : view === "starred" ? { stars: { some: { userId: me!.id } } } : { visibility: "public" }),
    ...(sp.tag ? { tags: { contains: sp.tag.toLowerCase() } } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } }, { tags: { contains: q.toLowerCase() } }] } : {}),
  };
  const projects = await db.project.findMany({
    where,
    orderBy: sort === "stars" ? [{ stars: { _count: "desc" } }, { updatedAt: "desc" }] : { updatedAt: "desc" },
    take: 60,
    select: projectCardSelect,
  });
  const link = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(sp.tag ? { tag: sp.tag } : {}), sort, view, ...over });
    return `/projects?${p}`;
  };

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="mt-1 text-muted">Simulation specs, results and notes — fork one to start from it.</p>
        </div>
        <Link href="/projects/new" className="btn-primary">
          New project
        </Link>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <nav aria-label="Project lists">
          <ul className="flex gap-1 text-sm">
            {[
              ["explore", "Explore"],
              ...(me ? [["mine", "Mine"], ["starred", "Starred"]] : []),
            ].map(([v, label]) => (
              <li key={v}>
                <Link href={link({ view: v })} aria-current={view === v ? "page" : undefined} className={`rounded-md px-3 py-1.5 ${view === v ? "bg-accent text-accent-fg" : "hover:bg-surface"}`}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <form role="search" className="flex flex-1 gap-2" action="/projects">
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="sort" value={sort} />
          <label htmlFor="pq" className="sr-only">Search projects</label>
          <input id="pq" name="q" defaultValue={q} className="input" placeholder="Search projects" />
          <button className="btn" type="submit">Search</button>
        </form>
        <p className="text-sm">
          Sort:{" "}
          <Link className={sort === "recent" ? "font-semibold" : "link"} href={link({ sort: "recent" })}>recent</Link> ·{" "}
          <Link className={sort === "stars" ? "font-semibold" : "link"} href={link({ sort: "stars" })}>stars</Link>
        </p>
      </div>
      {sp.tag && (
        <p className="mt-3 text-sm">
          Tag <span className="badge">{sp.tag}</span> <Link className="link" href={link({ tag: "" })}>clear</Link>
        </p>
      )}
      {projects.length === 0 ? (
        <p className="mt-8 text-muted">No projects found.</p>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.slug}>
              <ProjectCard p={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
