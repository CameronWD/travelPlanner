# Google extras — Branch 1: Full allowance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Teepee's hand-written Google daily caps with one allowance table and a single share number (now 1), and update the docs to the share-1 numbers.

**Architecture:** A new server module `lib/google-budget.ts` holds each SKU's free monthly allowance and `GOOGLE_SHARE`. `dailyCap(sku)` returns `floor(allowance × share ÷ 30)`. The two existing call sites (Routes refresh, venue details) pass `dailyCap(...)` to the unchanged `takeGoogleQuota(sku, limit)`. Branches 2–5 add their SKUs to the same table.

**Tech Stack:** Next.js (repo version), TypeScript, Vitest.

**Spec:** `docs/specs/2026-11-06-google-extras.md` §A (and §Delivery for the branch-1 carry-over).

## Global Constraints

- Allowances (free / month): Routes Compute Routes Essentials 10,000; Place Details Enterprise 1,000; Nearby Search Enterprise 1,000; Place Details Pro 5,000; Static Maps 10,000.
- `GOOGLE_SHARE = 1` (was 0.5). Daily cap = `Math.floor(allowance × share / 30)` → 333 / 33 / 33 / 166 / 333.
- Console quotas written in the docs must be ≥ the app cap for the same API: **333/day** for each Essentials method (Dynamic Maps, Geocoding, Routes, GetPlace, Autocomplete); SearchText stays 1,000.
- The operator scripts' `--cap` override keeps working (an explicit limit beats the table).
- Verification tiers per `CLAUDE.md`: inner loop `npx vitest run <file>`; task done `npx vitest related --run <changed files>` + `npx tsc --noEmit` + `npx eslint <changed files>`.
- Zero comments unless the WHY is non-obvious; no JSDoc.

## Review Focus

1. `--cap 500` on `npm run travel-times:refresh` must still lift the Routes limit to 500. Pinned by the existing refresh test (`dailyCap` 500 case), updated in Task 1.
2. Rounding: share 0.5 must give 166 for Routes (floor, not round, not the old hand-picked 165). Pinned in `lib/google-budget.test.ts`.
3. A SKU name typo must fail the type check rather than silently get cap `NaN` (which makes `count <= NaN` always false and blocks every call). Pinned by typing `dailyCap`'s parameter as the table's key union.
4. Venue details stays gated before any Google call: access check, then server key, then quota. Covered by the existing `venue-details.test.ts` ordering assertions, updated to 33.
5. The docs' console numbers equal the app caps (333), so the console never refuses before the app's own counter does. Checked in the Task 1 review by reading the diff.

---

### Task 0 (controller, before dispatch): Branch and carry-over commits

Not a subagent task. On `main`:

- [ ] `git switch -c feat/google-extras-1-allowance`
- [ ] Commit the operator-script fix alone: `git add lib/surprise-guard.ts`, with message `fix(scripts): surprise-guard loads next/navigation lazily so operator scripts start`. Body: tsx under `--conditions=react-server` resolves `next/navigation` to the client build, which crashed `backfill:places` at load through `lib/item-family`.
- [ ] Commit the grill docs: `git add docs/specs/2026-11-06-google-extras.md docs/adr/0076-google-maps-platform-replaces-the-free-map-stack.md CONTEXT.md docs/superpowers/plans/2026-11-06-google-extras-1-allowance.md`, with message `docs(google-extras): spec, ADR 0076 amendment, glossary terms, branch 1 plan`.
- [ ] Never stage `docs/feedback/inbox.md` or `AGENTS.md`.

### Task 1: One allowance table, both caps read it, docs at share 1

**Files:**
- Create: `lib/google-budget.ts`
- Test (create): `lib/google-budget.test.ts`
- Modify: `lib/travel-times/refresh.ts` (remove `ROUTES_DAILY_CAP`; worker uses `opts.dailyCap ?? dailyCap("routes")`)
- Modify: `lib/travel-times/refresh.test.ts:132,139` (165 → 333)
- Modify: `server/actions/venue-details.ts` (remove `VENUE_DETAILS_DAILY_CAP`; pass `dailyCap("venue-details")`)
- Modify: `server/actions/venue-details.test.ts:29` (15 → 33)
- Modify: `scripts/refresh-travel-times.ts` docblock (it names `ROUTES_DAILY_CAP`; say "the Routes daily cap from lib/google-budget")
- Modify: `docs/DEPLOY.md` §4j: the cost rule paragraph (lines ~539–544), the quota table (~569–576) and the notes beneath it (~580–590)
- Modify: `docs/maps-overview.md` lines ~39–40, 270–272, 308, 363, 440, 467

**Interfaces:**
- Produces (Branches 2–5 extend the table, never re-declare it):
  - `export const GOOGLE_SHARE = 1;`
  - `export const GOOGLE_FREE_MONTHLY = { routes: 10_000, "venue-details": 1_000, "nearby-search": 1_000, "venue-status": 5_000, "static-maps": 10_000 } as const;`
  - `export type GoogleSku = keyof typeof GOOGLE_FREE_MONTHLY;`
  - `export function dailyCap(sku: GoogleSku, share: number = GOOGLE_SHARE): number`
