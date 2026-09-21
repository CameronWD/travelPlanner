# Close the Open Backlog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all 8 open follow-ups and implement the 5 operator decisions recorded in `docs/open-follow-ups.md`, leaving that document drained and two migrations ready for the operator to deploy.

**Architecture:** Twelve independent tasks against an existing Next.js 15 / React 19 / Prisma 7 app. Nine change behaviour, each with a test that fails before and passes after; two add additive migrations; one drains the backlog document. No task depends on another's output — they touch disjoint files except where noted in **Interfaces**.

**Tech Stack:** Next.js (App Router, server actions), React 19, TypeScript, Prisma 7 + `@prisma/adapter-pg` (Postgres), Vitest + Testing Library, Tailwind, `web-push`.

## Global Constraints

- **Branch:** all work lands on `chore/close-the-open-backlog`. Never commit to `main`. Never merge. Never deploy. Never run a migration against any database.
- **Per-task gate, all three, every task:** `npx vitest run`, `npx tsc --noEmit`, `npm run lint`. **`npx tsc --noEmit` is mandatory per task** — `npm test` and `npm run lint` do not typecheck, and the 2026-09-21 sweep carried a red typecheck through four tasks because only the final task ran a build.
- **Every fix lands with a test that fails before and passes after.** The suite mocks `@/lib/db` (`vi.mock("@/lib/db", ...)`); logic-level tests are the norm. There is no Postgres in this sandbox.
- **Timezone-sensitive tests must pin `TZ`.**
- **Read `CONTEXT.md` before touching anything.** It is the vocabulary contract. **Activity** means the change-log feed, never a planned thing to do; the trip-scoped idea pool is the **Wishlist**; a **Device** is account-level; a **Digest** is the once-a-day push.
- **Do not connect to a database.** Do not run `npm run feedback:pull` or `npm run feedback:resolve` — you are a subagent, and those read production (`SW-03`).
- **Commit at the end of each task** with a Conventional Commits subject ≤ 50 chars.
- Migration directories are named `YYYYMMDDHHMMSS_snake_case`; migration SQL is hand-written to match `prisma/schema.prisma`. Do **not** run `prisma migrate dev`.

---

### Task 1: SW-05 — `inviteToTrip` becomes owner-or-admin

Implements ADR 0052. An Invite grants full, transitive Trip membership; `requireTripAccess` alone only proves the caller is a member.

**Files:**
- Modify: `server/actions/invites.ts:1-6` (imports), `:40` (the guard)
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx` (gate the Invite control on the existing `canManageTrip`)
- Test: `server/actions/invites.test.ts`

**Interfaces:**
- Consumes: `requireTripAccess(tripId)` returns `{ user, membership }`; `isAdminEmail(email)` from `@/lib/admin`. Confirm the import path by reading `server/actions/trips.ts:258`'s import block and copying it exactly.
- Produces: nothing other tasks rely on.

**Out of scope — do not touch:** `createShareLink` (`server/actions/share.ts:97`) and `createCalendarFeed` (`server/actions/calendar-feed.ts:59`). ADR 0052 deliberately leaves both on `requireTripAccess` alone. Extending the guard to them is a spec violation, not an improvement.

- [ ] **Step 1: Write the failing test**

Add to `server/actions/invites.test.ts`, matching the file's existing mock setup (read the top of the file first and reuse its `vi.mock` blocks rather than inventing new ones):

```ts
it("refuses a non-owner member", async () => {
  requireTripAccessMock.mockResolvedValue({
    user: { id: "u2", email: "member@example.com" },
    membership: { role: "member" },
  });

  const result = await inviteToTrip("trip1", "new@example.com");

  expect(result).toEqual({
    success: false,
    error: "Only the trip owner can invite someone to this trip.",
  });
  expect(db.invite.upsert).not.toHaveBeenCalled();
});

