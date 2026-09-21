# Open follow-ups

The single live backlog of engineering work TEEPEE still owes. Compiled
**2026-09-20** on branch `chore/follow-ups-triage-and-sweep` from the seven
follow-up documents in `docs/follow-ups/` plus the operational debt
`docs/things-to-fix.md` still had outstanding. **Drained 2026-09-21** on the
same branch: 39 of the 42 then-open items were fixed and struck, and 3 new ones
found while fixing them were added. **Reviewed 2026-09-21**, same branch: a
final whole-branch review found six struck entries that overclaimed or
undercounted what their fix achieved and corrected each in place — two whose
fixed behaviour was not actually the shipped behaviour (`FP-06`, `HG-02`/
`HG-10`), three whose fix covered a narrower scope than the pattern it named
(`AB-04`, `CD-05`, `CD-01`), and one (`CD-10`) whose own scope-correction was
itself wrong — and added two new items (`SW-04`, `SW-05`). **Decided
2026-09-21** on branch `chore/close-sw03-and-sw05`: the operator resolved
`SW-05` — `inviteToTrip` becomes owner-or-admin; `createShareLink` and
`createCalendarFeed` stay member-accessible (see ADR 0052) — moving it from
*Needs a decision* to *Open items*, now specified and ready to build.

**Closed out 2026-09-21** on branch `chore/close-the-open-backlog`. The
operator decided the remaining five deferred questions (ADRs 0053, 0054, 0055
and the 2026-09-21 amendment to ADR 0040), and all five were **built the same
day** rather than merely specified. Every item that stood in *Open items* was
then struck, settled, or split between the two: `SW-05`, `SW-01`, `SW-04`,
`FN-05`, `CD-16` and the confusable half of `SW-02` were fixed and struck;
`FP-07` and the `SW-02` remainder were **declined** and moved to *Settled*;
`SW-03` was found already fixed on the previous branch (`06f25a3`) and struck.
One new item was found and closed the same day (`CB-01`, the
`expectAccessCheckedBeforeWrite` rollout). ***Open items* is now empty, and
*Needs a decision* is now empty.** What is left owing is in *Blocked* — 12
items that need a human with a running app, a real device, a calendar client,
or a browser — plus **two written-but-unapplied migrations** (see *Migration
state* below), which are the operator's call to run.

**Read this instead of the seven source docs.** Those docs accumulated from
2026-08-12 onward with no drain mechanism: later branches fixed items
incidentally and nobody struck them off, so by 2026-09-20 they no longer said
what was actually open. This file does. It is the only one of the two that gets
updated as work lands.

**The source docs are immutable history and are never edited.** They record
*why* each item was deferred, which a compile cannot carry. Every entry below
cites the doc it came from — follow the citation backward when you need the
original reasoning. `docs/things-to-fix.md` also stays exactly where it is: it
is the 2026-08-14 audit's own record, and this file is its successor in form,
not its replacement.

## Trust statement — how much of this you can believe

At the 2026-09-20 compile, eight agents re-verified all **127 items** then known
against `main`, each against the source doc it owned. A ninth agent, which had
performed none of that work, independently re-derived every `DONE` verdict from
the code or the cited commit rather than trusting the evidence string. (The
total is 134 today; seven have been added since: `SW-01`–`SW-03`, found by the
2026-09-21 sweep, `SW-04`–`SW-05`, found by the final whole-branch review that
corrected this document, `CB-01`, found and closed on the 2026-09-21 close-out
branch, and one extra entry created by **splitting `SW-02` in two** — its
confusable instance was struck, its remainder settled. All were evidenced
against the code at the time they were written.)

| Verdict | Count | Where it lives in this doc |
|---|---|---|
| Already fixed — struck | 96 | *Struck* register (no action) |
| Live — still open | 0 | *Open items* (empty) |
| Needs a decision | 0 | *Needs a decision* (empty) |
| Blocked on a deploy, device, or browser | 12 | *Blocked* |
| Settled — declined deliberately | 26 | *Settled — do not re-raise* |
| **Total** | **134** | |

**How 132 became 134:** `SW-02` split into two entries (one struck, one
settled) and `CB-01` was added and closed. **How 83 struck became 96:** the
twelve entries closed out on 2026-09-21 (`SW-05`, `SW-01`, `SW-04`, `FN-05`,
`CD-16`, `SW-02`'s confusable instance, `SW-03`, and the five decided-and-built
`CD-02`, `CD-03`, `CD-04`, `CD-06`, `CD-07`) plus `CB-01`. **How 24 settled
became 26:** `FP-07` and the `SW-02` remainder. *Blocked* is unchanged at 12
and **nothing in it was verified on 2026-09-21.**

**Two migrations are written but NOT applied.**
`20260921000000_cron_heartbeat_last_success` (adds a nullable `lastSuccessAt`
to `CronHeartbeat` and backfills it from `lastRunAt`) and
`20260921010000_feedback_author_snapshot` (adds a nullable `authorName` to
`FeedbackNote`, backfills it from `User`, then drops the author FK) exist as
files only. Both are additive on reads **and** on writes per `docs/DEPLOY.md`
§4b — the new columns are nullable, so a still-running old build cannot violate
a NOT NULL constraint, and dropping a foreign key removes a restriction rather
than adding one. **Running them is the operator's call**; nothing in this
document should be read as claiming they have run.

**Updated 2026-09-21.** The sweep on branch `chore/follow-ups-triage-and-sweep`
closed **39** of the 42 items that were open on 2026-09-20 and moved them to the
*Struck* register. Of the three that remained, one (`FP-07`) was **parked on an
operator decision** and two (`FN-05`, `CD-16`) were **never planned**, each
blocked by something the sweep was not allowed to do. All three were closed out
on 2026-09-21 — `FP-07` declined, the other two built. The sweep also **found three new items** (`SW-01`, `SW-02`,
`SW-03`) that appear in no source doc, which is why the total grew from 127 to
130.

**Reviewed again, same date.** A final whole-branch review re-checked the
sweep's own claims — both the 39 it struck and the 3 it added — against the
code, corrected six struck entries whose annotation overclaimed or
undercounted what actually shipped, corrected one open item (`SW-02`) whose
population was wrong, and added two further items (`SW-04`, `SW-05`), which is
why the total went to 132.

**Decided 2026-09-21**, branch `chore/close-sw03-and-sw05`: the operator
resolved `SW-05` (ADR 0052). `inviteToTrip` becomes owner-or-admin;
`createShareLink` and `createCalendarFeed` deliberately stay open to any
member — the asymmetry is that an Invite grants unbounded, transitive
membership while a Share link is bounded by ADR 0051's never-shared floor and
a Calendar feed exposes only schedule. `SW-05` moves from *Needs a decision*
to *Open items*, specified and ready to build; the total stayed **132**. The
same branch also fixed `SW-03` (`06f25a3`) by scoping `CLAUDE.md`'s
session-start instructions to the main session — **but did not strike it
here**, so `SW-03` sat in *Open items* already fixed until the close-out found
it. It is struck now, against that commit.

**Closed out 2026-09-21**, branch `chore/close-the-open-backlog`. The five
*Needs a decision* items were decided by the operator and built the same day,
so each moved straight to *Struck*: `CD-02` (ADR 0053), `CD-04` (ADR 0054),
`CD-03` (ADR 0055), `CD-06` and `CD-07`. **Three of the five shipped as an
option their own entry did not list** — see each entry's *What actually
shipped* note in the struck register, and the fourth process lesson below.
Every remaining open item was then struck or settled, one new item (`CB-01`)
was found and closed, and `SW-02` was split in two. Total **134**.

