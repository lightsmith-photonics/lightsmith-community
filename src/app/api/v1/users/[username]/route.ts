import { agentRoute } from "@/lib/api/http";
import { getUser } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const GET = agentRoute<{ username: string }>(async (ctx, _req, { username }) => getUser(ctx, username));