- Consumes: `takeGoogleQuota(sku: string, limit: number): Promise<boolean>` from `lib/google-usage.ts`, unchanged.
- `lib/google-budget.ts` imports nothing server-only and needs no `"server-only"`: it is pure data and arithmetic.

- [ ] **Step 1: Write the failing test** `lib/google-budget.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { GOOGLE_SHARE, dailyCap } from "./google-budget";

describe("dailyCap", () => {
  it("gives Teepee the whole free allowance ÷ 30 at share 1", () => {
    expect(GOOGLE_SHARE).toBe(1);
    expect(dailyCap("routes")).toBe(333);
    expect(dailyCap("venue-details")).toBe(33);
    expect(dailyCap("nearby-search")).toBe(33);
    expect(dailyCap("venue-status")).toBe(166);
    expect(dailyCap("static-maps")).toBe(333);
  });

  it("floors a shared allowance: share 0.5 gives Routes 166 and Enterprise 16", () => {
    expect(dailyCap("routes", 0.5)).toBe(166);
    expect(dailyCap("venue-details", 0.5)).toBe(16);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (module not found)

Run: `npx vitest run lib/google-budget.test.ts`

- [ ] **Step 3: Implement `lib/google-budget.ts`** with exactly the Interfaces above.

- [ ] **Step 4: Run it, expect PASS**

Run: `npx vitest run lib/google-budget.test.ts`

- [ ] **Step 5: Update the two existing tests first, run them, expect FAIL**

- `lib/travel-times/refresh.test.ts`: the two `("routes", 165)` expectations become `("routes", 333)`. The `500` case is unchanged.
- `server/actions/venue-details.test.ts`: `("venue-details", 15)` becomes `("venue-details", 33)`.

Run: `npx vitest run lib/travel-times/refresh.test.ts server/actions/venue-details.test.ts`

Expected: FAIL on those expectations, which still see 165 and 15.

- [ ] **Step 6: Wire the call sites**

- `refresh.ts`: delete `ROUTES_DAILY_CAP`; call `takeGoogleQuota("routes", opts.dailyCap ?? dailyCap("routes"))`.
- `venue-details.ts`: delete the constant; call `takeGoogleQuota("venue-details", dailyCap("venue-details"))`.
- `grep -rn ROUTES_DAILY_CAP` across the repo must return nothing outside `docs/` history, so fix the script docblock.

- [ ] **Step 7: Run them, expect PASS**

Run: `npx vitest run lib/travel-times/refresh.test.ts server/actions/venue-details.test.ts lib/google-budget.test.ts`

- [ ] **Step 8: Docs at share 1**

`docs/DEPLOY.md` §4j:
- The cost rule now reads: each API's per-day quota is **Teepee's share** (now all) of its free monthly allowance ÷ 30. The billing account is no longer shared, because the property tracker's Google usage stopped on 2026-11-06. The share is `GOOGLE_SHARE` in `lib/google-budget.ts`.
- Remove the hometracker follow-up sentence.
- Table column header: "Per-day quota (share ÷ 30)". Values: Dynamic Maps 333, Geocoding 333, Routes 333, GetPlace 333, Autocomplete 333, Text Search 1,000.
- Notes: the GetPlace cap is 333. Enterprise is held to **33/day** by the app via `dailyCap("venue-details")`. Autocomplete's "half … shared with hometracker" sentence becomes "the whole allowance ÷ 30".
- Add one line: free usage is per calendar month per billing account, so a share change takes effect from the next month, or after Billing → Reports shows room.
- Steps 12 and 13 (already run on 2026-11-06): change "back to 165" to "back to the step 6 value", and "stops at 165/day" to "stops at its daily cap".

`docs/maps-overview.md`: the same substitutions at the listed lines (half → share, 165 → 333, 15 → 33, `takeGoogleQuota("venue-details", 15)` → `dailyCap("venue-details")`, `takeGoogleQuota("routes", 165)` → `dailyCap("routes")`).

Leave historical docs (`architecture-sitrep-*`, `HANDOFF.md`, `audits/`, `open-follow-ups.md`, specs, plans) alone.

- [ ] **Step 9: Task-done verification**

Run:
```
npx vitest related --run lib/google-budget.ts lib/travel-times/refresh.ts server/actions/venue-details.ts scripts/refresh-travel-times.ts
npx tsc --noEmit
npx eslint lib/google-budget.ts lib/google-budget.test.ts lib/travel-times/refresh.ts lib/travel-times/refresh.test.ts server/actions/venue-details.ts server/actions/venue-details.test.ts scripts/refresh-travel-times.ts
```
Expected: all pass. The one known exception is `transport-form-dialog` "defaultDate is ignored when editing", which is timezone-dependent and passes under `TZ=UTC`. Re-run any such failure with `TZ=UTC` before calling it real.

- [ ] **Step 10: Commit**

```bash
git add lib/google-budget.ts lib/google-budget.test.ts lib/travel-times/refresh.ts lib/travel-times/refresh.test.ts server/actions/venue-details.ts server/actions/venue-details.test.ts scripts/refresh-travel-times.ts docs/DEPLOY.md docs/maps-overview.md
git commit -m "feat(google): one allowance table; Teepee takes the whole free allowance"
```
