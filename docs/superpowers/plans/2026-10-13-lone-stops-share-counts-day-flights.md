# Lone Stops, Share counts, flights from the Day view — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dated Trip's only Stop always carries the Trip's dates; Share links count rough Stops; a Traveller can add a flight from the Day view.

**Architecture:** One transactional helper, `scheduleLoneStopTx`, owns the lone-Stop rule and is called from every Stop/Trip-date write path (server actions) plus a SQL backfill migration. Share widens its `ShareStop` type so rough Stops flow through the counts and route list while dated sections filter to `scheduledShareStops`. The Day view gets a two-way add menu that opens the existing Item and Transport dialogs with day-derived defaults computed by a pure function.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching app code), Prisma 7 + Postgres, React 19, vitest (node project for `*.test.ts`, happy-dom for `*.test.tsx`), @testing-library/react, Tailwind.

**Spec:** `docs/specs/2026-10-13-lone-stops-share-counts-day-flights.md` (decisions D1–D8). ADR 0073. CONTEXT.md **Stop**, **Share link**, **Transport**, **Home base**.

## Global Constraints

- Verification tiers (CLAUDE.md): inner loop `npx vitest run <file>`; task done `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`; once per branch `npm test` + `npm run build` + `npm run test:integration`.
- Never run `npm run feedback:*` (the main session has already done so). Never touch production.
- Copy: glossary terms exactly — Stop, Trip, Share link, Transport, Home base, Item, Fork, real plan. Never "leg", "hotel", "location", "destination" in user-facing copy.
- Plan scope: a Fork has its own Stop rows (`forkId`); the real plan is `forkId = null` (`lib/plan-scope.ts`: `REAL_PLAN`, `planScope(forkId)`). The lone-Stop count is **per plan**. Trip dates are trip-wide.
- Dates are `"YYYY-MM-DD"` strings; compare with `<`/`>` on strings. `nightsBetween` lives in `lib/dates`.
- Commits: Conventional Commits subject, body saying which spec decision, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Tasks 2, 7 and 11 also carry a `Resolves-Feedback:` trailer (spec D8). Never run `feedback:resolve`.
- Commit only the files named in the task. `next dev` may re-add a block to `CLAUDE.md`; do not commit `CLAUDE.md`.

## Review Focus

1. A Fork with one rough Stop on a dated Trip while the real plan has three Stops: the rule schedules the Fork's Stop and leaves the real plan alone (Task 1 tests the per-plan count; Task 3 tests `updateTrip` fanning out across plans).
2. Trip dates changed so the lone Stop's old dates no longer match: the Stop follows the Trip (Task 3 test "follows new dates even when already scheduled").
3. Share on a Trip whose Stops are all rough: hero says "3 stops", route list lists them with nights, day-by-day section is absent, nothing throws on `nightsBetween(null, null)` (Task 7 page test).
4. Day view on a changeover day (arrive and depart on the same date for a one-night Stop): Transport defaults prefer the outbound leg (Task 9 test).
5. Transport form opened from the Day view on a Trip with no Home base: hint shows, form still saves with an unset endpoint (Task 10 test).

---

### Task 1: `scheduleLoneStopTx` helper

**Files:**
- Modify: `server/actions/stop-flow.ts` (append after `recomputeChapterSpans`, ~line 100)
- Test: `server/actions/stop-flow.lone-stop.test.ts` (new)

**Interfaces:**
- Consumes: `recomputeChapterSpans(tx, tripId, forkId)` (same file), `guessTimezoneForCountry(country)` from `@/lib/tz`, `planScope` from `@/lib/plan-scope`.
- Produces:
  ```ts
  export type LoneStopMode = "fill" | "follow";
  export async function scheduleLoneStopTx(
    tx: Prisma.TransactionClient,
    tripId: string,
    forkId: PlanId,
    mode: LoneStopMode,
  ): Promise<boolean>; // true when a Stop was rewritten
  ```
  `"fill"`: only a **rough** lone Stop is scheduled (Stop create / make rough / delete). `"follow"`: the lone Stop takes the Trip's dates whether rough or scheduled (Trip dates changed).

- [ ] **Step 1: Write the failing tests**

```ts
// server/actions/stop-flow.lone-stop.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { scheduleLoneStopTx } from "./stop-flow";

vi.mock("./stop-flow", async (orig) => {
  const mod = await orig<typeof import("./stop-flow")>();
  return { ...mod, recomputeChapterSpans: vi.fn() };
});

function tx(opts: {
  trip: { startDate: string | null; endDate: string | null } | null;
  stops: Array<{ id: string; arriveDate: string | null; departDate: string | null; timezone: string | null; country: string | null; countryCode: string | null }>;
}) {
  const update = vi.fn().mockResolvedValue({});
  const findMany = vi.fn().mockResolvedValue(opts.stops);
  return {
    client: {
      trip: { findUnique: vi.fn().mockResolvedValue(opts.trip) },
      stop: { findMany, update },
      chapter: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    } as never,
    update,
    findMany,
  };
}

const rough = { id: "s1", arriveDate: null, departDate: null, timezone: null, country: "Australia", countryCode: "au" };

describe("scheduleLoneStopTx (ADR 0073)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("schedules a rough lone Stop to the Trip's dates and derives its timezone", async () => {
    const t = tx({ trip: { startDate: "2026-11-04", endDate: "2026-11-05" }, stops: [rough] });
    await expect(scheduleLoneStopTx(t.client, "trip1", null, "fill")).resolves.toBe(true);
    expect(t.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip1", forkId: null } }));
    expect(t.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { arriveDate: "2026-11-04", departDate: "2026-11-05", nights: null, timezone: "Australia/Brisbane" },
    });
  });

  it("does nothing when the Trip has no end date", async () => {
    const t = tx({ trip: { startDate: "2026-11-04", endDate: null }, stops: [rough] });
    await expect(scheduleLoneStopTx(t.client, "trip1", null, "fill")).resolves.toBe(false);
    expect(t.update).not.toHaveBeenCalled();
  });

  it("does nothing when the plan has two Stops", async () => {
    const t = tx({ trip: { startDate: "2026-11-04", endDate: "2026-11-05" }, stops: [rough, { ...rough, id: "s2" }] });
    await expect(scheduleLoneStopTx(t.client, "trip1", null, "fill")).resolves.toBe(false);
    expect(t.update).not.toHaveBeenCalled();
  });

  it("counts per plan: a Fork's lone Stop is scoped by forkId", async () => {
    const t = tx({ trip: { startDate: "2026-11-04", endDate: "2026-11-05" }, stops: [rough] });
    await scheduleLoneStopTx(t.client, "trip1", "fork9", "fill");
    expect(t.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip1", forkId: "fork9" } }));
  });

  it("fill leaves a scheduled lone Stop alone", async () => {
    const scheduled = { ...rough, arriveDate: "2026-11-04", departDate: "2026-11-04", timezone: "Australia/Brisbane" };
    const t = tx({ trip: { startDate: "2026-11-04", endDate: "2026-11-05" }, stops: [scheduled] });
    await expect(scheduleLoneStopTx(t.client, "trip1", null, "fill")).resolves.toBe(false);
    expect(t.update).not.toHaveBeenCalled();
  });

  it("follow moves a scheduled lone Stop onto the Trip's dates and keeps its timezone", async () => {
    const scheduled = { ...rough, arriveDate: "2026-11-04", departDate: "2026-11-04", timezone: "Australia/Sydney" };
    const t = tx({ trip: { startDate: "2026-11-10", endDate: "2026-11-12" }, stops: [scheduled] });
    await expect(scheduleLoneStopTx(t.client, "trip1", null, "follow")).resolves.toBe(true);
    expect(t.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { arriveDate: "2026-11-10", departDate: "2026-11-12", nights: null, timezone: "Australia/Sydney" },
    });
  });

  it("follow is a no-op when the Stop already matches", async () => {
    const scheduled = { ...rough, arriveDate: "2026-11-04", departDate: "2026-11-05", timezone: "Australia/Brisbane" };
    const t = tx({ trip: { startDate: "2026-11-04", endDate: "2026-11-05" }, stops: [scheduled] });
    await expect(scheduleLoneStopTx(t.client, "trip1", null, "follow")).resolves.toBe(false);
  });
});
```

