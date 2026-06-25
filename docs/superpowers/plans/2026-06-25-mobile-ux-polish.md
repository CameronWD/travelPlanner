# Mobile UX Polish (PWA-ready) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A presentational polish pass on top of the already-shipped structural mobile sweep — make the app correct and comfortable as an **installed iOS PWA** on iPhone (~390px) and clean up the remaining mobile rough edges. No feature/behavior/data/server-action changes (sole exception: the soft agenda default, which already ships — we only lock it with a test).

**Architecture:** Small, mostly-independent presentational tasks against Next.js 16 / React 19 / Tailwind v4. PWA enablement is metadata (`viewport`/`appleWebApp` exports) + `env(safe-area-inset-*)` CSS on the fixed chrome. The rest are CSS/markup touch-ups. jsdom has no layout engine, so layout is verified by structural class/value assertions + `npm run build` + a manual phone checklist (Task 8) + best-effort Playwright screenshots at 390px (see Verification).

**Tech Stack:** Next.js 16 App Router (Metadata + Viewport exports), React 19, Tailwind CSS v4 (arbitrary `env()` values), Radix UI, Vitest + Testing Library (jsdom), lucide-react.

**Branch:** `feat/mobile-ux-polish` (already created off `main`). Do NOT touch `main`, push, or deploy.

**What's already done (verify, don't rebuild):**
- **Bottom-sheet dialogs with scroll + pinned close** (`components/ui/dialog.tsx`: `max-h-[90dvh]` + inner `overflow-y-auto` + sticky header; `dialog.test.tsx` already asserts close-outside-scroll). → Task 7 just locks/extends it.
- **Agenda default on mobile** (`components/trip/calendar-views.tsx` `resolveView()` returns agenda for `<768px`, respecting a stored choice). → Task 6 just locks it with a test.
- Overflow menus, bottom tab bar, scrollable tabs, money input, tz badge, `cost-amounts` — all shipped in the prior sweep.

**Conventions every task must follow:**
- After each task: `npm test` and `npm run build` exit 0. Baseline is **1256 tests green** — do not regress.
- Presentational only — do not change server actions, data shapes, or behavior.
- House style: `cn()`, `cva` variants, lucide icons with `aria-hidden`, `aria-label`/`title` on icon-only buttons, Tailwind arbitrary values for `env()`.
- Commit at the end of each task with the message given.

---

### Task 1: PWA viewport + Apple web-app metadata

**Files:**
- Modify: `app/layout.tsx`
- Test: `app/layout.test.tsx` (create)

**Context:** `app/layout.tsx` exports `metadata` but no `viewport`. For a standalone iOS PWA, `env(safe-area-inset-*)` only becomes non-zero with `viewport-fit=cover`, and iOS needs `appleWebApp` metadata for a clean installed experience. In Next 16, `themeColor`/`viewportFit` live on a `Viewport` export; `appleWebApp` stays on `metadata`.

- [ ] **Step 1: Write the failing test**

Create `app/layout.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { viewport, metadata } from "./layout";

describe("root layout PWA metadata", () => {
  it("sets viewport-fit=cover so safe-area insets resolve in standalone", () => {
    expect(viewport.viewportFit).toBe("cover");
  });
  it("declares the app as an Apple web app", () => {
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: "Trip Planner" });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run app/layout.test.tsx`
Expected: FAIL — no `viewport` export / `metadata.appleWebApp` undefined.

- [ ] **Step 3: Add the `viewport` export and extend `metadata`**

In `app/layout.tsx`, change the import and add the exports:

```tsx
import type { Metadata, Viewport } from "next";
```

```tsx
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF6EF" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1411" },
  ],
};

export const metadata: Metadata = {
  title: "Trip Planner",
  description: "Plan and run a holiday together.",
  appleWebApp: {
    capable: true,
    title: "Trip Planner",
    statusBarStyle: "default",
  },
};
```

> `statusBarStyle: "default"` keeps the iOS status bar legible on the cream background (avoid `black-translucent`, which would put white glyphs on a light bg). `viewport-fit=cover` is what activates the `env(safe-area-inset-*)` values used in Task 2.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run app/layout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify build + commit**

