# Production Deployment & Handoff Guide

This document covers everything you need to wire up external services and deploy Trip Planner to production. Read it top to bottom before touching any infrastructure.

---

## Overview — what runs with zero external accounts

The following work out of the box in local development with no external accounts or API keys:

| Feature | Local default |
|---|---|
| Database | SQLite (`file:./dev.db`) via Prisma + better-sqlite3 |
| Auth | Dev-login shim (`ALLOW_DEV_LOGIN="true"`) — no OAuth required |
| FX rates | Frankfurter public API — no key |
| Maps / geocoding | Leaflet + OpenStreetMap + Nominatim — no key |
| File uploads | Local disk (`.uploads/` at repo root) |

The following are **disabled gracefully** without config — the UI hides or disables those features:

| Feature | Disabled when… |
|---|---|
| Google sign-in | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` absent |
| Web-push notifications | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` absent |
| Reminder delivery | `CRON_SECRET` absent or cron not wired |
| AI assistant | `ANTHROPIC_API_KEY` absent |

In production you need: Postgres, Google OAuth, a strong `AUTH_SECRET`, and `ALLOW_DEV_LOGIN="false"`. Everything else is optional but recommended.

---

## 1. Database (Postgres)

> **Status: done.** The app now ships on Postgres (`@prisma/adapter-pg`) with a committed Postgres migration baseline. The steps below are background; for the actual deploy follow `docs/DEPLOY.md`.

### Why you need to switch

The local dev setup uses SQLite via `@prisma/adapter-better-sqlite3`. Postgres is strongly recommended for production (concurrent writes, proper connection pooling, managed backups).

### Current setup — what the code actually does

**`prisma/schema.prisma`** — datasource provider is set to `"sqlite"`. The connection URL is NOT in this file; it is passed via `prisma.config.ts`.

**`prisma.config.ts`** — Prisma 7 config file. Sets `datasource.url` from the `DATABASE_URL` environment variable and points at `prisma/migrations/`.

**`lib/db.ts`** — constructs the `PrismaClient` with a driver adapter:

```ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
const adapter = new PrismaBetterSqlite3({ url });
return new PrismaClient({ adapter });
```

Prisma 7 requires an explicit driver adapter — the client will not fall back to the built-in sqlite engine.

### Steps to switch to Postgres

1. **Change the datasource provider** in `prisma/schema.prisma`:

   ```prisma
   datasource db {
     provider = "postgresql"
   }
   ```

2. **Swap the driver adapter** in `lib/db.ts`. Install the Postgres adapter:

   ```bash
   npm install @prisma/adapter-pg pg
   npm install -D @types/pg
   ```

   Then update `lib/db.ts`:

   ```ts
   import { PrismaClient } from "@prisma/client";
   import { PrismaPg } from "@prisma/adapter-pg";

   function createPrismaClient() {
     const url = process.env.DATABASE_URL ?? "";
     const adapter = new PrismaPg({ connectionString: url });
     return new PrismaClient({ adapter });
   }
   ```

   For Neon (serverless Postgres) use `@prisma/adapter-neon` instead:

   ```bash
   npm install @prisma/adapter-neon @neondatabase/serverless
   ```

   ```ts
   import { PrismaClient } from "@prisma/client";
   import { PrismaNeon } from "@prisma/adapter-neon";
   import { neonConfig, Pool } from "@neondatabase/serverless";
   import ws from "ws";
   neonConfig.webSocketConstructor = ws;

   function createPrismaClient() {
     const pool = new Pool({ connectionString: process.env.DATABASE_URL });
     const adapter = new PrismaNeon(pool);
     return new PrismaClient({ adapter });
   }
   ```

3. **Set `DATABASE_URL`** to your Postgres connection string:

   ```
   DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
   ```

