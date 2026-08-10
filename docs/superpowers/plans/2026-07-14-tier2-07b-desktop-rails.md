# Tier 2 ⑦b — Desktop Right-Rails (Plan · Summary · Calendar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the **Summary** and **Plan** pages a Bold-Modular desktop right-rail (D6 / D3 mocks), mirroring the shipped Home pattern (⑦a). **Calendar is intentionally skipped** — it already ships a working `lg:flex-row` month-grid + wishlist `<aside>` rail (D4 satisfied).

**Architecture:** Pure render-structure changes in two async RSC page components. In each, the lead content stays full-width, then a `lg:grid-cols-[minmax(0,1fr)_20rem]` grid places the bulk content in a main column and one existing block in a 20rem right rail. On mobile the grid is a single column, so blocks stack (order preserved / documented). No data, logic, or component-internal changes.

**Tech Stack:** Next.js RSC, Tailwind v4 responsive grid.

## Global Constraints
- **Reference pattern (copy this exactly):** `components/trip/home/phase-planning.tsx:337-351` — full-width lead, then `<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">` with a main `flex-col` + a rail `flex-col`.
- **Mock:** `design_handoff/TEEPEE - Bold Modular Desktop.dc.html` — D3 Plan (rail = Plan overview), D6 Summary (rail = Cost/Budget summary). Shell is `max-w-5xl` (`app/(app)/layout.tsx:153`) — the rail fits inside it. Reuse `minmax(0,1fr)_20rem` verbatim for consistency with Home (mock rails are 320px/340px ≈ 20rem).
- **`cost-summary.tsx` is a RED HERRING** — it is a per-cost one-line amount formatter, NOT the Summary rail. The Summary rail is the page's own inline **Budget summary `<section>`** (`summary/page.tsx:643-692`). Do **not** touch `components/trip/cost-summary.tsx`.
- **Calendar: NO CHANGE.** `components/trip/calendar-views.tsx:187-244` already renders the month grid (`flex-1`) beside a draggable wishlist `<aside className="lg:w-56 lg:shrink-0">`. Touching that client DnD component is pure risk for zero functional gain. Skip it (task 3 is a no-op note).
- **No data/logic change:** only the JSX wrapper/placement in each page's `return`. Keep every existing element (props, conditionals like `stops.length > 0`, the `activeFork` banner, all sections) byte-for-byte; only re-nest them.
- **Discreet mode (Plan):** the early `StopSpreadsheet` return at `plan/page.tsx:344-348` must be left untouched — only edit the normal return at `364-453`.
- Token-driven; no `globals.css`/token/primitive changes.
- **Environment (sandbox):** Node ≥22 for vitest (if it errors: `export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use`). `next build`/`next dev` FAIL — do NOT run; the desktop layout is a human `npm run dev` pass. Gates: `npx tsc --noEmit`, `npx eslint <file>`, `npx vitest run` (full). **No unit test** — these are async RSC pages with DB queries (not jsdom-renderable); the existing `plan-overview`/`calendar-views`/`month-grid` tests assert content/behaviour, not layout, so they stay green.
- **Branch:** `feat/bold-modular-rest`. Never main/push/merge/deploy; never `git add` under `.superpowers/`. Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Blind build:** unverifiable visually in-sandbox → Cam's local pass at ≥1024px is the real check.

---

## File Structure
- `app/(app)/trips/[tripId]/summary/page.tsx` — **modify** (Task 1; render structure of the main return only).
- `app/(app)/trips/[tripId]/plan/page.tsx` — **modify** (Task 2; render structure of the normal return only).
- Calendar — no file changes (Task 3 is a documentation no-op).

---

### Task 1: Summary desktop right-rail (D6)

**Files:** Modify `app/(app)/trips/[tripId]/summary/page.tsx` (the main `return` at ~417-708). Do NOT touch the two early date-less returns (128-175).

**Interfaces:** consumes the existing inline sections. No prop/data change. The rail content is the **Budget summary `<section aria-labelledby="budget-heading">`** currently at `643-692`.

- [ ] **Step 1: Restructure the return.** The current main return is (abbreviated):

```tsx
  return (
    <div className="flex flex-col gap-8">
      <h2 className="sr-only">Trip summary</h2>
      {/* ── Header stat bar ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"> …4× StatCard… </div>
      {/* ── Not yet scheduled ── */}
      {roughStops.length > 0 && (<section aria-labelledby="rough-heading"> … </section>)}
      {/* ── Route Map ── */}
      <section aria-labelledby="map-heading"> … </section>
      {/* ── Stops overview ── */}
      <section aria-labelledby="stops-heading"> … </section>
      {/* ── Budget summary ── */}
      <section aria-labelledby="budget-heading"> … </section>
      {/* ── Flags ── */}
      <section aria-labelledby="flags-heading"> … </section>
    </div>
  );
```

