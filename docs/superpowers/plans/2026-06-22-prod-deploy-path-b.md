# Production Deployment (Path B: Vercel + Neon + R2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Trip Planner deployable to a free Vercel + Neon (Postgres) + Cloudflare R2 stack with every feature working except the (optional, env-gated) AI assistant.

**Architecture:** Realize the already-documented target (ADR 0003). Move local dev and production both onto **Postgres** via the `@prisma/adapter-pg` driver with a single committed migration baseline (ADR 0005). Implement the **R2/S3** object-storage driver that the storage factory currently stubs. Wire **web-push reminders** via a free GitHub Actions cron (Vercel Hobby cron is daily-only). Auth is Google OAuth only in prod. Everything else (maps, FX, share links, ICS feed) already works unchanged.

**Tech Stack:** Next.js 16, Prisma 7 (`@prisma/adapter-pg` + `pg`), Postgres (Neon in prod, `postgres:16` in docker for local), `@aws-sdk/client-s3` (R2), Auth.js v5 (Google), web-push, Vitest.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `package.json` | Modify | Swap SQLite deps for `@prisma/adapter-pg`, `pg`, `@aws-sdk/client-s3`, `@types/pg` |
| `lib/db.ts` | Modify | Construct PrismaClient with the Postgres adapter |
| `prisma/schema.prisma` | Modify | `provider = "postgresql"` |
| `prisma.config.ts` | Modify | Migrations use the direct (unpooled) connection |
| `prisma/migrations/**` | Replace | New Postgres migration baseline + provider lock |
| `lib/storage.ts` | Modify | Real S3-compatible (R2/S3) storage impl replacing the stub |
| `lib/storage.test.ts` | Modify | Tests for the R2 driver (SDK mocked) |
| `lib/auth.ts` | Modify | `trustHost: true` for prod callback URLs |
| `vercel.json` | Create | Build command runs `prisma migrate deploy` before `next build` |
| `.github/workflows/reminders-cron.yml` | Create | Every-5-min cron hitting `/api/cron/reminders` |
| `docker-compose.yml` | Create | Local Postgres 16 for dev |
| `.env.example` | Modify | Postgres + R2 + auth + push + cron env contract |
| `README.md` | Modify | Quickstart switched to Postgres/Docker |
| `docs/HANDOFF.md` | Modify | Mark Postgres/R2 realized; fix stale Leaflet-CDN note |
| `docs/DEPLOY.md` | Create | Copy-paste runbook for the human (accounts, secrets, deploy) |

Tasks 2–8 each depend only on Task 1 (which fixes deps + the build). They are otherwise independent.

---

### Task 1: Switch the DB layer to Postgres (deps + adapter + schema + config)

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `lib/db.ts`
- Modify: `prisma/schema.prisma:17`
- Modify: `prisma.config.ts`

> Context: The unit suite mocks `@/lib/db` in all 21 DB-touching tests, so the engine change cannot break tests. The clean reinstall also repairs the cross-platform native-binding issue (the committed lockfile was generated on macOS), so `npm run build` works again afterwards.

- [ ] **Step 1: Edit `package.json` dependencies**

In `"dependencies"`, **remove** these two lines:
```jsonc
    "@prisma/adapter-better-sqlite3": "^7.8.0",
    "better-sqlite3": "^12.11.1",
```
and **add** (keep alphabetical-ish ordering near the other `@`/lib entries):
```jsonc
    "@aws-sdk/client-s3": "^3.700.0",
    "@prisma/adapter-pg": "^7.8.0",
    "pg": "^8.13.0",
```
In `"devDependencies"`, **add**:
```jsonc
    "@types/pg": "^8.11.0",
```

