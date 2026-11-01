import type { AnyResult } from "@/lib/problem/result";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export const TERMINAL: JobStatus[] = ["succeeded", "failed", "cancelled"];

export interface JobState {
  id: string;
  status: JobStatus;
  progress: number | null;
  message?: string | null;
  result?: AnyResult | null;
  error?: string | null;
}

export type JobEvent =
  | { type: "status"; status: JobStatus }
  | { type: "progress"; progress: number; message?: string }
  | { type: "log"; message: string }
  | { type: "result"; result: unknown }
  | { type: "error"; message: string };

export interface ComputeApi {
  readonly mode: "http" | "mock";
  createJob(input: { spec: Record<string, unknown>; method: string; device: string }, token: string): Promise<{ id: string; status: JobStatus }>;
  getJob(id: string, token: string): Promise<JobState | null>;
}

const STATUSES: JobStatus[] = ["queued", "running", "succeeded", "failed", "cancelled"];

export function asJobStatus(v: unknown): JobStatus {
  const s = String(v ?? "").toLowerCase();
  if (s === "completed" || s === "done" || s === "success") return "succeeded";
  if (s === "error") return "failed";
  if (s === "pending") return "queued";
  return (STATUSES as string[]).includes(s) ? (s as JobStatus) : "queued";
}

/** Parse one WebSocket message from Lightsmith Cloud (lightsmith-cloud). Accepts `type` or `event` as the tag. */
export function parseJobEvent(raw: string | unknown): JobEvent | null {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return { type: "log", message: raw };
    }
  }
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  const tag = String(e.type ?? e.event ?? "");
  switch (tag) {
    case "status":
      return { type: "status", status: asJobStatus(e.status) };
    case "progress": {
      let p = Number(e.progress ?? e.value ?? 0);
      if (p > 1) p /= 100; // percent
      const label = e.message ?? (e.stage ? `${e.stage}${e.method ? ` (${e.method})` : ""}` : undefined);
      return { type: "progress", progress: Math.min(1, Math.max(0, p)), message: label ? String(label) : undefined };
    }
    case "log":
      return { type: "log", message: String(e.message ?? e.line ?? "") };
    case "result":
    case "completed":
      return { type: "result", result: e.result ?? e.data };
    case "error":
    case "failed":
      return { type: "error", message: String(e.message ?? e.error ?? "job failed") };
    case "end":
      return null; // the stream closes after this; status and result have already arrived
    default:
      return e.status ? { type: "status", status: asJobStatus(e.status) } : null;
  }
}
