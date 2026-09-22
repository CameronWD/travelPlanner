# TEEPEE Architecture Sitrep — Review Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce `docs/architecture-sitrep-2026-09-22.md` — a full, evidence-backed architecture review of TEEPEE, ranked by severity and by whether each finding blocks opening the app to 10–15 independent friends.

**Architecture:** Six independent read-only reviewers, one per dimension, each fed a pre-condensed digest of what has already been decided so they do not re-raise settled items. Every claim they return is then verified by the orchestrator against the cited lines before it may enter the document. A single synthesis pass ranks the verified findings and writes the deliverable.

**Tech Stack:** Next.js App Router, Prisma + Postgres, NextAuth (JWT sessions, Google + dev-login providers), Vitest (`@/lib/db` mocked, `TZ=UTC`), Tailwind, Leaflet, web-push, R2/S3 via `@aws-sdk`.

## Global Constraints

These apply to **every** task. No exceptions.

- **This is a review. No source code is modified.** Reviewers have read-only intent: no edits to `app/`, `components/`, `lib/`, `server/`, `prisma/`, `scripts/`. The only files written this session are the plan's own outputs: reviewer findings in the scratchpad, `docs/architecture-sitrep-2026-09-22.md`, and one glossary line in `CONTEXT.md`.
- **Never commit to `main`.** All work is on branch `chore/session-2026-09-22-architecture-sitrep`. Never deploy.
- **`CONTEXT.md` is the vocabulary contract.** Never use a term its *Avoid* list forbids. Use **Trip**, **Stop**, **Traveller**, **Plan**, **Fork**, **Item**, **Cost**, **Chapter**, **Home base**, **Firm up** exactly as defined.
- **Every finding must cite `path/to/file.ts:LINE` or `path:START-END`.** A finding with no citation is not a finding.
- **Every finding carries a verification status**, one of: `code read`, `executable repro`, or `INFERENCE`. `INFERENCE` is permitted and must never be disguised as the other two.
- **The tenancy assumption is 10–15 independent Travellers, each planning their own Trips.** Not 100. Not one household. Load, throughput and capacity are explicitly **out of scope** — 15 users will not trouble Postgres, Vercel, Carto, Nominatim or R2.
- **`lib/ai.ts` is a dormant env-gated seam** (`ANTHROPIC_API_KEY` absent ⇒ every function returns `{ ok:false, reason:"disabled" }`, SDK never imported). Do not file cost, quota or latency findings against it. Its *authorisation and input-validation* surface is still in scope.
- **Findings file format is fixed** (see Task 1). Synthesis is mechanical; a reviewer who invents their own format breaks it.

**Scratchpad root** (referred to below as `$SCRATCH`):
`/tmp/claude-1000/-work/44d4dc64-8915-450c-aecb-93c2da3949ef/scratchpad`

---

## File Structure

| File | Responsibility |
|---|---|
| `$SCRATCH/exclusions-digest.md` | Condensed record of every already-settled decision, so six reviewers need not each read 3,100 lines of audit history. Created Task 1. |
| `$SCRATCH/baseline.txt` | `vitest` / `tsc` / `lint` results at time of audit. Already generated. |
| `$SCRATCH/findings-tenancy.md` | Task 2 output |
| `$SCRATCH/findings-observability.md` | Task 3 output |
| `$SCRATCH/findings-data-safety.md` | Task 4 output |
| `$SCRATCH/findings-boundaries.md` | Task 5 output |
| `$SCRATCH/findings-components.md` | Task 6 output |
| `$SCRATCH/findings-adr-drift.md` | Task 7 output |
| `$SCRATCH/verification-log.md` | Task 8 output — per-finding verdict, the audit trail behind the doc's trust statement |
| `docs/architecture-sitrep-2026-09-22.md` | **The deliverable.** Task 9. |
| `CONTEXT.md` | One-line glossary correction. Task 10. |

---

## Note on task shape

This plan reviews rather than builds, so the usual red/green/commit cycle does not apply: there is no failing test to write for "does every server action guard". The equivalent rigour is enforced instead by **Task 8**, which independently re-reads the cited lines for every claim and discards anything that does not hold up. A reviewer's finding is a *hypothesis* until Task 8 confirms it. Tasks 2–7 are mutually independent and should be dispatched concurrently.

---

## Task 1: Exclusions digest

