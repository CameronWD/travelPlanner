# Phone fixes, carousel sync and Feedback pictures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the phone sheet, Day view and Stop page defects Cam photographed, make the Day view heading travel with the carousel, add one-tap rate refresh and a built loading mark, and let a Feedback note carry pictures.

**Architecture:** Six lanes that touch disjoint files, so they run concurrently in one checkout with path-scoped commits: sheets (A), carousel (B), Day rows (C), Stop page (D), rates and loader (E), Feedback pictures (F). Within a lane tasks are ordered. F2 waits for A3 because both edit `components/feedback/feedback-launcher.tsx`.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before writing a route or server action: this version differs from older ones), React 19, Tailwind, Radix Dialog, Prisma, Vitest + Testing Library, R2 through `lib/storage.ts`.

**Spec:** `docs/superpowers/specs/2026-11-22-phone-fixes-carousel-sync-feedback-pictures.md`

## Global Constraints

- You are a subagent. Never run `npm run feedback:pull`, `feedback:resolve` or `feedback:accept`: they connect to production.
- Never run `npm test` or `npm run build` per task. Inner loop: `npx vitest run <test file>`. Task done: `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`.
- Other lanes are committing in this checkout at the same time. Stage explicit paths only (`git add <path> <path>`), never `git add -A` or `git commit -a`, and never touch a file outside your task's **Files** list. If you need one, stop and report.
- Commit messages follow the repo's style (`fix(scope): sentence`), ending with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Breakpoints: a dialog is a phone sheet below `sm`; the docked Feedback panel is a phone sheet below `md`; the Day carousel exists below `lg`. Nothing in this plan changes behaviour at or above those widths unless a task says so.
- Copy is exact where a task quotes it. British spelling. No em dashes in UI copy.
- Comments only where the why is not obvious from the code. No new dependencies.
- Reduced motion: every new animation has a `motion-reduce:` or `useReducedMotion` still state.
- No iOS simulator exists on this machine. Real-keyboard and real-swipe behaviour is checked by Cam on his phone after the branch is on beta; your tests pin the arithmetic and the markup.

## Review Focus

1. A picture upload fails after its note was created: the note stays, the author is told how many pictures did not upload, no blob is left without a row. (Task F2)
2. A fifth picture, a non-image file, or a file over the upload limit: refused with a message in the panel, and refused again by the server. (Tasks F1, F2)
3. A signed-in Traveller who is neither the author nor an Admin requests a picture's URL: 404. (Task F1)
4. A swipe that starts towards the next day and returns: the heading, its height and the lit chip return to the day in view, and no address is pushed. (Task B1)
5. A drag past the first or last day: no neighbour heading is rendered, and the heading height is a finite number. (Task B1)

---

## Lane A: phone sheets

### Task A1: Sheets sit on the keyboard

**Files:**
- Modify: `components/ui/use-keyboard-viewport.ts`, `components/ui/sheet.tsx`, `components/ui/dialog.tsx`
- Test: `components/ui/use-keyboard-viewport.test.ts` (create if absent), `components/ui/sheet.test.tsx`, `components/ui/dialog.test.tsx`

**Background.** On iPhone the Feedback panel sat about 260pt above the keyboard with its top off screen. Working hypothesis, unproven: on focus iOS pans the visual viewport to reveal the field (`offsetTop` becomes X) while the sheet also lifts itself; `visualViewport` fires `scroll` sparsely during that pan, so the last read holds a stale `offsetTop` and the sheet ends X too high. A second suspect is `window.innerHeight` not matching the height `position: fixed` resolves against in an installed PWA. The design below removes both dependencies.

**Interfaces:**
- Produces: `KeyboardViewport` gains `offsetTop: number` and `bottom: string`, where `bottom` is the CSS value for the sheet's `bottom`: `` `calc(100% - ${Math.round(vv.height + vv.offsetTop)}px)` `` when the keyboard is open, `"0px"` otherwise. `bottomInset` stays for existing callers.
- Produces: `export const KEYBOARD_SETTLE_MS = 600`.

- [ ] **Step 1: Failing tests for `readKeyboardViewport`**

