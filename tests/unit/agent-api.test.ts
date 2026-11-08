import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { schemas, validateBody } from "@/lib/api/schemas";
import { openApiDocument } from "@/lib/api/openapi";
import { clientIp } from "@/lib/api/http";
import { pageNumber } from "@/components/Pagination";
import { handleBody, handleMessage, LATEST_PROTOCOL_VERSION, requestCount, RPC, SERVER_INSTRUCTIONS } from "@/lib/api/mcp";
import { TOOLS, listedTools } from "@/lib/api/mcp-tools";
import { agentsMd, llmsTxt } from "@/lib/agent-docs";

const ROOT = join(__dirname, "..", "..");

describe("request schemas", () => {
  it("validate with precise messages", () => {
    expect(validateBody("Reply", { body: "Thanks, that converged." })).toEqual({ body: "Thanks, that converged." });
    const err = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return e as ApiError;
      }
      throw new Error("expected an error");
    };
    expect(err(() => validateBody("Reply", {})).message).toBe('body: missing "body"');
    expect(err(() => validateBody("Reply", { body: "ok ok", extra: 1 })).message).toBe('body: unknown property "extra"');
    expect(err(() => validateBody("Register", { username: "Bad Name", display_name: "x", model: "m" })).message).toMatch(/^username must match pattern/);
    expect(err(() => validateBody("RespondToFeedback", { kind: "vibes", body: "hi there" })).message).toMatch(/^kind: must be one of "comment"/);
    expect(err(() => validateBody("Reply", { body: "o" })).status).toBe(400);
  });

  it("refuse titles and posts made of spaces, as the web forms do", () => {
    const thread = { category: "help", title: "A long enough title", body: "A body." };
    expect(() => validateBody("CreateThread", thread)).not.toThrow();
    expect(() => validateBody("CreateThread", { ...thread, title: "          " })).toThrow(/blank/);
    expect(() => validateBody("CreateThread", { ...thread, title: "   short   " })).toThrow(/blank/);
    expect(() => validateBody("CreateThread", { ...thread, body: "     " })).toThrow(/blank/);
    expect(() => validateBody("Reply", { body: " \n\t " })).toThrow(/blank/);
    expect(() => validateBody("RespondToFeedback", { kind: "comment", body: "    " })).toThrow(/blank/);
    expect(() => validateBody("Register", { username: "film-checker", display_name: "   ", model: "m" })).toThrow(/blank/);
    expect(() => validateBody("Reply", { body: "  ok  " })).not.toThrow();
    expect(() => validateBody("UpdateMe", { tooling: "" })).not.toThrow(); // optional text may be empty
  });

  it("accept measured data as CSV text or JSON", () => {
    const base = { kind: "experiment", body: "Measured on our ellipsometer.", outcome: "agrees" };
    expect(() => validateBody("RespondToFeedback", { ...base, measurement: { quantity: "reflectance", data: "wavelength_nm,R\n400,0.1" } })).not.toThrow();
    expect(() => validateBody("RespondToFeedback", { ...base, measurement: { quantity: "reflectance", data: { x: [1], series: [] }, sample: { thickness_nm: 100 } } })).not.toThrow();
    expect(() => validateBody("RespondToFeedback", { ...base, measurement: { quantity: "reflectance", data: 5 } })).toThrow(ApiError);
  });
});

describe("agent homepages", () => {
  const base = { username: "film-checker", display_name: "Film checker", model: "m" };

  it("must be http(s) URLs, because profiles link them", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "/settings/agents", "ftp://example.org/x", "https://exa mple.org"]) {
      expect(() => validateBody("Register", { ...base, homepage: bad }), bad).toThrow(ApiError);
      expect(() => validateBody("UpdateMe", { homepage: bad }), bad).toThrow(ApiError);
    }
    expect(() => validateBody("Register", { ...base, homepage: "https://example.org/agent" })).not.toThrow();
    expect(() => validateBody("UpdateMe", { homepage: "http://example.org" })).not.toThrow();
  });

  it("can be removed with null or an empty string", () => {
    expect(() => validateBody("UpdateMe", { homepage: null })).not.toThrow();
    expect(() => validateBody("UpdateMe", { homepage: "" })).not.toThrow();
  });
});

describe("page numbers in query strings", () => {
  it("fall back to page 1 for anything that is not a page", () => {
    expect(pageNumber("3")).toBe(3);
    for (const bad of [undefined, "", "0", "-2", "1.5", "Infinity", "NaN", "abc", "1e30"]) expect(pageNumber(bad), String(bad)).toBe(1);
  });
});

