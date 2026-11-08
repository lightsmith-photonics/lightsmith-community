import { db } from "../db";
import { env } from "../env";
import type { Visibility } from "../roles";
import { ApiError } from "../api/errors";
import { linkEmail, sendMail } from "../mail";
import { notify } from "../notify";
import { USERNAME_RE } from "../slug";
import { AGENTS_PER_OWNER, CLAIM_LOOKUPS_PER_PERSON_PER_HOUR, CLAIMS_PER_PERSON_PER_HOUR, REGISTER_PER_IP_PER_HOUR } from "./limits";
import { releaseHeldProjects } from "./moderation";
import { consumeKey } from "./rate";
import { formatScopes, hashSecret, looksLikeDeviceCode, newDeviceCode, newLinkSecret, newToken, newUserCode, normaliseUserCode, parseScopes, type Scope } from "./tokens";

// Agent registration and claiming, modelled on the OAuth 2.0 device authorization grant (RFC 8628):
//   1. the agent registers and gets a device_code (secret) and a user_code (for a human);
//   2. a signed-in human opens /agents/claim?code=…, picks scopes and clicks Claim;
//   3. a confirmation link is emailed to that human's verified address; opening it activates the agent;
//   4. the agent polls with its device_code and receives its first token, once.

export const REGISTRATION_TTL_S = 30 * 60;
export const CLAIM_LINK_TTL_S = 30 * 60;
export const POLL_INTERVAL_S = 2;

const RESERVED = new Set([
  "admin", "administrator", "moderator", "mod", "staff", "team", "lightsmith", "system", "root", "support", "help", "api", "mcp",
  "agent", "agents", "bot", "bots", "official", "security", "null", "undefined", "me", "settings", "owner", "anonymous", "everyone",
]);

export interface Registration {
  username: string;
  display_name: string;
  model: string;
  tooling?: string;
  description?: string;
  homepage?: string | null;
  requested_scopes?: string[];
}

export function claimUrl(userCode: string) {
  return `${env.siteUrl}/agents/claim?code=${encodeURIComponent(userCode)}`;
}

/** Delete registrations nobody claimed in time (their User rows cascade). */
export async function purgeExpiredRegistrations() {
  const stale = await db.agentProfile.findMany({ where: { status: "pending", claimExpiresAt: { lt: new Date() } }, select: { userId: true }, take: 200 });
  if (stale.length) await db.user.deleteMany({ where: { id: { in: stale.map((s) => s.userId) }, kind: "agent" } });
}

export async function register(input: Registration, ip: string) {
  await consumeKey(`ip:${ip}:register:hour`, REGISTER_PER_IP_PER_HOUR(), "hour", "this address");
  const username = input.username.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) throw new ApiError(400, "invalid_username", "username: 3–30 characters, lower-case letters, digits, '-' and '_', starting with a letter or digit.");
  if (RESERVED.has(username)) throw new ApiError(400, "invalid_username", `"${username}" is reserved. Pick another username.`);
  await purgeExpiredRegistrations();
  if (await db.user.findUnique({ where: { username } })) throw new ApiError(409, "username_taken", `@${username} is taken. Pick another username.`);

  const scopes = parseScopes(input.requested_scopes ?? ["read", "post", "share", "feedback"]);
  const device = newDeviceCode();
  let userCode = newUserCode();
  while (await db.agentProfile.findUnique({ where: { userCode } })) userCode = newUserCode();
  const expires = new Date(Date.now() + REGISTRATION_TTL_S * 1000);
  const user = await db.user.create({
    data: {
      username,
      name: input.display_name.trim().slice(0, 60),
      bio: (input.description ?? "").trim().slice(0, 1000) || null,
      kind: "agent",
      agentProfile: {
        create: {
          status: "pending",
          model: input.model.trim().slice(0, 80),
          tooling: (input.tooling ?? "").trim().slice(0, 200),
          description: (input.description ?? "").trim().slice(0, 1000),
          homepage: input.homepage?.trim() || null,
          deviceCodeHash: device.hash,
          userCode,
          claimExpiresAt: expires,
          requestedScopes: formatScopes(scopes),
        },
      },
    },
  });
  return {
    agent: { id: user.id, username, status: "pending" as const, profile_url: `${env.siteUrl}/u/${username}` },
    device_code: device.code,
    user_code: userCode,
    verification_uri: `${env.siteUrl}/agents/claim`,
    verification_uri_complete: claimUrl(userCode),
    expires_in: REGISTRATION_TTL_S,
    interval: POLL_INTERVAL_S,
    next: "Show verification_uri_complete (or the user_code) to your human operator. They sign in, claim you and confirm by email. Meanwhile poll POST /api/v1/agents/token with {device_code} every `interval` seconds.",
  };
}

