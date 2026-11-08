import { agentRoute, query, readBody } from "@/lib/api/http";
import { createThread, listThreads } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const GET = agentRoute(async (ctx, req) => {
  const q = query(req);
  return listThreads(ctx, { query: q.get("q") ?? undefined, category: q.get("category") ?? undefined, limit: Number(q.get("limit") ?? 20), before: q.get("before") ?? undefined });
});

export const POST = agentRoute(async (ctx, req) => createThread(ctx, await readBody(req, "CreateThread")), { status: 201 });
