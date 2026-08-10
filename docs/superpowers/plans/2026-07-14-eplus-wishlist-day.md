# E+ Batch 2 — Wishlist + Day Bold-Modular Rebuild

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the **Wishlist** and **Day detail** surfaces to the Bold-Modular mocks — presentationally. Every data path, server action, vote/schedule/optimistic behaviour, aria-label, and `data-testid` is preserved; only layout, card anatomy, chips, colours change.

**Architecture:** All targets are existing client components (or an async RSC page) that keep their props and behaviour. One shared foundation task adds a category **accent** class helper (dots + left-borders) alongside the existing `CategoryPill` colour map. The rest are self-contained restyles. Existing behaviour tests must stay green; each restyle adds a focused class-string regression assertion (the deliberate jsdom guard for this blind build).

**Tech Stack:** Next.js RSC + client components, Tailwind v4 (token-driven), `cn` (= `twMerge(clsx())`, so later classes override earlier — including `data-[state=on]:` variants), `class-variance-authority`, lucide-react, Radix Toggle Group (`Segmented`), Vitest + Testing Library.

## Global Constraints
- **Mocks:** `design_handoff/TEEPEE - Bold Modular App.dc.html` — Wishlist frame (~lines 327–410), Day frame (~lines 391–430). Anatomy also in `DESIGN-BRIEF.md` C6 (Day), C8 (Wishlist). Fidelity is Cam's local `npm run dev` pass; build to the mock, keep behaviour.
- **Preserve behaviour & contracts:** do NOT change any component's props/interface, server-action calls, callbacks, state, optimistic logic, `aria-label`s, `data-testid`s, or accessible roles. These restyles are presentation-only.
- **Category colours** use the Tailwind **named palette by design** (existing `CATEGORY_COLOR_CLASSES` in `category-pill.tsx`): SIGHTSEEING→`sky`, FOOD→`amber`, ACTIVITY→`emerald`, NIGHTLIFE→`violet`, SHOPPING→`rose`, OTHER→`stone`. New accent classes follow the SAME literal-string pattern (so Tailwind's scanner keeps them). No raw hex, no inline colour `style`, no new DB joins.
- **Semantic vote colours:** MUST → `warning` (amber token), KEEN → `accent` (teal token), MEH → `muted`. Under/over/caution semantics unchanged.
- **Maps are OUT of scope** (done in ⑥): do NOT touch `day-map.tsx`, `wishlist-map.tsx`, or the `*-map-loader.tsx` files. `DayMapPanel`'s outer shell is already `rounded-2xl` — leave it.
- **`ItemCard` is shared** (wishlist AND scheduled modes). Guard every wishlist-specific change behind `mode === "wishlist"`; changes that apply to both modes (card radius) are fine but must not break scheduled rendering.
- **`NearbyWishlist`, `SectionHeader`, `AiActivitySuggestions`, all dialogs, map/list view toggle** — unchanged. Do not modify the shared `SectionHeader` primitive (restyle the stop header inline in `WishlistBoard` instead).
- **Accessibility:** keep WCAG AA. Interactive controls keep ≥44px touch targets where they already have them (DayNav arrows stay `min-h-11 min-w-11`). Keep visible focus rings.
- **Environment (sandbox):** Node ≥22 (`export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use` if vitest errors on version). `next build`/`next dev` FAIL — do NOT run. Gates: `npx tsc --noEmit`, `npx eslint <files>`, `npx vitest run <focused>` then full `npx vitest run`.
- **Branch:** `feat/bold-modular-rest`. Never main/push/merge/deploy; never `git add` under `.superpowers/`. Commit-message trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure
- `components/trip/category-pill.tsx` — **modify** (T1: add `categoryAccent` export + accent map).
- `components/trip/category-pill.test.tsx` — **create/modify** (T1 test; create if absent).
- `components/trip/vote-control.tsx` + `.test.tsx` — **modify** (T2).
- `components/trip/globe-suggestions-strip.tsx` + `.test.tsx` — **modify** (T3).
- `components/trip/item-card.tsx` + `.test.tsx` — **modify** (T4).
- `components/trip/wishlist-board.tsx` — **modify** (T5, header region only).
- `components/trip/weather-daylight-card.tsx` + `.test.tsx` — **modify** (T6).
- `components/trip/day-nav.tsx` — **modify** (T7; test stays green unchanged).
- `components/trip/timeline.tsx` + `.test.tsx` — **modify** (T8, `isDay` branches only).
- `app/(app)/trips/[tripId]/day/[date]/page.tsx` — **modify** (T9, render layout); `components/trip/day-feasibility.tsx` — **modify** (T9, radius).

---

### Task 1: `categoryAccent` helper (shared foundation)

**Files:** Modify `components/trip/category-pill.tsx`; create `components/trip/category-pill.test.tsx` (or add to it if it exists).

**Interfaces — Produces:** `export function categoryAccent(category: Category): { dot: string; borderL: string }` — returns Tailwind class strings for a category-hued dot (`bg-<hue>-500`) and a left-border accent (`border-l-<hue>-500`). Consumed by T3 (globe strip dots) and T8 (timeline).

- [ ] **Step 1: Write the failing test** in `category-pill.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { categoryAccent } from "./category-pill";

describe("categoryAccent", () => {
  it("maps categories to hued dot + left-border classes", () => {
    expect(categoryAccent("FOOD")).toEqual({ dot: "bg-amber-500", borderL: "border-l-amber-500" });
    expect(categoryAccent("SIGHTSEEING")).toEqual({ dot: "bg-sky-500", borderL: "border-l-sky-500" });
    expect(categoryAccent("NIGHTLIFE")).toEqual({ dot: "bg-violet-500", borderL: "border-l-violet-500" });
    expect(categoryAccent("OTHER")).toEqual({ dot: "bg-stone-500", borderL: "border-l-stone-500" });
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run components/trip/category-pill.test.tsx`): `categoryAccent` not exported.

