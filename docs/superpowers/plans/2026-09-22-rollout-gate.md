# Rollout Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 15 architecture-sitrep findings that block opening TEEPEE to 10–15 independent Travellers, on one branch, deployable in a single push to `main`.

**Architecture:** TEEPEE is a Next.js 15 App Router app with server actions, Prisma/Postgres (Neon), and R2 blob storage. The fixes fall into four groups: scope-mismatched authorisation (a guard authorises one thing, the code writes another), one-household assumptions that break with independent Travellers, an absent error sink, and two consolidation refactors that make the first group verifiable. One new migration carries every schema change.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma, Postgres, Auth.js (NextAuth v5), Vitest, Tailwind, shadcn/ui, `web-push`, AWS S3 SDK against Cloudflare R2.

## Global Constraints

- **Branch:** all work lands on `feat/rollout-gate`. Never commit to `main`. Never deploy. Merging and deploying are the operator's call alone.
- **One commit per finding id.** Commit subject must name the finding, e.g. `fix(ten-1): validate restore payload rows belong to the authorised Trip`.
- **Read `CONTEXT.md` before touching anything.** It is the vocabulary contract. Never introduce a term its *Avoid* list forbids. "Traveller", "Trip", "Stop", "Globe", "Fork", "Plan" are the domain nouns; "Member" must not reach Traveller-facing or assistive-tech copy.
- **TDD, every task:** a test that fails before and passes after. No exceptions.
- **The suite mocks `@/lib/db` and pins `TZ=UTC`.** No test touches a real database. Authorisation fixes are pinned by mocking `db` to return a row whose `tripId` differs from the authorised one and asserting refusal.
- **No Postgres, no browser in this sandbox.** Anything needing one is reported as **manual verify (needs DB)** with exact steps. Never claim it verified.
- **Baseline to restore before reporting done:** `npm run test` (3999 passing, 313 files), `npx tsc --noEmit` clean, `npm run lint` clean.
- **Exactly one new migration** for the whole branch: `prisma/migrations/20260922000000_rollout_gate/migration.sql`, hand-written (there is no local Postgres; `prisma migrate dev` cannot run). It must carry a `docs/DEPLOY.md` §4b header analysing the write path.
- **Deploy model:** `vercel.json` runs `prisma migrate deploy && next build` on push to `main`. Migrations apply automatically.

---

## File Structure

**New files**
- `lib/allowlist.ts` — `isAllowedEmail(email)`: the single sign-in predicate, env var OR `AllowedEmail` row.
- `lib/blob-retention.ts` — `scheduleBlobDeletion(keys)`: records blobs for later sweep instead of destroying them now.
- `lib/error-sink.ts` — `reportError(...)`: writes an `ErrorReport` row, dedupes by signature, pushes on first occurrence.
- `server/actions/access-requests.ts` — `approveAccessRequest`, `dismissAccessRequest`, `listAccessRequests`.
- `server/actions/error-reports.ts` — `listErrorReports`, `clearErrorReport`.
- `app/api/client-error/route.ts` — POST endpoint the client error boundaries report to.
- `app/(app)/admin/page.tsx`, `app/(app)/admin/access-requests.tsx`, `app/(app)/admin/error-reports.tsx` — the admin route.
- `app/privacy/page.tsx`, `app/terms/page.tsx` — public, unauthenticated.
- `scripts/sweep-deleted-blobs.ts` — dry-run-by-default blob sweep.
- `docs/adr/0057-*.md`, `0058-*.md`, `0059-*.md` — the door, per-Traveller Journal, self-hosted error sink.
- `docs/rollout-gate-manual-verify.md` — the needs-DB checklist handed to the operator.
- `prisma/migrations/20260922000000_rollout_gate/migration.sql`.

**Modified**
- `lib/guards.ts` — add `requireTripOwner`, `requireAdmin`.
- `lib/auth.ts` — add the `signIn` callback.
- `lib/invites.ts`, `lib/globe-invites.ts` — expiry filtering.
- `prisma/schema.prisma` — `AllowedEmail`, `AccessRequest`, `ErrorReport`, `DeletedBlob`, `Invite.expiresAt`, `GlobeInvite.expiresAt`, `JournalEntry` unique key.
- `server/actions/stops.ts`, `activity.ts`, `journal.ts`, `globe.ts`, `trips.ts`, `forks.ts`, `attachments.ts`, `cover.ts`, `target-cleanup.ts`.
- `app/api/calendar/[token]/route.ts`, `app/signin/page.tsx`, `app/(app)/error.tsx`, `app/global-error.tsx`, `app/(app)/trips/[tripId]/error.tsx`.
- `docs/DEPLOY.md`, `CONTEXT.md`, `docs/adr/0017-*.md`, `docs/adr/0052-*.md`.

---

### Task 1: `ARCH-BND-3` — one named owner/admin guard

Three sites hand-roll `membership.role !== "owner" && !isAdminEmail(user.email)`. Tasks 9, 10 and 15 all need this predicate; extracting it first means they consume it rather than adding a fourth and fifth copy.

**Files:**
- Modify: `lib/guards.ts`
- Modify: `server/actions/trips.ts:258`, `server/actions/trips.ts:322`, `server/actions/invites.ts:49`
- Test: `lib/guards.test.ts`

