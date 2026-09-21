# Open follow-ups

The single live backlog of engineering work TEEPEE still owes. Compiled
**2026-09-20** on branch `chore/follow-ups-triage-and-sweep` from the seven
follow-up documents in `docs/follow-ups/` plus the operational debt
`docs/things-to-fix.md` still had outstanding.

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

Eight agents re-verified all **127 items** against current `main`, each against
the source doc it owned. A ninth agent, which had performed none of that work,
independently re-derived every `DONE` verdict from the code or the cited commit
rather than trusting the evidence string.

| Verdict | Count | Where it lives in this doc |
|---|---|---|
| Already fixed — struck | 44 | *Struck* register (no action) |
| Live — still open | 42 | *Open items* |
| Needs a decision | 5 | *Needs a decision* (do not build) |
| Blocked on a deploy, device, or browser | 12 | *Blocked* |
| Settled — declined deliberately | 24 | *Settled — do not re-raise* |
| **Total** | **127** | |

Of the 44 `DONE` calls: **40 were independently re-verified and 0 were
flipped.** The remaining 4 (`OPS-01`, `OPS-03`, `OPS-06`, `OPS-07`) rest on a
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

### Two process lessons, carried forward

Both come from `docs/follow-ups/2026-09-20-changeover-day-and-digest-follow-ups.md`
(items `CD-17` and `CD-18` in the triage). Neither is a backlog item — they are
plan-authoring guidance, and they belong in the next plan you write, not in the
list below.

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

---

# Open items

42 items, every one re-verified against current `main` on 2026-09-20 by reading
the cited code. Each carries the `file:line` that still shows the defect.

## P0

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

## P1

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

## P2

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

### FN-05 · A Feedback note does not survive its author

- **Source:** `FN` (`docs/follow-ups/2026-09-08-feedback-notes.md:38-42`)
- **Evidence:** `prisma/schema.prisma:738` —
  `author User @relation(fields: [authorId], references: [id], onDelete: Cascade)`,
  unchanged. No migration since 2026-09-08 touches this FK's behaviour.
- **Fix shape:** the same treatment ADR 0040 already gave `tripId`/`tripName`
  — snapshot `authorName` at write time, and either drop the cascade or make
  `authorId` nullable with `onDelete: SetNull`. Needs a migration; read
  `docs/DEPLOY.md` §4b and `OPS-08` first.
- **Category:** mechanical · **Effort:** M

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

## P3

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

### FN-06 · `feedback-resolve.ts` prints the target database *after* the lookup

- **Source:** `FN` (`:46-48`)
- **Evidence:** `scripts/feedback-resolve.ts:55` —
  `const existing = await db.feedbackNote.findUnique(...)`; the
  `console.log(\`Database: ${targetHost()}\`)` echo is at line 70. A mistyped id
  exits at the not-found check between them, before the operator is ever told
  which database was consulted.
- **Fix:** move the `Database:` echo above the `findUnique` call.
- **Category:** mechanical · **Effort:** S

### FN-08 · A discarded Feedback note's text is shown but not recoverable

- **Source:** `FN` (`:52-54`)
- **Evidence:** `components/feedback/feedback-launcher.tsx:332-337` — the
  discarded-note toast description is `result.discarded[0].body.slice(0, 120)`,
  plain text with no action to restore it; `bodyRef`/`setBody` are not wired to
  the toast.
- **Fix:** add a toast action calling `setBody(result.discarded[0].body)` and
  focusing `bodyRef`.
- **Category:** mechanical · **Effort:** S

### FN-09 · The near-limit character counter is conditionally mounted, unlike the journal editor's

- **Source:** `FN` (`:55-58`)
- **Evidence:** `components/feedback/feedback-launcher.tsx:619-621` —
  `{body.length >= COUNT_FROM ? (<p role="status" aria-live="polite"> ... ) : null}`.
  `components/trip/journal-editor.tsx:227-230` documents the opposite as
  deliberate: "always mounted, stable position."
