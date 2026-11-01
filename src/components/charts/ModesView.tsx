"use client";

import { useId, useMemo, useState } from "react";
import { LineChart, type Series } from "./LineChart";
import { Heatmap } from "./Heatmap";
import { Tabs } from "./controls";
import { modeIntensity, type ModesResult } from "@/lib/problem/result";

const fmt = (v: number | null | undefined, digits = 4) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(digits));

/** Waveguide modes: effective (and group) index dispersion, a mode table and field profiles. */
export function ModesView({ result, title, compact }: { result: ModesResult; title: string; compact: boolean }) {
  const uid = useId();
  const [tab, setTab] = useState<"dispersion" | "table" | "field">("dispersion");
  const [quantity, setQuantity] = useState<"neff" | "ng">("neff");
  const [wl, setWl] = useState(Math.floor(result.wavelengths_nm.length / 2));
  const [mode, setMode] = useState(0);
  const [component, setComponent] = useState("|E|²");
  const count = Math.max(0, ...result.modes.map((m) => m.length));
  const hasNg = result.modes.some((ms) => ms.some((m) => typeof m.ng === "number"));
  const hasFields = result.modes.some((ms) => ms.some((m) => m.field));

  const series: Series[] = Array.from({ length: count }, (_, m) => ({
    id: `mode-${m}`,
    label: `mode ${m}`,
    x: result.wavelengths_nm,
    y: result.modes.map((ms) => (quantity === "neff" ? (ms[m]?.neff_real ?? NaN) : (ms[m]?.ng ?? NaN))),
  }));
  const chart = (
    <LineChart
      title={title}
      series={series}
      xLabel="Wavelength (nm)"
      yLabel={quantity === "neff" ? "Effective index n_eff" : "Group index n_g"}
      compact={compact}
      height={compact ? 300 : 340}
    />
  );
  const current = result.modes[wl] ?? [];
  const field = current[mode]?.field ?? null;
  const fieldValues = useMemo(() => {
    if (!field) return null;
    if (component === "|E|²") return modeIntensity(field);
    const c = field.components[component];
    return c ? field.x_nm.map((_, i) => field.y_nm.map((_, j) => Math.hypot(c[0][i][j], c[1][i][j]))) : null;
  }, [field, component]);
  if (compact) return chart;

  const tabs = [
    { id: "dispersion" as const, label: "Dispersion" },
    { id: "table" as const, label: "Mode table" },
    ...(hasFields ? [{ id: "field" as const, label: "Field profiles" }] : []),
  ];
  const wlPicker = (
    <label className="flex items-center gap-2 text-sm">
      Wavelength
      <select className="input !w-auto !py-1" value={wl} onChange={(e) => setWl(Number(e.target.value))}>
        {result.wavelengths_nm.map((w, i) => (
          <option key={i} value={i}>
            {w} nm
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Mode views" />
      {tab === "dispersion" && (
        <div role="tabpanel" className="space-y-2">
          {hasNg && (
            <fieldset className="flex items-center gap-3 text-sm">
              <legend className="sr-only">Quantity</legend>
              <label className="flex items-center gap-1">
                <input type="radio" name={`${uid}-q`} checked={quantity === "neff"} onChange={() => setQuantity("neff")} /> n_eff
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name={`${uid}-q`} checked={quantity === "ng"} onChange={() => setQuantity("ng")} /> n_g
              </label>
            </fieldset>
          )}
          {result.wavelengths_nm.length > 1 ? chart : <p className="text-sm text-muted">One wavelength: see the mode table.</p>}
        </div>
      )}
      {tab === "table" && (
        <div role="tabpanel" className="space-y-2">
          {wlPicker}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm tabular-nums">
              <caption className="sr-only">Modes at {result.wavelengths_nm[wl]} nm</caption>
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th scope="col" className="py-1 pr-3">Mode</th>
                  <th scope="col" className="pr-3">n_eff</th>
                  <th scope="col" className="pr-3">Loss (dB/cm)</th>
                  <th scope="col" className="pr-3">n_g</th>
                  <th scope="col" className="pr-3">TE fraction</th>
                  <th scope="col">A_eff (µm²)</th>
                </tr>
              </thead>
              <tbody>
                {current.map((m, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="py-1 pr-3">{i}</td>
                    <td className="pr-3">
                      {fmt(m.neff_real, 5)}
                      {m.neff_imag ? ` + ${m.neff_imag.toExponential(2)}i` : ""}
                    </td>
                    <td className="pr-3">{fmt(m.loss_db_per_cm, 3)}</td>
                    <td className="pr-3">{fmt(m.ng)}</td>
                    <td className="pr-3">{fmt(m.te_fraction, 3)}</td>
                    <td>{fmt(m.effective_area_um2, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "field" && (
        <div role="tabpanel" className="space-y-2">
          <div className="flex flex-wrap gap-4">
            {wlPicker}
            <label className="flex items-center gap-2 text-sm">
              Mode
              <select className="input !w-auto !py-1" value={mode} onChange={(e) => setMode(Number(e.target.value))}>
                {current.map((m, i) => (
                  <option key={i} value={i}>
                    {i} (n_eff {fmt(m.neff_real)})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              Component
              <select className="input !w-auto !py-1" value={component} onChange={(e) => setComponent(e.target.value)}>
                {["|E|²", ...(field ? Object.keys(field.components) : [])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          {field && fieldValues ? (
            <Heatmap
              title={`${component === "|E|²" ? "|E|²" : `|${component}|`} of mode ${mode} at ${result.wavelengths_nm[wl]} nm`}
              values={fieldValues}
              xAxis={field.x_nm}
              yAxis={field.y_nm}
              xLabel="x (nm)"
              yLabel="y (nm)"
              valueLabel={component === "|E|²" ? "|E|²" : `|${component}|`}
              defaultLog={false}
            />
          ) : (
            <p className="text-sm text-muted">No field data for this mode (solve with include_fields: true).</p>
          )}
        </div>
      )}
    </div>
  );
}
