# Home base bookends the plan editor

## Context

ADR 0030 made the Home base a lightweight per-Trip origin that is **not** a Stop
and never feeds the date engine, and modelled the outbound/return legs as
ordinary Transports with a Home-base endpoint. The plan editor then rendered any
leg with a non-Stop (null) endpoint in a catch-all "Other transport" box at the
bottom of the page — so the outbound flight (Home → first Stop) and the return
flight (last Stop → Home) sat at the very bottom, lumped in with genuine
cross-chapter legs, rather than at the start and end of the journey where a
traveller reads them. The plan did not read chronologically, and the Home base
had no visible presence in the editor at all.

## Decision

In the **plan editor only**, the Home base is shown as a card that **bookends**
the itinerary: pinned above the first Stop (carrying the outbound leg or a prompt
to add it) and, on a round trip, below the last Stop (carrying the return leg or
its prompt). The card is not a Stop — it is not draggable or deletable, and
clicking it opens trip settings. The outbound/return legs are identified by the
same rule the Flags already use (a `depIsHome` leg arriving at the first Stop; an
`arrIsHome` leg departing the last Stop) and are removed from the "Other
transport" box; any other home-flagged leg stays there. One-way trips
(`roundTrip = false`) get the top frame only; a Trip with no Home base renders
exactly as before.

This is a **presentation-only** change: no schema change, and Flags, Next-steps
nudges, Budget, the date engine, the Summary route map, Calendar and Timeline are
untouched.

## Consequences

- **This reintroduces a home-specific carve-out** — the very thing ADR 0030 set
  out to avoid — but confined to the plan editor's *layout*, not the data model
  or the date engine. The trade-off: a small, isolated special-case in one
  component buys a plan that reads chronologically from home and back, which the
  uniform "home is just another between-legs leg" treatment could not.
- The Summary was deliberately left alone: its route map already draws the
  home→first and last→home bookend polylines, and the Calendar/Timeline place
  legs by real times where "top/bottom" is meaningless.
- Reversible cheaply — deleting the bookend rendering restores the old
  "Other transport" behaviour; nothing else depends on it.
