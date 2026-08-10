# E+ Batch 5 (final) — Home Travelling/Past phases + Globe Bold-Modular Rebuild

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the **Home Travelling ("Today")** + **Home Past ("That's a wrap")** phase dashboards and the **Globe** screen to the Bold-Modular mocks — presentationally, preserving every data path, server action, filter/selection state, marker CRUD, countdown logic, aria contract, and `data-testid`. This is the last build batch before the whole-program review + merge gate.

**Architecture:** Async RSC phase wrappers (no unit tests) + client components (behaviour tests stay green). Two focused behavioural changes: the TransportCountdown amber restyle (TDD) and the Globe category filter becoming chip buttons (TDD — a `<select>`→chips interaction change). The Leaflet map (`globe-map*.tsx`) and already-restyled children (Timeline, WeatherDaylightCard, RouteMap, Card/Button, QuickActions) are NOT touched.

**Tech Stack:** Next.js RSC + client components, Tailwind v4 (token-driven), `cn`, lucide-react, Vitest + Testing Library. Reuses `categoryAccent(category)` (hued dot/border classes) from `components/trip/category-pill.tsx`.

## Global Constraints
- **Mocks:** `design_handoff/TEEPEE - Bold Modular More.dc.html` (M1 Travelling ~40–65, M2 Past ~76–99) · `TEEPEE - Bold Modular App.dc.html` (Globe ~449–492) · `TEEPEE - Bold Modular Desktop.dc.html` (D7 Globe ~328–367). Anatomy in `DESIGN-BRIEF.md` C2/C4. Fidelity is Cam's local `npm run dev` pass.
- **Presentation-only** except: TransportCountdown amber restyle (colours) and Globe category chips (interaction shape, same `onChange` contract). NO changes to props/interfaces, server actions, callbacks, state machines, optimistic logic, aria roles/labels, or `data-testid`s.
- **DO NOT touch (already done / out of scope):** `components/globe/globe-map.tsx` + `globe-map-loader.tsx` (Leaflet + CARTO — ⑥); `components/trip/timeline.tsx` (B2), `weather-daylight-card.tsx` (B2), `route-map*.tsx` (⑥); `Card`/`Button`/`Segmented` primitives; `phase-sketching.tsx` (already idiom-aligned). Do NOT touch `marker-form.tsx` or `globe-invite-button.tsx` (already aligned via ⑤ primitives — verified; leave them).
- **Dark decorative block:** the Past "That's a wrap" hero is a deliberately-dark solid block. Use a FIXED dark class `bg-[hsl(24_14%_15%)] text-white` (NOT `bg-foreground`/`bg-card`, which flip in dark mode). Decorative orb = `bg-white/[0.06]` (mirrors CountdownHero).
- **Colours token-driven / named-palette:** amber (`bg-amber-50`/`border-amber-200`/`text-amber-600`), emerald (`bg-emerald-50`/`text-emerald-700`), `bg-primary`, `text-over`. Category hues via `categoryAccent`.
- **Accessibility:** keep WCAG AA + focus rings + aria contracts + `data-testid`s. Category chips are `<button>`s with clear labels; the "All" chip sets `category: null`.
- **Environment (sandbox):** Node ≥22 (`export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use` if vitest errors). `next build`/`next dev` FAIL — do NOT run. Gates: `npx tsc --noEmit`, `npx eslint <files>`, focused `npx vitest run` then full.
- **Branch:** `feat/bold-modular-rest`. Never main/push/merge/deploy; never `git add` under `.superpowers/`. Trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure
- `components/trip/transport-countdown.tsx` + new `.test.tsx` — **modify/create** (T1).
- `components/trip/home/phase-past.tsx` — **modify** (T2).
- `components/trip/home/phase-travelling.tsx` — **modify** (T3).
- `components/globe/marker-filters.tsx` + `components/globe/marker-list.test.tsx` — **modify** (T4; filter tests live in marker-list.test.tsx).
- `components/globe/marker-list.tsx` — **modify** (T5).
- `components/globe/globe-view.tsx` + `app/(app)/globe/page.tsx` — **modify** (T6).

