# Fast-Follow Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two genuinely-open post-deploy fast-follows — the concurrent-reorder race and the non-atomic cost+FX-rate write — and correct the stale HANDOFF doc (two of its four "known limitations" are already fixed).

**Architecture:** Reorders (`moveStop`, `reorderChecklistItem`) move from *read-outside / write-in-batch-transaction* to an **interactive transaction with pessimistic locking** — `SELECT … FOR UPDATE` locks and re-reads the list inside the tx, so a concurrent reorder blocks and re-reads the corrected order. The FX/cost path splits `getRateForTrip` into `resolveRateForTrip` (read + network fetch, **no writes**, returns a persist descriptor) + `persistRate` (the cache write, accepts `db` *or* a `tx`); `createCost`/`updateCost` resolve the rate **before** opening a transaction, then persist the rate and write the cost **together** in one interactive transaction. `getRateForTrip` keeps its exact external contract by composing the two, so `/api/fx` and `rates.ts` are untouched.

**Tech Stack:** Next.js 16, Prisma 7 + `@prisma/adapter-pg` (Postgres everywhere — ADR 0005), Vitest. All action tests mock `@/lib/db`; there is **no Postgres in this sandbox**, so unit tests assert *call shape* (a `FOR UPDATE` query is issued; persist+create share one tx). Real lock behaviour is exercised against Postgres in CI/prod.

**Branch:** `feat/fast-follow-hardening` (already created off `main`). Do NOT touch `main`, switch branches, or deploy.

**No schema change / no migration:** the fix is runtime SQL (`FOR UPDATE`), not DDL. Deliberately **not** `@@unique([tripId, sortOrder])` — it would be violated transiently mid-swap.

---

### Task 1: ADR 0007 — concurrency conventions

**Files:**
- Create: `docs/adr/0007-concurrency-locking-and-tx-boundaries.md`

- [ ] **Step 1: Match the house ADR format**

Read `docs/adr/0006-motion-library-for-content-and-route-motion.md` to copy the project's ADR heading/section style (status line, etc.).

- [ ] **Step 2: Write `docs/adr/0007-concurrency-locking-and-tx-boundaries.md`**

Use the house format from Step 1 for the headings; the content is:

