# Mobile Hardening Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every screen of the TEEPEE trip-planner usable and correct on a phone down to **320px portrait** — nothing overflows, nothing bleeds outside its container, all content is legible, icons keep their own space, and touch targets are comfortable — without changing any feature, behaviour, data, or the desktop appearance.

**Architecture:** Presentational-only responsive hardening against an existing Next.js 16 / React 19 / Tailwind v4 app. One shared-primitive task fixes many screens at once (overlay widths); the rest are mostly-independent per-screen/per-feature tasks. Two tasks are structural (Compare view → stacked cards on mobile; calendar month grid containment). jsdom has no layout engine, so responsive/visual behaviour cannot be unit-tested — meaningful structural changes get class-level assertions, everything is guarded by `npm run test` + `npm run build`, and true visual sign-off is a manual phone checklist (Task 11).

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4 (class-based dark mode, HSL tokens in `app/globals.css`, `viewport-fit: cover` already set in `app/layout.tsx`), Radix UI primitives, lucide-react icons, Vitest + Testing Library (jsdom). Utilities: `cn()` for classes, `cva` variants, `forwardRef` primitives.

## Global Constraints

These apply to **every** task — each task's requirements implicitly include this section.

- **Target: 320px portrait is the strict bar.** Nothing may overflow, bleed its container, or force horizontal *page* scroll at 320px. If it's clean at 320 it's clean on every wider phone.
- **Installed-PWA + safe areas.** `viewport-fit: cover` is set; the header (`pt-[env(safe-area-inset-top)]`), mobile tab bar (`pb-[env(safe-area-inset-bottom)]`), toasts, and trip layout bottom padding already reference safe-area insets — preserve them; do not remove or regress them.
- **Desktop must stay visually identical.** Every mobile change is gated so `sm:`/`md:`+ renders exactly as today. Prefer `mobile-default → sm:restore` (e.g. `w-20 sm:w-24`, `gap-2 sm:gap-4`, `text-xs sm:text-[10px]`).
- **Presentational only.** Do NOT change server actions, data shapes, props, or behaviour. Class/markup-wrapper changes only (plus the one Compare mobile-render branch, which renders the same data).
- **Legibility floor:** any text that conveys **content** (labels, values, names, section headers) must be **≥ `text-xs` (12px)** on mobile. Purely decorative micro-badges (e.g. a count pip) may stay smaller *only* where explicitly noted, and must remain contained.
- **Icon hygiene:** inline (non-`Button`) lucide icons in flex rows carry `shrink-0`; icon+text keeps a gap and the text truncates while the icon holds; adornment badges pinned onto icons stay inside their container's bounds at 320px.
- **No horizontal-scroll cover-ups.** Fix overflow at the root (`min-w-0` on flex children, `truncate`/`break-words` on long text, contained `overflow-x-auto` for genuinely wide content). Do NOT slap `overflow-x-hidden` on the page to mask a bug.
- **House style:** `cn()` for conditional classes, `cva` where variants exist, lucide icons `aria-hidden`, `aria-label`/`title` on icon-only buttons.
- **After every task:** `npm run test` and `npm run build` must both exit 0 with no regressions. Commit at the end of each task with the given message (append the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer).
- **Branch:** work stays on `feat/mobile-hardening-sweep`. Do NOT touch `main`, switch branches, push, or deploy.

---

### Task 1: Overlays never exceed the viewport (shared primitives)

**Files:**
- Modify: `components/ui/dropdown-menu.tsx` (the shared `menuContentClasses`, line 15–18)
- Modify: `components/ui/popover.tsx` (`PopoverContent` className, line 22)
- Modify: `components/trip/notification-bell.tsx` (`DropdownMenuContent` `w-80`, line 78; count badge, line 70)
- Modify: `components/trip/note-thread.tsx` (`PopoverContent` `w-80`, line 259)
- Modify: `app/(app)/layout.tsx` (user-menu `DropdownMenuContent`, line ~117 — currently `min-w-52`)
- Test: `components/ui/dropdown-menu.test.tsx` and `components/ui/popover.test.tsx` (create if absent)

**Interfaces:**
- Produces: no API change. `DropdownMenuContent` / `PopoverContent` gain a viewport width cap that every consumer inherits.

> **Why:** Radix content is portalled and positioned, but a fixed `w-80` (=320px) is the *entire* width of a 320px screen — with `align="end"` it lands flush against the edge, and safe-area insets on notched devices make it worse. Capping the shared content classes to `max-w-[calc(100vw-1rem)]` fixes every dropdown/popover at once; the two `w-80` call-sites additionally become mobile-responsive.

- [ ] **Step 1: Cap the shared dropdown content width**

In `components/ui/dropdown-menu.tsx`, change `menuContentClasses` (line 15–18) from:
```tsx
const menuContentClasses = cn(
  "z-50 min-w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-soft-lg",
  "data-[state=open]:tp-pop-in data-[state=closed]:tp-pop-out",
);
```
to (adds a viewport cap so no menu can exceed the screen):
```tsx
const menuContentClasses = cn(
  "z-50 min-w-44 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-soft-lg",
  "data-[state=open]:tp-pop-in data-[state=closed]:tp-pop-out",
);
```

