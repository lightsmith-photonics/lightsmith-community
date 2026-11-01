import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import { asRole } from "./roles";
import { brand } from "@/lib/brand";

export type Audience = "materials-db" | "compute";

export interface PlatformClaims {
  sub: string;
  name: string;
  role: "user" | "moderator" | "admin";
}

const ISSUER = process.env.PLATFORM_JWT_ISSUER || brand.jwtIssuer;
export const PLATFORM_JWT_TTL_SECONDS = 300;

function key(secret = process.env.PLATFORM_JWT_SECRET ?? env.platformJwtSecret): Uint8Array {
  if (!secret) throw new Error("PLATFORM_JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

/** Short-lived HS256 token the services accept as proof of the acting user. */
export async function issuePlatformJwt(
  user: { id: string; name?: string | null; username?: string | null; role?: string | null },
  audience: Audience,
  opts: { secret?: string; ttlSeconds?: number; now?: number } = {},
): Promise<string> {
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  return new SignJWT({ name: user.name ?? user.username ?? "", role: asRole(user.role) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + (opts.ttlSeconds ?? PLATFORM_JWT_TTL_SECONDS))
    .sign(key(opts.secret));
}

/** Used by the built-in mocks so they enforce the same auth contract as the real services. */
export async function verifyPlatformJwt(token: string, audience: Audience, secret?: string): Promise<PlatformClaims> {
  const { payload } = await jwtVerify(token, key(secret), { issuer: ISSUER, audience, algorithms: ["HS256"] });
  return { sub: String(payload.sub), name: String(payload.name ?? ""), role: asRole(payload.role) };
}
