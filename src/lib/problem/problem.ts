import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import schema from "@fixtures/problem-schema.json";
import { summarizeSpec, type Simulation } from "./spec";

// Problem specs of every kind, validated against fixtures/problem-schema.json (the union
// envelope printed by the library's `schema` command). Validation picks the branch by `kind`
// so error messages refer to that kind only. Specs without `kind` are scattering (v0.1).

export const PROBLEM_KINDS = ["scattering", "layer_stack", "periodic", "mode", "device", "bands", "circuit", "optimization"] as const;
export type ProblemKind = (typeof PROBLEM_KINDS)[number];

export const KIND_LABELS: Record<ProblemKind, string> = {
  scattering: "Scattering",
  layer_stack: "Thin films",
  periodic: "Gratings and metasurfaces",
  mode: "Waveguide modes",
  device: "Device S-parameters",
  bands: "Photonic bands",
  circuit: "Photonic circuit",
  optimization: "Inverse design",
};

type Envelope = { properties: { problem: { discriminator: { mapping: Record<string, string> } } }; $defs: Record<string, unknown> };
const envelope = schema as unknown as Envelope;
const MAPPING = envelope.properties.problem.discriminator.mapping;

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(schema as object, "problem");
const validators = new Map<string, ValidateFunction>();
function validatorFor(kind: ProblemKind): ValidateFunction {
  let v = validators.get(kind);
  if (!v) {
    v = ajv.getSchema(`problem${MAPPING[kind]}`)!;
    validators.set(kind, v);
  }
  return v;
}

export const SCHEMA_VERSION: string =
  ((envelope.$defs.Simulation as { properties?: { schema_version?: { const?: string } } })?.properties?.schema_version?.const) ?? "unknown";

export interface SpecIssue {
  path: string;
  message: string;
}

export type ProblemValidation =
  | { ok: true; kind: ProblemKind; problem: Record<string, unknown> }
  | { ok: false; kind: ProblemKind | null; issues: SpecIssue[] };

export function isProblemKind(v: unknown): v is ProblemKind {
  return typeof v === "string" && (PROBLEM_KINDS as readonly string[]).includes(v) && v in MAPPING;
}

function describe(e: ErrorObject): SpecIssue {
  const path = e.instancePath || "/";
  if (e.keyword === "additionalProperties") return { path, message: `unknown property "${(e.params as { additionalProperty: string }).additionalProperty}"` };
  if (e.keyword === "const") return { path, message: `must be ${JSON.stringify((e.params as { allowedValue: unknown }).allowedValue)}` };
  return { path, message: e.message ?? e.keyword };
}

/** Accepts a JSON string or a parsed value. */
export function validateProblem(input: unknown): ProblemValidation {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch (err) {
      return { ok: false, kind: null, issues: [{ path: "/", message: `invalid JSON: ${(err as Error).message}` }] };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, kind: null, issues: [{ path: "/", message: "a problem must be a JSON object" }] };
  }
  const obj = value as Record<string, unknown>;
  const kind = obj.kind ?? "scattering";
  if (!isProblemKind(kind)) {
    return { ok: false, kind: null, issues: [{ path: "/kind", message: `unknown kind ${JSON.stringify(kind)}; expected one of ${Object.keys(MAPPING).join(", ")}` }] };
  }
  const validate = validatorFor(kind);
  if (validate(obj)) return { ok: true, kind, problem: obj };
  const seen = new Set<string>();
  const issues: SpecIssue[] = [];
  for (const e of validate.errors ?? []) {
    if (e.keyword === "anyOf" || e.keyword === "oneOf") continue;
    const issue = describe(e);
    const key = `${issue.path}:${issue.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push(issue);
    }
  }
  if (issues.length === 0) issues.push({ path: "/", message: `does not match the ${kind} schema` });
  return { ok: false, kind, issues: issues.slice(0, 20) };
}

type Wl = number[] | { start_nm: number; stop_nm: number; num: number } | undefined;
export function expandWavelengths(w: Wl): number[] {
  if (!w) return [];
  if (Array.isArray(w)) return w;
  if (w.num <= 1) return [w.start_nm];
  return Array.from({ length: w.num }, (_, i) => w.start_nm + ((w.stop_nm - w.start_nm) * i) / (w.num - 1));
}

function wlText(w: Wl): string | null {
  const wl = expandWavelengths(w);
  if (wl.length === 0) return null;
  const lo = Math.round(Math.min(...wl));
  const hi = Math.round(Math.max(...wl));
  return wl.length === 1 ? `λ = ${lo} nm` : `${wl.length} λ from ${lo} to ${hi} nm`;
}

/** One-line description of a problem for cards and lists. */
export function summarizeProblem(kind: ProblemKind, p: Record<string, unknown>): string {
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const parts: (string | null)[] = [];
  switch (kind) {
    case "scattering": {
      const s = summarizeSpec(p as unknown as Simulation);
      parts.push(s.shapes.join("; "), s.materials.join("; "), `host n = ${s.medium_index}`, wlText(p.wavelengths as Wl));
      break;
    }
    case "layer_stack":
      parts.push(`${len(p.layers)} layer(s)`, `${len(p.angles_deg ?? [0])} angle(s)`, wlText(p.wavelengths as Wl));
      break;
    case "periodic":
      parts.push(p.lattice_a2_nm ? "2D lattice" : "1D grating", `${len(p.layers)} patterned layer(s)`, wlText(p.wavelengths as Wl));
      break;
    case "mode":
      parts.push(`${len(p.structures)} structure(s)`, `${p.num_modes ?? 2} mode(s)`, p.bend_radius_nm ? `bend R = ${p.bend_radius_nm} nm` : null, wlText(p.wavelengths as Wl));
      break;
    case "device":
      parts.push(`${p.dimension ?? 3}D`, `ports ${(p.ports as { name: string }[] | undefined)?.map((x) => x.name).join(", ")}`, wlText(p.wavelengths as Wl));
      break;
    case "bands": {
      const path = (p.k_path as { label: string }[] | undefined)?.map((k) => k.label).join("–");
      parts.push(`${p.dimension ?? 2}D crystal`, `k-path ${path}`, `${p.num_bands ?? 8} bands`, String(p.polarization ?? "both"));
      break;
    }
    case "circuit":
      parts.push(`${Object.keys((p.instances as object) ?? {}).length} instances`, `ports ${Object.keys((p.ports as object) ?? {}).join(", ")}`, wlText(p.wavelengths as Wl));
      break;
    case "optimization":
      parts.push(`${len(p.design_regions)} design region(s)`, `${len(p.objective)} objective term(s)`);
      break;
  }
  return parts.filter(Boolean).join(" · ");
}
