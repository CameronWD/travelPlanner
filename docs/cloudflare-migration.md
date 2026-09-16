# Cloudflare Workers migration — parked 2026-09-16

We investigated moving the app from Vercel (Hobby) to Cloudflare Workers,
proved it viable in a spike, and then deliberately stopped. This document
records what was learned so a future migration doesn't rediscover any of it.

**Status: parked, not abandoned.** The spike lives on branch
`spike/cloudflare` (commit `be662e8`). Do not delete, merge, or rebase it.

## Why we stopped

Workers **Free** caps CPU at **10 ms per request** — a Next.js SSR app cannot
fit inside that. Workers **Paid** ($5/month) raises it to 30 s. The app runs
fine under Paid limits, but $5/month wasn't worth it at the time of the
decision. Note the Worker **startup** limit (top-level module evaluation,
including WASM compilation) is **1 second on both plans** — not the 400 ms
sometimes quoted.

Correction worth recording: Cloudflare **removed the 3 MiB compressed bundle
limit on 2026-09-04** in favour of a **64 MiB uncompressed limit on all
plans**. Our built Worker is 10,645 KiB raw (3.4 MiB gzipped) — fine.
Cloudflare's own limits table still showed the old 3 MiB / 10 MiB rows after
the change; it's stale. Bundle size is NOT a blocker despite what older docs
(and our own Phase 1 report, written pre-correction) say.

## Phase 0 findings (investigation, nothing changed)

- **`proxy.ts` is a defensive Auth.js cookie guard, not auth gating.** It is
  the Next 16 middleware (renamed from `middleware.ts`), matcher
  `/api/auth/:path*` only. It strips/expires a poisoned `authjs.callback-url`
  cookie that would otherwise 500-lock the browser out of sign-in. No
  Node-only APIs — fully edge-safe. An earlier automated pass reported
  "middleware not found"; that was wrong.
- **Storage** (`lib/storage.ts`): one `Storage` interface, driver picked by
  `STORAGE_DRIVER` (`local` = repo-root `.uploads/`, `r2`/`s3` = S3 API via
  `@aws-sdk/client-s3` with credentials). At the time, `node:fs/promises` was
  imported unconditionally — a Workers bundle problem. (Post-park, the serve
  routes gained presigned-URL redirects; the driver split is still undone.)
- **Prisma**: driver adapter `@prisma/adapter-pg` over TCP — Workers can't do
  raw TCP pools (see Phase 1). `DATABASE_URL` = pooled (runtime),
  `DIRECT_URL` = unpooled, used **only** by `prisma.config.ts` for
  migrations.
- **Neon region: AWS ap-southeast-2 (Sydney)** — the smart-placement target
  for any future Worker.
