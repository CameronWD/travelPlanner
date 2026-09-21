# Follow-ups Triage and Compile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-verify every item across the seven `docs/follow-ups/` docs against current `main`, and compile the survivors into one trustworthy live backlog at `docs/open-follow-ups.md`.

**Architecture:** Seven independent triage tasks (one per source doc) each write an evidence-bearing report to a scratch directory in the agreed format. An eighth task triages the operational items `docs/things-to-fix.md` still owes. A ninth task independently re-verifies every `DONE` verdict — the asymmetric failure, because a wrong `DONE` silently drops a real defect. A tenth task compiles all reports into the committed backlog. The eleventh writes the sweep plan from what actually survived.

**Tech Stack:** Markdown documents; `git log`/`git show` and ripgrep for evidence gathering; no application code changes in this plan.

## Global Constraints

- **Branch:** all work on `chore/follow-ups-triage-and-sweep` (already created and checked out). NEVER commit to `main`, never merge, never deploy (no `vercel` commands). These come from the operator's standing instructions.
- **DANGER — production database:** `.env.production.local` in this repo points at the **production** Neon Postgres. NEVER run `prisma migrate dev`, `prisma migrate deploy`, `prisma db push`, or `prisma migrate reset`. No task in this plan needs a database at all.
- **This plan changes no application code.** It produces documents. If a task is tempted to fix something it found, it must not — record it as `LIVE` and move on. Fixing happens in plan 2.
- **The seven source docs are immutable history.** Never edit, never delete, never strike items through in `docs/follow-ups/*.md`. They record *why* each item was deferred, which the compile cannot carry. The only new file in that directory is nothing — the compile lands at `docs/open-follow-ups.md`.
- **Vocabulary:** `CONTEXT.md` is the vocabulary contract. Never introduce a term its *Avoid* lists forbid. Note especially: **Activity** means the change-log feed, not a planned thing to do; the trip-scoped idea pool is **not** called a Backlog.
- **Commits:** conventional style, lowercase subject (match `git log` — e.g. `docs(triage): ...`), each ending with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```
- **Scratch directory** (reports are intermediate, never committed). Referred to below as `<scratch>/triage/`; the literal path is:
  ```
  /tmp/claude-1000/-work/de730f3f-707b-44c7-885b-679370ee0838/scratchpad/triage/
  ```
  Every task that writes a report creates it first: `mkdir -p <scratch>/triage/`. Substitute the literal path — no task may invent its own location, because Tasks 9, 10 and 11 read from this one.
- **Task dependencies:** Tasks 1–8 are fully independent of each other and should be run in parallel. Task 9 requires all of 1–8. Task 10 requires 9. Task 11 requires 10.
- **Full test suite is not needed** for tasks 1–9 (no code changes). Task 10 and 11 likewise. Do not run `npm test` in this plan; it costs minutes and proves nothing about a document.

### The verdict vocabulary (every item gets exactly one)

| Verdict | Means | Evidence required |
|---|---|---|
| `LIVE` | The defect still exists on current `main` | Current `file:line` that still shows it |
| `DONE` | The defect no longer exists | The commit SHA **or** the current code that closes it — positive proof |
| `NEEDS-DECISION` | Real, but which fix is right is a product call | A crisp statement of the choice: option X vs option Y, and what each costs |
| `NEEDS-DB` | Cannot be verified or closed without a real database, device, or deploy | What specifically is missing |
| `SETTLED` | Was explicitly judged not-worth-doing in its source doc, and still isn't | The original reason, quoted or paraphrased |

**The `DONE` bar is positive proof.** "I searched and could not find it" is **not** evidence and must never produce a `DONE`. If you cannot point at the code or commit that closes an item, the verdict is `LIVE`. This is deliberate: a wrong `LIVE` costs the sweep a few wasted minutes, a wrong `DONE` loses a real defect forever.

**Follow the item to whatever superseded it.** An item may have been promoted into `docs/things-to-fix.md` (which carries `**Status: FIXED**` lines with commit SHAs), fixed incidentally by a later branch, or made obsolete by an ADR. Checking whether the originally-cited line still looks the same is **not sufficient**. Worked example, which is why this rule exists: `2026-08-12-cost-paid-remodel.md` flags `formatISODate` as a UTC calendar date; `lib/dates.ts:27` still uses `getUTCFullYear` today, so a grep says `LIVE`. It is `DONE` — the item became `P0-2` in `docs/things-to-fix.md`, whose approved decision *explicitly preserved* `formatISODate`'s midnight-UTC storage convention and swept only the "what day is it now" call sites (`**Status: FIXED**`, `fix/audit-backlog`, `0b7ba83`+`761ef3c`+`3d494a0`+`7e4ec41`).

**The escalation rule.** An item sitting in an "Accept / low value", "Nice to have", or "Parked" section is `SETTLED` by default — the operator's instruction is that settled calls stay settled and do not get re-litigated. **The one exception:** if the item is actually a security, authorization, data-loss, or data-corruption issue, mark it `LIVE` and add `**ESCALATED:** yes` with one sentence on why. A known instance is already identified — see Task 5.

### The report format (this is the interface to Task 10)

Every triage task writes exactly one file to the scratch directory. Every item in the source doc gets exactly one entry. Format:

```markdown
# Triage: <source doc filename>

**Items in source:** <N>
**Verdicts:** LIVE <n> · DONE <n> · NEEDS-DECISION <n> · NEEDS-DB <n> · SETTLED <n>

---

## <ITEM-ID> — <one-line title>

