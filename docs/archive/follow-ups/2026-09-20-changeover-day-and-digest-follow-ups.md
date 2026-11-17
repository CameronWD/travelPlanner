# Changeover day & Digest fixes — follow-ups

Everything deliberately deferred while building the branch
`feat/changeover-day-and-digest-fixes` (ADRs 0049 and 0050, 59 commits,
2026-09-20). Each item was raised by a review, judged real, and consciously
not fixed — because it needed a decision this branch had not taken, because
fixing it well meant touching more than the task owned, or because it was
found in code the branch only passed through.

**Nothing in Phases B, C or D has been proven end to end.** 3792 tests run
against a mocked database. As of this branch no rotated subscription has
healed against a real push service, no Digest has been dispatched with an
elected zone, and the `CronHeartbeat` migration has never executed — there is
no Postgres and no Docker in the build environment. The first real proof is a
deploy followed by a test send from the installed iPhone, and the first
authorized cron hit flipping Account off "never run".

The previous list is `2026-09-17-reminders-follow-ups.md`; items 1, 3, 4 and
the "two zones 13h+ apart" note from it are closed by this branch.

---

## Worth their own task

### 1. Five mutating actions have tests that never assert their guard

**Where:** `server/actions/chapters.test.ts`, `stops.test.ts`,
`firm-up-trip.test.ts`, `cover.test.ts`, `activity.test.ts`

Found while working the access-order sweep. These files mock
`requireTripAccess` but contain **zero** assertions on it — not the ordering,
not even that it ran. The production actions do guard (6, 19, 3 and 5 guard
calls respectively), so this is a coverage hole rather than a live
vulnerability. But they are exactly the mutating actions where a guard
regression matters, and they were invisible to the sweep because that task
was scoped to upgrading *existing* assertions and there was nothing there to
upgrade.

`test/helpers/access-order.ts` and its `expectAccessCheckedBeforeWrite` exist
now, so the tool is ready; what is missing is the assertions themselves.

### 2. `subscribeToPush` can reassign a row it does not own

**Where:** `server/actions/push.ts`

It writes `userId: user.id` unconditionally on its upsert-update. The comment
justifying that has been corrected on this branch — it used to claim the
action "only ever runs from a traveller explicitly pressing Enable on THIS
physical device", which is provably false for a server action, since server
actions accept arbitrary arguments from any authenticated caller.

The equivalent hole in `healRotatedSubscription` was closed during this
branch. This one was left because the exploit is narrower — it needs a
victim's endpoint, a capability secret that only ever travels app → push
service → database — and it yields device theft and silencing rather than
content theft, since pushes still go to the victim's endpoint encrypted with
keys the attacker cannot read.

The awkward part, and the reason it wants a spec rather than a patch: the
legitimate shared-machine call and the hijack are byte-identical. The real
fix is probably to require an explicit re-Enable rather than a smarter check.

### 3. Rule 4 does not govern a Stop re-date

Recorded in full in ADR 0049's Consequences. An Item on a changeover day
un-slots when its owning Stop shortens, even though the adjoining Stop still
covers the date — and this branch makes that newly visible, because the Item
now renders on the adjoining card and so disappears from a card the Traveller
never touched. Extending rule 4 into the re-date path would mean a Stop
re-date can move an Item onto a *different* Stop's Budget line, which today
only an explicit move does. That is a behaviour change and deserves its own
spec.

### 4. The intraday zone flip can still produce two Digests

Recorded in full in ADR 0050's Consequences. The elected zone is resolved
fresh on every run rather than cached for the day, so if the *elected* Device
changes zone between two of the day's five runs, the two runs compute
different `(localDate, slot)` pairs and the zone-less ledger key does not
deduplicate them. Needs an actual mid-day zone change, not merely owning
Devices in two places. Closing it means either caching the elected zone per
person per local day, or putting the elected zone in the ledger key.

---

## Smaller items

- **`components/account/dispatcher-health.tsx`** — calls `new Date()` in a
  client component's render, so the server and client can disagree and the
  text mismatches on hydration, guaranteed on the stale branch which formats
  a local date. It mirrors `DevicesPanel` exactly, so this is consistency
  with a pre-existing pattern rather than new breakage — but the pattern is
  worth fixing once, for both.
- **The heartbeat proves the route ran, not that Digests were delivered.** A
  run that authorizes, stamps the heartbeat, then throws inside the scan
  reads as perfectly healthy on Account while nobody receives anything.
  Worth one sentence of copy, or a second signal.
- **`lib/digest.ts`** — the 2-line Checklist cap drops lines silently; the
  `+N more` tail counts only the global `DIGEST_MAX_LINES` truncation. Five
  overdue Checklist items render as two with no indication three were
  dropped. `CONTEXT.md`'s **Digest** entry currently implies a single cap
  that "takes the tail", which is now not quite true.
- **`public/sw.test.ts`** — mutates `globalThis.fetch` with no `afterEach`
  restore. Harmless today because every test in the file sets its own mock,
  but a latent trap for the next test added there. Four lines.
- **`server/actions/push.ts`** — the `p256dh`/`auth`/`lastSeenAt`/`timezone`
  object shape repeats across the create and update arms; the file-wide
  catch-all `catch` swallows programming errors as an opaque message. Both
  pre-existing patterns; worth changing file-wide or not at all.
- **`lib/digest-dispatch.ts`** — no test pins the documented first-row-wins
  tie-break when two Devices share a `lastSeenAt`; the `console.error`
  assertions use `objectContaining` without `slot`, so dropping `slot` from
  the log payload would go uncaught; and there is no direct test of the
  compound case where a mid-flight throw reaches the outer catch *while* the
  release delete also fails.
- **`lib/guards.ts`** — no structural test asserting `requireTripAccess` is
  literally `cache(fn)`'s return value, which is the one assertion that would
  survive a bug in the hand-rolled `cache` mock the unit tests have to use
  (React's real `cache` is inert under Vitest/jsdom).
- **`components/account/device-state.ts`** — the `!fresh`/`!fresh.endpoint`
  and missing-`toJSON` guards in the service worker's heal path are
  defensive and uncovered.
- **`server/actions/cron-health.ts`** — the crash-path fix has a unit test
  but no `AccountPage`-level regression test. Sufficient by construction (the
  error is swallowed before the promise resolves) but not pinned at the page.
- **`formatLastRun`** — the "just now" and singular "1 hour ago" branches are
  untested.
- **`DispatcherHealth`** names both a component and the action's return
  interface, in two files imported into the same page.

---

## Process note, for whoever writes the next plan

Two lessons from this one, both worth carrying forward:

1. **A parameter can be born dead across task boundaries.** The plan
   specified `timezone` on `healRotatedSubscription` *and* on the
   `POST /api/push` schema, and never told the service-worker task to send
   it. No single task's scope could catch that nothing fed it; it took a
   whole-branch review. A "who feeds this?" check belongs in the plan.
2. **A later phase can re-arm an earlier phase's bug.** Phase B stamps
   `lastSeenAt`; Phase C elects a timezone from it. Phase B shipped and was
   reviewed before Phase C existed. Where two phases touch one column, say so
   in the plan so the second phase's reviewer is told to look.