> ### ⚠ What this document is reliable about, and what it is not
>
> **The 2026-09-20 triage verified, for every item, *whether* it was still
> live. It did not re-derive each item's true blast radius.** Each entry's
> evidence and `file:line` citations were inherited from its source doc and
> confirmed to still show the defect — but nobody re-searched the tree for
> *other* sites with the same defect.
>
> The sweep proved this matters. **Two of the 39 items it closed turned out to
> touch more of the codebase than their entry said**, and each was discovered
> only by the agent that sat down to fix it:
>
> | Item | Entry said | Actually |
> |---|---|---|
> | `AB-02` | two pages | **three** — the Wishlist page had it too |
> | `HG-02` / `HG-10` | two cards | **three** — `accommodation-card.tsx` too |
>
> A third item, `CD-10`, briefly claimed an undercount here too ("one
> `console.error` site, actually two"), but that claim was itself wrong — its
> Evidence section named both sites from the start — and was corrected on final
> review. See `CD-10`'s entry in the struck register for the correction.
>
> Two undercounts in 39 items is not a rounding error, and there is no reason
> to think the remaining entries were sampled differently.
>
> **A scope line can also be wrong the other way — it can claim a gap that is
> already closed.** The 2026-09-21 close-out went to add
> `expectAccessCheckedBeforeWrite` to the seven `FOR UPDATE` write-path entry
> points a review had listed, and found `reorderTransports` **already covered**
> by `server/actions/transport.test.ts:1319`, in a test that predates all of
> this work. Six sites needed the assertion, not seven (`898f1b0`, `CB-01`).
> Re-derive before you build, in both directions.
>
> **And trust an entry's *reasoning* no further than its scope line.** Two
> claims recorded in this document were disproved on 2026-09-21 — not by
> re-reading them, but by mutation-testing what they asserted:
>
> | Recorded claim | What testing showed |
> |---|---|
> | The `FOR UPDATE` entry points' skip-justification "is correct, but never written down" (a deferred minor) | **False.** `lockPlanStopsTx` is pure ADR 0007 deadlock avoidance with no access-control meaning; every caller checks access before opening its transaction; and moving `moveStop`'s check after its write proved `expectAccessCheckedBeforeWrite` *does* catch it there. The rollout was simply incomplete. |
> | `lib/cron-health.test.ts:54`'s `Math.max(0, …)` guard needs a test pinning it (a deferred minor) | **No such test is possible.** The guard is unreachable dead code: a negative diff never satisfies `hours >= 1` whether clamped or not, verified by sweeping `diff` from −100h to +100h guarded vs unguarded with zero output mismatches. |
>
> Both were corrected in place rather than struck, so no reader inherits the
> false claim. See *Deferred minors* below.
>
> **So: trust an entry's verdict, do not trust its scope line.** When you pick
> up an item, re-derive the blast radius yourself before you plan the fix —
> grep the tree for the pattern rather than fixing only the `file:line`s listed.
> Widen the task when you find more, as the sweep did, instead of shipping a
> partial fix against a stale count.
>
> **This applies to struck entries too, not only open ones.** A `DONE` verdict
> means the cited defect was fixed at the cited site — it does not mean every
> site with that defect was found. A final review of this document found two
> struck entries that overclaimed in exactly this way: `FP-06` (the fix built
> an escape hatch that no production caller ends up using, so the described
> behaviour is unchanged) and `HG-02`/`HG-10` (a fourth confusable instance,
> `phase-travelling.tsx:508`, survived the "three cards" fix — it was closed
> later, on 2026-09-21, as `SW-02`'s confusable instance, `7fcef35`). Before
> trusting a struck entry's title as a completed fact, check whether its
> annotations say otherwise.

Of the 44 `DONE` calls made in the original 2026-09-20 triage: **40 were
independently re-verified and 0 were flipped.** The remaining 4 (`OPS-01`, `OPS-03`, `OPS-06`, `OPS-07`) rest on a
read-only production query the auditor could not repeat, because connecting to
a database is forbidden in this workflow. They were not flipped merely for being
unrepeatable, and each is annotated as such where it appears. Repo-side
corroboration was done for three of the four and is consistent with the claim;
`OPS-03` is a pure data question with no repo-side corroboration possible at
all.

One bookkeeping correction was made during the audit (a header count in one
scratch report was one short of its own entries); no item's verdict changed.

## How to work on an item (read this first, agent)

1. **Read `CONTEXT.md` before touching anything.** It is the vocabulary
   contract. Never introduce a term its *Avoid* lists forbid. Note especially:
   **Activity** means the change-log feed, never a planned thing to do; the
   trip-scoped idea pool is the **Wishlist**.
2. **Branch per fix** (`fix/<slug>`), never commit to `main`, never deploy.
   Merging and deploying are the owner's call, always.
3. **Every fix lands with a test that fails before and passes after.** The
   suite mocks `@/lib/db` (no real DB); logic-level tests are the norm.
   Timezone-sensitive tests must pin `TZ`.
4. **This sandbox has no Postgres, and connecting to the production database is
   forbidden.** Anything in the *Blocked* section needs a human with a running
   app, a real device, or a browser. Do not claim those verified.
5. **Re-run the baseline** (`npx vitest run`, `npx tsc --noEmit`,
   `npm run lint`) before reporting done.
6. **Strike an item here when the fix lands** — note the commit and move the
   entry to the *Struck* register. That is the drain mechanism whose absence
   created this compile.
7. **Read the *Settled* section before proposing anything.** Several entries
   there are instructions *not* to make a change that looks like an improvement.

### Five process lessons, carried forward

The first two come from
`docs/follow-ups/2026-09-20-changeover-day-and-digest-follow-ups.md` (items
`CD-17` and `CD-18` in the triage); the third was learned the hard way during
the 2026-09-21 sweep, and the fourth and fifth during the 2026-09-21
close-out. None is a backlog item — they are plan-authoring guidance, and they
belong in the next plan you write, not in the list below.

- **A parameter can be born dead across task boundaries.** A plan once
  specified `timezone` on a server action and on the `POST` schema it backs, but
  never told the service-worker task to actually send it — so every task passed
  its own review and the value was silently unfed end to end. No single task's
  scope could have caught it. When a plan threads a value through several tasks,
  add an explicit **"who feeds this?"** check naming the task that supplies it.
- **A later phase can re-arm an earlier phase's bug.** Phase B stamped a column
  and shipped, reviewed, before Phase C existed to read that column — so the
  interaction between the two phases on one shared column was never reviewed
  together. When two phases in one plan touch the same column or field, say so
  in the plan, so the second phase's reviewer is told to look for interaction
  bugs, not just regressions in its own code.
- **`npm test` and `npm run lint` do not typecheck — make `npx tsc --noEmit` a
  per-task gate.** The 2026-09-21 sweep's Global Constraints mandated test+lint
  after every task and deferred `npm run build` to the final task. Task 19
  (`6eb8fba`) introduced two `TS2741` errors in `item-card.test.tsx` (a required
  prop left off two renders). Vitest does not typecheck, ESLint does not
  typecheck, and the task's own review ran neither — so the branch carried a
  red typecheck through **four subsequent tasks** before anyone ran a build.
  A plan that defers `npm run build` to the end must still make
  `npx tsc --noEmit` part of every task's gate, not just the last one.
- **A "there is no third option" note in a backlog entry is a claim, not a
  finding.** Three of the five decisions closed on 2026-09-21 (`CD-02`,
  `CD-03`, `CD-04`) shipped as an option their own entry did not list. One of
  those entries said so in as many words — `CD-02`'s "Why no third option"
  paragraph — and the other two simply posed a binary and left it at that,
  which had the same effect on anyone reading for work. Each third option came
  from re-deriving the problem against the code the entry cited rather than
  accepting the entry's framing: `CD-04`'s cooldown, for instance, exists only
  because `DigestDispatch` already carried a `createdAt` nobody had noticed was
  an answer. When an entry poses a binary, re-derive it before choosing a side.
  **The same suspicion belongs on an entry's supporting reasoning, not only on
  its option list.** Two claims this document recorded as settled fact — that
  the `FOR UPDATE` entry points had a correct skip-justification, and that
  `formatLastRun`'s `Math.max(0, …)` guard was pinnable by a test — were both
  disproved on the same day, and in both cases by *mutating the code and
  running the suite*, not by re-reading the prose. Reading an entry again only
  tells you what it says. A backlog entry's verdict has always been the part
  you could trust; after today, its reasoning is not.
- **`npx tsc --noEmit` is not sufficient either — `next build` is the only gate
  that enforces the `"use server"` async-export rule.** The close-out exported
  a pure mapper (`toView`) from `server/actions/feedback.ts` so a test could
  call it. Next requires every *value* export from a `"use server"` module to
  be an async function, and nothing else models that directive: `tsc` does not,
  vitest imports the module directly, ESLint has no rule for it. The branch
  carried an unbuildable tree through **thirteen tasks and a final review**
  before a build was run. The third lesson above makes `npx tsc --noEmit` a
  per-task gate; that is necessary and not enough. A plan that defers
  `next build` must say which tasks touch a `"use server"` or client/server
  boundary and gate *those* on a build, not only the last task.

### Deferred minors from the 2026-09-21 sweep — all four now resolved

Found by task reviews, judged too small to hold a task open, recorded here so
they were not lost. None was a defect in shipped behaviour; all four were
test-or-comment honesty. **All four were addressed on 2026-09-21** —
`c44705e` for the first three, `898f1b0` for the fourth — and two of them
turned out to rest on a false premise. They are kept below with their outcomes
rather than deleted, because the premise corrections are the point.

- **`server/actions/forks.test.ts:588`** asserted
  `expect(currentTripTimezoneMock).toHaveBeenCalled()` rather than
  `toHaveBeenCalledWith(stops)` — so the query wiring `AB-03` exists to fix was
  not actually pinned, and the `promoteFork` block around `:1391` made no
  `currentTripTimezone` assertion at all.
  **Done (`c44705e`):** both now assert `toHaveBeenCalledWith([])`, the value
  each test's own fixtures actually supply.
- **`lib/cron-health.test.ts:54`** — the comment named `Math.max(0, …)`'s
  ran-backwards-clock guard, but every fixture in the file was at or before
  `now`, so only the `diff === 0` case was exercised. The ask was to add a
  future-`lastRunAt` case that pins the guard, or reword the comment.
  **Premise corrected (`c44705e`): the guard cannot be pinned, because it is
  unreachable dead code.** `formatLastRun`'s only branch that reads `hours` is
  `hours >= 1`, and for any future `lastRunAt` `hours` is `Math.floor` of a
  non-positive number — so it can never reach that branch whether or not it
  was clamped to `0` first. Removing the clamp and sweeping `diff` from −100h
  to +100h produced **zero** output mismatches against the guarded version. A
  future-`lastRunAt` case was added that states honestly what it *does* pin: a
  skewed or future clock still reads "just now" rather than negative hours,
  and it passes with or without the clamp. **The guard itself was left in
  place** — harmless defensive code, not worth a commit to remove. Do not file
  "add a test for the `Math.max` guard" again; there is no such test.
- **`app/globals.css:236-238`** — the comment said `tp-fade-in` stays at 150ms
  "for dialogs and popovers". Only `components/ui/dialog.tsx:21` uses it;
  popovers never did (they use `tp-pop-in`/`tp-pop-out`).
  **Done (`c44705e`):** the comment now says "for dialogs" only, confirmed by
  grep across `popover.tsx`, `dropdown-menu.tsx` and `select.tsx`.
- **~~Sweep task 10's skip-justification for the `FOR UPDATE` entry points is
  correct, but was never written down.~~ That claim was FALSE, and is
  corrected here rather than struck so no reader inherits it.** There was no
  correct justification to write down. `lockPlanStopsTx`'s doc comment
  (`server/actions/stop-flow.ts`) claims only ADR 0007 deadlock avoidance and
  makes no access-control claim; **every** caller runs its own
  `requireTripAccess`/`requireStopAccess` *before* opening the transaction that
  takes the lock; and a mutation test — moving `moveStop`'s access check to
  after its write — made `expectAccessCheckedBeforeWrite` fail exactly as it
  should ("expected the access guard to run before the write, but it ran
  after"). So the helper **does** apply to these entry points; the rollout was
  simply incomplete. **Resolved as `CB-01` (`898f1b0`)**: all seven locked
  write-path call sites now carry the assertion (one of them already did), and
  `lockPlanStopsTx`'s doc comment now records that there is no exemption. See
  `CB-01` in the struck register.

### Deferred minors from the 2026-09-21 close-out — open

Same status as the four above when they were first written: found by task
reviews on `chore/close-the-open-backlog`, too small to hold a task open, not
defects in shipped behaviour. **These are recorded from that branch's own SDD
ledger (`.superpowers/sdd/2026-09-21-close-the-open-backlog/progress.md`) and
have not been independently re-derived here** — treat each as a lead to check,
not as a verified finding. Fold them into whatever next touches the file.

- **`server/actions/invites.test.ts`** — the admin-bypass test asserts only
  `success === true`, not the created Invite's shape.
- **`components/account/push-subscribe.ts`** — the client-side conflict retry
  that ADR 0053 depends on has no automated coverage; no test file exists for
  that module. This is the half of `CD-02`'s fix a future refactor breaks
  silently.
- **`lib/digest-dispatch.test.ts`** — nothing asserts the cooldown
  `findFirst`'s `where` **shape**, i.e. that it is keyed on `slot` *without*
  `localDate`, which is the whole point of ADR 0054. Correctness currently
  rests on reading the implementation.
- **The cooldown `findFirst` has no covering index** (the existing unique
  constrains `localDate`, which this query does not use). Not functional at two
  Travellers' row counts; adding one needs a migration.
- **`CONTEXT.md` now hardcodes "two"** in the Digest prose, coupling the
  glossary to `DIGEST_MAX_CHECKLIST_LINES`.
- **ADR 0055's re-file also fires for Items dated *before* the Stop's arrive
  date** (`offset < 0`) — inside the letter of the ADR, outside its narrated
  case, and untested.
- **The "pass the re-dated Stop with its NEW dates" safety is not pinned** —
  the test passes with the `.map()` override deleted, because the tiebreak
  picks the other Stop either way.
- **Two extra queries per re-dated Stop**, and `self ? … : []` degrades
  silently to the old behaviour if the wiring is ever missing.
- **`setStopNights` has no `expectAccessCheckedBeforeWrite` assertion of its
  own** — it delegates to `applyStopDates` through the same guarded path as
  `setStopDates`, which is covered. Disclosed as a judgement call, not a gap.

### Priority key

**P0** — data loss, security/authorization, or the app is wrong in production ·
**P1** — a user-visible defect or a promised capability is missing ·
**P2** — internal correctness and coverage holes · **P3** — polish, comments,
naming, doc drift.

**Effort**: `S` (under ~20 lines) · `M` · `L` (wants its own plan).

### Source-doc shorthand

| Prefix | Source |
|---|---|
| `CP-` | `docs/follow-ups/2026-08-12-cost-paid-remodel.md` |
| `AB-` | `docs/follow-ups/2026-08-15-audit-backlog-build.md` |
| `FN-` | `docs/follow-ups/2026-09-08-feedback-notes.md` |
| `FP-` | `docs/follow-ups/2026-09-09-feedback-panel-chat-shape.md` |
| `HG-` | `docs/follow-ups/2026-09-15-help-guide-audit.md` |
| `RM-` | `docs/follow-ups/2026-09-17-reminders-follow-ups.md` |
| `CD-` | `docs/follow-ups/2026-09-20-changeover-day-and-digest-follow-ups.md` |
| `OPS-` | operational debt owed by `docs/things-to-fix.md` |
| `SW-` | **no source doc** — found during the 2026-09-21 sweep (`SW-01`–`SW-03`) or the final whole-branch review that corrected this document (`SW-04`–`SW-05`) |
| `CB-` | **no source doc** — found during the 2026-09-21 close-out on branch `chore/close-the-open-backlog` (`CB-01`) |

`SW-` and `CB-` are the two prefixes with nothing to follow the citation back
to. Those entries are self-contained: the evidence in them is all the evidence
there is.

---
# Open items

**0 items. This section is empty.** Everything that stood here was closed out
on 2026-09-21 on branch `chore/close-the-open-backlog` — struck, settled, or
split between the two. The trail:

| Was here | Where it went | Commit |
|---|---|---|
| `SW-05` | *Struck* — built | `a0eaa72` |
| `FN-05` | *Struck* — built (migration written, **not applied**) | `cf90b52` |
| `SW-01` | *Struck* — built | `b0b50a0`, `4b33884` |
| `FP-07` | *Settled* — **declined**, not deferred | — |
| `CD-16` | *Struck* — landed with `CD-07` | `ac44282` |
| `SW-02` (confusable instance) | *Struck* — built | `7fcef35` |
| `SW-02` (the decorative remainder) | *Settled* — **declined** | — |
| `SW-04` | *Struck* — built | `6480936` |
| `SW-03` | *Struck* — was already fixed on the previous branch | `06f25a3` |

**Do not read "empty" as "nothing is owed."** Twelve items sit in *Blocked*,
untouched, and two written migrations are unapplied — see the trust statement
above. What is empty is the set of things an agent in this sandbox can pick up
and build.

---


# Needs a decision — **do not implement these**

**0 items. This section is empty.** The five that stood here (`CD-02`,
`CD-03`, `CD-04`, `CD-06`, `CD-07`) were all decided by the operator on
2026-09-21 **and built the same day**, so each moved straight to the *Struck*
register rather than to *Open items*. A sixth, `SW-05`, was decided on
2026-09-21 on the previous branch and is likewise struck.

Where a decision produced an ADR, **the ADR is the durable record — this
section is not.** The table below covers the five that stood here plus two
decided the same day from elsewhere in this document (`SW-05` and `FN-05`,
both of which were in *Open items*, not here):

| Item | Decision | ADR |
|---|---|---|
| `SW-05` | Invite is owner-or-admin; Share link and Calendar feed stay member-accessible | 0052 |
| `CD-02` | A Device is never reassigned; the browser mints a new endpoint | 0053 |
| `CD-04` | One Digest per person per slot, enforced by an 18h cooldown rather than by the ledger key | 0054 |
| `CD-03` | A shortened Stop hands its Item to the Stop that still covers the day; the general case is **declined** | 0055 |
| `FN-05` | A Feedback note survives its author (2026-09-21 amendment) | 0040 |
| `CD-06` | A second timestamp, `lastSuccessAt`, distinguishes "ran" from "delivered" | — (entry option (b)) |
| `CD-07` | An honest `+N more` that counts Checklist lines dropped by the per-section cap | — (entry option (a)) |

**Three of the five shipped as an option their own entry did not list.** Each
struck entry says so in place. If this section refills, read the fourth process
lesson above before you pose the next binary.

---


# Blocked on a deploy, a device, or a browser

Nothing in this section can be closed from this sandbox. It is ordered as a
deploy would be run — **migration state first, then the verifications that a
running app makes possible.**

> **Mostly history — but no longer entirely.** Both migrations previously
> believed unrun are in fact applied in production, and that part is history.
> **Two new migrations were written on 2026-09-21 and are NOT applied**, so
> there *is* something pending on the database side of the next deploy again —
> see *Two migrations written on 2026-09-21* below. The rest is a short list of
> checks that need a person with a running app, a phone, a calendar client, or
> a browser. **Nothing in this section was verified on 2026-09-21**, and
> nothing here may be reported as such.

## Two migrations written on 2026-09-21 — applied in production 2026-09-21

**Both were applied to production on 2026-09-21 at 09:53 UTC** and this
section is kept as their record, not as work owing. Verified on 2026-09-21
against the production database by reading `information_schema` directly
rather than trusting the migration ledger: `CronHeartbeat.lastSuccessAt`
exists and is nullable, `FeedbackNote.authorName` exists and is nullable, and
`FeedbackNote_authorId_fkey` is gone. `prisma migrate status` reports "Database
schema is up to date" across all 28 migrations.

They were written on branch `chore/close-the-open-backlog` alongside the code
that reads their columns, and were **not** applied by the agent that wrote
them — that branch had no database access. The descriptions below stand as
written.

> **A third migration is now written and not applied:**
> `20260921120000_user_whats_new_seen_at` (ADR 0056) adds a **nullable**
> `whatsNewSeenAt` to `User`, deliberately un-backfilled because `NULL`
> carries meaning there. Additive on reads and writes per `docs/DEPLOY.md`
> §4b. Applying it is the operator's call.

- **`20260921000000_cron_heartbeat_last_success`** (`CD-06`, `11fb9ba`,
  `5b62455`). Adds a **nullable** `lastSuccessAt` to `CronHeartbeat`, then
  backfills `lastSuccessAt = lastRunAt` where it is null. The backfill
  grandfathers the existing heartbeat row so the deploy does not raise a false
  "no Digest has ever been sent" warning on Account until the next successful
  cron run — the same shape as the `ShareLink` label backfill below.
- **`20260921010000_feedback_author_snapshot`** (`FN-05`, `cf90b52`). Adds a
  **nullable** `authorName` to `FeedbackNote`, backfills it by joining the
  `User` rows that still exist, then drops the `FeedbackNote_authorId_fkey`
  foreign key.

**Both are additive on reads and on writes** by the test `docs/DEPLOY.md` §4b
sets out: each new column is nullable, so the still-running old build — which
does not write them — cannot violate a NOT NULL constraint during the
migrate-then-build window; and dropping a foreign key *removes* a restriction
rather than adding one, so the old build's reads keep working against a column
that remains. Neither renames nor drops a column, and neither drops a unique
constraint an older client's `upsert` depends on. So neither reproduces the
`share_links_per_audience` hazard documented below — but check the SQL against
§4b yourself before running it rather than taking this paragraph's word for it.

## Migration state before 2026-09-21 — history, not a checklist

Every migration in `prisma/migrations/` **that predates 2026-09-21** is applied
in production. This was
established by read-only `SELECT`s against the production `_prisma_migrations`
table during triage. **The four items below are the ones the `DONE` audit could
not independently repeat** (database connections are forbidden in this
workflow), so each is annotated accordingly. None was flipped merely for being
unrepeatable, and repo-side corroboration was done where possible.

- **`20260920000000_cron_heartbeat` — applied 2026-09-20T10:24:17Z.** (`OPS-07`;
  schema commit `99646f8`, merged 08:05:26Z.) A pure `CREATE TABLE`: no existing
  column touched, no constraint dropped, **unambiguously additive**, no downtime
  window for reads or writes at any point in the pipeline. The `CronHeartbeat`
  table also holds a live row (`{ id: 'digest', lastRunAt: 2026-09-20T21:07:05Z }`),
  which only the new cron route can write — so the code that uses it is live and
  executing, not merely schema-deployed. *Re-verification: not independently
  checkable — rests on a production read; the migration SQL quoted in triage
  matches the file on disk exactly.*
- **`20260920120000_share_links_per_audience` — applied 2026-09-20T23:09:52Z.**
  (`OPS-06`; schema commit `b008245`, merged 22:06:44Z.) Both pre-existing
  `ShareLink` rows read `label = 'Shared link'` with all three `include*` flags
  true — the grandfather backfill landed on real data. **This one carried a real
  downtime window; see the hazard note below.** *Re-verification: not
  independently checkable — rests on a production read; the migration SQL quoted
  in triage matches the file on disk exactly.*
- **`20260812000000_cost_and_paid_amounts` — applied 2026-08-12T08:23:38Z.**
  (`OPS-01`, closing `docs/things-to-fix.md` P0-3's rehearsal.) The prescribed
  rehearsal on a Neon snapshot branch was never run — what closes this is
  post-hoc verification instead: the renamed columns `costMinor`/`paidMinor`/`paidAt`
  are present, the pre-rename `estimatedMinor`/`actualMinor` are absent, and
  (below) zero rows show the failure mode the migration risked. Nothing left to
  rehearse; the deploy happened over five weeks ago and succeeded.
  *Re-verification: not independently checkable — rests on a production read;
  corroborated by `prisma/schema.prisma` and by no code anywhere referencing the
  pre-rename names.*
- **Legacy paid-without-date row count: 0 of 33 `Cost` rows.** (`OPS-03`,
  closing `docs/things-to-fix.md` P2-8 part (a).) `SELECT count(*) FROM "Cost" WHERE "paidMinor" IS NOT NULL AND "paidAt" IS NULL`
  → 0. With part (b)'s Budget-page notice already shipped, all of P2-8 is closed
  and the notice has nothing to surface in production so far.
  *Re-verification: not independently checkable — rests on a production read,
  and unlike the other three there is no repo-side corroboration possible at
  all, because it is a pure data question.*

### The hazard worth keeping: `share_links_per_audience` had a write-path downtime window

This is a **lesson, not a task** — the window has passed and nothing broke
irrecoverably. It is recorded here because it is the worked example `OPS-08`
asked `docs/DEPLOY.md` §4b to carry. **`OPS-08` is now closed**
(`2c25792`, `0398371`, `c6a1c83`, 2026-09-21): §4b names both write-path
hazard shapes, with this migration as the example, and its already-applied
migrations now read as history rather than as pending steps. This section stays
because the reasoning below is the source the §4b text was written from.

The migration SQL was:

```sql
ALTER TABLE "ShareLink" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'Shared link';
ALTER TABLE "ShareLink" ALTER COLUMN "label" DROP DEFAULT;
ALTER TABLE "ShareLink" ADD COLUMN "includeAccommodation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShareLink" ADD COLUMN "includeTransport" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShareLink" ADD COLUMN "includeDailyPlans" BOOLEAN NOT NULL DEFAULT true;
DROP INDEX "ShareLink_tripId_key";
CREATE INDEX "ShareLink_tripId_idx" ON "ShareLink"("tripId");
```

No column is renamed or dropped and no data is destroyed, so it is **additive
with respect to reads** — the old build's `findFirst`/`findMany` calls never
referenced the new columns. It is **not additive with respect to writes**:

1. **`label` ends NOT NULL with no default** (the `DROP DEFAULT` step). The
   pre-branch `createShareLink` did `db.shareLink.create({ data: { tripId, token } })`
   with no `label`. While the old build was still serving traffic after the
   migration applied and before the new build finished, every such call would
   have thrown a NOT NULL violation.
2. **`DROP INDEX "ShareLink_tripId_key"` removes the unique constraint the
   pre-branch `rotateShareLink` needed.** It called
   `db.shareLink.upsert({ where: { tripId }, ... })`, which Prisma compiles to
   `INSERT ... ON CONFLICT ("tripId") DO UPDATE ...`. Postgres requires a unique
   or exclusion constraint matching the conflict target, so once the index is
   dropped that statement fails outright — independent of any row's data.

So share-link creation and rotation were broken for the gap between
migrate-finish (23:09:52Z) and the matching `next build` finishing. `vercel.json`
runs both back-to-back in one step with no gate between them, which is what makes
the gap exist at all — that pipeline shape is an accepted Hobby-tier tradeoff,
not a defect (`OPS-08`).

**The generalisation to carry into `docs/DEPLOY.md`:** §4b warns about *renames
and drops breaking reads*. Two further shapes break *writes* from the
still-running old build — **adding a NOT NULL column with no default**, and
**dropping a unique constraint an older client's `upsert` or `where` clause
depends on**. Check new migration SQL against both.

## Superseded by the migration state above

These were filed as blockers and have since been answered by events. They are
listed so nobody re-opens them, and so the trail back to the source doc survives.

- **`CP-18` / `AB-13` — rehearse the cost/paid rename migration on a Neon
  snapshot branch before running it.** (`CP` lines 79-82; `AB` Still owed bullet
  1; `docs/things-to-fix.md` P0-3.) Moot: the migration ran in production on
  2026-08-12 and verified clean post-hoc — see `OPS-01` above. There is nothing
  left to rehearse.
- **`CP-20` / `AB-15` — count the legacy paid-without-date rows in production.**
  (`CP` lines 91-93; `AB` Still owed bullet 3; `docs/things-to-fix.md` P2-8(a).)
  Answered: **0 of 33** — see `OPS-03` above.
- **`RM-01` — before-deploy check: confirm the `Reminder` table is empty before
  running its migration.** (`RM` lines 20-24; `docs/DEPLOY.md:110` still carries
  the `SELECT count(*) FROM "Reminder";` step.) This was a one-time manual gate
  to run immediately before the migration. The `Reminder` migration — like
  every other migration predating 2026-09-21 — is long since applied in
  production, so the gate is no longer runnable; it has been overtaken. (The
  two unapplied 2026-09-21 migrations above touch `CronHeartbeat` and
  `FeedbackNote`, not `Reminder`, so they do not revive it.) **Do not treat this as a pending step.** If
  the outcome matters retrospectively, it needs a fresh production read by a
  human, not a re-run of the gate.

## Still genuinely blocked — needs a running app, a device, or a browser

- **`AB-14` / `OPS-02` — manual verify that a typed transport time survives the
  card, the reopened dialog, and the ICS feed.** (`AB` Still owed bullet 2;
  `docs/things-to-fix.md` P0-1, whose code fix is separately `**Status: FIXED**`
  — `c46bfb1`+`321c5f7` server, `29b449c` dialog. Only the confirmation is
  owed.) **What is needed:** a deployed app, a real Transport row on a Stop with
  a non-UTC timezone, and a visual check that all three surfaces agree. Triage
  deliberately did not fabricate this by writing a test row into the production
  database — that would plant fake data in a real couple's real trip. Use a
  disposable test trip.
- **`AB-16` / `OPS-04` — re-shoot the `.verify/` screenshot set against the
  current UI.** (`AB` Still owed bullet 4; `docs/things-to-fix.md` P3-5.)
  `.verify/shoot.mjs` still exists alongside a stale June–July capture set.
  **What is needed:** a running app pointed at a seeded dev database and a
  Playwright pass, then a re-check against `docs/mobile-pwa-checklist.md`. A
  production database connection is no substitute — screenshots need a rendered
  UI, not rows.
- **`CP-21` — confirm no production-only database object references the
  pre-rename column names.** (`CP` lines 91-93; not addressed anywhere in
  `docs/things-to-fix.md`.) **What is needed:** introspection of the live schema
  (or a snapshot restore) to check for views, triggers, or hand-created indexes
  that `prisma/schema.prisma` does not capture.
- **`CP-22` — confirm the Prisma calls in `markCostPaid`/`markCostUnpaid` are
  valid at runtime.** (`CP` lines 91-93.) Still unprovable by the suite:
  `server/actions/costs.test.ts:65` `vi.mock("@/lib/db", ...)` — every
  server-action test mocks `lib/db`, so the real Prisma calls are never
  exercised against a real client or schema. **What is needed:** an
  integration/e2e tier running these actions against a real test Postgres, or a
  manual pass.
- **`RM-02` — confirm all four VAPID variables are set in Vercel before the
  build that ships.** (`RM` lines 25-28; `docs/DEPLOY.md:183-186`.)
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is inlined at build time, so no local
  inspection can prove the dashboard is correct. **What is needed:** confirm
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` are all set in Vercel, then redeploy so the
  inlined value is current.
- **A push actually reaching a device, and a calendar client actually parsing a
  `VALARM`.** Both underlying code fixes are struck (`RM-03`, `RM-07`, `RM-18`),
  and both are pinned by tests — but no test in this repo can prove a real push
  arrives on a real phone, or that a third-party calendar app renders the alarm.
  **What is needed:** one pass on a real device and one subscription in a real
  calendar client.
- **The dispatcher heartbeat flipping Account off "never run".** Already
  observed indirectly: the `CronHeartbeat` row exists with a same-day
  `lastRunAt`, so the route is running (see `OPS-07`). What has not been seen by
  a human is the Account surface itself rendering the healthy state rather than
  the "digests are not being sent" warning. **What is needed:** one look at
  `/account` on the deployed app.
- **A real-browser assertion for the `HG-08` residue.** `HG-08` itself is
  **struck** (`7f4c82b`, 2026-09-21): the tautological test was replaced with one
  that proves everything the *component's JavaScript* is responsible for — the
  fragment is cleared, and a later `hashchange` does not re-open the section.
  What no test in this repo can prove is the CSS half: jsdom applies no
  `:target` rule, so nothing asserts that `HELP_PRINT_STYLE`'s `details:target`
  fallback is not visually holding a collapsed section open. **What is needed:**
  one look in a real browser. The gap is stated in the test's own comment block,
  so it does not have to be re-derived.
- **`FP-16`'s optional real-phone look.** Settled, not owed — but if a device
  pass is ever done, the exact conditions to check are recorded with that entry
  in *Settled* below.

---

# Settled — do not re-raise

**These 26 were judged and declined deliberately.** They are not oversights, not
"someone forgot", and not a low-priority queue. Re-raising them is precisely the
churn this document exists to stop: seven docs accumulated in part because
settled calls kept coming back as fresh findings. If you believe one should be
reopened, take it to the operator with new information — do not simply file it
again.

**Two of these are instructions *not* to make a change that will look like an
improvement.** They are marked ⚠ and their reasons are reproduced in full.

### ⚠ HG-01 / HG-11 · The help guide must **not** document the `ADMIN_EMAILS` operator override

- **Source:** `HG` (`:575` (L2) and `:662` (Parked) — the parked bullet is a
  verbatim restatement; the parked wording is the more explicit of the two and is
  the one quoted here).
- **The observation:** the guide says trip settings are seen by "only the person
  who created the trip". That is no longer literally exhaustive —
  `app/(app)/trips/[tripId]/settings/page.tsx:31-34` reads
  `const isOwner = membership.role === "owner";` then
  `const canManageTrip = isOwner || isAdminEmail(user.email);`, i.e. ADR 0045's
  `ADMIN_EMAILS` operator override also gets in.
- **Why it stays inexact, deliberately:** **the guide ships to every user and
  must not document the operator override.** The sentence is true for every
  reader who is not an operator. **Do not "correct" this by writing admin access
  into user-facing prose.** The imprecision is the decision, not a defect.

### ⚠ HG-07 · The Back button after a contents-link click is inherent to the approach

- **Source:** `HG` (`:642`, "Parked").
- **The observation:** clicking a contents entry pushes a history entry that a
  subsequent `replaceState` rewrites to the fragment-less URL, so one Back press
  lands on a visually identical `/help`. This matches `HelpHashOpen`'s own doc
  comment (`components/trip/help-hash-open.tsx:1-10`) describing the
  `:target`-replacement approach.
- **Why it stays:** **every alternative poisons the Back button worse.** This is
  a genuine settled call recorded by the source doc itself, not an oversight —
  the behaviour is inherent to the approach, so "fixing" it means adopting an
  approach with a worse history trail. Leave it.

### Settled on 2026-09-21, branch `chore/close-the-open-backlog`

Two entries moved here from *Open items* on the close-out. Both were
**declined**, not deferred — the reasoning is reproduced so nobody has to
re-derive the trade.

#### FP-07 · A desktop toast over the Compare table's frozen label column

- **Settled 2026-09-21.** The overlap is transient and readable once the toast
  clears, and the planned `md:mb-24` would buy a **permanent 6rem dead band**
  under the table on every desktop view to fix it. `FP-15` rules out the
  bottom-right (it belongs to the Feedback trigger and its docked panel), so
  there is no free direction to move a toast. Declined deliberately: a
  permanent cost for a transient annoyance.
- **Its two neighbours did ship**, which is why this one can look like an
  oversight: `FP-06` and `FP-13` were closed in sweep task 17 (`14b8f6b`) and
  are in the *Struck* register. `FP-07` was never blocked on them.
- **Original evidence, unchanged:** `components/trip/compare-table.tsx:477` —
  the `sticky left-0 z-10` label column is still there, and toasts are still
  bottom-left (see the settled `FP-15`), so the overlap is geometric and real.
  It is the fix that was declined, not the observation.

#### SW-02 (remainder) · The non-confusable decorative `MapPin` uses

- **Settled 2026-09-21.** The one genuinely confusable instance,
  `phase-travelling.tsx:508`, was fixed as a missed instance of `HG-02`/`HG-10`
  (see the Struck register). The rest sit nowhere near a real `MapLink`, so
  none is *confusable* — they are a consistency preference, and stripping pins
  across 16 nav, palette, summary, print and share surfaces buys no behavioural
  change. **`components/trip/help-legend.tsx` keeps its pin regardless:** it is
  the legend that teaches what the glyph means, and "fixing" it would break the
  only place that explains the icon.
- **On the count — read this before quoting a number.** This entry's
  population was stated wrong twice before the sweep's final review put it at a
  grep-verified **21 render sites across 16 files**, one of which was the
  confusable instance now fixed. The same entry *also* said "the ~14
  non-confusable survivors" in its decide-before-building bullet, which does
  not reconcile with 21 minus 1. **Neither figure was re-derived during the
  2026-09-21 close-out** — the settlement rests on the *kind* of thing these
  uses are (decorative, nowhere near a real `MapLink`), not on how many there
  are. If anyone reopens this, re-grep before quoting any of these numbers.
  This particular count has a history of being wrong in the very entry written
  to correct it.

### WN-01 · Whether an attachment opened from the installed iPhone PWA would hit the sign-in page

- **Source:** raised 2026-09-21 while planning the attachment new-tab change;
  settled the same day by the amendment to ADR 0043.
- **The observation:** `/api/attachments/:id` is session-authenticated
  (`app/api/attachments/[id]/route.ts:45`), and a standalone iOS PWA can hold
  a cookie jar separate from Safari — so a link opened out of the installed
  app might arrive unauthenticated and bounce to sign-in.
- **Why it is settled rather than owed:** the behaviour that would have caused
  it was never shipped. Attachment links open out **only in an ordinary
  browser tab**; inside the installed PWA they navigate in-app exactly as ADR
  0043 specified. There is no code path from the installed app to a new tab,
  so there is nothing a device pass could observe.
- **What would reopen it:** any change that gives attachment links a
  `target="_blank"` unconditionally, or that removes the `isStandalone()`
  branch in `components/trip/attachment-link.tsx`. If that is ever proposed,
  the fix is already designed — a server action performs the access check and
  returns the **presigned** storage URL (the route already 302s to one,
  `PRESIGN_EXPIRY_SECONDS = 300`), and the client opens *that*, needing no
  session. The tab must be opened synchronously on click and its location set
  when the URL resolves, or the popup blocker eats it.

### From `CP` — `docs/follow-ups/2026-08-12-cost-paid-remodel.md`

- **CP-14** · `markCostPaid`/`markCostUnpaid` re-implement the cost access check
  inline rather than calling `requireCostAccess`. Deliberate: they return a
  typed result where the helper throws `notFound()`. Reaffirmed in
  `docs/things-to-fix.md`'s "Deliberate behaviour — do NOT fix these" table. Not
  an authorization gap — it is the same check, differently shaped.
- **CP-15** · A cost card can show a paid amount with no green tick. Consistent
  with the **Paid** glossary entry, and a consequence of the deliberate history
  preservation when un-marking paid. Display only.

### From `AB` — `docs/follow-ups/2026-08-15-audit-backlog-build.md`

- **AB-06** · Scope the located-wishlist query to `forkId: null`
  (`components/trip/home/phase-travelling.tsx:171-179`). Belt-and-braces:
  fork-created wishlist-shaped rows are not producible today, so no path exists
  by which this leaks real data.
- **AB-07** · Fold the duplicated tz-conversion block in
  `createTransport`/`updateTransport` into a shared helper. Pure refactor, no
  correctness defect.
- **AB-08** · Memoise `Intl.DateTimeFormat` per zone in `currentTripTimezone`.
  Performance nice-to-have ("if the trips list grows"), not correctness.
- **AB-09** · Copy-pasted catch-block comments and overclaiming toast copy in
  `itinerary-manager.tsx`. Wording only.
- **AB-10** · Three visual eyeball items (paid-confirm popover styling, fork
  Budget banner spacing, firm-up label duplication). Cosmetic; needs a running
  app to see.
- **AB-11** · Small dead code — `checklistRows`, an unreachable `todayISO()`
  fallback, stale comments. No behavioural risk.
- **AB-12** · Test gaps flagged by reviewers (nav-more-menu, mobile-tab-bar,
  aria-busy, the DST transition day, dialog-reuse). Triaged nice-to-have by the
  branch's own review, with the DST case probed correct by hand. **Test-coverage
  gaps that were settled stay settled** — recorded so they are not rediscovered
  as new findings.

### From `FN` — `docs/follow-ups/2026-09-08-feedback-notes.md`

- **FN-13** · `MAX_QUEUED = 50` drops the oldest unsent Feedback note. Bounded is
  correct: unbounded growth causes the very quota failure the module guards
  against, and 50 is generous for two Travellers. A reasoned, bounded trade-off,
  not an unrecognised data-loss defect.
- **FN-14** · `feedbackStatusSchema` and `CreateFeedbackNoteOutput` are unused.
  Matches the per-module export convention every other entry in those files
  follows.
- **FN-15** · Commit `3fbb521`'s subject says "note" where it means a Feedback
  note. Real, but not worth rewriting history for.

### From `FP` — `docs/follow-ups/2026-09-09-feedback-panel-chat-shape.md`

- **FP-14** · The Feedback panel stays open when you click the page behind it
  (`components/feedback/feedback-launcher.tsx:528`,
  `onInteractOutside={(event) => event.preventDefault()}`). Deliberate: "a site
  chat widget does not vanish because you clicked the page, and `CONTEXT.md`
  promises the page stays *usable* behind it. Closing is the X and Escape" — and,
  per the struck `FP-04`, the trigger itself.
- **FP-15** · Desktop toasts live in the bottom-left. Deliberate: "The
  bottom-right belongs to the Feedback trigger and the panel docked above it;
  lifting toasts above a panel up to 37.5rem tall would strand them mid-screen."
- **FP-16** · Two claims rest on class contracts rather than measurement. The
  doc's own acknowledgment that jsdom cannot measure layout or hit-testing:
  "'the toast viewport no longer swallows taps' and 'a toast no longer covers the
  composer' are pinned by the classes plus a real close-button click — not by
  anything a test measured." Filed under "do not re-litigate". *If a real-device
  pass is ever done anyway, the exact conditions are: a phone (or phone-width
  browser with touch emulation) with the Feedback panel open, confirming (a) taps
  on content behind the toast viewport's invisible hit-region do not register,
  and (b) an open toast does not visually sit over the composer.*

### From `HG` — `docs/follow-ups/2026-09-15-help-guide-audit.md`

- **HG-03** · The `away` paragraph says "changes do need a connection to save",
  which has one exception (the Feedback note offline queue, ADR 0041). Left
  unqualified deliberately: the guide does not document Feedback at all, so the
  claim is true for every entity the paragraph actually describes. Recorded so a
  future Feedback section in the guide does not silently contradict it.
- **HG-04** · "Places that still have no dates" is a Flag
  (`lib/flags.ts:452-462`, `severity: "info"`), not a nudge. The distinction is
  invisible to a reader — both render as one line in the same ranked list — and
  the companion example given is a genuine nudge, so the paragraph is not wrong
  enough to reword.
- **HG-05** · The Journal word-list says "while you're away", which is a framing
  rather than a gate — `app/(app)/trips/[tripId]/day/[date]/page.tsx:516` renders
  the editor unconditionally. `CONTEXT.md` has no Journal entry to contradict it.
  Left alone.

### From `RM` — `docs/follow-ups/2026-09-17-reminders-follow-ups.md`

- **RM-19** · Half-hour timezones (Kolkata, Kathmandu). Closed by documentation
  before the doc was even written: a half-hour zone is served exactly like any
  other, by adding its cron hour, with no code change —
  `docs/DEPLOY.md:165-175` still says so.

### From `CD` — the two process lessons

- **CD-17** and **CD-18** are settled as backlog items because they are not
  defects at all: they are plan-authoring lessons. They are carried in this
  document's agent-facing preamble above (*Five process lessons, carried
  forward* — `CD-17` and `CD-18` are the first two) rather than listed as work.
  Do not file them as tasks.

---

# Known limitations accepted on 2026-09-21 — do not re-file these as findings

**Two, and they are not items.** They are consequences the operator accepted
knowingly while building the close-out, recorded here so nobody rediscovers
them, files them as fresh defects, and starts the churn cycle this document
exists to stop. They are **not counted** in the trust statement's totals,
because neither is open work: each is a documented property of what shipped.

If you think either should be fixed, that is a new decision to take to the
operator with a concrete case — not a bug report.

### A firm-up can re-file an Item onto a Stop that is itself about to be re-dated

Landed with `CD-03` / **ADR 0055**, and recorded in that ADR's Consequences.

`firmUpTrip` (`server/actions/stops.ts`) writes each Stop's flowed dates **one
Stop at a time, outside a transaction**. So when it re-dates Stop *k*, the
covering-Stop read that ADR 0055's re-file depends on still sees Stops
*k+1…n* at their **pre-flow** dates. Where that matters, an Item can be handed
to a Stop that no longer covers the day by the time the loop finishes.

**The conditions are narrow and all three must hold:** Stop *k*'s **arrive**
date must be unchanged while its **depart** date changes (nothing else reaches
this path at all), and a later Stop must cover the dropped day **at its old
dates**.

**Accepted as-is, deliberately.** That loop was already non-transactional
before ADR 0055, so this is a pre-existing property of firm-up that the re-file
makes visible rather than something the re-file introduced. Wrapping the loop
in a transaction is its own piece of work with its own review. (A related
entry point, `firmUpSegment` at `server/actions/stops.ts:792`, was checked in
review and is unreachable today, so only `firmUpTrip` runs those reads outside
a transaction.)

### A brand-new `CronHeartbeat` row reads unhealthy until its first scan completes

Landed with `CD-06`.

`isDispatcherUnhealthy` keeps *null means unhealthy* — an operator ruling taken
during the review loop — so a deployment with **no heartbeat row at all** shows
the "digests are not being sent" warning on Account until the first successful
cron scan stamps `lastSuccessAt`. That is one cron run, not the ~10-hour
false-alarm window the alternative would have created.

**The *existing* row is grandfathered** by migration
`20260921000000_cron_heartbeat_last_success`, which backfills
`lastSuccessAt = lastRunAt`. So this limitation bites a fresh deployment, not
the current one. **Note that the migration has not been applied** — until it
is, the backfill has not happened.

---

# Struck — already fixed (no action)

**96 items. None of these is open. Do not work them.** They are in three
groups, newest first: the **13** closed by the 2026-09-21 close-out on branch
`chore/close-the-open-backlog`, the **39** closed by the 2026-09-21 sweep —
both reproduced in full below with their commits — and the **44** that were
already closed before this document was compiled on 2026-09-20, kept as a
one-line-each table because their evidence lives in the source docs rather than
here. 13 + 39 + 44 = 96.

**Two of the 13 are struck against a migration that has not been applied**
(`FN-05`, `CD-06`). Their code and their migration files landed; production
does not yet have the columns. See *Migration state*.

## Closed by the 2026-09-21 close-out

**13 items**, closed on branch `chore/close-the-open-backlog` between `c056c0b`
and `898f1b0` — except `SW-03`, which was closed a branch earlier (`06f25a3`,
`chore/close-sw03-and-sw05`) and merely struck here. Each entry below is
reproduced whole — its text as it stood in *Open items* or *Needs a decision* —
followed by what actually shipped.

**Read the *What shipped* notes, not only the titles.** Three of the five
decided items (`CD-02`, `CD-03`, `CD-04`) shipped as an option their own entry
did not list, and two of those entries stated in writing that only two options
existed. A struck title here is not a guarantee that the fix has the shape the
entry predicted. Two of these entries also depend on a **migration that is
written but not applied** (`FN-05`, `CD-06`) — they are struck because the code
and the migration file landed, not because production has the column.

### SW-05 · `inviteToTrip` needs an owner-or-admin guard

- **Source:** none — found during the final whole-branch review of this
  document as an open question, resolved by the operator on 2026-09-21. See
  ADR 0052 for the full reasoning.
- **Decision:** `inviteToTrip` becomes owner-or-admin. `createShareLink` and
  `createCalendarFeed` deliberately **stay open to any member — out of
  scope, not an oversight.** ADR 0052 records why: a Share link is bounded by
  ADR 0051's never-shared floor and a Calendar feed exposes only schedule, so
  a member handing either out leaks far less than a member handing out full,
  transitive Trip membership. Do not extend this guard to those two actions.
- **Guard to add:** `server/actions/invites.ts:40` — `inviteToTrip` currently
  does only `await requireTripAccess(tripId);` and discards the result. Copy
  `deleteTrip`'s shape at `server/actions/trips.ts:258`: use the
  `{ user, membership }` `requireTripAccess` already returns, and refuse
  unless `membership.role === "owner"` or `isAdminEmail(user.email)` — same
  admin bypass as Delete and Duplicate (ADR 0045).
- **UI must be gated too:** `app/(app)/trips/[tripId]/settings/page.tsx`
  already computes `canManageTrip` (owner-or-admin) at line 36 but applies it
  only to the Danger zone at line 221; the Invite control currently renders
  for every member. Gate it on `canManageTrip` in the same change, so no
  non-owner is shown a button the server will now refuse — a UI/server
  mismatch on exactly this shape is what hid the `duplicateTrip` P0 (`HG-12`,
  struck) until it was found.
- **Regression test:** must prove a non-owner member is refused by
  `inviteToTrip`, and must fail against the current code — before the guard
  exists — the same before/after standard every access-guard fix in this
  document is held to.
- **Out of scope:** `createShareLink` (`server/actions/share.ts:97`) and
  `createCalendarFeed` (`server/actions/calendar-feed.ts:59`) — leave both on
  `requireTripAccess` alone. See ADR 0052.
- **Category:** mechanical · **Effort:** S
- **Closed:** `a0eaa72`, 2026-09-21 (close-out task 1). Decision: **ADR 0052**.
- **What shipped:** exactly the decided guard. `inviteToTrip` now destructures
  `{ user, membership }` from `requireTripAccess` and refuses unless
  `membership.role === "owner"` or `isAdminEmail(user.email)`, with a comment
  naming ADR 0052's asymmetry. `createShareLink`, `createCalendarFeed` and
  `cancelInvite` are untouched, as specified.
- **Deviation from this entry's UI instruction, accepted in review.** The entry
  said to gate the Invite control on the settings page's existing
  `canManageTrip`. The implementation instead gated the invite **form** inside
  `InvitePanel` via a new `canInvite` prop, because that component bundles the
  member list and the pending-invite list together with the form — wrapping the
  whole Travellers card would have hidden both from ordinary members. The
  reviewer verified the bundling before accepting it. Same effect on the button
  the server now refuses, without hiding lists nobody asked to hide.

### FN-05 · A Feedback note does not survive its author

- **Source:** `FN` (`docs/follow-ups/2026-09-08-feedback-notes.md:38-42`)
- **Evidence:** `prisma/schema.prisma:739` —
  `author User @relation(fields: [authorId], references: [id], onDelete: Cascade)`,
  unchanged. No migration since 2026-09-08 touches this FK's behaviour.
- **Fix shape:** the same treatment ADR 0040 already gave `tripId`/`tripName`
  — snapshot `authorName` at write time, and either drop the cascade or make
  `authorId` nullable with `onDelete: SetNull`. Needs a migration; read
  `docs/DEPLOY.md` §4b and `OPS-08` first.
- **Not swept 2026-09-21:** the fix needs a schema change and therefore a
  migration, which the sweep was forbidden from adding. There is no partial
  version that leaves the tree coherent — a `schema.prisma` change without its
  migration produces a generated client expecting columns production does not
  have. **Needs the operator's go-ahead on migration 27 first**, then its own
  plan. Read `docs/DEPLOY.md` §4b, including the write-path section the sweep
  added, before writing that plan.
- **Category:** mechanical · **Effort:** M
- **Closed:** `cf90b52`, 2026-09-21 (close-out task 7). Decision: the
  **2026-09-21 amendment to ADR 0040**.
- **What shipped:** the first half of the entry's own fix shape, and the FK
  dropped rather than nulled. `authorName` is a nullable, **write-time
  snapshot** on `FeedbackNote`; the `author` relation and its `onDelete:
  Cascade` are gone; `authorId` stays a plain column. The author-scoped
  visibility rule (`where: { authorId: user.id }`, and the matching delete
  gate) is deliberately untouched — no null special case, which is the point of
  the amendment. The FK name the migration drops,
  `FeedbackNote_authorId_fkey`, was verified against
  `20260908000000_add_feedback_notes/migration.sql:27` rather than assumed.
- **⚠ The migration `20260921010000_feedback_author_snapshot` is written but
  NOT applied.** See *Migration state*. This entry is struck because the code
  and the migration file landed, not because the column exists in production.
- **By design, not a defect:** because `authorName` is snapshotted at write
  time, a User who renames themselves leaves older notes showing the name they
  had when they wrote them. That is the intended effect of the amendment, not
  drift.

### SW-01 · A Feedback note can show as both Pending and Sent when storage is blocked

- **Source:** none — found during the 2026-09-21 sweep, while fixing `FN-07`.
  No source doc records it.
- **Evidence:** `components/feedback/feedback-launcher.tsx:445-446` —
  `setPending(removeFromQueue(note.clientKey)); setSent((prev) => [...prev, result.note]);`.
  `setSent` is pushed unconditionally on a successful send. But
  `removeFromQueue` goes through `lib/feedback-queue.ts`'s `write()`, which
  swallows a `localStorage.setItem` failure (quota, private mode) and returns the
  *unchanged* queue — so `setPending` is handed a queue that still contains the
  note while `setSent` adds the same note to the sent list.
- **Symptom:** under blocked or full storage, one Feedback note renders in both
  the Pending and the Sent list, and stays there until the panel is remounted.
- **Same class as `FN-07`, one layer up.** `FN-07` fixed the queue module's own
  flush loop (`a96e537`); this is the component doing the identical
  trust-the-write mistake in its own send path. The fix shape is the same: check
  the returned queue genuinely lacks the `clientKey` before treating the removal
  as real.
- **Why it was not fixed in the sweep:** observed by task 7's reviewer and
  recorded as explicitly out of that task's scope rather than widened mid-task.
- **Category:** mechanical · **Effort:** S
- **Closed:** `b0b50a0`, `4b33884`, 2026-09-21 (close-out task 8).
- **What shipped:** the fix shape this entry predicted. `handleSend`'s success
  branch now captures the queue `removeFromQueue` actually returned and adds
  the note to `sent` only once it is confirmed no longer queued, reusing the
  `isQueued` helper already defined a few lines above for the offline-enqueue
  path — no new predicate.
- **The regression test exercises the real swallowed write, not a mock of the
  fix's own condition.** This test file does not mock `lib/feedback-queue.ts`
  at all; it runs the real module against jsdom's `localStorage`. The test
  spies on `window.Storage.prototype.setItem`, lets the initial `enqueue`
  through, and makes every call after it throw `QuotaExceededError`. `4b33884`
  then strengthened the assertion from a count to **list placement**: the note
  must land in Pending (its badge present, its Delete button absent), not
  Sent.

### CD-16 · `CONTEXT.md`'s **Digest** entry no longer describes the truncation behaviour accurately

- **Source:** `CD` (`:100-102`, embedded in the Checklist-cap bullet and split
  out as its own item during triage)
- **Evidence:** `CONTEXT.md:190` describes a single global cap that always takes
  the tail ("it is ordered by what is most costly to lose... then **Checklist**
  items (which reappear nightly until done, and so give way first)"). It does not
  mention the separate, silent per-section `DIGEST_MAX_CHECKLIST_LINES = 2` cap
  at `lib/digest.ts:88,168`, which drops excess Checklist lines *before* the
  global cap or its `+N more` indicator ever sees them.
- **Sequencing:** this should land with whatever `CD-07` is decided (see *Needs
  a decision*), because the correct wording depends on that outcome. Do not
  update `CONTEXT.md` to describe behaviour that is about to change.
- **Not swept 2026-09-21:** deliberately deferred, on the sequencing note above
  — `CD-07` is in *Needs a decision*, which the sweep did not touch, so writing
  the accurate-today wording now means rewriting it the moment `CD-07` lands.
  **Fix it in the same commit as `CD-07`**, not before.
- **Category:** docs · **Effort:** S
- **Closed:** `ac44282`, 2026-09-21 (close-out task 5) — **in the same commit
  as `CD-07`**, which is exactly what this entry's sequencing note required.
- **What shipped:** `CONTEXT.md`'s **Digest** entry now describes the separate
  per-section Checklist cap and the fact that lines it drops are counted into
  the single `+N more` tail, i.e. it describes `CD-07`'s chosen option rather
  than the behaviour that was about to change.
- **Minor, deferred:** the new wording hardcodes "two", coupling the glossary
  prose to `DIGEST_MAX_CHECKLIST_LINES`. Recorded under *Deferred minors from
  the 2026-09-21 close-out*.

### SW-02 (confusable instance) · `phase-travelling.tsx`'s pin sat beside a real `MapLink` — a missed fourth instance of `HG-02`/`HG-10`

- **Source:** none — found during the 2026-09-21 sweep, while fixing
  `HG-02`/`HG-10`. No source doc records it. **This is the struck half of a
  split entry**; the ~20 decorative, non-confusable uses were declined and are
  in *Settled — do not re-raise*.
- **Evidence, as it stood:** `phase-travelling.tsx:508` was confusable, not
  merely inconsistent. It sat in the same flex row as a real `MapLink` at
  `:519` — the same side-by-side pattern `HG-02` was written to fix. Worse,
  that `MapLink` was given an always-present `label`, and `lib/maps.ts:31`
  falls back to `label` when there is no address, so it rendered a pin for
  every stop regardless of whether coordinates existed — exactly the failure
  mode `stop-card.tsx:337-345` was changed to gate against
  (`stop.lat != null && stop.lng != null`) for this same reason. It was treated
  as a fourth instance of `HG-02`/`HG-10`, not as a thing to decide.
- **Category:** mechanical · **Effort:** S
- **Closed:** `7fcef35`, 2026-09-21 (close-out task 9).
- **What shipped — both halves of the defect, not just the pin.** The
  decorative `MapPin` in the "Where you are" block was removed (with a comment
  explaining why no pin renders there, mirroring `stop-card.tsx:336-338`), and
  the `MapLink` itself is now gated on the stop having real coordinates,
  returning `null` when `lat` or `lng` is absent — the pattern and reasoning
  copied from `stop-card.tsx:337-345`. `components/trip/help-legend.tsx` was
  deliberately left untouched.
- **Test deviation, ruled legitimate in review:** `PhaseTravelling` is an async
  server component whose children — `MapLink` included — are mocked to
  `() => null` in this test file, so there is no DOM for a `screen.queryByRole`
  assertion to query. The test walks the returned React element tree with the
  file's own `findElementByType` helper, which is the established pattern in
  that file and a direct assertion that the JSX no longer creates a `MapLink`
  element.

### SW-04 · `FeedbackNoteRow` names both an exported and a private type, in different shapes

- **Source:** none — found during the final whole-branch review of this
  document, while checking the sweep's claims. No source doc records it.
- **Evidence:** `lib/feedback-inbox.ts:24` exports `FeedbackNoteRow` (the
  Prisma selection `scripts/feedback-pull.ts` reads). `server/actions/feedback.ts:36`
  separately declares a private `type FeedbackNoteRow` with a different shape
  (it carries `authorId` and `author: { name }`; the exported one does not).
  The two are never imported together, so nothing breaks today — but a reader
  who greps the name, or an editor's autocomplete, will find two unrelated
  types answering to it.
- **Same class as `CD-15`** (`DispatcherHealth` naming both a component and an
  interface, imported into the same page) — a name reused across files for
  different things, closed in sweep task 22. This is the same problem one file
  boundary further out: no shared import today, but the same confusion waiting
  for the day one is added.
- **Fix:** rename one — e.g. the private one in `server/actions/feedback.ts` to
  `FeedbackNoteQueryRow` — when next touching either file. Do not rename either
  as part of landing this entry.
- **Category:** docs · **Effort:** S
- **Closed:** `6480936`, 2026-09-21 (close-out task 10).
- **What shipped:** the rename this entry proposed, in the direction it
  proposed. The private type in `server/actions/feedback.ts` is now
  `FeedbackNoteQueryRow` (4 references); the exported `FeedbackNoteRow` in
  `lib/feedback-inbox.ts:24` is untouched.
- **One grep discrepancy resolved while doing it:** `scripts/feedback-pull.ts`
  never names either type textually — it passes its raw `select` result to
  `toInboxNote()`, whose *parameter* carries the annotation. So the exported
  type has exactly one textual consumer, not two.

### SW-03 · `CLAUDE.md`'s session-start `feedback:pull` instruction makes subagents connect to production

- **Source:** none — this is a process finding from running the 2026-09-21
  sweep, not a defect in the app. It is for the operator, not for an agent to
  "fix" unasked.
- **Evidence:** `CLAUDE.md:5-7` — "At the start of every session, before the
  grilling interview: 1. Run `npm run feedback:pull`". `package.json` maps that
  to `tsx scripts/feedback-pull.ts`, which opens `DATABASE_URL`. In a
  subagent-driven pipeline every fresh subagent reads "every session" as
  applying to *itself*.
- **It happened twice during this sweep**, in both cases despite the dispatching
  brief carrying an explicit "do not connect to a database" instruction. The
  cause is systemic, not a lapse in either agent: the project instruction file
  outranks the task brief in the agent's reading, and it says *every* session.
- **Impact so far: nil.** Both reads were read-only, the regenerated
  `docs/feedback/inbox.md` was reverted, and neither entered a commit — verified
  against `git status`. The risk is the shape of it, not the damage done.
- **Fix:** scope the instruction to the orchestrating session — e.g. "at the
  start of a session *you* started with the operator, not if you are a subagent
  executing a task brief" — or move it out of `CLAUDE.md` into the
  session-opening skill, where only the top-level session reads it.
- **Category:** process · **Effort:** S
- **Closed:** `06f25a3`, 2026-09-21, on branch `chore/close-sw03-and-sw05`
  (merged as `74c835d`).
- **⚠ It was fixed before the close-out branch existed, and left standing
  here.** The branch that fixed it struck nothing, so this entry sat in *Open
  items* already closed until the 2026-09-21 drain found it. That is the same
  missing-drain failure this whole document exists to stop, committed by the
  document's own maintainers, one branch after it was written down. If you
  close an item, strike it in the same commit.
- **What shipped: the first of the two options this entry offered** — the
  instruction was scoped, not moved. `CLAUDE.md` now opens with a *Who these
  apply to* note stating that a subagent or scoped subtask is not a session and
  must not re-run session-start steps, and the Feedback-inbox section carries
  its own "main session only" line naming `feedback:pull`'s production
  connection explicitly.

### CD-02 · `subscribeToPush` can reassign a Device row it does not own — P1

- **What it is:** `server/actions/push.ts:41` (`create`) and `:67` (the `update`
  arm of the upsert) both write `userId: user.id` unconditionally. The `update`
  arm's own comment confirms this is deliberate, and asymmetric with
  `reconcileDevice` (`server/actions/devices.ts`), which refuses to touch a row
  it does not already own.
- **Exposure if left as-is:** an authenticated attacker who obtains a victim's
  push `endpoint` — a capability secret that only ever travels app → push
  service → database, not something guessable — can re-point that row's `userId`
  to themselves, achieving device theft and silencing (the Device stops notifying
  its real owner). Not content theft: pushes remain encrypted to the victim's
  keys.
- **Option (a):** require an explicit re-Enable when the endpoint's stored
  `userId` differs from the caller. **Cost:** closes the hole, but forces a
  re-permission prompt on a genuinely shared machine where a second person
  legitimately wants that physical Device's subscription.
- **Option (b):** accept the current upsert-reassign behaviour and document it
  as intentional. **Cost:** the exposure above stays open.
- **Why no third option:** the legitimate shared-machine call and the hijack are
  byte-identical, so no smarter check can tell them apart. Only removing the
  ambient trust — option (a) — changes anything.
- **Closed:** `00e982b`, 2026-09-21 (close-out task 2). Decision: **ADR 0053**.
- **⚠ This entry's "Why no third option" paragraph was wrong, and a third
  option is what shipped.** The paragraph's reasoning is itself sound — the
  legitimate shared-machine call and the hijack really are byte-identical, so
  no smarter check can tell them apart — but it answers the wrong question.
  The two calls never needed telling apart. They only resemble each other
  because both try to *reuse* an endpoint that already belongs to someone, and
  the legitimate one does not have to: a browser that unsubscribes and
  re-subscribes gets a **new** endpoint and needs no reassignment at all.
- **What shipped:** the server **refuses**, and the **client mints a fresh
  endpoint.** `subscribeToPush`'s `update` arm stops writing `userId`
  altogether; when the row matched by `endpoint` belongs to someone else the
  action returns a distinct `conflict` result rather than a generic error. On
  that conflict `components/account/push-subscribe.ts` calls
  `subscription.unsubscribe()`, re-subscribes through `pushManager.subscribe()`
  to obtain a new `endpoint`, persists that, and retries **exactly once** — a
  second conflict is a real error and surfaces as one. The displaced person's
  now-dead row is left to the existing prune path, which already treats a
  404/410 from the push service as `gone`. Neither option (a) (a forced
  re-Enable) nor option (b) (accept the exposure) was built.
- **Deferred minor:** the client-side conflict retry has no automated coverage
  — no test file exists for that module. Recorded under *Deferred minors from
  the 2026-09-21 close-out*.

### CD-03 · Rule 4 does not govern a Stop re-date — P2

- **What it is:** `scheduleItem`/`rescheduleItem` call `resolveOwningStop`
  before writing an Item's date, so rule 4 applies to explicit moves. A Stop
  re-date instead goes through `shiftStopPayloadTx` (`server/actions/stop-flow.ts`)
  → `shiftItemDates` (`lib/payload-shift.ts`), which is pure ADR 0038 offset math
  with no concept of an owning Stop — so an Item un-slots to `date: null` even
  when an adjoining Stop still covers its calendar date. Recorded in full in ADR
  0049's Consequences (`docs/adr/0049-...md:109-132`).
- **Option (a):** extend rule 4 into the re-date/un-slot path, so a Stop re-date
  can re-file an Item onto a *different* Stop's Budget line. **Cost:** a genuine
  behaviour change to `lib/payload-shift.ts` and `server/actions/stop-flow.ts`,
  both left untouched on purpose by ADR 0049.
- **Option (b):** leave it. **Cost:** the Item un-slots to the trip's
  things-to-do and its Cost falls to "Trip-wide / Other" purely because its
  owning Stop shortened, even though a neighbouring Stop still covers the date.
- **Newly visible, which is why it surfaced now:** before ADR 0049 the Item
  silently vanished off a card nobody was looking at; now it visibly disappears
  off the adjoining Stop's changeover-day card, which the Traveller never
  touched. The ADR explicitly deferred this as deserving its own spec and review.
- **Effort if built:** L.
- **Closed:** `51504d6`, `ccdc747`, 2026-09-21 (close-out task 6). Decision:
  **ADR 0055**.
- **⚠ Built narrow. Option (a) as written was DECLINED, not deferred.** Rule 4
  extends into the un-slot path **only where the shift leaves the Item's
  calendar date unchanged** — a Stop that *shortens* away from a day the Item
  still sits on hands that Item to whichever Stop covers the date
  (`stopForDate`, rule 4's existing tiebreak). Where the shift *moves* the
  Item's date — a Stop re-dated to a different span — an Item falling outside
  the new span still un-slots, exactly as before.
- **Why the general case is declined rather than postponed:** on a whole-Stop
  *move*, an Item that falls off the end has no meaningful calendar date left
  to be re-filed by, so honouring rule 4 there would strand it on the old dates
  and re-file it onto whatever unrelated Stop happens to cover them — a worse
  outcome than un-slotting, and harder to undo. ADR 0055 weighed that and
  closed it. **The reason to reopen is a concrete case where un-slotting on a
  whole-Stop move actually loses information — not a consistency argument,
  which the ADR has already answered.**
- **Fixing it surfaced a fidelity bug in Undo, fixed in `ccdc747`.** Because a
  re-file leaves the Item's *date* untouched, the date pre-image alone cannot
  reverse one — the owning Stop is the only thing that moved, so an undo would
  have restored the dates and left the Cost on the new Stop's Budget line. The
  shift now reports the Stop it moved the Item *off* alongside the one it moved
  it *onto*, threaded `ItemShift` → `PayloadShiftResult` → the client undo
  payload → `restoreStops`, which writes that owner back. This was in neither
  the entry, the ADR's first draft, nor the plan; it was found in review and
  the scope expansion was authorised by the operator mid-task.
- **A known limitation was accepted with it** — `firmUpTrip`'s
  non-transactional flowed-date loop. See *Known limitations accepted on
  2026-09-21*, and ADR 0055's Consequences.

### CD-04 · The intraday zone flip can still produce two Digests — P2

- **What it is:** `app/api/cron/digest/route.ts:202-212` resolves the elected
  zone fresh per run from `zoneByUser`, with no caching, and the ledger key
  (`localDate`, `slot`) carries no zone — `dispatchDigest({ userId, tripId, localDate, slot, zone })`
  at `route.ts:239` passes `zone` for delivery only. Recorded in ADR 0050's
  Consequences (`docs/adr/0050-...md:100-113`).
- **Option (a):** cache the elected zone per person per local day, so a mid-day
  zone flip (home laptop opened, then the travelling phone picked back up, both
  inside one UTC day) cannot produce two different `(localDate, slot)` pairs.
  **Cost:** a new piece of state that must be invalidated correctly at the day
  boundary.
- **Option (b):** put the elected zone into the ledger key itself. **Cost:**
  simpler per run, but a person who legitimately changes zone mid-day can still
  receive two Digests — one keyed to each zone — rather than being deduplicated
  by person.
- **ADR 0050 left this open deliberately,** calling it "the exact harm decision
  1 exists to prevent, in miniature" — narrower than the already-closed
  two-Devices-in-two-zones case because it needs a live zone handoff mid-day, not
  merely owning Devices in two places.
- **Effort if built:** M.
- **Closed:** `ba5a3eb`, 2026-09-21 (close-out task 4). Decision: **ADR 0054**.
- **⚠ Neither listed option shipped, and this entry's framing of the choice was
  the problem.** Option (b) — put the elected zone into the ledger key — was
  rejected outright: it is the only option needing a migration, and it
  *legalises* the harm rather than fixing it, because a person who changes zone
  mid-day still receives two Digests, one keyed to each zone. It deduplicates
  rows, not people, and ADR 0050 is about people. Option (a) — cache the
  elected zone per person per local day — would work, but the state it
  introduces is circular: the local day you would invalidate the cache on is
  itself derived from the zone being cached.
- **What shipped: an 18-hour per-person cooldown on the ledger's existing
  `createdAt`** — no new state, no new column, **no migration**. Before
  claiming a ledger row, `dispatchDigest` checks for an existing
  `DigestDispatch` for the same `(userId, tripId, slot)` with `createdAt`
  inside the last 18 hours and skips the dispatch if one exists, whatever
  `localDate` the freshly-elected zone produced. `DigestDispatch` already
  carried `createdAt @default(now())`, so the question was answerable from rows
  that already existed.
- **Why 18 hours, re-derived against the cron table during review:** two
  consecutive same-slot Digests for a stationary person are ~24h apart and the
  slot windows are three hours wide, so the tightest legitimate gap is ~22h —
  18h clears it with four hours of margin while staying well short of a day.
  `slot` is in the `where` clause, so MORNING and EVENING (10–14h apart) cannot
  suppress each other. The early return happens while `claimed` is still false,
  so no dangling claim is left behind. The existing `@@unique` constraint is
  unchanged and still guards two overlapping runs against double-claiming an
  identical key; the cooldown is the wider net for the case where the key
  itself moves.
- **Deferred minors:** no test asserts the cooldown `findFirst`'s `where`
  *shape* (keyed on `slot` **without** `localDate`, which is the whole point),
  and the query has no covering index. Both under *Deferred minors from the
  2026-09-21 close-out*.

### CD-06 · The heartbeat proves the route ran, not that Digests were delivered — P2

- **What it is:** `app/api/cron/digest/route.ts:139-156` stamps
  `cronHeartbeat.upsert` immediately after the VAPID-config bail and *before* the
  try block at `:166` that does the subscription scan and per-trip dispatch. A
  throw inside that scan leaves the heartbeat freshly stamped while zero Digests
  went out, and Account reads "healthy" via
  `DispatcherHealth`/`getDispatcherHealth`.
- **Option (a):** copy-only — reword the Account text so "Digest service — last
  ran Xh ago" does not imply delivery succeeded. **Cost:** same-day fix, but it
  only manages expectations; the blind spot stays.
- **Option (b):** add a second signal — stamp a "last successful dispatch"
  timestamp separately from "last authorized run", so a scan-level failure after
  the heartbeat write is distinguishable from a healthy quiet day. **Cost:** a
  schema/field addition, and therefore a migration.
- **Only (b) closes the gap.**
- **Effort if built:** S (a) / M (b).
- **Closed:** `11fb9ba`, `5b62455`, 2026-09-21 (close-out task 3).
- **What shipped: option (b)** — the one this entry already said was the only
  one that closes the gap. `CronHeartbeat` gains a nullable `lastSuccessAt`,
  and `isDispatcherUnhealthy(lastRunAt, lastSuccessAt, now)` — pure arithmetic,
  `now` passed in — reports unhealthy when *either* timestamp is stale. A throw
  inside the subscription scan after the heartbeat write therefore no longer
  reads "healthy" on Account. This is the one decision of the five that shipped
  as its entry predicted.
- **⚠ The migration `20260921000000_cron_heartbeat_last_success` is written but
  NOT applied.** See *Migration state*.
- **Operator ruling taken during the review loop:** `isDispatcherUnhealthy`
  keeps *null means unhealthy*, and the false alarm that would otherwise follow
  the migration is handled by **backfilling `lastSuccessAt = lastRunAt` inside
  the migration** rather than by softening the null case. `5b62455` added that
  backfill and fixed an Account-page test that had been silently flipped.
- **A known limitation was accepted with it** — a brand-new `CronHeartbeat`
  row reads unhealthy until its first scan completes. See *Known limitations
  accepted on 2026-09-21*.

### CD-07 · The Digest's 2-line Checklist cap drops lines silently — P2

- **What it is:** `lib/digest.ts:88` — `DIGEST_MAX_CHECKLIST_LINES = 2`;
  `lib/digest.ts:168` — `input.checklist.slice(0, 2)` drops anything beyond the
  first two. The `+N more` tail (`lib/digest.ts:186-189`) fires only off the
  *global* `DIGEST_MAX_LINES` cap and has no visibility into what was already
  dropped before `lines` was assembled. Five overdue Checklist items render as
  exactly two, with no "+3 more" anywhere.
- **Option (a):** an honest `+N more` specifically for the Checklist section.
  **Cost:** keeps the 2-line budget that protects the schedule/reminders/payments
  lines above it, but the extra line itself competes for the global
  `DIGEST_MAX_LINES` budget.
- **Option (b):** raise or remove the per-section Checklist cap. **Cost:** more
  honest per item, but Checklist items persist until done and reappear nightly
  (`CONTEXT.md`), so a long-overdue list could crowd out the
  schedule/reminders/payments content that `lib/digest.ts:141-152` says must
  survive truncation first.
- **Either way, `CD-16` lands with it** — `CONTEXT.md`'s **Digest** entry is
  already inaccurate about this and must be updated to whatever is chosen.
- **Effort if built:** S.
- **Closed:** `ac44282`, 2026-09-21 (close-out task 5). **`CD-16` landed in the
  same commit**, as this entry required.
- **What shipped: option (a)** — an honest tail, with the 2-line budget kept.
  `collectLines` accumulates a `droppedCount` in the EVENING branch *before*
  slicing to `DIGEST_MAX_CHECKLIST_LINES`, and `buildDigest` computes
  `overflow = Math.max(0, lines.length - DIGEST_MAX_LINES) + droppedCount`,
  emitting a **single** `+N more` line that combines both causes rather than
  two competing tails. The per-section cap that protects the
  schedule/reminders/payments lines is unchanged.
- **Verified in review:** the two overflow sources are disjoint sets, so
  nothing is double-counted; the boundary arithmetic was checked by hand in all
  four cases; and `droppedCount` only increments in the EVENING branch, so
  MORNING cannot grow a phantom tail.

### CB-01 · The `expectAccessCheckedBeforeWrite` rollout skipped the `FOR UPDATE` write paths, and the recorded reason for skipping them was false

- **Source:** none — found on 2026-09-21 on branch
  `chore/close-the-open-backlog`, while trying to write down a deferred minor's
  claim. **Added and closed the same day.**
- **What it was:** `RM-16`'s rollout of `expectAccessCheckedBeforeWrite`, and
  `CD-01`'s follow-up, left out the entry points that take the ADR 0007
  full-plan `FOR UPDATE` lock. This document recorded, as a deferred minor,
  that the skip was "correct, but never written down" and asked for a comment
  explaining it.
- **⚠ There was nothing correct to write down.** Three independent checks
  disproved it: `lockPlanStopsTx`'s own doc comment claims only deadlock
  avoidance and makes no access-control claim; **every** caller runs its own
  `requireTripAccess`/`requireStopAccess` *before* opening the transaction that
  takes the lock; and a mutation test — `moveStop`'s access check moved to
  after its write — made the helper fail exactly as designed ("expected the
  access guard to run before the write, but it ran after (guard #74,
  write #71)"), proving the helper **does** catch the bug class here. The
  rollout was incomplete, not principled. The agent asked to write the comment
  refused to invent a rationale and reported the contradiction instead, which
  is how this became an item.
- **Fix:** finish the rollout, and record in `lockPlanStopsTx`'s doc comment
  that there is **no** exemption.
- **Category:** test-coverage · **Effort:** S
- **Closed:** `898f1b0`, 2026-09-21 (close-out task 13, added mid-flight on an
  operator ruling).
- **What shipped:** all seven locked write-path entry points now carry the
  assertion — `moveStop`, `setStopDates` (covering `applyStopDates`),
  `createStop`'s locked insert path, `reorderStops`, `restoreStops`,
  `reorderChapters` and `reorderTransports`. Six needed a new test; the
  seventh, `reorderTransports`, **was already covered** by
  `server/actions/transport.test.ts:1319` in a test that predates all of this
  work. `lockPlanStopsTx`'s doc comment now states that the lock carries no
  access-control meaning and that each caller is covered like any other entry
  point. The helper itself was not modified, no entry point resisted the
  rollout, and **no access-control bug was found** — this closed a coverage
  hole, not a vulnerability.
- **A scope line was wrong in the *other* direction, which is new.** Every
  previously recorded scope error in this document was an *under*count. This
  one was an overcount: a list of seven sites needing work, one of which was
  already done. See the trust statement.
- **Deferred minor:** `setStopNights` has no assertion of its own; it delegates
  to `applyStopDates` through the same guarded path as `setStopDates`, which is
  covered. Disclosed as a judgement call rather than silently decided.

## Closed by the 2026-09-21 sweep

**39 items**, closed on branch `chore/follow-ups-triage-and-sweep` between
`bf281d6` and `28e933a`. Each entry below is reproduced whole — its original
evidence text as it stood in *Open items*, plus the commit that closed it. The
evidence is kept rather than summarised because this register is the record of
*what was fixed*, and a future reader checking whether a regression is the same
bug needs the original description, not a one-line gloss.

Two of these entries understated their own blast radius and say so inline:
`AB-02` (three pages, not two) and `HG-02`/`HG-10` (three cards, not two — and,
per the final review's correction inline, a fourth survives unfixed). A third
entry, `CD-10`, briefly carried the same kind of note but it was itself wrong
and has been corrected inline — see `CD-10`'s entry. See the warning in the
trust statement.

**Two struck entries also overclaimed what their fix achieved — not a scope
miss, a behaviour miss.** `FP-06` (the described behaviour is unchanged; the
fix built a passthrough no caller uses) and `HG-02`/`HG-10` (three of at least
four confusable instances were fixed; **the fourth was closed later the same
day** as `SW-02`'s confusable instance, `7fcef35`) are corrected inline. A
struck entry's title is not a guarantee; read its annotations.

The 40th planned item, `FP-07`, was **not** closed by the sweep — it was parked
on an operator decision. That decision was taken on 2026-09-21: it was
**declined**, and it now sits in *Settled — do not re-raise*.

### HG-12 · `duplicateTrip` checks membership but never role — any Traveller can mint themselves a fully-owned copy of the trip

- **Source:** `HG` (`docs/follow-ups/2026-09-15-help-guide-audit.md:665`, "Parked")
- **ESCALATED:** yes. Filed in a *Parked* section, but it is an authorization
  gap, not polish — settled calls stay settled except for security,
  authorization, data-loss, or data-corruption issues, and this is the first of
  those. It leads this document.
- **Evidence:** `server/actions/trips.ts:310-314` — `duplicateTrip` opens with
  `const { user } = await requireTripAccess(sourceTripId);`.
  `requireTripAccess` (`lib/guards.ts:57-68`) only confirms **membership**
  (`notFound()` if `!membership`); it returns `{ user, membership }` but
  `duplicateTrip` destructures only `user` and never reads `membership.role`.
  The body was read in full (lines 310-416) — there is no equivalent check
  anywhere in it.
- **Why it is real:** the only thing making Duplicate owner-only today is a
  *rendering* gate. `app/(app)/trips/[tripId]/settings/page.tsx:33-34,219-229`
  computes `canManageTrip = isOwner || isAdminEmail(user.email)` and wraps
  `<DuplicateTripDialog>` in `{canManageTrip && (...)}`. The server action is
  directly callable regardless. Any authenticated member of a trip can invoke it
  and create a full copy — chapters, stops, items, transports, checklist items
  and all member rows — with themselves as the new trip's owner.
- **Against the app's own stated model:** ADR 0045
  (`docs/adr/0045-admin-delete-scoped-to-membership.md`) documents that Duplicate
  and Delete are both intended to be owner-or-admin gated ("The same check gates
  the Danger zone card on the Trip settings page, which carries Duplicate as well
  as Delete"). So this is an omission against a decided model, not an unmade
  decision.
- **Fix:** add the guard `deleteTrip` already uses in the same file
  (`server/actions/trips.ts:257-259`,
  `membership.role !== "owner" && !isAdminEmail(user.email)`) to `duplicateTrip`,
  before it reads `source`.
- **Not fixed since:** `git log` on `server/actions/trips.ts` shows the most
  recent touch is `c298da0`, which added the `isAdminEmail` bypass to
  `deleteTrip` only; `duplicateTrip`'s body is unchanged since `b967ece`.
- **Category:** mechanical · **Effort:** S
- **Closed:** `bf281d6`, 2026-09-21 (sweep task 1).

### AB-01 · `forkId` is never threaded through the standalone `CostEditor`, so a cost added on a fork lands on the real plan

- **Source:** `AB` (Worth doing soon, bullet 1)
- **Evidence:** `components/trip/cost-editor.tsx` — `CostEditorProps` has no
  `forkId` field (only `tripId`, `ownerType`, `ownerId`, `costs`,
  `homeCurrency`, `defaultCurrency`), and the create call at line 282 is
  `createCost(tripId, input)` with no third argument.
  `server/actions/costs.ts:117-120` shows `createCost(tripId, data, forkId?: PlanId)`
  does accept a fork id and stores it (`forkId: forkId ?? null`, line 162) — the
  server-side plumbing exists, nothing supplies it.
- **Call sites:** `components/trip/accommodation-card.tsx:173`,
  `components/trip/item-card.tsx:242`, `components/trip/transport-card.tsx:215`
  all render `CostEditor` without a `forkId`, even though
  `app/(app)/trips/[tripId]/plan/page.tsx:46,384` already computes
  `activeForkId` and threads it into the `ItineraryManager` that renders those
  cards.
- **Not covered by the earlier fix:** `docs/things-to-fix.md` P1-2 (Budget page
  fork-awareness, `**Status: FIXED**`, `5f51406`+`dec4efb`) scoped the Budget
  page's queries and the `OtherCostEditor` mitigation only.
- **Symptom:** adding a cost via the per-entity `CostEditor` on a fork-active
  Plan page files the cost on the real plan with an `ownerId` pointing at a
  fork-owned entity.
- **Category:** mechanical · **Effort:** S
- **Closed:** `3ecd12d`, 2026-09-21 (sweep task 2).

### OPS-08 · `docs/DEPLOY.md` §4b warns only about renames breaking reads — it does not name the write-path hazard that actually occurred

- **Source:** `OPS` (carried forward from `CP`'s "Not verifiable without a
  database" note, which `docs/things-to-fix.md` P0-3 turned into a procedure)
- **Evidence:** `vercel.json:4` —
  `"buildCommand": "if [ \"$VERCEL_ENV\" = \"production\" ]; then prisma migrate deploy; fi && next build"`
  — one build step runs the migration and the build back-to-back with no gate
  between them, so a migration is live against the *old* build for the length of
  the build. That pipeline shape is an accepted tradeoff of Vercel's Hobby tier,
  documented not accidental; there is no code fix here.
- **What is owed:** `docs/DEPLOY.md:74` §4b is titled and scoped around column
  *renames* breaking *reads*. Two other SQL shapes produce the same gap on
  *writes*: **adding a NOT NULL column with no default**, and **dropping a unique
  constraint that an older client's `upsert` needs as its `ON CONFLICT` target**.
  The `share_links_per_audience` migration was an actual instance of both — see
  the worked example in *Blocked → Migration history* below.
- **Fix:** widen §4b's scope, or add a sibling section, naming those two
  patterns explicitly with `share_links_per_audience` as the worked example, so
  the next person writing a migration checks their SQL against the write-path
  failure mode as well as the read-path one.
- **Category:** docs · **Effort:** S
- **Closed:** `2c25792, 0398371, c6a1c83`, 2026-09-21 (sweep task 3).

### AB-02 · `?plan=a&plan=b` (a repeated query param) 500s the Plan and Budget pages

- **Source:** `AB` (Worth doing soon, bullet 2)
- **Evidence:** `app/(app)/trips/[tripId]/plan/page.tsx:34-46` and
  `app/(app)/trips/[tripId]/budget/page.tsx:67-76` both do
  `const { plan } = await searchParams; const selectedForkId = plan ?? null;`
  then hand `selectedForkId` straight to `db.fork.findFirst({ where: { id: selectedForkId, tripId } })`.
  `grep -n 'Array.isArray'` returns nothing in either file. The TS signature
  `searchParams: Promise<{ plan?: string }>` is a compile-time claim only —
  Next.js hands a `string[]` at runtime for a repeated param.
- **Fix:** normalise with `Array.isArray(plan) ? plan[0] : plan` in both files.
- **Scope note:** auth-guarded first (`requireTripAccess` runs before the
  query), so this is a crafted-URL edge case, not a normal user path.
- **Category:** mechanical · **Effort:** S
- **Scope correction made while fixing:** the source doc named two pages; there
  were **three**. `app/(app)/trips/[tripId]/wishlist/page.tsx` carried the
  identical defect and was fixed in the same task (`e4b5a21`). All three now
  call the shared `firstSearchParam` helper (`lib/plan-scope.ts:23`), and
  `budget-page.test.tsx` pins it against a revert to `plan ?? null`.
- **Closed:** `5b83206, e4b5a21, ac963af`, 2026-09-21 (sweep task 4).

### AB-03 · `assertForkingAllowed` gates on UTC `todayISO()` while the fork switcher is zone-aware

- **Source:** `AB` (Worth doing soon, bullet 3)
- **Evidence:** `server/actions/forks.ts:67-68,729-730` — both
  `assertForkingAllowed` call sites compute phase with `today: todayISO()`
  (UTC calendar day, from `@/lib/dates`).
  `app/(app)/trips/[tripId]/layout.tsx:5,81,89` computes `showForkSwitcher` from
  `todayISOInZone(currentTripTimezone(trip.stops))`. The two disagree on what
  "today" is.
- **Symptom:** a narrow west-of-UTC window where the switcher renders but
  create/promote cleanly rejects. Fails closed, so not a correctness regression
   — but the drift is real.
- **Category:** mechanical · **Effort:** S
- **Closed:** `ba98bec`, 2026-09-21 (sweep task 5).

### AB-04 · Three inline `paidAt` schemas skip `isRealCalendarDate` and hardcode the amount cap

- **Source:** `AB` (Worth doing soon, bullet 4)
- **Evidence:** `lib/validations/transport.ts:95-98`,
  `lib/validations/item.ts:100-103`, `lib/validations/accommodation.ts:71-74`
  all define `paidAt` with only `.regex(/^\d{4}-\d{2}-\d{2}$/, "paidAt must be YYYY-MM-DD")`
  — no `isRealCalendarDate` refine (that helper lives at
  `lib/validations/cost.ts:21` and is used only there). The same three files
  hardcode `.max(2_147_483_647, "Amount is too large")` at `transport.ts:72,90`,
  `item.ts:77,95`, `accommodation.ts:48,66` instead of importing
  `MAX_AMOUNT_MINOR` from `lib/validations/cost.ts:10`.
- **Symptom:** `"2026-02-30"` still passes the shape check and silently rolls
  forward.
- **Scope note:** reachable only by hand-crafted action payloads.
- **Category:** mechanical · **Effort:** S
- **Blast radius undercounted — corrected on final review.** The commit
  correctly shared `paidAtDateOnlySchema` and `MAX_AMOUNT_MINOR` across the
  three named files, but `isRealCalendarDate` itself stays private to
  `lib/validations/cost.ts:21`, and the same regex-only pattern (`"2026-02-30"`
  passes) survives at roughly ten more sites, including two in the very files
  this commit touched: `lib/validations/accommodation.ts:9` and
  `lib/validations/item.ts:10` — both four lines below the new
  `paidAtDateOnlySchema` import, defining a *different*, unrefined `isoDate`
  used for non-`paidAt` date fields in the same files. Also
  `lib/validations/stop.ts:3` (Stop dates drive the Timeline, chapter spans and
  the Digest), `lib/validations/trip.ts:6`, `lib/validations/checklist.ts:7`,
  `server/actions/items.ts:458` (`scheduleDateSchema`), and a hand-rolled regex
  check at `server/actions/trips.ts:216` (`setTripHardEndDate`). This entry's
  fix closed the three sites it named; it did not close the pattern.
- **Closed:** `a202714`, 2026-09-21 (sweep task 6).

### FN-07 · A failed `removeFromQueue` write leaves a "discarded" Feedback note re-appearing forever

- **Source:** `FN` (`:49-51`)
- **Evidence:** `lib/feedback-queue.ts:61-67` — `write()` catches a
  `localStorage.setItem` failure (quota, private mode) and silently returns
  `readQueue()`, i.e. the write did not happen, with no signal to the caller.
  `lib/feedback-queue.ts:134` — `flushQueue` calls
  `removeFromQueue(note.clientKey)` and ignores its return value entirely;
  line 135 unconditionally pushes to `discarded` on a `rejected` outcome
  regardless of whether the removal persisted.
- **Symptom:** with storage full or blocked, the note stays queued, so the next
  flush attempts it, discards it, and shows the "discarded" toast again — every
  time, forever.
- **Fix:** have `flushQueue` check that the queue `removeFromQueue` returns
  genuinely lacks the `clientKey` before trusting the discard, or have
  `write`/`removeFromQueue` report failure explicitly.
- **Category:** mechanical · **Effort:** S
- **Closed:** `248a12f, a96e537`, 2026-09-21 (sweep task 7).

### FN-11 · The in-app Feedback-note delete path is still untested

- **Source:** `FN` (`:62-63`)
- **Evidence:** half of this item has since closed —
  `components/feedback/feedback-launcher.test.tsx:811-829` now covers the
  DONE/WONTFIX de-emphasis. The delete path has not: `deleteMock` (aliased to
  `deleteFeedbackNote`) is imported at line 24 and never invoked or asserted
  anywhere in the file. Existing tests only assert the Delete button *renders*
  when `canDelete` (e.g. line 500). `server/actions/feedback.test.ts:165-192`
  still covers only the server-action layer.
- **Scope for the fix:** narrowly, "click Delete → `deleteFeedbackNote` called,
  note removed from the list."
- **Category:** test-coverage · **Effort:** S
- **Closed:** `ac98a0e`, 2026-09-21 (sweep task 8).

### FP-10 · A module-level `MediaQueryList` cache is shared across tests that leave `matchMedia` unstubbed

- **Source:** `FP` (`:68`)
- **Evidence:** `components/feedback/feedback-launcher.test.tsx:109-128` — the
  `beforeEach` resets `localStorage`, pathname, online state and the list/create
  mocks, but not `cachedDockedMql`/`cachedMatchMediaFn`
  (`components/feedback/feedback-launcher.tsx:90-91`). No cache reset exists
  anywhere in the file.
- **Note:** harmless today (the default stub always reports `matches: false` and
  nothing asserts identity); a trap for the next test added.
- **Category:** test-coverage · **Effort:** S
- **Closed:** `ac98a0e`, 2026-09-21 (sweep task 8).

### FP-11 · `stubViewport` discards the query string it is handed

- **Source:** `FP` (`:75`)
- **Evidence:** `components/feedback/feedback-launcher.test.tsx:72-92` —
  `stubViewport(dockedFromMd: boolean)` stubs `window.matchMedia` as `(() => mql)`,
  ignoring the query. A typo in `DOCKED_FROM`
  (`components/feedback/feedback-launcher.tsx:75`, `"(min-width: 768px)"`), or
  drift from `components/ui/sheet.tsx:41-43`'s `md:` classes or
  `components/trip/calendar-views.tsx:48`'s duplicated literal, would still pass
  every test.
- **Note:** pre-existing, not introduced by the branch that produced the source
  doc.
- **Category:** test-coverage · **Effort:** S
- **Closed:** `ac98a0e`, 2026-09-21 (sweep task 8).

### HG-09 · `GUIDE_UI_STRINGS` is a substring guard, and it has already let a real misquote through

- **Source:** `HG` (`docs/follow-ups/2026-09-15-help-guide-audit.md:648`, "Parked")
- **Evidence:** `lib/help-guide.test.ts:182-188` — the guard is
  `it.each(GUIDE_UI_STRINGS)(...)` checking
  `sources.some((s) => s.text.includes(label) || s.text.includes(curly))`, a
  substring test. `lib/help-guide.ts:205-230` lists `GUIDE_UI_STRINGS` including
  `"Booking reference"`, itself a substring of the longer live string
  `"Booking reference / number"` also in the same list — so those entries are
  unfailable by construction.
- **Demonstrated miss, not a theoretical gap:** per the source doc's own "Note
  on the drift guard" (lines 621-627), correction C6 passed this guard while the
  guide misquoted the banner, because `"Editing variant"` passed as a substring
  of the true label.
- **Judged out of its parked bucket** on that demonstrated miss — a coverage
  gap that has already failed to catch a shipped defect is not polish.
- **Category:** test-coverage · **Effort:** M
- **A premise in the plan was wrong and was corrected in review:** the brief
  claimed `"Booking reference"` was redundant with `"Booking reference / number"`.
  They are two distinct fields (`item-form-dialog.tsx:512` vs
  `transport-form-dialog.tsx:556`), each quoted separately by the guide, so
  deleting the short entry lost real coverage. It was restored and the shadowing
  rule now means true redundancy, not mere text containment (`f69a5cf`).
- **Closed:** `7f764c4, f69a5cf`, 2026-09-21 (sweep task 9).

### CD-01 · Five mutating actions have tests that never assert their access guard

- **Source:** `CD` (`docs/follow-ups/2026-09-20-changeover-day-and-digest-follow-ups.md:25-40`)
- **Evidence:** `server/actions/chapters.test.ts`, `stops.test.ts`,
  `firm-up-trip.test.ts`, `cover.test.ts`, `activity.test.ts` each mock
  `requireTripAccess` but none import or call `expectAccessCheckedBeforeWrite`.
  `grep -n 'expectAccessCheckedBeforeWrite' server/actions/*.test.ts` lists 11
  other action test files using the helper; these five are absent.
  `test/helpers/access-order.ts` exists and exports it.
- **Not a live vulnerability:** the production actions do guard correctly. This
  is the coverage hole that would let a guard silently move below its write.
- **Fix:** add the assertion calls to the five files. No new infrastructure.
- **Category:** test-coverage · **Effort:** S
- **Evidence undercounted — corrected on final review.** Seven more action test
  files mock a guard from `@/lib/guards` and never call
  `expectAccessCheckedBeforeWrite`: `server/actions/ai.test.ts`,
  `server/actions/forks.test.ts`, `server/actions/devices.test.ts`,
  `server/actions/globe.test.ts`, `server/actions/search.test.ts`,
  `server/actions/push.test.ts` and `server/actions/feedback.test.ts`. Most
  consequential: `forks.test.ts` covers `promoteFork` (rewrites the real plan
  wholesale) and `discardFork`, and `feedback.test.ts` covers
  `deleteFeedbackNote`. This entry's fix closed the five files it named; the
  coverage hole it describes is wider.
- **Closed:** `68d1bb9`, 2026-09-21 (sweep task 10).

### CD-10 · Three uncovered edge cases in the Digest dispatch path

- **Source:** `CD` (`:110-115`)
- **Evidence (three distinct gaps):**
  1. **Zone tie-break untested.** The documented first-row-wins tie-break is at
     `app/api/cron/digest/route.ts:202-212` (comment at `:196-201` describes the
     `>` strict-inequality behaviour). `route.test.ts`'s two zone-election tests
     (`:585`, `:610`) both use *distinct* `lastSeenAt` values; nothing passes two
     Devices with an identical `lastSeenAt`.
  2. **`slot` omitted from `console.error` assertions.**
     `lib/digest-dispatch.ts:627-630` and `:683-686` both include `slot` in the
     logged object, but the assertions at `lib/digest-dispatch.test.ts:314-317`
     and `:498-501` use `expect.objectContaining({ userId, tripId, localDate })`
     with no `slot` key — dropping `slot` from the real payload would fail
     neither test.
  3. **No compound throw + release-failure test.** `digest-dispatch.test.ts`
     covers a mid-flight throw releasing the claim (`:323`, `:343`, `:354`) and a
     release delete failing (`:296`, `:485`) separately, never both at once.
- **File-citation correction for whoever picks this up:** the tie-break logic is
  in `app/api/cron/digest/route.ts`, not `lib/digest-dispatch.ts` as the source
  doc says. The other two gaps are where the doc cites them.
- **Category:** test-coverage · **Effort:** M
- **The "scope correction" below was itself wrong — corrected on final
  review.** It claimed pinning `slot` uncovered a second, previously-unnamed
  `console.error` log site, "the entry named one." That is false: Evidence §2
  above, as this entry was originally written, already names **both**
  `lib/digest-dispatch.ts:627-630` and `:683-686`. Nothing was undercounted
  here — both sites were pinned because both were always in scope. Only **two**
  of this document's three advertised blast-radius undercounts (in the trust
  statement and in the struck-register preamble) are real; this was never one
  of them.
- **Closed:** `7147ec3`, 2026-09-21 (sweep task 11).

### CD-13 · `cron-health.ts`'s crash path has a unit test but no page-level regression test

- **Source:** `CD` (`:123-125`)
- **Evidence:** `server/actions/cron-health.test.ts:91-99` unit-tests
  `getDispatcherHealth` against a rejected `findUnique`.
  `app/(app)/account/page.test.tsx`'s `beforeEach` (`:38-43`) only ever sets
  `cronHeartbeatFindUniqueMock.mockResolvedValue(null)`; no test makes it
  reject, so nothing asserts at page level that `Promise.all` in `AccountPage`
  survives a `CronHeartbeat` read failure without taking the Device list down
  with it.
- **Sufficient by construction today** (the error is swallowed inside
  `getDispatcherHealth` before the promise resolves), but unpinned — a future
  refactor could reintroduce the throw with no test catching it.
- **Category:** test-coverage · **Effort:** S
- **Closed:** `b686518`, 2026-09-21 (sweep task 12).

### CD-14 · `formatLastRun`'s "just now" and singular "1 hour ago" branches are untested

- **Source:** `CD` (`:126-127`)
- **Evidence:** `lib/cron-health.ts:36-48` has three return branches beyond the
  stale-date one: `hours >= 1` plural, the implicit singular `hours === 1`, and
  the `hours < 1` fallback ("last ran just now").
  `lib/cron-health.test.ts:30-42` tests only `null`, the stale-date branch, and
  one plural case.
- **Category:** test-coverage · **Effort:** S
- **Closed:** `b686518`, 2026-09-21 (sweep task 12).

### CP-17 · `cost-amounts.tsx` gates labels on `paidTotalMinor > 0` instead of a null check

- **Source:** `CP` (`docs/follow-ups/2026-08-12-cost-paid-remodel.md:74-75`,
  originally "Accept / low value"; promoted into `docs/things-to-fix.md` P3-4)
- **Also filed as:** `OPS-05` — the same defect reached from the
  `things-to-fix.md` side. One fix closes both.
- **Evidence:** `components/trip/cost-amounts.tsx:33` and `:38` both still use
  `paidTotalMinor > 0`, a truthiness gate, not a null check.
- **Why it is here and not in *Blocked*:** `docs/things-to-fix.md` filed P3-4
  under its blanket "needs prod DB / running app / condition not met" template,
  but no database is involved — the blocker was only that the triggering
  condition (a per-cost value reaching this component) has not arisen. All 8
  `CostAmounts` call sites (`app/(app)/trips/[tripId]/budget/page.tsx` and
  `.../summary/page.tsx`) still pass aggregates only. The gate is directly
  readable, so it belongs in the ordinary sweep.
- **Fix:** swap the truthiness gate for an explicit null check.
- **Category:** mechanical · **Effort:** S
- **What the fix changed — read this before looking for a visible difference:**
  it changed the **component's contract**, not what either page renders today.
  `CostAmounts`'s `paidTotalMinor` prop now admits `null`, and all 8 aggregate
  call sites on the Budget and Summary pages pass `sum > 0 ? sum : null`,
  reproducing today's `—` placeholder exactly wherever the aggregate is zero.
  The fix is real and closes both `CP-17` and `OPS-05`, but it is not a visible
  change on either page — it protects the next caller with a genuine
  zero-but-paid value, which nothing currently supplies.
- **Closed:** `cdc32d4`, 2026-09-21 (sweep task 13).

### OPS-05 · `cost-amounts.tsx` truthiness gate, reached from the `things-to-fix.md` side

- **Source:** `OPS` (`docs/things-to-fix.md:657-663`, P3-4)
- **Same defect as `CP-17` above** — kept as its own ID because the two triage
  passes found it independently, from the follow-up doc and from the audit doc.
  Fix once; strike both. Full evidence and the reclassification rationale are
  under `CP-17`.
- **Category:** mechanical · **Effort:** S
- **Same commit as `CP-17`.** See the contract note under `CP-17` above: the fix
  is to the component's contract, not to anything either page renders today.
- **Closed:** `cdc32d4`, 2026-09-21 (sweep task 13).

### FN-06 · `feedback-resolve.ts` prints the target database *after* the lookup

- **Source:** `FN` (`:46-48`)
- **Evidence:** `scripts/feedback-resolve.ts:55` —
  `const existing = await db.feedbackNote.findUnique(...)`; the
  `console.log(\`Database: ${targetHost()}\`)` echo is at line 70. A mistyped id
  exits at the not-found check between them, before the operator is ever told
  which database was consulted.
- **Fix:** move the `Database:` echo above the `findUnique` call.
- **Category:** mechanical · **Effort:** S
- **Closed:** `5d50c82`, 2026-09-21 (sweep task 14).

### FN-12 · The row → `InboxNote` mapping in `feedback-pull.ts` is inline and untested

- **Source:** `FN` (`:64-67`)
- **Evidence:** `scripts/feedback-pull.ts:62-75` — the `rows.map((row) => ({...}))`
  mapping is written inline in the script, not extracted. No test file exists for
  it.
- **Fix:** extract the row→`InboxNote` shape function into `lib/feedback-inbox.ts`
  (which already exists and holds `renderInbox`) and add a field-mapping unit
  test.
- **Category:** test-coverage · **Effort:** S
- **Closed:** `5d50c82`, 2026-09-21 (sweep task 14).

### FN-04 · `authorId` is shipped to the browser purely to gate the delete control

- **Source:** `FN` (`:35-37`)
- **Evidence:** `server/actions/feedback.ts:17-27` — `FeedbackNoteView` still
  includes `authorId: string`.
  `components/feedback/feedback-launcher.tsx:591-593` — the only client use is
  `canDelete: currentUserId !== undefined && entry.note.authorId === currentUserId`.
- **More consequential than when filed:** since ADR 0046 (see the struck
  `FN-03`), an Admin's client now receives other Travellers' real `authorId`s
  alongside their notes.
- **Fix:** replace raw `authorId` in `FeedbackNoteView` with a server-computed
  `canDelete: boolean`.
- **Category:** mechanical · **Effort:** S
- **Closed:** `5d217e9`, 2026-09-21 (sweep task 15).

### FN-08 · A discarded Feedback note's text is shown but not recoverable

- **Source:** `FN` (`:52-54`)
- **Evidence:** `components/feedback/feedback-launcher.tsx:332-337` — the
  discarded-note toast description is `result.discarded[0].body.slice(0, 120)`,
  plain text with no action to restore it; `bodyRef`/`setBody` are not wired to
  the toast.
- **Fix:** add a toast action calling `setBody(result.discarded[0].body)` and
  focusing `bodyRef`.
- **Category:** mechanical · **Effort:** S
- **Closed:** `5d217e9`, 2026-09-21 (sweep task 15).

### FN-09 · The near-limit character counter is conditionally mounted, unlike the journal editor's

- **Source:** `FN` (`:55-58`)
- **Evidence:** `components/feedback/feedback-launcher.tsx:619-621` —
  `{body.length >= COUNT_FROM ? (<p role="status" aria-live="polite"> ... ) : null}`.
  `components/trip/journal-editor.tsx:227-230` documents the opposite as
  deliberate: "always mounted, stable position."
- **Fix:** mount the `<p role="status">` unconditionally and toggle only its
  text, matching the journal editor's pattern.
- **Category:** mechanical · **Effort:** S
- **Closed:** `5d217e9`, 2026-09-21 (sweep task 15).

### FP-09 · The `onCloseAutoFocus` guard reads the last *committed* `open`

- **Source:** `FP` (`:62`)
- **Evidence:** `components/feedback/feedback-launcher.tsx:565-566` —
  `onCloseAutoFocus={(event) => { if (open) event.preventDefault(); ... }}`,
  unchanged.
- **Read this before "simplifying" it:** the source doc records both resulting
  corners as benign and jsdom-unreachable. This entry exists so the next person
  knows the shape is understood, not accidental — it is not a request to change
  the guard to a ref.
- **Category:** docs · **Effort:** N/A
- **Closed as a comment, which is what it asked for.** The entry was a request to
  record the reasoning, not to change the guard — and the guard is unchanged.
  The `onCloseAutoFocus` comment block now carries it in the code itself.
- **Closed:** `5d217e9`, 2026-09-21 (sweep task 15).

### FP-12 · `badgeFor`'s variant type is a hand-written union, not derived from `badgeVariants`

- **Source:** `FP` (`:80`)
- **Evidence:** `components/feedback/feedback-launcher.tsx:193-199` — `badgeFor`
  returns `{ label: string | null; variant: "success" | "muted" }`.
- **Deliberate today:** the source doc calls the narrow union "the better
  contract" and flagged it only in case the variant set grows. Recorded so the
  reasoning is not lost; not a request to change it now.
- **Category:** docs · **Effort:** N/A
- **Closed as a comment, which is what it asked for.** `badgeFor` still returns
  the hand-written `"success" | "muted"` union; its docblock now records why
  that narrow contract is deliberate.
- **Closed:** `5d217e9`, 2026-09-21 (sweep task 15).

### FN-10 · `docs/HANDOFF.md` says bare "note" where it means a Feedback note

- **Source:** `FN` (`:59-61`)
- **Evidence:** `docs/HANDOFF.md:401` — "`--dry-run` looks the note up and
  reports what would change without writing". `CONTEXT.md:247` defines
  **Feedback note** as the contract term.
- **Fix:** one word — "looks the Feedback note up".
- **Category:** docs · **Effort:** S
- **Closed:** `4febcfd`, 2026-09-21 (sweep task 16).

### HG-06 · `help-expand-all.tsx`'s "ONLY client component" comment is now false

- **Source:** `HG` (`:639`, "Parked")
- **Evidence:** `components/trip/help-expand-all.tsx:8-9` still reads
  "Deliberately the ONLY client component in the guide."
  `components/trip/help-hash-open.tsx:1` opens with `"use client";`, added in
  `90a9ac4`, which post-dates the comment.
- **The property the comment protects is still intact:** no client-side
  *disclosure state* is added, so `help-guide.tsx` stays a server component, and
  the guard test in `help-guide.test.tsx` ("uses no client-side disclosure
  state") still holds. Only the comment is wrong.
- **Fix:** one-line comment edit when next touching the file.
- **Category:** docs · **Effort:** S
- **Closed:** `4febcfd`, 2026-09-21 (sweep task 16).

### FP-05 · The backdrop is briefly visible during panel open/close below `md`

- **Source:** `FP` (`docs/follow-ups/2026-09-09-feedback-panel-chat-shape.md:43`)
- **Evidence:** `app/globals.css:234` — `tp-fade-in` is `150ms ease-out`;
  `app/globals.css:246` — `tp-slide-up` is `250ms cubic-bezier(...)`. The 100ms
  gap (used together below `md` in `components/ui/sheet.tsx:21-22,36`) is
  unchanged, so the dim-and-blur backdrop shows before the panel covers it.
- **Note:** the source doc calls this "arguably an improvement" (standard sheet
  feel). Recorded as still-open, not as something the doc demands fixed.
- **Category:** mechanical · **Effort:** S
- **Closed:** `14b8f6b`, 2026-09-21 (sweep task 17).

### FP-06 · Full-viewport `backdrop-blur-sm` on every mobile panel open, fully occluded

- **Source:** `FP` (`:48`)
- **Evidence:** `components/ui/sheet.tsx:21` — `SheetOverlay` renders
  `"fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm"` unconditionally when
  not `hideOverlay`; there is no overlay-className passthrough on `SheetContent`
  (`:56,62,64` expose only a boolean `hideOverlay`), so a single caller cannot
  neutralise it.
- **Note:** the performance cost claimed ("small real cost on low-end phones")
  cannot be quantified without a real device; the structural condition is
  confirmed by code alone.
- **Category:** mechanical · **Effort:** S
- **This entry overclaimed when struck — corrected on final review.** `14b8f6b`
  added `overlayClassName` to `SheetContentProps` (`components/ui/sheet.tsx:64`)
  as an escape hatch, but `SheetOverlay` at `:21` still renders
  `backdrop-blur-sm` unconditionally, and **neither production caller passes
  the new prop**: `components/feedback/feedback-launcher.tsx:531` and
  `components/trip/mobile-tab-bar.tsx:90` both call `SheetContent` with no
  `overlayClassName`. The only use of the prop anywhere in the tree is
  `components/ui/sheet.test.tsx:142`. The commit built the plumbing and no one
  plugged it in — **the described behaviour is unchanged in every shipped
  panel.** Left struck rather than reopened because the passthrough genuinely
  landed and a future caller can use it; the behaviour claim in the title is
  what was wrong.
- **Closed:** `14b8f6b`, 2026-09-21 (sweep task 17).

### FP-13 · The docked height calc has no floor

- **Source:** `FP` (`:83`)
- **Evidence:** `components/ui/sheet.tsx:42` —
  `md:h-[min(37.5rem,calc(100vh-9rem))]`, no floor clause.
- **Note:** only bites below a 144px-tall viewport at ≥768px wide; 768×400
  landscape still yields 16rem.
- **Category:** mechanical · **Effort:** S
- **Closed:** `14b8f6b`, 2026-09-21 (sweep task 17).

### HG-02 / HG-10 · The `MapPin` icon is used three ways, so the legend's specimen is ambiguous

- **Source:** `HG` (`docs/follow-ups/2026-09-15-help-guide-audit.md:579` (L3) and
  `:659` (Parked) — the parked bullet is a verbatim restatement of L3, merged
  here rather than double-counted)
- **Evidence:** the same icon appears decoratively at
  `components/trip/stop-card.tsx:337` (next to a stop's country, unconditional)
  and `components/trip/item-card.tsx:114,192` (next to an item's stop name,
  unconditional), and as the real has-a-location signal at
  `components/trip/map-link.tsx:14-25` (`MapLink` renders `null` when there is no
  location).
- **This is an app defect, not a guide defect.** The guide's legend accurately
  describes an ambiguous affordance, so editing guide text cannot fix it. The fix
  is in the UI: differentiate the decorative pin from the real map-link glyph, or
  drop the decorative use.
- **Category:** mechanical · **Effort:** M
- **Scope correction made while fixing:** the entry named two cards; there were
  **three**. `components/trip/accommodation-card.tsx` had the same decorative-pin
  -beside-a-real-`MapLink` defect and was fixed in a second round (`84d2f15`).
  The pin now means one thing in `stop-card.tsx`, `item-card.tsx` and
  `accommodation-card.tsx`.
- **This "not confusable" claim overclaimed — corrected on final review.** A
  **fourth** instance of the exact same defect survives, unfixed:
  `components/trip/home/phase-travelling.tsx:508` renders a decorative
  `<MapPin aria-hidden="true">` and `:519` renders a real `MapLink` **in the
  same flex row** — the identical side-by-side confusability this entry claims
  to have closed. It is worse than the three fixed cards: that `MapLink` is
  given an always-present `label`, and `lib/maps.ts:31` falls back to `label`
  when there is no address, so it renders a pin for *every* stop regardless of
  whether `lat`/`lng` exist — the second half of the `stop-card.tsx` fix
  (`stop-card.tsx:337-345` gates `MapLink` on `stop.lat != null && stop.lng !=
  null` for exactly this reason) was never applied here. 21 decorative
  `MapPin` render sites survive across 16 files in total — this count has now
  been corrected twice (see `SW-02`). Most — including a
  second same-shape (decorative, unconditional, no adjacent `MapLink`) case at
  `phase-sketching.tsx:77` — are not beside a `MapLink` and are genuinely not
  confusable. `phase-travelling.tsx:508` is the one exception: it *is* beside a
  `MapLink`, so it is confusable under either reading of `SW-02`'s open
  question. Full accounting is in `SW-02`, corrected alongside this entry.
  **This branch did not fix all instances of `HG-02`/`HG-10`; it fixed three of
  at least four.**
- **The fourth instance was closed later the same day.** `7fcef35` removed the
  decorative pin at `phase-travelling.tsx:508` **and** gated that `MapLink` on
  real `lat`/`lng`, applying the second half of the `stop-card.tsx` fix that
  had been missed here. It was closed under `SW-02` rather than by reopening
  this entry — see `SW-02 (confusable instance)` in the *Closed by the
  2026-09-21 close-out* register above. The decorative, non-confusable
  remainder was **declined** and is in *Settled*.
- **Closed:** `6eb8fba, 84d2f15, dadb3c1`, 2026-09-21 (sweep task 19); fourth
  instance `7fcef35`, same date.

### HG-08 · `help-hash-open.test.tsx` test 3 is weaker than its name

- **Source:** `HG` (`:645`, "Parked")
- **Evidence:** `components/trip/help-hash-open.test.tsx:43-54` — the test "lets
  a deep-linked section be collapsed again and stay collapsed" sets
  `globe.open = false` itself, then asserts `globe.open === false` and
  `window.location.hash === ""`. It re-reads the property it just set, and cannot
  assert the body is visually hidden because jsdom applies no `:target` CSS.
- **Verifiable by reading (hence open, not blocked), but closing it properly
  needs a real browser** asserting the `:target` CSS is not holding the section
  open — which this repo's jsdom suite cannot provide. Flagged here so whoever
  picks it up knows the shape of the real fix before starting.
- **Category:** test-coverage · **Effort:** M
- **Closed:** `7f4c82b`, 2026-09-21 (sweep task 20).

### CD-11 · No structural test pins `requireTripAccess` to `cache(fn)`

- **Source:** `CD` (`:116-119`)
- **Evidence:** `lib/guards.ts:57` —
  `export const requireTripAccess = cache(async (tripId: string) => { ... })`.
  `lib/guards.test.ts` uses a hand-rolled `cache()` mock (comment at `:32-46`
  explains why: React's real `cache()` is inert under Vitest/jsdom), and its two
  relevant tests (`:104`, `:117`) exercise behaviour *through* that mock rather
  than asserting `requireTripAccess` is literally the mock's return value.
- **Why it matters:** this is the one assertion that would survive a bug in the
  hand-rolled mock itself.
- **Category:** test-coverage · **Effort:** S
- **Closed:** `4abc3a5`, 2026-09-21 (sweep task 21).

### RM-15 · Home runs `requireTripAccess` twice per render

- **Source:** `RM` (`docs/follow-ups/2026-09-17-reminders-follow-ups.md:156-158`)
- **Evidence:** `app/(app)/trips/[tripId]/page.tsx:21` calls
  `await requireTripAccess(tripId)`, then line 80 calls
  `listRemindersForTrip(tripId, today)`, which calls `await requireTripAccess(tripId)`
  again at `server/actions/reminders.ts:69`.
- **Note:** defence-in-depth cost, not a defect — matching the source doc's own
  framing ("two extra round trips on the most-hit page").
- **Category:** mechanical · **Effort:** S
- **Closed:** `4abc3a5`, 2026-09-21 (sweep task 21).

### CD-05 · `DispatcherHealth` calls `new Date()` in a client component's render

- **Source:** `CD` (`:88-93`)
- **Evidence:** `components/account/dispatcher-health.tsx:42` —
  `const now = new Date();` inside the component body, which is `"use client"`
  precisely because `formatLastRun`'s stale branch calls `toLocaleDateString`
  with no explicit timezone. `components/account/devices-panel.tsx:216` has the
  equivalent pattern (`formatLastSeen(device.lastSeenAt, new Date())`).
- **Symptom:** server and client compute a different `now`, causing a hydration
  text mismatch — guaranteed on the stale branch, which formats a local calendar
  date.
- **Fix:** pass `now` down from the server instead of calling `new Date()`
  client-side; fix both components together.
- **Category:** mechanical · **Effort:** S
- **Pattern survives, unrecorded — added on final review.**
  `components/trip/note-thread.tsx:81` — `const now = new Date();` inside a
  `"use client"` render body (file header, `:1`), consumed at `:143`
  (`relativeTime(new Date(note.createdAt), now)`) — the identical
  server/client-mismatch shape this entry fixed in
  `dispatcher-health.tsx`/`devices-panel.tsx`. The fix covered only those two
  components.
- **Closed:** `dec2b27`, 2026-09-21 (sweep task 22).

### CD-15 · `DispatcherHealth` names both a component and an interface, imported into the same page

- **Source:** `CD` (`:128-129`)
- **Evidence:** `server/actions/cron-health.ts:7` —
  `export interface DispatcherHealth { ... }`;
  `components/account/dispatcher-health.tsx:41` —
  `export function DispatcherHealth(...)`. Both are imported into
  `app/(app)/account/page.tsx` (`:4` and `:13`).
- **Note:** TypeScript disambiguates them fine (interface vs value namespace);
  it is confusing to a reader scanning imports. Rename one — e.g. the interface
  to `DispatcherHealthData`.
- **Category:** docs · **Effort:** S
- **Closed:** `dec2b27`, 2026-09-21 (sweep task 22).

### CD-08 · `public/sw.test.ts` mutates `globalThis.fetch` with no `afterEach` restore

- **Source:** `CD` (`:103-105`)
- **Evidence:** `public/sw.test.ts` has three `describe` blocks (`:89`, `:161`,
  `:218`) and assigns `globalThis.fetch = fetchMock` / `vi.fn()` directly at
  lines 222, 263, 282, 305, with no `afterEach` anywhere restoring or unstubbing
  it.
- **Note:** harmless today because every test sets its own mock before use; a
  latent trap for the next test added. Four-line fix.
- **Category:** test-coverage · **Effort:** S
- **Closed:** `32bee64`, 2026-09-21 (sweep task 23).

### CD-12 · The service worker's re-subscribe heal path has uncovered defensive guards

- **Source:** `CD` (`:120-122`)
- **Evidence:** `public/sw.js:344` — `if (!fresh || !fresh.endpoint) return;`
  and `:347` — `if (!keys.p256dh || !keys.auth) return;`.
  `public/sw.test.ts`'s `pushsubscriptionchange` block (`:218` onward) covers the
  happy path, a null old+new subscription fallback (`:289`), and `subscribe()`
  rejecting (`:302`) — but nothing makes `pushManager.subscribe()` resolve to a
  falsy value or an object missing `.endpoint`, and nothing makes `toJSON()`
  return partial `keys`. Neither guard branch is exercised.
- **File-citation correction:** the code is in `public/sw.js`, not
  `components/account/device-state.ts` as the source doc says — that file's
  `!subscription`/`toJSON()` pair (`device-state.ts:59-62`) is the read path and
  is already covered. Confirm scope before starting.
- **Category:** test-coverage · **Effort:** S
- **Closed:** `32bee64`, 2026-09-21 (sweep task 23).

### CD-09 · `server/actions/push.ts` repeats its subscription shape and swallows errors opaquely

- **Source:** `CD` (`:106-109`)
- **Evidence:** the `p256dh`/`auth`/`lastSeenAt`(/`timezone`) shape is repeated
  across the `create` arm (`push.ts:43-49`), the `update` arm (`:67-70`), and the
  heal-path arms (`:219-230`, `:234-240`). A bare `catch {` with no bound error
  appears three times: `:76`, `:98`, `:244`.
- **Fix it file-wide or not at all** — extract a shared shape-builder and name
  the caught errors together; a partial fix leaves the file inconsistent with
  itself.
- **Category:** mechanical · **Effort:** M
- **Closed:** `28e933a`, 2026-09-21 (sweep task 24).


## Closed before the 2026-09-20 compile

44 items were closed by later work before this compile and are recorded here
only so the trail survives. **None of these is open. Do not work them.** The
seven source docs remain their record of why each was originally deferred; the
evidence closing each one is in the 2026-09-20 triage. 40 of the 44 were
independently re-verified with zero flips; the four marked † rest on a
production read the auditor could not repeat and are detailed in *Blocked →
Migration state* above.

| ID | What it was | Closed by |
|---|---|---|
| CP-01 | "Today" was a UTC calendar date | `docs/things-to-fix.md` P0-2 — `0b7ba83`, `761ef3c`, `3d494a0`, `7e4ec41` |
| CP-02 | "Firm up" canonical in the glossary, absent from the UI | P1-3 — `fd9fb5c` |
| CP-03 | Legacy paid-amount-no-date rows read as unpaid, undiscoverably | P2-8(b) — `bd03a2f`, `d361a73` |
| CP-04 | `handleFirmUp`'s `try/finally` had no `catch` | P2-1 — `2ff3db7`, `91f390d` |
| CP-05 | `markCostPaid` had no upper bound vs `costSchema`'s cap | P2-2 — `d595b2e` |
| CP-06 | `describeChanges("COST")` omitted `paidAt` | P2-3 — `cd75a72`, `a58218c` |
| CP-07 | Accommodation/item actions revalidated too narrow a path | P2-4 — `bf3b40b` |
| CP-08 | `convertCostToHome`/`buildBudget` spoke pre-ADR 0037 vocabulary | P2-5 — `0ac6f34` |
| CP-09 | The checklist confirm popover's currency picker discarded selections | P2-6 — `9a7f04e` |
| CP-10 | Server-side `errors.paidMinor` discarded for a generic toast | P2-10 — `9a7f04e` |
| CP-11 | Disabling the checklist checkbox mid-action lost keyboard focus | P2-9 — `9a7f04e` |
| CP-12 | Checklist confirm prefilled `costMinor` where dialogs prefilled `paidMinor` | P2-7 — `9a7f04e` |
| CP-13 | `paidAtStringSchema`'s date branch was shape-only | P3-2 — `e42ba70` |
| CP-16 | A preserved `paidMinor` was not currency-tagged | P3-3 — `e42ba70` |
| CP-19 | Rename-migration deploy ordering had no documented procedure | P0-3 — `e0606e1`, `docs/DEPLOY.md` §4b |
| AB-05 | `docs/HANDOFF.md` described SQLite as the current setup | Rewritten; now states `postgresql` with a "Status: done" marker |
| FN-01 | The `FeedbackNote` migration had not run against production | It has; `npm run feedback:pull` succeeds against production |
| FN-02 | Neither `feedback:pull` nor `feedback:resolve` had run its happy path | Both have, repeatedly — 7 resolved notes carry real resolution lines |
| FN-03 | `listFeedbackNotes` returned trip names across the trip-access boundary | ADR 0046 — `d6ab01e` scopes to the author unless `isAdminEmail` |
| FP-01 | Rotating a phone left the panel in the wrong modality | `d589beb` (live `matchMedia` subscription), `37d216d` (latch to first-open) |
| FP-02 | Keyboard focus was dumped to the top of the document on close | `fd60dec` — trigger wired through Radix |
| FP-03 | Desktop toasts flew in from the wrong edge | `32e9628` |
| FP-04 | The trigger became a toggle without that being asked for | `575b218` — kept deliberately, comment fixed, tests added |
| FP-08 | The `swipeDirection="right"` comment had a wrong premise | `575b218` |
| RM-03 | A rotated push endpoint orphaned its subscription row | `76d1e52`, `4de40db` |
| RM-04 | Home-base departures resolved a country, not a place | ADR 0050 decision 2 — `a1bdcf7` (device zone, not coordinate lookup) |
| RM-05 | "Reminders" named two different things in the UI | `1fcfdd7`, `2d00dd8`, `87ac993` |
| RM-06 | The timezone refresh only ran on trip screens | `DeviceSync` mounted app-wide in `app/(app)/layout.tsx` |
| RM-07 | The first real notification would render without an icon | `67e6d57` |
| RM-08 | Nothing noticed if GitHub disabled the schedule | `99646f8` — `CronHeartbeat` surfaced on Account |
| RM-09 | Overdue checklist items competed for the six-line cap | ADR 0050 decision 3 — `6a7f837` |
| RM-10 | The MORNING slot paid for reads it discarded | `f30e5c9` |
| RM-11 | The itinerary gate's trailing +1 was untested | `a023f4f` |
| RM-12 | A past-dated reminder rendered "in -31 days" | `8269656` |
| RM-13 | A queued mock bled into the next test | `940f3b5` |
| RM-14 | iOS-install detection branches were verified by hand, not by test | `components/account/device-state.test.ts` — five cases |
| RM-16 | Server-action tests asserted the access call, not its order | `8099b9b` + ~17 rollout commits (residual five files: see `CD-01`) |
| RM-17 | A failed release-delete was re-attempted and its failure hidden | `ab123c0` |
| RM-18 | The calendar feed resolved a rough Stop's Alarm to UTC | `7d7fab3` |
| RM-20 | Two zones 13h+ apart produced two Digests | ADR 0050 decision 1 — `37ea6b2` |
| OPS-01 † | The cost/paid rename migration's rehearsal was owed | Migration applied 2026-08-12 and verified clean post-hoc |
| OPS-03 † | The legacy paid-without-date row count was unknown | 0 of 33 rows |
| OPS-06 † | `share_links_per_audience` believed unrun | Applied 2026-09-20T23:09:52Z (carried a write-path window — see above) |
| OPS-07 † | `cron_heartbeat` believed unrun | Applied 2026-09-20T10:24:17Z; the table holds a live row |

**A note on `RM-04`, `RM-09` and `RM-20`:** each was closed by a different
mechanism than its source doc proposed — ADR 0050's device-zone election instead
of a coordinate lookup, a checklist-specific cap instead of a cap-order change,
a `lastSeenAt`-elected zone instead of the doc's own framing. All three were
independently confirmed against current code and the cited commits. The defect
being closed by a different shape of fix than the one suggested is still closed.
