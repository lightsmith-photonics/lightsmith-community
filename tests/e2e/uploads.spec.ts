import path from "node:path";
import { statSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import layerStack from "../../fixtures/demo/layer_stack.spec.json";

// Server actions take bodies above Next's 1 MB default (next.config.ts sets the limit for the
// 50 MB result uploads the form allows).
test("uploads a result larger than 1 MB through the web form", async ({ page }) => {
  test.setTimeout(120_000);
  const file = path.join(__dirname, "../../fixtures/demo/mode.result.json");
  expect(statSync(file).size).toBeGreaterThan(2_000_000);

  await signIn(page, "e2e-uploads@example.test", "/projects/new");
  await page.goto("/projects/new");
  await page.getByLabel("Title").fill("E2E large result upload");
  await page.getByLabel("Spec name").fill("ar-film");
  await page.getByLabel("Problem JSON").fill(JSON.stringify(layerStack));
  await expect(page.getByText(/^Valid thin films problem/)).toBeVisible();
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E large result upload" })).toBeVisible();

  await page.getByText("Upload a result", { exact: true }).click();
  const upload = page.locator("details", { hasText: "Upload a result" });
  await upload.getByLabel("Name", { exact: true }).fill("Large mode solve");
  await upload.getByLabel("Result JSON file").setInputFiles(file);
  await upload.getByRole("button", { name: "Add result" }).click();
  await expect(upload.getByRole("status")).toHaveText("Result added.", { timeout: 60_000 });
  await page.reload();
  await expect(page.getByText("Large mode solve").first()).toBeVisible();
});
