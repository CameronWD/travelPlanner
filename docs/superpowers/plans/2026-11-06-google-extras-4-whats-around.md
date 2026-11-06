# Google extras — Branch 4: What's around Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-Trip switch, off by default. When it is on, a "What's around" sheet on the Day view and the Today view lists about 10 nearby places from Google by kind, each with rating, walk estimate and opening hours. The name opens Google Maps; "+ Day" and "♡ Wishlist" add the place.

**Architecture:**
- **Data:** `Trip.whatsAroundEnabled` holds the switch.
- **Search:** one server action resolves the start point on the server (a Surprise guard applies), checks a per-UTC-day `NearbyCache`, then calls Places **Nearby Search** (POST `places:searchNearby`, Enterprise fields), counted by `dailyCap("nearby-search")`.
- **UI:** one client sheet is shared by both entry points.
- **Adding:** goes through the existing `createItem`. A result counts as a "pick" (placeId, lat and lng are all present), so no extra lookup is made.

**Tech Stack:** Next.js (repo version — read `node_modules/next/dist/docs/`), Prisma, TypeScript, Vitest.

**Spec:** `docs/specs/2026-11-06-google-extras.md` §D, as amended in Task 0: the start-point picker replaces the Item ⋯ entry. Glossary: CONTEXT.md **What's around**, **Day ideas**, **Wishlist**.

## Global Constraints

- **The switch:** `Trip.whatsAroundEnabled Boolean @default(false)`.
  - Any Traveller may set it (`requireTripAccess`).
  - When off: no entry point renders, and the action refuses (`{ status: "off" }`).
- **Kinds:** labels and order are Sights, Food, Cafés, Drinks, Shops. Each maps to Places `includedTypes` and an Item Category:
  - Sights: `["tourist_attraction","museum","art_gallery","historical_landmark","park"]`, category SIGHTSEEING
  - Food: `["restaurant"]`, category FOOD
  - Cafés: `["cafe","bakery"]`, category FOOD
  - Drinks: `["bar","pub","wine_bar"]`, category NIGHTLIFE
  - Shops: `["market","shopping_mall","store"]`, category SHOPPING

  Verify each type string against Google's Places (New) "Table A" type list. Drop any that the API rejects, and note it.
- **The search:**
  - `POST https://places.googleapis.com/v1/places:searchNearby`
  - Body: `{ includedTypes, maxResultCount: 10, rankPreference: "POPULARITY", languageCode: "en", locationRestriction: { circle: { center: { latitude, longitude }, radius: 1500 } } }`
  - Header `X-Goog-FieldMask: places.id,places.displayName,places.location,places.formattedAddress,places.primaryTypeDisplayName,places.rating,places.userRatingCount,places.regularOpeningHours,places.currentOpeningHours,places.businessStatus,places.websiteUri`
  - Uses the server key.
  - Drop results whose `businessStatus` is `CLOSED_PERMANENTLY`.
- **Start points:**
  - Tonight's Accommodation, if located (the default). Otherwise the day's Stop.
  - Any located Item scheduled on that day.
  - "Near me" (device), only while the Trip is Travelling and today is within its dates.
  - The server resolves Accommodation, Stop and Item points from their ids, with `requireOutsideSurprise`. "Near me" sends raw lat/lng.
- **Cache:** `model NearbyCache { key String @id; status String; results Json; fetchedAt DateTime @default(now()) @updatedAt }`.
  - Key: `${utcDay}|${kind}|${lat.toFixed(3)},${lng.toFixed(3)}`.
  - Read the cache BEFORE `takeGoogleQuota`.
  - "Near me" is never cached and never stored anywhere.
  - A failed call is stored as ERROR for that key (that day), so it isn't retried in a loop.
- **Cap:** `takeGoogleQuota("nearby-search", dailyCap("nearby-search"))` (33). Past it: `{ status: "over-cap" }`, and the sheet says "That's all the looking around for today. Try again tomorrow."
- **Each result row shows:**
  - name
  - kind label
  - ★ rating (count, compact: "21k")
  - walk estimate `~N min walk`, computed as `round(haversineKm × 1.3 / 4.8 × 60)`, with a floor of 1
  - open status from `currentOpeningHours`: "Open until HH:MM" / "Closed now" / nothing
