# Follow-ups Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 40 executable items in `docs/open-follow-ups.md`'s *Open items* sections — one P0 authorization gap, two P1 defects, and the P2/P3 correctness, coverage and documentation debt behind them.

**Architecture:** No new subsystems. Every task is a local change to code that already exists, grouped so one task's diff lands in one file or one tightly-related pair, and ordered P0 → P1 → P2 → P3. Each task carries its own test cycle and is independently reviewable; a fresh agent can complete any single task without reading the others.

**Tech Stack:** Next.js 15 App Router (React Server Components), TypeScript, Prisma (Postgres), Zod, Vitest + Testing Library (jsdom), Tailwind v4, Radix UI.

## Global Constraints

Every task's requirements implicitly include this section.

- **Branch `chore/follow-ups-triage-and-sweep`.** Never commit to `main`, never merge, never deploy. No `vercel`, `vercel deploy`, or `vercel --prod` commands, ever. This is the operator's standing instruction and outranks anything a task says.
- **DANGER — production database.** `.env.production.local` points at the PRODUCTION Neon Postgres. Never run `prisma migrate dev`, `prisma migrate deploy`, `prisma db push`, or `prisma migrate reset`. Never connect to a database from any task in this plan. All 26 migrations are already applied in production; **this sweep must not add a migration** without the operator's explicit say-so. No task below needs one — if you think yours does, stop and report instead of writing one.
- **`CONTEXT.md` is the vocabulary contract.** Read it before touching user-visible copy, comments, or doc prose. Never introduce a term its *Avoid* lists forbid. In particular: **Activity** means the change-log feed, never "a planned thing to do"; the trip-scoped idea pool is the **Wishlist**; **Feedback note** is the contract term for a note written in the Feedback panel.
- **Tests run with `TZ=UTC`** — already baked into the `npm test` script (`TZ=UTC vitest run`). Colocate tests next to their sources (`foo.ts` → `foo.test.ts`).
- **Server-action tests mock `@/lib/db`, `@/lib/guards`, and `next/cache`**, and assert guard ordering with `expectAccessCheckedBeforeWrite` from `@/test/helpers/access-order`. **That helper already exists** — import it by name, do not rewrite it, do not reimplement its logic inline.
- **Targeted run during a task:** `TZ=UTC npx vitest run <path>`.
- **At the end of every task:** `npm test` and `npm run lint`, both green, before committing.
- **`npm run build` runs exactly once, in the final task.** It is slow; do not run it per task.
- **Conventional commits, lowercase subject.** Every commit message ends with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Do not edit `docs/open-follow-ups.md` as you go.** Striking the closed items is the final task's job, so no two tasks collide on that file. Do not edit anything under `docs/follow-ups/` — those are immutable history.
- **Do not touch the backlog's *Needs a decision*, *Blocked*, *Settled — do not re-raise*, or *Struck* sections.** Nothing in this plan implements any of them. If a task tempts you toward one (for example "while I'm here, `subscribeToPush` could refuse a reassignment" — that is `CD-02`, a *Needs a decision* item), stop at the task's stated scope.

### Shared-surface register — read this if your task is listed

Two process lessons from `docs/follow-ups/2026-09-20-changeover-day-and-digest-follow-ups.md` (`CD-17`, `CD-18`) say a plan must name where two tasks touch the same surface, because neither task's own reviewer can see the interaction. These are the five places in this plan:

| File | Touched by | What the later task's reviewer must check |
|---|---|---|
| `components/trip/item-card.tsx` | Task 2 (adds a `forkId` prop) and Task 19 (drops a decorative `MapPin`) | Task 19 must not revert Task 2's `forkId` prop or its pass-through to `CostEditor`. |
| `components/feedback/feedback-launcher.tsx` + `.test.tsx` | Task 8 (exports `DOCKED_FROM`, test hygiene) and Task 15 (`canDelete` contract, toast action, counter) | Task 15 must keep Task 8's new tests green — in particular Task 15 replaces `authorId` with `canDelete` on `FeedbackNoteView`, so Task 8's `existingNote` fixture changes shape under it. |
| `app/(app)/account/page.tsx` (Task 22) vs `app/(app)/account/page.test.tsx` (Task 12) | Task 12 first, Task 22 second | Task 22 adds a `now` prop threaded from the page; Task 12's page-level tests render the real page, so Task 22 must re-run `app/(app)/account/page.test.tsx` and keep it green. |
| `app/(app)/trips/[tripId]/budget/page.tsx` | Task 4 (widens the `searchParams` type and normalises `plan` via `firstSearchParam`) and Task 13 (passes `sum > 0 ? sum : null` into the aggregate `CostAmounts` call site) | Task 13 must confirm Task 4's `firstSearchParam` normalisation of the `plan` param is still intact — Task 13's own edit lands nearby but is unrelated, and must not revert or reorder it. |
| `lib/validations/cost.ts` | Task 6 only (exports a shared schema) | No second toucher, but Tasks 2 and 13 read cost shapes — neither changes them. |

### "Who feeds this?" — the `forkId` thread

Task 2 threads one value, `forkId`, across seven files. The value is **fed by** `app/(app)/trips/[tripId]/plan/page.tsx:384` (`forkId={activeForkId}` into `ItineraryManager`) and `wishlist-board.tsx`'s existing `activeForkId` prop — both already exist and are **not** changed by this plan. Task 2's job is only to carry that value the remaining hops down to `CostEditor`. If you are implementing Task 2 and cannot find a live source for `forkId` at some hop, that hop is the bug — do not default it to `null` to make the types pass.

---

### Task 1: `duplicateTrip` — owner-or-admin guard (HG-12, P0)

`duplicateTrip` calls `requireTripAccess`, which proves **membership only**. It destructures `{ user }` and never reads `membership.role`, so any Traveller on a trip can invoke the server action directly and mint themselves a fully-owned copy — chapters, stops, items, transports, checklist items and all member rows, with themselves as owner. Today the only thing making Duplicate owner-only is a *rendering* gate on the Trip settings page. `deleteTrip`, in the same file, already has the guard to copy. ADR 0045 documents that Duplicate and Delete are both intended to be owner-or-admin gated, so this is an omission against a decided model.

