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

> **Filing note (2026-09-22).** This amendment was written to a *second* file,
> `0040-feedback-notes-are-captured-in-product-and-exported-to-a-committed-inbox.md`
> (commit `c056c0b`), which carried no title and no Status — so `docs/adr/`
> held two `0040`s, one of them headerless. Folded back in here and the stray
> file removed. An amendment belongs in the ADR it amends; a new file with a
> colliding number is invisible to anyone reading the numbered sequence.

---

## Amendment — 2026-09-22: a note is resolved at deploy; the branch records which notes it will close

The original decision left one seam unstated: *when* a note is resolved, and
where the record of "this branch fixes that note" lives while the work is in
progress.

In practice it went like this. A branch fixed Xanthia's attachment note, was
merged, was deployed, and only then could the note be closed — because
`feedback:resolve` writes to **production**, and `inbox.md` is a printout of
production. So the inbox commit landed on `main` after the fact, detached from
the twenty-five commits that earned it, and for the length of the branch
`main` carried a printout showing the note still open. The link between the
work and the note existed only in the operator's head.

Two ways of closing that gap were considered and rejected.

**Resolve at merge rather than at deploy.** Rejected. Production would report
**Done** for work no Traveller can reach. In this repo the window is minutes —
`vercel.json` deploys on push — but the failure mode is silent and permanent
rather than merely brief: a resolved note leaves the *Open* list, and a branch
that is abandoned or reverted therefore buries a real request somewhere nobody
looks again. The whole point of the inbox is that nothing said in the app gets
lost; a status that can run ahead of reality reintroduces exactly that.

**Hand-edit `inbox.md` on the branch so it ships with the feature.** Rejected
outright, and worth stating so nobody tries it: the file is generated and the
database is the truth (above). A committed printout cannot be made true earlier
than the thing it prints.

### Decision

1. **Resolution stays at deploy.** "The work has actually landed" means a
   Traveller can use it, not that it is merged. `feedback:resolve` is run after
   a successful production deploy, never before.

2. **The branch records the link, in a commit trailer.** The commit that fixes
   a Feedback note carries:

   ```
   Resolves-Feedback: <id>
   ```

   This is the part that belongs on the branch and can honestly live there: it
   is a statement of intent about this repo, not a claim about production. It
   is written while the work is fresh, it is reviewable in the diff, and it
   survives in `git log` whether or not the branch ever ships.

3. **The inbox refresh follows the deploy, on `main`.** That commit is now
   mechanical rather than remembered: read the `Resolves-Feedback:` trailers on
   `main` since the last deploy, resolve each id, re-run `feedback:pull`,
   commit the regenerated file.

### Consequences

- `main` still carries a briefly-stale inbox between merge and deploy. That is
  accepted, and is the honest state: the note *is* still open until the fix is
  reachable.
- The "which notes does this branch close?" question is answerable from
  `git log` alone, by anyone, without the operator's memory — which is the part
  that was actually missing.
- A trailer is a promise, not a status. A branch carrying
  `Resolves-Feedback:` that never deploys leaves the note correctly **Open**,
  which is the desired failure direction.
- Two further steps are deliberately **not** taken yet, and are recorded here
  so they are chosen rather than drifted into: extending `feedback:resolve`
  with a `--from-commits <range>` flag to read trailers directly, and running
  that automatically in CI after a successful production deploy. Both are
  worth doing only if the manual step proves forgettable in practice; neither
  changes this decision, they only automate step 3.

## Amendment — 2026-09-26: a note records the site it was written on

The beta preview and the live site share one production database. A note
written on beta — often about something only beta has — landed in the same
table and the same inbox as notes about the live site, with nothing to tell
them apart, so the operator could not tell "this is broken on beta" from
"this is broken for everyone".

### Decision

1. **Every note records its site**, set by the server from Vercel's own
   deployment variables and never sent by the browser: `main` for a production
   deploy (`VERCEL_ENV=production`), the branch name for a preview
   (`VERCEL_GIT_COMMIT_REF`, so `beta` for the beta preview), `local` for
   `next dev`. Notes written before this amendment have no site and count as
   `main`; they are not backfilled.
2. **The inbox splits Open notes by site** (Beta, Main, any other preview by
   name), each grouped by area as before; Resolved history keeps one list with
   a site label per note.
3. **The Feedback panel still shows all of a viewer's notes** on either site
   (it is their log, and a note must not seem to vanish), with a site chip on
   any note written on a different site from the one being viewed.
4. **"Landed means deployed" is per site.** A beta note is resolved once the
   fix is live on beta; a main note once it is live on main. The
   `Resolves-Feedback:` trailer is unchanged; after a confirmed deploy the
   operator resolves the trailers on *that site's branch* since its last
   deploy. `feedback:resolve` prints each note's site and warns (without
   blocking) when a note's site doesn't match the site being resolved for.

### Why a column, not a label prefix

Prefixing the page label ("beta · Plan editor") would have shipped on beta
alone with no migration, but it corrupts a field this ADR defines as a plain
record of where the author was, and every reader would have to strip it. The
cost of the column is sequencing: migrations run only on production deploys
(`vercel.json`), so the column ships to `main` first and reaches beta by
merging `main` into `beta`.
