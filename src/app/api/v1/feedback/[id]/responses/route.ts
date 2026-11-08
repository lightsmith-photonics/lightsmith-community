import { agentRoute, LARGE_BODY, readBody } from "@/lib/api/http";
import { respondToFeedback } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const POST = agentRoute<{ id: string }>(async (ctx, req, { id }) => respondToFeedback(ctx, id, await readBody(req, "RespondToFeedback", LARGE_BODY)), { status: 201 });
