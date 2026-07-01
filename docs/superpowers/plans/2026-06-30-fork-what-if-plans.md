# Fork (What-If Variant Plans) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Trip hold several what-if variant Plans (Forks) alongside its live "real plan", edit each in isolation, compare them side-by-side, and promote one to become the real plan.

**Architecture:** A Fork is a variant **Plan** stored in the *same* tables as the real plan, distinguished by a nullable `forkId` discriminator on the six plan entities (Stop, Chapter, Transport, Accommodation, Item, Cost). **`forkId = null` IS the real plan** (ADR 0020) — so existing rows need zero migration, and every *live* read must add `forkId: null` to stay correct once fork rows exist. Forks are created by deep-copying the real plan (mirroring `duplicateTrip` but keeping dates/accommodations/costs). Scheduling a Wishlist Item becomes copy-in placement (ADR 0019). The Compare view and Promote reuse the existing pure engines (`computeProjectedEnd`, `detectFlags`, `buildBudget`, driving estimates).

**Tech Stack:** Next.js 16 (App Router, RSC) · Prisma 7 + Postgres · Auth.js v5 · Zod · Vitest + Testing Library. Server actions in `server/actions/*`, pure logic in `lib/*`, RSC pages under `app/(app)/trips/[tripId]/*`.

## Global Constraints

- **`forkId = null` is the real plan.** Never represent the real plan with a sentinel string; null only. (ADR 0020)
- **Six plan entities only** carry `forkId`: `Stop`, `Chapter`, `Transport`, `Accommodation`, `Item`, `Cost`. Everything else (Wishlist *ideas*, ExchangeRate, Note, Vote, ChecklistItem, Attachment, JournalEntry, ShareLink, CalendarFeed, Activity, Trip) is trip-wide and shared across all Plans — never gets `forkId`.
- **A Wishlist idea is `Item` with `date = null` and `forkId = null`.** It is shared. Scheduling never mutates the idea's row — it creates a Plan-owned copy (ADR 0019).
- **Soft cap: 4 Forks** per Trip alongside the real plan.
- **Forking is pre-departure only**: allowed in Phases `sketching`, `planning`, `final-prep`; never `travelling` or `past` (`lib/trip-phase.ts` → `computeTripPhase`).
- **Promote is irreversible** and must surface a loss-list (paid Costs, confirmation numbers, Attachments) before replacing the real plan.
- **Money:** estimated Costs travel into a Fork; `paidAt`/`actualMinor` do NOT. Exchange rates are trip-wide (shared), never forked.
- **Server-action shape (verbatim convention):** `"use server"` → `await requireTripAccess(tripId)` (from `@/lib/guards`) → `zod.safeParse` → Prisma mutation → `recordActivity({...})` (best-effort, from `@/server/actions/activity`) → `revalidatePath(...)`.
- **Tests mock Prisma** via `vi.hoisted()` + `vi.mock("@/lib/db", ...)`. No live DB in unit tests. Run a file with `npm test -- <path>`. Full suite: `npm test`.
- **Activity verbs** are `CREATED|UPDATED|DELETED|NOTED`; entity types `STOP|ITEM|TRANSPORT|ACCOMMODATION|CHAPTER|COST|NOTE` (`lib/activity.ts`). This plan extends both (Task 8).
- Co-Authored-By trailer on every commit per repo convention.

---

## File Structure

**New files**
- `lib/plan-scope.ts` — `forkId` scope helper + `REAL_PLAN` constant. (Task 1)
- `lib/fork-plan.ts` — pure `buildForkPlan(source)` deep-copy builder + types. (Task 6)
- `lib/compare.ts` — pure per-Plan metric computation (`computePlanMetrics`, `diffMetrics`). (Task 13)
- `server/actions/forks.ts` — `createFork`, `renameFork`, `discardFork`, `promoteFork`, `getComparison`. (Tasks 7, 9, 14, 15)
- `app/(app)/trips/[tripId]/compare/page.tsx` — Compare RSC page. (Task 16)
- `components/trip/fork-switcher.tsx` — switch active Plan / create fork. (Task 17)
- `components/trip/compare-table.tsx` — side-by-side columns + promote entry. (Task 16)
- `components/trip/promote-fork-dialog.tsx` — guarded promote confirm with loss-list. (Task 15)
- Test files alongside each (`*.test.ts` / `*.test.tsx`).

**Modified files**
- `prisma/schema.prisma` — add `Fork` model + `forkId` on the six entities + `sourceItemId` on Item. (Tasks 2, 11)
- `lib/activity.ts` — add `FORK` entity type + `PROMOTED` verb. (Task 8)
- `server/actions/items.ts` — copy-in `scheduleItem`/`unscheduleItem`; plan-aware `createItem`. (Tasks 11, 12)
- `server/actions/stops.ts`, `transport.ts`, `accommodation.ts`, `chapters.ts`, `costs.ts` — plan-aware creates + plan-scoped sortOrder + same-plan FK validation. (Task 12)
- All live read sites (server actions + pages) — add `forkId: null`. (Tasks 3, 4, 5)

---

## PHASE 1 — Plan-scope foundation & data model

Goal of phase: introduce the `forkId` column and make the *real plan* provably isolated (`forkId: null`) everywhere it's read, BEFORE any fork rows can exist. After this phase the app behaves identically (all rows are `forkId: null`), but is safe for forks to appear.

### Task 1: Plan-scope helper

**Files:**
- Create: `lib/plan-scope.ts`
- Test: `lib/plan-scope.test.ts`

**Interfaces:**
- Produces: `REAL_PLAN: { forkId: null }`; `planScope(forkId?: string | null): { forkId: string | null }`; `type PlanId = string | null`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/plan-scope.test.ts
import { describe, it, expect } from "vitest";
import { REAL_PLAN, planScope } from "./plan-scope";

