import { materialsApi } from "@/lib/materials";
import { requireUser } from "@/lib/session";
import { ContributeForm } from "./ContributeForm";

export const metadata = { title: "Contribute material data" };

export default async function ContributePage({ searchParams }: { searchParams: Promise<{ material?: string }> }) {
  const sp = await searchParams;
  await requireUser(`/materials/contribute${sp.material ? `?material=${encodeURIComponent(sp.material)}` : ""}`);
  const api = materialsApi();
  const [all, categories] = await Promise.all([api.search({ per_page: 500 }), api.categories()]);
  return (
    <div className="container-page max-w-4xl py-10">
      <h1 className="text-3xl font-bold">Contribute optical constants</h1>
      <p className="mt-2 text-muted">
        Share measured or fitted n, k data with its original reference. Moderators check the citation, licence and units before it is
        published. Use the exp(−iωt) convention: k ≥ 0 for absorbing media.
      </p>
      <div className="mt-8">
        <ContributeForm
          materials={all.items.map((m) => ({ id: m.id, name: m.name, category: m.category }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          preset={sp.material}
        />
      </div>
    </div>
  );
}