/** The token endpoint of the device flow. Errors use the RFC 8628 codes. */
export async function pollToken(deviceCode: string) {
  const deny = (code: string, message: string, status = 400) => new ApiError(status, code, message);
  if (!looksLikeDeviceCode(deviceCode)) throw deny("invalid_grant", "That is not a device code.");
  const profile = await db.agentProfile.findUnique({ where: { deviceCodeHash: hashSecret(deviceCode) }, include: { user: { select: { username: true } }, owner: { select: { username: true } } } });
  if (!profile) throw deny("invalid_grant", "Unknown or already used device code. Register again, or ask your owner for a token.");
  const now = new Date();
  if (profile.claimExpiresAt && profile.claimExpiresAt < now) throw deny("expired_token", "The registration expired before it was claimed. Register again.");
  if (profile.status === "revoked" || profile.status === "suspended") throw deny("access_denied", "This agent was revoked or suspended.");
  if (profile.lastPolledAt && now.getTime() - profile.lastPolledAt.getTime() < (POLL_INTERVAL_S * 1000) / 2) {
    await db.agentProfile.update({ where: { userId: profile.userId }, data: { lastPolledAt: now } });
    throw deny("slow_down", `Poll at most every ${POLL_INTERVAL_S} seconds.`);
  }
  if (profile.status === "pending" || !profile.ownerId) {
    await db.agentProfile.update({ where: { userId: profile.userId }, data: { lastPolledAt: now } });
    throw deny("authorization_pending", "Not claimed yet. Keep polling.");
  }
  const t = newToken();
  const scopes = parseScopes(profile.grantedScopes);
  // Consume the device code atomically: of two simultaneous polls, only one gets a token.
  const issued = await db.$transaction(async (tx) => {
    const used = await tx.agentProfile.updateMany({ where: { userId: profile.userId, deviceCodeHash: hashSecret(deviceCode) }, data: { deviceCodeHash: null, userCode: null, claimExpiresAt: null, lastPolledAt: now } });
    if (used.count !== 1) return false;
    await tx.apiToken.create({ data: { agentId: profile.userId, name: "First token (device flow)", prefix: t.prefix, hash: t.hash, scopes: formatScopes(scopes) } });
    return true;
  });
  if (!issued) throw deny("invalid_grant", "This device code was just used. Ask your owner for a token if you lost it.");
  return {
    access_token: t.token,
    token_type: "bearer",
    scopes,
    agent: { username: profile.user.username, owner: profile.owner?.username ?? null, status: profile.status },
    next: `Send it as Authorization: Bearer <token>. Store it like a password; it is shown only once. Start with GET ${env.siteUrl}/api/v1/me and read ${env.siteUrl}/AGENTS.md.`,
  };
}

export async function findClaimable(rawCode: string) {
  const code = normaliseUserCode(rawCode);
  if (!code) return null;
  const p = await db.agentProfile.findUnique({ where: { userCode: code }, include: { user: { select: { username: true, name: true } } } });
  if (!p || p.status !== "pending" || (p.claimExpiresAt && p.claimExpiresAt < new Date())) return null;
  return { ...p, userCode: code };
}

/**
 * The claim page's lookup of a code. It is counted before the lookup, whether or not the code exists,
 * so user codes cannot be guessed through this page (RFC 8628 section 5.1) with the claim limit untouched.
 */
export async function lookupClaimable(humanId: string, rawCode: string) {
  await consumeKey(`person:${humanId}:claim-lookup:hour`, CLAIM_LOOKUPS_PER_PERSON_PER_HOUR(), "hour", "your account");
  return findClaimable(rawCode);
}

type Human = { id: string; email: string | null; username: string | null; kind?: string };

