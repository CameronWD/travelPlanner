# Tidy-up batch 1 — Foundations and bugs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put one Plan reader behind every page, one entity guard and one plan guard behind every action, and one failure contract on every action, with the seven verified bugs fixed first and a test seam so the rest stops fighting 147 hand-rolled database mocks.

**Architecture:** New deep modules in `lib/` (`plan-reads.ts`, two guards in `guards.ts`, `loadFlagRows` in `flags-loader.ts`) absorb the copies that pages and actions hand-write today. Pages keep only rendering; actions keep only their rules. Tests reach the database through shared row builders and a shared `mockDb()` so that query shape stops being the test surface. Everything else is deletion.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before touching a page), React 19 `cache()`, Prisma 7, zod, Vitest 3 (node project for `.ts`, happy-dom for `.tsx`), TypeScript strict.

**Spec:** `docs/specs/2026-10-14-tidy-up-pass.md` (Batch 1 section, Decisions Q1–Q12, Bugs TB-01..07). ADR 0074 for the failure contract. Review source: `docs/audits/2026-10-14-architecture-review.html`.

## Global Constraints

- Branch `chore/tidy-up-1-foundations`. Never commit to, merge into, rebase onto or push `main`. Never deploy. Never run `feedback:resolve`, `feedback:accept` or `feedback:pull` (subagents especially: `feedback:pull` opens production).
- Don't commit `next dev`'s CLAUDE.md block if it reappears.
- Vocabulary: **Plan** (never "itinerary"), **real plan**, **Fork**, **Traveller**, **Surprise**, **Flag** per CONTEXT.md. Code names follow: `readPlan`, `PlanRows`, `requireRowAccess`, `requirePlanAccess`.
- Forks are frozen (spec Q3): keep every fork path correct; build nothing fork-specific.
- Per task: `npx vitest run <the test files worked>` in the loop; at task end `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never run the full suite or `next build` per task.
- Once, at the end (Task 23): `npm test`, `npm run build`, `npm run test:integration` (local Postgres: `docker compose up -d` then `npx prisma migrate deploy`), `npm run knip`, `npx eslint .`.
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No `Resolves-Feedback:` trailers (no Feedback notes are open).
- A bug fix (TB-01..07) writes its failing test first and the commit message names the TB id.
- `"use server"` files: every export must be an `async function` and must appear in `lib/server-action-exports.test.ts`'s `ALLOWLIST`. Pure helpers go in `lib/`, not in action files.
- Page tests: rewrite the mocks, keep the assertions (spec Q10). Delete an assertion only when it asserts a query shape, and say so in the commit message.

## Review Focus

Inputs the spec implies but no existing test exercises; each line's test is added to the owning task below.

1. **A write with a `forkId` belonging to another Trip** must be `notFound()`, not a write onto that Trip's Fork and not a silent fall-back to the real plan (Task 2, Task 6).
2. **A Traveller surprised by a Stop who sends that Stop's id to any action** must get `notFound()` through the shared guard, including on the actions that today skip the Surprise check (Task 3, Task 4).
3. **A page rendered for a viewer with a live Surprise hidden from them** must get masked Stops and placeholder Items from the Plan reader, not from the page (Task 13, Task 14).
4. **An action that fails with a form-level message** must show that message in every form, including the Stop form's ADR 0073 refusal (Task 7).
5. **A Trip with a Fork, duplicated** must produce a copy with exactly the real plan's rows and zero Forks (Task 11).

---

## Task 1: Test seam — row builders, `mockDb()`, shared source walker

**Files:**
- Create: `test/builders/index.ts`
- Create: `test/builders/index.test.ts`
- Create: `test/helpers/db-mock.ts`
- Create: `test/helpers/db-mock.test.ts`
- Create: `test/helpers/walk-sources.ts`
- Modify: `lib/trip-links.guard.test.ts`, `lib/image-loader-boundary.test.ts`, `lib/client-zod.guard.test.ts`, `lib/enum-values.guard.test.ts`, `components/ui/motion-lazy.guard.test.ts`, `components/plan/banned-classes.test.ts`, `app/route-conventions.test.ts` (replace each private `walk()` with the shared one)

**Interfaces:**
- Produces: `trip(o?)`, `stop(o?)`, `transport(o?)`, `stay(o?)`, `item(o?)`, `cost(o?)`, `chapter(o?)`, `traveller(o?)`, `datedTripFixture()` from `@/test/builders`; `mockDb(delegates)` from `@/test/helpers/db-mock`; `walkSources(dir, opts?)` from `@/test/helpers/walk-sources`.

- [ ] **Step 1: Write the failing builder test**

`test/builders/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { trip, stop, transport, stay, item, cost, chapter, traveller, datedTripFixture } from "./index";

