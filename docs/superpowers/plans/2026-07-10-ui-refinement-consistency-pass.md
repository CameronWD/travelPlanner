# UI Refinement & Consistency Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the long tail of small UI inconsistencies and rough edges surfaced by a 7-way audit — behaviour-preserving polish that makes TEEPEE feel refined.

**Architecture:** Establish shared conventions/tokens first (rose "over" colour, dialog-header fix, focus-ring-via-primitives, size-8 icon buttons with a touch-target expander), then apply them across the surfaces they normalize. Most tasks are Tailwind-class/copy normalization against a fixed target; a handful (money formatting, empty states, loading/toasts) carry real logic + tests.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Zod v4, Radix UI, Tailwind v4 (HSL design tokens in `app/globals.css`, mapped via `@theme inline`), `class-variance-authority`, Vitest + @testing-library/react, Leaflet.

## Global Constraints

- **Branch:** all work on `refactor/ui-refinement-consistency-pass`. Do **NOT** merge, rebase onto, or push to `main`, and do **NOT** deploy. Building/running locally is fine.
- **Behaviour-preserving.** Visual + copy changes are the intent; **no functional regressions**. Every existing test stays green. Never edit a test to make a change pass unless the task explicitly authorises it.
- **New tests only where logic changes** (Task 15 money formatting, Task 17/18 empty states/toasts that add conditional render/side-effects). Pure class/copy normalization relies on existing co-located tests as the regression net.
- **No new dependencies.** Reuse existing primitives (`Button`, `Input`, `Field`, `RowActions`, `SectionHeader`, `EmptyState`, `Dialog`) and design tokens per `COMPONENTS.md`.
- **Icon-button standard:** one size — `size-8` (32px), expressed as `<Button size="icon" className="size-8">` or via `<RowActions>`. Adopt `<RowActions>` wherever card structure allows. Guarantee **≥44px touch targets on coarse-pointer (touch) devices** via a hit-area expander (Task 4), not by enlarging icons.
- **Copy standard:** **Title Case** for buttons and dialog titles, dropping stray articles (`Add a stop` → `Add Stop`). **Sentence case + terminal period** for empty-state and help/description text (`No items yet.`, `Nothing planned.`, `Optional — when the cost was paid.`).
- **Card standard:** one treatment — opaque `bg-card`, `rounded-xl`, `shadow-soft`, consistent gap/padding. Drop the `bg-card/60` and `bg-muted/30` one-offs.
- **Colour standard:** over-estimate / negative money uses a new dedicated **`over`** (rose) semantic token (Task 1), kept distinct from `destructive` (delete/danger) and `success`/`emerald` (paid). Route all money display through `lib/money.ts` (`formatMoney`, `decimalsFor`) — never hand-roll `/100` + `toFixed`.
- **Fix depth:** hand-rolled interactive controls are re-routed through `Button`/`Input`/`Field` (which already carry the canonical `focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background`), not patched class-by-class, so focus/disabled/aria can't drift again.
- **`CONTEXT.md` is NOT touched** — this pass introduces implementation, not domain language. Docs land in `COMPONENTS.md` + a new ADR (Task 20).
- **Don't fix blind.** For low-confidence visual findings (contrast, overflow, truncation) reproduce in the running app (`npm run dev`) before and after. Test one file: `npx vitest run <path>`. Full suite: `npm test`. Lint: `npm run lint`. Build: `npm run build`.

---

## File Structure

**Created:**
- `app/(app)/trips/[tripId]/error.tsx` — trip-scoped error boundary (Task 19)
- `app/(app)/trips/[tripId]/not-found.tsx` — trip-scoped 404 (Task 19)
- `docs/adr/0029-normalized-ui-conventions.md` — records the conventions, supersedes the open follow-up in ADR 0026 (Task 20)

**Modified (by theme — exact sites listed per task):** `app/globals.css`; `components/ui/{dialog,toast,row-actions}.tsx`; the card cluster (`item-card`, `transport-card`, `accommodation-card`, `note-thread`, `card-actions`, `stop-card`); dialog/form components; globe/wishlist; money/forks/compare; settings; and `COMPONENTS.md`.

---

## Ordering & dependencies

Tasks 1–4 are **foundations** other tasks consume (the `over` token, the dialog fix, the ToastClose fix, the RowActions touch-target). Tasks 5–19 apply conventions and are largely independent of one another (safe to review in any order after foundations). Task 20 (docs) is last. Where a later task depends on an earlier one it is called out under **Interfaces**.

---

### Task 1: Add the `over` (rose) semantic colour token

**Files:**
- Modify: `app/globals.css` (`:root`, `.dark`, and the `@theme inline` block)

**Interfaces:**
- Produces: Tailwind utilities `text-over`, `bg-over`, `border-over` (+ opacity variants like `bg-over/10`) resolving to the rose token in both themes. Consumed by Task 16.

