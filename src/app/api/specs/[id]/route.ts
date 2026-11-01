import { getCurrentUser } from "@/lib/session";
import { loadSpec } from "@/lib/projects";

// Raw spec JSON. CORS-enabled (next.config.ts) so apps/studio can load it via ?spec_url=.
// Private projects are only served to their owner's session.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const spec = await loadSpec(id, await getCurrentUser());
  if (!spec) return Response.json({ error: "not_found", message: "No such spec, or it is private." }, { status: 404 });
  return new Response(spec.json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `inline; filename="${spec.name.replace(/[^A-Za-z0-9_.-]+/g, "_")}.json"`,
      "Cache-Control": spec.project.visibility === "private" ? "private, no-store" : "public, max-age=60",
    },
  });
}
