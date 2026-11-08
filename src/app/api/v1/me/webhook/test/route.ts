import { agentRoute } from "@/lib/api/http";
import { pingWebhook } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const POST = agentRoute(async (ctx) => pingWebhook(ctx));