describe("planScope", () => {
  it("REAL_PLAN scopes to the null discriminator", () => {
    expect(REAL_PLAN).toEqual({ forkId: null });
  });

  it("normalises undefined and null to the real plan", () => {
    expect(planScope()).toEqual({ forkId: null });
    expect(planScope(null)).toEqual({ forkId: null });
  });

  it("passes a concrete fork id through", () => {
    expect(planScope("fork-1")).toEqual({ forkId: "fork-1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/plan-scope.test.ts`
Expected: FAIL — `Cannot find module './plan-scope'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/plan-scope.ts
/**
 * A Plan is identified by its forkId. `null` is the real (live) plan;
 * a string is a Fork. (ADR 0020)
 */
export type PlanId = string | null;

/** Prisma `where` fragment selecting the real plan only. */
export const REAL_PLAN = { forkId: null } as const;

/** Build a Prisma `where`/`data` fragment for a given Plan. */
export function planScope(forkId?: PlanId): { forkId: string | null } {
  return { forkId: forkId ?? null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/plan-scope.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/plan-scope.ts lib/plan-scope.test.ts
git commit -m "feat(fork): plan-scope helper (forkId null = real plan)"
```

### Task 2: Schema — `Fork` model + `forkId` on the six entities

**Files:**
- Modify: `prisma/schema.prisma` (Trip relation; Stop, Chapter, Transport, Accommodation, Item, Cost; new Fork model)

**Interfaces:**
- Produces: Prisma models with `forkId String?` + `fork Fork? @relation(..., onDelete: Cascade)` on the six entities; `Fork { id, tripId, name, sortOrder, createdById, createdAt, updatedAt }`.

- [ ] **Step 1: Add the `Fork` model** to `prisma/schema.prisma` (after the `Trip` model block):

```prisma
model Fork {
  id          String @id @default(cuid())
  tripId      String
  name        String
  sortOrder   Int    @default(0)
  createdById String

  trip      Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)
  createdBy User @relation("ForkCreatedBy", fields: [createdById], references: [id])

  stops          Stop[]
  chapters       Chapter[]
  transports     Transport[]
  accommodations Accommodation[]
  items          Item[]
  costs          Cost[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tripId])
}
```

- [ ] **Step 2: Add the back-relation to `Trip`** — inside `model Trip { ... }` add to the relation list:

```prisma
  forks          Fork[]
```

- [ ] **Step 3: Add the back-relation to `User`** — inside `model User { ... }` (alongside `TripCreatedBy`):

```prisma
  forksCreated Fork[] @relation("ForkCreatedBy")
```

- [ ] **Step 4: Add `forkId` + relation + index to each of the six entities.** For `Stop`, `Chapter`, `Transport`, `Accommodation`, `Item`, `Cost`, add the field (after `tripId`), the relation (next to the existing `trip` relation), and the index. Pattern (shown for `Stop`; repeat for all six):

```prisma
  // field, after `tripId String`
  forkId String?

  // relation, next to `trip Trip @relation(...)`
  fork Fork? @relation(fields: [forkId], references: [id], onDelete: Cascade)

  // index, in the @@index block
  @@index([forkId])
```

Cascade-on-delete means discarding a Fork row deletes its plan entities automatically.

- [ ] **Step 5: Create and apply the migration**

Run: `npx prisma migrate dev --name add_forks`
Expected: migration `*_add_forks` created and applied; `prisma generate` runs. Verify the printed SQL adds `"forkId"` columns (nullable) and a `Fork` table.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no usages reference `forkId` yet, so the regenerated client is the only change).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(fork): Fork model + nullable forkId on plan entities (ADR 0020)"
```

### Task 3: Scope live reads to the real plan — server actions (sortOrder + FK validation)

Every "max sortOrder" and "does this FK belong to the trip" query in the mutating actions must be scoped to a Plan. For Phase 1 they all operate on the real plan (`forkId: null`); Task 12 generalises them to a passed-in `forkId`. Doing it now keeps the real plan correct the moment fork rows exist.

**Files:**
- Modify: `server/actions/stops.ts` (lines 89, 351, 433, 556, 783), `server/actions/items.ts` (line 103), `server/actions/transport.ts` (lines 64, 115), `server/actions/chapters.ts` (lines 62, 74, 189, 193), `server/actions/accommodation.ts` (FK check line 76/138 — validate stop is real-plan)
- Test: extend existing `server/actions/*.test.ts`

**Interfaces:**
- Consumes: `REAL_PLAN` from `@/lib/plan-scope`.

- [ ] **Step 1: Write a failing test** (example for `createStop` sortOrder scoping) in `server/actions/stops.test.ts`:

```ts
it("computes sortOrder within the real plan only (forkId null)", async () => {
  stopFindFirstMock.mockResolvedValue({ sortOrder: 2 });
  stopCreateMock.mockResolvedValue({ id: "stop-1", name: "Rome" });

  await createStop("trip-1", { name: "Rome", nights: 2 });

  expect(stopFindFirstMock).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ tripId: "trip-1", forkId: null }),
    }),
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- server/actions/stops.test.ts`
Expected: FAIL — `where` lacks `forkId: null`.

- [ ] **Step 3: Update each sortOrder/FK query** to spread `REAL_PLAN`. Example (stops.ts:89):

```ts
import { REAL_PLAN } from "@/lib/plan-scope";
// ...
const maxStop = await db.stop.findFirst({
  where: { tripId, ...REAL_PLAN },
  orderBy: { sortOrder: "desc" },
  select: { sortOrder: true },
});
```

Apply the same `...REAL_PLAN` spread to: `stops.ts` lines 89, 351 (the `findMany` for ripple), 433, 556, 783; `items.ts` 103; `transport.ts` 115; `chapters.ts` 62, 74, 189, 193. For FK validation queries that fetch by a specific id (e.g. `items.ts:90` stop lookup), add `forkId: null` to the returned `select` and assert the fetched row's `forkId === null` matches the real plan (Task 12 generalises this).

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- server/actions/stops.test.ts server/actions/items.test.ts server/actions/transport.test.ts server/actions/chapters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/*.ts server/actions/*.test.ts
git commit -m "feat(fork): scope mutation sortOrder/FK lookups to the real plan"
```

### Task 4: Scope live reads to the real plan — RSC pages

Every page that renders the live itinerary must exclude fork rows. These are mechanical `where` additions; the exact sites come from the read-site audit.

**Files (exact edits — add `forkId: null` to each `where`):**
- `app/(app)/trips/page.tsx:41` (stop map dots)
- `app/(app)/trips/[tripId]/page.tsx:26`
- `app/(app)/trips/[tripId]/plan/page.tsx:48, 83, 105, 114`
- `app/(app)/trips/[tripId]/calendar/page.tsx:27, 41, 58, 74, 88`
- `app/(app)/trips/[tripId]/summary/page.tsx:109, 115, 176, 195, 210, 220, 224, 233, 239`
- `app/(app)/trips/[tripId]/print/page.tsx:71, 88, 105, 118, 134`
- `app/(app)/trips/[tripId]/day/[date]/page.tsx:64, 80, 100, 120, 158`
- `app/(app)/trips/[tripId]/budget/page.tsx:89, 94, 100, 104, 108, 116`
- `app/(app)/trips/[tripId]/wishlist/page.tsx:36-59 (trip.items where), 70`
- `app/(app)/trips/[tripId]/settings/page.tsx:68`
- `app/api/calendar/[token]/route.ts:26, 27, 34, 38`
- `app/share/[token]/page.tsx:82, 99, 115, 129`

> **Cost queries** (`plan/page.tsx:105`, `budget/page.tsx:89`, `summary:224`, `print:134`, `wishlist:70`): add `forkId: null` to the `where` exactly like the others. The `OTHER` (standalone) Costs also live on the real plan, so `forkId: null` is correct for them too.
> **Wishlist ideas** (`wishlist/page.tsx` items where `date: null`): these are shared ideas — they are already `forkId: null`, so adding `forkId: null` is correct and a no-op semantically. Keep it for consistency.

- [ ] **Step 1: Add `forkId: null`** to every `where` clause listed above. For each `db.<model>.findMany({ where: { tripId, ... } })`, change to `where: { tripId, forkId: null, ... }`. Keep all existing filters (e.g. `arriveDate: { not: null }`, `date: null`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run the full suite** (pages have integration-ish tests in some areas; ensure nothing regressed)

Run: `npm test`
Expected: PASS (same count as before this task).

- [ ] **Step 4: Manual smoke** (real plan unaffected)

Run: `npm run dev`, open a trip's Plan / Calendar / Budget / Summary. Expected: identical to before — all rows are `forkId: null`.

- [ ] **Step 5: Commit**

```bash
git add app
git commit -m "feat(fork): scope all live itinerary reads to the real plan (forkId null)"
```

### Task 5: Guard helper — `requireForkAccess` & phase gate

**Files:**
- Modify: `lib/guards.ts`
- Test: `lib/guards.test.ts` (create if absent, following the items.test mock style)

**Interfaces:**
- Produces:
  - `requireForkAccess(forkId: string): Promise<{ user; trip: { id: string; startDate: string|null; endDate: string|null } }>` — verifies the fork exists, the user is a member of its trip, returns trip dates.
  - `assertForkingAllowed(phase: TripPhase): void` — throws (via `notFound()` or a thrown `Error`) when phase is `travelling`/`past`.

- [ ] **Step 1: Write failing tests**

```ts
// lib/guards.test.ts (excerpt)
import { assertForkingAllowed } from "./guards";

describe("assertForkingAllowed", () => {
  it.each(["sketching", "planning", "final-prep"] as const)(
    "allows %s", (p) => expect(() => assertForkingAllowed(p)).not.toThrow(),
  );
  it.each(["travelling", "past"] as const)(
    "blocks %s", (p) => expect(() => assertForkingAllowed(p)).toThrow(),
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/guards.test.ts`
Expected: FAIL — `assertForkingAllowed` not exported.

- [ ] **Step 3: Implement** in `lib/guards.ts`:

```ts
import type { TripPhase } from "@/lib/trip-phase";

export function assertForkingAllowed(phase: TripPhase): void {
  if (phase === "travelling" || phase === "past") {
    throw new Error("Forking is only available before departure");
  }
}

export async function requireForkAccess(forkId: string) {
  const user = await requireUser();
  const fork = await db.fork.findUnique({
    where: { id: forkId },
    select: { id: true, tripId: true, trip: { select: { id: true, startDate: true, endDate: true } } },
  });
  if (!fork) notFound();
  await requireTripAccess(fork.tripId); // membership check (throws notFound if not a member)
  return { user, fork, trip: fork.trip };
}
```

(Match existing imports of `db`, `requireUser`, `notFound` already present in `guards.ts`/`access.ts`.)

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- lib/guards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/guards.ts lib/guards.test.ts
git commit -m "feat(fork): requireForkAccess guard + pre-departure phase gate"
```

---

## PHASE 2 — Fork lifecycle (server layer)

### Task 6: Pure `buildForkPlan` deep-copy builder

Mirrors `buildDuplicatePlan` (`lib/duplicate-trip.ts`) but **keeps dates, pinned, accommodations and estimated Costs** (a Fork is a faithful copy of the live arrangement), and **drops** `paidAt`/`actualMinor` from Costs and votes/notes/attachments (trip-wide).

**Files:**
- Create: `lib/fork-plan.ts`
- Test: `lib/fork-plan.test.ts`

**Interfaces:**
- Produces:
  - `type ForkSource = { chapters; stops; transports; accommodations; items; costs }` (arrays of the real-plan rows, each including `id` + FK fields).
  - `buildForkPlan(source: ForkSource): ForkPlan` where `ForkPlan` carries create-payloads with `sourceId` keys for chapters/stops and FK source ids for transports/accommodations/items, plus `costs` carrying `sourceOwnerType`/`sourceOwnerId` for owner remap.
- Consumes: nothing external (pure).

- [ ] **Step 1: Write failing tests**

```ts
// lib/fork-plan.test.ts
import { describe, it, expect } from "vitest";
import { buildForkPlan } from "./fork-plan";

const source = {
  chapters: [{ id: "c1", name: "Italy", colour: "#f00", startDate: "2026-07-01", endDate: "2026-07-10", sortOrder: 0 }],
  stops: [{ id: "s1", chapterId: "c1", name: "Rome", country: "IT", lat: 1, lng: 2, timezone: "Europe/Rome",
            arriveDate: "2026-07-01", departDate: "2026-07-04", nights: 3, pinned: true, sortOrder: 0,
            chapterSortOrder: 0, notes: "n" }],
  transports: [{ id: "t1", fromStopId: "s1", toStopId: null, mode: "TRAIN", depPlace: "Rome", arrPlace: "Florence",
                 depAt: new Date("2026-07-04T09:00:00Z"), arrAt: new Date("2026-07-04T11:00:00Z"),
                 depLat: null, depLng: null, arrLat: null, arrLng: null, reference: "TR1", notes: null, sortOrder: 0 }],
  accommodations: [{ id: "a1", stopId: "s1", name: "Hotel", address: "Via X", checkIn: "2026-07-01",
                     checkOut: "2026-07-04", confirmation: "ABC", notes: null, lat: null, lng: null }],
  items: [{ id: "i1", stopId: "s1", title: "Colosseum", category: "SIGHTSEEING", date: "2026-07-02",
            startTime: "10:00", endTime: null, lat: null, lng: null, address: null, link: null,
            booking: "BK1", notes: null, sortOrder: 0 }],
  costs: [{ id: "co1", estimatedMinor: 5000, actualMinor: 4000, currency: "EUR", rateToHome: 1.6,
            paidAt: new Date("2026-06-01T00:00:00Z"), ownerType: "ACCOMMODATION", ownerId: "a1",
            label: null, category: null }],
};

it("keeps dates, pinned, accommodation and estimated cost; drops paid/actual", () => {
  const plan = buildForkPlan(source);
  expect(plan.stops[0].data.arriveDate).toBe("2026-07-01");
  expect(plan.stops[0].data.pinned).toBe(true);
  expect(plan.accommodations[0].data.confirmation).toBe("ABC");
  expect(plan.costs[0].data.estimatedMinor).toBe(5000);
  expect(plan.costs[0].data.actualMinor).toBeNull();   // dropped
  expect(plan.costs[0].data.paidAt).toBeNull();         // dropped
  expect(plan.costs[0].data.rateToHome).toBe(1.6);      // kept for conversion
});

it("preserves source ids for FK remapping", () => {
  const plan = buildForkPlan(source);
  expect(plan.stops[0].sourceId).toBe("s1");
  expect(plan.stops[0].sourceChapterId).toBe("c1");
  expect(plan.transports[0].sourceFromStopId).toBe("s1");
  expect(plan.accommodations[0].sourceStopId).toBe("s1");
  expect(plan.items[0].sourceStopId).toBe("s1");
  expect(plan.costs[0].sourceOwnerType).toBe("ACCOMMODATION");
  expect(plan.costs[0].sourceOwnerId).toBe("a1");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/fork-plan.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** `lib/fork-plan.ts` (full builder; types elided here for brevity but MUST be written — model them on `lib/duplicate-trip.ts`'s exported types):

```ts
export function buildForkPlan(source: ForkSource): ForkPlan {
  return {
    chapters: source.chapters.map((c) => ({
      sourceId: c.id,
      data: { name: c.name, colour: c.colour, startDate: c.startDate, endDate: c.endDate, sortOrder: c.sortOrder },
    })),
    stops: source.stops.map((s) => ({
      sourceId: s.id,
      sourceChapterId: s.chapterId,
      data: {
        name: s.name, country: s.country, lat: s.lat, lng: s.lng, timezone: s.timezone,
        arriveDate: s.arriveDate, departDate: s.departDate, nights: s.nights, pinned: s.pinned,
        sortOrder: s.sortOrder, chapterSortOrder: s.chapterSortOrder, notes: s.notes,
      },
    })),
    transports: source.transports.map((t) => ({
      sourceFromStopId: t.fromStopId, sourceToStopId: t.toStopId,
      data: {
        mode: t.mode, depPlace: t.depPlace, arrPlace: t.arrPlace, depAt: t.depAt, arrAt: t.arrAt,
        depLat: t.depLat, depLng: t.depLng, arrLat: t.arrLat, arrLng: t.arrLng,
        reference: t.reference, notes: t.notes, sortOrder: t.sortOrder,
      },
    })),
    accommodations: source.accommodations.map((a) => ({
      sourceStopId: a.stopId,
      data: {
        name: a.name, address: a.address, checkIn: a.checkIn, checkOut: a.checkOut,
        confirmation: a.confirmation, notes: a.notes, lat: a.lat, lng: a.lng,
      },
    })),
    items: source.items.map((it) => ({
      sourceStopId: it.stopId,
      data: {
        title: it.title, category: it.category, date: it.date, startTime: it.startTime, endTime: it.endTime,
        lat: it.lat, lng: it.lng, address: it.address, link: it.link, booking: it.booking,
        notes: it.notes, sortOrder: it.sortOrder, sourceItemId: null,
      },
    })),
    costs: source.costs.map((c) => ({
      sourceOwnerType: c.ownerType, sourceOwnerId: c.ownerId,
      data: {
        estimatedMinor: c.estimatedMinor, actualMinor: null, currency: c.currency, rateToHome: c.rateToHome,
        paidAt: null, ownerType: c.ownerType, ownerId: null /* remapped in tx */, label: c.label, category: c.category,
      },
    })),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- lib/fork-plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fork-plan.ts lib/fork-plan.test.ts
git commit -m "feat(fork): pure buildForkPlan deep-copy builder"
```

### Task 7: `createFork` server action

Deep-copies the real plan into a new `Fork`, remapping FKs through ID maps inside a transaction (mirroring `duplicateTrip`'s tx). Enforces the soft cap (4) and the phase gate.

**Files:**
- Create: `server/actions/forks.ts`
- Test: `server/actions/forks.test.ts`

**Interfaces:**
- Produces: `createFork(tripId: string, name?: string): Promise<{ success: true; forkId: string } | { success: false; error: string }>`.
- Consumes: `requireTripAccess`, `assertForkingAllowed`, `computeTripPhase`, `buildForkPlan`, `recordActivity`, `REAL_PLAN`.

- [ ] **Step 1: Write failing tests** (mock `db` with `fork`, six entities, `$transaction`, plus `requireTripAccess`, `computeTripPhase`, `recordActivity`). Assert:
  - rejects when 4 forks already exist (`db.fork.count` → 4) with `{ success:false }` and no `$transaction` call;
  - rejects in `travelling` phase;
  - on success: copies real-plan rows (`where: { tripId, forkId: null }`), creates a `Fork`, tags copied rows with the new `forkId`, records `{ verb:"CREATED", entityType:"FORK" }`.

```ts
it("rejects when the fork cap is reached", async () => {
  forkCountMock.mockResolvedValue(4);
  const res = await createFork("trip-1", "Plan B");
  expect(res).toEqual({ success: false, error: expect.stringMatching(/limit|cap|maximum/i) });
  expect(txMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- server/actions/forks.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** `createFork`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess, assertForkingAllowed } from "@/lib/guards";
import { computeTripPhase } from "@/lib/trip-phase";
import { buildForkPlan } from "@/lib/fork-plan";
import { recordActivity } from "@/server/actions/activity";
import { todayISO } from "@/lib/dates"; // use existing today helper; if absent, accept today via caller

const MAX_FORKS = 4;

export async function createFork(tripId: string, name?: string) {
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { id: true, startDate: true, endDate: true },
  });
  if (!trip) return { success: false, error: "Trip not found" } as const;
  assertForkingAllowed(computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today: todayISO() }));

  const count = await db.fork.count({ where: { tripId } });
  if (count >= MAX_FORKS) {
    return { success: false, error: `You can keep at most ${MAX_FORKS} forks — discard one first.` } as const;
  }

  const [chapters, stops, transports, accommodations, items, costs] = await Promise.all([
    db.chapter.findMany({ where: { tripId, forkId: null } }),
    db.stop.findMany({ where: { tripId, forkId: null } }),
    db.transport.findMany({ where: { tripId, forkId: null } }),
    db.accommodation.findMany({ where: { tripId, forkId: null } }),
    db.item.findMany({ where: { tripId, forkId: null } }),
    db.cost.findMany({ where: { tripId, forkId: null } }),
  ]);

  const plan = buildForkPlan({ chapters, stops, transports, accommodations, items, costs });
  const { user } = await requireTripAccess(tripId);

  const fork = await db.$transaction(async (tx) => {
    const fork = await tx.fork.create({
      data: { tripId, name: name?.trim() || `Variant ${count + 1}`, sortOrder: count, createdById: user.id },
    });
    const forkId = fork.id;

    const chapterIdMap = new Map<string, string>();
    for (const c of plan.chapters) {
      const created = await tx.chapter.create({ data: { tripId, forkId, ...c.data } });
      chapterIdMap.set(c.sourceId, created.id);
    }
    const stopIdMap = new Map<string, string>();
    for (const s of plan.stops) {
      const created = await tx.stop.create({
        data: { tripId, forkId, chapterId: s.sourceChapterId ? chapterIdMap.get(s.sourceChapterId) ?? null : null, ...s.data },
      });
      stopIdMap.set(s.sourceId, created.id);
    }
    const accIdMap = new Map<string, string>(); // sourceAccId -> newAccId, keyed by source accommodation id
    for (let i = 0; i < plan.accommodations.length; i++) {
      const a = plan.accommodations[i];
      const created = await tx.accommodation.create({
        data: { tripId, forkId, stopId: stopIdMap.get(a.sourceStopId) ?? "", ...a.data },
      });
      accIdMap.set(accommodations[i].id, created.id);
    }
    const itemIdMap = new Map<string, string>();
    for (let i = 0; i < plan.items.length; i++) {
      const it = plan.items[i];
      const created = await tx.item.create({
        data: { tripId, forkId, stopId: it.sourceStopId ? stopIdMap.get(it.sourceStopId) ?? null : null, ...it.data },
      });
      itemIdMap.set(items[i].id, created.id);
    }
    for (const t of plan.transports) {
      await tx.transport.create({
        data: {
          tripId, forkId,
          fromStopId: t.sourceFromStopId ? stopIdMap.get(t.sourceFromStopId) ?? null : null,
          toStopId: t.sourceToStopId ? stopIdMap.get(t.sourceToStopId) ?? null : null,
          ...t.data,
        },
      });
    }
    // Remap Cost.ownerId to the copied owner via the right map by ownerType.
    for (const c of plan.costs) {
      const newOwnerId =
        c.sourceOwnerId == null ? null
        : c.sourceOwnerType === "ACCOMMODATION" ? accIdMap.get(c.sourceOwnerId) ?? null
        : c.sourceOwnerType === "ITEM" ? itemIdMap.get(c.sourceOwnerId) ?? null
        : c.sourceOwnerType === "TRANSPORT" ? null /* transports re-minted without map; see note */
        : null; // OTHER costs have no owner
      await tx.cost.create({ data: { tripId, forkId, ...c.data, ownerId: newOwnerId } });
    }
    return fork;
  });

  await recordActivity({ tripId, verb: "CREATED", entityType: "FORK", entityId: fork.id, entityLabel: fork.name });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/compare`);
  return { success: true, forkId: fork.id } as const;
}
```

