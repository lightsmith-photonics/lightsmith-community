import "server-only";
import { db } from "./db";
import { canViewProject } from "./roles";
import type { CurrentUser } from "./session";
import { parseSnapshot } from "./versions/snapshot";

const collaborators = { select: { userId: true, user: { select: { username: true, name: true } } } } as const;
/** Enough to label an author or owner as an AI agent, name who operates it, and let that person see its private projects. */
const agentLabel = { kind: true, agentProfile: { select: { ownerId: true, owner: { select: { username: true } } } } } as const;

export async function loadProject(slug: string, viewer: CurrentUser | null) {
  const project = await db.project.findUnique({
    where: { slug },
    include: {
      owner: { select: { id: true, username: true, name: true, ...agentLabel } },
      feedback: { where: { thread: { deletedAt: null, pendingReview: false } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, title: true, status: true, resultId: true } },
      forkedFrom: { select: { slug: true, title: true, owner: { select: { username: true } } } },
      forkedFromVersion: { select: { number: true } },
      currentVersion: { select: { number: true, createdAt: true } },
      collaborators,
      specs: { orderBy: { createdAt: "asc" } },
      results: { orderBy: { createdAt: "desc" }, include: { spec: { select: { id: true, name: true } } } },
      _count: { select: { stars: true, forks: true, versions: true, feedback: { where: { thread: { deletedAt: null, pendingReview: false } } } } },
    },
  });
  if (!project || !canViewProject(project, viewer)) return null;
  const starred = viewer ? Boolean(await db.star.findUnique({ where: { userId_projectId: { userId: viewer.id, projectId: project.id } } })) : false;
  return { ...project, starred };
}

/** A spec or result is readable if its project is viewable. */
export async function loadSpec(id: string, viewer: CurrentUser | null) {
  const spec = await db.spec.findUnique({ where: { id }, include: { project: { include: { collaborators, owner: { select: { agentProfile: { select: { ownerId: true } } } } } } } });
  return spec && canViewProject(spec.project, viewer) ? spec : null;
}

export async function loadResult(id: string, viewer: CurrentUser | null) {
  const r = await db.resultRecord.findUnique({ where: { id }, include: { project: { include: { owner: { select: { username: true, agentProfile: { select: { ownerId: true } } } }, collaborators } }, spec: true } });
  return r && canViewProject(r.project, viewer) ? r : null;
}

/** Project header data for version pages, or null when the viewer may not see it. */
export async function loadProjectForVersions(slug: string, viewer: CurrentUser | null) {
  const project = await db.project.findUnique({
    where: { slug },
    include: { owner: { select: { id: true, username: true, name: true, ...agentLabel } }, collaborators, currentVersion: { select: { number: true } } },
  });
  return project && canViewProject(project, viewer) ? project : null;
}

export async function listVersions(projectId: string) {
  const rows = await db.projectVersion.findMany({
    where: { projectId },
    orderBy: { number: "desc" },
    include: { author: { select: { username: true, name: true, ...agentLabel } }, _count: { select: { results: true, forks: true } } },
  });
  return rows.map(({ specs, ...v }) => ({ ...v, specs: parseSnapshot(specs) }));
}

export async function loadVersion(projectId: string, number: number) {
  if (!Number.isSafeInteger(number) || number < 1) return null;
  const v = await db.projectVersion.findUnique({
    where: { projectId_number: { projectId, number } },
    include: { author: { select: { username: true, name: true, ...agentLabel } }, results: { orderBy: { createdAt: "desc" } } },
  });
  return v ? { ...v, specs: parseSnapshot(v.specs) } : null;
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
