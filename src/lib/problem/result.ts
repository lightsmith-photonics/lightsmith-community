import { z } from "zod";

// Result JSON of every kind the library returns (results.py): cross_sections, spectrum, modes,
// sparameters, bands. Unknown keys are kept so stored results round-trip unchanged. Python's
// json.dumps may write NaN; parseResult maps it to null and the schemas turn null into NaN.

const num = z.union([z.number(), z.null()]).transform((v) => (v === null ? Number.NaN : v));
const grid = z.array(z.array(num)); // [angle][wavelength] or [x][y]
const base = {
  method: z.string(),
  backend: z.string(),
  provenance: z.record(z.string(), z.unknown()).default({}),
  warnings: z.array(z.string()).default([]),
};

export const NearFieldSchema = z.object({
  wavelength_nm: z.number(),
  plane: z.string(),
  offset_nm: z.number(),
  axis1_nm: z.array(z.number()),
  axis2_nm: z.array(z.number()),
  enhancement: grid,
});

export const FarFieldSchema = z.object({
  wavelength_nm: z.number(),
  theta_deg: z.array(z.number()),
  phi_deg: z.array(z.number()),
  dcsca_domega_nm2: grid,
});

const sameLength = (n: (r: never) => number, keys: string[]) => (r: Record<string, unknown>, ctx: z.RefinementCtx) => {
  const want = n(r as never);
  for (const key of keys) {
    const v = r[key];
    if (Array.isArray(v) && v.length !== want) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `expected ${want} values, got ${v.length}` });
  }
};

export const CrossSectionsSchema = z
  .object({
    ...base,
    kind: z.literal("cross_sections").default("cross_sections"),
    wavelengths_nm: z.array(z.number()).min(1),
    c_ext_nm2: z.array(num),
    c_sca_nm2: z.array(num),
    c_abs_nm2: z.array(num),
    equivalent_radius_nm: z.number().positive(),
    near_field: z.array(NearFieldSchema).nullish(),
    far_field: z.array(FarFieldSchema).nullish(),
  })
  .passthrough()
  .superRefine(sameLength((r: { wavelengths_nm: number[] }) => r.wavelengths_nm.length, ["c_ext_nm2", "c_sca_nm2", "c_abs_nm2"]));

const perPol = z.record(z.string(), grid);

export const SpectrumSchema = z
  .object({
    ...base,
    kind: z.literal("spectrum"),
    wavelengths_nm: z.array(z.number()).min(1),
    angles_deg: z.array(z.number()).min(1),
    polarizations: z.array(z.string()).min(1),
    r: perPol,
    t: perPol,
    a: perPol,
    orders: z.array(z.object({ order: z.tuple([z.number(), z.number()]), r: perPol, t: perPol })).nullish(),
  })
  .passthrough();

export const ModeFieldSchema = z.object({
  x_nm: z.array(z.number()),
  y_nm: z.array(z.number()),
  components: z.record(z.string(), z.tuple([grid, grid])),
});

export const ModeDataSchema = z
  .object({
    neff_real: z.number(),
    neff_imag: z.number(),
    ng: z.number().nullish(),
    te_fraction: z.number().nullish(),
    loss_db_per_cm: z.number().nullish(),
    effective_area_um2: z.number().nullish(),
    field: ModeFieldSchema.nullish(),
  })
  .passthrough();

export const ModesSchema = z
  .object({ ...base, kind: z.literal("modes"), wavelengths_nm: z.array(z.number()).min(1), modes: z.array(z.array(ModeDataSchema)) })
  .passthrough()
  .superRefine(sameLength((r: { wavelengths_nm: number[] }) => r.wavelengths_nm.length, ["modes"]));

export const SParametersSchema = z
  .object({
    ...base,
    kind: z.literal("sparameters"),
    wavelengths_nm: z.array(z.number()).min(1),
    ports: z.array(z.string()).min(1),
    s_real: z.array(grid),
    s_imag: z.array(grid),
  })
  .passthrough()
  .superRefine(sameLength((r: { wavelengths_nm: number[] }) => r.wavelengths_nm.length, ["s_real", "s_imag"]));

