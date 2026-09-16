# 46. Feedback notes are private to their author; Admins read all

Date: 2026-09-16

## Status

Accepted

## Context

A Feedback note is a Traveller's own remark about TEEPEE, written from
wherever they are in the app (ADR 0040). `listFeedbackNotes` originally
returned every note to whoever asked, with no scoping at all — the Feedback
panel showed the full shared history, and any signed-in account could read
every other author's remarks about the software, including ones that name a
Trip or quote its content.

That is a second, unrelated grant riding on `ADMIN_EMAILS`, which ADR 0045
introduced for exactly one purpose: letting an admin delete a Trip it is
already a member of. ADR 0045 is explicit that "Admin" there "means 'not
blocked by ownership', not 'sees everything'" — a claim this change makes
false for Feedback notes specifically, so it needs recording rather than
leaving 0045 to quietly go stale.

## Decision

A Feedback note is private to the Traveller who wrote it. `listFeedbackNotes`
scopes to `authorId` by default; an account whose email is in `ADMIN_EMAILS`
gets the unscoped query instead and sees every author's notes. The same
scoping applies to the exported inbox in spirit, though not in mechanism:
`feedback:pull` and `feedback:resolve` read Postgres directly rather than
calling the action, so they are unaffected by this check either way and
always see everything — they run as the operator, off-app, which is the same
standing an Admin has in-app.

Deletion is untouched: `deleteFeedbackNote` stays author-only, even for an
Admin. Reading someone else's note in order to work on it is the whole point
of the grant; deleting someone else's note is not part of that and has no
justification here.

## Considered Options

- **Leave it global — every signed-in account sees every note.** Rejected:
  it hands any account, including a brand-new Traveller with no relationship
  to the operator, the full text of every remark ever written about the app,
  including ones that quote a Trip's name or content. Nothing about writing
  a Feedback note should require that risk.
- **Scope by Trip instead of by author.** Rejected: a note's `tripId` is
  nullable — plenty of notes are written from screens with no Trip in view —
  so this option needs its own rule for the null case anyway, and that rule
  ends up being "fall back to author", which is most of this decision without
  the part that actually protects anything.
- **Author-scoped, with an Admin override.** Chosen. It matches the
  CONTEXT.md **Feedback panel** entry — "a Traveller's panel is their own
  message log to the operator, not a shared forum; only an Admin sees every
  author's notes" — and the **Admin** entry, which now lists "reading every
  author's Feedback note" alongside the ADR 0045 delete grant as the two
  things Admin standing is for.

## Consequences

- The Feedback panel now reads as a private log to its viewer: an ordinary
  Traveller sees only what they wrote; an Admin sees the full shared history,
  which is what the panel showed unconditionally before this change.
- `ADMIN_EMAILS` now carries two grants, not one — see ADR 0045 for the
  delete grant. Both are recognised the same way (email match at request
  time, absent in development and test), but they are separate powers on
  separate resources, and this ADR is the record for the second one.
- `feedback:pull` and `feedback:resolve` need no change: they already read
  the database directly rather than through `listFeedbackNotes`, so the
  author-scoping in the server action never applied to them.
- Deletion stays author-only. An Admin who spots a stale note in someone
  else's log cannot remove it from the app; closing it out still goes through
  `feedback:resolve`, which changes status rather than deleting the row.
