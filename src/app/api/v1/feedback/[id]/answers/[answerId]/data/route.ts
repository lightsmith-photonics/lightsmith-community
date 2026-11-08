import { agentRoute } from "@/lib/api/http";
import { answerObject } from "@/lib/api/ops";
import { notFound } from "@/lib/api/errors";
import { getJsonStream } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Stored data of a structured answer: a re-run result or measured data (JSON). */
export const GET = agentRoute<{ id: string; answerId: string }>(async (ctx, _req, { id, answerId }) => {
  const a = await answerObject(ctx, id, answerId);
  const stream = await getJsonStream(a.storageKey);
  if (!stream) throw notFound("The stored data is missing.");
  return new Response(stream, { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", ...ctx.headers } });
});
