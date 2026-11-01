// Types and helpers for scattering problems (kind "scattering", the v0.1 spec). Validation of
// every kind lives in problem.ts.

// ---- Types mirroring the schema (enough for the UI and the mock runner) ----

export type Material =
  | { kind: "constant_index"; n_real: number; n_imag?: number }
  | { kind: "constant_permittivity"; eps_real: number; eps_imag?: number }
  | { kind: "drude"; eps_inf?: number; wp_ev: number; gamma_ev: number }
  | {
      kind: "drude_lorentz";
      eps_inf?: number;
      wp_ev?: number;
      gamma_ev?: number;
      poles?: { delta_eps: number; omega0_ev: number; gamma_ev: number }[];
    }
  | { kind: "tabulated"; wavelength_nm: number[]; n_real: number[]; n_imag: number[]; source?: string | null }
  | { kind: "library"; name: string; dataset?: string | null };

export type Shape =
  | { kind: "sphere"; radius_nm: number }
  | { kind: "spheroid"; semi_axis_xy_nm: number; semi_axis_z_nm: number }
  | { kind: "cylinder"; radius_nm: number; length_nm: number }
  | { kind: "layered_sphere"; core_radius_nm: number; shells: { thickness_nm: number; material: Material }[] };

export interface Particle {
  shape: Shape;
  material: Material;
  position_nm?: number[];
}

export interface Simulation {
  kind?: "scattering";
  schema_version?: string;
  particles: Particle[];
  medium_index?: number;
  illumination?: { kind?: "plane_wave"; direction?: number[]; polarization?: number[] };
  wavelengths: number[] | { start_nm: number; stop_nm: number; num: number };
  substrate?: { material: Material; interface_z_nm?: number } | null;
  orientation_average?: boolean;
  outputs?: Record<string, unknown>;
  options?: Record<string, Record<string, unknown>>;
}

export function wavelengthsOf(spec: Simulation): number[] {
  const w = spec.wavelengths;
  if (Array.isArray(w)) return w;
  if (w.num <= 1) return [w.start_nm];
  return Array.from({ length: w.num }, (_, i) => w.start_nm + ((w.stop_nm - w.start_nm) * i) / (w.num - 1));
}

export function shapeVolume(shape: Shape): number {
  switch (shape.kind) {
    case "sphere":
      return (4 / 3) * Math.PI * shape.radius_nm ** 3;
    case "spheroid":
      return (4 / 3) * Math.PI * shape.semi_axis_xy_nm ** 2 * shape.semi_axis_z_nm;
    case "cylinder":
      return Math.PI * shape.radius_nm ** 2 * shape.length_nm;
    case "layered_sphere": {
      const r = shape.core_radius_nm + shape.shells.reduce((s, l) => s + l.thickness_nm, 0);
      return (4 / 3) * Math.PI * r ** 3;
    }
  }
}

/** Volume-equivalent radius of all particles, as used for efficiencies by the library. */
export function equivalentRadius(spec: Simulation): number {
  const v = spec.particles.reduce((s, p) => s + shapeVolume(p.shape), 0);
  return Math.cbrt((3 * v) / (4 * Math.PI));
}

export function describeMaterial(m: Material): string {
  switch (m.kind) {
    case "constant_index":
      return `n = ${m.n_real}${m.n_imag ? ` + ${m.n_imag}i` : ""}`;
    case "constant_permittivity":
      return `ε = ${m.eps_real}${m.eps_imag ? ` + ${m.eps_imag}i` : ""}`;
    case "drude":
      return `Drude (ωp ${m.wp_ev} eV, γ ${m.gamma_ev} eV)`;
    case "drude_lorentz":
      return `Drude–Lorentz (${m.poles?.length ?? 0} poles)`;
    case "tabulated":
      return `tabulated n,k (${m.wavelength_nm.length} points)`;
    case "library":
      return `${m.name}${m.dataset ? ` (${m.dataset})` : ""}`;
  }
}

export function describeShape(s: Shape): string {
  switch (s.kind) {
    case "sphere":
      return `sphere r=${s.radius_nm} nm`;
    case "spheroid":
      return `spheroid a=${s.semi_axis_xy_nm} c=${s.semi_axis_z_nm} nm`;
    case "cylinder":
      return `cylinder r=${s.radius_nm} L=${s.length_nm} nm`;
    case "layered_sphere":
      return `core–shell r=${s.core_radius_nm} nm + ${s.shells.length} shell(s)`;
  }
}

export function summarizeSpec(spec: Simulation) {
  const wl = wavelengthsOf(spec);
  return {
    particles: spec.particles.length,
    shapes: spec.particles.map((p) => describeShape(p.shape)),
    materials: spec.particles.map((p) => describeMaterial(p.material)),
    medium_index: spec.medium_index ?? 1,
    wavelengths: { count: wl.length, min: Math.min(...wl), max: Math.max(...wl) },
  };
}