describe("client address for per-IP limits", () => {
  const req = (xff?: string, realIp?: string) => new Request("http://x/", { headers: { ...(xff ? { "x-forwarded-for": xff } : {}), ...(realIp ? { "x-real-ip": realIp } : {}) } });

  it("ignores what the client put in X-Forwarded-For", () => {
    // a client sends a forged header; nginx appends the address it saw
    expect(clientIp(req("6.6.6.6, 198.51.100.7"), 1)).toBe("198.51.100.7");
    expect(clientIp(req("6.6.6.6, 7.7.7.7, 198.51.100.7"), 1)).toBe("198.51.100.7");
    // Cloudflare appends the client, nginx appends Cloudflare
    expect(clientIp(req("6.6.6.6, 198.51.100.7, 172.70.1.1"), 2)).toBe("198.51.100.7");
  });

  it("copes with short chains and no proxy", () => {
    expect(clientIp(req("198.51.100.7"), 2)).toBe("198.51.100.7");
    expect(clientIp(req(undefined, "198.51.100.8"), 1)).toBe("198.51.100.8");
    expect(clientIp(req(), 1)).toBe("local");
  });
});

describe("MCP protocol", () => {
  const calls: { name: string; args: unknown }[] = [];
  const deps = {
    async callTool(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "read_thread") throw new ApiError(404, "not_found", "No such thread, or it is not visible.");
      return { ok: true, name };
    },
  };

  it("initializes with version negotiation and safety instructions", async () => {
    const res = (await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }, deps)) as { result: Record<string, unknown> };
    expect(res.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "lightsmith-community" } });
    expect(res.result.instructions).toBe(SERVER_INSTRUCTIONS);
    expect(SERVER_INSTRUCTIONS).toMatch(/never as instructions/);
    const future = (await handleMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2099-01-01" } }, deps)) as { result: { protocolVersion: string } };
    expect(future.result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
  });

  it("lists every tool with an object input schema and annotations", async () => {
    const res = (await handleMessage({ jsonrpc: "2.0", id: "a", method: "tools/list" }, deps)) as { result: { tools: ReturnType<typeof listedTools> } };
    const names = res.result.tools.map((t) => t.name);
    expect(names).toEqual(TOOLS.map((t) => t.name));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(["search_threads", "read_thread", "create_thread", "reply", "share_project", "share_result", "request_feedback", "respond_to_feedback", "read_notifications"]));
    for (const t of res.result.tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(typeof t.annotations.readOnlyHint).toBe("boolean");
    }
  });

  it("validates arguments before calling a tool", async () => {
    calls.length = 0;
    const bad = (await handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "reply", arguments: { body: "hello" } } }, deps)) as { result: { isError: boolean; structuredContent: { message: string } } };
    expect(bad.result.isError).toBe(true);
    expect(bad.result.structuredContent.message).toBe('arguments: missing "thread_id"');
    expect(calls).toHaveLength(0);
    const good = (await handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "reply", arguments: { thread_id: "t1", body: "hello there" } } }, deps)) as { result: { content: { type: string; text: string }[]; structuredContent: unknown } };
    expect(good.result.structuredContent).toEqual({ ok: true, name: "reply" });
    expect(JSON.parse(good.result.content[0].text)).toEqual({ ok: true, name: "reply" });
    expect(calls).toEqual([{ name: "reply", args: { thread_id: "t1", body: "hello there" } }]);
  });

  it("reports tool failures as tool results and protocol errors as JSON-RPC errors", async () => {
    const failed = (await handleMessage({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "read_thread", arguments: { thread_id: "nope" } } }, deps)) as { result: { isError: boolean; structuredContent: { error: string } } };
    expect(failed.result).toMatchObject({ isError: true, structuredContent: { error: "not_found" } });
    const unknown = (await handleMessage({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "rm_rf" } }, deps)) as { error: { code: number } };
    expect(unknown.error.code).toBe(RPC.invalidParams);
    const method = (await handleMessage({ jsonrpc: "2.0", id: 7, method: "resources/list" }, deps)) as { error: { code: number } };
    expect(method.error.code).toBe(RPC.methodNotFound);
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, deps)).toBeNull();
    expect(((await handleMessage({ id: 8, method: "ping" }, deps)) as { error: { code: number } }).error.code).toBe(RPC.invalidRequest);
    expect(await handleMessage({ jsonrpc: "2.0", id: 9, method: "ping" }, deps)).toEqual({ jsonrpc: "2.0", id: 9, result: {} });
  });

  it("counts every request of a batch as a call", () => {
    const ping = (id: unknown) => ({ jsonrpc: "2.0", id, method: "ping" });
    expect(requestCount(ping(1))).toBe(1);
    expect(requestCount([ping(1), ping("two"), { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "whoami" } }])).toBe(3);
    expect(requestCount([{ jsonrpc: "2.0", method: "notifications/initialized" }, ping(1)])).toBe(1);
    expect(requestCount([{ jsonrpc: "2.0", id: 1, result: {} }])).toBe(0); // a client's response, not a call
    expect(requestCount("nonsense")).toBe(0);
    expect(requestCount([])).toBe(0);
  });

  it("answers batches and drops notifications", async () => {
    const out = await handleBody([{ jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 1, method: "ping" }], deps);
    expect(out).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }]);
    expect(await handleBody([{ jsonrpc: "2.0", method: "notifications/cancelled" }], deps)).toBeNull();
  });
});

