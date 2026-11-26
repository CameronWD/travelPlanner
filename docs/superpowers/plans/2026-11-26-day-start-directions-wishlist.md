# Day start, Directions back and the Wishlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three Feedback notes (obvious route buttons on the Day map, a Travel time from the bed you woke in, a Wishlist that is one filterable grid) and add a "Directions back" button to the Travelling Home.

**Architecture:** The start hop is a new pure module beside the hop code; `planTravelKeys` learns to ask for its keys, the Day map model carries it as an ordinary hop whose `fromId` is an Accommodation, and the UI reads minutes off the model. The Wishlist's "near a Stop" is a pure module reusing `NEAR_STOP_KM`; the board drops its Stop sections for chips over one grid, and the three ways to add fold into one menu component.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching routing or server components), React 19, TypeScript, Tailwind 4, Vitest + Testing Library, Prisma (no schema change).

**Spec:** `docs/superpowers/specs/2026-11-26-day-start-directions-wishlist.md`

## Global Constraints

- No database migration, no new dependency.
- Copy is exact, with typographic apostrophes as written: "Open today’s route in", "Google Maps", "Apple Maps", "Directions back", "Add an idea", "Type it in", "From your Globe", "Suggest some for a Stop", "All", "Near {Stop}", "Elsewhere", "See them". No em dashes in any user-facing string.
- Travel phrases: `walk` → "walk", `drive` → "drive", `transit` → "by public transport"; a guess appends " (estimated)".
- Glossary words (CONTEXT.md): Accommodation (never "hotel" in UI copy or identifiers), Stop, Travel time, Local travel mode, Hop mode, Wishlist, idea, thing to do.
- Touch targets are at least 44px (`min-h-11`).
- Zero comments by default; no JSDoc; no defensive checks for impossible cases; no features beyond the task.
- Do not run `feedback:pull`, `feedback:resolve` or `feedback:accept`, and do not edit `docs/feedback/inbox.md`.
- Commits are path-scoped (`git add <the task's files>`), other lanes share this checkout. Every commit message ends with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Verification per task: inner loop `TZ=UTC npx vitest run <test files>`; task done `TZ=UTC npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never `npm test` or `npm run build` in a task.

## Review Focus

1. A check-out day with a different bed tonight: both Accommodations are pinned, the route and the start hop begin at the one woken in (Task 3).
2. The woken-in Accommodation has no coordinates, or sits on the same point as the first thing: no start hop, no row, nothing throws (Task 2).
3. An untimed first thing at a public-transport Stop more than 3 km away: no lookup key, the hop resolves as an estimate and says "(estimated)" (Tasks 2, 4).
4. Two Stops with the same name (a city visited twice): one "Near Paris" chip that holds ideas near either (Task 6).
5. The chosen chip empties (its last idea is deleted or scheduled away is not a removal; deletion is): the filter falls back to "All" instead of showing an empty grid (Task 8).

## Lanes

Tasks in different lanes touch no common file and may run concurrently: **A** = 1; **B** = 2 → 3 → 4 (4 also waits for 1); **C** = 5; **D** = 6 → 7 → 8; **last** = 9.

---

### Task 1: Day map route buttons

**Files:**
- Create: `components/trip/day-route-buttons.tsx`, `components/trip/day-route-buttons.test.tsx`
- Modify: `components/trip/day-map.tsx` (the `routeLinks` block, ~lines 142-160, and its two render sites), `components/trip/day/day-map-dialog.tsx` (the `<ol aria-label="Today’s places">` column), `components/trip/help-guide.tsx:811-813`
- Test: also `components/trip/day-map.test.tsx`, `components/trip/day/day-map-dialog.test.tsx` (update what asserts the old links)

**Interfaces:**
- Produces: `export function DayRouteButtons({ routePoints, className }: { routePoints: DayMapPoint[]; className?: string }): JSX.Element | null` — renders nothing when neither URL can be built.

- [ ] **Step 1: Failing tests** in `day-route-buttons.test.tsx`:
  - `renders two links styled as buttons`: with two located points, `getByText("Open today’s route in")` exists; `getByRole("link", { name: "Google Maps" })` has `href` starting `https://www.google.com/maps/dir/` and `target="_blank"`; `getByRole("link", { name: "Apple Maps" })` has `href` starting `https://maps.apple.com/`; both have class `min-h-11`.
  - `renders nothing with fewer than two points`: container is empty.
