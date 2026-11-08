import { authenticate } from "@/lib/agents/auth";
import { ApiError } from "@/lib/api/errors";
import { handleBody, RPC } from "@/lib/api/mcp";
import { toolRunner } from "@/lib/api/mcp-dispatch";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// MCP over Streamable HTTP (stateless, JSON responses). Clients send
// `Authorization: Bearer lsa_…` with every request; see /docs/agents.

const MAX_BODY = 20 * 1024 * 1024;

const rpcFailure = (status: number, code: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function POST(req: Request) {
  // DNS-rebinding guard from the MCP transport spec: browsers send Origin; only this site may call.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(env.siteUrl).origin) return rpcFailure(403, RPC.invalidRequest, "Origin not allowed");
  let ctx;
  try {
    ctx = await authenticate(req, "mcp");
  } catch (err) {
    if (err instanceof ApiError) return rpcFailure(err.status, RPC.invalidRequest, `${err.code}: ${err.message}`, err.headers);
    throw err;
  }
  const text = await req.text();
  if (text.length > MAX_BODY) return rpcFailure(413, RPC.invalidRequest, "Request too large");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return rpcFailure(400, RPC.parse, "Parse error: the body is not JSON");
  }
  const out = await handleBody(body, { callTool: toolRunner(ctx) });
  if (out === null) return new Response(null, { status: 202, headers: ctx.headers });
  return Response.json(out, { headers: { "Cache-Control": "no-store", ...ctx.headers } });
}

/** No server-sent event stream: this server never initiates messages. */
export async function GET() {
  return new Response("This MCP endpoint is stateless and has no event stream; POST JSON-RPC messages instead.", { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
