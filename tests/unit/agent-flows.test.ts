import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiError } from "@/lib/api/errors";

// Claim and webhook flows whose correctness depends on what the database answers when two callers
// race. The database is a small fake, so each race can be replayed exactly.

const fake = vi.hoisted(() => ({
  agentClaim: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  agentProfile: { findUnique: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
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

const { confirmClaim, lookupClaimable, startClaim } = await import("@/lib/agents/registry");
const { consumeKey } = await import("@/lib/agents/rate");
const { deliver } = await import("@/lib/agents/webhooks");

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
