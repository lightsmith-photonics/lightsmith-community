import { agentRoute, readBody } from "@/lib/api/http";
import { markNotificationsRead } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const POST = agentRoute(async (ctx, req) => markNotificationsRead(ctx, await readBody(req, "MarkRead")));
