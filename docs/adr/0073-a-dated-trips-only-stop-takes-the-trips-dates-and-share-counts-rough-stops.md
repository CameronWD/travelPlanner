# 0073 — A dated Trip's only Stop takes the Trip's dates, and Share links count rough Stops

## Status
Accepted (2026-10-13). Amends ADR 0009.

## Context

ADR 0009 lets a Stop be **rough** (nights, no dates) on any Trip, and its
consequences say dated views "only ever show scheduled Stops". Share links
followed that rule into their counts: the hero, tally, social image and
"Use this route" all count `loadShareStops`, which drops rough Stops.

A Traveller made a two-day work trip with dates, added the hotel as one
rough Stop of one night, planned three dated Items from the Day view, and
shared it. The Share link said "0 stops" and showed nothing; the Day view
had no Stop, no weather and no Stop picker; and flights could not be added
anywhere, because Transport is only reachable from the plan editor's legs
between scheduled Stops. Nothing told them a rough Stop was the reason.

Three fixes were weighed: make Share and the Day view render rough Stops as
if dated; nudge ("this Stop has no dates yet, so it isn't on your Share
link"); or remove the state. A one-Stop trip with dates has nothing to be
rough about — you are there for the whole trip — so the state is a dead
end the app should not keep.

## Decision

1. **When a Trip has a start and end date and exactly one Stop, that Stop
   is scheduled to the Trip's dates** (arrive on the start, depart on the
   end). The Trip's dates win over the rough nights count. The rule runs on
   Stop create, on a Stop being made rough, on Trip dates being set, and on
   a delete that leaves one Stop. Adding a second Stop never un-schedules
   the first. A data migration applies the same rule to Trips already in
   that state.

2. **The UI does not offer the state it would undo.** The first Stop on a
   dated Trip is added with exact dates prefilled from the Trip; "Roughly"
   and "Make it rough" are absent while the Stop would be the Trip's only
   one. Rough remains available from the second Stop on, and always on a
   date-less Trip.

3. **Share links count every Stop of the real plan, rough included**, in
   the hero, tally, social image and "Use this route", and list rough Stops
   in the route list in slot order with nights and no dates. Route copy
   carries them. The dated day-by-day, Right now card and map pins stay
   scheduled-only, since they need dates or coordinates. ADR 0009's
   "dated views only show scheduled Stops" now reads: dated *sections* do;
   a Stop count is not a dated section.

## Consequences

- Transport becomes reachable from the Day view (an "add" chooser between
  an Item and a leg), because once the lone Stop has dates the outbound and
  return legs exist to be filled. That is a UI entry point, not a model
  change, and needs no ADR of its own.
- A Traveller who genuinely wants a dated Trip with one undated Stop cannot
  have one. We accept that: the nights of a lone Stop are the Trip's nights.
- The migration rewrites Stop rows, so reversing this decision later means
  accepting that those Stops stay scheduled.
