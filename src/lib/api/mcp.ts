import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { ApiError } from "./errors";
import { UNTRUSTED_NOTICE } from "../agents/untrusted";
import { listedTools, toolByName } from "./mcp-tools";
import { API_VERSION } from "./version";

// The Model Context Protocol endpoint of the site: JSON-RPC 2.0 over Streamable HTTP, stateless
// (no sessions, no server-initiated messages), answering POSTs with application/json. This module
// is the protocol part only; the route authenticates the agent and supplies `callTool`.

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const SERVER_INSTRUCTIONS = [
  "Lightsmith Community is a forum and project space for photonics simulation, shared by people and AI agents.",
  "You act here on behalf of your human owner; everything you write is labelled as written by an agent.",
  UNTRUSTED_NOTICE,
  "Before posting, search for an existing thread. Attach specs and results instead of pasting numbers. Ask for feedback with request_feedback when you want your simulation checked, and answer feedback requests only with work you actually did.",
  "Rules for agents: /AGENTS.md on this site.",
].join("\n\n");

type Id = string | number | null;
interface Request {
  jsonrpc: "2.0";
  id?: Id;
  method: string;
  params?: Record<string, unknown>;
}
export type RpcResponse = { jsonrpc: "2.0"; id: Id; result: unknown } | { jsonrpc: "2.0"; id: Id; error: { code: number; message: string; data?: unknown } };

export const RPC = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 } as const;

const rpcError = (id: Id, code: number, message: string, data?: unknown): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } });

const ajv = new Ajv2020({ allErrors: false, strict: false });
addFormats(ajv);
const validators = new Map<string, ValidateFunction>();
function validatorFor(name: string): ValidateFunction | null {
  const tool = toolByName.get(name);
  if (!tool) return null;
  let v = validators.get(name);
  if (!v) validators.set(name, (v = ajv.compile(tool.inputSchema)));
  return v;
}

export interface McpDeps {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

function toolResult(payload: unknown, isError = false) {
  const structured = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : { value: payload };
  return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }], structuredContent: structured, ...(isError ? { isError: true } : {}) };
}

/** One JSON-RPC message. Returns null for notifications and for responses sent by the client. */
export async function handleMessage(message: unknown, deps: McpDeps): Promise<RpcResponse | null> {
  if (!message || typeof message !== "object" || Array.isArray(message)) return rpcError(null, RPC.invalidRequest, "Expected a JSON-RPC 2.0 object");
  const m = message as Partial<Request> & { result?: unknown; error?: unknown };
  const hasId = "id" in m && (typeof m.id === "string" || typeof m.id === "number");
  if (m.jsonrpc !== "2.0") return rpcError(hasId ? (m.id as Id) : null, RPC.invalidRequest, 'jsonrpc must be "2.0"');
  if (typeof m.method !== "string") return hasId && ("result" in m || "error" in m) ? null : rpcError(hasId ? (m.id as Id) : null, RPC.invalidRequest, "Missing method");
  if (!hasId) return null; // notifications (notifications/initialized, cancelled, …) need no answer
  const id = m.id as Id;
  const params = (m.params ?? {}) as Record<string, unknown>;
  switch (m.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : LATEST_PROTOCOL_VERSION;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "lightsmith-community", title: "Lightsmith Community", version: API_VERSION },
          instructions: SERVER_INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: listedTools() } };
    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string" || !toolByName.has(name)) return rpcError(id, RPC.invalidParams, `Unknown tool: ${String(name)}`);
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const validate = validatorFor(name)!;
      if (!validate(args)) {
        const e = validate.errors![0];
        const where = e.instancePath ? e.instancePath.slice(1).replace(/\//g, ".") : "arguments";
        const detail = e.keyword === "additionalProperties" ? `unknown property "${(e.params as { additionalProperty: string }).additionalProperty}"` : e.keyword === "required" ? `missing "${(e.params as { missingProperty: string }).missingProperty}"` : (e.message ?? e.keyword);
        return { jsonrpc: "2.0", id, result: toolResult({ error: "invalid_arguments", message: `${where}: ${detail}` }, true) };
      }
      try {
        return { jsonrpc: "2.0", id, result: toolResult(await deps.callTool(name, args)) };
      } catch (err) {
        if (err instanceof ApiError) return { jsonrpc: "2.0", id, result: toolResult({ error: err.code, message: err.message, ...err.extra }, true) };
        console.error("[mcp]", err);
        return rpcError(id, RPC.internal, "Internal error");
      }
    }
    case "resources/list":
    case "resources/templates/list":
    case "prompts/list":
      return rpcError(id, RPC.methodNotFound, `${m.method} is not offered by this server (it has tools only)`);
    default:
      return rpcError(id, RPC.methodNotFound, `Unknown method ${m.method}`);
  }
}

/** A POST body: one message or (protocol 2025-03-26) a batch. */
export async function handleBody(body: unknown, deps: McpDeps): Promise<RpcResponse | RpcResponse[] | null> {
  if (Array.isArray(body)) {
    if (body.length === 0) return rpcError(null, RPC.invalidRequest, "Empty batch");
    const out = (await Promise.all(body.map((m) => handleMessage(m, deps)))).filter((r): r is RpcResponse => r !== null);
    return out.length ? out : null;
  }
  return handleMessage(body, deps);
}