- [ ] **Step 1: Add the CSS variable to both themes**

In `:root` (after `--destructive…`): add
```css
  --over: 350 78% 50%;
  --over-foreground: 0 0% 100%;
```
In `.dark` (after `--destructive…`): add
```css
  --over: 350 80% 62%;
  --over-foreground: 24 14% 10%;
```

- [ ] **Step 2: Map it into the Tailwind theme**

In the `@theme inline` block (after the `--color-warning…` / `--color-destructive…` mappings) add:
```css
  --color-over: hsl(var(--over));
  --color-over-foreground: hsl(var(--over-foreground));
```

- [ ] **Step 3: Verify utilities resolve**

Run: `npm run build`
Expected: build succeeds. Then in `npm run dev`, temporarily add `<span className="text-over">x</span>` to any page and confirm it renders rose in light and dark; remove the probe.

- [ ] **Step 4: Commit**
```bash
git add app/globals.css
git commit -m "feat(ui): add 'over' rose semantic colour token"
```

---

### Task 2: Fix the shared DialogHeader sticky-overlap (all dialogs)

**Files:**
- Modify: `components/ui/dialog.tsx` (`DialogContent` scroll body line ~70, `DialogHeader` line ~91-104)
- Test: `components/ui/dialog.test.tsx` (if present; otherwise visual verification is the net)

**Context / root cause:** `DialogHeader` is `sticky top-0` with opaque `bg-card` and `-mt-4 sm:-mt-6`. The scroll body (`<div class="… overflow-y-auto px-6 pb-6 pt-4 sm:pt-6">`) carries top padding, so `sticky top-0` pins the header at the *content-box* top — leaving a `pt-4/pt-6` strip **above** the pinned header through which scrolled content bleeds, reading as the header overlapping content. This is the user-reported bug and affects all ~18 dialogs.

- [ ] **Step 1: Reproduce.** `npm run dev`, open the globe "Add Marker" dialog on a narrow viewport, add enough content to scroll, and confirm content shows in the strip above the sticky title. (Systematic-debugging: confirm before fixing.)

- [ ] **Step 2: Apply the fix.** Make the header's opaque background extend upward to cover the top-padding strip as it sticks, without changing any dialog's resting layout. In `DialogHeader`'s className add `relative` and a covering pseudo-element sized to the scroll body's top padding:
```
"sticky top-0 z-10 -mx-6 -mt-4 flex flex-col gap-1.5 border-b border-border/60 bg-card px-6 pr-10 pb-3 pt-4 text-left sm:-mt-6 sm:pt-6 " +
"relative before:absolute before:inset-x-0 before:bottom-full before:h-4 before:bg-card sm:before:h-6"
```
(The `before` block is the only addition; it paints `bg-card` over the 16px/24px strip directly above the header.)

- [ ] **Step 3: Verify the fix + no regression.** Re-check the globe dialog (no bleed-through now), then spot-check a scrolling entity dialog (transport form) and a short non-scrolling dialog (confirm-dialog) — resting layout unchanged.

- [ ] **Step 4: Tests + commit.**
Run: `npx vitest run components/ui/dialog.test.tsx` (Expected: PASS) and `npm run build`.
```bash
git add components/ui/dialog.tsx
git commit -m "fix(ui): stop content bleeding above sticky DialogHeader"
```

---

### Task 3: Normalize ToastClose + project-table focus-ring offset

**Files:**
- Modify: `components/ui/toast.tsx` (`ToastClose`, line ~113-118)
- Modify: `components/discreet/project-table.tsx` (DropdownMenuTrigger, ~line 67)

**Context:** `ToastClose` has `focus-visible:ring-2 ring-ring` but is missing `ring-offset-2 ring-offset-background` that every other interactive primitive (incl. `ToastAction` two lines up) uses. `project-table` trigger uses `ring-offset-1` instead of the standard `ring-offset-2`.

- [ ] **Step 1:** In `ToastClose`, change the focus line to:
```
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
```
- [ ] **Step 2:** In `project-table.tsx`, replace `ring-offset-1` with `ring-offset-2 ring-offset-background`.
- [ ] **Step 3:** Verify by keyboard-focusing a toast close button and the project-table menu trigger in `npm run dev` — ring matches other controls.
- [ ] **Step 4:** `npx vitest run components/ui/toast.test.tsx` (PASS); commit.
```bash
git add components/ui/toast.tsx components/discreet/project-table.tsx
git commit -m "fix(ui): consistent focus-ring offset on ToastClose and project-table"
```

---

### Task 4: Add a touch-target expander to RowActions (≥44px on touch)

**Files:**
- Modify: `components/ui/row-actions.tsx`
- Test: `components/ui/row-actions.test.tsx`

