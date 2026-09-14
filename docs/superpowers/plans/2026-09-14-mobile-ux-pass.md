# Mobile UI/UX Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate iOS Safari's input auto-zoom, fix modal sizing/compression on phones, de-fragilize the bottom overlay stack, and verify the main screens at 320/390px with a screenshot sweep.

**Architecture:** All fixes are Tailwind class changes to shared UI primitives (`components/ui/`) plus a handful of one-line call-site fixes. The overlay stack gains a single CSS custom property (`--tp-tab-bar-h`) as the source of truth for the mobile tab bar's height. Verification is className-assertion component tests (existing house style) plus a Playwright screenshot sweep at mobile viewports.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS v4 (CSS-first config in `app/globals.css`), Radix UI primitives, Vitest 4 + Testing Library, Playwright (already installed in `node_modules` via `npm i --no-save`; Chromium headless shell downloaded and verified working).

## Global Constraints

- Branch: all work on `mobile-ux-pass`. NEVER commit to `main`. NEVER deploy anything.
- Zero desktop visual change: every mobile fix must be gated below `sm:` (or `md:` where the existing breakpoint is md). The one agreed exception: the Make it fit dialog becomes `sm:max-w-2xl` on desktop (Task 6).
- iOS zoom rule: every text-entry control (input, textarea, select trigger/items, native select) must render at ≥16px font below the `sm` breakpoint. Pattern: `text-base sm:text-sm`.
- Do NOT touch `components/command-palette.tsx:291` — its `text-base` override is load-bearing for desktop (the palette is intentionally 16px at all widths).
- Do NOT add `@playwright/test` to `package.json` — it stays a manual, out-of-tree install (matching `.verify/shoot.mjs`'s header comment).
- Run `npm test` (vitest) scoped to the touched files per task; run `npm run lint` before each commit.
- Commit style: conventional commits, subject ≤72 chars, matching recent history (e.g. `fix(ui): …`, `test(ui): …`).

---

### Task 1: 16px form controls on mobile (kills iOS input auto-zoom)

**Files:**
- Modify: `components/ui/input.tsx:24`
- Modify: `components/ui/textarea.tsx:23`
- Modify: `components/ui/select.tsx:19` (SelectTrigger), `components/ui/select.tsx:117` (SelectItem)
- Modify: `components/globe/marker-filters.tsx:23` (raw input), `components/globe/marker-filters.tsx:34` (raw native select)
- Modify: `components/trip/ai-booking-parser.tsx:67` (raw textarea)
- Test (create): `components/ui/mobile-font-size.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: no API change — className-only edits. Every later task can assume form controls are `text-base sm:text-sm`.

**Background for the implementer:** iOS Safari force-zooms the page when a focused form control's computed font-size is <16px. Tailwind `text-sm` = 14px, `text-base` = 16px. The fix is `text-base sm:text-sm`: 16px on phones, unchanged 14px from 640px up.

- [ ] **Step 1: Write the failing test**

Create `components/ui/mobile-font-size.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Select, SelectTrigger, SelectValue } from "./select";

/**
 * iOS Safari auto-zooms the page when a focused control's font-size is <16px.
 * Every text-entry primitive must therefore be text-base (16px) below sm and
 * may only drop to text-sm (14px) from sm up.
 */
describe("form controls are ≥16px on mobile (iOS zoom guard)", () => {
  it("Input is text-base on mobile, text-sm from sm up", () => {
    render(<Input aria-label="name" />);
    const el = screen.getByRole("textbox", { name: "name" });
    expect(el.className).toContain("text-base");
    expect(el.className).toContain("sm:text-sm");
    expect(el.className).not.toMatch(/(?<!sm:)text-sm(?![-\w])/);
  });

  it("Textarea is text-base on mobile, text-sm from sm up", () => {
    render(<Textarea aria-label="notes" />);
    const el = screen.getByRole("textbox", { name: "notes" });
    expect(el.className).toContain("text-base");
    expect(el.className).toContain("sm:text-sm");
  });

  it("SelectTrigger is text-base on mobile, text-sm from sm up", () => {
    render(
      <Select>
        <SelectTrigger aria-label="pick">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
      </Select>,
    );
    const el = screen.getByRole("combobox", { name: "pick" });
    expect(el.className).toContain("text-base");
    expect(el.className).toContain("sm:text-sm");
  });
});
```

Note on the negative regex in the first test: it asserts the bare `text-sm` token is gone (only the `sm:text-sm` variant remains). If the lookbehind proves brittle against the full class string, replace it with `expect(el.className.split(" ")).not.toContain("text-sm")` — the split-token form is the robust one; feel free to use it in all three tests.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/ui/mobile-font-size.test.tsx`
Expected: FAIL — className contains `text-sm`, not `text-base`.