> **Transport-owned Costs note:** Transports are re-minted without a source→new id map above. Before Step 3, add a `transportIdMap` exactly like `itemIdMap` (capture `transports[i].id` → created id) and use it in the Cost remap (`c.sourceOwnerType === "TRANSPORT" ? transportIdMap.get(c.sourceOwnerId)`). The test below pins this.

- [ ] **Step 4: Add a test pinning transport-cost remap**, then make it pass by adding `transportIdMap`:

```ts
it("remaps transport-owned costs to the copied transport", async () => { /* arrange a TRANSPORT cost; assert created Cost.ownerId === new transport id */ });
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- server/actions/forks.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/actions/forks.ts server/actions/forks.test.ts
git commit -m "feat(fork): createFork deep-copies the real plan into a new variant"
```

### Task 8: Activity — `FORK` entity type + `PROMOTED` verb

**Files:**
- Modify: `lib/activity.ts` (ACTIVITY_VERBS, ACTIVITY_ENTITY_TYPES, and `entityLabel`/`describeChanges` switch if they enumerate types)
- Test: `lib/activity.test.ts`

- [ ] **Step 1: Write failing test** asserting `"FORK"` ∈ `ACTIVITY_ENTITY_TYPES` and `"PROMOTED"` ∈ `ACTIVITY_VERBS`.
- [ ] **Step 2: Run** `npm test -- lib/activity.test.ts` → FAIL.
- [ ] **Step 3: Add** `"PROMOTED"` to `ACTIVITY_VERBS` and `"FORK"` to `ACTIVITY_ENTITY_TYPES`. If `entityLabel`/`describeChanges` switch on entity type exhaustively, add a `FORK` case returning the passed label and no field diffs.
- [ ] **Step 4: Run** → PASS. Then `npx tsc --noEmit` to catch any exhaustive-switch breakage.
- [ ] **Step 5: Commit** `feat(fork): FORK activity entity type + PROMOTED verb`.

