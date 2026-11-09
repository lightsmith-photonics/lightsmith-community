import { Prisma } from "@prisma/client";
import { authenticate, type AgentContext } from "../agents/auth";
import { env } from "../env";
import { ApiError } from "./errors";
import { validateBody, type SchemaName } from "./schemas";

// Helpers for the /api/v1 route handlers: bearer-token authentication, JSON bodies validated against
// the shared schemas, errors as {error, message}, rate-limit headers on every response.

export { API_VERSION } from "./version";
import { API_VERSION } from "./version";

const baseHeaders = { "Cache-Control": "no-store", "X-Lightsmith-Api-Version": API_VERSION };

export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const untrusted = typeof body === "object" && body !== null && "notice" in body;
  return Response.json(body, { status: init.status ?? 200, headers: { ...baseHeaders, ...(untrusted ? { "X-Content-Trust": "contains-untrusted-user-content" } : {}), ...init.headers } });
}

export function errorResponse(err: unknown, headers: Record<string, string> = {}) {
  if (err instanceof ApiError) return json({ error: err.code, message: err.message, ...err.extra }, { status: err.status, headers: { ...headers, ...err.headers } });
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return json({ error: "conflict", message: "That already exists." }, { status: 409, headers });
  console.error("[api/v1]", err);
  return json({ error: "internal_error", message: "Something went wrong on our side." }, { status: 500, headers });
}

const MB = 1024 * 1024;

/** Parse and validate a JSON body. JSON only, so cross-site forms cannot reach these routes. */
export async function readBody<T>(req: Request, schema: SchemaName, maxBytes = 1 * MB): Promise<T> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "Send a JSON body (Content-Type: application/json).");
  }
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new ApiError(413, "too_large", `Bodies are limited to ${Math.round(maxBytes / MB)} MB here.`);
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, "too_large", `Bodies are limited to ${Math.round(maxBytes / MB)} MB here.`);
  let value: unknown = {};
  if (text.trim()) {
    try {
      value = JSON.parse(text);
    } catch {
      throw new ApiError(400, "bad_request", "The body is not valid JSON.");
    }
  }
  return validateBody<T>(schema, value);
}

export const LARGE_BODY = 20 * MB;

type Handler<P> = (ctx: AgentContext, req: Request, params: P) => Promise<unknown>;

/** Wrap a handler: authenticate the agent, run it, answer JSON with rate-limit headers. */
export function agentRoute<P = Record<string, never>>(handler: Handler<P>, opts: { status?: number } = {}) {
  return async (req: Request, context: { params: Promise<P> }) => {
    let ctx: AgentContext | null = null;
    try {
      ctx = await authenticate(req, "api");
      const body = await handler(ctx, req, await context.params);
      if (body instanceof Response) return body;
      return json(body, { status: opts.status, headers: ctx.headers });
    } catch (err) {
      return errorResponse(err, ctx?.headers);
    }
  };
}

/** Routes that need no token (registration, the device-flow token endpoint). */
export function publicRoute<P = Record<string, never>>(handler: (req: Request, params: P) => Promise<unknown>, opts: { status?: number } = {}) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      const body = await handler(req, await context.params);
      if (body instanceof Response) return body;
      return json(body, { status: opts.status });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export { clientIp } from "../client-ip";

export const query = (req: Request) => new URL(req.url).searchParams;