- **Fix:** mount the `<p role="status">` unconditionally and toggle only its
  text, matching the journal editor's pattern.
- **Category:** mechanical · **Effort:** S

### FN-10 · `docs/HANDOFF.md` says bare "note" where it means a Feedback note

- **Source:** `FN` (`:59-61`)
- **Evidence:** `docs/HANDOFF.md:401` — "`--dry-run` looks the note up and
  reports what would change without writing". `CONTEXT.md:247` defines
  **Feedback note** as the contract term.
- **Fix:** one word — "looks the Feedback note up".
- **Category:** docs · **Effort:** S

### FN-12 · The row → `InboxNote` mapping in `feedback-pull.ts` is inline and untested

- **Source:** `FN` (`:64-67`)
- **Evidence:** `scripts/feedback-pull.ts:62-75` — the `rows.map((row) => ({...}))`
  mapping is written inline in the script, not extracted. No test file exists for
  it.
- **Fix:** extract the row→`InboxNote` shape function into `lib/feedback-inbox.ts`
  (which already exists and holds `renderInbox`) and add a field-mapping unit
  test.
- **Category:** test-coverage · **Effort:** S

### FP-05 · The backdrop is briefly visible during panel open/close below `md`

- **Source:** `FP` (`docs/follow-ups/2026-09-09-feedback-panel-chat-shape.md:43`)
- **Evidence:** `app/globals.css:234` — `tp-fade-in` is `150ms ease-out`;
  `app/globals.css:246` — `tp-slide-up` is `250ms cubic-bezier(...)`. The 100ms
  gap (used together below `md` in `components/ui/sheet.tsx:21-22,36`) is
  unchanged, so the dim-and-blur backdrop shows before the panel covers it.
- **Note:** the source doc calls this "arguably an improvement" (standard sheet
  feel). Recorded as still-open, not as something the doc demands fixed.
- **Category:** mechanical · **Effort:** S

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

### FP-07 · A desktop toast sits over the Compare table's frozen label column

- **Source:** `FP` (`:53`)
- **Evidence:** `components/trip/compare-table.tsx:477` — the `sticky left-0 z-10`
  label column is still there, and toasts are still bottom-left (see the settled
  `FP-15`), so the overlap is geometric and unchanged.
- **Note:** transient and readable once the toast clears.
- **Category:** mechanical · **Effort:** S

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

### FP-12 · `badgeFor`'s variant type is a hand-written union, not derived from `badgeVariants`

- **Source:** `FP` (`:80`)
- **Evidence:** `components/feedback/feedback-launcher.tsx:193-199` — `badgeFor`
  returns `{ label: string | null; variant: "success" | "muted" }`.
- **Deliberate today:** the source doc calls the narrow union "the better
  contract" and flagged it only in case the variant set grows. Recorded so the
  reasoning is not lost; not a request to change it now.
- **Category:** docs · **Effort:** N/A

### FP-13 · The docked height calc has no floor

- **Source:** `FP` (`:83`)
- **Evidence:** `components/ui/sheet.tsx:42` —
  `md:h-[min(37.5rem,calc(100vh-9rem))]`, no floor clause.
- **Note:** only bites below a 144px-tall viewport at ≥768px wide; 768×400
  landscape still yields 16rem.
- **Category:** mechanical · **Effort:** S

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

### RM-15 · Home runs `requireTripAccess` twice per render

- **Source:** `RM` (`docs/follow-ups/2026-09-17-reminders-follow-ups.md:156-158`)
- **Evidence:** `app/(app)/trips/[tripId]/page.tsx:21` calls
  `await requireTripAccess(tripId)`, then line 80 calls
  `listRemindersForTrip(tripId, today)`, which calls `await requireTripAccess(tripId)`
  again at `server/actions/reminders.ts:69`.
- **Note:** defence-in-depth cost, not a defect — matching the source doc's own
  framing ("two extra round trips on the most-hit page").
