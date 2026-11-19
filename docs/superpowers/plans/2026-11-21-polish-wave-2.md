# Polish Wave 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix the 42 rough edges of the 20 November polish audit that Cam marked for wave 2 (S9 is a measurement, not a build).

**Architecture:** Small, independent fixes in existing components, helpers and tokens. No schema change, no new dependency, no new route, no second `loading.tsx`. Four shared primitives land first (Task 0, run once by the orchestrator); after that eight lanes with no file in common run in parallel in one checkout.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before using any Next API), React 19, Tailwind v4, Vitest.

**Spec:** `docs/specs/2026-11-21-polish-wave-2.md`. Symptoms in detail: `docs/audits/2026-11-20-polish-audit.md` (same ids). Pictures: `.superpowers/polish/index.html` (local, not committed; real-trip data, never copy from it into a test).

## Global Constraints

- Branch `chore/polish-wave-2`, one shared checkout. Commit only your own files: `git commit -m "..." -- <paths>`. Never `git add -A`, never stage `AGENTS.md`, never push, never switch branch.
- Never run `npm run feedback:*`, `npm test`, `npm run build`, a dev server or anything that touches a database. Verification per task: `TZ=UTC npx vitest related --run <changed source files>`, `npx tsc --noEmit`, `npx eslint <changed files>`. A tsc error in a file you did not touch belongs to another lane: report it, do not fix it.
- Zero code comments unless the why is not obvious. No JSDoc. No features beyond the task. No refactors.
- Domain words are those of `CONTEXT.md` (Stop, Transport, Item is "a thing to do" in copy, Traveller, Globe, Review). Copy uses sentence case, no em dashes, no exclamation marks.
- Tests: update the existing test that covers what you change and add one for each new behaviour named in the task. No test may contain real names, places or bookings.
- Commit subject style: `fix(area): what a Traveller now sees`. End every commit message with the two trailer lines given in your dispatch.
- Layout fixes must hold from 320 to 2560 px wide and in the dark theme; use existing tokens and utility classes, no literal colours.

**Wave 2 additions**

- Where a task changes code that an existing comment describes, correct that comment in the same edit so it does not lie.
- The shared trip page is light-only by decision, so Lane G's L2 work is exempt from the dark-theme rule.
- Nothing may reveal a Surprise Stop's or Surprise thing to do's hidden content: never add a field, tooltip or `title` that is not already rendered as text on that element.
- Combine `ROW_NAME_CLASS` or `STAY_NAME_CLASS` with other classes through `cn()`, and never beside a `block` or other `display` class: `line-clamp-2` sets `display: -webkit-box` and a second display class can silently cancel the clamp.

## Orchestrator rulings (these override any task text below; read them before your lane)