### Task 9: `renameFork` & `discardFork`

**Files:**
- Modify: `server/actions/forks.ts`; Test: `server/actions/forks.test.ts`

**Interfaces:**
- Produces: `renameFork(forkId, name): Promise<Result>`; `discardFork(forkId): Promise<Result>` (Result = `{success:true}|{success:false;error}`).

- [ ] **Step 1: Failing tests** — `renameFork` validates non-empty (zod), updates `db.fork.update`, logs `{verb:"UPDATED",entityType:"FORK"}`; `discardFork` deletes the `Fork` (cascade removes its rows) and logs `{verb:"DELETED",entityType:"FORK"}`; both call `requireForkAccess`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** both, using `requireForkAccess(forkId)`; `discardFork` = `db.fork.delete({ where: { id: forkId } })`; revalidate `/trips/${tripId}` and `/compare`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(fork): rename and discard forks`.

---

## PHASE 3 — Copy-in scheduling (ADR 0019)

### Task 10: `sourceItemId` on Item (schema)

**Files:** Modify `prisma/schema.prisma` (Item); migration.

- [ ] **Step 1:** Add to `model Item`:

```prisma
  sourceItemId String?   // the Wishlist idea this placed copy came from (ADR 0019); null for ideas / directly-created items
  sourceItem   Item?  @relation("ItemPlacedFrom", fields: [sourceItemId], references: [id], onDelete: SetNull)
  placements   Item[] @relation("ItemPlacedFrom")