Re-nest into: full-width `h2` + stat bar, then a `lg:` grid whose **main** column holds `rough → route → stops → flags` and whose **rail** holds the **budget** section. Concretely: keep everything up to and including the stat-bar `</div>` (line 450) unchanged; immediately after it, open the grid + main column; keep the `rough`, `route`, and `stops` sections verbatim inside main; **move the entire `budget` `<section>` (643-692) out** so that main next contains the `flags` `<section>`; close main; open the rail column containing the budget section; close rail + grid. Result:

```tsx
  return (
    <div className="flex flex-col gap-8">
      <h2 className="sr-only">Trip summary</h2>

      {/* ── Header stat bar (full-width) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* …4× StatCard, unchanged… */}
      </div>

      {/* Bold Modular desktop (D6): main column (route + itinerary + flags)
          beside a right rail (budget summary). Mobile collapses to one column:
          rough → route → itinerary → flags → budget. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-8">
          {/* ── Not yet scheduled ── */}
          {roughStops.length > 0 && (
            <section aria-labelledby="rough-heading">{/* …unchanged… */}</section>
          )}
          {/* ── Route Map ── */}
          <section aria-labelledby="map-heading">{/* …unchanged… */}</section>
          {/* ── Stops overview ── */}
          <section aria-labelledby="stops-heading">{/* …unchanged… */}</section>
          {/* ── Flags ── */}
          <section aria-labelledby="flags-heading">{/* …unchanged… */}</section>
        </div>
        <div className="flex flex-col gap-8">
          {/* ── Budget summary → right rail ── */}
          <section aria-labelledby="budget-heading">{/* …unchanged… */}</section>
        </div>
      </div>
    </div>
  );
```

**Do not alter the innards of any section** (the stat cards, the rough-stop cards, the `RouteMap`, the itinerary IIFE with its global stop counter at 502-638, the budget `Card`, `MakeItFit`/`FlagList`). Only move/re-wrap whole sections. The `gap-8` rhythm of this page is preserved inside the grid.

- [ ] **Step 2: Verify structural integrity.**

Run: `grep -n 'aria-labelledby' app/(app)/trips/[tripId]/summary/page.tsx`
Expected: `rough-heading`, `map-heading`, `stops-heading`, `flags-heading` appear (in that source order) before `budget-heading` — i.e. budget is now last (in the rail div).

- [ ] **Step 3: Gates.**

