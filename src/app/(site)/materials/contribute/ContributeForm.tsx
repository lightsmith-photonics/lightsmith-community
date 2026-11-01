"use client";

import { useActionState, useMemo, useState } from "react";
import { LineChart } from "@/components/charts/LineChart";
import { parseNkTable } from "@/lib/materials/formats";
import { submitDataset, type SubmitState } from "./actions";

export function ContributeForm({
  materials,
  categories,
  preset,
}: {
  materials: { id: string; name: string; category: string }[];
  categories: { id: string; name: string }[];
  preset?: string;
}) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitDataset, null);
  const [materialId, setMaterialId] = useState(preset ?? "");
  const [text, setText] = useState("");
  const [unit, setUnit] = useState<"nm" | "um" | "ev">("nm");
  const known = materials.find((m) => m.id === materialId);
  const parsed = useMemo(() => (text.trim() ? parseNkTable(text, unit) : null), [text, unit]);

  return (
    <form action={action} className="space-y-6">
      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold">Material</legend>
        <div>
          <label className="label" htmlFor="material_id">Existing material</label>
          <select id="material_id" name="material_id" className="input" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            <option value="">New material…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.id})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="material_name">Material name</label>
          <input id="material_name" name="material_name" className="input" required key={known?.id ?? "new"} defaultValue={known?.name ?? ""} placeholder="e.g. Indium tin oxide" />
        </div>
        <div>
          <label className="label" htmlFor="category">Category</label>
          <select id="category" name="category" className="input" key={`c-${known?.id ?? "new"}`} defaultValue={known?.category ?? "other"}>
            {(categories.some((c) => c.id === "other") ? categories : [...categories, { id: "other", name: "Other" }]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold">Source</legend>
        <div>
          <label className="label" htmlFor="dataset_name">Dataset name</label>
          <input id="dataset_name" name="dataset_name" className="input" required placeholder="e.g. Smith 2021 (ellipsometry)" />
        </div>
        <div>
          <label className="label" htmlFor="doi">DOI</label>
          <input id="doi" name="doi" className="input" placeholder="10.1103/PhysRevB.6.4370" />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="reference">Full reference</label>
          <textarea id="reference" name="reference" className="input" rows={2} required placeholder="Authors. Title. Journal Volume, pages (year)" />
        </div>
        <div>
          <label className="label" htmlFor="license">Licence</label>
          <select id="license" name="license" className="input" defaultValue="CC-BY-4.0">
            <option value="CC0-1.0">CC0 1.0 (public domain)</option>
            <option value="CC-BY-4.0">CC BY 4.0</option>
            <option value="PDDL-1.0">ODC PDDL 1.0</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="comments">Comments</label>
          <input id="comments" name="comments" className="input" placeholder="Sample preparation, temperature, method…" />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-lg font-semibold">Data</legend>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label" htmlFor="unit">First column</label>
            <select id="unit" name="unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value as "nm" | "um" | "ev")}>
              <option value="nm">Wavelength (nm)</option>
              <option value="um">Wavelength (µm)</option>
              <option value="ev">Photon energy (eV)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="file">Upload CSV/TXT</label>
            <input
              id="file"
              type="file"
              accept=".csv,.txt,.tsv,.dat"
              className="text-sm"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setText(await f.text());
              }}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="data">Columns: wavelength (or energy), n, k</label>
          <textarea
            id="data"
            name="data"
            className="input font-mono"
            rows={8}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"# wavelength_nm, n, k\n400, 1.47, 1.95\n500, 0.97, 1.87"}
            aria-describedby="data-status"
          />
          <p id="data-status" className="mt-1 text-xs text-muted" aria-live="polite">
            {parsed ? (parsed.errors.length ? <span className="text-danger">{parsed.errors.join("; ")}</span> : `${parsed.rows.length} points parsed.`) : "Paste data or upload a file."}
          </p>
        </div>
        {parsed && parsed.rows.length > 1 && parsed.errors.length === 0 && (
          <LineChart
            title="Preview"
            series={[
              { id: "n", label: "n", x: parsed.rows.map((r) => r[0]), y: parsed.rows.map((r) => r[1]) },
              { id: "k", label: "k", x: parsed.rows.map((r) => r[0]), y: parsed.rows.map((r) => r[2]), dashed: true },
            ]}
            xLabel="Wavelength (nm)"
            yLabel="n, k"
            height={260}
          />
        )}
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="rights" required className="mt-1" />
        <span>I have the right to share this data under the selected licence, and the reference is the original source.</span>
      </label>

      {state && (
        <p role={state.ok ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${state.ok ? "border-success text-success" : "border-danger text-danger"}`}>
          {state.message}
        </p>
      )}
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit for review"}
      </button>
    </form>
  );
}
