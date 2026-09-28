# Trips page (`/trips`)

Images: `images/trips-desktop-carousel.png`, `images/trips-desktop-first-run.png`, `images/trips-mobile.png`, `images/trips-mobile-first-run.png`.

**Goal:** everything fits in one 1440×900 desktop screen with no page scroll. The trips row is always one row, whatever the trip count, so "Your travels" never gets pushed below the fold.

Tokens used: `--surface-page`, `--outline`, `--shadow-ink`, `--accent-primary` (coral), `--accent-money` (sun), the teal and lilac hue tokens from the category ramp, `--status-neutral` (#E4DFD4), `--outline-soft` (#C9C4BA), `--surface-canvas` (#EFE9DF, done cards), `--text-body`, `--text-muted`, `--on-accent-text`, `--on-accent-muted`. The map background (#EAF3F2) is the existing map palette.

---

## 1. App shell on trips-level pages (Trips, Globe)

This is the same 248px sidebar as the Home handoff, with these differences:

- **Trip nav rows are hidden.** Today, Home, Plan, Days, Money, Wishlist and More are all trip-scoped.
- **Trip switcher:**
  - Top line reads "Back to" (12px, weight 500, muted). The bottom line is the most recently opened trip's name (14px bold, ellipsis).
  - The card has no shadow, just a 2px border and radius 14px.
  - Clicking the card body goes to that trip's Home. The chevron opens the switcher menu.
- **The trip switcher is hidden when the user has 0 trips.** The search button then gets 24px of space below it instead of 10px.
- **Trips row:**
  - This is the active row: coral fill, `3px 3px 0` shadow, `aria-current="page"`.
  - It shows a trip count on the right (11px, weight 800). Hide the count when it's 0.
- **Footer (avatar, name, theme toggle):** unchanged.

---

## 2. Main column

- Padding: `32px 0 32px 40px`. There's no right padding on `main`, so the carousel can bleed off the right edge. Children that need the right gutter add `pr-10` (40px) themselves.
- Vertical flex, gap 18px, `min-h-0`. The whole frame is `h-dvh overflow-hidden` on desktop ≥1280.
- The rows, in order:
  1. header (§3);
  2. carousel, 280px (§4);
  3. dots, 8px;
  4. a travels row that takes the rest of the height with `flex-1 min-h-0` (§5, §6).
- **Viewport shorter than ~820px:** allow page scroll and give the travels row a `min-h-[360px]`.

---

## 3. Header

- Flex, `items-end`, gap 16px, `pr-10`.
- **Left side:**
  - "Hey {firstName}" (15px, weight 500, muted).
  - The `h1` "Your trips": Bricolage 800, 40px, line-height 1.05, letter-spacing -0.02em, 2px top margin.
  - A meta line (15px, weight 600, `--text-body`, 6px top margin). Its format is `{n} coming up · {m} done`. Drop a part when its count is 0. With 0 trips, it reads "Nothing planned yet".
- **Right side** (flex, gap 10px):
  - **Carousel arrows (client, wired to §4):** two 44×44 buttons with radius 12px and a white fill.
    - Enabled: 2px ink border, `3px 3px 0` shadow.
    - Disabled: 2px `--outline-soft` border, `--outline-soft` glyph, no shadow.
    - Icons: lucide `chevron-left` / `chevron-right`, 18px. Labels: `aria-label="Previous trips"` / `"Next trips"`.
    - Hide both arrows when every card fits.
  - **Primary button, "+ New trip":**
    - 44px tall, pill shape, ink fill, paper text, 14px weight 800, padding 0 18px, 6px left margin.
    - Shadow `4px 4px 0 var(--accent-primary)`.
    - Opens the existing new-trip flow.
  - This is the only CTA on the page. The dashed "Start a new trip" card is removed.

---

## 4. Trip carousel (client)

- **Track:** flex, gap 18px, height 280px, `overflow-x-auto`, `snap-x snap-mandatory`, scrollbar hidden, `scroll-padding-left: 0`.
  - 6px bottom padding, so card shadows aren't clipped.
  - Each card is `snap-start shrink-0`.
- **Arrows:** scroll by one card width plus the gap (`scrollBy({left: ±(cardW+18), behavior: 'smooth'})`). Use `behavior: 'auto'` under reduced motion.
- **Keyboard:** the track is `role="region"` with `aria-label="Your trips"` and `tabIndex=0`. The left and right arrow keys scroll it.
- **Dots:** below the track, with a 4px gap after the 18px flex gap (`-mt-1`).
  - One dot per "page". Pages = `ceil(scrollWidth / clientWidth)`.
  - Active dot: 22×8, ink. Inactive: 8×8, `--outline-soft`. Gap 6px.
  - Updated on scroll with an IntersectionObserver or rAF throttle. Hide the dots when there's only one page.
- **Peek:** the widths below leave the next card partly visible at 1440, which is how you can tell the row scrolls. Don't add a fade.
- **Card order** (`lib/trips/trip-status.ts`):
  1. **Up next:** the nearest upcoming or in-progress trip. It always gets the hero card.
  2. Other upcoming trips by start date, then undated "idea" trips by creation date.
  3. Done trips, most recent first.

### 4a. Hero card, "Up next" (600×280)

- **Container:**
  - Coral fill, 2px ink border, radius 24px, `5px 5px 0` ink shadow, padding `22px 24px`, `overflow-hidden`.
  - Flex row, gap 20px. The whole card links to the trip's Home.
- **Left column** (flex column, `flex-1 min-w-0`):
  - **Row 1** (flex, gap 8px, centred):
    - The "UP NEXT" pill: 11px, weight 800, letter-spacing 0.08em, white fill, 2px ink border, pill shape, padding 3px 10px, `nowrap shrink-0`.
    - The dates next to it, `4 Dec – 8 Jan · 11 stops` (13px bold, nowrap).
    - An in-progress trip reads "ON THE ROAD" and `Day 6 of 35 · Paris`.
  - **Trip name:** `h2`, Bricolage 800, 26px, line-height 1.05, letter-spacing -0.02em, 12px top margin. Clamp to 2 lines.
  - **Countdown** (pushed down with `mt-auto`, baseline-aligned, gap 10px):
    - The number: Bricolage 800, 96px, line-height 0.85, letter-spacing -0.06em.
    - The unit, stacked on two lines as "sleeps / to go": Bricolage 800, 24px, line-height 1.02.
    - The count is **sleeps**: nights until the start date, in the trip's timezone. On the day of departure it shows "Today", as in the Home spec.
  - **Next-step chip** (14px top margin, `self-start`, nowrap):
    - White fill, 2px ink border, radius 12px, padding 7px 12px, flex, gap 10px.
    - Contents: a 22px category tile (radius 7px, 2px border, category fill, lucide icon at 12px), the title (14px bold), and a chevron.
    - It shows the **first** item from the trip's "Sort these out" list, using the same data source and category mapping as HOME.md §7.
    - Clicking it goes straight to that item. Hide the chip when there's nothing to do.
- **Right: the cover** (`TRIP_COVER.md`). Polaroid, hero size.

### 4b. Standard card (300×280)

- **Container:** 2px ink border, radius 24px, `5px 5px 0` shadow, padding 20px, flex column, relative, `overflow-hidden`.
- **Cover:** `TRIP_COVER.md`, small size, absolutely positioned at `right 18px, top 22px`.
- **Content, top to bottom:**
  - A status pill (11px, weight 800, letter-spacing 0.08em, 2px border, pill shape, padding 3px 10px).
  - A big number with a stacked unit, pushed down with `mt-auto`:
    - the number: Bricolage 800, 56px, line-height 0.85, letter-spacing -0.05em;
    - the unit: Bricolage 800, 16px, line-height 1.02, stacked on two lines with `whitespace-pre-line`.
  - The name: `h2`, Bricolage 800, 22px, line-height 1.1, 12px top margin, clamp to 1 line.
  - The dates: 14px, weight 600, `--text-body`, 4px top margin.

| Variant | Fill | Pill | Big number / unit | Date line |
|---|---|---|---|---|
| planning (has dates) | white | teal, "PLANNING" | sleeps, "sleeps / to go" | `23 Apr – 3 May` |
| idea (no dates) | white | lilac, "IDEA" | year if known else "?" / "dates / not set" | "Add dates" (link to trip settings) |
| done | `--surface-canvas` | white, "DONE" | nights / "nights / away" | `Mar 2025 · 4 stops` |

### 4c. Removed from this page
- The dashed "Start a new trip" card. It's now covered by "+ New trip", and by the first-run card when you have no trips.
- The "Your travels ↓" link under the title.
- "0 stops" pills on cards. The cover stamp and the date line carry that now.

---

## 5. Travels map (client), `col-span-8`

The travels row is a 12-column grid, gap 18px, `pr-10`, `flex-1 min-h-0`.

- **Card:** 2px ink border, radius 24px, `5px 5px 0` shadow, `overflow-hidden`, relative. The map fills the whole card.
- **Map setup:**
  - Use the existing Leaflet setup and map palette tiles, with English labels.
  - `zoomControl: false`, scroll-wheel zoom off, dragging on.
  - Fit bounds to every pin in the active filter, with 40px padding.
- **Pins:**
  - 20px circles, 2px ink border, `2px 2px 0` shadow, with no numbers.
  - Fill is the trip's colour (the hue ramp in `lib/chapter-colours.ts`, assigned per trip and stable).
  - Legs within a trip get a dashed ink polyline, 1.5px wide with a `6 5` dash.
  - Never draw the leg from home base.
  - Done trips use the same pins at full opacity, since they're real places you've been.
- **Overlay, top left** (16px inset, flex, gap 8px):
  - A "Your travels" title pill: Bricolage 800, 20px, white fill, 2px border, padding 3px 14px, nowrap. This replaces the old section `h2`.
  - Filter chips (13px bold, pill shape, 2px border, padding 6px 12px, nowrap):
    - "All trips" is active: ink fill, paper text.
    - One chip per trip, each with a 10px dot in the trip colour. These double as the legend.
    - At 1440 the chips can overflow. Show at most 3 trip chips, then a "+2" chip that opens a popover.
- **Bottom right:** "Open Globe →" pill (13px bold, white, 2px border) linking to `/globe`.
- **Bottom left:** "© OpenStreetMap · CARTO" (11px, weight 600, `--text-muted`), replacing Leaflet's default attribution.

---

## 6. Tally, `col-span-4` (client for the toggle)

- **Container:** sun fill, 2px ink border, radius 24px, `5px 5px 0` shadow, padding `20px 22px`, flex column.
- **Header row** (space-between):
  - A "TALLY" eyebrow.
  - A segmented toggle "Planned | Been":
    - 2px ink border, pill shape, white fill, 12px bold, each segment padded 4px 10px.
    - The active segment is ink-filled with paper text.
    - Use Radix ToggleGroup, or the existing `segmented.tsx`.
- **Headline** (10px top margin, baseline, gap 10px):
  - The number: Bricolage 800, 56px, line-height 0.9, letter-spacing -0.04em.
  - The label, stacked on two lines: Bricolage 800, 20px, line-height 1.02. It reads "countries / visited" for Been, and "countries / on the list" for Planned.
- **Stats grid** (`mt-auto`, 2 columns, 2px ink top border):
  - Each cell has padding 8px 0 and a 2px bottom border in ink at 18% opacity (use a token like `--outline-faint`, or `border-[--outline]/20`).
  - The value: Bricolage 800, 20px, line-height 1.1. The label: 13px, weight 600, `--on-accent-muted`.
- **Stats and order:**
  - Planned: places, nights away, km travelled, nights booked, flights, trains.
  - Been: places, nights away, km travelled, flights.
  - Show at most 4 cells at 900px tall, and 6 when the row is ≥440px tall. Use a container query on the card height.
  - Drop any stat whose value is 0.
- **Default mode:** "Been" if at least one trip is done, otherwise "Planned". Save the choice in localStorage (`teepee:tally-mode`).
- **Numbers:**
  - Format km with a thousands separator ("36,309 km"). Mobile uses a short form ("36k km").
  - **Never show "0 countries"**. See the first-run state in §7.

This replaces the eight separate stat tiles.

---

## 7. First run, desktop (0 trips, nothing travelled)

Image: `trips-desktop-first-run.png`.

- **Header:**
  - The greeting reads "Welcome to teepee, {firstName}". Use this until the user has at least one trip, then switch to "Hey …".
  - The meta line reads "Nothing planned yet".
  - There are no arrows and no "+ New trip" button, because the card below is the CTA.
- **Row 1:** a 12-column grid, 280px tall, gap 18px.
  - **First trip card, `col-span-8` (client):**
    - Coral fill, 24px radius and padding, `5px 5px 0` shadow, flex row, gap 24px.
    - The left column, top to bottom:
      - a "FIRST TRIP" pill (white);
      - the `h2` "Where to first?" at `mt-auto`: Bricolage 800, 64px, line-height 0.9, letter-spacing -0.04em, two lines, with a `<br>` after "Where to";
      - an 18px gap, then a flex row (gap 10px) holding:
        - the input: `flex-1`, 48px tall, white, 2px border, radius 14px, padding 0 14px, 15px text. Placeholder: "Name it, e.g. Japan in spring". Use `aria-label="Trip name"`;
        - the "Start planning" button: 48px tall, pill shape, ink fill, paper text, 15px weight 800, padding 0 20px, shadow `4px 4px 0 var(--accent-money)` (a sun shadow on coral).
    - **Submit** calls the Server Action `createTrip({ name })`.
      - On success, it redirects to `/trips/{id}`, which opens the new trip's Home in its no-stops state.
      - The button is disabled until the name is 1 character or more after trimming. Pressing Enter submits.
      - A pending state shows "Starting…".
      - Errors show inline under the row (13px, ink, on coral).
    - **Right side:** an empty hero polaroid. The inner box has a dashed 2px ink border on a paper fill and reads "+ Cover / photo" (12px bold, centred). It's decorative; the photo can be added later from the trip.
  - **Past trip card, `col-span-4`:**
    - White fill, 22px padding, flex column.
    - Content, top to bottom:
      - an "ALREADY BEEN?" pill (teal);
      - the `h2` "Log a past trip" (Bricolage 800, 26px) at `mt-auto`;
      - the body "Add where you went and when. It goes on your map and counts toward your tally." (14px, line-height 1.45, `--text-body`);
      - a "+ Past trip" button: 44px tall, white, 2px border, pill shape, `3px 3px 0` shadow.
    - The button opens the new-trip flow with its "already happened" flag set, which lands that trip in Done.
- **Row 2** (`flex-1`, 8px extra top margin):
  - **Map `col-span-8`:**
    - The same map card with no pins, fitted to the world view.
    - It has the "Your travels" title pill.
    - A centred white hint card (2px border, radius 16px, `3px 3px 0` shadow, padding 14px 18px, nowrap) holding:
      - a 26px dashed circle;
      - "Your map fills in as you go" (15px bold);
      - "Every stop you add gets a pin" (13px, muted).
  - **Tally `col-span-4`, empty state:**
    - No fill, a **dashed** 2px ink border, no shadow.
    - The "TALLY" eyebrow, then "Starts counting with your first trip" (Bricolage 800, 22px).
    - At the bottom, a 2-column grid of four cells (countries, places, nights away, km travelled). Each value is "—" in `--outline-soft`, and each label is muted.
    - No toggle.
- **In between (trips exist, but only ideas with no stops):** use the populated layout. Show the Tally in its dashed empty state until any stop exists.

---

## 8. Mobile (<768), 390×844 reference

This uses the existing mobile chrome: the status bar area, with a tab bar at the bottom (88px, sun fill, 2px ink top border, radius 14px on the active tab, coral).

- **Tabs on trips-level pages:** Trips / Globe / You (3 columns). Icons: lucide `layout-grid`, `globe`, `user-round`.
- **Content:**
  - Padding: 4px on top, 18px on the left, 110px at the bottom for the tab bar. The right padding is 0 on the carousel row and 18px everywhere else.
  - Vertical flex, gap 14px. The page scrolls vertically.

### Populated (`trips-mobile.png`)
1. **Header** (18px right padding):
   - "Hey {firstName}" (14px, weight 500, muted), then the `h1` "Your trips" (Bricolage 800, 32px).
   - On the right, a 44px round ink "+" button with a `3px 3px 0` coral shadow and `aria-label="New trip"`.
2. **Carousel:**
   - 250px tall, gap 12px, scroll-snap, bleeding off the right edge. There are no arrows; users swipe.
   - **Hero card:**
     - 300px wide, radius 22px, padding 18px, `4px 4px 0` shadow.
     - The cover polaroid is absolutely positioned at right 16px, top 18px, 86px wide.
     - Content: the pill, then the number (Bricolage 72px) with the unit (18px), the name (Bricolage 20px, 2 lines max), and the dates (13px, weight 600).
     - The next-step chip is **dropped** on mobile.
   - **Standard cards:** 220px wide, radius 22px, padding 18px. Number 48px, unit 14px, name 20px, date 13px.
     - Covers are hidden on standard cards at this width, to save space for the name.
3. **Dots:** 18×7 active and 7×7 inactive, with the same rules as desktop.
4. **Map card:**
   - 190px tall, radius 22px, `4px 4px 0` shadow.
   - 14px pins, no shadow.
   - A "Your travels" pill (Bricolage 16px) at top left.
   - A "Globe →" pill (12px) at bottom right.
   - No filter chips on mobile. Tapping the map opens `/globe`.
5. **Tally strip:**
   - Sun fill, radius 22px, `4px 4px 0` shadow, padding 14px 16px, 3 columns.
   - Each cell: the value (Bricolage 22px) with the label under it (12px, weight 600).
   - It shows countries, nights and km, in Planned mode unless something is done (the same default rule as desktop). No toggle on mobile.

### First run (`trips-mobile-first-run.png`)
1. **Header:** "Welcome to teepee, {firstName}" / "Your trips". No "+" button.
2. **First trip card** (full width, coral, radius 22px, padding 18px):
   - A "FIRST TRIP" pill.
   - The polaroid is absolutely positioned at top right: 86px wide, dashed "+ Photo" box.
   - "Where to first?" (Bricolage 44px, line-height 0.9, two lines) with a 56px top margin, so it clears the polaroid.
   - The input: 48px tall, full width, 16px top margin.
   - The "Start planning" button: 48px tall, full width, 10px top margin.
3. **Past trip row:**
   - White, 2px border, radius 18px, `3px 3px 0` shadow, padding 12px 14px, at least 56px tall.
   - Contents: a 36px teal tile with "+", then "Already been somewhere?" (15px bold) over "Log a past trip for your map" (13px, muted), then a chevron.
4. **Map:**
   - `flex-1`, at least 150px tall, no pins.
   - It has the "Your travels" pill and a centred hint pill reading "Pins appear as you add stops" (13px bold, radius 12px).

---

## 9. Loading and errors

- **Loading** (`loading.tsx`): the header renders straight away.
  - Carousel: skeleton cards at their real sizes (one 600 and two 300 on desktop; 300 plus 220 on mobile).
  - Map: a flat `--surface-canvas` fill.
  - Tally: title skeleton plus 4 cell skeletons.
- **Map fails:** show the compact ErrorPanel inside the map card. The rest of the page still works.
- **Stats fail:** hide the Tally card and let the map span all 12 columns.

## 10. Accessibility

- Each card is one link. Its accessible name is `{trip name}, {status}, {countdown}`, for example "Christmas in Europe 2026, up next, 67 sleeps to go". Mark the decorative cover `aria-hidden` unless it's a user photo, which gets `alt="{trip name} cover photo"`.
- The next-step chip is a separate link. Don't nest it inside the card link; make the card a relative container with a stretched link.
- The carousel needs a visible focus ring on the track and on each card.
- The Tally toggle is `role="radiogroup"`, via Radix.
