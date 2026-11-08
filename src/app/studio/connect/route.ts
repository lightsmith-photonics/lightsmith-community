// Sign-in for Lightsmith Studio: it sends the user here and gets a short-lived compute token back.
//
//   GET /studio/connect?return_to=<studio url>&state=<nonce>
//   -> 302 <return_to>#access_token=<JWT>&token_type=Bearer&expires_in=<s>&state=<nonce>
//
// The token only ever goes to a configured Studio origin, in the URL fragment, so it stays out of server logs and
// Referer headers. It is the JWT Lightsmith Cloud already verifies, without the user's moderator or admin role: a
// token kept in a browser tab should not unlock Cloud's admin endpoints, and Studio does not use them.
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { issuePlatformJwt } from "@/lib/platform-jwt";
import { getCurrentUser } from "@/lib/session";
import { STUDIO_TOKEN_TTL_SECONDS, handoffUrl, studioReturnUrl } from "@/lib/studio-connect";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const redirect = (url: string | URL) => NextResponse.redirect(url, { status: 302, headers: HEADERS });

export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get("return_to");
  const target = studioReturnUrl(returnTo);
  if (!target || !returnTo) {
    // Not a redirect: this is what stops the route being used to send tokens, or anyone, elsewhere.
    return new NextResponse("return_to is not the address of a Lightsmith Studio this site knows (STUDIO_URL, STUDIO_CONNECT_ORIGINS).\n", {
      status: 400,
      headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const state = req.nextUrl.searchParams.get("state") ?? "";
  if (!state || state.length > 512) {
    return redirect(handoffUrl(target, { error: "invalid_request", error_description: "state is required, at most 512 characters" }));
  }

  const user = await getCurrentUser();
  if (!user) {
    const back = `/studio/connect?${new URLSearchParams({ return_to: returnTo, state })}`;
    return redirect(new URL(`/signin?callbackUrl=${encodeURIComponent(back)}`, env.siteUrl));
  }
  try {
    const token = await issuePlatformJwt({ ...user, role: "user" }, "compute", { ttlSeconds: STUDIO_TOKEN_TTL_SECONDS });
    return redirect(handoffUrl(target, { access_token: token, token_type: "Bearer", expires_in: String(STUDIO_TOKEN_TTL_SECONDS), state }));
  } catch (err) {
    console.error("studio connect: could not issue a token", err);
    return redirect(handoffUrl(target, { error: "server_error", error_description: "this site could not issue a compute token", state }));
  }
}
