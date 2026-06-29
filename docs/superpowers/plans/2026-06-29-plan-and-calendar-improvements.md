# Plan-mode fixes + calendar polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four independent improvements to trip planning — make the Hard end date truly optional, link a stop to a chapter when you create the chapter from it, add a one-click "date the whole trip from the start", and make the month calendar lead with the place you're in.

**Architecture:** All four are surgical changes to existing modules. #1 is a Zod schema fix. #2 adds an optional `originStopId` to `createChapter`. #3 adds a pure planner (`planTripFirmUp`) to `lib/firm-up.ts` plus a thin `firmUpTrip` server action that reuses the existing flow engine, wired to a header button. #4 redesigns the month-grid day cell. No schema/migration changes.

**Tech Stack:** Next.js 16 (App Router, RSC), Prisma 7 (Postgres), Zod 4, Vitest + Testing Library.

---

## Background (read before starting)

- **Domain model (ADR 0008/0009):** a Chapter is a coloured date-range band. A **rough** stop (no dates) belongs to a chapter by explicit `chapterId`; a **scheduled** stop (arrive/depart set) belongs by date overlap with the band. `Firm up` = flowing dates forward from an anchor through the stop order, respecting Pinned/scheduled stops as fixed boundaries (`lib/firm-up.ts` `flowDates`).
- **Dated views filter `arriveDate IS NOT NULL`** (share, calendar feed, calendar page) — by design. Undated stops appearing everywhere is *not* a goal; making it one click to date them all (Task 3) is the cure.
- The flow engine `flowDates(stops, anchor)` and `computeProjectedEnd` already exist and are pure; Task 3 adds a sibling pure function in the same style.

---

## Task 1: Hard end date (and all trip dates) optional to save

**Problem:** `lib/validations/trip.ts` validates each date with `isoDate.optional()`. `.optional()` only accepts `undefined`, but a blank `<input type="date">` submits `""`, which fails the regex — so saving Trip Settings with a blank Hard end date is rejected. `updateTrip` already maps `undefined ?? null` to the DB, so the only fix is making the validator treat `""` as "no date".

**Files:**
- Test: `lib/validations/trip.test.ts` (create if absent)
- Modify: `lib/validations/trip.ts`

- [ ] **Step 1: Write the failing test**

Create/append `lib/validations/trip.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tripSchema } from "./trip";

const base = { name: "Trip", homeCurrency: "AUD" };

describe("tripSchema — blank dates are optional", () => {
  it("accepts a blank hard end date (treats it as no date)", () => {
    const r = tripSchema.safeParse({ ...base, startDate: "2026-07-01", endDate: "2026-07-10", hardEndDate: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.hardEndDate).toBeUndefined();
  });

  it("accepts blank start and end dates (a date-less trip)", () => {
    const r = tripSchema.safeParse({ ...base, startDate: "", endDate: "", hardEndDate: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.startDate).toBeUndefined();
      expect(r.data.endDate).toBeUndefined();
    }
  });

  it("still accepts a real hard end date", () => {
    const r = tripSchema.safeParse({ ...base, startDate: "2026-07-01", endDate: "2026-07-10", hardEndDate: "2026-07-15" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.hardEndDate).toBe("2026-07-15");
  });

  it("still rejects a malformed non-empty date", () => {
    const r = tripSchema.safeParse({ ...base, hardEndDate: "2026-7-1" });
    expect(r.success).toBe(false);
  });

  it("still enforces hard end date on or after start date", () => {
    const r = tripSchema.safeParse({ ...base, startDate: "2026-07-10", hardEndDate: "2026-07-01" });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/validations/trip.test.ts`
Expected: the "accepts a blank hard end date" / "accepts blank start and end dates" tests FAIL (current schema rejects `""`).

- [ ] **Step 3: Implement the fix**

In `lib/validations/trip.ts`, replace the `isoDate` constant (line 4) and the three date fields. The new `optionalIsoDate` maps `""`/`null` → `undefined` before validating, so blank means "no date":

