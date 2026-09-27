# Day view, Weather card, and shell fixes — 2026-09-27

Source: `design_handoff/home-day-design-279-handoff/` (README, HOME.md,
DAY_VIEW.md, WEATHER_CARD.md and the seven images). The markdown there is the
source of truth for chrome and copy; this spec records what was **decided
against or beyond it** in the grilling on 2026-09-27, and maps its names onto
the repo's real ones. Where this file and the handoff disagree, this file wins.

## Scope

| Part | Status |
|---|---|
| A. App shell and desktop Home (HOME.md) | **Already built** in `24704c2` from `docs/specs/2026-09-27-desktop-home.md` + beta-feedback §A–§D. Only the fixes in §A below. |
| B. Weather card (WEATHER_CARD.md) | New. |
| C. Day view desktop + mobile (DAY_VIEW.md) | New; replaces `app/(app)/trips/[tripId]/day/[date]/page.tsx`. |
| D. Visual check against the handoff images | Screenshots at 1440 and 390 of the seeded real trip, compared against `images/`. |

Not in scope: the Travelling / Past desktop Home, the Share-link today card
(keeps the old `WeatherDaylightCard`), any digest/push change.

## Decisions (from the interview)

1. **Home / sidebar conflicts: this morning's build wins on all four.** No
   "Today" nav row (ADR 0010: Today *is* Home while Travelling); search stays a
   real inline input with no ⌘K keycap; the primary button is **"+ Add a
   stop"**; the Dock band is **768–1279**. The handoff's HOME.md is not
   re-applied.
2. **Search panel bug.** Inside the sun sidebar the `island` utility redefines
   `--card` at 38% alpha (`app/globals.css` `@utility island`), so the results
   panel in `components/shell/search-field.tsx` is see-through. Fix: the panel
   gets an opaque surface **and floats over the page content** (portal or
   fixed positioning anchored to the field) instead of sitting inside the
   scrolling sidebar over the switcher and nav rows.
3. **Navigation: Days and Calendar are two rows.**
   - **Days** opens the **Day view** (`/trips/[id]/day/[date]`), landing on
     today (trip time zone) while Travelling and on the trip's first day
     otherwise. A date-less trip has no days: the row links to the Plan with
     the existing "pick your dates" handling.
   - **Calendar** is a new row opening the existing calendar page
     (`/trips/[id]/calendar`, month grid + agenda). Sidebar order: Home, Plan,
     Days, Calendar, Money, Wishlist, More. Phone tab bar is unchanged (Home,
     Plan, Days, Money, More); Calendar goes into the More sheet. The Dock
     follows the sidebar.
   - The route stays `/day/[date]` (the handoff's `/days/[date]` is not
     adopted). A `/trips/[id]/day` index redirects to the default date.
4. **Beyond the 16-day forecast**, keep the existing Open-Meteo archive read of
   the **same date last year** as the "typical" reading (ADR 0015). It renders
   the normal themed card with the chip **"Typical for Dec"**. The dashed
   **Too far out** card appears only when that archive read fails: eyebrow,
   "Too far out for a forecast. We'll switch to the real one on {date}, 15
   days before.", and the daylight chip. No "Usually 3° / −2°" line and no
   "Snow on 6 days" chip — there are no climate normals.
5. **Day ideas in every phase** (ADR 0044 amended): an empty day shows the
   Stop's dateless things to do first, then Wishlist matches, **three rows in
   total**, "+ Add" schedules with the time left empty. Eyebrow: "IDEAS FOR
   {Stop}" when it mixes both pools, "FROM YOUR WISHLIST IN {Stop}" when only
   Wishlist. When more exist, a "See all" link opens the existing full Day
   ideas list. No candidates: "Nothing planned yet. Add a place, an activity
   or a note." (14px muted), no eyebrow.
6. **Journal on a future date**: honest copy, no nudge. "Journal" h2 with
   "Opens on the day" on the right; body "Come back on {Sat 12 Dec} to jot
   down a memory." On the day and after: the existing `JournalEditor`
   (autosave, 500-char count) and `JournalEntryView` with Edit.
