# Day-of Logistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each day a collapsible **day map** (Items as a numbered route + tonight's Accommodation + Transport points), one-tap **directions** deep-links (whole-day route + per-hop) out to Google/Apple Maps, geocoding of all located entities so the map is populated, and a **geographic-spread Flag**.

**Architecture:** Pure, tested lib helpers (`lib/maps.ts` directions builders, `lib/day-map.ts` model, `lib/flags.ts` spread rule) consumed by a lazy-loaded Leaflet client component (`components/trip/day-map.tsx`) mounted on the `day/[date]` view and the Travelling-phase Home. Coordinates are filled by extending the proven Stop geocode-on-save flow to Items/Accommodation/Transport, with a one-time backfill script. Transport gains coordinate columns (migration). See `docs/adr/0011-geocode-located-entities-and-transport-coordinates.md`.

**Tech Stack:** Next.js 16 App Router (server components + server actions), React 19, Prisma 7 + Postgres, Leaflet (dynamic import, as in `route-map.tsx`), Vitest + jsdom + @testing-library/react, OpenStreetMap Nominatim (`lib/geocode.ts`).

**Conventions:** `lib/` is PURE (no Prisma/React/network), co-located `*.test.ts`. `@/` = repo root. Money/dates unchanged. Gates per task: `npx tsc --noEmit` (0), `npm run lint` (0/0), `npm test`. Prisma client is `db` (`@/lib/db`). Geocoding mirrors `server/actions/stops.ts` (`createStop`/`updateStop`): best-effort, never throws, manual coords win.

**Out of scope:** routing/distance-matrix API, computed travel *time*, changes to the existing packed-day/overlap flags, on-demand-at-render geocoding.

---

### Task 1: Transport coordinate columns + migration

**Files:** `prisma/schema.prisma`; new `prisma/migrations/<timestamp>_transport_coordinates/migration.sql`.

**Context:** Items & Accommodation already have `lat`/`lng`. Transport has none. Add four nullable Floats. A local dev DB may not be reachable in this environment, so prefer `prisma migrate dev`, but fall back to hand-authoring the migration + `prisma generate` (Prisma `Float` → Postgres `DOUBLE PRECISION`, matching the existing `Stop.lat`).

- [ ] **Step 1: Add columns to the Transport model** in `prisma/schema.prisma` (after `arrAt`):

```prisma
  depLat     Float?
  depLng     Float?
  arrLat     Float?
  arrLng     Float?
```

- [ ] **Step 2: Create the migration.** Try `npx prisma migrate dev --name transport_coordinates`. If it fails for lack of a database, inspect the newest folder under `prisma/migrations/` to copy the exact naming format, then hand-create `prisma/migrations/<timestamp>_transport_coordinates/migration.sql`:

```sql
ALTER TABLE "Transport" ADD COLUMN "depLat" DOUBLE PRECISION;
ALTER TABLE "Transport" ADD COLUMN "depLng" DOUBLE PRECISION;
ALTER TABLE "Transport" ADD COLUMN "arrLat" DOUBLE PRECISION;
ALTER TABLE "Transport" ADD COLUMN "arrLng" DOUBLE PRECISION;
```

- [ ] **Step 3: Regenerate the client + validate.** Run `npx prisma generate` and `npx prisma validate`. Then `npx tsc --noEmit`.
Expected: client types now include the four fields; 0 type errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(transport): add dep/arr coordinate columns + migration"
```

---

### Task 2: Directions URL builders (`lib/maps.ts`)

**Files:** `lib/maps.ts` (add); `lib/maps.test.ts` (add cases).

**Context:** `mapsUrl`/`appleMapsUrl` build single-location links. We need point-to-point and multi-stop *directions* URLs. A point is coords or text.

- [ ] **Step 1: Write failing tests** in `lib/maps.test.ts`:

```ts
import { googleDirectionsUrl, appleDirectionsUrl, type DirectionsPoint } from "./maps";

const louvre: DirectionsPoint = { lat: 48.8606, lng: 2.3376, label: "Louvre" };
const eiffel: DirectionsPoint = { lat: 48.8584, lng: 2.2945, label: "Eiffel Tower" };
const arc: DirectionsPoint = { address: "Arc de Triomphe, Paris" };

