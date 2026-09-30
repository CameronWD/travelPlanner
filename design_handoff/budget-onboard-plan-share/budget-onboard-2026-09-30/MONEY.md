# Money page

Route: `app/(app)/trips/[tripId]/budget/page.tsx`. It stays a **Server Component**. Keep the data fetching exactly as it is, including `buildBudget`, `buildSpendSoFar`, `buildUpcomingPayments`, `buildCostLabelMap`, fork scoping and rates. This is a presentation rewrite, not a data rewrite.

**Summary:** the page currently stacks nine sections. They become three, plus a rates strip:

| Today | Becomes |
|---|---|
| `BudgetHeroRow` (4 tiles) + `SpendSoFarCard` + `SettlementSplit` + the Cost/Paid legend | **Cost tile** (§3) |
| `UpcomingPaymentsCard` + "Mark off what you've paid" `CostChecklist` + the legacy-paid notice | **To pay** (§4) |
| By category + By destination + By chapter + Day by day cards | **Where it goes** (§5) |
| Missing-rates banner + Exchange rates card | **Rates strip** (§6) |
| Other costs card (`OtherCostEditor`) | **+ Add a cost** sheet in the header (§2) |

---

## 1. Tokens used

| Mock hex | Token / utility |
|---|---|
| `#FFFBF3` page | `bg-background` |
| `#FFFFFF` card | `bg-card` |
| `#1D1D1B` ink, borders, paid bar fill | `text-foreground`, `border-border`, `bg-foreground` |
| `#5BC0BE` cost tile | `bg-teal` (on-colour text is `text-on-accent`) |
| `#FFD166` sidebar, rates strip, "6 left" pill | `bg-sun` |
| `#FF6B4A` active nav, CTA shadow | `bg-coral`, `shadow-cta` |
| `#EFE9DF` row dividers | `border-muted` (2px) |
| `#EAF3F2` unpaid stripe | `repeating-linear-gradient` of `card` and `teal/12`, defined once as a `bg-unpaid-stripe` utility |
| `#6B6660` secondary text | `text-muted-foreground` |
| `#302D29` secondary text on sun/teal | `text-on-accent-muted` |
| `#2E8A88` "paid" amounts | `text-teal-text` |
| `#B8391D` overdue, due soon, Edit links | `text-coral-text` |
| Category colours | Existing `lib/categories.ts` hue ramp: Transport = sun, Stays = teal, Activities = coral, Food = leaf, Other = lilac. Use the category's `hue-*` fill. Don't hard-code these. |

Radii: tiles are `rounded-3xl` (24px), inner boxes `rounded-2xl` (16px), rows and cells `rounded-xl` (12px), pills `rounded-full`.

---

## 2. Header

The header uses the same pattern as trip home:

```
<p>  Christmas in Europe 2026          text-[15px] font-medium text-muted-foreground
<h1> Money                             font-display text-4xl (40px) font-extrabold tracking-[-0.02em]
<p>  In AUD · 35 nights · 14 costs in 3 currencies     text-[15px] font-semibold text-foreground/80
```

- The meta line is built from `homeCurrency`, `nightsBetween(start, end)`, `allCosts.length` and the count of distinct currencies (home currency included). Leave out any part that's zero.
- On the right there's one primary CTA: **+ Add a cost**. It uses the ink pill style: `h-11 px-[18px] rounded-full bg-foreground text-background font-extrabold text-sm shadow-cta pressable`.
  - It opens a Radix `Dialog` on desktop and a bottom sheet on mobile, containing the existing `OtherCostEditor` in create mode.
  - Hide it on a fork, as the code does today (the `!activeFork` rule).
- **Split with N** is a secondary pill with overlapping avatars, shown **only if the trip has more than one member**. Clicking it goes to trip people/settings. If the repo has no trip membership yet, don't render the pill, and drop "· $212 each" from the cost tile.
- `<h2 className="sr-only">Money</h2>` becomes the real `<h1>` above. Delete the sr-only heading.

---

## 3. Cost tile

A teal hero tile. Desktop: 8 of 12 columns, 268px tall. Mobile: full width, auto height.

```
┌──────────────────────────────────────────────────────────────┐
│ (TRIP COST)                           ┌──────────┬──────────┐ │
│ $14,820.40                            │BEFORE YOU│ON THE    │ │
│ $423 a night · $212 each              │GO $11,200│TRIP      │ │
│                                       │$9,340 pd │$3,620    │ │
│                                       └──────────┴──────────┘ │
│ [███████████████████████████░░░░░░░░░░░░░░░]                  │
│ $9,340 paid · 63%                                $5,480 to go │
└──────────────────────────────────────────────────────────────┘
```

