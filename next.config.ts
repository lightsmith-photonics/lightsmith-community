import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // The Docker image sets NEXT_OUTPUT=standalone; `next start` needs the default output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  experimental: {
    // Server actions take result uploads of up to 50 MB (see src/app/(site)/p/actions.ts) plus the
    // form's other fields; Next's default is 1 MB. The actions check sizes themselves.
    serverActions: { bodySizeLimit: "52mb" },
  },
  async headers() {
    return [
      // Everything except /embed/* may not be framed by other sites.
      {
        source: "/((?!embed/).*)",
        headers: [...securityHeaders, { key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
      {
        source: "/embed/:path*",
        headers: [...securityHeaders, { key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      // Specs are fetched by apps/studio from another origin.
      {
        source: "/api/specs/:id",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
      {
        source: "/api/projects/:slug/versions/:n/specs/:index",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