- [ ] **Step 2: Clean reinstall (also fixes the build's native binding)**

Run:
```bash
rm -rf node_modules package-lock.json && npm install
```
Expected: completes with `INSTALL_EXIT=0`-equivalent (no error). This regenerates `package-lock.json` for the current platform.

- [ ] **Step 3: Replace `lib/db.ts` with the Postgres adapter**

Full new contents of `lib/db.ts`:
```ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma client singleton.
 *
 * Prisma 7 requires a driver adapter. We use @prisma/adapter-pg, which talks to
 * any Postgres over TCP — a local docker-compose Postgres in dev, and Neon's
 * pooled connection string in production. DATABASE_URL is the *pooled* URL used
 * by the running app; migrations use the direct URL (see prisma.config.ts).
 *
 * We cache the instance on globalThis so Next.js's dev hot-reload doesn't spin
 * up a new client (and a new pool) on every module reload.
 */
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL ?? "";
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
```

- [ ] **Step 4: Flip the schema provider**

In `prisma/schema.prisma`, change the datasource block's provider line:
```prisma
  provider = "sqlite"
```
to:
```prisma
  provider = "postgresql"
```

- [ ] **Step 5: Point migrations at the direct connection in `prisma.config.ts`**

Full new contents of `prisma.config.ts`:
```ts
import "dotenv/config";
import { defineConfig } from "@prisma/config";

/**
 * Prisma 7 config. The datasource connection URL and the seed command live
 * here (no longer in schema.prisma). `.env` is loaded via `dotenv/config`
 * above because Prisma 7's CLI does not auto-load it.
 *
 * Migrations run against the DIRECT (unpooled) connection. Neon's pooled
 * endpoint (PgBouncer) can't run all migration statements; the running app
 * uses the pooled DATABASE_URL via the driver adapter in lib/db.ts. Locally,
 * DIRECT_URL and DATABASE_URL are the same docker Postgres.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
```

- [ ] **Step 6: Verify tests still pass and the build works**

Run:
```bash
npm run test
```
Expected: all tests pass (`Tests  878 passed` or more), exit 0.

Run:
```bash
npm run build
```
Expected: build completes successfully (exit 0). If it fails on a native binding (`@tailwindcss/oxide-*` / `lightningcss`), re-run Step 2's clean reinstall once more, then rebuild.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/db.ts prisma/schema.prisma prisma.config.ts
git commit -m "feat(db): switch Prisma to the Postgres driver adapter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Regenerate the Postgres migration baseline

**Files:**
- Replace: `prisma/migrations/` (delete SQLite migrations, create a Postgres baseline)
- Replace: `prisma/migrations/migration_lock.toml`

> Context: The committed migrations are SQLite DDL and `migration_lock.toml` pins `sqlite`, so `prisma migrate deploy` would refuse them on Postgres. We generate Postgres DDL straight from the schema with `migrate diff` — no live database required.

- [ ] **Step 1: Remove the SQLite migration history**

Run:
```bash
rm -rf prisma/migrations
mkdir -p prisma/migrations/0_init
```

- [ ] **Step 2: Generate the Postgres baseline DDL from the schema**

Run:
```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql
```
Expected: `prisma/migrations/0_init/migration.sql` is created and non-empty.

- [ ] **Step 3: Write the provider lock**

Create `prisma/migrations/migration_lock.toml` with exactly:
```toml
# Please do not edit this file manually
# It should be added in your version-control system (e.g., Git)
provider = "postgresql"
```

- [ ] **Step 4: Verify the DDL is Postgres (not SQLite) and the schema validates**

Run:
```bash
npx prisma validate
```
Expected: `The schema at prisma/schema.prisma is valid 🚀` (exit 0).

Run:
```bash
grep -c "DATETIME\|PRAGMA" prisma/migrations/0_init/migration.sql; \
grep -c "TIMESTAMP\|CREATE TABLE" prisma/migrations/0_init/migration.sql
```
Expected: first count is `0` (no SQLite-isms); second count is `> 0` (Postgres tables present).

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations
git commit -m "feat(db): regenerate migration baseline for Postgres

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Implement the R2/S3 storage driver (TDD)

**Files:**
- Modify: `lib/storage.ts` (replace `prodStubStorage` with a real S3-compatible impl)
- Test: `lib/storage.test.ts` (add an R2-driver describe block, SDK mocked)

> Context: `getStorage()` returns a stub that throws for `"r2"`/`"s3"`. The attachment serve route calls `getStorage().read(key)` and treats `null` as 404, so `read` must return `null` for a missing object and a `Buffer` otherwise. `@aws-sdk/client-s3` was installed in Task 1.

- [ ] **Step 1: Write the failing tests**

Add to the **top** of `lib/storage.test.ts`, immediately after the existing first import line (`import { describe, it, expect, afterEach } from "vitest";`), extend that import to include `vi`, `beforeEach`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
```
(Replace the existing `import { describe, it, expect, afterEach } from "vitest";` line with the one above.)

Then add this block at the **end** of `lib/storage.test.ts`:
```ts
// ---------------------------------------------------------------------------
// S3-compatible storage (R2) — SDK mocked, no network
// ---------------------------------------------------------------------------

const sendMock = vi.fn();
vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = sendMock;
  }
  class PutObjectCommand {
    constructor(public input: unknown) {}
  }
  class GetObjectCommand {
    constructor(public input: unknown) {}
  }
  class DeleteObjectCommand {
    constructor(public input: unknown) {}
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
});

