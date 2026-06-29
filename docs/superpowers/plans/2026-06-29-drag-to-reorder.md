# Drag-to-Reorder (Plan) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the up/down arrows in the plan with drag-and-drop reordering for the *rough* (sketch) parts of the itinerary: reorder rough stops, drag rough stops between rough chapters + the ungrouped run, and reorder rough chapters. Dated stops/chapters stay date-ordered and are NOT draggable.

**Architecture:** dnd-kit provides accessible (pointer + keyboard + touch) sortable lists. Only rough stops and rough chapters get a drag handle. Drops persist via two new `FOR UPDATE`-locked server actions: `reorderStops` (rewrites global `sortOrder` + reassigns a rough stop's `chapterId`) and `reorderChapters` (rewrites rough chapters' `sortOrder`). The itinerary's visual order stays driven by global `sortOrder`; a new pure `sortGroupStops` renders dated stops in date order within each group so R1 stays coherent. Desktop inline arrows are removed; the mobile overflow "Move up/down" stays as a touch fallback (rough stops only).

**Tech Stack:** Next.js 16 (RSC + server actions), Prisma 7 + Postgres, React 19, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`, Tailwind v4, Vitest + Testing Library.

**Domain rules (from the grill + CONTEXT.md):** A Stop is *rough* (no dates) or *scheduled* (dated). A Chapter is *rough* (no dates) or *dated*. "For any dated Stop, dates are the source of truth." Rough stops carry explicit `chapterId` + the list order; dated stops belong to date-band chapters. **R1: drag is a sketching gesture — only rough things move; a rough stop can never be dropped into a dated chapter.**

---

### Task 1: `reorderStops` server action

**Files:**
- Modify: `server/actions/stops.ts` (add `reorderStops`)
- Test: `server/actions/stops.test.ts` (read it first for mock conventions)

Drops can land anywhere, so a neighbour-swap (`moveStop`) won't do. `reorderStops` takes the full new order of the affected stops and rewrites `sortOrder = index`, and (for rough stops only) reassigns `chapterId`. Lock with `FOR UPDATE` like `moveStop` (ADR 0007).

- [ ] **Step 1: Write failing tests**

Add to `server/actions/stops.test.ts` (match its existing mocking of `@/lib/db`, `@/lib/guards`, the `$transaction`/`$queryRaw` mocks used by the `moveStop` tests — READ those tests first):
1. Happy path: `reorderStops("t1", [{id:"a",chapterId:null},{id:"b",chapterId:"c1"},{id:"c",chapterId:null}])` where all belong to trip t1 and `b` is rough and `c1` is a ROUGH chapter → each stop updated with `sortOrder` = its index, and `b`'s `chapterId` set to `c1`. Returns `{success:true}`.
2. Rejects a stop not in the trip: one id resolves to a different `tripId` → `{success:false}` and NO updates.
3. Refuses to move a rough stop into a DATED chapter: `chapterId` points at a chapter with non-null `startDate` → `{success:false, error:/dated chapter/i}`, no updates.
4. Ignores `chapterId` for a DATED (scheduled) stop: a stop with an `arriveDate` keeps its date-band membership — its `chapterId` is NOT written (only its `sortOrder`).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/actions/stops.test.ts`
Expected: FAIL (reorderStops not defined).

- [ ] **Step 3: Implement `reorderStops`**

Add to `server/actions/stops.ts` (it already imports `db`, `requireTripAccess`/`requireStopAccess`, `revalidatePath`; reuse the `FOR UPDATE` raw-SQL pattern from `moveStop`):