export const BandsSchema = z
  .object({
    ...base,
    kind: z.literal("bands"),
    k_reduced: z.array(z.array(z.number())),
    k_distance: z.array(z.number()).min(1),
    k_labels: z.record(z.string(), z.string()),
    frequencies: z.record(z.string(), grid),
  })
  .passthrough();

export type CrossSectionsResult = z.infer<typeof CrossSectionsSchema>;
export type SpectrumResult = z.infer<typeof SpectrumSchema>;
export type ModesResult = z.infer<typeof ModesSchema>;
export type ModeData = z.infer<typeof ModeDataSchema>;
export type SParametersResult = z.infer<typeof SParametersSchema>;
export type BandsResult = z.infer<typeof BandsSchema>;
export type NearField = z.infer<typeof NearFieldSchema>;
export type FarField = z.infer<typeof FarFieldSchema>;
export type AnyResult = CrossSectionsResult | SpectrumResult | ModesResult | SParametersResult | BandsResult;
export type ResultKind = AnyResult["kind"];
/** Back-compat name for scattering results. */
export type OmniResult = CrossSectionsResult;

export const RESULT_KINDS: ResultKind[] = ["cross_sections", "spectrum", "modes", "sparameters", "bands"];
export const RESULT_KIND_LABELS: Record<ResultKind, string> = {
  cross_sections: "Cross sections",
  spectrum: "R/T/A spectrum",
  modes: "Modes",
  sparameters: "S-parameters",
  bands: "Band diagram",
};

const SCHEMAS: Record<ResultKind, z.ZodTypeAny> = {
  cross_sections: CrossSectionsSchema,
  spectrum: SpectrumSchema,
  modes: ModesSchema,
  sparameters: SParametersSchema,
  bands: BandsSchema,
};

export type ParsedResult = { ok: true; result: AnyResult } | { ok: false; error: string };

export function parseResult(input: unknown): ParsedResult {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input.replace(/\bNaN\b/g, "null").replace(/-?\bInfinity\b/g, "null"));
    } catch (err) {
      return { ok: false, error: `invalid JSON: ${(err as Error).message}` };
    }
  }
  if (!value || typeof value !== "object") return { ok: false, error: "a result must be a JSON object" };
  const kind = ((value as { kind?: string }).kind ?? "cross_sections") as ResultKind;
  const schema = SCHEMAS[kind];
  if (!schema) return { ok: false, error: `unsupported result kind "${kind}"; expected one of ${RESULT_KINDS.join(", ")}` };
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `${first.path.join(".") || "result"}: ${first.message}` };
  }
  return { ok: true, result: { ...(parsed.data as AnyResult), kind } as AnyResult };
}

/** Efficiencies Q = C / (pi r_eq^2). */
export function efficiencies(r: Pick<CrossSectionsResult, "c_ext_nm2" | "c_sca_nm2" | "c_abs_nm2" | "equivalent_radius_nm">) {
  const area = Math.PI * r.equivalent_radius_nm ** 2;
  return { q_ext: r.c_ext_nm2.map((v) => v / area), q_sca: r.c_sca_nm2.map((v) => v / area), q_abs: r.c_abs_nm2.map((v) => v / area) };
}

export const sParamDb = (re: number, im: number) => 10 * Math.log10(Math.max(re * re + im * im, 1e-30));

/** |E|^2 of a mode field: sum over Ex, Ey, Ez of re^2 + im^2, indexed [x][y]. */
export function modeIntensity(field: NonNullable<ModeData["field"]>): number[][] {
  const comps = ["Ex", "Ey", "Ez"].map((c) => field.components[c]).filter(Boolean);
  return field.x_nm.map((_, i) => field.y_nm.map((_, j) => comps.reduce((s, [re, im]) => s + re[i][j] ** 2 + im[i][j] ** 2, 0)));
}

// ---- Previews: a few hundred numbers stored next to each result row ----

export interface ResultPreview {
  kind: ResultKind;
  headline: string;
  xLabel: string;
  yLabel: string;
  x: number[];
  series: { label: string; y: number[] }[];
  /** labelled x positions (band diagrams) */
  xTicks?: { x: number; label: string }[];
}

function thin(n: number, max = 160): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: max }, (_, i) => Math.round((i * (n - 1)) / (max - 1)));
}
const round = (v: number) => (Number.isFinite(v) ? +v.toPrecision(5) : Number.NaN);

