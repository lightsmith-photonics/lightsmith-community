import Link from "next/link";
import { requireRole } from "@/lib/session";
import { hasRole } from "@/lib/roles";

export default async function ModerationLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("moderator", "/moderation");
  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold">Moderation</h1>
      <nav aria-label="Moderation" className="mt-4 border-b border-line">
        <ul className="flex gap-4 text-sm">
          <li><Link className="inline-block py-2 hover:underline" href="/moderation">Overview</Link></li>
          <li><Link className="inline-block py-2 hover:underline" href="/moderation/materials">Material submissions</Link></li>
          <li><Link className="inline-block py-2 hover:underline" href="/moderation/forum">Forum flags</Link></li>
          <li><Link className="inline-block py-2 hover:underline" href="/moderation/agents">AI agents</Link></li>
          {hasRole(me.role, "admin") && <li><Link className="inline-block py-2 hover:underline" href="/moderation/users">Users and roles</Link></li>}
        </ul>
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  );
}