```markdown
# 0007 — Concurrency: lock-then-swap reorders; network I/O outside DB transactions

Status: Accepted

## Context

Two post-deploy fast-follows concern write correctness now that the app is
multi-user in production (Postgres everywhere — see ADR 0005):

1. **List reorders.** Stops and pre-trip/packing ChecklistItems are ordered by an
   integer `sortOrder` that is swapped between two adjacent rows on each move. The
   original `moveStop` / `reorderChecklistItem` read the list *outside* the
   transaction and wrapped only the two writes in a batch `$transaction([...])`.
   Two travellers reordering the same list at the same instant could both read the
   same pre-state and produce a transposed / lost-update ordering. Low-severity
   (re-dragging fixes it; no data loss) but real.

2. **Cost + FX snapshot.** Creating a Cost snapshots an FX rate. Resolving the rate
   makes a network call (Frankfurter) that also caches the result in `ExchangeRate`.
   The cache write and the Cost write were two separate statements; a failure
   between them left a harmless-but-untracked cached rate.

## Decision

1. **Reorders use pessimistic locking.** `moveStop` / `reorderChecklistItem` open an
   interactive transaction, issue `SELECT … FOR UPDATE` over the affected list
   (Stops by `tripId`; ChecklistItems by `tripId` + `kind`) to lock and re-read the
   rows, compute the swap from the *locked* snapshot, and write — all inside the one
   transaction. A concurrent reorder blocks on the lock, then re-reads the corrected
   order. Raw SQL is used for the lock because Prisma cannot express `FOR UPDATE` on
   `findMany`. We deliberately do **not** add `@@unique([tripId, sortOrder])` — it
   would be violated transiently mid-swap.

2. **Network I/O stays out of DB transactions.** FX rate resolution (the network
   fetch) happens *before* any transaction is opened. `getRateForTrip` is split into
   `resolveRateForTrip` (read + fetch, no writes, returns a `persist` descriptor)
   and `persistRate` (the cache upsert, accepting either `db` or a `tx`).
   `createCost` / `updateCost` resolve the rate first, then persist the rate and
   write the cost together in one interactive transaction. `getRateForTrip` keeps
   its exact previous behaviour by composing the two, so `/api/fx` and `rates.ts`
   are unaffected.

## Consequences

- Reorders are serialized per-list and correct under concurrency, at the cost of one
  extra locked read and Postgres-only `FOR UPDATE` semantics (fine — all environments
  are Postgres).
- Raw SQL appears in two server actions; it is minimal and documented inline.
- A cost-write failure no longer leaves a cached rate behind: the cache updates only
  when the cost is actually written.
- Tests assert call shape (a `FOR UPDATE` query is issued; persist + create share one
  tx) because the test sandbox has no Postgres; true lock behaviour is exercised
  against Postgres in CI/prod.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0007-concurrency-locking-and-tx-boundaries.md
git commit -m "docs(adr): 0007 concurrency — pessimistic reorder locks + tx boundaries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Fix the concurrent-reorder race in `moveStop`

**Files:**
- Modify: `server/actions/stops.ts` (`moveStop`, ~lines 178-217)
- Test: `server/actions/stops.test.ts` (mock harness + the `moveStop` describe block)

- [ ] **Step 1: Upgrade the test harness to support interactive transactions**

In `server/actions/stops.test.ts`, the `vi.hoisted(...)` block currently builds `transactionMock` for the **array** form only. Replace the whole `vi.hoisted(() => { ... })` call (currently ~lines 13-54) with this version — it adds a `queryRawMock` and makes `transactionMock` invoke a function-form callback with a `tx` exposing `$queryRaw` + `stop.update`:

```ts
const {
  requireTripAccessMock,
  revalidatePathMock,
  geocodePlaceMock,
  stopFindFirstMock,
  stopFindUniqueMock,
  stopFindManyMock,
  stopCreateMock,
  stopUpdateMock,
  stopDeleteMock,
  queryRawMock,
  transactionMock,
} = vi.hoisted(() => {
  const stopFindFirstMock = vi.fn();
  const stopFindUniqueMock = vi.fn();
  const stopFindManyMock = vi.fn();
  const stopCreateMock = vi.fn();
  const stopUpdateMock = vi.fn();
  const stopDeleteMock = vi.fn();
  const queryRawMock = vi.fn();
  const transactionMock = vi.fn(async (arg: unknown) => {
    // Interactive form: invoke the callback with a tx client.
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)({
        $queryRaw: queryRawMock,
        stop: { update: stopUpdateMock },
      });
    }
    // Array form (kept for any batch-transaction callers).
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg;
  });

  return {
    requireTripAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    }),
    revalidatePathMock: vi.fn(),
    geocodePlaceMock: vi.fn().mockResolvedValue(null),
    stopFindFirstMock,
    stopFindUniqueMock,
    stopFindManyMock,
    stopCreateMock,
    stopUpdateMock,
    stopDeleteMock,
    queryRawMock,
    transactionMock,
  };
});
```

The `vi.mock("@/lib/db", ...)` block already wires `$transaction: transactionMock` and `stop.update: stopUpdateMock` — leave it as-is (no `db.$queryRaw` needed; the action uses `tx.$queryRaw`).

- [ ] **Step 2: Replace the `moveStop` tests with lock-aware ones**

Find the existing `describe("moveStop", ...)` block in `stops.test.ts` and replace it wholesale with:

```ts
describe("moveStop", () => {
  const stops = [
    { id: "stop-1", sortOrder: 0 },
    { id: "stop-2", sortOrder: 1 },
    { id: "stop-3", sortOrder: 2 },
  ];

  it("locks the trip's stops with FOR UPDATE inside a transaction before swapping", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "stop-2", tripId: "trip-1", sortOrder: 1 });
    queryRawMock.mockResolvedValue(stops);
    stopUpdateMock.mockResolvedValue({});

    const result = await moveStop("stop-2", "up");

    expect(result.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(queryRawMock).toHaveBeenCalledOnce();
    const sqlParts = queryRawMock.mock.calls[0][0] as string[];
    expect(sqlParts.join(" ")).toContain("FOR UPDATE");
    // First bound value is the tripId.
    expect(queryRawMock.mock.calls[0][1]).toBe("trip-1");
  });

  it("swaps sortOrder with the previous stop when moving up", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "stop-2", tripId: "trip-1", sortOrder: 1 });
    queryRawMock.mockResolvedValue(stops);
    stopUpdateMock.mockResolvedValue({});

    await moveStop("stop-2", "up");

    expect(stopUpdateMock).toHaveBeenCalledTimes(2);
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "stop-2" }, data: { sortOrder: 0 } });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "stop-1" }, data: { sortOrder: 1 } });
  });

  it("swaps sortOrder with the next stop when moving down", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "stop-2", tripId: "trip-1", sortOrder: 1 });
    queryRawMock.mockResolvedValue(stops);
    stopUpdateMock.mockResolvedValue({});

    await moveStop("stop-2", "down");

    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "stop-2" }, data: { sortOrder: 2 } });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "stop-3" }, data: { sortOrder: 1 } });
  });

  it("is a no-op when already at the top", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1", sortOrder: 0 });
    queryRawMock.mockResolvedValue(stops);

    const result = await moveStop("stop-1", "up");

    expect(result.success).toBe(true);
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("is a no-op when already at the bottom", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "stop-3", tripId: "trip-1", sortOrder: 2 });
    queryRawMock.mockResolvedValue(stops);

    const result = await moveStop("stop-3", "down");

    expect(result.success).toBe(true);
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the new tests — expect FAIL**

```bash
npm run test -- stops.test.ts
```
Expected: the `moveStop` tests fail (old implementation calls `db.stop.findMany` / array-form `$transaction`, so `queryRawMock` is never called).

- [ ] **Step 4: Rewrite `moveStop` to lock-then-swap**

In `server/actions/stops.ts`, replace the body of `moveStop` (keep the signature and the leading `const stop = await requireStopAccess(stopId);`) with:

