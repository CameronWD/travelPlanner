# Reorder/Dating Fix + Per-Trip Chapters Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scheduled stops render in date order everywhere; drags and date edits ripple span-scoped (gaps preserved, payload rides along); chapters become an opt-in per-trip toggle.

**Architecture:** ADR 0038 (read it: `docs/adr/0038-dates-order-scheduled-stops-and-span-scoped-ripples.md`). Pure date algorithms live in `lib/` (unit-tested, no React/DB); server actions in `server/actions/stops.ts` / `chapters.ts` / `trips.ts` orchestrate them inside `FOR UPDATE`-locked transactions (ADR 0007); the plan editor client (`components/trip/itinerary-manager.tsx`) threads moved-ids and applies results optimistically. The chapters toggle is a `Trip.chaptersEnabled` boolean gated at each read surface.

**Tech Stack:** Next.js App Router server actions, Prisma/Postgres, vitest (`npm test` = `vitest run`), dnd-kit. Dates are `"YYYY-MM-DD"` strings compared lexicographically.

## Global Constraints

- Never commit to `main`; work on the current feature branch `feat/reorder-dating-and-chapters-toggle`.
- No new npm dependencies.
- `server/actions/*.ts` files are `"use server"`: every export MUST be an async function.
- Action results follow ADR 0027: `ActionResult<T>` from `lib/action-result.ts` (`{ success: true } & T | { success: false; errors }`).
- All user-facing copy says "Chapter"/"chapters", "Stop", "rough"/"scheduled" (CONTEXT.md language).
- Date engine invariants: nights preserved on every ripple; pinned stops never move (conflict `Flag` instead); same-day handoff (`depart == next arrive` is not an overlap).
- Tests are colocated (`foo.ts` → `foo.test.ts`). Server-action tests mock Prisma via the `vi.hoisted` harness already in `server/actions/stops.test.ts` — extend it, don't build a new one.
- Run a task's test file with `npx vitest run <path>`; the whole suite with `npm test`.

---

### Task 1: `lib/plan-order.ts` — canonical plan order (dates rule)

**Files:**
- Create: `lib/plan-order.ts`
- Test: `lib/plan-order.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `compareScheduled(a, b): number` and `orderPlanStops<S>(stops: readonly S[]): S[]` where `S extends { id: string; sortOrder: number; arriveDate: string | null; departDate: string | null }`. Later tasks import both from `@/lib/plan-order`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/plan-order.test.ts
import { describe, expect, it } from "vitest";
import { orderPlanStops } from "./plan-order";

const stop = (id: string, sortOrder: number, arriveDate: string | null, departDate: string | null) =>
  ({ id, sortOrder, arriveDate, departDate });

describe("orderPlanStops", () => {
  it("re-slots scheduled stops into date order while rough stops keep their slots", () => {
    // Arrangement: A(dated late), rough R, B(dated early)
    const input = [
      stop("A", 0, "2026-06-10", "2026-06-12"),
      stop("R", 1, null, null),
      stop("B", 2, "2026-06-01", "2026-06-03"),
    ];
    expect(orderPlanStops(input).map((s) => s.id)).toEqual(["B", "R", "A"]);
  });

  it("is identity when scheduled stops are already chronological", () => {
    const input = [
      stop("A", 0, "2026-06-01", "2026-06-03"),
      stop("R", 1, null, null),
      stop("B", 2, "2026-06-03", "2026-06-05"),
    ];
    expect(orderPlanStops(input).map((s) => s.id)).toEqual(["A", "R", "B"]);
  });

  it("breaks arrive-date ties by departDate, then sortOrder, then id", () => {
    const input = [
      stop("long", 0, "2026-06-01", "2026-06-05"),
      stop("short", 1, "2026-06-01", "2026-06-02"),
    ];
    expect(orderPlanStops(input).map((s) => s.id)).toEqual(["short", "long"]);
  });

  it("handles all-rough and empty lists", () => {
    expect(orderPlanStops([])).toEqual([]);
    const rough = [stop("R1", 0, null, null), stop("R2", 1, null, null)];
    expect(orderPlanStops(rough).map((s) => s.id)).toEqual(["R1", "R2"]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/plan-order.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/plan-order.ts
/**
 * Canonical plan order (ADR 0038): a scheduled Stop's position IS its dates.
 * Scheduled stops render in date order; rough stops keep the slot the
 * traveller put them in relative to their neighbours (their sortOrder slot).
 */

export interface OrderableStop {
  id: string;
  sortOrder: number;
  arriveDate: string | null;
  departDate: string | null;
}

/** Chronological comparator for scheduled stops; sortOrder/id break ties. */
export function compareScheduled(
  a: { id: string; sortOrder: number; arriveDate: string; departDate: string | null },
  b: { id: string; sortOrder: number; arriveDate: string; departDate: string | null },
): number {
  return (
    a.arriveDate.localeCompare(b.arriveDate) ||
    (a.departDate ?? "").localeCompare(b.departDate ?? "") ||
    a.sortOrder - b.sortOrder ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Input must be in arrangement (sortOrder) order. Scheduled stops are
 * re-sorted chronologically and re-dealt into the scheduled slots; rough
 * stops keep their exact indices. Pure; never mutates the input.
 */
export function orderPlanStops<S extends OrderableStop>(stops: readonly S[]): S[] {
  const scheduled = stops
    .filter((s): s is S & { arriveDate: string } => s.arriveDate != null)
    .sort(compareScheduled);
  let cursor = 0;
  return stops.map((s) => (s.arriveDate != null ? scheduled[cursor++] : s));
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run lib/plan-order.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add lib/plan-order.ts lib/plan-order.test.ts && git commit -m "feat(plan-order): canonical dates-rule ordering for plan stops (ADR 0038)"`

---

### Task 2: `lib/reorder.ts` — `spanReflow` + `collisionPush`

**Files:**
- Modify: `lib/reorder.ts` (append; do NOT remove `reflowReorderedDates` yet — Task 8 does)
- Test: `lib/reorder.test.ts` (append describes)

**Interfaces:**
- Consumes: `addDays`, `nightsBetween` from `./dates`; `FlowConflict` from `./firm-up`; `ReflowResult` already defined in this file.
- Produces:
  - `interface SpanStop { id: string; arriveDate: string; departDate: string; pinned: boolean; }`
  - `spanReflow(oldOrder: readonly SpanStop[], newOrder: readonly SpanStop[], movedIds: ReadonlySet<string>): { results: ReflowResult[]; conflicts: FlowConflict[] }`
  - `collisionPush(followers: readonly SpanStop[], cursor: string): { results: ReflowResult[]; conflicts: FlowConflict[] }`

- [ ] **Step 1: Write the failing tests** (append to `lib/reorder.test.ts`)

