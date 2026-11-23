# Shift Check, Branch A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure layout shift on cold load, section switch and after an action across the whole signed-in app, fix every unprompted shift, and make every mutating control answer at once.

**Architecture:** The existing Playwright layout audit (`scripts/layout-audit.ts`) gains wider cold-load coverage and two new sets, `switch` and `action`, each writing its own JSON. Fixes are driven by what those files report. A static inventory of mutating controls drives the feedback sweep.

**Tech Stack:** Next 16.4 (App Router, React 19.3, React Compiler), Playwright 1.64 (devDependency), Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-23-shift-check-and-feedback-feel.md` (Branch A sections only).

## Global Constraints

- ADR 0063 stands: no new `loading.tsx`, no `template.tsx`, no page-wide skeleton. `app/(app)/trips/loading.tsx` is the only one.
- Before touching Next APIs, read the relevant guide in `node_modules/next/dist/docs/`.
- The audit runs against the local demo trip only (`LAYOUT_AUDIT_DEEP_TRIP` default "EU Christmas 2026"). Never a real trip, never production. Never run `feedback:pull`, `feedback:resolve`, `feedback:accept` or `usage:report`.
- **Dev server:** only tasks marked **[server]** may start it, and they run one at a time. Port 3000 (maps key is referrer-restricted). `DATABASE_URL` from `.env` with `host.docker.internal` replaced by `localhost`. Stop it when the task ends, and before any `npm run build`. Audit output goes outside the repo (`LAYOUT_AUDIT_OUT`).
- Layout-shift entries exist only in Chromium; phone widths are emulated there.
- Bare `npx vitest` needs `TZ=UTC`.
- Verification tiers: inner loop `npx vitest run <file>`; task done `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. The full suite and `next build` run once, in Task 10.
- Code style: no comments unless the why is non-obvious; no JSDoc; no features beyond the task; no defensive checks for impossible cases.
- A fix reserves space or moves a decision to the server. A fix needing more than a contained change (a cookie migration, a data-model change, more than three files outside the component) is **listed, not built**.
- No new motion, no new toasts. Those belong to Branch B.
- Commit per task, path-scoped (`git add <paths>`), ending with the two attribution lines the orchestrator supplies. Never push.

## Review Focus

1. **Reserved space with nothing to fill it.** A slot reserved for late content (the bell, a banner, a count) must not leave a gap on a page or width where that content never arrives. Pinned in Task 5 and in every Task 7 fix.
2. **Optimistic control whose action fails.** The control must return to its real state and the existing failure message must show. Pinned in Task 9.
3. **Second tap while pending.** A control showing `loading` or `aria-busy` must not fire its action twice. Pinned in Task 9.
4. **Audit flows that change data.** Each action flow must leave the demo trip as it found it, so a second run finds the same thing to tick, add, vote on and pay. Pinned in Task 3.
5. **Offline.** The app is read-only offline (ADR 0016). A control made optimistic must not show a result offline that never saves. Pinned in Task 9.

---

## Lanes

- **Lane X [server], strictly in order:** Task 1 → 2 → 3 → 4 → 7 → 10.
- **Lane Y, parallel with X, no server:** Task 5.
- **Lane Z, parallel with X, no server:** Task 6 → 8 → 9.
- Task 7 starts after Tasks 4 and 5. Task 10 is last.

---

### Task 1: Cold-load shift on phone and desktop, more routes **[server]**

**Files:**
- Modify: `scripts/layout-audit/config.ts`, `scripts/layout-audit/loading.ts`, `scripts/layout-audit.ts` (the `sets.has("cls")` block, ~871-901, and the header comment)
- Test: `scripts/layout-audit/config.test.ts`, `scripts/layout-audit/loading.test.ts`

**Interfaces:**
- Produces, in `config.ts`:
  - `export const CLS_ROUTE_LABELS: string[]` = `LOADING_ROUTE_LABELS` plus `"globe", "account", "summary", "settings", "activity", "today", "more", "whats-new"`.
  - `export const SHIFT_PROFILE_IDS = ["iphone17-pwa", "1440"] as const`.