Run: `npx tsc --noEmit && npm run build`
Expected: both exit 0.

```bash
git add app/layout.tsx app/layout.test.tsx
git commit -m "feat(pwa): viewport-fit=cover + appleWebApp metadata for standalone iOS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Safe-area insets on the fixed chrome

**Files:**
- Modify: `components/trip/mobile-tab-bar.tsx` (the `<nav>`, line 43–46)
- Modify: `app/(app)/layout.tsx` (the sticky `<header>`, line 50–51)
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (content clearance, line 125)
- Test: `components/trip/mobile-tab-bar.test.tsx` (create)

**Context:** With Task 1's `viewport-fit=cover`, `env(safe-area-inset-bottom)` is the home-indicator height and `env(safe-area-inset-top)` the notch height in standalone. Currently the **fixed bottom tab bar** sits under the home indicator, the **sticky header** can sit under the notch, and the content's `pb-20` clearance doesn't account for the taller bar. Orientation is portrait-locked (manifest), so left/right insets are ~0 — skip them. `env()` is `0` in a normal browser, so these changes are inert outside standalone.

- [ ] **Step 1: Write the failing test**

Create `components/trip/mobile-tab-bar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MobileTabBar } from "./mobile-tab-bar";

vi.mock("next/navigation", () => ({ usePathname: () => "/trips/t1" }));

