# Lightsmith Community. Multi-stage build; targets:
#   runner  (default)  the web app: Next.js standalone server, non-root, healthcheck
#   migrate            one-shot `prisma migrate deploy` (run on deploy, not on every app start)
#   seed               opt-in demo data (development only)
# docker build -t lightsmith-community .

ARG NODE_IMAGE=node:22.21.1-bookworm-slim

FROM ${NODE_IMAGE} AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---- dependencies (incl. dev tools: prisma CLI, tsx) ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci --no-audit --no-fund

# ---- build ----
FROM deps AS build
COPY . .
ENV NEXT_OUTPUT=standalone
RUN npx prisma generate && npx next build && chown -R node:node /app

# ---- migrations (one-shot) ----
FROM deps AS migrate
COPY --chown=node:node prisma ./prisma
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- demo data (opt-in) ----
FROM build AS seed
USER node
CMD ["npx", "tsx", "prisma/seed.ts"]

# ---- runtime ----
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Prisma's query engine is loaded at runtime; make sure it is present next to the client.
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
