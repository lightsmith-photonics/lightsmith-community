"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseJobEvent, type JobEvent, type JobStatus } from "@/lib/compute/types";

interface StartResponse {
  jobId: string;
  remoteId: string;
  mode: "http" | "mock";
  ws: { url: string; token: string } | null;
}

interface EventSource {
  close(): void;
}

/** Simulated event stream for the mock compute runner: polls our job endpoint and emits WS-shaped events. */
function mockEvents(jobId: string, emit: (e: JobEvent) => void): EventSource {
  let stopped = false;
  let last: JobStatus | null = null;
  const tick = async () => {
    if (stopped) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      const job = (await res.json()) as { status: JobStatus; progress: number | null; error?: string };
      if (job.status !== last) {
        emit({ type: "status", status: job.status });
        last = job.status;
      }
      if (job.progress !== null) emit({ type: "progress", progress: job.progress, message: job.status === "running" ? "solving (mock)" : undefined });
      if (job.status === "failed") emit({ type: "error", message: job.error ?? "failed" });
      if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") return;
    } catch (err) {
      emit({ type: "log", message: `poll failed: ${(err as Error).message}` });
    }
    setTimeout(tick, 400);
  };
  tick();
  return { close: () => (stopped = true) };
}

function wsEvents(start: StartResponse, emit: (e: JobEvent) => void, onClose: () => void): EventSource {
  const url = `${start.ws!.url}/v1/jobs/${encodeURIComponent(start.remoteId)}/events?token=${encodeURIComponent(start.ws!.token)}`;
  const ws = new WebSocket(url);
  ws.onmessage = (m) => {
    const e = parseJobEvent(typeof m.data === "string" ? m.data : "");
    if (e) emit(e);
  };
  ws.onerror = () => emit({ type: "log", message: "WebSocket error; falling back to polling" });
  ws.onclose = onClose;
  return { close: () => ws.close() };
}

export function RunButton({ specId, disabled }: { specId: string; disabled?: boolean }) {
  const router = useRouter();
  const [method, setMethod] = useState("auto");
  const [device, setDevice] = useState("auto");
  const [status, setStatus] = useState<JobStatus | "idle" | "saving" | "saved">("idle");
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"http" | "mock" | null>(null);
  const source = useRef<EventSource | null>(null);
  const finished = useRef(false);

  useEffect(() => () => source.current?.close(), []);

  async function complete(jobId: string) {
    if (finished.current) return;
    finished.current = true;
    source.current?.close();
    setStatus("saving");
    const res = await fetch(`/api/jobs/${jobId}/complete`, { method: "POST" });
    const body = (await res.json()) as { resultId?: string; message?: string; status?: JobStatus };
    if (!res.ok) {
      setStatus("failed");
      setError(body.message ?? "Could not save the result");
      return;
    }
    setStatus("saved");
    setProgress(1);
    router.refresh();
  }

  async function run() {
    setError(null);
    setLog([]);
    setProgress(0);
    setStatus("queued");
    finished.current = false;
    const res = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ specId, method, device }) });
    const body = await res.json();
    if (!res.ok) {
      setStatus("failed");
      setError(body.message ?? "Could not start the job");
      return;
    }
    const start = body as StartResponse;
    setMode(start.mode);
    const emit = (e: JobEvent) => {
      if (e.type === "status") {
        setStatus(e.status);
        if (e.status === "succeeded") complete(start.jobId);
      } else if (e.type === "progress") setProgress(e.progress);
      else if (e.type === "log") setLog((l) => [...l.slice(-20), e.message]);
      else if (e.type === "error") {
        setError(e.message);
        setStatus("failed");
      } else if (e.type === "result") complete(start.jobId);
    };
    source.current =
      start.mode === "mock" || !start.ws
        ? mockEvents(start.jobId, emit)
        : wsEvents(start, emit, () => {
            if (!finished.current) source.current = mockEvents(start.jobId, emit); // reconnect by polling
          });
  }

  const busy = status === "queued" || status === "running" || status === "saving";
  const pct = Math.round(progress * 100);
  return (
    <div className="rounded-md border border-line p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label !text-xs" htmlFor={`m-${specId}`}>Method</label>
          <select id={`m-${specId}`} className="input !w-auto !py-1" value={method} onChange={(e) => setMethod(e.target.value)} disabled={busy}>
            {["auto", "mie", "tmatrix", "dda", "fdtd"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label !text-xs" htmlFor={`d-${specId}`}>Device</label>
          <select id={`d-${specId}`} className="input !w-auto !py-1" value={device} onChange={(e) => setDevice(e.target.value)} disabled={busy}>
            {["auto", "cpu", "gpu"].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-primary" onClick={run} disabled={busy || disabled}>
          {busy ? "Running…" : "Run"}
        </button>
      </div>
      {status !== "idle" && (
        <div className="mt-3 space-y-1" aria-live="polite">
          <div className="flex justify-between text-xs">
            <span>
              Status: <strong>{status}</strong>
              {mode === "mock" && <span className="text-muted"> (mock compute)</span>}
            </span>
            <span>{pct}%</span>
          </div>
          <div role="progressbar" aria-label="Job progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          {status === "saved" && <p className="text-xs text-success">Result saved to this project.</p>}
          {log.length > 0 && <pre className="max-h-24 overflow-auto text-[11px] text-muted">{log.join("\n")}</pre>}
        </div>
      )}
    </div>
  );
}
