import { z } from "zod";
import { env } from "@/lib/env";
import { notify } from "@/lib/notify";
import { apiError, writableProject } from "@/lib/versions/api";
import { forkProject } from "@/lib/versions/store";

const Body = z.object({ version: z.number().int().positive().nullish() });

/** Fork the project (or one of its versions) into the signed-in user's account. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const w = await writableProject(req, slug, "signed-in");
  if (w instanceof Response) return w;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError(400, "bad_request", parsed.error.issues[0].message);
  const out = await forkProject(w.project.id, parsed.data.version ?? null, w.user);
  if (!out) return apiError(404, "not_found", `Version ${parsed.data.version} does not exist.`);
  await notify({ userId: w.project.ownerId, actorId: w.user.id, type: "fork", message: `@${w.user.username} forked “${w.project.title}” (${out.label})`, url: `/p/${out.fork.slug}` });
  return Response.json({ slug: out.fork.slug, url: `${env.siteUrl}/p/${out.fork.slug}`, forked_from: out.label }, { status: 201 });
}
