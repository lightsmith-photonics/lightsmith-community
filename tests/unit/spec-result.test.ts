import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KIND_LABELS, MAX_PROBLEM_CHARS, SCHEMA_VERSION, expandWavelengths, problemTooLarge, summarizeProblem, validateProblem } from "@/lib/problem/problem";
import { equivalentRadius, summarizeSpec } from "@/lib/problem/spec";
import { efficiencies, makePreview, modeIntensity, parseResult, summarizeResult, type ModesResult } from "@/lib/problem/result";
import { bandGaps } from "@/components/charts/BandsView";

const DEMO = join(__dirname, "..", "..", "fixtures", "demo");
const demos = readdirSync(DEMO)
  .filter((f) => f.endsWith(".spec.json"))
  .map((f) => f.replace(".spec.json", ""));
const load = (name: string, part: "spec" | "result") => readFileSync(join(DEMO, `${name}.${part}.json`), "utf8");

describe("validateProblem", () => {
  it.each(demos)("accepts the %s demo problem", (name) => {
    const v = validateProblem(load(name, "spec"));
    expect(v.ok, JSON.stringify(!v.ok && v.issues)).toBe(true);
    if (v.ok) expect(summarizeProblem(v.kind, v.problem).length).toBeGreaterThan(5);
  });

  it("treats a spec without kind as scattering", () => {
    const spec = JSON.parse(load("scattering", "spec"));
    delete spec.kind;
    const v = validateProblem(spec);
    expect(v.ok && v.kind).toBe("scattering");
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+/);
  });

  it("reports errors for the branch of the given kind only", () => {
    const bad = JSON.parse(load("mode", "spec"));
    bad.window_size_nm = "wide";
    bad.colour = "blue";
    const v = validateProblem(bad);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.kind).toBe("mode");
      expect(v.issues.some((i) => i.message.includes('unknown property "colour"'))).toBe(true);
      expect(v.issues.some((i) => i.path.startsWith("/window_size_nm"))).toBe(true);
    }
  });

  it("rejects unknown kinds, invalid JSON and non-objects", () => {
    const k = validateProblem({ kind: "teleporter" });
    expect(!k.ok && k.issues[0].message).toMatch(/unknown kind/);
    const j = validateProblem("{nope");
    expect(!j.ok && j.issues[0].message).toMatch(/invalid JSON/);
    expect(validateProblem("[1, 2]").ok).toBe(false);
  });

  it("labels every kind", () => {
    expect(Object.keys(KIND_LABELS)).toHaveLength(8);
  });
});

describe("scattering helpers", () => {
  it("expands wavelength ranges and computes the equivalent radius", () => {
    expect(expandWavelengths({ start_nm: 400, stop_nm: 800, num: 5 })).toEqual([400, 500, 600, 700, 800]);
    const r = equivalentRadius({
      particles: [
        { shape: { kind: "sphere", radius_nm: 10 }, material: { kind: "constant_index", n_real: 1.5 } },
        { shape: { kind: "sphere", radius_nm: 10 }, material: { kind: "constant_index", n_real: 1.5 } },
      ],
      wavelengths: [500],
    });
    expect(r).toBeCloseTo(10 * Math.cbrt(2));
    expect(summarizeSpec(JSON.parse(load("scattering", "spec"))).wavelengths).toEqual({ count: 41, min: 400, max: 800 });
  });
});

describe("problem size limit", () => {
  it("applies to objects and to JSON text alike", () => {
    expect(problemTooLarge({ kind: "layer_stack" })).toBe(false);
    expect(problemTooLarge({ kind: "layer_stack", padding: "x".repeat(MAX_PROBLEM_CHARS) })).toBe(true);
    expect(problemTooLarge("x".repeat(MAX_PROBLEM_CHARS))).toBe(false);
    expect(problemTooLarge("x".repeat(MAX_PROBLEM_CHARS + 1))).toBe(true);
    expect(problemTooLarge(undefined)).toBe(false);
  });
});

describe("parseResult", () => {
  it.each(demos)("parses the %s demo result and builds a preview", (name) => {
    const p = parseResult(load(name, "result"));
    expect(p.ok, !p.ok ? p.error : "").toBe(true);
    if (!p.ok) return;
    const preview = makePreview(p.result);
    expect(preview.kind).toBe(p.result.kind);
    expect(preview.x.length).toBeGreaterThan(1);
    expect(preview.x.length).toBeLessThanOrEqual(200);
    for (const s of preview.series) expect(s.y).toHaveLength(preview.x.length);
    expect(JSON.stringify(preview).length).toBeLessThan(20_000);
    expect(summarizeResult(p.result).headline).toBe(preview.headline);
  });

  it("computes efficiencies and keeps unknown keys", () => {
    const p = parseResult(load("scattering", "result"));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.result.kind).toBe("cross_sections");
    if (p.result.kind !== "cross_sections") return;
    const raw = JSON.parse(load("scattering", "result"));
    expect(efficiencies(p.result).q_ext[0]).toBeCloseTo(raw.c_ext_nm2[0] / (Math.PI * 40 * 40));
  });

  it("accepts NaN from Python and rejects length mismatches and unknown kinds", () => {
    const withNaN = `{"method":"dda","backend":"x","wavelengths_nm":[1],"c_ext_nm2":[NaN],"c_sca_nm2":[1],"c_abs_nm2":[0],"equivalent_radius_nm":1}`;
    const a = parseResult(withNaN);
    expect(a.ok && a.result.kind === "cross_sections" && Number.isNaN(a.result.c_ext_nm2[0])).toBe(true);
    const raw = JSON.parse(load("circuit", "result"));
    expect(parseResult({ ...raw, s_real: raw.s_real.slice(1) }).ok).toBe(false);
    const u = parseResult({ kind: "hologram", method: "x", backend: "y" });
    expect(!u.ok && u.error).toMatch(/unsupported result kind/);
  });

  it("finds the TM band gap of the rod crystal and computes mode intensity", () => {
    const b = parseResult(load("bands", "result"));
    if (!b.ok || b.result.kind !== "bands") throw new Error("bands");
    const gaps = bandGaps(b.result.frequencies.tm);
    expect(gaps[0].below).toBe(1);
    expect(gaps[0].lo).toBeCloseTo(0.322, 2);
    expect(gaps[0].hi).toBeCloseTo(0.443, 2);
    const m = parseResult(load("mode", "result"));
    if (!m.ok || m.result.kind !== "modes") throw new Error("modes");
    const field = (m.result as ModesResult).modes[0][0].field!;
    const I = modeIntensity(field);
    expect(I).toHaveLength(field.x_nm.length);
    expect(Math.max(...I.flat())).toBeGreaterThan(0);
  });
});
