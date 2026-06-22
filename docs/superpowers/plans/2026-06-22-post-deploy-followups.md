# Post-Deploy Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add CI, restore the AI EU Christmas demo seed, and clean up stale "SQLite" comments — after the Postgres/R2 production migration landed on `main`.

**Architecture:** Three independent tasks. CI runs the existing checks on GitHub Actions. The demo seed (`seedAiTrip`) is recovered from a git stash and wired so `npm run db:seed` runs it too (plus a `db:seed:demo` script). The cleanup is comment-only.

**Tech Stack:** GitHub Actions, Node 22, Prisma 7, tsx, Vitest, Next.js 16.

**Branch:** `feat/post-deploy-followups` (off `main`). Do NOT touch `main`, switch branches, or deploy.

---

### Task 1: CI workflow

**Files:** Create `.github/workflows/ci.yml`

- [ ] **Step 1: Confirm each check is green locally first** (so CI won't fail on pre-existing issues)

Run each and confirm exit 0; if `npm run lint` reports pre-existing errors, STOP and report (don't add a failing step):
```bash
npm run lint
DATABASE_URL="postgresql://ci:ci@localhost:5432/ci" DIRECT_URL="postgresql://ci:ci@localhost:5432/ci" npx prisma validate
npm run test
npm run build
```

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      # The unit suite mocks the DB; build/validate never connect. Throwaway
      # connection strings just keep Prisma from choking on an empty URL.
      DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci"
      DIRECT_URL: "postgresql://ci:ci@localhost:5432/ci"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx prisma validate
      - run: npm run test
      - run: npm run build
```

- [ ] **Step 3: Verify the workflow file**

```bash
test -f .github/workflows/ci.yml && \
grep -q "npm run test" .github/workflows/ci.yml && \
grep -q "node-version: 22" .github/workflows/ci.yml && \
echo "ci workflow OK"
```
Expected: `ci workflow OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run lint, prisma validate, tests and build on push/PR

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Restore the AI EU Christmas demo seed

**Files:**
- Recover: `prisma/seed-ai-trip.ts` (from stash)
- Modify: `prisma/seed.ts` (call `seedAiTrip()`)
- Modify: `package.json` (add `db:seed:demo` script)
- Modify: `README.md` (make the `db:seed` description accurate)

> Context: `prisma/seed-ai-trip.ts` was parked in `stash@{0}` (its untracked-files commit is `stash@{0}^3`). It exports `async function seedAiTrip()` and is idempotent. `prisma/seed.ts` has a `main()` that seeds two users + a small "Europe Summer 2026" sample trip and ends with a `console.log("Seed complete: ...")`. The decision: `npm run db:seed` should seed BOTH (sample + demo).

- [ ] **Step 1: Recover the seed file from the stash**

```bash
git show "stash@{0}^3:prisma/seed-ai-trip.ts" > prisma/seed-ai-trip.ts
test -s prisma/seed-ai-trip.ts && grep -q "export async function seedAiTrip" prisma/seed-ai-trip.ts && echo "recovered OK"
```
Expected: `recovered OK`.

- [ ] **Step 2: Wire `prisma/seed.ts` to call it**

At the TOP of `prisma/seed.ts`, after the existing `import { db } from "../lib/db";` line, add:
```ts
import { seedAiTrip } from "./seed-ai-trip";
```
At the END of the `main()` function, immediately AFTER the existing `console.log("Seed complete: ...")` line and BEFORE `main()`'s closing brace, add:
```ts

  // Also seed the rich demo trip so a fresh DB sees the full feature set.
  await seedAiTrip();
```

- [ ] **Step 3: Add the `db:seed:demo` script to `package.json`**

In `"scripts"`, immediately after the `"db:seed": "tsx prisma/seed.ts",` line, add:
```jsonc
    "db:seed:demo": "tsx prisma/seed-ai-trip.ts",
```

- [ ] **Step 4: Make the README `db:seed` description accurate**

In `README.md`, the database-setup step's `npm run db:seed` comment currently describes only the sample trip. Update that comment so it reflects that `db:seed` now seeds the two users + the small sample trip + the full AI EU Christmas demo trip, and add a one-line note that `npm run db:seed:demo` re-seeds just the demo (it's idempotent). Read the relevant README region first; keep wording tight and truthful (read `seed-ai-trip.ts`'s top comment / trip name to describe it accurately).

- [ ] **Step 5: Verify it typechecks against the current schema/client**

```bash
npx tsc --noEmit
```
Expected: exit 0, no errors (this typechecks `prisma/seed-ai-trip.ts` against the current Prisma client — catches any schema drift). If there are errors IN the seed file, report them as a concern (they'd indicate the seed references a changed field).

```bash
npm run test && npm run build
```
Expected: both exit 0.

> Note: the seed cannot be RUN here (no local Postgres in this environment). Runtime validation happens when the user runs `npm run db:seed` against their docker-compose Postgres. Typecheck is the gate here.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed-ai-trip.ts prisma/seed.ts package.json README.md
git commit -m "feat(seed): restore the AI EU Christmas demo trip seed

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Clean up stale "SQLite" comments (comment-only)

**Files:** Modify source comments only — likely `server/actions/invites.ts`, `lib/enums.ts`, `lib/categories.ts`, `lib/validations/cost.ts`, and a few `*.test.ts` headers.

> Context: The codebase moved to Postgres everywhere, but several comments still explain decisions "because SQLite ...". These are now inaccurate. This task updates ONLY comments — no code/behavior changes.

- [ ] **Step 1: Find stale references**

```bash
grep -rni "sqlite" server lib app --include=*.ts --include=*.tsx
```
(Ignore any hit inside `prisma/migrations`, `docs/`, and plan files — those aren't in this grep scope anyway.)

- [ ] **Step 2: Update each comment**

For each hit, update the COMMENT so it no longer implies SQLite is the datasource. Guidance:
- If a comment gives a SQLite-specific *rationale* for a still-correct design (e.g. "stored as String of JSON because SQLite has no Json type", "matched in app code because SQLite lacks `mode: insensitive`"), reframe it as the portability/design choice it now is (e.g. "stored as String of JSON to keep the schema portable", "case-insensitive match done in app code") — keep it truthful and do NOT change the code it describes.
- If a comment is purely "SQLite" as a label for the dev DB, change it to "Postgres".
- Leave any comment that is still accurate.

Make NO logic changes — comments/strings-in-comments only.

- [ ] **Step 3: Verify nothing behavioural changed and the suite is green**

```bash
git diff --stat        # should only touch comments
npm run test && npm run build
```
Expected: tests + build exit 0. Confirm via `git diff` that only comment lines changed (no code).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs(comments): retire stale SQLite rationale comments

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** CI (Task 1), demo seed restore + wiring + `db:seed:demo` + README (Task 2), stale-comment cleanup (Task 3). The concurrency-reorder fix is intentionally OUT of scope (both reorders are already atomic; the residual race is low-severity for a 2-user app — recorded here as a deliberate non-goal).
- **Placeholders:** none — CI yaml and the seed wiring are given in full; cleanup is bounded by a grep + comment-only rule.
- **Risk notes:** the demo seed can't be run without a DB here; typecheck (`tsc --noEmit`) is the gate and the user validates at runtime locally. CI Task 1 verifies each check locally before committing so the workflow is green on first run.
