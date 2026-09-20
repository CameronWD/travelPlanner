# Changeover Day & Digest Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a changeover day read as one day in the plan editor, and make the Digest arrive at the right hour with the right lines on top.

**Architecture:** Five independent phases on one branch. Phase A changes how the plan editor groups scheduled Items (by date coverage, not by `stopId`) and introduces one pure rule for which Stop owns an Item after a move. Phase B adds the first `POST /api/push` route so the service worker can heal a rotated subscription. Phase C collapses each Traveller to a single timezone and re-orders the Digest's lines. Phase D adds a cron heartbeat. Phase E is a batch of independent small fixes.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), React 19, Prisma 7 with `@prisma/adapter-pg`, Postgres, Vitest, Tailwind, `web-push`.

## Global Constraints

- **Never commit to `main`.** All work lands on `feat/changeover-day-and-digest-fixes`. Never deploy.
- **Read `CONTEXT.md` before touching anything.** It is the vocabulary contract. Never introduce a term its *Avoid* lists forbid. In particular: an Item is never an "activity"; a Digest is never a "notification"; a Device is never a "subscription" in user-facing copy.
- **The decisions in this plan are recorded in ADR 0049 and ADR 0050.** Both are committed. Read the relevant one before starting a phase.
- **Every fix lands with a test that fails before and passes after.**
- **The suite mocks `@/lib/db`.** There is no database in this sandbox and no Docker. Never write a test that needs a real connection. Never run `prisma migrate dev` — migrations are hand-written SQL (see Task 15).
- **Timezone-sensitive tests must pin `TZ`.** The bug class here is exactly "passes in the dev machine's timezone".
- **Baseline to keep green, run before reporting any task done:** `npm test`, `npx tsc --noEmit`, `npm run lint`. Use `npm test`, **not** bare `npx vitest run` — `package.json:13` defines it as `TZ=UTC vitest run`, and the bare form drops that pin. This container happens to be UTC so the two agree here, but on any other machine they would not, and the pin is what makes timezone assertions mean anything. (Corrected mid-execution after Task 9's review; Tasks 1-9 were run with the bare form on a UTC host, so their results stand.)
- **Do not add dependencies.** ADR 0050 explicitly rejects adding a timezone-boundary package.
- **Commit after every task** using Conventional Commits.

---

## File Structure

**Phase A — changeover day**
- `lib/stop-days.ts` — *modify*. Already owns pure per-Stop day bucketing. Gains `groupScheduledItemsByStop`, which is where "show the union" is decided, and it stays pure so it is unit-testable without rendering a page.
- `lib/itinerary.ts` — *modify*. Gains `resolveOwningStop`, the single home of ADR 0049 rule 4. `stopForDate` stays exactly as it is.
- `app/(app)/trips/[tripId]/plan/page.tsx` — *modify*. Stops grouping by `stopId`; calls the new helper.
- `components/trip/stop-day-list.tsx` — *modify*. Renders the owner marker; `handleMove` loses its workaround.
- `server/actions/items.ts` — *modify*. `scheduleItem` and `rescheduleItem` both adopt `resolveOwningStop`; the copy-in branch resolves a covering Stop.

**Phase B — push rotation**
- `app/api/push/route.ts` — *create*. The first non-cron API route that mutates; session-guarded.
- `server/actions/push.ts` — *modify*. Gains `healRotatedSubscription`, called by the route so the rule is testable without HTTP.
- `public/sw.js` — *modify*. `pushsubscriptionchange` handler.

**Phase C — digest**
- `app/api/cron/digest/route.ts` — *modify*. One zone per person.
- `lib/digest-dispatch.ts` — *modify*. `dispatchDigest` and `collectDigestInput` take a zone; `resolveTripZone` prefers it; MORNING skips discarded queries.
- `lib/digest.ts` — *modify*. `collectLines` re-ordered; checklist capped.

**Phase D — cron heartbeat**
- `prisma/schema.prisma` + `prisma/migrations/20260920000000_cron_heartbeat/migration.sql` — *create*.
- `lib/cron-health.ts` — *create*. Pure staleness arithmetic, mirroring `lib/devices.ts`.
- `server/actions/cron-health.ts` — *create*.
- `components/account/dispatcher-health.tsx` — *create*.
- `app/(app)/account/page.tsx` — *modify*.

**Phase E — smaller items**
- `test/helpers/access-order.ts` — *create*. The shared assertion for 28 test files.
- Plus the individual files named in each task.

---

## Phase A — The changeover day

### Task 1: Group the plan editor's Items by date coverage, not by Stop

ADR 0049 rule 1. Today `plan/page.tsx` groups by `stopId`, so each Stop card sees only the Items filed to it. Grouping by the Stop's date range instead makes the union fall out naturally, and incidentally surfaces Items with a null `stopId` (the Task 4 bug) on whatever day they actually sit.

**Files:**
- Modify: `lib/stop-days.ts`
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx:327-334`
- Test: `lib/stop-days.test.ts`

**Interfaces:**
- Consumes: `StopDayItem` (already exported from `lib/stop-days.ts`).
- Produces: `groupScheduledItemsByStop(stops: GroupableStop[], items: StopDayItem[]): Map<string, StopDayItem[]>` where `GroupableStop = { id: string; arriveDate: string | null; departDate: string | null }`. Task 2 relies on the returned Items carrying their original `stopId` untouched.

- [ ] **Step 1: Write the failing test**

Add to `lib/stop-days.test.ts`:

```ts
import { groupScheduledItemsByStop } from "./stop-days";

describe("groupScheduledItemsByStop", () => {
  const munich = { id: "munich", arriveDate: "2026-12-05", departDate: "2026-12-10" };
  const strasbourg = { id: "strasbourg", arriveDate: "2026-12-10", departDate: "2026-12-12" };

  it("puts a changeover-day item under BOTH stops regardless of which owns it", () => {
    const dinner = { id: "i1", title: "Dinner", category: "FOOD", date: "2026-12-10", stopId: "munich" };
    const grouped = groupScheduledItemsByStop([munich, strasbourg], [dinner]);
    expect(grouped.get("munich")).toEqual([dinner]);
    expect(grouped.get("strasbourg")).toEqual([dinner]);
  });

  it("leaves the item's own stopId untouched — grouping is display, not ownership", () => {
    const dinner = { id: "i1", title: "Dinner", category: "FOOD", date: "2026-12-10", stopId: "munich" };
    const grouped = groupScheduledItemsByStop([munich, strasbourg], [dinner]);
    expect(grouped.get("strasbourg")![0].stopId).toBe("munich");
  });

  it("shows a dated item with NO stop under whichever stop covers its date", () => {
    const placed = { id: "i2", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-07", stopId: null };
    const grouped = groupScheduledItemsByStop([munich, strasbourg], [placed]);
    expect(grouped.get("munich")).toEqual([placed]);
    expect(grouped.get("strasbourg")).toEqual([]);
  });

  it("ignores rough stops, which have no dates to cover a day with", () => {
    const rough = { id: "rough", arriveDate: null, departDate: null };
    const item = { id: "i3", title: "X", category: "OTHER", date: "2026-12-07", stopId: "rough" };
    const grouped = groupScheduledItemsByStop([rough], [item]);
    expect(grouped.get("rough")).toBeUndefined();
  });

  it("ignores undated items — they are things-to-do, not day rows", () => {
    const todo = { id: "i4", title: "Y", category: "OTHER", date: null, stopId: "munich" };
    const grouped = groupScheduledItemsByStop([munich], [todo]);
    expect(grouped.get("munich")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/stop-days.test.ts`
Expected: FAIL with `groupScheduledItemsByStop is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/stop-days.ts`:

```ts
export interface GroupableStop {
  id: string;
  arriveDate: string | null;
  departDate: string | null;
}

/**
 * Which Items each Stop card shows, keyed by stop id.
 *
 * Grouped by DATE COVERAGE, not by `stopId`. On a **Changeover day** — one
 * calendar day two consecutive Stops both claim — that puts the same Item
 * under both cards, which is the point (ADR 0049 rule 1). Ownership is
 * untouched: the Items come back carrying whatever `stopId` they had, and
 * `lib/budget.ts` still counts their Cost against exactly one Stop.
 *
 * Rough Stops are skipped: with no dates they cover no days.
 */
export function groupScheduledItemsByStop(
  stops: GroupableStop[],
  items: StopDayItem[],
): Map<string, StopDayItem[]> {
  const grouped = new Map<string, StopDayItem[]>();
  for (const stop of stops) {
    if (!stop.arriveDate || !stop.departDate) continue;
    grouped.set(
      stop.id,
      items.filter(
        (i) => !!i.date && i.date >= stop.arriveDate! && i.date <= stop.departDate!,
      ),
    );
  }
  return grouped;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/stop-days.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the page**

In `app/(app)/trips/[tripId]/plan/page.tsx`, replace the block at lines 327-334:

```ts
  // Group scheduled items by stopId for the day rows
  const dayItemsByStopId = new Map<string, typeof scheduledItems>();
  for (const item of scheduledItems) {
    if (!item.stopId) continue;
    const existing = dayItemsByStopId.get(item.stopId) ?? [];
    existing.push(item);
    dayItemsByStopId.set(item.stopId, existing);
  }
```

with:

```ts
  // Day rows are grouped by DATE COVERAGE, not by stopId, so a Changeover day
  // shows the same Items under both Stops that claim it (ADR 0049).
  const dayItemsByStopId = groupScheduledItemsByStop(stops, scheduledItems);
```

Add `groupScheduledItemsByStop` to the existing import from `@/lib/stop-days`, or add the import if there isn't one.

- [ ] **Step 6: Verify the baseline**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green. If `tsc` complains that `scheduledItems`' element type is not assignable to `StopDayItem`, widen nothing — check that the page's `select` includes `id, title, category, date, startTime, endTime, address, link, booking, notes, stopId`, and add any missing field to the select rather than loosening the type.

- [ ] **Step 7: Commit**

```bash
git add lib/stop-days.ts lib/stop-days.test.ts "app/(app)/trips/[tripId]/plan/page.tsx"
git commit -m "fix(plan): a changeover day shows the same items under both stops"
```

---

### Task 2: Mark which Stop owns an Item on a shared day

ADR 0049 rule 3. Without this the Budget's per-Stop roll-up is unexplainable from the plan editor.

**Files:**
- Modify: `components/trip/stop-day-list.tsx`
- Test: `components/trip/stop-day-list.test.tsx`

**Interfaces:**
- Consumes: `groupScheduledItemsByStop` output from Task 1 (Items carry a foreign `stopId`); `StopOption = { id: string; name: string }` from `components/trip/item-form-dialog.tsx`, already passed to this component as the `stops` prop.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the failing test**

Add to `components/trip/stop-day-list.test.tsx`, following the render helpers already in that file:

```ts
it("names the owning stop on an item this card does not own", async () => {
  render(
    <StopDayList
      tripId="trip-1"
      stop={{ id: "strasbourg", arriveDate: "2026-12-10", departDate: "2026-12-12" }}
      items={[
        { id: "i1", title: "Dinner", category: "FOOD", date: "2026-12-10", stopId: "munich" },
      ]}
      stops={[
        { id: "munich", name: "Munich" },
        { id: "strasbourg", name: "Strasbourg" },
      ]}
    />,
  );
  await userEvent.click(screen.getByRole("button", { expanded: false, name: /10/ }));
  expect(screen.getByTestId("day-detail-2026-12-10")).toHaveTextContent("Munich");
});

it("says nothing about ownership on an item this card owns", async () => {
  render(
    <StopDayList
      tripId="trip-1"
      stop={{ id: "strasbourg", arriveDate: "2026-12-10", departDate: "2026-12-12" }}
      items={[
        { id: "i1", title: "Dinner", category: "FOOD", date: "2026-12-10", stopId: "strasbourg" },
      ]}
      stops={[
        { id: "munich", name: "Munich" },
        { id: "strasbourg", name: "Strasbourg" },
      ]}
    />,
  );
  await userEvent.click(screen.getByRole("button", { expanded: false, name: /10/ }));
  expect(screen.getByTestId("day-detail-2026-12-10")).not.toHaveTextContent("Munich");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/trip/stop-day-list.test.tsx`
Expected: FAIL — the first test cannot find "Munich" in the day detail.

- [ ] **Step 3: Write minimal implementation**

In `components/trip/stop-day-list.tsx`, add an `ownerLabel` prop to `DayItemRow` and render it. Change the `DayItemRow` signature and body:

```tsx
function DayItemRow({
  item,
  timeLabel,
  ownerLabel,
  days,
  isPending,
  onEdit,
  onMove,
}: {
  item: StopDayItem;
  timeLabel: string | null;
  /** Set only when another Stop owns this Item — a Changeover day (ADR 0049). */
  ownerLabel: string | null;
  days: string[];
  isPending: boolean;
  onEdit: () => void;
  onMove: (dateISO: string) => void;
}) {
  return (
    <div className="group/dayitem flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
        {timeLabel ?? ""}
      </span>
      <span
        className={cn("size-2 shrink-0 rounded-full", categoryDotClass(item.category))}
        aria-hidden="true"
      />
      <span className="flex-1 truncate text-sm text-foreground">{item.title}</span>
      {ownerLabel && (
        <span className="shrink-0 text-xs italic text-muted-foreground/70">
          {ownerLabel}
        </span>
      )}
```

(leave the rest of the row — Edit button, `DayPickerMenu`, `UnscheduleItemButton` — exactly as it is).

In `StopDayList`, build the lookup once and pass it at both call sites:

```tsx
  // A Changeover day shows Items owned by the adjoining Stop too (ADR 0049).
  // Naming that Stop is what keeps the Budget's per-Stop roll-up explicable —
  // the money follows the owner, not the card you happen to be looking at.
  const stopNameById = React.useMemo(
    () => new Map(stops.map((s) => [s.id, s.name] as const)),
    [stops],
  );
  const ownerLabelFor = React.useCallback(
    (it: StopDayItem): string | null =>
      it.stopId && it.stopId !== stop.id ? (stopNameById.get(it.stopId) ?? null) : null,
    [stopNameById, stop.id],
  );
```

Then add `ownerLabel={ownerLabelFor(it)}` to both `<DayItemRow .../>` usages (the `day.timed` map and the `day.untimed` map).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/trip/stop-day-list.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify the baseline**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add components/trip/stop-day-list.tsx components/trip/stop-day-list.test.tsx
git commit -m "fix(plan): name the owning stop on a shared changeover day"
```

---

### Task 3: One rule for which Stop owns an Item after a move

ADR 0049 rule 4. This replaces the workaround comment at `stop-day-list.tsx:74-81` with a rule enforced on the server, so both the plan editor and the month-grid drag obey it.

**Files:**
- Modify: `lib/itinerary.ts`
- Modify: `server/actions/items.ts` (in-place branch ~`:543`, and `rescheduleItem` ~`:674`)
- Modify: `components/trip/stop-day-list.tsx` (delete the workaround)
- Test: `lib/itinerary.test.ts`, `server/actions/items.test.ts`

**Interfaces:**
- Consumes: `ItineraryStop` and `stopForDate` from `lib/itinerary.ts`.
- Produces: `resolveOwningStop(currentStopId: string | null, targetDateISO: string, stops: ItineraryStop[]): string | null`. Task 4 consumes it.

- [ ] **Step 1: Write the failing test**

Add to `lib/itinerary.test.ts`:

```ts
import { resolveOwningStop } from "./itinerary";

describe("resolveOwningStop", () => {
  const munich = { id: "munich", name: "Munich", timezone: "Europe/Berlin", arriveDate: "2026-12-05", departDate: "2026-12-10", sortOrder: 0 };
  const strasbourg = { id: "strasbourg", name: "Strasbourg", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-12", sortOrder: 1 };
  const stops = [munich, strasbourg];

  it("keeps the owner when it still covers the target day — even a shared one", () => {
    expect(resolveOwningStop("munich", "2026-12-10", stops)).toBe("munich");
  });

  it("keeps the owner for an ordinary in-stay move", () => {
    expect(resolveOwningStop("munich", "2026-12-07", stops)).toBe("munich");
  });

  it("re-files when the target day is past the owner's stay", () => {
    expect(resolveOwningStop("munich", "2026-12-11", stops)).toBe("strasbourg");
  });

  it("re-files rather than un-slotting when moving forward off a shared day", () => {
    expect(resolveOwningStop("munich", "2026-12-12", stops)).toBe("strasbourg");
  });

  it("takes the covering stop when there is no owner to preserve", () => {
    expect(resolveOwningStop(null, "2026-12-07", stops)).toBe("munich");
  });

  it("takes the LATER stop on a shared day when there is no owner", () => {
    expect(resolveOwningStop(null, "2026-12-10", stops)).toBe("strasbourg");
  });

  it("returns null on a gap day no stop covers", () => {
    expect(resolveOwningStop("munich", "2026-12-20", stops)).toBeNull();
  });

  it("drops an owner that no longer exists on this plan", () => {
    expect(resolveOwningStop("deleted-stop", "2026-12-07", stops)).toBe("munich");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/itinerary.test.ts`
Expected: FAIL with `resolveOwningStop is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/itinerary.ts`, directly beneath `stopForDate`:

```ts
/**
 * Which Stop owns an Item once it lands on `targetDateISO` (ADR 0049 rule 4).
 *
 * An Item keeps its owning Stop for as long as that Stop's stay covers the
 * date, and re-files only when moved beyond it. That matters on a
 * **Changeover day**, which two Stops both claim: `stopForDate` breaks the
 * tie in favour of the arriving Stop, so using it alone would silently move
 * an Item's Cost from one Stop's Budget line to the next every time something
 * was dragged onto a shared day.
 *
 * With no owner to preserve — a fresh placement, or an owner that is no
 * longer on this plan — it falls through to `stopForDate`, tie and all.
 * Returns null on a gap day no Stop covers.
 */
export function resolveOwningStop(
  currentStopId: string | null,
  targetDateISO: string,
  stops: ItineraryStop[],
): string | null {
  if (currentStopId) {
    const current = stops.find((s) => s.id === currentStopId);
    if (current && current.arriveDate <= targetDateISO && current.departDate >= targetDateISO) {
      return current.id;
    }
  }
  return stopForDate(stops, targetDateISO)?.id ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/itinerary.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing server-action test**

Add to `server/actions/items.test.ts`, matching the mock style already in that file (`vi.hoisted`, `itemFindUniqueMock`, `itemUpdateMock`, `stopFindManyMock`):

```ts
it("in-place reschedule onto a shared changeover day KEEPS the owning stop", async () => {
  itemFindUniqueMock
    .mockResolvedValueOnce({ id: "i1", tripId: "trip-1" })
    .mockResolvedValueOnce({ id: "i1", tripId: "trip-1", forkId: null, date: "2026-12-09", stopId: "munich", title: "Dinner" });
  stopFindManyMock.mockResolvedValue([
    { id: "munich", name: "Munich", timezone: "Europe/Berlin", arriveDate: "2026-12-05", departDate: "2026-12-10", sortOrder: 0 },
    { id: "strasbourg", name: "Strasbourg", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-12", sortOrder: 1 },
  ]);
  itemUpdateMock.mockResolvedValue({ id: "i1" });

  await scheduleItem("i1", { date: "2026-12-10" }, null);

  expect(itemUpdateMock).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ date: "2026-12-10", stopId: "munich" }) }),
  );
});

it("in-place reschedule past the owner's stay re-files to the covering stop", async () => {
  itemFindUniqueMock
    .mockResolvedValueOnce({ id: "i1", tripId: "trip-1" })
    .mockResolvedValueOnce({ id: "i1", tripId: "trip-1", forkId: null, date: "2026-12-10", stopId: "munich", title: "Dinner" });
  stopFindManyMock.mockResolvedValue([
    { id: "munich", name: "Munich", timezone: "Europe/Berlin", arriveDate: "2026-12-05", departDate: "2026-12-10", sortOrder: 0 },
    { id: "strasbourg", name: "Strasbourg", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-12", sortOrder: 1 },
  ]);
  itemUpdateMock.mockResolvedValue({ id: "i1" });

  await scheduleItem("i1", { date: "2026-12-11" }, null);

  expect(itemUpdateMock).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ stopId: "strasbourg" }) }),
  );
});
```

If `stopFindManyMock` does not already exist in that file, add `stop: { findMany: stopFindManyMock }` to the `vi.mock("@/lib/db", ...)` factory and declare it in the `vi.hoisted` block alongside the others.

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run server/actions/items.test.ts`
Expected: FAIL — `stopId` is absent from the update payload, because the in-place branch does not write it today.

- [ ] **Step 7: Implement in `scheduleItem`'s in-place branch**

In `server/actions/items.ts`, replace the in-place update (currently `:543-550`):

```ts
  const updated = await db.item.update({
    where: { id: itemId },
    data: {
      date,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
    },
```

with:

```ts
  // Ownership follows ADR 0049 rule 4: keep the owning Stop while it still
  // covers the date — including a Changeover day the next Stop also claims —
  // and re-file only when the move leaves that Stop's stay. Writing `stopId`
  // here is what lets the plan editor hand a move straight to this action
  // instead of hand-guarding against `stopForDate`'s later-Stop tiebreak.
  const planStops = await db.stop.findMany({
    where: { tripId: accessItem.tripId, ...planScope(fullItem.forkId), arriveDate: { not: null } },
    select: { id: true, name: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true },
  });
  const owningStopId = resolveOwningStop(
    fullItem.stopId ?? null,
    date,
    planStops.map((s) => ({
      id: s.id,
      name: s.name ?? "",
      timezone: s.timezone ?? "UTC",
      arriveDate: s.arriveDate!,
      departDate: s.departDate!,
      sortOrder: s.sortOrder,
    })),
  );

  const updated = await db.item.update({
    where: { id: itemId },
    data: {
      date,
      stopId: owningStopId,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
    },
```

Add `resolveOwningStop` to the existing `@/lib/itinerary` import in this file.

- [ ] **Step 8: Adopt the same rule in `rescheduleItem`**

In `rescheduleItem` (~`:660-677`), replace the `stopForDate` call and the update's `stopId`:

```ts
  const covering = stopForDate(
```

becomes

```ts
  const owningStopId = resolveOwningStop(
    before?.stopId ?? null,
    targetDateISO,
```

…and the mapped stops array stays as it is, followed by `);`. Move the `const before = await db.item.findUnique({ where: { id: itemId } });` line ABOVE this block so `before.stopId` is available, then change the update to `data: { date: targetDateISO, stopId: owningStopId }` and delete the now-unused `covering` variable. Leave `stopForDate`'s import — `resolveOwningStop` calls it internally, but this file may no longer reference it directly; remove the import only if `tsc`/lint says it is unused.

- [ ] **Step 9: Remove the plan editor's workaround**

In `components/trip/stop-day-list.tsx`, replace `handleMove` (`:74-92`) with:

```tsx
  async function handleMove(item: StopDayItem, targetDateISO: string) {
    // `scheduleItem` overwrites startTime/endTime wholesale, so the item's
    // existing times must be passed through explicitly to survive the move.
    // Which Stop ends up owning the item is the server's call (ADR 0049
    // rule 4) — this used to hand-guard against `stopForDate` re-filing an
    // item off the card on a changeover day, which is now a rule rather than
    // a workaround.
    const res = await scheduleItem(item.id, {
      date: targetDateISO,
      ...(item.startTime ? { startTime: item.startTime } : {}),
      ...(item.endTime ? { endTime: item.endTime } : {}),
    });
    if (!res.success) {
      toast({ title: "Couldn't move it", variant: "destructive" });
      return;
    }
    router.refresh();
  }
```

- [ ] **Step 10: Run tests**

Run: `npx vitest run server/actions/items.test.ts lib/itinerary.test.ts components/trip/stop-day-list.test.tsx`
Expected: PASS. Existing tests asserting the old in-place behaviour (that `stopId` is *not* written) will now fail — read each one, confirm it is asserting the superseded rule, and update it with a comment naming ADR 0049. Do not delete a test to make it pass.

- [ ] **Step 11: Verify the baseline**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 12: Commit**

```bash
git add lib/itinerary.ts lib/itinerary.test.ts server/actions/items.ts server/actions/items.test.ts components/trip/stop-day-list.tsx
git commit -m "fix(items): an item keeps its stop while that stop still covers the day"
```

---

### Task 4: A Wishlist placement takes the Stop that covers its day

ADR 0049 rule 5. Today every Item placed from the Wishlist — including everything via **Day ideas** (ADR 0044) — is created with `stopId: null`, so it is invisible in the plan editor on *every* day and its Cost rolls into Budget's "Trip-wide / Other". Production has 7 dated Items and 0 affected rows, so there is nothing to backfill.

**Files:**
- Modify: `server/actions/items.ts:506-525` (copy-in branch)
- Test: `server/actions/items.test.ts`

**Interfaces:**
- Consumes: `resolveOwningStop` from Task 3.

- [ ] **Step 1: Write the failing test**

Add to `server/actions/items.test.ts`:

```ts
it("a wishlist placement is filed under the stop covering its date (ADR 0049)", async () => {
  itemFindUniqueMock
    .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1" })
    .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1", forkId: null, date: null, stopId: null, title: "Louvre", category: "SIGHTSEEING" });
  stopFindManyMock.mockResolvedValue([
    { id: "munich", name: "Munich", timezone: "Europe/Berlin", arriveDate: "2026-12-05", departDate: "2026-12-10", sortOrder: 0 },
  ]);
  itemFindFirstMock.mockResolvedValue(null);
  itemCreateMock.mockResolvedValue({ id: "placed-1" });

  await scheduleItem("idea-1", { date: "2026-12-07" }, null);

  expect(itemCreateMock).toHaveBeenCalledWith({
    data: expect.objectContaining({ stopId: "munich", date: "2026-12-07" }),
  });
});

it("a wishlist placement on a gap day no stop covers stays stop-less", async () => {
  itemFindUniqueMock
    .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1" })
    .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1", forkId: null, date: null, stopId: null, title: "Louvre", category: "SIGHTSEEING" });
  stopFindManyMock.mockResolvedValue([
    { id: "munich", name: "Munich", timezone: "Europe/Berlin", arriveDate: "2026-12-05", departDate: "2026-12-10", sortOrder: 0 },
  ]);
  itemFindFirstMock.mockResolvedValue(null);
  itemCreateMock.mockResolvedValue({ id: "placed-2" });

  await scheduleItem("idea-1", { date: "2026-12-20" }, null);

  expect(itemCreateMock).toHaveBeenCalledWith({
    data: expect.objectContaining({ stopId: null }),
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/actions/items.test.ts -t "wishlist placement"`
Expected: FAIL — the first test gets `stopId: null`.

- [ ] **Step 3: Implement**

In the copy-in branch of `scheduleItem`, before the `db.item.create` call, resolve the Stop; then change the `stopId` line in the `create` payload.

```ts
    // A placed copy is dated, so it sits inside some Stop's stay and must be
    // filed there — otherwise it is invisible in the plan editor's day rows
    // and its Cost rolls up as "Trip-wide / Other" rather than against the
    // Stop it happens in (ADR 0049 rule 5). A Wishlist idea by definition
    // carries no Stop, so there is no prior owner to preserve and a
    // Changeover day simply yields the arriving Stop.
    const planStops = await db.stop.findMany({
      where: { tripId: accessItem.tripId, ...planScope(forkId), arriveDate: { not: null } },
      select: { id: true, name: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true },
    });
    const placedStopId = resolveOwningStop(
      null,
      date,
      planStops.map((s) => ({
        id: s.id,
        name: s.name ?? "",
        timezone: s.timezone ?? "UTC",
        arriveDate: s.arriveDate!,
        departDate: s.departDate!,
        sortOrder: s.sortOrder,
      })),
    );
```

and in the `create` payload replace `stopId: fullItem.stopId ?? null,` with `stopId: placedStopId,`.

- [ ] **Step 4: Update the superseded test**

`server/actions/items.test.ts:998` ("copy inherits title, category, lat, lng, countryCode, address, link, notes from idea") asserts `stopId: null` and carries a comment explaining that an idea can never hold a Stop. That comment is still true of the *idea*; it is no longer true of the *placed copy*. Update the assertion and replace the comment with:

```ts
    // A genuine Wishlist idea can never carry a stopId (ADR 0022 / CONTEXT.md:
    // "attached to no Stop and no day"). The COPY is a different thing: it is
    // dated, so it sits in a Stop's stay and is filed there (ADR 0049 rule 5).
    // With no stops mocked, nothing covers the date and it stays null.
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run server/actions/items.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify the baseline**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add server/actions/items.ts server/actions/items.test.ts
git commit -m "fix(items): file a wishlist placement under the stop covering its day"
```

---

## Phase B — Push subscription rotation

### Task 5: `healRotatedSubscription`

The rule, server-side and testable without HTTP. ADR 0048's posture: never touch a row you do not own, never silently drop a Device.

**Files:**
- Modify: `server/actions/push.ts`
- Test: `server/actions/push.test.ts`

**Interfaces:**
- Produces: `healRotatedSubscription(input: { oldEndpoint?: string | null; endpoint: string; keys: { p256dh: string; auth: string }; timezone?: string; userAgent?: string }): Promise<{ ok: true; mode: "updated" | "registered" } | { ok: false; error: string }>`. Task 6 consumes it via the route from Task 7… (the route is Task 6; the service worker is Task 7).

- [ ] **Step 1: Write the failing test**

Create or extend `server/actions/push.test.ts`, mirroring the mock style of `server/actions/devices.test.ts`:

```ts
it("updates the rotated row in place, preserving label, timezone and createdAt", async () => {
  subFindUniqueMock.mockResolvedValue({
    id: "row-1", userId: "u1", endpoint: "https://old", p256dh: "oldp", auth: "olda",
    label: "iPhone · Safari", timezone: "Europe/Berlin",
  });
  subUpdateMock.mockResolvedValue({ id: "row-1" });

  const res = await healRotatedSubscription({
    oldEndpoint: "https://old",
    endpoint: "https://new",
    keys: { p256dh: "newp", auth: "newa" },
  });

  expect(res).toEqual({ ok: true, mode: "updated" });
  expect(subUpdateMock).toHaveBeenCalledWith({
    where: { endpoint: "https://old" },
    data: expect.objectContaining({ endpoint: "https://new", p256dh: "newp", auth: "newa" }),
  });
  // label is captured once and never re-derived (ADR 0048)
  expect(subUpdateMock.mock.calls[0][0].data).not.toHaveProperty("label");
});

it("refuses to touch another traveller's row and registers the new one instead", async () => {
  subFindUniqueMock.mockResolvedValue({ id: "row-1", userId: "someone-else", endpoint: "https://old" });
  subUpsertMock.mockResolvedValue({ id: "row-2" });

  const res = await healRotatedSubscription({
    oldEndpoint: "https://old",
    endpoint: "https://new",
    keys: { p256dh: "newp", auth: "newa" },
  });

  expect(res).toEqual({ ok: true, mode: "registered" });
  expect(subUpdateMock).not.toHaveBeenCalled();
});

it("registers the new subscription and leaves the old row standing when the old endpoint is unknown", async () => {
  subUpsertMock.mockResolvedValue({ id: "row-2" });

  const res = await healRotatedSubscription({
    endpoint: "https://new",
    keys: { p256dh: "newp", auth: "newa" },
  });

  expect(res).toEqual({ ok: true, mode: "registered" });
  expect(subDeleteManyMock).not.toHaveBeenCalled();
});

it("refuses empty key material rather than creating a device that cannot receive", async () => {
  const res = await healRotatedSubscription({
    endpoint: "https://new",
    keys: { p256dh: "", auth: "" },
  });

  expect(res).toEqual({ ok: false, error: "No usable key material." });
  expect(subUpsertMock).not.toHaveBeenCalled();
  expect(subUpdateMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/actions/push.test.ts`
Expected: FAIL with `healRotatedSubscription is not a function`.

- [ ] **Step 3: Implement**

Append to `server/actions/push.ts`:

```ts
export interface HealRotatedInput {
  /** The endpoint that rotated away. Browsers do not reliably supply it. */
  oldEndpoint?: string | null;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  timezone?: string;
  userAgent?: string;
}

export type HealRotatedResult =
  | { ok: true; mode: "updated" | "registered" }
  | { ok: false; error: string };

/**
 * Heal a **Device** whose push endpoint rotated underneath it.
 *
 * A push service may rotate an endpoint at any time, including while the app
 * is closed. Until this existed, the stored row went on pointing at the dead
 * endpoint until someone pressed Enable again — the Device looked healthy and
 * received nothing, which is the ADR 0048 failure all over again.
 *
 * Two shapes, because `pushsubscriptionchange` does not reliably carry the old
 * subscription:
 *
 * - **Old endpoint known** — update that row in place. `label`, `timezone` and
 *   `createdAt` survive, so the Device keeps its identity in the Account list
 *   and the Traveller never learns anything happened. `label` is absent from
 *   the write on purpose (ADR 0048: captured once, never re-derived).
 * - **Old endpoint unknown** — register the new subscription and leave the old
 *   row alone. It drifts into "unseen since" and can be removed by hand. A
 *   tombstone the Traveller can see beats a Device that silently stops
 *   receiving, and TEEPEE never silently drops a Device.
 *
 * Always requires a session. Matching on the old endpoint alone would be a
 * hijack: an endpoint is a capability URL, so anyone holding a victim's could
 * post {old: victim, new: attacker} and have that Traveller's Digests — trip
 * contents and all — delivered to their own device.
 */
export async function healRotatedSubscription(
  input: HealRotatedInput,
): Promise<HealRotatedResult> {
  const user = await requireUser();

  // Same reasoning as reconcileDevice: a pair of empty strings is not a
  // degraded key, it is no key at all, and a row without usable keys is a
  // Device that LOOKS confirmed and can never receive a push.
  if (!input.keys?.p256dh || !input.keys?.auth) {
    return { ok: false, error: "No usable key material." };
  }

  try {
    if (input.oldEndpoint && input.oldEndpoint !== input.endpoint) {
      const existing = await db.pushSubscription.findUnique({
        where: { endpoint: input.oldEndpoint },
      });
      if (existing && existing.userId === user.id) {
        await db.pushSubscription.update({
          where: { endpoint: input.oldEndpoint },
          data: {
            endpoint: input.endpoint,
            p256dh: input.keys.p256dh,
            auth: input.keys.auth,
            lastSeenAt: new Date(),
            ...(input.timezone ? { timezone: input.timezone } : {}),
          },
        });
        return { ok: true, mode: "updated" };
      }
      // No row, or somebody else's. Fall through and register the new one:
      // reassigning a row we do not own would hand one person's Digest to
      // another (reconcileDevice makes the same refusal).
    }

    await db.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId: user.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        label: deviceLabelFromUserAgent(input.userAgent),
        lastSeenAt: new Date(),
        ...(input.timezone ? { timezone: input.timezone } : {}),
      },
      update: {
        userId: user.id,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        lastSeenAt: new Date(),
        ...(input.timezone ? { timezone: input.timezone } : {}),
      },
    });
    return { ok: true, mode: "registered" };
  } catch {
    return { ok: false, error: "Failed to heal push subscription." };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/actions/push.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the baseline**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add server/actions/push.ts server/actions/push.test.ts
git commit -m "feat(push): heal a rotated subscription without losing the device"
```

---

### Task 6: `POST /api/push`

A service worker cannot invoke a server action, which is why this route has to exist.

**Files:**
- Create: `app/api/push/route.ts`
- Test: `app/api/push/route.test.ts`

**Interfaces:**
- Consumes: `healRotatedSubscription` from Task 5.
- Produces: `POST /api/push` accepting `{ oldEndpoint?: string, endpoint: string, keys: { p256dh: string, auth: string }, timezone?: string }`. Task 7 posts to it.

- [ ] **Step 1: Write the failing test**

Create `app/api/push/route.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from "vitest";

const { healMock } = vi.hoisted(() => ({ healMock: vi.fn() }));
vi.mock("@/server/actions/push", () => ({ healRotatedSubscription: healMock }));

import { POST } from "./route";

afterEach(() => vi.clearAllMocks());

function post(body: unknown, ua = "Mozilla/5.0") {
  return new Request("http://localhost/api/push", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": ua },
    body: JSON.stringify(body),
  });
}

describe("POST /api/push", () => {
  it("heals a rotation and answers 200", async () => {
    healMock.mockResolvedValue({ ok: true, mode: "updated" });
    const res = await POST(post({ oldEndpoint: "https://old", endpoint: "https://new", keys: { p256dh: "p", auth: "a" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: "updated" });
  });

  it("passes the request's user agent through so a new row gets a device label", async () => {
    healMock.mockResolvedValue({ ok: true, mode: "registered" });
    await POST(post({ endpoint: "https://new", keys: { p256dh: "p", auth: "a" } }, "iPhone-UA"));
    expect(healMock).toHaveBeenCalledWith(expect.objectContaining({ userAgent: "iPhone-UA" }));
  });

  it("rejects a body with no endpoint", async () => {
    const res = await POST(post({ keys: { p256dh: "p", auth: "a" } }));
    expect(res.status).toBe(400);
    expect(healMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without throwing", async () => {
    const req = new Request("http://localhost/api/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("answers 401 when there is no session", async () => {
    healMock.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" }));
    const res = await POST(post({ endpoint: "https://new", keys: { p256dh: "p", auth: "a" } }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/api/push/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/api/push/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { healRotatedSubscription } from "@/server/actions/push";

/**
 * The service worker's only way to reach the server.
 *
 * `pushsubscriptionchange` fires inside the service worker, which cannot call
 * a server action — hence a route. It carries a session cookie like any
 * same-origin fetch, and a session is REQUIRED: matching on the old endpoint
 * alone would let anyone holding a victim's endpoint redirect that Traveller's
 * Digests to their own device (see healRotatedSubscription).
 */
const bodySchema = z.object({
  oldEndpoint: z.string().min(1).optional(),
  endpoint: z.string().min(1),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  timezone: z.string().min(1).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  try {
    const result = await healRotatedSubscription({
      ...parsed.data,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch {
    // requireUser() redirects when signed out, which surfaces here as a throw.
    // The service worker cannot follow a redirect to a sign-in page, so say
    // 401 plainly and let it give up — the Device heals on its next visit.
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run app/api/push/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the baseline + commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add app/api/push/route.ts app/api/push/route.test.ts
git commit -m "feat(push): add POST /api/push so the service worker can heal a rotation"
```

---

### Task 7: `pushsubscriptionchange` in the service worker

**Files:**
- Modify: `public/sw.js`
- Test: the existing service-worker harness added by `a34a076` — find it with `git show --stat a34a076` and extend that file.

**Interfaces:**
- Consumes: `POST /api/push` from Task 6.

- [ ] **Step 1: Locate the harness**

Run: `git show --stat a34a076` and open the test file it added. Read how it loads `public/sw.js` and dispatches synthetic events — reuse that exactly rather than inventing a second harness.

- [ ] **Step 2: Write the failing test**

In that harness file:

```js
it('re-subscribes and posts both endpoints when the subscription rotates', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  globalThis.fetch = fetchMock;
  const subscribe = vi.fn().mockResolvedValue({
    endpoint: 'https://new',
    toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }),
  });
  self.registration.pushManager = { subscribe };

  await dispatch('pushsubscriptionchange', {
    oldSubscription: { endpoint: 'https://old', options: { applicationServerKey: new Uint8Array([1]) } },
    newSubscription: null,
  });

  expect(fetchMock).toHaveBeenCalledWith('/api/push', expect.objectContaining({ method: 'POST' }));
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body).toMatchObject({ oldEndpoint: 'https://old', endpoint: 'https://new' });
});

it('still reports the new subscription when the browser gives no old one', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  globalThis.fetch = fetchMock;
  self.registration.pushManager = {
    subscribe: vi.fn().mockResolvedValue({
      endpoint: 'https://new',
      toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }),
    }),
  };

  await dispatch('pushsubscriptionchange', { oldSubscription: null, newSubscription: null });

  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.oldEndpoint).toBeUndefined();
  expect(body.endpoint).toBe('https://new');
});

it('never throws when re-subscribing fails', async () => {
  globalThis.fetch = vi.fn();
  self.registration.pushManager = { subscribe: vi.fn().mockRejectedValue(new Error('denied')) };
  await expect(dispatch('pushsubscriptionchange', { oldSubscription: null, newSubscription: null })).resolves.not.toThrow();
});
```

Adapt `dispatch(...)` to whatever the harness actually calls its event helper.

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run <harness path>`
Expected: FAIL — no `pushsubscriptionchange` listener, so `fetch` is never called.

- [ ] **Step 4: Implement**

Append to `public/sw.js`, after the `notificationclick` handler:

```js
// ---------------------------------------------------------------------------
// Push subscription rotation
// ---------------------------------------------------------------------------

// A push service may rotate an endpoint at any time, including while the app
// is closed. Without this, the stored row keeps pointing at the dead endpoint
// until the Traveller presses Enable again — the Device looks healthy in
// Account and silently receives nothing.
//
// A service worker cannot call a server action, so this posts to /api/push.
// The fetch carries the session cookie; if there is no session the route
// answers 401 and we give up, and the Device heals on its next visit instead.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldSub = event.oldSubscription || null;

        // Re-subscribe with the SAME applicationServerKey the dead
        // subscription used. Reading it off the old options avoids baking the
        // VAPID key into the service worker, which is generated at build time.
        const applicationServerKey =
          (oldSub && oldSub.options && oldSub.options.applicationServerKey) || undefined;

        const fresh =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            ...(applicationServerKey ? { applicationServerKey } : {}),
          }));

        if (!fresh || !fresh.endpoint) return;

        const keys = (fresh.toJSON && fresh.toJSON().keys) || {};
        if (!keys.p256dh || !keys.auth) return;

        await fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ...(oldSub && oldSub.endpoint ? { oldEndpoint: oldSub.endpoint } : {}),
            endpoint: fresh.endpoint,
            keys: { p256dh: keys.p256dh, auth: keys.auth },
          }),
        });
      } catch (err) {
        // Never throw out of a service worker event. A failed heal leaves the
        // Device exactly as it was — healed on its next visit.
        console.warn('[SW] pushsubscriptionchange failed:', err);
      }
    })(),
  );
});
```

- [ ] **Step 5: Run tests, verify baseline, commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add public/sw.js <harness path>
git commit -m "fix(sw): heal a rotated push subscription the moment it rotates"
```

---

## Phase C — The Digest

Read ADR 0050 before starting this phase.

### Task 8: One zone per person

**Files:**
- Modify: `app/api/cron/digest/route.ts:156-190`
- Test: `app/api/cron/digest/route.test.ts`

**Interfaces:**
- Produces: the cron route now calls `dispatchDigest({ userId, tripId, localDate, slot, zone })`. Task 9 adds the `zone` parameter; **do Task 9 first if you prefer a compiling intermediate state** — otherwise add `zone` to the call here and let Task 9 consume it.

- [ ] **Step 1: Write the failing test**

Add to `app/api/cron/digest/route.test.ts`:

```ts
it("uses the most recently seen device's zone and dispatches once per person", async () => {
  // A laptop left at home in Brisbane and a phone carried to Munich. Brisbane
  // reaches 8pm ~9h before Munich; before this fix the Brisbane cohort claimed
  // the slot and pushed to BOTH devices, so the phone buzzed at 11am Munich.
  subFindManyMock.mockResolvedValue([
    { userId: "u1", timezone: "Australia/Brisbane", lastSeenAt: new Date("2026-12-01T00:00:00Z") },
    { userId: "u1", timezone: "Europe/Berlin", lastSeenAt: new Date("2026-12-09T18:00:00Z") },
  ]);
  memberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);
  dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false });

  await GET(authorizedRequest());

  expect(dispatchDigestMock).toHaveBeenCalledTimes(1);
  expect(dispatchDigestMock).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "u1", zone: "Europe/Berlin" }),
  );
});

it("ignores a device with no stored zone when picking the person's clock", async () => {
  subFindManyMock.mockResolvedValue([
    { userId: "u1", timezone: null, lastSeenAt: new Date("2026-12-10T00:00:00Z") },
    { userId: "u1", timezone: "Europe/Berlin", lastSeenAt: new Date("2026-12-09T18:00:00Z") },
  ]);
  memberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);
  dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false });

  await GET(authorizedRequest());

  expect(dispatchDigestMock).toHaveBeenCalledWith(
    expect.objectContaining({ zone: "Europe/Berlin" }),
  );
});
```

Reuse whatever the file already names its mocks and its authorized-request helper; the names above are indicative.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/api/cron/digest/route.test.ts`
Expected: FAIL — two dispatches, not one.

- [ ] **Step 3: Implement**

In `app/api/cron/digest/route.ts`, add `lastSeenAt: true` to the `select` at `:158`, then replace the pair-building block at `:170-180`:

```ts
    // One clock per PERSON, not per Device (ADR 0050). Deduplicating on
    // (userId, timezone) meant a laptop left at home kept its stale zone and
    // reached its evening window hours before the phone abroad did — and
    // because dispatchDigest pushes to every Device the person owns and the
    // ledger key carries no zone, the travelling phone got the Digest at the
    // home laptop's 8pm and nothing at its own.
    //
    // `lastSeenAt` means "last used the app" now that DeviceSync mounts in the
    // authenticated root layout (ADR 0048), so the newest one is the Device
    // the Traveller is actually carrying.
    const zoneByUser = new Map<string, { timezone: string; lastSeenAt: Date }>();
    for (const s of subscriptions) {
      if (!s.timezone) continue;
      const best = zoneByUser.get(s.userId);
      if (!best || s.lastSeenAt > best.lastSeenAt) {
        zoneByUser.set(s.userId, { timezone: s.timezone, lastSeenAt: s.lastSeenAt });
      }
    }
    const pairs = [...zoneByUser.entries()].map(([userId, v]) => ({
      userId,
      timezone: v.timezone,
    }));
```

Change the loop header from `for (const { userId, timezone } of pairs.values())` to `for (const { userId, timezone } of pairs)`, and add `zone: timezone` to the `dispatchDigest` call at `:206`.

- [ ] **Step 4: Run tests, verify baseline, commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add app/api/cron/digest/route.ts app/api/cron/digest/route.test.ts
git commit -m "fix(digest): one clock per person, the device they actually use"
```

---

### Task 9: The Trip's clock is the recipient's zone

**Files:**
- Modify: `lib/digest-dispatch.ts` (`dispatchDigest` `:508`, `collectDigestInput` `:69`, `resolveTripZone` `:277`)
- Test: `lib/digest-dispatch.test.ts`

**Interfaces:**
- Consumes: `zone` passed by Task 8.
- Produces: `dispatchDigest(opts: { userId, tripId, localDate, slot, zone?: string, force?: boolean })` and `collectDigestInput(opts: { tripId, localDate, slot, zone?: string })`. `zone` is optional so the Settings test-send path keeps working unchanged.

- [ ] **Step 1: Write the failing test**

```ts
it("prints an outbound departure in the recipient's own zone, not the country guess", async () => {
  // Gold Coast is Queensland — AEST all year. `au` guesses Australia/Sydney,
  // which is AEDT in December, so a 06:00 departure printed as 07:00.
  tripFindUniqueMock.mockResolvedValue({
    id: "trip-1", startDate: "2026-12-05", endDate: "2026-12-30",
    homeName: "Gold Coast", homeCountryCode: "au",
  });
  transportFindManyMock.mockResolvedValue([
    { id: "t1", mode: "FLIGHT", depAt: new Date("2026-12-04T20:00:00Z"), depIsHome: true, arrIsHome: false, fromStopId: null, toStopId: "munich", depPlace: null, arrPlace: null, reference: "QF1" },
  ]);
  stopFindManyMock.mockResolvedValue([
    { id: "munich", name: "Munich", timezone: "Europe/Berlin", arriveDate: "2026-12-05", departDate: "2026-12-10", sortOrder: 0 },
  ]);

  const input = await collectDigestInput({
    tripId: "trip-1", localDate: "2026-12-04", slot: "EVENING", zone: "Australia/Brisbane",
  });

  expect(input.schedule.transports[0].localTime).toBe("06:00");
});

it("falls back to the country guess when no zone is supplied", async () => {
  tripFindUniqueMock.mockResolvedValue({
    id: "trip-1", startDate: "2026-12-05", endDate: "2026-12-30",
    homeName: "Gold Coast", homeCountryCode: "au",
  });
  transportFindManyMock.mockResolvedValue([
    { id: "t1", mode: "FLIGHT", depAt: new Date("2026-12-04T20:00:00Z"), depIsHome: true, arrIsHome: false, fromStopId: null, toStopId: "munich", depPlace: null, arrPlace: null, reference: "QF1" },
  ]);
  stopFindManyMock.mockResolvedValue([
    { id: "munich", name: "Munich", timezone: "Europe/Berlin", arriveDate: "2026-12-05", departDate: "2026-12-10", sortOrder: 0 },
  ]);

  const input = await collectDigestInput({ tripId: "trip-1", localDate: "2026-12-04", slot: "EVENING" });

  expect(input.schedule.transports[0].localTime).toBe("07:00");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/digest-dispatch.test.ts`
Expected: FAIL — the first test gets "07:00".

- [ ] **Step 3: Implement**

Change the `resolveTripZone` signature and its doc comment:

```ts
/**
 * The Trip's own timezone — the one a traveller standing at their **Home base**
 * reads off their watch.
 *
 * First answer is the recipient's own Device zone (ADR 0050). The only leg
 * without a departure Stop is the OUTBOUND one, and on the evening before an
 * outbound flight the traveller is standing at their Home base — so their
 * Device is in the home zone and reporting it. That beats
 * `guessTimezoneForCountry`, which is country-granular: `au` resolves to
 * Australia/Sydney, so a Brisbane departure printed an hour late every
 * December.
 *
 * Falls back to the country guess (for a forced test send, which carries no
 * zone) and then to the zone of the Stop the trip is currently at.
 */
function resolveTripZone(
  zone: string | null,
  homeCountryCode: string | null,
  stops: StopRow[],
): string {
  if (zone) return zone;
  const guessed = guessTimezoneForCountry(homeCountryCode);
  if (guessed !== "UTC") return guessed;
  return currentTripTimezone(stops);
}
```

Add `zone?: string` to `collectDigestInput`'s options type and destructure it; change the call at `:186` to `resolveTripZone(zone ?? null, trip?.homeCountryCode ?? null, stops)`.

Add `zone?: string` to `dispatchDigest`'s options type, destructure it, and pass it through at `:559`: `collectDigestInput({ tripId, localDate, slot, zone })`.

- [ ] **Step 4: Run tests, verify baseline, commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add lib/digest-dispatch.ts lib/digest-dispatch.test.ts
git commit -m "fix(digest): read the trip's clock off the device receiving it"
```

---

### Task 10: Order the Digest by what is most costly to lose

**Files:**
- Modify: `lib/digest.ts:133-156`
- Test: `lib/digest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
const OVERDUE = (text: string) => ({ text, daysUntil: -3 });

it("keeps tomorrow's flight above a wall of overdue checklist items", () => {
  const out = buildDigest({
    tripId: "trip-1",
    slot: "EVENING",
    payments: [],
    checklist: [OVERDUE("a"), OVERDUE("b"), OVERDUE("c"), OVERDUE("d"), OVERDUE("e"), OVERDUE("f")],
    reminders: [],
    schedule: {
      transports: [{ mode: "FLIGHT", route: "Munich → Strasbourg", localTime: "06:00" }],
      stays: [],
      items: [],
    },
  });
  expect(out!.body.split("\n")[0]).toContain("Munich → Strasbourg");
});

it("caps the checklist block at two lines so it cannot crowd out a payment", () => {
  const out = buildDigest({
    tripId: "trip-1",
    slot: "EVENING",
    payments: [{ amountLabel: "£240", label: "Airbnb", daysUntil: 0 }],
    checklist: [OVERDUE("a"), OVERDUE("b"), OVERDUE("c"), OVERDUE("d")],
    reminders: [],
    schedule: { transports: [], stays: [], items: [] },
  });
  const lines = out!.body.split("\n");
  expect(lines.filter((l) => l.startsWith("Checklist:"))).toHaveLength(2);
  expect(out!.body).toContain("Airbnb");
});

it("puts a reminder above a payment — a reminder is said once and never repeats", () => {
  const out = buildDigest({
    tripId: "trip-1",
    slot: "EVENING",
    payments: [{ amountLabel: "£240", label: "Airbnb", daysUntil: 2 }],
    checklist: [],
    reminders: [{ title: "Print the insurance docs" }],
    schedule: { transports: [], stays: [], items: [] },
  });
  const lines = out!.body.split("\n");
  expect(lines.indexOf("Print the insurance docs")).toBeLessThan(
    lines.findIndex((l) => l.includes("Airbnb")),
  );
});
```

Match the exact shape of `DigestInput` used by the tests already in this file; the field names above follow `lib/digest.ts`'s existing types.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/digest.test.ts`
Expected: FAIL — the flight is truncated into "+1 more".

- [ ] **Step 3: Implement**

Replace `collectLines` and its doc comment:

```ts
/** At most this many Checklist lines, however many are overdue. */
const DIGEST_MAX_CHECKLIST_LINES = 2;

/**
 * Returns the content lines ordered by HOW COSTLY EACH ONE IS TO LOSE, not by
 * category — and, for MORNING, the schedule-only lines, since the morning slot
 * exists purely as travel-day insurance and must never repeat what the
 * previous evening's Digest already carried.
 *
 * The cap (DIGEST_MAX_LINES) always eats the tail, so the tail has to hold the
 * most repeatable content:
 *
 *   1. Schedule — tomorrow's plan, said once, and the reason the push is
 *      titled "Tomorrow". Six overdue checklist items used to push the
 *      outbound flight into "+1 more".
 *   2. Reminders — CONTEXT.md is explicit that a Reminder is "said once, the
 *      night before". Truncated, it is gone for good.
 *   3. Payments — urgent, but deliberately repeated on each of the three days
 *      before and on the day, so a truncated one returns tomorrow.
 *   4. Checklist — persists until done and reappears nightly, so it gives way
 *      first, and is capped besides.
 */
function collectLines(input: DigestInput): { lines: string[]; paymentLineCount: number } {
  const lines: string[] = [];
  let paymentLineCount = 0;

  for (const transport of input.schedule.transports) lines.push(formatTransport(transport));
  for (const stay of input.schedule.stays) lines.push(formatStay(stay));
  for (const item of input.schedule.items) lines.push(formatItem(item));

  if (input.slot === "EVENING") {
    for (const reminder of input.reminders) lines.push(formatReminder(reminder));
    for (const payment of input.payments) {
      lines.push(formatPayment(payment));
      paymentLineCount += 1;
    }
    for (const item of input.checklist.slice(0, DIGEST_MAX_CHECKLIST_LINES)) {
      lines.push(formatChecklist(item));
    }
  }

  return { lines, paymentLineCount };
}
```

Export `DIGEST_MAX_CHECKLIST_LINES` next to `DIGEST_MAX_LINES` if any test imports it.

- [ ] **Step 4: Check the `isPaymentOnly` rule still holds**

`isPaymentOnly` compares `paymentLineCount === lines.length`. Truncating the checklist changes `lines.length`, so re-read `:184-185` and confirm a payments-only Digest still links to `/budget`. Add a test if one does not already exist:

```ts
it("still links a payments-only digest to the budget", () => {
  const out = buildDigest({
    tripId: "trip-1", slot: "EVENING",
    payments: [{ amountLabel: "£240", label: "Airbnb", daysUntil: 0 }],
    checklist: [], reminders: [],
    schedule: { transports: [], stays: [], items: [] },
  });
  expect(out!.url).toBe("/trips/trip-1/budget");
});
```

- [ ] **Step 5: Update the stale docstring reference**

Search for other comments naming "documented order" and update them.

- [ ] **Step 6: Run tests, verify baseline, commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add lib/digest.ts lib/digest.test.ts
git commit -m "fix(digest): order lines by what is costliest to lose, cap the checklist"
```

---

### Task 11: MORNING stops paying for reads it throws away

**Files:**
- Modify: `lib/digest-dispatch.ts:119+`
- Test: `lib/digest-dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("MORNING does not query payments, checklist or reminders — it discards them", async () => {
  tripFindUniqueMock.mockResolvedValue({ id: "trip-1", startDate: "2026-12-05", endDate: "2026-12-30", homeName: "Gold Coast", homeCountryCode: "au" });
  transportFindManyMock.mockResolvedValue([]);
  stopFindManyMock.mockResolvedValue([]);

  await collectDigestInput({ tripId: "trip-1", localDate: "2026-12-06", slot: "MORNING" });

  expect(costFindManyMock).not.toHaveBeenCalled();
  expect(checklistFindManyMock).not.toHaveBeenCalled();
  expect(reminderFindManyMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/digest-dispatch.test.ts -t "MORNING does not query"`
Expected: FAIL — all three were called.

- [ ] **Step 3: Implement**

Wrap the three queries in the `Promise.all` at `:119` so each resolves to `[]` when `slot !== "EVENING"`, following the `needTransports` pattern already used at `:189`:

```ts
  // collectLines only reads payments, checklist and reminders on the EVENING
  // slot, so querying them for MORNING buys nothing and wakes Neon for reads
  // that are thrown away — and ADR 0047's whole cadence argument is
  // denominated in CU-hours.
  const needEveningContent = slot === "EVENING";

  const [dueCosts, checklistRows, reminderRows] = await Promise.all([
    needEveningContent ? db.cost.findMany({ /* unchanged */ }) : Promise.resolve([]),
    needEveningContent ? db.checklistItem.findMany({ /* unchanged */ }) : Promise.resolve([]),
    needEveningContent ? db.reminder.findMany({ /* unchanged */ }) : Promise.resolve([]),
  ]);
```

Keep each query body byte-for-byte as it is; only the ternary is new. Then check `buildPaymentLines` and `buildCostLabelMap` downstream — if either is called unconditionally, gate it on `needEveningContent` too, and confirm `tsc` is happy with the empty-array types.

- [ ] **Step 4: Run tests, verify baseline, commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add lib/digest-dispatch.ts lib/digest-dispatch.test.ts
git commit -m "perf(digest): stop the morning slot paying for reads it discards"
```

---

## Phase D — The cron heartbeat

### Task 12: Record and surface when the dispatcher last ran

`DigestDispatch` rows exist only when something was sent, so a genuinely quiet week is indistinguishable from a dead cron. GitHub disables scheduled workflows after 60 days of repository inactivity — exactly what December looks like.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260920000000_cron_heartbeat/migration.sql`
- Create: `lib/cron-health.ts`, `lib/cron-health.test.ts`
- Create: `server/actions/cron-health.ts`
- Create: `components/account/dispatcher-health.tsx`, `components/account/dispatcher-health.test.tsx`
- Modify: `app/api/cron/digest/route.ts`, `app/(app)/account/page.tsx`

**Interfaces:**
- Produces: `isDispatcherStale(lastRunAt: Date | null, now: Date): boolean` and `formatLastRun(lastRunAt: Date | null, now: Date): string` from `lib/cron-health.ts`; `getDispatcherHealth(): Promise<{ lastRunAt: Date | null; stale: boolean }>` from `server/actions/cron-health.ts`.

- [ ] **Step 1: Write the failing pure test**

Create `lib/cron-health.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isDispatcherStale, formatLastRun, DISPATCHER_STALE_AFTER_HOURS } from "./cron-health";

const now = new Date("2026-12-10T12:00:00Z");

describe("isDispatcherStale", () => {
  it("is not stale a few hours after a run", () => {
    expect(isDispatcherStale(new Date("2026-12-10T06:00:00Z"), now)).toBe(false);
  });

  it("tolerates GitHub delaying a scheduled run", () => {
    // The workflow matches a three-hour local window, not an exact hour, so a
    // tight threshold would cry wolf. 24h means four scheduled runs missed.
    expect(isDispatcherStale(new Date("2026-12-09T13:00:00Z"), now)).toBe(false);
  });

  it("is stale past the threshold", () => {
    expect(isDispatcherStale(new Date("2026-12-09T11:00:00Z"), now)).toBe(true);
  });

  it("treats never-having-run as stale", () => {
    expect(isDispatcherStale(null, now)).toBe(true);
  });

  it("exposes the threshold so the copy and the test agree", () => {
    expect(DISPATCHER_STALE_AFTER_HOURS).toBe(24);
  });
});

describe("formatLastRun", () => {
  it("says so plainly when it has never run", () => {
    expect(formatLastRun(null, now)).toBe("never run");
  });

  it("reads as reassurance while healthy", () => {
    expect(formatLastRun(new Date("2026-12-10T10:00:00Z"), now)).toBe("last ran 2 hours ago");
  });

  it("switches to a date once stale, which reads as a question", () => {
    expect(formatLastRun(new Date("2026-12-01T10:00:00Z"), now)).toBe("last ran 1 Dec 2026");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/cron-health.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure module**

Create `lib/cron-health.ts`:

```ts
/**
 * lib/cron-health.ts — how long the Digest dispatcher may stay quiet.
 *
 * Pure arithmetic, no I/O, no clock of its own, exactly like lib/devices.ts:
 * `now` always arrives as an argument so a test can put it anywhere.
 *
 * This exists because silence is ambiguous. A Digest is deliberately not sent
 * when there is nothing to say, and the Settings panel has taught the
 * Traveller to read silence as normal — so a dispatcher that stopped running
 * altogether looks exactly like a quiet week. GitHub disables scheduled
 * workflows after 60 days of repository inactivity, which is what December
 * looks like from the outside.
 */

/**
 * Past this, the dispatcher is reported as stale. Deliberately generous:
 * GitHub delays scheduled runs under load and the workflow tolerates that by
 * design (it matches a three-hour local window, not an exact hour). Twenty-four
 * hours means at least four scheduled runs were missed — a real outage, not a
 * late one.
 */
export const DISPATCHER_STALE_AFTER_HOURS = 24;

const HOUR_MS = 3_600_000;

export function isDispatcherStale(lastRunAt: Date | null, now: Date): boolean {
  if (!lastRunAt) return true;
  return now.getTime() - lastRunAt.getTime() > DISPATCHER_STALE_AFTER_HOURS * HOUR_MS;
}

/**
 * Changes register at the threshold, for the same reason `formatLastSeen`
 * does: a relative age reads as reassurance, an absolute date reads as a
 * question.
 */
export function formatLastRun(lastRunAt: Date | null, now: Date): string {
  if (!lastRunAt) return "never run";
  if (isDispatcherStale(lastRunAt, now)) {
    return `last ran ${lastRunAt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }
  const hours = Math.max(0, Math.floor((now.getTime() - lastRunAt.getTime()) / HOUR_MS));
  if (hours >= 1) return `last ran ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  return "last ran just now";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/cron-health.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the schema and the hand-written migration**

There is no Postgres and no Docker in this sandbox. **Do not run `prisma migrate dev`.** Write the migration by hand, matching the existing dated-directory convention (`prisma/migrations/20260917000000_device_label_and_last_seen/`).

Add to `prisma/schema.prisma`:

```prisma
/// A single row, stamped on every authorized cron hit whether or not anything
/// was sent. DigestDispatch rows only exist when a Digest went out, so they
/// cannot distinguish a quiet week from a dispatcher that stopped running.
model CronHeartbeat {
  id        String   @id @default("digest")
  lastRunAt DateTime
}
```

Create `prisma/migrations/20260920000000_cron_heartbeat/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "CronHeartbeat" (
    "id" TEXT NOT NULL DEFAULT 'digest',
    "lastRunAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronHeartbeat_pkey" PRIMARY KEY ("id")
);
```

Then run `npx prisma generate` so the client types exist.

- [ ] **Step 6: Stamp the heartbeat in the cron route**

In `app/api/cron/digest/route.ts`, immediately after the `isPushConfigured()` bail and before `const now = new Date();`… actually place it after `const now = new Date();`:

```ts
  // Stamped on every authorized run, sent or not. This is the only signal that
  // distinguishes "nothing to say" from "the scheduler stopped" — see
  // lib/cron-health.ts. Best-effort: a failed heartbeat must never cost anyone
  // their Digest.
  try {
    await db.cronHeartbeat.upsert({
      where: { id: "digest" },
      create: { id: "digest", lastRunAt: now },
      update: { lastRunAt: now },
    });
  } catch (err) {
    console.error("[cron/digest] heartbeat write failed:", err);
  }
```

Add a test asserting the heartbeat is written even when no subscriptions exist, and that a throwing heartbeat does not fail the run.

- [ ] **Step 7: Add the server action**

Create `server/actions/cron-health.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { isDispatcherStale } from "@/lib/cron-health";

export interface DispatcherHealth {
  lastRunAt: Date | null;
  stale: boolean;
}

/**
 * When the Digest dispatcher last ran.
 *
 * Visible to any signed-in Traveller, not just an Admin: the person who
 * notices their Digests stopped is the one who needs the explanation, and
 * making it operator-only means the symptom and its cause live on different
 * screens.
 */
export async function getDispatcherHealth(): Promise<DispatcherHealth> {
  await requireUser();
  const row = await db.cronHeartbeat.findUnique({ where: { id: "digest" } });
  const lastRunAt = row?.lastRunAt ?? null;
  return { lastRunAt, stale: isDispatcherStale(lastRunAt, new Date()) };
}
```

- [ ] **Step 8: Render it on Account**

Create `components/account/dispatcher-health.tsx` — a small presentational component taking `{ lastRunAt, stale }`, rendering `formatLastRun(...)` with the same muted/warning treatment `DevicesPanel` uses for a stale Device. Copy: healthy reads `Digest service — last ran 2 hours ago`; stale reads `Digest service hasn't run since 1 Dec 2026. Digests are not being sent.` Do not use the word "notification" (CONTEXT.md reserves it for the Activity bell).

Wire it into `app/(app)/account/page.tsx`: add `getDispatcherHealth()` to the existing `Promise.all`, and render `<DispatcherHealth ... />` inside the Devices card beneath `<DevicesPanel />` — it explains the Devices rather than standing alone.

Write `components/account/dispatcher-health.test.tsx` covering both registers.

- [ ] **Step 9: Document the deploy step**

Add the new migration to `docs/DEPLOY.md` §5 alongside the existing pre-deploy checks: the `CronHeartbeat` table must exist before the route runs, and the Account page will read "never run" until the first authorized cron hit lands.

- [ ] **Step 10: Run tests, verify baseline, commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add prisma/schema.prisma prisma/migrations/20260920000000_cron_heartbeat lib/cron-health.ts lib/cron-health.test.ts server/actions/cron-health.ts components/account/dispatcher-health.tsx components/account/dispatcher-health.test.tsx "app/(app)/account/page.tsx" app/api/cron/digest/route.ts app/api/cron/digest/route.test.ts docs/DEPLOY.md
git commit -m "feat(digest): say on Account when the dispatcher last ran"
```

---

## Phase E — Smaller items

### Task 13: A past-dated Reminder stops saying "in -31 days"

**Files:** Modify `components/trip/reminders-card.tsx`; test `components/trip/reminders-card.test.tsx`.

- [ ] **Step 1: Write the failing test** — render a Reminder dated before today and assert the card shows the title with no relative label, and specifically not `/-\d+ days/`.
- [ ] **Step 2: Run it.** Expected: FAIL, the card renders "in -31 days".
- [ ] **Step 3: Implement** — return `null` from the relative-label helper when the date is in the past, and render the label only when non-null. Comment: the query starts at today so this is unreachable in practice; a null label is the safe shape for a state the component cannot otherwise describe.
- [ ] **Step 4: Run tests, verify baseline, commit** — `git commit -m "fix(reminders): no relative label on a past-dated reminder"`

### Task 14: Stop one test leaking a queued mock into the next

**Files:** Modify `app/api/cron/digest/route.test.ts`.

- [ ] **Step 1: Prove the leak** — run the file with `npx vitest run app/api/cron/digest/route.test.ts --sequence.shuffle`. Expected: a failure that does not occur in declaration order. If shuffle does not reproduce it, find the `mockResolvedValueOnce` whose queue outlives its test (`vi.clearAllMocks()` clears calls, not queued once-values) and prove it by reordering the two tests by hand.
- [ ] **Step 2: Fix** — replace `afterEach(() => vi.clearAllMocks())` with `afterEach(() => vi.resetAllMocks())` in this file, restoring any default implementations the reset drops inside a `beforeEach`. Prefer this over draining the queue by hand: it fixes the class, not the instance.
- [ ] **Step 3: Verify** — run the file shuffled three times; all green each time. Then the full baseline.
- [ ] **Step 4: Commit** — `git commit -m "test(digest): stop a queued mock bleeding into the next test"`

### Task 15: Test the two `isIosWithoutInstall` branches that decide whether an iPhone works

**Files:** Modify `components/account/device-state.ts` only if needed; test `components/account/device-state.test.ts`.

- [ ] **Step 1: Write the failing tests** — four cases, stubbing `navigator.userAgent`, `navigator.platform`, `navigator.maxTouchPoints`, `window.matchMedia` and `navigator.standalone`: an iPhone in a Safari tab → `true`; the same iPhone with `display-mode: standalone` → `false`; an iPad reporting `MacIntel` with `maxTouchPoints > 1`, not installed → `true`; a real Mac (`MacIntel`, `maxTouchPoints: 0`) → `false`.
- [ ] **Step 2: Run them.** Expected: they may already pass — that is fine, the point is that the branches become covered. If any fails, the function is wrong and the test is right; fix the function.
- [ ] **Step 3: Verify baseline, commit** — `git commit -m "test(devices): pin the two branches that decide if an iPhone can subscribe"`

### Task 16: A failed release must not be retried as if it succeeded

**Files:** Modify `lib/digest-dispatch.ts` (`releaseClaim` `:550-556` and the outer catch `:616+`); test `lib/digest-dispatch.test.ts`.

- [ ] **Step 1: Write the failing test** — make `digestDispatchDeleteMock` reject, drive `dispatchDigest` down the empty path, and assert `delete` was attempted exactly once.
- [ ] **Step 2: Run it.** Expected: FAIL — called twice, because `claimed` is still `true` when the outer catch runs.
- [ ] **Step 3: Implement** — set `claimed = false` *before* awaiting the delete, or wrap the delete in its own try/catch that logs and leaves `claimed` false. Comment: a failed delete is not a successful one and cannot re-open the slot; retrying it inside the handler for its own failure just fails twice and hides the first error.
- [ ] **Step 4: Run tests, verify baseline, commit** — `git commit -m "fix(digest): don't re-attempt a delete that already failed"`

### Task 17: No Alarm beats an Alarm at the wrong hour

**Files:** Modify `app/api/calendar/[token]/route.ts`; test `app/api/calendar/[token]/route.test.ts`.

- [ ] **Step 1: Write the failing test** — an Accommodation whose Stop is rough (`arriveDate: null`, so it is excluded by the route's `arriveDate: { not: null }` filter and resolves to UTC). Assert the emitted `VEVENT` carries **no** `VALARM`, and that the event itself is still published.
- [ ] **Step 2: Run it.** Expected: FAIL — a `VALARM` is emitted and fires at 08:00Z.
- [ ] **Step 3: Implement** — skip the check-out Alarm when the owning Stop has no known timezone. Comment: TEEPEE cannot know whether an Alarm fired (CONTEXT.md **Alarm**), so an Alarm at a confidently wrong hour is worse than none — the traveller trusts it and is woken at the wrong time, or misses the check-out entirely.
- [ ] **Step 4: Run tests, verify baseline, commit** — `git commit -m "fix(calendar): skip a check-out alarm when the stop has no timezone"`

### Task 18: Pin the itinerary gate's trailing `+1`

**Files:** Test only — `lib/digest-dispatch.test.ts`.

- [ ] **Step 1: Write the test** that would fail if the `+1` at `lib/digest-dispatch.ts:117` were removed: a return leg departing the day *after* the last Stop's depart date (so `targetDate === addDays(tripEnd, 1)`), asserted to appear in the evening Digest.
- [ ] **Step 2: Prove it pins the line** — temporarily change `addDays(tripEnd!, 1)` to `tripEnd!`, re-run, confirm the new test fails, then put the `+1` back.
- [ ] **Step 3: Extend the comment** at `:104-111` to give the trailing `+1` the same justification the leading `-1` already has: `endDate` is the last Stop's *depart* date, and the Home base is not a Stop, so a return leg scheduled after the last Stop's departure falls outside a gate closed on `endDate` — the same hole as the outbound case, at the other end of the trip.
- [ ] **Step 4: Verify baseline, commit** — `git commit -m "test(digest): pin the itinerary gate's trailing day, and say why it's there"`

### Task 19: One access check per request instead of two

**Files:** Modify `lib/guards.ts:28`; test `lib/guards.test.ts`.

- [ ] **Step 1: Write the failing test** — call `requireTripAccess("trip-1")` twice in one test and assert `tripMemberFindManyMock` was called once.
- [ ] **Step 2: Run it.** Expected: FAIL — called twice.
- [ ] **Step 3: Implement** — wrap the function body in React's `cache()`:

```ts
import { cache } from "react";

/**
 * Memoised per request with React `cache()`. Trip Home calls this twice — once
 * for the page, once inside `listRemindersForTrip` — and that defence in depth
 * is worth keeping; paying for it with two round trips on the most-hit page is
 * not. Keyed by tripId, so different trips do not share an answer.
 *
 * One caveat: a server action that CHANGES membership and then re-checks it
 * inside the same request would read the memoised answer. Nothing does that
 * today; if something ever needs to, it must not go through this function.
 */
export const requireTripAccess = cache(async (tripId: string) => {
  /* body unchanged */
});
```

- [ ] **Step 4: Run the full suite.** Any test calling `requireTripAccess` twice with the same id and asserting two DB reads is now asserting the superseded behaviour — update it with a comment, do not delete it.
- [ ] **Step 5: Verify baseline, commit** — `git commit -m "perf(guards): memoise requireTripAccess per request"`

### Task 20: Make the access-order assertions able to fail

75 assertions across 28 files assert that `requireTripAccess` was *called*, not that it was called *before* the write — so they would stay green if auth moved below the mutation.

**Files:** Create `test/helpers/access-order.ts` and `test/helpers/access-order.test.ts`; modify the 28 test files.

- [ ] **Step 1: Write the helper's own failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "./access-order";

describe("expectAccessCheckedBeforeWrite", () => {
  it("passes when access ran first", () => {
    const access = vi.fn(); const write = vi.fn();
    access(); write();
    expect(() => expectAccessCheckedBeforeWrite(access, write)).not.toThrow();
  });

  it("FAILS when the write ran first — the whole point", () => {
    const access = vi.fn(); const write = vi.fn();
    write(); access();
    expect(() => expectAccessCheckedBeforeWrite(access, write)).toThrow(/before/i);
  });

  it("fails when access was never called at all", () => {
    const access = vi.fn(); const write = vi.fn();
    write();
    expect(() => expectAccessCheckedBeforeWrite(access, write)).toThrow(/never/i);
  });
});
```

- [ ] **Step 2: Run it.** Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { expect, type Mock } from "vitest";

/**
 * Assert the access guard ran BEFORE the write.
 *
 * The pattern this replaces asserted only that `requireTripAccess` was called,
 * which stays green if the guard moves below the mutation — i.e. the test
 * cannot fail for the thing it is named after. Auth ordering is the one class
 * of bug where there is no second chance, so the assertion has to be about
 * order.
 *
 * `mock.invocationCallOrder` is Vitest's monotonically increasing per-call
 * sequence, shared across all mocks, which is what makes cross-mock ordering
 * checkable at all.
 */
export function expectAccessCheckedBeforeWrite(access: Mock, write: Mock): void {
  const accessOrder = access.mock.invocationCallOrder[0];
  const writeOrder = write.mock.invocationCallOrder[0];
  expect(accessOrder, "the access guard was never called").toBeDefined();
  expect(writeOrder, "the write was never called").toBeDefined();
  expect(
    accessOrder < writeOrder,
    `expected the access guard to run before the write, but it ran after ` +
      `(guard #${accessOrder}, write #${writeOrder})`,
  ).toBe(true);
}
```

- [ ] **Step 4: Run to verify it passes.** `npx vitest run test/helpers/access-order.test.ts`

- [ ] **Step 5: Find every site**

Run: `grep -rn "requireTripAccessMock\|requireItemAccessMock" --include=*.test.ts server/ app/ lib/ | grep -i "toHaveBeenCalled"` and list the files. Expect ~28.

- [ ] **Step 6: Convert them, one file per commit**

For each file, replace assertions of the shape `expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1")` — where the test also exercises a write — with the existing assertion **plus** `expectAccessCheckedBeforeWrite(requireTripAccessMock, <the write mock>)`. Keep the original `toHaveBeenCalledWith` where it pins the *argument*; the new helper pins the *order*, and both matter.

Where a test exercises no write (a pure read action), leave it alone and note why in the commit body.

**After converting each file, run that file's tests.** A file whose action genuinely checks access after the write has found a real bug — stop, report it, do not "fix" the test.

- [ ] **Step 7: Verify the whole baseline**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green, and the total test count should have grown by roughly the number of converted assertions.

- [ ] **Step 8: Final commit**

```bash
git commit -m "test: assert the access guard runs before the write, not merely that it ran"
```

---

## Self-review notes

**Spec coverage.** Changeover day union → Task 1. Owner marker → Task 2. Re-file rule → Task 3. Wishlist copy-in `stopId` → Task 4 (no backfill: production has 7 dated Items, 0 affected). `POST /api/push` + session requirement → Tasks 5-6. `pushsubscriptionchange` → Task 7. One zone per person → Task 8. `resolveTripZone` from the device zone → Task 9. Line reorder + checklist cap → Task 10. MORNING discarded queries → Task 11. Cron heartbeat on Account → Task 12. The seven remaining smaller items → Tasks 13-20. Follow-up item 4 needed no task: `DeviceSync` already mounts in `app/(app)/layout.tsx:71`.

**Type consistency.** `resolveOwningStop` has one signature, defined in Task 3 and consumed by Task 4. `groupScheduledItemsByStop` returns `Map<string, StopDayItem[]>`, matching the `dayItemsByStopId` prop `itinerary-manager.tsx:188` already declares. `zone` is threaded as an optional `string` through `dispatchDigest` → `collectDigestInput` → `resolveTripZone` in Tasks 8-9, optional so the forced test-send path is untouched.

**Known ordering dependency.** Task 8 adds `zone` to the `dispatchDigest` call and Task 9 adds the parameter that receives it. Doing 9 before 8 keeps every intermediate commit type-clean; doing 8 first leaves one commit where `tsc` complains about an unknown property. Prefer 9 then 8, or do both before running the baseline.

**What cannot be verified here.** Nothing in Phases B, C or D can be proven in this sandbox: there is no Postgres, no Docker, and no device. Every test is against a mocked database. The first real proof of the push and Digest work is a test send from the installed iPhone after deploy, and the first proof of the heartbeat is the Account page reading a real timestamp. Do not report any of it as working — report it as tested.
