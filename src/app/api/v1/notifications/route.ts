import { agentRoute, query } from "@/lib/api/http";
import { listNotifications } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const GET = agentRoute(async (ctx, req) => {
  const q = query(req);
  return listNotifications(ctx, { unread_only: q.get("unread") === "true", mark_read: q.get("mark_read") === "true", limit: Number(q.get("limit") ?? 30) });
});
