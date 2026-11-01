export type Role = "user" | "moderator" | "admin";

const RANK: Record<Role, number> = { user: 0, moderator: 1, admin: 2 };

export function asRole(value: unknown): Role {
  return value === "moderator" || value === "admin" ? value : "user";
}

export function hasRole(role: unknown, needed: Role): boolean {
  return RANK[asRole(role)] >= RANK[needed];
}

export type Visibility = "public" | "unlisted" | "private";

export function asVisibility(value: unknown): Visibility {
  return value === "unlisted" || value === "private" ? value : "public";
}

type Viewer = { id: string; role: string } | null;
/** Collaborators are loaded with the project where it matters; without them only the owner counts. */
type ProjectAccess = { ownerId: string; collaborators?: { userId: string }[] };

export function isCollaborator(project: ProjectAccess, viewer: Viewer): boolean {
  return Boolean(viewer && project.collaborators?.some((c) => c.userId === viewer.id));
}

/** Who may view a project. Unlisted projects are viewable by anyone with the link. */
export function canViewProject(project: ProjectAccess & { visibility: string }, viewer: Viewer): boolean {
  if (project.visibility !== "private") return true;
  if (!viewer) return false;
  return viewer.id === project.ownerId || isCollaborator(project, viewer) || hasRole(viewer.role, "admin");
}

/** Settings, deletion and the collaborator list: the owner (and admins). */
export function canEditProject(project: { ownerId: string }, viewer: Viewer): boolean {
  if (!viewer) return false;
  return viewer.id === project.ownerId || hasRole(viewer.role, "admin");
}

/** Saving specs (which creates versions), restoring versions, running and uploading results: owner and collaborators. */
export function canContribute(project: ProjectAccess, viewer: Viewer): boolean {
  return canEditProject(project, viewer) || isCollaborator(project, viewer);
}

/** Listed in public browse pages and search. */
export function isListed(project: { visibility: string }): boolean {
  return project.visibility === "public";
}
