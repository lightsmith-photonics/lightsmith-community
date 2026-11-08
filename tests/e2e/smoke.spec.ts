import { expect, test } from "@playwright/test";
import { expectAccessible, signIn } from "./helpers";
import scatteringSpec from "../../fixtures/demo/scattering.spec.json";

test.describe("public pages", () => {
  test("the sign-in form refuses addresses a mail parser could misread", async ({ page }) => {
    await page.goto("/signin");
    const email = page.getByLabel("Email");
    await email.evaluate((el: HTMLInputElement) => {
      el.type = "text"; // what a script posting to the form is not held to either
    });
    await email.fill("someone,other(comment)@example.test");
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page).toHaveURL(/\/signin\?error=InvalidEmail/);
    await expect(page.getByRole("alert")).toContainText("does not look like an email address");
    await expect(page.getByRole("heading", { name: "Check your email" })).toHaveCount(0);
  });

  test("landing page and both themes pass axe", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("open photonics suite");
    await expect(page.getByRole("heading", { name: "Integrated photonics" })).toBeVisible();
    await expectAccessible(page);
    const html = page.locator("html");
    // system -> light -> dark
    await page.getByRole("button", { name: /theme/i }).click();
    await page.getByRole("button", { name: /theme/i }).click();
    expect(await html.getAttribute("data-theme")).toBe("dark");
    await expectAccessible(page);
  });

  test("docs, spec reference and pricing render", async ({ page, request }) => {
    await page.goto("/docs/spec");
    await expect(page.getByRole("heading", { name: /layer_stack/ })).toBeVisible();
    await page.goto("/docs/agents");
    await expect(page.getByRole("cell", { name: "estimate" })).toBeVisible();
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: "GPU hours" })).toBeVisible();
    await expectAccessible(page);
    const health = await (await request.get("/api/health")).json();
    expect(health).toMatchObject({ ok: true, database: true, storage: true });
  });
});

test.describe("result viewers (seeded projects)", () => {
  test("waveguide modes: dispersion, table and field profile", async ({ page }) => {
    await page.goto("/p/silicon-strip-waveguide-modes");
    await expect(page.getByRole("img", { name: /Effective index n_eff against Wavelength/ })).toBeVisible();
    await page.getByRole("tab", { name: "Mode table" }).click();
    await expect(page.getByRole("cell", { name: /^2\.\d{5}/ }).first()).toBeVisible(); // n_eff of the fundamental mode
    await page.getByRole("tab", { name: "Field profiles" }).click();
    await expect(page.getByRole("img", { name: /\|E\|² of mode 0/ })).toBeVisible();
    await expectAccessible(page);
  });

  test("band diagram, S-parameters and thin-film spectrum", async ({ page }) => {
    await page.goto("/p/square-lattice-photonic-crystal");
    await expect(page.getByRole("img", { name: /Frequency a\/λ against Wave vector/ })).toBeVisible();
    await expect(page.getByText(/TM gap between bands 1 and 2/)).toBeVisible();
    await page.goto("/p/mzi-circuit");
    await expect(page.getByRole("img", { name: /\|S\|² \(dB\) against Wavelength/ })).toBeVisible();
    await page.goto("/p/anti-reflection-and-bragg-mirrors");
    await expect(page.getByRole("img", { name: /Power fraction against Wavelength/ }).first()).toBeVisible();
    await page.goto("/p/tio2-grating-rcwa");
    await expect(page.getByLabel("Diffraction order")).toBeVisible();
  });
});

