# Home end timezones, departure/arrival points — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Home end of a Transport is read and written in the Trip's own Home timezone, and a Stop-linked end can carry a departure/arrival point (station, airport, pier) in the form, over MCP and on screen.

**Architecture:** A nullable `Trip.homeTimezone` (IANA), backfilled from the country, set in Trip settings and over MCP. The one zone rule (`resolveEndpointZones` in `lib/time-display.ts`) gains an optional Home argument, and every reader and writer of leg times passes it in. For points, the existing columns `depPlace`/`arrPlace` already allow a value alongside `fromStopId`/`toStopId`. Only the MCP merge, the form and the display labels change. A pure `endpointLabel` helper owns the display rule.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching app code), Prisma 7 + Postgres, React 19, zod, vitest (node project for `*.test.ts`, happy-dom for `*.test.tsx`), @testing-library/react, Tailwind.

**Spec:** `docs/specs/2026-10-14-home-timezone-departure-points.md` (A1–A7, B1–B6). ADR 0030 (amendment 2026-10-14). CONTEXT.md **Home base**, **Transport**.

## Global Constraints

- Verification tiers (CLAUDE.md): inner loop `npx vitest run <file>`; task done `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`; once per branch `npm test` + `npm run build` + `npm run test:integration`.
- Never run `npm run feedback:*`. Never connect to production (`.env.production.local`). Never deploy.
- Copy: glossary terms exactly — Home base, Stop, Transport, Trip, departure point, arrival point. Never "leg", "terminal", "station", "location", "destination" in user-facing copy (the existing "Delete leg" button is not yours to change).
- Real plan vs Fork: `forkId = null` is the real plan (`lib/plan-scope.ts`). The Home base and `homeTimezone` are trip-wide.
- IANA zone validity: `isValidTimeZone(zone)` (Task 1) — never hand-roll `Intl` checks elsewhere.
- Commits: Conventional Commits subject; trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Tasks 2–9 carry `Resolves-Feedback: cmv7bza6t000506l3x5tx34f0`; Tasks 10–12 carry `Resolves-Feedback: cmv7c1dfw000606l3cv8t0fji`. Never run `feedback:resolve`.
- Commit only the files named in the task. `next dev` may re-add a block to `CLAUDE.md`; do not commit `CLAUDE.md`.
- Field names stay `depPlace`/`arrPlace` in code; "departure point"/"arrival point" is the domain and UI word.

## Review Focus

1. A Trip with a Home base but `homeTimezone` NULL (geocode failed, or backfill had no country): Home ends behave exactly as before (far-end zone), nothing throws (Task 2 test "falls back when homeTz is null"; Task 3 test).
2. Renaming the Home base within the same country keeps a hand-picked zone; changing country re-guesses; sending a zone in the same save wins (Task 4 tests).
3. Editing an existing Stop-linked leg that already has a point and changing nothing: the point survives the save, in the form (Task 12 test) and over MCP when `depPlace` is omitted (Task 10 test).
4. Switching an end's Stop to a different Stop over MCP without a new point clears the stale point; re-sending the *same* `fromStopId` keeps it (Task 10 tests).
5. A point that starts with the Stop name but in a different case or with extra spaces ("paris gare du nord" on Paris) still collapses to the point alone (Task 11 test).

---

### Task 1: `homeTimezone` column, backfill, and tz helpers

**Files:**
- Modify: `prisma/schema.prisma` (Trip model, next to `homeCountryCode`, ~line 471)
- Create: `prisma/migrations/20261014120000_trip_home_timezone/migration.sql`
- Create: `prisma/home-timezone-migration.test.ts`
- Modify: `lib/tz.ts` (after `guessTimezoneForCountry`, ~line 291)
- Test: `lib/tz.test.ts` (append)

**Interfaces:**
- Produces:
  ```ts
  // lib/tz.ts
  /** The zone for a country code/name, or null when the table has no entry (never "UTC" as a guess). */
  export function timezoneForCountryOrNull(country?: string | null): string | null;
  /** Every two-letter country code in the table with its zone, for the SQL backfill test. */
  export const COUNTRY_CODE_TIMEZONES: ReadonlyArray<readonly [code: string, zone: string]>;
  /** True when `zone` is an IANA zone this runtime accepts. */
  export function isValidTimeZone(zone: string): boolean;
  ```
  Prisma: `Trip.homeTimezone String? // IANA — Home base zone (ADR 0030 amendment)`.

- [ ] **Step 1: Write the failing tz tests** (append to `lib/tz.test.ts`)

```ts
import { timezoneForCountryOrNull, COUNTRY_CODE_TIMEZONES, isValidTimeZone } from "./tz";

describe("timezoneForCountryOrNull", () => {
  it("returns the table zone for a code", () => {
    expect(timezoneForCountryOrNull("au")).toBe("Australia/Sydney");
    expect(timezoneForCountryOrNull("GB")).toBe("Europe/London");
  });
  it("returns null for unknown or empty input", () => {
    expect(timezoneForCountryOrNull("zz")).toBeNull();
    expect(timezoneForCountryOrNull(null)).toBeNull();
    expect(timezoneForCountryOrNull("")).toBeNull();
  });
});

describe("COUNTRY_CODE_TIMEZONES", () => {
  it("lists only two-letter codes, each a valid zone", () => {
    expect(COUNTRY_CODE_TIMEZONES.length).toBeGreaterThan(10);
    for (const [code, zone] of COUNTRY_CODE_TIMEZONES) {
      expect(code).toMatch(/^[a-z]{2}$/);
      expect(isValidTimeZone(zone)).toBe(true);
    }
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects junk", () => {
    expect(isValidTimeZone("Australia/Brisbane")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run lib/tz.test.ts` — expect FAIL (exports missing).