**Files:**
- Modify: `server/actions/trips.ts:310-314` (`duplicateTrip`'s opening lines)
- Test: `server/actions/trips.test.ts:722-782` (the existing `describe("duplicateTrip")` block)

**Interfaces:**
- Consumes: `requireTripAccess(tripId)` from `@/lib/guards`, which returns `{ user, membership }`; `isAdminEmail(email: string | null | undefined): boolean` from `@/lib/admin`. Both are already imported at the top of `server/actions/trips.ts`.
- Produces: `duplicateTrip` keeps its existing signature `duplicateTrip(sourceTripId: string, newName: string): Promise<DuplicateTripResult>`, where `DuplicateTripResult = { success: true; tripId: string } | { success: false; error: string }`. The new refusal is `{ success: false, error: "Only the trip owner can duplicate the trip." }`. No other task depends on this.

- [ ] **Step 1: Write the failing regression test**

This is the test that matters: it proves a non-owner member can invoke `duplicateTrip` today. Add it inside the existing `describe("duplicateTrip", ...)` block in `server/actions/trips.test.ts`, immediately after the `"creates a new trip + owner membership..."` test.

```ts
  it("refuses a non-owner member — a Traveller cannot mint themselves a copy", async () => {
    // HG-12. requireTripAccess proves MEMBERSHIP, not role: before the guard
    // existed, this member sailed straight through to db.trip.findUnique and
    // came out the other side owning a full copy of someone else's trip.
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-2", email: "traveller@example.com" },
      membership: { userId: "user-2", role: "member" },
    });

    const result = await duplicateTrip("src", "Stolen copy");

    expect(result).toEqual({
      success: false,
      error: "Only the trip owner can duplicate the trip.",
    });
    // Nothing was even read, let alone written.
    expect(tripFindUniqueMock).not.toHaveBeenCalled();
    expect(tripCreateMock).not.toHaveBeenCalled();
    expect(memberCreateMock).not.toHaveBeenCalled();
  });
```

Then fix the **existing** happy-path test in the same block so it still describes a legal call — and switch it to `mockResolvedValueOnce` while you're there. `vi.clearAllMocks()` (`server/actions/trips.test.ts:153`) does not reset implementations set with `mockResolvedValue`, only call history, so a bare `mockResolvedValue` left set is a base implementation that outlives its own test and leaks into whatever `describe` block runs next. Change its first line from:

```ts
    requireTripAccessMock.mockResolvedValue({ user: { id: "user-1" }, membership: { role: "member" } });
```

to:

```ts
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "you@example.com" },
      membership: { userId: "user-1", role: "owner" },
    });
```

Now add the two `ADMIN_EMAILS` tests in a **separate** block, mirroring `describe("deleteTrip — admin override", ...)` (`server/actions/trips.test.ts:633`) exactly — same file, same problem, already solved there: a scoped `afterEach` that deletes `ADMIN_EMAILS` and `mockResolvedValueOnce` on every call, so nothing outlives its own test. Add this immediately after the `describe("duplicateTrip", ...)` block's closing `});`, before `describe("setChaptersEnabled", ...)`:

```ts
describe("duplicateTrip — admin override", () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it("lets a non-owner member duplicate when their email is in ADMIN_EMAILS (ADR 0045)", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u-admin", email: "admin@example.com" },
      membership: { userId: "u-admin", role: "member" },
    });
    tripFindUniqueMock.mockResolvedValue({
      id: "src", name: "Europe 2026", homeCurrency: "AUD",
      drivingWindingFactor: 1.5, drivingAvgSpeedKph: 80,
      members: [{ userId: "user-1", role: "owner" }],
      chapters: [], stops: [], items: [], transports: [], checklistItems: [],
    });
    tripCreateMock.mockResolvedValue({ id: "new" });

    const result = await duplicateTrip("src", "Admin copy");

    expect(result).toEqual({ success: true, tripId: "new" });
  });

  it("still requires membership — an admin gets no bypass of requireTripAccess", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    requireTripAccessMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));

    await expect(duplicateTrip("someone_elses", "x")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(tripCreateMock).not.toHaveBeenCalled();
  });
});
```

The scoped `afterEach` replaces both tests' trailing `delete process.env.ADMIN_EMAILS;` from the source item — do not keep a manual `delete` inside either test body as well.

- [ ] **Step 2: Run the tests and watch the right one fail**

Run: `TZ=UTC npx vitest run server/actions/trips.test.ts -t duplicateTrip`

Expected: `"refuses a non-owner member — a Traveller cannot mint themselves a copy"` FAILS, because `duplicateTrip` returns `{ success: true, tripId: ... }` (or throws on the unmocked `db.trip.findUnique`) instead of the refusal. That failure is the vulnerability. The other tests, across both `duplicateTrip` describe blocks, should pass already.

- [ ] **Step 3: Add the guard**

In `server/actions/trips.ts`, change `duplicateTrip`'s opening from:

```ts
  const { user } = await requireTripAccess(sourceTripId);

  const source = await db.trip.findUnique({
```

to:

```ts
  const { user, membership } = await requireTripAccess(sourceTripId);

  // Owner, or an operator listed in ADMIN_EMAILS. Same shape as deleteTrip
  // above, and for the same reason (ADR 0045): the Danger zone card carries
  // Duplicate as well as Delete, and a *rendering* gate on the settings page
  // is not an authorization check — the server action is directly callable by
  // any member. Without this, a Traveller could mint a fully-owned copy of
  // someone else's trip, members and all.
  if (membership.role !== "owner" && !isAdminEmail(user.email)) {
    return { success: false, error: "Only the trip owner can duplicate the trip." };
  }

  const source = await db.trip.findUnique({
```

`isAdminEmail` is already imported at `server/actions/trips.ts:8`. Do not add an import.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `TZ=UTC npx vitest run server/actions/trips.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green.

- [ ] **Step 6: Commit**

```bash
git add server/actions/trips.ts server/actions/trips.test.ts
git commit -m "fix(trips): gate duplicateTrip on owner-or-admin, not membership

requireTripAccess proves membership only, so any Traveller on a trip could
invoke duplicateTrip directly and mint a fully-owned copy. Copies the guard
deleteTrip already uses in the same file (ADR 0045).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: thread `forkId` from the plan page down to `CostEditor` (AB-01, P1)

`CostEditorProps` has no `forkId`, and the create call is `createCost(tripId, input)` with no third argument — so a cost added through the per-entity Cost editor while a variant is active is filed on the **real plan**, with an `ownerId` pointing at a fork-owned entity. `createCost(tripId, data, forkId?: PlanId)` already accepts and stores the fork id (`server/actions/costs.ts:117-120,162`); nothing supplies it. The page already computes `activeForkId` and hands it to `ItineraryManager`; the last few hops are missing. Read the **"Who feeds this?"** note in Global Constraints before starting.

**Files:**
- Modify: `components/trip/cost-editor.tsx` (props + the `createCost` call at ~line 282)
- Modify: `components/trip/item-card.tsx` (new prop, pass to `CostEditor` at ~line 242)
- Modify: `components/trip/accommodation-card.tsx` (new prop, pass to `CostEditor` at ~line 173)
- Modify: `components/trip/transport-card.tsx` (new prop, pass to `CostEditor` at ~line 215)
- Modify: `components/trip/accommodation-row.tsx` (new prop on `AccommodationRowProps`; it already spreads `{...props}` into `AccommodationCard`)
- Modify: `components/trip/itinerary-manager.tsx` (pass `forkId` to `<TransportCard>` ~line 1464 and `<AccommodationRow>` ~line 1576)
- Modify: `components/trip/wishlist-board.tsx` (pass `activeForkId` to both `<ItemCard>` renders, ~lines 326 and 369)
- Test: `components/trip/cost-editor.test.tsx`

**Interfaces:**
- Consumes: `createCost(tripId: string, input: CostRawInput, forkId?: PlanId)` from `@/server/actions/costs`, where `PlanId = string | null` (`lib/plan-scope.ts:5`). Because `PlanId` already admits `null`, a `string | null | undefined` value can be passed straight through — no `?? undefined` coercion is needed or wanted.
- Produces: `CostEditorProps` gains `forkId?: string | null`. `ItemCardProps`, `AccommodationCardProps`, `TransportCardProps` and `AccommodationRowProps` each gain `forkId?: string | null`. All optional, so no existing call site breaks. Task 19 also edits `components/trip/item-card.tsx` — see the shared-surface register.

- [ ] **Step 1: Write the failing tests**

Add to `components/trip/cost-editor.test.tsx`, inside the existing `describe("CostEditor", ...)`:

```ts
  it("files a new cost on the active variant when forkId is supplied", async () => {
    // AB-01: createCost's third argument is the Plan the cost belongs to.
    // Without it, a cost added while a variant is active lands on the real
    // plan, pointing at a fork-owned entity.
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} forkId="fork-9" />);

    await user.click(screen.getByRole("button", { name: /add cost/i }));
    await user.type(screen.getByLabelText("Cost amount"), "12.50");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ costMinor: 1250 }),
      "fork-9",
    );
  });

  it("files a new cost on the real plan when no forkId is supplied", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add cost/i }));
    await user.type(screen.getByLabelText("Cost amount"), "12.50");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ costMinor: 1250 }),
      undefined,
    );
  });
```

`"Cost amount"` is the exact live label (`components/trip/cost-editor.test.tsx:62`) — if the button queries above still do not match, copy the exact interaction sequence from the existing `"add flow: cost only -> createCost called with costMinor: 1250..."` test at `components/trip/cost-editor.test.tsx:55` and keep the two new assertions.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TZ=UTC npx vitest run components/trip/cost-editor.test.tsx`
Expected: both new tests FAIL — `createCost` is called with two arguments, so the three-argument `toHaveBeenCalledWith` does not match.

- [ ] **Step 3: Add `forkId` to `CostEditor` and pass it through**

In `components/trip/cost-editor.tsx`, add to `CostEditorProps` (after `ownerId`):

```ts
  /**
   * The Plan this cost belongs to — `null`/absent is the real plan, a string
   * is a variant. Without it a cost added on a fork-active page is filed on
   * the real plan with an ownerId pointing at a fork-owned entity (AB-01).
   */
  forkId?: string | null;
```

Destructure `forkId` alongside the other props wherever the component reads them, and change the create call inside `handleAddSubmit`:

```ts
      const result = await createCost(tripId, input, forkId);
```

- [ ] **Step 4: Add the prop to the three cards and pass it down**

In each of `components/trip/item-card.tsx`, `components/trip/accommodation-card.tsx`, `components/trip/transport-card.tsx`: add `forkId?: string | null;` to the props interface, destructure it, and add `forkId={forkId}` to the `<CostEditor .../>` element already in that file.

In `components/trip/accommodation-row.tsx`, add `forkId?: string | null;` to `AccommodationRowProps`. Nothing else is needed there — the component already does `<AccommodationCard {...props} />`.

- [ ] **Step 5: Feed it from the two renderers**

In `components/trip/itinerary-manager.tsx`, add `forkId={forkId ?? null}` to the `<TransportCard` element (~line 1464) and to the `<AccommodationRow` element (~line 1576). `forkId` is already a prop of `ItineraryManager` (declared at line 165, destructured at line 462) and is already threaded to `StopCard`, `QuickAddStops` and the dialogs — you are adding the two renders that were missed.

In `components/trip/wishlist-board.tsx`, add `forkId={activeForkId ?? null}` to both `<ItemCard` elements (~lines 326 and 369). `activeForkId` is already a prop (declared at line 53, destructured at line 81) and is already passed to `ScheduleItemDialog` at line 425.

Do **not** change `app/(app)/trips/[tripId]/plan/page.tsx` — it already supplies `activeForkId`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `TZ=UTC npx vitest run components/trip/cost-editor.test.tsx components/trip/item-card.test.tsx components/trip/accommodation-card.test.tsx components/trip/accommodation-row.test.tsx components/trip/itinerary-manager.test.tsx components/trip/wishlist-board.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck, full suite and lint**

Run: `npx tsc --noEmit`, then `npm test`, then `npm run lint`. All green. The typecheck matters here specifically: the whole point of the item is a value that type-checked fine while being silently unfed, so confirm every hop compiles with the prop actually present.

- [ ] **Step 8: Commit**

```bash
git add components/trip/cost-editor.tsx components/trip/item-card.tsx components/trip/accommodation-card.tsx components/trip/transport-card.tsx components/trip/accommodation-row.tsx components/trip/itinerary-manager.tsx components/trip/wishlist-board.tsx components/trip/cost-editor.test.tsx
git commit -m "fix(costs): thread forkId to the per-entity cost editor

createCost has always accepted a forkId; nothing supplied it, so a cost added
while a variant was active landed on the real plan pointing at a fork-owned
entity.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: name the write-path migration hazards in `docs/DEPLOY.md` (OPS-08, P1)

`vercel.json:4` runs `prisma migrate deploy && next build` in one step, so a migration is live against the *old* build for the length of the build. That pipeline shape is an accepted Hobby-tier tradeoff — **there is no code fix here, and you must not change `vercel.json`.** What is owed is documentation: §4b is titled and scoped around column *renames* breaking *reads*, and two other SQL shapes produce the same gap on *writes* — adding a `NOT NULL` column with no default, and dropping a unique constraint an older client's `upsert` needs as its `ON CONFLICT` target. The `share_links_per_audience` migration was a real instance of both.

**Files:**
- Modify: `docs/DEPLOY.md` — insert a new `### ` subsection inside §4b, after the numbered procedure that ends at line 99 and before `### Before deploying \`20260916000000_digest_and_alarms\`` at line 100.

**Interfaces:**
- Consumes: nothing. Documentation only.
- Produces: nothing other tasks reference.

- [ ] **Step 1: Widen §4b's heading**

Change line 74 from:

```markdown
## 4b. Deploying a column-RENAME migration (read before the next deploy)
```

to:

```markdown
## 4b. Deploying a migration that can break the running build (read before the next deploy)
```

- [ ] **Step 2: Add the write-path subsection**

Insert this immediately before the `### Before deploying \`20260916000000_digest_and_alarms\`` heading:

```markdown
### The same window, on the write path

Everything above is about *reads* — a renamed column, so every cost read 500s
until the build lands. Two other SQL shapes open the identical window on
**writes**, and neither is a rename, so neither is caught by reading this
section's title:

1. **Adding a `NOT NULL` column with no default.** The moment the migration
   lands, the old build — still serving — writes `INSERT`s that omit the new
   column. Every one of them fails. Reads are fine throughout, so nothing in
   the read path warns you.
2. **Dropping a unique constraint an older client's `upsert` uses as its
   `ON CONFLICT` target.** Prisma compiles `upsert` against the constraint it
   knew at generate time. Drop or rename that constraint and the old build's
   upserts fail at the database, not in the app — again with reads untouched.

**Worked example — `20260920120000_share_links_per_audience`.** It was both at
once: it added the per-audience columns and reshaped `ShareLink`'s uniqueness.
For the length of that build, the previous deployment could still read share
links but could not create or update one. The window passed and nothing broke
irrecoverably, which is exactly why it is worth writing down — the failure was
invisible from the read path the rest of this section describes.

**So: before deploying, check your migration SQL against the write path too.**
Ask what the *currently deployed* build's `INSERT`s and `upsert`s look like
against the *new* schema, not just its `SELECT`s. If either would fail, the
migration needs two deploys — additive first (nullable column, or add the new
constraint alongside the old), then the tightening one after the build that
writes to it is live.
```

- [ ] **Step 3: Check the vocabulary and the cross-reference**

Run: `grep -n "Activity\|Wishlist\|Feedback note" docs/DEPLOY.md` — confirm you introduced none of `CONTEXT.md`'s reserved terms in a non-contract sense. Read the new prose once against `CONTEXT.md`'s *Avoid* lists.

- [ ] **Step 4: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green (nothing should change, but a docs-only commit still has to leave the tree green).

- [ ] **Step 5: Commit**

```bash
git add docs/DEPLOY.md
git commit -m "docs(deploy): name the write-path migration hazards in 4b

Section 4b was scoped to renames breaking reads. A NOT NULL column with no
default, and a dropped upsert ON CONFLICT target, open the same window on
writes — share_links_per_audience was both.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: normalise a repeated `?plan=` query param (AB-02, P2)

`app/(app)/trips/[tripId]/plan/page.tsx:34-46` and `app/(app)/trips/[tripId]/budget/page.tsx:67-76` both do `const { plan } = await searchParams;` then hand the value straight to `db.fork.findFirst({ where: { id: selectedForkId, tripId } })`. The TypeScript signature `searchParams: Promise<{ plan?: string }>` is a compile-time *claim*: Next.js hands a `string[]` at runtime for a repeated param, so `?plan=a&plan=b` 500s both pages. Auth-guarded first (`requireTripAccess` runs before the query), so this is a crafted-URL edge case, not a normal user path — fix it anyway, and fix it in one testable place rather than twice inline.

**Files:**
- Modify: `lib/plan-scope.ts` (add the helper)
- Test: `lib/plan-scope.test.ts`
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx:34-38` (signature + normalisation)
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx:67-71` (signature + normalisation)

**Interfaces:**
- Consumes: `PlanId = string | null` from `lib/plan-scope.ts:5`.
- Produces: **`firstSearchParam(value: string | string[] | undefined): string | null`**, exported from `lib/plan-scope.ts`. Returns the first entry of an array, the string itself, or `null` for `undefined` and for an empty array. Referenced by exact name in both pages. No later task uses it.

- [ ] **Step 1: Write the failing test**

Add to `lib/plan-scope.test.ts`:

```ts
import { firstSearchParam } from "./plan-scope";

describe("firstSearchParam", () => {
  it("passes a single string through unchanged", () => {
    expect(firstSearchParam("fork-1")).toBe("fork-1");
  });

  it("takes the first entry of a repeated param", () => {
    // Next.js hands a string[] at runtime for ?plan=a&plan=b, even though the
    // page's searchParams type claims `string`. Handing that array to
    // db.fork.findFirst({ where: { id } }) 500s the page (AB-02).
    expect(firstSearchParam(["fork-1", "fork-2"])).toBe("fork-1");
  });

  it("is null for an absent param", () => {
    expect(firstSearchParam(undefined)).toBeNull();
  });

  it("is null for an empty repeated param", () => {
    expect(firstSearchParam([])).toBeNull();
  });

  it("is null for an empty string, which is not a fork id", () => {
    expect(firstSearchParam("")).toBeNull();
  });
});
```

Add the `import { describe, expect, it } from "vitest";` line only if `lib/plan-scope.test.ts` does not already have one.

- [ ] **Step 2: Run the test to verify it fails**

Run: `TZ=UTC npx vitest run lib/plan-scope.test.ts`
Expected: FAIL — `firstSearchParam is not a function` / no exported member.

- [ ] **Step 3: Implement the helper**

Add to `lib/plan-scope.ts`, below `planScope`:

```ts
/**
 * The first value of a Next.js search param, as a `PlanId`.
 *
 * A page's `searchParams` type says `plan?: string`, but that is a
 * compile-time claim only: Next hands a `string[]` at runtime when the param
 * is repeated (`?plan=a&plan=b`). Passing that array to Prisma's `id` filter
 * throws and 500s the page, so normalise here rather than trusting the type.
 */
export function firstSearchParam(value: string | string[] | undefined): PlanId {
  const first = Array.isArray(value) ? value[0] : value;
  return first ? first : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `TZ=UTC npx vitest run lib/plan-scope.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it in both pages**

In `app/(app)/trips/[tripId]/plan/page.tsx`, widen the declared type and normalise:

```ts
  searchParams: Promise<{ plan?: string | string[] }>;
```
```ts
  const { plan } = await searchParams;
  const selectedForkId = firstSearchParam(plan);
```

Add `firstSearchParam` to the existing import from `@/lib/plan-scope` in that file (it already imports `planScope`). Make the identical change in `app/(app)/trips/[tripId]/budget/page.tsx` at lines 67-71 — same widened type, same call, same import addition.

Leave everything downstream of `selectedForkId` alone: both files already handle `null`.

- [ ] **Step 6: Verify nothing else reads the raw param**

Run: `grep -rn "const { plan } = await searchParams" app/` — the only two hits should be the two files you just edited, and both should now be followed by `firstSearchParam`.

- [ ] **Step 7: Typecheck, full suite and lint**

Run: `npx tsc --noEmit`, then `npm test`, then `npm run lint`. All green.

- [ ] **Step 8: Commit**

```bash
git add lib/plan-scope.ts lib/plan-scope.test.ts "app/(app)/trips/[tripId]/plan/page.tsx" "app/(app)/trips/[tripId]/budget/page.tsx"
git commit -m "fix(plan): normalise a repeated ?plan= param instead of 500ing

Next hands a string[] for a repeated search param; both pages passed it
straight to a Prisma id filter.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: make the forking phase gate zone-aware (AB-03, P2)

`server/actions/forks.ts:67-68` (`createFork`) and `:729-730` (`promoteFork`) both compute the trip phase with `today: todayISO()` — a **UTC** calendar day. The fork switcher that offers those actions computes its own phase from `todayISOInZone(currentTripTimezone(trip.stops))` (`app/(app)/trips/[tripId]/layout.tsx:81,89`). The two disagree about what "today" is, so there is a narrow west-of-UTC window where the switcher renders but create/promote cleanly rejects. It fails closed, so this is drift, not a correctness regression — close the drift by making the actions read the same clock the switcher does.

**Files:**
- Modify: `server/actions/forks.ts` — imports, `createFork`'s trip query and phase gate (~lines 58-68), `promoteFork`'s phase gate (~lines 725-733)
- Test: `server/actions/forks.test.ts`

**Interfaces:**
- Consumes: `todayISOInZone(timeZone: string): string` (`lib/tz.ts:367`) and `currentTripTimezone(stops: Array<{ timezone: string | null; arriveDate: string | null; departDate: string | null }>): string` (`lib/tz.ts:378`). `currentTripTimezone` returns `"UTC"` when nothing is dated, so the existing UTC behaviour is preserved for a date-less trip.
- Produces: nothing other tasks reference. `createFork` and `promoteFork` keep their signatures.

- [ ] **Step 1: Write the failing test**

`server/actions/forks.test.ts` already mocks `@/lib/dates` for `todayISO`. Add a mock for `@/lib/tz` next to it (after the `vi.mock("@/lib/dates", ...)` block at line 210):

```ts
vi.mock("@/lib/tz", () => ({
  todayISOInZone: todayISOInZoneMock,
  currentTripTimezone: currentTripTimezoneMock,
}));
```

Add `todayISOInZoneMock` and `currentTripTimezoneMock` to the `vi.hoisted(...)` destructuring list and to its returned object:

```ts
    todayISOInZoneMock: vi.fn().mockReturnValue("2026-07-01"),
    currentTripTimezoneMock: vi.fn().mockReturnValue("Australia/Sydney"),
```

and reset them in the file's `beforeEach` alongside `todayISOMock.mockReturnValue("2026-07-01")`:

```ts
  todayISOInZoneMock.mockReturnValue("2026-07-01");
  currentTripTimezoneMock.mockReturnValue("Australia/Sydney");
```

Then add this test next to the existing `"passes todayISO to computeTripPhase"` test at `server/actions/forks.test.ts:566` — and **replace** that existing test with the new one, since its assertion is precisely the behaviour being changed:

```ts
    it("gates on the trip's own clock, not UTC — the switcher and the action agree", async () => {
      // AB-03: layout.tsx decides whether to SHOW the switcher using
      // todayISOInZone(currentTripTimezone(stops)). Gating the action on UTC
      // opened a west-of-UTC window where the control rendered and the action
      // refused.
      todayISOInZoneMock.mockReturnValue("2026-06-30");
      currentTripTimezoneMock.mockReturnValue("America/Los_Angeles");

      await createFork("trip-1", "Plan B");

      expect(currentTripTimezoneMock).toHaveBeenCalled();
      expect(todayISOInZoneMock).toHaveBeenCalledWith("America/Los_Angeles");
      expect(computeTripPhaseMock).toHaveBeenCalledWith(
        expect.objectContaining({ today: "2026-06-30" }),
      );
    });
```

And one for promote, inside whichever `describe` covers `promoteFork`:

```ts
    it("promote gates on the trip's own clock, not UTC", async () => {
      todayISOInZoneMock.mockReturnValue("2026-06-30");
      currentTripTimezoneMock.mockReturnValue("America/Los_Angeles");

      await promoteFork("fork-1");

      expect(todayISOInZoneMock).toHaveBeenCalledWith("America/Los_Angeles");
      expect(computeTripPhaseMock).toHaveBeenCalledWith(
        expect.objectContaining({ today: "2026-06-30" }),
      );
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TZ=UTC npx vitest run server/actions/forks.test.ts`
Expected: the two new tests FAIL — `computeTripPhase` is still called with `today: "2026-07-01"` from the UTC `todayISO` mock, and `todayISOInZone` is never called.

- [ ] **Step 3: Change `createFork`**

In `server/actions/forks.ts`, add to the imports:

```ts
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
```

Widen `createFork`'s trip query (~line 58) so the phase gate has the stops it needs — one query, not two:

```ts
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      // The trip's own clock, for the phase gate below. Same shape and same
      // filter as app/(app)/trips/[tripId]/layout.tsx, which decides whether
      // the fork switcher is even shown — the two must agree on what "today"
      // is or the control renders while the action refuses (AB-03).
      stops: {
        where: { forkId: null, arriveDate: { not: null } },
        orderBy: { sortOrder: "asc" },
        select: { timezone: true, arriveDate: true, departDate: true },
      },
    },
  });
```

and change the gate:

```ts
    assertForkingAllowed(
      computeTripPhase({
        startDate: trip.startDate,
        endDate: trip.endDate,
        today: todayISOInZone(currentTripTimezone(trip.stops)),
      }),
    );
```

- [ ] **Step 4: Change `promoteFork`**

`promoteFork` gets its trip from `requireForkAccess`, which selects only `{ id, startDate, endDate }`. **Do not widen `requireForkAccess`** — read the stops locally instead, immediately before the gate:

```ts
  // Same clock the fork switcher uses (see createFork above, AB-03).
  const gateStops = await db.stop.findMany({
    where: { tripId, forkId: null, arriveDate: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { timezone: true, arriveDate: true, departDate: true },
  });

  try {
    assertForkingAllowed(
      computeTripPhase({
        startDate: trip.startDate,
        endDate: trip.endDate,
        today: todayISOInZone(currentTripTimezone(gateStops)),
      }),
    );
```

Leave the `catch` block below it exactly as it is.

- [ ] **Step 5: Fix the mock fallout**

`createFork`'s trip mock now needs a `stops` array. Find `setupDefaultTrip()` in `server/actions/forks.test.ts` and add `stops: []` to the object `tripFindUniqueMock` resolves to. `promoteFork` now makes an extra `db.stop.findMany` call — make sure `stopFindManyMock` has a default (`stopFindManyMock.mockResolvedValue([])` in `beforeEach` if it does not already), and if any existing promote test uses `expect(stopFindManyMock).toHaveBeenCalledTimes(n)`, bump `n` by one and leave a short comment saying the extra call is the phase-gate stop read.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `TZ=UTC npx vitest run server/actions/forks.test.ts`
Expected: PASS, whole file.

- [ ] **Step 7: Typecheck, full suite and lint**

Run: `npx tsc --noEmit`, then `npm test`, then `npm run lint`. All green.

- [ ] **Step 8: Commit**

```bash
git add server/actions/forks.ts server/actions/forks.test.ts
git commit -m "fix(forks): gate create and promote on the trip's clock, not UTC

The fork switcher decides visibility with todayISOInZone(currentTripTimezone);
the actions gated on UTC, so west of UTC the control rendered and the action
refused.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: share the `paidAt` shape and the amount cap across the inline cost schemas (AB-04, P2)

`lib/validations/transport.ts:95-98`, `lib/validations/item.ts:100-103` and `lib/validations/accommodation.ts:71-74` each define `paidAt` with only `.regex(/^\d{4}-\d{2}-\d{2}$/, ...)` — no real-calendar-date refinement, so `"2026-02-30"` passes the shape check and silently rolls forward into March. The refinement exists at `lib/validations/cost.ts:21` (`isRealCalendarDate`) and is used only there. The same three files also hardcode `.max(2_147_483_647, "Amount is too large")` in two places each instead of importing `MAX_AMOUNT_MINOR` from `lib/validations/cost.ts:10`. Reachable only by hand-crafted action payloads, so this is correctness hygiene, not a live user path.

**Files:**
- Modify: `lib/validations/cost.ts` (export the shared pieces)
- Modify: `lib/validations/transport.ts:72,90,95-98`
- Modify: `lib/validations/item.ts:77,95,100-103`
- Modify: `lib/validations/accommodation.ts:48,66,71-74`
- Test: `lib/validations/transport.test.ts`, `lib/validations/item.test.ts`, `lib/validations/accommodation.test.ts`

**Interfaces:**
- Consumes: `MAX_AMOUNT_MINOR` (already exported, `lib/validations/cost.ts:10`).
- Produces: **`paidAtDateOnlySchema`**, a `z.ZodEffects<z.ZodString, string, string>` exported from `lib/validations/cost.ts` — a `YYYY-MM-DD` string that is also a real calendar date. Each of the three inline schemas uses it as `paidAt: paidAtDateOnlySchema.nullable().optional()`. No later task uses it. `cost.ts` imports nothing from the other three, so there is no import cycle.

- [ ] **Step 1: Write the failing tests**

Add the same pair to each of `lib/validations/transport.test.ts`, `lib/validations/item.test.ts` and `lib/validations/accommodation.test.ts`, adapting only the schema name and the minimum valid payload that file already builds (find the file's existing "valid input" fixture and spread it). Written out for transport; repeat the shape for the other two rather than cross-referencing:

```ts
  it("rejects a paidAt that is not a real calendar date", () => {
    // AB-04: the shape check alone lets 2026-02-30 through, and `new Date`
    // then silently rolls it forward into March.
    const result = transportSchema.safeParse({ ...VALID, paidAt: "2026-02-30" });
    expect(result.success).toBe(false);
  });

  it("accepts a real calendar date for paidAt", () => {
    const result = transportSchema.safeParse({ ...VALID, paidAt: "2026-02-28" });
    expect(result.success).toBe(true);
  });

  it("rejects an amount above the shared minor-unit cap", () => {
    const result = transportSchema.safeParse({ ...VALID, costMinor: 2_147_483_648 });
    expect(result.success).toBe(false);
  });
```

Use the schema each file already imports (`transportSchema`, `itemSchema`, `accommodationSchema` — check the file's existing imports and use its exact name) and its existing valid-payload constant in place of `VALID`.

- [ ] **Step 2: Run the tests to verify the right ones fail**

Run: `TZ=UTC npx vitest run lib/validations/transport.test.ts lib/validations/item.test.ts lib/validations/accommodation.test.ts`
Expected: the `"rejects a paidAt that is not a real calendar date"` test FAILS in all three files. The other two pass already (the cap is enforced, just hardcoded).

- [ ] **Step 3: Export the shared schema from `cost.ts`**

In `lib/validations/cost.ts`, `isRealCalendarDate` is currently a module-private `const` at line 21. Leave it private and add, just below `paidAtStringSchema`:

```ts
/**
 * A date-only `paidAt`, for the inline cost fields on the Transport, Item and
 * Accommodation schemas — those send a plain `YYYY-MM-DD` from a date input
 * and never an ISO datetime, so they want the narrower shape, but they want
 * the same real-calendar-date refinement `costSchema` gets. Defined here so
 * the three of them cannot drift from it (AB-04).
 */
export const paidAtDateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "paidAt must be YYYY-MM-DD")
  .refine(isRealCalendarDate, "paidAt must be a real calendar date");
```

- [ ] **Step 4: Use it in the three schemas**

In each of `lib/validations/transport.ts`, `lib/validations/item.ts`, `lib/validations/accommodation.ts`:

Add the import (keep the existing `zod` and `@/lib/currencies` imports):

```ts
import { MAX_AMOUNT_MINOR, paidAtDateOnlySchema } from "@/lib/validations/cost";
```

Replace both occurrences of `.max(2_147_483_647, "Amount is too large")` with `.max(MAX_AMOUNT_MINOR, "Amount is too large")`.

Replace the `paidAt` field:

```ts
  /** ISO date string for when the cost was paid. Optional. */
  paidAt: paidAtDateOnlySchema.nullable().optional(),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `TZ=UTC npx vitest run lib/validations/`
Expected: PASS, every file under `lib/validations/`.

- [ ] **Step 6: Typecheck, full suite and lint**

Run: `npx tsc --noEmit`, then `npm test`, then `npm run lint`. All green. If a server-action test now fails because it sent an impossible `paidAt`, the test was asserting the bug — fix the fixture, not the schema.

- [ ] **Step 7: Commit**

```bash
git add lib/validations/cost.ts lib/validations/transport.ts lib/validations/item.ts lib/validations/accommodation.ts lib/validations/transport.test.ts lib/validations/item.test.ts lib/validations/accommodation.test.ts
git commit -m "fix(validations): share paidAt's calendar check and the amount cap

Three inline schemas checked paidAt's shape but not that the date exists, and
each hardcoded the int cap instead of importing MAX_AMOUNT_MINOR.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: a failed queue write must not produce a permanent "discarded" toast (FN-07, P2)

`lib/feedback-queue.ts:61-67` — `write()` catches a `localStorage.setItem` failure (quota, private mode) and silently returns `readQueue()`, i.e. the queue as it actually is, which still contains the note. `flushQueue` (`:134`) calls `removeFromQueue(note.clientKey)` and throws the return value away, then unconditionally pushes to `discarded` on a `rejected` outcome. With storage full or blocked, the note stays queued, so the next flush attempts it, discards it, and shows the "discarded" toast again — every time, forever.

**Files:**
- Modify: `lib/feedback-queue.ts:126-138` (`flushQueue`'s loop)
- Test: `lib/feedback-queue.test.ts`

**Interfaces:**
- Consumes: `removeFromQueue(clientKey: string): QueuedFeedbackNote[]` — already returns the post-write queue as actually persisted. No signature change.
- Produces: no new exports. `flushQueue`'s `FlushResult` shape is unchanged; only its loop-exit behaviour changes.

- [ ] **Step 1: Write the failing test**

Add to `lib/feedback-queue.test.ts`, inside (or next to) the existing `describe("flushQueue", ...)`:

```ts
  it("stops rather than announcing a discard it could not make stick", async () => {
    // FN-07: with storage full, removeFromQueue's write silently no-ops, so
    // the note is still queued. Reporting it as discarded means the next
    // flush re-attempts it, re-discards it, and re-toasts — forever.
    enqueue(note({ clientKey: "fk_a" }));
    const setItem = vi
      .spyOn(window.localStorage.__proto__, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    const result = await flushQueue(async () => "rejected");

    expect(result.discarded).toEqual([]);
    expect(result.sent).toBe(0);
    // Still queued, because the removal never persisted.
    expect(result.remaining).toBe(1);
    expect(readQueue().map((n) => n.clientKey)).toEqual(["fk_a"]);

    setItem.mockRestore();
  });

  it("still reports a discard when the removal really persisted", async () => {
    enqueue(note({ clientKey: "fk_a" }));

    const result = await flushQueue(async () => "rejected");

    expect(result.discarded.map((n) => n.clientKey)).toEqual(["fk_a"]);
    expect(result.remaining).toBe(0);
    expect(readQueue()).toEqual([]);
  });
```

If `vi` is not already imported in that file, add it to the existing `from "vitest"` import.

- [ ] **Step 2: Run the tests to verify the first one fails**

Run: `TZ=UTC npx vitest run lib/feedback-queue.test.ts`
Expected: `"stops rather than announcing a discard it could not make stick"` FAILS — `result.discarded` contains one note even though it is still in storage. The second test passes already.

- [ ] **Step 3: Make `flushQueue` check the removal landed**

In `lib/feedback-queue.ts`, replace the body of the `for` loop's tail:

```ts
    if (outcome === "transient") break;
    removeFromQueue(note.clientKey);
    if (outcome === "rejected") discarded.push(note);
    else sent++;
```

with:

```ts
    if (outcome === "transient") break;

    // `write` returns what is ACTUALLY persisted: on a storage failure
    // (quota, private mode) it silently returns the unchanged queue. Trusting
    // the removal there means announcing a discard that did not happen, so
    // the next flush re-attempts the note, re-discards it, and re-toasts —
    // every time, forever (FN-07). Treat an unpersisted removal like a
    // transient failure: stop, keep the note, say nothing.
    const after = removeFromQueue(note.clientKey);
    if (after.some((q) => q.clientKey === note.clientKey)) break;

    if (outcome === "rejected") discarded.push(note);
    else sent++;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `TZ=UTC npx vitest run lib/feedback-queue.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green — `components/feedback/feedback-launcher.test.tsx` exercises `flushQueue` through the panel, so watch that file in particular.

- [ ] **Step 6: Commit**

```bash
git add lib/feedback-queue.ts lib/feedback-queue.test.ts
git commit -m "fix(feedback): do not announce a discard the queue could not persist

removeFromQueue silently no-ops when localStorage is full or blocked, so a
rejected note was re-attempted, re-discarded and re-toasted on every flush.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Feedback panel — close the test gaps (FN-11, FP-10, FP-11, P2)

Three holes in `components/feedback/feedback-launcher.test.tsx`:

- **FN-11** — the in-app delete path is untested. `deleteMock` (aliased to `deleteFeedbackNote`) is imported at line 24 and never invoked or asserted anywhere in the file; existing tests only assert the Delete button *renders* when `canDelete` (e.g. line 500). `server/actions/feedback.test.ts:165-192` covers only the server-action layer.
- **FP-10** — the module-level `MediaQueryList` cache (`feedback-launcher.tsx:90-91`, `cachedMatchMediaFn` / `cachedDockedMql`) is never reset. The `beforeEach` at `:109-128` resets `localStorage`, pathname, online state and the list/create mocks, but not the cache. Harmless today; a trap for the next test added.
- **FP-11** — `stubViewport(dockedFromMd)` at `:72-92` stubs `window.matchMedia` as `(() => mql)`, discarding the query. A typo in `DOCKED_FROM` (`feedback-launcher.tsx:75`) would still pass every test.

**Files:**
- Modify: `components/feedback/feedback-launcher.tsx:75` — export `DOCKED_FROM` (one word: add `export`)
- Test: `components/feedback/feedback-launcher.test.tsx`

**Interfaces:**
- Consumes: `deleteFeedbackNote` (already mocked as `deleteMock` at the top of the test file), `FeedbackNoteView` from `@/server/actions/feedback`.
- Produces: **`DOCKED_FROM`**, exported from `components/feedback/feedback-launcher.tsx` as `export const DOCKED_FROM = "(min-width: 768px)";`. Task 15 also edits both of these files — see the shared-surface register. Task 15 changes `FeedbackNoteView.authorId` to `canDelete`, which will change the `existingNote` fixture the delete test below uses; that is Task 15's job, not yours.

- [ ] **Step 1: Write the failing tests**

Add all three to `components/feedback/feedback-launcher.test.tsx`.

FN-11 — the delete path, inside the main `describe("FeedbackLauncher", ...)`. `existingNote` has `authorId: "u2"`, so pass `currentUserId="u2"` to make the button appear:

```ts
  it("deletes a note you wrote and drops it from the log", async () => {
    // FN-11: the Delete button's rendering was covered; pressing it never was.
    deleteMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<FeedbackLauncher currentUserId="u2" />);

    await user.click(screen.getByRole("button", { name: /feedback/i }));
    expect(await screen.findByText("Budget totals look wrong")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /delete "Budget totals look wrong"/i }),
    );

    expect(deleteMock).toHaveBeenCalledWith("n1");
    await waitFor(() =>
      expect(screen.queryByText("Budget totals look wrong")).not.toBeInTheDocument(),
    );
  });
```

FP-11 — the stub must honour its query. First extract the MediaQueryList into a named factory. There is no existing named factory to reuse: `stubViewport`'s `mql` (`:75-92`) is an inline object literal, and `listenerCount()` belongs to the *control* object `stubViewport` returns (`:97-106`), not to the MQL itself. Pull the object literal out into:

```ts
function makeMql(matches: boolean, media: string) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  let current = matches;
  return {
    get matches() {
      return current;
    },
    media,
    // Same surface as test/setup.ts's default matchMedia stub (onchange,
    // addListener/removeListener, dispatchEvent) — this replaces that stub in
    // this file's beforeEach for every test, including the Radix sheet
    // renders that never call stubViewport, so it must not be thinner.
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: (
      event: string,
      cb: (event: { matches: boolean }) => void,
    ) => {
      if (event === "change") listeners.add(cb);
    },
    removeEventListener: (
      event: string,
      cb: (event: { matches: boolean }) => void,
    ) => {
      if (event === "change") listeners.delete(cb);
    },
    dispatchEvent: vi.fn(),
    setMatches(next: boolean) {
      current = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
    /** How many `change` listeners are currently registered — proves cleanup ran. */
    listenerCount() {
      return listeners.size;
    },
  };
}
```

Rewrite `stubViewport` to build both its lists from `makeMql` and return the docked one directly — it now carries `setMatches`/`listenerCount` itself, so every existing call site in this file (`viewport.setMatches(...)`, `viewport.listenerCount()`) keeps working unchanged:

```ts
function stubViewport(dockedFromMd: boolean) {
  const mql = makeMql(dockedFromMd, DOCKED_FROM);
  const nonMatching = makeMql(false, "");
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      nonMatching.media = query;
      // FP-11: honour the query. Stubbing `() => mql` regardless of what was
      // asked meant a typo in DOCKED_FROM — or drift from sheet.tsx's `md:`
      // classes — still passed every test.
      return query === DOCKED_FROM ? mql : nonMatching;
    }),
  );
  return mql;
}
```

Also import the real constant instead of the local copy at line 43:

```ts
import { FeedbackLauncher, DOCKED_FROM } from "@/components/feedback/feedback-launcher";
```

(delete the local `const DOCKED_FROM = "(min-width: 768px)";` at line 43 and its comment — the whole point is to stop duplicating the literal). Then add:

```ts
  it("reads the docked breakpoint the sheet actually uses", () => {
    // If DOCKED_FROM ever drifts from components/ui/sheet.tsx's `md:` classes
    // (or from calendar-views.tsx's duplicated literal), this is the assertion
    // that notices.
    expect(DOCKED_FROM).toBe("(min-width: 768px)");
  });

  it("asks matchMedia for the exact query it was given, not a fixed answer", () => {
    // FP-11: stubViewport used to hand back the same MediaQueryList for every
    // query — `(() => mql)` — so a typo in DOCKED_FROM, or drift from
    // sheet.tsx's `md:` classes, would still pass every test. This pair only
    // passes once the query is actually honoured.
    stubViewport(true);
    expect(window.matchMedia(DOCKED_FROM).matches).toBe(true);
    expect(window.matchMedia("(min-width: 9999px)").matches).toBe(false);
  });
```

FP-10 — make the cache reset structural rather than accidental. In the file's `beforeEach` (`:109-128`), add a default `matchMedia` stub as the first statement:

```ts
  // FP-10: feedback-launcher.tsx caches its MediaQueryList against the
  // *current* window.matchMedia function reference. Installing a fresh stub
  // every test invalidates that cache by construction, so a test that never
  // calls stubViewport cannot inherit the previous test's media list.
  vi.stubGlobal("matchMedia", vi.fn(() => makeMql(false, "")));
```

and add a test that pins it. It must actually render `FeedbackLauncher` and open the panel — that is what calls `getDockedMql()` and populates the module-level cache (`feedback-launcher.tsx:90-91`). Calling `window.matchMedia` directly, as the version below replaces, never reaches that cache at all: two different stub factories always return different objects, so `not.toBe` would hold even with the cache-invalidation check deleted entirely.

```ts
  it("does not carry a cached media list between tests", async () => {
    // The cache lives at module scope (cachedMatchMediaFn / cachedDockedMql)
    // and is invalidated by comparing the *current* window.matchMedia
    // reference against the one last cached. Only the real component reaches
    // that comparison, via getDockedMql() — so render through it rather than
    // calling window.matchMedia directly.
    const user = userEvent.setup();
    const firstMatchMedia = window.matchMedia as ReturnType<typeof vi.fn>;
    const { unmount } = render(<FeedbackLauncher />);
    await user.click(screen.getByRole("button", { name: /feedback/i }));
    expect(firstMatchMedia).toHaveBeenCalledWith(DOCKED_FROM);
    unmount();

    stubViewport(true);
    const secondMatchMedia = window.matchMedia as ReturnType<typeof vi.fn>;
    render(<FeedbackLauncher />);
    await user.click(screen.getByRole("button", { name: /feedback/i }));
    // If the module-level cache had survived the swap to a new matchMedia
    // function reference, this second call would never happen — the
    // component would keep reading the first render's stale MediaQueryList.
    expect(secondMatchMedia).toHaveBeenCalledWith(DOCKED_FROM);
    expect(secondMatchMedia).not.toBe(firstMatchMedia);
  });
```

- [ ] **Step 2: Run the tests to verify the right ones fail**

Run: `TZ=UTC npx vitest run components/feedback/feedback-launcher.test.tsx`
Expected: `"deletes a note you wrote and drops it from the log"` FAILS first (nothing has ever pressed that button, so any wiring gap surfaces here). Until Step 3 exports the real constant, the imported `DOCKED_FROM` is `undefined`, so `"reads the docked breakpoint the sheet actually uses"` fails on that alone — an import-shape failure, not evidence about `stubViewport`. Don't read anything into the query-honouring test's result at this point either way; re-run after Step 3 (Step 4) to see `"asks matchMedia for the exact query it was given, not a fixed answer"` pass or fail for the real reason.

- [ ] **Step 3: Export `DOCKED_FROM`**

In `components/feedback/feedback-launcher.tsx:75`, change:

```ts
const DOCKED_FROM = "(min-width: 768px)";
```
to:
```ts
export const DOCKED_FROM = "(min-width: 768px)";
```

Leave the surrounding docblock as it is. **Do not change any other line of `feedback-launcher.tsx` in this task** — Task 15 owns the rest of that file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `TZ=UTC npx vitest run components/feedback/feedback-launcher.test.tsx`
Expected: PASS, whole file. If the delete test fails because the list does not re-render after a successful delete, that is a real defect in `handleDelete` (`feedback-launcher.tsx:446`) — fix it, and say so in the commit body.

- [ ] **Step 5: Prove each new test has teeth**

A coverage test that cannot fail is the defect this item is about, so verify each one the only way available. Not committed, one at a time — then revert and confirm green again before moving to the next:
- FN-11: in `handleDelete` (`feedback-launcher.tsx:446`), comment out the state update that drops the deleted note from the log. Re-run the file; `"deletes a note you wrote and drops it from the log"` must fail on the `waitFor` assertion.
- FP-11: in `stubViewport`, revert the query-aware `matchMedia` stub back to `vi.fn(() => mql)` — ignoring the query, as before this task. Re-run; `"asks matchMedia for the exact query it was given, not a fixed answer"` must fail (the second assertion comes back `true`).
- FP-10: in `getDockedMql` (`feedback-launcher.tsx:99`), change the cache-invalidation check from `window.matchMedia !== cachedMatchMediaFn` to `!cachedDockedMql` — cache forever once populated, regardless of which `matchMedia` is current. Re-run; `"does not carry a cached media list between tests"` must fail on the second `toHaveBeenCalledWith` assertion.

Confirm with `git status` that `feedback-launcher.tsx` shows only the Step 3 `export` change before committing.

- [ ] **Step 6: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green.

- [ ] **Step 7: Commit**

```bash
git add components/feedback/feedback-launcher.tsx components/feedback/feedback-launcher.test.tsx
git commit -m "test(feedback): cover the delete path and make the viewport stub honest

Pressing Delete was never exercised, stubViewport discarded the query it was
handed, and the module-level media-list cache was never reset between tests.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: make the guide's drift guard capable of failing (HG-09, P2)

`lib/help-guide.test.ts:182-188` checks `sources.some((s) => s.text.includes(label) || s.text.includes(curly))` — a plain substring test. Two consequences, both demonstrated rather than theoretical:

- `GUIDE_UI_STRINGS` contains both `"Booking reference"` and `"Booking reference / number"`, so the shorter entry is **unfailable by construction**: it passes on the strength of the longer one.
- Correction C6 (source doc lines 621-627) passed this guard while the guide misquoted the variant banner, because `"Editing variant"` passed as a substring of the true on-screen string `Editing variant "{variantName}"`.

Two changes close both: match whole phrases rather than substrings, and forbid one entry from shadowing another. **This has been measured against the real source tree: exactly one label (`"Editing variant"`) newly fails under whole-phrase matching, and exactly one (`"Booking reference"`) is shadowed.** Both are removed in step 5 — expect no others.

**Files:**
- Modify: `lib/help-guide.ts:205-270` (add the matcher; remove two list entries; extend the docblock)
- Test: `lib/help-guide.test.ts:128-200`

**Interfaces:**
- Consumes: `GUIDE_UI_STRINGS` (already exported from `lib/help-guide.ts:205`).
- Produces: **`guideLabelOnScreen(text: string, label: string): boolean`**, exported from `lib/help-guide.ts`. True when `label` occurs in `text` as a complete phrase — that is, at some index where the character immediately following it is absent or is not one of `[A-Za-z0-9 /'’-]`. No later task uses it.

- [ ] **Step 1: Write the failing tests**

Add to `lib/help-guide.test.ts`. First, unit tests for the matcher (these are exact and must pass as written):

```ts
describe("guideLabelOnScreen", () => {
  it("matches a label that ends at a quote", () => {
    expect(guideLabelOnScreen('aria-label="Add transport"', "Add transport")).toBe(true);
  });

  it("matches a label that ends at a JSX tag", () => {
    expect(guideLabelOnScreen("<span>Start time</span>", "Start time")).toBe(true);
  });

  it("matches a label that ends at sentence punctuation", () => {
    expect(guideLabelOnScreen("nothing in this plan.", "in this plan")).toBe(true);
  });

  it("does NOT match a label that is only the head of a longer phrase", () => {
    // The whole bug: "Booking reference" passed on the strength of
    // "Booking reference / number", and "Editing variant" passed on the
    // strength of the banner's interpolated string.
    expect(guideLabelOnScreen('"Booking reference / number"', "Booking reference")).toBe(false);
  });

  it("does NOT match a label the source merely starts a word with", () => {
    expect(guideLabelOnScreen("Add transported goods", "Add transport")).toBe(false);
  });

  it("matches the last of several occurrences when only that one terminates", () => {
    expect(
      guideLabelOnScreen('Booking reference / number and "Booking reference"', "Booking reference"),
    ).toBe(true);
  });

  it("is false for a label that never appears", () => {
    expect(guideLabelOnScreen("nothing here", "Add transport")).toBe(false);
  });
});
```

Second, the meta-guard, next to the existing drift-guard describe:

```ts
describe("drift guard: the list itself", () => {
  it("has no entry that is a substring of another entry", () => {
    // An entry contained in a longer entry is unfailable by construction: the
    // longer one's own occurrence satisfies it, so the shorter one can never
    // catch a rename. Delete the shorter one instead (HG-09).
    const shadowed = GUIDE_UI_STRINGS.filter((a) =>
      GUIDE_UI_STRINGS.some((b) => b !== a && b.includes(a)),
    );
    expect(shadowed).toEqual([]);
  });
});
```

Third, swap the drift guard's matcher. Replace the body of the `it.each(GUIDE_UI_STRINGS)` test at `:182-188` with:

```ts
  it.each(GUIDE_UI_STRINGS)(
    "the guide quotes %s, and it is still on screen as a whole phrase",
    (label) => {
      // Curly apostrophes render identically; accept either form.
      const curly = label.replaceAll("'", "’");
      const found = sources.some(
        (s) => guideLabelOnScreen(s.text, label) || guideLabelOnScreen(s.text, curly),
      );
      expect(
        found,
        `the guide quotes "${label}" but no file under components/ or app/ contains it as a complete phrase — either the control was renamed, the guide is quoting only part of the real label, or the guide should stop quoting it`,
      ).toBe(true);
    },
  );
```

Add `guideLabelOnScreen` to the existing `from "./help-guide"` import at the top of the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TZ=UTC npx vitest run lib/help-guide.test.ts`
Expected: the `guideLabelOnScreen` unit tests FAIL (no such export). The meta-guard FAILS with `["Booking reference"]`.

- [ ] **Step 3: Implement the matcher**

Add to `lib/help-guide.ts`, immediately above `export const GUIDE_UI_STRINGS`:

```ts
/**
 * True when `label` appears in `text` as a COMPLETE phrase, not merely as a
 * substring.
 *
 * A plain `includes` let two things through. `"Booking reference"` passed on
 * the strength of the longer `"Booking reference / number"` also in the list,
 * so it could never fail; and correction C6 shipped a guide that misquoted the
 * variant banner because `"Editing variant"` passed as a substring of the
 * banner's real, interpolated string. A guard that has already failed to catch
 * a shipped defect is not a guard.
 *
 * "Complete" means: the character immediately after the occurrence is either
 * absent, or one that cannot continue the same on-screen phrase — a quote, an
 * angle bracket, a brace, punctuation, a newline. Letters, digits, spaces,
 * slashes, apostrophes and hyphens all continue a phrase, so an occurrence
 * followed by one of those does not count.
 */
const PHRASE_CONTINUES = /[A-Za-z0-9 /'’-]/;

export function guideLabelOnScreen(text: string, label: string): boolean {
  let i = text.indexOf(label);
  while (i !== -1) {
    const after = text[i + label.length];
    if (after === undefined || !PHRASE_CONTINUES.test(after)) return true;
    i = text.indexOf(label, i + 1);
  }
  return false;
}
```

- [ ] **Step 4: Run the unit tests to verify the matcher passes**

Run: `TZ=UTC npx vitest run lib/help-guide.test.ts -t guideLabelOnScreen`
Expected: PASS, all seven.

- [ ] **Step 5: Reconcile the two entries the new rules reject**

In `GUIDE_UI_STRINGS`, delete the line `"Booking reference",` (shadowed by `"Booking reference / number"`, which covers the same control) and the line `"Editing variant",` (the banner at `components/trip/variant-banner.tsx:19` renders `Editing variant "{variantName}"` — an interpolated string with no complete phrase to assert; the guide's wording there is already pinned by the `"does not quote the variant banner as text the app never renders"` test in `components/trip/help-guide.test.tsx:268-275`).

Extend the list's docblock, in the paragraph that already records deliberate exclusions, adding:

```
 * Also deliberately excluded: a phrase that is only the head of a longer live
 * string. "Booking reference" is covered by "Booking reference / number", and
 * the variant banner interpolates the variant's name, so "Editing variant" has
 * no complete on-screen phrase to assert — its wording is pinned by
 * components/trip/help-guide.test.tsx instead. Entries must be whole phrases
 * and must not contain one another (both are enforced by lib/help-guide.test.ts).
```

- [ ] **Step 6: Run the tests to verify they all pass**

Run: `TZ=UTC npx vitest run lib/help-guide.test.ts components/trip/help-guide.test.tsx`
Expected: PASS. If any label other than the two above now fails the whole-phrase guard, it is genuinely misquoted — correct the entry to the full live string, or remove it and note why in the docblock. Do not weaken `PHRASE_CONTINUES` to make a label pass.

- [ ] **Step 7: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green.

- [ ] **Step 8: Commit**

```bash
git add lib/help-guide.ts lib/help-guide.test.ts
git commit -m "test(help): make the guide's drift guard capable of failing

The guard was a substring test, so an entry contained in another entry could
never fail — and a real misquote of the variant banner shipped through it.
Matches whole phrases now, and forbids one entry shadowing another.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: assert the access guard runs before the write in five action tests (CD-01, P2)

`server/actions/chapters.test.ts`, `stops.test.ts`, `firm-up-trip.test.ts`, `cover.test.ts` and `activity.test.ts` each mock `requireTripAccess` but none imports or calls `expectAccessCheckedBeforeWrite`; eighteen other action test files do. **This is not a live vulnerability** — the production actions all guard correctly. It is the coverage hole that would let a guard silently move below its write. Add the assertion to the five files. No new infrastructure.

**Files:**
- Test: `server/actions/chapters.test.ts`
- Test: `server/actions/stops.test.ts`
- Test: `server/actions/firm-up-trip.test.ts`
- Test: `server/actions/cover.test.ts`
- Test: `server/actions/activity.test.ts`

**Interfaces:**
- Consumes: `expectAccessCheckedBeforeWrite(access: Mock, write: Mock): void` from `@/test/helpers/access-order`. **It already exists at `test/helpers/access-order.ts` — import it by exact name, do not rewrite it.** It reads `mock.invocationCallOrder[0]` on both mocks and asserts the guard's call came first.
- Produces: nothing. Test-only.

- [ ] **Step 1: Write the new tests**

Add `import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";` as the second import line of each of the five files, then add one test per file. Each goes inside the named `describe` and uses the mocks that file already defines.

`server/actions/chapters.test.ts` — inside `describe("createChapter", ...)`:

```ts
  it("is access-checked before the write", async () => {
    chapterFindManyMock.mockResolvedValue([]);
    chapterCreateMock.mockResolvedValue({ id: "c1", name: "Italy", colour: "rose" });

    await createChapter("trip-1", VALID);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
    expectAccessCheckedBeforeWrite(requireTripAccessMock, chapterCreateMock);
  });
```

`server/actions/stops.test.ts` — inside `describe("createStop", ...)`:

```ts
  it("is access-checked before the write", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    stopCreateMock.mockResolvedValue({ id: "stop-1" });

    await createStop("trip-1", VALID_INPUT);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
    expectAccessCheckedBeforeWrite(requireTripAccessMock, stopCreateMock);
  });
```

`server/actions/firm-up-trip.test.ts` — inside `describe("firmUpTrip", ...)`:

```ts
  it("is access-checked before the write", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", endDate: null });
    stopFindManyMock.mockResolvedValue([roughRow("a", 0, 3)]);

    await firmUpTrip("trip-1");

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
    expectAccessCheckedBeforeWrite(requireTripAccessMock, stopUpdateMock);
  });
```

`server/actions/cover.test.ts` — inside `describe("setTripCover", ...)`:

```ts
  it("is access-checked before the write", async () => {
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: null });

    await setTripCover(makeFormData());

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, tripUpdateMock);
  });
```

`server/actions/activity.test.ts` — inside `describe("markAllRead", ...)`:

```ts
  it("is access-checked before the write", async () => {
    await markAllRead(TRIP_ID);

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, tripMemberUpdateManyMock);
  });
```

- [ ] **Step 2: Run them and confirm they pass**

Run: `TZ=UTC npx vitest run server/actions/chapters.test.ts server/actions/stops.test.ts server/actions/firm-up-trip.test.ts server/actions/cover.test.ts server/actions/activity.test.ts`
Expected: PASS. These pin behaviour that is already correct, so passing immediately is the expected outcome — which is why step 3 exists.

- [ ] **Step 3: Prove each new test has teeth**

A coverage test that cannot fail is the defect this item is about, so verify each one the only way available. For **one file at a time**: in the production action, temporarily move the `await requireTripAccess(...)` call to *after* the write (or comment it out), re-run only that file, and confirm the new test FAILS with the helper's `expected the access guard to run before the write` message. Then `git checkout -- <the production file>` and re-run to confirm it is green again.

The four production files are `server/actions/chapters.ts`, `server/actions/stops.ts` (which also holds `firmUpTrip`, at `:864`), `server/actions/cover.ts`, `server/actions/activity.ts`. **Nothing from this step gets committed** — verify with `git status` that only the five `*.test.ts` files are modified before committing.

- [ ] **Step 4: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green.

- [ ] **Step 5: Commit**

```bash
git add server/actions/chapters.test.ts server/actions/stops.test.ts server/actions/firm-up-trip.test.ts server/actions/cover.test.ts server/actions/activity.test.ts
git commit -m "test(actions): assert the guard runs before the write in five more files

Eighteen action test files already used expectAccessCheckedBeforeWrite; these
five mocked requireTripAccess without ever asserting its ordering.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: three uncovered edge cases in the Digest dispatch path (CD-10, P2)

Three distinct gaps, in two files:

1. **Zone tie-break untested.** The documented first-row-wins tie-break is at `app/api/cron/digest/route.ts:202-212` — `if (!best || s.lastSeenAt > best.lastSeenAt)`, strict `>`, so the first row the scan returned keeps its spot on a tie. Both existing zone-election tests (`route.test.ts:585`, `:610`) use *distinct* `lastSeenAt` values; nothing passes two Devices with an identical one. **File-citation correction:** the tie-break is in `app/api/cron/digest/route.ts`, not `lib/digest-dispatch.ts` as the source doc says.
2. **`slot` omitted from the `console.error` assertions.** `lib/digest-dispatch.ts:627-630` and `:683-686` both log `{ userId, tripId, localDate, slot }`, but the assertions at `lib/digest-dispatch.test.ts:314-317` and `:498-501` use `expect.objectContaining({ userId, tripId, localDate })` with no `slot` key — dropping `slot` from the real payload would fail neither test.
3. **No compound throw + release-failure test.** The suite covers a mid-flight throw releasing the claim, and a release delete failing, separately — never both at once.

**Files:**
- Test: `app/api/cron/digest/route.test.ts` (gap 1)
- Test: `lib/digest-dispatch.test.ts:314-317`, `:498-501` (gap 2) and a new test (gap 3)

**Interfaces:**
- Consumes: the test files' existing helpers — `req({ secret })` and `GET` in `route.test.ts`; `dispatch(over?)` (`lib/digest-dispatch.test.ts:195-203`), `USER_ID = "user-1"`, `TRIP_ID = "trip-1"`, `LOCAL_DATE = "2026-12-01"`, `digestDispatchDeleteMock`, `costFindManyMock`, `sendPushMock`.
- Produces: nothing. Test-only.

- [ ] **Step 1: Write gap 1 — the zone tie-break**

Add to `app/api/cron/digest/route.test.ts`, immediately after the `"ignores a device with no stored zone when picking the person's clock"` test:

```ts
  it("keeps the first row's zone when two Devices share a lastSeenAt to the millisecond", async () => {
    // The tie-break is `>`, strictly: on an exact tie the first row the scan
    // returned keeps its spot. That is a deterministic pick, not a
    // correct-by-clock one — an identical lastSeenAt gives no real signal —
    // and it is only deterministic if nothing later re-elects. Both zones
    // below are UTC+1 in December, so 19:00Z is 20:00 local for either: the
    // dispatch happens whichever wins, and only the `zone` argument says which.
    vi.setSystemTime(new Date("2026-12-01T19:00:00.000Z"));
    const tie = new Date("2026-12-01T18:00:00Z");
    pushFindManyMock.mockResolvedValue([
      { userId: "u1", timezone: "Europe/Berlin", lastSeenAt: tie },
      { userId: "u1", timezone: "Europe/Paris", lastSeenAt: tie },
    ]);
    tripMemberFindManyMock.mockResolvedValue([{ tripId: "trip-1" }]);
    dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false });

    await GET(req({ secret: "right" }));

    expect(dispatchDigestMock).toHaveBeenCalledTimes(1);
    expect(dispatchDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", zone: "Europe/Berlin" }),
    );
  });
```

- [ ] **Step 2: Write gap 2 — pin `slot` in both log assertions**

In `lib/digest-dispatch.test.ts`, in the test `"does not retry a release delete that already failed"` (~line 314), change:

```ts
      expect.objectContaining({ userId: USER_ID, tripId: TRIP_ID, localDate: LOCAL_DATE }),
```
to:
```ts
      // `slot` is what tells a morning failure from an evening one in the
      // logs; without it here, dropping it from the real payload fails
      // nothing (CD-10).
      expect.objectContaining({
        userId: USER_ID,
        tripId: TRIP_ID,
        localDate: LOCAL_DATE,
        slot: "EVENING",
      }),
```

Make the identical change in `"does not retry a release delete that already failed on the zero-delivery path"` (~line 498). That second site's logged object also carries `subscriptions`, so add `subscriptions: 1` to its `objectContaining` as well.

- [ ] **Step 3: Write gap 3 — a throw whose release also fails**

Add to `lib/digest-dispatch.test.ts`, immediately after `"releases the claim when collecting the digest throws"`:

```ts
  it("surfaces the original error when the claim release ALSO fails", async () => {
    // Covered separately today: a mid-flight throw releasing the claim, and a
    // release delete failing. Never both. Together is the bad case — the
    // release failure must be logged, and must not replace or bury the error
    // the caller actually needs to see and count (CD-10).
    const collectError = new Error("db went away");
    const deleteError = new Error("delete failed");
    costFindManyMock.mockRejectedValueOnce(collectError);
    digestDispatchDeleteMock.mockRejectedValueOnce(deleteError);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(dispatch()).rejects.toThrow("db went away");

    // Released exactly once — the failed delete is not retried on the same row.
    expect(digestDispatchDeleteMock).toHaveBeenCalledTimes(1);
    // And the stranded claim is visible to an operator.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("release"),
      expect.objectContaining({
        userId: USER_ID,
        tripId: TRIP_ID,
        localDate: LOCAL_DATE,
        slot: "EVENING",
      }),
      deleteError,
    );
    expect(sendPushMock).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });
```

- [ ] **Step 4: Run the tests**

Run: `TZ=UTC npx vitest run "app/api/cron/digest/route.test.ts" lib/digest-dispatch.test.ts`
Expected: PASS. All three pin behaviour that is already correct, so step 5 is how you prove they can fail.

- [ ] **Step 5: Prove each has teeth**

One at a time, and **commit none of these edits**:
- Gap 1: change `s.lastSeenAt > best.lastSeenAt` to `>=` at `app/api/cron/digest/route.ts:207`. The new test must fail with `zone: "Europe/Paris"`. Revert.
- Gap 2: delete `slot` from the logged object at `lib/digest-dispatch.ts:629` and again at `:685`. Each corresponding test must fail. Revert.
- Gap 3: in `releaseClaim`'s `catch`, change `console.error(...)` to a bare `{}`. The new test must fail on the `errorSpy` assertion. Revert.

Confirm with `git status` that only the two `*.test.ts` files are modified.

- [ ] **Step 6: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green.

- [ ] **Step 7: Commit**

```bash
git add "app/api/cron/digest/route.test.ts" lib/digest-dispatch.test.ts
git commit -m "test(digest): cover the zone tie-break, the logged slot, and a failed release

Adds the millisecond-tie zone election, pins slot in both dispatch error logs,
and covers a mid-flight throw whose claim release also fails.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: cron-health coverage — the page-level crash path and the untested `formatLastRun` branches (CD-13, CD-14, P2)

- **CD-13** — `server/actions/cron-health.test.ts:91-99` unit-tests `getDispatcherHealth` against a rejected `findUnique`, but `app/(app)/account/page.test.tsx`'s `beforeEach` (`:38-43`) only ever sets `cronHeartbeatFindUniqueMock.mockResolvedValue(null)`. No test makes it reject, so nothing asserts at page level that `AccountPage`'s `Promise.all` survives a `CronHeartbeat` read failure without taking the Device list down with it. Sufficient by construction today (the error is swallowed inside `getDispatcherHealth`), but unpinned.
- **CD-14** — `lib/cron-health.ts:36-48` has three return branches beyond the stale-date one: `hours >= 1` plural, the implicit singular `hours === 1`, and the `hours < 1` fallback (`"last ran just now"`). `lib/cron-health.test.ts:30-42` tests only `null`, the stale-date branch, and one plural case.

**Files:**
- Test: `lib/cron-health.test.ts` (CD-14)
- Test: `app/(app)/account/page.test.tsx` (CD-13)

**Interfaces:**
- Consumes: `formatLastRun(lastRunAt: Date | null, now: Date): string` (`lib/cron-health.ts:36`); the page test's `cronHeartbeatFindUniqueMock`, and its existing `const now = new Date("2026-12-10T12:00:00Z")` fixture in the lib test.
- Produces: nothing. Test-only. **Task 22 changes `app/(app)/account/page.tsx` to pass a `now` prop down** — see the shared-surface register; that task must keep the test you add here green.

- [ ] **Step 1: Write the CD-14 tests**

Add to `lib/cron-health.test.ts`, inside `describe("formatLastRun", ...)`:

```ts
  it("says one hour in the singular", () => {
    // The `hours === 1` branch: `${hours} ${hours === 1 ? "hour" : "hours"}`.
    // Only the plural side was ever exercised, so "1 hours ago" would ship.
    expect(formatLastRun(new Date("2026-12-10T11:00:00Z"), now)).toBe("last ran 1 hour ago");
  });

  it("reads as 'just now' under the hour", () => {
    expect(formatLastRun(new Date("2026-12-10T11:30:00Z"), now)).toBe("last ran just now");
  });

  it("reads as 'just now' at the instant of the run", () => {
    // Math.max(0, ...) guards a clock that ran backwards; this is the 0 case.
    expect(formatLastRun(new Date("2026-12-10T12:00:00Z"), now)).toBe("last ran just now");
  });

  it("is still 'just now' one second short of the hour", () => {
    expect(formatLastRun(new Date("2026-12-10T11:00:01Z"), now)).toBe("last ran just now");
  });
```

- [ ] **Step 2: Write the CD-13 test**

Add to `app/(app)/account/page.test.tsx`, inside `describe("AccountPage", ...)`, after `"renders the dispatcher's last-run time once a heartbeat exists"`:

```ts
  it("still renders the Devices card when the CronHeartbeat read fails", async () => {
    // getDispatcherHealth swallows this today, so the page survives by
    // construction — but nothing said so at page level. A refactor that let
    // the throw out would take AccountPage's Promise.all, and with it the
    // whole Devices list, down: exactly the panel a Traveller is on when
    // working out why their Digests stopped (CD-13).
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    cronHeartbeatFindUniqueMock.mockRejectedValue(new Error("relation \"CronHeartbeat\" does not exist"));

    const jsx = await AccountPage();
    render(jsx);

    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.getByTestId("devices-panel")).toBeInTheDocument();
    expect(screen.getByText("Which trips send you a digest")).toBeInTheDocument();
    // "Never run" is the honest answer when the heartbeat cannot be read.
    expect(screen.getByText(/never run/i)).toBeInTheDocument();
    expect(screen.getByText(/digests are not being sent/i)).toBeInTheDocument();

    errorSpy.mockRestore();
  });
```

- [ ] **Step 3: Run the tests**

Run: `TZ=UTC npx vitest run lib/cron-health.test.ts "app/(app)/account/page.test.tsx"`
Expected: PASS. Both pin existing correct behaviour.

- [ ] **Step 4: Prove they have teeth**

Not committed, one at a time:
- CD-14: change `hours === 1 ? "hour" : "hours"` to just `"hours"` at `lib/cron-health.ts:47` — the singular test must fail. Change the final `return "last ran just now";` to `return "last ran 0 hours ago";` — the three "just now" tests must fail. Revert.
- CD-13: in `server/actions/cron-health.ts`, delete the `try`/`catch` around `db.cronHeartbeat.findUnique` so the rejection propagates — the new page test must fail (the whole page render rejects). Revert.

Confirm with `git status` that only the two test files are modified.

- [ ] **Step 5: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green.

- [ ] **Step 6: Commit**

```bash
git add lib/cron-health.test.ts "app/(app)/account/page.test.tsx"
git commit -m "test(cron-health): pin the singular hour, 'just now', and the page-level crash path

formatLastRun's singular and sub-hour branches were untested, and no page-level
test made the CronHeartbeat read fail.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: `CostAmounts` gates on truthiness, not on "is there a paid amount" (CP-17 / OPS-05, P3)

`components/trip/cost-amounts.tsx:33` and `:38` both use `paidTotalMinor > 0` — a truthiness gate, not a null check. A genuine paid amount of exactly `0` (paid, in full, for free — a comped hotel night, a zero-fare award flight) renders as the "nothing paid" placeholder `—` in muted grey, indistinguishable from a cost nobody has paid. **`CP-17` and `OPS-05` are the same defect**, found independently from the follow-up doc and from the audit doc; one fix closes both. It sits in the ordinary sweep, not in *Blocked*: no database is involved, the blocker was only that all 8 `CostAmounts` call sites (on the Budget and Summary pages) currently pass aggregates, so the triggering value has not arisen yet. The gate is directly readable.

**Files:**
- Modify: `components/trip/cost-amounts.tsx:9-18` (prop type) and `:33`, `:38` (the two gates)
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` (Step 5 — the aggregate `CostAmounts` call site(s) on this page). Task 4 touches this same file first — see the shared-surface register.
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx` (Step 5 — the aggregate `CostAmounts` call site(s) on this page)
- Test: `components/trip/cost-amounts.test.tsx`

**Interfaces:**
- Consumes: `formatMoney(minor: number, currency: string): string` from `@/lib/money`.
- Produces: `CostAmounts`'s `paidTotalMinor` prop widens from `number` to `number | null`. All 8 existing call sites pass a `number`, so none breaks. No later task uses this.

- [ ] **Step 1: Write the failing tests**

Add to `components/trip/cost-amounts.test.tsx`, inside the existing `describe("CostAmounts", ...)`:

```ts
  it("shows a paid amount of exactly zero as money, not as the nothing-paid placeholder", () => {
    // CP-17 / OPS-05: `paidTotalMinor > 0` cannot tell "paid, and it was
    // free" from "nothing paid". A comped night is paid in full.
    render(<CostAmounts costTotalMinor={12300} paidTotalMinor={0} currency="AUD" />);
    const paid = screen.getByLabelText(/paid/i);
    expect(paid).toHaveTextContent("$0.00");
    expect(paid.className).toContain("text-emerald-600");
  });

  it("shows the placeholder only when there is no paid amount at all", () => {
    render(<CostAmounts costTotalMinor={12300} paidTotalMinor={null} currency="AUD" />);
    const paid = screen.getByLabelText(/paid/i);
    expect(paid).toHaveTextContent("—");
    expect(paid.className).toContain("text-muted-foreground");
  });
```

Two existing tests in that file assert the old behaviour for `paidTotalMinor={0}` — `"renders a '—' placeholder in the paid column when paid is 0 (columns stay aligned)"` and `"does not show the paid amount text when paid is 0 (just a placeholder)"`. Both were written against the bug. Change each to pass `paidTotalMinor={null}` and rename them to say `when there is no paid amount` instead of `when paid is 0`; keep their existing assertions (the column-alignment point they make is still worth pinning, it just belongs to `null` now).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TZ=UTC npx vitest run components/trip/cost-amounts.test.tsx`
Expected: `"shows a paid amount of exactly zero as money..."` FAILS — the cell renders `—`.

- [ ] **Step 3: Swap both gates for a null check**

In `components/trip/cost-amounts.tsx`, widen the prop:

```ts
  /**
   * Minor units paid, or `null` when nothing has been paid. Zero is a real
   * paid amount — a comped night, an award fare — and must read as money, not
   * as the placeholder (CP-17).
   */
  paidTotalMinor: number | null;
```

and replace both `paidTotalMinor > 0` occurrences with `paidTotalMinor !== null`:

```tsx
      <span
        aria-label="Paid"
        className={
          "text-right whitespace-nowrap" +
          (paidTotalMinor !== null
            ? " text-emerald-600 dark:text-emerald-400"
            : " text-muted-foreground")
        }
      >
        {paidTotalMinor !== null ? formatMoney(paidTotalMinor, currency) : "—"}
      </span>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `TZ=UTC npx vitest run components/trip/cost-amounts.test.tsx`
Expected: PASS.

- [ ] **Step 5: Check the call sites still compile and still read right**

Run: `grep -rn "CostAmounts" app/ components/ --include=*.tsx | grep -v test` — the 8 call sites live in `app/(app)/trips/[tripId]/budget/page.tsx` and `app/(app)/trips/[tripId]/summary/page.tsx`. They pass aggregate sums, which are `0` when nothing is paid, so they will now render `$0.00` instead of `—`. **That is a visible change on those pages and it is wrong for an aggregate** — an aggregate of zero means nothing was paid. At each call site, pass `paidTotalMinor={sum > 0 ? sum : null}` (using whatever the local expression is named) so the aggregate keeps reading as the placeholder while the component stops guessing on the caller's behalf. Add a one-line comment at the first such site saying why.

- [ ] **Step 6: Typecheck, full suite and lint**

Run: `npx tsc --noEmit`, then `npm test`, then `npm run lint`. All green.

- [ ] **Step 7: Commit**

```bash
git add components/trip/cost-amounts.tsx components/trip/cost-amounts.test.tsx "app/(app)/trips/[tripId]/budget/page.tsx" "app/(app)/trips/[tripId]/summary/page.tsx"
git commit -m "fix(budget): distinguish a zero paid amount from no paid amount

CostAmounts gated both the label and the colour on paidTotalMinor > 0, so a
comped night read as unpaid. The aggregate call sites now pass null explicitly.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: the two Feedback scripts (FN-06, FN-12, P3)

- **FN-06** — `scripts/feedback-resolve.ts:55` does `const existing = await db.feedbackNote.findUnique(...)`, and the `console.log(\`Database: ${targetHost()}\`)` echo is only at line 70. A mistyped id exits at the not-found check between them, so the operator is never told which database was consulted. That script normally writes **production**; "no note with that id" against an unnamed database is the exact moment you want the host printed.
- **FN-12** — the `rows.map((row) => ({ ... }))` at `scripts/feedback-pull.ts:62-75` is written inline in the script and has no test. `lib/feedback-inbox.ts` already exists and holds `renderInbox` and the `InboxNote` type.

**Files:**
- Modify: `scripts/feedback-resolve.ts:55-70`
- Modify: `scripts/feedback-pull.ts:62-76`
- Modify: `lib/feedback-inbox.ts` (add the mapper)
- Test: `lib/feedback-inbox.test.ts`

**Interfaces:**
- Consumes: `InboxNote` (already exported, `lib/feedback-inbox.ts:6`), `FEEDBACK_STATUSES` from `@/lib/enums`, `FeedbackStatus` from `@/lib/enums`.
- Produces: **`toInboxNote(row: FeedbackNoteRow): InboxNote`** and the exported row type **`FeedbackNoteRow`**, both from `lib/feedback-inbox.ts`. `FeedbackNoteRow` is the Prisma selection shape `scripts/feedback-pull.ts` already asks for:
  ```ts
  export type FeedbackNoteRow = {
    id: string; body: string; route: string; pageLabel: string;
    tripName: string | null; viewport: string | null; userAgent: string | null;
    status: string; authoredAt: Date; createdAt: Date;
    resolvedAt: Date | null; resolution: string | null;
    author: { name: string | null };
  };
  ```
  No later task uses either.

- [ ] **Step 1: Write the failing test for `toInboxNote`**

Add to `lib/feedback-inbox.test.ts`:

```ts
describe("toInboxNote", () => {
  const row = {
    id: "n1",
    body: "Budget totals look wrong",
    route: "/trips/t1/budget",
    pageLabel: "Budget",
    tripName: "Europe Summer 2026",
    viewport: "390x844",
    userAgent: "iPhone",
    status: "OPEN",
    authoredAt: new Date("2026-09-07T01:02:03.000Z"),
    createdAt: new Date("2026-09-07T04:05:06.000Z"),
    resolvedAt: null,
    resolution: null,
    author: { name: "Cam" },
  };

  it("carries every field across, unchanged", () => {
    expect(toInboxNote(row)).toEqual({
      id: "n1",
      body: "Budget totals look wrong",
      route: "/trips/t1/budget",
      pageLabel: "Budget",
      tripName: "Europe Summer 2026",
      authorName: "Cam",
      viewport: "390x844",
      userAgent: "iPhone",
      status: "OPEN",
      authoredAt: new Date("2026-09-07T01:02:03.000Z"),
      createdAt: new Date("2026-09-07T04:05:06.000Z"),
      resolvedAt: null,
      resolution: null,
    });
  });

  it("falls back to 'Traveller' when the author has no name", () => {
    expect(toInboxNote({ ...row, author: { name: null } }).authorName).toBe("Traveller");
  });

  it("keeps a recognised non-OPEN status", () => {
    expect(toInboxNote({ ...row, status: "WONTFIX" }).status).toBe("WONTFIX");
  });

  it("falls back to OPEN for a status the app does not recognise", () => {
    // A struck-through note with no badge explaining why is worse than an
    // unfamiliar word, and the row's `status` is a plain string from the DB.
    expect(toInboxNote({ ...row, status: "NONSENSE" }).status).toBe("OPEN");
  });

  it("preserves a resolution and its timestamp", () => {
    const resolved = toInboxNote({
      ...row,
      status: "DONE",
      resolvedAt: new Date("2026-09-09T00:00:00.000Z"),
      resolution: "fixed in 1a2b3c4",
    });
    expect(resolved.resolvedAt).toEqual(new Date("2026-09-09T00:00:00.000Z"));
    expect(resolved.resolution).toBe("fixed in 1a2b3c4");
  });
});
```

Add `toInboxNote` to the existing `from "./feedback-inbox"` import at the top of that test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `TZ=UTC npx vitest run lib/feedback-inbox.test.ts`
Expected: FAIL — `toInboxNote is not a function`.

- [ ] **Step 3: Extract the mapper into `lib/feedback-inbox.ts`**

Add below the `InboxNote` type. `lib/feedback-inbox.ts:1` currently has `import type { FeedbackStatus } from "@/lib/enums";` — a value cannot join a type-only import, so change that line to a regular import that still keeps `FeedbackStatus` as a type:

```ts
import { FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/enums";
```

```ts
/** The Prisma selection `scripts/feedback-pull.ts` reads. */
export type FeedbackNoteRow = {
  id: string;
  body: string;
  route: string;
  pageLabel: string;
  tripName: string | null;
  viewport: string | null;
  userAgent: string | null;
  status: string;
  authoredAt: Date;
  createdAt: Date;
  resolvedAt: Date | null;
  resolution: string | null;
  author: { name: string | null };
};

/**
 * One database row as the inbox sees it.
 *
 * Lived inline in `scripts/feedback-pull.ts`, where it could not be tested —
 * a field silently dropped from the mapping would have shown up only as a
 * missing line in a generated file nobody diffs closely (FN-12). `status`
 * comes back as a plain string, so an unrecognised one falls back to OPEN
 * rather than rendering as a struck-through note with no badge.
 */
export function toInboxNote(row: FeedbackNoteRow): InboxNote {
  return {
    id: row.id,
    body: row.body,
    route: row.route,
    pageLabel: row.pageLabel,
    tripName: row.tripName,
    authorName: row.author.name ?? "Traveller",
    viewport: row.viewport,
    userAgent: row.userAgent,
    status: (FEEDBACK_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as FeedbackStatus)
      : "OPEN",
    authoredAt: row.authoredAt,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolution: row.resolution,
  };
}
```

- [ ] **Step 4: Use it from the script**

In `scripts/feedback-pull.ts`, replace the whole `const notes = rows.map((row) => ({ ... }));` block (lines 62-76) with:

```ts
  const notes = rows.map(toInboxNote);
```

Change the import line `import { renderInbox } from "../lib/feedback-inbox";` to `import { renderInbox, toInboxNote } from "../lib/feedback-inbox";`, and delete the now-unused `import { FEEDBACK_STATUSES } from "../lib/enums";` if nothing else in the file uses it.

- [ ] **Step 5: Move the database echo above the lookup (FN-06)**

In `scripts/feedback-resolve.ts`, move the line

```ts
  console.log(`Database: ${targetHost()}`);
```

from line 70 to immediately after the argument-parsing block and **before** `const existing = await db.feedbackNote.findUnique(...)`, so it reads:

```ts
  // Printed BEFORE the lookup, not after: a mistyped id exits at the
  // not-found check below, and "no feedback note with id X" is exactly the
  // moment the operator needs to know which database was asked — this script
  // normally writes production (FN-06).
  console.log(`Database: ${targetHost()}`);

  const existing = await db.feedbackNote.findUnique({
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `TZ=UTC npx vitest run lib/feedback-inbox.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck the scripts without running them**

Run: `npx tsc --noEmit`. Green. **Do not run `npm run feedback:pull` or `npm run feedback:resolve`** — both connect to the production database, which this plan forbids.

- [ ] **Step 8: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green.

- [ ] **Step 9: Commit**

```bash
git add lib/feedback-inbox.ts lib/feedback-inbox.test.ts scripts/feedback-pull.ts scripts/feedback-resolve.ts
git commit -m "refactor(feedback): extract and test the inbox row mapping, print the db first

The row to InboxNote mapping lived untestable inside feedback-pull, and
feedback-resolve named its target database only after the lookup a mistyped
id exits at.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Feedback panel — the `canDelete` contract and three UI corrections (FN-04, FN-08, FN-09, FP-09, FP-12, P3)

Five items in the Feedback panel, bundled into one task because they land in the same file, not because they depend on each other. Only `FN-04` genuinely spans two files — the server action and the client both change; `FN-08` and `FN-09` are independent UI fixes, and `FP-09`/`FP-12` are comment-only. What actually forces the bundle is this plan's own one-task-one-file grouping rule (see **Architecture** at the top): all five touch `components/feedback/feedback-launcher.tsx`. **Task 8 already edited both of these files** — read the shared-surface register before starting, and re-run Task 8's tests at the end.

- **FN-04** — `FeedbackNoteView` still carries `authorId: string` (`server/actions/feedback.ts:24`), whose only client use is `canDelete: currentUserId !== undefined && entry.note.authorId === currentUserId` (`feedback-launcher.tsx:591-593`). More consequential than when it was filed: since ADR 0046, an Admin's client now receives other Travellers' real `authorId`s alongside their notes.
- **FN-08** — the discarded-note toast (`feedback-launcher.tsx:332-337`) shows `result.discarded[0].body.slice(0, 120)` as plain text, with no way to get the words back. `bodyRef`/`setBody` are right there and unwired.
- **FN-09** — the near-limit character counter (`:619-621`) is conditionally mounted (`{body.length >= COUNT_FROM ? (...) : null}`), so it appears and shifts the row. `components/trip/journal-editor.tsx:227-230` documents the opposite as deliberate: "always mounted, stable position."
- **FP-09** and **FP-12** are **not requests to change behaviour.** `onCloseAutoFocus`'s `if (open)` guard reads the last committed `open`, and both resulting corners are recorded as benign and jsdom-unreachable; `badgeFor`'s hand-written `"success" | "muted"` union is called "the better contract" by the source doc. Both exist so the next reader knows the shape is understood, not accidental. **The work is a comment each, and nothing else.** Do not convert the guard to a ref. Do not derive the variant type from `badgeVariants`.

**Files:**
- Modify: `server/actions/feedback.ts:18-28` (`FeedbackNoteView`), `:40-52` (`VIEW_SELECT`), `:54-66` (`toView`), `:83-104` (`createFeedbackNote`), `:114-124` (`listFeedbackNotes`)
- Modify: `components/feedback/feedback-launcher.tsx` — `:187-199` (FP-12 comment), `:330-338` (FN-08), `:563-567` (FP-09 comment), `:588-594` (FN-04), `:617-632` (FN-09)
- Test: `server/actions/feedback.test.ts`
- Test: `components/feedback/feedback-launcher.test.tsx`

**Interfaces:**
- Consumes: `toastWithUndo`'s pattern from `components/ui/undo-toast.tsx` — `toast({ ..., action: <ToastAction altText="..." onClick={...}>Label</ToastAction> })`, with `ToastAction` imported from `@/components/ui/toast`. `DOCKED_FROM` is exported from `feedback-launcher.tsx` by Task 8; do not re-declare it.
- Produces: `FeedbackNoteView` loses `authorId: string` and gains **`canDelete: boolean`** — computed server-side in `toView`, which therefore takes the viewer's id: **`toView(row: FeedbackNoteRow, viewerId: string): FeedbackNoteView`**. No later task depends on this.

- [ ] **Step 1: Write the failing server tests (FN-04)**

Add to `server/actions/feedback.test.ts`:

```ts
  it("never ships an authorId to the browser", async () => {
    // FN-04: authorId existed solely to gate the Delete control client-side.
    // Since ADR 0046 an Admin's client receives every author's notes, so that
    // was other Travellers' real user ids crossing the boundary for a boolean.
    const result = await listFeedbackNotes();
    expect(result.success).toBe(true);
    if (!result.success) return;
    for (const note of result.notes) {
      expect(note).not.toHaveProperty("authorId");
    }
  });

  it("computes canDelete server-side: true for your own note", async () => {
    const result = await listFeedbackNotes();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.notes.map((n) => n.canDelete)).toContain(true);
  });