---

### Task 1: `TransportCountdown` — amber "next departure" block

**Files:** Modify `components/trip/transport-countdown.tsx`; create `components/trip/transport-countdown.test.tsx`.

**Preserve:** props + the live-countdown `setInterval` logic + the `msLeft <= 0` → render `null` bail-out + `depTimeLabel`/`depZone` display. Single callsite (phase-travelling).

Target (M1 line 44–45): amber-tinted block, "NEXT DEPARTURE" eyebrow (clock icon + label), big Space-Grotesk countdown, route line.

- [ ] **Step 1: Write a failing class-regression test** `transport-countdown.test.tsx`. Render with a future departure (copy the prop shape the component expects; use a time far enough ahead that it doesn't bail to null) and assert the amber block: `expect(container.querySelector(".border-amber-200, [class*=amber]")).toBeTruthy()` — more concretely assert the outer wrapper className matches `/amber/`. Run → RED. (If the component needs a departure timestamp, pass one ~2h in the future.)
- [ ] **Step 2: Implement** (keep all logic):
  - Outer: `rounded-xl border border-primary/20 bg-primary/5` → `rounded-2xl border border-amber-200/60 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/30`.
  - Header: the clock/timer icon → `text-amber-600 dark:text-amber-400`; add an eyebrow `<span className="text-[11px] font-bold uppercase tracking-[0.06em] text-amber-700 dark:text-amber-300">Next departure</span>` (if a label already exists, restyle it to this).
  - Countdown value → `font-display text-2xl font-bold text-foreground`; the mode/time/route sublines → `text-xs text-amber-700/90 dark:text-amber-300/80` (or `text-muted-foreground` if that reads cleaner — keep it legible).
- [ ] **Step 3: Run test → GREEN.** Then `npx tsc --noEmit`; `npx eslint components/trip/transport-countdown.tsx components/trip/transport-countdown.test.tsx`; full `npx vitest run`.
- [ ] **Step 4: Commit** — `feat(home): amber next-departure TransportCountdown (E+ B5)` (+ trailer).

---

### Task 2: `phase-past.tsx` — dark recap hero + FINAL SPEND + CTAs

**Files:** Modify `components/trip/home/phase-past.tsx` (RSC). No unit test (RSC).

**Preserve:** props `{ tripId, trip }`; all 8 parallel queries + `buildBudget`/`applyFxRatesToCosts`/`buildSpendSoFar`/`nightsBetween`/`chapterForStop`/`chapterColourSwatch`/`formatMoney`; the `if (!trip.startDate) return null` guard; `journalCount` conditional CTA; `mapStops` construction; `RouteMap` (untouched). Keep the `SpendSoFarCard` component file intact (phase-travelling still uses it compact) — just stop importing/using it here.

Target (M2 76–99): a dark "That's a wrap" hero block (eyebrow + trip name + 3 stat blocks), a white "FINAL SPEND" card (header + under/over chip + big paid amount + success progress bar), the route map, and two CTAs (coral "Write journal" + outline "Plan another").

- [ ] **Step 1: "That's a wrap" dark hero.** Replace the current light `section` with:

```tsx
<section className="relative overflow-hidden rounded-3xl bg-[hsl(24_14%_15%)] p-6 text-white">
  <div className="pointer-events-none absolute -right-8 -top-8 size-[150px] rounded-full bg-white/[0.06]" aria-hidden="true" />
  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">That&apos;s a wrap</p>
  <p className="mt-2 font-display text-2xl font-bold">{trip.name}</p>
  <div className="mt-4 flex gap-5">
    <div><div className="font-display text-2xl font-bold">{stopCount}</div><div className="text-[11px] text-white/60">stops</div></div>
    <div><div className="font-display text-2xl font-bold">{totalNights}</div><div className="text-[11px] text-white/60">nights</div></div>
    <div><div className="font-display text-2xl font-bold">{formatMoney(spentMinor, trip.homeCurrency)}</div><div className="text-[11px] text-white/60">spent</div></div>
  </div>
</section>
```

Use the values the current summary line already computes (stop count, total nights, spent — reuse the existing locals; do NOT add queries). Keep the numbers identical to today's summary.

- [ ] **Step 2: Inline "FINAL SPEND" card** (replaces the `<SpendSoFarCard>` full usage — remove that import/usage from this file only). Reuse the existing `spend`/`budget.grandTotal` locals:

```tsx
<section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
  <div className="mb-2 flex items-center justify-between">
    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Final spend</span>
    {/* under/over chip — reuse the sign of spend.varianceMinor (or estimated-vs-actual) */}
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", underBudget ? "bg-success/15 text-success" : "bg-over/10 text-over")}>
      {formatMoney(Math.abs(varianceMinor), trip.homeCurrency)} {underBudget ? "under" : "over"}
    </span>
  </div>
  <p className="font-display text-2xl font-bold text-foreground">
    {formatMoney(paidMinor, trip.homeCurrency)} <span className="text-sm font-medium text-muted-foreground">of {formatMoney(estimatedMinor, trip.homeCurrency)} estimated</span>
  </p>
  <span className="mt-3 block h-2 overflow-hidden rounded-full bg-muted">
    <span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
  </span>
</section>
```

Derive `paidMinor`/`estimatedMinor`/`varianceMinor`/`underBudget`/`pct` from the existing `spend`/`budget` locals (match whatever `buildSpendSoFar` already exposes — `paidSoFarMinor`/`estimatedTotalMinor`/`varianceMinor`; `pct = estimatedMinor>0 ? min(100, round(paid/estimated*100)) : 0`; guard estimated=0 → 0%). If the exact field names differ, use the real ones — do not invent. Import `cn`.

- [ ] **Step 3: Route map + CTAs.** Route map wrapper stays `rounded-2xl`; reduce `RouteMap height={280}` → `height={200}`. CTAs: `flex gap-3` (drop `flex-wrap`); first `<Button asChild variant="primary" className="flex-1">` (Write journal, keep its icon + `journalCount` conditional label + href); second `<Button asChild variant="outline" className="flex-1 border-2 border-foreground">` (Plan another, keep href). Keep `asChild` + the `<Link>` children.
- [ ] **Step 4: Gates.** `npx tsc --noEmit`; `npx eslint components/trip/home/phase-past.tsx`; full `npx vitest run` (green, unchanged count — no test imports phase-past). Confirm `SpendSoFarCard` is still imported/used elsewhere (phase-travelling) so removing it here doesn't orphan the file.
- [ ] **Step 5: Commit** — `feat(home): dark "that's a wrap" recap + final-spend card (E+ B5)` (+ trailer).

---

### Task 3: `phase-travelling.tsx` — Today polish

**Files:** Modify `components/trip/home/phase-travelling.tsx` (RSC). No unit test.

**Preserve:** props `{ tripId }`; all 9 queries + `effectiveTodayISO`/`buildItinerary`/`pickDayPlan`/`buildDayMapModel`/`buildItemDirections`/`nearbyWishlistItems`/`buildSpendSoFar`/`chapterForDate`/`dayNumberInTrip`; the before/within/after-trip edge-case handling; `SpendSoFarCard compact`, `DayMapPanel`, `Timeline variant="day"` (already restyled — untouched internally), `NearbyWishlist`, `RemindersCard`, `TransportCountdown` (restyled in T1), `ChapterChip`, `MapLink`, `AttachmentLinks`. **Keep the quick-links section** (removing navigation is out of scope). **Keep the Timeline outer wrapper here** (this view keeps it, unlike the Day page — a deliberate divergence).

- [ ] **Step 1: Restyle (presentation-only):**
  - Header: `<h2>` `font-display text-2xl font-semibold` → `font-display text-3xl font-bold tracking-tight`. If simple, put "Today" + the long date in one `flex items-baseline gap-2` row; the "Day N · ChapterChip" line stays below. (If the date restructure is awkward, keep the current stacked layout — the size bump is the priority.)
  - Where-you-are card: `rounded-xl border border-border bg-card px-4 py-3` → `rounded-2xl border border-border bg-card px-4 py-3 shadow-soft`; the stop name `font-display text-lg font-semibold` → `font-display text-base font-bold`.
  - Timeline outer wrapper: `rounded-xl` → `rounded-2xl` (keep the wrapper).
  - Tonight's stay card: `rounded-xl border border-border bg-card px-4 py-3` → `rounded-2xl bg-emerald-50 px-4 py-3 dark:bg-emerald-950/20` (drop the border); the accommodation icon → `text-emerald-700 dark:text-emerald-400`; name text → `text-emerald-900 dark:text-emerald-100`; sub-line → `text-emerald-700/80 dark:text-emerald-300/70`. Keep `MapLink` + `AttachmentLinks`.
- [ ] **Step 2: Gates.** `npx tsc --noEmit`; `npx eslint components/trip/home/phase-travelling.tsx`; full `npx vitest run` (green, unchanged).
- [ ] **Step 3: Commit** — `feat(home): Bold-Modular Travelling ("Today") surface (E+ B5)` (+ trailer).

---

### Task 4: `MarkerFilters` — pill search + category chips

**Files:** Modify `components/globe/marker-filters.tsx` + `components/globe/marker-list.test.tsx` (the filter behaviour tests live there).

**Preserve:** props `{ filter, countries, onChange }`; `filter.query`/`filter.category`/`filter.country` wired via `onChange`; `CATEGORIES` from `@/lib/categories`; `MarkerFilter` type. Import `categoryAccent` from `@/components/trip/category-pill` for chip dots.

Target (App 471–479 / D7 353–359): a pill search bar (search icon + input) + a visible country `<select>` (kept, restyled) in one row; a horizontal category **chip button** row below — "All" (dark filled active) + one chip per category (white + border + hued dot).

- [ ] **Step 1: Update the filter tests** in `marker-list.test.tsx`. The category test currently changes a `<select>` (`getAllByRole("combobox")`) — rewrite it to click the category chip button (e.g. `getByRole("button", { name: /food/i })`) and assert `onChange` receives `{ category: "FOOD" }` (match the real category value), and add an "All" chip → `{ category: null }` assertion. Update the query test's placeholder from `/filter your markers/i` → `/search places/i`. Keep the country `<select>` test as-is (it stays a native select). Run → RED (chips/placeholder don't exist yet).
- [ ] **Step 2: Implement.**
  - Outer: `flex flex-wrap items-center gap-2` → `flex flex-col gap-3`.
  - Row 1: a pill search wrapper `<div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-card px-3 py-2"><Search className="size-4 shrink-0 text-muted-foreground" aria-hidden /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search places" value={filter.query} onChange={e => onChange({ ...filter, query: e.target.value })} /></div>` + the existing country `<select>` (keep its options/onChange; restyle to `rounded-full border border-border bg-card px-3 py-2 text-sm`).
  - Row 2: category chips — a horizontal `flex flex-wrap gap-2` (mobile: `overflow-x-auto`). "All" chip: `<button onClick={() => onChange({ ...filter, category: null })} className={cn("rounded-full px-3 py-1 text-xs font-bold", !filter.category ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground")}>All</button>`. Then `CATEGORIES.map(cat => <button key={cat.value} onClick={() => onChange({ ...filter, category: cat.value })} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", filter.category === cat.value ? "bg-foreground text-background" : "border border-border bg-card text-foreground")}><span className={cn("size-1.5 rounded-full", categoryAccent(cat.value).dot)} aria-hidden />{cat.label}</button>)`.
  - Keep the `Input` import only if still used; otherwise remove (eslint will flag).