```ts
/**
 * Reorder stops to an explicit new order (drag-and-drop). Rewrites global
 * sortOrder = index for the given stops, and reassigns a ROUGH stop's chapterId.
 * Dated stops keep date-band chapter membership (chapterId ignored for them).
 * Locked FOR UPDATE to serialise with moveStop/other reorders (cf. ADR 0007).
 */
export async function reorderStops(
  tripId: string,
  items: { id: string; chapterId: string | null }[],
): Promise<StopActionResult> {
  await requireTripAccess(tripId);
  if (items.length === 0) return { success: true };

  const ids = items.map((i) => i.id);

  await db.$transaction(async (tx) => {
    // Lock the trip's stops; also validates ownership.
    const rows = await tx.$queryRaw<Array<{ id: string; tripId: string; arriveDate: string | null }>>`
      SELECT "id", "tripId", "arriveDate"
      FROM "Stop"
      WHERE "id" = ANY(${ids})
      FOR UPDATE
    `;
    const byId = new Map(rows.map((r) => [r.id, r]));
    // Every id must exist and belong to this trip.
    for (const id of ids) {
      const r = byId.get(id);
      if (!r || r.tripId !== tripId) throw new Error("STOP_NOT_IN_TRIP");
    }

    // Validate any target chapter is rough (date-less) before writing anything.
    const targetChapterIds = [...new Set(items.map((i) => i.chapterId).filter((c): c is string => c != null))];
    const chapters = targetChapterIds.length
      ? await tx.chapter.findMany({ where: { id: { in: targetChapterIds }, tripId }, select: { id: true, startDate: true } })
      : [];
    const chapterById = new Map(chapters.map((c) => [c.id, c]));
    for (const i of items) {
      if (i.chapterId == null) continue;
      const ch = chapterById.get(i.chapterId);
      if (!ch) throw new Error("CHAPTER_NOT_IN_TRIP");
      if (ch.startDate != null) throw new Error("DATED_CHAPTER");
    }

    // Write order (+ chapterId for rough stops only).
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const isRough = byId.get(it.id)!.arriveDate == null;
      await tx.stop.update({
        where: { id: it.id },
        data: isRough ? { sortOrder: idx, chapterId: it.chapterId } : { sortOrder: idx },
      });
    }
  }).catch((e) => {
    if (e instanceof Error && ["STOP_NOT_IN_TRIP", "CHAPTER_NOT_IN_TRIP", "DATED_CHAPTER"].includes(e.message)) {
      throw e; // converted below
    }
    throw e;
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/plan`);
  return { success: true };
}
```

Wrap the call so the thrown sentinels become typed errors. Simplest: put the `$transaction` in a `try/catch` and map `DATED_CHAPTER` → `{success:false, error:"Can't move a rough stop into a dated chapter."}`, the others → `{success:false, error:"One or more stops aren't part of this trip."}`. Adjust the code above to that try/catch shape (don't double-throw). Confirm `StopActionResult` allows `{success:false; error}` — if it only has `{success:false; errors}`, follow the existing shape used by `moveStop`/`setStopDates` results in that file and match it.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run server/actions/stops.test.ts`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add server/actions/stops.ts server/actions/stops.test.ts
git commit -m "feat(drag): reorderStops action (explicit order + rough chapter reassignment)"
```

---

### Task 2: `reorderChapters` action + rough-chapter ordering

**Files:**
- Modify: `server/actions/chapters.ts` (add `reorderChapters`)
- Modify: `lib/chapters.ts` (`sortedByStart` tiebreak rough chapters by `sortOrder`; add `sortOrder` to `ChapterLike`)
- Test: `server/actions/chapters.test.ts`, `lib/chapters.test.ts` (read both for conventions)

Rough chapters have no dates, so they currently tie in `sortedByStart`. Give them a stable, user-controlled order via `Chapter.sortOrder` (the column already exists).

- [ ] **Step 1: Failing tests — `sortedByStart` rough order**

In `lib/chapters.test.ts`, add: given three chapters — two rough (`startDate:null`, `sortOrder: 2` and `0`) and one dated (`startDate:"2026-07-01"`, `sortOrder: 1`) — `sortedByStart` (exported for test, or via `groupStopsByChapter` order) returns the rough chapters ordered by `sortOrder` ascending among themselves, and dated chapters ordered by date. Decide ordering of rough vs dated: **rough chapters sort AFTER dated ones** (dated anchor the calendar; rough are sketch tail). Assert: `[dated, rough(sortOrder0), rough(sortOrder2)]`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/chapters.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the sort change**

In `lib/chapters.ts`: add `sortOrder?: number` to `ChapterLike`. Replace `sortedByStart`:

```ts
function sortedByStart<T extends { startDate: string | null; sortOrder?: number }>(chapters: readonly T[]): T[] {
  return [...chapters].sort((a, b) => {
    const aDated = a.startDate != null;
    const bDated = b.startDate != null;
    if (aDated && bDated) return a.startDate!.localeCompare(b.startDate!);
    if (aDated !== bDated) return aDated ? -1 : 1; // dated first, rough after
    // both rough: explicit sortOrder
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}
```

- [ ] **Step 4: Failing tests — `reorderChapters`**

In `server/actions/chapters.test.ts`, add:
1. Happy path: `reorderChapters("t1", ["c2","c1"])` where both are rough chapters of t1 → `c2.sortOrder=0`, `c1.sortOrder=1`, `{success:true}`.
2. Rejects a chapter from another trip → no updates, error result (match the file's result shape).
3. Rejects reordering a DATED chapter (non-null startDate in the list) → error; dated chapters are date-ordered, not hand-ordered.

- [ ] **Step 5: Run to verify failure**

Run: `npx vitest run server/actions/chapters.test.ts`
Expected: FAIL.

- [ ] **Step 6: Implement `reorderChapters`**

Add to `server/actions/chapters.ts` (reuse `requireTripAccess`, `revalidateChapterPaths`):

```ts
export async function reorderChapters(
  tripId: string,
  orderedChapterIds: string[],
): Promise<ChapterActionResult> {
  await requireTripAccess(tripId);
  if (orderedChapterIds.length === 0) return { success: true };

  const chapters = await db.chapter.findMany({
    where: { id: { in: orderedChapterIds }, tripId },
    select: { id: true, startDate: true },
  });
  if (chapters.length !== orderedChapterIds.length) {
    return { success: false, errors: { chapter: ["One or more chapters aren't part of this trip."] } };
  }
  if (chapters.some((c) => c.startDate != null)) {
    return { success: false, errors: { chapter: ["Only rough (date-less) chapters can be reordered."] } };
  }

  await db.$transaction(
    orderedChapterIds.map((id, idx) =>
      db.chapter.update({ where: { id }, data: { sortOrder: idx } }),
    ),
  );

  revalidateChapterPaths(tripId);
  return { success: true };
}
```

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run lib/chapters.test.ts server/actions/chapters.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/chapters.ts lib/chapters.test.ts server/actions/chapters.ts server/actions/chapters.test.ts
git commit -m "feat(drag): reorderChapters action + rough chapters ordered by sortOrder"
```

---

### Task 3: `sortGroupStops` — dated runs render in date order

**Files:**
- Modify: `lib/chapters.ts` (add `sortGroupStops`)
- Test: `lib/chapters.test.ts`

Within a rendered group, dated stops should appear in date order (their truth) and rough stops in explicit `sortOrder`; rough come after dated in a mixed (ungrouped) group.

- [ ] **Step 1: Failing test**

In `lib/chapters.test.ts`:

```ts
import { sortGroupStops } from "./chapters";

it("orders a group: dated by date, then rough by sortOrder", () => {
  const stops = [
    { id: "r2", arriveDate: null, departDate: null, sortOrder: 5 },
    { id: "d2", arriveDate: "2026-07-10", departDate: "2026-07-12", sortOrder: 1 },
    { id: "r1", arriveDate: null, departDate: null, sortOrder: 2 },
    { id: "d1", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 9 },
  ];
  expect(sortGroupStops(stops).map((s) => s.id)).toEqual(["d1", "d2", "r1", "r2"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/chapters.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
/**
 * Order stops within a rendered chapter group: dated stops by arrive date
 * (their source of truth), then rough stops by explicit sortOrder. Pure.
 */
export function sortGroupStops<S extends StopLike>(stops: readonly S[]): S[] {
  const dated = stops.filter((s) => s.arriveDate != null)
    .sort((a, b) => (a.arriveDate as string).localeCompare(b.arriveDate as string) || a.sortOrder - b.sortOrder);
  const rough = stops.filter((s) => s.arriveDate == null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return [...dated, ...rough];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/chapters.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply in the itinerary render**

In `components/trip/itinerary-manager.tsx`, when rendering each group's stops (both the chapter-group body and the ungrouped run), map `group.stops` through `sortGroupStops(group.stops)` before the `.map(renderStop...)`. Import `sortGroupStops` from `@/lib/chapters`. (Global indices for isFirst/isLast: keep using the global `stops` array position — `stops.indexOf(stop)` — so they remain correct after the per-group re-sort.)

- [ ] **Step 6: Verify**

Run: `npx vitest run lib/chapters.test.ts && npx tsc --noEmit && npx vitest run components/trip/itinerary-manager.test.tsx`
Expected: PASS / 0.

- [ ] **Step 7: Commit**

```bash
git add lib/chapters.ts lib/chapters.test.ts components/trip/itinerary-manager.tsx
git commit -m "feat(drag): sortGroupStops — dated runs render in date order"
```

---

### Task 4: Add dnd-kit dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run: `npm install @dnd-kit/core@^6 @dnd-kit/sortable@^10 @dnd-kit/utilities@^3`
Expected: added to dependencies, no peer-dep errors with React 19 (dnd-kit supports React 19).

- [ ] **Step 2: Verify build still compiles**

Run: `npx tsc --noEmit && npx vitest run` (full suite)
Expected: exit 0 / all pass (no usage yet, just the dep).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(drag): add @dnd-kit for accessible drag-and-drop"
```

---

### Task 5: `StopCard` drag handle + retire desktop arrows

**Files:**
- Modify: `components/trip/stop-card.tsx`
- Test: `components/trip/stop-card.test.tsx`

Add an optional drag-handle slot, shown only for rough stops. Remove the inline desktop up/down arrow buttons. Keep the mobile overflow "Move up/Move down" but only for rough stops (dated stops lose reorder entirely — they're date-ordered).

- [ ] **Step 1: Failing test**

In `components/trip/stop-card.test.tsx`:
1. A rough stop (`arriveDate:null`) renders a drag handle (an element with `aria-label` matching `/drag|reorder/i` OR a `data-testid="stop-drag-handle"`). A scheduled stop does NOT.
2. The inline desktop `aria-label="Move … up"` / `"… down"` buttons are GONE (query returns null) for both rough and scheduled stops.
3. A rough stop's overflow menu still includes "Move up"/"Move down"; a scheduled stop's overflow menu does NOT.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/trip/stop-card.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `components/trip/stop-card.tsx`:
- Add to `StopCardProps`: `dragHandle?: React.ReactNode;` (the parent passes dnd-kit's handle props rendered as a button; StopCard just slots it in). Render it at the left of the top row **only when `isRough` and `dragHandle` is provided**.
- Remove the inline `hidden sm:flex` block containing the two `ChevronUp`/`ChevronDown` move buttons (keep the "Start a chapter here" inline button). Remove now-unused `ChevronUp`/`ChevronDown` imports only if they're no longer used (they are still used by the overflow items — keep them).
- Build `overflowItems` so the "up"/"down" entries are included only when `isRough` (wrap those two pushes in `if (isRough) { ... }`). Keep `disabled: isFirst/isLast` logic.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run components/trip/stop-card.test.tsx && npx tsc --noEmit`
Expected: PASS / 0. (Note: `itinerary-manager.tsx` still passes `onMoveUp/onMoveDown` — that's fine; they now only drive the rough overflow items.)

- [ ] **Step 5: Commit**

```bash
git add components/trip/stop-card.tsx components/trip/stop-card.test.tsx
git commit -m "feat(drag): StopCard drag-handle slot (rough only); retire desktop arrows"
```

---

### Task 6: dnd-kit wiring in `ItineraryManager`

**Files:**
- Modify: `components/trip/itinerary-manager.tsx`
- Test: `components/trip/itinerary-manager.test.tsx` (add a smoke test; full DnD interaction is hard to unit-test — assert handles render for rough stops/chapters and that an `onDragEnd` handler reorders local state)

This is the integration task. Build it carefully against the existing grouped render.

- [ ] **Step 1: Wrap the grouped list in a `DndContext`**

Import from dnd-kit:
```ts
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderStops } from "@/server/actions/stops";
import { reorderChapters } from "@/server/actions/chapters";
```
Set up sensors: `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))`.

- [ ] **Step 2: Make rough stops sortable**

Create a `SortableStop` wrapper component in this file that calls `useSortable({ id: stop.id })`, applies `transform`/`transition` via `CSS.Transform.toString(transform)`, and passes a **drag handle** (a small `<button>` with the grip icon `GripVertical` from lucide-react, spreading `listeners`/`attributes`, `aria-label={`Reorder ${stop.name}`}`) into `StopCard`'s new `dragHandle` prop. Only render `SortableStop` for **rough** stops; dated stops render via plain `renderStop` (no handle).

Within each group body, wrap the rough stops in a `SortableContext items={roughStopIds} strategy={verticalListSortingStrategy}`. Each group is its own container; the `DndContext` spans all groups so a rough stop can be dragged across containers.

- [ ] **Step 3: Make rough chapter headers sortable**

Wrap the sequence of **rough** chapter group headers in a `SortableContext` (items = rough chapter ids). Add a grip handle to the rough chapter header (`group.chapter && !group.chapter.startDate`). Dated chapter headers are not sortable.

- [ ] **Step 4: `onDragEnd` handlers**

Track which kind is being dragged (stop vs chapter) by id namespace or an `active.data`. On stop drop:
- Compute the rough stop's new container (target chapterId — the group it was dropped into; `null` for ungrouped) and new index among that group's items.
- Build the new full ordered `items: {id, chapterId}[]` for ALL stops reflecting the move (dated stops keep their relative order + their own `chapterId`/null), and optimistically reorder local React state (`useState` mirror of `initialStops` so the UI updates instantly), then call `reorderStops(tripId, items)`. On `{success:false}` show `toast({variant:"destructive", title: result.error})` and revert local state.

On chapter drop:
- Reorder the rough chapter ids, optimistically update local chapter order, call `reorderChapters(tripId, orderedRoughChapterIds)`; revert + toast on failure.

Because the page revalidates after the action, the server state re-flows in; the optimistic state just smooths the interaction. Keep `initialStops`/`chapters` as the source and a local `useState` copy that resets when props change (`useEffect` syncing on prop identity, or `key` remount).

- [ ] **Step 5: Smoke test**

In `components/trip/itinerary-manager.test.tsx` add: rendering a trip with ≥1 rough stop shows a reorder handle (`aria-label` `/reorder/i`); a trip with only dated stops shows none. (Don't simulate a full drag — dnd-kit pointer simulation is brittle in jsdom; assert the wiring renders.)

- [ ] **Step 6: Verify**

Run: `npx vitest run components/trip/itinerary-manager.test.tsx && npx tsc --noEmit && npx eslint components/trip/itinerary-manager.tsx && npx vitest run`
Expected: all pass / clean.

- [ ] **Step 7: Commit**

```bash
git add components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "feat(drag): dnd-kit reordering for rough stops + rough chapters"
```

---

### Task 7: ADR + final green + review

**Files:**
- Create: `docs/adr/0014-drag-reorder-rough-only.md`

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0014-drag-reorder-rough-only.md` (match the format of `docs/adr/0013-hard-end-date-and-projected-end.md`). Capture: **Decision** — drag reorders only *rough* stops/chapters; dated stops/chapters stay date-ordered (dates are the source of truth); a rough stop can't be dropped into a dated chapter. **Context** — the plan mixes rough (explicit order) + scheduled (date order); free-dragging dated items would fight dates or silently rewrite them. **Alternatives** — R2 (reflow dates on drop) and R3 (sortOrder for all, like the old arrows), both rejected as surprising/incoherent. **Consequences** — dated reordering happens via date edits; rough chapters gain an explicit `sortOrder`; new `reorderStops`/`reorderChapters` actions.

- [ ] **Step 2: Full green**

Run: `npx vitest run && npx tsc --noEmit && npx eslint`
Expected: all pass / 0 errors.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0014-drag-reorder-rough-only.md
git commit -m "docs(drag): ADR 0014 — drag reorders rough items only"
```

---

## Self-Review

**Spec coverage:** rough stop reorder ✓ (T1+T6) · rough stop between rough chapters/ungrouped ✓ (T1 chapterId + T6 cross-container) · never into a dated chapter ✓ (T1 guard) · reorder rough chapters ✓ (T2+T6) · dated stays date-ordered ✓ (T2 sort, T3 sortGroupStops) · dnd-kit + keyboard + touch ✓ (T4+T6 sensors) · grip handle rough-only ✓ (T5+T6) · retire desktop arrows, keep mobile overflow (rough) ✓ (T5) · ADR ✓ (T7).

**Type consistency:** `reorderStops(tripId, {id,chapterId}[])`, `reorderChapters(tripId, string[])`, `sortGroupStops(stops)`, `ChapterLike.sortOrder?`, `StopCardProps.dragHandle?`. Chapter data flowing into the itinerary must now include `sortOrder` — **NOTE for T6/T3:** the plan page (`app/(app)/trips/[tripId]/plan/page.tsx`) chapter select and `ItineraryChapter` type must add `sortOrder`; add that in T3 when wiring `sortGroupStops`/sorted chapters (the chapter `select` currently omits it). Verify `sortedByStart` consumers pass `sortOrder`.

**Placeholder scan:** none — pure logic + actions have complete code; T6 (dnd-kit UI) is a precise integration spec against the existing render.