- [ ] **Step 3: Implement** — add to `category-pill.tsx` (after `CATEGORY_COLOR_CLASSES`), mirroring the existing literal-string pattern so Tailwind keeps the classes:

```tsx
// Accent classes (hued dot + 4px left-border) for timeline rows and globe-suggestion
// dots. Literal strings so Tailwind's content scanner keeps every variant.
const CATEGORY_ACCENT_CLASSES: Record<string, { dot: string; borderL: string }> = {
  sky: { dot: "bg-sky-500", borderL: "border-l-sky-500" },
  amber: { dot: "bg-amber-500", borderL: "border-l-amber-500" },
  emerald: { dot: "bg-emerald-500", borderL: "border-l-emerald-500" },
  violet: { dot: "bg-violet-500", borderL: "border-l-violet-500" },
  rose: { dot: "bg-rose-500", borderL: "border-l-rose-500" },
  stone: { dot: "bg-stone-500", borderL: "border-l-stone-500" },
};

const FALLBACK_ACCENT = { dot: "bg-muted-foreground", borderL: "border-l-border" };

/** Category-hued accent classes: a filled dot and a 4px left-border colour. */
export function categoryAccent(category: Category): { dot: string; borderL: string } {
  return CATEGORY_ACCENT_CLASSES[categoryMeta(category).color] ?? FALLBACK_ACCENT;
}
```

- [ ] **Step 4: Run → PASS.** Then `npx tsc --noEmit`, `npx eslint components/trip/category-pill.tsx components/trip/category-pill.test.tsx`, `npx vitest run` (full).

- [ ] **Step 5: Commit** — `feat(wishlist,day): add categoryAccent hued dot/border helper (E+ B2)` (+ trailer).

---

### Task 2: `VoteControl` — pill segmented with semantic active colours

**Files:** Modify `components/trip/vote-control.tsx` + `components/trip/vote-control.test.tsx`.

**Interfaces — preserve:** props `{ tripId, itemId, votes, currentUserId }`; `VoteView`; click-active→`clearVote`, click-inactive→`setVote` via `useTransition`; `isPending`→`pointer-events-none opacity-50`; `role="radio"` semantics + aria-labels + `title` on active item. All behaviour tests must pass unchanged.

Target (mock 347–365): pill segmented track (`rounded-full`); active MUST = amber fill, active KEEN = teal fill, active MEH = muted; partner chip = tinted pill with the avatar **inside** it.

