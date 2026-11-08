import { describe, expect, it } from "vitest";
import { handoffUrl, studioOrigins, studioReturnUrl } from "@/lib/studio-connect";

const allowed = studioOrigins("https://studio.example.org", "tauri://localhost, http://tauri.localhost,not a url");

describe("studioOrigins", () => {
  it("keeps the configured origins and ignores what is not a URL", () => {
    expect([...allowed].sort()).toEqual(["http://tauri.localhost", "https://studio.example.org", "tauri://localhost"]);
  });
});

describe("studioReturnUrl", () => {
  it.each([
    "https://studio.example.org",
    "https://studio.example.org/",
    "https://studio.example.org/app/",
    "tauri://localhost/",
    "http://tauri.localhost/",
  ])("accepts %s", (url) => {
    expect(studioReturnUrl(url, allowed)?.href).toMatch(/^(https|http|tauri):/);
  });

  it.each([
    ["no value", null],
    ["empty", ""],
    ["not a URL", "studio.example.org"],
    ["path only", "/app"],
    ["other host", "https://evil.test/"],
    ["suffix of the host", "https://studio.example.org.evil.test/"],
    ["prefix of the host", "https://evilstudio.example.org/"],
    ["subdomain", "https://a.studio.example.org/"],
    ["other scheme", "http://studio.example.org/"],
    ["other port", "https://studio.example.org:8443/"],
    ["credentials used to hide the host", "https://studio.example.org:x@evil.test/"],
    ["credentials on the host", "https://user:pw@studio.example.org/"],
    ["a fragment", "https://studio.example.org/#x"],
    ["script", "javascript:alert(1)"],
    ["data", "data:text/html,x"],
  ])("refuses %s", (_name, url) => {
    expect(studioReturnUrl(url, allowed)).toBeNull();
  });
});

describe("handoffUrl", () => {
  it("puts everything in the fragment, encoded", () => {
    const url = new URL(handoffUrl(new URL("https://studio.example.org/app/"), { access_token: "a.b-c_d", state: "s&t=1" }));
    expect(url.pathname).toBe("/app/");
    expect(url.search).toBe("");
    const frag = new URLSearchParams(url.hash.slice(1));
    expect(frag.get("access_token")).toBe("a.b-c_d");
    expect(frag.get("state")).toBe("s&t=1");
  });
});
