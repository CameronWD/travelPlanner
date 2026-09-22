# Architecture sitrep — 2026-09-22

An architecture-level review of TEEPEE, taken before opening the app to **10–15
independent Travellers who each plan their own Trips**. Compiled 2026-09-22 from six
independent read-only reviews — tenancy and authorisation, observability, destructive
operations and data safety, module boundaries, the large components, and all 56 ADRs
against the code — each run against a pre-built digest of what has already been
decided, and every claim then re-checked by the orchestrator before it entered this
document.

This is **not** `docs/things-to-fix.md`. That document is a defect backlog and is
**fully closed** — every item in it, including `P0-4` and `P1-5`, is fixed
(`things-to-fix.md:127`, `:188`, `:783`), and two reviewers independently re-verified
that the behaviours behind those two have **not** regressed in current code. This
document is about structure: what the architecture assumes, and which of those
assumptions stop being true when the people using TEEPEE are no longer one household.

## Baseline at time of audit

| Check | Result |
|---|---|
| `npm run test` (`TZ=UTC vitest run`) | **3999 passed** (313 files), 0 failed |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |

Nothing below is a build or test failure. These are logic, isolation and operational
gaps the suite structurally cannot catch — it mocks `@/lib/db` and pins `TZ=UTC`, so
no test in the repo exercises a real authorisation boundary against a real database.

## Trust statement — how much of this you can believe

**43 findings**, from 45 raw (two pairs merged). Read this section before acting on
any of them.

Every finding carries a verification status, and they are not equal:

- **Independently re-read (12 findings).** The orchestrator opened the cited file at
  the cited lines and judged the claim without reference to the reviewer's prose. This
  covers **every P0**, every finding where two reviewers disagreed, every finding that
  re-opens a previously settled decision, and every item on the shortlist below.
- **Citation-checked (31 findings).** Citations were checked for existence and
  plausibility against surrounding code, but the cited lines were not independently
  re-read end to end. Treat the *direction* as reliable and confirm the *detail* before
  you change code.
- **`INFERENCE` (8 claims).** Marked inline wherever they appear. These are reasoned
  from code but not proven, and they are never dressed up as code reads.

**Nothing here was verified by running anything.** This sandbox has no Postgres, no
browser and no production data. There are no executable repros in this document, unlike
the 2026-08-14 audit — every claim is static reading.

**One finding was refuted and is recorded as such.** The boundaries reviewer filed
`promoteFork`'s paid-Cost deletion as a P0 on the grounds that it was silent. It is
not: `forks.ts:648` itemises every paid Cost in the promote dialog's loss list and
`promote-fork-dialog.tsx:213-251` gates it behind typing the Fork's name. The data-safety
reviewer caught this independently, the orchestrator verified it, and the finding is
carried at **P1** with the correct premise. A review that reports its own refutations is
one you can calibrate against; this one had 1 refuted sub-claim and 1 refuted premise in
its own plan.

**Known coverage gap, now closed.** No reviewer's file list included the public share
page. The orchestrator read it directly rather than ship the hole: `app/share/[token]/page.tsx:100-170`
honours ADR 0051's never-shared floor properly — `notes`, `reference` and `confirmation`
are each explicitly omitted, and an off dial means the query never runs at all, so
"hidden data never leaves the database". **No finding.** It is the best-disciplined
surface in the codebase, and it is why `ARCH-TEN-7` below matters so much.

**What remains genuinely unexamined:** runtime behaviour of any kind; Google Cloud
Console state; whether the off-repo NAS pull of backup artifacts mentioned in
`db-backup.yml:5-6` exists or works.

## Where TEEPEE actually stands

The headline is better than you might expect, and the exceptions are sharp rather than
diffuse.