- [ ] **Step 3: Implement in `lib/tz.ts`**

```ts
export function timezoneForCountryOrNull(country?: string | null): string | null {
  if (!country) return null;
  return COUNTRY_TO_TZ[country.trim().toLowerCase()] ?? null;
}

export const COUNTRY_CODE_TIMEZONES: ReadonlyArray<readonly [string, string]> = Object.entries(COUNTRY_TO_TZ)
  .filter(([key]) => /^[a-z]{2}$/.test(key))
  .map(([key, zone]) => [key, zone] as const);

export function isValidTimeZone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run** `npx vitest run lib/tz.test.ts` — expect PASS.

- [ ] **Step 5: Schema + migration.** Add `homeTimezone String? // IANA — the Home base's zone (ADR 0030 amendment 2026-10-14)` after `homeCountryCode` in the Trip model. Write the migration by hand (do not run `prisma migrate dev` against anything but the local DB). Generate the CASE from `COUNTRY_CODE_TIMEZONES` — one `WHEN 'xx' THEN 'Zone/Name'` per entry, in table order — with a throwaway `npx tsx -e` one-liner, and paste it in:

```sql
-- ADR 0030 amendment (2026-10-14): the Home base carries a timezone.
-- Backfill: every Trip with a Home base gets its country's zone, the same
-- guess a Stop gets (lib/tz.ts COUNTRY_TO_TZ, two-letter codes only).
-- Unknown country stays NULL (Home ends keep the far-end fallback).
-- After deploy, set Christmas in Europe 2026 to 'Australia/Brisbane' by hand.
ALTER TABLE "Trip" ADD COLUMN "homeTimezone" TEXT;

UPDATE "Trip"
SET "homeTimezone" = CASE lower("homeCountryCode")
  WHEN 'au' THEN 'Australia/Sydney'
  -- … one line per COUNTRY_CODE_TIMEZONES entry …
  ELSE NULL
END
WHERE "homeName" IS NOT NULL AND "homeCountryCode" IS NOT NULL;
```

Then `npx prisma generate`.

- [ ] **Step 6: Migration test** — `prisma/home-timezone-migration.test.ts`, same shape as `prisma/share-links-migration.test.ts` (read the file, strip `--` comments):

```ts
import { COUNTRY_CODE_TIMEZONES } from "@/lib/tz";
// FILE / SQL / at() exactly as in share-links-migration.test.ts, pointing at
// "20261014120000_trip_home_timezone"
describe("trip_home_timezone migration", () => {
  it("adds a nullable column before backfilling it", () => {
    expect(at(`ALTER TABLE "Trip" ADD COLUMN "homeTimezone" TEXT;`)).toBeLessThan(at(`UPDATE "Trip"`));
  });
  it("maps every two-letter code in the guess table", () => {
    for (const [code, zone] of COUNTRY_CODE_TIMEZONES) at(`WHEN '${code}' THEN '${zone}'`);
  });
  it("only touches Trips with a Home base", () => {
    at(`WHERE "homeName" IS NOT NULL AND "homeCountryCode" IS NOT NULL`);
  });
});
```

Run `npx vitest run prisma/home-timezone-migration.test.ts` — PASS. If the local DB is up (`npm run test:integration` works), also run `npx prisma migrate deploy` against the **local** `.env` only.

- [ ] **Step 7: Task-done checks and commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261014120000_trip_home_timezone prisma/home-timezone-migration.test.ts lib/tz.ts lib/tz.test.ts
git commit -m "feat(trip): homeTimezone column, country backfill and tz helpers"
```

---

### Task 2: the zone rule takes the Home zone

**Files:**
- Modify: `lib/time-display.ts:28-58`
- Test: `lib/time-display.test.ts` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  export interface HomeZone { depIsHome?: boolean | null; arrIsHome?: boolean | null; homeTimezone?: string | null }
  export function resolveEndpointZones(fromTz: string | null | undefined, toTz: string | null | undefined, home?: HomeZone): { depTz: string; arrTz: string };
  export function transportTimeDisplay(input: {
    depAt: Date | null | undefined; arrAt: Date | null | undefined;
    fromTimezone: string | null | undefined; toTimezone: string | null | undefined;
  } & HomeZone): TransportTimeDisplay;
  ```
  Every existing caller keeps compiling (the new fields are optional).

- [ ] **Step 1: Failing tests**

