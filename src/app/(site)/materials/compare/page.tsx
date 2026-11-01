import Link from "next/link";
import { materialsApi } from "@/lib/materials";
import { NkExplorer } from "@/components/materials/NkExplorer";

export const metadata = { title: "Compare optical constants" };
export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ datasets?: string | string[] }> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.datasets) ? sp.datasets : sp.datasets ? [sp.datasets] : [];
  const selected = [...new Set(raw.flatMap((s) => s.split(",")).filter(Boolean))].slice(0, 8);
  const api = materialsApi();
  const [all, data] = await Promise.all([api.search({ per_page: 200 }), api.compare(selected)]);

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold">Compare datasets</h1>
      <p className="mt-1 text-muted">Overlay up to eight datasets from different papers or materials.</p>
      <div className="mt-6 grid gap-8 lg:grid-cols-[18rem_1fr]">
        <form action="/materials/compare" className="space-y-4">
          {all.items.map((m) => (
            <fieldset key={m.id}>
              <legend className="text-sm font-semibold">{m.name}</legend>
              {m.datasets.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="datasets" value={d.id} defaultChecked={selected.includes(d.id)} />
                  {d.name} {d.year ? <span className="text-muted">({d.year})</span> : null}
                </label>
              ))}
            </fieldset>
          ))}
          <button className="btn-primary sticky bottom-2 w-full" type="submit">
            Update comparison
          </button>
        </form>
        <div>
          {data.length === 0 ? (
            <p className="card text-muted">Select datasets on the left and press “Update comparison”.</p>
          ) : (
            <>
              <NkExplorer datasets={data} labelWithMaterial />
              <ul className="mt-6 space-y-2 text-sm">
                {data.map((d) => (
                  <li key={d.dataset.id}>
                    <Link className="link" href={`/materials/datasets/${encodeURIComponent(d.dataset.id)}`}>
                      {d.dataset.material_id} — {d.dataset.name}
                    </Link>
                    : {d.dataset.reference}
                    {d.dataset.doi && (
                      <>
                        {" "}
                        <a className="link" href={`https://doi.org/${d.dataset.doi}`} rel="noopener">doi:{d.dataset.doi}</a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