describe("row builders", () => {
  it("trip() is a dated real-plan Trip with a Home base and a timezone", () => {
    const t = trip();
    expect(t.id).toBe("trip-1");
    expect(t.startDate).toBe("2026-11-01");
    expect(t.endDate).toBe("2026-11-10");
    expect(t.homeName).toBe("Sydney");
    expect(t.homeTimezone).toBe("Australia/Sydney");
    expect(t.forksEnabled).toBe(false);
    expect(t.deletedAt).toBeNull();
  });
  it("overrides win and ids are stable per call", () => {
    expect(stop({ id: "s9", name: "Rome" })).toMatchObject({ id: "s9", name: "Rome", forkId: null });
    expect(stop().id).toBe("stop-1");
    expect(stop({ sortOrder: 2 }).sortOrder).toBe(2);
  });
  it("datedTripFixture() has three dated Stops in order with legs between them", () => {
    const f = datedTripFixture();
    expect(f.stops.map((s) => s.name)).toEqual(["Lisbon", "Madrid", "Barcelona"]);
    expect(f.stops.every((s) => s.arriveDate && s.departDate)).toBe(true);
    expect(f.transports).toHaveLength(2);
    expect(f.transports[0].fromStopId).toBe(f.stops[0].id);
    expect(f.transports[0].toStopId).toBe(f.stops[1].id);
  });
  it("other builders exist with real-plan defaults", () => {
    expect(transport().forkId).toBeNull();
    expect(stay().checkIn).toBe("2026-11-01");
    expect(item().category).toBe("SIGHTSEEING");
    expect(cost().currency).toBe("EUR");
    expect(chapter().colour).toBeTypeOf("string");
    expect(traveller().id).toBe("u1");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/builders/index.test.ts`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Write the builders**

`test/builders/index.ts`. Every builder returns a plain object shaped like the Prisma row (every scalar column of the model, nullable ones as `null`), with `Partial<Row>` overrides. Check column names against `prisma/schema.prisma` before finishing; the shapes below are the contract later tasks rely on.

```ts
/**
 * Prisma-shaped rows for tests (spec 2026-10-14 Q10). Realistic defaults: a
 * dated Trip, a Home base with a timezone, three Stops in order. Override
 * any field; ids are stable so tests can refer to them without reading them
 * back. These are ROW shapes (what `db.x.findMany` returns), not view models.
 */
export type TripRow = {
  id: string; name: string; slug: string | null; startDate: string | null; endDate: string | null;
  hardEndDate: string | null; homeCurrency: string; homeName: string | null; homeLat: number | null;
  homeLng: number | null; homeCountryCode: string | null; homeTimezone: string | null; roundTrip: boolean;
  drivingWindingFactor: number; drivingAvgSpeedKph: number; chaptersEnabled: boolean; forksEnabled: boolean;
  coverImageKey: string | null; coverSmallKey: string | null; coverAspect: number | null;
  createdById: string; deletedAt: Date | null; createdAt: Date; updatedAt: Date;
};
export type StopRow = {
  id: string; tripId: string; forkId: string | null; name: string; country: string | null; countryCode: string | null;
  lat: number | null; lng: number | null; timezone: string; arriveDate: string | null; departDate: string | null;
  nights: number | null; pinned: boolean; sortOrder: number; notes: string | null; chapterId: string | null;
  chapterSortOrder: number | null; surprisePlannerId: string | null; surpriseRevealedAt: Date | null;
  createdAt: Date; updatedAt: Date;
};
export type TransportRow = {
  id: string; tripId: string; forkId: string | null; mode: string; fromStopId: string | null; toStopId: string | null;
  anchorStopId: string | null; depPlace: string | null; arrPlace: string | null; depAt: string | null; arrAt: string | null;
  depLat: number | null; depLng: number | null; arrLat: number | null; arrLng: number | null; depIsHome: boolean;
  arrIsHome: boolean; reference: string | null; notes: string | null; sortOrder: number; createdAt: Date; updatedAt: Date;
};
export type StayRow = {
  id: string; tripId: string; forkId: string | null; stopId: string; name: string; address: string | null;
  checkIn: string; checkOut: string; checkInTime: string | null; checkOutTime: string | null; confirmation: string | null;
  notes: string | null; lat: number | null; lng: number | null; createdAt: Date; updatedAt: Date;
};
export type ItemRow = {
  id: string; tripId: string; forkId: string | null; stopId: string | null; date: string | null; title: string;
  category: string; startTime: string | null; endTime: string | null; address: string | null; link: string | null;
  booking: string | null; notes: string | null; lat: number | null; lng: number | null; countryCode: string | null;
  hiddenFromShares: boolean; sortOrder: number; photoAttachmentId: string | null; sourceItemId: string | null;
  surprisePlannerId: string | null; surpriseRevealedAt: Date | null; createdAt: Date; updatedAt: Date;
};
export type CostRow = {
  id: string; tripId: string; forkId: string | null; ownerType: string; ownerId: string | null; costMinor: number;
  paidMinor: number | null; currency: string; rateToHome: number | null; paidAt: string | null; dueDate: string | null;
  settlement: string; label: string | null; category: string | null; createdAt: Date; updatedAt: Date;
};
export type ChapterRow = {
  id: string; tripId: string; forkId: string | null; name: string; colour: string; startDate: string | null;
  endDate: string | null; sortOrder: number; createdAt: Date; updatedAt: Date;
};
export type TravellerRow = {
  id: string; name: string | null; image: string | null; displayName: string | null; photoKey: string | null;
  photoUpdatedAt: Date | null; email: string;
};

const NOW = new Date("2026-10-14T00:00:00Z");

export function trip(o: Partial<TripRow> = {}): TripRow {
  return {
    id: "trip-1", name: "Iberia", slug: "iberia", startDate: "2026-11-01", endDate: "2026-11-10", hardEndDate: null,
    homeCurrency: "AUD", homeName: "Sydney", homeLat: -33.87, homeLng: 151.21, homeCountryCode: "AU",
    homeTimezone: "Australia/Sydney", roundTrip: true, drivingWindingFactor: 1.3, drivingAvgSpeedKph: 70,
    chaptersEnabled: false, forksEnabled: false, coverImageKey: null, coverSmallKey: null, coverAspect: null,
    createdById: "u1", deletedAt: null, createdAt: NOW, updatedAt: NOW, ...o,
  };
}
export function stop(o: Partial<StopRow> = {}): StopRow {
  return {
    id: "stop-1", tripId: "trip-1", forkId: null, name: "Lisbon", country: "Portugal", countryCode: "PT",
    lat: 38.72, lng: -9.14, timezone: "Europe/Lisbon", arriveDate: "2026-11-01", departDate: "2026-11-04", nights: 3,
    pinned: false, sortOrder: 0, notes: null, chapterId: null, chapterSortOrder: null, surprisePlannerId: null,
    surpriseRevealedAt: null, createdAt: NOW, updatedAt: NOW, ...o,
  };
}
export function transport(o: Partial<TransportRow> = {}): TransportRow {
  return {
    id: "tr-1", tripId: "trip-1", forkId: null, mode: "TRAIN", fromStopId: "stop-1", toStopId: "stop-2", anchorStopId: "stop-1",
    depPlace: null, arrPlace: null, depAt: "2026-11-04T09:00", arrAt: "2026-11-04T12:30", depLat: null, depLng: null,
    arrLat: null, arrLng: null, depIsHome: false, arrIsHome: false, reference: null, notes: null, sortOrder: 0,
    createdAt: NOW, updatedAt: NOW, ...o,
  };
}
export function stay(o: Partial<StayRow> = {}): StayRow {
  return {
    id: "acc-1", tripId: "trip-1", forkId: null, stopId: "stop-1", name: "Hotel Avenida", address: null,
    checkIn: "2026-11-01", checkOut: "2026-11-04", checkInTime: null, checkOutTime: null, confirmation: null,
    notes: null, lat: null, lng: null, createdAt: NOW, updatedAt: NOW, ...o,
  };
}
export function item(o: Partial<ItemRow> = {}): ItemRow {
  return {
    id: "item-1", tripId: "trip-1", forkId: null, stopId: "stop-1", date: "2026-11-02", title: "Belém Tower",
    category: "SIGHTSEEING", startTime: "10:00", endTime: "11:30", address: null, link: null, booking: null, notes: null,
    lat: null, lng: null, countryCode: null, hiddenFromShares: false, sortOrder: 0, photoAttachmentId: null,
    sourceItemId: null, surprisePlannerId: null, surpriseRevealedAt: null, createdAt: NOW, updatedAt: NOW, ...o,
  };
}
export function cost(o: Partial<CostRow> = {}): CostRow {
  return {
    id: "cost-1", tripId: "trip-1", forkId: null, ownerType: "ITEM", ownerId: "item-1", costMinor: 1200, paidMinor: null,
    currency: "EUR", rateToHome: 1.6, paidAt: null, dueDate: null, settlement: "BEFORE", label: null, category: null,
    createdAt: NOW, updatedAt: NOW, ...o,
  };
}
export function chapter(o: Partial<ChapterRow> = {}): ChapterRow {
  return {
    id: "ch-1", tripId: "trip-1", forkId: null, name: "Portugal", colour: "teal", startDate: "2026-11-01",
    endDate: "2026-11-04", sortOrder: 0, createdAt: NOW, updatedAt: NOW, ...o,
  };
}
export function traveller(o: Partial<TravellerRow> = {}): TravellerRow {
  return { id: "u1", name: "Cam", image: null, displayName: null, photoKey: null, photoUpdatedAt: null, email: "cam@example.com", ...o };
}

/** A dated Trip with three Stops in order and the two legs between them. */
export function datedTripFixture() {
  const t = trip();
  const stops = [
    stop({ id: "stop-1", name: "Lisbon", country: "Portugal", countryCode: "PT", timezone: "Europe/Lisbon", arriveDate: "2026-11-01", departDate: "2026-11-04", nights: 3, sortOrder: 0 }),
    stop({ id: "stop-2", name: "Madrid", country: "Spain", countryCode: "ES", timezone: "Europe/Madrid", lat: 40.42, lng: -3.7, arriveDate: "2026-11-04", departDate: "2026-11-07", nights: 3, sortOrder: 1 }),
    stop({ id: "stop-3", name: "Barcelona", country: "Spain", countryCode: "ES", timezone: "Europe/Madrid", lat: 41.39, lng: 2.17, arriveDate: "2026-11-07", departDate: "2026-11-10", nights: 3, sortOrder: 2 }),
  ];
  const transports = [
    transport({ id: "tr-1", fromStopId: "stop-1", toStopId: "stop-2", anchorStopId: "stop-1", depAt: "2026-11-04T09:00", arrAt: "2026-11-04T12:30", sortOrder: 0 }),
    transport({ id: "tr-2", fromStopId: "stop-2", toStopId: "stop-3", anchorStopId: "stop-2", depAt: "2026-11-07T10:00", arrAt: "2026-11-07T12:45", sortOrder: 1 }),
  ];
  return { trip: t, stops, transports, stays: [stay()], items: [item()], costs: [cost()], chapters: [] as ChapterRow[] };
}
```

If a column name in `prisma/schema.prisma` differs from the above (e.g. `Cost.settlement` or `Chapter.colour`), fix the builder to match the schema and keep the test green; note the correction in the commit message.

- [ ] **Step 4: Write the failing `mockDb` test**

`test/helpers/db-mock.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { mockDb } from "./db-mock";

describe("mockDb", () => {
  it("builds every named delegate with the usual Prisma methods as vi.fn()", async () => {
    const db = mockDb(["trip", "stop"]);
    expect(vi.isMockFunction(db.trip.findUnique)).toBe(true);
    expect(vi.isMockFunction(db.stop.findMany)).toBe(true);
    expect(await db.stop.findMany()).toEqual([]);
    expect(await db.trip.findUnique()).toBeNull();
    expect(await db.stop.count()).toBe(0);
  });
  it("$transaction runs the callback against the same mock", async () => {
    const db = mockDb(["stop"]);
    const seen = await db.$transaction(async (tx) => tx === db);
    expect(seen).toBe(true);
  });
});
```

- [ ] **Step 5: Write `mockDb()`**

`test/helpers/db-mock.ts`:

```ts
import { vi, type Mock } from "vitest";

const METHODS = ["findUnique", "findFirst", "findMany", "count", "create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany", "aggregate"] as const;
type Method = (typeof METHODS)[number];
export type MockDelegate = Record<Method, Mock>;
export type MockDb<K extends string> = Record<K, MockDelegate> & {
  $transaction: Mock;
  $queryRaw: Mock;
  $executeRaw: Mock;
};

/**
 * One `@/lib/db` mock for every test that needs one (spec 2026-10-14 Q10).
 * `findMany` resolves `[]`, `count` resolves `0`, every other method resolves
 * `null`, until a test says otherwise with `mockResolvedValue`. Use as:
 *
 *   const db = vi.hoisted(() => mockDb(["trip", "stop"]));
 *   vi.mock("@/lib/db", () => ({ db }));
 */
export function mockDb<K extends string>(delegates: readonly K[]): MockDb<K> {
  const out = {} as Record<string, unknown>;
  for (const name of delegates) {
    const d = {} as Record<string, Mock>;
    for (const m of METHODS) {
      d[m] = vi.fn().mockResolvedValue(m === "findMany" ? [] : m === "count" ? 0 : null);
    }
    out[name] = d;
  }
  out.$transaction = vi.fn(async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => unknown)(out) : Promise.all(arg as Promise<unknown>[])));
  out.$queryRaw = vi.fn().mockResolvedValue([]);
  out.$executeRaw = vi.fn().mockResolvedValue(0);
  return out as MockDb<K>;
}
```

Note: `vi.hoisted` cannot import at hoist time in some setups; if `mockDb` inside `vi.hoisted` fails to resolve, the test imports `mockDb` normally and calls `vi.mock("@/lib/db", () => ({ db: mockDb([...]) }))` with the factory capturing the instance via a module-level `let`. Pick the form that works in `test/helpers/db-mock.test.ts` and document it in the file header.

- [ ] **Step 6: Write the shared source walker and replace the seven copies**

`test/helpers/walk-sources.ts`:

```ts
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const SKIP = new Set(["node_modules", ".next", "design_handoff", ".git"]);

/** Every file under `dir` (recursive) whose extension is in `exts`, as paths relative to cwd. */
export function walkSources(dir: string, opts: { exts?: readonly string[]; skipTests?: boolean } = {}): string[] {
  const exts = opts.exts ?? [".ts", ".tsx"];
  const out: string[] = [];
  const visit = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (SKIP.has(entry)) continue;
      const p = path.join(d, entry);
      if (statSync(p).isDirectory()) visit(p);
      else if (exts.some((e) => p.endsWith(e)) && !(opts.skipTests && /\.test\.tsx?$/.test(p))) out.push(path.relative(process.cwd(), p));
    }
  };
  visit(dir);
  return out;
}
```

In each of the seven guard tests, delete the private `walk`/`collect` function and import `walkSources`. Keep each test's own filters (extensions, directories) by passing them as arguments. Run each test file after editing it.

- [ ] **Step 7: Run and commit**

Run: `npx vitest run test/builders test/helpers lib/trip-links.guard.test.ts lib/image-loader-boundary.test.ts lib/client-zod.guard.test.ts lib/enum-values.guard.test.ts components/ui/motion-lazy.guard.test.ts components/plan/banned-classes.test.ts app/route-conventions.test.ts && npx tsc --noEmit && npx eslint test lib/*.guard.test.ts`
Expected: all PASS.

```bash
git add test/ lib/*.guard.test.ts lib/image-loader-boundary.test.ts components/ui/motion-lazy.guard.test.ts components/plan/banned-classes.test.ts app/route-conventions.test.ts
git commit -m "test: shared row builders, mockDb() and one walkSources() for the guard tests

Spec 2026-10-14 Q10 (card J). Builders are Prisma row shapes with a dated
Trip and three Stops as defaults; mockDb builds a @/lib/db mock per
delegate list; the seven private walk() copies in guard tests go.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 2: `requirePlanAccess` and the end of `requireTripOwner`

**Files:**
- Modify: `lib/guards.ts`
- Modify: `lib/guards.test.ts` (exists; extend)
- Modify: `lib/access.ts:31` (comment mentions `requireTripOwner`; reword)

**Interfaces:**
- Produces: `requirePlanAccess(tripId: string, forkId: PlanId | undefined): Promise<{ user; membership; plan: PlanId }>` from `@/lib/guards`. Throws `notFound()` when `forkId` is a string that is not a Fork of `tripId`, or when the Trip has `forksEnabled: false` and `forkId` is a string. Returns `plan: null` for the real plan.

- [ ] **Step 1: Write the failing tests**

Append to `lib/guards.test.ts` (follow the file's existing mocking of `@/lib/db`, `@/lib/auth`, `next/navigation`):

```ts
describe("requirePlanAccess (spec 2026-10-14 Q4)", () => {
  it("real plan: returns plan null without reading forks", async () => {
    const r = await requirePlanAccess("trip-1", undefined);
    expect(r.plan).toBeNull();
    expect(db.fork.findFirst).not.toHaveBeenCalled();
  });
  it("a Fork of this Trip with Forks enabled: returns its id", async () => {
    db.trip.findUnique.mockResolvedValueOnce({ forksEnabled: true });
    db.fork.findFirst.mockResolvedValueOnce({ id: "fork-1" });
    const r = await requirePlanAccess("trip-1", "fork-1");
    expect(r.plan).toBe("fork-1");
    expect(db.fork.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "fork-1", tripId: "trip-1" } }));
  });
  it("a forkId that is not a Fork of this Trip: notFound, no fall-back", async () => {
    db.trip.findUnique.mockResolvedValueOnce({ forksEnabled: true });
    db.fork.findFirst.mockResolvedValueOnce(null);
    await expect(requirePlanAccess("trip-1", "fork-x")).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|not found/i);
  });
  it("Forks switched off: a forkId is notFound", async () => {
    db.trip.findUnique.mockResolvedValueOnce({ forksEnabled: false });
    await expect(requirePlanAccess("trip-1", "fork-1")).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|not found/i);
  });
  it("membership is checked first (non-member never learns a Fork exists)", async () => {
    // arrange the membership mock to return no member; expect notFound before fork.findFirst
    membersMock.mockResolvedValueOnce([]);
    await expect(requirePlanAccess("trip-1", "fork-1")).rejects.toThrow();
    expect(db.fork.findFirst).not.toHaveBeenCalled();
  });
});
it("requireTripOwner is gone", async () => {
  const mod = await import("./guards");
  expect("requireTripOwner" in mod).toBe(false);
});
```

Adapt mock names (`db`, `membersMock`) to what `lib/guards.test.ts` already defines; if the file mocks `notFound` to throw a sentinel, assert on that sentinel instead of the regex.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/guards.test.ts`
Expected: FAIL — `requirePlanAccess` is not exported; `requireTripOwner` still exists.

- [ ] **Step 3: Implement**

In `lib/guards.ts`, delete `requireTripOwner` (and the `isTripOwnerOrAdmin` re-export stays). Add:

```ts
import type { PlanId } from "@/lib/plan-scope";

/**
 * Require that the current user may write to Plan `forkId` of `tripId`
 * (spec 2026-10-14 Q4, ADR 0074 rule 1). `undefined`/`null` is the real
 * plan. A string must be a Fork of this Trip AND the Trip must have Forks
 * on; anything else is notFound() — never a silent fall-back to the real
 * plan on a write (reads keep falling back: lib/plan-scope.ts resolvePlan).
 * Membership is checked first so a non-member never learns a Fork exists.
 */