- [ ] **Step 3: Run tests → GREEN** (`npx vitest run components/globe/marker-list.test.tsx` — rewritten category test + placeholder + country select). Then `npx tsc --noEmit`; `npx eslint components/globe/marker-filters.tsx components/globe/marker-list.test.tsx`; full `npx vitest run`.
- [ ] **Step 4: Commit** — `feat(globe): pill search + category filter chips (E+ B5)` (+ trailer).

---

### Task 5: `MarkerList` — Bold-Modular country rail

**Files:** Modify `components/globe/marker-list.tsx`.

**Preserve:** all 7 props + types; `groupMarkersByCountry`; `data-testid={`marker-row-${mk.id}`}`; `aria-current` on selected; `aria-label={`Edit …`}`/`aria-label={`Delete …`}`; `AttachmentPopover` (`globeId`/`targetType="MARKER"`/`targetId`/`attachments`); `onSelect`/`onEdit`/`onDelete`; `categoryLabel`. **Keep BOTH Edit and Delete buttons visible** (do not hide delete on mobile — that removes functionality). Replace the local raw-hex `CATEGORY_HEX` dot with `categoryAccent(mk.category).dot` (import `categoryAccent` + `type Category` from `@/components/trip/category-pill`).

Target (App 483–487 / D7 361–365): country header = `font-display` bold name + count + hairline rule (no uppercase); rows separated by `border-b` (no outer `<ul>` border); hued category dot; coral-tinted selected row.

