import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:58025";

export async function messagesTo(email: string, limit: number) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=${limit}`);
  return ((await res.json()) as { messages: { ID: string }[] }).messages;
}

/** What Mailpit already holds for `email`; take it before triggering a mail and pass it to mailLink. */
export async function mailSeen(email: string): Promise<Set<string>> {
  return new Set((await messagesTo(email, 50)).map((m) => m.ID));
}

/**
 * The first link matching `pattern` in a message for `email` that is not in `seen`. Going by ids rather
 * than timestamps keeps this independent of the clock difference between the host and the container.
 */
export async function mailLink(email: string, seen: Set<string>, pattern: RegExp): Promise<string> {
  for (let i = 0; i < 80; i++) {
    for (const m of (await messagesTo(email, 5)).filter((m) => !seen.has(m.ID))) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text: string; HTML: string };
      const url = (msg.Text + msg.HTML).match(pattern)?.[0];
      if (url) return url.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no mail for ${email} matching ${pattern} in Mailpit`);
}

/** The magic link in a new message for `email`. */
const magicLink = (email: string, seen: Set<string>) => mailLink(email, seen, /https?:\/\/[^\s"'<>]+\/api\/auth\/callback\/nodemailer\?[^\s"'<>]+/);

/** Sign in with an email magic link, read from Mailpit (the real flow; no test backdoor). */
export async function signIn(page: Page, email: string, callbackUrl = "/") {
  await page.context().clearCookies();
  await page.goto(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  const seen = await mailSeen(email);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await magicLink(email, seen));
  await expect(page.getByRole("link", { name: /^Notifications/ })).toBeVisible();
}

/** WCAG 2.1 A/AA checks with axe-core. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}
