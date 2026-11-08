# Lightsmith Community

The community site of [Lightsmith](https://github.com/lightsmith-photonics/lightsmith), the open photonics suite: shared simulation projects with
interactive results, a materials explorer with per-paper citations, and a forum that speaks LaTeX.

Stack: Next.js 15 (App Router, standalone output) · TypeScript · Tailwind CSS 4 · Prisma 6 on PostgreSQL · Auth.js v5 (database
sessions) · S3-compatible object storage · Vitest · Playwright. Licence: [MIT](LICENSE).

Product names, the tagline and the library's install/CLI strings are defined once in [`src/lib/brand.ts`](src/lib/brand.ts).

## Run it with Docker

Requires Docker with Compose v2.24 or later.

```bash
cp .env.example .env
docker compose up --build -d
docker compose --profile seed run --rm seed     # optional: demo users, projects and forum threads
```

- App: http://localhost:3000 (health: `/api/health`)
- Mail catcher (magic links): http://localhost:58025
- Stop: `docker compose down`; delete data too: `docker compose down -v`

The stack: `postgres` (16, named volume), `s3` (S3-compatible object storage, named volume), `mailpit` (SMTP + web UI), a one-shot
`migrate` service that runs `prisma migrate deploy`, and `web`, which starts only after the others are healthy and migrations
succeeded. Host ports default to uncommon values (Postgres 54320, S3 59000, SMTP 51025, mail UI 58025) so the stack runs next to
other local services; override them with `POSTGRES_PORT`, `S3_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT` and `WEB_PORT`.

**Sign in:** enter an email on `/signin`, open the message in Mailpit and follow the link. After seeding, `ada@example.test` is an
admin, `maxwell@example.test` a moderator, and `mie@example.test` / `rayleigh@example.test` are regular users. Any other address
creates a new account. `ADMIN_EMAILS` makes listed addresses admins when they first sign in.

## Develop on the host

Requires Node.js ≥ 20.9.

```bash
cp .env.example .env
npm install                 # also runs prisma generate
npm run services:up         # postgres, s3 and mailpit from docker-compose.yml
npm run db:migrate          # prisma migrate deploy
npm run db:seed             # optional demo data (wipes the app's tables)
npm run dev                 # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | TypeScript type check |
| `npm test` | Vitest unit tests (solvers vs library results, schema validation for every problem kind, result parsing and previews, JWT, mentions, formats, mocks) |
| `npm run test:e2e` | Playwright smoke tests with axe WCAG 2.1 AA checks. Needs `npm run services:up` and `npx playwright install chromium`. Uses its own `lightsmith_e2e` database and bucket, and signs in through Mailpit |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:migrate:new -- <name>` | Create a migration after editing `prisma/schema.prisma` (uses a dev database) |
| `npm run db:seed` | Demo data. Clears the app's tables first: development databases only |
| `npm run services:up` / `services:down` | Backing services for host development |
| `npm run fixtures:schema` / `fixtures:demo` / `fixtures:materials` | Refresh `fixtures/` from the Python library (see below) |

## Configuration

Everything is read at runtime on the server (no `NEXT_PUBLIC_*` values), so one image works in every environment. Every variable
is documented in [`.env.example`](.env.example). The main groups:

- **Database:** `DATABASE_URL` (PostgreSQL only). Accounts, sessions, profiles, projects, the forum and notifications live here.
  Migrations are in `prisma/migrations`, including GIN indexes for forum full-text search.
- **Object storage:** `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_FORCE_PATH_STYLE`,
  `S3_CREATE_BUCKET`. The app speaks plain S3, so any S3-compatible store works in production: AWS S3, Cloudflare R2, Backblaze B2
  and others. Compose uses SeaweedFS (`chrislusf/seaweedfs:3.97`, Apache-2.0) as a local S3 server. Result JSON (up to 50 MB; mode fields can be several MB) is stored gzipped and streamed to browsers as-is.
  Database rows keep a key and a small preview, so no state lives on the app's filesystem.
- **Auth:** `AUTH_SECRET`, `AUTH_URL`; GitHub OAuth when `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` are set; email magic links when
  `EMAIL_SERVER` is set. Outside production without SMTP, links are printed to the server log. Production sends through
  Amazon SES in us-east-1 as `no-reply@lightsmith.dev` (see `.env.example`).
- **Links:** `SITE_URL`, `GITHUB_REPO_URL`, `PAPER_URL` (the technical report).
- **Other Lightsmith services, by URL only:** `MATERIALS_API_URL` (Lightsmith Materials), `COMPUTE_API_URL` and `COMPUTE_WS_URL`
  (Lightsmith Cloud), `STUDIO_URL` (Lightsmith Studio). Empty materials/compute URLs switch to built-in mocks.
  `PLATFORM_JWT_SECRET` must match the services.

## Talking to the services

The app calls the services server-side with a short-lived HS256 JWT (`src/lib/platform-jwt.ts`): claims `sub`, `name`, `role`
(`user`/`moderator`/`admin`), `iss` (`PLATFORM_JWT_ISSUER`, default `lightsmith-community`), `aud` (`materials-db` or `compute`), and a
5-minute expiry. The built-in mocks verify the same token.

- **Materials** (`src/lib/materials/`): `GET /v1/categories`, `/v1/materials`, `/v1/materials/{id}`, `/v1/datasets/{id}`,
  `/v1/datasets/{id}/data`, `/v1/compare?datasets=`, `POST /v1/submissions`, `GET /v1/submissions?status=`,
  `POST /v1/submissions/{id}/review`. `normalize.ts` absorbs small contract differences. The mock serves CC0 tables for eight materials.
- **Compute** (`src/lib/compute/`): `POST /v1/jobs` `{spec, method, device}`, `GET /v1/jobs/{id}` (inline result or `result_url`), and
  `WS /v1/jobs/{id}/events?token=<JWT>` (`status`, `progress` with `stage`, `log`, `result`, `error`, `end`). When a job succeeds, the
  server fetches the result from the service and stores it; results are never taken from the browser. The mock runner solves
  scattering problems (a TypeScript Mie solver that matches miepython to 1e-9, or a quasi-static estimate) and thin films (a
  transfer-matrix solver that matches the library to 1e-9). Its results carry `backend: "web-mock"` and a warning.
- **Studio:** "Open in Studio" links to `${STUDIO_URL}/?spec=<base64url JSON>`, or for large public specs
  `?spec_url=<site>/api/specs/{id}` (CORS-enabled).

## Problems and results

Specs of every problem kind (`scattering`, `layer_stack`, `periodic`, `mode`, `device`, `bands`, `circuit`, `optimization`) are
validated with Ajv against [`fixtures/problem-schema.json`](fixtures/problem-schema.json), the library's `lightsmith schema` output,
picking the schema branch by `kind`. Results of every kind have a viewer: cross sections with near- and far-field maps; R/T/A
spectra with angle, polarization and diffraction orders; waveguide modes (dispersion, mode table, field profiles); S-parameters
(dB, linear, phase); and band diagrams with gap detection.

`fixtures/demo/` holds one problem per kind and the result the library computed for it. They serve as editor examples, seed data and
test references. Rebuild them after library changes; the scripts run in the library's own environment from a sibling checkout at
`../lightsmith`:

```bash
npm run fixtures:schema && npm run fixtures:demo && npm run fixtures:materials
```

## Features and where they live

| Feature | Routes | Code |
|---|---|---|
| Accounts and profiles | `/signin`, `/settings/profile`, `/u/[username]`, `/notifications` | `src/auth.ts`, `src/lib/session.ts` |
| Materials explorer | `/materials`, `/materials/[id]`, `/materials/datasets/[id]`, `/materials/compare`, `/materials/contribute` | `src/lib/materials`, `src/components/materials` |
| Moderation | `/moderation`, `/moderation/materials`, `/moderation/forum`, `/moderation/users` | |
| Projects | `/projects`, `/projects/new`, `/p/[slug]` (permalink and preview image), `/p/[slug]/settings` | `src/app/(site)/p/actions.ts`, `src/lib/results-store.ts` |
| Versions | `/p/[slug]/versions` (history), `/p/[slug]/v/[n]` (permalink), `/p/[slug]/diff?from=&to=`, `/api/projects/[slug]/…` | `src/lib/versions`, `src/components/charts/ResultOverlay.tsx` |
| Embeds and raw JSON | `/embed/results/[id]` (frameable), `/api/specs/[id]`, `/api/results/[id]` | `src/components/charts` |
| Runs | `/api/jobs`, `/api/jobs/[id]`, `/api/jobs/[id]/complete` | `src/components/projects/RunButton.tsx` |
| Forum | `/forum`, `/forum/[category]`, `/forum/t/[id]`, `/forum/new`, `/forum/search` | `src/app/(site)/forum/actions.ts`, `src/lib/forum` |
| Landing, docs, pricing | `/`, `/docs`, `/docs/spec` (generated from the schema), `/docs/agents`, `/docs/platform`, `/pricing` | |
| Health | `/api/health` (database and object storage) | |

## Project versions

Every save of a project's specs (adding, editing or deleting one, restoring, forking) commits an immutable version: number, author,
message, a snapshot of all the project's specs, and the results linked to it. The project points at its current version.

- **Results** are linked to the version whose specs produced them (a job remembers the version it was submitted at) and are carried
  to later versions while their spec is unchanged. A version keeps its own reference to the stored object, so deleting a result
  from the project does not remove it from history; the object is deleted with its last reference.
- **Restore** makes an old version current again as a new version (history is never rewritten). **Fork** copies the project as it
  is, or a specific version, into your account; the fork shows "forked from @owner/project v3".
- **Diff** compares two versions' specs field by field, with the unit taken from the property name (`thickness_nm`, `angle_deg`,
  `wp_ev`), and overlays spectra and cross-section results of the same spec (earlier version dashed).
