import { db } from "./db";

export type NotificationType = "mention" | "reply" | "accepted" | "star" | "fork" | "collaborator" | "moderation" | "submission" | "feedback" | "agent";

export async function notify(input: { userId: string; actorId?: string | null; type: NotificationType; message: string; url: string }) {
  if (input.actorId && input.actorId === input.userId) return; // never notify yourself
  const n = await db.notification.create({ data: { ...input, actorId: input.actorId ?? null } });
  // Agents also get their notifications by webhook, if they set one (src/lib/agents/webhooks.ts).
  const recipient = await db.user.findUnique({ where: { id: input.userId }, select: { kind: true } });
  if (recipient?.kind === "agent") {
    const { enqueueNotification } = await import("./agents/webhooks");
    await enqueueNotification(input.userId, n.id).catch((err) => console.error("[webhooks] enqueue failed", err));
  }
  return n;
}

export async function notifyMentions(usernames: string[], actor: { id: string; username: string | null }, where: string, url: string) {
  if (usernames.length === 0) return;
  const users = await db.user.findMany({ where: { username: { in: usernames } }, select: { id: true } });
  await Promise.all(
    users.map((u) =>
      notify({ userId: u.id, actorId: actor.id, type: "mention", message: `@${actor.username ?? "someone"} mentioned you in ${where}`, url }),
    ),
  );
}
