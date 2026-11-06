# Google extras — Branch 2: Public holidays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each dated day of a Trip shows the Public holidays (and a few named Observances) of the places the Travellers are in that day, Region-aware, on the Day view, Day strip, Calendar, Today view, morning Digest, Claude's `get_day` and Review input.

**Architecture:**
- **Places:** Stops, the Home base and both Transport ends gain a **Region** (Google `administrative_area_level_1`, in English), and Transport ends gain their first country code.
- **Holiday data:** fetched from Google's public holiday iCal feeds, one per country. Each feed is parsed and stored in a global cache table (`HolidayFeed`). Pages only read the cache; a miss schedules a fetch with `after()`.
- **Day logic:** two pure functions, `placesOnDay` and `holidaysOnDay`, decide what each day shows. Every surface goes through one loader helper.

**Tech Stack:** Next.js (repo version — read `node_modules/next/dist/docs/` before using framework APIs), Prisma/Postgres, TypeScript, Vitest.

**Spec:** `docs/specs/2026-11-06-google-extras.md` §B (B3 was updated 2026-11-06 for the public iCal feeds). Glossary: CONTEXT.md **Public holiday**, **Observance**, **Region**, **Changeover day**, **Gap day**.

## Global Constraints

- **Feed URL:** `https://calendar.google.com/calendar/ical/en.<name>%23holiday%40group.v.calendar.google.com/public/basic.ics`. No key, no Calendar API, no quota counter.
- **Feed names are Google's, not ISO codes.** Verified to return 200 on 2026-11-06: au `australian`, at `austrian`, nl `dutch`, es `spain`, pt `portuguese`, ie `irish`, nz `new_zealand`, us `usa`, sg `singapore`, my `malaysia`, vn `vietnamese`, ca `canadian`, gr `greek`, dk `danish`, se `swedish`, no `norwegian`, fi `finnish`, pl `polish`, cz `czech`, hr `croatian`, hu `hungarian`, tr `turkish`, kr `south_korea`, cn `china`, hk `hong_kong`, tw `taiwan`, ph `philippines`, mx `mexican`, br `brazilian`, za `sa`, id `indonesian`, de `german`, gb `uk`, fr `french`, it `italian`, jp `japanese`, fj `fj`. Returned 500 (find the working form or omit): ch, th, be, is.
- **Event classification by `DESCRIPTION`'s first line:**
  - `Public holiday` → national public holiday.
  - `Public holiday in A\, B\, C` → regional, with Regions A, B, C (unescape `\,`).
  - `Observance…` → observance (regional observances likewise).
  - A later line `This is a half-day holiday.` → `halfDay`.
- **Observances shown:** only those whose name starts with `Christmas Eve`, `New Year's Eve` or `Good Friday`. All others are dropped.
- **Places on a day (spec B2):**
  - A day covered by one Stop: that Stop.
  - A **Changeover day**: both Stops.
  - A **Gap day** (no Stop covers it): each Transport end whose local departure or arrival date is that date. An end with `depIsHome`/`arrIsHome` uses the Home base.
  - The Trip's first and last day also add the Home base.
  - Rough Stops (no dates) contribute nothing.
- **Region matching:**
  - A regional holiday shows for a place whose Region matches one of its Regions, after normalising (case, diacritics, surrounding whitespace).
  - If the place has no Region, or its Region appears in none of that country's feed events (it is outside the feed's vocabulary), show the holiday with its Regions named instead.
  - If the Region is in the vocabulary but not in this holiday's list, hide the holiday.
- **Copy (exact):**
  - Public: `"{name} ({Country}): public holiday, expect closures"`
  - Half-day: `"{name} ({Country}): half-day public holiday, many places close early"`
  - Observance: `"{name} ({Country}): many places close early"`
  - Regional fallback: `"{name}: public holiday in parts of {Country} ({A}, {B}, {C})"`
  - `{Country}` comes from `new Intl.DisplayNames(["en"], { type: "region" }).of(cc.toUpperCase())`.