```ts
import { spanReflow, collisionPush, type SpanStop } from "./reorder";

const sp = (id: string, arriveDate: string, departDate: string, pinned = false): SpanStop =>
  ({ id, arriveDate, departDate, pinned });

describe("spanReflow (ADR 0038)", () => {
  // The ADR's worked example: A(1–4) B(4–7) ··2-day gap·· C(9–12) D(12–15); drag C before B.
  const A = sp("A", "2026-06-01", "2026-06-04");
  const B = sp("B", "2026-06-04", "2026-06-07");
  const C = sp("C", "2026-06-09", "2026-06-12");
  const D = sp("D", "2026-06-12", "2026-06-15");

  it("re-dates only the affected span and leaves stops outside untouched", () => {
    const { results, conflicts } = spanReflow([A, B, C, D], [A, C, B, D], new Set(["C"]));
    expect(conflicts).toEqual([]);
    // Window = indices 1..2. A and D are not in results at all.
    expect(results.map((r) => r.id)).toEqual(["C", "B"]);
    expect(results[0]).toMatchObject({ id: "C", arriveDate: "2026-06-04", departDate: "2026-06-07", changed: true });
    expect(results[1]).toMatchObject({ id: "B", arriveDate: "2026-06-07", departDate: "2026-06-10", changed: true });
  });

  it("returns empty when the order did not change", () => {
    expect(spanReflow([A, B, C, D], [A, B, C, D], new Set(["B"])).results).toEqual([]);
  });

  it("preserves an unmoved stop's lead-in gap", () => {
    // A(1–4) C(4–7) ··2 gap·· B(9–12) D(12–15); drag C after B → A B C D.
    const C2 = sp("C", "2026-06-04", "2026-06-07");
    const B2 = sp("B", "2026-06-09", "2026-06-12");
    const { results } = spanReflow([A, C2, B2, D], [A, B2, C2, D], new Set(["C"]));
    // B keeps its 2-day lead-in from window start (06-04 → arrives 06-06).
    expect(results[0]).toMatchObject({ id: "B", arriveDate: "2026-06-06", departDate: "2026-06-09" });
    expect(results[1]).toMatchObject({ id: "C", arriveDate: "2026-06-09", departDate: "2026-06-12" });
  });

  it("keeps a moved block's internal gaps (chapter drag)", () => {
    // Drag block [C,D] (with no internal gap) before B: only first-of-block loses lead-in.
    const { results } = spanReflow([A, B, C, D], [A, C, D, B], new Set(["C", "D"]));
    expect(results.map((r) => r.id)).toEqual(["C", "D", "B"]);
    expect(results[0]).toMatchObject({ id: "C", arriveDate: "2026-06-04" }); // lead 0 (moved, first)
    expect(results[1]).toMatchObject({ id: "D", arriveDate: "2026-06-07" }); // kept lead 0
    expect(results[2]).toMatchObject({ id: "B", arriveDate: "2026-06-10" }); // kept lead 0
  });

  it("holds pinned stops and reports a conflict when the span cannot fit", () => {
    const Bpin = sp("B", "2026-06-04", "2026-06-07", true);
    const { results, conflicts } = spanReflow([A, Bpin, C, D], [A, C, Bpin, D], new Set(["C"]));
    const pinned = results.find((r) => r.id === "B")!;
    expect(pinned).toMatchObject({ arriveDate: "2026-06-04", departDate: "2026-06-07", changed: false });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].stopId).toBe("B");
  });
});

describe("collisionPush (ADR 0038)", () => {
  it("pushes only overlapped followers, letting gaps absorb", () => {
    // Edited stop now departs 06-06. B(4–7) overlaps → pushed. Gap-stop D(12–15) untouched.
    const followers = [sp("B", "2026-06-04", "2026-06-07"), sp("D", "2026-06-12", "2026-06-15")];
    const { results, conflicts } = collisionPush(followers, "2026-06-06");
    expect(conflicts).toEqual([]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: "B", arriveDate: "2026-06-06", departDate: "2026-06-09" });
  });

  it("propagates a push down a glued chain", () => {
    const followers = [sp("B", "2026-06-04", "2026-06-07"), sp("C", "2026-06-07", "2026-06-10")];
    const { results } = collisionPush(followers, "2026-06-06");
    expect(results.map((r) => r.id)).toEqual(["B", "C"]);
    expect(results[1]).toMatchObject({ arriveDate: "2026-06-09", departDate: "2026-06-12" });
  });

  it("never moves anyone when the edit shrank the stay", () => {
    expect(collisionPush([sp("B", "2026-06-04", "2026-06-07")], "2026-06-03").results).toEqual([]);
  });

  it("holds a pinned follower and flags it", () => {
    const { results, conflicts } = collisionPush([sp("B", "2026-06-04", "2026-06-07", true)], "2026-06-06");
    expect(results).toEqual([]);
    expect(conflicts[0].stopId).toBe("B");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/reorder.test.ts` → FAIL (`spanReflow` not exported).

- [ ] **Step 3: Implement** (append to `lib/reorder.ts`; `addDays` needs importing alongside the existing `nightsBetween` import)

```ts
import { addDays } from "./dates"; // merge into the existing ./dates import

export interface SpanStop {
  id: string;
  arriveDate: string;
  departDate: string;
  pinned: boolean;
}

/**
 * ADR 0038 span reflow. `oldOrder` = the plan's scheduled stops in current
 * (chronological) order; `newOrder` = the same stops in the dropped
 * arrangement; `movedIds` = the actively dragged stop(s). Only the window
 * between the first and last differing position is re-dated, flowing from the
 * window's original start date. Nights are always preserved. An unmoved stop
 * keeps its lead-in gap; a moved stop whose new predecessor is not itself
 * moved arrives with no lead-in (same-day handoff). Pinned stops keep their
 * dates and conflict when overrun. Stops outside the window are absent from
 * `results` entirely.
 */
export function spanReflow(
  oldOrder: readonly SpanStop[],
  newOrder: readonly SpanStop[],
  movedIds: ReadonlySet<string>,
): { results: ReflowResult[]; conflicts: FlowConflict[] } {
  if (oldOrder.length !== newOrder.length) return { results: [], conflicts: [] };
  let first = -1;
  let last = -1;
  for (let i = 0; i < oldOrder.length; i++) {
    if (oldOrder[i].id !== newOrder[i].id) {
      if (first === -1) first = i;
      last = i;
    }
  }
  if (first === -1) return { results: [], conflicts: [] };

  // Lead-in gap per stop, measured in the OLD (chronological) order.
  const leadIn = new Map<string, number>();
  for (let i = 0; i < oldOrder.length; i++) {
    leadIn.set(
      oldOrder[i].id,
      i === 0 ? 0 : Math.max(0, nightsBetween(oldOrder[i - 1].departDate, oldOrder[i].arriveDate)),
    );
  }

  const results: ReflowResult[] = [];
  const conflicts: FlowConflict[] = [];
  let cursor = oldOrder[first].arriveDate;
  for (let i = first; i <= last; i++) {
    const stop = newOrder[i];
    if (stop.pinned) {
      if (cursor > stop.arriveDate) {
        conflicts.push({
          stopId: stop.id,
          message: `Earlier stops run to ${cursor}, past this pinned arrival of ${stop.arriveDate}.`,
        });
      }
      results.push({ id: stop.id, arriveDate: stop.arriveDate, departDate: stop.departDate, changed: false });
      cursor = cursor > stop.departDate ? cursor : stop.departDate;
      continue;
    }
    const prevIsMoved = i > first && movedIds.has(newOrder[i - 1].id);
    const lead = movedIds.has(stop.id) && !prevIsMoved ? 0 : (leadIn.get(stop.id) ?? 0);
    const arriveDate = addDays(cursor, lead);
    const departDate = addDays(arriveDate, nightsBetween(stop.arriveDate, stop.departDate));
    results.push({
      id: stop.id,
      arriveDate,
      departDate,
      changed: arriveDate !== stop.arriveDate || departDate !== stop.departDate,
    });
    cursor = departDate;
  }
  return { results, conflicts };
}

/**
 * ADR 0038 collision-push for a direct date edit. `followers` = scheduled
 * stops after the edited stop in chronological order; `cursor` = the edited
 * stop's new depart date. A follower moves only as far as needed to clear the
 * overlap (its own lead-in gap absorbs the push first); nights preserved.
 * Shrinking an earlier stay moves nobody. Returns only changed stops.
 */
export function collisionPush(
  followers: readonly SpanStop[],
  cursor: string,
): { results: ReflowResult[]; conflicts: FlowConflict[] } {
  const results: ReflowResult[] = [];
  const conflicts: FlowConflict[] = [];
  let cur = cursor;
  for (const s of followers) {
    if (s.arriveDate >= cur) break; // gap absorbs the push; nothing further can overlap
    if (s.pinned) {
      conflicts.push({
        stopId: s.id,
        message: `Earlier stops run to ${cur}, past this pinned arrival of ${s.arriveDate}.`,
      });
      cur = cur > s.departDate ? cur : s.departDate;
      continue;
    }
    const arriveDate = cur;
    const departDate = addDays(arriveDate, nightsBetween(s.arriveDate, s.departDate));
    results.push({ id: s.id, arriveDate, departDate, changed: true });
    cur = departDate;
  }
  return { results, conflicts };
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run lib/reorder.test.ts` → PASS (existing describes must still pass).
- [ ] **Step 5: Commit** — `git commit -am "feat(reorder): span-scoped reflow and collision-push engines (ADR 0038)"`