```ts
import { resolveEndpointZones, transportTimeDisplay } from "./time-display";

describe("resolveEndpointZones with a Home zone", () => {
  it("a Home departure uses the Home zone, the Stop end keeps its own", () => {
    expect(resolveEndpointZones(null, "Asia/Makassar", { depIsHome: true, homeTimezone: "Australia/Brisbane" }))
      .toEqual({ depTz: "Australia/Brisbane", arrTz: "Asia/Makassar" });
  });
  it("a Home arrival uses the Home zone", () => {
    expect(resolveEndpointZones("Europe/Rome", null, { arrIsHome: true, homeTimezone: "Australia/Brisbane" }))
      .toEqual({ depTz: "Europe/Rome", arrTz: "Australia/Brisbane" });
  });
  it("falls back to the far end when homeTz is null", () => {
    expect(resolveEndpointZones(null, "Asia/Makassar", { depIsHome: true, homeTimezone: null }))
      .toEqual({ depTz: "Asia/Makassar", arrTz: "Asia/Makassar" });
  });
  it("ignores the Home zone on a non-Home end", () => {
    expect(resolveEndpointZones(null, "Europe/Rome", { homeTimezone: "Australia/Brisbane" }))
      .toEqual({ depTz: "Europe/Rome", arrTz: "Europe/Rome" });
  });
  it("is unchanged with no third argument", () => {
    expect(resolveEndpointZones(null, null)).toEqual({ depTz: "UTC", arrTz: "UTC" });
  });
});

describe("transportTimeDisplay on Home legs", () => {
  it("Gold Coast → Denpasar departs 17:50 AEST", () => {
    const d = transportTimeDisplay({
      depAt: new Date("2026-12-04T07:50:00Z"), arrAt: new Date("2026-12-04T14:15:00Z"),
      fromTimezone: null, toTimezone: "Asia/Makassar", depIsHome: true, homeTimezone: "Australia/Brisbane",
    });
    expect(d.dep).toEqual({ time: "17:50", zone: "AEST", dateISO: "2026-12-04" });
    expect(d.arr?.time).toBe("22:15");
  });
  it("Rome → Brisbane lands 17:30 AEST the next day", () => {
    const d = transportTimeDisplay({
      depAt: new Date("2027-01-07T07:55:00Z"), arrAt: new Date("2027-01-08T07:30:00Z"),
      fromTimezone: "Europe/Rome", toTimezone: null, arrIsHome: true, homeTimezone: "Australia/Brisbane",
    });
    expect(d.arr).toEqual({ time: "17:30", zone: "AEST", dateISO: "2027-01-08" });
    expect(d.dayDelta).toBe(1);
  });
});
```

(If `tzAbbrev` renders Brisbane as "GMT+10" in this runtime, assert whatever `zoneLabel("Australia/Brisbane", "2026-12-04")` returns instead of the literal — compute it in the test.)

- [ ] **Step 2: Run** `npx vitest run lib/time-display.test.ts` — FAIL.

- [ ] **Step 3: Implement**

```ts
export interface HomeZone { depIsHome?: boolean | null; arrIsHome?: boolean | null; homeTimezone?: string | null }

/** Each end's own zone, null when it has none: a Home end's is the Trip's Home zone, a Stop end's is its Stop's. */
function ownZones(fromTz: string | null | undefined, toTz: string | null | undefined, home?: HomeZone) {
  const homeTz = home?.homeTimezone || null;
  return {
    dep: (home?.depIsHome && homeTz) || fromTz || null,
    arr: (home?.arrIsHome && homeTz) || toTz || null,
  };
}

/** Timezone for each transport endpoint: its own zone (Home end → the Trip's Home zone;
 * Stop end → its Stop's), else the other endpoint's, else UTC. Shared by display AND the
 * write path so a typed wall time round-trips exactly (things-to-fix P0-1; ADR 0030 amendment). */
export function resolveEndpointZones(fromTz, toTz, home?: HomeZone) {
  const own = ownZones(fromTz, toTz, home);
  return { depTz: own.dep ?? own.arr ?? "UTC", arrTz: own.arr ?? own.dep ?? "UTC" };
}
```

In `transportTimeDisplay`, destructure `depIsHome, arrIsHome, homeTimezone`, call `resolveEndpointZones(fromTimezone, toTimezone, { depIsHome, arrIsHome, homeTimezone })`, and label with `zoneLabel(own.dep ?? own.arr, dateISO)` / `zoneLabel(own.arr ?? own.dep, dateISO)` using `ownZones` (same behaviour as today when no Home zone).

- [ ] **Step 4: Run** — PASS. Task-done checks.

- [ ] **Step 5: Commit** — `feat(time): a Home end is read in the Trip's Home zone` with the Part A `Resolves-Feedback` trailer.

---

### Task 3: Transport actions save Home-end times in the Home zone

**Files:**
- Modify: `server/actions/transport.ts` (`createTransport` ~lines 120-131, `updateTransport` ~lines 255-268)
- Test: `server/actions/transport.test.ts` (append; reuse its hoisted mocks — `tripFindUniqueMock` already exists; add `trip.findUnique` to the db mock if a test path needs it)

**Interfaces:**
- Consumes: `resolveEndpointZones(fromTz, toTz, home)` (Task 2); `Trip.homeTimezone` (Task 1).

- [ ] **Step 1: Failing tests**

