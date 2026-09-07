# Reliability Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the reliability defects agreed in the 2026-09-07 grilling session: orphaned Costs on delete, the Wishlist drag/unschedule data-loss pair (P0-4 + P1-5), inconsistent reorder locking, dependency advisories, dev-login/production hardening, and stale docs.

**Architecture:** Server actions (Next 16 App Router, `"use server"` files in `server/actions/`) backed by Prisma 7 + Postgres via `@prisma/adapter-pg`. Unit tests mock `@/lib/db` (vitest + jsdom); this plan adds a second, real-Postgres integration suite for locking. Cost cleanup follows the split-by-paid rule now recorded in CONTEXT.md under **Other cost**.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Prisma 7, vitest 4, Testing Library, next-auth v5, zod.

## Global Constraints

- Branch: all work on `fix/reliability-round`. NEVER commit to `main`, never merge, never push, never deploy.
- Gates after every task: `npx vitest run <touched test files>`; full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` at final review.
- Unit tests mock `@/lib/db` (see `server/actions/items.test.ts` for the `vi.hoisted` mock pattern). There is no Postgres in the dev sandbox — the integration suite (Task 10) only runs where `DATABASE_URL` points at a live Postgres (CI service container, or local docker-compose).
- Migrations: none required by this plan (no schema changes).
- Vocabulary: follow CONTEXT.md. The two amounts on a Cost are the **cost amount** (`costMinor`) and **paid amount** (`paidMinor`) — never "estimated"/"actual". A standalone cost is an **Other cost** (`ownerType: "OTHER"`, `ownerId: null`, `label` set).
- Commit messages: conventional commits, subject ≤ 72 chars, matching the existing history style (`fix(costs): …`, `feat(plan-editor): …`).
- `docs/things-to-fix.md` traps section lists deliberate behaviour — do not "fix" anything listed there.

## File Structure (created/moved files)

| File | Responsibility |
|---|---|
| `server/actions/owned-costs.ts` (new, NO `"use server"`) | `deleteOwnedCostsTx` — split-by-paid Cost cleanup inside a caller's transaction |
| `server/actions/owned-costs.test.ts` (new) | Unit tests for the split rule |
| `server/actions/stop-flow.ts` (new, NO `"use server"`) | The three tx helpers moved out of `stops.ts`, plus the two lock helpers |
| `components/trip/unschedule-item-button.tsx` (new, client) | Unschedule control + undo toast for scheduled items |
| `scripts/sweep-orphaned-costs.ts` (new) | One-off prod sweep applying split-by-paid to existing orphans |
| `vitest.integration.config.ts` + `test/integration/locking.test.ts` (new) | Real-Postgres locking suite |
| `docs/adr/0039-costs-survive-their-owners-by-paid-state.md` (new) | ADR for the split-by-paid decision |

---

### Task 1: `deleteOwnedCostsTx` — split-by-paid cost cleanup helper (+ ADR 0039)

**Files:**
- Create: `server/actions/owned-costs.ts`
- Create: `server/actions/owned-costs.test.ts`
- Create: `docs/adr/0039-costs-survive-their-owners-by-paid-state.md`
- Commit (already edited, uncommitted): `CONTEXT.md` (the **Other cost** glossary amendment)

**Interfaces:**
- Consumes: `Prisma.TransactionClient` from `@prisma/client`.
- Produces (Tasks 2–3 and the sweep script rely on these exact names):

```ts
export type DeletedCostOwner = {
  type: "ACCOMMODATION" | "ITEM" | "TRANSPORT";
  id: string;
  /** Human name of the owner being deleted, used to label converted costs. */
  label: string;
};
export async function deleteOwnedCostsTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  owners: DeletedCostOwner[],
): Promise<{ deleted: number; converted: number }>;
```

**Semantics (from CONTEXT.md / the agreed spec):** for every Cost whose `(ownerType, ownerId)` matches an owner in the list (scoped to `tripId`):
- **Unpaid** (`paidMinor === null && paidAt === null`) → delete the row.
- **Paid or ever-paid** (`paidMinor !== null || paidAt !== null` — conservative: un-marking leaves `paidMinor` as history, and legacy prod rows have `paidMinor` without `paidAt`; money history is never destroyed) → convert to an Other cost: `ownerType: "OTHER"`, `ownerId: null`, `label: `${cost.label ?? owner.label} (deleted)``. Keep `costMinor`, `paidMinor`, `paidAt`, `currency`, `rateToHome`, `category`, `forkId` untouched.

- [ ] **Step 1: Write the failing tests**

`server/actions/owned-costs.test.ts` (mock pattern per `items.test.ts` — but this module only needs a fake `tx`, no `@/lib/db` mock):

```ts
import { describe, expect, it, vi } from "vitest";
import { deleteOwnedCostsTx, type DeletedCostOwner } from "./owned-costs";
import type { Prisma } from "@prisma/client";

function makeTx(costs: Array<Record<string, unknown>>) {
  const findMany = vi.fn().mockResolvedValue(costs);
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const update = vi.fn().mockResolvedValue({});
  const tx = { cost: { findMany, deleteMany, update } } as unknown as Prisma.TransactionClient;
  return { tx, findMany, deleteMany, update };
}

const owner: DeletedCostOwner = { type: "ACCOMMODATION", id: "acc-1", label: "Hotel Lisboa" };

