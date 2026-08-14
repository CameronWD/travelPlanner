# Audit Backlog Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every buildable item in `docs/things-to-fix.md` — two production timezone bugs, the fork navigation/budget gap, ten quality defects, and doc drift.

**Architecture:** Each task is one item (or one file-cluster) from the audited backlog. Timezone fixes route all wall-clock interpretation through the existing `lib/tz.ts` engine instead of `new Date()`/UTC getters. Fork fixes make the `?plan=` param sticky and honoured by Budget. Everything else is small, local repairs.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7 (mocked in tests), zod 4, Vitest 4 + Testing Library.

## Global Constraints

- Branch: all work on `fix/audit-backlog`, branched from `docs/things-to-fix`. Never touch `main`. Never deploy.
- Read `CONTEXT.md` vocabulary before writing UI copy. Never use terms its *Avoid* lists forbid.
- The spec is `docs/things-to-fix.md` (in this branch). Refer to items by ID (P0-1 etc.). Its **"Deliberate behaviour — do NOT fix"** table is binding.
- Unit tests mock `@/lib/db` — copy the mock pattern from the sibling `*.test.ts` of any action you touch. No real DB exists in this environment.
- Timezone-sensitive tests must pass under BOTH `TZ=UTC` and `TZ=Australia/Sydney` (run the file twice).
- Money amounts are integer minor units; zero is legal; `2_147_483_647` is the DB int cap.
- Match the unified action-result shape (`{ success, errors }`, ADR 0027) for all server-action returns.
- Skipped as unbuildable here (needs prod DB / running app): P2-8(a) row count, P3-5 screenshot re-shoot, P3-4 (condition not met — see spec). Do not attempt.

---

### Task 1: P0-3 — Migration deploy procedure in DEPLOY.md

**Files:**
- Modify: `docs/DEPLOY.md` (insert new section after "## 4. Vercel — free (Hobby)")

**Interfaces:** none (docs only).

- [ ] **Step 1: Write the section**

Insert into `docs/DEPLOY.md` after section 4:

```markdown
## 4b. Deploying a column-RENAME migration (read before the next deploy)

The pending migration `prisma/migrations/20260812000000_cost_and_paid_amounts`
RENAMES columns. `vercel.json` runs `prisma migrate deploy && next build`, so the
old columns disappear while the previous deployment is still serving traffic:
**every cost read 500s for the length of the build**, and indefinitely if the
build fails. (Additive migrations have no such window — this section applies to
renames/drops only.)

Procedure for this (and any future destructive) migration:

1. **Rehearse on a copy.** Restore the latest Neon snapshot to a branch database
   (Neon → Branches → New branch from snapshot). Run
   `DATABASE_URL=<branch-url> npx prisma migrate deploy` against it. Record the
   row count the backfill touches:
   `SELECT count(*) FROM "Cost" WHERE "paidMinor" IS NOT NULL AND "paidAt" IS NULL;`
2. **Write the reverse migration first.** A rename reverses mechanically —
   keep the `ALTER TABLE ... RENAME COLUMN` inverse SQL in your pocket before
   deploying, so rollback is copy-paste, not composition under pressure.
3. **Deploy at a quiet moment** and watch the Vercel build to completion. The
   error window = migrate-finish → build-finish. If the build fails, either fix
   forward immediately or apply the reverse migration.
4. **Afterwards**, re-run the count from step 1 in prod and reconcile any
   legacy paid-without-date rows via the Budget page checklist (the app
   surfaces them — see `docs/things-to-fix.md` P2-8).
```

- [ ] **Step 2: Verify formatting**

Run: `grep -n "## 4b" docs/DEPLOY.md`
Expected: the heading found once, between sections 4 and 5.

- [ ] **Step 3: Commit**

```bash
git add docs/DEPLOY.md
git commit -m "docs(deploy): rehearse-and-reverse procedure for the cost/paid rename migration"
```

---

### Task 2: P0-1 (server) — interpret transport wall times in the endpoint Stop's timezone

**Files:**
- Modify: `lib/validations/transport.ts:12-19` (the `isoDatetime` preprocess)
- Modify: `lib/time-display.ts` (add `resolveEndpointZones`, use it in `transportTimeDisplay`)
- Create: `lib/wall-time.ts`
- Modify: `server/actions/transport.ts` (`createTransport` ~line 100-165, `updateTransport` ~line 210-280)
- Test: `lib/wall-time.test.ts`, `lib/time-display.test.ts`, `server/actions/transport.test.ts`

**Interfaces:**
- Consumes: `zonedWallTimeToInstant(dateISO, hhmm, timeZone): Date` from `@/lib/tz`.
- Produces: `wallTimeToInstant(value: Date | string | null | undefined, timeZone: string): Date | null` from `@/lib/wall-time`; `resolveEndpointZones(fromTz: string | null | undefined, toTz: string | null | undefined): { depTz: string; arrTz: string }` from `@/lib/time-display`. Task 3 uses both. After this task, `transportSchema`'s parsed `depAt`/`arrAt` type is `Date | string | undefined` (string = wall time awaiting tz interpretation).

- [ ] **Step 1: Write the failing tests**

`lib/wall-time.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { wallTimeToInstant } from "@/lib/wall-time";

describe("wallTimeToInstant", () => {
  it("interprets an offset-less wall time in the given zone, independent of process TZ", () => {
    expect(wallTimeToInstant("2026-07-01T08:00", "Europe/Paris")!.toISOString())
      .toBe("2026-07-01T06:00:00.000Z"); // CEST = UTC+2
    expect(wallTimeToInstant("2026-07-01T08:00", "Australia/Sydney")!.toISOString())
      .toBe("2026-06-30T22:00:00.000Z"); // AEST = UTC+10
  });
  it("passes Date instances through untouched", () => {
    const d = new Date("2026-07-01T06:00:00Z");
    expect(wallTimeToInstant(d, "Europe/Paris")).toBe(d);
  });
  it("accepts seconds and returns null for null/undefined/garbage", () => {
    expect(wallTimeToInstant("2026-07-01T08:00:30", "UTC")!.toISOString())
      .toBe("2026-07-01T08:00:00.000Z");
    expect(wallTimeToInstant(null, "UTC")).toBeNull();
    expect(wallTimeToInstant(undefined, "UTC")).toBeNull();
    expect(wallTimeToInstant("not-a-time", "UTC")).toBeNull();
  });
});
```

Add to `lib/time-display.test.ts`:

```ts
import { resolveEndpointZones } from "@/lib/time-display";

describe("resolveEndpointZones", () => {
  it("uses each endpoint's own zone, falling back to the other, then UTC", () => {
    expect(resolveEndpointZones("Europe/Paris", "Europe/Rome"))
      .toEqual({ depTz: "Europe/Paris", arrTz: "Europe/Rome" });
    expect(resolveEndpointZones(null, "Europe/Rome"))
      .toEqual({ depTz: "Europe/Rome", arrTz: "Europe/Rome" }); // home → first stop leg
    expect(resolveEndpointZones("Europe/Paris", null))
      .toEqual({ depTz: "Europe/Paris", arrTz: "Europe/Paris" }); // return leg
    expect(resolveEndpointZones(null, null)).toEqual({ depTz: "UTC", arrTz: "UTC" });
  });
});
```

Add to `server/actions/transport.test.ts` (copy the file's existing `vi.mock("@/lib/db")` scaffolding; the mock's `stop.findMany` must return the endpoint stops with timezones):