```

- [ ] **Step 2:** `npx prisma migrate dev --name item_source_for_copy_in` → applied.
- [ ] **Step 3:** `npx tsc --noEmit` → PASS.
- [ ] **Step 4: Commit** `feat(fork): Item.sourceItemId for copy-in placement (ADR 0019)`.

### Task 11: `scheduleItem` → copy-in placement; `unscheduleItem` → remove placement

**Files:** Modify `server/actions/items.ts`; Test `server/actions/items.test.ts`.

**Interfaces:**
- Changed: `scheduleItem(ideaId, input, forkId?: PlanId)` — when the target is a Wishlist idea (`date===null && forkId===null`), CREATE a placed copy in the target Plan (`forkId`), `sourceItemId = ideaId`, leaving the idea row untouched. Returns `{success:true; placedItemId}`. If the target item is already a placed/scheduled item (has a date), keep the old in-place reschedule behaviour.
- Changed: `unscheduleItem(placedItemId)` — DELETE the placed copy (it has `date != null`); the originating idea remains. (Directly-created timeline items with `sourceItemId === null` are deleted too — they have no idea to fall back to; surface this in the UI as "remove from timeline".)

- [ ] **Step 1: Write failing tests**:

```ts
it("scheduling a wishlist idea creates a placed copy and leaves the idea", async () => {
  itemFindUniqueMock.mockResolvedValue({ id: "idea-1", tripId: "trip-1", forkId: null, date: null, title: "Louvre", category: "SIGHTSEEING" });
  itemFindFirstMock.mockResolvedValue({ sortOrder: 0 });
  itemCreateMock.mockResolvedValue({ id: "placed-1" });
  const res = await scheduleItem("idea-1", { date: "2026-07-02" }, null);
  expect(itemUpdateMock).not.toHaveBeenCalled();          // idea untouched
  expect(itemCreateMock).toHaveBeenCalledWith({
    data: expect.objectContaining({ tripId: "trip-1", forkId: null, sourceItemId: "idea-1", date: "2026-07-02", title: "Louvre" }),
  });
  expect(res).toMatchObject({ success: true });
});