- `vercel.json` declared no crons (see process corrections below for what
  that did and didn't mean).

## Phase 1 findings (spike, branch `spike/cloudflare`, commit `be662e8`)

What works:

- **vinext works and `vinext init` is non-destructive** — `next dev` /
  `next build` keep working. Minimal config used: `--platform=cloudflare
  --cdn-cache=none --data-cache=none --image-optimization=none`.
- **No Durable Objects in the minimal config** — bindings are just `ASSETS`
  (plus our R2 bucket), **so PR preview URLs survive**. Only the
  `response-store` CDN cache in *self-contained* mode adds a DO to the app
  Worker; service-binding mode puts the DO in a separate Worker; the
  `workers-cache` and `kv` options add no DO.
- **All 112 server actions across ~30 files compiled with zero breakages**;
  `createTrip` (interactive transaction) and `uploadAttachment` (12 MB body
  path) ran end-to-end on the built Worker against production Neon. vinext
  enforces the `serverActions.bodySizeLimit` (12mb) faithfully.
- **`proxy.ts` executes correctly under vinext** — verified by sending a
  poisoned callback-url cookie: stripped before `@auth/core`, expiry cookie
  emitted. (The vinext compatibility scanner flags next-auth as unsupported;
  empirically it works.)
- **web-push works under `nodejs_compat`** — ECDH keygen, VAPID ES256
  signing, aes128gcm payload encryption, and a real HTTPS POST to Mozilla's
  push service all succeeded. **Caveat: this was against a deliberately fake
  subscription from a local (undeployed) Worker — real-device delivery has
  never been validated anywhere** (see "reminders reality check" below).
- **Neon cold start ≈ 950 ms** after scale-to-zero (11-min idle test:
  1.02 s first DB request vs 68 ms warm; independently reproduced from Node
  at 946 ms).
- Auth.js v5 JWT sessions work on workerd (CSRF → sign-in → JWT → protected
  pages). Local-dev quirk: vinext sets `x-forwarded-host` but **not**
  `x-forwarded-proto`, so over plain http, RSC `auth()` assumes https and
  misses the non-`__Secure-` cookies; setting `AUTH_URL` flips which half
  works. Production https is consistent either way. Worth an upstream issue.

The two hard blockers (both solved on the spike):

1. **Prisma's default generator inlines the query-compiler WASM as base64 and
   compiles it at runtime — the Workers embedder disallows that**
   (`WebAssembly.Module(): Wasm code generation disallowed`). Fix: the
   Prisma 7 `prisma-client` generator with `runtime = "workerd"` (output to
   `lib/generated/prisma`), which imports the WASM as a module.
2. **A module-scope pg TCP pool violates Workers' per-request I/O rules** —
   a socket created in one request context is cancelled when reused from
   another ("promise resolved from a different request context"). Fix:
   `@prisma/adapter-neon` + `@neondatabase/serverless` with
   `neonConfig.poolQueryViaFetch = true` (plain queries over stateless HTTP)
   and `idleTimeoutMillis: 1` so transaction WebSockets aren't retained.
   The idle-timeout trick is a spike hack; the clean design is a
   request-scoped client (or accepting per-transaction connection setup).

## Reminders reality check (recorded 2026-09-16)

The reminders feature has **zero production usage**: no `Reminder` rows ever,
no `COST_DUE` markers, no push subscriptions. None of the reminder pipeline
has ever been exercised end-to-end in production. Phase 1's web-push success
proves the crypto and the HTTP path under `nodejs_compat`, not delivery to a
real device — that remains unvalidated on **both** platforms.

## Process corrections (how our own findings went wrong)

- **Phase 0 said "nothing triggers the reminders route" — wrong.** A GitHub
  Actions workflow (`.github/workflows/reminders-cron.yml`) had existed since
  2 Aug. `vercel.json` alone is not sufficient evidence about what schedules
  a route; check `.github/workflows/` (and any external pingers) too.
- **The ~950 ms Neon cold start is itself evidence about cron state**, not
  just a latency number: a working */5 cron would have kept Neon awake, so
  the measurement proved the cron wasn't reaching production. Infrastructure
  measurements can answer questions they weren't taken for.

## What's already solved on `spike/cloudflare` (be662e8)

- vinext + Vite + wrangler wiring (`vite.config.ts`, `wrangler.jsonc`,
  `dev:vinext` / `build:vinext` / `start:vinext` / `deploy:vinext` scripts).
- The workerd-runtime Prisma generator config and the `lib/db.ts` swap to
  `@prisma/adapter-neon` (with the pool caveats above).
- An R2-binding storage driver (`STORAGE_DRIVER="r2-binding"`, dynamic
  `import("cloudflare:workers")`) — upload → binding `put` → serve → binding
  `get` verified byte-identical under wrangler's local R2 simulation.
  Vitest cannot resolve `cloudflare:workers` even behind `@vite-ignore`, so
  the real implementation should live in its own module that Node never
  imports (the same split the local-fs driver needs).
- Spike-only probe routes (`app/spike-debug`, `app/api/spike-push`) — never
  merge these.

## The open question that decides a future migration's shape

**Does a Prisma client generated with `runtime = "workerd"` also run on
Node?** Next 16's Turbopack *compiles* the workerd client's WASM import fine
on the Vercel path (verified), but we never executed it on Node. If it runs,
one generated client serves both platforms and the migration can keep Vercel
deployable at every commit; if not, `lib/db.ts` needs a per-platform client
(dual generators or conditional import), which is where most of the real 2c
work would be.

## Still unmeasured (needs Cloudflare account credentials)

Real-R2 latency through the binding, an actual deploy, preview URLs in
practice, edge cold start, and Auth.js Google sign-in on a deployed URL.
The sandbox the spike ran in had no Cloudflare credentials; everything R2
ran on wrangler's local simulation.
