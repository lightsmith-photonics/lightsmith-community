import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { visibleNotificationFilter } from "@/lib/feedback/visibility";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/roles";
import { signOut } from "@/auth";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { MobileNav } from "./MobileNav";
import { brand } from "@/lib/brand";

const NAV = [
  { href: "/materials", label: "Materials" },
  { href: "/projects", label: "Projects" },
  { href: "/forum", label: "Forum" },
  { href: "/feedback", label: "Feedback" },
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
];

export async function Header() {
  const user = await getCurrentUser();
  const unread = user ? await db.notification.count({ where: { userId: user.id, readAt: null, ...visibleNotificationFilter(user) } }) : 0;
  const isMod = user && hasRole(user.role, "moderator");

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur">
      <div className="container-page flex h-14 items-center gap-4">
        {/* The accessible name is the visible text ("Lightsmith Community"), as WCAG 2.5.3 requires. */}
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo />
          <span>
            {brand.product} <span className="hidden font-normal text-muted sm:inline">{brand.community.replace(brand.product, "").trim()}</span>
          </span>
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex gap-1">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-surface hover:text-fg">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <>
              <Link href="/notifications" className="btn relative !px-2" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-bold leading-5 text-white" aria-hidden>
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
              <details className="relative">
                <summary className="btn list-none">
                  <span className="sr-only">Account menu: </span>
                  <span className="max-w-32 truncate">{user.username ? `@${user.username}` : (user.name ?? "Account")}</span>
                </summary>
                <div className="absolute right-0 mt-1 w-52 rounded-md border border-line bg-bg p-1 shadow-lg">
                  <ul className="text-sm">
                    {user.username && (
                      <li>
                        <Link className="block rounded px-3 py-2 hover:bg-surface" href={`/u/${user.username}`}>
                          Profile
                        </Link>
                      </li>
                    )}
                    <li>
                      <Link className="block rounded px-3 py-2 hover:bg-surface" href="/projects/new">
                        New project
                      </Link>
                    </li>
                    <li>
                      <Link className="block rounded px-3 py-2 hover:bg-surface" href="/settings/profile">
                        Settings
                      </Link>
                    </li>
                    <li>
                      <Link className="block rounded px-3 py-2 hover:bg-surface" href="/settings/agents">
                        My agents
                      </Link>
                    </li>
                    {isMod && (
                      <li>
                        <Link className="block rounded px-3 py-2 hover:bg-surface" href="/moderation">
                          Moderation
                        </Link>
                      </li>
                    )}
                    <li>
                      <form action={doSignOut}>
                        <button className="w-full rounded px-3 py-2 text-left hover:bg-surface" type="submit">
                          Sign out
                        </button>
                      </form>
                    </li>
                  </ul>
                </div>
              </details>
            </>
          ) : (
            <Link href="/signin" className="btn-primary">
              Sign in
            </Link>
          )}
          <MobileNav items={NAV} />
        </div>
      </div>
    </header>
  );
}
