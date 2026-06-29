# Plan Overview + Hard End Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a status overview to the top of the Plan page (stops / nights / dates) and an optional **Hard end date** that raises a Flag — and shows inline — when the trip's projected end nears or passes it.

**Architecture:** A new nullable `Trip.hardEndDate` is the constraint. A pure `computeProjectedEnd` (reusing the `flowDates` firm-up engine) projects every stop's nights forward from the anchor. A pure `summarizePlan` rolls counts/nights/dates + the hard-end state into one model for the overview. A new `flagHardEndDate` rule feeds the existing Flag system (so Summary + Next steps light up too). The overview renders only in normal mode (hidden in Discreet). The date is editable inline on the overview (`setTripHardEndDate`) and in Settings (`updateTrip`). The warning is advisory — it never blocks planning.

**Tech Stack:** Next.js 15 App Router (RSC + server actions), Prisma 7 + Postgres, Zod, React 19, Vitest + Testing Library, Tailwind.

**Domain docs:** See `CONTEXT.md` (Hard end date, Projected end, soft end date) and `docs/adr/0013-hard-end-date-and-projected-end.md`.

**Conventions to follow:**
- Calendar dates are `"YYYY-MM-DD"` strings throughout. Use helpers in `lib/dates.ts` (`nightsBetween`, `daysBetween`, `addDays`, `formatLongDate`) — never raw `Date` math.
- Pure logic lives in `lib/` (no Prisma/React) and is unit-tested. Server actions mock `@/lib/db` + `@/lib/guards`. Run a single test file with `npx vitest run <path>`.
- Lint/typecheck gate: `npm run lint` and `npx tsc --noEmit`. Full suite: `npm test`.

---

### Task 1: Schema — add `Trip.hardEndDate`

**Files:**
- Modify: `prisma/schema.prisma` (Trip model, after `endDate`)
- Create: `prisma/migrations/20260628000000_add_trip_hard_end_date/migration.sql`

- [ ] **Step 1: Add the field to the schema**

In `prisma/schema.prisma`, in `model Trip`, add the line immediately after the `endDate` field:

```prisma
  startDate    String? // "YYYY-MM-DD" — null while the trip is a date-less idea
  endDate      String? // "YYYY-MM-DD" — soft; auto-extends to cover scheduled stops
  hardEndDate  String? // "YYYY-MM-DD" — optional traveller-set ceiling; never auto-extends (see ADR 0013)
  homeCurrency String // ISO 4217, e.g. "AUD"
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260628000000_add_trip_hard_end_date/migration.sql`:

```sql
-- Optional, traveller-set ceiling date. Nullable, no default (existing trips have none).
ALTER TABLE "Trip" ADD COLUMN "hardEndDate" TEXT;
```

- [ ] **Step 3: Regenerate the Prisma client and apply the migration**

