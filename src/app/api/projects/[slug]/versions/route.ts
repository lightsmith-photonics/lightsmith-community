import { revalidatePath } from "next/cache";
import { z } from "zod";
import { listVersions } from "@/lib/projects";
import { validateProblem } from "@/lib/problem/problem";
import { apiError, cacheHeader, readableProject, versionUrls, writableProject } from "@/lib/versions/api";
import { saveSpecs } from "@/lib/versions/store";
import { defaultMessage } from "@/lib/versions/snapshot";

/** Version history, newest first. Readable wherever the project is. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await readableProject(slug);
  if (r instanceof Response) return r;
  const versions = await listVersions(r.project.id);
  return Response.json(
    {
      project: { slug: r.project.slug, title: r.project.title, visibility: r.project.visibility, current_version: r.project.currentVersion?.number ?? null },
      versions: versions.map((v) => ({
        number: v.number,
        message: v.message || defaultMessage(v),
        author: v.author?.username ?? null,
        created_at: v.createdAt,
        restored_from: v.restoredFrom,
        current: v.number === r.project.currentVersion?.number,
        specs: v.specs.map((s) => ({ name: s.name, kind: s.kind })),
        results: v._count.results,
        ...versionUrls(slug, v.number),
      })),
    },
    { headers: { "Cache-Control": cacheHeader(r.project.visibility) } },
  );
}

const Body = z.object({
  specs: z
    .array(
      z.object({
        id: z.string().max(64).nullish(),
        name: z.string().trim().min(1).max(80),
        problem: z.record(z.string(), z.unknown()),
      }),
    )
    .max(50),
  message: z.string().max(500).default(""),
  /** the version the client edited; a different current version answers 409 instead of overwriting */
  base: z.number().int().positive().nullish(),
});

const MAX_BODY = 4_000_000;

/**
 * Save a new version: the full list of specs the project should have (owner and collaborators only).
 * Specs are matched to existing ones by `id`, then by `name`. Saving the current specs again creates nothing.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const w = await writableProject(req, slug);
  if (w instanceof Response) return w;
  const text = await req.text();
  if (text.length > MAX_BODY) return apiError(413, "too_large", "Specs are limited to 4 MB per version.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return apiError(400, "bad_request", "The body is not valid JSON.");
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return apiError(400, "bad_request", `${parsed.error.issues[0].path.join(".")} ${parsed.error.issues[0].message}`);
  const specs = [];
  for (const [i, s] of parsed.data.specs.entries()) {
    const v = validateProblem(s.problem);
    if (!v.ok) return Response.json({ error: "invalid_spec", message: `specs[${i}] (${s.name}) does not validate`, issues: v.issues }, { status: 422 });
    specs.push({ id: s.id, name: s.name, kind: v.kind, problem: v.problem });
  }
  const out = await saveSpecs(w.project.id, specs, w.user.id, parsed.data.message.trim() || "Updated specs (API)", parsed.data.base ?? null);
  if ("conflict" in out) return apiError(409, "conflict", `The project is at v${out.conflict}, not v${parsed.data.base}. Fetch it and try again.`);
  revalidatePath(`/p/${slug}`, "layout");
  const body = { number: out.version.number, created: out.created, ...versionUrls(slug, out.version.number) };
  return Response.json(body, { status: out.created ? 201 : 200 });
}
