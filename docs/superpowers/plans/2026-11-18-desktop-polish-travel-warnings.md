# Desktop Polish and Travel-time Warnings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 18 buildable Feedback notes of 2026-11-17: travel-time warnings that stop crying wolf (smarter walking, a Walk mode, a mode per hop, "Ends at", "This is fine"), a Day view that behaves on desktop, a Plan editor that reads well at 1920px, and a handful of desktop layout bugs.

**Architecture:** Travel-time rules stay pure in `lib/travel-times/hops.ts` and `lib/flags.ts`; the three new pieces of state (Item end pin, `HopMode`, `FlagDismissal`) land in one migration and are joined in the existing loaders (`lib/flags-loader.ts`, `lib/day-view-loader.ts`) so every surface reads the same answer. UI changes are gated at `lg` (1024px); the phone variants keep their markup and tests.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before using any Next API), React 19, Tailwind, Prisma 7 + Postgres (local docker only), Vitest + Testing Library, the in-repo MCP server under `lib/mcp/`.

**Spec:** `docs/specs/2026-11-18-desktop-polish-travel-warnings.md` — read the section named in each task before starting it. File references in the spec and here come from a read-only pass; re-read the file before changing it.

## Global Constraints

- Branch `feat/desktop-polish-travel-warnings`. One commit per task, path-scoped (`git add <your files>`, never `git add -A`): other tasks are being worked in the same checkout at the same time. Commit trailer exactly: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Where a task names a `Resolves-Feedback:` trailer, add it above the co-author line, one per id.
- Never run any `npm run feedback:*` script or `npm run travel-times:refresh`. Never read or load `.env.production.local`. Never connect to a non-localhost database. Never push. Never stage `AGENTS.md`. Never edit `docs/feedback/inbox.md`.
- No new dependencies.
- "Desktop" is `lg` (1024px) and up. Below `lg` every screen renders exactly as before unless the task says otherwise; each UI task keeps or adds a test proving the phone variant is unchanged.
- No em-dashes in Traveller-facing strings (`test/copy-style.test.ts`). Use the glossary words in `CONTEXT.md` (Traveller, Stop, Item / thing to do, Transport, Accommodation, Day view, Day strip, Day map, Flag, Travel time, Local travel mode, Hop mode, Ends at, Marked fine, Surprise).
- Default to zero comments; comment only a non-obvious why. No JSDoc on new code. No defensive checks for impossible cases. No features beyond the spec.
- `"use client"` modules export components only; pure helpers go in `lib/`. `react-hooks/set-state-in-effect` forbids useEffect + setState-from-props.
- A new server action must be added to the allowlist in `lib/server-action-exports.test.ts`.
- Anything that reads Items for display or for MCP must pass through the existing Surprise filters (`lib/surprise-visibility.ts`); a surprised viewer never receives a hidden Item's title, pins, Hop modes or Marked-fine rows.
- Verification per task (CLAUDE.md tiers): inner loop `TZ=UTC npx vitest run <test files>`; task done `TZ=UTC npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never run `npm test` or `npm run build` per task. A `tsc` error in a file another lane owns is not yours: re-run once, and if it persists report it rather than fixing it.

## Lanes

Tasks inside a lane run in order. Lanes run at the same time. Cross-lane waits are stated on the task.

| Lane | Tasks |
|---|---|
| A. Travel time | 1 → 2 → 3 → 4 → 5 → 6 |
| B. Day view | 7 → 8 → 9 → 10 → 11 → 12 |
| C. Visual | 13, then 14 |
| D. Plan editor | 15 → 16 → 17 → 18 → 19 |
| E. Elsewhere | 20 → 21 → 22 → 23, then 24 last of all |

## Review Focus

1. **An Item with an end pin but odd pins**: end pin identical to the start, an end pin with no start pin, or a Wishlist idea with an end pin. Expected: no route drawn, no hop measured from nowhere, no crash; the form still saves. Tests in Tasks 4 and 12.
2. **A Hop mode or Marked-fine row whose Items moved**: one Item deleted, moved to another day, or another Item inserted between them. Expected: the row stops applying silently, deletes cascade, nothing reads a dangling id. Tests in Tasks 5 and 6.
3. **A Marked-fine Flag after a small edit, and on an estimated hop**: retimed by one minute, or the hop has no stored Travel time yet and later gets one. Expected: it shows again in both cases (the fingerprint changed); marking it again replaces the old row. Tests in Task 6.
4. **Surprises through the new surfaces**: the "marked fine" list, the hop chooser, the Calendar's named things, `get_flags.markedFine`, the Day map dialog's list, and the Day view's surprise line must never carry a hidden Item's title or place to the surprised viewer. Tests in Tasks 5, 6, 10, 11 and 23.
5. **Edges of the layouts**: a one-day Trip and the first and last day in the centred Day strip; exactly 1024px and 1279px for the Day header; a month with no things and a day with seven in the Calendar; a zero-decimal currency and a 12-digit amount in Next payment. Tests in Tasks 7, 9, 21 and 23.

---

## Lane A: travel time

### Task 1: One migration for the three new pieces of state

**Spec:** T3, T4, T5. **Files:** Modify `prisma/schema.prisma`; Create one migration under `prisma/migrations/` named `20261118120000_hop_mode_ends_at_marked_fine` (follow the newest existing migration for how they are generated against the local docker database).

**Interfaces — Produces:**
- `Item.endAddress String?`, `Item.endLat Float?`, `Item.endLng Float?`, `Item.endPlaceId String?`.
- `model HopMode { id String @id @default(cuid()); tripId; fromItemId; toItemId; mode String; setById; createdAt; updatedAt; @@unique([fromItemId, toItemId]); @@index([tripId]) }` with `onDelete: Cascade` relations to Trip, both Items and User. `mode` is `"WALK" | "TRANSIT" | "DRIVE"`.
- `model FlagDismissal { id; tripId; flagId String; fingerprint String; markedById; createdAt; @@unique([tripId, flagId]) }`, cascade on Trip and User.

- [ ] **Step 1:** Add the fields and models; generate the migration against the local database; `npx prisma generate`.
- [ ] **Step 2:** If the repo has a schema or migration test (search `prisma` under `test/` and `lib/`), run it. `npx tsc --noEmit`.
- [ ] **Step 3:** Commit `feat(db): an end pin on Items, Hop modes and Marked-fine rows`.

### Task 2: Walk when walking is about as quick

**Spec:** T1. **Files:** Modify `lib/travel-times/hops.ts`; Test `lib/travel-times/hops.test.ts`.

**Interfaces — Produces:** exported constants `WALK_ROW_UNDER_KM = 3`, `MAX_REAL_WALK_MIN = 20` (unchanged), `WALK_ABOUT_AS_QUICK_MIN = 5`.

- [ ] **Step 1: Failing tests** (file's existing fixtures): `walks a 22 min hop when public transport takes 20` (resolved mode WALK, 22 min); `walks a 20 min hop when public transport takes 32`; `takes public transport when the walk is 31 and transit 22`; `still walks a 20 min hop with no local row`; `wants a WALK key for a hop 2.6 km apart` and `wants none at 3.1 km` (`hopKeys`).
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** In `resolveHop`, a stored OK walk wins when `walk.minutes <= MAX_REAL_WALK_MIN || (local && walk.minutes <= local.minutes + WALK_ABOUT_AS_QUICK_MIN)`. Raise `WALK_ROW_UNDER_KM` to 3.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(travel-times): walk a hop when walking is about as quick`.

