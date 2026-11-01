import "server-only";
import { getCurrentUser, type CurrentUser } from "../session";
import { loadProjectForVersions } from "../projects";
import { canContribute } from "../roles";
import { env } from "../env";

// Shared checks for the /api/projects/{slug}/... routes. Private projects answer 404 to everyone who
// may not see them, so their existence does not leak; writes need the owner or a collaborator.

export const apiError = (status: number, error: string, message: string) => Response.json({ error, message }, { status });

type Project = NonNullable<Awaited<ReturnType<typeof loadProjectForVersions>>>;

export async function readableProject(slug: string): Promise<{ project: Project; user: CurrentUser | null } | Response> {
  const user = await getCurrentUser();
  const project = await loadProjectForVersions(slug, user);
  if (!project) return apiError(404, "not_found", "No such project, or it is private.");
  return { project, user };
}

/**
 * For POST routes. JSON bodies only: a cross-site HTML form cannot send `application/json` without a
 * CORS preflight, which these routes do not allow, so this also guards against CSRF.
 */
export async function writableProject(req: Request, slug: string, need: "contribute" | "signed-in" = "contribute") {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return apiError(415, "unsupported_media_type", "Send a JSON body (Content-Type: application/json).");
  }
  const r = await readableProject(slug);
  if (r instanceof Response) return r;
  if (!r.user) return apiError(401, "unauthorized", "Sign in first.");
  if (need === "contribute" && !canContribute(r.project, r.user)) {
    return apiError(403, "forbidden", "Only the project owner and collaborators can create versions. Fork the project instead.");
  }
  return { project: r.project, user: r.user };
}

export function parseVersionNumber(n: string): number | null {
  return /^[1-9]\d{0,8}$/.test(n) ? Number(n) : null;
}

export const versionUrls = (slug: string, number: number) => ({
  html: `${env.siteUrl}/p/${slug}/v/${number}`,
  api: `${env.siteUrl}/api/projects/${slug}/versions/${number}`,
});

export const cacheHeader = (visibility: string) => (visibility === "private" ? "private, no-store" : "public, max-age=60");