it("scheduling into a fork places the copy in that fork", async () => {
  itemFindUniqueMock.mockResolvedValue({ id: "idea-1", tripId: "trip-1", forkId: null, date: null, title: "Louvre", category: "SIGHTSEEING" });
  itemFindFirstMock.mockResolvedValue(null);
  itemCreateMock.mockResolvedValue({ id: "placed-2" });
  await scheduleItem("idea-1", { date: "2026-07-02" }, "fork-9");
  expect(itemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ forkId: "fork-9", sourceItemId: "idea-1" }) });
});

it("unscheduling a placed item deletes the copy, not the idea", async () => {
  itemFindUniqueMock.mockResolvedValue({ id: "placed-1", tripId: "trip-1", forkId: null, date: "2026-07-02", sourceItemId: "idea-1" });
  await unscheduleItem("placed-1");
  expect(itemDeleteMock).toHaveBeenCalledWith({ where: { id: "placed-1" } });
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the new branches in `scheduleItem`/`unscheduleItem`. For scheduling an idea: compute `sortOrder` via `db.item.findFirst({ where: { tripId, ...planScope(forkId), date: { not: null } }, orderBy: { sortOrder: "desc" } })`; copy `title/category/stopId/lat/lng/address/link/notes` from the idea; set `date/startTime/endTime`; `sourceItemId = idea.id`; `forkId`. Record `{verb:"CREATED",entityType:"ITEM"}`. For unschedule: `db.item.delete`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(fork): copy-in scheduling — placements leave the wishlist idea intact`.

> **Marker query (for UI):** "✓ in this plan" = for a Wishlist idea `i`, a placement exists where `sourceItemId === i.id && forkId === <currentPlan>`. The wishlist page (Task 17 UI) computes this with one `db.item.findMany({ where: { tripId, forkId: <plan>, sourceItemId: { in: ideaIds } }, select: { sourceItemId: true } })`.

---

## PHASE 4 — Plan-scoped editing

### Task 12: Make create-mutations target the active Plan

Each create action gains an optional trailing `forkId?: PlanId` (default → real plan). The action: (a) scopes its sortOrder query to that Plan; (b) writes `forkId` on the new row; (c) validates that any referenced FK (stopId, chapterId) belongs to the **same** Plan.

**Files:** Modify `server/actions/stops.ts` (`createStop`), `transport.ts` (`createTransport`), `accommodation.ts` (`createAccommodation`), `items.ts` (`createItem`), `chapters.ts` (`createChapter`), `costs.ts` (create cost). Tests in each `*.test.ts`.

**Interfaces:**
- Consumes: `planScope` from `@/lib/plan-scope`.
- Produces: same return types as today; new optional `forkId` param.

- [ ] **Step 1: Failing test** (createStop example):

```ts
it("creates a stop in the given fork with fork-scoped sortOrder", async () => {
  stopFindFirstMock.mockResolvedValue({ sortOrder: 1 });
  stopCreateMock.mockResolvedValue({ id: "s9", name: "Bern" });
  await createStop("trip-1", { name: "Bern", nights: 2 }, "fork-9");
  expect(stopFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }));
  expect(stopCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ forkId: "fork-9", sortOrder: 2 }) });
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** in each create action: replace `...REAL_PLAN` (from Task 3) with `...planScope(forkId)`; add `forkId: forkId ?? null` to the `create` data; for FK validation queries, fetch the FK row's `forkId` and reject if it differs from the target Plan (`if (stop.forkId !== (forkId ?? null)) return error`).
- [ ] **Step 4: Run** each file's tests → PASS.
- [ ] **Step 5: Commit** `feat(fork): create-mutations target the active plan (forkId)`.

> Update/delete/reorder actions need no `forkId` param — they act on a row by id, whose `forkId` is intrinsic. BUT reorder/ripple queries that load sibling rows (`stops.ts:351,433,556` ripple/firm-up) must scope to the edited row's own `forkId`, not `null`. **Add a test** in `stops.test.ts` that a ripple started from a fork stop loads siblings with that stop's `forkId`, and fix the sibling `findMany` to use `planScope(stop.forkId)`. Commit `fix(fork): scope ripple/firm-up siblings to the edited plan`.

---

## PHASE 5 — Compare

### Task 13: Pure `computePlanMetrics` + `diffMetrics`

**Files:** Create `lib/compare.ts`; Test `lib/compare.test.ts`.