- **Cache:** one row per country. Refetch when older than 30 days. A failed fetch is stored `ERROR` and retried after 24 h. Pages never wait on a fetch.
- **Glossary:** "Holiday" alone never names the Trip. Code and UI say "public holiday".
- **Verification tiers per `CLAUDE.md`:**
  - Inner loop: `npx vitest run <file>`.
  - Task done: `npx vitest related --run <changed files>` + `npx tsc --noEmit` + `npx eslint <changed files>`.
  - The `transport-form-dialog` "defaultDate is ignored when editing" failure is timezone-dependent; re-run it with `TZ=UTC` before calling it real.
- Zero comments unless the WHY is non-obvious. No JSDoc. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage `docs/feedback/inbox.md` or `AGENTS.md`.

## Review Focus

1. **Surprise.** Holidays come only from Stops, the Home base and Transport ends, never from Items. A Surprise Stop's own name and place are already visible to a surprised Traveller (only its contents are masked: `maskSurpriseStops`), so a holiday line reveals nothing new. A Surprise *Item* must never contribute a place. Pinned in Task 5: `placesOnDay` takes no Items.
2. **Columns copied one by one.** Forks, duplicated Trips and Fork promotion must carry `region`, `homeRegion` and the Transport `dep/arr CountryCode/Region`. A missed copy silently loses Regions. Pinned in Tasks 2 and 3 with copy tests.
3. **A Region in another language** ("Bayern") must not hide Epiphany in Munich. It falls back to the named-regions line. Pinned in Task 5.
4. **A trip year outside the feed** (the feed covers only about 3 years) shows nothing and doesn't throw. A missing or ERROR feed shows nothing. Pinned in Tasks 4 and 5.
5. **The same holiday in two countries on a Changeover day** (Christmas Day: Germany and France) shows one line per country, never duplicated within a country. Pinned in Task 5.

---

### Task 0 (controller, before dispatch)

- [ ] `git switch -c feat/google-extras-2-holidays` from `main`.
- [ ] Commit the uncommitted spec §B3 and ADR 0076 edits, plus this plan: `docs(google-extras): holidays from Google's public iCal feeds; branch 2 plan`.

### Task 1: Rename the place-search kind and the picked place's display line

Mechanical. It frees the word **Region** for its glossary meaning.

**Files:**
- `components/places/use-place-suggestions.ts` (+ `.test.tsx`)
- `components/ui/place-combobox.tsx` (+ `.test.tsx`)
- `lib/picked-place.ts`
- `components/trip/stop-form-dialog.tsx:~303`
- `components/plan/mobile/add-stop-sheet.tsx:~113`
- Any other reader that `grep -rn "\.region\b"` finds on a `PickedPlace`.

**Changes:**
- `PlaceKind` becomes `"area" | "venue" | "any"`. The default `kind` in `place-combobox.tsx` becomes `"area"`. The `includedPrimaryTypes: ["(regions)"]` mapping now keys on `"area"`; the Google type string `"(regions)"` stays.
- `PickedPlace.region` (the "New South Wales, Australia" display line) is renamed `subtitle`, and every reader and test is updated. The test asserting `not.toHaveProperty("region")` asserts `not.toHaveProperty("subtitle")` with the same intent.

- [ ] Update the tests to the new names, run them, and expect FAIL: `npx vitest run components/places/use-place-suggestions.test.tsx components/ui/place-combobox.test.tsx`
- [ ] Rename. The same run now passes.
- [ ] Run the task-done verification, then commit: `refactor(places): search kind "area"; picked place's display line is "subtitle"`.

### Task 2: Region on Stops and the Home base

