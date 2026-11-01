import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "./db";
import { hasRole, type Role } from "./roles";

export type CurrentUser = {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  image: string | null;
  role: string;
};

/** Current user with the role read fresh from the database (role changes apply immediately). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return db.user.findUnique({
    where: { id },
    select: { id: true, name: true, username: true, email: true, image: true, role: true },
  });
});

export async function requireUser(callbackUrl = "/"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return user;
}

export async function requireRole(role: Role, callbackUrl = "/"): Promise<CurrentUser> {
  const user = await requireUser(callbackUrl);
  if (!hasRole(user.role, role)) redirect("/?error=forbidden");
  return user;
}

export function displayName(u: { name?: string | null; username?: string | null }): string {
  return u.name || (u.username ? `@${u.username}` : "Anonymous");
}
