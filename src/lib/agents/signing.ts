import { createHmac, timingSafeEqual } from "node:crypto";
import { BlockList, isIP } from "node:net";

// Webhook signatures and the SSRF guard for webhook URLs. Pure functions (no database), so agent
// authors can copy `verifySignature` and the tests can exercise it directly.
//
// Header: X-Lightsmith-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>

export function webhookSecretFor(agentId: string, version: number, key: string): string {
  return "whsec_" + createHmac("sha256", key).update(`webhook:${agentId}:${version}`).digest("base64url");
}

export function signPayload(secret: string, body: string, timestamp: number): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

/** True if `header` is a valid signature of `body` made within `toleranceSeconds` of `now`. */
export function verifySignature(secret: string, header: string, body: string, now = Date.now(), toleranceSeconds = 300): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1 || Math.abs(now / 1000 - t) > toleranceSeconds) return false;
  const expected = Buffer.from(signPayload(secret, body, t).split("v1=")[1], "hex");
  const got = Buffer.from(parts.v1, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001::", 23], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(net, bits, "ipv6");

/** Loopback, private, link-local, CGNAT, documentation, multicast and reserved ranges (v4, v6 and v4-mapped v6). */
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return blocked.check(ip, "ipv4");
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    return blocked.check(ip, "ipv6");
  }
  return true; // not an address: refuse
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Syntax rules for a webhook URL (no DNS): http(s) only, no credentials, https unless allowed. */
export function checkWebhookUrlSyntax(raw: string, opts: { allowHttp: boolean }): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (url.protocol !== "https:" && !(opts.allowHttp && url.protocol === "http:")) return { ok: false, reason: opts.allowHttp ? "use an http(s) URL" : "webhook URLs must use https" };
  if (url.username || url.password) return { ok: false, reason: "URLs with credentials are not allowed; authenticate with the signature instead" };
  if (raw.length > 500) return { ok: false, reason: "URL is too long" };
  return { ok: true, url };
}