- [ ] **Step 2: Cap the shared popover content width**

In `components/ui/popover.tsx` line 22, change:
```tsx
"z-50 w-72 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-soft-lg outline-none",
```
to:
```tsx
"z-50 w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-soft-lg outline-none",
```

- [ ] **Step 3: Make the two `w-80` call-sites responsive**

- `components/trip/notification-bell.tsx:78` — `<DropdownMenuContent align="end" className="w-80">` → `className="w-[calc(100vw-1rem)] sm:w-80"`.
- `components/trip/note-thread.tsx:259` — `className="w-80"` → `className="w-[calc(100vw-1rem)] sm:w-80"`.

- [ ] **Step 4: Make the user-menu content responsive**

In `app/(app)/layout.tsx` (~line 117), the user-menu `DropdownMenuContent` currently forces `min-w-52` (208px). Change its `min-w-52` to `min-w-0 sm:min-w-52` (the Step-1 `max-w` cap now also protects it). Keep `align="end"` and all other classes/props unchanged.

- [ ] **Step 5: Bump the notification count badge to a legible size**

In `components/trip/notification-bell.tsx:70`, the count badge (shows real content like `9+`) is `text-[10px]`. Change `text-[10px]` → `text-[11px]` and keep everything else (this is a pinned micro-badge; `text-[11px]` stays inside the `min-w-[1rem]` circle while lifting legibility). Leave the `absolute -right-0.5 -top-0.5` position — the badge stays within the `size-8` button's bounds and the header has room.

- [ ] **Step 6: Add structural assertions**

In `components/ui/dropdown-menu.test.tsx` (create if absent), render an open `DropdownMenu`/`DropdownMenuContent` and assert the content element's class list includes `max-w-[calc(100vw-1rem)]`. In `components/ui/popover.test.tsx` (create if absent), render an open `Popover`/`PopoverContent` and assert its class list includes `max-w-[calc(100vw-1rem)]`.

```tsx
// dropdown-menu.test.tsx — pattern
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./dropdown-menu";

describe("DropdownMenuContent", () => {
  it("caps its width to the viewport", () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const item = screen.getByText("Item");
    const content = item.closest('[class*="max-w-[calc(100vw-1rem)]"]');
    expect(content).not.toBeNull();
  });
});
```

Run: `npx vitest run components/ui/dropdown-menu.test.tsx components/ui/popover.test.tsx`
Expected: PASS.

- [ ] **Step 7: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add components/ui/dropdown-menu.tsx components/ui/popover.tsx components/ui/dropdown-menu.test.tsx components/ui/popover.test.tsx components/trip/notification-bell.tsx components/trip/note-thread.tsx "app/(app)/layout.tsx"
git commit -m "fix(ui): cap dropdown/popover overlays to the viewport width on mobile"
```

---

### Task 2: App shell — header, tab bar, trip title, cards

**Files:**
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (trip title `h1`, line ~95)
- Modify: `components/trip/mobile-tab-bar.tsx` (verify/tighten 5-item fit + safe area)
- Modify: `components/trip/trip-nav.tsx` (verify contained horizontal scroll)
- Verify only (fix if a 320px hazard is found): `app/(app)/layout.tsx` header, `components/trip/trip-card.tsx`, `app/(app)/trips/page.tsx`, `app/(app)/trips/new/`, `app/(app)/trips/[tripId]/page.tsx` (overview + cover), `components/trip/plan-overview.tsx`
- Test: `app/(app)/trips/[tripId]/layout.test.tsx` if it exists (extend), else add a focused structural test only if the layout renders in isolation cleanly; otherwise rely on build + suite.

> **Why:** The trip title is `text-3xl` with no truncation — a long trip name wraps to 2–3 lines and bloats the header on a phone. The tab bar and trip nav are the always-present chrome and must be confirmed safe at 320px with safe-area insets. The sweep found the itinerary cards, trip cards, trips list, and overview already hardened (min-w-0 / truncate / responsive grids present) — those are verify-only.

- [ ] **Step 1: Clamp the trip title**

In `app/(app)/trips/[tripId]/layout.tsx` (~line 95), the trip `h1` is `text-3xl` (plus existing classes) with no clamp. Add `break-words` and cap the mobile font: change the size class to `text-2xl sm:text-3xl` and append `break-words` so a long name shrinks and wraps cleanly instead of overflowing. Keep every other class. (Do NOT `truncate` a page-title h1 — clamping the size + `break-words` preserves the full accessible name while containing height.)

- [ ] **Step 2: Confirm the mobile tab bar fits 5 items at 320px**

Read `components/trip/mobile-tab-bar.tsx`. Each of the 5 items is `flex flex-1` (~64px at 320px) with an icon + `text-xs` label. Ensure: (a) each label is a single line — add `truncate` to the label span if not present; (b) the icon carries `shrink-0`; (c) the existing `pb-[env(safe-area-inset-bottom)]` stays. If labels already truncate and the icon is `shrink-0`, make no change and note it in the task summary.

- [ ] **Step 3: Confirm trip-nav scrolls within its own bar**

`components/trip/trip-nav.tsx:65` is `flex overflow-x-auto scrollbar-none gap-0` — already a contained horizontal scroller. Confirm each nav link has `shrink-0` (so links don't compress into each other) and `whitespace-nowrap`; add `shrink-0` to the link class if missing. No page-level overflow may result.

- [ ] **Step 4: Safe-area + bottom-padding audit**

Confirm every scrollable page that sits beneath the fixed mobile tab bar has bottom padding clearing it. The trip layout already has `pb-[calc(5rem+env(safe-area-inset-bottom))]` (`app/(app)/trips/[tripId]/layout.tsx:151`). Check the app-shell layout (`app/(app)/layout.tsx`) and the trips-list page: if the tab bar renders there too and content can hide behind it, add the same bottom padding; if the tab bar is trip-scoped only, note it and make no change.

- [ ] **Step 5: 320px verify-pass on the light screens**

Read each verify-only file and confirm at 320px: flex rows with a text child have `min-w-0`; long names `truncate`; the overview cover image is `w-full`/contained (it is — `page.tsx:36` uses `w-full overflow-hidden`); trip-card absolutely-positioned badges (`left-3/right-3 top-3`) stay inside the card. Fix any concrete overflow found using the mobile-default→`sm:` pattern; otherwise leave unchanged and list what you verified.

- [ ] **Step 6: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add "app/(app)/trips/[tripId]/layout.tsx" components/trip/mobile-tab-bar.tsx components/trip/trip-nav.tsx
# add any other file you actually changed in Step 4/5
git commit -m "fix(ui): clamp trip title and harden app shell chrome at 320px"
```