**The foundations are sound.** All 33 non-test files in `server/actions/` and all 7
route handlers were rowed — 117 exported functions — and **zero published server actions
are unguarded**. `lib/guards.ts` centralises `requireUser` / `requireTripAccess` /
`requireForkAccess`, `lib/globe.ts` parallels it for the Globe, and defence-in-depth is
an explicit stated convention rather than an accident. Of 56 ADRs, the 18 that constrain
who-can-see-what were verified in full and **18 of 18 are honoured** — including ADR 0044
(day ideas draw only from the Traveller's own pools) and ADR 0046 (Feedback privacy),
the two most likely to hide a leak. The Devices surface (ADRs 0048/0053) is the
strongest in the codebase and produced no finding at all. A real nightly `pg_dump`
exists, is verified with `pg_restore --list` before being called a backup, and fails
loudly when misconfigured.

**The failures cluster in three places, and they map exactly onto your three fears.**

1. **Where a guard authorises one thing and the code then writes another.** Not missing
   guards — *scope* mismatches. `restoreStops` authorises the Stops and then writes a
   caller-supplied payload of Items and Accommodations it never checks.
2. **Where a decision made for two people in one house is still in force.** The Journal
   is one shared row with last-write-wins. A Trip member can never be removed. Duplicating
   a Trip silently re-grants everyone's membership. Any Globe member can invite anyone.
3. **Where the operator was the monitoring system.** There is no error sink of any kind.
   Digest health is a single global row. The only channel by which a problem reaches you
   is a Traveller choosing to write a Feedback note.

---

# The shortlist

Every finding flagged **Blocks rollout: YES**, in the order I would do them. This is the
answer to "what has to happen before I tell 15 friends the URL".

### Group 1 — cross-boundary writes and reads (do these first)

| Id | P | One line |
|---|---|---|
| `ARCH-TEN-1` | **P0** | `restoreStops` writes caller-supplied Item and Accommodation rows into **any** Trip — the one place an authenticated Traveller can write outside their own tenancy |
| `ARCH-DAT-6` | **P0** | Journal is one shared last-write-wins row per Trip-day; a stale tab silently replaces another Traveller's prose, and blanking the box deletes it with no confirm |
| `ARCH-TEN-2` | P1 | `recordActivity` is a published action that writes a forged Activity row into any Trip id you name, under `requireUser` alone, inside a silent `catch` |
| `ARCH-TEN-7` | P1 | A Calendar feed URL exposes booking refs, confirmation numbers, addresses and private notes — the Share link's own floor forbids exactly this, and ADR 0052 justified the feed's looser gate on the belief it exposed less |

### Group 2 — irreversible grants (membership is currently one-way)

| Id | P | One line |
|---|---|---|
| `ARCH-TEN-3` | **P0** | Nothing in the repo decides who may sign in; the only gate is Google's test-user list, outside the codebase and unreviewable in a diff |
| `ARCH-DAT-1` | P1 | A Trip member can never be removed — no `removeTripMember` exists anywhere — and every member can irreversibly delete anything on the Trip |
| `ARCH-TEN-4` | P1 | Any Globe member can invite anyone onto the Globe; no owner gate, no removal path, and a Globe is a Traveller's entire saved-places history |
| `ARCH-ADR-1` | P1 | Duplicating a Trip silently re-grants every co-Traveller's membership on the new Trip, with no per-Traveller consent |
| `ARCH-ADR-3` | P1 | A Globe invite to someone who already has a Globe dead-ends silently while reporting "Invited" — a common case once Travellers are independent |

### Group 3 — finding out, and getting it back

| Id | P | One line |
|---|---|---|
| `ARCH-OBS-1` | P1 | No error-reporting sink exists anywhere; every server failure ends in a `console.*` call nobody is watching |
| `ARCH-OBS-2` | P1 | The app's own error boundaries are client components that log to the Traveller's own devtools — there is nothing to find even if you look |
| `ARCH-DAT-2` | P1 | No restore procedure exists anywhere in the repo, and no way to restore one Traveller's Trip without rolling back everyone |
| `ARCH-DAT-3` | P1 | R2 files are not backed up and are hard-deleted, so a database restore returns attachment rows whose files are permanently gone |
| `ARCH-DAT-4` | P1 | Deleting a Stop destroys its Accommodations, confirmation numbers and unpaid Costs behind a dialog that says only "This can't be undone" |

**Two P2s worth doing while you are in there**, because they are what make Group 1
verifiable rather than merely fixed: `ARCH-BND-3` (the owner-or-admin predicate is
copy-pasted three times instead of being one named guard) and `ARCH-BND-2` (the
`forkId: null` real-plan discriminator is hand-typed in 40+ places despite
`lib/plan-scope.ts` existing for exactly this, which ADR 0020 itself calls the main
ongoing cost of the approach).

**Everything else — 24 further findings — does not block anyone arriving.** They are
recorded below by dimension.

---

# How to work on an item (read this first, agent)

1. **Read `CONTEXT.md` before touching anything.** It is the vocabulary contract. Never
   introduce a term its *Avoid* lists forbid. Note that its opening line has been
   corrected as part of this sitrep — TEEPEE is for Travellers planning their own Trips,
   not for one couple.
2. **Branch per fix** (`fix/<slug>`), never commit to `main`, never deploy. Merging and
   deploying are the owner's call.
3. **Every fix lands with a test that fails before and passes after.** The suite mocks
   `@/lib/db` and runs `TZ=UTC`; logic-level tests are the norm.
4. **The authorisation findings need a different kind of test than this repo has.** No
   existing test exercises a real cross-tenant call, because `@/lib/db` is mocked. For
   `ARCH-TEN-1`, `ARCH-TEN-2` and `ARCH-TEN-4`, assert at the action's own boundary that
   a foreign id is rejected — mock the db to return a row whose `tripId` differs from the
   authorised one, and assert the action refuses. That is the shape the fix must be
   pinned by, and it is the gap that let these through in the first place.
5. **This sandbox has no Postgres.** Anything needing one is *manual verify (needs DB)*:
   state that in your report and describe the exact steps. Do not claim it verified.
6. **Re-run the full baseline** (`npm run test`, `npx tsc --noEmit`, `npm run lint`)
   before reporting done.
7. **Read the "Deliberate — do not fix these" section** before filing anything new.

Severity: **P0** = wrong data or behaviour for real users in production · **P1** = a
promised capability is missing or a workflow silently misleads · **P2** = quality defects
worth fixing soon · **P3** = polish / doc drift.

---

# Findings

## Tenancy and authorisation

The guard-coverage matrix (117 exports, 7 route handlers, all rowed) found **zero
unguarded published actions**. Every finding here is a scope mismatch inside a guarded
action, not a missing guard.

### ARCH-TEN-1 · `restoreStops` writes caller-supplied Item and Accommodation rows without checking they belong to the Trip it authorised
- **Severity: P0** · **Blocks rollout: yes** — the only place in the codebase where an
  authenticated Traveller can write a row in a Trip they are not a member of.
- **Evidence:** `server/actions/stops.ts:1274-1341`. `"use server"` at `:1`, so it is
  network-reachable by any session. Access derives *only* from `entries[]`: rows read
  `:1285-1288`, `tripId` from `rows[0].tripId` `:1296`, `requireTripAccess(tripId)`
  `:1297`. The `payload` argument is then applied verbatim inside the transaction —
  `tx.item.update({ where: { id: item.id }, data: { date, ...(item.stopId ? { stopId } : {}) } })`
  `:1327-1333` and `tx.accommodation.update({ where: { id: acc.id } })` `:1336`. Neither
  `payload.items[].id`, nor `payload.items[].stopId`, nor `payload.accommodations[].id`
  is checked against `tripId`. The correct shape exists one function above: `reorderStops`
  re-reads every id as `{ id: { in: ... }, tripId }` `:1165-1168`.
- **Verification:** code read, independently re-verified.
- **Failure scenario:** Priya and Marcus share no Trip. Priya drags a Stop in her own
  Trip, lets the undo toast fire, and appends one entry to `payload.items`:
  `{ id: "<an Item id from Marcus's Trip>", date: "2027-01-01", stopId: "<a Stop in Priya's Trip>" }`.
  The guard passes on her own Stop. Marcus's Item jumps to a date he never chose and is
  re-filed onto a Stop he cannot see, so its Cost falls off his Budget. `restoreStops`
  records no Activity, so nothing is logged and he cannot find out.
- **Prior art:** none. Exploitation needs the target's `cuid`s, which are not
  enumerable — this is a real barrier, not a reason to leave it.
- **Fix sketch:** Re-read the payload ids the way `reorderStops` already does: one
  `item.findMany({ where: { id: { in: ... }, tripId } })` and one for Accommodation
  before the transaction opens, rejecting the whole call if any id is missing. Apply the
  same to `payload.items[].stopId`. The existing `STOP_NOT_IN_TRIP` error shape already
  models the rejection.
- **See also:** `ARCH-CMP-2` — a second, independent defect in the same function.

### ARCH-TEN-3 · Nothing in the repo decides who may sign in
- **Severity: P0** · **Blocks rollout: yes** — it is the precondition for every other
  finding here.
- **Evidence:** `lib/auth.ts:68-80` — `callbacks` defines only `jwt` and `session`; there
  is no `signIn` callback, so Auth.js admits every successful provider response.
  `lib/auth.ts:23-30` registers Google whenever the two env vars are set, with no `hd`
  restriction or email filter. `lib/auth.ts:61` — `PrismaAdapter` mints a `User` on first
  sign-in. `lib/auth.ts:87-91` — the `signIn` *event* then auto-accepts pending Invites
  for that email, so account creation and Trip joining happen in one uncontrolled step.
  Grep finds only `ADMIN_EMAILS`, which grants operator powers and gates nothing about
  sign-in.
- **Verification:** code read for the absent callback, independently re-verified.
  **`INFERENCE`** that Google's consent screen is in Testing mode — that state is not in
  this repo.
- **Note:** the dev-login door is **correctly** closed and was re-verified:
  `ALLOW_DEV_LOGIN === "true" && NODE_ENV !== "production"` (`lib/auth.ts:35`), both
  conditions, the second independent of any env file.
- **Failure scenario:** the OAuth app is published, or exceeds Testing mode's 100-user
  cap, or a GCP change flips it. Anyone with a Google account signs in and is a full
  Traveller holding the authenticated session `ARCH-TEN-1` and `ARCH-TEN-2` require.
- **Fix:** fully specified in **"The door"** below.

### ARCH-TEN-2 · `recordActivity` writes an Activity row into any Trip the caller names, with no membership check
- **Severity: P1** · **Blocks rollout: yes** — the Activity feed is what a Traveller
  reads to find out what changed. Forgeable entries make it untrustworthy, and the forger
  is no longer necessarily someone the reader knows.
- **Evidence:** `server/actions/activity.ts:1` is `"use server"`. `:7-32` — the only
  guard is `requireUser()` `:16`; `input.tripId` goes straight into `db.activity.create`
  `:18-28`. `requireTripAccess` is *imported* at `:4` and never called. `verb`,
  `entityType`, `entityLabel` and `changes` are all caller-controlled. The whole body is
  wrapped in `try { ... } catch {}` `:15-31`, so abuse is invisible.
- **Verification:** code read, independently re-verified.
- **Failure scenario:** Marcus, with no membership of Priya's Trip, calls
  `recordActivity({ tripId: "<Priya's trip id>", verb: "DELETED", entityType: "COST", entityLabel: "Flights — Vienna" })`.
  Priya's feed shows a cost deletion that never happened, attributed to a stranger whose
  name and avatar are joined and rendered (`activity.ts:49`). She goes looking for money
  that was never spent.
- **Fix sketch:** `recordActivity` is only ever called *from* other server actions that
  have already run `requireTripAccess`, so the cheapest correct fix is to stop publishing
  it — move the body into `lib/` and leave `server/actions/activity.ts` exporting only the
  three genuinely client-facing reads. If it must stay an action, add
  `await requireTripAccess(input.tripId)` above the create; `cache()` makes it free on the
  common path.
- **See also:** `ARCH-OBS-3` — the same function's silent `catch`.

### ARCH-TEN-4 · Any Globe member can invite anyone else onto the Globe
*(Found independently by the tenancy lane and the ADR-drift lane as `ARCH-ADR-2`; merged.)*
- **Severity: P1** · **Blocks rollout: yes** — a Globe is account-level and permanent, and
  admitting someone is irreversible through the UI. **Raised further by the door decision:**
  because a pending Invite will admit an address to the deployment, an ungated
  `inviteToGlobe` would let any Globe member create accounts. See *"How the allowlist and
  Invite must interact"* — either this is fixed first, or Globe Invites stay out of the
  sign-in callback.
- **Evidence:** `server/actions/globe.ts:109-125` — `inviteToGlobe` calls
  `requireGlobeAccess()` `:110` and nothing else; it never reads `GlobeMember.role`, which
  the schema does carry (`lib/globe.ts:42` creates the first member as `"owner"`,
  `lib/globe-invites.ts:55` creates the rest as `"member"`). Compare `invites.ts:49` —
  `membership.role !== "owner" && !isAdminEmail(user.email)` — whose own comment `:43-48`
  explains that transitive membership must be owner-gated. ADR 0023 built Globe invites to
  mirror Trip invites; ADR 0052 tightened the Trip side and was never mirrored back.
  Acceptance is automatic on next sign-in (`lib/globe-invites.ts:37-70`). There is **no
  `removeGlobeMember` action anywhere**.
- **Verification:** code read, independently re-verified.
- **Failure scenario:** Priya invites Sam onto her Globe for one trip. Sam calls
  `inviteToGlobe("someone-else@example.com")`. That third person signs in and sees every
  place Priya has ever saved, including Marker notes and any files dual-scoped onto
  Markers under ADR 0031. Priya cannot remove either of them.
- **Prior art:** re-raises digest entry **SW-05 / ADR 0052**, whose `_Rests on:_` line
  explicitly notes it "doesn't address whether the asymmetry still reads right as a Trip's
  own membership grows past a couple" — and which never considered the Globe at all.
- **Fix sketch:** Gate `inviteToGlobe` on `GlobeMember.role === "owner"` with the
  `isAdminEmail` bypass ADR 0045 grants elsewhere — `requireGlobeAccess` must return the
  role it already reads. Pair it with a `removeGlobeMember` so admission is reversible.

### ARCH-TEN-7 · A leaked Calendar feed token exposes booking references, confirmation numbers, addresses and private notes — not "only schedule"
- **Severity: P1** · **Blocks rollout: yes** — a subscription URL is the artefact most
  likely to leak, and there is no longer a single household whose members already know
  each other's confirmation numbers.
- **Evidence:** `app/api/calendar/[token]/route.ts:11-21` looks the feed up by token with
  no session check. Its queries select far more than dates: items select `address`,
  `link`, `booking`, `notes` `:29-35`; accommodations select `address`, `confirmation`,
  `notes` `:40-53`; transports select `reference`. All are serialised into the ICS body —
  `lib/ics.ts:181` (`booking`), `:225` (`confirmation`), addresses at `:188, 195, 253`.
  The only filters are three whole-category booleans (`route.ts:65-67`); there is no
  field-level floor.
  **The contrast is the finding.** `server/actions/share.ts:14-15` states the Share link's
  contract verbatim: *"Money, notes, confirmations and booking refs are never shared on any
  link."* And the public share page honours it exactly — `app/share/[token]/page.tsx:100-170`
  omits `notes`, `reference` and `confirmation` each with its own comment, and skips the
  query entirely when a dial is off.
- **Verification:** code read, independently re-verified including the share-page
  comparison.
- **Failure scenario:** Priya's partner subscribes to her Trip's feed and their work laptop
  syncs it into a shared team calendar. A colleague opens "Hotel Sakura" and reads the
  confirmation number, the street address and Priya's note about which card the deposit
  went on. Rotating the token stops future reads and does nothing about copies already
  synced into every subscriber's calendar store.
- **Prior art:** re-raises **SW-05 / ADR 0052**, which kept the Calendar feed
  member-accessible *because* "a Calendar feed exposes only schedule, so a member handing
  either out leaks far less than … Invite". **That premise is factually wrong in the
  code**, independent of Traveller count.
- **Fix sketch:** Apply ADR 0051's floor to the ICS builder — drop `booking`,
  `confirmation` and `notes` from the two selects, or gate them behind a per-feed dial
  defaulting off. `IcsItem`/`IcsAccommodation` already type those fields optional
  (`lib/ics.ts:26-36, 46-55`), so `buildICS` needs no change. Then amend ADR 0052 so its
  stated rationale matches the code.

### ARCH-TEN-5 · A Stop's `chapterId` is written from client input without confirming the Chapter belongs to the same Trip
- **Severity: P2** · **Blocks rollout: no** — damage is contained. Every Chapter read is
  Trip-scoped and `recomputeChapterSpans` only iterates chapters it read
  `where { tripId, ...planScope }` (`stop-flow.ts:88-91, 104-107`), so a foreign
  `chapterId` cannot write into another Trip or surface its Chapter's name. The Stop simply
  renders ungrouped in its own Trip.
- **Evidence:** three reachable paths — `stops.ts:1108-1120` (`assignStopToChapter`, no
  validation at all), `stops.ts:412` (`updateStop`'s rough branch), `stops.ts:167-172` and
  `:280-288` (`createStop` checks only `chapter.forkId`; the select is `{ forkId: true }`
  so `tripId` is never fetched). The correct shape is one file over:
  `chapters.ts:268-272` loads `{ tripId, forkId }` and rejects on
  `chapter.tripId !== stop.tripId`.
- **Verification:** code read (citation-checked).
- **Fix sketch:** Give `stops.ts` the check `chapters.ts` already has, in all three paths.
  Better: delete one of the two same-named `assignStopToChapter` exports — only the
  `chapters.ts` one is correct, and two exports with one name and different authorisation
  behaviour is itself the hazard.

### ARCH-TEN-6 · `createFeedbackNote` returns an existing note to any caller who supplies its `clientKey`
- **Severity: P2** · **Blocks rollout: no** — a `clientKey` is a v4 UUID, so guessing cost
  is prohibitive. Filed because the *check* is absent, and because Feedback notes are where
  a Traveller writes candidly about their own Trip.
- **Evidence:** `server/actions/feedback.ts:52-65` —
  `upsert({ where: { clientKey }, update: {}, create: {...}, select: VIEW_SELECT })`.
  `clientKey` is the sole `where` clause, globally unique, with no author component; on
  collision the no-op `update` arm returns the **existing** row through `toView` `:65`,
  yielding another Traveller's `body`, `route`, `tripName` and `authorName`. Validation
  accepts any 1–64 char string (`lib/validations/feedback.ts:15`). Generation has a
  `Math.random().toString(36)` fallback when `crypto.randomUUID` is unavailable
  (`lib/feedback-queue.ts:162-168`) — not cryptographically random.
- **Verification:** code read (citation-checked). **`INFERENCE`** on which browsers take
  the fallback branch.
- **Fix sketch:** Make uniqueness `(authorId, clientKey)` and put `authorId: user.id` in
  the upsert's `where`, so a colliding key creates a new row instead of returning someone
  else's. Migration plus two lines. Cheaper stopgap: compare `row.authorId` to `user.id`
  after the upsert and fail on mismatch.

### ARCH-TEN-8 · The cron secret is accepted in a query string, where it lands in access logs
- **Severity: P2** · **Blocks rollout: no** — the secret still gates the endpoint, and a
  holder gets dispatch, not content.
- **Evidence:** `app/api/cron/digest/route.ts:108-110` reads `?secret=`. The comparison
  itself is **correct**: constant-time `timingSafeEqual` with a length-mismatch early
  return `:87-92`, fail-closed when unset `:98`. The file's own comment `:105-107` names
  the hazard. There is no IP allow-list and no second factor.
- **Verification:** code read (citation-checked). **`INFERENCE`** that Vercel retains full
  request URLs in access logs.
- **Failure scenario:** the URL leaks into a support ticket or a log export. Each
  unauthorised run claims the ledger slot for every subscriber *before* sending
  `:236-237`, so the real run later finds the slot taken and sends nothing — and
  `lastSuccessAt` is still stamped because `failed === 0` `:273`.
- **Fix sketch:** Drop the query-param branch; the GitHub Actions workflow can set a header
  just as easily. Three lines plus a workflow edit.

### ARCH-TEN-9 · `targetId` is accepted unvalidated on `uploadAttachment` and `addNote`
- **Severity: P3** · **Blocks rollout: no** — the created row always carries the guarded
  `tripId`/`globeId`, so nothing crosses a tenancy boundary.
- **Evidence:** `attachments.ts:122` (globe path), `:177` (trip path), `notes.ts:69-79`.
  Contrast `costs.ts:50-99` (`verifyOwnerEntity`) and `votes.ts:25-34`
  (`requireItemInTrip`), which do exactly this check.
- **Verification:** code read (citation-checked).
- **Fix sketch:** Reuse `verifyOwnerEntity`'s shape in both actions. The tangible benefit is
  removing an orphan-blob path — a mis-targeted attachment is missed by
  `cleanupTargetSideData` when the intended entity is deleted, so the blob outlives its owner.

### ARCH-TEN-10 · Any Trip member can cancel a pending Invite, though only the owner can create one
- **Severity: P3** · **Blocks rollout: no** — a cancelled Invite is re-creatable in one
  action, and an *accepted* Invite is explicitly protected (`invites.ts:124-126`).
- **Evidence:** `server/actions/invites.ts:106-132` — `cancelInvite` calls
  `requireTripAccess(invite.tripId)` `:120` then deletes `:128`, with no role check, unlike
  `inviteToTrip` `:49` in the same file.
- **Verification:** code read (citation-checked).
- **Fix sketch:** Apply the same owner-or-admin clause three lines above the delete, and
  amend ADR 0052 to record that the owner-only rule covers the whole Invite lifecycle, not
  just granting.

### ARCH-TEN-11 · `getRecentActivity` sends other Travellers' user ids to the browser
- **Severity: P3** · **Blocks rollout: no** — the ids belong to fellow members of a Trip the
  caller can already see, and a `cuid` is not a credential.
- **Evidence:** `server/actions/activity.ts:49` —
  `include: { actor: { select: { id: true, name: true, image: true } } }`. Compare
  `lib/feedback-view.ts:29-34`, which records that FN-04 deliberately stopped shipping
  `authorId` and computed the one boolean it answered server-side instead.
- **Verification:** code read for the select. **`INFERENCE`** that no client component needs
  `actor.id`.
- **Fix sketch:** Drop `id` from the `actor` select. One word.

### ARCH-TEN-12 · The service-worker attachment cache is purged only when a Traveller presses Sign out
- **Severity: P2** · **Blocks rollout: no** — the strategy is network-first, so a cached
  response is served only when genuinely offline.
- **Evidence:** `public/sw.js:57-60` restricts caching to `/api/attachments/<id>`;
  `:89-91` network-first; `:178-183` purges on `CLEAR_CACHE`. The **only** sender is
  `components/ui/sign-out-button.tsx:16`. `lib/offline.ts:104` and `public/sw.js:55` both
  assert *"The cache is purged on sign-out, so this leaks nothing across users"* — true only
  for the button path. A JWT session expiring (`lib/auth.ts:65`), a cleared cookie, or a
  second Traveller signing in on the same browser profile all leave it in place, keyed by
  URL with no account component.
- **Verification:** code read. **`INFERENCE`** that no other `CLEAR_CACHE` sender exists,
  based on a repo-wide grep.
- **Failure scenario:** Priya checks a ticket on a friend's laptop and closes the tab
  without signing out. Sam later signs in on that profile, loses connectivity, and opens a
  page referencing a cached attachment. Network-first falls through to cache and serves
  Priya's boarding pass. Narrow — needs a shared profile *and* an offline moment — but it is
  the one path where the authenticated serve route is bypassed entirely, because the bytes
  never reach the server.
- **Fix sketch:** Send `CLEAR_CACHE` on sign-*in* as well as sign-out — an arriving session
  purging what the last one left is strictly safer than a departing one remembering to.
  Or key the cache name on the session user id.

## Destructive operations and data safety

A 23-row destructive-operation inventory and a full cascade map were produced; both are
worth reading in full if you touch deletion. The house rule is stated at
`components/trip/help-legend.tsx:96-98`: *"Deleting is never undoable."*

### ARCH-DAT-6 · The Journal autosaves a single shared row per Trip-day with last-write-wins
- **Severity: P0** · **Blocks rollout: yes** — the Journal is the only place in TEEPEE
  holding prose a Traveller cannot reconstruct, it is shared by every member, and the
  destructive path needs nothing unusual: two members, one day, one stale tab.
- **Evidence:** `prisma/schema.prisma:608` — `@@unique([tripId, date])`: one entry per Trip
  per day, for all members. `server/actions/journal.ts:59-71` upserts with
  `update: { body: trimmedBody, authorId: user.id }` — a whole-body replace with no version
  check, no merge, and silent reattribution of authorship. `:50-56` — an empty body after
  trim **deletes the row** with `deleteMany`, no confirmation.
  `components/trip/journal-editor.tsx:199-204` — `handleBlur` fires the save whenever
  `body !== initialBody`, where `initialBody` is the snapshot from page load.
- **Verification:** code read, independently re-verified.
- **Failure scenario:** On the evening of the 14th Elena writes four paragraphs in the
  Trip's Journal. Dan has the same Trip open in a tab from this morning — his `initialBody`
  is empty. He types "great day" into what looks like an empty box and clicks away. Elena's
  paragraphs are replaced by two words, the entry now reads as authored by Dan, and there
  is no confirmation, no undo, no conflict warning and no version history. Select-all and
  delete instead, and the entry is gone. Recovery means a whole-database rollback to 23:26
  UTC the night before, which will not happen for one Journal entry.
- **Prior art:** none — no ADR covers Journal concurrency or authorship. ADR 0007 addresses
  reorder and FX-snapshot concurrency only and does not name the Journal.
- **Fix sketch:** Send the loaded `updatedAt` with the save and reject when the stored row
  is newer, surfacing "someone else wrote here — reload" rather than clobbering. Stop
  treating an empty body as a delete. Separately decide whether a Journal day is one shared
  entry or one per Traveller — `authorId` being overwritten on every update suggests the
  shared model was never really intended.

### ARCH-DAT-1 · A Traveller admitted to a Trip can never be removed, and every member holds irreversible delete power over everything
- **Severity: P1** · **Blocks rollout: yes** — the whole point of independent Travellers is
  that each invites their own people. Today an invitation is a one-way grant.
- **Evidence:** `lib/guards.ts:69-80` — `requireTripAccess` returns for *any* `TripMember`
  row and reads `role`, but only three call sites test it: `trips.ts:258` (delete Trip),
  `:322` (duplicate), `invites.ts:49` (invite). Every other destructive action —
  `stops.ts:492`, `items.ts:430`, `costs.ts:271`, `accommodation.ts:292`,
  `transport.ts:451`, `chapters.ts:150`, `attachments.ts:236`, `forks.ts:314` — takes plain
  membership. A repo-wide grep for `tripMember.delete`, `removeTripMember` and
  `removeMember` across `server/`, `app/`, `lib/` and `components/` returns **nothing**.
  `invites.ts:124-126` explicitly refuses to cancel an accepted Invite.
- **Verification:** code read, independently re-verified (including the grep).
- **Failure scenario:** Nadia invites Tom to *Hokkaido, March*. They fall out. There is no
  control to remove him and none exists to build against. Tom taps the bin on the Sapporo
  Stop, confirms a dialog that says only "This can't be undone", and the hotel Nadia paid a
  deposit on goes with it. No undo, no per-Trip restore, last dump up to 24 hours old.
- **Fix sketch:** Add an owner-only `removeTripMember` that deletes the `TripMember` row —
  heeding `lib/guards.ts:59-67`'s warning about the memoised access check — and surface it
  on Settings beside the invite list. Separately decide whether `member` should be able to
  delete Stops and Accommodations at all; a read/suggest tier is the cheaper half of the fix
  and closes most of the blast radius.

### ARCH-DAT-2 · There is no documented restore procedure and no way to restore one Traveller's Trip
- **Severity: P1** · **Blocks rollout: yes** — with one household, "restore" meant "roll
  everything back, we're both here". With 10–15 independent Travellers, restoring one Trip
  would silently discard fourteen other people's last day, so in practice you will decline
  to restore at all.
- **Evidence:** `.github/workflows/db-backup.yml` is genuinely good and **better than you
  may remember**: daily `pg_dump --format=custom` at 23:26 UTC via the direct unpooled URL
  `:28, :72`, verified readable with `pg_restore --list` before being called a backup
  `:78-88`, uploaded as a 30-day artifact `:96`, and deliberately fail-loud when configured
  but broken `:22-25`. What is missing is everything after it: `docs/DEPLOY.md` is 275 lines
  and never mentions the workflow, `pg_restore`, or what to do after a bad delete. Its only
  restore-shaped instruction `:92-93` is a **migration-rehearsal** step. Grepping `docs/`
  and every root `*.md` for `pg_restore` and `db-backup` returns **zero hits**.
- **Verification:** code read, independently re-verified (workflow and the absence).
  **`INFERENCE`** on the off-repo NAS pull mentioned at `db-backup.yml:5-6`.
- **Recovery reality today:** RPO up to ~24 hours; retention 30 days; **RTO undefined**;
  granularity whole-database only.
- **Fix sketch:** Write a restore runbook into `docs/DEPLOY.md` covering both full rollback
  and selective single-Trip recovery via `pg_restore --data-only` into a scratch database
  plus a scripted re-insert of one `tripId`'s row closure. Rehearse it once against a Neon
  branch and record the elapsed time as the RTO. Then state the RPO and RTO in the help
  guide, so a Traveller knows what is actually promised.

### ARCH-DAT-3 · Uploaded files are not backed up and are hard-deleted
- **Severity: P1** · **Blocks rollout: yes** — a friend's Trip is where they put the booking
  PDF and the passport scan. Restoring the database gives back the row and the filename and
  never the file, which reads as a worse betrayal than a clean loss.
- **Evidence:** `db-backup.yml` dumps Postgres only — there is no R2 step in it or anywhere
  in `.github/workflows/`. `lib/storage.ts:207-210` issues an unconditional
  `DeleteObjectCommand`. `SETUP-R2-STORAGE.md` and `docs/DEPLOY.md:26-30` never mention
  versioning, lifecycle rules or a backup bucket. Blobs are deleted on Trip delete
  (`trips.ts:274-285`), Attachment delete (`attachments.ts:241-247`) and entity cleanup
  (`target-cleanup.ts:91-101`).
- **Verification:** code read, independently re-verified. **`INFERENCE`** on console-side
  bucket versioning — it is outside the repo, and nothing in the repo asks for it.
- **Fix sketch:** Enable R2 object versioning, or a lifecycle rule moving deletes to a
  tombstone prefix for 30 days so the window matches the database dump's. Document it as a
  required step in `SETUP-R2-STORAGE.md`. Cheaper interim: make blob deletion lazy — null
  the `storageKey` and sweep unreferenced objects weekly.

### ARCH-DAT-4 · Deleting a Stop silently destroys its Accommodations, their confirmation numbers and their unpaid Costs
- **Severity: P1** · **Blocks rollout: yes** — the most common destructive click in the app
  and the one a first-time Traveller is likeliest to make. Trip-delete and Fork-promote both
  itemise their blast radius; Stop delete, reachable from two surfaces and one tap away,
  does not.
- **Evidence:** `server/actions/stops.ts:497-519` reads the cascaded Accommodations *before*
  the delete precisely because `schema.prisma:337` cascades them, then runs
  `deleteOwnedCostsTx` and `cleanupTargetSideDataTx` over each. The dialog copy is
  `components/trip/stops-manager.tsx:36-40` and identically
  `components/trip/itinerary-manager.tsx:641-646` — `title: 'Delete "<name>"?'`,
  `description: "This can't be undone."` Neither reads the Stop's Accommodation, Cost, Note
  or Attachment counts.
- **Verification:** code read (citation-checked).
- **Failure scenario:** Aisha deletes the *Porto* Stop meaning to re-add it with different
  dates. "This can't be undone" reads to her as "the Stop is gone", which she has already
  accepted. What actually goes is the guesthouse, its `confirmation` string, its check-in
  times, its unpaid €240 Cost, her partner's note and the attached PDF.
- **Fix sketch:** Give `deleteStop` a preview action shaped like `getPromotionPreview` that
  counts what will go, and render it in the dialog. Where the list is non-empty, escalate to
  the type-the-name confirm the Danger zone already uses. The same preview should back
  Accommodation and Transport deletes, which lose confirmation numbers and booking
  references under the same bare copy.

### ARCH-DAT-5 · Promoting a Fork deletes the real plan's ever-paid Costs
*(Found independently by the data-safety and boundaries lanes; merged. The boundaries lane
filed it P0 on the grounds it was silent — that premise is refuted, see below.)*
- **Severity: P1** · **Blocks rollout: no** — the dialog warns, itemises and requires typing
  the Fork name, so it is not silent. It is here because the rule it breaks is a written
  product promise a friend will have read, and the money is unrecoverable within the RPO.
- **Evidence:** `server/actions/forks.ts:788-794` — `tx.cost.deleteMany` over
  `{ tripId, forkId: null, NOT: { ownerType: "ITEM", ownerId: { in: ideas } } }`. The
  predicate tests only whether the owner is a surviving Wishlist idea; `paidMinor` and
  `paidAt` are never consulted and `deleteOwnedCostsTx` (`owned-costs.ts:44-59`) is not
  called — unlike every other deletion path (`items.ts:437`, `accommodation.ts:292`,
  `transport.ts:451`, `stops.ts:505`). `CONTEXT.md:109` promises *"every figure here is real
  money; nothing paid ever counts as zero"*.
  **Why not P0:** `forks.ts:648` pushes a `kind: "PAID_COST"` entry into the promotion loss
  list for every paid Cost, and `promote-fork-dialog.tsx:213-251` renders them in a
  destructive-styled block behind a type-the-Fork-name confirmation. Verified directly.
- **Verification:** code read, independently re-verified including the dialog.
- **Prior art:** `docs/adr/0039-costs-survive-their-owners-by-paid-state.md:36-44` records
  this as a *"Known exception … pending a follow-up decision"* — recorded, never decided.
  **This finding is that decision coming due.**
- **Fix sketch:** Route the deletion through `deleteOwnedCostsTx`, or replicate its rule
  inline: delete never-paid real-plan Costs, convert ever-paid ones to `ownerType: "OTHER"`
  labelled `"<label> (replaced by <fork name>)"`. That turns the loss list's `PAID_COST`
  entries from "will be destroyed" into "will move to Other costs" — truthful, and the
  behaviour ADR 0039 already specifies everywhere else. Close the ADR's open exception at
  the same time.
- **Latent adjacent case:** `Cost.fork` cascades with no paid check either
  (`schema.prisma:402`), currently harmless only because `lib/fork-plan.ts:272-273` copies
  Fork Costs unpaid. Fix both together.

### ARCH-DAT-7 · Promoting a Fork orphans Attachments and Notes, and the dialog says they were discarded when they were not
- **Severity: P2** · **Blocks rollout: no** — nothing is lost, but the Traveller is asked to
  accept a loss that does not occur, and the dead rows accumulate unidentifiably.
- **Evidence:** `forks.ts:768-807` touches `stop`, `chapter`, `transport`, `accommodation`,
  `item`, `cost` and `fork` only — no `attachment` or `note` statement, and
  `cleanupTargetSideDataTx` is not called. `Attachment.targetType/targetId`
  (`schema.prisma:485-486`) and `Note.targetType/targetId` (`:432-433`) are soft references
  with no foreign key, so nothing cascades. Meanwhile `forks.ts:666-679` builds `ATTACHMENT`
  entries into the loss list and `promote-fork-dialog.tsx:217` renders them under
  *"Promoting will discard these committed things"*. `app/(app)/trips/[tripId]/files/page.tsx:46-60`
  lists attachments by `tripId` alone, so they still appear afterwards, filed under a Stop
  that no longer exists.
- **Verification:** code read (citation-checked).
- **Fix sketch:** Pick one and make the dialog match — re-target the rows onto the promoted
  entities using the ID map the transaction already has (the better fit for a Trip-wide
  model), or delete them and keep the copy honest. Either way add a sweep for rows whose
  `targetId` matches nothing live.

### ARCH-DAT-8 · Deleting a Traveller destroys other Travellers' files and notes, or fails outright
- **Severity: P2** · **Blocks rollout: no** — nothing in the app deletes a `User` today. But
  "remove someone who has left" becomes a routine request, and the only way to do it is by
  hand against production.
- **Evidence:** `schema.prisma:496` — `Attachment.uploadedBy ... onDelete: Cascade`:
  deleting a Traveller destroys every file they uploaded **including on Trips they do not
  own**. Same at `:437` (`Note.author`) and `:624` (`Activity.actor`). Against that, `:137`
  (`Trip.createdBy`), `:176` (`Fork.createdBy`), `:603` (`JournalEntry.author`), `:639` and
  `:701` carry no `onDelete`, which Prisma defaults to `Restrict` for a required relation —
  so the delete aborts. And `:734-739` records that `FeedbackNote.authorId` was deliberately
  de-keyed *"so feedback outlives … the Traveller who wrote it"* — the opposite instinct.
- **Verification:** code read (citation-checked). **`INFERENCE`** that the implicit default
  is `Restrict` rather than an explicit choice.
- **Fix sketch:** Decide what deleting a Traveller means and write it down, then make the
  schema say it: a file belongs to the Trip, not the uploader, so `Attachment.uploadedBy`
  and `Note.author` should be `SetNull` on a nullable column with a name snapshot if
  attribution matters — as `FeedbackNote.authorName` already does. Until then, add a
  "removing a Traveller" section to `docs/DEPLOY.md` saying plainly that it is not supported.

### ARCH-DAT-9 · Storage blobs are destroyed before the database write that justifies destroying them
- **Severity: P2** · **Blocks rollout: no** — needs a failure in a narrow window, but the
  surviving state is the worst of both.
- **Evidence:** `trips.ts:274-285` awaits every blob delete, then `:287` runs
  `db.trip.delete`. `attachments.ts:241-247` deletes the blob, then `:250` the row. The
  transaction-scoped helpers get this right and say why — `target-cleanup.ts:70-88` deletes
  rows inside the caller's transaction and returns keys so `deleteBlobsBestEffort` `:90-101`
  runs *after* commit: *"a blob delete cannot be rolled back, so it must not run inside the
  tx."* The pattern is understood; two call sites predate it.
- **Verification:** code read (citation-checked).
- **Fix sketch:** Invert both call sites to match the helper. An unreferenced blob costs
  storage; a referenced missing blob costs trust.

### ARCH-DAT-10 · Deleting a Stop detaches its dated Items rather than deleting them, so they vanish from the Plan but stay in the Budget and Calendar
- **Severity: P2** · **Blocks rollout: no** — nothing is destroyed; the Trip quietly
  disagrees with itself.
- **Evidence:** `schema.prisma:370` — `Item.stop ... onDelete: SetNull`; the Item keeps its
  `date`. The Plan editor groups day rows by Stop date coverage
  (`plan/page.tsx:330` → `lib/stop-days.ts:85-100`) and drops unfiled Items outright at
  `plan/page.tsx:322` (`if (!item.stopId) continue;`). The Calendar still shows them —
  `calendar/page.tsx:42-43` queries `{ tripId, forkId: null, date: { not: null } }` with no
  Stop join. Their Costs still roll into the Budget. `items.ts:540-544` states the
  consequence in its own comment.
- **Verification:** code read (citation-checked).
- **Fix sketch:** Run the same `resolveOwningStop` hand-off inside `deleteStop` that ADR 0055
  already applies to a shortened Stop: re-file each dated Item onto whichever Stop still
  covers its date, and clear the date only where none does — which also makes the Item
  visible again in things-to-do.

### ARCH-DAT-11 · Four Stop date writers still write outside the canonical plan lock
- **Severity: P2** · **Blocks rollout: no** — the contention window is small and the outcome
  is a wrong date rather than a destroyed row. Raised because ADR 0007's own amendment left
  these open as "lower-contention", and lower contention was measured against two people in
  one house.
- **Evidence:** `docs/adr/0007-concurrency-locking-and-tx-boundaries.md:68-75` names them
  itself: *"Known residual unlocked writers … `updateStop`'s scheduled branch …,
  `makeStopRough` …, and `firmUpSegment` / `firmUpTrip`."* Confirmed: `stops.ts:449-473`
  opens a transaction but takes no `lockPlanStopsTx`, unlike `moveStop` at `:543-547`.
- **Verification:** code read (citation-checked).
- **Fix sketch:** Have `updateStop`'s scheduled branch and `makeStopRough` take
  `lockPlanStopsTx` — both already run inside a transaction, so it is one added call each.
  Wrapping `firmUpTrip`'s per-Stop loop is the larger piece and would also close the ADR 0055
  limitation currently accepted.

### ARCH-DAT-12 · The migrate-then-build deploy gap is no longer a window only the operator can fall into
- **Severity: P2** · **Blocks rollout: no** — but the assumption the decision rested on has
  changed, which is why it is here rather than left closed.
- **What changed:** digest entry `OPS-08` recorded this as an accepted Hobby-tier trade-off,
  generalised into `docs/DEPLOY.md` §4b as a per-migration check. It was accepted when the
  only people writing during a deploy were the operator and his partner, who knew a deploy
  was happening. `docs/DEPLOY.md:99` still advises *"Deploy at a quiet moment"* — a control
  you no longer have once Travellers are spread across time zones.
- **Evidence:** `vercel.json:4` — `prisma migrate deploy && next build`, no gate between
  them. `docs/DEPLOY.md:74-142` documents all three hazard shapes thoroughly and `:127-135`
  records the `share_links_per_audience` case.
- **Verification:** code read (citation-checked).
- **Note:** the §4b procedure is genuinely good and all three 2026-09-21 migrations pass it
  on both read and write paths — verified additive, none renaming a column, adding a
  `NOT NULL` without default, or dropping a unique constraint an older client upserts against.
- **Fix sketch:** Keep §4b. Add what it cannot give: a deploy-time signal Travellers can see,
  so a failed write during the window reads as "we're updating, try again in a minute" rather
  than as lost work. Re-word `:99` now that there is no quiet moment.

### ARCH-DAT-13 · A Traveller has no way to take a copy of their own Trip out of TEEPEE
- **Severity: P3** · **Blocks rollout: no** — but it is the cheapest mitigation for
  `ARCH-DAT-1` through `-4`, because it lets a Traveller rescue themselves without you.
- **Evidence:** the full `app/api/` route inventory is `fx`, `push`, `calendar/[token]`,
  `auth/[...nextauth]`, `attachments/[id]`, `cron/digest`, `trips/[tripId]/cover` — no
  export route, and no export-shaped name anywhere in `app/`, `components/`, `server/`,
  `lib/` or `docs/`. The ICS feed publishes schedule only and carries no Costs, Notes,
  Journal or files.
- **Verification:** code read (citation-checked).
- **Fix sketch:** A per-Trip JSON export on Settings covering the six plan entities plus
  Notes, Journal, Checklists and an attachment manifest, gated by membership. It is a
  read-only query against shapes `getComparison` already assembles, and it turns "can you
  promise my Trip is safe?" into a question the Traveller can answer themselves.

## Observability

Confirmed and not re-derived: **no Sentry or equivalent exists anywhere in the codebase**.
`@vercel/analytics` is pageview and web-vitals telemetry only; its `beforeSend`
(`components/analytics.tsx:43-48`) redacts URLs and reports no errors.

### ARCH-OBS-1 · Every server-side failure terminates in a bare `console.*` with no downstream sink
- **Severity: P1** · **Blocks rollout: yes** *(orchestrator override — the reviewer filed
  this "no"; its own text calls it "the direct, structural cause of the operator's #2 fear",
  and operating for 10–15 people with no error sink at all is a gate, not a nice-to-have)*
- **Evidence:** `app/api/cron/digest/route.ts:156, 245-248, 280`; `lib/digest-dispatch.ts:656-661, 712-717`;
  `server/actions/attachments.ts:138, 142, 196, 200` — heartbeat, dispatch, release-claim,
  zero-delivery and upload failures all `console.error` only. No file imports Sentry, Axiom,
  Logtail or Better Stack, and nothing posts to a webhook on error.
- **Verification:** code read (citation-checked).
- **Failure scenario:** Priya hits a Prisma error updating her Budget at 11pm. She sees
  "Something went wrong, try again", retries, and it works or she gives up. The only trace
  is one line in Vercel's Runtime Logs, which nobody is watching. It stays unnoticed
  indefinitely unless she independently chooses to open the Feedback panel.
- **Fix sketch:** A minimal sink — Sentry's free tier, or even a webhook — wired into the
  few entry points that matter: the cron route, `dispatchDigest`, and the error boundaries.
  It does not need to be exhaustive on day one; catching those converts "finds out never"
  into "finds out same day".

### ARCH-OBS-2 · The app's own error boundaries log client-side only
- **Severity: P1** · **Blocks rollout: yes** *(orchestrator override, same reasoning —
  and stronger: OBS-1 is "you must go looking", this is "there is nothing to find")*
- **Evidence:** `app/(app)/error.tsx:1, 20-22`, `app/(app)/trips/[tripId]/error.tsx:20-22`
  and `app/global-error.tsx:1, 17-19` are all `"use client"` components whose only
  instrumentation is `useEffect(() => { console.error(...) }, [error])` — executing in the
  Traveller's own browser devtools, not on the server.
- **Verification:** code read (citation-checked).
- **Failure scenario:** a Client Component rendering error unwinds into a boundary. The
  Traveller sees "Something went wrong… Try again", and the only record of what threw is a
  line in a devtools console on one device in one tab session, gone when they close it. You
  have no path to it, ever, for any Traveller not sitting next to you.
- **Fix sketch:** Have each boundary's `useEffect` also POST the error message, digest and
  route to a lightweight endpoint. Even a same-origin `fetch("/api/client-error")` that just
  `console.error`s server-side moves this from unreachable to at least present in Vercel logs.

### ARCH-OBS-4 · Digest health is a single global row, so one Traveller's digest can be permanently broken while Account reports "healthy" to everyone
- **Severity: P1** · **Blocks rollout: no** — most sends keep working. First thing to fix
  after the shortlist.
- **Evidence:** `server/actions/cron-health.ts:38-41` — `findUnique({ where: { id: "digest" } })`:
  one row, one fixed id, read identically for every Traveller.
  `app/api/cron/digest/route.ts:160-282` — `sent`/`failed` are run-level counters across
  every Traveller and Trip, and `lastSuccessAt` is stamped whenever `sent > 0` **anywhere in
  the run**, per the code's own comment `:262-264`: *"one bad trip among several … is a
  working run. Stamp."*
- **Verification:** code read (citation-checked).
- **Failure scenario:** Sofia's Trip trips a bug in `collectDigestInput` every evening. Her
  dispatch always throws and is caught per-trip `:238-249`. The other fourteen Travellers'
  digests go out, so `sent > 0`, so `lastSuccessAt` keeps stamping, so `isDispatcherUnhealthy`
  (`lib/cron-health.ts:69-75`) stays false — and Sofia's own Account page tells *her* the
  dispatcher is healthy. That page is the exact screen ADR 0048 built so a Traveller could
  self-diagnose a broken Digest. This can run for months with no signal to her or to you.
- **Prior art:** re-raises digest entry **CD-06**, whose `_Rests on:_` line reads *"nothing
  about Traveller count — one global signal for the whole deployment's dispatcher, not per
  Traveller."* That is precisely the assumption independent Travellers break: one bit of
  health state was an adequate proxy for "is my digest working" only while one household sat
  behind it.
- **Fix sketch:** Add a per-(user, trip) failure signal — a `lastFailedAt` or consecutive-
  failure count on `DigestDispatch` — surfaced on that Traveller's own Account view. The
  global `CronHeartbeat` row can stay as the coarse "is the cron firing at all" check.

### ARCH-OBS-3 · `recordActivity` swallows every failure silently
- **Severity: P2** · **Blocks rollout: no** — Activity is a secondary feature, but this is
  the quietest failure path in the codebase.
- **Evidence:** `server/actions/activity.ts:15-32` — the entire body including `requireUser()`
  and the `create` is wrapped in `try { ... } catch { }` with no logging at all. Other
  deliberate-swallow sites (`attachments.ts:138,196`, `target-cleanup.ts:30-34,60-64`) at
  least name what they swallow in a comment.
- **Verification:** code read, independently re-verified alongside `ARCH-TEN-2`.
- **Fix sketch:** `console.error` inside the catch with `tripId`, `verb` and `entityType`.
  "Best-effort" and "untraceable" are independent properties, currently conflated.
- **See also:** `ARCH-TEN-2` — the same function's missing authorisation check. Fix together.

### ARCH-OBS-5 · The cron watchdog never inspects its own response body
- **Severity: P2** · **Blocks rollout: no** — compounds `ARCH-OBS-4` rather than adding a
  new failure mode.
- **Evidence:** `.github/workflows/digest-cron.yml:76-92` captures only the HTTP status:
  `exit 1` on `503` `:85-89`, a soft `::warning` on other non-2xx `:90-92`, nothing
  otherwise. The body — `{ considered, dispatched, sent, skipped, failed }`
  (`route.ts:284`) — is only `cat`'d into the run log for a human. No `jq`, no threshold,
  no failure on `failed > 0`.
- **Verification:** code read (citation-checked).
- **Failure scenario:** a change breaks dispatch for every subscriber but the route still
  returns 200 with `{"sent":0,"failed":15}`. The job goes green five times a day forever.
- **Fix sketch:** A `jq '.failed'` check after the `cat`, failing the job when `failed` is a
  meaningful fraction of `dispatched`. A few lines of shell.

### ARCH-OBS-6 · Recovery from ADR 0048's own documented failure mode is entirely passive
- **Severity: P2** · **Blocks rollout: no** — but it is the gap most likely to recur, since
  ADR 0048 documents it already happening once.
- **Evidence:** `lib/devices.ts:14` defines `DEVICE_STALE_AFTER_DAYS = 14`;
  `isDeviceStale`/`formatLastSeen` (`:33, :52`) have exactly two consumers —
  `server/actions/devices.ts:181` and `components/account/devices-panel.tsx:218`, both
  feeding the Account device list. Nothing else reads either: no banner, no alternate-channel
  notification, no email.
- **Verification:** code read (citation-checked).
- **Failure scenario:** exactly ADR 0048's incident — iOS silently revokes notification
  permission while `web-push` still returns 201 — happens to Deniz, who has no reason to
  visit Account → Devices. He simply stops getting Digests and nothing tells him. ADR 0048
  was written because *you* stumbled onto this yourself; a Traveller has no equivalent path.
- **Fix sketch:** Surface it on the channel that is guaranteed not to be the broken one —
  an in-app banner on next sign-in: "we haven't been able to reach your device with a Digest
  in N days".

### ARCH-OBS-7 · The Feedback panel is the sole channel to you, and it depends on proximity that disappears
- **Severity: P1** · **Blocks rollout: no** — nothing to build differently before launch.
  Read it as the "so what" behind the other six.
- **Evidence:** `server/actions/feedback.ts:41-66` — a Traveller must actively open the panel
  and write free text; nothing auto-generates a note from a caught error.
  `docs/feedback/inbox.md` shows 8 resolved / 0 open, every note authored by the operator's
  own household.
- **Verification:** code read for the mechanism. **`INFERENCE`** for the social claim — a
  reasonable prediction, not derivable from code.
- **Why it matters:** the single existing "operator finds out" path was only ever load-bearing
  because the operator and the Travellers were the same two people. Priya has never met you,
  doesn't know your name is attached to TEEPEE, and has no habit of mentioning app hiccups
  the way a co-planning partner does.
- **Fix sketch:** Not a code fix by itself — the fix is `ARCH-OBS-1`/`-2`. If you want a
  Feedback-adjacent improvement, add a one-tap "report this" to the error boundary,
  pre-filled with the error digest.

## Module boundaries

The lane was explicitly told that file size is not a finding here, and it produced none.
`lib/admin.ts`'s client-import warning holds; money and FX are properly centralised in
`lib/money.ts`/`lib/fx.ts`/`lib/budget.ts`; timezone handling is centralised in `lib/tz.ts`
with no bypasses; `lib/globe.ts` is a legitimate parallel access gate, not a layering
violation; and the flat 98-module `lib/` namespace was checked for concept-level collisions
in money, dates, fork and auth — none found.

### ARCH-BND-2 · The `forkId: null` real-plan discriminator is hand-typed in 40+ places despite a shared constant existing
- **Severity: P2** · **Blocks rollout: yes, narrowly** — ADR 0020 itself calls auditing every
  `forkId`-scoped query *"the main ongoing cost of this approach"*, and scattering the literal
  defeats that audit.
- **Evidence:** `lib/plan-scope.ts:8, 11-13` defines `REAL_PLAN`/`planScope()`; only
  `server/actions/ai.ts`, `chapters.ts` and `search.ts` import it. 45+ inline literals
  elsewhere, e.g. `calendar/page.tsx:30,43,60,76,92`; `summary/page.tsx:124,132,195,212,229,239,243,256,262`;
  `day/[date]/page.tsx:79,95,115,135,174,360`; `app/share/[token]/page.tsx:105,123,142,161`;
  `lib/digest-dispatch.ts:157,211,241,372,376,423,437`; `forks.ts:70,435,588,589,747,775-793`.
  `chapters.ts` mixes both styles — `planScope` at `:61,72,179`, hardcoded at `:352`.
- **Verification:** code read, grep-audited (citation-checked).
- **Fix sketch:** Replace inline literals with `REAL_PLAN`/`planScope()`. Mechanical, and it
  is what makes "did we scope every query correctly?" answerable by grep rather than by hope.

### ARCH-BND-3 · "Owner, or an ADMIN_EMAILS operator" is copy-pasted three times instead of being one named guard
- **Severity: P2** · **Blocks rollout: yes** — this is the exact shape of the leak fear:
  duplicated authorisation predicates are harder to verify than one named function.
- **Evidence:** identical `membership.role !== "owner" && !isAdminEmail(user.email)` at
  `server/actions/trips.ts:258` (`deleteTrip`), `:322` (`duplicateTrip`) and
  `server/actions/invites.ts:49` (`inviteToTrip`). `lib/guards.ts` holds every other shared
  gate but no composite owner-or-admin helper.
- **Verification:** code read (citation-checked).
- **Failure scenario:** a future Danger-zone action copies the pattern and transposes
  `!==`/`===` or drops the admin clause, silently changing who can act on someone else's Trip.
- **Fix sketch:** Add `requireOwnerOrOperator(membership, user)` to `lib/guards.ts` and call
  it from all three. Do this **before** `ARCH-TEN-4` and `ARCH-DAT-1`, which both add a
  fourth and fifth site.

## Large components

Two findings here are P0 by severity but **not** rollout gates: both are reachable by a
single Traveller acting alone, so they affect you today exactly as much as they will affect
a friend. More Travellers raise the odds, not the nature.

`help-guide.tsx` (1,352 lines) has zero `useState`/`useEffect` — static and prop-driven, no
state-divergence surface. `transport-form-dialog.tsx` follows the `<FormDialog>` remount-key
pattern correctly. `feedback-launcher.tsx` is a real client state machine whose every edge
case is already documented in-line and closed. `lib/flags.ts` is pure functions over passed-in
arrays.

**Untested behaviours in `itinerary-manager.tsx`** (none has any test; `reorderStops`/
`reorderChapters` are never mocked to fail and `onUndo` is never invoked):
the Undo callback itself `:1461-1483`; the `reorderStops` failure branch `:1318-1324`; both
`reorderChapters` failure branches `:1379-1386` and `:1416-1424`; and the two-step
rough-chapter persist where the chapter reorder succeeds and the follow-up stop reorder fails
`:1388-1398`.

### ARCH-CMP-2 · Undo on a scheduled drag restores the entire Trip's Stop snapshot, discarding any edit made in the 6-second window
- **Severity: P0** · **Blocks rollout: no** — reachable by one Traveller alone, so it is not
  made qualitatively worse by more of them. Fix it early anyway.
- **Evidence:** `components/trip/itinerary-manager.tsx:1263-1270` — the snapshot is captured
  from every Stop, and the code says so: *"Snapshot the pre-drag state of EVERY stop (order +
  chapter + dates)"*. Same full-list capture at `:1342-1349` for the chapter drag.
  `:1461-1483` wires `onUndo` to `restoreStops(preDragSnapshot, …)`.
  `components/ui/undo-toast.tsx:10` — `duration = 6000`. `server/actions/stops.ts:1305-1341`
  writes every snapshotted field verbatim — its own comment `:1312` says *"no reflow, no
  derivation"* — with no version or timestamp check against current state.
- **Verification:** code read, independently re-verified.
- **Failure scenario:** Marcus drags Stop A; the toast says "Moved Rome; 2 stops had dates
  shifted [Undo]". Within six seconds — entirely plausible while reorganising — he drags Stop
  B, or fires "Firm up this leg", or edits an Accommodation's dates. He then decides the first
  move was wrong and clicks Undo. `restoreStops` writes back the pre-Stop-A state for every
  Stop in the plan, silently reverting Stop B's move and the accommodation edit, with no
  toast and no way to tell beyond re-reading the whole plan.
- **Fix sketch:** Scope the snapshot and restore to the rows that actually changed — the
  server's `changed` list already identifies them — or have `restoreStops` no-op per row when
  the current state does not match what the snapshot expected to revert from. The second is
  an optimistic-concurrency check and also closes part of `ARCH-TEN-1`'s shape.
- **See also:** `ARCH-TEN-1` — the same function's missing ownership check.

### ARCH-CMP-1 · A revalidation can silently discard an in-flight local edit, because the props-to-local resync treats any new object reference as authoritative
- **Severity: P0** · **Blocks rollout: no** — same reasoning as `ARCH-CMP-2`; it does get
  more likely as more Travellers make more pages revalidate.
- **Evidence:** `app/(app)/trips/[tripId]/plan/page.tsx:378-410` — `initialStops`,
  `initialTransports` and `chapters` are freshly allocated arrays on every render, regardless
  of whether the data changed. `components/trip/itinerary-manager.tsx:523-540` — the sync
  compares by reference only: `if (trackedInitialStops !== initialStops) { … setLocalStops(…) }`,
  with no content check and no check for a pending local mutation. Essentially every action on
  the Trip calls `revalidatePath(/trips/${tripId})`.
- **Verification:** code read (citation-checked). **`INFERENCE`** on the framework propagation
  step — Next's automatic route refresh after a Server Action reaching an already-mounted
  client tree was reasoned from documented behaviour, not observed.
- **Failure scenario:** Priya deletes a Transport leg; the handler optimistically removes it
  and awaits the action. In the same moment another tab — or her co-Traveller Jono editing a
  Note — triggers any action that revalidates the page. The Server Component reruns, hands down
  a new array not yet reflecting her delete, and the reference-only guard overwrites her
  optimistic removal; the leg flickers back until her own revalidation lands.
- **Fix sketch:** Compare incoming props by content (id + `updatedAt`) rather than array
  identity before clobbering, or track "has an uncommitted local mutation" and defer. At
  minimum memoise the arrays built in `page.tsx`.

### ARCH-CMP-3 · On a failed reorder, local state reverts to raw un-normalised props, bypassing the file's own ordering invariant
- **Severity: P2** · **Blocks rollout: no** — order-only, until the next unrelated
  revalidation happens to fix it (which `ARCH-CMP-1` shows is not guaranteed soon).
- **Evidence:** `itinerary-manager.tsx:1318-1324` reverts with `setLocalStops(initialStops)` —
  the raw prop, not `orderPlanStops(initialStops)`. Same at `:1383-1384`, `:1396-1397` and
  `:1421-1422`, which also use the raw `chapters` prop rather than `effectiveChapters`.
  Contrast `:526-531`, which normalises on every other prop-sync path *"so the editor renders
  correctly regardless of the order the caller passed stops in"*. Because the object references
  have not changed, the render-time guard does not fire again to correct it.
- **Verification:** code read (citation-checked). No test exercises any of these four branches.
- **Fix sketch:** Revert using the already-captured `preDragSnapshot` run through
  `orderPlanStops`, and use `effectiveChapters` rather than the raw prop — matching every
  other local-state path in the file.

### ARCH-CMP-4 · An empty chapter's delete button is undersized against ADR 0029 and not logged as a deliberate exception
- **Severity: P3** · **Blocks rollout: no**
- **Evidence:** `itinerary-manager.tsx:2024-2036` uses `size="sm"` with `h-7 w-7 p-0` (28px).
  ADR 0029 §1 (`docs/adr/0029-normalized-ui-conventions.md:25-38`) mandates 32px for icon
  buttons, citing `<RowActions>`'s coarse-pointer 44px expansion for WCAG 2.5.5.
  `COMPONENTS.md:347-357` lists the sites deliberately skipped — this one is **not** among
  them, suggesting the omission was accidental.
- **Verification:** code read (citation-checked).
- **Fix sketch:** Migrate to size-8 or wrap in `<RowActions onDelete={…}>`; or, if the size is
  deliberate, add it to `COMPONENTS.md`'s exceptions list.

## ADRs versus code

All **56** ADRs were triaged: **18** tenancy-relevant (verified in full), **8**
behaviour-defining (spot-checked), **30** settled and inert. **18 of 18 bucket-A ADRs are
honoured** — zero drifted, zero never-implemented. ADR 0044 and ADR 0046, the two isolation
rules expressed as ADRs, were verified in depth and both hold.

The findings below are therefore not drift in the usual sense. Two are decisions whose stated
reasoning has expired, and three are vocabulary slips.

### ARCH-ADR-1 · Duplicating a Trip silently re-grants every co-Traveller's membership, with no per-Traveller consent
- **Severity: P1** · **Blocks rollout: yes** — for any Trip with more members than the
  duplicator, which is the normal shape once Trips have several independent Travellers.
- **Evidence:** ADR 0018 copies co-Traveller memberships because *"this is a two-person app
  where the same couple reuses skeletons"*. `server/actions/trips.ts:358-363` loops
  `source.members` and creates a `TripMember` row on the new Trip for each.
  `components/trip/duplicate-trip-dialog.tsx:90` only *informs* the duplicator: "Your
  co-travellers will be added to the duplicate too."
- **Verification:** code read (citation-checked).
- **Failure scenario:** Priya owns a 6-person group Trip and duplicates it as a skeleton for
  an unrelated personal trip with her partner. All five former co-Travellers are silently
  added to the new Trip — full access to its itinerary, costs and notes — with no say, and
  nobody but Priya is even told.
- **Fix sketch:** **The code faithfully implements the existing decision; the decision needs
  updating, not the code.** Amend ADR 0018 to make membership-copy opt-in — a checklist at
  duplicate time — or explicitly re-decide that blanket copy-and-notify is still right at
  10–15 Travellers.

### ARCH-ADR-3 · A Globe invite to someone who already has a Globe dead-ends silently while reporting success
- **Severity: P1** · **Blocks rollout: yes** — a common case once Travellers are independent
  and may each already have a solo Globe, not the rare one ADR 0023 deferred.
- **Evidence:** `lib/globe-invites.ts:21-29` returns `null` silently when
  `userAlreadyHasGlobe`; `components/globe/globe-invite-button.tsx:93-96` still shows
  "Invited — they'll join when they next sign in" regardless. Separately,
  `globe-invite-button.tsx:90` enforces a 2-member cap (`members.length < 2`) that ADR 0023
  never specified and the server never checks.
- **Verification:** code read (citation-checked).
- **Failure scenario:** Marco invites Devi, who already has her own populated Globe. Marco is
  told "Invited". The invite never resolves and never will, and neither party is told.
- **Fix sketch:** Don't show success copy the invite cannot back up; surface the stuck state.
  The full merge flow can stay deferred as ADR 0023 intended — only the false success needs
  fixing. Also decide whether the client-side 2-member cap is real, and if so enforce it
  server-side.

### ARCH-ADR-4 · Bare "Member" leaks into Traveller-facing and assistive-tech copy
- **Severity: P3** · **Blocks rollout: no**
- **Evidence:** `CONTEXT.md`'s **Traveller** *Avoid* list forbids "Member" —
  `app/(app)/trips/[tripId]/layout.tsx:127`, `components/trip/checklist.tsx:553, 558`,
  `components/trip/settings/invite-panel.tsx:89`.
- **Fix sketch:** Rename the fallback strings to "Traveller" / "Assigned Traveller".

### ARCH-ADR-5 · "Command palette" — a deliberately internal name — reaches screen readers
- **Severity: P3** · **Blocks rollout: no**
- **Evidence:** the **Search** entry's *Avoid* list versus `components/command-palette.tsx:403`'s
  `sr-only` title.
- **Fix sketch:** Rename to "Search".

### ARCH-ADR-6 · Demo seed data still labels a Cost change "Actual", a pre-ADR-0037 term
- **Severity: P3** · **Blocks rollout: no**
- **Evidence:** `lib/demo/eu-trip.ts:1581`, rendered by `components/trip/activity-feed.tsx:113, 116`.
  The real labeller (`lib/activity.ts:204`) already says "You paid".
- **Fix sketch:** Fix the one seed-data label.

---

# The door — specified, not built

This is the access-control design agreed with the operator on 2026-09-22. **No code was
written for it.** It is recorded here so it can be built later from this section alone.
It closes `ARCH-TEN-3`.

## Publish the Google OAuth app to Production

**It costs no money.** `lib/auth.ts` sets no `authorization` or `scope` override, so
NextAuth's Google provider requests the default `openid email profile` — all **non-sensitive**
scopes. Apps using only non-sensitive scopes publish without verification and without the
paid security assessment, which is triggered only by *restricted* scopes (Gmail, Drive,
Calendar data). TEEPEE requests none of those.

**What it does cost** is a consent-screen form plus two pages that do not exist today: there
is no `app/privacy` and no `app/terms`. Google's consent screen for a published app requires
an app name, support email, developer contact, authorised domain, and a privacy policy URL
(terms is usually wanted too).

**What it buys:** the 100-test-user ceiling disappears, and so does Testing mode's 7-day
refresh-token expiry — the latter already irrelevant here, since the app uses
`session: { strategy: "jwt" }` (`lib/auth.ts:65`) and never refreshes Google tokens.

*Verify Google's current console requirements at the time of building; this reflects the
policy as understood on 2026-09-22.*

## One door, in code

A `signIn` callback checking TEEPEE's own allowlist becomes the **only** gate, so approving
someone inside TEEPEE is sufficient and the Cloud Console test-user list stops being a
second, invisible, hand-maintained door. Every future login provider inherits the same gate —
which is the reason for doing it this way rather than keeping two doors.

Shape it exactly like `isAdminEmail` (`lib/admin.ts:13-24`): a server-only `lib/` predicate,
env-var backed so it is revocable without a deploy, comma-separated, case-insensitive,
normalising with `trim().toLowerCase()`. Roughly one new predicate and four lines in
`authConfig.callbacks`.

## How the allowlist and Invite must interact (decided 2026-09-22)

**Read this before writing the callback — a plain allowlist silently breaks invites.**

Auth.js has two hooks named `signIn`, and TEEPEE uses only one of them:

- the **callback** runs *before* sign-in completes; returning `false` rejects it and no
  `User` row is ever created;
- the **event** runs *after* sign-in has already succeeded and cannot block anything.

`lib/auth.ts:87-91` registers only the **event**, which calls
`acceptPendingInvitesForUser`. So the order today is: Google verifies → `PrismaAdapter`
creates the `User` → event fires → pending Invites are accepted by email match (ADR 0017).

The allowlist has to live in the **callback**, which runs before all of that. A naive
allowlist therefore bounces an invited Traveller *before* the event that would have
accepted their Invite ever runs — they cannot sign in, and their Invite sits
`acceptedAt: null` for ever.

**Decision:** the callback admits on **allowlist OR a pending un-accepted Trip Invite for
that email**.

**Trip Invites only — not Globe Invites — and this is the load-bearing part.** The rule
makes "who can create an Invite" exactly equal to "who can create an account on this
deployment", and the two invite paths are not equally gated:

| Path | Gate today | Evidence |
|---|---|---|
| `inviteToTrip` | **owner-or-admin** ✓ | `server/actions/invites.ts:49`, ADR 0052 |
| `inviteToGlobe` | **none — any member** ✗ | `server/actions/globe.ts:109-125` (`ARCH-TEN-4`) |

Both acceptance helpers match on email identically (`lib/invites.ts:80-86`,
`lib/globe-invites.ts:42-45`). Honouring Globe Invites in the callback would therefore let
**any Globe member mint accounts on the deployment** — `ARCH-TEN-4` promoted from "a
stranger sees my saved places" to "a stranger gets an account". Either fix `ARCH-TEN-4`
first, or keep Globe Invites out of the callback permanently: a Globe is a personal
saved-places history, not an onboarding route.

**Not a risk, recorded so it is not re-litigated:** the email is taken from Google's
verified profile, so the person signing in cannot forge a match against someone else's
Invite. All the trust sits with whoever *created* the Invite — which is precisely why the
creation gate is what matters.

**Add an Invite expiry at the same time.** Neither `Invite` (`prisma/schema.prisma:208-222`)
nor `GlobeInvite` (`:668-680`) has an expiry field — only `createdAt` and `acceptedAt`.
That is harmless while an Invite merely grants Trip membership. Under *Invite-as-account-grant*
it means every address ever invited keeps a permanently open door to the deployment,
including ones invited by typo. Either add `expiresAt`, or have the callback ignore pending
Invites older than N days.

**Approving an Access request simply adds the email to the allowlist**, so both doors
converge on one list — which is the whole point of the one-door design.

## Access request — a new noun

**Access request**: a person without an account asking for one. Kept **strictly distinct**
from **Invite**, which is Trip-scoped and owner-only (ADRs 0017, 0052). A stranger requests an
account; an admin approves; the approved address joins the allowlist and can then sign in and
plan their own Trips.

The term is deliberately **not** being added to `CONTEXT.md` yet — the glossary describes what
TEEPEE *is*, not what it will be. Add it when the feature is built.

## Notification: in-app only, no email

The app has **no mail dependency of any kind** — no Resend, nodemailer, SendGrid or Postmark —
and the Digest goes out by `web-push` (ADRs 0047, 0050). Reuse that channel and the
account-level Devices (ADR 0048) to notify the admin account. `lib/admin.ts`'s `ADMIN_EMAILS`
already exists to hang the approval surface on, and is deliberately not a `User` column so it
stays revocable without a deploy (ADR 0045).

**Accepted trade-off, recorded deliberately:** you learn of a request when you next open
TEEPEE, so someone may wait a day. At 10–15 friends that was judged better than standing up
email infrastructure.

## Write an ADR when this is built

The one-door decision meets all three tests: hard to reverse (publishing an OAuth app and
moving the gate into code), surprising without context (*"why is there an app-level allowlist
when Google already gates?"*), and the result of a real trade-off against keeping two doors.
Draft it at build time, not before. It should record the allowlist-or-Trip-Invite rule above
and, specifically, **why Globe Invites are excluded** — that exclusion is the non-obvious part
a future reader will otherwise undo.

---

# Deliberate — do not "fix" these

Re-tested against 10–15 independent Travellers and **still correct**. Do not re-file.

- **The dev-login provider is not a backdoor.** `ALLOW_DEV_LOGIN === "true" && NODE_ENV !== "production"`
  (`lib/auth.ts:35`) — both conditions, the second independent of any env file, so copying a
  repo with the flag set to a host cannot re-open it. Re-verified.
- **`markCostPaid`/`markCostUnpaid`'s inline access check** (digest `CP-14`) is genuinely
  equivalent to the shared guard: both load the Cost and call `requireTripAccess(cost.tripId)`
  (`costs.ts:291-296`, `:332-337`). Closed.
- **Located-Wishlist rows hardcode `forkId: null`** (digest `AB-06`): re-verified that no path
  produces fork-created Wishlist rows (`forks.ts:113-116`, `items.ts:261`). Closed.
- **A Device is never reassigned** (digest `CD-02`, ADR 0053). Its stated premise — a
  "genuinely shared machine" household — does weaken with independent Travellers, but the
  decision it produced is the *stricter* option under the new premise, not the looser one.
  Closed.
- **Dated views deliberately ignore `?plan=`.** Distinct from `ARCH-BND-2`, which is about how
  the filter is *expressed*, not about that policy.
- **`scripts/sweep-orphaned-costs.ts`** is correct and well-gated: dry-run by default,
  `--execute` to apply, deletes never-paid orphans only and converts ever-paid ones. No finding.
- **`docs/DEPLOY.md` §4b's migration check** is good procedure and all three 2026-09-21
  migrations pass it. The `P0-3` column-rename hazard is properly addressed there.
- **Everything in `docs/things-to-fix.md`.** The document is fully closed; both `P0-4` and
  `P1-5` were independently re-verified as still fixed in current code. If you ever find those
  behaviours live again, that is a **regression** and a new finding with fresh evidence — not
  a re-file.
- **The deliberate-behaviour list in `docs/things-to-fix.md`** and the settled sections of
  `docs/open-follow-ups.md` remain in force except where re-raised above (`SW-05`/ADR 0052
  twice, `CD-06`, `OPS-08`).

---

# Out of scope for this review

Listed individually so the gaps are visible rather than implied.

- **Performance, load and throughput.** 15 Travellers will not trouble Postgres, Vercel,
  Carto, Nominatim or R2. No benchmarking was done and none is warranted.
- **AI cost, quota and latency.** `lib/ai.ts` is a dormant env-gated seam: with no
  `ANTHROPIC_API_KEY` every function returns `{ ok:false, reason:"disabled" }` and the SDK is
  never imported. Its authorisation surface *was* in scope and appears correctly guarded in the
  coverage matrix.
- **Anything requiring a running database.** No migration was executed, no query was run, no
  cascade was observed firing.
- **Anything requiring a browser or a device.** The service-worker finding
  (`ARCH-TEN-12`), the PWA standalone branch, and every UI claim are code reads only.
- **Google Cloud Console state** — publishing status and test-user list. Not in the repo.
- **Whether the off-repo NAS pull of backup artifacts** (`db-backup.yml:5-6`) exists or works.
- **Any code change.** This review wrote no application code. The only files it touched are
  this document, its plan, and one corrected line in `CONTEXT.md`.