- [ ] **Step 1: Add a class-string regression test** to `vote-control.test.tsx` (keep all existing tests):

```tsx
it("gives the active vote a semantic-hued pill", () => {
  const votes = [{ userId: "me", level: "MUST", user: { name: "Me", image: null } }];
  const { container } = render(
    <VoteControl tripId="t" itemId="i" votes={votes} currentUserId="me" />,
  );
  // pill track
  expect(container.querySelector(".rounded-full")).toBeTruthy();
  // active MUST segment carries the warning fill
  expect(container.querySelector('[data-state="on"]')?.className).toMatch(/bg-warning/);
});
```

(Use the same `votes`/`VoteView` shape the existing tests use — copy their fixture. If `level` needs a cast, mirror the existing tests.)

- [ ] **Step 2: Run → FAIL** (no `bg-warning` on the active item yet).

- [ ] **Step 3: Implement.** In `vote-control.tsx`:
  - Pass `className="rounded-full p-1"` to `<Segmented>` (track → pill).
  - For each `SegmentedItem`, add a per-level active override via `className` (twMerge makes it win over the base `data-[state=on]:bg-card`), plus pill shape + mock padding:
    - MUST: `"rounded-full px-2.5 py-1 text-xs data-[state=on]:bg-warning data-[state=on]:text-warning-foreground data-[state=on]:shadow-none"`
    - KEEN: `"rounded-full px-2.5 py-1 text-xs data-[state=on]:bg-accent data-[state=on]:text-accent-foreground data-[state=on]:shadow-none"`
    - MEH: `"rounded-full px-2.5 py-1 text-xs data-[state=on]:bg-muted-foreground/20 data-[state=on]:text-foreground data-[state=on]:shadow-none"`

    Build these with a small `const ACTIVE_CLASS: Record<VoteLevel, string> = {...}` and pass `className={cn("rounded-full px-2.5 py-1 text-xs", ACTIVE_CLASS[level])}`. Keep the emoji `span` (it is `aria-hidden`) OR drop it — either is test-safe; the mock is text-only, so dropping the visible emoji is acceptable. Keep `LEVEL_LABEL` text (drives the accessible name).
  - Partner chip: move the `<Avatar className="size-4">` INSIDE the chip `<span>` (before the label). Bump the tint from `/15` to `/20` (MUST `bg-warning/20 text-warning`, KEEN `bg-accent/20 text-accent`, MEH `bg-muted text-muted-foreground`), keep `rounded-full px-2 py-0.5 text-xs font-semibold`.

- [ ] **Step 4: Run focused test → PASS.** Then `npx tsc --noEmit`, `npx eslint components/trip/vote-control.tsx components/trip/vote-control.test.tsx`, `npx vitest run` (full — all VoteControl behaviour tests green).

- [ ] **Step 5: Commit** — `feat(wishlist): pill VoteControl w/ semantic active colours (E+ B2)` (+ trailer).

---

### Task 3: `GlobeSuggestionsStrip` — teal card with horizontal pill chips

**Files:** Modify `components/trip/globe-suggestions-strip.tsx` + `.test.tsx`.

**Interfaces — preserve:** props `{ tripId, suggestions, addedMarkerIds, onSeeMore }`; `SUGGESTIONS_CAP=5`; `justAdded`/`pending` optimistic logic; `visible`/`shown`/`overflow`; `handleAdd` → `addMarkerToWishlist(marker.id, tripId)` + toast; returns `null` when nothing visible. **Every add control keeps `aria-label={`Add ${marker.title}`}`; the overflow control stays a `<button>` whose text contains `${overflow} more`** (both are asserted by the existing tests — regex `/^add /i` and `/N more/i`).

Target (mock 335–342): teal-tinted card, small-caps teal label with a small `Globe2`, suggestions as horizontal `rounded-full` white pills each with a category dot, overflow inline.

- [ ] **Step 1: Run existing tests first** (`npx vitest run components/trip/globe-suggestions-strip.test.tsx`) to capture the green baseline; they must still pass after the change (no new test required — the aria-label/overflow-text contracts are the regression guard). Keep this as the acceptance check.