- **Verdict:** LIVE
- **Source:** `docs/follow-ups/<file>.md:<line>`
- **Evidence:** `app/(app)/trips/[tripId]/plan/page.tsx:41` — no `Array.isArray` normalise; `plan` is passed straight to `findFirst`
- **Category:** mechanical
- **Priority:** P2
- **Effort:** S
- **Notes:** <free text; for NEEDS-DECISION, state the choice here>
```

- **ITEM-ID** — `<PREFIX>-<nn>`, numbered in source order. Prefixes are assigned per task below and must not collide.
- **Category** — one of: `mechanical` (a code fix with an obvious right answer), `test-coverage` (only tests change), `decision`, `db-blocked`, `settled`, `docs` (a documentation correction).
- **Priority** — `P0` (data loss, security, or the app is wrong in production) / `P1` (user-visible defect) / `P2` (internal correctness, coverage holes) / `P3` (cosmetic, comments, naming).
- **Effort** — `S` (under ~20 lines), `M`, `L` (wants its own plan).

---

### Task 1: Triage the cost/paid remodel follow-ups

**Files:**
- Read: `docs/follow-ups/2026-08-12-cost-paid-remodel.md` (94 lines, ~17 items)
- Read for supersession: `docs/things-to-fix.md` (this doc was its direct input — many items were promoted into it and carry `**Status: FIXED**` lines)
- Create: `<scratch>/triage/CP.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `<scratch>/triage/CP.md` in the Global Constraints report format, item IDs `CP-01`…`CP-nn`.

**ID prefix:** `CP`

- [ ] **Step 1: Read the source doc in full and enumerate every item**

Read `docs/follow-ups/2026-08-12-cost-paid-remodel.md` top to bottom. Its sections are `Worth deciding on` (3 bold-led paragraphs), `Should fix soon` (9 bullets), `Accept / low value` (5 bullets), `Not verifiable without a database` (prose covering the migration).

Assign `CP-01`…`CP-nn` in source order. Every bullet and every bold-led paragraph is one item. The `Not verifiable without a database` section is one item unless it clearly describes several distinct checks, in which case split it.

- [ ] **Step 2: Cross-reference `docs/things-to-fix.md` for supersession**

This is the highest-yield step for this doc — `things-to-fix.md` states in its own header that it was compiled *from* this file, "each re-verified against current `main` before inclusion".

```bash
grep -nE '^## P[0-9]-[0-9]|^\*\*Status' docs/things-to-fix.md
```

That prints every audit item and its status line together. For each `CP` item, find whether a `P#-#` entry covers it. If one does and its status is `**Status: FIXED**`, the verdict is `DONE` and the evidence is that status line's commit SHAs. Read the `P#-#` entry's body before concluding — it tells you exactly what was and was not changed (`P0-2` is the worked example in Global Constraints).

- [ ] **Step 3: Verify every item `things-to-fix.md` does not cover**

For each remaining item, open the cited file and line and determine whether the defect is still present. Cite what you find.

Example — `CP` includes "`describeChanges("COST")` omits `paidAt` (`lib/activity.ts:200-205`)":

```bash
grep -n 'paidAt' lib/activity.ts
sed -n '190,215p' lib/activity.ts
```

If `paidAt` is absent from the `COST` branch, verdict `LIVE`, evidence `lib/activity.ts:<line>` and the field list you actually saw. If present, verdict `DONE` with that line as evidence.

Apply the same treatment to each: `handleFirmUp`'s missing `catch` (`components/trip/itinerary-manager.tsx`), `markCostPaid`'s missing upper bound vs `lib/validations/cost.ts:47`, the `updateAccommodation`/items revalidation scope (`server/actions/accommodation.ts:268`, `server/actions/items.ts:55-58`), `convertCostToHome`'s return shape (`lib/budget.ts:162-188`), the `CostChecklist` currency picker (`components/trip/cost-checklist.tsx`), the discarded `errors.paidMinor`, the checkbox focus loss, and the prefill mismatch between the checklist confirm and the five dialogs.

- [ ] **Step 4: Mark the `Accept / low value` section `SETTLED`**

All five items in that section get verdict `SETTLED`, category `settled`, carrying their original reason. Do **not** re-argue them. Apply the escalation rule from Global Constraints: read each one and ask whether it is actually a security, authorization, data-loss or data-corruption issue. If any is, mark it `LIVE` with `**ESCALATED:** yes`. On a read of this section none obviously qualify — the preserved `paidMinor` not being currency-tagged is the closest, and it is a display-fidelity issue on historic data, not corruption of a live figure. Record whatever you actually conclude.

- [ ] **Step 5: Write the report**

Write `<scratch>/triage/CP.md` in the Global Constraints format. Fill the header counts. Every `CP-nn` from Step 1 must appear exactly once.

- [ ] **Step 6: Verify the report is complete**

```bash
grep -c '^## CP-' <scratch>/triage/CP.md
grep -c '^- \*\*Verdict:\*\*' <scratch>/triage/CP.md
grep -n '^- \*\*Evidence:\*\* *$' <scratch>/triage/CP.md
```

Expected: the first two numbers are equal and match the item count in the report header. The third prints nothing — an empty evidence field is a task failure.

- [ ] **Step 7: Commit**

Nothing to commit — the report is scratch. Report the verdict counts as the task result so the parent can see the shape of what was found.

---

### Task 2: Triage the audit-backlog build follow-ups

**Files:**
- Read: `docs/follow-ups/2026-08-15-audit-backlog-build.md` (72 lines, ~15 items)
- Read for supersession: `docs/things-to-fix.md` (this doc records what the `fix/audit-backlog` branch left behind while closing it)
- Create: `<scratch>/triage/AB.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `<scratch>/triage/AB.md`, item IDs `AB-01`…`AB-nn`.

**ID prefix:** `AB`

- [ ] **Step 1: Read the source doc and enumerate every item**

Sections are `Worth doing soon` (5 bullets), `Nice to have` (6 bullets), and `Still owed (needs prod DB / running app)` (4 bullets). Assign `AB-01`…`AB-nn` in source order.

- [ ] **Step 2: Verify the `Worth doing soon` items against current code**

These five are the substance of this doc. Verify each directly:

```bash
# AB: forkId threading in the standalone CostEditor
grep -n 'forkId' components/trip/cost-editor.tsx

# AB: repeated ?plan= param normalise
grep -n 'Array.isArray' "app/(app)/trips/[tripId]/plan/page.tsx" "app/(app)/trips/[tripId]/budget/page.tsx"

# AB: assertForkingAllowed gating on UTC todayISO
grep -n 'todayISO\|assertForkingAllowed' server/actions/forks.ts

