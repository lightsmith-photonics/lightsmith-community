import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiError } from "@/lib/api/errors";

// Claim and webhook flows whose correctness depends on what the database answers when two callers
// race. The database is a small fake, so each race can be replayed exactly.

const fake = vi.hoisted(() => ({
  agentClaim: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  agentProfile: { findUnique: vi.fn(), count: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  project: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  webhookDelivery: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  rateCounter: { deleteMany: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
const notify = vi.hoisted(() => vi.fn());
const sendMail = vi.hoisted(() => vi.fn());
const postJson = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db: fake }));
vi.mock("@/lib/notify", () => ({ notify }));
vi.mock("@/lib/mail", () => ({ sendMail, linkEmail: () => ({ text: "link", html: "<a>link</a>" }) }));
vi.mock("@/lib/agents/outbound", () => ({ postJson, guardedLookup: () => undefined }));

const { confirmClaim, lookupClaimable, setAgentProjectVisibility, startClaim } = await import("@/lib/agents/registry");
const { releaseHeldProjects, setReviewAll } = await import("@/lib/agents/moderation");
const { canContribute, canViewProject } = await import("@/lib/roles");
const { consumeKey } = await import("@/lib/agents/rate");
const { deliver } = await import("@/lib/agents/webhooks");
const { suspendAgent, unsuspendAgent } = await import("@/lib/agents/moderation");

const human = { id: "h1", email: "h1@example.test", username: "h1" };
const claim = { id: "c1", agentId: "a1", ownerId: "h1", scopes: "read", confirmedAt: null, expiresAt: new Date(Date.now() + 60_000), agent: { status: "pending", user: { username: "bot" } } };

beforeEach(() => {
  vi.clearAllMocks();
  fake.$transaction.mockImplementation((fn: (tx: typeof fake) => unknown) => fn(fake));
  fake.$queryRaw.mockResolvedValue([{ count: 1 }]);
});

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as ApiError).code;
  }
  return "ok";
};

describe("confirming a claim", () => {
  beforeEach(() => {
    fake.agentClaim.findUnique.mockResolvedValue(claim);
    fake.agentClaim.updateMany.mockResolvedValue({ count: 1 });
    fake.agentProfile.count.mockResolvedValue(0);
    fake.agentProfile.updateMany.mockResolvedValue({ count: 1 });
  });

  it("activates the agent for the person who claimed it", async () => {
    await expect(confirmClaim(human, "secret")).resolves.toEqual({ username: "bot" });
    expect(fake.agentProfile.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "a1", status: "pending" }, data: expect.objectContaining({ ownerId: "h1", status: "active", grantedScopes: "read" }) }));
    expect(notify).toHaveBeenCalledOnce();
  });

  it("gives the agent to one person when two confirmations race", async () => {
    // both read status "pending"; the other transaction committed first
    fake.agentProfile.updateMany.mockResolvedValue({ count: 0 });
    expect(await codeOf(confirmClaim(human, "secret"))).toBe("already_claimed");
    expect(notify).not.toHaveBeenCalled();
  });

  it("uses a link once when it is opened twice at the same moment", async () => {
    fake.agentClaim.updateMany.mockResolvedValue({ count: 0 });
    expect(await codeOf(confirmClaim(human, "secret"))).toBe("not_found");
    expect(fake.agentProfile.updateMany).not.toHaveBeenCalled();
  });

  it("re-checks the owner's agent limit when several claims are confirmed", async () => {
    fake.agentProfile.count.mockResolvedValue(10);
    expect(await codeOf(confirmClaim(human, "secret"))).toBe("too_many_agents");
    expect(fake.agentProfile.updateMany).not.toHaveBeenCalled();
  });

  it("refuses somebody else's link and expired links", async () => {
    expect(await codeOf(confirmClaim({ ...human, id: "h2" }, "secret"))).toBe("forbidden");
    fake.agentClaim.findUnique.mockResolvedValue({ ...claim, expiresAt: new Date(Date.now() - 1000) });
    expect(await codeOf(confirmClaim(human, "secret"))).toBe("expired");
  });
});

describe("starting a claim", () => {
  it("keeps the registration alive for as long as the emailed link works", async () => {
    const soon = new Date(Date.now() + 60_000); // one minute of the registration left
    fake.agentProfile.findUnique.mockResolvedValue({ userId: "a1", status: "pending", claimExpiresAt: soon, model: "m", tooling: "", user: { username: "bot", name: "Bot" } });
    fake.agentProfile.count.mockResolvedValue(0);
    fake.agentClaim.create.mockResolvedValue({ id: "c1" });
    fake.agentProfile.updateMany.mockResolvedValue({ count: 1 });
    await startClaim(human, "BCDF-GHJK", ["read"]);
    const linkExpires = fake.agentClaim.create.mock.calls[0][0].data.expiresAt as Date;
    expect(linkExpires.getTime()).toBeGreaterThan(soon.getTime());
    expect(fake.agentProfile.updateMany).toHaveBeenCalledWith({ where: { userId: "a1", status: "pending", claimExpiresAt: { lt: linkExpires } }, data: { claimExpiresAt: linkExpires } });
    expect(sendMail).toHaveBeenCalledOnce();
  });
});

