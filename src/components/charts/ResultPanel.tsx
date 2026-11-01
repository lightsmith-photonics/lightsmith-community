"use client";

import { useEffect, useRef, useState } from "react";
import { ResultViewer } from "./ResultViewer";
import { parseResult, type AnyResult } from "@/lib/problem/result";

/**
 * Loads a stored result from /api/results/{id} when it scrolls into view, then renders it.
 * Results can be megabytes (mode fields), so they are never inlined into the page HTML.
 */
export function ResultPanel({ resultId, title, compact = false }: { resultId: string; title: string; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ status: "idle" | "loading" | "error"; error?: string } | { status: "ready"; result: AnyResult }>({ status: "idle" });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const load = async () => {
      setState({ status: "loading" });
      try {
        const res = await fetch(`/api/results/${resultId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseResult(await res.text());
        if (cancelled) return;
        setState(parsed.ok ? { status: "ready", result: parsed.result } : { status: "error", error: parsed.error });
      } catch (err) {
        if (!cancelled) setState({ status: "error", error: (err as Error).message });
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [resultId]);

  return (
    <div ref={ref} aria-busy={state.status === "loading"}>
      {state.status === "ready" ? (
        <ResultViewer result={state.result} title={title} compact={compact} />
      ) : state.status === "error" ? (
        <p role="alert" className="text-sm text-danger">
          Could not load this result: {state.error}
        </p>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-line text-sm text-muted">Loading result…</div>
      )}
    </div>
  );
}