# AB: the three inline paidAt string fields
grep -n 'paidAt\|MAX_AMOUNT_MINOR\|isRealCalendarDate' lib/validations/transport.ts lib/validations/item.ts lib/validations/accommodation.ts

# AB: docs/HANDOFF.md still describing SQLite
grep -n 'sqlite\|provider = ' docs/HANDOFF.md
```

Note in advance, so you interpret the last one correctly: `docs/HANDOFF.md` has since been rewritten and now describes `postgresql` with a "Status: done" marker. Confirm that yourself and mark it `DONE` citing what you read — do not take this note as the evidence.

- [ ] **Step 3: Mark the `Nice to have` section `SETTLED`**

All six get `SETTLED` with their original reason, subject to the escalation rule in Global Constraints. Note that this section contains a mix — some are genuine polish (memoising `Intl.DateTimeFormat`), some are test gaps (`nav-more-menu` has no direct test, no DST transition-day case for `zonedWallTimeToInstant`). **Test gaps are still `SETTLED` here** — they were triaged as nice-to-have by the branch's own review, and the operator's instruction is that settled calls stay settled. Record them so they are not rediscovered.

- [ ] **Step 4: Mark the `Still owed` section `NEEDS-DB`**

All four (`P0-3` migration rehearsal, `P0-1` manual transport-time verify, `P2-8(a)` legacy paid-without-date row count, `P3-5` `.verify/` screenshots) get verdict `NEEDS-DB`, category `db-blocked`. For each, state in **Notes** exactly what is missing — a Neon snapshot branch, a running app, production data, or a UI to screenshot. These feed the deploy checklist section of the compile.

Cross-check their current status, since `things-to-fix.md` tracks the same items:

```bash
grep -n 'NOT DONE\|needs prod DB' docs/things-to-fix.md
```

- [ ] **Step 5: Write the report**

Write `<scratch>/triage/AB.md` in the Global Constraints format with header counts filled.

- [ ] **Step 6: Verify the report is complete**

```bash
grep -c '^## AB-' <scratch>/triage/AB.md
grep -c '^- \*\*Verdict:\*\*' <scratch>/triage/AB.md
grep -n '^- \*\*Evidence:\*\* *$' <scratch>/triage/AB.md
```

Expected: first two equal and matching the header count; third prints nothing.

- [ ] **Step 7: Report verdict counts as the task result**

Nothing to commit.

---

### Task 3: Triage the Feedback notes build follow-ups

**Files:**
- Read: `docs/follow-ups/2026-09-08-feedback-notes.md` (78 lines, ~15 items)
- Read for context: `docs/adr/0040-feedback-notes-captured-in-product-exported-to-a-committed-inbox.md`, `docs/adr/0041-feedback-notes-may-queue-offline.md`, `docs/adr/0046-feedback-notes-private-to-author-admins-read-all.md`
- Create: `<scratch>/triage/FN.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `<scratch>/triage/FN.md`, item IDs `FN-01`…`FN-nn`.

**ID prefix:** `FN`

- [ ] **Step 1: Read the source doc and enumerate every item**

The doc opens with an `Operational — do this before or with the first deploy` section. Read the whole file and assign `FN-01`…`FN-nn` in source order across all sections.

- [ ] **Step 2: Resolve the operational items first**

The lead item concerns the `FeedbackNote` migration not having run against production. That has since changed — the feature is deployed and in use. Positive proof is available:

```bash
npm run feedback:pull
```

This queries the production database (read-only — it only ever writes `docs/feedback/inbox.md`). It currently succeeds and reports `0 open, 7 resolved`, which proves the `FeedbackNote` table exists in production. If it succeeds, that item is `DONE` with that as evidence. Do not run `feedback:resolve` — it writes.

- [ ] **Step 3: Verify the remaining items against current code**

ADRs 0041 and 0046 both landed *after* this doc was written, so several items may have been closed by them. For each item, read the cited file, then check whether a later ADR covers the behaviour:

```bash
grep -rn 'feedback' docs/adr/*.md | grep -i 'offline\|private\|admin'
git log --oneline --all -- server/actions/feedback.ts components/feedback/ | head -30
```

Cite either the current code that still shows the defect (`LIVE`) or the commit/ADR that closed it (`DONE`).

- [ ] **Step 4: Apply the settled and escalation rules**

Any item in an accept/nice-to-have/parked section is `SETTLED` with its original reason, subject to the escalation rule in Global Constraints. Feedback notes carry user-authored content and have a privacy model (ADR 0046), so read each settled item specifically for stored-XSS, authorization, or note-visibility implications before letting it stay settled.

- [ ] **Step 5: Write the report**

Write `<scratch>/triage/FN.md` in the Global Constraints format with header counts filled.

- [ ] **Step 6: Verify the report is complete**

```bash
grep -c '^## FN-' <scratch>/triage/FN.md
grep -c '^- \*\*Verdict:\*\*' <scratch>/triage/FN.md
grep -n '^- \*\*Evidence:\*\* *$' <scratch>/triage/FN.md
```

Expected: first two equal and matching the header count; third prints nothing.

- [ ] **Step 7: Confirm `docs/feedback/inbox.md` is unchanged**

```bash
git status --short docs/feedback/inbox.md
```

Expected: no output. `feedback:pull` regenerated it from the same data, so it should be byte-identical. If it *did* change, commit it — `CLAUDE.md` requires the refreshed inbox to be committed on the working branch:

```bash
git add docs/feedback/inbox.md
git commit -m "chore(feedback): refresh inbox printout

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Triage the Feedback panel chat-shape follow-ups

**Files:**
- Read: `docs/follow-ups/2026-09-09-feedback-panel-chat-shape.md` (99 lines, ~16 items)
- Create: `<scratch>/triage/FP.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `<scratch>/triage/FP.md`, item IDs `FP-01`…`FP-nn`.

**ID prefix:** `FP`

- [ ] **Step 1: Read the source doc and enumerate every item**

