# Between sections a hard cut; between days a paged carousel

## Status

Accepted 2026-09-30 on `feat/day-carousel-2026-09-30`. Amends ADR 0063: its "then swaps
with a short native crossfade (directional slide for day-to-day)" is replaced by the two
rules below. Everything else in ADR 0063 stands — the old page holds until the next is
ready, `loading.tsx` only at `app/(app)/trips/loading.tsx`, no `template.tsx`, the 30s
client cache, the tapped control lighting at once.

## Decision

- **Between sections** (anything `SectionTransition` wraps: Home → Plan, Trips → Globe)
  the current page holds until the next one is ready and then swaps in **one frame**. No
  fade in either direction.
- **Between days** the Day view is a **paged carousel**: the page renders the day before,
  the day shown and the day after as full-width panels in one snap-mandatory scroller.
  Dragging tracks the finger; settling on a neighbour navigates to it, and the new page
  paints with that day already in place. Arrows, keys and a tap on the adjacent chip glide
  the scroller across and then navigate the same way; a tap on a further day does one
  full-width page-turn through a view transition. The Day strip moves with the body and
  centres the day shown (phone). Every day change keeps the vertical scroll position.

## Why

Cam still saw "the other screen appears before the one I'm on is gone" on the iPhone PWA
after the 2026-09-29 fade-out-then-in (`49968168`) had reached `origin/main`. Whether that
build was live, or whether WebKit in a standalone PWA honours the class-based
`::view-transition-old(.tp-crossfade)` rules, could not be settled from the Mac. A one-frame
swap depends on neither, and it is what native tab bars do anyway.

Day to day, the view-transition slide read as "the whole page flicks left, then fades in".
Cam asked for the body to "scroll left-right like a giant carousel that snaps to the day".
A view transition animates snapshots after the gesture ends; it cannot follow a finger.
Following a finger needs the neighbouring days in the DOM before the gesture starts, which
is why the page loads three days.

## Considered options

- **Full-width view-transition slide on release, no finger tracking** — rejected by Cam:
  a slide is not a carousel.
- **A client-side carousel fetching days as JSON, URL kept by `replaceState`** — rejected:
  abandons the server-page model for one route and duplicates the Day rendering on the
  client.
- **Moving the Day chrome into a `day/layout.tsx` so it survives the date change** — not
  needed: the strip restores its own position across the remount and finishes any glide
  still running. Kept in reserve if the remount ever shows.

## Consequences

- ~~Three `getDay` loads per Day page, in parallel.~~ *Amended 2026-10-16 (card 3.M,
  NAV-05):* one `getDays(tripId, [shown, before, after], viewer)` reads the window once
  (`lib/day-reads.ts`) and assembles each day with `buildDayModel`.
- Neighbour panels are `inert` and `aria-hidden`; nothing in them may take focus or
  register a keyboard handler, and their dialogs must not double the shown day's.
- A second swipe while the first is still landing meets the end of the scroller until the
  new page paints. Accepted; rendering more neighbours is the follow-up if it grates.
- The `.tp-crossfade` rules are gone. The phone bars keep their `view-transition-name` and
  group `z-index` because the Day view still runs view transitions (heading text, far
  jumps).
- Only WebKit on a phone can judge the feel. `npm run audit:nav` proves the mechanics in
  Chrome: one-frame section swaps, the scroller on the day shown at first paint, an arrow
  press ending on the next day's URL with the vertical position kept.

## Amended 2026-11-18: the carousel is the phone and tablet behaviour; desktop shows one day

The three-panel snap carousel is the Day view **below `lg`** only. From `lg` (1024px) up the
Day view shows one day and crossfades between days (spec 2026-11-18 D1, D2).

