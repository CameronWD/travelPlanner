# Fork Diff & Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the already-shipped Fork ("variant") feature in two ways — give the **Compare** view a real *route diff* (which Stops were added / dropped / re-nighted / reordered, plus Transport-mode changes) instead of two lists side by side, and add the missing **management** affordances (a proper "not live" banner, name-on-create, duplicate-a-variant, reorder, and a switcher that routes you to where a variant is editable).

**Architecture:** Purely additive on top of the shipped machinery (ADR 0019/0020). The diff is a new **pure function** `diffRoute()` in `lib/compare.ts` computed client-side in `compare-table.tsx` exactly like the existing `diffMetrics()`. Management is one small server action (`moveFork`) plus UI on components that already exist (`fork-switcher.tsx`, `compare-table.tsx`, the Plan/Wishlist pages). **Zero schema change** — `sortOrder` and `createFork`'s `sourceForkId` already exist.

**Tech Stack:** Next.js 16 (App Router, RSC) · React 19 · Tailwind v4 · Radix UI · lucide-react · Prisma 7 + Postgres · Vitest + Testing Library (jsdom). Server actions in `server/actions/*`, pure logic in `lib/*`.

## Global Constraints

These apply to **every** task.

- **User-facing copy says "variant"; code/domain term stays `Fork`.** (CONTEXT.md: the canonical noun is Fork; "variant" is the friendly UI label.) Never surface the word "fork" in UI copy.
- **Diff scope is Route (Stops) + Transport-mode only.** Accommodation, per-day Items and individual Costs stay represented by the existing aggregate rows (Budget total, Flag counts). Do NOT add line-item diffs for them.
- **Stop matching is by name + country, case-insensitive** (`name.trim().toLowerCase()` + `"|"` + `(country ?? "").trim().toLowerCase()`). Transport legs match by their (from-stop-name, to-stop-name) pair, lowercased. Renaming a stop inside a variant legitimately reads as "dropped + added" — that is accepted, not a bug.
- **The real plan is the diff baseline** — leftmost column, always plain (no diff annotations), and **never reorderable**. Every fork column is diffed against `plans[0]`.
- **Discreet mode hides ALL fork UI** — the switcher (already gated in `layout.tsx:79`), the whole Compare view (already gated in `compare-table.tsx:192`), and the new "not live" banner. Any new banner must not render when `discreet` is true.
- **Forking is pre-departure only** (phases `sketching`/`planning`/`final-prep`) — existing gates in `layout.tsx` and `createFork` stand; do not add new gates, do not weaken them.
- **Forks stay silent in the Activity feed except created / promoted / discarded.** `moveFork` (reorder) is cosmetic and must **NOT** call `recordActivity`.
- **TDD.** Write the failing test first for every behavioural change. Pure functions and server actions get unit tests; components get structural render tests. jsdom cannot measure layout — assert on classes/markup/text, never pixels.
- **After every task:** `npm test` and `npm run build` must both exit 0 with no regressions. Commit at the end of each task with the given message and the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- **Server-action convention (verbatim):** `"use server"` → `requireForkAccess`/`requireTripAccess` (from `@/lib/guards`) → `zod.safeParse` (where there's input to validate) → Prisma mutation → optional `recordActivity` → `revalidatePath(...)`.
- **Branch:** work stays on `feat/fork-diff-and-management`. Do NOT touch `main`, switch branches, push, or deploy.

---

## File Structure

**New files**
- `components/trip/variant-banner.tsx` — the "editing a variant — not live" banner (client component). (Task 6)
- `components/trip/variant-banner.test.tsx` — its render test. (Task 6)

**Modified files**
- `lib/compare.ts` — add `legs` to `PlanMetrics`; add pure `diffRoute()` + `RouteDiff` types. (Tasks 1, 2)
- `lib/compare.test.ts` — tests for `legs` and `diffRoute`. (Tasks 1, 2)
- `server/actions/forks.ts` — add `moveFork()`. (Task 4)
- `server/actions/forks.test.ts` — `moveFork` tests; add `legs: []` to the metrics stub; add `update` to the tx `fork` stub. (Tasks 1, 4)
- `components/trip/compare-table.tsx` — render the route diff in fork columns; add reorder arrows to fork column headers. (Tasks 3, 5)
- `components/trip/compare-table.test.tsx` — diff + reorder render assertions; add `legs` to fixtures. (Tasks 3, 5)
- `components/trip/fork-switcher.tsx` — name-on-create dialog, duplicate action, variant selection routes to `/plan?plan=`. (Task 7)
- `components/trip/fork-switcher.test.tsx` — updated behaviour assertions. (Task 7)
- `app/(app)/trips/[tripId]/plan/page.tsx` — replace the inline banner (lines 240-244) with `<VariantBanner>`; fetch the fork name. (Task 6)
- `app/(app)/trips/[tripId]/wishlist/page.tsx` — add `<VariantBanner>` (discreet-gated); fetch the fork name + discreet state. (Task 6)
- `CONTEXT.md` — sharpen the **Compare** glossary entry. (Task 8)

---

## PHASE A — Compare route diff

### Task 1: Add per-hop transport `legs` to `PlanMetrics`

The diff needs each plan's transport hops as (from-stop-name → to-stop-name, mode) so mode changes are diffable. `computePlanMetrics` already builds `stopById`; we add a `legs` array to its output.

**Files:**
- Modify: `lib/compare.ts` (`PlanMetrics` interface ~line 99; `computePlanMetrics` return ~line 389)
- Modify: `lib/compare.test.ts` (add a test)
- Modify: `server/actions/forks.test.ts` (metrics stub ~lines 99-111 — add `legs: []`)

**Interfaces:**
- Produces: `PlanMetrics.legs: { fromName: string; toName: string; mode: string }[]` — one entry per transport whose `fromStopId` and `toStopId` both resolve to a stop in this plan, in the transports' array order.

- [ ] **Step 1: Write the failing test** — append to `lib/compare.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computePlanMetrics } from "./compare";

describe("computePlanMetrics — legs", () => {
  it("emits one leg per transport whose endpoints both resolve, with resolved stop names", () => {
    const metrics = computePlanMetrics({
      stops: [
        { id: "s1", name: "Rome", country: "IT", nights: 3, sortOrder: 0, arriveDate: null, departDate: null, pinned: false, lat: null, lng: null, timezone: "UTC" },
        { id: "s2", name: "Florence", country: "IT", nights: 2, sortOrder: 1, arriveDate: null, departDate: null, pinned: false, lat: null, lng: null, timezone: "UTC" },
      ],
      transports: [
        { id: "t1", mode: "TRAIN", fromStopId: "s1", toStopId: "s2", depAt: null, arrAt: null },
        { id: "t2", mode: "FLIGHT", fromStopId: "s1", toStopId: "nope", depAt: null, arrAt: null },
      ],
      accommodations: [],
      items: [],
      costs: [],
      trip: { startDate: null, hardEndDate: null, homeCurrency: "AUD", drivingWindingFactor: 1.5, drivingAvgSpeedKph: 80 },
      exchangeRates: [],
    });
    expect(metrics.legs).toEqual([{ fromName: "Rome", toName: "Florence", mode: "TRAIN" }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/compare.test.ts`
Expected: FAIL — `metrics.legs` is `undefined`.

- [ ] **Step 3: Add `legs` to the `PlanMetrics` interface** in `lib/compare.ts` (inside `interface PlanMetrics`, after `route`):

```ts
  route: { name: string; country: string | null; nights: number | null }[];
  legs: { fromName: string; toName: string; mode: string }[];
```

- [ ] **Step 4: Build the legs array in `computePlanMetrics`.** The `stopById` map already exists (~line 368, above the driving loop). After that map is built, add:

```ts
  const legs: PlanMetrics["legs"] = [];
  for (const t of transports) {
    if (!t.fromStopId || !t.toStopId) continue;
    const from = stopById.get(t.fromStopId);
    const to = stopById.get(t.toStopId);
    if (!from || !to) continue;
    legs.push({ fromName: from.name, toName: to.name, mode: t.mode });
  }
```

Then add `legs,` to the returned object (~line 389, alongside `route`).

- [ ] **Step 5: Keep existing `PlanMetrics` fixtures/stubs green.** Add `legs: []` to the metrics stub in `server/actions/forks.test.ts` (the `computePlanMetricsMock` object, after `route: [],` ~line 110). Then grep for any other `PlanMetrics`-shaped literals and add `legs: []` where the compiler complains:

Run: `npx tsc --noEmit`
Expected: PASS (fix any "property 'legs' is missing" by adding `legs: []` to that fixture).

- [ ] **Step 6: Run tests to verify pass**

Run: `npm test -- lib/compare.test.ts server/actions/forks.test.ts`
Expected: PASS.

- [ ] **Step 7: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add lib/compare.ts lib/compare.test.ts server/actions/forks.test.ts
git commit -m "feat(fork): expose per-hop transport legs on PlanMetrics"
```

---

### Task 2: Pure `diffRoute()` — the route diff engine

The heart of the feature. A pure, fully-unit-tested function that turns two `PlanMetrics` into an ordered, annotated route diff + transport-mode changes + a one-line summary. Uses an LCS diff so dropped stops interleave at their real-plan positions and reorders are detected as "moved" (not drop+add).

**Files:**
- Modify: `lib/compare.ts` (append types + function)
- Modify: `lib/compare.test.ts` (append a `describe` block)

**Interfaces:**
- Consumes: `PlanMetrics` (with `route` and `legs` from Task 1).
- Produces:
  - `type RouteChangeKind = "same" | "added" | "dropped" | "renighted" | "moved"`
  - `interface RouteDiffStop { name: string; country: string | null; nights: number | null; baseNights: number | null; kind: RouteChangeKind }`
  - `interface LegModeChange { fromName: string; toName: string; fromMode: string; toMode: string }`
  - `interface RouteDiff { stops: RouteDiffStop[]; legChanges: LegModeChange[]; summary: string }`
  - `function diffRoute(base: PlanMetrics, variant: PlanMetrics): RouteDiff`

- [ ] **Step 1: Write the failing tests** — append to `lib/compare.test.ts`:

```ts
import { diffRoute, type PlanMetrics } from "./compare";

// Minimal PlanMetrics builder — only route + legs matter to diffRoute.
function pm(
  route: PlanMetrics["route"],
  legs: PlanMetrics["legs"] = [],
): PlanMetrics {
  return {
    stopCount: route.length, nightTotal: 0, countries: [], projectedEnd: null,
    hardEndState: "none", budgetHomeMinor: null, flagCounts: { warning: 0, info: 0 },
    transitMinutes: 0, drivingMinutes: 0, flightCount: 0, route, legs,
  };
}
const R = (name: string, nights: number | null, country: string | null = "IT") => ({ name, country, nights });

describe("diffRoute", () => {
  it("reports an identical route as 'Same route' with all stops 'same'", () => {
    const base = pm([R("Rome", 3), R("Florence", 2)]);
    const d = diffRoute(base, pm([R("Rome", 3), R("Florence", 2)]));
    expect(d.summary).toBe("Same route");
    expect(d.stops.map((s) => s.kind)).toEqual(["same", "same"]);
  });

  it("marks an added stop and lists it in the summary", () => {
    const base = pm([R("Rome", 3), R("Florence", 2)]);
    const d = diffRoute(base, pm([R("Rome", 3), R("Lucerne", 3, "CH"), R("Florence", 2)]));
    const lucerne = d.stops.find((s) => s.name === "Lucerne");
    expect(lucerne?.kind).toBe("added");
    // interleaved at its variant position (between Rome and Florence)
    expect(d.stops.map((s) => s.name)).toEqual(["Rome", "Lucerne", "Florence"]);
    expect(d.summary).toBe("+Lucerne");
  });

  it("marks a dropped stop as a ghost at its real-plan position", () => {
    const base = pm([R("Rome", 3), R("Venice", 3), R("Florence", 2)]);
    const d = diffRoute(base, pm([R("Rome", 3), R("Florence", 2)]));
    const venice = d.stops.find((s) => s.name === "Venice");
    expect(venice?.kind).toBe("dropped");
    expect(d.stops.map((s) => s.name)).toEqual(["Rome", "Venice", "Florence"]);
    expect(d.summary).toBe("-Venice");
  });

  it("marks a re-nighted stop with base + new nights", () => {
    const base = pm([R("Rome", 4)]);
    const d = diffRoute(base, pm([R("Rome", 2)]));
    expect(d.stops[0]).toMatchObject({ name: "Rome", kind: "renighted", nights: 2, baseNights: 4 });
    expect(d.summary).toBe("Rome 4→2n");
  });

  it("detects a reordered common stop as 'moved', not drop+add", () => {
    const base = pm([R("A", 1), R("B", 1), R("C", 1)]);
    const d = diffRoute(base, pm([R("A", 1), R("C", 1), R("B", 1)]));
    const kinds = new Set(d.stops.map((s) => s.kind));
    expect(kinds.has("moved")).toBe(true);
    expect(kinds.has("dropped")).toBe(false);
    expect(kinds.has("added")).toBe(false);
    expect(d.summary).toBe("Reordered");
  });

  it("matches stops case-insensitively by name+country", () => {
    const base = pm([R("Rome", 3)]);
    const d = diffRoute(base, pm([R("rome", 3)]));
    expect(d.stops[0].kind).toBe("same");
  });

  it("reports a transport-mode change between two common stops", () => {
    const base = pm([R("Rome", 3), R("Florence", 2)], [{ fromName: "Rome", toName: "Florence", mode: "TRAIN" }]);
    const variant = pm([R("Rome", 3), R("Florence", 2)], [{ fromName: "Rome", toName: "Florence", mode: "FLIGHT" }]);
    const d = diffRoute(base, variant);
    expect(d.legChanges).toEqual([{ fromName: "Rome", toName: "Florence", fromMode: "TRAIN", toMode: "FLIGHT" }]);
    expect(d.summary).toBe("Transport changed");
  });

  it("combines added + dropped + renighted in the summary, in that order", () => {
    const base = pm([R("Rome", 4), R("Venice", 3)]);
    const variant = pm([R("Rome", 2), R("Lucerne", 3, "CH")]);
    const d = diffRoute(base, variant);
    expect(d.summary).toBe("+Lucerne · -Venice · Rome 4→2n");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/compare.test.ts`
Expected: FAIL — `diffRoute` is not exported.

- [ ] **Step 3: Implement `diffRoute` + types** — append to `lib/compare.ts`:

```ts
// ---------------------------------------------------------------------------
// diffRoute — structural route diff (variant vs base/real plan)
// ---------------------------------------------------------------------------

export type RouteChangeKind = "same" | "added" | "dropped" | "renighted" | "moved";

export interface RouteDiffStop {
  name: string;
  country: string | null;
  /** Variant's nights (for a dropped stop, the real plan's nights). */
  nights: number | null;
  /** Real plan's nights — set for "renighted" and "moved"; null otherwise. */
  baseNights: number | null;
  kind: RouteChangeKind;
}

export interface LegModeChange {
  fromName: string;
  toName: string;
  fromMode: string;
  toMode: string;
}

export interface RouteDiff {
  /** Variant route in order, with dropped stops interleaved at their base position. */
  stops: RouteDiffStop[];
  legChanges: LegModeChange[];
  summary: string;
}

type RouteStop = PlanMetrics["route"][number];

function routeKey(name: string, country: string | null): string {
  return `${name.trim().toLowerCase()}|${(country ?? "").trim().toLowerCase()}`;
}

function legKey(fromName: string, toName: string): string {
  return `${fromName.trim().toLowerCase()}→${toName.trim().toLowerCase()}`;
}

/** Ordered LCS-diff ops over two key arrays. */
function diffOps(a: string[], b: string[]): Array<{ op: "eq" | "del" | "ins"; ai: number; bi: number }> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: Array<{ op: "eq" | "del" | "ins"; ai: number; bi: number }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ op: "eq", ai: i, bi: j }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ op: "del", ai: i, bi: -1 }); i++; }
    else { ops.push({ op: "ins", ai: -1, bi: j }); j++; }
  }
  while (i < n) { ops.push({ op: "del", ai: i, bi: -1 }); i++; }
  while (j < m) { ops.push({ op: "ins", ai: -1, bi: j }); j++; }
  return ops;
}

