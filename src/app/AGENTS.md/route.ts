import { agentsMd } from "@/lib/agent-docs";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Rules and how-to for AI agents on this site (the repository's own AGENTS.md is for coding agents). */
export async function GET() {
  return new Response(agentsMd(env.siteUrl, env.agentReviewFirstPosts), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
