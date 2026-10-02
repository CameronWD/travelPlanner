# A deleted Trip waits 30 days in Recently deleted before it is destroyed

## Status

Accepted 2026-10-02 on `fix/summary-width-and-safety-2026-10-02`. Extends ADR 0045
(who may delete) without changing it; the owner-or-member-Admin rule and the
type-the-name confirm stand.

## Decision

- `deleteTrip` no longer runs `db.trip.delete`. It stamps `Trip.deletedAt` and
  leaves every row in place.
- A Trip with `deletedAt` set is **gone for everyone except its owner's Trips page**:
  `requireTripAccess` answers `notFound()` for it, the Trips list, Share links, the
  Calendar feed, the Digest and the Globe all skip it. Its `TripSlug` stays reserved.
- The owner (or a member Admin, as ADR 0045) sees it under **Recently deleted** on the
  Trips page and may **Restore** it, which clears `deletedAt` and nothing else — Share
  links, Calendar feeds, membership and files come back exactly as they were.
- `npm run sweep:blobs` (the existing daily retention sweep) hard-deletes any Trip whose
  `deletedAt` is older than 30 days. The cascade then does what `deleteTrip` used to do,
  and the Attachments' blobs enter `DeletedBlob` from there as today.

## Why

Cam's second priority for the first testers is "people can't randomly lose their trips".
The one way a Trip is lost wholesale today is `Delete forever`, and the daily `pg_dump`
cannot undo it for one Trip without overwriting every other Traveller's live data. A
type-the-name confirm stops a slipped thumb but not a Traveller who regrets the
deletion a week later — the common case.

Alternatives weighed:

- **Keep hard delete, lean on the backup.** Rejected: there is no single-Trip restore,
  and writing one (restore dump to a scratch database, copy twenty tables' rows across
  by `tripId`, reconcile `TripSlug`) is far more work and far more dangerous than a
  `deletedAt` column.
- **Per-entity undo everywhere instead.** Rejected for this round: Stops and Items
  already have Undo; extending it to Costs, Accommodation and Transport is polish next
  to the Trip-level net, and shared editing is the product — members deleting things
  is a feature.
- **Hide the Trip but keep it readable (archive).** Rejected: a "deleted" Trip that
  co-Travellers can still open is not deleted, and the owner's intent was to make it
  go away. Recently deleted is visible to the owner only.

30 days matches the `db-backup.yml` dump retention and leaves the existing 35-day blob
margin intact: a Trip destroyed on day 30 has its blobs removed on day 65, still
after the oldest dump that could reference them has expired.

## Consequences

- One place to get right: every read of a Trip by a signed-in Traveller already goes
  through `requireTripAccess`, so the gate is a one-line change there plus the handful
  of token-gated and list queries named above. A new query that reads Trips without
  the gate must filter `deletedAt: null` itself.
- A Trip in Recently deleted still counts toward the owner's storage (see the quota in
  the 2026-10-02 spec); restoring it never fails for space.
- Cover photos of a deleted Trip stay in R2 until the sweep; the 30 days are the cost
  of being able to restore.
