# 0058 — A Journal day holds one entry per Traveller, not one shared entry

## Status
Accepted (2026-09-23)

## Context

`ARCH-DAT-6` (**P0**, `docs/architecture-sitrep-2026-09-22.md`) found that
the Journal stored **one row per `(tripId, date)`**, shared by everyone on
the Trip, written by an autosave with last-write-wins semantics. Two
Travellers writing up the same day — the single most likely moment for two
people to write at once — each held a textarea seeded from whatever the row
said when their page loaded. Whoever blurred last replaced the other's prose
outright. There was no conflict detection, no merge, no warning, and no
history: the losing text was gone, and neither Traveller was told it had
happened.

This was a one-household assumption, not a bug in the save path. With two
people who are in the same room it is a rare annoyance; with 10–15
independent Travellers planning their own Trips it is a data-loss class that
nobody reports, because nobody knows.

## Decision

1. **`JournalEntry`'s unique key becomes `(tripId, date, authorId)`.** A
   Journal day is a *list* of entries — one per Traveller who wrote
   something — rather than a single piece of text with several authors. The
   day view and the Journal page both render every entry for the date,
   attributed. A Traveller's save can only ever touch their own row; there is
   no code path by which one Traveller's write reaches another's entry.

2. **The conflict class is removed by construction, not detected.** There is
   nothing to detect, because there is no longer a shared cell for two
   writers to land in. This is the whole point of the change: the previous
   design's failure mode was silent, and anything that *detects* a silent
   failure still has to decide what to do about it and still has to be
   believed by the person it interrupts.

3. **Rejected: optimistic concurrency on the shared row.** Stamp a version
   or compare `updatedAt`, refuse a stale write, and surface a conflict
   dialog. It was rejected because it keeps the shared cell and adds a
   failure mode on top of it: the Traveller who loses the race now gets a
   modal in the middle of writing, in an autosave-on-blur UI where a "save"
   is not a deliberate act they can meaningfully retry. It also does nothing
   for the ordinary case the Travellers actually want, which is *both* of
   them writing about the same day. Detection makes the loss visible;
   per-Traveller entries make it not happen.

4. **Blanking the box no longer deletes silently.** Deleting an entry is a
   confirmed action, and the save path awaits any in-flight autosave before
   deleting, so a blur cannot resurrect a just-deleted entry.

## Consequences

- **The migration takes one deploy through the `docs/DEPLOY.md` §4b window,
  knowingly.** It is the second write-path shape that section names:
  `DROP INDEX "JournalEntry_tripId_date_key"` removes the unique index the
  *currently deployed* build's `upsert` compiles to as its
  `ON CONFLICT (tripId, date)` target. For the length of the Vercel build,
  the old build can still read Journal entries but cannot save one. §4b
  prescribes two deploys for this shape; one was taken deliberately, because
  this branch ships **before** TEEPEE opens to additional Travellers, so the
  only people who can be mid-save are the operator and one co-Traveller, and
  the operator chooses the moment. Mitigation is procedural and is in
  `docs/DEPLOY.md`: deploy at a quiet moment, watch the build to completion,
  do not write a Journal entry while it runs.
- **An empty `JournalEntry` table would not have made this safe**, and that
  is worth stating because it is the intuition that gets this wrong. The
  failure is a **missing `ON CONFLICT` target** — the statement is invalid
  against the new schema — not a row collision. It fires on the first insert
  whether or not any row exists.
- Existing entries survive untouched: they already carry `authorId`, so each
  becomes that author's entry for its day and the new unique key holds over
  the existing data without a backfill.
- A day can now show several entries, so the read surfaces had to stop
  keying a `Map` by date alone. Both the Journal page and the day view are
  pinned by regression tests that assert the real multi-entry shape.
- Reading a Trip's Journal is now reading a small correspondence rather than
  a single account of the day. That is a product change, not only a
  storage one, and it is the intended one for a Trip with more than one
  Traveller on it.
