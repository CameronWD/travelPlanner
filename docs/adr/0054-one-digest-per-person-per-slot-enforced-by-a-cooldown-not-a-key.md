# 0054 — One Digest per person per slot, enforced by a cooldown rather than by the key

## Status
Accepted (2026-09-21)

Amends ADR 0050 (*One Digest per person, timed by the Device they actually
use*), whose Consequences left this case open.

## Context

ADR 0050 decided that a person receives **one** Digest per slot, timed by the
zone of the Device they most recently used. The dispatcher elects that zone
fresh on every run from `zoneByUser` (`app/api/cron/digest/route.ts:195-212`),
and the idempotency ledger `DigestDispatch` is keyed
`@@unique([userId, tripId, localDate, slot])`.

`CD-04` found the gap ADR 0050 itself flagged as "the exact harm decision 1
exists to prevent, in miniature": the elected zone is an *input* to the ledger
key but is not *part* of it. A person who uses a home laptop in one zone and
then picks a travelling phone back up in another, inside a single UTC day,
elects two different zones across two runs — and two zones produce two
different `localDate` values. Two different keys, two claims, two Digests.

Three fixes were considered.

**Putting the zone into the key** was rejected outright. It makes each run
simpler to reason about and it is the only option that needs a migration, but
it does not fix the harm — it *legalises* it. A person who changes zone mid-day
would still receive two Digests, one keyed to each zone. It deduplicates rows,
not people, and people are what ADR 0050 is about.

**Caching the elected zone per person per local day** would work, but the state
it introduces is circular: the local day you would invalidate the cache on is
itself derived from the zone being cached.

**A cooldown** needs neither. `DigestDispatch` already carries
`createdAt @default(now())` (`prisma/schema.prisma:777`), so "has this person
already had this slot recently?" is answerable from the rows that exist today.

## Decision

Before claiming a ledger row, `dispatchDigest` checks for an existing
`DigestDispatch` for the same `(userId, tripId, slot)` with `createdAt` inside
the last **18 hours**. If one exists, the dispatch is skipped — whatever
`localDate` the freshly-elected zone produced.

18 hours is chosen against the real spacing of the thing being protected. Two
consecutive same-slot Digests for a stationary person are ~24h apart, and the
slot windows are three hours wide (06–08 and 20–22 local), so the tightest
legitimate gap is ~22h. 18h clears that with four hours of margin while still
being far shorter than a day. The MORNING and EVENING slots are checked
independently, and they are 10–14h apart, so neither suppresses the other.

The existing `@@unique` constraint stays exactly as it is. It remains the
guard against two overlapping runs double-claiming an identical key; the
cooldown is a second, wider net for the case where the key itself moves.

## Consequences

- **The double-send is prevented rather than permitted.** Dedupe is now by
  person, which is the unit ADR 0050 reasons about.
- **No migration, and no new state to invalidate.** The guard reads a column
  that has existed since the ledger did, and expires on its own.
- **A traveller crossing enough zones eastward to fit two local evenings
  inside 18 hours receives one Digest, not two.** This is the decision working,
  not a regression: ADR 0050 says one Digest per person per slot, and a
  compressed local day does not make two of them correct. Recorded explicitly
  because it will look like a missing Digest to anyone reading the ledger
  without this ADR in hand.
- **The cooldown read is best-effort against concurrency.** Two runs
  overlapping in the same instant could both pass the read and then claim two
  different keys. The scheduled runs are hours apart
  (`0 6,9,10,19,20 * * *`), so this is theoretical; the unique constraint
  still prevents the identical-key case, which is the one that actually
  recurs.
- **The elected zone stays a per-run derivation.** Nothing about zone election
  changes, so ADR 0050's `lastSeenAt` tiebreak and its reasoning are untouched.
