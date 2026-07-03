# Plan-editor feedback round — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship eleven pieces of user feedback on the plan editor, budget, forks, and photo upload — the headline change being that reordering dated stops/chapters now reflows their dates instead of being blocked.

**Architecture:** Reuse the existing Firm-up date-flow engine (`lib/firm-up.ts` `flowDates`) as the single source of date movement; extend the two `FOR UPDATE`-locked reorder actions to reflow scheduled entities; add a stop-scoped, optionally-dateless Item form to the plan editor; keep chapters as computed date-bands that self-heal to their stops.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Prisma 7 (+ pg adapter), Vitest + Testing Library, Tailwind v4, `@dnd-kit`.

## Global Constraints

- **Node** ≥ 20.19. **Terminology** follows `CONTEXT.md` exactly; the planned "thing to do" is an **Item** — never call it "Activity" (reserved for the change-log feed).
- **ADR 0021** governs WS-A (drag reflows dates; self-healing bands). **ADR 0022** governs WS-C (dateless stop things-to-do; the plan-vs-wishlist discriminator).
- **No per-drag confirm modal** — a drag applies immediately and offers **Undo**.
- Keep the **computed date-band** chapter model (self-healing, not stored membership).
- **Pinned Stops never move**; a move that can't fit before a pin raises a Flag, not an overwrite.
- Tests **mock `@/lib/db`** (see any `server/actions/*.test.ts`); there is **no real DB** in the suite. jsdom + Testing Library for components.
- Per-task commands: `npx vitest run <path>` (single file), `npm test` (full), `npm run lint`, `npm run build`.
- **Git:** work only on branch `feat/plan-editor-feedback`; commit per task. Never touch `main`, never push, never deploy.
- Verify commands per task; the drag reflow and photo upload additionally get a manual app verify when a DB is available.

---

### Task 1: Raise Server Action body limit + friendly upload error (WS-G / #6)

**Files:**
- Modify: `next.config.ts`
- Modify: `components/trip/settings/cover-image-field.tsx`
- Test: `components/trip/settings/cover-image-field.test.tsx` (create)

**Interfaces:**
- Produces: no new exports — behavioural fix. Cover/journal/attachment uploads accept files up to ~10 MiB.

- [ ] **Step 1: Write the failing test** — a rejected `setTripCover` (thrown) surfaces a destructive toast rather than crashing.

```tsx
// cover-image-field.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
const setTripCoverMock = vi.fn();
const toastMock = vi.fn();
vi.mock("@/server/actions/cover", () => ({ setTripCover: setTripCoverMock, removeTripCover: vi.fn() }));
vi.mock("@/components/ui/use-toast", () => ({ toast: toastMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { CoverImageField } from "./cover-image-field";

it("shows a friendly error when the upload throws (e.g. body too large)", async () => {
  setTripCoverMock.mockRejectedValueOnce(new Error("Body exceeded 1 MB limit"));
  render(<CoverImageField tripId="t1" hasCover={false} />);
  const file = new File(["x".repeat(10)], "big.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByLabelText(/cover/i, { selector: "input[type=file]" }) ?? screen.getByRole("textbox"), { target: { files: [file] } });
  await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run components/trip/settings/cover-image-field.test.tsx` → FAIL (unhandled rejection; no toast).

- [ ] **Step 3: Implement.** In `cover-image-field.tsx` wrap the action call in try/catch inside the transition:

```tsx
startTransition(async () => {
  try {
    const r = await setTripCover(fd);
    if (!r.success) toast({ variant: "destructive", title: r.error });
    else router.refresh();
  } catch {
    toast({ variant: "destructive", title: "Upload failed — the image may be too large (max 10 MB)." });
  }
});
```

In `next.config.ts` add the body-size limit to `nextConfig`:

```ts
const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() { return [{ source: "/:path*", headers: securityHeaders }]; },
};
```

- [ ] **Step 4: Run tests + lint.** `npx vitest run components/trip/settings/cover-image-field.test.tsx` → PASS. `npm run lint`.
- [ ] **Step 5: Commit** — `fix(upload): raise server-action body limit to 12mb and surface friendly upload errors (#6)`.

---

### Task 2: Budget "Add a cost" moves to the top (WS-H / #11)

**Files:**
- Modify: `components/trip/other-cost-editor.tsx` (button currently at lines ~414-425, after the list)
- Test: `components/trip/other-cost-editor.test.tsx` (create or extend)