Why: on a wide screen the scroller cost more than it gave. `overflow-x: auto` forces
`overflow-y` to clip as well, so the cards' hard shadows were cut off at the right and
bottom edges, and `position: sticky` inside it stuck to the scroller rather than the
viewport. A horizontal trackpad swipe changed day by accident. The Day plan card also
scrolled inside itself to fit the viewport (Feedback `cmwkhwenq000308jqhm1vhozr`: "cut off,
inner scroll").

- From `lg`, `DayCarousel` renders only the day shown, in a plain block that scrolls with
  the page: no horizontal scroller, no neighbour panels, no scroll or wheel handling. Its
  `goTo` declines, so the arrows, the keys and the strip take their own typed navigation.
  The neighbours are still read and prefetched, so the next day is quick to arrive.
- The server cannot know the viewport, so it sends the phone tree with `lg:` classes that
  hide the neighbours and turn the scroller into a block. The first paint at desktop width
  is already one day, and the client drops the neighbours once it knows the width.
- The Day plan card has no maximum height and no inner scroll. The right column (Weather,
  Tonight, Journal, credit) is sticky at `lg:top-6`. If it is taller than the viewport, the
  carousel marks it `data-tall` and it scrolls with the page instead of hiding its foot.
- Below `lg` nothing changes: three panels, finger tracking, the glide, and everything in
  the Decision and Consequences above.

What was built from `lg` up (spec 2026-11-18 D1, D2):

- One day on a wide screen, scrolling with the page, with the right column sticky.
- The Day strip is the carousel there: a fixed centre frame holds the shown day while the
  strip glides beneath it (about 250 ms), with an arrow at each end. The frame fades while
  the shown day is off-centre, and the strip returns to the shown day after about 1.5 s of
  quiet.
- A day change made inside the app crossfades in about 150 ms; browser back and forward cut.
- A neighbour panel never opens its own Day map: only the day shown mounts the dialog, so
  the phone carousel's three panels do not stack three dialogs.

## Amended 2026-11-19: every day has a slot, and a swipe rebuilds nothing

Feedback `cmwmyah6t000008ifgca9vw8m`: "The carousel is too slow? It should feel like it's all
loaded and very smoothly slide between them. It's so jarring currently." Each settle was a
cold server render under the `[date]` segment, so the page remounted, the header and the Day
strip waited for it, and a second swipe met the end of a three-panel scroller.

- **A slot for every day.** The scroller has one fixed-width slot per Trip date from first
  paint, so filling a slot never moves the scroll position. Seven days are filled around the
  day shown: it and its neighbours paint first from one `getDays` read, the days two and
  three away stream in behind per-slot Suspense, and every other slot is a skeleton. The
  offline warmer's copies stay three-day.
- **The date arrives by rewrite.** The address stays `/trips/<ref>/day/<date>`; the proxy
  rewrites it to the one Day page as `?d=<date>`. A day change is then a search-param
  navigation: nothing above the page remounts, so the carousel, its scroller and the panels
  of days present in both windows survive it. Slots entering the window fill and slots
  leaving it become skeletons by ordinary reconciliation, each panel keyed by its date.
- **The day in view is the carousel's.** A settle (drag, arrow, key or chip) shows that day's
  own header, or a date-only header until its slot fills, and lights the strip at once. It
  then pushes the day's address straight away with `router.push(href, { scroll: false })`,
  with no progress bar: the day is already on screen. A second settle before the first lands
  pushes the newer day and the router drops the older one. The page's own date catches up
  when the navigation lands; a landing for the day in view moves nothing, so it cannot
  disturb a gesture in progress. A date that differs (Back, Forward) moves the scroller there,
  never mid-gesture. A navigation that ends with the day unchanged parks the scroller back
  on the day shown, as before.
- **Not `history.pushState`.** A URL the router did not navigate to leaves it inconsistent: a
  refresh then resets the scroll position and Back breaks.
- **What runs off screen.** Days further than one slot from the day in view are `inert` and
  their animations pause; the Day map mounts only for the day the page shows. A slot that
  has not filled keeps the height of the day it replaced, so landing on one does not shrink
  the page under the Traveller.
- **From lg** only the day in view renders. A day change shows it and its header at once,
  crossfading the body (keyed by the day, since nothing remounts any more), then makes the
  same push. Browser Back and Forward still cut.

The reserve option above, moving the Day chrome into a layout, is no longer needed: the
rewrite keeps the whole page mounted instead.
