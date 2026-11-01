"use client";

import { useId, useState } from "react";
import { LineChart, type Series } from "./LineChart";
import { AxisToggle } from "./controls";
import { SERIES_COLORS } from "@/lib/chart";
import { nmToEv } from "@/lib/physics/optics";
import type { SpectrumResult } from "@/lib/problem/result";

const QUANTITIES = [
  { id: "r", label: "R" },
  { id: "t", label: "T" },
  { id: "a", label: "A" },
] as const;

/** Reflectance, transmittance and absorptance of thin films and periodic structures. */
export function SpectrumView({ result, title, compact }: { result: SpectrumResult; title: string; compact: boolean }) {
  const uid = useId();
  const [angle, setAngle] = useState(0);
  const [pols, setPols] = useState<string[]>(result.polarizations);
  const [quantities, setQuantities] = useState<string[]>(["r", "t", "a"]);
  const [axis, setAxis] = useState<"nm" | "ev">("nm");
  const [order, setOrder] = useState(-1); // -1 = totals
  const x = axis === "nm" ? result.wavelengths_nm : result.wavelengths_nm.map(nmToEv);
  const orders = result.orders ?? [];
  const src = order >= 0 && orders[order] ? { r: orders[order].r, t: orders[order].t, a: {} as Record<string, number[][]> } : result;

  const series: Series[] = [];
  pols.forEach((pol, pi) =>
    quantities.forEach((q, qi) => {
      const y = (src as Record<string, Record<string, number[][]>>)[q]?.[pol]?.[angle];
      if (y) series.push({ id: `${q}-${pol}`, label: `${q.toUpperCase()} (${pol})`, x, y, color: SERIES_COLORS[qi], dashed: pi === 1 });
    }),
  );
  const chart = (
    <LineChart
      title={`${title} — ${order >= 0 ? `order (${orders[order].order.join(", ")})` : "total"}, θ = ${result.angles_deg[angle]}°`}
      series={series}
      xLabel={axis === "nm" ? "Wavelength (nm)" : "Photon energy (eV)"}
      yLabel="Power fraction"
      yDomain={[-0.02, 1.02]}
      compact={compact}
      height={compact ? 300 : 360}
    />
  );
  if (compact) return chart;
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 text-sm">
        {result.angles_deg.length > 1 && (
          <label className="flex items-center gap-2">
            Angle of incidence
            <select className="input !w-auto !py-1" value={angle} onChange={(e) => setAngle(Number(e.target.value))}>
              {result.angles_deg.map((a, i) => (
                <option key={i} value={i}>
                  {a}°
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="flex items-center gap-3">
          <legend className="sr-only">Quantities</legend>
          {QUANTITIES.map((q) => (
            <label key={q.id} className="flex items-center gap-1">
              <input type="checkbox" checked={quantities.includes(q.id)} onChange={() => setQuantities((l) => toggle(l, q.id))} /> {q.label}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex items-center gap-3">
          <legend className="sr-only">Polarizations</legend>
          {result.polarizations.map((p) => (
            <label key={p} className="flex items-center gap-1">
              <input type="checkbox" checked={pols.includes(p)} onChange={() => setPols((l) => toggle(l, p))} /> {p}-pol.
            </label>
          ))}
        </fieldset>
        {orders.length > 0 && (
          <label className="flex items-center gap-2">
            Diffraction order
            <select className="input !w-auto !py-1" value={order} onChange={(e) => setOrder(Number(e.target.value))} aria-describedby={`${uid}-ord`}>
              <option value={-1}>total</option>
              {orders.map((o, i) => (
                <option key={i} value={i}>
                  ({o.order.join(", ")})
                </option>
              ))}
            </select>
          </label>
        )}
        <AxisToggle axis={axis} setAxis={setAxis} />
      </div>
      {chart}
      {orders.length > 0 && (
        <p id={`${uid}-ord`} className="text-xs text-muted">
          {orders.length} propagating diffraction orders are stored; absorption is shown for totals only.
        </p>
      )}
    </div>
  );
}