export async function requirePlanAccess(tripId: string, forkId: PlanId | undefined) {
  const { user, membership } = await requireTripAccess(tripId);
  if (!forkId) return { user, membership, plan: null as PlanId };
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { forksEnabled: true } });
  if (!trip?.forksEnabled) notFound();
  const fork = await db.fork.findFirst({ where: { id: forkId, tripId }, select: { id: true } });
  if (!fork) notFound();
  return { user, membership, plan: fork.id as PlanId };
}
```

Reword `lib/access.ts:31`'s comment to say "the pure predicate; actions that want a throwing owner gate call `requireTripAccess` then `isTripOwnerOrAdmin` and `notFound()`".

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx vitest run lib/guards.test.ts && npx tsc --noEmit && npx eslint lib/guards.ts lib/access.ts`
Expected: PASS.

```bash
git add lib/guards.ts lib/guards.test.ts lib/access.ts
git commit -m "feat(guards): requirePlanAccess — a foreign or disabled forkId is not found on writes; drop dead requireTripOwner

Spec 2026-10-14 Q4, card C.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 3: `requireRowAccess(kind, id)` — the one entity guard

**Files:**
- Modify: `lib/guards.ts`
- Modify: `lib/guards.test.ts`
- Read first: `lib/surprise-guard.ts` (`requireOutsideSurprise`, `SurpriseRef`, `SurpriseRoot`)

**Interfaces:**
- Produces, from `@/lib/guards`:

```ts
export type RowKind = "stop" | "item" | "transport" | "accommodation" | "cost" | "chapter" | "note" | "reminder" | "checklistItem";
export type RowOf<K extends RowKind> = ...; // per-kind select below
export async function requireRowAccess<K extends RowKind>(kind: K, id: string, opts?: { realPlanOnly?: boolean }):
  Promise<{ row: RowOf<K>; user: SessionUser; membership: Membership; surpriseOf: SurpriseRoot | null }>;
