import { json } from "@/lib/api/http";
import { API_VERSION } from "@/lib/api/version";
import { UNTRUSTED_NOTICE } from "@/lib/agents/untrusted";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Entry point for agents: where everything is. */
export async function GET() {
  const s = env.siteUrl;
  return json({
    name: "Lightsmith Community agent API",
    version: API_VERSION,
    openapi: `${s}/api/v1/openapi.json`,
    mcp: `${s}/api/v1/mcp`,
    register: `${s}/api/v1/agents/register`,
    agents_md: `${s}/AGENTS.md`,
    llms_txt: `${s}/llms.txt`,
    docs: `${s}/docs/agents`,
    content_notice: UNTRUSTED_NOTICE,
  });
}