- [ ] **Step 3: Make the primitive edits**

In `components/ui/input.tsx:24`, change:

```
"flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-soft transition-colors",
```

to:

```
"flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground shadow-soft transition-colors sm:text-sm",
```

In `components/ui/textarea.tsx:23`, change:

```
"flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-soft transition-colors",
```

to:

```
"flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground shadow-soft transition-colors sm:text-sm",
```

In `components/ui/select.tsx:19` (SelectTrigger), change:

```
"flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-soft transition-colors",
```

to:

```
"flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground shadow-soft transition-colors sm:text-sm",
```

In `components/ui/select.tsx:117` (SelectItem — its options render inside the picker overlay on the same tap-to-focus flow), change:

```
"relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
```

to:

```
"relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-base outline-none sm:text-sm",
```

- [ ] **Step 4: Make the raw-control edits**

In `components/globe/marker-filters.tsx:23` (search input), change `text-sm` to `text-base sm:text-sm`:

```
className="min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm"
```

In `components/globe/marker-filters.tsx:34` (native country select — native selects also trigger iOS zoom):

```
className="rounded-full border border-border bg-card px-3 py-2 text-base sm:text-sm"
```

In `components/trip/ai-booking-parser.tsx:67` (raw textarea), change `text-sm` to `text-base sm:text-sm`:

```
className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none min-h-[100px] sm:text-sm"
```

Do NOT touch `components/command-palette.tsx:291` — its `text-base` override intentionally keeps the palette at 16px on desktop too, and still wins over the new base classes via tailwind-merge.

- [ ] **Step 5: Run the new test + the full suite for touched areas**

