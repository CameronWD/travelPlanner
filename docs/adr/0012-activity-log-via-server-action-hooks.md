# An Activity event log, recorded by hooks in the mutating server actions

## Context

A Trip is shared between two Travellers who plan asynchronously. Until now there
was no way to see *what your partner changed* since you last looked — you'd
re-scan the itinerary and hope to notice. We want a per-Trip **Activity feed**
(chronological history) and a per-user unread **notifications** bell.

That requires capturing an event whenever a Traveller meaningfully changes the
Trip. The mutations all flow through ~7 server-action files (`stops`, `items`,
`transport`, `accommodation`, `chapters`, `costs`, `notes`), each with
create/update/delete functions guarded by `requireTripAccess` /
`require<Entity>Access`. There is no existing event/audit concept.

Decisions we had to make, each with real alternatives:

- **What detail an edit carries** — a coarse "updated X" vs field-level
  `from → to` diffs. We chose **field-level** (more useful for "what changed"),
  accepting the cost of computing diffs.
- **How unread is tracked** — per-item read rows vs a single per-user
  last-read marker. We chose the **marker** (cheap; "mark all read").
- **Delivery** — in-app only vs also web push. We chose **in-app only** for v1;
  push stays reserved for time-sensitive Reminders.

## Decision

1. **A single `Activity` model** records every event: `tripId`, `actorId`,
   `verb` (CREATED·UPDATED·DELETED·NOTED), `entityType`
   (STOP·ITEM·TRANSPORT·ACCOMMODATION·CHAPTER·COST·NOTE), `entityId?`, a
   snapshotted `entityLabel` (so a deleted thing still renders), `changes` (JSON
   field-diffs for updates), and `createdAt`. It is a derived log, not a source
   of truth — losing it loses history, nothing else.

2. **Recording happens via a `recordActivity()` hook** called by each mutating
   action after its write succeeds. The helper resolves the actor itself
   (`requireUser()`), and is **best-effort**: a recording failure is swallowed so
   it can never break the user's actual mutation.

3. **Field-level diffs come from a pure `describeChanges(entityType, before,
   after)`** in `lib/activity.ts`. Because the access guards only return
   `{id, tripId}`, each update action loads the **full before-row** before
   writing so the diff can be computed. (Pure + unit-tested; no Prisma/React.)

3b. **The `changes` payload is a tagged union:** `ActivityChange[]` (field
   diffs, the common case), `{ excerpt }` (Notes), or `{ summary }` — a single
   human-readable predicate for structureless or batch actions (reorder,
   ungrouped firm-up, bulk chapter-create) that have no meaningful per-field
   diff. The feed renders a `summary` row as "{actor} {summary}", bypassing the
   generic headline. No new verbs or entity types are introduced.

4. **Unread is a per-`TripMember` `lastReadActivityAt` marker.** Unread *for you*
   = activities in the Trip with `createdAt > lastReadActivityAt` **and**
   `actorId != you` (your own actions never notify you, though they do appear in
   the shared feed). "Mark all read" sets the marker to now.

5. **Two surfaces, in-app only:** a header **bell** with an unread badge + a
   recent-items panel, and a full **Activity page** under the More menu. The
   trips list shows a per-Trip unread dot. No push for activity in v1.

6. **Scope covers the plain create/update/delete of the six entities + Note
   add/delete, plus the specialized mutations** (item scheduling —
   `scheduleItem`/`unscheduleItem`/`rescheduleItem`; stop dating —
   `setStopDates`/`makeStopRough`; `toggleStopPin`; `assignStopToChapter`;
   `firmUpSegment`; `moveStop`; `suggestChaptersFromCountries`). Each records
   one event per user action — never one-per-affected-row. `setStopDates`
   records only the stop the user edited, not the stops its ripple moved.

## Consequences

- **Every mutating action gains a `recordActivity` call**, and every update
  action gains a before-row load. A future reader will see these everywhere —
  this ADR is why. The pattern is uniform and best-effort.
- **A migration is required** (the `Activity` table + the `TripMember` column).
- **Field-level diffs cost a read + per-field formatting** for each entity type;
  that formatting lives in one pure module and is the main place to extend when
  fields change.
- **The marker model can't express per-item read** (mark-one-read). That's an
  accepted v1 simplification; moving to per-item read later means adding a
  read-join table, not changing the event log.
- **In-app only** means a Traveller only learns of changes when they next open
  the app. Adding push later is additive (the events already exist).
- **Specialized actions are now recorded** (see Decision §6). The structureless
  ones use the `{ summary }` payload; the rest reuse field diffs. `firmUpSegment`
  on a chapter records a single CHAPTER update (its start/end dates); an
  ungrouped firm-up records one STOP `{ summary }`. This supersedes the original
  v1 deferral.