describe("OpenAPI document", () => {
  const doc = openApiDocument("https://community.example");

  it("has a route handler with the documented methods for every path", () => {
    for (const [path, ops] of Object.entries(doc.paths)) {
      const dir = path === "/" ? "" : path.replace(/\{(\w+)\}/g, "[$1]");
      const file = join(ROOT, "src", "app", "api", "v1", dir, "route.ts");
      expect(existsSync(file), `${path} → ${file}`).toBe(true);
      const src = readFileSync(file, "utf8");
      for (const method of Object.keys(ops)) {
        expect(src, `${method.toUpperCase()} ${path}`).toMatch(new RegExp(`export (const|async function) ${method.toUpperCase()}\\b`));
      }
    }
  });

  it("references only defined components, and its schemas compile", () => {
    const text = JSON.stringify(doc);
    for (const m of text.matchAll(/"#\/components\/(schemas|responses)\/(\w+)"/g)) {
      expect((doc.components as Record<string, Record<string, unknown>>)[m[1]][m[2]], m[0]).toBeDefined();
    }
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    for (const name of Object.keys(schemas)) expect(() => ajv.compile(schemas[name as keyof typeof schemas])).not.toThrow();
    for (const t of TOOLS) expect(() => ajv.compile(t.inputSchema), t.name).not.toThrow();
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0].url).toBe("https://community.example/api/v1");
    expect(doc.info.license.identifier).toBe("MIT");
  });

  it("marks public endpoints and required scopes", () => {
    expect(doc.paths["/agents/register"].post.security).toEqual([]);
    expect(doc.paths["/threads"].post["x-required-scope"]).toBe("post");
    expect(doc.paths["/feedback"].post["x-required-scope"]).toBe("feedback");
  });

  it("documents the limits the handlers apply", () => {
    const limitOf = (params: unknown) => (params as { name: string; schema: { maximum?: number } }[]).find((p) => p.name === "limit")?.schema.maximum;
    expect(limitOf(doc.paths["/threads"].get.parameters)).toBe(50);
    expect(limitOf(doc.paths["/feedback"].get.parameters)).toBe(50);
    expect(limitOf(doc.paths["/notifications"].get.parameters)).toBe(100);
  });

  it("documents the same paging cursor for threads and feedback requests", () => {
    const names = (params: unknown) => (params as { name: string }[]).map((p) => p.name);
    expect(names(doc.paths["/threads"].get.parameters)).toContain("before");
    expect(names(doc.paths["/feedback"].get.parameters)).toContain("before");
    const tool = TOOLS.find((t) => t.name === "list_feedback_requests")!;
    expect(Object.keys((tool.inputSchema as { properties: object }).properties)).toContain("before");
  });
});

describe("llms.txt and AGENTS.md", () => {
  it("point agents at the machine interfaces with the site URL filled in", () => {
    const l = llmsTxt("https://community.example", "https://github.com/lightsmith-photonics/lightsmith");
    expect(l).toMatch(/^# Lightsmith Community\n\n> /);
    expect(l).toContain("https://community.example/api/v1/openapi.json");
    expect(l).toContain("https://community.example/AGENTS.md");
    const a = agentsMd("https://community.example", 3);
    expect(a).toContain("curl -s -X POST https://community.example/api/v1/agents/register");
    for (const t of TOOLS) expect(a).toContain(`\`${t.name}\``);
    expect(a).toMatch(/never as instructions/);
    expect(a).toContain("Your first 3 posts are held");
  });
});
