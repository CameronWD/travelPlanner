# Plan page

Route: `app/(app)/trips/[tripId]/plan/page.tsx`. It stays a **Server Component**.

**Keep the data layer exactly as it is.** That covers every query, `planScope`/fork handling, `orderPlanStops`, `groupScheduledItemsByStop`, `loadDayTitles`, the reminders and notes/attachments maps, and the drive-estimate calculation. This is a presentation rewrite of:

| Component | What changes |
|---|---|
| `components/trip/plan-overview.tsx` | Replaced by the **Fit tile** (§6.2) |
| `components/trip/plan-stops-nav.tsx` | Restyled as the **Jump list** (§6.3). Keep its scroll-spy and hash logic. |
| `components/trip/stop-card.tsx` | Redesigned: a **folded row** plus an **open body** (§3–4) |
| `components/trip/stop-day-list.tsx` | Replaced, inside stop-card, by the **day strip + selected day** (§4.2–4.3) |
| `components/trip/transport-card.tsx` | Becomes a **leg pill** on the line between stops (§2). The full card content moves into the edit sheet. |
| `components/trip/accommodation-card.tsx` | Summarised in the **stay chip** (§4.1). The full card opens in a sheet. |
| `components/trip/home-base-card.tsx` | Restyled as a dashed bookend row (§1.3) |
| `components/trip/itinerary-manager.tsx` | Keeps all its state, dnd-kit and dialog logic. Only the layout and markup it renders around the pieces above changes. |

---

## 1. Page frame (desktop ≥1280, sidebar expanded)

### 1.1 Header
Use `<PageHeader>` (`AUDIT.md` §1):
- **eyebrow:** the trip name with year, e.g. "Christmas in Europe 2026"
- **title:** "Plan"
- **meta:** `{stopCount} stops · {roughCount} rough · {formatRange(start, end)}`. Leave out the rough part when it's 0, and the range when there are no dates.

Actions, right-aligned, in this order:
1. **Chapters:** an outline pill. It opens the existing chapters manager in a popover. Only shown when `chaptersEnabled`.
2. **Paste a booking:** an outline pill. It opens the existing `AiBookingParser` in a Dialog. Hidden when `!isAiConfigured()`. This **moves here from Checklists** (see `AUDIT.md`).
3. **+ Add a stop:** the ink primary (`bg-foreground text-background shadow-cta`). It opens the add-stop sheet (§7.3), or on desktop a Dialog with the same content.

The portal slot `PLAN_ASIDE_ACTIONS_ID` is no longer needed. Add stop and Chapters live in the header now. Remove the portal and its test.

### 1.2 Grid
```
main:  px-10 pt-8  flex flex-col gap-5
body:  grid grid-cols-[minmax(0,1fr)_320px] gap-6 items-start
list:  flex flex-col   (page scrolls, the list is not a scroll container)
rail:  sticky top-6 max-h-[calc(100dvh-3rem)] flex flex-col gap-4
```
- Keep `PLAN_ASIDE_CLASS`'s sticky behaviour, but width 320 and `gap-4`.
- **1024–1279** (rail sidebar): the rail drops to 280. The Fit tile number goes from 48 to 40.
- **Below 1024:** there's no rail. The mobile layout from §7 applies, but with cards at the tablet width.
- **No stops:** there's no rail, and the list shows one coral EmptyState-style tile: "No stops yet", with the body "Add the first place you're going. You can keep it rough and sort dates later." and an **+ Add a stop** CTA.

### 1.3 List order
```
[Home base bookend: origin]           (if homeName)
  leg (home → stop 1)                 (if a transport exists or a leg is expected)
[chapter divider]                     (when chapters on and the chapter changes)
[stop row]
  leg
[stop row]
  …
[Home base bookend: return]           (if roundTrip)
```
**Home base bookend:**
- 44px tall, `border-2 border-dashed rounded-[14px] bg-background px-3.5 flex items-center gap-2.5`.
- It contains the `House` icon, the name (`text-sm font-bold`), and "Home base · leave {Fri 4 Dec}" or "Home base · back {Fri 8 Jan}" (`text-[13px] font-semibold text-muted-foreground`).
- Keep the ids `home-base-top` / `home-base-bottom`, because the jump list targets them.