describe("looking up a claim code", () => {
  it("counts every lookup, and over the limit answers nothing about the code", async () => {
    fake.agentProfile.findUnique.mockResolvedValue({ status: "pending", claimExpiresAt: new Date(Date.now() + 60_000), user: { username: "bot", name: "Bot" } });
    await expect(lookupClaimable("h1", "BCDF-GHJK")).resolves.toMatchObject({ userCode: "BCDF-GHJK" });
    expect(fake.$queryRaw).toHaveBeenCalledOnce();

    fake.agentProfile.findUnique.mockClear();
    fake.$queryRaw.mockResolvedValue([{ count: 1000 }]);
    expect(await codeOf(lookupClaimable("h1", "BCDF-GHJK"))).toBe("rate_limited");
    expect(fake.agentProfile.findUnique).not.toHaveBeenCalled();
  });

  it("names who hit a limit that is not an agent's", async () => {
    fake.$queryRaw.mockResolvedValue([{ count: 21 }]);
    await expect(consumeKey("person:h1:claim:hour", 20, "hour", "your account")).rejects.toThrow(/20 per hour for your account/);
  });
});

describe("projects shared during review", () => {
  const profile = (over: object) => ({ status: "active", reviewAll: false, approvedPosts: 3, ownerId: "h1", user: { username: "bot" }, ...over });

  beforeEach(() => {
    fake.project.updateMany.mockResolvedValue({ count: 2 });
  });

  it("become public when the review has passed, and agent and owner hear about it", async () => {
    fake.agentProfile.findUnique.mockResolvedValue(profile({}));
    await expect(releaseHeldProjects("a1")).resolves.toBe(2);
    expect(fake.project.updateMany).toHaveBeenCalledWith({ where: { ownerId: "a1", publicAfterReview: true }, data: { visibility: "public", publicAfterReview: false } });
    expect(notify.mock.calls.map((c) => c[0].userId)).toEqual(["a1", "h1"]);
  });

  it("stay unlisted while the agent is in review, paused or suspended", async () => {
    for (const over of [{ approvedPosts: 0 }, { reviewAll: true }, { status: "paused" }, { status: "suspended" }]) {
      fake.agentProfile.findUnique.mockResolvedValue(profile(over));
      await expect(releaseHeldProjects("a1"), JSON.stringify(over)).resolves.toBe(0);
    }
    expect(fake.project.updateMany).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("are released when a moderator stops reviewing every post, not when one starts", async () => {
    fake.agentProfile.update.mockResolvedValue({});
    fake.agentProfile.findUnique.mockResolvedValue(profile({}));
    await setReviewAll("a1", true);
    expect(fake.project.updateMany).not.toHaveBeenCalled();
    await setReviewAll("a1", false);
    expect(fake.project.updateMany).toHaveBeenCalledOnce();
  });
});

describe("the owner choosing a project's visibility", () => {
  const project = (over: object) => ({ owner: { agentProfile: { ownerId: "h1", status: "active", reviewAll: false, ...over } } });

  it("applies at once and replaces a waiting release", async () => {
    fake.project.findUnique.mockResolvedValue(project({}));
    await setAgentProjectVisibility("h1", "p1", "private");
    expect(fake.project.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { visibility: "private", publicAfterReview: false } });
    await setAgentProjectVisibility("h1", "p1", "public");
    expect(fake.project.update).toHaveBeenLastCalledWith({ where: { id: "p1" }, data: { visibility: "public", publicAfterReview: false } });
  });

  it("is only for the agent's owner, and never for people's own projects", async () => {
    fake.project.findUnique.mockResolvedValue(project({}));
    expect(await codeOf(setAgentProjectVisibility("someone-else", "p1", "private"))).toBe("not_found");
    fake.project.findUnique.mockResolvedValue({ owner: { agentProfile: null } }); // a person's project
    expect(await codeOf(setAgentProjectVisibility("h1", "p1", "private"))).toBe("not_found");
    fake.project.findUnique.mockResolvedValue(null);
    expect(await codeOf(setAgentProjectVisibility("h1", "p1", "private"))).toBe("not_found");
    expect(fake.project.update).not.toHaveBeenCalled();
  });

  it("cannot publish while a moderator holds the agent back or after it was revoked, but can always hide", async () => {
    for (const over of [{ reviewAll: true }, { status: "suspended" }, { status: "revoked" }]) {
      fake.project.findUnique.mockResolvedValue(project(over));
      expect(await codeOf(setAgentProjectVisibility("h1", "p1", "public")), JSON.stringify(over)).toBe("under_moderation");
      await expect(setAgentProjectVisibility("h1", "p1", "unlisted")).resolves.toBeUndefined();
    }
    expect(fake.project.update).toHaveBeenCalledTimes(3);
  });

  it("lets that person see their agent's private projects, and nobody else's", () => {
    const owned = { visibility: "private", ownerId: "a1", owner: { agentProfile: { ownerId: "h1" } } };
    expect(canViewProject(owned, { id: "h1", role: "user" })).toBe(true);
    expect(canViewProject(owned, { id: "h2", role: "user" })).toBe(false);
    expect(canViewProject(owned, null)).toBe(false);
    expect(canViewProject({ visibility: "private", ownerId: "a1" }, { id: "h1", role: "user" })).toBe(false); // without the data, closed
    expect(canContribute(owned, { id: "h1", role: "user" })).toBe(false); // seeing is not editing
  });
});

describe("suspending an agent", () => {
  const profile = (status: string, statusBeforeSuspension: string | null = null) => ({ userId: "a1", status, statusBeforeSuspension, ownerId: "h1", reviewAll: false, approvedPosts: 3, user: { username: "bot" } });
  const updated = () => fake.agentProfile.update.mock.calls.at(-1)![0].data;

  it("remembers the status it interrupts, also when suspended twice", async () => {
    fake.agentProfile.findUnique.mockResolvedValue(profile("paused"));
    await suspendAgent("m1", "a1", "spam");
    expect(updated()).toMatchObject({ status: "suspended", statusBeforeSuspension: "paused" });
    fake.agentProfile.findUnique.mockResolvedValue(profile("suspended", "paused"));
    await suspendAgent("m1", "a1", "more spam");
    expect(updated()).toMatchObject({ status: "suspended", statusBeforeSuspension: "paused" });
  });

  it("goes back to that status when the suspension is lifted", async () => {
    fake.agentProfile.findUnique.mockResolvedValue(profile("suspended", "paused"));
    await unsuspendAgent("m1", "a1");
    expect(updated()).toMatchObject({ status: "paused", statusBeforeSuspension: null, suspendedAt: null });
    expect(notify.mock.calls.at(-1)![0].message).toMatch(/stays paused/);
    fake.agentProfile.findUnique.mockResolvedValue(profile("suspended", "active"));
    await unsuspendAgent("m1", "a1");
    expect(updated()).toMatchObject({ status: "active" });
  });

  it("falls back to active for agents suspended before this was recorded", async () => {
    fake.agentProfile.findUnique.mockResolvedValue(profile("suspended", null));
    await unsuspendAgent("m1", "a1");
    expect(updated()).toMatchObject({ status: "active" });
  });
});

describe("delivering a webhook", () => {
  const delivery = { id: "d1", status: "pending", attempts: 1, event: "ping", payload: {}, createdAt: new Date(), agent: { userId: "a1", status: "active", webhookUrl: "https://hook.example.org/x", webhookVersion: 0 } };

  beforeEach(() => {
    process.env.AGENT_WEBHOOK_ALLOW_PRIVATE = "true";
    fake.webhookDelivery.findUnique.mockResolvedValue(delivery);
  });

  it("makes each attempt once when a sweep and the cron pick it up together", async () => {
    fake.webhookDelivery.updateMany.mockResolvedValue({ count: 0 }); // the other caller holds the lease
    await expect(deliver("d1")).resolves.toEqual({ status: "pending" });
    expect(postJson).not.toHaveBeenCalled();
    expect(fake.webhookDelivery.update).not.toHaveBeenCalled();
  });

  it("leases the attempt before it sends, and schedules the next one on failure", async () => {
    fake.webhookDelivery.updateMany.mockResolvedValue({ count: 1 });
    postJson.mockResolvedValue(500);
    await expect(deliver("d1")).resolves.toMatchObject({ status: "pending", httpStatus: 500 });
    expect(fake.webhookDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "d1", status: "pending", attempts: 1 }) }));
    const next = fake.webhookDelivery.update.mock.calls[0][0].data;
    expect(next).toMatchObject({ attempts: 2, status: "pending", lastStatus: 500 });
    expect((next.nextAttemptAt as Date).getTime()).toBeGreaterThan(Date.now() + 100_000); // the second backoff step is 120 s
  });
});
