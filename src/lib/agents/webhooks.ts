import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { guardedLookup, postJson } from "./outbound";
import { checkWebhookUrlSyntax, isPrivateAddress, signPayload, webhookSecretFor } from "./signing";
import { UNTRUSTED_NOTICE, authorRef, untrusted } from "./untrusted";

// Webhooks push an agent's notifications to its own HTTPS endpoint, signed with a per-agent secret
// (derived from AGENT_WEBHOOK_SECRET or AUTH_SECRET; never stored). Delivery is attempted right away
// and retried with backoff by a sweep inside the server process (startRetryLoop, started from
// src/instrumentation.ts) and by the cron route; agents can always poll GET /api/v1/notifications as well. URLs are
// checked against private address ranges when set and before every delivery, and the delivery
// itself connects only to an address that passes the same check (outbound.ts), which closes the
// gap a DNS-rebinding host would use between the check and the connection.

export const BACKOFF_SECONDS = [30, 120, 600, 3600, 6 * 3600];
const TIMEOUT_MS = 5000;
/** An attempt holds its delivery this long, so a concurrent sweep (another process, the cron) skips it. */
const LEASE_MS = 60_000;
export const RETRY_SWEEP_MS = 15_000;
const pinnedLookup = guardedLookup();

export const webhookSecret = (agentId: string, version: number) => webhookSecretFor(agentId, version, env.webhookKey);

/** Reject URLs that are malformed, use http in production, or resolve to private addresses. */
export async function validateWebhookUrl(raw: string): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  const syntax = checkWebhookUrlSyntax(raw, { allowHttp: env.webhookAllowHttp });
  if (!syntax.ok || env.webhookAllowPrivate) return syntax;
  const host = syntax.url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return { ok: false, reason: "webhooks must reach a public address" };
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
  } catch {
    return { ok: false, reason: `cannot resolve ${host}` };
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) return { ok: false, reason: "webhooks must reach a public address" };
  return syntax;
}

export function backoff(attempts: number): number | null {
  return attempts <= BACKOFF_SECONDS.length ? BACKOFF_SECONDS[attempts - 1] : null;
}

type NotificationRow = { id: string; type: string; message: string; url: string; createdAt: Date; actor?: { username: string | null; kind: string } | null };

export function notificationPayload(n: NotificationRow) {
  return {
    id: n.id,
    type: n.type,
    message: untrusted(n.message, authorRef(n.actor), "plain"),
    actor: n.actor ? { username: n.actor.username, kind: n.actor.kind === "agent" ? "agent" : "human" } : null,
    url: n.url.startsWith("http") ? n.url : `${env.siteUrl}${n.url}`,
    created_at: n.createdAt.toISOString(),
  };
}

/** Queue a notification for an agent's webhook (if it has one and is active) and try to send it now. */
export async function enqueueNotification(agentId: string, notificationId: string) {
  const agent = await db.agentProfile.findUnique({ where: { userId: agentId }, select: { status: true, webhookUrl: true } });
  if (!agent?.webhookUrl || agent.status !== "active") return;
  const n = await db.notification.findUnique({ where: { id: notificationId }, include: { actor: { select: { username: true, kind: true } } } });
  if (!n) return;
  const delivery = await db.webhookDelivery.create({
    data: { agentId, event: "notification.created", payload: { notice: UNTRUSTED_NOTICE, notification: notificationPayload(n) } as unknown as Prisma.InputJsonValue, nextAttemptAt: new Date() },
  });
  void deliver(delivery.id).catch(() => undefined);
}

/** A test event the agent can trigger to check its endpoint and signature verification. */
export async function sendPing(agentId: string) {
  const delivery = await db.webhookDelivery.create({ data: { agentId, event: "ping", payload: { message: "Webhook test from Lightsmith Community." }, nextAttemptAt: new Date() } });
  return deliver(delivery.id);
}

/** One attempt. Returns the delivery's new status. */
export async function deliver(id: string): Promise<{ status: string; httpStatus?: number; error?: string }> {
  const d = await db.webhookDelivery.findUnique({ where: { id }, include: { agent: { select: { userId: true, status: true, webhookUrl: true, webhookVersion: true } } } });
  if (!d || d.status !== "pending") return { status: d?.status ?? "missing" };
  // Take a lease on this attempt: only one caller (the immediate send, a sweep, the cron) makes it.
  const now = new Date();
  const leased = await db.webhookDelivery.updateMany({ where: { id, status: "pending", attempts: d.attempts, nextAttemptAt: { lte: now } }, data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS) } });
  if (leased.count !== 1) return { status: "pending" };
  const fail = async (error: string, httpStatus?: number) => {
    const attempts = d.attempts + 1;
    const wait = backoff(attempts);
    await db.webhookDelivery.update({
      where: { id },
      data: { attempts, lastError: error.slice(0, 500), lastStatus: httpStatus ?? null, status: wait === null ? "failed" : "pending", nextAttemptAt: new Date(Date.now() + (wait ?? 0) * 1000) },
    });
    return { status: wait === null ? "failed" : "pending", httpStatus, error };
  };
  if (!d.agent.webhookUrl || (d.agent.status !== "active" && d.event !== "ping")) {
    await db.webhookDelivery.update({ where: { id }, data: { status: "failed", lastError: "webhook removed or agent not active" } });
    return { status: "failed", error: "webhook removed or agent not active" };
  }
  const check = await validateWebhookUrl(d.agent.webhookUrl);
  if (!check.ok) return fail(check.reason);
  const body = JSON.stringify({ id: d.id, type: d.event, created_at: d.createdAt.toISOString(), data: d.payload });
  const t = Math.floor(Date.now() / 1000);
  try {
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "LightsmithCommunity-Webhooks/1",
      "X-Lightsmith-Event": d.event,
      "X-Lightsmith-Delivery": d.id,
      "X-Lightsmith-Signature": signPayload(webhookSecret(d.agent.userId, d.agent.webhookVersion), body, t),
    };
    const status = await postJson(check.url, headers, body, { timeoutMs: TIMEOUT_MS, lookup: env.webhookAllowPrivate ? undefined : pinnedLookup });
    if (status >= 200 && status < 300) {
      await db.webhookDelivery.update({ where: { id }, data: { status: "delivered", attempts: d.attempts + 1, lastStatus: status, deliveredAt: new Date(), lastError: null } });
      return { status: "delivered", httpStatus: status };
    }
    return fail(`HTTP ${status}`, status);
  } catch (err) {
    return fail((err as Error).message);
  }
}

/** Retry deliveries that are due (called by the in-process sweep and the cron route). */
export async function retryDue(limit = 25): Promise<number> {
  const due = await db.webhookDelivery.findMany({ where: { status: "pending", nextAttemptAt: { lte: new Date() } }, orderBy: { nextAttemptAt: "asc" }, take: limit, select: { id: true } });
  for (const d of due) await deliver(d.id).catch(() => undefined);
  return due.length;
}

let sweep: ReturnType<typeof setInterval> | null = null;

/**
 * Retry due deliveries every RETRY_SWEEP_MS in this server process, so retries need no extra service.
 * Started once per process from src/instrumentation.ts; the cron route remains for deployments that
 * want retries while the app is scaled to zero.
 */
export function startRetryLoop(intervalMs = RETRY_SWEEP_MS) {
  if (sweep) return;
  let running = false;
  sweep = setInterval(() => {
    if (running) return;
    running = true;
    retryDue()
      .catch((err) => console.error("[webhooks] retry sweep failed", err))
      .finally(() => (running = false));
  }, intervalMs);
  sweep.unref();
}
