import { afterEach, describe, expect, it, vi } from "vitest";
import { signInMailRules } from "@/lib/signin-limits";

afterEach(() => vi.unstubAllEnvs());

describe("sign-in mail limits", () => {
  it("counts per mailbox, per network and for the whole site", () => {
    expect(signInMailRules("ada@example.org", "203.0.113.7").map((r) => [r.limit, r.window])).toEqual([
      [5, "hour"],
      [15, "day"],
      [30, "hour"],
      [300, "hour"],
    ]);
  });

  it("treats +tag addresses and case as one inbox, and stores no address", () => {
    const keys = (email: string) => signInMailRules(email, "203.0.113.7").map((r) => r.key);
    expect(keys("Ada+anything@Example.org")).toEqual(keys("ada@example.org"));
    expect(keys("grace@example.org")[0]).not.toBe(keys("ada@example.org")[0]);
    expect(keys("ada@example.org").join()).not.toMatch(/ada|example/);
  });

  it("separates networks, and shares one site-wide counter", () => {
    const [, , ipA, siteA] = signInMailRules("ada@example.org", "203.0.113.7");
    const [, , ipB, siteB] = signInMailRules("grace@example.org", "198.51.100.9");
    expect(ipA.key).not.toBe(ipB.key);
    expect(siteA.key).toBe(siteB.key);
  });

  it("takes limits from the environment", () => {
    vi.stubEnv("LIMIT_SIGNIN_MAIL_PER_ADDRESS_PER_HOUR", "2");
    vi.stubEnv("LIMIT_SIGNIN_MAIL_PER_HOUR", "9");
    const rules = signInMailRules("ada@example.org", "203.0.113.7");
    expect(rules[0].limit).toBe(2);
    expect(rules[3].limit).toBe(9);
  });
});
