import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { jobState } from "@/lib/jobs";
import { saveResult } from "@/lib/results-store";

/**
 * Store a finished job's result in its project. The result is fetched server-side from the
 * compute service, never taken from the browser, so stored results are what compute produced.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const s = await jobState(id, user);
  if (!s) return Response.json({ error: "not_found" }, { status: 404 });
  const { job, state } = s;
  if (!state || state.status !== "succeeded" || !state.result) {
    return Response.json({ error: "not_ready", status: state?.status, message: state?.error ?? "The job has not produced a result." }, { status: 409 });
  }
  const tag = `[job ${job.id.slice(-6)}]`;
  const existing = await db.resultRecord.findFirst({ where: { projectId: job.projectId, name: { endsWith: tag } } });
  if (existing) return Response.json({ resultId: existing.id });
  const result = state.result;
  const record = await saveResult({ projectId: job.projectId, specId: job.specId, name: `${job.spec.name} · ${result.method} ${tag}`, result });
  const project = await db.project.update({ where: { id: job.projectId }, data: { updatedAt: new Date() }, select: { slug: true } });
  revalidatePath(`/p/${project.slug}`);
  return Response.json({ resultId: record.id });
}