```ts
export async function moveStop(
  stopId: string,
  direction: "up" | "down",
): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);

  await db.$transaction(async (tx) => {
    // Lock the trip's stops in sortOrder. A concurrent reorder blocks here until
    // we commit, then re-reads the corrected order — closing the read-then-swap
    // race. Prisma can't express SELECT ... FOR UPDATE on findMany, so use raw SQL.
    const siblings = await tx.$queryRaw<Array<{ id: string; sortOrder: number }>>`
      SELECT "id", "sortOrder"
      FROM "Stop"
      WHERE "tripId" = ${stop.tripId}
      ORDER BY "sortOrder" ASC
      FOR UPDATE
    `;

    const idx = siblings.findIndex((s) => s.id === stopId);
    if (idx === -1) return; // stop vanished mid-flight — nothing to do

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return; // no neighbour — no-op

    const current = siblings[idx];
    const neighbour = siblings[swapIdx];

    await tx.stop.update({
      where: { id: current.id },
      data: { sortOrder: neighbour.sortOrder },
    });
    await tx.stop.update({
      where: { id: neighbour.id },
      data: { sortOrder: current.sortOrder },
    });
  });

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}
```

- [ ] **Step 5: Run the tests — expect PASS**

```bash
npm run test -- stops.test.ts
```
Expected: all stops tests pass.

- [ ] **Step 6: Full gate**

```bash
npx tsc --noEmit && npm run test && npm run build
```
Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add server/actions/stops.ts server/actions/stops.test.ts
git commit -m "fix(stops): lock-then-swap reorder to close the concurrent-move race

moveStop now SELECT ... FOR UPDATEs the trip's stops inside an interactive
transaction and computes the swap from the locked snapshot, so two simultaneous
reorders can no longer transpose. See ADR 0007.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Fix the concurrent-reorder race in `reorderChecklistItem`

**Files:**
- Modify: `server/actions/checklists.ts` (`reorderChecklistItem`, ~lines 221-271)
- Test: `server/actions/checklists.test.ts` (mock harness + the `reorderChecklistItem` describe block)

- [ ] **Step 1: Upgrade the checklist test harness for interactive transactions**

In `server/actions/checklists.test.ts`, replace the whole `vi.hoisted(() => ({ ... }))` call (currently ~lines 9-49 — note it returns an *object literal*) with this closure-style version that adds `queryRawMock` + a function-aware `transactionMock` whose `tx` exposes `$queryRaw` + `checklistItem.update`:

```ts
const {
  requireTripAccessMock,
  requireUserMock,
  revalidatePathMock,
  notFoundMock,
  checklistItemFindUniqueMock,
  checklistItemFindFirstMock,
  checklistItemFindManyMock,
  checklistItemCreateMock,
  checklistItemCreateManyMock,
  checklistItemUpdateMock,
  checklistItemDeleteMock,
  tripMemberFindUniqueMock,
  packingTemplateFindUniqueMock,
  packingTemplateCreateMock,
  packingTemplateDeleteMock,
  queryRawMock,
  transactionMock,
} = vi.hoisted(() => {
  const checklistItemUpdateMock = vi.fn();
  const queryRawMock = vi.fn();
  const transactionMock = vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)({
        $queryRaw: queryRawMock,
        checklistItem: { update: checklistItemUpdateMock },
      });
    }
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg;
  });

  return {
    requireTripAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    }),
    requireUserMock: vi.fn().mockResolvedValue({ id: "user-1" }),
    revalidatePathMock: vi.fn(),
    notFoundMock: vi.fn(() => {
      throw new Error("NOT_FOUND");
    }),
    checklistItemFindUniqueMock: vi.fn(),
    checklistItemFindFirstMock: vi.fn(),
    checklistItemFindManyMock: vi.fn(),
    checklistItemCreateMock: vi.fn(),
    checklistItemCreateManyMock: vi.fn(),
    checklistItemUpdateMock,
    checklistItemDeleteMock: vi.fn(),
    tripMemberFindUniqueMock: vi.fn(),
    packingTemplateFindUniqueMock: vi.fn(),
    packingTemplateCreateMock: vi.fn(),
    packingTemplateDeleteMock: vi.fn(),
    queryRawMock,
    transactionMock,
  };
});
```

Then in the `vi.mock("@/lib/db", () => ({ db: { ... } }))` block, change the checklistItem `$transaction` wiring from:

```ts
    $transaction: (ops: unknown[]) => Promise.all(ops),
```
to:
```ts
    $transaction: transactionMock,
```

- [ ] **Step 2: Replace the `reorderChecklistItem` tests**

Find the existing `describe("reorderChecklistItem", ...)` block and replace it wholesale with:

```ts
describe("reorderChecklistItem", () => {
  const items = [
    { id: "ci-1", sortOrder: 0 },
    { id: "ci-2", sortOrder: 1 },
    { id: "ci-3", sortOrder: 2 },
  ];

  it("locks the (trip, kind) list with FOR UPDATE inside a transaction before swapping", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ id: "ci-2", tripId: "trip-1", kind: "PRETRIP" });
    queryRawMock.mockResolvedValue(items);
    checklistItemUpdateMock.mockResolvedValue({});

    const result = await reorderChecklistItem("ci-2", "up");

    expect(result.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledOnce();
    const sqlParts = queryRawMock.mock.calls[0][0] as string[];
    expect(sqlParts.join(" ")).toContain("FOR UPDATE");
    // Bound params: tripId then kind.
    expect(queryRawMock.mock.calls[0][1]).toBe("trip-1");
    expect(queryRawMock.mock.calls[0][2]).toBe("PRETRIP");
  });

  it("swaps sortOrder with the previous item when moving up", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ id: "ci-2", tripId: "trip-1", kind: "PRETRIP" });
    queryRawMock.mockResolvedValue(items);
    checklistItemUpdateMock.mockResolvedValue({});

    await reorderChecklistItem("ci-2", "up");

    expect(checklistItemUpdateMock).toHaveBeenCalledTimes(2);
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({ where: { id: "ci-2" }, data: { sortOrder: 0 } });
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({ where: { id: "ci-1" }, data: { sortOrder: 1 } });
  });

  it("swaps sortOrder with the next item when moving down", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ id: "ci-2", tripId: "trip-1", kind: "PRETRIP" });
    queryRawMock.mockResolvedValue(items);
    checklistItemUpdateMock.mockResolvedValue({});

    await reorderChecklistItem("ci-2", "down");

    expect(checklistItemUpdateMock).toHaveBeenCalledWith({ where: { id: "ci-2" }, data: { sortOrder: 2 } });
    expect(checklistItemUpdateMock).toHaveBeenCalledWith({ where: { id: "ci-3" }, data: { sortOrder: 1 } });
  });

  it("is a no-op at the top boundary", async () => {
    checklistItemFindUniqueMock.mockResolvedValue({ id: "ci-1", tripId: "trip-1", kind: "PRETRIP" });
    queryRawMock.mockResolvedValue(items);

    const result = await reorderChecklistItem("ci-1", "up");

    expect(result.success).toBe(true);
    expect(checklistItemUpdateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the new tests — expect FAIL**

```bash
npm run test -- checklists.test.ts
```
Expected: the `reorderChecklistItem` tests fail (old code uses `findFirst` + array `$transaction`; `queryRawMock` never called).

- [ ] **Step 4: Rewrite `reorderChecklistItem` to lock-then-swap**

In `server/actions/checklists.ts`, replace the body of `reorderChecklistItem` (keep the signature and the leading `const item = await requireChecklistItemAccess(itemId);`) with:

```ts
export async function reorderChecklistItem(
  itemId: string,
  direction: "up" | "down",
): Promise<ChecklistActionResult> {
  const item = await requireChecklistItemAccess(itemId);

  await db.$transaction(async (tx) => {
    // Lock this (trip, kind) checklist in sortOrder so a concurrent reorder blocks
    // until we commit, then re-reads the corrected order. Raw SQL because Prisma
    // can't express SELECT ... FOR UPDATE on findMany.
    const siblings = await tx.$queryRaw<Array<{ id: string; sortOrder: number }>>`
      SELECT "id", "sortOrder"
      FROM "ChecklistItem"
      WHERE "tripId" = ${item.tripId} AND "kind" = ${item.kind}
      ORDER BY "sortOrder" ASC
      FOR UPDATE
    `;

    const idx = siblings.findIndex((s) => s.id === itemId);
    if (idx === -1) return; // item vanished mid-flight — nothing to do

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return; // boundary — no-op

    const current = siblings[idx];
    const neighbour = siblings[swapIdx];

    await tx.checklistItem.update({
      where: { id: current.id },
      data: { sortOrder: neighbour.sortOrder },
    });
    await tx.checklistItem.update({
      where: { id: neighbour.id },
      data: { sortOrder: current.sortOrder },
    });
  });

  revalidateChecklistPaths(item.tripId);
  return { success: true };
}
```

> Note: this drops the now-redundant `db.checklistItem.findUnique` (current) + `db.checklistItem.findFirst` (adjacent) reads — the locked `$queryRaw` snapshot supplies both. `requireChecklistItemAccess` already returns `{ id, tripId, kind }`.

- [ ] **Step 5: Run the tests — expect PASS**

```bash
npm run test -- checklists.test.ts
```
Expected: all checklist tests pass.

- [ ] **Step 6: Full gate**

```bash
npx tsc --noEmit && npm run test && npm run build
```
Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add server/actions/checklists.ts server/actions/checklists.test.ts
git commit -m "fix(checklists): lock-then-swap reorder to close the concurrent-move race

reorderChecklistItem now SELECT ... FOR UPDATEs the (trip, kind) list inside an
interactive transaction and swaps from the locked snapshot. See ADR 0007.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Split `getRateForTrip` into `resolveRateForTrip` + `persistRate`

**Files:**
- Modify: `lib/fx.ts` (add `resolveRateForTrip`, `persistRate`; recompose `getRateForTrip`)
- Test: `lib/fx.test.ts` (add describe blocks; existing `getRateForTrip` tests must stay green)

- [ ] **Step 1: Add tests for the new functions (and keep the old contract covered)**

In `lib/fx.test.ts`, update the top import to include the new exports:

```ts
import {
  mergeRate,
  getRateForTrip,
  resolveRateForTrip,
  persistRate,
  FX_STALE_AFTER_MS,
  isRateStale,
} from "./fx";
```

Then add these two describe blocks (the existing `makeDb` helper and `StoredRate` type are reused; place them after the existing `getRateForTrip` describe block):

```ts
describe("resolveRateForTrip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns rate 1 and no persist when base === quote (no db, no fetch)", async () => {
    const fetcherMock = vi.fn();
    const db = makeDb(null);

    const result = await resolveRateForTrip("trip-1", "AUD", "AUD", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toEqual({ rate: 1, persist: null });
    expect(fetcherMock).not.toHaveBeenCalled();
    expect(db.exchangeRate.findUnique).not.toHaveBeenCalled();
  });

  it("returns the manual stored rate and no persist (skips fetch)", async () => {
    const manual: StoredRate = {
      id: "r1", tripId: "trip-1", base: "EUR", quote: "AUD",
      rate: 1.6, fetchedAt: new Date(), manual: true,
    };
    const fetcherMock = vi.fn();
    const db = makeDb(manual);

    const result = await resolveRateForTrip("trip-1", "EUR", "AUD", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toEqual({ rate: 1.6, persist: null });
    expect(fetcherMock).not.toHaveBeenCalled();
  });

  it("returns a persist descriptor for a fresh fetch and does NOT write", async () => {
    const fetcherMock = vi.fn().mockResolvedValue(1.65);
    const db = makeDb(null);

    const result = await resolveRateForTrip("trip-1", "eur", "aud", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toEqual({ rate: 1.65, persist: { base: "EUR", quote: "AUD", rate: 1.65 } });
    expect(db._upsertMock).not.toHaveBeenCalled(); // resolve never writes
  });

  it("falls back to the stale stored rate with no persist when the fetch fails", async () => {
    const stale: StoredRate = {
      id: "r1", tripId: "trip-1", base: "EUR", quote: "AUD",
      rate: 1.5, fetchedAt: new Date(), manual: false,
    };
    const fetcherMock = vi.fn().mockResolvedValue(null);
    const db = makeDb(stale);

    const result = await resolveRateForTrip("trip-1", "EUR", "AUD", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toEqual({ rate: 1.5, persist: null });
  });

  it("returns null rate and no persist when the fetch fails and nothing is stored", async () => {
    const fetcherMock = vi.fn().mockResolvedValue(null);
    const db = makeDb(null);

    const result = await resolveRateForTrip("trip-1", "EUR", "AUD", {
      db: db as never,
      fetcher: fetcherMock,
    });

    expect(result).toEqual({ rate: null, persist: null });
  });
});

describe("persistRate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts the rate with manual: false against a db-like client", async () => {
    const db = makeDb(null);

    await persistRate(db as never, "trip-1", { base: "EUR", quote: "AUD", rate: 1.65 });

    expect(db._upsertMock).toHaveBeenCalledOnce();
    const call = db._upsertMock.mock.calls[0][0];
    expect(call.where).toEqual({ tripId_base_quote: { tripId: "trip-1", base: "EUR", quote: "AUD" } });
    expect(call.create.manual).toBe(false);
    expect(call.create.rate).toBe(1.65);
    expect(call.update.rate).toBe(1.65);
  });

  it("accepts a transaction client (any exchangeRate-bearing client)", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const tx = { exchangeRate: { upsert } };

    await persistRate(tx as never, "trip-1", { base: "USD", quote: "AUD", rate: 1.5 });

    expect(upsert).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm run test -- fx.test.ts
```
Expected: fails to import `resolveRateForTrip` / `persistRate` (not exported yet).

- [ ] **Step 3: Implement the split in `lib/fx.ts`**

Add these exported types + functions, and **replace** the existing `getRateForTrip` body with the composed version. (Keep `DbLike`, `GetRateOptions`, `StoredRate`, `fetchRate`, `mergeRate`, `isRateStale`, `FX_STALE_AFTER_MS` exactly as they are.)

```ts
/** A freshly fetched rate that should be written to the ExchangeRate cache. */
export interface RatePersist {
  /** Upper-cased base currency. */
  base: string;
  /** Upper-cased quote currency. */
  quote: string;
  rate: number;
}

export interface ResolvedRate {
  /** Rate to use: manual, fresh, stale fallback, or null if unavailable. */
  rate: number | null;
  /** Non-null only when a freshly fetched rate should be cached. */
  persist: RatePersist | null;
}

/**
 * Resolve a trip's base→quote rate WITHOUT writing anything.
 *
 * Reads the stored rate and (for non-manual pairs) performs the network fetch,
 * then returns the rate to use plus — when a fresh rate was fetched — a `persist`
 * descriptor for the caller to write. Keeping the write out of here lets callers
 * persist inside their own transaction (e.g. atomically with a Cost) and keeps the
 * network call out of any DB transaction. See ADR 0007.
 */
export async function resolveRateForTrip(
  tripId: string,
  base: string,
  quote: string,
  { db, fetcher = fetchRate }: GetRateOptions,
): Promise<ResolvedRate> {
  const B = base.toUpperCase();
  const Q = quote.toUpperCase();

  if (B === Q) return { rate: 1, persist: null };

  const stored = await (db.exchangeRate.findUnique as (args: object) => Promise<StoredRate | null>)({
    where: { tripId_base_quote: { tripId, base: B, quote: Q } },
  });

  // Manual rate — trust it, skip the network and any write.
  if (stored?.manual) {
    return { rate: stored.rate, persist: null };
  }

  const fetched = await fetcher(B, Q);

  if (fetched !== null) {
    return { rate: fetched, persist: { base: B, quote: Q, rate: fetched } };
  }

  // Fetch failed — fall back to the stale stored rate if any.
  return { rate: stored?.rate ?? null, persist: null };
}

/**
 * Write a freshly fetched rate to the ExchangeRate cache. Accepts any client with
 * an `exchangeRate` delegate (the global `db` or an interactive transaction `tx`)
 * so the write can join a caller's transaction. Never flips `manual` — a manual
 * lock would have been caught in resolveRateForTrip, so this only touches auto rates.
 */
export async function persistRate(
  client: DbLike,
  tripId: string,
  persist: RatePersist,
): Promise<void> {
  await (client.exchangeRate.upsert as (args: object) => Promise<unknown>)({
    where: { tripId_base_quote: { tripId, base: persist.base, quote: persist.quote } },
    create: {
      tripId,
      base: persist.base,
      quote: persist.quote,
      rate: persist.rate,
      fetchedAt: new Date(),
      manual: false,
    },
    update: {
      rate: persist.rate,
      fetchedAt: new Date(),
    },
  });
}
```

Then replace the existing `getRateForTrip` implementation body with this composition (signature unchanged):

```ts
export async function getRateForTrip(
  tripId: string,
  base: string,
  quote: string,
  { db, fetcher = fetchRate }: GetRateOptions,
): Promise<number | null> {
  const { rate, persist } = await resolveRateForTrip(tripId, base, quote, { db, fetcher });
  if (persist) {
    await persistRate(db, tripId, persist);
  }
  return rate;
}
```

> This preserves `getRateForTrip`'s exact behaviour: same-currency → 1 (no write); manual → stored (no write); fresh fetch → upsert + return; failed fetch → stale stored ?? null (no write). The existing `getRateForTrip` tests must still pass unchanged.

- [ ] **Step 4: Run — expect PASS**

```bash
npm run test -- fx.test.ts
```
Expected: new blocks pass **and** all pre-existing `getRateForTrip` tests still pass.

- [ ] **Step 5: Full gate**

```bash
npx tsc --noEmit && npm run test && npm run build
```
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/fx.ts lib/fx.test.ts
git commit -m "refactor(fx): split rate resolve (network) from persist (write)

resolveRateForTrip reads + fetches with no writes and returns a persist
descriptor; persistRate does the cache upsert against db or a tx. getRateForTrip
composes the two, preserving its contract for /api/fx and rates.ts. Enables an
atomic cost+rate write (Task 5). See ADR 0007.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Make cost creation/update atomic with the rate snapshot

**Files:**
- Modify: `server/actions/costs.ts` (`createCost`, `updateCost`; remove the `snapshotRate` helper; swap the import)
- Test: `server/actions/costs.test.ts` (swap the fx mock; add `$transaction`; migrate existing rate-mock usages; add atomicity tests)

- [ ] **Step 1: Update the test harness — fx mock, db `$transaction`, and migrate rate mocks**

In `server/actions/costs.test.ts`:

(a) Replace the whole `vi.hoisted(() => { return { ... }; })` block (currently ~lines 9-38) with this version — it swaps `getRateForTripMock` for `resolveRateForTripMock` + `persistRateMock` and adds a function-aware `transactionMock` whose `tx` exposes `cost.create` / `cost.update`:

```ts
const {
  requireTripAccessMock,
  revalidatePathMock,
  costFindUniqueMock,
  costCreateMock,
  costUpdateMock,
  costDeleteMock,
  tripFindUniqueMock,
  transportFindUniqueMock,
  accommodationFindUniqueMock,
  itemFindUniqueMock,
  resolveRateForTripMock,
  persistRateMock,
  transactionMock,
} = vi.hoisted(() => {
  const costCreateMock = vi.fn();
  const costUpdateMock = vi.fn();
  const transactionMock = vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)({
        cost: { create: costCreateMock, update: costUpdateMock },
        exchangeRate: { upsert: vi.fn().mockResolvedValue({}) },
      });
    }
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg;
  });

  return {
    requireTripAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1" },
      membership: { role: "owner" },
    }),
    revalidatePathMock: vi.fn(),
    costFindUniqueMock: vi.fn(),
    costCreateMock,
    costUpdateMock,
    costDeleteMock: vi.fn(),
    tripFindUniqueMock: vi.fn(),
    transportFindUniqueMock: vi.fn(),
    accommodationFindUniqueMock: vi.fn(),
    itemFindUniqueMock: vi.fn(),
    resolveRateForTripMock: vi.fn(),
    persistRateMock: vi.fn().mockResolvedValue(undefined),
    transactionMock,
  };
});
```

(b) Replace the fx mock line:
```ts
vi.mock("@/lib/fx", () => ({ getRateForTrip: getRateForTripMock }));
```
with:
```ts
vi.mock("@/lib/fx", () => ({
  resolveRateForTrip: resolveRateForTripMock,
  persistRate: persistRateMock,
}));
```

(c) In the `vi.mock("@/lib/db", ...)` block, add `$transaction: transactionMock,` to the `db` object (alongside `cost`, `trip`, etc.).

(d) **Migrate every existing rate-mock usage** in this file. Mechanical rule: each
```ts
getRateForTripMock.mockResolvedValue(X)
```
becomes
```ts
resolveRateForTripMock.mockResolvedValue({ rate: X, persist: null })
```
(Use `persist: null` everywhere in the *existing* tests — they assert the resulting `rateToHome`, not caching. The new atomicity tests below cover the `persist` path.) Existing assertions on `costCreateMock` / `costUpdateMock` keep working because the tx's `cost.create` / `cost.update` reuse those same mocks.

- [ ] **Step 2: Add atomicity tests**

Add these inside the `describe("createCost", ...)` block:

```ts
  it("resolves the rate before opening the transaction (network never holds a tx)", async () => {
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 1.65, persist: { base: "USD", quote: "AUD", rate: 1.65 } });
    costCreateMock.mockResolvedValue({ id: "cost-1" });

    await createCost("trip-1", { ...VALID_TRANSPORT_INPUT, currency: "USD" });

    // invocationCallOrder is a global monotonic counter across all mocks.
    expect(resolveRateForTripMock.mock.invocationCallOrder[0])
      .toBeLessThan(transactionMock.mock.invocationCallOrder[0]);
  });

  it("persists the fetched rate and creates the cost inside one transaction", async () => {
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 1.65, persist: { base: "USD", quote: "AUD", rate: 1.65 } });
    costCreateMock.mockResolvedValue({ id: "cost-1" });

    const result = await createCost("trip-1", { ...VALID_TRANSPORT_INPUT, currency: "USD" });

    expect(result.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(persistRateMock).toHaveBeenCalledWith(
      expect.anything(), // the tx client
      "trip-1",
      { base: "USD", quote: "AUD", rate: 1.65 },
    );
    expect(costCreateMock).toHaveBeenCalledOnce();
    expect(costCreateMock.mock.calls[0][0].data.rateToHome).toBe(1.65);
  });

  it("does not persist a rate when there is nothing fresh to cache", async () => {
    transportFindUniqueMock.mockResolvedValue({ tripId: "trip-1" });
    tripFindUniqueMock.mockResolvedValue({ homeCurrency: "AUD" });
    resolveRateForTripMock.mockResolvedValue({ rate: 1, persist: null });
    costCreateMock.mockResolvedValue({ id: "cost-1" });

    await createCost("trip-1", { ...VALID_TRANSPORT_INPUT, currency: "AUD" });

    expect(persistRateMock).not.toHaveBeenCalled();
    expect(costCreateMock).toHaveBeenCalledOnce();
    expect(costCreateMock.mock.calls[0][0].data.rateToHome).toBe(1);
  });