it("allows an admin who is not the owner", async () => {
  requireTripAccessMock.mockResolvedValue({
    user: { id: "u3", email: "admin@example.com" },
    membership: { role: "member" },
  });
  isAdminEmailMock.mockReturnValue(true);
  (db.tripMember.findMany as Mock).mockResolvedValue([]);

  const result = await inviteToTrip("trip1", "new@example.com");

  expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run server/actions/invites.test.ts`
Expected: FAIL — the non-owner case currently returns `{ success: true, ... }` because no role is checked.

- [ ] **Step 3: Add the guard**

In `server/actions/invites.ts`, add `isAdminEmail` to the imports and replace line 40:

```ts
  await requireTripAccess(tripId);
```

with:

```ts
  const { user, membership } = await requireTripAccess(tripId);

  // An Invite grants full, transitive Trip membership — everything ADR 0051's
  // never-shared floor withholds from a Share link — so it is owner-or-admin,
  // unlike createShareLink and createCalendarFeed which stay open to any
  // member on purpose (ADR 0052). Same admin bypass as Delete and Duplicate
  // (ADR 0045); membership is still required, since requireTripAccess above
  // already notFound()s for a non-member.
  if (membership.role !== "owner" && !isAdminEmail(user.email)) {
    return {
      success: false,
      error: "Only the trip owner can invite someone to this trip.",
    };
  }
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run server/actions/invites.test.ts`
Expected: PASS

- [ ] **Step 5: Gate the Settings Invite control**

In `app/(app)/trips/[tripId]/settings/page.tsx`, find the card that renders the invite-by-email control (search for the component that posts to `inviteToTrip` — likely `InvitePartner` or similar; read the file to get the real name). Wrap that card in the `canManageTrip` already computed at line 36, using the same shape as the Danger zone at line 221:

```tsx
      {/* ── Invite (owner or admin) — an Invite grants full membership, ADR 0052 ── */}
      {canManageTrip && (
        <Card>
          {/* ...existing invite card contents, unchanged... */}
        </Card>
      )}
```

A UI that offers a button the server now refuses is exactly the mismatch that hid the `duplicateTrip` P0 (`HG-12`) — in reverse. Leave the pending-invite *list* visible to all members if the page renders one separately; only the control that creates an Invite is gated.

- [ ] **Step 6: Run the full gate**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all three clean.

- [ ] **Step 7: Commit**

```bash
git add server/actions/invites.ts server/actions/invites.test.ts "app/(app)/trips/[tripId]/settings/page.tsx"
git commit -m "fix(invites): invite is owner-or-admin (SW-05)"
```

---

### Task 2: CD-02 — a Device is never reassigned

Implements ADR 0053. Server and client together: a server-only change closes the hole and breaks the shared machine, which is the option the operator rejected.

**Files:**
- Modify: `server/actions/push.ts` (`subscribeToPush`, ~line 47-95)
- Modify: `components/account/push-subscribe.ts` (`persistSubscription`, `subscribeThisDevice`)
- Test: `server/actions/push.test.ts`

**Interfaces:**
- Consumes: `PushActionResult = { ok: true } | { ok: false; error: string }` — this task **widens** it.
- Produces: `PushActionResult` gains an optional discriminator: `{ ok: false; error: string; reason?: "conflict" }`. `healRotatedSubscription`'s separate `HealRotatedResult` already uses a `reason` discriminator (`"invalid" | "forbidden" | "internal"`) — follow that precedent's shape, do not merge the two types.

- [ ] **Step 1: Write the failing test**

Add to `server/actions/push.test.ts`, reusing the file's existing `vi.mock("@/lib/db", ...)` and `requireUser` mocks:

```ts
it("refuses to take over a subscription owned by someone else", async () => {
  requireUserMock.mockResolvedValue({ id: "u2", email: "b@example.com" });
  (db.pushSubscription.findUnique as Mock).mockResolvedValue({
    userId: "u1",
  });

  const result = await subscribeToPush({
    endpoint: "https://push.example/abc",
    keys: { p256dh: "p", auth: "a" },
  });

  expect(result).toEqual({
    ok: false,
    error:
      "This device is already enabled for another account. Turn it off there, or press Enable again.",
    reason: "conflict",
  });
  expect(db.pushSubscription.upsert).not.toHaveBeenCalled();
});

it("still updates a subscription the caller already owns", async () => {
  requireUserMock.mockResolvedValue({ id: "u1", email: "a@example.com" });
  (db.pushSubscription.findUnique as Mock).mockResolvedValue({ userId: "u1" });

  const result = await subscribeToPush({
    endpoint: "https://push.example/abc",
    keys: { p256dh: "p", auth: "a" },
  });

  expect(result).toEqual({ ok: true });
  expect(db.pushSubscription.upsert).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run server/actions/push.test.ts`
Expected: FAIL — the first case currently returns `{ ok: true }` and calls `upsert`, re-pointing the row.

- [ ] **Step 3: Implement the refusal**

In `server/actions/push.ts`, widen the result type:

```ts
export type PushActionResult =
  | { ok: true }
  // `reason: "conflict"` means the endpoint belongs to someone else. The
  // client acts on precisely this case by minting a fresh endpoint, so it
  // must be distinguishable from a generic failure (ADR 0053).
  | { ok: false; error: string; reason?: "conflict" };
```

In `subscribeToPush`, before the upsert:

```ts
  // ADR 0053: a PushSubscription row is never reassigned. The row is matched
  // by endpoint, and an endpoint is a capability secret rather than a
  // credential — an authenticated caller holding someone else's could
  // otherwise re-point it at themselves and silence that Device. The
  // legitimate shared-machine case does not need a reassignment: the browser
  // unsubscribes and re-subscribes to get a fresh endpoint instead.
  const existing = await db.pushSubscription.findUnique({
    where: { endpoint: sub.endpoint },
    select: { userId: true },
  });
  if (existing && existing.userId !== user.id) {
    return {
      ok: false,
      error:
        "This device is already enabled for another account. Turn it off there, or press Enable again.",
      reason: "conflict",
    };
  }
```

Then remove `userId: user.id` from the **`update`** arm of the upsert (leave it on `create`), and replace the long comment above `update:` with:

```ts
      // `userId` is deliberately absent: a row is never reassigned (ADR 0053).
      // The conflict check above has already proved this row is ours.
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run server/actions/push.test.ts`
Expected: PASS

- [ ] **Step 5: Make the client mint a fresh endpoint**

In `components/account/push-subscribe.ts`, replace `subscribeThisDevice`'s persist step so a conflict is retried exactly once against a new endpoint:

```ts
    const registration = await navigator.serviceWorker.ready;
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    let subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
    });

    let result = await persistSubscription(subscription);

    // ADR 0053: the server never reassigns a row, so a subscription already
    // held by another account is refused. pushManager.subscribe() returns the
    // EXISTING subscription, which is why a second press alone cannot help —
    // the browser has to drop it first. Unsubscribing and re-subscribing
    // mints a new endpoint and does not re-prompt, because permission is
    // already granted for this origin. Once only: a second conflict is a real
    // error, not a state to keep churning.
    if (!result.ok && result.reason === "conflict") {
      await subscription.unsubscribe();
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });
      result = await persistSubscription(subscription);
    }

    return result.ok ? { ok: true } : { ok: false, reason: "error" };