If `vi.mock` of the module under test proves awkward, drop that mock and instead give the fake client `chapter.findMany` returning `[]` so the real `recomputeChapterSpans` runs harmlessly (read its body first; add whatever `tx.*` it touches to the fake, each returning an empty result).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/actions/stop-flow.lone-stop.test.ts`
Expected: FAIL — `scheduleLoneStopTx` is not exported.

- [ ] **Step 3: Implement**

Append to `server/actions/stop-flow.ts` (add `import { guessTimezoneForCountry } from "@/lib/tz";` at the top):

```ts
export type LoneStopMode = "fill" | "follow";

/**
 * ADR 0073 — a dated Trip's only Stop takes the Trip's dates.
 *
 * "fill": only a rough lone Stop is scheduled (Stop create, make rough,
 * delete leaving one). "follow": the lone Stop takes the Trip's dates even
 * when already scheduled (Trip dates set or changed). Per plan: a Fork's
 * Stops are counted on their own. Returns true when a Stop was rewritten.
 */
export async function scheduleLoneStopTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  forkId: PlanId,
  mode: LoneStopMode,
): Promise<boolean> {
  const trip = await tx.trip.findUnique({ where: { id: tripId }, select: { startDate: true, endDate: true } });
  if (!trip?.startDate || !trip.endDate) return false;
  const stops = await tx.stop.findMany({
    where: { tripId, ...planScope(forkId) },
    select: { id: true, arriveDate: true, departDate: true, timezone: true, country: true, countryCode: true },
  });
  if (stops.length !== 1) return false;
  const [stop] = stops;
  if (mode === "fill" && stop.arriveDate) return false;
  if (stop.arriveDate === trip.startDate && stop.departDate === trip.endDate) return false;
  await tx.stop.update({
    where: { id: stop.id },
    data: {
      arriveDate: trip.startDate,
      departDate: trip.endDate,
      nights: null,
      timezone: stop.timezone ?? guessTimezoneForCountry(stop.countryCode ?? stop.country),
    },
  });
  await recomputeChapterSpans(tx, tripId, forkId);
  return true;
}
```

Check `guessTimezoneForCountry("au")` returns `"Australia/Brisbane"` by reading `COUNTRY_TO_TZ` in `lib/tz.ts`; if the map is keyed by country **name** only, pass `stop.country ?? stop.countryCode` instead and adjust the test's expectation to whatever the map yields for "australia".

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/actions/stop-flow.lone-stop.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Task-done checks and commit**

```bash
npx vitest related --run server/actions/stop-flow.ts && npx tsc --noEmit && npx eslint server/actions/stop-flow.ts server/actions/stop-flow.lone-stop.test.ts
git add server/actions/stop-flow.ts server/actions/stop-flow.lone-stop.test.ts
git commit -m "feat(stops): scheduleLoneStopTx — a dated Trip's only Stop takes the Trip's dates

ADR 0073, spec 2026-10-13 D1. Fill vs follow modes; per-plan count.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Run the rule on Stop create, make rough and delete

**Files:**
- Modify: `server/actions/stops.ts` — `createStop` (line ~117; both the insert-with-lock transaction path and the append path), `updateStop` rough branch (~444), `makeStopRough` (~1186), `deleteStop` (~543)
- Test: `server/actions/stops.test.ts` (existing mocks of `@/lib/db`; add cases)

**Interfaces:**
- Consumes: `scheduleLoneStopTx(tx, tripId, forkId, "fill")` from `./stop-flow`.
- Produces: no new exports. Behaviour: after each of those writes, a lone rough Stop on a dated Trip is scheduled in the same transaction.

- [ ] **Step 1: Read the action file's existing structure**

Read `server/actions/stops.ts` lines 117–420, 543–620 and 1186–1250, and the top 200 lines of `server/actions/stops.test.ts` to learn the `vi.hoisted` mock shape (`db.stop.create/update/delete`, `db.trip.findUnique`, `db.$transaction` — note whether `$transaction` is mocked to call its callback with `db` itself).

- [ ] **Step 2: Write the failing tests**

Add a `describe("lone Stop rule (ADR 0073)")` block to `server/actions/stops.test.ts`. Mock `./stop-flow` partially so the rule is observable without re-testing it:

```ts
vi.mock("./stop-flow", async (orig) => {
  const mod = await orig<typeof import("./stop-flow")>();
  return { ...mod, scheduleLoneStopTx: vi.fn().mockResolvedValue(false) };
});
import { scheduleLoneStopTx } from "./stop-flow";
```