```ts
import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currencies";

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

/** A YYYY-MM-DD date that is optional: a blank string (from an empty date input) is treated as "no date". */
const optionalIsoDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  isoDateString.optional(),
);

export const createTripSchema = z
  .object({
    name: z.string().trim().min(1, "Trip name is required").max(120, "Trip name must be 120 characters or fewer"),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    hardEndDate: optionalIsoDate,
    homeCurrency: z.enum(CURRENCY_CODES as [string, ...string[]], { error: "Please select a valid currency" }),
  })
  .refine((d) => d.startDate == null || d.endDate == null || d.endDate >= d.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  })
  .refine((d) => d.startDate == null || d.hardEndDate == null || d.hardEndDate >= d.startDate, {
    message: "Hard end date must be on or after the start date",
    path: ["hardEndDate"],
  });

export type CreateTripInput = z.infer<typeof createTripSchema>;
export const tripSchema = createTripSchema;
export type TripInput = z.infer<typeof tripSchema>;
```

No change is needed in `server/actions/trips.ts` — `updateTrip` already writes `hardEndDate ?? null` (etc.), so a blank field now persists as `null` (clearing works).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/validations/trip.test.ts components/trip/settings/trip-details-form.test.tsx`
Expected: PASS — schema tests green, and the existing form test (which still submits `hardEndDate: ""`) stays green.

- [ ] **Step 5: Commit**

```bash
git add lib/validations/trip.ts lib/validations/trip.test.ts
git commit -m "fix(trips): treat blank start/end/hard-end dates as optional (persist null)"
```

---

## Task 2: Creating a chapter from a stop links that stop

**Problem:** "Start a chapter here" copies the stop's dates into the new chapter but never sets the stop's `chapterId`, so a rough stop stays ungrouped. Fix: thread the originating stop id to `createChapter`, which links a **rough** origin stop atomically (scheduled stops are already covered by the date band).

**Files:**
- Test: `server/actions/chapters.test.ts` (create if absent)
- Modify: `server/actions/chapters.ts` (`createChapter`)
- Modify: `components/trip/chapter-form-dialog.tsx`
- Modify: `components/trip/itinerary-manager.tsx`

- [ ] **Step 1: Write the failing test**

Create/append `server/actions/chapters.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CHAPTER_COLOURS } from "@/lib/chapter-colours";

const {
  requireTripAccessMock,
  chapterCreateMock,
  chapterFindManyMock,
  chapterCountMock,
  stopFindUniqueMock,
  stopUpdateMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn(),
  chapterCreateMock: vi.fn(),
  chapterFindManyMock: vi.fn(),
  chapterCountMock: vi.fn(),
  stopFindUniqueMock: vi.fn(),
  stopUpdateMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/actions/activity", () => ({ recordActivity: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    chapter: { create: chapterCreateMock, findMany: chapterFindManyMock, count: chapterCountMock, findUnique: vi.fn() },
    stop: { findUnique: stopFindUniqueMock, update: stopUpdateMock },
  },
}));

import { createChapter } from "./chapters";

const COLOUR = CHAPTER_COLOURS[0].value;

beforeEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } });
  chapterCreateMock.mockResolvedValue({ id: "ch-new", name: "France" });
  chapterCountMock.mockResolvedValue(0);
});

