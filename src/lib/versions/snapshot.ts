// What a project version stores: the project's specs at the time of a save, and which results belong
// to it. Pure functions; the database side is in ./store.ts.

import { jsonEqual } from "./diff";

export interface SpecSnapshot {
  /** id of the live spec row this came from (null once forked or restored into another row) */
  id: string | null;
  name: string;
  kind: string;
  problem: Record<string, unknown>;
}

/** Live spec rows → snapshot. Spec JSON is validated on save, so a parse failure keeps the text. */
export function snapshotFromSpecs(specs: { id: string; name: string; kind: string; json: string }[]): SpecSnapshot[] {
  return specs.map((s) => {
    let problem: Record<string, unknown>;
    try {
      problem = JSON.parse(s.json) as Record<string, unknown>;
    } catch {
      problem = { _unparsed: s.json };
    }
    return { id: s.id, name: s.name, kind: s.kind, problem };
  });
}

/** Read a stored snapshot defensively (it comes from a Json column). */
export function parseSnapshot(value: unknown): SpecSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const o = v as Record<string, unknown>;
    if (typeof o.name !== "string" || !o.problem || typeof o.problem !== "object" || Array.isArray(o.problem)) return [];
    return [{ id: typeof o.id === "string" ? o.id : null, name: o.name, kind: typeof o.kind === "string" ? o.kind : "scattering", problem: o.problem as Record<string, unknown> }];
  });
}

/** Spec JSON as the editor and the spec API store it. */
export const specJson = (s: SpecSnapshot) => JSON.stringify(s.problem, null, 2);

/** Find the spec a result came from: by spec id, then by name. */
export function findSpec(snapshot: SpecSnapshot[], ref: { specId: string | null; specName: string | null }): SpecSnapshot | null {
  return (ref.specId ? snapshot.find((s) => s.id === ref.specId) : undefined) ?? (ref.specName ? snapshot.find((s) => s.name === ref.specName) : undefined) ?? null;
}

export interface LinkedResult {
  specId: string | null;
  specName: string | null;
  storageKey: string;
}

/**
 * Results that still describe a new snapshot. A result carries over from an earlier version when the
 * spec that produced it is in the new snapshot with an identical problem (or it has no spec at all).
 * Each source is an earlier version; duplicates (same stored object) are dropped.
 */
export function carriedResults<R extends LinkedResult>(next: SpecSnapshot[], sources: { snapshot: SpecSnapshot[]; results: R[] }[]): (R & { nextSpec: SpecSnapshot | null })[] {
  const seen = new Set<string>();
  const out: (R & { nextSpec: SpecSnapshot | null })[] = [];
  for (const { snapshot, results } of sources) {
    for (const r of results) {
      if (seen.has(r.storageKey)) continue;
      let nextSpec: SpecSnapshot | null = null;
      if (r.specId || r.specName) {
        const prev = findSpec(snapshot, r);
        if (!prev) continue;
        nextSpec = (prev.id ? next.find((s) => s.id === prev.id) : undefined) ?? next.find((s) => s.name === prev.name) ?? null;
        if (!nextSpec || !jsonEqual(prev.problem, nextSpec.problem)) continue;
      }
      seen.add(r.storageKey);
      out.push({ ...r, nextSpec });
    }
  }
  return out;
}

/** Message shown for versions saved without one. */
export function defaultMessage(v: { number: number; restoredFrom: number | null }): string {
  if (v.restoredFrom) return `Restored v${v.restoredFrom}`;
  return v.number === 1 ? "Initial version" : "Updated specs";
}
