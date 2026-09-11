# 0042 — Real trips are generated once from a committed builder, never repaired live or rebuilt

## Status
Accepted (2026-09-10)

## Context
Cam's real "Christmas in Europe 2026" Trip was entered by hand in the running
app and drifted badly from the actual bookings. The evidence, all of it real:
every one of seven Stops sat exactly one day before its own Accommodation's
booking — Munich's Stop read 12-05→12-09 while the hotel confirmation read
12-06→12-10, and the same one-day offset recurred on Strasbourg, Frankfurt,
Paris, London, Aghalee and Milan. The Rome Stop had no dates at all, despite a
booked return flight departing Rome. Two Costs recorded a cost amount of $0
against real payments of $895.59 and $1,635.69 — which CONTEXT.md's own
definition forbids ("a Cost with no number is not a Cost"). Two nights over
New Year had no Stop and no bed. And one Stop was misspelled with no country
code, so it could not geocode onto the route map.

This project's sandbox has no local Postgres — the only `DATABASE_URL` ever
reachable here points at production. A repair attempted directly in the app,
or a seed script whose first test run is also its real run, has nowhere safe
to fail: every mistake lands on the Traveller's actual Trip.

## Decision
A real Trip may be **generated once** from a committed, pure, unit-tested
builder module (`lib/real-trip/<trip>.ts` — here,
`lib/real-trip/christmas-europe-2026.ts`, `buildChristmasEurope2026`) and
persisted by an additive seeder (`prisma/seed-real.ts`), rather than repaired
by hand in the app or rebuilt by a wipe-and-recreate seed. The builder returns
a plain data descriptor — Stops, Accommodations, Transports and Costs —
transcribed from the actual booking confirmations, not from whatever was
previously in the database. The seeder persists it exactly once, guarded by
`assertNoExistingRealTrip` (`prisma/real/persist.ts`).

The consequence that matters most: **the builder is a one-time origin, not a
synced source of truth**. Once the Trip is written, the app owns it —
Travellers edit its Stops, Accommodations, Transports and Costs there from
then on, and the builder is not re-run to reconcile drift. Re-running the
seed is an error, not a resync: `assertNoExistingRealTrip` throws rather than
wiping or duplicating. The builder will go stale the moment the Trip is
edited in the app, and that is intended, not a defect — it exists to get one
Trip into the database correctly once, not to keep it in sync afterwards.

## Considered Options
- **Repair in place on live data.** Rejected: with no local Postgres to
  rehearse against (see Context), there is no way to test the repair first —
  every mistake in a hand edit or a one-off fix-up script would land directly
  on the Traveller's real Trip, with the change history as the only record of
  what happened.
- **Wipe-and-recreate idempotency.** The pre-existing `wipeRealTrip()`
  (`prisma/real/persist.ts`) deletes every Trip matching the real Trip's name
  before recreating it — the usual shape for a re-runnable seed. Rejected for
  the live path: it destroys any edits a Traveller made in the app after the
  first write, and pointed at production by mistake it destroys real data
  with no undo. `wipeRealTrip()` is retained in the module as a manual,
  local-only escape hatch; it is referenced by nothing on the live path
  (`prisma/seed-real.ts` never calls it).

## Consequences
- With no database to verify against, the builder's unit tests
  (`lib/real-trip/christmas-europe-2026.test.ts`) and the pure
  `summariseRealTrip()` dry-run printout are the only pre-flight checks
  available before a write touches production — there is no rehearsal
  environment behind them.
- The tests are golden-data tables transcribed independently of the
  builder — dates, confirmation numbers and amounts copied a second time from
  the booking confirmations, not derived from the same code that assembles
  the Trip — so they catch a mistyped confirmation number or a transposed
  price rather than merely restating the implementation back at itself.
- Because the seed is additive and refuses to run twice, fixing a mistake
  found after the real write is an in-app edit, never a second automatic run
  of `db:seed:real`. A manual `wipeRealTrip()` and re-seed is the fallback of
  last resort — **DANGER: it deletes real data** (every Trip of that name and
  its attachment blobs) with no undo, so it is a deliberate, local-only act,
  never wired into the seed path and never pointed at production casually.
- The original hand-entered Trip ("THE Trip") is untouched by this decision —
  it is not deleted, migrated or reconciled. The corrected Trip is added
  alongside it, not in place of it.
