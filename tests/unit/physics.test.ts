import { describe, expect, it } from "vitest";
import { c } from "@/lib/physics/complex";
import { mieEfficiencies } from "@/lib/physics/mie";
import { epsToNk, interp, nkToEps, nmToEv, evToNm } from "@/lib/physics/optics";
import { mockSolve, mockSolveProblem } from "@/lib/problem/mock-solver";
import { tmm } from "@/lib/physics/tmm";
import { mockNkLookup } from "@/lib/materials/mock";
import exampleSpec from "@fixtures/demo/scattering.spec.json";
import exampleResult from "@fixtures/demo/scattering.result.json";
import layerStackSpec from "@fixtures/demo/layer_stack.spec.json";
import layerStackResult from "@fixtures/demo/layer_stack.result.json";
import braggSpec from "@fixtures/demo/bragg.spec.json";
import braggResult from "@fixtures/demo/bragg.result.json";
import modeSpec from "@fixtures/demo/mode.spec.json";
import type { Simulation } from "@/lib/problem/spec";

describe("mieEfficiencies", () => {
  // Reference values from miepython 3.3.1 (the library's Mie backend).
  const cases: [number, number, number, number, number][] = [
    [1.5, 0, 1.0, 0.21509759604288553, 0.21509759604288553],
    [1.5, 0.1, 5.0, 3.1536935307277347, 1.9634681569280108],
    [0.2, 3.0, 0.8, 4.138312517858716, 3.6338321965088176],
    [1.33, 0, 20.0, 2.1401071524274484, 2.1401071524274484],
  ];
  it.each(cases)("m=%f+%fi x=%f matches miepython to 1e-9", (n, k, x, qext, qsca) => {
    const q = mieEfficiencies(c(n, k), x);
    expect(q.qext).toBeCloseTo(qext, 9);
    expect(q.qsca).toBeCloseTo(qsca, 9);
  });
});

describe("mockSolve", () => {
  it("reproduces the library's Mie result for the example Drude sphere (rel. 1e-9)", () => {
    const r = mockSolve(exampleSpec as Simulation);
    expect(r.method).toBe("mie");
    expect(r.wavelengths_nm).toEqual(exampleResult.wavelengths_nm);
    r.c_ext_nm2.forEach((v, i) => expect(Math.abs(v - exampleResult.c_ext_nm2[i]) / exampleResult.c_ext_nm2[i]).toBeLessThan(1e-9));
    r.c_abs_nm2.forEach((v, i) => expect(Math.abs(v - exampleResult.c_abs_nm2[i]) / exampleResult.c_abs_nm2[i]).toBeLessThan(1e-9));
    expect(r.warnings.join(" ")).toMatch(/mock/);
    expect(r.near_field?.[0].enhancement.length).toBe(61);
  });

  it("uses library materials from the fixtures and flags uncovered wavelengths", () => {
    const spec: Simulation = {
      particles: [{ shape: { kind: "sphere", radius_nm: 30 }, material: { kind: "library", name: "gold" } }],
      medium_index: 1.33,
      wavelengths: [150, 520],
    };
    const r = mockSolve(spec, { lookup: mockNkLookup });
    expect(Number.isNaN(r.c_ext_nm2[0])).toBe(true); // below Johnson-Christy range
    expect(r.c_ext_nm2[1]).toBeGreaterThan(1000);
    expect(r.warnings.some((w) => w.includes("cover"))).toBe(true);
  });

  it("falls back to quasi-static for non-spheres, conserving C_ext = C_sca + C_abs", () => {
    const spec: Simulation = {
      particles: [
        { shape: { kind: "spheroid", semi_axis_xy_nm: 10, semi_axis_z_nm: 20 }, material: { kind: "constant_index", n_real: 2 } },
        { shape: { kind: "cylinder", radius_nm: 10, length_nm: 30 }, material: { kind: "constant_index", n_real: 2 } },
      ],
      wavelengths: { start_nm: 500, stop_nm: 600, num: 3 },
    };
    const r = mockSolve(spec);
    expect(r.method).toBe("quasistatic");
    r.c_ext_nm2.forEach((v, i) => expect(v).toBeCloseTo(r.c_sca_nm2[i] + r.c_abs_nm2[i], 9));
    expect(r.c_abs_nm2.every((v) => Math.abs(v) < 1e-9)).toBe(true); // lossless
  });
});

describe("transfer-matrix method", () => {
  it("gives the Fresnel reflectance of a bare interface", () => {
    const r = tmm("s", c(1), [], c(1.52), 550, 0);
    expect(r.R).toBeCloseTo(((1 - 1.52) / 2.52) ** 2, 12);
    expect(r.R + r.T).toBeCloseTo(1, 12);
    const p = tmm("p", c(1), [], c(1.52), 550, (Math.atan(1.52) * 180) / Math.PI);
    expect(p.R).toBeLessThan(1e-12); // Brewster angle
  });

  it.each([
    ["AR coating", layerStackSpec, layerStackResult],
    ["Bragg mirror", braggSpec, braggResult],
  ])("matches the library's TMM for the %s demo (abs. 1e-9)", (_name, spec, expected) => {
    const r = mockSolveProblem(spec as Record<string, unknown>);
    if (r.kind !== "spectrum") throw new Error("expected a spectrum");
    for (const pol of r.polarizations) {
      for (const q of ["r", "t", "a"] as const) {
        r[q][pol].forEach((row, ai) =>
          row.forEach((v, wi) => expect(Math.abs(v - (expected as unknown as Record<string, Record<string, number[][]>>)[q][pol][ai][wi])).toBeLessThan(1e-9)),
        );
      }
    }
  });

  it("refuses kinds the mock runner cannot solve", () => {
    expect(() => mockSolveProblem(modeSpec as Record<string, unknown>)).toThrow(/only solves scattering and layer_stack/);
  });
});

describe("optics helpers", () => {
  it("converts n,k <-> eps", () => {
    const { eps1, eps2 } = nkToEps(0.2, 3.0);
    expect(eps1).toBeCloseTo(-8.96);
    expect(eps2).toBeCloseTo(1.2);
    const back = epsToNk(eps1, eps2);
    expect(back.n).toBeCloseTo(0.2);
    expect(back.k).toBeCloseTo(3.0);
  });
  it("converts nm <-> eV", () => {
    expect(nmToEv(1239.841984)).toBeCloseTo(1);
    expect(evToNm(nmToEv(532))).toBeCloseTo(532);
  });
  it("interpolates without extrapolating", () => {
    expect(interp(1.5, [1, 2], [10, 20])).toBe(15);
    expect(interp(3, [1, 2], [10, 20])).toBeNaN();
  });
});