- [ ] **Step 2:** `TZ=UTC npx vitest run components/trip/day-route-buttons.test.tsx` → FAIL (module missing).
- [ ] **Step 3: Implement** `DayRouteButtons` with `googleDirectionsUrl` / `appleDirectionsUrl` from `@/lib/map/maps`, `Button asChild variant="secondary" size="md"` around each `<a target="_blank" rel="noopener noreferrer">`, a `Navigation` icon (lucide, `aria-hidden`) in each, the two buttons in a row that each take half the width below `sm` (`flex-1 sm:flex-none`).
- [ ] **Step 4: Wire it.** In `day-map.tsx` delete `routeLinks`; when `fill` is false render `<DayRouteButtons routePoints={routePoints} />` above the map; when `fill` is true render it below the map with `className="lg:hidden"`. In `day-map-dialog.tsx` wrap the `<ol>` in a `hidden w-72 shrink-0 flex-col lg:flex` column (the `ol` keeps `overflow-y-auto` and takes `flex-1 min-h-0`) and render `<DayRouteButtons routePoints={model.routePoints} />` at its foot.
- [ ] **Step 5:** In `help-guide.tsx` change "with links to open the day’s route in Google Maps or Apple Maps" to "with buttons to open the day’s route in Google Maps or Apple Maps".
- [ ] **Step 6:** Update the two existing test files for the new label and roles; add to `day-map-dialog.test.tsx`: `the route buttons sit in the places column` (the column element contains a link named "Google Maps").
- [ ] **Step 7:** Task-done verification on the changed files. Expected: all pass.
- [ ] **Step 8: Commit** `feat(day): the Day map opens the day's route from two real buttons` with trailer `Resolves-Feedback: cmwvw3cz9000108l97q28lohy`.

---

### Task 2: The start hop, pure, and its travel-time keys

**Files:**
- Create: `lib/travel-times/day-start.ts`, `lib/travel-times/day-start.test.ts`
- Modify: `lib/travel-times/hops.ts` (`planTravelKeys`, ~line 453), `lib/travel-times/read.ts` (`loadTravelLookupFor` input type), `lib/travel-times/refresh.ts` (`wantedKeys`, ~lines 60-97)
- Test: `lib/travel-times/hops.test.ts`, `lib/travel-times/refresh.test.ts` (if present; else the nearest existing test of `wantedKeys`)

**Interfaces:**
- Produces, in `day-start.ts`:
  ```ts
  export type StartAccommodationRow = { id: string; stopId?: string | null; checkIn: string; checkOut: string; lat?: number | null; lng?: number | null };
  export function wokeAt<T extends StartAccommodationRow>(accommodations: readonly T[], date: string): T | null;
  export type DayStartHop = { accommodationId: string; toItemId: string; from: Pt; to: Pt; localMode: LocalMode; departure: Date | null };
  export function dayStartHop(input: {
    date: string;
    items: HopItem[];                       // any dates; the function picks `date`'s
    accommodations: readonly StartAccommodationRow[];
    stopsById: ReturnType<typeof hopStopsById>;
    planTransports: { mode: string; fromStopId: string | null; toStopId: string | null }[];
  }): DayStartHop | null;
  export const START_LEAVES_BEFORE_MIN = 30;
  ```