Cases (use the file's existing fixtures for an authorised owner and a trip; the point of each test is the call, not the result):

```ts
it("createStop (append path) runs the lone-Stop fill for that plan", async () => {
  // arrange the mocks as the existing "creates a rough stop" test does
  await createStop("trip1", { mode: "rough", name: "Cairns", nights: 1 });
  expect(scheduleLoneStopTx).toHaveBeenCalledWith(expect.anything(), "trip1", null, "fill");
});

it("createStop (insert path) runs the fill inside the transaction with the Fork's id", async () => {
  await createStop("trip1", { mode: "rough", name: "Cairns", nights: 1 }, "fork9", "s0");
  expect(scheduleLoneStopTx).toHaveBeenCalledWith(expect.anything(), "trip1", "fork9", "fill");
});

it("updateStop to rough runs the fill", async () => {
  await updateStop("s1", { mode: "rough", name: "Cairns", nights: 2 });
  expect(scheduleLoneStopTx).toHaveBeenCalledWith(expect.anything(), "trip1", null, "fill");
});

it("makeStopRough runs the fill", async () => {
  await makeStopRough("s1");
  expect(scheduleLoneStopTx).toHaveBeenCalledWith(expect.anything(), "trip1", null, "fill");
});

it("deleteStop runs the fill for the deleted Stop's plan", async () => {
  await deleteStop("s1");
  expect(scheduleLoneStopTx).toHaveBeenCalledWith(expect.anything(), "trip1", null, "fill");
});
```

Fixture notes: the Stop fixture must carry `forkId: null` (or the Fork id) and `tripId: "trip1"` since the actions read `stop.forkId` to scope the rule. Check `expectAccessCheckedBeforeWrite` usage in neighbouring tests and keep the access mocks as they do.

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run server/actions/stops.test.ts -t "lone Stop rule"`
Expected: FAIL — `scheduleLoneStopTx` never called.

- [ ] **Step 4: Implement**

In `server/actions/stops.ts`:

- `createStop`, insert path: inside the existing `db.$transaction`, after the `tx.stop.create` (both rough and scheduled branches) and after any `recomputeChapterSpans`, add `await scheduleLoneStopTx(tx, tripId, forkId ?? null, "fill");`.
- `createStop`, append path (no transaction today): wrap the `db.stop.create` call for **both** rough and scheduled branches in `db.$transaction(async (tx) => { const created = await tx.stop.create(...); await scheduleLoneStopTx(tx, tripId, forkId ?? null, "fill"); return created; })`. Keep `recordPlanActivity` and `revalidatePath` after the transaction as they are.
- `updateStop`, rough branch: change the bare `db.stop.update` into `db.$transaction(async (tx) => { const updated = await tx.stop.update(...); await scheduleLoneStopTx(tx, stop.tripId, stop.forkId, "fill"); return updated; })`. (`stop` is the row already loaded for the access check; confirm it selects `forkId`, add it to the select if not.)
- `makeStopRough`: inside its transaction, after `recomputeChapterSpans`, add `await scheduleLoneStopTx(tx, stop.tripId, stop.forkId, "fill");`. Net effect on a dated Trip with one Stop: making it rough is immediately undone, which is the ADR's intent; Task 5 hides the menu entry so this path is only reachable via MCP.
- `deleteStop`: inside its transaction, after `cleanupTargetSideDataTx`, add `await scheduleLoneStopTx(tx, stop.tripId, stop.forkId, "fill");`.

Import: `import { scheduleLoneStopTx } from "./stop-flow";` (the file already imports other helpers from there; extend that import).

- [ ] **Step 5: Run to verify they pass, plus the whole file**

Run: `npx vitest run server/actions/stops.test.ts`
Expected: PASS. If an existing test asserted `db.stop.create` was called directly (not through `$transaction`), update that test to match the new transactional shape; do not weaken what it checks.

- [ ] **Step 6: Task-done checks and commit**

```bash
npx vitest related --run server/actions/stops.ts && npx tsc --noEmit && npx eslint server/actions/stops.ts server/actions/stops.test.ts
git add server/actions/stops.ts server/actions/stops.test.ts
git commit -m "feat(stops): a dated Trip's only Stop is scheduled on create, make rough and delete

ADR 0073, spec 2026-10-13 D1. The rule runs inside each write's transaction
for the plan the write touched. MCP add_stop/update_stop/make_stop_rough
inherit it through these actions.

Resolves-Feedback: cmv6etj40000306kz0gfk79br
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Run the rule when Trip dates are set or changed

**Files:**
- Modify: `server/actions/trips.ts` — `createTrip` (~43, inside its transaction after the Stop rows are created), `updateTrip` (~214/270)
- Test: `server/actions/trips.test.ts` (existing mocks; add cases)

**Interfaces:**
- Consumes: `scheduleLoneStopTx` from `./stop-flow`; `db.fork.findMany({ where: { tripId }, select: { id: true } })`.
- Produces: none.

- [ ] **Step 1: Write the failing tests**

In `server/actions/trips.test.ts`, mock `./stop-flow` the same partial way as Task 2 and add:

```ts
it("createTrip runs the lone-Stop fill for the real plan inside the transaction", async () => {
  // arrange as the existing past-trip-with-stops test does
  await createTrip({ name: "Cairns Work", startDate: "2026-11-04", endDate: "2026-11-05", past: true, stops: [{ name: "Cairns", nights: 1 }] } as never);
  expect(scheduleLoneStopTx).toHaveBeenCalledWith(expect.anything(), expect.any(String), null, "fill");
});

it("updateTrip with changed dates follows for the real plan and every Fork", async () => {
  db.trip.findUnique.mockResolvedValue({ id: "trip1", startDate: "2026-11-04", endDate: "2026-11-05", /* …fixture fields… */ });
  db.fork.findMany.mockResolvedValue([{ id: "forkA" }, { id: "forkB" }]);
  await updateTrip("trip1", { name: "Cairns Work", startDate: "2026-11-10", endDate: "2026-11-12" } as never);
  expect(scheduleLoneStopTx).toHaveBeenCalledWith(expect.anything(), "trip1", null, "follow");
  expect(scheduleLoneStopTx).toHaveBeenCalledWith(expect.anything(), "trip1", "forkA", "follow");
  expect(scheduleLoneStopTx).toHaveBeenCalledWith(expect.anything(), "trip1", "forkB", "follow");
});

it("updateTrip with unchanged dates does not run the rule", async () => {
  db.trip.findUnique.mockResolvedValue({ id: "trip1", startDate: "2026-11-04", endDate: "2026-11-05" });
  await updateTrip("trip1", { name: "Renamed", startDate: "2026-11-04", endDate: "2026-11-05" } as never);
  expect(scheduleLoneStopTx).not.toHaveBeenCalled();
});
```

Add `fork: { findMany: vi.fn() }` to the hoisted db mock if absent. Read how `updateTrip` loads the current Trip (it may already `findUnique` for the access check; if it only runs `requireTripAccess`, add a `select: { startDate, endDate }` read before the update).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/actions/trips.test.ts -t "lone-Stop|unchanged dates"`
Expected: FAIL.

- [ ] **Step 3: Implement**

`createTrip`: inside the `db.$transaction`, after the loop that creates Stop rows, add `await scheduleLoneStopTx(tx, trip.id, null, "fill");` (the created trip variable is whatever the transaction already names it).

`updateTrip`: load `{ startDate, endDate }` before writing (reuse the existing read if one exists). After computing the update, if `input.startDate !== before.startDate || input.endDate !== before.endDate`, run:

```ts
await db.$transaction(async (tx) => {
  await tx.trip.update({ where: { id: tripId }, data });        // the existing update, moved inside
  const forks = await tx.fork.findMany({ where: { tripId }, select: { id: true } });
  for (const forkId of [null, ...forks.map((f) => f.id)]) {
    await scheduleLoneStopTx(tx, tripId, forkId, "follow");
  }
});
```

Otherwise keep the plain `db.trip.update`. Leave the `revalidatePath` calls where they are; also add `revalidatePath(\`/trips/${tripId}/plan\`)` if the file doesn't already revalidate the trip root (it does — `/trips/${tripId}` covers nested routes only if the file relies on that; check the pattern used elsewhere in the file and follow it).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run server/actions/trips.test.ts`
Expected: PASS.

- [ ] **Step 5: Task-done checks and commit**

```bash
npx vitest related --run server/actions/trips.ts && npx tsc --noEmit && npx eslint server/actions/trips.ts server/actions/trips.test.ts
git add server/actions/trips.ts server/actions/trips.test.ts
git commit -m "feat(trips): a Trip's dates pull its only Stop along, in every plan

ADR 0073, spec 2026-10-13 D1: follow mode on updateTrip when dates change;
fill mode on createTrip for past trips created with one Stop.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Backfill migration

**Files:**
- Create: `prisma/migrations/20261013120000_lone_stop_takes_trip_dates/migration.sql`
- Test: `test/integration/lone-stop-rule.test.ts` (new; runs under `npm run test:integration`)
- Modify: `docs/DEPLOY.md` — add a pre-deploy count line in the section that holds the `digest_and_alarms` count gate template (~lines 155–185); read that section and match its format.

**Interfaces:** none.

- [ ] **Step 1: Write the migration**

```sql
-- ADR 0073: a dated Trip's only Stop takes the Trip's dates.
-- One-off backfill for Trips already in the lone-rough-Stop state. Per plan:
-- the real plan (forkId IS NULL) and each Fork count their own Stops.
-- Timezone is left as-is (NULL reads as UTC); the app fills it on the next
-- write that fires the rule.
--
-- Rehearsal count (DEPLOY.md): run before deploying, record the number.
--   SELECT count(*) FROM "Stop" s JOIN "Trip" t ON t."id" = s."tripId"
--   WHERE t."startDate" IS NOT NULL AND t."endDate" IS NOT NULL AND s."arriveDate" IS NULL
--     AND (SELECT count(*) FROM "Stop" s2 WHERE s2."tripId" = s."tripId"
--          AND s2."forkId" IS NOT DISTINCT FROM s."forkId") = 1;
UPDATE "Stop" s
SET "arriveDate" = t."startDate",
    "departDate" = t."endDate",
    "nights"     = NULL
FROM "Trip" t
WHERE t."id" = s."tripId"
  AND t."startDate" IS NOT NULL
  AND t."endDate" IS NOT NULL
  AND s."arriveDate" IS NULL
  AND (SELECT count(*) FROM "Stop" s2
       WHERE s2."tripId" = s."tripId"
         AND s2."forkId" IS NOT DISTINCT FROM s."forkId") = 1;
```

Confirm the quoted column names against `prisma/schema.prisma` (`@map` on Stop/Trip, if any) and against an existing migration that touches `"Stop"`.

- [ ] **Step 2: Apply it to the local database**

Run: `npx prisma migrate deploy` (uses `.env` → local `host.docker.internal`). Expected: the new migration applies with no error. Then `npx prisma migrate status` reports the database is up to date.

- [ ] **Step 3: Write the integration test**

```ts
// test/integration/lone-stop-rule.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/guards", () => ({
  // copy the shape test/integration/locking.test.ts uses, resolving to the seeded user
}));
import { db } from "@/lib/db";
import { createStop, deleteStop } from "@/server/actions/stops";