Assign `FP-01`…`FP-nn` in source order. **This doc already contains resolutions** — at least one item is struck through with `~~` and annotated `**Fixed** in d589beb / 37d216d`. Those are pre-resolved:

```bash
grep -n '~~\|Fixed' docs/follow-ups/2026-09-09-feedback-panel-chat-shape.md
```

A struck-through item is `DONE` — but verify the cited commits exist and did what the annotation claims rather than trusting the note:

```bash
git show --stat d589beb 37d216d
```

- [ ] **Step 2: Verify the live-looking items against current code**

This doc is about the Feedback panel's docked chat-widget shape — viewport behaviour, modality, focus. Most items will cite `components/feedback/`. For each, read the cited file and determine whether the defect persists:

```bash
ls components/feedback/
grep -rn 'useDockedViewport\|useSyncExternalStore' components/feedback/
```

Cite current `file:line` for `LIVE`, or the closing commit for `DONE`.

- [ ] **Step 3: Note items that need a real browser**

Several items in this doc concern viewport, rotation, and visual modality — things jsdom cannot prove. Any item whose verification genuinely requires a real browser or phone gets `NEEDS-DB` (the category covers "needs a running app or device", not only a database) with **Notes** stating precisely what device or browser condition is needed. Do not mark such an item `DONE` on a code read alone.

- [ ] **Step 4: Apply the settled and escalation rules**

Accept/nice-to-have/parked items are `SETTLED` with their original reason, subject to the escalation rule in Global Constraints.

- [ ] **Step 5: Write the report**

Write `<scratch>/triage/FP.md` in the Global Constraints format with header counts filled.

- [ ] **Step 6: Verify the report is complete**

```bash
grep -c '^## FP-' <scratch>/triage/FP.md
grep -c '^- \*\*Verdict:\*\*' <scratch>/triage/FP.md
grep -n '^- \*\*Evidence:\*\* *$' <scratch>/triage/FP.md
```

Expected: first two equal and matching the header count; third prints nothing.

- [ ] **Step 7: Report verdict counts as the task result**

Nothing to commit.

---

### Task 5: Triage the help-guide audit — tail sections only

**Files:**
- Read: `docs/follow-ups/2026-09-15-help-guide-audit.md`, **lines 573–667 only** (the `Recorded and deliberately left alone` and `Parked after the final whole-branch review` sections)
- Create: `<scratch>/triage/HG.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `<scratch>/triage/HG.md`, item IDs `HG-01`…`HG-nn`.

**ID prefix:** `HG`

**Scope warning — read this before starting.** This document is **not a backlog**. It is a claim-by-claim evidence trail from the `docs/help-guide-refresh` branch: 116 claims checked, 13 corrections already made on that branch, 103 recorded as accurate. Triaging all 667 lines would mean re-auditing prose that was already audited and fixed. **Only two sections are backlog:**

- `## Recorded and deliberately left alone` (line 573) — items `L2`–`L6`, five items.
- `## Parked after the final whole-branch review (2026-09-15)` (line 636) — seven bullets.

Sections `Corrections made` (C1–C13) and `Checked and accurate` are **out of scope** — the corrections shipped on that branch and the accurate claims are not items. Do not create entries for them. Record in the report header that they were excluded and why.

- [ ] **Step 1: Read lines 573–667 and enumerate the items**

```bash
sed -n '573,667p' docs/follow-ups/2026-09-15-help-guide-audit.md
```

Assign `HG-01`…`HG-nn` in source order across both sections. Preserve the source doc's own `L2`–`L6` labels in each entry's title so they stay traceable.

- [ ] **Step 2: Handle the known escalation**

The final bullet of the parked section reads:

> **Pre-existing, unchanged by this branch:** `duplicateTrip` (`server/actions/trips.ts`) has no ownership check of its own — the Danger-zone gate was the only thing making Duplicate owner-only, so any member could already invoke the action directly.

This is an **authorization gap parked in a cosmetic list** — exactly the escalation rule's target. Verify it against current code rather than trusting the note:

```bash
grep -n 'export async function duplicateTrip' -A 40 server/actions/trips.ts
grep -n 'requireTripAccess\|requireTripOwner\|ownerId' server/actions/trips.ts
```

Determine whether `duplicateTrip` performs its own ownership check today, and whether any guard was added since 2026-09-15:

```bash
git log --oneline -15 -- server/actions/trips.ts
```

If it still lacks an ownership check, the verdict is `LIVE`, priority `P0`, category `mechanical`, with `**ESCALATED:** yes` and one sentence on the exposure. If a guard has since been added, `DONE` citing the commit. Also check ADR 0045 (`docs/adr/0045-admin-delete-scoped-to-membership.md`), which covers admin scoping of destructive trip actions and may bear on this.

- [ ] **Step 3: Verify the remaining parked items**

The others are: the stale doc comment in `components/trip/help-expand-all.tsx:8` claiming it is the only client component in the guide; the Back-button behaviour after a contents-link click; the weak `help-hash-open.test.tsx` test 3; and `GUIDE_UI_STRINGS` being a substring guard rather than exact-match.

```bash
sed -n '1,15p' components/trip/help-expand-all.tsx
ls components/trip/help-*.tsx
grep -n 'GUIDE_UI_STRINGS' -A 20 lib/help-guide.ts
```

Note that the `GUIDE_UI_STRINGS` substring-guard item is a **test-infrastructure weakness with a demonstrated miss** (C6 passed the guard while the guide misquoted the banner). Judge it on its merits — it is plausibly `LIVE`/`test-coverage` rather than settled, despite sitting in a parked list. The Back-button item's own note says the alternatives are worse, which reads as genuinely `SETTLED`.

- [ ] **Step 4: Verify `L2`–`L6`**

These five were "deliberately left alone" with stated reasons — including one explicitly instructing that the trip-settings imprecision must **not** be "corrected", because the guide ships to every user and must not document operator powers (the `ADMIN_EMAILS` override, ADR 0045). That instruction must survive into the compile's settled section verbatim in substance, so nobody later "fixes" it. Mark these `SETTLED` unless the escalation rule applies.

