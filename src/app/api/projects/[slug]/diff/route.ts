import { loadVersion } from "@/lib/projects";
import { diffSnapshots, formatPath } from "@/lib/versions/diff";
import { apiError, cacheHeader, parseVersionNumber, readableProject } from "@/lib/versions/api";

/** Structured diff of two versions' specs: GET ?from=2&to=5 (`to` defaults to the current version). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await readableProject(slug);
  if (r instanceof Response) return r;
  const q = new URL(req.url).searchParams;
  const from = parseVersionNumber(q.get("from") ?? "");
  const to = parseVersionNumber(q.get("to") ?? String(r.project.currentVersion?.number ?? ""));
  if (!from || !to) return apiError(400, "bad_request", "Give ?from=<version>&to=<version>.");
  const [a, b] = await Promise.all([loadVersion(r.project.id, from), loadVersion(r.project.id, to)]);
  if (!a || !b) return apiError(404, "not_found", `Version ${!a ? from : to} does not exist.`);
  const specs = diffSnapshots(a.specs, b.specs).map((d) => ({
    ...d,
    entries: d.entries.map((e) => ({ ...e, path: formatPath(e.path), segments: e.path })),
  }));
  return Response.json(
    {
      from,
      to,
      changed: specs.some((s) => s.status !== "unchanged"),
      specs,
      results: {
        from: a.results.map((x) => ({ id: x.id, name: x.name, kind: x.kind, spec: x.specName })),
        to: b.results.map((x) => ({ id: x.id, name: x.name, kind: x.kind, spec: x.specName })),
      },
    },
    { headers: { "Cache-Control": cacheHeader(r.project.visibility) } },
  );
}
