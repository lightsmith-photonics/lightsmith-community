import { dump } from "js-yaml";
import type { DatasetSummary, NkData, SubmissionInput } from "./types";

// Download formats for a dataset, generated client- or server-side from the n,k columns.

export function toCsv(ds: DatasetSummary, d: NkData): string {
  const header = [
    `# ${ds.material_id} — ${ds.name}`,
    `# reference: ${ds.reference}`,
    ds.doi ? `# doi: https://doi.org/${ds.doi}` : null,
    `# license: ${ds.license}`,
    "wavelength_nm,n,k",
  ].filter(Boolean);
  const rows = d.wavelength_nm.map((w, i) => `${w},${d.n[i]},${d.k[i]}`);
  return [...header, ...rows].join("\n") + "\n";
}

/** YAML in the widely used "tabulated nk" layout (wavelength in micrometres). */
export function toYaml(ds: DatasetSummary, d: NkData): string {
  const data = d.wavelength_nm.map((w, i) => `${+(w / 1000).toPrecision(8)} ${d.n[i]} ${d.k[i]}`).join("\n") + "\n";
  return dump(
    {
      REFERENCES: ds.reference + (ds.doi ? ` doi:${ds.doi}` : ""),
      COMMENTS: [ds.comments, `License: ${ds.license}`].filter(Boolean).join("\n"),
      DATA: [{ type: "tabulated nk", data }],
    },
    { lineWidth: -1 },
  );
}

/** The library's `tabulated` material, ready to paste into any problem spec. */
export function toMaterialJson(ds: DatasetSummary, d: NkData) {
  return {
    kind: "tabulated" as const,
    wavelength_nm: d.wavelength_nm,
    n_real: d.n,
    n_imag: d.k,
    source: `${ds.reference}${ds.doi ? ` doi:${ds.doi}` : ""} (${ds.license})`,
  };
}

export function toNkFile(format: "csv" | "yaml" | "json", ds: DatasetSummary, d: NkData) {
  const base = `${ds.material_id}_${ds.name}`.replace(/[^A-Za-z0-9_.-]+/g, "_");
  switch (format) {
    case "csv":
      return { filename: `${base}.csv`, mime: "text/csv", body: toCsv(ds, d) };
    case "yaml":
      return { filename: `${base}.yml`, mime: "application/yaml", body: toYaml(ds, d) };
    case "json":
      return { filename: `${base}.material.json`, mime: "application/json", body: JSON.stringify(toMaterialJson(ds, d), null, 2) };
  }
}

export function eV(nm: number) {
  return 1239.841984 / nm;
}

/**
 * Parse pasted/uploaded n,k data for a submission: CSV/TSV/whitespace rows of
 * wavelength n [k]. Units: "nm" (default), "um" or "eV" for the first column.
 */
export function parseNkTable(text: string, unit: "nm" | "um" | "ev" = "nm"): { rows: SubmissionInput["data"]; errors: string[] } {
  const rows: SubmissionInput["data"] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith("#") || /^[a-z_\s,;]+$/i.test(t)) return; // blank, comment, header
    const parts = t.split(/[\s,;]+/).map(Number);
    if (parts.length < 2 || parts.some((x) => !Number.isFinite(x))) {
      errors.push(`line ${i + 1}: expected "wavelength n [k]"`);
      return;
    }
    let wl = parts[0];
    if (unit === "um") wl *= 1000;
    if (unit === "ev") wl = 1239.841984 / wl;
    if (wl <= 0) errors.push(`line ${i + 1}: wavelength must be positive`);
    if ((parts[2] ?? 0) < 0) errors.push(`line ${i + 1}: k must be >= 0 (exp(-iωt) convention)`);
    rows.push([wl, parts[1], parts[2] ?? 0]);
  });
  rows.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === rows[i - 1][0]) {
      errors.push(`duplicate wavelength ${rows[i][0]} nm`);
      break;
    }
  }
  if (rows.length < 2 && errors.length === 0) errors.push("at least two data rows are required");
  return { rows, errors: errors.slice(0, 10) };
}
