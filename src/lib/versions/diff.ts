// Structured JSON diff of problem specs. Property names in the problem schema carry their unit as a
// suffix (thickness_nm, angle_deg, wp_ev), so every changed leaf is reported with the unit of the
// nearest unit-suffixed key on its path; `wavelengths.start_nm` and `position_nm[2]` are both nm.

import type { SpecSnapshot } from "./snapshot";

export type DiffOp = "added" | "removed" | "changed";
export type PathSegment = string | number;

export interface DiffEntry {
  op: DiffOp;
  path: PathSegment[];
  before?: unknown;
  after?: unknown;
  unit: string | null;
  /** after − before, for numbers */
  delta?: number;
}

const UNITS: Record<string, string> = {
  nm: "nm",
  nm2: "nm²",
  um: "µm",
  mm: "mm",
  m: "m",
  deg: "°",
  rad: "rad",
  ev: "eV",
  thz: "THz",
  ghz: "GHz",
  hz: "Hz",
  fs: "fs",
  ps: "ps",
  s: "s",
  db: "dB",
  w: "W",
};

/** Unit encoded in a property name (`radius_nm` → nm), or null. */
export function unitOfKey(key: string): string | null {
  const m = /_([a-z0-9]+)$/.exec(key);
  return m ? (UNITS[m[1]] ?? null) : null;
}

/** Unit for a path: the innermost unit-suffixed key. */
export function unitOfPath(path: PathSegment[]): string | null {
  for (let i = path.length - 1; i >= 0; i--) {
    const seg = path[i];
    if (typeof seg === "string") {
      const u = unitOfKey(seg);
      if (u) return u;
    }
  }
  return null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Deep equality for JSON values (key order does not matter). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => k in b && jsonEqual(a[k], b[k]));
  }
  return false;
}

/** Changed leaves between two JSON values. Arrays are compared index by index. */
export function diffJson(before: unknown, after: unknown, path: PathSegment[] = []): DiffEntry[] {
  if (jsonEqual(before, after)) return [];
  const out: DiffEntry[] = [];
  const entry = (op: DiffOp, b: unknown, a: unknown, p: PathSegment[]) => {
    const e: DiffEntry = { op, path: p, unit: unitOfPath(p) };
    if (op !== "added") e.before = b;
    if (op !== "removed") e.after = a;
    if (typeof a === "number" && typeof b === "number") e.delta = a - b;
    out.push(e);
  };
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    for (const k of keys) {
      if (!(k in after)) entry("removed", before[k], undefined, [...path, k]);
      else if (!(k in before)) entry("added", undefined, after[k], [...path, k]);
      else out.push(...diffJson(before[k], after[k], [...path, k]));
    }
    return out;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      if (i >= after.length) entry("removed", before[i], undefined, [...path, i]);
      else if (i >= before.length) entry("added", undefined, after[i], [...path, i]);
      else out.push(...diffJson(before[i], after[i], [...path, i]));
    }
    return out;
  }
  entry("changed", before, after, path);
  return out;
}

/** `layers[0].thickness_nm` */
export function formatPath(path: PathSegment[]): string {
  if (path.length === 0) return "(whole spec)";
  return path.map((s, i) => (typeof s === "number" ? `[${s}]` : i === 0 ? s : `.${s}`)).join("");
}

/** A value for display: numbers and number arrays get the unit, objects are compact JSON. */
export function formatValue(value: unknown, unit: string | null): string {
  if (value === undefined) return "—";
  const u = unit ? (unit === "°" ? "°" : ` ${unit}`) : "";
  if (typeof value === "number") return `${value}${u}`;
  if (Array.isArray(value) && value.length <= 8 && value.every((v) => typeof v === "number")) return `[${value.join(", ")}]${u}`;
  const s = JSON.stringify(value);
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

export function formatDelta(delta: number, before: unknown, unit: string | null): string {
  const u = unit ? (unit === "°" ? "°" : ` ${unit}`) : "";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  const mag = Number(Math.abs(delta).toPrecision(6));
  const rel = typeof before === "number" && before !== 0 ? ` (${sign}${Number(Math.abs((delta / before) * 100).toPrecision(3))} %)` : "";
  return `${sign}${mag}${u}${rel}`;
}

export interface SpecDiff {
  /** "added" | "removed" specs, or "changed" / "unchanged" ones present in both */
  status: "added" | "removed" | "changed" | "unchanged";
  name: string;
  beforeName?: string;
  kind: string;
  entries: DiffEntry[];
}

/**
 * Diff two versions' spec sets. Specs are matched by id first (the live spec row they came from),
 * then by name, so renames show as a change to `name` rather than a removal plus an addition.
 */
export function diffSnapshots(before: SpecSnapshot[], after: SpecSnapshot[]): SpecDiff[] {
  const unmatched = new Set(before.map((_, i) => i));
  const pairs: [SpecSnapshot | null, SpecSnapshot][] = [];
  const take = (pred: (s: SpecSnapshot) => boolean) => {
    for (const i of unmatched) {
      if (pred(before[i])) {
        unmatched.delete(i);
        return before[i];
      }
    }
    return null;
  };
  const byId = after.map((a) => (a.id ? take((b) => b.id === a.id) : null));
  after.forEach((a, j) => pairs.push([byId[j] ?? take((b) => b.name === a.name), a]));

  const out: SpecDiff[] = pairs.map(([b, a]) => {
    if (!b) return { status: "added", name: a.name, kind: a.kind, entries: [] };
    const entries = diffJson(b.problem, a.problem);
    if (b.name !== a.name) entries.unshift({ op: "changed", path: ["(name)"], before: b.name, after: a.name, unit: null });
    return { status: entries.length ? "changed" : "unchanged", name: a.name, beforeName: b.name, kind: a.kind, entries };
  });
  for (const i of unmatched) out.push({ status: "removed", name: before[i].name, kind: before[i].kind, entries: [] });
  return out;
}
