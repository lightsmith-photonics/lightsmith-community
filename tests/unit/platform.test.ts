import { describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import { issuePlatformJwt, verifyPlatformJwt } from "@/lib/platform-jwt";
import { canEditProject, canViewProject, hasRole } from "@/lib/roles";
import { extractMentions, linkMentions } from "@/lib/forum/mentions";
import { normaliseQuery } from "@/lib/forum/search";
import { slugify, usernameFrom, USERNAME_RE } from "@/lib/slug";
import { base64UrlDecode, studioLink } from "@/lib/studio";
import { parseJobEvent } from "@/lib/compute/types";
import { parseNkTable, toCsv, toMaterialJson, toYaml } from "@/lib/materials/formats";
import { normalizeNk, normalizeMaterial } from "@/lib/materials/normalize";
import { describeError } from "@/lib/materials/http";
import { MockMaterialsApi } from "@/lib/materials/mock";
import { load } from "js-yaml";

const SECRET = "test-secret-test-secret-test-secret";

describe("platform JWT", () => {
  it("issues short-lived HS256 tokens with sub/name/role", async () => {
    const now = Date.now();
    const token = await issuePlatformJwt({ id: "u1", name: "Ada", role: "moderator" }, "materials-db", { secret: SECRET, now });
    const claims = decodeJwt(token);
    expect(claims).toMatchObject({ sub: "u1", name: "Ada", role: "moderator", iss: "lightsmith-community", aud: "materials-db" });
    expect(claims.exp! - claims.iat!).toBe(300);
    await expect(verifyPlatformJwt(token, "materials-db", SECRET)).resolves.toMatchObject({ role: "moderator" });
    await expect(verifyPlatformJwt(token, "compute", SECRET)).rejects.toThrow();
    await expect(verifyPlatformJwt(token, "materials-db", SECRET + "x")).rejects.toThrow();
  });

  it("coerces unknown roles to user", async () => {
    const token = await issuePlatformJwt({ id: "u2", role: "superuser" }, "compute", { secret: SECRET });
    expect(decodeJwt(token).role).toBe("user");
  });
});

describe("roles and visibility", () => {
  const owner = { id: "a", role: "user" };
  const other = { id: "b", role: "user" };
  const admin = { id: "c", role: "admin" };
  it("ranks roles", () => {
    expect(hasRole("admin", "moderator")).toBe(true);
    expect(hasRole("moderator", "admin")).toBe(false);
    expect(hasRole(undefined, "user")).toBe(true);
  });
  it("hides private projects from others", () => {
    const p = { ownerId: "a", visibility: "private" };
    expect(canViewProject(p, owner)).toBe(true);
    expect(canViewProject(p, other)).toBe(false);
    expect(canViewProject(p, null)).toBe(false);
    expect(canViewProject(p, admin)).toBe(true);
    expect(canViewProject({ ...p, visibility: "unlisted" }, null)).toBe(true);
    expect(canEditProject(p, other)).toBe(false);
  });
});

describe("mentions", () => {
  it("extracts mentions outside code, math and emails", () => {
    const md = "Thanks @Ada_L and @bob-1! cc ada@example.com `@notme`\n```\n@nope\n```\n$@x$ @ada_l again";
    expect(extractMentions(md)).toEqual(["ada_l", "bob-1"]);
  });
  it("links only known users", () => {
    expect(linkMentions("hi @ada and @ghost `@ada`", new Set(["ada"]))).toBe("hi [@ada](/u/ada) and @ghost `@ada`");
  });
});

describe("search query", () => {
  it("normalises whitespace and ignores queries without words", () => {
    expect(normaliseQuery("  gold   nanorod ")).toBe("gold nanorod");
    expect(normaliseQuery("!! ?")).toBeNull();
    expect(normaliseQuery("x")).toBeNull();
  });
});

describe("slugs and usernames", () => {
  it("slugifies", () => {
    expect(slugify("Gold Nanorods: Ø 20 nm (DDA vs. Mie)")).toBe("gold-nanorods-20-nm-dda-vs-mie");
    expect(slugify("!!!")).toBe("untitled");
  });
  it("derives valid usernames", () => {
    expect(usernameFrom("Jane.Doe+x@uni.edu")).toBe("jane-doe-x");
    expect(USERNAME_RE.test(usernameFrom("a@b.c"))).toBe(true);
  });
});

describe("studio deep link", () => {
  it("inlines small specs and links large public ones", () => {
    const small = JSON.stringify({ particles: [], wavelengths: [500] });
    const url = new URL(studioLink({ studioUrl: "http://studio", siteUrl: "http://web", specId: "s1", specJson: small, allowUrl: true }));
    expect(JSON.parse(base64UrlDecode(url.searchParams.get("spec")!))).toEqual(JSON.parse(small));
    const big = JSON.stringify({ wavelengths: Array.from({ length: 3000 }, (_, i) => i) });
    const u2 = new URL(studioLink({ studioUrl: "http://studio", siteUrl: "http://web", specId: "s1", specJson: big, allowUrl: true }));
    expect(u2.searchParams.get("spec_url")).toBe("http://web/api/specs/s1");
    const u3 = new URL(studioLink({ studioUrl: "http://studio", siteUrl: "http://web", specId: "s1", specJson: big, allowUrl: false }));
    expect(u3.searchParams.get("spec")).toBeTruthy();
  });
});

describe("compute events", () => {
  it("parses type/event tags and percentages", () => {
    expect(parseJobEvent('{"type":"progress","progress":50}')).toEqual({ type: "progress", progress: 0.5, message: undefined });
    expect(parseJobEvent({ event: "status", status: "completed" })).toEqual({ type: "status", status: "succeeded" });
    expect(parseJobEvent("plain text")).toEqual({ type: "log", message: "plain text" });
    expect(parseJobEvent({ type: "error", error: "boom" })).toEqual({ type: "error", message: "boom" });
    expect(parseJobEvent({ type: "progress", stage: "method_started", method: "mie", progress: 0.1 })).toEqual({
      type: "progress",
      progress: 0.1,
      message: "method_started (mie)",
    });
    expect(parseJobEvent({ type: "end", status: "succeeded" })).toBeNull();
  });
});

describe("materials formats and normalisation", () => {
  const ds = {
    id: "au-x", material_id: "Au", name: "X", authors: "A", year: 2000, reference: "Ref", doi: "10.1/x",
    license: "CC0-1.0", comments: "", type: "tabulated nk", range_nm: [400, 500] as [number, number], has_k: true,
  };
  const d = { wavelength_nm: [400, 500], n: [1.5, 1.4], k: [2, 3] };
  it("writes CSV, YAML (um) and tabulated material JSON", () => {
    expect(toCsv(ds, d)).toContain("wavelength_nm,n,k\n400,1.5,2\n500,1.4,3");
    const y = load(toYaml(ds, d)) as { DATA: { data: string }[] };
    expect(y.DATA[0].data.split("\n")[0]).toBe("0.4 1.5 2");
    expect(toMaterialJson(ds, d)).toMatchObject({ kind: "tabulated", n_imag: [2, 3] });
  });
  it("parses pasted tables in nm, um and eV", () => {
    expect(parseNkTable("wavelength,n,k\n500,1.5,0.1\n400,1.6,0.2").rows).toEqual([[400, 1.6, 0.2], [500, 1.5, 0.1]]);
    expect(parseNkTable("0.5 1.5\n0.6 1.4", "um").rows[0]).toEqual([500, 1.5, 0]);
    expect(parseNkTable("2 1.5 0\n3 1.4 0", "ev").rows[0][0]).toBeCloseTo(413.28, 1);
    expect(parseNkTable("500 1.5 -1\n600 1 1").errors[0]).toMatch(/k must be/);
  });
  it("normalises alternative service shapes", () => {
    expect(normalizeNk([[400, 1, 2], [500, 1.1, 2.1]])).toEqual({ wavelength_nm: [400, 500], n: [1, 1.1], k: [2, 2.1] });
    expect(normalizeNk({ wavelength_um: [0.4], n: [1], k: [0] }).wavelength_nm).toEqual([400]);
    expect(normalizeMaterial({ slug: "Au", name: "Gold" }).id).toBe("Au");
    expect(normalizeMaterial({ id: "mat_123", slug: "gold" }).id).toBe("gold");
    // /v1/compare fills values outside a dataset's range with null
    expect(normalizeNk({ wavelength_nm: [300, 400], n: [null, 1.5], k: [null, 2] }).n[0]).toBeNaN();
  });
});

describe("materials-db errors", () => {
  it("surfaces validation messages", () => {
    const body = JSON.stringify({ error: "validation_failed", message: "Submission is invalid", detail: { validation: { errors: [{ message: "k < 0 at 500 nm" }] } } });
    expect(describeError(422, body)).toBe("Submission is invalid: k < 0 at 500 nm");
    expect(describeError(500, "oops")).toBe("materials-db 500: oops");
  });
});

describe("mock materials API", () => {
  it("searches by alias and category, and gates the review queue to moderators", async () => {
    process.env.PLATFORM_JWT_SECRET = SECRET;
    const api = new MockMaterialsApi();
    expect((await api.search({ q: "gold" })).items[0].id).toBe("Au");
    expect((await api.search({ category: "metal" })).total).toBe(4);
    expect((await api.categories()).map((c) => c.id)).toEqual(["semiconductor", "glass_oxide", "metal", "liquid"]);
    const user = await issuePlatformJwt({ id: "u", role: "user" }, "materials-db", { secret: SECRET });
    const mod = await issuePlatformJwt({ id: "m", role: "moderator" }, "materials-db", { secret: SECRET });
    const sub = await api.submit(
      { material_id: "Au", material_name: "Gold", category: "metal", dataset_name: "Test", reference: "r", doi: null, license: "CC-BY-4.0", comments: "", data: [[400, 1, 1], [500, 1, 1]] },
      user,
    );
    expect(sub.status).toBe("pending");
    await expect(api.submissions("pending", user)).rejects.toThrow(/403/);
    expect((await api.submissions("pending", mod)).some((s) => s.id === sub.id)).toBe(true);
    expect((await api.review(sub.id, "approve", "ok", mod)).status).toBe("approved");
  });
});
