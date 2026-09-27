# Day view (`/trips/[id]/days/[date]`)

This replaces the current Days page. References: `images/day-desktop.png`, `images/day-mobile-empty.png`, `images/day-mobile-planned.png`.

The page is a Server Component. The client parts are `DayStrip` (scroll and swipe), `JournalEditor`, and the add sheets.

## 1. What's fixed from the current page
- The trip name and dates are no longer repeated in the page. The trip lives in the sidebar switcher, so **the date is the h1**.
- The previous/next arrows were stuck at the far edges of the screen. They now sit either side of the title.
- "DAY 9 OF 36 / Days" is replaced by the eyebrow and the day strip.
- The big "Nothing planned" dashed box is replaced by wishlist suggestions.
- The weather card floated off to one side. It's now in the right column and redesigned (see `WEATHER_CARD.md`).
- On future dates, the journal no longer offers a "How was today?" box.
- The floating feedback button no longer overlaps content. Keep it at bottom-right with a 24px inset, above the tab bar on mobile.

## 2. Desktop (≥1024; the sidebar is from `HOME.md` §1, with **Days** active)

Main area: padding 28px 40px 32px, vertical flex, gap 18px. The whole day fits in 900px height without scrolling when the plan has 4 or fewer items. Beyond that, the plan card scrolls internally.

### Header row (`items-end`, gap 16px)

**Left:** [‹] title block [›], gap 14px.
- **Arrows:** 44px square, white, 2px ink border, radius 12px, `3px 3px 0` shadow. `aria-label` "Previous day: Fri 11 Dec".
  - Disabled on the first and last day: 40% opacity, no shadow.
  - The ← and → keys also change day (not while typing in the journal).
- **Eyebrow:** "DAY 9 OF 36 · EUROPE" (11px, weight 800, 0.08em tracking, muted). The chapter name comes from the day's stop. On a day with transport it reads "DAY 11 OF 36 · TRAVEL DAY".
- **h1:** "Sat 12 Dec" (Bricolage 800, 40px, −0.02em). Add the year only if the trip spans years and the date isn't in the trip's first year.
- **Sub line:** "Strasbourg, France · GMT+1 · night 3 of 4" (15px, weight 600).
  - On travel days: "Strasbourg → Colmar · GMT+1".
  - If the time zone changes that day: "GMT+1 → GMT+2".

**Right:**
- the bell;
- the people AvatarStack;
- a primary "+ Add to this day" button: ink pill, paper text, `4px 4px 0` coral shadow. It opens the existing add sheet with this date preselected.

