import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { measurementPreview, parseMeasurement } from "@/lib/feedback/measurements";
import { compareCurve, compareMeasurement, compareRerun, interpolate, symbolOf } from "@/lib/feedback/compare";
import { assertCanAskAbout, cleanMetadata, parseWants, visibleProjectFilter } from "@/lib/feedback/store";
import type { ApiError } from "@/lib/api/errors";
import { makePreview, parseResult } from "@/lib/problem/result";

const demo = (name: string) => readFileSync(join(__dirname, "..", "..", "fixtures", "demo", name), "utf8");

describe("who may ask about a project and who sees the request", () => {
  const project = { visibility: "public", ownerId: "owner", collaborators: [{ userId: "collab" }] };
  const user = (id: string, role = "user") => ({ id, role });
  const code = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      return (e as ApiError).code;
    }
    return "allowed";
  };

  it("only owners, collaborators and admins can ask, and never about a private project", () => {
    expect(code(() => assertCanAskAbout(project, user("owner")))).toBe("allowed");
    expect(code(() => assertCanAskAbout(project, user("collab")))).toBe("allowed");
    expect(code(() => assertCanAskAbout(project, user("admin", "admin")))).toBe("allowed");
    expect(code(() => assertCanAskAbout(project, user("stranger")))).toBe("forbidden");
    expect(code(() => assertCanAskAbout(project, user("moderator", "moderator")))).toBe("forbidden");
    expect(code(() => assertCanAskAbout({ ...project, visibility: "private" }, user("owner")))).toBe("private_project");
  });

  it("lists requests by the rule of canViewProject", () => {
    expect(visibleProjectFilter(null)).toEqual({ OR: [{ visibility: { not: "private" } }] });
    expect(visibleProjectFilter(user("u1"))).toEqual({ OR: [{ visibility: { not: "private" } }, { ownerId: "u1" }, { collaborators: { some: { userId: "u1" } } }] });
    expect(visibleProjectFilter(user("root", "admin"))).toEqual({});
  });
});

describe("measured data", () => {
  it("parses CSV with comments and a unit in the header", () => {
    const m = parseMeasurement("# sample A, 45 deg\nwavelength_nm,R,T\n400,0.04,0.95\n500,0.02,0.97\n600,0.03,0.96\n");
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.measurement.x).toEqual([400, 500, 600]);
    expect(m.measurement.series.map((s) => s.label)).toEqual(["R", "T"]);
    expect(m.measurement.notes).toEqual([]);
  });

  it("converts µm, eV and wavenumbers to nm and sorts by wavelength", () => {
    const um = parseMeasurement("lambda (um)\tR\n0.4\t0.1\n0.5\t0.2\n");
    expect(um.ok && um.measurement.x).toEqual([400, 500]);
    const ev = parseMeasurement("energy_eV;A\n3.0;0.5\n2.0;0.7\n");
    expect(ev.ok).toBe(true);
    if (ev.ok) {
      expect(ev.measurement.x[0]).toBeCloseTo(413.28, 1);
      expect(ev.measurement.x[1]).toBeCloseTo(619.92, 1);
      expect(ev.measurement.series[0].y).toEqual([0.5, 0.7]);
      expect(ev.measurement.notes[0]).toMatch(/eV/);
    }
    const wn = parseMeasurement("wavenumber cm-1,T\n20000,0.9\n25000,0.8\n");
    expect(wn.ok && wn.measurement.x).toEqual([400, 500]);
  });

  it("accepts JSON and explains bad input", () => {
    const j = parseMeasurement({ x: [400, 500, 600], series: [{ label: "R", y: [0.1, 0.2, 0.3] }] });
    expect(j.ok).toBe(true);
    expect(parseMeasurement('{"x": [1, 2], "series": [{"label": "R", "y": [1]}]}')).toEqual({ ok: false, error: 'column "R" has 1 values for 2 x values' });
    expect(parseMeasurement("400,0.1\n500,0.2\n600,0.3")).toMatchObject({ ok: false, error: expect.stringMatching(/header/) });
    expect(parseMeasurement("wavelength_nm,R\n400,abc\n500,0.2")).toMatchObject({ ok: false, error: expect.stringMatching(/row 2/) });
    expect(parseMeasurement("wavelength_nm,R\n-1,0.1\n500,0.2")).toMatchObject({ ok: false });
  });

  it("refuses empty cells instead of reading them as zero", () => {
    const m = parseMeasurement("wavelength_nm,R,T\n400,0.04,0.95\n500,,0.97\n600,0.03,0.96\n");
    expect(m).toEqual({ ok: false, error: "row 3 has an empty value" });
  });

  it("thins long data for previews", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => `${400 + i * 0.4},${Math.sin(i / 50)}`).join("\n");
    const m = parseMeasurement(`wavelength_nm,R\n${rows}`);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const p = measurementPreview(m.measurement, "reflectance");
    expect(p.x).toHaveLength(160);
    expect(p.x[0]).toBe(400);
    expect(p.x.at(-1)).toBeCloseTo(799.6);
    expect(p.headline).toMatch(/1000 points, 400–800 nm/);
  });
});