**Files:**
- `prisma/schema.prisma`: `Stop.region String?` and `Trip.homeRegion String?`, plus the Transport columns from Task 3 so there is one migration: `depCountryCode String?`, `arrCountryCode String?`, `depRegion String?`, `arrRegion String?`.
- New migration `prisma/migrations/20261106120000_regions/migration.sql`: additive and nullable, with the same header-comment style as `20261031120000_travel_times`.
- `lib/picked-place.ts`: add `region?: string`, the English `longText` of the `administrative_area_level_1` component.
- `components/places/use-place-suggestions.ts`: read `region` in `pick()`. The pick must request English address components; find where the Places library is loaded for picks and pass language `"en"`. If that loader is shared with the maps, map labels become English too: accepted.
- `lib/geocode.ts`: `GeoCandidate.region: string | null` from the same component. `languageCode` is already `"en"`.
- `lib/place-save.ts` (`pickedPlace`, `placeForSave`, `foundPlace`) carries `region` alongside `countryCode`.
- `lib/validations/stop.ts` and `lib/validations/trip.ts`: optional `region`.
- `server/actions/stops.ts`: `stopPlace` returns `region`. Write it everywhere `countryCode` is written (create, update, append path, `firmUpSegment`, `firmUpTrip`). A pick passes it; a lookup supplies it.
- `server/actions/trips.ts` (`createTrip`, `updateTrip`) and `lib/new-trip/draft.ts`: `homeRegion`. When the home place changes, the Region follows the new place (cleared if unknown), never kept from the old place.
- Client senders: `components/trip/stop-form-dialog.tsx`, `components/plan/mobile/add-stop-sheet.tsx`, `components/trip/settings/trip-details-form.tsx` and the new-trip steps send `region` from the pick.
- Copies: `lib/duplicate-trip.ts`, `lib/fork-plan.ts`, and Fork promotion (`server/actions/forks.ts`) copy `region` and `homeRegion` wherever they copy `countryCode` / `homeCountryCode`.
- Writers on Claude's side (`lib/mcp/tools/trips-stops-write.ts`) and booking import (`lib/booking-import/build.ts`): wherever they write a Stop or home `countryCode`, also write the Region from the same lookup.

**Interfaces produced:** `PickedPlace.region?: string`; `GeoCandidate.region: string | null`; DB columns `Stop.region`, `Trip.homeRegion`, `Transport.depCountryCode | arrCountryCode | depRegion | arrRegion`.

- [ ] Write failing tests:
  - `use-place-suggestions.test.tsx`: a pick whose components include `{types:["administrative_area_level_1"], longText:"Bavaria", shortText:"BY"}` yields `region: "Bavaria"`, and one with no such component yields no `region`.
  - `lib/geocode.test.ts`: the same, for `GeoCandidate.region`.
  - `server/actions/stops.test.ts`: create and update write `region` from the pick and from a lookup.
  - `server/actions/trips.test.ts`: `homeRegion` follows the home place, including being cleared.
  - `lib/duplicate-trip.test.ts` and `lib/fork-plan.test.ts`: `region` and `homeRegion` survive the copy.
- [ ] Run them and expect FAIL.
- [ ] Add the migration and run `npx prisma generate`. Implement until they pass.
- [ ] Run the task-done verification and commit: `feat(places): Stops and the Home base know their Region`.

### Task 3: Country and Region on Transport ends

**Files:**
- `components/trip/location-combobox.tsx`: the Google-result branch passes `countryCode` and `region` from its pick, the same way as Task 2.
- `components/trip/transport-form-dialog.tsx`: sends them for each end.
- Transport validation (find it beside `lib/validations/`).
- `server/actions/transport.ts`: `endPlaces` (l.~80–108) returns `countryCode` and `region` per end and stops passing `countryCode: null` (l.91, 96). `createTransport` and `updateTransport` write `depCountryCode`, `arrCountryCode`, `depRegion` and `arrRegion`.
  - A held place keeps its values.
  - A changed place takes the new ones, or clears them.
  - An end with `depIsHome`/`arrIsHome` stores none: readers use the Trip's home columns.
- Copies in `lib/duplicate-trip.ts` and `lib/fork-plan.ts`. Booking import's Transport writer.