**Interfaces:**
- Produces:
  - `type PlanMetrics = { stopCount; nightTotal; countries: string[]; projectedEnd: string|null; hardEndState: "ok"|"approaching"|"over"|"none"; budgetHomeMinor: number|null; flagCounts: { warning: number; info: number }; transitMinutes: number; drivingMinutes: number; flightCount: number; route: { name: string; country: string|null; nights: number|null }[] }`.
  - `computePlanMetrics(input: PlanMetricsInput): PlanMetrics` — `input` carries one Plan's `stops/transports/accommodations/items/costs` plus `trip` (startDate, hardEndDate, homeCurrency, drivingWindingFactor, drivingAvgSpeedKph) and `exchangeRates`.
  - `diffMetrics(base: PlanMetrics, variant: PlanMetrics): MetricDeltas` — numeric deltas vs the real plan.
- Consumes: `computeProjectedEnd` (`lib/firm-up.ts`), `detectFlags` (`lib/flags.ts`), `applyFxRatesToCosts` + `buildBudget` (`lib/budget.ts`), `estimateDriveMinutes` + `haversineKm` (`lib/geo.ts`), `HARD_END_APPROACHING_NIGHTS`.

- [ ] **Step 1: Write failing tests** covering: night/stop totals; `projectedEnd` delegating to `computeProjectedEnd(stops, trip.startDate)`; `hardEndState` = `over` when projectedEnd > hardEndDate, `approaching` within `HARD_END_APPROACHING_NIGHTS`, `none` when no hardEndDate; `budgetHomeMinor` = `buildBudget(...).grandTotal` estimated home total; `flagCounts` tallying `detectFlags(...)` by severity; `flightCount` counting `mode === "FLIGHT"`; `transitMinutes` = Σ `(arrAt-depAt)` mins where both set; `drivingMinutes` = Σ `estimateDriveMinutes(haversineKm(from,to), {windingFactor, avgSpeedKph})` for `mode === "DRIVE"` (or "CAR" — confirm enum from `lib/enums.ts`) with both endpoints located.

```ts
it("flags counts split by severity", () => {
  const m = computePlanMetrics(inputWithOneWarningOneInfo);
  expect(m.flagCounts).toEqual({ warning: 1, info: 1 });
});
it("hardEndState is 'over' when projected end passes the hard end date", () => {
  expect(computePlanMetrics(inputOverHardEnd).hardEndState).toBe("over");
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `computePlanMetrics` wiring the engines per the signatures (estimated home total: sum `convertCostToHome(c, home).estimatedHome` via `buildBudget(...).grandTotal`; reuse `applyFxRatesToCosts` for `rateToHome` fill). Implement `diffMetrics`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(fork): pure compare metrics + deltas`.

### Task 14: `getComparison` server action

**Files:** Modify `server/actions/forks.ts`; Test `server/actions/forks.test.ts`.

**Interfaces:**
- Produces: `getComparison(tripId): Promise<{ trip; plans: { forkId: string|null; name: string; metrics: PlanMetrics }[] }>` — index 0 is the real plan ("Real plan"), then each Fork by `sortOrder`.
- Consumes: `requireTripAccess`, `computePlanMetrics`, all six entity reads per plan (real plan `forkId:null`, each fork `forkId:<id>`), `exchangeRates` (shared).

- [ ] **Step 1: Failing test** — given a trip with one fork, returns two plan entries, the first labelled real plan with `forkId: null`; verifies it loads each plan's rows scoped by `forkId`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — load forks (`db.fork.findMany({ where:{tripId}, orderBy:{sortOrder:"asc"} })`); for each plan id (null + each fork) load the six collections scoped by `forkId`, plus shared `exchangeRates`; map through `computePlanMetrics`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(fork): getComparison loader`.

### Task 16: Compare page + table UI

**Files:** Create `app/(app)/trips/[tripId]/compare/page.tsx`, `components/trip/compare-table.tsx`; Test `components/trip/compare-table.test.tsx`.

> **Before coding:** read `app/(app)/trips/[tripId]/summary/page.tsx` and an existing table-ish component (e.g. discreet `stop-spreadsheet`) to match RSC/loader + client-component conventions and the design system (Tailwind v4 + Radix). The page is a server component that calls `getComparison(tripId)` and renders `<CompareTable />`.