```

- [ ] **Step 3: Run — expect FAIL**

```bash
npm run test -- costs.test.ts
```
Expected: fails — `costs.ts` still imports `getRateForTrip` and writes the cost outside a transaction.

- [ ] **Step 4: Rewrite `costs.ts` to resolve-then-atomic-write**

(a) Swap the fx import at the top of `server/actions/costs.ts`:
```ts
import { getRateForTrip } from "@/lib/fx";
```
becomes
```ts
import { resolveRateForTrip, persistRate } from "@/lib/fx";
```

(b) **Delete** the `snapshotRate` helper (it's superseded — `resolveRateForTrip` already returns 1 with no persist for same-currency).

(c) In `createCost`, replace the rate snapshot + `db.cost.create` block (from `// Snapshot the rate` through the `db.cost.create({ ... })` call) with:

```ts
  // Resolve the rate (incl. any network fetch) BEFORE opening a transaction —
  // a network call must never hold a DB transaction open (ADR 0007).
  const resolved = await resolveRateForTrip(tripId, data.currency, trip.homeCurrency, { db });

  // Persist a freshly fetched rate (if any) and create the cost atomically, so a
  // failed cost write never leaves a half-written rate cache behind.
  const cost = await db.$transaction(async (tx) => {
    if (resolved.persist) {
      await persistRate(tx, tripId, resolved.persist);
    }
    return tx.cost.create({
      data: {
        tripId,
        estimatedMinor: data.estimatedMinor,
        actualMinor: data.actualMinor ?? null,
        currency: data.currency,
        rateToHome: resolved.rate,
        paidAt: data.paidAt ?? null,
        ownerType: data.ownerType,
        ownerId: data.ownerId ?? null,
        label: data.label ?? null,
        category: data.category ?? null,
      },
      select: { id: true },
    });
  });

  revalidateTripPaths(tripId);
  return { success: true, cost };
```