**Interfaces:** none new — DOM order change only.

- [ ] **Step 1: Failing test** — the "Add cost" button appears before the cost list in document order.

```tsx
it("renders the Add cost button above the cost list", () => {
  render(<OtherCostEditor tripId="t1" costs={[{ id: "c1", label: "Visa", /* …minimal cost shape… */ }]} homeCurrency="AUD" /* props per current component */ />);
  const btn = screen.getByRole("button", { name: /add cost/i });
  const list = screen.getByTestId?.("other-cost-list") ?? screen.getByRole("list");
  expect(btn.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run components/trip/other-cost-editor.test.tsx`.
- [ ] **Step 3: Implement.** Read the component; move the `<Button>Add cost</Button>` (and its dialog trigger) to render **before** the `{costs.length === 0 ? … : <AnimatedList>…}`. Add `data-testid="other-cost-list"` to the list wrapper. Keep the empty-state text below the button.
- [ ] **Step 4: Run tests + lint** → PASS.
- [ ] **Step 5: Commit** — `fix(budget): pin "Add a cost" above the cost list (#11)`.

---

### Task 3: Thread active forkId through quick-add (WS-E / #2)

**Files:**
- Modify: `components/trip/quick-add-stops.tsx` (add `forkId` prop → pass to `createStop`)
- Modify: `components/discreet/quick-add-stops.tsx` (same)
- Modify: `components/trip/itinerary-manager.tsx` (pass `forkId={forkId}` to all `QuickAddStops` — ~lines 1052, 1136, 1177, 1212, 1295, 1384)
- Test: `components/trip/quick-add-stops.test.tsx` (create)

**Interfaces:**
- `QuickAddStops` props gain `forkId?: string | null`.
- Consumes: `createStop(tripId, input, forkId?)` (existing, `server/actions/stops.ts:82`).

- [ ] **Step 1: Failing test** — submitting the quick-add form calls `createStop` with the forkId.

