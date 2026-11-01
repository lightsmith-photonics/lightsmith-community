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

/** Who may view a project. Unlisted projects are viewable by anyone with the link. */
export function canViewProject(
  project: { ownerId: string; visibility: string },
  viewer: { id: string; role: string } | null,
): boolean {
  if (project.visibility !== "private") return true;
  if (!viewer) return false;
  return viewer.id === project.ownerId || hasRole(viewer.role, "admin");
}

export function canEditProject(project: { ownerId: string }, viewer: { id: string; role: string } | null): boolean {
  if (!viewer) return false;
  return viewer.id === project.ownerId || hasRole(viewer.role, "admin");
}

/** Listed in public browse pages and search. */
export function isListed(project: { visibility: string }): boolean {
  return project.visibility === "public";
}
