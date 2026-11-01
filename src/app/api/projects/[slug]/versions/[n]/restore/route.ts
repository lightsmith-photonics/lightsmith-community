import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseVersionNumber, versionUrls, writableProject } from "@/lib/versions/api";
import { restoreVersion } from "@/lib/versions/store";

const Body = z.object({ message: z.string().max(500).default("") });

/** Restore version n as a new version (owner and collaborators). History is never rewritten. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; n: string }> }) {
  const { slug, n } = await params;
  const w = await writableProject(req, slug);
  if (w instanceof Response) return w;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError(400, "bad_request", parsed.error.issues[0].message);
  const number = parseVersionNumber(n);
  const exists = number ? await db.projectVersion.findUnique({ where: { projectId_number: { projectId: w.project.id, number } }, select: { id: true } }) : null;
  if (!number || !exists) return apiError(404, "not_found", `Version ${n} does not exist.`);
  const out = await restoreVersion(w.project.id, number, w.user.id, parsed.data.message.trim());
  revalidatePath(`/p/${slug}`, "layout");
  return Response.json({ number: out.version.number, created: out.created, restored_from: number, ...versionUrls(slug, out.version.number) }, { status: out.created ? 201 : 200 });
}