describe.skipIf(process.env.INTEGRATION !== "1")("lone Stop rule end to end (ADR 0073)", () => {
  let tripId: string;
  beforeAll(async () => {
    // seed a user + trip the way locking.test.ts does
    const trip = await db.trip.create({ data: { /* as locking.test.ts, with */ startDate: "2026-11-04", endDate: "2026-11-05" } });
    tripId = trip.id;
  });
  afterAll(async () => { await db.trip.deleteMany({ where: { id: tripId } }); });

  it("the first rough Stop on a dated Trip is scheduled to the Trip's dates", async () => {
    await createStop(tripId, { mode: "rough", name: "Crystalbrook Flynn Cairns", country: "Australia", nights: 1 });
    const stops = await db.stop.findMany({ where: { tripId } });
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({ arriveDate: "2026-11-04", departDate: "2026-11-05", nights: null });
  });

  it("a second Stop may be rough; deleting the first schedules the survivor", async () => {
    await createStop(tripId, { mode: "rough", name: "Port Douglas", nights: 2 });
    const [first, second] = await db.stop.findMany({ where: { tripId }, orderBy: { sortOrder: "asc" } });
    expect(second.arriveDate).toBeNull();
    await deleteStop(first.id);
    const survivor = await db.stop.findUnique({ where: { id: second.id } });
    expect(survivor).toMatchObject({ arriveDate: "2026-11-04", departDate: "2026-11-05" });
  });
});
```

Fill the seed and guard mocks by copying from `test/integration/locking.test.ts` verbatim (it is the house pattern); the plan does not reproduce it because the exact user/membership columns live there.

- [ ] **Step 4: Run the integration test**

Run: `npm run test:integration -- lone-stop-rule` (if the docker-compose DB is up; `test/helpers/local-db.ts` names the URL). Expected: PASS. If the DB is not up, say so in the task report; the branch-level step runs it later.

- [ ] **Step 5: DEPLOY.md note, checks and commit**

Add one bullet under the pre-deploy gate section of `docs/DEPLOY.md`: "`20261013120000_lone_stop_takes_trip_dates` — run the count in the migration header first; expect a handful of rows (Cairns Work is one)."

```bash
npx tsc --noEmit && npx eslint test/integration/lone-stop-rule.test.ts
git add prisma/migrations/20261013120000_lone_stop_takes_trip_dates/migration.sql test/integration/lone-stop-rule.test.ts docs/DEPLOY.md
git commit -m "feat(db): backfill — a dated Trip's lone rough Stop takes the Trip's dates

ADR 0073, spec 2026-10-13 D2. Per plan (forkId IS NOT DISTINCT FROM).
Integration test covers create and delete-leaving-one end to end.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: No dead-end entry — Add Stop sheet and Stop menus

**Files:**
- Modify: `components/plan/mobile/add-stop-sheet.tsx` (props ~37–48, mode default ~75, toggle ~157–162, range default ~78)
- Modify: `components/trip/itinerary-manager.tsx:2436-2446` (pass `tripEndDate`), `:1867-1882` (new flag)
- Modify: `components/plan/stop-actions.ts` (flags type ~23, `make-rough` entry)
- Modify: `components/plan/mobile/stop-sheet.tsx` only if it renders a Make rough control (grep `onMakeRough`); otherwise untouched
- Test: `components/plan/mobile/add-stop-sheet.test.tsx`, `components/plan/stop-actions.test.ts`

**Interfaces:**
- Produces: `AddStopSheetProps.tripEndDate?: string`; `StopActionFlags.loneOnDatedTrip: boolean`.

- [ ] **Step 1: Write the failing tests**