Run: `npx vitest run components/ui/mobile-font-size.test.tsx components/ui components/globe components/trip/ai-booking-parser.test.tsx 2>/dev/null || npx vitest run components/ui components/globe`
Expected: all PASS. If any existing test asserts the old bare `text-sm` on these controls, update that assertion to the new pair — the new classes are the spec.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add components/ui/input.tsx components/ui/textarea.tsx components/ui/select.tsx components/globe/marker-filters.tsx components/trip/ai-booking-parser.tsx components/ui/mobile-font-size.test.tsx
git commit -m "fix(ui): 16px form controls on mobile to stop iOS input auto-zoom"
```

---

### Task 2: Sticky DialogFooter (Save/Cancel always reachable)

**Files:**
- Modify: `components/ui/dialog.tsx:107-125` (DialogFooter)
- Test: `components/ui/dialog.test.tsx` (extend the existing `DialogFooter` describe block)

**Interfaces:**
- Consumes: nothing.
- Produces: `DialogFooter` is now `sticky bottom-0` inside the dialog's scroll body. Callers unchanged — same component API. Task 8's screenshot sweep relies on this rendering correctly in tall form dialogs.

**Background:** `DialogContent`'s scroll body (dialog.tsx:70) is `overflow-y-auto px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:pt-6`. `DialogHeader` already pins to the top with `sticky top-0 -mx-6 -mt-4 … bg-card`. The footer mirrors it at the bottom: negative bottom margin cancels the body's bottom padding so the stuck footer sits flush with the scrollport edge; opaque `bg-card` + `border-t` covers content scrolling beneath. `position: sticky` works from inside a `<form>` wrapper (the common case via `useEntityForm` forms) because the form spans the full content height.

- [ ] **Step 1: Write the failing test**

In `components/ui/dialog.test.tsx`, add to the existing `describe("DialogFooter", …)` block:

```tsx
  it("pins to the bottom of the scroll body so actions stay reachable on tall forms", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Test</DialogTitle>
          <DialogFooter>
            <button>Cancel</button>
            <button>Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    const footer = screen.getByRole("button", { name: "Cancel" }).closest("div")!;
    expect(footer.className).toContain("sticky");
    expect(footer.className).toContain("bottom-0");
    // Opaque, separated surface — content scrolling underneath must not show through.
    expect(footer.className).toContain("bg-card");
    expect(footer.className).toContain("border-t");
    // Cancels the scroll body's own bottom padding so the stuck footer sits flush.
    expect(footer.className).toContain("-mb-[calc(1.5rem+env(safe-area-inset-bottom))]");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/ui/dialog.test.tsx`
Expected: the new test FAILS (`sticky` not found); all pre-existing tests PASS.

- [ ] **Step 3: Implement**

In `components/ui/dialog.tsx`, replace the DialogFooter className (line 118):

```
"flex flex-row gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-initial",
```

with:

```
// Pinned to the bottom of the scroll body (mirror of DialogHeader's sticky
// top): the negative bottom margin cancels the body's own bottom padding so
// the stuck footer sits flush with the scrollport edge, and the opaque
// bg-card + border-t cover content scrolling beneath it.
"sticky bottom-0 z-10 -mx-6 -mb-[calc(1.5rem+env(safe-area-inset-bottom))] mt-2 border-t border-border/60 bg-card px-6 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]",
"flex flex-row gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-initial",
```

(Two strings inside the existing `cn(…)` call, before `className`.)

- [ ] **Step 4: Run the dialog tests**

Run: `npx vitest run components/ui/dialog.test.tsx`
Expected: all PASS, including the pre-existing footer layout test (its assertions — `flex-row`, `[&>*]:flex-1`, `sm:justify-end`, `sm:[&>*]:flex-initial`, DOM order — all still hold).

- [ ] **Step 5: Spot-check one heavy consumer's tests**

Run: `npx vitest run components/ui/form-dialog.test.tsx components/ui/confirm-dialog.test.tsx`
Expected: PASS (skip any file that doesn't exist).

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add components/ui/dialog.tsx components/ui/dialog.test.tsx
git commit -m "fix(ui): pin DialogFooter to the sheet bottom so actions never scroll away"
```

---

### Task 3: Sheet — dvh height cap and internal scrolling

**Files:**
- Modify: `components/ui/sheet.tsx:30-49` (sheetVariants)
- Test: `components/ui/sheet.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: bottom sheets are capped at `90dvh` (consistent with dialog.tsx:51) and scroll internally; right/left sheets scroll internally. `docked` variant untouched (the feedback panel manages its own `min-h-0 flex-1 overflow-y-auto` scroll region — do not interfere with it).

- [ ] **Step 1: Write the failing test**

In `components/ui/sheet.test.tsx`, add:

```tsx
  it("caps the bottom sheet with dvh and scrolls overflowing content internally", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Default</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole("dialog");
    // dvh, not vh: vh ignores the iOS dynamic toolbar, so a 90vh sheet can
    // poke under the browser chrome. dialog.tsx already uses 90dvh.
    expect(panel.className).toContain("max-h-[90dvh]");
    expect(panel.className).not.toContain("max-h-[90vh]");
    expect(panel.className).toContain("overflow-y-auto");
  });

  it("scrolls side sheets internally too", () => {
    render(
      <Sheet open>
        <SheetContent side="right">
          <SheetTitle>Side</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.className).toContain("overflow-y-auto");
  });

  it("leaves the docked variant's scroll management to its content", () => {
    render(
      <Sheet open>
        <SheetContent side="docked" hideOverlay>
          <SheetTitle>Docked</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.className).not.toContain("overflow-y-auto");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/ui/sheet.test.tsx`
Expected: the two new positive tests FAIL; everything else PASSES.

- [ ] **Step 3: Implement**

In `components/ui/sheet.tsx`, edit `sheetVariants` (lines 35-39). Change `bottom` from:

```
"inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl border-t data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down",
```

to:

```
"inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-2xl border-t data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down",
```

Change `right` from:

```
"inset-y-0 right-0 h-full w-[calc(100%-2rem)] max-w-sm border-l data-[state=open]:tp-slide-in-right data-[state=closed]:tp-slide-out-right",
```

to:

```
"inset-y-0 right-0 h-full w-[calc(100%-2rem)] max-w-sm overflow-y-auto border-l data-[state=open]:tp-slide-in-right data-[state=closed]:tp-slide-out-right",
```

Change `left` from:

```
"inset-y-0 left-0 h-full w-[calc(100%-2rem)] max-w-sm border-r data-[state=open]:tp-slide-in-left data-[state=closed]:tp-slide-out-left",
```

to:

```
"inset-y-0 left-0 h-full w-[calc(100%-2rem)] max-w-sm overflow-y-auto border-r data-[state=open]:tp-slide-in-left data-[state=closed]:tp-slide-out-left",
```

Leave `docked` exactly as is.

- [ ] **Step 4: Run the sheet tests + the two sheet consumers' tests**

Run: `npx vitest run components/ui/sheet.test.tsx components/trip/mobile-tab-bar.test.tsx components/feedback/feedback-launcher.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add components/ui/sheet.tsx components/ui/sheet.test.tsx
git commit -m "fix(ui): bottom sheet uses dvh and sheets scroll tall content internally"
```

---

### Task 4: Overlay stack — one source of truth for the tab-bar height

**Files:**
- Modify: `app/globals.css` (add `--tp-tab-bar-h` to a `:root` rule)
- Modify: `components/trip/mobile-tab-bar.tsx:47,58,79` (nav height from the var; links center within it)
- Modify: `components/feedback/feedback-launcher.tsx:493` (FAB offset from the var)
- Modify: `components/ui/toast.tsx:27-46` (viewport padding from the var; trim now-stale comment arithmetic)
- Modify: `app/(app)/trips/[tripId]/layout.tsx:161` (content clearance from the var)
- Test: `components/ui/toast.test.tsx:16-18`, `components/trip/mobile-tab-bar.test.tsx`, `components/feedback/feedback-launcher.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: global CSS custom property `--tp-tab-bar-h: 4rem` on `:root`. Anything needing clearance above the mobile tab bar computes from it. Rendered offsets are value-identical to today (FAB bottom: 4+1 = 5rem; toast pb: 4+4.25 = 8.25rem; layout pb: 4+1 = 5rem), except the tab bar itself becomes exactly 4rem tall instead of its intrinsic ~3.94rem (+1px, imperceptible).

- [ ] **Step 1: Write the failing tests**

In `components/ui/toast.test.tsx`, replace the assertion at lines 16-18:

```tsx
    expect(viewport.className).toContain(
      "pb-[calc(8.25rem+env(safe-area-inset-bottom))]",
    );
```

with:

```tsx
    // Clearance is computed from the tab bar's published height (--tp-tab-bar-h,
    // app/globals.css) + 1rem gap + 2.75rem FAB + 0.5rem spare = tab bar + 4.25rem.
    expect(viewport.className).toContain(
      "pb-[calc(var(--tp-tab-bar-h)+4.25rem+env(safe-area-inset-bottom))]",
    );
```

In `components/trip/mobile-tab-bar.test.tsx`, add:

```tsx
  it("publishes its height via --tp-tab-bar-h so the FAB and toasts can clear it", () => {
    renderBar(); // use this file's existing render helper/setup for the nav
    const nav = screen.getByRole("navigation", { name: "Trip sections" });
    expect(nav.className).toContain(
      "h-[calc(var(--tp-tab-bar-h)+env(safe-area-inset-bottom))]",
    );
  });
```

(Adapt `renderBar()` to however the existing tests in that file render the component — reuse their setup verbatim.)

In `components/feedback/feedback-launcher.test.tsx`, add an assertion wherever the trigger button is already rendered (reuse an existing test's setup):

```tsx
    const trigger = screen.getByRole("button", { name: /leave feedback/i });
    expect(trigger.className).toContain(
      "bottom-[calc(var(--tp-tab-bar-h)+1rem+env(safe-area-inset-bottom))]",
    );
```

- [ ] **Step 2: Run to verify the new assertions fail**

Run: `npx vitest run components/ui/toast.test.tsx components/trip/mobile-tab-bar.test.tsx components/feedback/feedback-launcher.test.tsx`
Expected: new/changed assertions FAIL; the rest PASS.

- [ ] **Step 3: Add the variable in `app/globals.css`**

Add a `:root` block (near the top of the file, after the imports/`@theme` region — anywhere top-level is fine, keep it out of the `@theme inline` block since it is not a design token):

```css
/*
 * Height of the mobile trip tab bar (components/trip/mobile-tab-bar.tsx),
 * excluding the safe-area inset. Single source of truth for everything that
 * must clear the bar: the feedback FAB (components/feedback/feedback-launcher.tsx),
 * the toast viewport (components/ui/toast.tsx), and the trip layout's bottom
 * padding (app/(app)/trips/[tripId]/layout.tsx). Change it here and all four
 * move together.
 */
:root {
  --tp-tab-bar-h: 4rem;
}
```

- [ ] **Step 4: Make the tab bar consume it**

In `components/trip/mobile-tab-bar.tsx:47`, change the nav className from:

```
"fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
```

to:

```
"fixed inset-x-0 bottom-0 z-40 flex h-[calc(var(--tp-tab-bar-h)+env(safe-area-inset-bottom))] border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
```

The bar's height is now explicit instead of intrinsic, so the links must center in it instead of padding it out. In the same file, both the `<Link>` className (line 58) and the More `<button>` className (line 79) change from:

```
"flex flex-1 flex-col items-center gap-0.5 py-3 text-xs",
```

to:

```
"flex flex-1 flex-col items-center justify-center gap-0.5 text-xs",
```

- [ ] **Step 5: Make the three consumers compute from it**

In `components/feedback/feedback-launcher.tsx:493`, change the FAB className:

```
className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 size-11 rounded-full shadow-lg md:bottom-[calc(1rem+env(safe-area-inset-bottom))] print:hidden"
```

to:

```
className="fixed bottom-[calc(var(--tp-tab-bar-h)+1rem+env(safe-area-inset-bottom))] right-4 z-40 size-11 rounded-full shadow-lg md:bottom-[calc(1rem+env(safe-area-inset-bottom))] print:hidden"
```

Also update the big comment above it (lines 466-472): replace the sentence about "~3.94rem tall … 5rem is the clearance" with a note that the bar publishes its height as `--tp-tab-bar-h` (app/globals.css) and the offset is computed as `var(--tp-tab-bar-h) + 1rem`; keep the rest of the comment (print:hidden and asChild rationale) untouched.

In `components/ui/toast.tsx:46`, change:

```
"fixed bottom-0 right-0 z-100 flex max-h-screen w-full flex-col-reverse gap-2 p-4 pb-[calc(8.25rem+env(safe-area-inset-bottom))] md:bottom-4 md:left-4 md:right-auto md:pb-4 sm:top-auto sm:max-w-sm",
```

to:

```
"fixed bottom-0 right-0 z-100 flex max-h-screen w-full flex-col-reverse gap-2 p-4 pb-[calc(var(--tp-tab-bar-h)+4.25rem+env(safe-area-inset-bottom))] md:bottom-4 md:left-4 md:right-auto md:pb-4 sm:top-auto sm:max-w-sm",
```

And rewrite the hand-arithmetic portion of the comment block (lines 28-34) to explain the computed form, e.g.:

```
      // Below md: bottom-right, above the Feedback trigger. Clearance is
      // computed from the tab bar's published height (--tp-tab-bar-h,
      // app/globals.css): bar + 1rem gap to the 2.75rem (size-11) trigger
      // + 0.5rem spare = var(--tp-tab-bar-h) + 4.25rem, carrying the same
      // env() term as the trigger so the gap can't close on a device with a
      // non-zero inset. The panel is full-screen at this size and wants its
      // toasts on top of it, so this corner stays as it is.
```

(Keep the md-and-up half of the comment as is.)

In `app/(app)/trips/[tripId]/layout.tsx:161`, change:

```
<div className="py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
```

to:

```
<div className="py-6 pb-[calc(var(--tp-tab-bar-h)+1rem+env(safe-area-inset-bottom))] md:pb-6">
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run components/ui/toast.test.tsx components/trip/mobile-tab-bar.test.tsx components/feedback/feedback-launcher.test.tsx app`
Expected: all PASS. If any other test asserts the old `5rem`/`8.25rem` literals, update it to the computed form — grep first: `grep -rn "8.25rem\|calc(5rem" --include="*.test.tsx" components app`.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint
git add app/globals.css components/trip/mobile-tab-bar.tsx components/feedback/feedback-launcher.tsx components/ui/toast.tsx "app/(app)/trips/[tripId]/layout.tsx" components/ui/toast.test.tsx components/trip/mobile-tab-bar.test.tsx components/feedback/feedback-launcher.test.tsx
git commit -m "refactor(ui): overlay stack clears the tab bar via one --tp-tab-bar-h source"
```

---

### Task 5: Stack dialog field pairs on phones

**Files:**
- Modify: `components/trip/stop-form-dialog.tsx:313`
- Modify: `components/trip/accommodation-form-dialog.tsx:336,357`
- Modify: `components/trip/transport-form-dialog.tsx:469,525`
- Modify: `components/trip/item-form-dialog.tsx:463`
- Modify: `components/trip/schedule-item-dialog.tsx:137`
- Modify: `components/trip/chapter-form-dialog.tsx:206`

**Interfaces:**
- Consumes: nothing.
- Produces: field pairs in form dialogs are stacked below `sm`, side-by-side from `sm` up.

**Background:** All 8 occurrences are `<div className="grid grid-cols-2 gap-3">` wrapping a pair of date/time/select fields. Native `<input type="date">` has a large intrinsic min-width on iOS; two side-by-side overflow or squash at 320-390px. Agreed fix: stack on phones.

- [ ] **Step 1: Make the edits**

In each of the 8 locations listed above, change exactly:

```
className="grid grid-cols-2 gap-3"
```

to:

```
className="grid grid-cols-1 gap-3 sm:grid-cols-2"
```

Before editing, eyeball each spot to confirm it wraps a form-field pair (all eight do — dates, times, or a date+select). If one of the line numbers has drifted, find it with `grep -n "grid grid-cols-2 gap-3" components/trip/*.tsx` — there are exactly these 8 hits in these 6 files.

- [ ] **Step 2: Run the dialogs' test files**

Run: `npx vitest run components/trip/stop-form-dialog.test.tsx components/trip/accommodation-form-dialog.test.tsx components/trip/transport-form-dialog.test.tsx components/trip/item-form-dialog.test.tsx components/trip/schedule-item-dialog.test.tsx components/trip/chapter-form-dialog.test.tsx`
Expected: PASS (skip any file that doesn't exist). If a test asserts `grid-cols-2`, update it to the responsive pair.

- [ ] **Step 3: Lint and commit**

```bash
npm run lint
git add components/trip/stop-form-dialog.tsx components/trip/accommodation-form-dialog.tsx components/trip/transport-form-dialog.tsx components/trip/item-form-dialog.tsx components/trip/schedule-item-dialog.tsx components/trip/chapter-form-dialog.tsx
git commit -m "fix(trip): stack dialog field pairs below sm so date inputs never squash"
```

(Include any updated test files in the `git add`.)

---

### Task 6: Make it fit dialog — correct width override

**Files:**
- Modify: `components/trip/make-it-fit.tsx:184`
- Test: `components/trip/make-it-fit.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: the dialog is a normal full-bleed bottom sheet on mobile and genuinely `max-w-2xl` on desktop.

**Background:** `<DialogContent className="max-w-2xl">` is a bug on both ends: unprefixed, it caps the mobile bottom sheet at 672px (breaking the `inset-x-0` full-bleed sheet on wide-mobile/tablet portrait), while on desktop the base `sm:max-w-lg` (a different variant, so tailwind-merge keeps both) still wins — the wide two-column diff never renders. `sm:max-w-2xl` fixes both: tailwind-merge drops the base `sm:max-w-lg` in its favour.

- [ ] **Step 1: Write the failing test**

In `components/trip/make-it-fit.test.tsx`, add (reusing the file's existing render setup/mocks for the component):

```tsx
  it("is full-bleed on mobile and wide (2xl) on desktop", () => {
    renderMakeItFit(); // reuse this file's existing setup helper
    const content = screen.getByRole("dialog");
    // No unprefixed max-w-*: it would cap the mobile bottom sheet.
    expect(content.className.split(" ")).not.toContain("max-w-2xl");
    // Desktop gets the wide two-column diff.
    expect(content.className).toContain("sm:max-w-2xl");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/trip/make-it-fit.test.tsx`
Expected: new test FAILS; existing tests PASS.

- [ ] **Step 3: Implement**

In `components/trip/make-it-fit.tsx:184`, change:

```tsx
<DialogContent className="max-w-2xl">
```

to:

```tsx
<DialogContent className="sm:max-w-2xl">
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/trip/make-it-fit.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add components/trip/make-it-fit.tsx components/trip/make-it-fit.test.tsx
git commit -m "fix(trip): make-it-fit dialog full-bleed on mobile, sm:max-w-2xl on desktop"
```

---

### Task 7: Documentation — checklist and conventions

**Files:**
- Modify: `docs/mobile-pwa-checklist.md`
- Modify: `COMPONENTS.md` (the "Finalized UI conventions" section, from line 263)

**Interfaces:**
- Consumes: the conventions established in Tasks 1-4.
- Produces: documented rules future work is checked against.

- [ ] **Step 1: Update the checklist's global criteria**

In `docs/mobile-pwa-checklist.md`, in the global criteria list (around lines 18-19, next to "All content text ≥ 12 px"), add:

```markdown
- [ ] All form controls (inputs, textareas, selects) render text at **≥ 16 px** on mobile — anything smaller makes iOS Safari auto-zoom the page on focus. (Shared primitives use `text-base sm:text-sm`; any new raw control must follow suit.)
```

- [ ] **Step 2: Drop the two stale route sections**

Delete the whole `## Chapters (`/trips/[id]/chapters`)` section (lines 156-163ish, everything up to the next `##` heading) and the whole `## Discreet mode (`/trips/[id]/discreet`)` section (lines 243-251ish) — neither route exists anymore.

- [ ] **Step 3: Add the two new conventions to COMPONENTS.md**

In `COMPONENTS.md`, inside "Finalized UI conventions" (after the "Money tokens" subsection, before the closing `---` at line 302), add:

```markdown
### Mobile form-control font size

Every text-entry control is **16 px below `sm`** (`text-base sm:text-sm`) — iOS Safari
auto-zooms the page when a focused control is smaller. `Input`, `Textarea`,
`SelectTrigger`, and `SelectItem` already do this; any raw `<input>`, `<textarea>`,
or native `<select>` added outside the primitives must carry the same pair.
Guarded by `components/ui/mobile-font-size.test.tsx`.

### Bottom overlay stack (mobile)

Everything that must clear the mobile trip tab bar computes its offset from
`--tp-tab-bar-h` (declared in `app/globals.css`, consumed by the tab bar itself,
the feedback FAB, the toast viewport, and the trip layout's bottom padding).
Never hand-tune a `5rem`-style clearance against the bar — change the variable
or compose `calc(var(--tp-tab-bar-h) + …)`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/mobile-pwa-checklist.md COMPONENTS.md
git commit -m "docs: record 16px mobile input rule and --tp-tab-bar-h overlay convention"
```

---

### Task 8: Mobile screenshot sweep at 320/390px — verify and fix leftovers

**Files:**
- Modify: `.verify/shoot.mjs` (add a mobile sweep section)
- Possibly modify: whatever the sweep flags (fixes land as separate commits)

**Interfaces:**
- Consumes: all previous tasks (this validates them in a real browser).
- Produces: `.verify/m320-*.png` and `.verify/m390-*.png` screenshots; fixes for anything overlapping/unreadable they reveal.

**Environment notes (verified working in this sandbox):**
- `@playwright/test` is installed in `node_modules` via `npm i -D @playwright/test --no-save` and Chromium headless shell is downloaded (`npx playwright install chromium`) — a fresh subagent inherits both; re-run those two commands only if `node -e "require('@playwright/test')"` fails. Do NOT add it to `package.json`.
- The `/tmp/chromium-libs` LD_LIBRARY_PATH shim at the top of shoot.mjs is a no-op when the directory doesn't exist — leave it.
- Dev server: `npx next dev -p 3939` (run in background, wait for "Ready"). Sign-in flow and the `seed-trip-europe-2026` trip are what shoot.mjs already uses; if the trip is missing from the dev DB, run `npm run db:seed` first.

- [ ] **Step 1: Extend `.verify/shoot.mjs` with a mobile section**

Refactor the existing "07 calendar mobile" block into a loop. Replace that section (lines 123-143) with:

```js
  // ─── Mobile sweep: 320px (iPhone SE floor) and 390px ────────────────────
  for (const [tag, viewport] of [
    ["m320", { width: 320, height: 568 }],
    ["m390", { width: 390, height: 844 }],
  ]) {
    console.log(`\nMobile sweep ${tag} (${viewport.width}×${viewport.height})…`);
    const mCtx = await browser.newContext({ viewport, colorScheme: "light" });
    const mPage = await mCtx.newPage();
    await goto(mPage, `${BASE}/signin`);
    await screenshot(mPage, `${tag}-signin.png`);
    const btn = mPage.getByRole("button", { name: /Continue as You/i });
    await btn.waitFor({ timeout: 10000 });
    await btn.click();
    await mPage.waitForURL("**/trips", { timeout: 15000 });
    await mPage.waitForTimeout(600);
    await mPage.evaluate(() => {
      window.localStorage.setItem("trip-planner-theme", "light");
    });

    for (const [name, path] of [
      ["trips", `/trips`],
      ["home", `/trips/${TRIP}`],
      ["plan", `/trips/${TRIP}/plan`],
      ["calendar", `/trips/${TRIP}/calendar`],
      ["budget", `/trips/${TRIP}/budget`],
      ["wishlist", `/trips/${TRIP}/wishlist`],
      ["day", `/trips/${TRIP}/day/2026-07-02`],
    ]) {
      await goto(mPage, `${BASE}${path}`);
      await screenshot(mPage, `${tag}-${name}.png`);
    }

    // Form dialog: open an "add" affordance on the plan page and capture the
    // sheet with its (now sticky) footer and stacked field pairs.
    await goto(mPage, `${BASE}/trips/${TRIP}/plan`);
    const addBtn = mPage
      .getByRole("button", { name: /add stop|add a stop|add/i })
      .first();
    try {
      await addBtn.click({ timeout: 5000 });
      await mPage.waitForTimeout(600);
      await mPage.screenshot({
        path: path.join(OUT, `${tag}-dialog-add.png`),
        fullPage: false,
      });
      console.log(`  ✓ ${tag}-dialog-add.png`);
      await mPage.keyboard.press("Escape");
    } catch {
      console.log(`  (skipped ${tag}-dialog-add.png — no add button found)`);
    }

    // One dark-mode sanity shot per viewport.
    await setTheme(mPage, "dark");
    await goto(mPage, `${BASE}/trips/${TRIP}`);
    await screenshot(mPage, `${tag}-home-dark.png`);

    await mCtx.close();
  }
```

(Delete the old `07-calendar-mobile` block it replaces; keep everything before it — desktop shots — unchanged.)

- [ ] **Step 2: Start the dev server and run the sweep**

```bash
cd /work && npx next dev -p 3939   # run in background
# wait until it logs "Ready", then:
node .verify/shoot.mjs
```

Expected: script completes, listing each `✓ mXXX-*.png`. If the seed trip 404s, run `npm run db:seed` and retry. If the dev-login button isn't present, report back instead of hacking around auth.

- [ ] **Step 3: Review every mobile screenshot**

Read each `m320-*` and `m390-*` PNG with the Read tool. Check against the checklist's global criteria: nothing overlapping (tab bar / FAB / content), nothing clipped off-screen horizontally, text readable, dialogs fitting the viewport with reachable actions, the add-dialog shot showing stacked field pairs and a pinned footer. List every defect found with screen + description.

- [ ] **Step 4: Fix what the sweep found**

For each defect: smallest targeted fix, keep desktop unaffected (gate below `sm`/`md`), update or add the relevant component test if the file has one, re-run the sweep for the affected screen to confirm, then commit per logical fix:

```bash
git add <files>
git commit -m "fix(mobile): <specific defect>"
```

If nothing is found, say so explicitly — do not invent fixes.

- [ ] **Step 5: Full test suite + lint gate**

```bash
npm test
npm run lint
```

Expected: everything green. Fix any fallout before committing.

- [ ] **Step 6: Commit the sweep script**

```bash
git add .verify/shoot.mjs
git commit -m "test(verify): mobile screenshot sweep at 320px and 390px"
```

Do NOT commit the PNGs unless the repo already tracks updated ones for the same screens — check `git status` on `.verify/` and match existing convention (committed PNGs exist there, so refreshed/new mobile PNGs may be added in the same commit).

---

## Self-review notes

- Spec coverage: 16px controls (T1), sticky footer (T2), sheet dvh+scroll (T3), overlay CSS var (T4), stacked pairs (T5), make-it-fit (T6), docs (T7), sweep + fix findings (T8). Command-palette cleanup was consciously dropped: its `text-base` override remains load-bearing for desktop (see T1 step 4).
- All mobile changes are `sm:`-gated except tab-bar height (mobile-only component, `md:hidden`) and the toast/FAB offsets (value-identical to before).
- Type consistency: no new APIs introduced; all edits are className strings. The CSS variable name `--tp-tab-bar-h` is spelled identically in T4 (declaration + 4 consumers + 3 tests) and T7 (docs).
