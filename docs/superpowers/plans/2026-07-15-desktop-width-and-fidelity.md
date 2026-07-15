# Bold-Modular Desktop-Width & Fidelity Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the desktop "too narrow / lots of empty space" feeling and close the remaining 1:1 gaps between the shipped "Bold Modular" redesign and the `design_handoff/` mockups.

**Architecture:** The redesign was built blind (never rendered) and faithfully copied the mockups' 1024px content column — which was drawn inside a fake 1360px frame, so on real monitors it reads as a narrow strip in empty space, and several rails / anatomy details were left off. This pass (A) widens the shell with a responsive ramp so the extra width flows into each `1fr` main column, (B) adds the three missing structural rails, and (C) restores component-level Bold-Modular anatomy. All changes are token-/palette-driven (no hard-coded colours) so discreet mode keeps working, and introduce **no** data-model changes.

**Tech Stack:** Next.js (App Router, RSC) · Tailwind v4 (`@theme inline` tokens) · class-variance-authority · lucide-react · Radix UI · Vitest + Testing Library · Prisma (unchanged here).

## Global Constraints

- **No data-model / Prisma schema changes.** All new numbers are derived from existing data.
- **Token-/palette-driven colour only** — no hard-coded hex; discreet ("workspace") mode remaps tokens and must keep working (ADR-style constraint from `DESIGN-BRIEF.md` §A8.5).
- **Light AND dark both verified** for every visual change.
- **Money stays semantic:** under-budget/paid = `success`, over-spend = `--over` (not `destructive`), caution = `warning`; amounts right-aligned `tabular-nums`. **No user-set budget target concept** — Budget is estimated-vs-actual-spend only.
- **Preserve behaviour/props/aria/`data-testid`/maps.** Update tests alongside changes (TDD); keep the suite green (`npm test` = `vitest run`).
- **Commands:** test one file `npx vitest run <path>`; test by name `npx vitest run <path> -t "<name>"`; lint `npm run lint`; types `npx tsc --noEmit`.
- **Mockup reference** for every task: `design_handoff/TEEPEE - Bold Modular Desktop.dc.html` (D1–D10), `…Desktop 2.dc.html` (E1–E6), `…App.dc.html` (mobile core), `…More.dc.html` (mobile rest). Read the matching screen before editing.
- **Decisions locked with Cam:** responsive width ramp `max-w-5xl lg:max-w-6xl 2xl:max-w-7xl`; cap reading-width screens; per-stop colour = the existing `sortOrder`-keyed palette (shared with MonthGrid); full three-tier scope.

---

## Tier A — Width & shell

### Task 1: Responsive shell width ramp

**Files:**
- Modify: `app/(app)/layout.tsx:83` (top bar) and `:153` (`<main>`)
- Test: `app/(app)/layout.test.tsx` (add/extend an assertion)

**Interfaces:**
- Produces: the widened content shell that Tasks 2, 6–9 assume. The trip header + `TripNav` render inside `<main>` and inherit the new width automatically.

- [ ] **Step 1: Write the failing test.** In `app/(app)/layout.test.tsx`, assert the main content region carries the ramp classes. Query the `<main>` (add `data-testid="app-main"` if none exists) and assert its className contains `lg:max-w-6xl` and `2xl:max-w-7xl`.

```tsx
it("ramps the content width up on large screens", () => {
  render(await AppLayout({ children: <div /> })); // follow the file's existing render pattern
  const main = screen.getByTestId("app-main");
  expect(main.className).toContain("max-w-5xl");
  expect(main.className).toContain("lg:max-w-6xl");
  expect(main.className).toContain("2xl:max-w-7xl");
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run "app/(app)/layout.test.tsx"` → FAIL (missing ramp classes / testid).
- [ ] **Step 3: Implement.** Change both anchors from `max-w-5xl` to `max-w-5xl lg:max-w-6xl 2xl:max-w-7xl`. Add `data-testid="app-main"` to `<main>`. Add a short comment on the `<main>` line: `{/* Deliberately wider than the mocks' 1024px: they were framed at 1360px; real monitors need more. */}`.

```tsx
// line 83 (top bar inner):
<div className="mx-auto flex h-14 max-w-5xl lg:max-w-6xl 2xl:max-w-7xl items-center justify-between px-4 sm:px-6">
// line 153 (main):
<main data-testid="app-main" className="mx-auto w-full max-w-5xl lg:max-w-6xl 2xl:max-w-7xl flex-1 px-4 py-8 sm:px-6">
```

