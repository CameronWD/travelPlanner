# Beta feedback: design and features lot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 24 remaining beta Feedback notes of 2026-09-26 (spec sections A–I) on one branch, one reviewable commit per note.

**Architecture:** Eighteen tasks. Data first (Category Place; four additive Prisma migrations: Reminder.stopId, Cost.settlement, Item.hiddenFromShares, Trip.forksEnabled + coverFocal), then plan-editor components (grouping, day rows, dialog size, Stop card), then desktop layouts (Trips list, Trip home grid + cover tile + bounded map, rail everywhere + More page), then Days/day-page polish, motion, the landing page, and a final verification pass. Every layout change is `md`/`lg`-only; phone layouts are untouched. Tests are colocated `*.test.ts(x)` under vitest + jsdom; `db` is always mocked in tests (the sandbox has no Postgres).

**Tech Stack:** Next.js App Router (this version differs from training data: read `node_modules/next/dist/docs/` for any API you touch), React 19, TypeScript, Tailwind v4, Prisma (schema + SQL migrations; never applied here), Radix, Leaflet, `motion` (v12), vitest + Testing Library.

**Spec:** `docs/specs/2026-09-26-beta-feedback-design.md` (binding). Glossary: `CONTEXT.md` (already updated for this lot). Kit references: `design_handoff/playground-2/reference/ui_kits/teepee-desktop/{DPlan,DHome,DTrips,DLanding,Shell}.jsx`.

## Global Constraints

- Branch `feat/beta-feedback-design-2026-09-26` (checked out, cut from `beta`). Never commit to `beta`/`main`/`master`; never deploy; never run `npm run feedback:pull` or `feedback:resolve`. `CLAUDE.md` shows modified in the tree (a `next dev` block) — never stage it.
- **Phone layouts unchanged.** Rail, home grid, Trips list row, Stop card row, wide dialogs, More page and header changes apply from `md` (rail) or `lg` (grids) only. Bottom tab bar + its More sheet, single-column Home, single-column plan editor, bottom-sheet dialogs stay as they are. Each layout task's tests assert the phone classes are untouched where a class string is exported.
- Playground system (ADR 0060/0061/0062): paper and ink, 2px `border-border` outlines, `shadow-hard-*`, the 9-hue ramp via `HUE_CLASSES` (`lib/hues.ts`), `Card` tones (`components/ui/card.tsx`), content ≤ `max-w-page-wide`. Hex only in `lib/map-palette.ts`.
- Vocabulary: `CONTEXT.md`. UI copy never says "activity", "event", "hotel", "city", or "stay" (except the heading "Where you're staying"). New terms already defined there: **Place**, **Settlement** (Before you go / On the trip), **hidden from shares**, **plan variants toggle**, Reminder **about a Stop**.
- Migrations: SQL files under `prisma/migrations/2026092700000N_<slug>/migration.sql`, additive only (nullable or defaulted columns; no renames/drops), with the DEPLOY.md §4b comment header like `20260921120000_user_whats_new_seen_at`. After a schema edit run `npx prisma validate && npx prisma generate`. They are **not applied** by this work.
- Commit trailers: each closing commit ends with a blank line, then a contiguous block: `Resolves-Feedback: <id>` line(s), then the Co-Authored-By line your harness mandates (the controller normalises it). Stage only files you changed.
- Before each commit: the task's test command and `npx tsc --noEmit`. Task 17 runs the full suite and lint.
- Reduced motion: every animation respects `MotionConfig reducedMotion="user"` / `useReducedMotion`.

## Review Focus

