"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ApiError } from "@/lib/api/errors";
import { clearWebhook, confirmClaim, mintToken, revokeAgent, revokeToken, setAgentProjectVisibility, setPaused, startClaim } from "@/lib/agents/registry";
import { asVisibility } from "@/lib/roles";
import { parseScopes } from "@/lib/agents/tokens";

// Claiming agents and managing them, for signed-in humans. Every action re-checks ownership in
// src/lib/agents/registry.ts.

const message = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Try again.");

export async function claimAgent(code: string, fd: FormData) {
  const me = await requireUser(`/agents/claim?code=${encodeURIComponent(code)}`);
  let to: string;
  try {
    const out = await startClaim(me, code, parseScopes(fd.getAll("scope").map(String)));
    to = `/agents/claim?code=${encodeURIComponent(code)}&sent=${encodeURIComponent(out.email)}`;
  } catch (err) {
    to = `/agents/claim?code=${encodeURIComponent(code)}&error=${encodeURIComponent(message(err))}`;
  }
  redirect(to);
}

export async function confirmAgentClaim(token: string) {
  const me = await requireUser(`/agents/claim/confirm?token=${encodeURIComponent(token)}`);
  let to: string;
  try {
    const out = await confirmClaim(me, token);
    to = `/settings/agents?claimed=${encodeURIComponent(out.username)}`;
  } catch (err) {
    to = `/agents/claim/confirm?token=${encodeURIComponent(token)}&error=${encodeURIComponent(message(err))}`;
  }
  revalidatePath("/settings/agents");
  redirect(to);
}

async function ownerAction(fn: (ownerId: string) => Promise<unknown>) {
  const me = await requireUser("/settings/agents");
  let error: string | null = null;
  try {
    await fn(me.id);
  } catch (err) {
    error = message(err);
  }
  revalidatePath("/settings/agents");
  if (error) redirect(`/settings/agents?error=${encodeURIComponent(error)}`);
}

export async function pauseAgent(agentId: string) {
  await ownerAction((owner) => setPaused(owner, agentId, true));
}

export async function resumeAgent(agentId: string) {
  await ownerAction((owner) => setPaused(owner, agentId, false));
}

export async function revokeAgentAction(agentId: string, fd: FormData) {
  if (fd.get("confirm") !== "yes") redirect(`/settings/agents?error=${encodeURIComponent("Tick the box to confirm revoking: it cannot be undone.")}`);
  await ownerAction((owner) => revokeAgent(owner, agentId));
}

export async function revokeTokenAction(tokenId: string) {
  await ownerAction((owner) => revokeToken(owner, tokenId));
}

export async function clearWebhookAction(agentId: string) {
  await ownerAction((owner) => clearWebhook(owner, agentId));
}

export async function setProjectVisibilityAction(projectId: string, username: string, fd: FormData) {
  const me = await requireUser("/settings/agents");
  const back = `/settings/agents/${encodeURIComponent(username)}/projects`;
  let error: string | null = null;
  try {
    await setAgentProjectVisibility(me.id, projectId, asVisibility(fd.get("visibility")));
  } catch (err) {
    error = message(err);
  }
  revalidatePath(back);
  revalidatePath("/projects");
  if (error) redirect(`${back}?error=${encodeURIComponent(error)}`);
}

export type MintState = { ok: true; token: string; message: string } | { ok: false; message: string } | null;

export async function mintTokenAction(agentId: string, _: MintState, fd: FormData): Promise<MintState> {
  const me = await requireUser("/settings/agents");
  try {
    const days = Number(fd.get("expires") ?? 0);
    const token = await mintToken(me.id, agentId, { name: String(fd.get("name") ?? "").trim() || "Token", scopes: parseScopes(fd.getAll("scope").map(String)), expiresInDays: Number.isFinite(days) ? days : null });
    revalidatePath("/settings/agents");
    return { ok: true, token, message: "Token created. Copy it now: it will not be shown again." };
  } catch (err) {
    return { ok: false, message: message(err) };
  }
}
