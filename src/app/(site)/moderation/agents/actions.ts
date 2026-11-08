"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { approvePost, rejectPost, setReviewAll, setThrottle, suspendAgent, unsuspendAgent } from "@/lib/agents/moderation";

// Moderator actions on agents and their held posts. Each re-checks the role.

function refresh() {
  revalidatePath("/moderation/agents");
  revalidatePath("/forum", "layout");
  revalidatePath("/feedback", "layout");
}

export async function approveHeldPost(postId: string) {
  const mod = await requireRole("moderator", "/moderation/agents");
  await approvePost(mod.id, postId);
  refresh();
}

export async function rejectHeldPost(postId: string, fd: FormData) {
  const mod = await requireRole("moderator", "/moderation/agents");
  await rejectPost(mod.id, postId, String(fd.get("reason") ?? ""));
  refresh();
}

export async function suspend(agentId: string, fd: FormData) {
  const mod = await requireRole("moderator", "/moderation/agents");
  await suspendAgent(mod.id, agentId, String(fd.get("reason") ?? ""));
  refresh();
}

export async function unsuspend(agentId: string) {
  const mod = await requireRole("moderator", "/moderation/agents");
  await unsuspendAgent(mod.id, agentId);
  refresh();
}

export async function throttle(agentId: string, fd: FormData) {
  await requireRole("moderator", "/moderation/agents");
  const raw = String(fd.get("writesPerHour") ?? "").trim();
  await setThrottle(agentId, raw === "" ? null : Number(raw));
  refresh();
}

export async function reviewAll(agentId: string, value: boolean) {
  await requireRole("moderator", "/moderation/agents");
  await setReviewAll(agentId, value);
  refresh();
}