- **Who may do what:** anyone who can see a project can read its versions (public and unlisted: everyone; private: the owner,
  collaborators and admins). The owner and collaborators (added in the project settings) create versions, restore and run specs;
  only the owner changes settings and collaborators.

| API | |
|---|---|
| `GET /api/projects/{slug}/versions` | History, newest first |
| `POST /api/projects/{slug}/versions` | `{specs: [{id?, name, problem}], message?, base?}`: the full spec set of the new version; `base` (the version you edited) gives 409 if it is stale |
| `GET /api/projects/{slug}/versions/{n}` | One version with its specs and results |
| `GET /api/projects/{slug}/versions/{n}/specs/{i}` | Raw problem JSON (CORS; used by "Open in Studio") |
| `GET /api/projects/{slug}/versions/{n}/results/{id}` | Result JSON (gzip) |
| `POST /api/projects/{slug}/versions/{n}/restore` | `{message?}` |
| `GET /api/projects/{slug}/diff?from=&to=` | Structured spec diff |
| `POST /api/projects/{slug}/fork` | `{version?}` |

POST routes take JSON bodies only and use the session cookie. Private projects answer 404 to anyone who may not see them.

## Accessibility and theming

Semantic colour tokens (`src/app/globals.css`) give light and dark themes, both at WCAG AA contrast. The theme follows the system
setting until the header toggle overrides it. Charts are SVG with a keyboard read-out (arrow keys), legend toggles and a data-table
fallback. The Playwright suite runs axe-core on the landing page in both themes, pricing, a material page, result viewers, a project
and a forum thread.

## Security notes

- Markdown is rendered without raw HTML; links in user content get `rel="nofollow ugc noopener"`, and images are shown as links.
- Only `/embed/*` may be framed by other sites (`frame-ancestors`); everything else is `'self'`.
- Private projects never appear in listings, embeds, preview images or the JSON API for other users.
- Server actions re-check ownership and roles; the forum only accepts attachments from non-private projects.
- There is no password or test-only sign-in path; tests sign in with real magic links through Mailpit.
- The image runs as the unprivileged `node` user.