---

### Task 3: `lib/payload-shift.ts` — items & accommodation ride with their stop

**Files:**
- Create: `lib/payload-shift.ts`
- Test: `lib/payload-shift.test.ts`

**Interfaces:**
- Consumes: `addDays`, `daysBetween`, `nightsBetween` from `./dates` (`daysBetween` is signed and already exists at `lib/dates.ts:146`).
- Produces:
  - `shiftItemDates(items: readonly {id: string; date: string | null}[], oldArrive: string, newArrive: string, newDepart: string): { id: string; date: string | null; prevDate: string }[]`
  - `shiftAccommodationDates(accommodations: readonly {id: string; checkIn: string; checkOut: string}[], deltaDays: number): { id: string; checkIn: string; checkOut: string; prevCheckIn: string; prevCheckOut: string }[]`
  - `interface PayloadShiftResult { items: ItemShift[]; accommodations: AccommodationShift[] }` (export the two shift types too)

- [ ] **Step 1: Write the failing tests**

```ts
// lib/payload-shift.test.ts
import { describe, expect, it } from "vitest";
import { shiftItemDates, shiftAccommodationDates } from "./payload-shift";

describe("shiftItemDates", () => {
  // Stop moves 06-12→06-14 (2 days later), still 3 nights (new depart 06-17).
  it("keeps each slotted item's offset from the arrive date", () => {
    const shifts = shiftItemDates(
      [{ id: "louvre", date: "2026-06-14" }, { id: "todo", date: null }],
      "2026-06-12", "2026-06-14", "2026-06-17",
    );
    expect(shifts).toEqual([{ id: "louvre", date: "2026-06-16", prevDate: "2026-06-14" }]);
  });

  it("un-slots an item whose day falls off a shortened stay", () => {
    // Stay shrinks to 1 night (06-12 → 06-13); day-3 item can't fit.
    const shifts = shiftItemDates([{ id: "versailles", date: "2026-06-15" }], "2026-06-12", "2026-06-12", "2026-06-13");
    expect(shifts).toEqual([{ id: "versailles", date: null, prevDate: "2026-06-15" }]);
  });

  it("un-slots an item dated before the stay (stranded data)", () => {
    const shifts = shiftItemDates([{ id: "x", date: "2026-06-10" }], "2026-06-12", "2026-06-14", "2026-06-17");
    expect(shifts).toEqual([{ id: "x", date: null, prevDate: "2026-06-10" }]);
  });

  it("returns nothing when dates are unchanged", () => {
    expect(shiftItemDates([{ id: "a", date: "2026-06-13" }], "2026-06-12", "2026-06-12", "2026-06-15")).toEqual([]);
  });
});

describe("shiftAccommodationDates", () => {
  it("shifts check-in/out by the stop's arrive delta", () => {
    const shifts = shiftAccommodationDates([{ id: "hotel", checkIn: "2026-06-12", checkOut: "2026-06-15" }], 2);
    expect(shifts).toEqual([{
      id: "hotel", checkIn: "2026-06-14", checkOut: "2026-06-17",
      prevCheckIn: "2026-06-12", prevCheckOut: "2026-06-15",
    }]);
  });

  it("is empty for a zero delta", () => {
    expect(shiftAccommodationDates([{ id: "hotel", checkIn: "2026-06-12", checkOut: "2026-06-15" }], 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/payload-shift.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/payload-shift.ts
import { addDays, daysBetween, nightsBetween } from "./dates";

/**
 * ADR 0038: a Stop's payload rides with it. Slotted Items keep their offset
 * from the arrive date (un-slotting when the day no longer fits the stay);
 * Accommodation check-in/out shift by the arrive-date delta. Pure date math —
 * the server action applies the returned shifts and keeps the pre-images for
 * Undo.
 */

export interface ItemShift {
  id: string;
  date: string | null;
  prevDate: string;
}

export interface AccommodationShift {
  id: string;
  checkIn: string;
  checkOut: string;
  prevCheckIn: string;
  prevCheckOut: string;
}

export interface PayloadShiftResult {
  items: ItemShift[];
  accommodations: AccommodationShift[];
}

export function shiftItemDates(
  items: readonly { id: string; date: string | null }[],
  oldArrive: string,
  newArrive: string,
  newDepart: string,
): ItemShift[] {
  const shifts: ItemShift[] = [];
  const maxOffset = nightsBetween(newArrive, newDepart);
  for (const item of items) {
    if (item.date == null) continue;
    const offset = daysBetween(oldArrive, item.date);
    const next = offset < 0 || offset > maxOffset ? null : addDays(newArrive, offset);
    if (next !== item.date) shifts.push({ id: item.id, date: next, prevDate: item.date });
  }
  return shifts;
}

export function shiftAccommodationDates(
  accommodations: readonly { id: string; checkIn: string; checkOut: string }[],
  deltaDays: number,
): AccommodationShift[] {
  if (deltaDays === 0) return [];
  return accommodations.map((a) => ({
    id: a.id,
    checkIn: addDays(a.checkIn, deltaDays),
    checkOut: addDays(a.checkOut, deltaDays),
    prevCheckIn: a.checkIn,
    prevCheckOut: a.checkOut,
  }));
}
```

- [ ] **Step 4: Run to verify pass**, then **Step 5: Commit** — `git add lib/payload-shift.* && git commit -m "feat(payload-shift): items and accommodation ride with their stop (ADR 0038)"`

---

### Task 4: retire sortOrder-based rendering assumptions in `lib/chapters.ts` + `lib/firm-up.ts`

**Files:**
- Modify: `lib/chapters.ts:99-109` (`sortGroupStops`)
- Modify: `lib/firm-up.ts` (`computeProjectedEnd`, around line 100: `const ordered = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);`)
- Test: `lib/chapters.test.ts`, `lib/firm-up.test.ts`

**Interfaces:**
- Consumes: `orderPlanStops` from `./plan-order` (Task 1).
- Produces: `sortGroupStops` becomes order-preserving (callers pass already-canonically-ordered lists); `computeProjectedEnd` orders via `orderPlanStops` internally. Signatures unchanged.

- [ ] **Step 1: Update `sortGroupStops`** — replace the function and its doc comment:

```ts
/**
 * Order stops within a rendered chapter group. Since ADR 0038 the global list
 * is already in canonical plan order (scheduled by date, rough by slot — see
 * lib/plan-order.ts), so groups simply preserve the input order. Kept as a
 * named seam so callers don't couple to that invariant.
 */
export function sortGroupStops<S extends StopLike & { id: string }>(stops: readonly S[]): S[] {
  return [...stops];
}
```

