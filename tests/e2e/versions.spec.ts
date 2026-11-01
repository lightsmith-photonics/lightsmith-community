import { expect, test } from "@playwright/test";
import { expectAccessible, signIn } from "./helpers";
import layerStack from "../../fixtures/demo/layer_stack.spec.json";

test.describe("project versions", () => {
  test("create, edit, diff, restore and fork a version", async ({ page, request }) => {
    test.setTimeout(180_000);
    // create: v1
    await signIn(page, "e2e-versions@example.test", "/projects/new");
    await page.goto("/projects/new");
    await page.getByLabel("Title").fill("E2E versioned AR coating");
    await page.getByLabel("Spec name").fill("ar-film");
    await page.getByLabel("Problem JSON").fill(JSON.stringify(layerStack));
    await expect(page.getByText(/^Valid thin films problem/)).toBeVisible();
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "E2E versioned AR coating" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Current version v1" })).toBeVisible();
    const slug = new URL(page.url()).pathname.split("/")[2];
    const card = page.locator("li.card", { hasText: "ar-film" }).first();
    await card.getByRole("button", { name: "Run" }).click();
    await expect(page.getByText("Result saved to this project.")).toBeVisible({ timeout: 30_000 });

    // edit: v2, with a message, and run it
    await page.reload();
    await card.getByText("Edit", { exact: true }).click();
    const thicker = structuredClone(layerStack);
    thicker.layers[0].thickness_nm = 150;
    await card.getByLabel("Problem JSON").fill(JSON.stringify(thicker));
    await card.getByLabel(/Version message/).fill("Thicker MgF2 layer");
    await card.getByRole("button", { name: "Update spec" }).click();
    await expect(card.getByRole("status")).toHaveText("Spec updated: saved as v2.");
    await page.reload();
    await expect(page.getByRole("link", { name: "Current version v2" })).toBeVisible();
    await page.locator("li.card", { hasText: "ar-film" }).first().getByRole("button", { name: "Run" }).click();
    await expect(page.getByText("Result saved to this project.")).toBeVisible({ timeout: 30_000 });

    // history
    await page.goto(`/p/${slug}/versions`);
    await expect(page.locator("#v2")).toContainText("Thicker MgF2 layer");
    await expect(page.locator("#v2")).toContainText("current");
    await expect(page.locator("#v1")).toContainText("Initial version");
    await expectAccessible(page);

    // diff: structured spec change with units, and the spectra overlaid
    await page.getByRole("button", { name: "Compare" }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${slug}/diff\\?from=1&to=2`));
    const row = page.getByRole("row", { name: /layers\[0\]\.thickness_nm/ });
    await expect(row).toContainText("100 nm");
    await expect(row).toContainText("150 nm");
    await expect(row).toContainText("+50 nm (+50 %)");
    await expect(page.getByRole("img", { name: /Power fraction against Wavelength/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Dashed: v1. Solid: v2.")).toBeVisible();
    await expectAccessible(page);
    const diff = await (await request.get(`/api/projects/${slug}/diff?from=1&to=2`)).json();
    expect(diff.specs[0].entries).toEqual([expect.objectContaining({ path: "layers[0].thickness_nm", before: 100, after: 150, unit: "nm", delta: 50 })]);

    // restore v1 as v3; its result comes back with it
    await page.goto(`/p/${slug}/v/1`);
    await expect(page.getByText("This is an earlier version.")).toBeVisible();
    await page.getByRole("button", { name: "Restore v1 as a new version" }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${slug}/v/3$`));
    await expect(page.getByText("restored from")).toBeVisible();
    await expect(page.getByText("current version")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Results (1)" })).toBeVisible();
    const v3 = await (await request.get(`/api/projects/${slug}/versions/3`)).json();
    expect(v3.specs[0].problem.layers[0].thickness_nm).toBe(100);
    expect(v3.restored_from).toBe(1);
    await expect(page.getByRole("link", { name: "Open ar-film v3 in Studio" })).toHaveAttribute("href", /\?spec=/);

    // others can read a public project's versions but not create them
    await signIn(page, "e2e-version-forker@example.test", `/p/${slug}/v/2`);
    const denied = await page.request.post(`/api/projects/${slug}/versions`, { data: { specs: [], message: "nope" } });
    expect(denied.status()).toBe(403);
    expect((await page.request.post(`/api/projects/${slug}/versions/1/restore`, { data: {} })).status()).toBe(403);

    // fork v2 with lineage
    await page.goto(`/p/${slug}/v/2`);
    await expect(page.getByRole("button", { name: "Restore v1 as a new version" })).toHaveCount(0);
    await page.getByRole("button", { name: "Fork v2" }).click();
    await expect(page.getByText(/Forked from/)).toBeVisible();
    await expect(page.getByRole("link", { name: "v2", exact: true })).toHaveAttribute("href", `/p/${slug}/v/2`);
    await expect(page.getByRole("img", { name: /Power fraction against Wavelength/ }).first()).toBeVisible({ timeout: 15_000 });
    const forkSlug = new URL(page.url()).pathname.split("/")[2];
    const forkHistory = await (await page.request.get(`/api/projects/${forkSlug}/versions`)).json();
    expect(forkHistory.versions).toHaveLength(1);
    expect(forkHistory.versions[0].message).toBe(`Forked from @e2e-versions/${slug} v2`);
    expect(forkHistory.versions[0].results).toBe(1);
  });

  test("private projects' versions stay private", async ({ request }) => {
    for (const path of ["/api/projects/ada-scratchpad/versions", "/api/projects/ada-scratchpad/versions/1", "/api/projects/ada-scratchpad/versions/1/specs/0", "/api/projects/ada-scratchpad/diff?from=1&to=1"]) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
    expect((await request.get("/p/ada-scratchpad/v/1")).status()).toBe(404);
    const pub = await (await request.get("/api/projects/gold-nanosphere-plasmon/versions")).json();
    expect(pub.versions.map((v: { number: number }) => v.number)).toEqual([2, 1]);
  });
});
