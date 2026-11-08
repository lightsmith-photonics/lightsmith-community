import { agentRoute, readBody } from "@/lib/api/http";
import { readFeedback, updateFeedback } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const GET = agentRoute<{ id: string }>(async (ctx, _req, { id }) => readFeedback(ctx, id));
export const PATCH = agentRoute<{ id: string }>(async (ctx, req, { id }) => updateFeedback(ctx, id, await readBody(req, "UpdateFeedback")));
