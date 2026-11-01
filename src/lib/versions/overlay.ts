// Overlay plots for comparing two versions' results: spectra (R/T/A) and cross-section spectra.
// Pure functions shared by the diff page and the unit tests.

import { SERIES_COLORS } from "../chart";
import type { AnyResult } from "../problem/result";

export const OVERLAY_KINDS = ["spectrum", "cross_sections"] as const;
export type OverlayKind = (typeof OVERLAY_KINDS)[number];
export const isOverlayKind = (k: string): k is OverlayKind => (OVERLAY_KINDS as readonly string[]).includes(k);

interface LinkedResult {
  id: string;
  kind: string;
  specName: string | null;
  name: string;
}

/**
 * Pairs of results to overlay: for each spec (by name) and result kind that both versions have, the
 * newest result of each. Pairs that are the same stored object are dropped (nothing to compare).
 */
export function pairResults<R extends LinkedResult & { storageKey?: string }>(before: R[], after: R[]): { spec: string | null; kind: OverlayKind; before: R; after: R }[] {
  const key = (r: R) => `${r.specName ?? ""}\u0000${r.kind}`;
  const first = (list: R[]) => {
    const m = new Map<string, R>();
    for (const r of list) if (isOverlayKind(r.kind) && !m.has(key(r))) m.set(key(r), r);
    return m;
  };
  const a = first(before);
  const out: { spec: string | null; kind: OverlayKind; before: R; after: R }[] = [];
  for (const [k, b] of first(after)) {
    const x = a.get(k);
    if (!x || (x.storageKey && x.storageKey === b.storageKey)) continue;
    out.push({ spec: b.specName, kind: b.kind as OverlayKind, before: x, after: b });
  }
  return out;
}

export interface OverlaySeries {
  id: string;
  label: string;
  x: number[];
  y: number[];
  color: string;
  dashed: boolean;
}

export interface OverlayOptions {
  /** polarization and angle index for spectra */
  pol?: string;
  angle?: number;
}

/** The common choices for spectra: polarizations both results have, and angles of the first. */
export function overlayChoices(a: AnyResult, b: AnyResult) {
  if (a.kind !== "spectrum" || b.kind !== "spectrum") return { pols: [] as string[], angles: [] as number[] };
  return { pols: a.polarizations.filter((p) => b.polarizations.includes(p)), angles: a.angles_deg.filter((x) => b.angles_deg.includes(x)) };
}

/**
 * Series for one chart: quantities in colour, the earlier version dashed and the later one solid.
 * Results of different kinds cannot be overlaid and give no series.
 */
export function overlaySeries(a: AnyResult, b: AnyResult, labels: [string, string], opts: OverlayOptions = {}): OverlaySeries[] {
  if (a.kind !== b.kind) return [];
  const out: OverlaySeries[] = [];
  const pairs: [AnyResult, string, boolean][] = [
    [a, labels[0], true],
    [b, labels[1], false],
  ];
  if (a.kind === "cross_sections" && b.kind === "cross_sections") {
    const q = [
      ["ext", "C_ext", "c_ext_nm2"],
      ["sca", "C_sca", "c_sca_nm2"],
      ["abs", "C_abs", "c_abs_nm2"],
    ] as const;
    for (const [r, label, dashed] of pairs as [typeof a, string, boolean][]) {
      q.forEach(([id, name, field], qi) => out.push({ id: `${id}-${label}`, label: `${name} · ${label}`, x: r.wavelengths_nm, y: r[field], color: SERIES_COLORS[qi], dashed }));
    }
    return out;
  }
  if (a.kind === "spectrum" && b.kind === "spectrum") {
    const { pols, angles } = overlayChoices(a, b);
    const pol = opts.pol && pols.includes(opts.pol) ? opts.pol : pols[0];
    const angle = angles[opts.angle ?? 0] ?? angles[0];
    if (pol === undefined || angle === undefined) return [];
    for (const [r, label, dashed] of pairs as [typeof a, string, boolean][]) {
      const ai = r.angles_deg.indexOf(angle);
      (["r", "t", "a"] as const).forEach((q, qi) => {
        const y = r[q][pol]?.[ai];
        if (y) out.push({ id: `${q}-${label}`, label: `${q.toUpperCase()} (${pol}, ${angle}°) · ${label}`, x: r.wavelengths_nm, y, color: SERIES_COLORS[qi], dashed });
      });
    }
  }
  return out;
}
