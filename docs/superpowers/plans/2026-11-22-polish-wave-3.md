# Polish Wave 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix the 17 nits, the 12 items carried over from the notes branch (N1 to N12) and the two leftovers of waves 1 and 2 that the 20 November polish audit lists for wave 3. N7 and N12 are not builds.

**Architecture:** Small, independent fixes in existing components, helpers and tokens. No schema change, no new dependency, no new route, no second `loading.tsx`. No shared primitive is needed first, so there is no Task 0. Six lanes (A to F) with no file in common run in parallel in one checkout. Lane G (G4, curly quotes) touches copy in many files, so it runs alone **after A to F are merged in the working tree**. Three orchestrator steps need a running server or a production build (N1 check, N4 measurement, N7). Lanes never do those.

**Tech Stack:** Next.js 16.4 (read `node_modules/next/dist/docs/` before using any Next API), React 19 with the React Compiler, Tailwind v4, Vitest.

**Spec:** `docs/specs/2026-11-22-polish-wave-3.md`. Symptoms in detail: `docs/audits/2026-11-20-polish-audit.md` (same ids; N1 to N12 are its "Carried over from the notes branch" bullets in order). Pictures: `.superpowers/polish/index.html` (local, not committed; real-trip data, never copy from it into a test). Day view design: `docs/specs/2026-11-19-nov-19-notes.md`, ADR 0063 (one `loading.tsx`), ADR 0065 (carousel, amended 2026-11-19), ADR 0072 (Surprise).

## Global Constraints

- Branch `chore/polish-wave-3`, one shared checkout. Commit only your own files: `git commit -m "..." -- <paths>`. Never `git add -A`, never stage `AGENTS.md`, never push, never switch branch.
- Never run `npm run feedback:*`, `npm test`, `npm run build`, `next start`, a dev server or anything that touches a database. Never call an `mcp__teepee__*` tool. Verification per task: `TZ=UTC npx vitest related --run <changed source files>`, `npx tsc --noEmit`, `npx eslint <changed files>`. A tsc error in a file you did not touch belongs to another lane: report it, do not fix it.
- Zero code comments unless the why is not obvious. No JSDoc. No features beyond the task. No refactors.
- Domain words are those of `CONTEXT.md` (Stop, Transport, Item is "a thing to do" in copy, Traveller, Globe, Review, Reminder). Copy uses sentence case, no em dashes, no exclamation marks. **Dialog titles are Title Case, as `COMPONENTS.md` says.**
- Tests: update the existing test that covers what you change and add one for each new behaviour named in the task. No test may contain real names, places or bookings.
- Commit subject style: `fix(area): what a Traveller now sees`. End every commit message with the two trailer lines given in your dispatch.
- Layout fixes must hold from 320 to 2560 px wide and in the dark theme; use existing tokens and utility classes, no literal colours. Public pages (landing, Terms, Privacy, share) stay light-only.
- Where a task changes code that an existing comment describes, correct that comment in the same edit so it does not lie.
- Nothing may reveal a Surprise Stop's or Surprise thing to do's hidden content: never add a field, tooltip or `title` that is not already rendered as text on that element.
- Combine `ROW_NAME_CLASS` or `STAY_NAME_CLASS` with other classes through `cn()`, never beside a `block` or other `display` class.
- The other lanes' edits are in the same checkout. `npx tsc --noEmit` may show errors in files you do not own while they work: report them, never fix them.

## Orchestrator steps (not lane work)

**Production builds load production secrets.** `next start` in the main checkout reads `.env.production.local`, which points at the production database. Every step below that says "production build" runs in a separate git worktree of this branch that has **no** `.env.production.local` (check with `ls .env.production.local` and expect "No such file"), against the local database, as the notes branch did. Never in the main checkout.

