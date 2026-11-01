import { getCurrentUser } from "@/lib/session";
import { loadResult } from "@/lib/projects";
import { getGzipStream } from "@/lib/storage";

// Result JSON, streamed from object storage still gzipped (Content-Encoding: gzip).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadResult(id, await getCurrentUser());
  if (!r) return Response.json({ error: "not_found", message: "No such result, or it is private." }, { status: 404 });
  const body = await getGzipStream(r.storageKey);
  if (!body) return Response.json({ error: "missing_object", message: "The stored result could not be found." }, { status: 410 });
  const isPrivate = r.project.visibility === "private";
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Encoding": "gzip",
    "Content-Disposition": `inline; filename="${r.name.replace(/[^A-Za-z0-9_.-]+/g, "_")}.json"`,
    "Cache-Control": isPrivate ? "private, no-store" : "public, max-age=300",
    Vary: "Cookie",
  };
  if (!isPrivate) headers["Access-Control-Allow-Origin"] = "*";
  return new Response(body, { headers });
}
