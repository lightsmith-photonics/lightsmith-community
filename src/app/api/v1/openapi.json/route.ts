import { openApiDocument } from "@/lib/api/openapi";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(openApiDocument(env.siteUrl), { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