```

You will need the file's existing `findMany` mock to return at least one row authored by the mocked `requireUser` id, and one authored by someone else. Extend whatever fixture the file already uses so both cases are present, and add a companion assertion that the other author's note has `canDelete: false`.

- [ ] **Step 2: Run to verify they fail**

Run: `TZ=UTC npx vitest run server/actions/feedback.test.ts`
Expected: FAIL — `authorId` is present and `canDelete` is `undefined`.

- [ ] **Step 3: Change the view contract (FN-04)**

In `server/actions/feedback.ts`:

```ts
export type FeedbackNoteView = {
  id: string;
  body: string;
  route: string;
  pageLabel: string;
  tripName: string | null;
  authorName: string;
  /**
   * Whether the viewer may retract this note. Computed here rather than
   * shipping `authorId` and letting the client compare: since ADR 0046 an
   * Admin receives every author's notes, so the raw id was other Travellers'
   * user ids crossing the boundary to answer one boolean (FN-04).
   */
  canDelete: boolean;
  status: FeedbackStatus;
  authoredAt: string;
};
```

Keep `authorId: true` in `VIEW_SELECT` and `authorId: string` on the internal `FeedbackNoteRow` — the server still needs it; it just stops leaving the server. Change `toView`:

```ts
function toView(row: FeedbackNoteRow, viewerId: string): FeedbackNoteView {
  return {
    id: row.id,
    body: row.body,
    route: row.route,
    pageLabel: row.pageLabel,
    tripName: row.tripName,
    authorName: row.author.name ?? "Traveller",
    canDelete: row.authorId === viewerId,
    status: row.status as FeedbackStatus,
    authoredAt: row.authoredAt.toISOString(),
  };
}
```

Update both call sites: `toView(row as FeedbackNoteRow, user.id)` in `createFeedbackNote`, and `(rows as FeedbackNoteRow[]).map((row) => toView(row, user.id))` in `listFeedbackNotes`. **Leave `deleteFeedbackNote` exactly as it is** — its own `note.authorId !== user.id` check is the real authorization and must stay server-side.

- [ ] **Step 4: Use it in the panel (FN-04)**

In `components/feedback/feedback-launcher.tsx`, replace the `canDelete` expression at `:588-594`:

```tsx
                <SentEntry
                  key={entry.note.id}
                  note={entry.note}
                  canDelete={entry.note.canDelete}
                  onDelete={handleDelete}
                />
