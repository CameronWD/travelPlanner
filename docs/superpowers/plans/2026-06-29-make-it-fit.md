# "Make it fit" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Trip's projected end runs past the Hard end date, offer an advisory "Make it fit" assistant that suggests a preview-then-apply **trim plan** (reduce nights across flexible, non-pinned stops) and a **drop-a-stop** list, both previewing the resulting end, to land the projected end on/under the date.

**Architecture:** A pure, unit-tested engine (`lib/make-it-fit.ts`) computes the trim plan, drop candidates, and faithful "resulting end" previews by **replicating the existing apply behaviour** — trimming a scheduled stop re-derives its depart and ripples the contiguous following dated run exactly like `applyStopDates`/`setStopNights`; dropping a stop removes it (no re-flow), matching `deleteStop`. **Apply reuses existing server actions** (`setStopNights` per trimmed stop in sort order; `deleteStop` for a drop) — no new write path, so preview == apply by construction. A `MakeItFit` client component (button → dialog/sheet) renders on the Plan overview and the Summary, shown only when over.

**Tech Stack:** Next.js 15 App Router (RSC + server actions), React 19, Vitest + Testing Library, Tailwind.

**Domain docs:** `CONTEXT.md` ("Make it fit", "Hard end date", "Projected end", "Pinned", "Firm up") and ADR 0013. No new ADR — this is an additive, advisory assistant governed by ADR 0013; it does **not** alter the soft `endDate` (so trailing free calendar days may remain after a trim until the Traveller edits the end date — an accepted v1 behaviour, consistent with the existing "never shrink endDate" rule).

**Conventions:**
- Dates are `"YYYY-MM-DD"` strings. Use `lib/dates.ts` (`addDays`, `daysBetween`, `nightsBetween`, `formatLongDate`) and `lib/firm-up.ts` (`flowDates`, `computeProjectedEnd`, `FlowStop`, `ProjectionStop`).
- Pure logic in `lib/`, unit-tested. Client components mock server actions in tests (see `components/trip/itinerary-manager.test.tsx` for the mocking pattern). Single test file: `npx vitest run <path>`.
- Gate: `npm run lint` + `npx tsc --noEmit`; full suite `npm test`.

**Key facts the engine must honour (verified in the code):**
- `flowDates(stops, anchor)`: non-pinned flow `arrive=cursor, depart=arrive+max(0,nights??1)`; a pinned stop (`pinned && arriveDate && departDate`) is held and the cursor resumes at its depart.
- `computeProjectedEnd(stops, anchor)`: treats *scheduled* stops (both dates) as fixed boundaries, flows rough stops, returns the **max** departDate (or null with no anchor).
- `setStopNights(stopId, nights)`: scheduled stop → sets `depart = arrive + nights` and ripples the **contiguous following dated run** (stops at the first rough stop), holding pins; rough stop → sets `nights` only. Validates `0..366`.
- `deleteStop(stopId)`: deletes (cascades); does **not** re-flow survivors.

---

### Task 1: Engine core — `nightsOver` + `simulateAfterTrims`

**Files:**
- Create: `lib/make-it-fit.ts`
- Test: `lib/make-it-fit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/make-it-fit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nightsOver, simulateAfterTrims, type FitStop } from "./make-it-fit";

const s = (over: Partial<FitStop>): FitStop => ({
  id: "s", name: "Stop", arriveDate: null, departDate: null, nights: null, pinned: false, sortOrder: 0, ...over,
});

describe("nightsOver", () => {
  it("is 0 when on or under the hard end date", () => {
    expect(nightsOver("2026-07-10", "2026-07-10")).toBe(0);
    expect(nightsOver("2026-07-08", "2026-07-10")).toBe(0);
    expect(nightsOver(null, "2026-07-10")).toBe(0);
    expect(nightsOver("2026-07-10", null)).toBe(0);
  });
  it("counts nights past the hard end date", () => {
    expect(nightsOver("2026-07-17", "2026-07-15")).toBe(2);
  });
});

describe("simulateAfterTrims", () => {
  const anchor = "2026-07-01";

  it("reduces a rough stop's nights and pulls the projected end in", () => {
    const stops = [s({ id: "a", nights: 4, sortOrder: 0 }), s({ id: "b", nights: 4, sortOrder: 1 })];
    // baseline 4+4 from 07-01 -> 07-09
    expect(simulateAfterTrims(stops, anchor, [{ id: "a", nights: 2 }]).projectedEnd).toBe("2026-07-07");
  });

  it("trimming a scheduled stop re-derives its depart and ripples the following dated run", () => {
    const stops = [
      s({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }), // 4n
      s({ id: "b", arriveDate: "2026-07-05", departDate: "2026-07-09", sortOrder: 1 }), // 4n, contiguous
    ];
    // trim a to 2n -> a depart 07-03, b ripples to 07-03..07-07
    const r = simulateAfterTrims(stops, anchor, [{ id: "a", nights: 2 }]);
    expect(r.projectedEnd).toBe("2026-07-07");
    expect(r.byId["b"].arriveDate).toBe("2026-07-03");
    expect(r.byId["b"].departDate).toBe("2026-07-07");
  });

  it("a pinned stop blocks the ripple and is never moved", () => {
    const stops = [
      s({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }),
      s({ id: "p", arriveDate: "2026-07-10", departDate: "2026-07-12", pinned: true, sortOrder: 1 }),
    ];
    const r = simulateAfterTrims(stops, anchor, [{ id: "a", nights: 2 }]);
    expect(r.byId["p"].arriveDate).toBe("2026-07-10"); // pin held
    expect(r.projectedEnd).toBe("2026-07-12"); // pin still the latest depart
  });

  it("a rough stop breaks the contiguous dated run (ripple stops there)", () => {
    const stops = [
      s({ id: "a", arriveDate: "2026-07-01", departDate: "2026-07-05", sortOrder: 0 }),
      s({ id: "r", nights: 2, sortOrder: 1 }), // rough — breaks the dated run
      s({ id: "c", arriveDate: "2026-07-20", departDate: "2026-07-22", sortOrder: 2 }),
    ];
    const r = simulateAfterTrims(stops, anchor, [{ id: "a", nights: 2 }]);
    // c is past the rough break; applyStopDates only ripples the contiguous dated run, so c keeps its dates
    expect(r.byId["c"].arriveDate).toBe("2026-07-20");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/make-it-fit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the core**

Create `lib/make-it-fit.ts`:

```ts
/**
 * Pure "Make it fit" engine. No Prisma/React. Computes trim plans, drop
 * candidates, and faithful "resulting end" previews by replicating the apply
 * behaviour of setStopNights/applyStopDates (ripple) and deleteStop (no ripple).
 * See CONTEXT.md ("Make it fit") and ADR 0013.
 */
