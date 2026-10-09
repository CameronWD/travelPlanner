# Claude connection (MCP) and follow-ups TC-02/04/05 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the operator scripts safe (TC-05), fix the stale layout-audit recipes (TC-04), move the two leaking component tests to happy-dom (TC-02), and ship a hosted MCP endpoint at `/api/mcp` so a Traveller can build their Trips from Claude Code or Claude Desktop with an operator-minted token (TC-03).

**Architecture:** The MCP route verifies a bearer token (SHA-256 hash in a new `McpToken` table), then runs the MCP SDK's web-standard Streamable HTTP transport (stateless, JSON responses) inside an `AsyncLocalStorage` scope that names the acting Traveller. `requireUser` consults that scope before `auth()`, so every tool calls the **existing server actions** and the existing guards decide access. `recordActivity` stamps `source = "CLAUDE"` while that scope is active, and the Activity feed and bell render "via Claude".

**Tech Stack:** Next 16.3.4 (route handlers; read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `03-api-reference/03-file-conventions/route.md` before Task 8), Prisma 7 + `@prisma/adapter-pg`, zod 4, vitest 4 (projects `node` for `*.test.ts`, `dom` for `*.test.tsx`), `@modelcontextprotocol/sdk@1.32.1` (`McpServer.registerTool` / `registerPrompt`, `WebStandardStreamableHTTPServerTransport`, `InMemoryTransport` + `Client` for tests), Playwright 1.63 (browsers at `$PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`).

**Spec:** `docs/specs/2026-10-09-mcp-server-and-follow-ups.md` (read it first). Domain terms: `CONTEXT.md` **Claude connection**, **Activity**, **Item**, **Wishlist**. Decision: ADR 0070 amendment 2026-10-09.

## Global Constraints

- Branch: `feat/mcp-and-follow-ups-2026-10-09`. Never commit to `main`. Never deploy. Never run `npm run feedback:*`.
- Never connect to production. Local DB is `.env`'s `DATABASE_URL` (`host.docker.internal:5432`). Do **not** run any operator script (`sweep:*`, `backfill:*`, `mcp:token`) for real: they load `.env.production.local`. Test them through their injected-deps run functions only.
- Verification tiers (CLAUDE.md): inner loop `npx vitest run <files>`; task done `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Full `npm test`, `npm run build`, `npm run test:integration` run once, in the final task only.
- Every commit ends with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Copy house style (enforced by an AST guard test over traveller-facing strings): no em-dashes, errors read "Couldn't ... Try again.", lowercase everyday nouns. Tool descriptions are for Claude, not Travellers, but keep the same style.
- A module that exports `runAsTraveller` must **never** carry `"use server"`: that would publish it as a callable server action.
- Real plan only: no MCP tool accepts or passes a `forkId`. Pass `undefined` (never a string) where an action takes `forkId?: PlanId`.
- Tool descriptions say "thing to do or see" for Item and "ideas not yet placed" for Wishlist.
- Never log or report a token, a token hash, or a database URL with credentials.

## Review Focus

1. **A non-member's Trip id through any tool** must return the same "not found" tool error as a made-up id, never a 500 and never data. (Task 8 pins it in `run-tool.test.ts`; Task 16 pins it end to end.)
2. **A revoked token and an unknown token** must both get an identical bare 401 with `WWW-Authenticate: Bearer`, before the body is parsed. (Task 8 route test.)
3. **The acting-traveller scope cannot leak**: outside `runAsTraveller`, `requireUser` must still use `auth()`; two concurrent scopes must not see each other's user. (Task 6.)
4. **An action's `{ success: false, errors }` (or `{ success: false, error }`)** must surface as a readable tool error naming the fields, not as success. (Task 8 `run-tool.test.ts`.)
5. **Activity written outside MCP** must keep `source = null` and render with no "via Claude". (Tasks 6 and 7.)

---

## Part A: Follow-ups

### Task 1: TC-05: operator scripts load env and refuse a mismatched storage

**Files:**
- Modify: `scripts/sweep-deleted-blobs.ts:59-62` (imports), `:87-107` (start of `main`)
- Create: `scripts/lib/script-guards.ts`, `scripts/lib/script-guards.test.ts`
- Modify: `scripts/backfill-geocode.ts:37-39` (imports), `:270` (`main`)
- Modify: `scripts/sweep-orphaned-costs.ts:9-10` (imports), `:18` (`main`)
- Modify: `docs/open-follow-ups.md` (strike TC-05)

**Interfaces:**
- Consumes: `assertStorageMatchesDatabase(env)`, `describeTarget(env, dryRun)`, `databaseHost(url)` from `scripts/lib/storage-target.ts`; `resolveSweepDriver(execute, driver)` from `lib/sweep-blobs-driver.ts`.
- Produces: `sweepPreflight(env, execute): { ok: true; lines: string[]; driverLabel: string } | { ok: false; lines: string[] }` and `dbTargetLine(env, dryRun): string`, both in `scripts/lib/script-guards.ts`.

- [ ] **Step 1: Write the failing tests** in `scripts/lib/script-guards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dbTargetLine, sweepPreflight } from "./script-guards";

const REMOTE = "postgresql://u:secretpw@ep-x.neon.tech:5432/db?sslmode=require";
const LOCAL = "postgresql://u:pw@localhost:5432/db";

describe("sweepPreflight", () => {
  it("refuses local storage against a remote database, dry run included", () => {
    for (const execute of [false, true]) {
      const r = sweepPreflight({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "local" }, execute);
      expect(r.ok).toBe(false);
      expect(r.lines.join("\n")).toMatch(/Refusing to run/);
      expect(r.lines[0]).toMatch(/^Target: database ep-x\.neon\.tech:5432/);
    }
  });
  it("refuses an unset driver against a remote database on a dry run (storage guard)", () => {
    const r = sweepPreflight({ DATABASE_URL: REMOTE }, false);
    expect(r.ok).toBe(false);
  });
  it("still refuses --execute with an unset driver against a local database (existing rule)", () => {
    const r = sweepPreflight({ DATABASE_URL: LOCAL }, true);
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toMatch(/STORAGE_DRIVER is not set/);
  });
  it("passes r2 against a remote database", () => {
    const r = sweepPreflight({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "r2" }, true);
    expect(r).toMatchObject({ ok: true, driverLabel: "r2" });
  });
  it("never prints credentials", () => {
    const r = sweepPreflight({ DATABASE_URL: REMOTE, STORAGE_DRIVER: "local" }, false);
    expect(r.lines.join("\n")).not.toMatch(/secretpw|sslmode/);
  });
});

describe("dbTargetLine", () => {
  it("names the host and mode, never credentials", () => {
    expect(dbTargetLine({ DATABASE_URL: REMOTE }, true)).toBe("Target: database ep-x.neon.tech:5432, DRY RUN");
    expect(dbTargetLine({ DATABASE_URL: LOCAL }, false)).toBe("Target: database localhost:5432, LIVE");
    expect(dbTargetLine({}, false)).toBe("Target: database unknown, LIVE");
  });
});
```

- [ ] **Step 2:** Run `npx vitest run scripts/lib/script-guards.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `scripts/lib/script-guards.ts`:

```ts
/**
 * Spec 2026-10-09 (TC-05): preflight for operator scripts. Pure over an env
 * object, so testable without touching process.env or a database.
 */
import { resolveSweepDriver } from "../../lib/sweep-blobs-driver";
import { assertStorageMatchesDatabase, databaseHost, describeTarget } from "./storage-target";

type Env = Record<string, string | undefined>;

/** Target line for scripts that touch the database but no storage. */
export function dbTargetLine(env: Env, dryRun: boolean): string {
  return `Target: database ${databaseHost(env.DATABASE_URL) ?? "unknown"}, ${dryRun ? "DRY RUN" : "LIVE"}`;
}

/**
 * sweep:blobs preflight. Both guards stack: the storage/database match
 * (dry runs too) and resolveSweepDriver's "--execute needs an explicit
 * STORAGE_DRIVER" rule. The target line is always first.
 */
export function sweepPreflight(
  env: Env,
  execute: boolean,
): { ok: true; lines: string[]; driverLabel: string } | { ok: false; lines: string[] } {
  const lines = [describeTarget(env, !execute)];
  try {
    assertStorageMatchesDatabase(env);
  } catch (err) {
    return { ok: false, lines: [...lines, err instanceof Error ? err.message : String(err)] };
  }
  const resolved = resolveSweepDriver(execute, env.STORAGE_DRIVER);
  if ("error" in resolved) return { ok: false, lines: [...lines, resolved.error] };
  return { ok: true, lines, driverLabel: resolved.label };
}
```

- [ ] **Step 4:** Run the test. Expected: PASS.

- [ ] **Step 5: Wire `sweep-deleted-blobs.ts`.** Add `import { sweepPreflight } from "./lib/script-guards";` after the existing imports (keep `import "./load-env";` first; drop the now-unused `resolveSweepDriver` import). Replace lines 92-102 of `main()` with:

```ts
  // Spec 2026-10-09 (TC-05): target line first, then BOTH guards, before any
  // query runs and in dry runs too. Local storage against a remote database
  // would report every blob destroyed while the R2 objects stay orphaned.
  const preflight = sweepPreflight(process.env, execute);
  for (const line of preflight.lines) (preflight.ok ? console.log : console.error)(line);
  if (!preflight.ok) {
    process.exitCode = 1;
    return;
  }
  console.log(`Storage driver: ${preflight.driverLabel}${execute ? "" : " (dry run, nothing will be destroyed)"}`);
```

  Update the file's ENVIRONMENT doc comment with one paragraph saying the storage/database match guard now runs first, dry runs included (spec 2026-10-09-mcp-server-and-follow-ups Part 1).

