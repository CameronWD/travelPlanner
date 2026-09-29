# Day carousel and hard-cut section switches (2026-09-30)

Two things Cam raised in chat (not Feedback notes, so no `Resolves-Feedback:`
trailers), agreed in the 2026-09-30 grilling session. Seen on the iPhone PWA
against main. Glossary: **Day view** amended, **Day strip** added
(CONTEXT.md). Decision: ADR 0065 (amends ADR 0063's motion line).

What Cam sees today, and why:

- Switching sections on the phone tab bar shows the next screen before the
  current one is gone. Main carries the 2026-09-29 fade-out-then-in
  (`49968168`), but whether that build is live, or whether WebKit in the
  standalone PWA honours the class-based `::view-transition-*(.tp-crossfade)`
  rules, could not be confirmed from this machine. The fix below depends on
  neither.
- Day to day, "the whole page flicks left, then fades in". That is the current
  body view transition doing exactly what it was written to do: a 32px nudge
  with a fade out, a delay, and a fade in.
- The Day strip "highlights then swaps position": the highlight glides while
  the tap is pending, then the page remounts and the strip is set cold with
  `scrollLeft` so the selected chip lands third from the left.

## A · Section and tab switches: hard cut

- Moving between sections (Home → Plan, Trips → Globe, anything
  `SectionTransition` wraps) keeps the current page fully on screen until the
  next one is ready — unchanged, ADR 0063 — and then swaps in **one frame**.
  No fade in either direction, on any browser.
- `SectionTransition` keeps its keyed `data-section` wrapper (the audit and
  tests read it) and stops animating. The `.tp-crossfade` rules and the
  `SECTION_CROSSFADE` export go.
- The phone bars' `view-transition-name` rules and their group `z-index` stay:
  the Day view still runs view transitions (the heading text crossfade, the
  far-jump page-turn below) and the bars must stay above them.
- `npm run audit:nav`: the frame-by-frame Plan → Money check now asserts that
  no sampled frame shows both sections and that the swap happens in one
  frame (old heading in frame N, new heading in frame N+1, nothing between).

## B · Day view: a paged carousel

- The Day page renders up to three days: the day before, the day shown, and
  the day after (fewer at the Trip's ends). Data comes from `getDay` for each,
  in parallel. A single range load is a follow-up, not part of this.
- The three are full-width panels in one horizontal scroller with mandatory
  snapping, so a drag always lands on a whole day and never rests between
  two. The day shown is the panel in view **on first paint** (positioned
  before paint, no animation, no flash of the neighbour). Both breakpoints'
  trees (the phone and desktop bodies the page already renders and hides by
  breakpoint) live inside the panels.
- Neighbour panels are `inert` and `aria-hidden`: nothing in them can be
  focused, tapped or read out, and their dialogs and keyboard handlers do not
  double up. The scroller's height follows the panel shown; neighbours are
  clipped to it, so a short day next to a long one does not leave dead space
  below.
- **Dragging** tracks the finger natively. On desktop a two-finger trackpad
  swipe does the same; `overscroll-behavior-x: contain` keeps it from
  becoming the browser's back gesture.
- **Settling on a neighbour** navigates to that day. Settle is `scrollend`
  where the browser has it, otherwise a short quiet period with the scroller
  resting on a snap point. The navigation is a history entry, as every day
  change is today. The new page paints with its day in view at the same
  position, so the swap is invisible; the old page holds until then (ADR
  0063), and what it is holding is already the right day.
- **Arrows, keyboard, and a chip tap on the adjacent day** glide the scroller
  to that panel (~300ms, an iOS-style ease-out) and then navigate the same
  way. Every day change **keeps the vertical scroll position** — no jump to
  the top.
- **A chip tap on a further day** (day 3 → day 20) navigates with a
  full-width page-turn in the direction of travel: the old body slides out
  one edge as the new one slides in the other, both on screen throughout, no
  fade. This reuses the existing `day-forward` / `day-back` view-transition
  types; their CSS becomes a full-width translate with no opacity keyframes.
- **The heading's changing text** (date, eyebrow, Day title, sub line) still
  crossfades in place (~150ms, spec 2026-09-29 D4) on every day change,
  including carousel ones. Carousel navigations carry their own transition
  type that maps the body to `none` and the text to the existing `day-text`
  class. The arrows never move (unchanged).
- Both neighbour routes are prefetched on mount so the navigation after a
  settle is served from the client cache where possible.
- Known limit, accepted: a second swipe while the first is still landing
  meets the end of the scroller (only three days exist) until the new page
  paints.
- `DaySwipe` (the hand-rolled touch handler) is removed; the scroller replaces
  it. `DayKeyboardNav` drives the scroller. No `loading.tsx` or
  `template.tsx` anywhere (ADR 0063 stands).

## C · Day strip

- **Phone:** the day shown sits **centred**. The strip bleeds off both edges
  (today only the right). Chips snap to centre; the first and last days can
  be centred too, via end padding.
- While the body is dragged, the strip moves **in proportion** with it
  (linked to the body scroller's offset), so the day chips slide with the
  content. When the body settles, or a tap / arrow / key starts a day change,
  the strip glides to centre the target on the same curve and duration as
  the body, starting the moment the control is used (ADR 0063: the tapped
  control lights at once). On landing it is already there; the remount
  restores the strip where it was and finishes any glide still running.
- The coral highlight stays on the lit chip (spec 2026-09-29 D4) — it is not
  fixed to the centre, so a free flick of the strip leaves the highlight on
  the day shown.
- **Flicking the strip** only scrolls it; it snaps a chip to the centre when
  it stops. Tapping a chip is the only way the strip changes the day.
- **Desktop:** yesterday's minimal-scroll rule (spec 2026-09-29 D2) decides
  *where* the strip ends up, unchanged; it now glides there rather than
  jumping. The desktop strip does not track the body drag.

## D · Reduced motion

`prefers-reduced-motion: reduce` (the phone's Reduce Motion switch): dragging
still tracks the finger, because that is direct manipulation; every automatic
glide — the scroller after an arrow or chip, the strip catching up, the
heading crossfade, the far-jump page-turn — is instant.

## E · Verification, and what cannot be checked here

- Unit: the settle detector, the strip's centre and proportional-follow
  maths (pure, like `strip-scroll.ts`), the page rendering three panels with
  the neighbours inert, `SectionTransition` no longer animating.
- Browser (Chrome, local `next dev`): `npm run audit:nav` updated per A; a
  new check that the Day page's scroller is on the day shown at first paint
  and that an arrow press ends on the next day's URL with the vertical
  position kept.
- **WebKit cannot be exercised from this machine.** The carousel feel on the
  iPhone PWA is judged by Cam after a deploy to beta or main. If it is still
  off there, the second pass is on the iPhone, not here.

## F · Follow-ups (not in this build)

- A range loader for the Day view (`getDays(tripId, dates[])`) in place of
  three `getDay` calls.
- Rendering more than one neighbour each side, if rapid swiping feels stuck.
