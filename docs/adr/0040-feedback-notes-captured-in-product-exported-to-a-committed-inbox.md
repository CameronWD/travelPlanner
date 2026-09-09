# 0040 — Feedback notes are captured in-product and exported to a committed inbox

## Status
Accepted (2026-09-08)

## Context
Feedback on TEEPEE itself was being carried in the owner's head from the phone
back to a Claude session and retyped, so most of it was simply lost. The
capture has to happen at the moment of annoyance, from wherever the Traveller
is in the app, and the result has to be sitting in front of an agent at the
start of the next working session without anyone remembering to mention it.

TEEPEE is used almost entirely as the deployed Vercel app, so anything written
to the serverless filesystem is discarded — the capture side has to be
Postgres. But a working session wants a document it can read, diff and review,
not a table it has to query.

## Decision
Both, with a one-way flow between them:

- **Postgres is the truth.** A `FeedbackNote` row holds the body plus the
  circumstances the app records for itself — route, page label, trip id and
  trip *name* snapshotted as plain strings (no FK, so deleting a Trip never
  deletes feedback about it), author, timestamp, viewport, user-agent — and a
  status of Open / Done / Won't fix. Status changes when the work lands, via
  `npm run feedback:resolve`, not by the author tidying up in the app.
- **`docs/feedback/inbox.md` is its printout.** `npm run feedback:pull` reads
  prod read-only and rewrites the file: Open notes first, grouped by area,
  Resolved beneath as history. Generated, never hand-edited — an edit there is
  overwritten by the next pull.
- `CLAUDE.md` makes the pull part of session start, and the refreshed file is
  committed on the working branch, so the backlog's movement is visible in git
  history.

A **Feedback note** is deliberately inert product data: it belongs to no Trip
and no Plan, appears in no planning view, raises no **Flag**, and is absent
from the **Activity** feed. Nothing in the app reads it. It exists to be
carried out of the app.

## Considered Options
- **The button opens a GitHub issue server-side.** Rejected: it puts a write
  token in the app for an audience of two, makes every offhand "this is
  fiddly" a public artefact, and still leaves the session reading an external
  tracker rather than the repo.
- **Keep hand-writing a doc like `docs/things-to-fix.md`.** Rejected: that is
  exactly the friction being removed — it requires a laptop and a moment of
  intent, and the annoyance is felt on a phone mid-planning.
- **Database only, no exported document.** Rejected: the backlog would have no
  history, no diff, and nothing readable on GitHub.

## Consequences
- The product database carries rows no product feature reads. This is intended;
  the alternative was a second datastore for two users' remarks.
- `feedback:pull` needs prod credentials locally (`.env.production.local`) and
  reads prod directly. It is read-only by construction; `feedback:resolve` is
  the only script that writes, and only to status fields.
- `inbox.md` produces a diff in most sessions. Accepted deliberately in
  exchange for the history.
- Feedback survives the Trip it was written about, by design — the snapshotted
  trip name is the only trace, and drill-through to a deleted Trip is not kept.