export function diffRoute(base: PlanMetrics, variant: PlanMetrics): RouteDiff {
  const baseRoute: RouteStop[] = base.route;
  const variantRoute: RouteStop[] = variant.route;
  const baseKeys = baseRoute.map((s) => routeKey(s.name, s.country));
  const variantKeys = variantRoute.map((s) => routeKey(s.name, s.country));
  const baseSet = new Set(baseKeys);
  const variantSet = new Set(variantKeys);

  const baseNightsByKey = new Map<string, number | null>();
  baseRoute.forEach((s, i) => {
    if (!baseNightsByKey.has(baseKeys[i])) baseNightsByKey.set(baseKeys[i], s.nights);
  });

  const stops: RouteDiffStop[] = [];
  for (const o of diffOps(baseKeys, variantKeys)) {
    if (o.op === "eq") {
      const bs = baseRoute[o.ai];
      const vs = variantRoute[o.bi];
      if (vs.nights !== bs.nights) {
        stops.push({ name: vs.name, country: vs.country, nights: vs.nights, baseNights: bs.nights, kind: "renighted" });
      } else {
        stops.push({ name: vs.name, country: vs.country, nights: vs.nights, baseNights: null, kind: "same" });
      }
    } else if (o.op === "del") {
      // A base stop whose key still exists in the variant is a moved partner — it
      // is rendered once at its variant (ins) position; skip it here.
      if (variantSet.has(baseKeys[o.ai])) continue;
      const bs = baseRoute[o.ai];
      stops.push({ name: bs.name, country: bs.country, nights: bs.nights, baseNights: null, kind: "dropped" });
    } else {
      const vs = variantRoute[o.bi];
      const key = variantKeys[o.bi];
      if (baseSet.has(key)) {
        stops.push({ name: vs.name, country: vs.country, nights: vs.nights, baseNights: baseNightsByKey.get(key) ?? null, kind: "moved" });
      } else {
        stops.push({ name: vs.name, country: vs.country, nights: vs.nights, baseNights: null, kind: "added" });
      }
    }
  }

  // Transport-mode changes: legs present in both, differing mode.
  const baseLegMode = new Map<string, string>();
  for (const l of base.legs) baseLegMode.set(legKey(l.fromName, l.toName), l.mode);
  const legChanges: LegModeChange[] = [];
  for (const l of variant.legs) {
    const prev = baseLegMode.get(legKey(l.fromName, l.toName));
    if (prev !== undefined && prev !== l.mode) {
      legChanges.push({ fromName: l.fromName, toName: l.toName, fromMode: prev, toMode: l.mode });
    }
  }

  // Summary
  const added = stops.filter((s) => s.kind === "added").map((s) => `+${s.name}`);
  const dropped = stops.filter((s) => s.kind === "dropped").map((s) => `-${s.name}`);
  const renighted = stops
    .filter((s) => s.kind === "renighted")
    .map((s) => `${s.name} ${s.baseNights ?? "?"}→${s.nights ?? "?"}n`);
  const parts = [...added, ...dropped, ...renighted];
  const moved = stops.some((s) => s.kind === "moved");

  let summary: string;
  if (parts.length > 0) summary = parts.join(" · ");
  else if (moved && legChanges.length > 0) summary = "Reordered · transport changed";
  else if (moved) summary = "Reordered";
  else if (legChanges.length > 0) summary = "Transport changed";
  else summary = "Same route";

  return { stops, legChanges, summary };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- lib/compare.test.ts`
Expected: PASS (all `diffRoute` tests + the Task 1 legs test).

- [ ] **Step 5: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add lib/compare.ts lib/compare.test.ts
git commit -m "feat(fork): pure diffRoute engine (added/dropped/re-nighted/moved + transport-mode changes)"
```

---

### Task 3: Render the route diff in the Compare table

Replace the fork columns' plain route list with the diff. The **real-plan column keeps the existing `RouteCell`** (plain baseline); each **fork column** renders a new `RouteDiffCell` (summary line + annotated, interleaved stops + leg-change lines). Applies to both the desktop table and the mobile stacked card.

**Files:**
- Modify: `components/trip/compare-table.tsx`
- Modify: `components/trip/compare-table.test.tsx`

**Interfaces:**
- Consumes: `diffRoute`, `RouteDiff` from `@/lib/compare`.

- [ ] **Step 1: Write the failing test** — add to `components/trip/compare-table.test.tsx`. First ensure the existing `ComparisonPlan` fixtures include `legs: []` in their `metrics` (add it wherever a `metrics` object is built, or the file will fail to typecheck after Task 1). Then add:

```ts
it("shows the route diff in a fork column: added, dropped, re-nighted and a summary", () => {
  const real = {
    forkId: null,
    name: "Real plan",
    metrics: makeMetrics({ route: [R("Rome", 4), R("Venice", 3)], legs: [] }),
  };
  const fork = {
    forkId: "fork-1",
    name: "Variant B",
    metrics: makeMetrics({ route: [R("Rome", 2), R("Lucerne", 3, "CH")], legs: [] }),
  };
  render(<CompareTable trip={{ id: "trip-1", name: "Trip", homeCurrency: "AUD" }} plans={[real, fork]} />);

  // Summary line for the fork
  expect(screen.getAllByText("+Lucerne · -Venice · Rome 4→2n").length).toBeGreaterThan(0);
  // Added / dropped / re-nighted markers appear
  expect(screen.getAllByText(/Lucerne/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Venice/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/4→2n|4→2/).length).toBeGreaterThan(0);
});
```

Add the fixture helpers near the top of the test file if not present:

```ts
const R = (name: string, nights: number | null, country: string | null = "IT") => ({ name, country, nights });
function makeMetrics(over: Partial<import("@/lib/compare").PlanMetrics>): import("@/lib/compare").PlanMetrics {
  return {
    stopCount: 0, nightTotal: 0, countries: [], projectedEnd: null, hardEndState: "none",
    budgetHomeMinor: null, flagCounts: { warning: 0, info: 0 }, transitMinutes: 0,
    drivingMinutes: 0, flightCount: 0, route: [], legs: [], ...over,
  };
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/trip/compare-table.test.tsx`
Expected: FAIL — the diff summary text is not rendered (route currently shows plain `RouteCell`).

- [ ] **Step 3: Add the `RouteDiffCell` component** to `components/trip/compare-table.tsx`. Import `diffRoute` and its types at the top:

```tsx
import { diffMetrics, diffRoute, type RouteDiffStop } from "@/lib/compare";
```

Add the component (near `RouteCell`, ~line 158):

```tsx
function nightsLabel(n: number | null): string | null {
  return n !== null && n > 0 ? `${n}n` : null;
}

function DiffStopRow({ stop }: { stop: RouteDiffStop }) {
  const base = "flex items-baseline gap-1 min-w-0 text-sm";
  if (stop.kind === "dropped") {
    return (
      <div className={base}>
        <span className="truncate min-w-0 text-muted-foreground line-through">{stop.name}</span>
        {nightsLabel(stop.nights) && (
          <span className="ml-auto text-xs text-muted-foreground line-through font-mono">{nightsLabel(stop.nights)}</span>
        )}
      </div>
    );
  }
  const tone =
    stop.kind === "added"
      ? "text-emerald-700 dark:text-emerald-400"
      : stop.kind === "renighted"
        ? "text-amber-700 dark:text-amber-400"
        : "text-foreground";
  return (
    <div className={base}>
      {stop.kind === "added" && <span className="shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true">+</span>}
      {stop.kind === "moved" && <span className="shrink-0 text-muted-foreground" aria-hidden="true">↕</span>}
      <span className={`truncate min-w-0 font-medium ${tone}`}>{stop.name}</span>
      {stop.country && <span className="text-xs text-muted-foreground">{stop.country}</span>}
      {stop.kind === "renighted" ? (
        <span className="ml-auto text-xs text-amber-700 dark:text-amber-400 font-mono">{stop.baseNights ?? "?"}→{stop.nights ?? "?"}n</span>
      ) : (
        nightsLabel(stop.nights) && <span className="ml-auto text-xs text-muted-foreground font-mono">{nightsLabel(stop.nights)}</span>
      )}
    </div>
  );
}

function RouteDiffCell({ base, plan }: { base: ComparisonPlan; plan: ComparisonPlan }) {
  const diff = diffRoute(base.metrics, plan.metrics);
  return (
    <div className="flex flex-col gap-1 min-w-[180px]">
      <p className="text-xs font-medium text-muted-foreground">{diff.summary}</p>
      {diff.stops.map((s, i) => (
        <DiffStopRow key={i} stop={s} />
      ))}
      {diff.legChanges.map((l, i) => (
        <p key={`leg-${i}`} className="text-xs text-amber-700 dark:text-amber-400 truncate">
          {l.fromName}→{l.toName}: {l.fromMode.toLowerCase()} → {l.toMode.toLowerCase()}
        </p>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Use `RouteDiffCell` for fork columns in the "route" row.** In `renderCell` (~line 232) the `case "route"` currently returns `<RouteCell plan={plan} />` for every plan. Change it so the real plan stays plain and forks get the diff. Replace the `case "route":` body with:

```tsx
      case "route":
        return plan.forkId === null
          ? <RouteCell plan={plan} />
          : <RouteDiffCell base={realPlan} plan={plan} />;
```

(`realPlan` is already in scope — it's `plans[0]`, defined ~line 202. `renderCell` is a closure inside the component, so it can see it.)

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- components/trip/compare-table.test.tsx`
Expected: PASS. Then `npx tsc --noEmit` → PASS.

- [ ] **Step 6: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add components/trip/compare-table.tsx components/trip/compare-table.test.tsx
git commit -m "feat(fork): show a real route diff in Compare fork columns"
```

---

## PHASE B — Fork management

### Task 4: `moveFork` server action (reorder)

Swaps a fork's `sortOrder` with its neighbour. Cosmetic (drives Compare column + switcher order only), so — unlike stop reorder (ADR 0007) — it needs no `FOR UPDATE` lock and records **no** Activity (forks stay silent except created/promoted/discarded).

**Files:**
- Modify: `server/actions/forks.ts`
- Modify: `server/actions/forks.test.ts`

**Interfaces:**
- Produces: `moveFork(forkId: string, direction: "left" | "right"): Promise<ForkMutationResult>` (`ForkMutationResult` is the existing `{ success: true } | { success: false; error: string }` used by rename/discard). `"left"` = earlier (lower `sortOrder`), `"right"` = later.
- Consumes: `requireForkAccess` (existing).

- [ ] **Step 1: Prepare the test harness.** In `server/actions/forks.test.ts`, add `update: forkUpdateMock` to the transaction stub's `fork` object (~line 129) so `tx.fork.update` works inside a `$transaction` callback:

```ts
      fork: { create: forkCreateMock, update: forkUpdateMock, deleteMany: forkDeleteManyMock },
```

- [ ] **Step 2: Write the failing tests** — add a `describe("moveFork", ...)` block:

```ts
describe("moveFork", () => {
  beforeEach(() => {
    requireForkAccessMock.mockResolvedValue({
      user: { id: "user-1" },
      fork: { id: "fork-b", tripId: "trip-1", name: "Variant B" },
      trip: { id: "trip-1", startDate: null, endDate: null },
    });
    forkFindManyMock.mockResolvedValue([
      { id: "fork-a", sortOrder: 0 },
      { id: "fork-b", sortOrder: 1 },
      { id: "fork-c", sortOrder: 2 },
    ]);
  });

  it("swaps sortOrder with the left neighbour and records no activity", async () => {
    const { moveFork } = await import("./forks");
    const res = await moveFork("fork-b", "left");
    expect(res).toEqual({ success: true });
    expect(forkUpdateMock).toHaveBeenCalledWith({ where: { id: "fork-b" }, data: { sortOrder: 0 } });
    expect(forkUpdateMock).toHaveBeenCalledWith({ where: { id: "fork-a" }, data: { sortOrder: 1 } });
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("is a no-op at the left edge", async () => {
    const { moveFork } = await import("./forks");
    requireForkAccessMock.mockResolvedValue({
      user: { id: "user-1" }, fork: { id: "fork-a", tripId: "trip-1", name: "Variant A" },
      trip: { id: "trip-1", startDate: null, endDate: null },
    });
    const res = await moveFork("fork-a", "left");
    expect(res).toEqual({ success: true });
    expect(forkUpdateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- server/actions/forks.test.ts`
Expected: FAIL — `moveFork` not exported.

- [ ] **Step 4: Implement `moveFork`** in `server/actions/forks.ts` (after `discardFork`, ~line 318):

```ts
// ---------------------------------------------------------------------------
// moveFork
// ---------------------------------------------------------------------------

/**
 * Reorder a fork by swapping its sortOrder with the adjacent fork.
 * Cosmetic only (drives Compare column + switcher order) — no FOR UPDATE lock
 * (a transposed cosmetic order self-heals on the next move) and no Activity log
 * (forks stay silent except created/promoted/discarded).
 */
export async function moveFork(
  forkId: string,
  direction: "left" | "right",
): Promise<ForkMutationResult> {
  const { fork } = await requireForkAccess(forkId);
  const tripId = fork.tripId;

  const forks = await db.fork.findMany({
    where: { tripId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });

  const idx = forks.findIndex((f) => f.id === forkId);
  if (idx === -1) return { success: true }; // vanished mid-flight — nothing to do
  const swapIdx = direction === "left" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= forks.length) return { success: true }; // at the edge — no-op

  const current = forks[idx];
  const neighbour = forks[swapIdx];

  await db.$transaction(async (tx) => {
    await tx.fork.update({ where: { id: current.id }, data: { sortOrder: neighbour.sortOrder } });
    await tx.fork.update({ where: { id: neighbour.id }, data: { sortOrder: current.sortOrder } });
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/compare`);
  return { success: true };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- server/actions/forks.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add server/actions/forks.ts server/actions/forks.test.ts
git commit -m "feat(fork): moveFork reorder action (cosmetic, silent)"
```

---

### Task 5: Reorder arrows on Compare column headers

Add `←/→` buttons to each fork column header (desktop `<th>` and mobile card header) that call `moveFork` and refresh. First fork's `←` and last fork's `→` are disabled. The real-plan column never gets arrows.

**Files:**
- Modify: `components/trip/compare-table.tsx`
- Modify: `components/trip/compare-table.test.tsx`

**Interfaces:**
- Consumes: `moveFork` from `@/server/actions/forks`.

- [ ] **Step 1: Write the failing test** — add to `components/trip/compare-table.test.tsx`:

```ts
it("renders reorder arrows on fork columns, disabled at the ends", () => {
  const real = { forkId: null, name: "Real plan", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
  const b = { forkId: "fork-b", name: "Variant B", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
  const c = { forkId: "fork-c", name: "Variant C", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
  render(<CompareTable trip={{ id: "trip-1", name: "Trip", homeCurrency: "AUD" }} plans={[real, b, c]} />);

  // Two "move left" controls (one per fork); the first fork's is disabled.
  const moveLeft = screen.getAllByRole("button", { name: /move .* left/i });
  expect(moveLeft).toHaveLength(2);
  expect(moveLeft[0]).toBeDisabled();
  const moveRight = screen.getAllByRole("button", { name: /move .* right/i });
  expect(moveRight[moveRight.length - 1]).toBeDisabled();
});
```

You'll also need `moveFork` mocked. Add near the top of the file, alongside any existing `vi.mock` (the file already mocks `PromoteForkDialog`/actions — follow that pattern):

```ts
vi.mock("@/server/actions/forks", async (orig) => ({
  ...(await orig<typeof import("@/server/actions/forks")>()),
  moveFork: vi.fn().mockResolvedValue({ success: true }),
}));
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/trip/compare-table.test.tsx`
Expected: FAIL — no move buttons.

- [ ] **Step 3: Implement the arrows.** In `components/trip/compare-table.tsx`:

Add imports:
```tsx
import { GitMerge, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { moveFork } from "@/server/actions/forks";
```

Inside `CompareTable`, add a router + handler (near the `promoteOpenFor` state, ~line 185):
```tsx
  const router = useRouter();
  const [reorderPending, startReorder] = React.useTransition();

  function handleMove(forkId: string, direction: "left" | "right") {
    startReorder(async () => {
      await moveFork(forkId, direction);
      router.refresh();
    });
  }
```

Add a small reusable control (module scope, near `DeltaBadge`):
```tsx
function ReorderArrows({
  planName, isFirst, isLast, onMove, pending,
}: { planName: string; isFirst: boolean; isLast: boolean; onMove: (d: "left" | "right") => void; pending: boolean }) {
  return (
    <span className="flex items-center gap-0.5">
      <button
        type="button" aria-label={`Move ${planName} left`} disabled={isFirst || pending}
        onClick={() => onMove("left")}
        className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button" aria-label={`Move ${planName} right`} disabled={isLast || pending}
        onClick={() => onMove("right")}
        className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}
```

In the **desktop** fork column header (`forkPlans.map(...)` inside `<thead>`, ~line 394), add the arrows next to the plan name. Change the inner `<div className="flex flex-col gap-2 min-w-0">` so the name row includes arrows:
```tsx
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex items-center justify-between gap-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground truncate">{plan.name}</span>
                      <ReorderArrows
                        planName={plan.name}
                        isFirst={forkIndex === 0}
                        isLast={forkIndex === forkPlans.length - 1}
                        onMove={(d) => handleMove(plan.forkId!, d)}
                        pending={reorderPending}
                      />
                    </div>
                    <Button size="sm" variant="outline" className="w-fit text-xs" onClick={() => setPromoteOpenFor(plan.forkId)} aria-label={`Promote ${plan.name}`}>
                      <GitMerge className="size-3.5 mr-1" aria-hidden="true" />
                      Promote
                    </Button>
                  </div>
```
Change the map to expose the index: `{forkPlans.map((plan, forkIndex) => (`.

In the **mobile** card header (`plans.map(...)`, ~line 341), for non-real cards add the arrows next to the Promote button. Compute the fork index (`planIndex - 1`) and add, before/after the Promote `<Button>`:
```tsx
                {!isReal && (
                  <ReorderArrows
                    planName={plan.name}
                    isFirst={planIndex - 1 === 0}
                    isLast={planIndex === plans.length - 1}
                    onMove={(d) => handleMove(plan.forkId!, d)}
                    pending={reorderPending}
                  />
                )}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- components/trip/compare-table.test.tsx`
Expected: PASS. Then `npx tsc --noEmit` → PASS.

- [ ] **Step 5: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add components/trip/compare-table.tsx components/trip/compare-table.test.tsx
git commit -m "feat(fork): reorder variants from Compare column headers"
```

---

### Task 6: `VariantBanner` — "not live" banner on Plan + Wishlist

Extract and upgrade the bare inline banner already on the Plan page into a reusable client component with the variant name + "Switch to real plan" and "Compare" actions, and add it to the Wishlist page (discreet-gated). The Plan page's discreet branch early-returns before the banner, so the Plan banner is already discreet-safe; the Wishlist page must gate explicitly.

**Files:**
- Create: `components/trip/variant-banner.tsx`, `components/trip/variant-banner.test.tsx`
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` (lines 42-46 fetch; lines 240-244 banner)
- Modify: `app/(app)/trips/[tripId]/wishlist/page.tsx` (lines 23-28 fetch; add banner)

**Interfaces:**
- Produces: `VariantBanner({ tripId, variantName }: { tripId: string; variantName: string })`.

- [ ] **Step 1: Write the failing test** — `components/trip/variant-banner.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VariantBanner } from "./variant-banner";

vi.mock("next/navigation", () => ({
  usePathname: () => "/trips/trip-1/plan",
}));

describe("VariantBanner", () => {
  it("names the variant and links to the real plan and Compare", () => {
    render(<VariantBanner tripId="trip-1" variantName="Italy-first" />);
    expect(screen.getByText(/Italy-first/)).toBeInTheDocument();
    expect(screen.getByText(/not live/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /switch to real plan/i })).toHaveAttribute("href", "/trips/trip-1/plan");
    expect(screen.getByRole("link", { name: /compare/i })).toHaveAttribute("href", "/trips/trip-1/compare");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/trip/variant-banner.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `components/trip/variant-banner.tsx`:**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * "You're editing a variant — not live" banner. Shown on the Plan editor and
 * Wishlist (the only fork-aware screens) when a variant is active. Never render
 * in discreet mode — the caller gates that.
 */
export function VariantBanner({ tripId, variantName }: { tripId: string; variantName: string }) {
  const pathname = usePathname();
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <p className="min-w-0">
        <span className="font-medium">Editing variant &ldquo;{variantName}&rdquo;</span> — not live.
        Your calendar, summary and sharing still follow your real plan.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={pathname}>Switch to real plan</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={`/trips/${tripId}/compare`}>Compare</Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- components/trip/variant-banner.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire into the Plan page.** In `app/(app)/trips/[tripId]/plan/page.tsx`:
  - Import at top: `import { VariantBanner } from "@/components/trip/variant-banner";`
  - Change the fork-existence fetch (lines 43-46) to also select the name:
    ```tsx
    const activeFork = selectedForkId
      ? await db.fork.findFirst({ where: { id: selectedForkId, tripId }, select: { id: true, name: true } })
      : null;
    const activeForkId = activeFork ? activeFork.id : null;
    ```
    (Replace the existing `forkExists` lines; every later use of `activeForkId` still works.)
  - Replace the inline banner (lines 240-244) with:
    ```tsx
      {activeFork && <VariantBanner tripId={tripId} variantName={activeFork.name} />}
    ```
    (The discreet branch at lines 192-223 returns earlier, so this never renders in discreet mode.)

- [ ] **Step 6: Wire into the Wishlist page.** In `app/(app)/trips/[tripId]/wishlist/page.tsx`:
  - Imports: `import { VariantBanner } from "@/components/trip/variant-banner";` and `import { getDiscreetState } from "@/lib/discreet-server";`
  - Change the fork-existence fetch (lines 25-28) to select the name:
    ```tsx
    const activeFork = selectedForkId
      ? await db.fork.findFirst({ where: { id: selectedForkId, tripId }, select: { id: true, name: true } })
      : null;
    const activeForkId = activeFork ? activeFork.id : null;
    ```
  - Fetch discreet state (near the `requireTripAccess` call, ~line 21):
    ```tsx
    const { discreet } = await getDiscreetState();
    ```
  - Wrap the returned `<WishlistBoard .../>` (lines 220-235) so the banner sits above it when a variant is active and not discreet:
    ```tsx
    return (
      <div className="flex flex-col gap-6">
        {activeFork && !discreet && <VariantBanner tripId={trip.id} variantName={activeFork.name} />}
        <WishlistBoard
          /* ...existing props unchanged... */
        />
      </div>
    );
    ```

- [ ] **Step 7: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add components/trip/variant-banner.tsx components/trip/variant-banner.test.tsx "app/(app)/trips/[tripId]/plan/page.tsx" "app/(app)/trips/[tripId]/wishlist/page.tsx"
git commit -m "feat(fork): proper 'not live' variant banner on Plan + Wishlist"
```

---

### Task 7: Switcher — name-on-create, duplicate, and route-to-plan

Three switcher upgrades: (1) selecting a variant navigates to the Plan editor for it (`/plan?plan=<id>`) instead of appending the param to the current page; (2) "New variant" prompts for a name; (3) a per-variant "Duplicate" action.

**Files:**
- Modify: `components/trip/fork-switcher.tsx`
- Modify: `components/trip/fork-switcher.test.tsx`

**Interfaces:**
- Consumes: `createFork(tripId, name?, sourceForkId?)` (existing — already supports all three args).

- [ ] **Step 1: Write the failing tests** — add to `components/trip/fork-switcher.test.tsx` (mirror the existing mocks for `next/navigation` and `@/server/actions/forks`; ensure `createFork` is a `vi.fn().mockResolvedValue({ success: true, forkId: "new-fork" })`):

```ts
it("selecting a variant routes to the Plan editor for it", async () => {
  const push = vi.fn();
  // (wire push into the useRouter mock per the file's existing pattern)
  renderSwitcher({ forks: [{ id: "fork-b", name: "Variant B" }], phase: "planning" });
  await userEvent.click(screen.getByRole("button", { name: /open plan switcher/i }));
  await userEvent.click(screen.getByText("Variant B"));
  expect(push).toHaveBeenCalledWith("/trips/trip-1/plan?plan=fork-b");
});

it("New variant prompts for a name before creating", async () => {
  renderSwitcher({ forks: [], phase: "planning" });
  await userEvent.click(screen.getByRole("button", { name: /open plan switcher/i }));
  await userEvent.click(screen.getByText("New variant"));
  const input = await screen.findByLabelText(/variant name/i);
  await userEvent.clear(input);
  await userEvent.type(input, "Italy-first");
  await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
  expect(createFork).toHaveBeenCalledWith("trip-1", "Italy-first", undefined);
});

it("Duplicate creates a fork from the source variant", async () => {
  renderSwitcher({ forks: [{ id: "fork-b", name: "Variant B" }], phase: "planning" });
  await userEvent.click(screen.getByRole("button", { name: /open plan switcher/i }));
  await userEvent.click(screen.getByRole("button", { name: /duplicate variant b/i }));
  const input = await screen.findByLabelText(/variant name/i);
  expect(input).toHaveValue("Copy of Variant B");
  await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
  expect(createFork).toHaveBeenCalledWith("trip-1", "Copy of Variant B", "fork-b");
});
```

(Adapt `renderSwitcher`/router-mock wiring to the helpers already in the file. If the file lacks a `renderSwitcher` helper, render `<ForkSwitcher tripId="trip-1" forks={forks} phase={phase} />` directly and mock `useRouter`/`usePathname`/`useSearchParams` from `next/navigation` as the file already does.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/trip/fork-switcher.test.tsx`
Expected: FAIL — no name dialog / no duplicate button / wrong push target.

- [ ] **Step 3: Route variant selection to the Plan editor.** In `components/trip/fork-switcher.tsx`, change `navigateToPlan` (~line 220) so a non-null fork goes to the Plan editor:

```tsx
  function navigateToPlan(forkId: string | null) {
    if (forkId) {
      router.push(`/trips/${tripId}/plan?plan=${forkId}`);
      return;
    }
    // Real plan — clear the param on the current page.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("plan");
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }
```

- [ ] **Step 4: Add a create/duplicate name dialog.** Add a `CreateVariantDialog` (reuse the `RenameDialogForm` shape) and state. Add near the other dialog state (~line 209):

```tsx
  // { mode: "new" } → blank create; { mode: "duplicate", source } → duplicate an existing fork.
  const [createTarget, setCreateTarget] = React.useState<
    { mode: "new" } | { mode: "duplicate"; source: ForkItem } | null
  >(null);
```

Add the dialog component (module scope, after `RenameDialog`):

```tsx
function CreateVariantForm({
  tripId, defaultName, sourceForkId, onClose, onCreated,
}: {
  tripId: string; defaultName: string; sourceForkId?: string;
  onClose: () => void; onCreated: (forkId: string) => void;
}) {
  const [name, setName] = React.useState(defaultName);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createFork(tripId, name.trim() || undefined, sourceForkId);
      if (result.success) { onCreated(result.forkId); onClose(); }
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="py-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Variant name" aria-label="Variant name" disabled={isPending} />
        {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
      </div>
      <DialogFooter>
        <DialogClose asChild><Button variant="outline" type="button">Cancel</Button></DialogClose>
        <Button variant="primary" type="submit" disabled={isPending}>{isPending ? "Creating…" : "Create"}</Button>
      </DialogFooter>
    </form>
  );
}
```

Import `createFork` already exists at line 23; keep `renameFork, discardFork` — add nothing new to that import beyond what's there.

- [ ] **Step 5: Replace direct create + add Duplicate.** Change the "New variant" item (~line 334) so it opens the dialog instead of calling `handleCreateFork` directly:

```tsx
          <DropdownMenuItem
            disabled={atCap}
            onSelect={atCap ? undefined : () => setCreateTarget({ mode: "new" })}
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            {atCap ? <span className="text-muted-foreground">Discard a variant first</span> : <span>New variant</span>}
          </DropdownMenuItem>
```

Add a Duplicate button into each fork's action cluster (the `<span className="ml-auto flex items-center gap-0.5">` at ~line 300), between rename and discard, and import `Copy` from lucide-react (add to the line-5 import):

```tsx
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-30"
                  aria-label={`Duplicate ${fork.name}`}
                  disabled={atCap}
                  onClick={(e) => { e.stopPropagation(); if (!atCap) setCreateTarget({ mode: "duplicate", source: fork }); }}
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                </button>
```

Delete the now-unused `handleCreateFork`/`createPending` (or keep `createPending` only if still referenced — it is not, after this change; remove it and the `disabled={createPending}` on the trigger button at line 264).

Render the dialog near the other dialogs (~line 358):

```tsx
      {createTarget && (
        <Dialog open onOpenChange={(open) => { if (!open) setCreateTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createTarget.mode === "duplicate" ? "Duplicate variant" : "New variant"}</DialogTitle>
            </DialogHeader>
            <CreateVariantForm
              tripId={tripId}
              defaultName={createTarget.mode === "duplicate" ? `Copy of ${createTarget.source.name}` : `Variant ${forks.length + 1}`}
              sourceForkId={createTarget.mode === "duplicate" ? createTarget.source.id : undefined}
              onClose={() => setCreateTarget(null)}
              onCreated={(forkId) => navigateToPlan(forkId)}
            />
          </DialogContent>
        </Dialog>
      )}
```

- [ ] **Step 6: Run to verify pass**

Run: `npm test -- components/trip/fork-switcher.test.tsx`
Expected: PASS. Fix any existing test that asserted the old "New variant creates immediately" behaviour (update it to expect the dialog). Then `npx tsc --noEmit` → PASS.

- [ ] **Step 7: Verify + commit**

Run: `npm run test && npm run build` — both exit 0.
```bash
git add components/trip/fork-switcher.tsx components/trip/fork-switcher.test.tsx
git commit -m "feat(fork): name-on-create, duplicate variant, and route selection to the Plan editor"
```

---

## PHASE C — Docs & final verification

### Task 8: Sharpen CONTEXT.md + full-suite verify

**Files:**
- Modify: `CONTEXT.md` (the **Compare** entry, ~line 180)

- [ ] **Step 1: Update the Compare glossary entry.** In `CONTEXT.md`, in the **Compare** definition, add a sentence after the existing rows description noting the diff (keep it glossary-level, no implementation detail):

> The **Route** row additionally marks, per Fork, which Stops were **added**, **dropped**, **re-nighted** or **reordered**, and any change of **Transport** mode, all relative to the real plan; every other row shows a numeric **delta** against the real plan.

- [ ] **Step 2: Full suite**

Run: `npm test`
Expected: all green, no regressions vs. the pre-plan suite.

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Manual smoke** (real behaviour, on `npm run dev`): create a variant (named), edit a stop in it (banner shows on Plan + Wishlist; real plan's Calendar/Budget unchanged), open Compare (route diff + summary + reorder arrows), duplicate a variant, reorder columns, promote. Confirm discreet mode hides the switcher, Compare and banner.

- [ ] **Step 6: Commit**

```bash
git add CONTEXT.md
git commit -m "docs(fork): note the Compare route diff in the glossary"
```

---

## Self-Review

**1. Spec coverage:**
- Diff scope = Route + Transport-mode, aggregates unchanged → Tasks 1 (legs), 2 (`diffRoute`), 3 (render). ✅
- Matching by name+country; transports by endpoint names → `routeKey`/`legKey` in Task 2, tested. ✅
- Surfacing: enrich Route row in place (added/dropped/re-nighted/moved + leg lines + one-line summary), real plan plain, always-on → Task 3. ✅
- "Not live" banner on Plan + Wishlist, with Switch-to-real-plan + Compare, discreet-gated → Task 6. ✅
- Switcher routes variant selection to `/plan?plan=` → Task 7 Step 3. ✅
- Name on create → Task 7 Steps 4-5. Duplicate a variant → Task 7 Step 5 (+ `createFork` sourceForkId). ✅
- Reorder via `←/→` on Compare column headers; real plan not movable; ends disabled → Tasks 4 (`moveFork`), 5 (arrows). ✅
- Zero schema change; forks silent (moveFork no Activity); discreet hides all fork UI; pre-departure only → Global Constraints + Task 4. ✅
- CONTEXT.md sharpened; no ADR (reversible pure-fn choice) → Task 8. ✅

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". `diffRoute` and `moveFork` are given in full; test bodies are concrete. The only judgement-call step is Task 7's test-helper wiring, which is bounded ("mirror the file's existing `next/navigation` + actions mocks") because it depends on the exact shape already in `fork-switcher.test.tsx` — read that file first.

**3. Type/name consistency:** `PlanMetrics.legs` shape (`{fromName,toName,mode}[]`) is identical in Tasks 1, 2, 3. `RouteDiff`/`RouteDiffStop`/`RouteChangeKind`/`LegModeChange` names match between Task 2 (definition) and Task 3 (consumption). `moveFork(forkId, "left"|"right")` and `ForkMutationResult` match between Task 4 (definition) and Task 5 (call). `createFork(tripId, name?, sourceForkId?)` usage in Task 7 matches the shipped signature verified in `server/actions/forks.ts`. The banner is `VariantBanner({tripId, variantName})` in Task 6 definition and both page call-sites.

**Risk notes:** Highest-risk is Task 2 (`diffRoute` LCS diff) — mitigated by seven explicit unit tests covering same/added/dropped/re-nighted/moved/case-insensitive/leg-change/combined-summary. Task 5 and Task 3 both edit `compare-table.tsx` but in sequence (diff first, arrows second) with independent tests. Task 7 touches the most existing UI; its risk is breaking a prior switcher test, which Step 6 explicitly calls out to fix.