- Produces, in `hops.ts`: `planTravelKeys`'s `plan` gains `accommodations?: StartAccommodationRow[]`; `loadTravelLookupFor`'s `input` gains the same optional field. Callers that omit it behave exactly as before.

Rules (spec §2): `wokeAt` = `checkIn < date && checkOut >= date`, latest `checkIn` wins. `dayStartHop` is null when there is no such Accommodation, it has no coordinates, the date has no located Item, the first located Item (order: `startTime ?? "99:99"`, then `sortOrder`, the same comparator `dayHops` uses) has a `stopId` that differs from the Accommodation's `stopId`, or the two points are equal to 5 decimal places. `localMode` = `effectiveLocalMode` of the Accommodation's Stop, `"TRANSIT"` when the Stop is unknown. `departure` = the first Item's `startTime` on `date` in the Stop's timezone (`zonedWallTimeToInstant`) minus 30 minutes; null when the Item has no `startTime` or the Stop no timezone.

- [ ] **Step 1: Failing tests** in `day-start.test.ts` (Rome: Stop `rome` tz `Europe/Rome`, Accommodation `navona` 2027-01-02 → 2027-01-07 at 41.8977,12.4731; Item `pantheon` 2027-01-03 10:00 at 41.8986,12.4769, `stopId: "rome"`):
  - `wokeAt: a mid-stay day and the check-out day return the bed; the check-in day returns null` — dates `2027-01-03` → navona, `2027-01-07` → navona, `2027-01-02` → null.
  - `wokeAt: two beds on one morning, the later check-in wins`.
  - `mid-stay day: a hop from the bed to the first located thing` — `accommodationId: "navona"`, `toItemId: "pantheon"`, `localMode: "TRANSIT"`, `departure.toISOString() === "2027-01-03T08:30:00.000Z"`.
  - `an untimed first thing has no departure` — `departure === null`.
  - `no hop on the arrival day`, `no hop when the bed has no coordinates`, `no hop when the first thing belongs to another Stop` (`stopId: "florence"`), `a first thing with no Stop still gets the hop` (`stopId: null`), `no hop when the bed and the thing are the same point`, `no hop on a day with no located thing`.
  - `the first thing is the earliest start, then sort order, never an unlocated one`.
- [ ] **Step 2:** run the file → FAIL.
- [ ] **Step 3: Implement** `day-start.ts`. Export `located` and `samePoint` from `hops.ts` if they are not exported, rather than copying them.
- [ ] **Step 4: Failing test** in `hops.test.ts`: `planTravelKeys asks for the start hop's keys when given accommodations` — with the Rome fixture and `now = 2026-12-20T00:00:00Z`, the set contains `routeKey("WALK", bed, pantheon)` and a `TRANSIT|` key whose departure is `2027-01-03T08:30:00.000Z`; and `…asks for none without accommodations` — same input minus the field equals today's result.
- [ ] **Step 5: Implement.** In `planTravelKeys`, for each distinct `date` among the items, `dayStartHop(...)` then `hopKeys(hop.from, hop.to, hop.localMode, hop.departure, now, opts.purpose)`. Thread the optional field through `loadTravelLookupFor`.
- [ ] **Step 6: Refresh.** In `wantedKeys` read `db.accommodation.findMany({ where: { tripId, ...forkFilter() }, select: { id: true, forkId: true, stopId: true, checkIn: true, checkOut: true, lat: true, lng: true } })`, group by fork with `groupByFork`, and pass the plan's rows as `accommodations` to `planTravelKeys`. Add a test beside the existing `wantedKeys`/refresh tests: a dry run on a trip with the Rome fixture counts the start hop's WALK key in `wanted`.
- [ ] **Step 7:** Confirm an Accommodation create/update/delete already schedules a travel-time refresh (`lib/revalidate.ts` → `lib/travel-times/schedule.ts`); if the Accommodation actions bypass it, call the same scheduler they should have, and say so in the report.
- [ ] **Step 8:** Task-done verification. **Commit** `feat(travel-times): a start hop from the Accommodation woken in, and its lookup keys`.