Run: `npx tsc --noEmit` → clean (any mis-nested JSX / unbalanced tag fails here).
Run: `npx eslint "app/(app)/trips/[tripId]/summary/page.tsx"` → clean.
Run: `npx vitest run` → full suite green, unchanged count (no test renders this page).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/trips/[tripId]/summary/page.tsx"
git commit -m "$(cat <<'EOF'
feat(summary): desktop right-rail for budget summary (Tier 2 ⑦b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Plan desktop right-rail (D3)

**Files:** Modify `app/(app)/trips/[tripId]/plan/page.tsx` (the normal `return` at `364-453`). Do NOT touch the discreet `StopSpreadsheet` return at `344-348`.

**Interfaces:** consumes the existing `VariantBanner`, `PlanOverview` (rail candidate, conditional on `stops.length > 0`), and `ItineraryManager` (main, a large client component — wrap only, never restructure). No prop/data change.

**Ordering requirement:** mobile must show `PlanOverview` **on top** (current behaviour, matches the mobile mock); desktop must show `ItineraryManager` **left** (main, 1fr) with `PlanOverview` **right** (rail, 20rem). Achieve this with DOM order = overview-then-itinerary (mobile order) plus `lg:order-*` to swap columns on desktop.

- [ ] **Step 1: Replace the normal return.** Current:

```tsx
  return (
    <div className="flex flex-col gap-6">
      {/* Discreet mode returns … never reaches this branch … */}
      {activeFork && <VariantBanner tripId={tripId} variantName={activeFork.name} />}
      {stops.length > 0 && (
        <PlanOverview
          tripId={tripId}
          summary={planSummary}
          startDate={trip?.startDate ?? null}
          fitStops={stops.map((s) => ({
            id: s.id, name: s.name, arriveDate: s.arriveDate, departDate: s.departDate,
            nights: s.nights, pinned: s.pinned, sortOrder: s.sortOrder,
          }))}
        />
      )}
      <ItineraryManager
        tripId={tripId}
        /* …all existing props, unchanged… */
      />
    </div>
  );
```

Replace with (banner stays full-width on top; overview + itinerary go into the grid; **keep every `PlanOverview` and `ItineraryManager` prop exactly as-is**):

```tsx
  return (
    <div className="flex flex-col gap-6">
      {/* Discreet mode returns the stop-spreadsheet view earlier in this function and
          never reaches this branch, so the variant banner cannot leak fork vocabulary. */}
      {activeFork && <VariantBanner tripId={tripId} variantName={activeFork.name} />}
      {/* Bold Modular desktop (D3): itinerary editor in the main column, plan overview
          in a right rail. DOM order (overview → itinerary) keeps the overview on top on
          mobile; lg:order swaps them so the editor is the 1fr main column on desktop. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {stops.length > 0 && (
          <div className="flex flex-col gap-6 lg:order-2">
            <PlanOverview
              tripId={tripId}
              summary={planSummary}
              startDate={trip?.startDate ?? null}
              fitStops={stops.map((s) => ({
                id: s.id, name: s.name, arriveDate: s.arriveDate, departDate: s.departDate,
                nights: s.nights, pinned: s.pinned, sortOrder: s.sortOrder,
              }))}
            />
          </div>
        )}
        <div className="flex flex-col gap-6 lg:order-1">
          <ItineraryManager
            tripId={tripId}
            /* …all existing props, unchanged… */
          />
        </div>
      </div>
    </div>
  );
```

(`lg:order-1` on the itinerary column → grid cell 1 = `minmax(0,1fr)` main; `lg:order-2` on the overview column → grid cell 2 = `20rem` rail. On mobile both are `order-0`, so DOM order — overview then itinerary — renders overview on top. When `stops.length === 0` the overview column is omitted and the itinerary fills the main column, rail empty. `lg:items-start` stops the short rail stretching to the tall editor's height.)

- [ ] **Step 2: Confirm the discreet branch is untouched and props preserved.**

Run: `grep -n 'StopSpreadsheet\|lg:order-1\|lg:order-2\|ItineraryManager\|PlanOverview' app/(app)/trips/[tripId]/plan/page.tsx`
Expected: `StopSpreadsheet` still present (discreet return); one `lg:order-1` (itinerary col) + one `lg:order-2` (overview col); `PlanOverview`/`ItineraryManager` each present once.

- [ ] **Step 3: Gates.**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint "app/(app)/trips/[tripId]/plan/page.tsx"` → clean.
Run: `npx vitest run` → full suite green, unchanged count (`plan-overview.test.tsx` asserts content, not layout).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/trips/[tripId]/plan/page.tsx"
git commit -m "$(cat <<'EOF'
feat(plan): desktop right-rail for plan overview (Tier 2 ⑦b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Calendar — SKIP (documentation only)

**No code change.** `components/trip/calendar-views.tsx:187-244` already implements the D4 desktop rail: in month view, `flex flex-col gap-4 lg:flex-row` places `MonthGrid` (`flex-1`) beside a draggable wishlist `<aside className="lg:w-56 lg:shrink-0">` (count- and view-gated, wired to `ScheduleItemDialog` drag-and-drop). Restructuring a client DnD component blind, for a rail that already exists, is unjustified risk. The ⑦b goal is met on Calendar as-is.

- [ ] **Step 1:** Confirm the existing rail is present (no edit): `grep -n 'lg:flex-row\|lg:w-56\|aside' components/trip/calendar-views.tsx` → expect the month-view row + wishlist aside. Record "Calendar rail already present — skipped" in the section report.

---

## Verification (Definition of Done)
- `npx tsc --noEmit` clean; `npx eslint` clean on both touched pages; `npx vitest run` green (unchanged count).
- Summary: full-width stat bar; `lg+` main (route + itinerary + flags) + right rail (budget summary); mobile single column.
- Plan: full-width variant banner; `lg+` main (itinerary editor) + right rail (plan overview); mobile shows overview on top.
- Calendar: unchanged (rail already shipped).
- No data/logic/token/primitive changes; `cost-summary.tsx` untouched.
- Visual pass (Cam, local dev) — eyeball both at ≥1024px + mobile stack. Tick ⑦b in the tracker.

## Self-Review Notes
- **Spec coverage:** D6 (Summary rail = budget) ✓ Task 1; D3 (Plan rail = overview) ✓ Task 2; D4 (Calendar rail) ✓ already shipped, Task 3 documents skip.
- **Mobile reorder (Summary):** budget moves from before-flags to after-flags (last) on mobile — deliberate, documented; the summary mobile order is not a specified mock frame and the desktop rail is the target.
- **Type/prop consistency:** no props changed; both edits are re-nesting only, so `tsc`/`eslint` flag any dropped element or unbalanced JSX.
- **Placeholder scan:** the `{/* …unchanged… */}` markers in the code blocks denote "keep the existing inner JSX verbatim" — the implementer must NOT delete or rewrite those innards, only move whole blocks. This is a re-nest, not a rewrite.
- **Risk:** Summary is lowest-risk (all inline server JSX). Plan's only subtlety is the `lg:order` column swap — verified against the grid auto-placement + order semantics. Both are unverifiable visually in-sandbox; Home (⑦a) is the proven precedent.