### Task 3: Walk as a Local travel mode

**Spec:** T2. **Files:** Modify `lib/validations/stop.ts`, `lib/travel-times/hops.ts`, `components/trip/stop-form-dialog.tsx`, `server/actions/stops.ts` (only if it narrows the type), `lib/mcp/tools/trips-stops-write.ts`, `lib/mcp/reads/plan-shapes.ts`; Tests beside each that has one.

**Interfaces — Produces:** local mode type `"DRIVE" | "TRANSIT" | "WALK"`; constant `WALK_STOP_MAX_MIN = 30` in `hops.ts`; MCP `set_local_travel_mode` accepts `"walk"`.

- [ ] **Step 1: Failing tests.** `hops.test.ts`: at a WALK Stop, `walks a 28 min hop`, `takes public transport for a 34 min walk` (resolved TRANSIT), `wants a TRANSIT key as well as WALK` (`hopKeys`), `effectiveLocalMode returns WALK when the Stop says so`. Validation test: `"WALK"` accepted, `"BIKE"` rejected. MCP test: `walk` stores `"WALK"` and reads back `walk`.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement. In `resolveHop` the WALK-Stop rule is: stored walk `<= WALK_STOP_MAX_MIN` wins; otherwise resolve exactly as a TRANSIT Stop (including Task 2's rule). Form: fourth option "Walk" with helper "Walk anything up to 30 minutes, public transport beyond."; the "Automatic (…)" label is unchanged.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(travel-times): Walk as a Stop's way of getting about` with `Resolves-Feedback: cmwkj3pnm000i08l9taojobzc`.

### Task 4: Ends at

**Spec:** T4 (all but the Day map drawing, which is Task 12). **Files:** Modify `lib/travel-times/hops.ts`, `lib/flags.ts` (`FlagItem`), `lib/flags-loader.ts`, `lib/day-view-loader.ts`, the Item validation and server action (`server/actions/items.ts` and its schema), `components/trip/item-form-dialog.tsx`, MCP item tools and read shapes under `lib/mcp/`; Tests beside each.

**Interfaces — Produces:**
- `FlagItem.endLat?: number | null`, `FlagItem.endLng?: number | null`.
- `departurePoint(item: { lat; lng; endLat?; endLng? }): { lat: number; lng: number } | null` exported from `hops.ts`: the end pin when both end coordinates are set, else the pin. Every hop's origin uses it; every hop's destination keeps using `lat`/`lng`.
- `itemRouteKey(item): string | null` exported from `hops.ts`: the WALK travel-time key from pin to end pin, or null when there is no end pin, no start pin, or the two are the same point. The refresh (`lib/travel-times/refresh.ts`) wants this key whatever the distance.
- Item form field name `endAddress` plus hidden `endLat`, `endLng`, `endPlaceId`, using the same place picker as `address`; label "Ends at (optional)", helper "For a walk or wander that finishes somewhere else."
- MCP `add_thing_to_do` / `update_thing_to_do` accept `endsAt: string | null` (geocoded exactly as `address` is); item reads return `endsAt: { address, lat, lng } | null`.

- [ ] **Step 1: Failing tests.** `hops.test.ts`: `measures the next hop from where the thing Ends at` (item A pinned at Tower Bridge 51.5055,-0.0754 with end 51.5008,-0.1220; B at 51.5007,-0.1246: the hop key's origin is A's end pin); `measures the hop into it to its start pin`; `itemRouteKey is null when the end equals the start`, `…when there is no start pin`; `wants the route key at 4 km`. `flags.test.ts`: the Tower Bridge pair with a 5 min gap raises no tight Flag when the stored walk from the end pin is 3 min. Action test: saving with an end address stores all four fields; clearing the address nulls all four. MCP test: `endsAt: null` clears.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement. The geographic-spread Flag keeps using start pins only.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(items): a thing to do can end somewhere else`.

### Task 5: Hop mode

**Spec:** T3. **Files:** Create `lib/hop-modes.ts`, `server/actions/hop-modes.ts`, `components/trip/day/hop-mode-chooser.tsx`; Modify `lib/travel-times/hops.ts`, `lib/travel-times/refresh.ts`, `lib/flags-loader.ts`, `lib/day-view-loader.ts`, `components/trip/day-feasibility.tsx`, MCP tools and read shapes, `lib/server-action-exports.test.ts`; Tests beside each.

**Interfaces — Produces:**
- `type HopModeChoice = "WALK" | "TRANSIT" | "DRIVE"`; `hopModeKey(fromItemId: string, toItemId: string): string` and `loadHopModes(tripId: string): Promise<Map<string, HopModeChoice>>` in `lib/hop-modes.ts`.
- `resolveHop` and `hopKeys` take an optional `forced?: HopModeChoice`: when set, the hop resolves to the stored row for that mode whatever its length, else that mode's estimate (marked estimated); `hopKeys` returns exactly that mode's key.
- `TravelOpts.hopModes?: Map<string, HopModeChoice>` so `flagTightConnections` and the Day view read the same choice.
- `setHopMode(fromItemId: string, toItemId: string, mode: HopModeChoice | null): Promise<ActionResult>`: both Items must be on the same Trip, real plan, and visible to the caller; `null` deletes the row; revalidates the plan.
- Each hop the Day view hands to `day-feasibility.tsx` carries `fromItemId`, `toItemId`, `mode`, `modeSetByHand: boolean`.
- MCP `set_hop_mode({ fromItemId, toItemId, mode: "walk" | "public_transport" | "drive" | "automatic" })`; day reads' `hops` gain `mode` and `setByHand`.

- [ ] **Step 1: Failing tests.** `hops.test.ts`: `a forced walk uses the 118 min walk row over a 25 min transit row`; `a forced walk with no row is an estimated walk`; `hopKeys with forced WALK wants only the WALK key at 9 km`. `flags.test.ts`: a pair with a 30 min gap and forced WALK of 118 min raises a warning quoting the walk. Action tests: sets, replaces, clears with null; refuses Items on different Trips; refuses a caller for whom either Item is a hidden Surprise. A row whose Items are no longer consecutive changes nothing in `detectFlags`. Component test: the chooser shows the four options, marks the current one, and calls `setHopMode` with null for Automatic.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement. The chooser is a small select-style menu on each "Getting around" row, labelled by the current mode; no chooser on a hop the viewer cannot fully see.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(travel-times): choose how one hop is travelled`.

### Task 6: Marked fine

**Spec:** T5. **Files:** Create `lib/flag-dismissals.ts`, `server/actions/flag-dismissals.ts`, `components/trip/marked-fine.tsx`; Modify `lib/flags.ts`, `lib/flags-loader.ts`, `lib/day-view-loader.ts`, `components/trip/day-feasibility.tsx`, `components/trip/flag-list.tsx`, `lib/mcp/tools/reads.ts` plus a write tool file, `lib/server-action-exports.test.ts`; Tests beside each.

**Interfaces — Produces:**
- `Flag.fingerprint?: string`, set only by `flagTightConnections`: `tightFingerprint(prev, next, minutes)` joins both Items' date, startTime, endTime, lat, lng, endLat, endLng and `Math.round(minutes / 5) * 5` (the string `"est"` when the hop is estimated).
- `applyMarkedFine(flags: Flag[], rows: { flagId: string; fingerprint: string; markedByName: string; createdAt: Date }[]): { shown: Flag[]; markedFine: (Flag & { markedByName: string; markedAt: Date })[] }` in `lib/flag-dismissals.ts`. A row applies only when `flagId` and `fingerprint` both match a current Flag.
- `detectFlags` output and the Day view's tight list are both passed through `applyMarkedFine` in their loaders; the nav count, Home Next steps, Reviews, Compare and `get_flags` therefore count only `shown`.
- `markFlagFine(tripId: string, flagId: string): Promise<ActionResult>` (upserts with the Flag's current fingerprint; refuses any flagId not starting `tight-`; refuses a Flag the caller cannot see) and `unmarkFlagFine(tripId, flagId)`.
- MCP `mark_flag_fine({ tripId, flagId })`, `unmark_flag_fine`; `get_flags` returns each tight Flag's `flagId` and a `markedFine: { flagId, detail, by, at }[]` list.

- [ ] **Step 1: Failing tests.** `flag-dismissals.test.ts`: a matching row moves the Flag to `markedFine`; `retiming the next Item by one minute shows it again`; `an estimated hop that later gets a 12 min row shows again`; a row for a Flag that no longer fires is ignored. Action tests: marks, re-marks (replaces fingerprint), unmarks; refuses `packed-…`; refuses when either Item is a hidden Surprise for the caller. Loader test: Summary count drops by one when a tight Flag is Marked fine. Component tests: "This is fine" on a tight row calls the action; marked rows collapse to "1 marked fine" / "2 marked fine", expanding shows "Marked fine by Xanthia" and "Undo". MCP test: `markedFine` omits rows about a Surprise hidden from the caller.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement. Button copy "This is fine"; collapsed line "N marked fine"; expanded row "Marked fine by {name}" with "Undo".
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(flags): mark a travel-time warning as fine` with `Resolves-Feedback: cmwkj1hyc000e08l9ce0fvwql`.

---

## Lane B: Day view

### Task 7: The header never overlaps the date

**Spec:** D3. **Files:** Modify `components/trip/day/day-header.tsx` (and `app/(app)/trips/[tripId]/day/[date]/page.tsx` only if the "Add to this day" pill must move); Test `components/trip/day/day-header.test.tsx`.

- [ ] **Step 1: Failing test:** between `lg` and `xl` the right cluster (Share, bell, avatars, Add) renders in the upper row beside the switcher pills, not in the date row; from `xl` it stays in the date row. Assert by the class contract the file uses (`lg:` / `xl:` variants on named test ids), and that the date heading's row has only the arrows and date below `xl`.
- [ ] **Step 2:** Run; expect failure.
- [ ] **Step 3:** Implement: below `xl` the date row is arrows + date only, centred; the cluster joins the `xl:hidden` pill row, right-aligned, and wraps under it if it must. No absolute positioning.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `fix(day): the header's controls no longer sit over the date` with `Resolves-Feedback: cmwkhsiel000108jwr67q25xw`.

### Task 8: Desktop shows one day, scrolls with the page, sticky right column

**Spec:** D1. **Files:** Modify `components/trip/day/day-carousel.tsx`, `components/trip/day/day-plan-card.tsx`, `app/(app)/trips/[tripId]/day/[date]/page.tsx`, `docs/adr/0065-*.md`; Tests beside the components.

**Interfaces — Produces:** from `lg` up `DayCarousel` renders only the shown day's panel in a plain block (no `overflow-x`, no snap, no neighbour panels, no wheel or trackpad listener). The right column wrapper has `lg:sticky lg:top-<header offset> lg:self-start`.

- [ ] **Step 1: Failing tests:** on desktop (the file's existing matchMedia helper) the carousel renders one panel and no element with `overflow-x-auto`; a horizontal wheel event does not call `router.push`; `DayPlanCard` has no `max-h` / `overflow-y-auto` class at `lg`; the phone variant still renders three panels with snap.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement. Choose desktop vs phone without a layout flash on first paint (CSS-gated markup, or the hook the file already uses). Append an "Amended 2026-11-18" section to ADR 0065: the three-panel carousel is the phone and tablet behaviour; desktop shows one day and crossfades.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(day): on a wide screen the day scrolls with the page` with `Resolves-Feedback: cmwkhwenq000308jqhm1vhozr`.

### Task 9: The Day strip is the carousel

**Spec:** D2. **Files:** Modify `components/trip/day/day-strip.tsx`, `components/trip/day/strip-scroll.ts`, `app/globals.css` (day transition), `components/trip/day/day-carousel.tsx` (only the transition hook); Tests `day-strip.test.tsx`, `strip-scroll.test.ts`.

**Interfaces — Produces:** `centredScrollLeft(index: number, chipWidth: number, gap: number, viewportWidth: number): number` in `strip-scroll.ts` (the scroll offset that puts chip `index` at the centre; the strip has `(viewportWidth - chipWidth) / 2` of padding at each end so index 0 and the last index can centre).

- [ ] **Step 1: Failing tests:** `centredScrollLeft(0, 56, 8, 900) === 0`; `centredScrollLeft(3, 56, 8, 900) === 192`; desktop strip: the highlight element has no per-index `translateX` and sits at the centre; the lit chip has no background transition class; prev/next buttons exist with accessible names "Previous day" / "Next day", the first is disabled on day 1 and the second on the last day; a one-day Trip renders one centred chip and both buttons disabled. Phone strip snapshot unchanged.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement: one 250 ms scroll tween on desktop; day content crossfades in about 150 ms (replace the page-turn view transition for desktop day changes); nothing animates under `prefers-reduced-motion`. The tapped chip still lights at once (ADR 0063).
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(day): the day strip slides under a fixed highlight` with `Resolves-Feedback: cmwkhuwmq000208jq3r8l7znl`.

### Task 10: The Day map opens over the page

**Spec:** D4. **Files:** Create `components/trip/day/day-map-dialog.tsx`; Modify `components/trip/day/day-plan-card.tsx`, `components/trip/day-map-panel.tsx` (retire the inline toggle), `components/trip/day-map.tsx` (accept a fill-height variant and a highlighted pin), Home links that point at the Day map (`components/trip/home/**` quick action and Travelling tile), `CONTEXT.md` is already updated; remove the entry at `docs/open.md:19`; Tests beside each.

**Interfaces — Produces:** `<DayMapDialog open onOpenChange day=… />`: desktop `DialogContent size="full"` with the map left and an ordered list of the day's located things right (clicking one sets `highlightId` on the map); below `lg` a full-screen `Sheet` with the map and the "Open today's route in Google Maps / Apple Maps" links at the bottom. Opens when the URL has `?map=1`. `DayMap` gains `highlightId?: string` and `fill?: boolean`.

- [ ] **Step 1: Failing tests:** the Day plan header shows a "Day map" button only when the day has a located entry; pressing it opens the dialog; `?map=1` opens it on load; the inline "Show day map" toggle is gone; the list omits anything hidden from the viewer as a Surprise; Home's Day map action links to `…/day/<date>?map=1`; offline the loader's fail-soft message shows (existing `lazy-loader` test pattern).
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement with `createMapLoader` / `useMapMount`; reuse `PlanMapDialog`'s sizing.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(day): the Day map opens in a dialog, full screen on a phone` with `Resolves-Feedback: cmwkhtgwu000007lbcwitlfmi`.

### Task 11: The Day view says when a day is a surprise

**Spec:** D7. **Wait for:** Task 6 (shares `lib/day-view-loader.ts`). **Files:** Modify `lib/day-reads.ts` and/or `lib/day-view-loader.ts`, `components/trip/day/day-plan-card.tsx`, `app/(app)/trips/[tripId]/day/[date]/page.tsx`; Tests beside each.

**Interfaces — Produces:** the day view model gains `surprise: { plannedByName: string; whole: boolean } | null`, set only for a viewer the Surprise is for: `whole` is true when the day's only Stop is the hidden one, false on a Changeover day shared with a visible Stop.

- [ ] **Step 1: Failing tests.** Loader: a day inside a Stop that is a Surprise for the viewer → `{ plannedByName: "Xanthia", whole: true }`; the Changeover day → `whole: false`; the planner viewing the same day → `null`; nothing else about the hidden Stop appears in the model. Components: `whole` renders `SurpriseShell` in place of the Timeline and no "Add to this day"; not-whole renders the Timeline then "The rest of today is a surprise, planned by Xanthia."
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement, reusing `SurpriseShell` from `components/plan/stop-open-body.tsx` (move it to a shared file if it is not exported).
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(day): a surprise day says it is one` with `Resolves-Feedback: cmwki3exb000608k172o0b8qv`.

### Task 12: The Day map draws a thing that Ends at somewhere else

**Spec:** T4 (Day map bullet). **Wait for:** Tasks 4 and 10. **Files:** Modify `components/trip/day-map.tsx`, the loader that feeds it (`lib/day-view-loader.ts` or the map's own read), Tests beside each.

**Interfaces — Consumes:** `itemRouteKey`, `departurePoint` (Task 4). **Produces:** each map entry may carry `end: { lat, lng } | null` and `routePolyline: string | null`.

- [ ] **Step 1: Failing tests:** an Item with an end pin and a stored WALK row yields an entry with `end` and that row's polyline; with no row yet, `routePolyline` is null and the map draws a straight dashed segment; an Item whose end equals its start yields `end: null`; the outgoing hop line starts at the end pin; the route uses the Item's Category colour and a different stroke style from hop lines.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement: a second, smaller pin at the end; the route as a solid thick line in the Category colour; hops keep their current style.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(day-map): draw a walk from where it starts to where it ends`.

---

## Lane C: visual

### Task 13: Weather scenes

**Spec:** D5. Use the **frontend-design** skill. **Files:** Modify `components/weather/scenes.tsx`, `components/weather/WeatherCard.tsx`, `components/trip/day/weather-strip.tsx` (only if it draws scenes itself), `app/globals.css` (the `wx-*` keyframes), `lib/weather/theme.ts` (sky bands per variant); Create `components/weather/daylight-arc.tsx`, `lib/weather/scene-math.ts`; Delete `components/trip/weather-daylight-card.tsx` if nothing imports it; Tests beside each.

**Interfaces — Produces:**
- `rainAngleDeg(gustsKph: number | null): number` in `scene-math.ts`: 0 for null or under 15, rising linearly to 30 at 60 and capped there.
- `sunArcPosition(sunrise: Date, sunset: Date, now: Date): number | null`: 0 at sunrise, 1 at sunset, null outside.
- `<DaylightArc sunrise sunset now? />`: the arc, both times as text, and a sun marker only when `now` is given and inside the day.
- `skyBands(variant, isDay): string[]` in `theme.ts`: two or three palette tokens per variant.

- [ ] **Step 1: Failing tests:** `rainAngleDeg(null) === 0`, `(10) === 0`, `(60) === 30`, `(90) === 30`; `sunArcPosition` at sunrise 0, midpoint 0.5, after sunset null; every variant in `theme.ts` has sky bands for day and for night; each variant's scene renders an `<svg>` with at least two layers and `aria-hidden`; `DaylightArc` shows no marker without `now`; stale / "too far" still hide the scene; the card keeps `h-[236px]` and `h-[140px]`.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Draw all eleven scenes per the spec, in the site's language: palette tokens only, crisp edges, the cards' dark outline, flat sky bands, no blur or glow. Snow, overcast, rain and fog first and best. All motion in CSS keyframes, all inside the existing reduced-motion guard.
- [ ] **Step 4:** Tests pass; task-done verification; `npx knip` shows no new unused export.
- [ ] **Step 5:** Commit `feat(weather): layered scenes and a daylight arc` with `Resolves-Feedback: cmwkhrt0i000008jwipfxlc46`.

### Task 14: Stay cards

**Spec:** D6. **Files:** Create `components/trip/stay-card.tsx`; Modify `components/trip/day/tonight-card.tsx`, `components/trip/timeline.tsx` (`STAY_TILE_LARGE` and its two uses), `components/trip/home/**/phase-travelling.tsx` ("Tonight's stay"); Tests beside each.

**Interfaces — Produces:** `<StayCard label icon name children />`: a card with a solid `bg-lilac text-on-accent` band holding the icon and label, and a body on `bg-hue-lilac/25` with normal text colour; `name` renders large and bold. `<StayConfirmation value />`: the confirmation number in mono on its own line.

- [ ] **Step 1: Failing tests:** the Tonight card, a check-in tile, a check-out tile and Home's Tonight's stay each render a `StayCard` with the right label ("Tonight", "Check-in", "Check-out", "Tonight's stay"); none has `bg-lilac` on its body; the confirmation renders in `StayConfirmation`; the read-only details sheet and every existing action on these cards still work (keep their existing tests green).
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement; check both themes' tokens in `app/globals.css` for the wash and band.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(stays): a lilac band over a light card, so the name reads` with `Resolves-Feedback: cmwki9yiu000107lbnkbxyp1m`.

---

## Lane D: Plan editor

### Task 15: Add cards

**Spec:** P1. **Files:** Create `components/plan/add-card.tsx`; Modify `components/plan/day-section.tsx`, `components/plan/stay-panel.tsx` (only the two add links), `components/plan/ideas-box.tsx`, `components/trip/itinerary-manager.tsx` (wire Transport and Reminder from the day menu); Tests beside each.

**Interfaces — Produces:** `<AddCard label onClick />`: a full-width dashed-border button the height of an Item row, desktop only (`hidden lg:flex`); the existing text links get `lg:hidden`. The day's AddCard opens a menu with "Something to do", "Transport", "Reminder", each preset to that day (and Stop).

- [ ] **Step 1: Failing tests:** a day renders an AddCard labelled "Add to Fri 11" (the file's date format) and its menu offers the three kinds; choosing Reminder opens `AddReminderDialog` with the Stop and date preset; choosing Transport opens the Transport form; the stay panel and ideas box render AddCards "Add a stay" / "Add another place" / "Add an idea"; the old links are still in the markup with `lg:hidden`; a Stop that is a Surprise for the viewer shows none.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement, reusing `components/day/day-add-menu.tsx` where it fits.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(plan): adding to a day is a card, not a footnote`.

### Task 16: Where you're staying

**Spec:** P2. **Wait for:** Task 14. **Files:** Modify `components/plan/stay-panel.tsx` (`StayBlock`); Test `components/plan/stay-panel.test.tsx`.

**Interfaces — Consumes:** `StayCard`, `StayConfirmation` (Task 14).

- [ ] **Step 1: Failing tests:** on desktop a `StayBlock` renders a `StayCard` with three labelled blocks, "When", "Where", "Booking", holding respectively dates/times/nights, address + map link, and confirmation/Booking state/cost/Paid; notes, file count and the booking-confirmation marker render after them; a stay with only a name renders the card and no empty block headings; the phone markup is unchanged.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement; blocks sit side by side and stack via the panel's existing container query.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(plan): where you're staying reads as a card` with `Resolves-Feedback: cmwkhyxur000008k1enr83o50`.

### Task 17: Fit tile

**Spec:** P3. **Files:** Modify `lib/plan-overview.ts`, `lib/plan/plan-model.ts` (only if the state lives there), `components/plan/fit-tile.tsx`, `app/(app)/trips/[tripId]/plan/page.tsx`, `PLAN.md` §6.2; Tests beside each.

**Interfaces — Produces:** `showFitTile(overview): boolean` in `lib/plan-overview.ts`: false only when every Stop is Scheduled and slack `>= 0`; true for any Rough Stop, any overrun, and the "unset" and "dormant" states. The bar's `overPct` is 0 unless the state is "over".

- [ ] **Step 1: Failing tests:** `showFitTile` false for all-scheduled with slack 0 and with slack 3; true with one Rough Stop at slack 0; true at slack −1; true when unset; a Trip whose earliest arrive precedes its start date and fits has `overPct === 0`; the "over" segment is `h-full` inside the bar's box (no negative margin class).
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement; derive the bar from the same projected end and deadline as the state.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `fix(plan): the fit tile hides when there is nothing left to check` with `Resolves-Feedback: cmwkhzk4d000108k1buhyingt`.

### Task 18: Reminders can be edited and deleted where they are listed

**Spec:** P4. **Files:** Modify `components/trip/reminder-list.tsx`, `components/trip/add-reminder-dialog.tsx` (an edit mode), `components/trip/reminders-card.tsx`, `lib/reminder-reads.ts`; Tests beside each.

**Interfaces — Produces:** `AddReminderDialog` accepts `reminder?: { id; title; date; notes }`; when given, the title reads "Edit reminder" and saving calls `updateReminder`. `ReminderList` rows get "Edit" and "Delete" buttons (Delete confirms, then `deleteReminder`). Reads return past reminders too, flagged `past: true`, newest first, capped at 20, listed under an "Earlier" heading and dimmed.

- [ ] **Step 1: Failing tests:** a row's Delete confirms then calls `deleteReminder(id)`; Edit opens the dialog prefilled and saves through `updateReminder`; a reminder dated yesterday appears under "Earlier" with a Delete; a reminder about a Surprise hidden from the viewer is still absent; the Checklists card shows "Earlier" too.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(reminders): edit or delete one from wherever it is listed` with `Resolves-Feedback: cmwki0dss000208k1tqlmbq00`.

### Task 19: "Doesn't need one"

**Spec:** P5. **Files:** Modify `components/trip/booking-confirmation-marker.tsx`; Test beside it.

- [ ] **Step 1: Failing tests:** the marker reads "No booking confirmation yet" with a button "Doesn't need one" that has no `underline` class; pressing it calls `setNothingToAttach(kind, id, true)` and shows a toast with "Undo"; Undo calls `setNothingToAttach(kind, id, false)`.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement with the app's existing toast (about 6 s). The edit dialog's switch is untouched.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `fix(bookings): "Doesn't need one" says what it does, and can be undone` with `Resolves-Feedback: cmwki2fz3000508k1dh2yuo00`.

---

## Lane E: elsewhere

### Task 20: Trips carousel arrows

**Spec:** E1. **Files:** Modify `components/trips/trip-carousel.tsx`; Test `components/trips/trip-carousel.test.tsx`.

- [ ] **Step 1: Failing test:** with the track's `offsetLeft` 160 and cards at page offsets 160, 778, 1396 (so 0, 618, 1236 inside the track), "Next trips" from `scrollLeft` 0 scrolls to 618, again to 1236; "Previous trips" from 1236 scrolls to 618. Replace the existing mock that sets card offsets to 0/618 with this one. The disabled arrow has `aria-disabled` / `disabled` and a visibly muted but present style (not `text-border-soft`).
- [ ] **Step 2:** Run; expect failure.
- [ ] **Step 3:** Measure each card as `card.offsetLeft - track.offsetLeft`.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `fix(trips): the arrows move one trip at any width` with `Resolves-Feedback: cmwkhnqw0000008jq8bpbs717` and `Resolves-Feedback: cmwkhobht000108jqtc4jp242`.

### Task 21: Next payment fits

**Spec:** E2. **Files:** Modify `lib/money/money.ts`, `lib/money/upcoming-payments.ts`, `components/trip/home/desktop/trip-cost-tile.tsx`, `components/trip/upcoming-payments-card.tsx`; Tests beside each.

**Interfaces — Produces:** `CURRENCY_DECIMALS` gains `IDR: 0`, `JPY: 0`, `KRW: 0`, `VND: 0` (keep any already there). `paymentAmountParts(payment): { main: string; original: string | null }` in `upcoming-payments.ts` (`original` is null when the payment is already in the Trip currency); `paymentAmountLabel` stays for callers that want one string and is built from the parts.

- [ ] **Step 1: Failing tests:** `formatMoneyNarrow` of 1,000,000 IDR is "Rp 1,000,000" with no decimals; parts for a Rp 1,000,000 payment on an AUD Trip are a dollar `main` and `original` "Rp 1,000,000"; parts for an AUD payment have `original: null`; the desktop tile renders `main` at display size and `original` on its own smaller line beneath, in both the cover and no-cover variants, and neither element has a clipping `truncate` on the amount; a 12-digit amount wraps rather than clips (`break-words` or a size step-down class).
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement on the desktop tile and the phone card.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `fix(home): the next payment shows whole, original currency beneath` with `Resolves-Feedback: cmwkhozjr000008l4a9l2sh9z`.

### Task 22: Share-link fields

**Spec:** E3. **Files:** Modify `components/trip/settings/share-links-panel.tsx`, plus any other file the sweep finds; Test beside it.

- [ ] **Step 1: Failing test:** each of the panel's five label + input pairs is a `<Field>` (or has the 6px `gap-1.5`), none sits in `space-y-1`.
- [ ] **Step 2:** Run; expect failure.
- [ ] **Step 3:** Implement. Sweep: `grep -rn "<Input\|<Textarea\|<Select" components app` and check each parent's label spacing for anything tighter than 6px (`space-y-1`, `gap-1`, `mt-1`, `mb-1`, `space-y-0.5`); fix each the same way and list them in the commit body.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `fix(settings): the focus ring no longer covers a field's label` with `Resolves-Feedback: cmwkibgfe000207lbq61tyndj`.

### Task 23: Calendar month grid

**Spec:** E5. **Files:** Modify `components/trip/month-grid.tsx`, `components/trip/calendar-views.tsx` and the read that feeds the grid (pass each day's things: title, start time, Category); Create `lib/calendar/month-layout.ts`; Tests beside each.

**Interfaces — Produces:**
- `dayThings(things, max = 3): { shown: { id; label }[]; more: number }`: timed things first by start time, then untimed in sort order; `label` is "10:30 Louvre" or just the title.
- `stopBands(weekDays, stops): { stopId; name; startCol; span }[]` per week row: one band per Stop per row, name once per row.
- The grid's rows share one height: `grid-auto-rows: 1fr` on desktop, so every week is as tall as the month's tallest day; no fixed `h-24` at `lg`.

- [ ] **Step 1: Failing tests:** `dayThings` with seven things returns three and `more: 4`; with none returns `shown: []`, `more: 0`; `stopBands` for a week where Paris covers Mon to Wed and London Wed to Sun returns two bands with the right columns (the Changeover day belongs to the arriving Stop's band); a desktop cell renders the named things and "+4 more", keeps day number and icons in one non-wrapping row, and has no `overflow-hidden` fixed height; things hidden from the viewer as a Surprise are not named or counted; clicking a day still links to its Day view; the phone grid markup is unchanged.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement; band colours come from the existing Stop legend colours.
- [ ] **Step 4:** Tests pass; task-done verification.
- [ ] **Step 5:** Commit `feat(calendar): a month that shows what is on, in even rows`.

### Task 24: Bigger pills on desktop (last task of the branch)

**Spec:** E4. **Wait for:** every other task. **Files:** Modify `components/ui/badge.tsx`, plus whatever the sweep finds; Test `components/ui/badge.test.tsx`.

- [ ] **Step 1: Failing test:** the base Badge classes include `text-[10px]` and `lg:text-xs` and `lg:px-2.5`.
- [ ] **Step 2:** Run; expect failure.
- [ ] **Step 3:** Implement, then sweep every file that imports `Badge` or `badgeVariants` (about 35) for a desktop container that fixes a height or forbids wrapping around a Badge; fix those so nothing clips. List what was changed in the commit body.
- [ ] **Step 4:** Tests pass (`TZ=UTC npx vitest related --run components/ui/badge.tsx` covers the importers); task-done verification.
- [ ] **Step 5:** Commit `feat(ui): pills are readable on a wide screen` with `Resolves-Feedback: cmwkigdgs000407lbfsdcsv5m`.

---

## Once, at the end of the branch (orchestrator)

- [ ] `npm test`, `npm run build`, `npm run test:integration` (local DB up), `npx knip`, `npx eslint .`.
- [ ] Whole-branch review, then fix wave.
- [ ] Update `docs/open.md` with anything deliberately left.