```ts
describe("Home-end wall times", () => {
  it("createTransport reads a Home departure in the Trip's Home zone", async () => {
    stopFindManyMock.mockResolvedValue([{ id: "stop-dps", timezone: "Asia/Makassar", tripId: "trip-1", forkId: null }]);
    tripFindUniqueMock.mockResolvedValue({ homeTimezone: "Australia/Brisbane" });
    await createTransport("trip-1", { mode: "FLIGHT", depIsHome: true, toStopId: "stop-dps", depAt: "2026-12-04T17:50" });
    expect(transportCreateMock.mock.calls[0][0].data.depAt).toEqual(new Date("2026-12-04T07:50:00Z"));
  });
  it("falls back to the far end when the Trip has no Home zone", async () => {
    stopFindManyMock.mockResolvedValue([{ id: "stop-dps", timezone: "Asia/Makassar", tripId: "trip-1", forkId: null }]);
    tripFindUniqueMock.mockResolvedValue({ homeTimezone: null });
    await createTransport("trip-1", { mode: "FLIGHT", depIsHome: true, toStopId: "stop-dps", depAt: "2026-12-04T15:50" });
    expect(transportCreateMock.mock.calls[0][0].data.depAt).toEqual(new Date("2026-12-04T07:50:00Z"));
  });
  it("updateTransport reads a Home arrival in the Home zone", async () => {
    // arrange the existing-row mocks the same way the file's other updateTransport tests do
    // fromStopId stop-rome (Europe/Rome), arrIsHome true, arrAt "2027-01-08T17:30"
    // expect transportUpdateMock data.arrAt toEqual new Date("2027-01-08T07:30:00Z")
  });
});
```

Write the third test fully, copying the arrange block from the nearest existing `updateTransport` test in the file. Match the file's create-call shape (`transportCreateMock.mock.calls[0][0].data` or inside the tx — read how the existing wall-time tests assert and copy that).

- [ ] **Step 2: Run** `npx vitest run server/actions/transport.test.ts` — FAIL.

- [ ] **Step 3: Implement.** In both actions, only when `depIsHome || arrIsHome`, read `db.trip.findUnique({ where: { id: tripId }, select: { homeTimezone: true } })`, then:

```ts
const { depTz, arrTz } = resolveEndpointZones(tzOf(fromStopId), tzOf(toStopId), {
  depIsHome, arrIsHome, homeTimezone: home?.homeTimezone ?? null,
});
```

Update the `// Interpret wall-time strings…` comment to mention the Home zone.

- [ ] **Step 4: Run** — PASS. Task-done checks.

- [ ] **Step 5: Commit** — `fix(transport): Home-end times are saved in the Home zone` + Part A trailer.

---

### Task 4: `updateTrip` / `createTrip` keep `homeTimezone`

**Files:**
- Modify: `lib/validations/trip.ts` (`tripFields`)
- Modify: `server/actions/trips.ts` (`createTrip` ~lines 55-125, `updateTrip` ~lines 210-300)
- Test: `server/actions/trips.test.ts` (append — find the existing `updateTrip` home-base tests and copy their arrange blocks), `lib/validations/trip.test.ts` (append)

**Interfaces:**
- Consumes: `timezoneForCountryOrNull`, `isValidTimeZone` (Task 1).
- Produces: `TripInput.homeTimezone?: string` — `undefined` = not sent; `""` = not sent either (treated the same); a non-empty value must be a valid IANA zone. Error message: `"Pick a timezone from the list."`

Rules (spec A3) for `updateTrip`, with `before` now also selecting `homeCountryCode` and `homeTimezone`:

| Case | `homeTimezone` written |
|---|---|
| Home base cleared (`homeName: ""`) | `null` |
| `homeTimezone` sent (non-empty) and the Home base is (still) set | the sent value |
| Name changed, geocoded country ≠ `before.homeCountryCode`, or `before.homeTimezone` is null | `timezoneForCountryOrNull(geo.countryCode)` (null if no geocode/country) |
| Name changed, same country, a zone already set | unchanged (omit the key) |
| `homeName` key absent and no `homeTimezone` sent | unchanged (omit the key) |
| `homeTimezone` sent while no Home base exists before or after | ignored (omit the key) |

`createTrip`: when Home fields are set, `homeTimezone = parsed.homeTimezone || timezoneForCountryOrNull(homeCountryCode)`.

- [ ] **Step 1: Failing tests** — one `it` per table row, plus:
  - validation: `tripSchema.safeParse({...VALID, homeTimezone: "Mars/Olympus"})` fails on `homeTimezone`; `"Australia/Brisbane"` and `""` pass.
  - `createTrip` with `homeName: "Gold Coast", homeCountryCode: "au"` writes `homeTimezone: "Australia/Sydney"`; with `homeTimezone: "Australia/Brisbane"` also sent, writes Brisbane.

  Assert on the `data` object passed to the trip update/create mock (`expect.objectContaining({ homeTimezone: … })`, or `expect(data).not.toHaveProperty("homeTimezone")` for "unchanged").

- [ ] **Step 2: Run** `npx vitest run server/actions/trips.test.ts lib/validations/trip.test.ts` — FAIL.

