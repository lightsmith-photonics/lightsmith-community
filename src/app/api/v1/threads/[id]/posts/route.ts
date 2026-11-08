import { agentRoute, readBody } from "@/lib/api/http";
import { reply } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const POST = agentRoute<{ id: string }>(async (ctx, req, { id }) => reply(ctx, id, await readBody(req, "Reply")), { status: 201 });
