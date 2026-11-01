"use client";

import { useEffect, useState } from "react";
import { LineChart } from "./LineChart";
import { parseResult, type AnyResult } from "@/lib/problem/result";
import { overlayChoices, overlaySeries } from "@/lib/versions/overlay";

type Side = { url: string; label: string };

/** Two results of the same kind on one chart: the earlier version dashed, the later one solid. */
export function ResultOverlay({ before, after, title }: { before: Side; after: Side; title: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; error: string } | { status: "ready"; a: AnyResult; b: AnyResult }>({ status: "loading" });
  const [pol, setPol] = useState<string | undefined>();
  const [angle, setAngle] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const p = parseResult(await res.text());
      if (!p.ok) throw new Error(p.error);
      return p.result;
    };
    Promise.all([load(before.url), load(after.url)])
      .then(([a, b]) => !cancelled && setState({ status: "ready", a, b }))
      .catch((err: Error) => !cancelled && setState({ status: "error", error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [before.url, after.url]);

  if (state.status === "loading") {
    return <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-line text-sm text-muted" aria-busy="true">Loading results…</div>;
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="text-sm text-danger">
        Could not load these results: {state.error}
      </p>
    );
  }
  const { a, b } = state;
  const series = overlaySeries(a, b, [before.label, after.label], { pol, angle });
  const { pols, angles } = overlayChoices(a, b);
  if (series.length === 0) return <p className="text-sm text-muted">These results have no common polarization and angle to overlay.</p>;
  return (
    <div className="space-y-2">
      {(pols.length > 1 || angles.length > 1) && (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 text-sm">
          {pols.length > 1 && (
            <label className="flex items-center gap-2">
              Polarization
              <select className="input !w-auto !py-1" value={pol ?? pols[0]} onChange={(e) => setPol(e.target.value)}>
                {pols.map((p) => (
                  <option key={p} value={p}>
                    {p}-pol.
                  </option>
                ))}
              </select>
            </label>
          )}
          {angles.length > 1 && (
            <label className="flex items-center gap-2">
              Angle of incidence
              <select className="input !w-auto !py-1" value={angle} onChange={(e) => setAngle(Number(e.target.value))}>
                {angles.map((x, i) => (
                  <option key={i} value={i}>
                    {x}°
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <LineChart
        title={title}
        series={series}
        xLabel="Wavelength (nm)"
        yLabel={a.kind === "spectrum" ? "Power fraction" : "Cross section (nm²)"}
        yDomain={a.kind === "spectrum" ? [-0.02, 1.02] : undefined}
      />
      <p className="text-xs text-muted">
        Dashed: {before.label}. Solid: {after.label}.
      </p>
    </div>
  );
}