- [ ] **Step 4: Run to verify it passes.** `npx vitest run "app/(app)/layout.test.tsx"` → PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(shell): responsive desktop width ramp (5xl→6xl→7xl)"`

### Task 2: Rail widths to mockup spec

**Files:**
- Modify: `components/trip/home/phase-planning.tsx:340` (`20rem` → `21.25rem`)
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx:455` (`20rem` → `21.25rem`)
- Modify: `components/trip/calendar-views.tsx:201` (`lg:w-56` → `lg:w-64`)
- Test: extend the nearest existing test for each (e.g. `phase-planning.test.tsx`, `calendar-views.test.tsx`) with a className assertion, or add a lightweight render assertion.

**Interfaces:** Consumes Task 1's shell. Plan (`plan/page.tsx:372`, 320px) and Globe (`globe-view.tsx:72`, 330px) are already on-spec — leave them.

- [ ] **Step 1: Write the failing test.** Assert `phase-planning` renders the grid with `21.25rem` and calendar aside with `lg:w-64` (query by testid/role; add a `data-testid` on the grid wrapper if needed).
- [ ] **Step 2: Run to verify it fails.** `npx vitest run components/trip/home/phase-planning.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** `lg:grid-cols-[minmax(0,1fr)_20rem]` → `lg:grid-cols-[minmax(0,1fr)_21.25rem]` in phase-planning and summary/page; `lg:w-56` → `lg:w-64` in calendar-views.
- [ ] **Step 4: Run to verify it passes.** Re-run the touched tests → PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(desktop): rail widths to mock spec (home/summary 340px, calendar 250px)"`

### Task 3: Reading-width caps on text-heavy screens

**Files:**
- Modify: `app/(app)/trips/[tripId]/journal/page.tsx` — wrap the entries+editor column in `mx-auto w-full max-w-3xl`
- Modify: `app/(app)/trips/[tripId]/checklists/page.tsx` — wrap the tabs+content in `mx-auto w-full max-w-3xl`
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx` — wrap the timeline/editor stack in `mx-auto w-full max-w-3xl` (keep any full-width map/panel outside the cap if the mock shows it wide)
- Test: extend each page's existing test (or add a render test) asserting the wrapper carries `max-w-3xl`.

**Interfaces:** Consumes Task 1. Files, Activity, Trips grid deliberately keep filling the shell — do NOT cap them.

- [ ] **Step 1: Write the failing test** for one page (journal): assert a `max-w-3xl` wrapper is present.
- [ ] **Step 2: Verify fail.** `npx vitest run "app/(app)/trips/[tripId]/journal/page.test.tsx"` (or the closest existing test) → FAIL.
- [ ] **Step 3: Implement** the three wrappers. Read each page first; wrap only the reading column, not headers that should stay full-bleed.
- [ ] **Step 4: Verify pass.** Re-run touched tests → PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(desktop): cap reading-width on journal/checklists/day"`

---

## Shared helpers (do before the tasks that consume them)

### Task 4: Extract the shared per-stop colour palette

**Files:**
- Create: `lib/stop-colours.ts`
- Modify: `components/trip/month-grid.tsx:14-22` (import from the new module instead of the local `STOP_BAND_CLASSES`)
- Test: `lib/stop-colours.test.ts`

**Interfaces:**
- Produces: `stopBandBorderClass(index: number): string` (left-border, e.g. `border-l-sky-400`), `stopDotClass(index: number): string` (background dot, e.g. `bg-sky-400`), and `stopPillClass(index: number): string` (tinted pill bg+text). All cycle a fixed 6-hue palette by `index` = `stop.sortOrder`. Consumed by Task 10 (StopCard) and Task 4's month-grid refactor.

