import { env } from "./env";

/**
 * The client's address for per-IP limits. Proxies append to X-Forwarded-For, so only the last
 * `hops` entries (TRUSTED_PROXY_HOPS) were written by our own proxies; the entry `hops` from the
 * right is the address the outermost trusted proxy saw. Anything further left is client-supplied.
 */
export function clientIp(req: { headers: { get(name: string): string | null } }, hops = env.trustedProxyHops): string {
  const chain = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (chain.length > 0) return chain[Math.max(0, chain.length - hops)];
  return req.headers.get("x-real-ip")?.trim() || "local";
}