export function makePreview(r: AnyResult): ResultPreview {
  switch (r.kind) {
    case "cross_sections": {
      const q = efficiencies(r).q_ext;
      const idx = thin(r.wavelengths_nm.length);
      let i = 0;
      q.forEach((v, j) => (v > q[i] ? (i = j) : null));
      return {
        kind: r.kind,
        headline: `peak Q_ext ${q[i].toFixed(2)} at ${round(r.wavelengths_nm[i])} nm`,
        xLabel: "Wavelength (nm)",
        yLabel: "Q_ext",
        x: idx.map((j) => round(r.wavelengths_nm[j])),
        series: [{ label: "Q_ext", y: idx.map((j) => round(q[j])) }],
      };
    }
    case "spectrum": {
      const pol = r.polarizations[0];
      const R = r.r[pol]?.[0] ?? [];
      const T = r.t[pol]?.[0] ?? [];
      const idx = thin(r.wavelengths_nm.length);
      let i = 0;
      R.forEach((v, j) => (v < R[i] ? (i = j) : null));
      return {
        kind: r.kind,
        headline: `min R ${(R[i] ?? NaN).toFixed(3)} at ${round(r.wavelengths_nm[i])} nm (${pol}, ${r.angles_deg[0]}°)`,
        xLabel: "Wavelength (nm)",
        yLabel: "R, T",
        x: idx.map((j) => round(r.wavelengths_nm[j])),
        series: [
          { label: `R (${pol})`, y: idx.map((j) => round(R[j])) },
          { label: `T (${pol})`, y: idx.map((j) => round(T[j])) },
        ],
      };
    }
    case "modes": {
      const count = Math.max(...r.modes.map((m) => m.length));
      const mid = Math.floor(r.wavelengths_nm.length / 2);
      const m0 = r.modes[mid]?.[0];
      return {
        kind: r.kind,
        headline: m0 ? `n_eff ${m0.neff_real.toFixed(4)} (mode 0 at ${round(r.wavelengths_nm[mid])} nm), ${count} mode(s)` : "no modes found",
        xLabel: "Wavelength (nm)",
        yLabel: "n_eff",
        x: r.wavelengths_nm.map(round),
        series: Array.from({ length: Math.min(count, 4) }, (_, m) => ({ label: `mode ${m}`, y: r.modes.map((ms) => round(ms[m]?.neff_real ?? NaN)) })),
      };
    }
    case "sparameters": {
      const idx = thin(r.wavelengths_nm.length);
      const pairs: [number, number][] = [];
      for (let o = 1; o < r.ports.length && pairs.length < 3; o++) pairs.push([o, 0]);
      if (pairs.length === 0) pairs.push([0, 0]);
      return {
        kind: r.kind,
        headline: `${r.ports.length} ports: ${r.ports.join(", ")}`,
        xLabel: "Wavelength (nm)",
        yLabel: "|S|² (dB)",
        x: idx.map((j) => round(r.wavelengths_nm[j])),
        series: pairs.map(([o, i]) => ({
          label: `${r.ports[i]}→${r.ports[o]}`,
          y: idx.map((j) => round(sParamDb(r.s_real[j][o][i], r.s_imag[j][o][i]))),
        })),
      };
    }
    case "bands": {
      const pol = Object.keys(r.frequencies)[0];
      const f = r.frequencies[pol] ?? [];
      const nb = f[0]?.length ?? 0;
      const ticks = Object.entries(r.k_labels).map(([k, label]) => ({ x: round(r.k_distance[Number(k)]), label }));
      return {
        kind: r.kind,
        headline: `${nb} bands along ${ticks.map((t) => t.label).join("–")} (${pol})`,
        xLabel: "Wave vector",
        yLabel: "a/λ",
        x: r.k_distance.map(round),
        series: Array.from({ length: Math.min(nb, 8) }, (_, b) => ({ label: `band ${b + 1}`, y: f.map((row) => round(row[b])) })),
        xTicks: ticks,
      };
    }
  }
}

export function summarizeResult(r: AnyResult) {
  return {
    kind: r.kind,
    method: r.method,
    backend: r.backend,
    headline: makePreview(r).headline,
    runtime_s: typeof r.provenance.runtime_s === "number" ? r.provenance.runtime_s : null,
  };
}
