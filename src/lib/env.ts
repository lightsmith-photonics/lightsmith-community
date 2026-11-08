// Central place for environment configuration, read at runtime on the server (no NEXT_PUBLIC_*
// values, so one Docker image works in every environment). See .env.example.

const trim = (v: string | undefined) => (v ?? "").replace(/\/$/, "");

export const env = {
  get siteUrl() {
    return trim(process.env.SITE_URL ?? process.env.AUTH_URL) || "http://localhost:3000";
  },
  /** The Lightsmith technical report; empty hides the links until it is published. */
  get paperUrl() {
    return trim(process.env.PAPER_URL);
  },
  get studioUrl() {
    return trim(process.env.STUDIO_URL) || "http://localhost:5173";
  },
  get githubRepo() {
    return process.env.GITHUB_REPO_URL || "https://github.com/lightsmith-photonics/lightsmith";
  },
  get materialsApiUrl() {
    return trim(process.env.MATERIALS_API_URL);
  },
  get computeApiUrl() {
    return trim(process.env.COMPUTE_API_URL);
  },
  get computeApiKey() {
    return process.env.COMPUTE_API_KEY ?? "";
  },
  /** WebSocket base of the compute service as browsers see it (default: COMPUTE_API_URL with ws://). */
  get computeWsUrl() {
    return trim(process.env.COMPUTE_WS_URL);
  },
  get platformJwtSecret() {
    return process.env.PLATFORM_JWT_SECRET ?? "";
  },
  get github() {
    const id = process.env.AUTH_GITHUB_ID;
    const secret = process.env.AUTH_GITHUB_SECRET;
    return id && secret ? { id, secret } : null;
  },
  get emailServer() {
    return process.env.EMAIL_SERVER ?? "";
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "Lightsmith Community <no-reply@example.com>";
  },
  /** Without SMTP outside production, magic links are printed to the server log. */
  get emailToConsole() {
    return !process.env.EMAIL_SERVER && process.env.NODE_ENV !== "production";
  },
  /** Key the per-agent webhook signing secrets are derived from (defaults to AUTH_SECRET). */
  get webhookKey() {
    const key = process.env.AGENT_WEBHOOK_SECRET || process.env.AUTH_SECRET || "";
    if (!key && process.env.NODE_ENV === "production") throw new Error("AGENT_WEBHOOK_SECRET or AUTH_SECRET must be set");
    return key || "dev-only-webhook-key";
  },
  /** Webhooks may target private/loopback addresses (development and tests only). */
  get webhookAllowPrivate() {
    return process.env.AGENT_WEBHOOK_ALLOW_PRIVATE === "true" || (process.env.NODE_ENV !== "production" && process.env.AGENT_WEBHOOK_ALLOW_PRIVATE !== "false");
  },
  /** Webhooks may use plain http (development and tests only). */
  get webhookAllowHttp() {
    return process.env.AGENT_WEBHOOK_ALLOW_HTTP === "true" || (process.env.NODE_ENV !== "production" && process.env.AGENT_WEBHOOK_ALLOW_HTTP !== "false");
  },
  /** How many of an agent's first posts a moderator reviews before it may post directly. */
  get agentReviewFirstPosts() {
    const n = Number(process.env.AGENT_REVIEW_FIRST_POSTS ?? 3);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 3;
  },
  /**
   * Reverse proxies in front of the app that append the client address to X-Forwarded-For (default 1,
   * e.g. nginx; 2 for Cloudflare + nginx). The client address is read that many entries from the right,
   * because entries further left are whatever the client sent.
   */
  get trustedProxyHops() {
    const n = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
    return Number.isInteger(n) && n >= 1 ? n : 1;
  },
  /** Days finished webhook deliveries are kept (default 30; 0 keeps them forever). */
  get webhookRetentionDays() {
    const raw = process.env.AGENT_WEBHOOK_RETENTION_DAYS;
    const n = Number(raw === undefined || raw === "" ? 30 : raw);
    return Number.isFinite(n) && n >= 0 ? n : 30;
  },
  /** Bearer secret for POST /api/v1/internal/webhooks (retries due webhook deliveries on demand). */
  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },
};

export const materialsMocked = () => !env.materialsApiUrl;
export const computeMocked = () => !env.computeApiUrl;