```ts
it("anchors bottom to the visual viewport, not innerHeight", () => {
  expect(readKeyboardViewport(874, { height: 500, offsetTop: 0 }).bottom).toBe("calc(100% - 500px)");
  expect(readKeyboardViewport(874, { height: 500, offsetTop: 120 }).bottom).toBe("calc(100% - 620px)");
});
it("is 0px with no keyboard", () => {
  expect(readKeyboardViewport(874, { height: 874, offsetTop: 0 }).bottom).toBe("0px");
  expect(readKeyboardViewport(874, null).bottom).toBe("0px");
});
```

- [ ] **Step 2: Run `npx vitest run components/ui/use-keyboard-viewport.test.ts`.** Expected: FAIL, `bottom` undefined.
- [ ] **Step 3: Implement `bottom` and `offsetTop` in `readKeyboardViewport`.**
- [ ] **Step 4: Failing hook test: settling reads.** With a stubbed `visualViewport` and fake timers: fire `resize` with `offsetTop: 0`, then change the stub to `offsetTop: 120` without firing any event, advance 300ms of animation frames; expect the hook's `offsetTop` to be `120`. Advance past `KEYBOARD_SETTLE_MS`; expect no further `requestAnimationFrame` scheduled.
- [ ] **Step 5: Implement.** After every `resize`/`scroll` event, and on `focusin` on `document`, re-read on each animation frame until `KEYBOARD_SETTLE_MS` has passed since the last event. Keep the existing cancel-on-cleanup guard.
- [ ] **Step 6: Failing frame tests.** In `sheet.test.tsx` and `dialog.test.tsx`, with the keyboard stub open (`height: 500, offsetTop: 120`): the content element's inline `bottom` is `calc(100% - 620px)` and `max-height` is `500px`. Update any existing assertion on the old pixel `bottom`.
- [ ] **Step 7: Use `kb.bottom` for the inline `bottom` in `SheetFrame` and `DialogSheet`.**
- [ ] **Step 8: Task-done checks** (see Global Constraints) on the three source files. Expected: all pass.
- [ ] **Step 9: Commit** `fix(sheets): a phone sheet follows the visual viewport while the keyboard settles`. In the body, state that the cause is a hypothesis awaiting a phone check.

### Task A2: Footer space, scroll reach, no sideways pan, sheet over sheet

**Files:**
- Modify: `components/ui/dialog.tsx`, `components/ui/sheet.tsx`, `components/plan/drag-sheet-content.tsx`, `components/ui/form-dialog.tsx`, `components/trip/item-form-dialog.tsx`, `components/money/to-pay-panel.tsx`
- Create: `components/ui/sheet-depth.tsx`
- Test: `components/ui/dialog.test.tsx`, `components/ui/sheet.test.tsx`, `components/ui/form-dialog.test.tsx`, `components/ui/sheet-depth.test.tsx`, `components/money/to-pay.test.tsx`

Use superpowers:systematic-debugging for the three defects below before changing classes: find the cause, then fix it. If the local database is up, look at the real thing in a 402×874 browser (the header of `scripts/layout-audit.ts` says how it launches one).