(d) In `updateCost`, replace the re-snapshot + `db.cost.update` block with:

```ts
  const resolved = await resolveRateForTrip(existing.tripId, data.currency, trip.homeCurrency, { db });

  await db.$transaction(async (tx) => {
    if (resolved.persist) {
      await persistRate(tx, existing.tripId, resolved.persist);
    }
    await tx.cost.update({
      where: { id: costId },
      data: {
        estimatedMinor: data.estimatedMinor,
        actualMinor: data.actualMinor ?? null,
        currency: data.currency,
        rateToHome: resolved.rate,
        paidAt: data.paidAt ?? null,
        ownerType: data.ownerType,
        ownerId: data.ownerId ?? null,
        label: data.label ?? null,
        category: data.category ?? null,
      },
    });
  });

  revalidateTripPaths(existing.tripId);
  return { success: true };
```

> If TypeScript objects to `persistRate(tx, ...)` (the interactive `tx` vs `DbLike`), widen `DbLike` in `lib/fx.ts` to also accept the transaction client — but the `Prisma.TransactionClient` structurally has `exchangeRate`, so `Pick<PrismaClient, "exchangeRate">` should already accept it. Only touch it if `tsc` complains.

- [ ] **Step 5: Run — expect PASS**

```bash
npm run test -- costs.test.ts
```
Expected: all costs tests pass (migrated existing + new atomicity tests).