- **Name link:** `mapsUrl({ lat, lng, label: name, placeId })` from `lib/map/maps.ts`, opening in a new tab.
- **"+ Day":**
  - `createItem(tripId, { title: name, category, date, stopId: day's Stop id, placeId, lat, lng, address, openingHours: openingHoursFromGoogle(parseGooglePeriods(regularOpeningHours.periods), mapsLink), businessStatus, link: websiteUri })`
  - Toast: "Added to {day label}".
- **"♡ Wishlist":** the same fields with no `date` and no `stopId`. Toast: "Saved to the Wishlist".
- **Attribution:** a "Google Maps" text line at the bottom of the list, in the same style as `place-combobox.tsx` (~L166).
- **Copy:**
  - Sheet title "What's around".
  - Button "What's around".
  - Start chip labels: "Tonight's stay", "{Stop name}", "{Item title}", "Near me".
  - Empty: "Nothing like that nearby."
- Verification tiers per `CLAUDE.md`. Zero comments unless the WHY is non-obvious. No JSDoc. Trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage `docs/feedback/inbox.md` or `AGENTS.md`.

## Review Focus

1. **The switch off means no Google calls.** The action refuses even if called directly. Pinned in Task 2.
2. **A cached repeat takes no quota,** and "Near me" never writes a cache row. Pinned in Task 2.
3. **A surprised viewer can't search from a Surprise Item or Stop's point.** `requireOutsideSurprise` rejects. Pinned in Task 2.
4. **"+ Day" on a day with no Stop** (a Gap day) still creates an Item on that date with no Stop and doesn't throw. Pinned in Task 3.
5. **Denied geolocation** shows a short message ("Location is off for this site.") and keeps the other start points. Pinned in Task 3.

---

### Task 0 (controller)
- [ ] `git switch -c feat/google-extras-4-whats-around` from `main`.
- [ ] Spec §D2: replace "What's near this inside an Item's existing ⋯ menu" with: "the sheet's start-point picker lists the day's located Items, so 'what's near this' is one choice inside the sheet. Day-view Items have no ⋯ menu, and adding one to every row is clutter."
- [ ] Amend ADR 0044: What's around is the one outside fetch, and it sits beside Day ideas, never inside them.
- [ ] Commit those with this plan.

### Task 1: The switch

**Files:**
- `prisma/schema.prisma`: `Trip.whatsAroundEnabled`. Migration `20261106140000_whats_around`, additive (`NOT NULL DEFAULT false`), in the header style of the precedents.
- `server/actions/trips.ts`: `setWhatsAroundEnabled(tripId: string, enabled: boolean): Promise<UpdateTripResult>`, copying `setChaptersEnabled`. It records no Activity row: this is a display switch, not plan content.
- Reads: `lib/trip-shell-reads.ts` `TRIP_SHELL_SELECT`, `lib/day-reads.ts` trip select, and the settings page select.
- Create `components/trip/settings/whats-around-switch.tsx`, copying `chapters-switch.tsx`. Mount it in Settings in its own Card titled "What's around", with the description "Show places near where you're staying, from Google Maps."

- [ ] Write failing tests: the action sets and clears the flag and revalidates; the switch toggles optimistically and rolls back on failure (copy the chapters-switch tests).
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(trips): a What's around switch per Trip`.

### Task 2: Search, cache and the server action

