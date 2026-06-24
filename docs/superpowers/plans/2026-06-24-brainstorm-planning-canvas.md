# Brainstorm → Fleshed-out Planning Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Overview into a planning canvas where a trip starts as a loose sketch — rough chapters and date-less stops with rough night counts — and hardens into a dated itinerary in place via auto-flow, with pinned (fixed-date) stops and incremental per-stop firming-up.

**Architecture:** Roughness is a per-stop state (no dates = rough; dates = scheduled; dates + `pinned` = fixed). A rough Stop carries explicit ordered membership in a (possibly rough) Chapter via `chapterId`/`chapterSortOrder`; the instant a Stop is dated, ADR 0008's computed date-band membership takes over and the live trip behaves exactly as today. A new pure module `lib/firm-up.ts` (`flowDates`) computes dates by flowing each stop's nights forward from an anchor, treating pinned stops as immovable boundaries and reporting conflicts. Server actions persist flows; the Overview client renders rough and dated stops side by side.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Prisma 7 + Postgres, Zod 4 validation, Vitest + Testing Library, Tailwind v4, Motion. No new dependencies.

---

## File Structure

**New files:**
- `docs/adr/0009-rough-stops-and-pinning.md` — ADR amending 0008.
- `prisma/migrations/20260624000000_rough_stops/migration.sql` — hand-authored migration.
- `lib/firm-up.ts` + `lib/firm-up.test.ts` — pure date-flow + pinning engine.

**Modified files (data/logic):**
- `prisma/schema.prisma` — nullable Stop/Chapter/Trip dates; new Stop columns; Chapter↔Stop relation.
- `lib/chapters.ts` + `lib/chapters.test.ts` — mixed (rough + dated) membership/grouping.
- `lib/validations/stop.ts` + `.test.ts` — rough vs scheduled stop input.
- `lib/validations/chapter.ts` + `.test.ts` — rough (date-less) chapter input.
- `lib/validations/trip.ts` + `.test.ts` — optional trip dates.
- `server/actions/stops.ts` + `.test.ts` — rough create; `setStopDates`, `firmUpSegment`, `toggleStopPin`, `makeStopRough`, `assignStopToChapter`.
- `server/actions/chapters.ts` + `.test.ts` — rough chapter create/update; null-date overlap handling.
- `server/actions/trips.ts` + `.test.ts` — optional dates on create/update.

**Modified files (UI / read-model):**
- `app/(app)/trips/[tripId]/page.tsx` — select new Stop/Chapter fields; pass through.
- `components/trip/itinerary-manager.tsx` — canvas: rough cards, set-dates, ripple, pin, inline rough chapters.
- `components/trip/stop-card.tsx` — rough vs dated rendering, pin/set-dates/make-rough affordances.
- `components/trip/stop-form-dialog.tsx` — rough mode (place + nights, no dates).
- `components/trip/chapter-form-dialog.tsx` — allow rough (no-date) chapter.
- `components/trip/quick-add-stops.tsx` (new) — fast add row.
- `app/(app)/trips/new/new-trip-form.tsx` + `lib/validations/trip.ts` — optional dates.
- `app/(app)/trips/[tripId]/summary/page.tsx` + `lib/flags.ts` — "Not yet scheduled" + rough/pin flags.
- Dated-view consumers (Calendar/Today/day/ics/budget) — null-safe filtering of rough stops.

---

## Phase 0 — Decision record + schema

### Task 1: Write ADR 0009

**Files:**
- Create: `docs/adr/0009-rough-stops-and-pinning.md`

- [ ] **Step 1: Write the ADR**

```markdown
# Rough Stops & rough Chapters with pinning: explicit membership while sketching, date-bands once scheduled

Amends ADR 0008 (chapters as computed date-range bands). ADR 0008 stands for the
**dated** trip; this ADR covers the **sketch** phase that precedes dates.

## Context

The planning flow must support brainstorming a trip top-down before any dates
exist: sketch the legs ("France", "Italy") and drop rough places into them
("Paris ~3 nights"), reorder freely, then flow dates forward. ADR 0008 places a
Stop in a Chapter by the date band covering its **arrive date** — which cannot
work before a Stop has dates. Couples also need some dates to be **fixed** (a
booked return flight, a dated concert) while everything around them stays
flexible.

## Decision

1. **A Stop is `rough` (no `arriveDate`/`departDate`/`timezone`, carries a rough
   `nights` count) or `scheduled` (dated). A scheduled Stop may also be
   `pinned` (its dates are fixed).** One Trip freely mixes them.

2. **While rough, membership is explicit and ordered:** `Stop.chapterId` +
   `Stop.chapterSortOrder`. A Chapter may itself be `rough` (nullable
   `startDate`/`endDate`). This is a brainstorming scaffold only.

3. **Once a Stop is scheduled, dates are the source of truth** (ADR 0008): the
   read model groups dated Stops by date band and ignores their `chapterId`.
   Firming up a rough leg sets the Chapter's dates to span its now-dated Stops,
   so the band and the prior explicit grouping agree. Making a Stop rough again
   clears its dates and restores explicit membership.

4. **Firming up flows dates forward from an anchor** (Trip start, or the depart
   date of the preceding scheduled Stop) using each Stop's nights:
   `arrive = previous depart`, `depart = arrive + nights`. A **pinned** Stop is
   an immovable boundary: flexible Stops flow in the span before it; if they
   cannot fit, a **Flag** is raised rather than overwriting the pin; slack
   before a pin is left as free days.

5. **Trip dates are optional.** A Trip can be date-less; a start date, if set, is
   the default anchor. The end date is soft and auto-extends to cover scheduled
   Stops.

## Consequences

- **Small additive migration:** nullable date columns + four new Stop columns +
  a Chapter→Stop relation. Existing trips are unaffected (all Stops scheduled,
  all Chapters dated) and render exactly as before.
- **Two membership mechanisms coexist** (explicit for rough, computed for
  dated), reconciled by the "dates win once scheduled" rule. The read model
  picks per-Stop based on whether it has an arrive date.
- **Dated views (Calendar, Today, Summary, ICS, Budget) only ever show
  scheduled Stops;** rough Stops (null dates) are filtered out at the query/lib
  boundary.
- **Reversible at a price:** dropping rough support later means dropping the new
  columns; the dated-trip behaviour is unchanged by this ADR.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0009-rough-stops-and-pinning.md
git commit -m "docs(adr): 0009 rough stops & pinning, amending 0008"
```

---

### Task 2: Schema + migration for rough stops/chapters/trips

**Files:**
- Modify: `prisma/schema.prisma` (Trip ~95-127, Stop ~161-184, Chapter ~186-201)
- Create: `prisma/migrations/20260624000000_rough_stops/migration.sql`

- [ ] **Step 1: Make Trip dates nullable**

In `prisma/schema.prisma`, model `Trip`:

```prisma
  startDate    String? // "YYYY-MM-DD" — null while the trip is a date-less idea
  endDate      String? // "YYYY-MM-DD" — soft; auto-extends to cover scheduled stops
```

- [ ] **Step 2: Update the Stop model**

Replace the `Stop` field block so dates/timezone are nullable and the new columns + relation exist:

```prisma
model Stop {
  id               String  @id @default(cuid())
  tripId           String
  name             String
  country          String?
  lat              Float?
  lng              Float?
  timezone         String? // IANA — null while rough
  arriveDate       String? // "YYYY-MM-DD" — null while rough
  departDate       String? // "YYYY-MM-DD" — null while rough
  nights           Int?    // rough duration, used while rough
  sortOrder        Int
  pinned           Boolean @default(false) // dates fixed; ripple never moves it
  chapterId        String? // explicit chapter membership while rough
  chapterSortOrder Int     @default(0) // order within the chapter while rough
  notes            String?

  trip           Trip            @relation(fields: [tripId], references: [id], onDelete: Cascade)
  chapter        Chapter?        @relation(fields: [chapterId], references: [id], onDelete: SetNull)
  accommodations Accommodation[]
  items          Item[]
  fromTransports Transport[]     @relation("TransportFromStop")
  toTransports   Transport[]     @relation("TransportToStop")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tripId])
  @@index([chapterId])
}
```

