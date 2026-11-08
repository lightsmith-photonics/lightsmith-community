import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const STUDIO = process.env.STUDIO_URL ?? "http://localhost:5173";
const url = (returnTo: string, state = "nonce-123") => `/studio/connect?${new URLSearchParams({ return_to: returnTo, state })}`;

test.describe("Studio sign-in handoff", () => {
  test("signed out, it goes through sign-in and comes back", async ({ page, request }) => {
    const res = await request.get(url(`${STUDIO}/`), { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const location = new URL(res.headers().location);
    expect(location.pathname).toBe("/signin");
    expect(location.searchParams.get("callbackUrl")).toBe(url(`${STUDIO}/`));
    expect(res.headers().location).not.toContain("access_token");

    await signIn(page, "maxwell@example.test", "/");
    const back = await page.request.get(location.searchParams.get("callbackUrl")!, { maxRedirects: 0 });
    expect(back.status()).toBe(302);
    expect(back.headers().location.startsWith(`${STUDIO}/#access_token=`)).toBe(true);
  });

  test("signed in, it hands over a compute token without the moderator role", async ({ page }) => {
    await signIn(page, "maxwell@example.test", "/");
    const res = await page.request.get(url(`${STUDIO}/`), { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers()["cache-control"]).toContain("no-store");
    const location = new URL(res.headers().location);
    expect(location.origin + location.pathname).toBe(`${STUDIO}/`);
    expect(location.search).toBe("");
    const frag = new URLSearchParams(location.hash.slice(1));
    expect(frag.get("state")).toBe("nonce-123");
    expect(frag.get("token_type")).toBe("Bearer");
    expect(frag.get("expires_in")).toBe("3600");
    const claims = JSON.parse(Buffer.from(frag.get("access_token")!.split(".")[1], "base64url").toString());
    expect(claims.aud).toBe("compute");
    expect(claims.role).toBe("user"); // maxwell is a moderator in the seed
    expect(claims.sub).toBeTruthy();
    expect(claims.exp - claims.iat).toBe(3600);
  });

  test("it never redirects to an address it does not know", async ({ page, request }) => {
    await signIn(page, "maxwell@example.test", "/");
    for (const client of [request, page.request]) {
      for (const bad of ["https://evil.test/", `${STUDIO}.evil.test/`, `${STUDIO}/#x`, "javascript:alert(1)", ""]) {
        const res = await client.get(url(bad), { maxRedirects: 0 });
        expect(res.status(), bad).toBe(400);
        expect(res.headers().location, bad).toBeUndefined();
      }
    }
  });

  test("a missing state goes back to Studio as an error, with no token", async ({ page }) => {
    await signIn(page, "maxwell@example.test", "/");
    const res = await page.request.get(`/studio/connect?${new URLSearchParams({ return_to: `${STUDIO}/` })}`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toContain("#error=invalid_request");
    expect(res.headers().location).not.toContain("access_token");
  });
});