- **Category:** mechanical · **Effort:** S

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

### CD-08 · `public/sw.test.ts` mutates `globalThis.fetch` with no `afterEach` restore

- **Source:** `CD` (`:103-105`)
- **Evidence:** `public/sw.test.ts` has three `describe` blocks (`:89`, `:161`,
  `:218`) and assigns `globalThis.fetch = fetchMock` / `vi.fn()` directly at
  lines 222, 263, 282, 305, with no `afterEach` anywhere restoring or unstubbing
  it.
- **Note:** harmless today because every test sets its own mock before use; a
  latent trap for the next test added. Four-line fix.
- **Category:** test-coverage · **Effort:** S

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

### CD-14 · `formatLastRun`'s "just now" and singular "1 hour ago" branches are untested

- **Source:** `CD` (`:126-127`)
- **Evidence:** `lib/cron-health.ts:36-48` has three return branches beyond the
  stale-date one: `hours >= 1` plural, the implicit singular `hours === 1`, and
  the `hours < 1` fallback ("last ran just now").
  `lib/cron-health.test.ts:30-42` tests only `null`, the stale-date branch, and
  one plural case.
- **Category:** test-coverage · **Effort:** S

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
- **Category:** docs · **Effort:** S

### OPS-05 · `cost-amounts.tsx` truthiness gate, reached from the `things-to-fix.md` side

- **Source:** `OPS` (`docs/things-to-fix.md:657-663`, P3-4)
- **Same defect as `CP-17` above** — kept as its own ID because the two triage
  passes found it independently, from the follow-up doc and from the audit doc.
  Fix once; strike both. Full evidence and the reclassification rationale are
  under `CP-17`.
- **Category:** mechanical · **Effort:** S

---

# Needs a decision — **do not implement these**

**These five are the operator's calls to make, not an agent's to build.** Each
one is real, and each one has two defensible fixes with genuinely different
costs — which is exactly why it was deferred rather than done. If you are an
agent reading this document looking for work, **skip this section entirely**.
Nothing here is ready to be implemented, and implementing either option without
the decision being made is how the wrong one ships. Bring the choice to the
operator, get an answer, then write a plan.

All five come from
`docs/follow-ups/2026-09-20-changeover-day-and-digest-follow-ups.md`.

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

---

# Blocked on a deploy, a device, or a browser

Nothing in this section can be closed from this sandbox. It is ordered as a
deploy would be run — **migration state first, then the verifications that a
running app makes possible.**

> **This is no longer a deploy checklist. It is mostly history.** Both
> migrations previously believed unrun are in fact applied in production. There
> is currently **nothing pending on the database side of the next deploy.** What
> genuinely remains is a short list of checks that need a person with a running
> app, a phone, a calendar client, or a browser.

## Migration state — history, not a checklist

Every migration in `prisma/migrations/` is applied in production. This was
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
irrecoverably. It is recorded here because `docs/DEPLOY.md` §4b does not name
this hazard shape, and `OPS-08` in *Open items* is the work of adding it.

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
  to run immediately before the migration. Every migration in
  `prisma/migrations/` is now applied in production, so the gate is no longer
  runnable — it has been overtaken. **Do not treat this as a pending step.** If
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
- **A real-browser assertion for `HG-08`.** Listed in *Open items* because the
  weakness is verifiable by reading — but closing it properly needs a browser
  that applies `:target` CSS, which the jsdom suite cannot provide. Noted here so
  the browser requirement is not discovered late.
- **`FP-16`'s optional real-phone look.** Settled, not owed — but if a device
  pass is ever done, the exact conditions to check are recorded with that entry
  in *Settled* below.

---

# Settled — do not re-raise

**These 24 were judged and declined deliberately.** They are not oversights, not
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
  document's agent-facing preamble above ("Two process lessons, carried
  forward") rather than listed as work. Do not file them as tasks.

---

# Struck — already fixed (no action)

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
