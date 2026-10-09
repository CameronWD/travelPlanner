# Backfill env and storage guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the operator backfill scripts load `.env.production.local` and refuse to run against a remote database with local file storage.

**Architecture:** Each backfill entry script imports `scripts/load-env.ts` first (as the `feedback:*` scripts do), then calls a small pure guard in `scripts/lib/storage-target.ts` before any db or storage call, and prints where it is pointed.

**Tech Stack:** TypeScript, tsx, Vitest (node project for `*.test.ts`).

**Spec:** `docs/specs/2026-10-09-backfill-env.md`

## Global Constraints

- Branch `fix/backfill-env-2026-10-09`. Never commit to `main`, never deploy, never run either backfill script or anything against production.
- Never print or log credentials: database user, password and query string must not appear in any output or error message.
- Local hosts are exactly `localhost`, `127.0.0.1`, `::1` (also `[::1]` as URL hostname form).
- Verification: `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. `DATABASE_URL` set but unparseable (typo, missing scheme) → guard throws a clear error, not a crash later.
2. `DATABASE_URL` with credentials and `?sslmode=…` → printed host has neither.
3. `STORAGE_DRIVER` unset (not just `"local"`) with a remote database → treated as local, throws.
4. Import order: `./load-env` must be the first import in each entry script, or `lib/db` reads `DATABASE_URL` before it is loaded.
5. Uppercase or padded driver values (`"R2"`, `" r2 "`) — `getStorage()` itself only accepts exact `"local" | "r2" | "s3"`, so the guard must not be more lenient than the driver: anything other than exact `"r2"`/`"s3"` counts as local.

---

### Task 1: Load env, guard storage target, print target

**Files:**
- Create: `scripts/lib/storage-target.ts`, `scripts/lib/storage-target.test.ts`
- Modify: `scripts/backfill-cover-small.ts`, `scripts/backfill-cover-aspect.ts`

**Interfaces:**
- Produces (`scripts/lib/storage-target.ts`):
  - `export function databaseHost(url: string | undefined): string | null` — hostname (plus `:port` if present) of a parseable URL, else null.
  - `export function assertStorageMatchesDatabase(env: { DATABASE_URL?: string; STORAGE_DRIVER?: string }): void` — throws `Error` per the spec.
  - `export function describeTarget(env: { DATABASE_URL?: string; STORAGE_DRIVER?: string }, dryRun: boolean): string` — e.g. `Target: database ep-x.neon.tech, storage r2, DRY RUN`.

- [ ] **Step 1: Write the failing tests** in `scripts/lib/storage-target.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertStorageMatchesDatabase, databaseHost, describeTarget } from "./storage-target";

const REMOTE = "postgresql://user:s3cret@ep-cool-1.neon.tech:5432/db?sslmode=require";
const LOCAL = "postgresql://trip:trip@localhost:5432/trip";

describe("databaseHost", () => {
  it("returns host and port without credentials or query", () => {
    expect(databaseHost(REMOTE)).toBe("ep-cool-1.neon.tech:5432");
  });
  it("returns null for missing or unparseable URLs", () => {
    expect(databaseHost(undefined)).toBeNull();
    expect(databaseHost("not a url")).toBeNull();
  });
});

describe("assertStorageMatchesDatabase", () => {
  it("throws for local storage against a remote database, naming the R2 variables", () => {
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "local" })).toThrow(/R2_BUCKET_NAME/);
  });
  it("treats an unset or non-exact driver as local", () => {
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: REMOTE })).toThrow();
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "R2" })).toThrow();
  });
  it("allows local storage with a local database", () => {
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: LOCAL, STORAGE_DRIVER: "local" })).not.toThrow();
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: "postgresql://a:b@127.0.0.1/x" })).not.toThrow();
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: "postgresql://a:b@[::1]/x" })).not.toThrow();
  });
  it("allows r2 or s3 with a remote database", () => {
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "r2" })).not.toThrow();
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "s3" })).not.toThrow();
  });
  it("throws a clear error when DATABASE_URL is missing or unparseable", () => {
    expect(() => assertStorageMatchesDatabase({ STORAGE_DRIVER: "r2" })).toThrow(/DATABASE_URL/);
    expect(() => assertStorageMatchesDatabase({ DATABASE_URL: "nope", STORAGE_DRIVER: "r2" })).toThrow(/DATABASE_URL/);
  });
  it("never puts credentials in the error", () => {
    try {
      assertStorageMatchesDatabase({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "local" });
    } catch (e) {
      expect(String(e)).not.toMatch(/s3cret|user:/);
      expect(String(e)).toMatch(/ep-cool-1\.neon\.tech/);
    }
  });
});