- [ ] **Step 1: Implement.**
  - Country header `<h3>`: `text-xs font-semibold uppercase tracking-wide text-muted-foreground` → wrap in `<div className="mb-1 flex items-center gap-2">` with `<h3 className="font-display text-[13px] font-bold text-foreground">{group.country}</h3>` + `<span className="text-[11px] text-muted-foreground">{group.markers.length}</span>` + `<span className="h-px flex-1 bg-border" aria-hidden />`.
  - `<ul>`: drop `rounded-xl border border-border`; keep `flex flex-col divide-y divide-border`.
  - Category dot: `style={{ background: CATEGORY_HEX[mk.category] }}` → `className={cn("inline-block size-2.5 shrink-0 rounded-full", categoryAccent(mk.category as Category).dot)}` (remove the `CATEGORY_HEX` const if now unused).
  - Selected row button: keep `aria-current`; change the selected highlight to `data-[current]`/conditional `bg-primary/5 rounded-xl` (a coral tint) instead of the current muted/ring — keep it simple (`isSelected && "bg-primary/5 rounded-xl"`); no negative-margin bleed.
  - Row title `text-sm font-medium` → `text-sm font-semibold`; keep the subtitle line + truncation.
  - Keep the Edit (`Pencil`) + Delete (`Trash2`) ghost icon buttons + `AttachmentPopover` exactly (aria-labels intact).