- [ ] **Step 2: Fix `sortGroupStops` tests** — in `lib/chapters.test.ts`, find the `sortGroupStops` describe. Rewrite expectations: input order is preserved verbatim (write one test passing a deliberately non-sortOrder-ordered list and asserting identity). Delete assertions that it re-sorts by `sortOrder`.

- [ ] **Step 3: Update `computeProjectedEnd`** — in `lib/firm-up.ts`, import `orderPlanStops` from `./plan-order` and change the ordering line:

```ts
const ordered = orderPlanStops([...stops].sort((a, b) => a.sortOrder - b.sortOrder));
```

`ProjectionStop` already has `id/arriveDate/departDate/sortOrder`, satisfying `OrderableStop`. Add a test to `lib/firm-up.test.ts`:

```ts
it("projects from date order even when sortOrder is stale (ADR 0038)", () => {
  // B was re-dated before A; sortOrder still says A first. Rough R trails.
  const stops = [
    { id: "A", arriveDate: "2026-06-05", departDate: "2026-06-08", nights: null, pinned: false, sortOrder: 0 },
    { id: "B", arriveDate: "2026-06-01", departDate: "2026-06-05", nights: null, pinned: false, sortOrder: 1 },
    { id: "R", arriveDate: null, departDate: null, nights: 2, pinned: false, sortOrder: 2 },
  ];
  // Flow: B(1–5) A(5–8) then rough R (2 nights) → projected end 06-10.
  expect(computeProjectedEnd(stops, "2026-06-01")).toBe("2026-06-10");
});
```

- [ ] **Step 4: Run** — `npx vitest run lib/chapters.test.ts lib/firm-up.test.ts` → PASS. Then `npm test` — if `components/trip/itinerary-manager.test.tsx` or others break on group ordering, fix their fixture expectations (the rendered order now equals canonical plan order).
- [ ] **Step 5: Commit** — `git commit -am "refactor(order): groups preserve canonical order; projection uses dates rule (ADR 0038)"`

---

### Task 5: `shiftStopPayloadTx` + `restoreStops` payload restore (server)

**Files:**
- Modify: `server/actions/stops.ts` (new exported helper near `recomputeChapterSpans` at line ~96; `restoreStops` at line ~1288)
- Test: `server/actions/stops.test.ts`

**Interfaces:**
- Consumes: `shiftItemDates`, `shiftAccommodationDates`, `PayloadShiftResult` from `@/lib/payload-shift`; `daysBetween` from `@/lib/dates`.
- Produces (used by Tasks 6–9 and the client task):
  - `export async function shiftStopPayloadTx(tx: Prisma.TransactionClient, stop: { id: string; arriveDate: string }, newArrive: string, newDepart: string): Promise<PayloadShiftResult>` — `stop.arriveDate` is the OLD arrive.
  - `restoreStops(entries, forkId?, payload?)` — third optional param `{ items: { id: string; date: string | null }[]; accommodations: { id: string; checkIn: string; checkOut: string }[] }`, restored verbatim inside the existing transaction.

- [ ] **Step 1: Write failing tests** — extend `server/actions/stops.test.ts` using its existing hoisted mocks (`transactionMock`, `stopFindManyMock`, etc.). The harness will need `itemFindManyMock`/`itemUpdateMock`/`accommodationUpdateMock` added to the `vi.hoisted` block and the `lib/db` mock's `item`/`accommodation` delegates — mirror how `chapterUpdateMock` is wired. Test cases:

```ts
describe("restoreStops payload restore (ADR 0038)", () => {
  it("writes item dates and accommodation check-in/out back verbatim", async () => {
    // arrange tx mock to run the callback with the tx facade (existing pattern)
    await restoreStops(
      [{ id: "s1", sortOrder: 0, chapterId: null, arriveDate: "2026-06-01", departDate: "2026-06-04" }],
      null,
      {
        items: [{ id: "i1", date: "2026-06-02" }],
        accommodations: [{ id: "a1", checkIn: "2026-06-01", checkOut: "2026-06-04" }],
      },
    );
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "i1" }, data: { date: "2026-06-02" } });
    expect(accommodationUpdateMock).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { checkIn: "2026-06-01", checkOut: "2026-06-04" },
    });
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `shiftStopPayloadTx`** (in `server/actions/stops.ts`, imports at top):

```ts
import { shiftItemDates, shiftAccommodationDates, type PayloadShiftResult } from "@/lib/payload-shift";
import { daysBetween } from "@/lib/dates"; // merge into the existing lib/dates import

/**
 * ADR 0038: when a stop is re-dated, its slotted Items keep their offset from
 * the arrive date (un-slotting if the day no longer fits) and its
 * Accommodation shifts by the arrive delta. Runs inside the caller's
 * transaction; returns the shifts (with pre-images) for the Undo payload.
 */
export async function shiftStopPayloadTx(
  tx: Prisma.TransactionClient,
  stop: { id: string; arriveDate: string },
  newArrive: string,
  newDepart: string,
): Promise<PayloadShiftResult> {
  const [items, accommodations] = await Promise.all([
    tx.item.findMany({ where: { stopId: stop.id, date: { not: null } }, select: { id: true, date: true } }),
    tx.accommodation.findMany({ where: { stopId: stop.id }, select: { id: true, checkIn: true, checkOut: true } }),
  ]);
  const itemShifts = shiftItemDates(items, stop.arriveDate, newArrive, newDepart);
  const accShifts = shiftAccommodationDates(accommodations, daysBetween(stop.arriveDate, newArrive));
  for (const s of itemShifts) {
    await tx.item.update({ where: { id: s.id }, data: { date: s.date } });
  }
  for (const s of accShifts) {
    await tx.accommodation.update({ where: { id: s.id }, data: { checkIn: s.checkIn, checkOut: s.checkOut } });
  }
  return { items: itemShifts, accommodations: accShifts };
}
```

- [ ] **Step 4: Extend `restoreStops`** — new signature `restoreStops(entries, forkId?: PlanId, payload?: { items: { id: string; date: string | null }[]; accommodations: { id: string; checkIn: string; checkOut: string }[] })`. Inside the existing `db.$transaction`, after the stop-restore loop and before `recomputeChapterSpans`:

```ts
for (const item of payload?.items ?? []) {
  await tx.item.update({ where: { id: item.id }, data: { date: item.date } });
}
for (const acc of payload?.accommodations ?? []) {
  await tx.accommodation.update({ where: { id: acc.id }, data: { checkIn: acc.checkIn, checkOut: acc.checkOut } });
}
```

- [ ] **Step 5: Run** — `npx vitest run server/actions/stops.test.ts` → PASS. **Commit** — `git commit -am "feat(stops): payload shift helper + restoreStops restores items/accommodation (ADR 0038)"`

---

### Task 6: rewrite `applyStopDates` — collision-push + payload; wire `setStopDates`/`updateStop`

**Files:**
- Modify: `server/actions/stops.ts` — `StopActionResult` (line ~25), `applyStopDates` (lines ~621-695), `updateStop` scheduled branch (lines ~477-524)
- Test: `server/actions/stops.test.ts`

**Interfaces:**
- Consumes: `collisionPush`, `SpanStop` from `@/lib/reorder`; `compareScheduled` from `@/lib/plan-order`; `shiftStopPayloadTx` (Task 5).
- Produces: `StopActionResult` success shape gains `changed?: { id: string; arriveDate: string; departDate: string }[]` and `payload?: PayloadShiftResult`. `setStopDates` keeps its signature. The client (Task 10) relies on `r.changed`, `r.conflicts`, `r.payload`.

- [ ] **Step 1: Extend the result type** (line ~25):

```ts
export type StopActionResult = ActionResult<{
  conflicts?: FlowConflict[];
  changed?: { id: string; arriveDate: string; departDate: string }[];
  payload?: PayloadShiftResult;
}>;
```

- [ ] **Step 2: Write failing tests** — extend the existing `setStopDates` describe in `server/actions/stops.test.ts`:

```ts
it("pushes only overlapped followers and leaves gap-protected stops alone (ADR 0038)", async () => {
  // Edited stop s1 extends to depart 06-06; follower s2(04–07) overlaps, s3(12–15) is gap-protected.
  // Arrange stopFindManyMock (followers query) to return s2 and s3; assert only s2 is updated,
  // shifted to arrive 06-06 / depart 06-09, and result.changed lists exactly s2.
});

