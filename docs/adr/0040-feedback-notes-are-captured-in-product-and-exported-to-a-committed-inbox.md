
---

## Amendment — 2026-09-21: a note also survives its author

The original decision made a Feedback note survive the **Trip** it was written
about, by snapshotting `tripId`/`tripName` as plain columns with the schema
comment "deliberately NOT foreign keys". It left the **author** on a real
relation with `onDelete: Cascade`, so deleting a User silently deleted every
remark they had ever written.

`FN-05` raised this as the same problem one relation over, and it is settled
the same way rather than differently: `authorId` becomes a plain snapshot
column with no relation, and a new `authorName` snapshot records who wrote the
note at the time they wrote it. The alternative — a nullable `authorId` with
`onDelete: SetNull` — preserves the note equally well, but introduces a null
branch into every query, type and permission check that reads the column, and
diverges in shape from the `tripId` precedent three lines above it in the
schema. One precedent, applied twice, beats two shapes for one idea.

ADR 0046's visibility rule is unaffected and needs no special case. Notes are
filtered with `where: { authorId: user.id }` (`server/actions/feedback.ts:125`)
and deletion is gated on `note.authorId !== user.id` (`:150`). A deleted
User cannot sign in, so their id can never be the viewer's id: an orphaned
note is automatically invisible to every non-admin and deletable by none of
them, while admins continue to read all. That is the correct outcome, reached
without writing a rule for it.

The migration is additive on both the read and the write path, satisfying both
hazard shapes `docs/DEPLOY.md` §4b names: `authorName` is added **nullable**
(so the still-running old build, which does not write it, cannot violate a NOT
NULL constraint) and backfilled in the same migration, and dropping a foreign
key constraint removes a restriction rather than adding one — the old build's
`author` relation reads join on the column, which remains.
