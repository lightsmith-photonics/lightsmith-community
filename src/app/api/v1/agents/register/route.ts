import { clientIp, publicRoute, readBody } from "@/lib/api/http";
import { register, type Registration } from "@/lib/agents/registry";

export const dynamic = "force-dynamic";

/** Device-code flow, step 1: no token needed. */
export const POST = publicRoute(async (req) => register(await readBody<Registration>(req, "Register"), clientIp(req)), { status: 201 });