- [ ] **Step 6: Wire the two DB-only scripts.** In each of `scripts/backfill-geocode.ts` and `scripts/sweep-orphaned-costs.ts`, add as the very first import, with the same comment `scripts/feedback-pull.ts` uses above its `load-env` import:

```ts
import "./load-env";
```

  then `import { dbTargetLine } from "./lib/script-guards";`, and make the first line of `main()`:
  - `backfill-geocode.ts`: `console.log(dbTargetLine(process.env, DRY_RUN));`
  - `sweep-orphaned-costs.ts`: `console.log(dbTargetLine(process.env, !execute));` (after `execute` is computed).
  Add a sentence to each file's doc comment: "Loads `.env.production.local` via `scripts/load-env.ts`, so it targets production when that file exists."

- [ ] **Step 7: Static guard test.** Append to `scripts/lib/script-guards.test.ts`:

```ts
import { readFileSync } from "node:fs";

describe("operator scripts import load-env first", () => {
  for (const f of ["scripts/backfill-geocode.ts", "scripts/sweep-orphaned-costs.ts", "scripts/sweep-deleted-blobs.ts"]) {
    it(f, () => {
      const firstImport = readFileSync(f, "utf8").split("\n").find((l) => l.startsWith("import "));
      expect(firstImport).toBe('import "./load-env";');
    });
  }
});
```

  Run it. Expected: PASS.

- [ ] **Step 8: Follow-ups.** In `docs/open-follow-ups.md`, under "2026-10-08 · Tests, covers, copy", wrap the TC-05 bullet's title in `~~...~~` and append: "**Fixed 2026-10-09** (spec 2026-10-09-mcp-server-and-follow-ups Part 1): `sweep:blobs` prints its target and refuses local storage against a remote database before any query, dry runs too, on top of the explicit-driver rule; `backfill-geocode` and `sweep-orphaned-costs` load `.env.production.local` and print their target first."

- [ ] **Step 9: Verify and commit.** Task-done tier on the changed files, then:

```bash
git add scripts/ lib/sweep-blobs-driver.ts docs/open-follow-ups.md
git commit -m "fix(scripts): sweep:blobs storage guard; DB scripts load env (TC-05)"
```

---

### Task 2: TC-02: `new-trip-flow.test.tsx` on happy-dom

**Files:**
- Modify: `components/new-trip/new-trip-flow.test.tsx` (line-1 docblock, setup/teardown)
- Possibly modify: `components/new-trip/*.tsx` (only if the cause is a real component bug)

**Interfaces:** none produced.

Known facts: line 1 opts into jsdom; the failing test under happy-dom is `"a create that throws stays on step 4 with an inline error, re-enabled, draft kept"` (line ~319), timing out waiting for "Create trip" to re-enable, only when run after the rest of the file. `beforeEach` (33-43) fakes only `Date`, resets 5 mocks, clears `sessionStorage`, resets history. `afterEach` (44) only restores timers. Some tests assign `URL.createObjectURL` / `revokeObjectURL` directly (~line 345) with no restore.

- [ ] **Step 1: Reproduce.** Remove line 1 (`// @vitest-environment jsdom`) locally and run `npx vitest run components/new-trip/new-trip-flow.test.tsx`. Record which test(s) fail. Run the named test alone with `-t "a create that throws"` and confirm it passes.
- [ ] **Step 2: Bisect.** Use `describe.only`/`it.only` combinations (or `-t` with regexes) to find the smallest set of preceding tests that makes the target fail. Write the finding down (test names + line numbers).
- [ ] **Step 3: Identify the leaked state.** Check in this order: the unrestored `URL.createObjectURL`/`revokeObjectURL` assignments; pending promises or a never-resolved `createTrip` mock implementation from an earlier test; `sessionStorage`/`localStorage` residue (only `sessionStorage` is cleared); `history` state; fake-timer `Date` state; React state from an unmounted tree still resolving. Instrument with `console.log` if needed; remove it afterwards.
- [ ] **Step 4: Fix at the source.** A test-hygiene cause is fixed in the setup (e.g. `vi.spyOn(URL, "createObjectURL")` + `vi.restoreAllMocks()` in `afterEach`, `localStorage.clear()` in `beforeEach`, awaiting the pending promise). A real component bug is fixed in the component with a new test that pins it. **Do not change any assertion or timeout in the target test.**
- [ ] **Step 5:** Remove the line-1 jsdom docblock and its comment (lines 1-7). Run the whole file 3 times: `for i in 1 2 3; do npx vitest run components/new-trip/new-trip-flow.test.tsx || break; done`. Expected: 3 × PASS on happy-dom.
- [ ] **Step 6: Time-box exit.** If after a thorough bisect and instrumentation (roughly 45 minutes of work) the cause is not found, or the only fix weakens an assertion: restore line 1, rewrite the comment (lines 2-7) with what was learned (which preceding tests trigger it and what was ruled out), and report DONE_WITH_CONCERNS saying TC-02 stays open for this file.
- [ ] **Step 7: Verify and commit.** Task-done tier, then `git commit -m "test(new-trip): run new-trip-flow on happy-dom (TC-02)"` (or `"test(new-trip): record new-trip-flow leak findings (TC-02)"` on the time-box exit).

---

### Task 3: TC-02: `feedback-launcher.test.tsx` on happy-dom

**Files:**
- Modify: `components/feedback/feedback-launcher.test.tsx`
- Possibly modify: `components/feedback/feedback-launcher.tsx` (module-level `cachedMatchMediaFn` / `cachedDockedMql` at lines 96-97), `lib/feedback-queue.ts`
- Modify: `docs/open-follow-ups.md` (TC-02 status, after this task and Task 2 both finish)

**Interfaces:** none produced.

Known facts: failing tests under happy-dom are `"keeps a note in the box when storage refuses to hold it"` (~line 450) and `"does not list a note as sent when the queue removal was swallowed"` (~line 503); both spy `Storage.prototype.setItem` and restore in `finally`. `afterEach` uses `vi.clearAllMocks()` (not reset), so `mockImplementation`s set in one test persist; `deleteMock` and `toastMock` get no fresh implementation in `beforeEach`. The component caches `matchMedia` results at module level. `lib/feedback-queue.ts` keeps all state in `localStorage` (`teepee.feedback.queue.v1`) and `write()` swallows `setItem` errors.

- [ ] **Step 1: Reproduce** as Task 2 Step 1, for this file and both named tests.
- [ ] **Step 2: Bisect** as Task 2 Step 2.
- [ ] **Step 3: Identify the leaked state.** Suspects in order: `deleteMock`/`toastMock` implementations carried over by `clearAllMocks`; `Storage.prototype.setItem` spied on the prototype while happy-dom's `localStorage` may resolve `setItem` on the instance (check `Object.getOwnPropertyNames(localStorage)` under happy-dom); the module-level `matchMedia` cache; fake timers left from line 178 tests; pending `flushQueue` promises.
- [ ] **Step 4: Fix at the source** with the same rules as Task 2 Step 4 (no assertion weakened).
- [ ] **Step 5:** Remove the line-1 docblock and comment; run the file 3 times. Expected: 3 × PASS.
- [ ] **Step 6: Time-box exit** as Task 2 Step 6.
- [ ] **Step 7: Follow-ups.** In `docs/open-follow-ups.md`, TC-02: if both files moved, strike it with "**Fixed 2026-10-09**: <one line per file naming the leaked state>". If either stayed, leave it open and append what was learned.
- [ ] **Step 8: Verify and commit.** Task-done tier, then commit (`test(feedback): ... (TC-02)`).

---

### Task 4: TC-04: layout-audit overlay recipes match the live UI

**Files:**
- Modify: `scripts/layout-audit/overlays.ts` (recipes in `OVERLAYS`, from line 152; header comment lines 1-20)
- Modify only if they assert a renamed literal: `scripts/layout-audit/overlays.test.ts`, `scripts/layout-audit/run.test.ts`
- Modify: `docs/open-follow-ups.md` (strike TC-04)

**Interfaces:** none produced.

Known stale: `stop-add` (clicks "Add Stop"; the real button and dialog are "Add a stop", see `components/plan/plan-header-actions.tsx`, `add-stop-sheet.tsx`) and `item-add` ("Add Thing to Do" renders nowhere). Ambiguous after the casing pass `028cb095`: `accommodation-add`, `transport-add`, `transport-edit`, `cost-add`, `item-add`, `chapter-add`, `schedule-item`, `wishlist-add`.

