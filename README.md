# Trip Planner

A collaborative trip planner built for two partners — plan a multi-stop journey together, track your spending, stay organised on the go, and journal every memory along the way.

## Features

**Plan** — multi-stop itinerary with stops, transport legs, and accommodation; drag-and-drop ordering; timezone-aware Calendar, Day, and Today views with a visual timeline.

**Chapters** — group a long trip into named, coloured legs, with per-chapter budget and itinerary roll-ups; Today view shows the active chapter; the Summary map renders each leg in its own colour.

**Budget** — multi-currency cost tracking (estimated vs actual), live FX rates via Frankfurter (no key required), manual rate override, per-category breakdown, and a home-currency roll-up.

**On the go** — Today view that auto-focuses on the current trip day; interactive Leaflet/OpenStreetMap route map with Nominatim geocoding; offline read-cache via PWA service worker.

**Together** — shared Items list + Wishlist with emoji voting and per-item notes; web-push Reminders; per-day Journal with photo attachments.

**Docs & sharing** — pre-trip and packing Checklists with reusable templates; file Attachments (images, PDFs, text); printable Trip Summary with route map and auto-generated flags; read-only public share links.

**AI** — optional Anthropic-powered activity suggestions and itinerary assistant (env-gated; app works fully without it).

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS v4, Radix UI primitives |
| Language | TypeScript 5 |
| ORM / DB | Prisma 7 with driver adapter; Postgres |
| Auth | Auth.js v5 (NextAuth) — Google OAuth + dev-login shim |
| Maps | Leaflet 1.x + OpenStreetMap tiles + Nominatim geocoding |
| FX rates | Frankfurter public API (no key) |
| Push | web-push (VAPID) |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) |
| Tests | Vitest + Testing Library (808 tests) |

## Local quickstart

### 0. Prerequisites

**Node.js 22 LTS** (or any `20.19+` / `24+`). Prisma 7 and the build toolchain refuse older versions. A `.nvmrc` is included, so with nvm:

```bash
nvm use      # or: nvm install 22
node -v      # must be >= 20.19
```

**Docker** (for the local Postgres container). Any recent Docker Desktop or Docker Engine install is fine.

No external accounts or API keys are needed for local development — it runs on a local Postgres container with a dev-login bypass.

### 1. Install dependencies

```bash
npm install
```

> Native module note: some build-toolchain packages (`@tailwindcss/oxide`, `lightningcss`) are compiled per-platform. Always run `npm install` on your own machine — never copy `node_modules` from elsewhere.

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```
DATABASE_URL="postgresql://trip:trip@localhost:5432/trip?schema=public"
AUTH_SECRET="<output of: openssl rand -base64 32>"
ALLOW_DEV_LOGIN="true"
```

Google OAuth credentials are **not** required for local development — the dev-login buttons bypass OAuth entirely.

### 3. Set up the database

```bash
docker compose up -d        # start local Postgres 16
npx prisma migrate deploy   # apply the committed migration baseline
npm run db:seed             # seed two test users + a Europe Summer 2026 demo trip (London → Paris → Rome)
                            # and the full "AI TRIP - EU Christmas" demo (6-country itinerary, ~45 items,
                            # costs, checklists, journal, attachments, share link, calendar feed, and more)
                            # Re-seed just the AI demo at any time: npm run db:seed:demo  (idempotent)
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in using the dev-login buttons on the sign-in page with either seeded account:

- `you@example.com`
- `partner@example.com`

### Other useful commands

```bash
npm run test      # run the full Vitest suite
npm run build     # production build (requires all required env vars)
npm run lint      # ESLint
```

### Troubleshooting

- **`npm install` fails in `postinstall` / `prisma generate`** — e.g. `Error [ERR_REQUIRE_ESM] ... zeptomatch ... from @prisma/dev`, or `Prisma only supports Node.js versions 20.19+`. Your Node is too old: Prisma 7 needs `>=20.19` (22 LTS recommended), and older Node can't `require()` Prisma's ESM deps. Run `nvm use` (or `nvm install 22 && nvm use 22`), confirm `node -v` is ≥ 20.19, then `rm -rf node_modules package-lock.json && npm install`.
- **`Can't reach database server at localhost:5432`** — the Postgres container isn't running. Start it with `docker compose up -d`, then retry. Check status with `docker compose ps`.
- **Native binding errors (`@tailwindcss/oxide-*`, `lightningcss`, `pg`) during `npm run build`** — usually a `node_modules` copied across platforms. Fix: `rm -rf node_modules package-lock.json && npm install`.

