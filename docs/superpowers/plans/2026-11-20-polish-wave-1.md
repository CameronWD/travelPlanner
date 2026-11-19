# Polish Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix the four broken layouts and nine confirmed bugs of the 20 November polish audit, plus W1.

**Architecture:** Twelve small, independent fixes in existing components and helpers. No schema change, no new dependency, no new route. Four lanes with no file in common run in parallel in one checkout.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before using any Next API), React 19, Tailwind, Vitest.

**Spec:** `docs/specs/2026-11-20-polish-wave-1.md`

## Global Constraints

- Branch `chore/polish-pass`, one shared checkout. Commit only your own files: `git commit -m "..." -- <paths>`. Never `git add -A`, never stage `AGENTS.md`, never push, never switch branch.
- Never run `npm run feedback:*`, `npm test`, `npm run build`, a dev server or anything that touches a database. Verification per task: `TZ=UTC npx vitest related --run <changed source files>`, `npx tsc --noEmit`, `npx eslint <changed files>`. A tsc error in a file you did not touch belongs to another lane: report it, do not fix it.
- Zero code comments unless the why is not obvious. No JSDoc. No features beyond the task. No refactors.
- Domain words are those of `CONTEXT.md` (Stop, Transport, Item is "a thing to do" in copy, Traveller, Globe, Review). Copy uses sentence case, no em dashes, no exclamation marks.
- Tests: update the existing test that covers what you change and add one for each new behaviour named in the task. No test may contain real names, places or bookings.
- Commit subject style: `fix(area): what a Traveller now sees`. End every commit message with the two trailer lines given in your dispatch.
- Layout fixes must hold from 320 to 2560 px wide and in the dark theme; use existing tokens and utility classes, no literal colours.

## Review Focus

- A very small or very large rate (1e-7, 123456.7): figure stays in its tile, never in exponent form.
- A Stop or thing to do whose name is one unbroken 40-character word at 320 px.
- A warning message that contains the same date twice, and one whose Stop name contains digits that look like a date.
- A Review summary of exactly 200 characters that is a complete sentence (no ellipsis wanted), and one with no space in its first 200 characters.
- Plan scrolled to its end when the last Stop is shorter than the viewport.

---

## Lane A: Plan

### Task A1 (P1): the title keeps its width in a desktop Plan day row

**Files:** `components/plan/day-section.tsx` (`DayRow`, about :199-270), test `components/plan/day-section.test.tsx`.

The button at about :256 is `flex min-w-0 items-baseline gap-2`; title (`min-w-0 truncate text-sm font-bold`) and note (`min-w-0 truncate text-xs`) shrink in proportion to their content, so a long note starves the title.

- [ ] Title: `shrink-0 max-w-full truncate` (it yields only when the row cannot hold it alone). Note: `min-w-0 flex-1 basis-0 truncate`.
- [ ] Test: the title element carries `shrink-0` and the note carries `flex-1`; the existing truncate test still passes.
- [ ] Verify, commit `fix(plan): a thing to do's title keeps its width beside a long note`.

### Task A2 (P2): the phone Stop sheet shows its dates in full

**Files:** `components/plan/mobile/stop-sheet.tsx` (:136-171), test `components/plan/mobile/stop-sheet.test.tsx` (:123 asserts the stepper sits on the meta line; rewrite it).

- [ ] The meta line (`stopSheetMeta(stop)`) becomes its own full-width line under the title: no `truncate`, wraps (`text-balance` if already used nearby), `mt-1.5` under the title.
- [ ] The nights `Stepper` moves to its own row below the meta line, left-aligned, `mt-2`. Do not change `stopSheetMeta` (shared with the actions sheet) or `Stepper`.
- [ ] Test: meta text renders without the `truncate` class; the stepper still steps the Stop's nights; the stepper is not a sibling inside the meta line's row.
- [ ] Verify, commit `fix(plan): the phone Stop sheet shows its dates in full`.

### Task A3 (B4): Jump to highlights the Stop being read

**Files:** `components/plan/jump-list.tsx` (:90-109), test `components/plan/jump-list.test.tsx` (:72-96, fake observer).

- [ ] Keep a `Set<string>` of ids currently intersecting (add on `isIntersecting`, delete otherwise); after each callback the active id is the topmost of the set by `getBoundingClientRect().top`. If the set is empty keep the previous active id.
- [ ] Add a passive `scroll` listener (same effect, cleaned up): when `window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2`, the active id is the last Stop's.
- [ ] Tests: two Stops intersecting, only the lower one reported in a later callback, active stays the upper one; scrolled to the end, active is the last Stop.
- [ ] Verify, commit `fix(plan): Jump to follows the Stop being read, to the end of the plan`.