**Interfaces:**
- Produces: `components/ui/sheet-depth.tsx` exporting `SheetDepthProvider({ children })` and `useSheetDepth(): number` (0 outside any sheet, 1 inside one sheet's content, and so on).

- [ ] **Step 1: Failing tests**
  - `sheet-depth.test.tsx`: `useSheetDepth()` is 0 bare, 1 inside one provider, 2 inside two.
  - `dialog.test.tsx`: a `DialogContent` rendered inside another `DialogContent`'s children has class `min-h-[90dvh]` on its frame; a top-level one does not. Same for `SheetContent side="bottom"` in `sheet.test.tsx`.
  - `dialog.test.tsx`: the scroll body has `overflow-x-hidden` and `overscroll-x-none`; `DialogFooter`'s bottom padding class is `pb-[max(0.75rem,env(safe-area-inset-bottom))]` and the scroll body adds no bottom padding of its own when a `DialogFooter` is present.
  - `to-pay.test.tsx`: the All costs dialog's header is the first child of its scroll body and has `sticky top-0` and an opaque background class (`bg-background`).
- [ ] **Step 2: Run each test file.** Expected: FAIL on the new assertions.
- [ ] **Step 3: Sheet depth.** Wrap the children of `DialogSheet`, `SheetFrame` and `DragSheetContent` in `SheetDepthProvider`; a phone frame at depth ≥ 1 takes `min-h-[90dvh]` (below `sm` only for dialogs).
- [ ] **Step 4: Footer and scroll reach.** The space beneath the last footer control is `max(0.75rem, env(safe-area-inset-bottom))` and nothing else adds to it (today the body's `pb-[calc(1.375rem+env(safe-area-inset-bottom))]` and the footer's own padding stack). Scrolled to the end, the last field's bottom edge is above the footer's top edge: find why Edit Item's "Date paid" is cut off by the footer and fix that cause.
- [ ] **Step 5: Sideways pan.** Find what in `item-form-dialog.tsx` is wider than the sheet at 402px and fix it there; then make the scroll bodies `overflow-x-hidden overscroll-x-none` so no later overflow can pan a sheet.
- [ ] **Step 6: All costs header.** No list row may paint above the header's bottom edge at any scroll position.
- [ ] **Step 7: Task-done checks** on every modified source file. Expected: all pass.
- [ ] **Step 8: Commit** `fix(sheets): footer space, scroll reach, no sideways pan, and a sheet opened from a sheet covers it`, naming each cause found in the body.

### Task A3: The Feedback panel fills the phone

**Files:**
- Modify: `components/feedback/feedback-launcher.tsx`, `components/ui/sheet.tsx` (the `docked` variant only)
- Test: `components/feedback/feedback-launcher.test.tsx`, `components/ui/sheet.test.tsx`

- [ ] **Step 1: Failing tests.** Below `md` with the keyboard closed: the docked frame has `h-[90dvh]` (not `h-auto`); the note list has `min-h-0 flex-1 overflow-y-auto`; the header, the "Show resolved" row and the composer each have `shrink-0`. At `md` and up the frame's classes are unchanged (assert the existing `md:` classes still present).
- [ ] **Step 2: Run the two test files.** Expected: FAIL.
- [ ] **Step 3: Implement.** Phone docked sheet: `h-[90dvh]` in place of `h-auto`. Panel content is a flex column in this order: header, "Show resolved" row, list, composer.
- [ ] **Step 4: Task-done checks.** Expected: all pass.
- [ ] **Step 5: Commit** `fix(feedback): the panel fills the phone and its list keeps its height`.

---

## Lane B: Day view carousel

### Task B1: The heading and the lit chip move with the body; far taps cut

**Files:**
- Modify: `components/trip/day/carousel-maths.ts`, `components/trip/day/day-carousel.tsx`, `components/trip/day/day-chrome-registry.tsx`, `components/trip/day/day-strip.tsx`, `components/trip/day/strip-scroll.ts`, `components/trip/day/day-header.tsx`, `docs/adr/0065-hard-cut-between-sections-paged-carousel-between-days.md`
- Test: `components/trip/day/carousel-maths.test.ts`, `day-carousel.test.tsx`, `day-chrome-registry.test.tsx`, `day-strip.test.tsx`

Read ADR 0065, including the 2026-11-19 amendment, before anything else. What does not change: the day in view (`viewRef`) still changes on settle, the address is still pushed on settle, `inert` still follows the day in view, and from `lg` nothing changes.

**Interfaces:**
- Produces in `carousel-maths.ts`:
  - `nearestIndex(viewIndex: number, progress: number, count: number): number`: `round(viewIndex + progress)` clamped to `[0, count - 1]`.
  - `neighbourIndex(viewIndex: number, progress: number, count: number): number | null`: `viewIndex + 1` when `progress > 0`, `viewIndex - 1` when `progress < 0`, `null` at 0 or when that index is outside `[0, count - 1]`.
  - `lerpHeight(from: number, to: number, progress: number): number`: `from + (to - from) * Math.min(1, Math.abs(progress))`.
- Produces on the carousel context API: `subscribeNearest(cb: (iso: string) => void): () => void`, called whenever `nearestIndex` changes during a gesture or glide, and once on settle.

- [ ] **Step 1: Failing maths tests**

```ts
expect(nearestIndex(5, 0.49, 36)).toBe(5);
expect(nearestIndex(5, 0.5, 36)).toBe(6);
expect(nearestIndex(5, -0.51, 36)).toBe(4);
expect(nearestIndex(35, 0.9, 36)).toBe(35);
expect(neighbourIndex(5, 0.2, 36)).toBe(6);
expect(neighbourIndex(5, -0.2, 36)).toBe(4);
expect(neighbourIndex(5, 0, 36)).toBeNull();
expect(neighbourIndex(0, -0.3, 36)).toBeNull();
expect(neighbourIndex(35, 0.3, 36)).toBeNull();
expect(lerpHeight(96, 120, 0.5)).toBe(108);
expect(lerpHeight(96, 120, -1.4)).toBe(120);
expect(Number.isFinite(lerpHeight(96, 96, 0))).toBe(true);
```

- [ ] **Step 2: Run `npx vitest run components/trip/day/carousel-maths.test.ts`.** Expected: FAIL, not exported.
- [ ] **Step 3: Implement the three functions.**
- [ ] **Step 4: Failing heading tests** (`day-chrome-registry.test.tsx`). Publishing progress `0.25` from day `2026-12-19` renders two headings in the heading area: `2026-12-19` and `2026-12-20`, the neighbour `inert` and `aria-hidden`; the track's inline transform is `translate3d(-25%, 0, 0)`; the area's inline height is `lerpHeight` of the two measured heights. Publishing `0` with `settled` removes the neighbour and clears the inline height and transform. Progress `-0.3` on the first day renders no neighbour and a finite height (Review Focus 5). Progress `0.4` then `0` without `settled` having changed the day: one heading, the original day (Review Focus 4).
- [ ] **Step 5: Implement in `DayCarouselFrame`.** The heading area is a clipped box holding a two-panel track: the day in view and, during a gesture, `neighbourIndex`'s day (its registered chrome, or the existing date-only fallback when its slot has not filled). Write transform and height straight to the DOM from the existing `subscribe(progress, settled)` callback; no React state per frame. The arrows stay outside the track and do not move. The Day title editor and add menu stay keyed by date as today.
- [ ] **Step 6: Failing strip tests** (`day-strip.test.tsx`). `subscribeNearest` firing `2026-12-20` while the day in view is `2026-12-19` moves `aria-current="date"` and the lit classes to the 20th's chip. After a settle on any day, including one reached by a far tap and one reached by Back, `nav.scrollLeft` equals `centredScrollLeft` for that day's index and that chip is lit (the image-4 bug: day 36 shown, strip on days 1 to 4, nothing lit). Find that bug's cause first; the per-trip remembered `scrollLeft` restored in `day-strip.tsx` is the first suspect.
- [ ] **Step 7: Implement `subscribeNearest` in `day-carousel.tsx` and consume it in `day-strip.tsx`; fix the strip bug at its cause.**
- [ ] **Step 8: Failing far-tap test** (`day-carousel.test.tsx`). `goTo` a day with `isFar(index, viewIndex)` true: `scrollLeft` is set once to `index * panelWidth`, no scroll tween starts, the day in view and the heading are that day in the same commit, and one `router.push` is made. An adjacent `goTo` still glides.
- [ ] **Step 9: Implement the cut.**
- [ ] **Step 10: Amend ADR 0065.** Add a section `## Amended 2026-11-22: the heading travels, and a far tap cuts` stating: what Cam saw (heading and lit chip waited 0.6 to 0.8s for the settle; a far tap slid through other days under a heading already changed); the three rules built (heading track driven by progress with interpolated height, lit chip at halfway, far tap is a cut); that the day in view and the push are still settle-driven and why (`inert` and routing depend on it); that "A settle shows that day's own header" in the 2026-11-19 amendment is replaced by this.
- [ ] **Step 11: Task-done checks** on the six source files. Expected: all pass, including the existing carousel snapshot tests (update a snapshot only where the heading markup legitimately changed).
- [ ] **Step 12: Commit** `fix(day): the heading and the lit chip move with the body, and a far tap cuts`.

---

## Lane C: Day view rows

### Task C1: Check-in and check-out are rows; Tonight carries the booking

**Files:**
- Modify: `components/trip/timeline.tsx`, `components/trip/day/day-plan-card.tsx`, `components/trip/day/tonight-card.tsx`
- Test: `components/trip/day/day-plan-card.test.tsx`, `components/trip/day/tonight-card.test.tsx`, and the timeline test that covers `StayCard`

`StayCard` in `timeline.tsx` draws the purple CHECK-IN / CHECK-OUT card. Only the Day view changes; any other caller of `StayCard` keeps the card.

- [ ] **Step 1: Failing tests**
  - Day plan, check-in day: a row with text `Check in · 1 Bedroom private pool @Kuta`, laid out like an Item row (time column showing the check-in time or empty, an icon tile with the `LogIn` icon in the accommodation colour); no element with text `CHECK-IN`; the row contains neither the booking reference nor "No booking confirmation yet".
  - Day plan, check-out day: `Check out · <name>` with the `LogOut` icon; no `CHECK-OUT` card.
  - Tonight card for an Accommodation with `needsBookingConfirmation`: the "No booking confirmation yet" marker is visible while the card is collapsed. With a reference: the reference is shown in the expanded body.
- [ ] **Step 2: Run the test files.** Expected: FAIL.
- [ ] **Step 3: Implement.** Give the Day view a row rendering for stay events (a prop on the existing component, or a small `StayRow` beside `StayCard` in `timeline.tsx`; whichever matches how Item rows are built there). Move the reference and `BookingConfirmationMarker` for the night's Accommodation into `TonightCard`.
- [ ] **Step 4: Task-done checks.** Expected: all pass.
- [ ] **Step 5: Commit** `fix(day): check-in and check-out are rows, and Tonight carries the booking`.

### Task C2: "Any time", Transport row alignment, the dangling dot

**Files:**
- Modify: `components/trip/timeline.tsx`, `components/trip/day/day-plan-card.tsx`, `components/trip/booking-confirmation-marker.tsx`
- Test: `components/trip/day/day-plan-card.test.tsx`, `components/trip/booking-confirmation-marker.test.tsx` (create if absent)

- [ ] **Step 1: Failing tests**
  - A day with a 19:00 Item and two untimed Items: the text `Any time` appears once, after the 19:00 row and before the first untimed Item, styled as the card's existing small-caps eyebrow (the style of "IDEAS FOR …").
  - A day with only untimed Items: no `Any time`. A day with only timed entries: no `Any time`.
  - Order of entries is unchanged from `lib/itinerary.ts` (assert the same sequence of titles as before).
  - A Transport row with attachments: the time and icon wrapper has `self-start` (not centred).
  - `BookingConfirmationMarker`: no text node containing `·`; its container has `flex flex-wrap items-center gap-x-2 gap-y-1`.
- [ ] **Step 2: Run the test files.** Expected: FAIL.
- [ ] **Step 3: Implement.** The label goes before the first untimed Item that follows at least one timed entry.
- [ ] **Step 4: Task-done checks.** Expected: all pass.
- [ ] **Step 5: Commit** `fix(day): an Any time label, Transport rows aligned to their title, no dangling dot`.

---

## Lane D: Stop page

### Task D1: Two-row header, stepper on Rough Stops only, clearer dots, "Any time"

**Files:**
- Modify: `components/plan/mobile/stop-sheet.tsx`
- Test: `components/plan/mobile/stop-sheet.test.tsx`

- [ ] **Step 1: Failing tests**
  - Header row 1 contains, in order: the back button, the number badge, the title, the "Actions for <name>" button, in a container with `items-center`. The dates line (`stopSheetMeta(stop)`) is in a second, full-width row beneath, not inside the title's column.
  - Scheduled Stop: no control labelled `Nights in Paris`. Rough Stop: the stepper is present, beneath the dates line.
  - Each day row's Category dot has `size-3`, an inline `backgroundColor` of the Category colour and an inline `borderColor` of `color-mix(in oklab, <that colour> 60%, black)`, border width 2px; no `border-border`.
  - A day with a 19:00 Item and untimed Items shows `Any time` once, between them; a day with only untimed or only timed Items shows none. Order unchanged.
- [ ] **Step 2: Run `npx vitest run components/plan/mobile/stop-sheet.test.tsx`.** Expected: FAIL.
- [ ] **Step 3: Implement.** Stepper condition becomes `onSetNights && !surprised && rough`.
- [ ] **Step 4: Check the dot's outline against the page background** for every Category: at least 3:1 (the repo's `scripts/contrast-audit.ts` has the contrast function). If a Category fails at 60%, lower the mix for all Categories until every one passes, and update the test's percentage.
- [ ] **Step 5: Task-done checks.** Expected: all pass.
- [ ] **Step 6: Commit** `fix(stop): a two-row header, the nights stepper on Rough Stops only, clearer Category dots`.

