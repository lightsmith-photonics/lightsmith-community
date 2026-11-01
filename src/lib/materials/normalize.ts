import type { DatasetSummary, DatasetWithData, Material, NkData, Paged, Submission } from "./types";

// Adapters from Lightsmith Materials (lightsmith-materials) responses to the shapes in types.ts. They accept a few
// likely spellings (snake/camel case, wavelength in um, rows instead of columns) so small
// contract differences don't break the UI. Keep all such tolerance here.

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : v == null ? d : String(v));
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** null/undefined (e.g. outside a dataset's range in /v1/compare) become NaN so plots break the line. */
const num = (v: unknown): number => (v == null ? Number.NaN : Number(v));

export function normalizeDataset(raw: unknown): DatasetSummary {
  const d = o(raw);
  const range = arr(d.range_nm ?? d.rangeNm ?? d.wavelength_range_nm).map(Number);
  return {
    id: str(d.id ?? d.slug),
    material_id: str(d.material_id ?? d.materialId ?? o(d.material).id),
    name: str(d.name ?? d.title ?? d.id),
    authors: Array.isArray(d.authors) ? d.authors.map(String).join(", ") : str(d.authors),
    year: numOrNull(d.year),
    reference: str(d.reference ?? d.citation),
    doi: d.doi ? str(d.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//, "") : null,
    license: str(d.license ?? d.licence, "unknown"),
    comments: str(d.comments ?? d.notes),
    type: str(d.type ?? d.kind, "tabulated nk"),
    range_nm: [range[0] ?? NaN, range[1] ?? NaN],
    has_k: d.has_k !== false && d.hasK !== false,
    is_default: Boolean(d.is_default ?? d.isDefault),
    source_url: d.source_url ? str(d.source_url) : null,
  };
}

export function normalizeMaterial(raw: unknown): Material {
  const m = o(raw);
  return {
    // Slugs are accepted everywhere by materials-db and make readable URLs (/materials/gold).
    id: str(m.slug ?? m.id),
    name: str(m.name ?? m.id),
    formula: str(m.formula ?? m.id),
    category: str(m.category, "other"),
    aliases: arr(m.aliases).map(String),
    description: str(m.description),
    datasets: arr(m.datasets).map(normalizeDataset),
  };
}

export function normalizePaged(raw: unknown, page: number, perPage: number): Paged<Material> {
  if (Array.isArray(raw)) return { items: raw.map(normalizeMaterial), total: raw.length, page, per_page: perPage };
  const p = o(raw);
  const items = arr(p.items ?? p.results ?? p.data).map(normalizeMaterial);
  return { items, total: Number(p.total ?? items.length), page: Number(p.page ?? page), per_page: Number(p.per_page ?? perPage) };
}

export function normalizeNk(raw: unknown): NkData {
  const d = o(raw);
  // Rows form: [[wl, n, k], ...] or {rows: [...]} / {points: [{wavelength_nm, n, k}]}
  const rows = Array.isArray(raw) ? raw : arr(d.rows ?? d.points);
  let wl: number[];
  let n: number[];
  let k: number[];
  if (rows.length) {
    wl = rows.map((r) => num(Array.isArray(r) ? r[0] : o(r).wavelength_nm ?? o(r).wavelength_um));
    n = rows.map((r) => num(Array.isArray(r) ? r[1] : o(r).n));
    k = rows.map((r) => num(Array.isArray(r) ? (r[2] ?? 0) : (o(r).k ?? 0)));
  } else {
    const um = d.wavelength_um ?? d.wavelengthUm;
    wl = arr(d.wavelength_nm ?? d.wavelengthNm ?? um).map(num);
    if (um && !d.wavelength_nm) wl = wl.map((v) => v * 1000);
    n = arr(d.n ?? d.n_real).map(num);
    k = arr(d.k ?? d.n_imag).map(num);
  }
  if (k.length !== wl.length) k = wl.map(() => 0);
  return { wavelength_nm: wl, n, k };
}

export function normalizeDatasetWithData(raw: unknown, data?: unknown): DatasetWithData {
  const r = o(raw);
  const summary = r.dataset ? normalizeDataset(r.dataset) : normalizeDataset(raw);
  return { dataset: summary, data: normalizeNk(data ?? r.data ?? r) };
}

export function normalizeSubmission(raw: unknown): Submission {
  const s = o(raw);
  const by = o(s.submitted_by ?? s.submittedBy);
  return {
    id: str(s.id),
    status: (["pending", "approved", "rejected"].includes(str(s.status)) ? s.status : "pending") as Submission["status"],
    submitted_by: { sub: str(by.sub ?? s.submitter_id), name: str(by.name ?? s.submitter_name) },
    created_at: str(s.created_at ?? s.createdAt, new Date().toISOString()),
    review_note: s.review_note ? str(s.review_note) : null,
    material_id: s.material_id ? str(s.material_id) : null,
    material_name: str(s.material_name ?? s.material_id),
    category: str(s.category, "other"),
    dataset_name: str(s.dataset_name ?? o(s.dataset).name),
    reference: str(s.reference ?? o(s.dataset).reference),
    doi: s.doi ? str(s.doi) : null,
    license: str(s.license, "CC-BY-4.0"),
    comments: str(s.comments),
    data: arr(s.data ?? o(s.dataset).data).map((r) => {
      const row = arr(r).map(Number);
      return [row[0], row[1], row[2] ?? 0] as [number, number, number];
    }),
  };
}