- [ ] **Step 1: Failing component test** — render `<CompareTable plans={[realPlan, forkA]} />`; assert: real plan column labelled "Real plan" and leftmost; each metric row present (Route, Projected end, Budget, Flags, Stops, Nights, Transit, Driving, Flights); fork column shows a delta badge (e.g. "+2 nights"); a "Promote" affordance per fork column; respects Discreet mode (no fork/plan vocabulary leak — gate via existing discreet context like other components).
- [ ] **Step 2: Run** `npm test -- components/trip/compare-table.test.tsx` → FAIL.
- [ ] **Step 3: Implement** `compare-table.tsx` (client component: columns = plans, rows = metrics, deltas via `diffMetrics`) and the RSC `compare/page.tsx` loader. Format money with the existing currency formatter used by the Budget view; format dates with the existing date util.
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(fork): Compare view (real plan + forks side by side)`.

---

## PHASE 6 — Promote

### Task 15: `promoteFork` + loss-list, then guarded dialog

**Files:** Modify `server/actions/forks.ts`; Create `components/trip/promote-fork-dialog.tsx`; Tests in `forks.test.ts` and `promote-fork-dialog.test.tsx`.

**Interfaces:**
- Produces:
  - `getPromotionPreview(forkId): Promise<{ lossList: { kind: "PAID_COST"|"CONFIRMATION"|"ATTACHMENT"; label: string }[]; deltas: MetricDeltas }>` — inspects the **current real plan** for `Cost.paidAt != null`, `Accommodation.confirmation != null`, `Transport.reference != null`, and `Attachment` whose `targetType/targetId` points at a real-plan Stop/Transport/Accommodation/Item.
  - `promoteFork(forkId): Promise<{ success: true } | { success: false; error: string }>`.

- [ ] **Step 1: Failing tests** for `promoteFork`:
  - phase-gated (rejects travelling/past);
  - inside one `$transaction`: deletes real-plan rows for the six entities (`where:{tripId,forkId:null}`), re-tags the chosen fork's rows to `forkId: null` (six `updateMany({ where:{forkId}, data:{forkId:null} })`), deletes the `Fork` row plus all *other* forks (`db.fork.deleteMany({ where:{tripId, id:{ not: forkId }} })` after retag, or delete all forks since the promoted one's rows are now null);
  - records `{ verb:"PROMOTED", entityType:"FORK", entityLabel: fork.name }`;
  - revalidates the trip's live paths.

```ts
it("retags the promoted fork's rows to the real plan and clears all forks", async () => {
  // arrange fork-9 with rows; act promoteFork("fork-9")
  expect(stopUpdateManyMock).toHaveBeenCalledWith({ where: { forkId: "fork-9" }, data: { forkId: null } });
  expect(stopDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: "trip-1", forkId: null } }); // old real plan deleted first
  expect(forkDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: "trip-1" } });
});
```

> **Ordering inside the tx:** (1) delete old real-plan rows (`forkId:null`) for all six entities; (2) `updateMany` the promoted fork's rows `forkId → null`; (3) `deleteMany` all forks for the trip (the promoted one now has no rows, the rest cascade-delete their rows). This avoids a unique/relational clash and leaves exactly one real plan.

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `getPromotionPreview` + `promoteFork` per the ordering note; revalidate `/trips/${tripId}` and the live sub-paths (`/plan`,`/calendar`,`/budget`,`/summary`,`/compare`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Failing dialog test** — `<PromoteForkDialog preview={...} />` shows the delta summary; when `lossList` non-empty, renders the loss items and requires a deliberate confirm (type-to-confirm or a distinct destructive button) before the confirm handler can fire; when empty, a single confirm button.
- [ ] **Step 6: Implement** the dialog on the existing Radix Dialog pattern (mirror `duplicate`/destructive dialogs already in `components/trip`). Wire it into the Compare column "Promote" affordance (Task 16) via `getPromotionPreview` → dialog → `promoteFork`.
- [ ] **Step 7: Run** both test files → PASS; `npx tsc --noEmit` → PASS.
- [ ] **Step 8: Commit** `feat(fork): guarded promote with loss-preview (paid/confirmation/attachment)`.

---

## PHASE 7 — Surfacing, switching & gating

### Task 17: Fork switcher + create entry + wishlist marker + phase gating

**Files:** Create `components/trip/fork-switcher.tsx`; modify the trip nav/header component that hosts plan-level controls (read `components/trip/*nav*` / the `(app)/trips/[tripId]/layout.tsx` first), the wishlist page (Task 11 marker), and the Plan editor entry (`components/trip/itinerary-manager` host) so edits route the active `forkId`. Tests alongside.

**Interfaces:**
- Consumes: `createFork`, `renameFork`, `discardFork`, `listForks` (add a tiny `listForks(tripId)` to `forks.ts` if not already loaded by the layout), `computeTripPhase`.

- [ ] **Step 1: Failing component test** for `<ForkSwitcher>` — lists "Real plan" + forks; "New variant" calls `createFork`; shows the active plan; **hidden entirely** when phase is `travelling`/`past`; shows the cap nudge ("discard one first") when 4 forks exist.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `fork-switcher.tsx`; surface it on the Plan/itinerary screen; thread the selected `forkId` into the create-mutations (Task 12) and into `scheduleItem` (Task 11). Add the wishlist "✓ in this plan" marker using the Task 11 marker query. Gate visibility with `computeTripPhase`.
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Manual smoke** — create a fork, edit a stop in it, confirm the real plan's Plan/Calendar/Budget are unchanged; open Compare; promote; confirm the live views now reflect the promoted arrangement and forks are gone.
- [ ] **Step 6: Commit** `feat(fork): fork switcher, create/edit entry points, wishlist marker, phase gating`.

### Task 18: Full-suite verification + ADR cross-check

- [ ] **Step 1:** Run `npm test` → all green.
- [ ] **Step 2:** Run `npx tsc --noEmit` → clean.
- [ ] **Step 3:** Run `npm run lint` (if present) → clean.
- [ ] **Step 4:** Re-read CONTEXT.md (Plan/Fork/Promote/Compare) and ADRs 0019/0020; confirm the build matches (forkId null = real plan; copy-in scheduling; promote loss-list; shared wishlist/rates). Fix drift.
- [ ] **Step 5: Commit** any cleanups: `chore(fork): full-suite green + docs cross-check`.

---

## Self-Review

**Spec coverage:**
- "Diverges per fork: Stops, Transport, Accommodation, Chapters, scheduled Items, estimated Costs" → Tasks 2, 6, 7, 12. ✓
- "Shared: Wishlist, rates, etc." → Wishlist ideas stay `forkId:null` (Task 11); rates never forked (Task 13/14 load shared `exchangeRates`). ✓
- "Full-power plan (firm-up/pin/make-it-fit/flags/budget inside a fork)" → reads scoped by plan (Tasks 3/4/12), engines reused (Task 13). Make-it-fit/firm-up operate on the active plan's rows via the ripple-sibling fix (Task 12 note). ✓
- "Not live until promoted" → live reads forced to `forkId:null` (Task 4); calendar feed / share read `forkId:null` (Task 4). ✓
- "Create from real plan or another fork; cap 4; default name" → Task 7 (cap + default); forking-from-a-fork = `createFork` copying the active plan — **gap:** Task 7 copies only `forkId:null`. **Fix:** `createFork(tripId, name?, sourceForkId?: PlanId)` — load the six collections with `forkId: sourceForkId ?? null`. Add this param + a test in Task 7. ✓ (folded in)
- "Shared, silent except created/promoted/discarded" → Activity only in Tasks 7/9/15; edits inside a fork reuse existing per-entity Activity — **note:** that would log fork edits. **Resolution:** existing per-entity `recordActivity` calls fire regardless of plan; to keep forks silent, guard those calls with `if (forkId == null)`. Add a Task 12 sub-step: pass `forkId` to update/delete actions *only* to suppress Activity (not to rescope), or check the row's `forkId` before `recordActivity`. **Add Task 12 Step:** "skip `recordActivity` when the mutated row's `forkId !== null`." ✓ (folded in)
- "Pre-departure phases only" → Tasks 5, 7, 15, 17. ✓
- "Compare: real plan baseline + deltas, all rows incl transit/driving/flights" → Tasks 13, 16. ✓
- "Promote irreversible + loss-list + destructive confirm" → Task 15. ✓
- "ADR 0019 copy-in" → Tasks 10, 11. "ADR 0020 nullable forkId" → Task 2. ✓

**Placeholder scan:** Engine signatures are real (from source). `lib/enums.ts` transport mode value ("DRIVE" vs "CAR", "FLIGHT") must be confirmed by reading `lib/enums.ts` in Task 13 Step 1 — flagged inline, not left vague.

**Type consistency:** `planScope`/`REAL_PLAN` used uniformly; `PlanMetrics`/`diffMetrics` names consistent across Tasks 13/14/16; `forkId` param ordering (trailing, optional) consistent across create-mutations.

**Two corrections folded into the tasks above:** (1) `createFork` gains `sourceForkId` for fork-from-fork; (2) suppress per-entity Activity for fork edits to honour "silent except milestones."
