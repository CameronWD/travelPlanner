# Home base + attachments/notes on trip parts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Trip an optional **Home base** (a lightweight origin that bookends the route with outbound/return legs), and let travellers attach files and collaborative notes to individual trip parts (flights, hotels, activities, stops).

**Architecture:** Two independent parts. **Part A (Home base)** adds nullable origin columns to `Trip` and `depIsHome`/`arrIsHome` flags to `Transport`; home is *never* a Stop and *never* feeds the date engine — home legs are ordinary Transports whose endpoint label/coords resolve from the Trip at read time (see ADR 0030). **Part B (attachments/notes)** is almost all UI on an already-built backend: the `AttachmentList` and `NoteThread` components already accept `targetType`+`targetId`, so this wires them onto the four part cards + edit forms + the Today/Day views, plus two correctness fixes (orphan cleanup on delete, attachment activity logging).

**Tech Stack:** Next.js (App Router, RSC + server actions), TypeScript, Prisma + Postgres, Zod validation, Radix-based UI primitives (`@/components/ui/*`), lucide-react icons, Leaflet (route map), vitest + React Testing Library.

## Global Constraints

- **Terminology (CONTEXT.md):** the origin place is **Home base** (never bare "Home" — that's the front-door screen). A **Transport** endpoint may be a Stop, the Home base, free-text, or unset; a non-Stop endpoint is **between-legs travel**.
- **Home is not a Stop** and **home legs never move Stop dates or the projected end** (ADR 0030). Do not touch firm-up/ripple/Make-it-fit.
- **Action returns:** mainstream actions return `ActionResult<T>` via `ok()`/`fail()`/`validationResult()` from `@/lib/action-result`. Attachment actions are the exception — they return `{ success: true; id? } | { success: false; error: string }`.
- **Geocoding is best-effort:** `geocodePlaceDetailed(query)` (from `@/lib/geocode`) returns `GeoCandidate | null` (`{ name, lat, lng, city, country, countryCode }`) and never throws. A failure leaves coords null; the entity still saves.
- **Activity logging** is explicit (`recordActivity`/`recordPlanActivity`), best-effort, called *after* the write; fork edits are silent (`recordPlanActivity(forkId, …)` no-ops when `forkId != null`).
- **Currency of storage keys / access control:** attachments are trip-scoped (`Attachment.tripId` required); do not attempt Globe/Marker scope here (that is a later, separate phase).
- **Tests:** vitest, run with `npm test` (`vitest run`). Server actions mock `@/lib/db`, `@/lib/guards`, `@/lib/storage`, `next/*` via `vi.hoisted()`+`vi.mock()`. Components use RTL and `vi.mock()` on the server-action modules.
- **Commit** after each task's tests pass. Never touch `main`. Work stays on branch `feat/home-base-and-part-attachments`.

---

# Part A — Home base

### Task A1: Schema + migration for Home base and home transport endpoints

**Files:**
- Modify: `prisma/schema.prisma` (model `Trip` ~line 100; model `Transport` ~line 258)
- Create: `prisma/migrations/<timestamp>_add_home_base/migration.sql` (generated)

**Interfaces:**
- Produces (new Prisma columns consumed by every later task):
  - `Trip.homeName String?`, `Trip.homeLat Float?`, `Trip.homeLng Float?`, `Trip.homeCountryCode String?`, `Trip.roundTrip Boolean @default(true)`
  - `Transport.depIsHome Boolean @default(false)`, `Transport.arrIsHome Boolean @default(false)`

- [ ] **Step 1: Add the Trip columns.** In `prisma/schema.prisma`, inside `model Trip`, directly under `homeCurrency String`:

```prisma
  homeCurrency String // ISO 4217, e.g. "AUD"

  // Home base — the trip's origin (see ADR 0030). Not a Stop; never feeds the
  // date engine. Auto-geocoded on save like a Stop. roundTrip drives the
  // return-leg nudge/flag.
  homeName        String?
  homeLat         Float?
  homeLng         Float?
  homeCountryCode String?
  roundTrip       Boolean @default(true)
```

- [ ] **Step 2: Add the Transport columns.** In `model Transport`, under `arrLng Float?`:

```prisma
  arrLat     Float?
  arrLng     Float?
  depIsHome  Boolean @default(false) // departs the trip's Home base (see ADR 0030)
  arrIsHome  Boolean @default(false) // arrives the trip's Home base
```

- [ ] **Step 3: Generate + apply the migration**

Run: `npx prisma migrate dev --name add_home_base`
Expected: a new migration folder is created and applied; `prisma generate` runs; no errors.

- [ ] **Step 4: Verify schema + client**

Run: `npx prisma validate && npx tsc --noEmit`
Expected: "The schema at prisma/schema.prisma is valid" and a clean typecheck (the new fields exist on the generated client).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(home-base): add Trip home columns and Transport home-endpoint flags"
```

---

### Task A2: Trip validation + `updateTrip` geocoding for the Home base

**Files:**
- Modify: `lib/validations/trip.ts` (schema ~lines 14-33)
- Modify: `server/actions/trips.ts` (`updateTrip` ~lines 100-128)
- Test: `server/actions/trips.test.ts` (create if absent, following `attachments.test.ts` mock style)

**Interfaces:**
- Consumes: `Trip` columns from A1; `geocodePlaceDetailed` from `@/lib/geocode`.
- Produces: `tripSchema` now accepts optional `homeName: string` and `roundTrip: boolean`; `updateTrip(tripId, input)` persists them and geocodes `homeName`.

- [ ] **Step 1: Write the failing test.** In `server/actions/trips.test.ts`, mock `@/lib/db`, `@/lib/guards` (`requireTripAccess` → `{ tripId, userId }`), `@/lib/geocode`, and `next/cache`. Then:

```typescript
it("geocodes homeName and stores coords on update", async () => {
  requireTripAccessMock.mockResolvedValue({ tripId: "t1", userId: "u1" });
  geocodePlaceDetailedMock.mockResolvedValue({
    name: "Sydney", lat: -33.86, lng: 151.2, city: "Sydney", country: "Australia", countryCode: "au",
  });
  tripUpdateMock.mockResolvedValue({ id: "t1" });

  const result = await updateTrip("t1", {
    name: "Europe 2026", homeCurrency: "AUD", homeName: "Sydney", roundTrip: false,
  });

  expect(result.success).toBe(true);
  expect(geocodePlaceDetailedMock).toHaveBeenCalledWith("Sydney");
  expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      homeName: "Sydney", homeLat: -33.86, homeLng: 151.2, homeCountryCode: "au", roundTrip: false,
    }),
  }));
});

