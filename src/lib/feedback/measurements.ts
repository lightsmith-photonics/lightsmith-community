// Measured data for experimental comparisons: CSV/TSV text (a header row, x in the first column,
// one column per measured quantity, '#' comment lines) or JSON {x_label?, x: [...], series: [{label, y}]}.
// The x axis is converted to vacuum wavelength in nm when the header says µm, eV or cm⁻¹.

export interface Measurement {
  x_label: string;
  x: number[];
  series: { label: string; y: number[] }[];
  /** what was done to the x axis, e.g. "converted from eV" */
  notes: string[];
}

export type ParsedMeasurement = { ok: true; measurement: Measurement } | { ok: false; error: string };

export const MAX_ROWS = 20_000;
export const MAX_SERIES = 8;
const HC_EV_NM = 1239.841984;

export const QUANTITIES = ["reflectance", "transmittance", "absorptance", "extinction", "scattering", "absorption", "effective_index", "other"] as const;
export type Quantity = (typeof QUANTITIES)[number];

type XUnit = "nm" | "um" | "ev" | "wavenumber" | "unknown";

function unitOf(label: string): XUnit {
  const l = label.toLowerCase();
  if (/\b(cm-1|cm\^-1|cm⁻¹|wavenumber)/.test(l)) return "wavenumber";
  if (/\bev\b|energy/.test(l)) return "ev";
  if (/(µm|μm|\bum\b|micron)/.test(l)) return "um";
  if (/\bnm\b|nanomet|wavelength|lambda|λ/.test(l)) return "nm";
  return "unknown";
}

function toNm(x: number[], unit: XUnit): { x: number[]; note?: string } {
  switch (unit) {
    case "um":
      return { x: x.map((v) => v * 1000), note: "x converted from µm to nm" };
    case "ev":
      return { x: x.map((v) => HC_EV_NM / v), note: "x converted from photon energy (eV) to wavelength (nm)" };
    case "wavenumber":
      return { x: x.map((v) => 1e7 / v), note: "x converted from wavenumber (cm⁻¹) to wavelength (nm)" };
    case "unknown":
      return { x, note: "x unit not stated; assumed to be wavelength in nm" };
    default:
      return { x };
  }
}

function finish(xLabel: string, x: number[], series: { label: string; y: number[] }[]): ParsedMeasurement {
  if (x.length < 2) return { ok: false, error: "need at least two data rows" };
  if (x.length > MAX_ROWS) return { ok: false, error: `at most ${MAX_ROWS} rows` };
  if (series.length === 0) return { ok: false, error: "need at least one measured column next to x" };
  if (series.length > MAX_SERIES) return { ok: false, error: `at most ${MAX_SERIES} measured columns` };
  for (const s of series) if (s.y.length !== x.length) return { ok: false, error: `column "${s.label}" has ${s.y.length} values for ${x.length} x values` };
  const unit = unitOf(xLabel);
  const conv = toNm(x, unit);
  if (conv.x.some((v) => !Number.isFinite(v) || v <= 0)) return { ok: false, error: "x values must be positive wavelengths (or energies / wavenumbers)" };
  // sort ascending by wavelength (eV and cm⁻¹ data come in reverse)
  const order = conv.x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  return {
    ok: true,
    measurement: {
      x_label: "Wavelength (nm)",
      x: order.map((i) => conv.x[i]),
      series: series.map((s) => ({ label: s.label.slice(0, 60), y: order.map((i) => s.y[i]) })),
      notes: conv.note ? [conv.note] : [],
    },
  };
}

function parseCsv(text: string): ParsedMeasurement {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (lines.length < 3) return { ok: false, error: "CSV needs a header row and at least two data rows" };
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : lines[0].includes(",") ? "," : /\s+/;
  const split = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
  const header = split(lines[0]);
  const firstIsNumeric = header.every((h) => h !== "" && Number.isFinite(Number(h)));
  if (firstIsNumeric) return { ok: false, error: "the first row must be a header, e.g. wavelength_nm,R" };
  if (header.length < 2) return { ok: false, error: "need an x column and at least one measured column" };
  const x: number[] = [];
  const cols: number[][] = header.slice(1).map(() => []);
  for (const [i, line] of lines.slice(1).entries()) {
    const cells = split(line);
    if (cells.length < header.length) return { ok: false, error: `row ${i + 2} has ${cells.length} columns, the header has ${header.length}` };
    const used = cells.slice(0, header.length);
    // Number("") is 0: an empty cell must not turn into a measured zero.
    if (used.some((c) => c === "")) return { ok: false, error: `row ${i + 2} has an empty value` };
    const nums = used.map(Number);
    if (nums.some((n) => !Number.isFinite(n))) return { ok: false, error: `row ${i + 2} has a value that is not a number` };
    x.push(nums[0]);
    nums.slice(1).forEach((n, j) => cols[j].push(n));
    if (x.length > MAX_ROWS) return { ok: false, error: `at most ${MAX_ROWS} rows` };
  }
  return finish(header[0], x, header.slice(1).map((label, j) => ({ label, y: cols[j] })));
}

function parseJsonData(value: unknown): ParsedMeasurement {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "JSON data must be an object {x, series}" };
  const v = value as { x?: unknown; x_label?: unknown; series?: unknown };
  if (!Array.isArray(v.x) || !v.x.every((n) => typeof n === "number" && Number.isFinite(n))) return { ok: false, error: "x must be an array of numbers" };
  if (!Array.isArray(v.series)) return { ok: false, error: "series must be an array of {label, y}" };
  const series: { label: string; y: number[] }[] = [];
  for (const [i, s] of v.series.entries()) {
    const ss = s as { label?: unknown; y?: unknown };
    if (typeof ss?.label !== "string" || !Array.isArray(ss.y) || !ss.y.every((n) => typeof n === "number" && Number.isFinite(n))) {
      return { ok: false, error: `series[${i}] must be {label: string, y: number[]}` };
    }
    series.push({ label: ss.label, y: ss.y as number[] });
  }
  return finish(typeof v.x_label === "string" ? v.x_label : "Wavelength (nm)", v.x as number[], series);
}

/** Parse CSV/TSV text, a JSON string, or an already-parsed JSON value. */
export function parseMeasurement(input: unknown): ParsedMeasurement {
  if (typeof input === "string") {
    const t = input.trim();
    if (t.startsWith("{")) {
      try {
        return parseJsonData(JSON.parse(t));
      } catch (err) {
        return { ok: false, error: `invalid JSON: ${(err as Error).message}` };
      }
    }
    return parseCsv(t);
  }
  return parseJsonData(input);
}

/** A ResultPreview-shaped digest (≤ 160 points per series) for charts and comparisons. */
export function measurementPreview(m: Measurement, quantity: string) {
  const n = m.x.length;
  const idx = n <= 160 ? m.x.map((_, i) => i) : Array.from({ length: 160 }, (_, i) => Math.round((i * (n - 1)) / 159));
  const lo = Math.round(m.x[0]);
  const hi = Math.round(m.x[n - 1]);
  return {
    kind: "measurement" as const,
    headline: `${m.series.map((s) => s.label).join(", ")}: ${n} points, ${lo}–${hi} nm`,
    xLabel: m.x_label,
    yLabel: quantity,
    x: idx.map((i) => m.x[i]),
    series: m.series.map((s) => ({ label: s.label, y: idx.map((i) => s.y[i]) })),
  };
}
