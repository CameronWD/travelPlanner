# Road-Trip Drive Estimates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rough **offline** drive-time/distance estimates to Car transport legs, a **"long driving day"** Flag, and **per-trip** editable winding-factor + average-speed settings — no external routing API.

**Architecture:** A pure `estimateDriveMinutes` helper in `lib/geo.ts` (next to `haversineKm`); a `flagLongDrivingDays` rule in the existing pure flags engine (`detectFlags` already receives transport legs + stop coords, so no new queries — just two new trip-config fields threaded in); a precomputed `driveEstimate` prop rendered on the transport card; two new `Trip` columns edited via a settings panel that mirrors the calendar-feed-filter pattern. Real routing (option B) is deferred behind the `estimateDriveMinutes` seam and recorded in ADR-0011.

**Tech Stack:** Next.js 16 App Router (server actions + server components), Prisma 7 / Postgres, React 19, Tailwind v4, Vitest + Testing Library (jsdom; all DB-touching tests mock `@/lib/db`).

**Branch:** `feat/road-trip-drive-estimates` (already created off `main`). Do NOT touch `main`, push, or deploy until the controller merges at the end.

**Conventions every task must follow:**
- After each task: `npm test` and `npm run build` exit 0. Baseline is **1269 tests green** — do not regress.
- Migrations are **authored, not run** here (no live DB); they apply at deploy via `prisma migrate deploy`. Verify with `npx prisma validate && npx prisma generate`.
- DB-touching unit tests mock `@/lib/db`, `@/lib/guards`, `next/cache` — see `server/actions/calendar-feed.test.ts` / `server/actions/stops.test.ts` for the `vi.hoisted` template.
- House style: `cn()`, lucide icons with `aria-hidden`, `select`-narrowed Prisma queries, `revalidatePath`, pure `lib/` modules (no Prisma/React/network).
- `Transport.mode` is a plain string; the Car value is `"CAR"` (confirm against `lib/enums.ts` `TRANSPORT_MODES`).
- Commit at the end of each task with the message given.

---

### Task 1: Schema — per-trip driving settings + migration

**Files:**
- Modify: `prisma/schema.prisma` (`model Trip`)
- Create: `prisma/migrations/20260626120000_trip_driving_settings/migration.sql`

> **Why first:** later tasks reference `trip.drivingWindingFactor` / `trip.drivingAvgSpeedKph`; the generated client must know them before any code compiles.

- [ ] **Step 1: Add the two fields to `model Trip`**

In `prisma/schema.prisma`, in `model Trip`, add after the `homeCurrency` line:

```prisma
  // Per-trip driving-estimate settings (used by drive-time hints + the
  // "long driving day" flag). Defaults suit mixed/winding roads.
  drivingWindingFactor Float @default(1.5)
  drivingAvgSpeedKph   Int   @default(80)
```

- [ ] **Step 2: Author the migration**

Create `prisma/migrations/20260626120000_trip_driving_settings/migration.sql` with exactly:

```sql
-- Per-trip driving-estimate settings. NOT NULL + defaults backfill existing rows.
ALTER TABLE "Trip" ADD COLUMN "drivingWindingFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.5;
ALTER TABLE "Trip" ADD COLUMN "drivingAvgSpeedKph" INTEGER NOT NULL DEFAULT 80;
```

(The folder name sorts after the latest existing migration. Do not touch `migration_lock.toml`.)

- [ ] **Step 3: Validate + regenerate the client**

Run: `npx prisma validate && npx prisma generate`
Expected: both succeed; `Trip` now exposes the two fields on the TS client.

- [ ] **Step 4: Safety check (no code uses the fields yet)**

Run: `npm test && npm run build`
Expected: both exit 0 (no-op safety check).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260626120000_trip_driving_settings/migration.sql
git commit -m "feat(trip): per-trip driving winding-factor + avg-speed settings (schema)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Pure `estimateDriveMinutes` helper

**Files:**
- Modify: `lib/geo.ts`
- Test: `lib/geo.test.ts`

**Context:** `lib/geo.ts` already exports `haversineKm(a: LatLng, b: LatLng): number` and the `LatLng` type. Add a pure estimate next to it. Drive time = `haversineKm × windingFactor ÷ avgSpeedKph` hours → minutes; estimated road distance = `haversineKm × windingFactor`.

