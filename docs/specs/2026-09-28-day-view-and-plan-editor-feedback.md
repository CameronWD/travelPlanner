# Day view and Plan editor — six Feedback notes (2026-09-28)

Decisions taken in the grilling session on 2026-09-28. Where this file and older specs or
design handoffs differ, **this file wins**. No design handoff exists for this work.

Feedback notes this closes (commit trailers, not `feedback:resolve`, until deployed — ADR 0040):
- `cmukmzc35000204lecgcb1djo` — Day view strip only reaches ~7 days ahead.
- `cmukmuzqg000004lerleg2ja2` — Day view arrows shift between days on phone.
- `cmukmw2ks000104le2i7lbxtj` — page content flashes above the phone tab bar on Money → Plan.
- `cmukh0jjg000004kxwz9czuxp` — "NAME THIS DAY" banner above every day in the plan editor.
- `cmukh1ghk000104kx47j9g7oc` — purple staying tile duplicates the section; multiple Accommodation.
- `cmukh2bzz000204kxk8kxq04o` — Accommodation name wraps one letter per line on iPhone.

---

## 0. Decisions (from the interview)

| # | Question | Decision |
|---|---|---|
| D1 | The Day view strip is a 9-day window centred on the current day (`STRIP_DAYS = 9`, `lib/day-view-loader.ts:54`). | **Every day of the Trip at every width.** The strip stays a viewport-wide horizontal scroller; it holds all the Trip's days and is scrolled so the current day lands where it lands today. Desktop gives up the 9-equal-columns layout for the same scroller. Glossary: Day view (amended). |
| D2 | On phone the arrows sit 14px either side of a text-width title block, so they move sideways and vertically as the eyebrow, date, Day title and sub-line change. | **Phone: arrows pinned to the header's far edges**, title block fills the middle and truncates. **Desktop: the title block gets a fixed minimum width** sized to the widest date label the heading can produce, text centred inside it. **Both:** arrows are anchored vertically to the date heading line, so the optional Day title and sub-line lines can appear or vanish without moving them. |
| D3 | Money → Plan crossfades via a native View Transition; the fixed tab bar and sticky phone top bar have no `view-transition-name`, so they sit in the static root snapshot beneath the fading section. | **Give the phone tab bar and the phone top bar their own `view-transition-name`s** so each is captured as its own group painted above the section snapshots. No layout or navigation change. Amends ADR 0063 (consequence added). |
| D4 | "Name this day" is a permanent uppercase button above every untitled day row in every Stop card. | **The Day view becomes the primary place to add and edit a Day title; the plan editor stops prompting.** Day view header: "Add a title" under the date when empty, tap the title to edit when set. Plan editor: untitled rows show nothing by default with a quiet add affordance (hover on desktop, the day's overflow actions on phone); an existing title shows as a plain normal-case label, click to rename. Forks keep Day titles because the plan editor path survives. A title set from the Day view on a Changeover day is owned by the Stop the Day view already treats as the day's Stop (the arriving one). |
| D5 | On lg+ the Stop header carries a solid purple tile with the first Accommodation's name (or coral "No bed yet"), and the "Where you're staying" section directly below repeats the same name. | **The Accommodation lives in exactly one place on the card, the "Where you're staying" section, at every width.** The staying tile leaves the header grid (place · dates · actions). "No bed yet" becomes the section's empty state at every width. The heading text stays (glossary: Accommodation). |
| D6 | Several Accommodations per Stop are allowed by the model and the glossary ("usually one, occasionally more"), but "Add accommodation" is a full button regardless of how many exist. | **Keep the model. The add affordance follows the nights.** While any night of the stay is uncovered by an Accommodation, "Add accommodation" shows as now. Once every night is covered it becomes a quiet "Add another place" link at the end of the section. No cap, no overlap check. |
| D7 | The collapsed Accommodation row is one flex line whose fixed-width siblings squeeze the name to ~0px below `sm`, where `break-words` then wraps it letter by letter. | **Below `sm` the row is two lines:** name (truncating) and chevron on the first; date range and paid badge on the second. The confirmation number is not shown in the collapsed row on phones; it remains in the expanded card. From `sm` up nothing changes. |

## 1. Detail per item

### 1.1 Strip holds every day (D1) — `cmukmzc35000204lecgcb1djo`

- `lib/day-view-loader.ts`: `windowDates` becomes the Trip's full date range (`startDate` … `endDate`,
  inclusive). `STRIP_DAYS` goes. The dot-count query (`date: { in: windowDates }`) widens to the
  Trip's range — use a `gte`/`lte` range rather than a long `in` list. `citySegments` and the
  strip model are built over the full range.
