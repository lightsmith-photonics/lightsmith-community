import { abs2, add, c, div, mul, scale, sqrt, sub, type Complex } from "@/lib/physics/complex";
import { drudeEps, drudeLorentzEps, interp } from "@/lib/physics/optics";
import { mieSphere } from "@/lib/physics/mie";
import { tmm } from "@/lib/physics/tmm";
import { equivalentRadius, wavelengthsOf, type Material, type Particle, type Simulation } from "./spec";
import { expandWavelengths } from "./problem";
import type { AnyResult, CrossSectionsResult, SpectrumResult } from "./result";

// A small solver used only while the compute service is not connected: exact Mie for a single
// homogeneous sphere, quasi-static (dipole) estimates for other scatterers, and the transfer-matrix
// method for thin films. Results are labelled backend "web-mock" and carry a warning so nobody
// mistakes them for production numbers.

export type NkLookup = (name: string, dataset?: string | null) => { wavelength_nm: number[]; n: number[]; k: number[] } | null;

/** Complex refractive index n + ik at a vacuum wavelength. NaN when tabulated data does not cover it. */
export function materialIndex(m: Material, wavelengthNm: number, lookup?: NkLookup): Complex {
  switch (m.kind) {
    case "constant_index":
      return c(m.n_real, m.n_imag ?? 0);
    case "constant_permittivity":
      return sqrt(c(m.eps_real, m.eps_imag ?? 0));
    case "drude":
      return sqrt(drudeEps(m.eps_inf ?? 1, m.wp_ev, m.gamma_ev, wavelengthNm));
    case "drude_lorentz":
      return sqrt(drudeLorentzEps(m.eps_inf ?? 1, m.wp_ev ?? 0, m.gamma_ev ?? 0, m.poles ?? [], wavelengthNm));
    case "tabulated":
      return c(interp(wavelengthNm, m.wavelength_nm, m.n_real), interp(wavelengthNm, m.wavelength_nm, m.n_imag));
    case "library": {
      const data = lookup?.(m.name, m.dataset);
      if (!data) return c(Number.NaN, Number.NaN);
      return c(interp(wavelengthNm, data.wavelength_nm, data.n), interp(wavelengthNm, data.wavelength_nm, data.k));
    }
  }
}

/** Quasi-static polarisability of a sphere (volume units, nm^3): 4 pi a^3 (eps - eps_m)/(eps + 2 eps_m). */
function sphereAlpha(radiusNm: number, eps: Complex, epsM: number): Complex {
  return scale(div(sub(eps, c(epsM)), add(eps, c(2 * epsM))), 4 * Math.PI * radiusNm ** 3);
}

function particleEps(p: Particle, wl: number, lookup?: NkLookup): Complex {
  const n = materialIndex(p.material, wl, lookup);
  return mul(n, n);
}

export function mockSolve(
  spec: Simulation,
  opts: { method?: string; lookup?: NkLookup } = {},
): CrossSectionsResult {
  const started = performance.now();
  const wls = wavelengthsOf(spec);
  const nm = spec.medium_index ?? 1;
  const epsM = nm * nm;
  const warnings: string[] = [
    "Computed by the built-in mock solver (compute service not connected). Verify with the library.",
  ];
  const single = spec.particles.length === 1 ? spec.particles[0] : null;
  const exactMie = single?.shape.kind === "sphere" && !spec.substrate;
  if (!exactMie) warnings.push("Quasi-static dipole estimate of volume-equivalent spheres; interactions between particles ignored.");

  const cext: number[] = [];
  const csca: number[] = [];
  const cabs: number[] = [];
  let missing = false;
  for (const wl of wls) {
    if (exactMie && single && single.shape.kind === "sphere") {
      const r = mieSphere(single.shape.radius_nm, materialIndex(single.material, wl, opts.lookup), nm, wl);
      cext.push(r.cext);
      csca.push(r.csca);
      cabs.push(r.cabs);
      if (Number.isNaN(r.cext)) missing = true;
      continue;
    }
    const k = (2 * Math.PI * nm) / wl;
    let ce = 0;
    let cs = 0;
    for (const p of spec.particles) {
      const rEq = equivalentRadius({ ...spec, particles: [p] });
      const alpha = sphereAlpha(rEq, particleEps(p, wl, opts.lookup), epsM);
      const sca = (k ** 4 / (6 * Math.PI)) * abs2(alpha);
      const abs = k * alpha.im;
      cs += sca;
      ce += sca + abs;
    }
    if (Number.isNaN(ce)) missing = true;
    cext.push(ce);
    csca.push(cs);
    cabs.push(ce - cs);
  }
  if (missing) warnings.push("Material data does not cover every wavelength; those points are NaN.");

  const result: CrossSectionsResult = {
    kind: "cross_sections",
    method: exactMie ? "mie" : (opts.method && opts.method !== "auto" ? opts.method : "quasistatic"),
    backend: "web-mock",
    wavelengths_nm: wls,
    c_ext_nm2: cext,
    c_sca_nm2: csca,
    c_abs_nm2: cabs,
    equivalent_radius_nm: equivalentRadius(spec),
    near_field: null,
    far_field: null,
    provenance: { backend: "web-mock", device: "cpu", runtime_s: (performance.now() - started) / 1000 },
    warnings,
  };

  // Demo near/far fields for a single sphere: quasi-static dipole fields at the extinction peak.
  if (single?.shape.kind === "sphere") {
    const i = cext.reduce((best, v, j) => (v > cext[best] ? j : best), 0);
    const wl = wls[i];
    const eps = particleEps(single, wl, opts.lookup);
    result.near_field = [dipoleNearField(single.shape.radius_nm, eps, epsM, wl)];
    result.far_field = [dipoleFarField(sphereAlpha(single.shape.radius_nm, eps, epsM), nm, wl)];
  }
  return result;
}