**Files:**
- Read: `docs/open-follow-ups.md`, `docs/things-to-fix.md`, `docs/feedback/inbox.md`
- Create: `$SCRATCH/exclusions-digest.md`

**Interfaces:**
- Produces: `$SCRATCH/exclusions-digest.md`, consumed by Tasks 2–7 and 9.

- [ ] **Step 1: Extract the settled sections**

Read these exact sections and nothing else from the two audit docs:

- `docs/open-follow-ups.md` — `# Settled — do not re-raise` (line ~711), `# Known limitations accepted on 2026-09-21 — do not re-file these as findings` (line ~920), `# Struck — already fixed (no action)` (line ~972), `# Needs a decision — **do not implement these**` (line ~432), `# Blocked on a deploy, a device, or a browser` (line ~462).
- `docs/things-to-fix.md` — `## Deliberate behaviour — do NOT "fix" these` (line ~700), plus the two still-open items `## P0-4` (line ~75) and `## P1-5` (line ~129).

- [ ] **Step 2: Write the digest**

Each entry is exactly three lines:

```markdown
- **<short label>** — <what was decided, one sentence>
  _Why:_ <the reasoning given at the time, one sentence>
  _Rests on:_ <the assumption the decision depended on — especially any assumption about how many people use the app, or that the only user would notice a problem themselves>
```

The `_Rests on:_` line is the point of this task. It is what lets a reviewer in Tasks 2–7 judge whether 10–15 independent tenants invalidates a decision.

- [ ] **Step 3: Add the two open items verbatim**

Under a heading `## Already known and still open — do not re-file as new`, record `P0-4` (dragging a Wishlist idea onto a day *moves* it, silently emptying the board, contradicting ADR 0019) and `P1-5` (`unscheduleItem` deletes the row, broken undo, caller never renders). Reviewers must reference these ids rather than rediscover them.

- [ ] **Step 4: Sanity check**

Confirm the digest is under 200 lines. If it is longer, the extraction pulled in narrative rather than decisions — tighten it.

---

## Task 2: Tenancy & authorisation coverage review

**Dispatch as:** fresh subagent, read-only.

**Files:**
- Read: `lib/guards.ts`, `lib/access.ts`, `lib/admin.ts`, `lib/globe.ts`, `lib/auth.ts`, all 33 non-test files in `server/actions/`, all 7 route handlers (`app/api/attachments/[id]/route.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/api/calendar/[token]/route.ts`, `app/api/cron/digest/route.ts`, `app/api/fx/route.ts`, `app/api/push/route.ts`, `app/api/trips/[tripId]/cover/route.ts`), `prisma/schema.prisma`, `$SCRATCH/exclusions-digest.md`
- Create: `$SCRATCH/findings-tenancy.md`

**Interfaces:**
- Consumes: `$SCRATCH/exclusions-digest.md` (Task 1)
- Produces: `$SCRATCH/findings-tenancy.md`, ids prefixed `ARCH-TEN-`

- [ ] **Step 1: Read the exclusions digest first**

Anything listed there stays closed **unless** 10–15 independent tenants changes the argument. If it does, re-raise it citing the digest entry and stating what changed.

- [ ] **Step 2: Build the guard-coverage matrix**

For **every exported server action** in `server/actions/*.ts` and **every route handler**, record one row:

| Export | File:line | Guard called | Entity id from client? | Ownership re-derived? |
|---|---|---|---|---|

"Ownership re-derived" means: when the action receives an entity id (`itemId`, `costId`, `attachmentId`, `stopId`, `chapterId`, `forkId`, `noteId`, …), does it load that row **and confirm the row's `tripId` belongs to a Trip the caller can reach**, or does it trust the id? The latter is the IDOR shape and is finding #1 for this review.

Known guards: `requireUser` / `requireTripAccess` / `requireForkAccess` (`lib/guards.ts`), `requireGlobeAccess` (`lib/globe.ts:62`), `isAdminEmail` (`lib/admin.ts`). An action using none of these is a row worth reporting even if it turns out safe for another reason — say which.

- [ ] **Step 3: Audit the account-level aggregates**

These are shared by design and are where cross-account leaks live. For each, state exactly what scopes a read and what scopes a write:

