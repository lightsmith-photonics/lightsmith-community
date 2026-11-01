import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { materialsApi, type Submission } from "@/lib/materials";
import { issuePlatformJwt } from "@/lib/platform-jwt";
import { requireRole } from "@/lib/session";
import { notify } from "@/lib/notify";
import { LineChart } from "@/components/charts/LineChart";

export const metadata = { title: "Material submissions" };
export const dynamic = "force-dynamic";

export default async function MaterialQueue({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = ["pending", "approved", "rejected"].includes(sp.status ?? "") ? sp.status! : "pending";
  const me = await requireRole("moderator", "/moderation/materials");
  let items: Submission[] = [];
  let error: string | null = null;
  try {
    items = await materialsApi().submissions(status, await issuePlatformJwt(me, "materials-db"));
  } catch (err) {
    error = (err as Error).message;
  }

  async function review(fd: FormData) {
    "use server";
    const mod = await requireRole("moderator", "/moderation/materials");
    const id = String(fd.get("id"));
    const decision = fd.get("decision") === "approve" ? "approve" : "reject";
    const note = String(fd.get("note") ?? "").slice(0, 1000);
    const sub = await materialsApi().review(id, decision, note, await issuePlatformJwt(mod, "materials-db"));
    const local = await db.materialSubmission.findUnique({ where: { remoteId: id } });
    if (local) {
      await db.materialSubmission.update({ where: { id: local.id }, data: { status: sub.status } });
      await notify({
        userId: local.userId,
        actorId: mod.id,
        type: "moderation",
        message: `Your dataset “${local.title}” was ${sub.status}${note ? `: ${note}` : ""}`,
        url: `/materials/${encodeURIComponent(local.material)}`,
      });
    }
    revalidatePath("/moderation/materials");
  }

  return (
    <div>
      <nav aria-label="Submission status" className="mb-4 flex gap-2 text-sm">
        {["pending", "approved", "rejected"].map((s) => (
          <a key={s} href={`?status=${s}`} aria-current={s === status ? "page" : undefined} className={`badge !px-3 !py-1 ${s === status ? "!bg-accent !text-accent-fg" : ""}`}>
            {s}
          </a>
        ))}
      </nav>
      {error && <p role="alert" className="rounded-md border border-danger p-3 text-sm text-danger">Could not load submissions: {error}</p>}
      {!error && items.length === 0 && <p className="text-muted">No {status} submissions.</p>}
      <ul className="space-y-6">
        {items.map((s) => (
          <li key={s.id} className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {s.material_name} — {s.dataset_name}
              </h2>
              <span className="text-xs text-muted">
                {s.id} · by {s.submitted_by.name || s.submitted_by.sub} · {new Date(s.created_at).toISOString().slice(0, 10)}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Material</dt>
              <dd>{s.material_id ? `existing: ${s.material_id}` : "new material"} ({s.category})</dd>
              <dt className="text-muted">Reference</dt>
              <dd>{s.reference}</dd>
              <dt className="text-muted">DOI</dt>
              <dd>{s.doi ? <a className="link" href={`https://doi.org/${s.doi}`} rel="noopener">{s.doi}</a> : "—"}</dd>
              <dt className="text-muted">Licence</dt>
              <dd>{s.license}</dd>
              <dt className="text-muted">Points</dt>
              <dd>
                {s.data.length} ({s.data[0]?.[0]}–{s.data[s.data.length - 1]?.[0]} nm)
              </dd>
              {s.comments && (
                <>
                  <dt className="text-muted">Comments</dt>
                  <dd>{s.comments}</dd>
                </>
              )}
            </dl>
            {s.data.length > 1 && (
              <div className="mt-3 max-w-2xl">
                <LineChart
                  title={`Submitted data ${s.id}`}
                  series={[
                    { id: "n", label: "n", x: s.data.map((r) => r[0]), y: s.data.map((r) => r[1]) },
                    { id: "k", label: "k", x: s.data.map((r) => r[0]), y: s.data.map((r) => r[2]), dashed: true },
                  ]}
                  xLabel="Wavelength (nm)"
                  yLabel="n, k"
                  height={240}
                  compact
                />
              </div>
            )}
            {s.status === "pending" ? (
              <form action={review} className="mt-4 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={s.id} />
                <div className="min-w-64 flex-1">
                  <label className="label" htmlFor={`note-${s.id}`}>Note to contributor (optional)</label>
                  <input id={`note-${s.id}`} name="note" className="input" />
                </div>
                <button className="btn-primary" name="decision" value="approve" type="submit">Approve</button>
                <button className="btn-danger" name="decision" value="reject" type="submit">Reject</button>
              </form>
            ) : (
              <p className="mt-3 text-sm">
                <span className="badge">{s.status}</span> {s.review_note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