test.describe("materials explorer", () => {
  test("search, plot, switch to permittivity and download", async ({ page, request }) => {
    await page.goto("/materials");
    await page.getByLabel("Search materials").fill("gold");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("link", { name: /Gold/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Gold");
    await expect(page.getByRole("img", { name: /Refractive index n/ })).toBeVisible();
    // Retry: a click that lands before hydration is lost.
    await expect(async () => {
      await page.getByRole("radio", { name: "n, k" }).check();
      await page.getByRole("radio", { name: "ε₁, ε₂" }).check();
      await expect(page.getByRole("img", { name: /Permittivity/ })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: /doi:10.1103\/PhysRevB.6.4370/ }).first()).toBeVisible();
    await expectAccessible(page);
    const csv = await request.get("/api/materials/datasets/au-johnson-christy/download?format=csv");
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(await csv.text()).toContain("wavelength_nm,n,k");
    const json = await (await request.get("/api/materials/datasets/au-johnson-christy/download?format=json")).json();
    expect(json.kind).toBe("tabulated");
  });

  test("contribute a dataset, then a moderator approves it", async ({ page }) => {
    await signIn(page, "e2e-contrib@example.test", "/materials/contribute?material=Ag");
    await page.goto("/materials/contribute?material=Ag");
    await page.getByLabel("Dataset name").fill("E2E test data");
    await page.getByLabel("Full reference").fill("A. Tester. A made-up silver dataset for tests. J. Tests 1, 1 (2026)");
    await page.getByLabel(/Columns: wavelength/).fill("400, 0.17, 1.95\n500, 0.13, 2.92\n600, 0.12, 3.73");
    await expect(page.getByText("3 points parsed.")).toBeVisible();
    await page.getByLabel(/I have the right/).check();
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByRole("status")).toContainText("waiting for review");

    await signIn(page, "maxwell@example.test", "/moderation/materials");
    await page.goto("/moderation/materials");
    const card = page.locator("li", { hasText: "E2E test data" });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Approve" }).click();
    await expect(page.locator("li", { hasText: "E2E test data" })).toHaveCount(0);
  });
});

test.describe("projects", () => {
  test("create a project, run a spec on the mock compute, star and embed", async ({ page }) => {
    await signIn(page, "e2e-runner@example.test", "/projects/new");
    await page.goto("/projects/new");
    await page.getByLabel("Title").fill("E2E Drude sphere");
    await page.getByLabel("Short description").fill("Created by the Playwright smoke test.");
    await page.getByLabel("Problem JSON").fill(JSON.stringify(scatteringSpec));
    await expect(page.getByText(/^Valid scattering problem/)).toBeVisible();
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "E2E Drude sphere" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open in Studio" })).toHaveAttribute("href", /\?spec=/);

    await page.getByRole("button", { name: "Run" }).click();
    await expect(page.getByText("Result saved to this project.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("img", { name: /Cross section \(nm²\) against Wavelength/ })).toBeVisible();

    await page.getByRole("button", { name: /☆ Star/ }).click();
    await expect(page.getByRole("button", { name: /★ Starred/ })).toBeVisible();
    await expectAccessible(page);

    const embedCode = await page.locator("pre", { hasText: "/embed/results/" }).first().textContent();
    const src = embedCode!.match(/src="([^"]+)"/)![1];
    await page.goto(new URL(src).pathname);
    await expect(page.getByRole("img", { name: /Cross section/ })).toBeVisible();
  });

  test("fork a public project (results are copied) and private projects stay hidden", async ({ page }) => {
    await signIn(page, "e2e-forker@example.test", "/p/square-lattice-photonic-crystal");
    await page.goto("/p/square-lattice-photonic-crystal");
    await page.getByRole("button", { name: /^Fork/ }).click();
    await expect(page.getByText(/Forked from/)).toBeVisible();
    await expect(page.getByRole("img", { name: /Frequency a\/λ/ })).toBeVisible();
    const res = await page.goto("/p/ada-scratchpad");
    expect(res?.status()).toBe(404);
  });
});

test.describe("forum", () => {
  test("post a thread with LaTeX, reply, lock, accept, and find it by search", async ({ page }) => {
    await signIn(page, "e2e-poster@example.test", "/forum/new?category=integrated-photonics");
    await page.goto("/forum/new?category=integrated-photonics");
    await page.getByLabel("Title").fill("E2E: convergence of n_eff with grid spacing");
    await page.getByRole("textbox", { name: "Details" }).fill("Does $n_{eff}$ converge like $$h^{2}$$ for @maxwell's waveguide?\n\n```python\nprint('hi')\n```");
    await page.getByRole("button", { name: "Post thread" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E: convergence");
    await expect(page.locator(".katex").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "@maxwell" })).toHaveAttribute("href", "/u/maxwell");
    const url = page.url();

    await signIn(page, "maxwell@example.test", url);
    await page.goto(url);
    await page.getByRole("textbox", { name: "Your reply" }).fill("Yes, roughly; Richardson-extrapolate in $h^2$.");
    await page.getByRole("button", { name: "Post reply" }).click();
    await expect(page.getByText("Posted.")).toBeVisible();
    await page.getByRole("button", { name: "Lock" }).click();
    await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible();

    await signIn(page, "e2e-poster@example.test", url);
    await page.goto(url);
    await page.getByRole("button", { name: "Accept as answer" }).click();
    await expect(page.getByText("accepted answer", { exact: true })).toBeVisible();
    await expectAccessible(page);

    await page.goto("/forum/search?q=convergence+grid+spacing");
    await expect(page.getByRole("link", { name: /E2E: convergence/ })).toBeVisible();
  });
});