- [ ] **Step 2: Implement** in `globe-suggestions-strip.tsx`:
  - Root `<section>`: `"rounded-2xl bg-accent/10 p-3"` (drop `border`, `bg-card`, `shadow-sm`).
  - Header row: `Globe2` → `className="size-4 text-accent"`; replace the `<h3>` with `<span className="text-[11px] font-bold uppercase tracking-[0.06em] text-accent">From your Globe</span>`.
  - Replace the `<ul className="flex flex-col gap-2">`/`<li>` list with `<div className="mt-2 flex flex-wrap items-center gap-2">`. Each suggestion becomes a pill **button** (keeping the add wiring + aria-label):

```tsx
{shown.map((marker) => {
  const accent = categoryAccent(marker.category); // import from ./category-pill
  return (
    <button
      key={marker.id}
      type="button"
      onClick={() => handleAdd(marker)}
      disabled={pending}
      aria-label={`Add ${marker.title}`}
      className="inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-soft transition-colors hover:bg-background/70 disabled:opacity-50"
    >
      <span className={cn("size-1.5 rounded-full", accent.dot)} aria-hidden="true" />
      {marker.title}
      <Plus className="size-3" aria-hidden="true" />
    </button>
  );
})}
{overflow > 0 && (
  <button
    type="button"
    onClick={onSeeMore}
    className="px-1 text-xs font-semibold text-accent hover:underline"
  >
    +{overflow} more
  </button>
)}
```

  Import `cn` and `categoryAccent` (from `./category-pill`). Confirm `MarkerView` has a `category` field usable by `categoryAccent`; if the field is optional/nullable, guard with a fallback (`marker.category ? categoryAccent(marker.category).dot : "bg-muted-foreground"`). Keep all other logic verbatim.

- [ ] **Step 3: Gates.** `npx tsc --noEmit`, `npx eslint components/trip/globe-suggestions-strip.tsx`, `npx vitest run components/trip/globe-suggestions-strip.test.tsx` (green), then full `npx vitest run`.

- [ ] **Step 4: Commit** — `feat(wishlist): globe-suggestions teal card + pill chips (E+ B2)` (+ trailer).

---

### Task 4: `ItemCard` — Bold-Modular wishlist card

**Files:** Modify `components/trip/item-card.tsx` + `.test.tsx`.

**Interfaces — preserve:** all props (`item, mode, isPending, onEdit, onDelete, onSchedule, onUnschedule, costs, tripId, homeCurrency, notes, votes, currentUserId, attachments`); the guard symmetry for `NoteThread`/`AttachmentPopover`/`VoteControl`/`CostEditor`; `isPending → pointer-events-none opacity-60`; every `aria-label` (incl. `Schedule ${item.title}`, `Attachment…`). Scheduled-mode rendering must not regress.

Target (mock 346–366, wishlist mode): white card `rounded-3xl` (no border), category pill top-right of the title row, vote row inline (no `border-t`), a **full-width coral "Schedule this" button** at the bottom. Keep Edit/Delete/NoteThread/AttachmentPopover as a small trailing icon cluster.

- [ ] **Step 1: Add a class-string regression test** to `item-card.test.tsx` (keep existing tests). Use the existing test's item fixture shape:

```tsx
it("renders a full-width coral Schedule button in wishlist mode", () => {
  const onSchedule = vi.fn();
  render(<ItemCard {/* existing wishlist fixture props */} mode="wishlist" onSchedule={onSchedule} />);
  const btn = screen.getByRole("button", { name: /schedule/i });
  expect(btn.className).toMatch(/w-full/);
  expect(btn.className).toMatch(/bg-primary/);
});
```