**Context:** `size-8` = 32px, below the 44px touch guidance. Add a coarse-pointer-only pseudo hit-area so the *visual* stays 32px on desktop but the *tap target* reaches 44px on touch devices. Tailwind v4 exposes the `pointer-coarse:` variant.

**Interfaces:**
- Produces: the two RowActions buttons gain `relative pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']`. `-inset-1.5` = 6px each side → 32 + 12 = 44px on touch. Reused conceptually by any other `size-8` icon button that is mobile-critical.

- [ ] **Step 1: Write the failing test.** Assert both RowActions buttons carry the expander class.
```tsx
it("expands the tap target on coarse pointers", () => {
  render(<RowActions onEdit={() => {}} onDelete={() => {}} />);
  for (const btn of screen.getAllByRole("button")) {
    expect(btn.className).toContain("pointer-coarse:after:-inset-1.5");
  }
});
```
- [ ] **Step 2:** Run it — FAIL. `npx vitest run components/ui/row-actions.test.tsx`
- [ ] **Step 3:** Add `relative pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']` to both `<Button className="size-8 …">` in `row-actions.tsx`.
- [ ] **Step 4:** Run it — PASS. Run full suite `npm test`.
- [ ] **Step 5: Commit.**
```bash
git add components/ui/row-actions.tsx components/ui/row-actions.test.tsx
git commit -m "feat(ui): 44px touch target on RowActions via coarse-pointer hit-area"
```

---

### Task 5: Adopt RowActions / size-8 on entity cards

**Files:**
- Modify: `components/trip/accommodation-card.tsx` (icon buttons ~95-106, currently `size-9`)
- Modify: `components/trip/item-card.tsx` (edit/delete ~157, currently `size-7`)

**Context:** `transport-card` is the reference (already `<RowActions>`, size-8). Bring accommodation + item cards onto `<RowActions>` (or `size="icon" className="size-8"` where a custom interleave like NoteThread prevents full RowActions adoption — see `COMPONENTS.md` "Migration skips").

- [ ] **Step 1:** Read `transport-card.tsx` for the reference pattern, then read each target card.
- [ ] **Step 2:** Replace the hand-rolled edit/delete buttons with `<RowActions onEdit={…} onDelete={…} editLabel="Edit accommodation" deleteLabel="Delete accommodation" disabled={…} />`. Where NoteThread/other controls are interleaved (item-card), keep the interleave but set the edit/delete `<Button size="icon" className="size-8 …">` and add the destructive hover to delete (`text-destructive hover:bg-destructive/10`).
- [ ] **Step 3:** Verify in `npm run dev`: accommodation + item + transport card action buttons are now visually identical size; delete is destructive-tinted on hover.
- [ ] **Step 4:** `npx vitest run components/trip/item-card.test.tsx components/trip/accommodation-card.test.tsx` (if present) → PASS; else `npm test`.
- [ ] **Step 5: Commit.**
```bash
git add components/trip/accommodation-card.tsx components/trip/item-card.tsx
git commit -m "refactor(ui): normalize entity-card actions to size-8/RowActions"
```

---

### Task 6: Fix note-thread delete button (size + always-visible)

**Files:**
- Modify: `components/trip/note-thread.tsx` (delete button ~160-161)

**Context:** delete is `size-5` (20px) and `opacity-0 group-hover:opacity-100` — invisible on touch (no hover) and the smallest target in the app.

- [ ] **Step 1:** Replace with a `<Button variant="ghost" size="icon" className="size-8 text-destructive hover:bg-destructive/10">` (or `<RowActions onDelete=…>` if only delete is needed). Remove the `opacity-0 group-hover:opacity-100` so it's always visible; keep the trash icon `size-4` and `aria-label`.
- [ ] **Step 2:** Verify on mobile viewport in `npm run dev`: the delete affordance is visible without hover and tappable.
- [ ] **Step 3:** `npx vitest run components/trip/note-thread.test.tsx` (if present) → PASS.
- [ ] **Step 4: Commit.**
```bash
git add components/trip/note-thread.tsx
git commit -m "fix(ui): note-thread delete always-visible at size-8"
```

---

### Task 7: Normalize remaining stray icon buttons

**Files (each to `size-8` via `<Button size="icon" className="size-8">` or RowActions):**
- `components/trip/stop-card.tsx` (thing-to-do edit ~380, `size-6`)
- `components/trip/card-actions.tsx` (MoreActionsMenu trigger ~38, `size-11` → `size-8`)
- `components/trip/cost-editor.tsx` (edit/delete ~338-351, `size-6`) and `components/trip/other-cost-editor.tsx` (~401-414, `size-7`)
- `components/trip/fork-switcher.tsx` (dropdown action buttons ~345/356/365, `p-0.5`) and `components/trip/checklist.tsx` (~535/544/553, `p-1`) → both to `size="icon" className="size-8"`
- `components/trip/calendar-views.tsx` (bare schedule button ~227) → wrap in `<Button size="icon" className="size-8">`
- `components/trip/hard-end-date-control.tsx` (~44-74) → give the set/unset/edit-mode buttons a single consistent height so toggling edit mode doesn't jump