```

`currentUserId` may now be unused — if the component no longer reads it anywhere, remove the prop and its docblock at `:243-249`, and remove it from every render site (`grep -rn "currentUserId" --include=*.tsx app/ components/ | grep -i feedback`). If some other part of the panel still uses it, leave it.

Update the `existingNote` fixture in `components/feedback/feedback-launcher.test.tsx:47-57`: drop `authorId: "u2"`, add `canDelete: true`. Do the same for the note `createMock` resolves in the `beforeEach`. Task 8's delete test passes `currentUserId="u2"` — drop that prop if you removed it, since `canDelete: true` on the fixture is now what makes the button appear.

- [ ] **Step 5: Write and pass the FN-08 test (restore a discarded note)**

Add to `components/feedback/feedback-launcher.test.tsx`:

```ts
  it("offers to put a discarded note's words back in the box", async () => {
    // FN-08: the toast showed the first 120 characters of what the server
    // refused and then dropped them on the floor. Losing what someone wrote
    // must never be silent, and showing it is not the same as keeping it.
    const queued = {
      clientKey: "fk_x",
      body: "A note the server will refuse",
      route: "/trips/t1/plan",
      pageLabel: "Plan editor",
      tripId: "t1",
      tripName: "Europe Summer 2026",
      viewport: "390x844",
      userAgent: "iPhone",
      authoredAt: "2026-09-08T04:05:06.000Z",
    };
    window.localStorage.setItem("teepee.feedback.queue.v1", JSON.stringify([queued]));
    createMock.mockResolvedValue({ success: false, errors: { body: ["too long"] } });

    render(<FeedbackLauncher />);

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const call = toastMock.mock.calls.at(-1)![0];
    expect(call.description).toContain("A note the server will refuse");
    expect(call.action).toBeDefined();
  });