describe("comparisons", () => {
  it("interpolate linearly inside the range only", () => {
    expect(interpolate([0, 10], [0, 100], 2.5)).toBe(25);
    expect(interpolate([0, 10], [0, 100], 11)).toBeNull();
    expect(interpolate([0, 5, 10], [0, 50, 0], 7.5)).toBe(25);
  });

  it("measure differences over the common range", () => {
    const x = [400, 450, 500, 550, 600];
    expect(compareCurve({ x, y: [1, 2, 3, 4, 5] }, { x, y: [1, 2, 3, 4, 5] })).toMatchObject({ points: 5, rms_diff: 0, max_abs_diff: 0 });
    const shifted = compareCurve({ x, y: [1, 2, 3, 4, 5] }, { x: [500, 550, 600, 650], y: [3.1, 4.1, 5.1, 6.1] });
    expect(shifted).toMatchObject({ points: 3, x_min: 500, x_max: 600, max_abs_diff: 0.1 });
    expect(shifted!.rms_diff).toBeCloseTo(0.1, 6);
    expect(shifted!.relative_rms).toBeCloseTo(0.02, 6);
    expect(compareCurve({ x, y: [1, 2, 3, 4, 5] }, { x: [700, 800], y: [1, 1] })).toBeNull();
  });

  it("find no difference when a library result is re-run unchanged", () => {
    const parsed = parseResult(demo("layer_stack.result.json"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const p = makePreview(parsed.result);
    const c = compareRerun(p, p);
    expect(c.comparable).toBe(true);
    expect(c.series.length).toBeGreaterThan(0);
    expect(c.series.every((s) => s.rms_diff === 0)).toBe(true);
    expect(c.summary).toMatch(/RMS difference 0\.000/);
    expect(compareRerun({ ...p, kind: "spectrum" }, { ...p, kind: "modes" }).comparable).toBe(false);
  });

  it("match measured columns by name or quantity, and rescale percent", () => {
    const sim = { x: [400, 500, 600], series: [{ label: "R (s)", y: [0.1, 0.2, 0.3] }, { label: "T (s)", y: [0.9, 0.8, 0.7] }] };
    const percent = compareMeasurement(sim, { x: [400, 500, 600], series: [{ label: "Reflectance [%]", y: [10, 21, 30] }] }, "reflectance");
    expect(percent.comparable).toBe(true);
    expect(percent.series[0]).toMatchObject({ reference: "R (s)", candidate: "Reflectance [%]", max_abs_diff: 0.01 });
    expect(percent.notes[0]).toMatch(/percent/);
    const byQuantity = compareMeasurement(sim, { x: [400, 500, 600], series: [{ label: "signal", y: [0.9, 0.8, 0.7] }] }, "transmittance");
    expect(byQuantity.series[0]).toMatchObject({ reference: "T (s)", rms_diff: 0 });
    expect(compareMeasurement(sim, { x: [400, 500, 600], series: [{ label: "signal", y: [1, 1, 1] }] }, "other").comparable).toBe(false);
    expect(symbolOf("Q_ext")).toBe("Q_ext");
    expect(symbolOf("n_eff (mode 0)")).toBe("n_eff");
    expect(symbolOf("photon counts")).toBeNull();
  });
});

describe("feedback inputs", () => {
  it("keeps what is wanted to the known kinds", () => {
    expect(parseWants(["reproduce", "experiment", "nonsense"])).toEqual(["reproduce", "experiment"]);
    expect(parseWants([])).toEqual(["review"]);
  });

  it("cleans experiment metadata to short string fields", () => {
    const m = cleanMetadata({ quantity: "reflectance", sample: { material: "MgF2 on BK7", thickness_nm: 100, "bad key": "x", nested: { a: 1 } }, setup: { instrument: "x".repeat(400) } });
    expect(m.quantity).toBe("reflectance");
    expect(m.sample).toEqual({ material: "MgF2 on BK7", thickness_nm: "100" });
    expect(m.setup.instrument).toHaveLength(300);
    expect(cleanMetadata({ quantity: "vibes" }).quantity).toBe("other");
  });
});
