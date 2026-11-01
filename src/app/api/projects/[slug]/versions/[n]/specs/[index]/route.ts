import { loadVersion } from "@/lib/projects";
import { apiError, parseVersionNumber, readableProject } from "@/lib/versions/api";

// Raw problem JSON of one spec in a version. CORS-enabled (next.config.ts) so Studio can load it via
// ?spec_url=; private projects are only served to sessions that may see them.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; n: string; index: string }> }) {
  const { slug, n, index } = await params;
  const r = await readableProject(slug);
  if (r instanceof Response) return r;
  const number = parseVersionNumber(n);
  const v = number ? await loadVersion(r.project.id, number) : null;
  const spec = v && /^\d+$/.test(index) ? v.specs[Number(index)] : undefined;
  if (!spec) return apiError(404, "not_found", "No such version or spec.");
  const isPrivate = r.project.visibility === "private";
  return new Response(JSON.stringify(spec.problem, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `inline; filename="${spec.name.replace(/[^A-Za-z0-9_.-]+/g, "_")}-v${v!.number}.json"`,
      // Versions never change, so public ones can be cached for long.
      "Cache-Control": isPrivate ? "private, no-store" : "public, max-age=86400, immutable",
    },
  });
}