4. **Regenerate the migration history for Postgres.** The committed migrations
   under `prisma/migrations/` are **SQLite-specific DDL** (and `migration_lock.toml`
   pins `provider = "sqlite"`), so `prisma migrate deploy` will *not* apply them to
   Postgres. For the first Postgres deploy you must create a Postgres migration
   baseline. Two options:

   - **Simplest (fresh DB):** delete the existing `prisma/migrations/` folder, then
     against your empty Postgres database run:

     ```bash
     npx prisma migrate dev --name init   # generates Postgres DDL + applies it
     ```

     Commit the new migration, and use `npx prisma migrate deploy` in CI/CD from then on.

   - **Or, no migration files:** push the schema directly to a fresh Postgres DB:

     ```bash
     npx prisma db push
     ```

   Either way you end up with Postgres-correct DDL. (`migrate deploy` is still the
   right command for *subsequent* deploys once a Postgres baseline exists — use it
   in CI/CD, not `migrate dev`.)

> **Schema compatibility note:** The schema deliberately avoids Prisma `enum` and `Json` field types to stay portable across SQLite and Postgres. All enum-ish values are stored as `String`; all JSON-ish data is stored as `String` of JSON. Switching providers requires only the one-line `provider` change in `schema.prisma` **plus regenerating the migration baseline** (step 4 above) — no model/field changes are needed.

---

## 2. Auth (Google OAuth)

### Create OAuth credentials

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create an **OAuth 2.0 Client ID** (type: Web application).
3. Add an authorised redirect URI:
   ```
   https://<your-domain>/api/auth/callback/google
   ```
4. Copy the **Client ID** and **Client Secret**.

### Environment variables

```
AUTH_GOOGLE_ID="<your-google-client-id>"
AUTH_GOOGLE_SECRET="<your-google-client-secret>"
AUTH_SECRET="<strong random secret — openssl rand -base64 32>"
ALLOW_DEV_LOGIN="false"
```

`AUTH_SECRET` is used by Auth.js to sign and encrypt session tokens. Generate a fresh one; never reuse the dev value.

### How the dev-login bypass is gated

In `lib/auth.ts`, the Credentials provider (dev login) is only registered when `ALLOW_DEV_LOGIN === "true"`:

```ts
if (process.env.ALLOW_DEV_LOGIN === "true") {
  providers.push(Credentials({ ... }));
}
```

Set `ALLOW_DEV_LOGIN="false"` (or omit it) in production and the bypass is completely absent from the auth stack.

### How partners join a trip

A trip owner invites a partner by email on the trip's Settings page. This creates an `Invite` record in the database. When the invited partner signs in with that Google email, the Auth.js `signIn` event fires and calls `acceptPendingInvitesForUser` (in `lib/invites.ts`), which:

1. Looks up all un-accepted invites for that email.
2. Creates a `TripMember` row for each matching trip the user is not already a member of.
3. Marks the invite as accepted.

The relevant files are `lib/invites.ts` (pure acceptance logic) and `lib/auth.ts` (the `events.signIn` hook that calls it). No manual step is required — the partner just signs in and is auto-added.

---

## 3. File Storage

### Local development

Files are written to `.uploads/<key>` at the repo root (`lib/storage.ts` → `localDiskStorage`). This directory is git-ignored and created on demand.

### Production

> **Status: done.** The `r2`/`s3` driver is implemented in `lib/storage.ts`. Just set the env vars.

The `r2`/`s3` driver is fully implemented in `lib/storage.ts` (`makeS3Storage`); `@aws-sdk/client-s3` is already a dependency. No code changes are required — just set the environment variables for the chosen backend.

**For Cloudflare R2**, set:

```
STORAGE_DRIVER="r2"
CLOUDFLARE_ACCOUNT_ID="<account id>"
R2_BUCKET_NAME="<bucket name>"
R2_ACCESS_KEY_ID="<R2 access key>"
R2_SECRET_ACCESS_KEY="<R2 secret key>"
```

**For AWS S3**, set:

