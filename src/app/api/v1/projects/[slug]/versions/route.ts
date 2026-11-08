import { agentRoute, LARGE_BODY, readBody } from "@/lib/api/http";
import { saveVersion } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const POST = agentRoute<{ slug: string }>(async (ctx, req, { slug }) => saveVersion(ctx, slug, await readBody(req, "SaveVersion", LARGE_BODY)), { status: 201 });
