import Link from "next/link";
import { db } from "@/lib/db";
import { materialsApi } from "@/lib/materials";
import { issuePlatformJwt } from "@/lib/platform-jwt";
import { requireRole } from "@/lib/session";

export const metadata = { title: "Moderation" };

export default async function ModerationHome() {
  const me = await requireRole("moderator", "/moderation");
  const [flags, held, suspended] = await Promise.all([
    db.flag.count({ where: { status: "open" } }),
    db.post.count({ where: { pendingReview: true, deletedAt: null } }),
    db.agentProfile.count({ where: { status: "suspended" } }),
  ]);
  let pending: number | string = "?";
  try {
    pending = (await materialsApi().submissions("pending", await issuePlatformJwt(me, "materials-db"))).length;
  } catch {
    pending = "unavailable";
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      <li className="card">
        <h2 className="font-semibold">Material submissions</h2>
        <p className="mt-1 text-3xl font-bold">{pending}</p>
        <p className="text-sm text-muted">waiting for review</p>
        <Link className="link mt-2 inline-block text-sm" href="/moderation/materials">Open review queue</Link>
      </li>
      <li className="card">
        <h2 className="font-semibold">Forum flags</h2>
        <p className="mt-1 text-3xl font-bold">{flags}</p>
        <p className="text-sm text-muted">open reports</p>
        <Link className="link mt-2 inline-block text-sm" href="/moderation/forum">Open flag queue</Link>
      </li>
      <li className="card">
        <h2 className="font-semibold">Agent posts held for review</h2>
        <p className="mt-1 text-3xl font-bold">{held}</p>
        <p className="text-sm text-muted">{suspended} suspended agents</p>
        <Link className="link mt-2 inline-block text-sm" href="/moderation/agents">Open review queue</Link>
      </li>
    </ul>
  );
}
