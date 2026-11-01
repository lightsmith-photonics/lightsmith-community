import fixture from "@fixtures/materials.json";
import { verifyPlatformJwt } from "@/lib/platform-jwt";
import { hasRole } from "@/lib/roles";
import type {
  CategoryCount,
  DatasetWithData,
  Material,
  MaterialsApi,
  Paged,
  Submission,
  SubmissionInput,
} from "./types";

// Fixture-backed stand-in for the materials service. Data: CC0 tables bundled with the library
// (fixtures/materials.json, built by scripts/build_material_fixtures.py). Submissions live in
// memory and are lost on restart. It checks the same JWT the real service will.

const data = fixture as unknown as { materials: Material[]; datasets: Record<string, DatasetWithData> };

// Category IDs and display order of the materials service (0.2).
export const CATEGORY_NAMES: Record<string, string> = {
  semiconductor: "Semiconductors",
  glass_oxide: "Glasses and oxides",
  polymer: "Polymers",
  "2d": "2D materials",
  metal: "Metals",
  liquid: "Liquids",
  phase_change: "Phase-change materials",
  gas: "Gases",
  biological: "Biological",
  other: "Other",
};

const store = globalThis as unknown as { __mockSubmissions?: Submission[] };
const submissions = (store.__mockSubmissions ??= [demoSubmission()]);

/** One pending submission so the moderator queue is not empty in development (matches prisma/seed.ts). */
function demoSubmission(): Submission {
  const jc = data.datasets["au-johnson-christy"]?.data;
  const rows = jc
    ? jc.wavelength_nm.filter((w) => w >= 400 && w <= 900).map((w) => {
        const i = jc.wavelength_nm.indexOf(w);
        return [w, +(jc.n[i] * 1.03).toFixed(4), +(jc.k[i] * 0.98).toFixed(4)] as [number, number, number];
      })
    : [];
  return {
    id: "sub_demo1",
    status: "pending",
    submitted_by: { sub: "seed-user-mie", name: "Gustav Mie (demo)" },
    created_at: "2026-10-28T09:00:00.000Z",
    review_note: null,
    material_id: "Au",
    material_name: "Gold",
    category: "metal",
    dataset_name: "Demo ellipsometry 2026",
    reference: "Demo data for the review queue: Johnson & Christy values scaled by a few percent. Not a real measurement.",
    doi: null,
    license: "CC0-1.0",
    comments: "Seeded example; reject or approve it to try the workflow.",
    data: rows,
  };
}

function matches(m: Material, q: string): boolean {
  const hay = [m.id, m.name, m.formula, m.description, ...m.aliases, ...m.datasets.flatMap((d) => [d.name, d.authors])]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

export function mockNkLookup(name: string, dataset?: string | null) {
  const key = name.toLowerCase();
  const m = data.materials.find((x) => x.id.toLowerCase() === key || x.aliases.some((a) => a.toLowerCase() === key));
  if (!m) return null;
  const ds =
    (dataset && m.datasets.find((d) => d.name.toLowerCase() === dataset.toLowerCase() || d.id === dataset)) ||
    m.datasets.find((d) => d.is_default) ||
    m.datasets[0];
  return ds ? (data.datasets[ds.id]?.data ?? null) : null;
}

export class MockMaterialsApi implements MaterialsApi {
  readonly mode = "mock" as const;

  async categories(): Promise<CategoryCount[]> {
    const counts = new Map<string, number>();
    for (const m of data.materials) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
    return Object.keys(CATEGORY_NAMES)
      .filter((id) => counts.has(id))
      .map((id) => ({ id, name: CATEGORY_NAMES[id], count: counts.get(id)! }));
  }

  async search({ q = "", category = "", page = 1, per_page = 24 }): Promise<Paged<Material>> {
    const all = data.materials.filter((m) => (!category || m.category === category) && (!q || matches(m, q)));
    const start = (page - 1) * per_page;
    return { items: all.slice(start, start + per_page), total: all.length, page, per_page };
  }

  async material(id: string): Promise<Material | null> {
    return data.materials.find((m) => m.id.toLowerCase() === id.toLowerCase()) ?? null;
  }

  async dataset(id: string): Promise<DatasetWithData | null> {
    return data.datasets[id] ?? null;
  }

  async compare(ids: string[]): Promise<DatasetWithData[]> {
    return ids.map((id) => data.datasets[id]).filter(Boolean);
  }

  async submit(input: SubmissionInput, token: string): Promise<Submission> {
    const claims = await verifyPlatformJwt(token, "materials-db");
    const sub: Submission = {
      ...input,
      id: `sub_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      status: "pending",
      submitted_by: { sub: claims.sub, name: claims.name },
      created_at: new Date().toISOString(),
      review_note: null,
    };
    submissions.unshift(sub);
    return sub;
  }

  async submissions(status: string, token: string): Promise<Submission[]> {
    const claims = await verifyPlatformJwt(token, "materials-db");
    if (!hasRole(claims.role, "moderator")) throw new Error("403: moderator role required");
    return submissions.filter((s) => !status || s.status === status);
  }

  async review(id: string, decision: "approve" | "reject", note: string, token: string): Promise<Submission> {
    const claims = await verifyPlatformJwt(token, "materials-db");
    if (!hasRole(claims.role, "moderator")) throw new Error("403: moderator role required");
    const sub = submissions.find((s) => s.id === id);
    if (!sub) throw new Error("404: submission not found");
    sub.status = decision === "approve" ? "approved" : "rejected";
    sub.review_note = note || null;
    return sub;
  }
}

/** Seed helper so the review queue has something in it in development. */
export function seedMockSubmission(s: Submission) {
  if (!submissions.some((x) => x.id === s.id)) submissions.push(s);
}
