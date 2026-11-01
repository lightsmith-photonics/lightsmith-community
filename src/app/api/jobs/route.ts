import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canEditProject } from "@/lib/roles";
import { computeApi } from "@/lib/compute";
import { computeWsBase } from "@/lib/compute/http";
import { issuePlatformJwt } from "@/lib/platform-jwt";
import { validateProblem } from "@/lib/problem/problem";

const Body = z.object({
  specId: z.string().min(1),
  method: z.string().regex(/^[a-z0-9_-]{2,32}$/).default("auto"),
  device: z.enum(["auto", "cpu", "gpu"]).default("auto"),
});

/** Submit a project spec to the compute service (or the mock) on behalf of the signed-in owner. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized", message: "Sign in to run simulations." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "bad_request", message: parsed.error.issues[0].message }, { status: 400 });
  const { specId, method, device } = parsed.data;

  const spec = await db.spec.findUnique({ where: { id: specId }, include: { project: true } });
  if (!spec || !canEditProject(spec.project, user)) {
    return Response.json({ error: "forbidden", message: "Only the project owner can run its specs. Fork it first." }, { status: 403 });
  }
  const v = validateProblem(spec.json);
  if (!v.ok) return Response.json({ error: "invalid_spec", message: v.issues.map((i) => `${i.path} ${i.message}`).join("; ") }, { status: 422 });

  const running = await db.job.count({ where: { userId: user.id, status: { in: ["queued", "running"] }, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
  if (running >= 5) return Response.json({ error: "rate_limited", message: "You already have 5 jobs in progress." }, { status: 429 });

  const api = computeApi();
  try {
    const token = await issuePlatformJwt(user, "compute");
    const remote = await api.createJob({ spec: v.problem, method, device }, token);
    const job = await db.job.create({
      data: { remoteId: remote.id, userId: user.id, projectId: spec.projectId, specId: spec.id, method, device, status: remote.status },
    });
    return Response.json({
      jobId: job.id,
      remoteId: remote.id,
      mode: api.mode,
      // Browsers cannot send headers on WebSockets, so a short-lived token goes in the query string.
      ws: api.mode === "http" ? { url: computeWsBase(), token: await issuePlatformJwt(user, "compute") } : null,
    });
  } catch (err) {
    return Response.json({ error: "compute_unavailable", message: (err as Error).message }, { status: 502 });
  }
}