- Produces, in `loading.ts`:
  - `ClsResult` gains `profile: string`; `id` becomes `` `cls/${label}/${profile}` ``.
  - `measureCls(context, url, label, route, profile: string): Promise<ClsResult>`.
  - `mergeCls` keys on `id`, not `label`.
  - `export function holdBackRsc(delayMs: number): (route: Route) => Promise<void>` extracted from `captureLoading`'s inline `holdBack` (same behaviour; `captureLoading` uses it).
  - `export function resetShifts(page: Page): Promise<void>` sets `window.__auditCls = []`; `export function readShifts(page: Page): Promise<ShiftEntry[]>`.

- [ ] **Step 1: Failing tests.** `config.test.ts`: `CLS_ROUTE_LABELS` contains every `LOADING_ROUTE_LABELS` entry and the eight new labels, and every label exists in `ROUTES`. `loading.test.ts`: `mergeCls` keeps `cls/plan/iphone17-pwa` and `cls/plan/1440` as separate records, and a re-run of one replaces only that one.
- [ ] **Step 2: Run them, expect FAIL.** `TZ=UTC npx vitest run scripts/layout-audit/config.test.ts scripts/layout-audit/loading.test.ts`
- [ ] **Step 3: Implement.** The `cls` block loops `SHIFT_PROFILE_IDS` × `CLS_ROUTE_LABELS`, one Chromium context per profile. Log line becomes `[cls] <label> <profile> — …`. Update the header comment's description of `cls.json`.
- [ ] **Step 4: Tests pass.** Same command.
- [ ] **Step 5: Run it.** Start the dev server, then `LAYOUT_AUDIT_SETS=cls LAYOUT_AUDIT_OUT=<dir outside repo> npm run audit:layout`. Expected: one `[cls]` line per route per profile, no `ERROR`, exit 0. Report every non-zero result with its sources. Stop the server.
- [ ] **Step 6: Task-done checks, commit.** `feat(audit): cold-load shift on phone and desktop, eight more routes`

### Task 2: Section-switch shift **[server]**

**Files:**
- Create: `scripts/layout-audit/switch.ts`, `scripts/layout-audit/switch.test.ts`
- Modify: `scripts/layout-audit/config.ts` (`ALL_SETS` gains `"switch"`), `scripts/layout-audit.ts` (new block after `cls`, header comment), `scripts/layout-audit/config.test.ts`