- **O-1 (N1 check, after Lane B is merged).** Dev server on port 3000 against the demo database, then from the main checkout: `LAYOUT_AUDIT_SETS=cls LAYOUT_AUDIT_ONLY="cls/home,cls/day" LAYOUT_AUDIT_OUT=<scratchpad>/w3-cls npx tsx scripts/layout-audit.ts` (the scratchpad's `audit.sh demo` wraps the same call). Read `<scratchpad>/w3-cls/cls.json`: for `home` and `day`, `throttled.cls` and `cls` must be 0. If either is not, each `largest[].sources[].sel` names the node that moved and `from`/`to` give its boxes: add a follow-up task that reserves that node's space, owned by whichever lane owns the file.
- **O-2 (N4 measurement, production build).** See Task D1 for the script and how to read it.
- **O-3 (N7 measurement).** See "Not built".

## Orchestrator rulings (these override any task text below; read them before your lane)

1. **N4 is not built.** The task that stops the Day strip and day arrows prefetching (Lane D, the N4 task) is skipped entirely: prefetching is part of what makes a day change fast, and it is not changed two weeks before the trip without a measurement. Leave every `prefetch` behaviour on the Day view exactly as it is.
2. **N8 is not built.** Do not edit `components/trip/day/day-carousel.tsx` for N8 or for any other reason in this wave; if another Lane D task needs that file, stop that task and report.
3. **S7:** build the padding task only. The Feedback button still covering the sunset time at 320 px is accepted and logged for the owner.
4. **Lane B may look in a browser** for the map attribution task and for N1 (a dev server runs on http://localhost:3000 against the demo database; sign in as in `scripts/layout-audit/run.ts`; `NODE_PATH=$PWD/node_modules npx tsx <script>` for Playwright scripts kept outside the repo). Google Maps may be over quota locally; if the map does not draw, do the attribution task from the DOM and say so.
5. **N1:** Lane B owns it, including the measurement the plan calls O-1: measure the layout shift on trip home and the Day view on the dev server before and after (the harness's CLS set, or a PerformanceObserver script), and report both numbers. If the fix would need a file outside Lane B, stop and report.
6. **N7 and N12 are not built.** O-2 and O-3 are not run.
7. Everything else under "Questions for the orchestrator" is built as the plan's task says.
8. Dialog titles are Title Case. Never call any `mcp__teepee__*` tool (they reach the owner's real production trip). On the Reviews page never click "Standard Review" or "Deep Review" in a browser.
9. The other lanes' edits are in the same checkout. `npx tsc --noEmit` may show errors in files you do not own while they work: report them, never fix them. Do not start, stop or restart the dev server.

## Lanes

Every path below is owned by exactly one lane. A lane may read any file but writes only its own.

| Lane | Area | Items | Files (source and test) |
|---|---|---|---|
| A | Shell and trip home | S5 (trip header, home header), S6, H7, S8 | `app/(app)/trips/[tripId]/layout.tsx`, `app/(app)/trips/[tripId]/layout.test.tsx`, `components/trip/home/desktop/home-header.tsx`, `components/trip/home/desktop/home-header.test.tsx`, `app/(app)/trips/[tripId]/page.tsx`, `app/(app)/trips/[tripId]/page.test.tsx`, `components/trip/home/phase-sketching.tsx`, `components/trip/home/phase-sketching.test.tsx`, `components/ui/empty-state.tsx`, new `components/ui/empty-state.test.tsx`, `lib/sort-these-out.ts`, `lib/sort-these-out.test.ts`, `components/whats-new/whats-new-card.tsx`, `components/whats-new/whats-new-card.test.tsx` (14) |
| B | Loading, Trips, maps, New trip, public pages | N1, N2, S7, H6, T2, L3 | `app/(app)/trips/loading.tsx`, `app/(app)/trips/loading.test.tsx`, `components/trips/trips-skeleton.tsx`, `lib/trips/trips-page-frame.ts`, `components/map/use-fit-bounds.ts`, `components/trip/route-map.tsx`, `components/trip/route-map.test.tsx`, `app/globals.css`, `app/globals.map-popup.test.ts`, `components/new-trip/step-actions.tsx`, `components/new-trip/step-from.test.tsx`, `components/legal/legal-page.tsx`, `components/legal/legal-page.test.tsx`, `app/landing/landing.tsx`, `app/landing/landing.test.tsx`, `app/landing/sample-cards.tsx`, `app/landing/sample-cards.test.tsx` (17) |
| C | Plan | N3, P6, P7, O8 (Delete stop focus), leftover (Add a stop Cancel) | `lib/dates.ts`, `lib/dates.test.ts`, `components/plan/mobile/mobile-stop-row.tsx`, `components/plan/mobile/mobile-stop-row.test.tsx`, `components/trip/itinerary-manager.tsx`, `components/trip/itinerary-manager.test.tsx`, `lib/plan/plan-model.ts`, `lib/plan/plan-model.test.ts`, `components/plan/mobile/add-stop-sheet.tsx`, `components/plan/mobile/add-stop-sheet.test.tsx`, `components/plan/stop-row.test.tsx`, `components/plan/stay-panel.test.tsx`, `components/plan/mobile/stop-sheet.test.tsx`, `components/plan/day-section.tsx`, `components/plan/day-section.test.tsx`, `components/plan/leg-pill.tsx`, `components/plan/leg-pill.test.tsx`, `lib/plan/leg-label.ts`, `lib/plan/leg-label.test.ts`, `components/trip/stop-deletion-preview.tsx`, `components/trip/delete-stop-dialog.tsx`, `components/trip/delete-stop-dialog.test.tsx`, `app/(app)/trips/[tripId]/plan/page.tsx`, `app/(app)/trips/[tripId]/plan/page.test.tsx` (24) |
| D | Day | N4 (day links), N6, N8, D7, S5 (Day header), O8 (Day map) | `components/trip/day/day-arrow.tsx`, `components/trip/day/day-strip.tsx`, `components/trip/day/day-strip.test.tsx`, `components/trip/day/__snapshots__/day-strip.test.tsx.snap`, `components/trip/day/day-header.tsx`, `components/trip/day/day-header.test.tsx`, `lib/day-view-loader.ts`, `lib/day-view-loader.test.ts`, `components/trip/day/day-carousel.tsx`, `components/trip/day/day-carousel.test.tsx`, `components/trip/day/day-plan-card.tsx`, `components/trip/day/day-plan-card.test.tsx`, `components/trip/day/journal-card.tsx`, `components/trip/day/journal-card.test.tsx`, `components/trip/day/day-map-dialog.tsx`, `components/trip/day/day-map-dialog.test.tsx`, `app/(app)/trips/[tripId]/day/page.test.tsx` (17) |
| E | Proxy, Reviews, Print, Money, Activity, Share | N9, N10, U4, M3, A1, leftover (share route card) | `proxy.ts`, `proxy.test.ts`, `proxy.route.test.ts`, `components/trip/reviews/review-run-panel.tsx`, `components/trip/reviews/review-run-panel.test.tsx`, `app/(app)/trips/[tripId]/print/page.tsx`, `app/(app)/trips/[tripId]/print/page.test.tsx`, `app/(app)/trips/[tripId]/budget/page.tsx`, `app/(app)/trips/[tripId]/budget/page.test.tsx`, `components/trip/activity-feed.tsx`, `components/trip/activity-feed.test.tsx`, `app/share/[token]/page.tsx`, `app/share/[token]/page.test.tsx`, `app/share/[token]/share-route-list.tsx`, `app/share/[token]/share-route-list.test.tsx` (15) |
| F | Dialogs, sheets and Reminders | O7, O8 (Globe filter, Reminders, More sheet, switcher), N5, N11 | `components/ui/dialog.tsx`, `components/ui/dialog.test.tsx`, `components/globe/marker-filters.tsx`, new `components/globe/marker-filters.test.tsx`, `components/trip/reminders-card.tsx`, `components/trip/reminders-card.test.tsx`, `CONTEXT.md`, `components/trip/mobile-tab-bar.tsx`, `components/trip/mobile-tab-bar.test.tsx`, `components/shell/trip-switcher.tsx`, `components/shell/trip-switcher.test.tsx` (11) |
| G | Copy (runs alone, **after A to F are merged**) | G4 | Every non-test `.ts`/`.tsx` file under `app/` and `components/` that its script changes, plus every test that asserts a string it changes. It may touch files of A to F only because they have finished. |

The decisions ledger `docs/audits/2026-11-20-polish-decisions.md` is written by the orchestrator only (last section); no lane edits it.

**No-overlap check.** The result is recorded at the end of this plan. If a test you need to touch is not in your lane's list, stop and report it rather than editing it.

## Review Focus

1. **The Day view (N4, N8, D7, Day header).** On a phone a swipe, the date's arrows, a strip chip, ← and → still change day and the URL; the body does not jump when a day's header swaps (correction still happens on a day change when scrolled into the header). On desktop, dragging the window across 1024 px leaves the page where it was. An empty day says "Nothing planned" once; the header's Day map and count drop to a second line on a 320 px phone instead of squeezing "Day plan".
2. **Every dialog and sheet (O7).** The header is shorter (min 48 px): at 320 px and on desktop the Close button never overlaps the title or the first field, a two-line title still clears Close, the keyboard-open slim header is unchanged, and the footer still sticks with its buttons reachable. Delete stop keeps focus on Cancel after its preview loads, with the app's ring.
3. **Loading a trip page (N1, N2).** A cold or throttled load of any trip page shows the spinning logo, then the page, with nothing moving; `/trips` still shows its own skeleton, now with the title on the same line as the page's.
4. **Surprise.** A surprised Traveller's Surprise day has no "Add a title" (and a visible Stop's existing title on a Changeover day still shows); a Reminder about a Surprise stays hidden after N5's pruning; nothing new in the past hero (H7) or What's new reveals anything.
5. **Copy (G4).** Only quote characters changed: no class name, URL, code string, test fixture or `lib/` text; Help's search still finds terms; the Day carousel's inline script and the Print page's `<style>` are untouched; eslint passes with the curly characters.

---

## Lane A: Shell and trip home

### Task A1 (S5, trip header and desktop home header): overlapping avatars keep both initials readable

**Files:** `app/(app)/trips/[tripId]/layout.tsx` (avatar stack :199-206), `components/trip/home/desktop/home-header.tsx` (:97-107), tests `app/(app)/trips/[tripId]/layout.test.tsx`, `components/trip/home/desktop/home-header.test.tsx`.

The layout stack is 32 px avatars at `-space-x-2` (8 px overlap) plus a 2 px ring, so the second avatar starts over the first's initials (an 11 px two-letter fallback spans about 9 to 23 px of 32). The desktop home header is 40 px at `-space-x-2.5` with `border-2 border-border` and no ring. `TravellerAvatar`'s `ring` prop gives `ring-2 ring-background`.

- [ ] Layout: `flex -space-x-2` becomes `flex -space-x-1.5`; the `+N` bubble keeps its `ring-2 ring-background`.
- [ ] Home header: `flex -space-x-2.5` becomes `flex -space-x-1.5`; each `TravellerAvatar` gets `ring` (keep its `className="border-2 border-border"`); the `+N` span adds `ring-2 ring-background`.
- [ ] Tests: the layout's avatar row has `-space-x-1.5` and every avatar has `ring-2`; the home header's row has `-space-x-1.5`, its avatars `ring-2 ring-background`.
- [ ] Verify, commit `fix(shell): overlapping avatars no longer hide a Traveller's initials`.

### Task A2 (S6): a sketching trip's phone home names the trip twice, not three times

**Files:** `app/(app)/trips/[tripId]/layout.tsx` (h1 :168), test `app/(app)/trips/[tripId]/layout.test.tsx`.

There is no trip switcher in the phone top bar (the spec's "switcher" does not exist below md; see Questions). On a phone trip home the name shows in the layout's h1, then wherever the Phase's hero shows it. Only the Sketching phone home repeats it: its card heads with `tripName` (phase-sketching.tsx:79) and a stamp cover without a photo prints it again. Planning, Final prep and Travelling heroes do not show the name, so hiding the h1 there would leave no visible name; Past gets its name in Task A3. `TripHeaderFrame` carries `data-trip-home` on the home path; the layout already knows `tripPhase`.

- [ ] h1 className: add `tripPhase === "sketching" && "max-md:[[data-trip-home]_&]:sr-only"` through `cn()`. The h1 stays in the DOM (the page keeps one h1); the date line, avatars, share and bell stay visible.
- [ ] Tests: for a sketching trip the h1's class contains `max-md:[[data-trip-home]_&]:sr-only`; for a planning trip it does not.
- [ ] Verify, commit `fix(home): a sketching trip's phone home names the trip twice, not three times`.

### Task A3 (H7): a past trip's phone hero shows its title, and three smaller home fixes

**Files:** `app/(app)/trips/[tripId]/page.tsx` (`cover` :189-193), `components/trip/home/phase-sketching.tsx` (Route list :93-104), `components/ui/empty-state.tsx` (:34-35), `lib/sort-these-out.ts` (`stepRow` fallback :96), tests `app/(app)/trips/[tripId]/page.test.tsx`, `components/trip/home/phase-sketching.test.tsx`, new `components/ui/empty-state.test.tsx`, `lib/sort-these-out.test.ts`.

The phone band for Sketching and Past is `CoverArt` in a `TripCoverCard` (`relative overflow-hidden`, `canEdit: false` on Home): a photo, a route sketch or a stamp, with no title. The sketching route rows are `flex flex-wrap` so name, nights and country start at different x. `EmptyState`'s description has no `text-balance`. On desktop a warning step falls through `stepRow` to `tone: "stone"` (grey) while the phone Next steps card uses `bg-warning` (yellow); `--warning` and `--sun` are the same colour in both themes.

- [ ] Past band: when `phase === "past"`, the `cover` card also renders `<p className="absolute bottom-3 left-3 z-10 line-clamp-2 max-w-[calc(100%-1.5rem)] break-words rounded-full border-2 border-border bg-card px-3 py-1 font-display text-lg font-extrabold leading-tight text-foreground">{trip.name}</p>` after `CoverArt`. Other phases unchanged.
- [ ] Sketching route row: `li` becomes `grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5`; name span adds `min-w-0 break-words`; nights span adds `text-right tabular-nums`; country and chapter chip move into one `col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1` row, rendered only when either exists.
- [ ] `EmptyState`: title `h3` and description `p` add `text-balance`.
- [ ] `stepRow` fallback: `return { ...base, tone: step.severity === "warning" ? "sun" : "stone", icon: "circle-alert" };`.
- [ ] Tests: a past trip's page renders the name inside the cover card (the planning page does not); a sketching route row is a grid whose nights cell has `text-right`; `EmptyState`'s description has `text-balance`; a warning step's sort row has tone `sun`, an info step `stone` (update the warning row's expectation at sort-these-out.test.ts:44 from `stone` to `sun`).
- [ ] Verify, commit `fix(home): a past trip's phone hero shows its title, and the home's smaller rough edges are gone`.

### Task A4 (S8): What's new shows a count badge, not a stray dot

**Files:** `components/whats-new/whats-new-card.tsx` (heading row :70-75, list :77-91), test `components/whats-new/whats-new-card.test.tsx`.

The only dot near the trip header is the card's list bullet: a `·` in `text-primary` before each note (the S8 screenshot shows it). The notification bell's count is `grid h-5 min-w-5 place-items-center rounded-full border-2 border-border bg-coral px-1 text-[11px] font-extrabold leading-none text-on-accent` (notification-bell.tsx:83, minus its absolute offsets).

- [ ] After the `h2`, render `<span aria-hidden="true" className="grid h-5 min-w-5 place-items-center rounded-full border-2 border-border bg-coral px-1 text-[11px] font-extrabold leading-none text-on-accent">{totalUnread}</span>`.
- [ ] Remove the `·` span; each `li` becomes `text-sm text-foreground` (the inner span's class goes with it); `ul` `space-y-1.5` becomes `space-y-2`.
- [ ] Tests: the card shows a badge with `totalUnread` and `bg-coral`; no `·` text is rendered; existing note-list tests still pass.
- [ ] Verify, commit `fix(home): What's new shows a count badge, not a stray dot`.

## Lane B: Loading, Trips, maps, New trip, public pages

### Task B1 (N1): a trip page no longer jumps when it finishes loading

**Files:** `app/(app)/trips/loading.tsx`, test `app/(app)/trips/loading.test.tsx`.

Mechanism (from the 19 Nov measurement in the scratchpad's `polish-audit/real/cls.json`): the one shift on the Day view is `[data-testid="app-main"] > div.w-full` (the `SectionTransition` wrapper) moving from x 16, y 89, 370 × 524 to x 0, y 57, 402 × 817. While the `/trips` loading boundary shows `LogoLoader` (`min-h-[60dvh]` = 524 px at 874 px tall), `<main>` keeps its `px-4 pt-8`; when the trip shell streams in, `has-[[data-trip-shell]]:p-0` drops that padding (16 px, 32 px) and the whole body moves. The Day view loads slowly enough to show the loader on every load; trip home does on a throttled demo load. `TripsSkeleton` already carries `data-trips-shell` for the same reason (I3). The 0.055 on trip home is expected to be this shift too; Orchestrator step O-1 confirms it.

- [ ] Non-`/trips` branch returns `<div data-trip-shell><LogoLoader /></div>`. Everything under this boundary except `/trips` is a trip page (New trip lives in `(focus)`), so `<main>` is padding-free before and after.
- [ ] Test: on `/trips/abc`, `/trips/abc/plan` and `/trips/abc/day`, the root element has `data-trip-shell`, there is still no `[data-trips-shell]`, and the status still reads "Loading".
- [ ] Verify, commit `fix(trips): a trip page no longer jumps when it finishes loading`.

### Task B2 (N2): the Trips skeleton sits where the page will

**Files:** `components/trips/trips-skeleton.tsx` (header :16-19), test `app/(app)/trips/loading.test.tsx`.

The real `TripsHeader` is `flex items-end gap-4`: on a phone the round New trip button is 44 px tall, so the 33.6 px h1 sits at its foot, about 10.4 px down. The skeleton's h1 is a block with `mt-1` (4 px): 6.4 px high. From md the real left column is the h1 plus `mt-1.5` and a 15 px meta line, beside the 44 px New trip pill; the skeleton's bar is `mt-2 h-3.5` (6 px shorter). The dots row stays as it is.

- [ ] Header becomes `<header className="flex items-end gap-4 pr-[18px] md:pr-10">` holding `<div className="min-w-0 flex-1">` (the h1 without `mt-1`, then `<div className="mt-1.5 hidden h-[1lh] items-center text-[15px] font-semibold md:flex"><Skeleton className="h-3.5 w-36" /></div>`) and `<div aria-hidden="true" className="size-11 shrink-0" />`.
- [ ] Test: the skeleton header has `items-end`, its h1 has no `mt-1`, and it holds a `size-11` placeholder.
- [ ] Verify, commit `fix(trips): the Trips skeleton sits where the page will`.

### Task B3 (S7, the part that can be built): the Trips list's last row scrolls clear of the Feedback button

**Files:** `lib/trips/trips-page-frame.ts` (`FRAME`), test `app/(app)/trips/loading.test.tsx`.

Every page pads its foot by `--tp-fab-clearance` (app layout `<main>`, trip layout content) except the Trips list: `data-trips-shell` zeroes `<main>`'s padding and `FRAME`'s `pb-[calc(var(--tp-tab-bar-h)+1rem+env(safe-area-inset-bottom))]` has no clearance, so the button can sit on the last row at rest. The Day view at 320 px is in Questions: a fixed button over scrolling content cannot be kept off the weather card by padding.

- [ ] `FRAME`'s phone padding becomes `pb-[calc(var(--tp-tab-bar-h)+1rem+var(--tp-fab-clearance)+env(safe-area-inset-bottom))]`; md and xl padding unchanged.
- [ ] Test: `FRAME` contains `var(--tp-fab-clearance)`.
- [ ] Verify, commit `fix(trips): the Trips list's last row scrolls clear of the Feedback button`.

### Task B4 (H6, zoom): the route map keeps its pins clear of the zoom buttons

**Files:** `components/map/use-fit-bounds.ts` (`opts.padding`), `components/trip/route-map.tsx` (`FitRoute` :206-208), test `components/trip/route-map.test.tsx`.

`GoogleMapFrame` turns on `zoomControl`, which sits at the right bottom (40 × 81 px plus a 10 px margin). `FitRoute` fits with a uniform 40 px, so a Stop or Home at the east edge lands under the buttons.

- [ ] `useFitBounds` opts: `padding?: number | google.maps.Padding` (passed straight to `fitBounds`).
- [ ] `route-map.tsx`: `export const ROUTE_FIT_PADDING = { top: 40, right: 72, bottom: 40, left: 40 };` and `useFitBounds(points, { padding: ROUTE_FIT_PADDING })`.
- [ ] Test: `mock.map.fitBounds.mock.calls[0][1]` equals `ROUTE_FIT_PADDING`.
- [ ] Verify, commit `fix(maps): the route map keeps its pins clear of the zoom buttons`.

### Task B5 (H6, attribution): a map card's attribution row is not cut by its corner. **Needs a browser.**

**Files:** `app/globals.css` (the `.tp-map` block :30-70), test `app/globals.map-popup.test.ts`.

Google draws its attribution (a row of `.gm-style-cc` items) flush to the map's bottom right and its logo bottom left; the cards clip the map with `overflow-hidden` and radii up to 24 px, so the row's ends are cut. Google's control markup is not ours and is not in the repo; the selector cannot be written from reading. Only build this if the orchestrator rules (as wave 2's Ruling 4) that this lane may look in a browser at the dev server on port 3000.

- [ ] In a browser, find the element that holds the bottom-right attribution row inside `.tp-map .gm-style`. Add one rule after the existing `.tp-map` rules that insets that row (and the bottom-left logo) by `0.75rem` from its side, using only a stable Google class (`gm-style-cc` or `gmnoprint`). If no stable selector exists, stop and report.
- [ ] Test: the stylesheet contains the new `.tp-map .gm-style` rule (same pattern as the existing map-popup tests).
- [ ] Check trip home, Summary and Wishlist maps at 390 and 1440 px, light and dark. Commit `fix(maps): a map card's attribution is not cut by its corner`.

### Task B6 (T2): Continue sits under the field on desktop

**Files:** `components/new-trip/step-actions.tsx` (`StepActions` root :24), test `components/new-trip/step-from.test.tsx`.

The actions row is `mt-auto` inside a `flex-1 flex-col` form, so on desktop it drops to the foot of the tall card. The phone's sticky bottom bar needs `mt-auto`.

- [ ] Root class: `mt-auto` becomes `mt-auto md:mt-0` (keep `md:pt-10`).
- [ ] Test: the element holding Continue has `md:mt-0`.
- [ ] Verify, commit `fix(new-trip): Continue sits under the field on desktop`.

### Task B7 (L3): Terms and Privacy end with links onward; the phone landing closes its gaps

**Files:** `components/legal/legal-page.tsx` (after `<main>` :55-79), `app/landing/landing.tsx` (phone tree :69-82), `app/landing/sample-cards.tsx` (`PhoneSampleCards` root :233), tests `components/legal/legal-page.test.tsx`, `app/landing/landing.test.tsx`, `app/landing/sample-cards.test.tsx`.

`LegalPage` ends at the last section. The phone landing is one `h-dvh` column whose card fan is `flex-1 items-center`, so the spare height splits into a band above the fan and one below it. The "fills exactly one screen and never scrolls" test is a standing decision and stays.

- [ ] `LegalPage`: `<main>`'s `pb-20` becomes `pb-12`; after `</main>` add `<footer className="border-t-2 border-border"><nav aria-label="More from Teepee" className="mx-auto flex max-w-page-wide flex-wrap items-center gap-x-6 gap-y-2 px-5 py-6 text-[13px] font-extrabold"><Link href="/" className="inline-flex min-h-11 items-center">Teepee home</Link>{other ? <Link href={other.href} className="inline-flex min-h-11 items-center">{other.label}</Link> : null}</nav></footer>`.
- [ ] Phone landing: keep the logo `div` first; wrap the h1, the body `p`, the actions `div` and `<PhoneSampleCards />` in `<div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">`. `PhoneSampleCards` root: `flex-1` becomes `mt-8 flex-[0_1_auto]` (keep `min-h-0 overflow-hidden`, so a short phone still clips the fan rather than scrolling).
- [ ] Tests: the legal footer has links named "Teepee home" (`/`) and the other document; the phone tree still has `h-dvh overflow-hidden`; the cards root has `flex-[0_1_auto]` and `mt-8` and no `flex-1` (update the class list at sample-cards.test.tsx:105).
- [ ] Verify, commit `fix(legal): Terms and Privacy end with links onward, and the phone landing closes its gaps`.

## Lane C: Plan

### Task C1 (N3): a Stop's time zone reads the same before and after the page loads

**Files:** `lib/dates.ts` (`tzAbbrev` :134-150), test `lib/dates.test.ts`.

`tzAbbrev` formats `Intl.DateTimeFormat("en-AU", { timeZoneName: "short" })`; Plan's `StopRow` (stop-row.tsx:230, a client component) renders it on the server and again in the browser. Measured on this machine: Node 24 (ICU 78) gives "GMT" for Europe/London and Europe/Dublin in winter, while Chromium and WebKit give "GMT+0"; Lisbon is "GMT+0" in all three. Every non-zero zone (AEST, GMT+1, GMT+5:30, GMT-4) matched in all three. The audit wrote the two sides the other way round; the spec's direction is the measured one.

- [ ] After reading `name`, return `name && /^GMT[+-]0(?::00)?$/.test(name) ? "GMT" : name ?? null`.
- [ ] Tests: `tzAbbrev("Europe/Lisbon", "2026-01-10")` is "GMT" (Node says "GMT+0" there, so this test fails before the fix); `("Europe/London", "2026-01-10")` is "GMT"; `("Europe/Paris", "2026-01-10")` stays "GMT+1"; Brisbane stays "AEST".
- [ ] Verify, commit `fix(plan): a Stop's time zone reads the same before and after the page loads`.

### Task C2 (P6): a rough Stop on a phone drops the "Drag to reorder" line

**Files:** `components/plan/mobile/mobile-stop-row.tsx` (subtitle :52-59, `summaryContent` :84-85), test `components/plan/mobile/mobile-stop-row.test.tsx`.

The rough card already shows its nights in the right-hand pill ("~3n"), so the subtitle has nothing to add.

- [ ] `summaryContent` returns `null` for a rough Stop. Compute it once (`const summary = summaryContent(...)`) and render the subtitle span only when `summary` is not `null` or `""`.
- [ ] Test: a rough Stop's card has no "Drag to reorder" and no empty subtitle span; a dated Stop with a stay still shows its subtitle.
- [ ] Verify, commit `fix(plan): a rough Stop on a phone drops the "Drag to reorder" line`.

### Task C3 (P6): Firm up sits inside its banner

**Files:** `components/trip/itinerary-manager.tsx` (banners :1702 and :1843), test `components/trip/itinerary-manager.test.tsx`.

Both banners are `h-11` with `border-2` (40 px inside); the `size="sm"` primary button is 36 px with a 4 px `shadow-cta` (5 px on hover), so the shadow lands on the bottom border.

- [ ] In both banners `mb-3 flex h-11 items-center … px-3.5` becomes `mb-3 flex min-h-14 items-center … px-3.5 py-2` (other classes unchanged).
- [ ] Test: the "Firm up all stops" button's parent banner has `min-h-14` and `py-2`, and no `h-11`.
- [ ] Verify, commit `fix(plan): Firm up sits inside its banner`.

### Task C4 (P6): every date range on Plan uses the same dash

**Files:** `lib/plan/plan-model.ts` (`formatStayRange` :157-162), `components/plan/mobile/mobile-stop-row.tsx` (:66), `components/plan/mobile/add-stop-sheet.tsx` (:204), `components/trip/itinerary-manager.tsx` (:1591), `app/(app)/trips/[tripId]/plan/page.tsx` (jump list `dateLabel` :318-321), tests `lib/plan/plan-model.test.ts`, `components/plan/stop-row.test.tsx`, `components/plan/stay-panel.test.tsx`, `components/plan/mobile/stop-sheet.test.tsx`, `components/plan/mobile/mobile-stop-row.test.tsx`, `components/plan/mobile/add-stop-sheet.test.tsx`, `components/trip/itinerary-manager.test.tsx`, `app/(app)/trips/[tripId]/plan/page.test.tsx`.

Plan prints `formatStayRange` ("Tue 15 – Tue 22 Dec", spaced) on the desktop row, the Plan header's meta line (`planHeaderMeta`), the Stop sheet and the stay panel's night runs, and `formatDateRangeCompact` ("10–13 Dec" unspaced, "28 Jun – 4 Jul" spaced) on the phone card, the side panel's jump list, the Add a stop list and the chapter count. The spec's "en dash with thin spacing the Day view uses" does not exist in the code (no U+2009 anywhere; see Questions). This task adopts the spec's form, on Plan only; `lib/dates.ts` is untouched so other pages do not change. U+2009 is a breaking space, so the space before the dash is the narrow no-break space U+202F: a wrapped range never starts a line with "–".

- [ ] `plan-model.ts`: `export const PLAN_RANGE_DASH = "\u202F–\u2009";` `formatStayRange` joins with it. Add `export function planDateRange(start: string, end: string): string { return formatDateRangeCompact(start, end).replace(/ ?– ?/, PLAN_RANGE_DASH); }`.
- [ ] Use `planDateRange` at mobile-stop-row :66, add-stop-sheet :204, itinerary-manager :1591 and plan/page.tsx :320 (replacing `formatDateRangeCompact`; drop the import where it becomes unused). `planHeaderMeta` follows through `formatStayRange`.
- [ ] Tests: `planDateRange("2026-07-10", "2026-07-13")` is `"10\u202F–\u200913 Jul"`; `planDateRange("2026-06-28", "2026-07-04")` is `"28 Jun\u202F–\u20094 Jul"`; `formatStayRange` cases expect the thin-spaced dash. Update every Plan test that matched " – " or "–" in a range (build expected strings from `PLAN_RANGE_DASH`, not by pasting the character).
- [ ] Verify, commit `fix(plan): every date range on Plan uses the same dash`.

### Task C5 (P6): a Book by pill matches the type beside it

**Files:** `components/plan/day-section.tsx` (:277), `components/plan/leg-pill.tsx` (:125), tests `components/plan/day-section.test.tsx`, `components/plan/leg-pill.test.tsx`.

`Badge` is `text-[10px]` below lg; on a Plan row it sits beside `text-xs` pills ("Booked", the cost), and in a leg pill beside the `text-xs` time.

- [ ] Pass `className="text-xs"` to `BookingStateBadge` at both places (tailwind-merge replaces `text-[10px]`).
- [ ] Tests: the "To book" or "Book by" badge on a day row and in a leg pill has `text-xs` and no `text-[10px]`.
- [ ] Verify, commit `fix(plan): a Book by pill matches the type beside it`.

### Task C6 (P6): a drive within one region names it once

**Files:** `lib/plan/leg-label.ts` (`legLabel` :44-97), test `lib/plan/leg-label.test.ts`.

A timed leg's label is `${word} ${fromShort} → ${toShort}`, and the ends are often full place strings. The audit's three P6 screenshots do not show the case, so this task covers the three shapes that say a region twice: the same name at both ends ("Lapland → Lapland"), "Town (Region)" beside "Region", and two places that end in the same comma parts ("Kuta, Bali → Ubud, Bali").

- [ ] Add a module-level `function sameRegion(a: string, b: string): [string, string] | string`: equal (case-insensitive, trimmed) returns the one name; if one ends in ` (X)` where X equals the other, return the pair with that parenthetical removed; if both have two or more comma parts and their trailing parts are equal, drop the shared trailing parts from both ("Kuta, Bali", "Ubud, Bali" gives ["Kuta", "Ubud"]; if that leaves the two equal, return the one name); otherwise the pair unchanged.
- [ ] In `legLabel`, when both shorts exist: a single name gives `label = \`${word} in ${name}\`` and `route = \` in ${name}\``; a pair gives the arrow label from the (possibly trimmed) pair. The `route` text for the accessible name follows the same rule.
- [ ] Tests (invented places): "Drive Northvale → Northvale" becomes "Drive in Northvale" and its accessible name says "in Northvale"; "Drive Northvale → Eastby (Northvale)" becomes "Drive Northvale → Eastby"; "Drive Westby, Northvale → Eastby, Northvale" becomes "Drive Westby → Eastby"; "Train ABC → XYZ" and "Drive Westby, Northvale → Eastby, Southmoor" are unchanged.
- [ ] Verify, commit `fix(plan): a drive within one region names it once`.

### Task C7 (P7, O8 Delete stop): Delete stop shows every line in full and keeps focus on Cancel

**Files:** `components/trip/stop-deletion-preview.tsx` (:107, :117, :127), `components/trip/delete-stop-dialog.tsx` (the three returns :59-122), test `components/trip/delete-stop-dialog.test.tsx`.

The cost, attachment and note lines are `min-w-0 truncate` (X6 changed only the stay line, :96). The browser's blue ring comes from a focus loss: the dialog opens in its loading state and Radix focuses Cancel; when the preview arrives the inner component returns a fragment with a new middle child, so React remounts `DialogFooter` by position, the focused Cancel unmounts, and Radix's focus scope falls back to the content box (`tabindex="-1"`, which the global ring rule excludes), where the browser draws its own ring.

- [ ] The three `min-w-0 truncate` spans become `min-w-0 break-words`.
- [ ] In all three returns give `DialogHeader` `key="header"` and `DialogFooter` `key="footer"`, so the footer and its Cancel survive the state change.
- [ ] Tests: with a long cost label, attachment name and note, none of the three spans has `truncate`; open the dialog with the preview fetch pending, assert `document.activeElement` is the Cancel button, resolve the preview, assert the same element is still focused and still in the document.
- [ ] Verify, commit `fix(plan): Delete stop shows every line in full and keeps focus on Cancel`.

### Task C8 (leftover): Add a stop has a Cancel on desktop

**Files:** `components/plan/mobile/add-stop-sheet.tsx` (`DialogFooter` :219-223), test `components/plan/mobile/add-stop-sheet.test.tsx`.

- [ ] Before the submit button: `<DialogClose asChild><Button type="button" variant="outline" className="max-sm:hidden">Cancel</Button></DialogClose>` (import `DialogClose`). On a phone the sheet keeps its one full-width button and its drag handle.
- [ ] Tests: the footer holds a Cancel before the submit button, with `max-sm:hidden`; clicking it closes without calling the create action.
- [ ] Verify, commit `fix(plan): Add a stop has a Cancel on desktop`.

## Lane D: Day

### Task D1 (N4): the Day view stops prefetching days it already holds

**Files:** `components/trip/day/day-arrow.tsx` (`AppLink` :31-44), `components/trip/day/day-strip.tsx` (chip `AppLink` :232), tests `components/trip/day/day-strip.test.tsx`, `components/trip/day/__snapshots__/day-strip.test.tsx.snap`, `components/trip/day/day-header.test.tsx`.

What the code says. Nothing on the Day page calls `router.prefetch` (the carousel test "never prefetches" guards it), and the offline warmer fetches documents, not router prefetches (`sw.js` rule 1b). The repeated requests are Next's own: every visible `<Link>` prefetches on entering the viewport, and `pingVisibleLinks` (`next/dist/client/components/links.js:285`) re-schedules every visible link whenever the router tree or Next-Url changes (`app-router.js:116-124`) or the prefetch cache is invalidated (`segment-cache/cache.js:270-283`). Next's docs (`cookies.md`, "Understanding Cookie Behavior in Server Functions") say a Server Function that sets a cookie re-renders the current page and layouts. Two mount-time Server Functions can do that on an idle Day page: `rememberLastTrip` (`server/actions/last-trip.ts`, sets `teepee-last-trip` whenever it differs from the Trip in view) and any authenticated action that refreshes Better Auth's 5-minute `cookieCache` cookie (`reconcileDevice` from `DeviceSync`, when the device has a push subscription). The first prefetch plus two re-renders is three. The links seen were the strip's chips (days ±1 to ±4) and the tab and top bars (Plan, Money, Trips, Globe).

This task removes the part that is useless whatever the cause: every day the strip and the arrows link to is already on the page or is fetched by the carousel's own push on arrival, and a prefetch of a Day URL only fetches down to the `/trips` loading boundary. The other pages' repeats wait for O-2.

- [ ] `DayArrow`'s `AppLink` and the strip chip's `AppLink` get `prefetch={false}`.
- [ ] Tests: in day-strip.test.tsx the `next/link` mock also renders `data-prefetch={String(prefetch)}`; every chip has `data-prefetch="false"`. In day-header.test.tsx the hoisted link log records `prefetch`; both arrow links record `false`. Update the snapshot only if its sole difference is the new attribute.
- [ ] Verify, commit `fix(day): the Day view stops prefetching days it already holds`.

**O-2 (orchestrator, production build in a worktree without `.env.production.local`; `next dev` does not prefetch).** Sign in, open a Day page of the demo trip at 402 × 874 in Chromium, sit idle 60 s with Playwright's `page.on("request")` logging every request with its time, its `next-router-prefetch` and `next-router-segment-prefetch` headers, every POST with a `next-action` header, and every response's `set-cookie` presence. For each URL count prefetch rounds (requests seconds apart, not the several segment requests one prefetch makes in the same burst). Expected after D1: no Day URL prefetched; Plan, Money, Trips, Globe once each if no action set a cookie. If a repeat round follows a `next-action` POST whose response set a cookie, record which action. The fix for that is a product call (Questions 4).

### Task D2 (N6): a surprised Traveller sees no "Add a title" on a Surprise day

**Files:** `lib/day-view-loader.ts` (`dayTitleStopId` :497), test `lib/day-view-loader.test.ts`.

`dayTitleStopId` falls back to the day's Stop, which for a surprised viewer is the hidden Stop (`daySurprise(...).dayStopHidden`), so `DayTitleInline` shows "Add a title" and `setDayTitle` refuses (`requireRowAccess`, then `requireOutsideSurprise`). Day titles of hidden Stops are already filtered out of the read (`MARKER_WHERE.dayTitle`), so `model.dayTitle` is never a hidden Stop's.

- [ ] Compute `const surprise = daySurprise(rows.stops, date, dayStop?.id ?? null);` once, use it for the `surprise` field, and set `dayTitleStopId: model.dayTitle?.stopId ?? (surprise?.dayStopHidden ? null : dayStop?.id ?? null)`.
- [ ] Tests (in "a day that is a Surprise for the viewer"): with Strasbourg hidden, `loadDay("2026-12-11").dayTitleStopId` is null; the Changeover day `2026-12-10` is null; a visible day keeps its Stop; the existing "title's owner" test still passes.
- [ ] Verify, commit `fix(day): a surprised Traveller sees no Add a title on a Surprise day`.

### Task D3 (N8): resizing across 1024 px no longer scrolls the Day view

**Files:** `components/trip/day/day-carousel.tsx` (header layout effect :354-369), test `components/trip/day/day-carousel.test.tsx`.

The per-commit header effect scrolls by `headerHeight.current - held` when scrolled into the header. Its baseline is kept by a ResizeObserver (:345-353), whose callback runs after layout in a later frame. Crossing 1024 px, `useMediaQuery(LG_UP)` commits first (`desktop` flips, and the header rewraps at the lg breakpoint), so this effect sees the new height against the old baseline and scrolls once.

- [ ] Add `const lastDesktop = React.useRef(desktop);`. In the effect, `const flipped = lastDesktop.current !== desktop; lastDesktop.current = desktop;` and scroll only when `!flipped && held && above && headerHeight.current !== held`. The baseline (`headerHeight.current = …`) and the `minHeight` releases still run on every commit.
- [ ] Test: copy the "rewraps on its own" setup (stubbed ResizeObserver, `offsetHeight` spy, `top: -120`); mount on a phone, set the header to a new height without delivering the observer, then `setMatchMedia(true)` and `rerenderWith({ panels: week() })`: `scrollBy` is not called. (If the rerender does not pick up the new `matchMedia`, call the stub's registered `change` listeners from `addEventListener.mock.calls`.) The two existing header-correction tests still pass.
- [ ] Verify, commit `fix(day): resizing across 1024 px no longer scrolls the Day view`.

### Task D4 (D7): an empty Day plan says nothing once; the Journal card matches its neighbours; the phone header gives its title room

**Files:** `components/trip/day/day-plan-card.tsx` (header :55-62, empty block :65-72), `components/trip/day/journal-card.tsx` (:41), tests `components/trip/day/day-plan-card.test.tsx`, `components/trip/day/journal-card.test.tsx`, `app/(app)/trips/[tripId]/day/page.test.tsx`.

An empty day prints `planCountLabel(0)` "Nothing planned yet" in the header and "Nothing planned" in the body, whose block is `min-h-[12rem] justify-center` (the dead band). The Journal card is `px-[22px] py-[18px] rounded-3xl shadow-hard-3` at every width; the Day plan card is `rounded-[20px] p-4 shadow-hard-2` below md and `rounded-3xl px-6 py-[22px] shadow-hard-3` from md. The header row does not wrap.

- [ ] Header count: render it only when `!empty && !(whole && !data.hasEntries)`.
- [ ] Empty block: `flex min-h-[12rem] flex-col items-center justify-center gap-3.5 text-center` becomes `flex flex-col items-center gap-3.5 py-2 text-center`; update the comment above it.
- [ ] Header row: `flex items-baseline justify-between gap-3` becomes `flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1`; the right cluster adds `ml-auto`.
- [ ] Journal card: `rounded-3xl … px-[22px] py-[18px] shadow-hard-3` becomes `rounded-[20px] p-4 shadow-hard-2 md:rounded-3xl md:px-6 md:py-[22px] md:shadow-hard-3` (other classes unchanged).
- [ ] Tests: an empty day's card contains "Nothing planned" once and no "Nothing planned yet"; the empty block has no `min-h-[12rem]`; the header row has `flex-wrap` and the cluster `ml-auto`; the Journal card has `p-4` and `md:px-6`. Update day page.test.tsx where it expected "Nothing planned yet".
- [ ] Verify, commit `fix(day): an empty Day plan says nothing once, and the Journal card matches its neighbours`.

### Task D5 (S5, Day header): overlapping avatars keep both initials readable

**Files:** `components/trip/day/day-header.tsx` (:90-101), test `components/trip/day/day-header.test.tsx`.

Same stack as the desktop home header (Task A1): 40 px, `-space-x-2.5`, border and no ring.

- [ ] `flex -space-x-2.5` becomes `flex -space-x-1.5`; each `TravellerAvatar` gets `ring`; the `+N` span adds `ring-2 ring-background`.
- [ ] Test: the members link's row has `-space-x-1.5`; its avatars have `ring-2 ring-background`.
- [ ] Verify, commit `fix(day): overlapping avatars no longer hide a Traveller's initials`.

### Task D6 (O8, Day map): the Day map's first place is not clipped

**Files:** `components/trip/day/day-map-dialog.tsx` (list `ol` :66), test `components/trip/day/day-map-dialog.test.tsx`.

The list is `overflow-y-auto` with rows flush to its top edge. Radix focuses the first tabbable control when the dialog opens, which is the first row's button (the Close button comes after the body in the DOM); the app's focus ring (3 px at a 3 px offset) and the row's top border are clipped by the scroll box.

- [ ] `ol` adds `p-1.5` (6 px, the ring's reach).
- [ ] Test: the "Today's places" list has `p-1.5`.
- [ ] Verify, commit `fix(day): the Day map's first place is not clipped`.

## Lane E: Proxy, Reviews, Print, Money, Activity, Share

### Task E1 (N9): the proxy answers a failed session lookup without waiting for its report

**Files:** `proxy.ts` (signature :20, catch :39-49), tests `proxy.route.test.ts`, `proxy.test.ts`.

The catch awaits `import("@/lib/error-sink")` and `reportError` before returning the 503, and `reportError` writes to the database that just failed. `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` ("`waitUntil` and `NextFetchEvent`") gives the proxy a second parameter whose `waitUntil(promise)` keeps the invocation alive after the response is sent. Proxy runs on the Node.js runtime by default and takes no `runtime` config.

- [ ] `import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";` Signature `export async function proxy(request: NextRequest, event: NextFetchEvent): Promise<NextResponse>`.
- [ ] Catch: `event.waitUntil(import("@/lib/error-sink").then(({ reportError }) => reportError(err, { route: "proxy.ts", source: "server" })));` then build and return the 503 exactly as now. No `await` before the return except the `proxy-unavailable` import.
- [ ] Tests: a helper `const fetchEvent = () => ({ waitUntil: vi.fn() }) as unknown as NextFetchEvent;` passed to every `proxy(...)` call in both files (tsc checks tests). New test: `reportError` returns `new Promise(() => {})`; `await proxy(request(...), event)` still resolves with status 503 and `waitUntil` was called once. The existing 503 test awaits `event.waitUntil.mock.calls[0][0]` before asserting `reportError` was called with `(err, { route: "proxy.ts", source: "server" })`.
- [ ] Verify, commit `fix(proxy): a failed session lookup answers without waiting for its report`.

### Task E2 (N10): Deep Review asks before it starts

**Files:** `components/trip/reviews/review-run-panel.tsx`, test `components/trip/reviews/review-run-panel.test.tsx`.

Both buttons call `start(kind)` on click. `components/ui/confirm-dialog.tsx` has `useConfirm()`; its `ConfirmDialog` already follows the footer rule (outlined Cancel, primary last, primary `autoFocus`).

- [ ] Export `DEEP_REVIEW_CONFIRM = { title: "Start a Deep Review?", description: "A Deep Review takes longer than a Standard Review and thinks harder about the plan.", confirmLabel: "Start Deep Review" }` (an `ConfirmOptions`).
- [ ] Call `const { confirm, dialog } = useConfirm();` with the other hooks, before the `hidden` early return. The Deep button's `onClick` becomes `async () => { if (await confirm(DEEP_REVIEW_CONFIRM)) start("DEEP"); }`. Render `{dialog}` inside the ready/busy `section`. Standard Review is unchanged.
- [ ] Tests: Deep Review opens a dialog titled "Start a Deep Review?" and `startReview` is not called; "Start Deep Review" calls `startReview(tripId, "DEEP")`; Cancel closes it with no call; Standard Review still calls `startReview(tripId, "STANDARD")` on one click. Update "ready: Deep Review starts a Deep run" to go through the dialog.
- [ ] Verify, commit `fix(reviews): Deep Review asks before it starts`.

### Task E3 (U4): the print preview fits a phone and centres on desktop

**Files:** `app/(app)/trips/[tripId]/print/page.tsx` (root :260, Transport line :343-361), test `app/(app)/trips/[tripId]/print/page.test.tsx`.

The root pads `px-4` inside the trip layout's own `px-4 sm:px-6 md:px-8`, so a phone preview is inset 32 px a side. The Transport line wraps each fragment separately ("Flight", "from X", arrow, "Y"), leaving the arrow and the destination on a line of their own. On desktop the root is a flex item with `mx-auto`, which in the trip content's flex column sizes it to its content rather than `max-w-3xl`.

- [ ] Root: `px-4` becomes `px-0`; add `w-full`. Print classes unchanged.
- [ ] Transport line: keep the mode `span`; replace the "from" span, the arrow and the arrival span with one `<span className="min-w-0 break-words">` holding `from {depPlace}`, then an inline `<ArrowRight className="mx-1 inline size-3.5 align-[-2px]" aria-hidden="true" />`, then `{arrPlace}`, each part only when present.
- [ ] Tests: the root has `w-full` and `px-0`, not `px-4`; a Transport with both places renders "from" and the arrival inside one element.
- [ ] Verify, commit `fix(print): the print preview fits a phone and centres on desktop`.

### Task E4 (M3): the desktop Trip cost card ends under its bar

**Files:** `app/(app)/trips/[tripId]/budget/page.tsx` (`MONEY_DESKTOP_GRID_CLASS` :45, `SPAN.where` :51), test `app/(app)/trips/[tripId]/budget/page.test.tsx`.

The grid is `lg:grid-rows-[auto_auto]`; the right column spans both rows, so when it is taller than the tile plus Where it goes, the extra height is shared between both rows and the tile (row 1) stretches. Inside, `CostTile`'s grid gives the bar row `1fr`, so the extra height opens under the bar.

- [ ] `lg:grid-rows-[auto_auto]` becomes `lg:grid-rows-[auto_1fr]`; `SPAN.where` adds `lg:self-start`.
- [ ] Test: the grid class contains `lg:grid-rows-[auto_1fr]` (update the class list at page.test.tsx:12).
- [ ] Verify, commit `fix(money): the desktop Trip cost card ends under its bar`.

### Task E5 (A1): desktop Activity rows read at a comfortable width

**Files:** `components/trip/activity-feed.tsx` (`ul` :41), test `components/trip/activity-feed.test.tsx`.

`ListRow` puts the time in its trailing slot at the far right of a full-width card.

- [ ] `ul` className `flex flex-col` becomes `flex max-w-3xl flex-col`.
- [ ] Test: the list has `max-w-3xl`.
- [ ] Verify, commit `fix(activity): desktop Activity rows read at a comfortable width`.

### Task E6 (leftover): the shared route card stretches by its own class

**Files:** `app/share/[token]/page.tsx` (`ROUTE_FILL` :90, `PLACEMENT` :92-94, cell :656-662, `case "route"` :626-631), `app/share/[token]/share-route-list.tsx` (props, `section` :29-32), tests `app/share/[token]/page.test.tsx`, `app/share/[token]/share-route-list.test.tsx`.

`ROUTE_FILL` reaches three levels down with `[&>div]`, `[&>div>div]` and `[&>div>div>section]` to give the sticky wrapper, `ShareReveal`'s div and the route `section` `h-full`.

- [ ] Delete `ROUTE_FILL` and its three uses in `PLACEMENT`. The cell's inner div becomes `cn(STICKY_SECTION[stage] === key ? STICK : undefined, key === "route" && "lg:h-full")`; `ShareReveal` (already takes `className`) gets `className={key === "route" ? "lg:h-full" : undefined}`.
- [ ] `ShareRouteList` takes `className?: string`, merged onto its `section` with `cn()`; `case "route"` passes `className="lg:h-full"`.
- [ ] Tests: the route cell's class no longer contains `[&>div`; the route `section` has `lg:h-full` (update page.test.tsx:382); `ShareRouteList` applies a passed className.
- [ ] Verify, commit `fix(share): the route card stays level with the map beside it`.

## Lane F: Dialogs, sheets and Reminders

### Task F1 (O7): dialogs lose the gap under the title and the band under the buttons

**Files:** `components/ui/dialog.tsx` (`DialogHeader` :318, `DialogFooter` :360), test `components/ui/dialog.test.tsx`.

The header is `min-h-[72px] justify-center`: a one-line title (about 30 px) gets 21 px under it, then `mb-1` and the body's `gap-3.5` (the O7 screenshots show about 60 px from title to first label). 48 px is enough for the Close button: it spans 16 to 60 px from the frame top on a phone, where the header starts at 33 px (handle plus `pt-3.5`), and 20 to 64 px from sm, where it starts at 24 px; `pr-18` keeps a long title clear of it. The footer pads `1.375rem` (22 px) under its buttons against `pt-3` (12 px) above them.

- [ ] Header: `min-h-[72px]` becomes `min-h-12`. Keyboard-open `min-h-12` unchanged.
- [ ] Footer: `pb-[calc(1.375rem+env(safe-area-inset-bottom))]` becomes `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`. The negative margin, the cover shadow and the keyboard-open classes stay as they are (they match the scroll body's padding, not this one).
- [ ] Tests: the header has `min-h-12` and not `min-h-[72px]`; the footer has `pb-[calc(0.75rem+env(safe-area-inset-bottom))]` and still `-mb-[calc(1.375rem+env(safe-area-inset-bottom))]`.
- [ ] Verify, commit `fix(ui): dialogs lose the gap under the title and the band under the buttons`.

### Task F2 (O8, Add from Globe): the Globe filter shows its magnifier

**Files:** `components/globe/marker-filters.tsx` (`Search` :22-26), new test `components/globe/marker-filters.test.tsx`.

The icon is `absolute` before the `Input` in DOM order. In Add from Globe the filter field is focused when the dialog opens, and `Input`'s focus lift (`focus-visible:-translate-x-0.5 -translate-y-0.5`) makes it a transformed box painted in the positioned layer after the icon, so its `bg-card` covers it. On the Globe page the field is not focused, so the icon shows.

- [ ] The `Search` icon adds `z-10`.
- [ ] Test: render `MarkerFilters`; the svg before the "Filter your markers" input has `z-10`.
- [ ] Verify, commit `fix(wishlist): Add from Globe shows the magnifier in its filter`.

### Task F3 (N5): a Reminder brought back elsewhere reappears on the next refresh

**Files:** `components/trip/reminders-card.tsx` (`RemindersCard` :311-345), test `components/trip/reminders-card.test.tsx`.

"Got it" adds the id to `gone`, local state that is never cleared: after the server's list drops the Reminder the id stays, so when the other Traveller or Claude brings it back the next server list contains it again and `shown` still filters it out until the card remounts. Trip home and Checklists both render this card.

- [ ] After the `gone` state, prune it while rendering when the server list changes (React's "adjust state when a prop changes"; the repo's lint forbids setState in an effect): `const [seenReminders, setSeenReminders] = useState(reminders); if (seenReminders !== reminders) { setSeenReminders(reminders); setGone((prev) => { const ids = new Set(reminders.map((r) => r.id)); const kept = [...prev].filter((id) => ids.has(id)); return kept.length === prev.size ? prev : new Set(kept); }); }`. An id stays hidden while the list still holds it (the optimistic window), and is forgotten once the list has dropped it.
- [ ] Tests: render with Reminders a and b; Got it on a (`updateReminder` resolves `{ success: true }`); a is gone. Rerender with a new array [a, b] (a refresh before the write lands): a stays hidden. Rerender with [b], then with [a, b] (brought back elsewhere): a is shown.
- [ ] Verify, commit `fix(reminders): a Reminder brought back elsewhere reappears on the next refresh`.

### Task F4 (O8, Reminders): the desktop Add reminder form and Reminder text keep a readable width

**Files:** `components/trip/reminders-card.tsx` (`AddReminderForm` form :168, `ReminderRow` text column :254, dismissed row `p` :390), test `components/trip/reminders-card.test.tsx`.

- [ ] Form `flex flex-col gap-2` becomes `flex w-full max-w-md flex-col gap-2`.
- [ ] `ReminderRow`'s `min-w-0 flex-1` text column adds `[&_p]:max-w-prose`; the dismissed row's `p` adds `max-w-prose`.
- [ ] Tests: the open add form has `max-w-md`; a Reminder's text column has `[&_p]:max-w-prose`.
- [ ] Verify, commit `fix(reminders): the desktop Add reminder form and Reminder text keep a readable width`.

### Task F5 (O8, More sheet): the More sheet uses the app's rows and puts Close in its header

**Files:** `components/trip/mobile-tab-bar.tsx` (sheet :89-123), test `components/trip/mobile-tab-bar.test.tsx`.

The sheet's rows are indented plain text (`rounded-xl px-4 py-3 text-sm font-medium`) and `SheetContent` floats its Close at `absolute right-4 top-4`. The app's phone action sheet (`components/plan/stop-actions-sheet.tsx`) uses a header row with a visible title and one bordered group of 48 px rows.

- [ ] `SheetContent side="bottom" hideClose`. First child: `<div className="flex items-center gap-3"><SheetTitle className="min-w-0 flex-1 font-display text-[28px] leading-none">More</SheetTitle><DialogClose className="grid size-11 shrink-0 place-items-center rounded-sm border-2 border-border bg-card text-foreground"><X className="size-5" strokeWidth={2.5} aria-hidden="true" /><span className="sr-only">Close</span></DialogClose></div>` (`DialogClose` from `components/ui/dialog`, `X` from lucide). Keep the sr-only `SheetDescription`.
- [ ] Rows go in `<div role="group" aria-label="Trip sections" className="flex flex-col divide-y-2 divide-muted overflow-hidden rounded-[14px] border-2 border-border bg-card">`; each link and the Share button gets `flex min-h-12 w-full items-center px-3.5 text-left text-sm font-bold aria-[current=page]:bg-muted`.
- [ ] Tests: the sheet is a dialog named "More" with a "Close" button inside its header row; its links have `min-h-12`; update tests that looked the dialog up as "More navigation".
- [ ] Verify, commit `fix(shell): the More sheet uses the app's rows and puts Close in its header`.

### Task F6 (O8, trip switcher): All trips and New trip line up with the trip names

**Files:** `components/shell/trip-switcher.tsx` (`TripMenuItems` :59-64), test `components/shell/trip-switcher.test.tsx`.

Each trip row is a 10 px `Dot` and a `gap-2.5` before the name; the two links after the separator have neither, so they start 20 px left of the names.

- [ ] Both links get `className="flex items-center gap-2.5"` and a first child `<span aria-hidden="true" className="size-2.5 shrink-0" />`. Labels unchanged ("All trips", "+ New trip").
- [ ] Test: "All trips" and "+ New trip" each have an aria-hidden `size-2.5` first child and `gap-2.5`.
- [ ] Verify, commit `fix(shell): All trips and New trip line up with the trip names`.

### Task F7 (N11): the glossary says where a dismissed Reminder is counted

**Files:** `CONTEXT.md` (**Reminder**, the last sentence of :362).

- [ ] Replace "nothing counts or tracks dismissed Reminders the way a Checklist counts ticks." with: "Checklists lists the Trip's dismissed Reminders under **Dismissed (n)**, each with Bring back, and that is the only place they are counted; nothing tracks them the way a Checklist counts ticks." No em dash in the new text.
- [ ] Commit `docs(context): a dismissed Reminder is counted on Checklists`.

## Lane G: Copy (after Lanes A to F are merged)

### Task G1 (G4): apostrophes and quotation marks are curly in the app's own words

**Files:** non-test `.ts` and `.tsx` under `app/` and `components/` that the script changes; the tests that assert a changed string.

The approach is a script kept in the scratchpad (never committed) that edits exact character positions found by the TypeScript compiler API (`typescript` is already installed), so no identifier, import, class name or expression can change.

- [ ] Write `<scratchpad>/curly/curly.ts` (run with `npx tsx`). For each file under `app/` and `components/` that ends `.ts` or `.tsx`, excluding `*.test.*`, `__snapshots__`, `app/api/**`, `app/manifest.ts` and `app/opengraph-image.tsx`, parse with `ts.createSourceFile(..., ScriptKind.TSX)` and collect:
  1. `JsxText` nodes.
  2. String-literal initialisers of JSX attributes named `aria-label`, `aria-description`, `title`, `placeholder`, `alt`, `label`, `description`, `confirmLabel`, `cancelLabel`, `hint`, `subtitle`, `heading`, `text` and `message`.
  3. Other `StringLiteral`, `NoSubstitutionTemplateLiteral` and template-part texts that look like prose (contain a letter–apostrophe–letter and a space, or start with `'s ` after a template expression), unless they are: an import or export specifier; a directive; a property name or element-access key; the operand of `===`, `!==`, `==`, `!=`, a `case` label, or an argument of `includes`, `startsWith`, `endsWith`, `match`, `replace`, `split`; an argument of `cn`, `cva`, `clsx`, `twMerge`; inside a `className`, `style`, `href`, `src`, `id`, `key`, `type`, `role`, `name` or `data-*` attribute; inside `dangerouslySetInnerHTML` or a `<style>` or `<script>` element; any literal containing `<`, `=`, `{`, `;`, `://` or `[` (markup, CSS, URLs, arbitrary Tailwind values such as `[grid-template-areas:'head'_...]`).
- [ ] Replacements inside the collected ranges only: a straight `'` between two letters, or after a letter at a word end before a space or punctuation (plural possessive), becomes `’`; in JSX text `&apos;` becomes `’` and `&quot;…&quot;` becomes `“…”`. Leave `&rsquo;`, `&ldquo;`, `&rdquo;` as they are. Straight double quotes inside string literals are not changed automatically: the script prints them as a review list with file and line, and the implementer converts only those that are prose quotation (pairs to `“` and `”`) by hand.
- [ ] Skip, and list, any changed string that also occurs verbatim in any file outside `app/` and `components/` (search the repo with `git grep -F`, which leaves out `node_modules`): `lib/` text may be compared or stored (Help search terms in `lib/help-guide.ts`), and `server/`, `scripts/` (the layout harness's overlay recipes click buttons by name), `test/` and integration or e2e specs match copy that `vitest related` does not reach.
- [ ] Dry run first: the script writes `<scratchpad>/curly/report.md` (file, line, before, after) without editing. Read it all; remove anything that is not copy. Then run with `--write`.
- [ ] Prove nothing else changed: a second script maps `’`→`'`, `“` and `”`→`"`, and `&apos;`→`'`, `&quot;`→`"` in both `git show HEAD:<file>` and the working file for every changed file and asserts the two results are byte-identical. It must print zero differences.
- [ ] Tests: `TZ=UTC npx vitest related --run <changed files>`; every failure must be a test asserting a changed string. Update those tests to the curly form in the same commit (build the string with the same character; do not loosen to a regex). A snapshot may be updated only if its diff is quote characters only. Then `npx tsc --noEmit` and `npx eslint <changed files>` (curly characters do not trip `react/no-unescaped-entities`).
- [ ] Commit `fix(copy): apostrophes and quotation marks are curly in the app's own words`, with the report's file count in the body.

---

## Not built

- **N7, Day page size.** A measurement. Already read: the scratchpad's `prod-day.html`, a production Day page of the 36-day real trip saved on 19 Nov 21:14, is 1,467,013 bytes raw, 123,579 gzip -9, 127,106 gzip -6 (what `next start` sends) and 46,036 brotli (what Vercel sends). Far under the 300 KB line, so nothing is built. It predates waves 1 and 2, so re-measure (O-3): in a worktree with **no `.env.production.local`**, `npm run build && npx next start -p 3000` against the local copy, sign in with Playwright, `page.goto("/trips/<36-day trip>/day/<middle date>")`, `fs.writeFileSync(out, await page.content())`, then `node -e 'const z=require("zlib"),b=require("fs").readFileSync(process.argv[1]);console.log(b.length,z.gzipSync(b).length,z.brotliCompressSync(b).length)' <out>`. The spec names the 36-day (real) trip; the dispatch said the longest demo trip, and no demo trip is 36 days: measure the real local copy and also the demo flagship for the record.
- **N12.** No build: the install nudge stays at the foot of the phone Trips list.
- **S7, the Day view at 320 px.** See Questions 1.
- **N4, the other pages' repeats.** Waits for O-2 and Questions 4.

## Questions for the orchestrator

1. **S7, "the Feedback button does not cover the weather card's sunset time at 320 px."** Not buildable as padding. The button is fixed 24 px from the right and 24 px above the tab bar; on a 320 × 568 phone the compact weather card's daylight row (sunset at its right end, inner edge 288 px) sits at about 440 to 470 px, exactly under the button (x 252 to 296, y 424 to 468), and no right inset clears a right-aligned label. Options: a smaller button below 360 px wide; the button tucks away while the page scrolls; move it on the Day view into the Day header; or accept. B3 builds the padding half.
2. **P6 dashes.** The Day view has no thin-spaced en dash (no U+2009 in the code); its only range is a time range with normal spaces ("18:00 – 19:00"). C4 builds the spec's form (thin space, en dash, thin space) on Plan only. Say if the Day view and the rest of the app should follow.
3. **S8 and S6 wording.** The only "What's new marker" near the trip header is the What's new card's `·` bullet; A4 replaces it with a count badge beside the heading. There is no trip switcher in the phone top bar, so "the switcher keeps it" has nothing to point at; A2 hides the header's name only on the Sketching phone home, the one place it showed three times. Hiding it on every phone home would leave Planning, Final prep and Travelling with no visible trip name.
4. **N4, the other pages.** D1 stops the Day links prefetching (so neighbours are fetched zero times, not once: they are on the page). If O-2 shows the Plan, Money, Trips and Globe repeats follow `rememberLastTrip` or a Better Auth cookie refresh, the fixes are: write the last-trip cookie in `proxy.ts` on a member's trip-page GET (it already resolves the Trip there) and drop the client call; and, for the session cookie, nothing short of turning the cookie cache off or accepting the refresh. Both are product calls.
5. **H6 attribution (B5)** needs a browser to find Google's control element. Allow Lane B to look, as wave 2's Ruling 4 did for Lane D, or skip B5.
6. **G4 scope.** User-visible text that lives in `lib/` (flag messages, release notes, Help search terms, Next steps titles) keeps its straight apostrophes, because `lib/` strings are compared and stored. Say if a later pass should convert `lib/` copy with its tests.
7. **N1 on trip home.** B1 fixes the measured Day shift; the 0.055 trip-home reading is expected to be the same shift (same loader, same padding drop) but no trip-home source node from after the notes branch is on record. O-1 decides; a follow-up task if it is not 0.
8. **L3 landing.** B7 keeps the one-screen phone landing (a standing decision with its own test) and centres the hero and card fan together, which closes the band between the buttons and the cards; the spare height now sits above the heading and below the fan. A landing that ends where its content ends would close every band but scroll on short phones.
9. **U4 desktop "offset".** The code shows no offset beyond the `mx-auto` flex item sizing to its content; E3 adds `w-full`. Check at 1440 px after the merge.
10. **P6 region.** The drive that named its region twice is not in the audit's screenshots. C6 handles three shapes (same name, "Town (Region)", a shared ", Region" tail); if the real leg is another shape, it stays as it is.

## Decisions to log (orchestrator, in `docs/audits/2026-11-20-polish-decisions.md` under a Wave 3 heading)

| Id | Built as | The other way |
|---|---|---|
| N1 | A trip page's loading logo sits in the full-bleed trip frame, so nothing moves when the page arrives (the logo is 16 px further left and 32 px higher than before). | Give trip pages `<main>`'s padding instead. |
| N2 | The Trips skeleton reserves the New trip button's 44 px, even for a Traveller with no trips yet. | Reserve nothing and let a first-run header move. |
| N3 | A zero-offset zone reads "GMT" everywhere. | "GMT+0", or "UTC". |
| N4 | The Day strip and day arrows never prefetch (zero times); the days are already on the page. | Prefetch each neighbour once. |
| N6 | On a Changeover day shared with a hidden Stop, no title control unless the visible Stop already has a title. | Offer the control on the visible Stop. |
| N8 | The header correction skips only the commit where the layout crosses 1024 px. | Correct only when the header swaps. |
| N10 | "Start a Deep Review?" / "A Deep Review takes longer than a Standard Review and thinks harder about the plan." / Start Deep Review. | Other wording. |
| S5 | Avatars overlap by 6 px with a 2 px ring in the page colour everywhere. | Keep 8 to 10 px overlap with a ring only. |
| S6 | The trip name in the phone header is hidden visually only on a Sketching trip's home. | Hide it on every phone trip home. |
| S7 | The Trips list's foot clears the Feedback button; the Day view at 320 px is unchanged. | Shrink or hide the button while scrolling. |
| S8 | What's new shows its unread count in a coral badge beside the heading; the list has no bullets. | A "New" badge on each line. |
| H6 | The route map fits its pins with 72 px on the right for the zoom buttons. | Move the zoom buttons to the top. |
| H7 | A past trip's phone cover carries the trip name on a card chip at the bottom left; sketching route nights sit in a right-hand column; a desktop warning tile is yellow like the phone's. | Name above "That's a wrap"; leave the colours. |
| T2 | Continue sits 40 px under the field on desktop. | Beside the field. |
| P6 | A rough phone card has no subtitle; Plan ranges use an en dash with a narrow no-break space before it and a thin space after; Book by is 12 px; "Drive in X" for one region, "Town (X)" loses "(X)" beside X, and a shared ", Region" tail is dropped. | Show the nights as the subtitle; leave ranges as they were. |
| D7 | An empty Day plan has no count in its header; the Journal card takes the Day plan card's padding at each width. | Keep the count and drop the body line. |
| U4 | The phone print preview drops its extra 16 px a side; a Transport's places wrap as one sentence. | Keep the inset. |
| M3 | Spare height on desktop Money goes under Where it goes, not into the Trip cost card. | Even card bottoms. |
| A1 | Desktop Activity rows stop at 48 rem. | Two columns. |
| L3 | Legal footer links: "Teepee home" and the other document. The phone landing centres hero and cards together on one screen. | A landing that scrolls. |
| O7 | Dialog headers are at least 48 px (were 72); footers pad 12 px under the buttons (were 22). | Keep 72 px for a description line. |
| O8 | The More sheet has a visible "More" title with Close beside it; Reminder text stops at a readable measure; the add form is at most 28 rem. | Keep the hidden title. |
| Leftover | Add a stop's Cancel shows from 640 px only; the phone sheet keeps one button. | Cancel on the phone too. |
| G4 | `app/` and `components/` copy only; `lib/` copy keeps straight quotes. | Convert `lib/` copy too. |
| N7 | Not built: 124 KB gzip, 46 KB brotli on 19 Nov's production capture. | Trim the page. |

## No-overlap check result

Run on 20 Nov 2026 over this file by a script that extracts every backticked `.ts`, `.tsx`, `.css`, `.md` and `.snap` path from each lane's table row and from each of that lane's task **Files:** lines. Lanes A to F: each table row and its tasks' Files lines list the same set (A 14, B 17, C 24, D 17, E 15, F 11; 98 paths). No path is owned by two lanes. Every path exists at HEAD except the two marked new (`components/ui/empty-state.test.tsx`, `components/globe/marker-filters.test.tsx`). Lane G is excluded by design: it starts only after A to F are merged.

Separately, the tests were searched for the strings and classes these tasks change ("Drag to reorder", "Nothing planned yet", `min-h-[12rem]`, `lg:grid-rows-[auto_auto]`, `[&>div>div>section]`, `data-trip-shell`, `FRAME`, `tzAbbrev`, the Plan date ranges with "–", the warning tone `stone`, `flex-1` on the phone sample cards). Every test that asserts one of them is in the lane that changes it; "Nothing planned yet" in Plan tests (`stop-open-body`, `day-section`) and in `lib/` tests is other copy that D4 does not touch, and `app/(app)/layout.test.tsx` asserts `<main>`'s own `has-[[data-trip-shell]]` class, which B1 does not change.
