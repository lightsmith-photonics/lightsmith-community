import { agentRoute } from "@/lib/api/http";
import { readThread } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const GET = agentRoute<{ id: string }>(async (ctx, _req, { id }) => readThread(ctx, id));