**Chapter divider:**
- A pill with the chapter name, upper-cased: `text-[11px] font-extrabold tracking-[0.08em] border-2 rounded-full px-2.5 py-0.5`, with the chapter colour as its fill.
- Then a 2px `bg-muted` rule (`flex-1`), then a right-aligned summary: "{n} stops · {dates}".

---

## 2. Leg pill (replaces transport-card between stops)

Structure: a vertical 2px connector line at `ml-[26px]` (the centre of the stop's number tile), then the pill at `ml-[18px]`. The row is at least 52px tall on desktop and at least 40px on mobile.

**Pill:**
- `h-[34px] px-3 border-2 rounded-full bg-card flex items-center gap-2 text-[13px] font-bold whitespace-nowrap`
- It holds the mode icon, a label and a sub-label.
- The sub-label is `text-xs font-semibold text-muted-foreground`.

| Case | Line & pill border | Label | Sub |
|---|---|---|---|
| Transport with times | solid | "Flight CDG → FCO" (the mode, then `depPlace → arrPlace` shortened to IATA/station codes when they're available) | "Tue 15 Dec 10:05" (the depAt day and time in the departure tz) |
| Transport, car, no times | solid | "Drive" | "~3h 20m · 240 km", from the existing `driveEstimate` |
| Transport, no times, not a car | solid | "Train" | "Tue 22 Dec" (the date only) |
| **No transport between two dated stops** | **dashed**, pill `bg-background` | "How are you getting to {next stop}?" | "Add", in `text-coral-text` |
| Between rough stops | no pill | Just the dashed connector line. We don't nag about legs until stops have dates. | |

- **Click:** opens the transport sheet (§7.4), pre-filled with `fromStopId`/`toStopId` and the date. It's in edit mode if a transport exists, create mode if not.
- **Hover:** `pressable`.
- **Accessible name:** "Flight from Paris to Rome, Tuesday 15 December 10:05. Edit." or "Add transport from Rome to Florence".
- **Several transports** between the same pair (a connection, for example): stack the pills with a 6px gap on the same line.

---

## 3. Stop row (folded)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [3]  Rome  Italy                          Tue 15 – Tue 22 Dec  [⋯][⌄] │
│      (✓ Hotel Artemide) (4 plans) (3 ideas)          CET  (7n)        │
└──────────────────────────────────────────────────────────────────────┘
```
**Container:**
- `rounded-[20px] border-2 bg-card shadow-4 overflow-hidden`, and **`flex-none`** so it never shrinks in a flex column.
- Keep `id="stop-{id}"`, `data-stop-id`, `scroll-mt-6`, and the `data-highlight` ring behaviour for jump-list clicks.

**Grid:** `grid-cols-[40px_minmax(0,1fr)_auto_auto] gap-3.5 items-center px-4 py-3.5`
1. **Number tile:**
   - 40px, `rounded-xl border-2`, filled with the stop colour (`stopHue(sortOrder)` → `HUE_CLASSES[h].fill`).
   - The number is `font-display text-lg`. It's the stop's index in plan order, counting from 1; the home base isn't numbered.
2. **Place:**
   - The name is `font-display text-2xl font-extrabold tracking-[-0.02em]`, followed by the country in `text-[13px] font-semibold text-muted-foreground`. Keep the `MapLink` pin after the country when there are coordinates.
   - A chips row sits underneath (`mt-1.5 flex gap-1.5 flex-wrap`). Each chip is `h-[26px] px-2.5 border-2 rounded-full text-xs font-bold`.
   - **Stay:**
     - covered: "✓ {first accommodation name}", with a `bg-teal/15` fill
     - partly covered: "✓ {name} · 2 nights open", fill `bg-sun/30`
     - none: **"No bed yet"**, dashed border, `bg-coral/20`
     - rough stop: no stay chip
   - **Plans:** "{n} plans", counting the stop's scheduled items. Hidden when it's 0.
   - **Ideas:** "{n} ideas", counting its things-to-do with no date. Hidden when it's 0.
   - **Special:** a day title that falls on a holiday (for example "Christmas Day") can show as a chip. That's optional; skip it if there's no data.
3. **Dates** (right-aligned, `whitespace-nowrap`):
   - The range in `text-sm font-bold`, via `formatDateRange` without the year.
   - Underneath: the tz abbreviation (`text-[11px] font-semibold text-muted-foreground`) and a nights pill in the stop colour, e.g. "7n" (`text-xs font-extrabold border-2 rounded-full px-2`).
   - A same-day visit shows "Same day" instead.
4. **Actions:** two 36px square buttons (`border-2 rounded-[10px] bg-card`):
   - **⋯:** the existing `MoreActionsMenu` with the same `menuItems` it has today. Group it on desktop too (§7.5).
   - **⌄ / ⌃:** fold toggle. It gets `bg-sun` when open. `aria-expanded` and `aria-controls` point at the body.

The **Edit** (pencil) and **Add thing to do** (+) buttons are removed from the row. Edit moves into the ⋯ menu as its first item, and Add moves into the open body.

**Rough stop:**
- Dashed border everywhere: the card, the number tile and the nights pill.
- `bg-background`, no shadow.
- The number tile is filled `bg-muted`.
- The dates column shows "Rough" in bold, with a "~5n" pill under it.
- A `GripVertical` drag handle sits to the left of the number tile. This is the existing `dragHandle` prop.

**Fold state:**
- On desktop any number of stops can be open. Default: the **current stop** when travelling, otherwise the **first stop with any plans**, otherwise none.
- Persist the open set in the URL hash (`#open=a,b`), so a reload or a link keeps it. Deep links like `#stop-<id>` open that stop and ring it, as they do today.

---

## 4. Open body

`border-t-2 bg-background px-4 pt-3 pb-3.5 flex flex-col gap-2.5`

### 4.1 Stay + ideas strip
One row, `flex gap-2.5 items-stretch`.

**Stay chip** (`flex-none`):
- `bg-teal/15 border-2 rounded-[14px] px-3 py-1.5`, with the `BedDouble` icon.
- The name is `text-[13px] font-bold`.
- Underneath: "✓ All 5 nights · in 15:00", `text-[11px] font-semibold text-teal-text`.
- Partial cover: "3 of 5 nights · Add another place", in `text-coral-text`.
- None: a dashed coral chip, "No bed yet · + Add a stay".
- Click opens the accommodation sheet.
- Several accommodations: show the first one, then "+1 more" in the sub line.

**Ideas box** (`flex-1 min-w-0 overflow-hidden`):
- `border-2 border-dashed rounded-[14px] px-2.5 flex items-center gap-1.5`.
- It starts with the label "{n} IDEAS", followed by one chip per unscheduled thing-to-do: a 9px category dot, the title, and a coral `ChevronDown`.
- Each chip opens the existing `DayPickerMenu` (as a popover) to schedule the idea. On pick it calls `scheduleItem` and keeps the times, as `handleScheduleThing` does today.
- It ends with **+ Add an idea**, which opens `ItemFormDialog` with `defaultUnscheduled`.
- Overflow: if the chips don't fit, show as many as fit, then a "+2" chip that opens a popover listing the rest.
- No ideas: the box shows just "+ Add an idea", dashed.
- Items marked hidden from shares keep the `EyeOff` glyph after their title.

### 4.2 Day strip
This replaces `StopDayList` on desktop. It's one row with **one slot per day of the stay** (`enumerateTripDays(arrive, depart)`), in a `flex gap-1.5` container.

**Slot:**
- `flex-1 min-w-[58px] h-16 border-2 rounded-[14px] bg-card overflow-hidden flex flex-col items-center` (the 1d close-up uses a taller 82px slot).
- **Top band:** 6px tall. When the day has a **day title**, it's filled `bg-sun` with a 1.5px ink bottom border. Otherwise it's transparent.
- Then "FRI 11" (`text-[10px] font-extrabold tracking-[0.08em]`).
- Then the title, truncated (`font-display text-[13px]`). This line only appears when the slot is wider than 90px; otherwise the band alone signals that there's a title.
- Then the **density dots:** one 7px dot per scheduled plan, up to 5, each in its category colour, `gap-[3px]`.
- **Empty day:** dashed border, `bg-background`, with "Free" in place of the title.
- **Selected:**
  - `bg-coral shadow-1 -translate-y-0.5`.
  - The dots turn white (with their ink border).
  - `aria-selected="true"`, and the strip has `role="tablist"`: each slot is a `role="tab"` controlling the selected-day panel.
- **Changeover days** (ADR 0049), which belong to two stops: show the slot in both stops. On the arrival stop, add a small `→` glyph before the day name ("→ TUE 15").
- **Overflow:** up to 11 slots fit across the ~730px card. For longer stays, the strip becomes a horizontal scroller (`overflow-x-auto snap-x`) with 36px round arrow buttons on each end, which fade in when there's more to see. Keep the selected slot scrolled into view with `scrollLeft` maths; don't use `scrollIntoView`.

**Default selection:**
- If the stop is current, today.
- Otherwise the first day with plans.
- Otherwise the first day.

Persist it in the hash as `&day=YYYY-MM-DD`.

**Keyboard:**
- ←/→ move the selection, and Home/End jump to the first or last day.
- Enter on a slot does the same as Open day (§4.3).

### 4.3 Selected day panel
The card is `bg-card border-2 rounded-2xl shadow-3 overflow-hidden`.

**Head** (`bg-sun border-b-2 px-3.5 py-2.5 flex items-center gap-2.5`):
- Label: "FRI 11 DEC", `text-[11px] font-extrabold tracking-[0.08em]`.
- **Day title:**
  - `font-display text-[22px]`, with a `Pencil` icon beside it. It's an inline edit (click, input, Enter to save, Esc to cancel) using the existing day-title action.
  - Untitled: "Add a title" in `text-foreground/45`. Clicking it starts editing.
- Summary: "6 plans · 2 booked", in `text-xs font-semibold text-on-accent-muted`. On the 1d close-up it also shows "· €96 so far" (the sum of those items' costs, in home currency). Include it when there are any costs.
- **Open day ›:** an outline pill that links to `/trips/[slug]/day/[date]`.
- **+ Add:** an ink pill that opens `ItemFormDialog` with the date preset.

**Rows** (one per scheduled item on that date, in `sortOrder`):
```
grid-cols-[14px_46px_12px_minmax(0,1fr)_auto] gap-2.5 items-center px-3.5 min-h-10 border-b-2 border-muted
```
Left to right:
1. `GripVertical` handle (dnd-kit sortable).
2. Time, `text-[13px] font-extrabold tabular-nums`. Untimed items show "—" in muted.
3. An 11px category dot.
4. The title (`text-sm font-bold`), then the address or first line of notes (`text-xs text-muted-foreground truncate`) on the same baseline.
5. Tags:
   - **Booked ✓** (`bg-teal/15`) when `booking` is set.
   - The cost, formatted in the item's own currency, e.g. "€22".
   - The photo thumb (the existing `ItemPhotoThumb`, 24px) when there's a photo.
   - The `EyeOff` glyph when the item is hidden from shares.

- **Row click:** opens `ItemFormDialog` in edit mode, with its costs and attachments.
- **Drag:**
  - Reorder within the day.
  - Or **drop onto a slot in the day strip** to move the item to that day. That calls `scheduleItem(id, { date, startTime, endTime })` and keeps the times. The target slot flashes coral (see `MOTION.md` P6).
- **Empty day:** one row, "Nothing planned yet", with an "+ Add to Sun 13" link and, if the stop has ideas, "or pick an idea" (which opens the ideas popover).
- **Footer** (when there are more than 0 rows): "+ Add to {day}" (coral link) on the left, and the hint "Drag a plan onto a day above to move it" (`text-[13px] text-on-accent-muted`) on the right. Show the hint only once per session.

**Reminders, notes and files:** these no longer render inline on the card. They're items in the ⋯ menu, each with a count, e.g. "Notes (2)". The stop's own `notes` text (a free-text field) shows as a one-line muted preview under the chips row on the folded card, only when it's set.

---

## 5. Rough stops, chapters and forks
- **Rough stops** have no day strip, because they have no days. Their open body shows the stay strip ("Needs dates first", non-interactive) and the ideas box. Under those, a single "Give it dates" ink pill opens Adjust dates.
- **Chapters** keep `chapterForStop` for grouping. The "Start a chapter here" and "Assign to chapter" items stay in the ⋯ menu.
- **Forks:** `VariantBanner` sits above the header, as it does today. Everything else behaves the same.

---

## 6. Right rail (desktop)

### 6.1 Mini map
- 210px tall, `rounded-[22px] border-2 shadow-4 overflow-hidden`.
- It's the existing `RouteMap` in compact mode: numbered pins in stop colours, rough stops with dashed borders, and a dashed route line (solid for legs already travelled, when travelling).
- **Overlays:**
  - bottom right: "Open map ⤢", a card pill that opens the full map.
  - bottom left: when the home base is far away, "+ Sydney ↗" (the far-stop tag from `TRIP_COVER.md`).
- Clicking a pin jumps to that stop, as the jump list does.

### 6.2 Fit tile (replaces PlanOverview)
Built from `summarizePlan()` output, with no new logic.

| `hardEndState` | Tile colour | Big number | Words |
|---|---|---|---|
| `ok` | `bg-teal` | slack nights | "nights / spare" |
| `approaching` (0–1 spare) | `bg-sun` | slack nights, or "0" | "nights spare" or "right on it" |
| `over` | `bg-coral` | nights over | "nights / over", with a **Make it fit** button (the existing `MakeItFit`) |
| `unset` | `bg-card` | — | "Set a home-by date" (the `HardEndDateControl` trigger) |
| `dormant` | `bg-card` | — | "Set a start date to check this" |

- **Pill:** "FITS YOUR DATES" (or "RUNS OVER" when over). On the right, "Home by Fri 8 Jan", which is clickable and opens `HardEndDateControl`.
- **Bar:**
  - 18px tall, `border-2 rounded-full bg-card overflow-hidden flex`.
  - The first segment is scheduled nights (`bg-foreground`). The second is rough projected nights (a hatched `repeating-linear-gradient` of foreground and card, 3px/4px). The remainder is empty.
  - When over, the bar is full and a coral hatch extends past the end marker.
- **Legend line:** "28 set · ~5 rough" on the left and "of 35" on the right, in `text-xs font-bold`.
- **Live region:** keep `role="status" aria-live="polite"` on the words, as today.

### 6.3 Jump list
- A card tile (`border-2 rounded-[22px] shadow-4 p-3`), with the label "JUMP TO".
- **Rows:** 36px tall, `rounded-[10px] px-2 gap-2.5`, each with a 12px dot in the stop colour (dashed when rough), the name, and the compact dates or "~5 nights".
- The row currently in view (from scroll-spy) gets `bg-teal/15 border-2`.
- Chapter headings appear as small labels between rows, as today.
- Home base rows stay at the top and bottom.
- Keep all the behaviour of `plan-stops-nav.tsx`: click → scroll + ring, hash deep link, IntersectionObserver.
- Replace `el.scrollIntoView` with a `window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 24, behavior })` helper, and use the same helper for the day strip.

---

## 7. Mobile (<768)

### 7.1 List (`plan-mobile.png`)
- **Header:** the trip name (`text-sm text-muted-foreground`), H1 "Plan" (32px), and a round 44px **+** button (ink with a coral shadow) that opens **Add a stop**.
- **Fit strip:**
  - `bg-teal border-2 rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5`.
  - It shows the number (`font-display text-[30px]`), "nights spare", a 14px bar (`flex-1`), and "Map ⤢", which opens a full-screen map sheet.
  - It uses the same colour states as the Fit tile.
- **Stop rows** (at least 64px, `rounded-[18px] border-2 shadow-3 px-3 py-2.5`):
  - a 36px number tile
  - the name (`font-display text-[19px]`)
  - a summary line (`text-xs`): "✓ The Hoxton · 9 plans", or "No bed yet · 4 plans" in `text-coral-text`
  - on the right, compact dates and the nights pill
- The whole row is the tap target, and it opens the **stop sheet**.
- **Leg pills:** 28px tall, `text-xs`, on a connector at `ml-5`. The dashed "Add transport" style is the same as on desktop.
- **Rough rows:** dashed, `bg-background`, no shadow. The sub line reads "Drag to reorder" (long-press to drag).
- **Tab bar:** Plan active.

### 7.2 Stop sheet
The first phone in `plan-mobile-editing.png`. It's a full-screen Radix Dialog, drawn as a page (slide up), with `?stop=<id>` in the URL so the browser Back button closes it.
- **Top row:**
  - a 44px ← button (closes)
  - a 44px number tile
  - the name (`font-display text-[28px]`)
  - a meta line: "Thu 10 – Tue 15 Dec · 5 nights · CET"
  - a 44px ⋯ button (the actions sheet, §7.5)
- **Tabs:** `Segmented` full width, with three options:
  - **Days**
  - **Stay ✓** (the ✓ shows when covered; "Stay !" in coral when "No bed yet")
  - **Ideas {n}**
- **Days tab:**
  - A vertical list, one block per day. The head has "Thu 10", the tag (Arrive / Leave), the title if any, and a 32px **+** on the right.
  - Under the head, **all** items (time, dot, title) are listed. Mobile shows them all, with no "+N more"; the sheet scrolls.
  - Empty days read "Free day. Tap + or pick an idea."
  - Tapping an item opens the item sheet, and long-press drags it.
- **Stay tab:** the full accommodation card(s) plus "+ Add a stay".
- **Ideas tab:** the idea rows (at least 52px): dot, title, and a sun-coloured **Pick day** pill.
- **Sticky footer:** **Edit dates** (outline) and **+ Add a plan** (ink, `flex-1`). The latter presets the day block nearest the top of the scroll.

### 7.3 Pick a day
The second phone. A bottom sheet over the stop sheet, with a 45% ink scrim.
- **Head:** "Pick a day for", then the idea title (`font-display text-2xl`).
- **One row per day** of the stay (at least 50px, `border-2 rounded-[14px]`): the day, then the load, e.g. "2 plans", "Versailles day · full" or "Free day". A day counts as **full** at 5 or more plans.
- The selected row is `bg-teal shadow-1` with a ✓.
- The CTA reads **Add to {day}**. It calls `scheduleItem` and closes; the idea moves to the Days tab.

### 7.4 Add a stop
The third phone. A bottom sheet, taking the full height minus 118px.
1. **Place search:** the same combobox as New trip step 3 (`NEW_TRIP.md` §4). Results show a leaf dot, the name and the region, e.g. "Tuscany, Italy · near Rome". Results near the current route rank first.
2. **"HOW LONG":** a Segmented control with **Exact dates** and **Roughly**.
   - Roughly shows a nights stepper: 44px − / + buttons, the number in `font-display text-[34px]`.
   - Exact shows the range calendar from New trip.
3. **"GOES AFTER":** a select, defaulting to the last stop, with each option showing the stop dot, name and dates.
4. **Live consequence line** (`text-[13px] font-semibold`):
   - "Lands on Tue 22 – Sun 27 Dec. 0 nights spare after this."
   - When it would push past the hard end: "Pushes you 2 nights past Fri 8 Jan." in `text-coral-text`.
   - It uses the same maths the scheduler uses. Compute it client-side from the existing `summarizePlan` inputs.
5. **CTA:** "Add {place}". It's disabled until a place is picked; free text is allowed as a fallback.

On desktop, the same content goes in a Dialog (560 wide).

### 7.5 Fill a leg / edit transport
The fourth phone. A bottom sheet, which is the existing `TransportFormDialog` restyled.
- **Context row:** the from-stop pill → the to-stop pill, each in its stop colour, with the date on the right.
- **H:** "How are you getting there?" (create) or "Train to Florence" (edit).
- **Mode grid:** `grid-cols-3 gap-2`, six 52px tiles (Train, Car, Flight, Bus, Ferry, Other). The selected tile is `bg-coral shadow-1`. Car hides the time fields and shows the drive estimate.
- **Leaves / Arrives:** two field cards, each with a small label ("Leaves Roma Termini") and a time (`text-[17px] font-extrabold`). The dates default to the stop change date.
- **Booking ref:** the label reads "Booking ref · only people on the trip see this".
- **Paste a booking:** a sun-coloured row, "Got the confirmation email?", with a **Paste a booking** pill. It swaps the sheet over to `AiBookingParser`, pre-scoped to this leg.
- **Cost:** a row with "+ Add cost", which expands the existing cost fields inline.
- **CTA:** "Add {mode}" (create) or "Save" (edit). In edit mode there's also a "Delete leg" ghost button at the bottom.

### 7.6 Stop actions
The fifth phone. A bottom sheet. The same `menuItems`, **grouped** into three cards:
1. Edit name & place · Adjust dates ("moves later stops") · Pin dates / Unpin ("stops the shuffle") · Make rough
2. Start a chapter here · Assign to chapter (rough only) · Add a reminder · Notes ({n}) · Files ({n})
3. **Delete {stop}** in `text-coral-text`, with the "owner only" hint. It opens the existing `DeleteStopDialog` with its deletion preview.

- Rows are at least 48px, each with an icon, a label and a right-aligned muted hint.
- On a rough stop, "Adjust dates / Pin / Make rough" become "Move up / Move down / Give it dates".
- On desktop, `MoreActionsMenu` uses the same groups, with separators between them.

---

## 8. Files

Server Component unless marked **client**.

```
app/(app)/trips/[tripId]/plan/page.tsx        Server. Same data; renders PageHeader + PlanBody
components/plan/plan-body.tsx                 client. Wraps ItineraryManager; owns open-set + selected-day hash state
components/plan/stop-row.tsx                  client. Folded row (§3)
components/plan/stop-open-body.tsx            client. §4 container
components/plan/stay-chip.tsx                 Stay chip + sheet trigger
components/plan/ideas-box.tsx                 client. Chips + DayPickerMenu popovers + overflow
components/plan/day-strip.tsx                 client. Slots, tablist a11y, overflow arrows, drop targets
components/plan/selected-day.tsx              client. Head (inline title edit) + sortable rows
components/plan/leg-pill.tsx                  Leg pill + dashed "add" variant
components/plan/home-base-bookend.tsx         Replaces home-base-card.tsx
components/plan/fit-tile.tsx                  Replaces plan-overview.tsx (keeps HardEndDateControl + MakeItFit)
components/plan/jump-list.tsx                 Restyled plan-stops-nav.tsx (same logic)
components/plan/mobile/stop-sheet.tsx         client. §7.2
components/plan/mobile/pick-day-sheet.tsx     client. §7.3
components/plan/mobile/add-stop-sheet.tsx     client. §7.4 (Dialog on desktop)
components/plan/mobile/transport-sheet.tsx    client. §7.5 (restyled TransportFormDialog)
components/plan/stop-actions.ts               Pure: buildStopActions(stop, flags) → grouped items (shared desktop/mobile)
lib/plan/leg-label.ts                         Pure: legLabel(transport, stops) → { icon, label, sub, missing }
lib/plan/day-density.ts                       Pure: daySlots(stop, items, dayTitles) → { dateISO, dow, num, title?, dots: Category[], changeover }
lib/scroll-to.ts                              Pure-ish: scrollToId(id, reduced) — replaces scrollIntoView use
```

Once `grep` shows no other imports, delete `stop-day-list.tsx` and the old `plan-overview.tsx`. `transport-card.tsx` may still be used by the Day page; check before deleting it.

**Tests:**
- Unit-test `legLabel` (every case in §2), `daySlots` (changeover, the cap at 5, empty days) and `buildStopActions` (rough vs dated, owner vs not).
- Update `stop-card.test.tsx` and `plan-stops-nav.test.tsx` for the new markup.
- Keep the existing assertions that ban `shadow-soft`, and add them to every new component.
