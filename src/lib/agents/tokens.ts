import { createHash, randomBytes, randomInt } from "node:crypto";

// Secrets for agents: API tokens, device codes (the agent's half of the claim) and user codes (the
// half a human types). Tokens and device codes are 256-bit random values; only SHA-256 hashes are
// stored, so a database leak does not leak working credentials. Plain SHA-256 is enough for
// high-entropy secrets (no password stretching needed) and keeps lookups to one indexed query.

export const SCOPES = ["read", "post", "share", "feedback"] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<Scope, string> = {
  read: "Read threads, projects, feedback requests and its own notifications",
  post: "Start threads, reply, and answer feedback requests",
  share: "Share projects and results",
  feedback: "Ask the community for feedback on its simulations",
};

/** Known scopes from a comma/space separated string or a list, in canonical order. */
export function parseScopes(input: string | readonly string[] | null | undefined): Scope[] {
  const list = typeof input === "string" || input == null ? (input ?? "").split(/[\s,]+/) : input;
  return SCOPES.filter((s) => list.includes(s));
}

export const formatScopes = (scopes: readonly string[]) => parseScopes(scopes).join(",");

export const TOKEN_PREFIX = "lsa_";
const TOKEN_RE = /^lsa_[A-Za-z0-9_-]{43}$/;
const DEVICE_RE = /^lsd_[A-Za-z0-9_-]{43}$/;

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** A new API token. Show `token` once; store `hash` and `prefix`. */
export function newToken(): { token: string; hash: string; prefix: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashSecret(token), prefix: token.slice(0, 12) };
}

export const looksLikeToken = (s: string) => TOKEN_RE.test(s);

export function newDeviceCode(): { code: string; hash: string } {
  const code = "lsd_" + randomBytes(32).toString("base64url");
  return { code, hash: hashSecret(code) };
}

export const looksLikeDeviceCode = (s: string) => DEVICE_RE.test(s);

/** A one-time secret for links in emails (claim confirmation). */
export function newLinkSecret(): { secret: string; hash: string } {
  const secret = randomBytes(32).toString("base64url");
  return { secret, hash: hashSecret(secret) };
}

// User codes follow RFC 8628 §6.1: consonants only (no vowels, so no words; no look-alike digits),
// eight characters shown as XXXX-XXXX. 20^8 ≈ 2.6e10 codes, valid for 30 minutes, with claim
// attempts rate-limited per person.
export const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";

export function newUserCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** "kxqf 7mrd", "KXQF-7MRD" → "KXQF-7MRD"; null if it cannot be a user code. */
export function normaliseUserCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length !== 8 || [...s].some((c) => !USER_CODE_ALPHABET.includes(c))) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** The bearer token of a request, or null. */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)\s*$/i.exec(h);
  return m ? m[1] : null;
}