it("returns the payload pre-images for undo", async () => {
  // Arrange itemFindManyMock to return a slotted item on the edited stop;
  // assert result.payload.items[0] carries prevDate.
});

it("flags an overlap with the preceding stop instead of moving it", async () => {
  // Preceding stop departs after the edited stop's new arrive → result.conflicts
  // contains a conflict whose stopId is the EDITED stop's id.
});
```

Fill these in concretely against the mock harness (the existing `setStopDates` tests show how `transactionMock`/`stopFindManyMock` sequences are arranged — follow that pattern exactly).

- [ ] **Step 3: Rewrite `applyStopDates`** — replace the body (keep the JSDoc, update it):

```ts
async function applyStopDates(
  stop: { id: string; tripId: string; sortOrder: number; forkId: string | null },
  dates: { arriveDate: string; departDate: string },
): Promise<StopActionResult> {
  const before = await db.stop.findUnique({
    where: { id: stop.id },
    select: { name: true, country: true, arriveDate: true, departDate: true, nights: true },
  });

  let changed: { id: string; arriveDate: string; departDate: string }[] = [];
  let conflicts: FlowConflict[] = [];
  const payload: PayloadShiftResult = { items: [], accommodations: [] };
  let maxDepart = dates.departDate;

  await db.$transaction(async (tx) => {
    await tx.stop.update({
      where: { id: stop.id },
      data: { arriveDate: dates.arriveDate, departDate: dates.departDate },
    });
    if (before?.arriveDate) {
      const shifted = await shiftStopPayloadTx(
        tx, { id: stop.id, arriveDate: before.arriveDate }, dates.arriveDate, dates.departDate,
      );
      payload.items.push(...shifted.items);
      payload.accommodations.push(...shifted.accommodations);
    }

    // ADR 0038 collision-push: followers = scheduled stops after the edited
    // stop in date order; each moves only as far as needed (gaps absorb).
    const others = (await tx.stop.findMany({
      where: { tripId: stop.tripId, id: { not: stop.id }, arriveDate: { not: null }, ...planScope(stop.forkId) },
      select: { id: true, name: true, arriveDate: true, departDate: true, sortOrder: true, pinned: true },
    })) as Array<{ id: string; name: string; arriveDate: string; departDate: string; sortOrder: number; pinned: boolean }>;
    others.sort(compareScheduled);

    const preceding = others.filter((s) => s.arriveDate < dates.arriveDate).pop();
    if (preceding && preceding.departDate > dates.arriveDate) {
      conflicts.push({
        stopId: stop.id,
        message: `These dates overlap ${preceding.name}'s stay (until ${preceding.departDate}).`,
      });
    }

    const followers = others.filter((s) => s.arriveDate >= dates.arriveDate);
    const pushed = collisionPush(followers, dates.departDate);
    conflicts = conflicts.concat(pushed.conflicts);
    const preById = new Map(others.map((s) => [s.id, s]));
    for (const r of pushed.results) {
      const pre = preById.get(r.id)!;
      await tx.stop.update({ where: { id: r.id }, data: { arriveDate: r.arriveDate, departDate: r.departDate } });
      const shifted = await shiftStopPayloadTx(tx, { id: r.id, arriveDate: pre.arriveDate }, r.arriveDate, r.departDate);
      payload.items.push(...shifted.items);
      payload.accommodations.push(...shifted.accommodations);
      if (r.departDate > maxDepart) maxDepart = r.departDate;
    }
    changed = pushed.results.map((r) => ({ id: r.id, arriveDate: r.arriveDate, departDate: r.departDate }));

    // Bands self-heal on any member date change (ADR 0021 §4).
    await recomputeChapterSpans(tx, stop.tripId, stop.forkId);

    // Auto-grow the trip window; never shrink endDate.
    const trip = await tx.trip.findUnique({ where: { id: stop.tripId }, select: { endDate: true } });
    if (!trip?.endDate || trip.endDate < maxDepart) {
      await tx.trip.update({ where: { id: stop.tripId }, data: { endDate: maxDepart } });
    }
  });

  await recordPlanActivity(stop.forkId, {
    tripId: stop.tripId,
    verb: "UPDATED",
    entityType: "STOP",
    entityId: stop.id,
    entityLabel: entityLabel("STOP", (before ?? {}) as Record<string, unknown>),
    changes: describeChanges(
      "STOP",
      (before ?? {}) as Record<string, unknown>,
      { ...(before ?? {}), arriveDate: dates.arriveDate, departDate: dates.departDate } as Record<string, unknown>,
    ),
  });

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true, conflicts, changed, payload };
}
```

- [ ] **Step 4: Wire `updateStop`'s scheduled branch** — its date write currently ripples nothing and strands payload. Inside its existing `db.$transaction` (line ~495), before `recomputeChapterSpans`, add: when `before?.arriveDate && (before.arriveDate !== arriveDate || before.departDate !== departDate)`, call `await shiftStopPayloadTx(tx, { id: stopId, arriveDate: before.arriveDate }, arriveDate!, departDate!)`. (Full collision-push via the dialog remains `setStopDates`' job; the form edit shifts payload only — it is the path used for renames where dates rarely change.)

- [ ] **Step 5: Run** — `npx vitest run server/actions/stops.test.ts` → PASS. **Commit** — `git commit -am "feat(stops): date edits collision-push with payload follow (ADR 0038)"`

---

### Task 7: rewrite `reorderStops` — span reflow via shared `reflowSpanTx`

**Files:**
- Modify: `server/actions/stops.ts` — `ReorderResult` (line ~29), new exported `reflowSpanTx`, `reorderStops` (lines ~1132-1274)
- Test: `server/actions/stops.test.ts`

**Interfaces:**
- Consumes: `spanReflow` from `@/lib/reorder`; `compareScheduled` from `@/lib/plan-order`; `shiftStopPayloadTx` (Task 5).
- Produces:
  - `export async function reflowSpanTx(tx: Prisma.TransactionClient, tripId: string, forkId: PlanId, movedIds: ReadonlySet<string>): Promise<{ changed: {id: string; arriveDate: string; departDate: string}[]; conflicts: FlowConflict[]; payload: PayloadShiftResult }>` — assumes the caller has ALREADY written the new arrangement to `sortOrder`. Task 8 (reorderChapters) reuses it.
  - `reorderStops(tripId, items, forkId?, movedStopIds?: string[])` — new optional 4th param; `ReorderResult` success shape gains `payload?: PayloadShiftResult`.

- [ ] **Step 1: Write failing tests** — extend the `reorderStops` describe:

```ts
it("re-dates only the affected span, preserving gaps (ADR 0038)", async () => {
  // Plan: A(01–04) B(04–07) gap C(09–12) D(12–15); client sends order A,C,B,D moved=["C"].
  // Assert stop.update date-writes happen for C (04–07) and B (07–10) ONLY — D and A untouched.
});