---

## Lane E: rates and loader

### Task E1: Refresh every rate from the strip

**Files:**
- Create: `components/money/rates-refresh-button.tsx`
- Modify: `components/money/rates-strip.tsx`, `components/money/rate-cell.tsx`
- Test: `components/money/rates-strip.test.tsx`, `components/money/rates-refresh-button.test.tsx`

**Interfaces:**
- Consumes: the `refreshRates(tripId, currencies, homeCurrency)` server action that `components/trip/rates-panel.tsx` already imports; read its return type and treat a thrown error or a failed result as failure.
- Produces: `RatesRefreshButton({ tripId, homeCurrency, currencies, onRefreshed }: { tripId: string; homeCurrency: string; currencies: string[]; onRefreshed(): void })`.

- [ ] **Step 1: Failing tests**
  - The strip header contains a button with accessible name `Refresh all rates`, no visible text, a `RefreshCw` icon, and a 44px tap target.
  - Click: `refreshRates` is called once with every currency in the strip; while pending the icon has `animate-spin motion-reduce:animate-none` and the button is disabled.
  - Success: the strip's note reads `Updated just now` (replacing `note` until the `rates` prop next changes).
  - Failure: a toast with `Couldn't refresh rates. Try again.`; the note is unchanged.
  - `RateCell`: when `entry.rate` changes from one number to another, the figure passes through intermediate values over 400ms (use `components/money/use-tween.ts`) and the cell gets `tp-pop`; under reduced motion it shows the new figure at once. A cell whose `source` goes from `stale` to fetched loses its stale icon.
