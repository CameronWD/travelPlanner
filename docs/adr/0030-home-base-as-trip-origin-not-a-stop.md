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

## Amendment — 2026-10-14: the Home base carries a timezone

Decision 1 said "no timezone is stored", because time display fell back to UTC
and a home zone would be dead weight. Timezone display has since shipped: each
end of a **Transport** is read and written in its own Stop's zone. A Home end has
no Stop, so it borrowed the *other* end's zone. A Gold Coast departure was shown
in Bali time, and a ticket time typed for it was saved two hours off. The reason
for storing no zone no longer holds.

1. **The Trip stores `homeTimezone`** (IANA), next to the other Home base fields.
   It is guessed from the country when the Home base is geocoded, and can be
   changed in Trip settings or over MCP (`update_trip`). A country guess is often
   wrong inside a country (Australia guesses Sydney; the Gold Coast is Brisbane,
   with no daylight saving), so the zone stays editable. Renaming the Home base
   re-guesses it only when the country changes, so a hand-picked zone survives a
   rename within the same country. Clearing the Home base clears it.
2. **A Home end of a Transport uses `homeTimezone`**, for display and for
   reading typed times. When it is unset, the old fallback (the other end's zone,
   else UTC) still applies.
3. **No stored leg times were rewritten.** The only timed Home legs in production
   at the time (two, on one Trip) already held the true UTC moment, so they show
   correctly once the zone is set.

Zones are not worked out from coordinates. A Transport end that is a departure
or arrival point with no Stop keeps the other end's zone.

## Amendment — 2026-10-16: the zone comes from the point

The 2026-10-14 amendment guessed `homeTimezone` from the country and kept a
hand-picked zone across a same-country rename, because the guess was
country-granular (Australia → Sydney). With an offline point lookup
(`@photostructure/tz-lookup`, spec 2026-10-16 F3) the guess is the zone at the
Home base's point, so that protection now keeps exactly the wrong zone.

1. **One rule, shared with Stops** (`homeBaseTimezone` beside `stopTimezone`
   in `lib/tz.ts`; `resolveHomeTimezone` in `lib/tz-point.ts` does the lookup):
   a zone the Traveller sent wins; else the zone at the Home point; else the
   country's; else none. A point at sea gives no zone.
2. **A rename re-derives it** from the new point when no zone is sent with
   it. When the new place gives no zone, an unchanged country keeps the zone
   and a changed one clears it. A failed geocode still keeps it.
3. "Zones are not worked out from coordinates" (above) no longer holds for
   the Home base or a Stop. A Transport end that is a departure or arrival
   point with no Stop still keeps the other end's zone.

## Amendment — 2026-10-16: changing the Home timezone keeps Home-end local times

The 2026-10-14 amendment made the Home zone editable but left stored leg
times alone. A Transport time is typed as a local time off a ticket and stored
as an instant read in that end's zone, so correcting a wrong guess moved every
typed Home-end time. Changing Sydney to Brisbane in December moved a 06:10
departure to 05:10. For a ticket, the local time is the fact.

1. **A save that changes `homeTimezone` keeps every Home-end time's local
   time.** It does not matter where the change came from: Trip settings,
   `update_trip`, or a Home base rename that re-derives the zone (whichever
   rule picks it). Each affected end's stored instant is recomputed from the
   wall-clock time it showed, in the new zone. This covers the real plan and
   every Fork, because the Home base is trip-wide. It happens in the same
   transaction as the zone write, and the soft end date is then re-grown
   (spec 2026-10-16 F4).
2. **An end is affected when its resolved zone changes.** The test is the
   rule the write path and every display share (`resolveEndpointZones`):
   a Home end, and also a non-Home end with no Stop that borrowed the Home
   zone. Moving from no zone re-reads the times in the fallback they were
   typed in (the other end's Stop zone, else UTC). Clearing the Home base
   does the reverse. Point 3 of the 2026-10-14 amendment was a note about
   that one migration. It does not govern later changes.
3. **An end with no time is untouched.** A date-only booking import stores
   no time. A local time that doesn't exist in the new zone (a daylight-saving
   gap) lands on the next valid time, e.g. 02:30 → 03:30.
4. **One Activity line** records the change, "changed the Home timezone to
   Australia/Brisbane; Home-end times kept as local times", and the legs
   record nothing of their own. `update_trip`'s description says the same,
   so Claude fixes a zone instead of retyping times.

No backfill: stored times are already the moments that were typed.