- [ ] **Step 1: Write the failing test** (`lib/stop-colours.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { stopBandBorderClass, stopDotClass, stopPillClass } from "@/lib/stop-colours";

describe("stop colours", () => {
  it("cycles the palette by index and wraps past the end", () => {
    expect(stopBandBorderClass(0)).toBe("border-l-sky-400");
    expect(stopBandBorderClass(3)).toBe("border-l-violet-400");
    expect(stopBandBorderClass(6)).toBe("border-l-sky-400"); // wraps
  });
  it("exposes matching dot and pill classes for the same index", () => {
    expect(stopDotClass(0)).toContain("bg-sky");
    expect(stopPillClass(0)).toContain("sky");
  });
});
```

- [ ] **Step 2: Verify fail.** `npx vitest run lib/stop-colours.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `lib/stop-colours.ts` (static, purge-safe strings — no dynamic class construction):

```ts
/**
 * Per-stop colour bands, keyed by stop.sortOrder. Shared by MonthGrid and the
 * plan editor's StopCard so a stop reads the same hue on the calendar and the
 * itinerary. Static strings keep Tailwind's content scanner happy.
 */
const STOP_HUES = ["sky", "amber", "emerald", "violet", "rose", "teal"] as const;

const BORDER = ["border-l-sky-400", "border-l-amber-400", "border-l-emerald-400", "border-l-violet-400", "border-l-rose-400", "border-l-teal-400"];
const DOT = ["bg-sky-400", "bg-amber-400", "bg-emerald-400", "bg-violet-400", "bg-rose-400", "bg-teal-400"];
const PILL = [
  "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
];

const idx = (i: number) => ((i % STOP_HUES.length) + STOP_HUES.length) % STOP_HUES.length;

export function stopBandBorderClass(index: number): string { return BORDER[idx(index)]; }
export function stopDotClass(index: number): string { return DOT[idx(index)]; }
export function stopPillClass(index: number): string { return PILL[idx(index)]; }
```

- [ ] **Step 4: Refactor month-grid** to import `stopBandBorderClass` and drop its local `STOP_BAND_CLASSES` (keep behaviour identical — it currently maps `sortOrder` → `border-l-*`). Run `npx vitest run components/trip/month-grid.test.tsx` → PASS.
- [ ] **Step 5: Verify pass + commit.** `npx vitest run lib/stop-colours.test.ts` → PASS. `git commit -am "refactor(colours): shared per-stop palette (lib/stop-colours) reused by month-grid"`

### Task 5: Compact money formatter

**Files:**
- Modify: `lib/money.ts` (add `formatMoneyCompact`)
- Test: `lib/money.test.ts` (extend)

**Interfaces:**
- Produces: `formatMoneyCompact(amountMinor: number, currency: string, locale?: string): string` → e.g. `"¥184k"`, `"A$1.2k"`. Consumed by Task 15 (BudgetGlance) and optionally Task 6 (budget hero). Lower-cases the magnitude suffix to match the mock's "184k".

- [ ] **Step 1: Write the failing test:**

```ts
import { formatMoneyCompact } from "@/lib/money";
it("formats compact money with a lowercase magnitude suffix", () => {
  expect(formatMoneyCompact(18400000, "JPY")).toBe("¥184k"); // ¥184,000 → ¥184k
  expect(formatMoneyCompact(950, "JPY")).toBe("¥950");        // below 1k: no suffix
});
```

- [ ] **Step 2: Verify fail.** `npx vitest run lib/money.test.ts -t "compact"` → FAIL.
- [ ] **Step 3: Implement** in `lib/money.ts`:

```ts
/**
 * Compact currency (e.g. "¥184k", "A$1.2k") for tight strips like BudgetGlance.
 * Lower-cases the magnitude suffix to match the design mocks. Falls back to
 * formatMoney for unknown currency codes.
 */
export function formatMoneyCompact(
  amountMinor: number,
  currency: string,
  locale: string = "en-AU",
): string {
  const decimals = decimalsFor(currency);
  const value = amountMinor / 10 ** decimals;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      notation: "compact",
      maximumFractionDigits: 1,
    })
      .format(value)
      .replace(/([KMBT])\b/g, (m) => m.toLowerCase());
  } catch {
    return formatMoney(amountMinor, currency, locale);
  }
}
```

- [ ] **Step 4: Verify pass.** `npx vitest run lib/money.test.ts -t "compact"` → PASS. (If the runtime renders `"184K"` vs `"184k"`, the regex handles it; confirm the exact expected string against Node's ICU and adjust the assertion if the symbol placement differs.)
- [ ] **Step 5: Commit.** `git commit -am "feat(money): formatMoneyCompact for tight budget strips"`

---

## Tier B — Missing structural rails

### Task 6: Budget 4-up hero row

**Files:**
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` (replace the current 2-col estimated/spent hero with the mock's 4-up)
- Reuse: `components/trip/animated-money.tsx`, `formatMoneyCompact` (Task 5)
- Test: `budget/page.test.tsx` (or closest) — assert the four labelled tiles render.

**Reference:** Desktop D5 lines ~246–252. Four tiles in `grid-cols-2 sm:grid-cols-4` (mock uses `1.4fr 1fr 1fr 1fr` — approximate with a 2/4 responsive grid): **ESTIMATED TOTAL** (big number + spent/estimated success bar + "¥184,000 spent so far"), **PAID**, **STILL TO PAY**, **EST / DAY**. All values are already computed for the existing SpendSoFar/roll-up; derive: paid = Σ paid costs (home-converted), still-to-pay = estimated − paid, est/day = estimated ÷ trip nights (guard divide-by-zero → hide the tile or show "—" when no dates).

- [ ] **Step 1: Write the failing test** asserting labels "Estimated total", "Paid", "Still to pay", and a per-day tile render with `tabular-nums` amounts.
- [ ] **Step 2: Verify fail.** `npx vitest run "app/(app)/trips/[tripId]/budget/page.test.tsx"` → FAIL.
- [ ] **Step 3: Implement.** Read the current hero + how estimated/paid are already computed on the page; build the 4 tiles as `Card`-style `rounded-2xl` tiles with uppercase `text-[11px] tracking-[0.1em] text-muted-foreground` eyebrows and `font-display` numbers. Bars use `bg-success` on `bg-muted`. Keep money semantic. When the trip has no dates, omit/neutralise the EST/DAY tile.
- [ ] **Step 4: Verify pass.** Re-run → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit.** `git commit -am "feat(budget): 4-up estimated/paid/to-pay/per-day hero (D5)"`

### Task 7: Budget right rail (exchange rates + other costs)

**Files:**
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` — wrap the by-category/roll-up main + a right rail in `grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start`; move `RatesPanel` and `OtherCostEditor` into the rail (`lg:order` so they stack sensibly on mobile — rates/other-costs after the roll-up on mobile, in the rail on desktop).
- Test: `budget/page.test.tsx` — assert rates + other-costs still render (content preserved), now inside the rail wrapper.

**Reference:** Desktop D5 lines ~253–278 (`1fr 320px`).

- [ ] **Step 1: Write the failing test** asserting the roll-up and the rates/other-costs sections coexist under a `lg:grid-cols-[minmax(0,1fr)_20rem]` wrapper (add a `data-testid="budget-grid"`).
- [ ] **Step 2: Verify fail** → FAIL.
- [ ] **Step 3: Implement** the two-column split; preserve all existing `RatesPanel`/`OtherCostEditor` props and the amber missing-rates banner.
- [ ] **Step 4: Verify pass** + `npx tsc --noEmit`.
- [ ] **Step 5: Commit.** `git commit -am "feat(budget): rates + other-costs into a desktop right rail (D5)"`

### Task 8: Home "Today" (Travelling) desktop rail

**Files:**
- Modify: `components/trip/home/phase-travelling.tsx` — wrap in `grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_21.25rem] lg:items-start`; main = today's timeline + day-map; rail = where-you-are · next-departure (TransportCountdown) · SpendSoFar (compact) · tonight's stay. Use `lg:order` so the rail cards stack under the timeline on mobile in their current order.
- Test: `phase-travelling.test.tsx` — assert the rail cards still render and a `data-testid="today-grid"` two-col wrapper is present at `lg`.

**Reference:** Desktop 2 E1 (`1fr 340px`). Mirror the `phase-planning.tsx:340` rail pattern.

- [ ] **Step 1: Write the failing test** (rail wrapper class + all today cards present).
- [ ] **Step 2: Verify fail** → FAIL.
- [ ] **Step 3: Implement.** Read the current phase-travelling stack; assign cards to main vs rail per E1; keep all existing components/props (no logic change).
- [ ] **Step 4: Verify pass** + tsc.
- [ ] **Step 5: Commit.** `git commit -am "feat(home): Travelling desktop rail (E1)"`

### Task 9: Home "That's a wrap" (Past) desktop rail

**Files:**
- Modify: `components/trip/home/phase-past.tsx` — wrap in the same `lg:grid-cols-[minmax(0,1fr)_21.25rem]` grid; main = recap hero + RouteMap; rail = FINAL SPEND card + CTAs ("Write journal", "Plan another trip").
- Test: `phase-past.test.tsx` — assert rail content renders under a `data-testid="past-grid"` wrapper.

**Reference:** Desktop 2 E2 (`1fr 340px`).

- [ ] **Step 1: Write failing test.** → **Step 2: Verify fail.** → **Step 3: Implement** (preserve the fixed-dark recap hero; keep it light+dark safe). → **Step 4: Verify pass** + tsc. → **Step 5: Commit** `git commit -am "feat(home): Past desktop rail (E2)"`.

---

## Tier C — Component fidelity & polish

### Task 10: StopCard hue border + "Nn" pill + things-to-do dots/times + coral add link

**Files:**
- Modify: `components/trip/stop-card.tsx` (left-border via `stopBandBorderClass`, "5n" pill via `stopPillClass`, things-to-do rows get a leading `stopDotClass`/category dot + right-aligned time, "+ Add thing to do" → coral link styling)
- Consumes: `lib/stop-colours.ts` (Task 4). StopCard must receive the stop's `sortOrder` index (check current props; thread it from `itinerary-manager.tsx` if not already passed).
- Test: `stop-card.test.tsx` — assert the coloured border class, the nights pill, and a things-to-do row dot render; keep existing behaviour/aria assertions green.

**Reference:** Desktop D3 line ~159; mobile App StopCards. **Biggest single anatomy gap.**

- [ ] **Step 1: Write the failing tests** (border class present for a given index; "5n" pill; things-to-do dot).
- [ ] **Step 2: Verify fail.** `npx vitest run components/trip/stop-card.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Read stop-card.tsx + how itinerary-manager renders it. Add the left band (`border-l-4` + `stopBandBorderClass(sortOrder)`; keep rough stops dashed but hued). Replace "5 nights" text-with-clock with a compact `Nn` pill using `stopPillClass`. Give each thing-to-do row a leading category/stop dot and a right-aligned time when timed. Restyle "+ Add thing to do" as a coral text link (`text-primary`). Keep all `data-testid`/aria/edit handlers.
- [ ] **Step 4: Verify pass** + tsc + `npm run lint`.
- [ ] **Step 5: Commit.** `git commit -am "feat(plan): StopCard hue band + Nn pill + things-to-do dots/times (D3)"`