describe("MobileTabBar", () => {
  it("pads its bottom by the safe-area inset so it clears the home indicator", () => {
    const { container } = render(<MobileTabBar tripId="t1" />);
    const nav = container.querySelector("nav");
    expect(nav?.className).toContain("env(safe-area-inset-bottom)");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/trip/mobile-tab-bar.test.tsx`
Expected: FAIL — no safe-area class on the nav.

- [ ] **Step 3: Pad the bottom tab bar**

In `components/trip/mobile-tab-bar.tsx`, change the `<nav>` className (line 44) from:

```tsx
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 backdrop-blur md:hidden"
```
to:
```tsx
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
```

(The bar's background now extends to the screen edge while the tab content lifts above the home indicator.)

- [ ] **Step 4: Pad the sticky header for the notch**

In `app/(app)/layout.tsx`, the sticky `<header>` (line 50). Add a top safe-area inset so the bar's content clears the notch while its background fills behind it. Change:

```tsx
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
```
to:
```tsx
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/60">
```

- [ ] **Step 5: Grow the content bottom-clearance to match the taller bar**

In `app/(app)/trips/[tripId]/layout.tsx` (line 125), the content wrapper clears the fixed tab bar with `pb-20`. Add the inset so content isn't hidden behind the now-taller bar. Change:

```tsx
      <div className="py-6 pb-20 md:pb-6">{children}</div>
```
to:
```tsx
      <div className="py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">{children}</div>
```

- [ ] **Step 6: Run test + build**

Run: `npx vitest run components/trip/mobile-tab-bar.test.tsx && npx tsc --noEmit && npm run build`
Expected: PASS + build exit 0.

- [ ] **Step 7: Commit**

```bash
git add components/trip/mobile-tab-bar.tsx "app/(app)/layout.tsx" "app/(app)/trips/[tripId]/layout.tsx" components/trip/mobile-tab-bar.test.tsx
git commit -m "feat(pwa): respect iOS safe-area insets on the fixed header and tab bar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Bump the overflow-menu touch target to 44px

**Files:**
- Modify: `components/trip/card-actions.tsx` (line 38)
- Test: `components/trip/card-actions.test.tsx` (exists — extend)

**Context:** The `⋯` overflow trigger is `size-9` (36px), below the 44px touch-target guideline. The `Button` `size="icon"` variant's own default is already 44px (`size-11`); the `size-9` override shrinks it. Restore 44px.

- [ ] **Step 1: Extend the test**

Add to `components/trip/card-actions.test.tsx`:

```tsx
it("renders a 44px-minimum touch target for the overflow trigger", () => {
  render(<MoreActionsMenu label="More" items={[{ key: "a", label: "A", onSelect: () => {} }]} />);
  const trigger = screen.getByRole("button", { name: "More" });
  expect(trigger.className).toContain("size-11");
});
```

(Add `import { render, screen } from "@testing-library/react";` if not already imported at the top.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/trip/card-actions.test.tsx -t "44px"`
Expected: FAIL — trigger has `size-9`.

- [ ] **Step 3: Bump the trigger**

In `components/trip/card-actions.tsx` line 38, change `className="size-9"` → `className="size-11"`:

```tsx
        <Button variant="ghost" size="icon" className="size-11" aria-label={label}>
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run components/trip/card-actions.test.tsx`
Expected: PASS.

- [ ] **Step 5: Bounded audit for other sub-target icon controls**

Run: `grep -rn 'size="icon"' components | grep -E 'size-(7|8)\b'`
For any **mobile-reachable** icon-only control that comes back at `size-7`/`size-8` (28–32px), note it in the task report. Do NOT bulk-resize every icon button (desktop density matters and the prior sweep deliberately chose `size-9` for inline card buttons) — only flag genuine sub-32px interactive targets for a follow-up; the two clear offenders (overflow menu here, day-nav in Task 4) are the scope.

- [ ] **Step 6: Verify + commit**

Run: `npm test && npm run build`
Expected: both exit 0.

```bash
git add components/trip/card-actions.tsx components/trip/card-actions.test.tsx
git commit -m "fix(mobile): 44px touch target for the card overflow menu

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Day-nav — 44px tap targets, no crunch at 390px

**Files:**
- Modify: `components/trip/day-nav.tsx`
- Test: `components/trip/day-nav.test.tsx` (create)

**Context:** On mobile the "Previous"/"Next" labels are hidden (`hidden sm:inline`), so the prev/next tap target collapses to a bare `size-4` (16px) chevron. Give the prev/next controls a 44px minimum hit area and keep the three-section row from crunching by letting the center shrink and the chevrons stay fixed. Both the `<Link>` (active) and the `<span>` (boundary, disabled-looking) branches need the sizing so the row stays balanced.

- [ ] **Step 1: Write the failing test**

Create `components/trip/day-nav.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayNav } from "./day-nav";

describe("DayNav", () => {
  it("gives the previous-day control a 44px-minimum tap target", () => {
    render(<DayNav tripId="t1" currentDate="2026-07-03" startDate="2026-07-01" endDate="2026-07-10" />);
    const prev = screen.getByRole("link", { name: /go to 2026-07-02/i });
    expect(prev.className).toMatch(/min-h-11/);
    expect(prev.className).toMatch(/min-w-11/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/trip/day-nav.test.tsx`
Expected: FAIL — prev link has no `min-h-11`/`min-w-11`.

- [ ] **Step 3: Add 44px hit areas + shrink-proofing**

In `components/trip/day-nav.tsx`, add `min-h-11 min-w-11 shrink-0 justify-center` to the prev/next control className on **all four** branches (the two `<Link>`s and the two boundary `<span>`s). For example the active prev `<Link>` (lines 44–48) becomes:

```tsx
          className={cn(
            "flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded",
          )}
```

Apply the same `min-h-11 min-w-11 shrink-0 justify-center` additions to the disabled prev `<span>` (line 55), the active next `<Link>` (line 82), and the disabled next `<span>` (line 92). Then let the center column take the remaining space and shrink: change the center `<div>` (line 62) from `className="flex flex-col items-center gap-0.5"` to `className="flex min-w-0 flex-1 flex-col items-center gap-0.5"`.

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run components/trip/day-nav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify + commit**

Run: `npm test && npm run build`
Expected: both exit 0.

```bash
git add components/trip/day-nav.tsx components/trip/day-nav.test.tsx
git commit -m "fix(mobile): day-nav 44px tap targets and no crunch on narrow screens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Budget rows — no horizontal overflow at 390px

**Files:**
- Modify: `components/trip/cost-amounts.tsx`
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` (the by-destination / ungrouped / between-legs / other / day rows — lines ~364–460)
- Test: `components/trip/cost-amounts.test.tsx` (exists — extend)

**Context:** Budget rows are `flex items-center justify-between gap-2` with a label `<span>` on the left and `<CostAmounts>` (two `min-w-[5rem]` columns + `gap-4` ≈ 160px+) on the right. The label spans have no `min-w-0`/`truncate`, so a long stop name plus the fixed-width amounts can overflow a ~358px row. Fix: make `CostAmounts` not shrink, and let the label truncate.

- [ ] **Step 1: Extend the CostAmounts test**

Add to `components/trip/cost-amounts.test.tsx`:

```tsx
it("does not shrink, so the adjacent label truncates instead of overflowing", () => {
  const { container } = render(<CostAmounts estimatedMinor={1000} actualMinor={0} currency="AUD" />);
  expect(container.firstElementChild?.className).toContain("shrink-0");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/trip/cost-amounts.test.tsx -t "shrink"`
Expected: FAIL — root has no `shrink-0`.

- [ ] **Step 3: Make CostAmounts shrink-0**

In `components/trip/cost-amounts.tsx`, add `shrink-0` to the root `div` className (line 21–24):

```tsx
      className={
        "flex shrink-0 items-center gap-4 tabular-nums text-sm text-right" +
        (className ? ` ${className}` : "")
      }
```

- [ ] **Step 4: Truncate the row labels in the budget page**

In `app/(app)/trips/[tripId]/budget/page.tsx`, for each row that places a label span next to `<CostAmounts>`, add `min-w-0 truncate` to the label span so a long name truncates instead of pushing the amounts off-screen. The rows (and their label spans):
- by-destination (line ~366): `<span className="text-sm font-medium">{stop.stopName}</span>` → `<span className="min-w-0 truncate text-sm font-medium">{stop.stopName}</span>`
- "Ungrouped" (line ~404), "Between legs" (line ~416), "Other costs" (line ~428): add `min-w-0 truncate` to each `<span className="text-sm text-muted-foreground">…</span>`.
- by-category (line ~328): `<span className="font-medium">{cat.category}</span>` → add `min-w-0 truncate` (its parent row is line ~327 `flex items-center justify-between text-sm` — also add `gap-2` if absent so the truncated label and amounts don't touch).
- day-by-day (line ~455): the date label is short/`font-mono` — leave it (no overflow risk).

> Read each row's exact markup before editing; only add `min-w-0 truncate` to the label span (and ensure its flex row has `min-w-0` available — the rows already use `justify-between gap-2`). Do not change any amounts/`CostAmounts` props.

- [ ] **Step 5: Verify + commit**

Run: `npx vitest run components/trip/cost-amounts.test.tsx && npm run build`
Expected: PASS + build exit 0.

```bash
git add components/trip/cost-amounts.tsx "app/(app)/trips/[tripId]/budget/page.tsx" components/trip/cost-amounts.test.tsx
git commit -m "fix(mobile): keep budget rows from overflowing — labels truncate, amounts hold

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Lock the mobile agenda default + light month-grid density

**Files:**
- Modify: `components/trip/calendar-views.tsx` (no logic change — see step 1)
- Test: `components/trip/calendar-views.test.tsx` (create or extend — first `ls`)
- Modify (light): `components/trip/month-grid.tsx`

**Context:** `resolveView()` already returns `"agenda"` for `<768px` and `"month"` for `≥768px`, respecting a stored choice. This is the correct behavior — we add a **regression test** so it can't silently break, then a light legibility touch on the month grid (which is only shown if a phone user explicitly switches to month).

- [ ] **Step 1: Add a regression test for `resolveView`**

`resolveView` is module-private. The cleanest lock is a test of the exported `CalendarViews` default or, if `resolveView` isn't exported, export it for testing (a pure helper). Prefer the minimal change: in `calendar-views.tsx`, add `export` to `function resolveView()` (it's a pure function — exporting it is harmless). Then create/extend `components/trip/calendar-views.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveView } from "./calendar-views";

function mockViewport(minWidthMatches: boolean, stored: string | null) {
  vi.stubGlobal("localStorage", { getItem: () => stored } as unknown as Storage);
  vi.stubGlobal("matchMedia", ((q: string) => ({ matches: minWidthMatches })) as unknown as typeof matchMedia);
}
afterEach(() => vi.unstubAllGlobals());

describe("resolveView", () => {
  it("defaults to agenda on a mobile-width viewport", () => {
    mockViewport(false, null);
    expect(resolveView()).toBe("agenda");
  });
  it("defaults to month on a desktop-width viewport", () => {
    mockViewport(true, null);
    expect(resolveView()).toBe("month");
  });
  it("respects a stored explicit choice over the viewport default", () => {
    mockViewport(false, "month");
    expect(resolveView()).toBe("month");
  });
});
```

> Read `resolveView`'s exact body first (lines 40–47) to match how it reads `localStorage` and `matchMedia`, and adjust the stubs to its real calls (it reads a specific localStorage key — use that key's value in the stub).

- [ ] **Step 2: Run it (fail → export → pass)**

Run: `npx vitest run components/trip/calendar-views.test.tsx`
Expected: FAIL (no export) → add `export` to `resolveView` → PASS.

- [ ] **Step 3: Light month-grid legibility touch**

In `components/trip/month-grid.tsx`, make the in-cell day a comfortable tap/scan target at 390px without restructuring: bump the cell min-height from `min-h-20` (line ~154) to `min-h-24`, and ensure the "+N more" line (line ~147) and item pills remain `truncate` (already are). Keep `grid-cols-7`. This is a minimal density tweak — do not redesign the grid.

> If, on inspection, `min-h-20` already reads fine, leave it and note "no change needed" — this step is light by design.

- [ ] **Step 4: Verify + commit**

Run: `npm test && npm run build`
Expected: both exit 0.

```bash
git add components/trip/calendar-views.tsx components/trip/calendar-views.test.tsx components/trip/month-grid.tsx
git commit -m "test(calendar): lock mobile agenda default; light month-grid density

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Long-name truncation sweep

**Files:**
- Modify (as needed): `components/trip/timeline.tsx`, `components/trip/transport-card.tsx`
- Test: structural assertion in the nearest existing test for whichever component is changed

**Context:** `stop-card.tsx` and `accommodation-card.tsx` already `truncate` their names. Sweep the other primary content surfaces — the timeline item rows and transport cards — so a long place/title truncates within its flex row (with a `title` attribute for the full text) rather than forcing horizontal overflow at 390px.

- [ ] **Step 1: Audit the two files**

Read `components/trip/timeline.tsx` and `components/trip/transport-card.tsx`. For each text element that renders a user-supplied name/title/place inside a horizontal flex row, confirm it (and its flex parent) can shrink: the text element needs `truncate` (or `line-clamp-2`) and its flex container needs `min-w-0`. Note which need fixing.

- [ ] **Step 2: Apply truncation where missing**

For each row that can overflow, add `min-w-0` to the flex container and `truncate` to the text span, plus a `title={fullText}` so the full value is available on hover/long-press. (Match the pattern already used in `stop-card.tsx:160` — `truncate` on the `<h3>`, `min-w-0` on its container.) If a file already truncates everywhere, leave it and note "no change needed."

- [ ] **Step 3: Add a structural assertion**

In the existing test for whichever component you changed (e.g. `components/trip/timeline.test.tsx`), render a row with a very long title and assert the title element's className contains `truncate`. If a component needed no change, skip its assertion.

Run: `npx vitest run components/trip/timeline.test.tsx` (and/or the transport test if changed)
Expected: PASS.

- [ ] **Step 4: Verify + commit**

Run: `npm test && npm run build`
Expected: both exit 0.

```bash
git add components/trip/timeline.tsx components/trip/transport-card.tsx components/trip/timeline.test.tsx
git commit -m "fix(mobile): truncate long names in timeline/transport rows instead of overflowing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(Adjust `git add` to only the files actually changed.)

---

### Task 8: Verify dialog scroll + deliver the manual mobile checklist

**Files:**
- Verify: `components/ui/dialog.test.tsx` (exists)
- Create: `docs/mobile-pwa-checklist.md`

**Context:** Item #4 (tall form dialogs scroll cleanly in the mobile bottom sheet) is already implemented and partly tested. Confirm coverage, add one assertion if missing, and produce the manual phone checklist that is the real acceptance proof for the layout/PWA work (jsdom can't judge it).

- [ ] **Step 1: Confirm dialog scroll coverage**

Read `components/ui/dialog.test.tsx`. Confirm it asserts (a) the close button is outside the `overflow-y-auto` body and (b) the mobile `rounded-t-2xl` / desktop `sm:rounded-2xl` classes. If there is NO assertion that the content frame is height-capped, add one:

```tsx
it("caps the sheet height so a tall form scrolls within it", () => {
  render(
    <Dialog open>
      <DialogContent><DialogTitle>X</DialogTitle></DialogContent>
    </Dialog>,
  );
  const content = screen.getByRole("dialog");
  expect(content.className).toContain("max-h-[90dvh]");
});
```

(Match the file's existing render/import style; reuse its helpers.)

Run: `npx vitest run components/ui/dialog.test.tsx`
Expected: PASS.

- [ ] **Step 2: Write the manual mobile checklist**

Create `docs/mobile-pwa-checklist.md` with a concrete, tickable checklist to run on an installed iPhone PWA at ~390px:

```markdown
# Mobile / PWA manual checklist

Run on an installed iPhone PWA (Add to Home Screen), portrait, ~390px.

## Safe area (standalone)
- [ ] Bottom tab bar sits **above** the home indicator (not under it); bar background still reaches the screen edge.
- [ ] Header content clears the notch / Dynamic Island; header background fills behind it.
- [ ] Page content above the tab bar is fully scrollable to the last item (nothing hidden behind the bar).

## Touch targets
- [ ] The `⋯` card overflow button is comfortably tappable (~44px).
- [ ] Day view: Previous / Next day controls are easy to hit (not a tiny chevron).

## Layout at 390px
- [ ] Calendar opens in **Agenda** by default; switching to Month works and the grid is legible.
- [ ] Budget rows: long destination names truncate; estimated/spent amounts stay on-screen (no horizontal scroll).
- [ ] A long stop/item/transport name truncates with an ellipsis rather than overflowing.
- [ ] Opening a big form (add stop / item / transport / cost): the sheet scrolls, the title stays pinned, the ✕ and the submit button are both reachable.

## General
- [ ] No element causes horizontal page scroll.
- [ ] Both light and dark mode look correct.
```

- [ ] **Step 3: Commit**

```bash
git add components/ui/dialog.test.tsx docs/mobile-pwa-checklist.md
git commit -m "test(ui): lock dialog sheet height; add manual mobile/PWA checklist

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verification (method C)

- Every task ends with `npm test` + `npm run build` green (baseline 1256 tests).
- **Playwright (best-effort):** after the tasks, attempt a one-off Playwright run against `next dev` (log in via the dev path) to capture before/after screenshots at **390px** for: calendar (agenda default + month), a big form dialog, the budget breakdown, and the day view. If Playwright won't install/run cleanly in the sandbox, **fall back** to the manual checklist (Task 8) — do not sink the session into browser tooling. **Note:** `env(safe-area-inset-*)` is `0` outside an installed standalone PWA, so Playwright **cannot** verify the safe-area work (Tasks 1–2) — that is confirmed only by the manual checklist on the installed app.

## Self-Review

- **Spec coverage:** #1 PWA standalone + safe-area → Tasks 1 (metadata) + 2 (insets). #2 touch targets → Task 3 (overflow menu) + Task 4 (day-nav). #3 agenda default + density → Task 6 (already-shipped default locked by test + light density). #4 form dialog scroll → already done; Task 8 verifies + locks. #5 budget overflow → Task 5. #6 day-nav crunch → Task 4 (merged with its touch-target fix). #7 truncation → Task 7. Manual checklist → Task 8.
- **Already-done items handled honestly:** agenda default (Task 6) and dialog scroll (Task 8) are verify/lock tasks, not rebuilds — flagged in the header.
- **Placeholder scan:** substantive tasks (1–5) carry exact before/after classes; the lighter tasks (6–8) are bounded "read-then-apply" with concrete acceptance and explicit "no change needed → say so" escape hatches, matching the repo's prior-plan convention.
- **No behavior change:** only presentational classes/metadata + `resolveView` gaining an `export` (no logic change). No server actions, data, or features touched.
- **Out of scope (confirmed):** print styles, breakpoint refactor, visual-regression infra, offline caching.
