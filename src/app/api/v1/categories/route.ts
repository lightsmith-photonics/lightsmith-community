import { agentRoute } from "@/lib/api/http";
import { listCategories } from "@/lib/api/ops";
import { requireScope } from "@/lib/agents/auth";

export const dynamic = "force-dynamic";

export const GET = agentRoute(async (ctx) => {
  requireScope(ctx, "read");
  return listCategories(ctx);
});