### Task 11: 6-dot drag handle

**Files:**
- Modify: `components/trip/itinerary-manager.tsx:220` (and the chapter handle ~:258) — swap the single `GripVertical` for a 6-dot grid glyph (a small inline SVG of 2×3 circles, `fill-muted-foreground/60`), keeping the exact drag attributes/aria (`aria-label`, listeners).
- Test: `itinerary-manager.test.tsx` — the drag handle still exposes its `aria-label`/role; add an assertion the handle renders (by testid).

- [ ] **Step 1: Write failing test** (handle testid present). → **Step 2: Verify fail.** → **Step 3: Implement** the 6-dot SVG, preserving dnd-kit listeners + `aria-label={`Reorder ${stop.name}`}`. → **Step 4: Verify pass.** → **Step 5: Commit** `git commit -am "feat(plan): 6-dot drag handles"`.

### Task 12: AccommodationCard emerald tint + home icon

**Files:**
- Modify: `components/trip/accommodation-card.tsx` — emerald wash (`bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900`), a leading emerald home/bed icon, "Confirmed" affirmative label when a confirmation exists; keep the CostEditor delegation.
- Check: `itinerary-manager.tsx:1158` wrapper nesting — ensure the emerald tint isn't overridden by the grey nest; adjust the nest to be transparent for accommodation if needed.
- Test: `accommodation-card.test.tsx` — assert the emerald class + icon render; keep confirmation/cost behaviour.