Run: `npx prisma generate && npx prisma migrate deploy`
Expected: `prisma generate` succeeds (client now types `Trip.hardEndDate`); `migrate deploy` reports the new migration applied. (If the Postgres container isn't up: `docker compose up -d db` first. `generate` alone is enough for TypeScript to compile downstream tasks.)

- [ ] **Step 4: Verify the schema is valid**

Run: `npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀"

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(plan): add Trip.hardEndDate column"
```

---

### Task 2: Validation + persistence — `hardEndDate` in the trip schema and `updateTrip`

**Files:**
- Modify: `lib/validations/trip.ts`
- Modify: `server/actions/trips.ts:107-112` (updateTrip destructure + update data)
- Test: `lib/validations/trip.test.ts`

- [ ] **Step 1: Write the failing validation tests**

Append inside the existing `describe("createTripSchema", ...)` block in `lib/validations/trip.test.ts`:

```ts
  it("accepts an optional hardEndDate on or after the start date", () => {
    const result = createTripSchema.safeParse({ ...VALID_INPUT, hardEndDate: "2026-07-20" });
    expect(result.success).toBe(true);
  });

  it("accepts input with no hardEndDate", () => {
    const result = createTripSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  it("rejects a hardEndDate before the start date", () => {
    const result = createTripSchema.safeParse({
      ...VALID_INPUT,
      startDate: "2026-07-01",
      hardEndDate: "2026-06-30",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.hardEndDate).toBeDefined();
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/validations/trip.test.ts`
Expected: FAIL — `hardEndDate` is unknown / not validated.

- [ ] **Step 3: Add `hardEndDate` to the schema with a refine**

Replace the body of `createTripSchema` in `lib/validations/trip.ts`:

```ts
export const createTripSchema = z
  .object({
    name: z.string().trim().min(1, "Trip name is required").max(120, "Trip name must be 120 characters or fewer"),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    hardEndDate: isoDate.optional(),
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
```

- [ ] **Step 4: Persist `hardEndDate` in `updateTrip`**

In `server/actions/trips.ts`, update the destructure and the `db.trip.update` data (around lines 107-112):

```ts
  const { name, startDate, endDate, hardEndDate, homeCurrency } = parsed.data;

  await db.trip.update({
    where: { id: tripId },
    data: {
      name,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      hardEndDate: hardEndDate ?? null,
      homeCurrency,
    },
  });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/validations/trip.test.ts server/actions/trips.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/validations/trip.ts lib/validations/trip.test.ts server/actions/trips.ts
git commit -m "feat(plan): validate + persist Trip.hardEndDate"
```

---

### Task 3: `computeProjectedEnd` (projection engine)

**Files:**
- Modify: `lib/firm-up.ts` (add import, `HARD_END_APPROACHING_NIGHTS`, `ProjectionStop`, `computeProjectedEnd`)
- Test: `lib/firm-up.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/firm-up.test.ts` (add `computeProjectedEnd` to the existing import from `./firm-up`):

```ts
import { computeProjectedEnd } from "./firm-up";

describe("computeProjectedEnd", () => {
  const stop = (over: Partial<{ id: string; arriveDate: string | null; departDate: string | null; nights: number | null; pinned: boolean; sortOrder: number }>) => ({
    id: "s", arriveDate: null, departDate: null, nights: null, pinned: false, sortOrder: 0, ...over,
  });

  it("returns null for no stops", () => {
    expect(computeProjectedEnd([], "2026-07-01")).toBeNull();
  });

  it("returns null when there is no anchor and no scheduled stop", () => {
    expect(computeProjectedEnd([stop({ id: "a", nights: 3 })], null)).toBeNull();
  });

  it("flows rough nights forward from the start anchor", () => {
    const stops = [
      stop({ id: "a", nights: 3, sortOrder: 0 }),
      stop({ id: "b", nights: 4, sortOrder: 1 }),
    ];
    // 2026-07-01 + 3 + 4 = 2026-07-08
    expect(computeProjectedEnd(stops, "2026-07-01")).toBe("2026-07-08");
  });

  it("uses scheduled stops' real dates and flows a rough tail after them", () => {
    const stops = [
      stop({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }),
      stop({ id: "b", nights: 2, sortOrder: 1 }), // rough, flows from 07-05
    ];
    expect(computeProjectedEnd(stops, "2026-07-01")).toBe("2026-07-07");
  });

  it("equals the last scheduled depart when nothing is rough", () => {
    const stops = [
      stop({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }),
      stop({ id: "b", arriveDate: "2026-07-05", departDate: "2026-07-09", sortOrder: 1 }),
    ];
    expect(computeProjectedEnd(stops, "2026-07-01")).toBe("2026-07-09");
  });

  it("falls back to the earliest scheduled arrive when no start anchor is given", () => {
    const stops = [stop({ id: "a", arriveDate: "2026-08-10", departDate: "2026-08-14", sortOrder: 0 })];
    expect(computeProjectedEnd(stops, null)).toBe("2026-08-14");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/firm-up.test.ts`
Expected: FAIL — `computeProjectedEnd` is not exported.

- [ ] **Step 3: Implement the projection**

In `lib/firm-up.ts`, change the top import and append the new exports:

```ts
import { addDays, nightsBetween } from "./dates";
```

```ts
/** Nights of remaining slack at/under which the plan is "approaching" the hard end date. */
export const HARD_END_APPROACHING_NIGHTS = 2;

export interface ProjectionStop {
  id: string;
  arriveDate: string | null;
  departDate: string | null;
  nights: number | null;
  pinned: boolean;
  sortOrder: number;
}

/**
 * Project where the trip currently ends: every stop's nights flowed forward
 * from the anchor (rough stops included), reusing flowDates. Scheduled stops
 * keep their real dates (treated as fixed boundaries so gaps are preserved);
 * only rough stops flow. Returns the latest depart date, or null when there's
 * nothing to anchor to (no start date and no scheduled stop).
 */
export function computeProjectedEnd(
  stops: readonly ProjectionStop[],
  anchorDate: string | null,
): string | null {
  if (stops.length === 0) return null;
  const ordered = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);

  let anchor = anchorDate;
  if (!anchor) {
    let earliest: string | null = null;
    for (const s of ordered) {
      if (s.arriveDate && (earliest === null || s.arriveDate < earliest)) earliest = s.arriveDate;
    }
    anchor = earliest;
  }
  if (!anchor) return null;

  const flowStops: FlowStop[] = ordered.map((s) => {
    const scheduled = Boolean(s.arriveDate && s.departDate);
    return {
      id: s.id,
      nights: scheduled
        ? nightsBetween(s.arriveDate as string, s.departDate as string)
        : Math.max(0, s.nights ?? 1),
      // Treat any scheduled stop as a fixed boundary so its real dates/gaps survive.
      pinned: scheduled || s.pinned,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
    };
  });

  const { results } = flowDates(flowStops, anchor);
  let end: string | null = null;
  for (const r of results) {
    if (end === null || r.departDate > end) end = r.departDate;
  }
  return end;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/firm-up.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/firm-up.ts lib/firm-up.test.ts
git commit -m "feat(plan): computeProjectedEnd projection helper"
```

---

### Task 4: `flagHardEndDate` rule + wire into `detectFlags`

**Files:**
- Modify: `lib/flags.ts` (import `daysBetween` + `HARD_END_APPROACHING_NIGHTS`, add `flagHardEndDate`, extend `DetectFlagsInput`, call it in `detectFlags`)
- Test: `lib/flags.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/flags.test.ts` (add `flagHardEndDate` to the import from `./flags`):

```ts
import { flagHardEndDate } from "./flags";

describe("flagHardEndDate", () => {
  it("returns nothing when either date is missing", () => {
    expect(flagHardEndDate(null, "2026-07-10")).toEqual([]);
    expect(flagHardEndDate("2026-07-10", null)).toEqual([]);
  });

  it("warns when the projected end is past the hard end date", () => {
    const flags = flagHardEndDate("2026-07-17", "2026-07-15");
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("warning");
    expect(flags[0].targetType).toBe("TRIP");
    expect(flags[0].id).toBe("hard-end-over");
    expect(flags[0].message).toContain("2 nights past");
  });

  it("info when within the approaching window (slack 0..2)", () => {
    expect(flagHardEndDate("2026-07-15", "2026-07-17")[0].severity).toBe("info");
    expect(flagHardEndDate("2026-07-15", "2026-07-15")[0].message).toContain("right on");
  });

  it("returns nothing with comfortable slack (> 2 nights)", () => {
    expect(flagHardEndDate("2026-07-15", "2026-07-25")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/flags.test.ts`
Expected: FAIL — `flagHardEndDate` is not exported.

- [ ] **Step 3: Implement the rule and wire it in**

In `lib/flags.ts`, extend the imports:

```ts
import { nightsBetween, isDateWithin, addDays, daysBetween } from "@/lib/dates";
import { HARD_END_APPROACHING_NIGHTS } from "@/lib/firm-up";
```

Add the rule (place it after `flagRoughStops`):

```ts
// ---------------------------------------------------------------------------
// Rule 11: Hard end date (warning when over, info when approaching)
//
// Compares the trip's projected end against an optional traveller-set hard end
// date. Advisory only — see ADR 0013.
// ---------------------------------------------------------------------------

export function flagHardEndDate(
  projectedEnd: string | null | undefined,
  hardEndDate: string | null | undefined,
): Flag[] {
  if (!projectedEnd || !hardEndDate) return [];
  const slack = daysBetween(projectedEnd, hardEndDate); // hardEnd - projectedEnd, in nights
  if (slack < 0) {
    const over = -slack;
    return [
      {
        id: "hard-end-over",
        severity: "warning",
        message: `Your plan runs ${over} night${over === 1 ? "" : "s"} past your hard end date (${hardEndDate}).`,
        targetType: "TRIP",
      },
    ];
  }
  if (slack <= HARD_END_APPROACHING_NIGHTS) {
    const message =
      slack === 0
        ? `Your plan ends right on your hard end date (${hardEndDate}).`
        : `Your plan ends within ${slack} night${slack === 1 ? "" : "s"} of your hard end date (${hardEndDate}).`;
    return [{ id: "hard-end-approaching", severity: "info", message, targetType: "TRIP" }];
  }
  return [];
}
```

Extend `DetectFlagsInput` (add two optional fields after `roughStopCount`):

```ts
  roughStopCount?: number;
  /** Projected end date (rough nights flowed forward); see computeProjectedEnd. */
  projectedEnd?: string | null;
  /** Optional traveller-set hard end date. */
  hardEndDate?: string | null;
```

In `detectFlags`, add `projectedEnd` and `hardEndDate` to the destructured params and add the rule call to the returned array (after `flagRoughStops`):

```ts
    ...flagRoughStops(roughStopCount ?? 0),
    ...flagHardEndDate(projectedEnd, hardEndDate),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/flags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/flags.ts lib/flags.test.ts
git commit -m "feat(plan): flagHardEndDate rule wired into detectFlags"
```

---

### Task 5: `summarizePlan` (pure overview model)

**Files:**
- Create: `lib/plan-overview.ts`
- Test: `lib/plan-overview.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/plan-overview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizePlan } from "./plan-overview";

const stop = (over: Partial<{ id: string; arriveDate: string | null; departDate: string | null; nights: number | null; pinned: boolean; sortOrder: number }>) => ({
  id: "s", arriveDate: null, departDate: null, nights: null, pinned: false, sortOrder: 0, ...over,
});

describe("summarizePlan", () => {
  it("counts stops and splits rough from scheduled", () => {
    const s = summarizePlan({
      stops: [
        stop({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }),
        stop({ id: "b", nights: 3, sortOrder: 1 }),
      ],
      startDate: "2026-07-01",
      hardEndDate: null,
    });
    expect(s.stopCount).toBe(2);
    expect(s.roughCount).toBe(1);
    expect(s.scheduledNights).toBe(4);
    expect(s.projectedNights).toBe(7);
    expect(s.scheduledEnd).toBe("2026-07-05");
    expect(s.projectedEnd).toBe("2026-07-08");
    expect(s.hardEndState).toBe("unset");
  });

  it("flags 'over' when projected end passes the hard end date", () => {
    const s = summarizePlan({
      stops: [stop({ id: "a", nights: 20, sortOrder: 0 })],
      startDate: "2026-07-01",
      hardEndDate: "2026-07-10",
    });
    expect(s.hardEndState).toBe("over");
    expect(s.hardEndSlackNights).toBeLessThan(0);
  });

  it("flags 'approaching' within the window and 'ok' beyond it", () => {
    expect(summarizePlan({ stops: [stop({ id: "a", nights: 8, sortOrder: 0 })], startDate: "2026-07-01", hardEndDate: "2026-07-10" }).hardEndState).toBe("approaching");
    expect(summarizePlan({ stops: [stop({ id: "a", nights: 8, sortOrder: 0 })], startDate: "2026-07-01", hardEndDate: "2026-07-20" }).hardEndState).toBe("ok");
  });

  it("is 'dormant' when a hard end date is set but there's no anchor to project from", () => {
    const s = summarizePlan({ stops: [stop({ id: "a", nights: 3, sortOrder: 0 })], startDate: null, hardEndDate: "2026-07-10" });
    expect(s.projectedEnd).toBeNull();
    expect(s.hardEndState).toBe("dormant");
    expect(s.projectedNights).toBe(3); // nights total still computed
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/plan-overview.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `summarizePlan`**

Create `lib/plan-overview.ts`:

```ts
/**
 * Pure roll-up model for the Plan overview strip. No Prisma/React.
 * See CONTEXT.md (Hard end date, Projected end) and ADR 0013.
 */
import { computeProjectedEnd, HARD_END_APPROACHING_NIGHTS, type ProjectionStop } from "@/lib/firm-up";
import { nightsBetween, daysBetween } from "@/lib/dates";

export type HardEndState = "unset" | "dormant" | "ok" | "approaching" | "over";

export interface PlanSummaryInput {
  stops: ProjectionStop[];
  /** Trip start date (anchor), or null. */
  startDate: string | null;
  hardEndDate: string | null;
}

export interface PlanSummary {
  stopCount: number;
  roughCount: number;
  scheduledNights: number;
  projectedNights: number;
  /** Left edge of the date span: start date, else earliest scheduled arrive, else null. */
  spanStart: string | null;
  /** Latest scheduled depart, or null when nothing is scheduled. */
  scheduledEnd: string | null;
  projectedEnd: string | null;
  hardEndDate: string | null;
  hardEndState: HardEndState;
  /** hardEnd − projectedEnd in nights; positive = spare, negative = over; null when unset/dormant. */
  hardEndSlackNights: number | null;
}

export function summarizePlan({ stops, startDate, hardEndDate }: PlanSummaryInput): PlanSummary {
  let roughCount = 0;
  let scheduledNights = 0;
  let projectedNights = 0;
  let scheduledEnd: string | null = null;
  let earliestArrive: string | null = null;

  for (const s of stops) {
    const scheduled = Boolean(s.arriveDate && s.departDate);
    if (scheduled) {
      const n = nightsBetween(s.arriveDate as string, s.departDate as string);
      scheduledNights += n;
      projectedNights += n;
      if (scheduledEnd === null || (s.departDate as string) > scheduledEnd) scheduledEnd = s.departDate as string;
      if (earliestArrive === null || (s.arriveDate as string) < earliestArrive) earliestArrive = s.arriveDate as string;
    } else {
      roughCount += 1;
      projectedNights += Math.max(0, s.nights ?? 1);
    }
  }

  const projectedEnd = computeProjectedEnd(stops, startDate ?? null);

  let hardEndState: HardEndState;
  let hardEndSlackNights: number | null = null;
  if (!hardEndDate) {
    hardEndState = "unset";
  } else if (!projectedEnd) {
    hardEndState = "dormant";
  } else {
    const slack = daysBetween(projectedEnd, hardEndDate);
    hardEndSlackNights = slack;
    if (slack < 0) hardEndState = "over";
    else if (slack <= HARD_END_APPROACHING_NIGHTS) hardEndState = "approaching";
    else hardEndState = "ok";
  }

  return {
    stopCount: stops.length,
    roughCount,
    scheduledNights,
    projectedNights,
    spanStart: startDate ?? earliestArrive,
    scheduledEnd,
    projectedEnd,
    hardEndDate,
    hardEndState,
    hardEndSlackNights,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/plan-overview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/plan-overview.ts lib/plan-overview.test.ts
git commit -m "feat(plan): summarizePlan overview model"
```

---

### Task 6: `setTripHardEndDate` server action

**Files:**
- Modify: `server/actions/trips.ts` (new action, after `updateTrip`)
- Test: `server/actions/trips.test.ts`

- [ ] **Step 1: Add the `trip.findUnique` mock and write the failing tests**

In `server/actions/trips.test.ts`: add a hoisted mock `tripFindUniqueMock` (alongside `tripUpdateMock` in the `vi.hoisted` block and its return object), wire it into the `@/lib/db` mock's `trip` object as `findUnique: tripFindUniqueMock`, and add `setTripHardEndDate` to the `./trips` import.

In the `vi.hoisted` return + destructure, add `tripFindUniqueMock: vi.fn()`. In `vi.mock("@/lib/db", ...)`:

```ts
    trip: {
      update: tripUpdateMock,
      delete: tripDeleteMock,
      findUnique: tripFindUniqueMock,
    },
```

Then add the test block:

```ts
describe("setTripHardEndDate", () => {
  it("sets the hard end date and revalidates the plan + settings", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    tripUpdateMock.mockResolvedValue({});
    const r = await setTripHardEndDate(TRIP_ID, "2026-07-20");
    expect(r.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: TRIP_ID }, data: { hardEndDate: "2026-07-20" } });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/plan`);
  });

  it("clears the hard end date when given an empty value", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    tripUpdateMock.mockResolvedValue({});
    const r = await setTripHardEndDate(TRIP_ID, "");
    expect(r.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: TRIP_ID }, data: { hardEndDate: null } });
  });

  it("rejects a hard end date before the start date", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    const r = await setTripHardEndDate(TRIP_ID, "2026-06-30");
    expect(r.success).toBe(false);
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/actions/trips.test.ts`
Expected: FAIL — `setTripHardEndDate` is not exported.

- [ ] **Step 3: Implement the action**

In `server/actions/trips.ts`, after `updateTrip`, add:

```ts
// ---------------------------------------------------------------------------
// setTripHardEndDate — focused write for the Plan overview's inline control
// ---------------------------------------------------------------------------

export type SetHardEndDateResult = { success: true } | { success: false; error: string };

/**
 * Set or clear a trip's hard end date. Pass null/"" to clear. Validates the
 * date is on or after the start date. Advisory only — never changes scheduling.
 */
export async function setTripHardEndDate(
  tripId: string,
  hardEndDate: string | null,
): Promise<SetHardEndDateResult> {
  await requireTripAccess(tripId);

  const value = hardEndDate && hardEndDate.trim() !== "" ? hardEndDate.trim() : null;
  if (value !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { success: false, error: "Date must be in YYYY-MM-DD format." };
    }
    const trip = await db.trip.findUnique({ where: { id: tripId }, select: { startDate: true } });
    if (trip?.startDate && value < trip.startDate) {
      return { success: false, error: "Hard end date must be on or after the start date." };
    }
  }

  await db.trip.update({ where: { id: tripId }, data: { hardEndDate: value } });

  revalidatePath(`/trips/${tripId}/plan`);
  revalidatePath(`/trips/${tripId}/settings`);
  revalidatePath(`/trips/${tripId}`);

  return { success: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/actions/trips.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/trips.ts server/actions/trips.test.ts
git commit -m "feat(plan): setTripHardEndDate server action"
```

---

### Task 7: `getTripProjection` server helper

**Files:**
- Modify: `server/actions/stops.ts` (add import of `computeProjectedEnd`, add `getTripProjection`)
- Test: `server/actions/stops.test.ts`

- [ ] **Step 1: Write the failing test**

In `server/actions/stops.test.ts`, add `getTripProjection` to the `./stops` import and add (reuse the file's existing `@/lib/db` + `@/lib/guards` mocks; if the db mock lacks `trip.findUnique` or `stop.findMany`, add those spies to it):

```ts
describe("getTripProjection", () => {
  it("returns the projected end and hard end date", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", hardEndDate: "2026-07-10" });
    stopFindManyMock.mockResolvedValue([
      { id: "a", arriveDate: null, departDate: null, nights: 3, pinned: false, sortOrder: 0 },
      { id: "b", arriveDate: null, departDate: null, nights: 4, pinned: false, sortOrder: 1 },
    ]);
    const r = await getTripProjection("trip-1");
    expect(r.projectedEnd).toBe("2026-07-08");
    expect(r.hardEndDate).toBe("2026-07-10");
  });
});
```

(Match the existing mock variable names in `stops.test.ts`. If the file names its Prisma spies differently, adapt `tripFindUniqueMock`/`stopFindManyMock` to those names; add them to the `@/lib/db` mock if absent.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/actions/stops.test.ts`
Expected: FAIL — `getTripProjection` is not exported.

- [ ] **Step 3: Implement the helper**

In `server/actions/stops.ts`, extend the firm-up import and add the function:

```ts
import { flowDates, computeProjectedEnd, type FlowStop, type FlowConflict } from "@/lib/firm-up";
```

```ts
/**
 * Compute a trip's projected end + its hard end date in one round trip, for
 * feeding the Flag detector on the Summary and Home (which don't otherwise
 * load the full stop set). See computeProjectedEnd / ADR 0013.
 */
export async function getTripProjection(
  tripId: string,
): Promise<{ projectedEnd: string | null; hardEndDate: string | null }> {
  await requireTripAccess(tripId);
  const [trip, stops] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true, hardEndDate: true } }),
    db.stop.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, arriveDate: true, departDate: true, nights: true, pinned: true, sortOrder: true },
    }),
  ]);
  return {
    projectedEnd: computeProjectedEnd(stops, trip?.startDate ?? null),
    hardEndDate: trip?.hardEndDate ?? null,
  };
}
```

(Confirm `requireTripAccess`, `db`, are already imported at the top of `stops.ts`; they are used elsewhere in the file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/actions/stops.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/stops.ts server/actions/stops.test.ts
git commit -m "feat(plan): getTripProjection server helper"
```