---

### Task 3: The start hop in the Day model, the Day map model and the hop list

**Files:**
- Modify: `lib/day-map.ts`, `lib/day-view-model.ts` (`buildDayModel`, ~lines 345-365), `lib/day-view-loader.ts` (~lines 68-78, 241, 445-460), `lib/travelling-home-loader.ts` (its `loadTravelLookupFor` call), `components/trip/day-feasibility.tsx` (`HopRow`)
- Create: `lib/travel-times/phrase.ts`
- Test: `lib/day-map.test.ts`, `lib/day-view-model.test.ts`, `lib/day-view-loader.test.ts` (or the existing test that covers `hops`), `components/trip/day-feasibility.test.tsx`

**Interfaces:**
- Consumes: `wokeAt`, `dayStartHop`, `DayStartHop`, `StartAccommodationRow` (Task 2).
- Produces:
  ```ts
  // lib/travel-times/phrase.ts
  export const TRAVEL_PHRASE = { walk: "walk", drive: "drive", transit: "by public transport" } as const;
  export function travelPhrase(h: { minutes: number; mode: "walk" | "drive" | "transit"; estimated: boolean }): string; // "6 min walk", "12 min by public transport (estimated)"

  // lib/day-map.ts
  buildDayMapModel(input: { …; accommodation?: DayMapAccommodationInput | null; start?: DayMapAccommodationInput | null; … })
  export interface DayMapHop { fromId: string; toId: string; polyline: string | null; estimated: boolean; minutes: number | null; mode: "walk" | "drive" | "transit" | null }
  type DayHopInput = { …; accommodations?: StartAccommodationRow[]; date?: string }

  // lib/day-view-loader.ts
  export interface DayHopEntry { …existing…; start?: true }   // start row: fromItemId is the Accommodation's id, fromTitle its name
  ```

Model rules: `accommodation` (tonight's) still makes the "H" point. `start`, when given and located, is the first of `routePoints` and the first thing's `perItemPrev`; when it is a different Accommodation from tonight's it adds its own `kind: "accommodation"` point. With no `start`, `routePoints` is the items only and the first thing has no `perItemPrev` (this changes today's behaviour on arrival days, as the spec says). `buildDayModel` passes `start` only when `dayStartHop` for that date is non-null, so the model and the hop always agree.

`dayMapHops`: every existing hop gains `minutes` (rounded) and `mode` from its `resolved`, or `null`/`null` when the pair is not a planned hop. When `dayStartHop` is non-null a hop is put first: `fromId` the Accommodation id, `toId` the first thing, resolved with `resolveHop(from, to, localMode, departure, lookup, estimateOpts)`.

