// Runs once when a Next.js server process starts. It starts the in-process retry sweep for agent
// webhooks (src/lib/agents/webhooks.ts), so failed deliveries are retried with backoff without a
// separate worker or cron. Not in the Edge runtime, and not in the workers of `next build`.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startRetryLoop } = await import("./lib/agents/webhooks");
    startRetryLoop();
  }
}