---

### Task 8: `HardEndDateControl` client component (inline set/edit/clear)

**Files:**
- Create: `components/trip/hard-end-date-control.tsx`
- Test: `components/trip/hard-end-date-control.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/trip/hard-end-date-control.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HardEndDateControl } from "./hard-end-date-control";

const setMock = vi.fn();
vi.mock("@/server/actions/trips", () => ({
  setTripHardEndDate: (...args: unknown[]) => setMock(...args),
}));

describe("HardEndDateControl", () => {
  beforeEach(() => setMock.mockReset().mockResolvedValue({ success: true }));

  it("shows a 'Set hard end date' affordance when unset", () => {
    render(<HardEndDateControl tripId="t1" hardEndDate={null} startDate="2026-07-01" />);
    expect(screen.getByRole("button", { name: /set hard end date/i })).toBeInTheDocument();
  });

  it("shows the date and saves an edit", async () => {
    render(<HardEndDateControl tripId="t1" hardEndDate="2026-07-15" startDate="2026-07-01" />);
    fireEvent.click(screen.getByRole("button", { name: /2026-07-15|hard end/i }));
    const input = screen.getByLabelText(/hard end date/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-07-20" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(setMock).toHaveBeenCalledWith("t1", "2026-07-20"));
  });

  it("clears the date", async () => {
    render(<HardEndDateControl tripId="t1" hardEndDate="2026-07-15" startDate="2026-07-01" />);
    fireEvent.click(screen.getByRole("button", { name: /2026-07-15|hard end/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    await waitFor(() => expect(setMock).toHaveBeenCalledWith("t1", null));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/trip/hard-end-date-control.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the control**

Create `components/trip/hard-end-date-control.tsx`:

```tsx
"use client";

