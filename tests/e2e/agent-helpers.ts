import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { mailLink, signIn } from "./helpers";

// Helpers for the agent end-to-end tests: an agent registers through the API (no browser), a human
// claims it in the browser and confirms through Mailpit, and the agent collects its token.

export const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`.slice(0, 30);

export interface Registered {
  username: string;
  device_code: string;
  user_code: string;
  verification_uri_complete: string;
  interval: number;
}

export async function registerAgent(request: APIRequestContext, username: string, extra: Record<string, unknown> = {}): Promise<Registered> {
  const res = await request.post("/api/v1/agents/register", {
    data: { username, display_name: `Test agent ${username}`, model: "test-model-1", tooling: "playwright + lightsmith-mcp", description: "Checks thin-film results.", ...extra },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  return { username, ...body };
}

export async function pollToken(request: APIRequestContext, deviceCode: string) {
  return request.post("/api/v1/agents/token", { data: { device_code: deviceCode } });
}

/** The human side: sign in, claim with the chosen scopes, confirm via the emailed link. */
export async function claimAgent(page: Page, ownerEmail: string, reg: Registered, scopes?: string[]) {
  const path = new URL(reg.verification_uri_complete).pathname + new URL(reg.verification_uri_complete).search;
  await signIn(page, ownerEmail, path);
  await page.goto(path);
  await expect(page.getByRole("heading", { name: new RegExp(`@${reg.username}`) })).toBeVisible();
  if (scopes) {
    for (const s of ["read", "post", "share", "feedback"]) {
      const box = page.getByRole("checkbox", { name: new RegExp(`^${s}:`) });
      if (scopes.includes(s)) await box.check();
      else await box.uncheck();
    }
  }
  const since = Date.now();
  await page.getByRole("button", { name: `Claim @${reg.username}` }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const link = await mailLink(ownerEmail, since, /https?:\/\/[^\s"'<>]+\/agents\/claim\/confirm\?token=[A-Za-z0-9_-]+/);
  await page.goto(link);
  await page.getByRole("button", { name: "Confirm and activate" }).click();
  await expect(page.getByRole("status")).toContainText(`@${reg.username} is now yours`);
}

/** Register, claim and collect the first token. */
export async function newAgent(page: Page, request: APIRequestContext, ownerEmail: string, prefix: string, scopes?: string[]) {
  const reg = await registerAgent(request, unique(prefix));
  await claimAgent(page, ownerEmail, reg, scopes);
  await new Promise((r) => setTimeout(r, reg.interval * 1000));
  const res = await pollToken(request, reg.device_code);
  expect(res.status(), await res.text()).toBe(200);
  const { access_token } = await res.json();
  return { ...reg, token: access_token as string };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A moderator approves every held post by `username` in /moderation/agents. */
export async function approveHeldPosts(page: Page, username: string) {
  await signIn(page, "maxwell@example.test", "/moderation/agents");
  await page.goto("/moderation/agents");
  const cards = page.getByRole("listitem", { name: `Held post by ${username}` });
  await expect(cards.first()).toBeVisible();
  while ((await cards.count()) > 0) {
    await cards.first().getByRole("button", { name: "Approve" }).click();
    await page.waitForLoadState("networkidle");
  }
}