```ts
it("stores a wall-time string interpreted in the from-stop's timezone", async () => {
  // Arrange mocks so fromStopId "s-paris" resolves timezone "Europe/Paris"
  // (follow the file's existing createTransport test setup; add
  // { id: "s-paris", timezone: "Europe/Paris" } to the stop.findMany mock).
  await createTransport("trip-1", {
    mode: "TRAIN",
    fromStopId: "s-paris",
    toStopId: "s-rome",
    depAt: "2026-07-01T08:00",
  });
  const createArg = mockDb.transport.create.mock.calls[0][0];
  expect(createArg.data.depAt.toISOString()).toBe("2026-07-01T06:00:00.000Z");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/wall-time.test.ts lib/time-display.test.ts server/actions/transport.test.ts`
Expected: FAIL — `wall-time` module missing, `resolveEndpointZones` not exported, transport assertion gets the server-tz-parsed instant.

- [ ] **Step 3: Implement**

`lib/wall-time.ts`:

```ts
/**
 * Wall-clock time handling for transport endpoints (things-to-fix P0-1).
 *
 * A `datetime-local` string ("2026-07-01T08:00") is a WALL-CLOCK time in the
 * endpoint Stop's timezone — it must never be parsed with `new Date()`, whose
 * offset-less parse depends on the process timezone (UTC on Vercel, the dev
 * machine's zone locally).
 */
import { zonedWallTimeToInstant } from "@/lib/tz";

export const WALL_TIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/;

/** Convert a parsed transport time to an instant. Dates pass through; wall-time
 * strings are interpreted in `timeZone`; anything else is null. */
export function wallTimeToInstant(
  value: Date | string | null | undefined,
  timeZone: string,
): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const m = WALL_TIME_RE.exec(value.trim());
  if (!m) return null;
  return zonedWallTimeToInstant(m[1], m[2], timeZone);
}
```

`lib/validations/transport.ts` — replace the `isoDatetime` preprocess (keep the name):

```ts
import { WALL_TIME_RE } from "@/lib/wall-time";

/**
 * A transport time as submitted. Two shapes survive parsing:
 *  - a Date, or a string WITH an explicit offset/Z → an instant, coerced to Date;
 *  - an offset-less "YYYY-MM-DDTHH:mm(:ss)?" string → kept AS A STRING: a
 *    wall-clock time the action interprets in the endpoint Stop's timezone
 *    via wallTimeToInstant (never new Date() — process-tz dependent, P0-1).
 */
const isoDatetime = z.preprocess((val) => {
  if (val instanceof Date) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const s = val.trim();
    if (WALL_TIME_RE.test(s)) return s; // wall time — defer tz interpretation
    const d = new Date(s); // explicit offset — safe to parse
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
}, z.union([z.date(), z.string().regex(WALL_TIME_RE)]).optional());
```

`lib/time-display.ts` — add and adopt:

```ts
/** Timezone for each transport endpoint: its own stop's zone, else the other
 * endpoint's (home/free-text legs), else UTC. Shared by display AND the write
 * path so a typed wall time round-trips exactly (things-to-fix P0-1). */
export function resolveEndpointZones(
  fromTz: string | null | undefined,
  toTz: string | null | undefined,
): { depTz: string; arrTz: string } {
  return { depTz: fromTz ?? toTz ?? "UTC", arrTz: toTz ?? fromTz ?? "UTC" };
}
```