describe("googleDirectionsUrl", () => {
  it("returns null for fewer than 2 points", () => {
    expect(googleDirectionsUrl([louvre])).toBeNull();
    expect(googleDirectionsUrl([])).toBeNull();
  });
  it("builds origin + destination for 2 points (coords preferred)", () => {
    const url = googleDirectionsUrl([louvre, eiffel])!;
    expect(url).toContain("https://www.google.com/maps/dir/?api=1");
    expect(url).toContain(`origin=${encodeURIComponent("48.8606,2.3376")}`);
    expect(url).toContain(`destination=${encodeURIComponent("48.8584,2.2945")}`);
  });
  it("puts middle points in waypoints in order", () => {
    const url = googleDirectionsUrl([louvre, eiffel, arc])!;
    expect(url).toContain(`destination=${encodeURIComponent("Arc de Triomphe, Paris")}`);
    expect(url).toContain("waypoints=");
    expect(url).toContain(encodeURIComponent("48.8584,2.2945"));
  });
});

describe("appleDirectionsUrl", () => {
  it("returns null for fewer than 2 points", () => {
    expect(appleDirectionsUrl([louvre])).toBeNull();
  });
  it("builds saddr/daddr from first and last point", () => {
    const url = appleDirectionsUrl([louvre, eiffel, arc])!;
    expect(url).toContain("https://maps.apple.com/");
    expect(url).toContain(`saddr=${encodeURIComponent("48.8606,2.3376")}`);
    expect(url).toContain(`daddr=${encodeURIComponent("Arc de Triomphe, Paris")}`);
  });
});
```

- [ ] **Step 2: Run, confirm fail.** `npx vitest run lib/maps.test.ts -t Directions` → FAIL (not exported).

- [ ] **Step 3: Implement** in `lib/maps.ts`:

```ts
export interface DirectionsPoint {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  label?: string | null;
}

/** A point renders as "lat,lng" when coords exist, else its address/label text. Null if neither. */
function pointToken(p: DirectionsPoint): string | null {
  if (p.lat != null && p.lng != null) return `${p.lat},${p.lng}`;
  return p.address || p.label || null;
}

/**
 * Google Maps multi-stop directions URL through the points in order
 * (origin = first, destination = last, waypoints = the middle). Returns null
 * if fewer than 2 points resolve to a usable token.
 */