describe("deleteOwnedCostsTx", () => {
  it("deletes unpaid costs (no paidMinor, no paidAt)", async () => {
    const { tx, deleteMany } = makeTx([
      { id: "c1", paidMinor: null, paidAt: null, label: null },
    ]);
    const result = await deleteOwnedCostsTx(tx, "trip-1", [owner]);
    expect(result).toEqual({ deleted: 1, converted: 0 });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["c1"] } } });
  });

  it("converts a paid cost to an Other cost labelled after the owner", async () => {
    const { tx, update } = makeTx([
      { id: "c2", paidMinor: 8000, paidAt: new Date("2026-06-01"), label: null },
    ]);
    const result = await deleteOwnedCostsTx(tx, "trip-1", [owner]);
    expect(result).toEqual({ deleted: 0, converted: 1 });
    expect(update).toHaveBeenCalledWith({
      where: { id: "c2" },
      data: { ownerType: "OTHER", ownerId: null, label: "Hotel Lisboa (deleted)" },
    });
  });

  it("treats paidMinor-without-paidAt (legacy rows) as paid — converts, never deletes", async () => {
    const { tx, update, deleteMany } = makeTx([
      { id: "c3", paidMinor: 500, paidAt: null, label: null },
    ]);
    await deleteOwnedCostsTx(tx, "trip-1", [owner]);
    expect(update).toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("prefers the cost's own label when it has one", async () => {
    const { tx, update } = makeTx([
      { id: "c4", paidMinor: 100, paidAt: null, label: "Deposit" },
    ]);
    await deleteOwnedCostsTx(tx, "trip-1", [owner]);
    expect(update).toHaveBeenCalledWith({
      where: { id: "c4" },
      data: { ownerType: "OTHER", ownerId: null, label: "Deposit (deleted)" },
    });
  });

  it("queries costs scoped to the trip and the owner pairs, and no-ops on empty owners", async () => {
    const { tx, findMany } = makeTx([]);
    await deleteOwnedCostsTx(tx, "trip-1", [owner]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        tripId: "trip-1",
        OR: [{ ownerType: "ACCOMMODATION", ownerId: { in: ["acc-1"] } }],
      },
      select: { id: true, paidMinor: true, paidAt: true, label: true, ownerType: true, ownerId: true },
    });
    const empty = await deleteOwnedCostsTx(tx, "trip-1", []);
    expect(empty).toEqual({ deleted: 0, converted: 0 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/actions/owned-costs.test.ts`
Expected: FAIL — cannot resolve `./owned-costs`.

- [ ] **Step 3: Implement `server/actions/owned-costs.ts`**

No `"use server"` directive — this is a transaction helper, not an action (precedent: `server/actions/target-cleanup.ts`).

```ts
import type { Prisma } from "@prisma/client";

export type DeletedCostOwner = {
  type: "ACCOMMODATION" | "ITEM" | "TRANSPORT";
  id: string;
  /** Human name of the owner being deleted, used to label converted costs. */
  label: string;
};

/**
 * Handle the Costs attached to owners being deleted, inside the caller's
 * transaction. Split-by-paid rule (CONTEXT.md "Other cost", ADR 0039):
 * unpaid costs die with their owner; any cost that has ever had a paid
 * amount converts to a standalone Other cost so Spend so far keeps
 * matching real money. paidMinor-without-paidAt counts as paid (legacy
 * rows; un-marking also leaves paidMinor as history).
 */
export async function deleteOwnedCostsTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  owners: DeletedCostOwner[],
): Promise<{ deleted: number; converted: number }> {
  if (owners.length === 0) return { deleted: 0, converted: 0 };

  const byType = new Map<string, DeletedCostOwner[]>();
  for (const o of owners) {
    byType.set(o.type, [...(byType.get(o.type) ?? []), o]);
  }
  const costs = await tx.cost.findMany({
    where: {
      tripId,
      OR: [...byType.entries()].map(([type, list]) => ({
        ownerType: type,
        ownerId: { in: list.map((o) => o.id) },
      })),
    },
    select: { id: true, paidMinor: true, paidAt: true, label: true, ownerType: true, ownerId: true },
  });
  if (costs.length === 0) return { deleted: 0, converted: 0 };

  const ownerLabel = new Map(owners.map((o) => [`${o.type}:${o.id}`, o.label]));
  const doomedIds: string[] = [];
  let converted = 0;
  for (const cost of costs) {
    const everPaid = cost.paidMinor !== null || cost.paidAt !== null;
    if (!everPaid) {
      doomedIds.push(cost.id);
      continue;
    }
    const base = cost.label ?? ownerLabel.get(`${cost.ownerType}:${cost.ownerId}`) ?? "Deleted";
    await tx.cost.update({
      where: { id: cost.id },
      data: { ownerType: "OTHER", ownerId: null, label: `${base} (deleted)` },
    });
    converted++;
  }
  if (doomedIds.length > 0) {
    await tx.cost.deleteMany({ where: { id: { in: doomedIds } } });
  }
  return { deleted: doomedIds.length, converted };
}
```

- [ ] **Step 4: Run tests — PASS.** `npx vitest run server/actions/owned-costs.test.ts`

- [ ] **Step 5: Write ADR 0039** at `docs/adr/0039-costs-survive-their-owners-by-paid-state.md` (match the format of `docs/adr/0037-*.md`):

```markdown
# 0039 — Costs survive their owners according to paid state

## Status
Accepted (2026-09-07)

## Context
Cost is polymorphic (`ownerType` + `ownerId`, no FK), so deleting an
Accommodation, Item or Transport orphaned its Cost rows: the money stayed in
every Budget total, attached to nothing. Deleting the rows instead would
shrink Spend so far — but paid Costs are real money that left an account
(e.g. a non-refundable deposit on a hotel that was later cut from the plan),
and CONTEXT.md promises "nothing paid ever counts as zero."

## Decision
When an owner is deleted (directly, or via a Stop cascading its
Accommodations), inside the same transaction:
- Costs never paid (`paidMinor` and `paidAt` both null) are deleted — they
  were estimates for a thing that no longer exists.
- Costs ever paid (either field set — un-marking keeps `paidMinor` as
  history, and legacy rows carry `paidMinor` without `paidAt`) convert to an
  Other cost (`ownerType: "OTHER"`, `ownerId: null`), labelled
  "<owner or cost label> (deleted)". Amounts, currency, snapshot rate,
  category and plan scope are untouched.

Implemented by `deleteOwnedCostsTx` (`server/actions/owned-costs.ts`);
existing prod orphans are handled once by `scripts/sweep-orphaned-costs.ts`.

## Consequences
- Spend so far and the Budget stay truthful across deletions; cancelled-but-
  paid money shows as an Other cost instead of vanishing or dangling.
- The "(deleted)" label is the only trace of the original owner; drill-down
  from the converted cost to the deleted entity is deliberately not kept.
- Alternatives rejected: delete-everything (paid money vanishes from Spend
  so far); convert-everything (estimate clutter outlives sketching).
```

- [ ] **Step 6: Commit**

```bash
git add server/actions/owned-costs.ts server/actions/owned-costs.test.ts docs/adr/0039-costs-survive-their-owners-by-paid-state.md CONTEXT.md
git commit -m "feat(costs): deleteOwnedCostsTx — split-by-paid cost cleanup (ADR 0039)"
```

---

### Task 2: Transactional deletes for Item, Accommodation, Transport (wired to cost cleanup)

**Files:**
- Modify: `server/actions/target-cleanup.ts` (add tx variant + blob helper; keep existing functions)
- Modify: `server/actions/items.ts:389-400` (`deleteItem`)
- Modify: `server/actions/accommodation.ts:279-292` (`deleteAccommodation`)
- Modify: `server/actions/transport.ts:436-450` (`deleteTransport`)
- Test: `server/actions/target-cleanup.test.ts` (extend if present, else create), plus the existing `items.test.ts` / `accommodation.test.ts` / `transport.test.ts` delete tests (update their transaction mocks)

**Interfaces:**
- Consumes: `deleteOwnedCostsTx(tx, tripId, owners)` from Task 1.
- Produces (Task 3 uses these exact names):

```ts
// target-cleanup.ts additions
export async function cleanupTargetSideDataTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  targetType: TargetType,
  targetId: string,
): Promise<string[]>;                       // returns storage keys to delete after commit
export async function deleteBlobsBestEffort(storageKeys: string[]): Promise<void>;
```

**Design note (deviation from the spec's literal wording, agreed rationale):** `recordPlanActivity` stays OUTSIDE the transaction. It is best-effort by existing design (`server/actions/activity.ts` swallows its own errors so it "never break[s] the caller's mutation"); pulling it into the tx would invert that. The transaction covers what must be atomic: entity delete + cost handling + attachment/note row cleanup. Blob deletion (S3/R2) cannot be transactional; keys are collected inside the tx and deleted best-effort after commit — a crash after commit leaves only unreferenced blobs (invisible to users), never DB orphans.

- [ ] **Step 1: Add the tx variant in `target-cleanup.ts`**

```ts
import type { Prisma } from "@prisma/client";

/**
 * Transaction-scoped variant of cleanupTargetSideData: deletes Attachment and
 * Note ROWS inside the caller's transaction and returns the storage keys so
 * the caller can delete the blobs best-effort AFTER commit (a blob delete
 * cannot be rolled back, so it must not run inside the tx).
 */
export async function cleanupTargetSideDataTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  targetType: TargetType,
  targetId: string,
): Promise<string[]> {
  const attachments = await tx.attachment.findMany({
    where: { tripId, targetType, targetId },
    select: { storageKey: true },
  });
  await tx.attachment.deleteMany({ where: { tripId, targetType, targetId } });
  await tx.note.deleteMany({ where: { tripId, targetType, targetId } });
  return attachments.map((a) => a.storageKey).filter((k): k is string => k != null);
}

/** Best-effort blob deletion — run AFTER the transaction commits. */
export async function deleteBlobsBestEffort(storageKeys: string[]): Promise<void> {
  if (storageKeys.length === 0) return;
  const storage = getStorage();
  for (const key of storageKeys) {
    try {
      await storage.delete(key);
    } catch {
      // best-effort: an unreferenced blob is harmless; never fail the mutation
    }
  }
}
```

Keep `cleanupTargetSideData` and `cleanupGlobeAttachments` as-is (other callers still use them).

- [ ] **Step 2: Write failing tests for the new delete shape**

In each of `items.test.ts`, `accommodation.test.ts`, `transport.test.ts`, the delete tests must now assert (using the file's existing `vi.hoisted` mock structure — extend `transactionMock` so a function argument is invoked with a `tx` object exposing the models the new code touches: `item`/`accommodation`/`transport`, `cost`, `attachment`, `note`):

```ts
it("deleteItem runs delete, cost cleanup and side-data cleanup in one transaction", async () => {
  itemFindUniqueMock.mockResolvedValue({ id: "item-1", title: "Colosseum" });
  attachmentFindManyMock.mockResolvedValue([{ storageKey: "k1" }]);
  costFindManyMock.mockResolvedValue([]);
  const result = await deleteItem("item-1");
  expect(result.success).toBe(true);
  expect(transactionMock).toHaveBeenCalledTimes(1);      // one tx wraps it all
  expect(itemDeleteMock).toHaveBeenCalledWith({ where: { id: "item-1" } });
  expect(attachmentDeleteManyMock).toHaveBeenCalled();    // inside the tx
  expect(noteDeleteManyMock).toHaveBeenCalled();
});

it("deleteItem converts the item's paid cost to an Other cost", async () => {
  itemFindUniqueMock.mockResolvedValue({ id: "item-1", title: "Colosseum" });
  costFindManyMock.mockResolvedValue([
    { id: "c1", paidMinor: 4000, paidAt: null, label: null, ownerType: "ITEM", ownerId: "item-1" },
  ]);
  await deleteItem("item-1");
  expect(costUpdateMock).toHaveBeenCalledWith({
    where: { id: "c1" },
    data: { ownerType: "OTHER", ownerId: null, label: "Colosseum (deleted)" },
  });
});
```

Mirror both tests for `deleteAccommodation` (owner label from `name`) and `deleteTransport` (owner label from `entityLabel("TRANSPORT", …)` — pass the same label string the action already computes for the activity entry).

- [ ] **Step 3: Run to verify failures** — `npx vitest run server/actions/items.test.ts server/actions/accommodation.test.ts server/actions/transport.test.ts`

- [ ] **Step 4: Rewrite the three delete actions.** Shape for `deleteItem` (`items.ts`); apply the same shape to the other two:

```ts
export async function deleteItem(itemId: string): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);

  const doomed = await db.item.findUnique({ where: { id: itemId }, select: { title: true } });

  const storageKeys = await db.$transaction(async (tx) => {
    await tx.item.delete({ where: { id: itemId } });
    await deleteOwnedCostsTx(tx, item.tripId, [
      { type: "ITEM", id: itemId, label: doomed?.title ?? "Item" },
    ]);
    return cleanupTargetSideDataTx(tx, item.tripId, "ITEM", itemId);
  });
  await deleteBlobsBestEffort(storageKeys);

  await recordPlanActivity(item.forkId, { tripId: item.tripId, verb: "DELETED", entityType: "ITEM", entityId: itemId, entityLabel: doomed?.title ?? "" });

  revalidateItemPaths(item.tripId);
  return { success: true };
}
```

For `deleteAccommodation`: owner `{ type: "ACCOMMODATION", id: accommodationId, label: doomed?.name ?? "Accommodation" }`, target type `"ACCOMMODATION"`, keep `revalidatePath(`/trips/${acc.tripId}`, "layout")`.
For `deleteTransport`: the action already loads the full `doomed` row; owner label `entityLabel("TRANSPORT", (doomed ?? {}) as unknown as Record<string, unknown>)`, target type `"TRANSPORT"`.
Imports to add in all three files: `deleteOwnedCostsTx` from `@/server/actions/owned-costs`; `cleanupTargetSideDataTx`, `deleteBlobsBestEffort` from `@/server/actions/target-cleanup`.

- [ ] **Step 5: Run the three test files — PASS. Then `npx tsc --noEmit`.**

- [ ] **Step 6: Commit**

```bash
git add server/actions/target-cleanup.ts server/actions/items.ts server/actions/accommodation.ts server/actions/transport.ts server/actions/*.test.ts
git commit -m "fix(costs): transactional deletes; owned costs split by paid state"
```

---

### Task 3: `deleteStop` — transactional, including cascade-deleted Accommodations' costs

**Files:**
- Modify: `server/actions/stops.ts:624-648` (`deleteStop`)
- Test: `server/actions/stops.test.ts` (extend the existing deleteStop tests)

**Interfaces:**
- Consumes: `deleteOwnedCostsTx`, `cleanupTargetSideDataTx`, `deleteBlobsBestEffort` (Tasks 1–2, exact signatures above).

**Key subtlety:** deleting a Stop cascade-deletes its Accommodations (schema `onDelete: Cascade`), so their costs and side-data must be cleaned in the same transaction, and the accommodation names must be read BEFORE the delete.

- [ ] **Step 1: Write failing tests** in `stops.test.ts`:

```ts
it("deleteStop cleans costs and side-data for the stop's cascaded accommodations", async () => {
  accommodationFindManyMock.mockResolvedValue([{ id: "acc-1", name: "Hotel Lisboa" }]);
  stopFindUniqueMock.mockResolvedValue({ id: "stop-1", name: "Lisbon" });
  costFindManyMock.mockResolvedValue([
    { id: "c1", paidMinor: 8000, paidAt: null, label: null, ownerType: "ACCOMMODATION", ownerId: "acc-1" },
    { id: "c2", paidMinor: null, paidAt: null, label: null, ownerType: "ACCOMMODATION", ownerId: "acc-1" },
  ]);
  const result = await deleteStop("stop-1");
  expect(result.success).toBe(true);
  expect(transactionMock).toHaveBeenCalledTimes(1);
  expect(costUpdateMock).toHaveBeenCalledWith({
    where: { id: "c1" },
    data: { ownerType: "OTHER", ownerId: null, label: "Hotel Lisboa (deleted)" },
  });
  expect(costDeleteManyMock).toHaveBeenCalledWith({ where: { id: { in: ["c2"] } } });
});
```

(Extend the file's existing hoisted mocks with `costFindManyMock` / `costUpdateMock` / `costDeleteManyMock` / `attachmentFindManyMock` / `attachmentDeleteManyMock` / `noteDeleteManyMock` if absent, and make `transactionMock` invoke function arguments with a tx exposing `stop`, `cost`, `attachment`, `note`, `accommodation`.)

- [ ] **Step 2: Run — FAIL.** `npx vitest run server/actions/stops.test.ts`

- [ ] **Step 3: Rewrite `deleteStop`:**

```ts
export async function deleteStop(stopId: string): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);

  // Read names BEFORE the delete: the DB cascades Accommodation rows with the
  // Stop, and converted costs need the accommodation's name for their label.
  const cascadedAccommodations = await db.accommodation.findMany({
    where: { stopId },
    select: { id: true, name: true },
  });
  const doomed = await db.stop.findUnique({ where: { id: stopId }, select: { name: true } });

  const storageKeys = await db.$transaction(async (tx) => {
    await tx.stop.delete({ where: { id: stopId } });
    await deleteOwnedCostsTx(
      tx,
      stop.tripId,
      cascadedAccommodations.map((a) => ({
        type: "ACCOMMODATION" as const,
        id: a.id,
        label: a.name ?? "Accommodation",
      })),
    );
    const keys = await cleanupTargetSideDataTx(tx, stop.tripId, "STOP", stopId);
    for (const acc of cascadedAccommodations) {
      keys.push(...(await cleanupTargetSideDataTx(tx, stop.tripId, "ACCOMMODATION", acc.id)));
    }
    return keys;
  });
  await deleteBlobsBestEffort(storageKeys);

  await recordPlanActivity(stop.forkId, { tripId: stop.tripId, verb: "DELETED", entityType: "STOP", entityId: stopId, entityLabel: doomed?.name ?? "" });

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}
```

Add the imports (`deleteOwnedCostsTx`; `cleanupTargetSideDataTx`, `deleteBlobsBestEffort`) and remove the now-unused `cleanupTargetSideData` import if nothing else in the file uses it.

- [ ] **Step 4: Run `stops.test.ts` — PASS. `npx tsc --noEmit` clean.**

- [ ] **Step 5: Commit** — `git commit -m "fix(costs): deleteStop transactional; cascaded accommodation costs handled"`

---

### Task 4: One-off orphan sweep script + deploy runbook entry

**Files:**
- Create: `scripts/sweep-orphaned-costs.ts`
- Modify: `docs/DEPLOY.md` (add a runbook step)
- Modify: `package.json` (script entry)

**Interfaces:**
- Consumes: `deleteOwnedCostsTx` semantics (NOT the function — orphans' owners are gone, so labels are generic; the script implements the same split rule directly).

**No test cycle** — the sandbox has no DB. The script gets a `--dry-run`-first design and the runbook documents the manual pass. State this in the task report; do not claim it verified against data.

- [ ] **Step 1: Write `scripts/sweep-orphaned-costs.ts`** (pattern after `scripts/backfill-geocode.ts` for the tsx + db bootstrapping style):

```ts
/**
 * One-off sweep for Cost rows orphaned before deletes cleaned up costs
 * (ADR 0039). Applies the same split-by-paid rule as deleteOwnedCostsTx:
 * unpaid orphans are deleted, ever-paid orphans convert to Other costs with
 * a generic label (their owners are gone, so no name is recoverable).
 *
 *   npx tsx scripts/sweep-orphaned-costs.ts            # dry run (default)
 *   npx tsx scripts/sweep-orphaned-costs.ts --execute  # apply changes
 */