- `lib/day-view-model.ts`: `dayStripWindow` is deleted with its tests, or reduced to a pure
  `tripDays(start, end)` helper.
- `components/trip/day/day-strip.tsx`: one layout at every width — the phone scroller
  (`flex snap-x snap-mandatory gap-2 overflow-x-auto`) with fixed-width chips. The desktop
  `repeat(n, minmax(0,1fr))` grid and its `aria-hidden` mirror go. The existing
  `useLayoutEffect` that positions the current chip (third position, via `scrollLeft`) now
  runs at every width. Wheel-to-horizontal scrolling stays.
- Keyboard: left/right on the strip still moves one day. Arrows and swipe are unchanged
  (they already step through the whole Trip).
- Long trips: a 60-day trip is 60 chips. That is fine; it scrolls. No virtualisation.

### 1.2 Arrows stay put (D2) — `cmukmuzqg000004lerleg2ja2`

`components/trip/day/day-header.tsx:101-112`.

- The row becomes a three-column grid, `44px minmax(0,1fr) 44px`, at every width. On phone
  that pins the arrows to the header's edges (the row spans the full content width). On
  desktop the grid is `auto`-sized to its content so the arrows stay beside the title, but the
  middle column has a fixed `min-width` (a shared token, sized to the widest heading such as
  "Wed 30 Dec 2026" at 40px display size) with the text centred inside it.
- Vertical anchor: the arrows align to the `h1` line, not the block's centre. Implement by
  giving the title block a fixed slot for the eyebrow above and the sub-line below (reserved
  `min-height`s), or by aligning the grid items to the heading's baseline; either is
  acceptable, the test is that the arrow's bounding box is identical across days that differ
  in Day title presence, sub-line presence, eyebrow length and date width.
- Truncation: eyebrow, Day title and sub-line truncate within the middle column; the date
  heading never truncates (the min-width guarantees it fits).
- A Vitest test renders the header for four representative days (with/without Day title,
  with/without sub-line, short/long eyebrow, short/long date) and asserts the arrow elements'
  computed layout classes are identical; the Playwright nav audit adds a bounding-box check
  on a phone viewport across three consecutive days.

### 1.3 Chrome above the crossfade (D3) — `cmukmw2ks000104le2i7lbxtj`

- `components/ui/tab-bar.tsx` (`<nav>` used by `components/trip/mobile-tab-bar.tsx` and
  `AppTabBar`) gets `view-transition-name: tp-tab-bar`. The phone top bar `<header>` in
  `app/(app)/layout.tsx` gets `view-transition-name: tp-top-bar`. Both via a class in
  `app/globals.css`, next to the existing `::view-transition` rules, with
  `::view-transition-old/new(tp-tab-bar|tp-top-bar) { animation: none; }` so they neither
  fade nor move.
- Only one element may carry a given name at a time; the two bars are already mutually
  exclusive (`OnTripPath` / `OutsideTrip`), and `MobileTabBar` and `AppTabBar` never render
  together. A comment records this constraint next to the class.
- ADR 0063 gets a Consequences bullet: fixed and sticky chrome outside a `<ViewTransition>`
  must carry its own `view-transition-name`, otherwise it is painted in the root snapshot
  beneath the animating section. Reference this spec and the note id.
- Verification: the Playwright nav audit (`scripts/nav-audit.ts`) gains a phone-viewport
  check that taps Money → Plan, samples frames during the transition, and asserts the tab
  bar's pixels at its top edge are unchanged mid-transition. Also assert the same for
  Trips → Globe with `AppTabBar`.

### 1.4 Day title entry point moves (D4) — `cmukh0jjg000004kxwz9czuxp`

