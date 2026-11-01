import "server-only";
import { db } from "./db";
import { computeApi } from "./compute";
import { MockComputeApi } from "./compute/mock";
import { issuePlatformJwt } from "./platform-jwt";
import type { CurrentUser } from "./session";

/** Load a job the user owns and fetch its state from the compute service. */
export async function jobState(jobId: string, user: CurrentUser) {
  const job = await db.job.findUnique({ where: { id: jobId }, include: { spec: true } });
  if (!job || job.userId !== user.id) return null;
  const api = computeApi();
  if (api instanceof MockComputeApi) api.restore(job.remoteId, JSON.parse(job.spec.json) as Record<string, unknown>, job.method, job.createdAt);
  const state = await api.getJob(job.remoteId, await issuePlatformJwt(user, "compute"));
  if (state && state.status !== job.status) {
    await db.job.update({ where: { id: job.id }, data: { status: state.status, error: state.error ?? null } });
  }
  return { job, state };
}