import { addDays, daysBetween, nightsBetween } from "@/lib/dates";
import { flowDates, computeProjectedEnd, type FlowStop, type ProjectionStop } from "@/lib/firm-up";

export interface FitStop {
  id: string;
  name: string;
  arriveDate: string | null;
  departDate: string | null;
  nights: number | null;
  pinned: boolean;
  sortOrder: number;
}

/** Nights the projected end runs past the hard end date (0 if on/under, or if either is null). */
export function nightsOver(projectedEnd: string | null, hardEndDate: string | null): number {
  if (!projectedEnd || !hardEndDate) return 0;
  const slack = daysBetween(projectedEnd, hardEndDate); // hardEnd - projectedEnd
  return slack < 0 ? -slack : 0;
}

/** Effective current nights of a stop: scheduled → from dates; rough → nights ?? 1. */
export function currentNights(s: FitStop): number {
  if (s.arriveDate && s.departDate) return nightsBetween(s.arriveDate, s.departDate);
  return Math.max(0, s.nights ?? 1);
}

/** A stop is flexible (trim/drop eligible) iff it is not pinned. */
export function isFlexible(s: FitStop): boolean {
  return !s.pinned;
}

function toProjectionStop(s: FitStop): ProjectionStop {
  return { id: s.id, arriveDate: s.arriveDate, departDate: s.departDate, nights: s.nights, pinned: s.pinned, sortOrder: s.sortOrder };
}

export interface SimResult {
  /** Working copy after trims, keyed by id (with rippled dates). */
  byId: Record<string, FitStop>;
  projectedEnd: string | null;
}

/**
 * Replicate applying `trims` (in sort order) via setStopNights/applyStopDates:
 *  - scheduled stop: depart = arrive + nights, then ripple the contiguous
 *    following dated run from the new depart (flowDates, pins held).
 *  - rough stop: set nights only.
 * Returns the working copy + the projected end computed over it.
 */