## Lane B: Money and Summary

### Task B1 (M1, M4): a rate always fits its tile

**Files:** `components/trip/rates-panel.tsx` (`formatRate` :44-51, used at :156), `components/money/rate-cell.tsx` (:24 aria-label, :40-41 figure), tests `components/money/rates-strip.test.tsx`, `components/trip/rates-panel.test.tsx`. `RateEntry.rate` means 1 foreign = `rate` home.

- [ ] `formatRate(rate: number): string` never returns exponent form: for `rate < 1` use `toLocaleString("en-US", { maximumSignificantDigits: 4, useGrouping: false })`; keep current behaviour otherwise.
- [ ] Add and export `displayRate(entry: { currency: string; rate: number }, home: string): { from: string; to: string; figure: string; inverted: boolean }` beside `formatRate`: when `rate < 0.01` it is inverted (`from: home`, `to: currency`, `figure: formatRate(1 / rate)`); otherwise `from: currency`, `to: home`, `figure: formatRate(rate)`.
- [ ] `RateCell` and the panel row at :156 render through `displayRate`, so an inverted tile reads "1 {home} = {figure} {currency}" in its visible label and its aria-label. Follow the tile's existing label layout; change only which codes and figure it shows.
- [ ] Tile and figure get `min-w-0`; the figure gets `max-w-full truncate` and steps down a size when long: `figure.length > 7 ? "text-[14px]" : "text-[17px]"`. The `<li>`/button must have `min-w-0` so the grid track can shrink.
- [ ] Tests: `formatRate(0.0000612)` is `"0.0000612"`; `displayRate({currency:"VND",rate:0.0000612},"AUD")` is inverted with figure `formatRate(1/0.0000612)`; a 0.65 rate is not inverted; the cell for an inverted rate names the home currency first.
- [ ] Verify, commit `fix(money): a very small rate reads the other way round and stays in its tile`.

### Task B2 (B1, B2): Summary and Print agree on cost

**Files:** `app/(app)/trips/[tripId]/summary/page.tsx` (category list :654-670, per-Stop row :545-563), `app/(app)/trips/[tripId]/print/page.tsx` (category rows :563-570), their `page.test.tsx` files. `perNightMinor` exists in `lib/money/summary-lines.ts:25`.

- [ ] Print category rows always show `costTotalMinor` (drop the `hasActual && paid > 0` switch for these rows only).
- [ ] Both category lists get a visible column label "Cost" in the list's existing header style (if the list has no header row, add the word as a small muted label on the section heading's line).
- [ ] Summary per-Stop row: the amount is always `costTotalMinor`, labelled "cost"; `/night` is `perNightMinor` of that same cost. When `paidTotalMinor > 0`, add a smaller muted second figure "paid {amount}" after it. Keep the row's existing classes.
- [ ] Tests: a category with paid and cost both set shows cost on Print; a Stop with part paid shows cost, a per-night figure equal to cost / nights, and "paid" as the second figure.
- [ ] Verify, commit `fix(summary): Summary and Print show cost, and a Stop's nightly figure matches the amount beside it`.

## Lane C: Words

### Task C1 (W1): every warning date reads as a day

**Files:** `lib/flags.ts` (`flagDisplayMessage` :74-76; messages at :364-371, :383-390, :1068-1073), test `lib/flags.test.ts` (:121).

- [ ] `flagDisplayMessage(flag)` replaces every `\b\d{4}-\d{2}-\d{2}\b` in `flag.message` that is a real calendar date with `formatDayLabel(thatDate)`, whether or not `flag.date` is set. A range "A – B" becomes two labels joined as it stands. Stored `message` is untouched.
- [ ] Tests: each of the three messages renders with no ISO date; a message with the same date twice replaces both; text like "Room 2026-13-45" is left alone; the existing :121 case still passes.
- [ ] Verify, commit `fix(warnings): every date in a warning reads as a day`.

### Task C2 (B3): Activity names a thing once

**Files:** `lib/activity.ts` (`headline()` :469-506, `entityLabel()` :398-403, COST precedent :499-501), test `lib/activity.test.ts`.

- [ ] In `headline()`, when `a.entityLabel` (trimmed, case-insensitive) equals the noun, or is empty, the sentence is `${verbWord} a ${noun}` using "an" before a vowel sound (accommodation, item is "a thing to do" if that is the noun already used). Fix at read time so stored rows are covered. Do not change `entityLabel()`.
- [ ] Tests: a stored TRANSPORT activity with label "transport" reads "updated a transport"; one with a real label is unchanged; the COST case is unchanged.
- [ ] Verify, commit `fix(activity): a thing with no name is named once`.

### Task C3 (B7): a Review summary ends on a word