- [ ] **Step 3: Update the Chapter model**

Make dates nullable and add the back-relation:

```prisma
model Chapter {
  id        String  @id @default(cuid())
  tripId    String
  name      String
  colour    String  // lib/chapter-colours.ts CHAPTER_COLOUR_VALUES
  startDate String? // "YYYY-MM-DD" — null while rough
  endDate   String? // "YYYY-MM-DD" — null while rough
  sortOrder Int     @default(0)

  trip  Trip   @relation(fields: [tripId], references: [id], onDelete: Cascade)
  stops Stop[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tripId])
}
```

- [ ] **Step 4: Hand-author the migration SQL**

Create `prisma/migrations/20260624000000_rough_stops/migration.sql`:

```sql
-- Stop: allow rough (date-less) stops + explicit membership + pinning
ALTER TABLE "Stop" ALTER COLUMN "arriveDate" DROP NOT NULL;
ALTER TABLE "Stop" ALTER COLUMN "departDate" DROP NOT NULL;
ALTER TABLE "Stop" ALTER COLUMN "timezone" DROP NOT NULL;
ALTER TABLE "Stop" ADD COLUMN "nights" INTEGER;
ALTER TABLE "Stop" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Stop" ADD COLUMN "chapterId" TEXT;
ALTER TABLE "Stop" ADD COLUMN "chapterSortOrder" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Stop_chapterId_idx" ON "Stop"("chapterId");
ALTER TABLE "Stop" ADD CONSTRAINT "Stop_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Chapter: allow rough (date-less) chapters
ALTER TABLE "Chapter" ALTER COLUMN "startDate" DROP NOT NULL;
ALTER TABLE "Chapter" ALTER COLUMN "endDate" DROP NOT NULL;

-- Trip: allow date-less trips
ALTER TABLE "Trip" ALTER COLUMN "startDate" DROP NOT NULL;
ALTER TABLE "Trip" ALTER COLUMN "endDate" DROP NOT NULL;
```

- [ ] **Step 5: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors. (No DB connection needed.)

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260624000000_rough_stops/migration.sql
git commit -m "feat(schema): rough stops/chapters, optional trip dates, pinning"
```

---

### Task 3: Make the codebase compile against the nullable columns

Nullable `arriveDate`/`departDate`/`timezone` on Stop and `startDate`/`endDate` on Trip/Chapter will break existing call sites that assume `string`. Fix them by **filtering rough stops out of dated views** and guarding null trip/chapter dates. The type checker is the worklist.

**Files:** discovered via `tsc` — likely `app/(app)/trips/[tripId]/{calendar,today,day/[date],summary,budget,print}/page.tsx`, `lib/{itinerary,budget,ics,flags,month-grid}.ts`, `app/api/feeds/**`, various components.

- [ ] **Step 1: Find every breakage**

Run: `npx tsc --noEmit`
Expected: a list of TS2322/TS2345/"possibly null" errors at the call sites above.

- [ ] **Step 2: Fix each breakage with the null-safe rule**

Apply consistently:
- Server queries feeding **dated** views: add `where: { arriveDate: { not: null } }` (Stop) so rough stops never reach date-grid code. For trip-date-bounded views, early-return an empty/`EmptyState` when `trip.startDate == null`.
- Pure lib functions (`lib/itinerary.ts`, `lib/budget.ts`, `lib/ics.ts`, `lib/month-grid.ts`): narrow inputs to non-null dates (the callers now filter), or guard with `if (!stop.arriveDate || !stop.departDate) continue;`.
- Components typing `arriveDate: string`: where they only ever receive scheduled stops, keep `string` and rely on the upstream filter; where they may receive rough stops (Overview only), widen to `string | null` (handled in Phase 5).

Make the **minimal** guard at each site; do not change behaviour for already-dated trips.

- [ ] **Step 3: Verify compile + existing tests**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; all existing tests pass (behaviour for dated trips unchanged).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: make dated views null-safe for rough stops"
```

---

## Phase 1 — Pure logic

### Task 4: `flowDates` — the date-flow + pinning engine

**Files:**
- Create: `lib/firm-up.ts`
- Test: `lib/firm-up.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { flowDates, type FlowStop } from "./firm-up";

const rough = (id: string, nights: number | null): FlowStop => ({
  id, nights, pinned: false, arriveDate: null, departDate: null,
});
const pinned = (id: string, arriveDate: string, departDate: string): FlowStop => ({
  id, nights: null, pinned: true, arriveDate, departDate,
});

describe("flowDates", () => {
  it("flows nights forward from the anchor with same-day handoff", () => {
    const { results, conflicts } = flowDates(
      [rough("a", 3), rough("b", 2), rough("c", 2)],
      "2026-07-03",
    );
    expect(conflicts).toEqual([]);
    expect(results).toEqual([
      { id: "a", arriveDate: "2026-07-03", departDate: "2026-07-06", pinned: false, changed: true },
      { id: "b", arriveDate: "2026-07-06", departDate: "2026-07-08", pinned: false, changed: true },
      { id: "c", arriveDate: "2026-07-08", departDate: "2026-07-10", pinned: false, changed: true },
    ]);
  });

  it("defaults a null nights count to 1", () => {
    const { results } = flowDates([rough("a", null)], "2026-07-03");
    expect(results[0]).toMatchObject({ arriveDate: "2026-07-03", departDate: "2026-07-04" });
  });

  it("treats a pinned stop as an immovable boundary and resumes after it", () => {
    const { results, conflicts } = flowDates(
      [rough("a", 2), pinned("p", "2026-07-10", "2026-07-13"), rough("b", 1)],
      "2026-07-03",
    );
    expect(conflicts).toEqual([]);
    // a flows 07-03..07-05 (free days 07-05..07-10 before the pin)
    expect(results[0]).toMatchObject({ id: "a", arriveDate: "2026-07-03", departDate: "2026-07-05" });
    expect(results[1]).toMatchObject({ id: "p", arriveDate: "2026-07-10", departDate: "2026-07-13", changed: false });
    // b resumes from the pin's depart
    expect(results[2]).toMatchObject({ id: "b", arriveDate: "2026-07-13", departDate: "2026-07-14" });
  });

  it("flags a conflict when flexible stops can't fit before a pin, but keeps the pin", () => {
    const { results, conflicts } = flowDates(
      [rough("a", 9), pinned("p", "2026-07-05", "2026-07-08")],
      "2026-07-03",
    );
    // a would run to 07-12, past the pin's 07-05 arrival
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].stopId).toBe("p");
    expect(results[1]).toMatchObject({ arriveDate: "2026-07-05", departDate: "2026-07-08", changed: false });
  });

  it("marks changed=false when a stop's recomputed dates equal its current dates", () => {
    const s: FlowStop = { id: "a", nights: 3, pinned: false, arriveDate: "2026-07-03", departDate: "2026-07-06" };
    const { results } = flowDates([s], "2026-07-03");
    expect(results[0].changed).toBe(false);
  });

  it("returns empty for empty input", () => {
    expect(flowDates([], "2026-07-03")).toEqual({ results: [], conflicts: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/firm-up.test.ts`
Expected: FAIL — `flowDates` not found.

- [ ] **Step 3: Implement `lib/firm-up.ts`**

```typescript
import { addDays } from "./dates";

export interface FlowStop {
  id: string;
  nights: number | null;
  pinned: boolean;
  /** Present (and authoritative) when pinned or already scheduled. */
  arriveDate: string | null;
  departDate: string | null;
}

export interface FlowResult {
  id: string;
  arriveDate: string;
  departDate: string;
  pinned: boolean;
  /** True when the computed dates differ from the stop's current dates. */
  changed: boolean;
}

export interface FlowConflict {
  stopId: string;
  message: string;
}

