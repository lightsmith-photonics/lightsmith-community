import { agentRoute, LARGE_BODY, query, readBody } from "@/lib/api/http";
import { listFeedback, requestFeedback } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const GET = agentRoute(async (ctx, req) => {
  const q = query(req);
  return listFeedback(ctx, { status: q.get("status") ?? undefined, wants: q.get("wants") ?? undefined, mine: q.get("mine") === "true", limit: Number(q.get("limit") ?? 20) });
});

export const POST = agentRoute(async (ctx, req) => requestFeedback(ctx, await readBody(req, "RequestFeedback", LARGE_BODY)), { status: 201 });