```

- [ ] **Step 6: Run the full gate**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all three clean. If `tsc` flags other `PushActionResult` consumers, they are reading `ok`/`error` only and need no change — fix any genuine narrowing errors rather than widening the type further.

- [ ] **Step 7: Commit**

```bash
git add server/actions/push.ts server/actions/push.test.ts components/account/push-subscribe.ts
git commit -m "fix(push): never reassign a device row (CD-02)"
```

---

### Task 3: CD-06 — `lastSuccessAt`, so the heartbeat stops overclaiming

The heartbeat is stamped before the dispatch loop, so a throw inside the scan leaves Account reading "healthy" while zero Digests went out.

**Files:**
- Modify: `prisma/schema.prisma` (`model CronHeartbeat`, ~line 786)
- Create: `prisma/migrations/20260921000000_cron_heartbeat_last_success/migration.sql`
- Modify: `app/api/cron/digest/route.ts` (stamp after the scan)
- Modify: `lib/cron-health.ts`, `server/actions/cron-health.ts`, `components/account/dispatcher-health.tsx`
- Test: `lib/cron-health.test.ts`

**Interfaces:**
- Produces: `DispatcherHealthData` gains `lastSuccessAt: Date | null`. `isDispatcherStale` is unchanged in signature; a new `isDispatcherUnhealthy(lastRunAt, lastSuccessAt, now)` returns `true` when **either** signal is stale.

- [ ] **Step 1: Write the failing test**

Add to `lib/cron-health.test.ts`:

```ts
describe("isDispatcherUnhealthy", () => {
  const now = new Date("2026-09-21T12:00:00Z");

  it("is unhealthy when the route ran but nothing was ever dispatched", () => {
    expect(isDispatcherUnhealthy(new Date("2026-09-21T11:00:00Z"), null, now)).toBe(true);
  });

  it("is unhealthy when dispatch succeeded long ago but the route ran just now", () => {
    expect(
      isDispatcherUnhealthy(
        new Date("2026-09-21T11:00:00Z"),
        new Date("2026-09-19T11:00:00Z"),
        now,
      ),
    ).toBe(true);
  });

  it("is healthy when both signals are fresh", () => {
    expect(
      isDispatcherUnhealthy(
        new Date("2026-09-21T11:00:00Z"),
        new Date("2026-09-21T11:00:00Z"),
        now,
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run lib/cron-health.test.ts`
Expected: FAIL — `isDispatcherUnhealthy is not defined`.

- [ ] **Step 3: Add the helper**

In `lib/cron-health.ts`:

```ts
/**
 * Whether the Digest dispatcher should be reported as broken.
 *
 * Two signals, because one cannot answer the question. `lastRunAt` is stamped
 * on every authorized run, before any Digest is built — it is what separates
 * "nothing to say" from "the scheduler stopped". `lastSuccessAt` is stamped
 * only once a scan has completed, so a throw part-way through the dispatch
 * loop leaves it behind while `lastRunAt` marches on. Either going stale means
 * Travellers are not getting Digests (CD-06).
 */
export function isDispatcherUnhealthy(
  lastRunAt: Date | null,
  lastSuccessAt: Date | null,
  now: Date,
): boolean {
  return isDispatcherStale(lastRunAt, now) || isDispatcherStale(lastSuccessAt, now);
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run lib/cron-health.test.ts`
Expected: PASS

- [ ] **Step 5: Add the column, the migration, and the write**

`prisma/schema.prisma`:

```prisma
model CronHeartbeat {
  id            String    @id @default("digest")
  lastRunAt     DateTime
  /// Stamped only after a scan completes. `lastRunAt` proves the route ran and
  /// was authorized; this proves the dispatch loop got to the end (CD-06).
  /// Nullable so the migration is additive on the write path too — the
  /// still-running old build never writes it (docs/DEPLOY.md §4b).
  lastSuccessAt DateTime?
}
```

`prisma/migrations/20260921000000_cron_heartbeat_last_success/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "CronHeartbeat" ADD COLUMN "lastSuccessAt" TIMESTAMP(3);
```

In `app/api/cron/digest/route.ts`, leave the existing `lastRunAt` upsert exactly where it is, and add a second best-effort stamp **after** the scan's `try` block completes successfully (immediately before the route returns its summary):

```ts
  // Stamped only here, once the scan and every per-trip dispatch have been
  // attempted without throwing. The lastRunAt write above cannot carry this
  // meaning: it happens before any Digest is built (CD-06).
  try {
    await db.cronHeartbeat.update({
      where: { id: "digest" },
      data: { lastSuccessAt: new Date() },
    });
  } catch (err) {
    console.error("[cron/digest] success stamp failed:", err);
  }
```

- [ ] **Step 6: Surface it**

In `server/actions/cron-health.ts`, select both columns, return `lastSuccessAt`, and compute the flag with `isDispatcherUnhealthy`. Keep the existing try/catch that returns `{ lastRunAt: null, stale: true }` on a missing table — extend that fallback to `{ lastRunAt: null, lastSuccessAt: null, stale: true }`. In `components/account/dispatcher-health.tsx`, keep rendering `formatLastRun(lastRunAt, now)` but make the warning copy fire off the new flag, and when `lastRunAt` is fresh while `lastSuccessAt` is not, say so plainly — e.g. "Digest service — running, but nothing has been sent since <date>".

- [ ] **Step 7: Run the full gate**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all three clean.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/cron-health.ts lib/cron-health.test.ts server/actions/cron-health.ts components/account/dispatcher-health.tsx "app/api/cron/digest/route.ts"
git commit -m "feat(digest): stamp last successful dispatch (CD-06)"
```

---

### Task 4: CD-04 — one Digest per person per slot

Implements ADR 0054. A mid-day zone flip elects two different zones across two runs, producing two `localDate` values and therefore two ledger keys for one person.

**Files:**
- Modify: `lib/digest-dispatch.ts` (`dispatchDigest`, the claim block ~line 585)
- Test: `lib/digest-dispatch.test.ts`

**Interfaces:**
- Consumes: `DispatchSkipReason = "disabled" | "already-sent" | "empty"` — reuse `"already-sent"`; do **not** add a new reason. The route counts skips generically and a new string would need handling in two more places for no gain.
- Produces: exports `DIGEST_SLOT_COOLDOWN_MS` so the test does not hard-code 18h.

- [ ] **Step 1: Write the failing test**

```ts
it("skips a second dispatch for the same slot inside the cooldown", async () => {
  (db.digestPreference.findUnique as Mock).mockResolvedValue(null);
  (db.digestDispatch.findFirst as Mock).mockResolvedValue({ id: "d1" });

  const result = await dispatchDigest({
    userId: "u1",
    tripId: "t1",
    localDate: "2026-09-22",
    slot: "EVENING",
    zone: "Australia/Sydney",
  });

  expect(result).toEqual({ sent: 0, skipped: true, reason: "already-sent" });
  expect(db.digestDispatch.create).not.toHaveBeenCalled();
});

it("claims when no recent dispatch exists", async () => {
  (db.digestPreference.findUnique as Mock).mockResolvedValue(null);
  (db.digestDispatch.findFirst as Mock).mockResolvedValue(null);
  (db.digestDispatch.create as Mock).mockResolvedValue({ id: "d2" });

  await dispatchDigest({
    userId: "u1",
    tripId: "t1",
    localDate: "2026-09-22",
    slot: "EVENING",
  });

  expect(db.digestDispatch.create).toHaveBeenCalled();
});

it("does not apply the cooldown to a forced test send", async () => {
  (db.digestDispatch.findFirst as Mock).mockResolvedValue({ id: "d1" });

  await dispatchDigest({
    userId: "u1",
    tripId: "t1",
    localDate: "2026-09-22",
    slot: "EVENING",
    force: true,
  });

  expect(db.digestDispatch.findFirst).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run lib/digest-dispatch.test.ts`
Expected: FAIL — the first case claims and proceeds; `findFirst` is never called.

- [ ] **Step 3: Implement the cooldown**

In `lib/digest-dispatch.ts`, above `dispatchDigest`:

```ts
/**
 * How recently the same person may have had this slot before a second send is
 * refused (ADR 0054).
 *
 * The ledger key carries `localDate`, which is derived from the zone elected
 * per run — so a person who changes Device zone mid-day produces two keys and
 * would receive two Digests. This guard dedupes by PERSON instead, which is
 * the unit ADR 0050 reasons about.
 *
 * 18h is sized against the thing being protected: two consecutive same-slot
 * Digests are ~24h apart and the slot windows are three hours wide, so the
 * tightest legitimate gap is ~22h. MORNING and EVENING are checked
 * independently and sit 10-14h apart, so neither suppresses the other.
 */
export const DIGEST_SLOT_COOLDOWN_MS = 18 * 60 * 60 * 1000;
```

Inside `dispatchDigest`, in the existing `if (!force) { ... }` claim block, **before** the `create`:

```ts
    const recent = await db.digestDispatch.findFirst({
      where: {
        userId,
        tripId,
        slot,
        createdAt: { gt: new Date(Date.now() - DIGEST_SLOT_COOLDOWN_MS) },
      },
      select: { id: true },
    });
    if (recent) {
      return { sent: 0, skipped: true, reason: "already-sent" };
    }
```

The existing `@@unique([userId, tripId, localDate, slot])` and its `isUniqueViolation` catch stay exactly as they are — they still guard two overlapping runs claiming an identical key; the cooldown is the wider net for when the key itself moves.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run lib/digest-dispatch.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full gate**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all three clean.

- [ ] **Step 6: Commit**

```bash
git add lib/digest-dispatch.ts lib/digest-dispatch.test.ts
git commit -m "fix(digest): one digest per person per slot (CD-04)"
```

---

### Task 5: CD-07 + CD-16 — the Checklist cap stops dropping lines silently

Five overdue Checklist items render as exactly two with no "+3 more" anywhere, because the per-section cap drops lines before the global `+N more` is computed. `CD-16` (the `CONTEXT.md` wording) lands in this same commit — it describes the behaviour this task ships.

**Files:**
- Modify: `lib/digest.ts` (`collectLines` ~line 155-176, `buildDigest` ~line 178-192)
- Modify: `CONTEXT.md` (the **Digest** entry, ~line 190)
- Test: `lib/digest.test.ts`

**Interfaces:**
- Produces: `collectLines` returns `{ lines, paymentLineCount, droppedCount }`. It is module-private; only `buildDigest` consumes it.

- [ ] **Step 1: Write the failing test**

```ts
it("counts checklist lines dropped by the per-section cap in the tail", () => {
  const payload = buildDigest(
    makeDigestInput({
      slot: "EVENING",
      checklist: [
        { label: "Passport" },
        { label: "Adapters" },
        { label: "Insurance" },
        { label: "Currency" },
        { label: "Sunscreen" },
      ],
    }),
  );

  expect(payload?.body).toContain("+3 more");
});
```

Read `lib/digest.test.ts` first and build the input with whatever factory or literal shape the file already uses — `makeDigestInput` above is a stand-in for that existing helper, and the checklist entry shape must match `DigestChecklistLine`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run lib/digest.test.ts`
Expected: FAIL — five checklist items produce five lines, two survive the section cap, total lines stay under `DIGEST_MAX_LINES`, so no tail is emitted at all.

- [ ] **Step 3: Carry the dropped count through**

In `lib/digest.ts`, change `collectLines` to report what it threw away:

```ts
function collectLines(input: DigestInput): {
  lines: string[];
  paymentLineCount: number;
  droppedCount: number;
} {
  const lines: string[] = [];
  let paymentLineCount = 0;
  let droppedCount = 0;
```

and in the `EVENING` branch, replace the checklist loop with:

```ts
    // The 2-line budget stays: Checklist items reappear nightly until done, so
    // they must not crowd out the schedule/reminders/payments above them. What
    // changes is that the excess is COUNTED rather than silently discarded —
    // the global tail below has no other way to see it (CD-07).
    droppedCount += Math.max(0, input.checklist.length - DIGEST_MAX_CHECKLIST_LINES);
    for (const item of input.checklist.slice(0, DIGEST_MAX_CHECKLIST_LINES)) {
      lines.push(formatChecklist(item));
    }
```

Return `{ lines, paymentLineCount, droppedCount }`.

In `buildDigest`, replace the capping block:

```ts
  const { lines, paymentLineCount, droppedCount } = collectLines(input);
  if (lines.length === 0) return null;

  // One tail, one meaning: something was left out. It counts both what the
  // line budget ate and what the per-section Checklist cap dropped before the
  // budget ever saw it — otherwise five overdue items render as two and the
  // Digest quietly claims that is all there was (CD-07).
  const overflow = Math.max(0, lines.length - DIGEST_MAX_LINES) + droppedCount;
  const capped =
    overflow > 0
      ? [...lines.slice(0, DIGEST_MAX_LINES), `+${overflow} more`]
      : lines;
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run lib/digest.test.ts`
Expected: PASS. Existing tests that assert the old `+N more` arithmetic may need their expected numbers updated — only where a dropped Checklist line genuinely exists; if an existing expectation changes and no Checklist item was dropped, that is a real regression, not a test to update.

- [ ] **Step 5: Correct `CONTEXT.md`'s Digest entry (CD-16)**

In the **Digest** entry, the sentence beginning "It is ordered by what is most costly to lose..." currently describes a single global cap. Extend that sentence's tail so it also names the per-section Checklist limit and the fact that the tail counts it. Replace "...then **Checklist** items (which reappear nightly until done, and so give way first)." with:

```
...then **Checklist** items (which reappear nightly until done, and so give way
first, and of which at most two ever appear however many are overdue). The
count at the end says how much was left out, whether it fell off the end or was
held back by that two-line limit.
```

Keep it glossary prose — no file names, no constants, no implementation detail.

- [ ] **Step 6: Run the full gate**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all three clean.

- [ ] **Step 7: Commit**

```bash
git add lib/digest.ts lib/digest.test.ts CONTEXT.md
git commit -m "fix(digest): count dropped checklist lines (CD-07)"
```

---

### Task 6: CD-03 — a shortened Stop hands its Item to the Stop that still covers the day

Implements ADR 0055. **Narrow by decision:** rule 4 extends into the un-slot path *only* where the shift leaves the Item's calendar date unchanged — i.e. the Stop shortened away from a day the Item still sits on. Where the whole Stop **moves**, an Item that falls outside the new span still un-slots. Do not generalise this; the full extension was declined, not deferred.

**Files:**
- Modify: `lib/itinerary.ts` (`stopForDate` — widen to a generic structural signature)
- Modify: `lib/payload-shift.ts` (`ItemShift`, `shiftItemDates`)
- Modify: `server/actions/stop-flow.ts` (`shiftStopPayloadTx`, line 112-131)
- Test: `lib/payload-shift.test.ts`

**Interfaces:**
- Consumes: `stopForDate(stops, dateISO)` — currently `(stops: ItineraryStop[], dateISO: string) => ItineraryStop | null`.
- Produces:
  - `stopForDate<T extends { arriveDate: string; departDate: string }>(stops: readonly T[], dateISO: string): T | null` — same tie-break, structurally typed so `payload-shift` can call it without importing Prisma or `ItineraryStop`.
  - `ItemShift` gains `stopId?: string` — present **only** on a re-file.
  - `shiftItemDates(items, oldArrive, newArrive, newDepart, coveringStops = [])` — the fifth parameter defaults to `[]`, which reproduces today's behaviour exactly, so existing call sites and tests keep compiling.

- [ ] **Step 1: Write the failing test**

In `lib/payload-shift.test.ts`:

```ts
it("re-files an item onto the stop that still covers its day when a stop shortens", () => {
  // Munich 5-10, Strasbourg 10-12, a dinner on the 10th owned by Munich.
  // Shorten Munich to 5-9: the dinner's date does not move, and Strasbourg
  // still covers the 10th (ADR 0055).
  const shifts = shiftItemDates(
    [{ id: "dinner", date: "2026-05-10" }],
    "2026-05-05",
    "2026-05-05",
    "2026-05-09",
    [
      { id: "munich", arriveDate: "2026-05-05", departDate: "2026-05-09" },
      { id: "strasbourg", arriveDate: "2026-05-10", departDate: "2026-05-12" },
    ],
  );

  expect(shifts).toEqual([
    { id: "dinner", date: "2026-05-10", prevDate: "2026-05-10", stopId: "strasbourg" },
  ]);
});

it("still un-slots when no stop covers the day", () => {
  const shifts = shiftItemDates(
    [{ id: "dinner", date: "2026-05-10" }],
    "2026-05-05",
    "2026-05-05",
    "2026-05-09",
    [{ id: "munich", arriveDate: "2026-05-05", departDate: "2026-05-09" }],
  );

  expect(shifts).toEqual([
    { id: "dinner", date: null, prevDate: "2026-05-10" },
  ]);
});

it("still un-slots when the whole stop moves, even if another stop covers the old day", () => {
  // Munich 5-10 becomes 12-17. The dinner's date WOULD move, so rule 4 does
  // not apply and it un-slots rather than being stranded on the old dates.
  const shifts = shiftItemDates(
    [{ id: "dinner", date: "2026-05-10" }],
    "2026-05-05",
    "2026-05-12",
    "2026-05-13",
    [{ id: "strasbourg", arriveDate: "2026-05-10", departDate: "2026-05-11" }],
  );

  expect(shifts).toEqual([
    { id: "dinner", date: null, prevDate: "2026-05-10" },
  ]);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run lib/payload-shift.test.ts`
Expected: FAIL on the first case — `shiftItemDates` takes four parameters and un-slots the dinner to `date: null`.

- [ ] **Step 3: Widen `stopForDate`**

In `lib/itinerary.ts`, change the signature only — the body is already structural and needs no edit:

```ts
export function stopForDate<T extends { arriveDate: string; departDate: string }>(
  stops: readonly T[],
  dateISO: string,
): T | null {
```

- [ ] **Step 4: Implement the narrow re-file**

In `lib/payload-shift.ts`, import `stopForDate` and extend:

```ts
import { stopForDate } from "./itinerary";

export interface ItemShift {
  id: string;
  date: string | null;
  prevDate: string;
  /** Set only when the Item is re-filed onto a different Stop (ADR 0055). */
  stopId?: string;
}

/** The minimum a Stop must expose to be asked whether it covers a day. */
export interface CoveringStop {
  id: string;
  arriveDate: string;
  departDate: string;
}

export function shiftItemDates(
  items: readonly { id: string; date: string | null }[],
  oldArrive: string,
  newArrive: string,
  newDepart: string,
  coveringStops: readonly CoveringStop[] = [],
): ItemShift[] {
  const shifts: ItemShift[] = [];
  const maxOffset = nightsBetween(newArrive, newDepart);
  // ADR 0055 extends rule 4 into the un-slot path ONLY where this Stop's
  // arrive date has not moved — i.e. it shortened away from a day the Item
  // still sits on, and that day is still that day. When the whole Stop moves,
  // every Item's date moves with it (ADR 0038) and an Item that falls off the
  // end has no calendar day left to be re-filed by; stranding it on the old
  // dates, re-filed onto an unrelated Stop, is worse than un-slotting.
  const dateIsUnmoved = newArrive === oldArrive;
  for (const item of items) {
    if (item.date == null) continue;
    const offset = daysBetween(oldArrive, item.date);
    const next = offset < 0 || offset > maxOffset ? null : addDays(newArrive, offset);
    if (next === null && dateIsUnmoved) {
      const owner = stopForDate(coveringStops, item.date);
      if (owner) {
        shifts.push({ id: item.id, date: item.date, prevDate: item.date, stopId: owner.id });
        continue;
      }
    }
    if (next !== item.date) shifts.push({ id: item.id, date: next, prevDate: item.date });
  }
  return shifts;
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run lib/payload-shift.test.ts`
Expected: PASS, all three cases.

- [ ] **Step 6: Feed the covering Stops in, and write the re-file**

In `server/actions/stop-flow.ts`, `shiftStopPayloadTx` must now learn which Stops cover which days, and must persist `stopId` when one is returned. Read the plan's scheduled Stops from the same transaction, scoped to the re-dated Stop's own plan, and pass them with the re-dated Stop carrying its **new** dates:

```ts
export async function shiftStopPayloadTx(
  tx: Prisma.TransactionClient,
  stop: { id: string; arriveDate: string },
  newArrive: string,
  newDepart: string,
): Promise<PayloadShiftResult> {
  const self = await tx.stop.findUnique({
    where: { id: stop.id },
    select: { tripId: true, forkId: true },
  });
  // Scheduled Stops of this Stop's own plan, with the re-dated Stop carrying
  // its NEW span — so it is never chosen as the new owner of a day it has
  // just stopped covering (ADR 0055).
  const coveringStops = self
    ? (
        await tx.stop.findMany({
          where: { tripId: self.tripId, forkId: self.forkId, arriveDate: { not: null } },
          select: { id: true, arriveDate: true, departDate: true },
        })
      )
        .filter((s): s is { id: string; arriveDate: string; departDate: string } =>
          s.arriveDate != null && s.departDate != null)
        .map((s) => (s.id === stop.id ? { ...s, arriveDate: newArrive, departDate: newDepart } : s))
    : [];

  const [items, accommodations] = await Promise.all([
    tx.item.findMany({ where: { stopId: stop.id, date: { not: null } }, select: { id: true, date: true } }),
    tx.accommodation.findMany({ where: { stopId: stop.id }, select: { id: true, checkIn: true, checkOut: true } }),
  ]);
  const itemShifts = shiftItemDates(items, stop.arriveDate, newArrive, newDepart, coveringStops);
  const accShifts = shiftAccommodationDates(accommodations, daysBetween(stop.arriveDate, newArrive));
  for (const s of itemShifts) {
    await tx.item.update({
      where: { id: s.id },
      // `stopId` is written only on a re-file, so a plain date shift keeps the
      // Item on its current Stop's Budget line exactly as before.
      data: { date: s.date, ...(s.stopId ? { stopId: s.stopId } : {}) },
    });
  }
```

Leave the rest of the function unchanged. Check `planScope` in `lib/plan-scope.ts` and use it instead of a raw `forkId` equality if that is how the codebase scopes plan queries elsewhere — match the existing convention in this file.

- [ ] **Step 7: Run the full gate**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all three clean. `server/actions/stops.test.ts` and `stop-flow` tests exercise the five `shiftStopPayloadTx` call sites — if any mock lacks `tx.stop.findUnique`/`findMany`, add it to the mock rather than changing the production code to avoid the query.

- [ ] **Step 8: Commit**

```bash
git add lib/itinerary.ts lib/payload-shift.ts lib/payload-shift.test.ts server/actions/stop-flow.ts
git commit -m "fix(stops): re-file items a shortened stop drops (CD-03)"
```

---

### Task 7: FN-05 — a Feedback note survives its author

Implements the 2026-09-21 amendment to ADR 0040. `authorId` becomes a plain snapshot column with no relation, and `authorName` records who wrote it — the same treatment `tripId`/`tripName` already get three lines above in the schema.

**Files:**
- Modify: `prisma/schema.prisma` (`model FeedbackNote` ~line 711, and the `User` model's back-relation)
- Create: `prisma/migrations/20260921010000_feedback_author_snapshot/migration.sql`
- Modify: `server/actions/feedback.ts` (`FeedbackNoteRow`, `VIEW_SELECT`, `toView`, the create path)
- Test: `server/actions/feedback.test.ts`

**Interfaces:**
- Produces: `FeedbackNote.authorName String?`; `FeedbackNote.authorId` keeps its type but loses its `@relation`. `toView` reads `row.authorName ?? "Traveller"` instead of `row.author.name ?? "Traveller"`.

**Note on Task 10:** that task renames the private `FeedbackNoteRow` in this same file. Whichever runs second will see the other's change — do not revert it.

- [ ] **Step 1: Write the failing test**

```ts
it("shows the snapshotted author name", () => {
  const view = toView(
    {
      id: "f1",
      body: "b",
      route: "/r",
      pageLabel: "Home",
      tripName: null,
      authorId: "gone",
      authorName: "Cam",
      status: "OPEN",
      authoredAt: new Date("2026-09-21T00:00:00Z"),
    },
    "someone-else",
  );

  expect(view.authorName).toBe("Cam");
  expect(view.canDelete).toBe(false);
});
```

If `toView` is not exported, export it — it is pure and this is the cheapest honest way to pin the mapping. Otherwise assert through `listFeedbackNotes` with a mocked `db.feedbackNote.findMany`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run server/actions/feedback.test.ts`
Expected: FAIL — `toView` reads `row.author.name` and throws on the missing `author` object.

- [ ] **Step 3: Change the schema**

In `prisma/schema.prisma`, `model FeedbackNote`:

```prisma
  /// Snapshots, deliberately NOT foreign keys: feedback outlives both the Trip
  /// it was written about and the Traveller who wrote it (ADR 0040, amended
  /// 2026-09-21). A deleted User cannot sign in, so their id can never match a
  /// viewer's — an orphaned note is admin-only without a rule for it.
  authorId   String
  authorName String?
```

Remove the `author User @relation(fields: [authorId], references: [id], onDelete: Cascade)` line from `FeedbackNote`, and remove the matching `feedbackNotes FeedbackNote[]` back-relation from `model User` (Prisma will not validate otherwise). Keep the existing `tripId`/`tripName` snapshot comment intact above them.

- [ ] **Step 4: Write the migration**

`prisma/migrations/20260921010000_feedback_author_snapshot/migration.sql`:

```sql
-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- authorName is nullable, so the still-running old build — which does not
-- write it — cannot violate a NOT NULL constraint; and dropping a foreign key
-- removes a restriction rather than adding one, so the old build's `author`
-- relation reads keep working (they join on the column, which remains).

-- AlterTable
ALTER TABLE "FeedbackNote" ADD COLUMN "authorName" TEXT;

-- Backfill from the authors who still exist.
UPDATE "FeedbackNote" AS f
SET "authorName" = u."name"
FROM "User" AS u
WHERE f."authorId" = u."id" AND f."authorName" IS NULL;

-- DropForeignKey
ALTER TABLE "FeedbackNote" DROP CONSTRAINT "FeedbackNote_authorId_fkey";
```

Verify the constraint name against an existing migration that created it — grep `prisma/migrations` for `FeedbackNote_authorId_fkey` and use whatever name is actually there.

- [ ] **Step 5: Update the read and write paths**

In `server/actions/feedback.ts`:
- `FeedbackNoteRow`: replace `author: { name: string | null }` with `authorName: string | null`.
- `VIEW_SELECT`: replace `author: { select: { name: true } }` with `authorName: true`.
- `toView`: `authorName: row.authorName ?? "Traveller",`.
- The create path (~line 103) writes `authorId: user.id` — add `authorName: user.name ?? null` alongside it, so every new note carries its snapshot. Confirm `requireUser()` returns `name`; if it does not, select it or read it from the session shape the file already has.

Leave `feedback.ts:125` (`where: { authorId: user.id }`) and `:150` (`note.authorId !== user.id`) **exactly as they are** — ADR 0046's visibility rule needs no special case, and adding one would be the divergence the amendment exists to avoid.

- [ ] **Step 6: Run the test and verify it passes**

Run: `npx vitest run server/actions/feedback.test.ts`
Expected: PASS

- [ ] **Step 7: Run the full gate**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all three clean. `npx prisma validate` is also worth running — it needs no database. Do **not** run `prisma migrate`.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations server/actions/feedback.ts server/actions/feedback.test.ts
git commit -m "feat(feedback): note survives its author (FN-05)"
```

---

### Task 8: SW-01 — a Feedback note can show as Pending and Sent at once

`lib/feedback-queue.ts`'s `write()` swallows a `localStorage.setItem` failure and returns the queue **unchanged**, so `removeFromQueue` can be a no-op while the component adds the note to Sent regardless. Same class as `FN-07`, one layer up.

**Files:**
- Modify: `components/feedback/feedback-launcher.tsx:445-446`
- Test: `components/feedback/feedback-launcher.test.tsx`

**Interfaces:**
- Consumes: `isQueued(queue, clientKey)` — already imported in this file and used a few lines above for `queued`.

- [ ] **Step 1: Write the failing test**

```tsx
it("does not list a note as sent when the queue removal was swallowed", async () => {
  // Storage is blocked: write() returns the queue unchanged, so the note is
  // still pending even though the server accepted it.
  removeFromQueueMock.mockReturnValue([
    { clientKey: "ck1", body: "hello", route: "/", pageLabel: "Home" },
  ]);
  createFeedbackNoteMock.mockResolvedValue({
    success: true,
    note: { id: "f1", body: "hello", authorName: "Cam", status: "OPEN" },
  });

  render(<FeedbackLauncher {...defaultProps} />);
  await sendANote("hello");

  expect(screen.getAllByText("hello")).toHaveLength(1);
});
```

Read the existing test file first and reuse its mocks, render helper and any `sendANote`-equivalent it already has; the names above are stand-ins for whatever that file establishes.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run components/feedback/feedback-launcher.test.tsx`
Expected: FAIL — the note renders twice, once in Pending and once in Sent.

- [ ] **Step 3: Verify the removal before trusting it**

In `components/feedback/feedback-launcher.tsx`, replace:

```ts
        setPending(removeFromQueue(note.clientKey));
        setSent((prev) => [...prev, result.note]);
```

with:

```ts
        // removeFromQueue goes through the queue module's write(), which
        // swallows a localStorage failure (quota, private mode) and returns
        // the queue UNCHANGED. Trusting it would render this note in both
        // Pending and Sent until the panel remounts. Same mistake FN-07 fixed
        // inside the flush loop; this is the component's own send path (SW-01).
        const after = removeFromQueue(note.clientKey);
        setPending(after);
        if (!isQueued(after, note.clientKey)) {
          setSent((prev) => [...prev, result.note]);
        }
```

The note stays in Pending and will be re-sent by the next flush; `clientKey` is `@unique`, so the server treats that as the duplicate it is.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run components/feedback/feedback-launcher.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full gate**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all three clean.

- [ ] **Step 6: Commit**

```bash
git add components/feedback/feedback-launcher.tsx components/feedback/feedback-launcher.test.tsx
git commit -m "fix(feedback): don't show a note pending and sent (SW-01)"
```

---

### Task 9: SW-02 — the one confusable `MapPin`

**Scope is one render site.** The operator settled the other ~20 decorative pins as a consistency call, not a defect, and `components/trip/help-legend.tsx` keeps its pin — it is what teaches the glyph. Do not touch any other file.

**Files:**
- Modify: `components/trip/home/phase-travelling.tsx` (~line 508 and the `MapLink` at ~519)
- Test: `components/trip/home/phase-travelling.test.tsx`

**Interfaces:** none.

- [ ] **Step 1: Write the failing test**

```tsx
it("renders no map link for a stop with no coordinates", () => {
  render(
    <PhaseTravelling
      {...defaultProps}
      stops={[{ id: "s1", name: "Munich", country: "Germany", lat: null, lng: null }]}
    />,
  );

  expect(screen.queryByRole("link", { name: /open in maps/i })).toBeNull();
});
```

Match the accessible name to whatever `MapLink` actually renders — read `components/trip/map-link.tsx` (or wherever it lives) and use its real label. Reuse the test file's existing `defaultProps`/render helper.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run components/trip/home/phase-travelling.test.tsx`
Expected: FAIL — a link renders, because `MapLink` gets an always-present `label` and `lib/maps.ts:31` falls back to it when there are no coordinates.

- [ ] **Step 3: Remove the decorative pin and gate the link**

In the "Where you are" block, delete the decorative `<MapPin className="size-5 shrink-0 text-primary" aria-hidden="true" />` and gate the `MapLink` on real coordinates, copying the pattern and reasoning already in `components/trip/stop-card.tsx:337-345`:

```tsx
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-soft">
                {/* No decorative pin here: MapLink below renders the real one,
                    and help-legend.tsx teaches that glyph as "has a location"
                    (HG-02/HG-10, missed instance found as SW-02). */}
                <div className="flex min-w-0 flex-1 items-center gap-2">
```

and, for the link — resolve the stop once rather than calling `stops.find` twice:

```tsx
                {(() => {
                  const located = stops.find((s) => s.id === effectiveStop.id);
                  // Gate on real coordinates explicitly: MapLink's own fallback
                  // (address || label) would otherwise treat the name/country
                  // label as a searchable "location" for every stop, firing the
                  // pin even where no location is on record.
                  if (located?.lat == null || located?.lng == null) return null;
                  return (
                    <MapLink
                      lat={located.lat}
                      lng={located.lng}
                      label={
                        effectiveStop.country
                          ? `${effectiveStop.name}, ${effectiveStop.country}`
                          : effectiveStop.name
                      }
                    />
                  );
                })()}
```

Preserve any props the existing `MapLink` call passes that are not shown here (e.g. `className`). Remove the `MapPin` import if it becomes unused — `npm run lint` will say.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run components/trip/home/phase-travelling.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full gate**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all three clean.

- [ ] **Step 6: Commit**

```bash
git add components/trip/home/phase-travelling.tsx components/trip/home/phase-travelling.test.tsx
git commit -m "fix(home): reserve the pin for a real location (SW-02)"
```

---

### Task 10: SW-04 — one name, one type

`lib/feedback-inbox.ts:24` exports `FeedbackNoteRow`; `server/actions/feedback.ts:36` declares a different private type with the same name. Nothing breaks today; a grep or an autocomplete finds two unrelated answers.

**Files:**
- Modify: `server/actions/feedback.ts` (the private `type FeedbackNoteRow` and its uses in the same file)

**Interfaces:** the exported `FeedbackNoteRow` in `lib/feedback-inbox.ts` is **unchanged** — `scripts/feedback-pull.ts` reads it.

**Note on Task 7:** that task edits this same type's fields. Whichever runs second sees the other's change — rename what is there, do not restore an older shape.

- [ ] **Step 1: Rename**

In `server/actions/feedback.ts`, rename the private `type FeedbackNoteRow` to `FeedbackNoteQueryRow` and update every reference in that file (`toView`'s parameter, and any other annotation). The type is not exported, so no other file can be affected.

- [ ] **Step 2: Verify nothing else referenced it**

Run: `grep -rn "FeedbackNoteRow" --include=*.ts --include=*.tsx .` (excluding `node_modules`)
Expected: hits only in `lib/feedback-inbox.ts` and `scripts/feedback-pull.ts`.

- [ ] **Step 3: Run the full gate**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all three clean. `tsc` is the real check here — a missed reference is a compile error.

- [ ] **Step 4: Commit**

```bash
git add server/actions/feedback.ts
git commit -m "refactor(feedback): one name per type (SW-04)"
```

---

### Task 11: The four deferred minors from the 2026-09-21 sweep

None is a defect in shipped behaviour; all four are test-or-comment honesty, recorded so they are not lost.

**Files:**
- Modify: `server/actions/forks.test.ts:588` and the `promoteFork` block around `:1391`
- Modify: `lib/cron-health.test.ts:54`
- Modify: `app/globals.css:236-238`
- Modify: `server/actions/stop-flow.ts` (a comment beside the `FOR UPDATE` entry points)

**Interfaces:** none.

- [ ] **Step 1: Pin the query wiring `AB-03` exists to fix**

At `server/actions/forks.test.ts:588`, replace `expect(currentTripTimezoneMock).toHaveBeenCalled()` with `expect(currentTripTimezoneMock).toHaveBeenCalledWith(stops)` — using whatever the surrounding test actually names that variable. Add the equivalent assertion to the `promoteFork` block around `:1391`, which currently makes no `currentTripTimezone` assertion at all.

- [ ] **Step 2: Make the cron-health comment true**

`lib/cron-health.test.ts:54`'s comment names `Math.max(0, …)`'s ran-backwards-clock guard, but every fixture in the file is at or before `now`, so only the `diff === 0` case is exercised. Add the missing case rather than weakening the comment:

```ts
it("reads a future lastRunAt as just now rather than negative hours", () => {
  const now = new Date("2026-09-21T12:00:00Z");
  expect(formatLastRun(new Date("2026-09-21T13:00:00Z"), now)).toBe("last ran just now");
});
```

- [ ] **Step 3: Drop the word popovers**

`app/globals.css:236-238` says `tp-fade-in` stays at 150ms "for dialogs and popovers". Only `components/ui/dialog.tsx:21` uses it; popovers use `tp-pop-in`/`tp-pop-out`. Edit the comment to say "for dialogs" only.

- [ ] **Step 4: Write down the FOR UPDATE skip-justification**

Sweep task 10 deliberately left `moveStop` and its `FOR UPDATE` neighbours out of the `expectAccessCheckedBeforeWrite` rollout. That reasoning was proved by a reviewer's probe and never written into the repo. Add a comment beside those entry points in `server/actions/stop-flow.ts` recording *why* they are excluded — that they acquire their access check through the locking path rather than the helper, so the helper's assertion does not apply. Read the `lockPlanStopsTx` doc comment and the callers before writing it, and state only what you can confirm from the code.

- [ ] **Step 5: Run the full gate**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all three clean.

- [ ] **Step 6: Commit**

```bash
git add server/actions/forks.test.ts lib/cron-health.test.ts app/globals.css server/actions/stop-flow.ts
git commit -m "test: close the sweep's four deferred minors"
```

---

### Task 12: Drain `docs/open-follow-ups.md`

The drain mechanism whose absence created the seven-document mess. **Run this task last**, after every other task's commit exists, so each entry can cite a real hash.

**Files:**
- Modify: `docs/open-follow-ups.md`

**Interfaces:** none.

- [ ] **Step 1: Collect the commits**

Run: `git log --oneline main..HEAD`
Record the hash for each of SW-05, CD-02, CD-06, CD-04, CD-07/CD-16, CD-03, FN-05, SW-01, SW-02, SW-04.

- [ ] **Step 2: Move the closed items to the Struck register**

Strike and move, each with its commit hash and one line on what actually shipped: `SW-05`, `SW-01`, `SW-04`, `FN-05`, `CD-16`, and the `SW-02` confusable instance. Move `CD-02`, `CD-03`, `CD-04`, `CD-06`, `CD-07` out of *Needs a decision* and into *Struck* as well — each was decided **and** built today.

Where a fix shipped differently from what the entry predicted, say so. Three did:
- **CD-02** — the entry says no third option exists. One did: the client mints a fresh endpoint (ADR 0053).
- **CD-04** — built as an 18h per-person cooldown on the existing ledger, not as either listed option (ADR 0054).
- **CD-03** — built narrow, not as the full option (a) (ADR 0055).

- [ ] **Step 3: Move `FP-07` and the `SW-02` remainder to Settled**

Add both to *Settled — do not re-raise*, with the reasoning, not just the verdict:

```markdown
### FP-07 · A desktop toast over the Compare table's frozen label column

- **Settled 2026-09-21.** The overlap is transient and readable once the toast
  clears, and the planned `md:mb-24` would buy a **permanent 6rem dead band**
  under the table on every desktop view to fix it. `FP-15` rules out the
  bottom-right (it belongs to the Feedback trigger and its docked panel), so
  there is no free direction to move a toast. Declined deliberately: a
  permanent cost for a transient annoyance.

### SW-02 (remainder) · The ~20 non-confusable decorative `MapPin` uses

- **Settled 2026-09-21.** The one genuinely confusable instance,
  `phase-travelling.tsx:508`, was fixed as a missed instance of `HG-02`/`HG-10`
  (see the Struck register). The rest sit nowhere near a real `MapLink`, so
  none is *confusable* — they are a consistency preference, and stripping pins
  across 16 nav, palette, summary, print and share surfaces buys no behavioural
  change. **`components/trip/help-legend.tsx` keeps its pin regardless:** it is
  the legend that teaches what the glyph means, and "fixing" it would break the
  only place that explains the icon.
```

- [ ] **Step 4: Rewrite the header counts and the preamble**

The *Open items* section should now hold **nothing**. Update the trust-statement table, the total, and the dated preamble paragraphs to describe today's branch (`chore/close-the-open-backlog`) — what was decided, what was built, and that the *Blocked* section is untouched and still needs a human with a running app, a real device, a calendar client or a browser.

Add today's process lesson to *Three process lessons, carried forward* (it becomes four):

```markdown
- **A "there is no third option" note in a backlog entry is a claim, not a
  finding.** Three of the five decisions closed on 2026-09-21 shipped as an
  option their own entry did not list, and two of those entries stated
  explicitly that only two options existed (`CD-02`, `CD-04`). Each third
  option came from reading the code the entry cited rather than the entry
  itself. When an entry poses a binary, re-derive it before choosing a side.
```

- [ ] **Step 5: Verify no stale claims survive**

Run: `grep -n "Open items\|8 items\|132\|five more await" docs/open-follow-ups.md`
Check every hit reflects the post-drain reality. The document's own warning — *trust an entry's verdict, do not trust its scope line* — applies to the edits you have just made.

- [ ] **Step 6: Commit**

```bash
git add docs/open-follow-ups.md
git commit -m "docs(follow-ups): drain the open backlog"
```

---

## Deferred to the operator — not in this plan

- **Running either migration.** `20260921000000_cron_heartbeat_last_success` and `20260921010000_feedback_author_snapshot` land as files only. Both are additive on reads and writes; neither is applied here.
- **Merging this branch, and deploying.** Always the operator's call.
- **The 12 Blocked items.** They need a running app, a real device, a calendar client, or a browser. None is touched, and none may be reported as verified.