**Files:**
- Create `lib/nearby/kinds.ts`: `NEARBY_KINDS` (key `"sights" | "food" | "cafes" | "drinks" | "shops"`, label, `includedTypes`, `category`).
- Create `lib/nearby/search.ts` (`server-only`): `searchNearby(point: LatLng, kind: NearbyKind): Promise<NearbyPlace[] | null>` (null on failure). `NearbyPlace = { placeId; name; lat; lng; address: string|null; typeLabel: string|null; rating: number|null; ratingCount: number|null; openNow: boolean|null; closesAt: string|null; openingHours: OpeningHours|null; businessStatus: string|null; website: string|null }`. Reuse `parseGooglePeriods` and `openingHoursFromGoogle` (`lib/opening-hours-google.ts`). Export `mapsLink` from `lib/geocode.ts`, or move it to a shared spot, for the hours `source`.
- `prisma/schema.prisma` + migration `20261106150000_nearby_cache`: `NearbyCache` as in Global Constraints.
- Create `lib/nearby/cache.ts` (`server-only`): `cachedNearby(key)` and `saveNearby(key, status, results)`.
- Create `server/actions/whats-around.ts` (`"use server"`): `whatsAround(tripId: string, input: { from: { kind: "accommodation" | "stop" | "item"; id: string } | { kind: "device"; lat: number; lng: number }; nearbyKind: NearbyKind }): Promise<{ status: "ok"; places: NearbyPlace[]; origin: LatLng } | { status: "off" | "over-cap" | "unavailable" | "no-point" }>`.
  - Order: `requireTripAccess` → flag check → resolve the point (`requireOutsideSurprise` for accommodation, stop and item; the row must belong to the trip) → cache read (skipped for device) → `hasServerKey` → `takeGoogleQuota` → search → cache write (skipped for device) → return.

- [ ] Write failing tests:
  - `lib/nearby/search.test.ts` (mock `fetch`): the request body and field mask exactly as in Global Constraints; parsing to `NearbyPlace` (hours, open-until, rating); `CLOSED_PERMANENTLY` dropped; non-200 gives null.
  - `server/actions/whats-around.test.ts`:
    - Flag off gives "off" with no fetch and no quota.
    - A cache hit takes no quota.
    - A device point writes no cache row.
    - A surprised viewer is rejected for an item point.
    - Over the cap gives "over-cap".
    - Another trip's row id gives "no-point".
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(nearby): What's around search, cached per day and capped`.

### Task 3: The sheet

**Files:** create `components/trip/whats-around-sheet.tsx` (`"use client"`), plus its test.
- Props: `{ tripId, date, dateLabel, stopId: string|null, startPoints: Array<{ key: string; label: string; from: … }>, allowNearMe: boolean }`.
- Uses `SheetContent side="docked"` (`components/ui/sheet.tsx`), the chip row (`components/ui/chip.tsx`) for kinds and the start point, and row styling from `components/trip/day/day-ideas-rows.tsx`.
- "Near me" calls `navigator.geolocation.getCurrentPosition` only when tapped. On denial it shows "Location is off for this site." and keeps the other chips.
- Fetches through `whatsAround`. Shows a loading state per kind; the client may memo results per (start, kind) for the session.
- Implements every row field, link, action, toast, empty and over-cap copy, and the attribution, exactly as in Global Constraints.

- [ ] Write failing tests (mock `whatsAround`, `createItem` and geolocation):
  - The default start is the first start point.
  - Switching kind refetches.
  - Rows show rating, walk and open-until.
  - The name link uses `mapsUrl` with the placeId.
  - "+ Day" calls `createItem` with date, stopId (or none on a Gap day), the category and the hours.
  - "♡ Wishlist" omits date and stopId.
  - Over-cap copy and empty copy.
  - Denied geolocation.
  - The attribution line.
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(nearby): the What's around sheet`.

### Task 4: Entry points, privacy note, DEPLOY row

**Files:**
- Day view: a "What's around" button in `components/trip/day/day-plan-card.tsx`, beside the add button, on both empty and planned days, rendered only when the flag is on. `startPoints`: tonight's Accommodation (if located), the Stop (if located), then the day's located scheduled Items (from the data the card already has). `allowNearMe = phase === "travelling" && isToday`. Thread the flag through `DayViewData` (or the page's `shell`).
- Today view: the same button in `components/trip/home/phase-travelling.tsx` (phone, next to the Day ideas / nearby block) and in `components/trip/home/desktop/today-tile.tsx` (header row), with `allowNearMe = isWithinTrip`.
- `app/privacy/page.tsx`: one sentence. "What's around" sends the chosen point to Google Places; "Near me" uses your device location only for that search and never stores it.
- `docs/DEPLOY.md` §4j step 6: a quota row "Places — Nearby Search (SearchNearby) | 1,000 (Enterprise) | 33".

- [ ] Write failing tests: `DayPlanCard` renders the button only with the flag on, with start points in the right order; the Today tile and phase-travelling likewise.
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(nearby): What's around on the Day and Today views`.
