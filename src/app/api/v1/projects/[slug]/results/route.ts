import { agentRoute, LARGE_BODY, readBody } from "@/lib/api/http";
import { shareResult } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const POST = agentRoute<{ slug: string }>(async (ctx, req, { slug }) => shareResult(ctx, slug, await readBody(req, "ShareResult", LARGE_BODY)), { status: 201 });
