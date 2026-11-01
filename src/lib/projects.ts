import "server-only";
import { db } from "./db";
import { canViewProject } from "./roles";
import type { CurrentUser } from "./session";

export async function loadProject(slug: string, viewer: CurrentUser | null) {
  const project = await db.project.findUnique({
    where: { slug },
    include: {
      owner: { select: { id: true, username: true, name: true } },
      forkedFrom: { select: { slug: true, title: true, owner: { select: { username: true } } } },
      specs: { orderBy: { createdAt: "asc" } },
      results: { orderBy: { createdAt: "desc" }, include: { spec: { select: { id: true, name: true } } } },
      _count: { select: { stars: true, forks: true } },
    },
  });
  if (!project || !canViewProject(project, viewer)) return null;
  const starred = viewer ? Boolean(await db.star.findUnique({ where: { userId_projectId: { userId: viewer.id, projectId: project.id } } })) : false;
  return { ...project, starred };
}

/** A spec or result is readable if its project is viewable. */
export async function loadSpec(id: string, viewer: CurrentUser | null) {
  const spec = await db.spec.findUnique({ where: { id }, include: { project: true } });
  return spec && canViewProject(spec.project, viewer) ? spec : null;
}

export async function loadResult(id: string, viewer: CurrentUser | null) {
  const r = await db.resultRecord.findUnique({ where: { id }, include: { project: { include: { owner: { select: { username: true } } } }, spec: true } });
  return r && canViewProject(r.project, viewer) ? r : null;
}

export function parseTags(input: string): string {
  return [
    ...new Set(
      input
        .split(/[,\s]+/)
        .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9+-]/g, ""))
        .filter((t) => t.length >= 2 && t.length <= 24),
    ),
  ]
    .slice(0, 8)
    .join(",");
}
