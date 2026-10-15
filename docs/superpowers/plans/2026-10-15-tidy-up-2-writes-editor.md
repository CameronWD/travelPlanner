# Tidy-up batch 2 — Writes and the editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every write's cache invalidation, Activity diff, cost payload, Undo and plan-editor state through one module each, close the batch-1 minors routed here, and replace "shared pot" with "Your whole trip, in one place." / **Trip cost**.

**Architecture:** Five new deep modules absorb hand-written copies: `lib/revalidate.ts` (scoped cache invalidation), `auditedUpdate`/`recordUpdate` in `lib/activity-guard.ts` (read-before → update → Activity), `components/money/cost-fields/` (one ADR 0037 cost form state and payload), `components/ui/use-undoable-action.ts` (apply → persist → revert → Undo toast), and `components/plan/plan-editor-state.ts` (a pure reducer that owns the plan editor's local rows under the Q7 rules, driven by a `usePlanEditor` hook). Callers keep only their own rules. Everything else is deletion.

**Tech Stack:** Next.js 16.3 App Router (read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md` before Task 4), React 19, Prisma 7, zod, Vitest 3 (node project for `.ts`, happy-dom for `.tsx`), Testing Library, dnd-kit, TypeScript strict.

**Spec:** `docs/specs/2026-10-14-tidy-up-pass.md` — Batch 2 section (cards 2.E, 2.G, 2.H, 2.I, 2.K, 2.Q), decisions Q6, Q7, Q10, bug TB-07. Batch-1 leftovers: `docs/follow-ups/2026-10-15-tidy-up-batch-1-deferred.md` (only items not labelled "Batch 3"). Review source: `docs/audits/2026-10-14-architecture-review.html` (cards E, G, H, I, K); ARCH-CMP-1..4 full text in `docs/architecture-sitrep-2026-09-22.md:1010-1084`; ARCH-OBS-3 at `:890`.

## Global Constraints

- Branch `chore/tidy-up-2-writes-editor`. Never commit to, merge into, rebase onto or push `main`. Never deploy. Never run `feedback:resolve`, `feedback:accept` or `feedback:pull` (subagents especially: `feedback:pull` opens production).
- Don't commit `next dev`'s CLAUDE.md block if it reappears.
- Vocabulary per CONTEXT.md: **Plan**, **real plan**, **Fork**, **Traveller**, **Surprise**, **Cost**, **cost amount**, **paid amount**, **Paid**, **Trip cost**, **Budget**. Never "shared pot", "itinerary" in new prose, "estimated/actual".
- Forks are frozen: keep every fork path correct; build nothing fork-specific.
- Per task: `npx vitest run <the test files worked>` in the loop; at task end `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never run the full suite or `next build` per task.
- Once, at the end (Task 19): `npm test`, `npm run build`, `npm run test:integration` (local Postgres: `docker compose up -d` then `npx prisma migrate deploy`), `npm run knip`, `npx eslint .`.
- Commit after every task, message in the repo's `type(scope): …` style, ending with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Task 1's commit (and only it) also carries `Resolves-Feedback: cmva2k0km000008jpa7pjv26q` on its own line before the Co-Authored-By trailer.
- A bug fix writes its failing test first, and the commit message names the id (TB-07, ARCH-CMP-n, BI-04).
- `"use server"` files: every export must be an `async function` and must appear in `lib/server-action-exports.test.ts`'s `ALLOWLIST`. Pure helpers go in `lib/` or `components/`, not action files.
- Page and component tests: rewrite the mocks, keep the assertions (spec Q10). Delete an assertion only when it asserts a query shape or a handler-capture mechanic, and say so in the commit message.
- Actions return `ActionResult` (ADR 0074): form-level key `"_"`, guards throw `notFound()`, validation returns, infrastructure reports.

## Deviations from the spec text (decided while planning; Task 19 writes them into the spec)

- **2.E counts:** 131 literal `revalidatePath` calls in `server/actions` (not 164), nine helpers (as stated). Only **three** `router.refresh()` calls remain (commits `94e2067c`, `3344e125` removed the others on 2026-10-06); none of the three follows a revalidating action — two follow `markAllRead` (Activity read marker, deliberately not revalidated), one follows a slug-changing `router.replace` — so **none is removed**.
- **2.K location:** `lib/activity.ts` is a pure module by contract ("no Prisma / React / network"). `auditedUpdate` and its sibling `recordUpdate` go in `lib/activity-guard.ts`, which already owns `recordPlanActivity`. The pure `describeChanges`/`entityLabel` stay in `lib/activity.ts` and change their parameter types so the 39 casts can go.
- **2.K transactions:** five update sites run inside `db.$transaction` and some build a synthetic `after`. `auditedUpdate` covers the plain sites; the transactional and synthetic sites call `recordUpdate(entityType, { tripId, plan, entityId, before, after })` after commit. Activity is still only ever recorded after the write succeeds.
- **2.I unparseable cost:** the three entity forms today silently drop a cost amount they can't parse and save without it. With one payload builder they show "Enter the cost" like the editors do. This is a bug fix (a typed cost silently lost); the commit says so.
- **2.G CMP-4:** the empty-chapter delete button already has `tap-target` (44px coarse-pointer hit area, added 2026-09-30); the remaining gap is its visible 28px size vs ADR 0029's `size-8`.

## Review Focus

Inputs the spec implies but no existing test exercises; each line's test is added to the owning task.

1. **A revalidation becoming due while a plan-editor write is in flight** (another Traveller's change, or this write's own revalidation landing first) must not wipe the in-flight optimistic edit; the newer server rows are adopted once nothing is pending (Task 16, Task 17).
2. **Undo pressed after the Traveller edited another Stop inside the 6-second toast window** must restore only the rows the undone move touched, leaving the later edit intact (Task 16, Task 17).
3. **A reorder or Undo whose server call rejects (offline, 500)** must toast and put the list back in plan order, never leave it half-moved or throw unhandled (Task 17).
4. **A write to a table read by a page outside the writer's old path list** (a reminder on `/trips`, a journal photo on `/journal`, a chapter rename on `/settings`) must invalidate that page (Task 4 coverage test, Task 5, Task 6).
5. **A Cost edited in an entity form whose Paid box is ticked with the paid amount left blank** must refuse with "Enter what you paid" in every form, never save Paid without an amount (Task 10, Task 11).

---

## Task 1: Wording — "Your whole trip, in one place." and Trip cost (card 2.Q)

**Files:**
- Modify: `app/landing/landing.tsx:52-57, 73-78`, `app/landing/landing.test.tsx:38-40, 49, 101`, `app/page.test.tsx:93, 101`
- Modify: `lib/og-card.tsx:50-51`, `app/opengraph-image.tsx:6`, `app/share/[token]/opengraph-image.test.tsx:47` (+ `lib/og-card.test.ts` if it asserts copy)
- Modify: `app/layout.tsx:41`, `app/manifest.ts:7`
- Rename: `components/trip/home/desktop/shared-pot-tile.tsx` → `trip-cost-tile.tsx`, `shared-pot-tile.test.tsx` → `trip-cost-tile.test.tsx` (`git mv`)
- Modify: `components/trip/home/desktop/desktop-home-grid.tsx` (+ test), `app/(app)/trips/[tripId]/page.tsx` (import, `pot=` prop, comment at :264) and its test (:487 title)
- Modify: `components/trip/home/budget-glance.tsx:15,28`, `components/trip/home/phase-planning.tsx:194`, `components/trip/home/phase-past.tsx:116`, `components/trip/spend-so-far-card.tsx:33,40`, `components/trip/home/desktop/spend-so-far-tile.tsx:23,25,50`, `components/trip/compare-table.tsx:293,340`, `lib/desktop-home-loader.ts:7` and the matching tests (`budget-glance.test.tsx:21,29`, `phase-planning.test.tsx:667,907`, `phase-travelling.test.tsx:597`, `phase-past.test.tsx:414,421`, `spend-so-far-card.test.tsx:23`, `spend-so-far-tile.test.tsx:57`, `compare-table.test.tsx:142`)
- Modify: `scripts/contrast-audit.ts:995` (comment), `SPEC.md:65`

**Interfaces:**
- Produces: `TripCostTile` (same props as `SharedPotTile`), `DesktopHomeGrid` prop `cost` (was `pot`), `DESKTOP_GRID_SPANS.cover.cost` / `.noCover.cost`.

- [ ] **Step 1: Write the failing landing and OG tests**

In `app/landing/landing.test.tsx`, replace every `/Plan it with your people/` with `/Your whole trip, in one place/`, and the body string (lines 40 and 101) with:

```ts
const body = "Stops, trains, beds and budget. On your own or together.";
```

Add to the first landing test:

```ts
expect(document.body.textContent).not.toMatch(/Plan it with your people|shared pot/i);
```

In `app/page.test.tsx:93,101` use `/Your whole trip, in one place/`. In `app/share/[token]/opengraph-image.test.tsx:47` expect `"Your whole trip, in one place."` and add `expect(out).not.toContain("shared pot");`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run app/landing/landing.test.tsx app/page.test.tsx "app/share/[token]/opengraph-image.test.tsx"`
Expected: FAIL (old headline found).

- [ ] **Step 3: Change the copy**

`app/landing/landing.tsx` (both trees; keep classes and the coral span exactly):

```tsx
Your whole trip, in one place<span className="text-coral" aria-hidden="true">.</span>
```
```tsx
Stops, trains, beds and budget. On your own or together.
```

`lib/og-card.tsx` `DefaultOgCard`: headline text `Your whole trip, in one place.`, sub-line `Stops, trains, beds and budget. On your own or together.` (same styles). `app/opengraph-image.tsx`: `export const alt = "Teepee: your whole trip, in one place";`. `app/layout.tsx` and `app/manifest.ts`: `description: "Your whole trip, in one place."`. `scripts/contrast-audit.ts:995`: the comment names `"Your whole trip, in one place"`.

- [ ] **Step 4: Run the landing/OG tests to pass**

Run the Step 2 command. Expected: PASS. If the 100px OG headline overflows its 760px `maxWidth` in a rendered check, leave the size; the test only asserts copy.

- [ ] **Step 5: Write the failing in-app tests**

`trip-cost-tile.test.tsx` (after `git mv`): import `{ TripCostTile } from "./trip-cost-tile"`, describe `"TripCostTile"`, and the first test:

```ts
it("has a Trip cost h2, the abbreviated total and the paid progress bar", () => {
  renderTile();
  expect(screen.getByRole("heading", { level: 2, name: "Trip cost" })).toBeInTheDocument();
  expect(screen.queryByText(/shared pot/i)).toBeNull();
  // …the remaining assertions of the old test unchanged
});
```

and the link name test: `screen.getByRole("link", { name: /^Trip cost: \$950\.50 planned/ })`.

In each "never per person" test (`budget-glance`, `phase-planning:667`, `phase-travelling:597`, `phase-past:414`, `spend-so-far-card`, `spend-so-far-tile:57`, `compare-table:142`): keep the per-person assertions; replace any expectation of `shared pot` text with `expect(<container>.textContent).not.toMatch(/shared pot/i)`. Rename those test titles to "never frames money per person". `desktop-home-grid.test.tsx`: slot prop `cost` / testid `cost`, spans `.cost`. `page.test.tsx:487` title: "fills the grid with Trip cost, Route map and Sort these out — and no Reminders panel".

- [ ] **Step 6: Run to see them fail**

Run: `npx vitest run components/trip/home components/trip/spend-so-far-card.test.tsx components/trip/compare-table.test.tsx "app/(app)/trips/[tripId]/page.test.tsx"`
Expected: FAIL.

- [ ] **Step 7: Implement**

- `trip-cost-tile.tsx`: rename the component and props type to `TripCostTile`/`TripCostTileProps`; `<h2 className={EYEBROW}>Trip cost</h2>`; `aria-label={\`Trip cost: ${total} planned. Open Money\`}`; doc comment: "Desktop Home "Trip cost" tile (spec 2026-09-27-desktop-home §5, renamed 2026-10-15 card 2.Q). Money is one group total, never split per person." Remove the "shared pot" sentence.
- `desktop-home-grid.tsx`: `pot` → `cost` in the spans, props, destructuring and JSX; doc comment "Countdown 8 · Trip cost 4".
- `page.tsx`: import `TripCostTile`, `cost={<TripCostTile … />}`, comment :264 "fill the Trip cost, Route map…".
- `budget-glance.tsx:28`: `of {formatMoneyCompact(costTotalMinor, homeCurrency)} cost` (drop ` · shared pot`); doc comment :15 drop the pot sentence.
- `phase-planning.tsx:194`: `sub={<>{formatMoneyCompact(…)} paid</>}`.
- `phase-past.tsx:116`: remove the `sub="shared pot"` prop (check the component allows `sub` to be omitted; if `sub` is required, pass the paid line the Planning phase uses).
- `spend-so-far-card.tsx:40`, `spend-so-far-tile.tsx:50`, `compare-table.tsx:340`: delete the `<span>shared pot</span>` element (and an empty wrapper if it leaves one). Reword the comments at `spend-so-far-card.tsx:33`, `spend-so-far-tile.tsx:23,25`, `compare-table.tsx:293`, `lib/desktop-home-loader.ts:7` to "Trip cost" / "one group total".
- `SPEC.md:65`: `- **Money is one group total** — never split per person.`
- `grep -rn -i "shared pot\|sharedpot\|SharedPot" app components lib scripts SPEC.md` must return only `lib/release-notes.ts` (history, untouched).

- [ ] **Step 8: Run the in-app tests to pass, then the task-end checks**

Run the Step 6 command → PASS. Then `npx vitest related --run <changed files>`, `npx tsc --noEmit`, `npx eslint <changed files>`.

- [ ] **Step 9: Commit**

```bash
git add -A app components lib scripts SPEC.md
git commit -m "feat(copy): Your whole trip, in one place; Shared pot tile becomes Trip cost

Landing hero, link-preview card, site description and manifest say
\"Your whole trip, in one place.\" / \"Stops, trains, beds and budget. On
your own or together.\" — Teepee is for one Traveller or many. The
desktop Home tile is \"Trip cost\" (CONTEXT.md); every \"shared pot\"
label and suffix is gone. Spec 2026-10-14 card 2.Q.

Resolves-Feedback: cmva2k0km000008jpa7pjv26q
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Guard minors from batch 1 (T1–T4)

**Files:**
- Modify: `lib/guards.ts:142-150, 265-290`, `lib/guards.test.ts:430-485`
- Modify: `lib/checklist-select.ts` → fold into `lib/checklists.ts` (delete the file), `lib/guards.ts:12`
- Modify: `components/plan/banned-classes.test.ts:7,41`, `test/helpers/walk-sources.ts:6-13`
- Modify: `lib/globe.ts:79`, `lib/globe.test.ts:80`
- Modify: doc comments at `server/actions/stops.ts:61-65`, `items.ts:58-62`, `transport.ts:29-32`, `accommodation.ts:29-35`

**Interfaces:**
- Produces: `requirePlanAccess(tripId: string, forkId?: PlanId | null): Promise<{ user: SessionUser; membership: TripMembership; plan: PlanId }>` (use the actual user/membership types `requireTripAccess` returns — import them, don't restate). `CHECKLIST_ITEM_ACTIVITY_SELECT` now exported from `@/lib/checklists`.

- [ ] **Step 1: Write the failing Surprise-ref tests (do this first — security-relevant)**

In `lib/guards.test.ts` inside `describe("requireRowAccess (card C)")`, using the existing `noteFindUniqueMock`, `reminderFindUniqueMock`, `requireOutsideSurpriseMock`, `requireTripAccessMock` wiring (read the file's existing cases for the exact mock names and row shapes):

```ts
it("a note is checked against its own target", async () => {
  noteFindUniqueMock.mockResolvedValue({ id: "n1", tripId: "trip-1", targetType: "STOP", targetId: "s1" });
  await requireRowAccess("note", "n1");
  expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("user-1", {
    target: expect.objectContaining({ targetType: "STOP", targetId: "s1" }),
  });
});
it("a reminder is checked against its Stop", async () => {
  reminderFindUniqueMock.mockResolvedValue({ id: "r1", tripId: "trip-1", stopId: "s1" });
  await requireRowAccess("reminder", "r1");
  expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("user-1", { stopId: "s1" });
});
it("a reminder with no Stop is still checked (stopId null)", async () => {
  reminderFindUniqueMock.mockResolvedValue({ id: "r2", tripId: "trip-1", stopId: null });
  await requireRowAccess("reminder", "r2");
  expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("user-1", { stopId: null });
});
it("a surprised viewer is refused a note on the Surprise", async () => {
  noteFindUniqueMock.mockResolvedValue({ id: "n1", tripId: "trip-1", targetType: "STOP", targetId: "s1" });
  requireOutsideSurpriseMock.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
  await expect(requireRowAccess("note", "n1")).rejects.toThrow();
});
```

Match the real `ROW_SELECT.note` / `.reminder` field names and the user id the file's `requireTripAccessMock` resolves.

- [ ] **Step 2: Run** `npx vitest run lib/guards.test.ts`. These pin current behaviour, so they should PASS; if one fails, the guard has a real bug: stop and fix `surpriseRefFor` (`lib/guards.ts:298-317`) so the ref matches the test, and note it in the commit.

- [ ] **Step 3: Tidy `lib/guards.ts`**

- `findRow`: the `note`, `reminder` and default (`checklistItem`) branches use the computed `where` (it is already `{ id }` for them, since `FORK_SCOPED_KINDS` excludes them).
- `requirePlanAccess`: add the explicit return type above; delete both `as PlanId` casts.
- Move `CHECKLIST_ITEM_ACTIVITY_SELECT` into `lib/checklists.ts` (keep it pure — a `const` object, no Prisma import beyond types); update the import in `guards.ts:12`; `git rm lib/checklist-select.ts`. Run `npx madge --circular lib/checklists.ts lib/guards.ts` if available, otherwise confirm `lib/checklists.ts` imports nothing from `lib/guards.ts`.

- [ ] **Step 4: Tidy the rest**

- `components/plan/banned-classes.test.ts`: `import { existsSync } from "node:fs";` and walk `DIRS.filter((d) => existsSync(d))`.
- `test/helpers/walk-sources.ts` doc comment: add one line for `skipTests` and one saying a missing `dir` throws ENOENT (callers filter with `existsSync`).
- `lib/globe.ts:79`: "unlike `isTripOwnerOrAdmin` in `lib/access.ts`"; `lib/globe.test.ts:80`: "mirroring lib/guards.test.ts's requireRowAccess suite".
- Adapter doc comments: each says it is a thin adapter over `requireRowAccess("<kind>", id)` and lists the row fields `ROW_SELECT.<kind>` actually selects (read `ROW_SELECT` in `lib/guards.ts`); `transport.ts` adds "no Surprise check of its own (a Transport is never a Surprise root; ADR 0073)" only if that is what the code does — read it; `accommodation.ts` drops the stop hop.

- [ ] **Step 5: Task-end checks** (`vitest related` on the changed files, `tsc`, `eslint`), then commit:

```bash
git commit -m "chore(guards): pin note/reminder Surprise refs, typed requirePlanAccess, batch-1 minors T1-T4

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Plan-scoped Stop writes (batch-1 deferred, stops.ts)

**Files:**
- Modify: `server/actions/stops.ts` (`firmUpTrip` ~1163, `reorderStops` ~1322-1430, `restoreStops` ~1453-1608)
- Test: `server/actions/stops.test.ts` (or the file where `reorderStops`/`restoreStops` tests live — `grep -ln "restoreStops" server/actions/*.test.ts`)

**Interfaces:**
- Consumes: `requirePlanAccess(tripId, forkId)` (Task 2), `planScope(plan)` from `@/lib/plan-scope`.
- Produces: no signature change. `restoreStops` and `reorderStops` now resolve their plan through `requirePlanAccess(tripId, plan ?? rowsForkId)`; `restoreStops` refuses a passed `forkId` that differs from the rows' own with `formFail("One or more stops aren't part of this plan.")` — read `lib/action-result.ts` for `formFail`'s exact signature.

- [ ] **Step 1: Write three failing tests**

```ts
it("firmUpTrip updates Chapter spans scoped to this trip and plan", async () => {
  // arrange a plan with one chapter span via the file's existing firmUpTrip fixture
  await firmUpTrip("trip-1");
  expect(chapterUpdateMock).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "ch-1", tripId: "trip-1", forkId: null } }),
  );
});

it("restoreStops refuses a forkId that is not the rows' own plan", async () => {
  stopFindManyMock.mockResolvedValue([stop({ id: "s1", tripId: "trip-1", forkId: null })]);
  const r = await restoreStops([{ id: "s1", sortOrder: 0, chapterId: null, arriveDate: null, departDate: null }], "fork-1");
  expect(r.success).toBe(false);
  expect(stopUpdateMock).not.toHaveBeenCalled();
});

it("reorder and restore with no forkId still pass the Fork gate for Fork rows", async () => {
  stopFindManyMock.mockResolvedValue([stop({ id: "s1", tripId: "trip-1", forkId: "fork-1" })]);
  await restoreStops([{ id: "s1", sortOrder: 0, chapterId: null, arriveDate: null, departDate: null }]);
  expect(requirePlanAccessMock).toHaveBeenCalledWith("trip-1", "fork-1");
});
```

Use the test file's existing mock names and builders (`stop()` from `@/test/builders`). If `requirePlanAccess` isn't mocked there yet, mock `@/lib/guards`' export the same way other tests in the file do. Add the reorderStops twin of the third test.

- [ ] **Step 2: Run** the test file → FAIL.

- [ ] **Step 3: Implement**

- `firmUpTrip`: `db.chapter.update({ where: { id: span.id, tripId, ...planScope(plan) }, data: … })` (same shape `firmUpSegment` uses at ~1015).
- `restoreStops`: after loading rows (~1483), `const rowsPlan = rows[0].forkId ?? null;` if `forkId !== undefined && (forkId ?? null) !== rowsPlan` → return the form failure; if any row's `forkId` differs from `rowsPlan`, same failure. Then `const { plan } = await requirePlanAccess(tripId, rowsPlan);` and use `plan` for the lock, the Chapter check and the writes' `where` (`{ id, tripId, ...planScope(plan) }`).
- `reorderStops` (~1350): replace the stored-forkId fallback with `requirePlanAccess(tripId, forkId ?? rowsForkId)`.

- [ ] **Step 4: Run** → PASS. Task-end checks. Commit:

```bash
git commit -m "fix(stops): firmUpTrip scopes Chapter writes; reorder/restore resolve their plan through requirePlanAccess

Batch-1 deferred: a foreign chapterId can no longer be written by bare id,
restoreStops refuses a forkId that isn't the rows' own, and Fork rows with
no forkId pass the forksEnabled gate.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `lib/revalidate.ts` and its coverage test (card 2.E, part 1)

**Files:**
- Create: `lib/revalidate.ts`, `lib/revalidate.test.ts`
- Modify: `lib/trip-links.guard.test.ts:12` (add `lib/revalidate.ts` to `ALLOWED_FILES`)

**Interfaces:**
- Produces:
  - `type TripScope = "plan" | "money" | "lists" | "journal" | "travellers" | "trip"`
  - `revalidateTrip(tripId: string, ...scopes: [TripScope, ...TripScope[]]): void`
  - `revalidateTripsList(): void` (`/trips`), `revalidateAccount(): void` (`"/", "layout"`), `revalidateAccountPage(): void` (`/account`), `revalidateGlobe(): void` (`/globe`), `revalidateAdmin(): void` (`/admin`)
  - `SCOPE_PAGES: Record<TripScope, readonly TripPage[] | "layout">`, `SCOPE_TABLES: Record<TripScope, readonly string[]>`, `type TripPage` — exported for the coverage test.

- [ ] **Step 1: Write the failing tests**

`lib/revalidate.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { SCOPE_PAGES, SCOPE_TABLES, revalidateAccount, revalidateTrip, revalidateTripsList, type TripPage } from "./revalidate";

beforeEach(() => revalidatePathMock.mockClear());

describe("revalidateTrip", () => {
  it("money revalidates the pages that read Costs, by id path, once each", () => {
    revalidateTrip("t1", "money", "money");
    const paths = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/trips/t1/budget");
    expect(paths).toContain("/trips/t1");
    expect(new Set(paths).size).toBe(paths.length);
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/trips/t1", "layout");
  });
  it("the day pages go through the route pattern", () => {
    revalidateTrip("t1", "journal");
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/[tripId]/day/[date]", "page");
  });
  it("trip and travellers are layout-wide (NAV-02) and nothing else is", () => {
    revalidateTrip("t1", "plan", "travellers");
    expect(revalidatePathMock.mock.calls).toEqual([["/trips/t1", "layout"]]);
    revalidatePathMock.mockClear();
    revalidateTrip("t1", "trip");
    expect(revalidatePathMock.mock.calls).toEqual([["/trips/t1", "layout"], ["/trips"]]);
  });
  it("account is root-layout-wide; the trips list is one path", () => {
    revalidateAccount();
    revalidateTripsList();
    expect(revalidatePathMock.mock.calls).toEqual([["/", "layout"], ["/trips"]]);
  });
});

/**
 * Which tables each page under /trips/{id} reads. Keep in step with the pages'
 * loaders (readPlan, getDay, readTripShell, …). "" is Home.
 */
const PAGE_READS: Record<TripPage, readonly string[]> = {
  "": ["trip", "stop", "item", "transport", "accommodation", "cost", "exchangeRate", "chapter", "checklistItem", "reminder"],
  "/plan": ["stop", "item", "transport", "accommodation", "chapter", "cost", "exchangeRate", "fork", "attachment", "note", "dayTitle", "reminder", "tripMember"],
  "/budget": ["stop", "item", "transport", "accommodation", "chapter", "cost", "exchangeRate", "fork"],
  "/calendar": ["stop", "item", "transport", "accommodation", "chapter", "cost", "exchangeRate", "fork", "dayTitle"],
  "/summary": ["stop", "item", "transport", "accommodation", "chapter", "cost", "exchangeRate", "fork", "trip"],
  "/print": ["stop", "item", "transport", "accommodation", "chapter", "cost", "exchangeRate", "fork"],
  "/compare": ["fork", "stop", "item", "transport", "accommodation", "chapter", "cost", "exchangeRate"],
  "/day": ["accommodation", "attachment", "chapter", "cost", "dayTitle", "item", "journalEntry", "stop", "transport", "trip"],
  "/journal": ["journalEntry", "attachment", "trip", "tripMember"],
  "/checklists": ["checklistItem", "packingTemplate", "trip", "tripMember", "stop", "reminder"],
  "/wishlist": ["trip", "item", "cost", "note", "vote", "stop", "attachment", "tripMember"],
  "/files": ["attachment", "item", "stop", "transport", "accommodation"],
  "/settings": ["trip", "tripMember", "invite", "shareLink", "calendarFeed", "digest", "chapter"],
};

describe("scope coverage", () => {
  it("every page that reads a table is in each scope that writes it", () => {
    const misses: string[] = [];
    for (const [scope, tables] of Object.entries(SCOPE_TABLES) as [keyof typeof SCOPE_TABLES, readonly string[]][]) {
      const pages = SCOPE_PAGES[scope];
      if (pages === "layout") continue;
      for (const [page, reads] of Object.entries(PAGE_READS) as [TripPage, readonly string[]][]) {
        if (tables.some((t) => reads.includes(t)) && !pages.includes(page)) misses.push(`${scope} → ${page || "Home"}`);
      }
    }
    expect(misses).toEqual([]);
  });
  it("PAGE_READS names every page SCOPE_PAGES knows", () => {
    for (const pages of Object.values(SCOPE_PAGES)) if (pages !== "layout") for (const p of pages) expect(PAGE_READS).toHaveProperty([p]);
  });
});
```

Before relying on `PAGE_READS`, open each page's loader (`app/(app)/trips/[tripId]/**/page.tsx` and the `lib/*-loader.ts`/`*-reads.ts` it calls) and correct any row that is wrong. A correction that adds a read to a page is fine; the coverage test then forces the scope to include it.

- [ ] **Step 2: Run** `npx vitest run lib/revalidate.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `lib/revalidate.ts`**

```ts
import { revalidatePath } from "next/cache";

/**
 * Every write's cache invalidation (spec 2026-10-14 card 2.E, decision Q6;
 * ADR 0064 amendment 2026-10-15). Actions name what they wrote — a scope —
 * and this module owns which pages that touches. Paths are the id path the
 * proxy rewrites a slug URL to (ADR 0064), never `tripPath()`.
 *
 * Layout-wide only for `trip` and `travellers` (NAV-02): they change the
 * shell (name, cover, dials, who's going). Everything else names its pages.
 */
export type TripScope = "plan" | "money" | "lists" | "journal" | "travellers" | "trip";

export type TripPage =
  | "" | "/plan" | "/budget" | "/calendar" | "/summary" | "/print" | "/compare"
  | "/day" | "/journal" | "/checklists" | "/wishlist" | "/files" | "/settings";

/** "/day" stands for every day page: revalidated through the route pattern. */
const DAY_ROUTE = "/trips/[tripId]/day/[date]";

export const SCOPE_PAGES: Record<TripScope, readonly TripPage[] | "layout"> = {
  plan: ["", "/plan", "/budget", "/calendar", "/summary", "/print", "/compare", "/day", "/wishlist", "/files", "/checklists", "/settings"],
  money: ["", "/plan", "/budget", "/calendar", "/summary", "/print", "/compare", "/day", "/wishlist"],
  lists: ["", "/checklists"],
  journal: ["", "/plan", "/day", "/journal", "/wishlist", "/files"],
  travellers: "layout",
  trip: "layout",
};

/** The tables each scope's writers write. Read by the coverage test. */
export const SCOPE_TABLES: Record<TripScope, readonly string[]> = {
  plan: ["stop", "item", "transport", "accommodation", "chapter", "dayTitle", "fork", "note", "vote", "reminder"],
  money: ["cost", "exchangeRate"],
  lists: ["checklistItem", "packingTemplate"],
  journal: ["journalEntry", "attachment"],
  travellers: ["tripMember", "invite"],
  trip: ["trip", "shareLink", "calendarFeed", "digest"],
};

export function revalidateTrip(tripId: string, ...scopes: [TripScope, ...TripScope[]]): void {
  const base = `/trips/${tripId}`;
  if (scopes.some((s) => SCOPE_PAGES[s] === "layout")) {
    revalidatePath(base, "layout");
    if (scopes.includes("trip")) revalidatePath("/trips");
    return;
  }
  const pages = new Set<TripPage>();
  for (const s of scopes) for (const p of SCOPE_PAGES[s] as readonly TripPage[]) pages.add(p);
  for (const p of pages) {
    if (p === "/day") revalidatePath(DAY_ROUTE, "page");
    else revalidatePath(`${base}${p}`);
  }
}

/** The /trips list (trip cards, reminders on them, release-note banner). */
export function revalidateTripsList(): void {
  revalidatePath("/trips");
}

/** Profile name/photo appear in every layout. */
export function revalidateAccount(): void {
  revalidatePath("/", "layout");
}

export function revalidateAccountPage(): void {
  revalidatePath("/account");
}

export function revalidateGlobe(): void {
  revalidatePath("/globe");
}

export function revalidateAdmin(): void {
  revalidatePath("/admin");
}
```

Read the Next docs file named in the header first and confirm `revalidatePath(pattern, "page")` is the call for a dynamic route; adjust only if the docs disagree.

- [ ] **Step 4:** `lib/trip-links.guard.test.ts`: add `"lib/revalidate.ts"` to `ALLOWED_FILES` with a comment "revalidation takes the id path (ADR 0064)".

- [ ] **Step 5: Run** both test files → PASS. Task-end checks. Commit `feat(revalidate): one scoped revalidation module with a page/table coverage test (card 2.E)`.

---

## Task 5: Plan-scope actions go through `revalidateTrip` (card 2.E, part 2)

**Files:**
- Modify: `server/actions/{stops,items,transport,accommodation,chapters,day-titles,forks,surprise,item-photo,notes,votes,reminders,driving-settings}.ts` and their `*.test.ts`
- Modify: integration tests that mock `next/cache` only if they assert paths (`test/integration/*.test.ts`)

**Interfaces:**
- Consumes: `revalidateTrip`, `revalidateTripsList` from `@/lib/revalidate`.
- Produces: helpers deleted — `revalidateItemPaths` (items.ts:71), `revalidateWishlistPath` (votes.ts:37), `revalidateNotePaths` (notes.ts:55), `revalidateReminderPaths` (reminders.ts:74), `revalidateDayTitlePaths` (day-titles.ts:39), `revalidateChapterPaths` (chapters.ts:29).

Mapping (every call in the file becomes one call, after the write, where the old calls were):

| File | Call |
|---|---|
| stops, transport, accommodation, chapters, day-titles, surprise, notes, votes | `revalidateTrip(tripId, "plan")` |
| items (incl. inline Cost writes) | `revalidateTrip(tripId, "plan", "money")` where the action writes a Cost; else `"plan"` |
| transport, accommodation create/update with inline Cost | `revalidateTrip(tripId, "plan", "money")` |
| item-photo | `revalidateTrip(tripId, "plan", "journal")` |
| forks (create/rename/delete/promote) | `revalidateTrip(tripId, "plan", "money")` |
| reminders | `revalidateTrip(tripId, "plan", "lists")` then `revalidateTripsList()` |
| driving-settings | `revalidateTrip(tripId, "plan")` (it changes plan-derived drive estimates; Settings is in `plan`) |

- [ ] **Step 1: Rewrite the tests first.** In each listed `*.test.ts`, replace the `next/cache` mock with:

```ts
const revalidateTripMock = vi.hoisted(() => vi.fn());
const revalidateTripsListMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/revalidate", () => ({ revalidateTrip: revalidateTripMock, revalidateTripsList: revalidateTripsListMock }));
```

and each `expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1…")` with the scope assertion from the table, e.g. `expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan")`. Where a test asserted "not revalidated on failure", assert `revalidateTripMock` not called.

- [ ] **Step 2: Run** those test files → FAIL.

- [ ] **Step 3: Implement** per the table. Remove the `next/cache` import where it becomes unused. Delete the six helpers. A write that previously revalidated layout-wide (items, item-photo, surprise, transport, accommodation) now names `plan`(+`money`) — that is NAV-02.

- [ ] **Step 4: Run** → PASS. `grep -n "revalidatePath" server/actions/{stops,items,transport,accommodation,chapters,day-titles,forks,surprise,item-photo,notes,votes,reminders,driving-settings}.ts` → nothing. Task-end checks. Commit `refactor(revalidate): plan writes name their scope; six local helpers gone (card 2.E, NAV-02)`.

---

## Task 6: Every other action, the guard test, and ADR 0064 (card 2.E, part 3)

**Files:**
- Modify: `server/actions/{costs,rates,checklists,journal,attachments,invites,traveller-details,trips,cover,share,calendar-feed,digest,profile,connected-apps,welcome,release-notes,globe,access-requests,error-reports}.ts` and their tests; `app/(app)/admin/page.test.tsx:43` if it asserts paths
- Create: `lib/revalidate.guard.test.ts`
- Modify: `docs/adr/0064-trip-urls-use-a-name-slug.md` (dated amendment), `docs/open-follow-ups.md` (NAV-02 closed)

Mapping:

| File / action | Call |
|---|---|
| costs, rates | `revalidateTrip(tripId, "money")` (delete `revalidateTripPaths`) |
| checklists | `revalidateTrip(tripId, "lists")` (delete `revalidateChecklistPaths`) |
| journal | `revalidateTrip(tripId, "journal")` (delete `revalidateJournalPaths`) |
| attachments, trip-scoped | `revalidateTrip(tripId, "journal")`; globe-scoped: `revalidateGlobe()` |
| invites, `saveTravelNumber`, `removeTripMember`, `leaveTrip` | `revalidateTrip(tripId, "travellers")`; `leaveTrip` also `revalidateTripsList()` |
| trips: `updateTrip`, `setTripHardEndDate`, `setChaptersEnabled`, `setForksEnabled`; cover; share; calendar-feed; digest | `revalidateTrip(tripId, "trip")` |
| trips: create, delete, restore, duplicate | `revalidateTripsList()` (create and delete gain it — they had none) |
| profile | `revalidateAccount()` |
| `saveTravellerDetails`, connected-apps | `revalidateAccountPage()` |
| welcome | `revalidateTripsList()` |
| release-notes | `revalidateTripsList()` and `revalidatePath`'s Home pattern moves into a new `revalidateAllTripHomes()` in `lib/revalidate.ts` (`revalidatePath("/trips/[tripId]", "page")`) with a one-line test in `lib/revalidate.test.ts` |
| globe | `revalidateGlobe()` |
| access-requests, error-reports | `revalidateAdmin()` |

- [ ] **Step 1: Rewrite the tests first** exactly as Task 5 Step 1 (mock `@/lib/revalidate` with the functions each file uses).

- [ ] **Step 2: Write the guard test** `lib/revalidate.guard.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { walkSources } from "@/test/helpers/walk-sources";

describe("revalidation goes through lib/revalidate.ts (card 2.E)", () => {
  it("no other source file calls revalidatePath or revalidateTag", () => {
    const offenders = ["server", "app", "lib", "components"]
      .flatMap((d) => walkSources(d, { skipTests: true }))
      .filter((f) => f !== "lib/revalidate.ts")
      .filter((f) => /\brevalidate(Path|Tag)\s*\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
```

(Check `walkSources`' real signature and path format in `test/helpers/walk-sources.ts` and adapt.)

- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** per the table; delete the remaining three helpers. **Step 5: Run** → PASS.

- [ ] **Step 6: Docs.** Append to ADR 0064:

```markdown
## Amendment 2026-10-15 — revalidation goes through one builder

Actions never call `revalidatePath` themselves. They call
`revalidateTrip(tripId, ...scopes)` (or `revalidateTripsList`,
`revalidateAccount`, …) from `lib/revalidate.ts`, naming what they wrote:
`plan`, `money`, `lists`, `journal`, `travellers`, `trip`. The module owns
which id paths each scope touches (still the rewrite's destination, never
the slug path), and only `trip` and `travellers` are layout-wide (NAV-02).
A test derives "every page that reads a table is in the scope that writes
it" from a declared page→table map, and a guard test keeps `revalidatePath`
inside the module. Spec 2026-10-14 card 2.E.
```

In `docs/open-follow-ups.md`, mark NAV-02 closed with "2026-10-15, card 2.E".

- [ ] **Step 7:** Task-end checks. Commit `refactor(revalidate): every action names its scope; guard test; ADR 0064 amended (card 2.E)`.

---

## Task 7: `auditedUpdate` / `recordUpdate`, and the casts go (card 2.K, part 1)

**Files:**
- Modify: `lib/activity.ts` (`describeChanges`, `entityLabel` parameter types), `lib/activity.test.ts`
- Modify: `lib/activity-guard.ts`, `lib/activity-guard.test.ts`
- Modify: `server/actions/{items,costs,accommodation,transport,chapters,notes}.ts` and tests

**Interfaces:**
- Produces (in `lib/activity-guard.ts`):

```ts
/** The two Prisma delegate methods an audited update needs. */
export interface AuditedDelegate<Row, Data> {
  findUnique(args: { where: { id: string } }): PromiseLike<Row | null>;
  update(args: { where: { id: string }; data: Data }): PromiseLike<Row>;
}

/** Read-before → update → record UPDATED (Fork edits stay silent). Returns both rows. */
export async function auditedUpdate<Row extends { tripId: string }, Data>(
  entityType: ActivityEntityType,
  delegate: AuditedDelegate<Row, Data>,
  id: string,
  data: Data,
  plan: PlanId,
): Promise<{ before: Row | null; after: Row }>;

/** For writes inside a transaction or with a built `after`: record once committed. */
export async function recordUpdate(
  entityType: ActivityEntityType,
  args: { tripId: string; plan: PlanId; entityId: string; before: object | null; after: object },
): Promise<void>;
```

- `lib/activity.ts`: `describeChanges(entityType, before: object, after: object)` and `entityLabel(entityType, row: object)` — internally `const b = before as Record<string, unknown>` once.

- [ ] **Step 1: Failing tests** in `lib/activity-guard.test.ts` (mock `@/server/actions/activity`'s `recordActivity` the way the file already does):

```ts
it("auditedUpdate reads, updates and records the diff on the real plan", async () => {
  const delegate = {
    findUnique: vi.fn().mockResolvedValue({ id: "s1", tripId: "t1", name: "Rome", notes: null }),
    update: vi.fn().mockResolvedValue({ id: "s1", tripId: "t1", name: "Rome", notes: "Pasta" }),
  };
  const { before, after } = await auditedUpdate("STOP", delegate, "s1", { notes: "Pasta" }, null);
  expect(delegate.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { notes: "Pasta" } });
  expect(before?.notes).toBeNull();
  expect(after.notes).toBe("Pasta");
  expect(recordActivityMock).toHaveBeenCalledWith(expect.objectContaining({
    tripId: "t1", verb: "UPDATED", entityType: "STOP", entityId: "s1", entityLabel: "Rome",
    changes: [expect.objectContaining({ field: "notes" })],
  }));
});
it("auditedUpdate on a Fork writes but records nothing", async () => {
  const delegate = { findUnique: vi.fn().mockResolvedValue({ id: "s1", tripId: "t1", name: "Rome" }), update: vi.fn().mockResolvedValue({ id: "s1", tripId: "t1", name: "Roma" }) };
  await auditedUpdate("STOP", delegate, "s1", { name: "Roma" }, "fork-1");
  expect(delegate.update).toHaveBeenCalled();
  expect(recordActivityMock).not.toHaveBeenCalled();
});
it("a failed update records nothing", async () => {
  const delegate = { findUnique: vi.fn().mockResolvedValue({ id: "s1", tripId: "t1", name: "Rome" }), update: vi.fn().mockRejectedValue(new Error("P2025")) };
  await expect(auditedUpdate("STOP", delegate, "s1", {}, null)).rejects.toThrow("P2025");
  expect(recordActivityMock).not.toHaveBeenCalled();
});
it("recordUpdate records the diff of a built after", async () => {
  await recordUpdate("CHAPTER", { tripId: "t1", plan: null, entityId: "c1", before: { name: "North" }, after: { name: "North", arriveDate: "2026-11-02" } });
  expect(recordActivityMock).toHaveBeenCalledWith(expect.objectContaining({ entityType: "CHAPTER", entityLabel: "North" }));
});
```

Plus a type test in the same file that `db.stop` is assignable: `const _d: AuditedDelegate<Stop, Prisma.StopUpdateInput> = db.stop;` inside a `it("db delegates fit AuditedDelegate", () => { expectTypeOf(...) })` — or simply rely on Step 4's `tsc` over the real call sites. If `tsc` refuses `db.<model>` as `AuditedDelegate` (Prisma's generic method signatures), keep the same exported signature but widen `AuditedDelegate`'s parameter types to what `tsc` accepts for all six models, documenting why in one comment. Do not add `any`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** both functions in `lib/activity-guard.ts` on top of `recordPlanActivity(plan, {...})` and `describeChanges`/`entityLabel`; change the two `lib/activity.ts` parameter types.

- [ ] **Step 4: Migrate the plain sites** (spec card K table rows 1, 3, 5, 6, 7, 8, 9): `updateItem`, `rescheduleItem`, `markCostPaid`, `markCostUnpaid`, `updateAccommodation`, `updateTransport`, `updateChapter`. Each read-before + `db.X.update` + `recordPlanActivity(...describeChanges...)` becomes `const { after } = await auditedUpdate("ITEM", db.item, id, data, row.forkId ?? null);`. `scheduleItem`'s reschedule branch (row 2) and `updateCost` (row 4, in a transaction) use `recordUpdate` with the rows they already have. Remove every `as unknown as Record<string, unknown>` in these six files (the CREATED/DELETED `entityLabel` casts too — the parameter is now `object`). The action tests keep their Activity assertions; update mocks only where the read now goes through `findUnique` on the same delegate.

- [ ] **Step 5: Run** `npx vitest run lib/activity-guard.test.ts lib/activity.test.ts server/actions/{items,costs,accommodation,transport,chapters,notes}.test.ts` → PASS. `grep -c "as unknown as Record" server/actions/{items,costs,accommodation,transport,chapters,notes}.ts` → 0 each. Task-end checks. Commit `refactor(activity): auditedUpdate/recordUpdate own read-before and the diff; casts gone (card 2.K)`.

---

## Task 8: Stops, checklists and reminders through the audited helpers (card 2.K, part 2)

**Files:**
- Modify: `server/actions/stops.ts` (rows 10–17: `updateStop` both branches, `applyStopDates`, `firmUpSegment` Chapter, `toggleStopPin`, `makeStopRough`, `setStopNotes`, `setStopNights`), `server/actions/checklists.ts:248-269`, `server/actions/reminders.ts:223-230`, and tests

- [ ] **Step 1:** In `stops.test.ts`, add one test per transactional site proving Activity is recorded only after commit:

```ts
it("updateStop's rough branch records nothing when the lone-stop rule rolls the write back", async () => {
  // arrange the file's existing LoneStopRoughRefused fixture
  const r = await updateStop("s1", roughInput);
  expect(r.success).toBe(false);
  expect(recordActivityMock).not.toHaveBeenCalled();
});
```

(and the twin for `makeStopRough`). Run → these should PASS today (they pin behaviour the migration must keep).

- [ ] **Step 2: Migrate.** Plain sites (`toggleStopPin`, `setStopNotes`, `setStopNights`) → `auditedUpdate("STOP", db.stop, …)`. Transactional/synthetic sites (`updateStop` ×2, `applyStopDates`, `firmUpSegment`, `makeStopRough`) → keep their transaction, then `recordUpdate(...)` after it commits with the `before`/`after` they already have. Checklists and reminders → `recordUpdate("CHECKLIST_ITEM" | "REMINDER", …)` with `activityRow(...)` as `before`/`after` (keep `activityRow`; it shapes the select). Remove the remaining `as unknown as Record` and `(before ?? {}) as Record<string, unknown>` casts in `stops.ts`.

- [ ] **Step 3: Run** the three test files → PASS. `grep -rn "as unknown as Record" server/actions` → nothing. Task-end checks. Commit `refactor(activity): Stop, checklist and reminder updates record through recordUpdate after commit (card 2.K)`.

---

## Task 9: `recordActivity` reports before it swallows (ARCH-OBS-3)

**Files:**
- Modify: `server/actions/activity.ts:11-71`, `server/actions/activity.test.ts`
- Create: `lib/next-control-flow.ts`, `lib/next-control-flow.test.ts`

**Interfaces:**
- Produces: `isNextControlFlow(err: unknown): boolean` — true for Next's `notFound()`/`forbidden()`/`unauthorized()`/`redirect()` throws (`digest` starting `NEXT_HTTP_ERROR_FALLBACK;` or `NEXT_REDIRECT`). Check `node_modules/next/dist/docs` for `unstable_rethrow` / the digest format first and use the documented check if one exists; `lib/mcp/run-tool.ts:53` is the repo precedent — make it use `isNextControlFlow` too.

- [ ] **Step 1: Failing tests** in `server/actions/activity.test.ts` (add `vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }))`):

```ts
it("reports a failed Activity write before swallowing it (ARCH-OBS-3)", async () => {
  activityCreateMock.mockRejectedValue(new Error("db down"));
  await expect(recordActivity(input)).resolves.toBeUndefined();
  expect(reportErrorMock).toHaveBeenCalledWith(expect.any(Error), { route: "server/actions/activity.ts#recordActivity", source: "server" });
});
it("stays silent for a forged call refused by the guard (ARCH-TEN-2)", async () => {
  requireTripAccessMock.mockRejectedValue(Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
  await expect(recordActivity(input)).resolves.toBeUndefined();
  expect(reportErrorMock).not.toHaveBeenCalled();
});
```

And `lib/next-control-flow.test.ts` for both digests and a plain Error.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement:** in the `catch`, `if (!isNextControlFlow(err)) await reportError(err, { route: "server/actions/activity.ts#recordActivity", source: "server" });` and replace the "ARCH-OBS-3 deferred" comment with one saying guard refusals stay silent (ARCH-TEN-2) and everything else is reported (ADR 0059). Same for `resolveSurpriseOf`'s swallow (route `#resolveSurpriseOf`). **Step 4:** PASS; task-end checks; commit `fix(activity): report a failed Activity write before swallowing it (ARCH-OBS-3)`.

---

## Task 10: One cost form state (card 2.I, part 1 — pure)

**Files:**
- Create: `components/money/cost-fields/cost-form-state.ts`, `cost-form-state.test.ts`

**Interfaces:**
- Produces:

```ts
export interface CostFormState {
  costAmount: string; currency: string; paid: boolean;
  paidAmount: string; paidAt: string; settlement: CostSettlement;
}
export type CostPayloadFields = {
  costMinor: number; currency: string; paidMinor?: number; paidAt?: string; settlement: CostSettlement;
};
export type CostPayload =
  | { kind: "none" }                                   // cost amount blank
  | { kind: "invalid"; errors: FieldErrors }           // { costMinor: ["Enter the cost"] } or { paidMinor: ["Enter what you paid"] }
  | { kind: "ok"; fields: CostPayloadFields };

export function emptyCostFormState(currency: string): CostFormState;
export function costToFormState(row: CostRow): CostFormState;
export function proposalToFormState(p: ProposalCostFields, defaultCurrency: string): CostFormState;
export function seedCostFormState(single: CostRow | null, proposed: ProposalCostFields | undefined, defaultCurrency: string): CostFormState;
export function setCostAmount(s: CostFormState, value: string): CostFormState;      // blank clears paid/paidAmount/paidAt
export function setPaid(s: CostFormState, next: boolean, today: string): CostFormState; // ticking pre-fills amount (if blank) and date (if blank)
export function toCostPayload(s: CostFormState): CostPayload;
export function paidFieldsFromRow(row: { costMinor: number; paidMinor: number | null; paidAt: Date | string | null }): { paidMinor?: number; paidAt?: string };
```

`CostSettlement`, `CostRow`, `ProposalCostFields`, `FieldErrors`: import from where they live today (`lib/enum-values` or `lib/validations/cost`, `server/actions/costs` type export or `lib/money`, `lib/booking-import/types`, `lib/action-result`) — `grep` for each.

Rules (ADR 0037, CONTEXT.md **Paid**): `paidAt` is the only "is paid" signal; payload fields are `undefined`, **never `null`** (the editors' `costSchema` rejects `null`); `settlement` always sent; paid with a parseable amount and blank date → `paidAt` undefined; paid with a blank/unparseable paid amount → `invalid` `{ paidMinor: ["Enter what you paid"] }`; `paidFieldsFromRow` returns `{}` when `paidAt` is null, else `{ paidMinor: row.paidMinor ?? row.costMinor, paidAt: <YYYY-MM-DD> }`.

- [ ] **Step 1: Failing tests** — port the three `components/trip/cost-seed.test.ts` cases to `seedCostFormState`, then:

```ts
const base = emptyCostFormState("AUD");
it("blank cost is none", () => expect(toCostPayload(base)).toEqual({ kind: "none" }));
it("an unparseable cost is invalid, not dropped", () =>
  expect(toCostPayload({ ...base, costAmount: "abc" })).toEqual({ kind: "invalid", errors: { costMinor: ["Enter the cost"] } }));
it("unpaid sends undefined paid fields, never null", () => {
  const p = toCostPayload({ ...base, costAmount: "120" });
  expect(p).toEqual({ kind: "ok", fields: { costMinor: 12000, currency: "AUD", paidMinor: undefined, paidAt: undefined, settlement: "BEFORE" } });
});
it("Paid with no amount is refused (Review Focus 5)", () =>
  expect(toCostPayload({ ...base, costAmount: "120", paid: true, paidAmount: "" })).toEqual({ kind: "invalid", errors: { paidMinor: ["Enter what you paid"] } }));
it("ticking Paid pre-fills the cost and today", () =>
  expect(setPaid({ ...base, costAmount: "120" }, true, "2026-10-15")).toMatchObject({ paid: true, paidAmount: "120", paidAt: "2026-10-15" }));
it("blanking the cost clears the paid state", () =>
  expect(setCostAmount({ ...base, costAmount: "120", paid: true, paidAmount: "120", paidAt: "2026-10-15" }, "")).toMatchObject({ paid: false, paidAmount: "", paidAt: "" }));
it("a legacy row with a paid amount but no date opens unpaid and keeps the amount", () =>
  expect(costToFormState(costRow({ paidMinor: 1250, paidAt: null }))).toMatchObject({ paid: false, paidAmount: "12.50" }));
it("paidFieldsFromRow: paidAt decides; a paid row with no amount falls back to the cost", () => {
  expect(paidFieldsFromRow({ costMinor: 500, paidMinor: null, paidAt: null })).toEqual({});
  expect(paidFieldsFromRow({ costMinor: 500, paidMinor: null, paidAt: new Date("2026-10-01T00:00:00Z") })).toEqual({ paidMinor: 500, paidAt: "2026-10-01" });
});
```

(`costRow()` — use `cost()` from `@/test/builders` if its shape matches `CostRow`, else a local builder.) Check the editors' current "Enter what you paid" behaviour in `cost-editor.test.tsx` before fixing that copy; if the schema owns that message today, `toCostPayload` returns `ok` with `paidMinor: undefined, paidAt` set, and the schema refuses — then drop the "Paid with no amount" client test and assert it at the form level in Task 11 instead. Use whichever the current editors do.

- [ ] **Step 2–4:** Run → FAIL; implement (move the logic from `cost-seed.ts`, `cost-editor.tsx:81-99, 228-256`, `inline-cost-fields.tsx:73-77`); run → PASS. Task-end checks. Commit `feat(money): one cost form state and payload (card 2.I)`.

---

## Task 11: `useCostFields`, the inline fields, and the three entity forms (card 2.I, part 2)

**Files:**
- Create: `components/money/cost-fields/use-cost-fields.ts` (+ test)
- Move: `components/trip/inline-cost-fields.tsx` (+ test) → `components/money/cost-fields/inline-cost-fields.tsx` (`git mv`; update imports)
- Delete: `components/trip/cost-seed.ts`, `cost-seed.test.ts`
- Modify: `components/trip/{transport,item,accommodation}-form-dialog.tsx` and their tests

**Interfaces:**
- Consumes: Task 10's module.
- Produces:

```ts
export function useCostFields(seed: CostFormState): {
  state: CostFormState;
  fieldProps: Pick<InlineCostFieldsProps,
    "costAmount" | "onCostChange" | "currency" | "onCurrencyChange" | "paid" | "onPaidChange"
    | "paidAmount" | "onPaidAmountChange" | "paidAt" | "onPaidAtChange" | "settlement" | "onSettlementChange">;
  payload(): CostPayload;
  dirtyValues: readonly unknown[]; // for useFormDirty
};
```

`InlineCostFields`' own `handlePaidToggle` is deleted; `onPaidChange` from `fieldProps` already applies `setPaid` (pass `todayLocalISO()`).

- [ ] **Step 1: Tests first.** In each form test, the payload assertions change from `paidAt: null` to `paidAt: undefined` (the server writes `null` for both — `server/actions/{transport,items,accommodation}.ts` single-cost update `paidAt` branch; confirm by reading). Add to each form test:

```ts
it("refuses an unparseable cost instead of saving without it", async () => {
  // open the form with the file's helper, type "abc" in the cost field, submit
  expect(screen.getByText("Enter the cost")).toBeInTheDocument();
  expect(createTransportMock).not.toHaveBeenCalled();
});
it("refuses Paid with no paid amount (Review Focus 5)", async () => {
  // type 120, tick Paid, clear the You paid field, submit
  expect(screen.getByText("Enter what you paid")).toBeInTheDocument();
});
```

`use-cost-fields.test.ts` with `renderHook`: seeding, ticking Paid pre-fills, `payload()` mirrors `toCostPayload(state)`.

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement.** In each form: replace the `seedCost` + six `useState`s with `const cost = useCostFields(seedCostFormState(singleCost, proposed, defaultCurrency))` (inside a lazy `useState` initialiser for the seed so it runs once); `useFormDirty` takes `...cost.dirtyValues`; `buildInput()` does:

```ts
const c = cost.payload();
if (c.kind === "invalid") return { errors: c.errors };   // shape: whatever buildInput's existing error path returns — read it
...(c.kind === "ok" && c.fields),
```

Delete the repeated ADR 0037 comment blocks (one stays in `cost-form-state.ts`). `<InlineCostFields {...cost.fieldProps} hasMultipleCosts={…} errors={errors} disabled={isPending} paired />`. Remove the `any` on Transport/Accommodation `input` if the types now line up.

- [ ] **Step 4:** Run the four test files + `components/booking-import` tests → PASS. Task-end checks. Commit `refactor(money): entity forms share useCostFields; an unparseable cost is refused, not dropped (card 2.I)`.

---

## Task 12: The two cost editors and MCP use the shared state (card 2.I, part 3)

**Files:**
- Modify: `components/trip/cost-editor.tsx`, `components/trip/other-cost-editor.tsx` and tests
- Modify: `lib/mcp/tools/bookings-write.ts:120-169, 646-671` and test

- [ ] **Step 1: Tests.** Existing editor tests stay as they are (they already assert `undefined`, never `null`); add to `bookings-write.test.ts`:

```ts
it("completeInlineCost keeps a paid Cost paid even if its paid amount is missing (paidAt decides)", async () => {
  costFindManyMock.mockResolvedValue([{ id: "c1", costMinor: 500, currency: "AUD", paidMinor: null, paidAt: new Date("2026-10-01T00:00:00Z") }]);
  const r = await completeInlineCost(/* the file's existing call shape */);
  expect(r).toMatchObject({ paidMinor: 500, paidAt: "2026-10-01" });
});
```

- [ ] **Step 2:** Run → the MCP test FAILS (today it drops paid state).

- [ ] **Step 3: Implement.**
  - `cost-editor.tsx`: `FormState = CostFormState & { dueDate: string }`; local `costToFormState` → `{ ...costToFormState(row), dueDate: row.dueDate ?? "" }`; `parseOwnedFormToInput` builds on `toCostPayload(form)` (`invalid` → its existing error return; `none` → `{ costMinor: ["Enter the cost"] }`; `ok` → `{ ...fields, dueDate…, ownerType, ownerId }`); the blank-cost handler uses `setCostAmount`.
  - `other-cost-editor.tsx`: `FormState = CostFormState & { label; category; dueDate; paidFollowsCost }`; same three replacements; its hand-built Paid pre-fill uses `setPaid`; keep its own field UI and `paidFollowsCost`. Its `CURRENCY_CODES` copy: import the shared list if one exists (`grep -rn "CURRENCY_CODES" lib components`).
  - MCP: rename the local type `InlineCostFields` → `InlineCostPatch` (name clash); `completeInlineCost` and `mergeCostPatch` use `paidFieldsFromRow(single)`.

- [ ] **Step 4:** Run editor, to-pay-panel, cost-dialogs and bookings-write tests → PASS. `grep -rn "paidAt ? \|Boolean(.*paidAt)" components/trip components/money lib/mcp/tools` shows no form-state copies left (read-only "is paid" displays elsewhere are out of scope). Task-end checks. Commit `refactor(money): cost editors and MCP inline costs on the shared cost state (card 2.I)`.

---

## Task 13: Proposal warnings recompute after an edit (BI-04)

**Files:**
- Create: `lib/booking-import/stay-warnings.ts`, `stay-warnings.test.ts`
- Modify: `lib/booking-import/build.ts:394-395, 468-469`, `components/booking-import/proposal-editor.tsx:50-99` and its test

**Interfaces:**
- Produces:

```ts
/** The "outside your stay" warnings a Transport or Item Proposal earns from its current input. */
export function stayWarnings(proposal: Proposal, stops: ReadonlyMap<string, PreviewStop>): string[];
/** `next` with its stay warnings recomputed: the ones `prev` earned are dropped, `next`'s added; every other warning kept. */
export function refreshStayWarnings(prev: Proposal, next: Proposal, stops: ReadonlyMap<string, PreviewStop>): Proposal;
```

Transport: departure date = `input.depAt?.slice(0, 10)` against `fromStopId`'s Stop → `M.departsOutsideStay`; arrival `arrAt` against `toStopId` → `M.arrivesOutsideStay` (confirm the field names and the wall-time format in `ProposedTransportInput`). Item: `input.date` against `input.stopId` → `M.itemOutsideStay(name, formatDayLabel(date))`. A Stop is "outside" per `outsideStay` (`lib/booking-import/match.ts:124`); `PreviewStop` has the `arriveDate`/`departDate` it needs — adapt with a one-line mapping if `outsideStay` wants `MatchStop`.

- [ ] **Step 1: Failing tests:** `stay-warnings.test.ts` — a Transport moved from outside to inside Lisbon's stay loses its warning; an Item moved outside gains `itemOutsideStay`; a duplicate warning survives a refresh. `proposal-editor.test.tsx` — editing a Transport draft's date via the dialog's `onDraftChange` calls `onDraft` with the recomputed `warnings` (commit message names BI-04).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; `build.ts` uses `stayWarnings` for those two pushes (keep `build.test.ts` green); `proposal-editor.tsx`'s `edit` wraps the next proposal in `refreshStayWarnings(proposal, next, stops)` for transport and item. **Step 4:** PASS; task-end checks; commit `fix(booking-import): Transport and Item warnings recompute after an edit (BI-04)`.

---

## Task 14: `useUndoableAction` (card 2.H, part 1)

**Files:**
- Create: `components/ui/use-undoable-action.ts`, `use-undoable-action.test.tsx`
- Modify: `components/ui/undo-toast.tsx` (doc comment: the hook's primitive)

**Interfaces:**
- Produces:

```ts
export interface UndoableSpec<I, R> {
  /** Optimistic local change; runs before persist. */
  apply?(intent: I): void;
  /** The server call. A rejection or `success: false` is a failure. */
  persist(intent: I): Promise<ActionResult<R>>;
  /** Put local state back after a failed persist or a failed undo. */
  revert?(intent: I): void;
  /** The inverse server call, offered as the toast's Undo. Omit for no Undo. */
  undo?(intent: I, result: R): Promise<ActionResult<unknown>>;
  /** Re-apply local state for an Undo (before its server call). */
  applyUndo?(intent: I, result: R): void;
  /** Success toast; with `undo` it carries the Undo button. */
  done?(intent: I, result: R): { title: React.ReactNode; description?: React.ReactNode } | null;
  /** Fallback failure copy (refusals use their own `_` message via toastRefused). */
  failure?: string;
}
export const UNDO_FAILED = "Couldn't undo. Nothing changed. Try again.";
export function useUndoableAction<I, R>(spec: UndoableSpec<I, R>): {
  run(intent: I): Promise<boolean>;   // true on success
  pending: boolean;
};
```

Behaviour: `run` → `apply` → `await persist`; on `success:false` → `revert`, `toastRefused(result, spec.failure ?? SOMETHING_WENT_WRONG)`, return false; on throw → `revert`, `toastRejected(spec.failure)`, return false; on success → `done` toast (via `toastWithUndo` when `undo` is set, else plain `toast`), return true. Undo click → `applyUndo` → `undo`; on `success:false` or a throw → toast `UNDO_FAILED` (offline-aware: `toastRefused(r, UNDO_FAILED)` / `toastRejected(UNDO_FAILED)`) and call `spec.revertUndo?.(intent, result)` to put local state back to what the server still holds (add `revertUndo?(intent: I, result: R): void` to `UndoableSpec`; the plan editor in Task 17 supplies it). The Undo path never rejects unhandled. `pending` is true between `run` start and settle. Keep `spec` in a ref so a re-render doesn't change an in-flight run.

- [ ] **Step 1: Failing tests** (`renderHook` + mocked `@/components/ui/use-toast` and `undo-toast`): success with no undo → plain toast, `true`; `success:false` with `{ _: ["Nope"] }` → revert called, toast "Nope", `false`; rejection → revert, `SOMETHING_WENT_WRONG` toast; success with undo → `toastWithUndo` called, invoking its `onUndo` calls `applyUndo` then `undo`; Undo that rejects → `UNDO_FAILED` toast, never unhandled (assert with a `process.on("unhandledRejection")` spy or Vitest's `onUnhandledRejection` failing the run); `pending` flips.
- [ ] **Step 2–4:** FAIL → implement → PASS. Task-end checks. Commit `feat(ui): useUndoableAction owns apply, persist, revert, Undo and their toasts (card 2.H)`.

---

## Task 15: Adopt `useUndoableAction` outside the reorder flows (card 2.H, part 2)

**Files:**
- Modify: `components/trip/unschedule-item-button.tsx` (+ test), `components/trip/itinerary-manager.tsx` (handlers listed below; delete local `toastRejected` at ~539-544) and `itinerary-manager.test.tsx`
- Create: `components/ui/undo-toast.guard.test.ts`

Handlers moved onto the hook (one `useUndoableAction` per handler, each with `failure` copy equal to today's): `handleMoveStop`, `handleTogglePin`, `handleConfirmSurprise`, `handleRevealSurprise`, `handleMakeRough`, `handleDeleteChapter`, `handleDeleteAccommodation`, `handleDeleteTransport` (its snapshot becomes `apply`/`revert`), `handleScheduleThing`, `handleMoveItem` (Undo #1: `undo` = `scheduleItem(itemId, scheduleInputFor(from.date, from))`), `handleSuggestChapters` (keep its transition and ref guard; only the failure path moves). `pendingId` stays as the manager's "which row is busy" key — set it around `run`. **Not here:** `handleFirmUp`, `handleFirmUpTrip`, `handleAssign`, `handleSetNights`, `handleSaveAdjustDates`, drag handlers, `applyReorderResult` (Task 17).

Fixes this brings (pinned by tests): `handleMoveStop`, `handleTogglePin`, `handleMakeRough` now notice `success:false` (they ignored it); `unschedule-item-button` catches a rejected `unscheduleItem`; Undo failure copy is one string.

- [ ] **Step 1: Tests.** In `itinerary-manager.test.tsx`, add (via the rendered UI — click the stop's menu items as the existing "no silent failures" tests do):

```ts
it("a refused pin toggle says so (it was silent)", async () => {
  toggleStopPinMock.mockResolvedValue({ success: false, errors: { _: ["Can't pin a rough stop."] } });
  // open the stop menu and click Pin, as the file's existing pin test does
  expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "Can't pin a rough stop." }));
});
```

and twins for move and make-rough. Update the existing item-move Undo-failure test to expect `UNDO_FAILED`. `unschedule-item-button.test.tsx`: a rejecting `unscheduleItem` toasts and re-enables the button; both Undo failures toast `UNDO_FAILED`. Guard test:

```ts
it("toastWithUndo is only called by useUndoableAction", () => {
  const users = ["components", "app"].flatMap((d) => walkSources(d, { skipTests: true }))
    .filter((f) => /\btoastWithUndo\b/.test(readFileSync(f, "utf8")));
  expect(users.sort()).toEqual(["components/ui/undo-toast.tsx", "components/ui/use-undoable-action.ts"]);
});
```

(It fails until Task 17 removes `applyReorderResult`'s call — mark it `it.todo` here and switch it to `it` in Task 17 Step 6.)

- [ ] **Step 2–4:** FAIL → implement → PASS (`itinerary-manager.test.tsx`, `unschedule-item-button.test.tsx`, `use-undoable-action.test.tsx`). Task-end checks. Commit `refactor(plan): manager and unschedule handlers go through useUndoableAction; silent refusals now toast (card 2.H)`.

---

## Task 16: The plan-editor reducer (card 2.G, part 1 — pure)

**Files:**
- Create: `components/plan/plan-editor-state.ts`, `plan-editor-state.test.ts`

**Interfaces:**
- Consumes: `ItineraryStop`, `ItineraryChapter`, `ItineraryTransport` (import types from `components/trip/itinerary-manager.tsx`; if that creates a cycle, move the three interfaces to `components/plan/plan-editor-types.ts` and re-export them from the manager), `orderPlanStops` (`lib/plan-order.ts`), `moveStopInOrder`, `moveChapterBlocks` (`lib/reorder.ts`).
- Produces:

```ts
export interface PlanRows { stops: ItineraryStop[]; chapters: ItineraryChapter[]; transports: ItineraryTransport[] }
export interface PlanEditorState {
  rows: PlanRows;          // what renders
  server: PlanRows;        // last server rows adopted
  pending: number;         // writes in flight
  held: PlanRows | null;   // server rows that arrived while pending (rule 2)
  newStopIds: string[];    // ids added by the last adoption (the flash)
}
/** The fields a placement write changes; what Undo writes back. */
export interface StopPlacement { id: string; sortOrder: number; chapterId: string | null; arriveDate: string | null; departDate: string | null }

export type PlanEditorEvent =
  | { type: "props"; rows: PlanRows }                                   // rules 1–3
  | { type: "begin"; rows: PlanRows }                                   // optimistic rows; pending + 1
  | { type: "settle"; rows?: PlanRows }                                 // pending − 1; rows = server-confirmed local rows (e.g. `changed` applied)
  | { type: "revert"; placements: StopPlacement[] }                     // rule 5: the one revert path
  | { type: "flashed" };                                                // clear newStopIds

export function initPlanEditor(rows: PlanRows): PlanEditorState;
export function planEditorReducer(state: PlanEditorState, event: PlanEditorEvent): PlanEditorState;
export function sameRows(a: PlanRows, b: PlanRows): boolean;            // rule 3: by content
export function touchedPlacements(before: ItineraryStop[], after: ItineraryStop[]): StopPlacement[]; // rule 4

// Commands: pure, return the optimistic rows and the request to send.
export function reorderCommand(state: PlanEditorState, a: { activeId: string; overId: string; chapterId: string | null }):
  { rows: PlanRows; request: { items: { id: string; chapterId: string | null }[]; movedStopIds: string[] }; before: StopPlacement[] } | null;
export function reorderChaptersCommand(state: PlanEditorState, a: { activeId: string; overId: string }):
  { rows: PlanRows; request: { chapterIds: string[]; movedChapterId: string; stopItems: { id: string; chapterId: string | null }[] | null }; before: StopPlacement[] } | null;
export function assignChapterCommand(state: PlanEditorState, a: { stopId: string; chapterId: string | null }): { rows: PlanRows; before: StopPlacement[] };
export function setNightsCommand(state: PlanEditorState, a: { stopId: string; nights: number }): { rows: PlanRows; before: StopPlacement[] };
export function applyChanged(rows: PlanRows, changed: { id: string; arriveDate: string; departDate: string }[]): PlanRows;
```

Rules, enforced in `planEditorReducer`:
1. `props` with `pending === 0` and `!sameRows(rows, state.server)` → adopt (`rows` and `server` both become the props; `newStopIds` = ids not in the old `server`, ordered through `orderPlanStops`).
2. `props` with `pending > 0` → `held = rows`; nothing visible changes.
3. `props` equal by content to `server` → state unchanged (same object). `sameRows` compares stops by `id, name, sortOrder, chapterId, chapterSortOrder, arriveDate, departDate, nights, pinned, rough` plus their accommodations' ids, chapters by `id, name, sortOrder, arriveDate, departDate`, transports by `id, sortOrder, fromStopId, toStopId, depAt, arrAt` — read `StopCardStop` and pick every field the editor renders; serialising those picks with `JSON.stringify` is fine.
4. Undo payloads are `touchedPlacements(before, after)`: only stops whose placement fields differ.
5. `revert` writes the given placements onto the current rows and re-orders with `orderPlanStops` — the only way local rows go back (failed write, failed Undo, local Undo).
- `settle` with `pending` reaching 0 and a `held` snapshot → adopt `held` (rule 1 applied late). Every `begin`/`settle`/`revert` result's stops pass through `orderPlanStops` (CMP-3).

- [ ] **Step 1: Failing tests** (the reducer tests that replace the handler-capture drag tests — port each capture test's scenario: pinned scheduled stop blocked; blocked pinned drag doesn't corrupt `chapterId`; rough reorder; dated chapter drag; rough chapter drag; plus):

```ts
it("holds server rows that arrive mid-write and adopts them when idle (CMP-1, Review Focus 1)", () => {
  let s = initPlanEditor(rowsAB);
  s = planEditorReducer(s, { type: "begin", rows: rowsBA });
  s = planEditorReducer(s, { type: "props", rows: rowsAB_withRename });
  expect(s.rows).toBe(s.rows); expect(s.rows.stops.map((x) => x.id)).toEqual(["b", "a"]);
  s = planEditorReducer(s, { type: "settle" });
  expect(s.rows.stops.find((x) => x.id === "a")!.name).toBe("Renamed");
});
it("ignores fresh-reference props with the same content", () => {
  const s = initPlanEditor(rowsAB);
  expect(planEditorReducer(s, { type: "props", rows: structuredClone(rowsAB) })).toBe(s);
});
it("touchedPlacements keeps only moved rows (CMP-2, Review Focus 2)", () => {
  expect(touchedPlacements(stopsABC, stopsACB).map((p) => p.id).sort()).toEqual(["b", "c"]);
});
it("revert puts rows back in plan order (CMP-3)", () => {
  const s = planEditorReducer(initPlanEditor(rowsAB), { type: "begin", rows: rowsBA });
  const r = planEditorReducer(s, { type: "revert", placements: touchedPlacements(rowsBA.stops, rowsAB.stops) });
  expect(r.rows.stops.map((x) => x.id)).toEqual(["a", "b"]);
});
```

Build fixtures with `stop()`/`chapter()` from `@/test/builders` mapped to `ItineraryStop` (add a local `itineraryStop(o)` helper in the test). Copy the move logic for each command out of `handleDragEnd` (~1515-1707), `handleAssign` (~1208), `handleSetNights` (~1347) verbatim, then make it pure.

- [ ] **Step 2–4:** FAIL → implement → PASS. Task-end checks. Commit `feat(plan): a pure plan-editor reducer with the Q7 reconciliation rules (card 2.G)`.

---

## Task 17: Wire the manager to the reducer; TB-07, ARCH-CMP-1/2/3 (card 2.G, part 2)

**Files:**
- Create: `components/plan/use-plan-editor.ts`, `use-plan-editor.test.tsx`
- Modify: `components/trip/itinerary-manager.tsx`, `itinerary-manager.test.tsx`, `components/ui/undo-toast.guard.test.ts` (`it.todo` → `it`)

**Interfaces:**
- Consumes: Task 16 reducer and commands; Task 14 `useUndoableAction`; actions `reorderStops`, `reorderChapters`, `restoreStops`, `assignStopToChapter`, `setStopNights`, `setStopDates`, `firmUpSegment`, `firmUpTrip`; `summariseReorder`, `undoPayloadFor` (stay exported from the manager or move to `components/plan/plan-editor-copy.ts` with re-export — pick whichever keeps the existing pure tests importing from one place).
- Produces:

```ts
export function usePlanEditor(a: { tripId: string; forkId: string | null; rows: PlanRows }): {
  state: PlanEditorState;
  reorder(a: { activeId: string; overId: string; chapterId: string | null; movedName: string }): Promise<void>;
  reorderChapters(a: { activeId: string; overId: string; movedName: string }): Promise<void>;
  assign(a: { stopId: string; chapterId: string | null }): Promise<void>;
  setNights(a: { stopId: string; nights: number; name: string }): Promise<void>;
  setDates(a: { stopId: string; dates: { arriveDate: string; departDate: string }; name: string }): Promise<boolean>;
  firmUp(a: { chapterId?: string }): Promise<boolean>;   // whole trip when chapterId is omitted
  dispatch: React.Dispatch<PlanEditorEvent>;             // for the drag-over stamp and the flash
};
```

Inside: `useReducer(planEditorReducer, rows, initPlanEditor)`; `useEffect(() => dispatch({ type: "props", rows }), [rows])` (the reducer makes repeat content a no-op). Each method: command → `begin` → `useUndoableAction` with `persist` = the action, `revert` = `dispatch({ type: "revert", placements: before })`, on success `settle` with `applyChanged(...)`; for scheduled results `undo` = `restoreStops(touchedPlacements(beforeStops, afterStops), forkId, payload ? undoPayloadFor(payload) : undefined)`, `applyUndo` = `dispatch({ type: "revert", placements: touched })`; `done` = `summariseReorder(...)`. `revertUndo` dispatches `revert` with the `after` placements (back to what the server holds). `settle` also on failure (pending must always come back down) — put it in a `finally`.

- [ ] **Step 1: Failing tests** in `use-plan-editor.test.tsx` (`renderHook`, actions mocked with `vi.mock("@/server/actions/stops")` / `chapters`):

```ts
it("a reorder that rejects toasts and restores plan order (TB-07, Review Focus 3)", async () => {
  reorderStopsMock.mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => usePlanEditor({ tripId: "t1", forkId: null, rows: rowsAB }));
  await act(() => result.current.reorder({ activeId: "a", overId: "b", chapterId: null, movedName: "Paris" }));
  expect(result.current.state.rows.stops.map((s) => s.id)).toEqual(["a", "b"]);
  expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
});
it("reorderChapters that rejects is caught too (TB-07)", …);
it("Undo restores only the touched rows (ARCH-CMP-2)", async () => {
  reorderStopsMock.mockResolvedValue({ success: true, changed: [{ id: "a", arriveDate: "2026-11-05", departDate: "2026-11-07" }], conflicts: [] });
  // reorder, then capture toastWithUndo's onUndo from the mocked undo-toast and call it
  expect(restoreStopsMock).toHaveBeenCalledWith([expect.objectContaining({ id: "a" }), expect.objectContaining({ id: "b" })], null, undefined);
  expect(restoreStopsMock.mock.calls[0][0]).toHaveLength(2); // not the whole plan
});
it("an Undo whose restore fails toasts and re-shows the server's rows", …);
it("props arriving mid-reorder are held until it settles (ARCH-CMP-1)", …);
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement `usePlanEditor`.** Then in `itinerary-manager.tsx`: delete `localStops`/`localChapters`/`localTransports`, the three `tracked*` states and the render-time resync (~587-612), `preDragSnapshot`/`preSnapshot` code, `applyReorderResult` (~1717-1766); read rows from `editor.state.rows`; `newStopIds` from `editor.state.newStopIds` (dispatch `flashed` where the flash timer clears today). `handleDragEnd`'s stop/chapter branches call `editor.reorder` / `editor.reorderChapters` (`void` them; the hook never rejects). `handleDragOver`'s optimistic `chapterId` stamp becomes a `begin`-free local display concern: keep it as a separate `dragOverChapterId` state merged at render, so it never touches reducer rows. `handleAssign`, `handleSetNights`, `handleSaveAdjustDates`, `handleFirmUp`, `handleFirmUpTrip` call the hook methods (keeping their confirm dialogs and `pendingId` keys). Every `setLocalStops(initialStops)` revert is gone.

- [ ] **Step 4: Tests.** In `itinerary-manager.test.tsx`: delete the handler-capture `vi.mock("@dnd-kit/core")` and the tests at ~1401-1551 and ~2452-2530 whose scenarios Task 16/17 tests now cover (commit message lists them as "handler-capture mechanics, moved to reducer/hook tests"); keep every rendering assertion, the pure `summariseReorder`/`undoPayloadFor` tests, "rejected chapter actions", "no silent failures", "nights stepper", "optimistic pending state", "empty chapter remove control". If an item-drop scenario has no hook equivalent (dropping an Item on another Stop), test it through `resolveItemDrop` in `components/plan/plan-dnd.test.ts` instead.

- [ ] **Step 5:** Run `npx vitest run components/plan components/trip/itinerary-manager.test.tsx components/trip/itinerary-manager.lazy-dialogs.test.tsx components/ui` → PASS.

- [ ] **Step 6:** `undo-toast.guard.test.ts`: `it.todo` → `it`; run → PASS. Task-end checks (`vitest related` will be wide — that's expected). Commit:

```bash
git commit -m "refactor(plan): the manager renders a reducer's rows; every write settles or reverts through one path

TB-07: reorderStops/reorderChapters awaits and the Undo restore are caught.
ARCH-CMP-1: server props are adopted by content and held while a write is
pending. ARCH-CMP-2: Undo restores only the rows the move touched.
ARCH-CMP-3: a failed write reverts through orderPlanStops. Handler-capture
drag tests replaced by reducer and usePlanEditor tests (spec Q10).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Empty-chapter delete button at full size (ARCH-CMP-4)

**Files:**
- Modify: `components/trip/itinerary-manager.tsx` (~2368-2377), `itinerary-manager.test.tsx` ("empty chapter remove control", ~1191)

- [ ] **Step 1: Failing test:** in the existing describe, `expect(button.className).toMatch(/\bsize-8\b/); expect(button.className).not.toMatch(/\bh-7\b|\bw-7\b/); expect(button.className).toMatch(/\btap-target\b/);`
- [ ] **Step 2:** FAIL. **Step 3:** `className="tap-target size-8 p-0 text-muted-foreground hover:text-destructive"`; check the neighbouring firm-up button keeps ≥ 8px gap per `COMPONENTS.md:314-318` (add `gap-2` to the row if it is tighter). **Step 4:** PASS; task-end checks; commit `fix(plan): empty-chapter remove button is size-8 (ARCH-CMP-4, ADR 0029)`.

---

## Task 19: Whole-branch gate and the docs

**Files:**
- Modify: `docs/specs/2026-10-14-tidy-up-pass.md` (status: batch 2 built; the "Deviations" from this plan under each card), `docs/open-follow-ups.md` (close ARCH-CMP-1..4, ARCH-OBS-3, NAV-02, BI-04), `docs/follow-ups/2026-10-15-tidy-up-batch-1-deferred.md` (strike what Tasks 2, 3 did; the walk-sources doc item was already done), `docs/follow-ups/2026-10-14-booking-import.md` (BI-04 done)
- Create (if anything was deferred): `docs/follow-ups/2026-10-15-tidy-up-batch-2-deferred.md`

- [ ] **Step 1:** `npm test` — all green. Fix anything red at its root; a failure in a file this branch didn't touch still gets fixed if this branch caused it.
- [ ] **Step 2:** `npm run build` — green.
- [ ] **Step 3:** `docker compose up -d && npx prisma migrate deploy && npm run test:integration` — green (if Docker is unavailable, say so in the report; don't skip silently).
- [ ] **Step 4:** `npm run knip` and `npx eslint .` — clean (delete exports knip flags as newly unused, e.g. `seedCost`, the helpers).
- [ ] **Step 5:** `grep -rn "revalidatePath(" server app components lib | grep -v lib/revalidate.ts`, `grep -rn "as unknown as Record" server/actions`, `grep -rni "shared pot" app components lib` (only release notes) — each as expected.
- [ ] **Step 6:** Docs edits listed above. Commit `docs: tidy-up batch 2 built — spec status and deviations, follow-ups closed`.