- [ ] **Step 2: Run the two test files.** Expected: FAIL.
- [ ] **Step 3: Implement.** Tapping a cell still opens its dialog, unchanged.
- [ ] **Step 4: Task-done checks.** Expected: all pass.
- [ ] **Step 5: Commit** `feat(money): refresh every rate from the Rates strip`.

### Task E2: The loading mark builds itself

**Files:**
- Modify: `components/ui/logo-loader.tsx`, `components/ui/logo.tsx` (export the mark's path data and the wordmark's two paths if they are not exported), `app/globals.css`
- Test: `components/ui/logo-loader.test.tsx` (create), `components/ui/logo.test.tsx`

- [ ] **Step 1: Failing tests.** `LogoLoader` renders `role="status"` with sr-only text `Loading`; an SVG with the mark's three paths carrying classes `tp-build-outline`, `tp-build-door`, `tp-build-poles`; the wordmark beneath with its word path `tp-build-word` and its dot `tp-build-dot`; the mark's wrapper has `tp-build-idle`. No element has `animate-spin`. `Logo` renders exactly as before (existing `logo.test.tsx` passes untouched).
- [ ] **Step 2: Run `npx vitest run components/ui/logo-loader.test.tsx`.** Expected: FAIL.
- [ ] **Step 3: Implement the markup, and the keyframes in `globals.css`** beside the existing `tp-` animations, all `animation-fill-mode: both`:
  - `tp-build-outline`: stroke draws via `stroke-dashoffset`, 0 to 450ms; its fill fades in 300 to 600ms.
  - `tp-build-door`: `scaleY` 0 to 1 from the bottom edge, 450 to 750ms.
  - `tp-build-poles`: stroke draws, 650 to 900ms.
  - `tp-build-word`: fades and rises 6px, 800 to 1050ms.
  - `tp-build-dot`: drops 14px and bounces once, 1000 to 1300ms.
  - `tp-build-idle`: `translateY` between 0 and -2px, 1.6s ease-in-out, infinite, starting at 1300ms.
  - Under `prefers-reduced-motion: reduce` every one of these is `animation: none` and the finished lockup shows.
