import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

// Smoke tests run a production build against the docker-compose services (`npm run services:up`):
// a separate `lightsmith_e2e` database and bucket, and Mailpit for magic-link sign-in.
// Migrations are applied with `migrate deploy` (non-destructive); the seed refills its own tables.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
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
          EMAIL_SERVER: "smtp://localhost:51025",
          S3_ENDPOINT: "http://localhost:59000",
          MATERIALS_API_URL: "",
          COMPUTE_API_URL: "",
          AUTH_URL: baseURL,
          SITE_URL: baseURL,
        },
      },
});