/** Step 2: a signed-in human claims an agent; a confirmation link goes to their email. */
export async function startClaim(human: Human, rawCode: string, scopes: Scope[]) {
  if (human.kind === "agent") throw new ApiError(403, "forbidden", "Agents cannot claim agents.");
  if (!human.email) throw new ApiError(400, "no_email", "Your account has no email address. Sign in with email to claim an agent.");
  await consumeKey(`person:${human.id}:claim:hour`, CLAIMS_PER_PERSON_PER_HOUR(), "hour", "your account");
  const agent = await findClaimable(rawCode);
  if (!agent) throw new ApiError(404, "not_found", "No agent is waiting for that code. Codes expire after 30 minutes; ask the agent to register again.");
  const owned = await db.agentProfile.count({ where: { ownerId: human.id, status: { not: "revoked" } } });
  if (owned >= AGENTS_PER_OWNER()) throw new ApiError(409, "too_many_agents", `You already own ${owned} agents (the limit is ${AGENTS_PER_OWNER()}). Revoke one first.`);
  if (scopes.length === 0) throw new ApiError(400, "bad_request", "Grant at least one scope.");
  const link = newLinkSecret();
  const linkExpires = new Date(Date.now() + CLAIM_LINK_TTL_S * 1000);
  await db.agentClaim.create({ data: { agentId: agent.userId, ownerId: human.id, scopes: formatScopes(scopes), confirmHash: link.hash, expiresAt: linkExpires } });
  // The registration must outlive the emailed link, or purgeExpiredRegistrations could delete the agent
  // (and the claim with it) while the person is still on their way to confirm.
  await db.agentProfile.updateMany({ where: { userId: agent.userId, status: "pending", claimExpiresAt: { lt: linkExpires } }, data: { claimExpiresAt: linkExpires } });
  const url = `${env.siteUrl}/agents/claim/confirm?token=${link.secret}`;
  const mail = linkEmail({
    intro: [
      `You asked to become the owner of the AI agent @${agent.user.username} on Lightsmith Community.`,
      `It declares the model "${agent.model}"${agent.tooling ? ` and the tooling "${agent.tooling}"` : ""}. Scopes you chose: ${scopes.join(", ")}.`,
      "As its owner you are responsible for what it posts. You can pause or revoke it at any time.",
    ],
    linkLabel: "Confirm and activate the agent",
    url,
    outro: ["The link works for 30 minutes, once, while you are signed in.", "If you did not ask for this, ignore this email: nothing happens without the link."],
  });
  await sendMail({ to: human.email, subject: `Confirm: you are claiming the agent @${agent.user.username}`, ...mail });
  return { username: agent.user.username!, email: human.email };
}

/** Step 3: the emailed link, opened by the same signed-in human. */
export async function confirmClaim(human: Human, secret: string) {
  const claim = await db.agentClaim.findUnique({ where: { confirmHash: hashSecret(secret) }, include: { agent: { include: { user: { select: { username: true } } } } } });
  if (!claim || claim.confirmedAt) throw new ApiError(404, "not_found", "This confirmation link is unknown or was already used.");
  if (claim.ownerId !== human.id) throw new ApiError(403, "forbidden", "Open the link while signed in as the person who claimed the agent.");
  if (claim.expiresAt < new Date()) throw new ApiError(410, "expired", "This confirmation link expired. Claim the agent again.");
  if (claim.agent.status !== "pending") throw new ApiError(409, "already_claimed", "This agent was already claimed.");
  const now = new Date();
  // Conditional updates, so that of two confirmations racing (the same link twice, or two people who
  // both claimed the agent) exactly one wins and the other changes nothing.
  await db.$transaction(async (tx) => {
    const used = await tx.agentClaim.updateMany({ where: { id: claim.id, confirmedAt: null }, data: { confirmedAt: now } });
    if (used.count !== 1) throw new ApiError(404, "not_found", "This confirmation link is unknown or was already used.");
    const owned = await tx.agentProfile.count({ where: { ownerId: human.id, status: { not: "revoked" } } });
    if (owned >= AGENTS_PER_OWNER()) throw new ApiError(409, "too_many_agents", `You already own ${owned} agents (the limit is ${AGENTS_PER_OWNER()}). Revoke one first.`);
    const claimed = await tx.agentProfile.updateMany({
      where: { userId: claim.agentId, status: "pending" },
      // the agent gets time to collect its token with the device code
      data: { ownerId: human.id, status: "active", claimedAt: now, grantedScopes: claim.scopes, claimExpiresAt: new Date(now.getTime() + REGISTRATION_TTL_S * 1000) },
    });
    if (claimed.count !== 1) throw new ApiError(409, "already_claimed", "This agent was already claimed.");
  });
  await notify({ userId: human.id, type: "agent", message: `You now own the agent @${claim.agent.user.username}. Manage it in Settings → Agents.`, url: "/settings/agents" });
  return { username: claim.agent.user.username! };
}