---

### Task 3: Day view + shared Timeline

**Files:**
- Modify: `components/trip/timeline.tsx` (TimeGutter width line ~162; row `min-w-0`; title truncation lines ~291, ~232; sub-12px labels lines ~104, ~232, ~238, ~257, ~295)
- Modify: `components/trip/day-nav.tsx` (gap, line 39)
- Test: `components/trip/timeline.test.tsx` if present (extend with a structural assertion); else rely on build + suite.

> **Why:** The timeline is shared by Day and Today views. Its time gutter is a fixed `w-11` (44px = ~14% of a 320px row), several rows lack `min-w-0` so long titles/labels overflow, and multiple semantic labels render at `text-[11px]`. Day nav uses `gap-4`, which with two 44px controls eats most of the row.

- [ ] **Step 1: Shrink the time gutter on mobile**

In `components/trip/timeline.tsx`, the `TimeGutter` span (line ~162) is `w-11 shrink-0 ...`. Change `w-11` → `w-9 sm:w-11` (36px on mobile, restored to 44px on desktop). Keep `shrink-0` and all other classes.

- [ ] **Step 2: Add `min-w-0` to timeline rows and truncate titles**

For each timeline row container that holds the gutter + content (lines ~200, ~281, ~326 — `flex items-start gap-2`), ensure the **content** child (the `flex-1` div) has `min-w-0`; add it where missing. On the timed-item title span (~line 291) and any item-name span, add `truncate` (single-line names) or `break-words` (multi-word descriptions) so long text cannot push the row wider than its container.

- [ ] **Step 3: Lift sub-12px semantic labels to 12px on mobile**

In `components/trip/timeline.tsx`, the section label "Anytime" (~line 104) and the time/reference spans (~lines 232, 238, 257, 295) use `text-[11px]`. For each that carries **content** (section headings, times, reference codes, the amber warning at ~257), change `text-[11px]` → `text-xs sm:text-[11px]` so mobile is legible while desktop is unchanged. Leave any purely decorative divider text as-is.

- [ ] **Step 4: Tighten the day-nav gap**

In `components/trip/day-nav.tsx:39`, the wrapper is `flex items-center justify-between gap-4 ...`. Change `gap-4` → `gap-2 sm:gap-4`. Confirm the two nav controls keep `min-w-11 min-h-11` (≥44px touch target) and the centre block keeps `min-w-0 flex-1`.

- [ ] **Step 5: Structural assertion (if a timeline test exists)**

