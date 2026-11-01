"use client";

import { useId, useMemo, useState } from "react";
import { LineChart, type Series } from "@/components/charts/LineChart";
import { SERIES_COLORS } from "@/lib/chart";
import { nkToEps, nmToEv } from "@/lib/physics/optics";
import type { DatasetWithData } from "@/lib/materials/types";

/** Overlay n/k or ε1/ε2 of several datasets against wavelength or photon energy. */
export function NkExplorer({ datasets, labelWithMaterial = false }: { datasets: DatasetWithData[]; labelWithMaterial?: boolean }) {
  const uid = useId();
  const [quantity, setQuantity] = useState<"nk" | "eps">("nk");
  const [axis, setAxis] = useState<"nm" | "ev">("nm");
  const allWl = datasets.flatMap((d) => d.data.wavelength_nm);
  const dataMin = Math.floor(Math.min(...allWl));
  const dataMax = Math.ceil(Math.max(...allWl));
  const [range, setRange] = useState<[number, number]>([Math.max(dataMin, 200), Math.min(dataMax, 2000)]);

  const series = useMemo(() => {
    const out: Series[] = [];
    datasets.forEach((d, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length];
      const keep = d.data.wavelength_nm.map((w) => w >= range[0] && w <= range[1]);
      const wl = d.data.wavelength_nm.filter((_, j) => keep[j]);
      const n = d.data.n.filter((_, j) => keep[j]);
      const k = d.data.k.filter((_, j) => keep[j]);
      const x = axis === "nm" ? wl : wl.map(nmToEv);
      const name = labelWithMaterial ? `${d.dataset.material_id} ${d.dataset.name}` : d.dataset.name;
      if (quantity === "nk") {
        out.push({ id: `${d.dataset.id}-n`, label: `${name} n`, x, y: n, color });
        if (d.dataset.has_k) out.push({ id: `${d.dataset.id}-k`, label: `${name} k`, x, y: k, color, dashed: true });
      } else {
        const eps = wl.map((_, j) => nkToEps(n[j], k[j]));
        out.push({ id: `${d.dataset.id}-e1`, label: `${name} ε₁`, x, y: eps.map((e) => e.eps1), color });
        out.push({ id: `${d.dataset.id}-e2`, label: `${name} ε₂`, x, y: eps.map((e) => e.eps2), color, dashed: true });
      }
    });
    return out;
  }, [datasets, quantity, axis, range, labelWithMaterial]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 text-sm">
        <fieldset className="flex items-center gap-3">
          <legend className="mb-1 text-xs font-medium text-muted">Quantity</legend>
          <label className="flex items-center gap-1">
            <input type="radio" name={`${uid}-q`} checked={quantity === "nk"} onChange={() => setQuantity("nk")} /> n, k
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name={`${uid}-q`} checked={quantity === "eps"} onChange={() => setQuantity("eps")} /> ε₁, ε₂
          </label>
        </fieldset>
        <fieldset className="flex items-center gap-3">
          <legend className="mb-1 text-xs font-medium text-muted">Axis</legend>
          <label className="flex items-center gap-1">
            <input type="radio" name={`${uid}-x`} checked={axis === "nm"} onChange={() => setAxis("nm")} /> Wavelength (nm)
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name={`${uid}-x`} checked={axis === "ev"} onChange={() => setAxis("ev")} /> Energy (eV)
          </label>
        </fieldset>
        <fieldset className="flex items-center gap-2">
          <legend className="mb-1 text-xs font-medium text-muted">Wavelength range (nm)</legend>
          <label className="sr-only" htmlFor={`${uid}-min`}>Minimum wavelength</label>
          <input id={`${uid}-min`} type="number" className="input !w-24" value={range[0]} min={dataMin} max={range[1] - 1} onChange={(e) => setRange([Number(e.target.value), range[1]])} />
          <span aria-hidden>–</span>
          <label className="sr-only" htmlFor={`${uid}-max`}>Maximum wavelength</label>
          <input id={`${uid}-max`} type="number" className="input !w-24" value={range[1]} min={range[0] + 1} max={dataMax} onChange={(e) => setRange([range[0], Number(e.target.value)])} />
        </fieldset>
      </div>
      <LineChart
        title={quantity === "nk" ? "Refractive index n (solid) and extinction coefficient k (dashed)" : "Permittivity ε₁ (solid) and ε₂ (dashed)"}
        series={series}
        xLabel={axis === "nm" ? "Wavelength (nm)" : "Photon energy (eV)"}
        yLabel={quantity === "nk" ? "n, k" : "ε₁, ε₂"}
      />
      <p className="text-xs text-muted">Convention exp(−iωt): k ≥ 0 and ε₂ ≥ 0 mean absorption. Wavelengths are in vacuum.</p>
    </div>
  );
}
