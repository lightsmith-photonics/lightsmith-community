import { Prisma } from "@prisma/client";
import { db } from "../db";
import { ApiError } from "../api/errors";
import { rateHeaders, rulesFor, secondsUntilReset, windowStart, type Action, type Rule, type RuleState, type Window } from "./limits";

// Fixed-window counters in Postgres (no Redis needed). Each rule is one upsert that increments and
// returns the new count atomically; if any rule is over its limit the increments are undone and the
// call is refused with 429.

async function increment(key: string, start: Date, by: number): Promise<number> {
  const rows = await db.$queryRaw<{ count: number }[]>(Prisma.sql`
    INSERT INTO "RateCounter" ("key", "windowStart", "count") VALUES (${key}, ${start}, ${by})
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateCounter"."count" + ${by}
    RETURNING "count"`);
  return Number(rows[0]?.count ?? 0);
}

/** Count `cost` calls against every rule; throws ApiError(429) if one is exhausted. Returns rate-limit headers. */
export async function consume(rules: Rule[], now = new Date(), cost = 1): Promise<Record<string, string>> {
  const states: RuleState[] = [];
  for (const rule of rules) {
    const count = await increment(rule.key, windowStart(now, rule.window), cost);
    states.push({ rule, count });
    if (count > rule.limit) {
      await Promise.all(states.map((s) => increment(s.rule.key, windowStart(now, s.rule.window), -cost)));
      const retryAfter = secondsUntilReset(now, rule.window);
      const who = rule.who ?? (rule.subject === "owner" ? "this agent's owner (all of their agents together)" : "this agent");
      throw new ApiError(
        429,
        "rate_limited",
        `Rate limit reached: ${rule.limit} per ${rule.window} for ${who}. Try again in ${retryAfter} s.`,
        { limit: rule.limit, window: rule.window, subject: rule.subject, retry_after: retryAfter },
        { "Retry-After": String(retryAfter), ...rateHeaders([{ rule, count: rule.limit }], now) },
      );
    }
  }
  if (Math.random() < 0.01) void cleanup(now);
  return rateHeaders(states, now);
}

/** Count `cost` calls of `action` for an agent (and its owner). */
export function consumeFor(action: Action, agent: { id: string; ownerId: string | null; writeLimitPerHour?: number | null }, cost = 1) {
  return consume(rulesFor(action, agent), new Date(), cost);
}

/** One ad-hoc counter (registrations per IP, claim attempts per person). */
export function consumeKey(key: string, limit: number, window: Window, who: string) {
  return consume([{ key, limit, window, subject: "agent", who }]);
}

/** Current counts for the given rules (dashboard and whoami), without counting a call. */
export async function usage(rules: Rule[], now = new Date()): Promise<{ action: string; subject: string; window: Window; limit: number; used: number; resets_in: number }[]> {
  if (rules.length === 0) return [];
  const rows = await db.rateCounter.findMany({
    where: { OR: rules.map((r) => ({ key: r.key, windowStart: windowStart(now, r.window) })) },
    select: { key: true, count: true },
  });
  const counts = new Map(rows.map((r) => [r.key, r.count]));
  return rules.map((r) => ({
    action: r.key.split(":")[2],
    subject: r.subject,
    window: r.window,
    limit: r.limit,
    used: Math.max(0, counts.get(r.key) ?? 0),
    resets_in: secondsUntilReset(now, r.window),
  }));
}

async function cleanup(now: Date) {
  await db.rateCounter.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 2 * 86_400_000) } } }).catch(() => undefined);
}
