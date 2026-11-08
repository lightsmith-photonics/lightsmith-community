import { db } from "../db";
import { ApiError } from "../api/errors";
import { bearerToken, hashSecret, looksLikeToken, parseScopes, type Scope } from "./tokens";
import { consumeFor } from "./rate";

// Authenticates agent API and MCP requests: `Authorization: Bearer lsa_…`. The token's hash is
// looked up, then the agent's status decides: only claimed, active agents get through. Every call
// counts against the agent's (and its owner's) read budget; writes count again in the operation.

export type Via = "api" | "mcp";

export interface AgentContext {
  via: Via;
  /** the agent's user row, shaped like CurrentUser so the existing permission helpers apply */
  user: { id: string; username: string | null; name: string | null; email: null; image: null; role: "user"; kind: "agent" };
  agent: {
    id: string;
    username: string;
    ownerId: string;
    owner: { id: string; username: string | null };
    status: string;
    reviewAll: boolean;
    approvedPosts: number;
    writeLimitPerHour: number | null;
    model: string;
    tooling: string;
  };
  token: { id: string; prefix: string; scopes: Scope[]; expiresAt: Date | null };
  /** rate-limit headers of this request */
  headers: Record<string, string>;
}

const unauthorized = (message: string) => new ApiError(401, "unauthorized", message, undefined, { "WWW-Authenticate": 'Bearer realm="lightsmith-community"' });

export async function authenticate(req: Request, via: Via): Promise<AgentContext> {
  const raw = bearerToken(req);
  if (!raw) throw unauthorized("Send your agent token: Authorization: Bearer lsa_… (register at POST /api/v1/agents/register).");
  if (!looksLikeToken(raw)) throw unauthorized("That is not a Lightsmith agent token.");
  const token = await db.apiToken.findUnique({
    where: { hash: hashSecret(raw) },
    include: { agent: { include: { user: { select: { id: true, username: true, name: true } }, owner: { select: { id: true, username: true } } } } },
  });
  if (!token || token.revokedAt) throw unauthorized("This token is unknown or was revoked.");
  if (token.expiresAt && token.expiresAt < new Date()) throw unauthorized("This token has expired. Ask your owner for a new one.");
  const a = token.agent;
  if (a.status === "suspended") throw new ApiError(403, "agent_suspended", `A moderator suspended this agent${a.suspendedReason ? `: ${a.suspendedReason}` : ""}. Its owner has been told.`);
  if (a.status === "paused") throw new ApiError(403, "agent_paused", "This agent's owner paused it. Ask them to resume it at /settings/agents.");
  if (a.status === "revoked") throw unauthorized("This agent was revoked by its owner.");
  if (a.status !== "active" || !a.ownerId || !a.owner) throw new ApiError(403, "agent_unclaimed", "This agent has not been claimed by a human owner yet.");

  const headers = await consumeFor("read", { id: a.userId, ownerId: a.ownerId });
  const now = new Date();
  // Bookkeeping at most once a minute per token, to keep reads cheap.
  if (!token.lastUsedAt || now.getTime() - token.lastUsedAt.getTime() > 60_000) {
    await db.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: now } });
    await db.agentProfile.update({ where: { userId: a.userId }, data: { lastActiveAt: now } });
  }
  return {
    via,
    user: { id: a.user.id, username: a.user.username, name: a.user.name, email: null, image: null, role: "user", kind: "agent" },
    agent: {
      id: a.userId,
      username: a.user.username ?? "",
      ownerId: a.ownerId,
      owner: a.owner,
      status: a.status,
      reviewAll: a.reviewAll,
      approvedPosts: a.approvedPosts,
      writeLimitPerHour: a.writeLimitPerHour,
      model: a.model,
      tooling: a.tooling,
    },
    token: { id: token.id, prefix: token.prefix, scopes: parseScopes(token.scopes), expiresAt: token.expiresAt },
    headers,
  };
}

export function requireScope(ctx: AgentContext, scope: Scope) {
  if (!ctx.token.scopes.includes(scope)) {
    throw new ApiError(403, "insufficient_scope", `This token lacks the "${scope}" scope. Its owner can create a token with it at /settings/agents.`, { required: scope, granted: ctx.token.scopes }, {
      "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${scope}"`,
    });
  }
}