- [ ] **Step 1: Failing tests** in `day-map.test.ts`:
  - `with a start, the route begins at it and the first thing's previous point is it`.
  - `with no start, the route is the things alone and tonight's Accommodation is still a point`.
  - `a start that is not tonight's Accommodation is its own point` (two `accommodation` points, ids differ; `routePoints[0].id` is the start's).
  - `dayMapHops puts the start hop first with its minutes and mode` — lookup holds the WALK key OK, 6 min, polyline `"abc"` → `{ fromId: "navona", toId: "pantheon", minutes: 6, mode: "walk", estimated: false, polyline: "abc" }`.
  - `a start hop with nothing looked up is an estimate` — `estimated: true`, `polyline: null`, `minutes` > 0.
  - `hops between things carry their minutes and mode`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement in `lib/day-map.ts`; `withDayMapHops` passes `rows.accommodations` and `date` through (its `rows` parameter gains `accommodations: StartAccommodationRow[]`).
- [ ] **Step 4: Failing tests** in `day-view-model.test.ts`: `a mid-stay day's map starts from the bed`, `an arrival day's map has no start but keeps the bed's pin`, `a check-out day starts from the bed woken in`. Implement in `buildDayModel` (keep `tonight` and `bed` as they are; add the start).
- [ ] **Step 5: Lookups.** Pass `accommodations: rows.accommodations` to `loadTravelLookupFor` in `lib/day-view-loader.ts` and `lib/travelling-home-loader.ts`.
- [ ] **Step 6: Hop list.** Failing test: `the day's hops begin with the start hop` — entry `{ start: true, fromItemId: "navona", fromTitle: "The Club Navona", toTitle: "Pantheon", minutes: 6, travel: "walk", estimated: false, modeSetByHand: false }`. Implement in `day-view-loader.ts` by prepending it to `hops`; `mode` is the hop's `localMode`. Move `TRAVEL_PHRASE` out of `day-feasibility.tsx` into `lib/travel-times/phrase.ts`.
- [ ] **Step 7: HopRow.** Failing test in `day-feasibility.test.tsx`: `the start hop is a quiet row with no mode chooser` — behind "All hops", text "The Club Navona → Pantheon" and "6 min walk", and no chooser control inside that row. Implement: `HopRow` skips `HopModeChooser` when `hop.start`.
- [ ] **Step 8:** Task-done verification. **Commit** `feat(day): the day's route and hops start from the Accommodation woken in`.

---

### Task 4: Times on the Day map

**Files:**
- Modify: `components/trip/day-map.tsx` (`DayRoute`, the pin pop-up), `components/trip/day/day-map-dialog.tsx` (the places list)
- Test: `components/trip/day-map.test.tsx`, `components/trip/day/day-map-dialog.test.tsx`

**Interfaces:**
- Consumes: `DayMapHop.minutes` / `.mode`, `travelPhrase` (Task 3); `DayRouteButtons` placement (Task 1).

- [ ] **Step 1: Failing tests:**
  - `day-map.test.tsx` — `a pin's pop-up says how long from the point before`: model with hop `{ fromId: "navona", toId: "pantheon", minutes: 6, mode: "walk", estimated: false }` → opening Pantheon's pin shows "6 min walk from The Club Navona"; an estimated transit hop shows "12 min by public transport (estimated) from Pantheon"; a hop with `minutes: null` shows no such line.
  - `day-map.test.tsx` — `the start hop draws its looked-up route` (a polyline with `encodedPath: "abc"`), and `…a dashed straight line when it has none`.
  - `day-map-dialog.test.tsx` — `the places list starts with the start Accommodation and shows the time between rows`: list item order is The Club Navona, Pantheon, Trevi Fountain; between the first two is the text "6 min walk"; points off the route (tonight's other bed, Transport ends) follow, with no time.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** `DayRoute`: delete the `bed` special case; the start hop is in `hops` and resolves through the same `leaving`/`at` maps. Pop-up: one `text-xs` line above "Directions from previous", built from the hop whose `toId` is the point and `perItemPrev[point.id].label`. Dialog list: `[...model.routePoints, ...model.points.filter(not on the route)]`, deduped by `kind:id`; between consecutive route rows a non-interactive `text-xs font-semibold text-muted-foreground` line with `travelPhrase(hop)` when `hop.minutes != null`.
- [ ] **Step 4:** Task-done verification. **Commit** `feat(day): the Day map says how long each hop takes, from the Accommodation onward` with trailer `Resolves-Feedback: cmwvw1co3000008l9qpwpn82w`.

---

### Task 5: Directions back

**Files:**
- Modify: `lib/map/maps.ts`, `components/trip/home/now-next-card.tsx`, `components/trip/home/phase-travelling.tsx` (the `NowNextCard` call ~line 176 and the `StayCard` ~line 207), `lib/usage/lists.ts`, `lib/usage/labels.ts`
- Test: `lib/map/maps.test.ts`, `components/trip/home/now-next-card.test.tsx`, `components/trip/home/phase-travelling.test.tsx`, `lib/usage/labels.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/map/maps.ts
  export function directionsBackUrl(accommodation: { lat?: number | null; lng?: number | null; address?: string | null } | null, mode: LocalMode | null): string | null; // Google; coordinates win over address; null when neither
  // now-next-card.tsx
  NowNextCard props gain: directionsBack?: string | null
  ```
- Usage action `"directions-back-tapped"`, label "Tapped Directions back".

- [ ] **Step 1: Failing tests:**
  - `maps.test.ts` — `directionsBackUrl`: coordinates → `https://www.google.com/maps/dir/?api=1&destination=41.8977%2C12.4731&travelmode=walking` for `"WALK"`; address only → `destination=Corso+Vittorio+Emanuele+II+184…` with `travelmode=transit` for `null`; neither → `null`; `null` accommodation → `null`.
  - `now-next-card.test.tsx` — with `directionsBack` set, a link named "Directions back" with that `href` and `target="_blank"` is present in each layout: `kind: "nothing"`, the departure countdown, and the main card (after "Directions", before "Day map"); without it, no such link.
  - `phase-travelling.test.tsx` — `Tonight's stay offers Directions back` (inside `data-testid="tonights-stay"`), and `…not when the Accommodation has no address or coordinates`.
  - `labels.test.ts` — `actionLabel("directions-back-tapped", null)` is "Tapped Directions back".
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** `directionsBackUrl` over `directionsFromHereUrl(...).google`. The button: `Button asChild variant="secondary" size="md" className="min-h-11"` around `UsageAnchor action="directions-back-tapped"`, lucide `Bed` icon, text "Directions back". `phase-travelling.tsx` computes the URL once from `tonightAccom` and `localMode` and gives it to both places. Add the action to `lib/usage/lists.ts` after `"directions-tapped"` and its label.
- [ ] **Step 4:** Task-done verification. **Commit** `feat(home): Directions back to tonight's Accommodation from the Travelling Home`.

---

### Task 6: Near a Stop, pure

**Files:**
- Create: `lib/wishlist-near.ts`, `lib/wishlist-near.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const ALL = "all", ELSEWHERE = "elsewhere";
  export type WishlistChip = { key: string; label: string; count: number };   // key: ALL | ELSEWHERE | `near:${stopName}`
  export type WishlistNear = {
    chips: WishlistChip[];                       // [] when only "All" would show
    nearLabel: Map<string, string>;              // ideaId → "Near Rome" (nearest Stop); absent when near none
    inChip(ideaId: string, chipKey: string): boolean;
  };
  export function wishlistNear(
    ideas: readonly { id: string; lat?: number | null; lng?: number | null }[],
    stops: readonly { id: string; name: string; lat?: number | null; lng?: number | null }[],   // route order
  ): WishlistNear;
  ```
  Uses `NEAR_STOP_KM` from `@/lib/schedule-day-options` and `haversineKm` from `@/lib/geo`, with the same 1e-6 slack.

- [ ] **Step 1: Failing tests** (Stops in order Paris, Rome, Paris again; ideas: Colosseum in Rome, Louvre in Paris, Versailles 17 km from Paris, "Northern lights" with no coordinates, Lisbon castle near nothing):
  - `chips are All, each named Stop with something near it in route order, then Elsewhere` → labels `["All", "Near Paris", "Near Rome", "Elsewhere"]`, counts `[5, 2, 1, 2]`.
  - `two Stops with one name share a chip`.
  - `an idea near two differently named Stops is in both chips and labelled with the nearer`.
  - `an idea with no coordinates, or near no Stop, is Elsewhere and has no label`.
  - `a Stop exactly 50 km away counts as near`.
  - `no chips when every idea is near nothing and there is nothing to choose between` — with zero ideas, and with ideas that are all Elsewhere, `chips` is `[]`.
  - `inChip("…", "all")` is always true; an unknown chip key is false.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `feat(wishlist): which ideas are near which Stop`.

---

### Task 7: One "Add an idea" menu

**Files:**
- Create: `components/trip/wishlist-add-menu.tsx`, `components/trip/wishlist-add-menu.test.tsx`
- Delete: `components/trip/wishlist-header-actions.tsx`, `components/trip/wishlist-header-actions.test.tsx`
- Modify: `components/trip/ai-activity-suggestions.tsx`, `app/(app)/trips/[tripId]/wishlist/page.tsx` (the `PageHeader` `actions` and the `md:hidden` Globe block), `app/(app)/trips/[tripId]/wishlist/page.test.tsx`
- Test: `components/trip/ai-activity-suggestions.test.tsx` (create if absent)

**Interfaces:**
- Produces:
  ```ts
  export function WishlistAddMenu(props: {
    tripId: string;
    stops: StopOption[];                 // from ./item-form-dialog
    tripStartDate?: string | null;
    homeCurrency?: string;
    hasGlobe: boolean;
    globeMarkers: MarkerView[];
    addedMarkerIds: string[];
    aiConfigured: boolean;
    variant?: "primary" | "secondary";   // default "primary"
    className?: string;
  }): JSX.Element;
  ```
  It owns its three dialogs (`ItemFormDialog` with `defaultUnscheduled`, `AddFromGlobeDialog`, and a "Suggestions for a Stop" dialog), so it can be rendered more than once.
- `AiActivitySuggestions` keeps its props; adding a suggestion now saves a Wishlist idea.

- [ ] **Step 1: Failing tests** in `wishlist-add-menu.test.tsx`:
  - `the trigger is one button named "Add an idea"`; opening it lists "Type it in", "From your Globe", "Suggest some for a Stop" in that order.
  - `no Globe entry without a Globe`; `no suggestions entry without AI or without a Stop`.
  - `Type it in opens the idea form` (the dialog `ItemFormDialog` renders).
  - `From your Globe opens the Globe picker`.
  - `Suggest some for a Stop asks which Stop, then shows that Stop's suggestions` — the dialog titled "Suggestions for a Stop" has a Stop select listing each Stop's name once chosen renders `AiActivitySuggestions` for it.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** with `components/ui/dropdown-menu.tsx` (read it and one existing caller for the house pattern), a `Plus` icon on the trigger, `Button size="md"`.
- [ ] **Step 4: Suggestions save ideas.** Failing test: `adding a suggestion saves a Wishlist idea` — `createItem` is called with `{ title, category, notes }` and no `stopId`. Implement: drop `stopId` from the `createItem` payload in `handleAdd`; the button's label stays "Add to wishlist". If `createItem` refuses an Item with neither Stop nor date, stop and report instead of working around it.
- [ ] **Step 5: Page.** Replace `WishlistHeaderActions` in `PageHeader`'s `actions` with `<WishlistAddMenu … aiConfigured={isAiConfigured()} />` shown whether or not the Wishlist is empty, and delete the `md:hidden` phone copy of the Globe button. Update `page.test.tsx`. Delete the old component and its test. `AddItemFromUrl` stays.
- [ ] **Step 6:** Task-done verification (include `npx vitest related --run` on the deleted file's importers). **Commit** `feat(wishlist): one Add an idea menu for typing, the Globe and suggestions`.

---

### Task 8: The Wishlist is one grid with working chips

**Files:**
- Modify: `components/trip/wishlist-board.tsx`, `components/trip/wishlist-board.test.tsx`, `components/trip/globe-suggestions-strip.tsx` (+ its test), `app/(app)/trips/[tripId]/wishlist/page.tsx` (board props only)

**Interfaces:**
- Consumes: `wishlistNear`, `ALL` (Task 6); `WishlistAddMenu` (Task 7).
- `WishlistBoardProps`: unchanged names; `stops` must carry `lat`/`lng` (it already can).

- [ ] **Step 1: Failing tests** in `wishlist-board.test.tsx` (replace the tests of Stop sections):
  - `every idea is in one list, best voted first, with no Stop headings` — no `h3` with a Stop's name, no "Not tied to a stop yet", no "0 ideas".
  - `chips: All, Near Rome, Elsewhere` — a `group` named "Filter ideas by where they are"; pressing "Near Rome" leaves only the Rome idea; "All" restores.
  - `no chips when there is nothing to choose between`.
  - `a card says what it is near` — the Colosseum card contains "Near Rome".
  - `the chips filter the map view too` — in Map view with "Near Rome" chosen, the map loader receives only the Rome idea.
  - `when the chosen chip empties, the filter returns to All` — rerender without the Rome idea → all remaining ideas shown, "All" selected.
  - `below md the add menu is a full-width button under the grid` (a second `WishlistAddMenu`, `variant="secondary"`, class `md:hidden`), present when the Wishlist is empty too.
  - `no AI suggestion rows on the board`.
  - Globe line, in the strip's test: `one line and a See them button` — "3 places from your Globe are on this route" (and "1 place from your Globe is on this route"); "See them" calls `onSeeMore`; nothing renders with no suggestions.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**
  - Board: delete `grouped`, `stopsWithItems`, `stopsToShow`, `renderGroupHeader`, the per-Stop sections, the `AiActivitySuggestions` import and `mapStopFilter`. One `chip` state (default `ALL`), derived back to `ALL` when its key is no longer among the chips. Sort all ideas with `sortItemsByVotes`. Chips use the existing `Chip` (`tone` coral when selected, `touch`), in a row that scrolls sideways below `sm`. Pass `stopName: near.nearLabel.get(item.id) ?? null` on each card's item. Order on the page: chips, Globe line, List/Map switch row (chips left, switch right from `sm`), then the grid or the map. The grid keeps its dashed add tile at the end (`sm`+) and the kit's tone rhythm. Replace the phone block `AddItemButton` with the menu.
  - Strip: rewrite `GlobeSuggestionsStrip` as the one line (same props minus the per-chip add; keep `onSeeMore`), so the count excludes Markers already added.
  - Page: pass `stops` with coordinates as now; nothing else changes.
- [ ] **Step 4:** Task-done verification. **Commit** `feat(wishlist): one grid of ideas with Near a Stop chips, in place of a section per Stop` with trailer `Resolves-Feedback: cmwvw7t6d000408grxu3cx9hn`.

---

### Task 9: Documents

**Files:**
- Modify: `CONTEXT.md` (the **Day map** and **Wishlist** entries), `docs/open.md` ("Ideas, not commitments")

- [ ] **Step 1:** **Day map** entry: replace "with tonight's Accommodation and the day's Transport points marked" so it says the route starts from the Accommodation the Travellers woke in when the day's first thing is at that Stop, tonight's Accommodation is always marked, and each hop's Travel time is written on the map. Keep it a glossary entry: no file names, no thresholds.
- [ ] **Step 2:** **Wishlist** entry: add one sentence, that an idea has no Stop of its own and the board sorts it by which Stops it is **near**, with "Elsewhere" for the rest.
- [ ] **Step 3:** `docs/open.md`, under "Ideas, not commitments": `- **Hop back at night** (Cam, 2026-11-26) A Travel time from the day's last thing back to tonight's Accommodation. Left out because the last thing is often not where the day ends; "Directions back" on the Travelling Home covers the real case.` and `- **Hop mode on the start hop** (2026-11-26) The hop from the Accommodation cannot be set to walk, drive or public transport by hand; a Hop mode is tied to two things to do.`
- [ ] **Step 4: Commit** `docs: the Day map starts from the Accommodation woken in; Wishlist ideas are near a Stop`.

---

## Once, at the end of the branch

`npm test`, `npm run build` (stop the dev server first), and `npm run test:integration` when the local database is up.