- **Globe** — account-level shared aggregate (ADR 0023), markers seed the Wishlist (ADR 0025), attachments dual-scoped onto markers (ADR 0031)
- **Attachments** — the authenticated serve route `app/api/attachments/[id]/route.ts`, offline warming (ADR 0043), R2 presigned URLs
- **Feedback** — private to author, admins read all (ADR 0046)
- **Devices** — account-level, never silently dropped (ADR 0048), never reassigned (ADR 0053)
- **Share links** — per audience with a never-shared floor (ADR 0051); **Invite** is owner-only while share and calendar feed stay member-accessible (ADR 0052)
- **Calendar feed** — `app/api/calendar/[token]/route.ts` is token-authenticated, not session-authenticated. Assess token entropy, guessability, revocability, and what a leaked token exposes.
- **Cron** — `app/api/cron/digest/route.ts` compares `CRON_SECRET` (note the constant-time comparison at ~line 100). Confirm the secret is the only thing between a stranger and every Traveller's digest.

- [ ] **Step 4: Probe the documented guard traps**

`lib/guards.ts` documents a specific hazard: `requireTripAccess` is `cache()`-memoised per request and keyed on `tripId`, so an action that **mutates membership and then re-checks access in the same request** reads yesterday's membership table and *succeeds* wrongly. The comment asserts "nothing in the codebase does this today". **Verify that assertion** against `server/actions/invites.ts`, `server/actions/trips.ts` and anything else touching `tripMember`. Report either way — a confirmed-still-true is a useful finding.

- [ ] **Step 5: Assess the sign-in door**