Day view (`components/trip/day/day-header.tsx:106`, `lib/day-view-loader.ts`):
- The header's Day title line becomes an inline editor. Empty: a quiet "Add a title" text
  button in the slot (same muted style as the eyebrow, normal case). Set: the title as now;
  tap/click turns it into an input (`maxLength 80`, Enter saves, Escape cancels, blur saves,
  empty clears). It calls the existing `setDayTitle` action with the owning Stop.
- The loader exposes the owning Stop for the title: if a title exists, its `stopId`; else the
  day's Stop (`dayStop`, the arriving Stop on a Changeover day). Days with no Stop (gap days)
  show no title affordance. Read-only viewers (the day's `editor` says not writable) see the
  title but no affordance.
- Revalidation is already in `server/actions/day-titles.ts` (plan, calendar, day, home).

Plan editor (`components/trip/stop-day-list.tsx:261-372` `DayTitleRow`):
- Untitled day: renders nothing in the flow. The add affordance is a small "Add a title"
  ghost item that appears on hover/focus-within of the day row on pointer-fine devices, and
  as an "Add a title" entry in the day row's existing overflow/actions on pointer-coarse
  devices. It opens the same input as today.
- Titled day: the label renders in normal case (`text-xs font-semibold`, not uppercase),
  click to edit as today.
- Help guide copy (`components/trip/help-guide.tsx:601`, `lib/help-guide.ts:282`) updated
  to describe both entry points, Day view first.
- Existing tests on `DayTitleRow` are updated; a new test asserts an untitled day renders no
  "Name this day" text.

### 1.5 One place for the bed (D5) — `cmukh1ghk000104kx47j9g7oc`

`components/trip/stop-card.tsx`:
- Remove the staying tile (`:398-405`, `:498-503`, the "No bed yet" tile at `:199-205`) and
  the header grid's third column; `lg:grid-cols-[minmax(0,1fr)_14rem_auto]`.
- `NoBedYet` in the section loses `lg:hidden`.
- `accommodationName` prop and its wiring in `components/trip/itinerary-manager.tsx:1669-1672`
  go. Tests at `stop-card.test.tsx:973-986` (staying tile) are removed; `:727-760` (section
  accessible name) stay.

### 1.6 Add affordance follows the nights (D6) — same note

- `itinerary-manager.tsx` computes per Stop whether every night is covered, using the same
  rule as `flagAccommodationCoverageGaps` (`lib/flags.ts:700-741`); extract a shared
  `uncoveredNights(stop, accommodations)` helper into `lib/accommodation-coverage.ts` and
  have the flag use it too.
- `StopCard` takes `stayCovered: boolean`. Uncovered (including zero Accommodation): the
  existing "Add accommodation" ghost button. Covered: a text link "Add another place" at the
  end of the section, `text-xs text-muted-foreground`, same `onAddAccommodation` handler.
- Rough Stops: unchanged (the Firm-up confirm path).

### 1.7 Accommodation row on phones (D7) — `cmukh2bzz000204kxk8kxq04o`

`components/trip/accommodation-row.tsx:59-117`:
- Below `sm` the button's content is a two-row grid: row 1 icon + name (`truncate`) +
  chevron; row 2 date range + paid badge + warning icon. The confirmation number is
  `hidden sm:inline-flex`. From `sm` up the current single line is unchanged.
- `break-words` is removed from the name; it is `truncate` at every width.
- Test: rendered at a narrow width the name has the `truncate` class and the confirmation
  number is not in the collapsed row's accessible text.

## 2. Out of scope

- Any change to the arrows' or strip's transition types, prefetching, or ADR 0063's
  whitelist.
- A cap or overlap rule on Accommodation.
- The Home Today tile, Agenda, Month grid and Share page rendering of Day titles (read-only,
  already correct).
- Desktop arrows moving to the far edges (Cam chose the fixed-width title instead).

## 3. Verification

- `npm test`, `npm run lint`, `npx tsc --noEmit`.
- Playwright nav audit at phone viewport: no content above the tab bar mid-transition; arrow
  bounding boxes identical across consecutive days; strip reaches the Trip's first and last
  day.
- Manual on beta once deployed: the six notes, on the December trip, on an iPhone.