- [ ] **Step 4: Task-done checks.** Expected: all pass.
- [ ] **Step 5: Commit** `feat(loading): the mark builds itself instead of spinning`.

---

## Lane F: pictures on Feedback notes

### Task F1: Store and serve a note's pictures

**Files:**
- Modify: `prisma/schema.prisma`, `server/actions/feedback.ts`, `lib/feedback/view.ts`
- Create: a Prisma migration named `feedback_pictures`, `lib/feedback/pictures.ts`, `app/api/feedback-pictures/[id]/route.ts`
- Test: `lib/feedback/pictures.test.ts`, the integration test file that already covers `server/actions/feedback.ts` (find it under the integration config; add cases there)

Read first: `lib/attachment-create.ts`, `lib/attachment-serve.ts`, `lib/storage.ts`, `lib/item-attachment-cleanup.ts` and ADR 0040. Follow their patterns for validating, storing, serving and deleting a blob; do not use the `Attachment` table (an Attachment dies with its Trip; a Feedback note outlives it).

**Interfaces:**
- Produces the model:

```prisma
model FeedbackPicture {
  id         String   @id @default(cuid())
  noteId     String
  storageKey String
  mime       String
  size       Int
  position   Int
  createdAt  DateTime @default(now())
  note       FeedbackNote @relation(fields: [noteId], references: [id], onDelete: Cascade)

  @@index([noteId])
}
```