`lib/auth.ts` has no `signIn` callback restricting who may sign in; the Google provider is added whenever `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are set and `PrismaAdapter` creates a `User` on first sign-in. The only gate is Google's Testing-mode test-user list, which lives outside the repo. Record this as a finding with that framing — the fix is specified in Task 9 and must not be written as code here.

Also confirm the dev-login provider's production refusal actually holds: `ALLOW_DEV_LOGIN === "true" && NODE_ENV !== "production"`.

- [ ] **Step 6: Write findings in the fixed format**

See the format block at the end of this plan. Provisional severity only — global ranking happens in Task 9.

---

## Task 3: Observability & blind-spot review

**Dispatch as:** fresh subagent, read-only.

**Files:**
- Read: `lib/action-result.ts`, `lib/db.ts`, `lib/cron-health.ts`, `server/actions/cron-health.ts`, `server/actions/feedback.ts`, `app/api/cron/digest/route.ts`, `components/analytics.tsx`, `next.config.ts`, `vercel.json`, `docs/DEPLOY.md`, `$SCRATCH/exclusions-digest.md`
- Create: `$SCRATCH/findings-observability.md`

**Interfaces:**
- Consumes: `$SCRATCH/exclusions-digest.md` (Task 1)
- Produces: `$SCRATCH/findings-observability.md`, ids prefixed `ARCH-OBS-`

- [ ] **Step 1: Read the exclusions digest first**

- [ ] **Step 2: Trace the failure path end to end**

Pick a representative server action failure and follow it: thrown error → `lib/action-result.ts` (ADR 0027, the unified action result) → the toast the Traveller sees → what reaches any log → what reaches **you, the operator**. State plainly where the trail goes cold. The confirmed starting point: no Sentry or equivalent is present anywhere in the codebase; `@vercel/analytics` is the only instrumentation dependency.

- [ ] **Step 3: Enumerate the silent-failure classes**

Find every place an error is caught and discarded, swallowed into a generic message, or converted to a no-op. Grep starting points: `catch {`, `catch (e) {}`, `.catch(() =>`, `ok: false`. For each, answer: **if this fired for a Traveller who is not the operator, how would the operator ever learn?**

- [ ] **Step 4: Assess the feedback channel as the current monitoring system**

Feedback notes (ADR 0040, 0041 offline queueing, 0046 privacy) are today the only route by which a problem reaches the operator, and they require the Traveller to *choose* to write one. Assess coverage: what classes of failure would never produce a note? Note that `feedback:pull` is manual and operator-initiated.

- [ ] **Step 5: Assess scheduled-job visibility**

The digest cron (ADRs 0047, 0050, 0054) and `lib/cron-health.ts`: if it silently stops firing, or fires and delivers nothing, what surfaces that? Include the push-delivery path — a failed `web-push` send to an expired subscription (ADR 0048's "never silently dropped").

- [ ] **Step 6: Write findings in the fixed format**

---

## Task 4: Destructive operations & data safety review

**Dispatch as:** fresh subagent, read-only.

**Files:**
- Read: `prisma/schema.prisma`, `prisma/migrations/`, all `server/actions/*.ts` containing delete/remove/unschedule/merge operations (notably `trips.ts`, `stops.ts`, `items.ts`, `costs.ts`, `forks.ts`, `attachments.ts`, `chapters.ts`), `scripts/sweep-orphaned-costs.ts`, `docs/DEPLOY.md`, `$SCRATCH/exclusions-digest.md`
- Create: `$SCRATCH/findings-data-safety.md`

**Interfaces:**
- Consumes: `$SCRATCH/exclusions-digest.md` (Task 1)
- Produces: `$SCRATCH/findings-data-safety.md`, ids prefixed `ARCH-DAT-`

- [ ] **Step 1: Read the exclusions digest first**

- [ ] **Step 2: Map every cascade in the schema**

Grep `prisma/schema.prisma` for `onDelete: Cascade` and `onDelete: SetNull`. For each, write the blast radius as a sentence a non-engineer could check: "deleting a Trip also destroys its Stops, their Items, their Costs, …". Cross-check against ADR 0039 (costs survive their owners by paid state) — a cascade that contradicts a documented survival rule is a P0-shaped finding.

- [ ] **Step 3: Inventory destructive operations and their undo**

One row per operation:

| Operation | File:line | Confirmation? | Undo? | Reversible by hand? |
|---|---|---|---|---|

Include: delete Trip, delete Stop (and ADR 0055's hand-off of items to the Stop that still covers the day), delete/unschedule Item (note known item `P1-5`), delete Cost, delete Fork, delete Attachment, admin delete (ADR 0045, membership-scoped), duplicate/copy semantics (ADR 0018), scheduling as copy-in placement (ADR 0019).

- [ ] **Step 4: Assess concurrent-edit safety under many tenants**

ADR 0007 defines concurrency locking and transaction boundaries. Verify what the code actually does: which multi-write operations run inside `$transaction` and which are sequences of independent writes that can half-apply. A partial application is the data-loss shape that matters here.

- [ ] **Step 5: Establish the backup and restore story**

From `docs/DEPLOY.md` and the Postgres setup: is there a backup? What is the restore procedure? What is the recovery point? If the honest answer is "unknown", record it as `INFERENCE` and say so — do not guess. This is a finding either way, because the operator cannot currently promise a friend their trip is recoverable.

- [ ] **Step 6: Assess migration safety**

`docs/open-follow-ups.md` records two migrations written and applied 2026-09-21, and `things-to-fix.md` `P0-3` records a past column-rename that guaranteed a downtime window. Assess whether the current deploy path can still take production down or lose writes mid-migration, now that the people affected would not all be the operator.

- [ ] **Step 7: Write findings in the fixed format**

---

## Task 5: Module boundaries & layering review

**Dispatch as:** fresh subagent, read-only.

**Files:**
- Read: `lib/` (98 non-test modules), `server/actions/` (33 non-test files), `app/` layout and page files, `$SCRATCH/exclusions-digest.md`
- Create: `$SCRATCH/findings-boundaries.md`

**Interfaces:**
- Consumes: `$SCRATCH/exclusions-digest.md` (Task 1)
- Produces: `$SCRATCH/findings-boundaries.md`, ids prefixed `ARCH-BND-`

- [ ] **Step 1: Read the exclusions digest first**

- [ ] **Step 2: Identify the intended layers and where they leak**

Establish the intended shape (route/page → server action → lib domain module → db) and then find the violations: a `lib/` module importing from `server/actions/`, a component importing `lib/db`, a server-only module (`lib/admin.ts` warns against exactly this) reachable from a client component, business logic living in a component rather than a `lib/` module.

- [ ] **Step 3: Find the duplicated domain rules**

The highest-value output of this task. A rule implemented in more than one place is a rule that will be fixed in one place. Concentrate on rules the review's other dimensions depend on: authorisation checks, date/timezone handling (`lib/dates.ts` — the `TZ`-sensitive bug class from `P0-1`/`P0-2`), money and currency conversion (ADR 0037 cost/paid vocabulary), fork scoping (`forkId: null` discriminator, ADR 0020).

For each: list every location, and state which one is canonical.

- [ ] **Step 4: Assess the `lib/` module count**

98 modules in a flat directory. Assess whether the flat namespace has produced modules with overlapping responsibility or ambiguous ownership — name collisions in concept if not in filename. Propose groupings only where the grouping would make a safety property checkable; do not propose reorganisation for tidiness.

- [ ] **Step 5: Judge each finding against the rollout question**

For every boundary finding, answer explicitly: *does this make one of the three fears (leak, silent breakage, data loss) harder to fix or harder to verify?* If no, mark `Blocks rollout: no`. Structural findings are in scope but must not crowd the shortlist.

- [ ] **Step 6: Write findings in the fixed format**

---

## Task 6: Large-component review

**Dispatch as:** fresh subagent, read-only.

**Files:**
- Read: `components/trip/itinerary-manager.tsx` (2,414 lines), `components/trip/help-guide.tsx` (1,352), `components/trip/transport-form-dialog.tsx`, `components/feedback/feedback-launcher.tsx`, `server/actions/stops.ts` (1,370), `lib/flags.ts` (914), `COMPONENTS.md`, ADRs 0026 and 0029 (shared and normalized UI conventions), `$SCRATCH/exclusions-digest.md`
- Create: `$SCRATCH/findings-components.md`

**Interfaces:**
- Consumes: `$SCRATCH/exclusions-digest.md` (Task 1)
- Produces: `$SCRATCH/findings-components.md`, ids prefixed `ARCH-CMP-`

- [ ] **Step 1: Read the exclusions digest first**

- [ ] **Step 2: Enumerate each large file's responsibilities**

For `itinerary-manager.tsx`, list every distinct concern it owns (drag-reorder, date reflow, chapter bands, item scheduling, changeover-day rendering, dialog orchestration, optimistic state, …) with line ranges. Do the same for the other files above. The output is a responsibility map, not a refactor plan.

- [ ] **Step 3: Find the correctness risks hiding in the size**

The operator did **not** rank velocity as a fear, so "this is long" is not itself a finding. What counts: optimistic-update paths that can diverge from server state, state that is duplicated rather than derived, effects that fire on stale closures, and error paths that no test covers. Cite lines.

- [ ] **Step 4: Assess the test relationship**

`itinerary-manager.test.tsx` is 2,308 lines against a 2,414-line component. Assess what that suite actually pins versus what it re-asserts, and name the behaviours in the component with no coverage at all.

- [ ] **Step 5: Check convention drift**

ADRs 0026 and 0029 define shared and normalized UI conventions. Find where these large files depart from them, and say whether the departure is deliberate-looking or accidental.

- [ ] **Step 6: Write findings in the fixed format**

---

## Task 7: ADR-versus-code drift review

**Dispatch as:** fresh subagent, read-only.

**Files:**
- Read: all 56 files in `docs/adr/`, `CONTEXT.md`, and the code each ADR governs, `$SCRATCH/exclusions-digest.md`
- Create: `$SCRATCH/findings-adr-drift.md`

**Interfaces:**
- Consumes: `$SCRATCH/exclusions-digest.md` (Task 1)
- Produces: `$SCRATCH/findings-adr-drift.md`, ids prefixed `ARCH-ADR-`

- [ ] **Step 1: Read the exclusions digest first**

- [ ] **Step 2: Triage all 56 ADRs by tenancy relevance**

Read each ADR's decision statement and sort into three buckets:

- **A — tenancy-relevant:** the decision constrains who can see or change what, or what happens to data. Verify these against code in full. At minimum: 0017, 0018, 0019, 0023, 0025, 0031, 0039, 0040, 0041, 0043, 0044, 0045, 0046, 0048, 0051, 0052, 0053, 0055.
- **B — behaviour-defining:** the decision shapes what the app does but not who may do it. Spot-check.
- **C — settled and inert:** record the id and move on.

State the bucket for every one of the 56 so coverage is auditable.

- [ ] **Step 3: Verify bucket A against the code**

For each, find the code implementing it and state: **honoured**, **drifted** (with the divergence and cited lines), or **never implemented**. ADR 0044 (day ideas draw only from the Traveller's own pools) and ADR 0046 (feedback private to author) are the two most likely to matter — they are isolation rules expressed as ADRs.

- [ ] **Step 4: Check the glossary against the code**

`CONTEXT.md` is the vocabulary contract with explicit *Avoid* lists. Find terms the code uses that the glossary forbids, and domain concepts in the code that the glossary never defines. Flag `CONTEXT.md`'s opening line — it describes TEEPEE as being for "a couple", which no longer matches intent.

- [ ] **Step 5: Identify decisions that need a new ADR**

Where the code makes a hard-to-reverse, surprising, trade-off-driven choice that no ADR records, name it. Do not draft the ADRs.

- [ ] **Step 6: Write findings in the fixed format**

---

## Task 8: Verification pass

**Performed by the orchestrator, not a subagent.** This is the task that makes the document trustworthy.

**Files:**
- Read: all six `$SCRATCH/findings-*.md`
- Create: `$SCRATCH/verification-log.md`

**Interfaces:**
- Consumes: all Task 2–7 outputs
- Produces: `$SCRATCH/verification-log.md`, consumed by Task 9

- [ ] **Step 1: Re-read the cited lines for every finding**

For each finding, open the cited file at the cited lines and judge the claim independently. Record one row per finding:

| Id | Claim | Verdict | Note |
|---|---|---|---|

Verdict is one of: **CONFIRMED** (the code says what the reviewer said), **PARTIAL** (real but overstated — record the accurate version), **REFUTED** (does not hold; excluded from the doc), **UNVERIFIABLE** (needs a running DB, a device or a browser — carried into the doc explicitly labelled).

- [ ] **Step 2: Discard duplicates across dimensions**

Reviewers worked independently and will overlap — a leak found by tenancy may reappear as ADR drift. Merge into one finding, keeping every citation and crediting both lenses.

- [ ] **Step 3: Re-check every re-raised item against the digest**

For each finding that re-opens something in `$SCRATCH/exclusions-digest.md`, confirm the multi-tenancy argument genuinely changes the decision. If it does not, drop it back to closed and note that in the log. This guards the promise made when the exclusion policy was agreed.

- [ ] **Step 4: Report the counts**

Record raw findings in, CONFIRMED, PARTIAL, REFUTED, UNVERIFIABLE, merged. These numbers go into the doc's trust statement verbatim — a review that reports its own refutation rate is one the reader can calibrate against.

---

## Task 9: Write the sitrep

**Performed by the orchestrator.**

**Files:**
- Read: `$SCRATCH/verification-log.md`, all findings files, `$SCRATCH/baseline.txt`, `$SCRATCH/exclusions-digest.md`, `docs/things-to-fix.md` (for house style)
- Create: `docs/architecture-sitrep-2026-09-22.md`

**Interfaces:**
- Consumes: Tasks 1–8

- [ ] **Step 1: Write the header, baseline and trust statement**

Follow the house style of `docs/things-to-fix.md`: what this is, what it was compiled from, a baseline table (`vitest` / `tsc` / `lint` from `$SCRATCH/baseline.txt`), and a **trust statement** carrying Task 8's counts and stating exactly what *verified* means here. Name the review's limits without hedging: no running database, no production data, no browser.

- [ ] **Step 2: Write "The shortlist"**

Immediately after the trust statement, before anything else. Every `Blocks rollout: YES` finding, in priority order, each one line plus its failure scenario. This section alone must answer "what do I have to do before I tell 15 friends the URL".

- [ ] **Step 3: Write "How to work on an item (read this first, agent)"**

Mirror `things-to-fix.md`'s version, adapted: read `CONTEXT.md` first; branch per fix, never `main`, never deploy; every fix lands with a test that fails before and passes after; the suite mocks `@/lib/db` and pins `TZ`; this sandbox has no Postgres, so anything needing one is *manual verify (needs DB)* and must not be claimed verified.

- [ ] **Step 4: Write the findings, grouped by dimension**

Each in the fixed format, with a final global severity (P0–P3) and `Blocks rollout: yes/no` with a reason tied to independent tenants. Preserve every citation.

- [ ] **Step 5: Write "The door" as a specified, unbuilt item**

A self-contained section an agent could later build from, recording:

- Publish the Google OAuth app to Production. **No money:** `lib/auth.ts` sets no `authorization`/`scope` override, so NextAuth's Google provider requests the default `openid email profile` — non-sensitive scopes, which need no verification and no paid security assessment. The cost is the consent-screen form plus a **privacy policy** and **terms** page; neither `app/privacy` nor `app/terms` exists today.
- One door in code: a `signIn` callback checking TEEPEE's own allowlist becomes the only gate, so approval in TEEPEE is sufficient and the Cloud Console test-user list stops being a second invisible door. Future login providers inherit the same gate.
- **Access request** — a new noun, strictly distinct from **Invite** (trip-scoped, owner-only, ADRs 0017/0052). A person without an account requests one; an admin approves.
- Notification is **in-app only, no email** — the app has no mail dependency and the Digest goes out by `web-push` (ADRs 0047, 0050). Reuse that channel and the account-level Devices (ADR 0048). Record the accepted trade-off: the operator learns of a request when they next open TEEPEE.
- `lib/admin.ts` (`ADMIN_EMAILS`, deliberately not a `User` column) already exists to hang the approval surface on.
- Recommend an ADR be written **when this is built**, covering the one-door decision.

- [ ] **Step 6: Write "Deliberate — do not 'fix' these"**

Carry forward everything from the digest that survived re-testing against multi-tenancy, so the next reader does not re-raise it. Include the re-tested-and-still-closed items with one line each.

- [ ] **Step 7: Write "Out of scope for this review"**

Performance, load and throughput; AI cost (dormant seam); anything requiring a running database, a device or a browser, listed individually so the gaps are visible rather than implied.

- [ ] **Step 8: Record that `things-to-fix.md` is fully closed**

**Corrected 2026-09-22 during execution.** The plan originally treated `P0-4` and `P1-5` as still open. They are not: `docs/things-to-fix.md:127` and `:188` both read `Status: FIXED` (`fix/reliability-round`, commits `3107436` and `7162efd`+`cf15407`), and line 783 states every item in that document is now fixed. The "Open items added 2026-08-20" heading is historical and its body says so.

The sitrep must therefore state that `things-to-fix.md` carries **no open items**, and must not present `P0-4` or `P1-5` as findings. If any reviewer independently rediscovers the ADR 0019 copy-in violation behind `P0-4` as live in current code, that is a **new** finding with its own evidence — and worth flagging loudly, since it would mean a fix regressed.

- [ ] **Step 9: Commit**

```bash
git add docs/architecture-sitrep-2026-09-22.md docs/superpowers/plans/2026-09-22-architecture-sitrep.md
git commit -m "docs(arch): architecture sitrep ahead of opening TEEPEE to more Travellers"
```

---

## Task 10: Glossary correction

**Files:**
- Modify: `CONTEXT.md:3`

- [ ] **Step 1: Correct the opening line**

`CONTEXT.md` currently opens: *"A collaborative web app for a couple to plan and run a holiday together: scoping where to go, building a day-by-day itinerary, and tracking what it all costs. Designed to work for any trip, not just one."*

Rewrite so it describes independent Travellers each planning their own Trips, with collaboration as something a Trip supports rather than the product's premise. Keep it to the same length and register. Glossary only — no implementation detail, no mention of allowlists, access requests or rollout.

- [ ] **Step 2: Leave "Access request" out of the glossary**

The term is settled but the feature is unbuilt. `CONTEXT.md` describes what TEEPEE *is*, not what it will be. The term is recorded in the sitrep's door section and enters the glossary when it is built.

- [ ] **Step 3: Commit**

```bash
git add CONTEXT.md
git commit -m "docs(context): TEEPEE is for Travellers planning their own Trips, not one couple"
```

---

## Findings format (fixed — Tasks 2–7 all use this)

````markdown
### ARCH-<DIM>-<n> · <one-line claim, stated as a fact>

- **Severity:** P0 | P1 | P2 | P3 *(provisional — ranked globally in Task 9)*
- **Blocks rollout:** yes | no — <reason, tied to 10–15 independent Travellers>
- **Evidence:** `path/to/file.ts:123-130` — <what the code actually does there>
- **Verification:** code read | executable repro | INFERENCE
- **Failure scenario:** <concrete: who does what, and what goes wrong. Name a Traveller who is not the operator.>
- **Prior art:** <ADR id / docs reference / digest entry, or "none found">
- **Fix sketch:** <2–3 sentences. No code. What shape the fix takes and what it would cost.>
````

Severity scale, matching `docs/things-to-fix.md`:
**P0** = wrong data or behaviour for real users in production · **P1** = a promised capability is missing or a workflow silently misleads · **P2** = quality defects worth fixing soon · **P3** = polish / doc drift.