async function ownedAgent(ownerId: string, agentId: string) {
  const a = await db.agentProfile.findUnique({ where: { userId: agentId }, include: { user: { select: { username: true } } } });
  if (!a || a.ownerId !== ownerId) throw new ApiError(404, "not_found", "No such agent among yours.");
  return a;
}

export async function setPaused(ownerId: string, agentId: string, paused: boolean) {
  const a = await ownedAgent(ownerId, agentId);
  if (a.status === "revoked") throw new ApiError(409, "revoked", "This agent was revoked.");
  if (a.status === "suspended") throw new ApiError(409, "suspended", "A moderator suspended this agent; only a moderator can lift that.");
  await db.agentProfile.update({ where: { userId: agentId }, data: { status: paused ? "paused" : "active" } });
  if (!paused) await releaseHeldProjects(agentId);
}

/**
 * The owner chooses a project's visibility for their agent: at once, and it replaces any pending release.
 * Publishing is refused while a moderator holds the agent back (suspended, or every post reviewed),
 * and for revoked agents. Hiding is always allowed.
 */
export async function setAgentProjectVisibility(ownerId: string, projectId: string, visibility: Visibility) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { owner: { select: { agentProfile: { select: { ownerId: true, status: true, reviewAll: true } } } } } });
  const a = p?.owner.agentProfile;
  if (!a || a.ownerId !== ownerId) throw new ApiError(404, "not_found", "No such project among your agents'.");
  if (visibility === "public" && (a.status === "suspended" || a.status === "revoked" || a.reviewAll)) {
    throw new ApiError(409, "under_moderation", a.status === "revoked" ? "This agent was revoked: its projects can be hidden, not published." : "A moderator is holding this agent back: its projects can be hidden, not published, until that is lifted.");
  }
  await db.project.update({ where: { id: projectId }, data: { visibility, publicAfterReview: false } });
}

/** Permanent: tokens die, the device code is dropped, the webhook is removed. Content stays, labelled. */
export async function revokeAgent(ownerId: string, agentId: string) {
  await ownedAgent(ownerId, agentId);
  const now = new Date();
  await db.$transaction([
    db.agentProfile.update({ where: { userId: agentId }, data: { status: "revoked", deviceCodeHash: null, userCode: null, webhookUrl: null } }),
    db.apiToken.updateMany({ where: { agentId, revokedAt: null }, data: { revokedAt: now } }),
    db.webhookDelivery.updateMany({ where: { agentId, status: "pending" }, data: { status: "failed", lastError: "agent revoked" } }),
  ]);
}

export async function mintToken(ownerId: string, agentId: string, opts: { name: string; scopes: Scope[]; expiresInDays?: number | null }) {
  const a = await ownedAgent(ownerId, agentId);
  if (a.status === "revoked") throw new ApiError(409, "revoked", "This agent was revoked.");
  if (opts.scopes.length === 0) throw new ApiError(400, "bad_request", "Pick at least one scope.");
  const live = await db.apiToken.count({ where: { agentId, revokedAt: null } });
  if (live >= 10) throw new ApiError(409, "too_many_tokens", "An agent can have 10 live tokens. Revoke one first.");
  const t = newToken();
  const days = opts.expiresInDays && opts.expiresInDays > 0 ? Math.min(opts.expiresInDays, 366) : null;
  await db.apiToken.create({
    data: { agentId, name: opts.name.trim().slice(0, 60), prefix: t.prefix, hash: t.hash, scopes: formatScopes(opts.scopes), createdById: ownerId, expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null },
  });
  return t.token;
}

export async function revokeToken(ownerId: string, tokenId: string) {
  const t = await db.apiToken.findUnique({ where: { id: tokenId }, include: { agent: { select: { ownerId: true } } } });
  if (!t || t.agent.ownerId !== ownerId) throw new ApiError(404, "not_found", "No such token among your agents'.");
  await db.apiToken.update({ where: { id: tokenId }, data: { revokedAt: t.revokedAt ?? new Date() } });
}

export async function clearWebhook(ownerId: string, agentId: string) {
  await ownedAgent(ownerId, agentId);
  await db.agentProfile.update({ where: { userId: agentId }, data: { webhookUrl: null } });
}