**Container:** `rounded-3xl border-2 bg-teal shadow-3 p-[22px_24px] flex flex-col`.

**Pill:** "TRIP COST" in the standard status-pill style: `text-[11px] font-extrabold tracking-[0.08em] bg-card border-2 rounded-full px-2.5 py-0.5 whitespace-nowrap`.

**Total:**
- Dollars in `font-display font-extrabold text-[88px] leading-[.85] tracking-[-0.05em]`; on mobile, 56px.
- Cents in a separate span at `text-[28px]` (mobile 20px), aligned to the baseline.
- Split the formatted string at the decimal separator; add a `formatMoneyParts()` helper (§9).
- If the currency has no minor units (JPY, IDR), show no cents span.

**Sub line** (`text-[15px] font-bold`):
- `{perNight} a night` is `grandTotal / nights`. Rename "Cost / day" to "a night", because the value is already divided by nights.
- ` · {perPerson} each` appears only with 2+ members.
- If nights = 0, the sub line is hidden.

**Settlement box** (desktop: top right of the tile; mobile: under the bar, full width, 2 columns):
- `bg-card border-2 rounded-2xl` with a 2px divider between the two cells.
- Each cell has:
  - a label: `text-[11px] font-extrabold tracking-[0.08em] text-on-accent-muted`
  - a value: `font-display text-[26px]`, 19px on mobile
  - a sub line: `text-[13px] font-semibold`
- The sub line for **Before you go** is `{beforePaid} paid` in `text-teal-text`.
- The sub line for **On the trip** is "Spend money" in `text-muted-foreground`, or `{onTripPaid} paid` once `onTripPaidMinor > 0`.
- It always shows. On mobile it stacks under the bar.
- On a fork, the paid sub lines are hidden (`showPaid=false`).

**Paid bar:**
- 30px tall (22px on mobile), `rounded-full border-2 overflow-hidden`, with the `bg-unpaid-stripe` background.
- The fill is `bg-foreground`, `width: paidPct%`, capped at 100%.
- It needs `role="progressbar"` with `aria-valuenow={paidPct}`, `aria-valuemin=0`, `aria-valuemax=100` and `aria-label="Paid so far"`.
- The row below it (`text-sm font-bold flex justify-between`) reads `$9,340 paid · 63%` on the left and `$5,480 to go` on the right. Mobile drops the "· 63%".
- If everything is paid, the right side reads "All paid ✓". The ✓ is lucide `Check`, 16px.
- On a fork, the bar and its row are hidden, and the tile gets its height from the total alone. Keep the existing sentence: "Paid tracking lives on the real plan — this shows the variant's costs only."

The data comes from `budget.grandTotal`, `spend.paidSoFarMinor`, `totals.beforeTotalMinor`, `beforePaidMinor`, `onTripTotalMinor` and `onTripPaidMinor`. All of these already exist.

---

## 4. To pay

A white card. Desktop: 4 columns and spans both grid rows, above the rates strip. Mobile: the second block, showing the **top 2 rows** only.

**Header:**
- `h2` "To pay", in `font-display text-[22px]` (19px on mobile).
- On the right, a count pill: "6 left", `bg-sun border-2 rounded-full text-[13px] font-bold px-2.5`. On mobile it's plain text: "6 left ›", and it opens the full list.

**Rows** come from **one merged list**:
- Take every cost where `paidMinor < costMinor`, plus the paid ones.
- Sort unpaid first, then:
  1. overdue (dueDate < today)
  2. by `dueDate` ascending
  3. no due date, in `createdAt` order
- Paid rows come last, most recent `paidAt` first.
- Desktop shows up to 5 rows (or as many as fit, with the list scrolling inside the card). "All 14 costs ›" at the bottom opens the full checklist (sheet/dialog).

Each row is at least 52px tall with `py-2.5`, a 2px `border-muted` bottom divider, and three parts:
- **Checkbox:** 24px (26px on mobile), `border-2 rounded-[7px]`. The hit target is 44px (pad it). Checked: `bg-teal-text` with a white `Check` icon.
  - Toggling it calls the same server action `CostChecklist` uses today. Reuse the component logic.
  - Partial payment isn't in this row. Long-press or the row menu opens the existing amount editor, and the "amount you paid is offered back" behaviour stays.
- **Label and due line:**
  - Label: `text-sm font-bold truncate`. Paid rows get `line-through text-muted-foreground`.
  - Due line (`text-xs font-semibold`):
    - overdue: "Overdue · Thu 15 Oct", `text-coral-text`
    - due within 14 days: "Due Thu 15 Oct", `text-coral-text`
    - otherwise: "Due Mon 2 Nov", `text-on-accent-muted`
    - settlement ON_TRIP with no due date: "Pay at check-in" for stays, "Pay on the day" otherwise
    - paid: "Paid 2 Sep", `text-teal-text`
