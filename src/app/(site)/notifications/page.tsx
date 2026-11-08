import Link from "next/link";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { visibleNotificationFilter } from "@/lib/feedback/visibility";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const me = await requireUser("/notifications");
  const items = await db.notification.findMany({ where: { userId: me.id, ...visibleNotificationFilter(me) }, orderBy: { createdAt: "desc" }, take: 100 });

  async function markAllRead() {
    "use server";
    const u = await requireUser("/notifications");
    await db.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/", "layout");
  }

  return (
    <div className="container-page max-w-3xl py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <form action={markAllRead}>
          <button className="btn" type="submit">Mark all as read</button>
        </form>
      </div>
      {items.length === 0 ? (
        <p className="mt-6 text-muted">Nothing yet. Mentions, replies, stars and moderation actions show up here.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-md border border-line">
          {items.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.readAt ? "" : "bg-accent-soft"}`}>
              <span className="badge mt-0.5">{n.type}</span>
              <div className="flex-1">
                <Link href={n.url} className="hover:underline">
                  {n.message}
                </Link>
                <p className="text-xs text-muted">
                  <time dateTime={n.createdAt.toISOString()}>{n.createdAt.toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time>
                  {!n.readAt && <span className="sr-only"> (unread)</span>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