`components/plan/mobile/add-stop-sheet.test.tsx` (follow the file's existing render helper and mocks):

```ts
it("the first Stop on a dated Trip has no Roughly choice and takes the Trip's dates", async () => {
  renderSheet({ stops: [], tripStartDate: "2026-11-04", tripEndDate: "2026-11-05" });
  expect(screen.queryByRole("radio", { name: "Roughly" })).toBeNull();
  // the mocked RangeCalendar in this file exposes its start/end — assert both equal the Trip's dates
  expect(screen.getByTestId("range-start")).toHaveTextContent("2026-11-04");
  expect(screen.getByTestId("range-end")).toHaveTextContent("2026-11-05");
});

it("a second Stop on a dated Trip can still be rough", () => {
  renderSheet({ stops: [datedStop], tripStartDate: "2026-11-04", tripEndDate: "2026-11-05" });
  expect(screen.getByRole("radio", { name: "Roughly" })).toBeInTheDocument();
});

it("the first Stop on a date-less Trip can be rough", () => {
  renderSheet({ stops: [] });
  expect(screen.getByRole("radio", { name: "Roughly" })).toBeInTheDocument();
});
```

Read the file's `RangeCalendar` mock; if it does not expose the range, extend the mock to render `<span data-testid="range-start">{start}</span>` and `range-end`. `SegmentedItem` may render as `role="radio"` or `"tab"`; read `components/ui/segmented.tsx` and use the real role.

`components/plan/stop-actions.test.ts`:

```ts
it("a lone Stop on a dated Trip has no Make rough", () => {
  const groups = buildStopActions(datedStop, { ...flags, loneOnDatedTrip: true }, handlers);
  expect(groups.flat().map((a) => a.key)).not.toContain("make-rough");
});
it("a dated Stop with neighbours keeps Make rough", () => {
  const groups = buildStopActions(datedStop, { ...flags, loneOnDatedTrip: false }, handlers);
  expect(groups.flat().map((a) => a.key)).toContain("make-rough");
});
```

Update the file's shared `flags` fixture to include `loneOnDatedTrip: false`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/plan/mobile/add-stop-sheet.test.tsx components/plan/stop-actions.test.ts`
Expected: FAIL (type error on the new flag / Roughly still rendered).

- [ ] **Step 3: Implement**

`add-stop-sheet.tsx`:
```ts
// props
tripEndDate?: string;
// in AddStopForm
const loneOnDatedTrip = stops.length === 0 && Boolean(tripStartDate && tripEndDate);
const [mode, setMode] = React.useState<Mode>(() => (loneOnDatedTrip || last?.arriveDate || tripStartDate ? "exact" : "rough"));
const [range, setRange] = React.useState<{ start?: string; end?: string }>(() =>
  loneOnDatedTrip
    ? { start: tripStartDate, end: tripEndDate }
    : { start: defaultRange?.arriveDate || undefined, end: defaultRange?.departDate || undefined },
);
```
Render the Segmented toggle only when `!loneOnDatedTrip`; keep the `HOW LONG` label and the calendar. Add a one-line helper under the label when `loneOnDatedTrip`: `<p className="text-[13px] font-semibold text-muted-foreground">Your only Stop takes the Trip's dates. Add a second Stop to split them.</p>`.

`itinerary-manager.tsx:2436`: pass `tripEndDate={tripEndDate}` (the variable is already in scope at line ~1434).

`stop-actions.ts`: add `loneOnDatedTrip: boolean` to `StopActionFlags`; destructure it; when building the dated group, push the `make-rough` item only if `!loneOnDatedTrip`.

`itinerary-manager.tsx:1867`: pass `loneOnDatedTrip: stops.length === 1 && Boolean(tripStartDate && tripEndDate)`.

Grep `components/plan/mobile/stop-sheet.tsx` for `onMakeRough`; if the sheet has its own Make rough button, gate it on the same flag passed through its props (add `loneOnDatedTrip?: boolean` to `StopSheetProps`, pass from the manager).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run components/plan/mobile/add-stop-sheet.test.tsx components/plan/stop-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Task-done checks and commit**

```bash
npx vitest related --run components/plan/mobile/add-stop-sheet.tsx components/plan/stop-actions.ts components/trip/itinerary-manager.tsx && npx tsc --noEmit && npx eslint components/plan/mobile/add-stop-sheet.tsx components/plan/stop-actions.ts components/trip/itinerary-manager.tsx components/plan/mobile/add-stop-sheet.test.tsx components/plan/stop-actions.test.ts
git add components/plan/mobile/add-stop-sheet.tsx components/plan/mobile/add-stop-sheet.test.tsx components/plan/stop-actions.ts components/plan/stop-actions.test.ts components/trip/itinerary-manager.tsx
git commit -m "feat(plan): the first Stop on a dated Trip is exact, prefilled with the Trip's dates

ADR 0073, spec 2026-10-13 D3. No Roughly on the Add-a-stop sheet and no
Make rough on the menu while the Stop would be the Trip's only one.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Share loads rough Stops — lib layer

**Files:**
- Modify: `lib/share-lookup.ts:47-90` (`ShareStop`, `loadShareStops`)
- Modify: `lib/share-view.ts` (add `scheduledShareStops`, `shareStopNights`; `shareTally` unchanged in signature)
- Test: `lib/share-lookup.test.ts` (exists? if not, create), `lib/share-view.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/share-lookup.ts
  export type ShareStop = { id; name; country; lat; lng; sortOrder;
    timezone: string; arriveDate: string | null; departDate: string | null; nights: number | null };
  export type ScheduledShareStop = ShareStop & { arriveDate: string; departDate: string };
  // lib/share-view.ts
  export function scheduledShareStops(stops: readonly ShareStop[]): ScheduledShareStop[];
  export function shareStopNights(s: Pick<ShareStop, "arriveDate" | "departDate" | "nights">): number;
  ```

- [ ] **Step 1: Write the failing tests**

`lib/share-view.test.ts` (append):
```ts
describe("rough Stops on Share (ADR 0073)", () => {
  const rough = { id: "r", name: "Bali", country: "Indonesia", lat: null, lng: null, sortOrder: 2, timezone: "UTC", arriveDate: null, departDate: null, nights: 4 };
  const dated = { ...rough, id: "d", sortOrder: 1, arriveDate: "2026-11-04", departDate: "2026-11-05", nights: null };
  it("scheduledShareStops keeps only dated Stops", () => {
    expect(scheduledShareStops([rough, dated]).map((s) => s.id)).toEqual(["d"]);
  });
  it("shareStopNights reads dates when present, else the rough nights, else 0", () => {
    expect(shareStopNights(dated)).toBe(1);
    expect(shareStopNights(rough)).toBe(4);
    expect(shareStopNights({ arriveDate: null, departDate: null, nights: null })).toBe(0);
  });
  it("shareTally counts rough Stops", () => {
    expect(shareTally([rough, dated], 5).stops).toBe(2);
  });
});
```

`lib/share-lookup.test.ts`: mock `@/lib/db` (`stop.findMany`) and assert `loadShareStops("t")` queries `where: { tripId: "t", forkId: null }` with **no** `arriveDate` filter, selects `nights`, and returns rows with `nights` and nullable dates in `orderPlanStops` order.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/share-view.test.ts lib/share-lookup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/share-lookup.ts`:
```ts
export type ShareStop = {
  id: string; name: string; country: string | null; lat: number | null; lng: number | null;
  timezone: string; arriveDate: string | null; departDate: string | null; nights: number | null; sortOrder: number;
};
export type ScheduledShareStop = ShareStop & { arriveDate: string; departDate: string };

export async function loadShareStops(tripId: string): Promise<ShareStop[]> {
  const rawStops = await db.stop.findMany({
    // ADR 0073: rough Stops are part of the shared route; dated sections filter with scheduledShareStops.
    where: { tripId, ...REAL_PLAN },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, country: true, lat: true, lng: true, timezone: true, arriveDate: true, departDate: true, nights: true, sortOrder: true },
  });
  return orderPlanStops(rawStops.map((s) => ({ ...s, timezone: s.timezone ?? "UTC" })));
}
```
Check `orderPlanStops`'s `OrderableStop` constraint accepts nullable dates (it orders the plan editor's mixed lists, so it should); if it narrows, read `lib/plan-order.ts` and use the mixed-order function it exposes.

`lib/share-view.ts`:
```ts
export function scheduledShareStops(stops: readonly ShareStop[]): ScheduledShareStop[] {
  return stops.filter((s): s is ScheduledShareStop => s.arriveDate !== null && s.departDate !== null);
}
export function shareStopNights(s: Pick<ShareStop, "arriveDate" | "departDate" | "nights">): number {
  return s.arriveDate && s.departDate ? nightsBetween(s.arriveDate, s.departDate) : (s.nights ?? 0);
}
```
Import `ShareStop`/`ScheduledShareStop` types from `./share-lookup` (type-only import; check for an import cycle — `share-lookup` must not import `share-view` at runtime; if it does, move the two types to `lib/share-types.ts` and re-export).

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run lib/share-view.test.ts lib/share-lookup.test.ts && npx tsc --noEmit`
Expected: tests PASS; `tsc` **fails** in `app/share/[token]/page.tsx`, `opengraph-image.tsx`, `copy-route-from-share.ts` where `arriveDate` is now nullable. That is expected and Task 7/8 fix it. Do not commit a red `tsc` on its own: fold Task 7's page changes in only if the reviewer asks; otherwise commit now with the body noting the follow-up and run Task 7 immediately.

- [ ] **Step 5: Commit**

```bash
npx eslint lib/share-lookup.ts lib/share-view.ts lib/share-view.test.ts lib/share-lookup.test.ts
git add lib/share-lookup.ts lib/share-view.ts lib/share-view.test.ts lib/share-lookup.test.ts
git commit -m "feat(share): loadShareStops returns rough Stops; scheduledShareStops filters dated sections

ADR 0073, spec 2026-10-13 D4 (lib half; the page follows in the next commit).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Share page counts and lists rough Stops

