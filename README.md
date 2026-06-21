# Trip Planner

A collaborative trip planner built for two partners — plan a multi-stop journey together, track your spending, stay organised on the go, and journal every memory along the way.

## Features

**Plan** — multi-stop itinerary with stops, transport legs, and accommodation; drag-and-drop ordering; timezone-aware Calendar, Day, and Today views with a visual timeline.

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
| ORM / DB | Prisma 7 with driver adapter; SQLite (dev) / Postgres (prod) |
| Auth | Auth.js v5 (NextAuth) — Google OAuth + dev-login shim |
| Maps | Leaflet 1.x + OpenStreetMap tiles + Nominatim geocoding |
| FX rates | Frankfurter public API (no key) |
| Push | web-push (VAPID) |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) |
| Tests | Vitest + Testing Library (808 tests) |

## Local quickstart

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="<output of: openssl rand -base64 32>"
ALLOW_DEV_LOGIN="true"
```

Google OAuth credentials are **not** required for local development — the dev-login buttons bypass OAuth entirely.

### 3. Set up the database

```bash
npx prisma migrate dev   # create dev.db and run migrations
npm run db:seed          # seed two test users and a sample trip
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

## Design

The UI leans warm and playful — primary typeface is **Fraunces** (display headings) paired with **Plus Jakarta Sans** (body). The palette follows Tailwind CSS v4 semantic tokens with full light/dark mode support. Components are built on Radix UI primitives with class-variance-authority variants.

## Production deployment

See [`docs/HANDOFF.md`](docs/HANDOFF.md) for the full production deployment and external-services guide, including Postgres wiring, Google OAuth setup, file storage (R2/S3), web-push VAPID keys, cron scheduling, and the AI assistant.
