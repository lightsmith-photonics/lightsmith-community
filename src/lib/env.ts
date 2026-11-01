// Central place for environment configuration, read at runtime on the server (no NEXT_PUBLIC_*
// values, so one Docker image works in every environment). See .env.example.

const trim = (v: string | undefined) => (v ?? "").replace(/\/$/, "");

export const env = {
  get siteUrl() {
    return trim(process.env.SITE_URL ?? process.env.AUTH_URL) || "http://localhost:3000";
  },
  /** The Lightsmith technical report (sibling repository lightsmith-paper). */
  get paperUrl() {
    return process.env.PAPER_URL || "https://github.com/OWNER/lightsmith-paper";
  },
  get studioUrl() {
    return trim(process.env.STUDIO_URL) || "http://localhost:5173";
  },
  get githubRepo() {
    return process.env.GITHUB_REPO_URL || "https://github.com/OWNER/lightsmith";
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
};

export const materialsMocked = () => !env.materialsApiUrl;
export const computeMocked = () => !env.computeApiUrl;
