# 0051 — Share links per audience, with a never-shared floor

## Status
Accepted (2026-09-20)

## Context

Sharing had no ADR: one bearer-token `ShareLink` per trip, a single public
page, everything-or-nothing. The trip-ready feature needed different levels
of detail for different audiences (family vs the group chat), and a share
page that is useful *during* the trip, not only before it.

Two designs were considered for "not everyone gets every detail": one link
with content toggles (the CalendarFeed pattern), or many links, each
labelled for its audience and carrying its own scope.

## Decision

1. **Many links per trip, scoped per link.** `ShareLink` drops its `tripId`
   unique; each link carries a required `label` and three dials —
   `includeAccommodation`, `includeTransport`, `includeDailyPlans`. One link
   per audience; revoking one never touches another. A single toggled link
   cannot serve two audiences holding it at the same time — that
   requirement is inherently per-audience.

2. **A never-shared floor no dial can pierce.** Money/costs/budget, Notes,
   confirmation numbers, booking references, Journal, Checklists,
   Attachments, Wishlist and Forks are never exposed on any link. The floor
   is structural: the public page never selects those fields, and an off
   dial means the corresponding query never runs. No configuration —
   present or future — can leak a booking reference, because there is no
   code path that reads one.

3. **The public page reads the Phase.** Same engine as the Home
   (`computeTripPhase`, today in the trip's current-stop timezone): pre-trip
   shows a countdown line, Travelling leads with a today card (day number,
   local time, weather, today's plan within scope), Past shows an ended
   line. Deliberately excluded: live check-ins/status, countdown timers,
   journal sharing — the share answers "where are they and what's the
   plan", not "are they safe right now".

4. **Grandfathering.** The migration turns each existing link into a
   full-scope link labelled 'Shared link' with its token unchanged —
   holders of an old URL see exactly what they saw before.

## Consequences

- Viewers still have no identity: a link names an audience, not a person;
  anyone holding the URL sees that audience's view. Rotation remains the
  remedy for a leaked URL.
- `share.ts` now returns the unified ActionResult (closes the ADR 0027
  holdout).
- The dials gate the today card and the day-by-day identically; a section
  can never appear in one and be hidden in the other.
