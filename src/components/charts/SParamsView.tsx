"use client";

import { useState } from "react";
import { LineChart, type Series } from "./LineChart";
import { sParamDb, type SParametersResult } from "@/lib/problem/result";

/** S-parameters of devices and circuits: |S|² in dB or linear, or phase, for chosen port pairs. */
export function SParamsView({ result, title, compact }: { result: SParametersResult; title: string; compact: boolean }) {
  const n = result.ports.length;
  const [input, setInput] = useState(0);
  const [outputs, setOutputs] = useState<number[]>(() => result.ports.map((_, i) => i).filter((i) => i !== 0 || n === 1));
  const [scale, setScale] = useState<"db" | "lin" | "phase">("db");

  const value = (j: number, o: number, i: number) => {
    const re = result.s_real[j][o][i];
    const im = result.s_imag[j][o][i];
    if (scale === "db") return sParamDb(re, im);
    if (scale === "lin") return re * re + im * im;
    return (Math.atan2(im, re) * 180) / Math.PI;
  };
  const series: Series[] = outputs.map((o) => ({
    id: `${o}-${input}`,
    label: `S(${result.ports[o]}, ${result.ports[input]})`,
    x: result.wavelengths_nm,
    y: result.wavelengths_nm.map((_, j) => value(j, o, input)),
  }));
  const chart = (
    <LineChart
      title={`${title} — from port ${result.ports[input]}`}
      series={series}
      xLabel="Wavelength (nm)"
      yLabel={scale === "db" ? "|S|² (dB)" : scale === "lin" ? "|S|²" : "arg S (degrees)"}
      compact={compact}
      height={compact ? 300 : 360}
    />
  );
  if (compact) return chart;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          Input port
          <select className="input !w-auto !py-1" value={input} onChange={(e) => setInput(Number(e.target.value))}>
            {result.ports.map((p, i) => (
              <option key={p} value={i}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-wrap items-center gap-3">
          <legend className="sr-only">Output ports</legend>
          <span className="text-muted">Output:</span>
          {result.ports.map((p, o) => (
            <label key={p} className="flex items-center gap-1">
              <input type="checkbox" checked={outputs.includes(o)} onChange={() => setOutputs((l) => (l.includes(o) ? l.filter((x) => x !== o) : [...l, o].sort()))} /> {p}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2">
          Scale
          <select className="input !w-auto !py-1" value={scale} onChange={(e) => setScale(e.target.value as "db" | "lin" | "phase")}>
            <option value="db">|S|² in dB</option>
            <option value="lin">|S|² linear</option>
            <option value="phase">phase</option>
          </select>
        </label>
      </div>
      {chart}
      <p className="text-xs text-muted">
        S(out, in) is the amplitude leaving port “out” for unit amplitude entering port “in”. {n} ports, {result.wavelengths_nm.length} wavelengths.
      </p>
    </div>
  );
}