- [ ] **Step 3: Implement.** In `tripFields`:

```ts
homeTimezone: z.string().trim()
  .refine((z) => z === "" || isValidTimeZone(z), "Pick a timezone from the list.")
  .optional(),
```

In `updateTrip`, extend `homeUpdate` with `timezone: string | null | typeof KEEP` following the table. Spread `homeTimezone` into `data` only when it is not `KEEP`. When `rawHomeName === undefined` but a non-empty `homeTimezone` was sent and `before.homeName` is set, write it.

- [ ] **Step 4: Run** — PASS. Task-done checks.

- [ ] **Step 5: Commit** — `feat(trip): keep a Home base timezone on create and update` + Part A trailer.

---

### Task 5: Home timezone picker in Trip settings

**Files:**
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx` (select `homeTimezone: true` ~line 84; pass `homeTimezone: trip.homeTimezone` ~line 158)
- Modify: `components/trip/settings/trip-details-form.tsx` (`defaultValues.homeTimezone?: string | null`; field after Home base, ~line 185)
- Test: `components/trip/settings/trip-details-form.test.tsx` (append; create if absent, copying the render setup from the nearest settings test)

**Interfaces:**
- Consumes: `TripInput.homeTimezone` (Task 4); `TIMEZONES` from `@/lib/tz` (same list as `components/trip/stop-form-dialog.tsx:342-357`; copy that `Field`+`Select` block).

Behaviour: the picker is labelled **"Home base timezone"**, shown only while the Home base input is non-empty (track it with state seeded from `defaultValues.homeName`). It submits `homeTimezone` as the selected value; when the Home base was just typed and no zone picked, submit `""` (the server guesses). Hint under it: "Used for the times of flights from and to home."

- [ ] **Step 1: Failing tests**
  - renders "Home base timezone" with `Australia/Brisbane` selected when `defaultValues = { homeName: "Gold Coast", homeTimezone: "Australia/Brisbane", … }`.
  - no "Home base timezone" field when `homeName` is empty; typing a Home base makes it appear.
  - submitting sends `homeTimezone: "Australia/Brisbane"` to the mocked `updateTrip`.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. Task-done checks.

- [ ] **Step 5: Commit** — `feat(settings): pick the Home base timezone` + Part A trailer.

---

### Task 6: MCP — `update_trip` takes `homeTimezone`, `get_trip_plan` uses it

**Files:**
- Modify: `lib/mcp/tools/trips-stops-write.ts` (`update_trip` inputSchema ~line 361; `mergeTripPatch` ~line 337)
- Modify: `lib/mcp/reads/trip-plan.ts` (select `homeTimezone` ~line 237; output next to `homeBase` ~line 486; endpoint zones ~lines 438-455)
- Modify: `lib/mcp/tools/reads.ts:248` (description: mention the Home end uses the Trip's Home timezone)
- Test: `lib/mcp/tools/trips-stops-write.test.ts`, `lib/mcp/reads/trip-plan.test.ts` (append)

**Interfaces:**
- Consumes: `TripInput.homeTimezone` (Task 4); `transportTimeDisplay({... depIsHome, arrIsHome, homeTimezone})` (Task 2).
- Produces: `TripPlan.homeTimezone: string | null`.

- [ ] **Step 1: Failing tests**
  - `update_trip` with `{ tripId, homeTimezone: "Australia/Brisbane" }` calls `updateTrip` with `expect.objectContaining({ homeTimezone: "Australia/Brisbane" })`; without it, the merged input has no `homeTimezone` key.
  - `update_trip` with `homeTimezone: "Mars/Olympus"` returns the tool error from `updateTrip`'s validation (mock `updateTrip` as the file does; if it is mocked, assert the input reached it and leave validation to Task 4).
  - `get_trip_plan` on a Trip with `homeTimezone: "Australia/Brisbane"` and a Home departure at `2026-12-04T07:50:00Z` to a Makassar Stop returns `departs.localTime: "17:50"` and `homeTimezone: "Australia/Brisbane"`.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement.** `update_trip` schema: `homeTimezone: z.string().trim().optional().describe("IANA timezone of the Home base, e.g. Australia/Brisbane. Home ends of Transport are read and written in it.")`. `mergeTripPatch` forwards `homeTimezone` only when given. In `trip-plan.ts`, pass `depIsHome: t.depIsHome, arrIsHome: t.arrIsHome, homeTimezone: trip?.homeTimezone ?? null` into the existing `transportTimeDisplay` call; add `homeTimezone` to the plan output.

- [ ] **Step 4: Run** — PASS. Task-done checks.

- [ ] **Step 5: Commit** — `feat(mcp): read and set the Home base timezone` + Part A trailer.

---

### Task 7: the Transport card and form use the Home zone

**Files:**
- Modify: `components/trip/transport-card.tsx` (new prop `homeTimezone?: string | null` next to `homeBaseName`; pass into `transportTimeDisplay` ~line 91)
- Modify: `components/trip/transport-form-dialog.tsx` (new prop `homeTimezone?: string | null` on `TransportFormDialogProps` and the inner form props, next to `homeBaseName`; pass `{ depIsHome, arrIsHome, homeTimezone }` into both `resolveEndpointZones` calls, ~lines 438 and 575 — for `currentZones` use `fromValue.kind === "home"` / `toValue.kind === "home"`)
- Modify: `lib/plan/leg-label.ts` (`legLabel(t, stops, homeName?, homeTimezone?)`, pass Home fields into `transportTimeDisplay` ~line 59)
- Modify, plumbing only — add `homeTimezone` wherever `homeBaseName`/`homeName` is already passed to the three above: `components/trip/itinerary-manager.tsx`, `components/trip/day-entry-link.tsx`, `components/day/day-add-menu.tsx`, `app/(app)/trips/[tripId]/plan/page.tsx` (select `homeTimezone: true` ~line 110, pass ~line 564), `app/(app)/trips/[tripId]/day/[date]/page.tsx` (~line 75), `lib/day-view-loader.ts` (select ~line 143; `trip` shape ~line 61; ~lines 493, 721, 749). Use `grep -rn "homeBaseName\|legLabel(" components app lib --include=*.tsx --include=*.ts` to find every call site; each one gets the sibling `homeTimezone`.
- Test: `components/trip/transport-card.test.tsx`, `components/trip/transport-form-dialog.test.tsx`, `lib/plan/leg-label.test.ts` (append)

**Interfaces:**
- Consumes: Task 2's `HomeZone` fields.

- [ ] **Step 1: Failing tests**
  - card: a Home departure (`depIsHome: true`, `toStopTimezone: "Asia/Makassar"`, `depAt 2026-12-04T07:50Z`) with `homeTimezone="Australia/Brisbane"` shows `17:50`; without `homeTimezone` it shows `15:50` (today's fallback).
  - form (edit): the same leg opens with the Leaves input value `2026-12-04T17:50`.
  - form (submit): changing nothing and saving sends `depAt: "2026-12-04T17:50"` (a wall time; the server interprets it — Task 3).
  - legLabel: `legLabel({ mode: "FLIGHT", depIsHome: true, toStopId: "dps", depAt }, [dpsStop], "Gold Coast", "Australia/Brisbane").sub` ends with `17:50`.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. Task-done checks (`npx tsc --noEmit` catches missed plumbing).

- [ ] **Step 5: Commit** — `fix(transport): the card, form and plan label show Home ends in the Home zone` + Part A trailer.

---

### Task 8: the other leg-time readers use the Home zone

**Files:**
- Modify: `lib/itinerary.ts` (`ItineraryTransport` gains `depIsHome?`/`arrIsHome?`; `BuildItineraryInput` gains `homeTimezone?: string | null`; in the transport loop, `depTz = (transport.depIsHome && homeTimezone) || tzOf(fromStop)` and each `arrTz = (transport.arrIsHome && homeTimezone) || tzOf(toStop ?? fromStop)`)
- Modify the five `buildItinerary` callers to select `depIsHome`/`arrIsHome` on transports (if not already) and pass `homeTimezone`: `app/(app)/trips/[tripId]/calendar/page.tsx:179`, `app/(app)/trips/[tripId]/print/page.tsx:243`, `app/share/[token]/page.tsx:220`, `lib/day-view-loader.ts:417`, `lib/travelling-home-loader.ts:283`
- Modify: `lib/digest-dispatch.ts` (`transportZone(t, stopById, tripZone, homeTimezone)`: return `homeTimezone` first when `t.depIsHome && homeTimezone`; select `homeTimezone` with `homeName` ~line 107 and thread it through the args ~lines 318/450)
- Modify: `app/share/[token]/page.tsx` (~line 389: a `zoneOfEnd(stopId, isHome)` that returns the Trip's `homeTimezone` for a Home end; use it at ~lines 399 and 420)
- Modify: `app/(app)/trips/[tripId]/page.tsx` (~line 381: `const zone = (leg?.depIsHome && trip.homeTimezone) || leg?.fromStop?.timezone || currentTripTimezone(...)`; select `homeTimezone`)
- Modify: `lib/day-view-loader.ts:680` (`toZone` for a Home arrival: `zoneLabel(trip.homeTimezone, effectiveDate)` when `arrIsHome && trip.homeTimezone`, else as today)
- Test: `lib/itinerary.test.ts`, `lib/digest-dispatch.test.ts` (append)

- [ ] **Step 1: Failing tests**
  - itinerary: a Home departure at `2026-12-04T22:30:00Z` (= 08:30 next day in Brisbane, 06:30 next day in Makassar — pick an instant whose *date* differs between the two zones) with `homeTimezone: "Australia/Brisbane"` lands on Brisbane's date with `depTimeLabel` in Brisbane time.
  - digest: a Home departure's `localTime` is Brisbane time and it is listed on Brisbane's date.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. Task-done checks.

- [ ] **Step 5: Commit** — `fix(time): Calendar, Digest, Share and Home show Home ends in the Home zone` + Part A trailer.

---

### Task 9: the real-trip fixture sets the Home zone

**Files:**
- Modify: `lib/real-trip/christmas-europe-2026.ts` (comment lines 24-33; `home` ~line 131 gains `timezone: "Australia/Brisbane"`; the render helper ~line 206-226 passes `depIsHome`, `arrIsHome`, `homeTimezone`)
- Modify: whatever persists `home` (`grep -rn "home\." prisma/real/persist.ts`) — write `homeTimezone: trip.home.timezone`; extend the fixture's home type in `lib/demo/types.ts` if it is shared there
- Test: `lib/real-trip/christmas-europe-2026.test.ts` (update the two pinned Home legs)

- [ ] **Step 1:** Change the test expectations for the two Home legs to `17:50` (Gold Coast departure) and `17:30` (Brisbane arrival), with the AEST label as `zoneLabel` renders it. Run — FAIL.
- [ ] **Step 2:** Implement. Replace the "documented exception" paragraph with: "The two Home base legs are read in the Trip's Home timezone (Australia/Brisbane, ADR 0030 amendment), so the card shows the ticket's own wall time." Run — PASS. Task-done checks.
- [ ] **Step 3: Commit** — `test(real-trip): Christmas in Europe reads its Home legs in Brisbane time` + Part A trailer.

---

### Task 10: MCP accepts a Stop and a point together

**Files:**
- Modify: `lib/mcp/tools/bookings-write.ts` (`mergeEndpoint` ~lines 383-430 and its doc comment; `update_transport` and `add_transport` descriptions ~lines 697-720; `transportCreateShape`/`transportPatchShape` `.describe()` on `depPlace`/`arrPlace`)
- Test: `lib/mcp/tools/bookings-write.test.ts` (update the "not both" test at ~line 425 and the "setting depPlace on a currently-stop departure clears fromStopId" test at ~line 396 — both encode the old rule; add the new cases)

**Interfaces:**
- Produces: `mergeEndpoint(current, patch, fields)` with the spec B4 rules. Patch `stopId === ""` means "unlink the Stop".

New `mergeEndpoint` rules (`stopGiven`/`placeGiven`/`homeGiven` as today):

| Patch | Result |
|---|---|
| `isHome: true` with a stop or place | error (unchanged) |
| `isHome: true` alone | Home, no stop, no point (unchanged) |
| `stopId: ""` and `place` (non-empty) | point alone: `{ stopId: null, place, isHome: false }` |
| `stopId: ""` alone | `{ stopId: null, place: current.place, isHome: false }`; if that leaves neither, error `"<Label> needs a stop or a place."` |
| `stopId` (non-empty) and `place` | `{ stopId, place: place || null, isHome: false }` |
| `stopId` alone, equal to `current.stopId` | keep `current.place` |
| `stopId` alone, different | `{ stopId, place: null, isHome: false }` (stale point cleared) |
| `place` alone, current end is a Stop (not Home) | `{ stopId: current.stopId, place: place || null, isHome: false }` (point set or cleared, Stop kept) |
| `place` alone, current end is Home or has no Stop | `{ stopId: null, place: place || null, isHome: false }` |
| `isHome: false` alone | unchanged rule (keep current stop/place; error if neither) |
| nothing | current |

`add_transport` already passes both through to `createTransport`, which stores both; only its description changes.

- [ ] **Step 1: Failing tests** — one per table row that changed (rows 3–9), through `c.callTool({ name: "update_transport", … })` like the neighbouring tests, asserting `updateTransport`'s second argument. Plus `add_transport` with `fromStopId` and `depPlace: "Paris Gare du Nord"` forwards both to `createTransport`. Delete the old "not both" test; rewrite the "clears fromStopId" test as "depPlace alone on a Stop departure keeps the Stop".

- [ ] **Step 2: Run** `npx vitest run lib/mcp/tools/bookings-write.test.ts` — FAIL.

- [ ] **Step 3: Implement** the table. New `update_transport` description:
  > "Changes only the fields you pass; fields you omit keep their current value. Each end is a Stop, a Stop plus its departure/arrival point (depPlace/arrPlace: the exact station, airport or pier), a point alone, or Home. depPlace on a Stop-linked departure sets its point and keeps the Stop; pass depPlace \"\" to clear the point. A new fromStopId clears the old point unless you pass depPlace too. fromStopId \"\" unlinks the Stop. Home takes no point. The same applies to toStopId/arrPlace." + the existing money sentences.

  `add_transport` description gains: "Give fromStopId and depPlace together to link a Stop and name the exact departure point (e.g. a station); same for toStopId/arrPlace."

- [ ] **Step 4: Run** — PASS. Task-done checks.

- [ ] **Step 5: Commit** — `feat(mcp): a Stop-linked Transport end can carry a departure or arrival point` + Part B trailer.

---

### Task 11: `endpointLabel` — how a Stop plus its point reads

**Files:**
- Modify: `lib/home-base.ts` (append; it already owns endpoint resolution)
- Test: `lib/home-base.test.ts` (append)
- Modify: `components/trip/transport-card.tsx:88-89`, `lib/digest-dispatch.ts` (`transportRoute`, ~line 576)
- Test: `components/trip/transport-card.test.tsx`, `lib/digest-dispatch.test.ts` (append)

**Interfaces:**
- Produces:
  ```ts
  /** A Stop-linked end with its point (spec B5): the point alone when it already starts
   * with the Stop's name, the Stop when they match, else "Stop · point". */
  export function endpointLabel(stopName: string | null | undefined, point: string | null | undefined): string | null;
  ```

- [ ] **Step 1: Failing tests**

```ts
describe("endpointLabel", () => {
  it.each([
    ["Paris", "Paris Gare du Nord", "Paris Gare du Nord"],
    ["Munich", "Munich Hbf", "Munich Hbf"],
    ["London", "London Heathrow (LHR)", "London Heathrow (LHR)"],
    ["Denpasar", "Denpasar (DPS)", "Denpasar (DPS)"],
    ["Strasbourg", "Strasbourg", "Strasbourg"],
    ["Aghalee", "Belfast City (BHD)", "Aghalee · Belfast City (BHD)"],
    ["Como", "Milan Malpensa (MXP)", "Como · Milan Malpensa (MXP)"],
    ["Paris", "  paris gare du nord ", "paris gare du nord"],
    ["Paris", null, "Paris"],
    ["Paris", "", "Paris"],
    [null, "Milan Malpensa (MXP)", "Milan Malpensa (MXP)"],
    [null, null, null],
  ])("%s + %s → %s", (stop, point, want) => {
    expect(endpointLabel(stop, point)).toBe(want);
  });
  it("does not treat a longer word as the Stop name", () => {
    expect(endpointLabel("Rome", "Romeo Station")).toBe("Rome · Romeo Station");
  });
});
```

Card: `fromStopName: "Aghalee"`, `depPlace: "Belfast City (BHD)"` heading reads "Aghalee · Belfast City (BHD)". Digest: a Paris → London leg with points routes as "Paris Gare du Nord → London St Pancras".

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

```ts
export function endpointLabel(stopName: string | null | undefined, point: string | null | undefined): string | null {
  const p = point?.trim() || null;
  const s = stopName?.trim() || null;
  if (!s) return p;
  if (!p) return s;
  const lp = p.toLowerCase();
  const ls = s.toLowerCase();
  if (lp === ls) return s;
  if (lp.startsWith(ls) && /^[\s(,·-]/.test(p.slice(s.length))) return p;
  return `${s} · ${p}`;
}
```

Card: `fromLabel = t.depIsHome ? (homeBaseName ?? "Home") : endpointLabel(t.fromStopName, t.depPlace)` (same for `toLabel`). Digest `endpoint(...)`: `isHome ? homeName : endpointLabel(stopId ? stopById.get(stopId)?.name : null, place)`. Keep the Home precedence first in the digest, as the card does.

- [ ] **Step 4: Run** — PASS. Task-done checks.

- [ ] **Step 5: Commit** — `feat(transport): show a Stop with its departure or arrival point` + Part B trailer.

---

### Task 12: the form keeps and edits a Stop's point

**Files:**
- Modify: `components/trip/transport-form-dialog.tsx` (state ~lines 360-396; submit mapping ~lines 515-537; render under each `LocationCombobox` in `stopsCombo` ~lines 620-650)
- Test: `components/trip/transport-form-dialog.test.tsx` (append)

**Interfaces:**
- Consumes: nothing new; `depPlace`/`arrPlace` already flow through `createTransport`/`updateTransport`, which store them with a Stop.

Behaviour (spec B3/B4):
- New state `depPoint`/`arrPoint` seeded from `transport.depPlace`/`arrPlace` **only when** that end is a Stop (`fromStopId` set, not Home); otherwise `""`.
- While `fromValue.kind === "stop"`, render under From an `Input` labelled **"Departure point"** (placeholder "e.g. Gare du Nord, optional"); same for To with **"Arrival point"**.
- Changing `fromValue` to a *different* Stop, or to Home/none/place, resets `depPoint` to `""` (wrap `setFromValue` in a handler that compares `stopId`). Same for To.
- Submit: `case "stop": return { fromStopId: fromValue.stopId, depIsHome: false, depPlace: depPoint.trim() || undefined };` — `undefined` reaches the action as "no point" and stores null (check `server/actions/transport.ts:110`: `data.depPlace || null`), which is the intended clear.
- Add `depPoint`, `arrPoint` to `useFormDirty`.

- [ ] **Step 1: Failing tests**
  - edit a leg `{ fromStopId: "paris", depPlace: "Paris Gare du Nord", toStopId: "london", arrPlace: "London St Pancras" }`: both point inputs show their values; saving untouched sends `depPlace: "Paris Gare du Nord"`, `arrPlace: "London St Pancras"` with the Stop ids.
  - clearing the Departure point and saving sends `depPlace: undefined` with `fromStopId: "paris"`.
  - picking a different From Stop empties the Departure point input.
  - a Home From shows no Departure point input.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. Task-done checks.

- [ ] **Step 5: Commit** — `feat(transport): edit a Stop's departure and arrival point in the form` + Part B trailer.

---

## Branch finish (main session)

`npm test`, `npm run build`, `npm run test:integration` (when the local DB is up). Add a DEPLOY note (follow the lone-Stop backfill's `docs(deploy)` commit for where): after deploy, `UPDATE "Trip" SET "homeTimezone" = 'Australia/Brisbane' WHERE name = 'Christmas in Europe 2026';` — operator runs it, not an agent.
