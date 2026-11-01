import { env } from "@/lib/env";
import { parseResult } from "@/lib/problem/result";
import { asJobStatus, type ComputeApi, type JobState } from "./types";

/** Client for the compute service. Server-side only. */
export class HttpComputeApi implements ComputeApi {
  readonly mode = "http" as const;

  constructor(private readonly base: string) {}

  private headers(token: string): HeadersInit {
    const h: Record<string, string> = { Accept: "application/json", Authorization: `Bearer ${token}` };
    if (env.computeApiKey) h["X-API-Key"] = env.computeApiKey;
    return h;
  }

  async createJob(input: { spec: unknown; method: string; device: string }, token: string) {
    const res = await fetch(`${this.base}/v1/jobs`, {
      method: "POST",
      headers: { ...this.headers(token), "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`compute ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const body = (await res.json()) as { id?: string; job_id?: string; status?: string };
    return { id: String(body.id ?? body.job_id), status: asJobStatus(body.status) };
  }

  async getJob(id: string, token: string): Promise<JobState | null> {
    const res = await fetch(`${this.base}/v1/jobs/${encodeURIComponent(id)}`, { headers: this.headers(token), cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`compute ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const body = (await res.json()) as Record<string, unknown>;
    let raw = body.result;
    // Results above the inline limit are only available from result_url.
    if (!raw && body.result_url && asJobStatus(body.status) === "succeeded") {
      const r = await fetch(new URL(String(body.result_url), this.base), { headers: this.headers(token), cache: "no-store" });
      if (r.ok) raw = await r.json();
    }
    // result_kind "compare" wraps several results; the viewers handle single results only.
    if (raw && body.result_kind === "compare") {
      return { id, status: "failed", progress: 1, error: "Comparison results cannot be stored in a project yet; run one method at a time." };
    }
    if (raw && typeof raw === "object" && !("kind" in raw) && body.result_kind) raw = { ...(raw as object), kind: body.result_kind };
    const parsed = raw ? parseResult(raw) : null;
    let progress = typeof body.progress === "number" ? body.progress : null;
    if (progress !== null && progress > 1) progress /= 100;
    return {
      id,
      status: asJobStatus(body.status),
      progress,
      message: body.message ? String(body.message) : null,
      result: parsed?.ok ? parsed.result : null,
      error: body.error ? errorText(body.error) : parsed && !parsed.ok ? parsed.error : null,
    };
  }
}

/** Browser-facing WebSocket base for job events. */
export function computeWsBase(): string {
  if (env.computeWsUrl) return env.computeWsUrl;
  return env.computeApiUrl.replace(/^http/, "ws");
}

function errorText(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; error?: unknown; type?: unknown };
    return String(o.message ?? o.error ?? o.type ?? JSON.stringify(e));
  }
  return String(e);
}
