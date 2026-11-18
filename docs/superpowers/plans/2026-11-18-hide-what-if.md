# Hide What-if Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every way to see, create, open, compare or apply a What-if plan (Fork), leaving code and data dormant behind one switch.

**Architecture:** One exported constant in `lib/plan-scope.ts` read by the two display choke points (`resolvePlan`, `showForkSwitcher`), the access guards in `lib/guards.ts`, and the few actions that bypass them. Feature tests stay and run with the switch mocked off; new tests pin the hidden behaviour.

**Tech Stack:** Next.js 16, React 19, Prisma 7, Vitest + Testing Library.

**Spec:** `docs/specs/2026-11-18-hide-what-if.md`

## Global Constraints

- Branch `chore/hide-what-if`. Path-scoped commits; never stage `AGENTS.md`; never edit `docs/feedback/inbox.md`.
- Never run `npm run feedback:*` or `npm run travel-times:refresh`; never load `.env.production.local`; local database only; never push.
- No migration, no schema change, no deleted feature code (components, actions and their tests stay).
- With `WHAT_IF_PLANS_HIDDEN` false, behaviour must be exactly as on main: existing Fork tests keep passing by mocking the constant to false (`vi.mock("@/lib/plan-scope", importOriginal …)` or the file's own pattern), not by being deleted.
- No em-dashes in Traveller-facing strings. Default to zero comments. `"use client"` modules export components only.
- Verification: `TZ=UTC npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`; then once at the end `npm test`, `npx knip --include files,exports,types`, and the integration suite against the local database (DATABASE_URL and DIRECT_URL overridden to localhost).

## Review Focus

1. A Traveller with an old link carrying `?plan=<forkId>`, or `/compare` bookmarked: lands on the real plan, no error page, no flash of the What-if plan.
2. A trip that already has Forks and `forksEnabled` true (the demo trip): every page renders the real plan; counts, Money, Files and nav badges do not change because the switch flipped.
3. A direct call to any fork action or a write with a `forkId` (stale tab open on a What-if plan when the deploy lands): refused cleanly with the app's normal not-found or refusal message, nothing written.
4. Real-plan writes are untouched: every guard change must leave `forkId: null` rows exactly as before.
5. Knip and the help guide's drift tests: components now unreachable must not fail the unused-code check in a way that forces deleting them (use knip's existing ignore mechanism for the dormant files, listed in one place with a dated note).

---

### Task 1: Hide What-if plans behind one switch

**Spec:** H1 to H4, all of it. **Files:** as named in the spec, plus tests beside each; `knip` config if dormant files need listing.

- [ ] **Step 1: Failing tests** (new, with the constant at its real value true): `resolvePlan` returns the real plan for a `plan` param naming an existing Fork; `showForkSwitcher` is false for a trip with `forksEnabled` true; the Compare page redirects to the Plan without calling `getComparison`; Trip settings renders no "What-if plans" switch; `requireForkAccess` and `requirePlanAccess` with a `forkId` answer not-found; `requireRowAccess` answers not-found for a Fork-owned Item and still returns a real-plan Item; `createFork`, `getComparison` refuse; `setForksEnabled(true)` refuses and `setForksEnabled(false)` succeeds; the travel-time refresh requests no keys for Fork rows; the help guide has no What-if section and its drift test passes; MCP vocabulary test updated.
- [ ] **Step 2:** Run them; expect failures.
- [ ] **Step 3:** Implement per the spec. Existing Fork tests: mock the constant to false at the top of each affected test file so they keep proving the dormant feature works.
- [ ] **Step 4:** Tests pass; task-done verification; then the end-of-branch checks from Global Constraints.
- [ ] **Step 5:** Commit `chore(what-if): hide What-if plans behind one switch`, then a second commit for the words (H4): `docs: What-if plans are hidden pending removal`.