- [ ] **Step 6: Full gate**

```bash
npx tsc --noEmit && npm run test && npm run build
```
Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add server/actions/costs.ts server/actions/costs.test.ts
git commit -m "fix(costs): write the FX snapshot and the cost atomically

createCost/updateCost resolve the rate (network) before opening a transaction,
then persist the rate and write the cost together in one interactive tx — so a
failed cost write no longer leaves a cached rate behind. See ADR 0007.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Correct the stale HANDOFF "known limitations" section

**Files:**
- Modify: `docs/HANDOFF.md` (§10 "Known limitations & fast-follows")

- [ ] **Step 1: Replace the section body**

In `docs/HANDOFF.md`, replace the four bullet points under **## 10. Known limitations & fast-follows** (the paragraph starting "A pre-ship hardening review fixed all blocking issues…" plus the four `- **…**` bullets) with:

```markdown
A pre-ship hardening review fixed all blocking issues (multi-currency budget
correctness, a stored-XSS vector, a service-worker cross-user cache leak, error
boundaries, orphaned file blobs, constant-time cron auth). The post-deploy
fast-follow pass then closed the remaining items:

- **Concurrent reorder is now race-safe.** Stop and checklist reordering
  (`moveStop`, `reorderChecklistItem`) lock the list with `SELECT … FOR UPDATE`
  inside an interactive transaction and swap from the locked snapshot, so two
  simultaneous reorders can no longer transpose. See ADR 0007.
- **Cost + FX-rate snapshot are now written atomically.** The rate is resolved
  (network) before the transaction opens, then the rate cache and the cost row are
  written together in one interactive transaction. See ADR 0007.
- **Duplicate pending invites are prevented.** `Invite` has a
  `@@unique([tripId, email])` constraint and `inviteToTrip` upserts on it, so an
  email can have at most one invite row per trip.
- **FX staleness threshold is unified.** Both the `/api/fx` route and the budget
  page use the single `FX_STALE_AFTER_MS` (24h) / `isRateStale` helper in
  `lib/fx.ts` — there is no longer a per-view discrepancy.
```