describe("describeTarget", () => {
  it("names host, driver and mode without credentials", () => {
    const line = describeTarget({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "r2" }, true);
    expect(line).toBe("Target: database ep-cool-1.neon.tech:5432, storage r2, DRY RUN");
    expect(describeTarget({ DATABASE_URL: LOCAL }, false)).toBe("Target: database localhost:5432, storage local, LIVE");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run scripts/lib/storage-target.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement `scripts/lib/storage-target.ts`:**

```ts
/**
 * Spec 2026-10-09: operator backfills must not read covers from this
 * machine's .uploads/ while writing to a remote (production) database.
 * Pure functions over an env object, so they are testable without
 * touching process.env.
 */

type Env = { DATABASE_URL?: string; STORAGE_DRIVER?: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const REMOTE_DRIVERS = new Set(["r2", "s3"]);

/** Host (and port) of a database URL, never its credentials or query. */
export function databaseHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.hostname) return null;
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    return null;
  }
}

function hostnameOnly(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function driverOf(env: Env): string {
  return REMOTE_DRIVERS.has(env.STORAGE_DRIVER ?? "") ? (env.STORAGE_DRIVER as string) : "local";
}

export function assertStorageMatchesDatabase(env: Env): void {
  const host = env.DATABASE_URL ? hostnameOnly(env.DATABASE_URL) : null;
  if (!host) {
    throw new Error(
      "DATABASE_URL is missing or not a valid URL. Put it in .env.production.local (scripts/load-env.ts loads that file).",
    );
  }
  if (driverOf(env) === "local" && !LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run: the database is ${databaseHost(env.DATABASE_URL)} but storage is local (STORAGE_DRIVER=${env.STORAGE_DRIVER ?? "unset"}), ` +
        "so every cover would be read from this machine's .uploads/ folder. " +
        "Add the production storage settings to .env.production.local: STORAGE_DRIVER=r2 with CLOUDFLARE_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY " +
        "(or STORAGE_DRIVER=s3 with S3_BUCKET_NAME, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).",
    );
  }
}

export function describeTarget(env: Env, dryRun: boolean): string {
  return `Target: database ${databaseHost(env.DATABASE_URL) ?? "unknown"}, storage ${driverOf(env)}, ${dryRun ? "DRY RUN" : "LIVE"}`;
}
```
Run the test — PASS.

- [ ] **Step 4: Wire `scripts/backfill-cover-small.ts`.** Make `import "./load-env";` the first import, with a one-line comment as in `scripts/feedback-pull.ts` (env must be loaded before `lib/db` is imported). Before calling `backfillCoverSmall`, run:

```ts
assertStorageMatchesDatabase(process.env);
console.log(describeTarget(process.env, dryRun));
```
If the guard throws, print the message with `console.error`, set `process.exitCode = 1`, disconnect, and do not run the backfill. Update the header doc comment: it loads `.env.production.local` via `load-env`, and it refuses local storage against a remote database.

- [ ] **Step 5: Wire `scripts/backfill-cover-aspect.ts`** the same way (load-env first; guard + target line at the top of `main()` before `findMany`; header doc updated).

- [ ] **Step 6: Verify** `npx vitest related --run scripts/lib/storage-target.ts scripts/backfill-cover-small.ts scripts/backfill-cover-aspect.ts && npx tsc --noEmit && npx eslint scripts/lib/storage-target.ts scripts/lib/storage-target.test.ts scripts/backfill-cover-small.ts scripts/backfill-cover-aspect.ts`. Also confirm the guard fires without touching any database: `DATABASE_URL=postgresql://x:y@example.invalid/db STORAGE_DRIVER=local npx tsx --conditions=react-server -e 'import("./scripts/lib/storage-target.ts").then(m=>m.assertStorageMatchesDatabase(process.env))'` → prints the refusal. Do NOT run the backfill scripts themselves (load-env would point them at production).

- [ ] **Step 7: Commit** `fix(scripts): backfills load env and refuse local storage against a remote DB`