7. **"+ Add to this day" and the dashed row open the existing Item dialog**
   (`AddItemButton`, `components/trip/item-form-dialog.tsx`) with the date
   preselected. Copy: "+ Add something else · a place, an activity, a note"
   (desktop empty), "+ Add something else" (phone empty), "+ Add to this day"
   (phone with items). Stays and Transport keep being added from the Plan.
8. **Weather tests are behaviour tests, not snapshots.** `getWeatherTheme`
   unit tests cover every code group and every override; render tests assert
   fill class, scene presence, chip text and daylight label per theme × size.
   No `__snapshots__`.

## Name mapping (handoff → repo)

| Handoff | Repo |
|---|---|
| `--surface-page` | `bg-background` (`--background`) |
| `--surface-canvas` | `bg-canvas` (`--canvas`) |
| `--outline` / `--outline-soft` | `border-border` / `border-border-soft` |
| `--accent-primary` (coral) / `--accent-money` (sun) | `bg-coral` / `bg-sun` (+ `--teal`, `--lilac`) |
| `--on-accent-text` / `--on-accent-muted` | `text-on-accent` / `text-on-accent-muted` (via `island`) |
| `--text-muted` / `--text-body` | `text-muted-foreground` / `text-foreground` |
| `--status-neutral` divider | `border-border-soft` |
| `5px 5px 0` / `4px 4px 0` / `3px 3px 0` shadows | `shadow-hard-3` / `shadow-hard-2` / `shadow-hard-1`; coral CTA shadow `--shadow-cta` |
| `formatDay()` | `formatDayLabel()` in `lib/dates.ts` ("Sat 12 Dec") |
| `lib/map-palette.ts` | exists as named |
| "category ramp" / chapter colour | `lib/stop-colours.ts`, `lib/hues.ts` |
| `cn()` from `@/lib/cn` | exists |
| AvatarStack | inline avatar stacks in `home-header.tsx`; reuse that markup |
| "people/invite sheet" | link to `/settings#travellers` as Home does |
| `WeatherCardSkeleton` | new, in `components/weather/` |
| Tooltip primitive | none; attribution goes in a footer line under the right column |