- [ ] **Step 1: Write the failing test**

Add to `lib/geo.test.ts`:

```ts
import { estimateDriveMinutes, estimateRoadKm } from "./geo";

describe("drive estimates", () => {
  it("estimateRoadKm scales straight-line by the winding factor", () => {
    expect(estimateRoadKm(100, 1.5)).toBeCloseTo(150);
  });

  it("estimateDriveMinutes = roadKm / speed * 60", () => {
    // 100 km straight-line × 1.5 = 150 road km; at 80 km/h => 112.5 min
    expect(estimateDriveMinutes(100, { windingFactor: 1.5, avgSpeedKph: 80 })).toBeCloseTo(112.5);
  });

  it("returns 0 for a zero-distance hop", () => {
    expect(estimateDriveMinutes(0, { windingFactor: 1.5, avgSpeedKph: 80 })).toBe(0);
  });

  it("guards against a non-positive speed (returns 0 rather than Infinity/NaN)", () => {
    expect(estimateDriveMinutes(100, { windingFactor: 1.5, avgSpeedKph: 0 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/geo.test.ts -t "drive estimates"`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement the helpers**

In `lib/geo.ts`, after `haversineKm`, add:

```ts
/** Estimated road distance (km) for a straight-line distance, scaled by a winding factor. */
export function estimateRoadKm(straightLineKm: number, windingFactor: number): number {
  return straightLineKm * windingFactor;
}

/**
 * Rough driving time in MINUTES for a straight-line distance, using a winding
 * factor (straight-line → road) and an average speed. Pure + offline — a hint,
 * not an ETA. Returns 0 for a non-positive speed (avoids Infinity/NaN).
 */
export function estimateDriveMinutes(
  straightLineKm: number,
  opts: { windingFactor: number; avgSpeedKph: number },
): number {
  if (opts.avgSpeedKph <= 0) return 0;
  const roadKm = estimateRoadKm(straightLineKm, opts.windingFactor);
  return (roadKm / opts.avgSpeedKph) * 60;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run lib/geo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/geo.ts lib/geo.test.ts
git commit -m "feat(geo): estimateDriveMinutes/estimateRoadKm pure helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `flagLongDrivingDays` rule

**Files:**
- Modify: `lib/flags.ts`
- Test: `lib/flags.test.ts`

**Context:** `detectFlags({ stops, transports, accommodations, items, tripStart, tripEnd, roughStopCount })` already receives `transports: FlagTransport[]` (`fromStopId/toStopId/depAt/arrAt/mode`) and `stops: FlagStop[]` (`lat/lng/arriveDate/departDate/timezone/sortOrder`). The new rule derives each Car leg's distance from its two linked stops' coords, and its **drive day** from `depAt` (in the destination stop's tz) or, failing that, the destination stop's `arriveDate`. Effective minutes = real `arrAt − depAt` when both set, else the offline estimate. Reuse existing helpers: `haversineKm`, `hasCoords`, `toDate`, and `instantToZonedDateISO` (already imported from `@/lib/tz`). Add new config fields to `DetectFlagsInput` with defaults so the rule works even before consumers pass them (Task 4 wires the trip values).

- [ ] **Step 1: Write the failing tests**

Add to `lib/flags.test.ts` (follow existing flag-test style):

```ts
import { flagLongDrivingDays, LONG_DRIVE_DAY_THRESHOLD_MIN } from "./flags";