### Day strip
- 9 equal columns, gap 8px, centred on the current day (clamp at the trip's start and end).
- **Chip:** 62px tall, 2px ink border, radius 14px, white. Weekday (11px, weight 700), date (Bricolage 800, 20px), then dots for the number of planned items (0–3, where 3 means 3 or more).
- **Current day:** coral fill with a `3px 3px 0` shadow. The chip for **today** (the real date, while travelling) gets a 2px coral underline.
- **City line under the strip:** one segment per stop, spanning its nights. Each segment is a dot in the chapter colour, the city name (12px, weight 700), then a 2px `--status-neutral` rule filling the rest.
- **Behaviour:**
  - Chips are links. Use `nav` with `aria-label="Days"` and `aria-current="date"` on the current chip.
  - Scroll the strip horizontally with the wheel or a trackpad.
  - At the tablet width, show 7 chips.

### Body: `grid grid-cols-[7fr_5fr] gap-[18px] flex-1 min-h-0`

**Left: the Day plan card.** White, radius 24px, `5px 5px 0` shadow, padding 22px 24px, vertical flex, gap 14px.
- **Header:** "Day plan" (h2, 22px) on the left. On the right, "Nothing planned yet" or "3 things" (13px, weight 600, muted).
- **With items:** a timeline list. Each row has:
  - the time (13px, weight 800, 46px column; "Any time" items go last);
  - a category tile (40px, radius 12px, category colour, lucide icon);
  - the title (15px bold) with a subtitle under it (13px, muted, one line with ellipsis);
  - a 2px `--status-neutral` divider between rows.
  Transport rows show the route, the mode and the duration. Beds show "Night 1 of 2".
  Drag to reorder uses the existing plan editor handle, shown on hover.
- **Empty:**
  - The eyebrow "FROM YOUR WISHLIST IN STRASBOURG", then up to 3 wishlist places in that city.
  - Each is a bordered row (radius 16px, padding 10px 12px) with a tile, the name, a one-line hint, and a "+ Add" pill button (34px, `2px 2px 0` shadow).
  - Adding a place moves it into the plan with the time left empty.
  - **No wishlist places in the city:** skip the eyebrow and show "Nothing planned yet. Add a place, a booking or a note." (14px, muted).
- **Footer** (`mt-auto`): a dashed add row, 52px tall, 2px dashed ink border, radius 16px, reading "+ Add something else · a place, a booking, a note". It opens the add sheet.

**Right column** (vertical flex, gap 18px):
1. **WeatherCard** (regular). Hide it if there's an error and no cache.
2. **Tonight card:** lilac, radius 24px, `5px 5px 0` shadow, padding 18px 22px.
   - "TONIGHT" eyebrow, the bed name (Bricolage 800, 20px), then "Night 3 of 4 · check-out Mon 14 Dec" (13px, weight 600), with a chevron.
   - Links to the booking.
   - **No bed that night:** show "TONIGHT" with "No bed yet" and a "+ Add a stay" link.
   - **Last day of the trip:** hide the card.
3. **Journal card:** white, fills the remaining height.
   - **Future date:** "Journal" (h2) with "Opens on the day" on the right. Body: "We'll nudge you at 8pm on Sat 12 Dec to jot down a memory."
   - **On the day and after:** a textarea with the placeholder "How was today? Jot a memory…", the character count bottom right, and autosave.
   - **Past date with an entry:** show the text, with Edit.

## 3. Mobile (<768; tablet 768–1023 uses the desktop layout at one column below 900)

Use the existing mobile nav: the trip switcher pill at the top, the tab bar at the bottom (Today, Home, Plan, **Days**, More). No sidebar.

Everything is one column: padding 4px 18px, bottom padding clears the tab bar + 24px, gap 14px. Every section is `flex-none` inside a scrolling page.

1. **Top bar:**
   - trip switcher pill (40px, white, 2px ink border, coral dot, name, chevron);
   - the 44px bell with its count badge.
2. **Header:** a centred title block between the two 44px arrows.
   - Eyebrow 10px, h1 30px, sub line 13px ("Strasbourg · GMT+1 · night 3 of 4").
   - Drop the country name.
3. **Day strip:** 48×58 chips, gap 8px.
   - It bleeds off the right edge (the negative right margin shows it scrolls).
   - Scroll-snap, with the current day scrolled into view on load using `scrollLeft` (not `scrollIntoView`).
   - No city line on mobile. The sub line already gives the city.
4. **Swipe:** a horizontal swipe on the page body changes day, with a 40px threshold, ignored when the gesture starts in the strip or the journal. The page slides 24px and fades (skip when reduced motion is on).
5. **WeatherCard** (compact, 140px).
6. **Day plan card:** radius 20px, `4px 4px 0` shadow, padding 16px.
   - Same content as desktop.
   - The wishlist "+ Add" becomes a 44px "+" square.
   - The dashed row reads "+ Add something else" (empty) or "+ Add to this day" (with items), 48px tall.
   - The header "+ Add" button is dropped on mobile, since the dashed row covers it.
7. **Tonight card:** compact, with padding 14px 16px and the name at 18px.
8. **Journal card:** same rules as desktop.

## 4. Data
- `getDay(tripId, date)` returns:
  - the day number and total;
  - the stop, chapter and time zone;
  - transport legs;
  - plan items (sorted);
  - the bed tonight and night-of count;
  - the journal entry;
  - wishlist places matching the stop (up to 3, most recently saved first).
- Weather is fetched per stop in a separate Suspense boundary, so the page renders without waiting. Use `WeatherCardSkeleton` as the fallback.
- Day strip counts: one grouped query for the 9 visible days.

## 5. Accessibility
- One h1 (the date). The plan, journal and weather each get an h2; the weather's is visually hidden and reads "Weather".
- The strip is a `nav` whose chips are links. The arrows are links too, so they work without JS.
- The empty-state suggestion rows are list items. "+ Add" reads as "Add Christkindelsmärik to Sat 12 Dec".
- Every touch target is at least 44px on mobile.