```
STORAGE_DRIVER="s3"
AWS_REGION="<region>"
S3_BUCKET_NAME="<bucket name>"
AWS_ACCESS_KEY_ID="<access key>"
AWS_SECRET_ACCESS_KEY="<secret key>"
```

The attachment serve route (`app/api/attachments/[id]/route.ts`) streams bytes from `storage.read()`. In production you may prefer to redirect to signed URLs instead of proxying — that requires changing the serve route logic but avoids bandwidth costs.

---

## 4. FX Rates

Powered by the [Frankfurter API](https://frankfurter.dev/) (`https://api.frankfurter.dev`). No API key is required. Rate lookups are cached in the `ExchangeRate` table per trip.

Users can manually override any rate on the Budget page — the manual flag is stored alongside the rate and prevents automatic refresh for that currency pair.

---

## 5. Maps

Powered by [Leaflet](https://leafletjs.com/) with [OpenStreetMap](https://www.openstreetmap.org/) tiles and [Nominatim](https://nominatim.org/) for geocoding. No API key is required for either service.

---

## 6. Reminders / Web Push

> The repo ships a GitHub Actions cron (`.github/workflows/reminders-cron.yml`) — the recommended path on Vercel Hobby (whose own cron is daily-only).

### Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

This prints a public/private key pair. Copy them.

### Environment variables

```
VAPID_PUBLIC_KEY="<VAPID public key>"
VAPID_PRIVATE_KEY="<VAPID private key>"
VAPID_SUBJECT="mailto:you@yourdomain.com"
NEXT_PUBLIC_VAPID_PUBLIC_KEY="<same public key as VAPID_PUBLIC_KEY>"
CRON_SECRET="<random secret — openssl rand -hex 32>"
```

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` must match `VAPID_PUBLIC_KEY`. It is exposed to the browser for the push subscription registration in `components/trip/enable-notifications.tsx`.

Without VAPID vars, push is disabled and notifications are stored but never delivered (no crash, graceful degradation).

### Wire up the cron job

The reminder delivery endpoint is `GET /api/cron/reminders`. It is authenticated via the `CRON_SECRET`:

- **Authorization header**: `Authorization: Bearer <CRON_SECRET>` (preferred — stays out of logs)
- **Query param**: `?secret=<CRON_SECRET>` (Vercel Cron compatible)

Without `CRON_SECRET` the endpoint returns `401` for all requests (fail-closed).

**Vercel Cron** — add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/reminders?secret=<CRON_SECRET>",
      "schedule": "* * * * *"
    }
  ]
}
```

**GitHub Actions** (provider-agnostic):

```yaml
on:
  schedule:
    - cron: "* * * * *"
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -f -H "Authorization: Bearer $CRON_SECRET" \
            https://<your-domain>/api/cron/reminders
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

---

## 7. AI Assistant (optional)

Get an API key at [https://console.anthropic.com/](https://console.anthropic.com/).

```
ANTHROPIC_API_KEY="<your-anthropic-api-key>"
AI_MODEL="claude-opus-4-8"   # optional; this is the default
```

`AI_MODEL` accepts any Anthropic model ID. Use `claude-sonnet-4-6` or `claude-haiku-4-5` for lower cost. Without `ANTHROPIC_API_KEY` the AI UI is disabled — all other features work normally.

---

## 8. Suggested production stack

| Component | Suggestion |
|---|---|
| Hosting | Vercel (Next.js native) |
| Database | Neon (serverless Postgres) |
| File storage | Cloudflare R2 |
| Cron | Vercel Cron |
| Monitoring | Vercel Analytics or your own |

The app is platform-agnostic and will run on any Node.js host (Railway, Fly.io, AWS App Runner, etc.) — the Vercel+Neon+R2 stack is a convenient default, not a requirement.

---

## 9. Environment variable reference

| Variable | Required in prod? | Purpose | Where to get it |
|---|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string | Your Postgres provider (Neon, Supabase, etc.) |
| `AUTH_SECRET` | Yes | Auth.js session signing key | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | Yes | Google OAuth client ID | Google Cloud Console |
| `AUTH_GOOGLE_SECRET` | Yes | Google OAuth client secret | Google Cloud Console |
| `ALLOW_DEV_LOGIN` | Yes (set `"false"`) | Disable dev-login bypass | Set to `"false"` in production |
| `NEXT_PUBLIC_APP_NAME` | No | App name shown in the UI | Any string; defaults gracefully |
| `STORAGE_DRIVER` | Yes (unless local) | Storage backend: `"local"`, `"r2"`, or `"s3"` | Set to `"r2"` or `"s3"` |
| `CLOUDFLARE_ACCOUNT_ID` | If `STORAGE_DRIVER=r2` | Cloudflare account ID | Cloudflare dashboard |
| `R2_BUCKET_NAME` | If `STORAGE_DRIVER=r2` | R2 bucket name | Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | If `STORAGE_DRIVER=r2` | R2 access key | Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | If `STORAGE_DRIVER=r2` | R2 secret key | Cloudflare R2 |
| `AWS_REGION` | If `STORAGE_DRIVER=s3` | AWS region | AWS console |
| `S3_BUCKET_NAME` | If `STORAGE_DRIVER=s3` | S3 bucket name | AWS S3 |
| `AWS_ACCESS_KEY_ID` | If `STORAGE_DRIVER=s3` | AWS access key | AWS IAM |
| `AWS_SECRET_ACCESS_KEY` | If `STORAGE_DRIVER=s3` | AWS secret key | AWS IAM |
| `VAPID_PUBLIC_KEY` | No (push disabled) | Server-side VAPID public key | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | No (push disabled) | Server-side VAPID private key | `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | No (push disabled) | VAPID subject (`mailto:` or `https:`) | Your contact email/URL |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | No (push disabled) | Browser-side VAPID public key (must match `VAPID_PUBLIC_KEY`) | Copy from `VAPID_PUBLIC_KEY` |
| `CRON_SECRET` | No (reminders not sent) | Protects `/api/cron/reminders` | `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | No (AI disabled) | Enables AI assistant features | [console.anthropic.com](https://console.anthropic.com/) |
| `AI_MODEL` | No | Anthropic model ID (default: `claude-opus-4-8`) | Any valid Anthropic model ID |

---

## 10. Known limitations & fast-follows

A pre-ship hardening review fixed all blocking issues (multi-currency budget
correctness, a stored-XSS vector, a service-worker cross-user cache leak, error
boundaries, orphaned file blobs, constant-time cron auth). The following are
**known, low-severity, accepted-for-now** items — none are data-loss or security
holes, but they're worth a fast-follow:

- **Concurrent reorder is last-write-wins.** Stop / checklist reordering does a
  read-then-swap of `sortOrder`. If both partners reorder the *same* list within
  the same instant, the orders can transpose. It's visually obvious and fixed by
  re-dragging; no data is lost. A future fix would do the swap inside an
  interactive transaction (or model order as `@@unique([tripId, sortOrder])`).
- **Cost + FX-rate snapshot are written separately.** Creating a cost caches the
  FX rate, then writes the cost in a second statement. If the cost write fails
  after the rate is cached, you're left with a harmless cached rate (identical to
  the state after merely viewing the budget page) — no corruption. Not wrapped in
  one transaction because the rate resolution makes a network call, which
  shouldn't hold a DB transaction open.
- **Duplicate pending invites are possible under a race.** Inviting the same
  email twice simultaneously can create two pending `Invite` rows. Acceptance
  de-dupes membership, so it's cosmetic (two rows in the settings list). A
  `@@unique([tripId, email])` constraint would close it.
- **FX staleness threshold differs by view.** The `/api/fx` route treats rates
  older than 5 minutes as stale while the budget page uses 24 hours, so the same
  rate pair can render a different "stale" badge in two places. Consolidate onto
  one threshold in `lib/fx.ts`.