/**
 * Flow calendar dates forward through an ordered list of stops.
 *
 * Non-pinned stops take `arrive = cursor`, `depart = arrive + nights` (a null
 * nights count defaults to 1), advancing the cursor with same-day handoff.
 * A pinned stop is an immovable boundary: its dates are kept as-is and the
 * cursor resumes from its depart date. If the running cursor has already passed
 * a pinned stop's arrive date, the flexible stops before it don't fit — a
 * conflict is reported (the pin is still honoured). Slack before a pin is left
 * as free days.
 */
export function flowDates(
  stops: readonly FlowStop[],
  anchorDate: string,
): { results: FlowResult[]; conflicts: FlowConflict[] } {
  const results: FlowResult[] = [];
  const conflicts: FlowConflict[] = [];
  let cursor = anchorDate;

  for (const stop of stops) {
    if (stop.pinned && stop.arriveDate && stop.departDate) {
      if (cursor > stop.arriveDate) {
        conflicts.push({
          stopId: stop.id,
          message: `Earlier stops run to ${cursor}, past this pinned arrival of ${stop.arriveDate}.`,
        });
      }
      results.push({
        id: stop.id,
        arriveDate: stop.arriveDate,
        departDate: stop.departDate,
        pinned: true,
        changed: false,
      });
      cursor = stop.departDate;
    } else {
      const nights = Math.max(0, stop.nights ?? 1);
      const arriveDate = cursor;
      const departDate = addDays(arriveDate, nights);
      results.push({
        id: stop.id,
        arriveDate,
        departDate,
        pinned: false,
        changed: arriveDate !== stop.arriveDate || departDate !== stop.departDate,
      });
      cursor = departDate;
    }
  }

  return { results, conflicts };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/firm-up.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/firm-up.ts lib/firm-up.test.ts
git commit -m "feat(firm-up): flowDates engine with pinning + conflict detection"
```

---

### Task 5: Mixed (rough + dated) chapter membership

Extend `lib/chapters.ts` so a **rough** Stop (null `arriveDate`) is grouped by its explicit `chapterId`, while a **dated** Stop keeps ADR 0008 date-band membership. A rough Chapter (null dates) only ever matches by id.

**Files:**
- Modify: `lib/chapters.ts` (StopLike ~11-17; `chapterForStop` ~37-39; `groupStopsByChapter` ~50-63)
- Test: `lib/chapters.test.ts` (add a describe block)

- [ ] **Step 1: Write the failing test** (append to `lib/chapters.test.ts`)

```typescript
describe("mixed rough + dated membership", () => {
  const FR: ChapterLike = { id: "fr", name: "France", colour: "sky", startDate: "2026-07-03", endDate: "2026-07-09" };
  const ROUGH_IT: ChapterLike = { id: "it", name: "Italy", colour: "rose", startDate: null, endDate: null };

  it("groups a dated stop by its date band and a rough stop by its chapterId", () => {
    const mixed: StopLike[] = [
      { id: "paris", arriveDate: "2026-07-03", departDate: "2026-07-06", country: "France", sortOrder: 0 },
      { id: "rome", arriveDate: null, departDate: null, nights: 3, chapterId: "it", country: "Italy", sortOrder: 1 },
    ];
    const groups = groupStopsByChapter(mixed, [FR, ROUGH_IT]);
    expect(groups.map((g) => g.chapter?.id ?? null)).toEqual(["fr", "it"]);
    expect(groups[1].stops.map((s) => s.id)).toEqual(["rome"]);
  });

  it("a rough stop with no chapterId is ungrouped", () => {
    const s: StopLike = { id: "x", arriveDate: null, departDate: null, nights: 2, chapterId: null, country: null, sortOrder: 0 };
    expect(chapterForStop(s, [FR, ROUGH_IT])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/chapters.test.ts`
Expected: FAIL — `StopLike` has no `arriveDate: null` / `chapterId`; rough stop not grouped.

- [ ] **Step 3: Update `lib/chapters.ts`**

Widen `ChapterLike` and `StopLike`, and branch `chapterForStop`:

```typescript
export interface ChapterLike {
  id: string;
  name: string;
  colour: string;
  startDate: string | null; // null while the chapter is rough
  endDate: string | null;
}

export interface StopLike {
  id: string;
  arriveDate: string | null; // null while the stop is rough
  departDate: string | null;
  nights?: number | null;
  chapterId?: string | null; // explicit membership while rough
  country?: string | null;
  sortOrder: number;
}
```

In `sortedByStart`, treat null start dates as last (rough chapters sort after dated ones):

```typescript
function sortedByStart<T extends { startDate: string | null }>(chapters: readonly T[]): T[] {
  return [...chapters].sort((a, b) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999"));
}
```

Branch `chapterForStop` on rough vs dated:

```typescript
export function chapterForStop<T extends ChapterLike>(stop: StopLike, chapters: readonly T[]): T | null {
  // Rough stop: explicit membership by chapterId.
  if (!stop.arriveDate) {
    return stop.chapterId ? (chapters.find((c) => c.id === stop.chapterId) ?? null) : null;
  }
  // Scheduled stop: ADR 0008 date-band membership (ignores chapterId).
  return chapterForDate(stop.arriveDate, chapters);
}
```

Guard `chapterForDate` against rough chapters (null bounds):

```typescript
export function chapterForDate<T extends ChapterLike>(dateISO: string, chapters: readonly T[]): T | null {
  for (const c of sortedByStart(chapters)) {
    if (c.startDate && c.endDate && isDateWithin(dateISO, c.startDate, c.endDate)) return c;
  }
  return null;
}
```

`groupStopsByChapter` is unchanged (it already calls `chapterForStop`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/chapters.test.ts`
Expected: PASS (existing + 2 new). `chaptersOverlap` callers pass non-null dates, so they're unaffected.

- [ ] **Step 5: Commit**

```bash
git add lib/chapters.ts lib/chapters.test.ts
git commit -m "feat(chapters): mixed rough (explicit) + dated (date-band) membership"
```

---

## Phase 2 — Validation

### Task 6: Stop validation — rough vs scheduled

A Stop input is either **scheduled** (name + timezone + arriveDate + departDate, departDate ≥ arriveDate) or **rough** (name + nights ≥ 0, no dates, optional chapterId). Use a discriminated approach via a `mode` field to keep the form + action explicit.

**Files:**
- Modify: `lib/validations/stop.ts`
- Test: `lib/validations/stop.test.ts`

- [ ] **Step 1: Write the failing test** (add cases to `lib/validations/stop.test.ts`)

```typescript
import { describe, expect, it } from "vitest";
import { stopSchema } from "./stop";

describe("stopSchema rough mode", () => {
  it("accepts a rough stop: name + nights, no dates", () => {
    const r = stopSchema.safeParse({ mode: "rough", name: "Rome", nights: 3, country: "Italy" });
    expect(r.success).toBe(true);
  });
  it("rejects a rough stop with negative nights", () => {
    const r = stopSchema.safeParse({ mode: "rough", name: "Rome", nights: -1 });
    expect(r.success).toBe(false);
  });
  it("still accepts a scheduled stop with dates + timezone", () => {
    const r = stopSchema.safeParse({
      mode: "scheduled", name: "London", timezone: "Europe/London",
      arriveDate: "2026-07-01", departDate: "2026-07-05",
    });
    expect(r.success).toBe(true);
  });
  it("rejects a scheduled stop missing a timezone", () => {
    const r = stopSchema.safeParse({
      mode: "scheduled", name: "London", arriveDate: "2026-07-01", departDate: "2026-07-05",
    });
    expect(r.success).toBe(false);
  });
});
```

(Keep the existing scheduled-mode tests but add `mode: "scheduled"` to their inputs.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/validations/stop.test.ts`
Expected: FAIL — schema has no `mode`/`nights`.

- [ ] **Step 3: Rewrite `lib/validations/stop.ts` as a discriminated union**

```typescript
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");
const name = z.string().trim().min(1, "Stop name is required").max(120, "Stop name must be 120 characters or fewer");

const roughStopSchema = z.object({
  mode: z.literal("rough"),
  name,
  country: z.string().trim().optional(),
  nights: z.number().int().min(0, "Nights cannot be negative").max(366),
  chapterId: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  notes: z.string().trim().optional(),
});

const scheduledStopSchema = z
  .object({
    mode: z.literal("scheduled"),
    name,
    country: z.string().trim().optional(),
    timezone: z.string().trim().min(1, "Timezone is required"),
    arriveDate: isoDate,
    departDate: isoDate,
    lat: z.number().optional(),
    lng: z.number().optional(),
    notes: z.string().trim().optional(),
  })
  .refine((d) => d.departDate >= d.arriveDate, {
    message: "Depart date must be on or after arrive date",
    path: ["departDate"],
  });

export const stopSchema = z.discriminatedUnion("mode", [roughStopSchema, scheduledStopSchema]);
export type StopInput = z.infer<typeof stopSchema>;
export type RoughStopInput = z.infer<typeof roughStopSchema>;
export type ScheduledStopInput = z.infer<typeof scheduledStopSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/validations/stop.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validations/stop.ts lib/validations/stop.test.ts
git commit -m "feat(validation): rough vs scheduled stop input (discriminated union)"
```

---

### Task 7: Chapter validation — allow rough (date-less) chapters

**Files:**
- Modify: `lib/validations/chapter.ts`
- Test: `lib/validations/chapter.test.ts`

- [ ] **Step 1: Write the failing test** (add to `lib/validations/chapter.test.ts`)

```typescript
describe("chapterSchema rough mode", () => {
  it("accepts a rough chapter: name + colour, no dates", () => {
    const r = chapterSchema.safeParse({ name: "Italy", colour: "rose" });
    expect(r.success).toBe(true);
  });
  it("accepts a dated chapter and rejects end-before-start", () => {
    expect(chapterSchema.safeParse({ name: "Italy", colour: "rose", startDate: "2026-07-10", endDate: "2026-07-17" }).success).toBe(true);
    expect(chapterSchema.safeParse({ name: "Italy", colour: "rose", startDate: "2026-07-17", endDate: "2026-07-10" }).success).toBe(false);
  });
  it("rejects a chapter with only one date set", () => {
    expect(chapterSchema.safeParse({ name: "Italy", colour: "rose", startDate: "2026-07-10" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/validations/chapter.test.ts`
Expected: FAIL — required dates reject the rough case.

- [ ] **Step 3: Update `lib/validations/chapter.ts`**

```typescript
import { z } from "zod";
import { chapterColourSchema } from "@/lib/chapter-colours";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

export const chapterSchema = z
  .object({
    name: z.string().trim().min(1, "Chapter name is required").max(120, "Chapter name must be 120 characters or fewer"),
    colour: chapterColourSchema,
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  })
  .refine((d) => (d.startDate == null) === (d.endDate == null), {
    message: "Set both dates or neither",
    path: ["endDate"],
  })
  .refine((d) => d.startDate == null || d.endDate == null || d.endDate >= d.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export type ChapterInput = z.infer<typeof chapterSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/validations/chapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validations/chapter.ts lib/validations/chapter.test.ts
git commit -m "feat(validation): allow rough (date-less) chapters"
```

---

### Task 8: Trip validation — optional dates

**Files:**
- Modify: `lib/validations/trip.ts`
- Test: `lib/validations/trip.test.ts`

- [ ] **Step 1: Write the failing test** (add to `lib/validations/trip.test.ts`)

```typescript
describe("createTripSchema optional dates", () => {
  it("accepts name + currency with no dates", () => {
    expect(createTripSchema.safeParse({ name: "Europe someday", homeCurrency: "AUD" }).success).toBe(true);
  });
  it("accepts a start date with no end date", () => {
    expect(createTripSchema.safeParse({ name: "Italy", homeCurrency: "AUD", startDate: "2026-07-03" }).success).toBe(true);
  });
  it("rejects end before start when both present", () => {
    expect(createTripSchema.safeParse({ name: "Italy", homeCurrency: "AUD", startDate: "2026-07-10", endDate: "2026-07-03" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/validations/trip.test.ts`
Expected: FAIL — dates currently required.

- [ ] **Step 3: Update `lib/validations/trip.ts`**

```typescript
import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currencies";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

export const createTripSchema = z
  .object({
    name: z.string().trim().min(1, "Trip name is required").max(120, "Trip name must be 120 characters or fewer"),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    homeCurrency: z.enum(CURRENCY_CODES as [string, ...string[]], { error: "Please select a valid currency" }),
  })
  .refine((d) => d.startDate == null || d.endDate == null || d.endDate >= d.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export type CreateTripInput = z.infer<typeof createTripSchema>;
export const tripSchema = createTripSchema;
export type TripInput = z.infer<typeof tripSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/validations/trip.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validations/trip.ts lib/validations/trip.test.ts
git commit -m "feat(validation): optional trip dates"
```

---

## Phase 3 — Server actions

> All actions follow the existing pattern (see `server/actions/stops.ts`): `"use server"`, `requireTripAccess`/`requireStopAccess`, zod parse → `validationErrors`, db write, `revalidatePath`, return `StopActionResult`. Tests follow `server/actions/stops.test.ts` (`vi.hoisted` mocks for `@/lib/db`, `@/lib/guards`, `next/cache`, `@/lib/geocode`).

### Task 9: `createStop` handles rough and scheduled input

**Files:**
- Modify: `server/actions/stops.ts` (`createStop` ~57-106)
- Test: `server/actions/stops.test.ts`

- [ ] **Step 1: Write the failing test** (add to the `createStop` describe; update existing `VALID_INPUT` to include `mode: "scheduled"`)

```typescript
const ROUGH_INPUT = { mode: "rough" as const, name: "Rome", country: "Italy", nights: 3, chapterId: "ch-1" };

it("creates a rough stop with nights, chapterId, null dates/timezone", async () => {
  stopFindFirstMock.mockResolvedValue({ sortOrder: 1 });
  stopCreateMock.mockResolvedValue({ id: "stop-9" });

  const result = await createStop("trip-1", ROUGH_INPUT);

  expect(result.success).toBe(true);
  expect(stopCreateMock).toHaveBeenCalledWith({
    data: expect.objectContaining({
      tripId: "trip-1", name: "Rome", country: "Italy",
      nights: 3, chapterId: "ch-1",
      arriveDate: null, departDate: null, timezone: null,
      pinned: false, sortOrder: 2,
    }),
  });
  // rough creation must NOT geocode synchronously (no dates/tz to anchor)
  expect(geocodePlaceMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- server/actions/stops.test.ts`
Expected: FAIL — `createStop` doesn't branch on mode.

- [ ] **Step 3: Update `createStop` in `server/actions/stops.ts`**

```typescript
export async function createStop(tripId: string, input: StopInput): Promise<StopActionResult> {
  await requireTripAccess(tripId);

  const parsed = stopSchema.safeParse(input);
  if (!parsed.success) return validationErrors(parsed.error);

  const maxStop = await db.stop.findFirst({
    where: { tripId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true },
  });
  const sortOrder = (maxStop?.sortOrder ?? -1) + 1;

  if (parsed.data.mode === "rough") {
    const { name, country, nights, chapterId, notes } = parsed.data;
    await db.stop.create({
      data: {
        tripId, name, country: country ?? null,
        nights, chapterId: chapterId ?? null,
        arriveDate: null, departDate: null, timezone: null,
        lat: null, lng: null, notes: notes ?? null, pinned: false, sortOrder,
      },
    });
    revalidatePath(`/trips/${tripId}`);
    return { success: true };
  }

  // scheduled
  const { name, country, timezone, arriveDate, departDate, notes } = parsed.data;
  let { lat, lng } = parsed.data;
  if (lat === undefined || lng === undefined) {
    const coords = await geocodePlace([name, country].filter(Boolean).join(", "));
    if (coords) { lat = coords.lat; lng = coords.lng; }
  }
  await db.stop.create({
    data: {
      tripId, name, country: country ?? null, timezone, arriveDate, departDate,
      lat: lat ?? null, lng: lng ?? null, notes: notes ?? null, pinned: false, sortOrder,
    },
  });
  revalidatePath(`/trips/${tripId}`);
  return { success: true };
}
```

Apply the same `mode` branch to `updateStop` (rough updates set `nights`/`chapterId`, null dates; scheduled updates as before). Add a test mirroring the existing `updateStop` test for the rough branch.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- server/actions/stops.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/stops.ts server/actions/stops.test.ts
git commit -m "feat(stops): create/update rough or scheduled stops"
```

---

### Task 10: `setStopDates` — set dates + ripple following non-pinned stops

Sets one stop's dates (e.g. user edits a dated stop or pins via a date picker) and re-flows the **following** stops in `sortOrder` order from the new depart date, leaving pinned stops fixed. Skips rough stops that follow (they stay rough until their own leg is firmed up): ripple only re-flows already-**dated** following stops, stopping at the first rough stop.

**Files:**
- Modify: `server/actions/stops.ts`
- Test: `server/actions/stops.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("setStopDates", () => {
  it("sets the stop's dates and ripples following dated non-pinned stops", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "b", tripId: "trip-1", sortOrder: 1 });
    // siblings after b, in order: c (dated, not pinned), d (dated, pinned), e (rough → stops ripple)
    stopFindManyMock.mockResolvedValue([
      { id: "c", sortOrder: 2, nights: 2, pinned: false, arriveDate: "2026-07-20", departDate: "2026-07-22" },
      { id: "d", sortOrder: 3, nights: null, pinned: true, arriveDate: "2026-07-25", departDate: "2026-07-28" },
      { id: "e", sortOrder: 4, nights: 3, pinned: false, arriveDate: null, departDate: null },
    ]);
    stopUpdateMock.mockResolvedValue({});

    const result = await setStopDates("b", { arriveDate: "2026-07-12", departDate: "2026-07-15" });

    expect(result.success).toBe(true);
    // b set directly
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "b" }, data: { arriveDate: "2026-07-12", departDate: "2026-07-15" } });
    // c re-flowed from 07-15 using its 2 nights
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "c" }, data: { arriveDate: "2026-07-15", departDate: "2026-07-17" } });
    // d is pinned → never updated; e is rough → ripple stopped before it
    const updatedIds = stopUpdateMock.mock.calls.map((c) => c[0].where.id);
    expect(updatedIds).not.toContain("d");
    expect(updatedIds).not.toContain("e");
  });
});
```

Add `stopFindManyMock` to the hoisted mocks and the `db.stop.findMany` mapping (mirroring the existing `findFirst`/`findUnique` wiring).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- server/actions/stops.test.ts`
Expected: FAIL — `setStopDates` not defined.

- [ ] **Step 3: Implement `setStopDates`**

```typescript
import { flowDates, type FlowStop } from "@/lib/firm-up";

export async function setStopDates(
  stopId: string,
  dates: { arriveDate: string; departDate: string },
): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);
  if (dates.departDate < dates.arriveDate) {
    return { success: false, errors: { departDate: ["Depart date must be on or after arrive date"] } };
  }

  await db.stop.update({ where: { id: stopId }, data: { arriveDate: dates.arriveDate, departDate: dates.departDate } });

  // Ripple: re-flow the contiguous run of following DATED stops from this depart date.
  const following = await db.stop.findMany({
    where: { tripId: stop.tripId, sortOrder: { gt: stop.sortOrder } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true, nights: true, pinned: true, arriveDate: true, departDate: true },
  });
  const run: typeof following = [];
  for (const s of following) {
    if (!s.arriveDate) break; // hit a rough stop → ripple stops here
    run.push(s);
  }
  if (run.length > 0) {
    const flowStops: FlowStop[] = run.map((s) => ({
      id: s.id, nights: s.nights, pinned: s.pinned, arriveDate: s.arriveDate, departDate: s.departDate,
    }));
    const { results } = flowDates(flowStops, dates.departDate);
    for (const r of results) {
      if (r.changed && !r.pinned) {
        await db.stop.update({ where: { id: r.id }, data: { arriveDate: r.arriveDate, departDate: r.departDate } });
      }
    }
  }

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- server/actions/stops.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/stops.ts server/actions/stops.test.ts
git commit -m "feat(stops): setStopDates with ripple-forward over dated stops"
```

---

### Task 11: `firmUpSegment` — date a rough chapter / ungrouped run

Dates the rough stops of one segment (a chapter, or the ungrouped run) by flowing from an anchor: the depart date of the nearest preceding scheduled stop in the trip, else the trip's start date, else an explicit anchor passed by the caller (date-less trip). Geocodes each newly-dated stop for a timezone (fallback to the trip's first known timezone, else `"UTC"`), and sets the chapter's dates to span its now-dated stops.

**Files:**
- Modify: `server/actions/stops.ts`
- Test: `server/actions/stops.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe("firmUpSegment", () => {
  it("flows rough chapter stops from the preceding scheduled stop and sets chapter dates", async () => {
    // trip stops in order: a (dated, ends 07-10), then rough Italy stops rome/venice
    tripFindUniqueMock.mockResolvedValue({ id: "trip-1", startDate: "2026-07-03", endDate: null });
    chapterFindUniqueMock.mockResolvedValue({ id: "it", tripId: "trip-1" });
    stopFindManyMock.mockResolvedValue([
      { id: "a", sortOrder: 0, chapterId: null, nights: null, pinned: false, arriveDate: "2026-07-06", departDate: "2026-07-10", timezone: "Europe/Paris" },
      { id: "rome", sortOrder: 1, chapterId: "it", nights: 3, pinned: false, arriveDate: null, departDate: null, timezone: null },
      { id: "venice", sortOrder: 2, chapterId: "it", nights: 2, pinned: false, arriveDate: null, departDate: null, timezone: null },
    ]);
    geocodePlaceMock.mockResolvedValue(null);
    stopUpdateMock.mockResolvedValue({});
    chapterUpdateMock.mockResolvedValue({});

    const result = await firmUpSegment({ tripId: "trip-1", chapterId: "it" });

    expect(result.success).toBe(true);
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "rome" }, data: expect.objectContaining({ arriveDate: "2026-07-10", departDate: "2026-07-13", timezone: "Europe/Paris" }) });
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "venice" }, data: expect.objectContaining({ arriveDate: "2026-07-13", departDate: "2026-07-15" }) });
    expect(chapterUpdateMock).toHaveBeenCalledWith({ where: { id: "it" }, data: { startDate: "2026-07-10", endDate: "2026-07-15" } });
  });
});
```

Add hoisted mocks: `tripFindUniqueMock`, `chapterFindUniqueMock`, `chapterUpdateMock`, and wire `db.trip.findUnique`, `db.chapter.findUnique`, `db.chapter.update`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- server/actions/stops.test.ts`
Expected: FAIL — `firmUpSegment` not defined.

- [ ] **Step 3: Implement `firmUpSegment`**

```typescript
export interface FirmUpSegmentArgs {
  tripId: string;
  chapterId?: string | null; // null/undefined → the ungrouped run
  anchorDate?: string;       // required only when the trip is date-less and nothing precedes
}

export async function firmUpSegment(args: FirmUpSegmentArgs): Promise<StopActionResult> {
  const { tripId, chapterId } = args;
  await requireTripAccess(tripId);

  const [trip, stops] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true } }),
    db.stop.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true, chapterId: true, nights: true, pinned: true, arriveDate: true, departDate: true, timezone: true, name: true, country: true },
    }),
  ]);

  // Segment = the rough stops belonging to this chapter (or chapterId == null for ungrouped).
  const segment = stops.filter((s) => (s.chapterId ?? null) === (chapterId ?? null) && !s.arriveDate);
  if (segment.length === 0) {
    revalidatePath(`/trips/${tripId}`);
    return { success: true };
  }

  // Anchor: depart of the nearest preceding scheduled stop, else trip start, else explicit.
  const firstIdx = stops.findIndex((s) => s.id === segment[0].id);
  let anchor: string | null = null;
  for (let i = firstIdx - 1; i >= 0; i--) {
    if (stops[i].departDate) { anchor = stops[i].departDate; break; }
  }
  anchor = anchor ?? trip?.startDate ?? args.anchorDate ?? null;
  if (!anchor) {
    return { success: false, errors: { anchorDate: ["Pick a start date for this leg — the trip has no dates yet."] } };
  }

  const { results } = flowDates(
    segment.map((s) => ({ id: s.id, nights: s.nights, pinned: false, arriveDate: null, departDate: null })),
    anchor,
  );

  // Resolve a fallback timezone once.
  const tripTz = stops.find((s) => s.timezone)?.timezone ?? "UTC";

  const segById = Object.fromEntries(segment.map((s) => [s.id, s]));
  for (const r of results) {
    const s = segById[r.id];
    let timezone = s.timezone ?? null;
    if (!timezone) {
      const coords = await geocodePlace([s.name, s.country].filter(Boolean).join(", "));
      // geocode gives coords, not tz; fall back to the trip's timezone for v1.
      timezone = tripTz;
      await db.stop.update({
        where: { id: r.id },
        data: { arriveDate: r.arriveDate, departDate: r.departDate, timezone, ...(coords ? { lat: coords.lat, lng: coords.lng } : {}) },
      });
    } else {
      await db.stop.update({ where: { id: r.id }, data: { arriveDate: r.arriveDate, departDate: r.departDate, timezone } });
    }
  }

  // Set the chapter's dates to span its now-dated stops.
  if (chapterId) {
    const start = results[0].arriveDate;
    const end = results[results.length - 1].departDate;
    await db.chapter.update({ where: { id: chapterId }, data: { startDate: start, endDate: end } });
  }

  revalidatePath(`/trips/${tripId}`);
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- server/actions/stops.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/stops.ts server/actions/stops.test.ts
git commit -m "feat(stops): firmUpSegment flows a rough leg and sets chapter dates"
```

---

### Task 12: `toggleStopPin`, `makeStopRough`, `assignStopToChapter`

**Files:**
- Modify: `server/actions/stops.ts`
- Test: `server/actions/stops.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe("toggleStopPin", () => {
  it("pins a scheduled stop", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "a", tripId: "trip-1", sortOrder: 0, arriveDate: "2026-07-03", pinned: false });
    stopUpdateMock.mockResolvedValue({});
    const r = await toggleStopPin("a");
    expect(r.success).toBe(true);
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "a" }, data: { pinned: true } });
  });
  it("refuses to pin a rough stop (no dates to fix)", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "a", tripId: "trip-1", sortOrder: 0, arriveDate: null, pinned: false });
    const r = await toggleStopPin("a");
    expect(r.success).toBe(false);
  });
});

describe("makeStopRough", () => {
  it("clears dates/timezone/pin and keeps nights from the prior duration", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "a", tripId: "trip-1", sortOrder: 0, arriveDate: "2026-07-03", departDate: "2026-07-06", nights: null });
    stopUpdateMock.mockResolvedValue({});
    await makeStopRough("a");
    expect(stopUpdateMock).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { arriveDate: null, departDate: null, timezone: null, pinned: false, nights: 3 },
    });
  });
});

describe("assignStopToChapter", () => {
  it("sets chapterId and appends to the end of that chapter's order", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "a", tripId: "trip-1", sortOrder: 0 });
    stopFindFirstMock.mockResolvedValue({ chapterSortOrder: 4 });
    stopUpdateMock.mockResolvedValue({});
    await assignStopToChapter("a", "it");
    expect(stopUpdateMock).toHaveBeenCalledWith({ where: { id: "a" }, data: { chapterId: "it", chapterSortOrder: 5 } });
  });
});
```

`requireStopAccess` currently selects `{ id, tripId, sortOrder }`. Widen its select to also return `arriveDate`, `departDate`, `nights`, `pinned` (used by the new actions). Update its return type accordingly.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- server/actions/stops.test.ts`
Expected: FAIL — actions not defined.

- [ ] **Step 3: Implement the three actions**

```typescript
import { nightsBetween } from "@/lib/dates";

export async function toggleStopPin(stopId: string): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);
  if (!stop.arriveDate) {
    return { success: false, errors: { pinned: ["Only a stop with dates can be pinned."] } };
  }
  await db.stop.update({ where: { id: stopId }, data: { pinned: !stop.pinned } });
  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

export async function makeStopRough(stopId: string): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);
  const nights = stop.arriveDate && stop.departDate ? nightsBetween(stop.arriveDate, stop.departDate) : (stop.nights ?? 1);
  await db.stop.update({
    where: { id: stopId },
    data: { arriveDate: null, departDate: null, timezone: null, pinned: false, nights },
  });
  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

export async function assignStopToChapter(stopId: string, chapterId: string | null): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);
  let chapterSortOrder = 0;
  if (chapterId) {
    const last = await db.stop.findFirst({
      where: { tripId: stop.tripId, chapterId }, orderBy: { chapterSortOrder: "desc" }, select: { chapterSortOrder: true },
    });
    chapterSortOrder = (last?.chapterSortOrder ?? -1) + 1;
  }
  await db.stop.update({ where: { id: stopId }, data: { chapterId, chapterSortOrder } });
  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- server/actions/stops.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/stops.ts server/actions/stops.test.ts
git commit -m "feat(stops): toggleStopPin, makeStopRough, assignStopToChapter"
```

---

### Task 13: Chapters action — rough create + null-date overlap safety; Trip action — optional dates

**Files:**
- Modify: `server/actions/chapters.ts` (`firstOverlap` ~50-60, `createChapter` ~71-90, `updateChapter` ~92-108)
- Modify: `server/actions/trips.ts` (`createTrip` ~28-73, `updateTrip` ~90-118)
- Test: `server/actions/chapters.test.ts`, `server/actions/trips.test.ts`

- [ ] **Step 1: Write the failing tests**

`chapters.test.ts`:
```typescript
it("creates a rough chapter (no dates) and skips the overlap check", async () => {
  chapterFindManyMock.mockResolvedValue([]); // siblings
  chapterCountMock.mockResolvedValue(1);
  chapterCreateMock.mockResolvedValue({ id: "it" });
  const r = await createChapter("trip-1", { name: "Italy", colour: "rose" });
  expect(r.success).toBe(true);
  expect(chapterCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ name: "Italy", startDate: undefined, endDate: undefined }) });
});
```
`trips.test.ts`:
```typescript
it("creates a date-less trip", async () => {
  const r = await createTrip({ name: "Europe someday", homeCurrency: "AUD" });
  // redirect throws in prod; in test the transaction creates with null dates
  expect(tripCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ name: "Europe someday", startDate: null, endDate: null }) });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- server/actions/chapters.test.ts server/actions/trips.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update the actions**

In `chapters.ts`, make `firstOverlap` skip rough chapters and skip when the new range is rough:

```typescript
async function firstOverlap(tripId: string, range: { startDate?: string; endDate?: string }, excludeId?: string) {
  if (!range.startDate || !range.endDate) return null; // rough chapter never overlaps
  const siblings = await db.chapter.findMany({ where: { tripId }, select: { id: true, startDate: true, endDate: true } });
  return siblings.find(
    (s) => s.id !== excludeId && s.startDate && s.endDate &&
      chaptersOverlap({ startDate: s.startDate, endDate: s.endDate }, { startDate: range.startDate!, endDate: range.endDate! }),
  ) ?? null;
}
```
`createChapter`/`updateChapter` already spread `parsed.data` into `data` — with optional dates this now writes `undefined` (→ null column) correctly. No other change needed there.

In `trips.ts`, change the create/update writes to coalesce optional dates to null:
```typescript
const { name, startDate, endDate, homeCurrency } = parsed.data;
// createTrip:
data: { name, startDate: startDate ?? null, endDate: endDate ?? null, homeCurrency, createdById: user.id },
// updateTrip:
data: { name, startDate: startDate ?? null, endDate: endDate ?? null, homeCurrency },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- server/actions/chapters.test.ts server/actions/trips.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/chapters.ts server/actions/trips.ts server/actions/*.test.ts
git commit -m "feat(actions): rough chapters + date-less trips"
```

---

## Phase 4 — Read model

### Task 14: Overview query selects the new fields

**Files:**
- Modify: `app/(app)/trips/[tripId]/page.tsx` (stops select ~35-65; chapters select ~93-97; props ~165-189)

- [ ] **Step 1: Add fields to the stop + chapter selects**

In the `db.stop.findMany` select, add: `nights: true, pinned: true, chapterId: true, chapterSortOrder: true`. The chapter select already returns `startDate`/`endDate` (now nullable) — no change beyond types flowing through.

- [ ] **Step 2: Order stops for the canvas**

Keep `orderBy: { sortOrder: "asc" }` (sortOrder remains the master itinerary order; rough stops carry it too). Pass `nights`, `pinned`, `chapterId` straight through to `ItineraryManager` via `initialStops`.

- [ ] **Step 3: Guard the empty-state condition**

Change the empty check so a trip with only rough stops still shows the canvas: render `ItineraryManager` whenever `stops.length === 0 || stops.length > 0` — i.e. always render the manager and let it show its own empty state (Phase 5). Remove the separate `EmptyState` early-return, or keep it only when `stops.length === 0` AND pass through `tripStartDate` possibly undefined.

- [ ] **Step 4: Verify compile + the page renders**

Run: `npx tsc --noEmit`
Expected: clean (ItineraryManager prop types updated in Phase 5; do this task and Task 15 together if the type checker complains).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/trips/[tripId]/page.tsx"
git commit -m "feat(overview): load rough-stop fields for the canvas"
```

---

## Phase 5 — The canvas UI

> These tasks modify client components. Follow existing patterns exactly: `"use client"`, `React.useState` dialog/pending state, server-action calls wrapped in `startTransition`/`setPendingId`, `confirm()` for destructive actions, `Button`/`Field`/`DateField`/`Select` primitives from `components/ui`, `formatDateRange`/`formatLongDate` for dates, `ChapterChip`/`chapterColourSwatch` for chapter colour. Component tests use Testing Library (see `components/trip/chapter-chip.test.tsx`, `components/trip/card-actions.test.tsx`).

### Task 15: StopCard renders rough vs dated; adds set-dates / pin / make-rough affordances

**Files:**
- Modify: `components/trip/stop-card.tsx`
- Test: `components/trip/stop-card.test.tsx` (create)

- [ ] **Step 1: Widen `StopCardStop` and branch the render**

`StopCardStop` gains `arriveDate: string | null`, `departDate: string | null`, `nights: number | null`, `pinned: boolean`, `timezone: string | null`. Branch:
- **Rough** (`!arriveDate`): show name + country + a "~N nights" badge + a primary **"Set dates"** affordance; no timezone/date range; subtle "rough" styling (dashed left border).
- **Scheduled** (`arriveDate`): show today's date range (`formatDateRange(arriveDate, departDate)`) + a **pin toggle** (filled when `pinned`) + a "Make rough" item in the card's overflow menu.

Add optional callbacks to props: `onSetDates?(stop)`, `onTogglePin?(id)`, `onMakeRough?(id)`. Render them via the existing `CardActions`/overflow pattern used for edit/delete/move.

- [ ] **Step 2: Write a component test**

```typescript
import { render, screen } from "@testing-library/react";
import { StopCard } from "./stop-card";

const base = { id: "a", name: "Rome", country: "Italy", sortOrder: 0, notes: null, lat: null, lng: null, timezone: null };

it("shows a nights badge and Set dates for a rough stop", () => {
  render(<StopCard stop={{ ...base, arriveDate: null, departDate: null, nights: 3, pinned: false }} isFirst isLast onEdit={() => {}} onMoveUp={() => {}} onMoveDown={() => {}} onDelete={() => {}} />);
  expect(screen.getByText(/3 nights/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /set dates/i })).toBeInTheDocument();
});

it("shows the date range and a pin control for a scheduled stop", () => {
  render(<StopCard stop={{ ...base, timezone: "Europe/Rome", arriveDate: "2026-07-10", departDate: "2026-07-13", nights: null, pinned: false }} isFirst isLast onEdit={() => {}} onMoveUp={() => {}} onMoveDown={() => {}} onDelete={() => {}} onTogglePin={() => {}} />);
  expect(screen.getByText(/Jul 2026/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /pin/i })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- components/trip/stop-card.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/trip/stop-card.tsx components/trip/stop-card.test.tsx
git commit -m "feat(stop-card): rough vs dated rendering + pin/set-dates/make-rough"
```

---

### Task 16: StopFormDialog gains a rough mode

**Files:**
- Modify: `components/trip/stop-form-dialog.tsx`

- [ ] **Step 1: Add a mode toggle + nights field**

The dialog already submits to `createStop`/`updateStop`. Add a segmented toggle (`components/ui/segmented`) "Rough / Scheduled" defaulting to **Rough** for new stops:
- **Rough**: fields = name, country (optional), nights (number input, default 2), optional chapter select (from a `chapters` prop). Submit `{ mode: "rough", name, country, nights, chapterId }`.
- **Scheduled**: existing fields (name, country, timezone, arriveDate, departDate). Submit `{ mode: "scheduled", ... }`.

Editing a rough stop opens in Rough mode; editing a scheduled stop opens in Scheduled mode.

- [ ] **Step 2: Manual verification (no unit test for the dialog wiring)**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. (Dialog interaction is covered end-to-end by the canvas; unit-testing Radix dialog internals is low-value here.)

- [ ] **Step 3: Commit**

```bash
git add components/trip/stop-form-dialog.tsx
git commit -m "feat(stop-dialog): rough mode (place + nights + chapter)"
```

---

### Task 17: Quick-add rough stops row

**Files:**
- Create: `components/trip/quick-add-stops.tsx`
- Test: `components/trip/quick-add-stops.test.tsx`

- [ ] **Step 1: Build the component**

A compact inline row: a place text input + a small nights number input (default 2) + Enter / "Add" button. On submit it calls `createStop(tripId, { mode: "rough", name, nights, chapterId })` (chapterId passed in as a prop so the row under a chapter adds into that chapter), clears the place input, and keeps focus for rapid entry. Use `useTransition`; disable while pending. Props: `{ tripId: string; chapterId?: string | null }`.

- [ ] **Step 2: Write a test**

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { QuickAddStops } from "./quick-add-stops";

const createStop = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/server/actions/stops", () => ({ createStop: (...a: unknown[]) => createStop(...a) }));

it("adds a rough stop into the given chapter and clears the input", async () => {
  render(<QuickAddStops tripId="trip-1" chapterId="it" />);
  await userEvent.type(screen.getByPlaceholderText(/add a place/i), "Rome");
  await userEvent.click(screen.getByRole("button", { name: /add/i }));
  expect(createStop).toHaveBeenCalledWith("trip-1", expect.objectContaining({ mode: "rough", name: "Rome", chapterId: "it" }));
  expect(screen.getByPlaceholderText(/add a place/i)).toHaveValue("");
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- components/trip/quick-add-stops.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/trip/quick-add-stops.tsx components/trip/quick-add-stops.test.tsx
git commit -m "feat(canvas): quick-add rough stops row"
```

---

### Task 18: ItineraryManager — wire the canvas together

**Files:**
- Modify: `components/trip/itinerary-manager.tsx`

- [ ] **Step 1: Extend types + props**

`ItineraryStop` gains `arriveDate: string | null`, `departDate: string | null`, `nights: number | null`, `pinned: boolean`, `chapterId: string | null`, `chapterSortOrder: number`; `timezone: string | null`. `ItineraryChapter` dates become `string | null`. Keep the existing grouping via `groupStopsByChapter` (now mixed-aware from Task 5).

- [ ] **Step 2: Add handlers for the new actions**

Add (mirroring existing `handleDeleteStop` pattern with `setPendingId`):
```typescript
import { setStopDates, firmUpSegment, toggleStopPin, makeStopRough } from "@/server/actions/stops";
// handleTogglePin(id) → toggleStopPin(id)
// handleMakeRough(id) → confirm("Make this stop rough again? Its dates will be cleared.") then makeStopRough(id)
// handleFirmUp(chapterId | null) → firmUpSegment({ tripId, chapterId })
// handleSetDates(stop) → open a small date dialog, then setStopDates(stop.id, { arriveDate, departDate })
```
Wire these into `renderStop` (pass `onSetDates`, `onTogglePin`, `onMakeRough` to `StopCard`).

- [ ] **Step 3: Chapter group headers: rough-aware + firm-up + quick-add**

In the grouped render, when `group.chapter.startDate` is null show "rough" (no date range) and a **"Set dates"** button on the header calling `handleFirmUp(group.chapter.id)`. When the group is the ungrouped run and contains rough stops, show a "Set dates" affordance calling `handleFirmUp(null)`. Inside every chapter body and the ungrouped run, render `<QuickAddStops tripId={tripId} chapterId={group.chapter?.id ?? null} />`.

- [ ] **Step 4: Inline "New chapter" + rough chapter creation**

Add a "+ New chapter" button at the bottom of the groups that opens `ChapterFormDialog` (Task 19) in rough mode (no dates). Keep the existing "Start a chapter here" path for dated stops.

- [ ] **Step 5: Empty state**

When `stops.length === 0`, render a warm prompt ("Sketch your trip — add a chapter or a place") with a `QuickAddStops` row and the "+ New chapter" button, instead of the bare "Add stop" button.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/trip/itinerary-manager.tsx
git commit -m "feat(canvas): rough stops, set-dates, pin, firm-up, inline chapters"
```

---

### Task 19: ChapterFormDialog — allow rough (date-less) chapters

**Files:**
- Modify: `components/trip/chapter-form-dialog.tsx`

- [ ] **Step 1: Make dates optional in the dialog**

Add a "Set dates now" toggle (default off for a brand-new chapter created from the canvas). When off, submit `{ name, colour }` (no dates) to `createChapter`. When on, show the existing start/end `DateField`s and submit dates too. Editing a dated chapter defaults the toggle on.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/trip/chapter-form-dialog.tsx
git commit -m "feat(chapter-dialog): create rough (date-less) chapters"
```

---

## Phase 6 — Trip creation

### Task 20: New-trip form — optional dates

**Files:**
- Modify: `app/(app)/trips/new/new-trip-form.tsx`

- [ ] **Step 1: Make dates optional**

Remove `required` from both `DateField`s; relabel "Start date (optional)". Only include `startDate`/`endDate` in the submitted `input` when non-empty:
```typescript
const startDate = (data.get("startDate") as string) || undefined;
const endDate = (data.get("endDate") as string) || undefined;
const input = { name: data.get("name") as string, homeCurrency: data.get("homeCurrency") as string, ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) };
```
Add helper text under the dates: "Leave blank to sketch first — you can set dates as you firm up stops."

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/trips/new/new-trip-form.tsx"
git commit -m "feat(new-trip): optional dates for date-less brainstorming"
```

---

## Phase 7 — Summary surfacing + flags

### Task 21: Summary "Not yet scheduled" section + rough/pin flags

**Files:**
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx`
- Modify: `lib/flags.ts` + `lib/flags.test.ts`

- [ ] **Step 1: Write the failing flag test** (add to `lib/flags.test.ts`)

Inspect the existing flag-builder signature in `lib/flags.ts` first. Add a flag for rough stops:
```typescript
it("flags when the trip still has rough (unscheduled) stops", () => {
  const flags = buildFlags(/* existing args */ { /* ... */ roughStopCount: 3 });
  expect(flags.some((f) => /still rough/i.test(f.message))).toBe(true);
});
```
(Adapt to the real `buildFlags` shape; pass a `roughStopCount` through or compute from stops with null `arriveDate`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/flags.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the flag + the summary section**

In `lib/flags.ts`, add a flag: when `roughStopCount > 0`, message `"${n} stop(s) still rough — set their dates to add them to the itinerary."` In `summary/page.tsx`, query rough stops (`where: { tripId, arriveDate: null }`, order by `sortOrder`) and render a "Not yet scheduled" card listing them (name + "~N nights" + chapter chip if `chapterId`), above the route map. The route map / cost rollups already only see scheduled stops (Task 3 filter) — no change there.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- lib/flags.test.ts && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/trips/[tripId]/summary/page.tsx" lib/flags.ts lib/flags.test.ts
git commit -m "feat(summary): not-yet-scheduled section + rough-stops flag"
```

---

## Phase 8 — Final verification

### Task 22: Full build + test sweep; update README + CONTEXT

**Files:**
- Modify: `README.md` (features list)
- (CONTEXT.md already updated during spec; verify it matches the build.)

- [ ] **Step 1: Full sweep**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 2: Production build (typecheck + bundling)**

Run: `npm run build`
Expected: build succeeds. (If it needs a DB at build for `prisma migrate deploy`, that's the Vercel-only build command in `vercel.json`; the local `next build` typechecks without a DB.)

- [ ] **Step 3: Update the README features**

Add to the README's feature list a "Brainstorm" bullet: sketch a trip as rough chapters + date-less stops with rough night counts, then auto-flow dates from an anchor (pinned stops stay fixed), firming up leg by leg.

- [ ] **Step 4: Commit**

```bash
git add README.md CONTEXT.md
git commit -m "docs: brainstorm planning canvas in README; CONTEXT glossary"
```

---

## Self-Review

**Spec coverage:**
- Per-stop incremental rough state → Tasks 2, 6, 9, 12 (`makeStopRough`), 15.
- Unified Overview canvas → Tasks 14, 15, 18.
- Auto-flow from anchor + ripple → Tasks 4 (`flowDates`), 10 (`setStopDates` ripple), 11 (`firmUpSegment`).
- Pinning + conflict warning → Tasks 4 (conflicts), 12 (`toggleStopPin`), 15 (pin UI), 21 (flag surfacing — pin conflicts can be added to `buildFlags` alongside roughStopCount).
- Chapters scaffold-now / date-band-later → Tasks 2 (relation), 5 (mixed membership), 7/13/19 (rough chapters), 11 (set chapter dates on firm-up).
- Trip creation name-only / optional dates → Tasks 2, 8, 13, 20.
- Rough stop fields (place + nights + optional country; tz derived on firm-up) → Tasks 6, 9, 11, 16, 17.
- Quick capture → Task 17.
- Activity ideas on rough stops → already supported (Item.stopId independent of dates); no task needed.
- Rough stops in views (Calendar/Today ignore; Summary lists; flag) → Tasks 3 (null-safe filter), 21.
- ADR 0009 → Task 1.

**Gaps intentionally deferred (noted in spec "Out of scope"):** auto-resolving pin conflicts (we flag only); free-text bulk parsing; AI itineraries; "firm up whole trip" single button (per-leg firm-up only in v1); drag-and-drop reorder between chapters (v1 uses `assignStopToChapter` + existing up/down `moveStop`; full DnD is a follow-up).

**Type consistency:** `flowDates`/`FlowStop`/`FlowResult`/`FlowConflict` (Task 4) reused verbatim in Tasks 10–11. `stopSchema` discriminated union `mode` (Task 6) used by `createStop` (Task 9), `StopFormDialog` (16), `QuickAddStops` (17). `StopActionResult` shape reused across all new stop actions. `ItineraryStop`/`ItineraryChapter` widened once (Task 18) and consumed by `StopCard` (15). `requireStopAccess` select widened in Task 12 — ensure Tasks 10/11 that read `stop.arriveDate`/`sortOrder` from it still compile (they read from `db.stop.findMany`, not the guard, so they're fine).