- [ ] **Step 2: Verify the doc reads correctly**

```bash
grep -n "FOR UPDATE\|atomically\|@@unique(\[tripId, email\])\|FX_STALE_AFTER_MS" docs/HANDOFF.md
```
Expected: all four phrases present in §10.

- [ ] **Step 3: Commit**

```bash
git add docs/HANDOFF.md
git commit -m "docs(handoff): mark the four fast-follows as resolved

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Item 1 (reorder race) → Task 2 (`moveStop`) + Task 3 (`reorderChecklistItem`), pessimistic `FOR UPDATE` per the agreed approach. Scope confirmed to exactly these two functions.
- Item 4 (cost+FX atomic) → Task 4 (shared `resolveRateForTrip`/`persistRate` split, `getRateForTrip` contract preserved) + Task 5 (atomic write in `createCost`/`updateCost`).
- Doc correction → Task 6 (HANDOFF §10); items 2 & 3 documented as already-fixed with evidence.
- ADR → Task 1 (ADR 0007, single combined record), as agreed.

**2. Placeholder scan:** No TBD/"handle errors"/"similar to above". Every code step shows full code; the one pattern-y instruction (Task 5 migrating existing `getRateForTripMock` usages) carries an explicit mechanical rule + the exact replacement shape.

**3. Type/name consistency:** `resolveRateForTrip` returns `ResolvedRate { rate, persist }`; `persist: RatePersist { base, quote, rate }`. `persistRate(client: DbLike, tripId, persist)`. `getRateForTrip` keeps its `(tripId, base, quote, { db, fetcher })` signature. Test mocks use the exact names `queryRawMock`, `transactionMock`, `resolveRateForTripMock`, `persistRateMock`, `costCreateMock`, `costUpdateMock`, reused verbatim across steps. Raw-SQL bound-param order (tripId, then kind for checklists) matches the test assertions in Tasks 2/3.

**4. Risk notes:**
- **No Postgres in the sandbox** — unit tests verify call *shape*, not real lock contention; this is called out in the header and ADR. The `FOR UPDATE` SQL can't be exercised here; CI/prod Postgres is the real gate.
- **Highest-risk task is 5** (touches a shared module's callers indirectly) — mitigated by Task 4 preserving `getRateForTrip`'s exact contract (so `/api/fx` + `rates.ts` are untouched) and by the migrate-existing-mocks rule being purely mechanical.
- **Table/column identifiers** in the raw SQL (`"Stop"`, `"ChecklistItem"`, `"sortOrder"`, `"tripId"`, `"kind"`) match Prisma's default Postgres mapping (no `@@map`/`@map` in the schema). If a future `@map` is added, the raw SQL must track it.
- No schema/migration change; no server-action signature change; behaviour (no-op semantics, result shapes) preserved.
```