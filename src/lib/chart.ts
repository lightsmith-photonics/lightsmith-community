// Small plotting helpers shared by the SVG charts (no chart library dependency, so the same
// code renders in pages, embeds and OG images).

export function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

export function niceTicks(min: number, max: number, target = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const step = niceStep(max - min, target);
  const start = Math.ceil(min / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
  return ticks;
}

export function logTicks(min: number, max: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    const v = 10 ** e;
    if (v >= min * 0.999 && v <= max * 1.001) out.push(v);
  }
  return out;
}

export function extent(values: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo === Infinity ? [0, 1] : [lo, hi];
}

/** Pad a domain by a fraction on both sides (and widen zero-height ranges). */
export function padDomain([lo, hi]: [number, number], frac = 0.05): [number, number] {
  if (lo === hi) return [lo - Math.abs(lo || 1) * 0.5, hi + Math.abs(hi || 1) * 0.5];
  const d = (hi - lo) * frac;
  return [lo - d, hi + d];
}

export function formatTick(v: number): string {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(1).replace("e+", "e");
  return +v.toPrecision(4) + "";
}

/** Index of the point closest to x in a sorted (ascending) array. */
export function nearestIndex(xs: number[], x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi;
}

/** Perceptually ordered colour map (viridis-like) for heatmaps, t in [0, 1]. */
const STOPS: [number, number, number][] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];
export function colormap(t: number): string {
  if (!Number.isFinite(t)) return "rgb(128,128,128)";
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const [a, b] = [STOPS[i], STOPS[i + 1]];
  return `rgb(${Math.round(a[0] + f * (b[0] - a[0]))},${Math.round(a[1] + f * (b[1] - a[1]))},${Math.round(a[2] + f * (b[2] - a[2]))})`;
}

export const SERIES_COLORS = ["var(--plot-1)", "var(--plot-2)", "var(--plot-3)", "var(--plot-4)", "var(--plot-5)", "var(--plot-6)"];

/** Build an SVG path, breaking the line at non-finite values. */
export function linePath(points: [number, number][]): string {
  let d = "";
  let pen = false;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    pen = true;
  }
  return d;
}