New tokens go in `app/globals.css` as HSL triplets like the rest, exposed to
Tailwind as `--color-wx-*`, **same values in dark** (the card is a coloured
object): `wx-sunny` (= sun), `wx-partly`, `wx-overcast`, `wx-fog`, `wx-rain`
(= teal), `wx-snow`, `wx-storm` (= lilac), `wx-wind`, `wx-heat` (= coral),
`wx-night` (= ink), `wx-sun-disc`, `wx-cloud`, `wx-cloud-back`,
`wx-cloud-storm`, plus `wx-night-track` (#302D29) for the night daylight bar.

## B. Weather card

Files, as WEATHER_CARD.md §1: `lib/weather/theme.ts` (pure
`getWeatherTheme`), `components/weather/WeatherCard.tsx` (Server Component,
`size: "regular" | "compact"`), `components/weather/scenes.tsx`,
`components/weather/WeatherCardSkeleton.tsx`. The old
`components/trip/weather-daylight-card.tsx` stays for the Share-link today
card only.

### Data (`lib/weather.ts`)

- Forecast request adds `precipitation_probability_max`, `wind_gusts_10m_max`,
  `uv_index_max`, `snowfall_sum`, and hourly precipitation probability only
  if cheap to derive "after 2pm" (otherwise the chip says "Rain 70%" alone).
  The archive ("typical") request adds what the archive offers of the same
  set; missing fields are simply absent and their chips don't show.
- **Today only** (the day's date is today in the Stop's zone): also request
  `current=temperature_2m,is_day` for the night card and "−2° now".
- **Sunrise/sunset/daylight come from `lib/daylight.ts`** (NOAA, offline), not
  from the API — ADR 0015. The API's `sunrise`/`sunset` are not requested.
- Cache entries carry `fetchedAt`. On fetch failure with a cached entry, return
  it flagged `stale` with its age. That is the handoff's "Offline" state:
  cached theme fill, **no scene**, ink chip "Offline · updated 2h ago". Fetch
  failure with no cache → `null` → the Day view renders no card and closes the
  gap.

### Theme priority (`getWeatherTheme`)

Exactly WEATHER_CARD.md §3, with decision 4 above: stale → `offline`;
beyond 16 days with typical data → theme from the typical code + chip
"Typical for {Mon}"; beyond 16 days with no data → `too-far`; night (today
only, `is_day = 0`, code 0–2); heat (max ≥ 35, code 0–2); wind (gusts ≥ 40,
code 0–3); then the code table.

### Layout, chips, scenes, motion, states

As WEATHER_CARD.md §4–§6. Regular = 236px tall, compact = 140px. Exactly one
chip or none. Scenes are pure CSS shapes (`aria-hidden`), the bolt via
`clip-path`, motion behind `prefers-reduced-motion`. Night card: ink fill,
paper text, coral hard shadow, `#302D29` track with a coral "now" tick.
Attribution "Weather by Open-Meteo" is a footer line under the Day view's
right column (required by ADR 0015).

## C. Day view

Route `app/(app)/trips/[tripId]/day/[date]/page.tsx`, Server Component.
Client islands: `DayStrip` (wheel/trackpad scroll, phone scroll-snap +
swipe), `JournalEditor`, the Item dialog, the prev/next keyboard listener.

### Header

- Desktop: the trip layout's `TripHeaderFrame` is hidden at `lg+` on the Day
  route exactly as it is on Home, so the **date is the page's `h1`**
  (Bricolage 800, 40px; year appended only when the trip spans years and the
  date is outside the first year). Arrows either side of the title block
  (44px, white, hard-1 shadow, disabled at 40% on the first/last day; ← → keys
  change day unless focus is in a text field). Right: bell, avatar stack,
  "+ Add to this day".
- Eyebrow "DAY 9 OF 36 · EUROPE": day number via `dayNumberInTrip`
  (inclusive, as ADR 0010's amendment); the chapter name when the trip has
  Chapters on and the day's Stop is in one, otherwise the Stop's country;
  "TRAVEL DAY" when the day has Transport.
- Sub line: "Strasbourg, France · GMT+1 · night 3 of 4"; travel day
  "Strasbourg → Colmar · GMT+1"; zone change "GMT+1 → GMT+2". Phone drops the
  country. Zone labels via `lib/time-display.ts`. A changeover day (ADR 0049)
  belongs to the arriving Stop for the sub line and the eyebrow.
- Phone: existing phone header (switcher pill, bell) + tab bar; header block
  centred between the arrows; no "+ Add" button in the header.

### Day strip

9 chips desktop, 7 at tablet, phone 48×58 bleeding off the right edge with
scroll-snap and `scrollLeft` to the current day. Chip: weekday, date, 0–3
dots for planned items (one grouped query for the visible window). Current
day coral + hard-1 shadow; real today gets a 2px coral underline. City line
under the strip on desktop only: one segment per Stop across its nights, dot
in the Stop colour, name, rule. `nav aria-label="Days"`, chips are links,
`aria-current="date"`.

### Body

Desktop `grid-cols-[7fr_5fr]`, gap 18px; tablet one column below 900px; phone
one column, gap 14px.

- **Day plan card**: "Day plan" h2 + "Nothing planned yet" / "3 things".
  Timeline rows (time 46px column, "Any time" last; category tile; title and
  one-line subtitle; Transport rows show route · mode · duration; stays show
  "Night 1 of 2"). Reorder keeps the existing plan editor handle. Empty:
  decision 5. Footer dashed row: decision 7. Scrolls internally beyond 4 rows
  on desktop.
- **Right column**: `WeatherCard` (regular; compact 140px on phone, placed
  above the plan card) inside its own Suspense with `WeatherCardSkeleton`;
  hidden when the loader returns null. **Tonight** card (lilac): bed name,
  "Night 3 of 4 · check-out {Mon 14 Dec}", links to the stay; no bed →
  "No bed yet" + "+ Add a stay" linking to the Plan at that Stop; hidden on
  the trip's last day. **Journal** card fills the rest: decision 6.
- Footer line: "Weather by Open-Meteo".

### Data

New `lib/day-view-loader.ts` `getDay(tripId, date)` returning the day number
and total, Stop, chapter and zone, Transport legs, sorted plan items (reusing
`buildItinerary`), tonight's stay with night-of-count (`nightsBetween`), the
Traveller's journal entry, and Day ideas (things to do, then
`dayIdeasWishlist`, three total plus a count of the rest). Weather is
fetched separately per Stop inside the Suspense boundary.

### Accessibility

One `h1` (the date); h2s for Day plan, Journal and a visually hidden
"Weather"; the strip is a `nav` of links; arrows are links; empty-state rows
are list items with "+ Add" reading "Add {name} to {Sat 12 Dec}"; 44px
targets on phone; feedback button bottom-right with a 24px inset above the
tab bar.

## D. Verification

- `npm test` green; new unit tests per decision 8; page tests for the Day
  view (empty, planned, travel day, future journal, no bed, last day, night
  card) and for the nav change (Days → Day view default date, Calendar row,
  More sheet on phone).
- Run the app against the local Postgres with `npm run db:seed:real`
  (Christmas in Europe 2026) and screenshot Home, the Day view (empty and
  planned days) and the weather states at 1440 and 390 via the layout-audit
  browser helpers; compare side by side with `images/` and fix visible
  deviations before calling it done.

## E. Accepted deviations

Recorded after the side-by-side check against `images/` (2026-09-27, Task 11).

- **Day strip: 9 chips at every width from md up.** The handoff's 7 chips at
  the tablet width is dropped.
- **Phone tab bar has no Today item** (Home, Plan, Days, Money, More — decision
  1 / 3; ADR 0010: Today *is* Home while Travelling).
- **Sidebar shell stays as built** (decision 1): no "Today" row, no ⌘K keycap,
  and the search field, trip switcher and PLANNING chip use the `island`
  translucent paper (38% `--card` on sun/coral) rather than the handoff's
  opaque white.
- **No "Usually 3° / −2°" line or climate-fact chip** on the Too-far-out card
  (decision 4 — there are no climate normals).
- **Journal on a future date** reads "Come back on {date} to jot down a
  memory." rather than the handoff's 8pm nudge (decision 6).
- **Strip centring:** the 9 chips centre on the current day (DAY_VIEW §2 text)
  where the handoff image shows it fourth.
- **Page padding:** the trip layout's 48px top padding is kept (handoff: 28px
  desktop, ~0 under the phone top bar); the Day view fills the rest of the
  viewport from lg.
- **Timeline row type:** Day-view rows keep the Timeline's 14px semibold
  titles / 12px subtitles (handoff 15px bold / 13px); tiles, colours, the 46px
  time column and the centre alignment match.
- **No Fork switcher on the Day view** (the trip header is hidden there at
  every width): the Day view always shows the real plan and ignores
  `?plan=`, so the switcher was misleading on that route.
- **Phone switcher pill** truncates the trip name at the pill's shared max
  width instead of running the full row.
- **Day plan row subtitles:** rows keep the Timeline's existing subtitles —
  transport rows do not render "route · mode · duration" and stay rows do not
  render "Night 1 of 2"; the Tonight card and the header sub line carry the
  night count.
- **Two-column breakpoint:** the Day view body switches to two columns at
  `lg` (1024px), not the handoff's 900px.
- Seed-data differences are not deviations: no cover photo, no map tile key
  locally (the route map shows the CARTO "API key required" tiles), no
  wishlist places in the seeded Stops, and every day beyond the 16-day
  forecast shows "Typical for Dec".
