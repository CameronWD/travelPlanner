# Beta feedback: the design and features lot — 2026-09-26

Branch: `feat/beta-feedback-design-2026-09-26` (cut from `beta` after the fixes
bucket merged). Closes the 24 remaining beta Feedback notes from 2026-09-26 in
one branch. **Deferred, deliberately:** readable URL slugs (the URL half of
`cmuht5itv000004l5948amusj`) — it touches every link, share links, the offline
cache and old-id redirects, and gets its own session.

Each item names the Feedback notes it closes; the commit that does the work
carries `Resolves-Feedback: <id>` (ADR 0040). Nothing is resolved in
production from this branch. Glossary changes made during the grilling are
already in `CONTEXT.md` (Accommodation heading, Category **Place**, Fork
opt-in toggle, Reminder about a Stop, **Settlement**, Item hidden from
shares).

## Global constraints

- Desktop-only layout changes: the rail, the Trip home grid, the Trips list
  row, the Stop card row and the wider dialogs apply from the `md`/`lg`
  breakpoints. **Phone layouts are unchanged**: the bottom tab bar and its
  More sheet, single-column Home, single-column plan editor, bottom-sheet
  dialogs. Every layout task states this and its review checks it.
- Playground visual system (ADR 0060/0061/0062): paper and ink, 2px
  outlines, hard shadows, the 9-hue ramp, content up to `max-w-page-wide`.
  Kit references live under `design_handoff/playground-2/reference/ui_kits/`.
- Vocabulary is `CONTEXT.md`. UI copy never says "activity", "event", "stay"
  (except the heading "Where you're staying"), "hotel", "city" (use Place).
- Two schema changes (Reminder.stopId, Cost settlement, Item hidden-from-shares
  — three columns) ship as written Prisma migrations on the branch. **They are
  not applied to production by this work**; applying them is Cam's call
  before the affected notes can close on beta.
- Reduced motion is respected everywhere (`MotionConfig reducedMotion="user"`).

## A. Plan editor

### A1. Accommodation lives inside the Stop card — `cmuht8mse000304l59pms3vr8`, `cmuht87fk000204l5q3b728lh`

Accommodation rows currently render as siblings *below* the Stop card and an
expanded row opens a second, detached card. The Stop card gains a section
headed **"Where you're staying"** (a display heading; the term stays
Accommodation), between the Stop header and its things to do, listing each
Accommodation as a compact row (name, check-in → check-out, confirmation,
cost/paid state) with "Add accommodation" inline at the end. Expanding a row
opens its details *inside the card, in place* — nothing detaches below. A
Stop with none shows a quiet "No bed yet" row with the add action (the kit's
coral tile).

### A2. Stop card row layout — `cmuhuuye6000104jqyh0wyh84`

Follow the kit's `DPlan.jsx` row: name and country on the left with room to
breathe (the text block gets `flex-1`), dates/nights in a middle column, the
"Where you're staying" tile (A1) in the next, and the eight icon buttons
collapsed to two primary actions (Edit, Add thing to do) plus one overflow
menu holding the rest. Rough Stops keep their dashed treatment.

### A3. Things to do grouped by Category, bigger chips — `cmuhue58l000304lcb3uloihi`, (badge half of `cmuhuqi5w000004i4wy0gfub6`)

Under a Stop, things to do are grouped by Category with a small heading per
Category (in `lib/categories.ts` order), empty Categories omitted. Each row
uses a proper category chip (icon + colour, the existing `CategoryPill` at
`sm`) instead of the 6–8px dot whose 2px ink border swallows the colour. The
same chip replaces the dot on expanded day rows.

### A4. Day rows fill their width — `cmuhuqi5w000004i4wy0gfub6`

Collapsed day rows show as many item titles as fit the row (measured, not a
fixed two), then "+N" for the overflow only, with the chevron anchored to the
right edge; no dead space between "+N" and the chevron.

### A5. Wider entity dialogs — `cmuhu0rxp000c04l54gd96wgu`

`DialogContent` gains a `size="lg"` (≈44rem) variant; the Item, Transport and
Accommodation forms use it and lay their fields out in two columns from `sm`,
so on a normal desktop screen they fit without a scrollbar. Phones keep the
bottom sheet.

## B. Categories and Wishlist

### B1. Category **Place** — `cmuhtul0o000004jw4x36ndv1`

New Category value `PLACE` ("Place": a city, town, region or island —
somewhere to go rather than something to do) with its own hue and icon, in
the shared set Items and Globe Markers use. No data migration: existing rows
keep their categories; Cam re-files "Paris" by hand.

### B2. "Anywhere" renamed — same note

The Wishlist group for ideas with no Stop is headed **"Not tied to a Stop
yet"**.

### B3. Plan variants (Forks) opt-in per Trip — `cmuhtvo4x000104jwxdfp1638`

`Trip.forksEnabled` (boolean, default false) mirroring `chaptersEnabled`.
Data migration sets it **true for any Trip that already has a Fork**. A
toggle "Plan variants" in Trip settings. While off: no Fork switcher in the
trip header, no "in this plan" markers, no Compare entry, no Fork affordances
anywhere; the Trip shows its real plan. Existing Forks stay dormant and
return exactly when toggled on.

## C. Reminders and Money

### C1. A Reminder about a Stop — `cmuht7e5e000104l5u6hibnkw`

`Reminder.stopId` (optional, nullable, `onDelete: SetNull`). "Add a
reminder" on the Stop card (in the overflow menu, and inline under the Stop's
own reminders list); the date field starts empty (Stop reminders are usually
"before we go"). The Home reminders card shows the Stop as a small chip; the
Stop card lists its own reminders. Still no time on a Reminder.

