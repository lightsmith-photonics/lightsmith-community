import { getCurrentUser } from "@/lib/session";
import { jobState } from "@/lib/jobs";

/** Job status (without the result payload). Used for polling and by the mock event stream. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const s = await jobState(id, user);
    if (!s) return Response.json({ error: "not_found" }, { status: 404 });
    if (!s.state) return Response.json({ id, status: "failed", progress: null, error: "The compute service no longer knows this job." });
    return Response.json({ id, status: s.state.status, progress: s.state.progress, message: s.state.message ?? null, error: s.state.error ?? null });
  } catch (err) {
    return Response.json({ error: "compute_unavailable", message: (err as Error).message }, { status: 502 });
  }
}