it("never re-dates scheduled stops when a rough stop is dragged", async () => {
  // items reorder only rough stops among fixed scheduled slots; movedStopIds=["rough1"].
  // Assert NO stop.update call carries arriveDate/departDate data.
});
```

Arrange via the existing `queryRawMock` (FOR UPDATE row read) and `stopFindManyMock` (ordered-stops read) patterns copied from the current reorderStops tests.

- [ ] **Step 2: Implement `reflowSpanTx`** (place after `shiftStopPayloadTx`):

```ts
/**
 * ADR 0038 drag reflow. Reads the plan's stops in the NEW arrangement (the
 * caller has already written sortOrder), reflows only the span between the
 * first and last scheduled stop whose chronological position changed, shifts
 * each re-dated stop's payload, and self-heals chapter bands. Gap-preserving;
 * never changes the trip's overall length.
 */
export async function reflowSpanTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  forkId: PlanId,
  movedIds: ReadonlySet<string>,
): Promise<{ changed: { id: string; arriveDate: string; departDate: string }[]; conflicts: FlowConflict[]; payload: PayloadShiftResult }> {
  const orderedStops = await tx.stop.findMany({
    where: { tripId, ...planScope(forkId) },
    orderBy: { sortOrder: "asc" },
    select: { id: true, arriveDate: true, departDate: true, pinned: true, sortOrder: true },
  });
  const newScheduled = orderedStops.filter(
    (s): s is (typeof orderedStops)[number] & { arriveDate: string; departDate: string } =>
      s.arriveDate != null && s.departDate != null,
  );
  const oldScheduled = [...newScheduled].sort(compareScheduled);

  const { results, conflicts } = spanReflow(oldScheduled, newScheduled, movedIds);
  const payload: PayloadShiftResult = { items: [], accommodations: [] };
  const preById = new Map(newScheduled.map((s) => [s.id, s]));
  const changedResults = results.filter((r) => r.changed);
  for (const r of changedResults) {
    const pre = preById.get(r.id)!;
    await tx.stop.update({ where: { id: r.id }, data: { arriveDate: r.arriveDate, departDate: r.departDate } });
    const shifted = await shiftStopPayloadTx(tx, { id: r.id, arriveDate: pre.arriveDate }, r.arriveDate, r.departDate);
    payload.items.push(...shifted.items);
    payload.accommodations.push(...shifted.accommodations);
  }
  await recomputeChapterSpans(tx, tripId, forkId);
  return {
    changed: changedResults.map((r) => ({ id: r.id, arriveDate: r.arriveDate, departDate: r.departDate })),
    conflicts,
    payload,
  };
}
```

- [ ] **Step 3: Rework `reorderStops`** — signature `reorderStops(tripId: string, items: { id: string; chapterId: string | null }[], forkId?: PlanId, movedStopIds?: string[])`. Delete the `trip.startDate` anchor pre-read (lines ~1185-1189) and, inside the transaction, everything from the "Reflow scheduled stop dates" comment through `recomputeChapterSpans` (lines ~1223-1262). In their place, after the sortOrder/chapterId write loop:

```ts
const reflow = await reflowSpanTx(tx, tripId, reorderForkId, new Set(movedStopIds ?? []));
changed = reflow.changed;
conflicts = reflow.conflicts;
payload = reflow.payload;
```

with `let payload: PayloadShiftResult = { items: [], accommodations: [] };` declared beside `changed`/`conflicts`, returned as `{ success: true, changed, conflicts, payload }`. Update `ReorderResult` (line ~29) so the success arm includes `payload?: PayloadShiftResult`.

- [ ] **Step 4: Run** — `npx vitest run server/actions/stops.test.ts` → PASS (old whole-plan-reflow expectations must be updated to span expectations — rewrite, don't delete coverage).
- [ ] **Step 5: Commit** — `git commit -am "feat(stops): drag reorder reflows span-scoped with payload follow (ADR 0038)"`

---

### Task 8: `reorderChapters` uses the span engine; delete `reflowReorderedDates`

**Files:**
- Modify: `server/actions/chapters.ts` — `reorderChapters` (line ~155 onward)
- Modify: `lib/reorder.ts` — delete `reflowReorderedDates`, `ReflowStop`; keep `ReflowResult`
- Test: `server/actions/chapters.test.ts`, `lib/reorder.test.ts`

**Interfaces:**
- Consumes: `reflowSpanTx` from `@/server/actions/stops` (already imported for `recomputeChapterSpans`, line 15).
- Produces: `reorderChapters(tripId, orderedChapterIds, forkIdArg?, movedChapterId?: string)` — new optional 4th param naming the dragged chapter; result unchanged in shape (plus `payload` inherited from `ReorderResult`).

- [ ] **Step 1: Read the rest of `reorderChapters`** (from line 215 to its end) to locate its current reflow/persist block.
- [ ] **Step 2: Write failing test** — in `chapters.test.ts`: dated-chapter drag re-dates only the dragged block + displaced stops; stops outside the span keep dates (arrange like Task 7's test, with the moved chapter's stops as `movedIds`).
- [ ] **Step 3: Implement** — inside `reorderChapters`:
  - accept `movedChapterId?: string`; compute `const movedIds = new Set((stopsByChapter.get(movedChapterId ?? "") ?? []).map((s) => s.id));`
  - keep the `orderedItems` construction and sortOrder/chapterId writes; delete its anchor computation (lines ~185-192) and its old whole-plan reflow; call `await reflowSpanTx(tx, tripId, forkId, movedIds)` in the same transaction and return its `changed`/`conflicts`/`payload`.
- [ ] **Step 4: Delete `reflowReorderedDates` + `ReflowStop`** from `lib/reorder.ts` and their describes from `lib/reorder.test.ts`. Grep first: `grep -rn "reflowReorderedDates\|ReflowStop" --include="*.ts" --include="*.tsx" .` — the only remaining references must be the ones you are deleting.
- [ ] **Step 5: Run** — `npx vitest run server/actions/chapters.test.ts lib/reorder.test.ts server/actions/stops.test.ts` → PASS. **Commit** — `git commit -am "feat(chapters): chapter drags reflow span-scoped; retire whole-plan reflow"`

---

### Task 9: firm-up actions shift payload and order canonically

**Files:**
- Modify: `server/actions/stops.ts` — `firmUpSegment` (lines ~729-857, date-write loop around ~769-790), `firmUpTrip` (lines ~859-975, write loop around ~896)
- Test: `server/actions/stops.test.ts`

**Interfaces:**
- Consumes: `shiftStopPayloadTx` (Task 5), `orderPlanStops` from `@/lib/plan-order`.
- Produces: no signature changes.

- [ ] **Step 1: Write failing test** — firm-up that re-dates an ALREADY-scheduled stop must shift that stop's slotted items and accommodation (assert `item.update` called with the offset-preserved date). A firm-up that dates a previously-ROUGH stop must NOT touch items (no old arrive to offset from).
- [ ] **Step 2: Implement** — in both actions:
  - where stops are loaded `orderBy: { sortOrder: "asc" }` for flowing, wrap with `orderPlanStops(...)` so the flow follows canonical order (dates rule) rather than raw sortOrder;
  - in each `db.stop.update`/`tx.stop.update` loop that writes flowed dates, when the stop's PREVIOUS `arriveDate` was non-null and the dates changed, call `shiftStopPayloadTx` with the old arrive and new dates. These loops run outside a transaction today (`db.stop.update` directly) — `shiftStopPayloadTx` accepts `Prisma.TransactionClient`, and `db` satisfies that interface; pass `db`.
- [ ] **Step 3: Run** — `npx vitest run server/actions/stops.test.ts` → PASS. **Commit** — `git commit -am "feat(firm-up): payload rides along when firm-up re-dates scheduled stops"`

---

### Task 10: client — dates-rule rendering, pinned-drag block, undo with payload

**Files:**
- Modify: `components/trip/itinerary-manager.tsx`
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` (initialStops), `app/(app)/trips/[tripId]/summary/page.tsx` (stop ordering before grouping)
- Test: `components/trip/itinerary-manager.test.tsx`