import { db } from "@/lib/db";

const TYPE_LABEL: Record<string, string> = {
  ACCOMMODATION: "Accommodation",
  ITEM: "Item",
  TRANSPORT: "Transport",
};

async function main() {
  const execute = process.argv.includes("--execute");
  const costs = await db.cost.findMany({
    where: { ownerType: { in: ["ACCOMMODATION", "ITEM", "TRANSPORT"] }, ownerId: { not: null } },
    select: { id: true, ownerType: true, ownerId: true, paidMinor: true, paidAt: true, label: true, tripId: true },
  });

  const ownerIds = {
    ACCOMMODATION: costs.filter((c) => c.ownerType === "ACCOMMODATION").map((c) => c.ownerId!),
    ITEM: costs.filter((c) => c.ownerType === "ITEM").map((c) => c.ownerId!),
    TRANSPORT: costs.filter((c) => c.ownerType === "TRANSPORT").map((c) => c.ownerId!),
  };
  const [accs, items, transports] = await Promise.all([
    db.accommodation.findMany({ where: { id: { in: ownerIds.ACCOMMODATION } }, select: { id: true } }),
    db.item.findMany({ where: { id: { in: ownerIds.ITEM } }, select: { id: true } }),
    db.transport.findMany({ where: { id: { in: ownerIds.TRANSPORT } }, select: { id: true } }),
  ]);
  const alive = new Set([
    ...accs.map((r) => `ACCOMMODATION:${r.id}`),
    ...items.map((r) => `ITEM:${r.id}`),
    ...transports.map((r) => `TRANSPORT:${r.id}`),
  ]);

  const orphans = costs.filter((c) => !alive.has(`${c.ownerType}:${c.ownerId}`));
  const doomed = orphans.filter((c) => c.paidMinor === null && c.paidAt === null);
  const converts = orphans.filter((c) => c.paidMinor !== null || c.paidAt !== null);

  console.log(`${costs.length} owned costs scanned — ${orphans.length} orphaned`);
  console.log(`  would delete (never paid):   ${doomed.length}`);
  console.log(`  would convert (ever paid):   ${converts.length}`);
  for (const c of orphans) {
    const fate = c.paidMinor !== null || c.paidAt !== null ? "CONVERT" : "DELETE";
    console.log(`  [${fate}] cost ${c.id} trip ${c.tripId} (${c.ownerType} ${c.ownerId})`);
  }
  if (!execute) {
    console.log("\nDry run — re-run with --execute to apply.");
    return;
  }

  await db.$transaction(async (tx) => {
    if (doomed.length > 0) {
      await tx.cost.deleteMany({ where: { id: { in: doomed.map((c) => c.id) } } });
    }
    for (const c of converts) {
      const base = c.label ?? TYPE_LABEL[c.ownerType] ?? "Deleted";
      await tx.cost.update({
        where: { id: c.id },
        data: { ownerType: "OTHER", ownerId: null, label: `${base} (deleted)` },
      });
    }
  });
  console.log(`Applied: deleted ${doomed.length}, converted ${converts.length}.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add package script** — in `package.json` scripts: `"sweep:orphaned-costs": "tsx scripts/sweep-orphaned-costs.ts"`.

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` clean (the script is inside the TS project; if `tsconfig.json` excludes `scripts/`, run `npx tsx --no-cache scripts/sweep-orphaned-costs.ts --help` is NOT possible without a DB — typecheck via `npx tsc --noEmit -p tsconfig.json` only; note in report that the script needs a manual dry-run against prod, per the runbook).

- [ ] **Step 4: Add to `docs/DEPLOY.md`** (in the post-deploy/maintenance section, matching its heading style):

```markdown
### One-off: sweep orphaned costs (after the ADR 0039 deploy)

Deletes before ADR 0039 orphaned Cost rows (owner gone, money still in the
budget). Run ONCE against prod after deploying the reliability round:

    npx tsx scripts/sweep-orphaned-costs.ts            # dry run — review output
    npx tsx scripts/sweep-orphaned-costs.ts --execute  # apply

Never-paid orphans are deleted; ever-paid orphans become "Other costs"
labelled "<label> (deleted)". Requires DATABASE_URL pointing at prod.
```

- [ ] **Step 5: Commit** — `git commit -m "chore(costs): orphaned-cost sweep script + deploy runbook step"`

---

### Task 5: P0-4 — Wishlist → calendar drag places a copy

**Files:**
- Modify: `components/trip/calendar-views.tsx:111-125` (`handleDropItem`)
- Test: `components/trip/calendar-views.test.tsx` (extend; it exists — follow its render/mocking conventions)

**Interfaces:**
- Consumes: `scheduleItem(itemId, { date })` and `rescheduleItem(itemId, dateISO)` from `@/server/actions/items` (exact current signatures; `scheduleItem`'s copy-in branch sets `sourceItemId` and leaves the idea untouched).

**Rule (per `docs/things-to-fix.md` P0-4, decision approved):** decide by drag source, not by re-querying. Inside `CalendarViews`, the rail's items are exactly the `wishlistItems` prop — an id present there is a Wishlist idea; anything else being dropped is a month-grid item that already has a date. Do NOT change `rescheduleItem` — month-grid drag depends on its in-place semantics.

- [ ] **Step 1: Write failing tests** (in `calendar-views.test.tsx`, mocking `@/server/actions/items` the way the file already mocks server actions; if it doesn't yet, add `vi.mock("@/server/actions/items", …)` with `scheduleItem` and `rescheduleItem` spies):

```ts
it("dropping a wishlist idea on a day calls scheduleItem (copy-in), not rescheduleItem", async () => {
  // render CalendarViews with wishlistItems=[{ id: "idea-1", … }], switch to month view,
  // then invoke the drop path for ("idea-1", "2026-07-02") — via the same simulated
  // drag/drop events the file's existing month-grid tests use.
  expect(scheduleItemMock).toHaveBeenCalledWith("idea-1", { date: "2026-07-02" });
  expect(rescheduleItemMock).not.toHaveBeenCalled();
});

it("dropping an already-dated item still reschedules in place", async () => {
  // drop ("item-9", "2026-07-03") where item-9 is NOT in wishlistItems
  expect(rescheduleItemMock).toHaveBeenCalledWith("item-9", "2026-07-03");
  expect(scheduleItemMock).not.toHaveBeenCalled();
});
```

(If `calendar-views.test.tsx` has no drag simulation precedent, test `handleDropItem` indirectly: extract the branch into an exported pure helper `resolveDropAction(itemId, wishlistIds): "schedule" | "reschedule"` in the same file and unit-test that, plus one render test asserting the rail passes its item ids through. Prefer the direct approach if the file supports it.)

- [ ] **Step 2: Run — FAIL.** `npx vitest run components/trip/calendar-views.test.tsx`

- [ ] **Step 3: Implement.** In `CalendarViews`:

```tsx
const wishlistIds = React.useMemo(
  () => new Set(wishlistItems.map((w) => w.id)),
  [wishlistItems],
);

const handleDropItem = React.useCallback(
  (itemId: string, dateISO: string) => {
    startTransition(async () => {
      // ADR 0019: a Wishlist idea is PLACED (copy-in) — the idea survives on
      // the board. Only an already-dated item moves in place.
      const result = wishlistIds.has(itemId)
        ? await scheduleItem(itemId, { date: dateISO })
        : await rescheduleItem(itemId, dateISO);
      if (!result.success) {
        toast({
          variant: "destructive",
          title: result.errors.date?.[0] ?? "Couldn't move that item.",
        });
        return;
      }
      router.refresh();
    });
  },
  [router, wishlistIds],
);
```

Import `scheduleItem` alongside `rescheduleItem`.

- [ ] **Step 4: Run the file's tests — PASS.** Also run `npx vitest run server/actions/items.test.ts` (unchanged behaviour, should still pass).

- [ ] **Step 5: Commit** — `git commit -m "fix(wishlist): calendar drop places a copy per ADR 0019 (P0-4)"`

---

### Task 6: P1-5 server half — `unscheduleItem` semantics + idea classification

**Files:**
- Modify: `server/actions/items.ts:456-576` (`scheduleItem` classification, `unscheduleItem` rewrite)
- Test: `server/actions/items.test.ts`

**Interfaces:**
- Produces (Task 7's UI relies on this exact result shape):

```ts
export type UnscheduleResult = ActionResult<{
  /** "placement-removed": row was a placed copy and was deleted (idea survives).
   *  "unslotted": direct-created item; its date was cleared in place. */
  mode: "placement-removed" | "unslotted";
  sourceItemId: string | null;
}>;
export async function unscheduleItem(itemId: string): Promise<UnscheduleResult>;
```

**Decisions (grilling session, 2026-09-07):**
1. `sourceItemId !== null` → delete only the placement (ADR 0019; idea survives).
2. `sourceItemId === null` (direct-created) → clear `date` ONLY (keep `startTime`/`endTime` — harmless on an undated thing and preserves undo fidelity). With a `stopId` it un-slots to that Stop's things-to-do (ADR 0022/0038 mechanism); with no `stopId` it becomes a Wishlist idea — which is exactly what `{date: null, stopId: null, forkId: null}` means.
3. Classification bug fixed as agreed: `scheduleItem`'s `isWishlistIdea` must also require `stopId === null` (a thing-to-do attached to a Stop is NOT an idea; per ADR 0022 dating it slots it in place, not copy-in). CONTEXT.md: an idea is "attached to no Stop and no day".

- [ ] **Step 1: Write failing tests** in `items.test.ts`:

```ts
describe("unscheduleItem", () => {
  it("deletes only the placement when the item is a placed copy", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "placed-1", sourceItemId: "idea-1", date: "2026-07-02", title: "Colosseum" });
    const result = await unscheduleItem("placed-1");
    expect(result).toMatchObject({ success: true, mode: "placement-removed", sourceItemId: "idea-1" });
    expect(itemDeleteMock).toHaveBeenCalledWith({ where: { id: "placed-1" } });
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  it("clears only the date on a direct-created item (un-slot, ADR 0038)", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "direct-1", sourceItemId: null, date: "2026-07-02", stopId: "stop-1", title: "Dinner" });
    const result = await unscheduleItem("direct-1");
    expect(result).toMatchObject({ success: true, mode: "unslotted", sourceItemId: null });
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "direct-1" }, data: { date: null } });
    expect(itemDeleteMock).not.toHaveBeenCalled();
  });
});

describe("scheduleItem classification", () => {
  it("treats a stop-attached thing-to-do as in-place scheduling, not copy-in", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "todo-1", date: null, stopId: "stop-1", forkId: null, title: "Dinner" });
    await scheduleItem("todo-1", { date: "2026-07-02" });
    expect(itemCreateMock).not.toHaveBeenCalled();       // no copy
    expect(itemUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "todo-1" } }),
    );
  });

  it("still copies in a true wishlist idea (no date, no stop)", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "idea-1", date: null, stopId: null, forkId: null, title: "Idea", category: "SIGHTSEEING" });
    itemFindFirstMock.mockResolvedValue({ sortOrder: 4 });
    await scheduleItem("idea-1", { date: "2026-07-02" });
    expect(itemCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sourceItemId: "idea-1", date: "2026-07-02" }) }),
    );
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run server/actions/items.test.ts`

- [ ] **Step 3: Implement.** In `scheduleItem` change one line:

```ts
const isWishlistIdea =
  fullItem.date === null && fullItem.stopId === null && fullItem.forkId === null;
```

Rewrite `unscheduleItem`:

```ts
export type UnscheduleResult = ActionResult<{
  mode: "placement-removed" | "unslotted";
  sourceItemId: string | null;
}>;

/**
 * Unschedule a placed item (ADR 0019 / grilling 2026-09-07).
 *
 * - Placed copy (sourceItemId set): delete only the placement; the idea
 *   survives in the Wishlist.
 * - Direct-created (sourceItemId null): clear the date in place. With a
 *   stopId the item un-slots to that Stop's things-to-do (ADR 0038); with
 *   none it returns to the Wishlist pool. Times are kept — harmless while
 *   undated, and they make undo lossless.
 */
export async function unscheduleItem(itemId: string): Promise<UnscheduleResult> {
  const accessItem = await requireItemAccess(itemId);

  const fullItem = await db.item.findUnique({ where: { id: itemId } });
  if (!fullItem) notFound();

  let mode: "placement-removed" | "unslotted";
  if (fullItem.sourceItemId !== null) {
    await db.item.delete({ where: { id: itemId } });
    mode = "placement-removed";
  } else {
    await db.item.update({ where: { id: itemId }, data: { date: null } });
    mode = "unslotted";
  }

  await recordPlanActivity(accessItem.forkId, {
    tripId: accessItem.tripId,
    verb: mode === "placement-removed" ? "DELETED" : "UPDATED",
    entityType: "ITEM",
    entityId: itemId,
    entityLabel: entityLabel("ITEM", fullItem as unknown as Record<string, unknown>),
  });

  revalidateItemPaths(accessItem.tripId);
  return { success: true, mode, sourceItemId: fullItem.sourceItemId ?? null };
}
```

- [ ] **Step 4: Run `items.test.ts` — PASS. Also run the full suite (`npm test`)** — the classification change touches `scheduleItem` callers; fix any test fixtures that relied on the old (buggy) copy-in for stop-attached things-to-do, but treat a genuinely failing behaviour test as a stop-and-think signal, not something to edit into passing.

- [ ] **Step 5: Commit** — `git commit -m "fix(items): unscheduleItem removes placement or un-slots; idea test includes stopId (P1-5)"`

---

### Task 7: P1-5 UI half — real Unschedule control, honest toast, working undo

**Files:**
- Create: `components/trip/unschedule-item-button.tsx`
- Modify: `components/trip/timeline.tsx` (render the button on item rows in the `day` variant, behind a new optional prop)
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx` (pass the new prop)
- Modify: `components/trip/wishlist-board.tsx:137-167, 364-369, 408-413` (delete `handleUnschedule` and the `onUnschedule` wiring)
- Modify: `components/trip/item-card.tsx:145-156` (delete the dead Unschedule branch + `onUnschedule` prop)
- Test: `components/trip/unschedule-item-button.test.tsx` (new), `components/trip/timeline.test.tsx`, `components/trip/wishlist-board.test.tsx` (update)

**Interfaces:**
- Consumes: `unscheduleItem` returning `{ mode, sourceItemId }` (Task 6), `scheduleItem(itemId, {date, startTime?, endTime?})`, `rescheduleItem(itemId, dateISO)`, `toastWithUndo`/`toast` from the same module `wishlist-board.tsx` imports them from (check its imports and reuse), `useRouter` from `next/navigation`.
- Produces:

```tsx
export function UnscheduleItemButton(props: {
  itemId: string;
  itemTitle: string;
  /** Pre-mutation schedule, for the undo. */
  date: string;
  startTime: string | null;
  endTime: string | null;
}): React.JSX.Element;
```

**Undo rules (must match Task 6 semantics exactly):**
- `mode === "placement-removed"` → undo = `scheduleItem(sourceItemId, { date, startTime?, endTime? })` — re-places the surviving idea (a new copy; the old row is gone by design).
- `mode === "unslotted"` → undo = `rescheduleItem(itemId, date)` — restores the date in place; times were never cleared. (NOT `scheduleItem(itemId, …)`: an un-slotted no-stop item now classifies as an idea and would be copied instead of restored.)
- Toast titles: placement-removed → `"Removed from this plan"`, description `"<title> is still on the Wishlist"`; unslotted with stop → `"Moved to things to do"`; unslotted without stop → `"Moved to Wishlist"`. The old blanket "Moved to Wishlist" was P1-5's documented lie — these must match what actually happened. (Pass a `hadStop: boolean` prop if the button needs it; derive from the entry's `item.stopId` at the call site.)

- [ ] **Step 1: Write failing tests** — `unschedule-item-button.test.tsx`:

```tsx
it("placement-removed: undo re-schedules the SOURCE idea", async () => {
  unscheduleItemMock.mockResolvedValue({ success: true, mode: "placement-removed", sourceItemId: "idea-1" });
  render(<UnscheduleItemButton itemId="placed-1" itemTitle="Colosseum" date="2026-07-02" startTime="10:00" endTime={null} hadStop />);
  await userEvent.click(screen.getByRole("button", { name: /unschedule/i }));
  expect(unscheduleItemMock).toHaveBeenCalledWith("placed-1");
  // fire the captured onUndo from the toastWithUndo mock:
  await capturedOnUndo();
  expect(scheduleItemMock).toHaveBeenCalledWith("idea-1", { date: "2026-07-02", startTime: "10:00" });
});

it("unslotted: undo restores the date in place via rescheduleItem", async () => {
  unscheduleItemMock.mockResolvedValue({ success: true, mode: "unslotted", sourceItemId: null });
  render(<UnscheduleItemButton itemId="direct-1" itemTitle="Dinner" date="2026-07-03" startTime={null} endTime={null} hadStop />);
  await userEvent.click(screen.getByRole("button", { name: /unschedule/i }));
  await capturedOnUndo();
  expect(rescheduleItemMock).toHaveBeenCalledWith("direct-1", "2026-07-03");
  expect(scheduleItemMock).not.toHaveBeenCalled();
});
```

`timeline.test.tsx`: renders the button for a timed item when `showUnschedule` is true and `variant="day"`, and NOT in the agenda variant. `wishlist-board.test.tsx`: assert no element with name `/unschedule/i` renders (the dead branch is gone).

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement.**
  1. `unschedule-item-button.tsx`: `"use client"`; ghost `Button` (same classes as the old dead branch in `item-card.tsx`, `CalendarX` icon, label "Unschedule"); on click `await unscheduleItem(itemId)`; on success show the mode-appropriate `toastWithUndo` (titles above) and `router.refresh()`; on failure destructive `toast`. Wrap the undo callbacks in try/catch → destructive "Couldn't undo" toast (same pattern the old `handleUnschedule` used). After a successful undo, `router.refresh()`.
  2. `timeline.tsx`: add optional `showUnschedule?: boolean` to `TimelineProps`; in `TimedItemRow` and the untimed item rows, when `isDay && showUnschedule && e.item.date` render `<UnscheduleItemButton itemId={e.item.id} itemTitle={e.item.title} date={e.item.date} startTime={e.item.startTime ?? null} endTime={e.item.endTime ?? null} hadStop={e.item.stopId != null} />` alongside the row (Timeline stays a server component — the button is the client island). Thread whatever item fields the row types are missing through the existing `DayPlan` types — check `lib/day-plan.ts` (or wherever `DayPlan` lives; find it via the `timeline.tsx` import) and extend the item selects feeding it if `stopId`/`startTime`/`endTime`/`date` aren't already present.
  3. Day page: pass `showUnschedule` to its `<Timeline variant="day" …>`.
  4. `wishlist-board.tsx`: delete `handleUnschedule` (lines 137–167) and both `onUnschedule={handleUnschedule}` props; drop the now-unused `unscheduleItem`/`scheduleItem` imports if unused.
  5. `item-card.tsx`: delete the `onUnschedule` prop from `ItemCardProps` and the dead button branch (per P1-5 step 3: the control lives where scheduled items render, and `ItemCard` only ever renders in wishlist mode).

- [ ] **Step 4: Run the four test files, then `npm test` and `npx tsc --noEmit` — all PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(day): reachable Unschedule with honest toast and working undo (P1-5)"`

---

### Task 8: Move the tx flow helpers out of the `"use server"` file

**Files:**
- Create: `server/actions/stop-flow.ts` (NO `"use server"`)
- Modify: `server/actions/stops.ts` (delete the moved code + import it)
- Modify: `server/actions/trips.ts:11` and `server/actions/chapters.ts:14` (imports)
- Test: existing suites (`stops.test.ts`, `chapters.test.ts`, `trips.test.ts`) must pass unchanged — this is a pure move.

**Interfaces:**
- Produces: `server/actions/stop-flow.ts` exporting, with signatures byte-identical to today's `stops.ts` versions: `recomputeChapterSpans(tx, tripId, forkId)`, `shiftStopPayloadTx(tx, stop, newArrive, newDepart)`, `reflowSpanTx(tx, tripId, forkId, movedIds)`. Task 9 adds the lock helpers to this same file.

**Why:** `stops.ts:1` is `"use server"`, which registers every export as a public, unauthenticated POST endpoint. These three take a `Prisma.TransactionClient` and have no auth — today unexploitable (a deserialized plain object throws before writing), but they must not be network-reachable at all. Precedent for helper files in `server/actions/` without the directive: `target-cleanup.ts`.

- [ ] **Step 1: Create `stop-flow.ts`** — move the three functions VERBATIM (including their comment blocks) plus exactly the imports they need: `Prisma` type, `db`-independent helpers `planScope`/`PlanId`, `spanReflow`, `compareScheduled`, `chapterSpan`, `spanContributors`, `shiftItemDates`/`shiftAccommodationDates`/`PayloadShiftResult`, `daysBetween`, `FlowConflict` type. Export `type { PayloadShiftResult }` re-exports only if consumers imported them from `stops.ts` (check: `chapters.ts` imports `reflowSpanTx, type ReorderResult` from stops — `ReorderResult` STAYS in `stops.ts`; update `chapters.ts` to `import { reflowSpanTx } from "@/server/actions/stop-flow"; import type { ReorderResult } from "@/server/actions/stops";`).

- [ ] **Step 2: Update the three importers.** `stops.ts` deletes the moved bodies and adds `import { recomputeChapterSpans, shiftStopPayloadTx, reflowSpanTx } from "@/server/actions/stop-flow";` — note `stops.ts` must NOT re-export them (that would re-register them as actions). `trips.ts:11` → `from "@/server/actions/stop-flow"`. Grep to confirm no other importers: `grep -rn "from \"@/server/actions/stops\"" --include="*.ts*"` — anything importing the three helpers from `stops` must be updated (test files included, e.g. mocks of `@/server/actions/stops` in `chapters.test.ts`/`trips.test.ts` may need a parallel `vi.mock("@/server/actions/stop-flow", …)`).

- [ ] **Step 3: Run** `npx vitest run server/actions/stops.test.ts server/actions/chapters.test.ts server/actions/trips.test.ts` then `npx tsc --noEmit` then `npm run build`. All green. The build step matters: it's what compiles the server-action manifest — confirm it succeeds with the helpers now out of the actions file.

- [ ] **Step 4: Commit** — `git commit -m "refactor(stops): tx flow helpers out of the use-server surface"`

---

### Task 9: Canonical lock acquisition across every reorder path (+ ADR 0007 amendment)

**Files:**
- Modify: `server/actions/stop-flow.ts` (add the two lock helpers)
- Modify: `server/actions/stops.ts` (`createStop` ~line 306, `moveStop` ~line 669, `reorderStops` ~line 1337)
- Modify: `server/actions/chapters.ts:223-229` (`reorderChapters`)
- Modify: `server/actions/transport.ts:420-427` (`reorderTransports`)
- Modify: `docs/adr/0007-concurrency-locking-and-tx-boundaries.md` (amendment note)
- Test: `server/actions/stops.test.ts`, `chapters.test.ts`, `transport.test.ts` (call-shape assertions on `$queryRaw`)

**Interfaces:**
- Produces (Task 10's integration tests import these):

```ts
// stop-flow.ts
/** Locks ALL of a plan's stops FOR UPDATE in canonical (id) order. ADR 0007:
 *  every path that will write stop rows in a plan takes this same lock over
 *  the same row set in the same order, so concurrent editors queue instead
 *  of deadlocking. Returns rows sorted by sortOrder for caller convenience. */
export async function lockPlanStopsTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  forkId: PlanId,
): Promise<Array<{ id: string; sortOrder: number; chapterId: string | null; chapterSortOrder: number | null; arriveDate: string | null }>>;

/** Same canonical lock for a plan's transports. */
export async function lockPlanTransportsTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  forkId: PlanId,
): Promise<Array<{ id: string; sortOrder: number }>>;
```

**The canonical rule (this is the ADR amendment):** any transaction that writes Stop ordering/dates locks ALL the plan's stops — never a subset — with `SELECT … FOR UPDATE` ordered by `"id"` (acquisition order), then sorts in JS for logic order. Rationale: (a) identical row set + identical acquisition order ⇒ two concurrent lockers can't deadlock, they serialize; (b) full-plan lock is required anyway because `reflowSpanTx` reads and writes the whole plan (`stops.ts` reflow paths already write rows outside the dragged subset).

- [ ] **Step 1: Write the lock helpers in `stop-flow.ts`:**

```ts
export async function lockPlanStopsTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  forkId: PlanId,
) {
  const rows = await tx.$queryRaw<
    Array<{ id: string; sortOrder: number; chapterId: string | null; chapterSortOrder: number | null; arriveDate: string | null }>
  >`
    SELECT "id", "sortOrder", "chapterId", "chapterSortOrder", "arriveDate"
    FROM "Stop"
    WHERE "tripId" = ${tripId}
      AND "forkId" ${forkId ? Prisma.sql`= ${forkId}` : Prisma.sql`IS NULL`}
    ORDER BY "id" ASC
    FOR UPDATE
  `;
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function lockPlanTransportsTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  forkId: PlanId,
) {
  return tx.$queryRaw<Array<{ id: string; sortOrder: number }>>`
    SELECT "id", "sortOrder"
    FROM "Transport"
    WHERE "tripId" = ${tripId}
      AND "forkId" ${forkId ? Prisma.sql`= ${forkId}` : Prisma.sql`IS NULL`}
    ORDER BY "id" ASC
    FOR UPDATE
  `;
}
```

(`Prisma` value import needed in `stop-flow.ts` for `Prisma.sql`.)

- [ ] **Step 2: Write failing call-shape tests.** In each action test file, assert the lock SQL now goes through the canonical shape. The suites mock `db`, so assert on the `$queryRaw` template strings received by the tx mock — e.g. in `stops.test.ts`:

```ts
it("reorderStops locks the WHOLE plan's stops in id order, not just the dragged ids", async () => {
  // ...existing reorderStops test setup...
  await reorderStops(tripId, items, undefined);
  const lockSql = queryRawMock.mock.calls.map((c) => c[0].join("?")).find((s) => s.includes("FOR UPDATE"));
  expect(lockSql).toContain('FROM "Stop"');
  expect(lockSql).toContain('"tripId" =');          // plan-scoped, not id-list
  expect(lockSql).toContain('ORDER BY "id" ASC');
  expect(lockSql).not.toContain("ANY(");
});
```

Mirror for `reorderChapters` (same assertions) and `reorderTransports` (`FROM "Transport"` + `FOR UPDATE` present at all).

- [ ] **Step 3: Rewire the five paths:**
  - `createStop` (~306): replace the inline `$queryRaw` with `const siblings = await lockPlanStopsTx(tx, tripId, forkId ?? null);` — the returned shape carries the same fields the code reads (`id`, `sortOrder`, `chapterId`, `chapterSortOrder`), already sorted by `sortOrder`.
  - `moveStop` (~669): replace the inline lock with `const siblings = await lockPlanStopsTx(tx, stop.tripId, stop.forkId ?? null);` (it only reads `id`/`sortOrder`; extra fields are harmless).
  - `reorderStops` (~1337): replace the `ANY(${ids})` lock with `const lockedRows = await lockPlanStopsTx(tx, tripId, reorderForkId);` then keep the existing validation by building `byId` from `lockedRows` — the "every id must exist and belong to this trip" loop keeps working because every plan stop is in `lockedRows` (a passed-in id NOT in the locked set fails exactly as before via `byId.get(id)` returning undefined; the `r.tripId !== tripId` check disappears since the query is tripId-scoped — keep throwing `STOP_NOT_IN_TRIP` when `!r`).
  - `reorderChapters` (`chapters.ts:223-229`): replace its `ANY(${stopIds})` lock with `await lockPlanStopsTx(tx, tripId, forkId ?? null);` (result unused — the lock is the point; the function already has the ordered items it plans to write).
  - `reorderTransports` (`transport.ts:420-427`): first line inside the `$transaction`: `await lockPlanTransportsTx(tx, tripId, forkId ?? null);`.

- [ ] **Step 4: Run the three suites + `npm test` — PASS.**

- [ ] **Step 5: Amend ADR 0007** — append:

```markdown
## Amendment (2026-09-07, reliability round)

Lock acquisition is now canonical: every transaction that writes a plan's
Stop ordering or dates takes `lockPlanStopsTx` (all the plan's stops,
`ORDER BY "id" FOR UPDATE`) — never a subset, never a different order.
Previously reorderStops/reorderChapters locked only the dragged ids with no
ORDER BY (deadlock-prone against moveStop/createStop's full-plan sortOrder-
ordered lock, and under-locked given reflowSpanTx writes the whole plan),
and reorderTransports took no lock at all (now `lockPlanTransportsTx`).
Verified by call-shape unit tests and `test/integration/locking.test.ts`
against real Postgres.
```

- [ ] **Step 6: Commit** — `git commit -m "fix(reorder): canonical full-plan lock order everywhere (ADR 0007)"`

---

### Task 10: Real-Postgres integration suite + CI job

**Files:**
- Create: `vitest.integration.config.ts`
- Create: `test/integration/locking.test.ts`
- Modify: `package.json` (add `"test:integration"` script; exclude `test/integration` from the unit config's reach if needed — the unit `vitest.config.ts` includes `**/*.test.{ts,tsx}`, so ADD `'test/integration/**'` to its `exclude` list)
- Modify: `.github/workflows/ci.yml` (new `integration` job)

**Interfaces:**
- Consumes: real `db` from `@/lib/db`; the actual `moveStop`, `reorderStops` from `@/server/actions/stops`, `reorderTransports` from `@/server/actions/transport`; `lockPlanStopsTx` from `@/server/actions/stop-flow`. Auth/Next boundaries are mocked (`@/lib/guards`, `next/cache`, `next/navigation`) so the REAL actions run against the REAL database.

- [ ] **Step 1: `vitest.integration.config.ts`:**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/integration/**/*.test.ts'],
    // These tests share one database — no parallel files/tests.
    fileParallelism: false,
    testTimeout: 30_000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

And in `vitest.config.ts`, extend `exclude`: `exclude: ['node_modules', '.next', 'test/integration/**']`.

- [ ] **Step 2: `test/integration/locking.test.ts`:**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock ONLY the Next/auth boundary — the real actions then run against the
// real Postgres pointed at by DATABASE_URL (CI service container or local
// docker-compose).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/guards", () => ({
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
  requireStopAccess: vi.fn(),
  requireTransportAccess: vi.fn(),
}));

import { db } from "@/lib/db";
import { moveStop, reorderStops } from "@/server/actions/stops";
import { reorderTransports } from "@/server/actions/transport";
import { requireStopAccess } from "@/lib/guards";

const TRIP_ID = "it-trip-locking";

describe.skipIf(!process.env.DATABASE_URL)("reorder locking (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it@example.test", name: "IT" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });  // cascades stops/transports
    await db.trip.create({ data: { id: TRIP_ID, name: "Locking IT", homeCurrency: "AUD", members: { create: { userId: "it-user", role: "owner" } } } });
    await db.stop.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        id: `it-stop-${i}`, tripId: TRIP_ID, name: `Stop ${i}`, sortOrder: i,
      })),
    });
    vi.mocked(requireStopAccess).mockImplementation(async (stopId: string) => {
      const stop = await db.stop.findUniqueOrThrow({ where: { id: stopId } });
      return { ...stop, tripId: TRIP_ID } as never;
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("concurrent moveStop + reorderStops never deadlock and leave a valid permutation", async () => {
    for (let round = 0; round < 10; round++) {
      const reversed = (await db.stop.findMany({ where: { tripId: TRIP_ID }, orderBy: { sortOrder: "asc" } }))
        .reverse()
        .map((s) => ({ id: s.id, chapterId: null }));
      const results = await Promise.all([
        reorderStops(TRIP_ID, reversed, undefined),
        moveStop("it-stop-2", "up"),
        moveStop("it-stop-4", "down"),
      ]);
      for (const r of results) expect(r.success).toBe(true); // no 40P01 deadlock abort
      const after = await db.stop.findMany({ where: { tripId: TRIP_ID }, orderBy: { sortOrder: "asc" } });
      expect(new Set(after.map((s) => s.sortOrder)).size).toBe(6); // distinct, no scramble
    }
  });

  it("concurrent reorderTransports serialize instead of interleaving", async () => {
    await db.transport.createMany({
      data: Array.from({ length: 4 }, (_, i) => ({
        id: `it-tr-${i}`, tripId: TRIP_ID, mode: "TRAIN", sortOrder: i,
      })),
    });
    const orderA = [0, 1, 2, 3].map((i, idx) => ({ id: `it-tr-${i}`, anchorStopId: null, sortOrder: idx }));
    const orderB = [3, 2, 1, 0].map((i, idx) => ({ id: `it-tr-${i}`, anchorStopId: null, sortOrder: idx }));
    for (let round = 0; round < 10; round++) {
      await Promise.all([reorderTransports(TRIP_ID, orderA), reorderTransports(TRIP_ID, orderB)]);
      const after = await db.transport.findMany({ where: { tripId: TRIP_ID }, orderBy: { sortOrder: "asc" } });
      // One writer won wholesale: the result is exactly orderA or orderB,
      // never an interleaving with duplicate/missing sortOrders.
      expect(after.map((t) => t.sortOrder)).toEqual([0, 1, 2, 3]);
      const ids = after.map((t) => t.id).join(",");
      expect([orderA, orderB].map((o) => [...o].sort((x, y) => x.sortOrder - y.sortOrder).map((x) => x.id).join(","))).toContain(ids);
    }
  });
});
```

NOTE for the implementer: the exact required fields on `trip.create`/`stop.createMany`/`transport.createMany` must match `prisma/schema.prisma` (check which columns are non-nullable without defaults and add them — e.g. Transport may require `depPlace`/`arrPlace` strings). Adjust the seed data, not the assertions.

- [ ] **Step 3: package script:** `"test:integration": "vitest run --config vitest.integration.config.ts"`.

- [ ] **Step 4: CI job** — append to `.github/workflows/ci.yml`:

```yaml
  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: trip
          POSTGRES_PASSWORD: trip
          POSTGRES_DB: trip
        ports:
          - "5432:5432"
        options: >-
          --health-cmd "pg_isready -U trip -d trip"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: "postgresql://trip:trip@localhost:5432/trip"
      DIRECT_URL: "postgresql://trip:trip@localhost:5432/trip"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm run test:integration
