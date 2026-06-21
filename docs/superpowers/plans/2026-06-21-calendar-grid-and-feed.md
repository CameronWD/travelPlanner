# Calendar Grid + Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a month-grid calendar view (with drag-to-reschedule and wishlist→day drag), a private one-way ICS subscription feed, packed-day/overlap flags, and a small hardening polish bundle.

**Architecture:** The existing `/calendar` route stays a Server Component that fetches data and calls the pure `buildItinerary()` projection. A new `"use client"` `CalendarViews` wrapper holds the Month┃Agenda toggle (localStorage-persisted, responsive default) and renders either the extracted `AgendaView` or a new presentational `MonthGrid`. Drag uses native HTML5 drag-and-drop (no new dependency, desktop-only) and calls a new `rescheduleItem` server action. The ICS feed mirrors the existing read-only ShareLink token pattern: a new `CalendarFeed` model, create/rotate/revoke/get actions, a public token route that emits `text/calendar`. Pure logic (date helpers, month-grid projection, wall-time→instant conversion, ICS serialization, flags) lives in framework-free, fully-tested `lib/` modules.

**Tech Stack:** Next.js 15 (App Router, async params), React 19, TypeScript, Tailwind v4, Prisma (SQLite dev), Vitest, Radix (`Segmented`), lucide-react, native HTML5 DnD.

---

## File structure (created / modified)

**Part 1 — Polish bundle**
- Modify: `lib/fx.ts` (add `FX_STALE_AFTER_MS` + `isRateStale`), `lib/fx.test.ts`
- Modify: `app/api/fx/route.ts`, `app/(app)/trips/[tripId]/budget/page.tsx`
- Modify: `components/trip/route-map.tsx`; Create: `public/leaflet/*.png`
- Modify: `prisma/schema.prisma` (Invite `@@unique`), `server/actions/invites.ts`, `server/actions/invites.test.ts`; Create: migration

**Part 2 — Month grid**
- Modify: `lib/dates.ts` (+ month helpers), `lib/dates.test.ts`
- Create: `lib/month-grid.ts`, `lib/month-grid.test.ts`
- Create: `components/trip/agenda-view.tsx` (extracted), `components/trip/month-grid.tsx`, `components/trip/calendar-views.tsx`
- Modify: `app/(app)/trips/[tripId]/calendar/page.tsx`

**Part 3 — Drag interactions**
- Modify: `server/actions/items.ts` (+ `rescheduleItem`); Create: `server/actions/items.reschedule.test.ts`
- Modify: `components/trip/month-grid.tsx`, `components/trip/calendar-views.tsx`

**Part 4 — Flags**
- Modify: `lib/flags.ts` (+ overlap & packed-day rules, extend `FlagItem`), `lib/flags.test.ts`
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx` (pass item times)

**Part 5 — ICS feed**
- Modify: `lib/tz.ts` (+ `zonedWallTimeToInstant`), `lib/tz.test.ts`
- Modify: `prisma/schema.prisma` (`CalendarFeed`); Create: migration
- Create: `lib/ics.ts`, `lib/ics.test.ts`
- Create: `server/actions/calendar-feed.ts`, `server/actions/calendar-feed.test.ts`
- Create: `app/api/calendar/[token]/route.ts`
- Create: `components/trip/settings/calendar-feed-panel.tsx`; Modify: `app/(app)/trips/[tripId]/settings/page.tsx`

---

# Part 1 — Polish bundle

## Task 1: Unify the FX staleness threshold

A rate is "stale" in two places with different thresholds (`app/api/fx/route.ts` uses 5 min; `budget/page.tsx` uses 24 h). `lib/fx.ts` has no threshold constant. Introduce one constant + one predicate and use it in both places. Frankfurter publishes daily, so **24 h** is the correct single threshold.

**Files:**
- Modify: `lib/fx.ts`
- Test: `lib/fx.test.ts`
- Modify: `app/api/fx/route.ts:60-65`
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx:168-186`

- [ ] **Step 1: Write the failing test** — append to `lib/fx.test.ts`:

```ts
import { FX_STALE_AFTER_MS, isRateStale } from "./fx";

describe("isRateStale", () => {
  it("FX_STALE_AFTER_MS is 24 hours", () => {
    expect(FX_STALE_AFTER_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("returns false for a rate fetched just now", () => {
    const now = 1_000_000_000_000;
    expect(isRateStale(now, now)).toBe(false);
  });

  it("returns false within the threshold (23h old)", () => {
    const now = 1_000_000_000_000;
    expect(isRateStale(now - 23 * 60 * 60 * 1000, now)).toBe(false);
  });

  it("returns true once older than 24h", () => {
    const now = 1_000_000_000_000;
    expect(isRateStale(now - 25 * 60 * 60 * 1000, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/fx.test.ts`
Expected: FAIL — `FX_STALE_AFTER_MS`/`isRateStale` are not exported.

- [ ] **Step 3: Implement in `lib/fx.ts`** — add near the top exports (after the `MergeRateResult` interface, around `lib/fx.ts:21`):