**Interfaces:**
- Consumes: `orderPlanStops` from `@/lib/plan-order`; extended `reorderStops`/`reorderChapters`/`setStopDates`/`restoreStops` (Tasks 6–8).
- Produces: no new exports.

- [ ] **Step 1: Order at the source** — in `plan/page.tsx`, import `orderPlanStops` and wrap the fetched stops before mapping to `initialStops` (line ~367: `initialStops={stops.map(...)}` → `initialStops={orderPlanStops(stops).map(...)}`). In `summary/page.tsx`, wrap the dated-summary stops list with `orderPlanStops(...)` before it is grouped with `groupStopsByChapter` (fetch is around line 186-269; keep the fetch `orderBy` as-is).

- [ ] **Step 2: Block dragging a pinned scheduled stop** — in `handleDragEnd`'s stop branch (after `const activeIsScheduled = activeStop.arriveDate !== null;`, line ~1141):

```ts
if (activeIsScheduled && activeStop.pinned) {
  toast({ title: "This stop is pinned — unpin it to move it." });
  return;
}
```

- [ ] **Step 3: Thread moved ids** — line ~1214: `await reorderStops(tripId, items, forkId ?? null, [activeId])`. Rough-chapter path (line ~1287): `await reorderStops(tripId, stopItems, forkId ?? null, [])`. Dated-chapter path (line ~1312): `await reorderChapters(tripId, orderedChapterIds, forkId ?? null, activeId)`.

- [ ] **Step 4: Extend `applyReorderResult`** (line ~1333) — add a 5th param `payload` and re-sort after applying dates:

```ts
function applyReorderResult(
  movedName: string,
  changed: { id: string; arriveDate: string; departDate: string }[] | undefined,
  conflicts: { stopId: string; message: string }[] | undefined,
  preDragSnapshot: { id: string; sortOrder: number; chapterId: string | null; arriveDate: string | null; departDate: string | null }[],
  payload?: {
    items: { id: string; date: string | null; prevDate: string }[];
    accommodations: { id: string; checkIn: string; checkOut: string; prevCheckIn: string; prevCheckOut: string }[];
  },
) {
```

Apply `changed` as today but wrap the result: `setLocalStops((prev) => orderPlanStops(prev.map(...)))`. In `onUndo`, wrap the revert the same way (`orderPlanStops(....sort((a, b) => a.sortOrder - b.sortOrder))`) and pass the pre-images through:

```ts
void restoreStops(
  preDragSnapshot,
  forkId ?? null,
  payload
    ? {
        items: payload.items.map((i) => ({ id: i.id, date: i.prevDate })),
        accommodations: payload.accommodations.map((a) => ({ id: a.id, checkIn: a.prevCheckIn, checkOut: a.prevCheckOut })),
      }
    : undefined,
).then((res) => { /* existing failure toast */ });
```

Update both call sites (lines ~1228, ~1323) to pass `result.payload` / `chapterResult.payload`.

- [ ] **Step 5: Rewrite `handleSaveAdjustDates`** (line ~939) — a date edit is now a first-class ripple with the same toast+undo:

```ts
async function handleSaveAdjustDates(
  stopId: string,
  dates: { arriveDate: string; departDate: string },
) {
  const stop = localStops.find((s) => s.id === stopId);
  const preSnapshot = localStops.map((s) => ({
    id: s.id, sortOrder: s.sortOrder, chapterId: s.chapterId, arriveDate: s.arriveDate, departDate: s.departDate,
  }));
  setPendingId(stopId);
  try {
    const r = await setStopDates(stopId, dates);
    if (r.success) {
      setLocalStops((prev) =>
        orderPlanStops(prev.map((s) => (s.id === stopId ? { ...s, ...dates } : s))),
      );
      applyReorderResult(stop?.name ?? "Stop", r.changed, r.conflicts, preSnapshot, r.payload);
    }
  } catch {
    toast({ variant: "destructive", title: "Something went wrong — nothing was changed. Try again." });
  } finally {
    setPendingId(null);
    setAdjustingStop(null);
  }
}
```

(The old pin-conflict toast is subsumed: `applyReorderResult` → `summariseReorder` already reports conflicts.)

- [ ] **Step 6: Component tests** — update `itinerary-manager.test.tsx`: fixtures whose scheduled stops are listed out of date order now render in date order; add a test that a pinned stop drag shows the "pinned" toast and calls no action. Run `npx vitest run components/trip/itinerary-manager.test.tsx` → PASS.
- [ ] **Step 7: Commit** — `git commit -am "feat(plan-editor): dates-rule rendering, span undo with payload, date-edit ripple toast (ADR 0038)"`

---

### Task 11: `Trip.chaptersEnabled` — schema, migration, `setChaptersEnabled` action

**Files:**
- Modify: `prisma/schema.prisma` (Trip model, after `roundTrip` at line ~116)
- Create: `prisma/migrations/20260824000000_chapters_enabled/migration.sql`
- Modify: `server/actions/trips.ts`
- Test: `server/actions/trips.test.ts`

**Interfaces:**
- Consumes: `recomputeChapterSpans` from `@/server/actions/stops`.
- Produces: `export async function setChaptersEnabled(tripId: string, enabled: boolean)` returning the same result type `updateTrip` uses (read `trips.ts:115` and match it). Tasks 12–13 rely on `Trip.chaptersEnabled: boolean`.

- [ ] **Step 1: Schema** — add to the Trip model beneath `roundTrip`:

```prisma
  // Chapters are opt-in per trip (spec 2026-08-24): off by default; the
  // migration backfills true for trips that already have chapters.
  chaptersEnabled Boolean @default(false)
```

- [ ] **Step 2: Migration SQL** (`prisma/migrations/20260824000000_chapters_enabled/migration.sql`):

```sql
-- Chapters become opt-in per Trip: off by default for new trips; existing
-- trips that already built chapters keep them on.
ALTER TABLE "Trip" ADD COLUMN "chaptersEnabled" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Trip" SET "chaptersEnabled" = true
WHERE "id" IN (SELECT DISTINCT "tripId" FROM "Chapter");
```

Run `npx prisma generate`. If the dev database is reachable (`docker compose up -d` then `npx prisma migrate deploy`), apply it; if not, note it in the commit body — tests mock Prisma and don't need a live DB.

- [ ] **Step 3: Write failing test** — in `trips.test.ts` (mirror its existing mock harness): `setChaptersEnabled(tripId, true)` updates the trip AND recomputes chapter spans for the real plan and every fork; `setChaptersEnabled(tripId, false)` only updates the trip (no span recompute).

