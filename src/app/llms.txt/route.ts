import { llmsTxt } from "@/lib/agent-docs";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(llmsTxt(env.siteUrl, env.githubRepo), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