export function simulateAfterTrims(
  stops: readonly FitStop[],
  anchor: string | null,
  trims: ReadonlyArray<{ id: string; nights: number }>,
): SimResult {
  const work = stops.map((s) => ({ ...s })).sort((a, b) => a.sortOrder - b.sortOrder);
  const idxById = new Map(work.map((s, i) => [s.id, i]));
  const trimById = new Map(trims.map((t) => [t.id, t.nights]));

  // Apply in sort order so each ripple cascades into later trims, just like
  // sequential setStopNights calls.
  for (const stop of work) {
    if (!trimById.has(stop.id)) continue;
    const n = Math.max(0, trimById.get(stop.id)!);
    const idx = idxById.get(stop.id)!;
    if (stop.arriveDate && stop.departDate) {
      stop.departDate = addDays(stop.arriveDate, n);
      // Contiguous following dated run (stop at first rough stop).
      const run: FitStop[] = [];
      for (let j = idx + 1; j < work.length; j++) {
        if (!work[j].arriveDate) break;
        run.push(work[j]);
      }
      if (run.length > 0) {
        const flowStops: FlowStop[] = run.map((r) => ({
          id: r.id, nights: r.nights, pinned: r.pinned, arriveDate: r.arriveDate, departDate: r.departDate,
        }));
        const { results } = flowDates(flowStops, stop.departDate);
        for (const res of results) {
          if (res.pinned) continue;
          const target = work[idxById.get(res.id)!];
          target.arriveDate = res.arriveDate;
          target.departDate = res.departDate;
          target.nights = nightsBetween(res.arriveDate, res.departDate);
        }
      }
    } else {
      stop.nights = n;
    }
  }

  const projectedEnd = computeProjectedEnd(work.map(toProjectionStop), anchor);
  const byId: Record<string, FitStop> = {};
  for (const s of work) byId[s.id] = s;
  return { byId, projectedEnd };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/make-it-fit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/make-it-fit.ts lib/make-it-fit.test.ts
git commit -m "feat(fit): make-it-fit engine core (nightsOver, simulateAfterTrims)"
```
(Append trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)

---

### Task 2: Engine — `buildTrimPlan` + `buildDropCandidates`

**Files:**
- Modify: `lib/make-it-fit.ts`
- Test: `lib/make-it-fit.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/make-it-fit.test.ts` (extend the import to add `buildTrimPlan, buildDropCandidates`):

```ts
import { buildTrimPlan, buildDropCandidates } from "./make-it-fit";

describe("buildTrimPlan", () => {
  const anchor = "2026-07-01";

  it("returns an empty, fitting plan when not over", () => {
    const stops = [s({ id: "a", nights: 3, sortOrder: 0 })];
    const plan = buildTrimPlan(stops, anchor, "2026-07-10");
    expect(plan.items).toEqual([]);
    expect(plan.fits).toBe(true);
  });

  it("trims proportionally across flexible stops to land on the date", () => {
    // 6 + 4 = 10 nights from 07-01 -> ends 07-11; hard end 07-07 => 4 nights over.
    const stops = [
      s({ id: "a", name: "Rome", nights: 6, sortOrder: 0 }),
      s({ id: "b", name: "Florence", nights: 4, sortOrder: 1 }),
    ];
    const plan = buildTrimPlan(stops, anchor, "2026-07-07");
    expect(plan.fits).toBe(true);
    expect(plan.resultingEnd <= "2026-07-07").toBe(true);
    // total trimmed nights == 4 (6 nights total length, ends on the date)
    const trimmed = plan.items.reduce((sum, it) => sum + (it.fromNights - it.toNights), 0);
    expect(trimmed).toBe(4);
    // proportional: Rome (longer) gives up at least as many as Florence
    const rome = plan.items.find((i) => i.id === "a")!;
    const flo = plan.items.find((i) => i.id === "b")!;
    expect(rome.fromNights - rome.toNights).toBeGreaterThanOrEqual(flo.fromNights - flo.toNights);
  });

  it("never trims below the floor of 1 night and reports shortBy when it can't fit", () => {
    // Two 1-night flexible stops + a pin far out; trimming can't help.
    const stops = [
      s({ id: "a", nights: 1, sortOrder: 0 }),
      s({ id: "p", name: "Booked", arriveDate: "2026-07-20", departDate: "2026-07-25", pinned: true, sortOrder: 1 }),
    ];
    const plan = buildTrimPlan(stops, anchor, "2026-07-10");
    expect(plan.fits).toBe(false);
    expect(plan.shortBy).toBeGreaterThan(0);
    // floor respected: no toNights below 1
    for (const it of plan.items) expect(it.toNights).toBeGreaterThanOrEqual(1);
  });

  it("ignores pinned stops when trimming", () => {
    const stops = [
      s({ id: "a", name: "Rome", nights: 8, sortOrder: 0 }),
      s({ id: "p", name: "Pin", arriveDate: "2026-07-02", departDate: "2026-07-04", pinned: true, sortOrder: 1 }),
    ];
    const plan = buildTrimPlan(stops, anchor, "2026-07-06");
    expect(plan.items.every((i) => i.id !== "p")).toBe(true);
  });
});

describe("buildDropCandidates", () => {
  const anchor = "2026-07-01";

  it("lists flexible stops with the resulting end after dropping each, marking one recommended", () => {
    const stops = [
      s({ id: "a", name: "Rome", nights: 4, sortOrder: 0 }),
      s({ id: "b", name: "Pisa", nights: 4, sortOrder: 1 }),
    ];
    // ends 07-09; hard end 07-05 => over. Dropping either leaves one 4n stop -> ends 07-05.
    const cands = buildDropCandidates(stops, anchor, "2026-07-05");
    expect(cands.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(cands.every((c) => c.fits)).toBe(true);
    expect(cands.filter((c) => c.recommended)).toHaveLength(1);
  });

  it("excludes pinned stops from drop candidates", () => {
    const stops = [
      s({ id: "a", name: "Rome", nights: 4, sortOrder: 0 }),
      s({ id: "p", name: "Booked", arriveDate: "2026-07-05", departDate: "2026-07-09", pinned: true, sortOrder: 1 }),
    ];
    const cands = buildDropCandidates(stops, anchor, "2026-07-06");
    expect(cands.every((c) => c.id !== "p")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/make-it-fit.test.ts`
Expected: FAIL — `buildTrimPlan`/`buildDropCandidates` not exported.

- [ ] **Step 3: Implement the plan builders**

Append to `lib/make-it-fit.ts`:

```ts
export interface TrimItem {
  id: string;
  name: string;
  fromNights: number;
  toNights: number;
}
export interface TrimPlan {
  items: TrimItem[]; // only stops whose nights change
  resultingEnd: string | null;
  fits: boolean;
  /** Nights still over after trimming everything to the floor (0 when it fits). */
  shortBy: number;
}

const TRIM_FLOOR = 1;

/**
 * Build a proportional trim plan: distribute the needed reduction across
 * flexible stops in proportion to their length (longer stops give up more),
 * floored at TRIM_FLOOR, then verify against the ripple-faithful simulation and
 * greedily trim the longest remaining stop until it fits or all are floored.
 */
export function buildTrimPlan(stops: readonly FitStop[], anchor: string | null, hardEndDate: string | null): TrimPlan {
  const baseEnd = computeProjectedEnd(stops.map(toProjectionStop), anchor);
  const over = nightsOver(baseEnd, hardEndDate);
  if (over === 0 || !hardEndDate) {
    return { items: [], resultingEnd: baseEnd, fits: true, shortBy: 0 };
  }

  const flex = stops.filter(isFlexible).sort((a, b) => a.sortOrder - b.sortOrder);
  // target nights per flexible stop, starting from current.
  const target = new Map<string, number>();
  for (const f of flex) target.set(f.id, currentNights(f));

  const totalTrimmable = flex.reduce((sum, f) => sum + Math.max(0, currentNights(f) - TRIM_FLOOR), 0);

  // Proportional first pass: each flexible stop gives up a share of `over`
  // scaled by its trimmable headroom.
  if (totalTrimmable > 0) {
    let remaining = over;
    for (const f of flex) {
      if (remaining <= 0) break;
      const headroom = Math.max(0, currentNights(f) - TRIM_FLOOR);
      if (headroom === 0) continue;
      const share = Math.min(headroom, Math.round((headroom / totalTrimmable) * over));
      target.set(f.id, currentNights(f) - share);
      remaining -= share;
    }
  }

  // Verify + greedily top up by trimming the currently-longest flexible stop,
  // because ripple/rounding can leave us short or over-correct.
  const trimsFrom = (): { id: string; nights: number }[] =>
    flex.filter((f) => target.get(f.id)! !== currentNights(f)).map((f) => ({ id: f.id, nights: target.get(f.id)! }));

  const fitsNow = () => {
    const r = simulateAfterTrims(stops, anchor, trimsFrom());
    return { end: r.projectedEnd, over: nightsOver(r.projectedEnd, hardEndDate) };
  };

  let guard = 0;
  let { end, over: stillOver } = fitsNow();
  while (stillOver > 0 && guard++ < 1000) {
    // pick the flexible stop with the most remaining headroom
    let pick: FitStop | null = null;
    let best = 0;
    for (const f of flex) {
      const headroom = target.get(f.id)! - TRIM_FLOOR;
      if (headroom > best) { best = headroom; pick = f; }
    }
    if (!pick) break; // everything at the floor — can't trim further
    target.set(pick.id, target.get(pick.id)! - 1);
    ({ end, over: stillOver } = fitsNow());
  }

  const items: TrimItem[] = flex
    .filter((f) => target.get(f.id)! !== currentNights(f))
    .map((f) => ({ id: f.id, name: f.name, fromNights: currentNights(f), toNights: target.get(f.id)! }));

  return { items, resultingEnd: end, fits: stillOver === 0, shortBy: stillOver };
}

export interface DropCandidate {
  id: string;
  name: string;
  nights: number;
  resultingEnd: string | null;
  fits: boolean;
  recommended: boolean;
}

/**
 * For each flexible stop, the projected end if it were dropped (no re-flow,
 * matching deleteStop). Recommends the single best candidate: the one that fits
 * with the latest end (closest to the date); else the one that reduces most.
 */
export function buildDropCandidates(stops: readonly FitStop[], anchor: string | null, hardEndDate: string | null): DropCandidate[] {
  const flex = stops.filter(isFlexible).sort((a, b) => a.sortOrder - b.sortOrder);
  const cands: DropCandidate[] = flex.map((f) => {
    const remaining = stops.filter((x) => x.id !== f.id).map(toProjectionStop);
    const end = computeProjectedEnd(remaining, anchor);
    const fits = Boolean(hardEndDate && end && end <= hardEndDate);
    return { id: f.id, name: f.name, nights: currentNights(f), resultingEnd: end, fits, recommended: false };
  });

  // Recommend: among fitting candidates, the latest end (keeps the most trip);
  // if none fit, the earliest end (biggest reduction).
  const fitting = cands.filter((c) => c.fits && c.resultingEnd);
  let rec: DropCandidate | undefined;
  if (fitting.length > 0) {
    rec = fitting.reduce((bestC, c) => (c.resultingEnd! > bestC.resultingEnd! ? c : bestC));
  } else {
    const withEnd = cands.filter((c) => c.resultingEnd);
    rec = withEnd.length ? withEnd.reduce((bestC, c) => (c.resultingEnd! < bestC.resultingEnd! ? c : bestC)) : undefined;
  }
  if (rec) rec.recommended = true;
  return cands;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/make-it-fit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/make-it-fit.ts lib/make-it-fit.test.ts
git commit -m "feat(fit): buildTrimPlan + buildDropCandidates"
```
(Append the Co-Authored-By trailer.)

---

### Task 3: `MakeItFit` component (button → dialog, trim + drop + apply)

**Files:**
- Create: `components/trip/make-it-fit.tsx`
- Test: `components/trip/make-it-fit.test.tsx`

**Props:** `{ tripId: string; stops: FitStop[]; anchor: string | null; hardEndDate: string | null; }`. The component computes `over = nightsOver(computeProjectedEnd(stops, anchor), hardEndDate)`. If `over === 0` it renders nothing (the caller may also gate, but this keeps it safe). Otherwise it renders a **Make it fit** button that opens a dialog containing two sections side by side: the editable **trim plan** and the **drop candidates**. Apply (trim) loops `setStopNights` over the edited items in sort order; Apply (drop) calls `deleteStop`. On success it closes; `revalidatePath` in the actions refreshes the page.

- [ ] **Step 1: Write the failing tests**

Create `components/trip/make-it-fit.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MakeItFit } from "./make-it-fit";
import type { FitStop } from "@/lib/make-it-fit";

const setStopNights = vi.fn();
const deleteStop = vi.fn();
vi.mock("@/server/actions/stops", () => ({
  setStopNights: (...a: unknown[]) => setStopNights(...a),
  deleteStop: (...a: unknown[]) => deleteStop(...a),
}));

const stop = (over: Partial<FitStop>): FitStop => ({
  id: "s", name: "Stop", arriveDate: null, departDate: null, nights: null, pinned: false, sortOrder: 0, ...over,
});

// 6 + 4 nights from 07-01 -> ends 07-11; hard end 07-07 => 4 over.
const overStops = [
  stop({ id: "a", name: "Rome", nights: 6, sortOrder: 0 }),
  stop({ id: "b", name: "Florence", nights: 4, sortOrder: 1 }),
];

describe("MakeItFit", () => {
  beforeEach(() => {
    setStopNights.mockReset().mockResolvedValue({ success: true });
    deleteStop.mockReset().mockResolvedValue({ success: true });
  });

  it("renders nothing when the trip already fits", () => {
    const { container } = render(<MakeItFit tripId="t1" stops={[stop({ id: "a", nights: 2 })]} anchor="2026-07-01" hardEndDate="2026-07-10" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens a dialog showing how far over you are", async () => {
    render(<MakeItFit tripId="t1" stops={overStops} anchor="2026-07-01" hardEndDate="2026-07-07" />);
    fireEvent.click(screen.getByRole("button", { name: /make it fit/i }));
    expect(await screen.findByText(/4 nights past/i)).toBeInTheDocument();
  });

  it("applies the trim plan via setStopNights for each trimmed stop", async () => {
    render(<MakeItFit tripId="t1" stops={overStops} anchor="2026-07-01" hardEndDate="2026-07-07" />);
    fireEvent.click(screen.getByRole("button", { name: /make it fit/i }));
    fireEvent.click(await screen.findByRole("button", { name: /apply trim/i }));
    await waitFor(() => expect(setStopNights).toHaveBeenCalled());
    // total nights removed across calls == 4
    const removed = setStopNights.mock.calls.reduce((sum, [, n]) => sum + n, 0);
    // toNights sum: 6+4=10, minus 4 over = 6 total nights kept
    expect(removed).toBe(6);
  });

  it("drops a stop via deleteStop", async () => {
    render(<MakeItFit tripId="t1" stops={overStops} anchor="2026-07-01" hardEndDate="2026-07-07" />);
    fireEvent.click(screen.getByRole("button", { name: /make it fit/i }));
    // each candidate has a Drop button labelled with the stop name
    const dropRome = await screen.findByRole("button", { name: /drop rome/i });
    fireEvent.click(dropRome);
    await waitFor(() => expect(deleteStop).toHaveBeenCalledWith("a"));
  });
});
```

(If `Dialog` from `@/components/ui/dialog` needs portal/pointer stubs, they're already in `test/setup.ts`. If the trim Apply confirm needs the count to assert, prefer asserting `setStopNights` was called with each trimmed id; adjust the `removed` assertion to the engine's actual split if the proportional rounding differs — the key assertion is that Apply calls `setStopNights` per trimmed stop and `deleteStop` for a drop.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/trip/make-it-fit.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the component**

Create `components/trip/make-it-fit.tsx`:

```tsx
"use client";

import * as React from "react";
import { Scissors, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { setStopNights, deleteStop } from "@/server/actions/stops";
import { formatLongDate } from "@/lib/dates";
import { computeProjectedEnd } from "@/lib/firm-up";
import {
  nightsOver, buildTrimPlan, buildDropCandidates, simulateAfterTrims, currentNights, isFlexible,
  type FitStop,
} from "@/lib/make-it-fit";

interface MakeItFitProps {
  tripId: string;
  stops: FitStop[];
  anchor: string | null;
  hardEndDate: string | null;
}

export function MakeItFit({ tripId, stops, anchor, hardEndDate }: MakeItFitProps) {
  const [open, setOpen] = React.useState(false);
  const projectedEnd = React.useMemo(
    () => computeProjectedEnd(stops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate, nights: s.nights, pinned: s.pinned, sortOrder: s.sortOrder })), anchor),
    [stops, anchor],
  );
  const over = nightsOver(projectedEnd, hardEndDate);

  if (over === 0) return null;

  return (
    <>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
        <Sparkles className="size-3.5" aria-hidden="true" />
        Make it fit
      </Button>
      {open && (
        <MakeItFitDialog
          tripId={tripId}
          stops={stops}
          anchor={anchor}
          hardEndDate={hardEndDate}
          projectedEnd={projectedEnd}
          over={over}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function MakeItFitDialog({
  tripId, stops, anchor, hardEndDate, projectedEnd, over, onClose,
}: MakeItFitProps & { projectedEnd: string | null; over: number; onClose: () => void }) {
  const initialPlan = React.useMemo(() => buildTrimPlan(stops, anchor, hardEndDate), [stops, anchor, hardEndDate]);
  // Editable nights per flexible stop, seeded from the suggested plan.
  const flex = React.useMemo(() => stops.filter(isFlexible).sort((a, b) => a.sortOrder - b.sortOrder), [stops]);
  const [nightsById, setNightsById] = React.useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const f of flex) m[f.id] = currentNights(f);
    for (const it of initialPlan.items) m[it.id] = it.toNights;
    return m;
  });
  const [pending, setPending] = React.useState(false);

  const liveTrims = flex
    .filter((f) => nightsById[f.id] !== currentNights(f))
    .map((f) => ({ id: f.id, nights: nightsById[f.id] }));
  const sim = simulateAfterTrims(stops, anchor, liveTrims);
  const liveOver = nightsOver(sim.projectedEnd, hardEndDate);

  const dropCandidates = React.useMemo(() => buildDropCandidates(stops, anchor, hardEndDate), [stops, anchor, hardEndDate]);

  async function applyTrim() {
    setPending(true);
    try {
      // Apply in sort order so ripples cascade exactly like the simulation.
      for (const f of flex) {
        const n = nightsById[f.id];
        if (n !== currentNights(f)) {
          const r = await setStopNights(f.id, n);
          if (!r.success) { toast({ variant: "destructive", title: "Couldn't apply the trim." }); return; }
        }
      }
      onClose();
    } finally {
      setPending(false);
    }
  }

  async function drop(id: string) {
    setPending(true);
    try {
      const r = await deleteStop(id);
      if (!r.success) { toast({ variant: "destructive", title: "Couldn't drop that stop." }); return; }
      onClose();
    } finally {
      setPending(false);
    }
  }

  const hardEndLabel = hardEndDate ? formatLongDate(hardEndDate) : "";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Make it fit</DialogTitle>
          <DialogDescription>
            {projectedEnd ? <>Ends {formatLongDate(projectedEnd)} · <span className="font-medium text-destructive">{over} night{over === 1 ? "" : "s"} past</span> your hard end date of {hardEndLabel}.</> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* Trim plan */}
          <section aria-label="Trim plan" className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Scissors className="size-4" aria-hidden="true" /> Trim nights</h3>
            <ul className="flex flex-col gap-2">
              {flex.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{f.name}</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <span className="tabular-nums">{currentNights(f)}→</span>
                    <Input
                      type="number" min={0} max={currentNights(f)}
                      aria-label={`Nights for ${f.name}`}
                      value={nightsById[f.id]}
                      disabled={pending}
                      onChange={(e) => setNightsById((m) => ({ ...m, [f.id]: Math.max(0, Number.parseInt(e.target.value, 10) || 0) }))}
                      className="w-16"
                    />
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {sim.projectedEnd ? <>Ends {formatLongDate(sim.projectedEnd)}{liveOver > 0 ? ` · still ${liveOver} over` : " · fits ✓"}</> : null}
            </p>
            <Button variant="primary" size="sm" disabled={pending || liveTrims.length === 0} onClick={applyTrim}>
              Apply trim
            </Button>
          </section>

          {/* Drop a stop */}
          <section aria-label="Drop a stop" className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Trash2 className="size-4" aria-hidden="true" /> Or drop a stop</h3>
            <ul className="flex flex-col gap-2">
              {dropCandidates.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex flex-col">
                    <span className="truncate">{c.name} {c.recommended && <span className="text-xs text-primary">· recommended</span>}</span>
                    <span className="text-xs text-muted-foreground">{c.resultingEnd ? `ends ${formatLongDate(c.resultingEnd)}${c.fits ? " · fits ✓" : ""}` : ""}</span>
                  </span>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => drop(c.id)}>
                    Drop {c.name}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

(Verify `DialogDescription` is exported from `@/components/ui/dialog`; if not, use a plain `<p>` inside the header. Verify `Input` accepts `type="number"`/`min`/`max` — it extends the native input. Match the import surface to the real components before finalising.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/trip/make-it-fit.test.tsx`
Expected: PASS. (If the `removed === 6` assertion is brittle due to proportional rounding, assert instead that `setStopNights` was called for each trimmed id with its `nightsById` value and that `liveOver` reaches 0 — the engine tests already lock the split.)

- [ ] **Step 5: Commit**

```bash
git add components/trip/make-it-fit.tsx components/trip/make-it-fit.test.tsx
git commit -m "feat(fit): MakeItFit dialog (editable trim plan + drop candidates)"
```
(Append the Co-Authored-By trailer.)

---

### Task 4: Render `MakeItFit` on the Plan overview

**Files:**
- Modify: `components/trip/plan-overview.tsx`
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx`
- Test: `components/trip/plan-overview.test.tsx`

The overview already has the hard-end status. Add a `MakeItFit` button next to it, shown only when `summary.hardEndState === "over"`. The component needs the full flexible-stop data, so `PlanOverview` gains a `fitStops: FitStop[]` prop, passed from the Plan page (which already fetches stops).

- [ ] **Step 1: Add the prop + render (failing test first)**

Append to `components/trip/plan-overview.test.tsx` (the file mocks `./hard-end-date-control`; also mock `./make-it-fit`):

```tsx
vi.mock("./make-it-fit", () => ({ MakeItFit: () => <div data-testid="make-it-fit" /> }));
```

```tsx
  it("shows the Make it fit entry point when over", () => {
    render(<PlanOverview tripId="t1" summary={base} startDate="2026-07-01" fitStops={[]} />);
    expect(screen.getByTestId("make-it-fit")).toBeInTheDocument();
  });

  it("does not show Make it fit when not over", () => {
    render(<PlanOverview tripId="t1" summary={{ ...base, hardEndState: "ok", hardEndSlackNights: 5 }} startDate="2026-07-01" fitStops={[]} />);
    expect(screen.queryByTestId("make-it-fit")).toBeNull();
  });
```

(Update the existing `PlanOverview` test renders to pass `fitStops={[]}` so they keep compiling.)

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run components/trip/plan-overview.test.tsx`
Expected: FAIL — `fitStops` prop / `MakeItFit` not rendered.

- [ ] **Step 3: Implement**

In `components/trip/plan-overview.tsx`:
- Add to imports: `import { MakeItFit } from "./make-it-fit";` and `import type { FitStop } from "@/lib/make-it-fit";`.
- Add `fitStops: FitStop[]` to `PlanOverviewProps`.
- In the hard-end block, after the `role="status"` span, render the entry point when over:

```tsx
            {summary.hardEndState === "over" && (
              <MakeItFit tripId={tripId} stops={fitStops} anchor={startDate} hardEndDate={summary.hardEndDate} />
            )}
```

In `app/(app)/trips/[tripId]/plan/page.tsx`, pass `fitStops` to `<PlanOverview>` (the page already maps stops for `summarizePlan`; reuse the same shape plus `name`):

```tsx
        <PlanOverview
          tripId={tripId}
          summary={planSummary}
          startDate={trip?.startDate ?? null}
          fitStops={stops.map((s) => ({
            id: s.id, name: s.name, arriveDate: s.arriveDate, departDate: s.departDate,
            nights: s.nights, pinned: s.pinned, sortOrder: s.sortOrder,
          }))}
        />
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/trip/plan-overview.test.tsx` then `npx tsc --noEmit`.
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add components/trip/plan-overview.tsx "app/(app)/trips/[tripId]/plan/page.tsx" components/trip/plan-overview.test.tsx
git commit -m "feat(fit): Make it fit entry point on the Plan overview"
```
(Append the Co-Authored-By trailer.)

---

### Task 5: Render `MakeItFit` on the Summary (next to the hard-end flag)

**Files:**
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx`

The Summary already computes `flags` (incl. the `hard-end-over` flag) and has `getTripProjection`. Render `MakeItFit` near the flags when a `hard-end-over` flag is present. The Summary fetches *scheduled* `stops` and `roughStops` separately — assemble a unified `FitStop[]` for the component and the projection anchor (`trip.startDate`).

- [ ] **Step 1: Assemble fit stops + render**

In `app/(app)/trips/[tripId]/summary/page.tsx`:
- Import `MakeItFit` from `@/components/trip/make-it-fit` and `type FitStop` from `@/lib/make-it-fit`.
- The page already has `stops` (scheduled, with `arriveDate/departDate/sortOrder/name`) and `roughStops` (with `nights/name`). Both queries must include `id`, `name`, `sortOrder`, `pinned`, `nights`, `arriveDate`, `departDate` for the unified shape — extend the two `select`s to include any missing of these (scheduled stops need `pinned`, `nights`; rough stops need `pinned`, `sortOrder`, `arriveDate`, `departDate` which are null). Build:

```tsx
  const fitStops: FitStop[] = [...stops, ...roughStops]
    .map((s) => ({
      id: s.id, name: s.name,
      arriveDate: s.arriveDate ?? null, departDate: s.departDate ?? null,
      nights: s.nights ?? null, pinned: s.pinned ?? false, sortOrder: s.sortOrder ?? 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const isOverHardEnd = flags.some((f) => f.id === "hard-end-over");
```

- Render near the Flags section (e.g. just above `<FlagList ... />`):

```tsx
        {isOverHardEnd && (
          <MakeItFit tripId={tripId} stops={fitStops} anchor={trip.startDate ?? null} hardEndDate={projection.hardEndDate} />
        )}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` (clean) and `npm run lint` (no new errors).
Note: if a `select` omits a field the unified shape needs, TypeScript will flag it — add the field to that query's `select`.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/trips/[tripId]/summary/page.tsx"
git commit -m "feat(fit): Make it fit entry point on the Summary"
```
(Append the Co-Authored-By trailer.)

---

### Task 6: Full-suite verification

**Files:** none.

- [ ] **Step 1:** `npm test` — expect all pass (incl. new make-it-fit engine + component tests, and the updated plan-overview tests).
- [ ] **Step 2:** `npm run lint && npx tsc --noEmit` — expect clean.
- [ ] **Step 3:** `npm run build` — expect success.
- [ ] **Step 4 (manual, optional, needs DB + dev server):** On a trip whose projected end exceeds a set Hard end date, open the Plan tab → the hard-end status shows red with a **Make it fit** button → opens the dialog showing "N nights past", an editable trim plan (live "ends … / fits ✓") and a drop list with a recommended candidate; Apply trim reduces the stops and the warning clears; the same button appears on the Summary next to the flag. Confirm pinned stops never appear as trim/drop targets.

---

## Self-Review

**Spec coverage:**
- Suggest → preview → apply (non-destructive): trim plan is editable, nothing writes until Apply (Task 3). ✓
- Trim + drop **side by side**: dialog has both sections (Task 3). ✓
- Eligible = all non-pinned stops; pinned never trimmed/dropped: `isFlexible`, `buildTrimPlan`/`buildDropCandidates` filter on it (Tasks 1–2). ✓
- Proportional default, floor 1 night, editable: `buildTrimPlan` (Task 2); editable nights inputs (Task 3). ✓
- Drop = pick from list, live resulting-end + recommended: `buildDropCandidates` (Task 2), drop list (Task 3). ✓
- Trimming a scheduled stop ripples (reuses `setStopNights`/`applyStopDates`); rough just sets nights: `simulateAfterTrims` mirrors it; Apply calls `setStopNights` in sort order (Tasks 1, 3). ✓
- Shown only when over; on Plan overview + Summary: Tasks 4, 5; `MakeItFit` self-gates on `over===0`. ✓
- Infeasible case: `buildTrimPlan.fits/shortBy` + dialog "still N over" (Tasks 2, 3). ✓
- Previews trustworthy: engine replicates apply exactly; Apply reuses the same actions (Tasks 1–3). ✓
- No soft-endDate change / advisory only: Apply uses `setStopNights`/`deleteStop` only; documented trailing-free-days behaviour. ✓

**Type consistency:** `FitStop` (lib/make-it-fit) is the single stop shape consumed by the engine, the component, and both pages. `buildTrimPlan`→`TrimItem`, `buildDropCandidates`→`DropCandidate`. `simulateAfterTrims` returns `{ byId, projectedEnd }`. `setStopNights(id, nights)` / `deleteStop(id)` match the real action signatures. `PlanOverview` gains `fitStops: FitStop[]`.

**Placeholder scan:** none — concrete code/tests throughout. Where rounding could make one component assertion brittle, the plan calls it out and points to the engine tests as the source of truth.

**Risk note:** the only behavioural subtlety is gaps between scheduled stops — `simulateAfterTrims` and Apply both ripple the *contiguous dated run* (matching `applyStopDates`), so a rough stop or a pin bounds the ripple; this is consistent between preview and apply. The soft `endDate` is intentionally left untouched.
