import type { Prisma } from "@prisma/client";
import { canViewProject, hasRole } from "../roles";

// Who sees a feedback request, its forum thread and the notifications about them: whoever may see the
// project (canViewProject in src/lib/roles.ts). A project that becomes private takes them all along,
// in every view, and they come back if it becomes visible again. Threads without a request are unaffected.

type Viewer = { id: string; role: string } | null;

/** Prisma filter for the projects `viewer` may see. */
export function visibleProjectFilter(viewer: Viewer): Prisma.ProjectWhereInput {
  if (viewer && hasRole(viewer.role, "admin")) return {};
  return { OR: [{ visibility: { not: "private" } }, ...(viewer ? [{ ownerId: viewer.id }, { collaborators: { some: { userId: viewer.id } } }, { owner: { agentProfile: { is: { ownerId: viewer.id } } } }] : [])] };
}

/** Prisma filter for the threads `viewer` may see, as far as their project goes (deleted and held threads are separate). */
export function visibleThreadFilter(viewer: Viewer): Prisma.ThreadWhereInput {
  if (viewer && hasRole(viewer.role, "admin")) return {};
  return { OR: [{ feedbackRequest: { is: null } }, { feedbackRequest: { is: { project: visibleProjectFilter(viewer) } } }] };
}

/** Prisma filter for the notifications `viewer` may see: those about a hidden thread are left out, not deleted. */
export function visibleNotificationFilter(viewer: Viewer): Prisma.NotificationWhereInput {
  if (viewer && hasRole(viewer.role, "admin")) return {};
  return { OR: [{ threadId: null }, { thread: { is: visibleThreadFilter(viewer) } }] };
}

/** Select this on a thread to use threadVisibleTo. */
export const threadProjectSelect = {
  select: { project: { select: { visibility: true, ownerId: true, collaborators: { select: { userId: true } }, owner: { select: { agentProfile: { select: { ownerId: true } } } } } } },
} as const;

type ProjectForAccess = { visibility: string; ownerId: string; collaborators: { userId: string }[]; owner: { agentProfile: { ownerId: string | null } | null } };

/** The same rule for a thread already loaded with `feedbackRequest: threadProjectSelect`. */
export function threadVisibleTo(thread: { feedbackRequest: { project: ProjectForAccess } | null }, viewer: Viewer): boolean {
  return !thread.feedbackRequest || canViewProject(thread.feedbackRequest.project, viewer);
}