```

- [ ] **Step 5: Verify what the sandbox can verify:** `npx tsc --noEmit` clean; `npm test` still green (integration dir excluded); `npx vitest run --config vitest.integration.config.ts` — with no reachable `DATABASE_URL` Postgres the suite must SKIP cleanly (that's what `describe.skipIf` is for — but note `.env` may set `DATABASE_URL`; if it points at an unreachable local PG, the suite would try and fail. Guard instead on an explicit opt-in: change the skip to `describe.skipIf(process.env.INTEGRATION !== "1")` and set `INTEGRATION: "1"` in the CI job env + document `INTEGRATION=1 npm run test:integration` for local runs. Apply this guard — it is the deterministic choice.) State in the report: integration tests were NOT executed here (no Postgres in the sandbox); CI will run them on push.

- [ ] **Step 6: Commit** — `git commit -m "test(locking): real-Postgres integration suite + CI job"`

---

### Task 11: Dev-login production guard + fail-loud `DATABASE_URL`

**Files:**
- Modify: `lib/auth.ts:32` (the `ALLOW_DEV_LOGIN` condition)
- Modify: `lib/db.ts:16`
- Test: `lib/auth-dev-login.test.ts` (new), `lib/db.test.ts` (new or extend if exists)

- [ ] **Step 1: Failing tests.** `lib/auth-dev-login.test.ts` (module-level env behaviour → `vi.resetModules` + dynamic import; mock heavyweight imports the module pulls in):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("@/lib/invites", () => ({ reconcileInvitesForUser: vi.fn() }));  // match auth.ts's actual invite import — check and mirror it

async function loadProviders(env: Record<string, string | undefined>) {
  vi.resetModules();
  const prev = { ...process.env };
  Object.assign(process.env, env);
  try {
    const mod = await import("@/lib/auth");
    return mod.authConfig.providers.map((p) => (typeof p === "function" ? "fn" : (p as { id?: string }).id));
  } finally {
    process.env = prev;
  }
}

describe("dev login guard", () => {
  afterEach(() => vi.resetModules());

  it("registers dev-login outside production when enabled", async () => {
    const ids = await loadProviders({ ALLOW_DEV_LOGIN: "true", NODE_ENV: "test" });
    expect(ids).toContain("dev-login");
  });

  it("NEVER registers dev-login in a production build, even when enabled", async () => {
    const ids = await loadProviders({ ALLOW_DEV_LOGIN: "true", NODE_ENV: "production" });
    expect(ids).not.toContain("dev-login");
  });
});
```

