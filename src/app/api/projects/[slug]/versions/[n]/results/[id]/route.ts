import { db } from "@/lib/db";
import { getJsonStream } from "@/lib/storage";
import { apiError, parseVersionNumber, readableProject } from "@/lib/versions/api";

// A result linked to a version, streamed from object storage still gzipped (as /api/results/{id}).
// It stays available after the live result is deleted from the project.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; n: string; id: string }> }) {
  const { slug, n, id } = await params;
  const r = await readableProject(slug);
  if (r instanceof Response) return r;
  const number = parseVersionNumber(n);
  const result = number ? await db.versionResult.findFirst({ where: { id, version: { projectId: r.project.id, number } } }) : null;
  if (!result) return apiError(404, "not_found", "No such result in this version.");
  const body = await getJsonStream(result.storageKey);
  if (!body) return apiError(410, "missing_object", "The stored result could not be found.");
  const isPrivate = r.project.visibility === "private";
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `inline; filename="${result.name.replace(/[^A-Za-z0-9_.-]+/g, "_")}.json"`,
    "Cache-Control": isPrivate ? "private, no-store" : "public, max-age=300",
    Vary: "Cookie",
  };
  if (!isPrivate) headers["Access-Control-Allow-Origin"] = "*";
  return new Response(body, { headers });
}