describe("flagLongDrivingDays", () => {
  const stop = (id: string, lat: number, lng: number, arriveDate: string) => ({
    id, name: id, arriveDate, departDate: arriveDate, timezone: "Pacific/Auckland",
    lat, lng, sortOrder: 0,
  });
  // ~290 km apart straight-line (Christchurch ~ -43.53,172.63 to Queenstown ~ -45.03,168.66)
  const stops = [stop("a", -43.53, 172.63, "2026-07-02"), stop("b", -45.03, 168.66, "2026-07-03")];

  it("flags a day whose Car driving exceeds the threshold (estimate, no times)", () => {
    const flags = flagLongDrivingDays(stops, [
      { id: "t1", fromStopId: "a", toStopId: "b", mode: "CAR", depAt: null, arrAt: null },
    ], { windingFactor: 1.5, avgSpeedKph: 80 });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ targetType: "DAY", date: "2026-07-03", severity: "warning" });
  });

  it("does not flag a short Car hop", () => {
    const near = [stop("a", -45.03, 168.66, "2026-07-02"), stop("b", -45.04, 168.67, "2026-07-03")];
    expect(flagLongDrivingDays(near, [
      { id: "t1", fromStopId: "a", toStopId: "b", mode: "CAR", depAt: null, arrAt: null },
    ], { windingFactor: 1.5, avgSpeedKph: 80 })).toEqual([]);
  });

  it("ignores non-Car legs", () => {
    expect(flagLongDrivingDays(stops, [
      { id: "t1", fromStopId: "a", toStopId: "b", mode: "FLIGHT", depAt: null, arrAt: null },
    ], { windingFactor: 1.5, avgSpeedKph: 80 })).toEqual([]);
  });

  it("uses real dep/arr times when both are present", () => {
    // Real 30-min leg between far stops → under threshold despite the distance.
    const flags = flagLongDrivingDays(stops, [
      { id: "t1", fromStopId: "a", toStopId: "b", mode: "CAR",
        depAt: "2026-07-03T09:00:00Z", arrAt: "2026-07-03T09:30:00Z" },
    ], { windingFactor: 1.5, avgSpeedKph: 80 });
    expect(flags).toEqual([]);
  });

  it("threshold is 5 hours", () => {
    expect(LONG_DRIVE_DAY_THRESHOLD_MIN).toBe(300);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/flags.test.ts -t "flagLongDrivingDays"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement the rule + extend `DetectFlagsInput` + register it**

In `lib/flags.ts`:

(a) Add the threshold near the other thresholds:

```ts
export const LONG_DRIVE_DAY_THRESHOLD_MIN = 300; // 5 hours
```

(b) Add optional config to `DetectFlagsInput` (after `roughStopCount?`):

```ts
  /** Per-trip drive-estimate config; defaults suit mixed/winding roads. */
  drivingWindingFactor?: number;
  drivingAvgSpeedKph?: number;
```

(c) Add the rule (import `estimateDriveMinutes` from `./geo` alongside the existing `haversineKm` import; reuse `hasCoords`, `toDate`, and `instantToZonedDateISO`):

```ts
export function flagLongDrivingDays(
  stops: FlagStop[],
  transports: FlagTransport[],
  opts: { windingFactor: number; avgSpeedKph: number },
): Flag[] {
  const byId = new Map(stops.map((s) => [s.id, s]));
  const minsByDate = new Map<string, number>();

  for (const t of transports) {
    if (t.mode !== "CAR") continue;
    const from = t.fromStopId ? byId.get(t.fromStopId) : undefined;
    const to = t.toStopId ? byId.get(t.toStopId) : undefined;
    if (!from || !to || !hasCoords(from) || !hasCoords(to)) continue;

    // Effective minutes: real duration when both times set, else offline estimate.
    const dep = toDate(t.depAt ?? null);
    const arr = toDate(t.arrAt ?? null);
    const minutes =
      dep && arr && arr.getTime() > dep.getTime()
        ? (arr.getTime() - dep.getTime()) / 60000
        : estimateDriveMinutes(haversineKm(from, to), opts);

    // Drive day: depAt in the destination tz, else the destination's arrive date.
    const driveDate = dep
      ? instantToZonedDateISO(dep, to.timezone)
      : to.arriveDate;
    if (!driveDate) continue;

    minsByDate.set(driveDate, (minsByDate.get(driveDate) ?? 0) + minutes);
  }

  const flags: Flag[] = [];
  for (const [date, mins] of minsByDate) {
    if (mins > LONG_DRIVE_DAY_THRESHOLD_MIN) {
      const hrs = Math.round((mins / 60) * 10) / 10;
      flags.push({
        id: `long-drive-${date}`,
        severity: "warning",
        message: `Long driving day on ${date}: ~${hrs}h behind the wheel — check it's doable.`,
        targetType: "DAY",
        date,
      });
    }
  }
  return flags;
}
```

(d) Register it in `detectFlags`'s returned array (after `flagSpreadDays(items)`), passing config with defaults:

```ts
    ...flagLongDrivingDays(stops, transports, {
      windingFactor: drivingWindingFactor ?? 1.5,
      avgSpeedKph: drivingAvgSpeedKph ?? 80,
    }),
