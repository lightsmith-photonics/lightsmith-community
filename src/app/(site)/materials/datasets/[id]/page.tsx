import Link from "next/link";
import { notFound } from "next/navigation";
import { materialsApi } from "@/lib/materials";
import { NkExplorer } from "@/components/materials/NkExplorer";
import { DownloadLinks } from "@/components/materials/DatasetTable";
import { CodeBlock } from "@/components/CodeBlock";
import { brand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await materialsApi().dataset(decodeURIComponent(id));
  return d ? { title: `${d.dataset.material_id}: ${d.dataset.name}`, description: d.dataset.reference } : {};
}

export default async function DatasetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await materialsApi().dataset(decodeURIComponent(id));
  if (!d) notFound();
  const ds = d.dataset;
  return (
    <div className="container-page py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/materials" className="hover:underline">Materials</Link> /{" "}
        <Link href={`/materials/${encodeURIComponent(ds.material_id)}`} className="hover:underline">{ds.material_id}</Link> / {ds.name}
      </nav>
      <h1 className="mt-2 text-3xl font-bold">
        {ds.material_id}: {ds.name}
      </h1>
      <dl className="mt-4 grid max-w-3xl grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted">Reference</dt>
        <dd>{ds.reference}</dd>
        {ds.doi && (
          <>
            <dt className="text-muted">DOI</dt>
            <dd>
              <a className="link" href={`https://doi.org/${ds.doi}`} rel="noopener">{ds.doi}</a>
            </dd>
          </>
        )}
        <dt className="text-muted">Range</dt>
        <dd>
          {ds.range_nm[0]}–{ds.range_nm[1]} nm ({d.data.wavelength_nm.length} points)
        </dd>
        <dt className="text-muted">Licence</dt>
        <dd>{ds.license}</dd>
        {ds.comments && (
          <>
            <dt className="text-muted">Comments</dt>
            <dd>{ds.comments}</dd>
          </>
        )}
        <dt className="text-muted">Download</dt>
        <dd>
          <DownloadLinks id={ds.id} />
        </dd>
      </dl>
      <div className="mt-8">
        <NkExplorer datasets={[d]} />
      </div>
      <div className="mt-8 max-w-3xl">
        <h2 className="text-lg font-semibold">In a {brand.product} spec</h2>
        <CodeBlock code={JSON.stringify({ kind: "library", name: ds.material_id, dataset: ds.name }, null, 2)} label="Library material" />
        <p className="mt-2 text-xs text-muted">Or download “Material JSON” for a self-contained tabulated material with its citation.</p>
      </div>
      <p className="mt-6 text-sm">
        <Link className="link" href={`/materials/compare?datasets=${encodeURIComponent(ds.id)}`}>Compare with other datasets</Link>
      </p>
    </div>
  );
}
