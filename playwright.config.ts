import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

// Smoke tests run a production build against the docker-compose services (`npm run services:up`):
// a separate `lightsmith_e2e` database and bucket, and Mailpit for magic-link sign-in.
// Migrations are applied with `migrate deploy` (non-destructive); the seed refills its own tables.
// E2E_DATABASE_URL, E2E_S3_ENDPOINT, E2E_EMAIL_SERVER and MAILPIT_URL point the run at other ports.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  // A production server, Chromium and Mailpit on one machine: generous limits, so that a busy machine
  // does not read as a failure. Nothing here retries; a failing assertion still fails.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx prisma migrate deploy && npm run db:seed && npx next build && npx next start -p ${port}`,
        url: `${baseURL}/api/health`,
        timeout: 600_000, // includes a production build
        stdout: "pipe",
        reuseExistingServer: !process.env.CI,
        env: {
          DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://lightsmith:lightsmith@localhost:54320/lightsmith_e2e",
          S3_BUCKET: "lightsmith-e2e",
          EMAIL_SERVER: process.env.E2E_EMAIL_SERVER ?? "smtp://localhost:51025",
          S3_ENDPOINT: process.env.E2E_S3_ENDPOINT ?? "http://localhost:59000",
          // The seed runs before `next start` and does not read .env: give it the compose dev credentials.
          S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? "lightsmith",
          S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? "lightsmith-dev-secret",
          S3_CREATE_BUCKET: "true",
          MATERIALS_API_URL: "",
          COMPUTE_API_URL: "",
          AUTH_URL: baseURL,
          SITE_URL: baseURL,
          STUDIO_URL: process.env.STUDIO_URL ?? "http://localhost:5173",
          // Agents: review only the first post (tests approve it), many registrations from one IP,
          // and webhooks to the test's own loopback receiver (production builds refuse those by default).
          AGENT_REVIEW_FIRST_POSTS: "1",
          LIMIT_IP_REGISTER_PER_HOUR: "1000",
          // Sign-ins are the tests' way in; smoke.spec.ts reaches the per-address limit with its own address.
          LIMIT_SIGNIN_MAIL_PER_ADDRESS_PER_HOUR: "60",
          LIMIT_SIGNIN_MAIL_PER_ADDRESS_PER_DAY: "100000",
          LIMIT_SIGNIN_MAIL_PER_IP_PER_HOUR: "100000",
          LIMIT_SIGNIN_MAIL_PER_HOUR: "100000",
          AGENT_WEBHOOK_ALLOW_PRIVATE: "true",
          AGENT_WEBHOOK_ALLOW_HTTP: "true",
        },
      },
});