```

and destructure `drivingWindingFactor, drivingAvgSpeedKph` in the `detectFlags` parameter list.

> Confirm `instantToZonedDateISO(date: Date, tz: string)` returns a `YYYY-MM-DD` string (it's already used by other rules for exactly this). If its signature differs, match the existing call sites in this file.

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run lib/flags.test.ts`
Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add lib/flags.ts lib/flags.test.ts
git commit -m "feat(flags): long-driving-day flag from Car legs (real or estimated time)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Thread per-trip driving config into the flag consumers

**Files:**
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx`
- Modify: `components/trip/home/phase-planning.tsx` + its upstream trip query/prop
- Test: existing tests still green (these are server components; rely on `flags.test.ts` + build)

**Context:** Both `detectFlags` call sites already pass `stops`/`transports`. They just need to also pass the trip's `drivingWindingFactor`/`drivingAvgSpeedKph`. Without this, the flag uses the defaults (1.5/80) — correct but not user-configurable.

- [ ] **Step 1: Summary page**

In `app/(app)/trips/[tripId]/summary/page.tsx`, extend the trip `select` (currently `id, name, startDate, endDate, homeCurrency`) to add:

```ts
      drivingWindingFactor: true,
      drivingAvgSpeedKph: true,
```

Then in the `detectFlags({ ... })` call add:

```ts
  drivingWindingFactor: trip.drivingWindingFactor,
  drivingAvgSpeedKph: trip.drivingAvgSpeedKph,
```

(Use whatever local variable holds the trip row — read the file to confirm the name.)

- [ ] **Step 2: Phase-planning Home**

`components/trip/home/phase-planning.tsx` receives a `trip` prop typed with `{ id, name, startDate, endDate, homeCurrency }`. Find the parent that renders `<PhasePlanning trip={...} />` (grep `PhasePlanning`) and the query that builds that trip object; extend BOTH the query `select` and the prop type to include `drivingWindingFactor: number` and `drivingAvgSpeedKph: number`. Then in the `detectFlags({ ... })` call in `phase-planning.tsx` add the same two fields from `trip`.

> If the parent passes a trimmed trip object, thread the two fields through. Do not add a separate query — the trip is already fetched.

- [ ] **Step 3: Typecheck + build + tests**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all green. (No new test — server-component wiring is covered by the type system + the rule's own tests.)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/trips/[tripId]/summary/page.tsx" components/trip/home/phase-planning.tsx
# plus the upstream file(s) you edited for the phase-planning trip prop
git commit -m "feat(flags): feed per-trip winding/speed into the long-driving-day flag

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Drive-estimate line on the transport card (Plan page)

**Files:**
- Modify: `components/trip/transport-card.tsx`
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` (transport `select` + `enrichTransport` + `ItineraryTransport` type)
- Test: `components/trip/transport-card.test.tsx` (create if absent)

**Context:** Compute the estimate **server-side** on the Plan page (it has the trip + transports) and pass a small precomputed `driveEstimate` prop to the card — avoids threading coords + config to the client. The card shows "≈ 1h 15m · ~100 km" only when the prop is present, which the page computes **only for Car legs that lack both real times and have both endpoint coords**.

- [ ] **Step 1: Add the optional prop to the card type + render it**

In `components/trip/transport-card.tsx`, add to `TransportCardTransport`:

```ts
  /** Precomputed offline drive estimate; present only for Car legs without real times. */
  driveEstimate?: { minutes: number; roadKm: number } | null;
```

In the "Times row" region, after the `duration` block, add (reusing the already-imported `formatDuration`):

```tsx
          {!duration && t.driveEstimate && (
            <div className="flex items-center gap-1" title="Rough offline estimate">
              <Clock className="size-3.5 shrink-0" aria-hidden="true" />
              <span>≈ {formatDuration(t.driveEstimate.minutes)} · ~{t.driveEstimate.roadKm} km</span>
            </div>
          )}
```