- **Amount (right-aligned):**
  - `text-[15px] font-extrabold tabular-nums` in home currency.
  - If the cost's currency differs, the original amount goes underneath in `text-[11px] font-semibold text-muted-foreground`, for example `€760`.

**Legacy paid-without-date:** those rows show "Paid · date missing" in `text-sun-text` and a dashed checkbox border. Ticking it confirms the payment with today's date, as the current flow does. The yellow notice box is removed.

**Empty** (all paid): the header pill reads "All paid", in `bg-teal`, and the list shows paid rows only.

On a fork, the whole card is hidden, as today, and the rates strip takes the full column.

---

## 5. Where it goes

A white card. Desktop: 8 columns, second grid row, `min-h-0`, and the body scrolls inside the card if it overflows. Mobile: the third block.

**Header:**
- `h2` "Where it goes", with a **segmented control** on the right. Reuse `components/ui/segmented.tsx`.
- Options: **Category · Place · Chapter · Day**.
  - Chapter only appears when `chaptersEnabled && budget.byChapter.length > 0`.
  - Day only appears when `daysWithCosts.length > 0`.
- Style: `border-2 rounded-full`. The active segment is `bg-foreground text-background`, and 2px ink dividers separate the segments.
- On mobile the segmented control becomes a `Select`-style pill: "Category ⌄", `border-2 rounded-full text-[13px]`.
- Store the selection in the URL as `?by=category|place|chapter|day`, so it survives refresh and the page stays a Server Component. The control is a small **client** component that calls `router.replace` with `scroll: false`.

**Stacked bar:**
- 26px tall (22px on mobile), `rounded-full border-2 overflow-hidden flex`.
- One segment per row in the current grouping, `width = row.cost / grandTotal`, with a 2px ink right border between segments.
- Segment colours:
  - Category: the category hue.
  - Place: cycle the hue ramp in stop order. Use the chapter colour if the stop belongs to a chapter.
  - Chapter: the chapter colour.
  - Day: hide the bar, because it's too many segments. The rows are enough.
- Segments under 1% are merged into a trailing "Other" segment in `hue-stone`.
- The bar is `aria-hidden`: the rows carry the data.

**Rows**, desktop grid: `grid-cols-[28px_minmax(0,1fr)_56px_120px_110px] gap-3.5 items-center py-[9px] border-b-2 border-muted`.

| Column | Content |
|---|---|
| Swatch | A 28px `rounded-[9px] border-2` tile in the segment colour, with the category's lucide icon at 14px. For Place / Chapter / Day, a plain colour tile with no icon. |
| Name | `text-[15px] font-bold`. Chapter rows use the existing `ChapterChip` instead. Day rows use `formatDay()`, for example "Sat 12 Dec", **never ISO**. |
| % | `text-[13px] font-bold text-muted-foreground text-right`. Hidden for Day. |
| Paid | `text-[13px] font-semibold text-teal-text text-right`, for example "$5,178 paid". Empty when paid = 0 or on a fork. |
| Amount | `text-base font-extrabold text-right tabular-nums` |

- **Mobile rows** have a 14px round swatch, the name, the %, and the amount at 70px right-aligned. There's no paid column.
- **Missing rate:** a category with excluded costs gets a small `bg-sun` "No rate" chip after its name, as today.
- **Chapter reconciliation:** the Ungrouped, Between legs and Other costs rows stay, with `text-muted-foreground` names and no swatch, and only when they're non-zero.

---

## 6. Rates strip

A `bg-sun` tile, desktop 4 columns, sitting at the bottom of the right column (`flex-none`). On mobile it's **not on the main page**. It moves into the "All costs" sheet footer.

- **Header row:**
  - Left: "RATES → AUD" (label style).
  - Right: "Updated 2h ago" (`text-xs font-semibold text-on-accent-muted`). Use relative time from the newest `fetchedAt`. If any rate is manual, it reads "1 set by you".
- **Grid:** `grid-cols-3 gap-2`. If there are more than 3 foreign currencies, the strip wraps to more rows.
  - Each cell is `bg-card border-2 rounded-xl px-2.5 py-2`, with the code (`text-[13px] font-extrabold`) and the rate (`font-display text-[17px]`), for example `1.63`.
  - **Stale:** the rate shows in `text-sun-text` with a small `RefreshCw` icon.
  - **Missing:** `border-dashed bg-background`, and the value reads "Set rate". It's clickable.
