import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { purgeOldDeliveries, retryDue } from "@/lib/agents/webhooks";

export const dynamic = "force-dynamic";

/** Retry webhook deliveries that are due, on demand (e.g. from a cron); the server also sweeps every 15 s. Needs Authorization: Bearer $CRON_SECRET. */
export async function POST(req: Request) {
  const secret = env.cronSecret;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return Response.json({ error: "unauthorized", message: "Set CRON_SECRET and send it as a bearer token." }, { status: 401 });
  }
  return Response.json({ retried: await retryDue(100), purged: await purgeOldDeliveries() });
}