(Only shows when there's no real `duration`, i.e. real times take precedence — matching the spec.)

- [ ] **Step 2: Write the card test**

Create/extend `components/trip/transport-card.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransportCard } from "./transport-card";

const base = { id: "t1", mode: "CAR" as const, sortOrder: 0 };

it("shows the drive estimate when present and there are no real times", () => {
  render(<TransportCard transport={{ ...base, driveEstimate: { minutes: 75, roadKm: 100 } }} />);
  expect(screen.getByText(/≈.*·.*100 km/)).toBeInTheDocument();
});

it("hides the estimate when real dep/arr times give a duration", () => {
  render(<TransportCard transport={{
    ...base,
    depAt: new Date("2026-07-03T09:00:00Z"),
    arrAt: new Date("2026-07-03T10:30:00Z"),
    driveEstimate: { minutes: 75, roadKm: 100 },
  }} />);
  expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
});
```

> Read `transport-card.tsx` for the exact `TransportCard` prop name/shape (it may take `transport={...}` plus handlers) and adjust the render calls to the real signature. If a test file already exists, add these cases.

- [ ] **Step 3: Compute the estimate on the Plan page**

In `app/(app)/trips/[tripId]/plan/page.tsx`:
- Extend the transport `select` to include `depLat: true, depLng: true, arrLat: true, arrLng: true`.
- Ensure the page fetches the trip's `drivingWindingFactor` + `drivingAvgSpeedKph` (extend the trip query/select if needed).
- In `enrichTransport` (where `ItineraryTransport` objects are built), compute for each transport:

```ts
import { estimateDriveMinutes, estimateRoadKm, haversineKm } from "@/lib/geo";

// inside enrichTransport, given t (raw row) + trip config:
const hasTimes = t.depAt != null && t.arrAt != null;
const coords =
  t.depLat != null && t.depLng != null && t.arrLat != null && t.arrLng != null
    ? { from: { lat: t.depLat, lng: t.depLng }, to: { lat: t.arrLat, lng: t.arrLng } }
    : null;
const driveEstimate =
  t.mode === "CAR" && !hasTimes && coords
    ? (() => {
        const km = haversineKm(coords.from, coords.to);
        return {
          minutes: Math.round(estimateDriveMinutes(km, {
            windingFactor: trip.drivingWindingFactor,
            avgSpeedKph: trip.drivingAvgSpeedKph,
          })),
          roadKm: Math.round(estimateRoadKm(km, trip.drivingWindingFactor)),
        };
      })()
    : null;
```

Add `driveEstimate` to the `ItineraryTransport` type and pass it through to `TransportCard`.

> Read the file to match `enrichTransport`'s exact shape and how `trip` config is in scope (add it to the page's trip query if not already selected). Keep all existing fields.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all green.

```bash
git add components/trip/transport-card.tsx components/trip/transport-card.test.tsx "app/(app)/trips/[tripId]/plan/page.tsx"
git commit -m "feat(transport): show rough drive estimate on Car legs without real times

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Settings — `updateDrivingSettings` action + panel + page

**Files:**
- Create: `server/actions/driving-settings.ts`
- Test: `server/actions/driving-settings.test.ts`
- Create: `components/trip/settings/driving-estimates-panel.tsx`
- Test: `components/trip/settings/driving-estimates-panel.test.tsx`
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx`

**Context:** Mirror `updateCalendarFeedFilter` (action) and `CalendarFeedPanel` (auto-saving `startTransition` inputs). Clamp inputs to sane ranges so a typo can't poison the estimate: winding **1.0–3.0**, speed **20–150 km/h**.

- [ ] **Step 1: Write the action test**