(`NODE_ENV` is read-only in some TS setups — write via `Object.assign(process.env, …)` as shown. If `auth.ts` imports pull in more modules that break under jsdom, mock them the same way; keep the test focused on the provider list.)

`lib/db.test.ts` (NOTE: `vi.mock` calls are hoisted — they MUST be at module top level, never inside `it`):

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("@prisma/client", () => ({ PrismaClient: class {} }));

describe("lib/db", () => {
  it("throws a named, actionable error when DATABASE_URL is missing", async () => {
    vi.resetModules();
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(import("@/lib/db")).rejects.toThrow(/DATABASE_URL/);
    } finally {
      process.env.DATABASE_URL = prev;
    }
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement.** `lib/auth.ts`:

```ts
// Dev login is a passwordless sign-in-as-anyone door. The env var opts in,
// and a production build hard-refuses regardless — copying a repo with
// ALLOW_DEV_LOGIN in its .env to a host must never re-open it.
if (process.env.ALLOW_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production") {
```

`lib/db.ts`:

```ts
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. The app cannot run without Postgres — set it in .env (see .env.example) or the deployment environment.",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
```

(Pattern precedent: `lib/storage.ts:105-110` named errors.)

- [ ] **Step 4: Run new tests + `npm test` + `npm run build`** (build matters: it must still pass with `DATABASE_URL` present in `.env` — CI sets a throwaway URL, so the build-time import keeps working).

- [ ] **Step 5: Commit** — `git commit -m "fix(hardening): dev login dead in prod builds; DATABASE_URL fails loudly"`

---

### Task 12: Cron batch cap + `useServerAction` rejection handling

**Files:**
- Modify: `app/api/cron/reminders/route.ts` (the `dueReminders` query, ~line 84)
- Modify: `components/ui/use-server-action.ts:43-51`
- Test: the route's existing test file (find it: `app/api/cron/reminders/route.test.ts` or similar — the reminders logic has tests per the July branch history), `components/ui/use-server-action.test.tsx` (extend/create)

- [ ] **Step 1: Failing tests.**

Cron: assert the query now bounds and orders the batch:

```ts
it("processes at most 200 due reminders per run, oldest first", async () => {
  await GET(makeAuthedRequest());
  expect(reminderFindManyMock).toHaveBeenCalledWith(
    expect.objectContaining({ take: 200, orderBy: { fireAt: "asc" } }),
  );
});
```

Hook — a rejected action must not strand `isPending`/silently vanish:

```tsx
it("surfaces a rejected action as a form-level error and calls onError", async () => {
  const boom = vi.fn().mockRejectedValue(new Error("offline"));
  const onError = vi.fn();
  const { result } = renderHook(() => useServerAction(boom, { onError }));
  act(() => result.current.run());
  await waitFor(() => expect(result.current.isPending).toBe(false));
  expect(result.current.errors.form).toEqual(["Something went wrong. Check your connection and try again."]);
  expect(onError).toHaveBeenCalledWith({ form: ["Something went wrong. Check your connection and try again."] });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement.**

Cron (`route.ts`): add to the `findMany`:

```ts
const dueReminders = await db.reminder.findMany({
  where: { fireAt: { lte: now }, sent: false },
  // Bounded batch: after an outage the backlog drains across successive
  // */5 runs instead of one request that can outlive a serverless timeout.
  orderBy: { fireAt: "asc" },
  take: 200,
  select: { /* unchanged */ },
});
```

Hook (`use-server-action.ts`), inside `startTransition`:

```ts
startTransition(async () => {
  let result: ActionResult<TSuccess>;
  try {
    result = await actionRef.current(...args);
  } catch {
    // A rejected action (network drop, server crash) must never vanish
    // silently — surface it like a failed result.
    const errors: FieldErrors = { form: ["Something went wrong. Check your connection and try again."] };
    setErrors(errors);
    optionsRef.current?.onError?.(errors, ...args);
    return;
  }
  if (!result.success) {
    setErrors(result.errors);
    optionsRef.current?.onError?.(result.errors, ...args);
    return;
  }
  optionsRef.current?.onSuccess?.(result, ...args);
});
```

(Check `lib/action-result.ts` for the conventional form-level error key — if the codebase uses a different key than `form` (grep for `errors.form` / `formError`), use that key in both code and tests.)

- [ ] **Step 4: Run both test files + `npm test` — PASS.**

- [ ] **Step 5: Commit** — `git commit -m "fix(ops): bounded reminder batches; useServerAction survives rejections"`

---

### Task 13: Dependency updates — audit fix + Next 16.3.4+

**Files:**
- Modify: `package.json`, `package-lock.json`

**Order matters: this task runs AFTER all code tasks** so any breakage it causes is isolated to this diff.

- [ ] **Step 1:** `npm audit fix` (NO `--force` — the `--force` suggestions downgrade Prisma to v6 and are wrong). Then `npm install next@16.3 --save-exact` (resolves the latest 16.3.x — must be ≥ 16.3.4; verify with `npm ls next`). `eslint-config-next`/`@next/*` devDeps, if pinned, bump to the same version.

- [ ] **Step 2: Verify advisories cleared:** `npm audit --omit=dev` — expect the `@auth/core` criticals and the `next` + `sharp` highs GONE. Remaining advisories that require `--force`/major bumps (deepmerge-ts, mysql2, fast-uri via prisma's tree — unused MySQL path) are accepted and listed in the task report verbatim.

- [ ] **Step 3: Full gates:** `npm test` && `npx tsc --noEmit` && `npm run lint` && `npm run build`. Next minor bumps can change build behaviour — if the build breaks, fix forward only for trivial issues (renamed config keys); anything substantive → STOP and report, do not creatively refactor.

- [ ] **Step 4: Commit** — `git commit -m "chore(deps): audit fix + next 16.3.x (auth/core criticals, middleware bypass)"`

---

### Task 14: Docs sweep — HANDOFF.md truth, things-to-fix statuses

**Files:**
- Modify: `docs/HANDOFF.md` §1 (lines ~38-137: the SQLite claims)
- Modify: `docs/things-to-fix.md` (P0-4 and P1-5 status lines)

- [ ] **Step 1: `docs/HANDOFF.md`** — rewrite the stale §1 claims to match reality (verify each claim against the code as you write it):
  - Line ~38: local dev ALSO runs Postgres (docker-compose), not SQLite; delete the "switch" framing — the switch already happened (ADR 0005).
  - Line ~42: `schema.prisma` datasource provider is `postgresql` (verify by reading the file).
  - Line ~49-54: `lib/db.ts` uses `PrismaPg` from `@prisma/adapter-pg` (and now throws when `DATABASE_URL` is missing — mention it).
  - Line ~113-114: migrations under `prisma/migrations/` are the Postgres baseline; `migration_lock.toml` pins `postgresql`.
  - Line ~137: drop or rewrite the "switching providers" note to past tense.
  Keep the section's structure; change only falsehoods. Do not renumber other sections.

- [ ] **Step 2: `docs/things-to-fix.md`** — under P0-4 add `**Status: FIXED** (fix/reliability-round, <commit sha of Task 5>).` and under P1-5 add `**Status: FIXED** (fix/reliability-round, <shas of Tasks 6-7>).` (real shas from `git log --oneline`). Update the intro line "The two items in this section are *newer* and **open**" to reflect they're now fixed.

- [ ] **Step 3: Full final gates:** `npm test` && `npx tsc --noEmit` && `npm run lint` && `npm run build` — all green.

- [ ] **Step 4: Commit** — `git commit -m "docs: HANDOFF Postgres truth; mark P0-4/P1-5 fixed"`

---

## Verification (whole branch)

1. `npm test` — full unit suite green (expect ~2,940+, grew by this branch's tests).
2. `npx tsc --noEmit`, `npm run lint`, `npm run build` — clean.
3. Integration suite: NOT runnable in this sandbox (no Postgres) — runs in CI on push. Say so explicitly in the final report; do not claim it passed locally.
4. `npm audit --omit=dev` — no critical; remaining highs listed and justified (prisma-tree transitive, unused MySQL path).
5. Final whole-branch review (per CLAUDE.md) with special attention to the cross-cutting seams: Task 6's `scheduleItem` classification change × Task 5's drop handler × Task 7's undo paths; Task 8's helper move × Task 9's lock call sites.
6. Branch stays UNMERGED and UNDEPLOYED. Merging is the owner's call; the orphan sweep script needs a manual prod dry-run per `docs/DEPLOY.md`.