- [ ] **Step 2: Gates.** `npx tsc --noEmit`; `npx eslint components/globe/marker-list.tsx`; `npx vitest run components/globe/marker-list.test.tsx` (green — all behaviour tests + `data-testid`/aria unaffected); full `npx vitest run`.
- [ ] **Step 3: Commit** — `feat(globe): Bold-Modular country-grouped marker rail (E+ B5)` (+ trailer).

---

### Task 6: `GlobeView` desktop layout + page heading

**Files:** Modify `components/globe/globe-view.tsx` + `app/(app)/globe/page.tsx`.

**Preserve (globe-view):** all state (`filter`/`selectedId`/`formOpen`/`editing`/`prefill`/`openSeq`) + `openAdd`/`openEdit`/`openDrop`/`handleDelete`/`onSaved` + the `MarkerForm` `key={`${openSeq}-…`}` remount pattern + all props threaded to children. `GlobeMapLoader` is untouched internally — only its wrapper's height/radius classes change. Keep the "Share"/"Add Marker" actions in `GlobeView` (do NOT prop-drill to the page). Existing `globe-view.test.tsx` (mocks GlobeMapLoader → null, tests form remount) must stay green. **Preserve (page):** `requireGlobeAccess` + queries + the four props to `GlobeView` + `generateMetadata`.