(Copy the exact prop fixture from the file's existing wishlist-mode render so types line up.)

- [ ] **Step 2: Run → FAIL** (current Schedule button is a ghost `h-7 px-2`, not `w-full bg-primary`).

- [ ] **Step 3: Implement** (wishlist-mode changes guarded by `mode === "wishlist"`):
  - Root `<div>`: `rounded-xl border border-border/60 bg-card px-4 py-3 shadow-soft` → `rounded-3xl bg-card p-3.5 shadow-soft` (drop the border; `p-3.5`≈14px). This applies to both modes (safe — scheduled cards also get the chunkier radius).
  - Title `<h4>`: `text-base` → `text-[15px]`, keep `truncate font-display font-semibold`.
  - Move `<CategoryPill size="sm" />` from its own row up into the title row's right side (replace the old Schedule-ghost slot). Keep the small Edit/Delete/NoteThread/AttachmentPopover icon buttons in that same top-right cluster (do NOT remove them — they carry tested aria-labels).
  - Remove the old ghost Schedule button from the top-right cluster.
  - Remove the `border-t border-border/40 pt-2` wrapper around `<VoteControl>` (render it inline).
  - Add, at the very bottom, only when `mode === "wishlist" && onSchedule`:

```tsx
<button
  type="button"
  onClick={() => onSchedule(item)}
  aria-label={`Schedule ${item.title}`}
  className="mt-1 w-full rounded-xl bg-primary py-2.5 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
>
  Schedule this
</button>
```

    (There must be exactly ONE control with `aria-label={`Schedule ${item.title}`}` — the old ghost button is removed, so no duplicate role/name.)

- [ ] **Step 4: Run focused test → PASS.** Then `npx tsc --noEmit`, `npx eslint components/trip/item-card.tsx components/trip/item-card.test.tsx`, `npx vitest run` (full — item-card + wishlist-board tests green; the board test finds the Schedule button by role/name).

- [ ] **Step 5: Commit** — `feat(wishlist): Bold-Modular ItemCard + full-width Schedule (E+ B2)` (+ trailer).

---

### Task 5: `WishlistBoard` — stop-group header + title

**Files:** Modify `components/trip/wishlist-board.tsx` (header region + per-stop section header only).

**Interfaces — preserve:** the entire `WishlistBoardProps`, all state, `grouped`/`placedSet`/`stopsToShow`, the `placed-marker-{id}` `data-testid` span, all dialogs, list/map toggle, `AiActivitySuggestions`, `AnimatedList`. Do NOT modify the shared `SectionHeader` component.

Target: title-only board header (drop the subtitle `<p>`); each stop group headed by an inline row — stop name in `font-display text-sm font-bold` + a muted count — instead of `<SectionHeader icon={<MapPin/>} …>`.

- [ ] **Step 1: Implement.**
  - In the board header, delete the descriptive subtitle `<p className="text-sm text-muted-foreground">…</p>` under the "Wishlist" `<h2>`. Keep the `<h2>`, the `Segmented` List/Map toggle, "Add from Globe", and `AddItemButton`.
  - Replace each per-stop `<SectionHeader icon={<MapPin … />} title={stop.name} count={n} />` with an inline header (keep the same `title`/count data):

```tsx
<div className="flex items-baseline gap-2 px-1">
  <h3 className="font-display text-sm font-bold text-foreground">{stop.name}</h3>
  <span className="text-xs font-medium text-muted-foreground">{n} {n === 1 ? "idea" : "ideas"}</span>
</div>
```

    Apply the same to the "Anywhere" group header (its current `icon={<Heart/>}` + title). Use the group's existing count variable.
  - Leave the `MapPin`/`Heart` imports only if still used elsewhere; otherwise remove now-unused imports (eslint will flag them).

- [ ] **Step 2: Gates.** `npx tsc --noEmit`, `npx eslint components/trip/wishlist-board.tsx`, `npx vitest run components/trip/wishlist-board.test.tsx` (green — it mocks ItemCard and asserts behaviour/`data-testid`, not headers), then full `npx vitest run`.

- [ ] **Step 3: Commit** — `feat(wishlist): title-only header + inline stop-group headers (E+ B2)` (+ trailer).

---

### Task 6: `WeatherDaylightCard` — sky→teal gradient card

**Files:** Modify `components/trip/weather-daylight-card.tsx` + `.test.tsx`.

**Interfaces — preserve:** props `{ weather: DayWeather | null, daylight }`; all conditional rendering (forecast/typical, polar day/night, normal); the Open-Meteo attribution (legally required — keep it in the DOM). All existing text-content tests must pass (temps, label, "typical", times, tz, polar strings).

Target (mock 402–406): `rounded-2xl` card with a `bg-gradient-to-br from-sky-500 to-teal-500` fill, white text; left = sun icon + `high° / low°` (`font-display text-2xl font-bold`) + condition label; a `w-px bg-white/30` divider; right = three small bold lines (↑ sunrise, ↓ sunset, daylight length). Attribution kept as a tiny caption below the card (`text-[10px] text-muted-foreground`) so it stays visible and legal.

- [ ] **Step 1: Add a class-string regression test** to `weather-daylight-card.test.tsx` (keep existing tests):

```tsx
it("renders the weather as a gradient card with white text", () => {
  const { container } = render(<WeatherDaylightCard {/* existing normal-weather fixture */} />);
  const card = container.querySelector(".bg-gradient-to-br");
  expect(card).toBeTruthy();
  expect(card?.className).toMatch(/from-sky-500/);
  expect(card?.className).toMatch(/text-white/);
});
```

(Reuse the fixture the existing "shows temps" test builds.)

- [ ] **Step 2: Run → FAIL** (no gradient card yet).

- [ ] **Step 3: Implement.** Reskin the wrapper + interior; keep ALL logic and the conditional branches:
  - Outer: `"flex gap-3 rounded-2xl bg-gradient-to-br from-sky-500 to-teal-500 p-4 text-white shadow-soft-lg"`.
  - Left block (`flex-1`): `<Sun className="size-6 shrink-0" aria-hidden />` + `<span className="font-display text-2xl font-bold">{high}° / {low}°</span>`, condition label below in `text-xs opacity-90` (append "· typical" when `weather.source === "typical"` — keep the word "typical" in the DOM). When `weather === null`, omit the left block and the divider (daylight fills the card).
  - Divider: `<div className="w-px self-stretch bg-white/30" aria-hidden />` (only when both blocks present).
  - Right block: `flex flex-col justify-center gap-1 text-xs font-semibold`; the three daylight lines (`↑ {sunrise} sunrise`, `↓ {sunset} sunset`, `{dayLength} daylight` with `opacity-85` on the last). Preserve the polar-day / polar-night alternate strings exactly as today.
  - Attribution: render the existing Open-Meteo `<p>`/link BELOW the gradient card as `className="mt-1 text-[10px] text-muted-foreground"` (keep the link + text so the legal notice remains and any text assertion still finds it).

- [ ] **Step 4: Run focused test → PASS.** Then `npx tsc --noEmit`, `npx eslint components/trip/weather-daylight-card.tsx components/trip/weather-daylight-card.test.tsx`, `npx vitest run` (full — all 6+ existing tests green).

- [ ] **Step 5: Commit** — `feat(day): sky→teal gradient WeatherDaylightCard (E+ B2)` (+ trailer).

---

### Task 7: `DayNav` — borderless pill label + rounded icon buttons

**Files:** Modify `components/trip/day-nav.tsx` (existing test must stay green **unchanged** — do not edit `day-nav.test.tsx`).

**Interfaces — preserve:** props `{ tripId, currentDate, startDate, endDate }`; prev/next `Link`s with their `aria-label`s and `href`s; the `daysBetween`/"Day N of M" computation; the Calendar link (keep it, may be visually understated). **Keep `min-h-11 min-w-11` on the prev link (the test asserts it) — and apply the same ≥44px target to the next link for symmetry/AA.**

Target (mock 394): drop the card wrapper; "Day N of M" becomes a muted rounded-full pill; prev/next become `rounded-xl` bordered icon buttons — but at a 44px tap target (accessible), not the mock's 32px.

- [ ] **Step 1: Implement.**
  - `<nav>`: `"flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5"` → `"flex items-center justify-between gap-2"` (remove card chrome).
  - Prev/Next `Link`s: `"flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-muted"` (keep `min-h-11 min-w-11`, keep the icon, keep the existing `aria-label`). Icon-only is fine — ensure the accessible name still comes from `aria-label`.
  - Centre block: "Day N of M" → `<span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">Day {n} of {m}</span>`; keep the "Calendar" `Link` beneath/beside it as `text-xs text-muted-foreground hover:underline` (understated, still present for navigation).
  - Keep `aria-label="Day navigation"` (or existing) on `<nav>`.

- [ ] **Step 2: Gates.** `npx tsc --noEmit`, `npx eslint components/trip/day-nav.tsx`, `npx vitest run components/trip/day-nav.test.tsx` (MUST stay green — `min-h-11`/`min-w-11` preserved), then full `npx vitest run`.

- [ ] **Step 3: Commit** — `feat(day): borderless DayNav pill + rounded icon buttons (E+ B2)` (+ trailer).

---

### Task 8: `Timeline` — Bold-Modular day rows (`isDay` only)

**Files:** Modify `components/trip/timeline.tsx` + `.test.tsx`. **Only the `isDay` (variant="day") branches change; the `variant="agenda"` paths must be byte-for-behaviour unchanged.**

**Interfaces — preserve:** props `{ day, variant?, itemDirections?, attachmentsByTarget? }`; all sub-entry logic (`TransportRow`, `TimedItemRow`, `UntimedItemRow`, `AccomCheckinRow`, `AccomCheckoutRow`, `TimeGutter`, `DirectionsLink`, `AttachmentLinks`); multi-day notice; empty state; the `CategoryPill`. **Keep the pinned test classes:** `TimeGutter` keeps `w-9` (+ `sm:w-11`); item titles keep `truncate`/`break-words` + the `title=` attribute. Import `categoryAccent` from `./category-pill`.

Target (mock 408–428): timed items = white `rounded-2xl` cards with a **4px category-hued left border** + category pill; untimed items = **dashed-border** rows with a category dot; accommodation = emerald (check-in) / rose (check-out) filled pills (no hard border).

- [ ] **Step 1: Add class-string regression tests** to `timeline.test.tsx` (keep all existing tests). Use the existing tests' `DayPlan` fixture shape (copy an entry with a category + startTime, and one untimed):

```tsx
it("day timed rows get a category-hued left border card", () => {
  const { container } = render(<Timeline day={/* fixture w/ a timed FOOD item */} variant="day" />);
  expect(container.querySelector(".border-l-4.border-l-amber-500")).toBeTruthy();
});
it("day untimed rows use a dashed border", () => {
  const { container } = render(<Timeline day={/* fixture w/ an untimed item */} variant="day" />);
  expect(container.querySelector(".border-dashed")).toBeTruthy();
});
```

- [ ] **Step 2: Run → FAIL** (no `border-l-4`/`border-dashed` day rows yet).

- [ ] **Step 3: Implement** (guard every change to the `isDay` branch; leave agenda untouched):
  - **TimedItemRow (isDay):** wrap the content in a card: `cn("flex-1 rounded-2xl border-l-4 bg-card px-3 py-2.5 shadow-soft", categoryAccent(item.category).borderL)`. Inside: title row = `<span>` title (keep `truncate` + `title={item.title}`) with `text-sm font-bold` + `<CategoryPill category={item.category} size="sm" />` to its right; a subline `text-xs text-muted-foreground` with the time label (+ address if present). Keep the `TimeGutter` (w-9 sm:w-11) to the left, `DirectionsLink` and `AttachmentLinks` where they are.
  - **UntimedItemRow (isDay):** row = `"flex-1 flex items-center gap-2 rounded-2xl border border-dashed border-border/70 px-3 py-2.5"`; lead with `<span className={cn("size-2 shrink-0 rounded-full", categoryAccent(item.category).dot)} />` then the title (`text-sm text-foreground/90`, keep `truncate`/`title=`), then `DirectionsLink`/`AttachmentLinks`. Keep the left gutter cell (may show "Any" or stay blank — keep whatever the current untimed gutter renders, unchanged width `w-9 sm:w-11`).
  - **AccomCheckinRow (isDay):** `bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 …` → `"rounded-2xl bg-emerald-100 px-3 py-2.5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"` (drop the hard border; keep the `LogIn` icon + text).
  - **AccomCheckoutRow (isDay):** same treatment in rose: `"rounded-2xl bg-rose-100 px-3 py-2.5 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"` (keep `LogOut` icon + text).
  - **TransportRow (isDay):** keep the current understated `bg-primary/5 border border-primary/10 rounded-lg` treatment, but bump `rounded-lg` → `rounded-2xl` for consistency. No other change.
  - Outer day list wrapper stays `flex flex-col gap-3`.

- [ ] **Step 4: Run focused tests → PASS** (`npx vitest run components/trip/timeline.test.tsx` — new + all existing, incl. the `w-9`/`truncate`/`break-words`/directions tests). Then `npx tsc --noEmit`, `npx eslint components/trip/timeline.tsx components/trip/timeline.test.tsx`, full `npx vitest run`.

- [ ] **Step 5: Commit** — `feat(day): Bold-Modular timeline rows (left-border cards, dashed untimed) (E+ B2)` (+ trailer).

---

### Task 9: Day page layout + `DayFeasibility` radius

**Files:** Modify `app/(app)/trips/[tripId]/day/[date]/page.tsx` (render layout only) and `components/trip/day-feasibility.tsx` (radius).

**Interfaces — preserve:** all page data fetching/computation, all child props (`DayNav`, `WeatherDaylightCard`, `DayMapPanel`, `NearbyWishlist`, `DayFeasibility`, `Timeline variant="day"`, `AddItemButton`, `JournalEditor`); `DayFeasibility` props + empty-returns-null. No page test exists; `day-feasibility.test.tsx` is text-content only (radius change is invisible to it) — keep it green.

- [ ] **Step 1: Day page render tweaks** (no logic change):
  - Outer container `gap-6` → `gap-4`.
  - Date `<h2>`: `text-2xl font-semibold` → `text-3xl font-bold tracking-tight` (keep `font-display text-foreground`).
  - **Remove** the `<div className="rounded-xl border border-border bg-card px-4 py-4">` wrapper around `<Timeline variant="day" …>` — render `<Timeline>` directly (its rows are now individually carded). Keep the quick-add strip and `JournalEditor` exactly as-is.
- [ ] **Step 2: `DayFeasibility` radius:** `rounded-xl` → `rounded-2xl` on its card wrapper (keep border + `bg-card`; keep the heading, severity icons, and semantic colours).
- [ ] **Step 3: Gates.** `npx tsc --noEmit`, `npx eslint "app/(app)/trips/[tripId]/day/[date]/page.tsx" components/trip/day-feasibility.tsx`, then full `npx vitest run` (green, unchanged count — `day-feasibility` text tests still pass).
- [ ] **Step 4: Commit** — `feat(day): tighter day layout, flush timeline, chunkier feasibility (E+ B2)` (+ trailer).

---

## Verification (Definition of Done)
- `npx tsc --noEmit` clean; `npx eslint` clean on all touched files; full `npx vitest run` green (count grows by the added regression tests; no test removed or weakened).
- Wishlist: teal globe-suggestions strip with pill chips; title-only header + inline stop headers; Bold-Modular ItemCards with category pill top-right, inline pill VoteControl (amber MUST / teal KEEN), full-width coral "Schedule this".
- Day: gradient weather card; borderless DayNav (44px targets kept); flush timeline with hued left-border timed cards, dashed untimed rows, emerald/rose accommodation; tighter page rhythm.
- No behaviour/prop/action/aria/`data-testid` changes; maps untouched; `SectionHeader` untouched; agenda timeline variant untouched.
- Visual pass (Cam, local dev) owed. Tick Wishlist + Day in the tracker.

## Self-Review Notes
- **Spec coverage:** Wishlist (globe strip T3, header T5, ItemCard T4, VoteControl T2) + Day (weather T6, nav T7, timeline T8, page T9), shared accent helper T1. C8/C6 anatomy preserved.
- **Ordering/deps:** T1 first (T3 + T8 import `categoryAccent`). T2, T4–T7, T9 independent; run in listed order.
- **Type consistency:** `categoryAccent(category)` returns `{ dot, borderL }` — used identically in T3 (`.dot`) and T8 (`.borderL`, `.dot`). `Segmented`/`SegmentedItem` accept `className`; `cn`=`twMerge` so `data-[state=on]:bg-warning` overrides the base `data-[state=on]:bg-card`.
- **Test-contract risks flagged in each task:** DayNav keeps `min-h-11 min-w-11`; Timeline keeps `w-9`/`truncate`/`break-words`/`title`; GlobeStrip keeps `aria-label="Add …"` + overflow-`<button>` "N more"; ItemCard keeps exactly one `aria-label="Schedule …"`. No placeholder classes — every class string is literal so Tailwind keeps it.
- **Blind build:** unverifiable visually in-sandbox; class-string regression assertions are the guard, Cam's local pass is the fidelity check.