- [ ] **Step 4: Implement** in `server/actions/trips.ts` (match the file's existing imports/guards/activity pattern — read `updateTrip` first and copy its conventions):

```ts
export async function setChaptersEnabled(tripId: string, enabled: boolean): Promise<UpdateTripResult> {
  await requireTripAccess(tripId);
  await db.$transaction(async (tx) => {
    await tx.trip.update({ where: { id: tripId }, data: { chaptersEnabled: enabled } });
    if (enabled) {
      // Bands may have gone stale while hidden — self-heal every plan (ADR 0021 §4).
      await recomputeChapterSpans(tx, tripId, null);
      const forks = await tx.fork.findMany({ where: { tripId }, select: { id: true } });
      for (const fork of forks) {
        await recomputeChapterSpans(tx, tripId, fork.id);
      }
    }
  });
  // Activity: use the same recorder updateTrip uses, with
  // changes: { summary: enabled ? "Turned chapters on" : "Turned chapters off" }.
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/plan`);
  return { success: true };
}
```

(`UpdateTripResult` — substitute the actual result type name used by `updateTrip`.)

- [ ] **Step 5: Run** — `npx vitest run server/actions/trips.test.ts` → PASS. **Commit** — `git commit -am "feat(trips): per-trip chaptersEnabled toggle with backfill migration"`

---

### Task 12: plan editor — Chapters menu + affordance gating

**Files:**
- Modify: `components/trip/itinerary-manager.tsx`, `app/(app)/trips/[tripId]/plan/page.tsx`
- Test: `components/trip/itinerary-manager.test.tsx`

**Interfaces:**
- Consumes: `setChaptersEnabled` (Task 11); `DropdownMenu` primitives from `@/components/ui/dropdown-menu` (read that file for exact export names before writing JSX).
- Produces: `ItineraryManagerProps` gains `chaptersEnabled?: boolean` (default `true` so existing tests/fixtures keep working).

- [ ] **Step 1: Page wiring** — in `plan/page.tsx`: add `chaptersEnabled: true` to the trip `select` (line ~48-58); pass `chaptersEnabled={trip?.chaptersEnabled ?? true}` and `chapters={trip?.chaptersEnabled ? chapters : []}` to `ItineraryManager` (line ~364).

- [ ] **Step 2: Write failing component test** — with `chaptersEnabled={false}` and chapters present in the DB-shape props: renders the flat list (no chapter headers), no "New Chapter"/"Suggest from countries" controls, and a "Group into chapters…" menu item; with `chaptersEnabled` on: menu shows "New Chapter", "Suggest from countries", "Turn off chapters".

- [ ] **Step 3: Implement** in `itinerary-manager.tsx`:
  - add the prop (`chaptersEnabled = true` in the destructure);
  - `handleToggleChapters`:

```ts
async function handleToggleChapters() {
  setPendingId("chapters-toggle");
  try {
    const res = await setChaptersEnabled(tripId, !chaptersEnabled);
    if (!res.success) toast({ variant: "destructive", title: "Couldn't update chapters. Try again." });
  } catch {
    toast({ variant: "destructive", title: "Something went wrong — nothing was changed. Try again." });
  } finally {
    setPendingId(null);
  }
}
```

  - replace the two buttons at lines ~2001-2018 with a `DropdownMenu` (trigger: ghost Button, `BookOpen` icon, label "Chapters"): when on → items "New Chapter" (`handleNewChapter`), "Suggest from countries" (`handleSuggestChapters`, disabled while `isSuggesting`), separator, "Turn off chapters" (`handleToggleChapters`); when off → single item "Group into chapters…" (`handleToggleChapters`);
  - empty-state "New Chapter" button (line ~2039): render only when `chaptersEnabled`;
  - safety-net: `const effectiveChapters = chaptersEnabled ? chapters : [];` and use it where `localChapters` is initialised, so a stale prop combination can't render bands.

- [ ] **Step 4: Run** — `npx vitest run components/trip/itinerary-manager.test.tsx` → PASS. **Commit** — `git commit -am "feat(plan-editor): chapters menu — opt in, suggest, turn off"`

---

### Task 13: gate the remaining chapter surfaces

**Files:**
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` (chapters fetched line ~96, passed line ~221)
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx` (dateless chapters line ~127, dated chapters line ~247)
- Modify: `app/(app)/trips/[tripId]/page.tsx` (trip select for phase components, line ~76)
- Modify: `components/trip/home/phase-sketching.tsx` (line ~15), `phase-planning.tsx`, `phase-travelling.tsx` (line ~60), `phase-past.tsx`
- Test: `app/(app)/trips/[tripId]/summary/page.test.tsx`, `components/trip/home/phase-planning.test.tsx`, `components/trip/home/phase-past.test.tsx`

**Interfaces:**
- Consumes: `Trip.chaptersEnabled` (Task 11).
- Produces: nothing new — every surface treats a disabled trip as "no chapters".

- [ ] **Step 1: Budget page** — add `chaptersEnabled` to the trip select in this page (locate the trip fetch; add if absent), then where chapters flow into the budget build (line ~221): `chapters: trip.chaptersEnabled ? chapters : []`. With `chapters: []`, `lib/budget.ts` already returns no `byChapter` and no between-legs bucket — flat roll-up, no budget-lib change needed.
- [ ] **Step 2: Summary page** — add `chaptersEnabled` to its trip select; gate BOTH chapter fetches (`datelessChapters` at ~127 and the dated `db.chapter.findMany` at ~247) with `trip.chaptersEnabled ? ... : []` (or skip the query entirely via a ternary Promise). Chapter chips and per-chapter sections disappear when off.
- [ ] **Step 3: Home phases** — in `app/(app)/trips/[tripId]/page.tsx` ensure the `trip` passed to phase components selects `chaptersEnabled`. In each phase component that fetches chapters (`phase-sketching.tsx:15`, `phase-travelling.tsx:60`, and the equivalent fetches in `phase-planning.tsx` / `phase-past.tsx` — grep `chapter.findMany` in each), wrap: `trip.chaptersEnabled ? db.chapter.findMany(...) : Promise.resolve([])`.
- [ ] **Step 4: Sweep** — `grep -rn "chapter" app components --include="*.tsx" -l | grep -v test` and confirm every remaining surface either received gated chapters from these pages or renders nothing when the list is empty. The plan editor (Task 12) and these pages are the full known set: plan, budget, summary, home phases.
- [ ] **Step 5: Update the touched page/component tests** — trips with `chaptersEnabled: false` + existing chapters render flat (no chapter names in output); enabled trips unchanged. Run `npx vitest run app components` → PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(chapters): gate budget, summary and home surfaces behind the per-trip toggle"`

---

### Task 14: full verification sweep

**Files:** none new.

- [ ] **Step 1:** `npm test` — full suite green. Fix any fallout (likely spots: itinerary-manager fixtures assuming sortOrder rendering; stops.test.ts snapshots of the old reflow).
- [ ] **Step 2:** `npm run lint` — clean.
- [ ] **Step 3:** `npm run build` — compiles (catches server/client type drift in the extended action results).
- [ ] **Step 4:** Re-read the spec section of ADR 0038 and this plan's goal line; confirm each decision has a shipped implementation: dates-rule render (Tasks 1, 4, 10), span reflow + gaps (2, 7, 8), collision-push (2, 6), rough drag never re-dates (7's second test), payload follow + transport flag (3, 5, 6, 9 — transport mismatch flag already exists at `lib/flags.ts:244`, no change needed), undo incl. payload (5, 10), pins hold (2), chapters toggle default-off + backfill (11), plan-editor menu (12), surface gating (13).
- [ ] **Step 5: Commit** any fixes — `git commit -am "test: verification sweep fallout"`.

---

## Out of scope (explicitly)

- Firm-up's pack-from-anchor gap behaviour (it stays the explicit batch-dating sledgehammer; only payload-follow and canonical ordering were added).
- Auto-moving Transport times (decided against — the existing `flagTransportDateMismatches` read-time flag covers it).
- Deleting `Stop.chapterSortOrder` or reworking rough-chapter explicit membership.
- Merge/deploy — stop at a green branch; the user decides integration.