```

Per-kind selects (the union of what the fourteen private guards select today, so no caller needs a second read):

| kind | select |
|---|---|
| stop | `id, tripId, forkId, name, sortOrder, arriveDate, departDate, nights, pinned, chapterId` |
| item | `id, tripId, forkId, stopId, date, photoAttachmentId` |
| transport | `id, tripId, forkId` |
| accommodation | `id, tripId, forkId, stopId` |
| cost | `id, tripId, forkId, currency, ownerType, ownerId` |
| chapter | `id, tripId, forkId` |
| note | `id, tripId, authorId, targetType, targetId` |
| reminder | `id, tripId, title, date, stopId, stop: { select: { name } }` |
| checklistItem | the existing `CHECKLIST_ITEM_ACTIVITY_SELECT` from `server/actions/checklists.ts` — move that constant to `lib/checklists.ts` and import it in both places |

Surprise refs per kind (the existing `SurpriseRef` variants): stop → `{ stopId }`, item → `{ itemId }`, accommodation → `{ accommodationId }`, cost → `{ costOwner: { ownerType, ownerId } }`, note → `{ target: row }`, reminder → `{ stopId: row.stopId }`, transport / chapter / checklistItem → none (documented: `SurpriseRef` has no variant for them; Transport is outside every Surprise by design, CONTEXT.md **Surprise**).

- [ ] **Step 1: Write the failing tests**

Append to `lib/guards.test.ts`:

```ts
describe("requireRowAccess (card C)", () => {
  it("loads by kind, checks the Trip, checks the Surprise, returns the row", async () => {
    db.stop.findUnique.mockResolvedValueOnce({ id: "s1", tripId: "trip-1", forkId: null, name: "Lisbon", sortOrder: 0, arriveDate: null, departDate: null, nights: 2, pinned: false, chapterId: null });
    const r = await requireRowAccess("stop", "s1");
    expect(r.row.name).toBe("Lisbon");
    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("u1", { stopId: "s1" });
    expect(db.stop.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s1" } }));
  });
  it("a missing row is notFound before any membership read", async () => {
    db.item.findUnique.mockResolvedValueOnce(null);
    await expect(requireRowAccess("item", "nope")).rejects.toThrow();
    expect(membersMock).not.toHaveBeenCalled();
  });
  it("realPlanOnly: a Fork's row reads as notFound", async () => {
    db.cost.findUnique.mockResolvedValueOnce(null); // the where includes forkId: null, so Prisma returns null
    await expect(requireRowAccess("cost", "c1", { realPlanOnly: true })).rejects.toThrow();
    expect(db.cost.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1", forkId: null } }));
  });
  it("a cost's Surprise check uses its owner", async () => {
    db.cost.findUnique.mockResolvedValueOnce({ id: "c1", tripId: "trip-1", forkId: null, currency: "EUR", ownerType: "ITEM", ownerId: "i1" });
    await requireRowAccess("cost", "c1");
    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("u1", { costOwner: { ownerType: "ITEM", ownerId: "i1" } });
  });
  it("a transport has no Surprise variant and skips the check", async () => {
    db.transport.findUnique.mockResolvedValueOnce({ id: "t1", tripId: "trip-1", forkId: null });
    await requireRowAccess("transport", "t1");
    expect(requireOutsideSurpriseMock).not.toHaveBeenCalled();
  });
  it("the surprised viewer gets the guard's notFound (Review Focus 2)", async () => {
    db.stop.findUnique.mockResolvedValueOnce({ id: "s1", tripId: "trip-1", forkId: null, name: "X", sortOrder: 0, arriveDate: null, departDate: null, nights: null, pinned: false, chapterId: null });
    requireOutsideSurpriseMock.mockRejectedValueOnce(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(requireRowAccess("stop", "s1")).rejects.toThrow(/404/);
  });
});
```

Mock `@/lib/surprise-guard` in this test file: `vi.mock("@/lib/surprise-guard", () => ({ requireOutsideSurprise: requireOutsideSurpriseMock }))`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/guards.test.ts`
Expected: FAIL — `requireRowAccess` not exported.

- [ ] **Step 3: Implement**

Add to `lib/guards.ts`:

```ts
import { requireOutsideSurprise, type SurpriseRef, type SurpriseRoot } from "@/lib/surprise-guard";
import { CHECKLIST_ITEM_ACTIVITY_SELECT } from "@/lib/checklists";

const ROW_SELECT = {
  stop: { id: true, tripId: true, forkId: true, name: true, sortOrder: true, arriveDate: true, departDate: true, nights: true, pinned: true, chapterId: true },
  item: { id: true, tripId: true, forkId: true, stopId: true, date: true, photoAttachmentId: true },
  transport: { id: true, tripId: true, forkId: true },
  accommodation: { id: true, tripId: true, forkId: true, stopId: true },
  cost: { id: true, tripId: true, forkId: true, currency: true, ownerType: true, ownerId: true },
  chapter: { id: true, tripId: true, forkId: true },
  note: { id: true, tripId: true, authorId: true, targetType: true, targetId: true },
  reminder: { id: true, tripId: true, title: true, date: true, stopId: true, stop: { select: { name: true } } },
  checklistItem: CHECKLIST_ITEM_ACTIVITY_SELECT,
} as const;

export type RowKind = keyof typeof ROW_SELECT;
// Prisma's payload type for each select:
export type RowOf<K extends RowKind> =
  K extends "stop" ? Prisma.StopGetPayload<{ select: (typeof ROW_SELECT)["stop"] }> :
  K extends "item" ? Prisma.ItemGetPayload<{ select: (typeof ROW_SELECT)["item"] }> :
  K extends "transport" ? Prisma.TransportGetPayload<{ select: (typeof ROW_SELECT)["transport"] }> :
  K extends "accommodation" ? Prisma.AccommodationGetPayload<{ select: (typeof ROW_SELECT)["accommodation"] }> :
  K extends "cost" ? Prisma.CostGetPayload<{ select: (typeof ROW_SELECT)["cost"] }> :
  K extends "chapter" ? Prisma.ChapterGetPayload<{ select: (typeof ROW_SELECT)["chapter"] }> :
  K extends "note" ? Prisma.NoteGetPayload<{ select: (typeof ROW_SELECT)["note"] }> :
  K extends "reminder" ? Prisma.ReminderGetPayload<{ select: (typeof ROW_SELECT)["reminder"] }> :
  Prisma.ChecklistItemGetPayload<{ select: (typeof ROW_SELECT)["checklistItem"] }>;

function findRow<K extends RowKind>(kind: K, id: string, realPlanOnly: boolean): Promise<RowOf<K> | null> {
  const where = realPlanOnly && kind !== "note" && kind !== "reminder" && kind !== "checklistItem" ? { id, forkId: null } : { id };
  const select = ROW_SELECT[kind];
  // One switch so Prisma keeps the per-delegate types; `as never` only at the boundary.
  switch (kind) {
    case "stop": return db.stop.findUnique({ where, select: select as never }) as Promise<RowOf<K> | null>;
    case "item": return db.item.findUnique({ where, select: select as never }) as Promise<RowOf<K> | null>;
    case "transport": return db.transport.findUnique({ where, select: select as never }) as Promise<RowOf<K> | null>;
    case "accommodation": return db.accommodation.findUnique({ where, select: select as never }) as Promise<RowOf<K> | null>;
    case "cost": return db.cost.findUnique({ where, select: select as never }) as Promise<RowOf<K> | null>;
    case "chapter": return db.chapter.findUnique({ where, select: select as never }) as Promise<RowOf<K> | null>;
    case "note": return db.note.findUnique({ where: { id }, select: select as never }) as Promise<RowOf<K> | null>;
    case "reminder": return db.reminder.findUnique({ where: { id }, select: select as never }) as Promise<RowOf<K> | null>;
    default: return db.checklistItem.findUnique({ where: { id }, select: select as never }) as Promise<RowOf<K> | null>;
  }
}

function surpriseRefFor<K extends RowKind>(kind: K, row: RowOf<K>): SurpriseRef | null {
  switch (kind) {
    case "stop": return { stopId: (row as RowOf<"stop">).id };
    case "item": return { itemId: (row as RowOf<"item">).id };
    case "accommodation": return { accommodationId: (row as RowOf<"accommodation">).id };
    case "cost": { const c = row as RowOf<"cost">; return { costOwner: { ownerType: c.ownerType, ownerId: c.ownerId } }; }
    case "note": return { target: row as RowOf<"note"> };
    case "reminder": return { stopId: (row as RowOf<"reminder">).stopId };
    // Transport, Chapter and ChecklistItem are outside every Surprise
    // (CONTEXT.md Surprise: a Surprise is a Stop or an Item); SurpriseRef has
    // no variant for them, deliberately.
    default: return null;
  }
}

/**
 * The one entity guard (spec 2026-10-14 card C, ADR 0074 rule 1): load the
 * row by kind, notFound() if missing, requireTripAccess on its Trip, then
 * refuse a viewer surprised by it. Replaces fourteen private copies.
 * `realPlanOnly` (the Claude connection, lib/mcp/real-plan.ts) makes a Fork's
 * row read as missing.
 */
export async function requireRowAccess<K extends RowKind>(kind: K, id: string, opts: { realPlanOnly?: boolean } = {}) {
  const row = await findRow(kind, id, opts.realPlanOnly === true);
  if (!row) notFound();
  const { user, membership } = await requireTripAccess((row as { tripId: string }).tripId);
  const ref = surpriseRefFor(kind, row);
  const surpriseOf: SurpriseRoot | null = ref ? await requireOutsideSurprise(user.id, ref) : null;
  return { row, user, membership, surpriseOf };
}
```

Import `Prisma` from `@prisma/client` (the generated client; check how other `lib` files import the namespace). If the `RowOf` conditional type fights `tsc`, define nine small explicit row types instead (copy the field lists from the table) and keep the public interface identical.

Move `CHECKLIST_ITEM_ACTIVITY_SELECT` from `server/actions/checklists.ts` to a new `lib/checklists-select.ts` (or into the existing `lib/checklists.ts` if it has no `"use client"` or browser-only imports) and import it in `checklists.ts`.

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx vitest run lib/guards.test.ts server/actions/checklists.test.ts && npx tsc --noEmit && npx eslint lib/guards.ts lib/checklists*.ts server/actions/checklists.ts`

```bash
git add lib/guards.ts lib/guards.test.ts lib/checklists*.ts server/actions/checklists.ts
git commit -m "feat(guards): requireRowAccess(kind, id) — one load-check-surprise guard for every plan row

Card C. Per-kind selects are the union of what the fourteen private guards
read, so no caller needs a second query. Transport, Chapter and
ChecklistItem have no Surprise variant by design.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 4: Replace the private guards in stops, items, transport, accommodation

**Files:**
- Modify: `server/actions/stops.ts:66-98` (`requireStopAccess`), `server/actions/items.ts:63-78` (`requireItemAccess`), `server/actions/transport.ts:34-50` (`requireTransportAccess`), `server/actions/accommodation.ts:37-55` (`requireAccommodationAccess`)
- Modify: their tests (`*.test.ts`) only where a mock of the private guard's query shape now needs `requireRowAccess` mocked instead

**Interfaces:**
- Consumes: `requireRowAccess` (Task 3).

- [ ] **Step 1: In each file, replace the private function body with a one-line adapter that preserves the old return shape**

Keep the private function names so the dozens of call sites inside each file don't change; make each a thin adapter:

```ts
// stops.ts
async function requireStopAccess(stopId: string) {
  const { row, surpriseOf } = await requireRowAccess("stop", stopId);
  return { ...row, surpriseOf };
}
// items.ts
async function requireItemAccess(itemId: string) {
  const { row, user, surpriseOf } = await requireRowAccess("item", itemId);
  return { ...row, viewerId: user.id, surpriseOf };
}
// transport.ts — note: this guard now ALSO runs no Surprise check (unchanged behaviour), via the shared default
async function requireTransportAccess(transportId: string) {
  const { row } = await requireRowAccess("transport", transportId);
  return row;
}
// accommodation.ts
async function requireAccommodationAccess(accommodationId: string) {
  const { row, user, surpriseOf } = await requireRowAccess("accommodation", accommodationId);
  return { ...row, viewerId: user.id, surpriseOf };
}
```

Delete the now-unused imports (`requireOutsideSurprise`, maybe `notFound`) where eslint flags them. Where the old select carried a field the new row doesn't (compare with Task 3's table), add that field to `ROW_SELECT` in `lib/guards.ts` rather than adding a second query.

- [ ] **Step 2: Fix the tests**

Run: `npx vitest run server/actions/stops.test.ts server/actions/items.test.ts server/actions/transport.test.ts server/actions/accommodation.test.ts`

Failures will be of one kind: a test mocked `db.stop.findUnique` for the guard's query and asserted on its `select`. Change those tests to mock `@/lib/guards`' `requireRowAccess` (add it to the file's existing `vi.mock("@/lib/guards", ...)` factory returning `{ row: {...}, user: { id: "u1", email: "..." }, membership: { role: "owner" }, surpriseOf: null }`) and remove assertions about the guard's select. Keep every assertion about what the action writes. Tests that use `expectAccessCheckedBeforeWrite(requireTripAccessMock, writeMock)` should now pass `requireRowAccessMock` as the access mock.

- [ ] **Step 3: Verify and commit**

Run: `npx vitest related --run server/actions/stops.ts server/actions/items.ts server/actions/transport.ts server/actions/accommodation.ts && npx tsc --noEmit && npx eslint server/actions/stops.ts server/actions/items.ts server/actions/transport.ts server/actions/accommodation.ts`

```bash
git add server/actions/stops.ts server/actions/items.ts server/actions/transport.ts server/actions/accommodation.ts server/actions/*.test.ts
git commit -m "refactor(actions): stops, items, transport, accommodation guard through requireRowAccess

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 5: Replace the remaining private guards, and the MCP real-plan check

**Files:**
- Modify: `server/actions/costs.ts:32-50` (`requireCostAccess`), `server/actions/chapters.ts:36-44` (`requireChapterAccess`), `server/actions/notes.ts:28-40` (`requireNoteAccess`), `server/actions/reminders.ts:50-70` (`requireReminderAccess`), `server/actions/checklists.ts:80-89` (`requireChecklistItemAccess`), `server/actions/day-titles.ts:37-48` (`requireStopAccess`), `server/actions/item-photo.ts:25-37` (`requireItemPhotoAccess`)
- Modify: `lib/mcp/real-plan.ts` — `requireRealPlanRow(kind, id)` becomes `requireRowAccess(kind, id, { realPlanOnly: true })` with the `RealPlanKind` → `RowKind` names aligned (`RealPlanKind` is already a subset of `RowKind`)
- Modify: tests as in Task 4

- [ ] **Step 1: Adapters, same pattern as Task 4**

```ts
// costs.ts
async function requireCostAccess(costId: string) {
  const { row, user, surpriseOf } = await requireRowAccess("cost", costId);
  return { ...row, viewerId: user.id, surpriseOf };
}
// chapters.ts
async function requireChapterAccess(chapterId: string) { return (await requireRowAccess("chapter", chapterId)).row; }
// notes.ts
async function requireNoteAccess(noteId: string) {
  const { row, surpriseOf } = await requireRowAccess("note", noteId);
  return { ...row, surpriseOf };
}
// reminders.ts
async function requireReminderAccess(reminderId: string) {
  const { row, user, surpriseOf } = await requireRowAccess("reminder", reminderId);
  return { ...row, viewerId: user.id, surpriseOf };
}
// checklists.ts
async function requireChecklistItemAccess(itemId: string) { return (await requireRowAccess("checklistItem", itemId)).row; }
// day-titles.ts (delete its "replicated here" comment)
async function requireStopAccess(stopId: string) {
  const { row, user, surpriseOf } = await requireRowAccess("stop", stopId);
  return { ...row, viewerId: user.id, surpriseOf };
}
// item-photo.ts
async function requireItemPhotoAccess(itemId: string) {
  const { row, user } = await requireRowAccess("item", itemId);
  return { item: row, user };
}
```

`lib/mcp/real-plan.ts`:

```ts
import { requireRowAccess, type RowKind } from "@/lib/guards";
export type RealPlanKind = Extract<RowKind, "stop" | "item" | "chapter" | "accommodation" | "transport" | "cost">;
export async function requireRealPlanRow(kind: RealPlanKind, id: string): Promise<{ tripId: string }> {
  const { row } = await requireRowAccess(kind, id, { realPlanOnly: true });
  return { tripId: row.tripId };
}
// requireRealPlanRows unchanged
```

Delete `findRealPlanRow` and the private `surpriseRefFor` from that file.

- [ ] **Step 2: Fix tests, verify, commit**

Run: `npx vitest related --run server/actions/costs.ts server/actions/chapters.ts server/actions/notes.ts server/actions/reminders.ts server/actions/checklists.ts server/actions/day-titles.ts server/actions/item-photo.ts lib/mcp/real-plan.ts && npx tsc --noEmit && npx eslint server/actions lib/mcp/real-plan.ts`

```bash
git add server/actions lib/mcp/real-plan.ts
git commit -m "refactor(actions): the last private entity guards and the MCP real-plan check go through requireRowAccess

Fourteen copies replaced by one guard (card C).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 6: Plan access on writes, TB-03, TB-06, ARCH-TEN-9/10/11

**Files:**
- Modify: `server/actions/costs.ts` (`createCost`), `server/actions/stops.ts` (the three create paths at ~126, ~317, ~395 and `createStop`'s chapter check at 191-196 and 329-334; delete `assignStopToChapter` at ~1326), `server/actions/items.ts` (`createItem`, `scheduleItem`, `placeIdeaAtStop`), `server/actions/transport.ts` (`createTransport`, `reorderTransports`), `server/actions/chapters.ts` (`createChapter`, `reorderChapters`), `server/actions/booking-import.ts` (`importBooking`, `confirmProposal`), `server/actions/notes.ts` (`addNote`), `server/actions/attachments.ts` (`uploadAttachment`), `server/actions/invites.ts` (`cancelInvite`), `server/actions/activity.ts` (`getRecentActivity`), `app/(app)/trips/[tripId]/activity/page.tsx:19-23`, `components/trip/activity-feed.tsx:16-20`
- Modify: `lib/server-action-exports.test.ts` (remove `assignStopToChapter` from `"stops.ts"`)
- Tests: the matching `*.test.ts` files

**Interfaces:**
- Consumes: `requirePlanAccess` (Task 2), `requireRowAccess` (Task 3).

- [ ] **Step 1: Write the failing tests (one per bug or finding)**

In `server/actions/stops.test.ts`:

```ts
it("TB-03: createStop refuses a Chapter from another Trip even on the real plan", async () => {
  db.chapter.findUnique.mockResolvedValueOnce({ tripId: "trip-OTHER", forkId: null, startDate: null });
  const r = await createStop("trip-1", { name: "Rome", country: "Italy", nights: 2, chapterId: "ch-other" } as never);
  expect(r).toMatchObject({ success: false, errors: { chapterId: ["Chapter does not belong to this plan"] } });
  expect(db.stop.create).not.toHaveBeenCalled();
});
it("Review Focus 1: a forkId that is not this Trip's Fork is not found, nothing written", async () => {
  requirePlanAccessMock.mockRejectedValueOnce(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
  await expect(createStop("trip-1", { name: "Rome", country: "Italy", nights: 2 } as never, "fork-x")).rejects.toThrow(/404/);
  expect(db.stop.create).not.toHaveBeenCalled();
});
```

In `server/actions/costs.test.ts`: same two-line pattern for `createCost(tripId, input, "fork-x")`.
In `server/actions/invites.test.ts`:

```ts
it("ARCH-TEN-10: a non-owner member cannot cancel an Invite", async () => {
  requireTripAccessMock.mockResolvedValueOnce({ user: { id: "u2", email: "m@example.com" }, membership: { role: "member" } });
  const r = await cancelInvite("inv-1");
  expect(r.success).toBe(false);
  expect(db.invite.delete).not.toHaveBeenCalled();
});
```

In `server/actions/notes.test.ts`:

```ts
it("ARCH-TEN-9: addNote on a STOP target checks the Stop belongs to the Trip", async () => {
  requireRowAccessMock.mockResolvedValueOnce({ row: { id: "s1", tripId: "trip-OTHER" }, user: { id: "u1" }, membership: {}, surpriseOf: null });
  await expect(addNote("trip-1", { targetType: "STOP", targetId: "s1", body: "hi" } as never)).rejects.toThrow(/404/);
});
```

In `server/actions/activity.test.ts`: assert `getRecentActivity`'s `include.actor.select` has no `id`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/actions/stops.test.ts server/actions/costs.test.ts server/actions/invites.test.ts server/actions/notes.test.ts server/actions/activity.test.ts`

- [ ] **Step 3: Implement**

a) **Every write that accepts a client `forkId`** replaces its `await requireTripAccess(tripId)` with `const { user, membership, plan } = await requirePlanAccess(tripId, forkId);` and uses `plan` (never the raw `forkId`) in every `planScope(...)`, `forkId: ...` and `recordPlanActivity(...)` below it. Sites: `createCost` (costs.ts ~140), `createStop` / append / scheduled create paths (stops.ts ~126, ~317, ~395), `createItem`, `scheduleItem`, `placeIdeaAtStop` (items.ts 135, 656, 765), `createTransport`, `reorderTransports` (transport.ts 92, ~418), `createChapter`, `reorderChapters` (chapters.ts 79, 156), `importBooking` and `confirmProposal` (booking-import.ts 35-36, 85-87: validate with `requirePlanAccess(tripId, forkId)` before `loadImportContext` / `confirmProposalFor`). BI-12 closes here.

b) **TB-03.** In `stops.ts` both chapter checks select `{ tripId: true, forkId: true, startDate: true }` and refuse unless `chapter.tripId === tripId && chapter.forkId === plan`.

c) **TB-06.** Delete `assignStopToChapter` from `stops.ts` (~1326-1358) and its `"stops.ts"` ALLOWLIST entry. `chapters.ts`'s is the only one and already has both callers.

d) **ARCH-TEN-9.** `addNote` (notes.ts ~72) and `uploadAttachment` (attachments.ts ~111-157): when `targetType` is `STOP | ITEM | TRANSPORT | ACCOMMODATION` and a `targetId` is given, `const { row } = await requireRowAccess(kindFor(targetType), targetId); if (row.tripId !== tripId) notFound();` where `kindFor` maps `STOP→"stop"`, `ITEM→"item"`, `TRANSPORT→"transport"`, `ACCOMMODATION→"accommodation"`. `JOURNAL` (a date) and other target types keep their existing handling. Delete `addNote`'s separate `requireOutsideSurprise` call where the guard now covers it.