- [ ] **Step 1:** For each file, read the site, replace the hand-rolled/oddly-sized icon button with `size-8` (Button `size="icon"`). Delete buttons get `text-destructive hover:bg-destructive/10`. Keep all `aria-label`/`title`.
- [ ] **Step 2:** For `hard-end-date-control`, unify the set/unset/edit buttons to one height (e.g. all `size="sm"`), so the row height is stable across states.
- [ ] **Step 3:** Verify each in `npm run dev`.
- [ ] **Step 4:** `npm test` → all green.
- [ ] **Step 5: Commit.**
```bash
git add components/trip/stop-card.tsx components/trip/card-actions.tsx components/trip/cost-editor.tsx components/trip/other-cost-editor.tsx components/trip/fork-switcher.tsx components/trip/checklist.tsx components/trip/calendar-views.tsx components/trip/hard-end-date-control.tsx
git commit -m "refactor(ui): normalize stray icon buttons to size-8"
```

---

### Task 8: Mobile tab bar — 44px touch targets

**Files:**
- Modify: `components/trip/mobile-tab-bar.tsx` (~55-58)

**Context:** tabs are `py-2` + `size-5` icon + `text-xs` ≈ 36px tall, below 44px.

- [ ] **Step 1:** Change `py-2` → `py-3` (or add `min-h-[44px]`) so each tab is ≥44px; keep icon/label sizes.
- [ ] **Step 2:** Verify in `npm run dev` mobile viewport — tab bar taller, targets comfortable, safe-area padding intact.
- [ ] **Step 3:** `npx vitest run components/trip/mobile-tab-bar.test.tsx` (if present); commit.
```bash
git add components/trip/mobile-tab-bar.tsx
git commit -m "fix(ui): 44px touch targets in mobile tab bar"
```

---

### Task 9: Route hand-rolled settings/toggle controls through primitives

**Files:**
- `components/trip/settings/driving-estimates-panel.tsx` (~62-93 hand-rolled `<input>`) → `<Field><Input …/></Field>`
- `components/discreet/discreet-toggle.tsx` (~35 hand-rolled `<button>`) → `<Button variant="…">`
- `components/trip/settings/invite-panel.tsx` (cancel button ~130-138; `mt-7` alignment hack ~167) → cancel via `<Button variant="ghost" size="icon" className="size-8">` or RowActions; replace `mt-7` with proper `items-end` flex alignment

- [ ] **Step 1:** For each, swap the hand-rolled element for the primitive; the primitive brings focus-ring/disabled/aria for free. Preserve existing behaviour (onChange handlers, aria-describedby wiring via `Field`).
- [ ] **Step 2:** For the invite form, wrap input+button in a `flex items-end gap-2` row and drop the `mt-7`.
- [ ] **Step 3:** Verify keyboard focus rings + layout in `npm run dev`.
- [ ] **Step 4:** `npm test` green; commit.
```bash
git add components/trip/settings/driving-estimates-panel.tsx components/discreet/discreet-toggle.tsx components/trip/settings/invite-panel.tsx
git commit -m "refactor(ui): route hand-rolled controls through Button/Input/Field"
```

---

### Task 10: Focus + interaction states on list/interactive elements

**Files:**
- `components/globe/marker-list.tsx` (row buttons ~39 missing focus ring; row radius ~33 `rounded-lg`)
- `components/trip/home/next-steps-card.tsx` (~29 items: ring but no hover/focus bg)
- `components/trip/reminders-card.tsx` (delete ~178-187) and `components/trip/attachment-list.tsx` (delete ~161-169) missing focus ring