- [ ] **Step 1: Write failing test.** → **Step 2: Verify fail.** → **Step 3: Implement** (all colours via emerald palette classes, both themes). → **Step 4: Verify pass** + tsc. → **Step 5: Commit** `git commit -am "feat(plan): emerald AccommodationCard (D3)"`.

### Task 13: TransportCard dashed seam + tinted mode-icon square

**Files:**
- Modify: `components/trip/transport-card.tsx` — dashed border (`border-[1.5px] border-dashed`), mode icon wrapped in a `size-9 rounded-xl` tinted square (mode/category-hue tint via palette classes), header format "From → To" as the title with "mode · time" beneath; keep CostEditor + all data.
- Test: `transport-card.test.tsx` — assert dashed class + icon-square render; keep existing content assertions.

- [ ] **Step 1: Write failing test.** → **Step 2: Verify fail.** → **Step 3: Implement.** → **Step 4: Verify pass** + tsc. → **Step 5: Commit** `git commit -am "feat(plan): dashed TransportCard seam + tinted mode icon (D3)"`.

### Task 14: CountdownHero desktop number size

**Files:**
- Modify: `components/trip/home/countdown-hero.tsx:60` — number `text-6xl` → `text-6xl lg:text-7xl` (60px mobile → 72px desktop, matching the mock's 66/72px).
- Test: `countdown-hero.test.tsx` — assert the number span carries `lg:text-7xl`.

- [ ] **Step 1: Write failing test.** → **Step 2: Verify fail.** → **Step 3: Implement.** → **Step 4: Verify pass.** → **Step 5: Commit** `git commit -am "feat(home): countdown number 72px on desktop"`.

### Task 15: BudgetGlance compact amounts

**Files:**
- Modify: `components/trip/home/budget-glance.tsx:22-25` — use `formatMoneyCompact` (Task 5) so the quiet strip reads "¥184k / ¥312k est".
- Test: `budget-glance.test.tsx` — update the amount assertion to the compact form.

- [ ] **Step 1: Update the test** to expect "¥184k" / "¥312k est". → **Step 2: Verify fail** (still full amounts). → **Step 3: Implement** (swap `formatMoney`→`formatMoneyCompact`). → **Step 4: Verify pass.** → **Step 5: Commit** `git commit -am "feat(home): abbreviate BudgetGlance amounts (184k)"`.

### Task 16: NextStepsCard subtitle + third severity hue

**Files:**
- Modify: `lib/next-steps.ts` (add optional `subtitle?: string` to `NextStep`; supply subtitles for the nudges by splitting their copy into a short title + a detail subtitle; for flags, use a secondary detail if `Flag` exposes one, else leave `subtitle` undefined)
- Modify: `components/trip/next-steps-card.tsx` — render the subtitle line when present; add a third chip hue (map transport-related severity/source to `bg-primary` coral, keeping warning→amber, info→sky)
- Test: `next-steps.test.ts` (subtitle populated for a sample nudge) + `next-steps-card.test.tsx` (renders subtitle + coral chip)

**Note:** Presentation-only. Do NOT change `Flag` storage. If a clean flag subtitle source doesn't exist, keep flag rows single-line and only give nudges subtitles — record that choice in the commit body.

- [ ] **Step 1: Write failing tests** (NextStep.subtitle for a nudge; card renders 2 lines + a coral chip variant). → **Step 2: Verify fail.** → **Step 3: Implement** (extend interface + nudge copy split + card render + third hue). → **Step 4: Verify pass** + tsc. → **Step 5: Commit** `git commit -am "feat(home): NextSteps subtitles + third severity hue"`.

### Task 17: Command-palette search pill

**Files:**
- Modify: `components/trip/command-palette-trigger.tsx` (or wherever the ⌘K trigger lives; the top bar renders it in `app/(app)/layout.tsx`) — desktop shows a full pill: search icon + muted "Search or jump…" text + a bordered `⌘K` kbd chip, `min-w-[220px]`, `rounded-md border bg-muted/60`. Keep the compact icon-only button on mobile (`sm:` reveals the pill). Preserve the open-on-click + keyboard behaviour and any `aria-label`.
- Test: `command-palette-trigger.test.tsx` — assert the pill text + kbd render on desktop and the trigger still opens the palette.

- [ ] **Step 1: Write failing test.** → **Step 2: Verify fail.** → **Step 3: Implement** (responsive: icon-only `<sm`, pill `sm+`). → **Step 4: Verify pass.** → **Step 5: Commit** `git commit -am "feat(shell): ⌘K search pill on desktop"`.

### Task 18: Button outline border weight

**Files:**
- Modify: `components/ui/button.tsx:19-20` — `outline` variant `border` → `border-[1.5px]` (brief + mocks specify a heavier outline).
- Test: `button.test.tsx` — assert the outline variant className contains `border-[1.5px]`.

- [ ] **Step 1: Write failing test.** → **Step 2: Verify fail.** → **Step 3: Implement** (single class change). → **Step 4: Verify pass** (run the full suite for this one — it cascades app-wide: `npm test`). → **Step 5: Commit** `git commit -am "feat(ui): 1.5px outline button border"`.

### Task 19: Restore leading hue dots on chips

**Files:**
- Modify: `components/trip/chapter-chip.tsx` (leading `size-2 rounded-full` dot in the chapter colour before the name)
- Modify: `components/trip/trip-card.tsx:~87` (phase badge: leading status dot before "Planning · In 26d", colour by phase — planning coral, sketching amber, past stone)
- Modify: `components/trip/globe-suggestions-strip.tsx` (eyebrow: leading dot; optionally add the "· NEAR {stop}" locality suffix if the data is already on hand)
- Test: extend each component's test to assert the dot renders.

- [ ] **Step 1: Write failing tests (3).** → **Step 2: Verify fail.** → **Step 3: Implement** (colours via palette/token classes). → **Step 4: Verify pass** + tsc. → **Step 5: Commit** `git commit -am "feat(chips): restore leading hue dots (chapter/trip-card/globe-suggestions)"`.

### Task 20: Shell chrome polish (wordmark tent + TripNav active colour)

**Files:**
- Modify: `app/(app)/layout.tsx` — replace the 🛖 emoji wordmark with an inline coral tent SVG (stroke `text-primary`, `size-6`), keeping the discreet-mode wordmark swap working (SVG only in normal mode; discreet keeps its neutral label).
- Modify: `components/trip/trip-nav.tsx:83-87` — active tab label colour `text-foreground` → `text-primary` (underline already coral).
- Test: `trip-nav.test.tsx` — active tab has `text-primary`; layout test — the tent SVG renders in normal mode (and NOT in discreet).

- [ ] **Step 1: Write failing tests.** → **Step 2: Verify fail.** → **Step 3: Implement** (guard the SVG behind the same normal/discreet branch the emoji used). → **Step 4: Verify pass** + tsc. → **Step 5: Commit** `git commit -am "feat(shell): tent wordmark SVG + coral active TripNav label"`.

### Task 21: Journal past-entry titles

**Files:**
- Modify: `app/(app)/trips/[tripId]/journal/page.tsx` (entry card renders the entry title in `font-display font-bold` above the body when a title exists)
- Test: `journal` page/editor test — assert the title renders in the entry card.

- [ ] **Step 1: Write failing test.** → **Step 2: Verify fail.** → **Step 3: Implement** (title only when present; body/footer unchanged). → **Step 4: Verify pass.** → **Step 5: Commit** `git commit -am "feat(journal): bold entry titles on past entries"`.

### Task 22: Files section-header font

**Files:**
- Modify: `app/(app)/trips/[tripId]/files/page.tsx` — group section-header labels use `font-display font-bold` (matching the mock's Space-Grotesk section labels); optionally append the "· added {date}" to file rows using the already-fetched `createdAt`.
- Test: files page test — assert the section header carries `font-display`.

- [ ] **Step 1: Write failing test.** → **Step 2: Verify fail.** → **Step 3: Implement.** → **Step 4: Verify pass.** → **Step 5: Commit** `git commit -am "feat(files): Space Grotesk section headers"`.

---

## Final gate (after all tasks)

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean
- [ ] `npm test` — full suite green
- [ ] Manual visual pass owed to Cam on local `npm run dev` (light + dark + discreet): shell width on a wide monitor, planner column, Budget hero+rail, Travelling/Past rails, StopCard hue bands, emerald accommodation, dashed transport, countdown number, ⌘K pill.
- [ ] STOP at merge gate — do NOT merge/push to `main` without Cam's explicit go-ahead (sandbox guardrail).

---

## Self-review notes

- **Spec coverage:** Tier A → Tasks 1–3. Tier B → Tasks 6–9. Tier C → Tasks 10–22. Shared helpers (Tasks 4–5) unblock 10 and 15. Every gap from the audit maps to a task.
- **Type consistency:** `stopBandBorderClass`/`stopDotClass`/`stopPillClass` (Task 4) are the exact names Task 10 consumes; `formatMoneyCompact` (Task 5) is consumed by Tasks 15 (and optionally 6). `NextStep.subtitle?` (Task 16) is optional so it doesn't break existing consumers.
- **Ordering:** Tasks 4–5 precede their consumers. Task 1 precedes 2/3/6–9. Otherwise tasks are independent and can be reviewed in isolation.
- **Known judgement call:** Task 16 flag subtitles depend on whether `Flag` carries a detail field — bounded fallback documented in the task.
