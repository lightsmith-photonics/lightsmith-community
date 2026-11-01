import type { MaterialsApi, Submission, SubmissionInput } from "./types";
import {
  normalizeDatasetWithData,
  normalizeMaterial,
  normalizePaged,
  normalizeSubmission,
} from "./normalize";

export class MaterialsApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Client for Lightsmith Materials (lightsmith-materials). Server-side only (holds the JWT). */
export class HttpMaterialsApi implements MaterialsApi {
  readonly mode = "http" as const;

  constructor(private readonly base: string) {}

  private async get(path: string, init: RequestInit = {}, revalidate = 300): Promise<unknown> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init.headers ?? {}) },
      next: init.method && init.method !== "GET" ? undefined : { revalidate },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new MaterialsApiError(res.status, describeError(res.status, body));
    }
    return res.json();
  }

  private send(path: string, body: unknown, token: string) {
    return this.get(
      path,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
      0,
    );
  }

  async categories() {
    const raw = await this.get("/v1/categories");
    return (Array.isArray(raw) ? raw : []).map((c: { id?: string; name?: string; count?: number } | string) =>
      typeof c === "string" ? { id: c, name: c, count: 0 } : { id: String(c.id), name: String(c.name ?? c.id), count: Number(c.count ?? 0) },
    );
  }

  async search({ q = "", category = "", page = 1, per_page = 24 }) {
    const params = new URLSearchParams({ page: String(page), per_page: String(per_page) });
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    return normalizePaged(await this.get(`/v1/materials?${params}`), page, per_page);
  }

  async material(id: string) {
    const raw = await this.get(`/v1/materials/${encodeURIComponent(id)}`);
    return raw ? normalizeMaterial(raw) : null;
  }

  async dataset(id: string) {
    const enc = encodeURIComponent(id);
    const [meta, data] = await Promise.all([this.get(`/v1/datasets/${enc}`), this.get(`/v1/datasets/${enc}/data`)]);
    return meta && data ? normalizeDatasetWithData(meta, data) : null;
  }

  async compare(ids: string[]) {
    if (ids.length === 0) return [];
    const raw = await this.get(`/v1/compare?datasets=${ids.map(encodeURIComponent).join(",")}`);
    const env = raw as { items?: unknown[]; datasets?: unknown[] } | null;
    const list = Array.isArray(raw) ? raw : (env?.items ?? env?.datasets ?? []);
    return list.map((x) => normalizeDatasetWithData(x));
  }

  async submit(input: SubmissionInput, token: string): Promise<Submission> {
    return normalizeSubmission(await this.send("/v1/submissions", input, token));
  }

  async submissions(status: string, token: string): Promise<Submission[]> {
    const raw = await this.get(
      `/v1/submissions?status=${encodeURIComponent(status)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      0,
    );
    const list = Array.isArray(raw) ? raw : ((raw as { items?: unknown[] } | null)?.items ?? []);
    return list.map(normalizeSubmission);
  }

  async review(id: string, decision: "approve" | "reject", note: string, token: string): Promise<Submission> {
    return normalizeSubmission(await this.send(`/v1/submissions/${encodeURIComponent(id)}/review`, { decision, note }, token));
  }
}

/** materials-db errors are `{error, message, detail: {validation: {errors[]}}}`; show the useful part. */
export function describeError(status: number, body: string): string {
  try {
    const j = JSON.parse(body) as { message?: string; detail?: { validation?: { errors?: unknown[] } } | string };
    const errors = typeof j.detail === "object" ? (j.detail?.validation?.errors ?? []) : [];
    const list = errors
      .slice(0, 5)
      .map((e) => (typeof e === "string" ? e : ((e as { message?: string }).message ?? JSON.stringify(e))))
      .join("; ");
    if (j.message) return list ? `${j.message}: ${list}` : j.message;
  } catch {}
  return `materials-db ${status}: ${body.slice(0, 300)}`;
}