- Clicking a cell opens the existing `RatesPanel` for that currency in a popover (desktop) or a sheet (mobile).
- **Missing summary:** when `budget.hasMissingRates`, one line under the grid: "2 IDR costs left out of totals until you set a rate." (`text-[13px] font-semibold`). This **replaces** the full-width warning banner at the top of the page.
- If there are no foreign currencies, the strip isn't rendered, and To pay fills the column.

---

## 7. Desktop layout (≥ 1280, sidebar expanded)

- `main` is `px-10 py-8 flex flex-col gap-5 h-dvh` (the shell already gives the height). The page must **not scroll at 1440×900**.
- Below it sits the grid:

```
grid grid-cols-12 grid-rows-[268px_minmax(0,1fr)] gap-[18px] flex-1 min-h-0

[ Cost tile      col-span-8 row 1 ] [ Right column  col-span-4 row-span-2 flex flex-col gap-[18px] ]
[ Where it goes  col-span-8 row 2 ] [   To pay (flex-1 min-h-0, list scrolls) / Rates (flex-none) ]
```

- Export the class as `MONEY_DESKTOP_GRID_CLASS`, replacing `BUDGET_DESKTOP_GRID_CLASS`, and update the tests.
- **1024–1279** (rail sidebar): same grid, and the Cost tile total drops to 72px.
- **768–1023:** single column, auto rows, in mobile order but with the 2-column settlement box inside the tile, and the page scrolls.
- **Taller than 900:** Where it goes grows. **Shorter than 760:** drop the fixed height and let the page scroll, so nothing gets clipped.

Nav: in the trip sidebar, **Money** is active. The Money nav item shows a count of unpaid items that are due or overdue within 14 days, if there are any.

## 8. Mobile (< 768)

The order, all `mx-[18px] gap-3.5`:
1. Header (trip name, h1 "Money", and a round **+** button, 44px, ink with `shadow-[3px_3px_0] shadow-coral`)
2. Cost tile
3. To pay (top 2, "6 left ›")
4. Where it goes

- The trip tab bar is Home · Plan · Today · Money · More, with Money active (`bg-coral border-2`).
- There's 110px of bottom padding to clear the tab bar.

## 9. States

| State | Behaviour |
|---|---|
| No dates | Keep the current `EmptyState` ("No dates yet"), but restyled with the Playground EmptyState, and with a CTA that opens trip settings to set the dates. |
| No costs | The header renders as normal. Instead of the grid, show one coral tile (span 8): "Nothing costed yet", with the body "Costs show up here as you add flights, stays and things to do." and a **+ Add a cost** CTA, plus a dashed To pay placeholder (span 4) reading "Due dates will line up here". No zero tiles. |
| Fork / variant | Show `VariantBanner` above the grid. The cost tile has no paid bar. To pay is hidden. |
| Missing rates | See §6. The category chips stay. |
| Everything paid | The bar is full. The right side of the row reads "All paid". The To pay pill is `bg-teal` "All paid". |

## 10. Files

Server Component unless marked **client**.

```
app/(app)/trips/[tripId]/budget/page.tsx     Server. Same data; new layout; reads ?by=
components/money/money-header.tsx            Trip name, h1, meta line, Split with, + Add a cost slot
components/money/add-cost-button.tsx         client. Dialog / sheet wrapping OtherCostEditor
components/money/cost-tile.tsx               Total, per night, per person, settlement box, paid bar
components/money/paid-bar.tsx                client (count-up + fill animation only)
components/money/to-pay-card.tsx             Server shell + list
components/money/to-pay-row.tsx              client. Checkbox → existing paid action; optimistic
components/money/breakdown-card.tsx          Server. Renders the rows for the current ?by=
components/money/breakdown-switch.tsx        client. Segmented / select → router.replace
components/money/stacked-bar.tsx             Segments; merges tiny ones
components/money/rates-strip.tsx             Cells + popover trigger (client for the popover only)
lib/money/format-parts.ts                    formatMoneyParts(minor, ccy) → { whole, fraction|null }
lib/money/to-pay.ts                          Pure: mergeToPay(costs, today) → sorted rows with dueTone
lib/money/breakdown.ts                       Pure: rowsFor(budget, by) → { key, label, colour, icon?, pct, cost, paid }[]
```

- `SpendSoFarCard`, `UpcomingPaymentsCard`, `SettlementSplit` and `BudgetHeroRow` become unused on this page. `BudgetGlance` on trip home still uses the budget lib, and doesn't change.
- Delete the unused components once `grep` shows no other imports.
- **Tests:** unit-test `mergeToPay`, the sort order and due tones, `rowsFor` (merging small segments and chapter gating) and `formatMoneyParts` (JPY/IDR have no fraction). Update `budget-page.test.tsx` for the new structure.