```

Then implement it. In `feedback-launcher.tsx`, import `ToastAction` from `@/components/ui/toast` and change the discarded-note toast:

```tsx
    if (result.discarded.length > 0) {
      const lost = result.discarded[0].body;
      toast({
        variant: "destructive",
        title: discardedMessage(result.discarded),
        description: lost.slice(0, 120),
        // Showing what was refused is not the same as keeping it. Putting the
        // words back in the box is the only version of this the writer can
        // act on (FN-08).
        action: (
          <ToastAction
            altText="Put the discarded feedback back in the box"
            onClick={() => {
              setBody(lost);
              bodyRef.current?.focus();
            }}
          >
            Restore
          </ToastAction>
        ),
      });
    }
```

Make sure `setBody` and `bodyRef` are in scope at that point — `flush` is a `useCallback`; add them to its dependency array.

- [ ] **Step 6: Write and pass the FN-09 test (always-mounted counter)**

```ts
  it("keeps the character counter mounted so the row does not jump", async () => {
    // FN-09: journal-editor.tsx documents the opposite as deliberate —
    // "always mounted, stable position". A counter that appears at COUNT_FROM
    // shifts the Send button sideways mid-sentence.
    const user = userEvent.setup();
    render(<FeedbackLauncher />);
    await user.click(screen.getByRole("button", { name: /feedback/i }));

    const counter = screen.getByRole("status");
    expect(counter).toBeInTheDocument();
    expect(counter).toHaveTextContent("");

    await user.type(screen.getByLabelText(/your feedback about teepee/i), "hello");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
```

Then change `:617-632` so the `<p role="status">` is unconditional and only its text toggles:

```tsx
            {/*
              Always mounted, stable position — same reasoning as
              components/trip/journal-editor.tsx:227-230. Mounting it at
              COUNT_FROM moved the Send button sideways mid-sentence, and an
              aria-live region that appears is announced as new content rather
              than as an update (FN-09).
            */}
            <p
              role="status"
              aria-live="polite"
              className={cn(
                "text-xs",
                body.length >= BODY_MAX
                  ? "font-medium text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {body.length >= COUNT_FROM ? `${body.length}/${BODY_MAX}` : ""}
            </p>
```

If the test finds more than one `role="status"` element once the panel is open, scope the query with `within(...)` on the panel dialog rather than loosening the assertion.

- [ ] **Step 7: Record FP-09 and FP-12 in comments — and change nothing else**

At `feedback-launcher.tsx:565-566`, extend the existing `onCloseAutoFocus` comment with:

```
          FP-09, recorded so this is not "simplified" later: `open` here is the
          last COMMITTED value, not the one being transitioned to. Both corners
          that produces were examined and are benign, and neither is reachable
          from jsdom, so there is no test to write and no ref to reach for.
          The shape is understood, not accidental.
```

At `badgeFor` (`:193-199`), extend its docblock with:

```
 * FP-12: the `"success" | "muted"` union is hand-written on purpose rather
 * than derived from `badgeVariants`. A narrow union is the better contract
 * while the set is two — this note exists only so that if the variant set
 * grows, whoever adds the third one knows the choice was made, not missed.
```

Make no code change for either.

- [ ] **Step 8: Run everything in scope**

Run: `TZ=UTC npx vitest run server/actions/feedback.test.ts components/feedback/feedback-launcher.test.tsx`
Expected: PASS, including every test Task 8 added.

- [ ] **Step 9: Typecheck, full suite and lint**

Run: `npx tsc --noEmit`, then `npm test`, then `npm run lint`. All green. The typecheck is what catches any remaining reader of the removed `authorId`.

- [ ] **Step 10: Commit**

```bash
git add server/actions/feedback.ts server/actions/feedback.test.ts components/feedback/feedback-launcher.tsx components/feedback/feedback-launcher.test.tsx
git commit -m "fix(feedback): send canDelete instead of authorId, and stop losing discarded notes

Replaces the raw authorId with a server-computed canDelete, adds a Restore
action to the discarded-note toast, and mounts the character counter
unconditionally. FP-09 and FP-12 are recorded as comments, deliberately unchanged.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: two word-level corrections (FN-10, HG-06, P3)

- **FN-10** — `docs/HANDOFF.md:401` says "`--dry-run` looks the note up and reports what would change without writing". `CONTEXT.md:247` defines **Feedback note** as the contract term; a bare "note" is a different thing in this app (the note threads on stops, items and transports).
- **HG-06** — `components/trip/help-expand-all.tsx:8-9` still reads "Deliberately the ONLY client component in the guide." `components/trip/help-hash-open.tsx:1` opens with `"use client"`, added in `90a9ac4`, which post-dates the comment. **The property the comment protects is still intact** — no client-side *disclosure state* was added, `help-guide.tsx` is still a server component, and the guard test in `help-guide.test.tsx` ("uses no client-side disclosure state") still holds. Only the sentence is wrong.

**Files:**
- Modify: `docs/HANDOFF.md:401`
- Modify: `components/trip/help-expand-all.tsx:8-9`

**Interfaces:**
- Consumes: nothing. Produces: nothing.

- [ ] **Step 1: Fix the HANDOFF wording**

Change `docs/HANDOFF.md:401` from:

```
`--dry-run` looks the note up and reports what would change without writing:
```
to:
```
`--dry-run` looks the Feedback note up and reports what would change without writing:
```

Then run `grep -n "the note\b" docs/HANDOFF.md` and check each remaining hit: where the subject is a row in `FeedbackNote`, say **Feedback note**; where it is a note on a stop, item or transport, leave it. Do not rewrite anything else in the file.

- [ ] **Step 2: Fix the help-expand-all comment**

Replace lines 8-9 of `components/trip/help-expand-all.tsx`:

```
 * Deliberately the ONLY client component in the guide. It holds no disclosure
 * state of its own — it toggles the `open` attribute on the already-rendered
```
with:
```
 * Holds no client-side DISCLOSURE state — it toggles the `open` attribute on
 * the already-rendered
```

and add, after the existing paragraph:

```
 * (This used to claim to be the only client component in the guide. That
 * stopped being true when help-hash-open.tsx arrived; the property actually
 * worth protecting is the one stated above, and it still holds — see the
 * "uses no client-side disclosure state" guard in help-guide.test.tsx.)
```

- [ ] **Step 3: Check the claim you are now making is true**

Run: `grep -rln '"use client"' components/trip/help-*.tsx` — expect `help-expand-all.tsx` and `help-hash-open.tsx`, and **not** `help-guide.tsx`. If `help-guide.tsx` appears, stop: the comment's remaining claim is also false and that is a bigger finding than this task — report it rather than papering over it.

- [ ] **Step 4: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green — `components/trip/help-guide.test.tsx` and `components/trip/help-expand-all.test.tsx` in particular.

- [ ] **Step 5: Commit**

```bash
git add docs/HANDOFF.md components/trip/help-expand-all.tsx
git commit -m "docs: say Feedback note in HANDOFF, and stop claiming to be the only client component

help-hash-open.tsx made that claim false; the property the comment actually
protects (no client-side disclosure state) still holds.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: the sheet's backdrop timing, blur escape hatch, and docked height floor (FP-05, FP-06, FP-13, P3)

Three small, independent facts about `components/ui/sheet.tsx`, fixed together because they are the same file and the same component.

- **FP-05** — `app/globals.css:234` makes `tp-fade-in` `150ms ease-out` while `:246` makes `tp-slide-up` `250ms`. Both are used together below `md` (`sheet.tsx:21-22,36`), so the dim-and-blur backdrop finishes 100ms before the panel covers it, and is briefly visible on its own. **The source doc calls this "arguably an improvement" (standard sheet feel)** — it is recorded as still-open, not as something the doc demands fixed. Keep the change to the sheet's own overlay; do not retime `tp-fade-in` globally, which dialogs and popovers also use.
- **FP-06** — `SheetOverlay` renders `backdrop-blur-sm` unconditionally whenever `hideOverlay` is not set, and `SheetContent` exposes only a boolean `hideOverlay` (`:56,62,64`) — so a caller who wants the dim without the full-viewport blur has to choose between all and nothing. The claimed performance cost on low-end phones cannot be quantified without a real device; **the structural condition — no passthrough — is confirmed by code alone, and that is what this fixes.** Add the escape hatch; do not change any caller's behaviour.
- **FP-13** — `sheet.tsx:42` is `md:h-[min(37.5rem,calc(100vh-9rem))]` with no floor, so below a 144px-tall viewport at ≥768px wide the docked panel computes a non-positive height. 768×400 landscape still yields 16rem, so this is a guard rail, not a live bug.

**Files:**
- Modify: `app/globals.css` (one new `@utility`)
- Modify: `components/ui/sheet.tsx:17-27` (overlay class + animation), `:41-43` (docked height), `:51-64` (the new prop)
- Test: `components/ui/sheet.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/cn` (clsx + tailwind-merge — a later conflicting utility wins, which is what makes the passthrough usable).
- Produces: `SheetContentProps` gains **`overlayClassName?: string`**, forwarded to `SheetOverlay`'s `className`. Optional, so no caller breaks. New CSS utility **`tp-fade-in-sheet`**. No later task uses either.

- [ ] **Step 1: Write the failing tests**

Add to `components/ui/sheet.test.tsx`, inside `describe("Sheet", ...)`:

```ts
  it("fades the backdrop in over the same duration the panel slides", () => {
    // FP-05: tp-fade-in is 150ms, tp-slide-up is 250ms. Used together, the
    // backdrop finishes first and is visible on its own for 100ms.
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Default</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const overlay = document.querySelector(".backdrop-blur-sm");
    expect(overlay).not.toBeNull();
    expect(overlay!.className).toContain("data-[state=open]:tp-fade-in-sheet");
  });

  it("lets one caller neutralise the backdrop blur without losing the dim", () => {
    // FP-06: hideOverlay was all-or-nothing — there was no way to keep the
    // dim and drop the full-viewport blur.
    render(
      <Sheet open>
        <SheetContent overlayClassName="backdrop-blur-none">
          <SheetTitle>Default</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    // tailwind-merge resolves the conflict in the caller's favour.
    expect(document.querySelector(".backdrop-blur-none")).not.toBeNull();
    expect(document.querySelector(".backdrop-blur-sm")).toBeNull();
    // The dim itself is untouched.
    expect(document.querySelector(".bg-foreground\\/40")).not.toBeNull();
  });

  it("gives the docked panel a height floor", () => {
    // FP-13: min(37.5rem, calc(100vh - 9rem)) goes non-positive below a
    // 144px-tall viewport at md and up.
    render(
      <Sheet open>
        <SheetContent side="docked" hideOverlay>
          <SheetTitle>Docked</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.className).toContain("md:h-[min(37.5rem,max(16rem,calc(100vh-9rem)))]");
    expect(panel.className).not.toContain("md:h-[min(37.5rem,calc(100vh-9rem))]");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TZ=UTC npx vitest run components/ui/sheet.test.tsx`
Expected: all three FAIL — no `tp-fade-in-sheet`, no `overlayClassName`, no `max(...)` in the height.

- [ ] **Step 3: Add the sheet-paced fade utility**

In `app/globals.css`, immediately after the existing `@utility tp-fade-in` block (~line 232):

```css
/* Paced to tp-slide-up (250ms), so a sheet's backdrop and its panel arrive
   together. tp-fade-in stays at 150ms for dialogs and popovers, which have no
   slide to keep step with. */
@utility tp-fade-in-sheet {
  animation: tp-fade-in 250ms ease-out;
}
```

Reuse the existing `@keyframes tp-fade-in`; do not define a second one.

- [ ] **Step 4: Change the overlay, the prop, and the height**

In `components/ui/sheet.tsx`, change `SheetOverlay`'s class list line from `"data-[state=open]:tp-fade-in data-[state=closed]:tp-fade-out"` to:

```ts
      "data-[state=open]:tp-fade-in-sheet data-[state=closed]:tp-fade-out",
```

Add the prop to `SheetContentProps`, below `hideOverlay`:

```ts
  /**
   * Classes for the backdrop. The overlay is `bg-foreground/40
   * backdrop-blur-sm` for everyone; a caller that wants the dim without the
   * full-viewport blur had no way to say so — `hideOverlay` is all or nothing
   * (FP-06). tailwind-merge resolves conflicts in the caller's favour, so
   * `overlayClassName="backdrop-blur-none"` does exactly that.
   */
  overlayClassName?: string;
```

Destructure and forward it:

```tsx
>(({ side = "bottom", className, overlayClassName, children, hideClose, hideOverlay, ...props }, ref) => (
  <SheetPortal>
    {!hideOverlay ? <SheetOverlay className={overlayClassName} /> : null}
```

And in `sheetVariants`, change the `docked` variant's height clause from `md:h-[min(37.5rem,calc(100vh-9rem))]` to `md:h-[min(37.5rem,max(16rem,calc(100vh-9rem)))]`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `TZ=UTC npx vitest run components/ui/sheet.test.tsx`
Expected: PASS.

- [ ] **Step 6: Check nothing else pinned the old strings**

Run: `grep -rn "tp-fade-in\b\|min(37.5rem" --include=*.tsx --include=*.ts --include=*.css app/ components/` — confirm the only remaining `tp-fade-in` users are the dialog/popover ones you did not touch, and that no test elsewhere asserts the old docked height string.

- [ ] **Step 7: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green — `components/feedback/feedback-launcher.test.tsx` renders a docked sheet, so watch it.

- [ ] **Step 8: Commit**

```bash
git add app/globals.css components/ui/sheet.tsx components/ui/sheet.test.tsx
git commit -m "fix(sheet): pace the backdrop to the panel, allow an overlay class, floor the docked height

The overlay faded in 100ms before the panel covered it, backdrop-blur-sm had
no per-caller escape hatch, and the docked height had no floor.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: give the Compare table clearance from the desktop toast (FP-07, P3)

> **Trade-off — get the operator's sign-off before building this.** The backlog's own note on `FP-07` calls the overlap "transient and readable once the toast clears" (`docs/open-follow-ups.md:485`). The fix below trades that away for a permanent `md:mb-24` dead band under the Compare table on every desktop view, toast showing or not — a few seconds of occasional overlap, sometimes, for a 6rem gap, always. **Stop before Step 3 and ask the operator whether that trade is wanted**, rather than assuming it is; do not change the fix itself and do not skip this task on your own judgement.

`components/trip/compare-table.tsx:477` puts the row-label column in a `sticky left-0 z-10` header cell, and desktop toasts sit bottom-left. The overlap is geometric: a toast covers the frozen label column. **Do not move the toast.** `components/ui/toaster.tsx:21-30` carries an explicit instruction not to change the desktop corner — the swipe direction is tuned for the mobile viewport where swiping actually happens, and re-cornering it would point the gesture the wrong way there. The note on this item also records the overlap as transient and readable once the toast clears, so keep the fix to clearance on the Compare side and nothing more.

**Files:**
- Modify: `components/trip/compare-table.tsx:470` (the desktop scroll container's class list)
- Test: `components/trip/compare-table.test.tsx`

**Interfaces:**
- Consumes: nothing new. Produces: nothing other tasks reference.

- [ ] **Step 1: Write the failing test**

Add to `components/trip/compare-table.test.tsx`, using whatever `trip`/`plans` fixture the file already builds for its other render tests:

```ts
  it("leaves room below the desktop table for a bottom-left toast", () => {
    // FP-07: the label column is sticky left-0, and toasts are bottom-left
    // from md up. Moving the toast is explicitly ruled out in toaster.tsx
    // (the swipe direction is tuned for mobile), so the table takes the
    // clearance instead.
    const { container } = render(<CompareTable trip={trip} plans={plans} />);
    const desktopTable = container.querySelector(".overflow-x-auto");
    expect(desktopTable).not.toBeNull();
    expect(desktopTable!.className).toContain("md:mb-24");
  });
```

Replace `trip={trip} plans={plans}` with the file's actual fixture names — find them in the first existing `render(<CompareTable ... />)` call and copy them verbatim.

- [ ] **Step 2: Run the test to verify it fails**

Run: `TZ=UTC npx vitest run components/trip/compare-table.test.tsx`
Expected: FAIL — the class list has no `md:mb-24`.

- [ ] **Step 3: Add the clearance**

In `components/trip/compare-table.tsx`, change the desktop scroll container (~line 470):

```tsx
      {/* Horizontal-scroll container — wide content stays inside; page never scrolls sideways.
          md:mb-24 keeps the frozen label column clear of the bottom-left toast
          stack, which cannot move: toaster.tsx pins the desktop corner on
          purpose so the swipe gesture stays correct on mobile (FP-07). */}
      <div className="hidden sm:block overflow-x-auto rounded-3xl border border-border bg-card shadow-soft md:mb-24">
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `TZ=UTC npx vitest run components/trip/compare-table.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green.

- [ ] **Step 6: Commit**

```bash
git add components/trip/compare-table.tsx components/trip/compare-table.test.tsx
git commit -m "fix(compare): keep the frozen label column clear of the desktop toast

The toast corner is pinned on purpose in toaster.tsx, so the table takes the
clearance instead.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: stop using the map pin three ways (HG-02 / HG-10, P3)

The same `MapPin` glyph is used decoratively at `components/trip/stop-card.tsx:337` (next to a stop's country, unconditionally) and `components/trip/item-card.tsx:114` and `:192` (next to an item's stop name and its address, unconditionally) — and as the *real* has-a-location signal at `components/trip/map-link.tsx:14-25`, where `MapLink` renders `null` when there is nothing to link to. `components/trip/help-legend.tsx:108` teaches the pin as "Has a location, so it shows on the map". Two of the decorative uses sit immediately beside a `MapLink`, so the reader sees two identical pins in a row meaning different things.

**This is an app defect, not a guide defect.** The legend accurately describes an ambiguous affordance, so editing guide text cannot fix it. `HG-02` and `HG-10` are the same finding filed twice — one fix, both struck.

**Task 2 also edits `components/trip/item-card.tsx`** (it adds a `forkId` prop and passes it to `CostEditor`) — see the shared-surface register. Do not revert that.

**Files:**
- Modify: `components/trip/stop-card.tsx:336-339` (drop the decorative pin; drop the `MapPin` import if unused)
- Modify: `components/trip/item-card.tsx:113-117` and `:190-194` (same)
- Test: `components/trip/stop-card.test.tsx`
- Test: `components/trip/item-card.test.tsx`

**Interfaces:**
- Consumes: `MapLink` (`components/trip/map-link.tsx`) — unchanged, and still the only thing allowed to render a pin in these two files.
- Produces: nothing other tasks reference.

- [ ] **Step 1: Write the failing tests**

lucide renders `<svg class="lucide lucide-map-pin ...">`, so the pin is directly countable. Add to `components/trip/stop-card.test.tsx`:

```ts
it("shows exactly one map pin on a stop with a location — the map link's", () => {
  // HG-02/HG-10: a decorative pin next to the country plus MapLink's real
  // one meant two identical glyphs in a row meaning different things, while
  // help-legend.tsx teaches the pin as "has a location".
  const { container } = render(
    <StopCard
      stop={{ ...scheduledStop, lat: 41.9, lng: 12.5 }}
      isFirst isLast onEdit={() => {}} onMoveUp={() => {}} onMoveDown={() => {}} onDelete={() => {}}
    />,
  );
  expect(container.querySelectorAll("svg.lucide-map-pin")).toHaveLength(1);
  expect(container.querySelector('a[aria-label^="Open"]')).not.toBeNull();
});

it("shows no map pin at all on a stop with no location", () => {
  const { container } = render(
    <StopCard
      stop={{ ...scheduledStop, lat: null, lng: null }}
      isFirst isLast onEdit={() => {}} onMoveUp={() => {}} onMoveDown={() => {}} onDelete={() => {}}
    />,
  );
  expect(container.querySelectorAll("svg.lucide-map-pin")).toHaveLength(0);
  // The country still reads fine as plain text.
  expect(screen.getByText("Italy")).toBeInTheDocument();
});
```

Add to `components/trip/item-card.test.tsx`, adapting to that file's existing item fixture:

```ts
it("shows no map pin beside an item's stop name", () => {
  // The stop name is not a location link — nothing happens if you tap it.
  const { container } = render(
    <ItemCard item={{ ...baseItem, stopName: "Rome", address: null, lat: null, lng: null }} />,
  );
  expect(container.querySelectorAll("svg.lucide-map-pin")).toHaveLength(0);
  expect(screen.getByText("Rome")).toBeInTheDocument();
});

it("shows exactly one map pin for an item with an address — the map link's", () => {
  const { container } = render(
    <ItemCard item={{ ...baseItem, stopName: "Rome", address: "Piazza del Colosseo", lat: 41.89, lng: 12.49 }} />,
  );
  expect(container.querySelectorAll("svg.lucide-map-pin")).toHaveLength(1);
});
```

Use the file's existing fixture name in place of `baseItem`, and add whatever required props its other `render(<ItemCard ... />)` calls pass.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TZ=UTC npx vitest run components/trip/stop-card.test.tsx components/trip/item-card.test.tsx`
Expected: FAIL with 2 pins where 1 is expected, and 1 where 0 is expected.

- [ ] **Step 3: Drop the decorative pins**

In `components/trip/stop-card.tsx`, in the country line (~line 336), delete the line:

```tsx
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
```

and add a comment in its place:

```tsx
              {/* No decorative pin here: MapLink below renders the real one,
                  and help-legend.tsx teaches that glyph as "has a location"
                  (HG-02/HG-10). */}
```

In `components/trip/item-card.tsx`, delete the `<MapPin ... />` at ~line 114 (the stop-name line) and at ~line 192 (the address line), adding the same one-line reason at the first of them.

In both files, remove `MapPin` from the `lucide-react` import list **if no other use remains** — check with `grep -n "MapPin" components/trip/stop-card.tsx components/trip/item-card.tsx` before editing the import, and leave the import alone if a use survives.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `TZ=UTC npx vitest run components/trip/stop-card.test.tsx components/trip/item-card.test.tsx components/trip/help-legend.test.tsx`
Expected: PASS. The legend's own specimen is unchanged and its test should be unaffected — if it is not, you changed `help-legend.tsx`, which this task does not touch.

- [ ] **Step 5: Confirm Task 2's work survived**

Run: `grep -n "forkId" components/trip/item-card.tsx` — the prop and the `forkId={forkId}` on `<CostEditor>` must both still be there.

- [ ] **Step 6: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green.

- [ ] **Step 7: Commit**

```bash
git add components/trip/stop-card.tsx components/trip/item-card.tsx components/trip/stop-card.test.tsx components/trip/item-card.test.tsx
git commit -m "fix(cards): reserve the map pin for things that actually have a location

The same glyph was decorative next to a country, a stop name and an address,
and load-bearing in MapLink — two of them side by side.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: make `help-hash-open` test 3 assert what its name claims (HG-08, P3)

`components/trip/help-hash-open.test.tsx:43-54` — the test named "lets a deep-linked section be collapsed again and stay collapsed" sets `globe.open = false` itself, then asserts `globe.open === false`. It re-reads the property it just set. It cannot assert the body is visually hidden, because jsdom applies no `:target` CSS.

**Read this before starting:** closing this item *properly* needs a real browser asserting the `:target` rule is not holding the section open, and this repo's jsdom suite cannot provide that. What *is* achievable here — and what this task delivers — is a test that asserts the thing the component actually controls: the fragment is gone, so no `:target` rule can match, and a subsequent `hashchange` does not re-open the section. Say so in the test, so the next person knows the shape of the real fix without re-deriving it.

**Files:**
- Test: `components/trip/help-hash-open.test.tsx:43-54`

**Interfaces:**
- Consumes: `HELP_PRINT_STYLE`, already exported from `components/trip/help-guide.tsx` (see `components/trip/help-guide.test.tsx:3`); `HelpGuide`; the file's existing `setPath(path)` helper.
- Produces: nothing. Test-only.

- [ ] **Step 1: Replace the weak test**

Replace the whole `it("lets a deep-linked section be collapsed again and stay collapsed", ...)` block with:

```ts
  it("removes the fragment :target needs, and does not re-open on a later hashchange", () => {
    // HG-08. The previous version of this test set `globe.open = false` and
    // then asserted `globe.open === false` — it re-read the property it had
    // just written, so it could not fail.
    //
    // What jsdom CAN prove is the two things the component is actually
    // responsible for: the fragment is gone (so the `:target` rule below has
    // nothing to match), and a subsequent hashchange with an empty hash is a
    // no-op (so nothing re-opens the section behind the reader).
    //
    // What jsdom CANNOT prove, and what a real browser would have to: that
    // the `:target` CSS is genuinely not holding the body visible. jsdom
    // applies no `:target` styling at all, so asserting on layout here would
    // be theatre. That check needs a browser, and is the reason this item
    // was flagged rather than simply closed.
    setPath("/help#globe");
    const { container } = render(<HelpGuide tripId="t1" />);

    const globe = container.querySelector<HTMLDetailsElement>("details#globe")!;
    expect(globe.open).toBe(true);

    // The fallback rule this component exists to defuse is real and still
    // shipped. If it stops being :target-keyed, this test is guarding nothing.
    expect(HELP_PRINT_STYLE).toContain("details:target");

    // No fragment left, so `details#globe` cannot be :target for any rule.
    expect(window.location.hash).toBe("");

    globe.open = false;
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(globe.open).toBe(false);
    expect(window.location.hash).toBe("");
  });
```

Add `HELP_PRINT_STYLE` to the existing `import { HelpGuide } from "./help-guide";` line, making it `import { HelpGuide, HELP_PRINT_STYLE } from "./help-guide";`.

- [ ] **Step 2: Run the test**

Run: `TZ=UTC npx vitest run components/trip/help-hash-open.test.tsx`
Expected: PASS.

- [ ] **Step 3: Prove the new assertions have teeth**

Not committed: in `components/trip/help-hash-open.tsx`, delete the `window.history.replaceState(...)` call inside `openHashTarget`. The new test must fail on `expect(window.location.hash).toBe("")`. Then make `openHashTarget` re-open unconditionally (remove the `if (!raw) return;` early exit and default `id` to `"globe"`); the test must fail on the post-`hashchange` `globe.open` assertion. Revert both, and confirm with `git status` that only the test file is modified.

- [ ] **Step 4: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green.

- [ ] **Step 5: Commit**

```bash
git add components/trip/help-hash-open.test.tsx
git commit -m "test(help): assert what the deep-link collapse test claims

It re-read the property it had just written. Asserts the fragment removal and
a no-op hashchange instead, and records what only a browser can check.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: pin `requireTripAccess` to `cache()`, and say why Home calls it twice (CD-11, RM-15, P3)

- **CD-11** — `lib/guards.ts:57` is `export const requireTripAccess = cache(async (tripId) => { ... })`. `lib/guards.test.ts` uses a hand-rolled `cache()` mock (the comment at `:32-46` explains why: React's real `cache()` is an inert no-op under Vitest/jsdom), and its two relevant tests (`:104`, `:117`) exercise behaviour *through* that mock rather than asserting `requireTripAccess` is literally what the mock returned. That one assertion is the only one that would survive a bug in the hand-rolled mock itself.
- **RM-15** — `app/(app)/trips/[tripId]/page.tsx:21` calls `requireTripAccess(tripId)`, then line 80's `listRemindersForTrip(tripId, today)` calls it again at `server/actions/reminders.ts:69`. **This is not a defect and the second call must not be removed.** `lib/guards.ts`'s own docblock says so in as many words — "Do NOT remove either call — `cache()` makes the second one free, it doesn't make it redundant" — and the double call is deliberate defence in depth. What is owed is that the rationale is invisible from the page, where the next reader meets it. A comment at the call site, pointing at the docblock.

**Files:**
- Test: `lib/guards.test.ts`
- Modify: `app/(app)/trips/[tripId]/page.tsx:21` (comment only)

**Interfaces:**
- Consumes: `requireTripAccess` from `@/lib/guards`, already imported in the test file.
- Produces: nothing. **Do not change `lib/guards.ts`** in this task.

- [ ] **Step 1: Write the failing structural test**

In `lib/guards.test.ts`, make the hand-rolled `cache()` mock record what it wraps. Add a hoisted array beside the existing `cacheStore`:

```ts
const cacheWrapped = vi.hoisted(() => [] as unknown[]);
```

and inside the `vi.mock("react", ...)` factory, change the `cache` implementation to build the wrapper, record it, and return it:

```ts
    cache:
      <Args extends unknown[], R>(fn: (...args: Args) => R) => {
        const wrapped = (...args: Args): R => {
          const key = JSON.stringify(args);
          if (!cacheStore.has(key)) {
            cacheStore.set(key, fn(...args));
          }
          return cacheStore.get(key) as R;
        };
        // CD-11: recorded so a test can assert requireTripAccess IS this
        // value, not merely that it behaves memoised through this stub.
        cacheWrapped.push(wrapped);
        return wrapped;
      },
```

**Do not clear `cacheWrapped` in `afterEach`.** `lib/guards.ts` is imported once at module evaluation, before any test runs, so clearing it would empty the only evidence. `vi.clearAllMocks()` does not touch a plain array, so the existing `afterEach` is safe as-is.

Then add the test:

```ts
describe("requireTripAccess is structurally cached", () => {
  it("is literally the value cache() returned, not merely memoised-looking", () => {
    // Every other test in this file exercises memoisation THROUGH the
    // hand-rolled cache() stub, so a bug in the stub would hide a
    // requireTripAccess that is no longer wrapped at all. This is the one
    // assertion that survives that (CD-11).
    expect(
      cacheWrapped.includes(requireTripAccess),
      "requireTripAccess is not a cache() return value — the cache() wrapper was removed from lib/guards.ts",
    ).toBe(true);
  });

  it("wraps exactly the guards this file expects", () => {
    // If a second cache() call appears in lib/guards.ts, it is new behaviour
    // and wants its own test rather than silently joining this one.
    expect(cacheWrapped).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail, then pass**

Run: `TZ=UTC npx vitest run lib/guards.test.ts`
Expected: the first run FAILS on `cacheWrapped` being undefined until you have made all the edits above; once the mock records, both tests PASS.

- [ ] **Step 3: Prove the structural test has teeth**

Not committed: in `lib/guards.ts`, unwrap the export —

```ts
export const requireTripAccess = async (tripId: string) => { ... };
```

Re-run `TZ=UTC npx vitest run lib/guards.test.ts`. The new test must fail with the `cache() wrapper was removed` message, and `"wraps exactly the guards this file expects"` must fail with length 0. Note that the *existing* memoisation tests also fail here — that is fine and expected; the point is that the structural one fails for the right reason and would still fail if the stub itself were broken. Then `git checkout -- lib/guards.ts` and re-run to confirm green.

- [ ] **Step 4: Comment the deliberate double call (RM-15)**

In `app/(app)/trips/[tripId]/page.tsx`, above line 21's `await requireTripAccess(tripId);`:

```ts
  // Called here, and again inside listRemindersForTrip below
  // (server/actions/reminders.ts:69). That is deliberate defence in depth —
  // every entry point guards itself rather than trusting its caller already
  // did — and it is free: requireTripAccess is wrapped in React's cache() and
  // memoised per request, keyed on tripId. Do NOT remove either call. The
  // full reasoning, including the one case where the memoisation is a trap,
  // is in the docblock on requireTripAccess in lib/guards.ts (RM-15).
  await requireTripAccess(tripId);
```

Change nothing else in the file — no call is removed, no query is reordered.

- [ ] **Step 5: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green.

- [ ] **Step 6: Commit**

```bash
git add lib/guards.test.ts "app/(app)/trips/[tripId]/page.tsx"
git commit -m "test(guards): pin requireTripAccess to cache(), and explain Home's double call

The suite exercised memoisation through a hand-rolled cache() stub, so a
removed wrapper could hide behind a stub bug. The double call on Home is
deliberate and now says so where a reader meets it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: pass `now` down from the server, and stop naming two things `DispatcherHealth` (CD-05, CD-15, P3)

- **CD-05** — `components/account/dispatcher-health.tsx:42` calls `const now = new Date();` inside the body of a `"use client"` component. The server render and the client hydration therefore compute different `now`s, so the rendered text can differ — **guaranteed on the stale branch**, which formats a local calendar date via `toLocaleDateString`. `components/account/devices-panel.tsx:216` has the identical pattern (`formatLastSeen(device.lastSeenAt, new Date())`). Fix both together: pass `now` down from the server. Note that `"use client"` on `DispatcherHealth` is itself deliberate and documented — the *formatting* must run in the reader's timezone. Only the clock moves to the server, not the formatting.
- **CD-15** — `server/actions/cron-health.ts:7` exports `interface DispatcherHealth`, `components/account/dispatcher-health.tsx:41` exports `function DispatcherHealth`, and `app/(app)/account/page.tsx` imports both (`:4` and `:13`). TypeScript disambiguates them fine (type vs value namespace); a reader scanning the imports cannot. Rename the interface.

**Task 12 owns `app/(app)/account/page.test.tsx`** and has already added a page-level test there — see the shared-surface register. You change the page; keep that test green.

**Files:**
- Modify: `server/actions/cron-health.ts:7` (rename the interface) and its return type
- Modify: `components/account/dispatcher-health.tsx:6-9,41-43` (new prop)
- Modify: `components/account/devices-panel.tsx:19-41,216` (new prop)
- Modify: `app/(app)/account/page.tsx:4,13,26-32,48-51` (compute and pass `now`, use the renamed type)
- Test: `components/account/dispatcher-health.test.tsx`
- Test: `components/account/devices-panel.test.tsx`

**Interfaces:**
- Consumes: `formatLastRun(lastRunAt: Date | null, now: Date): string` (`lib/cron-health.ts`), `formatLastSeen(lastSeenAt: Date, now: Date): string` (`lib/devices.ts`) — both already take `now` as an argument; nothing about them changes.
- Produces: `interface DispatcherHealth` in `server/actions/cron-health.ts` is renamed to **`DispatcherHealthData`** (same shape: `{ lastRunAt: Date | null; stale: boolean }`). `getDispatcherHealth(): Promise<DispatcherHealthData>`. `DispatcherHealthProps` gains a required **`now: Date`**; `DevicesPanelProps` gains a required **`now: Date`**. No later task uses these.

- [ ] **Step 1: Write the failing tests**

In `components/account/dispatcher-health.test.tsx`, add a shared instant at the top (the file already fakes timers to the same moment, so this is the value the current tests implicitly rely on):

```ts
const NOW = new Date("2026-12-10T12:00:00.000Z");
```

Add every existing render a `now={NOW}` prop — one safe pass:

```bash
sed -i 's|<DispatcherHealth |<DispatcherHealth now={NOW} |g' components/account/dispatcher-health.test.tsx
```

Then add the test that actually pins the fix:

```ts
  it("reads its clock from the server, not from its own render", () => {
    // CD-05: `new Date()` in a "use client" render makes the server and the
    // browser compute different `now`s — a guaranteed hydration text mismatch
    // on the stale branch, which formats a local calendar date.
    vi.setSystemTime(new Date("2027-05-05T12:00:00.000Z"));
    render(
      <DispatcherHealth
        now={NOW}
        lastRunAt={new Date("2026-12-10T10:00:00.000Z")}
        stale={false}
      />,
    );
    // The component's own clock now says 2027; the prop says 2026-12-10 12:00.
    expect(screen.getByText(/last ran 2 hours ago/)).toBeInTheDocument();
  });
```

In `components/account/devices-panel.test.tsx`, add `const NOW = new Date("2026-09-17T10:00:00.000Z");` (matching the file's existing `vi.setSystemTime`), then:

```bash
sed -i 's|<DevicesPanel |<DevicesPanel now={NOW} |g' components/account/devices-panel.test.tsx
```

and add:

```ts
  it("reads its clock from the server, not from its own render", () => {
    vi.setSystemTime(new Date("2027-05-05T10:00:00.000Z"));
    render(<DevicesPanel now={NOW} initial={[device({ lastSeenAt: new Date("2026-09-17T08:00:00.000Z") })]} />);
    // Two hours by the server's clock, not eight months by the browser's.
    expect(screen.getByText(/2 hours ago/i)).toBeInTheDocument();
  });
```

Adjust the expected string to whatever `formatLastSeen` actually produces for a two-hour gap — read `lib/devices.ts` and use its exact wording rather than guessing.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TZ=UTC npx vitest run components/account/dispatcher-health.test.tsx components/account/devices-panel.test.tsx`
Expected: FAIL — the components ignore the new prop and use their own `new Date()`, so both clock tests read the faked 2027 instant.

- [ ] **Step 3: Take `now` as a prop in both components**

`components/account/dispatcher-health.tsx`:

```ts
export interface DispatcherHealthProps {
  lastRunAt: Date | null;
  stale: boolean;
  /**
   * The server's instant, passed down rather than read here. This component
   * is `"use client"` so the FORMATTING runs in the reader's timezone (see
   * the note below) — but a `new Date()` in the render body also makes the
   * clock differ between the server pass and hydration, which is a text
   * mismatch, guaranteed on the stale branch (CD-05). Only the clock moves
   * to the server; the formatting stays here.
   */
  now: Date;
}
```
```ts
export function DispatcherHealth({ lastRunAt, stale, now }: DispatcherHealthProps) {
  return (
```

(delete the `const now = new Date();` line).

`components/account/devices-panel.tsx`: add `now: Date;` to `DevicesPanelProps` with a one-line version of the same comment, destructure it in `export function DevicesPanel({ initial, now }: DevicesPanelProps)`, and change line 216 from `formatLastSeen(device.lastSeenAt, new Date())` to `formatLastSeen(device.lastSeenAt, now)`.

- [ ] **Step 4: Rename the interface (CD-15)**

In `server/actions/cron-health.ts`, rename `export interface DispatcherHealth` to `export interface DispatcherHealthData` and update `getDispatcherHealth`'s return type to `Promise<DispatcherHealthData>`. Add a one-line comment: `// Named ...Data so it does not collide with the DispatcherHealth *component*, which app/(app)/account/page.tsx imports alongside it (CD-15).`

Run `grep -rn "DispatcherHealth\b" --include=*.ts --include=*.tsx app/ components/ server/` and update every type-position use to `DispatcherHealthData`. Leave every *component* use as `DispatcherHealth`.

- [ ] **Step 5: Feed `now` from the page**

In `app/(app)/account/page.tsx`, inside `AccountPage`, add one instant and pass it to both panels:

```tsx
  // One instant for the whole page, computed on the server so the client
  // components below cannot disagree with the server pass (CD-05).
  const now = new Date();
```
```tsx
          <DevicesPanel initial={devices} now={now} />
          <DispatcherHealth
            lastRunAt={dispatcherHealth.lastRunAt}
            stale={dispatcherHealth.stale}
            now={now}
          />
```

Place `const now = new Date();` after the `await Promise.all([...])`, so it is one value used twice.

- [ ] **Step 6: Run everything in scope**

Run: `TZ=UTC npx vitest run components/account/ "app/(app)/account/page.test.tsx"`
Expected: PASS, including Task 12's `"still renders the Devices card when the CronHeartbeat read fails"`. `DevicesPanel` is marker-mocked in the page test, so its new required prop does not affect it — but run it and confirm rather than assuming.

- [ ] **Step 7: Typecheck, full suite and lint**

Run: `npx tsc --noEmit`, then `npm test`, then `npm run lint`. All green. The typecheck is what proves every `DevicesPanel`/`DispatcherHealth` render site got the new required prop.

- [ ] **Step 8: Commit**

```bash
git add server/actions/cron-health.ts components/account/dispatcher-health.tsx components/account/dispatcher-health.test.tsx components/account/devices-panel.tsx components/account/devices-panel.test.tsx "app/(app)/account/page.tsx"
git commit -m "fix(account): pass now down from the server, rename the health interface

Two client components called new Date() in their render bodies, so the server
pass and hydration disagreed. The interface and the component no longer share
a name in the same import block.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 23: service-worker tests — restore `fetch`, and cover the heal path's guards (CD-08, CD-12, P3)

- **CD-08** — `public/sw.test.ts` assigns `globalThis.fetch = fetchMock` / `vi.fn()` directly at lines 222, 263, 282 and 305, across three `describe` blocks (`:89`, `:161`, `:218`), with no `afterEach` anywhere restoring or unstubbing it. Harmless today because every test sets its own mock before use; a latent trap for the next test added.
- **CD-12** — `public/sw.js:344` has `if (!fresh || !fresh.endpoint) return;` and `:347` has `if (!keys.p256dh || !keys.auth) return;`. The `pushsubscriptionchange` block (`:218` onward) covers the happy path, a null old+new subscription fallback (`:289`) and `subscribe()` rejecting (`:302`) — but nothing makes `pushManager.subscribe()` resolve to a falsy value or to an object with no `.endpoint`, and nothing makes `toJSON()` return partial `keys`. Neither guard branch is exercised. **File-citation correction:** the code is in `public/sw.js`, not `components/account/device-state.ts` as the source doc says — that file's `!subscription`/`toJSON()` pair (`device-state.ts:59-62`) is the *read* path and is already covered. Do not touch `device-state.ts`.

**Files:**
- Test: `public/sw.test.ts`

**Interfaces:**
- Consumes: the file's existing `loadServiceWorker()` helper, which returns `{ dispatch, self }`.
- Produces: nothing. Test-only. **Do not modify `public/sw.js`** — both guards already behave correctly; they are simply unexercised.

- [ ] **Step 1: Restore `fetch` between tests (CD-08)**

Add `afterEach` to the `from "vitest"` import at the top of `public/sw.test.ts`, then add, immediately after the `SW_SOURCE` constant:

```ts
// The tests below assign `globalThis.fetch` directly. Every one of them sets
// its own mock before use, so nothing is broken today — but a test added
// later that expects the real (or an earlier) fetch would silently inherit
// whichever mock ran last. Restore it (CD-08).
const REAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  vi.restoreAllMocks();
});
```

- [ ] **Step 2: Write the failing tests for the two guards (CD-12)**

Add to the `describe("public/sw.js — pushsubscriptionchange", ...)` block:

```ts
  it("gives up quietly when re-subscribing resolves to nothing", async () => {
    // public/sw.js:344 — `if (!fresh || !fresh.endpoint) return;`. A browser
    // that resolves subscribe() to null leaves nothing to report, and posting
    // a body with no endpoint would write a Device row that can never be
    // pushed to.
    const { dispatch, self } = loadServiceWorker();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
    (self.registration as Record<string, unknown>).pushManager = {
      subscribe: vi.fn().mockResolvedValue(null),
    };

    await dispatch("pushsubscriptionchange", { oldSubscription: null, newSubscription: null });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives up quietly when the fresh subscription has no endpoint", async () => {
    const { dispatch, self } = loadServiceWorker();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
    (self.registration as Record<string, unknown>).pushManager = {
      subscribe: vi.fn().mockResolvedValue({
        toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }),
      }),
    };

    await dispatch("pushsubscriptionchange", { oldSubscription: null, newSubscription: null });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives up quietly when the fresh subscription's keys are incomplete", async () => {
    // public/sw.js:347 — `if (!keys.p256dh || !keys.auth) return;`. A pair of
    // half-keys is not a degraded Device, it is one that looks confirmed and
    // can never receive a push.
    const { dispatch, self } = loadServiceWorker();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
    (self.registration as Record<string, unknown>).pushManager = {
      subscribe: vi.fn().mockResolvedValue({
        endpoint: "https://new",
        toJSON: () => ({ keys: { p256dh: "p" } }),
      }),
    };

    await dispatch("pushsubscriptionchange", { oldSubscription: null, newSubscription: null });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives up quietly when the fresh subscription has no toJSON at all", async () => {
    // `(fresh.toJSON && fresh.toJSON().keys) || {}` — the `{}` fallback.
    const { dispatch, self } = loadServiceWorker();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
    (self.registration as Record<string, unknown>).pushManager = {
      subscribe: vi.fn().mockResolvedValue({ endpoint: "https://new" }),
    };

    await dispatch("pushsubscriptionchange", { oldSubscription: null, newSubscription: null });

    expect(fetchMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run the tests**

Run: `TZ=UTC npx vitest run public/sw.test.ts`
Expected: PASS. The guards already work; these exercise them for the first time.

- [ ] **Step 4: Prove they have teeth**

Not committed: in `public/sw.js`, delete `if (!fresh || !fresh.endpoint) return;` — the first two new tests must fail (the handler throws, or posts with `endpoint: undefined`). Restore it, then delete `if (!keys.p256dh || !keys.auth) return;` — the third and fourth must fail. `git checkout -- public/sw.js` and confirm green. Verify with `git status` that only `public/sw.test.ts` is modified.

- [ ] **Step 5: Confirm the `afterEach` actually restores**

Run: `TZ=UTC npx vitest run public/sw.test.ts --sequence.shuffle` (or run the file twice). Every test must pass regardless of order — that is the property CD-08 is about.

- [ ] **Step 6: Full suite and lint**

Run: `npm test` then `npm run lint`. Both green.

- [ ] **Step 7: Commit**

```bash
git add public/sw.test.ts
git commit -m "test(sw): restore globalThis.fetch, and cover the heal path's two guards

Three describe blocks overwrote fetch with no restore, and neither defensive
return in the pushsubscriptionchange handler was ever exercised.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: one subscription shape, and errors with names (CD-09, P3)

`server/actions/push.ts` repeats the `p256dh`/`auth`/`timezone` shape across the `create` arm (`:43-49`), the `update` arm (`:67-70`) and the two heal-path arms (`:219-230`, `:234-240`); a bare `catch {` with no bound error appears three times (`:76`, `:98`, `:244`), so every failure in this file is invisible. **Fix it file-wide or not at all** — a partial fix leaves the file inconsistent with itself, which is worse than the repetition.

**Out of scope, explicitly:** the `userId: user.id` on the `subscribe` upsert's `update` arm is `CD-02`, a *Needs a decision* item in the backlog. Leave it, and leave its long comment, exactly as they are. This task changes *how the shape is written and how errors are named* — not who may write which row.

**Files:**
- Modify: `server/actions/push.ts`
- Test: `server/actions/push.test.ts`

**Interfaces:**
- Consumes: `deviceLabelFromUserAgent` (already imported in `push.ts`).
- Produces: a module-private helper in `server/actions/push.ts`:
  ```ts
  function subscriptionCoreFields(
    keys: { p256dh: string; auth: string },
    timezone?: string,
  ): { p256dh: string; auth: string; timezone?: string }
  ```
  Not exported; no later task uses it.

- [ ] **Step 1: Write the failing tests**

Add to `server/actions/push.test.ts`:

```ts
  it("logs the error rather than swallowing it when the db throws", async () => {
    // CD-09: three bare `catch {` blocks meant every failure in this file was
    // invisible — the caller got a generic message and the operator got
    // nothing at all.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("connection reset");
    pushSubUpsertMock.mockRejectedValue(boom);

    const result = await subscribeToPush(STUB_SUB);

    expect(result).toEqual({ ok: false, error: "Failed to save push subscription." });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("[push]"), boom);
    errorSpy.mockRestore();
  });
```

Add the equivalent for `unsubscribeFromPush` (mock `pushSubDeleteManyMock` to reject; expect `{ ok: false, error: "Failed to remove push subscription." }`) and for `healRotatedSubscription` (the file already has `"returns reason: internal when the database throws"` — extend that test with the same `errorSpy` assertion rather than adding a third).

Then a test that pins the shared shape, so the extraction is not a silent no-op:

```ts
  it("writes the same key material on the create and update arms", async () => {
    pushSubUpsertMock.mockResolvedValue({});

    await subscribeToPush({ ...STUB_SUB, timezone: "Europe/Berlin" });

    const call = pushSubUpsertMock.mock.calls[0][0];
    const core = { p256dh: "stub-p256dh", auth: "stub-auth", timezone: "Europe/Berlin" };
    expect(call.create).toMatchObject(core);
    expect(call.update).toMatchObject(core);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TZ=UTC npx vitest run server/actions/push.test.ts`
Expected: the `console.error` assertions FAIL — nothing is logged today. The shape test may already pass; keep it, it is the regression guard for step 4.

- [ ] **Step 3: Name the three caught errors**

In `server/actions/push.ts`, replace each of the three `} catch {` blocks with a bound error and a log, keeping the returned value **byte-identical** so no caller's behaviour changes:

```ts
  } catch (err) {
    console.error("[push] failed to save a push subscription:", err);
    return { ok: false, error: "Failed to save push subscription." };
  }
```
```ts
  } catch (err) {
    console.error("[push] failed to remove a push subscription:", err);
    return { ok: false, error: "Failed to remove push subscription." };
  }
```
```ts
  } catch (err) {
    console.error("[push] failed to heal a rotated push subscription:", err);
    return { ok: false, error: "Failed to heal push subscription.", reason: "internal" };
  }
```

- [ ] **Step 4: Extract the shared shape**

Add above `subscribeToPush`:

```ts
/**
 * The fields every write of a push subscription shares.
 *
 * `timezone` is OMITTED rather than nulled when the client did not send one:
 * writing `null` would wipe a good stored zone whenever an older client
 * re-subscribes, and a subscription with no zone never fires — the dispatcher
 * cannot know when 8pm is for it. Four call sites repeated this by hand
 * (CD-09); repeating it is how one of them ends up spelling it differently.
 */
function subscriptionCoreFields(
  keys: { p256dh: string; auth: string },
  timezone?: string,
): { p256dh: string; auth: string; timezone?: string } {
  return {
    p256dh: keys.p256dh,
    auth: keys.auth,
    ...(timezone ? { timezone } : {}),
  };
}
```

Then rewrite the four arms to spread it, **preserving every field each arm currently has and every comment attached to it**:

- `subscribeToPush` `create`: `{ userId: user.id, endpoint: sub.endpoint, label: deviceLabelFromUserAgent(sub.userAgent), lastSeenAt: new Date(), ...subscriptionCoreFields(sub.keys, sub.timezone) }` — keep the existing comment above `label`.
- `subscribeToPush` `update`: `{ userId: user.id, lastSeenAt: new Date(), ...subscriptionCoreFields(sub.keys, sub.timezone) }` — keep the whole `userId` comment block verbatim; it is `CD-02`'s record.
- `healRotatedSubscription`'s old-endpoint `update`: `{ endpoint: input.endpoint, ...subscriptionCoreFields(input.keys, input.timezone) }` — keep the "Deliberately NOT bumping `lastSeenAt`" comment, moving it above the spread so it still reads as an explanation of the absence.
- `healRotatedSubscription`'s upsert `create` and `update`: same treatment, keeping each arm's existing `lastSeenAt` behaviour (`create` sets it, `update` does not) and both of their long comments.

Delete the now-dead `const tz = sub.timezone ? { timezone: sub.timezone } : {};` line and its comment — the docblock above carries that reasoning now.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `TZ=UTC npx vitest run server/actions/push.test.ts`
Expected: PASS, whole file. The existing tests `"stores the device timezone on create and update"`, `"omits the timezone when the client did not send one"` and `"does not bump lastSeenAt on the upsert's update arm, but does on create"` are the ones that prove the extraction preserved behaviour — if any of them fails, the extraction is wrong, not the test.

- [ ] **Step 6: Confirm the file is consistent with itself**

Run: `grep -n "} catch {" server/actions/push.ts` — no hits. Run `grep -n "p256dh: " server/actions/push.ts` — the only hit should be inside `subscriptionCoreFields`.

- [ ] **Step 7: Typecheck, full suite and lint**

Run: `npx tsc --noEmit`, then `npm test`, then `npm run lint`. All green.

- [ ] **Step 8: Commit**

```bash
git add server/actions/push.ts server/actions/push.test.ts
git commit -m "refactor(push): one subscription shape builder, and errors with names

Four arms repeated the key-material shape by hand and three bare catch blocks
swallowed every failure in the file. Behaviour is unchanged; CD-02's upsert
reassignment is deliberately left alone.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 25: drain the backlog and verify the whole branch

The backlog's own working instructions (step 6, `docs/open-follow-ups.md:65-67`) say to strike an item when its fix lands — "that is the drain mechanism whose absence created this compile." It is done once, here, rather than per task, so no two tasks collide on the file. This is also the only task that runs `npm run build`.

**Files:**
- Modify: `docs/open-follow-ups.md` (move the closed entries to the *Struck* register; update the trust-statement table)

**Interfaces:**
- Consumes: the git log of this branch — each closed item's commit SHA.
- Produces: nothing. Terminal task.

- [ ] **Step 1: Collect the commits**

Run: `git log --oneline main..HEAD` and note the SHA for each of Tasks 1-24. You will cite them in step 3.

- [ ] **Step 2: Full verification**

Run, in order, and require all four green before touching the doc:

```bash
npx tsc --noEmit
npm test
npm run lint
npm run build
```

`npm run build` is slow and runs only here. If it fails, fix the cause in the task that introduced it and re-run everything — do not strike anything off a red branch. **`npm run build` must not be given production credentials and must not reach a database**; if it tries to, stop and report rather than supplying any.

- [ ] **Step 3: Strike the 40 closed items**

In `docs/open-follow-ups.md`, move each of these entries out of *Open items* and into the *Struck* register, appending `**Closed:** <commit sha>, <YYYY-MM-DD>` to each. Keep each entry's existing evidence text — the register is the record of what was fixed, not a summary.

| Item | Task | Item | Task |
|---|---|---|---|
| `HG-12` | 1 | `FN-10` | 16 |
| `AB-01` | 2 | `HG-06` | 16 |
| `OPS-08` | 3 | `FP-05` | 17 |
| `AB-02` | 4 | `FP-06` | 17 |
| `AB-03` | 5 | `FP-13` | 17 |
| `AB-04` | 6 | `FP-07` | 18 |
| `FN-07` | 7 | `HG-02` | 19 |
| `FN-11` | 8 | `HG-10` | 19 |
| `FP-10` | 8 | `HG-08` | 20 |
| `FP-11` | 8 | `CD-11` | 21 |
| `HG-09` | 9 | `RM-15` | 21 |
| `CD-01` | 10 | `CD-05` | 22 |
| `CD-10` | 11 | `CD-15` | 22 |
| `CD-13` | 12 | `CD-08` | 23 |
| `CD-14` | 12 | `CD-12` | 23 |
| `CP-17` | 13 | `CD-09` | 24 |
| `OPS-05` | 13 | `FN-04` | 15 |
| `FN-06` | 14 | `FN-08` | 15 |
| `FN-12` | 14 | `FN-09` | 15 |
| `FP-09` | 15 | `FP-12` | 15 |

`CP-17` and `OPS-05` are the same defect and close on the same commit; so are `HG-02` and `HG-10`. Strike both of each pair, citing the one commit.

When striking `CP-17`/`OPS-05`, note that the fix changed the **component's contract**, not what either page currently renders: `CostAmounts`'s `paidTotalMinor` prop now admits `null`, but Task 13's Step 5 makes every one of the 8 aggregate call sites on the Budget and Summary pages pass `sum > 0 ? sum : null`, reproducing today's `—` placeholder exactly wherever the aggregate is zero. The fix is real and closes both items, but do not describe it as a visible change on either page today — it protects the next caller with a genuine zero-but-paid value, which nothing currently supplies.

- [ ] **Step 4: Leave these two where they are, with a note**

`FN-05` and `CD-16` stay in *Open items*. Append one line to each, so the next reader knows they were considered and deliberately not built:

- Under `FN-05`: `- **Not swept 2026-09-21:** the fix needs a schema change and therefore a migration, which the sweep was forbidden from adding. Needs the operator's go-ahead first.`
- Under `CD-16`: `- **Not swept 2026-09-21:** deliberately deferred — the correct wording depends on how CD-07 is decided, and CD-07 is in *Needs a decision*. Do not update CONTEXT.md to describe behaviour that is about to change.`

- [ ] **Step 5: Update the trust-statement table**

The table at `docs/open-follow-ups.md:28-35` must still add to 127. After this sweep: *Already fixed — struck* becomes **84**, *Live — still open* becomes **2**. The other three rows (`5`, `12`, `24`) are unchanged. Add a sentence under the table: `Forty items were closed by the sweep on branch chore/follow-ups-triage-and-sweep (2026-09-21); the two that remain are annotated in place with why.`

Also update the sentence at `docs/open-follow-ups.md:117` — `42 items, every one re-verified...` — to say `2 items` and note the date the other 40 were struck.

- [ ] **Step 6: Check the arithmetic**

`grep -c "^### "` alone over the whole file overcounts: besides the *Open items* entries it also matches the five `### CD-0N` headings under *Needs a decision* (out of this plan's scope entirely) and the two `### ⚠ HG-0N` headings under *Still genuinely blocked* — none of those three sections is what you just edited. Scope the count to item headings inside *Open items* only:

```bash
awk '/^# Needs a decision/{exit} /^### [A-Z]+-[0-9]/{c++} END{print c}' docs/open-follow-ups.md
```

Run it now, after Step 3's edits: it must return **2** — `FN-05` and `CD-16`, the only two *Open items* headings left — matching the `Live — still open` row Step 5 just set to 2. (Run against the file before Step 3's edits, for your own sanity-check of the command, it returns **41, not 42**: `HG-02 / HG-10` is one heading carrying two IDs, so the heading count is one short of the item count by construction — that is the correction to make by hand, not a bug to chase.) If the post-edit run returns anything other than 2, an item was struck from the wrong section or left behind; find and fix it before committing.

- [ ] **Step 7: Re-run the suite**

Run: `npm test` then `npm run lint`. A docs-only change, but the branch must end green.

- [ ] **Step 8: Commit**

```bash
git add docs/open-follow-ups.md
git commit -m "docs(follow-ups): strike the 40 items the sweep closed

FN-05 (needs a migration) and CD-16 (waiting on CD-07) stay open, annotated
with why.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 9: Stop**

Do not merge. Do not deploy. Report the branch and the commit range to the operator, and say plainly that `FN-05` and `CD-16` were not built, and why. Merging is the operator's call, always.

---

## Not planned — two in-scope items this plan deliberately does not build

Both are `Open items` of an in-scope category. Neither is skipped for convenience; each is blocked by something this plan is explicitly not allowed to do.

### `FN-05` — a Feedback note does not survive its author (P2, mechanical, M)

`prisma/schema.prisma:738` still reads `author User @relation(fields: [authorId], references: [id], onDelete: Cascade)`. The fix shape is the treatment ADR 0040 already gave `tripId`/`tripName`: snapshot `authorName` at write time, and either drop the cascade or make `authorId` nullable with `onDelete: SetNull`.

**Every one of those requires a schema change, and therefore a migration.** Global Constraints forbid adding a migration without the operator's say-so, and there is no partial version that leaves the tree coherent — a `schema.prisma` change without its migration produces a generated client that expects columns production does not have. **Bring this to the operator as a decision about whether to add migration 27, then plan it on its own.** Read `docs/DEPLOY.md` §4b — including the write-path section Task 3 adds — before writing that plan.

### `CD-16` — `CONTEXT.md`'s **Digest** entry no longer describes truncation accurately (P3, docs, S)

`CONTEXT.md:190` describes a single global cap that always takes the tail, and never mentions the separate, silent per-section `DIGEST_MAX_CHECKLIST_LINES = 2` cap at `lib/digest.ts:88,168`, which drops excess Checklist lines *before* the global cap or its `+N more` indicator ever sees them.

The entry's own sequencing note says this must land with whatever `CD-07` is decided, **because the correct wording depends on that outcome** — and `CD-07` is in *Needs a decision*, which this plan does not touch. Writing the accurate-today wording now means rewriting it immediately after `CD-07` lands, and risks documenting behaviour that is about to change. **Fix it in the same commit as `CD-07`.**

---

## Self-review

Run against `docs/open-follow-ups.md`'s *Open items* sections with fresh eyes.

**1. Coverage.** All 42 in-scope items were walked. 40 map to a task; the two that do not are `FN-05` and `CD-16`, both documented above with the constraint that blocks them rather than left silent. Counts by priority: P0 1/1, P1 2/2, P2 9/10 (`FN-05` deferred), P3 28/29 (`CD-16` deferred). The pair-items are handled once each and struck twice: `CP-17`/`OPS-05` in Task 13, `HG-02`/`HG-10` in Task 19.

**2. Ordering.** `HG-12` leads as Task 1. Tasks 2-3 are P1, 4-12 are P2, 13-24 are P3, 25 is terminal. No task depends on a later one.

**3. Placeholders.** No task says "add appropriate error handling", "write tests for the above", or "similar to Task N". Every test step contains real assertions — the one place a step legitimately says "copy the file's existing fixture" (Tasks 6, 18, 19, 22) names the exact existing test to copy from and still writes the new assertions out in full. Task 10's five tests are deliberately written out five times rather than cross-referenced, because their mocks differ per file.

**4. Type and name consistency.** Names introduced in one task and used in another are consistent: `firstSearchParam` (Task 4, used only there), `paidAtDateOnlySchema` (Task 6), `guideLabelOnScreen` (Task 9), `toInboxNote`/`FeedbackNoteRow` (Task 14), `DOCKED_FROM` (produced Task 8, consumed Task 15), `canDelete` (Task 15), `overlayClassName`/`tp-fade-in-sheet` (Task 17), `DispatcherHealthData`/`now` (Task 22), `subscriptionCoreFields` (Task 24). `expectAccessCheckedBeforeWrite` is referenced by exact name in Task 10 and is stated to already exist at `test/helpers/access-order.ts`.

**5. Cross-task interaction.** Five shared surfaces are named in the register at the top, each with the specific thing the later task's reviewer must check — the `CD-18` lesson applied. The one value threaded across task boundaries, `forkId`, has an explicit "who feeds this?" note naming its existing source — the `CD-17` lesson applied.

**6. Empirical checks done while writing, so the plan does not prescribe something broken.** Task 9's whole-phrase matcher was run against the real `components/` and `app/` tree: exactly one label (`"Editing variant"`) newly fails and exactly one (`"Booking reference"`) is shadowed, both reconciled in the task. Task 19's `svg.lucide-map-pin` selector was verified against the installed `lucide-react`. Task 17's `overlayClassName` conflict resolution relies on `lib/cn.ts` being `twMerge(clsx(...))`, which it is.

**7. Constraint compliance.** No task runs a Prisma migration command, connects to a database, executes `npm run feedback:pull`/`feedback:resolve`, merges, or deploys. `npm run build` appears exactly once, in Task 25. Every commit message carries the required co-author trailer.