**Interfaces:**
- Produces: `requireTripOwner(tripId: string): Promise<{ user, membership }>` — throws `notFound()` for non-members (delegating to `requireTripAccess`), returns normally only for `role === "owner"` or an `ADMIN_EMAILS` operator.
- Produces: `requireAdmin(): Promise<SessionUser>` — `requireUser()` then `isAdminEmail`; `notFound()` otherwise.
- Consumed by: Tasks 9, 10, 15.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/guards.test.ts — add to the existing file
describe("requireTripOwner", () => {
  it("returns for the trip owner", async () => {
    mockSession({ id: "u1", email: "owner@example.com" });
    dbMock.tripMember.findMany.mockResolvedValue([{ userId: "u1", role: "owner", lastReadActivityAt: null }]);
    await expect(requireTripOwner("t1")).resolves.toMatchObject({ membership: { role: "owner" } });
  });

  it("notFound()s for a plain member", async () => {
    mockSession({ id: "u2", email: "member@example.com" });
    dbMock.tripMember.findMany.mockResolvedValue([{ userId: "u2", role: "member", lastReadActivityAt: null }]);
    await expect(requireTripOwner("t1")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("returns for an ADMIN_EMAILS operator who is a member but not owner", async () => {
    process.env.ADMIN_EMAILS = "ops@example.com";
    mockSession({ id: "u3", email: "ops@example.com" });
    dbMock.tripMember.findMany.mockResolvedValue([{ userId: "u3", role: "member", lastReadActivityAt: null }]);
    await expect(requireTripOwner("t1")).resolves.toBeTruthy();
  });
});
```

Mirror the existing mocking style already used in `lib/guards.test.ts`; do not invent a new harness.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run lib/guards.test.ts`
Expected: FAIL — `requireTripOwner is not a function`.

- [ ] **Step 3: Implement the guards**

```ts
// lib/guards.ts
import { isAdminEmail } from "@/lib/admin";

/**
 * Require that the current user OWNS `tripId` (or is an ADMIN_EMAILS operator
 * who is already a member — ADR 0045 grants no access to trips they aren't on).
 *
 * Extracted from three hand-rolled copies (ARCH-BND-3). Non-members get the
 * same notFound() as requireTripAccess, so this never leaks a trip's existence.
 */
export async function requireTripOwner(tripId: string) {
  const { user, membership } = await requireTripAccess(tripId);
  if (membership.role !== "owner" && !isAdminEmail(user.email)) {
    notFound();
  }
  return { user, membership };
}

/** Require an ADMIN_EMAILS operator. notFound() for everyone else. */
export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  return user;
}
```

- [ ] **Step 4: Replace the three copies**

At `trips.ts:258`, `trips.ts:322` and `invites.ts:49`, the existing code returns a *typed error result* rather than throwing (e.g. `{ success: false, error: "Only the trip owner can duplicate the trip." }`). **Preserve that behaviour** — do not swap a friendly message for a 404. Extract the predicate only:

```ts
// lib/guards.ts — also export the pure predicate
export function isTripOwnerOrAdmin(
  membership: { role: string },
  email: string | null | undefined,
): boolean {
  return membership.role === "owner" || isAdminEmail(email);
}
```

Then each call site becomes `if (!isTripOwnerOrAdmin(membership, user.email)) return { success: false, error: "…" };` with its original message unchanged.

- [ ] **Step 5: Run the full suite**

Run: `npm run test`
Expected: PASS, 3999 tests. Any failure here is a behaviour change you introduced — fix it, don't update the assertion.

- [ ] **Step 6: Commit**

```bash
git add lib/guards.ts lib/guards.test.ts server/actions/trips.ts server/actions/invites.ts
git commit -m "refactor(bnd-3): extract owner-or-admin into one named guard"
```

---

### Task 2: The migration

Every schema change for the branch, in one file. Nothing else in this task.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260922000000_rollout_gate/migration.sql`

**Interfaces:**
- Produces: models `AllowedEmail`, `AccessRequest`, `ErrorReport`, `DeletedBlob`; fields `Invite.expiresAt`, `GlobeInvite.expiresAt`; `JournalEntry` unique key `[tripId, date, authorId]`.
- Consumed by: Tasks 6, 9, 12, 13, 14, 15, 16, 18.

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

```prisma
/// An email permitted to sign in. Read together with the ALLOWED_EMAILS env
/// var by lib/allowlist.ts — the env var is bootstrap and break-glass, this
/// table is everyone admitted through the product (ADR 0057).
model AllowedEmail {
  id         String   @id @default(cuid())
  email      String   @unique
  addedById  String?
  note       String?
  createdAt  DateTime @default(now())
}

/// A person without an account asking for one. Distinct from Invite, which is
/// Trip-scoped and owner-only (ADRs 0017, 0052). Written by the signIn
/// callback from Google's verified profile at the moment of rejection.
model AccessRequest {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  image         String?
  status        String   @default("pending") // "pending" | "dismissed"
  resolvedAt    DateTime?
  createdAt     DateTime @default(now())
  lastAttemptAt DateTime @default(now())
  attempts      Int      @default(1)

  @@index([status])
}

/// A captured application failure. Deduped by `signature` so a loop logs one
/// row with a count, not ten thousand rows (ADR 0059).
model ErrorReport {
  id        String   @id @default(cuid())
  signature String   @unique
  message   String
  stack     String?
  route     String?
  source    String   @default("server") // "server" | "client"
  userId    String?
  count     Int      @default(1)
  firstSeen DateTime @default(now())
  lastSeen  DateTime @default(now())

  @@index([lastSeen])
}

/// A storage blob whose owning row is gone but which is retained so a database
/// restore can still find its file. Swept after 35 days — deliberately longer
/// than db-backup.yml's 30-day dump retention (ARCH-DAT-3).
model DeletedBlob {
  id         String   @id @default(cuid())
  storageKey String   @unique
  deletedAt  DateTime @default(now())

  @@index([deletedAt])
}
```

Add `expiresAt DateTime?` to both `Invite` and `GlobeInvite`. Change `JournalEntry`'s `@@unique([tripId, date])` to `@@unique([tripId, date, authorId])`.

- [ ] **Step 2: Write the migration SQL**

```sql
-- ROLLOUT GATE — read docs/DEPLOY.md §4b before deploying this.
--
-- WRITE-PATH ANALYSIS (§4b requires this for every migration):
--
-- 1. AllowedEmail / AccessRequest / ErrorReport / DeletedBlob are NEW tables.
--    The currently-deployed build never reads or writes them. No hazard.
--
-- 2. Invite.expiresAt / GlobeInvite.expiresAt are NULLABLE additive columns.
--    The old build's INSERTs omit them; NULL is legal. No hazard.
--
-- 3. JournalEntry's unique key changes from (tripId, date) to
--    (tripId, date, authorId). THIS IS A WRITE-PATH CHANGE AND IT DOES OPEN
--    THE §4b WINDOW — it is the exact shape documented at DEPLOY.md:131. The
--    deployed build's saveJournalEntry compiles to
--    INSERT ... ON CONFLICT (tripId, date), which requires the index we drop
--    here. For the length of the Vercel build, journal saves on the OLD build
--    will fail. An empty table does not help: the failure is a missing
--    ON CONFLICT target, not a row collision.
--
--    DEPLOY.md:140 prescribes two deploys for this shape. We are deliberately
--    taking ONE, decided 2026-09-22. Justification: this branch ships BEFORE
--    TEEPEE opens to additional Travellers, so the only people who can be
--    mid-save are the operator and one co-Traveller, and the operator chooses
--    the moment. MITIGATION: deploy at a quiet moment, watch the build to
--    completion, and do not write a Journal entry while it runs.
--
-- 4. AllowedEmail is BACKFILLED from existing Users. Without this, the instant
--    the signIn callback ships nobody can sign in — including the operator —
--    unless ALLOWED_EMAILS was set first. Everyone who already holds an
--    account is by definition already admitted; the allowlist must reflect
--    that at the moment it starts being enforced rather than start empty.
--
-- 5. Invite.expiresAt is backfilled to NOW() + 30 days, NOT createdAt + 30.
--    Backfilling from createdAt would mark every pending Invite older than 30
--    days as already expired at the instant of deploy, silently revoking a
--    live invitation someone is still waiting on.

-- CreateTable
CREATE TABLE "AllowedEmail" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "addedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AllowedEmail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AllowedEmail_email_key" ON "AllowedEmail"("email");

CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccessRequest_email_key" ON "AccessRequest"("email");
CREATE INDEX "AccessRequest_status_idx" ON "AccessRequest"("status");

CREATE TABLE "ErrorReport" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "route" TEXT,
    "source" TEXT NOT NULL DEFAULT 'server',
    "userId" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErrorReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErrorReport_signature_key" ON "ErrorReport"("signature");
CREATE INDEX "ErrorReport_lastSeen_idx" ON "ErrorReport"("lastSeen");

CREATE TABLE "DeletedBlob" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeletedBlob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeletedBlob_storageKey_key" ON "DeletedBlob"("storageKey");
CREATE INDEX "DeletedBlob_deletedAt_idx" ON "DeletedBlob"("deletedAt");

-- AlterTable (additive, nullable — no hazard)
ALTER TABLE "Invite" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "GlobeInvite" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Backfill: every existing account is already admitted.
INSERT INTO "AllowedEmail" ("id", "email", "note", "createdAt")
SELECT gen_random_uuid()::text, LOWER("email"), 'backfilled at rollout-gate migration', NOW()
FROM "User"
WHERE "email" IS NOT NULL
ON CONFLICT ("email") DO NOTHING;

-- Backfill: a fresh 30 days from DEPLOY, never from createdAt.
UPDATE "Invite" SET "expiresAt" = NOW() + INTERVAL '30 days' WHERE "acceptedAt" IS NULL;
UPDATE "GlobeInvite" SET "expiresAt" = NOW() + INTERVAL '30 days' WHERE "acceptedAt" IS NULL;

-- Journal becomes per-Traveller. SEE ANALYSIS NOTE 3 — this is the §4b window.
DROP INDEX "JournalEntry_tripId_date_key";
CREATE UNIQUE INDEX "JournalEntry_tripId_date_authorId_key"
    ON "JournalEntry"("tripId", "date", "authorId");
```

- [ ] **Step 3: Verify the schema and client generate**

Run: `npx prisma validate && npx prisma generate && npx tsc --noEmit`
Expected: schema valid, client generated, TypeScript clean. (`prisma migrate` cannot run — no Postgres. That is expected.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260922000000_rollout_gate
git commit -m "feat(migration): rollout-gate schema — allowlist, access requests, error sink, blob retention, invite expiry, per-Traveller journal"
```

---

### Task 3: `ARCH-TEN-1` (P0) — `restoreStops` writes unauthorised rows

`stops.ts:1285-1297` resolves the Trip from the *Stops* and authorises it, then `:1326-1337` updates `payload.items` and `payload.accommodations` **by id alone**. An authenticated Traveller can rewrite another tenancy's Item dates and Accommodation check-in/check-out. This is the one place in the codebase where that is possible.

**Files:**
- Modify: `server/actions/stops.ts:1305-1341`
- Test: `server/actions/stops.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("ARCH-TEN-1: refuses a payload whose Items belong to another Trip", async () => {
  dbMock.stop.findMany.mockResolvedValue([{ id: "s1", tripId: "trip-A", forkId: null }]);
  mockMembership("trip-A", "owner");
  // The attacker names an Item that lives on trip-B.
  dbMock.item.findMany.mockResolvedValue([{ id: "i-foreign", tripId: "trip-B" }]);

  const result = await restoreStops(
    [{ id: "s1", sortOrder: 0, chapterId: null, arriveDate: null, departDate: null }],
    null,
    { items: [{ id: "i-foreign", date: "2026-01-01" }], accommodations: [] },
  );

  expect(result.success).toBe(false);
  expect(dbMock.$transaction).not.toHaveBeenCalled();
});

it("ARCH-TEN-1: refuses a payload whose Accommodations belong to another Trip", async () => {
  dbMock.stop.findMany.mockResolvedValue([{ id: "s1", tripId: "trip-A", forkId: null }]);
  mockMembership("trip-A", "owner");
  dbMock.item.findMany.mockResolvedValue([]);
  dbMock.accommodation.findMany.mockResolvedValue([{ id: "a-foreign", stop: { tripId: "trip-B" } }]);

  const result = await restoreStops(
    [{ id: "s1", sortOrder: 0, chapterId: null, arriveDate: null, departDate: null }],
    null,
    { items: [], accommodations: [{ id: "a-foreign", checkIn: "2026-01-01", checkOut: "2026-01-02" }] },
  );

  expect(result.success).toBe(false);
  expect(dbMock.$transaction).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run server/actions/stops.test.ts -t "ARCH-TEN-1"`
Expected: FAIL — currently returns `{ success: true }` and runs the transaction.

- [ ] **Step 3: Implement the check**

Insert immediately after `await requireTripAccess(tripId);` (`stops.ts:1297`), **before** the `$transaction`:

```ts
  // ARCH-TEN-1: the guard above authorised the Stops' Trip. The payload names
  // Items and Accommodations by id only, so without this every authenticated
  // Traveller could rewrite another tenancy's rows. Verify ownership BEFORE
  // the transaction so nothing partial is written.
  const payloadItemIds = (payload?.items ?? []).map((i) => i.id);
  if (payloadItemIds.length > 0) {
    const owned = await db.item.findMany({
      where: { id: { in: payloadItemIds } },
      select: { id: true, tripId: true },
    });
    if (owned.length !== payloadItemIds.length || owned.some((i) => i.tripId !== tripId)) {
      return { success: false, errors: { id: ["Restore payload names items from another trip."] } };
    }
  }

  const payloadAccIds = (payload?.accommodations ?? []).map((a) => a.id);
  if (payloadAccIds.length > 0) {
    // Accommodation has no tripId column — it hangs off a Stop.
    const owned = await db.accommodation.findMany({
      where: { id: { in: payloadAccIds } },
      select: { id: true, stop: { select: { tripId: true } } },
    });
    if (owned.length !== payloadAccIds.length || owned.some((a) => a.stop?.tripId !== tripId)) {
      return { success: false, errors: { id: ["Restore payload names accommodations from another trip."] } };
    }
  }
```

**Confirm the Accommodation→Stop relation field name against `prisma/schema.prisma` before writing this** — if `Accommodation` carries `tripId` directly, select that instead and drop the nested select.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/actions/stops.test.ts`
Expected: PASS, including every pre-existing restore test.

- [ ] **Step 5: Commit**

```bash
git add server/actions/stops.ts server/actions/stops.test.ts
git commit -m "fix(ten-1): validate restoreStops payload rows belong to the authorised Trip"
```

---

### Task 4: `ARCH-TEN-2` — `recordActivity` forges rows into any Trip

`activity.ts:14-32` is a published server action guarded by `requireUser()` alone, inside a `catch {}` that swallows everything. Any authenticated Traveller can POST a forged Activity row into any Trip id they name, and the silent catch means neither they nor you learn it failed.

**Files:**
- Modify: `server/actions/activity.ts:14-32`
- Test: `server/actions/activity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("ARCH-TEN-2: does not write an Activity row for a Trip the caller is not a member of", async () => {
  mockSession({ id: "u1", email: "outsider@example.com" });
  dbMock.tripMember.findMany.mockResolvedValue([]); // not a member of trip-B

  await recordActivity({
    tripId: "trip-B",
    verb: "CREATED",
    entityType: "STOP",
    entityLabel: "Forged",
  });

  expect(dbMock.activity.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run server/actions/activity.test.ts -t "ARCH-TEN-2"`
Expected: FAIL — `activity.create` is called.

- [ ] **Step 3: Swap the guard**

Replace `const user = await requireUser();` with `const { user } = await requireTripAccess(input.tripId);` and import `requireTripAccess` from `@/lib/guards`.

Leave the `catch {}` in place — `recordActivity` is called from inside other mutations and must never break its caller. Note in a comment that the swallow is deliberate and that `ARCH-OBS-3` (making it observable) is **out of scope for this branch**, deferred with the other 24 findings.

`requireTripAccess` calls `notFound()` for non-members, which throws; the existing catch absorbs it, so a forged call becomes a silent no-op rather than a silent write. That is the correct outcome.

- [ ] **Step 4: Run the suite**

Run: `npm run test`
Expected: PASS. Several call sites pass a `tripId` — if any test mocks a session without membership, it will now correctly stop writing; update those mocks to grant membership, since the *fixture* was wrong, not the assertion.

- [ ] **Step 5: Commit**

```bash
git add server/actions/activity.ts server/actions/activity.test.ts
git commit -m "fix(ten-2): require Trip membership before writing an Activity row"
```

---

### Task 5: `ARCH-TEN-7` — the Calendar feed leaks confirmations and private notes

`app/api/calendar/[token]/route.ts:33` selects `address, link, booking, notes`; `:48-49` selects `confirmation, notes`. Meanwhile `server/actions/share.ts:14` states the Share link's floor: *"Money, notes, confirmations and booking refs are never shared on any link."* A feed URL is bearer auth — Google and Apple fetch it unauthenticated — so the only lever is the file's contents.

**Files:**
- Modify: `app/api/calendar/[token]/route.ts`
- Test: `app/api/calendar/[token]/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("ARCH-TEN-7: never emits confirmations, booking refs or notes", async () => {
  mockFeedWithItems({
    accommodation: { confirmation: "ABC-123", notes: "door code 4821" },
    transport: { booking: "BA2490-XYZ", notes: "seat 14C, paid by Cam" },
  });

  const res = await GET(request, { params: { token: "tok" } });
  const ics = await res.text();

  expect(ics).not.toContain("ABC-123");
  expect(ics).not.toContain("door code 4821");
  expect(ics).not.toContain("BA2490-XYZ");
  expect(ics).not.toContain("paid by Cam");
  // Still a useful calendar:
  expect(ics).toContain("BEGIN:VEVENT");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run app/api/calendar`
Expected: FAIL — the strings appear in the `DESCRIPTION` field.

- [ ] **Step 3: Drop the fields from the query**

Remove `booking`, `notes` and `confirmation` from both `select` blocks (`:33`, `:48-49`), and remove every use of them from the VEVENT builder. Keep `address` — a location is what a calendar is *for*, it appears on the Share link, and it is not on the forbidden list.

Add a comment naming the rule:

```ts
// ARCH-TEN-7: a feed URL is bearer auth — calendar clients fetch it
// unauthenticated and the URL travels wherever a subscribed calendar is
// shared. It therefore inherits the Share link's floor (server/actions/share.ts:14):
// money, notes, confirmations and booking refs are never emitted. The
// confirmation lives in the app, offline, behind the Traveller's account.
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run app/api/calendar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/calendar server/actions/calendar-feed.ts
git commit -m "fix(ten-7): calendar feed inherits the Share link's field floor"
```

---

### Task 6: `ARCH-DAT-6` (P0) — Journal becomes per-Traveller

One row per Trip-day, `body` overwritten wholesale, `authorId` reassigned to whoever saved last (`journal.ts:59-69`), and an empty body silently `deleteMany`s (`:51-52`). Task 2 already changed the unique key; this task changes the code and UI.

**Files:**
- Modify: `server/actions/journal.ts`
- Modify: the Journal editor component and the day page's journal rendering (locate with `grep -rln "saveJournalEntry" app components`)
- Test: `server/actions/journal.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("ARCH-DAT-6: two Travellers writing the same day keep both entries", async () => {
  mockMembership("t1", "member", { id: "u1" });
  await saveJournalEntry("t1", "2026-12-06", "Cam's account of the day");
  expect(dbMock.journalEntry.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { tripId_date_authorId: { tripId: "t1", date: "2026-12-06", authorId: "u1" } },
    }),
  );
});

it("ARCH-DAT-6: an empty body no longer deletes", async () => {
  mockMembership("t1", "member", { id: "u1" });
  const result = await saveJournalEntry("t1", "2026-12-06", "   ");
  expect(dbMock.journalEntry.deleteMany).not.toHaveBeenCalled();
  expect(result.success).toBe(true);
});

it("ARCH-DAT-6: deleteJournalEntry only removes the caller's own entry", async () => {
  mockMembership("t1", "member", { id: "u1" });
  await deleteJournalEntry("t1", "2026-12-06");
  expect(dbMock.journalEntry.deleteMany).toHaveBeenCalledWith({
    where: { tripId: "t1", date: "2026-12-06", authorId: "u1" },
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run server/actions/journal.test.ts`
Expected: FAIL on all three.

- [ ] **Step 3: Rewrite the actions**

- `saveJournalEntry`: upsert on `tripId_date_authorId` with `authorId: user.id`. An empty trimmed body is a **no-op returning `{ success: true }`** — it is no longer a delete verb. Do not silently create an empty row.
- `deleteJournalEntry`: scope `deleteMany` to `authorId: user.id`. A Traveller removes their own entry; nobody removes anyone else's.

- [ ] **Step 4: Update the UI**

The day page must render **all** entries for the date, each attributed to its author, with the current Traveller's own entry editable and others read-only. Removing your entry becomes an explicit, confirmed action — reuse the existing confirm-dialog component rather than inventing one. Use "Traveller" language, never "Member" (`CONTEXT.md`).

- [ ] **Step 5: Run the suite**

Run: `npm run test && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add server/actions/journal.ts server/actions/journal.test.ts app components
git commit -m "fix(dat-6): Journal entries become per-Traveller; blanking no longer deletes"
```

---

### Task 7: `ARCH-TEN-4` — any Globe member can invite anyone

`globe.ts:109-125` calls `requireGlobeAccess()`, which admits **any member**. A Globe is a Traveller's entire saved-places history. **This must land before Task 13** — the sign-in callback's Invite rule is only safe because Globe Invites are excluded, and that exclusion is easier to defend when the creation gate is also correct.

**Files:**
- Modify: `server/actions/globe.ts:109-125`, `lib/globe.ts`
- Test: `server/actions/globe.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("ARCH-TEN-4: a plain Globe member cannot invite", async () => {
  mockGlobeMembership({ globeId: "g1", userId: "u2", role: "member" });
  const result = await inviteToGlobe("stranger@example.com");
  expect(result.success).toBe(false);
  expect(dbMock.globeInvite.create).not.toHaveBeenCalled();
});

it("ARCH-TEN-4: the Globe owner can invite", async () => {
  mockGlobeMembership({ globeId: "g1", userId: "u1", role: "owner" });
  const result = await inviteToGlobe("friend@example.com");
  expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run server/actions/globe.test.ts -t "ARCH-TEN-4"`
Expected: FAIL — a member currently succeeds.

- [ ] **Step 3: Add the owner gate**

Add `requireGlobeOwner()` to `lib/globe.ts`, mirroring `requireGlobeAccess` but additionally requiring `role === "owner"` (or `isAdminEmail`). Use it in `inviteToGlobe`. Return a typed failure result with a clear message — `{ success: false, error: "Only the Globe owner can invite people." }` — rather than `notFound()`, matching how `inviteToTrip` reports the same refusal.

Set `expiresAt` on creation: `new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)`.

- [ ] **Step 4: Run and commit**

Run: `npm run test`

```bash
git add server/actions/globe.ts lib/globe.ts server/actions/globe.test.ts
git commit -m "fix(ten-4): Globe invites become owner-only"
```

---

### Task 8: `ARCH-ADR-3` — a Globe invite to someone who already has a Globe dead-ends silently

`lib/globe-invites.ts` runs `decideGlobeMembership`, which returns nothing when the invitee already belongs to a Globe (a Traveller belongs to at most one — ADR 0023). The inviter is told "Invited"; nothing ever happens. Common once Travellers are independent.

**Files:**
- Modify: `server/actions/globe.ts` (`inviteToGlobe`), `lib/globe-invites.ts`
- Test: `server/actions/globe.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("ARCH-ADR-3: reports the real outcome when the invitee already has a Globe", async () => {
  mockGlobeMembership({ globeId: "g1", userId: "u1", role: "owner" });
  dbMock.user.findUnique.mockResolvedValue({ id: "u9", email: "taken@example.com" });
  dbMock.globeMember.findUnique.mockResolvedValue({ globeId: "g-other", userId: "u9" });

  const result = await inviteToGlobe("taken@example.com");

  expect(result.success).toBe(false);
  expect(result.error).toMatch(/already has a Globe/i);
  expect(dbMock.globeInvite.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run server/actions/globe.test.ts -t "ARCH-ADR-3"`
Expected: FAIL — currently `{ success: true }`.

- [ ] **Step 3: Check before creating**

In `inviteToGlobe`, after validating the email: look up a `User` with that email; if found, check `getUserGlobe(user.id)`. If they already belong to a Globe, return a failure naming the real reason. A Traveller with no account yet cannot be checked — that path is unchanged and still creates a pending Invite.

Do **not** change `decideGlobeMembership`'s acceptance behaviour; this is about reporting at *creation* time.

- [ ] **Step 4: Run and commit**

Run: `npm run test`

```bash
git add server/actions/globe.ts lib/globe-invites.ts server/actions/globe.test.ts
git commit -m "fix(adr-3): a Globe invite to someone who already has a Globe reports the real outcome"
```

---

### Task 9: `ARCH-DAT-1a` — Travellers can be removed, and can leave

No `removeTripMember` exists anywhere. Removal drops the `TripMember` row only — authored Journal entries, notes and attachments keep valid `authorId` FKs, so nothing orphans.

**READ THIS FIRST:** `lib/guards.ts`'s `requireTripAccess` is `cache()`-memoised, and its own comment warns that an action which *mutates membership* and then re-checks access in the same request reads the **stale** answer — and still succeeds. These are the codebase's first such callers. Do any authorisation check **before** the mutation, and never re-check via `requireTripAccess` afterwards in the same request.

**Files:**
- Modify: `server/actions/trips.ts`
- Modify: the Trip settings page (`app/(app)/trips/[tripId]/settings/page.tsx`) and its members UI
- Test: `server/actions/trips.test.ts`

**Interfaces:**
- Produces: `removeTripMember(tripId: string, userId: string): Promise<ActionResult>`, `leaveTrip(tripId: string): Promise<ActionResult>`

- [ ] **Step 1: Write the failing tests**

```ts
it("ARCH-DAT-1: the owner can remove a Traveller", async () => {
  mockMembership("t1", "owner", { id: "u1" });
  const result = await removeTripMember("t1", "u2");
  expect(result.success).toBe(true);
  expect(dbMock.tripMember.deleteMany).toHaveBeenCalledWith({ where: { tripId: "t1", userId: "u2" } });
});

it("ARCH-DAT-1: a plain Traveller cannot remove anyone else", async () => {
  mockMembership("t1", "member", { id: "u2" });
  const result = await removeTripMember("t1", "u3");
  expect(result.success).toBe(false);
  expect(dbMock.tripMember.deleteMany).not.toHaveBeenCalled();
});

it("ARCH-DAT-1: the owner cannot remove themselves", async () => {
  mockMembership("t1", "owner", { id: "u1" });
  const result = await removeTripMember("t1", "u1");
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/transfer/i);
});

it("ARCH-DAT-1: a Traveller can leave", async () => {
  mockMembership("t1", "member", { id: "u2" });
  const result = await leaveTrip("t1");
  expect(result.success).toBe(true);
});

it("ARCH-DAT-1: the owner cannot leave without transferring ownership", async () => {
  mockMembership("t1", "owner", { id: "u1" });
  const result = await leaveTrip("t1");
  expect(result.success).toBe(false);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run server/actions/trips.test.ts -t "ARCH-DAT-1"`
Expected: FAIL — neither function exists.

- [ ] **Step 3: Implement both actions**

Use `isTripOwnerOrAdmin` from Task 1. Both actions also delete any pending `Invite` for that Traveller's email on that Trip, so a removed Traveller isn't immediately re-admitted by a stale Invite (this matters now that Task 13 treats a pending Invite as an account grant). `revalidatePath` the Trip's settings and home.

- [ ] **Step 4: Add the UI**

Trip settings gains a Travellers list: each row shows the Traveller and, for the owner, a Remove control behind a confirmation. Every Traveller sees a Leave trip control except the owner, who sees an explanation that ownership must be transferred first. Copy uses "Traveller", not "Member".

- [ ] **Step 5: Run and commit**

Run: `npm run test && npx tsc --noEmit`

```bash
git add server/actions/trips.ts server/actions/trips.test.ts "app/(app)/trips/[tripId]/settings"
git commit -m "feat(dat-1): Travellers can be removed by the owner and can leave a Trip"
```

---

### Task 10: `ARCH-DAT-1b` — whole-branch destruction becomes owner-only

`deleteStop` (`stops.ts:492`, via `requireStopAccess`) and `promoteFork` (`forks.ts:739`, via `requireForkAccess`) are member-accessible and irreversible. `deleteTrip` and `duplicateTrip` are already owner-or-admin. Everyday Item/Cost/Note editing stays open to every Traveller — this restricts only whole-branch destruction.

**Files:**
- Modify: `server/actions/stops.ts` (`deleteStop`), `server/actions/forks.ts` (`promoteFork`)
- Test: `server/actions/stops.test.ts`, `server/actions/forks.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("ARCH-DAT-1: a plain Traveller cannot delete a Stop", async () => {
  mockStopAccess("s1", { tripId: "t1", forkId: null });
  mockMembership("t1", "member", { id: "u2" });
  const result = await deleteStop("s1");
  expect(result.success).toBe(false);
  expect(dbMock.$transaction).not.toHaveBeenCalled();
});

it("ARCH-DAT-1: a plain Traveller cannot promote a Fork", async () => {
  mockForkAccess("f1", { tripId: "t1" });
  mockMembership("t1", "member", { id: "u2" });
  const result = await promoteFork("f1");
  expect(result.success).toBe(false);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run server/actions/stops.test.ts server/actions/forks.test.ts -t "ARCH-DAT-1"`
Expected: FAIL.

- [ ] **Step 3: Gate both**

After the existing access check resolves the `tripId`, use `isTripOwnerOrAdmin` and return a typed failure with a clear message. Do not use `notFound()` — the Traveller legitimately sees this Trip; they simply may not destroy this branch of it.

- [ ] **Step 4: Hide the controls**

The delete-Stop and promote-Fork controls must not render for non-owners. Hiding is cosmetic; the server gate above is the access control.

- [ ] **Step 5: Run and commit**

Run: `npm run test`

```bash
git add server/actions/stops.ts server/actions/forks.ts server/actions components app
git commit -m "feat(dat-1): whole-branch destruction (delete Stop, promote Fork) becomes owner-only"
```

---

### Task 11: `ARCH-ADR-1` — duplicating a Trip re-grants everyone's membership

`trips.ts:358-362` copies every co-Traveller's `TripMember` row onto the duplicate with no consent. ADR 0017 established that membership requires acceptance; duplication currently bypasses it.

**Files:**
- Modify: `server/actions/trips.ts:355-365`, `lib/duplicate-trip.ts` if the member copy lives there
- Test: `server/actions/trips.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("ARCH-ADR-1: duplicating carries co-Travellers as pending Invites, not memberships", async () => {
  mockMembership("src", "owner", { id: "u1", email: "owner@example.com" });
  dbMock.trip.findUnique.mockResolvedValue({
    id: "src",
    members: [
      { userId: "u1", role: "owner" },
      { userId: "u2", role: "member" },
    ],
  });
  dbMock.user.findMany.mockResolvedValue([{ id: "u2", email: "co@example.com" }]);

  await duplicateTrip("src", { name: "Copy" });

  // Only the duplicator is a member of the copy.
  const memberCreates = dbMock.tripMember.create.mock.calls.map((c) => c[0].data.userId);
  expect(memberCreates).toEqual(["u1"]);
  // The co-Traveller gets a pending Invite instead.
  expect(dbMock.invite.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ email: "co@example.com" }) }),
  );
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run server/actions/trips.test.ts -t "ARCH-ADR-1"`
Expected: FAIL — two `tripMember.create` calls.

- [ ] **Step 3: Replace the membership copy with Invite creation**

The duplicator alone becomes `owner` of the copy. For each *other* source member, resolve their email and create an `Invite` with `token: randomUUID()`, their source `role`, and `expiresAt` 30 days out. A member without an email is skipped rather than silently dropped into membership.

- [ ] **Step 4: Update the duplicate UI copy**

Wherever duplication is explained, say co-Travellers will be **invited**, not carried over. Check `lib/duplicate-trip.ts` and the dialog for stale wording, and update ADR 0018's claim in Task 22.

- [ ] **Step 5: Run and commit**

Run: `npm run test`

```bash
git add server/actions/trips.ts lib/duplicate-trip.ts server/actions/trips.test.ts app components
git commit -m "fix(adr-1): duplicating a Trip carries co-Travellers as pending Invites"
```

---

### Task 12: Invite expiry is enforced

Task 2 added the columns. Nothing reads them yet. Expiry must kill **acceptance** as well as admission, or a stale Invite still grants Trip membership months later to anyone who already has an account. This amends ADR 0017.

**Files:**
- Modify: `lib/invites.ts:80-86`, `lib/globe-invites.ts:42-45`, `server/actions/invites.ts` (set `expiresAt` on create)
- Test: `lib/invites.test.ts`, `lib/globe-invites.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("does not accept an expired Trip Invite", async () => {
  dbMock.invite.findMany.mockResolvedValue([]); // the query itself must exclude it
  await acceptPendingInvitesForUser("u1", "someone@example.com");
  expect(dbMock.invite.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        acceptedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      }),
    }),
  );
  expect(dbMock.tripMember.createMany).not.toHaveBeenCalled();
});
```

Write the equivalent for `acceptPendingGlobeInvitesForUser`.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run lib/invites.test.ts lib/globe-invites.test.ts`
Expected: FAIL — the `where` has no expiry clause.

- [ ] **Step 3: Filter on expiry in both helpers**

```ts
where: {
  email: normalEmail,
  acceptedAt: null,
  // Expiry kills acceptance, not just sign-in admission: a stale Invite must
  // not silently grant Trip membership months later (ADR 0017, amended
  // 2026-09-22). `expiresAt: null` is a pre-migration row and stays valid.
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
},
```

Set `expiresAt` to creation + 30 days in `inviteToTrip` (and `inviteToGlobe`, if Task 7 didn't already).

- [ ] **Step 4: Run and commit**

Run: `npm run test`

```bash
git add lib/invites.ts lib/globe-invites.ts server/actions/invites.ts lib/invites.test.ts lib/globe-invites.test.ts
git commit -m "feat(ten-3): Invites expire after 30 days, and expiry blocks acceptance"
```

---

### Task 13: `ARCH-TEN-3a` (P0) — the allowlist predicate and the `signIn` callback

Nothing in the repo decides who may sign in. The only gate is Google's test-user list, outside the codebase and unreviewable in a diff. **Task 7 must have landed.**

**Files:**
- Create: `lib/allowlist.ts`, `lib/allowlist.test.ts`
- Modify: `lib/auth.ts:59-91`
- Test: `lib/auth.test.ts`

**Interfaces:**
- Produces: `isAllowedEmail(email: string | null | undefined): Promise<boolean>`
- Produces: `hasPendingTripInvite(email: string): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

```ts
describe("isAllowedEmail", () => {
  it("admits an address in ALLOWED_EMAILS, case- and space-insensitively", async () => {
    process.env.ALLOWED_EMAILS = " Cam@Example.com , other@example.com ";
    await expect(isAllowedEmail("cam@example.com")).resolves.toBe(true);
  });

  it("admits an address held in the AllowedEmail table", async () => {
    process.env.ALLOWED_EMAILS = "";
    dbMock.allowedEmail.findUnique.mockResolvedValue({ email: "friend@example.com" });
    await expect(isAllowedEmail("Friend@example.com")).resolves.toBe(true);
  });

  it("refuses an unknown address", async () => {
    process.env.ALLOWED_EMAILS = "";
    dbMock.allowedEmail.findUnique.mockResolvedValue(null);
    await expect(isAllowedEmail("stranger@example.com")).resolves.toBe(false);
  });

  it("refuses null/empty", async () => {
    await expect(isAllowedEmail(null)).resolves.toBe(false);
    await expect(isAllowedEmail("   ")).resolves.toBe(false);
  });
});

describe("signIn callback", () => {
  it("admits a Traveller holding an unexpired pending Trip Invite", async () => {
    dbMock.allowedEmail.findUnique.mockResolvedValue(null);
    dbMock.invite.findFirst.mockResolvedValue({ id: "inv1" });
    await expect(signInCallback({
      user: { email: "invited@example.com" },
      account: { provider: "google" },
      profile: { email_verified: true },
    })).resolves.toBe(true);
  });

  it("does NOT admit on a Globe Invite", async () => {
    dbMock.allowedEmail.findUnique.mockResolvedValue(null);
    dbMock.invite.findFirst.mockResolvedValue(null);
    dbMock.globeInvite.findFirst.mockResolvedValue({ id: "gi1" });
    await expect(signInCallback({
      user: { email: "globe-invited@example.com" },
      account: { provider: "google" },
      profile: { email_verified: true },
    })).resolves.toBe(false);
  });

  it("refuses Google sign-in when the email is not verified", async () => {
    dbMock.allowedEmail.findUnique.mockResolvedValue({ email: "cam@example.com" });
    await expect(signInCallback({
      user: { email: "cam@example.com" },
      account: { provider: "google" },
      profile: { email_verified: false },
    })).resolves.toBe(false);
  });

  it("lets the dev-login provider through untouched", async () => {
    await expect(signInCallback({
      user: { email: "you@example.com" },
      account: { provider: "dev-login" },
    })).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run lib/allowlist.test.ts lib/auth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/allowlist.ts`**

```ts
import { db } from "@/lib/db";

/**
 * Sign-in allowlist (ADR 0057). ONE predicate, TWO sources:
 *
 *   - ALLOWED_EMAILS env var — bootstrap and break-glass. This is how the
 *     operator gets in on a fresh or restored deployment before any row
 *     exists. NEVER written by code.
 *   - AllowedEmail table — everyone admitted through the product, written by
 *     approving an Access request. Revocable by deleting a row, which is
 *     instant; an env-var change needs a redeploy.
 *
 * "One door" means one predicate at one call site, not one storage location.
 * Shaped like isAdminEmail (lib/admin.ts): server-only, trimmed, lowercased.
 */
export async function isAllowedEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const needle = email.trim().toLowerCase();
  if (!needle) return false;

  const raw = process.env.ALLOWED_EMAILS;
  if (raw) {
    const listed = raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);
    if (listed.includes(needle)) return true;
  }

  const row = await db.allowedEmail.findUnique({ where: { email: needle } });
  return row !== null;
}

/**
 * True when this address holds an unexpired, un-accepted TRIP Invite.
 *
 * TRIP INVITES ONLY — never Globe Invites, and this is load-bearing. It makes
 * "who can create an Invite" exactly equal to "who can create an account on
 * this deployment". inviteToTrip is owner-or-admin (ADR 0052); honouring
 * Globe Invites here would let any Globe member mint accounts. A Globe is a
 * personal saved-places history, not an onboarding route (ADR 0057).
 */
export async function hasPendingTripInvite(email: string): Promise<boolean> {
  const needle = email.trim().toLowerCase();
  if (!needle) return false;
  const invite = await db.invite.findFirst({
    where: {
      email: needle,
      acceptedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  return invite !== null;
}
```

- [ ] **Step 4: Add the callback to `lib/auth.ts`**

Inside `authConfig.callbacks`, alongside `jwt` and `session`:

```ts
    async signIn({ user, account, profile }) {
      // The dev-login provider is already unregistrable in production
      // (lib/auth.ts:35 — ALLOW_DEV_LOGIN *and* NODE_ENV !== "production"),
      // so it passes through. Auth.js runs this callback for EVERY provider.
      if (account?.provider === "dev-login") return true;

      const email = user.email;
      if (!email) return false;

      // Auth.js's own guidance for this callback: enforce verification rather
      // than assume it.
      if (account?.provider === "google" && profile?.email_verified !== true) {
        return false;
      }

      if (await isAllowedEmail(email)) return true;
      if (await hasPendingTripInvite(email)) return true;

      // Task 14 records the Access request here before refusing.
      return false;
    },
```

Leave the `events.signIn` hook alone — it accepts pending Invites *after* a successful sign-in, and `app/(app)/layout.tsx:61-65` reconciles them again on every authenticated load (ADR 0017 calls the layout hook the important one). Both still run only after admission.

- [ ] **Step 5: Run and commit**

Run: `npm run test && npx tsc --noEmit`

```bash
git add lib/allowlist.ts lib/allowlist.test.ts lib/auth.ts lib/auth.test.ts
git commit -m "feat(ten-3): one door — sign-in gated by TEEPEE's own allowlist or a pending Trip Invite"
```

---

### Task 14: `ARCH-TEN-3b` — the Access request, and telling the person

Returning `false` creates no `User` row and redirects to `/signin?error=AccessDenied` carrying no identity. The request must therefore be recorded *in the callback*, from Google's verified profile. `app/signin/page.tsx` currently reads no `searchParams` at all, so a bounced Traveller sees the ordinary sign-in card with no explanation.

**Files:**
- Create: `lib/access-requests.ts`, `lib/access-requests.test.ts`
- Create: `lib/admin-notify.ts`, `lib/admin-notify.test.ts`
- Modify: `lib/auth.ts` (the `return false` branch), `app/signin/page.tsx`

**Interfaces:**
- Produces: `recordAccessRequest({ email, name, image }): Promise<void>`
- Produces: `notifyAdmins(title: string, body: string, url: string): Promise<void>` — consumed here, by Task 15's route, and by Task 16's error sink.

- [ ] **Step 1: Write the failing tests**

```ts
it("creates a pending request on first attempt", async () => {
  dbMock.accessRequest.findUnique.mockResolvedValue(null);
  await recordAccessRequest({ email: "New@example.com", name: "New Person", image: null });
  expect(dbMock.accessRequest.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ email: "new@example.com", status: "pending" }) }),
  );
});

it("bumps lastAttemptAt and attempts on a repeat, without duplicating", async () => {
  dbMock.accessRequest.findUnique.mockResolvedValue({ id: "ar1", status: "pending", attempts: 3 });
  await recordAccessRequest({ email: "new@example.com", name: null, image: null });
  expect(dbMock.accessRequest.create).not.toHaveBeenCalled();
  expect(dbMock.accessRequest.update).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "ar1" }, data: expect.objectContaining({ attempts: 4 }) }),
  );
});

it("does NOT reopen a dismissed request", async () => {
  dbMock.accessRequest.findUnique.mockResolvedValue({ id: "ar1", status: "dismissed", attempts: 1 });
  await recordAccessRequest({ email: "declined@example.com", name: null, image: null });
  const data = dbMock.accessRequest.update.mock.calls[0][0].data;
  expect(data.status).toBeUndefined(); // still dismissed
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run lib/access-requests.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `lib/admin-notify.ts`**

```ts
/**
 * Notify the operator in-app. TEEPEE has no mail dependency of any kind
 * (ADRs 0047, 0050) — reuse web-push and the account-level Devices (ADR 0048).
 *
 * ACCEPTED TRADE-OFF (sitrep 2026-09-22): the operator learns of a request
 * when they next open TEEPEE, so someone may wait a day. At 10–15 Travellers
 * that beat standing up email infrastructure. The /admin badge is the source
 * of truth; this push is only the prompt, and it must be allowed to fail.
 */
export async function notifyAdmins(title: string, body: string, url: string): Promise<void>
```

Resolve admin `User` rows by `ADMIN_EMAILS` (`lib/admin.ts`), load their `PushSubscription` rows, and `sendPush` (`lib/push.ts:81`) to each. Swallow every failure — `sendPush` already returns a result rather than throwing, and an unconfigured VAPID setup returns `{ sent: false, skipped: true }`. Test that it never throws when no admin, no Device, or no VAPID exists.

- [ ] **Step 4: Implement `recordAccessRequest`**

Unique on lowercased email. New → create `pending`, then call `notifyAdmins`. Existing → bump `lastAttemptAt` and `attempts` **only**; never touch `status`, and never re-notify. Wrap the whole body in try/catch — a failure here must not turn a clean refusal into a 500.

Call it from `lib/auth.ts` immediately before `return false`, passing `profile.name` and `profile.picture`.

- [ ] **Step 5: Make `/signin` explain itself**

`app/signin/page.tsx` becomes `async` and reads `searchParams`. When `error === "AccessDenied"`, render — above the sign-in button — a card saying:

> **TEEPEE is invite-only.**
> We've passed your request to the admin using your Google account — nothing else to do. You'll be able to sign in here once you're approved.

**This exact copy is required and must not be varied per state.** It is true for a brand-new request, a request pending for a week, and a quietly dismissed one. Distinct copy per state would leak the operator's decision to someone they deliberately declined.

- [ ] **Step 6: Test the page**

```ts
it("explains an access denial without revealing the request's state", async () => {
  const page = await SignInPage({ searchParams: Promise.resolve({ error: "AccessDenied" }) });
  render(page);
  expect(screen.getByText(/invite-only/i)).toBeInTheDocument();
  expect(screen.getByText(/passed your request to the admin/i)).toBeInTheDocument();
});
```

Confirm whether `searchParams` is a Promise in this Next version by checking a sibling page that already uses it; match that shape.

- [ ] **Step 7: Run and commit**

Run: `npm run test && npx tsc --noEmit`

```bash
git add lib/access-requests.ts lib/access-requests.test.ts lib/admin-notify.ts lib/admin-notify.test.ts lib/auth.ts app/signin
git commit -m "feat(ten-3): a refused sign-in records an Access request and says so"
```

---

### Task 15: `ARCH-TEN-3c` — the `/admin` route

**Files:**
- Create: `app/(app)/admin/page.tsx`, `app/(app)/admin/access-requests.tsx`
- Create: `server/actions/access-requests.ts`, `server/actions/access-requests.test.ts`
- Modify: the main nav component (find with `grep -rln "href=\"/account\"" components app`)

**Interfaces:**
- Consumes: `requireAdmin()` (Task 1), `notifyAdmins()` (Task 14)
- Produces: `approveAccessRequest(id): Promise<ActionResult>`, `dismissAccessRequest(id): Promise<ActionResult>`, `listAccessRequests(): Promise<AccessRequest[]>`

- [ ] **Step 1: Write the failing tests**

```ts
it("approving writes an AllowedEmail row and resolves the request", async () => {
  mockAdmin("ops@example.com");
  dbMock.accessRequest.findUnique.mockResolvedValue({ id: "ar1", email: "friend@example.com", status: "pending" });
  const result = await approveAccessRequest("ar1");
  expect(result.success).toBe(true);
  expect(dbMock.allowedEmail.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ email: "friend@example.com" }) }),
  );
  expect(dbMock.accessRequest.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ resolvedAt: expect.any(Date) }) }),
  );
});

it("a non-admin cannot approve", async () => {
  mockSession({ id: "u2", email: "ordinary@example.com" });
  process.env.ADMIN_EMAILS = "ops@example.com";
  await expect(approveAccessRequest("ar1")).rejects.toThrow("NEXT_NOT_FOUND");
  expect(dbMock.allowedEmail.create).not.toHaveBeenCalled();
});

it("dismissing sets status without granting access", async () => {
  mockAdmin("ops@example.com");
  dbMock.accessRequest.findUnique.mockResolvedValue({ id: "ar1", email: "x@example.com", status: "pending" });
  await dismissAccessRequest("ar1");
  expect(dbMock.allowedEmail.create).not.toHaveBeenCalled();
  expect(dbMock.accessRequest.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ status: "dismissed" }) }),
  );
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run server/actions/access-requests.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the actions**

Both call `requireAdmin()` from Task 1 **first**. Approve: create the `AllowedEmail` row (idempotent — catch P2002 and continue), stamp `resolvedAt`. Dismiss: set `status: "dismissed"`, stamp `resolvedAt`. Both `revalidatePath("/admin")`.

- [ ] **Step 4: Build the route**

`app/(app)/admin/page.tsx` calls `requireAdmin()` at the top — a non-admin gets `notFound()`. It renders pending Access requests: avatar, name, email, first asked, attempt count, with Approve and Dismiss. Leave a clearly-marked slot for Task 17's Errors section.

- [ ] **Step 5: Add the nav entry**

Admin-only link to `/admin` with a pending-count badge. **The badge is load-bearing**: if the operator has no Device registered the push goes nowhere, and the route must still be discoverable.

- [ ] **Step 6: Run and commit**

Run: `npm run test && npx tsc --noEmit && npm run lint`

```bash
git add "app/(app)/admin" server/actions/access-requests.ts server/actions/access-requests.test.ts components
git commit -m "feat(ten-3): /admin route with Access request approval and push notification"
```

---

### Task 16: `ARCH-OBS-1` — a server-side error sink

Every server-side failure terminates in a bare `console.*` with no downstream sink.

**Files:**
- Create: `lib/error-sink.ts`, `lib/error-sink.test.ts`
- Modify: the highest-value `console.error` sites — start with `lib/push.ts:118`, the cron route handlers, and `server/actions/` catch blocks that currently swallow

- [ ] **Step 1: Write the failing tests**

```ts
it("creates a row on first occurrence and notifies once", async () => {
  dbMock.errorReport.findUnique.mockResolvedValue(null);
  await reportError(new Error("boom"), { route: "/api/cron/digest", source: "server" });
  expect(dbMock.errorReport.create).toHaveBeenCalled();
  expect(notifyAdminsMock).toHaveBeenCalledTimes(1);
});

it("bumps count on a repeat and stays quiet", async () => {
  dbMock.errorReport.findUnique.mockResolvedValue({ id: "e1", count: 4 });
  await reportError(new Error("boom"), { route: "/api/cron/digest", source: "server" });
  expect(dbMock.errorReport.create).not.toHaveBeenCalled();
  expect(dbMock.errorReport.update).toHaveBeenCalled();
  expect(notifyAdminsMock).not.toHaveBeenCalled();
});

it("never throws, even when the database is unreachable", async () => {
  dbMock.errorReport.findUnique.mockRejectedValue(new Error("db down"));
  await expect(reportError(new Error("boom"), { source: "server" })).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run lib/error-sink.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `reportError`**

Signature: `reportError(err: unknown, ctx: { route?: string; source?: "server" | "client"; userId?: string }): Promise<void>`.

Signature key = a stable hash of `name + message + first stack frame` — never the full stack, or every request produces a new row. Dedupe on it: existing → increment `count`, set `lastSeen`, **no push**; new → create and `notifyAdmins` once.

**Always `console.error` as well as writing the row.** A database-down failure cannot write a database row — that class of error reaches only the console and Vercel's runtime logs, and that limitation is knowingly accepted (ADR 0059). Wrap the whole body in try/catch so the sink can never become the outage.

- [ ] **Step 4: Wire the call sites**

Replace bare `console.error` with `reportError` at the sites above, preserving existing behaviour otherwise.

- [ ] **Step 5: Run and commit**

Run: `npm run test`

```bash
git add lib/error-sink.ts lib/error-sink.test.ts lib server app
git commit -m "feat(obs-1): server failures report to an ErrorReport sink instead of dying in console"
```

---

### Task 17: `ARCH-OBS-2` — client error boundaries reach the sink

`app/(app)/error.tsx:21` logs to the Traveller's own devtools. There is nothing to find even if you look. Same for `app/global-error.tsx` and `app/(app)/trips/[tripId]/error.tsx`.

**Files:**
- Create: `app/api/client-error/route.ts`, `app/api/client-error/route.test.ts`
- Create: `app/(app)/admin/error-reports.tsx`, `server/actions/error-reports.ts`
- Modify: all three error boundaries

- [ ] **Step 1: Write the failing test**

```ts
it("records a client error and returns 204", async () => {
  const res = await POST(new Request("http://x/api/client-error", {
    method: "POST",
    body: JSON.stringify({ message: "render failed", stack: "at Foo", route: "/trips/t1" }),
  }));
  expect(res.status).toBe(204);
  expect(reportErrorMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ source: "client" }));
});

it("ignores a malformed body without throwing", async () => {
  const res = await POST(new Request("http://x/api/client-error", { method: "POST", body: "not json" }));
  expect(res.status).toBe(204);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run app/api/client-error`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Build the route**

Accepts `{ message, stack?, route? }`, calls `reportError` with `source: "client"` and the session user id if there is one. **Always returns 204**, including on malformed input — a reporting endpoint must never become a second error. Cap the stored `stack` length. This endpoint is deliberately reachable without a session, since an error boundary may fire on the sign-in page; that is an accepted, rate-limited-by-obscurity trade recorded in ADR 0059.

- [ ] **Step 4: Update the three boundaries**

Keep the existing `console.error` and the existing UI verbatim — only add a `fetch("/api/client-error", …)` alongside it, with `.catch(() => {})` so reporting failure never breaks the recovery screen. Do not render the error to the Traveller; the current code deliberately doesn't, so internals aren't leaked.

- [ ] **Step 5: Add the Errors section to `/admin`**

List `ErrorReport` rows by `lastSeen` desc: signature, message, route, source, count, first/last seen, with a Clear action (`requireAdmin`-guarded).

- [ ] **Step 6: Run and commit**

Run: `npm run test && npx tsc --noEmit && npm run lint`

```bash
git add app/api/client-error "app/(app)/admin" "app/(app)/error.tsx" app/global-error.tsx "app/(app)/trips/[tripId]/error.tsx" server/actions/error-reports.ts
git commit -m "feat(obs-2): client error boundaries report to the sink; /admin surfaces errors"
```

---

### Task 18: `ARCH-DAT-3` — blobs survive deletion long enough to be restored

R2 files are hard-deleted and never backed up, so restoring a dump returns Attachment rows whose files are permanently gone. `deleteAttachment` (`attachments.ts:243-249`) also destroys the blob **before** the database write that justifies it — `ARCH-DAT-9`, not in scope, but it has nothing left to corrupt once blobs are never destroyed synchronously.

Blob-destroying call sites: `attachments.ts:147`, `:205`, `:244`, `cover.ts:58`, `:80`, and `deleteBlobsBestEffort` in `server/actions/target-cleanup.ts`.

**Files:**
- Create: `lib/blob-retention.ts`, `lib/blob-retention.test.ts`
- Create: `scripts/sweep-deleted-blobs.ts`
- Modify: every call site above
- Modify: `package.json` (add `"sweep:blobs": "tsx scripts/sweep-deleted-blobs.ts"`)

**Interfaces:**
- Produces: `scheduleBlobDeletion(keys: (string | null | undefined)[]): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```ts
it("records keys for later sweeping instead of destroying them", async () => {
  await scheduleBlobDeletion(["trips/t1/a.pdf", null, "trips/t1/b.png"]);
  expect(storageMock.delete).not.toHaveBeenCalled();
  expect(dbMock.deletedBlob.createMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: [{ storageKey: "trips/t1/a.pdf" }, { storageKey: "trips/t1/b.png" }],
      skipDuplicates: true,
    }),
  );
});

it("is a no-op for an empty list", async () => {
  await scheduleBlobDeletion([]);
  expect(dbMock.deletedBlob.createMany).not.toHaveBeenCalled();
});

it("never throws — a retention failure must not fail the delete", async () => {
  dbMock.deletedBlob.createMany.mockRejectedValue(new Error("db down"));
  await expect(scheduleBlobDeletion(["k"])).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run lib/blob-retention.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement it**

```ts
/**
 * Retain a blob instead of destroying it (ARCH-DAT-3).
 *
 * db-backup.yml keeps dumps for 30 days. A blob destroyed the moment its row
 * is deleted makes every one of those dumps a partial lie: restore it and you
 * get Attachment rows pointing at files that no longer exist. So deletion
 * becomes deferred — the row goes now, the file goes after 35 days.
 *
 * 35, not 30: the blob must outlive the OLDEST dump that still references it,
 * with a few days' margin. Sweep with `npm run sweep:blobs` (dry-run by
 * default, --execute to apply), following scripts/sweep-orphaned-costs.ts.
 */
```

Filter nullish keys, `createMany` with `skipDuplicates: true`, wrap in try/catch.

- [ ] **Step 4: Change every call site**

Replace each `storage.delete(key)` / `deleteBlobsBestEffort(keys)` with `scheduleBlobDeletion([...])`. Existing tests assert `storage.delete` was called — **update those tests**, since the behaviour deliberately changed; do not weaken them, assert the scheduling instead.

- [ ] **Step 5: Write the sweep script**

`scripts/sweep-deleted-blobs.ts`, modelled on `scripts/sweep-orphaned-costs.ts`: **dry-run by default**, `--execute` to apply, `--days=35` overridable. Selects `DeletedBlob` rows older than the cutoff, deletes each object from storage, then removes the row. Prints a summary. Never deletes a blob still referenced by a live `Attachment.storageKey` or `Trip.coverImageKey` — check before destroying, because a restore may have re-created the row.

- [ ] **Step 6: Run and commit**

Run: `npm run test && npx tsc --noEmit`

```bash
git add lib/blob-retention.ts lib/blob-retention.test.ts scripts/sweep-deleted-blobs.ts server/actions package.json
git commit -m "fix(dat-3): retain deleted blobs for 35 days so a database restore can find them"
```

---

### Task 19: `ARCH-DAT-4` — Stop deletion says what it destroys

Deleting a Stop cascades its Accommodations, their confirmation numbers and unpaid Costs behind a dialog that says only "This can't be undone." `promoteFork` already does this properly — `forks.ts:648` itemises every paid Cost and `promote-fork-dialog.tsx:213-251` gates it behind typing the Fork's name. Copy that pattern.

**Files:**
- Modify: `server/actions/stops.ts` (add a loss-preview query), the delete-Stop dialog component
- Test: `server/actions/stops.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("ARCH-DAT-4: reports what deleting a Stop will destroy", async () => {
  dbMock.accommodation.findMany.mockResolvedValue([{ id: "a1", name: "Hotel Bristol", confirmation: "ABC123" }]);
  dbMock.cost.findMany.mockResolvedValue([{ id: "c1", label: "Hotel Bristol", amount: 42000, paidAt: null }]);

  const preview = await previewStopDeletion("s1");

  expect(preview.accommodations).toHaveLength(1);
  expect(preview.unpaidCosts).toHaveLength(1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run server/actions/stops.test.ts -t "ARCH-DAT-4"`
Expected: FAIL.

- [ ] **Step 3: Implement `previewStopDeletion(stopId)`**

Access-checked like `deleteStop`. Returns the Accommodations (name, whether a confirmation exists — **not the confirmation value itself**), the unpaid Costs, the attachment count and the note count that will be destroyed.

- [ ] **Step 4: Update the dialog**

Itemise the losses. Where the preview shows an Accommodation holding a confirmation number, say so — that is the detail the current dialog hides. Keep the existing confirm control; do not add name-typing (that is `promoteFork`'s bar, and deleting one Stop is a smaller act).

- [ ] **Step 5: Run and commit**

Run: `npm run test && npx tsc --noEmit`

```bash
git add server/actions/stops.ts server/actions/stops.test.ts components app
git commit -m "fix(dat-4): deleting a Stop itemises the Accommodations, confirmations and Costs it destroys"
```

---

### Task 20: `ARCH-BND-2` — route `forkId: null` through `lib/plan-scope.ts`

The real-plan discriminator is hand-typed in ~96 places despite `REAL_PLAN` and `planScope()` existing for exactly this. ADR 0020 calls this the main ongoing cost of the approach. This is the mechanical task — it changes no behaviour.

**Files:**
- Modify: every file containing a literal `forkId: null`

- [ ] **Step 1: Enumerate the sites**

Run: `grep -rn "forkId: null" --include=*.ts --include=*.tsx server lib app components | grep -v '\.test\.' | wc -l`
Record the number in the commit message.

- [ ] **Step 2: Replace in `where` clauses**

`{ tripId, forkId: null }` → `{ tripId, ...REAL_PLAN }`. Where the value is a variable plan, use `...planScope(forkId)`.

**Do not touch two categories.** First, `data:` payloads on create — spreading a `where` fragment into a `data` block is a different thing and reviewers will flag it; leave explicit `forkId: null` there unless the types genuinely match. Second, the deliberate exception recorded in the sitrep: **dated views deliberately ignore `?plan=`** — that is a policy, not a spelling, and `BND-2` is about how the filter is *expressed*. Leave those and add a one-line comment naming the exception.

- [ ] **Step 3: Verify nothing changed**

Run: `npm run test && npx tsc --noEmit && npm run lint`
Expected: PASS, 3999 tests, with **no test modified**. If a test needed changing, you changed behaviour — revert and reconsider.

- [ ] **Step 4: Commit**

```bash
git add server lib app components
git commit -m "refactor(bnd-2): route the real-plan discriminator through lib/plan-scope.ts"
```

---

### Task 21: `/privacy` and `/terms`

Publishing the Google OAuth app needs both at real URLs. Non-sensitive scopes only (`openid email profile`), so no paid security assessment — but the consent screen requires the pages to exist.

**Files:**
- Create: `app/privacy/page.tsx`, `app/terms/page.tsx`
- Modify: the footer or sign-in page to link them

- [ ] **Step 1: Write the pages**

Public and unauthenticated — they must render for someone who cannot sign in. Plain English, no borrowed boilerplate. Privacy states, accurately and from the code:

- Collected: Google profile (name, email, avatar), Trip content, uploaded files, push subscriptions, error reports.
- Shared with, named: Google (sign-in), Apple Push and FCM (notifications), Nominatim/OpenStreetMap and Carto (geocoding and map tiles), Cloudflare R2 (file storage), Vercel (hosting), Neon (database).
- **No analytics, no advertising, no third-party trackers.** True today — verify with a grep before asserting it.
- Backups run nightly and are kept 30 days; deleted files are retained 35 days before removal (Task 18).
- **Export: "ask the admin and they'll send you a copy."** Do not promise self-serve export — `ARCH-DAT-13` is deferred, and `ARCH-DAT-2`'s runbook is deferred too. This wording is a promise about what a human does, which remains true.

Terms states what TEEPEE honestly is: an invite-only personal project, provided without warranty, access revocable at any time, don't upload anything you haven't the right to.

- [ ] **Step 2: Test they render unauthenticated**

```ts
it("renders the privacy page without a session", async () => {
  render(await PrivacyPage());
  expect(screen.getByRole("heading", { name: /privacy/i })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run and commit**

Run: `npm run test && npm run lint`

```bash
git add app/privacy app/terms components
git commit -m "feat(ten-3): add privacy and terms pages required to publish the OAuth app"
```

---

### Task 22: Documentation, ADRs, and the operator's checklists

**Files:**
- Create: `docs/adr/0057-one-door-sign-in-allowlist.md`, `docs/adr/0058-journal-entries-are-per-traveller.md`, `docs/adr/0059-errors-report-to-our-own-database.md`
- Create: `docs/rollout-gate-manual-verify.md`
- Modify: `CONTEXT.md`, `docs/DEPLOY.md`, `docs/adr/0017-*.md`, `docs/adr/0018-*.md`, `docs/adr/0052-*.md`, `docs/architecture-sitrep-2026-09-22.md`

- [ ] **Step 1: ADR 0057 — the door**

Follow the existing ADR format. It must record **three** decisions and, for each, the alternative rejected:
1. The gate lives in the `signIn` **callback**, not the event — the event cannot block, and a callback-less allowlist would bounce invited Travellers before their Invite is ever accepted.
2. Admission is **allowlist OR pending unexpired Trip Invite**, and **never a Globe Invite** — spell out why: `inviteToTrip` is owner-or-admin (ADR 0052) but `inviteToGlobe` was ungated (`ARCH-TEN-4`, fixed in Task 7), so honouring Globe Invites would let any Globe member mint accounts. **This exclusion is the non-obvious part a future reader will otherwise undo.**
3. The allowlist has **two sources** — env var for bootstrap/break-glass, table for product-driven approval. Record why: an env var cannot be written at runtime, so Access request approval would have nowhere to put the address; and a database row is *more* revocable than an env var, which needs a redeploy. "One door" means one predicate at one call site.

Also record the 30-day Invite expiry and the deploy-date backfill.

- [ ] **Step 2: ADR 0058 — per-Traveller Journal**

Records that the Journal moved from one shared last-write-wins row to per-Traveller entries; that this removes the conflict class by construction rather than detecting it; that optimistic concurrency was the rejected alternative; and that the migration knowingly took **one** deploy through the §4b window because the branch ships before rollout.

- [ ] **Step 3: ADR 0059 — self-hosted error sink**

Records the choice of an `ErrorReport` table over Sentry: no third party in the privacy policy, no extra account or key, consistent with the Access request notification pattern. **Record the accepted blind spot explicitly** — a database-down failure cannot write a database row, so that class reaches only `console` and Vercel's runtime logs. Also record that `/api/client-error` is deliberately reachable without a session.

- [ ] **Step 4: Amend existing ADRs**

- **ADR 0017**: Invite expiry now blocks *acceptance*, not only admission.
- **ADR 0018**: duplication carries co-Travellers as pending Invites, not memberships.
- **ADR 0052**: the Calendar feed now carries the Share link's field floor; whole-branch destruction is owner-only.

Amend in place with a dated note; do not rewrite history.

- [ ] **Step 5: `CONTEXT.md`**

Add **Access request** — *a person without an account asking for one; distinct from an **Invite**, which is Trip-scoped and created by the Trip's owner*. The sitrep deliberately withheld this until the feature was built (line 1169); it is built now. Glossary only — no implementation detail.

- [ ] **Step 6: `docs/DEPLOY.md`**

Add `ALLOWED_EMAILS` to the environment table. Add a **pre-deploy checklist** for this branch:
1. Set `ALLOWED_EMAILS` in Vercel (belt-and-braces — the migration backfills `AllowedEmail` from existing Users, so it is not load-bearing).
2. Deploy at a quiet moment; the Journal unique-key change opens a §4b window for the length of the build. Do not write a Journal entry while it runs.
3. The pending `whatsNewSeenAt` migration deploys alongside this one — additive and nullable, safe.
4. After deploy: publish the Google OAuth app (Console work — app name, support email, developer contact, authorised domain, and the new `/privacy` and `/terms` URLs). Verify Google's current requirements at the time; this reflects policy as understood on 2026-09-22.
5. Consider enabling R2 bucket versioning — **recommended, not required**; the app-level retention from Task 18 is what actually protects the data.

- [ ] **Step 7: `docs/rollout-gate-manual-verify.md`**

Everything this sandbox could not verify — no Postgres, no browser — each with exact steps:
- The migration applies cleanly, and `AllowedEmail` is populated from existing Users.
- `Invite.expiresAt` is ~30 days out for every pending Invite, and no Invite is already expired.
- A signed-out stranger attempting Google sign-in is refused, sees the invite-only card, and appears in `/admin`.
- Approving that request lets them sign in on the next attempt.
- An invited Traveller (pending Trip Invite, not on the allowlist) can sign in and lands on the Trip.
- Two Travellers write the same Journal day and both entries survive.
- `npm run sweep:blobs` dry-run reports the expected keys and destroys nothing.
- A deleted attachment's blob still exists in R2 afterwards.
- The Calendar feed contains no confirmation numbers, booking references or notes.

- [ ] **Step 8: Update the sitrep**

In `docs/architecture-sitrep-2026-09-22.md`, mark the 15 findings closed with a dated note pointing at this branch, and record that `ARCH-DAT-2` was **deliberately deferred**, with the reason: soft-delete preserves the files, which is the irreversible half, whereas a runbook can be written at any time.

- [ ] **Step 9: Commit**

```bash
git add docs CONTEXT.md
git commit -m "docs: ADRs 0057-0059, amendments, and the rollout-gate operator checklists"
```

---

### Task 23: Final verification

- [ ] **Step 1: Restore the baseline**

Run each and record the actual output:
```bash
npm run test
npx tsc --noEmit
npm run lint
```
Expected: **3999+ passing** (higher — every task added tests), tsc clean, lint clean.

- [ ] **Step 2: Confirm the commit log**

Run: `git log --oneline main..HEAD`
Expected: one commit per finding id, plus the migration and docs commits.

- [ ] **Step 3: Confirm exactly one new migration**

Run: `git diff --name-only main..HEAD -- prisma/migrations`
Expected: only `20260922000000_rollout_gate/migration.sql`.

- [ ] **Step 4: Report honestly**

State plainly which findings are closed, that `ARCH-DAT-2` was deferred by decision, and that every DB- and browser-dependent behaviour is **manual verify (needs DB)** per `docs/rollout-gate-manual-verify.md`. Do not claim anything as verified that was not run. **Do not merge to `main`. Do not deploy.**
