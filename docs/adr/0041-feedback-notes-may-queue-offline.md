# 0041 — Feedback notes may queue offline; ADR 0016 still holds for everything else

## Status
Accepted (2026-09-08). Narrows ADR 0016.

## Context
ADR 0016 made offline support **read-only** and explicitly rejected "offline
editing with a mutation queue and sync" — it needs conflict resolution over
shared trip state, and that was well beyond the goal of read access.

A **Feedback note** is the one write where that reasoning does not transfer.
It is append-only, owned by its author, read by no other part of the app, and
touches nothing another Traveller can be editing — there is no state to
conflict over. It is also the write most likely to be attempted offline: the
moment something in the app frustrates you abroad, on a train, with no signal,
is precisely the moment worth capturing, and it is the moment a failed send
loses the remark for good.

## Decision
Feedback notes written offline are queued in `localStorage` and flushed
automatically on reconnect, shown as **pending** in the Feedback panel's log
until they land. Each note carries a client-generated key, unique in the
database, so a replayed flush is idempotent rather than duplicating.

This is a carve-out for one append-only, conflict-free entity, **not** a
general offline-write capability. ADR 0016 stands unchanged for every other
mutation in the app: Stops, Costs, checklists and the rest still fail while
offline.

## Consequences
- This is the app's first offline write and its first client-side queue. A
  future reader finding one must not read it as precedent — anything touching
  shared plan state needs conflict resolution ADR 0016 still declines to build.
- A note can reach the server materially later than it was written, so the
  authored-at timestamp comes from the client and the row also records when it
  landed. The Feedback inbox orders by the authored time.
- A note queued on a device that is never opened online again is never sent.
  Accepted: the alternative is a background sync worker for two users' remarks.
- The unique client key is the sole duplicate guard; it must be generated once
  when the note is written and reused on every retry, never regenerated per
  attempt.