**Files:** `lib/review/model-output.ts` (`reviewSummary` :239-244), test `lib/review/model-output.test.ts` (:243); the component that prints a stored summary (find with `grep -rn "\.summary" components/review app/\(app\)/trips/\[tripId\]/reviews`).

- [ ] Add and export `clipSummary(text: string, max = 200): string` in `model-output.ts`: text of `max` or fewer characters is returned as is; longer text is cut at the last space at or before `max - 1` (hard cut at `max - 1` when there is none), trailing punctuation and spaces trimmed, then "…" appended. `reviewSummary` uses it.
- [ ] Add and export `summaryForDisplay(stored: string): string`: when `stored.length === 200` and it does not end in `.`, `!`, `?` or `…`, return it with "…" appended; otherwise as is. Use it where a stored summary is printed.
- [ ] Tests: 250 characters cut at a word with "…" and length ≤ 200; exactly 200 unchanged by `clipSummary`; no space in the first 200 hard-cuts; `summaryForDisplay` adds "…" only to a 200-character unterminated string.
- [ ] Verify, commit `fix(reviews): a long summary ends on a word`.

### Task C4 (B5, B6): Globe words

**Files:** `components/globe/globe-invite-button.tsx` (:60-62 description, :89 invite block), `globe-invite-button.test.tsx`; `lib/globe-list.ts` (:9 `UNPINNED`), `lib/globe-list.test.ts` (:46-48), `components/globe/marker-list.tsx` (:43).

- [ ] B5: when the invite block is not shown (the same condition as :89), the dialog description reads "Your Globe is shared with the people below." The invite wording shows only with the invite block.
- [ ] B6: the group heading reads "No country". Rename the constant to `NO_COUNTRY`; if the string is also a persisted or URL key anywhere, keep the key and change only the heading.
- [ ] Tests: a full Globe shows no "Invite" in the description; a marker with no country is grouped under "No country".
- [ ] Verify, commit `fix(globe): Share your Globe only offers an invite when there is room; "No country" names its group`.

## Lane D: Share, Trips, weather

### Task D1 (L1): a shared trip's Stop names read in full on a phone

**Files:** `app/share/[token]/day-by-day.tsx` (`FoldedStop` :83-103, `OpenStop` :109-121), `app/share/[token]/share-route-list.tsx`, tests `day-by-day.test.tsx`, `share-route-list.test.tsx`.

- [ ] `FoldedStop`: name and day count become two elements. Below `sm` the name wraps (no `truncate`, `break-words`) on its own line and the day count and date range sit on a second, muted line; from `sm` up the current single-line layout stays.
- [ ] `ShareRouteList`: same rule for its name beside the dates/nights span: below `sm` the row stacks, name first, wrapping.
- [ ] Tests: the name element has no `truncate` class at the base breakpoint in both lists; day count text is still present.
- [ ] Verify, commit `fix(share): Stop names read in full on a phone`.

### Task D2 (B8): daylight length sits below the sun arc

**Files:** `components/weather/daylight-arc.tsx` (:38-44), test `components/weather/daylight-arc.test.tsx`.

- [ ] The label leaves the arc's box: the component becomes a column, arc box first (same heights `h-7` / compact `h-[18px]`), label below it in normal flow, centred, `leading-none`. Check `WeatherCard.tsx:89` still lays out in both normal and compact use; adjust only spacing there if the card grows by more than the label's line height.
- [ ] Test: the label is not absolutely positioned and is not a descendant of the arc's box.
- [ ] Verify, commit `fix(weather): the daylight length sits below the sun arc`.

### Task D3 (B9): What's new does not move the Trips cards

**Files:** `components/whats-new/whats-new-banner.tsx`, `components/whats-new/whats-new-card.tsx`, `app/(app)/trips/page.tsx` (:50), tests `whats-new-banner.test.tsx`, `whats-new-card.test.tsx`. Do not touch `app/(app)/trips/[tripId]/page.tsx:262` or `loading.tsx`.

- [ ] `WhatsNewBanner` takes `floating?: boolean`. When set, its wrapper is `fixed inset-x-3 z-30 md:inset-x-auto md:right-6 md:w-[380px]`, bottom offset clear of the phone tab bar and safe area (`bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] md:bottom-6`; read the tab bar component for its real height and match it), and it must not cover the Feedback button's corner on desktop (find that button's position and sit above or beside it).
- [ ] `/trips` passes `floating` and drops the in-flow margin classes, and wraps the banner in `<Suspense fallback={null}>` so it no longer holds the page.
- [ ] Tests: with `floating` the wrapper is fixed; without it the markup is as before; dismissing still works.
- [ ] Verify, commit `fix(trips): What's new floats above the tab bar, so the cards do not move`.
