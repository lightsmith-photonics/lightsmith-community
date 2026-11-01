"use client";

import { useId } from "react";

export function AxisToggle({ axis, setAxis }: { axis: "nm" | "ev"; setAxis: (a: "nm" | "ev") => void }) {
  const uid = useId();
  return (
    <fieldset className="flex items-center gap-3">
      <legend className="sr-only">Horizontal axis</legend>
      <label className="flex items-center gap-1">
        <input type="radio" name={`${uid}-ax`} checked={axis === "nm"} onChange={() => setAxis("nm")} /> nm
      </label>
      <label className="flex items-center gap-1">
        <input type="radio" name={`${uid}-ax`} checked={axis === "ev"} onChange={() => setAxis("ev")} /> eV
      </label>
    </fieldset>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void; label: string }) {
  if (tabs.length < 2) return null;
  return (
    <div role="tablist" aria-label={label} className="mb-3 flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          className={`-mb-px rounded-t-md border px-3 py-1.5 text-sm ${value === t.id ? "border-line border-b-bg bg-bg font-semibold" : "border-transparent text-muted hover:text-fg"}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