/** |E|^2/|E0|^2 in the xz plane around a sphere in a uniform x-polarised field (quasi-static). */
export function dipoleNearField(radiusNm: number, eps: Complex, epsM: number, wavelengthNm: number, points = 61) {
  const half = 2.5 * radiusNm;
  const axis = Array.from({ length: points }, (_, i) => -half + (2 * half * i) / (points - 1));
  const beta = div(sub(eps, c(epsM)), add(eps, c(2 * epsM)));
  const inside = abs2(div(c(3 * epsM), add(eps, c(2 * epsM))));
  const enhancement = axis.map((x) =>
    axis.map((z) => {
      const r = Math.hypot(x, z);
      if (r < radiusNm) return inside;
      const a3 = (radiusNm / r) ** 3;
      const ux = x / r;
      const uz = z / r;
      // E = x + beta a^3/r^3 (3 (x.u) u - x)
      const ex = add(c(1), scale(beta, a3 * (3 * ux * ux - 1)));
      const ez = scale(beta, a3 * 3 * ux * uz);
      return abs2(ex) + abs2(ez);
    }),
  );
  return { wavelength_nm: wavelengthsRound(wavelengthNm), plane: "xz", offset_nm: 0, axis1_nm: axis, axis2_nm: axis, enhancement };
}

/** dC_sca/dOmega of an x-oriented point dipole: k^4 |alpha|^2/(16 pi^2) (1 - (r.x)^2). */
export function dipoleFarField(alpha: Complex, nm: number, wavelengthNm: number) {
  const k = (2 * Math.PI * nm) / wavelengthNm;
  const theta = Array.from({ length: 37 }, (_, i) => i * 5);
  const phi = Array.from({ length: 73 }, (_, i) => i * 5);
  const pref = (k ** 4 * abs2(alpha)) / (16 * Math.PI ** 2);
  const d = theta.map((t) =>
    phi.map((p) => {
      const rx = Math.sin((t * Math.PI) / 180) * Math.cos((p * Math.PI) / 180);
      return pref * (1 - rx * rx);
    }),
  );
  return { wavelength_nm: wavelengthsRound(wavelengthNm), theta_deg: theta, phi_deg: phi, dcsca_domega_nm2: d };
}

const wavelengthsRound = (v: number) => Math.round(v * 1000) / 1000;

// ---- thin films (layer_stack) ----

interface LayerStack {
  superstrate: Material;
  layers?: { thickness_nm: number; material: Material; coherent?: boolean }[];
  substrate: Material;
  wavelengths: number[] | { start_nm: number; stop_nm: number; num: number };
  angles_deg?: number[];
  polarizations?: ("s" | "p")[];
}

export function mockLayerStack(p: LayerStack, opts: { lookup?: NkLookup } = {}): SpectrumResult {
  const started = performance.now();
  const wls = expandWavelengths(p.wavelengths);
  const angles = p.angles_deg ?? [0];
  const pols = p.polarizations ?? ["s", "p"];
  const layers = p.layers ?? [];
  const warnings = ["Computed by the built-in mock solver (compute service not connected). Verify with the library."];
  if (layers.some((l) => l.coherent === false)) warnings.push("Incoherent layers are treated as coherent by the mock solver.");
  const r: Record<string, number[][]> = {};
  const t: Record<string, number[][]> = {};
  const a: Record<string, number[][]> = {};
  for (const pol of pols) {
    r[pol] = [];
    t[pol] = [];
    a[pol] = [];
    for (const ang of angles) {
      const rr: number[] = [];
      const tt: number[] = [];
      const aa: number[] = [];
      for (const wl of wls) {
        const out = tmm(
          pol,
          materialIndex(p.superstrate, wl, opts.lookup),
          layers.map((l) => ({ n: materialIndex(l.material, wl, opts.lookup), thicknessNm: l.thickness_nm })),
          materialIndex(p.substrate, wl, opts.lookup),
          wl,
          ang,
        );
        rr.push(out.R);
        tt.push(out.T);
        aa.push(out.A);
      }
      r[pol].push(rr);
      t[pol].push(tt);
      a[pol].push(aa);
    }
  }
  return {
    kind: "spectrum",
    method: "tmm",
    backend: "web-mock",
    wavelengths_nm: wls,
    angles_deg: angles,
    polarizations: pols,
    r,
    t,
    a,
    orders: null,
    provenance: { backend: "web-mock", device: "cpu", runtime_s: (performance.now() - started) / 1000 },
    warnings,
  };
}

/** Mock solve for any problem kind the built-in runner supports; throws for the others. */
export function mockSolveProblem(problem: Record<string, unknown>, opts: { method?: string; lookup?: NkLookup } = {}): AnyResult {
  const kind = (problem.kind as string | undefined) ?? "scattering";
  if (kind === "scattering") return mockSolve(problem as unknown as Simulation, opts);
  if (kind === "layer_stack") return mockLayerStack(problem as unknown as LayerStack, opts);
  throw new Error(`The built-in mock runner only solves scattering and layer_stack problems; connect the compute service (COMPUTE_API_URL) to run "${kind}" problems.`);
}