it("clears home coords when homeName is emptied", async () => {
  requireTripAccessMock.mockResolvedValue({ tripId: "t1", userId: "u1" });
  tripUpdateMock.mockResolvedValue({ id: "t1" });
  await updateTrip("t1", { name: "T", homeCurrency: "AUD", homeName: "" });
  expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
  expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ homeName: null, homeLat: null, homeLng: null, homeCountryCode: null }),
  }));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- trips.test.ts`
Expected: FAIL (updateTrip doesn't handle homeName/roundTrip yet).

- [ ] **Step 3: Extend the schema.** In `lib/validations/trip.ts`, add to the `createTripSchema` object (before the `.refine(...)`):

```typescript
  homeCurrency: z.enum(CURRENCY_CODES as [string, ...string[]], { error: "Please select a valid currency" }),
  homeName: z.string().trim().max(120, "Home base must be 120 characters or fewer").optional().or(z.literal("")),
  roundTrip: z.boolean().optional(),
```

- [ ] **Step 4: Geocode + persist in `updateTrip`.** In `server/actions/trips.ts`, after validation succeeds and before the `db.trip.update`, load the current home name for change-detection and resolve coords:

```typescript
  const data = parsed.data;
  // Home base: geocode on change; clear coords when the name is removed.
  const before = await db.trip.findUnique({ where: { id: tripId }, select: { homeName: true } });
  const nextHomeName = data.homeName ? data.homeName : null;
  let homeGeo: { homeLat: number | null; homeLng: number | null; homeCountryCode: string | null } = {
    homeLat: null, homeLng: null, homeCountryCode: null,
  };
  if (nextHomeName && nextHomeName !== before?.homeName) {
    const geo = await geocodePlaceDetailed(nextHomeName);
    if (geo) homeGeo = { homeLat: geo.lat, homeLng: geo.lng, homeCountryCode: geo.countryCode };
  } else if (nextHomeName && nextHomeName === before?.homeName) {
    // Name unchanged — leave existing coords untouched by omitting them from the update.
    homeGeo = { homeLat: undefined as never, homeLng: undefined as never, homeCountryCode: undefined as never };
  }
```

Then include in the `db.trip.update({ data: { ... } })` call:

```typescript
      homeName: nextHomeName,
      ...(homeGeo.homeLat !== undefined ? { homeLat: homeGeo.homeLat, homeLng: homeGeo.homeLng, homeCountryCode: homeGeo.homeCountryCode } : {}),
      ...(data.roundTrip !== undefined ? { roundTrip: data.roundTrip } : {}),
```

Add the import at the top: `import { geocodePlaceDetailed } from "@/lib/geocode";`

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- trips.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/validations/trip.ts server/actions/trips.ts server/actions/trips.test.ts
git commit -m "feat(home-base): validate + geocode Home base in updateTrip"
```

---

### Task A3: `lib/home-base.ts` — pure resolution + leg-presence helpers

**Files:**
- Create: `lib/home-base.ts`
- Test: `lib/home-base.test.ts`

**Interfaces:**
- Produces (consumed by A4/A5/A7/A8):

```typescript
export interface HomeBase { name: string; lat: number | null; lng: number | null; countryCode: string | null }
export interface EndpointView { label: string | null; lat: number | null; lng: number | null; isHome: boolean }
export function tripHomeBase(trip: { homeName: string | null; homeLat: number | null; homeLng: number | null; homeCountryCode: string | null }): HomeBase | null
export function resolveEndpoint(opts: { isHome: boolean; stopId?: string | null; place?: string | null; lat?: number | null; lng?: number | null; home: HomeBase | null; stopsById: Record<string, { name: string; lat: number | null; lng: number | null }> }): EndpointView
export function hasOutboundLeg(transports: readonly { depIsHome?: boolean | null; toStopId?: string | null }[], firstStopId: string | null): boolean
export function hasReturnLeg(transports: readonly { arrIsHome?: boolean | null; fromStopId?: string | null }[], lastStopId: string | null): boolean
```

- [ ] **Step 1: Write the failing test.** `lib/home-base.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { tripHomeBase, resolveEndpoint, hasOutboundLeg, hasReturnLeg } from "@/lib/home-base";

describe("tripHomeBase", () => {
  it("returns null when no homeName", () => {
    expect(tripHomeBase({ homeName: null, homeLat: 1, homeLng: 2, homeCountryCode: "au" })).toBeNull();
  });
  it("returns the base when named", () => {
    expect(tripHomeBase({ homeName: "Sydney", homeLat: -33.8, homeLng: 151.2, homeCountryCode: "au" }))
      .toEqual({ name: "Sydney", lat: -33.8, lng: 151.2, countryCode: "au" });
  });
});

describe("resolveEndpoint", () => {
  const home = { name: "Sydney", lat: -33.8, lng: 151.2, countryCode: "au" };
  const stopsById = { s1: { name: "Paris", lat: 48.8, lng: 2.3 } };
  it("resolves a home endpoint to the home base", () => {
    expect(resolveEndpoint({ isHome: true, home, stopsById }))
      .toEqual({ label: "Sydney", lat: -33.8, lng: 151.2, isHome: true });
  });
  it("resolves a stop endpoint to the stop", () => {
    expect(resolveEndpoint({ isHome: false, stopId: "s1", home, stopsById }))
      .toEqual({ label: "Paris", lat: 48.8, lng: 2.3, isHome: false });
  });
  it("falls back to free-text place + its coords", () => {
    expect(resolveEndpoint({ isHome: false, place: "CDG Airport", lat: 49, lng: 2.5, home, stopsById }))
      .toEqual({ label: "CDG Airport", lat: 49, lng: 2.5, isHome: false });
  });
  it("is empty when unset", () => {
    expect(resolveEndpoint({ isHome: false, home, stopsById })).toEqual({ label: null, lat: null, lng: null, isHome: false });
  });
});

describe("leg presence", () => {
  it("detects an outbound leg home->first", () => {
    expect(hasOutboundLeg([{ depIsHome: true, toStopId: "s1" }], "s1")).toBe(true);
    expect(hasOutboundLeg([{ depIsHome: true, toStopId: "s2" }], "s1")).toBe(false);
    expect(hasOutboundLeg([{ depIsHome: false, toStopId: "s1" }], "s1")).toBe(false);
  });
  it("detects a return leg last->home", () => {
    expect(hasReturnLeg([{ arrIsHome: true, fromStopId: "s9" }], "s9")).toBe(true);
    expect(hasReturnLeg([{ arrIsHome: true, fromStopId: "s1" }], "s9")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- home-base.test.ts`
Expected: FAIL ("home-base" not found).

- [ ] **Step 3: Implement `lib/home-base.ts`**