```tsx
const createStopMock = vi.fn().mockResolvedValue({ id: "s1" });
vi.mock("@/server/actions/stops", () => ({ createStop: createStopMock }));
import { QuickAddStops } from "./quick-add-stops";

it("passes the active forkId to createStop", async () => {
  render(<QuickAddStops tripId="t1" chapterId={null} forkId="fork-1" />);
  fireEvent.change(screen.getByLabelText(/add a place/i), { target: { value: "Rome" } });
  fireEvent.submit(screen.getByLabelText(/add a place/i).closest("form")!);
  await waitFor(() => expect(createStopMock).toHaveBeenCalledWith("t1", expect.objectContaining({ name: "Rome" }), "fork-1"));
});
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** Add `forkId?: string | null` to `QuickAddStopsProps`; change the call to `createStop(tripId, { …input }, forkId ?? undefined)`. Mirror in the discreet twin. In `itinerary-manager.tsx` pass `forkId={forkId}` to every `<QuickAddStops …>`.
- [ ] **Step 4: Run tests + lint** → PASS.
- [ ] **Step 5: Commit** — `fix(fork): quick-add creates stops in the active variant, not the real plan (#2)`.

---

### Task 4: Insert a new stop at the clicked position (WS-F / #5)

**Files:**
- Modify: `lib/reorder.ts` (add pure `insertionOrder` helper) + `lib/reorder.test.ts`
- Modify: `server/actions/stops.ts` `createStop` (accept an optional `afterStopId`)
- Modify: `components/trip/quick-add-stops.tsx` (+ discreet twin) — accept `afterStopId?: string | null`, pass through
- Modify: `components/trip/itinerary-manager.tsx` — pass the anchor stop id to each section's `QuickAddStops`
- Test: `lib/reorder.test.ts`, `server/actions/stops.test.ts` (extend if present, else create)

**Interfaces:**
- Produces: `insertionOrder(stops: {id:string; sortOrder:number}[], afterStopId: string|null): { sortOrder: number; renumber: {id:string; sortOrder:number}[] }` — the new stop's sortOrder + any siblings needing a bump.
- `createStop(tripId, input, forkId?, afterStopId?)` — appends when `afterStopId` is null/absent (unchanged default).

- [ ] **Step 1: Failing test (pure helper).**

```ts
// lib/reorder.test.ts
it("inserts after the anchor and bumps later siblings", () => {
  const stops = [{ id: "a", sortOrder: 0 }, { id: "b", sortOrder: 1 }, { id: "c", sortOrder: 2 }];
  const r = insertionOrder(stops, "a");
  expect(r.sortOrder).toBe(1);
  expect(r.renumber).toEqual([{ id: "b", sortOrder: 2 }, { id: "c", sortOrder: 3 }]);
});
it("appends when anchor is null", () => {
  const stops = [{ id: "a", sortOrder: 0 }];
  expect(insertionOrder(stops, null)).toEqual({ sortOrder: 1, renumber: [] });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run lib/reorder.test.ts`.
- [ ] **Step 3: Implement `insertionOrder`** in `lib/reorder.ts`:

```ts
export function insertionOrder(
  stops: { id: string; sortOrder: number }[],
  afterStopId: string | null,
): { sortOrder: number; renumber: { id: string; sortOrder: number }[] } {
  if (!afterStopId) {
    const max = stops.reduce((m, s) => Math.max(m, s.sortOrder), -1);
    return { sortOrder: max + 1, renumber: [] };
  }
  const anchor = stops.find((s) => s.id === afterStopId);
  if (!anchor) { const max = stops.reduce((m, s) => Math.max(m, s.sortOrder), -1); return { sortOrder: max + 1, renumber: [] }; }
  const newOrder = anchor.sortOrder + 1;
  const renumber = stops.filter((s) => s.sortOrder >= newOrder).map((s) => ({ id: s.id, sortOrder: s.sortOrder + 1 }));
  return { sortOrder: newOrder, renumber };
}
```

- [ ] **Step 4: Wire into `createStop`.** Add `afterStopId?: string | null` param; inside the existing tx/lock, load sibling stops (`tripId, planScope(forkId)`), compute `insertionOrder`, apply `renumber` bumps then create the new stop at `sortOrder`. When the anchor has a `chapterId`, inherit it and set `chapterSortOrder` just after the anchor's. Add an action test with mocked db asserting the created stop's `sortOrder` and that later siblings were bumped.
- [ ] **Step 5: Wire UI.** `QuickAddStops` accepts `afterStopId`; each section passes the id of the stop the add-row sits under (or `null` for the top row). Update the component test to assert `createStop(..., forkId, afterStopId)`.
- [ ] **Step 6: Run tests + lint** → PASS. **Commit** — `feat(plan): insert new stops at the add-row position, not the bottom (#5)`.

---

### Task 5: Delete control on empty chapters (WS-E / #1)

**Files:**
- Modify: `components/trip/itinerary-manager.tsx` (empty-chapters section ~1232-1301 and chapter headers)
- Test: `components/trip/itinerary-manager.*.test.tsx` (create a focused test)

**Interfaces:** Consumes existing `deleteChapter(chapterId)` (`server/actions/chapters.ts:151`).

- [ ] **Step 1: Failing test** — an empty chapter renders a "Remove chapter" control that calls `deleteChapter`.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** Add a small "Remove" (trash) button to the empty-chapter card header (and to populated chapter headers via the overflow), wired through a `handleDeleteChapter` that confirms then calls `deleteChapter`. Reuse the existing `confirm()` dialog pattern already in the component.
- [ ] **Step 4: Run tests + lint** → PASS. **Commit** — `feat(plan): let empty chapters be removed so a variant can be cleared (#1)`.

---

### Task 6: Inline cost on the Transport form (WS-D / #9)

**Files:**
- Modify: `lib/validations/transport.ts` (add optional cost fields)
- Modify: `components/trip/transport-form-dialog.tsx` (add cost inputs)
- Modify: `server/actions/transport.ts` (`createTransport`/`updateTransport` upsert the Transport's Cost)
- Test: `server/actions/transport.test.ts` (extend), `components/trip/transport-form-dialog.test.tsx` (extend)

**Interfaces:**
- Transport input gains `estimatedMinor?: number; currency?: string; actualMinor?: number|null; paidAt?: string|null`.
- Produces a `Cost` row with `ownerType: "TRANSPORT", ownerId: <transportId>` via the existing cost creation path (mirror `server/actions/costs.ts createCost`, incl. `rateToHome` snapshot).

- [ ] **Step 1: Failing test (action).** `createTransport` with `estimatedMinor: 12000, currency: "EUR"` creates a Cost with `ownerType:"TRANSPORT"` and the new transport's id.
- [ ] **Step 2: Run, verify FAIL** — `npx vitest run server/actions/transport.test.ts`.
- [ ] **Step 3: Implement.** Extend the zod schema; in the action, after creating/updating the Transport, if a cost amount is present upsert a Cost (snapshot `rateToHome` like `createCost`). Keep it inside the existing transaction/lock.
- [ ] **Step 4: Form.** Add "Estimated cost" + currency (and optional actual + paid date) to `transport-form-dialog.tsx`; submit them with the payload. Extend the form test.
- [ ] **Step 5: Run tests + lint** → PASS. **Commit** — `feat(transport): capture cost in the add/edit form; flows to budget (#9)`.

---

### Task 7: Inline cost on the Accommodation form (WS-D / #9)

**Files:** mirror Task 6 for `lib/validations/accommodation.ts`, `components/trip/accommodation-form-dialog.tsx`, `server/actions/accommodation.ts` (`ownerType: "ACCOMMODATION"`). Tests in the matching `*.test.ts(x)`.

- [ ] **Steps 1-5:** identical shape to Task 6 (failing action test → schema → action upsert Cost → form fields → green). **Commit** — `feat(accommodation): capture cost in the add/edit form; flows to budget (#9)`.

---

### Task 8: Pure reflow-on-reorder helper (WS-A / ADR 0021)

**Files:**
- Modify: `lib/reorder.ts` (add `reflowReorderedDates`) + `lib/reorder.test.ts`

**Interfaces:**
- Consumes: `flowDates` (`lib/firm-up.ts:37`), `moveStopInOrder`/`moveChapterBlocks` (`lib/reorder.ts`).
- Produces: `reflowReorderedDates(orderedStops: StopSlim[], anchorDate: string|null): { id: string; arriveDate: string; departDate: string }[]` — for the given final order, the dates each **scheduled** stop should take, flowing from the anchor, preserving nights, treating pinned stops as immovable boundaries (delegates to `flowDates`). Rough stops are returned unchanged (no dates).

- [ ] **Step 1: Failing tests** — reflow after a reorder: (a) preserves each stop's nights; (b) leaves a pinned stop's dates fixed and flows others around it; (c) rough stops keep null dates.

```ts
it("reflows dates in the new order, preserving nights, honouring pins", () => {
  const ordered = [
    { id: "b", nights: 2, arriveDate: null, departDate: null, pinned: false },
    { id: "a", nights: 3, arriveDate: "2026-07-01", departDate: "2026-07-04", pinned: true },
  ] as StopSlim[];
  const out = reflowReorderedDates(ordered, "2026-06-28");
  expect(out.find((s) => s.id === "a")).toMatchObject({ arriveDate: "2026-07-01" }); // pin fixed
  // b flows into the free span before the pin from the anchor
});
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** by mapping the ordered stops into `flowDates` inputs and returning the scheduled results. Reuse `flowDates`' pin handling; do not reimplement date math.
- [ ] **Step 4: Run tests + lint** → PASS. **Commit** — `feat(reorder): pure reflow-on-reorder date helper (ADR 0021)`.

---

### Task 9: Reorder actions reflow scheduled entities (WS-A / ADR 0021)

**Files:**
- Modify: `server/actions/stops.ts` `reorderStops` (~836) — drop the rough-only rejection; after computing the new order, reflow scheduled stops via `reflowReorderedDates` and persist arrive/depart under the existing `FOR UPDATE` lock. Return `{ success: true; changed: {id,arriveDate,departDate}[] }` for Undo.
- Modify: `server/actions/chapters.ts` `reorderChapters` (~160) — allow dated chapters; move the chapter's stop block (`moveChapterBlocks`) then reflow; persist.
- Test: `server/actions/stops.test.ts`, `server/actions/chapters.test.ts`

**Interfaces:**
- Produces: reorder actions now return the list of changed stop dates (Undo payload).
- Consumes: `reflowReorderedDates` (Task 8).

- [ ] **Step 1: Failing tests** — reorder of a dated stop returns `changed[]` with reflowed dates and persists them (mocked db asserts the `update` calls); a pinned stop is not in `changed`.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** the reflow + persistence + `changed` return in both actions. Recompute affected chapter spans (Task 11 helper — if implemented after, leave a typed call site `recomputeChapterSpans(tx, tripId, forkId)` and land Task 11 before merge; sequence Task 11 before this if preferred).
- [ ] **Step 4: Run tests + lint** → PASS. **Commit** — `feat(reorder): reflow dates when reordering scheduled stops/chapters (ADR 0021)`.

---

### Task 10: Draggable scheduled entities + Undo toast (WS-A / #4, #8)

**Files:**
- Modify: `components/trip/itinerary-manager.tsx` — drag handlers (`onDragOver`/`onDragEnd` ~702/745) branch instead of early-returning on `arriveDate !== null`: rough → reorder; scheduled → reorder + apply `changed` dates locally + toast; register dated stops/chapters as draggable & drop targets.
- Modify/Create: a bulk `setStopDates(changed: {id,arriveDate,departDate}[], forkId?)` action in `server/actions/stops.ts` for **Undo** (re-applies the pre-drag snapshot).
- Test: `server/actions/stops.test.ts` (setStopDates), interaction test where feasible.

**Interfaces:**
- Consumes: reorder actions' `changed` return (Task 9).
- Produces: `setStopDates(changed, forkId?)` used only by Undo.

- [ ] **Step 1: Failing test** — `setStopDates` writes each stop's arrive/depart (mocked db).
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** `setStopDates`; in the client, on a scheduled drag capture the pre-drag dates of the affected span, call the reorder action, then `toast` a summary ("Florence → 10–13 Jul; 2 later stops shifted") with an **Undo** button that calls `setStopDates` with the snapshot. Remove the `arriveDate !== null` early returns; keep the "can't drop into a dated chapter" guard removed (dated chapters now accept drops, membership recomputed by dates).
- [ ] **Step 4: Run tests + lint + build** → PASS. **Commit** — `feat(plan): drag to reorder dated stops/chapters with Undo (#4, ADR 0021)`.

---

### Task 11: Self-healing chapter bands + Clear-dates + chapter revert (WS-A / #3, #8)

**Files:**
- Modify: `server/actions/stops.ts` — add `recomputeChapterSpans(tx, tripId, forkId)` (sets each chapter's start/end to span its dated member stops; clears them to null when a chapter has no dated stops); call it from `updateStop` (scheduled path), `makeStopRough`, and the reorder actions. `makeStopRough` on a chapter's last dated stop → chapter reverts to rough.
- Modify: `components/trip/stop-card.tsx` — surface **"Clear dates"** as a primary action on scheduled stops (out of the overflow menu; keep overflow too).
- Test: `server/actions/stops.test.ts` (span recompute + revert), `components/trip/stop-card.test.tsx`.

**Interfaces:** Produces `recomputeChapterSpans` (internal helper, called within the same tx as the mutating action).

- [ ] **Step 1: Failing tests** — (a) dating a stop in a rough chapter sets that chapter's start/end to span it; (b) making the last dated stop of a chapter rough clears the chapter's dates (chapter rough again).
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** the helper + call sites + the stop-card affordance.
- [ ] **Step 4: Run tests + lint** → PASS. **Commit** — `fix(chapters): self-heal date bands + discoverable Clear dates (#3, #8)`.

---

### Task 12: Prominent firm-up on the plan page (WS-B / #7)

**Files:** Modify `components/trip/itinerary-manager.tsx` (and/or the plan overview) — promote "Set dates / firm up" from faint ghost buttons to a clear primary control (per-leg on chapter headers + a whole-trip control), shown when rough stops exist. Test: presence/enabled test.

- [ ] **Steps 1-5:** failing test (control visible + calls `handleFirmUp`) → implement → green → **Commit** `feat(plan): prominent Set dates / firm-up control on the plan page (#7)`.

---

### Task 13: Plan-owned dateless stop Items + discriminator audit (WS-C / #10, ADR 0022)

**Files:**
- Modify: `server/actions/items.ts` `createItem` — allow `stopId` set with `date: null` as a **plan-owned** Item (carry `forkId`).
- Add: a shared predicate/where-fragment `planPlacementWhere` = `{ OR: [{ stopId: { not: null } }, { date: { not: null } }] }` (and a matching `isPlanPlacement(item)`), in `lib/plan-scope.ts` or `lib/itinerary.ts`.
- Modify: `server/actions/forks.ts` — replace `date: { not: null }` in `createFork` (item load, line ~98) and `promoteFork` (delete, line ~748) and the wishlist-idea gathering (line ~751) with the new discriminator; `getComparison` item filter (line ~472) likewise.
- Test: `lib/*.test.ts` for the predicate; `server/actions/forks.test.ts` for a copy/promote round-trip with a dateless stop-item.

**Interfaces:** Produces `planPlacementWhere` / `isPlanPlacement`. Wishlist idea = `stopId == null && date == null`.

- [ ] **Step 1: Failing tests** — (a) `isPlanPlacement({stopId:"s",date:null})` is true; `isPlanPlacement({stopId:null,date:null})` is false; (b) `createFork` copies a dateless stop-item into the fork; (c) `promoteFork` deletes the old real-plan dateless stop-item and retags the fork's.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** the predicate and swap every `date: { not: null }` plan-placement filter to it. Update `createItem` to accept the dateless-stop case with `forkId`.
- [ ] **Step 4: Run tests + lint** → PASS. **Commit** — `feat(items): plan-owned dateless stop items + plan/wishlist discriminator (ADR 0022)`.

---

### Task 14: Cost field on the Item form (WS-C / #10)

**Files:** Modify `components/trip/item-form-dialog.tsx` (add estimated cost + currency, optional actual/paid), `server/actions/items.ts` (`createItem`/`updateItem` upsert an `ownerType:"ITEM"` Cost, mirroring Task 6). Tests in the matching files.

- [ ] **Steps 1-5:** failing action test (item created with cost → Cost row) → schema/form/action → green → **Commit** `feat(items): capture cost on the item form; flows to budget (#9, #10)`.

---

### Task 15: "Add a thing to do" under each stop in the plan editor (WS-C / #10)

**Files:**
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` — load per-stop Items (`stopId` set, scoped by `planScope(activeForkId)`) and pass to the manager.
- Modify: `components/trip/itinerary-manager.tsx` / `components/trip/stop-card.tsx` — render a stop's things-to-do list + an **"Add a thing to do"** button opening `ItemFormDialog` bound to that `stopId` with date optional and the active `forkId`.
- Test: `components/trip/stop-card.test.tsx` (list + button + label is "thing to do", never "Activity").

**Interfaces:** Consumes `createItem(tripId, {stopId, date:null, …}, forkId)` (Task 13) and the item cost form (Task 14).

- [ ] **Step 1: Failing test** — a stop card shows its things-to-do and an "Add a thing to do" button; the string "Activity" is not used as the button label.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** the loader query, the per-stop list, and the add button/dialog wiring (date optional).
- [ ] **Step 4: Run tests + lint + build** → PASS. **Commit** — `feat(plan): add-a-thing-to-do under each location (#10, ADR 0022)`.

---

### Task 16: Full-suite regression + verify sweep

**Files:** none (verification only).

- [ ] **Step 1:** `npm test` → all green (fix any regressions surfaced, especially fork/budget/itinerary suites).
- [ ] **Step 2:** `npm run lint` and `npm run build` → clean.
- [ ] **Step 3:** Note for manual verify (needs a DB): drag a dated stop (reflow + Undo), reorder a chapter, add a thing-to-do to a rough stop then date it, upload a >1 MB cover image, add a variant and confirm quick-add lands in it.
- [ ] **Step 4: Commit** any fixes — `test: full-suite regression pass for plan-editor feedback round`.

---

## Self-Review

- **Spec coverage:** WS-A → Tasks 8-11; WS-B → 12; WS-C → 13-15; WS-D → 6-7; WS-E → 3 (#2) + 5 (#1); WS-F → 4; WS-G → 1; WS-H → 2. All eleven feedback items mapped.
- **Sequencing note:** Task 11's `recomputeChapterSpans` is called by Task 9/10 — implement Task 11 before or together with 9 (the plan lists 8→9→10→11 for narrative; execute 11's helper no later than 9). Flagged in Task 9 Step 3.
- **Type consistency:** `insertionOrder`, `reflowReorderedDates`, `recomputeChapterSpans`, `planPlacementWhere`/`isPlanPlacement`, `setStopDates` are each defined once and consumed by name in later tasks.
- **Placeholders:** none — each task carries concrete files, signatures, test assertions, and commands. Large existing components (itinerary-manager, forms) instruct reading current code before editing, with the exact change and test specified.
