# Home base is a trip-level origin, not a Stop

## Context

Every trip departs from somewhere and usually returns there, but the app had no
notion of it — a Trip carried a `homeCurrency` but no home *place*. The first leg
of a trip (the flight out) had nowhere to originate: a **Transport** could have a
null endpoint, already treated as "to/from home" **between-legs travel** (see
ADR 0008), but the app never knew *where* home was, never prompted for the
outbound/return legs, and could not put it on a map.

We needed a home origin. The obvious-but-wrong option is to model it as a **Stop**
and reuse the ordered-sequence, transport-endpoint, geocoding and map machinery.
We rejected that: a Stop is defined as "a place you are based" — home is not; you
hold no nights, **Accommodation**, **Items** or dates there. Modelling home as a
Stop would force "unless it's home" carve-outs across firm-up, ripple, per-Stop
nights and budget roll-ups, the "no accommodation" **Flag**, and more — pervasive
special-casing in the most load-bearing subsystem.

## Decision

1. **Home base is a lightweight, optional, per-Trip origin place** — `homeName`
   plus auto-geocoded `homeLat` / `homeLng` / `homeCountryCode` on the Trip
   (geocoded on save exactly like a Stop; a geocode failure saves the name with no
   coordinates). No timezone is stored — the codebase has no coordinates→IANA
   derivation and time display falls back to UTC (tz display is a deferred phase),
   so a home timezone would be dead weight. It is **not** a Stop. It is trip-wide
   (shared across the real plan and all **Forks**). A `roundTrip` boolean
   (default `true`) records whether the trip returns there.

2. **A Transport endpoint may be marked as the Home base** (`depIsHome` /
   `arrIsHome`), resolving its label, coordinates and timezone from the Trip. The
   **outbound** leg is Home base → first Stop; the **return** leg is last Stop →
   Home base. Existing null endpoints remain "unset"; the between-legs
   classification (any non-Stop endpoint) is unchanged.

3. **Home legs stay out of the date engine.** They are ordinary Transports with
   their own times (shown on Calendar/Timeline) but never move Stop dates or the
   **projected end** (which stays "last Stop's depart"). Firm-up, ripple and
   Make-it-fit are untouched. A missing outbound leg (always) or return leg
   (round-trip only) is nudged in **Next steps** and raised as a **Flag**,
   mirroring the existing "missing connection between two Stops" Flag; a return
   leg that lands after the **Hard end date** is a separate, self-contained Flag.

## Consequences

- **"Why isn't home a Stop?"** is exactly the question a future reader will ask —
  this ADR is the answer. The trade-off: we forgo automatic reuse of the
  Stop/transport/map machinery in exchange for keeping the Stop model and the date
  engine clean of home special-cases.
- **Why does the projected end ignore the return flight?** Deliberate (decision 3).
  Wiring the return leg into the date engine was rejected to avoid destabilising
  firm-up/ripple/Make-it-fit for what is an ~18-hour, largely cosmetic difference;
  the "lands after Hard end date" Flag recovers the useful guardrail without
  touching the engine.
- **Reversible at a price.** Dropping the feature means a down-migration for the
  Trip columns (`homeName`, `homeLat`, `homeLng`, `homeCountryCode`,
  `roundTrip`) and the Transport columns (`depIsHome`, `arrIsHome`), plus removing
  the nudges/Flags. The columns are harmless to leave.