### C2. Settlement on a Cost — `cmuhtpl7v000004ig0f1kf6ae`

`Cost.settlement` enum `BEFORE | ON_TRIP`, default `BEFORE`, set from a
two-way choice in the inline cost fields and the Cost editor ("Paid before
you go" / "Paid on the trip"). The Money page rolls the two up separately:
two headline totals and a section each; **Upcoming payments** only ever list
`BEFORE` costs that are unpaid. Existing Costs default to `BEFORE`.

## D. Sharing

### D1. Item hidden from shares — `cmuhukle5000b04jwm8sjdr00`

`Item.hiddenFromShares` (boolean, default false). A checkbox on the Item form
"Hide from shared links". The share page never renders a hidden Item whatever
the link's scope (ADR 0051 floor). The plan editor and the day page show a
small "hidden from shares" mark on such an Item. Items only.

## E. Trip home (desktop)

### E1. Three-column tile grid — `cmuhs2jwo000004l56xzttpf0`, `cmuht3y6y000104l02v8jn2as`

Planning/Final-prep home on `lg+` follows the kit's `DHome.jsx`: a
three-column grid where the countdown hero is one column spanning two rows,
with stat tiles beside it (days to go, cost so far, next upcoming payment,
reminders), and the map, next steps and quick actions below at tile widths.
Nothing spans 2/3 of the page. Sketching, Travelling and Past homes keep
their current layouts. Phones: unchanged single column.

### E2. Cover as a tile — `cmuhtestc000604l5gakrp4hj`

The cover becomes a tile in that grid: the photo cropped to fill
(`object-cover`) with a focal-point choice in the cover settings. Where a
portrait photo cannot fill the tile, a light blurred copy fills the edges at
tile size — never a full-width blurred backdrop. The Trips list cover uses
the same rule.

### E3. Bounded map — `cmuhsyae2000004l0d19tlzr2`

`RouteMap` gets `worldCopyJump: false`, tile `noWrap: true`, `maxBounds` at
the world with viscosity, and a minimum zoom that prevents a second copy of
the world in the tile; the home map has a fixed aspect inside its tile rather
than stretching across the page.

## F. Trips list

### F1. No-photo cover — `cmuhrynn1000004l57dj81mc4`

The gradient fallback is replaced by a **flat hue tile** (trip-hashed hue
from the ramp) with the initial in the display font; the drawn route stays
for trips with located Stops.

### F2. Even rows, a richer "Next up" — `cmuhrzt88000104l55c4qg9vt`

Every card fills its grid row (`h-full`) with covers at fixed heights so rows
line up. The featured first card keeps its two-column span but earns it:
cover (photo or route), the countdown in the display font, the route summary
(first Stop → last Stop, Stops and nights), the phase badge, and the Home's
next step. It never shows a single-letter tile: with no photo and no located
Stops it sets the trip name large on the hue tile.

## G. Rail and navigation (desktop)

### G1. The rail is always there — `cmuhtgds8000804l5cmhljc31`

The Dock renders on every signed-in page. Inside a Trip: Home, Plan, Days,
Money, Wishlist, More, then Trips, Globe, You. Outside a Trip (Trips, Globe,
You, account pages): Trips, Globe, You only. The app header loses its Globe
link; it keeps ⌘K, theme and the avatar menu. Phones: unchanged.

### G2. More is a page — `cmuhtfs43000704l5q3b728lh`

`/trips/:id/more` renders a tile per section (Summary, Journal, Checklists,
Files, Activity, Settings, Help) with a one-line description each; the rail's
More entry links there (active on any of those sections). The dropdown menu
goes. The phone More sheet stays.

## H. Days and the single day

### H1. Check-in/out glyphs and legend — `cmuhum07i000004la36b5gzyr`

Month grid: a bed icon for check-in and a bed-with-arrow for check-out,
named in each tile's `aria-label`, and a legend row under the grid beside
the Stop colours (Transport modes included).

### H2. Single day header at reading width — `cmuhsodiw000004l592vwkarj`

The header (date/Stop left, weather right) shares the body's reading width
(`DAY_READING_WIDTH_CLASS`) so the two sit together; no empty middle.

### H3. Weather card by condition — `cmuhswcu7000004ku1zbnxcki`

`WeatherDaylightCard` takes hue and icon from the WMO code: sun for clear,
stone for cloud and fog, sky for rain and showers, lilac for snow, indigo for
thunderstorms. Solid fills only (the contrast audit can't measure gradients).

### H4. Motion polish — `cmuhtwkap000a04l57lqju6az`

Using the installed `motion` library and `lib/motion.ts` tokens: a spring
pop on dialogs opening, staggered entrance for the home tiles (E1) and the
More page (G2), a crossfade on the Days view switch. Reduced motion turns
all of it off. No animation lengthens an interaction.

## I. Landing page

### I1. Signed-out front door — `cmuhujm3u000a04jw7a6f0hs5`

`/` for a signed-out visitor renders the kit's `DLanding.jsx`: hero "Plan it
with your people.", the tilted sample cards, and the "Come on in" card on
the right doing sign-in (Google, dev logins in development). **Light mode
forced** on this page. A line explains access is by invitation. Signed-in
visitors still go to `/trips`. No invite section: inviting stays inside a
Trip's settings, owner-only (ADR 0052/0057).

## Verification

Logic lands with tests (A3 grouping, A4 measurement helper, B1 category set,
B3 gating, C1/C2/D1 actions and schema, E3 map options, F2 card content, G1
rail contents per route, H1 labels, H3 hue mapping, I1 render). Layout items
(A1/A2/A5, E1/E2, F1/F2, G2, H2) need a manual pass in the running app at
1438×723 and 1920×911, and on a phone width. Full suite, `tsc`, lint green.