- [ ] Write failing tests:
  - `server/actions/transport.test.ts`: a picked end stores country and Region; a changed end replaces them; a home end stores null.
  - The copy tests: the four columns survive.
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(transport): Transport ends know their country and Region`.

### Task 4: Holiday feeds, the parser and the cache

**Files:**
- Create `lib/holidays/feed-names.ts`: `export const HOLIDAY_FEED_NAMES: Record<string, string>`, keyed by lowercase ISO alpha-2, containing every verified name from Global Constraints. For ch, th, be and is, try plausible forms with `curl -s -o /dev/null -w "%{http_code}"` against the feed URL (e.g. `swiss`, `ch`, `thai`, `th`, `belgian`, `be`, `icelandic`, `is`). Include only forms that return 200.
- Create `lib/holidays/ics.ts`: `export type FeedHoliday = { date: string; name: string; kind: "public" | "observance"; regions: string[] | null; halfDay: boolean }` and `export function parseHolidayIcs(ics: string): FeedHoliday[]`. Handle RFC 5545 line unfolding, `\,` `\;` `\n` `\\` unescaping, and `DTSTART;VALUE=DATE:YYYYMMDD` → `YYYY-MM-DD`. Drop events whose description matches neither "Public holiday" nor "Observance".
- Create test fixtures `lib/holidays/__fixtures__/{german,indonesian,uk,australian}.ics`, trimmed from the real feeds saved at `/private/tmp/claude-501/-Users-cameronwilliams-code-personal-travelPlanner/4cb93abb-66b5-43a6-89d2-60b30f28519e/scratchpad/ics/*.ics`. Keep the header plus about 6–10 VEVENTs each, keeping the real escaping and folding. Include:
  - German: Epiphany (regional), Christmas Eve (half-day), Christmas Day, and one Observance.
  - Indonesian: both Nyepi events and Idul Fitri.
  - UK: Boxing Day and Substitute Bank Holiday 28 Dec.
  - Australian: one multi-Region event (the "Australian Capital Territory\, New South Wale…" one).
- `prisma/schema.prisma` + migration `prisma/migrations/20261106130000_holiday_feeds/migration.sql`: `model HolidayFeed { countryCode String @id; status String; holidays Json; fetchedAt DateTime @default(now()) @updatedAt }`, with `status` one of `OK | NONE | ERROR`. `NONE` means no feed name exists for the country.
- Create `lib/holidays/cache.ts` (`import "server-only"`):
  - `readHolidayFeeds(countryCodes: string[]): Promise<Map<string, FeedHoliday[]>>` reads the DB only. Missing, ERROR and NONE rows are absent from the map.
  - `refreshHolidayFeeds(countryCodes: string[], now?: Date): Promise<void>` fetches only rows that are missing, OK and older than 30 days, or ERROR and older than 24 h. Uses `fetch` with `AbortSignal.timeout(GOOGLE_TIMEOUT_MS)` from `lib/google-fetch.ts`. A non-200 response or a parse failure is stored as ERROR. A country with no feed name is stored as NONE.
  - `scheduleHolidayFeeds(countryCodes: string[]): void` calls `after(() => refreshHolidayFeeds(...))`, inside try/catch (a no-op outside a request, the same pattern as `lib/travel-times/schedule.ts`).

**Interfaces produced:** `FeedHoliday`, `parseHolidayIcs`, `HOLIDAY_FEED_NAMES`, `readHolidayFeeds`, `refreshHolidayFeeds`, `scheduleHolidayFeeds`.

- [ ] Write failing tests:
  - `lib/holidays/ics.test.ts` on the fixtures:
    - Epiphany → `{date:"2026-01-06", kind:"public", regions:["Baden-Württemberg","Bavaria","Saxony-Anhalt"], halfDay:false}`.
    - German Christmas Eve → `halfDay:true`, `kind:"public"`.
    - Nyepi 2026-03-19 → `kind:"public"`, `regions:null`.
    - The Australian multi-Region event splits into every Region, with no stray backslashes.
    - Observances come out as `kind:"observance"`.
  - `lib/holidays/cache.test.ts`, against a mocked `fetch` and the db test pattern used by `lib/google-usage.test.ts`:
    - A fresh OK row is not refetched.
    - A 31-day-old row is.
    - An ERROR row is retried only after 24 h.
    - An unknown country is stored as NONE without fetching.
    - `readHolidayFeeds` omits ERROR and NONE rows.
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(holidays): Google's public holiday feeds, parsed and cached per country`.

### Task 5: What a day shows (pure)

**Files:** create `lib/holidays/day.ts` (+ `day.test.ts`).

**Interfaces produced:**
```ts
export type DayPlace = { countryCode: string; region: string | null };
export type PlacesOnDayInput = {
  date: string;
  tripStart: string | null;
  tripEnd: string | null;
  home: DayPlace | null;
  stops: Array<{ arriveDate: string | null; departDate: string | null; countryCode: string | null; region: string | null }>;
  transportEnds: Array<{ date: string; place: DayPlace | null; isHome: boolean }>;
};
export function placesOnDay(input: PlacesOnDayInput): DayPlace[];
export type DayHoliday = { countryCode: string; name: string; kind: "public" | "observance"; halfDay: boolean; namedRegions: string[] | null };
export function holidaysOnDay(places: DayPlace[], date: string, feeds: Map<string, FeedHoliday[]>): DayHoliday[];
export function holidayLine(h: DayHoliday): string;
```
- `transportEnds[].date` is the end's *local* calendar date. The caller derives it with the same bucketing the itinerary uses for `transportEntries`.
- `namedRegions` is set only for the regional fallback.
- `placesOnDay` dedupes by country + Region.
- `holidaysOnDay` dedupes by country + name.
- No Items anywhere in these inputs.

- [ ] Write failing tests in `lib/holidays/day.test.ts`. Build feeds from `parseHolidayIcs` on Task 4's fixtures. Cover:
  - **Stops:** one Stop gives its place. A Changeover day gives both. A rough Stop contributes nothing.
  - **Gap day:** a day only in the air gives nothing. A day landing in Denpasar gives Indonesia (Bali). A home end gives the Home base.
  - **Home base:** included on the first and last day only.
  - **Epiphany 2026-01-06:**
    - Munich (`region:"Bavaria"`) shows it with `namedRegions:null`.
    - Berlin (`region:"Berlin"`, which appears elsewhere in the German feed) hides it.
    - `region:"Bayern"` and `region:null` both show it with the named Regions.
  - **Christmas 2026-12-25 on a Changeover day DE → FR:** two lines, one per country.
  - **Observances:** Valentine's Day is dropped. Christmas Eve as an observance (UK fixture, if present) is kept.
  - **Missing data:** a date in a year with no events, or a country missing from `feeds`, returns `[]`.
  - **`holidayLine`:** each of the four copy forms, exactly as in Global Constraints (Country via `Intl.DisplayNames`).
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(holidays): which public holidays a day shows`.

### Task 6: Show them (Day view, Day strip, Calendar, Today view)

**Files:**
- Create `lib/holidays/trip-days.ts` (`import "server-only"`): `loadHolidayLines(tripId: string, dates: string[]): Promise<Map<string, string[]>>`.
  - Reads the Trip's dated Stops (`arriveDate`, `departDate`, `countryCode`, `region`), the home columns, the Transports (ends, dates in the Trip zone, `depIsHome`/`arrIsHome`), the trip range, and the feeds for every country involved.
  - Calls `scheduleHolidayFeeds` for countries whose feed is missing or stale.
  - Returns `holidayLine` strings per date.
  - Uses the real plan (Fork-aware the way the Day view already is: read how `lib/day-reads.ts` picks the plan and match it).
  - Cache the read per request with React `cache`.
- Day view: add `holidays: string[]` to `DayViewData` (`lib/day-view-loader.ts`, filled in `getDays`). `components/trip/day/day-header.tsx` renders each line under the sub line: small text with a calendar or flag icon from the icon set the header already uses, and `role="note"`.
- Day strip: each `dates[]` entry gains `holiday: boolean`. The chip shows a small dot marker with an `aria-label` suffix ", public holiday".
- Calendar: `MonthGrid` gains `holidayDates?: Record<string, string[]>` (wired through `CalendarViews` from the calendar page). A cell with lines shows a marker and has the lines in its accessible name and `title`.
- Today view: `DatedTravellingHome` gains `holidays: string[]` for today (`lib/travelling-home-loader.ts`), rendered in `PhaseTravelling` and the desktop `TodayTile` under the date.

- [ ] Write failing tests:
  - `lib/holidays/trip-days.test.ts`, integration-style over the db test pattern: a Trip with a Bavarian Stop on 2026-01-06 and a fresh German feed row → one line on that date. A missing feed → no lines and `scheduleHolidayFeeds` called with `["de"]`.
  - Component tests for `DayHeader` (lines render as notes), `DayStrip` (marker + aria), `MonthGrid` (marker + accessible name) and `TodayTile` (line renders).
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(holidays): days show their public holidays`.

### Task 7: Digest, Claude's get_day, Review input

**Files and changes:**
- `lib/digest-dispatch.ts` collects today's lines via `loadHolidayLines`, into `DigestInput`.
- `lib/digest.ts`:
  - **Ruling 2026-11-06:** a Public holiday is a reason to send the MORNING Digest, alongside a departure or a check-out. Today `buildDigest` returns null for MORNING without one of those (l.~190–194).
  - Holiday lines come first in `collectLines` and count toward `DIGEST_MAX_LINES`.
- `lib/mcp/reads/day.ts`: `McpDay` gains `publicHolidays: string[]`. Update the `get_day` tool description in `lib/mcp/tools/reads.ts` with one sentence saying so.
- `lib/review/input.ts` / `lib/review/input-shape.ts`: the Review input gains `publicHolidays: Array<{ date: string; lines: string[] }>` for the Trip's dates. Find where the Review prompt describes its inputs and add one sentence telling it these are already known, so it doesn't research them.

- [ ] Write failing tests:
  - `lib/digest.test.ts`: a MORNING with only a public holiday sends, with the line first. A MORNING with neither still returns null.
  - `lib/mcp/reads/day.test.ts` (or its existing equivalent): `publicHolidays` is present.
  - The review input test: `publicHolidays` is present.
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(holidays): Digest, Claude and Reviews know the day's public holidays`.

### Task 8: Operator script, Region fill and holiday warm

**Files:**
- Create `scripts/fill-regions.ts`, following `scripts/backfill-google-places.ts`'s shape: `import "./load-env"` first, `dbTargetLine`, dry run by default, `--execute`.
  - It finds Stops, Trips (home) and Transport ends that have a place ID but a null Region (and, for Transport ends, a null country code). Ends with `depIsHome`/`arrIsHome` are skipped.
  - For each, it does one Place Details lookup with field mask `addressComponents` and `languageCode=en`, using the server key. Add a `lookUpRegion(placeId)` helper to `lib/geocode.ts` returning `{ countryCode, region } | null`.
  - It prints `kind id · place · → country / Region` per row, then totals.
  - With `--execute` it writes only rows still null (it never overwrites).
  - It then calls `refreshHolidayFeeds` for every distinct country across all Trips' Stops, homes and Transport ends. That needs no key and runs in both modes, because it only fills the cache.
  - It stops after 5 consecutive lookup failures with "Google is refusing lookups: check the GetPlace quota.".
- `package.json`: `"regions:fill": "tsx --conditions=react-server scripts/fill-regions.ts"`.
- `docs/DEPLOY.md`: a new step after §4j step 13: "Fill Regions and warm public holidays".
  - Run `npm run regions:fill` (dry run), read it, then `npm run regions:fill -- --execute`. About 50 GetPlace Essentials lookups, inside the step-6 quota.
  - Holiday feeds are public: no key or quota.

- [ ] Write failing tests:
  - `lib/geocode.test.ts`: `lookUpRegion` parses components and returns null on failure.
  - A test of the script's pure selection helper (put it in `scripts/lib/fill-regions.ts`, like `scripts/lib/travel-times-order.ts`): which rows are candidates, home ends skipped, already-filled rows skipped.
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification. Do not run the script against any database.
- [ ] Commit: `feat(holidays): operator script fills Regions and warms holiday feeds`.