Note `L3` describes an **app** issue, not a guide issue (the legend's `MapPin` is ambiguous because the app uses that icon both decoratively and as the real has-a-location signal). That is a real UI defect parked in a docs audit — judge it on its merits as a candidate `LIVE` item.

- [ ] **Step 5: Write the report**

Write `<scratch>/triage/HG.md` in the Global Constraints format. In the header, state the scope exclusion: `Corrections made` (C1–C13, shipped on branch) and `Checked and accurate` (103 claims) were deliberately not triaged.

- [ ] **Step 6: Verify the report is complete**

```bash
grep -c '^## HG-' <scratch>/triage/HG.md
grep -c '^- \*\*Verdict:\*\*' <scratch>/triage/HG.md
grep -n '^- \*\*Evidence:\*\* *$' <scratch>/triage/HG.md
```

Expected: first two equal and matching the header count; third prints nothing.

- [ ] **Step 7: Report verdict counts and the escalation outcome as the task result**

Nothing to commit. State explicitly in the result whether `duplicateTrip` is still unguarded — the parent needs that immediately, not at compile time.

---

### Task 6: Triage the reminders rebuild follow-ups

**Files:**
- Read: `docs/follow-ups/2026-09-17-reminders-follow-ups.md` (174 lines, ~23 items)
- Read for supersession: `docs/follow-ups/2026-09-20-changeover-day-and-digest-follow-ups.md` — its header states that **items 1, 3, 4 and the "two zones 13h+ apart" note are closed by that branch**
- Read for context: `docs/adr/0047-calendar-alarms-fire-on-the-clock-one-daily-digest-carries-the-rest.md`, `docs/adr/0048-devices-are-account-level-and-never-silently-dropped.md`
- Create: `<scratch>/triage/RM.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `<scratch>/triage/RM.md`, item IDs `RM-01`…`RM-nn`.

**ID prefix:** `RM`

- [ ] **Step 1: Read the source doc and enumerate every item**

Assign `RM-01`…`RM-nn` in source order. This doc is numbered in its own right (items 1, 3, 4 are referenced by number from the later doc) — preserve those original numbers in each entry's title so the supersession mapping stays legible.

- [ ] **Step 2: Apply the documented supersession**

Read the header of `docs/follow-ups/2026-09-20-changeover-day-and-digest-follow-ups.md`:

```bash
sed -n '1,25p' docs/follow-ups/2026-09-20-changeover-day-and-digest-follow-ups.md
```

It states items 1, 3, 4 and the "two zones 13h+ apart" note are closed. **Verify each rather than trusting the claim** — find the code or commit on the `feat/changeover-day-and-digest-fixes` branch that closes it:

```bash
git log --oneline 41a874b~1..41a874b --no-merges | head -60
git log --oneline --all -- lib/digest-dispatch.ts lib/digest-schedule.ts server/actions/push.ts | head -30
```

`DONE` requires the positive proof, not the later doc's assertion.

- [ ] **Step 3: Verify the remaining items against current code**

The unclosed items concern ADR 0047/0048 territory: calendar `VALARM`s, the Digest, device registration and rotation. Verify each against the cited file:

```bash
ls lib/digest*.ts lib/ics*.ts server/actions/push.ts 2>/dev/null
grep -rn 'VALARM' lib/ | head
```

- [ ] **Step 4: Mark the never-proven-end-to-end items `NEEDS-DB`**

This doc's header states plainly that nothing in the feature was proven end to end — no push had reached a device, no calendar app had parsed a published `VALARM`, the migration had never executed, the GitHub schedule had never fired. Any item that can only be closed by a real device, a real push service, or a real cron firing gets `NEEDS-DB` with the specific condition in **Notes**. These feed the compile's deploy checklist.

Note that `docs/follow-ups/2026-09-20-...` repeats this warning for its own phases, so expect overlap — Task 7 covers that doc. Do not resolve the overlap here; Task 10 deduplicates.

- [ ] **Step 5: Apply the settled and escalation rules**

Accept/nice-to-have/parked items are `SETTLED` with their original reason, subject to the escalation rule in Global Constraints. Push and device items touch authorization (a subscription is a capability), so read each settled item specifically for that before letting it stay settled.

- [ ] **Step 6: Write the report**

Write `<scratch>/triage/RM.md` in the Global Constraints format with header counts filled.

- [ ] **Step 7: Verify the report is complete**

```bash
grep -c '^## RM-' <scratch>/triage/RM.md
grep -c '^- \*\*Verdict:\*\*' <scratch>/triage/RM.md
grep -n '^- \*\*Evidence:\*\* *$' <scratch>/triage/RM.md
```

Expected: first two equal and matching the header count; third prints nothing.

- [ ] **Step 8: Report verdict counts as the task result**

Nothing to commit.

---

### Task 7: Triage the changeover-day and Digest follow-ups

**Files:**
- Read: `docs/follow-ups/2026-09-20-changeover-day-and-digest-follow-ups.md` (145 lines, ~19 items)
- Read for context: `docs/adr/0049-a-changeover-day-is-one-day-shown-twice-owned-once.md`, `docs/adr/0050-one-digest-per-person-timed-by-the-device-they-actually-use.md`
- Create: `<scratch>/triage/CD.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `<scratch>/triage/CD.md`, item IDs `CD-01`…`CD-nn`.

**ID prefix:** `CD`

**Note:** this is the newest doc (written 2026-09-20, the same day as this triage), so expect a high `LIVE` rate. Do not let that expectation substitute for evidence — the `feat/share-on-trip` branch landed after it and may have touched shared code.

- [ ] **Step 1: Read the source doc and enumerate every item**

Sections are `Worth their own task` (4 numbered items), `Smaller items` (11 bullets), and `Process note, for whoever writes the next plan` (2 lessons). Assign `CD-01`…`CD-nn` in source order.

The two process-note lessons are **not defects** — they are guidance for plan authors ("a parameter can be born dead across task boundaries"; "a later phase can re-arm an earlier phase's bug"). Give them verdict `SETTLED`, category `docs`, and note in the report that the compile should carry them into its agent-facing preamble rather than its item list. They are genuinely useful and should not be lost.

- [ ] **Step 2: Classify the four `Worth their own task` items**

Read each against its ADR before assigning a verdict:

1. **Five mutating actions have tests that never assert their guard** (`server/actions/chapters.test.ts`, `stops.test.ts`, `firm-up-trip.test.ts`, `cover.test.ts`, `activity.test.ts`). Verify:

   ```bash
   grep -c 'requireTripAccess' server/actions/chapters.test.ts server/actions/stops.test.ts server/actions/firm-up-trip.test.ts server/actions/cover.test.ts server/actions/activity.test.ts
   grep -n 'expectAccessCheckedBeforeWrite' server/actions/*.test.ts | head
   ls test/helpers/access-order.ts
   ```

   If those files mock `requireTripAccess` but never assert on it, verdict `LIVE`, category `test-coverage`, priority `P2`. The helper `expectAccessCheckedBeforeWrite` already exists, so the fix is assertions, not infrastructure.

2. **`subscribeToPush` can reassign a row it does not own** (`server/actions/push.ts`). The source doc argues the real fix is requiring an explicit re-Enable rather than a smarter check, and that the legitimate shared-machine call and the hijack are byte-identical. That is a product decision → verdict `NEEDS-DECISION`. In **Notes**, state the choice: *(a)* require an explicit re-Enable when the endpoint's `userId` differs, costing a re-permission prompt on genuinely shared devices, versus *(b)* accept the current behaviour and document it. Include the doc's own exposure assessment (device theft and silencing, not content theft — pushes remain encrypted to the victim's keys).

3. **Rule 4 does not govern a Stop re-date** — recorded in ADR 0049's Consequences. Verdict `NEEDS-DECISION`; the choice is whether a Stop re-date may move an Item onto a *different* Stop's Budget line, which today only an explicit move does.

4. **The intraday zone flip can still produce two Digests** — recorded in ADR 0050's Consequences. Verdict `NEEDS-DECISION`; the choice is caching the elected zone per person per local day versus putting the elected zone in the ledger key.

Read the Consequences sections of both ADRs to state each choice accurately:

```bash
grep -n 'Consequences' -A 30 docs/adr/0049-a-changeover-day-is-one-day-shown-twice-owned-once.md
grep -n 'Consequences' -A 30 docs/adr/0050-one-digest-per-person-timed-by-the-device-they-actually-use.md
```

- [ ] **Step 3: Verify the eleven `Smaller items`**

Each cites a specific file. Verify each directly — these are the likeliest source of `LIVE` mechanical work for plan 2:

```bash
grep -n 'new Date()' components/account/dispatcher-health.tsx components/account/devices-panel.tsx 2>/dev/null
grep -n 'afterEach\|globalThis.fetch' public/sw.test.ts
grep -n 'DIGEST_MAX_LINES\|more' lib/digest.ts | head -20
grep -n 'lastSeenAt' lib/digest-dispatch.ts | head
grep -n 'cache(' lib/guards.ts
grep -n 'formatLastRun' -A 20 components/account/*.tsx server/actions/cron-health.ts 2>/dev/null | head -40
grep -rn 'DispatcherHealth' components/account/ server/actions/ | head
```

Assign category `test-coverage` where only tests change (the `sw.test.ts` `afterEach`, the `digest-dispatch` tie-break, `formatLastRun`'s untested branches, the `lib/guards.ts` structural test, the `cron-health` page-level regression test) and `mechanical` where product code changes.

Two of the eleven are candidate `NEEDS-DECISION` rather than mechanical — read them carefully: the Digest's 2-line Checklist cap dropping lines silently (is the fix an honest `+N more`, or a changed cap?) and the heartbeat proving the route ran rather than that Digests were delivered (copy change, or a second signal?). The source doc also notes `CONTEXT.md`'s **Digest** entry currently implies a single cap that "takes the tail", which is now not quite true — that documentation drift is a separate `LIVE`/`docs` item if confirmed:

```bash
grep -n 'Digest' -A 8 CONTEXT.md | head -30
```

- [ ] **Step 4: Write the report**

Write `<scratch>/triage/CD.md` in the Global Constraints format with header counts filled.

- [ ] **Step 5: Verify the report is complete**

```bash
grep -c '^## CD-' <scratch>/triage/CD.md
grep -c '^- \*\*Verdict:\*\*' <scratch>/triage/CD.md
grep -n '^- \*\*Evidence:\*\* *$' <scratch>/triage/CD.md
```

Expected: first two equal and matching the header count; third prints nothing.

- [ ] **Step 6: Report verdict counts as the task result**

Nothing to commit.

---

### Task 8: Triage the operational debt — owed audit items and unrun migrations

**Files:**
- Read: `docs/things-to-fix.md` (the `**Status: NOT DONE**` entries)
- Read: `docs/DEPLOY.md`, `vercel.json`
- Read: `prisma/migrations/` (identify which migrations have never executed)
- Create: `<scratch>/triage/OPS.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `<scratch>/triage/OPS.md`, item IDs `OPS-01`…`OPS-nn`. This is the sole input to the compile's deploy-checklist section, alongside the `NEEDS-DB` items from Tasks 1–7.

**ID prefix:** `OPS`

- [ ] **Step 1: Enumerate the owed audit items**

```bash
grep -nE '^## P[0-9]-[0-9]|NOT DONE' docs/things-to-fix.md
```

That prints every audit item heading interleaved with every `NOT DONE` status line, in file order — so each `NOT DONE` belongs to the `## P#-#` heading printed above it. Four are expected (`P0-3`, `P0-1`, `P2-8(a)`, `P3-5`). Read each owning entry's body in full and assign `OPS-01`…, verdict `NEEDS-DB`, with **Notes** stating exactly what is required to close it.

- [ ] **Step 2: Identify every migration that has never run against production**

```bash
ls prisma/migrations/
git log --oneline --diff-filter=A --name-only -- 'prisma/migrations/*/migration.sql' | head -40
```

Two are known to be unrun: `share_links_per_audience` (merged 2026-09-20 in `feat/share-on-trip`, never deployed) and the `CronHeartbeat` migration from `feat/changeover-day-and-digest-fixes`. Confirm their exact directory names and check whether any others postdate the last deploy. Create one `OPS` item per unrun migration, verdict `NEEDS-DB`, priority `P0`.

- [ ] **Step 3: Record the deploy-ordering hazard**

`docs/follow-ups/2026-08-12-cost-paid-remodel.md` documents that `vercel.json` runs `prisma migrate deploy && next build`, so a *rename* migration removes the old columns while the previous deployment is still serving traffic — every affected read 500s for the length of the build, and indefinitely if the build fails. Verify the pipeline still works that way:

```bash
grep -n 'buildCommand\|migrate deploy' vercel.json
grep -n 'migrate\|rehearsal\|snapshot' docs/DEPLOY.md | head -20
```

Create an `OPS` item capturing the hazard and, critically, **whether either unrun migration is additive or destructive** — read both migration SQL files and say which:

```bash
cat prisma/migrations/*share_links*/migration.sql
```

An additive migration has no downtime window; a rename or drop does. This determines whether the next deploy is routine or needs a quiet moment and a rehearsal, and it is the single most useful thing this task produces.

- [ ] **Step 4: Write the report**

Write `<scratch>/triage/OPS.md` in the Global Constraints format with header counts filled.

- [ ] **Step 5: Verify the report is complete**

```bash
grep -c '^## OPS-' <scratch>/triage/OPS.md
grep -c '^- \*\*Verdict:\*\*' <scratch>/triage/OPS.md
grep -n '^- \*\*Evidence:\*\* *$' <scratch>/triage/OPS.md
```

Expected: first two equal and matching the header count; third prints nothing.

- [ ] **Step 6: Report the additive-vs-destructive finding as the task result**

Nothing to commit. Lead the result with whether the pending migrations carry a downtime window — the operator needs that to decide when to deploy.

---

### Task 9: Independently re-verify every `DONE` verdict

**Files:**
- Read: every `<scratch>/triage/*.md` from Tasks 1–8
- Modify: those same reports (flip any verdict that fails re-verification)
- Create: `<scratch>/triage/DONE-AUDIT.md`

**Interfaces:**
- Consumes: all eight triage reports.
- Produces: `<scratch>/triage/DONE-AUDIT.md`, plus corrected verdicts in place. Task 10 reads the corrected reports.

**This task must be run by an agent that has not performed any of Tasks 1–8.** Its whole value is independence — it is checking for the failure mode where a triager convinced themselves an item was fixed. It sees the *claim* and the *evidence*, and re-derives the conclusion from the code.

- [ ] **Step 1: Extract every `DONE` verdict**

```bash
grep -B 4 -A 6 '\*\*Verdict:\*\* DONE' <scratch>/triage/*.md
```

Build a list of every item ID with a `DONE` verdict, its claimed evidence, and its source doc.

- [ ] **Step 2: Re-verify each one from the code, not from the report**

For each `DONE` item, independently confirm the defect is actually gone. Do not simply re-read the evidence string — go to the code or the commit and check it says what the report claims:

- If the evidence is a commit SHA, run `git show <sha>` and confirm the diff actually closes the described defect.
- If the evidence is a code location, open it and confirm the defect is absent there *and* that the item is not simply relocated to another file.
- If the evidence is a `**Status: FIXED**` line in `docs/things-to-fix.md`, read that entry's body — it may have been fixed *in part*, or fixed with a documented caveat (several entries carry "Note:" qualifications about how the landed fix differed from the prescribed one).

- [ ] **Step 3: Flip anything that fails**

Any item whose `DONE` you cannot independently confirm gets its verdict changed **in the original report file** to `LIVE`, with the evidence field rewritten to state what you actually found and why the `DONE` did not hold. Add `**Re-verified:** failed` to the entry.

Confirmed items get `**Re-verified:** confirmed` added to the entry.

- [ ] **Step 4: Write the audit summary**

Write `<scratch>/triage/DONE-AUDIT.md` recording: how many `DONE` verdicts were checked, how many were confirmed, how many were flipped, and — for each flip — the item ID and a one-line reason. This summary is quoted in the compile, so the operator can see how trustworthy the triage was.

- [ ] **Step 5: Verify the reports are consistent after the flips**

```bash
grep -c '\*\*Verdict:\*\* DONE' <scratch>/triage/*.md
grep -c 'Re-verified:' <scratch>/triage/*.md
```

Expected: every remaining `DONE` carries a `Re-verified: confirmed` line, and the per-file header counts still match the entries. Correct any header counts that the flips invalidated.

- [ ] **Step 6: Report the confirm/flip tally as the task result**

Nothing to commit.

---

### Task 10: Compile `docs/open-follow-ups.md`

**Files:**
- Read: every `<scratch>/triage/*.md`, including `DONE-AUDIT.md`
- Read for format: `docs/things-to-fix.md` lines 1–60 (the header, verification-status convention, and agent-facing preamble this doc mirrors)
- Create: `docs/open-follow-ups.md`

**Interfaces:**
- Consumes: all triage reports with Task 9's corrections applied.
- Produces: `docs/open-follow-ups.md` — the single live backlog. Task 11 reads it.

- [ ] **Step 1: Read the format precedent**

```bash
sed -n '1,60p' docs/things-to-fix.md
```

Mirror its conventions: a header stating what the doc is and when it was compiled, a per-item verification status, priority codes, and a "How to work on an item (read this first, agent)" preamble. This doc is its successor in form, not its replacement — `things-to-fix.md` stays where it is as the 2026-08-14 audit's record.

- [ ] **Step 2: Write the header and preamble**

The header must state:
- What this doc is: the live backlog compiled from the seven `docs/follow-ups/` docs plus the operational debt `docs/things-to-fix.md` still owes.
- Compiled date (2026-09-20) and the branch it was compiled on.
- That the seven source docs remain the immutable record of *why* each item was deferred, and are never edited.
- The trust statement, with real numbers from `DONE-AUDIT.md`: how many items were triaged, how many struck as already fixed, how many `DONE` calls were independently re-verified and how many flipped.

The preamble must carry, for whoever works an item: read `CONTEXT.md` first (it is the vocabulary contract); branch per fix, never `main`, never deploy; and the two process lessons carried forward from `2026-09-20-changeover-day-and-digest-follow-ups.md` — that a parameter can be born dead across task boundaries (ask "who feeds this?"), and that a later phase can re-arm an earlier phase's bug (say so in the plan where two phases touch one column).

- [ ] **Step 3: Write the `Open` sections, ordered by priority**

Every `LIVE` item, grouped `P0` → `P3`. Each entry carries: its ID, a one-line title, the source doc it came from, the current `file:line` evidence, category, effort, and enough detail that an agent with no context can work it. Any `ESCALATED` item leads its priority group with the escalation stated.

Do not lose the source doc citation — provenance backward is half the point of this compile.

- [ ] **Step 4: Write the `Needs a decision` section**

Every `NEEDS-DECISION` item, each written as: what the item is, the choice (option X vs option Y), and what each option costs. These are **not** to be built. The section's own heading must say so, so a future agent reading the doc does not start implementing one.

- [ ] **Step 5: Write the `Blocked on a deploy or a real device` section**

Every `NEEDS-DB` item plus everything from `<scratch>/triage/OPS.md`. This section doubles as the deploy checklist, so order it as a deploy would be run: the unrun migrations first (stating additive-vs-destructive and therefore whether a downtime window exists), then the verifications that become possible once deployed (a push reaching a device, a calendar app parsing a `VALARM`, the cron flipping Account off "never run", the legacy paid-without-date row count).

- [ ] **Step 6: Write the `Settled — do not re-raise` section**

Every `SETTLED` item, each with its original reason, one line each. The section's heading and opening sentence must state plainly that these were judged and declined deliberately, and that re-raising them is the churn this document exists to stop.

Two entries need their reasons preserved with particular care, because both are instructions *not* to make a change that looks like an improvement: the help guide must not document the `ADMIN_EMAILS` operator override (ADR 0045) because it ships to every user, and the contents-link Back-button behaviour is inherent to the approach because the alternatives poison the Back button worse.

- [ ] **Step 7: Verify the compile is complete and lossless**

Every item from every report must appear exactly once in exactly one section. Every entry in the compile carries its item ID, so the check is an ID set comparison:

```bash
grep -oh '^## \([A-Z]\{2,3\}-[0-9]\+\)' <scratch>/triage/*.md | sed 's/^## //' | sort > /tmp/ids-reports.txt
grep -oh '[A-Z]\{2,3\}-[0-9]\+' docs/open-follow-ups.md | sort -u > /tmp/ids-compile.txt
comm -23 /tmp/ids-reports.txt /tmp/ids-compile.txt
```

Expected: the final command prints nothing. Anything it prints is an item dropped on the floor — fix before committing.

- [ ] **Step 8: Verify the source docs are untouched**

```bash
git status --short docs/follow-ups/
```

Expected: no output. The seven source docs are immutable history; any modification is a task failure and must be reverted with `git checkout -- docs/follow-ups/`.

- [ ] **Step 9: Commit**

```bash
git add docs/open-follow-ups.md
git commit -m "docs(backlog): compile the live follow-ups backlog from seven source docs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Write the sweep plan from the survivors

**Files:**
- Read: `docs/open-follow-ups.md`
- Create: `docs/superpowers/plans/2026-09-20-follow-ups-sweep.md`

**Interfaces:**
- Consumes: `docs/open-follow-ups.md`'s `Open` sections.
- Produces: a plan in the superpowers:writing-plans format covering every `LIVE` item of category `mechanical`, `test-coverage`, or `docs`.

- [ ] **Step 1: Select the items in scope**

Every `LIVE` item whose category is `mechanical`, `test-coverage`, or `docs`. Explicitly excluded, per the agreed spec: `NEEDS-DECISION` (the operator decides those separately), `NEEDS-DB` (impossible here), and `SETTLED` (not to be re-litigated).

- [ ] **Step 2: Group the selected items into tasks**

Group by the file or subsystem they touch, so one task's changes are reviewable as a unit and two tasks never edit the same file. A task is the smallest unit worth a fresh reviewer's gate — fold a one-line fix and its test into the same task as its neighbours in the same file, and split where a reviewer could reject one while approving another.

Order by priority: any `P0` (especially anything `ESCALATED` — an unguarded `duplicateTrip` would be first) leads the plan, then `P1` user-visible defects, then `P2` correctness and coverage, then `P3` cosmetics.

- [ ] **Step 3: Write the plan using the writing-plans format**

Use `superpowers:writing-plans`. Every task needs a `**Files:**` block with exact paths, an `**Interfaces:**` block, and bite-sized TDD steps with the **actual test code written out** — not "add a test for this". These are code changes, so the full TDD cycle applies: write the failing test, run it and see it fail, implement, run it and see it pass, commit.

Global Constraints for that plan must carry, from this one: the branch (`chore/follow-ups-triage-and-sweep`, no `main`, no merge, no deploy), the production-database danger, `CONTEXT.md` as the vocabulary contract, the commit convention with the co-author trailer, and the test command `TZ=UTC npx vitest run <path>` for targeted runs with full `npm test` + `npm run lint` at each task's end and `npm run build` once in the final task.

- [ ] **Step 4: Self-review the plan against the backlog**

Walk the `Open` sections of `docs/open-follow-ups.md` and confirm every in-scope item maps to a task. List any gaps and fix them inline. Check that no task references a helper or signature no other task defines — `expectAccessCheckedBeforeWrite` in `test/helpers/access-order.ts` already exists and should be used by name for the guard-assertion tasks.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-09-20-follow-ups-sweep.md
git commit -m "docs(plan): ordered tasks for the follow-ups sweep

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Report the task count and total item coverage as the task result**

State how many items the sweep plan covers, how many tasks it has, and which priorities are represented — the operator decides from that whether to run it whole or trim it.