## Design

The UI leans warm and playful — primary typeface is **Fraunces** (display headings) paired with **Plus Jakarta Sans** (body). The palette follows Tailwind CSS v4 semantic tokens with full light/dark mode support. Components are built on Radix UI primitives with class-variance-authority variants.

## Deploy to Vercel (Neon + Cloudflare R2 — free tier)

The app is wired to run for free on Vercel Hobby + Neon (Postgres) + Cloudflare R2 (file storage), with reminders driven by a GitHub Actions cron. The code side is done — Postgres via `@prisma/adapter-pg`, R2 via the `r2` storage driver, and `prisma migrate deploy` runs in the Vercel build, so all migrations apply automatically on deploy. The full runbook is in [`docs/DEPLOY.md`](docs/DEPLOY.md); the condensed flow:

**0. Generate secrets (local shell):**

```bash
openssl rand -base64 32              # AUTH_SECRET
openssl rand -hex 32                 # CRON_SECRET
npx web-push generate-vapid-keys     # VAPID public + private pair
```

**1. Push** the repo to GitHub so Vercel can import it.

**2. Neon (Postgres):** create a project; copy the **pooled** connection string (`-pooler` in the host) → `DATABASE_URL`, and the **direct** one → `DIRECT_URL`. Both with `?sslmode=require`.

**3. Cloudflare R2:** create a bucket; note your **Account ID**; create an **R2 API token** (Object Read & Write) → Access Key ID + Secret.

**4. Google OAuth:** Google Cloud Console → Credentials → OAuth 2.0 Client ID (Web). Redirect URI `https://<your-vercel-domain>/api/auth/callback/google` (the real domain can be added after the first deploy, then redeploy). Copy the Client ID + Secret.

**5. Vercel:** import the GitHub repo (Next.js auto-detected; `vercel.json` sets the build command) and add these **Production** environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** URL |
| `DIRECT_URL` | Neon **direct** URL |
| `AUTH_SECRET` | step 0 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | step 4 |
| `ALLOW_DEV_LOGIN` | `false` |
| `STORAGE_DRIVER` | `r2` |
| `CLOUDFLARE_ACCOUNT_ID` / `R2_BUCKET_NAME` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | step 3 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | step 0 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | same as `VAPID_PUBLIC_KEY` |
| `VAPID_SUBJECT` | `mailto:you@yourdomain.com` |
| `CRON_SECRET` | step 0 |
| `NEXT_PUBLIC_APP_NAME` | e.g. `Trip Planner` |

Deploy. The build runs `prisma migrate deploy` (creating the Neon schema), then `next build`.

**6. After the first deploy:** add the real Vercel domain to the Google redirect URI (step 4) and redeploy. Then in **GitHub → Settings → Secrets and variables → Actions**, add secret `CRON_SECRET` (same value) and variable `APP_URL` = `https://<your-vercel-domain>` (no trailing slash); run the **Reminders cron** workflow once to confirm a 200.

**7. First sign-in:** open the URL, sign in with Google, create your trip, and invite your partner by email on the trip's Settings page. **Don't run `npm run db:seed` against production** — that's demo/sample data; in prod you just create your real trip.

**AI (optional, paid):** add `ANTHROPIC_API_KEY` in Vercel env and redeploy — no code change. See [`docs/HANDOFF.md`](docs/HANDOFF.md) for the deeper external-services guide.
