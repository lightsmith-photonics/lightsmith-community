// Who may receive a compute token from GET /studio/connect (see src/app/studio/connect/route.ts).
import { env } from "./env";

/** How long a token handed to Studio lasts. Studio has no refresh: it asks the user to sign in again. */
export const STUDIO_TOKEN_TTL_SECONDS = 3600;

/** URL.origin is "null" for non-special schemes, and the desktop app's pages are at tauri://localhost. */
function originOf(u: URL): string {
  return `${u.protocol}//${u.host}`;
}

/** STUDIO_URL, plus STUDIO_CONNECT_ORIGINS (comma-separated: other Studio deployments, the desktop app). */
export function studioOrigins(studioUrl = env.studioUrl, extra = process.env.STUDIO_CONNECT_ORIGINS ?? ""): Set<string> {
  const origins = new Set<string>();
  for (const s of [studioUrl, ...extra.split(",")]) {
    if (!s.trim()) continue;
    try {
      origins.add(originOf(new URL(s.trim())));
    } catch {
      // a malformed entry allows nothing
    }
  }
  return origins;
}

/** The address to send a token to, or null: an exact, configured origin, with nothing hidden in the URL. */
export function studioReturnUrl(returnTo: string | null | undefined, allowed = studioOrigins()): URL | null {
  if (!returnTo) return null;
  let u: URL;
  try {
    u = new URL(returnTo);
  } catch {
    return null;
  }
  if (u.username || u.password || u.hash) return null;
  return allowed.has(originOf(u)) ? u : null;
}

/** `target` with `params` in the fragment, which browsers never send to servers or put in a Referer. */
export function handoffUrl(target: URL, params: Record<string, string>): string {
  const u = new URL(target);
  u.hash = new URLSearchParams(params).toString();
  return u.toString();
}
