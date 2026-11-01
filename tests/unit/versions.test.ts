import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { diffJson, diffSnapshots, formatDelta, formatPath, formatValue, jsonEqual, unitOfKey, unitOfPath } from "@/lib/versions/diff";
import { carriedResults, defaultMessage, findSpec, parseSnapshot, snapshotFromSpecs, type SpecSnapshot } from "@/lib/versions/snapshot";
import { overlayChoices, overlaySeries, pairResults } from "@/lib/versions/overlay";
import { canContribute, canEditProject, canViewProject, isCollaborator } from "@/lib/roles";
import { parseResult, type AnyResult } from "@/lib/problem/result";
import { studioLink } from "@/lib/studio";
import layerStack from "@fixtures/demo/layer_stack.spec.json";

const fixtureResult = (name: string): AnyResult => {
  const p = parseResult(readFileSync(new URL(`../../fixtures/demo/${name}.result.json`, import.meta.url), "utf8"));
  if (!p.ok) throw new Error(p.error);
  return p.result;
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("units from property names", () => {
  it("reads the suffix of schema keys", () => {
    expect(unitOfKey("thickness_nm")).toBe("nm");
    expect(unitOfKey("angle_deg")).toBe("°");
    expect(unitOfKey("wp_ev")).toBe("eV");
    expect(unitOfKey("eps_inf")).toBeNull();
    expect(unitOfKey("n_real")).toBeNull();
    expect(unitOfKey("kind")).toBeNull();
  });

  it("uses the innermost unit-suffixed key on the path", () => {
    expect(unitOfPath(["wavelengths", "start_nm"])).toBe("nm");
    expect(unitOfPath(["particles", 0, "position_nm", 2])).toBe("nm");
    expect(unitOfPath(["angles_deg", 1])).toBe("°");
    expect(unitOfPath(["layers", 0, "material", "n_real"])).toBeNull();
  });
});

describe("diffJson", () => {
  it("is empty for equal values regardless of key order", () => {
    expect(jsonEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(diffJson({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toEqual([]);
  });

  it("reports changed leaves with paths, units and deltas", () => {
    const after = clone(layerStack) as typeof layerStack;
    after.layers[0].thickness_nm = 120;
    after.layers[0].material.n_real = 1.4;
    after.wavelengths.stop_nm = 900;
    const d = diffJson(layerStack, after);
    expect(d.map((e) => formatPath(e.path))).toEqual(["layers[0].thickness_nm", "layers[0].material.n_real", "wavelengths.stop_nm"]);
    expect(d[0]).toMatchObject({ op: "changed", before: 100, after: 120, unit: "nm", delta: 20 });
    expect(d[1]).toMatchObject({ unit: null });
    expect(d[1].delta).toBeCloseTo(0.02, 12);
    expect(d[2]).toMatchObject({ before: 800, after: 900, unit: "nm", delta: 100 });
  });

  it("reports added and removed keys and array items", () => {
    const before = { angles_deg: [0, 45], polarizations: ["s", "p"], medium_index: 1 };
    const after = { angles_deg: [0, 30, 60], polarizations: ["s"], options: { tol: 1e-6 } };
    const d = diffJson(before, after);
    const byPath = Object.fromEntries(d.map((e) => [formatPath(e.path), e]));
    expect(byPath["angles_deg[1]"]).toMatchObject({ op: "changed", before: 45, after: 30, unit: "°", delta: -15 });
    expect(byPath["angles_deg[2]"]).toMatchObject({ op: "added", after: 60, unit: "°" });
    expect(byPath["angles_deg[2]"]).not.toHaveProperty("before");
    expect(byPath["polarizations[1]"]).toMatchObject({ op: "removed", before: "p" });
    expect(byPath["medium_index"]).toMatchObject({ op: "removed", before: 1 });
    expect(byPath["options"]).toMatchObject({ op: "added", after: { tol: 1e-6 } });
  });

  it("reports a type change as one changed leaf", () => {
    const d = diffJson({ wavelengths: [400, 500] }, { wavelengths: { start_nm: 400, stop_nm: 500, num: 2 } });
    expect(d).toEqual([{ op: "changed", path: ["wavelengths"], before: [400, 500], after: { start_nm: 400, stop_nm: 500, num: 2 }, unit: null }]);
  });

  it("formats values and deltas with units", () => {
    expect(formatValue(120, "nm")).toBe("120 nm");
    expect(formatValue(45, "°")).toBe("45°");
    expect(formatValue([0, 0, 10], "nm")).toBe("[0, 0, 10] nm");
    expect(formatValue("drude", null)).toBe('"drude"');
    expect(formatValue(undefined, "nm")).toBe("—");
    expect(formatDelta(20, 100, "nm")).toBe("+20 nm (+20 %)");
    expect(formatDelta(-15, 45, "°")).toBe("−15° (−33.3 %)");
    expect(formatDelta(0.5, 0, null)).toBe("+0.5");
    expect(formatPath([])).toBe("(whole spec)");
  });
});

const snap = (id: string | null, name: string, problem: Record<string, unknown>, kind = "layer_stack"): SpecSnapshot => ({ id, name, kind, problem });

describe("diffSnapshots", () => {
  it("matches specs by id, so a rename is a change and not remove + add", () => {
    const a = [snap("s1", "ar-coating", { x_nm: 1 }), snap("s2", "bragg", { x_nm: 2 })];
    const b = [snap("s1", "ar-coating-v2", { x_nm: 1 }), snap("s2", "bragg", { x_nm: 3 }), snap("s3", "new", { x_nm: 4 })];
    const d = diffSnapshots(a, b);
    expect(d.map((s) => [s.name, s.status])).toEqual([
      ["ar-coating-v2", "changed"],
      ["bragg", "changed"],
      ["new", "added"],
    ]);
    expect(d[0].entries).toEqual([{ op: "changed", path: ["(name)"], before: "ar-coating", after: "ar-coating-v2", unit: null }]);
    expect(d[1].entries[0]).toMatchObject({ path: ["x_nm"], delta: 1, unit: "nm" });
  });

  it("falls back to names (forks and restores have new ids) and lists removed specs", () => {
    const a = [snap("old1", "film", { t_nm: 1 }), snap("old2", "gone", {})];
    const b = [snap("new1", "film", { t_nm: 1 })];
    expect(diffSnapshots(a, b).map((s) => [s.name, s.status])).toEqual([
      ["film", "unchanged"],
      ["gone", "removed"],
    ]);
  });
});

describe("snapshots", () => {
  it("are built from live spec rows and read back defensively", () => {
    const s = snapshotFromSpecs([{ id: "s1", name: "a", kind: "layer_stack", json: JSON.stringify(layerStack) }]);
    expect(s[0].problem).toEqual(layerStack);
    expect(parseSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseSnapshot(null)).toEqual([]);
    expect(parseSnapshot([{ name: "x" }, 3, { name: "ok", problem: {} }])).toEqual([{ id: null, name: "ok", kind: "scattering", problem: {} }]);
  });

  it("finds a result's spec by id, then by name", () => {
    const s = [snap("s1", "a", {}), snap("s2", "b", {})];
    expect(findSpec(s, { specId: "s2", specName: "a" })?.name).toBe("b");
    expect(findSpec(s, { specId: "gone", specName: "a" })?.id).toBe("s1");
    expect(findSpec(s, { specId: null, specName: null })).toBeNull();
  });

  it("names versions saved without a message", () => {
    expect(defaultMessage({ number: 1, restoredFrom: null })).toBe("Initial version");
    expect(defaultMessage({ number: 4, restoredFrom: 2 })).toBe("Restored v2");
  });
});

describe("carriedResults", () => {
  const v1 = [snap("s1", "film", { t_nm: 100 }), snap("s2", "mirror", { n: 8 })];
  const r = (key: string, specId: string | null, specName: string | null = null) => ({ storageKey: key, specId, specName });

  it("keeps results whose spec is unchanged and drops the others", () => {
    const v2 = [snap("s1", "film", { t_nm: 120 }), snap("s2", "mirror", { n: 8 })];
    const out = carriedResults(v2, [{ snapshot: v1, results: [r("a", "s1"), r("b", "s2"), r("c", null)] }]);
    expect(out.map((x) => x.storageKey)).toEqual(["b", "c"]);
    expect(out[0].nextSpec?.id).toBe("s2");
    expect(out[1].nextSpec).toBeNull();
  });

  it("drops results of a deleted spec and follows renamed rows by id", () => {
    const v2 = [snap("s1", "film-renamed", { t_nm: 100 })];
    const out = carriedResults(v2, [{ snapshot: v1, results: [r("a", "s1"), r("b", "s2")] }]);
    expect(out.map((x) => [x.storageKey, x.nextSpec?.name])).toEqual([["a", "film-renamed"]]);
  });

  it("brings back an old version's results on restore, without duplicates", () => {
    const v2 = [snap("s1", "film", { t_nm: 120 }), snap("s2", "mirror", { n: 8 })];
    const v2Results = [r("b", "s2"), r("x", "s1")];
    const v1Results = [r("a", "s1"), r("b", "s2")];
    // restoring v1: the live rows are reused, so the new snapshot equals v1
    const out = carriedResults(v1, [
      { snapshot: v2, results: v2Results },
      { snapshot: v1, results: v1Results },
    ]);
    expect(out.map((x) => x.storageKey).sort()).toEqual(["a", "b"]);
  });

  it("matches by name when the restored spec got a new row", () => {
    const next = [snap("s9", "film", { t_nm: 100 })];
    const out = carriedResults(next, [{ snapshot: v1, results: [r("a", "s1", "film")] }]);
    expect(out[0].nextSpec?.id).toBe("s9");
  });
});

describe("permissions", () => {
  const owner = { id: "o", role: "user" };
  const collab = { id: "c", role: "user" };
  const stranger = { id: "s", role: "user" };
  const admin = { id: "a", role: "admin" };
  const moderator = { id: "m", role: "moderator" };
  const project = (visibility: string) => ({ ownerId: "o", visibility, collaborators: [{ userId: "c" }] });

  it("lets anyone read public and unlisted projects (and so their versions)", () => {
    for (const vis of ["public", "unlisted"]) {
      for (const who of [null, owner, collab, stranger]) expect(canViewProject(project(vis), who)).toBe(true);
    }
  });

  it("keeps private projects to the owner, collaborators and admins", () => {
    const p = project("private");
    expect(canViewProject(p, null)).toBe(false);
    expect(canViewProject(p, stranger)).toBe(false);
    expect(canViewProject(p, moderator)).toBe(false);
    expect(canViewProject(p, owner)).toBe(true);
    expect(canViewProject(p, collab)).toBe(true);
    expect(canViewProject(p, admin)).toBe(true);
    // without the collaborator list loaded, collaborators get no access (fails closed)
    expect(canViewProject({ ownerId: "o", visibility: "private" }, collab)).toBe(false);
  });

  it("lets only owners, collaborators and admins create versions", () => {
    const p = project("public");
    expect(canContribute(p, null)).toBe(false);
    expect(canContribute(p, stranger)).toBe(false);
    expect(canContribute(p, moderator)).toBe(false);
    expect(canContribute(p, owner)).toBe(true);
    expect(canContribute(p, collab)).toBe(true);
    expect(canContribute(p, admin)).toBe(true);
  });

  it("keeps settings and the collaborator list to the owner", () => {
    const p = project("public");
    expect(isCollaborator(p, collab)).toBe(true);
    expect(canEditProject(p, collab)).toBe(false);
    expect(canEditProject(p, owner)).toBe(true);
  });
});

describe("result overlays", () => {
  const spectrum = fixtureResult("layer_stack");
  const cross = fixtureResult("scattering");

  it("pairs the newest result per spec and kind, skipping identical objects", () => {
    const a = [
      { id: "1", kind: "spectrum", specName: "film", name: "new", storageKey: "k1" },
      { id: "2", kind: "spectrum", specName: "film", name: "old", storageKey: "k2" },
      { id: "3", kind: "modes", specName: "wg", name: "m", storageKey: "k3" },
      { id: "4", kind: "spectrum", specName: "same", name: "s", storageKey: "k4" },
    ];
    const b = [
      { id: "5", kind: "spectrum", specName: "film", name: "v2", storageKey: "k5" },
      { id: "6", kind: "modes", specName: "wg", name: "m2", storageKey: "k6" },
      { id: "7", kind: "spectrum", specName: "same", name: "s", storageKey: "k4" },
    ];
    expect(pairResults(a, b).map((p) => [p.spec, p.before.id, p.after.id])).toEqual([["film", "1", "5"]]);
  });

  it("overlays R/T/A of two spectra, earlier version dashed", () => {
    const later = clone(spectrum);
    if (later.kind !== "spectrum") throw new Error("fixture kind");
    const { pols, angles } = overlayChoices(spectrum, later);
    expect(pols).toEqual(["s", "p"]);
    expect(angles).toEqual([0, 45]);
    const series = overlaySeries(spectrum, later, ["v1", "v2"], { pol: "p", angle: 1 });
    expect(series.map((s) => s.id)).toEqual(["r-v1", "t-v1", "a-v1", "r-v2", "t-v2", "a-v2"]);
    expect(series.slice(0, 3).every((s) => s.dashed)).toBe(true);
    expect(series.slice(3).every((s) => !s.dashed)).toBe(true);
    expect(series[0].label).toBe("R (p, 45°) · v1");
    expect(series[0].y).toEqual(spectrum.kind === "spectrum" ? spectrum.r.p[1] : []);
    expect(series[0].x).toHaveLength(series[0].y.length);
  });

  it("overlays cross sections and refuses mixed kinds", () => {
    const series = overlaySeries(cross, cross, ["v1", "v2"]);
    expect(series.map((s) => s.label)).toEqual(["C_ext · v1", "C_sca · v1", "C_abs · v1", "C_ext · v2", "C_sca · v2", "C_abs · v2"]);
    expect(overlaySeries(cross, spectrum, ["v1", "v2"])).toEqual([]);
  });
});

describe("Open in Studio for a version", () => {
  it("links large public specs by the version's spec URL", () => {
    const big = JSON.stringify({ wavelengths: Array.from({ length: 3000 }, (_, i) => i) });
    const specUrl = "http://web/api/projects/p-abc/versions/3/specs/0";
    const u = new URL(studioLink({ studioUrl: "http://studio", siteUrl: "http://web", specUrl, specJson: big, name: "film (v3)", allowUrl: true }));
    expect(u.searchParams.get("spec_url")).toBe(specUrl);
    expect(u.searchParams.get("name")).toBe("film (v3)");
  });
});
