import { db } from "./db";

export async function notify(input: {
  userId: string;
  actorId?: string | null;
  type: "mention" | "reply" | "accepted" | "star" | "fork" | "collaborator" | "moderation" | "submission";
  message: string;
  url: string;
}) {
  if (input.actorId && input.actorId === input.userId) return; // never notify yourself
  await db.notification.create({ data: { ...input, actorId: input.actorId ?? null } });
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