describe("createChapter — origin stop linking", () => {
  it("links a ROUGH origin stop to the new chapter", async () => {
    stopFindUniqueMock.mockResolvedValue({ tripId: "trip-1", arriveDate: null });

    const r = await createChapter("trip-1", { name: "France", colour: COLOUR }, "stop-1");

    expect(r.success).toBe(true);
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "stop-1" },
      data: { chapterId: "ch-new", chapterSortOrder: 0 },
    });
  });

  it("does NOT link a SCHEDULED origin stop (covered by the date band)", async () => {
    stopFindUniqueMock.mockResolvedValue({ tripId: "trip-1", arriveDate: "2026-07-01" });

    const r = await createChapter("trip-1", { name: "France", colour: COLOUR }, "stop-1");

    expect(r.success).toBe(true);
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("creates a chapter with no linking when no origin stop is given", async () => {
    const r = await createChapter("trip-1", { name: "France", colour: COLOUR });

    expect(r.success).toBe(true);
    expect(stopFindUniqueMock).not.toHaveBeenCalled();
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/actions/chapters.test.ts`
Expected: FAIL — `createChapter` does not yet accept a third argument or call `stop.update`.

- [ ] **Step 3: Implement `createChapter` linking**

In `server/actions/chapters.ts`, change the `createChapter` signature and add the linking step. Replace the whole function (currently lines 81-101):

```ts
export async function createChapter(
  tripId: string,
  input: ChapterInput,
  originStopId?: string,
): Promise<ChapterActionResult> {
  await requireTripAccess(tripId);

  const parsed = chapterSchema.safeParse(input);
  if (!parsed.success) return validationErrors(parsed.error);

  if (await firstOverlap(tripId, parsed.data)) {
    return { success: false, errors: { startDate: ["Chapters cannot overlap another chapter's dates"] } };
  }

  const created = await db.chapter.create({
    data: { tripId, ...parsed.data, sortOrder: await nextSortOrder(tripId) },
  });

  // When created from a stop ("Start a chapter here"), link a ROUGH origin
  // stop to the new chapter (explicit membership while sketching, ADR 0009).
  // A scheduled stop is already covered by the chapter's date band, so we
  // leave its chapterId alone. The new chapter has no stops yet → sortOrder 0.
  if (originStopId) {
    const origin = await db.stop.findUnique({
      where: { id: originStopId },
      select: { tripId: true, arriveDate: true },
    });
    if (origin && origin.tripId === tripId && origin.arriveDate === null) {
      await db.stop.update({
        where: { id: originStopId },
        data: { chapterId: created.id, chapterSortOrder: 0 },
      });
    }
  }

  await recordActivity({ tripId, verb: "CREATED", entityType: "CHAPTER", entityId: created.id, entityLabel: entityLabel("CHAPTER", created as unknown as Record<string, unknown>) });
  revalidateChapterPaths(tripId);
  return { success: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/actions/chapters.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Thread `originStopId` through the dialog**

In `components/trip/chapter-form-dialog.tsx`:

(a) Add to `ChapterFormDialogProps` (after `defaultEnd?: string;` at line 51):

```ts
  /** When creating from a stop, the originating stop's id — linked to the new chapter if rough. */
  originStopId?: string;
```

(b) Destructure it in `ChapterFormDialog` params (add `originStopId,` to the list at lines 60-68) and pass it to `<ChapterForm ... originStopId={originStopId} />` (in the JSX at lines 81-89).

(c) Add `originStopId?: string;` to the `ChapterFormProps` interface (after `defaultEnd?: string;` at line 105) and add `originStopId,` to the `ChapterForm` destructured params (lines 108-115).

(d) In `ChapterForm`'s `handleSubmit`, pass it to `createChapter` (line 149):

```ts
      const result =
        isEdit && chapter
          ? await updateChapter(chapter.id, input)
          : await createChapter(tripId, input, originStopId);
```

- [ ] **Step 6: Pass the originating stop id from the itinerary manager**

In `components/trip/itinerary-manager.tsx`:

(a) Extend the chapter-dialog defaults state (lines 310-313) to carry the stop id:

```ts
  const [chapterDialogDefaults, setChapterDialogDefaults] = React.useState<{
    defaultStart?: string;
    defaultEnd?: string;
    originStopId?: string;
  }>({});
```

(b) In `handleStartChapterHere` (lines 425-431), record the origin stop id:

```ts
  function handleStartChapterHere(stop: StopCardStop) {
    setChapterDialogDefaults({
      defaultStart: stop.arriveDate ?? undefined,
      defaultEnd: stop.departDate ?? undefined,
      originStopId: stop.id,
    });
    setChapterDialogOpen(true);
  }
```

(`handleNewChapter` already sets `{}`, so the plain "New chapter" path passes no origin — correct.)

(c) Find where `<ChapterFormDialog` is rendered in this file (it is passed `tripId`, `open={chapterDialogOpen}`, `defaultStart={chapterDialogDefaults.defaultStart}`, `defaultEnd={chapterDialogDefaults.defaultEnd}`). Add the prop:

```tsx
          originStopId={chapterDialogDefaults.originStopId}
```

- [ ] **Step 7: Typecheck, lint, full test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean; no new lint issues in the three files; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add server/actions/chapters.ts server/actions/chapters.test.ts components/trip/chapter-form-dialog.tsx "components/trip/itinerary-manager.tsx"
git commit -m "fix(chapters): link the originating rough stop when creating a chapter from it"
```

---

## Task 3: One-click "Date all stops from start" (whole-trip firm up)

**Problem:** Firm up only runs per-chapter/per-section. Add a single action that dates every rough stop across the whole trip from the start date, respecting scheduled/Pinned stops as fixed boundaries. Split into a pure planner (unit-tested) + a thin server action + a header button.

**Files:**
- Modify: `lib/firm-up.ts` (add `planTripFirmUp`)
- Test: `lib/firm-up.test.ts` (add a describe block; create file if absent)
- Modify: `server/actions/stops.ts` (add `firmUpTrip`)
- Test: `server/actions/firm-up-trip.test.ts` (create)
- Modify: `components/trip/itinerary-manager.tsx` (button + handler)

- [ ] **Step 1: Write the failing pure-planner test**

Append to `lib/firm-up.test.ts` (create the file with the import if it doesn't exist):

```ts
import { describe, it, expect } from "vitest";
import { planTripFirmUp, type TripFirmUpStop } from "./firm-up";

function rough(id: string, sortOrder: number, nights: number): TripFirmUpStop {
  return { id, sortOrder, nights, pinned: false, arriveDate: null, departDate: null };
}
function scheduled(id: string, sortOrder: number, arriveDate: string, departDate: string, pinned = false): TripFirmUpStop {
  return { id, sortOrder, nights: null, pinned, arriveDate, departDate };
}

describe("planTripFirmUp", () => {
  it("dates all rough stops in order from the anchor", () => {
    const { results, conflicts } = planTripFirmUp([rough("a", 0, 3), rough("b", 1, 2)], "2026-07-01");
    expect(conflicts).toEqual([]);
    expect(results).toEqual([
      { id: "a", arriveDate: "2026-07-01", departDate: "2026-07-04" },
      { id: "b", arriveDate: "2026-07-04", departDate: "2026-07-06" },
    ]);
  });

  it("treats a scheduled stop as a fixed boundary and only returns rough stops", () => {
    const { results } = planTripFirmUp(
      [rough("a", 0, 2), scheduled("b", 1, "2026-07-10", "2026-07-12"), rough("c", 2, 1)],
      "2026-07-01",
    );
    // 'a' flows from the anchor; 'c' resumes from b's depart; 'b' (scheduled) is not returned.
    expect(results.map((r) => r.id)).toEqual(["a", "c"]);
    expect(results.find((r) => r.id === "a")).toEqual({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-03" });
    expect(results.find((r) => r.id === "c")).toEqual({ id: "c", arriveDate: "2026-07-12", departDate: "2026-07-13" });
  });

  it("reports a conflict when rough stops overrun a pinned stop (keeps the pin)", () => {
    const { conflicts } = planTripFirmUp(
      [rough("a", 0, 30), scheduled("b", 1, "2026-07-05", "2026-07-07", true)],
      "2026-07-01",
    );
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].stopId).toBe("b");
  });

  it("returns an empty result when there are no rough stops", () => {
    const { results } = planTripFirmUp([scheduled("b", 0, "2026-07-05", "2026-07-07")], "2026-07-01");
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/firm-up.test.ts`
Expected: FAIL — `planTripFirmUp` / `TripFirmUpStop` not exported.

- [ ] **Step 3: Implement the pure planner**

Append to `lib/firm-up.ts` (after `computeProjectedEnd`, end of file). It reuses `flowDates` and mirrors `computeProjectedEnd`'s FlowStop construction (scheduled stops become fixed boundaries):

```ts
export interface TripFirmUpStop {
  id: string;
  sortOrder: number;
  nights: number | null;
  pinned: boolean;
  arriveDate: string | null;
  departDate: string | null;
}

export interface TripFirmUpResult {
  id: string;
  arriveDate: string;
  departDate: string;
}

/**
 * Plan dates for EVERY rough stop across a whole trip in one pass. Scheduled
 * stops (both dates present) are treated as fixed boundaries the flow respects;
 * rough stops flow forward from `anchorDate` using their nights. Returns new
 * dates for the ROUGH stops only (the ones to persist) plus any pin conflicts.
 */
export function planTripFirmUp(
  stops: readonly TripFirmUpStop[],
  anchorDate: string,
): { results: TripFirmUpResult[]; conflicts: FlowConflict[] } {
  const ordered = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);

  // Never let a scheduled stop earlier than the anchor rewind the flow cursor.
  let anchor = anchorDate;
  for (const s of ordered) {
    if (s.arriveDate && s.arriveDate < anchor) anchor = s.arriveDate;
  }

  const roughIds = new Set(ordered.filter((s) => !s.arriveDate).map((s) => s.id));

  const flowStops: FlowStop[] = ordered.map((s) => {
    const scheduled = Boolean(s.arriveDate && s.departDate);
    return {
      id: s.id,
      nights: scheduled
        ? nightsBetween(s.arriveDate as string, s.departDate as string)
        : Math.max(0, s.nights ?? 1),
      pinned: scheduled || s.pinned,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
    };
  });

  const { results, conflicts } = flowDates(flowStops, anchor);
  return {
    results: results
      .filter((r) => roughIds.has(r.id))
      .map((r) => ({ id: r.id, arriveDate: r.arriveDate, departDate: r.departDate })),
    conflicts,
  };
}
```

- [ ] **Step 4: Run the planner test to verify it passes**

Run: `npx vitest run lib/firm-up.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing server-action test**

Create `server/actions/firm-up-trip.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  requireTripAccessMock,
  tripFindUniqueMock,
  stopFindManyMock,
  stopUpdateMock,
  tripUpdateMock,
  chapterUpdateMock,
  geocodeMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn(),
  tripFindUniqueMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  stopUpdateMock: vi.fn(),
  tripUpdateMock: vi.fn(),
  chapterUpdateMock: vi.fn(),
  geocodeMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/actions/activity", () => ({ recordActivity: vi.fn() }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: geocodeMock }));
vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: tripFindUniqueMock, update: tripUpdateMock },
    stop: { findMany: stopFindManyMock, update: stopUpdateMock },
    chapter: { update: chapterUpdateMock },
  },
}));

import { firmUpTrip } from "./stops";

beforeEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } });
  geocodeMock.mockResolvedValue(null);
  stopUpdateMock.mockResolvedValue({});
  tripUpdateMock.mockResolvedValue({});
});

const roughRow = (id: string, sortOrder: number, nights: number) => ({
  id, sortOrder, chapterId: null, nights, pinned: false,
  arriveDate: null, departDate: null, timezone: null, name: `Stop ${id}`, country: null,
});

describe("firmUpTrip", () => {
  it("dates every rough stop from the trip start date and grows the window", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([roughRow("a", 0, 3), roughRow("b", 1, 2)]);

    const r = await firmUpTrip("trip-1");

    expect(r.success).toBe(true);
    expect(stopUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "a" },
      data: expect.objectContaining({ arriveDate: "2026-07-01", departDate: "2026-07-04" }),
    }));
    expect(stopUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "b" },
      data: expect.objectContaining({ arriveDate: "2026-07-04", departDate: "2026-07-06" }),
    }));
    expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "trip-1" },
      data: expect.objectContaining({ endDate: "2026-07-06" }),
    }));
  });

  it("does nothing (success) when there are no rough stops", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: "2026-07-10" });
    stopFindManyMock.mockResolvedValue([
      { id: "x", sortOrder: 0, chapterId: null, nights: null, pinned: false, arriveDate: "2026-07-02", departDate: "2026-07-05", timezone: "UTC", name: "X", country: null },
    ]);

    const r = await firmUpTrip("trip-1");

    expect(r.success).toBe(true);
    expect(stopUpdateMock).not.toHaveBeenCalled();
  });

  it("errors when the trip has no anchor (no start date, no scheduled stop)", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: null, endDate: null });
    stopFindManyMock.mockResolvedValue([roughRow("a", 0, 2)]);

    const r = await firmUpTrip("trip-1");

    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.anchorDate?.[0]).toMatch(/start date/i);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run server/actions/firm-up-trip.test.ts`
Expected: FAIL — `firmUpTrip` not exported.

- [ ] **Step 7: Implement `firmUpTrip`**

In `server/actions/stops.ts`: add `planTripFirmUp` to the `@/lib/firm-up` import (line 9 currently imports `flowDates, computeProjectedEnd, type FlowStop, type FlowConflict`):

```ts
import { flowDates, computeProjectedEnd, planTripFirmUp, type FlowStop, type FlowConflict } from "@/lib/firm-up";
```

Then add this function immediately after `firmUpSegment` (after line 538):

```ts
// ---------------------------------------------------------------------------
// firmUpTrip — date EVERY rough stop across the whole trip in one action
// ---------------------------------------------------------------------------

/**
 * Date every rough stop across the whole trip, flowing from the trip start date
 * (or a caller anchor, or the earliest scheduled arrival) in stop order.
 * Scheduled and Pinned stops are fixed boundaries it flows around; conflicts are
 * surfaced (pins are never overwritten). Grows the trip window and brings each
 * chapter's band onto its now-dated stops. Best-effort geocode per dated stop.
 */
export async function firmUpTrip(tripId: string, anchorDate?: string): Promise<StopActionResult> {
  await requireTripAccess(tripId);

  const [trip, stops] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true, endDate: true } }),
    db.stop.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, sortOrder: true, chapterId: true, nights: true, pinned: true,
        arriveDate: true, departDate: true, timezone: true, name: true, country: true,
      },
    }),
  ]);

  const rough = stops.filter((s) => !s.arriveDate);
  if (rough.length === 0) {
    revalidatePath(`/trips/${tripId}`);
    return { success: true };
  }

  const earliestScheduled = stops.reduce<string | null>(
    (min, s) => (s.arriveDate && (min === null || s.arriveDate < min) ? s.arriveDate : min),
    null,
  );
  const anchor = trip?.startDate ?? anchorDate ?? earliestScheduled ?? null;
  if (!anchor) {
    return { success: false, errors: { anchorDate: ["Set a start date for the trip first."] } };
  }

  const { results, conflicts } = planTripFirmUp(stops, anchor);

  const tripTz = stops.find((s) => s.timezone)?.timezone ?? "UTC";
  const stopById = Object.fromEntries(stops.map((s) => [s.id, s]));
  for (const r of results) {
    const s = stopById[r.id];
    const coords = await geocodePlace([s.name, s.country].filter(Boolean).join(", "));
    await db.stop.update({
      where: { id: r.id },
      data: {
        arriveDate: r.arriveDate,
        departDate: r.departDate,
        timezone: s.timezone ?? tripTz,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      },
    });
  }

  // Merge freshly-dated rough stops with already-scheduled stops for window +
  // chapter-span computation.
  const datedById = new Map<string, { arriveDate: string; departDate: string }>();
  for (const s of stops) {
    if (s.arriveDate && s.departDate) datedById.set(s.id, { arriveDate: s.arriveDate, departDate: s.departDate });
  }
  for (const r of results) datedById.set(r.id, { arriveDate: r.arriveDate, departDate: r.departDate });

  // Grow the trip window: never shrink endDate; only set startDate when it was null.
  let maxDepart = anchor;
  for (const d of datedById.values()) if (d.departDate > maxDepart) maxDepart = d.departDate;
  const newStart = trip?.startDate ?? anchor;
  const newEnd = !trip?.endDate || trip.endDate < maxDepart ? maxDepart : trip.endDate;
  if (newStart !== trip?.startDate || newEnd !== trip?.endDate) {
    await db.trip.update({ where: { id: tripId }, data: { startDate: newStart, endDate: newEnd } });
  }

  // Bring each chapter's band onto its now-dated stops, so a rough chapter
  // becomes an ordinary date range (ADR 0009) rather than dated-stops-in-a-rough-band.
  const chapterIds = [...new Set(stops.map((s) => s.chapterId).filter((c): c is string => Boolean(c)))];
  for (const chId of chapterIds) {
    const spanStops = stops.filter((s) => s.chapterId === chId && datedById.has(s.id));
    if (spanStops.length === 0) continue;
    let start = datedById.get(spanStops[0].id)!.arriveDate;
    let end = datedById.get(spanStops[0].id)!.departDate;
    for (const s of spanStops) {
      const d = datedById.get(s.id)!;
      if (d.arriveDate < start) start = d.arriveDate;
      if (d.departDate > end) end = d.departDate;
    }
    await db.chapter.update({ where: { id: chId }, data: { startDate: start, endDate: end } });
  }

  await recordActivity({
    tripId,
    verb: "UPDATED",
    entityType: "STOP",
    entityId: rough[0].id,
    entityLabel: rough[0].name ?? "",
    changes: { summary: `Dated ${rough.length} ${rough.length === 1 ? "stop" : "stops"} from ${formatLongDate(anchor)}` },
  });

  revalidatePath(`/trips/${tripId}`);
  return { success: true, conflicts };
}
```

- [ ] **Step 8: Run the server-action test to verify it passes**

Run: `npx vitest run server/actions/firm-up-trip.test.ts`
Expected: PASS (3/3).

- [ ] **Step 9: Wire the button into the itinerary header**

In `components/trip/itinerary-manager.tsx`:

(a) Add `firmUpTrip` to the `@/server/actions/stops` import (the block at lines 24-32):

```ts
import {
  deleteStop,
  moveStop,
  toggleStopPin,
  makeStopRough,
  firmUpSegment,
  firmUpTrip,
  setStopDates,
  reorderStops,
} from "@/server/actions/stops";
```

(b) Add a handler next to `handleFirmUp` (after line 400):

```ts
  // Date every rough stop across the whole trip from the start date, in one action.
  async function handleFirmUpTrip() {
    setPendingId("firm-up-trip");
    try {
      const r = await firmUpTrip(tripId);
      if (!r.success) {
        toast({
          variant: "destructive",
          title: r.errors.anchorDate?.[0] ?? "Set a start date for the trip first.",
        });
      } else if (r.conflicts?.length) {
        toast({ title: "Heads up — some stops run past a pinned date; the pins were kept." });
      }
    } finally {
      setPendingId(null);
    }
  }
```

(c) Find the itinerary header controls row — the one that renders the "New chapter" button wired to `handleNewChapter` (search `handleNewChapter`). Add, adjacent to it, a button shown only when there are rough stops. `CalendarClock` is already imported at the top of the file:

```tsx
              {stops.some((s) => s.arriveDate === null) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFirmUpTrip}
                  loading={pendingId === "firm-up-trip"}
                >
                  <CalendarClock className="size-4" aria-hidden="true" />
                  Date all stops from start
                </Button>
              )}
```

(Place it inside the same flex container as the existing New-chapter / Add-stop controls so it sits in the header. This contextual placement — visible exactly when undated stops exist — is the "nudge".)

- [ ] **Step 10: Typecheck, lint, full test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean; no new lint issues; all tests pass (including the two new test files).

- [ ] **Step 11: Commit**

```bash
git add lib/firm-up.ts lib/firm-up.test.ts server/actions/stops.ts server/actions/firm-up-trip.test.ts "components/trip/itinerary-manager.tsx"
git commit -m "feat(plan): one-click 'Date all stops from start' (whole-trip firm up)"
```

---

## Task 4: Month-grid day cell leads with the stop location

**Problem:** The month calendar shows item titles but the place you're in is only a thin colored border. Make each in-window day cell lead with the stop name (+ country), centered, on every day of the stop; collapse activities to a small count; keep the status icons, colored band, and click-through to the day detail. The Agenda view already shows the location and is untouched.

**Files:**
- Test: `components/trip/month-grid.test.tsx` (create)
- Modify: `components/trip/month-grid.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/trip/month-grid.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonthGrid } from "./month-grid";
import type { DayPlan } from "@/lib/itinerary";

function dayPlan(dateISO: string, itemCount: number): DayPlan {
  const stop = {
    id: "s1", name: "Paris", country: "France", timezone: "Europe/Paris",
    arriveDate: "2026-07-14", departDate: "2026-07-15", sortOrder: 0,
  };
  const timedItems = Array.from({ length: itemCount }, (_, i) => ({
    kind: "item" as const,
    item: { id: `i${i}`, title: `Item ${i}`, category: "sightseeing" },
  }));
  return { dateISO, stop, timedItems, untimedItems: [], transportEntries: [], accommodationEntries: [] };
}

describe("MonthGrid — location hero", () => {
  it("shows the stop name on every in-window day of the stop", () => {
    render(
      <MonthGrid
        tripId="t1"
        monthAnchorISO="2026-07-01"
        days={[dayPlan("2026-07-14", 2), dayPlan("2026-07-15", 0)]}
        tripStart="2026-07-14"
        tripEnd="2026-07-15"
      />,
    );
    expect(screen.getAllByText("Paris").length).toBeGreaterThanOrEqual(2);
  });

  it("collapses activities to a count instead of listing item titles", () => {
    render(
      <MonthGrid
        tripId="t1"
        monthAnchorISO="2026-07-01"
        days={[dayPlan("2026-07-14", 2)]}
        tripStart="2026-07-14"
        tripEnd="2026-07-14"
      />,
    );
    expect(screen.getByText(/2 things/)).toBeInTheDocument();
    expect(screen.queryByText("Item 0")).not.toBeInTheDocument();
  });

  it("shows no location on a gap day", () => {
    render(
      <MonthGrid tripId="t1" monthAnchorISO="2026-07-01" days={[]} tripStart="2026-07-14" tripEnd="2026-07-14" />,
    );
    expect(screen.queryByText("Paris")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/trip/month-grid.test.tsx`
Expected: FAIL — the cell currently renders item titles ("Item 0"), not "Paris" / "2 things".

- [ ] **Step 3: Redesign the day cell**

In `components/trip/month-grid.tsx`, replace the `cellInner` definition (currently lines 85-151) with the version below. It keeps the top row (day number + transport/lodging icons + packed dot) and the colored band/Link wrapper untouched, but replaces the item-title `<ul>` with a centered location hero + a compact activity count. `itemCount` is derived from the same `timed`/`untimed` arrays already computed above (lines 78-83):

```tsx
          const itemCount = allItems.length;

          const cellInner = (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs font-semibold",
                    active ? "text-foreground" : "text-muted-foreground/40",
                  )}
                >
                  {dayNum}
                </span>
                <span className="flex items-center gap-0.5">
                  {day?.transportEntries.map((t) => {
                    const Icon = TRANSPORT_MODE_META[t.transport.mode as TransportMode]?.icon ?? Navigation;
                    return (
                      <Icon
                        key={`${t.kind}-${t.transport.id}`}
                        className="size-3 text-muted-foreground"
                        aria-hidden="true"
                      />
                    );
                  })}
                  {day?.accommodationEntries.map((a) =>
                    a.kind === "accommodation-checkin" ? (
                      <LogIn key={`in-${a.accommodation.id}`} className="size-3 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <LogOut key={`out-${a.accommodation.id}`} className="size-3 text-rose-600" aria-hidden="true" />
                    ),
                  )}
                  {packed && (
                    <span
                      className="size-1.5 rounded-full bg-amber-500"
                      title="Busy day"
                      aria-label="Busy day"
                    />
                  )}
                </span>
              </div>

              {day?.stop ? (
                <div className="flex flex-1 flex-col items-center justify-center px-0.5 text-center">
                  <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-foreground">
                    {day.stop.name}
                  </span>
                  {day.stop.country && (
                    <span className="truncate text-[11px] leading-tight text-muted-foreground">
                      {day.stop.country}
                    </span>
                  )}
                  {itemCount > 0 && (
                    <span className="mt-0.5 text-[11px] text-muted-foreground">
                      • {itemCount} {itemCount === 1 ? "thing" : "things"}
                    </span>
                  )}
                </div>
              ) : itemCount > 0 ? (
                <div className="flex flex-1 items-center justify-center">
                  <span className="text-[11px] text-muted-foreground">
                    • {itemCount} {itemCount === 1 ? "thing" : "things"}
                  </span>
                </div>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          );
```

Notes for the implementer:
- Leave the `bandClass`, `cellClasses`, `dropProps`, and the active/inactive return blocks (lines 153-197) **unchanged** — the cell stays a drop target and still links to `/trips/${tripId}/day/${cell.dateISO}`.
- `timed`, `untimed`, `allItems`, `visible`, `overflow`, `packed` are computed above. `visible`/`overflow` and `MAX_VISIBLE_ITEMS` become unused once the `<ul>` is gone — remove `visible`, `overflow`, and the `MAX_VISIBLE_ITEMS` constant to keep lint clean. Keep `allItems` (used for `itemCount`) and `packed`.
- Per-item drag-to-reschedule within the month view is intentionally dropped (no item chips to drag); the drop target is retained. Drag-reschedule remains in the Agenda/day views.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/trip/month-grid.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Typecheck, lint, full test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean; no unused-variable lint errors (confirm `MAX_VISIBLE_ITEMS`/`visible`/`overflow` were removed); all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/trip/month-grid.tsx components/trip/month-grid.test.tsx
git commit -m "feat(calendar): month-grid day leads with the stop location"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** #3 hard end date → Task 1 (all three date fields, blank→null via `updateTrip`'s existing `?? null`); #1 chapter link → Task 2 (option A, server-side `originStopId`, rough-only); #2 firm-up-all → Task 3 (pure `planTripFirmUp` + `firmUpTrip` + contextual header button = the "nudge"); #5 calendar hero → Task 4 (month grid only, every day, count, click-through preserved; Agenda untouched); #4 → resolved by Task 3 (no code). All covered.
- **Placeholder scan:** none — every code step shows complete code and exact commands. The two "find the … render/header" steps name the exact symbol to search for (`<ChapterFormDialog`, `handleNewChapter`) and the exact JSX to add.
- **Type/name consistency:** `createChapter(tripId, input, originStopId?)` used identically in Task 2 action + dialog; `planTripFirmUp`/`TripFirmUpStop`/`TripFirmUpResult` defined in Task 3 Step 3 and consumed in Step 7 + tests; `firmUpTrip(tripId, anchorDate?)` signature matches its test and handler; `DayPlan`/`ItineraryStop` fields (`stop.name`, `stop.country`, `timedItems`/`untimedItems`) match `lib/itinerary.ts`.
- **Trade-off flagged:** Task 4 drops per-item drag within the month view (items collapse to a count); recorded in the step notes and to be surfaced to the user.
