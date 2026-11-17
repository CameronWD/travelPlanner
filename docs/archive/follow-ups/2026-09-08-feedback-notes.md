# Follow-ups from the Feedback notes build

Findings surfaced during the `feat/feedback-notes` build. Each was reviewed, judged
real, and explicitly triaged **ships-as-follow-up** by the final whole-branch review —
recorded here so they are not lost when the build's scratch workspace is deleted.
The build itself is described by ADR 0040 (capture + export) and ADR 0041 (offline
queue).

## Operational — do this before or with the first deploy

- **The `FeedbackNote` migration has not yet run against production — but the deploy
  applies it.** The final review read `package.json`'s bare `next build` and concluded
  nothing would apply `prisma/migrations/20260908000000_add_feedback_notes`; that was
  wrong. `vercel.json` overrides the build command with
  `prisma migrate deploy && next build` (see `docs/DEPLOY.md` §3), so shipping creates
  the table. No manual step is needed. The migration is purely additive — a single
  `CREATE TABLE` — so §4b's destructive-migration rehearsal does not apply and there is
  no window where live reads break. Until the deploy happens, every send fails with
  Prisma `P2021`, the Feedback panel reports "saved and will retry", and the offline
  queue fills until `MAX_QUEUED` starts evicting.
- **Neither script's happy path has ever run.** `feedback:pull` and `feedback:resolve`
  were verified as far as their argument and failure paths; the table did not exist in
  production and this sandbox has no local Postgres. First real run wants a human
  watching. `feedback:resolve --dry-run` in particular is correct by inspection only.

## Worth doing soon

- **`listFeedbackNotes` returns trip names across the trip-access boundary**
  (`server/actions/feedback.ts:110-121`). Every signed-in user sees every note's
  `tripName` and its `route` (which carries the tripId), including Trips they are not
  a member of — while `lib/guards.ts:22-27` states the opposite convention for the
  rest of the app. The shared log is deliberate (ADR 0040); leaking non-member trip
  names through it was never decided. Harmless at two Travellers, wrong at three.
  Decide it explicitly and record the answer in ADR 0040 either way.
- **`authorId` is returned to the client purely to gate the delete control**
  (same file). The server could compute a `canDelete` boolean instead and stop
  shipping other users' ids to the browser.
- **A Feedback note does not survive its author.** `FeedbackNote.authorId` is an FK
  with `onDelete: Cascade`, so deleting a User deletes their backlog. ADR 0040 goes
  out of its way to explain why `tripId` is *not* an FK for exactly this reason and is
  silent on the author. Probably wants the same treatment — snapshot the name, drop
  the cascade.

## Small, cheap, not urgent

- `scripts/feedback-resolve.ts:70` — the `Database:` echo prints *after* the
  `findUnique`, so a mistyped id exits without ever telling the operator which
  database was consulted. Move the echo above the lookup.
- `lib/feedback-queue.ts:134-136` — if `removeFromQueue`'s write fails (quota, private
  mode), a permanently-rejected note lands in `discarded` while still persisted, so
  the "discarded" toast repeats on every later flush.
- `components/feedback/feedback-launcher.tsx:158-164` — the discarded-note toast shows
  the first 120 characters of the body and nothing else; the text is otherwise
  unrecoverable. Restoring it into an empty write box would be strictly kinder.
- `components/feedback/feedback-launcher.tsx:339` — the near-limit character counter is
  a conditionally-mounted `role="status"` live region, so its first appearance likely
  goes unannounced. `components/trip/journal-editor.tsx` renders its counter
  unconditionally; match that.
- `docs/HANDOFF.md:361` — "`--dry-run` looks the note up" uses a bare "note" for the
  entity. Anaphoric and clear in context, but one word short of the terminology
  contract in `CONTEXT.md`.
- No test covers the in-app delete path or the DONE / WONTFIX de-emphasis in the
  panel; both are covered at the server-action layer, neither in the UI.
- The row → `InboxNote` mapping in `scripts/feedback-pull.ts` is inline and untested.
  Extracting it to `lib/` would make it exercisable without a database — worth little
  on its own (it is a field-for-field copy), but it is the only untested logic in a
  script whose happy path cannot be run locally.

## Deliberately settled — do not re-litigate

- **`MAX_QUEUED = 50` drops the oldest unsent note.** Bounded is correct: unbounded
  growth causes the very quota failure the module guards against, and 50 is generous
  for two Travellers.
- **`feedbackStatusSchema` and `CreateFeedbackNoteOutput` are unused.** They match the
  per-module export convention used by every other entry in `lib/enums.ts` and
  `lib/validations/`.
- **Commit `3fbb521`'s subject line says "note" where it means a Feedback note.**
  Real, and not worth rewriting history for.