```typescript
export interface HomeBase { name: string; lat: number | null; lng: number | null; countryCode: string | null }
export interface EndpointView { label: string | null; lat: number | null; lng: number | null; isHome: boolean }

export function tripHomeBase(trip: {
  homeName: string | null; homeLat: number | null; homeLng: number | null; homeCountryCode: string | null;
}): HomeBase | null {
  if (!trip.homeName) return null;
  return { name: trip.homeName, lat: trip.homeLat, lng: trip.homeLng, countryCode: trip.homeCountryCode };
}

export function resolveEndpoint(opts: {
  isHome: boolean;
  stopId?: string | null;
  place?: string | null;
  lat?: number | null;
  lng?: number | null;
  home: HomeBase | null;
  stopsById: Record<string, { name: string; lat: number | null; lng: number | null }>;
}): EndpointView {
  if (opts.isHome && opts.home) {
    return { label: opts.home.name, lat: opts.home.lat, lng: opts.home.lng, isHome: true };
  }
  if (opts.stopId && opts.stopsById[opts.stopId]) {
    const s = opts.stopsById[opts.stopId];
    return { label: s.name, lat: s.lat, lng: s.lng, isHome: false };
  }
  if (opts.place) {
    return { label: opts.place, lat: opts.lat ?? null, lng: opts.lng ?? null, isHome: false };
  }
  return { label: null, lat: null, lng: null, isHome: false };
}

export function hasOutboundLeg(
  transports: readonly { depIsHome?: boolean | null; toStopId?: string | null }[],
  firstStopId: string | null,
): boolean {
  if (!firstStopId) return false;
  return transports.some((t) => Boolean(t.depIsHome) && t.toStopId === firstStopId);
}

export function hasReturnLeg(
  transports: readonly { arrIsHome?: boolean | null; fromStopId?: string | null }[],
  lastStopId: string | null,
): boolean {
  if (!lastStopId) return false;
  return transports.some((t) => Boolean(t.arrIsHome) && t.fromStopId === lastStopId);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- home-base.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/home-base.ts lib/home-base.test.ts
git commit -m "feat(home-base): pure endpoint-resolution and leg-presence helpers"
```

---

### Task A4: Flags — missing home connections + return-after-hard-end

**Files:**
- Modify: `lib/flags.ts` (add detectors; extend `FlagTransport`, `DetectFlagsInput`, `detectFlags`)
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx` (call site ~lines 294-307 & the FlagTransport mapping)
- Test: `lib/flags.test.ts`

**Interfaces:**
- Consumes: `hasOutboundLeg`/`hasReturnLeg` from `@/lib/home-base`; new Transport fields from A1.
- Produces: `detectFlags` accepts `home?: HomeBase | null` and `roundTrip?: boolean`; emits flags with ids `missing-home-outbound`, `missing-home-return`, `return-after-hard-end`.

- [ ] **Step 1: Write the failing tests.** In `lib/flags.test.ts`:

```typescript
import { flagMissingHomeConnection, flagReturnLegAfterHardEnd } from "@/lib/flags";

const home = { name: "Sydney", lat: -33.8, lng: 151.2, countryCode: "au" };
const stops = [
  { id: "s1", name: "Paris", sortOrder: 0 },
  { id: "s2", name: "Rome", sortOrder: 1 },
];

describe("flagMissingHomeConnection", () => {
  it("flags a missing outbound and (round trip) return leg", () => {
    const flags = flagMissingHomeConnection(stops, [], home, true);
    expect(flags.map((f) => f.id)).toEqual(["missing-home-outbound", "missing-home-return"]);
    expect(flags[0].message).toContain("Sydney");
    expect(flags[0].message).toContain("Paris");
  });
  it("omits the return flag when not a round trip", () => {
    const flags = flagMissingHomeConnection(stops, [], home, false);
    expect(flags.map((f) => f.id)).toEqual(["missing-home-outbound"]);
  });
  it("is silent when both legs exist", () => {
    const transports = [
      { depIsHome: true, toStopId: "s1", arrIsHome: false, fromStopId: null },
      { arrIsHome: true, fromStopId: "s2", depIsHome: false, toStopId: null },
    ];
    expect(flagMissingHomeConnection(stops, transports, home, true)).toEqual([]);
  });
  it("is silent with no home base or no stops", () => {
    expect(flagMissingHomeConnection(stops, [], null, true)).toEqual([]);
    expect(flagMissingHomeConnection([], [], home, true)).toEqual([]);
  });
});

