"use client";

import { useState } from "react";
import { LineChart, type Series } from "./LineChart";
import { SERIES_COLORS } from "@/lib/chart";
import type { BandsResult } from "@/lib/problem/result";

/** Photonic band diagram: normalised frequency a/λ along the k-path, per polarization. */
export function BandsView({ result, title, compact }: { result: BandsResult; title: string; compact: boolean }) {
  const pols = Object.keys(result.frequencies);
  const [shown, setShown] = useState<string[]>(pols);
  const xTicks = Object.entries(result.k_labels)
    .map(([k, label]) => ({ x: result.k_distance[Number(k)], label }))
    .filter((t) => Number.isFinite(t.x));
  const series: Series[] = [];
  pols.forEach((pol, pi) => {
    if (!shown.includes(pol)) return;
    const rows = result.frequencies[pol];
    const nb = rows[0]?.length ?? 0;
    for (let b = 0; b < nb; b++) {
      series.push({
        id: `${pol}-${b}`,
        label: `${pol.toUpperCase()} band ${b + 1}`,
        x: result.k_distance,
        y: rows.map((r) => r[b]),
        color: SERIES_COLORS[pi % SERIES_COLORS.length],
        dashed: pi === 1,
      });
    }
  });
  const gaps = pols.flatMap((pol) => bandGaps(result.frequencies[pol]).map((g) => ({ pol, ...g })));
  const chart = (
    <LineChart title={title} series={series} xLabel="Wave vector" yLabel="Frequency a/λ" xTicks={xTicks} compact={compact} height={compact ? 300 : 380} />
  );
  if (compact) return chart;
  return (
    <div className="space-y-2">
      {pols.length > 1 && (
        <fieldset className="flex items-center gap-3 text-sm">
          <legend className="sr-only">Polarizations</legend>
          {pols.map((p) => (
            <label key={p} className="flex items-center gap-1">
              <input type="checkbox" checked={shown.includes(p)} onChange={() => setShown((l) => (l.includes(p) ? l.filter((x) => x !== p) : [...l, p]))} />{" "}
              {p.toUpperCase()}
            </label>
          ))}
        </fieldset>
      )}
      {chart}
      <p className="text-sm">
        {gaps.length === 0
          ? "No complete band gap between the computed bands."
          : gaps.map((g) => `${g.pol.toUpperCase()} gap between bands ${g.below} and ${g.below + 1}: a/λ ${g.lo.toFixed(3)}–${g.hi.toFixed(3)} (${(g.ratio * 100).toFixed(1)}% gap–midgap)`).join("; ")}
      </p>
    </div>
  );
}

/** Complete gaps along the path: max of band b below min of band b+1. */
export function bandGaps(rows: number[][]) {
  const nb = rows[0]?.length ?? 0;
  const gaps: { below: number; lo: number; hi: number; ratio: number }[] = [];
  for (let b = 0; b + 1 < nb; b++) {
    const lo = Math.max(...rows.map((r) => r[b]));
    const hi = Math.min(...rows.map((r) => r[b + 1]));
    if (hi > lo + 1e-6) gaps.push({ below: b + 1, lo, hi, ratio: (hi - lo) / ((hi + lo) / 2) });
  }
  return gaps;
}
