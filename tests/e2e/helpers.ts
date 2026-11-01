import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:58025";

/** Latest magic link Mailpit received for `email` after `since`. */
async function magicLink(email: string, since: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=5`);
    const body = (await res.json()) as { messages: { ID: string; Created: string }[] };
    const fresh = body.messages.find((m) => Date.parse(m.Created) >= since - 2000);
    if (fresh) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()) as { Text: string; HTML: string };
      const url = (msg.Text + msg.HTML).match(/https?:\/\/[^\s"'<>]+\/api\/auth\/callback\/nodemailer\?[^\s"'<>]+/)?.[0];
      if (url) return url.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no magic link for ${email} in Mailpit`);
}

/** Sign in with an email magic link, read from Mailpit (the real flow; no test backdoor). */
export async function signIn(page: Page, email: string, callbackUrl = "/") {
  await page.context().clearCookies();
  await page.goto(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  const since = Date.now();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await magicLink(email, since));
  await expect(page.getByRole("link", { name: /^Notifications/ })).toBeVisible();
}

/** WCAG 2.1 A/AA checks with axe-core. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}
