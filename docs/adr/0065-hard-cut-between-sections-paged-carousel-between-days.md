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

- Three `getDay` loads per Day page, in parallel. A range loader is a listed follow-up
  (spec 2026-09-30 §F).
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