e) **ARCH-TEN-10.** `cancelInvite`: after `const { user, membership } = await requireTripAccess(invite.tripId)`, `if (!isTripOwnerOrAdmin(membership, user.email)) return { success: false, error: "Only the trip owner can cancel an invite." };` (Task 8 converts this shape).

f) **ARCH-TEN-11.** Drop `id` from the `actor` select in `activity.ts` (`getRecentActivity`) and `activity/page.tsx`; make `ActivityRow.actor` `Omit<TravellerLike, "id">` or `Pick<TravellerLike, "name" | "image" | "displayName" | "photoKey" | "photoUpdatedAt">` in `activity-feed.tsx` and fix any `key={a.actor.id}` to `key={a.id}`. Check `TravellerAvatar` props: if it requires `id`, pass the activity's own id as a stable key instead and note it in the commit.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest related --run server/actions/costs.ts server/actions/stops.ts server/actions/items.ts server/actions/transport.ts server/actions/chapters.ts server/actions/booking-import.ts server/actions/notes.ts server/actions/attachments.ts server/actions/invites.ts server/actions/activity.ts components/trip/activity-feed.tsx && npx vitest run lib/server-action-exports.test.ts && npx tsc --noEmit && npx eslint server/actions components/trip/activity-feed.tsx "app/(app)/trips/[tripId]/activity/page.tsx"`

```bash
git add -A server/actions lib/server-action-exports.test.ts components/trip/activity-feed.tsx "app/(app)/trips/[tripId]/activity/page.tsx"
git commit -m "fix(actions): writes validate forkId (requirePlanAccess), createStop checks the Chapter's Trip (TB-03), dead assignStopToChapter removed (TB-06), targetId validated on notes and uploads (ARCH-TEN-9), Invite cancel is owner-only (ARCH-TEN-10), actor ids stay server-side (ARCH-TEN-11)

Closes BI-12, ARCH-TEN-5.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 7: One form-level key, one reader, TB-04

**Files:**
- Modify: `lib/action-result.ts`, `lib/action-result.test.ts`
- Modify: `components/ui/action-failure.ts`, `components/ui/action-failure.test.ts` (create if absent)
- Modify: `components/ui/use-server-action.ts:53` (`_form` → `_`)
- Modify: writers: `server/actions/access-requests.ts` (120, 123, 177, 180, 279, 293), `server/actions/costs.ts` (156, 228, 308, 350), `server/actions/feedback.ts` (128, 131), `server/actions/profile.ts` (127), `server/actions/transport.ts` (74)
- Modify: readers: `components/trip/other-cost-editor.tsx:329`, `stop-form-dialog.tsx:45,457`, `accommodation-form-dialog.tsx:52,464`, `transport-form-dialog.tsx:78,994`, `add-reminder-dialog.tsx:23,127`, `item-form-dialog.tsx:74,957`, `chapter-form-dialog.tsx:28,230`, `add-from-globe-dialog.tsx:103`, `cost-editor.tsx:191`, `schedule-item-dialog.tsx:29,274`
- Modify: `components/trip/stop-deletion-preview.tsx:18`, `components/trip/delete-stop-dialog.tsx:35` (delete private `firstErrorMessage` copies)
- Test: `components/trip/stop-form-dialog.test.tsx` (TB-04)

**Interfaces:**
- Produces, `@/lib/action-result`:

```ts
export type ActionFailure<TFailure extends object = Record<never, never>> = { success: false; errors: FieldErrors; code?: string } & TFailure;
export type ActionResult<TSuccess extends object = Record<never, never>, TFailure extends object = Record<never, never>> =
  | ({ success: true } & TSuccess) | ActionFailure<TFailure>;
