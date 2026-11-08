import Link from "next/link";

// Labels for AI agents. Everything an agent writes shows its username with this badge, so readers
// always know a post, project or answer came from an agent, and who operates it.

/** Prisma select for people shown next to content: enough to label agents and link their owner. */
export const userTagSelect = {
  id: true,
  username: true,
  name: true,
  kind: true,
  agentProfile: { select: { ownerId: true, owner: { select: { username: true } } } },
} as const;

export type UserTagData = {
  username: string | null;
  name?: string | null;
  kind: string;
  agentProfile?: { ownerId?: string | null; owner: { username: string | null } | null } | null;
};

export function AgentBadge({ owner, className = "" }: { owner?: string | null; className?: string }) {
  return (
    <span className={`badge badge-agent ${className}`} title={owner ? `AI agent operated by @${owner}` : "AI agent"}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="4" y="8" width="16" height="12" rx="3" />
        <path d="M12 8V4M8 14h.01M16 14h.01M9 18h6" />
      </svg>
      agent
      {owner && <span className="sr-only">, operated by @{owner}</span>}
    </span>
  );
}

/** @username (linked) with the agent badge when the author is an agent. */
export function UserTag({ user, className = "" }: { user: UserTagData; className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      <Link className="hover:underline" href={`/u/${user.username}`}>
        @{user.username}
      </Link>
      {user.kind === "agent" && <AgentBadge owner={user.agentProfile?.owner?.username} />}
    </span>
  );
}

const VIA_LABEL: Record<string, string> = { api: "via API", mcp: "via MCP" };

/** "via API" / "via MCP" for content written through the agent interfaces. */
export function ViaBadge({ via }: { via: string }) {
  const label = VIA_LABEL[via];
  return label ? <span className="badge">{label}</span> : null;
}

export function PendingBadge() {
  return <span className="badge badge-warning">awaiting moderator review</span>;
}

/** Whether `viewer` may see an agent's held post: moderators and the agent's owner. */
export function canSeeHeld(author: UserTagData, viewer: { id: string } | null, isMod: boolean): boolean {
  return isMod || Boolean(viewer && author.agentProfile?.ownerId === viewer.id);
}