**Files:**
- Modify: `app/share/[token]/page.tsx` (lines ~132, 209–216, 264, 358, 372–387, 443–445, 469, 483, 502–521, 536, 559, 577–594)
- Modify: `app/share/[token]/share-route-list.tsx:8-17` (`RouteListStop`), rendering of the dates line
- Modify: `app/share/[token]/opengraph-image.tsx:22` and `lib/share-og.ts` (`shareOgModel` takes `stopCount` separately or accepts nullable dates — read it and pick the smaller change)
- Test: `app/share/[token]/share-route-list.test.tsx`, `app/share/[token]/page.test.tsx` (exists? else create a model-level test by extracting the view-model build into `lib/share-view.ts` — prefer extracting `buildRouteListStops(stops, statuses)` so it is testable without rendering the page)

**Interfaces:**
- Consumes: `scheduledShareStops`, `shareStopNights` (Task 6).
- Produces: `RouteListStop.arriveDate: string | null; departDate: string | null; nights: number`.

- [ ] **Step 1: Write the failing tests**

`share-route-list.test.tsx`:
```ts
it("a rough Stop lists with its nights and no dates", () => {
  render(<ShareRouteList stage="before" stops={[
    { id: "d", name: "Cairns", country: "Australia", sortOrder: 0, arriveDate: "2026-11-04", departDate: "2026-11-05", nights: 1, status: "future" },
    { id: "r", name: "Bali", country: "Indonesia", sortOrder: 1, arriveDate: null, departDate: null, nights: 4, status: "future" },
  ]} /* other required props as the file's existing tests pass them */ />);
  expect(screen.getByText("Bali")).toBeInTheDocument();
  expect(screen.getByText(/4 nights/)).toBeInTheDocument();
  expect(screen.getByText(/Dates to come/)).toBeInTheDocument();
});
```

`lib/share-view.test.ts` (append):
```ts
it("buildRouteListStops keeps rough Stops in plan order with their nights", () => {
  const out = buildRouteListStops([dated, rough], new Map([["d", "past"]]));
  expect(out.map((s) => [s.id, s.nights, s.status])).toEqual([["d", 1, "past"], ["r", 4, "future"]]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run app/share/[token]/share-route-list.test.tsx lib/share-view.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `lib/share-view.ts` add:
```ts
export type RouteListStopModel = { id: string; name: string; country: string | null; sortOrder: number;
  arriveDate: string | null; departDate: string | null; nights: number; status: StopStatus };
export function buildRouteListStops(stops: readonly ShareStop[], statuses: ReadonlyMap<string, StopStatus>): RouteListStopModel[] {
  return stops.map((s) => ({ id: s.id, name: s.name, country: s.country, sortOrder: s.sortOrder,
    arriveDate: s.arriveDate, departDate: s.departDate, nights: shareStopNights(s), status: statuses.get(s.id) ?? "future" }));
}
```

In `page.tsx`:
- `const stops = await loadShareStops(tripId); const scheduled = scheduledShareStops(stops);`
- Everything that needs dates or coordinates uses `scheduled`: `currentTripTimezone`, the `stops.map(...)` at 216 if it feeds dated views, line 264, `stopStatuses(scheduled, …)`, `currentStop`/`nextStopAfter`, `zoneOf`, `groupDaysByStop(itinerary, scheduled.map(s => s.id))`, `dayStops`, line 469/504 `nightsBetween`, `coverStops`, `mapStops`, and `days: scheduled.length > 0 && (...)` at 521.
- Counts use all Stops: `stopCount={stops.length}` (hero 536, CTA 594), `shareTally(stops, totalNights)`.
- Route list: `stops={buildRouteListStops(stops, statuses)}`; delete the inline mapping at 577–589.

`share-route-list.tsx`: widen `RouteListStop` to the model above (or import `RouteListStopModel`). Where it renders `formatDateRangeCompact(stop.arriveDate, stop.departDate)`, render instead:
```tsx
{stop.arriveDate && stop.departDate ? formatDateRangeCompact(stop.arriveDate, stop.departDate) : "Dates to come"}
```
Keep the existing `formatNights(stop.nights)` line.

`opengraph-image.tsx` / `lib/share-og.ts`: pass `scheduledShareStops(stops)` where it needs dates and `stops.length` for the count; read `shareOgModel` and add a `stopCount` input if it derives the count from the array.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run app/share lib/share-view.test.ts && npx tsc --noEmit`
Expected: PASS and green `tsc` except `server/actions/copy-route-from-share.ts` (Task 8).

- [ ] **Step 5: Commit**

