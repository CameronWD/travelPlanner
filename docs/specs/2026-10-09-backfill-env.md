# Spec 2026-10-09 · Operator backfills load their env and refuse a mismatched storage

Found running `npm run backfill:cover-small -- --dry-run` after the
2026-10-08 batch merged.

## Problem

- `scripts/backfill-cover-small.ts` and `scripts/backfill-cover-aspect.ts`
  never import `scripts/load-env.ts`, unlike the `feedback:*` scripts, so
  `.env.production.local` is not loaded. They fail with "DATABASE_URL is not
  set", or silently use whatever `DATABASE_URL` the shell has.
- With `STORAGE_DRIVER` unset or `local`, `getStorage()` reads `.uploads/` on
  the operator's machine. Against the production database that makes every
  cover "missing": the run is useless and its counts mislead.

## Changes

A. Both backfill entry scripts import `./load-env` first, for its side
   effect, before any import that reads env (same pattern and comment as
   `scripts/feedback-pull.ts`).
B. A shared guard, `scripts/lib/storage-target.ts`:
   `assertStorageMatchesDatabase(env)` throws a clear error when the storage
   driver is `local` (or unset) and the database URL's host is not
   `localhost`/`127.0.0.1`/`::1`. The message names the driver, the database
   host (never credentials), and the variables to set for R2
   (`STORAGE_DRIVER=r2`, `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET_NAME`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) or S3. Both backfill entry
   scripts call it before touching the database or storage, in dry runs too.
C. Both scripts print one line at start: database host (no user, password or
   query string), storage driver, and dry-run or live.
D. Unit tests for the guard (local+remote → throws; local+localhost → ok;
   r2/s3+remote → ok; unparseable URL → throws) and for the host formatter
   (credentials never appear).

## Out of scope

Platform-specific `node_modules` (shared between macOS and the Linux
sandbox). Fetching or storing production storage credentials.