- **A Wishlist idea with the new `PLACE` category scheduled onto a day** must render on the Timeline with a tile/icon (categories map to lucide icons in `timeline.tsx`'s `CATEGORY_ICON`); a missing icon entry would crash the day page. Test in Task 1.
- **A Stop with no Accommodation and rough dates** must show "No bed yet" without offering a date-dependent add (the existing rough-Stop explanation dialog stays). Test in Task 5.
- **A Cost created by the old build during the migrate-then-build window** has `settlement` defaulted `BEFORE` by the column default; the budget split must treat missing/unknown values as `BEFORE`. Test in Task 8.
- **A share link with all three dials on** must still omit a hidden Item; and hiding an Item must not remove it from the plan editor, the day page or the calendar. Tests in Task 9.
- **A Trip with `forksEnabled=false` but `?plan=<forkId>` in the URL** (an old link) must show the real plan, not the Fork, and must not crash. Test in Task 10.

---

### Task 1: Category **Place**, and "Not tied to a Stop yet"

**Files:**
- Modify: `lib/categories.ts:22-31`, `lib/categories.test.ts`
- Modify: `components/trip/timeline.tsx` (`CATEGORY_ICON` map — add the new icon), `components/trip/timeline.test.tsx`
- Modify: `components/trip/wishlist-board.tsx:389-391` (heading), `components/trip/wishlist-board.test.tsx`
- Check: every `Record<Category, …>` in the repo compiles (grep `Record<Category`) — add the `PLACE` entry where TypeScript demands.

**Interfaces:**
- Produces: `CATEGORIES` gains `{ value: "PLACE", label: "Place", color: "teal", hue: "teal", icon: "map-pin" }` inserted before `OTHER`. `Category` union gains `"PLACE"`. `categorySchema` accepts it. Timeline's icon map gains `"map-pin": MapPin`.

- [ ] **Step 1: Failing tests**

`lib/categories.test.ts` — add:
```ts
it("includes Place (somewhere to go) before Other, on the teal hue with a map-pin icon", () => {
  const values = CATEGORIES.map((c) => c.value);
  expect(values.indexOf("PLACE")).toBe(values.indexOf("OTHER") - 1);
  expect(categoryMeta("PLACE")).toMatchObject({ label: "Place", hue: "teal", icon: "map-pin" });
  expect(categorySchema.safeParse("PLACE").success).toBe(true);
});
```
`components/trip/timeline.test.tsx` — add a timed item with `category: "PLACE"` to a small DayPlan and assert the row renders its title (no throw). `components/trip/wishlist-board.test.tsx` — replace any assertion on the text "Anywhere" with `"Not tied to a Stop yet"` and add one asserting the heading text when an idea has no Stop.

- [ ] **Step 2: Run** `npx vitest run lib/categories.test.ts components/trip/timeline.test.tsx components/trip/wishlist-board.test.tsx` → FAIL.
- [ ] **Step 3: Implement** — insert the `PLACE` row in `CATEGORIES` (comment: "Somewhere to go rather than something to do — a city, town, region or island, before it becomes a Stop (CONTEXT.md 'Place')."); in `timeline.tsx` import `MapPin` from lucide and add `"map-pin": MapPin` to `CATEGORY_ICON`; in `wishlist-board.tsx` change `renderGroupHeader("Anywhere", …)` to `renderGroupHeader("Not tied to a Stop yet", …)` and the comment above it. Run `npx tsc --noEmit` and fix any exhaustive `Record<Category, …>`.
- [ ] **Step 4: Run** the three test files + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```
feat(categories): add Place; Wishlist group reads "Not tied to a Stop yet"

"Paris" was filed as Other because Categories only described things to do.
Place is somewhere to go. "Anywhere" named the no-Stop group badly.

Resolves-Feedback: cmuhtul0o000004jw4x36ndv1
```

---

### Task 2: Things to do grouped by Category with real chips

**Files:**
- Create: `lib/group-by-category.ts`, `lib/group-by-category.test.ts`
- Modify: `components/trip/stop-card.tsx:529-608` (things-to-do list), `components/trip/stop-card.test.tsx`
- Modify: `components/trip/stop-day-list.tsx:266` (expanded day rows: chip instead of dot)
- Modify: `components/trip/timeline.tsx` Anytime bucket (group by Category), `components/trip/timeline.test.tsx`

**Interfaces:**
- Produces: `groupByCategory<T extends { category: string }>(items: T[]): { category: Category; label: string; items: T[] }[]` — groups in `CATEGORIES` order, omits empty groups, unknown category → `OTHER`.

- [ ] **Step 1: Failing tests**

`lib/group-by-category.test.ts`:
```ts
import { groupByCategory } from "./group-by-category";
it("groups in CATEGORIES order, omits empty groups, and files unknown values under Other", () => {
  const groups = groupByCategory([
    { id: "a", category: "OTHER" }, { id: "b", category: "FOOD" }, { id: "c", category: "SIGHTSEEING" },
    { id: "d", category: "FOOD" }, { id: "e", category: "WHAT" },
  ]);
  expect(groups.map((g) => g.category)).toEqual(["SIGHTSEEING", "FOOD", "OTHER"]);
  expect(groups[1].items.map((i) => i.id)).toEqual(["b", "d"]);
  expect(groups[2].items.map((i) => i.id)).toEqual(["a", "e"]);
  expect(groups[1].label).toBe("Food & Drink");
});
```
`stop-card.test.tsx`: render a scheduled Stop with three things to do (FOOD, SIGHTSEEING, FOOD); assert headings "Sightseeing" then "Food & Drink" appear in that order (`getAllByRole("heading", { level: 4 })` or a `data-testid="things-group"` per group) and that each row contains a `CategoryPill` (text "Food & Drink" inside the row) and **no** element with `data-testid="thing-dot"`. `timeline.test.tsx`: a day with two untimed items of different categories renders two group labels under "Anytime" in `CATEGORIES` order.

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**

`lib/group-by-category.ts`:
```ts
import { CATEGORIES, type Category } from "@/lib/categories";
export interface CategoryGroup<T> { category: Category; label: string; items: T[] }
/** Groups in the canonical CATEGORIES order, dropping empty groups; unknown values file under Other. */
export function groupByCategory<T extends { category: string }>(items: T[]): CategoryGroup<T>[] {
  const known = new Set<string>(CATEGORIES.map((c) => c.value));
  const buckets = new Map<Category, T[]>();
  for (const it of items) {
    const key = (known.has(it.category) ? it.category : "OTHER") as Category;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(it);
  }
  return CATEGORIES.filter((c) => buckets.has(c.value)).map((c) => ({ category: c.value, label: c.label, items: buckets.get(c.value)! }));
}
```
`stop-card.tsx`: replace the flat `<ul>` with one `<section data-testid="things-group">` per group: `<h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</h4>` then the rows; each row swaps the dot for `<CategoryPill category={thing.category as Category} size="sm" />` (import from `./category-pill`). Keep the DayPickerMenu/Edit buttons unchanged. `stop-day-list.tsx:266` (expanded rows): same swap. `timeline.tsx` Anytime: wrap `anytime` rows in `groupByCategory(anytime.map(e => e.item))` groups with the same `h4` label style (keys by item id).

- [ ] **Step 4: Run** `npx vitest run lib/group-by-category.test.ts components/trip/stop-card.test.tsx components/trip/stop-day-list.test.tsx components/trip/timeline.test.tsx components/trip/agenda-view.test.tsx` + tsc → PASS.
- [ ] **Step 5: Commit**
```
feat(plan): things to do grouped by Category, with real chips

Resolves-Feedback: cmuhue58l000304lcb3uloihi
```

---

### Task 3: Collapsed day rows fill their width

**Files:**
- Create: `components/trip/fit-titles.ts`, `components/trip/fit-titles.test.ts`
- Modify: `components/trip/stop-day-list.tsx:39,118-156`, `components/trip/stop-day-list.test.tsx`

**Interfaces:**
- Produces: `fitTitles(titles: string[], widthPx: number, opts?: { charPx?: number; gapPx?: number; overflowPx?: number }): { shown: number }` — pure: how many titles fit at ~6.5px per character (`charPx`), 8px gap, reserving 32px for "+N" when not all fit. Component measures the preview span with `ResizeObserver` (via `useSyncExternalStore` or a `useLayoutEffect` + state; SSR renders `PREVIEW_COUNT = 2` as today).

- [ ] **Step 1: Failing tests** — `fit-titles.test.ts`:
```ts
it("shows all titles when they fit, else as many as fit leaving room for +N", () => {
  expect(fitTitles(["Louvre", "Lunch"], 400).shown).toBe(2);
  expect(fitTitles(["A very long museum name", "Another long dinner name", "Third"], 200).shown).toBe(1);
  expect(fitTitles([], 300).shown).toBe(0);
  expect(fitTitles(["x"], 0).shown).toBe(1); // never hide the first title
});
```
`stop-day-list.test.tsx`: the chevron is the last child of the row button and the preview span has `justify-between`-free, `flex-1 min-w-0` classes and `data-testid="day-preview"`; the "+N" span is present only when `shown < all.length`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — `fitTitles` (greedy sum of `title.length * charPx + gapPx`, reserving `overflowPx` when a remainder would exist; minimum 1). In `StopDayList` add a `useElementWidth(ref)` hook (ResizeObserver; returns 0 on the server) and compute `shown = width ? fitTitles(all.map(i => i.title), width).shown : PREVIEW_COUNT`. Row: preview `<span ref data-testid="day-preview" className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">` with each title `truncate`; chevron stays `ml-auto shrink-0`.
- [ ] **Step 4: Run** `npx vitest run components/trip/fit-titles.test.ts components/trip/stop-day-list.test.tsx` + tsc → PASS.
- [ ] **Step 5: Commit**
```
fix(plan): day rows show as many titles as fit, +N only for the overflow

Resolves-Feedback: cmuhuqi5w000004i4wy0gfub6
```

---

### Task 4: Wide two-column entity dialogs

**Files:**
- Modify: `components/ui/dialog.tsx:66-80` (`size` prop), `components/ui/dialog.test.tsx`
- Modify: `app/globals.css:350` (add `--container-dialog-lg: 44rem`)
- Modify: `components/ui/form-dialog.tsx` (`size` passthrough)
- Modify: `components/trip/item-form-dialog.tsx`, `transport-form-dialog.tsx`, `accommodation-form-dialog.tsx` (use `size="lg"`; wrap fields in `sm:grid sm:grid-cols-2 sm:gap-x-4` with full-width rows for Title, Category, Notes, Attachments, cost fields)

**Interfaces:**
- `DialogContent` gains `size?: "md" | "lg"` (default `md`); `lg` swaps `sm:max-w-dialog` for `sm:max-w-dialog-lg`. `FormDialog` gains `size?: "md" | "lg"`.

- [ ] **Step 1: Failing tests** — `dialog.test.tsx`: `<DialogContent size="lg">` root has class `sm:max-w-dialog-lg` and not `sm:max-w-dialog`; default keeps `sm:max-w-dialog`; both keep `max-h-[90dvh]` and `sm:max-h-[85vh]`. `item-form-dialog.test.tsx`: the form element has class `sm:grid-cols-2`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — in `globals.css` next to `--container-dialog: 30rem` add `--container-dialog-lg: 44rem` (Tailwind v4 then emits `sm:max-w-dialog-lg`). In `DialogContent`, `size === "lg" ? "sm:max-w-dialog-lg" : "sm:max-w-dialog"`. Thread through `FormDialog`. In each of the three forms: `<form className="flex flex-col gap-4 sm:grid sm:grid-cols-2 sm:gap-x-4">`, add `sm:col-span-2` to Title, Category group, Notes, Attachments, `FormError`, `DialogFooter`, and the `InlineCostFields` wrapper; pair the short fields (Stop/Date, Start/End time, Address/Link, Booking/…) in the two columns. Pass `size="lg"` to their `FormDialog`.
- [ ] **Step 4: Run** `npx vitest run components/ui/dialog.test.tsx components/trip/item-form-dialog.test.tsx components/trip/transport-form-dialog.test.tsx components/trip/accommodation-form-dialog.test.tsx components/trip/day-entry-link.test.tsx` + tsc → PASS (skip test files that don't exist).
- [ ] **Step 5: Commit**
```
feat(ui): wide two-column entity dialogs (Item, Transport, Accommodation)

Resolves-Feedback: cmuhu0rxp000c04l54gd96wgu
```

---

### Task 5: Accommodation lives inside the Stop card ("Where you're staying")

**Files:**
- Modify: `components/trip/stop-card.tsx` (new section + props), `components/trip/stop-card.test.tsx`
- Modify: `components/trip/accommodation-row.tsx:50-81` (expand in place, flush), `components/trip/accommodation-row.test.tsx`
- Modify: `components/trip/itinerary-manager.tsx:1605-1645` (stop rendering accommodation as siblings; pass into `StopCard`)

**Interfaces:**
- `StopCardProps` gains `accommodations?: React.ReactNode` (the rendered rows, built by `ItineraryManager` exactly as today) and `onAddAccommodation?: () => void`. The card renders, between the header/DatedMeta and things to do:
  `<section data-testid="stop-staying" aria-labelledby=…><h4 …>Where you're staying</h4>{accommodations ?? <NoBedYet/>}<Button variant="ghost" size="sm" …>Add accommodation</Button></section>`.
- `AccommodationRow`: the collapsed button and the expanded `AccommodationCard` share one bordered wrapper (`rounded-xl border border-border bg-hue-lilac/25`); expanded content renders inside that wrapper below the button with a dotted top rule, no second shadowed card (`AccommodationCard` gets `className="border-0 shadow-none rounded-none bg-transparent"` or an `embedded` prop).

- [ ] **Step 1: Failing tests** — `stop-card.test.tsx`: with `accommodations` given, the section headed "Where you're staying" contains them and precedes the things-to-do list in DOM order; without, it shows "No bed yet" and the add button calls `onAddAccommodation`. `accommodation-row.test.tsx`: after clicking the row, the expanded content is inside the same wrapper element as the toggle (`toggle.closest('[data-testid="accommodation-row"]')` contains the card) and the card has no `shadow-hard`/`shadow-soft` class.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — in `itinerary-manager.tsx` `renderStop`, move the `stop.accommodations.map(...)` rows and the add button into `accommodations={…}` / `onAddAccommodation={…}` props on `<StopCard>` (keep the rough-Stop explanation behaviour in the add handler). Delete the sibling `ml-4 pl-4` blocks. In `accommodation-row.tsx` restructure as described, `data-testid="accommodation-row"` on the wrapper. Rough Stops: "No bed yet" still shows; the add button keeps its "needs dates" explanation.
- [ ] **Step 4: Run** `npx vitest run components/trip/stop-card.test.tsx components/trip/accommodation-row.test.tsx components/trip/itinerary-manager.test.tsx components/trip/accommodation-card.test.tsx` + tsc → PASS.
- [ ] **Step 5: Commit** (two trailers)
```
feat(plan): Accommodation lives inside the Stop card, expanding in place

Resolves-Feedback: cmuht8mse000304l59pms3vr8
Resolves-Feedback: cmuht87fk000204l5q3b728lh
```

---

### Task 6: Stop card row layout (kit DPlan) with an overflow menu

**Files:**
- Modify: `components/trip/stop-card.tsx:316-490` (header grid; actions), `components/trip/stop-card.test.tsx`

**Interfaces:**
- Exported `STOP_CARD_ROW_CLASS = "lg:grid lg:grid-cols-[minmax(0,1fr)_14rem_13rem_auto] lg:items-center lg:gap-4"` applied to the card's top block on `lg+` (phone: the current `flex flex-col` stack). Columns: (1) name + country + MapLink (`min-w-0 flex-1`), (2) `DatedMeta` (dates, nights, tz), (3) the "Where you're staying" tile from Task 5 (compact: first accommodation name or "No bed yet"), (4) actions.
- Actions: two visible icon buttons (Edit, Add thing to do) + one `DropdownMenu` (`aria-label="More actions for <name>"`) containing Start a chapter here, Assign to chapter, Pin/Unpin dates, Adjust dates, Make rough/Clear dates, Add a reminder (wired in Task 7), Delete. The existing handlers move unchanged.

- [ ] **Step 1: Failing tests** — `stop-card.test.tsx`: the header carries `STOP_CARD_ROW_CLASS`; exactly two icon buttons are visible outside the menu (names `Edit <name>`, `Add thing to do`); opening "More actions for <name>" lists "Delete <name>" and "Pin dates"; keep the existing handler tests green by triggering them through the menu.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** as specified; keep drag handle rendering; keep `stopBandBorderClass`. Phone classes (`flex flex-col gap-3`) unchanged below `lg`.
- [ ] **Step 4: Run** `npx vitest run components/trip/stop-card.test.tsx components/trip/itinerary-manager.test.tsx` + tsc → PASS.
- [ ] **Step 5: Commit**
```
feat(plan): Stop card follows the kit row — place, dates, staying tile, overflow menu

Resolves-Feedback: cmuhuuye6000104jqyh0wyh84
```

---

### Task 7: A Reminder about a Stop

**Files:**
- Modify: `prisma/schema.prisma` (Reminder: `stopId String?` + relation `stop Stop? @relation(fields:[stopId], references:[id], onDelete: SetNull)`, `@@index([stopId])`; add `reminders Reminder[]` on Stop)
- Create: `prisma/migrations/20260927000001_reminder_stop/migration.sql`
- Modify: `server/actions/reminders.ts` (schema `stopId: z.string().cuid().optional()`, create/update/list select `stopId`, `ReminderItem` gains `stopId: string | null` and `stopName: string | null` via `include: { stop: { select: { name: true } } }`), `server/actions/reminders.test.ts`
- Modify: `components/trip/reminders-card.tsx` (Stop chip; optional `stops` prop for a Stop select in the add form), `components/trip/reminders-card.test.tsx`
- Modify: `components/trip/stop-card.tsx` (menu item "Add a reminder" → `onAddReminder?.(stop)`; `reminders?: ReminderItem[]` listed under a small "Reminders" line), `components/trip/itinerary-manager.tsx` (opens an `AddReminderDialog` with `stopId` preset), `app/(app)/trips/[tripId]/plan/page.tsx` (fetch reminders for the trip; pass per Stop)
- Create: `components/trip/add-reminder-dialog.tsx` (FormDialog: title, date (empty by default), hidden stopId), test

Migration SQL:
```sql
-- Additive on both paths (docs/DEPLOY.md §4b): nullable column, no backfill —
-- NULL means "about the Trip as a whole", which every existing Reminder is.
ALTER TABLE "Reminder" ADD COLUMN "stopId" TEXT;
CREATE INDEX "Reminder_stopId_idx" ON "Reminder"("stopId");
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 1: Failing tests** — actions test: `addReminder(tripId, { title, date, stopId })` passes `stopId` to `db.reminder.create`; `listRemindersForTrip` returns `stopName`. Card test: a reminder with `stopName: "Denpasar"` renders a chip "Denpasar". Dialog test: submitting with an empty date shows the validation error and does not call the action; with a date calls `addReminder(tripId, { title, date, stopId: "s1" })`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; `npx prisma validate && npx prisma generate`.
- [ ] **Step 4: Run** the tests + `npx vitest run components/trip/stop-card.test.tsx components/trip/home` + tsc → PASS.
- [ ] **Step 5: Commit**
```
feat(reminders): a Reminder can be about a Stop

Adds Reminder.stopId (migration written, not applied).

Resolves-Feedback: cmuht7e5e000104l5u6hibnkw
```

---

### Task 8: Settlement on a Cost; Money splits the two kinds

**Files:**
- Modify: `prisma/schema.prisma` (Cost: `settlement String @default("BEFORE")` — values `BEFORE | ON_TRIP`, comment pointing at CONTEXT.md "Settlement")
- Create: `prisma/migrations/20260927000002_cost_settlement/migration.sql` (`ALTER TABLE "Cost" ADD COLUMN "settlement" TEXT NOT NULL DEFAULT 'BEFORE';` — defaulted, so the old build's inserts succeed)
- Modify: `lib/enums.ts` (`COST_SETTLEMENTS = ["BEFORE","ON_TRIP"] as const`), `lib/validations/cost.ts` (`settlement: z.enum(COST_SETTLEMENTS).default("BEFORE")`), `server/actions/costs.ts` (persist on create/update; `COST_SELECT` + `CostRow` gain `settlement`), and every `COST_SELECT` copy (`plan/page.tsx:24`, `summary/page.tsx:56`, day page)
- Modify: `lib/budget.ts` (`BudgetCost.settlement?: string`; `BudgetTotals` gains `beforeTotalMinor`, `onTripTotalMinor`, `beforePaidMinor`, `onTripPaidMinor`), `lib/budget.test.ts`
- Modify: `lib/upcoming-payments.ts` (filter `settlement !== "ON_TRIP"`), `lib/upcoming-payments.test.ts`
- Modify: `components/trip/inline-cost-fields.tsx` (+ props `settlement`, `onSettlementChange`; a `Segmented` "Paid before you go" / "Paid on the trip"), `components/trip/cost-editor.tsx` (same control), their tests, and the three entity forms (state + payload)
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` (two headline totals + "Before you go" / "On the trip" sections above "By category"), `budget/page.test.tsx`

- [ ] **Step 1: Failing tests** — `budget.test.ts`: two costs (`settlement: "BEFORE"` 100, `"ON_TRIP"` 40, plus one with `settlement: undefined` 5) → `totals.beforeTotalMinor === 105`, `onTripTotalMinor === 40`. `upcoming-payments.test.ts`: an unpaid `ON_TRIP` cost with a due date is not listed. `inline-cost-fields.test.tsx`: the segmented control shows both options and calls `onSettlementChange("ON_TRIP")`. `budget/page.test.tsx`: renders headings "Before you go" and "On the trip".
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; `npx prisma validate && npx prisma generate`.
- [ ] **Step 4: Run** `npx vitest run lib/budget.test.ts lib/upcoming-payments.test.ts components/trip/inline-cost-fields.test.tsx components/trip/cost-editor.test.tsx "app/(app)/trips/[tripId]/budget" components/trip/item-form-dialog.test.tsx components/trip/transport-form-dialog.test.tsx components/trip/accommodation-form-dialog.test.tsx server/actions/costs.test.ts` + tsc → PASS.
- [ ] **Step 5: Commit**
```
feat(money): a Cost has a Settlement — before you go or on the trip

Money rolls the two up separately; Upcoming payments only track the
before-you-go kind. Cost.settlement migration written, not applied.

Resolves-Feedback: cmuhtpl7v000004ig0f1kf6ae
```

---

### Task 9: An Item hidden from shares

**Files:**
- Modify: `prisma/schema.prisma` (Item: `hiddenFromShares Boolean @default(false)`), create `prisma/migrations/20260927000003_item_hidden_from_shares/migration.sql` (`ALTER TABLE "Item" ADD COLUMN "hiddenFromShares" BOOLEAN NOT NULL DEFAULT false;`)
- Modify: `server/actions/items.ts` (input schema `hiddenFromShares: z.boolean().optional()`, persisted on create/update), `server/actions/items.test.ts`
- Modify: `components/trip/item-form-dialog.tsx` (Checkbox "Hide from shared links" + help text "Still visible to everyone on the trip."), test; `components/trip/item-card.tsx` (`ItemCardItem.hiddenFromShares?`), `stop-card.tsx`/`stop-day-list.tsx`/`timeline.tsx` rows: an `EyeOff` icon with `aria-label="Hidden from shares"` when set
- Modify: `app/share/[token]/page.tsx:183-200` (`where: { tripId, ...REAL_PLAN, hiddenFromShares: false }`), `app/share/[token]/page.test.tsx`
- Modify: every Item select that feeds those rows to include `hiddenFromShares: true` (plan page, day page, calendar page, wishlist page)

- [ ] **Step 1: Failing tests** — share page test: the item query's `where` contains `hiddenFromShares: false` even with all dials on. Item form test: ticking the checkbox sends `hiddenFromShares: true` to `createItem`. Timeline test: an item with `hiddenFromShares: true` renders an element labelled "Hidden from shares"; one without does not. Actions test: `updateItem` persists the flag.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; prisma validate/generate. **Step 4: Run** those tests + tsc → PASS.
- [ ] **Step 5: Commit**
```
feat(share): an Item can be hidden from shared links

Resolves-Feedback: cmuhukle5000b04jwm8sjdr00
```

---

### Task 10: Plan variants (Forks) opt-in per Trip

**Files:**
- Modify: `prisma/schema.prisma` (Trip: `forksEnabled Boolean @default(false)` with the same comment style as `chaptersEnabled`), create `prisma/migrations/20260927000004_trip_forks_enabled/migration.sql`:
```sql
ALTER TABLE "Trip" ADD COLUMN "forksEnabled" BOOLEAN NOT NULL DEFAULT false;
-- A Trip that already has a Fork keeps seeing it (spec B3).
UPDATE "Trip" SET "forksEnabled" = true WHERE "id" IN (SELECT DISTINCT "tripId" FROM "Fork");
```
- Modify: `server/actions/trips.ts` (`setForksEnabled(tripId, enabled)` mirroring `setChaptersEnabled` minus the recompute; activity summary "Turned plan variants on/off"), test
- Modify: `components/trip/settings/trip-details-form.tsx` (a "Plan variants" switch with copy "Keep what-if versions of the plan side by side. Off by default."), test; `app/(app)/trips/[tripId]/settings/page.tsx` (pass `forksEnabled`)
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (`showForkSwitcher = trip.forksEnabled && phase…`; select `forksEnabled`), `layout.test.tsx`
- Modify: `lib/plan-scope.ts` or wherever `?plan=` is resolved to an active Fork (grep `activeForkId`/`resolvePlanParam`): when `forksEnabled` is false, ignore `?plan=` (real plan); `variant-banner.tsx`, `item-card.tsx` placed marker, Compare page: render nothing / redirect to `/trips/:id/plan` when off. Tests for the gate.
- Modify: `components/trip/wishlist-board.tsx` (`placedIdeaIds` marker hidden when off — pass `forksEnabled`)

- [ ] **Step 1: Failing tests** — layout test: `forksEnabled: false` → `ForkSwitcher` marker absent even in planning phase; `true` → present. Plan-scope test: `resolvePlan(...)` with `forksEnabled: false` and `plan=fork-1` → `null`. Settings form test: toggling calls `setForksEnabled(tripId, true)`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; prisma validate/generate. **Step 4: Run** the tests + `npx vitest run components/trip "app/(app)/trips/[tripId]"` + tsc → PASS.
- [ ] **Step 5: Commit**
```
feat(forks): plan variants are opt-in per Trip

Resolves-Feedback: cmuhtvo4x000104jwxdfp1638
```

---

### Task 11: Trips list — flat hue tile, even rows, a richer "Next up"

**Files:**
- Modify: `components/trip/trip-cover.tsx:140-175` (`MonogramCover` → flat tile; `TripCover` gains `variant?: "initial" | "name"`), `components/trip/trip-cover.test.tsx`
- Modify: `components/trip/trip-card.tsx`, `components/trip/trip-card.test.tsx`; `app/(app)/trips/page.tsx:141-160` (pass `nextStep`, `route` summary, `nights`, `countdown` to the featured card; `AnimatedItem className="h-full"`)

**Interfaces:**
- `MonogramCover`: `className="flex size-full items-center justify-center <HUE_CLASSES[hue].fill> text-on-accent"`, hue from `["coral","sun","teal","lilac"]` by the existing hash (no gradient classes anywhere: test greps the rendered class for `gradient`). `variant="name"` renders the trip name in `font-display text-3xl font-extrabold` instead of the initial.
- `TripCardProps` gains `featuredDetails?: { countdown: string; unit: string | null; routeSummary: string; stopsAndNights: string; nextStep: string | null }`. Featured card: cover left (`lg:w-1/2`), details right; never the initial variant (`variant="name"` when no photo/route).
- Card root: `h-full flex flex-col`; covers `h-36` (featured `h-48` on lg).

- [ ] **Step 1: Failing tests** — cover test: no `bg-gradient` class; `variant="name"` renders the name. Card test: featured with details renders countdown, route summary and next step; every card root has `h-full`. Trips page test: `AnimatedItem` for each trip has `h-full`.
- [ ] **Step 2–4:** run/implement/run (`npx vitest run components/trip/trip-cover.test.tsx components/trip/trip-card.test.tsx "app/(app)/trips/page.test.tsx"` + tsc).
- [ ] **Step 5: Commit** (two trailers)
```
feat(trips): flat hue covers, even rows, a "Next up" card that earns its width

Resolves-Feedback: cmuhrynn1000004l57dj81mc4
Resolves-Feedback: cmuhrzt88000104l55c4qg9vt
```

---

### Task 12: Bounded route map

**Files:**
- Modify: `components/trip/route-map.tsx:207-220,345-356` (map + tile options; `aspect` prop), `components/trip/route-map.test.tsx`

**Interfaces:**
- `L.map(el, { zoomControl: true, worldCopyJump: false, maxBounds: [[-85, -180],[85, 180]], maxBoundsViscosity: 1, minZoom: 1 })`; tile layer `noWrap: true`; after `fitBounds`, `if (map.getZoom() < 1) map.setZoom(1)`. New prop `aspect?: "16/9" | "4/3"` renders `style={{ aspectRatio }}` instead of a fixed height when given.

- [ ] **Step 1: Failing tests** — using the file's Leaflet mock (`hoisted.leaflet.maps[0].options`), assert `noWrap: true` on the tile layer options and `worldCopyJump: false`, `maxBoundsViscosity: 1` on the map options; `aspect="16/9"` renders `aspect-ratio: 16 / 9` and no `height` style.
- [ ] **Step 2–4:** run/implement/run (`npx vitest run components/trip/route-map.test.tsx lib/route-map.test.ts` + tsc).
- [ ] **Step 5: Commit**
```
fix(map): bound the route map so the world never repeats

Resolves-Feedback: cmuhsyae2000004l0d19tlzr2
```

---

### Task 13: Trip home tile grid and the cover tile

**Files:**
- Modify: `components/trip/home/phase-planning.tsx:78-79,395-415` (grid), `phase-planning.test.tsx`
- Create: `components/trip/home/stat-tile.tsx` (`Card` tone + `Label` + value + sub), test
- Modify: `components/trip/home/countdown-hero.tsx` (`lg:row-span-2`, `lg:min-h-0`)
- Modify: `app/(app)/trips/[tripId]/page.tsx:76-92,126-133` (cover becomes a grid tile passed into `PhasePlanning` as `cover`; other phases keep the full-width cover)
- Modify: `components/trip/trip-cover.tsx:47-85` (photo: `object-cover` with `objectPosition` from focal; blurred copy only as a `variant="tile"` fallback behind a portrait image that can't fill — detect via `naturalWidth/naturalHeight` on load, client island `CoverPhoto`), `trip-cover.test.tsx`
- Modify: `prisma/schema.prisma` (Trip: `coverFocalX Float? coverFocalY Float?`), create `prisma/migrations/20260927000005_trip_cover_focal/migration.sql` (two nullable REAL columns), `components/trip/settings/cover-image-panel.tsx` (a focal-point picker: click on the preview sets `coverFocalX/Y` 0–1 via `setCoverFocal` action), test

**Interfaces:**
- `PLANNING_DESKTOP_GRID_CLASS = "grid grid-cols-1 gap-3.5 lg:grid-cols-3 lg:grid-rows-[auto_auto] lg:items-stretch"`; order on lg: hero (`lg:row-span-2`), cover tile, StatTile "Cost so far", StatTile "Next payment", StatTile "Reminders" (count + next), then a second grid `lg:grid-cols-3`: map tile (`aspect="4/3"`), Next steps, Quick actions; Reminders card last full width. Phone: single column in the order cover → hero → route → next steps → money → actions → reminders (the cover band stays above the hero, as before).
- `TripCover` photo branch: `<img className="size-full object-cover" style={{ objectPosition: `${fx*100}% ${fy*100}%` }}>`; `variant="tile"` adds the blurred backdrop only when the loaded image is portrait (`naturalHeight > naturalWidth`) and the tile is landscape.

- [ ] **Step 1: Failing tests** — phase-planning test: the grid class equals the new constant; the hero has `lg:row-span-2`; three `StatTile`s render with labels "Cost so far", "Next payment", "Reminders"; the map is rendered with `aspect="4/3"`. Cover test: the foreground img has `object-cover` and `object-position: 30% 60%` for focal (0.3, 0.6); no blur img when `naturalWidth >= naturalHeight` after `load`; blur img present for a portrait natural size in `variant="tile"`. Panel test: clicking at (25%, 75%) of the preview calls `setCoverFocal(tripId, 0.25, 0.75)`.
- [ ] **Step 2–4:** run/implement/run (`npx vitest run components/trip/home components/trip/trip-cover.test.tsx components/trip/settings "app/(app)/trips/[tripId]/page.test.tsx"` + prisma validate/generate + tsc).
- [ ] **Step 5: Commit** (three trailers)
```
feat(home): three-column tile grid, cover as a tile with a focal point

Resolves-Feedback: cmuhs2jwo000004l56xzttpf0
Resolves-Feedback: cmuht3y6y000104l02v8jn2as
Resolves-Feedback: cmuhtestc000604l5gakrp4hj
```

---

### Task 14: The rail everywhere, and More as a page

**Files:**
- Create: `components/app-rail.tsx` (client: `Dock` with Trips/Globe/You for non-trip pages; `hidden md:flex` via Dock), test
- Modify: `app/(app)/layout.tsx:84-195` (mount `AppRail` left of `<main>` when no trip shell — the trip layout keeps `TripNav`; remove the header Globe link and its comment), `app/(app)/layout.test.tsx`
- Modify: `components/trip/trip-nav.tsx` (More item → plain link `${base}/more`, `match` = any More section or `/more`), `trip-nav.test.tsx`; delete `components/trip/nav-more-menu.tsx` (+ test) after removing its use
- Create: `app/(app)/trips/[tripId]/more/page.tsx` (+ `metadata` "More"): a `lg:grid-cols-3` of `Card interactive` tiles, each a `Link` with the section name and a one-line description (Summary: "The whole trip at a glance", Journal: "What happened, day by day", Checklists: "Things to tick off before and during", Files: "Tickets, bookings and documents", Activity: "What everyone's changed", Settings: "Travellers, sharing, digests and details", Help: "How to use Teepee"), test
- Modify: `lib/help-guide.ts:156-168` only if the guide links to `more` (it does not; leave)

- [ ] **Step 1: Failing tests** — app layout test: on a non-trip render the rail marker (`nav[aria-label="Teepee"]` with links Trips, Globe, You) is present and no header link named "Globe" exists. trip-nav test: the More item is a link to `/trips/t1/more`, active on `/trips/t1/journal` and `/trips/t1/more`. More page test: seven tiles, each a link to its route, Help last.
- [ ] **Step 2–4:** run/implement/run (`npx vitest run "app/(app)/layout.test.tsx" components/trip/trip-nav.test.tsx components/trip/mobile-tab-bar.test.tsx "app/(app)/trips/[tripId]/more" components/app-rail.test.tsx lib/help-guide.test.ts components/command-palette.test.tsx` + tsc). The `<main>` keeps `has-[[data-trip-shell]]` full-bleed; wrap non-trip content as `<div className="flex md:flex-row"><AppRail/>…</div>` so `max-w-page-wide` still centres right of the rail (ADR 0062).
- [ ] **Step 5: Commit** (two trailers)
```
feat(nav): the rail is always there; More is a page of sections

Resolves-Feedback: cmuhtgds8000804l5cmhljc31
Resolves-Feedback: cmuhtfs43000704l5q3b728lh
```

---

### Task 15: Days glyphs and legend, day header width, weather by condition

**Files:**
- Modify: `components/trip/month-grid.tsx:111-120,156-171,198-206`, `month-grid.test.tsx`
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx:41-42` (`DAY_HEADER_GRID_CLASS = "mx-auto w-full max-w-3xl flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"`), `page.test.tsx`
- Create: `lib/weather-tone.ts` (`weatherTone(code: number | null): { tone: "hue-sun"|"hue-stone"|"hue-sky"|"hue-lilac"|"hue-indigo"; icon: "sun"|"cloud"|"cloud-fog"|"cloud-rain"|"snowflake"|"cloud-lightning" }`), test
- Modify: `components/trip/weather-daylight-card.tsx:69-78`, test

**Interfaces:**
- Month grid: `BedDouble` for check-in, `BedDouble` + `ArrowRight` (or lucide `DoorOpen`) for check-out; each `<span role="img" aria-label="Check-in"|"Check-out">`; tile `aria-label` appends "check-in"/"check-out"/"<mode> departs|arrives"; legend `<ul aria-label="Markers">` after the Stops legend: Check-in, Check-out, and each Transport mode present in the month.
- `weatherTone`: `0 → sun/sun; 1-3 → stone/cloud; 45-48 → stone/cloud-fog; 51-67,80-82 → sky/cloud-rain; 71-77,85-86 → lilac/snowflake; ≥95 → indigo/cloud-lightning; null → sky/sun`.

- [ ] **Step 1: Failing tests** — `weather-tone.test.ts` table; card test: code 61 → root has `bg-hue-sky` and a `CloudRain` svg (`data-testid="weather-icon"` + `data-icon="cloud-rain"`); code 0 → `bg-hue-sun`. Month-grid test: a check-in day exposes `role="img"` named "Check-in" and the legend lists "Check-in". Day page test: `DAY_HEADER_GRID_CLASS` contains `max-w-3xl` and `mx-auto`.
- [ ] **Step 2–4:** run/implement/run (`npx vitest run components/trip/month-grid.test.tsx components/trip/weather-daylight-card.test.tsx lib/weather-tone.test.ts "app/(app)/trips/[tripId]/day"` + tsc). Three commits, one per note:
- [ ] **Step 5a: Commit** `fix(days): name the check-in/out markers and add a legend` — `Resolves-Feedback: cmuhum07i000004la36b5gzyr`
- [ ] **Step 5b: Commit** `fix(day): the header shares the reading width` — `Resolves-Feedback: cmuhsodiw000004l592vwkarj`
- [ ] **Step 5c: Commit** `feat(day): the weather card takes hue and icon from the forecast` — `Resolves-Feedback: cmuhswcu7000004ku1zbnxcki`

---

### Task 16: Motion polish

**Files:**
- Modify: `components/ui/dialog.tsx` (desktop open uses `motion` spring via `SPRING_POP` instead of the CSS `tp-pop-in` when motion is allowed — wrap `DialogPrimitive.Content` children in `motion.div` with `initial={{ scale: .96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING_POP}`), `dialog.test.tsx`
- Modify: `components/trip/home/phase-planning.tsx` (tiles wrapped in `AnimatedList staggerOnMount`), `app/(app)/trips/[tripId]/more/page.tsx` (same), tests
- Modify: `components/trip/calendar-views.tsx` (the existing `AnimatePresence` crossfade uses `DURATION.base` and `EASE_EMPHASIZED`), test

- [ ] **Step 1: Failing tests** — dialog test mocks `motion/react` (as calendar-views.test does) and asserts the content is wrapped by the mocked `motion.div`; with `useReducedMotion → true` no `initial` scale is applied. Phase-planning test: the tile container is `AnimatedList` with `staggerOnMount`.
- [ ] **Step 2–4:** run/implement/run (`npx vitest run components/ui/dialog.test.tsx components/trip/home components/trip/calendar-views.test.tsx "app/(app)/trips/[tripId]/more"` + tsc).
- [ ] **Step 5: Commit**
```
feat(motion): spring-pop dialogs, staggered tiles, a softer Days crossfade

Resolves-Feedback: cmuhtwkap000a04l57lqju6az
```

---

### Task 17: The landing page

**Files:**
- Create: `app/landing/landing.tsx` (server component; the kit `DLanding.jsx` in Playground tokens: left hero `font-display text-[56px] lg:text-[88px] leading-[0.92] tracking-[-0.05em]` "Plan it with your people" + coral full stop, subline, "Start a trip" primary button linking to `/signin`, tilted sample `Card`s (coral countdown, lilac "Where you're staying", sun transport chip, teal avatars) `hidden lg:block`; right `bg-teal` panel with the "Come on in" `Card` holding `GoogleSignInButton`/`DevSignInButton`s from `app/signin/signin-buttons`), `app/landing/landing.test.tsx`
- Modify: `app/page.tsx` (`auth()`: signed in → `redirect("/trips")`; else render `<Landing />` inside a wrapper with `data-theme="light"` and `className="light"` so the page ignores the dark toggle; `metadata` title "Teepee" absolute)
- Modify: `app/signin/page.tsx` (reuse the same `Landing` with `accessDenied` copy in the card; keeps `?error=AccessDenied` handling), `app/signin/page.test.tsx`

- [ ] **Step 1: Failing tests** — landing test: renders heading "Plan it with your people", a link "Start a trip" to `/signin`, the "Come on in" card, a line "Teepee is invite-only" and no "Invite" form; root has `data-theme="light"`. Root page test: signed-in `auth()` mock → `redirect("/trips")`; signed-out → the landing heading.
- [ ] **Step 2–4:** run/implement/run (`npx vitest run app/landing app/page.test.tsx app/signin` + tsc).
- [ ] **Step 5: Commit**
```
feat(landing): the signed-out front door follows the kit landing, in light mode

Resolves-Feedback: cmuhujm3u000a04jw7a6f0hs5
```

---

### Task 18: Whole-branch verification

- [ ] **Step 1:** `npx vitest run 2>&1 | tail -15 && npx tsc --noEmit && npm run lint && npx prisma validate` — all green.
- [ ] **Step 2: Trailer audit** — `git log beta..HEAD --format='%(trailers:key=Resolves-Feedback,valueonly)' | sort -u` lists all 24 ids: cmuhrynn1000004l57dj81mc4 cmuhrzt88000104l55c4qg9vt cmuhs2jwo000004l56xzttpf0 cmuhsyae2000004l0d19tlzr2 cmuht3y6y000104l02v8jn2as cmuhtestc000604l5gakrp4hj cmuhtfs43000704l5q3b728lh cmuhtgds8000804l5cmhljc31 cmuhtwkap000a04l57lqju6az cmuhum07i000004la36b5gzyr cmuhsodiw000004l592vwkarj cmuhswcu7000004ku1zbnxcki cmuht7e5e000104l5u6hibnkw cmuht87fk000204l5q3b728lh cmuht8mse000304l59pms3vr8 cmuhu0rxp000c04l54gd96wgu cmuhue58l000304lcb3uloihi cmuhujm3u000a04jw7a6f0hs5 cmuhukle5000b04jwm8sjdr00 cmuhuqi5w000004i4wy0gfub6 cmuhuuye6000104jqyh0wyh84 cmuhtpl7v000004ig0f1kf6ae cmuhtul0o000004jw4x36ndv1 cmuhtvo4x000104jwxdfp1638.
- [ ] **Step 3: Report for Cam** — the five migrations to apply before the affected notes can close; the manual pass list (A1/A2/A5, E1/E2, F1/F2, G1/G2, I1 at 1438×723, 1920×911 and a phone width).