In `transportTimeDisplay`, replace the two lines
`const depTz = fromTimezone ?? "UTC"; const arrTz = toTimezone ?? fromTimezone ?? "UTC";`
with `const { depTz, arrTz } = resolveEndpointZones(fromTimezone, toTimezone);`
(behaviour change is only the home-leg dep fallback: was UTC, now the other endpoint's zone — update any `time-display.test.ts` expectation that relied on UTC for a null fromTimezone with a set toTimezone).

`server/actions/transport.ts` — in `createTransport`, after `fromStopId`/`toStopId` are resolved and validated (after `validateStopBelongsToTrip`), insert:

```ts
// Interpret wall-time strings in the endpoint Stop's timezone (P0-1).
const endpointIds = [fromStopId, toStopId].filter((v): v is string => v !== null);
const endpointStops = endpointIds.length
  ? await db.stop.findMany({ where: { id: { in: endpointIds } }, select: { id: true, timezone: true } })
  : [];
const tzOf = (id: string | null) =>
  id ? endpointStops.find((s) => s.id === id)?.timezone ?? null : null;
const { depTz, arrTz } = resolveEndpointZones(tzOf(fromStopId), tzOf(toStopId));
const depAtInstant = wallTimeToInstant(data.depAt, depTz);
const arrAtInstant = wallTimeToInstant(data.arrAt, arrTz);
```

and change the create data to `depAt: depAtInstant` / `arrAt: arrAtInstant`. Do the identical thing in `updateTransport` (its endpoint resolution mirrors create). Import `wallTimeToInstant` from `@/lib/wall-time` and `resolveEndpointZones` from `@/lib/time-display`.

- [ ] **Step 4: Run the tests under both timezones**

Run: `TZ=UTC npx vitest run lib/wall-time.test.ts lib/time-display.test.ts server/actions/transport.test.ts && TZ=Australia/Sydney npx vitest run lib/wall-time.test.ts lib/time-display.test.ts server/actions/transport.test.ts`
Expected: PASS both. Then `npx vitest run` (full suite) — fix any test that asserted the old server-tz parse.

- [ ] **Step 5: Commit**

```bash
git add lib/wall-time.ts lib/wall-time.test.ts lib/validations/transport.ts lib/time-display.ts lib/time-display.test.ts server/actions/transport.ts server/actions/transport.test.ts
git commit -m "fix(transport): interpret typed times in the endpoint stop's timezone, not the server's"
```

---

### Task 3: P0-1 (client) — edit dialog renders and validates times in the Stop's timezone

**Files:**
- Modify: `components/trip/transport-form-dialog.tsx` (`toDatetimeLocal` at :244-252, state init at :330-331, StopOption at :37-40, soft warning at :538)
- Modify: `components/trip/itinerary-manager.tsx` (the `StopOption` arrays passed to the transport dialog — search `TransportFormDialog` usages and the option-building code; add `timezone`)
- Modify: `lib/time-display.ts` (add `instantToWallTimeInput`)
- Test: `lib/time-display.test.ts`, `components/trip/transport-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `resolveEndpointZones` (Task 2), `instantToZonedDateISO` / `instantToZonedTime` / `zonedWallTimeToInstant` from `@/lib/tz`.
- Produces: `instantToWallTimeInput(instant: Date | null | undefined, timeZone: string): string` from `@/lib/time-display`. `StopOption` gains `timezone?: string | null`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/time-display.test.ts`:

```ts
import { instantToWallTimeInput } from "@/lib/time-display";

describe("instantToWallTimeInput", () => {
  it("formats an instant as the zone's wall clock regardless of process TZ", () => {
    expect(instantToWallTimeInput(new Date("2026-07-01T06:00:00Z"), "Europe/Paris"))
      .toBe("2026-07-01T08:00");
    expect(instantToWallTimeInput(null, "Europe/Paris")).toBe("");
  });
});
```

Add to `components/trip/transport-form-dialog.test.tsx` (follow the file's existing render helpers):

```tsx
it("shows the stored time in the from-stop's timezone when editing", () => {
  renderDialog({
    transport: { ...baseTransport, fromStopId: "s1", depAt: new Date("2026-07-01T06:00:00Z") },
    stops: [{ id: "s1", name: "Paris", timezone: "Europe/Paris" }],
  });
  expect(screen.getByLabelText("Departure time")).toHaveValue("2026-07-01T08:00");
});

it("does not warn on a cross-zone leg that lands at an earlier wall-clock time", () => {
  renderDialog({
    stops: [
      { id: "syd", name: "Sydney", timezone: "Australia/Sydney" },
      { id: "lax", name: "LA", timezone: "America/Los_Angeles" },
    ],
    defaultFromStopId: "syd",
    defaultToStopId: "lax",
  });
  // Dep 10:00 Sydney = 00:00Z; arr 06:05 LA same date = 13:05Z — a real flight.
  fireEvent.change(screen.getByLabelText("Departure time"), { target: { value: "2026-07-01T10:00" } });
  fireEvent.change(screen.getByLabelText("Arrival time"), { target: { value: "2026-07-01T06:05" } });
  expect(screen.queryByText(/double-check these times/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/time-display.test.ts components/trip/transport-form-dialog.test.tsx`
Expected: FAIL — `instantToWallTimeInput` missing; edit value renders in device tz; warning fires on wall-string comparison.

- [ ] **Step 3: Implement**

`lib/time-display.ts`:

```ts
import { instantToZonedTime, instantToZonedDateISO } from "@/lib/tz"; // (already imported)

/** Format an instant as a datetime-local input value (YYYY-MM-DDTHH:mm) in the
 * given zone — the inverse of the wall-time write path (things-to-fix P0-1). */
export function instantToWallTimeInput(
  instant: Date | null | undefined,
  timeZone: string,
): string {
  if (!instant) return "";
  return `${instantToZonedDateISO(instant, timeZone)}T${instantToZonedTime(instant, timeZone)}`;
}
```

`components/trip/transport-form-dialog.tsx`:
1. `StopOption` gains `timezone?: string | null`.
2. Delete `toDatetimeLocal` (:240-252). Initialise state with the transport's endpoint zones:

```ts
const initialZones = resolveEndpointZones(
  stops.find((s) => s.id === transport?.fromStopId)?.timezone ?? null,
  stops.find((s) => s.id === transport?.toStopId)?.timezone ?? null,
);
const [depAt, setDepAt] = React.useState(instantToWallTimeInput(transport?.depAt, initialZones.depTz));
const [arrAt, setArrAt] = React.useState(instantToWallTimeInput(transport?.arrAt, initialZones.arrTz));
```

3. Replace the soft warning condition (`depAt && arrAt && depAt >= arrAt`) with an instant comparison in the *currently selected* endpoints' zones:

```ts
const currentZones = resolveEndpointZones(
  fromValue.kind === "stop" ? (stops.find((s) => s.id === fromValue.stopId)?.timezone ?? null) : null,
  toValue.kind === "stop" ? (stops.find((s) => s.id === toValue.stopId)?.timezone ?? null) : null,
);
const depInstant = depAt ? zonedWallTimeToInstant(depAt.slice(0, 10), depAt.slice(11, 16), currentZones.depTz) : null;
const arrInstant = arrAt ? zonedWallTimeToInstant(arrAt.slice(0, 10), arrAt.slice(11, 16), currentZones.arrTz) : null;
```

and render the badge when `depInstant && arrInstant && depInstant >= arrInstant`. Imports: `resolveEndpointZones`, `instantToWallTimeInput` from `@/lib/time-display`; `zonedWallTimeToInstant` from `@/lib/tz`.

4. In `itinerary-manager.tsx`, add `timezone: s.timezone` wherever it builds the stop-option arrays passed to `TransportFormDialog` (grep `stops={` near the transport dialog usages; the itinerary stops already carry `timezone`).

- [ ] **Step 4: Run tests under both timezones**

Run: `TZ=UTC npx vitest run components/trip/transport-form-dialog.test.tsx lib/time-display.test.ts && TZ=Australia/Sydney npx vitest run components/trip/transport-form-dialog.test.tsx lib/time-display.test.ts`
Expected: PASS both; then full suite.

- [ ] **Step 5: Commit**

```bash
git add lib/time-display.ts lib/time-display.test.ts components/trip/transport-form-dialog.tsx components/trip/transport-form-dialog.test.tsx components/trip/itinerary-manager.tsx
git commit -m "fix(transport): edit dialog reads/validates times in the stop's timezone"
```

---

### Task 4: P0-2 (helpers) — zone-aware "today"

**Files:**
- Modify: `lib/tz.ts` (add `todayISOInZone`, `currentTripTimezone`)
- Modify: `lib/dates.ts` (add `todayLocalISO`; docblock warning on `todayISO`)
- Test: `lib/tz.test.ts`, `lib/dates.test.ts`

**Interfaces:**
- Produces (Tasks 5 & 6 consume):
  - `todayISOInZone(timeZone: string): string` — today's YYYY-MM-DD in an IANA zone.
  - `currentTripTimezone(stops: Array<{ timezone: string | null; arriveDate: string | null; departDate: string | null }>): string` — the trip's reference zone: first dated stop not yet departed (evaluated in its own zone), else the last dated stop's zone, else `"UTC"`. Callers pass dated stops in `sortOrder` order.
  - `todayLocalISO(): string` — device-local today (client components only).

- [ ] **Step 1: Write the failing tests**

Add to `lib/tz.test.ts`:

```ts
import { vi, afterEach } from "vitest";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";

afterEach(() => vi.useRealTimers());

describe("todayISOInZone", () => {
  it("returns the zone's calendar day, not UTC's", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T22:00:00Z")); // 15 Aug 08:00 in Sydney
    expect(todayISOInZone("Australia/Sydney")).toBe("2026-08-15");
    expect(todayISOInZone("UTC")).toBe("2026-08-14");
  });
});

describe("currentTripTimezone", () => {
  const stops = [
    { timezone: "Europe/Paris", arriveDate: "2026-08-10", departDate: "2026-08-13" },
    { timezone: "Europe/Rome", arriveDate: "2026-08-13", departDate: "2026-08-18" },
  ];
  it("picks the stop the trip is currently at", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T22:00:00Z")); // mid-Rome
    expect(currentTripTimezone(stops)).toBe("Europe/Rome");
  });
  it("picks the first stop before departure and the last after the trip", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00Z"));
    expect(currentTripTimezone(stops)).toBe("Europe/Paris");
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
    expect(currentTripTimezone(stops)).toBe("Europe/Rome");
  });
  it("falls back to UTC with no dated stops", () => {
    expect(currentTripTimezone([])).toBe("UTC");
    expect(currentTripTimezone([{ timezone: "Europe/Paris", arriveDate: null, departDate: null }])).toBe("UTC");
  });
});
```

Add to `lib/dates.test.ts`:

```ts
import { todayLocalISO } from "@/lib/dates";

describe("todayLocalISO", () => {
  it("returns the device-local calendar day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T22:00:00Z"));
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(todayLocalISO()).toBe(expected); // differs from todayISO() when TZ≠UTC
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/tz.test.ts lib/dates.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement**

`lib/tz.ts`:

```ts
/** Today's calendar date (YYYY-MM-DD) in an IANA timezone (things-to-fix P0-2). */
export function todayISOInZone(timeZone: string): string {
  return instantToZonedDateISO(new Date(), timeZone);
}

/**
 * The trip's reference timezone for "what day is it now" questions: the zone
 * of the stop the trip is currently at — the first dated stop whose depart
 * date hasn't passed, judged in that stop's own zone. Before the trip that's
 * the first stop; after it, the last. UTC when nothing is dated.
 * Pass dated stops in sortOrder order (rough stops are ignored).
 */
export function currentTripTimezone(
  stops: Array<{ timezone: string | null; arriveDate: string | null; departDate: string | null }>,
): string {
  const dated = stops.filter((s) => s.timezone && s.arriveDate && s.departDate);
  for (const s of dated) {
    if (todayISOInZone(s.timezone!) <= s.departDate!) return s.timezone!;
  }
  return dated.length ? dated[dated.length - 1].timezone! : "UTC";
}
```

`lib/dates.ts` — add beside `todayISO` and extend `todayISO`'s docblock:

```ts
/**
 * Today as a UTC calendar date. WARNING (things-to-fix P0-2): in UTC+X zones
 * this is *yesterday* every morning. For user-facing "today" use
 * `todayLocalISO()` (client, device zone) or `todayISOInZone`/
 * `currentTripTimezone` (`@/lib/tz`, trip zone). Keep this only for
 * server-side aggregation that genuinely wants UTC.
 */
export function todayISO(): string { /* unchanged */ }

/** Today on the DEVICE's clock (local getters). Client components only —
 * on the server this is the server's zone, which is the bug this exists to fix. */
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run tests under both timezones**

Run: `TZ=UTC npx vitest run lib/tz.test.ts lib/dates.test.ts && TZ=Australia/Sydney npx vitest run lib/tz.test.ts lib/dates.test.ts`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add lib/tz.ts lib/tz.test.ts lib/dates.ts lib/dates.test.ts
git commit -m "feat(dates): zone-aware today helpers (todayISOInZone, currentTripTimezone, todayLocalISO)"
```

---

### Task 5: P0-2 (server sweep) — trip surfaces use the trip's reference timezone

**Files:**
- Modify: `app/(app)/trips/[tripId]/layout.tsx:42-75` (query + `computeTripPhase` call)
- Modify: `app/(app)/trips/[tripId]/page.tsx:32`
- Modify: `app/(app)/trips/page.tsx:21-78` (query + sort)
- Modify: `lib/trip-phase.ts:123` (`compareForTripList` gains optional per-trip todays)
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx:229` (spend `today`)
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx:361` (weather `today`)
- Modify: `components/trip/home/phase-travelling.tsx:58` (compute today AFTER fetching stops)
- Modify: `app/(app)/trips/[tripId]/calendar/page.tsx` + `components/trip/agenda-view.tsx:15` (today becomes a prop)
- Test: `lib/trip-phase.test.ts`, `components/trip/agenda-view.test.tsx`

**Interfaces:**
- Consumes: `todayISOInZone`, `currentTripTimezone` from `@/lib/tz` (Task 4).
- Produces: `AgendaViewProps` gains required `todayISO: string`; `compareForTripList(a, b, today, todayByTripId?: Map<string, string>)`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/trip-phase.test.ts`:

```ts
it("compareForTripList uses a per-trip today when provided", () => {
  const a = { id: "a", startDate: "2026-08-15", endDate: "2026-08-20" } as TripListItem;
  const b = { id: "b", startDate: "2026-08-15", endDate: "2026-08-20" } as TripListItem;
  // Same dates; but trip a's zone has already reached the 15th → travelling ranks first.
  const todays = new Map([["a", "2026-08-15"], ["b", "2026-08-14"]]);
  expect(compareForTripList(a, b, "2026-08-14", todays)).toBeLessThan(0);
});
```

Update `components/trip/agenda-view.test.tsx`: every render gains `todayISO="<fixed date>"`; add:

```tsx
it("highlights the day matching the given todayISO", () => {
  render(<AgendaView tripId="t1" days={twoDays} todayISO={twoDays[1].dateISO} />);
  expect(screen.getByText("Today")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/trip-phase.test.ts components/trip/agenda-view.test.tsx`
Expected: FAIL — new param/prop don't exist.

- [ ] **Step 3: Implement**

`lib/trip-phase.ts` — extend the comparator (backwards-compatible):

```ts
export function compareForTripList(
  a: TripListItem,
  b: TripListItem,
  today: string,
  todayByTripId?: Map<string, string>,
): number {
  const todayFor = (t: TripListItem) => todayByTripId?.get(t.id) ?? today;
  // …replace every internal use of `today` with `todayFor(a)` / `todayFor(b)`
  // for the respective trip's phase computation…
}
```

`app/(app)/trips/[tripId]/layout.tsx` — add to the trip select:

```ts
stops: {
  where: { forkId: null, arriveDate: { not: null } },
  orderBy: { sortOrder: "asc" },
  select: { timezone: true, arriveDate: true, departDate: true },
},
```

then `const today = todayISOInZone(currentTripTimezone(trip.stops));` and pass it to `computeTripPhase`. Same pattern in `app/(app)/trips/[tripId]/page.tsx` (add the stops select to its trip query, replace `todayISO()`).

`app/(app)/trips/page.tsx` — add the same `stops` select inside `include: { trip: { include: { … } } }`, build
`const todayByTripId = new Map(trips.map((t) => [t.id, todayISOInZone(currentTripTimezone(t.stops))]));`
and pass it: `compareForTripList(a, b, today, todayByTripId)`. If `TripCard` receives `today` or computes a phase, thread the per-trip value there too (check its props while editing).

`budget/page.tsx:229` — the page already fetches dated stops with timezones: replace `today: todayISO()` with `today: todayISOInZone(currentTripTimezone(stops))`.

`day/[date]/page.tsx:361` — this page resolves the day's stop (`dayStop`) with a timezone: replace `today: todayISO()` with `today: todayISOInZone(stopTimezone ?? "UTC")` (the `stopTimezone` variable already exists at :352).

`phase-travelling.tsx` — move `const today = todayISO();` (and the three `isBefore/After/Within` + `effectiveTodayISO` lines) to AFTER the `Promise.all` fetch, and compute `const today = todayISOInZone(currentTripTimezone(stops));` (the fetched stops already select timezone/arriveDate/departDate).

`calendar/page.tsx` — compute `const agendaToday = todayISOInZone(currentTripTimezone(stops));` from its already-fetched stops and pass `todayISO={agendaToday}` to `<AgendaView>`; in `agenda-view.tsx` add `todayISO: string` to props and replace `const today = todayISO();` with the prop (drop the import). If `MonthGrid` also derives today (check while editing), thread the same prop.

- [ ] **Step 4: Verify the sweep is complete**

Run: `grep -rn "todayISO()" app components --include=*.tsx --include=*.ts | grep -v test | grep -v todayLocalISO | grep -v todayISOInZone`
Expected: only the Task 6 client-prefill sites remain (inline-cost-fields, other-cost-editor, cost-checklist, checklist). Then `npx vitest run` full suite; fix any test asserting the old single-`today` comparator.

- [ ] **Step 5: Commit**

```bash
git add lib/trip-phase.ts lib/trip-phase.test.ts "app/(app)/trips" components/trip/home/phase-travelling.tsx components/trip/agenda-view.tsx components/trip/agenda-view.test.tsx
git commit -m "fix(dates): phase, today view, agenda, budget and day pages use the trip's timezone for 'today'"
```

---

### Task 6: P0-2 (client sweep) — prefills and due-dates use the device's day

**Files:**
- Modify: `components/trip/inline-cost-fields.tsx:58`
- Modify: `components/trip/other-cost-editor.tsx:263`
- Modify: `components/trip/cost-checklist.tsx:141`
- Modify: `components/trip/checklist.tsx:115`
- Test: `components/trip/inline-cost-fields.test.tsx`, `components/trip/cost-checklist.test.tsx`

**Interfaces:**
- Consumes: `todayLocalISO` from `@/lib/dates` (Task 4). All four files are `"use client"` — device zone is the right answer (spec P0-2 decision).

- [ ] **Step 1: Write the failing test**

Add to `components/trip/cost-checklist.test.tsx`:

```tsx
it("prefills Date paid with the device-local today", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-14T22:00:00Z")); // next local day in TZ=Australia/Sydney
  renderChecklistAndOpenConfirm(); // follow the file's existing popover-open helper
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  expect(screen.getByLabelText("Date paid")).toHaveValue(expected);
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run to verify it fails under a non-UTC zone**

Run: `TZ=Australia/Sydney npx vitest run components/trip/cost-checklist.test.tsx`
Expected: FAIL — value is the UTC day (one behind).

- [ ] **Step 3: Implement**

In each of the four files, replace the `todayISO` import with `todayLocalISO` from `@/lib/dates` and swap the call at the cited line (`checklist.tsx:115` compares due-dates: `const today = todayLocalISO();`). Update the in-file comments that name `todayISO()` (transport/item/accommodation dialogs and other-cost-editor reference it in prose — keep the prose accurate: it is `todayLocalISO()` now).

- [ ] **Step 4: Run tests under both timezones**

Run: `TZ=UTC npx vitest run components/trip/cost-checklist.test.tsx components/trip/inline-cost-fields.test.tsx components/trip/checklist.test.tsx components/trip/other-cost-editor.test.tsx && TZ=Australia/Sydney npx vitest run components/trip/cost-checklist.test.tsx components/trip/inline-cost-fields.test.tsx components/trip/checklist.test.tsx components/trip/other-cost-editor.test.tsx`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add components/trip/inline-cost-fields.tsx components/trip/other-cost-editor.tsx components/trip/cost-checklist.tsx components/trip/checklist.tsx components/trip/cost-checklist.test.tsx
git commit -m "fix(dates): paid-date prefills and due-dates use the device's calendar day"
```

---

### Task 7: P1-1 — the active variant survives tab navigation

**Files:**
- Modify: `components/trip/trip-nav.tsx` (`primaryNav`, `moreNav`, `isNavActive`, `TripNav`)
- Modify: `components/trip/nav-more-menu.tsx`
- Modify: `components/trip/mobile-tab-bar.tsx`
- Test: `components/trip/trip-nav.test.tsx`, `components/trip/mobile-tab-bar.test.tsx`

**Interfaces:**
- Produces: `primaryNav(tripId: string, planParam?: string | null)`, `moreNav(tripId: string, planParam?: string | null)`. Plan-scoped surfaces (**Plan**, **Wishlist**, **Budget**) carry `?plan=`; dated views (Home, Calendar, Summary, Journal, etc.) deliberately never do (spec's do-NOT-fix table).
- Consumes: nothing new. `useSearchParams` from `next/navigation` in the three client components.

- [ ] **Step 1: Write the failing tests**

Add to `components/trip/trip-nav.test.tsx`:

```tsx
it("carries ?plan= on plan-scoped surfaces only", () => {
  const hrefs = Object.fromEntries(
    [...primaryNav("t1", "fork-9"), ...moreNav("t1", "fork-9")].map((i) => [i.label, i.href]),
  );
  expect(hrefs["Plan"]).toBe("/trips/t1/plan?plan=fork-9");
  expect(hrefs["Budget"]).toBe("/trips/t1/budget?plan=fork-9");
  expect(hrefs["Wishlist"]).toBe("/trips/t1/wishlist?plan=fork-9");
  expect(hrefs["Calendar"]).toBe("/trips/t1/calendar");
  expect(hrefs["Summary"]).toBe("/trips/t1/summary");
  expect(hrefs["Home"]).toBe("/trips/t1");
});

it("stays active when the href carries a query string", () => {
  expect(isNavActive("/trips/t1/plan?plan=fork-9", "/trips/t1/plan", "/trips/t1")).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/trip/trip-nav.test.tsx`
Expected: FAIL — no second parameter; active-match breaks on `?`.

- [ ] **Step 3: Implement**

`trip-nav.tsx`:

```ts
export function primaryNav(tripId: string, planParam?: string | null): NavItem[] {
  const base = `/trips/${tripId}`;
  const plan = planParam ? `?plan=${encodeURIComponent(planParam)}` : "";
  return [
    { label: "Home", href: base },
    { label: "Plan", href: `${base}/plan${plan}` },
    { label: "Calendar", href: `${base}/calendar` },
    { label: "Budget", href: `${base}/budget${plan}` },
    { label: "Summary", href: `${base}/summary` },
  ];
}
```

`moreNav` identically — only **Wishlist** gets `${plan}`. `isNavActive` compares the path part: first line becomes `const path = href.split("?")[0];` and all comparisons use `path`. In `TripNav`, `NavMoreMenu`, and `MobileTabBar` add `const planParam = useSearchParams().get("plan");` and pass it into `primaryNav`/`moreNav` (MobileTabBar's inline `primary` array: give Plan and Budget the same `${plan}` suffix). A one-line comment in each: `// Plan-scoped surfaces keep the active variant (?plan=); dated views always follow the real plan.`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/trip/trip-nav.test.tsx components/trip/mobile-tab-bar.test.tsx`
Expected: PASS (extend the mobile-tab-bar test's next/navigation mock with `useSearchParams` if it lacks one). Then full suite.

- [ ] **Step 5: Commit**

```bash
git add components/trip/trip-nav.tsx components/trip/trip-nav.test.tsx components/trip/nav-more-menu.tsx components/trip/mobile-tab-bar.tsx components/trip/mobile-tab-bar.test.tsx
git commit -m "fix(forks): keep the active variant's ?plan= across Plan/Wishlist/Budget navigation"
```

---

### Task 8: P1-2 — Budget honours the active variant

**Files:**
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` (searchParams, queries at :83-118, render)
- Test: `app/(app)/trips/[tripId]/budget/*.test.*` — follow whichever pattern the existing budget page tests use (`ls app/\(app\)/trips/\[tripId\]/budget/`); if none exist at page level, put the query-scoping assertion in a new `budget-page.test.ts` colocated there, mocking `@/lib/db` like `server/actions/costs.test.ts` does.

**Interfaces:**
- Consumes: `planScope(forkId)` from `@/lib/plan-scope`; `VariantBanner` from `@/components/trip/variant-banner` (props `{ tripId, variantName }`); the `?plan=` links from Task 7.
- Produces: `BudgetPage` accepts `searchParams: Promise<{ plan?: string }>`.

- [ ] **Step 1: Write the failing test**

```ts
it("scopes plan entities to the active fork and hides paid surfaces", async () => {
  mockDb.fork.findFirst.mockResolvedValue({ id: "fork-9", name: "Plus Switzerland" });
  // …follow the sibling test scaffolding to render/call the page with
  // searchParams resolving { plan: "fork-9" }…
  expect(mockDb.cost.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ forkId: "fork-9" }) }),
  );
  // Real-plan-only surfaces stay hidden on a fork:
  expect(screen.queryByText("Mark off what you've paid")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run` on the new/extended test file. Expected: FAIL — page ignores `plan`.

- [ ] **Step 3: Implement**

Mirror `plan/page.tsx:26-43` exactly:

```ts
export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const { tripId } = await params;
  const { plan } = await searchParams;
  const selectedForkId = plan ?? null;
  await requireTripAccess(tripId);
  const activeFork = selectedForkId
    ? await db.fork.findFirst({ where: { id: selectedForkId, tripId }, select: { id: true, name: true } })
    : null;
  const activeForkId = activeFork ? activeFork.id : null;
```

Replace `forkId: null` with `...planScope(activeForkId)` in the six plan-entity queries (costs, stops, items, accommodations, transports, chapters). **Leave `exchangeRate` unscoped** — rates are trip-wide (CONTEXT.md). Render changes:
- Top of the page: `{activeFork && <VariantBanner tripId={tripId} variantName={activeFork.name} />}` plus, directly under it, `<p className="text-sm text-muted-foreground">Paid tracking lives on the real plan — this shows the variant's costs only.</p>`.
- Wrap the "Mark off what you've paid" Card and `<SpendSoFarCard …/>` in `{!activeFork && (…)}`.

- [ ] **Step 4: Run tests**

Run: the new test file, then `npx vitest run` full suite.
Expected: PASS; no other page asserts budget queries.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/trips/[tripId]/budget"
git commit -m "feat(budget): honour the active variant via ?plan= — fork-scoped roll-ups, real-plan-only paid surfaces"
```

---

### Task 9: P2-8(b) — surface legacy paid-without-date rows on the Budget page

**Files:**
- Modify: `lib/spend-so-far.ts` (add `legacyPaidCount`)
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` (notice above the checklist, real plan only)
- Test: `lib/spend-so-far.test.ts`

**Interfaces:**
- Produces: `legacyPaidCount(costs: Array<{ paidMinor: number | null; paidAt: Date | null }>): number`.

- [ ] **Step 1: Write the failing test**

```ts
import { legacyPaidCount } from "@/lib/spend-so-far";

it("counts costs with a preserved paid amount but no paid date", () => {
  expect(legacyPaidCount([
    { paidMinor: 5000, paidAt: null },            // legacy — counts
    { paidMinor: 5000, paidAt: new Date() },       // paid — no
    { paidMinor: null, paidAt: null },             // never paid — no
    { paidMinor: 0, paidAt: null },                // zero is legal — counts
  ])).toBe(2);
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run lib/spend-so-far.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/spend-so-far.ts`:

```ts
/** Costs whose payment predates the paidAt-as-sole-signal remodel (ADR 0037):
 * an amount was recorded but no date, so they read as unpaid everywhere.
 * The Budget checklist is the remediation path (things-to-fix P2-8). */
export function legacyPaidCount(
  costs: Array<{ paidMinor: number | null; paidAt: Date | null }>,
): number {
  return costs.filter((c) => c.paidMinor !== null && c.paidAt === null).length;
}
```

`budget/page.tsx` — above the checklist Card, real plan only (`!activeFork`), where `const legacyCount = legacyPaidCount(allCosts);`:

```tsx
{!activeFork && legacyCount > 0 && (
  <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm">
    <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
    <p className="text-amber-800 dark:text-amber-300">
      {legacyCount} {legacyCount === 1 ? "cost has" : "costs have"} a recorded payment but no date —
      tick {legacyCount === 1 ? "it" : "them"} off below to confirm; the amount you paid is offered back.
    </p>
  </div>
)}
```

- [ ] **Step 4: Run tests** — `npx vitest run lib/spend-so-far.test.ts` then full suite. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/spend-so-far.ts lib/spend-so-far.test.ts "app/(app)/trips/[tripId]/budget/page.tsx"
git commit -m "feat(budget): surface legacy paid-without-date costs with a reconciliation notice"
```

---

### Task 10: P2-1 — catch rejections in the itinerary transition handlers

**Files:**
- Modify: `components/trip/itinerary-manager.tsx` (`handleFirmUp` :691-752, `handleFirmUpTrip` :755-782, `handleDeleteStop`, `handleMoveStop`, `handleTogglePin`, `handleMakeRough` :566-616)
- Test: `components/trip/itinerary-manager.test.tsx`

**Interfaces:** none new. Failure copy: `"Something went wrong — nothing was changed. Try again."`

- [ ] **Step 1: Write the failing test**

```tsx
it("clears the pending accommodation nudge when firm-up rejects", async () => {
  vi.mocked(firmUpSegment).mockRejectedValueOnce(new Error("network"));
  // Follow the file's existing accommodation-nudge test setup: click
  // "Add Accommodation" on a rough stop, confirm the nudge dialog.
  // Assert: an error toast fired, and no accommodation form opens when the
  // stop later gains dates (re-render with dated stop → no dialog).
  expect(await screen.findByText(/nothing was changed/i)).toBeInTheDocument();
  rerenderWithDatedStop();
  expect(screen.queryByRole("dialog", { name: /accommodation/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run components/trip/itinerary-manager.test.tsx`. Expected: FAIL — unhandled rejection, marker leaks.

- [ ] **Step 3: Implement**

In `handleFirmUp`, insert before the `finally`:

```ts
} catch {
  // A rejected action (network, thrown server error) must behave like a
  // failed one: report, and tell callers nothing was dated so pending
  // markers (the accommodation nudge) get cleared (things-to-fix P2-1).
  toast({ variant: "destructive", title: "Something went wrong — nothing was changed. Try again." });
  return false;
}
```

Same `catch` (minus the `return false`) in `handleFirmUpTrip`, `handleDeleteStop`, `handleMoveStop`, `handleTogglePin`, and `handleMakeRough` — every `try { await <action> } finally` in this file gains it. (`handleAddAccommodationClick` needs no change: `handleFirmUp` now resolves `false` instead of throwing, so its existing cleanup at :662 runs.)

- [ ] **Step 4: Run tests** — targeted file, then full suite. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "fix(plan): catch rejected stop/firm-up actions so pending nudge markers never leak"
```

---

### Task 11: P2-2 — bound `markCostPaid` amounts at the DB int cap

**Files:**
- Modify: `lib/validations/cost.ts` (export the cap constant)
- Modify: `server/actions/costs.ts:290`
- Test: `server/actions/costs.test.ts`

**Interfaces:**
- Produces: `export const MAX_AMOUNT_MINOR = 2_147_483_647;` from `@/lib/validations/cost` (replace both inline `.max(2_147_483_647, …)` literals with it).

- [ ] **Step 1: Write the failing test**

```ts
it("rejects a paid amount above the int cap with a field error", async () => {
  const r = await markCostPaid("cost-1", 2_147_483_648, "2026-08-14");
  expect(r).toEqual({ success: false, errors: { paidMinor: ["Amount is too large"] } });
  expect(mockDb.cost.update).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run server/actions/costs.test.ts`. Expected: FAIL — resolves success (mock DB doesn't overflow).

- [ ] **Step 3: Implement**

`lib/validations/cost.ts`: `export const MAX_AMOUNT_MINOR = 2_147_483_647;` and use it in both `.max(...)` calls. `server/actions/costs.ts:290`:

```ts
if (!Number.isInteger(paidMinor) || paidMinor < 0) {
  return { success: false, errors: { paidMinor: ["Enter what you paid"] } };
}
if (paidMinor > MAX_AMOUNT_MINOR) {
  return { success: false, errors: { paidMinor: ["Amount is too large"] } };
}
```

- [ ] **Step 4: Run tests** — targeted, then full suite. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/validations/cost.ts server/actions/costs.ts server/actions/costs.test.ts
git commit -m "fix(costs): bound markCostPaid at the int cap with a field error instead of a DB throw"
```

---

### Task 12: P2-3 — activity feed describes `paidAt` changes

**Files:**
- Modify: `lib/activity.ts:200-205` (COST field list)
- Test: `lib/activity.test.ts`

**Interfaces:** none new. The COST list currently has `costMinor`, `paidMinor`, `currency`, `category`.

- [ ] **Step 1: Write the failing test**

```ts
it("describes marking a cost unpaid", () => {
  const changes = describeChanges("COST", { paidAt: new Date("2026-08-01T00:00:00Z") }, { paidAt: null });
  expect(changes).toHaveLength(1);
  expect(changes[0].label).toBe("Paid");
  expect(changes[0].to).toBe("not paid");
});
it("describes marking a cost paid", () => {
  const changes = describeChanges("COST", { paidAt: null }, { paidAt: new Date("2026-08-14T00:00:00Z") });
  expect(changes).toHaveLength(1);
  expect(changes[0].from).toBe("not paid");
});
```

(Adjust `label`/`from`/`to` property names to the file's `ActivityChange` shape — read it first.)

- [ ] **Step 2: Run to verify it fails** — `npx vitest run lib/activity.test.ts`. Expected: FAIL — empty list (the executable repro from the spec's appendix A4).

- [ ] **Step 3: Implement**

Add to the COST array in `lib/activity.ts`, matching how the file's existing `dateFormat` renders values:

```ts
{ key: "paidAt", label: "Paid", format: (v) => (v == null ? "not paid" : dateFormat(v)) },
```

- [ ] **Step 4: Run tests** — targeted, then full suite. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/activity.ts lib/activity.test.ts
git commit -m "fix(activity): describe paidAt changes so un-marking paid isn't an empty entry"
```

---

### Task 13: P2-4 — accommodation & item mutations revalidate the Budget

**Files:**
- Modify: `server/actions/accommodation.ts:143,272,290`
- Modify: `server/actions/items.ts:55-58` (the `revalidateItemPaths` helper)
- Test: `server/actions/accommodation.test.ts`, `server/actions/items.test.ts`

**Interfaces:** none new. Match transport's approach: `revalidatePath(path, "layout")` covers every nested trip route.

- [ ] **Step 1: Write the failing tests**

```ts
// accommodation.test.ts — in the updateAccommodation suite:
it("revalidates the whole trip layout so the Budget reflects inline cost edits", async () => {
  await updateAccommodation("acc-1", validInput);
  expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1", "layout");
});
// items.test.ts — same assertion for updateItem.
```

- [ ] **Step 2: Run to verify they fail** — targeted files. Expected: FAIL — called without `"layout"`.

- [ ] **Step 3: Implement**

`accommodation.ts`: all three `revalidatePath(\`/trips/${…}\`)` calls gain `, "layout"`. `items.ts` — `revalidateItemPaths` becomes:

```ts
function revalidateItemPaths(tripId: string) {
  // "layout" revalidates every nested trip route — including /budget, which
  // inline cost edits reach through this action (things-to-fix P2-4).
  revalidatePath(`/trips/${tripId}`, "layout");
}
```

- [ ] **Step 4: Run tests** — targeted, then full suite. Expected: PASS (update any test pinning the old exact call list).
- [ ] **Step 5: Commit**

```bash
git add server/actions/accommodation.ts server/actions/accommodation.test.ts server/actions/items.ts server/actions/items.test.ts
git commit -m "fix(cache): accommodation and item mutations revalidate the trip layout (budget included)"
```

---

### Task 14: P2-6 + P2-7 + P2-9 + P2-10 — cost-checklist popover cluster

**Files:**
- Modify: `components/trip/cost-checklist.tsx`
- Test: `components/trip/cost-checklist.test.tsx`

**Interfaces:** none new. Four changes, one file:

- [ ] **Step 1: Write the failing tests**

```tsx
it("locks the confirm to the row's currency", () => {
  openConfirmFor(rowInAud);
  // MoneyInput with a single-entry currencies list renders a static suffix, not a combobox
  expect(screen.queryByRole("combobox", { name: /currency/i })).not.toBeInTheDocument();
});

it("prefills the preserved paid amount over the cost amount", () => {
  openConfirmFor({ ...row, costMinor: 10000, paidMinor: 9500, paidAt: null }); // un-ticked history
  expect(screen.getByLabelText("You paid amount")).toHaveValue("95.00");
});

it("keeps focus on the checkbox while un-marking", async () => {
  const cb = screen.getByRole("checkbox", { name: paidRow.label });
  cb.focus();
  await userEvent.click(cb); // triggers pending state
  expect(document.activeElement).toBe(cb); // not <body>
});

it("surfaces server field errors on the field, not a toast", async () => {
  vi.mocked(markCostPaid).mockResolvedValueOnce({
    success: false, errors: { paidMinor: ["Amount is too large"] },
  });
  openConfirmFor(row); await confirmWithAmount("99");
  expect(await screen.findByText("Amount is too large")).toBeInTheDocument();
  expect(toast).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run components/trip/cost-checklist.test.tsx`. Expected: all four FAIL.

- [ ] **Step 3: Implement**

1. **P2-6** `:183`: `currencies={[row.currency]}` (a one-entry list renders read-only; if `MoneyInput` still renders a trigger, read `components/ui/money-input.tsx` and use its static-suffix path).
2. **P2-7** `:138-140`: `formatMinor(row.paidMinor ?? row.costMinor, row.currency)` with comment `// History beats guess: an un-ticked payment's preserved amount is the best answer to "how much did I pay?" (things-to-fix P2-7).`
3. **P2-9**: remove `disabled={pendingId === row.id}` from both checkbox inputs; guard re-entry inside the handlers (`if (pendingId) return;` at the top of `handleUnmark` and in the unpaid checkbox's popover-open) and put `aria-busy={pendingId === row.id}` on the `<li>`.
4. **P2-10** in `PaidConfirm.handleConfirm`:

```ts
const r = await markCostPaid(row.id, minor, date);
if (!r.success) {
  const fieldError = r.errors.paidMinor?.[0] ?? null;
  const dateFieldError = r.errors.paidAt?.[0] ?? null;
  if (fieldError || dateFieldError) {
    setError(fieldError);
    setDateError(dateFieldError);
  } else {
    toast({ variant: "destructive", title: "Couldn't mark that paid." });
  }
  return;
}
```

- [ ] **Step 4: Run tests** — targeted, then full suite. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add components/trip/cost-checklist.tsx components/trip/cost-checklist.test.tsx
git commit -m "fix(budget): checklist confirm — locked currency, history-first prefill, kept focus, inline field errors"
```

---

### Task 15: P2-5 — rename the budget lib's exported shape to cost/paid vocabulary

**Files:**
- Modify: `lib/budget.ts` (`convertCostToHome` :178-197; `buildBudget` accumulators :476-544 and any returned keys)
- Modify: `lib/spend-so-far.ts:29-44` (consumer)
- Modify: every other consumer `tsc` finds (day page uses returned day maps — follow the errors)
- Test: `lib/budget.test.ts`, `lib/spend-so-far.test.ts` (mechanical rename in assertions)

**Interfaces:**
- Produces: `convertCostToHome` returns `{ costHome: number | null; paidHome: number | null }`. `buildBudget`'s returned day maps become `dayCost`/`dayPaid`; internal accumulators `grandCost`/`grandPaid`. **No numeric behaviour change.**

- [ ] **Step 1: Rename in `lib/budget.ts`** — keys, locals, docblocks (the :171-172 comment mentions `actualHome` twice). Update `lib/spend-so-far.ts`'s destructuring: `const { costHome, paidHome } = convertCostToHome(...)`.
- [ ] **Step 2: Let the compiler find the rest** — Run: `npx tsc --noEmit`. Fix every error site (day page, any component reading `dayEstimated`/`dayActual`). No logic edits.
- [ ] **Step 3: Sweep test assertions** — Run: `grep -rln "estimatedHome\|actualHome\|grandEstimated\|grandActual\|dayEstimated\|dayActual" lib app components server` and rename in the listed test files.
- [ ] **Step 4: Verify** — Run: the grep again (expect zero hits), `npx tsc --noEmit`, `npx vitest run`. Expected: all clean, test *count* unchanged.
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(budget): finish the ADR-0037 rename — costHome/paidHome, dayCost/dayPaid, grandCost/grandPaid"
```

---

### Task 16: P1-3 — adopt "Firm up" in the UI

**Files:**
- Modify: `components/trip/itinerary-manager.tsx` (labels at :1559, :1610, :1685, :1786, :1863; confirm dialogs at :724-731 and :760-765; accommodation nudge copy at :638-646)
- Modify: `components/trip/home/phase-sketching.tsx` ("Set dates / firm up →")
- Modify: any hit from `grep -rn "Set dates" components app lib --include=*.tsx --include=*.ts | grep -v test | grep -v date-field` that is a firm-up control (NOT `chapter-form-dialog.tsx`'s "Set dates now" toggle — that is literally a date input, keep it; NOT `stop-form-dialog`'s Arrive/Depart fields)
- Modify: `COMPONENTS.md` (copy references)
- Test: `components/trip/itinerary-manager.test.tsx`, `components/trip/home/*.test.tsx` (string updates)

**Interfaces:** none. Copy mapping (decision approved in the spec):

| Old | New |
|---|---|
| "Set dates for all stops" (button :1559) | "Firm up all stops" |
| "Set dates" (per-leg/per-chapter buttons) | "Firm up" |
| "Date this chapter's stops?" / confirm "Date stops" | "Firm up this chapter's stops?" / "Firm up" |
| "Date all stops from start?" / confirm "Date stops" | "Firm up the whole trip?" / "Firm up" |
| nudge body "…Use **Set dates for all stops**…" | "…Use **Firm up all stops**…" |
| nudge confirm "Set dates for this leg" | "Firm up this leg" |
| "Set dates / firm up →" (sketching Home) | "Firm up →" |

- [ ] **Step 1: Update the failing tests first** — change the strings in the test files to the New column, run them, confirm they FAIL against current code.
- [ ] **Step 2: Apply the mapping** — sweep the files above; keep dialog descriptions' explanatory sentences ("This will date N rough stops from X…" stays — it explains, the *label* is the term).
- [ ] **Step 3: Verify the sweep** — Run: `grep -rn "Set dates" components app --include=*.tsx | grep -v test | grep -v "chapter-form-dialog" | grep -v "date-field"` — every remaining hit must be a literal date-input label (justify each in the task report). Full suite green.
- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(copy): the rough-to-scheduled transition is 'Firm up' in the UI, matching CONTEXT.md"
```

---

### Task 17: P3-1 — fix HANDOFF.md's stale local-dev table; remove stray dev.db

**Files:**
- Modify: `docs/HANDOFF.md` (the "zero external accounts" table, ~line 12)
- Delete: `dev.db` (repo root; check `git ls-files dev.db` — if untracked just `rm`, if tracked `git rm`)

- [ ] **Step 1: Fix the table row** — replace the Database row with: `| Database | Postgres in Docker (\`docker-compose.yml\`) via \`@prisma/adapter-pg\` — see ADR 0005 |` and scan the rest of HANDOFF.md for other SQLite/better-sqlite3 mentions presented as *current* (the historical "why we switched" prose in section 1 stays).
- [ ] **Step 2: Remove `dev.db`** and verify: `ls dev.db` errors; `grep -rn "dev.db" docs README.md` shows only historical references.
- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: HANDOFF local-dev table matches ADR 0005 (Postgres, not SQLite); drop stray dev.db"
```

---

### Task 18: P3-2 + P3-3 — paidAt calendar validity; clear preserved paid amount on currency change

**Files:**
- Modify: `lib/validations/cost.ts:15-18` (`paidAtStringSchema`)
- Modify: `server/actions/costs.ts` (`updateCost`, the `$transaction` at :222-245)
- Test: `lib/validations/cost.test.ts` (or wherever `paidAtStringSchema` tests live — grep first), `server/actions/costs.test.ts`

**Interfaces:** none new. `updateCost`'s `existing` comes from `requireCostAccess` — confirm it selects `currency` (read `requireCostAccess` in the same file; add the field to its select if absent).

- [ ] **Step 1: Write the failing tests**

```ts
it("rejects an impossible calendar date", () => {
  expect(paidAtStringSchema.safeParse("2026-02-30").success).toBe(false);
  expect(paidAtStringSchema.safeParse("2026-02-28").success).toBe(true);
});

it("clears a preserved paid amount when the currency changes without a payment", async () => {
  mockRequireCostAccess({ id: "c1", currency: "EUR", /* …fields the mock needs… */ });
  await updateCost("c1", { ...validOtherCostInput, currency: "USD" }); // no paidMinor, no paidAt
  const updateArg = lastTxUpdateCall(); // the tx.cost.update data
  expect(updateArg.data.paidMinor).toBeNull();
});
```

- [ ] **Step 2: Run to verify they fail** — targeted files. Expected: FAIL.

- [ ] **Step 3: Implement**

`paidAtStringSchema` — refine the date branch:

```ts
const isRealCalendarDate = (s: string): boolean => {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

export const paidAtStringSchema = z
  .string()
  .datetime({ offset: true, message: "paidAt must be an ISO datetime string" })
  .or(
    z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "paidAt must be YYYY-MM-DD or ISO datetime")
      .refine(isRealCalendarDate, "paidAt must be a real calendar date"),
  );
```

`updateCost` — in the `tx.cost.update` data, after the existing `paidMinor` spread:

```ts
// A preserved (history) paid amount is denominated in the OLD currency; a
// currency change with no accompanying payment invalidates it (P3-3).
...(data.currency !== existing.currency && data.paidMinor === undefined && !data.paidAt
  ? { paidMinor: null }
  : {}),
```

- [ ] **Step 4: Run tests** — targeted, then full suite. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/validations/cost.ts server/actions/costs.ts server/actions/costs.test.ts lib/validations/cost.test.ts
git commit -m "fix(costs): real-calendar paidAt validation; currency change clears stale paid history"
```

---

### Task 19: Final verification and spec book-keeping

**Files:**
- Modify: `docs/things-to-fix.md` (status lines)

- [ ] **Step 1: Full gate under both timezones**

Run: `npx tsc --noEmit && npm run lint && TZ=UTC npx vitest run && TZ=Australia/Sydney npx vitest run`
Expected: all clean/green. Any failure goes back to the owning task.

- [ ] **Step 2: Flip the spec's repro expectations**

Recreate the spec's appendix snippets A1–A4 as a scratch test (do NOT commit it): every "BUG" assertion must now FAIL and every "after the fix" expectation must PASS (A1: `td.dep.time === "08:00"` under both TZ values, using the new write path via `transportSchema` + `wallTimeToInstant`; A2 via `todayISOInZone("Australia/Sydney")`; A3: Plan/Wishlist/Budget hrefs carry `?plan=`; A4: one change described). Delete the scratch file.

- [ ] **Step 3: Update `docs/things-to-fix.md`**

For each fixed item add a line `**Status: FIXED** (fix/audit-backlog, <commit short-hash>).` under its heading. Mark P2-8(a), P3-4, P3-5 `**Status: NOT DONE — needs prod DB / running app / condition not met** (see Global Constraints).` Note under P0-1's "Verify" that manual DB verification is still owed.

- [ ] **Step 4: Commit**

```bash
git add docs/things-to-fix.md
git commit -m "docs: mark audited backlog items fixed on fix/audit-backlog"
```