describe("S3-compatible storage (R2 driver)", () => {
  const R2_ENV: Record<string, string> = {
    STORAGE_DRIVER: "r2",
    CLOUDFLARE_ACCOUNT_ID: "acct123",
    R2_BUCKET_NAME: "trip-files",
    R2_ACCESS_KEY_ID: "ak",
    R2_SECRET_ACCESS_KEY: "sk",
  };
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    sendMock.mockReset();
    saved = {};
    for (const [k, v] of Object.entries(R2_ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
  });

  afterEach(() => {
    for (const k of Object.keys(R2_ENV)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("save() sends a PutObjectCommand with bucket, key, body, content-type", async () => {
    sendMock.mockResolvedValueOnce({});
    const { getStorage } = await import("./storage");
    await getStorage().save("trips/t1/uid-a.png", Buffer.from("img"), "image/png");
    expect(sendMock).toHaveBeenCalledTimes(1);
    const cmd = sendMock.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input).toMatchObject({
      Bucket: "trip-files",
      Key: "trips/t1/uid-a.png",
      ContentType: "image/png",
    });
    expect((cmd.input.Body as Buffer).toString()).toBe("img");
  });

  it("read() returns a Buffer of the object bytes", async () => {
    sendMock.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([104, 105]) },
    });
    const { getStorage } = await import("./storage");
    const buf = await getStorage().read("trips/t1/uid-a.png");
    expect(buf?.toString()).toBe("hi");
  });

  it("read() returns null when the object is missing (NoSuchKey)", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { name: "NoSuchKey" }),
    );
    const { getStorage } = await import("./storage");
    expect(await getStorage().read("trips/t1/missing.png")).toBeNull();
  });

  it("read() rethrows non-not-found errors", async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { name: "AccessDenied" }),
    );
    const { getStorage } = await import("./storage");
    await expect(getStorage().read("trips/t1/x.png")).rejects.toThrow(/boom/);
  });

  it("delete() sends a DeleteObjectCommand", async () => {
    sendMock.mockResolvedValueOnce({});
    const { getStorage } = await import("./storage");
    await getStorage().delete("trips/t1/uid-a.png");
    const cmd = sendMock.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(cmd.input).toMatchObject({ Bucket: "trip-files", Key: "trips/t1/uid-a.png" });
  });

  it("throws a clear error when a required env var is missing", async () => {
    delete process.env.R2_BUCKET_NAME;
    const { getStorage } = await import("./storage");
    expect(() => getStorage()).toThrow(/R2_BUCKET_NAME is required/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
npx vitest run lib/storage.test.ts
```
Expected: the new "S3-compatible storage (R2 driver)" tests FAIL (the stub throws "R2/S3 storage not configured").

- [ ] **Step 3: Implement the driver in `lib/storage.ts`**

At the top of `lib/storage.ts`, after the existing `import path from "node:path";` line, add:
```ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
```

**Replace** the entire `prodStubStorage` block (from `const prodStubStorage: Storage = {` through its closing `};`) with:
```ts
// ---------------------------------------------------------------------------
// S3-compatible implementation (production: Cloudflare R2 or AWS S3)
// ---------------------------------------------------------------------------

/** Read a required env var or throw a clear, actionable error. */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Storage misconfigured: environment variable ${name} is required for the selected STORAGE_DRIVER. See lib/storage.ts and docs/DEPLOY.md.`,
    );
  }
  return v;
}

/** True for the S3/R2 "object does not exist" error shapes. */
function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    e.name === "NoSuchKey" ||
    e.name === "NotFound" ||
    e.Code === "NoSuchKey" ||
    e.$metadata?.httpStatusCode === 404
  );
}

/**
 * Build an S3-compatible Storage for the given driver from env vars.
 *   - "r2": Cloudflare R2. Endpoint derived from the account id; region "auto".
 *   - "s3": AWS S3. Region from AWS_REGION; default AWS endpoint.
 */
function makeS3Storage(driver: "r2" | "s3"): Storage {
  let client: S3Client;
  let bucket: string;

  if (driver === "r2") {
    const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
    bucket = requireEnv("R2_BUCKET_NAME");
    client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  } else {
    bucket = requireEnv("S3_BUCKET_NAME");
    client = new S3Client({
      region: requireEnv("AWS_REGION"),
      credentials: {
        accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
      },
    });
  }

  return {
    async save(key, data, mime) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.isBuffer(data) ? data : Buffer.from(data),
          ContentType: mime,
        }),
      );
    },

    async delete(key) {
      // S3/R2 DeleteObject is idempotent — deleting a missing key succeeds.
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async read(key) {
      try {
        const res = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (!res.Body) return null;
        const bytes = await res.Body.transformToByteArray();
        return Buffer.from(bytes);
      } catch (err: unknown) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
  };
}
```

**Then update `getStorage()`** — replace its body so the `"r2"`/`"s3"` branches use the new impl:
```ts
export function getStorage(): Storage {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local") {
    return localDiskStorage;
  }
  if (driver === "r2") {
    return makeS3Storage("r2");
  }
  if (driver === "s3") {
    return makeS3Storage("s3");
  }
  throw new Error(`Unknown STORAGE_DRIVER="${driver}". Use "local", "r2", or "s3".`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
npx vitest run lib/storage.test.ts
```
Expected: all storage tests PASS (existing local-disk tests + the new R2 tests).

- [ ] **Step 5: Verify the whole suite + typecheck via build still pass**

Run:
```bash
npm run test && npm run build
```
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/storage.ts lib/storage.test.ts
git commit -m "feat(storage): implement R2/S3 object storage driver

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Trust the deployment host in Auth.js

**Files:**
- Modify: `lib/auth.ts`

> Context: Auth.js v5 needs to trust forwarded host headers to build correct OAuth callback URLs behind a proxy. Vercel sets these; making it explicit also covers non-Vercel hosts.

- [ ] **Step 1: Add `trustHost: true`**

In `lib/auth.ts`, in the `authConfig` object, immediately after the `adapter: PrismaAdapter(db),` line, add:
```ts
  // Trust the deployment host's forwarded headers (X-Forwarded-Host/Proto) so
  // OAuth callback URLs are correct behind Vercel's proxy.
  trustHost: true,
```

- [ ] **Step 2: Verify tests and build**

Run:
```bash
npm run test && npm run build
```
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "feat(auth): trust deployment host for prod OAuth callbacks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire `prisma migrate deploy` into the Vercel build

**Files:**
- Create: `vercel.json`

> Context: On each deploy Vercel runs the build command; running `prisma migrate deploy` first applies any pending migrations to Neon. `migrate deploy` is idempotent. `prisma generate` already runs via `postinstall`.

- [ ] **Step 1: Create `vercel.json`**

Full contents:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "prisma migrate deploy && next build"
}
```

- [ ] **Step 2: Verify it is valid JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json OK')"
```
Expected: prints `vercel.json OK`.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore(deploy): run prisma migrate deploy in the Vercel build

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: GitHub Actions cron for reminder delivery

**Files:**
- Create: `.github/workflows/reminders-cron.yml`

> Context: `/api/cron/reminders` already exists, is `CRON_SECRET`-auth'd (Bearer header preferred), and forces the Node runtime. Vercel Hobby cron is daily-only, so GitHub Actions drives the 5-minute cadence. Requires repo **secret** `CRON_SECRET` and repo **variable** `APP_URL` (set in the runbook).

- [ ] **Step 1: Create the workflow**

Full contents of `.github/workflows/reminders-cron.yml`:
```yaml
name: Reminders cron

# Trigger the push-reminder dispatcher on a schedule. Vercel Hobby cron only
# runs once per day, so we drive the every-5-minutes cadence from here instead.
# The endpoint is auth'd by CRON_SECRET (fail-closed if unset). GitHub may delay
# scheduled runs under load, and disables schedules after 60 days of repo
# inactivity — fine for a low-stakes reminder ping.
on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch: {}

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Hit the reminders endpoint
        run: |
          curl --fail --silent --show-error \
            -H "Authorization: Bearer ${CRON_SECRET}" \
            "${APP_URL}/api/cron/reminders"
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          APP_URL: ${{ vars.APP_URL }}
```

- [ ] **Step 2: Verify the file is present and well-formed**

Run:
```bash
test -f .github/workflows/reminders-cron.yml && \
grep -q 'cron: "\*/5 \* \* \* \*"' .github/workflows/reminders-cron.yml && \
grep -q "/api/cron/reminders" .github/workflows/reminders-cron.yml && \
echo "workflow OK"
```
Expected: prints `workflow OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/reminders-cron.yml
git commit -m "chore(reminders): GitHub Actions cron to dispatch web-push reminders

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Local dev on Postgres — docker-compose, env contract, README

**Files:**
- Create: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `README.md` (quickstart + troubleshooting)

- [ ] **Step 1: Create `docker-compose.yml`**

Full contents:
```yaml
# Local Postgres for development. The connection matches DATABASE_URL /
# DIRECT_URL in .env.example.
#
#   docker compose up -d        # start
#   npx prisma migrate deploy   # apply the committed baseline
#   npm run db:seed             # seed sample + demo trips
#
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: trip
      POSTGRES_PASSWORD: trip
      POSTGRES_DB: trip
    ports:
      - "5432:5432"
    volumes:
      - trip-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U trip -d trip"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  trip-pgdata:
```

- [ ] **Step 2: Rewrite `.env.example`**

Full new contents of `.env.example`:
```bash
# ---------------------------------------------------------------------------
# Database (Postgres)
# Local dev: the docker-compose Postgres. Production: your Neon connection
# strings. DATABASE_URL is the POOLED connection used by the app; DIRECT_URL is
# the UNPOOLED connection used for migrations. Locally they're the same.
# ---------------------------------------------------------------------------
DATABASE_URL="postgresql://trip:trip@localhost:5432/trip?schema=public"
DIRECT_URL="postgresql://trip:trip@localhost:5432/trip?schema=public"

# Auth.js secret — generate with: openssl rand -base64 32
AUTH_SECRET="your-auth-secret-here"

# Google OAuth credentials (from console.cloud.google.com)
AUTH_GOOGLE_ID="your-google-client-id"
AUTH_GOOGLE_SECRET="your-google-client-secret"

# Application name shown in UI
NEXT_PUBLIC_APP_NAME="Trip Planner"

# Passwordless dev-login bypass. MUST stay "false" anywhere real (staging/prod).
# Set to "true" ONLY in local development to enable the quick traveller sign-in.
ALLOW_DEV_LOGIN="false"

# ---------------------------------------------------------------------------
# File storage
#   local : write to .uploads/ on disk (dev default)
#   r2    : Cloudflare R2 (set the CLOUDFLARE_/R2_ vars below)
#   s3    : AWS S3 (set the AWS_/S3_ vars below)
# ---------------------------------------------------------------------------
STORAGE_DRIVER="local"

# Cloudflare R2 (when STORAGE_DRIVER="r2")
CLOUDFLARE_ACCOUNT_ID=""
R2_BUCKET_NAME=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""

# AWS S3 (when STORAGE_DRIVER="s3")
AWS_REGION=""
S3_BUCKET_NAME=""
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""

# ---------------------------------------------------------------------------
# Web Push (VAPID) — optional. Without these, push is disabled but the app
# works normally. Generate with: npx web-push generate-vapid-keys
# ---------------------------------------------------------------------------
VAPID_PRIVATE_KEY=""
VAPID_PUBLIC_KEY=""
VAPID_SUBJECT="mailto:you@example.com"
NEXT_PUBLIC_VAPID_PUBLIC_KEY=""

# ---------------------------------------------------------------------------
# Cron secret — protects /api/cron/reminders (fail-closed if unset).
# Generate with: openssl rand -hex 32
# ---------------------------------------------------------------------------
CRON_SECRET=""

# ---------------------------------------------------------------------------
# AI features (Anthropic) — optional. Without ANTHROPIC_API_KEY the AI UI is
# disabled. Get a key at: https://console.anthropic.com/
# ---------------------------------------------------------------------------
ANTHROPIC_API_KEY=""
AI_MODEL=""

# ---------------------------------------------------------------------------
# Geocoding (OpenStreetMap Nominatim) — optional contact for the User-Agent.
# ---------------------------------------------------------------------------
NOMINATIM_CONTACT=""
```

- [ ] **Step 3: Update the README quickstart**

In `README.md`, replace the **"### 0. Prerequisites"** section and the **"### 3. Set up the database"** section so they describe Postgres via Docker. Specifically:

Replace the Prerequisites body (the paragraph beginning "**Node.js 22 LTS**" through the `nvm use` code block and the line "No external accounts, databases, or API keys are needed for local development — it runs on SQLite with a dev-login bypass.") with:
```markdown
**Node.js 22 LTS** (or any `20.19+` / `24+`) and **Docker** (for local Postgres). A `.nvmrc` is included, so with nvm:

```bash
nvm use      # or: nvm install 22
node -v      # must be >= 20.19
```

No external accounts or API keys are needed for local development — it runs on a local Postgres container with a dev-login bypass.
```

Replace the **"### 3. Set up the database"** code block (the `npx prisma migrate dev` + `npm run db:seed` block) with:
```markdown
```bash
docker compose up -d        # start local Postgres 16
npx prisma migrate deploy   # apply the committed migration baseline
npm run db:seed             # seed two test users + sample trip + demo trip
```
```

In the **Troubleshooting** section, remove the two `better-sqlite3`/`dev.db` bullets and add:
```markdown
- **`Can't reach database server at localhost:5432`** — the Postgres container isn't running. Start it with `docker compose up -d`, then retry. Check status with `docker compose ps`.
- **Native binding errors (`@tailwindcss/oxide-*`, `lightningcss`, `pg`) during `npm run build`** — usually a `node_modules` copied across platforms. Fix: `rm -rf node_modules package-lock.json && npm install`.
```

- [ ] **Step 4: Verify**

Run:
```bash
node -e "const y=require('fs').readFileSync('docker-compose.yml','utf8'); if(!y.includes('postgres:16')) throw new Error('compose missing postgres'); console.log('compose OK')" && \
grep -q "DIRECT_URL" .env.example && grep -q "STORAGE_DRIVER" .env.example && echo "env OK" && \
! grep -q "better-sqlite3" README.md && echo "readme OK"
```
Expected: prints `compose OK`, `env OK`, `readme OK`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example README.md
git commit -m "chore(dev): local Postgres via docker-compose + env/readme update

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Deployment runbook + HANDOFF refresh

**Files:**
- Create: `docs/DEPLOY.md`
- Modify: `docs/HANDOFF.md`

- [ ] **Step 1: Create `docs/DEPLOY.md`**

Full contents:
````markdown
# Deploy runbook — Vercel + Neon + Cloudflare R2 (free tier)

Everything here is the human (account/secret/click) work. The code is already wired:
Postgres via `@prisma/adapter-pg`, R2 via the `r2` storage driver, migrations via
`prisma migrate deploy` in the Vercel build, and reminders via a GitHub Actions cron.

## 0. Generate secrets (local shell)

```bash
openssl rand -base64 32      # AUTH_SECRET
openssl rand -hex 32         # CRON_SECRET
npx web-push generate-vapid-keys   # VAPID public/private pair
```

## 1. Neon (Postgres) — free

1. Create a project at https://neon.tech.
2. Copy two connection strings from the dashboard:
   - **Pooled** (has `-pooler` in the host) → use as `DATABASE_URL`.
   - **Direct** (no `-pooler`) → use as `DIRECT_URL`.
   Both should include `?sslmode=require`.

## 2. Cloudflare R2 — free

1. Create a bucket at https://dash.cloudflare.com → R2.
2. Note your **Account ID** (R2 overview page).
3. Create an **R2 API token** (Object Read & Write) → gives an Access Key ID + Secret.
4. You will set: `STORAGE_DRIVER=r2`, `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET_NAME`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

## 3. Google OAuth — free

1. https://console.cloud.google.com → APIs & Services → Credentials.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Authorized redirect URI: `https://<your-vercel-domain>/api/auth/callback/google`
   (you can add the real domain after the first Vercel deploy, then redeploy).
4. Copy the **Client ID** and **Client Secret**.

## 4. Vercel — free (Hobby)

1. Import the GitHub repo at https://vercel.com (framework auto-detects Next.js;
   `vercel.json` already sets the build command).
2. Add **Environment Variables** (Production):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** URL |
   | `DIRECT_URL` | Neon **direct** URL |
   | `AUTH_SECRET` | from step 0 |
   | `AUTH_GOOGLE_ID` | from step 3 |
   | `AUTH_GOOGLE_SECRET` | from step 3 |
   | `ALLOW_DEV_LOGIN` | `false` |
   | `STORAGE_DRIVER` | `r2` |
   | `CLOUDFLARE_ACCOUNT_ID` | from step 2 |
   | `R2_BUCKET_NAME` | from step 2 |
   | `R2_ACCESS_KEY_ID` | from step 2 |
   | `R2_SECRET_ACCESS_KEY` | from step 2 |
   | `VAPID_PUBLIC_KEY` | from step 0 |
   | `VAPID_PRIVATE_KEY` | from step 0 |
   | `VAPID_SUBJECT` | `mailto:you@yourdomain.com` |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | same as `VAPID_PUBLIC_KEY` |
   | `CRON_SECRET` | from step 0 |
   | `NEXT_PUBLIC_APP_NAME` | e.g. `Trip Planner` |

3. Deploy. The build runs `prisma migrate deploy` against `DIRECT_URL`, creating the
   schema on Neon, then `next build`.
4. Add your final Vercel domain to the Google OAuth redirect URI (step 3) if you didn't already, then redeploy.

## 5. GitHub Actions cron (reminder delivery)

In the GitHub repo settings:
- **Secrets and variables → Actions → Secrets:** add `CRON_SECRET` (same value as Vercel).
- **Variables:** add `APP_URL` = `https://<your-vercel-domain>` (no trailing slash).

The `Reminders cron` workflow then pings `/api/cron/reminders` every 5 minutes. Trigger it
once manually (Actions tab → Reminders cron → Run workflow) to confirm it returns 200.

## 6. First sign-in

1. Open the deployed URL, sign in with Google.
2. Create your trip, then invite your partner by email on the trip's Settings page.
3. Your partner signs in with that Google email and is auto-added.

## Enabling AI later (optional, paid)

Add `ANTHROPIC_API_KEY` (and optionally `AI_MODEL=claude-haiku-4-5` for lower cost) in
Vercel env and redeploy. No code change.
````

- [ ] **Step 2: Refresh `docs/HANDOFF.md`**

Make these targeted edits:
- At the top of **§1 Database**, add a note: `> **Status: done.** The app now ships on Postgres (`@prisma/adapter-pg`) with a committed Postgres migration baseline. The steps below are background; for the actual deploy follow `docs/DEPLOY.md`.`
- At the top of **§3 File Storage → Production**, add: `> **Status: done.** The `r2`/`s3` driver is implemented in `lib/storage.ts`. Just set the env vars.`
- In **§5 Maps**, delete the "**Marker icons**: ... unpkg CDN ..." paragraph — icons are already self-hosted under `public/leaflet/` and referenced as `/leaflet/marker-icon.png`.
- In **§6**, add at the top: `> The repo ships a GitHub Actions cron (`.github/workflows/reminders-cron.yml`) — this is the recommended path on Vercel Hobby (whose own cron is daily-only).`
- In **§10**, delete the final bullet about "**Leaflet marker icons load from the unpkg CDN**" (no longer true).

- [ ] **Step 3: Verify**

Run:
```bash
test -f docs/DEPLOY.md && grep -q "Neon" docs/DEPLOY.md && grep -q "DIRECT_URL" docs/DEPLOY.md && \
! grep -q "unpkg" docs/HANDOFF.md && echo "docs OK"
```
Expected: prints `docs OK`.

- [ ] **Step 4: Commit**

```bash
git add docs/DEPLOY.md docs/HANDOFF.md
git commit -m "docs: deploy runbook + mark Postgres/R2 realized in HANDOFF

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Postgres everywhere (adapter + provider + baseline + local docker) → Tasks 1, 2, 7 ✅
- R2 file storage → Task 3 ✅
- Auth (Google-only, trustHost, dev-login off via env) → Task 4 + `.env.example`/runbook ✅
- Web push + GitHub Actions cron → Task 6 (+ env in Task 7, runbook in Task 8) ✅
- AI off → no code; documented as a later flip (runbook) ✅
- Vercel hosting + migrate deploy → Task 5 ✅
- Start-empty prod data → runbook says create your own trip; demo seed stays local ✅
- ADR recorded → `docs/adr/0005-*` (written before execution) ✅

**Placeholder scan:** every code/config file is given in full or as an exact replacement; verification commands have expected output. No TODOs.

**Type consistency:** `Storage` interface (`save`/`delete`/`read`) is implemented exactly by `makeS3Storage`; `read` returns `Buffer | null` matching the attachment route's `null`→404 contract; `getStorage()` driver strings (`local`/`r2`/`s3`) match `.env.example` and tests.

**Human-only steps (not in tasks, by design):** creating Neon/R2/Google/Vercel accounts, pasting secrets, clicking deploy, setting GitHub secret/variable — all captured in `docs/DEPLOY.md`. No deploy or `main` merge happens without explicit user go-ahead.