export function googleDirectionsUrl(points: DirectionsPoint[]): string | null {
  const tokens = points.map(pointToken).filter((t): t is string => t != null);
  if (tokens.length < 2) return null;
  const origin = tokens[0];
  const destination = tokens[tokens.length - 1];
  const waypoints = tokens.slice(1, -1);
  const params = new URLSearchParams({ api: "1", origin, destination });
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Apple Maps directions URL. Apple does not reliably support intermediate
 * waypoints, so a multi-point route degrades to first→last (saddr/daddr).
 * Returns null if fewer than 2 points resolve.
 */
export function appleDirectionsUrl(points: DirectionsPoint[]): string | null {
  const tokens = points.map(pointToken).filter((t): t is string => t != null);
  if (tokens.length < 2) return null;
  const params = new URLSearchParams({ saddr: tokens[0], daddr: tokens[tokens.length - 1] });
  return `https://maps.apple.com/?${params.toString()}`;
}
```

(Note: `URLSearchParams` encodes `|` as `%7C`; that's fine for Google. The test uses `toContain(encodeURIComponent(...))` on individual tokens — adjust assertions to match `URLSearchParams` output, e.g. assert on the decoded params via `new URL(url)` if simpler.)

- [ ] **Step 4: Run tests green.** `npx vitest run lib/maps.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/maps.ts lib/maps.test.ts
git commit -m "feat(maps): google/apple multi-stop directions URL builders"
```

---

### Task 3: Day-map model (`lib/day-map.ts`)

**Files:** Create `lib/day-map.ts` + `lib/day-map.test.ts`.

**Context:** One pure helper produces everything the UI needs: the ordered located points (numbered Items in time order, plus Accommodation and Transport markers), the route point list for the whole-day directions URL, and per-item predecessor links. Keeps the component dumb and the logic tested.

- [ ] **Step 1: Write failing tests** in `lib/day-map.test.ts` covering:
  - Items ordered by `startTime` then `sortOrder`, numbered 1..n; only those with lat+lng included.
  - Un-located items excluded from pins but the ordering of located ones is stable.
  - `routePoints` = tonight's Accommodation (if located) first, then located items in order.
  - Accommodation/Transport produce non-numbered points of the right `kind`.
  - A day with 0 located points → `points: []`, `routePoints: []`.
  - `perItemPrev[itemId]` is the previous located point (Accommodation for the first located item, else previous item; undefined when none).

```ts
import { buildDayMapModel } from "./day-map";

const items = [
  { id: "i2", title: "Lunch", lat: 48.86, lng: 2.34, startTime: "13:00", sortOrder: 1 },
  { id: "i1", title: "Louvre", lat: 48.8606, lng: 2.3376, startTime: "09:00", sortOrder: 0 },
  { id: "i3", title: "No coords", lat: null, lng: null, startTime: "15:00", sortOrder: 2 },
];
const accommodation = { id: "a1", name: "Hotel", lat: 48.87, lng: 2.35 };

it("orders & numbers located items by time, excludes un-located", () => {
  const m = buildDayMapModel({ date: "2026-07-14", items, accommodation, transports: [] });
  const itemPins = m.points.filter((p) => p.kind === "item");
  expect(itemPins.map((p) => p.id)).toEqual(["i1", "i2"]);
  expect(itemPins.map((p) => p.order)).toEqual([1, 2]);
});

it("route starts at the accommodation then follows located items", () => {
  const m = buildDayMapModel({ date: "2026-07-14", items, accommodation, transports: [] });
  expect(m.routePoints[0]).toMatchObject({ lat: 48.87, lng: 2.35 });
  expect(m.routePoints).toHaveLength(3); // hotel + 2 located items
});

it("perItemPrev points the first located item at the accommodation", () => {
  const m = buildDayMapModel({ date: "2026-07-14", items, accommodation, transports: [] });
  expect(m.perItemPrev["i1"]).toMatchObject({ lat: 48.87, lng: 2.35 });
  expect(m.perItemPrev["i2"]).toMatchObject({ id: "i1" });
});
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement** `lib/day-map.ts` (pure). Define `DayMapPoint` (`kind: "item" | "accommodation" | "transport-dep" | "transport-arr"`, `id`, `lat`, `lng`, `label`, `order?`, `address?`), input shapes (items with `id,title,lat,lng,startTime,sortOrder,address?`; one optional `accommodation` with `id,name,lat,lng,address?`; `transports` with `id,depPlace,arrPlace,depLat,depLng,arrLat,arrLng`), and return `{ points: DayMapPoint[]; routePoints: DayMapPoint[]; perItemPrev: Record<string, DayMapPoint | undefined> }`. Ordering: located items sorted by `(startTime ?? "99:99")` then `sortOrder`; assign `order` 1..n. Transport dep/arr included as points when their coords exist. `routePoints` = `[accommodationPoint?, ...orderedItemPoints]` filtered to those with coords. `perItemPrev` walks the ordered located items, predecessor = previous item or the accommodation point for the first.

- [ ] **Step 4: Run tests green.**

- [ ] **Step 5: Commit**

```bash
git add lib/day-map.ts lib/day-map.test.ts
git commit -m "feat(day-map): pure model for ordered day points + route + per-hop links"
```

---

### Task 4: Geographic-spread Flag (`lib/flags.ts`) + call-site selects

**Files:** `lib/flags.ts`, `lib/flags.test.ts`; update item selects where `detectFlags` is called (`app/(app)/trips/[tripId]/summary/page.tsx`, `components/trip/home/phase-planning.tsx`).

**Context:** Add `lat`/`lng` to `FlagItem`; new info-level rule per the spec.

- [ ] **Step 1: Write failing tests** in `lib/flags.test.ts`:

```ts
import { flagSpreadDays, SPREAD_DAY_THRESHOLD_KM } from "./flags";

const at = (id: string, date: string, lat: number, lng: number) =>
  ({ id, date, lat, lng, stopId: null, startTime: null, endTime: null });

it("flags a day whose located items span beyond the threshold", () => {
  // Paris (48.86,2.35) to Versailles (48.80,2.13) ~17km; use a wider pair to exceed 25km
  const items = [at("i1", "2026-07-14", 48.86, 2.35), at("i2", "2026-07-14", 49.00, 2.80)];
  const flags = flagSpreadDays(items);
  expect(flags).toHaveLength(1);
  expect(flags[0]).toMatchObject({ severity: "info", targetType: "DAY", date: "2026-07-14" });
});

it("does not flag a compact day", () => {
  const items = [at("i1", "2026-07-14", 48.860, 2.337), at("i2", "2026-07-14", 48.858, 2.294)];
  expect(flagSpreadDays(items)).toHaveLength(0);
});

it("ignores days with fewer than 2 located items", () => {
  expect(flagSpreadDays([at("i1", "2026-07-14", 48.86, 2.35)])).toHaveLength(0);
});
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement.** Add `lat?: number | null; lng?: number | null;` to `FlagItem`. Add `export const SPREAD_DAY_THRESHOLD_KM = 25;`. Add `export function flagSpreadDays(items: FlagItem[]): Flag[]` — group items having `date` + finite `lat`/`lng` by date; for each date with ≥2 located items compute the max pairwise `haversineKm`; if `> SPREAD_DAY_THRESHOLD_KM` push `{ id: \`spread-day-${date}\`, severity: "info", targetType: "DAY", date, message: \`Your plans on ${date} are spread out (~${Math.round(maxKm)} km apart) — check it's doable.\` }`. Call `flagSpreadDays(items)` inside `detectFlags` and concat into the returned list.

- [ ] **Step 4: Run flag tests green**, then ensure existing `flags.test.ts` still passes.

- [ ] **Step 5: Wire call-site selects.** In the `db.item.findMany({ select: … })` feeding `detectFlags` in `summary/page.tsx` and `phase-planning.tsx`, add `lat: true, lng: true`. (The `items as FlagItem[]` casts then carry coords.) Confirm `npx tsc --noEmit`.

- [ ] **Step 6: Full gate + commit**

```bash
git add lib/flags.ts lib/flags.test.ts "app/(app)/trips/[tripId]/summary/page.tsx" components/trip/home/phase-planning.tsx
git commit -m "feat(flags): geographic-spread day flag"
```

---

### Task 5: Geocode-on-save — Items

**Files:** `server/actions/items.ts`; `server/actions/items.test.ts`.

**Context:** Mirror `server/actions/stops.ts`. When an Item has an `address` and no manual coords, best-effort geocode (with stop context for disambiguation) and store `lat`/`lng`. The Item input schema has no lat/lng, so geocode whenever an address is present; on update, re-geocode when the address is present (cheap correctness; or only when changed if easy to detect).

- [ ] **Step 1: Write failing tests** (mock `@/lib/geocode` like `stops.test.ts` does). Assert: `createItem` with an `address` calls `geocodePlace` and writes the returned `lat`/`lng`; `createItem` with no address does NOT call `geocodePlace`; a geocode returning null still creates the item with null coords.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement.** Import `geocodePlace`. In `createItem`/`updateItem`, after validation, when `data.address` is set: build a query (`[data.address, stop?.name, stop?.country].filter(Boolean).join(", ")` — fetch the stop for context when `stopId` present) and `const coords = await geocodePlace(query)`, then include `lat: coords?.lat ?? null, lng: coords?.lng ?? null` in the create/update `data`. When `address` is absent, leave coords untouched (create: null). Keep best-effort (geocodePlace never throws).

- [ ] **Step 4: Tests green** (`npx vitest run server/actions/items.test.ts`), then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add server/actions/items.ts server/actions/items.test.ts
git commit -m "feat(items): geocode address on save"
```

---

### Task 6: Geocode-on-save — Accommodation

**Files:** `server/actions/accommodation.ts`; `server/actions/accommodation.test.ts`.

**Context:** Same pattern as Task 5; geocode `address` (+ stop context) into the existing `lat`/`lng` columns.

- [ ] **Step 1: Write failing tests** (mock `@/lib/geocode`): create/update with `address` geocodes and stores coords; without address, no call; null result → null coords.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** the geocode-on-save in `createAccommodation`/`updateAccommodation`, mirroring Task 5.
- [ ] **Step 4: Tests green; `npx tsc --noEmit`.**
- [ ] **Step 5: Commit**

```bash
git add server/actions/accommodation.ts server/actions/accommodation.test.ts
git commit -m "feat(accommodation): geocode address on save"
```

---

### Task 7: Geocode-on-save — Transport

**Files:** `server/actions/transport.ts`; `server/actions/transport.test.ts`.

**Context:** Geocode `depPlace` → `depLat`/`depLng` and `arrPlace` → `arrLat`/`arrLng` (the new columns) when present.

- [ ] **Step 1: Write failing tests** (mock `@/lib/geocode`): `createTransport` with `depPlace` and `arrPlace` geocodes BOTH and stores the four coords; only `depPlace` set → only dep coords; neither → no geocode calls; null result → null coords. (If a single `geocodePlace` mock is shared, assert call args/order.)
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** in `createTransport`/`updateTransport`: when `data.depPlace` set, `geocodePlace(data.depPlace)` → `depLat`/`depLng`; same for `arrPlace` → `arrLat`/`arrLng`. Include the four fields in the create/update `data`. Best-effort.
- [ ] **Step 4: Tests green; `npx tsc --noEmit`.**
- [ ] **Step 5: Commit**

```bash
git add server/actions/transport.ts server/actions/transport.test.ts
git commit -m "feat(transport): geocode dep/arr places on save"
```

---

### Task 8: Day map component + collapsible panel

**Files:** Create `components/trip/day-map.tsx` (the Leaflet map, client) and `components/trip/day-map-panel.tsx` (the collapsible toggle wrapper). Optional focused test `components/trip/day-map-panel.test.tsx`.

**Context:** Mirror the dynamic-Leaflet pattern in `components/trip/route-map.tsx` (client component, `let L`/`let map` in an effect, `mapRef`, cleanup). The panel renders a "Show day map" toggle (collapsed by default) and lazy-mounts `DayMap` only when opened. `DayMap` takes the `buildDayMapModel(...)` output (serialisable: `points`, `routePoints`) plus `tripId`. It renders: numbered Item markers joined by a polyline in order; a distinct Accommodation marker; distinct Transport markers; popups with the existing single-location "Open in Maps" (`mapsUrl`/`appleMapsUrl`) and, for items, a "Directions from previous" link (built from `perItemPrev` via the Task 2 builders); and a "Open today's route" button using `googleDirectionsUrl(routePoints)` / `appleDirectionsUrl(routePoints)`.

- [ ] **Step 1:** Build `DayMap` mirroring `route-map.tsx` (dynamic `import("leaflet")`, guarded non-null bindings as that file now does, cleanup on unmount). Markers: number Items via a divIcon (like route-map's numbered markers); use distinct icons/colours for accommodation vs transport. Draw the route polyline through located items in order. Render the whole-day route button(s) above/below the map. Render directions links inside item popups. If `points` is empty render nothing (the panel guards this anyway).
- [ ] **Step 2:** Build `DayMapPanel({ tripId, model })`: a client component with a `useState(false)` open flag; when `model.points.length === 0`, render nothing (no toggle). Otherwise a button ("🗺 Show day map" / "Hide day map") that toggles; when open, render `<DayMap … />`. Lazy-load: only mount `DayMap` (and thus Leaflet) when open.
- [ ] **Step 3 (focused test):** `day-map-panel.test.tsx` — with `points: []` renders no toggle; with points, the toggle appears and clicking it reveals the map container / route button. (Mock `./day-map` to a stub if Leaflet is awkward in jsdom; assert the panel's open/closed behaviour, the high-value logic.)
- [ ] **Step 4:** `npx tsc --noEmit && npm run lint && npm test` green.
- [ ] **Step 5: Commit**

```bash
git add components/trip/day-map.tsx components/trip/day-map-panel.tsx components/trip/day-map-panel.test.tsx
git commit -m "feat(day-map): collapsible lazy Leaflet day map + whole-day route button"
```

---

### Task 9: Per-hop "Directions" link in the Timeline

**Files:** `components/trip/timeline.tsx`; `components/trip/timeline` test (add one).

**Context:** Item entries in the timeline should show an always-visible "Directions" link when a per-hop URL is available. The hosting page computes per-item directions URLs (from `perItemPrev` + Task 2 builders) and passes a lookup into the Timeline.

- [ ] **Step 1:** Add an optional prop to `Timeline` (e.g. `itemDirections?: Record<string, { google: string | null; apple: string | null }>`). For an `ItemEntry` whose id has an entry with a non-null url, render a small "Directions" link next to the item (follow the existing `map-link`/icon style; `ExternalLink`/`Navigation` lucide icon, `aria-label`). Provider choice follows the existing `map-link` convention.
- [ ] **Step 2 (test):** render `Timeline` with a day plan containing one item + an `itemDirections` entry → the directions link renders with the right href; without an entry → no link.
- [ ] **Step 3:** gates green.
- [ ] **Step 4: Commit**

```bash
git add components/trip/timeline.tsx components/trip/timeline.test.tsx
git commit -m "feat(timeline): per-hop directions link on located items"
```

---

### Task 10: Mount on the day view

**Files:** `app/(app)/trips/[tripId]/day/[date]/page.tsx`.

**Context:** Fetch the data the model needs, build it server-side, render the panel above the timeline, and pass per-item directions into the Timeline.

- [ ] **Step 1:** Extend the day page's queries so items include `lat,lng,address,startTime,sortOrder`, tonight's accommodation includes `lat,lng,address`, and the day's transports include `depPlace,arrPlace,depLat,depLng,arrLat,arrLng`. Determine "tonight's accommodation" (checkIn ≤ date < checkOut) and "the day's transports" (dep/arr on that date) — reuse existing day-plan derivation where possible.
- [ ] **Step 2:** `const model = buildDayMapModel({ date, items, accommodation, transports })`. Build `itemDirections` from `model.perItemPrev`: for each item id with a predecessor, `{ google: googleDirectionsUrl([prev, point]), apple: appleDirectionsUrl([prev, point]) }`.
- [ ] **Step 3:** Render `<DayMapPanel tripId={tripId} model={model} />` above the `<Timeline … />`, and pass `itemDirections` to `<Timeline … />`.
- [ ] **Step 4:** gates green; manual sanity that a located day shows the toggle and an empty day shows none.
- [ ] **Step 5: Commit**

```bash
git add "app/(app)/trips/[tripId]/day/[date]/page.tsx"
git commit -m "feat(day): mount day map + per-hop directions on the day view"
```

---

### Task 11: Mount on the Travelling-phase Home

**Files:** `components/trip/home/phase-travelling.tsx`.

**Context:** The Travelling Home renders the effective day's plan. Add the same panel + per-hop directions for that day.

- [ ] **Step 1:** Ensure the items/accommodation/transport it already fetches include the coordinate/address fields (extend selects as in Task 10). Build the model for `effectiveDate` and the `itemDirections` lookup.
- [ ] **Step 2:** Render `<DayMapPanel tripId={tripId} model={model} />` in the today section, and pass `itemDirections` into the Timeline it renders.
- [ ] **Step 3:** gates green.
- [ ] **Step 4: Commit**

```bash
git add components/trip/home/phase-travelling.tsx
git commit -m "feat(home): day map + per-hop directions on the Travelling phase"
```

---

### Task 12: Backfill script

**Files:** Create `scripts/backfill-geocode.ts`; add an npm script if the repo conventions warrant.

**Context:** One-time, idempotent, throttled backfill of existing rows missing coordinates, run manually after deploy. Network/db heavy — no unit test required, but it must be safe and re-runnable.

- [ ] **Step 1:** Write `scripts/backfill-geocode.ts` that, using `db` and `geocodePlace`: finds Items with an `address` and null `lat`/`lng`, Accommodation likewise, and Transport with `depPlace`/`arrPlace` and null corresponding coords; geocodes each (building the same context query as the save actions) with a `await sleep(1100)` between requests (Nominatim politeness); updates the row only when coords are found. Support a `--dry-run` flag that logs counts without writing. Log progress and a final summary. Only ever fills nulls (idempotent).
- [ ] **Step 2:** Verify it typechecks (`npx tsc --noEmit`) and that `node`/`tsx` can at least parse it (`npx tsc --noEmit` is sufficient; do NOT run it against a real DB here).
- [ ] **Step 3:** Document the run command at the top of the file (`npx tsx scripts/backfill-geocode.ts [--dry-run]`).
- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-geocode.ts package.json
git commit -m "feat(scripts): one-time throttled geocode backfill"
```

---

## Self-review notes

- **Spec coverage:** Task 1 (Transport coords) + 5/6/7 (geocode-on-save) + 12 (backfill) → coordinates strategy. Task 2 (directions URLs) + 3 (model) + 8 (map) + 9 (per-hop) + 10/11 (mount both surfaces) → collapsible day map + whole-day + per-hop directions on both surfaces. Task 4 → geographic-spread flag (surfaces via existing Summary + Next-steps DAY deep-link). ADR 0011 + CONTEXT.md done already.
- **Type consistency:** model output (`points`, `routePoints`, `perItemPrev`) consumed identically by Tasks 8/10/11; `DirectionsPoint` is the single point type for the URL builders; `flagSpreadDays`/`SPREAD_DAY_THRESHOLD_KM` named consistently.
- **Ordering/deps:** 1 before 7 (columns), 2 before 8/9/10, 3 before 8/10/11, 4 independent, 5/6/7 independent of UI, 8 before 9/10/11.
- **Env caveat:** Task 1 migration and Task 12 backfill assume no live DB in this environment — hand-author the migration and only typecheck the script.
