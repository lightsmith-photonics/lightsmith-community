"use client";

import { useId, useState } from "react";
import { LineChart, type Series } from "./LineChart";
import { Heatmap } from "./Heatmap";
import { PolarPlot } from "./PolarPlot";
import { SpectrumView } from "./SpectrumView";
import { ModesView } from "./ModesView";
import { SParamsView } from "./SParamsView";
import { BandsView } from "./BandsView";
import { AxisToggle, Tabs } from "./controls";
import { efficiencies, type AnyResult, type CrossSectionsResult } from "@/lib/problem/result";
import { nmToEv } from "@/lib/physics/optics";

/** Renders any result kind. `compact` shows only the main chart (embeds, forum attachments). */
export function ResultViewer({ result, title, compact = false }: { result: AnyResult; title: string; compact?: boolean }) {
  const body = (() => {
    switch (result.kind) {
      case "cross_sections":
        return <CrossSectionsView result={result} title={title} compact={compact} />;
      case "spectrum":
        return <SpectrumView result={result} title={title} compact={compact} />;
      case "modes":
        return <ModesView result={result} title={title} compact={compact} />;
      case "sparameters":
        return <SParamsView result={result} title={title} compact={compact} />;
      case "bands":
        return <BandsView result={result} title={title} compact={compact} />;
    }
  })();
  if (compact) return body;
  return (
    <div>
      {body}
      <Warnings warnings={result.warnings} />
      <Provenance result={result} />
    </div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div role="note" className="mt-4 rounded-md border border-warning/50 bg-surface p-3 text-sm">
      <p className="font-semibold text-warning">Warnings</p>
      <ul className="mt-1 list-disc pl-5">
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

function Provenance({ result }: { result: AnyResult }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-muted">Provenance</summary>
      <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted">kind</dt>
        <dd>{result.kind}</dd>
        <dt className="text-muted">method</dt>
        <dd>{result.method}</dd>
        <dt className="text-muted">backend</dt>
        <dd>{result.backend}</dd>
        {result.kind === "cross_sections" && (
          <>
            <dt className="text-muted">r_eq</dt>
            <dd>{result.equivalent_radius_nm.toPrecision(5)} nm</dd>
          </>
        )}
        {Object.entries(result.provenance).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="break-all">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function CrossSectionsView({ result, title, compact }: { result: CrossSectionsResult; title: string; compact: boolean }) {
  const uid = useId();
  const [tab, setTab] = useState<"spectra" | "near" | "far">("spectra");
  const [quantity, setQuantity] = useState<"c" | "q">("c");
  const [axis, setAxis] = useState<"nm" | "ev">("nm");
  const [nfIndex, setNfIndex] = useState(0);
  const q = efficiencies(result);
  const x = axis === "nm" ? result.wavelengths_nm : result.wavelengths_nm.map(nmToEv);
  const ys = quantity === "c" ? [result.c_ext_nm2, result.c_sca_nm2, result.c_abs_nm2] : [q.q_ext, q.q_sca, q.q_abs];
  const names = ["Extinction", "Scattering", "Absorption"];
  const series: Series[] = ys.map((y, i) => ({ id: names[i], label: names[i], x, y, dashed: i === 1 }));
  const nf = result.near_field ?? [];
  const ff = result.far_field ?? [];
  const chart = (
    <LineChart
      title={title}
      series={series}
      xLabel={axis === "nm" ? "Wavelength (nm)" : "Photon energy (eV)"}
      yLabel={quantity === "c" ? "Cross section (nm²)" : "Efficiency Q"}
      compact={compact}
      height={compact ? 300 : 360}
    />
  );
  if (compact) return chart;
  const tabs = [
    { id: "spectra" as const, label: "Spectra" },
    ...(nf.length ? [{ id: "near" as const, label: `Near field (${nf.length})` }] : []),
    ...(ff.length ? [{ id: "far" as const, label: `Far field (${ff.length})` }] : []),
  ];
  return (
    <div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Result views" />
      {tab === "spectra" && (
        <div role="tabpanel">
          <div className="mb-2 flex flex-wrap gap-4 text-sm">
            <fieldset className="flex items-center gap-3">
              <legend className="sr-only">Quantity</legend>
              <label className="flex items-center gap-1">
                <input type="radio" name={`${uid}-q`} checked={quantity === "c"} onChange={() => setQuantity("c")} /> Cross sections
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name={`${uid}-q`} checked={quantity === "q"} onChange={() => setQuantity("q")} /> Efficiencies
              </label>
            </fieldset>
            <AxisToggle axis={axis} setAxis={setAxis} />
          </div>
          {chart}
        </div>
      )}
      {tab === "near" && nf.length > 0 && (
        <div role="tabpanel" className="space-y-2">
          {nf.length > 1 && (
            <label className="text-sm">
              Map{" "}
              <select className="input !w-auto" value={nfIndex} onChange={(e) => setNfIndex(Number(e.target.value))}>
                {nf.map((m, i) => (
                  <option key={i} value={i}>
                    {m.plane} plane, λ = {m.wavelength_nm} nm
                  </option>
                ))}
              </select>
            </label>
          )}
          {(() => {
            const m = nf[Math.min(nfIndex, nf.length - 1)];
            const [a1, a2] = m.plane.split("");
            return (
              <Heatmap
                title={`|E|²/|E₀|² in the ${m.plane} plane (offset ${m.offset_nm} nm) at λ = ${m.wavelength_nm} nm`}
                values={m.enhancement}
                xAxis={m.axis1_nm}
                yAxis={m.axis2_nm}
                xLabel={`${a1} (nm)`}
                yLabel={`${a2} (nm)`}
                valueLabel="|E|²/|E₀|²"
              />
            );
          })()}
        </div>
      )}
      {tab === "far" && ff.length > 0 && (
        <div role="tabpanel" className="grid gap-4 md:grid-cols-2">
          {ff.map((f, i) => (
            <PolarPlot key={i} ff={f} title={`Differential scattering cross section at λ = ${f.wavelength_nm} nm`} />
          ))}
        </div>
      )}
    </div>
  );
}
