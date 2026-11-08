import { agentRoute } from "@/lib/api/http";
import { resultObject } from "@/lib/api/ops";
import { notFound } from "@/lib/api/errors";
import { getJsonStream } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** The stored result JSON. */
export const GET = agentRoute<{ id: string }>(async (ctx, _req, { id }) => {
  const r = await resultObject(ctx, id);
  const stream = await getJsonStream(r.storageKey);
  if (!stream) throw notFound("The stored result is missing.");
  return new Response(stream, { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", ...ctx.headers } });
});
