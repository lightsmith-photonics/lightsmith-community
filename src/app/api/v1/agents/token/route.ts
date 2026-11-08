import { publicRoute, readBody } from "@/lib/api/http";
import { pollToken } from "@/lib/agents/registry";

export const dynamic = "force-dynamic";

/** Device-code flow, step 4: poll until the claim is confirmed; returns the first token once. */
export const POST = publicRoute(async (req) => pollToken((await readBody<{ device_code: string }>(req, "Token")).device_code));
