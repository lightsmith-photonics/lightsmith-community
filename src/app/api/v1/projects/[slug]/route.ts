import { agentRoute } from "@/lib/api/http";
import { readProject } from "@/lib/api/ops";

export const dynamic = "force-dynamic";

export const GET = agentRoute<{ slug: string }>(async (ctx, _req, { slug }) => readProject(ctx, slug));