import * as React from "react";
import { useTransition } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { setTripHardEndDate } from "@/server/actions/trips";
import { toast } from "@/components/ui/use-toast";

interface HardEndDateControlProps {
  tripId: string;
  hardEndDate: string | null;
  /** Trip start date — lower bound for the picker. */
  startDate: string | null;
}

/**
 * Inline set / edit / clear control for a trip's Hard end date, shown on the
 * Plan overview. Writes via setTripHardEndDate; the page revalidates on success.
 */
export function HardEndDateControl({ tripId, hardEndDate, startDate }: HardEndDateControlProps) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(hardEndDate ?? "");
  const [isPending, startTransition] = useTransition();

  // Keep local state in sync if the server value changes after revalidation.
  React.useEffect(() => setValue(hardEndDate ?? ""), [hardEndDate]);

  function commit(next: string | null) {
    startTransition(async () => {
      const r = await setTripHardEndDate(tripId, next);
      if (!r.success) {
        toast({ variant: "destructive", title: r.error });
      } else {
        setEditing(false);
      }
    });
  }

  if (!editing) {
    return hardEndDate ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="font-medium text-foreground underline-offset-2 hover:underline"
      >
        {hardEndDate}
      </button>
    ) : (
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>
        <CalendarClock className="size-3.5" aria-hidden="true" />
        Set hard end date
      </Button>
    );
  }

  return (
    <div className="flex items-end gap-2">
      <DateField
        label="Hard end date"
        value={value}
        min={startDate ?? undefined}
        onChange={(e) => setValue(e.target.value)}
        disabled={isPending}
      />
      <Button size="sm" variant="primary" disabled={isPending || value === ""} onClick={() => commit(value)}>
        Save
      </Button>
      {hardEndDate && (
        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => commit(null)}>
          Clear
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={isPending} onClick={() => { setEditing(false); setValue(hardEndDate ?? ""); }}>
        Cancel
      </Button>
    </div>
  );
}
```

(If `DateField` does not render an accessible label tied to its input, the test's `getByLabelText(/hard end date/i)` will fail — in that case query the date input via `container.querySelector('input[type="date"]')`. Check `components/ui/date-field.tsx` first and adapt the test query to match how it associates label + input.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run components/trip/hard-end-date-control.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/trip/hard-end-date-control.tsx components/trip/hard-end-date-control.test.tsx
git commit -m "feat(plan): inline HardEndDateControl"
```

