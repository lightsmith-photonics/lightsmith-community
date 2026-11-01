import { mockSolveProblem } from "@/lib/problem/mock-solver";
import { mockNkLookup } from "@/lib/materials/mock";
import { verifyPlatformJwt } from "@/lib/platform-jwt";
import type { ComputeApi, JobState, JobStatus } from "./types";

// Stand-in for the compute service: a job "runs" for a few seconds and then returns the
// built-in mock solver's result. State is in memory; restore() rebuilds it from the DB.

const RUN_MS = 3000;
const QUEUE_MS = 400;

interface MockJob {
  spec: Record<string, unknown>;
  method: string;
  createdAt: number;
}

const store = globalThis as unknown as { __mockJobs?: Map<string, MockJob> };
const jobs = (store.__mockJobs ??= new Map());

export class MockComputeApi implements ComputeApi {
  readonly mode = "mock" as const;

  async createJob(input: { spec: Record<string, unknown>; method: string; device: string }, token: string) {
    await verifyPlatformJwt(token, "compute");
    const id = `mock_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    jobs.set(id, { spec: input.spec, method: input.method, createdAt: Date.now() });
    return { id, status: "queued" as JobStatus };
  }

  restore(id: string, spec: Record<string, unknown>, method: string, createdAt: Date) {
    if (!jobs.has(id)) jobs.set(id, { spec, method, createdAt: createdAt.getTime() });
  }

  async getJob(id: string, token: string): Promise<JobState | null> {
    await verifyPlatformJwt(token, "compute");
    const job = jobs.get(id);
    if (!job) return null;
    const elapsed = Date.now() - job.createdAt;
    if (elapsed < QUEUE_MS) return { id, status: "queued", progress: 0 };
    if (elapsed < RUN_MS) return { id, status: "running", progress: (elapsed - QUEUE_MS) / (RUN_MS - QUEUE_MS) };
    try {
      const result = mockSolveProblem(job.spec, { method: job.method, lookup: mockNkLookup });
      return { id, status: "succeeded", progress: 1, result };
    } catch (err) {
      return { id, status: "failed", progress: null, error: (err as Error).message };
    }
  }
}
