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
  of days present in both windows survive it, with what is in them: every filled slot has
  the same shape (its own Suspense), so a day moving between the near read and the further
  one as the window re-centres keeps its state. Slots entering the window fill and slots
  leaving it become skeletons by ordinary reconciliation, each panel keyed by its date.
- **The day in view is the carousel's.** A settle (drag, arrow, key or chip) shows that day's
  own header, or a date-only header until its slot fills, and lights the strip at once. It
  then pushes the day's address straight away with `router.push(href, { scroll: false })`,
  with no progress bar: the day is already on screen. A second settle before the first lands
  pushes the newer day and the router drops the older one. The page's own date catches up
  when the navigation lands; a landing for the day in view moves nothing, so it cannot
  disturb a gesture in progress. A date that differs (Back, Forward) moves the scroller there,
  never mid-gesture, even with a push still in flight. A navigation that ends with the day
  unchanged parks the scroller back on the day shown, as before. One that never ends is
  given up 15 s after the latest push; a filled day in view stays, and only one that never
  filled parks back.
- **Not `history.pushState`.** A URL the router did not navigate to leaves it inconsistent: a
  refresh then resets the scroll position and Back breaks.
- **What runs off screen.** Every panel but the day in view is `inert`, and days further
  than one slot from it also pause their animations; the Day map mounts only for the day in view. Opened before that
  day's navigation lands, it waits for the landing to write `?map=1`: Next folds a
  `replaceState` into its router, and writing to the previous day's address undid the
  navigation in flight.
- **Keeping the Traveller's place.** A slot that has not filled keeps the height of the day
  it replaced, and the day in view and the header hold their heights through every commit,
  so WebKit never clamps the scroll position to a briefly shorter page. The header changes
  height with the day (holiday notes, which the date-only fallback cannot know without a
  further read); when the page is scrolled into it, the carousel scrolls by the difference so
  the body stays still. The header, strip and body are out of scroll anchoring: WebKit's
  moved the page the wrong way and Chromium's doubled the correction.
- **One day's controls never act on another.** The carousel swaps one day's header for the
  next in place, so the Day title editor and the header's add menu are keyed by date.
- **No page-turn.** Below lg nothing runs a view transition on a day change any more; the
  far-jump page-turn and the `day-settle` type are removed.
- **From lg** only the day in view renders. A day change shows it and its header at once,
  crossfading the body (keyed by the day, since nothing remounts any more), then makes the
  same push. Browser Back and Forward still cut.

The reserve option above, moving the Day chrome into a layout, is no longer needed: the
rewrite keeps the whole page mounted instead.

## Amended 2026-11-22: the heading travels, and a far tap cuts

Cam watched a screen recording of the Day view on his iPhone (spec 2026-11-22 §2). The body
slid with his finger and the Day strip followed it, but the heading and the lit chip waited
0.6 to 0.8 s for the scroll to settle and then snapped across. The new heading's height then
jolted the strip and the body. A tap on a day further than one away slid the body through
every day in between, under a heading that had already changed.

Three rules, below `lg`:

- **The heading travels with the body.** The heading area is a clipped track holding the
  day in view's header and, while the body moves, the header of the day it moves towards (its
  own, or the date-only one until its slot fills). The track follows the same progress the
  body and the strip do, and the area's height moves between the two headers' heights. Only
  the day's own heading travels: the eyebrow, the Day title, the date, the place line and any
  holiday note. The arrows and the top bar (Trip switcher, Share, bell) are not part of a day
  and stay put. They sit in each day's header, so the track undoes its move on the day in
  view's (an exact counter-translate) and hides the neighbour's. Taking them out of the
  header would mean rebuilding it.
  Transform and height are written to the DOM per frame; only a change of neighbour renders.
  The track lives in the carousel's header box, inside the carousel's context, where the
  height hold and the swap correction already are.
  If the page is scrolled into the header when a gesture starts, the height holds and the
  correction on the swap keeps the body still, as before. The track is full width, like the
  body's scroller, so the heading moves as far as the body does.
- **The lit chip changes at halfway.** The carousel tells the strip which day the body
  mostly shows (`subscribeNearest`, optional on the carousel's API so a stand-in carousel
  need not provide it). That day takes `aria-current` and the lit chip as the
  body crosses halfway, and gives them back if the drag returns. The strip itself is placed
  from the day in view's index plus the progress, never from a position it remembered or
  measured from a chip. Below `lg` it re-centres on the day in view at every settle, and on
  the phone it no longer glides from where it was left when the Day view is entered from
  another section: it is placed. That replaces "the strip restores its own position across
  the remount" (Considered options) for the phone.
- **The strip is on the day shown before hydration.** Cam saw day 36 shown with the strip on
  days 1 to 4 and nothing lit: the lit chip was off screen. On a cold load the body is put on
  the day shown by its inline script while the HTML parses, but the strip had none, and sat
  at 0 until React hydrated. The phone strip now carries the same kind of script, which
  waits for a width inside React's hidden streaming container.
- **No held height outlives its swap.** The heading box's hold (2026-11-19) is set and
  released in the same commit, and the track's interpolated height is cleared on the settle
  or the commit that changes the day in view. After a settle the heading box is the day in
  view's heading, exactly.
- **A far tap is a cut.** A day further than one away is shown in one commit: heading,
  strip and body together, with one scroll write, no glide and one push. An adjacent tap, an
  arrow or a key still glides.

The day in view and the push still change on the settle, not at halfway. `inert`, the
pausing of far panels, the one Day map, and the push with its landing, give-up and park-back
all hang off the day in view. Moving it mid-gesture would hand the neighbour focus and its
map under a finger still deciding, and push addresses for days the Traveller only passed.

This replaces "A settle (drag, arrow, key or chip) shows that day's own header … and lights
the strip at once" in the 2026-11-19 amendment. A settle now finishes what the gesture
already showed: the incoming header was on screen before the finger lifted. From `lg`
nothing changes.