```bash
npx eslint 'app/share/[token]/page.tsx' 'app/share/[token]/share-route-list.tsx' 'app/share/[token]/opengraph-image.tsx' lib/share-og.ts lib/share-view.ts
git add 'app/share/[token]/page.tsx' 'app/share/[token]/share-route-list.tsx' 'app/share/[token]/share-route-list.test.tsx' 'app/share/[token]/opengraph-image.tsx' lib/share-og.ts lib/share-view.ts lib/share-view.test.ts
git commit -m "feat(share): a Share link counts and lists rough Stops

ADR 0073, spec 2026-10-13 D4. Hero, tally, social image and Use this route
count every Stop of the real plan; the route list shows a rough Stop's
nights with 'Dates to come'; day-by-day, Right now and the map stay
scheduled-only.

Resolves-Feedback: cmv6etj40000306kz0gfk79br
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Route copy carries rough Stops

**Files:**
- Modify: `server/actions/copy-route-from-share.ts:21-40` (`routeStopsFromShare`)
- Test: `server/actions/copy-route-from-share.test.ts` (exists; add a case)

- [ ] **Step 1: Write the failing test**

```ts
it("a rough Stop is copied with its rough nights", async () => {
  // mock loadShareStops to return one dated and one rough Stop (shape from lib/share-lookup ShareStop)
  const stops = await routeStopsFromShare("tok");
  expect(stops.map((s) => [s.name, s.nights])).toEqual([["Cairns", 1], ["Bali", 4]]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/actions/copy-route-from-share.test.ts`
Expected: FAIL (type or value).

- [ ] **Step 3: Implement**

Replace `nights: nightsBetween(s.arriveDate, s.departDate)` with `nights: shareStopNights(s)` (import from `@/lib/share-view`).

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run server/actions/copy-route-from-share.test.ts && npx tsc --noEmit && npx eslint server/actions/copy-route-from-share.ts server/actions/copy-route-from-share.test.ts
git add server/actions/copy-route-from-share.ts server/actions/copy-route-from-share.test.ts
git commit -m "feat(share): Use this route copies rough Stops too

ADR 0073, spec 2026-10-13 D4.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`tsc` must be fully green after this task.

---

### Task 9: Day-view Transport defaults (pure) and loader fields

**Files:**
- Create: `lib/day-transport-defaults.ts`
- Test: `lib/day-transport-defaults.test.ts`
- Modify: `lib/day-view-loader.ts` — `DayViewData.stop` gains `arriveDate: string; departDate: string` (lines ~93 type, ~747 build); `stopOptions` gains `departDate: string | null; timezone: string | null; sortOrder: number` (~93, ~466)

**Interfaces:**
- Produces:
  ```ts
  export type DayTransportDefaults = { fromStopId?: string; toStopId?: string };
  export function dayTransportDefaults(
    date: string,
    stop: { id: string; arriveDate: string; departDate: string } | null,
    homeEndpoint: string, // pass HOME_ENDPOINT from components/trip/transport-endpoints
  ): DayTransportDefaults;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/day-transport-defaults.test.ts
import { describe, it, expect } from "vitest";
import { dayTransportDefaults } from "./day-transport-defaults";
const HOME = "__home__";
const stop = { id: "s1", arriveDate: "2026-11-04", departDate: "2026-11-06" };
describe("dayTransportDefaults (spec 2026-10-13 D5)", () => {
  it("arrive day: Home base to the Stop", () => {
    expect(dayTransportDefaults("2026-11-04", stop, HOME)).toEqual({ fromStopId: HOME, toStopId: "s1" });
  });
  it("depart day: the Stop to Home base", () => {
    expect(dayTransportDefaults("2026-11-06", stop, HOME)).toEqual({ fromStopId: "s1", toStopId: HOME });
  });
  it("mid-stay: from the Stop, destination unset", () => {
    expect(dayTransportDefaults("2026-11-05", stop, HOME)).toEqual({ fromStopId: "s1" });
  });
  it("arrive and depart on the same day prefers the outbound leg", () => {
    expect(dayTransportDefaults("2026-11-04", { ...stop, departDate: "2026-11-04" }, HOME)).toEqual({ fromStopId: HOME, toStopId: "s1" });
  });
  it("no Stop: both unset", () => {
    expect(dayTransportDefaults("2026-11-05", null, HOME)).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/day-transport-defaults.test.ts` — FAIL, module missing.

- [ ] **Step 3: Implement**

```ts
// lib/day-transport-defaults.ts
export type DayTransportDefaults = { fromStopId?: string; toStopId?: string };

/** Which Transport a Traveller most likely means when adding one from a given day (spec 2026-10-13 D5). */
export function dayTransportDefaults(
  date: string,
  stop: { id: string; arriveDate: string; departDate: string } | null,
  homeEndpoint: string,
): DayTransportDefaults {
  if (!stop) return {};
  if (date === stop.arriveDate) return { fromStopId: homeEndpoint, toStopId: stop.id };
  if (date === stop.departDate) return { fromStopId: stop.id, toStopId: homeEndpoint };
  return { fromStopId: stop.id };
}
```

`lib/day-view-loader.ts`: extend the `DayViewData.stop` type and the object built at ~747 with `arriveDate: dayStop.arriveDate` / `departDate: dayStop.departDate` (the loader already filters to dated Stops, so narrow with `!` and a comment pointing at the filter, as line 78 of `share-lookup.ts` does). Extend `stopOptions` to `{ id, name, arriveDate, departDate, timezone, sortOrder }` from the same rows.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run lib/day-transport-defaults.test.ts && npx vitest related --run lib/day-view-loader.ts && npx tsc --noEmit && npx eslint lib/day-transport-defaults.ts lib/day-transport-defaults.test.ts lib/day-view-loader.ts
git add lib/day-transport-defaults.ts lib/day-transport-defaults.test.ts lib/day-view-loader.ts
git commit -m "feat(day): dayTransportDefaults and the Stop dates the Day view needs for it

Spec 2026-10-13 D5 groundwork.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Transport form — `defaultDate` and the Home base hint

**Files:**
- Modify: `components/trip/transport-form-dialog.tsx` (props ~76–125; `depAt` state ~422; endpoint pickers ~380–400 and where `LocationCombobox` renders)
- Test: `components/trip/transport-form-dialog.test.tsx`

**Interfaces:**
- Produces: `TransportFormDialogProps.defaultDate?: string` ("YYYY-MM-DD", create only: seeds the departure date part of `depAt`); `TransportFormDialogProps.settingsHref?: string` (when set and `homeBaseName` is null, the hint renders).

- [ ] **Step 1: Write the failing tests**

```ts
it("defaultDate seeds the departure date on create", () => {
  renderDialog({ defaultDate: "2026-11-04" }); // the file's helper; transport undefined
  expect(screen.getByLabelText(/depart/i)).toHaveValue(expect.stringMatching(/^2026-11-04/));
});
it("no Home base: shows the hint with a link to Trip settings and still submits", async () => {
  renderDialog({ homeBaseName: null, settingsHref: "/trips/cairns-work/settings" });
  const link = screen.getByRole("link", { name: /Trip settings/ });
  expect(link).toHaveAttribute("href", "/trips/cairns-work/settings");
  expect(screen.getByText(/No Home base yet/)).toBeInTheDocument();
  // fill the minimum the file's "creates a transport" test fills, submit, assert the mocked action was called
});
it("with a Home base set there is no hint", () => {
  renderDialog({ homeBaseName: "Brisbane", settingsHref: "/trips/x/settings" });
  expect(screen.queryByText(/No Home base yet/)).toBeNull();
});
```

Read how `depAt` is presented (a `datetime-local` input, or split date + time inputs) and target the real label in the first test.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/trip/transport-form-dialog.test.tsx` — FAIL.

- [ ] **Step 3: Implement**

- Props: `defaultDate?: string; settingsHref?: string;`.
- `depAt` initial: when `!transport && defaultDate`, seed with `${defaultDate}T09:00` in whatever shape `instantToWallTimeInput` returns (read `lib/time-display.ts:63`; if the wall-time input is `"YYYY-MM-DDTHH:mm"`, that literal is right; if it is split, seed only the date part and leave time empty). Do not seed `arrAt`.
- Hint: directly under the endpoint pickers, when `homeBaseName == null && settingsHref`:
  ```tsx
  <p className="text-[13px] font-semibold text-muted-foreground">
    No Home base yet. Set one in <Link href={settingsHref} className="underline">Trip settings</Link> to add flights from home.
  </p>
  ```
  Use `next/link` as the rest of the component tree does; the dialog closing on navigation is fine.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run components/trip/transport-form-dialog.test.tsx && npx tsc --noEmit && npx eslint components/trip/transport-form-dialog.tsx components/trip/transport-form-dialog.test.tsx
git add components/trip/transport-form-dialog.tsx components/trip/transport-form-dialog.test.tsx
git commit -m "feat(transport): defaultDate seeds a new leg's departure; Home base hint when none is set

Spec 2026-10-13 D5/D6.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Day view add menu — Item or Transport — and Items get their Stop

**Files:**
- Create: `components/day/day-add-menu.tsx` (client component)
- Modify: `components/trip/item-form-dialog.tsx:381-425` (`AddItemButton` gains `defaultStopId?: string | null` and passes it through)
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx:63-90` (use `DayAddMenu` for the header add and the dashed add; pass `defaultStopId`)
- Test: `components/day/day-add-menu.test.tsx`, `components/trip/item-form-dialog.test.tsx` (one case), `app/(app)/trips/[tripId]/day/[date]/page.test.tsx` if it exists (adjust selectors; the add buttons become menu triggers)

**Interfaces:**
- Consumes: `dayTransportDefaults` (Task 9), `TransportFormDialog` `defaultDate`/`settingsHref` (Task 10), `ItemFormDialog` (`defaultStopId`, `defaultDate`), `HOME_ENDPOINT` from `components/trip/transport-endpoints`, `tripPath` from `@/lib/trip-path`, `DropdownMenu*` from `components/ui/dropdown-menu`.
- Produces:
  ```ts
  export type DayAddMenuProps = {
    tripId: string; slug: string; date: string;
    stop: { id: string; arriveDate: string; departDate: string } | null;
    stopOptions: Array<{ id: string; name: string; arriveDate: string | null; departDate: string | null; timezone: string | null; sortOrder: number }>;
    homeCurrency: string; homeBaseName: string | null;
    label: string; variant: "primary" | "dashed"; size: "md"; className?: string;
  };
  export function DayAddMenu(props: DayAddMenuProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests**

`components/trip/item-form-dialog.test.tsx` (append; follow the file's render helper):
```ts
it("AddItemButton passes defaultStopId to the dialog on create", async () => {
  render(<AddItemButton tripId="t" stops={[{ id: "s1", name: "Cairns" }]} defaultStopId="s1" defaultDate="2026-11-04" />);
  await userEvent.click(screen.getByRole("button", { name: /Add Item/ }));
  expect(screen.getByRole("combobox", { name: /Stop/ })).toHaveTextContent("Cairns"); // match the dialog's Stop picker role/label from existing tests
});
```

`components/day/day-add-menu.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import { DayAddMenu } from "./day-add-menu";

vi.mock("@/components/trip/item-form-dialog", () => ({
  ItemFormDialog: (p: { open: boolean; defaultStopId?: string | null; defaultDate?: string }) =>
    p.open ? <div data-testid="item-dialog">{p.defaultStopId}|{p.defaultDate}</div> : null,
}));
vi.mock("@/components/trip/transport-form-dialog", () => ({
  TransportFormDialog: (p: { open: boolean; defaultFromStopId?: string; defaultToStopId?: string; defaultDate?: string; settingsHref?: string }) =>
    p.open ? <div data-testid="transport-dialog">{p.defaultFromStopId}|{p.defaultToStopId}|{p.defaultDate}|{p.settingsHref}</div> : null,
}));

const base = {
  tripId: "t", slug: "cairns-work", date: "2026-11-04",
  stop: { id: "s1", arriveDate: "2026-11-04", departDate: "2026-11-05" },
  stopOptions: [{ id: "s1", name: "Cairns", arriveDate: "2026-11-04", departDate: "2026-11-05", timezone: "Australia/Brisbane", sortOrder: 0 }],
  homeCurrency: "AUD", homeBaseName: null, label: "Add to this day", variant: "primary" as const, size: "md" as const,
};

describe("DayAddMenu (spec 2026-10-13 D5)", () => {
  it("offers Something to do and A flight, train or drive", async () => {
    render(<DayAddMenu {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Add to this day" }));
    expect(screen.getByRole("menuitem", { name: "Something to do" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "A flight, train or drive" })).toBeInTheDocument();
  });
  it("Something to do opens the Item dialog with the day and its Stop", async () => {
    render(<DayAddMenu {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Add to this day" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Something to do" }));
    expect(screen.getByTestId("item-dialog")).toHaveTextContent("s1|2026-11-04");
  });
  it("A flight opens the Transport dialog with day-derived endpoints, the date and the settings link", async () => {
    render(<DayAddMenu {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Add to this day" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "A flight, train or drive" }));
    expect(screen.getByTestId("transport-dialog")).toHaveTextContent("__home__|s1|2026-11-04|/trips/cairns-work/settings");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/day/day-add-menu.test.tsx components/trip/item-form-dialog.test.tsx` — FAIL.

- [ ] **Step 3: Implement**

`item-form-dialog.tsx` `AddItemButton`: add `defaultStopId?: string | null` to its props and pass `defaultStopId={defaultStopId}` to `ItemFormDialog`.

`components/day/day-add-menu.tsx`:
```tsx
"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ItemFormDialog } from "@/components/trip/item-form-dialog";
import { TransportFormDialog } from "@/components/trip/transport-form-dialog";
import { HOME_ENDPOINT } from "@/components/trip/transport-endpoints";
import { dayTransportDefaults } from "@/lib/day-transport-defaults";
import { tripPath } from "@/lib/trip-path";

export type DayAddMenuProps = { /* as in Interfaces */ };

export function DayAddMenu({ tripId, slug, date, stop, stopOptions, homeCurrency, homeBaseName, label, variant, size, className }: DayAddMenuProps) {
  const [which, setWhich] = React.useState<"item" | "transport" | null>(null);
  const defaults = dayTransportDefaults(date, stop, HOME_ENDPOINT);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} className={className}>
            <Plus className="size-4" aria-hidden="true" />
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setWhich("item")}>Something to do</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setWhich("transport")}>A flight, train or drive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ItemFormDialog
        tripId={tripId}
        stops={stopOptions}
        tripStartDate={date}
        defaultUnscheduled={false}
        defaultDate={date}
        defaultStopId={stop?.id ?? null}
        open={which === "item"}
        onOpenChange={(o) => { if (!o) setWhich(null); }}
        homeCurrency={homeCurrency}
      />
      {which === "transport" && (
        <TransportFormDialog
          tripId={tripId}
          stops={stopOptions}
          defaultFromStopId={defaults.fromStopId}
          defaultToStopId={defaults.toStopId}
          defaultAnchorStopId={stop?.id}
          defaultDate={date}
          open
          onOpenChange={(o) => { if (!o) setWhich(null); }}
          homeCurrency={homeCurrency}
          homeBaseName={homeBaseName}
          settingsHref={tripPath(slug, "/settings")}
        />
      )}
    </>
  );
}
```
Check the real export names in `components/ui/dropdown-menu.tsx:81` and the `Button` variant union (the Day page uses `"primary"` and `"dashed"`); the Transport dialog is mounted only while open so its state resets each time, matching how `itinerary-manager.tsx:2477` mounts it.

`page.tsx`: replace `AddItemButton` uses with `DayAddMenu`, building props from `day` (`day.stop`, `day.stopOptions`, `day.trip.homeCurrency`, `day.trip.homeName`, `slug` already resolved on line ~43). Keep the three label variants and classNames exactly as they are.

- [ ] **Step 4: Verify in the running app**

`next dev` is running on :3000 (started by the main session). Open `/trips/<any dated trip slug>/day/<its start date>` in the Playwright harness or a quick script, click "Add to this day", pick "A flight, train or drive", and confirm the Transport dialog opens with Home base → Stop and the date. If the dev server is down, run `npm run dev` in the background first. Report what you saw.

- [ ] **Step 5: Task-done checks and commit**

```bash
npx vitest run components/day/day-add-menu.test.tsx components/trip/item-form-dialog.test.tsx 'app/(app)/trips/[tripId]/day' && npx tsc --noEmit && npx eslint components/day/day-add-menu.tsx components/day/day-add-menu.test.tsx components/trip/item-form-dialog.tsx 'app/(app)/trips/[tripId]/day/[date]/page.tsx'
git add components/day/day-add-menu.tsx components/day/day-add-menu.test.tsx components/trip/item-form-dialog.tsx components/trip/item-form-dialog.test.tsx 'app/(app)/trips/[tripId]/day/[date]/page.tsx'
git commit -m "feat(day): add a flight, train or drive from the Day view; Day-added Items get their Stop

Spec 2026-10-13 D5–D7. The add button is a two-way menu: Something to do
opens the Item form with the day and its covering Stop; A flight, train or
drive opens the Transport form with the day-derived endpoints (Home base to
the Stop on its arrive date, the Stop to Home base on its depart date,
otherwise from the Stop) and the departure date set.

Resolves-Feedback: cmv6emadt000406jpeqnl499v
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Branch verification

**Files:** none new.

- [ ] **Step 1: Full suite, build, integration**

```bash
npm test
npm run build
npm run test:integration   # when the docker-compose DB is up; otherwise report that it was skipped
```
Expected: all green. Fix anything red on the branch in a `fix:` commit naming the task it belongs to.

- [ ] **Step 2: Layout check of the two touched phone surfaces**

With `next dev` running: `LAYOUT_AUDIT_OUT=/tmp/layout-audit/lone-stops LAYOUT_AUDIT_ONLY="overlay/stop-add/,deep/day/" npm run audit:layout`, then view the 390-light captures of the Add-a-stop sheet (no Roughly on an empty dated Trip is not capturable here since the audit trips have Stops; confirm the sheet still paints) and the Day view (the add button is a menu trigger now). Report anything Broken.

- [ ] **Step 3: Report**

List the commits with their `Resolves-Feedback:` trailers and state plainly what was verified and what was skipped. Do not merge, do not deploy, do not run `feedback:resolve`.
