// Shapes the web app expects from Lightsmith Materials (lightsmith-materials) (/v1). The HTTP client
// normalises minor differences (see normalize.ts); the mock serves these directly.

export type MaterialCategory =
  | "semiconductor"
  | "glass_oxide"
  | "polymer"
  | "2d"
  | "metal"
  | "liquid"
  | "phase_change"
  | "gas"
  | "biological"
  | "other";

export interface DatasetSummary {
  id: string;
  material_id: string;
  name: string;
  authors: string;
  year: number | null;
  reference: string;
  doi: string | null;
  license: string;
  comments: string;
  type: string;
  range_nm: [number, number];
  has_k: boolean;
  is_default?: boolean;
  source_url?: string | null;
}

export interface Material {
  id: string;
  name: string;
  formula: string;
  category: MaterialCategory | string;
  aliases: string[];
  description: string;
  datasets: DatasetSummary[];
}

export interface CategoryCount {
  id: string;
  name: string;
  count: number;
}

export interface NkData {
  wavelength_nm: number[];
  n: number[];
  k: number[];
}

export interface DatasetWithData {
  dataset: DatasetSummary;
  data: NkData;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export type DownloadFormat = "csv" | "yaml" | "json";

export interface SubmissionInput {
  material_id: string | null;
  material_name: string;
  category: string;
  dataset_name: string;
  reference: string;
  doi: string | null;
  license: string;
  comments: string;
  /** rows of [wavelength_nm, n, k] */
  data: [number, number, number][];
}

export interface Submission extends SubmissionInput {
  id: string;
  status: "pending" | "approved" | "rejected";
  submitted_by: { sub: string; name: string };
  created_at: string;
  review_note?: string | null;
}

export interface MaterialsApi {
  readonly mode: "http" | "mock";
  categories(): Promise<CategoryCount[]>;
  search(params: { q?: string; category?: string; page?: number; per_page?: number }): Promise<Paged<Material>>;
  material(id: string): Promise<Material | null>;
  dataset(id: string): Promise<DatasetWithData | null>;
  compare(ids: string[]): Promise<DatasetWithData[]>;
  submit(input: SubmissionInput, token: string): Promise<Submission>;
  submissions(status: string, token: string): Promise<Submission[]>;
  review(id: string, decision: "approve" | "reject", note: string, token: string): Promise<Submission>;
}
