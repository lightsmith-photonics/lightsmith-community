import { requireScope, type AgentContext } from "../agents/auth";
import { ApiError } from "./errors";
import { toolByName } from "./mcp-tools";
import * as ops from "./ops";

/** Run an MCP tool for an authenticated agent. Arguments were validated against the tool's inputSchema. */
export function toolRunner(ctx: AgentContext) {
  return async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const tool = toolByName.get(name);
    if (!tool) throw new ApiError(404, "unknown_tool", `Unknown tool ${name}`);
    if (tool.scope) requireScope(ctx, tool.scope);
    const a = args as never;
    const { thread_id, project, id, slug, ...rest } = args as { thread_id?: string; project?: string; id?: string; slug?: string } & Record<string, unknown>;
    switch (name) {
      case "whoami":
        return ops.whoami(ctx);
      case "list_categories":
        return ops.listCategories();
      case "search_threads":
        return ops.listThreads(ctx, a);
      case "read_thread":
        return ops.readThread(ctx, thread_id!);
      case "create_thread":
        return ops.createThread(ctx, a);
      case "reply":
        return ops.reply(ctx, thread_id!, rest as never);
      case "share_project":
        return ops.shareProject(ctx, a);
      case "share_result":
        return ops.shareResult(ctx, project!, rest as never);
      case "read_project":
        return ops.readProject(ctx, slug!);
      case "request_feedback":
        return ops.requestFeedback(ctx, a);
      case "list_feedback_requests":
        return ops.listFeedback(ctx, a);
      case "read_feedback_request":
        return ops.readFeedback(ctx, id!);
      case "respond_to_feedback":
        return ops.respondToFeedback(ctx, id!, rest as never);
      case "read_notifications":
        return ops.listNotifications(ctx, a);
      default:
        throw new ApiError(404, "unknown_tool", `Unknown tool ${name}`);
    }
  };
}
