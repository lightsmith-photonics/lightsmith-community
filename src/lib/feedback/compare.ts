// Compare a re-run or a measurement with the result a feedback request is about. Both sides are
// ResultPreview-shaped digests ({x, series}); matching series are compared on the reference's x
// points inside the common x range, with the candidate linearly interpolated. The numbers are
// there to support the responder's own verdict ("reproduced it", "agrees"), not to replace it.

export interface Curves {
  x: number[];
  series: { label: string; y: number[] }[];
}

export interface SeriesComparison {
  reference: string;
  candidate: string;
  points: number;
  x_min: number;
  x_max: number;
  max_abs_diff: number;
  rms_diff: number;
  /** RMS difference relative to the largest |reference| value in the overlap */
  relative_rms: number | null;
}

export interface Comparison {
  comparable: boolean;
  reason?: string;
  series: SeriesComparison[];
  summary: string;
  notes: string[];
}

/** Linear interpolation on ascending x; null outside the range. */
export function interpolate(x: number[], y: number[], at: number): number | null {
  const n = x.length;
  if (n === 0 || at < x[0] || at > x[n - 1]) return null;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (x[mid] <= at) lo = mid;
    else hi = mid;
  }
  if (x[hi] === x[lo]) return y[lo];
  const t = (at - x[lo]) / (x[hi] - x[lo]);
  return y[lo] + t * (y[hi] - y[lo]);
}

function ascending(x: number[], y: number[]): { x: number[]; y: number[] } {
  if (x.every((v, i) => i === 0 || v >= x[i - 1])) return { x, y };
  const order = x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  return { x: order.map((i) => x[i]), y: order.map((i) => y[i]) };
}

export function compareCurve(ref: { x: number[]; y: number[] }, cand: { x: number[]; y: number[] }): Omit<SeriesComparison, "reference" | "candidate"> | null {
  const r = ascending(ref.x, ref.y);
  const c = ascending(cand.x, cand.y);
  if (r.x.length === 0 || c.x.length === 0) return null;
  const lo = Math.max(r.x[0], c.x[0]);
  const hi = Math.min(r.x[r.x.length - 1], c.x[c.x.length - 1]);
  let sumSq = 0;
  let maxAbs = 0;
  let scale = 0;
  let points = 0;
  for (let i = 0; i < r.x.length; i++) {
    const xv = r.x[i];
    if (xv < lo || xv > hi || !Number.isFinite(r.y[i])) continue;
    const cv = interpolate(c.x, c.y, xv);
    if (cv === null || !Number.isFinite(cv)) continue;
    const d = cv - r.y[i];
    sumSq += d * d;
    maxAbs = Math.max(maxAbs, Math.abs(d));
    scale = Math.max(scale, Math.abs(r.y[i]));
    points++;
  }
  if (points < 3) return null;
  const rms = Math.sqrt(sumSq / points);
  const sig = (v: number) => +v.toPrecision(4);
  return { points, x_min: sig(lo), x_max: sig(hi), max_abs_diff: sig(maxAbs), rms_diff: sig(rms), relative_rms: scale > 0 ? sig(rms / scale) : null };
}

const SYMBOLS: [string, RegExp][] = [
  ["R", /^(r|refl|reflectance|reflectivity|reflection)$/],
  ["T", /^(t|trans|transmittance|transmission|transmissivity)$/],
  ["A", /^(a|absorptance|absorptivity)$/],
  ["Q_ext", /^(q_?ext|extinction|ext|extinction efficiency)$/],
  ["Q_sca", /^(q_?sca|scattering|sca|scattering efficiency)$/],
  ["Q_abs", /^(q_?abs|absorption|abs|absorption efficiency)$/],
  ["n_eff", /^(n_?eff|neff|effective index|effective_index)$/],
];

const QUANTITY_SYMBOL: Record<string, string> = {
  reflectance: "R",
  transmittance: "T",
  absorptance: "A",
  extinction: "Q_ext",
  scattering: "Q_sca",
  absorption: "Q_abs",
  effective_index: "n_eff",
};

/** "R (s)" → "R", "reflectance [%]" → "R", "Q_ext" → "Q_ext"; null if unknown. */
export function symbolOf(label: string): string | null {
  const base = label.replace(/\(.*?\)|\[.*?\]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  for (const [sym, re] of SYMBOLS) if (re.test(base)) return sym;
  const first = base.split(/[\s_,]/)[0];
  for (const [sym, re] of SYMBOLS) if (re.test(first)) return sym;
  return null;
}

function fmt(v: number) {
  return Math.abs(v) >= 0.01 || v === 0 ? v.toFixed(3) : v.toExponential(2);
}

function summarise(series: SeriesComparison[]): string {
  return series
    .map((s) => {
      const rel = s.relative_rms === null ? "" : ` (${(s.relative_rms * 100).toFixed(1)} % of the reference peak)`;
      return `${s.reference}: RMS difference ${fmt(s.rms_diff)}${rel}, max ${fmt(s.max_abs_diff)}, over ${s.x_min}–${s.x_max} (${s.points} points)`;
    })
    .join("; ");
}

/** A re-run against the original result: series with the same label (same result kind). */
export function compareRerun(reference: Curves & { kind?: string }, candidate: Curves & { kind?: string }): Comparison {
  if (reference.kind && candidate.kind && reference.kind !== candidate.kind) {
    return { comparable: false, reason: `different result kinds (${reference.kind} vs ${candidate.kind})`, series: [], summary: "", notes: [] };
  }
  const series: SeriesComparison[] = [];
  for (const rs of reference.series) {
    const cs = candidate.series.find((s) => s.label === rs.label) ?? candidate.series.find((s) => symbolOf(s.label) !== null && symbolOf(s.label) === symbolOf(rs.label));
    if (!cs) continue;
    const c = compareCurve({ x: reference.x, y: rs.y }, { x: candidate.x, y: cs.y });
    if (c) series.push({ reference: rs.label, candidate: cs.label, ...c });
  }
  if (series.length === 0) return { comparable: false, reason: "no matching curves over a common range", series, summary: "", notes: [] };
  return { comparable: true, series, summary: summarise(series), notes: [] };
}

/** Measured data against the simulated result, matching columns by name or by the stated quantity. */
export function compareMeasurement(reference: Curves, measured: Curves, quantity: string): Comparison {
  const notes: string[] = [];
  const series: SeriesComparison[] = [];
  const fallback = QUANTITY_SYMBOL[quantity] ?? null;
  for (const ms of measured.series) {
    const sym = symbolOf(ms.label) ?? (measured.series.length === 1 ? fallback : null);
    if (!sym) continue;
    const rs = reference.series.find((s) => symbolOf(s.label) === sym);
    if (!rs) continue;
    let y = ms.y;
    if (["R", "T", "A"].includes(sym) && Math.max(...y.map(Math.abs)) > 1.5 && Math.max(...rs.y.map(Math.abs)) <= 1.000001) {
      y = y.map((v) => v / 100);
      notes.push(`${ms.label} looks like percent; divided by 100`);
    }
    const c = compareCurve({ x: reference.x, y: rs.y }, { x: measured.x, y });
    if (c) series.push({ reference: rs.label, candidate: ms.label, ...c });
  }
  if (series.length === 0) {
    return { comparable: false, reason: "no measured column matches a simulated curve over a common wavelength range", series, summary: "", notes };
  }
  return { comparable: true, series, summary: summarise(series), notes };
}