- Produces in `lib/feedback/pictures.ts`: `MAX_FEEDBACK_PICTURES = 4`; `FEEDBACK_PICTURE_MIMES` (`image/jpeg`, `image/png`, `image/webp`); `feedbackPictureUrl(id: string): string` returning `/api/feedback-pictures/<id>`.
- Produces in `server/actions/feedback.ts`: `addFeedbackPicture(formData: FormData): Promise<ActionResult<{ id: string; url: string }>>` with fields `noteId` and `file`.
- `createFeedbackNote`'s success result includes the note's `id` (add it if it is not returned today).
- `FeedbackNoteView` gains `pictures: Array<{ id: string; url: string }>`, ordered by `position`.

- [ ] **Step 1: Failing unit tests** for `lib/feedback/pictures.ts` (the constants and the URL).
- [ ] **Step 2: Failing integration tests**
  - The author adds a JPEG: a row exists with `position` 0, the blob exists in storage, the result's `url` is `/api/feedback-pictures/<id>`.
  - A fifth picture is refused with an error and no blob is written (Review Focus 2).
  - A `text/plain` file and a file over `MAX_BYTES` are refused (Review Focus 2).
  - A Traveller who is not the note's author is refused; an Admin who is not the author is also refused (only the author adds).
  - `listFeedbackNotes` returns each note's `pictures` in position order.
  - `deleteFeedbackNote` removes the rows and the blobs.
  - `GET /api/feedback-pictures/<id>`: 200 with the right content type for the author and for an Admin; 404 for another signed-in Traveller; 404 signed out (Review Focus 3).
  - If the blob write succeeds and the row insert fails, the blob is removed (Review Focus 1).
- [ ] **Step 3: Run them.** Expected: FAIL. If the local database is down, say so in your report and create the migration with `--create-only`; do not point at any other database.
- [ ] **Step 4: Implement** the model, the migration (additive only), the action, the view change, the delete path and the route.
- [ ] **Step 5: Task-done checks**, plus `npx vitest run --config vitest.integration.config.ts <the integration file>` when the local database is up. Expected: all pass.
- [ ] **Step 6: Commit** `feat(feedback): a Feedback note can hold pictures`.

### Task F2: Add and see pictures in the Feedback panel (after A3 and F1)

**Files:**
- Modify: `components/feedback/feedback-launcher.tsx`
- Create: `components/feedback/feedback-pictures.tsx` (the picker row and the thumbnail strip, so the launcher does not grow further)
- Test: `components/feedback/feedback-launcher.test.tsx`, `components/feedback/feedback-pictures.test.tsx`

**Interfaces:**
- Consumes: `addFeedbackPicture`, `MAX_FEEDBACK_PICTURES`, `FeedbackNoteView.pictures`, `createFeedbackNote`'s `id` (Task F1); `compressImage` and `oversizeUploadMessage` from `lib/image-compress.ts`; `useOnlineStatus`.
- Produces: `FeedbackPicturePicker({ files, onChange, disabled }: { files: File[]; onChange(files: File[]): void; disabled: boolean })` and `FeedbackPictureStrip({ pictures }: { pictures: Array<{ id: string; url: string }> })`.