If `components/trip/timeline.test.tsx` exists, add an assertion that renders a timeline with a long item title and asserts the title span has `truncate` or `break-words` in its class list, and that the gutter class list includes `w-9`. If no test file exists, skip (jsdom can't measure layout) and rely on the suite + build + manual checklist.

- [ ] **Step 6: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add components/trip/timeline.tsx components/trip/day-nav.tsx
# + components/trip/timeline.test.tsx if changed
git commit -m "fix(ui): timeline min-w-0 + legibility and tighter day-nav at 320px"
```

---

### Task 4: Calendar — month grid, view header, agenda

**Files:**
- Modify: `components/trip/month-grid.tsx` (grid containment lines 64/123–141; icon `shrink-0` lines 94–119; legibility)
- Modify: `components/trip/calendar-views.tsx` (month-label `min-w-32`, line 161)
- Modify: `components/trip/agenda-view.tsx` (arrow line ~42; "Today" badge legibility line ~38)
- Test: `components/trip/month-grid.test.tsx` if present (extend); else rely on build + suite.

> **Why:** A `grid-cols-7` month splits 320px into ~40px cells — text crushes and badges wrap. Rather than break the month metaphor, keep 7 columns but let the grid **scroll horizontally inside its own rounded container** below `sm` with a legible minimum cell width (the calendar already offers an Agenda view for linear mobile reading). The view header's `min-w-32` month label is inflexible, and the agenda's always-on arrow + `text-[10px]` badge waste space / hurt legibility.

- [ ] **Step 1: Contain the month grid instead of crushing it**

Read `components/trip/month-grid.tsx`. The weekday header (line ~55/64) and the day cells container (line ~64) are both `grid grid-cols-7`. Wrap the month block so that below `sm` it scrolls horizontally within its own bordered/rounded container and each column keeps a legible minimum width, while `sm+` is unchanged. Concretely: put both the weekday-header grid and the day grid inside a single wrapper `<div className="overflow-x-auto sm:overflow-visible">`, and give each of the two grids `min-w-[560px] sm:min-w-0` so 7 columns stay ≥~80px on mobile and the container scrolls rather than the page. Keep all cell content markup unchanged.

- [ ] **Step 2: Make month-grid inline icons `shrink-0`**

In `components/trip/month-grid.tsx` (lines ~94–119, the accommodation/transport indicator icons rendered inline at `size-3`), add `shrink-0` to each icon's className so they never squish or push the cell content. (Add to the `cn(...)`/class string, e.g. `size-3 shrink-0`.)

- [ ] **Step 3: Lift crushed cell text**

The stop-name (`text-[13px]`, ~line 124) already uses `line-clamp-2` — keep it. The country line (`text-[11px]`, ~128, with `truncate`) and the "+N things" badge (`text-[10px]`, ~133/140) are decorative within the now-scrollable ≥80px cell — leave sizes as-is (they are contained and no longer crushed). No change needed here beyond Step 1; note this reasoning in the task summary.

- [ ] **Step 4: Make the month label flexible**

In `components/trip/calendar-views.tsx:161`, the month label is `min-w-32` (128px). Change `min-w-32` → `min-w-24 sm:min-w-32` and add `truncate` to the label if it isn't already, so long localized month/year strings never push the prev/next controls off-screen.

- [ ] **Step 5: Reclaim agenda header space + legibility**

In `components/trip/agenda-view.tsx`: the trailing arrow "→" (~line 42) — add `hidden sm:inline` so it doesn't consume width on mobile. The "Today" badge (~line 38) at `text-[10px]` conveys content — change `text-[10px]` → `text-xs sm:text-[10px]`.

- [ ] **Step 6: Structural assertion (if a month-grid test exists)**

If `components/trip/month-grid.test.tsx` exists, add an assertion that the day-grid element's class list includes `min-w-[560px]` and its wrapper includes `overflow-x-auto`. Else skip and rely on the suite + build.

- [ ] **Step 7: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add components/trip/month-grid.tsx components/trip/calendar-views.tsx components/trip/agenda-view.tsx
# + month-grid.test.tsx if changed
git commit -m "fix(ui): contain calendar month grid and tidy header/agenda at 320px"
```

---

### Task 5: Budget — money hero, amounts, cost rows, money input

**Files:**
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` (`text-4xl` money hero, lines ~310/321)
- Modify: `components/trip/cost-amounts.tsx` (`min-w-[5rem]` columns, lines 26/29/31)
- Modify: `components/trip/spend-so-far-card.tsx` (flex rows, lines 42/50/84)
- Modify: `components/trip/other-cost-editor.tsx` (label vs. category badge, lines 349–358)
- Modify: `components/ui/money-input.tsx` (currency picker `w-24`, line 112)
- Test: `components/trip/cost-amounts.test.tsx` (exists — extend); `components/ui/money-input.test.tsx` (exists — extend)

> **Why:** The budget summary renders amounts at `text-4xl` with no mobile cap; `CostAmounts` reserves two fixed `min-w-[5rem]` (80px) money columns that, with `gap-4`, leave a truncated sliver for the label at 320px; the currency picker is a fixed `w-24`.

- [ ] **Step 1: Make the money hero responsive**

In `app/(app)/trips/[tripId]/budget/page.tsx` (~lines 310 & 321), the large amounts are `text-4xl`. Change `text-4xl` → `text-2xl sm:text-4xl` on each, and add `break-words` (or `tabular-nums` is already fine) so a long amount like `$99,999.99` cannot overflow. Keep the AnimatedMoney component and all logic unchanged.

- [ ] **Step 2: Shrink the money columns on mobile**

In `components/trip/cost-amounts.tsx`, both amount spans use `min-w-[5rem]` (lines ~26 & ~31) with `gap-4` on the wrapper (line ~24). Change each `min-w-[5rem]` → `min-w-[4rem] sm:min-w-[5rem]`, and change the wrapper `gap-4` → `gap-2 sm:gap-4`. This frees ~48px for the adjacent label at 320px. Keep `tabular-nums`, `text-right`, and the emerald `Spent` colour exactly as-is.

- [ ] **Step 3: Extend the cost-amounts test**

In `components/trip/cost-amounts.test.tsx`, add an assertion that the estimated span's class list includes `min-w-[4rem]` (mobile) and `sm:min-w-[5rem]` (desktop restore).

Run: `npx vitest run components/trip/cost-amounts.test.tsx` — PASS.

- [ ] **Step 4: Let spend-so-far rows wrap**

In `components/trip/spend-so-far-card.tsx` (lines ~42, ~50, ~84), the `flex items-center justify-between gap-2` rows can collide label + amount when the label is long. Add `min-w-0` to the label side and ensure the label truncates; if a row genuinely needs it, add `flex-wrap`. Keep the amounts on the right. Do not change any computed values.

- [ ] **Step 5: Stack the other-cost label/badge on mobile**

In `components/trip/other-cost-editor.tsx` (~lines 349–358), the label (`truncate`) and category badge share a `flex items-center gap-2 flex-wrap` row. Ensure the label wrapper has `min-w-0` so it truncates before the badge squeezes it; the existing `flex-wrap` lets the badge drop to the next line at 320px — confirm that reads cleanly and keep it.

- [ ] **Step 6: Narrow the currency picker on mobile**

In `components/ui/money-input.tsx:112`, the currency `SelectTrigger` is `w-24 shrink-0`. Change `w-24` → `w-20 sm:w-24` (currency codes are ≤3 chars, so 80px is ample) so the amount field keeps more room at 320px. Keep `shrink-0` and the amount field's `min-w-0 flex-1`.

- [ ] **Step 7: Extend the money-input test**

In `components/ui/money-input.test.tsx`, add an assertion that the currency trigger class list includes `w-20` and `sm:w-24`.

Run: `npx vitest run components/ui/money-input.test.tsx` — PASS.

- [ ] **Step 8: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add "app/(app)/trips/[tripId]/budget/page.tsx" components/trip/cost-amounts.tsx components/trip/cost-amounts.test.tsx components/trip/spend-so-far-card.tsx components/trip/other-cost-editor.tsx components/ui/money-input.tsx components/ui/money-input.test.tsx
git commit -m "fix(ui): budget hero, money columns, and currency picker fit 320px"
```

---

### Task 6: Leaflet map popups fit narrow screens

**Files:**
- Modify: `components/trip/route-map.tsx` (popup HTML `min-width`, line ~185)
- Modify: `components/trip/day-map.tsx` (popup HTML `min-width` line ~137; popup flex wrapper ~118/129; ~line 282)
- Modify: `components/trip/wishlist-map.tsx` (popup HTML `min-width`, lines ~135–137)
- Test: none practical (popup HTML is a string built for Leaflet; jsdom doesn't render Leaflet). Guarded by build + manual checklist.

> **Why:** The map **containers** are already safe (`w-full overflow-hidden` + fixed pixel height). But the popup HTML strings hardcode `min-width:140px`/`160px` — up to half a 320px screen — so a popup with a long place name overflows or is clipped. The map components are otherwise correct.

- [ ] **Step 1: Constrain each popup's width**

In each of the three files, find the inline popup style string(s) that set `min-width:140px` / `min-width:160px`. Change each to a viewport-aware cap and add a max-width, e.g.:
- `min-width:140px` → `min-width:min(140px,80vw);max-width:min(240px,90vw)`
- `min-width:160px` → `min-width:min(160px,80vw);max-width:min(260px,90vw)`

Apply the same transform everywhere a popup `min-width` appears (route-map ~185, day-map ~137 and any second occurrence ~282, wishlist-map ~135–137). Keep the rest of the popup HTML/escaping untouched.

- [ ] **Step 2: Verify + commit**

Run: `npm run test && npm run build` — both exit 0. (Escaping/behaviour unchanged; only inline style strings edited.)
```bash
git add components/trip/route-map.tsx components/trip/day-map.tsx components/trip/wishlist-map.tsx
git commit -m "fix(ui): constrain Leaflet map popup widths on narrow screens"
```

---

### Task 7: Compare view stacks into cards on mobile

**Files:**
- Modify: `components/trip/compare-table.tsx` (add a mobile card render; add truncation)
- Modify: `components/trip/promote-fork-dialog.tsx` (loss-list truncation, line ~225)
- Test: `components/trip/compare-table.test.tsx` (create if absent) — assert the mobile card container and the desktop table both exist and are visibility-gated.

> **Why:** Compare is columns = plans (real + N forks), rows = 9 metrics, with `min-w-[120–200px]` cells. Its `overflow-x-auto` wrapper keeps the *page* from scrolling, but with 2–3 forks the table is 600px+ and awkward at 320px. Per the agreed spec we render the existing table on `sm+` and a **stacked card-per-fork** layout below `sm` (same data, same helpers). The `RouteCell` stop names, header plan names, countries line, and the promote dialog's loss-list all also need truncation.

- [ ] **Step 1: Truncate long strings in the existing table (used by both layouts)**

In `components/trip/compare-table.tsx`:
- `RouteCell` stop name (line ~140): wrap in `truncate` — change the span to `className="font-medium text-foreground truncate"` and give its parent row (`line ~139`, `flex items-baseline gap-1`) `min-w-0`.
- Countries line (line ~152): add `truncate` to the `<p>`.
- Header fork plan name (line ~357): change to `<span className="text-sm font-semibold text-foreground truncate">{plan.name}</span>` and ensure its parent `flex flex-col gap-2` allows shrink (add `min-w-0`).

- [ ] **Step 2: Gate the existing table to `sm+`**

Wrap the existing table's scroll container so it only shows on `sm` and up. Change the wrapper `<div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">` (line 333) to add `hidden sm:block` → `className="hidden sm:block overflow-x-auto rounded-2xl border border-border bg-card shadow-soft"`. Leave the `<table>` and all cells unchanged.

- [ ] **Step 3: Add the mobile stacked-card layout**

Immediately before the desktop table container (inside the returned fragment, before line 333), add a mobile-only block that renders one card for the real plan and one per fork, each listing the 9 metrics as stacked label/value rows, reusing `renderCell` and `renderDelta`:

```tsx
{/* Mobile: stacked cards (real plan + one card per fork). Desktop keeps the table. */}
<div className="flex flex-col gap-4 sm:hidden">
  {plans.map((plan, planIndex) => {
    const isReal = planIndex === 0;
    return (
      <div
        key={plan.forkId ?? "real"}
        className="rounded-2xl border border-border bg-card shadow-soft"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {plan.name}
          </span>
          {!isReal && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-xs"
              onClick={() => setPromoteOpenFor(plan.forkId)}
              aria-label={`Promote ${plan.name}`}
            >
              <GitMerge className="mr-1 size-3.5 shrink-0" aria-hidden="true" />
              Promote
            </Button>
          )}
        </div>
        <dl className="divide-y divide-border">
          {METRIC_ROWS.map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-3 px-4 py-2">
              <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {row.label}
              </dt>
              <dd className="flex min-w-0 flex-col items-end gap-1 text-right">
                {renderCell(plan, row.id)}
                {!isReal && renderDelta(plan, row.id)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  })}
</div>
```

(This reuses the existing `METRIC_ROWS`, `renderCell`, `renderDelta`, `setPromoteOpenFor`, `Button`, and `GitMerge` already in the file — no new data or props. `RouteCell`'s `min-w-[180px]` is fine inside the full-width card; if it still feels wide, it will simply be the card's content width since the card is full-width at 320px.)

- [ ] **Step 4: Truncate the promote-dialog loss list**

In `components/trip/promote-fork-dialog.tsx` (~line 225), the loss-list `item.label` can be long. Wrap it in `<span className="truncate">{item.label}</span>` and ensure its flex parent has `min-w-0` so the badge doesn't get squeezed.

- [ ] **Step 5: Structural assertion**

Create/extend `components/trip/compare-table.test.tsx`: render `CompareTable` with a real plan + one fork (minimal `ComparisonPlan` fixtures) and assert (a) an element with class `sm:hidden` exists (mobile cards) and (b) an element with class `hidden sm:block` exists (desktop table). Mock `PromoteForkDialog` if needed to keep the render light.

Run: `npx vitest run components/trip/compare-table.test.tsx` — PASS.

- [ ] **Step 6: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add components/trip/compare-table.tsx components/trip/compare-table.test.tsx components/trip/promote-fork-dialog.tsx
git commit -m "feat(ui): Compare view stacks into per-plan cards on mobile"
```

---

### Task 8: Wishlist + Chapters

**Files:**
- Modify: `components/trip/wishlist-board.tsx` (header, lines ~216–239)
- Modify: `components/trip/vote-control.tsx` (chip legibility line ~169; cluster wrap lines ~153–182)
- Modify: `components/trip/chapter-chip.tsx` (width/truncate, lines ~10–22)
- Modify: `components/trip/chapters-manager.tsx` (verify chip truncation in the row, line ~92)
- Verify only: `components/trip/item-card.tsx` (already has `truncate` + `max-w-[18ch]`)
- Test: `components/trip/vote-control.test.tsx` or `chapter-chip.test.tsx` if present (extend); else build + suite.

> **Why:** The wishlist header packs title + view toggle + "Add item" into one `justify-between` row that squeezes at 320px; vote chips use `text-[10px]` and can crowd; the chapter chip has no width constraint so a long chapter name overflows.

- [ ] **Step 1: Let the wishlist header stack on mobile**

In `components/trip/wishlist-board.tsx` (~lines 216–239), the header `flex items-center justify-between gap-3` crams the title and controls. Change it to stack below `sm`: `flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3`. Ensure the title has `min-w-0` + `truncate`. Keep the controls group intact.

- [ ] **Step 2: Vote chip legibility + cluster containment**

In `components/trip/vote-control.tsx`: the vote chip (line ~169) is `text-[10px]` and conveys a count — change `text-[10px]` → `text-xs sm:text-[10px]`. The other-votes cluster (`flex items-center gap-1.5`, ~line 153) — add `flex-wrap` so multiple voter avatars/chips wrap instead of overflowing at 320px. The `size-5` avatar should carry `shrink-0`.

- [ ] **Step 3: Constrain the chapter chip**

In `components/trip/chapter-chip.tsx` (~lines 10–22), the chip is an unconstrained `inline-flex`. Add `max-w-full` and `truncate` to the chip (and `min-w-0` if it wraps a flex child) so a long chapter name ellipsizes instead of overflowing its container. Keep the colour/shape classes.

- [ ] **Step 4: Confirm the chapter row truncates**

In `components/trip/chapters-manager.tsx` (~line 92), the row is `flex items-center justify-between` with the chip on the left and two 32px icon buttons on the right. Ensure the left side is `min-w-0` so the (now-`max-w-full truncate`) chip shrinks before the buttons; add `min-w-0` if missing and confirm the buttons keep `shrink-0`.

- [ ] **Step 5: Structural assertion (if a relevant test exists)**

If `components/trip/chapter-chip.test.tsx` exists, assert the chip class list includes `truncate` and `max-w-full`. Else skip; rely on suite + build.

- [ ] **Step 6: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add components/trip/wishlist-board.tsx components/trip/vote-control.tsx components/trip/chapter-chip.tsx components/trip/chapters-manager.tsx
# + any *.test.tsx changed
git commit -m "fix(ui): wishlist header stacks and chapter chips truncate at 320px"
```

---

### Task 9: Public share page + sign-in

**Files:**
- Modify: `app/share/[token]/page.tsx` (transport row ~333; accommodation row ~322; `text-[11px]` ~486; time gutter `w-10` ~461)
- Verify only (fix if a hazard found): `app/signin/page.tsx`, `app/signin/signin-buttons.tsx`
- Test: none practical (server-rendered page); build + manual checklist.

> **Why:** Shared links open on phones for people who never see the app chrome — first impressions matter. The share page's transport/accommodation rows are `flex items-center gap-2` with no wrap (long place names overflow), a label is `text-[11px]`, and the time gutter is a fixed `w-10`.

- [ ] **Step 1: Let transport/accommodation rows wrap or truncate**

In `app/share/[token]/page.tsx`: the accommodation row (~322) and transport row (~333), both `flex items-center gap-2`, need to not overflow when place names are long. Add `min-w-0` to the text container and `truncate` to the long name span; where two place names sit side by side (dep → arr), add `flex-wrap` so they can drop to a second line at 320px. Keep the icons `shrink-0`.

- [ ] **Step 2: Legibility + gutter**

- The `text-[11px]` label (~486, e.g. "Anytime") → `text-xs`.
- The `w-10` time gutter (~461) → `w-8 sm:w-10` to reclaim room for content at 320px.

- [ ] **Step 3: Sign-in verify pass**

Read `app/signin/page.tsx` and `signin-buttons.tsx`; confirm the card/buttons fit within 320px (buttons `w-full`, no fixed wide widths, headline wraps). Fix any concrete overflow; otherwise note it's clean.

- [ ] **Step 4: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add "app/share/[token]/page.tsx"
# + app/signin/* if changed
git commit -m "fix(ui): share page rows wrap/truncate and read legibly at 320px"
```

---

### Task 10: Discreet mode + Print — contain, don't restructure

**Files:**
- Modify (only if page-level overflow is found): `components/discreet/stop-spreadsheet.tsx` (line ~261 wrapper), `components/discreet/project-table.tsx` (line ~31 wrapper)
- Verify + minimal fix: `app/(app)/trips/[tripId]/print/` page
- Test: none practical; build + manual checklist.

> **Why:** Discreet mode **deliberately disguises** the planner as a work spreadsheet — the wide multi-column table *is the point*, so it must NOT be restructured into cards. Both discreet tables already wrap in `overflow-x-auto` (`stop-spreadsheet.tsx:261`, `project-table.tsx:31`), so they scroll inside their own box. This task only guarantees that containment holds (no horizontal *page* scroll) at 320px, and that the print page doesn't blow out the page width when previewed on a phone.

- [ ] **Step 1: Confirm discreet tables scroll inside their box, not the page**

Read both discreet components. Confirm the `overflow-x-auto` wrapper is a block-level container bounded by the page's padded content width (so the *table* scrolls, the *page* doesn't). If the wrapper can still push the page wide (e.g. a parent is `w-max` or a flex row without `min-w-0`), add `min-w-0`/`max-w-full` to the wrapper so overflow is contained. Do **not** change the table into cards, hide columns, or alter the spreadsheet look — the disguise depends on it. Note explicitly what you verified.

- [ ] **Step 2: Print page 320px containment**

Read the `/print` page. It's a paper/PDF layout — keep that design. Only ensure that when viewed at 320px it does not force horizontal *page* scroll: any fixed-width print container should be `max-w-full` on screen (e.g. `w-[Xpx] max-w-full` or a `print:` -scoped fixed width). Make the minimal change needed for on-screen containment without altering `@media print` output.

- [ ] **Step 3: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add # only the files you actually changed
git commit -m "fix(ui): keep discreet tables and print page contained at 320px"
```

(If Steps 1–2 find nothing to change, record that in the task summary and skip the commit — this task is allowed to be a no-op verification.)

---

### Task 11: Rewrite the manual mobile checklist + final full verify

**Files:**
- Modify: `docs/mobile-pwa-checklist.md`
- Test: full suite + build.

> **Why:** jsdom cannot confirm layout — the human phone check is the real proof. The existing checklist predates every post-sweep feature and targets 390px. Rewrite it to cover **every screen at 320px** so the user can walk through it on their installed PWA.

- [ ] **Step 1: Rewrite `docs/mobile-pwa-checklist.md`**

Replace the file with a checklist that: states the test context (installed PWA, portrait, **320px** — e.g. iPhone SE / DevTools 320px — plus a 390px sanity pass, light **and** dark); and has a per-screen section with concrete checks for **every** route — Sign-in, Trips list, New trip, Overview, Plan/itinerary, Calendar (Agenda + Month), Day, Today, Budget, **Compare (stacked cards on mobile, table on desktop)**, Wishlist (list + map), Chapters, Summary (+ route map), Journal, Checklists, Files, Activity, Settings, Command palette, Notifications dropdown, Discreet mode, Public share link, Print. Each section asserts: no horizontal page scroll; nothing bleeds its container; long names truncate; icons don't overlap/escape; text legible; touch targets ~44px; safe-area correct (tab bar above home indicator, header clears the notch); both themes.

- [ ] **Step 2: Final full verification**

Run: `npm run test && npm run build`
Expected: both exit 0, no regressions versus the pre-sweep suite.

- [ ] **Step 3: Commit**

```bash
git add docs/mobile-pwa-checklist.md
git commit -m "docs(mobile): rewrite manual PWA checklist for the 320px hardening sweep"
```

---

## Self-Review

**1. Spec coverage** (11 fix categories → tasks):
1. No horizontal page scroll / `min-w-0` / truncation — woven through T2, T3, T5, T7, T8, T9 (per-screen), backed by the Global Constraints. ✅
2. Compare view restructure — T7. ✅
3. Wide tables contained — Compare (T7), Discreet (T10, deliberately kept as tables). ✅
4. Calendar month grid legibility/containment — T4. ✅
5. Maps (Leaflet) — containers already safe; popups fixed in T6. ✅
6. Images — sweep found cover/journal/attachment images already `w-full`/contained; no dedicated task needed (verified in T2 Step 5 + noted). ✅
7. Overlays capped to viewport — T1 (dropdown, popover, notification, note-thread, user menu). ✅
8. Legibility floor (≥12px content text) — T3, T4, T8, T9 + Global Constraints. ✅
9. Touch targets ~44px — preserved/checked in T2 (tab bar), T3 (day-nav). ✅
10. Post-sweep features get a mobile pass — command palette (Dialog primitive already responsive; noted T1/T2), budget cards (T5), fork switcher/compare/promote (T7), chapters (T8), cover image (verified safe), wishlist map (T6/T8), activity feed (verified min-w-0), smarter-itinerary (timeline T3). ✅
11. Icon hygiene — Global Constraints rule + concrete `shrink-0` fixes in T4 (month-grid icons), T7/T8 (GitMerge, avatars), notification badge containment T1. ✅
Screen scope: all 17 routes + Discreet (T10) + sign-in/share (T9) + print (T10). ✅

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Verify-only steps (T2 Step 5, T9 Step 3, T10) are deliberate read-and-confirm-or-fix steps with explicit criteria, not placeholders — the sweep confirmed those areas are largely already hardened, so open-ended re-derivation is not warranted. Structural tests are gated on "if the test file exists" because jsdom can't test layout; this matches the repo's established mobile-sweep precedent.

**3. Type/name consistency:** T7 reuses the real symbols confirmed in `compare-table.tsx` — `METRIC_ROWS`, `renderCell`, `renderDelta`, `setPromoteOpenFor`, `plans`, `forkPlans`, `plan.forkId`, `plan.name`, `Button`, `GitMerge`. Class transforms use exact Tailwind tokens present in the current source. `max-w-[calc(100vw-1rem)]` is used identically in T1 Steps 1, 2, and its test assertions. `w-20`/`sm:w-24` (money-input) and `min-w-[4rem]`/`sm:min-w-[5rem]` (cost-amounts) match between edit and test steps.

**Risk notes:** Highest-risk tasks are T1 (shared primitive used by every dropdown/popover — the `max-w` cap must not clip desktop menus, hence `sm:` restores) and T7 (adds a mobile render branch to Compare — must render identical data via the same helpers; the desktop table is untouched behind `hidden sm:block`). T4's month-grid containment changes a shared calendar component — the `sm:`-gated wrapper keeps desktop identical. All layout/visual behaviour is ultimately proven by the Task 11 manual checklist on a real phone, since jsdom cannot measure it.
