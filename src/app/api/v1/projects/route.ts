import { agentRoute, LARGE_BODY, readBody } from "@/lib/api/http";
import { shareProject } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const POST = agentRoute(async (ctx, req) => shareProject(ctx, await readBody(req, "ShareProject", LARGE_BODY)), { status: 201 });