- [ ] **Step 1: Failing tests**
  - The composer has a button with accessible name `Add pictures` and a hidden `input[type=file][accept="image/*"][multiple]`.
  - Choosing two images shows two thumbnails, each with a `Remove picture` button; removing one leaves one.
  - Choosing six images keeps four and shows a toast `Up to 4 pictures per note.` (Review Focus 2).
  - A file `oversizeUploadMessage` rejects is not added and its message is shown (Review Focus 2).
  - Offline: `Add pictures` is disabled and the line `Pictures need a connection.` is shown. Offline with pictures already chosen, Send is disabled and the line reads `You're offline. Remove the pictures to queue this note, or send it when you're back online.` A text-only note still queues as today.
  - Send with two pictures: `createFeedbackNote` is called first, then `addFeedbackPicture` once per picture with that note's id, each file having passed through `compressImage`.
  - One of two uploads fails: the note stays in the log, and a toast reads `Note sent, but 1 picture didn't upload.` (Review Focus 1).
  - A sent note with pictures shows a thumbnail per picture under its text; clicking one opens a dialog with the full-size image and accessible title `Picture 1 of 2`.
  - Send is still disabled with an empty body, pictures or not.
- [ ] **Step 2: Run the two test files.** Expected: FAIL.
- [ ] **Step 3: Implement.** Thumbnails are 56px squares, `object-cover`, 2px border. The picker row sits between the box and Send.
- [ ] **Step 4: Task-done checks.** Expected: all pass.
- [ ] **Step 5: Commit** `feat(feedback): add pictures to a Feedback note from the panel`, with this trailer on its own line before the co-author line:

```
Resolves-Feedback: cmwrlib11000007l2nu9dzw4z
```

### Task F3: `feedback:pull` brings the pictures (after F1)

**Files:**
- Modify: `lib/feedback/inbox.ts`, `scripts/feedback-pull.ts`, `.gitignore`, `docs/adr/0040-feedback-notes-captured-in-product-exported-to-a-committed-inbox.md`, `CLAUDE.md` (the Feedback inbox section only)
- Create: `lib/feedback/pull-pictures.ts`
- Test: `lib/feedback/inbox.test.ts`, `lib/feedback/pull-pictures.test.ts`

Never run the script itself: it reads production. Everything is tested through the two library modules with a fake `Storage` and a temp directory.

**Interfaces:**
- `InboxNote` and `FeedbackNoteRow` gain `pictures`: on the row `Array<{ id: string; storageKey: string; mime: string; position: number }>`, on the note `string[]` of repo-relative paths, `docs/feedback/pictures/<note id>/<position + 1>.<ext>` with `ext` from the mime (`jpg`, `png`, `webp`).
- Produces: `pullPictures(opts: { notes: FeedbackNoteRow[]; storage: Pick<Storage, "get">; dir: string }): Promise<{ written: number; removed: number }>` (use whatever `Storage`'s read method is actually called).

- [ ] **Step 1: Failing tests**
  - `renderInbox`: a note with two pictures prints, after its route line, `  _Pictures: docs/feedback/pictures/<id>/1.jpg, docs/feedback/pictures/<id>/2.png_`; a note with none prints no such line.
  - `pullPictures`: writes each picture of an open or needs-review note to its path; skips a file that already exists with the same size; removes the folder of a note that is no longer open or needs-review, and removes folders for ids not in `notes`; a picture whose blob is missing is skipped and counted in neither total, without throwing.
- [ ] **Step 2: Run the two test files.** Expected: FAIL.
- [ ] **Step 3: Implement.** In the script: select the pictures with the notes, call `pullPictures` with `getStorage()` and `docs/feedback/pictures` unless `--dry-run`, and add the counts to the closing line (`… — 1 open, 0 needs review, 96 resolved, 3 pictures.`). Add `docs/feedback/pictures/` to `.gitignore`.
- [ ] **Step 4: Docs.** ADR 0040: add `## Amended 2026-11-22: a note can carry pictures` covering: pictures have their own table because a note outlives its Trip; visible to author and Admins; not committed, pulled to a git-ignored folder, because screenshots show names and booking references and would stay in history; the picker needs a connection because the offline queue lives in local storage. `CLAUDE.md`: one sentence in step 1 of "Feedback inbox" saying the pull also downloads open notes' pictures to `docs/feedback/pictures/`, and that the session should read them.
- [ ] **Step 5: Task-done checks.** Expected: all pass.
- [ ] **Step 6: Commit** `feat(feedback): feedback:pull downloads a note's pictures`.

---

## Once per branch (the orchestrator, not a task subagent)

- [ ] `npm test`, `npm run build`, and `npm run test:integration` when the local database is up.
- [ ] Whole-branch review.
- [ ] Hand Cam his steps in one batch: phone check on beta of sections 1 and 2; then main; then confirm the deploy so the note can be resolved.
