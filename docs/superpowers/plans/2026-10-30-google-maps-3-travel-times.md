# Google Maps — Branch 3: Travel times — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real Travel times from the Google Routes API, stored per hop and fetched in the background after plan writes, with a per-Stop Local travel mode; every reader (Flags, the tight-connection fix, Compare, the Plan page, Reviews, the Day map, the Route map, the Claude connection) uses them and falls back to today's straight-line estimate, shown as *estimated*.

**Architecture:** A pure hop model (`lib/travel-times/hops.ts`) turns plan rows into hops and cache keys. A global `TravelTime` table keyed by rounded points + mode (+ departure for public transport) stores Google's answers. `refreshTripTravelTimes(tripId)` computes every hop the Trip's plans and masked Surprise days need, fetches only the missing keys (behind `takeGoogleQuota("routes", 165)`), and runs via `after()` from `revalidateTrip`, so every write path triggers it. Readers load the keys they compute and resolve each hop (walk ≤ 20 min, else the Stop's Local travel mode) or fall back to the estimate.

**Tech Stack:** Next 16.4.2 (`after` from `next/server`; read `node_modules/next/dist/docs/` for `after` before using it), React 19.3 + React Compiler, Prisma 7.10, `@vis.gl/react-google-maps` 1.10.1, Google Routes API (`computeRoutes`, REST), Vitest.

**Spec:** `docs/specs/2026-10-30-google-maps.md` — T1–T5 and both "Hand-off" sections. Glossary: CONTEXT.md **Travel time**, **Local travel mode**, **Day map**. ADR 0076.

## Global Constraints

- **Nothing waits on Cam.** No key exists: keyless, `refreshTripTravelTimes` makes no call and stores nothing; every reader shows estimates. Tests mock `fetch`.
- **Never stored as a result on failure.** A Routes failure (HTTP, timeout) stores a cooldown marker `status: "ERROR"` (no minutes) and the key is not retried for **24 h** after its `fetchedAt`; readers treat ERROR like a missing row (estimated). A refused app quota or keyless stores nothing. A genuine "no route" (empty `routes`) is stored as `status: "NONE"` so it isn't re-billed; readers treat NONE as estimated.
- **TRANSIT only when it can work:** a public-transport key is requested only when the hop has a departure (the earlier Item has an end time) that is not in the past and is at most **90 days** ahead (Google publishes transit for ~100 days; a later trip gets its TRANSIT key once it comes inside the window); otherwise the hop's local-mode leg is DRIVE-free estimated (no TRANSIT request, no key). TRANSIT bills as Compute Routes Essentials with this field mask (verified 2026-10-30 — Pro only with traffic-aware routing), so it shares the `"routes"` counter.
- **Bounded runs:** a refresh makes at most **40** Routes calls per run, **4** at a time; the rest wait for a later refresh or the operator script. Saves use upsert (a parallel instance writing the same key must not throw).
- **Per-plan inputs:** `effectiveLocalMode` and Transport legs come from the **same plan's** Transports (a Fork's car leg never decides the real plan's Stop mode).
- **Cost:** every Routes call (WALK, DRIVE and TRANSIT) goes through `takeGoogleQuota("routes", ROUTES_DAILY_CAP)` with `ROUTES_DAILY_CAP = 165`; field mask exactly `routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline` (Essentials — no traffic, no `routingPreference`, no extra computations). Identical keys are never fetched twice (global table). One refresh per Trip per request (in-process dedupe).
- **Keys:** points rounded to 5 decimals; key string exactly `${mode}|${lat},${lng}|${lat},${lng}` for WALK/DRIVE, and `TRANSIT|${lat},${lng}|${lat},${lng}|${departureISO}` for public transport where `departureISO` is the earlier Item's end as a UTC instant rounded down to 15 minutes. Modes stored: `"WALK" | "DRIVE" | "TRANSIT"`.
- **Mode per hop (T3):** straight-line under **2 km** → a WALK row is requested; resolution precedence: WALK row OK and **≤ 20** min → walk; else the Stop's local-mode row (DRIVE or TRANSIT) if OK; else the WALK row if OK (a real walk of any length beats a guess); else the estimate. Car Transport legs are always DRIVE: they use a DRIVE-only key and resolver (no WALK key, never resolved as a walk). A hop whose two points round to the same key needs no route (0 min, no request).
- **Local travel mode:** `Stop.localTravelMode` `"DRIVE" | "TRANSIT" | null`; null = inferred: DRIVE when a `CAR` Transport has this Stop as `fromStopId` or `toStopId`, else TRANSIT.
- **Hops (T2):** per day, consecutive located Items in Day-map order (startTime, then sortOrder; untimed last) **and** consecutive located timed Items (Rule 12's order) — deduped by key; plus every `CAR` Transport leg whose two ends resolve to points (end point = the row's `depLat/depLng` / `arrLat/arrLng`, else its Stop's point, else the Trip's Home point for a Home end).
- **Surprise:** the refresh also computes, for each Traveller on the Trip, the day as that Traveller sees it (their own hidden Surprise Items and hidden Stops removed — `loadSurpriseVisibility(tripId, travellerId)`), plus the all-hidden view used by Share links and Reviews (`viewerId = null`), and fetches those hops too. Exact and bounded by the number of Travellers. Readers compute keys only from the rows they were allowed to read — a TravelTime row carries no Item IDs and reveals nothing.
- Estimated wording: anywhere minutes are shown for an estimated hop, the copy says *estimated* (e.g. Flag message `~25 min drive (estimated)`). No em-dashes in UI copy.
- Zero comments unless the why is non-obvious; no JSDoc; double quotes + semicolons. **Never `git add -A`** (docs/feedback/inbox.md has an unrelated change). Never touch production / `.env.production.local`.
- Verification tiers (CLAUDE.md): inner loop `npx vitest run <files>`; task done `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`; full `npm test` + `npm run build` + `npm run test:integration` (local DB) only in Task 10.

## Review Focus

1. **A write storm** — dragging five Items in a row must not fire five overlapping refreshes that double-fetch the same missing keys. Pinned in Task 4 (in-process dedupe; concurrent refreshes for one Trip share one run).
2. **Daily cap reached mid-trip** — the 166th missing hop stays estimated today and fills on a later refresh, never errors a save. Pinned in Task 4.
3. **Surprise** — a surprised Traveller's day (Surprise dinner between a temple and a bar) gets a real temple → bar hop, and no reader exposes the Surprise's point. Pinned in Task 4 (masked hops fetched) and Task 6 (flags for a masked viewer resolve the stepped-over hop).
4. **Home and point ends** — a car leg from the Home base, or from a typed departure point, uses that point, not the Stop's. Pinned in Task 3.
5. **Overnight and cross-day** — an Item ending 23:30 and the next starting 00:30 the next day is not a hop (different days). Pinned in Task 3.

---

### Task 1: Schema — Local travel mode and the TravelTime table

**Files:**
- Create: `prisma/migrations/20261031120000_travel_times/migration.sql` (generate with `prisma migrate diff` against the local docker DB, add the spec header; additive — one deploy)
- Modify: `prisma/schema.prisma` (Stop `localTravelMode String?`; new model)
- Modify: `lib/validations/stop.ts` (both rough and scheduled schemas: `localTravelMode: z.enum(["DRIVE","TRANSIT"]).nullable().optional()`), `lib/stop-patch.ts` (`StopPatch` gains it; clearable), `components/trip/stop-form-dialog.tsx` `STOP_CLEARABLE` stays as is (the form is Task 5)
- Modify: copy paths — `server/actions/forks.ts` (createFork stop copy ~143), `server/actions/trips.ts` duplicate (~704), `lib/duplicate-trip.ts`, `server/actions/copy-route-from-share.ts` (wherever Stop fields are listed explicitly)
- Tests: validation + stop-patch tests; one copy-path test per path that `localTravelMode` survives

**Interfaces:**
- Produces: `Stop.localTravelMode`; model `TravelTime { key String @id; mode String; status String; minutes Int?; distanceM Int?; polyline String?; fetchedAt DateTime @default(now()) @updatedAt }` (`status` `"OK" | "NONE" | "ERROR"`; minutes/distance/polyline null unless OK).

- [ ] Steps: failing tests → migration + schema + validations + copies → green → task-done checks → commit `feat(travel): Local travel mode and the TravelTime table`.

---

### Task 2: Shared Google fetch and the Routes client

**Files:**
- Create: `lib/google-fetch.ts` (server-only) — move `serverKey()`, `hasServerKey()`, the timeout constant and a `fetchJson` that **distinguishes** `{ ok: true, body } | { ok: false, reason: "http" | "timeout" | "network" | "parse" }` out of `lib/geocode.ts`; `lib/geocode.ts` imports them (behaviour unchanged; its tests stay green; `hasServerKey` keeps its export path or is re-exported)
- Create: `lib/routes.ts` (+ test), server-only

**Interfaces:**
- Produces: `type RouteMode = "WALK" | "DRIVE" | "TRANSIT"`; `computeRoute(from: LatLng, to: LatLng, mode: RouteMode, departure?: Date): Promise<{ status: "ok"; minutes: number; distanceM: number; polyline: string } | { status: "none" } | { status: "error" }>` — POST `https://routes.googleapis.com/directions/v2:computeRoutes` with headers `X-Goog-Api-Key`, `X-Goog-FieldMask: routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline`; body `{ origin: { location: { latLng } }, destination: …, travelMode: "WALK" | "DRIVE" | "TRANSIT", departureTime?: RFC3339 (TRANSIT only) }`; `duration` is a string like `"1234s"` → minutes rounded up; empty/absent `routes` → none; anything else → error; keyless → error with no fetch. (Read Google's Routes API docs if anything here is uncertain — you may web-fetch developers.google.com.)

- [ ] Steps: failing tests (request URL/headers/body per mode; duration parsing incl. proto3-omitted fields; none vs error cases; keyless no fetch; 5 s timeout) → implement → green → task-done checks → commit `feat(travel): a Routes client that tells no-route from failure`.

---

### Task 3: The pure hop model

**Files:**
- Create: `lib/travel-times/hops.ts` (+ `hops.test.ts`), `lib/travel-times/polyline.ts` (+ test)

**Interfaces:**
- Produces:
  - `type Pt = { lat: number; lng: number }`; `pointKey(p: Pt): string` (5 dp).
  - `effectiveLocalMode(stop: { id: string; localTravelMode: string | null }, transports: { mode: string; fromStopId: string | null; toStopId: string | null }[]): "DRIVE" | "TRANSIT"`.
  - `type HopItem = { id: string; date: string | null; startTime: string | null; endTime: string | null; sortOrder: number; lat: number | null; lng: number | null; stopId: string | null }`.
  - `dayHops(items: HopItem[]): { from: HopItem; to: HopItem }[]` — per date, union of Day-map-order pairs and timed-order pairs, deduped by (from.id, to.id); never across dates.
  - `transportEnds(t, stopsById, home): { from: Pt; to: Pt } | null` for `CAR` legs (row point → Stop point → Home point).
  - `hopKeys(from: Pt, to: Pt, localMode, departure: Date | null, now: Date): string[]` — the WALK key when straight-line < 2 km, plus the local-mode key: DRIVE always; TRANSIT only when `departure` is non-null and ≥ `now` (key carries the 15-min-floored departure), else no local-mode key.
  - `type TravelLookup = Map<string, { status: "OK" | "NONE" | "ERROR"; minutes: number | null; distanceM: number | null; polyline: string | null }>`.
  - `resolveHop(from: Pt, to: Pt, localMode, departure, lookup, estimateOpts): { minutes: number; distanceKm: number; mode: "walk" | "drive" | "transit"; estimated: boolean; polyline: string | null }` — walk if a WALK row is OK and ≤ 20 min; else the local-mode row if OK; else the estimate exactly as today (walk at 4.5 km/h if ≤ 30 min, else `estimateDriveMinutes`) with `estimated: true`.
  - `itemDeparture(item: HopItem, stopTimezone: string): Date | null` — the Item's date + endTime in the Stop's zone as an instant (use the repo's zoned-time helpers in lib/tz.ts).
  - `decodePolyline(encoded: string): Pt[]` (Google's encoded polyline algorithm).
- [ ] Steps: failing tests (Review Focus 4 and 5; both orders deduped; WALK key only under 2 km; TRANSIT key floored to 15 min; resolve walk ≤ 20, 21 → local mode, NONE → estimate; decode a known Google sample) → implement → green → task-done checks → commit `feat(travel): a pure model of hops, keys and resolution`.

---

### Task 4: Store, refresh job and the after-write trigger

**Files:**
- Create: `lib/travel-times/store.ts` (`loadTravelTimes(keys: string[]): Promise<TravelLookup>`, `saveTravelTime(key, row)`), `lib/travel-times/refresh.ts` (`refreshTripTravelTimes(tripId: string): Promise<{ wanted: number; fetched: number; skippedQuota: number; failed: number }>`), `lib/travel-times/schedule.ts` (`scheduleTravelTimes(tripId: string): void`), tests incl. an integration test (local DB)
- Modify: `lib/revalidate.ts` — `revalidateTrip` calls `scheduleTravelTimes(tripId)`
- Create: `scripts/refresh-travel-times.ts` + `package.json` `"travel-times:refresh": "tsx --conditions=react-server scripts/refresh-travel-times.ts"` (operator script: every non-deleted Trip, prints the counts; run after the places backfill)
- Modify: `eslint.config.mjs` Surprise guard lists if the refresh module reads Items (it reads the full plan by design — add it to the right list with the reason, or import surprise-visibility to compute the masked days)

**Interfaces / rules:**
- `refreshTripTravelTimes`: loads the Trip's Stops (incl. `localTravelMode`, timezone, point), Items, Transports, Home point for the real plan **and every Fork**; builds hops (`dayHops` + CAR legs) and the masked-day hops (live Surprise Items removed — all, and each alone — use `loadSurpriseVisibility`'s data or the Surprise columns directly); computes keys; loads existing keys; for each key that is missing (or ERROR older than 24 h), in a stable order, at most 40 per run and 4 concurrently: `takeGoogleQuota("routes", 165)` → `computeRoute`; `ok` → upsert OK; `none` → upsert NONE; `error` → upsert ERROR (cooldown). Stops taking new keys when the quota refuses (the rest count as `skippedQuota`). Keyless → returns immediately with `wanted` only, no rows.
- `scheduleTravelTimes`: `after(() => run(tripId))` where `run` dedupes per Trip in-process (a Map of in-flight promises; a second schedule while one runs marks "again" and re-runs once after). Wrap `after` in try/catch so `revalidateTrip` still works outside a request (scripts, tests). Never throws.
- [ ] Steps: failing tests (Review Focus 1, 2, 3; NONE stored; ERROR stored as a cooldown and skipped for 24 h then retried; keyless no call and no rows; 40-call cap; forks included with their own Stop modes; a Traveller surprised by two of three Surprises on a day gets their exact hop; identical key shared across trips fetched once; concurrent upsert of the same key doesn't throw) → implement → green → task-done checks + the integration test on the local DB → commit `feat(travel): Travel times refresh after every plan write`.

---

### Task 5: Local travel mode — Stop settings and the Claude connection

**Files:**
- Modify: `components/trip/stop-form-dialog.tsx` (a `Field label="Local travel mode"` with a `Select` between the mode branch and Notes, ~438: options `Automatic (Drive)` / `Automatic (Public transport)` (one shown, per the inferred mode), `Drive`, `Public transport`; saving Automatic sends `localTravelMode: null`), its test; `server/actions/stops.ts` `updateStop`/`createStop` persist it (patch rules ADR 0075)
- Modify: `lib/mcp/tools/trips-stops-write.ts` — new tool `set_local_travel_mode({ stopId, mode: "drive" | "public_transport" | "automatic" })` following `set_stop_notes` (`loadStopForMcp`, `runWrite`, returns `{ stop }`); `lib/mcp/reads/plan-shapes.ts` `McpStop` gains `localTravelMode: "drive" | "public_transport"` (effective) and `localTravelModeSet: boolean`; tests
- The label is the glossary term `Local travel mode` (CONTEXT.md lists "Getting around" as a term to avoid — it is a Category). Help-guide drift allowlist if the label is quoted there.

- [ ] Steps: failing tests (form shows the inferred option; choosing Drive sends DRIVE; Automatic sends null; MCP tool sets/clears and returns the effective mode) → implement → green → task-done checks → commit `feat(travel): set how you get around at each Stop`.

---

### Task 6: Flags read Travel times

**Files:**
- Modify: `lib/flags.ts` — `FlagTransport` gains `depLat?, depLng?, arrLat?, arrLng?`; `FlagStop` gains `localTravelMode?`; `DetectFlagsInput` gains `travel?: TravelLookup`, `homePoint?: Pt | null`; Rule 12 (`flagTightConnections`) uses `resolveHop` (departure from the earlier Item's end in its Stop's zone) for travel minutes and the label (`walk` / `drive` / `public transport`), appending ` (estimated)` when estimated; `tightRetime` uses the resolved minutes; Rule 10 (`flagLongDrivingDays`) sums stored DRIVE minutes for CAR legs without times (ends via `transportEnds`), else today's estimate
- Modify: every assembler — `lib/flags-loader.ts` (`loadFlagRows` selects the new fields + loads the TravelLookup for the keys it computes; `flagsFromRows`), the Summary page (~253), `lib/desktop-home-loader.ts` (~354), `lib/compare.ts` (~380), `lib/next-steps-builder.ts`, `lib/day-view-loader.ts` (~400: also use the Trip's `drivingWindingFactor`/`drivingAvgSpeedKph`, not 1.5/80)
- A small shared helper `loadTravelLookupFor(rows)` in `lib/travel-times/read.ts` so assemblers don't each compute keys
- Tests: flags.test.ts Rule 12 + Rule 10 cases (stored walk, stored drive, stored transit, NONE → estimate, missing → estimate with "(estimated)", Home-end car leg), review `offeredFix` still matches when the live retime is computed from the same lookup, a masked viewer's flags resolve the stepped-over hop (Review Focus 3)

- [ ] Steps as usual → commit `feat(travel): Flags use real Travel times`.

---

### Task 7: Compare and the Plan page

**Files:**
- Modify: `lib/compare.ts` (`drivingMinutes` sums resolved CAR-leg minutes; leg ends via `transportEnds`; per plan, forks included), `app/(app)/trips/[tripId]/plan/page.tsx` (~425-462: `driveEstimate` becomes `{ minutes, roadKm, estimated }` from the stored DRIVE row when present), the Transport card that renders `driveEstimate` (find the consumer) shows "estimated" only when estimated; tests.

- [ ] Steps as usual → commit `feat(travel): Compare and the Plan page use real drive times`.

---

### Task 8: Day map hop lines and Route map car legs

**Files:**
- Modify: `components/map/map-polyline.tsx` — optional `encodedPath?: string` (decoded with `decodePolyline`, takes precedence over `path`); tests
- Modify: `lib/day-map.ts` (`buildDayMapModel` gains a `hops: { fromId; toId; path: Pt[] | null; estimated: boolean }[]` from a TravelLookup + local mode), `lib/day-view-model.ts` / `lib/day-view-loader.ts` (load the lookup), `components/trip/day-map.tsx` (`DayRoute` draws one `MapPolyline` per hop: solid with the decoded route when real, dashed straight when estimated; the bed → first Item segment stays dashed straight); tests
- Modify: `components/trip/route-map.tsx` — optional prop `legPaths?: Record<string, string>` (key `${fromStopId}>${toStopId}`, encoded polyline) — a leg with a path draws it solid (no linear draw-in for that leg); callers that already load Transports pass it via a helper `routeLegPaths(stops, transports, lookup)` in `lib/travel-times/read.ts`: Summary page, Share page, the Plan mini map/dialog. Other callers unchanged.

- [ ] Steps as usual → commit `feat(travel): maps draw real routes`.

---

### Task 9: The Claude connection reads Travel times

**Files:**
- Modify: `lib/mcp/reads/day.ts` (`McpDay` gains `hops: { fromItemId: string; toItemId: string; minutes: number; mode: "walk" | "drive" | "public_transport"; distanceKm: number; estimated: boolean }[]` for the day's hops the viewer can see), `lib/mcp/reads/plan-shapes.ts` / trip-plan as needed; tests
- Modify: `lib/mcp/prompts.ts` `LOGISTICS_CHECK` — replace "Teepee holds no routing data … never guess" with: `Use the day's hops for travel between things: real ones come from routing; estimated ones are straight-line guesses, so say so.`; prompts.test.ts
- Modify: `docs/connect-claude.md` — one line: day reads include travel between things, real or estimated.

- [ ] Steps as usual → commit `feat(mcp): Claude reads real Travel times`.

---

### Task 10: Docs, runbook and branch verification

**Files:**
- Modify: `docs/DEPLOY.md` §4j — quota table: Routes (Compute Routes Essentials) **165/day**; the refresh step at the end, after the places backfill: raise Routes to 500 for the hour, `npm run travel-times:refresh`, restore; a keyed check: one real day shows solid route lines and a Flag without "(estimated)".
- Modify: `docs/maps-overview.md` (a Travel times section: hops, keys, refresh trigger, cost guard, Surprise masked hops, readers), `docs/specs/2026-10-30-google-maps.md` "Before the one push" (the refresh step), `CONTEXT.md` only if a definition drifted.
- [ ] **Branch verification (tier 3):** `npm test` (node 24) + `npm run build` + `npm run test:integration` (local docker DB, `prisma migrate deploy` against it first). Known flake: `components/trip/transport-form-dialog.test.tsx` "defaultDate is ignored when editing" (prove against `main` via a temporary worktree if it fails); `lib/help-guide.test.ts` may time out under the parallel suite — rerun alone.
- [ ] Commit `docs(travel): Travel times runbook and overview`.
