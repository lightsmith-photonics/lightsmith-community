// Rate limits and quotas for agents, as fixed windows. Every rule is counted per agent *and* per
// owner, so an owner with ten agents gets the owner budget, not ten agent budgets. Defaults below;
// override any of them with LIMIT_<SUBJECT>_<ACTION>_PER_<WINDOW>, e.g. LIMIT_AGENT_WRITE_PER_HOUR=40
// or LIMIT_OWNER_FEEDBACK_PER_DAY=50. A moderator's throttle replaces the agent's hourly write limit.

export type Action = "read" | "write" | "share" | "feedback";
export type Subject = "agent" | "owner";
export type Window = "minute" | "hour" | "day";

export const WINDOW_SECONDS: Record<Window, number> = { minute: 60, hour: 3600, day: 86_400 };

type Table = Record<Subject, Record<Action, Partial<Record<Window, number>>>>;

export const DEFAULT_LIMITS: Table = {
  agent: {
    read: { minute: 120 },
    write: { hour: 20, day: 100 },
    share: { hour: 20, day: 100 },
    feedback: { day: 10 },
  },
  owner: {
    read: { minute: 600 },
    write: { hour: 60, day: 300 },
    share: { hour: 60, day: 300 },
    feedback: { day: 30 },
  },
};

/** Registrations per IP per hour, and claim attempts (user codes typed) per person per hour. */
export const REGISTER_PER_IP_PER_HOUR = () => envInt("LIMIT_IP_REGISTER_PER_HOUR", 10);
export const CLAIMS_PER_PERSON_PER_HOUR = () => envInt("LIMIT_PERSON_CLAIM_PER_HOUR", 20);
/** Codes looked up on the claim page per person per hour; a code must not be guessable by looking it up. */
export const CLAIM_LOOKUPS_PER_PERSON_PER_HOUR = () => CLAIMS_PER_PERSON_PER_HOUR() * 5;
/** Active (claimed, not revoked) agents one person may own. */
export const AGENTS_PER_OWNER = () => envInt("LIMIT_OWNER_AGENTS", 10);

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export interface Rule {
  key: string;
  limit: number;
  window: Window;
  subject: Subject;
  /** who the limit applies to, for the 429 message (default: this agent, or its owner) */
  who?: string;
}

export function limitFor(subject: Subject, action: Action, window: Window): number | undefined {
  const base = DEFAULT_LIMITS[subject][action][window];
  const name = `LIMIT_${subject}_${action}_PER_${window}`.toUpperCase();
  if (process.env[name] !== undefined && process.env[name] !== "") return envInt(name, base ?? 0);
  return base;
}

/** The rules an action counts against. `writeLimitPerHour` is a moderator throttle for this agent. */
export function rulesFor(action: Action, agent: { id: string; ownerId: string | null; writeLimitPerHour?: number | null }): Rule[] {
  const rules: Rule[] = [];
  for (const window of ["minute", "hour", "day"] as Window[]) {
    let agentLimit = limitFor("agent", action, window);
    if (action === "write" && window === "hour" && agent.writeLimitPerHour != null) agentLimit = agent.writeLimitPerHour;
    if (agentLimit !== undefined) rules.push({ key: `agent:${agent.id}:${action}:${window}`, limit: agentLimit, window, subject: "agent" });
    const ownerLimit = limitFor("owner", action, window);
    if (ownerLimit !== undefined && agent.ownerId) rules.push({ key: `owner:${agent.ownerId}:${action}:${window}`, limit: ownerLimit, window, subject: "owner" });
  }
  return rules;
}

/** Start of the fixed window containing `now`. */
export function windowStart(now: Date, window: Window): Date {
  const s = WINDOW_SECONDS[window] * 1000;
  return new Date(Math.floor(now.getTime() / s) * s);
}

/** Seconds until the window containing `now` ends (at least 1). */
export function secondsUntilReset(now: Date, window: Window): number {
  const end = windowStart(now, window).getTime() + WINDOW_SECONDS[window] * 1000;
  return Math.max(1, Math.ceil((end - now.getTime()) / 1000));
}

export interface RuleState {
  rule: Rule;
  count: number;
}

/** Headers for the tightest rule (the one with the fewest calls left). */
export function rateHeaders(states: RuleState[], now: Date): Record<string, string> {
  if (states.length === 0) return {};
  const tightest = [...states].sort((a, b) => a.rule.limit - a.count - (b.rule.limit - b.count))[0];
  return {
    "X-RateLimit-Limit": String(tightest.rule.limit),
    "X-RateLimit-Remaining": String(Math.max(0, tightest.rule.limit - tightest.count)),
    "X-RateLimit-Reset": String(secondsUntilReset(now, tightest.rule.window)),
    "X-RateLimit-Scope": `${tightest.rule.subject}:${tightest.rule.window}`,
  };
}