**Interfaces:**
- Consumes: `holdBackRsc`, `resetShifts`, `readShifts`, `summariseShifts`, `CLS_INIT_JS`, `SHIFT_PROFILE_IDS` from Task 1.
- Produces, in `switch.ts`:
  - `export interface SwitchPair { from: string; to: string }` (route labels).
  - `export const SWITCH_PAIRS: SwitchPair[]`: both directions between each consecutive pair of `home, plan, day, budget, calendar, wishlist, checklists, files, journal, summary, activity, settings`; plus `trips → home`, `home → trips`, `globe → trips`, `account → trips`; plus `day → day-next` (the deep trip's next date after `LAYOUT_AUDIT_DAY`) and back.
  - `export interface SwitchResult { id: string; from: string; to: string; profile: string; cls: number; total: number; shifts: number; largest: ClsResult["largest"]; held?: Pick<ClsResult, "cls" | "total" | "shifts" | "largest">; error?: string }` with `id` = `` `switch/${from}-${to}/${profile}` ``.
  - `export function measureSwitch(context: BrowserContext, fromUrl: string, toPath: string, meta: { from: string; to: string; profile: string }): Promise<SwitchResult>`.
  - `export function mergeSwitch(prev: SwitchResult[], next: SwitchResult[]): SwitchResult[]` keyed on `id`.
- Output: `<out>/switch.json`.

**Method (not determined by the signature):** load `fromUrl`, settle, `resetShifts`, navigate with the App Router (`window.next.router.push`, as `captureLoading` does: no input event, so no shift is excused as input-driven), wait for the URL, settle, wait 1500ms, `readShifts`, `summariseShifts`. Do it twice: as is (`cls…`), and with `holdBackRsc(1500)` routed (`held`), so the old page holds first.

- [ ] **Step 1: Failing tests.** `SWITCH_PAIRS` has no duplicate `from-to`, every label except `day-next` is in `ROUTES`, and contains `home→plan` and `plan→home`. `mergeSwitch` replaces by `id`. `parseSets("switch")` is accepted.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `switch.ts` and the block in `layout-audit.ts` (log `[switch] home→plan iphone17-pwa — CLS x; held y`). A pair whose route cannot be resolved is logged as SKIPPED, as `deepRoutes` does.
- [ ] **Step 4: Tests pass.**
- [ ] **Step 5: Run it.** `LAYOUT_AUDIT_SETS=switch …`. Expected: a line per pair per profile, exit 0. Report every non-zero result with its sources; `home→plan` on `iphone17-pwa` was 0.133 on 2026-11-20, say what it is now. Stop the server.
- [ ] **Step 6: Task-done checks, commit.** `feat(audit): layout shift on section switches`

### Task 3: After-action shift **[server]**

**Files:**
- Create: `scripts/layout-audit/action.ts`, `scripts/layout-audit/action.test.ts`
- Modify: `scripts/layout-audit/config.ts` (`ALL_SETS` gains `"action"`), `scripts/layout-audit.ts`, `scripts/layout-audit/config.test.ts`

**Interfaces:**
- Consumes: Task 1's helpers; `openOverlay`, `OVERLAYS` and `isSubmitLabel` from `overlays.ts` for opening the Item and Cost dialogs.
- Produces, in `action.ts`:
  - `export interface ActionFlow { id: "checklist-tick" | "item-add" | "cost-add" | "vote" | "mark-paid"; routeLabel: string; act(page: Page): Promise<void>; undo(page: Page): Promise<void> }`.
  - `export const ACTION_FLOWS: ActionFlow[]` (all five; routes `checklists`, `day`, `budget`, `wishlist`, `budget`).
  - `export interface ActionShiftResult { id: string; flow: string; profile: string; during: Pick<ClsResult, "total" | "shifts" | "largest">; late: Pick<ClsResult, "total" | "shifts" | "largest">; undone: boolean; error?: string }` with `id` = `` `action/${flow}/${profile}` ``.
  - `export function splitShifts(entries: ShiftEntry[]): { during: ShiftEntry[]; late: ShiftEntry[] }` (`during` = `input: true`, `late` = `input: false`).
  - `export function measureAction(context: BrowserContext, url: string, flow: ActionFlow, profile: string): Promise<ActionShiftResult>`.
- Output: `<out>/action.json`.

**Method:** load, settle, `resetShifts`. Route server-action POSTs (request header `next-action` present) through a 1500ms delay, so the server's answer lands outside the 500ms window in which Chromium marks shifts as input-driven. `flow.act(page)` with real clicks. Wait for the POST to finish, settle, wait 1500ms, `readShifts`, `splitShifts`. Then unroute and `flow.undo(page)`; `undone` is whether the page is back as found (the row unticked, the added Item or Cost gone, the vote cleared, the Cost unpaid). `late` is the number that matters: movement when the server answers.

- [ ] **Step 1: Failing tests.** `splitShifts` separates by `input`. `ACTION_FLOWS` has exactly the five ids, each with a `routeLabel` in `ROUTES`. `parseSets("action")` is accepted.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Tests pass.**
- [ ] **Step 5: Run it twice in a row.** `LAYOUT_AUDIT_SETS=action …`. Expected both times: five flows × two profiles, every `undone: true`, exit 0, and the second run's results match the first's in kind (Review Focus 4). Report every `late` shift with its sources. Stop the server.
- [ ] **Step 6: Task-done checks, commit.** `feat(audit): layout shift after an action, five flows`

### Task 4: Measure, and write the findings **[server]**

**Files:**
- Create: `docs/audits/2026-11-23-shift-and-feedback-check.md`

**Interfaces:**
- Consumes: `cls.json`, `switch.json`, `action.json`.
- Produces: the audit doc's `## Shift findings` table, which Task 7 works from. Columns: `Id` (S1, S2, …), `Moment` (cold / switch / action), `Where` (route or pair, profile), `Score`, `What moves` (the element, from → to, in plain words), `Cause` (file and line), `Verdict` (`fix` / `list: <reason>` / `expected: <reason>`).

- [ ] **Step 1: Run all three sets** into one out dir: `LAYOUT_AUDIT_SETS=cls,switch,action`. Keep the out dir; Task 10 compares against it.
- [ ] **Step 2: Two cases the default run misses.** (a) Trips list with the What's new card unseen: clear whatever marks it seen for the audit user (find the mechanism in `components/whats-new/`), measure `cls/trips` on both profiles, restore. (b) Cold load of a trip page with RSC held back, both profiles: does anything move between the loading mark and the page (polish decision N1 says no)?
- [ ] **Step 3: Trace each non-zero result to its cause** in the code (the element's selector and text are in the JSON). One row per distinct cause, not per measurement. `expected` is only for the thing the Traveller just added, removed or ticked moving once at the moment of the action; anything else moving, or anything moving again when the server answers, is a finding.
- [ ] **Step 4: Write the doc**: a "Measured before" table of every result (zeros summarised as one line), then `## Shift findings`. Leave `## Fixed`, `## Waiting on Cam` and `## Feedback sweep` headings empty for later tasks. Stop the server.
- [ ] **Step 5: Commit.** `docs(audit): shift check, measured before`

### Task 5: The Day view bell keeps its place in the phone top bar

**Files:**
- Modify: `app/(app)/layout.tsx:184` (the `#top-bar-trip-slot` div), `components/trip/day/top-bar-bell.tsx`, and whichever Day view server file renders `TopBarBell` (find with `git grep TopBarBell`)
- Test: the existing test beside whichever of those has one; else `components/trip/day/top-bar-bell.test.tsx`

**Problem:** the bell is portalled into the slot after hydration, so on a phone Day view the slot grows from empty to 48px and the Globe link moves (measured: the right-hand group goes from 154px to 202px wide).

**Requirement:** on a phone Day view the slot's width is in the server's HTML before the bell arrives; on every other page and at `md` and up (where the top bar bell is not used, check this) the slot takes no space. The layout is shared and cannot know the route, so the signal must come from the Day view's own server markup (for example a marker element the slot's CSS reads with `:has()`), not from a client effect.

- [ ] **Step 1: Failing test:** the Day view's server render carries the marker, and the slot's class reserves `min-w-12` (48px) under that marker and not without it (Review Focus 1: no gap elsewhere).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Test passes; task-done checks.**
- [ ] **Step 5: Commit.** `fix(day): the top bar keeps the bell's place before the bell arrives`

Task 4 or Task 10 measures it; this task does not start the server.

### Task 6: Inventory every mutating control

**Files:**
- Modify: `docs/audits/2026-11-23-shift-and-feedback-check.md` if Task 4 has created it; otherwise create `docs/audits/2026-11-23-feedback-inventory.md` and Task 10 folds it in.

**Interfaces:**
- Produces: a `## Feedback sweep` table, one row per control that calls a server action or a mutating `fetch` from a client component under `app/` and `components/` (exclude `*.test.*`, `design_handoff/`). Columns: `Id` (F1, …), `Control` (what the Traveller sees), `File:line`, `Today` (`optimistic` / `loading` / `disabled only` / `nothing`), `Verdict` (`ok` / `make optimistic` / `add loading` / `list: <reason>`).

**Method:** start from every use of `useServerAction`, `useEntityForm`, `useTransition`, `useOptimistic`, and every import from a `"use server"` module into a client file; follow each to the control that triggers it. Rule for the verdict: ticks, toggles and votes are `make optimistic` unless already so; everything else needs `loading` on a `Button`, or `disabled` + `aria-busy` on a control that is not a `Button`. `disabled only` (greys out, no spinner, no `aria-busy`) on a `Button` is `add loading`. Read-only; no code changes.

- [ ] **Step 1: Build the table.** State the totals by `Today`.
- [ ] **Step 2: Commit.** `docs(audit): every mutating control and how it answers today`

### Task 7: Fix the shift findings **[server]**

**Files:** per finding, named in Task 4's table.

**Interfaces:**
- Consumes: `## Shift findings` rows with `Verdict: fix`, and Task 5's change.

The orchestrator dispatches one implementer per group of findings that share files, in order, each given the row(s) verbatim. Per finding:

- [ ] **Step 1: Failing test** that pins the reserved space or the server-rendered decision (a render test on the component; where a test file exists beside it, add to it).
- [ ] **Step 2: Fix** by reserving the space or rendering the decision on the server. If it turns out to need more than a contained change, stop, change the row's verdict to `list: <reason>`, and move on.
- [ ] **Step 3: Check the reserved space is not left empty** where the content never arrives: another phase, an empty trip, the other profile (Review Focus 1).
- [ ] **Step 4: Re-measure just that case** (`LAYOUT_AUDIT_ONLY=cls/<label>` or `switch/<from>-<to>` or `action/<flow>`). Expected: 0, or `late.shifts` 0. Stop the server.
- [ ] **Step 5: Task-done checks, commit** `fix(<area>): <what no longer moves>`, and move the row to `## Fixed` with before and after.

`home→plan` on the phone is a finding here whatever Task 4 scores it, unless it measures 0 in both runs.

### Task 8: Feedback sweep, shared pieces first

**Files:**
- Modify: only shared components the inventory shows are the cause for several rows at once (candidates: `components/ui/row-actions.tsx`, `components/ui/confirm-dialog.tsx`, `components/ui/form-dialog.tsx`, `components/ui/use-entity-form.ts`), and their tests.

**Interfaces:**
- Consumes: Task 6's table.
- Produces: whatever prop the shared piece gains, named `loading?: boolean` to match `Button`. Record each in the audit doc so Task 9's implementers use it.

- [ ] **Step 1:** Group the `add loading` rows by shared component. Where one shared change answers three or more rows, write the failing test there (while the action's promise is unresolved, the control has `aria-busy="true"` and is disabled; a second click does not call the action again), implement, pass.
- [ ] **Step 2: Task-done checks, commit.** `fix(ui): <component> shows it is working while its action runs`

If no shared change answers three or more rows, this task is a no-op: say so and go to Task 9.

### Task 9: Feedback sweep, control by control

**Files:** per row, named in Task 6's table. The orchestrator splits the remaining rows into lanes by directory with no file in two lanes (`components/trip/settings/`, `components/trip/` rest, `components/money/` + `components/plan/`, everything else) and runs the lanes in parallel.

Per row:

- [ ] **Step 1: Failing test** in the control's existing test file (create one only if there is none):
  - `add loading`: while the action is unresolved the control is disabled and `aria-busy="true"`; a second click does not call the action again (Review Focus 3).
  - `make optimistic`: the new state shows before the action resolves; when the action fails it returns to the old state and the existing failure message shows (Review Focus 2); offline it behaves as the control did before this change (Review Focus 5: find how the neighbouring optimistic controls, `components/trip/checklist.tsx` and `components/trip/vote-control.tsx`, handle offline and match them).
- [ ] **Step 2: Implement** with `Button`'s `loading`, Task 8's props, or `useOptimistic` in the shape `checklist.tsx` uses.
- [ ] **Step 3: Test passes.**

Per lane:

- [ ] **Step 4: Task-done checks, commit.** `fix(<area>): <n> controls answer at once`. Mark the rows done in the audit doc.

### Task 10: Whole-branch verification and the report **[server]**

**Files:**
- Modify: `docs/audits/2026-11-23-shift-and-feedback-check.md`

- [ ] **Step 1:** `npm test`. Expected: all pass.
- [ ] **Step 2:** Dev server stopped, then `npm run build`. Expected: clean.
- [ ] **Step 3:** `npm run test:integration` (local DB is up). Expected: all pass.
- [ ] **Step 4:** Re-run `LAYOUT_AUDIT_SETS=cls,switch,action` into a new out dir, plus Task 4's two extra cases. Expected: every `fix` finding at 0.
- [ ] **Step 5: Finish the doc:** "Measured after" beside "Measured before"; `## Fixed`; `## Waiting on Cam` (every `list:` row from both tables, with the reason and what it would take; and the phone checks he should do); the sweep's totals before and after. Plain words, no jargon.
- [ ] **Step 6: Commit.** `docs(audit): shift check and feedback sweep, what was fixed and what waits on Cam`