describe("flagReturnLegAfterHardEnd", () => {
  it("warns when the return leg lands after the hard end date", () => {
    const transports = [{ arrIsHome: true, fromStopId: "s2", arrAt: new Date("2026-07-13T06:00:00Z") }];
    const flags = flagReturnLegAfterHardEnd(transports, "2026-07-12");
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ id: "return-after-hard-end", severity: "warning" });
  });
  it("is silent when the return lands on/before the hard end date", () => {
    const transports = [{ arrIsHome: true, fromStopId: "s2", arrAt: new Date("2026-07-12T06:00:00Z") }];
    expect(flagReturnLegAfterHardEnd(transports, "2026-07-12")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- flags.test.ts`
Expected: FAIL (functions not exported).

- [ ] **Step 3: Extend `FlagTransport` + add detectors.** In `lib/flags.ts`, add to the `FlagTransport` interface: `depIsHome?: boolean | null; arrIsHome?: boolean | null; arrAt?: Date | string | null;` (keep existing `fromStopId`/`toStopId`). Then add:

```typescript
import { hasOutboundLeg, hasReturnLeg, type HomeBase } from "@/lib/home-base";
import { toISODate } from "@/lib/dates"; // if not present, format arrAt inline with the existing date util

export function flagMissingHomeConnection(
  stops: { id: string; name: string; sortOrder: number }[],
  transports: FlagTransport[],
  home: HomeBase | null,
  roundTrip: boolean,
): Flag[] {
  if (!home || stops.length === 0) return [];
  const sorted = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const flags: Flag[] = [];
  if (!hasOutboundLeg(transports, first.id)) {
    flags.push({
      id: "missing-home-outbound",
      severity: "info",
      message: `No transport booked from ${home.name} to ${first.name}.`,
      targetType: "TRANSPORT",
    });
  }
  if (roundTrip && !hasReturnLeg(transports, last.id)) {
    flags.push({
      id: "missing-home-return",
      severity: "info",
      message: `No transport booked from ${last.name} back to ${home.name}.`,
      targetType: "TRANSPORT",
    });
  }
  return flags;
}

export function flagReturnLegAfterHardEnd(
  transports: FlagTransport[],
  hardEndDate: string | null | undefined,
): Flag[] {
  if (!hardEndDate) return [];
  const ret = transports.find((t) => t.arrIsHome && t.arrAt);
  if (!ret || !ret.arrAt) return [];
  const landISO = new Date(ret.arrAt).toISOString().slice(0, 10);
  if (landISO <= hardEndDate) return [];
  return [{
    id: "return-after-hard-end",
    severity: "warning",
    message: `Your return flight lands (${landISO}) after your hard end date (${hardEndDate}).`,
    targetType: "TRIP",
  }];
}
```

- [ ] **Step 4: Wire into `detectFlags`.** Add `home?: HomeBase | null` and `roundTrip?: boolean` to `DetectFlagsInput`; in `detectFlags`, destructure them and push:

```typescript
    ...flagMissingHomeConnection(stops, transports, home ?? null, roundTrip ?? true),
    ...flagReturnLegAfterHardEnd(transports, hardEndDate),
```

- [ ] **Step 5: Update the Summary call site.** In `app/(app)/trips/[tripId]/summary/page.tsx`, where `FlagTransport[]` is assembled from transports, include `depIsHome: t.depIsHome, arrIsHome: t.arrIsHome, arrAt: t.arrAt`; and in the `detectFlags({...})` call add `home: tripHomeBase(trip), roundTrip: trip.roundTrip`. Import `tripHomeBase` from `@/lib/home-base`.

- [ ] **Step 6: Run tests**

Run: `npm test -- flags.test.ts && npx tsc --noEmit`
Expected: PASS + clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add lib/flags.ts lib/flags.test.ts "app/(app)/trips/[tripId]/summary/page.tsx"
git commit -m "feat(home-base): flags for missing home legs and late return"
```

---

### Task A5: Next steps — set-home / add-outbound / add-return nudges

**Files:**
- Modify: `lib/next-steps.ts` (extend `NudgeInput`, add pushes in `buildNextSteps`)
- Modify: `app/(app)/trips/[tripId]/home/phase-planning.tsx` (compute + pass the new nudge inputs)
- Test: `lib/next-steps.test.ts`

**Interfaces:**
- Consumes: `hasOutboundLeg`/`hasReturnLeg` (call site).
- Produces: nudge ids `nudge-set-home-base`, `nudge-add-outbound-flight`, `nudge-add-return-flight`.

- [ ] **Step 1: Write the failing test.** In `lib/next-steps.test.ts`, add a case exercising `buildNextSteps` with the new `NudgeInput` fields:

```typescript
it("nudges to set a home base, then to add outbound/return legs", () => {
  const base = { flags: [], phase: "Planning" as const, tripBasePath: "/trips/t1", limit: 10 };
  const noHome = buildNextSteps({ ...base, nudges: makeNudges({ hasHomeBase: false }) });
  expect(noHome.map((s) => s.id)).toContain("nudge-set-home-base");

  const withHome = buildNextSteps({ ...base, nudges: makeNudges({
    hasHomeBase: true, homeName: "Sydney", firstStopName: "Paris", lastStopName: "Rome",
    hasOutboundLeg: false, hasReturnLeg: false, roundTrip: true,
  }) });
  const ids = withHome.map((s) => s.id);
  expect(ids).toContain("nudge-add-outbound-flight");
  expect(ids).toContain("nudge-add-return-flight");
  expect(withHome.find((s) => s.id === "nudge-add-outbound-flight")!.title).toContain("Paris");
});
```

Add a `makeNudges(overrides)` helper in the test that fills every `NudgeInput` field with a benign default and applies overrides.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- next-steps.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend `NudgeInput`.** In `lib/next-steps.ts`:

```typescript
export interface NudgeInput {
  hasDates: boolean;
  undatedChapterCount: number;
  hasPackingList: boolean;
  hasPretripList: boolean;
  unbookedTransportCount: number;
  // Home base
  hasHomeBase: boolean;
  hasOutboundLeg: boolean;
  hasReturnLeg: boolean;
  roundTrip: boolean;
  homeName: string | null;
  firstStopName: string | null;
  lastStopName: string | null;
}
```

- [ ] **Step 4: Add the pushes** in `buildNextSteps` (mirror the existing `push(condition, id, title, href, priority)` calls):

```typescript
  push(
    !nudges.hasHomeBase,
    "nudge-set-home-base",
    "Set your home base to plan your outbound and return flights.",
    `${tripBasePath}/settings`,
    12,
  );
  push(
    nudges.hasHomeBase && !!nudges.firstStopName && !nudges.hasOutboundLeg,
    "nudge-add-outbound-flight",
    `Add your outbound flight from ${nudges.homeName} to ${nudges.firstStopName}.`,
    `${tripBasePath}/plan`,
    13,
  );
  push(
    nudges.hasHomeBase && nudges.roundTrip && !!nudges.lastStopName && !nudges.hasReturnLeg,
    "nudge-add-return-flight",
    `Add your flight home from ${nudges.lastStopName} to ${nudges.homeName}.`,
    `${tripBasePath}/plan`,
    14,
  );
```

- [ ] **Step 5: Update the call site.** In `phase-planning.tsx`, build the extra fields from the trip + stops + transports already in scope:

```typescript
import { tripHomeBase, hasOutboundLeg, hasReturnLeg } from "@/lib/home-base";
// ...
const sortedStops = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
const home = tripHomeBase(trip);
const firstStop = sortedStops[0] ?? null;
const lastStop = sortedStops[sortedStops.length - 1] ?? null;
// pass into the existing nudges object:
  hasHomeBase: !!home,
  hasOutboundLeg: hasOutboundLeg(transports, firstStop?.id ?? null),
  hasReturnLeg: hasReturnLeg(transports, lastStop?.id ?? null),
  roundTrip: trip.roundTrip,
  homeName: home?.name ?? null,
  firstStopName: firstStop?.name ?? null,
  lastStopName: lastStop?.name ?? null,
```

(If `transports` isn't already loaded in this component, add it to the page query that feeds it.)

- [ ] **Step 6: Run tests**

Run: `npm test -- next-steps.test.ts && npx tsc --noEmit`
Expected: PASS + clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add lib/next-steps.ts lib/next-steps.test.ts "app/(app)/trips/[tripId]/home/phase-planning.tsx"
git commit -m "feat(home-base): next-steps nudges for home base and outbound/return legs"
```

---

### Task A6: Transport form + actions — pick "Home base" as an endpoint

**Files:**
- Modify: `lib/validations/transport.ts` (add `depIsHome`/`arrIsHome`)
- Modify: `server/actions/transport.ts` (`createTransport`, `updateTransport`)
- Modify: `components/trip/transport-form-dialog.tsx` (From/To selects + submit mapping; new `homeBaseName` prop)
- Test: `server/actions/transport.test.ts` (create if absent)

**Interfaces:**
- Consumes: Transport columns from A1.
- Produces: `transportSchema` accepts `depIsHome?: boolean`, `arrIsHome?: boolean`; the dialog accepts `homeBaseName?: string | null`.

- [ ] **Step 1: Write the failing test.** In `server/actions/transport.test.ts` (mock db/guards/geocode/cache):

```typescript
it("persists a home departure and skips geocoding depPlace", async () => {
  requireTripAccessMock.mockResolvedValue({ tripId: "t1", userId: "u1" });
  transportCreateMock.mockResolvedValue({ id: "tr1", mode: "FLIGHT" });
  const result = await createTransport("t1", { mode: "FLIGHT", depIsHome: true, toStopId: "s1" });
  expect(result.success).toBe(true);
  expect(geocodePlaceMock).not.toHaveBeenCalled();
  expect(transportCreateMock).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ depIsHome: true, fromStopId: null, depPlace: null, depLat: null, depLng: null }),
  }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- transport.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend the schema.** In `lib/validations/transport.ts`, add to the object:

```typescript
  depIsHome: z.boolean().optional(),
  arrIsHome: z.boolean().optional(),
```

- [ ] **Step 4: Handle home endpoints in the actions.** In both `createTransport` and `updateTransport` (`server/actions/transport.ts`), after validation, normalise endpoints before geocoding/writing:

```typescript
  const depIsHome = data.depIsHome ?? false;
  const arrIsHome = data.arrIsHome ?? false;
  // A home endpoint owns no stop and no free-text place; its coords resolve from the trip at read time.
  const depPlace = depIsHome ? null : (data.depPlace || null);
  const arrPlace = arrIsHome ? null : (data.arrPlace || null);
  const fromStopId = depIsHome ? null : (data.fromStopId || null);
  const toStopId = arrIsHome ? null : (data.toStopId || null);
```

Guard the existing geocode calls with `if (depPlace) { ... }` / `if (arrPlace) { ... }` (they already are), and include in the `db.transport.create/update` data: `depIsHome, arrIsHome, fromStopId, toStopId, depPlace, arrPlace` and null the coords when the place is null. Skip `validateStopBelongsToTrip` for a null stop id (already handled since it's null).

- [ ] **Step 5: Wire the dialog.** In `components/trip/transport-form-dialog.tsx`:
  - Add `homeBaseName?: string | null` to the props.
  - Add a sentinel near `const NONE = "__none__"`: `const HOME = "__home__";`
  - Initialise state: `transport?.depIsHome ? HOME : (transport?.fromStopId ?? NONE)` (and the same for `toStopId`/`arrIsHome`).
  - In each `<SelectContent>`, after the NONE item, conditionally render:

```tsx
{homeBaseName ? <SelectItem value={HOME}>🏠 {homeBaseName}</SelectItem> : null}
```

  - In the submit payload, replace the `fromStopId`/`toStopId` mapping:

```typescript
  fromStopId: fromStopId === NONE || fromStopId === HOME ? undefined : fromStopId,
  depIsHome: fromStopId === HOME,
  toStopId: toStopId === NONE || toStopId === HOME ? undefined : toStopId,
  arrIsHome: toStopId === HOME,
```

  - The parent that renders this dialog passes `homeBaseName={trip.homeName}`.

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test -- transport.test.ts && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 7: Commit**

```bash
git add lib/validations/transport.ts server/actions/transport.ts server/actions/transport.test.ts components/trip/transport-form-dialog.tsx
git commit -m "feat(home-base): pick Home base as a transport endpoint"
```

---

### Task A7: Home-aware transport labels on the Plan card + Timeline

**Files:**
- Modify: `components/trip/transport-card.tsx` (view-model + label resolution + 🏠 affordance)
- Modify: the parent(s) that build `TransportCardTransport` (e.g. `app/(app)/trips/[tripId]/plan/page.tsx`) to pass `homeBaseName`
- Modify: `lib/itinerary.ts` + `components/trip/timeline.tsx` only if the Timeline shows transport endpoint labels
- Test: `components/trip/transport-card.test.tsx`

**Interfaces:**
- Consumes: `depIsHome`/`arrIsHome` on the transport view-model; `homeBaseName` prop.
- Produces: transport cards render the home-base name for home endpoints.

- [ ] **Step 1: Write the failing test.** `components/trip/transport-card.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TransportCard } from "@/components/trip/transport-card";
vi.mock("@/server/actions/transport", () => ({ deleteTransport: vi.fn(), createTransport: vi.fn(), updateTransport: vi.fn() }));

it("shows the home base name for a home departure", () => {
  render(<TransportCard
    transport={{ id: "tr1", mode: "FLIGHT", depIsHome: true, toStopId: "s1", toStopName: "Paris", sortOrder: 0 }}
    homeBaseName="Sydney" stops={[]} tripId="t1"
  />);
  expect(screen.getByText(/Sydney/)).toBeInTheDocument();
  expect(screen.getByText(/Paris/)).toBeInTheDocument();
});
```

(Match the real required props of `TransportCard`; add any missing required props with minimal values.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- transport-card.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Resolve labels in the card.** In `components/trip/transport-card.tsx`, add `depIsHome?: boolean | null; arrIsHome?: boolean | null;` to `TransportCardTransport`, add `homeBaseName?: string | null` to the card props, and change the label computation:

```typescript
  const fromLabel = t.depIsHome ? (homeBaseName ?? "Home") : (t.fromStopName ?? t.depPlace ?? null);
  const toLabel = t.arrIsHome ? (homeBaseName ?? "Home") : (t.toStopName ?? t.arrPlace ?? null);
```

Optionally prefix a home label with `🏠 `. Keep the existing "hide arrow when one side is missing" logic.

- [ ] **Step 4: Pass `homeBaseName` from the parent.** Wherever `<TransportCard>` is rendered (plan page), pass `homeBaseName={trip.homeName}`.

- [ ] **Step 5: Timeline (only if it labels transport endpoints).** If `components/trip/timeline.tsx` renders transport endpoint names, add `depIsHome`/`arrIsHome` to `ItineraryTransport` (in `lib/itinerary.ts`) and thread `homeBaseName` into the Timeline the same way; otherwise skip. Verify by inspecting the transport rows.

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test -- transport-card.test.tsx && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 7: Commit**

```bash
git add components/trip/transport-card.tsx components/trip/transport-card.test.tsx "app/(app)/trips/[tripId]/plan/page.tsx" lib/itinerary.ts components/trip/timeline.tsx
git commit -m "feat(home-base): render home-base labels on transport views"
```

---

### Task A8: Home base pin + bookend segments on the Summary route map

**Files:**
- Create: `lib/route-map.ts` (pure assembly helper) + `lib/route-map.test.ts`
- Modify: `components/trip/route-map.tsx` (accept + render a home marker and bookend polylines)
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx` (pass the home point)

**Interfaces:**
- Produces: `homeMapPoint(trip)` → `{ name: string; lat: number; lng: number } | null` (null unless both coords present); `RouteMap` gains `home?: HomeMapPoint | null` and `showReturn?: boolean` props.

- [ ] **Step 1: Write the failing test.** `lib/route-map.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { homeMapPoint } from "@/lib/route-map";

describe("homeMapPoint", () => {
  it("returns null without coords", () => {
    expect(homeMapPoint({ homeName: "Sydney", homeLat: null, homeLng: null })).toBeNull();
    expect(homeMapPoint({ homeName: null, homeLat: -33.8, homeLng: 151.2 })).toBeNull();
  });
  it("returns the point when named + located", () => {
    expect(homeMapPoint({ homeName: "Sydney", homeLat: -33.8, homeLng: 151.2 }))
      .toEqual({ name: "Sydney", lat: -33.8, lng: 151.2 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- route-map.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the helper.** `lib/route-map.ts`:

```typescript
export interface HomeMapPoint { name: string; lat: number; lng: number }
export function homeMapPoint(trip: { homeName: string | null; homeLat: number | null; homeLng: number | null }): HomeMapPoint | null {
  if (!trip.homeName || trip.homeLat == null || trip.homeLng == null) return null;
  return { name: trip.homeName, lat: trip.homeLat, lng: trip.homeLng };
}
```

- [ ] **Step 4: Render on the map.** In `components/trip/route-map.tsx`, add `home?: HomeMapPoint | null` and `showReturn?: boolean` props. When `home` is set: render a distinct 🏠 marker (a `divIcon` with the house glyph or a differently-styled circle), a dashed polyline from `home` → first coordinated stop, and — when `showReturn` — a dashed polyline from the last coordinated stop → `home`. Include `home` in the `fitBounds` calculation. Keep the numbered 1..n markers for stops only.

- [ ] **Step 5: Pass from Summary.** In `summary/page.tsx`, at the `<RouteMap ... />` call add `home={homeMapPoint(trip)} showReturn={trip.roundTrip}`. Import `homeMapPoint`.

- [ ] **Step 6: Run tests + typecheck + build**

Run: `npm test -- route-map.test.ts && npx tsc --noEmit`
Expected: PASS + clean. (Leaflet rendering is verified manually in the review step.)

- [ ] **Step 7: Commit**

```bash
git add lib/route-map.ts lib/route-map.test.ts components/trip/route-map.tsx "app/(app)/trips/[tripId]/summary/page.tsx"
git commit -m "feat(home-base): home pin and bookend legs on the route map"
```

---

### Task A9: Trip settings UI — Home base field + round-trip toggle

**Files:**
- Modify: `components/trip/settings/trip-details-form.tsx`
- Test: `components/trip/settings/trip-details-form.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `updateTrip` (already handles `homeName`/`roundTrip` from A2).

- [ ] **Step 1: Write the failing test.**

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
const updateTrip = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/server/actions/trips", () => ({ updateTrip }));
import { TripDetailsForm } from "@/components/trip/settings/trip-details-form";

it("submits home base name and round-trip toggle", async () => {
  render(<TripDetailsForm tripId="t1" defaultValues={{ name: "Europe", homeCurrency: "AUD", homeName: "", roundTrip: true }} />);
  await userEvent.type(screen.getByLabelText(/home base/i), "Sydney");
  await userEvent.click(screen.getByLabelText(/round trip/i)); // toggle off
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  expect(updateTrip).toHaveBeenCalledWith("t1", expect.objectContaining({ homeName: "Sydney", roundTrip: false }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- trip-details-form.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add the fields.** In `trip-details-form.tsx`, extend `defaultValues` typing with `homeName?: string | null; roundTrip?: boolean`, add to the input object in `handleSubmit`: `homeName: data.get("homeName"), roundTrip: data.get("roundTrip") === "on"`, and render below the Home currency field:

```tsx
<Field label="Home base" error={fieldError("homeName")}
  description="Where this trip departs from and returns to. Leave blank if you'd rather not set one.">
  <Input name="homeName" defaultValue={defaultValues.homeName ?? ""} placeholder="e.g. Sydney" disabled={isPending} />
</Field>

<Field label="Round trip">
  <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" name="roundTrip" defaultChecked={defaultValues.roundTrip ?? true} disabled={isPending} />
    Nudge me to book a flight home from the last stop.
  </label>
</Field>
```

Ensure the settings page passes `homeName` + `roundTrip` into `defaultValues`.

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- trip-details-form.test.tsx && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add components/trip/settings/trip-details-form.tsx components/trip/settings/trip-details-form.test.tsx "app/(app)/trips/[tripId]/settings/page.tsx"
git commit -m "feat(home-base): Home base + round-trip controls in trip settings"
```

---

# Part B — Attachments & notes on trip parts

### Task B1: Orphan cleanup — delete a part's attachments (+files) and notes with it

**Files:**
- Create: `server/actions/target-cleanup.ts` (shared helper)
- Modify: `server/actions/stops.ts`, `server/actions/transport.ts`, `server/actions/accommodation.ts`, `server/actions/items.ts` (delete actions)
- Test: `server/actions/target-cleanup.test.ts`

**Interfaces:**
- Produces: `export async function cleanupTargetSideData(tripId: string, targetType: TargetType, targetId: string): Promise<void>` — deletes matching `Attachment` rows (+ their storage blobs, best-effort) and `Note` rows.

- [ ] **Step 1: Write the failing test.** Mock `@/lib/db` (attachment.findMany/deleteMany, note.deleteMany) and `@/lib/storage`:

```typescript
it("deletes attachments (with blobs) and notes for a target", async () => {
  attachmentFindManyMock.mockResolvedValue([{ id: "a1", storageKey: "k1" }, { id: "a2", storageKey: null }]);
  await cleanupTargetSideData("t1", "TRANSPORT", "tr1");
  expect(storageDeleteMock).toHaveBeenCalledWith("k1");
  expect(attachmentDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: "t1", targetType: "TRANSPORT", targetId: "tr1" } });
  expect(noteDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: "t1", targetType: "TRANSPORT", targetId: "tr1" } });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- target-cleanup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the helper.** `server/actions/target-cleanup.ts`:

```typescript
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import type { TargetType } from "@/lib/enums";

export async function cleanupTargetSideData(tripId: string, targetType: TargetType, targetId: string): Promise<void> {
  const attachments = await db.attachment.findMany({
    where: { tripId, targetType, targetId }, select: { id: true, storageKey: true },
  });
  const storage = getStorage();
  for (const a of attachments) {
    if (a.storageKey) { try { await storage.delete(a.storageKey); } catch { /* best-effort */ } }
  }
  await db.attachment.deleteMany({ where: { tripId, targetType, targetId } });
  await db.note.deleteMany({ where: { tripId, targetType, targetId } });
}
```

(Confirm the `getStorage().delete` method name against `lib/storage.ts`; adjust if it differs.)

- [ ] **Step 4: Call it from each delete action.** In `deleteStop`/`deleteTransport`/`deleteAccommodation`/`deleteItem`, after the entity row is deleted and before returning, add:

```typescript
  await cleanupTargetSideData(tripId, "STOP", stopId); // adjust type + id per action
```

Use the correct `TargetType` per action (`STOP`/`TRANSPORT`/`ACCOMMODATION`/`ITEM`) and the `tripId` already resolved by the access guard.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- target-cleanup.test.ts && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add server/actions/target-cleanup.ts server/actions/target-cleanup.test.ts server/actions/stops.ts server/actions/transport.ts server/actions/accommodation.ts server/actions/items.ts
git commit -m "fix(attachments): clean up attachments + notes when a part is deleted"
```

---

### Task B2: Log attachment add/remove to the Activity feed

**Files:**
- Modify: `lib/activity.ts` (add `"ATTACHMENT"` entity type + `entityLabel` case)
- Modify: `server/actions/attachments.ts` (`uploadAttachment`, `deleteAttachment`)
- Test: `server/actions/attachments.test.ts` (extend)

**Interfaces:**
- Consumes: `recordActivity` from `@/server/actions/activity`.
- Produces: `ACTIVITY_ENTITY_TYPES` includes `"ATTACHMENT"`.

- [ ] **Step 1: Write the failing test.** Extend `attachments.test.ts`:

```typescript
it("logs a CREATED attachment activity", async () => {
  // ...existing successful-upload setup...
  await uploadAttachment(makeFormData({ tripId: "t1", targetType: "TRANSPORT", targetId: "tr1", filename: "boarding.pdf" }));
  expect(recordActivityMock).toHaveBeenCalledWith(expect.objectContaining({
    tripId: "t1", verb: "CREATED", entityType: "ATTACHMENT", changes: { excerpt: "boarding.pdf" },
  }));
});
```

Add `recordActivityMock` to the hoisted mocks (`vi.mock("@/server/actions/activity", () => ({ recordActivity: recordActivityMock }))`).

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- attachments.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the entity type.** In `lib/activity.ts`, add `"ATTACHMENT"` to `ACTIVITY_ENTITY_TYPES`, and add a case in `entityLabel()`: `case "ATTACHMENT": return (entity as { filename?: string }).filename ?? "a file";`

- [ ] **Step 4: Record in the actions.** In `uploadAttachment`, after the row is finalised: 

```typescript
  await recordActivity({ tripId, verb: "CREATED", entityType: "ATTACHMENT", entityId: created.id, entityLabel: file.name, changes: { excerpt: file.name } });
```

In `deleteAttachment`, after deletion:

```typescript
  await recordActivity({ tripId: attachment.tripId, verb: "DELETED", entityType: "ATTACHMENT", entityId: id, entityLabel: attachment.filename, changes: { excerpt: attachment.filename } });
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- attachments.test.ts && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add lib/activity.ts server/actions/attachments.ts server/actions/attachments.test.ts
git commit -m "feat(attachments): log attachment add/remove to the activity feed"
```

---

### Task B3: NoteThread on Transport + Accommodation cards

**Files:**
- Modify: `components/trip/transport-card.tsx`, `components/trip/accommodation-card.tsx` (embed `NoteThread`)
- Modify: the parent page(s) that render these cards to query + pass `notes` and `currentUserId`
- Test: `components/trip/transport-card.test.tsx`, `components/trip/accommodation-card.test.tsx`

**Interfaces:**
- Consumes: `NoteThread` (`{ tripId, targetType, targetId, notes, currentUserId, inline? }`), already built.
- Produces: transport/accommodation cards accept optional `notes?: NoteView[]` + `currentUserId?: string`.

- [ ] **Step 1: Write the failing test** (transport):

```typescript
it("renders a note thread trigger for a transport", () => {
  render(<TransportCard transport={{ id: "tr1", mode: "FLIGHT", sortOrder: 0 }} tripId="t1"
    currentUserId="u1" notes={[]} stops={[]} />);
  expect(screen.getByRole("button", { name: /note/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- transport-card.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Embed NoteThread.** In `transport-card.tsx` and `accommodation-card.tsx`, add `notes?: NoteView[]` and `currentUserId?: string` to the props, import `NoteThread`, and render it in the card's action row (`<RowActions>` area) — copying the exact guarded block from `stop-card.tsx`:

```tsx
{notes !== undefined && tripId && currentUserId && (
  <NoteThread tripId={tripId} targetType="TRANSPORT" targetId={t.id} notes={notes} currentUserId={currentUserId} />
)}
```

(Use `targetType="ACCOMMODATION"` and the accommodation id in the accommodation card.)

- [ ] **Step 4: Plumb data from the parent.** In the plan page (and anywhere these cards render with notes), query notes for transports/accommodations (`db.note.findMany({ where: { tripId, targetType: { in: ["TRANSPORT","ACCOMMODATION"] } } })`), group by `targetId`, and pass `notes={notesByTarget[t.id] ?? []} currentUserId={session.user.id}`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- transport-card.test.tsx accommodation-card.test.tsx && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add components/trip/transport-card.tsx components/trip/accommodation-card.tsx components/trip/transport-card.test.tsx components/trip/accommodation-card.test.tsx "app/(app)/trips/[tripId]/plan/page.tsx"
git commit -m "feat(notes): collaborative note threads on flights and hotels"
```

---

### Task B4: Attachment count-badge + popover on all four part cards

**Files:**
- Create: `components/trip/attachment-popover.tsx` (paperclip trigger + popover wrapping `AttachmentList`)
- Modify: `transport-card.tsx`, `accommodation-card.tsx`, `item-card.tsx`, `stop-card.tsx`
- Modify: parent page(s) to query + pass per-target attachments
- Test: `components/trip/attachment-popover.test.tsx`

**Interfaces:**
- Consumes: `AttachmentList` (`{ tripId, targetType, targetId, attachments, compact? }`).
- Produces: `AttachmentPopover` props `{ tripId, targetType, targetId, attachments: AttachmentView[] }`; cards accept `attachments?: AttachmentView[]`.

- [ ] **Step 1: Write the failing test.**

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
vi.mock("@/server/actions/attachments", () => ({ uploadAttachment: vi.fn(), deleteAttachment: vi.fn() }));
import { AttachmentPopover } from "@/components/trip/attachment-popover";

it("shows the count and opens the list", async () => {
  render(<AttachmentPopover tripId="t1" targetType="TRANSPORT" targetId="tr1"
    attachments={[{ id: "a1", filename: "boarding.pdf", mime: "application/pdf", size: 10, url: "/api/attachments/a1" }]} />);
  const trigger = screen.getByRole("button", { name: /attachment/i });
  expect(trigger).toHaveTextContent("1");
  await userEvent.click(trigger);
  expect(screen.getByText("boarding.pdf")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- attachment-popover.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Build the popover.** `components/trip/attachment-popover.tsx` (client component), mirroring NoteThread's popover trigger:

```tsx
"use client";
import * as React from "react";
import { Paperclip } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";
import type { TargetType } from "@/lib/enums";

export function AttachmentPopover(props: { tripId: string; targetType: TargetType; targetId: string; attachments: AttachmentView[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          aria-label={props.attachments.length ? `Attachments (${props.attachments.length})` : "Attachments"}>
          <Paperclip className="size-3.5" aria-hidden="true" />
          {props.attachments.length > 0 && <span className="font-medium">{props.attachments.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <AttachmentList tripId={props.tripId} targetType={props.targetType} targetId={props.targetId} attachments={props.attachments} compact />
      </PopoverContent>
    </Popover>
  );
}
```

(Export `AttachmentView` from `attachment-list.tsx` if it isn't already.)

- [ ] **Step 4: Add to the four cards** in their action rows: `{attachments !== undefined && tripId && (<AttachmentPopover tripId={tripId} targetType="TRANSPORT" targetId={t.id} attachments={attachments} />)}` (correct `targetType`/id per card; add `attachments?: AttachmentView[]` to each card's props).

- [ ] **Step 5: Plumb data.** In the plan page, query attachments for the trip's stops/transports/accommodations/items (`db.attachment.findMany({ where: { tripId } })`), group by `targetId`, and pass `attachments={attachmentsByTarget[id] ?? []}` to each card.

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test -- attachment-popover.test.tsx && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 7: Commit**

```bash
git add components/trip/attachment-popover.tsx components/trip/attachment-popover.test.tsx components/trip/transport-card.tsx components/trip/accommodation-card.tsx components/trip/item-card.tsx components/trip/stop-card.tsx "app/(app)/trips/[tripId]/plan/page.tsx"
git commit -m "feat(attachments): per-part attachment badge + popover on all cards"
```

---

### Task B5: Attachment upload box inside the edit forms (save-first on create)

**Files:**
- Modify: `transport-form-dialog.tsx`, `accommodation-form-dialog.tsx`, `item-form-dialog.tsx`, `stop-form-dialog.tsx`
- Test: extend one form dialog test (e.g. `transport-form-dialog.test.tsx`)

**Interfaces:**
- Consumes: `AttachmentList` (edit mode) with the entity's id; the dialogs already know whether they're editing (an existing record id) or creating.

- [ ] **Step 1: Write the failing test.**

```typescript
it("shows attachments when editing and a save-first hint when creating", async () => {
  const { rerender } = render(<TransportFormDialog open tripId="t1" transport={{ id: "tr1", mode: "FLIGHT", sortOrder: 0 }} attachments={[]} stops={[]} onOpenChange={() => {}} />);
  expect(screen.getByText(/upload/i)).toBeInTheDocument();
  rerender(<TransportFormDialog open tripId="t1" transport={undefined} attachments={[]} stops={[]} onOpenChange={() => {}} />);
  expect(screen.getByText(/save.*first|save the flight/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- transport-form-dialog.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add the section.** In each edit dialog, below the Notes field, add:

```tsx
<Field label="Attachments">
  {transport?.id ? (
    <AttachmentList tripId={tripId} targetType="TRANSPORT" targetId={transport.id} attachments={attachments ?? []} compact />
  ) : (
    <p className="text-xs text-muted-foreground">Save this flight first, then reopen it to attach files.</p>
  )}
</Field>
```

Add an `attachments?: AttachmentView[]` prop to each dialog; use the correct `targetType` and the correct record variable (`accommodation?.id`, `item?.id`, `stop?.id`) and a suitable "save … first" message per entity.

- [ ] **Step 4: Pass `attachments` from the card** (the card already has the per-target attachments from B4 — hand them to the dialog it opens).

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- transport-form-dialog.test.tsx && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add components/trip/transport-form-dialog.tsx components/trip/accommodation-form-dialog.tsx components/trip/item-form-dialog.tsx components/trip/stop-form-dialog.tsx components/trip/transport-form-dialog.test.tsx
git commit -m "feat(attachments): upload box inside part edit forms"
```

---

### Task B6: Surface attachments read-only on the Today + Day views

**Files:**
- Create: `components/trip/attachment-links.tsx` (read-only paperclip links)
- Modify: `components/trip/timeline.tsx` (render links on transport/accommodation/item rows)
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx` and `components/trip/home/phase-travelling.tsx` (fetch + pass attachments)
- Test: `components/trip/attachment-links.test.tsx`

**Interfaces:**
- Produces: `AttachmentLinks` props `{ attachments: AttachmentView[] }` — renders each as an external link to `/api/attachments/<id>`; renders nothing when empty.

- [ ] **Step 1: Write the failing test.**

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AttachmentLinks } from "@/components/trip/attachment-links";

it("links each attachment and renders nothing when empty", () => {
  const { container, rerender } = render(<AttachmentLinks attachments={[{ id: "a1", filename: "boarding.pdf", mime: "application/pdf", size: 1, url: "/api/attachments/a1" }]} />);
  const link = screen.getByRole("link", { name: /boarding.pdf/i });
  expect(link).toHaveAttribute("href", "/api/attachments/a1");
  rerender(<AttachmentLinks attachments={[]} />);
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- attachment-links.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Build the component.** `components/trip/attachment-links.tsx`:

```tsx
import { Paperclip } from "lucide-react";
import type { AttachmentView } from "@/components/trip/attachment-list";

export function AttachmentLinks({ attachments }: { attachments: AttachmentView[] }) {
  if (!attachments.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {attachments.map((a) => (
        <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline">
          <Paperclip className="size-3" aria-hidden="true" />{a.filename}
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Render in the Timeline.** In `components/trip/timeline.tsx`, thread an `attachmentsByTarget?: Record<string, AttachmentView[]>` prop and render `<AttachmentLinks attachments={attachmentsByTarget?.[id] ?? []} />` under the transport, accommodation, and timed/untimed item rows (using each row entity's id).

- [ ] **Step 5: Fetch + pass.** In the Day view page and the Travelling-phase Home, query the trip's attachments (`db.attachment.findMany({ where: { tripId } })`), group by `targetId`, and pass `attachmentsByTarget` into `<Timeline>` (and to the "tonight's accommodation" / "next transport" blocks in `phase-travelling.tsx`).

- [ ] **Step 6: Run tests + typecheck + full suite**

Run: `npm test -- attachment-links.test.tsx && npm test && npx tsc --noEmit`
Expected: PASS (whole suite) + clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add components/trip/attachment-links.tsx components/trip/attachment-links.test.tsx components/trip/timeline.tsx "app/(app)/trips/[tripId]/day/[date]/page.tsx" components/trip/home/phase-travelling.tsx
git commit -m "feat(attachments): read-only attachment links on Today and Day views"
```

---

## Final verification (after all tasks)

- [ ] Run the full suite: `npm test` → all green.
- [ ] Typecheck + lint + build: `npx tsc --noEmit && npm run lint && npm run build`.
- [ ] Manual smoke (review step): set a Home base in settings; confirm the outbound/return nudges + Summary map 🏠 pin + a home→first dashed leg; add a flight with From = 🏠 Home; attach a PDF to that flight from its card popover and from its edit form; confirm the file opens from the Today/Day view; delete the flight and confirm its attachment + notes are gone.

## Deferred / explicitly out of scope (do NOT build here)
- Globe/Marker notes + attachments (needs non-trip storage/scope) — a later phase.
- Offline caching of attachment *files*.
- Return leg feeding the date engine / projected end (ADR 0030 rejects this).
- Fork-discard bulk cleanup of attachments on Promote — the Promote confirm already warns; per-entity cleanup (B1) covers ordinary deletes. Revisit only if it becomes a problem.
