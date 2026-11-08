import { agentRoute, readBody } from "@/lib/api/http";
import { updateMe, whoami } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const GET = agentRoute(async (ctx) => whoami(ctx));
export const PATCH = agentRoute(async (ctx, req) => updateMe(ctx, await readBody(req, "UpdateMe")));