export function fail(errors: FieldErrors): ActionFailure;
export function fail<TFailure extends object>(errors: FieldErrors, extra: { code?: string } & TFailure): ActionFailure<TFailure>;
export function formFail(message: string, code?: string): ActionFailure; // = fail({ _: [message] }, { code })
export const FORM_ERROR_KEY = "_";
```

- Produces, `@/components/ui/action-failure`:

```ts
export function firstErrorMessage(failure: ActionFailure | FieldErrors | undefined, fallback: string): string; // accepts a result or a dict
export function formError(failure: ActionFailure | FieldErrors | undefined): string | undefined; // errors["_"]?.[0]
```

- [ ] **Step 1: Failing tests**

`lib/action-result.test.ts` additions:

```ts
it("formFail puts the message under the one form-level key and carries a code", () => {
  expect(formFail("Nope", "disabled")).toEqual({ success: false, errors: { _: ["Nope"] }, code: "disabled" });
});
it("fail() with extra failure fields keeps them on the failure branch", () => {
  const r = fail({ _: ["x"] }, { code: "busy", createdStops: { a: "b" } });
  expect(r.code).toBe("busy");
  expect(r.createdStops).toEqual({ a: "b" });
});
```

`components/ui/action-failure.test.ts`:

```ts
import { firstErrorMessage, formError } from "./action-failure";
it("reads a failure result or a bare dict", () => {
  expect(firstErrorMessage({ success: false, errors: { name: ["Too long"] } }, "fallback")).toBe("Too long");
  expect(firstErrorMessage({ name: ["Too long"] }, "fallback")).toBe("Too long");
  expect(firstErrorMessage(undefined, "fallback")).toBe("fallback");
  expect(formError({ success: false, errors: { _: ["Form-level"] } })).toBe("Form-level");
  expect(formError({ name: ["field"] })).toBeUndefined();
});
```

`components/trip/stop-form-dialog.test.tsx` (TB-04), in the file's existing render harness:

```ts
it("TB-04: shows the ADR 0073 refusal returned under the form-level key", async () => {
  updateStopMock.mockResolvedValueOnce({ success: false, errors: { _: ["A dated Trip's only Stop keeps the Trip's dates."] } });
  // render in edit mode, submit
  ...
  expect(await screen.findByText("A dated Trip's only Stop keeps the Trip's dates.")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/action-result.test.ts components/ui/action-failure.test.ts components/trip/stop-form-dialog.test.tsx`

- [ ] **Step 3: Implement**

`lib/action-result.ts`: the types above; `fail` overloads; `formFail`; `FORM_ERROR_KEY`. Update the file's doc comments to cite ADR 0074.

`components/ui/action-failure.ts`:

```ts
import type { ActionFailure, FieldErrors } from "@/lib/action-result";
function errorsOf(x: ActionFailure | FieldErrors | undefined): FieldErrors | undefined {
  if (!x) return undefined;
  return "success" in x ? (x as ActionFailure).errors : (x as FieldErrors);
}
export function firstErrorMessage(x: ActionFailure | FieldErrors | undefined, fallback: string): string {
  const errors = errorsOf(x);
  return (errors ? Object.values(errors).flat()[0] : undefined) ?? fallback;
}
export function formError(x: ActionFailure | FieldErrors | undefined): string | undefined {
  return errorsOf(x)?.["_"]?.[0];
}
```

`toastRefused` keeps accepting `FieldErrors | string` for now (Task 8 removes the string branch).

Writers: each `_form:` becomes `_:`; `{ success: false, errors: { _form: ["Trip not found"] } }` becomes `formFail("Trip not found")`.
Readers: each `(errors as FormErrors)._form?.[0]` becomes `formError(errors)`; delete the local `FormErrors` types that only added `_form`. `add-from-globe-dialog.tsx:103`: `firstErrorMessage(errors, ...)`. `use-server-action.ts:53`: key `_`.
`stop-deletion-preview.tsx` and `delete-stop-dialog.tsx`: import `firstErrorMessage` from `@/components/ui/action-failure`, delete the private copies.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest related --run lib/action-result.ts components/ui/action-failure.ts components/ui/use-server-action.ts server/actions/access-requests.ts server/actions/costs.ts server/actions/feedback.ts server/actions/profile.ts server/actions/transport.ts components/trip/*.tsx && npx tsc --noEmit && npx eslint lib/action-result.ts components/ui components/trip server/actions`
Also: `grep -rn '_form' server components lib --include='*.ts' --include='*.tsx' | grep -v test` must print nothing.

```bash
git add -A lib/action-result.ts lib/action-result.test.ts components/ui server/actions components/trip
git commit -m "fix(actions): one form-level error key (\"_\"), formError()/firstErrorMessage() readers, TB-04 — the Stop form shows the ADR 0073 refusal

ADR 0074 rule 2. _form retired at five writers and ten readers; two private
firstErrorMessage copies deleted.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 8: `{ success: false, error }` becomes `ActionResult` everywhere

**Files:**
- Modify (writers, 84 sites): `server/actions/attachments.ts`, `chapters.ts`, `checklists.ts`, `costs.ts`, `cover.ts`, `forks.ts`, `invites.ts`, `items.ts`, `stops.ts`, `votes.ts`, `transport.ts`, `trips.ts`
- Modify (type aliases): `AttachmentActionResult`, `CoverActionResult`, `InviteResult`, `CancelInviteResult`, `CreateForkResult`, `ForkMutationResult`, `PromoteForkResult`, `SetHardEndDateResult`, `DeleteTripResult`, `RestoreTripResult`, `DuplicateTripResult`, `RemoveTripMemberResult`, `LeaveTripResult`, `VoteActionResult` (already `errors`-shaped; just alias to `ActionResult`)
- Modify (readers, 15 sites): `components/trip/attachment-list.tsx:186`, `file-link-dialog.tsx:36`, `fork-switcher.tsx:91,168`, `file-title-dialog.tsx:31`, `promote-fork-dialog.tsx:156`, `journal-editor.tsx:102`, `settings/danger-zone.tsx:42`, `settings/invite-panel.tsx:74,103,121`, `booking-import/booking-import-sheet.tsx:197`, `account/devices-panel.tsx:168,180` (devices is Task 9; skip here), `trips/recently-deleted.tsx:35`
- Modify: `lib/mcp/run-tool.ts:30-33` (drop the `error` branch), `components/ui/action-failure.ts` (`toastRefused` drops the string branch)
- Tests: the matching `*.test.ts(x)` files

- [ ] **Step 1: Mechanical rewrite of writers**

Pattern: `return { success: false, error: "MSG" };` → `return formFail("MSG");` (import `formFail` from `@/lib/action-result`). Where the failure carried a `code` (`AttachmentActionResult`), `formFail("MSG", code)`. Each alias becomes `ActionResult<…success payload…>`, e.g. `export type CreateForkResult = ActionResult<{ forkId: string }>`, `export type InviteResult = ActionResult<{ inviteId: string }>`, `export type DuplicateTripResult = ActionResult<{ tripId: string; slug: string }>`.

Use a scripted first pass, then review every hunk by hand:

```bash
grep -rln 'success: false, error' server/actions/*.ts | grep -v test | xargs sed -i -E 's/return \{ success: false, error: ("[^"]*"|`[^`]*`|[a-zA-Z_.]+) \};/return formFail(\1);/g'
```

Any site the regex misses (multi-line, or with a `code`) is edited by hand. Add the `formFail` import to each file.

- [ ] **Step 2: Readers**

`result.error` → `firstErrorMessage(result, FALLBACK)` with the component's existing fallback copy (or `formError(result) ?? FALLBACK`). The invite panel toasts `result.error` directly: `toast({ title: firstErrorMessage(result, "Couldn't do that."), variant: "destructive" })`.

`lib/mcp/run-tool.ts`:

```ts
const v = value as { success: boolean; errors?: Record<string, string[]> };
if (v.success === false) return text(`Couldn't do that: ${fieldErrors(v.errors ?? {})}`, true);
```

`toastRefused(reason: FieldErrors | ActionFailure | undefined, fallback)` — no more `string`.

- [ ] **Step 3: Tests**

Run the related tests; update assertions from `{ success: false, error: "X" }` to `{ success: false, errors: { _: ["X"] } }` (or `expect(firstErrorMessage(r, "")).toBe("X")`). Keep every behavioural assertion.

- [ ] **Step 4: Guard: nothing writes the old shape**

Create `lib/action-result.guard.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { walkSources } from "@/test/helpers/walk-sources";
describe("ADR 0074: every action fails as ActionResult", () => {
  const files = walkSources("server/actions", { skipTests: true });
  it.each(files)("%s has no legacy failure shape", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).not.toMatch(/success:\s*false,\s*error\b/);
    expect(src).not.toMatch(/_form/);
  });
});
```

(Task 9 adds the `ok: false` line to this test once the `ok` shapes are gone.)

- [ ] **Step 5: Verify and commit**

Run: `npx vitest related --run server/actions/*.ts components/trip/*.tsx components/trips/*.tsx components/booking-import/*.tsx lib/mcp/run-tool.ts && npx vitest run lib/action-result.guard.test.ts && npx tsc --noEmit && npx eslint server/actions components lib/mcp/run-tool.ts`

```bash
git add -A server/actions components lib
git commit -m "refactor(actions): every { success: false, error } becomes ActionResult (84 sites, 12 files, 15 readers)

ADR 0074 rule 2. run-tool and toastRefused read one shape; a guard test
keeps the legacy shapes out of server/actions.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 9: `{ ok, reason }` and `{ ok, error }` become `ActionResult` with a `code`

**Files:**
- Modify: `server/actions/devices.ts` (`RemoveDeviceResult`, line 42, 207), `server/actions/digest.ts` (`SendTestDigestResult` 30-38, 111, 124), `server/actions/ai.ts` (47, 100), `server/actions/booking-import.ts` (31-77, 85-87), `server/actions/push.ts` (`PushActionResult`, `reason: "conflict"`)
- Modify: `lib/booking-import/types.ts:168-181` (`ImportBookingResult`, `ConfirmProposalResult`)
- Modify readers: `components/account/devices-panel.tsx:97,164,174`, `components/trip/settings/digest-panel.tsx`, `components/booking-import/booking-import-sheet.tsx:114-132, 261-274`, the AI suggestion panels that read `aiSuggestActivities` / `aiDraftPackingList` results (grep `reason === "disabled"`), `components/account/push-subscribe.ts` (reads `reason: "conflict"`)
- Modify: `lib/action-result.guard.test.ts` (add `expect(src).not.toMatch(/\bok:\s*(true|false)\b/)`)

**Interfaces:**
- `ImportBookingResult = ActionResult<{ proposals: Proposal[]; partial: boolean; context: ImportContext }, { retryInMinutes?: number }>` with `code: BookingImportFailureReason`.
- `ConfirmProposalResult = ActionResult<{ createdId: string; createdStops: Record<string, string> }, { createdStops: Record<string, string> }>`.
- `SendTestDigestResult = ActionResult<{ sent: number; placeholder: boolean }>`.
- `RemoveDeviceResult = ActionResult`.
- `PushActionResult = ActionResult<{…}, {}>` with `code: "conflict"` on the failure branch; `push-subscribe.ts` branches on `code === "conflict"` (ADR 0053 retry — keep its behaviour; there is no test for it today, add one: `components/account/push-subscribe.test.ts` asserting that a `code: "conflict"` failure triggers one re-subscribe).
- `lib/ai.ts` is a plain lib module, not an action; its `{ ok, reason }` stays. Only the action wrappers in `server/actions/ai.ts` convert.

- [ ] **Step 1: Failing tests** — in each action's test, change the expected failure to `{ success: false, code: "<reason>", errors: { _: [message] } }`; in `booking-import-sheet.test.tsx` assert the "busy" retry still appears for `code: "busy"`; add the push-subscribe conflict test.
- [ ] **Step 2: Implement** per the interfaces; the sheet reads `result.success`, `result.code`, `formError(result)`; the "failed" phase's `retry` is `result.code === "busy"`.
- [ ] **Step 3: Verify and commit**

Run: `npx vitest related --run server/actions/devices.ts server/actions/digest.ts server/actions/ai.ts server/actions/booking-import.ts server/actions/push.ts lib/booking-import/types.ts components/account/*.ts* components/booking-import/*.tsx components/trip/settings/digest-panel.tsx && npx vitest run lib/action-result.guard.test.ts && npx tsc --noEmit && npx eslint server/actions components lib/booking-import`

```bash
git add -A server/actions lib components
git commit -m "refactor(actions): ok/reason and ok/error shapes become ActionResult with a code

ADR 0074: devices, digest, AI, push and the Booking import; the sheet and
panels read success/code/formError; push-subscribe's ADR 0053 conflict
retry gains its first test.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 10: `lib/flags-loader.ts` owns the Flag rows; TB-01; LA-215 (TB-02)

**Files:**
- Modify: `lib/flags-loader.ts`, `lib/flags-loader.test.ts`
- Modify: `lib/nav-counts.ts:48-140`, `lib/nav-counts.test.ts`
- Modify: `lib/next-steps-loader.ts:70-110`, `lib/next-steps-builder.ts:40-80`, their tests
- Modify: `lib/desktop-home-loader.ts:140-220` (flags part only), its test
- Modify: `lib/compare.ts` (`PlanMetricsInput`, `computePlanMetrics` 140-185 and 300-360), `lib/compare.test.ts`; `server/actions/forks.ts` `getComparison` (475-630: pass home fields)

**Interfaces:**
- Produces, `@/lib/flags-loader`:

```ts
export type FlagRows = {
  trip: FlagsAssemblyInput["trip"] & { startDate: string | null; endDate: string | null };
  allStops: RawAllStopRow[]; transports: FlagTransport[]; accommodations: FlagAccommodation[]; items: FlagItem[];
  hiddenStopIds: readonly string[];
};
export const FLAG_TRIP_SELECT = { startDate, endDate, drivingWindingFactor, drivingAvgSpeedKph, homeName, homeLat, homeLng, homeCountryCode, homeTimezone, roundTrip } as const;
export const FLAG_STOP_SELECT, FLAG_TRANSPORT_SELECT, FLAG_ACCOMMODATION_SELECT, FLAG_ITEM_SELECT; // the unions of today's four copies
export async function loadFlagRows(tripId: string, viewerId: string, plan?: PlanId): Promise<FlagRows | null>; // null when the trip has no dates; does NOT call requireTripAccess (callers do)
export function flagsFromRows(input: FlagsAssemblyInput): Flag[]; // unchanged
export function flagsForRows(rows: FlagRows, projection: TripProjection): Flag[]; // = flagsFromRows with the fields spread from rows
```

- [ ] **Step 1: Failing tests**

`lib/flags-loader.test.ts`:

```ts
it("TB-01: loadFlagRows carries homeTimezone so every caller's detectFlags gets it", async () => {
  db.trip.findUnique.mockResolvedValueOnce(trip({ homeTimezone: "Australia/Sydney" }));
  db.stop.findMany.mockResolvedValueOnce(datedTripFixture().stops);
  const rows = await loadFlagRows("trip-1", "u1");
  expect(rows?.trip.homeTimezone).toBe("Australia/Sydney");
  expect(db.trip.findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ homeTimezone: true }) }));
});
```

`lib/nav-counts.test.ts`: assert `detectFlags` (mocked) is called with `homeTimezone: "Australia/Sydney"` when the trip row has it, and that `loadNavCounts` no longer calls `db.stop.findMany` itself (it calls `loadFlagRows`, mocked).

`lib/compare.test.ts` (TB-02):

```ts
it("TB-02: a dated real-plan Stop with nights null counts its nights from its dates", () => {
  const m = computePlanMetrics({ ...base, stops: [stop({ nights: null, arriveDate: "2026-11-01", departDate: "2026-11-04" }) as never] });
  expect(m.nightTotal).toBe(3);
});
it("Compare's Flags get the Home base fields", () => {
  // detectFlags mocked; assert home / homeTimezone / roundTrip / homeFirstStop / homeLastStop are passed
});
```

- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement**

`flags-loader.ts`: add the selects and `loadFlagRows` (the four reads in one `Promise.all`, `loadSurpriseVisibility(tripId, viewerId)` first, `planScope(plan)` on each where). `loadFlags` becomes `requireTripAccess` → `loadFlagRows` → `getTripProjection` → `flagsForRows`.

`nav-counts.ts`: delete the trip/stop/transport/accommodation/item selects (lines 48-125); `const rows = await loadFlagRows(tripId, user.id); if (!rows) return { flags: 0, wishlist }; const projection = await getTripProjection(tripId); return { flags: flagsForRows(rows, projection).length, wishlist };`. Keep the wishlist count.

`next-steps-loader.ts`: use `loadFlagRows` for the four plan reads (keep the chapter/checklist counts and slug in the same `Promise.all`), compute the projection from `rows` as today, and pass `home: tripHomeBase(rows.trip)`, `homeTimezone: rows.trip.homeTimezone`, `roundTrip: rows.trip.roundTrip ?? undefined`, `homeFirstStop`, `homeLastStop` through `BuildTripNextStepsInput` (add those five optional fields to the builder's input and forward them to `detectFlags`).

`desktop-home-loader.ts`: the four plan reads feed `flagsFromRows` as Summary does; replace them with `loadFlagRows` only if the loader's other consumers (budget, route) don't need wider selects. If they do, keep the loader's own reads but call `flagsFromRows` with `homeTimezone` added (the point is one assembler, not necessarily one query). Say which in the commit.

`compare.ts`: `PlanMetricsInput.trip` gains `homeName, homeLat, homeLng, homeCountryCode, homeTimezone, roundTrip` (optional, nullable); `computePlanMetrics` passes `home: tripHomeBase(trip)`, `homeTimezone`, `roundTrip`, `homeFirstStop`/`homeLastStop` (first/last by sortOrder across all stops) to `detectFlags`. Night total: `s.nights ?? (s.arriveDate && s.departDate ? nightsBetween(s.arriveDate, s.departDate) : 0)` with `nightsBetween` from `@/lib/dates`. `getComparison` selects the six home fields on the trip.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest related --run lib/flags-loader.ts lib/nav-counts.ts lib/next-steps-loader.ts lib/next-steps-builder.ts lib/desktop-home-loader.ts lib/compare.ts server/actions/forks.ts && npx tsc --noEmit && npx eslint lib server/actions/forks.ts`

```bash
git add -A lib server/actions/forks.ts
git commit -m "fix(flags): one loadFlagRows feeds every Flag count — the badge and Summary agree (TB-01); Compare counts nights from dates and gets the Home base (TB-02, LA-215)

Card B. Four private selects deleted.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 11: `duplicateTrip` copies the real plan only (TB-05)

**Files:**
- Modify: `server/actions/trips.ts:534-541`
- Test: `server/actions/trips.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("TB-05: duplicateTrip reads only the real plan's rows, so the copy has no Fork rows", async () => {
  await duplicateTrip("trip-1", "Copy");
  const call = db.trip.findUnique.mock.calls.find((c) => c[0]?.include?.stops)?.[0];
  expect(call.include.stops).toEqual({ where: { forkId: null } });
  expect(call.include.items).toEqual({ where: { forkId: null } });
  expect(call.include.transports).toEqual({ where: { forkId: null } });
  expect(call.include.chapters).toEqual({ where: { forkId: null } });
});
```

- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement** — `include: { members: {...}, chapters: { where: REAL_PLAN }, stops: { where: REAL_PLAN }, items: { where: REAL_PLAN }, transports: { where: REAL_PLAN }, checklistItems: true }` (checklists are trip-wide, CONTEXT.md **Plan**). Add a comment: "Forks are frozen (open-follow-ups, settled 2026-10-14); the copy is the real plan and has no Forks."
- [ ] **Step 4: Verify and commit**

Run: `npx vitest related --run server/actions/trips.ts && npx tsc --noEmit && npx eslint server/actions/trips.ts`

```bash
git add server/actions/trips.ts server/actions/trips.test.ts
git commit -m "fix(trips): Duplicate copies the real plan only (TB-05)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 12: `lib/plan-reads.ts` — the Plan reader, the Trip header, the fork gate

**Files:**
- Create: `lib/plan-reads.ts`, `lib/plan-reads.test.ts`
- Create: `test/integration/plan-reads.test.ts` (model it on `test/integration/day-view-loader.test.ts`)
- Modify: `lib/trip-shell-reads.ts` (`TRIP_SHELL_SELECT` widens; add `readTripHeader`), `lib/trip-shell-reads.test.ts`
- Modify: `lib/trip-slug-read.ts` (`tripSlugFor` reads through `readTripShell`), `lib/trip-slug-read.test.ts`
- Modify: `lib/share-lookup.ts` (`findShareLink` in `cache()`)

**Interfaces:**
- Produces, `@/lib/trip-shell-reads`: `TRIP_SHELL_SELECT` now also selects `hardEndDate, homeName, homeLat, homeLng, homeCountryCode, homeTimezone, roundTrip, chaptersEnabled, drivingWindingFactor, drivingAvgSpeedKph, deletedAt`; `export const readTripHeader = readTripShell` (alias, so the name reads right at page call sites); `export type TripHeader = NonNullable<Awaited<ReturnType<typeof readTripShell>>>`.
- Produces, `@/lib/trip-slug-read`: `tripSlugFor(tripId)` = `(await readTripShell(tripId))?.slug ?? tripId` (no own query).
- Produces, `@/lib/plan-reads`:

```ts
import type { PlanId } from "@/lib/plan-scope";
export type PlanViewer = string | null; // a Traveller id, or null for the public (Share, Calendar feed): surprised by every live Surprise

export type PlanStopRow = Prisma.StopGetPayload<{ select: typeof PLAN_STOP_SELECT }> & { surprise: SurpriseView | null };
export type PlanTransportRow = Prisma.TransportGetPayload<{ select: typeof PLAN_TRANSPORT_SELECT }>;
export type PlanAccommodationRow = Prisma.AccommodationGetPayload<{ select: typeof PLAN_ACCOMMODATION_SELECT }>;
export type PlanItemRow = (Prisma.ItemGetPayload<{ select: typeof PLAN_ITEM_SELECT }> | PlaceholderItem) & { surprise: SurpriseView | null };
export type PlanCostRow = Prisma.CostGetPayload<{ select: typeof COST_SELECT }>;
export type PlanChapterRow = Prisma.ChapterGetPayload<{ select: typeof PLAN_CHAPTER_SELECT }>;

export type PlanRows = {
  trip: TripHeader;
  plan: PlanId;
  fork: { id: string; name: string } | null;
  visibility: SurpriseVisibility;
  /** Every Stop of the Plan (dated and rough), plan order, hidden Stops masked (notes null), `surprise` attached. */
  stops: PlanStopRow[];
  transports: PlanTransportRow[];
  /** Only what the viewer may see (v.where.accommodation). */
  accommodations: PlanAccommodationRow[];
  /** Only what the viewer may see, plus one placeholder per hidden root Item of THIS plan. */
  items: PlanItemRow[];
  /** Unfiltered: hidden Costs stay in totals (callers pass `visibility.hiddenOwnerIds` to the budget). */
  costs: PlanCostRow[];
  exchangeRates: { base: string; quote: string; rate: number; manual: boolean; fetchedAt: Date | null }[];
  /** [] when the Trip's chapters toggle is off (a disabled Trip renders flat). Dated and rough. */
  chapters: PlanChapterRow[];
  /** Unfiltered, minimal rows for buildBudget's byStop/byDay placement (never rendered). */
  budgetItems: { id: string; stopId: string | null; category: string; date: string | null }[];
  budgetAccommodations: { id: string; stopId: string; checkIn: string; checkOut: string }[];
};

/** The Plan a page's `?plan=` selects: Forks off → real plan; a Fork of this Trip → it; anything else → real plan (reads fall back; writes don't — lib/guards.ts requirePlanAccess). */
export async function resolvePlanParam(tripId: string, planParam: string | string[] | undefined): Promise<{ plan: PlanId; fork: { id: string; name: string } | null }>;

/** Everything a page needs to render one Plan, read once per request (React cache). Does NOT check access — callers call requireTripAccess first (every page already does). */
export const readPlan: (tripId: string, viewer: PlanViewer, plan: PlanId) => Promise<PlanRows>;

/** Pure: the Stop with `surprise` attached and hidden notes blanked; exported for the Share page which keeps its own gated reads. */
export function maskPlanStops<T extends { id: string; notes?: string | null }>(stops: T[], v: SurpriseVisibility): Array<T & { surprise: SurpriseView | null }>;
/** Pure: visible Item rows + this plan's placeholders, each with `surprise`. */
export function mergePlanItems<T extends { id: string }>(rows: T[], v: SurpriseVisibility, plan: PlanId): Array<(T | PlaceholderItem) & { surprise: SurpriseView | null }>;
```

Selects: `PLAN_STOP_SELECT` = every Stop scalar column the Plan, Summary, Print, Calendar, Budget and Compare pages select today (id, tripId, forkId, name, country, countryCode, lat, lng, timezone, arriveDate, departDate, nights, pinned, sortOrder, notes, chapterId, chapterSortOrder) — NOT the nested `accommodations` include (Plan page joins from `accommodations` by `stopId` instead). `PLAN_TRANSPORT_SELECT` = the Plan page's full transport select. `PLAN_ACCOMMODATION_SELECT` = the Plan page's accommodation select plus `forkId, tripId`. `PLAN_ITEM_SELECT` = the Plan page's item select plus `forkId, tripId, sortOrder, sourceItemId`, filtered to plan placements (`PLAN_PLACEMENT_WHERE`): things to do and scheduled Items together (callers split by `date === null`). `COST_SELECT` from where the pages import it today. `PLAN_CHAPTER_SELECT` = `{ id, name, colour, startDate, endDate, sortOrder }`. Exchange rates with `manual, fetchedAt` (Budget needs them).

`readPlan` runs: `readTripShell(tripId)` (notFound if null or `deletedAt`), `loadSurpriseVisibility(tripId, viewer)`, then ONE `Promise.all` of the eight reads, then `maskPlanStops` and `mergePlanItems`. Chapters read only when `trip.chaptersEnabled`. Stops ordered through `orderPlanStops` from `@/lib/plan-order` (so every page shares the ordering rule).

`cache()` keys: three primitives (`tripId`, `viewer`, `plan`), so identity is stable within a request.

- [ ] **Step 1: Failing unit tests** (`lib/plan-reads.test.ts`, mocks `@/lib/db` via `mockDb`, `@/lib/surprise-visibility` via the existing helper, `@/lib/trip-shell-reads`):

```ts
it("reads the eight tables in one wave with the plan scope on every plan table", async () => { /* assert each findMany where contains forkId: null; exchangeRate where has no forkId */ });
it("a Fork id reads that Fork's rows", async () => { /* forkId: "fork-1" on stop/transport/... */ });
it("Review Focus 3: a hidden Stop comes back with notes null and its Surprise view; a hidden root Item comes back as its placeholder", async () => { /* use hiddenVisibility() and placeholderItem() from test/helpers/surprise-visibility */ });
it("a Fork's placeholders are not merged into the real plan", async () => {});
it("chapters are [] when the Trip's chapters toggle is off and the chapter table is not read", async () => {});
it("costs are unfiltered and budgetItems/budgetAccommodations are the minimal unfiltered rows", async () => {});
it("resolvePlanParam: Forks off → real plan; a Fork of this Trip → it; a stranger's id → real plan", async () => {});
it("tripSlugFor reads through readTripShell and never its own query", async () => { /* in lib/trip-slug-read.test.ts */ });
```

- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement** `lib/plan-reads.ts` per the interface, `import "server-only"` first (and add the file to `lib/server-only-boundary.test.ts`'s list). Widen `TRIP_SHELL_SELECT`; add `readTripHeader`; rewrite `tripSlugFor`; wrap `findShareLink` in `cache()`.
- [ ] **Step 4: Integration test** `test/integration/plan-reads.test.ts`: seed a Trip with two dated Stops, one Fork with one Stop, one Surprise Stop hidden from a second member; assert `readPlan(trip, member2, null)` masks the Surprise Stop's notes and excludes the Fork's Stop; `readPlan(trip, owner, fork.id)` returns the Fork's Stop. Follow `test/integration/day-view-loader.test.ts` for the harness and reset.
- [ ] **Step 5: Verify and commit**

Run: `npx vitest run lib/plan-reads.test.ts lib/trip-shell-reads.test.ts lib/trip-slug-read.test.ts lib/server-only-boundary.test.ts && npx tsc --noEmit && npx eslint lib/plan-reads.ts lib/trip-shell-reads.ts lib/trip-slug-read.ts lib/share-lookup.ts`; integration: `npm run test:integration -- test/integration/plan-reads.test.ts` (needs the local DB).

```bash
git add -A lib test/integration/plan-reads.test.ts
git commit -m "feat(plan): readPlan — one cached, plan-aware, Surprise-applied reader; readTripHeader; tripSlugFor reads the shell; findShareLink cached

Card A, spec Q2. Viewer is a required argument.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 13: Summary page reads through `readPlan`

**Files:**
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx:100-300, 360-400`
- Modify: `app/(app)/trips/[tripId]/summary/page.test.tsx` (rewrite mocks, keep assertions — spec Q10)

- [ ] **Step 1: Rewrite the test's mocks first**

Replace the `mockDb` + per-table mocks with `vi.mock("@/lib/plan-reads", () => ({ readPlan: readPlanMock }))` and `vi.mock("@/lib/trip-shell-reads", ...)` returning builders from `@/test/builders` wrapped as `PlanRows` (write a small `planRows(overrides)` helper at the top of the test file, or in `test/builders/plan-rows.ts` if a second page test needs it — Task 14 will, so put it in `test/builders/plan-rows.ts`:

```ts
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import type { PlanRows } from "@/lib/plan-reads";
import { datedTripFixture } from "./index";
export function planRows(o: Partial<PlanRows> = {}): PlanRows {
  const f = datedTripFixture();
  return {
    trip: { ...f.trip, members: [], stops: f.stops.map((s) => ({ id: s.id, sortOrder: s.sortOrder, timezone: s.timezone, arriveDate: s.arriveDate, departDate: s.departDate })) } as never,
    plan: null, fork: null, visibility: NO_SURPRISES,
    stops: f.stops.map((s) => ({ ...s, surprise: null })), transports: f.transports, accommodations: f.stays,
    items: f.items.map((i) => ({ ...i, surprise: null })), costs: f.costs, exchangeRates: [], chapters: [],
    budgetItems: f.items.map((i) => ({ id: i.id, stopId: i.stopId, category: i.category, date: i.date })),
    budgetAccommodations: f.stays.map((a) => ({ id: a.id, stopId: a.stopId, checkIn: a.checkIn, checkOut: a.checkOut })),
    ...o,
  };
}
```

Every `it(...)` keeps its rendering assertions. Delete only assertions on `mockDb.x.findMany` call shapes (e.g. "reads Stops once … not with a second round of reads", the `MARKER_WHERE` fragment checks) and say so in the commit message; those behaviours are now pinned in `lib/plan-reads.test.ts`. Run the test file: it fails because the page still reads `db`.

- [ ] **Step 2: Rewrite the page's data section**

```ts
const { user, membership } = await requireTripAccess(tripId);
const isOwner = isTripOwnerOrAdmin(membership, user.email);
const rows = await readPlan(tripId, user.id, REAL_PLAN.forkId); // real plan: Summary ignores ?plan= (policy, sitrep)
const { trip } = rows;
if (!trip.startDate || !trip.endDate) { /* date-less branch uses rows.stops.filter(s => s.arriveDate === null) and rows.chapters */ }
const allStops = rows.stops; const transports = rows.transports; const accommodations = rows.accommodations;
const items = rows.items; const costs = rows.costs; const exchangeRates = rows.exchangeRates;
const datedChapters = rows.chapters.filter((c) => c.startDate !== null);
const slug = trip.slug ?? tripId;
const v = rows.visibility;
// budgetItems / budgetAccommodations from rows
```

Remove the page's `db` import, `tripSlugFor`, `loadSurpriseVisibility`, `maskSurpriseStops`, the placeholder merge. Keep `computeProjection`, `flagsFromRows`, `buildBudget`, Make it fit and every render path unchanged.

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run "app/(app)/trips/[tripId]/summary/page.test.tsx" && npx tsc --noEmit && npx eslint "app/(app)/trips/[tripId]/summary/page.tsx"`

```bash
git add -A "app/(app)/trips/[tripId]/summary" test/builders
git commit -m "refactor(summary): read through readPlan; page test mocks one reader, assertions kept

Deleted assertions: <list the query-shape-only ones>.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 14: Print page and Calendar page read through `readPlan`

**Files:**
- Modify: `app/(app)/trips/[tripId]/print/page.tsx:60-215` and its test
- Modify: `app/(app)/trips/[tripId]/calendar/page.tsx:30-140` and its test

- [ ] **Step 1: Tests first, as Task 13** (use `planRows()`; keep rendering assertions).
- [ ] **Step 2: Print** — `rows = await readPlan(tripId, user.id, null)`; `rawStops = rows.stops.filter(s => s.arriveDate !== null)`; everything else from `rows`; delete the own reads, the placeholder merge and the notes masking (already applied).
- [ ] **Step 3: Calendar** — `rows` as above; `stops = rows.stops.filter(s => s.arriveDate)`; `items = rows.items.filter(i => i.date)`; `wishlistItems` stays its own read (Wishlist ideas are trip-wide, not Plan rows — CONTEXT.md **Plan**; keep `db.item.findMany({ ...WISHLIST_IDEA_WHERE })` for that one list). `slug = rows.trip.slug ?? tripId`.
- [ ] **Step 4: Verify and commit**

Run: `npx vitest run "app/(app)/trips/[tripId]/print/page.test.tsx" "app/(app)/trips/[tripId]/calendar/page.test.tsx" && npx tsc --noEmit && npx eslint "app/(app)/trips/[tripId]/print" "app/(app)/trips/[tripId]/calendar"`

```bash
git add -A "app/(app)/trips/[tripId]/print" "app/(app)/trips/[tripId]/calendar"
git commit -m "refactor(print,calendar): read through readPlan

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 15: Plan page reads through `readPlan` and `resolvePlanParam`

**Files:**
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx:80-300` and its test (522 lines; mocks rewritten, assertions kept)

- [ ] **Step 1: Tests first** (`planRows()` plus the page's own remaining reads: attachments, notes, day titles, reminders, members).
- [ ] **Step 2: Page** —

```ts
const { user, membership } = await requireTripAccess(tripId);
const { plan: activeForkId, fork: activeFork } = await resolvePlanParam(tripId, plan);
const rows = await readPlan(tripId, user.id, activeForkId);
const [allAttachments, allNotes, dayTitleRows, stopReminders] = await Promise.all([ /* the page's non-Plan reads, unchanged, spreading rows.visibility.where.* */ ]);
const trip = rows.trip; const slug = trip.slug ?? tripId; const members = trip.members.map((m) => m.user);
const stopRows = rows.stops.map((s) => ({ ...s, accommodations: rows.accommodations.filter((a) => a.stopId === s.id) }));
const thingsToDoItems = rows.items.filter((i) => i.stopId && !i.date);
const scheduledItemRows = rows.items.filter((i) => i.stopId && i.date);
const allCosts = rows.costs.filter((c) => ["TRANSPORT", "ACCOMMODATION", "ITEM"].includes(c.ownerType) && c.ownerId);
```

Delete the `forkGate` query, the second `db.trip.findUnique`, and the Plan-row reads. Delete the `homeCountryCode` prop pass at line 575 (card P; the manager never reads it — Task 21 deletes the prop type).

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run "app/(app)/trips/[tripId]/plan/page.test.tsx" && npx tsc --noEmit && npx eslint "app/(app)/trips/[tripId]/plan/page.tsx"`

```bash
git add -A "app/(app)/trips/[tripId]/plan"
git commit -m "refactor(plan): resolvePlanParam + readPlan replace the fork gate and the Plan-row reads

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 16: Budget, Wishlist and Compare read through the Plan reader

**Files:**
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx:85-215` and test
- Modify: `app/(app)/trips/[tripId]/wishlist/page.tsx:40-130` (fork gate only; ideas stay their own read) and test
- Modify: `server/actions/forks.ts` `getComparison` (475-630): per plan entry, `readPlan(tripId, user.id, forkId)` replaces the per-plan `Promise.all`; `computePlanMetrics` takes `rows.*`; and test

- [ ] **Step 1: Tests first.**
- [ ] **Step 2: Budget** — `resolvePlanParam` for the gate; `rows = await readPlan(tripId, user.id, activeForkId)`; `allCosts = rows.costs`, `stops = rows.stops.filter(s => s.arriveDate)`, `items`, `accommodations`, `transports`, `exchangeRates`, `chapters = rows.chapters.filter(c => c.startDate)`; `shell`/`slug` from `rows.trip`.
- [ ] **Step 3: Wishlist** — `resolvePlanParam` replaces its gate; the Trip read stays only if it selects something `readTripShell` doesn't (it selects `stops` with a nested where: replace with `readTripShell`'s `stops` which are already real-plan dated Stops, plus `items` through the existing ideas query).
- [ ] **Step 4: Compare** — `getComparison` maps `planEntries` to `readPlan(tripId, user.id, forkId)` and feeds `computePlanMetrics` (with the home fields from `rows.trip`, Task 10).
- [ ] **Step 5: Verify and commit**

Run: `npx vitest run "app/(app)/trips/[tripId]/budget" "app/(app)/trips/[tripId]/wishlist" server/actions/forks.test.ts && npx tsc --noEmit && npx eslint "app/(app)/trips/[tripId]/budget" "app/(app)/trips/[tripId]/wishlist" server/actions/forks.ts`

```bash
git add -A "app/(app)/trips/[tripId]/budget" "app/(app)/trips/[tripId]/wishlist" server/actions/forks.ts server/actions/forks.test.ts
git commit -m "refactor(budget,wishlist,compare): one fork gate (resolvePlanParam) and the Plan reader

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 17: Calendar feed route, Share page and OG image

**Files:**
- Modify: `app/api/calendar/[token]/route.ts` and test: `readPlan(tripId, null, null)`; `stops = rows.stops.filter(s => s.arriveDate)`; `items = rows.items.filter(i => i.date)`; the token lookup stays (it is a CalendarFeed, not a ShareLink).
- Modify: `app/share/[token]/page.tsx:95-360` and test: keep the dial-gated reads (ADR 0051 floor: an off dial never runs the query) but (a) run the independent ones in one `Promise.all` (transports, accommodations, items, members, journal pairs), (b) use `maskPlanStops` / `mergePlanItems` from `@/lib/plan-reads` instead of local merges, (c) `findShareLink` is now cached so the OG image's second call is free.
- Modify: `app/share/[token]/journal-photo/**/route.ts`, `traveller-photo/**/route.ts`: use `findShareLink(token)` instead of their own `where: { token, trip: { deletedAt: null } }` lookups (check they need only fields `findShareLink` selects; if one needs more, widen `findShareLink`'s select).

- [ ] **Step 1: Tests first** (share test is 771 lines: rewrite only the mocks whose queries moved; keep rendering assertions).
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Verify and commit**

Run: `npx vitest run "app/api/calendar" "app/share" lib/share-lookup.test.ts && npx tsc --noEmit && npx eslint "app/api/calendar" "app/share" lib/share-lookup.ts`

```bash
git add -A "app/api/calendar" "app/share" lib/share-lookup.ts
git commit -m "refactor(share,feed): Calendar feed reads the Plan; Share runs one wave and shares the masking; token lookup in one cached place

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 18: Retire `surprise-readers.guard.test.ts`; nav counts read the header

**Files:**
- Delete: `lib/surprise-readers.guard.test.ts`
- Modify: `lib/nav-counts.ts` (its own `db.trip.findUnique` → `readTripShell`; already uses `loadFlagRows` since Task 10), test
- Modify: `components/shell/sidebar-nav-counts.tsx` only if its props change (they should not)
- Modify: `docs/adr/0072-*.md` — dated amendment: "2026-10-14: the per-file readers list is retired; `readPlan` takes the viewer as a required argument, so a reader cannot forget it."

- [ ] **Step 1: Delete the guard test; run the suite's lib folder** (`npx vitest run lib`) to confirm nothing imports it.
- [ ] **Step 2: `nav-counts.ts`:** `const shell = await readTripShell(tripId)`; date-less check from `shell`; wishlist count unchanged.
- [ ] **Step 3: ADR 0072 amendment, commit.**

```bash
git add -A lib docs/adr/0072-*.md
git commit -m "chore(surprise): retire the hand-listed readers guard — the viewer is a required argument of readPlan (ADR 0072 amendment)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 19: Delete dead code (card P, bug-marked and dead)

**Files:**
- Delete: `lib/reorder-transports.ts`, `lib/reorder-transports.test.ts`
- Modify: `components/trip/transport-form-dialog.tsx:253-310` (delete `AddTransportButton`, `EditTransportButton`), `components/trip/accommodation-form-dialog.tsx:142-…` (`EditAccommodationButton`), `components/trip/item-form-dialog.tsx:452-…` (`EditItemButton`) and the one test that renders `EditItemButton` (delete that test; it tests dead code)
- Modify: `components/trip/itinerary-manager.tsx:250` (delete `homeCountryCode` prop)

- [ ] **Step 1:** Delete; run `npx vitest related --run components/trip/transport-form-dialog.tsx components/trip/accommodation-form-dialog.tsx components/trip/item-form-dialog.tsx components/trip/itinerary-manager.tsx && npx tsc --noEmit && npm run knip`.
- [ ] **Step 2: Commit.**

```bash
git add -A lib components
git commit -m "chore: delete dead code — reorder-transports, four unused trigger buttons, the unread homeCountryCode prop

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 20: Docs — close the findings this batch fixed

**Files:**
- Modify: `docs/architecture-sitrep-2026-09-22.md` — add a dated **CLOSED (2026-10-14, chore/tidy-up-1-foundations)** line under ARCH-TEN-5, ARCH-TEN-9, ARCH-TEN-10, ARCH-TEN-11 naming the commit and the test that pins each.
- Modify: `docs/open-follow-ups.md` — under `LA-215`: "Fixed in batch 1 (TB-02); closes when deployed." Under the booking-import follow-ups file `docs/follow-ups/2026-10-14-booking-import.md`: mark BI-12 fixed with the commit.
- Modify: `docs/specs/2026-10-14-tidy-up-pass.md` — Batch 1 section: tick each item with its commit.
- Modify: `CONTEXT.md` only if a term changed (none expected; **Plan** already covers the reader).

- [ ] **Step 1: Edit, commit.**

```bash
git add docs
git commit -m "docs: batch 1 closes ARCH-TEN-5/9/10/11, LA-215, BI-12; spec ticked

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 21: Branch gate

- [ ] **Step 1:** `docker compose up -d` (if not running) and `npx prisma migrate deploy` against the local DB per `docs/DEPLOY.md`'s local section.
- [ ] **Step 2:** `npm test` — expected: all green. Paste the summary line into the report.
- [ ] **Step 3:** `npm run build` — expected: success, no type errors, no "uncached data" errors.
- [ ] **Step 4:** `npm run test:integration` — expected: green including `test/integration/plan-reads.test.ts`.
- [ ] **Step 5:** `npm run knip` — expected: no output. `npx eslint .` — expected: clean.
- [ ] **Step 6:** `grep -rn '_form\|success: false, error\|ok: false' server/actions --include='*.ts' | grep -v test` — expected: nothing.
- [ ] **Step 7:** `git status` clean; `git log --oneline main..HEAD` lists every task commit. Report the gate results verbatim; do not merge.

---

## Self-review notes

- **Spec coverage.** 1.J → Task 1; 1.B → Task 10; 1.A → Tasks 12–18; 1.C → Tasks 2–6; 1.D → Tasks 7–9; 1.F → Task 11; 1.P-bugs → Tasks 6 (TB-06) and 19. TB-01/02 → Task 10; TB-03/06 → Task 6; TB-04 → Task 7; TB-05 → Task 11. TB-07 is batch 2 (card G), not this plan. ARCH-TEN-9/10/11 → Task 6. NAV-03's data half → Task 12/18 (header read shared). PX-02b → Task 12's integration test. Docs → Task 20.
- **Type consistency.** `requireRowAccess` returns `{ row, user, membership, surpriseOf }` in Tasks 3–6; `requirePlanAccess` returns `{ user, membership, plan }` in Tasks 2 and 6; `readPlan(tripId, viewer, plan)` and `PlanRows` fields are the same in Tasks 12–18; `fail(errors, extra?)`, `formFail(message, code?)`, `firstErrorMessage(x, fallback)`, `formError(x)` are the same in Tasks 7–9.
- **Review Focus coverage.** 1 → Task 2 and Task 6 tests; 2 → Task 3 test; 3 → Task 12 test; 4 → Task 7 TB-04 test; 5 → Task 11 test.
- **Known judgement calls left to the implementer, each to be named in its commit:** builder column names versus `prisma/schema.prisma` (Task 1); whether `desktop-home-loader` adopts `loadFlagRows` or only `flagsFromRows` (Task 10); which query-shape assertions were deleted from each page test (Tasks 13–17); whether `TravellerAvatar` needs an id (Task 6f).
