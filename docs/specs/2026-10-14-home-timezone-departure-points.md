# Spec: Home end timezones, and departure/arrival points on Stop-linked legs

**Status:** agreed in the 2026-10-14 session (grill), building on branch
`feat/home-timezone-departure-points`. Target `main`.
**Source:** two Feedback notes on main, written over the Claude connection
on "Christmas in Europe 2026" (2026-10-13):

- `cmv7bza6t000506l3x5tx34f0`: wrong timezone for the Home end of a
  Transport leg.
- `cmv7c1dfw000606l3cv8t0fji`: MCP should allow a station or place name on
  a Transport leg that is linked to a Stop.

**Decision record:** ADR 0030 amendment (2026-10-14). CONTEXT.md **Home base**
and **Transport** updated.

## What happened

`resolveEndpointZones` (`lib/time-display.ts`) gives each end of a leg its
Stop's zone, else the other end's zone, else UTC. A Home end has no Stop, so it
borrowed the far end's zone. A Gold Coast departure showed in Bali time. The
save path shares the rule, so a ticket time typed for a Home end was saved
with the wrong UTC. ADR 0030 stored no Home zone on purpose, because timezone
display didn't exist yet.

`update_transport` rejected a Stop together with a place ("not both"), and
passing only a place detached the leg from its Stop. The in-app form had the
same either/or: choosing a Stop cleared the place, so editing any of the 7
production legs that carry both would delete its station.

Production checks (2026-10-14, read-only): only **2** timed Home legs exist,
both on Christmas in Europe 2026, both holding the true UTC moment. **7**
legs carry a Stop and a place, all on that Trip.

## Part A: the Home base has its own timezone

A1. `Trip.homeTimezone String?` (IANA). Migration adds the column and backfills
    every Trip with a Home base from its country code, using the same
    country→zone guess as Stops. Unknown country → NULL. After deploy the
    operator sets Christmas in Europe 2026 to `Australia/Brisbane` by hand
    (the guess is Sydney).

A2. One rule for every end's zone: Home end → `homeTimezone` when set;
    otherwise the end's Stop zone; otherwise the other end's zone; otherwise
    UTC. Display, the server's save and the form all use it, with the Home
    zone passed in.

A3. Setting it: Trip settings shows a timezone picker under Home base (same
    list as the Stop form), only while a Home base is set. The new-trip flow
    has no picker; the zone is guessed from the country. Renaming the Home base
    re-guesses only when the geocoded country changes. A zone sent in the same
    save wins. Clearing the Home base clears the zone.

A4. MCP: `update_trip` accepts `homeTimezone` (validated as a real IANA zone).
    `get_trip_plan` returns `homeTimezone` next to `homeBase`, and renders Home
    ends in it.

A5. No stored leg times are rewritten.

A6. The real-trip fixture (`lib/real-trip/christmas-europe-2026.ts`) gets
    `Australia/Brisbane` and its "documented exception" comment goes. Its test
    expects 17:50 and 17:30 local.

A7. Out of scope: zones are not worked out from coordinates. A departure or
    arrival point with no Stop keeps the other-end fallback.

## Part B: departure and arrival points on Stop-linked legs

B1. Each end of a leg is: a Stop; a Stop plus its point; a point alone; Home
    (no point); or unset.

B2. MCP `add_transport` and `update_transport` accept a Stop and a point
    together. Home plus a point is still rejected.

B3. Edit form: when an end is a Stop, an optional "Departure point" / "Arrival
    point" field shows under it, filled with the saved value.

B4. Changing an end:
    - a different Stop clears the point, unless a new one is given in the
      same edit;
    - switching to Home or "none" clears the point;
    - switching from a Stop to a point alone drops the Stop link;
    - an unchanged Stop keeps its point, which can be edited or cleared on its
      own (MCP: `""` clears it, leaving the field out keeps it);
    - deleting a Stop keeps the point (`onDelete: SetNull`; already true).

    MCP shape for B4: on `update_transport`, `depPlace` alone on a
    Stop-linked end sets the point and keeps the Stop. `fromStopId: ""` plus
    `depPlace` makes it a point alone. A new `fromStopId` alone clears the
    point. The same applies to `toStopId`/`arrPlace`.

B5. Shown as (Transport card, which the plan editor and Day view both use;
    Digest): if the point starts with the Stop's name, show the point alone
    ("Paris Gare du Nord"). If it equals the Stop's name, show the Stop. Otherwise
    show "Stop · point" ("Aghalee · Belfast City (BHD)"). The plan editor's short
    label ("LHR") and MCP reads are unchanged.

B6. Points are already geocoded on save; nothing new.

## Closing the notes

Commits doing the work carry `Resolves-Feedback: cmv7bza6t000506l3x5tx34f0`
(Part A) and `Resolves-Feedback: cmv7c1dfw000606l3cv8t0fji` (Part B). Never
run `feedback:resolve` on the branch.