- [ ] **Step 1:** `marker-list` row action → `<Button>`-based (inherits ring) or add the canonical ring classes; align row radius to the card standard (`rounded-xl` container / `rounded-lg` rows — consistent with Task 18's list decisions).
- [ ] **Step 2:** `next-steps-card` items → add `hover:bg-muted/50 focus-visible:bg-muted/30` alongside the existing ring so focus/hover are visible.
- [ ] **Step 3:** `reminders-card` + `attachment-list` delete → `<Button size="icon" className="size-8 text-destructive hover:bg-destructive/10">` (inherits ring), matching Task 5-7.
- [ ] **Step 4:** Keyboard-tab through each in `npm run dev` — visible focus everywhere.
- [ ] **Step 5:** `npm test`; commit.
```bash
git add components/globe/marker-list.tsx components/trip/home/next-steps-card.tsx components/trip/reminders-card.tsx components/trip/attachment-list.tsx
git commit -m "fix(ui): visible focus + hover states on list actions"
```

---

### Task 11: Focus-visible on discreet spreadsheet cells

**Files:**
- Modify: `components/discreet/stop-spreadsheet.tsx` (editable cells ~58-70, 102-114, 158-170)

**Context:** clickable cells (`cursor-text`, `onClick`) show a ring only on the invalid state; no focus indicator when tabbed.

- [ ] **Step 1:** Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1` to each editable cell's className (offset-1 to avoid clipping inside dense table rows). Ensure cells are focusable (`tabIndex={0}` if not already).
- [ ] **Step 2:** Verify keyboard navigation shows focus per cell in discreet mode (`npm run dev`).
- [ ] **Step 3:** `npx vitest run components/discreet/stop-spreadsheet.test.tsx` → PASS; commit.
```bash
git add components/discreet/stop-spreadsheet.tsx
git commit -m "fix(ui): focus-visible on discreet spreadsheet cells"
```

---

### Task 12: Copy sweep — Title Case dialog titles & buttons

**Files (dialog titles + create/edit button labels):**
- `components/trip/stop-form-dialog.tsx` (`Add a stop` → `Add Stop`; `Edit stop` → `Edit Stop`)
- `components/trip/transport-form-dialog.tsx` (`Add transport` → `Add Transport`)
- `components/trip/accommodation-form-dialog.tsx` (`Add accommodation` → `Add Accommodation`)
- `components/trip/chapter-form-dialog.tsx` (`Add a chapter` → `Add Chapter`)
- `components/trip/item-form-dialog.tsx` (`Add Item` stays; ensure default `label` prop + button match)
- `components/globe/marker-form.tsx` (`Add Marker`/`Edit Marker` — already Title Case; confirm)
- `components/globe/globe-view.tsx` (`Add marker` button → `Add Marker`)
- `components/trip/schedule-item-dialog.tsx` (title/buttons → Title Case)

**Rule:** Title Case, drop leading articles ("a"/"the"). Edit form = `Edit <Noun>`. Keep interpolated entity names as-is.

- [ ] **Step 1:** Grep the create/edit titles + button labels in the above files and normalize to Title Case, no articles.
- [ ] **Step 2:** If a test asserts a title/label string (e.g. `getByText("Add a stop")`), update that assertion — this is authorised for this task since the copy is the deliverable.
- [ ] **Step 3:** `npm test` → green (after assertion updates). Spot-check dialogs in `npm run dev`.
- [ ] **Step 4: Commit.**
```bash
git add components/trip/*-form-dialog.tsx components/trip/schedule-item-dialog.tsx components/globe/marker-form.tsx components/globe/globe-view.tsx
git commit -m "style(copy): Title Case dialog titles and action buttons"
```

---

### Task 13: Copy sweep — sentence-case empty states + unified help text

**Files (empty-state strings → sentence case + terminal period):**
- `components/globe/marker-list.tsx` (`No markers yet.`), `components/trip/add-from-globe-dialog.tsx`, `components/trip/wishlist-board.tsx` (`No Items yet` → `No items yet.`)
- `components/trip/timeline.tsx` (`Nothing planned` → `Nothing planned.`)
- `components/trip/activity-feed.tsx` (`No activity yet.`)
- `components/trip/checklist.tsx` (`No pre-trip tasks yet.` / `Packing list is empty.` — pick one shape: `No … yet.`)
- `components/trip/home/*` empty strings (`next-steps-card`, `phase-travelling`, `phase-sketching`) → sentence case + period
**Help-text unification (cost inputs):**
- `components/trip/inline-cost-fields.tsx`, `components/trip/cost-editor.tsx`, `components/trip/other-cost-editor.tsx`: standardize to `Leave blank if you haven't paid yet.` and `Optional — when the cost was paid.`

- [ ] **Step 1:** Normalize each empty-state string to sentence case with a terminal period; keep them scannable/short.
- [ ] **Step 2:** Replace the three cost help-text variants with the two canonical strings above.
- [ ] **Step 3:** Update any exact-string test assertions (authorised for this task).
- [ ] **Step 4:** `npm test` green; spot-check in `npm run dev`.
- [ ] **Step 5: Commit.**
```bash
git add components/globe/marker-list.tsx components/trip/add-from-globe-dialog.tsx components/trip/wishlist-board.tsx components/trip/timeline.tsx components/trip/activity-feed.tsx components/trip/checklist.tsx components/trip/home components/trip/inline-cost-fields.tsx components/trip/cost-editor.tsx components/trip/other-cost-editor.tsx
git commit -m "style(copy): sentence-case empty states + unified cost help text"
```

---

### Task 14: Globe marker-form feedback (search/delete/geocode/toasts)

**Files:**
- Modify: `components/globe/marker-form.tsx`

**Context (user-reported):** Search button has no spinner (only `disabled`), Delete has no `loading`, pin-drop reverse-geocode is silent, and save/edit/delete show no success toast (unlike `add-from-globe-dialog`, the convention).

- [ ] **Step 1:** Search button → `loading={searchPending}` (Button already renders a spinner).
- [ ] **Step 2:** Delete button → `loading={del.isPending}`.
- [ ] **Step 3:** Pin-drop reverse-geocode → show a subtle inline hint while the background geocode runs (e.g. a `text-xs text-muted-foreground` "Finding this place…" shown until `place` resolves). Gate it on prefill-present + not-yet-resolved.
- [ ] **Step 4:** Add success toasts using `toast` from `@/components/ui/use-toast`, matching `add-from-globe-dialog`'s format: on create `{ title: "Marker Added", description: title, variant: "success" }`; on edit `{ title: "Marker Updated", … }`; on delete `{ title: "Marker Removed", … }`. Fire in the existing `onSuccess` callbacks.
- [ ] **Step 5:** Verify each in `npm run dev`: search shows spinner; delete shows spinner; dropping a pin shows the hint then fills; each save/delete toasts.
- [ ] **Step 6:** `npx vitest run components/globe/marker-form.test.tsx` → PASS (add a test asserting the create toast fires on success if the test harness mocks the action).
- [ ] **Step 7: Commit.**
```bash
git add components/globe/marker-form.tsx
git commit -m "feat(globe): loading + toast feedback in marker form"
```

---

### Task 15: Standardize async feedback across the app

**Files:**
- `components/trip/cost-editor.tsx` + `components/trip/other-cost-editor.tsx`: replace the manual `submitting ? "Saving…" : "Save"` text with `loading={submitting}` on the submit Button.
- `components/trip/packing-templates-bar.tsx` (~229): add `disabled={applyPending}` alongside `loading`.
- `components/trip/nearby-wishlist.tsx` (~78-99): wrap the "Add to today" action in `useTransition`/local pending, disable + spinner while pending, toast on success.
- `components/trip/checklist.tsx`: give the toggle a pending/disabled state so rapid taps don't look dead.
- `components/trip/fork-switcher.tsx`: reorder gets a pending/disabled affordance.
- Unify the add-to-wishlist toast format between `add-from-globe-dialog.tsx` and `globe-suggestions-strip.tsx` (both: `{ title: "Added to Wishlist", description: <name>, variant: "success" }`).

- [ ] **Step 1:** Apply each change, reusing `useServerAction`/`useTransition` patterns already in the file.
- [ ] **Step 2:** Verify feedback on slow-network throttle in `npm run dev`.
- [ ] **Step 3:** `npm test` green; commit.
```bash
git add components/trip/cost-editor.tsx components/trip/other-cost-editor.tsx components/trip/packing-templates-bar.tsx components/trip/nearby-wishlist.tsx components/trip/checklist.tsx components/trip/fork-switcher.tsx components/trip/add-from-globe-dialog.tsx components/trip/globe-suggestions-strip.tsx
git commit -m "feat(ui): consistent loading + toast feedback on async actions"
```

---

### Task 16: Fix promote-fork currency formatting + right-align money

**Files:**
- Modify: `components/trip/promote-fork-dialog.tsx` (`formatBudgetDelta`, ~32-37)
- Modify: `components/trip/compare-table.tsx` (numeric cells ~345, 366-382; fork-name truncation ~509 → `min-w-0 truncate`)
- Modify: `components/trip/cost-amounts.tsx` (~22-40 fixed `min-w-[4rem]` assumes 2 decimals)
- Modify: `components/trip/spend-so-far-card.tsx` + `components/trip/cost-summary.tsx` (over/negative colour)
- Test: `components/trip/promote-fork-dialog.test.tsx`

**Context (real bug):** `formatBudgetDelta` uses `minor / 100`, `.toFixed(2)`, and a `${currency}${major}` prefix → wrong amount for JPY/KRW (0-dec) and BHD/KWD (3-dec), and renders `+USD1234.56`. `lib/money.ts` already exports `formatMoney`.

- [ ] **Step 1: Write the failing test** (import the helper — extract `formatBudgetDelta` to a named export if needed, or test via the rendered `DeltaSummary`):
```tsx
import { formatBudgetDelta } from "./promote-fork-dialog";
it("formats budget delta via formatMoney", () => {
  expect(formatBudgetDelta(123456, "AUD")).toBe("+A$1,234.56");
  expect(formatBudgetDelta(-1000, "JPY")).toBe("-¥1,000");   // 0-dec, no cents
  expect(formatBudgetDelta(0, "AUD")).toBeNull();
});
```
- [ ] **Step 2:** Run — FAIL. `npx vitest run components/trip/promote-fork-dialog.test.tsx`
- [ ] **Step 3:** Rewrite the helper:
```tsx
import { formatMoney } from "@/lib/money";
export function formatBudgetDelta(minor: number | null, currency: string): string | null {
  if (minor === null || minor === 0) return null;
  const sign = minor > 0 ? "+" : "-";
  return `${sign}${formatMoney(Math.abs(minor), currency)}`;
}
```
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** In `compare-table.tsx`, add `text-right` to the numeric cell renders in `renderCell()` (matching the mobile card's `text-right`); apply `min-w-0 truncate` to the desktop fork-name header. In `cost-amounts.tsx`, drop the hard `min-w-[4rem] sm:min-w-[5rem]` assumption in favour of a flex/`tabular-nums` layout that fits the currency's decimals. In `spend-so-far-card.tsx` + `cost-summary.tsx`, swap the ad-hoc `rose`/`red` over-estimate colours for `text-over` (Task 1 token); leave `success`/`emerald` "paid" as-is.
- [ ] **Step 6:** Verify a JPY trip + an over-estimate trip in `npm run dev`: correct symbols/decimals, numbers right-aligned, over-spend in rose.
- [ ] **Step 7:** `npm test` green; commit.
```bash
git add components/trip/promote-fork-dialog.tsx components/trip/promote-fork-dialog.test.tsx components/trip/compare-table.tsx components/trip/cost-amounts.tsx components/trip/spend-so-far-card.tsx components/trip/cost-summary.tsx
git commit -m "fix(money): formatMoney in promote preview, right-align numerics, rose over-token"
```

---

### Task 17: One card treatment (backgrounds, radius, gap, padding)

**Files:**
- `components/trip/item-card.tsx`, `transport-card.tsx`, `accommodation-card.tsx`: unify to opaque `bg-card`, `rounded-xl`, `shadow-soft`, `px-4 py-3`, one gap (`gap-2.5`). Drop `bg-card/60` (transport) and `bg-muted/30` (accommodation).
- Home section cards (`components/trip/home/*`): standardize inner padding to `p-5` (heroes may keep `p-6`); map wrappers drop `p-2` → `p-0` (frame via border+rounded, `overflow-hidden`).
- `components/trip/flag-list.tsx`: unify FlagRow (`px-4 py-3`) and success banner (`px-5 py-4`) to `px-4 py-3`.

- [ ] **Step 1:** Apply the card standard to the three entity cards; confirm no layout break where the bg change reveals overlap.
- [ ] **Step 2:** Normalize home card padding + map wrappers.
- [ ] **Step 3:** Unify flag-list padding.
- [ ] **Step 4:** Visual pass in `npm run dev` across itinerary, home phases, summary.
- [ ] **Step 5:** `npm test` green; commit.
```bash
git add components/trip/item-card.tsx components/trip/transport-card.tsx components/trip/accommodation-card.tsx components/trip/home components/trip/flag-list.tsx
git commit -m "refactor(ui): single card treatment (bg/radius/gap/padding)"
```

---

### Task 18: Cost-list items, control heights & settings spacing

**Files:**
- `components/trip/cost-editor.tsx` + `components/trip/other-cost-editor.tsx`: unify cost-list-item style to one shape (`rounded-lg px-3 py-2 bg-muted/40 border border-border/50`) and the "Add cost" button prominence (both `variant="outline" size="sm"`, no ad-hoc `text-xs`).
- `components/globe/marker-filters.tsx`: input/select `h-9` → match the button height used in the filter row (pick `h-9` for the whole row *or* `h-11` — choose the one that aligns; document choice in the commit).
- `components/trip/settings/*`: normalize `space-y-3/4/5/6` to one value (`space-y-5`).

- [ ] **Step 1:** Unify cost-list item styling + Add-cost button across the two cost editors.
- [ ] **Step 2:** Align marker-filters control heights so input/selects/button share one height.
- [ ] **Step 3:** Set all settings panels to `space-y-5`.
- [ ] **Step 4:** Visual pass in `npm run dev` (a cost list, the globe filters, each settings panel).
- [ ] **Step 5:** `npm test`; commit.
```bash
git add components/trip/cost-editor.tsx components/trip/other-cost-editor.tsx components/globe/marker-filters.tsx components/trip/settings
git commit -m "refactor(ui): unify cost-list items, filter heights, settings spacing"
```

---

### Task 19: Responsive fixes + missing empty/route states

**Files:**
- `components/trip/quick-add-stops.tsx` (~60-84): `flex-col sm:flex-row`, nights input `w-full sm:w-20`, so it doesn't overflow < 320px.
- `components/trip/month-grid.tsx` (~125): add `min-w-0` to the stop-name span so long names truncate instead of overflowing.
- `components/globe/marker-filters.tsx` / `components/trip/wishlist-board.tsx`: filter rows `flex-col sm:flex-row` (or `overflow-x-auto`) to avoid awkward wrap on mobile.
- `components/trip/notification-bell.tsx` (~66-73): badge `-right-1 -top-1` (safe margin, no clip).
- `components/trip/wishlist-map.tsx`: when 0 located items, render an `<EmptyState title="No map locations yet." description="Add places with coordinates to see them here." />` instead of `null`.
- `components/trip/spend-so-far-card.tsx`: render a small empty state instead of returning `null` silently when there's nothing to show.
- `components/trip/chapters-manager.tsx` (~114-118): replace bare `<p>` empty text with `<EmptyState>` (icon + title + Add action), matching the itinerary empty pattern.
- Create: `app/(app)/trips/[tripId]/error.tsx` and `app/(app)/trips/[tripId]/not-found.tsx` — trip-scoped boundaries. `error.tsx` is a `"use client"` component with `reset`; `not-found.tsx` renders a trip-context 404. Mirror the existing `app/(app)/error.tsx`/`not-found.tsx` structure.

- [ ] **Step 1:** Apply the responsive class fixes; verify at 320px in `npm run dev`.
- [ ] **Step 2:** Add the three empty states; verify by emptying the relevant data.
- [ ] **Step 3:** Add the two route files; force an error (throw in a page) and a `notFound()` to confirm they render.
- [ ] **Step 4:** `npm test` + `npm run build` green; commit.
```bash
git add components/trip/quick-add-stops.tsx components/trip/month-grid.tsx components/globe/marker-filters.tsx components/trip/wishlist-board.tsx components/trip/notification-bell.tsx components/trip/wishlist-map.tsx components/trip/spend-so-far-card.tsx components/trip/chapters-manager.tsx "app/(app)/trips/[tripId]/error.tsx" "app/(app)/trips/[tripId]/not-found.tsx"
git commit -m "fix(ui): responsive overflow fixes + missing empty/route states"
```

---

### Task 20: Long-tail a11y & consistency + docs

**Files:**
- `components/trip/vote-control.tsx` (~170-175): map vote-level colours onto the category/`over`/`success` token palette instead of hard-coded `orange/blue`.
- `components/trip/attachment-list.tsx`: either finish the `compact` prop (make it meaningfully denser) or remove it if unused — pick and note in the commit.
- `components/ui/badge.tsx` (~17-18): verify `warning` variant contrast in light mode; darken text or background to reach WCAG AA (confirm with a contrast check in `npm run dev`).
- `components/trip/nearby-wishlist.tsx` (~36-49): add `aria-label` to the expand/collapse toggle. `components/trip/reminders-card.tsx` (~108): add `aria-label="Add reminder"` to the Plus button.
- `components/trip/activity-feed.tsx` (~118): keep the `→` `aria-hidden` and add an accessible phrasing on the change item (e.g. `aria-label` "changed from X to Y").
- Docs: update `COMPONENTS.md` (icon-button standard now size-8 everywhere + RowActions adoption; copy voice; card treatment; `over` token) and mark the old "Open visual-consistency follow-up" as resolved. Create `docs/adr/0029-normalized-ui-conventions.md` recording the four convention decisions + the `over` token, noting it **supersedes** the open follow-up in ADR 0026.

- [ ] **Step 1:** Apply the long-tail component fixes; verify each in `npm run dev`.
- [ ] **Step 2:** Update `COMPONENTS.md`; write ADR 0029 (Context / Decision / Consequences; reference 0026).
- [ ] **Step 3:** `npm test` + `npm run build` + `npm run lint` all green.
- [ ] **Step 4: Commit.**
```bash
git add components/trip/vote-control.tsx components/trip/attachment-list.tsx components/ui/badge.tsx components/trip/nearby-wishlist.tsx components/trip/reminders-card.tsx components/trip/activity-feed.tsx COMPONENTS.md docs/adr/0029-normalized-ui-conventions.md
git commit -m "fix(ui): long-tail a11y/consistency; document normalized conventions"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** Tier 1 → Tasks 2 (dialog header), 4-8 (icon/tap-target), 3+9-11 (focus/primitives), 12-13 (copy), 14-15 (async). Tier 2 → Task 16. Tier 3 → Tasks 17-18. Tier 4 → Task 19. Tier 5 → Task 20. Both user-reported items covered (dialog header = Task 2; globe marker feedback = Task 14). Money bug = Task 16. Docs/ADR = Task 20. CONTEXT.md untouched ✓.

**Placeholder scan:** logic tasks carry concrete code/tests; normalization tasks carry exact target class values + file:line sites + visual verification (the actionable equivalent for a class-normalization refactor in an existing codebase — implementers read the referenced source before editing).

**Type/name consistency:** `formatBudgetDelta` signature stable across Task 16 test + impl; `over` token name (`--over`/`text-over`) consistent between Task 1 (produces) and Task 16 (consumes); `size-8`/`RowActions` convention consistent across Tasks 4-11.
