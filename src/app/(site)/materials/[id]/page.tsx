import Link from "next/link";
import { notFound } from "next/navigation";
import { materialsApi } from "@/lib/materials";
import { NkExplorer } from "@/components/materials/NkExplorer";
import { DatasetTable } from "@/components/materials/DatasetTable";
import { MaterialsMockBanner } from "@/components/materials/MockBanner";
import { CodeBlock } from "@/components/CodeBlock";
import { brand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await materialsApi().material(decodeURIComponent(id));
  return m ? { title: `${m.name} (${m.formula}) optical constants`, description: `${m.datasets.length} datasets of n, k for ${m.name}.` } : {};
}

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = materialsApi();
  const material = await api.material(decodeURIComponent(id));
  if (!material) notFound();
  const data = await api.compare(material.datasets.map((d) => d.id));
  const def = material.datasets.find((d) => d.is_default) ?? material.datasets[0];
  const snippet = JSON.stringify({ kind: "library", name: material.id, dataset: def?.name ?? null });

  return (
    <div className="container-page py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/materials" className="hover:underline">
          Materials
        </Link>{" "}
        / <Link href={`/materials?category=${material.category}`} className="hover:underline">{material.category}</Link> / {material.formula}
      </nav>
      <h1 className="mt-2 text-3xl font-bold">
        {material.name} <span className="text-muted">({material.formula})</span>
      </h1>
      {material.aliases.length > 0 && <p className="mt-1 text-sm text-muted">Also known as {material.aliases.join(", ")}</p>}
      <div className="mt-4">
        <MaterialsMockBanner />
      </div>

      <section className="mt-6" aria-labelledby="plot">
        <h2 id="plot" className="sr-only">
          Optical constants plot
        </h2>
        {data.length > 0 ? <NkExplorer datasets={data} /> : <p className="text-muted">No tabulated data.</p>}
      </section>

      <section className="mt-10" aria-labelledby="datasets">
        <h2 id="datasets" className="text-xl font-semibold">
          Datasets and references
        </h2>
        <div className="mt-3">
          <DatasetTable datasets={material.datasets} />
        </div>
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-2" aria-labelledby="use">
        <div>
          <h2 id="use" className="text-xl font-semibold">
            Use in a simulation
          </h2>
          <p className="mt-2 text-sm text-muted">
            Reference the library material in a {brand.product} spec, or download the dataset as an inline <code>tabulated</code> material.
          </p>
          <div className="mt-3">
            <CodeBlock code={snippet} label="Library material" />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Missing a measurement?</h2>
          <p className="mt-2 text-sm text-muted">Contribute a dataset with its reference. A moderator reviews it before it is published.</p>
          <Link className="btn mt-3" href={`/materials/contribute?material=${encodeURIComponent(material.id)}`}>
            Contribute data for {material.formula}
          </Link>
        </div>
      </section>
    </div>
  );
}
