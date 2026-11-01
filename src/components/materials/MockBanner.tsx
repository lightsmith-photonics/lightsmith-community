import { materialsApi } from "@/lib/materials";
import { brand } from "@/lib/brand";

export function MaterialsMockBanner() {
  if (materialsApi().mode !== "mock") return null;
  return (
    <p role="note" className="rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted">
      Showing built-in sample data (CC0 tables). Set <code>MATERIALS_API_URL</code> to use {brand.materials}.
    </p>
  );
}