1. **H1 pills are not built.** The capitals in a warning come from titles a Traveller typed. Task H1 builds only the "no gap" wording; skip every step in H1 and H2 that recognises status words or renders a pill. The H2 rule (names wrap to two lines, figures never wrap) is built as written.
2. **Dialog titles stay in Title Case**, as `COMPONENTS.md` says. Wherever a task says to change a title to sentence case (F5, E8, and any O2 step in C4, G6, H7), do the reverse: find the titles in that task's files that are NOT Title Case and make them Title Case. Do not edit `COMPONENTS.md`.
3. **K3 weather card** is not built (it needs a design decision). Everything else in K3 is.
4. **D3, overlap with the side rail:** Lane D must look in a browser (a dev server runs on http://localhost:3000 against the demo database; sign in as in `scripts/layout-audit/run.ts`; `NODE_PATH=$PWD/node_modules npx tsx <script>` for Playwright scripts kept outside the repo) at 800, 1024, 1280, 1440 and 1600 px on a Day view, find what overlaps the rail, and fix it within Lane D's files; if the cause is in another lane's file, report it instead.
5. **Extra item for Lane C (file `components/plan/day-section.tsx`):** at about 1040 px wide the Plan day header's "Open day" and "+ Add" buttons wrap onto a second line. Keep them on the header's line: the day title truncates before the buttons wrap (`min-w-0` on the title, `shrink-0 whitespace-nowrap` on the button group). One more task, one commit, `fix(plan): a day header keeps its buttons on one line`.
6. **O3:** build only what the plan builds (Import a booking, Add a stop). The rest waits for a real phone.
7. Everything listed under "Questions for the orchestrator" and not ruled here is built as the plan's task says.
8. The other lanes' edits are in the same checkout. `npx tsc --noEmit` may show errors in files you do not own while they work: report them, never fix them. Do not start, stop or restart the dev server.

## Task 0 (orchestrator, before any lane starts)

Four shared primitives used by several lanes. Run them in order in one subagent, one commit each, and dispatch the lanes only after all four are committed. These four files belong to Task 0 alone; no lane edits them.

### T0.1 (H2 rule): one class pair for a name beside an amount or date

**Files:** new `components/ui/row-text.ts`, new test `components/ui/row-text.test.ts`.

- [ ] Export exactly:
  - `ROW_NAME_CLASS = "min-w-0 flex-1 line-clamp-2 break-words"` (the name wraps to two lines, then ends in an ellipsis; `flex-1` is harmless where the parent is a block).
  - `ROW_FIGURE_CLASS = "shrink-0 whitespace-nowrap tabular-nums"` (the amount or date keeps its width and never wraps).
- [ ] Test: both strings as written (the call sites and their tests import them, so a change here is deliberate).
- [ ] Commit `fix(ui): one rule for a name beside an amount or date`.

### T0.2 (O2 rule): the destructive button in a dialog footer

**Files:** `components/ui/dialog.tsx` (beside `DialogFooter`, :338-372), test `components/ui/dialog.test.tsx`.

- [ ] Export `DIALOG_DESTRUCTIVE_CLASS = "border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"`. It is always used with `<Button variant="outline">` and a leading `<Trash2 aria-hidden="true" />`, as the first child of `DialogFooter` (so `sm:mr-auto` pushes it left of Cancel and the primary button).
- [ ] The rule the lanes apply (no new component): inside `DialogFooter`, Cancel is `<DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>`; the primary button is the last child; a delete uses `DIALOG_DESTRUCTIVE_CLASS`. `DialogFooter` is already sticky at the bottom of the scroll body, which is what keeps the primary button visible.
- [ ] Test: the export's value.
- [ ] Commit `fix(ui): one look for a delete in a dialog footer`.

### T0.3 (O4 rule): a text area that grows with its text

**Files:** `components/ui/textarea.tsx`, new test `components/ui/textarea.test.tsx`.

- [ ] Add prop `autoGrow?: boolean`. When set: classes `min-h-12 resize-none overflow-hidden px-4 py-2.5 font-semibold sm:text-[15px]` (so a one-line value looks like `Input`), and a layout effect keyed on `[autoGrow, props.value]` sets `el.style.height = "auto"` then `el.style.height = \`${el.scrollHeight + 4}px\`` (+4 for the 2px borders, the box is border-box). Keep the forwarded ref working: hold an inner ref and expose it with `React.useImperativeHandle(ref, () => inner.current!)`.
- [ ] Export `submitOnEnter(e: React.KeyboardEvent<HTMLTextAreaElement>): void`: on `Enter` without Shift and not `e.nativeEvent.isComposing`, `e.preventDefault()` and `e.currentTarget.form?.requestSubmit()`.
- [ ] Tests: with `autoGrow` the element's inline height is set after a value change (stub `scrollHeight` with `Object.defineProperty`); without it no inline height; `submitOnEnter` calls `requestSubmit` on Enter and not on Shift+Enter.
- [ ] Commit `fix(ui): a text area can grow with its text`.

### T0.4 (S3): Settings and Summary render their own page header

**Files:** `components/shell/app-paths.ts` (`PAGE_HEADER_ROUTES`, :40), test `components/shell/app-paths.test.ts`.

- [ ] Append `"settings"` and `"summary"` to `PAGE_HEADER_ROUTES`. `TripHeaderFrame` then hides the layout's trip header on those routes; Lanes G (G1) and H (H6) add the `PageHeader` there. Between this commit and theirs, those two pages have no h1; that is expected and must not be "fixed" by a lane.
- [ ] Test: `isPageHeaderPath("/trips/x/settings")` and `("/trips/x/summary")` are true; `"/trips/x/print"` stays false.
- [ ] Commit `fix(trips): Settings and Summary use the page header`.

## Lanes

Every path below is owned by exactly one lane. A lane may read any file but writes only its own.

| Lane | Area | Items | Files (source and test) |
|---|---|---|---|
| A | Shell and theme | S1, S2, S4, K2, K3 (shadows), O5, O6 | `app/(app)/layout.tsx`, `app/(app)/layout.test.tsx`, `app/(app)/trips/[tripId]/layout.tsx`, `app/(app)/trips/[tripId]/layout.test.tsx`, `components/ui/page-header.tsx`, `components/ui/page-header.test.tsx`, `components/shell/trip-switcher.tsx`, `components/shell/trip-switcher.test.tsx`, `components/shell/sidebar.tsx`, `components/shell/sidebar.test.tsx`, `components/shell/sidebar-nav.tsx`, `components/shell/sidebar-nav.test.tsx`, `components/shell/sidebar-footer.tsx`, `components/shell/app-tab-bar.tsx`, `components/shell/app-tab-bar.test.tsx`, `components/ui/dock.tsx`, `components/ui/dock.test.tsx`, `app/globals.css`, `app/globals-tokens.test.ts`, `components/feedback/feedback-launcher.tsx`, `components/feedback/feedback-launcher.test.tsx`, `components/trip/notification-bell.tsx`, `components/trip/notification-bell.test.tsx` (23) |
| B | Trips list and trip home | T1, H2 (home cards), H3, H4, H8 | `components/trips/tally-card.tsx`, `components/trips/tally-card.test.tsx`, `components/trips/travels-map-card.tsx`, `components/trips/travels-map-card.test.tsx`, `components/trips/next-step-chip.tsx`, `components/trips/trip-card.test.tsx`, `components/trip/upcoming-payments-card.tsx`, `components/trip/upcoming-payments-card.test.tsx`, `components/trip/home/still-to-book-card.tsx`, `components/trip/home/still-to-book-card.test.tsx`, `components/trip/home/desktop/trip-cost-tile.tsx`, `components/trip/home/desktop/trip-cost-tile.test.tsx`, `components/trip/home/desktop/spend-so-far-tile.tsx`, `components/trip/home/desktop/spend-so-far-tile.test.tsx`, `components/trip/home/desktop/today-tile.tsx`, `components/trip/home/desktop/today-tile.test.tsx`, `components/trip/home/phase-past.tsx`, `components/trip/home/phase-past.test.tsx`, `components/trip/home/spacing.test.ts`, `components/trip/home/countdown-hero.tsx`, `components/trip/home/countdown-hero.test.tsx`, `components/trip/home/desktop/countdown-tile.tsx`, `components/trip/home/desktop/countdown-tile.test.tsx`, `components/trip/home/budget-glance.tsx`, `components/trip/home/budget-glance.test.tsx`, `components/trip/home/phase-planning.tsx`, `components/trip/home/phase-planning.test.tsx` (27) |
| C | Plan | P3, P4, P5, O2 (Stop dialogs) | `components/plan/leg-pill.tsx`, `components/plan/leg-pill.test.tsx`, `components/plan/mobile/mobile-stop-row.tsx`, `components/plan/mobile/mobile-stop-row.test.tsx`, `components/plan/stay-panel.tsx`, `components/plan/stay-panel.test.tsx`, `components/plan/stop-row.tsx`, `components/plan/stop-row.test.tsx`, `components/plan/day-section.tsx`, `components/plan/day-section.test.tsx`, `components/plan/mobile/add-stop-sheet.tsx`, `components/plan/mobile/add-stop-sheet.test.tsx`, `components/trip/stop-form-dialog.tsx`, `components/trip/stop-form-dialog.test.tsx`, `components/trip/delete-stop-dialog.tsx`, `components/trip/delete-stop-dialog.test.tsx`, `components/trip/itinerary-manager.tsx`, `components/trip/itinerary-manager.test.tsx` (18) |
| D | Day | D1, D2, D3, D4, D5, D6, K3 (stay cards), C1 (title spacing) | `components/trip/timeline.tsx`, `components/trip/timeline.test.tsx`, `components/trip/day/day-strip.tsx`, `components/trip/day/day-strip.test.tsx`, `components/trip/day/day-slot-skeleton.tsx`, new `components/trip/day/day-slot-skeleton.test.tsx`, `components/trip/stay-card.tsx`, `components/trip/day/tonight-card.tsx`, `components/trip/day/tonight-card.test.tsx`, `components/day/day-add-menu.tsx`, `components/day/day-add-menu.test.tsx`, `app/(app)/trips/[tripId]/day/page.test.tsx` (12) |
| E | Money, Calendar, Checklists, Files, Reviews | M2, C1 (Agenda heading), K1, H5, F1, R1, O2 (titles), O4 (checklist) | `lib/money/breakdown.ts`, `lib/money/breakdown.test.ts`, `components/trip/calendar-views.tsx`, `components/trip/calendar-views.test.tsx`, `components/trip/checklist.tsx`, `components/trip/checklist.test.tsx`, `app/(app)/trips/[tripId]/checklists/checklists-layout.tsx`, `app/(app)/trips/[tripId]/checklists/checklists-layout.test.tsx`, `components/trip/shopping-list.tsx`, `components/trip/shopping-list.test.tsx`, `components/trip/reminders-card.tsx`, `components/trip/reminders-card.test.tsx`, `components/trip/packing-templates-bar.tsx`, `components/trip/files-index.tsx`, `components/trip/files-index.test.tsx`, `components/trip/attachment-list.tsx`, `components/trip/attachment-list.test.tsx`, `lib/attachment-name.ts`, new `lib/attachment-name.test.ts`, new `components/trip/middle-truncate.tsx`, `components/trip/reviews/finding-list.tsx`, `components/trip/reviews/finding-list.test.tsx`, `app/(app)/trips/[tripId]/reviews/page.tsx`, `app/(app)/trips/[tripId]/reviews/page.test.tsx` (24) |
| F | Forms, dialogs and sheets | E1, O1, O2 (most dialogs), O3 (Import a booking), O4 (Reminder edit), K1 (date field) | `components/ui/field.tsx`, new `components/ui/field.test.tsx`, `components/ui/input.tsx`, new `components/ui/input.test.tsx`, `components/ui/place-combobox.tsx`, `components/ui/place-combobox.test.tsx`, `components/trip/location-combobox.tsx`, `components/trip/location-combobox.test.tsx`, `components/trip/transport-form-dialog.tsx`, `components/trip/transport-form-dialog.test.tsx`, `components/trip/item-form-dialog.tsx`, `components/trip/item-form-dialog.test.tsx`, `components/trip/accommodation-form-dialog.tsx`, `components/trip/accommodation-form-dialog.test.tsx`, `components/trip/chapter-form-dialog.tsx`, `components/trip/chapter-form-dialog.test.tsx`, `components/trip/schedule-item-dialog.tsx`, `components/trip/schedule-item-dialog.test.tsx`, `components/trip/cost-editor.tsx`, `components/trip/cost-editor.test.tsx`, `components/trip/other-cost-editor.tsx`, `components/trip/other-cost-editor.test.tsx`, `components/booking-import/booking-import-sheet.tsx`, `components/booking-import/booking-import-sheet.test.tsx`, `components/trip/promote-fork-dialog.tsx`, `components/trip/promote-fork-dialog.test.tsx`, `components/trip/duplicate-trip-dialog.tsx`, `components/trip/add-reminder-dialog.tsx`, `components/trip/add-reminder-dialog.test.tsx`, `COMPONENTS.md` (30) |
| G | Settings, Account, Globe, Help, Share | S3 (Settings), E2, G1, G2, G3, L2, O2 (Settings and Globe dialogs) | `app/(app)/trips/[tripId]/settings/page.tsx`, `app/(app)/trips/[tripId]/settings/page.test.tsx`, `components/trip/settings/share-links-panel.tsx`, `components/trip/settings/share-links-panel.test.tsx`, `components/trip/settings/calendar-feed-panel.tsx`, `components/trip/settings/calendar-feed-panel.test.tsx`, `components/trip/settings/digest-panel.tsx`, `components/trip/settings/digest-panel.test.tsx`, `components/trip/settings/danger-zone.tsx`, `components/trip/settings/danger-zone.test.tsx`, `app/(app)/account/page.tsx`, `app/(app)/account/page.test.tsx`, `components/account/profile-card.tsx`, `components/account/profile-card.test.tsx`, `components/account/connected-apps-panel.tsx`, `components/account/connected-apps-panel.test.tsx`, `components/globe/globe-map.tsx`, `components/globe/globe-map.test.tsx`, `components/globe/marker-form.tsx`, `components/globe/marker-form.test.tsx`, `components/globe/globe-view.test.tsx`, `components/trip/help-guide.tsx`, `components/trip/help-guide.test.tsx`, `components/trip/help-legend.tsx`, `components/trip/help-legend.test.tsx`, `app/share/[token]/page.tsx`, `app/share/[token]/page.test.tsx`, `components/trip/route-map-preview.tsx`, `components/trip/route-map-preview.test.tsx` (29) |
| H | Warnings and Summary | H1, H2 (Next steps, Sort these out), U1, U2, U3, S3 (Summary), O2 (Make it fit) | `lib/flags.ts`, `lib/flags.test.ts`, `lib/next-steps.ts`, `lib/next-steps.test.ts`, `lib/sort-these-out.ts`, `lib/sort-these-out.test.ts`, `components/trip/flag-list.tsx`, `components/trip/flag-list.test.tsx`, `components/trip/home/next-steps-card.tsx`, `components/trip/home/next-steps-card.test.tsx`, `components/trip/home/desktop/sort-these-out-rows.tsx`, `components/trip/home/desktop/sort-these-out-tile.test.tsx`, `components/trip/make-it-fit.tsx`, `components/trip/make-it-fit.test.tsx`, `app/(app)/trips/[tripId]/summary/page.tsx`, `app/(app)/trips/[tripId]/summary/page.test.tsx` (16) |

Task 0 owns `components/ui/row-text.ts`, `components/ui/row-text.test.ts`, `components/ui/dialog.tsx`, `components/ui/dialog.test.tsx`, `components/ui/textarea.tsx`, `components/ui/textarea.test.tsx`, `components/shell/app-paths.ts`, `components/shell/app-paths.test.ts`. After Task 0 there are no cross-lane dependencies. The decisions ledger `docs/audits/2026-11-20-polish-decisions.md` is written by the orchestrator only (see the last section); no lane edits it.

**No-overlap check.** Every backticked path in the table above and in each lane's task Files lines was extracted per lane by script; no path appears in two lanes, or in a lane and Task 0 (result recorded at the end of this plan). If a test you need to touch is not in your lane's list, stop and report it rather than editing it.

## Review Focus

1. **Dark rail and tab bar (K2).** On every page in the dark theme: the side rail, Dock and trips-level tab bar are the dark card colour; every label (nav rows, ALL TRIPS eyebrow, "Account", tab labels) is readable; the active row or tab (coral) has dark ink text, not cream; the search field, trip switcher and Back to card still show their borders. In the light theme nothing has changed.
2. **The phone page header at 320 px (S2, S3).** A long trip name in the eyebrow truncates beside share, bell and a fork pill instead of pushing them off screen; the h1 never overflows beside the round phone action; Settings and Summary have exactly one h1 and no layout trip header above it; Print still has its plain title.
3. **Warnings text (H1).** A message with "only 10 min" is unchanged; only exactly "only 0 min" becomes "no gap" (an overlap also reads "no gap", which is the open question already in the ledger); a title containing "(UNESCO)" or "(BA 15)" is untouched, and only the listed status words become a pill; a warning about a Surprise reads exactly as before apart from those two changes.
4. **The Day view (D3, D4, D6).** Arrow keys and the date's own arrows still change day once the strip arrows are gone; a loading day's placeholder is replaced by the real day without a jump on phone and desktop; on a phone "Add to this day" opens the sheet, and choosing a row closes it and opens the Item or Transport form with focus inside the form (two dialogs must never be open at once).
5. **Dialog footers on a phone (O2, O3, P2-adjacent).** Add a stop, Import a booking and every edited dialog keep the primary button pinned and reachable with the keyboard up; a submit button moved into `DialogFooter` but outside its `<form>` still submits (it needs `form={formId}`); the new Cancel in Transport edit closes without saving.

---

## Lane A: Shell and theme

### Task A1 (S1): the phone top bar hides what scrolls under it

**Files:** `app/(app)/layout.tsx` (:157, the `<header className="tp-vt-top-bar …">`), test `app/(app)/layout.test.tsx`.

The bar is `bg-background/95 … backdrop-blur supports-[backdrop-filter]:bg-background/60`: wherever blur is supported it is 60% opaque.

- [ ] Change only `supports-[backdrop-filter]:bg-background/60` to `supports-[backdrop-filter]:bg-background/90`. Keep `backdrop-blur` and the `/95` fallback.
- [ ] Test: the header carries `backdrop-blur` and `supports-[backdrop-filter]:bg-background/90`, and no class ending `/60`.
- [ ] Verify, commit `fix(shell): page content no longer shows through the phone top bar`.

### Task A2 (S2): share and bell share the trip name's row on a phone

**Files:** `components/ui/page-header.tsx` (`PageHeader`, :28-80), `app/(app)/trips/[tripId]/layout.tsx` (page content wrapper, :229), tests `components/ui/page-header.test.tsx`, `app/(app)/trips/[tripId]/layout.test.tsx`.

Below md the header is a two-column grid whose row 1 is the trailing cluster alone (`col-span-2 row-start-1`), so share and bell sit on an empty row and the eyebrow and h1 start on row 2. On a page-header route the trip layout also stacks its own `pt-6` (`data-trip-content`, :151) on the content wrapper's `py-6` (:229), 48 px above the header.

- [ ] Below md the title column dissolves into the grid so its parts can be placed: title column div becomes `col-start-1 flex min-w-0 flex-col max-md:contents md:min-w-[14rem] md:flex-1` (drop the `titleRow` class from it).
- [ ] Rows below md: eyebrow `<p>` adds `col-start-1 row-start-1 self-center`; h1 adds `col-start-1` and `row-start-2` when there is an eyebrow or a trailing cluster, else `row-start-1`; meta `<p>` adds `col-span-2` and the row after the h1 (`row-start-3` or `row-start-2`).
- [ ] Trailing wrapper: `col-span-2 row-start-1 flex justify-end md:contents` becomes `col-start-2 row-start-1 flex items-center justify-end self-center md:contents`. Mobile action wrapper: `col-start-2 self-center md:hidden` plus the h1's row class. Header grid `gap-y-3` becomes `gap-y-1`. Leave every `md:` class as it is, so 768 px and up do not change.
- [ ] Trip layout :229: add `[[data-trip-page-header]+&]:pt-0` to the content wrapper's classes (the wrapper is the next sibling of `TripHeaderFrame`, which carries `data-trip-page-header` exactly on page-header routes), so those pages keep one 24 px gap under the top bar.
- [ ] Tests (page-header): with `eyebrow`, `trailing` and `mobileAction`: the trailing wrapper has `col-start-2 row-start-1` and no `col-span-2`; the h1 and the mobile action wrapper have `row-start-2`; with only a `title`, the h1 has `row-start-1`. (layout): the content wrapper's class contains `[[data-trip-page-header]+&]:pt-0`.
- [ ] Verify, commit `fix(shell): share and bell sit beside the trip name, so a phone page starts at its title`.

### Task A3 (S4): the side rail shows the trip's name and holds still while it loads

**Files:** `components/shell/trip-switcher.tsx` (`TripSwitcher` card trigger, :105-108), `components/shell/sidebar.tsx` (`SidebarTripPlaceholder` :88-104, `SidebarTripSkeleton` :107-114), tests `components/shell/trip-switcher.test.tsx`, `components/shell/sidebar.test.tsx`.

The card's name is `w-full truncate`. The skeleton is `gap-2.5` with bars `h-3.5` + `gap-1.5` + `h-2.5` (30 px of content) and no chevron, while the real trigger is `gap-2` with a 20 px name line, a 16 px status line and a 16 px chevron (36 px), so the rail jumps when the switcher arrives. The rail already scrolls on its own (`h-dvh overflow-y-auto`, sidebar.tsx:53; the Dock via `DOCK_STICKY_CLASS` and dock.tsx:43): no change, add a guard test.

- [ ] Card variant name span: `w-full truncate text-sm font-bold` becomes `line-clamp-2 w-full break-words text-sm font-bold`. Status line and the `pill` variant (`max-w-40 truncate`) unchanged. `SidebarTripPlaceholder`'s name span: `truncate` becomes `line-clamp-2 break-words`.
- [ ] `SidebarTripSkeleton`: outer `gap-2.5` becomes `gap-2`; inner becomes `<span className="flex min-w-0 flex-1 flex-col"><span className="flex h-5 items-center"><Skeleton className="h-3.5 w-28" /></span><span className="flex h-4 items-center"><Skeleton className="h-2.5 w-16" /></span></span>` followed by `<span className="size-4 shrink-0" />`. A two-line name can still be taller than the skeleton; that is accepted.
- [ ] Tests: the card trigger's name has `line-clamp-2` and not `truncate`; the pill still has `truncate`; the skeleton has an `h-5` row and an `h-4` row; the `aside` has `h-dvh` and `overflow-y-auto`.
- [ ] Verify, commit `fix(shell): the side rail shows a trip's full name and holds still while it loads`.

### Task A4 (K2): the rail and the trips-level tab bar are dark in the dark theme

**Files:** `app/globals.css` (light tokens :80-196, `.dark` :198-291, `@theme inline` :365-497, `@utility island` :506-519), `components/shell/sidebar.tsx` (:53), `components/ui/dock.tsx` (:43, active item :56), `components/shell/app-tab-bar.tsx` (:40, :44), `components/shell/sidebar-nav.tsx` (`rowClass` :42-48, `EYEBROW` :80), `components/shell/sidebar-footer.tsx` (:46), tests `app/globals-tokens.test.ts`, `components/shell/sidebar.test.tsx`, `components/ui/dock.test.tsx`, `components/shell/app-tab-bar.test.tsx`, `components/shell/sidebar-nav.test.tsx`.

Sidebar and Dock are `island bg-sun`; `island` pins every text token to dark ink, and dark `--sun` is still tan (42 68% 69%). AppTabBar is `bg-sun` without `island`, so its labels are dark `--muted-foreground` on tan. Trip pages use `MobileTabBar` on `bg-background` and are already dark. `island` cannot be undone by a `dark:` class (it re-scopes `--foreground` itself), so the rail needs its own utility.

Contrast, computed from the HSL tokens:

| Pair | Now | After |
|---|---|---|
| Tab label `--muted-foreground` 38 11% 62% (#A9A193) on dark `--sun` (#E6C57A), trips-level tab bar | 1.54:1 | (rail is no longer sun) |
| Tab/rail label `--muted-foreground` (#A9A193) on dark `--card` 38 10% 16% (#2D2A25) | | 5.59:1 |
| Rail text `--foreground` 40 37% 89% (#EDE6D9) on #2D2A25 | | 11.57:1 |
| Active row/tab `--on-accent` 36 10% 10% (#1C1A17) on dark `--coral` 13 73% 67% (#E8886D) | | 6.77:1 |
| Light theme, `--on-accent-muted` (#302D29) on `--sun` (#FFD166) | 9.66:1 | 9.66:1 (unchanged) |

- [ ] Tokens: in the light block add `--rail: 42 100% 70%; /* = sun */`; in `.dark` add `--rail: 38 10% 16%; /* = card */`; in `@theme inline` add `--color-rail: hsl(var(--rail));` (gives `bg-rail`, `border-rail`).
- [ ] After `@utility island`, add `@utility rail` containing the same ten custom properties as `island` and `color: hsl(var(--on-accent));`, plus a nested block `&:where(.dark *) { … }` that sets each of those ten properties to `inherit` and `color: hsl(var(--foreground));`, so in the dark theme the rail uses the page's own dark tokens. One comment line above it: the rail is a sun island in light and the dark card in dark (K2). If Tailwind rejects the nested block inside `@utility`, put the same declarations in a plain rule `.dark .rail { … }` directly after the utility instead.
- [ ] Sidebar :53 and Dock :43: replace `island` with `rail` and `bg-sun` with `bg-rail`. AppTabBar :44: `className="bg-sun"` becomes `className="rail bg-rail"` (tailwind-merge drops TabBar's `bg-background`); :40 the dot's `border-sun` becomes `border-rail`.
- [ ] Active coral rows must carry dark ink in both themes: `rowClass` active branch adds `text-on-accent`; Dock :56 active branch adds `text-on-accent`. `EYEBROW` (:80) and the footer's "Account" (:46): `text-on-accent-muted` becomes `text-muted-foreground` (inside the rail that is `--on-accent-muted` in light, unchanged, and the dark muted text in dark). Leave the Dock's logo tile as it is.
- [ ] Tests: `globals-tokens.test.ts` asserts `.dark` declares `--rail: 38 10% 16%`, the light block `--rail: 42 100% 70%`, and that `@utility rail` exists with a `:where(.dark *)` block; sidebar and Dock roots have `rail` and `bg-rail` and no `bg-sun`; the app tab bar has `rail bg-rail` and its dot `border-rail`; an active sidebar row and an active Dock item have `text-on-accent`.
- [ ] Verify, commit `fix(theme): the side rail and the Trips tab bar are dark in the dark theme`.

### Task A5 (K3, shadows): hard shadows show against the dark page

**Files:** `app/globals.css` (`.dark`, after `--shadow-ink` :290), test `app/globals-tokens.test.ts`.

The hard shadows are `N px N px 0 hsl(var(--shadow-ink))`; dark `--shadow-ink` is 40 13% 5% (#0E0D0B): 1.19:1 against the page (#22201C) and 1.35:1 against a card (#2D2A25), so they vanish. `--shadow-ink` itself must stay dark because the soft dialog edges use `hsl(var(--shadow-ink)/0.3)`.

- [ ] In `.dark` only, re-declare `--shadow-1` … `--shadow-5` and `--shadow-pressed` with the same offsets as `:root` but `hsl(var(--border))` (dark border 39 8% 33%, #5B564D): 2.25:1 against the page, 1.97:1 against a card. Do not touch `--shadow-ink` or `--shadow-cta`.
- [ ] Test: `.dark` declares `--shadow-2: 4px 4px 0 hsl(var(--border))` and still declares `--shadow-ink: 40 13% 5%`.
- [ ] Verify, commit `fix(theme): hard shadows show against the dark page`.

### Task A6 (O5): a Feedback note on a phone uses the panel's width

**Files:** `components/feedback/feedback-launcher.tsx` (Show resolved :670-679, `SentEntry` :750-801, `PendingEntry` :803-818), test `components/feedback/feedback-launcher.test.tsx`.

Each note is one flex row: text column, site badge, status badge and delete button side by side, so the text gets half the panel. "Show resolved" is a ghost button with no visible state.

- [ ] `SentEntry`: `<li className="flex flex-col gap-1">`; first child is a row `flex items-start gap-2` holding the meta line (`min-w-0 flex-1`), the site badge, the status badge and the delete button; the body `<p>` and the resolution `<p>` follow as full-width children of the `li`. `PendingEntry` the same shape (meta line plus Pending badge, then body).
- [ ] Replace the Show resolved button with `<label className="flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-foreground"><Switch checked={showResolved} onCheckedChange={setShowResolved} />Show resolved ({hiddenCount})</label>` (`Switch` from `components/ui/switch`). The text no longer flips to "Hide resolved".
- [ ] Tests: a sent note's body `<p>` is a direct child of its `li`, not of the badge row; a `switch` named /show resolved/ toggles the resolved notes in and out; update tests that clicked "Hide resolved".
- [ ] Verify, commit `fix(feedback): a note on a phone uses the panel's width and Show resolved is a switch`.

### Task A7 (O6): the phone Notifications popover keeps a gutter and stops above the tab bar

**Files:** `components/trip/notification-bell.tsx` (`DropdownMenuContent` :90-94, list :124), test `components/trip/notification-bell.test.tsx`.

The content is `w-[calc(100vw-1rem)]` (8 px from each edge) with no collision padding, and its list is a fixed `max-h-80`.

- [ ] Content: add `collisionPadding={TAB_BAR_MENU_COLLISION_PADDING}` (exported by `components/ui/tab-bar.tsx`: 16 px each side, 16 + 76 at the bottom); width `w-[calc(100vw-1rem)]` becomes `w-[calc(100vw-2rem)]` (`sm:w-[22rem]` unchanged).
- [ ] List :124: `max-h-80` becomes `max-h-[min(20rem,calc(var(--radix-dropdown-menu-content-available-height)-4.5rem))]` (4.5rem is the popover's own header row), so it never runs under the tab bar.
- [ ] Tests: the content has `w-[calc(100vw-2rem)]`; the list's class contains `--radix-dropdown-menu-content-available-height`.
- [ ] Verify, commit `fix(notifications): the phone popover keeps a gutter and stops above the tab bar`.

## Lane B: Trips list and trip home

### Task B1 (T1): Trips list controls are never clipped from 768 to 1440 px

**Files:** `components/trips/tally-card.tsx` (header row :55), `components/trips/travels-map-card.tsx` (overlay row :160, chip row :169), `components/trips/next-step-chip.tsx` (:19, :24), tests `components/trips/tally-card.test.tsx`, `components/trips/travels-map-card.test.tsx`, `components/trips/trip-card.test.tsx`.

- [ ] Tally header `flex items-center justify-between gap-2` becomes `flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5`, so the Planned/Been toggle drops under "Tally" instead of being clipped.
- [ ] Map overlay row (:160): add `right-3.5 md:right-4` so the row is bounded by the card. Chip row (:169): `pointer-events-auto flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none]`; each chip keeps `shrink-0` (add it to the chip class if missing). `fitChips` still decides the `+N`; the scroll is the guard when its measurement is short.
- [ ] Up next chip (:19): drop `whitespace-nowrap`; title span (:24) `truncate` becomes `cn(ROW_NAME_CLASS, "text-left")` (`ROW_NAME_CLASS` from `components/ui/row-text`).
- [ ] Tests: tally header has `flex-wrap`; the chip row has `overflow-x-auto` and `min-w-0`; the overlay row has `right-3.5`; the Up next chip's title has `line-clamp-2` and not `truncate`.
- [ ] Verify, commit `fix(trips): the Trips list's toggle, map filters and Up next chip are never clipped`.

### Task B2 (H2, trip home cards): a name wraps to two lines, its amount or date never wraps

**Files:** `components/trip/upcoming-payments-card.tsx` (row :49, label :51, amount :52-56, timing :60-66), `components/trip/home/still-to-book-card.tsx` (`StillToBookRowLink` :152), `components/trip/home/desktop/trip-cost-tile.tsx` (labels :111, :135), tests `components/trip/upcoming-payments-card.test.tsx`, `components/trip/home/still-to-book-card.test.tsx`, `components/trip/home/desktop/trip-cost-tile.test.tsx`.

The H2 rule is T0.1's `ROW_NAME_CLASS` for the name and `ROW_FIGURE_CLASS` for the amount or date. Its call sites: Upcoming payments, Still to book, Trip cost tile's Next payment (this task); Next steps and Sort these out (Lane H, Task H2); the Up next chip (Task B1). The desktop "Next payment" stat tile already clamps its sub line (`stat-tile.tsx:30`).

- [ ] Upcoming payments: row drops `flex-wrap`; label `min-w-0 flex-1 truncate font-extrabold text-foreground` becomes `cn(ROW_NAME_CLASS, "font-extrabold text-foreground")`; amount wrapper becomes `cn(ROW_FIGURE_CLASS, "flex flex-col items-end")` and its two inner spans drop `break-words`; the timing span gets `shrink-0 whitespace-nowrap`.
- [ ] Still to book: title `block truncate text-[15px] …` becomes `cn(ROW_NAME_CLASS, "text-[15px] …")` (drop `block`).
- [ ] Trip cost tile: both `truncate text-sm font-semibold` label `<p>`s become `cn(ROW_NAME_CLASS, "text-sm font-semibold")` (`mt-1` kept on the second).
- [ ] Tests: in each card a long name element has `line-clamp-2` and not `truncate`; the payment amount wrapper has `whitespace-nowrap` and `shrink-0`.
- [ ] Verify, commit `fix(home): a payment or booking name wraps to two lines before it is cut, and its amount stays whole`.

### Task B3 (H3): the countdown's chips have room and "days to go" reads on one line

**Files:** `components/trip/home/countdown-hero.tsx` (number row :56, unit :60-63, chips :67), `components/trip/home/desktop/countdown-tile.tsx` (`numberRow` :68-100, number blocks :157 and :179), tests `components/trip/home/countdown-hero.test.tsx`, `components/trip/home/desktop/countdown-tile.test.tsx`.

The two-line unit is deliberate today (`replace(" ", "\n")` with `whitespace-pre-line`; `unit` rendered as a two-span column); the spec now asks for one line. In the desktop tile without a photo the stats row (`mt-4`) and the number (`mt-auto`) touch when the tile is short.

- [ ] Phone hero: unit span drops `whitespace-pre-line` and the `.replace(" ", "\n")`, adds `whitespace-nowrap`; the number row adds `flex-wrap gap-x-2.5` (so at 320 px the unit drops under a three-digit number instead of overflowing); chips row `mt-3` becomes `mt-5`.
- [ ] Desktop tile: the unit renders as one `<span className="whitespace-nowrap">{unit.join(" ")}</span>` in place of the two-span column, keeping its size and leading classes; the number row's flex gets `flex-wrap`; both number blocks `mt-auto` become `mt-auto pt-4`. `countdownParts` is unchanged.
- [ ] Tests: hero unit text is "days to go" (no newline) with `whitespace-nowrap`; chips row has `mt-5`; desktop unit is one element; the number block has `pt-4`.
- [ ] Verify, commit `fix(home): the countdown's chips have room and "days to go" reads on one line`.

### Task B4 (H4): desktop cards end where their content ends

**Files:** `components/trip/home/desktop/today-tile.tsx` (Card :43, plan section :68), `components/trip/home/phase-past.tsx` (wrap Card :203, CTAs :209), `components/trip/home/desktop/trip-cost-tile.tsx` (Card :96, :103, :123, :136), `components/trip/home/desktop/spend-so-far-tile.tsx` (Card :41, :57, :64), tests `components/trip/home/desktop/today-tile.test.tsx`, `components/trip/home/phase-past.test.tsx`, `components/trip/home/desktop/trip-cost-tile.test.tsx`, `components/trip/home/desktop/spend-so-far-tile.test.tsx`, `components/trip/home/spacing.test.ts`.

Each card is `h-full` in a grid row set by its neighbour (map tile, countdown) and pins its last block with `mt-auto`, leaving an empty middle. The grid templates and the Sort these out tile stay as they are.

- [ ] Remove `h-full` from the four Cards. Today tile: the plan section's `flex-1` goes. Wrap card: CTAs `mt-auto` goes (the card's `gap-4` spaces them). Trip cost: `mt-auto border-t-2` becomes `mt-4 border-t-2`; `mt-auto` around progress becomes `mt-4`; `mt-auto` around the due line becomes `mt-2`. Spend so far: `mt-auto` link becomes `mt-3`, `mt-auto flex flex-col` becomes `mt-4 flex flex-col`.
- [ ] If `spacing.test.ts`'s allowlist names the wrap card's `mt-auto`/gap comment, update that entry and the comment beside the CTAs.
- [ ] Tests: none of the four cards has `h-full`; none contains an element with `mt-auto`.
- [ ] Verify, commit `fix(home): desktop cards end where their content ends`.

### Task B5 (H8): money under 1,000 shows its cents on the phone tiles

**Files:** `components/trip/home/budget-glance.tsx` (:25, :29), `components/trip/home/phase-planning.tsx` (desktop stat tiles :196, :197, :205), tests `components/trip/home/budget-glance.test.tsx`, `components/trip/home/phase-planning.test.tsx`.

`formatMoneyCompact` caps fractions at one digit ("$950.5"). `formatMoneyAuto` (`lib/money/money.ts:297`) already gives full decimals under 1,000, compact from 1,000, and a bare "$0". The desktop Trip cost and Spend tiles already use it.

- [ ] Replace `formatMoneyCompact` with `formatMoneyAuto` at those five calls (the desktop stat tiles too, so the two layouts agree). Do not change `formatMoneyCompact`.
- [ ] Tests: 95050 minor AUD shows "$950.50"; 1840000 shows "$18.4k"; 0 shows "$0"; update phase-planning assertions that expected one decimal.
- [ ] Verify, commit `fix(home): money under 1,000 shows its cents on the phone tiles`.

## Lane C: Plan

### Task C1 (P3): a phone Plan card and Transport pill keep the destination and shorten the date

**Files:** `components/plan/leg-pill.tsx` (pill :97-128, stack :40, entry :47, wrapper :54), `components/plan/mobile/mobile-stop-row.tsx` (name block :51, right column :65-67), tests `components/plan/leg-pill.test.tsx`, `components/plan/mobile/mobile-stop-row.test.tsx`.

In the pill the destination is `min-w-0 truncate` and the date/time is `shrink-0`; in the card the name block is `flex-1` and the date column `shrink-0`. Both give the width to the date.

- [ ] Pill: label `min-w-0 truncate` becomes `min-w-0 shrink truncate`; sub `shrink-0 …` becomes `min-w-0 shrink-[100] truncate …` (the date gives up width a hundred times faster, then the name truncates).
- [ ] One width rule for pills stacked in a leg: below md, stack `items-start` adds `max-md:items-stretch`, the per-leg entry and its relative wrapper add `max-md:w-full`, and the button adds `max-md:w-full max-md:justify-start`, so stacked pills share the column's width. md and up unchanged.
- [ ] Card: name block `min-w-0 flex-1` becomes `min-w-0 flex-auto`; right column `flex shrink-0 flex-col items-end gap-1` becomes `flex min-w-0 shrink-[100] flex-col items-end gap-1`; its date span adds `max-w-full truncate`; the nights pill adds `max-w-full`.
- [ ] Tests: the pill's sub has `shrink-[100]` and `truncate`, the label has no `shrink-0`; the button has `max-md:w-full`; the card's right column has `shrink-[100]` and the name block `flex-auto`.
- [ ] Verify, commit `fix(plan): a phone Plan card and Transport pill keep the destination and shorten the date`.

### Task C2 (P4): a stay's address and a Stop's note show two lines and their full text on hover

**Files:** `components/plan/stay-panel.tsx` (desktop StayCard "Where" :178-181), `components/plan/stop-row.tsx` (note :219), tests `components/plan/stay-panel.test.tsx`, `components/plan/stop-row.test.tsx`.

- [ ] Address `<p>` `items-center` becomes `items-start`; its span `min-w-0 truncate` becomes `min-w-0 line-clamp-2 break-words` with `title={a.address}`. The phone stay box (:139) is unchanged.
- [ ] Note `mt-1 truncate text-xs text-muted-foreground` becomes `mt-1 line-clamp-2 break-words text-xs text-muted-foreground` with `title={stop.notes}` (the same text already rendered; nothing new is exposed for a Surprise).
- [ ] Tests: both elements have `line-clamp-2`, not `truncate`, and a `title` equal to their text.
- [ ] Verify, commit `fix(plan): a stay's address and a Stop's note show two lines and their full text on hover`.

### Task C3 (P5): "Add a title" can be read on its yellow band

**Files:** `components/plan/day-section.tsx` (`DayTitle` :114-183, placeholder span :179, title input ~:146), test `components/plan/day-section.test.tsx`.

The band is `bg-sun text-on-accent` (:433); the placeholder is `text-foreground/45`, which follows the theme's foreground. Contrast now: light 2.63:1 (ink 45% on #FFD166), dark 1.14:1 (cream 45% on #E6C57A).

- [ ] `text-foreground/45` becomes `text-on-accent/70`: light 5.22:1, dark 4.98:1, still lighter than a real title. If the title `<input>` has a placeholder, add `placeholder:text-on-accent/70` to it.
- [ ] Test: the "Add a title" span has `text-on-accent/70`.
- [ ] Verify, commit `fix(plan): "Add a title" can be read on its yellow band`.

### Task C4 (O2, Stop dialogs): Add a stop pins its button, and Stop dialogs match the others

**Files:** `components/plan/mobile/add-stop-sheet.tsx` (submit :220-222), `components/trip/stop-form-dialog.tsx` (`Segmented` :327-338), `components/trip/delete-stop-dialog.tsx` (Cancel :68, :88, :114), `components/trip/itinerary-manager.tsx` (Cancel ~:2440), tests `components/plan/mobile/add-stop-sheet.test.tsx`, `components/trip/stop-form-dialog.test.tsx`, `components/trip/delete-stop-dialog.test.tsx`, `components/trip/itinerary-manager.test.tsx`.

- [ ] Add a stop: wrap the submit `Button` in `<DialogFooter>` as the form's last child (import from `components/ui/dialog`); drop `mt-auto w-full` (the footer stretches its children on a phone). It stays inside the `<form>`, so it still submits.
- [ ] Edit stop's `Segmented` gets `tone="ink"`, matching Add a stop and the phone Stop sheet.
- [ ] Every `variant="ghost"` Cancel in delete-stop-dialog and itinerary-manager becomes `variant="outline"` (T0.2's rule).
- [ ] Tests: the Add a stop submit button is inside `[data-slot="dialog-footer"]`; Edit stop's active segment carries `data-[state=on]:bg-primary`; the Delete stop Cancel has no `border-transparent`.
- [ ] Verify, commit `fix(plan): Add a stop keeps its button in view, and Stop dialogs match the others`.

## Lane D: Day

### Task D1 (D1): a phone Day plan gives the title column most of the card

**Files:** `components/trip/timeline.tsx` (`TimeGutter` :266-280, `DayRow` :282-310, `Tile` :316-331), test `components/trip/timeline.test.tsx`.

Large rows (Day view) are a 46 px time column, a 40 px tile and two 12 px gaps: 110 px. A phone card's content box at 320 px is 252 px (page `px-4`, card `p-4` and 2 px borders), so the title column gets 142 px (56%). The phone Day plan card only renders below md, so `max-md:` classes reach exactly it.

- [ ] `TimeGutter` large: add `max-md:w-[38px] max-md:text-xs`. `Tile` large: add `max-md:size-8 max-md:rounded-[10px]`, icon adds `max-md:size-4`. `DayRow` large: add `max-md:gap-2`. Now 38 + 32 + 16 = 86 px, title column 166 of 252 px at 320 (66%), 236 of 322 at 390 (73%).
- [ ] Tests (render with `large`): gutter has `max-md:w-[38px]`; tile has `max-md:size-8`; row has `max-md:gap-2`.
- [ ] Verify, commit `fix(day): a phone Day plan gives a thing to do's title most of the card`.

### Task D2 (D2): a group label sits with the things it heads

**Files:** `components/trip/timeline.tsx` (Anytime block :205-232), test `components/trip/timeline.test.tsx`.

The label `<h4>` has `mt-1` (4 px) under the previous group's last row (`last:pb-0`), while the first row after it keeps its `border-t-2` and `pt-3`/`py-2.5` (it is not `:first-child`), so more space falls below the label than above.

- [ ] Group div `flex flex-col` becomes `flex flex-col pt-4 first-of-type:pt-1 [&>h4+*]:border-t-0 [&>h4+*]:pt-1.5`; the `h4` drops `mt-1`.
- [ ] Test: a group wrapper has `pt-4` and `[&>h4+*]:pt-1.5`, and its `h4` has no `mt-1`.
- [ ] Verify, commit `fix(day): a group label sits with the things it heads`.

### Task D3 (D3): one pair of day arrows, on the date

**Files:** `components/trip/day/day-strip.tsx` (`StripStep` :47-61, `step` :219-221, nav :236, legend grid :294, desktop wrapper :343-387), tests `components/trip/day/day-strip.test.tsx`, `app/(app)/trips/[tripId]/day/page.test.tsx` (its `getByLabelText("Previous day")` / `("Next day")` checks must still find exactly the header's disabled arrow).

The desktop strip has its own Previous/Next buttons (`StripStep`, `lg:inline-grid`) beside the scroller, which is where half a chip shows. Keyboard access stays without them: the date's `DayArrow` links (`day-header.tsx:140, :156`) are at every width and focusable, `DayKeyboardNav` keeps ← and →, and every chip is a link.

- [ ] Remove `StripStep` and its two uses (:370, :385) and `step`; then remove whatever eslint reports as unused (`router`, an icon import). Keep `centreIndex` (still used by the scroll effect).
- [ ] Add `mx-auto` to the chip `nav` (:236) and to the legend grid (:294), so a trip shorter than the row centres its chips instead of leaving a blank band on the right (with the lg end padding the content always overflows, so lg is unchanged).
- [ ] The overlap with the side rail between 780 and 1600 px is not explained by the code (the scroller clips and has no negative margin from md); it is in Questions. Do not guess at it.
- [ ] Tests: the desktop strip has no button named "Previous day" or "Next day" (scope the query to `[data-day-strip]`, because the header's arrows share that name); the chip nav has `mx-auto`; delete the tests that clicked the strip's arrows.
- [ ] Verify, commit `fix(day): one pair of day arrows, on the date; the strip just scrolls`.

### Task D4 (D4): a loading day shows the shapes of its weather and plan cards

**Files:** `components/trip/day/day-slot-skeleton.tsx`, new test `components/trip/day/day-slot-skeleton.test.tsx`, `app/(app)/trips/[tripId]/day/page.test.tsx`.

Today two plain boxes (`h-[140px]` and `h-72`), in the wrong order from md. `DaySlot` (day-slot.tsx:118-131) puts the compact weather card (140 px, `rounded-[20px]`, `shadow-hard-2`) above the plan card below md, and from md the regular weather card (236 px, `rounded-3xl`, `shadow-hard-3`) after it, beside it from lg. The plan card is `rounded-[20px] shadow-hard-2` on a phone and `rounded-3xl shadow-hard-3` from md. The skeleton must stay a few nodes: every unread day of a long trip gets one (a 36-day Day page is already about 1.5 MB of HTML).

- [ ] Root keeps `data-day-slot-skeleton role="status" aria-label="Loading day"`, becomes `grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-[18px]`, and has exactly two children: the plan shape `tp-pulse h-72 rounded-[20px] border-2 border-border bg-card shadow-hard-2 md:rounded-3xl md:shadow-hard-3`, then the weather shape `tp-pulse order-first h-[140px] rounded-[20px] border-2 border-border bg-card shadow-hard-2 md:order-none md:h-[236px] md:rounded-3xl md:shadow-hard-3`. Update the one-line comment above it if it no longer fits. Do not use `WeatherCardSkeleton` here (more nodes, and its own `role="status"`).
- [ ] A travelling day's phone weather collapses to a 44 px row; the skeleton cannot know the phase and shows 140 px. Accepted.
- [ ] Tests: one `role="status"` named "Loading day" with two children; the weather shape has `order-first`, `h-[140px]` and `md:h-[236px]`; the plan shape has `md:rounded-3xl`. In the day page test, keep the `[data-day-slot-skeleton]` lookups working.
- [ ] Verify, commit `fix(day): a loading day shows the shapes of its weather and plan cards`.

### Task D5 (D5): a stay reads the same in Check-in and Tonight

**Files:** `components/trip/stay-card.tsx` (new export), `components/trip/timeline.tsx` (`AccomCheckinRow` large title :557, booking state :573-575), `components/trip/day/tonight-card.tsx` (:82), tests `components/trip/timeline.test.tsx`, `components/trip/day/tonight-card.test.tsx`.

Check-in wraps the name in full (`block break-words`); Tonight cuts it to one line (`block truncate`).

- [ ] Export `STAY_NAME_CLASS = "line-clamp-2 break-words"` from `stay-card.tsx`; it replaces `block break-words` on the Check-in large name (add `title={a.name}`) and `block truncate` on Tonight's name (add `title={tonight.name}`). No `block` beside it.
- [ ] The Check-in booking state stays on its own line: its `<p className="mt-0.5">` becomes `<p className="mt-1 flex">` so the badge never shares a line with the name or the confirmation.
- [ ] Tests: the Check-in large name and Tonight's name both have `line-clamp-2`, neither has `truncate`.
- [ ] Verify, commit `fix(day): a stay reads the same in Check-in and Tonight`.

### Task D6 (K3, stay cards): text on a stay card can be read in the dark theme

**Files:** `components/trip/stay-card.tsx` (root :24, body :33), test `components/trip/day/tonight-card.test.tsx`.

The body is `bg-hue-lilac/25` over whatever is behind the card. Muted text (#A9A193) on it in dark: 3.89:1 over the page, 3.44:1 when the card sits on a card (the Check-in card inside the Day plan card). Light today: 4.67:1.

- [ ] Root adds `bg-background` (so the tint always sits on the page colour, whatever the parent); body `bg-hue-lilac/25` becomes `bg-hue-lilac/15`. Muted text then reads 4.82:1 in dark and 4.99:1 in light. This also changes the Plan's desktop "Staying" card and the travelling Home's stay card, which use `StayCard`.
- [ ] Test: `[data-slot="stay-body"]` has `bg-hue-lilac/15`; the card root has `bg-background`.
- [ ] Verify, commit `fix(theme): text on a stay card can be read in the dark theme`.

### Task D7 (D6): Add to this day opens a sheet on a phone

**Files:** `components/day/day-add-menu.tsx` (:34-85), test `components/day/day-add-menu.test.tsx`.

Below md the dropdown's small rows cover the next card. The phone pattern to copy is `StopActionsSheet` (`components/plan/stop-actions-sheet.tsx`): `Sheet` + `DragSheetContent` + one bordered group of 48 px rows.

- [ ] `const wide = useMediaQuery("(min-width: 768px)")` (`components/ui/use-media-query`). When `wide === false`: the same trigger `Button` (same props, `onClick={() => setSheetOpen(true)}`) and `<Sheet open={sheetOpen} onOpenChange={setSheetOpen}><DragSheetContent hideCloseIcon onDismiss={() => setSheetOpen(false)}>` containing `<SheetTitle className="font-display text-[28px] leading-none">{label}</SheetTitle>` and a `role="group"` box with StopActionsSheet's group classes and two `type="button"` rows (its row classes): "Something to do" and "A flight, train or drive". A row closes the sheet first, then calls `setWhich("item")` or `setWhich("transport")`. Otherwise (`true`, and `null` on the server) the dropdown exactly as now. The Item and Transport dialogs below are shared by both.
- [ ] Tests: with `matchMedia` stubbed to false, the button opens a dialog titled with the label holding both rows, and "Something to do" closes it and opens the Item form; stubbed to true, a `menu` opens as before.
- [ ] Verify, commit `fix(day): Add to this day opens a sheet on a phone`.

### Task D8 (C1, title spacing): a wrapped Check-in or Check-out title keeps normal line spacing

**Files:** `components/trip/timeline.tsx` (:559, :619), test `components/trip/timeline.test.tsx`.

The compact rows (Calendar Agenda, Plan) set `leading-7` on the title so one line centres on the 28 px tile; a wrapped title gets 28 px lines.

- [ ] Both spans: `leading-7` becomes `py-1 leading-5` (20 + 8 = 28 px for one line, 20 px lines when wrapped).
- [ ] Test: the compact Check-in title has `leading-5` and no `leading-7`.
- [ ] Verify, commit `fix(calendar): a wrapped Check-in or Check-out title keeps normal line spacing`.

## Lane E: Money, Calendar, Checklists, Files, Reviews

### Task E1 (M2): every budget category has its own colour

**Files:** `lib/money/breakdown.ts` (`budgetCategoryStyle` :23-25, `rowsFor` "category" :66-81), test `lib/money/breakdown.test.ts`.

Every thing-to-do category maps to coral and everything else to lilac, so several rows share a colour. `rowsFor` is the only caller and feeds both the bar and the list.

- [ ] Add `export function categoryHues(labels: readonly string[]): Map<string, Hue>`: first give each label in `FIXED` its hue (Transport sun, Accommodation teal, Food & Drink leaf); then, in list order, give every other label `budgetCategoryStyle(label).hue` if no earlier label has it, else the first unused hue of `["coral", "lilac", "sky", "pink", "indigo", "stone"]`; once all nine are used, cycle that list (see Questions). `rowsFor` "category" builds the map once from `budget.byCategory` and sets `hue: hues.get(c.category)!`; icons still come from `budgetCategoryStyle`.
- [ ] Tests: Transport, Accommodation, Food & Drink, Sightseeing, Activity, Nightlife, Other and a made-up Other category label get eight different hues; Transport is sun and the first activity coral; `rowsFor(budget, "category")` returns no two rows with the same hue for that list.
- [ ] Verify, commit `fix(money): every category has its own colour`.

### Task E2 (C1, Agenda heading): the phone Agenda starts with its first day

**Files:** `components/trip/calendar-views.tsx` (toolbar :201-232), test `components/trip/calendar-views.test.tsx`.

In Agenda view the toolbar shows an h2 "Agenda" under the page's "Calendar" header, then an invisible row of month arrows: a repeated heading and a gap.

- [ ] Toolbar wrapper: `cn("flex flex-wrap items-center gap-x-4 gap-y-3", view !== "month" && "max-sm:hidden")`. Month view and sm and up unchanged.
- [ ] Test: in Agenda view the toolbar has `max-sm:hidden`; in Month view it does not.
- [ ] Verify, commit `fix(calendar): the phone Agenda starts with its first day`.

### Task E3 (K1): checklist row actions are full-size targets on a phone; an empty list shows one box

**Files:** `components/trip/checklist.tsx` (actions :650-655, `RowActions` :717-723, `ROW_ICON_BUTTON` :732-733, empty state :798-808), `components/trip/shopping-list.tsx` (empty state :199-204), `app/(app)/trips/[tripId]/checklists/checklists-layout.tsx` (grid :97), tests `components/trip/checklist.test.tsx`, `components/trip/shopping-list.test.tsx`, `app/(app)/trips/[tripId]/checklists/checklists-layout.test.tsx`.

On a coarse pointer each icon is 32 px with an `after` hit area grown to 44 px, but the buttons sit 4 px apart (`gap-1`), so the hit areas overlap. An empty list draws the dashed `EmptyState` above the dashed add form. Three panels in a two-column grid leave the second row half empty.

- [ ] `ROW_ICON_BUTTON` adds `pointer-coarse:max-sm:size-11`; the actions container adds `pointer-coarse:max-sm:gap-2`; `RowActions` gets `className="pointer-coarse:max-sm:gap-2 [&_button]:pointer-coarse:max-sm:size-11"`.
- [ ] Both empty states pass `className="border-0 px-0 py-4"` to `EmptyState`, leaving the add form as the one dashed box.
- [ ] Desktop grid: `grid gap-4 lg:grid-cols-2` adds `[&>*:last-child:nth-child(odd)]:lg:col-span-2`.
- [ ] (The date field's look is Task F3 in `Input`; this task does not touch date inputs.)
- [ ] Tests: "Move up" has `pointer-coarse:max-sm:size-11`; the empty checklist's and shopping list's `EmptyState` has `border-0`; the layout grid has the odd-last span class.
- [ ] Verify, commit `fix(checklists): phone row actions are full-size targets and an empty list shows one box`.

### Task E4 (H5): Add Reminder lines up with the card and looks like a link

**Files:** `components/trip/reminders-card.tsx` (`AddReminderForm` closed state :153-166), test `components/trip/reminders-card.test.tsx`.

It is a ghost `Button` (`px-3`, so 12 px in from the card's content edge) in `text-muted-foreground`, which reads as disabled. The card is used on trip Home and Checklists.

- [ ] Replace with `<button type="button" aria-label="Add Reminder" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-extrabold text-foreground underline-offset-2 hover:underline">` holding the `Plus` icon and "Add Reminder", the same style as "See all in Summary".
- [ ] Test: the control has `text-foreground` and no `text-muted-foreground`, and clicking it shows the form.
- [ ] Verify, commit `fix(reminders): Add Reminder lines up with the card and looks like a link`.

### Task E5 (F1, part 1): booking confirmations to add are rows, phone file cards are compact, the drop zone is full width

**Files:** `components/trip/files-index.tsx` (to-add list :50-66), `components/trip/attachment-list.tsx` (upload tile :325-347, file card :358, text block :367, actions :394), tests `components/trip/files-index.test.tsx`, `components/trip/attachment-list.test.tsx`.

- [ ] To-add list: `<ul className="flex flex-col divide-y-2 divide-border-soft rounded-xl border-2 border-border bg-card px-3">`, each `<li>` a `ListRow` (`components/ui/list-row`) with `as={Link} href={row.href}`, `tile={<Paperclip className="size-4" strokeWidth={2.5} />}`, `tileTone="sun"`, `title={<span className="line-clamp-2 break-words text-sm font-bold">{row.label}</span>}` and `sub` from `{ TRANSPORT: "Transport", ACCOMMODATION: "Stay", ITEM: "Thing to do" }[row.kind]` (`ConfirmationKind`, `lib/booking-confirmation.ts:1`).
- [ ] Phone card: `relative flex w-full flex-col items-start gap-3 p-3.5 sm:flex-row sm:items-center md:flex-col md:items-start` becomes `relative flex w-full flex-row flex-wrap items-start gap-3 p-3.5 sm:flex-nowrap sm:items-center md:flex-col md:items-start`; text block becomes `min-w-0 flex-1 md:w-full md:flex-none md:pr-24`; actions `absolute right-2 top-2 z-10 flex shrink-0 items-center sm:static md:absolute md:right-2 md:top-2` become `z-10 flex shrink-0 basis-full items-center justify-end sm:basis-auto md:absolute md:right-2 md:top-2` (thumbnail beside the text, actions on a short row under it; sm unchanged, md unchanged).
- [ ] Drop zone `<li>` adds `md:col-span-2 lg:col-span-3`; its label's `md:min-h-[150px]` becomes `md:min-h-[90px]`.
- [ ] Tests: each to-add row renders `[data-slot="list-row"]` as a link; the upload tile spans `lg:col-span-3`; a file card has `flex-row` at the base.
- [ ] Verify, commit `fix(files): booking confirmations to add are proper rows, and a phone file card is compact`.

### Task E6 (F1, part 2): a file name keeps its ending when cut

**Files:** `lib/attachment-name.ts`, new `lib/attachment-name.test.ts`, new `components/trip/middle-truncate.tsx`, `components/trip/attachment-list.tsx` (compact list name :206, card name :368-382), test `components/trip/attachment-list.test.tsx`.

- [ ] Add `export function splitFileName(name: string): { head: string; tail: string }`: the extension is from the last "." when that dot is not the first character and 1 to 5 characters follow it; the tail is the last `min(6, stem length)` characters of the stem plus the extension; the head is the rest. No extension: the tail is the last 6 characters.
- [ ] `MiddleTruncate({ text }: { text: string })`: `<span className="flex min-w-0" title={text}><span className="truncate">{head}</span><span className="shrink-0 whitespace-pre">{tail}</span></span>`.
- [ ] Use it for the name in both places (inside `AttachmentLink` when `cardLink`); the card's `<p>` drops `truncate` and keeps `min-w-0`; its existing `title` moves to `MiddleTruncate`.
- [ ] Tests: `splitFileName("Ticket-outbound-final.pdf")` is `{ head: "Ticket-outbound", tail: "-final.pdf" }`; `"notes"` (no dot, shorter than 6) is `{ head: "", tail: "notes" }`; `".env"` (dotfile) is `{ head: "", tail: ".env" }`; `"scan.jpeg"` is `{ head: "", tail: "scan.jpeg" }`; the card renders the tail in its own `shrink-0` span.
- [ ] Verify, commit `fix(files): a file name keeps its ending when it is cut`.

### Task E7 (R1): a Review card carries its severity in a band and reads at a comfortable width

**Files:** `components/trip/reviews/finding-list.tsx` (`SEVERITY` :20-23, card :155-212), `app/(app)/trips/[tripId]/reviews/page.tsx` (summary :101), tests `components/trip/reviews/finding-list.test.tsx`, `app/(app)/trips/[tripId]/reviews/page.test.tsx`.

The card's 1 px border and fill change with severity (`bg-warning/10 border-warning/40` or `bg-hue-sky/25 border-border`); text runs the full width; the actions row is a sibling under the icon with `pl-7`, so ghost buttons start inside their own padding.

- [ ] `SEVERITY` entries gain `band` (`"bg-warning"` / `"bg-hue-sky"`) and lose `box`. The `li`: `flex flex-col overflow-hidden rounded-xl border-2 border-border bg-card text-sm` (keep the not-open `opacity-80`), first child `<span aria-hidden="true" data-slot="finding-band" className={cn("h-2 border-b-2 border-border", sev.band)} />`, then a `flex items-start gap-3 px-4 py-3` row (icon + text column).
- [ ] Title, detail and "Suggested fix" `<p>`s add `max-w-reading` (38em, about 75 characters). Move the actions `div` into the text column as its last child, `mt-1 flex flex-wrap gap-2`, without `pl-7`.
- [ ] Reviews page :101 summary `<p>` adds `max-w-reading`.
- [ ] Tests: a warning card's band has `bg-warning`, an info card's `bg-hue-sky`; both `li`s have `border-2 border-border`; the Apply button's nearest `flex-col` ancestor is the text column; the summary has `max-w-reading`.
- [ ] Verify, commit `fix(reviews): a Review card carries its severity in a band and reads at a comfortable width`.

### Task E8 (O2 titles, O4): checklist dialogs read in sentence case and an item edits in a growing field

**Files:** `components/trip/checklist.tsx` (edit form :370-381, title :456), `components/trip/packing-templates-bar.tsx` (:165), test `components/trip/checklist.test.tsx`.

- [ ] Titles: "Edit Item" (a checklist item, not an Item) becomes "Edit checklist item"; "Delete Template" becomes "Delete template". The `RowActions` labels stay.
- [ ] Edit form's text `Input` becomes `<Textarea autoGrow rows={1} …same props… onKeyDown={submitOnEnter} />` (both from `components/ui/textarea`, Task T0.3).
- [ ] Tests: the edit dialog is titled "Edit checklist item" and its text field is a `textarea`; Enter in it saves.
- [ ] Verify, commit `fix(checklists): editing a long item shows all of its text, and its dialog title is in sentence case`.

## Lane F: Forms, dialogs and sheets

### Task F1 (O1): a field's label never touches its input

**Files:** `components/ui/field.tsx` (:72), new test `components/ui/field.test.tsx`.

`Field` is `flex flex-col gap-1.5` (6 px). A focused `Input` lifts 2 px and draws a 3 px outline at offset 0, reaching 5 px above its box: 1 px from the label.

- [ ] `gap-1.5` becomes `gap-2.5` (10 px, 5 px clear of the focus outline). This shifts every form by 4 px per field, which the spec accepts.
- [ ] Test: `[data-slot="field"]` has `gap-2.5`.
- [ ] Verify, commit `fix(forms): a field's label never touches its input`.

### Task F2 (E1): place search looks like every other field, marked by a magnifier

**Files:** `components/ui/input.tsx` (class list :20-35), `components/ui/place-combobox.tsx` (`PlaceField` :106-176), tests new `components/ui/input.test.tsx`, `components/ui/place-combobox.test.tsx`.

`PlaceField` draws its own frame: `rounded-[18px] border-2 border-border shadow-hard-2` and a 60 px `text-xl font-bold` input. Every place search uses it (Add a stop, Edit stop, Accommodation, Transport, Item, Add Marker, Settings' Home base, and the two New trip steps).

- [ ] In `input.tsx` export `INPUT_FRAME_CLASS = "rounded-md border-2 border-input bg-card"` and `INPUT_TEXT_CLASS = "text-base font-semibold text-foreground sm:text-[15px]"`, and build `Input`'s class list from them (same classes as now; this is the "one rule": every text field's frame and type).
- [ ] `PlaceField` wrapper becomes `cn("relative shrink-0 overflow-hidden focus-within:border-border", INPUT_FRAME_CLASS)`; input becomes `cn("h-12 w-full bg-transparent pl-11 pr-4 caret-coral outline-none placeholder:font-medium placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring", INPUT_TEXT_CLASS)`; add `<Search aria-hidden="true" className="pointer-events-none absolute left-4 top-3.5 size-5 text-muted-foreground" />` before the input (top-3.5 centres it on the 48 px input row while the suggestion list grows below). Suggestion rows and the footers: `px-5` becomes `px-4`.
- [ ] Tests: the place input has `h-12` and not `h-[60px]`; the wrapper has no `shadow-hard-2`; an `svg` is present and `aria-hidden`; `Input` still renders `rounded-md border-2 border-input bg-card`.
- [ ] Verify, commit `fix(forms): place search looks like every other field, marked by a magnifier`.

### Task F3 (K1, date field): an empty date field reads as empty on every device

**Files:** `components/ui/input.tsx`, test `components/ui/input.test.tsx`.

The browser draws the empty date control itself: centred, with its own height, and in WebKit with a value-like look. It is used by checklist due dates, the Reminders add form, the Reminder dialog and Settings.

- [ ] When `type === "date"`: render `data-empty=""` when `props.value === ""`, and add `appearance-none text-left [&::-webkit-date-and-time-value]:min-h-[1.5em] [&::-webkit-date-and-time-value]:text-left data-[empty]:font-medium data-[empty]:text-muted-foreground`.
- [ ] Tests: an empty controlled date input has `data-empty`; one with a value does not; a text input never does.
- [ ] Verify, commit `fix(forms): an empty date field reads as empty on every device`.

### Task F4 (O2, footers): Cancel and Delete look the same in every dialog

**Files:** `components/trip/transport-form-dialog.tsx` (footer :968-983), `components/trip/item-form-dialog.tsx` (Delete :1101-1112), `components/trip/add-reminder-dialog.tsx` (Delete :174-185), `components/trip/other-cost-editor.tsx` (Cancel ~:299), `components/trip/cost-editor.tsx` (Cancel ~:167), `components/trip/promote-fork-dialog.tsx` (Cancel :177, :194, :261), `components/trip/duplicate-trip-dialog.tsx` (Cancel ~:107), tests `components/trip/transport-form-dialog.test.tsx`, `components/trip/item-form-dialog.test.tsx`, `components/trip/add-reminder-dialog.test.tsx`, `components/trip/other-cost-editor.test.tsx`, `components/trip/cost-editor.test.tsx`, `components/trip/promote-fork-dialog.test.tsx`.

Rule from T0.2. Cancel sites in other lanes: delete-stop-dialog and itinerary-manager (Lane C), make-it-fit (Lane H), danger-zone and marker-form (Lane G). Already outline: surprise-dialog, fork-switcher, accommodation, stop, file move/title, chapter, schedule-item, checklist, packing templates, `ConfirmDialog`.

- [ ] Every ghost Cancel in the files above becomes `variant="outline"`.
- [ ] Delete in a footer: `<Button type="button" variant="outline" className={DIALOG_DESTRUCTIVE_CLASS}>` with a leading `Trash2`: Transport's "Delete leg" (ghost `text-coral-text` today, keep its label), Item's "Delete" (ghost today), the Reminder's "Delete" (outline today, adopts the class).
- [ ] Transport's footer has no Cancel: add (Radix `DialogClose` closes only its own dialog, so inside Import a booking, where `proposal-editor.tsx:54` opens this form in its own `FormDialog`, Cancel closes the form and keeps the import, as Item and Accommodation already do) `<DialogClose asChild><Button type="button" variant="outline" disabled={isPending}>Cancel</Button></DialogClose>` before the primary; the primary drops `size="lg" className="flex-1"` (it keeps `form={formId}`).
- [ ] Tests: Delete leg and Item Delete have `border-destructive`; Transport edit shows a Cancel that closes without calling the action; no Cancel in these dialogs has `border-transparent`.
- [ ] Verify, commit `fix(dialogs): Cancel and Delete look the same in every dialog`.

### Task F5 (O2, titles): dialog titles read in sentence case

**Files:** `components/trip/item-form-dialog.tsx` (:402), `components/trip/accommodation-form-dialog.tsx` (:101), `components/trip/chapter-form-dialog.tsx` (:76), `components/trip/schedule-item-dialog.tsx` (:66), `components/trip/cost-editor.tsx` (:444, :460), `components/trip/add-reminder-dialog.tsx` (:74), `COMPONENTS.md` (:327), tests `components/trip/item-form-dialog.test.tsx`, `components/trip/accommodation-form-dialog.test.tsx`, `components/trip/chapter-form-dialog.test.tsx`, `components/trip/schedule-item-dialog.test.tsx`, `components/trip/cost-editor.test.tsx`, `components/trip/add-reminder-dialog.test.tsx`.

- [ ] Titles: "Edit Item"/"Add Item" become "Edit thing to do"/"Add a thing to do"; "Add Accommodation" becomes "Add accommodation"; "Add Chapter" "Add a chapter"; "Schedule Item" "Schedule a thing to do"; "Add Cost"/"Edit Cost" "Add a cost"/"Edit cost" (as `other-cost-editor` already says); "Add a Reminder" "Add a reminder". Titles of the form "Edit {name}" stay. Button labels are not part of this item. Other lanes: checklist and packing templates (Lane E), marker form (Lane G).
- [ ] `COMPONENTS.md` :327 says dialog titles are Title Case; split the row: action labels keep Title Case, and a new row "Dialog and sheet titles | Sentence case | "Add a stop", "Edit reminder"". (Listed in Questions so Cam sees the rule changed.)
- [ ] Tests: update every assertion that queried an old title; add one per file for the new title.
- [ ] Verify, commit `fix(dialogs): dialog titles read in sentence case`.

### Task F6 (O2): From and To show their label once

**Files:** `components/trip/location-combobox.tsx` (trigger :86-95), tests `components/trip/location-combobox.test.tsx`, `components/trip/transport-form-dialog.test.tsx`, `components/booking-import/booking-import-sheet.test.tsx` (both query "From:" text).

Transport wraps each picker in `<Field label="From">` (transport-form-dialog.tsx:616, :645) and the trigger also reads "From: {place}". `LocationCombobox` has no other caller.

- [ ] Trigger text `{label}: {currentDisplay}` becomes `{currentDisplay}`; `aria-label={\`${label}: ${currentDisplay}\`}` stays.
- [ ] Tests: the trigger's text is the place alone; its accessible name still starts "From:".
- [ ] Verify, commit `fix(transport): From and To show their label once`.

### Task F7 (O2, O3): Import a booking uses the dialog footer

**Files:** `components/booking-import/booking-import-sheet.tsx` (paste form :400-442, "Read booking" :440), test `components/booking-import/booking-import-sheet.test.tsx`.

Its "Read booking" button sits at the end of the form (`self-start`), not pinned, so with the keyboard up it can be off screen.

- [ ] Move "Read booking" into a `<DialogFooter>` that is the paste form's last child, with `<DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>` before it; drop `self-start`. It stays inside the `<form>`. The per-proposal Confirm/Discard buttons are per card and stay as they are.
- [ ] Test: "Read booking" is inside `[data-slot="dialog-footer"]` with a Cancel beside it, and still submits the pasted text.
- [ ] Verify, commit `fix(booking-import): Import a booking keeps Read booking pinned like every other dialog`.

### Task F8 (O4): editing a long reminder shows all of its title

**Files:** `components/trip/add-reminder-dialog.tsx` (title field :144-152), test `components/trip/add-reminder-dialog.test.tsx`.

- [ ] Title `Input` becomes `<Textarea autoGrow rows={1} …same props… onKeyDown={submitOnEnter} />` (Task T0.3).
- [ ] Test: the title field is a `textarea`; Enter in it submits; Shift+Enter does not.
- [ ] Verify, commit `fix(reminders): editing a long reminder shows all of its title`.

## Lane G: Settings, Account, Globe, Help, Share

### Task G1 (S3): Settings uses the trip header like every other trip page

**Files:** `app/(app)/trips/[tripId]/settings/page.tsx` (reads :120-138, root and h2 :141-143), test `app/(app)/trips/[tripId]/settings/page.test.tsx`.

After T0.4 the layout's trip header is hidden here; the page draws a plain `<h2>Settings</h2>`. Reviews is the model (`reviews/page.tsx:65`).

- [ ] Add `tripSlugFor(tripId)` (`lib/trip-slug-read`) to the `Promise.all` at :120. Replace the h2 with `<PageHeader eyebrow={trip.name} title="Settings" trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />} />`; root `mx-auto flex flex-col gap-3.5` becomes `flex flex-col gap-6`.
- [ ] Test: exactly one `h1`, named "Settings", with the trip name above it (mock `TripHeaderTrailing` as the Reviews test does).
- [ ] Verify, commit `fix(settings): Settings uses the trip header like every other trip page`.

### Task G2 (E2, order): Save sits after the last field it saves, and the Danger zone follows the content

**Files:** `app/(app)/trips/[tripId]/settings/page.tsx` (`SETTINGS_GRID_CLASS` :51-52 and its doc comment :29-50, Trip details card :148-180), `components/trip/settings/danger-zone.tsx` (Cancel ~:100), tests `app/(app)/trips/[tripId]/settings/page.test.tsx`, `components/trip/settings/danger-zone.test.tsx`.

The Cover photo field renders after the form's Save changes, so Save looks like it saves the photo. Rows `auto 1fr auto` put the Danger zone (column 2, row 3) at the foot of the flexible row, level with the bottom of Driving estimates.

- [ ] Move `<CoverImageField …/>` above `<TripDetailsForm …/>` in the Trip details card, wrapped in `<div className="mb-6">` (drop the `mt-6` wrapper below the form).
- [ ] `lg:grid-rows-[auto_1fr_auto]` becomes `lg:grid-rows-[auto_auto_1fr]`; slot placements unchanged. With the right group spanning rows 1-2 (both auto) it sizes them, Driving (rows 2-3) and the Danger zone (row 3) cross the flexible row and do not, so the Danger zone starts one gap under Calendar feed. Rewrite the comment's rows sentence to say that.
- [ ] Danger zone Cancel: `variant="ghost"` becomes `variant="outline"`.
- [ ] Tests: `SETTINGS_GRID_CLASS` contains `lg:grid-rows-[auto_auto_1fr]`; the cover field comes before the form's Save button in document order; the Danger zone Cancel has no `border-transparent`.
- [ ] Verify, commit `fix(settings): Save sits after the fields it saves and the Danger zone follows the content`.

### Task G3 (E2, rows): share-link rows share one layout and empty lines match the helper text

**Files:** `components/trip/settings/share-links-panel.tsx` (row header :295-305, empty line :479), `components/trip/settings/calendar-feed-panel.tsx` (:143), `components/trip/settings/digest-panel.tsx` (:208), tests `components/trip/settings/share-links-panel.test.tsx`, `components/trip/settings/calendar-feed-panel.test.tsx`, `components/trip/settings/digest-panel.test.tsx`.

A row's actions sit beside the label or wrap under it depending on the label's length. Empty-state lines are `text-sm` under `text-xs` helper text.

- [ ] Row header `flex flex-wrap items-start justify-between gap-3` becomes `flex flex-col gap-2`: label block, then the action pairs, in every row.
- [ ] The three empty-state lines: `text-sm` becomes `text-xs`.
- [ ] Tests: a row header has `flex-col`; each empty line has `text-xs`.
- [ ] Verify, commit `fix(settings): share links share one layout and empty lines match their helper text`.

### Task G4 (G1): Account's photo actions match, a connected app shows its date, desktop cards keep a width

**Files:** `components/account/profile-card.tsx` (:158-203), `components/account/connected-apps-panel.tsx` (:84-91), `app/(app)/account/page.tsx` (:99), tests `components/account/profile-card.test.tsx`, `components/account/connected-apps-panel.test.tsx`, `app/(app)/account/page.test.tsx`.

- [ ] The three photo buttons (secondary, ghost, ghost today) all become `variant="outline" size="sm"` (keep `SM_HIT`); their column `flex flex-col items-start gap-1.5` becomes `flex flex-wrap items-center gap-2`.
- [ ] Connected app detail: `block truncate` becomes `block break-words`.
- [ ] Grid `lg:grid-cols-[minmax(0,22rem)_1fr]` becomes `lg:grid-cols-[minmax(0,22rem)_minmax(0,40rem)]`.
- [ ] Tests: all three buttons share the outline class; the detail has no `truncate`; the grid class as written.
- [ ] Verify, commit `fix(account): photo actions match, a connected app shows its date, and desktop cards keep a sensible width`.

### Task G5 (G2): the Globe opens on a phone fitted to its markers

**Files:** `components/globe/globe-map.tsx` (`FitInitial` :30-34, `mapProps` :75-83), test `components/globe/globe-map.test.tsx`.

The phone map is about 358 × 260 px. With `padding: 40` the bounds of markers spread across continents need a zoom below 2; `minZoom: 2` clamps it and centres the bounds' middle, often open sea, with markers at the edges.

- [ ] `const wide = useMediaQuery("(min-width: 768px)")`. `minZoom: wide === false ? 1 : 2`. `FitInitial` takes `padding` and is given `wide === false ? 16 : 40`.
- [ ] Tests (with the map mocked as the file already does): `matchMedia` false gives `minZoom` 1 and fit padding 16; true gives 2 and 40.
- [ ] Verify, commit `fix(globe): the Globe opens on a phone fitted to its markers`.

### Task G6 (O2, Globe): the marker dialog matches every other dialog

**Files:** `components/globe/marker-form.tsx` (title :173, Delete :280-292, Cancel :295-298), tests `components/globe/marker-form.test.tsx`, `components/globe/globe-view.test.tsx` (opens the marker dialog; update any assertion on its old title).

- [ ] Title "Edit Marker"/"Add Marker" becomes "Edit marker"/"Add a marker". Cancel `variant="secondary"` becomes `variant="outline"`. Delete becomes `variant="outline"` with `className={DIALOG_DESTRUCTIVE_CLASS}` (replacing `sm:mr-auto`) and a leading `Trash2`.
- [ ] Tests: new titles; Delete has `border-destructive`; Cancel has the outline classes.
- [ ] Verify, commit `fix(globe): the marker dialog matches every other dialog`.

### Task G7 (G3): Help's cards line up and its key uses one row layout

**Files:** `components/trip/help-guide.tsx` (`TOPIC_GRID` :277-296), `components/trip/help-legend.tsx` (colour labels :199-225, tab bar :228-246), tests `components/trip/help-guide.test.tsx`, `components/trip/help-legend.test.tsx`.

`items-start` lets each card keep its own height, and the lone-last-card rules stretch a closed card across two columns with its text in the left half. Two legend blocks lay out their rows by hand.

- [ ] `TOPIC_GRID` becomes `"grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-1 grid-flow-row-dense"` (cards in a row share its height; an open card still spans via its own `open:col-span-full`). Cut the comment above it to the lines that still hold.
- [ ] Both hand-made blocks render through the file's `Row` inside `<ul className="flex flex-col gap-2.5">`: colour labels (specimen = the pill, chip or badge; meaning = the sentence beside it now) and the tab bar (specimen = the icon in its `size-8` box; meaning = the tab's name).
- [ ] Tests: `TOPIC_GRID` has no `items-start` and no `col-span-2`; every legend block's rows have `data-testid="legend-specimen"`.
- [ ] Verify, commit `fix(help): Help's cards line up and its key uses one row layout`.

### Task G8 (L2): the shared trip's map fills its card and nothing leaves a blank beside the route list

**Files:** `components/trip/route-map-preview.tsx` (:35), `app/share/[token]/page.tsx` (`PLACEMENT.before` :91), tests `components/trip/route-map-preview.test.tsx`, `app/share/[token]/page.test.tsx`.

The "centred strip" is not a capture artefact: the preview is a 640 × 320 static image with `object-contain` in an `lg:h-[400px]` frame, so it letterboxes. The live map already fits every located Stop (`routeFitPoints`, route-map.tsx:116-122). In the "before" stage the hero sits alone in column 1 beside the tall route list.

- [ ] Preview `<img>` `object-contain` becomes `object-contain lg:object-cover` (on a phone the frame is about 343 × 200, close to the image's 2:1, and cover would crop about 28 px from each side and could cut an end pin; from lg the frame is 400 px tall and contain is what letterboxes).
- [ ] `PLACEMENT.before`: `route: "lg:order-2 lg:row-span-2"`, `map: "lg:order-3"` (no `lg:col-span-2`), so the map takes column 1 under the hero. Other stages unchanged.
- [ ] Tests: the preview image has `lg:object-cover` (the existing `object-contain` assertion still holds); in the before stage the map section's wrapper has `lg:order-3` and no `lg:col-span-2`, and the route's has `lg:row-span-2`.
- [ ] Verify, commit `fix(share): the shared trip's map fills its card and sits beside the route list`.

## Lane H: Warnings and Summary

### Task H1 (H1): a warning says "no gap" and carries its status as a pill

**Files:** `lib/flags.ts` (`flagDisplayMessage` :73-76), `lib/next-steps.ts` (`NextStep` :13-26, flag candidates :121-130), `lib/sort-these-out.ts` (`SortRow` :30-40, `stepRow` :75-76), tests `lib/flags.test.ts`, `lib/next-steps.test.ts`, `lib/sort-these-out.test.ts`.

"Only 0 min" is the tight-connection message (flags.ts:856, `Math.max(0, …)`, so an overlap reads 0 too). The capitals are not app text: "(TO BOOK)" is part of a thing's own title, carried into the message by `label`/`itemTitle`. Stored text stays as it is.

- [ ] Add `export function flagDisplay(flag: { message: string }): { text: string; tags: string[] }`: the existing ISO-day replacement; then `"only 0 min"` becomes `"no gap"`; then each `\s*\((TO BOOK|BOOKED|TBC|TBD|CONFIRMED|PAID)\)` is removed from the text and its word kept as a tag through an explicit map `{ "TO BOOK": "To book", BOOKED: "Booked", TBC: "TBC", TBD: "TBD", CONFIRMED: "Confirmed", PAID: "Paid" }`; finally collapse any double space left behind. The word list is a decision (see Questions).
- [ ] `flagDisplayMessage(flag)` returns `flagDisplay(flag).text` (its string signature is used by `lib/day-view-loader.ts` and stays).
- [ ] `NextStep` gains `tags?: string[]`; a flag candidate takes `title` and `tags` from `flagDisplay` (omit `tags` when empty). `SortRow` gains `tags?: string[]`; `stepRow` copies it.
- [ ] Tests (invented text only): "Book the 9am train (TO BOOK) now: its book-by date (2026-03-02) has passed." reads "Book the 9am train now: its book-by date (Mon 2 Mar) has passed." with tags ["To book"]; "…: only 0 min, but it's a ~13 min walk." reads "…: no gap, but…"; "only 10 min" is unchanged; "(UNESCO)" and "(BA 15)" are untouched with no tags; `flagDisplayMessage` equals `flagDisplay().text`; a step and a sort row carry the tag.
- [ ] Verify, commit `fix(warnings): a warning says "no gap" and shows a status as a pill`.

### Task H2 (H1 pills, H2 rule): Next steps, Sort these out and Trip health show the pill; their names wrap to two lines

**Files:** `components/trip/home/next-steps-card.tsx` (title :62-67), `components/trip/home/desktop/sort-these-out-rows.tsx` (`RowBody` :27-32), `components/trip/flag-list.tsx` (`FlagRow` text :106-108), tests `components/trip/home/next-steps-card.test.tsx`, `components/trip/home/desktop/sort-these-out-tile.test.tsx`, `components/trip/flag-list.test.tsx`.

- [ ] Next steps title: `<span className="flex min-w-0 items-start gap-1.5"><span className={cn(ROW_NAME_CLASS, "text-[15px] font-semibold text-foreground")}>{step.title}</span>{tags}</span>` where each tag is `<Badge variant="outline" className="mt-0.5 shrink-0">{t}</Badge>`. Sort these out: the title `line-clamp-2` span becomes `ROW_NAME_CLASS` in the same pill row. Trip health `FlagRow`: the message span is followed by the same badges in a `flex flex-wrap items-center gap-1.5` wrapper, using `flagDisplay(flag)`.
- [ ] Tests: a tagged step, row and flag each render a badge "To book" outside the title text; Next steps and Sort these out titles have `line-clamp-2`.
- [ ] Verify, commit `fix(home): Next steps and Sort these out wrap a long name to two lines and show its status as a pill`.

### Task H3 (U1): This is fine sits in its warning, and empty days fold into one line

**Files:** `components/trip/flag-list.tsx` (`FlagRow` :89-126, `FlagSection` :132-158), `app/(app)/trips/[tripId]/summary/page.tsx` (`MakeItFit` :611-619), tests `components/trip/flag-list.test.tsx`, `app/(app)/trips/[tripId]/summary/page.test.tsx`.

A tight flag renders its row and `MarkFineButton` side by side, so the button is outside the card and squeezes it. Empty days are one `empty-day-<date>` info flag each (flags.ts:323-329). `MakeItFit` sits straight under the section heading with no space before the list's own heading.

- [ ] Tight flag: one card `div` (the row's container classes); inside, the icon and a `flex min-w-0 flex-1 flex-col items-start gap-2` column holding the message (a `Link` with `hover:underline` when there is a link, else a span) and the `MarkFineButton`. No button inside a link. Other flags render as now.
- [ ] `FlagSection`: when two or more flags have ids starting `empty-day-`, render them as one `li` at the position of the first: `<details className="group">` whose `<summary>` uses the info row's container classes plus `flex cursor-pointer list-none items-start gap-3` and reads "Nothing scheduled on {n} days" with a `ChevronRight` that rotates when open, and whose body is a `ul` of the individual rows. One such flag stays a normal row. The section count is unchanged.
- [ ] Summary :611: wrap `MakeItFit` in `<div className="mb-4">`.
- [ ] Tests: a tight flag's "This is fine" button is inside the same card element as its message; three empty-day flags render one summary "Nothing scheduled on 3 days" and three rows once opened; one empty day renders a plain row; the MakeItFit wrapper has `mb-4`.
- [ ] Verify, commit `fix(summary): This is fine sits in its warning, and empty days fold into one line`.

### Task H4 (U2): Summary keeps its cards' shadows and a stat's amount is never cut

**Files:** `app/(app)/trips/[tripId]/summary/page.tsx` (root :369, `StatCard` :706-722), test `app/(app)/trips/[tripId]/summary/page.test.tsx`.

The root is `overflow-x-clip`, which clips at its own edge and cuts the 4 px hard shadow of every full-width card. The stat value is `truncate` in a 104 px column at 320 px. Print has no shadows (print/page.tsx:50-56), so nothing changes there.

- [ ] Root adds `-mr-1.5 pr-1.5` (the clip box reaches 6 px into the page gutter; content width unchanged).
- [ ] `StatCard` value `truncate font-mono text-xl` becomes `break-words font-mono text-base sm:text-xl`.
- [ ] Tests: the root has `-mr-1.5` and `pr-1.5`; the stat value has no `truncate`.
- [ ] Verify, commit `fix(summary): phone cards keep their shadow and a stat's amount is never cut`.

### Task H5 (U3): desktop Summary rows sit two to a row

**Files:** `app/(app)/trips/[tripId]/summary/page.tsx` (lists :121, :412, :496; `FlagList` :620), test `app/(app)/trips/[tripId]/summary/page.test.tsx`.

- [ ] Export `SUMMARY_STOP_LIST_CLASS = "grid grid-cols-1 gap-3 min-[1400px]:grid-cols-2"` beside the other exported class constants and use it for the dateless list (:121), the rough list (:412) and each chapter group's list (:496). At 1440 px the main column is about 750 px, so two cards of about 370 px.
- [ ] Wrap `FlagList` in `<div className="max-w-3xl">`.
- [ ] Tests: the constant's value; the lists carry it; the flags wrapper has `max-w-3xl`.
- [ ] Verify, commit `fix(summary): desktop rows sit two to a row instead of stretching`.

### Task H6 (S3): Summary uses the trip header like every other trip page

**Files:** `app/(app)/trips/[tripId]/summary/page.tsx` (both returns :111 and :368; `slug` :178), test `app/(app)/trips/[tripId]/summary/page.test.tsx`.

- [ ] Move `const slug = trip.slug ?? tripId` up to just after :103 so both branches have it. Each branch's first child is `<PageHeader eyebrow={trip.name} title="Summary" trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />} />`; remove `<h2 className="sr-only">Trip summary</h2>`.
- [ ] Tests: one `h1` "Summary" in the dated and the dateless page.
- [ ] Verify, commit `fix(summary): Summary uses the trip header like every other trip page`.

### Task H7 (O2): Make it fit's Cancel matches every other dialog

**Files:** `components/trip/make-it-fit.tsx` (:386), test `components/trip/make-it-fit.test.tsx`.

- [ ] `variant="ghost"` Cancel becomes `variant="outline"`.
- [ ] Test: the Cancel has no `border-transparent`.
- [ ] Verify, commit `fix(summary): Make it fit's Cancel matches every other dialog`.

---

## Not built

- **S9.** A measurement, not a build: on the deployed site with a throttled connection, time a tap on a tab and on a link to the first visible change; if anything shows nothing for more than 300 ms, the orchestrator adds it to the decisions ledger with the numbers.

## Questions for the orchestrator

1. **K3, weather card.** Not built. The weather fills (`--wx-*`) are declared "Same in dark" on purpose (globals.css:273), the card puts ink text on them through `island`, and the scenes draw ink outlines (`INK = hsl(var(--on-accent))`, scenes.tsx:19). A dark surface means a dark set of ten fills plus sky bands (`lib/weather/theme.ts:87-115`) and light text and outlines: a redesign of the card, not a token. Options: keep it light (the hard shadows now show, A5); or a design pass for a dark scene palette. Needs Cam.
2. **D3, overlap with the side rail at 780 to 1600 px.** Not found in the code: the strip's scroller is `overflow-x-auto` (it clips), has no negative margin from md, and sits in normal flow. Needs a look in a real browser at 800, 1024, 1280, 1440 and 1600 px (the view transition on the Day body is one suspect). The arrows and blank band are fixed in D3.
3. **O3, keyboard.** Built: Import a booking pins its button (F7); Add a stop pins its button (C4). Not built: Edit Item and Transport edit already use the sticky `DialogFooter` and a sheet that docks to the keyboard (spec 2026-10-11); the audit's emulator had no real `visualViewport` keyboard, so whether they fail needs a real phone. Add from Globe has no Save button (rows add one at a time), so only its filter field matters. The inline Add reminder is a form on the page, not a sheet; keeping its Save above a real keyboard needs either a phone-only dialog or scroll handling, a choice to make after the phone check.
4. **H1, status pills.** The capitals come from Traveller-typed titles ("… (TO BOOK)"), not from the app. The plan recognises only TO BOOK, BOOKED, TBC, TBD, CONFIRMED and PAID, so an acronym like "(UNESCO)" is left alone. Confirm the list. The same title is unchanged on the Still to book card and elsewhere. "No gap" also covers two things that overlap (the open question already in the ledger).
5. **S3.** Reviews already uses `PageHeader` with share and bell (X2, 0a3cb3a1); only Settings and Summary needed moving. "The trip header" was read as `PageHeader` (trip name as eyebrow, title, share, bell), not the layout's header with member avatars, because that is what every sibling page uses since X2.
6. **O2, sentence case.** `COMPONENTS.md:327` sets dialog titles in Title Case; the spec reverses it. F5 rewrites that row. Button labels ("Add Item", "Save Reminder") still follow the Title Case rule; say if they should change too.
7. **E1, New trip.** The New trip flow's "Where from?" and past-trip place steps use the same `PlaceField`, so they lose their 60 px hero field as well. The spec says one style everywhere; confirm.
8. **M2.** The ramp has nine hues and a Trip can have more categories than that (eight Item categories plus Transport, Accommodation and Other-cost categories). Past nine, colours repeat. Options: accept, or group the smallest categories into "Other".
9. **H4.** Built literally: the Trip cost, Spend so far, Today and wrap cards size to their content, so a row's cards can end at different heights (the countdown keeps the row's height). If even bottoms matter more than no blank band, keep `h-full` and accept blank space at the bottom instead.
10. **D1.** The title column reaches 66 to 73% of a phone card. The two 44 px tap targets (Directions, Unschedule) still share the title's first line, so the title text itself can be narrower than 60%. Moving them under the title is a further layout change; say if wanted.
11. **S4.** The rail already scrolls when the window is short (`h-dvh overflow-y-auto` on the sidebar and the Dock); A3 adds a guard test only. Check at 1280 × 700 in a browser.
12. **U2, Print.** Print cards have no hard shadow (print/page.tsx:50-56), so nothing was found to fix there.
13. **L2.** The cluster of pins when one Stop is far away is what fitting all Stops produces; nothing else was changed.

## Decisions to log (orchestrator, in `docs/audits/2026-11-20-polish-decisions.md` under a Wave 2 heading)

| Id | Built as | The other way |
|---|---|---|
| S2 | On a phone, share and bell sit on the trip-name line above the title; page-header pages lose one 24 px gap. | Put them on the h1's line. |
| K2 | The rail and Trips tab bar are the dark card colour in dark; light is unchanged. | Dark background colour. |
| K3 | Dark hard shadows use the dark border colour (2.25:1 against the page). | Black (1.29:1). |
| K3 | Stay cards: body tint 15% over the page colour, in both themes. | Keep 25% in light only. |
| H3 | "days to go" on one line; it drops under a three-digit number at 320 px. | Two lines, as before. |
| H8 | Phone and desktop money tiles use the size-aware format (cents under 1,000, compact above). | Phone only. |
| P3 | Below md every pill in a leg stack takes the column's width. | Pills keep their own widths. |
| D3 | A trip shorter than the strip centres its chips. | Left-aligned. |
| D4 | The phone placeholder always shows the full weather card, even on a travelling day's collapsed row. | Pass the phase to the skeleton. |
| E3 | Three checklist panels: the third spans both columns on desktop. | Leave a gap. |
| F1 | Field label gap 10 px everywhere. | 8 px. |
| F4 | Transport edit gains a Cancel. | Close button only. |
| G2 | Cover photo moved above the Trip details form. | Its own card. |
| G5 | Phone Globe can zoom out to level 1 so spread markers fit. | Keep level 2 and fit to the largest cluster. |
| H5 | Summary lists go two to a row from 1400 px. | Cap the column width. |
| S3 | Settings and Summary use the page header, so like Reviews after X2 they no longer show the member avatars and currency chip. | Keep the layout header there. |
| G3 | Help's lone last card no longer spans two columns (reverses LA-027); every card is one column wide unless open. | Keep the span. |
| L2 | The shared trip's map preview fills its frame from lg (slight crop); phones keep the whole image. | Crop on phones too. |

## No-overlap check result

Run on 20 Nov 2026 over this file: every backticked `.ts`, `.tsx`, `.css` and `.md` path in the lane table, Task 0's Files lines and ownership line, and every lane's task **Files:** lines (188 paths). No path is owned by two lanes, or by a lane and Task 0. Each lane's table row and its tasks' Files lines list the same set (A 23, B 27, C 18, D 12, E 24, F 30, G 29, H 16). Separately, every test file under `app`, `components`, `lib` and `test` was searched for the copy and classes these tasks change (dialog titles, "Show resolved", "Previous day", `data-day-slot-skeleton`, `object-contain`, "From:", `bg-sun`, `line-clamp-2`, `mt-auto` and others); every test that asserts one of them is in the lane that changes it. Tests that only mock a dialog under its old title (`wishlist-board`, `add-item-from-url`, `form-dialog`, `dialog`) are unaffected. Every path exists at HEAD except the eight marked new (`components/ui/row-text.ts`, `components/ui/row-text.test.ts`, `components/ui/textarea.test.tsx`, `components/ui/field.test.tsx`, `components/ui/input.test.tsx`, `components/trip/day/day-slot-skeleton.test.tsx`, `components/trip/middle-truncate.tsx`, `lib/attachment-name.test.ts`).