Target (D7 328–367): action row (h1 + subtitle + Share/Add pills), then a `lg` two-column grid — map left (`1fr`), rail (filters + list) right (`330px`).

- [ ] **Step 1: `globe/page.tsx`** — `<h1 className="font-display text-2xl font-semibold tracking-tight">` → `font-display text-3xl font-bold tracking-tight`. (Optional subtitle: only add if the marker/country counts are trivially available from the already-fetched data; otherwise skip — do not add queries.)
- [ ] **Step 2: `globe-view.tsx` layout.**
  - Wrap the map + rail in a responsive grid below the actions row: `<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">`. Left cell: the `GlobeMapLoader` wrapper. Right cell: a `flex flex-col gap-3` column holding `<MarkerFilters/>` + `<MarkerList/>`.
  - `GlobeMapLoader` wrapper: add `overflow-hidden rounded-2xl border border-border shadow-soft` and a responsive height `h-[260px] sm:h-[440px] lg:h-[560px]` (adjust only the wrapper, never the map component).
  - Keep the actions row (`Share` + `Add Marker`) where it is (top), and keep `MarkerForm` + `{confirmDialog}` after the grid. Do NOT touch the `MarkerForm` key.
- [ ] **Step 3: Gates.** `npx tsc --noEmit`; `npx eslint components/globe/globe-view.tsx "app/(app)/globe/page.tsx"`; `npx vitest run components/globe/globe-view.test.tsx` (green — GlobeMapLoader mocked, form-remount test unaffected); full `npx vitest run`.
- [ ] **Step 4: Commit** — `feat(globe): desktop map+rail grid + heading (E+ B5)` (+ trailer).

---

## Verification (Definition of Done)
- `npx tsc --noEmit` clean; `npx eslint` clean on all touched files; full `npx vitest run` green (count grows by the TransportCountdown test; the Globe category-filter test is rewritten, not weakened).
- Home Travelling: bold "Today" header, `rounded-2xl` cards, emerald tonight's-stay, amber next-departure, timeline wrapper kept, quick-links kept.
- Home Past: dark "That's a wrap" hero (fixed dark, works light+dark), inline FINAL SPEND card, route map, coral+outline CTAs.
- Globe: pill search + category chip filters, Bold-Modular country rail (`categoryAccent` dots, no raw hex), desktop map+rail grid; Leaflet map + marker-form + invite button untouched.
- No behaviour/prop/action/aria/`data-testid` regressions; already-restyled children and shared primitives untouched.
- Visual pass (Cam, local dev) owed. Tick Home phases + Globe in the tracker → **all E+ screens complete → whole-program review → merge-gate STOP.**

## Self-Review Notes
- **Spec coverage:** Home Travelling (T3) + Past (T2) + TransportCountdown (T1); Globe filters (T4) + list (T5) + view/page (T6). C4/C2 anatomy preserved.
- **Deliberate skips (documented):** `marker-form.tsx` + `globe-invite-button.tsx` (already aligned via ⑤ primitives — verified in research); `phase-sketching.tsx` (already idiom-aligned); quick-links removal (navigation, out of scope); mobile delete-hide (would remove functionality). Leaflet map untouched (⑥).
- **Dark-mode correctness:** the Past hero uses a FIXED `bg-[hsl(24_14%_15%)]` (not `bg-foreground`, which inverts) so it stays dark in both themes — like the always-coral CountdownHero.
- **Ordering/deps:** T1 before T3 (T3's next-departure block relies on T1). T4 before T5/T6 not required (independent) but listed logically. T4 (chips) + T5 both reuse `categoryAccent`.
- **Test contracts:** TransportCountdown gains a class-regression test; Globe category test rewritten to chip clicks (same `onChange` contract) + placeholder updated; marker-list `data-testid`/aria untouched; phase wrappers are RSC (no tests).
- **Blind build:** class-string/behaviour regression tests are the guard; Cam's local pass is the fidelity check.
