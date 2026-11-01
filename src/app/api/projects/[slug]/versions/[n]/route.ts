import { loadVersion } from "@/lib/projects";
import { env } from "@/lib/env";
import { apiError, cacheHeader, parseVersionNumber, readableProject, versionUrls } from "@/lib/versions/api";
import { defaultMessage } from "@/lib/versions/snapshot";

/** One version: its specs (full problem JSON) and linked results. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; n: string }> }) {
  const { slug, n } = await params;
  const r = await readableProject(slug);
  if (r instanceof Response) return r;
  const number = parseVersionNumber(n);
  const v = number ? await loadVersion(r.project.id, number) : null;
  if (!v) return apiError(404, "not_found", `Version ${n} does not exist.`);
  const base = `${env.siteUrl}/api/projects/${slug}/versions/${v.number}`;
  return Response.json(
    {
      number: v.number,
      message: v.message || defaultMessage(v),
      author: v.author?.username ?? null,
      created_at: v.createdAt,
      restored_from: v.restoredFrom,
      current: v.number === r.project.currentVersion?.number,
      ...versionUrls(slug, v.number),
      specs: v.specs.map((s, i) => ({ index: i, id: s.id, name: s.name, kind: s.kind, problem: s.problem, url: `${base}/specs/${i}` })),
      results: v.results.map((x) => ({
        id: x.id,
        name: x.name,
        kind: x.kind,
        method: x.method,
        backend: x.backend,
        spec: x.specName,
        size_bytes: x.sizeBytes,
        url: `${base}/results/${x.id}`,
      })),
    },
    { headers: { "Cache-Control": cacheHeader(r.project.visibility) } },
  );
}