- [ ] **Step 1: Prepare the local app.** Confirm `.env` points at `host.docker.internal:5432` and has `ALLOW_DEV_LOGIN=true`. Run `npx prisma migrate deploy` (local only; `.env` is the local DB) then `npm run db:seed` (creates the demo trips the audit resolves by name, including "EU Christmas 2026"). Start `npm run dev` in the background and wait for `http://localhost:3000` to answer.
- [ ] **Step 2: Run the overlay set.** `LAYOUT_AUDIT_OUT=/tmp/layout-audit/tc04-before LAYOUT_AUDIT_ONLY="overlay/" npm run audit:layout 2>&1 | tee /tmp/layout-audit/tc04-before.log`. Collect every `COVERAGE GAP overlay:<id>` line.
- [ ] **Step 3: Fix each gap from the live DOM.** For each gapped overlay, find the real accessible name: read the component that renders the trigger and the dialog title (grep the old literal's lowercase form under `components/`), and confirm in the browser if unsure. Update the recipe's `click` and `expect` names and any doc comment that quotes them. Example for `stop-add`:

```ts
    steps: [{ click: { role: "button", name: "Add a stop", exact: true } }],
    expect: { role: "dialog", name: "Add a stop" },
```

  Update the header comment's example ("Add Stop" opens the same dialog ...) to the live names. Gaps listed as known in `docs/audits/2026-09-24-layout-audit.md` "Coverage gaps" (make-it-fit, chapter-add, duplicate/delete-trip at 390) are only fixed if the cause is a stale name; leave a genuine "not available on this trip" gap alone and say so.
- [ ] **Step 4: Re-run** into a fresh dir (`tc04-after`) until no gap is caused by a stale name. Run `npx vitest run scripts/layout-audit/` and update fixtures only where they assert a renamed literal (the `parseName("Add Stop", {})` literal test is about parsing, so it may stay).
- [ ] **Step 5: Fallback.** If the dev server or DB cannot run, fix the two known-stale recipes and each ambiguous one by reading the components, and report DONE_WITH_CONCERNS: "fixed by inspection, not run".
- [ ] **Step 6: Follow-ups.** Strike TC-04 with "**Fixed 2026-10-09**: overlay set re-run against the local app; recipes corrected: <ids>." (or "by inspection, not run").
- [ ] **Step 7:** Stop the dev server. Task-done tier on changed files. Commit `fix(layout-audit): overlay recipes use live names (TC-04)`.

---

## Part B: Claude connection (TC-03)

### Task 5: `McpToken` model, migration, token library and `mcp:token` script

**Files:**
- Modify: `prisma/schema.prisma` (new `McpToken` model; `User` back-relation; `Activity.source`)
- Create: `prisma/migrations/20261009120000_mcp_tokens_and_activity_source/migration.sql`
- Create: `lib/mcp/tokens.ts`, `lib/mcp/tokens.test.ts`
- Create: `scripts/mcp-token-run.ts`, `scripts/mcp-token-run.test.ts`, `scripts/mcp-token.ts`
- Modify: `package.json` (script `"mcp:token": "tsx --conditions=react-server scripts/mcp-token.ts"`)

**Interfaces:**
- Produces (`lib/mcp/tokens.ts`, no `"use server"`, imports `server-only`-free crypto only plus `db` lazily via an argument):
  - `TOKEN_PREFIX = "tp_"`
  - `generateToken(): string` (`tp_` + 43-char base64url of 32 random bytes)
  - `hashToken(token: string): string` (sha256 hex)
  - `parseBearer(header: string | null): string | null`
  - `type ActingUser = { id: string; name: string | null; email: string; image: string | null }`
  - `verifyToken(db: TokenDb, token: string, now?: Date): Promise<{ user: ActingUser; tokenId: string } | null>`
  - `type TokenDb = { mcpToken: Pick<PrismaClient["mcpToken"], "findUnique" | "update"> }`
- Produces (`scripts/mcp-token-run.ts`): `runMcpToken(argv: string[], deps: { db: McpTokenScriptDb; log: (s: string) => void; now?: () => Date }): Promise<number>` (exit code).

- [ ] **Step 1: Schema.** Add to `prisma/schema.prisma`:

```prisma
/// Spec 2026-10-09 / ADR 0070 amendment: an operator-minted token that lets a
/// Claude client act as this Traveller through /api/mcp. Only the SHA-256
/// hash is stored. Replaced by OAuth in the Better Auth migration (TC-06).
model McpToken {
  id         String    @id @default(cuid())
  userId     String
  label      String
  tokenHash  String    @unique
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
  revokedAt  DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

  Add `mcpTokens McpToken[]` to `model User`. Add to `model Activity`, after `changes`: `source String? // null = the app; "CLAUDE" = through a Claude connection (spec 2026-10-09)`.

  "Unique on (userId, label) among live tokens" is enforced in the script (Step 7), not by a partial index.

- [ ] **Step 2: Migration.** Run `npx prisma migrate dev --create-only --name mcp_tokens_and_activity_source` against the local DB, then rename the folder to `20261009120000_mcp_tokens_and_activity_source` if the timestamp differs, and check the SQL is exactly additive (CREATE TABLE "McpToken", its indexes and FK, `ALTER TABLE "Activity" ADD COLUMN "source" TEXT;`). No `NOT NULL` without default (DEPLOY.md §4b). Apply locally with `npx prisma migrate dev` and run `npx prisma generate`.

- [ ] **Step 3: Failing tests** `lib/mcp/tokens.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { generateToken, hashToken, parseBearer, verifyToken, TOKEN_PREFIX } from "./tokens";

describe("tokens", () => {
  it("generates distinct prefixed tokens of fixed length", () => {
    const a = generateToken(), b = generateToken();
    expect(a).not.toBe(b);
    expect(a.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(a).toMatch(/^tp_[A-Za-z0-9_-]{43}$/);
  });
  it("hashes deterministically to sha256 hex", () => {
    expect(hashToken("tp_x")).toBe(hashToken("tp_x"));
    expect(hashToken("tp_x")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("parses only a Bearer header", () => {
    expect(parseBearer("Bearer tp_abc")).toBe("tp_abc");
    expect(parseBearer("bearer tp_abc")).toBe("tp_abc");
    expect(parseBearer("Basic xyz")).toBeNull();
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("Bearer ")).toBeNull();
  });
});

describe("verifyToken", () => {
  const user = { id: "u1", name: "Cam", email: "c@x.test", image: null };
  const mk = (row: unknown) => ({
    mcpToken: { findUnique: vi.fn().mockResolvedValue(row), update: vi.fn().mockResolvedValue({}) },
  });
  it("looks up by hash, never by the raw token", async () => {
    const db = mk(null);
    await verifyToken(db as never, "tp_raw");
    expect(db.mcpToken.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashToken("tp_raw") } }));
  });
  it("returns null for unknown and for revoked", async () => {
    expect(await verifyToken(mk(null) as never, "tp_a")).toBeNull();
    expect(await verifyToken(mk({ id: "t", revokedAt: new Date(), lastUsedAt: null, user }) as never, "tp_a")).toBeNull();
  });
  it("returns the user and touches lastUsedAt at most hourly", async () => {
    const now = new Date("2026-10-09T10:00:00Z");
    const fresh = mk({ id: "t", revokedAt: null, lastUsedAt: new Date("2026-10-09T09:30:00Z"), user });
    expect(await verifyToken(fresh as never, "tp_a", now)).toEqual({ user, tokenId: "t" });
    expect(fresh.mcpToken.update).not.toHaveBeenCalled();
    const stale = mk({ id: "t", revokedAt: null, lastUsedAt: new Date("2026-10-09T08:00:00Z"), user });
    await verifyToken(stale as never, "tp_a", now);
    expect(stale.mcpToken.update).toHaveBeenCalledWith({ where: { id: "t" }, data: { lastUsedAt: now } });
  });
});
```

- [ ] **Step 4:** Run; expected FAIL.

- [ ] **Step 5: Implement** `lib/mcp/tokens.ts`:

```ts
/**
 * Claude connection tokens (spec 2026-10-09, ADR 0070 amendment). A token is
 * shown once at mint time; only its SHA-256 hash is stored. High-entropy
 * random tokens make a plain (unsalted) hash sufficient.
 */
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export const TOKEN_PREFIX = "tp_";
const TOUCH_EVERY_MS = 60 * 60 * 1000;

export type ActingUser = { id: string; name: string | null; email: string; image: string | null };
export type TokenDb = { mcpToken: Pick<PrismaClient["mcpToken"], "findUnique" | "update"> };

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function parseBearer(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

export async function verifyToken(
  db: TokenDb,
  token: string,
  now: Date = new Date(),
): Promise<{ user: ActingUser; tokenId: string } | null> {
  const row = await db.mcpToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });
  if (!row || row.revokedAt) return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await db.mcpToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
  }
  return { user: row.user, tokenId: row.id };
}
```

  Run tests; expected PASS.

- [ ] **Step 6: Failing tests for the script core** `scripts/mcp-token-run.test.ts`. Use an in-memory fake db (`user.findUnique`, `mcpToken.create/findMany/findFirst/update`). Cover:
  - `--email a@x --label laptop` with an existing user: creates a row with `tokenHash: hashToken(printed token)`, logs the token exactly once, returns 0.
  - unknown email: logs `No Traveller with that email.`, returns 1, creates nothing.
  - a live token with the same (user, label): logs `That Traveller already has a live token labelled "laptop". Revoke it first.`, returns 1.
  - `--list`: logs one line per token `<id>  <email>  <label>  created <YYYY-MM-DD>  last used <YYYY-MM-DD|never>  [revoked]`, and the log never contains `tp_` or a 64-hex hash.
  - `--revoke <id>`: sets `revokedAt`, returns 0; unknown id returns 1.
  - no arguments: prints usage, returns 1.

- [ ] **Step 7: Implement** `scripts/mcp-token-run.ts`:

```ts
/**
 * Core of `npm run mcp:token` (spec 2026-10-09). Takes its db and logger as
 * arguments so it is testable without a database; scripts/mcp-token.ts is the
 * thin entry that loads .env.production.local and passes the real client.
 */
import type { PrismaClient } from "@prisma/client";
import { generateToken, hashToken } from "../lib/mcp/tokens";

export type McpTokenScriptDb = {
  user: Pick<PrismaClient["user"], "findUnique">;
  mcpToken: Pick<PrismaClient["mcpToken"], "create" | "findMany" | "findFirst" | "update">;
};

const USAGE = [
  "Usage:",
  "  npm run mcp:token -- --email <email> --label <label>   mint a token (shown once)",
  "  npm run mcp:token -- --list                            list tokens",
  "  npm run mcp:token -- --revoke <id>                     revoke a token",
].join("\n");

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "never");

export async function runMcpToken(
  argv: string[],
  deps: { db: McpTokenScriptDb; log: (s: string) => void; now?: () => Date },
): Promise<number> {
  const { db, log } = deps;
  const now = deps.now ?? (() => new Date());

  if (argv.includes("--list")) {
    const rows = await db.mcpToken.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true, user: { select: { email: true } } },
    });
    if (rows.length === 0) log("No tokens.");
    for (const r of rows) {
      log(`${r.id}  ${r.user.email}  ${r.label}  created ${day(r.createdAt)}  last used ${day(r.lastUsedAt)}${r.revokedAt ? "  [revoked]" : ""}`);
    }
    return 0;
  }

  const revokeId = arg(argv, "--revoke");
  if (revokeId) {
    const row = await db.mcpToken.findFirst({ where: { id: revokeId, revokedAt: null }, select: { id: true } });
    if (!row) {
      log("No live token with that id.");
      return 1;
    }
    await db.mcpToken.update({ where: { id: row.id }, data: { revokedAt: now() } });
    log(`Revoked ${row.id}.`);
    return 0;
  }

  const email = arg(argv, "--email")?.trim().toLowerCase();
  const label = arg(argv, "--label")?.trim();
  if (!email || !label) {
    log(USAGE);
    return 1;
  }
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    log("No Traveller with that email.");
    return 1;
  }
  const clash = await db.mcpToken.findFirst({ where: { userId: user.id, label, revokedAt: null }, select: { id: true } });
  if (clash) {
    log(`That Traveller already has a live token labelled "${label}". Revoke it first.`);
    return 1;
  }
  const token = generateToken();
  const row = await db.mcpToken.create({ data: { userId: user.id, label, tokenHash: hashToken(token) }, select: { id: true } });
  log(`Minted ${row.id} for ${email} (${label}). Copy it now, it is not shown again:`);
  log(token);
  return 0;
}
```

  Run tests; expected PASS.

- [ ] **Step 8: Entry script** `scripts/mcp-token.ts`:

```ts
/**
 * Operator script: mint, list and revoke Claude connection tokens
 * (spec 2026-10-09, ADR 0070 amendment). Loads .env.production.local via
 * scripts/load-env.ts, so it targets production when that file exists.
 *
 *   npm run mcp:token -- --email <email> --label <label>
 *   npm run mcp:token -- --list
 *   npm run mcp:token -- --revoke <id>
 */
import "./load-env";

import { db } from "../lib/db";
import { databaseHost } from "./lib/storage-target";
import { runMcpToken } from "./mcp-token-run";

const argv = process.argv.slice(2);
console.log(`Target: database ${databaseHost(process.env.DATABASE_URL) ?? "unknown"}`);
runMcpToken(argv, { db, log: (s) => console.log(s) })
  .then((code) => { process.exitCode = code; })
  .catch((err) => { console.error("Fatal error:", err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => db.$disconnect());
```

  Add `"mcp:token": "tsx --conditions=react-server scripts/mcp-token.ts"` to `package.json` scripts next to `sweep:blobs`. Do **not** run it.

- [ ] **Step 9: Verify and commit.** Task-done tier. Commit `feat(mcp): McpToken model, token library and mcp:token script`.

---

### Task 6: Acting traveller scope, `requireUser`, and Activity `source`

**Files:**
- Create: `lib/mcp/acting-traveller.ts`, `lib/mcp/acting-traveller.test.ts`
- Modify: `lib/guards.ts:31-35` (`requireUser`), `lib/guards.test.ts`
- Modify: `server/actions/activity.ts:8-47` (`recordActivity` writes `source`)
- Modify: `server/actions/activity.test.ts` (or create if absent)
- Create: `lib/mcp/acting-traveller-imports.test.ts` (structural guard)

**Interfaces:**
- Consumes: `ActingUser` from `lib/mcp/tokens.ts`.
- Produces (`lib/mcp/acting-traveller.ts`, **no `"use server"`**):
  - `runAsTraveller<T>(user: ActingUser, fn: () => Promise<T>): Promise<T>`
  - `getActingTraveller(): ActingUser | null`
  - `ACTIVITY_SOURCE_CLAUDE = "CLAUDE"`
  - `currentActivitySource(): "CLAUDE" | null`

- [ ] **Step 1: Failing tests** `lib/mcp/acting-traveller.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { currentActivitySource, getActingTraveller, runAsTraveller } from "./acting-traveller";

const cam = { id: "u1", name: "Cam", email: "c@x.test", image: null };
const sam = { id: "u2", name: "Sam", email: "s@x.test", image: null };

describe("acting traveller", () => {
  it("is null outside a scope", () => {
    expect(getActingTraveller()).toBeNull();
    expect(currentActivitySource()).toBeNull();
  });
  it("is visible across awaits inside the scope", async () => {
    await runAsTraveller(cam, async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(getActingTraveller()).toEqual(cam);
      expect(currentActivitySource()).toBe("CLAUDE");
    });
    expect(getActingTraveller()).toBeNull();
  });
  it("keeps concurrent scopes apart", async () => {
    const seen: string[] = [];
    await Promise.all([
      runAsTraveller(cam, async () => { await new Promise((r) => setTimeout(r, 5)); seen.push(getActingTraveller()!.id); }),
      runAsTraveller(sam, async () => { await new Promise((r) => setTimeout(r, 1)); seen.push(getActingTraveller()!.id); }),
    ]);
    expect(seen.sort()).toEqual(["u1", "u2"]);
  });
});
```

- [ ] **Step 2:** Run; FAIL. **Step 3: Implement** `lib/mcp/acting-traveller.ts`:

```ts
/**
 * The Traveller a Claude connection acts as, for the duration of one
 * /api/mcp request (spec 2026-10-09). requireUser() consults this before
 * auth(), so every server action called by an MCP tool runs the same guards
 * as the app, as this Traveller.
 *
 * NEVER add "use server" to this module: that would publish runAsTraveller
 * as a callable server action. Only app/api/mcp/route.ts may call
 * runAsTraveller, and only after verifying a token
 * (lib/mcp/acting-traveller-imports.test.ts enforces the importer list).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { ActingUser } from "./tokens";

export const ACTIVITY_SOURCE_CLAUDE = "CLAUDE" as const;

const store = new AsyncLocalStorage<ActingUser>();

export function runAsTraveller<T>(user: ActingUser, fn: () => Promise<T>): Promise<T> {
  return store.run(user, fn);
}

export function getActingTraveller(): ActingUser | null {
  return store.getStore() ?? null;
}

export function currentActivitySource(): typeof ACTIVITY_SOURCE_CLAUDE | null {
  return store.getStore() ? ACTIVITY_SOURCE_CLAUDE : null;
}
```

  Run; PASS.

- [ ] **Step 4: `requireUser` test.** In `lib/guards.test.ts` (which already mocks `@/lib/auth` with `authMock`), add:

```ts
import { runAsTraveller } from "@/lib/mcp/acting-traveller";

it("requireUser returns the acting traveller inside a Claude connection, without calling auth()", async () => {
  authMock.mockClear();
  const cam = { id: "u1", name: "Cam", email: "c@x.test", image: null };
  const user = await runAsTraveller(cam, () => requireUser());
  expect(user).toEqual(cam);
  expect(authMock).not.toHaveBeenCalled();
});
```

  Keep every existing `requireUser` test passing (outside a scope it still uses `auth()` and redirects when signed out).

- [ ] **Step 5: Implement** in `lib/guards.ts`:

```ts
import { getActingTraveller } from "@/lib/mcp/acting-traveller";

export const requireUser = cache(async () => {
  // Spec 2026-10-09: inside /api/mcp the Traveller comes from a verified
  // Claude connection token, not a session cookie. Same user shape as the
  // session's, so every guard and action downstream is unchanged.
  const acting = getActingTraveller();
  if (acting) return acting;
  const session = await auth();
  if (!session?.user?.id) return signInRedirect();
  return session.user;
});
```

  Extend the doc comment above `requireUser` with that one-paragraph explanation.

- [ ] **Step 6: Activity source test** in `server/actions/activity.test.ts` (mock `@/lib/guards` `requireTripAccess` → `{ user: { id: "u1" } }` and `@/lib/db` `db.activity.create`):

```ts
it("stamps source CLAUDE inside a Claude connection, null otherwise", async () => {
  await recordActivity({ tripId: "t1", verb: "CREATED", entityType: "STOP", entityLabel: "Lisbon" });
  expect(createMock.mock.calls[0][0].data.source).toBeNull();
  await runAsTraveller({ id: "u1", name: null, email: "c@x.test", image: null }, () =>
    recordActivity({ tripId: "t1", verb: "CREATED", entityType: "STOP", entityLabel: "Lisbon" }),
  );
  expect(createMock.mock.calls[1][0].data.source).toBe("CLAUDE");
});
```

- [ ] **Step 7: Implement:** in `recordActivity`'s `db.activity.create` data add `source: currentActivitySource(),` with import from `@/lib/mcp/acting-traveller`.

- [ ] **Step 8: Structural guard** `lib/mcp/acting-traveller-imports.test.ts`:

```ts
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("runAsTraveller is only reachable from the MCP route", () => {
  it("is imported only by app/api/mcp/route.ts (and tests)", () => {
    const out = execSync(`git grep -l "runAsTraveller" -- '*.ts' '*.tsx'`, { encoding: "utf8" });
    const importers = out.split("\n").filter(Boolean)
      .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
      .filter((f) => f !== "lib/mcp/acting-traveller.ts");
    for (const f of importers) expect(["app/api/mcp/route.ts"]).toContain(f);
  });
  it("lib/mcp/acting-traveller.ts has no 'use server' directive", () => {
    expect(readFileSync("lib/mcp/acting-traveller.ts", "utf8")).not.toMatch(/^\s*["']use server["']/m);
  });
});
```

  (`git grep` sees only tracked and staged files: `git add` new files before running.)

- [ ] **Step 9: Verify and commit.** Task-done tier (includes `npx vitest related --run lib/guards.ts server/actions/activity.ts`, which runs many action tests: they mock `@/lib/guards`, so they must stay green). Commit `feat(mcp): acting traveller scope; Activity source`.

---

### Task 7: Activity feed and bell say "via Claude"

**Files:**
- Modify: `lib/activity.ts` (add `viaLabel`)
- Modify: `components/trip/activity-feed.tsx:~41-111`, `components/trip/notification-bell.tsx:~139-143`
- Modify: `app/(app)/trips/[tripId]/activity/page.tsx:25` and `server/actions/activity.ts:57` (only if they `select` fields: ensure `source` is returned)
- Test: `lib/activity.test.ts`, `components/trip/activity-feed.test.tsx`, `components/trip/notification-bell.test.tsx` (extend existing)

**Interfaces:**
- Produces: `viaLabel(source: string | null | undefined): string | null` in `lib/activity.ts` (returns `"via Claude"` for `"CLAUDE"`, else `null`).

- [ ] **Step 1: Failing tests.** `lib/activity.test.ts`: `viaLabel("CLAUDE") === "via Claude"`, `viaLabel(null) === null`, `viaLabel("OTHER") === null`. In the feed and bell tests, render one activity with `source: "CLAUDE"` and one with `source: null`; assert `screen.getByText("via Claude")` appears exactly once and is inside the first row.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3: Implement** `viaLabel` next to `headline` in `lib/activity.ts`:

```ts
/** Spec 2026-10-09: Activity done through a Claude connection reads "via Claude". */
export function viaLabel(source: string | null | undefined): string | null {
  return source === "CLAUDE" ? "via Claude" : null;
}
```

  In `activity-feed.tsx`, after the sentence at line ~111, render `{via && <span className="text-muted-foreground"> · {via}</span>}` where `const via = viaLabel(activity.source);`. In `notification-bell.tsx`, the same after the headline. Match the surrounding components' existing muted-text class (read the file; use what it already uses for secondary text). Make sure each component's activity type includes `source: string | null` (add to the prop type; Prisma rows already carry it when no `select` narrows them; where a `select` exists, add `source: true`).
- [ ] **Step 4:** Run; PASS. **Step 5:** Task-done tier; commit `feat(activity): mark changes made via Claude`.

---

### Task 8: `/api/mcp` route, server skeleton, tool runner, `list_trips`

**Files:**
- Modify: `package.json` / lockfile (`npm install @modelcontextprotocol/sdk@1.32.1`)
- Create: `lib/mcp/run-tool.ts`, `lib/mcp/run-tool.test.ts`
- Create: `lib/mcp/server.ts` (builds the `McpServer`, calls each `register*Tools`)
- Create: `lib/mcp/tools/trips-read.ts` (`list_trips`), `lib/mcp/tools/trips-read.test.ts`
- Create: `lib/mcp/test-client.ts` (test helper: in-memory client)
- Create: `app/api/mcp/route.ts`, `app/api/mcp/route.test.ts`

**Interfaces:**
- Consumes: `verifyToken`, `parseBearer` (Task 5); `runAsTraveller` (Task 6); `reportError(err, ctx)` from `lib/error-sink.ts`; `createRateLimiter` from `lib/rate-limit.ts`.
- Produces:
  - `lib/mcp/run-tool.ts`: `type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean }`; `runTool(name: string, fn: () => Promise<unknown>): Promise<ToolResult>`; `NOT_FOUND_TEXT = "Not found, or you don't have access to it."`.
  - `lib/mcp/server.ts`: `buildMcpServer(): McpServer`.
  - `lib/mcp/test-client.ts`: `connectTestClient(): Promise<Client>` (builds the server, links `InMemoryTransport.createLinkedPair()`, returns a connected SDK `Client`).
  - Every tool module exports `register<Group>Tools(server: McpServer): void`.

**`runTool` contract** (all tools use it):
- `fn` resolves to a value. If it is an action failure (`{ success: false, errors }` → text "Couldn't do that: " + `field: message` pairs joined by "; ", with `_` rendered as just the message; or `{ success: false, error }` → "Couldn't do that: " + error), return `isError: true`.
- Otherwise return `{ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] }` (strip `success: true` from action results).
- If `fn` throws an error whose `digest` starts with `NEXT_HTTP_ERROR_FALLBACK;404` → `NOT_FOUND_TEXT`, `isError: true`. Starts with `NEXT_REDIRECT` → `"Not signed in."`, `isError: true`. A `ZodError` → its issues as `path: message`, `isError: true`. Anything else → `reportError(err, { route: "/api/mcp", source: "server", userId: getActingTraveller()?.id })` and `"Couldn't do that. Try again."`, `isError: true`.

- [ ] **Step 1:** `npm install @modelcontextprotocol/sdk@1.32.1`. Check the SDK's zod peer accepts zod 4 (it declares `^3.25 || ^4.0`). Read `node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.d.ts` and `.../server/mcp.d.ts` (`registerTool(name, { title?, description?, inputSchema?: ZodRawShape, annotations? }, cb)` and `registerPrompt`). Read the Next route-handler docs listed in Tech Stack.

- [ ] **Step 2: Failing tests** `lib/mcp/run-tool.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));
import { reportError } from "@/lib/error-sink";
import { NOT_FOUND_TEXT, runTool } from "./run-tool";

const digestErr = (digest: string) => Object.assign(new Error(digest), { digest });

describe("runTool", () => {
  it("returns JSON text for a value and drops success:true", async () => {
    const r = await runTool("t", async () => ({ success: true, tripId: "x" }));
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(r.content[0].text)).toEqual({ tripId: "x" });
  });
  it("maps field errors", async () => {
    const r = await runTool("t", async () => ({ success: false, errors: { name: ["Name is required"], _: ["Trip is locked"] } }));
    expect(r).toEqual({ isError: true, content: [{ type: "text", text: "Couldn't do that: name: Name is required; Trip is locked" }] });
  });
  it("maps a single error string", async () => {
    const r = await runTool("t", async () => ({ success: false, error: "Bad date" }));
    expect(r.content[0].text).toBe("Couldn't do that: Bad date");
  });
  it("maps notFound() to the same text for missing and forbidden", async () => {
    const r = await runTool("t", async () => { throw digestErr("NEXT_HTTP_ERROR_FALLBACK;404"); });
    expect(r).toEqual({ isError: true, content: [{ type: "text", text: NOT_FOUND_TEXT }] });
  });
  it("maps a redirect to not signed in", async () => {
    const r = await runTool("t", async () => { throw digestErr("NEXT_REDIRECT;replace;/;307;"); });
    expect(r.content[0].text).toBe("Not signed in.");
  });
  it("maps a ZodError to its issues", async () => {
    const r = await runTool("t", async () => z.object({ n: z.number() }).parse({ n: "x" }));
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/^Couldn't do that: n: /);
  });
  it("reports unknown errors and hides them", async () => {
    const r = await runTool("t", async () => { throw new Error("db exploded"); });
    expect(r.content[0].text).toBe("Couldn't do that. Try again.");
    expect(reportError).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3:** Run; FAIL. **Step 4: Implement** `lib/mcp/run-tool.ts`:

```ts
/**
 * One error contract for every MCP tool (spec 2026-10-09). Tools call the
 * existing server actions; this maps their results and Next's control-flow
 * throws into MCP tool results. notFound() covers both "missing" and "not
 * yours", so a tool never reveals whether a Trip exists.
 */
import { ZodError } from "zod";
import { reportError } from "@/lib/error-sink";
import { getActingTraveller } from "./acting-traveller";

export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
export const NOT_FOUND_TEXT = "Not found, or you don't have access to it.";

const text = (t: string, isError?: boolean): ToolResult =>
  isError ? { isError: true, content: [{ type: "text", text: t }] } : { content: [{ type: "text", text: t }] };

function fieldErrors(errors: Record<string, string[]>): string {
  return Object.entries(errors)
    .flatMap(([k, msgs]) => msgs.map((m) => (k === "_" ? m : `${k}: ${m}`)))
    .join("; ");
}

export async function runTool(name: string, fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const value = await fn();
    if (value && typeof value === "object" && "success" in value) {
      const v = value as { success: boolean; errors?: Record<string, string[]>; error?: string };
      if (v.success === false) {
        return text(`Couldn't do that: ${v.errors ? fieldErrors(v.errors) : (v.error ?? "unknown error")}`, true);
      }
      const { success: _ok, ...rest } = value as Record<string, unknown>;
      return text(JSON.stringify(rest, null, 2));
    }
    return text(JSON.stringify(value ?? null, null, 2));
  } catch (err) {
    const digest = (err as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return text(NOT_FOUND_TEXT, true);
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return text("Not signed in.", true);
    if (err instanceof ZodError) {
      return text(`Couldn't do that: ${err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`, true);
    }
    await reportError(err, { route: `/api/mcp#${name}`, source: "server", userId: getActingTraveller()?.id });
    return text("Couldn't do that. Try again.", true);
  }
}
```

  Run; PASS.

- [ ] **Step 5: `list_trips`.** `lib/mcp/tools/trips-read.ts`:

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { requireUser } from "@/lib/guards";
import { loadTripsPage } from "@/lib/trips/trips-page-loader";
import { runTool } from "../run-tool";

export function registerTripReadTools(server: McpServer): void {
  server.registerTool(
    "list_trips",
    {
      title: "List my trips",
      description: "Lists the Trips you are a member of, with id, name, dates and phase. Use the id with the other tools.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      runTool("list_trips", async () => {
        const user = await requireUser();
        const data = await loadTripsPage(user.id);
        return data.cards.map((c) => ({ id: c.id, name: c.name, startDate: c.startDate, endDate: c.endDate, phase: c.phase }));
      }),
  );
}
```

  Read `lib/trips/trips-page-loader.ts` first and use the card's real field names (adjust the mapping, keep the output keys `id, name, startDate, endDate, phase`). Exclude deleted trips if the loader includes them.

- [ ] **Step 6: Server and test client.** `lib/mcp/server.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTripReadTools } from "./tools/trips-read";

export const MCP_INSTRUCTIONS = [
  "You are working on the user's TEEPEE trips, as them. Changes are real and visible to their travel partner, marked 'via Claude'.",
  "Vocabulary: a Stop is a place they stay; an Item is a thing to do or see; the Wishlist holds ideas not yet placed.",
  "Every tool works on the real plan. Read the plan before changing it, and say what you changed.",
].join(" ");

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "teepee", version: "1.0.0" }, { instructions: MCP_INSTRUCTIONS });
  registerTripReadTools(server);
  return server;
}
```

  `lib/mcp/test-client.ts`:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "./server";

/** Test helper: an MCP client wired to a fresh server in memory. */
export async function connectTestClient(): Promise<Client> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await buildMcpServer().connect(serverT);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientT);
  return client;
}
```

  `lib/mcp/tools/trips-read.test.ts`: mock `@/lib/guards` (`requireUser` → `{ id: "u1" }`) and `@/lib/trips/trips-page-loader`; `const c = await connectTestClient(); const r = await c.callTool({ name: "list_trips", arguments: {} });` assert the parsed JSON and that `loadTripsPage` got `"u1"`. Also `(await c.listTools()).tools.map(t => t.name)` contains `list_trips`.

- [ ] **Step 7: Route tests first** `app/api/mcp/route.test.ts`. Mock `@/lib/db` (`db.mcpToken.findUnique/update`), `@/lib/mcp/server` (`buildMcpServer` returns a real server with a single tool `whoami` that returns `getActingTraveller()`), `@/lib/error-sink`. Cases:
  - no header → 401, body `{"error":"Unauthorized"}`, header `WWW-Authenticate: Bearer`, and `findUnique` not called.
  - unknown token and revoked token → byte-identical 401 responses.
  - valid token, `POST` an `initialize` JSON-RPC request (`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}` with headers `content-type: application/json`, `accept: application/json, text/event-stream`) → 200 JSON containing `serverInfo.name === "teepee"`.
  - valid token, `tools/call` `whoami` → the acting user's id.
  - `GET` and `DELETE` → 405.
  - more than 120 requests in a minute from one token → 429.

- [ ] **Step 8: Implement** `app/api/mcp/route.ts`:

```ts
/**
 * Claude connection endpoint (spec 2026-10-09, ADR 0070 amendment).
 * Stateless Streamable HTTP: each POST builds a fresh MCP server and runs it
 * inside runAsTraveller, so requireUser() resolves to the token's Traveller
 * and every tool goes through the app's own guards.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { db } from "@/lib/db";
import { reportError } from "@/lib/error-sink";
import { runAsTraveller } from "@/lib/mcp/acting-traveller";
import { buildMcpServer } from "@/lib/mcp/server";
import { parseBearer, verifyToken } from "@/lib/mcp/tokens";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
}

export async function POST(req: Request): Promise<Response> {
  const token = parseBearer(req.headers.get("authorization"));
  if (!token) return unauthorized();
  const verified = await verifyToken(db, token);
  if (!verified) return unauthorized();
  if (!limiter.allow(verified.tokenId)) return Response.json({ error: "Too many requests" }, { status: 429 });

  try {
    return await runAsTraveller(verified.user, async () => {
      const server = buildMcpServer();
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      return transport.handleRequest(req);
    });
  } catch (err) {
    await reportError(err, { route: "/api/mcp", source: "server", userId: verified.user.id });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
```

  If the transport's response for a JSON-RPC notification is 202 with no body, keep it. If `handleRequest` returns before tool handlers finish (it must not, with `enableJsonResponse: true`), the `whoami` test catches it.

- [ ] **Step 9:** Run `npx vitest run app/api/mcp lib/mcp`; PASS. Add `lib/mcp/acting-traveller-imports.test.ts` to the run; PASS (route is the only importer). Task-done tier. Commit `feat(mcp): /api/mcp route, tool runner, list_trips`.

---

### Task 9: Read tools: plan, wishlist, notes, reminders, checklists, activity, markers, place search

**Files:**
- Create: `lib/mcp/reads/trip-plan.ts` (+ test), `lib/mcp/tools/reads.ts` (+ test)
- Modify: `lib/mcp/server.ts` (register `registerReadTools`)

**Interfaces:**
- Consumes: `requireTripAccess(tripId)`, `requireUser()` (`lib/guards.ts`); `REAL_PLAN`, `WISHLIST_IDEA_WHERE` (`lib/plan-scope.ts`); `loadDayTitles(stops)` (`lib/day-titles-loader.ts`); `getRecentActivity` is capped at 10, so query directly; `listRemindersForTrip(tripId, fromDate)` (`server/actions/reminders.ts:100`); `listTemplates()` (`server/actions/checklists.ts:397`); `sortChecklist` (`lib/checklists.ts:32`); `requireGlobeAccess()` (`lib/globe.ts:63`); `findPlaces(query)` (`server/actions/places.ts:12`); `headline`, `viaLabel` (`lib/activity.ts`); `travellerName` (`lib/traveller.ts`).
- Produces: `loadTripPlanForMcp(tripId: string): Promise<McpTripPlan>` in `lib/mcp/reads/trip-plan.ts`; `registerReadTools(server)`.

Every read function **starts with `await requireTripAccess(tripId)`** (or `requireUser()` / `requireGlobeAccess()` for user-level reads) and queries with `REAL_PLAN` scoping. Return plain JSON: ids, names, ISO dates (`YYYY-MM-DD`), minor-unit money with currency, no internal flags.

| Tool | Input (zod shape) | Returns |
|---|---|---|
| `get_trip_plan` | `{ tripId: z.string() }` | Trip (id, name, startDate, endDate, hardEndDate, homeCurrency, homeBase name, roundTrip); Stops in order (id, name, countryCode, rough?, nights, arriveDate, departDate, pinned, chapterId, notes, accommodations[], thingsToDo[] (unscheduled Items at the Stop), days[] (date, dayTitle, items[] with time)); transports[] (id, mode, from/to stop or home, depAt, arrAt, reference); chapters[] |
| `get_wishlist` | `{ tripId }` | ideas (Items matching `WISHLIST_IDEA_WHERE`, real plan) with category, notes, link, and votes `[{ traveller, level }]` |
| `get_notes` | `{ tripId }` | notes `{ id, targetType, targetId, body, author, createdAt }` |
| `get_reminders` | `{ tripId, fromDate?: YYYY-MM-DD }` | `listRemindersForTrip(tripId, fromDate ?? today)` |
| `get_checklists` | `{ tripId }` | `{ pretrip: [...], packing: [...], shopping: [...] }` each `{ id, text, done, dueDate, buyState }` sorted with `sortChecklist`; plus `templates: listTemplates()` |
| `get_activity` | `{ tripId, since?: ISO datetime, limit?: 1..100 (default 50) }` | `[{ at, who: travellerName(actor), what: headline(row), via: viaLabel(row.source) }]` newest first |
| `list_globe_markers` | `{}` | markers `{ id, name, category, town, countryCode, when, note, link }` via `requireGlobeAccess()` |
| `search_places` | `{ query: z.string().min(2) }` | `findPlaces(query)` (name, lat, lng, countryCode, display label). Description: "Use before adding a Stop or Item to get coordinates and a country code." |

- [ ] **Step 1:** Read `app/(app)/trips/[tripId]/plan/page.tsx:81-300` (the plan editor's queries), `wishlist/page.tsx:37-260`, `checklists/page.tsx:49-110`, `app/(app)/globe/page.tsx:18-33`, `activity/page.tsx`. Mirror their `where` clauses with `REAL_PLAN` (never `resolvePlan`).
- [ ] **Step 2: Failing tests.** `lib/mcp/reads/trip-plan.test.ts`: mock `@/lib/guards` and `@/lib/db`; assert `requireTripAccess` is called **before** any `db` read (use `expectAccessCheckedBeforeWrite`-style ordering from `test/helpers/access-order.ts`, or record call order manually), every query's `where` includes `forkId: null`, and the output groups scheduled Items under the right Stop day and things-to-do under the Stop. `lib/mcp/tools/reads.test.ts`: with `connectTestClient()`, each tool returns the mapped shape from mocked loaders; a `requireTripAccess` that throws a 404 digest returns `NOT_FOUND_TEXT` for every trip-scoped tool (loop over tool names).
- [ ] **Step 3: Implement** `loadTripPlanForMcp` and `registerReadTools` (every handler is `({ tripId }) => runTool("<name>", async () => ...)`, `annotations: { readOnlyHint: true }`). Register in `buildMcpServer`.
- [ ] **Step 4:** Run; PASS. Task-done tier. Commit `feat(mcp): read tools`.

---

### Task 10: Read tools: budget and flags (extract page loaders)

**Files:**
- Create: `lib/budget-loader.ts` (+ test), `lib/flags-loader.ts` (+ test)
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx:88-180`, `app/(app)/trips/[tripId]/summary/page.tsx:108-345` (call the loaders; behaviour unchanged)
- Modify: `lib/mcp/tools/reads.ts` (+ test): `get_budget`, `get_flags`

**Interfaces:**
- Consumes: `buildBudget(input)` (`lib/budget.ts:447`), `detectFlags(input)` (`lib/flags.ts:894`), `getTripProjection(tripId)`.
- Produces: `loadBudget(tripId: string): Promise<BudgetResult & { homeCurrency: string }>` and `loadFlags(tripId: string): Promise<Flag[]>`; both call `requireTripAccess(tripId)` first and read `REAL_PLAN`.

- [ ] **Step 1:** Read both pages. Move **only** the queries and the input assembly for `buildBudget` / `detectFlags` into the loaders, verbatim; the pages call the loaders and keep everything else. The summary page uses `REAL_PLAN` already; the budget page's plan scope must stay what it is today for the page (if the budget page honours `?plan=`, give `loadBudget` an internal `forkId` parameter defaulting to `null` and have the page pass its own; the MCP tool never passes it).
- [ ] **Step 2: Tests.** Existing page tests must stay green unchanged (they are the refactor's safety net: run `npx vitest related --run` on both pages before and after). New loader tests: access check first; real-plan scoping.
- [ ] **Step 3: Tools.** `get_budget { tripId }` returns `{ homeCurrency, grandTotal, byCategory, byStop, missingRates }` (drop `byDay`, `byChapter` to keep the payload small). `get_flags { tripId }` returns `[{ severity, title, detail, stopId? }]` from the `Flag` type's real fields. Both `readOnlyHint`.
- [ ] **Step 4:** Run; PASS. Task-done tier. Commit `feat(mcp): budget and flags reads via shared loaders`.

---

### Task 11: Write tools: trips and stops

**Files:**
- Create: `lib/mcp/tools/trips-stops-write.ts` (+ test)
- Modify: `lib/mcp/server.ts`

**Interfaces:** Consumes the actions below; produces `registerTripStopWriteTools(server)`.

Each tool: `server.registerTool(name, { title, description, inputSchema }, (args) => runTool(name, () => action(...mapped args)))`. Never pass `forkId` (omit the argument). Input shapes are flat zod (MCP needs a `ZodRawShape`); the action re-validates with its own schema.

| Tool | Input | Calls |
|---|---|---|
| `create_trip` | `name`, `startDate?`, `endDate?`, `hardEndDate?`, `homeCurrency` (enum from `lib/validations/trip.ts`), `homeName?`, `roundTrip?`, `roughMonth?` (YYYY-MM) | `createTrip(input)` (no cover files). Returns `{ tripId }` |
| `update_trip` | `tripId`, `name`, `startDate?`, `endDate?`, `homeCurrency`, `roughMonth?` | `updateTrip(tripId, input)`. Description: "Read the trip first; fields you omit are cleared." |
| `set_hard_end_date` | `tripId`, `hardEndDate: string \| null` | `setTripHardEndDate` |
| `add_stop` | `tripId`, `name`, `countryCode`, `country?`, `lat?`, `lng?`, `notes?`, `afterStopId?`, and either `nights` (rough) or `arriveDate`+`departDate`+`timezone` (scheduled) | builds `StopInput` with `mode` = `"scheduled"` when both dates are given, else `"rough"`; `createStop(tripId, input, undefined, afterStopId ?? null)` |
| `update_stop` | `stopId` + the same fields as `add_stop` (full replace) | `updateStop(stopId, input)` |
| `delete_stop` | `stopId` | `previewStopDeletion` first; then `deleteStop(stopId)`; return the preview alongside. Description says it is owner-only and that the app can restore it. |
| `move_stop` | `stopId`, `direction: "up" \| "down"` | `moveStop` |
| `set_stop_nights` | `stopId`, `nights: int 0..366` | `setStopNights` |
| `set_stop_dates` | `stopId`, `arriveDate`, `departDate` | `setStopDates` |
| `toggle_stop_pin` | `stopId` | `toggleStopPin(stopId)`. Description: "Flips whether the Stop is Pinned (fixed dates). Read the plan first to see the current value." |
| `make_stop_rough` | `stopId` | `makeStopRough` |
| `set_stop_notes` | `stopId`, `notes` | `setStopNotes` |
| `firm_up_trip` | `tripId`, `anchorDate?` | `firmUpTrip(tripId, anchorDate)` |
| `assign_stop_to_chapter` | `stopId`, `chapterId: string \| null` | `assignStopToChapter` from `server/actions/chapters.ts` |


- [ ] **Step 1: Failing tests** with `connectTestClient()` and the actions mocked (`vi.mock("@/server/actions/stops", ...)` etc.):
  - `add_stop` with dates → `createStop` called with `mode: "scheduled"` and **exactly 4 args where arg 3 is `undefined`**; without dates → `mode: "rough"`.
  - `create_trip` → `createTrip` called with one argument (no files).
  - `delete_stop` → `previewStopDeletion` called before `deleteStop`.
  - an action returning `{ success: false, errors: { name: ["Required"] } }` → tool `isError` with "name: Required".
  - no tool's input schema has a key named `forkId` (loop `listTools()` and inspect `inputSchema.properties`).
- [ ] **Step 2:** Run; FAIL. **Step 3: Implement**, register in `buildMcpServer`. **Step 4:** PASS. Task-done tier. Commit `feat(mcp): trip and stop write tools`.

---

### Task 12: Write tools: items, wishlist, votes, day titles, notes, chapters

**Files:** Create `lib/mcp/tools/plan-write.ts` (+ test); modify `lib/mcp/server.ts`.

| Tool | Input | Calls |
|---|---|---|
| `add_thing_to_do` | `tripId`, `title`, `category` (`categorySchema`), `stopId?`, `date?`, `startTime?`, `endTime?`, `address?`, `link?`, `booking?`, `notes?`, `lat?`, `lng?` | `createItem(tripId, input)`. Description: "Adds a thing to do or see. With stopId it sits under that Stop; with date it is scheduled on that day; with neither it is a Wishlist idea." |
| `update_thing_to_do` | `itemId` + the same fields | `updateItem(itemId, input)` |
| `delete_thing_to_do` | `itemId` | `deleteItem` |
| `schedule_thing_to_do` | `itemId`, `date`, `startTime?`, `endTime?` | `scheduleItem(itemId, { date, startTime, endTime })` |
| `unschedule_thing_to_do` | `itemId` | `unscheduleItem` |
| `place_idea_at_stop` | `itemId`, `stopId` | `placeIdeaAtStop(itemId, stopId)` |
| `add_marker_to_wishlist` | `markerId`, `tripId` | `addMarkerToWishlist` |
| `set_vote` / `clear_vote` | `tripId`, `itemId`, `level` (`voteLevelSchema`) | `setVote` / `clearVote` |
| `set_day_title` | `stopId`, `date`, `title` (empty clears) | `setDayTitle({ stopId, date, title })` |
| `add_note` | `tripId`, `targetType` (`targetTypeSchema`), `targetId`, `body` | `addNote(tripId, { targetType, targetId, body })` |
| `add_chapter` | `tripId`, `name`, `colour`, `startDate?`, `endDate?` | `createChapter(tripId, input)` |
| `update_chapter` | `chapterId` + same | `updateChapter` |

- [ ] **Step 1: Failing tests** (same style as Task 11): each tool calls its action with the mapped args and no `forkId`; `set_day_title` with `""` passes `""`; an action failure maps to `isError`. **Step 2-4:** implement, register, PASS. Task-done tier. Commit `feat(mcp): item, wishlist, vote, day title, note and chapter tools`.

---

### Task 13: Write tools: accommodation, transport, costs

**Files:** Create `lib/mcp/tools/bookings-write.ts` (+ test); modify `lib/mcp/server.ts`.

| Tool | Input | Calls |
|---|---|---|
| `add_accommodation` | `stopId`, `name`, `checkIn`, `checkOut`, `address?`, `checkInTime?`, `checkOutTime?`, `confirmation?`, `notes?`, `lat?`, `lng?`, `costMinor?`, `currency?` | `createAccommodation(input)` |
| `update_accommodation` / `delete_accommodation` | `accommodationId` (+ fields) | `updateAccommodation` / `deleteAccommodation` |
| `add_transport` | `tripId`, `mode` (`transportModeSchema`), `fromStopId?`, `toStopId?`, `depIsHome?`, `arrIsHome?`, `depPlace?`, `arrPlace?`, `depAt`, `arrAt` (ISO datetime), `reference?`, `notes?`, `costMinor?`, `currency?` | `createTransport(tripId, input)` |
| `update_transport` / `delete_transport` | `transportId` (+ fields) | `updateTransport` / `deleteTransport` |
| `add_cost` | `tripId`, `costMinor`, `currency`, `ownerType` (`costOwnerTypeSchema`), `ownerId?`, `label?`, `category?`, `dueDate?`, `settlement?` (`costSettlementSchema`) | `createCost(tripId, input)` |
| `update_cost` / `delete_cost` | `costId` (+ fields) | `updateCost` / `deleteCost` |
| `mark_cost_paid` | `costId`, `paidMinor`, `paidAt` (YYYY-MM-DD) | `markCostPaid` |
| `mark_cost_unpaid` | `costId` | `markCostUnpaid` |

Descriptions state money is in minor units (cents) of `currency`.

- [ ] Steps as Task 12 (tests: arg mapping, no `forkId`, failure mapping). Commit `feat(mcp): accommodation, transport and cost tools`.

---

### Task 14: Write tools: reminders and checklists

**Files:** Create `lib/mcp/tools/lists-write.ts` (+ test); modify `lib/mcp/server.ts`.

| Tool | Input | Calls |
|---|---|---|
| `add_reminder` | `tripId`, `title`, `date`, `stopId?` | `addReminder(tripId, { title, date, stopId })` |
| `update_reminder` / `delete_reminder` | `reminderId` (+ fields) | `updateReminder(id, input)` / `deleteReminder(id)` |
| `add_checklist_item` | `tripId`, `kind` (`checklistKindSchema`: pre-trip or packing), `text`, `dueDate?` | `addChecklistItem(tripId, { kind, text, dueDate })` |
| `add_shopping_item` | `tripId`, `text` | read `lib/validations/checklist.ts` and `server/actions/checklists.ts` for how a standalone Shopping entry is created (a kind value or `setBuyState`); call that path. If standalone shopping entries are created by a mechanism the actions do not expose, drop this tool and say so in the report. |
| `update_checklist_item` | `itemId`, `text?`, `dueDate?` | `updateChecklistItem` |
| `tick_checklist_item` | `itemId`, `done: boolean` | `toggleChecklistItem(itemId, done)` |
| `set_need_to_buy` | `itemId`, `buy` (`buyStateSchema` or `null`) | `setBuyState` |
| `move_checklist_item` | `itemId`, `direction` | `reorderChecklistItem` |
| `delete_checklist_item` | `itemId` | `deleteChecklistItem` |
| `save_packing_template` | `tripId`, `name` | `saveAsTemplate` |
| `apply_packing_template` | `tripId`, `templateId` | `applyTemplate` |

- [ ] Steps as Task 12. Commit `feat(mcp): reminder and checklist tools`.

---

### Task 15: Make it fit tools and prompts

**Files:** Create `lib/mcp/tools/make-it-fit.ts` (+ test), `lib/mcp/prompts.ts` (+ test); modify `lib/mcp/server.ts`.

**Interfaces:** Consumes `buildTrimPlan`, `buildDropCandidates`, `nightsOver`, type `FitStop` (`lib/make-it-fit.ts`); `getTripProjection(tripId)`; `setStopNights`, `deleteStop`. Reads stops with `requireTripAccess` first and `REAL_PLAN`; the anchor is the trip's `startDate` (as `components/plan/fit-tile.tsx:143`).

- `make_it_fit_preview { tripId }` → `{ deadline, projectedEnd, nightsOver, trim: TrimPlan, drop: DropCandidate[] }`, or `{ fits: true }` when not over.
- `make_it_fit_apply { tripId, trims?: [{ stopId, nights }], dropStopId?: string }` (exactly one of the two, else a tool error) → `setStopNights` per trim **in order, stopping at the first failure** and reporting which applied (mirrors `components/trip/make-it-fit.tsx:157 applyTrim`), or `deleteStop(dropStopId)`. Every `stopId` must be in this trip's real plan (check against the loaded stops; else `NOT_FOUND_TEXT`).
- Prompts via `server.registerPrompt(name, { title, description, argsSchema: { tripId: z.string() } }, ({ tripId }) => ({ messages: [{ role: "user", content: { type: "text", text } }] }))`:
  - `review-plan`: "Review trip <tripId>: call get_trip_plan, get_flags and get_budget, then list what looks wrong or risky (gaps, clashes, unbooked stays, the deadline) and propose fixes. Change nothing until I agree."
  - `pack-for`: "Build the packing list for trip <tripId>: read get_trip_plan (places, dates, season) and get_checklists, then propose additions grouped by type; after I confirm, add them with add_checklist_item (kind packing) and mark anything we need to buy with set_need_to_buy."

- [ ] **Tests:** preview returns `{ fits: true }` when not over; apply with both or neither argument errors; a foreign `stopId` returns `NOT_FOUND_TEXT` and calls no action; trims stop at the first failure; `listPrompts()` has both and `getPrompt` interpolates `tripId`. Implement, register, PASS. Task-done tier. Commit `feat(mcp): make it fit tools and prompts`.

---

### Task 16: End-to-end integration test, docs, follow-ups

**Files:**
- Create: `test/integration/mcp.test.ts`
- Create: `docs/connect-claude.md`
- Modify: `docs/DEPLOY.md`, `docs/open-follow-ups.md`, `README.md` (one line in the scripts list if one exists)

- [ ] **Step 1: Integration test** `test/integration/mcp.test.ts`, following `test/integration/locking.test.ts`'s skip guard (`describe.skipIf(process.env.INTEGRATION !== "1")`) and `vi.mock("next/cache", ...)`, but **not** mocking `@/lib/guards` (the point is the real guards). Seed two users (`mcp-a`, `mcp-b`) and a trip with only `mcp-a` as owner; insert an `McpToken` for each with `hashToken(knownToken)`. Import `POST` from `@/app/api/mcp/route`. Cases:
  - `mcp-a` `tools/call` `add_stop` (rough, 3 nights) → success; the Stop exists; an `Activity` row exists with `actorId: "mcp-a"`, `source: "CLAUDE"`.
  - `mcp-b` `get_trip_plan` on that trip → `isError` with `NOT_FOUND_TEXT`.
  - revoked token → 401.
  Clean up rows in `afterAll`.
- [ ] **Step 2:** Run `npm run test:integration` (local DB is up). PASS.
- [ ] **Step 3: Verify the Desktop bridge.** Read the `mcp-remote` package README (`npm view mcp-remote readme` or `npm pack mcp-remote` into the scratchpad and read it). Confirm the args for a custom header and how to pass a value from `env` (the README documents `--header "Authorization:${AUTH_HEADER}"` with an `env` block, because Desktop mangles spaces in args). Record the exact config. If the bridge cannot send a static header, the doc says Desktop waits for OAuth (TC-06).
- [ ] **Step 4: `docs/connect-claude.md`** (plain words, for Cam and his partner):
  - What it is (one paragraph, using **Claude connection** and "via Claude").
  - Getting a token: ask Cam; he runs `npm run mcp:token -- --email <you> --label <device>`.
  - Claude Code: `claude mcp add --transport http teepee https://<site>/api/mcp --header "Authorization: Bearer <token>"`, and the `.mcp.json` form with `"headers": { "Authorization": "Bearer ${TEEPEE_TOKEN}" }`.
  - Claude Desktop: the verified `mcp-remote` config from Step 3 (needs Node 18+, not the codebase).
  - What it can and cannot do (the v1 list from the spec), and that edits show in the app marked "via Claude".
  - Operator section: mint, list, revoke; a lost token is revoked and re-minted; tokens never expire.
- [ ] **Step 5: `docs/DEPLOY.md`:** under the migrations section, note `20261009120000_mcp_tokens_and_activity_source` (additive: new table + nullable column) and that `/api/mcp` goes live with the deploy; mint tokens only after the migration is applied.
- [ ] **Step 6: `docs/open-follow-ups.md`:** strike TC-03 ("**v1 built 2026-10-09** on this branch: hosted `/api/mcp`, operator tokens, see `docs/connect-claude.md`"); add
  - `TC-06 · OAuth Claude connection after Better Auth.` Replace operator-minted tokens with OAuth sign-in from the Claude client (opens claude.ai web and mobile and makes Desktop native); retire `mcp:token`. Bound by ADR 0070's 2026-10-09 amendment: the Better Auth migration is not done until this is.
  - `TC-07 · Checklist, Reminder, Day title and Vote history in Activity.` Idea, not committed: those changes write no Activity for anyone, so a Claude session's edits there leave no trace.
  - Any concerns the earlier tasks reported (e.g. a dropped `add_shopping_item`).
- [ ] **Step 7: Commit** `test(mcp): end-to-end through /api/mcp; docs: connect Claude` with trailer `Resolves-Feedback:` **not** used (TC items are not Feedback notes).

### Task 17: Branch verification

- [ ] `npm test` (full suite). Expected: all green.
- [ ] `npm run build`. Expected: success.
- [ ] `npm run test:integration` (local DB up). Expected: all green including `mcp.test.ts`.
- [ ] `npx eslint .` on the branch's changed files (`git diff --name-only main...HEAD -- '*.ts' '*.tsx'`).
- [ ] Fix anything red in place, commit, and re-run the failing tier.