```ts
/** A fetched rate is considered stale for display once older than this. */
export const FX_STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours

/** True when a non-manual rate fetched at `fetchedAtMs` is stale relative to `nowMs`. */
export function isRateStale(fetchedAtMs: number, nowMs: number): boolean {
  return nowMs - fetchedAtMs > FX_STALE_AFTER_MS;
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `npx vitest run lib/fx.test.ts`
Expected: PASS.

- [ ] **Step 5: Use the predicate in the API route** — in `app/api/fx/route.ts`, add `FX_STALE_AFTER_MS` is not needed; import `isRateStale`. Replace the block at `route.ts:60-65`:

```ts
  } else if (stored !== null && stored.rate === rate) {
    // Rate matched the stored value — treat it as stale once past the shared threshold.
    stale = isRateStale(stored.fetchedAt.getTime(), Date.now());
    source = stale ? "stale" : "fetched";
```

Ensure the import line at the top of `route.ts` includes `isRateStale` from `@/lib/fx` (add it to the existing `@/lib/fx` import, or add `import { isRateStale } from "@/lib/fx";`).

- [ ] **Step 6: Use the predicate in the budget page** — in `app/(app)/trips/[tripId]/budget/page.tsx`, replace lines `168-169`:

```ts
  const now = new Date();
```

(delete the `staleThresholdMs` line) and replace the comparison at `182-183`:

```ts
    const stale = !stored.manual && isRateStale(stored.fetchedAt.getTime(), now.getTime());
```

Add `isRateStale` to the file's existing `@/lib/fx` import (or a new import line).

- [ ] **Step 7: Verify typecheck + full suite**

Run: `npx tsc --noEmit && npx vitest run lib/fx.test.ts`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add lib/fx.ts lib/fx.test.ts app/api/fx/route.ts "app/(app)/trips/[tripId]/budget/page.tsx"
git commit -m "fix(fx): unify rate-staleness threshold onto one 24h constant"
```

---

## Task 2: Self-host Leaflet marker icons

`components/trip/route-map.tsx:119-124` points Leaflet's default icon at `unpkg.com`. The PNGs already ship in `node_modules/leaflet/dist/images/`. Copy them into `public/leaflet/` and point at local paths. (No unit test — asset move + URL change; verified by typecheck/build and an `ls`.)

**Files:**
- Create: `public/leaflet/marker-icon.png`, `public/leaflet/marker-icon-2x.png`, `public/leaflet/marker-shadow.png`
- Modify: `components/trip/route-map.tsx:121-123`

- [ ] **Step 1: Copy the icons from the installed Leaflet package**

```bash
mkdir -p public/leaflet
cp node_modules/leaflet/dist/images/marker-icon.png public/leaflet/marker-icon.png
cp node_modules/leaflet/dist/images/marker-icon-2x.png public/leaflet/marker-icon-2x.png
cp node_modules/leaflet/dist/images/marker-shadow.png public/leaflet/marker-shadow.png
```

- [ ] **Step 2: Verify the files exist**

Run: `ls -1 public/leaflet/`
Expected: `marker-icon-2x.png`, `marker-icon.png`, `marker-shadow.png`.

- [ ] **Step 3: Point Leaflet at the local copies** — in `components/trip/route-map.tsx`, replace lines `121-123`:

```ts
        iconRetinaUrl: "/leaflet/marker-icon-2x.png",
        iconUrl: "/leaflet/marker-icon.png",
        shadowUrl: "/leaflet/marker-shadow.png",
```

- [ ] **Step 4: Verify no remaining unpkg reference**

Run: `grep -rn "unpkg.com" components/ app/ lib/`
Expected: no output (exit 1).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/leaflet components/trip/route-map.tsx
git commit -m "chore(map): self-host Leaflet marker icons, drop unpkg CDN dependency"
```

---

## Task 3: Prevent duplicate pending invites at the DB level

`Invite` has no `(tripId, email)` uniqueness; the app guards with a non-transactional `findFirst`. Add a composite unique constraint and switch the create to a race-safe idempotent `upsert`.

**Note on re-invites:** a full `@@unique([tripId, email])` means re-inviting an email that already has a row returns that existing row (the upsert's `update: {}` is a no-op). Acceptance de-dupes membership, so this is correct and matches the documented fast-follow.

**Files:**
- Modify: `prisma/schema.prisma:143-157` (Invite model)
- Create: `prisma/migrations/<timestamp>_invite_trip_email_unique/migration.sql`
- Modify: `server/actions/invites.ts:63-86`
- Modify: `server/actions/invites.test.ts`

- [ ] **Step 1: Add the constraint to the schema** — in `prisma/schema.prisma`, inside `model Invite`, add a `@@unique` alongside the existing indexes (after `@@index([email])`):

```prisma
  @@unique([tripId, email])
  @@index([tripId])
  @@index([email])
```

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name invite_trip_email_unique`
Expected: a new folder under `prisma/migrations/` containing:

```sql
-- CreateIndex
CREATE UNIQUE INDEX "Invite_tripId_email_key" ON "Invite"("tripId", "email");
```

(If the command reports existing duplicate rows in `dev.db`, delete the offending rows or reseed with `npm run db:seed`, then re-run. Seed data has no duplicate invites.)

- [ ] **Step 3: Write the failing test** — in `server/actions/invites.test.ts`, add `inviteUpsertMock` to the `vi.hoisted` block and into the `invite: { ... }` mock object, then add this test. (Add `inviteUpsertMock: vi.fn(),` to both the returned object in `vi.hoisted` and the `db.invite` mock.)

```ts
it("upserts on (tripId, email) so a duplicate cannot be created", async () => {
  inviteUpsertMock.mockResolvedValue({ id: INVITE_ID });

  const result = await inviteToTrip(TRIP_ID, "Friend@Example.com ");

  expect(result.success).toBe(true);
  expect(inviteUpsertMock).toHaveBeenCalledOnce();
  expect(inviteUpsertMock).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { tripId_email: { tripId: TRIP_ID, email: "friend@example.com" } },
      update: {},
      create: expect.objectContaining({
        tripId: TRIP_ID,
        email: "friend@example.com",
        role: "member",
      }),
    }),
  );
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run server/actions/invites.test.ts`
Expected: FAIL — code still calls `findFirst` + `create`, not `upsert`.

- [ ] **Step 5: Switch create to upsert** — in `server/actions/invites.ts`, replace the block at lines `63-86` (the `findFirst` check AND the `create`) with:

```ts
  // Idempotent + race-safe: the (tripId, email) unique constraint guarantees
  // at most one invite row per email per trip. An existing row (pending OR
  // accepted) is left untouched; acceptance de-dupes membership anyway.
  const invite = await db.invite.upsert({
    where: { tripId_email: { tripId, email: normalised } },
    update: {},
    create: {
      tripId,
      email: normalised,
      token: crypto.randomUUID(),
      role: "member",
    },
    select: { id: true },
  });

  revalidatePath(`/trips/${tripId}/settings`);
  return { success: true, inviteId: invite.id };
```

- [ ] **Step 6: Run the suite to verify it passes**

Run: `npx vitest run server/actions/invites.test.ts`
Expected: PASS. If an older test asserted on `inviteFindFirstMock`/`inviteCreateMock`, update or remove that assertion — those calls no longer happen.

- [ ] **Step 7: Regenerate Prisma client + typecheck**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: PASS (the `tripId_email` compound `where` key now exists on the generated client).

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations server/actions/invites.ts server/actions/invites.test.ts
git commit -m "fix(invites): unique (tripId,email) + idempotent upsert to kill duplicate invites"
```

---

# Part 2 — Month grid

## Task 4: Month arithmetic helpers in `lib/dates.ts`

The grid needs month navigation + labels. Add pure UTC helpers. Dates are `YYYY-MM-DD` parsed as midnight UTC (see existing `parseISODate`/`formatISODate`).

**Files:**
- Modify: `lib/dates.ts`
- Test: `lib/dates.test.ts`

- [ ] **Step 1: Write the failing test** — append to `lib/dates.test.ts`:

```ts
import { addMonths, startOfMonthISO, endOfMonthISO, formatMonthYear, monthKey } from "./dates";

describe("month helpers", () => {
  it("startOfMonthISO returns the first of the month", () => {
    expect(startOfMonthISO("2026-07-14")).toBe("2026-07-01");
  });

  it("endOfMonthISO returns the last day (July = 31)", () => {
    expect(endOfMonthISO("2026-07-14")).toBe("2026-07-31");
  });

  it("endOfMonthISO handles February in a non-leap year", () => {
    expect(endOfMonthISO("2026-02-10")).toBe("2026-02-28");
  });

  it("addMonths rolls forward across a year boundary", () => {
    expect(addMonths("2026-11-01", 2)).toBe("2027-01-01");
  });

  it("addMonths rolls backward", () => {
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("addMonths clamps the day when the target month is shorter", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("formatMonthYear renders a human label", () => {
    expect(formatMonthYear("2026-07-01")).toBe("July 2026");
  });

  it("monthKey returns YYYY-MM", () => {
    expect(monthKey("2026-07-14")).toBe("2026-07");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/dates.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement in `lib/dates.ts`** — add these exports (reuse the existing `parseISODate`/`formatISODate`; add a `MONTH_LONG` constant near `MONTH_SHORT`):

```ts
const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** First day (YYYY-MM-DD) of the month containing `s`. */
export function startOfMonthISO(s: string): string {
  const d = parseISODate(s);
  return formatISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

/** Last day (YYYY-MM-DD) of the month containing `s`. */
export function endOfMonthISO(s: string): string {
  const d = parseISODate(s);
  // Day 0 of next month = last day of this month.
  return formatISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** Add `n` calendar months, clamping the day to the target month's length. */
export function addMonths(s: string, n: number): string {
  const d = parseISODate(s);
  const targetMonthFirst = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(
    Date.UTC(targetMonthFirst.getUTCFullYear(), targetMonthFirst.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return formatISODate(
    new Date(Date.UTC(targetMonthFirst.getUTCFullYear(), targetMonthFirst.getUTCMonth(), day)),
  );
}

/** "July 2026" for any day in that month. */
export function formatMonthYear(s: string): string {
  const d = parseISODate(s);
  return `${MONTH_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "YYYY-MM" — handy for clamping month navigation by string compare. */
export function monthKey(s: string): string {
  return s.slice(0, 7);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dates.ts lib/dates.test.ts
git commit -m "feat(dates): add month arithmetic helpers for the calendar grid"
```

---

## Task 5: Pure month-grid projection (`lib/month-grid.ts`)

Build a Monday-first weeks grid for a given month anchor. Pure + testable.

**Files:**
- Create: `lib/month-grid.ts`
- Test: `lib/month-grid.test.ts`

- [ ] **Step 1: Write the failing test** — create `lib/month-grid.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MONTH_GRID_WEEKDAYS, buildMonthGrid } from "./month-grid";

describe("buildMonthGrid", () => {
  it("labels weekdays Monday-first", () => {
    expect(MONTH_GRID_WEEKDAYS).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("every row has exactly 7 days", () => {
    const weeks = buildMonthGrid("2026-07-01");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("pads leading days from the previous month (July 2026 starts on a Wednesday)", () => {
    // 2026-07-01 is a Wednesday → Mon/Tue belong to June and are out-of-month.
    const weeks = buildMonthGrid("2026-07-01");
    const first = weeks[0];
    expect(first[0]).toEqual({ dateISO: "2026-06-29", inMonth: false });
    expect(first[1]).toEqual({ dateISO: "2026-06-30", inMonth: false });
    expect(first[2]).toEqual({ dateISO: "2026-07-01", inMonth: true });
  });

  it("marks the first and last in-month days correctly", () => {
    const weeks = buildMonthGrid("2026-07-15");
    const flat = weeks.flat();
    const inMonth = flat.filter((d) => d.inMonth);
    expect(inMonth[0].dateISO).toBe("2026-07-01");
    expect(inMonth[inMonth.length - 1].dateISO).toBe("2026-07-31");
    expect(inMonth).toHaveLength(31);
  });

  it("trailing padding comes from the next month", () => {
    const weeks = buildMonthGrid("2026-07-01");
    const last = weeks[weeks.length - 1];
    const lastCell = last[last.length - 1];
    expect(lastCell.inMonth).toBe(false);
    expect(lastCell.dateISO.startsWith("2026-08")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/month-grid.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/month-grid.ts`**:

```ts
/**
 * Pure month-grid projection — Monday-first weeks of calendar days.
 * No React, no Prisma. Fully unit-testable.
 */

import { addDays, parseISODate, formatISODate, startOfMonthISO, endOfMonthISO } from "@/lib/dates";

export const MONTH_GRID_WEEKDAYS = [
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
] as const;

export interface MonthGridDay {
  dateISO: string;
  /** True when the day belongs to the anchored month (false for padding days). */
  inMonth: boolean;
}

/** Monday-indexed weekday (Mon=0 … Sun=6) for a YYYY-MM-DD string. */
function mondayIndex(dateISO: string): number {
  // getUTCDay(): Sun=0 … Sat=6. Shift so Mon=0 … Sun=6.
  return (parseISODate(dateISO).getUTCDay() + 6) % 7;
}

/**
 * Build the weeks (each exactly 7 cells, Monday-first) covering the month that
 * contains `monthAnchorISO`. Leading/trailing cells are real dates from the
 * adjacent months, flagged `inMonth: false`.
 */
export function buildMonthGrid(monthAnchorISO: string): MonthGridDay[][] {
  const monthStart = startOfMonthISO(monthAnchorISO);
  const monthEnd = endOfMonthISO(monthAnchorISO);
  const monthPrefix = monthStart.slice(0, 7);

  // Grid starts on the Monday on/before the 1st, ends on the Sunday on/after the last.
  const gridStart = addDays(monthStart, -mondayIndex(monthStart));
  const gridEnd = addDays(monthEnd, 6 - mondayIndex(monthEnd));

  const weeks: MonthGridDay[][] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    const week: MonthGridDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({ dateISO: cursor, inMonth: cursor.slice(0, 7) === monthPrefix });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

// Re-export so callers can `import { ... } from "@/lib/month-grid"` cohesively.
export { parseISODate, formatISODate };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/month-grid.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/month-grid.ts lib/month-grid.test.ts
git commit -m "feat(calendar): pure Monday-first month-grid projection"
```

---

## Task 6: Extract the agenda markup into `AgendaView`

The toggle must be client-side, but the current agenda markup lives inline in the Server Component. Extract it verbatim into a presentational `AgendaView` so both the server page (initial) and the client toggle can render it. No behaviour change.

**Files:**
- Create: `components/trip/agenda-view.tsx`
- Modify: `app/(app)/trips/[tripId]/calendar/page.tsx`

- [ ] **Step 1: Create `components/trip/agenda-view.tsx`** (no `"use client"` — presentational). Move the existing per-day `<section>` markup into it:

```tsx
import Link from "next/link";
import { MapPin } from "lucide-react";
import { formatLongDate } from "@/lib/dates";
import type { DayPlan } from "@/lib/itinerary";
import { Badge } from "@/components/ui/badge";
import { Timeline } from "@/components/trip/timeline";

export interface AgendaViewProps {
  tripId: string;
  days: DayPlan[];
}

export function AgendaView({ tripId, days }: AgendaViewProps) {
  return (
    <div className="flex flex-col gap-0 divide-y divide-border/50">
      {days.map((day) => {
        const isTravelDay = day.transportEntries.length > 0;
        const dayHref = `/trips/${tripId}/day/${day.dateISO}`;

        return (
          <section key={day.dateISO} className="py-5 first:pt-0">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <Link
                  href={dayHref}
                  className="group flex items-center gap-2 font-display text-base font-semibold text-foreground hover:text-primary transition-colors"
                >
                  {formatLongDate(day.dateISO)}
                  <span className="text-xs text-muted-foreground group-hover:text-primary/70 transition-colors">
                    →
                  </span>
                </Link>
                {day.stop && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3 shrink-0" aria-hidden="true" />
                    {day.stop.name}
                    {day.stop.country ? `, ${day.stop.country}` : ""}
                  </p>
                )}
              </div>
              {isTravelDay && (
                <Badge variant="accent" className="text-xs shrink-0">
                  Travel day
                </Badge>
              )}
            </div>
            <div className="pl-1">
              <Timeline day={day} variant="agenda" />
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Use it from the page (temporarily)** — in `calendar/page.tsx`, replace the inline `return (<div className="flex flex-col gap-0 divide-y...">...</div>)` (the whole `itinerary.map(...)` JSX block) with:

```tsx
  return <AgendaView tripId={tripId} days={itinerary} />;
```

Add the import: `import { AgendaView } from "@/components/trip/agenda-view";` and remove now-unused imports from `page.tsx` (`Link` is still used by the empty-state; keep it. `Badge`, `Timeline`, `formatLongDate`, `MapPin` may now be unused in the page — remove any the linter flags; `CalendarDays` and `MapPin` are still used by the `EmptyState`, so keep `MapPin`).

- [ ] **Step 3: Verify lint + typecheck + build**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS (fix any "unused import" lint errors in `page.tsx` by removing the dead imports).

- [ ] **Step 4: Commit**

```bash
git add components/trip/agenda-view.tsx "app/(app)/trips/[tripId]/calendar/page.tsx"
git commit -m "refactor(calendar): extract AgendaView from the calendar page (no behaviour change)"
```

---

## Task 7: The `MonthGrid` presentational component

A `"use client"` grid: stop bands, transport icon, accommodation markers, category dots, "+N more" overflow, dimmed out-of-window days, packed-day marker. Day cells link to the Day view. Accepts an **optional** `onDropItem` (wired in Part 3) — when present, item chips become draggable and cells accept drops.

**Files:**
- Create: `components/trip/month-grid.tsx`

- [ ] **Step 1: Create `components/trip/month-grid.tsx`**:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Plane, Train, Bus, Car, Ship, Navigation, LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { categoryMeta, type Category } from "@/lib/categories";
import { buildMonthGrid, MONTH_GRID_WEEKDAYS } from "@/lib/month-grid";
import { parseISODate } from "@/lib/dates";
import type { DayPlan } from "@/lib/itinerary";

/** Subtle left-border colour per stop, keyed by stop.sortOrder (purge-safe static strings). */
const STOP_BAND_CLASSES = [
  "border-l-sky-400",
  "border-l-amber-400",
  "border-l-emerald-400",
  "border-l-violet-400",
  "border-l-rose-400",
  "border-l-teal-400",
];

/** Category dot colour (purge-safe static strings), keyed by categoryMeta().color. */
const DOT_CLASSES: Record<string, string> = {
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  stone: "bg-stone-500",
};

const TRANSPORT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  FLIGHT: Plane,
  TRAIN: Train,
  BUS: Bus,
  CAR: Car,
  FERRY: Ship,
  OTHER: Navigation,
};

/** Days with more than this many timed items get a "busy" marker. Mirrors lib/flags PACKED_DAY_THRESHOLD. */
const PACKED_DAY_THRESHOLD = 6;
const MAX_VISIBLE_ITEMS = 3;

export interface MonthGridProps {
  tripId: string;
  monthAnchorISO: string;
  days: DayPlan[];
  tripStart: string;
  tripEnd: string;
  /** When provided, item chips are draggable and day cells accept drops. */
  onDropItem?: (itemId: string, dateISO: string) => void;
}

export function MonthGrid({
  tripId,
  monthAnchorISO,
  days,
  tripStart,
  tripEnd,
  onDropItem,
}: MonthGridProps) {
  const weeks = buildMonthGrid(monthAnchorISO);
  const byDate = React.useMemo(
    () => new Map(days.map((d) => [d.dateISO, d] as const)),
    [days],
  );
  const [dragOver, setDragOver] = React.useState<string | null>(null);

  const inWindow = (dateISO: string) => dateISO >= tripStart && dateISO <= tripEnd;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-xs font-medium text-muted-foreground">
        {MONTH_GRID_WEEKDAYS.map((wd) => (
          <div key={wd} className="px-1 py-2">
            {wd}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="grid grid-cols-7">
        {weeks.flat().map((cell) => {
          const day = byDate.get(cell.dateISO);
          const active = cell.inMonth && inWindow(cell.dateISO);
          const dayNum = parseISODate(cell.dateISO).getUTCDate();
          const bandClass =
            active && day?.stop
              ? STOP_BAND_CLASSES[day.stop.sortOrder % STOP_BAND_CLASSES.length]
              : "border-l-transparent";

          const timed = day?.timedItems ?? [];
          const untimed = day?.untimedItems ?? [];
          const allItems = [...timed, ...untimed];
          const visible = allItems.slice(0, MAX_VISIBLE_ITEMS);
          const overflow = allItems.length - visible.length;
          const packed = timed.length > PACKED_DAY_THRESHOLD;

          const cellInner = (
            <>
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
                  {day?.transportEntries.map((t, i) => {
                    const mode =
                      t.kind === "transport-departure" || t.kind === "transport-arrival"
                        ? t.transport.mode
                        : "OTHER";
                    const Icon = TRANSPORT_ICONS[mode] ?? Navigation;
                    return <Icon key={i} className="size-3 text-muted-foreground" aria-hidden="true" />;
                  })}
                  {day?.accommodationEntries.map((a, i) =>
                    a.kind === "accommodation-checkin" ? (
                      <LogIn key={`in-${i}`} className="size-3 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <LogOut key={`out-${i}`} className="size-3 text-rose-600" aria-hidden="true" />
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

              <ul className="mt-1 flex flex-col gap-0.5">
                {visible.map((entry) => {
                  const meta = categoryMeta(entry.item.category as Category);
                  return (
                    <li
                      key={entry.item.id}
                      draggable={Boolean(onDropItem)}
                      onDragStart={
                        onDropItem
                          ? (e) => {
                              e.dataTransfer.setData("text/item-id", entry.item.id);
                              e.dataTransfer.effectAllowed = "move";
                            }
                          : undefined
                      }
                      className={cn(
                        "flex items-center gap-1 truncate text-[11px] leading-tight text-foreground",
                        onDropItem && "cursor-grab active:cursor-grabbing",
                      )}
                    >
                      <span className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASSES[meta.color] ?? "bg-muted-foreground")} />
                      <span className="truncate">{entry.item.title}</span>
                    </li>
                  );
                })}
                {overflow > 0 && (
                  <li className="text-[11px] leading-tight text-muted-foreground">+{overflow} more</li>
                )}
              </ul>
            </>
          );

          const cellClasses = cn(
            "min-h-20 border-b border-r border-border border-l-2 p-1.5 transition-colors",
            bandClass,
            !active && "bg-muted/20",
            active && onDropItem && dragOver === cell.dateISO && "bg-primary/10 ring-1 ring-inset ring-primary",
          );

          // Drop handlers (only when interactive AND the day is in-window)
          const dropProps =
            onDropItem && active
              ? {
                  onDragOver: (e: React.DragEvent) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOver(cell.dateISO);
                  },
                  onDragLeave: () => setDragOver((d) => (d === cell.dateISO ? null : d)),
                  onDrop: (e: React.DragEvent) => {
                    e.preventDefault();
                    setDragOver(null);
                    const id = e.dataTransfer.getData("text/item-id");
                    if (id) onDropItem(id, cell.dateISO);
                  },
                }
              : {};

          if (active) {
            return (
              <div key={cell.dateISO} className={cellClasses} {...dropProps}>
                <Link
                  href={`/trips/${tripId}/day/${cell.dateISO}`}
                  className="block h-full focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                >
                  {cellInner}
                </Link>
              </div>
            );
          }

          return (
            <div key={cell.dateISO} className={cellClasses} aria-disabled="true">
              {cellInner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. (If `TRANSPORT_MODE_META` from `@/lib/transport` already maps modes→icons, prefer reusing it over the local `TRANSPORT_ICONS` map — check `components/trip/timeline.tsx` imports; if the icon set differs, keep the local map. Either way, no `unpkg`/dynamic classes.)

- [ ] **Step 3: Commit**

```bash
git add components/trip/month-grid.tsx
git commit -m "feat(calendar): presentational MonthGrid (bands, dots, markers, overflow)"
```

---

## Task 8: `CalendarViews` toggle + wire the page

A `"use client"` wrapper holding the Month┃Agenda toggle (localStorage-persisted, responsive default), month nav state (clamped to trip months), and rendering `AgendaView` or `MonthGrid`. Update the page to render it. (Drag + wishlist rail wired in Part 3; this task ships a working read-only grid.)

**Files:**
- Create: `components/trip/calendar-views.tsx`
- Modify: `app/(app)/trips/[tripId]/calendar/page.tsx`

- [ ] **Step 1: Create `components/trip/calendar-views.tsx`**:

```tsx
"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { AgendaView } from "@/components/trip/agenda-view";
import { MonthGrid } from "@/components/trip/month-grid";
import { addMonths, startOfMonthISO, formatMonthYear, monthKey } from "@/lib/dates";
import type { DayPlan } from "@/lib/itinerary";

const STORAGE_KEY = "trip-planner-calendar-view";
type View = "month" | "agenda";

export interface CalendarViewsProps {
  tripId: string;
  days: DayPlan[];
  tripStart: string;
  tripEnd: string;
}

export function CalendarViews({ tripId, days, tripStart, tripEnd }: CalendarViewsProps) {
  // SSR-safe default: render agenda until mounted, then apply stored/responsive preference.
  const [mounted, setMounted] = React.useState(false);
  const [view, setView] = React.useState<View>("agenda");
  const [monthAnchor, setMonthAnchor] = React.useState(() => startOfMonthISO(tripStart));

  React.useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "month" || stored === "agenda") {
        setView(stored);
        return;
      }
    } catch {
      // localStorage unavailable — fall through to responsive default.
    }
    setView(window.matchMedia("(min-width: 768px)").matches ? "month" : "agenda");
  }, []);

  const choose = (v: View) => {
    setView(v);
    try {
      window.localStorage.setItem(STORAGE_KEY, v);
    } catch {
      // ignore persistence failure
    }
  };

  const canPrev = monthKey(monthAnchor) > monthKey(tripStart);
  const canNext = monthKey(monthAnchor) < monthKey(tripEnd);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          type="single"
          value={view}
          onValueChange={(v) => v && choose(v as View)}
          aria-label="Calendar view"
        >
          <SegmentedItem value="month">Month</SegmentedItem>
          <SegmentedItem value="agenda">Agenda</SegmentedItem>
        </Segmented>

        {mounted && view === "month" && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!canPrev}
              onClick={() => setMonthAnchor((m) => addMonths(m, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <span className="min-w-32 text-center font-display text-sm font-semibold">
              {formatMonthYear(monthAnchor)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!canNext}
              onClick={() => setMonthAnchor((m) => addMonths(m, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {/* Body */}
      {mounted && view === "month" ? (
        <MonthGrid
          tripId={tripId}
          monthAnchorISO={monthAnchor}
          days={days}
          tripStart={tripStart}
          tripEnd={tripEnd}
        />
      ) : (
        <AgendaView tripId={tripId} days={days} />
      )}
    </div>
  );
}
```

If `Button` has no `size="icon"` variant, use `variant="outline" size="sm"` with the icon only. Verify against `components/ui/button.tsx`.

- [ ] **Step 2: Wire the page** — in `calendar/page.tsx`, replace `return <AgendaView .../>;` (from Task 6) with:

```tsx
  return (
    <CalendarViews
      tripId={tripId}
      days={itinerary}
      tripStart={trip.startDate}
      tripEnd={trip.endDate}
    />
  );
```

Swap the import: replace `import { AgendaView } from "@/components/trip/agenda-view";` with `import { CalendarViews } from "@/components/trip/calendar-views";` (the page no longer references `AgendaView` directly).

- [ ] **Step 3: Verify typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS. The grid renders for desktop, agenda for mobile, toggle persists.

- [ ] **Step 4: Commit**

```bash
git add components/trip/calendar-views.tsx "app/(app)/trips/[tripId]/calendar/page.tsx"
git commit -m "feat(calendar): Month/Agenda toggle with month grid (persisted, responsive)"
```

---

# Part 3 — Drag interactions

## Task 9: `rescheduleItem` server action

One action for both drag-to-reschedule and wishlist→day: set an item's `date` and reassign `stopId` to whichever stop covers that day (keeps existing `startTime`/`endTime`). Rejects dates outside the trip window.

**Files:**
- Modify: `server/actions/items.ts`
- Create: `server/actions/items.reschedule.test.ts`

- [ ] **Step 1: Write the failing test** — create `server/actions/items.reschedule.test.ts` (self-contained mocks, mirroring the `trips.test.ts` hoisted style):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  requireTripAccessMock,
  revalidatePathMock,
  itemFindUniqueMock,
  itemUpdateMock,
  tripFindUniqueMock,
  stopFindManyMock,
  notFoundMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  revalidatePathMock: vi.fn(),
  itemFindUniqueMock: vi.fn(),
  itemUpdateMock: vi.fn().mockResolvedValue({}),
  tripFindUniqueMock: vi.fn(),
  stopFindManyMock: vi.fn().mockResolvedValue([]),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/db", () => ({
  db: {
    item: { findUnique: itemFindUniqueMock, update: itemUpdateMock },
    trip: { findUnique: tripFindUniqueMock },
    stop: { findMany: stopFindManyMock },
  },
}));

import { rescheduleItem } from "./items";

const TRIP_ID = "trip-abc";
const ITEM_ID = "item-1";

afterEach(() => vi.clearAllMocks());

function arrangeTrip() {
  itemFindUniqueMock.mockResolvedValue({ id: ITEM_ID, tripId: TRIP_ID });
  tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: "2026-07-31" });
  stopFindManyMock.mockResolvedValue([
    { id: "stop-paris", arriveDate: "2026-07-01", departDate: "2026-07-10", sortOrder: 0 },
    { id: "stop-rome", arriveDate: "2026-07-11", departDate: "2026-07-20", sortOrder: 1 },
  ]);
}

describe("rescheduleItem", () => {
  it("is access-checked via requireTripAccess(tripId)", async () => {
    arrangeTrip();
    await rescheduleItem(ITEM_ID, "2026-07-05");
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("sets date and reassigns stopId to the covering stop", async () => {
    arrangeTrip();
    const result = await rescheduleItem(ITEM_ID, "2026-07-15");
    expect(result.success).toBe(true);
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { date: "2026-07-15", stopId: "stop-rome" },
    });
  });

  it("sets stopId to null on a gap day with no covering stop", async () => {
    arrangeTrip();
    await rescheduleItem(ITEM_ID, "2026-07-25"); // after both stops, still in trip window
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: ITEM_ID },
      data: { date: "2026-07-25", stopId: null },
    });
  });

  it("rejects a date outside the trip window without updating", async () => {
    arrangeTrip();
    const result = await rescheduleItem(ITEM_ID, "2026-08-15");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.date).toBeDefined();
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed date", async () => {
    arrangeTrip();
    const result = await rescheduleItem(ITEM_ID, "15-07-2026");
    expect(result.success).toBe(false);
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/actions/items.reschedule.test.ts`
Expected: FAIL — `rescheduleItem` not exported.

- [ ] **Step 3: Implement `rescheduleItem` in `server/actions/items.ts`** — add `stopForDate` to the `@/lib/itinerary` usage (import it) and append the action. (`requireItemAccess`, `revalidateItemPaths`, and `ItemActionResult` already exist in this file.)

Add import at top:

```ts
import { stopForDate } from "@/lib/itinerary";
```

Append the action:

```ts
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Move an item to `targetDateISO`, reassigning its stop to whichever stop covers
 * that day (null on a gap day). Keeps the item's existing start/end time. Used by
 * month-grid drag-to-reschedule and wishlist→day drops. Rejects dates outside the
 * trip window.
 */
export async function rescheduleItem(
  itemId: string,
  targetDateISO: string,
): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);

  if (!ISO_DATE_RE.test(targetDateISO)) {
    return { success: false, errors: { date: ["Date must be in YYYY-MM-DD format"] } };
  }

  const trip = await db.trip.findUnique({
    where: { id: item.tripId },
    select: { startDate: true, endDate: true },
  });
  if (!trip) notFound();

  if (targetDateISO < trip.startDate || targetDateISO > trip.endDate) {
    return { success: false, errors: { date: ["That day is outside the trip."] } };
  }

  const stops = await db.stop.findMany({
    where: { tripId: item.tripId },
    select: { id: true, name: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true },
  });

  const covering = stopForDate(
    stops.map((s) => ({
      id: s.id,
      name: s.name,
      timezone: s.timezone,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
      sortOrder: s.sortOrder,
    })),
    targetDateISO,
  );

  await db.item.update({
    where: { id: itemId },
    data: { date: targetDateISO, stopId: covering?.id ?? null },
  });

  revalidateItemPaths(item.tripId);
  return { success: true };
}
```

Note: the test mocks `stop.findMany` to return objects without `name`/`timezone`; `stopForDate` only reads `arriveDate`/`departDate`/`sortOrder`, so the mapping above tolerates missing fields at runtime in tests. In production the `select` includes all required fields.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/actions/items.reschedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/actions/items.ts server/actions/items.reschedule.test.ts
git commit -m "feat(items): rescheduleItem action (set date + reassign covering stop)"
```

---

## Task 10: Wire drag-to-reschedule into the grid

Pass an `onDropItem` handler from `CalendarViews` to `MonthGrid` that calls `rescheduleItem`, then refreshes. Optimistic feel via `router.refresh()`; revert is implicit (server is source of truth) with an error toast on failure.

**Files:**
- Modify: `components/trip/calendar-views.tsx`

- [ ] **Step 1: Add the drop handler to `CalendarViews`** — add imports:

```tsx
import { useRouter } from "next/navigation";
import { rescheduleItem } from "@/server/actions/items";
import { toast } from "sonner";
```

(Confirm the toast util: check how other components surface errors — search `components/` for `toast(` / `sonner`. If the repo uses a different toast import, match it. If there is no toast system, replace `toast.error(...)` with `console.error(...)` and skip the import.)

Inside the component, add:

```tsx
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const handleDropItem = React.useCallback(
    (itemId: string, dateISO: string) => {
      startTransition(async () => {
        const result = await rescheduleItem(itemId, dateISO);
        if (!result.success) {
          toast.error(result.errors.date?.[0] ?? "Couldn't move that item.");
          return;
        }
        router.refresh();
      });
    },
    [router],
  );
```

- [ ] **Step 2: Pass it to `MonthGrid`** — update the `<MonthGrid .../>` render to include `onDropItem={handleDropItem}` and add a subtle busy affordance:

```tsx
        <div className={pending ? "pointer-events-none opacity-70" : undefined}>
          <MonthGrid
            tripId={tripId}
            monthAnchorISO={monthAnchor}
            days={days}
            tripStart={tripStart}
            tripEnd={tripEnd}
            onDropItem={handleDropItem}
          />
        </div>
```

- [ ] **Step 3: Verify typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS. Dragging an item chip onto another in-window day reschedules it; dropping on a dimmed day does nothing (no drop handler bound).

- [ ] **Step 4: Commit**

```bash
git add components/trip/calendar-views.tsx
git commit -m "feat(calendar): drag an item to another day to reschedule it"
```

---

## Task 11: Wishlist rail + wishlist→day drag

Fetch unscheduled items on the calendar page and render a collapsible Wishlist rail beside the grid. Dragging a wishlist item onto a day reuses `handleDropItem` (it just sets date + stop; the item has no time, so it lands untimed).

**Files:**
- Modify: `app/(app)/trips/[tripId]/calendar/page.tsx`
- Modify: `components/trip/calendar-views.tsx`

- [ ] **Step 1: Fetch unscheduled items on the page** — in `calendar/page.tsx`, add a fifth query to the `Promise.all([...])` (after `accommodations`):

```tsx
    db.item.findMany({
      where: { tripId, date: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, category: true, stopId: true },
    }),
```

Destructure it: `const [stops, items, transports, accommodations, wishlistItems] = await Promise.all([...]);`

Pass it to `CalendarViews`: add prop `wishlistItems={wishlistItems}`.

- [ ] **Step 2: Accept + render the rail in `CalendarViews`** — extend props:

```tsx
export interface WishlistRailItem {
  id: string;
  title: string;
  category: string;
}

export interface CalendarViewsProps {
  tripId: string;
  days: DayPlan[];
  tripStart: string;
  tripEnd: string;
  wishlistItems: WishlistRailItem[];
}
```

Add imports:

```tsx
import { categoryMeta, type Category } from "@/lib/categories";
import { cn } from "@/lib/cn";
```

Add collapse state: `const [railOpen, setRailOpen] = React.useState(true);`

Wrap the month body in a 2-column layout (rail only in month view, only when there are wishlist items). Replace the month branch body with:

```tsx
      {mounted && view === "month" ? (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className={cn("flex-1", pending && "pointer-events-none opacity-70")}>
            <MonthGrid
              tripId={tripId}
              monthAnchorISO={monthAnchor}
              days={days}
              tripStart={tripStart}
              tripEnd={tripEnd}
              onDropItem={handleDropItem}
            />
          </div>

          {wishlistItems.length > 0 && (
            <aside className="lg:w-56 lg:shrink-0">
              <button
                type="button"
                onClick={() => setRailOpen((o) => !o)}
                className="mb-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Wishlist ({wishlistItems.length}) {railOpen ? "▾" : "▸"}
              </button>
              {railOpen && (
                <ul className="flex flex-col gap-1.5">
                  {wishlistItems.map((w) => {
                    const meta = categoryMeta(w.category as Category);
                    return (
                      <li
                        key={w.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/item-id", w.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        className="flex cursor-grab items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-xs active:cursor-grabbing"
                      >
                        <span className={cn("size-2 shrink-0 rounded-full", DOT_RAIL[meta.color] ?? "bg-muted-foreground")} />
                        <span className="truncate">{w.title}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">Drag onto a day to schedule.</p>
            </aside>
          )}
        </div>
      ) : (
        <AgendaView tripId={tripId} days={days} />
      )}
```

Add the rail dot map near the top of the file (purge-safe static strings):

```tsx
const DOT_RAIL: Record<string, string> = {
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  stone: "bg-stone-500",
};
```

- [ ] **Step 3: Verify typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS. A wishlist item dragged onto an in-window day disappears from the rail (it now has a date) after `router.refresh()`.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/trips/[tripId]/calendar/page.tsx" components/trip/calendar-views.tsx
git commit -m "feat(calendar): wishlist rail with drag-onto-a-day scheduling"
```

---

# Part 4 — Flags

## Task 12: Packed-day + time-overlap flags

Add two pure rules to `lib/flags.ts`, extend `FlagItem` with `startTime`/`endTime`, register them in `detectFlags`, and pass item times from the Summary page.

**Files:**
- Modify: `lib/flags.ts`
- Test: `lib/flags.test.ts`
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx`

- [ ] **Step 1: Write the failing tests** — append to `lib/flags.test.ts` (and add `flagItemTimeOverlaps, flagPackedDays` to the existing import from `./flags`):

```ts
describe("flagItemTimeOverlaps", () => {
  it("fires a warning when two timed items overlap on the same day", () => {
    const items: FlagItem[] = [
      makeItem({ id: "i1", date: "2026-07-02", startTime: "10:00", endTime: "12:00" }),
      makeItem({ id: "i2", date: "2026-07-02", startTime: "11:00", endTime: "13:00" }),
    ];
    const flags = flagItemTimeOverlaps(items);
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("warning");
    expect(flags[0].targetType).toBe("DAY");
    expect(flags[0].date).toBe("2026-07-02");
  });

  it("does NOT fire for back-to-back items that merely touch", () => {
    const items: FlagItem[] = [
      makeItem({ id: "i1", date: "2026-07-02", startTime: "10:00", endTime: "11:00" }),
      makeItem({ id: "i2", date: "2026-07-02", startTime: "11:00", endTime: "12:00" }),
    ];
    expect(flagItemTimeOverlaps(items)).toHaveLength(0);
  });

  it("ignores items without an endTime (no duration to overlap)", () => {
    const items: FlagItem[] = [
      makeItem({ id: "i1", date: "2026-07-02", startTime: "10:00" }),
      makeItem({ id: "i2", date: "2026-07-02", startTime: "10:30" }),
    ];
    expect(flagItemTimeOverlaps(items)).toHaveLength(0);
  });

  it("does not fire across different days", () => {
    const items: FlagItem[] = [
      makeItem({ id: "i1", date: "2026-07-02", startTime: "10:00", endTime: "12:00" }),
      makeItem({ id: "i2", date: "2026-07-03", startTime: "11:00", endTime: "13:00" }),
    ];
    expect(flagItemTimeOverlaps(items)).toHaveLength(0);
  });
});

describe("flagPackedDays", () => {
  it("fires an info flag when a day has more than 6 timed items", () => {
    const items: FlagItem[] = Array.from({ length: 7 }, (_, i) =>
      makeItem({ id: `i${i}`, date: "2026-07-02", startTime: "09:00" }),
    );
    const flags = flagPackedDays(items);
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("info");
    expect(flags[0].date).toBe("2026-07-02");
  });

  it("does NOT fire at exactly 6 timed items", () => {
    const items: FlagItem[] = Array.from({ length: 6 }, (_, i) =>
      makeItem({ id: `i${i}`, date: "2026-07-02", startTime: "09:00" }),
    );
    expect(flagPackedDays(items)).toHaveLength(0);
  });

  it("counts only timed items toward the threshold", () => {
    const items: FlagItem[] = [
      ...Array.from({ length: 6 }, (_, i) => makeItem({ id: `t${i}`, date: "2026-07-02", startTime: "09:00" })),
      ...Array.from({ length: 5 }, (_, i) => makeItem({ id: `u${i}`, date: "2026-07-02" })),
    ];
    expect(flagPackedDays(items)).toHaveLength(0); // only 6 timed → not packed
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/flags.test.ts`
Expected: FAIL — functions not exported; `makeItem` doesn't accept `startTime`/`endTime`.

- [ ] **Step 3: Extend `FlagItem` + `makeItem`** — in `lib/flags.ts`, add two fields to `FlagItem` (after `date`):

```ts
export interface FlagItem {
  id: string;
  stopId?: string | null;
  date?: string | null; // YYYY-MM-DD
  startTime?: string | null; // HH:MM
  endTime?: string | null; // HH:MM
}
```

In `lib/flags.test.ts`, update the `makeItem` factory defaults to include `startTime: null, endTime: null` (so existing call sites stay valid):

```ts
const makeItem = (
  overrides: Partial<FlagItem> & Pick<FlagItem, "id">,
): FlagItem => ({
  stopId: null,
  date: null,
  startTime: null,
  endTime: null,
  ...overrides,
});
```

- [ ] **Step 4: Implement the two rules in `lib/flags.ts`** — add before `detectFlags`:

```ts
// ---------------------------------------------------------------------------
// Rule 6: Item time overlap (warning)
//
// Two timed items on the same day whose [startTime, endTime] intervals overlap.
// Items without an endTime have no duration and are ignored. One flag per day.
// ---------------------------------------------------------------------------

export function flagItemTimeOverlaps(items: FlagItem[]): Flag[] {
  const byDate = new Map<string, { start: string; end: string }[]>();
  for (const item of items) {
    if (!item.date || !item.startTime || !item.endTime) continue;
    const list = byDate.get(item.date) ?? [];
    list.push({ start: item.startTime, end: item.endTime });
    byDate.set(item.date, list);
  }

  const flags: Flag[] = [];
  for (const [date, intervals] of byDate) {
    const sorted = [...intervals].sort((a, b) => (a.start < b.start ? -1 : 1));
    let overlaps = false;
    for (let i = 1; i < sorted.length; i++) {
      // Overlap when the next item starts strictly before the previous ends.
      if (sorted[i].start < sorted[i - 1].end) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) {
      flags.push({
        id: `item-overlap-${date}`,
        severity: "warning",
        message: `Two or more items overlap in time on ${date}.`,
        targetType: "DAY",
        date,
      });
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Rule 7: Packed day (info)
//
// More than PACKED_DAY_THRESHOLD timed items scheduled on one day.
// ---------------------------------------------------------------------------

export const PACKED_DAY_THRESHOLD = 6;

export function flagPackedDays(items: FlagItem[]): Flag[] {
  const countByDate = new Map<string, number>();
  for (const item of items) {
    if (!item.date || !item.startTime) continue; // timed items only
    countByDate.set(item.date, (countByDate.get(item.date) ?? 0) + 1);
  }

  const flags: Flag[] = [];
  for (const [date, count] of countByDate) {
    if (count > PACKED_DAY_THRESHOLD) {
      flags.push({
        id: `packed-day-${date}`,
        severity: "info",
        message: `Busy day: ${count} items scheduled on ${date}.`,
        targetType: "DAY",
        date,
      });
    }
  }
  return flags;
}
```

- [ ] **Step 5: Register them in `detectFlags`** — add to the returned array (after `flagRouteBacktracking(stops)`):

```ts
    ...flagItemTimeOverlaps(items),
    ...flagPackedDays(items),
```

Update the JSDoc rule list above `detectFlags` to mention rules 6 + 7.

- [ ] **Step 6: Run the suite to verify it passes**

Run: `npx vitest run lib/flags.test.ts`
Expected: PASS (including all pre-existing flag tests, since `makeItem` defaults are backward-compatible).

- [ ] **Step 7: Pass item times from the Summary page** — open `app/(app)/trips/[tripId]/summary/page.tsx`. In the Prisma `item` query `select`, add `startTime: true, endTime: true`. Where the items are mapped into the `detectFlags({ ... items })` input, include `startTime: item.startTime, endTime: item.endTime`. (Search the file for `detectFlags(` and for the item `select` block; add the two fields in both places.)

- [ ] **Step 8: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/flags.ts lib/flags.test.ts "app/(app)/trips/[tripId]/summary/page.tsx"
git commit -m "feat(flags): packed-day and time-overlap detection"
```

---

# Part 5 — ICS feed

## Task 13: `zonedWallTimeToInstant` in `lib/tz.ts`

ICS timed events are emitted in UTC, so a local wall time (HH:MM in a stop's IANA zone) must be converted to a UTC instant. Add a DST-correct helper using `Intl`.

**Files:**
- Modify: `lib/tz.ts`
- Test: `lib/tz.test.ts`

- [ ] **Step 1: Write the failing test** — append to `lib/tz.test.ts`:

```ts
import { zonedWallTimeToInstant } from "./tz";

describe("zonedWallTimeToInstant", () => {
  it("converts a UTC wall time to the same instant", () => {
    const d = zonedWallTimeToInstant("2026-07-09", "10:00", "UTC");
    expect(d.toISOString()).toBe("2026-07-09T10:00:00.000Z");
  });

  it("converts a summer Paris wall time (UTC+2) back to UTC", () => {
    // 10:00 in Paris in July = 08:00 UTC.
    const d = zonedWallTimeToInstant("2026-07-09", "10:00", "Europe/Paris");
    expect(d.toISOString()).toBe("2026-07-09T08:00:00.000Z");
  });

  it("converts a winter Paris wall time (UTC+1) back to UTC", () => {
    // 10:00 in Paris in January = 09:00 UTC.
    const d = zonedWallTimeToInstant("2026-01-09", "10:00", "Europe/Paris");
    expect(d.toISOString()).toBe("2026-01-09T09:00:00.000Z");
  });

  it("converts a New York summer wall time (UTC-4) to UTC", () => {
    const d = zonedWallTimeToInstant("2026-07-09", "10:00", "America/New_York");
    expect(d.toISOString()).toBe("2026-07-09T14:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/tz.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement in `lib/tz.ts`**:

```ts
/**
 * Offset (ms) of `timeZone` from UTC at the moment represented by `utcDate`.
 * Positive east of UTC. Uses Intl to read the zone's wall-clock for that instant.
 */
function tzOffsetMs(utcDate: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(utcDate);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // some engines emit "24" for midnight
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUTC - utcDate.getTime();
}

/**
 * Convert a wall-clock time (`dateISO` = YYYY-MM-DD, `hhmm` = HH:MM) in `timeZone`
 * to the corresponding UTC instant. DST-correct (two-pass to settle transitions).
 * Falls back to treating the input as UTC if `timeZone` is invalid.
 */
export function zonedWallTimeToInstant(dateISO: string, hhmm: string, timeZone: string): Date {
  const naiveUTC = Date.parse(`${dateISO}T${hhmm}:00Z`);
  if (Number.isNaN(naiveUTC)) return new Date(NaN);
  try {
    // First guess: subtract the offset at the naive instant.
    const offset1 = tzOffsetMs(new Date(naiveUTC), timeZone);
    const guess = naiveUTC - offset1;
    // Second pass: recompute offset at the guessed instant (settles DST edges).
    const offset2 = tzOffsetMs(new Date(guess), timeZone);
    return new Date(naiveUTC - offset2);
  } catch {
    return new Date(naiveUTC);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/tz.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tz.ts lib/tz.test.ts
git commit -m "feat(tz): zonedWallTimeToInstant for ICS UTC conversion"
```

---

## Task 14: `CalendarFeed` model + migration

Mirror the `ShareLink` token pattern with a dedicated model (keeps the `.ics` token independent of the read-only-page token).

**Files:**
- Modify: `prisma/schema.prisma` (new model + back-relation on `Trip`)
- Create: migration

- [ ] **Step 1: Add the model** — in `prisma/schema.prisma`, add near `ShareLink` (around line 407):

```prisma
model CalendarFeed {
  id        String   @id @default(cuid())
  tripId    String   @unique
  token     String   @unique
  createdAt DateTime @default(now())

  trip Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)
}
```

And add the back-relation inside `model Trip` (next to `shareLink ShareLink?` at line 119):

```prisma
  calendarFeed   CalendarFeed?
```

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name add_calendar_feed`
Expected: a migration containing:

```sql
-- CreateTable
CREATE TABLE "CalendarFeed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarFeed_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarFeed_tripId_key" ON "CalendarFeed"("tripId");
CREATE UNIQUE INDEX "CalendarFeed_token_key" ON "CalendarFeed"("token");
```

- [ ] **Step 3: Regenerate client + typecheck**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): CalendarFeed model for the ICS subscription feed"
```

---

## Task 15: ICS serialization (`lib/ics.ts`)

Pure RFC-5545 generator. Timed items → UTC `VEVENT`s (via `zonedWallTimeToInstant`); untimed items → all-day; transport → UTC timed; accommodation → multi-day all-day "Stay" block. Escapes text, folds long lines, accepts a fixed `generatedAt` for deterministic tests.

**Files:**
- Create: `lib/ics.ts`
- Test: `lib/ics.test.ts`

- [ ] **Step 1: Write the failing test** — create `lib/ics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildICS, type IcsInput } from "./ics";

const GEN = new Date("2026-06-21T00:00:00Z");

const base: IcsInput = {
  tripName: "Europe 2026",
  stops: [{ id: "s-paris", name: "Paris", timezone: "Europe/Paris" }],
  items: [],
  transports: [],
  accommodations: [],
  generatedAt: GEN,
};

describe("buildICS", () => {
  it("emits a VCALENDAR envelope with CRLF line endings", () => {
    const ics = buildICS(base);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
  });

  it("emits a timed item as a UTC VEVENT in the stop timezone", () => {
    const ics = buildICS({
      ...base,
      items: [
        { id: "i1", title: "Louvre", category: "SIGHTSEEING", date: "2026-07-09", startTime: "10:00", endTime: "12:00", stopId: "s-paris", address: "Rue de Rivoli", link: null, booking: null, notes: null },
      ],
    });
    expect(ics).toContain("SUMMARY:Louvre");
    expect(ics).toContain("DTSTART:20260709T080000Z"); // 10:00 Paris = 08:00 UTC
    expect(ics).toContain("DTEND:20260709T100000Z");
    expect(ics).toContain("LOCATION:Rue de Rivoli");
    expect(ics).toContain("UID:item-i1@trip-planner");
  });

  it("emits an untimed item as an all-day event", () => {
    const ics = buildICS({
      ...base,
      items: [
        { id: "i2", title: "Colosseum", category: "SIGHTSEEING", date: "2026-07-10", startTime: null, endTime: null, stopId: null, address: null, link: null, booking: null, notes: null },
      ],
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260710");
    expect(ics).toContain("DTEND;VALUE=DATE:20260711"); // exclusive end = next day
  });

  it("emits transport as a UTC timed VEVENT with a route title", () => {
    const ics = buildICS({
      ...base,
      transports: [
        { id: "t1", mode: "FLIGHT", depPlace: "Paris", arrPlace: "Rome", depAt: new Date("2026-07-09T12:30:00Z"), arrAt: new Date("2026-07-09T14:40:00Z"), reference: "BA123" },
      ],
    });
    expect(ics).toContain("DTSTART:20260709T123000Z");
    expect(ics).toContain("DTEND:20260709T144000Z");
    expect(ics).toMatch(/SUMMARY:.*Paris . Rome.*BA123/);
  });

  it("emits accommodation as a multi-day all-day Stay block", () => {
    const ics = buildICS({
      ...base,
      accommodations: [
        { id: "a1", name: "Hotel Roma", checkIn: "2026-07-09", checkOut: "2026-07-12", address: "Via Roma 1", confirmation: "XYZ", notes: null },
      ],
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260709");
    expect(ics).toContain("DTEND;VALUE=DATE:20260712");
    expect(ics).toMatch(/SUMMARY:.*Stay.*Hotel Roma/);
  });

  it("escapes commas, semicolons and newlines in text", () => {
    const ics = buildICS({
      ...base,
      items: [
        { id: "i3", title: "Dinner, fancy; nice", category: "FOOD", date: "2026-07-09", startTime: null, endTime: null, stopId: null, address: null, link: null, booking: null, notes: "line1\nline2" },
      ],
    });
    expect(ics).toContain("SUMMARY:Dinner\\, fancy\\; nice");
    expect(ics).toContain("line1\\nline2");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/ics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/ics.ts`**:

```ts
/**
 * Pure RFC-5545 (iCalendar) serializer for a trip's timeline.
 * No React/Prisma/network. Timed events are emitted in UTC; all-day events use
 * VALUE=DATE. Deterministic given `generatedAt`.
 */

import { addDays } from "@/lib/dates";
import { zonedWallTimeToInstant } from "@/lib/tz";

export interface IcsStop {
  id: string;
  name: string;
  timezone: string;
}
export interface IcsItem {
  id: string;
  title: string;
  category: string;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  stopId?: string | null;
  address?: string | null;
  link?: string | null;
  booking?: string | null;
  notes?: string | null;
}
export interface IcsTransport {
  id: string;
  mode: string;
  depPlace?: string | null;
  arrPlace?: string | null;
  depAt?: Date | string | null;
  arrAt?: Date | string | null;
  reference?: string | null;
}
export interface IcsAccommodation {
  id: string;
  name: string;
  checkIn: string;
  checkOut: string;
  address?: string | null;
  confirmation?: string | null;
  notes?: string | null;
}
export interface IcsInput {
  tripName: string;
  stops: IcsStop[];
  items: IcsItem[];
  transports: IcsTransport[];
  accommodations: IcsAccommodation[];
  generatedAt: Date;
}

const CRLF = "\r\n";

/** Escape RFC-5545 TEXT values. */
function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** YYYYMMDD for all-day dates. */
function dateValue(dateISO: string): string {
  return dateISO.replace(/-/g, "");
}

/** YYYYMMDDTHHMMSSZ from a UTC instant. */
function utcStamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Fold a content line at 75 octets per RFC-5545 (continuations begin with a space). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    chunks.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return chunks.join(CRLF);
}

function describe(parts: (string | null | undefined)[]): string | null {
  const joined = parts.filter((p) => p && p.trim()).join("\n");
  return joined ? joined : null;
}

export function buildICS(input: IcsInput): string {
  const { tripName, stops, items, transports, accommodations, generatedAt } = input;
  const tzById = new Map(stops.map((s) => [s.id, s.timezone] as const));
  const stamp = utcStamp(generatedAt);
  const lines: string[] = [];

  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//Trip Planner//Calendar Feed//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(`X-WR-CALNAME:${esc(tripName)}`);

  const event = (
    uid: string,
    summary: string,
    dtStartLine: string,
    dtEndLine: string,
    location?: string | null,
    description?: string | null,
    category?: string | null,
  ) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(dtStartLine);
    lines.push(dtEndLine);
    lines.push(`SUMMARY:${esc(summary)}`);
    if (location) lines.push(`LOCATION:${esc(location)}`);
    if (description) lines.push(`DESCRIPTION:${esc(description)}`);
    if (category) lines.push(`CATEGORIES:${esc(category)}`);
    lines.push("END:VEVENT");
  };

  // Items
  for (const it of items) {
    if (!it.date) continue;
    const desc = describe([it.notes, it.link, it.booking ? `Booking: ${it.booking}` : null]);
    if (it.startTime) {
      const tz = (it.stopId && tzById.get(it.stopId)) || "UTC";
      const start = zonedWallTimeToInstant(it.date, it.startTime, tz);
      const end = it.endTime
        ? zonedWallTimeToInstant(it.date, it.endTime, tz)
        : new Date(start.getTime() + 60 * 60 * 1000); // default 1h
      event(`item-${it.id}@trip-planner`, it.title, `DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`, it.address, desc, it.category);
    } else {
      event(
        `item-${it.id}@trip-planner`,
        it.title,
        `DTSTART;VALUE=DATE:${dateValue(it.date)}`,
        `DTEND;VALUE=DATE:${dateValue(addDays(it.date, 1))}`,
        it.address,
        desc,
        it.category,
      );
    }
  }

  // Transport
  for (const t of transports) {
    const dep = toDate(t.depAt);
    if (!dep) continue;
    const arr = toDate(t.arrAt) ?? new Date(dep.getTime() + 60 * 60 * 1000);
    const route = [t.depPlace, t.arrPlace].filter(Boolean).join(" → ") || "Transport";
    const summary = `✈ ${route}${t.reference ? ` ${t.reference}` : ""}`;
    event(`transport-${t.id}@trip-planner`, summary, `DTSTART:${utcStamp(dep)}`, `DTEND:${utcStamp(arr)}`, null, null, "Transport");
  }

  // Accommodation (multi-day all-day block)
  for (const a of accommodations) {
    const desc = describe([a.notes, a.confirmation ? `Confirmation: ${a.confirmation}` : null]);
    event(
      `accom-${a.id}@trip-planner`,
      `🛏 Stay: ${a.name}`,
      `DTSTART;VALUE=DATE:${dateValue(a.checkIn)}`,
      `DTEND;VALUE=DATE:${dateValue(a.checkOut)}`,
      a.address,
      desc,
      "Accommodation",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join(CRLF) + CRLF;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/ics.test.ts`
Expected: PASS. (The `→` in the test regex is matched with `.` to avoid encoding issues.)

- [ ] **Step 5: Commit**

```bash
git add lib/ics.ts lib/ics.test.ts
git commit -m "feat(ics): pure RFC-5545 serializer for the trip timeline"
```

---

## Task 16: Calendar-feed server actions

Mirror `server/actions/share.ts`: `getCalendarFeed`, `createCalendarFeed`, `rotateCalendarFeed`, `revokeCalendarFeed`. All access-checked via `requireTripAccess`.

**Files:**
- Create: `server/actions/calendar-feed.ts`
- Create: `server/actions/calendar-feed.test.ts`

- [ ] **Step 1: Write the failing test** — create `server/actions/calendar-feed.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  requireTripAccessMock,
  revalidatePathMock,
  feedFindFirstMock,
  feedCreateMock,
  feedUpsertMock,
  feedDeleteManyMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } }),
  revalidatePathMock: vi.fn(),
  feedFindFirstMock: vi.fn(),
  feedCreateMock: vi.fn(),
  feedUpsertMock: vi.fn(),
  feedDeleteManyMock: vi.fn().mockResolvedValue({ count: 1 }),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/db", () => ({
  db: {
    calendarFeed: {
      findFirst: feedFindFirstMock,
      create: feedCreateMock,
      upsert: feedUpsertMock,
      deleteMany: feedDeleteManyMock,
    },
  },
}));

import { getCalendarFeed, createCalendarFeed, rotateCalendarFeed, revokeCalendarFeed } from "./calendar-feed";

const TRIP_ID = "trip-abc";
afterEach(() => vi.clearAllMocks());

describe("calendar feed actions", () => {
  it("getCalendarFeed returns the token when one exists", async () => {
    feedFindFirstMock.mockResolvedValue({ token: "tok-1" });
    expect(await getCalendarFeed(TRIP_ID)).toEqual({ token: "tok-1" });
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("getCalendarFeed returns null when none exists", async () => {
    feedFindFirstMock.mockResolvedValue(null);
    expect(await getCalendarFeed(TRIP_ID)).toBeNull();
  });

  it("createCalendarFeed is idempotent — returns existing token", async () => {
    feedFindFirstMock.mockResolvedValue({ token: "existing" });
    const r = await createCalendarFeed(TRIP_ID);
    expect(r).toEqual({ token: "existing" });
    expect(feedCreateMock).not.toHaveBeenCalled();
  });

  it("createCalendarFeed creates a token when none exists", async () => {
    feedFindFirstMock.mockResolvedValue(null);
    feedCreateMock.mockResolvedValue({ token: "new-token" });
    const r = await createCalendarFeed(TRIP_ID);
    expect(r).toEqual({ token: "new-token" });
    expect(feedCreateMock).toHaveBeenCalledOnce();
  });

  it("rotateCalendarFeed upserts a fresh token", async () => {
    feedUpsertMock.mockResolvedValue({ token: "rotated" });
    const r = await rotateCalendarFeed(TRIP_ID);
    expect(r).toEqual({ token: "rotated" });
    expect(feedUpsertMock).toHaveBeenCalledOnce();
  });

  it("revokeCalendarFeed deletes the feed", async () => {
    await revokeCalendarFeed(TRIP_ID);
    expect(feedDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: TRIP_ID } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/actions/calendar-feed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/actions/calendar-feed.ts`** (mirror `share.ts` exactly):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";

export async function getCalendarFeed(tripId: string): Promise<{ token: string } | null> {
  await requireTripAccess(tripId);
  const feed = await db.calendarFeed.findFirst({ where: { tripId }, select: { token: true } });
  return feed ? { token: feed.token } : null;
}

export async function createCalendarFeed(tripId: string): Promise<{ token: string }> {
  await requireTripAccess(tripId);

  const existing = await db.calendarFeed.findFirst({ where: { tripId }, select: { token: true } });
  if (existing) {
    revalidatePath(`/trips/${tripId}/settings`);
    return { token: existing.token };
  }

  const token = crypto.randomUUID();
  const created = await db.calendarFeed.create({ data: { tripId, token }, select: { token: true } });
  revalidatePath(`/trips/${tripId}/settings`);
  return { token: created.token };
}

export async function rotateCalendarFeed(tripId: string): Promise<{ token: string }> {
  await requireTripAccess(tripId);

  const newToken = crypto.randomUUID();
  const updated = await db.calendarFeed.upsert({
    where: { tripId },
    update: { token: newToken },
    create: { tripId, token: newToken },
    select: { token: true },
  });
  revalidatePath(`/trips/${tripId}/settings`);
  return { token: updated.token };
}

export async function revokeCalendarFeed(tripId: string): Promise<void> {
  await requireTripAccess(tripId);
  await db.calendarFeed.deleteMany({ where: { tripId } });
  revalidatePath(`/trips/${tripId}/settings`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/actions/calendar-feed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/calendar-feed.ts server/actions/calendar-feed.test.ts
git commit -m "feat(feed): calendar-feed token actions (get/create/rotate/revoke)"
```

---

## Task 17: Public ICS feed route

A no-auth route keyed only by token (the token is the capability), like `/share/[token]`. Looks up the feed → trip → fetches timeline data (same queries as the calendar page) → `buildICS` → returns `text/calendar`.

**Files:**
- Create: `app/api/calendar/[token]/route.ts`

- [ ] **Step 1: Create the route** — `app/api/calendar/[token]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildICS } from "@/lib/ics";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const feed = await db.calendarFeed.findUnique({
    where: { token },
    select: { trip: { select: { id: true, name: true } } },
  });
  if (!feed) {
    return NextResponse.json({ error: "Feed not found" }, { status: 404 });
  }

  const tripId = feed.trip.id;
  const [stops, items, transports, accommodations] = await Promise.all([
    db.stop.findMany({ where: { tripId }, select: { id: true, name: true, timezone: true } }),
    db.item.findMany({
      where: { tripId, date: { not: null } },
      select: {
        id: true, title: true, category: true, date: true, startTime: true, endTime: true,
        stopId: true, address: true, link: true, booking: true, notes: true,
      },
    }),
    db.transport.findMany({
      where: { tripId },
      select: { id: true, mode: true, depPlace: true, arrPlace: true, depAt: true, arrAt: true, reference: true },
    }),
    db.accommodation.findMany({
      where: { tripId },
      select: { id: true, name: true, checkIn: true, checkOut: true, address: true, confirmation: true, notes: true },
    }),
  ]);

  const ics = buildICS({
    tripName: feed.trip.name,
    stops,
    items,
    transports,
    accommodations,
    generatedAt: new Date(),
  });

  const headers = new Headers();
  headers.set("Content-Type", "text/calendar; charset=utf-8");
  headers.set("Content-Disposition", 'inline; filename="trip.ics"');
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(ics, { status: 200, headers });
}
```

- [ ] **Step 2: Manual smoke check** — start the dev server, seed, create a feed (via Settings in the next task or directly), then:

Run: `curl -s http://localhost:3000/api/calendar/<token> | head -5`
Expected: begins with `BEGIN:VCALENDAR`. (This is a manual verification; no unit test for the route — `buildICS` is fully unit-tested in Task 15.)

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/calendar
git commit -m "feat(feed): public ICS subscription route by token"
```

---

## Task 18: Settings "Calendar feed" panel

A `"use client"` panel mirroring `share-panel.tsx`: shows the subscribe URL with Copy / Regenerate / Revoke, plus a `webcal://` one-click subscribe link and the refresh-latency helper text.

**Files:**
- Create: `components/trip/settings/calendar-feed-panel.tsx`
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx`

- [ ] **Step 1: Create `components/trip/settings/calendar-feed-panel.tsx`** (model on `share-panel.tsx`):

```tsx
"use client";

import * as React from "react";
import { Link as LinkIcon, Copy, Check, RefreshCw, Trash2, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createCalendarFeed,
  rotateCalendarFeed,
  revokeCalendarFeed,
} from "@/server/actions/calendar-feed";

export interface CalendarFeedPanelProps {
  tripId: string;
  initialToken: string | null;
}

export function CalendarFeedPanel({ tripId, initialToken }: CalendarFeedPanelProps) {
  const [token, setToken] = React.useState<string | null>(initialToken);
  const [copied, setCopied] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const path = token ? `/api/calendar/${token}` : null;
  const httpsUrl =
    path && typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
  const webcalUrl =
    path && typeof window !== "undefined"
      ? `webcal://${window.location.host}${path}`
      : null;

  const handleCreate = () =>
    startTransition(async () => setToken((await createCalendarFeed(tripId)).token));
  const handleRotate = () =>
    startTransition(async () => setToken((await rotateCalendarFeed(tripId)).token));
  const handleRevoke = () =>
    startTransition(async () => {
      await revokeCalendarFeed(tripId);
      setToken(null);
    });

  const handleCopy = async () => {
    if (!httpsUrl) return;
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — ignore
    }
  };

  if (!path) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          No calendar feed active. Create one to subscribe in Google, Apple or Outlook Calendar.
        </p>
        <div>
          <Button type="button" variant="outline" onClick={handleCreate} loading={isPending}>
            <CalendarPlus className="size-4" aria-hidden="true" />
            Create calendar feed
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
        <LinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 truncate font-mono text-sm text-foreground">{httpsUrl}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleCopy} disabled={isPending}>
          {copied ? (
            <>
              <Check className="size-4" aria-hidden="true" /> Copied!
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden="true" /> Copy URL
            </>
          )}
        </Button>
        {webcalUrl && (
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={webcalUrl}>
              <CalendarPlus className="size-4" aria-hidden="true" /> Subscribe
            </a>
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={handleRotate} loading={isPending}>
          <RefreshCw className="size-4" aria-hidden="true" /> Regenerate
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRevoke}
          loading={isPending}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden="true" /> Revoke
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        One-way: your itinerary publishes to this feed. Calendar apps refresh on their own
        schedule (often several hours), so changes are not instant. Regenerating invalidates the
        old URL immediately.
      </p>
    </div>
  );
}
```

If `Button` does not support `asChild`, render the Subscribe link as a plain `<a className="...">` styled like the other buttons, or drop the Subscribe button and keep only Copy (the https URL works for manual "add by URL" in all calendar apps). Verify against `components/ui/button.tsx`.

- [ ] **Step 2: Wire into the Settings page** — in `app/(app)/trips/[tripId]/settings/page.tsx`:
  - Add import: `import { getCalendarFeed } from "@/server/actions/calendar-feed";` and `import { CalendarFeedPanel } from "@/components/trip/settings/calendar-feed-panel";`
  - Near `const shareLink = await getShareLink(tripId);` (line ~55) add: `const calendarFeed = await getCalendarFeed(tripId);`
  - Add a new `<Card>` between the share-link card and the danger zone (after line ~109), mirroring the share card's `CardHeader`/`CardTitle`/`CardDescription`/`CardContent` structure:

```tsx
        <Card>
          <CardHeader>
            <CardTitle>Calendar feed</CardTitle>
            <CardDescription>
              Subscribe to this trip in Google, Apple or Outlook Calendar. Updates one-way as you
              edit the itinerary.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CalendarFeedPanel tripId={tripId} initialToken={calendarFeed?.token ?? null} />
          </CardContent>
        </Card>
```

(Match the exact `Card*` import names already used in the file.)

- [ ] **Step 3: Verify typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/trip/settings/calendar-feed-panel.tsx "app/(app)/trips/[tripId]/settings/page.tsx"
git commit -m "feat(feed): Settings panel to create/copy/rotate/revoke the calendar feed"
```

---

# Final verification

- [ ] **Run the full suite, lint, typecheck, and a production build:**

```bash
npx vitest run && npx tsc --noEmit && npm run lint && npm run build
```

Expected: all tests pass (≥ the prior 830 + new tests), no type/lint errors, build green.

- [ ] **Manual smoke (dev server):** toggle Month/Agenda (persists across reload; desktop defaults Month, mobile Agenda); drag an item to another day; drag a wishlist item onto a day; create a feed in Settings and `curl` the URL for `BEGIN:VCALENDAR`; open Summary and confirm a packed/overlap day flags.

---

## Self-review notes (for the executor)

- **Spec coverage:** Month grid (Tasks 4–8), drag-to-reschedule (Tasks 9–10), wishlist→day (Task 11), packed-day/overlap flags (Task 12), ICS feed incl. items/transport/accommodation + private revocable token + latency note (Tasks 13–18), polish bundle (Tasks 1–3). All covered.
- **Type consistency:** `rescheduleItem(itemId, targetDateISO)`; `MonthGrid` prop `onDropItem(itemId, dateISO)`; `CalendarViews` passes `handleDropItem`; `buildICS(IcsInput)`; feed actions return `{ token }` / `null`. `PACKED_DAY_THRESHOLD = 6` is defined in `lib/flags.ts` and mirrored as a local const in `month-grid.tsx` (kept in sync by comment).
- **Toggle SSR:** server renders Agenda; client applies stored/responsive preference after mount (documented minor first-paint for month-preferring desktop users — acceptable, matches repo's no-extra-dependency posture).
- **Feed privacy:** the feed includes booking refs/notes by design (it's the user's own unguessable private feed) — intentionally broader than the public `/share` page, which omits them.
