# 0044 — Day ideas draw only from the traveller's own pools

## Status
Accepted (2026-09-14).

## Context
A free-form day — one with nothing scheduled (`isFreeFormDay`, ADR/Task 8) —
used to show only the Nearby Wishlist rail, and only when something happened
to be located within its (tight, 1.5 km) radius of a scheduled item or
tonight's accommodation. On a day with nothing scheduled at all there were no
anchors, so the rail was always empty: the exact day a traveller most needs a
nudge showed them nothing.

CONTEXT.md names this surface "Day ideas": a Travelling-phase-only menu that
resurfaces what the traveller has already put into the trip — things to do
already attached to the day's Stop (ADR 0022) and Wishlist ideas worth
considering nearby — rather than fetching anything new. The copy must never
say "suggestions", "recommendations", or "POIs"; these are the traveller's own
items being resurfaced, not the app's opinion.

Widening the radius alone doesn't fix the anchor problem — a day with nothing
scheduled still has no anchor to measure distance from. The natural anchor
for a free-form day is the Stop itself, not scattered scheduled items. But
Stops (and Wishlist ideas) are often entered without coordinates — a
traveller who jots "try the ramen place Dana mentioned" onto the Wishlist
gave it a title, not a pin. Matching by distance alone would silently drop
every hand-typed idea that never got geocoded.

Task 14 added a derived `countryCode` to `Item` (mirroring `Stop.countryCode`
and `Marker.countryCode`), giving every idea a second, coarser way to match a
Stop even without coordinates.

## Decision
- Day ideas draws from exactly two traveller-curated pools: Items already
  attached to the day's Stop with no date yet (`THINGS_TO_DO_WHERE`) and the
  trip's Wishlist ideas (`WISHLIST_IDEA_WHERE`), selected via
  `dayIdeasWishlist` (Task 15, `lib/nearby.ts`). It never calls an external
  places/POI API.
- `dayIdeasWishlist` matches a Wishlist idea to the day's Stop in priority
  order: **nearby** (located within `STOP_NEARBY_RADIUS_KM` — 30 km, a
  city-scale radius, wider than the 1.5 km Nearby Wishlist radius because the
  anchor here is the Stop itself, not a single scheduled item) → **same
  country** (both carry a `countryCode` and they match) → **unlocated** (the
  idea has neither coordinates nor a `countryCode` — it surfaces on every
  Stop rather than none, since there's no evidence it belongs anywhere in
  particular). An idea that is located far away, or carries a `countryCode`
  that mismatches the Stop's, is **excluded** — it is provably elsewhere.
- The component (`components/trip/day-ideas.tsx`) is mounted only on a
  free-form day (`isFreeFormDay`) in the Travelling phase — pre-departure
  phases show, at most, a light link to browse the Wishlist, never the full
  menu (CONTEXT.md). `phase-travelling.tsx` needs no phase check of its own,
  since it only ever renders during the Travelling phase.
- Scheduling a thing-to-do from the menu goes through `scheduleItem`'s
  in-place branch and must spread its existing `startTime`/`endTime` into the
  call — that branch overwrites both fields wholesale when they're absent
  from the input, so omitting them would silently wipe a thing-to-do's
  existing time. Scheduling a Wishlist idea goes through the copy-in branch
  (ADR 0019) with `{ date }` only.

## Considered Options
- **Call an external places/POI API** (e.g. a "nearby attractions" search) to
  fill empty free-form days. Rejected: it requires network access the
  traveller's phone may not have on the road, adds noise indistinguishable
  from the traveller's own curation, costs money per call, and duplicates
  what the phone's own map app already does better. Day ideas' job is to
  remind, not to discover.
- **Match Wishlist ideas to a Stop only via `sourceMarkerId`** (i.e., only
  ideas created by converting a mapped Marker, which already carries
  coordinates). Rejected: it misses every hand-typed Wishlist idea — exactly
  the "ramen place Dana mentioned" case — which is common enough that
  excluding it would make the menu feel unreliable.
- **No country-code matching — location or nothing.** Rejected: it strands
  every unlocated, hand-typed idea on every Stop of the trip (never surfaced)
  or on none (also never surfaced, if unlocated ideas were excluded outright
  as "not provably here"). Matching on `countryCode` when available, and
  falling back to "surfaces everywhere" only when an idea carries neither a
  location nor a country, is the option that loses the fewest genuine ideas
  while still excluding the ones provably elsewhere.

## Consequences
- A free-form day in a single-country trip effectively shows every unlocated
  Wishlist idea plus every idea in that country — which is most of the
  Wishlist on a short trip. This is intentional: better to over-show a
  traveller their own list on an empty day than under-show it, and the
  Nearby Wishlist rail (tight 1.5 km radius) still runs on planned days for
  tighter, location-driven anchoring.
- Multi-country trips get real discrimination for granted from Task 14's
  `countryCode` without needing every Wishlist idea geocoded.
- `dayIdeasWishlist` and its Task 15 tests already do the pure selection
  work; this ADR only asserts the boundary — no live external data source is
  ever a candidate.