Create `server/actions/driving-settings.test.ts` (mirror `server/actions/calendar-feed.test.ts`'s `vi.hoisted` mock of `@/lib/db`, `@/lib/guards`, `next/cache`):

```ts
it("clamps + persists winding factor and avg speed", async () => {
  await updateDrivingSettings("trip-1", { windingFactor: 9, avgSpeedKph: 5 });
  expect(tripUpdateMock).toHaveBeenCalledWith({
    where: { id: "trip-1" },
    data: { drivingWindingFactor: 3, drivingAvgSpeedKph: 20 }, // clamped to max/min
  });
  expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
  expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/settings");
});

it("passes through in-range values", async () => {
  await updateDrivingSettings("trip-1", { windingFactor: 1.4, avgSpeedKph: 90 });
  expect(tripUpdateMock).toHaveBeenCalledWith({
    where: { id: "trip-1" },
    data: { drivingWindingFactor: 1.4, drivingAvgSpeedKph: 90 },
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run server/actions/driving-settings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the action**

Create `server/actions/driving-settings.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/**
 * Update a trip's offline drive-estimate settings. Values are clamped to sane
 * ranges (winding 1.0–3.0, speed 20–150 km/h). Access-checked.
 */
export async function updateDrivingSettings(
  tripId: string,
  input: { windingFactor: number; avgSpeedKph: number },
): Promise<void> {
  await requireTripAccess(tripId);

  await db.trip.update({
    where: { id: tripId },
    data: {
      drivingWindingFactor: clamp(input.windingFactor, 1.0, 3.0),
      drivingAvgSpeedKph: Math.round(clamp(input.avgSpeedKph, 20, 150)),
    },
  });

  revalidatePath(`/trips/${tripId}/settings`);
}
```

- [ ] **Step 4: Run the action test to confirm it passes**

Run: `npx vitest run server/actions/driving-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Build the panel**

Create `components/trip/settings/driving-estimates-panel.tsx` (mirror `calendar-feed-panel.tsx`'s `"use client"` + `useState`/`useTransition` auto-save):

```tsx
"use client";

import * as React from "react";
import { updateDrivingSettings } from "@/server/actions/driving-settings";

export interface DrivingEstimatesPanelProps {
  tripId: string;
  initialWindingFactor: number;
  initialAvgSpeedKph: number;
}

export function DrivingEstimatesPanel({
  tripId,
  initialWindingFactor,
  initialAvgSpeedKph,
}: DrivingEstimatesPanelProps) {
  const [winding, setWinding] = React.useState(initialWindingFactor);
  const [speed, setSpeed] = React.useState(initialAvgSpeedKph);
  const [isPending, startTransition] = React.useTransition();

  const save = (next: { windingFactor: number; avgSpeedKph: number }) => {
    startTransition(async () => {
      await updateDrivingSettings(tripId, next);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Road winding factor</span>
        <span className="text-xs text-muted-foreground">
          How much longer roads are than the straight line (1.0–3.0). Higher = twistier.
        </span>
        <input
          type="number"
          step="0.1"
          min="1"
          max="3"
          className="mt-1 w-28 rounded-md border border-border bg-background px-2 py-1"
          value={winding}
          disabled={isPending}
          onChange={(e) => {
            const v = Number(e.target.value);
            setWinding(v);
            save({ windingFactor: v, avgSpeedKph: speed });
          }}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-foreground">Average speed (km/h)</span>
        <span className="text-xs text-muted-foreground">
          Typical moving speed used for drive-time hints (20–150).
        </span>
        <input
          type="number"
          step="5"
          min="20"
          max="150"
          className="mt-1 w-28 rounded-md border border-border bg-background px-2 py-1"
          value={speed}
          disabled={isPending}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSpeed(v);
            save({ windingFactor: winding, avgSpeedKph: v });
          }}
        />
      </label>

      <p className="text-xs text-muted-foreground">
        Drive times are rough offline estimates — a hint, not an ETA.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Write the panel test**

Create `components/trip/settings/driving-estimates-panel.test.tsx` (mirror `calendar-feed-panel.test.tsx`; mock `@/server/actions/driving-settings`):

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/driving-settings", () => ({ updateDrivingSettings: vi.fn().mockResolvedValue(undefined) }));
import { updateDrivingSettings } from "@/server/actions/driving-settings";
import { DrivingEstimatesPanel } from "./driving-estimates-panel";

beforeEach(() => vi.clearAllMocks());

it("renders the current values and saves an edited winding factor", async () => {
  const user = userEvent.setup();
  render(<DrivingEstimatesPanel tripId="t1" initialWindingFactor={1.5} initialAvgSpeedKph={80} />);
  const winding = screen.getByLabelText(/winding factor/i);
  expect(winding).toHaveValue(1.5);
  await user.clear(winding);
  await user.type(winding, "1.8");
  expect(updateDrivingSettings).toHaveBeenLastCalledWith("t1", expect.objectContaining({ windingFactor: 1.8 }));
});
```

> Read `calendar-feed-panel.test.tsx` for the exact render/query idioms; adjust label matchers to the panel's real label text.

- [ ] **Step 7: Mount it on the settings page**

In `app/(app)/trips/[tripId]/settings/page.tsx`:
- Add `drivingWindingFactor: true, drivingAvgSpeedKph: true` to the trip `select`.
- Import `DrivingEstimatesPanel`.
- Mount a new `<Card>` next to the Calendar-feed card:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Driving estimates</CardTitle>
          <CardDescription>
            Tune the rough drive-time hints for this trip — how twisty the roads are and your
            typical moving speed. These are offline estimates, not ETAs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DrivingEstimatesPanel
            tripId={tripId}
            initialWindingFactor={trip.drivingWindingFactor}
            initialAvgSpeedKph={trip.drivingAvgSpeedKph}
          />
        </CardContent>
      </Card>
```

(Match the page's `trip` variable name.)

- [ ] **Step 8: Verify + commit**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all green.

```bash
git add server/actions/driving-settings.ts server/actions/driving-settings.test.ts components/trip/settings/driving-estimates-panel.tsx components/trip/settings/driving-estimates-panel.test.tsx "app/(app)/trips/[tripId]/settings/page.tsx"
git commit -m "feat(settings): per-trip driving winding-factor + avg-speed panel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Docs — ADR amendment + CONTEXT Flag example

**Files:**
- Modify: `docs/adr/0011-geocode-located-entities-and-transport-coordinates.md`
- Modify: `CONTEXT.md`

**Context:** ADR-0011 chose deep-link-only directions with "no computed travel time." We've now added an **offline** estimate (no network/API) — a deliberate, recorded reversal of *that one line*, with the real routing API (option B) explicitly parked. Also add the new flag to the glossary's Flag examples.

- [ ] **Step 1: Append an ADR update section**

At the end of `docs/adr/0011-geocode-located-entities-and-transport-coordinates.md`, add:

```markdown
## Update (2026-06-26): offline drive-time estimates

We added rough **offline** drive-time/distance estimates (Car legs + a "long
driving day" Flag) and per-trip winding-factor/avg-speed settings. This revisits
the "no computed travel time" line above — but only the *offline* form: distance
is `haversineKm × windingFactor`, time is `÷ avgSpeedKph`, all in the pure
`lib/geo.ts` layer (`estimateDriveMinutes`). No routing/distance-matrix API, no
network at render — so the original rationale (don't couple render to the
network; avoid API keys/rate-limits/cost) still holds.

**Option B — a real routing/distance-matrix API (Google/Mapbox/OSRM)** for
accurate ETAs (handling winding NZ mountain roads properly) remains deferred. It
would slot behind the same `estimateDriveMinutes` seam, but reintroduces the
network coupling + key/cache/cost this ADR avoided, so it would warrant its own
ADR superseding this section when/if pursued.
```

- [ ] **Step 2: Add the flag to the CONTEXT glossary**

In `CONTEXT.md`, in the **Flag** entry's list of example flags, add "a **long driving day** (more estimated driving in one day than is comfortable)" alongside the existing examples (packed day, geographically spread, etc.). Keep it a glossary phrase — no implementation detail.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0011-geocode-located-entities-and-transport-coordinates.md CONTEXT.md
git commit -m "docs: record offline drive-estimate decision (ADR-0011) + long-driving-day flag

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** estimate model → Task 2; Car-leg render (estimate only when no real times) → Task 5; long-driving-day flag (effective minutes, drive-day bucketing, 5h threshold) → Task 3, wired per-trip in Task 4; per-trip settings (schema/migration/action/panel/page) → Tasks 1 + 6; ADR amendment + option-B parking + glossary → Task 7.
- **No new queries for the flag:** confirmed — `detectFlags` already receives `transports` + `stops` with coords; Task 4 only adds the two trip-config fields to the selects + call sites.
- **Placeholder scan:** novel functions (estimateDriveMinutes, flagLongDrivingDays, updateDrivingSettings, the panel) are given in full; the page-wiring tasks (4, 5, 6 step 7) are bounded "read-then-edit" with exact field names + the precise edit, matching the repo's prior-plan convention.
- **Type consistency:** `driveEstimate: { minutes: number; roadKm: number } | null` shape is identical in Task 5's card type and the Plan-page computation; `drivingWindingFactor: Float`/`drivingAvgSpeedKph: Int` names match across schema (T1), flag config (T3), consumers (T4), card computation (T5), action/panel (T6). `LONG_DRIVE_DAY_THRESHOLD_MIN = 300`.
- **Out of scope (confirmed):** real routing API (parked in ADR), day-map item-hop estimates, non-Car modes.
- **Mode value:** `"CAR"` — implementer confirms against `lib/enums.ts TRANSPORT_MODES` in Task 3/5.