---

### Task 9: `PlanOverview` presentational component

**Files:**
- Create: `components/trip/plan-overview.tsx`
- Test: `components/trip/plan-overview.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/trip/plan-overview.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanOverview } from "./plan-overview";
import type { PlanSummary } from "@/lib/plan-overview";

vi.mock("./hard-end-date-control", () => ({
  HardEndDateControl: () => <div data-testid="hard-end-control" />,
}));

const base: PlanSummary = {
  stopCount: 5, roughCount: 2, scheduledNights: 16, projectedNights: 23,
  spanStart: "2026-07-01", scheduledEnd: "2026-07-10", projectedEnd: "2026-07-17",
  hardEndDate: "2026-07-15", hardEndState: "over", hardEndSlackNights: -2,
};

describe("PlanOverview", () => {
  it("renders stop/rough counts and the nights split", () => {
    render(<PlanOverview tripId="t1" summary={base} startDate="2026-07-01" />);
    expect(screen.getByText(/5 stops/i)).toBeInTheDocument();
    expect(screen.getByText(/2 rough/i)).toBeInTheDocument();
    expect(screen.getByText(/16/)).toBeInTheDocument();
    expect(screen.getByText(/23/)).toBeInTheDocument();
  });

  it("marks an over-budget hard end status with an alert role", () => {
    render(<PlanOverview tripId="t1" summary={base} startDate="2026-07-01" />);
    expect(screen.getByRole("status")).toHaveTextContent(/2 nights over/i);
  });

  it("renders the inline hard-end control", () => {
    render(<PlanOverview tripId="t1" summary={base} startDate="2026-07-01" />);
    expect(screen.getByTestId("hard-end-control")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/trip/plan-overview.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the overview**

Create `components/trip/plan-overview.tsx`:

```tsx
import { MapPin, Moon, CalendarRange, Flag } from "lucide-react";
import { formatLongDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { PlanSummary, HardEndState } from "@/lib/plan-overview";
import { HardEndDateControl } from "./hard-end-date-control";

interface PlanOverviewProps {
  tripId: string;
  summary: PlanSummary;
  startDate: string | null;
}

const HARD_END_TONE: Record<HardEndState, string> = {
  unset: "text-muted-foreground",
  dormant: "text-muted-foreground",
  ok: "text-muted-foreground",
  approaching: "text-amber-600 dark:text-amber-500",
  over: "text-destructive",
};

function hardEndStatusText(summary: PlanSummary): string | null {
  const { hardEndState, hardEndSlackNights } = summary;
  if (hardEndState === "over" && hardEndSlackNights != null) {
    const n = -hardEndSlackNights;
    return `${n} night${n === 1 ? "" : "s"} over`;
  }
  if (hardEndState === "approaching" && hardEndSlackNights != null) {
    return hardEndSlackNights === 0 ? "ends right on it" : `${hardEndSlackNights} night${hardEndSlackNights === 1 ? "" : "s"} spare`;
  }
  if (hardEndState === "ok" && hardEndSlackNights != null) {
    return `${hardEndSlackNights} nights spare`;
  }
  if (hardEndState === "dormant") return "set a start date to check this";
  return null;
}

export function PlanOverview({ tripId, summary, startDate }: PlanOverviewProps) {
  const {
    stopCount, roughCount, scheduledNights, projectedNights,
    spanStart, scheduledEnd, projectedEnd, hardEndDate, hardEndState,
  } = summary;

  const hasRough = roughCount > 0;
  const statusText = hardEndStatusText(summary);

  return (
    <section
      aria-label="Trip overview"
      className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/40 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6"
    >
      {/* Stops */}
      <div className="flex items-center gap-2">
        <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm">
          <span className="font-semibold text-foreground">{stopCount} stop{stopCount === 1 ? "" : "s"}</span>
          {hasRough && <span className="text-muted-foreground"> · {roughCount} rough</span>}
        </span>
      </div>

      {/* Nights */}
      <div className="flex items-center gap-2">
        <Moon className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm">
          <span className="font-semibold text-foreground">{scheduledNights} night{scheduledNights === 1 ? "" : "s"}</span>
          {hasRough && <span className="text-muted-foreground"> scheduled · {projectedNights} projected</span>}
        </span>
      </div>

      {/* Date span */}
      <div className="flex items-center gap-2">
        <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">
          {spanStart ? (
            <>
              <span className="text-foreground">{formatLongDate(spanStart)}</span>
              {scheduledEnd && <> → <span className="text-foreground">{formatLongDate(scheduledEnd)}</span></>}
              {hasRough && projectedEnd && <> · ~{formatLongDate(projectedEnd)} projected</>}
            </>
          ) : (
            "No dates yet"
          )}
        </span>
      </div>

      {/* Hard end date */}
      <div className="flex items-center gap-2 sm:ml-auto">
        <Flag className={cn("size-4", HARD_END_TONE[hardEndState])} aria-hidden="true" />
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Hard end date</span>
          <span role="status" className={cn("text-sm", HARD_END_TONE[hardEndState])}>
            <HardEndDateControl tripId={tripId} hardEndDate={hardEndDate} startDate={startDate} />
            {statusText && <span className="ml-2">{statusText}</span>}
          </span>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run components/trip/plan-overview.test.tsx`
Expected: PASS. (If `getByText(/5 stops/i)` splits across elements, use `screen.getByText((_, el) => el?.textContent === "5 stops")` or assert on the section's `textContent`.)

- [ ] **Step 5: Commit**

```bash
git add components/trip/plan-overview.tsx components/trip/plan-overview.test.tsx
git commit -m "feat(plan): PlanOverview status strip"
```

---

### Task 10: Render `PlanOverview` on the Plan page (normal mode, has-stops only)

**Files:**
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx`

- [ ] **Step 1: Add the hardEndDate select + imports**

In `app/(app)/trips/[tripId]/plan/page.tsx`, add imports near the top:

```ts
import { PlanOverview } from "@/components/trip/plan-overview";
import { summarizePlan } from "@/lib/plan-overview";
```

In the `db.trip.findUnique` `select` (around lines 37-43), add `hardEndDate: true`:

```ts
      select: {
        homeCurrency: true,
        startDate: true,
        endDate: true,
        hardEndDate: true,
        drivingWindingFactor: true,
        drivingAvgSpeedKph: true,
      },
```

- [ ] **Step 2: Compute the summary (normal-mode branch)**

In the same file, after the `const { discreet } = await getDiscreetState();` line and its `if (discreet) { ... }` block (i.e. just before the final `return (` for normal mode, ~line 209), compute the summary:

```ts
  const planSummary = summarizePlan({
    stops: stops.map((s) => ({
      id: s.id,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
      nights: s.nights,
      pinned: s.pinned,
      sortOrder: s.sortOrder,
    })),
    startDate: trip?.startDate ?? null,
    hardEndDate: trip?.hardEndDate ?? null,
  });
```

- [ ] **Step 3: Render the overview above the ItineraryManager**

In the normal-mode `return`, add `<PlanOverview>` as the first child of the wrapping `<div className="flex flex-col gap-6">`, shown only when there are stops:

```tsx
  return (
    <div className="flex flex-col gap-6">
      {stops.length > 0 && (
        <PlanOverview tripId={tripId} summary={planSummary} startDate={trip?.startDate ?? null} />
      )}
      <ItineraryManager
        tripId={tripId}
        homeCurrency={trip?.homeCurrency}
        /* ...rest unchanged... */
```

(Leave every existing `ItineraryManager` prop exactly as-is. Do NOT add the overview to the `if (discreet)` branch — it stays hidden in Discreet mode.)

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/trips/[tripId]/plan/page.tsx"
git commit -m "feat(plan): render PlanOverview on the Plan page (normal mode)"
```

---

### Task 11: Feed projected end + hard end date into the Summary's flags

**Files:**
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx`

- [ ] **Step 1: Import the projection helper**

Add near the top of `app/(app)/trips/[tripId]/summary/page.tsx`:

```ts
import { getTripProjection } from "@/server/actions/stops";
```

- [ ] **Step 2: Fetch the projection and pass it to detectFlags**

Just before the `const flags = detectFlags({` call (~line 236), add:

```ts
  const projection = await getTripProjection(tripId);
```

Then add two fields to the `detectFlags({ ... })` argument (after `roughStopCount`):

```ts
    roughStopCount: roughStops.length,
    projectedEnd: projection.projectedEnd,
    hardEndDate: projection.hardEndDate,
    drivingWindingFactor: trip.drivingWindingFactor,
    drivingAvgSpeedKph: trip.drivingAvgSpeedKph,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/trips/[tripId]/summary/page.tsx"
git commit -m "feat(plan): surface hard-end flag in the Summary"
```

---

### Task 12: Feed projected end + hard end date into the Home's Next steps

**Files:**
- Modify: `components/trip/home/phase-planning.tsx`

- [ ] **Step 1: Import the projection helper**

Add to the imports in `components/trip/home/phase-planning.tsx`:

```ts
import { getTripProjection } from "@/server/actions/stops";
```

- [ ] **Step 2: Fetch the projection and pass it to detectFlags**

Just before the `const flags = detectFlags({` call (~line 206), add:

```ts
  const projection = await getTripProjection(tripId);
```

Add the two fields to the `detectFlags({ ... })` argument (after `roughStopCount: roughStops,`):

```ts
    roughStopCount: roughStops,
    projectedEnd: projection.projectedEnd,
    hardEndDate: projection.hardEndDate,
    drivingWindingFactor: trip.drivingWindingFactor,
    drivingAvgSpeedKph: trip.drivingAvgSpeedKph,
```

(Confirm `tripId` is in scope in this component; it is the function's prop. If the component receives the trip as a prop without `tripId`, use `trip.id`.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/trip/home/phase-planning.tsx
git commit -m "feat(plan): surface hard-end flag in Home Next steps"
```

---

### Task 13: Add the Hard end date field to Trip Settings

**Files:**
- Modify: `components/trip/settings/trip-details-form.tsx`
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx` (pass `hardEndDate` default)
- Test: `components/trip/settings/trip-details-form.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `components/trip/settings/trip-details-form.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TripDetailsForm } from "./trip-details-form";

const updateMock = vi.fn();
vi.mock("@/server/actions/trips", () => ({
  updateTrip: (...args: unknown[]) => updateMock(...args),
}));

describe("TripDetailsForm", () => {
  beforeEach(() => updateMock.mockReset().mockResolvedValue({ success: true }));

  it("submits the hard end date along with the other fields", async () => {
    render(
      <TripDetailsForm
        tripId="t1"
        defaultValues={{ name: "Trip", startDate: "2026-07-01", endDate: "2026-07-10", hardEndDate: "2026-07-15", homeCurrency: "AUD" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("t1", expect.objectContaining({ hardEndDate: "2026-07-15" })),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/trip/settings/trip-details-form.test.tsx`
Expected: FAIL — `defaultValues.hardEndDate` is not a valid prop / not submitted.

- [ ] **Step 3: Add `hardEndDate` to the form**

In `components/trip/settings/trip-details-form.tsx`:

Extend the `defaultValues` prop type:

```ts
  defaultValues: {
    name: string;
    startDate: string;
    endDate: string;
    hardEndDate: string;
    homeCurrency: string;
  };
```

Add `hardEndDate` to the submitted `input`:

```ts
    const input = {
      name: data.get("name") as string,
      startDate: data.get("startDate") as string,
      endDate: data.get("endDate") as string,
      hardEndDate: data.get("hardEndDate") as string,
      homeCurrency: data.get("homeCurrency") as string,
    };
```

Add a `DateField` after the start/end grid (before the Home currency `Field`):

```tsx
      <DateField
        name="hardEndDate"
        label="Hard end date (optional)"
        defaultValue={defaultValues.hardEndDate}
        min={defaultValues.startDate || undefined}
        error={fieldError("hardEndDate")}
        disabled={isPending}
      />
```

- [ ] **Step 4: Pass the default from the Settings page**

In `app/(app)/trips/[tripId]/settings/page.tsx`, add `hardEndDate: true` to the `trip` select (after `endDate: true`), and add it to the `defaultValues` passed to `TripDetailsForm`:

```tsx
            defaultValues={{
              name: trip.name,
              startDate: trip.startDate ?? "",
              endDate: trip.endDate ?? "",
              hardEndDate: trip.hardEndDate ?? "",
              homeCurrency: trip.homeCurrency,
            }}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run components/trip/settings/trip-details-form.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/trip/settings/trip-details-form.tsx components/trip/settings/trip-details-form.test.tsx "app/(app)/trips/[tripId]/settings/page.tsx"
git commit -m "feat(plan): hard end date field in Trip Settings"
```

---

### Task 14: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all tests pass (no regressions in firm-up, flags, trips, stops, plan-overview, or the new component tests).

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke (optional, requires DB + dev server)**

Run `npm run dev`, open a trip's **Plan** tab: confirm the overview shows stop/night counts and the date span. Set a Hard end date earlier than the projected end → the hard-end readout goes red ("N nights over") and the same warning appears in **Summary** and the Home **Next steps**. Toggle **Discreet mode** → the overview disappears, the spreadsheet is unchanged.

---

## Self-Review

**Spec coverage:**
- Overview on Plan page (stops/nights/dates) → Tasks 5, 9, 10. ✓
- Stops count + rough split; nights scheduled vs projected; span start → scheduled end · projected end → Task 9 (`PlanOverview`) reading Task 5 (`summarizePlan`). ✓
- Hard end date concept (separate, advisory) → Tasks 1, 2. ✓
- Projected end (rough flowed forward, reuse flowDates) → Task 3. ✓
- Warning as a Flag (info approaching / warning over) → Task 4; surfaced in Summary (Task 11) + Next steps (Task 12) + inline on overview (Task 9). ✓
- Set inline on overview + in Settings; not at creation → Tasks 8 (control) + 6 (action); 13 (settings). createTrip untouched. ✓
- Hidden in Discreet mode → Task 10 leaves the `if (discreet)` branch untouched. ✓
- Advisory / non-blocking; date pickers unaffected → no changes to firm-up writes or stop date-picker bounds. ✓

**Type consistency:** `ProjectionStop` (firm-up) is the shared stop shape consumed by `computeProjectedEnd`, `summarizePlan`, and `getTripProjection`. `PlanSummary` / `HardEndState` (plan-overview) flow into `PlanOverview`. `HARD_END_APPROACHING_NIGHTS` is defined once in firm-up and imported by flags + plan-overview. `setTripHardEndDate(tripId, string | null)` matches `HardEndDateControl`'s calls. `detectFlags` new optional fields (`projectedEnd`, `hardEndDate`) match both call sites.

**Placeholder scan:** none — every step has concrete code/commands.
