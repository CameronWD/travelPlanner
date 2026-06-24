# Trip Home & Wayfinding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the trip landing with an adaptive, phase-aware Home (which absorbs the Today view), and restructure the trip navigation into a responsive primary + "More" pattern, with phase badges on the trips list.

**Architecture:** Two pure, fully-tested libs do the thinking — `lib/trip-phase.ts` derives a `TripPhase` from the trip's dates and today, and `lib/next-steps.ts` ranks `detectFlags` output plus forward nudges into a to-do list. The Home route becomes a thin server component that computes the phase and delegates to one of five phase components under `components/trip/home/`. The planning canvas moves to a new `/plan` route. Navigation splits into an always-visible primary set + a "More" overflow (dropdown on desktop, bottom tab bar + sheet on mobile). The trips list reuses the phase lib for per-card badges and sorting.

**Tech Stack:** Next.js 16 App Router (server components), React 19, Tailwind v4, Prisma 7/Postgres, Zod 4, Vitest + Testing Library. Dates are `YYYY-MM-DD` strings; money is Int minor units.

---

## Conventions (read once)

- **Tests:** Vitest. Pure-lib tests are co-located `*.test.ts`. Run a single file with `npx vitest run <path>`. Component tests use `@testing-library/react` (see `components/trip/stop-card.test.tsx` for the pattern).
- **Dates:** all helpers live in `lib/dates.ts`. Calendar dates are `YYYY-MM-DD` strings compared lexicographically. `addDays(s, n)`, `daysBetween(a, b)` (b − a, can be negative), `dayNumberInTrip(date, start)` (1-based), `todayISO()`, `formatDateRange(start, end)`, `formatLongDate(s)` are all available.
- **Money:** `formatMoney(minor, currency)` from `lib/money.ts`.
- **Never work on `main`.** Work happens on the `feat/trip-home-and-wayfinding` branch (already created). Commit after each task.
- **Typecheck/lint gate:** after UI tasks run `npx tsc --noEmit` and `npm run lint`. The whole suite is `npm test`.

---

## File Structure

**Create:**
- `lib/trip-phase.ts` — pure phase engine: `computeTripPhase`, `describePhase`, `PHASE_RANK`, `compareForTripList`.
- `lib/trip-phase.test.ts`
- `lib/next-steps.ts` — pure ranking engine: `buildNextSteps`, `NextStep`, `NudgeInput`.
- `lib/next-steps.test.ts`
- `components/trip/home/countdown-hero.tsx` — phase label + countdown + dates (presentational).
- `components/trip/home/next-steps-card.tsx` — ranked to-do list (presentational).
- `components/trip/home/budget-glance.tsx` — est/actual at a glance (presentational).
- `components/trip/home/quick-actions.tsx` — phase-aware action row (client).
- `components/trip/home/next-steps-card.test.tsx`, `components/trip/home/countdown-hero.test.tsx`
- `components/trip/home/phase-sketching.tsx`
- `components/trip/home/phase-planning.tsx` (handles both `planning` and `final-prep`)
- `components/trip/home/phase-travelling.tsx` (ported Today body)
- `components/trip/home/phase-past.tsx`
- `app/(app)/trips/[tripId]/plan/page.tsx` — the planning canvas, moved from the old Overview.
- `components/trip/nav-more-menu.tsx` — desktop "More" dropdown (client).
- `components/trip/mobile-tab-bar.tsx` — mobile bottom tab bar + "More" sheet (client).

**Modify:**
- `app/(app)/trips/[tripId]/page.tsx` — becomes the Home phase router.
- `app/(app)/trips/[tripId]/today/page.tsx` — redirect to the trip Home.
- `components/trip/trip-nav.tsx` — primary + "More"; remove Today; rename Overview → Home; add Plan.
- `components/trip/trip-card.tsx` — phase badge + countdown.
- `app/(app)/trips/page.tsx` — compute phase per trip, sort active/upcoming first.

---

## Task 1: Phase engine (`lib/trip-phase.ts`)

**Files:**
- Create: `lib/trip-phase.ts`
- Test: `lib/trip-phase.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/trip-phase.test.ts
import { describe, expect, it } from "vitest";
import {
  computeTripPhase,
  describePhase,
  PHASE_RANK,
  compareForTripList,
} from "./trip-phase";

describe("computeTripPhase", () => {
  it("is sketching when there is no start date", () => {
    expect(computeTripPhase({ startDate: null, endDate: null, today: "2026-06-24" })).toBe("sketching");
    expect(computeTripPhase({ startDate: null, endDate: "2026-07-01", today: "2026-06-24" })).toBe("sketching");
  });

  it("is planning when start is more than 14 days away", () => {
    expect(computeTripPhase({ startDate: "2026-07-20", endDate: "2026-07-30", today: "2026-06-24" })).toBe("planning");
  });

  it("is final-prep within 14 days before start (inclusive)", () => {
    expect(computeTripPhase({ startDate: "2026-07-08", endDate: "2026-07-20", today: "2026-06-24" })).toBe("final-prep");
    // exactly 14 days before
    expect(computeTripPhase({ startDate: "2026-07-08", endDate: "2026-07-20", today: "2026-06-24" })).toBe("final-prep");
  });

  it("is travelling between start and end inclusive", () => {
    expect(computeTripPhase({ startDate: "2026-06-20", endDate: "2026-06-30", today: "2026-06-24" })).toBe("travelling");
    expect(computeTripPhase({ startDate: "2026-06-24", endDate: "2026-06-30", today: "2026-06-24" })).toBe("travelling");
    expect(computeTripPhase({ startDate: "2026-06-20", endDate: "2026-06-24", today: "2026-06-24" })).toBe("travelling");
  });

  it("is past after the end date", () => {
    expect(computeTripPhase({ startDate: "2026-06-01", endDate: "2026-06-10", today: "2026-06-24" })).toBe("past");
  });

  it("treats a missing end date as the start date for boundaries", () => {
    expect(computeTripPhase({ startDate: "2026-06-24", endDate: null, today: "2026-06-24" })).toBe("travelling");
    expect(computeTripPhase({ startDate: "2026-06-20", endDate: null, today: "2026-06-24" })).toBe("past");
  });
});

describe("describePhase", () => {
  it("labels and counts down upcoming trips in days", () => {
    const d = describePhase({ startDate: "2026-07-20", endDate: "2026-07-30", today: "2026-06-24" });
    expect(d.phase).toBe("planning");
    expect(d.label).toBe("Planning");
    expect(d.countdown).toBe("In 26 days");
  });

  it("says Tomorrow at one day out", () => {
    expect(describePhase({ startDate: "2026-06-25", endDate: "2026-07-01", today: "2026-06-24" }).countdown).toBe("Tomorrow");
  });

  it("labels final prep", () => {
    expect(describePhase({ startDate: "2026-07-01", endDate: "2026-07-10", today: "2026-06-24" }).label).toBe("Final prep");
  });

  it("shows day X of N while travelling", () => {
    const d = describePhase({ startDate: "2026-06-20", endDate: "2026-06-30", today: "2026-06-24" });
    expect(d.label).toBe("Travelling");
    expect(d.countdown).toBe("Day 5 of 11");
  });

  it("describes sketching and past", () => {
    expect(describePhase({ startDate: null, endDate: null, today: "2026-06-24" })).toMatchObject({ label: "Sketching", countdown: "Not dated yet" });
    expect(describePhase({ startDate: "2026-06-01", endDate: "2026-06-10", today: "2026-06-24" })).toMatchObject({ label: "Past", countdown: "Ended 14 days ago" });
  });
});

describe("compareForTripList", () => {
  it("orders travelling, final-prep, planning (soonest first), sketching, then past", () => {
    const today = "2026-06-24";
    const trips = [
      { id: "past", startDate: "2026-01-01", endDate: "2026-01-10", createdAt: new Date("2026-01-01") },
      { id: "sketch", startDate: null, endDate: null, createdAt: new Date("2026-06-01") },
      { id: "planning-late", startDate: "2026-09-01", endDate: "2026-09-10", createdAt: new Date("2026-02-01") },
      { id: "planning-soon", startDate: "2026-08-01", endDate: "2026-08-10", createdAt: new Date("2026-02-01") },
      { id: "travelling", startDate: "2026-06-20", endDate: "2026-06-30", createdAt: new Date("2026-03-01") },
      { id: "final", startDate: "2026-07-01", endDate: "2026-07-10", createdAt: new Date("2026-03-01") },
    ];
    const ordered = [...trips].sort((a, b) => compareForTripList(a, b, today)).map((t) => t.id);
    expect(ordered).toEqual(["travelling", "final", "planning-soon", "planning-late", "sketch", "past"]);
  });

  it("exposes a stable phase rank", () => {
    expect(PHASE_RANK.travelling).toBeLessThan(PHASE_RANK.planning);
    expect(PHASE_RANK.sketching).toBeLessThan(PHASE_RANK.past);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run lib/trip-phase.test.ts`
Expected: FAIL — `lib/trip-phase.ts` does not exist.

- [ ] **Step 3: Implement `lib/trip-phase.ts`**

```ts
/**
 * Pure trip-phase engine.
 *
 * The Phase is which stage of its life a Trip is in (see CONTEXT.md). It drives
 * what the Home leads with and how the trips list is ordered. Derived from the
 * trip's start date and today — never stored. See ADR 0010.
 */
import { addDays, daysBetween, dayNumberInTrip } from "@/lib/dates";

export const FINAL_PREP_WINDOW_DAYS = 14;

export type TripPhase =
  | "sketching"
  | "planning"
  | "final-prep"
  | "travelling"
  | "past";

export interface TripPhaseInput {
  startDate: string | null;
  endDate: string | null;
  today: string; // YYYY-MM-DD
}

/** Derive the phase. A date-less trip is always sketching. */
export function computeTripPhase({ startDate, endDate, today }: TripPhaseInput): TripPhase {
  if (!startDate) return "sketching";
  const end = endDate ?? startDate; // soft end falls back to the start date
  if (today > end) return "past";
  if (today >= startDate) return "travelling";
  // today < startDate — upcoming
  const finalPrepStart = addDays(startDate, -FINAL_PREP_WINDOW_DAYS);
  return today >= finalPrepStart ? "final-prep" : "planning";
}

const PHASE_LABELS: Record<TripPhase, string> = {
  sketching: "Sketching",
  planning: "Planning",
  "final-prep": "Final prep",
  travelling: "Travelling",
  past: "Past",
};

export interface PhaseDescription {
  phase: TripPhase;
  label: string;
  /** Short status line: "In 26 days", "Day 5 of 11", "Ended 14 days ago". */
  countdown: string;
}

function pluralDays(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

export function describePhase(input: TripPhaseInput): PhaseDescription {
  const phase = computeTripPhase(input);
  const { startDate, endDate, today } = input;
  let countdown = "";

  switch (phase) {
    case "sketching":
      countdown = "Not dated yet";
      break;
    case "planning":
    case "final-prep": {
      const days = daysBetween(today, startDate!); // > 0 (today < start)
      countdown = days === 1 ? "Tomorrow" : `In ${pluralDays(days)}`;
      break;
    }
    case "travelling": {
      const end = endDate ?? startDate!;
      const dayNum = dayNumberInTrip(today, startDate!);
      const total = daysBetween(startDate!, end) + 1;
      countdown = `Day ${dayNum} of ${total}`;
      break;
    }
    case "past": {
      const end = endDate ?? startDate!;
      const ago = daysBetween(end, today); // >= 1
      countdown = ago === 0 ? "Ended today" : `Ended ${pluralDays(ago)} ago`;
      break;
    }
  }

  return { phase, label: PHASE_LABELS[phase], countdown };
}

/** Lower rank sorts earlier in the trips list. */
export const PHASE_RANK: Record<TripPhase, number> = {
  travelling: 0,
  "final-prep": 1,
  planning: 2,
  sketching: 3,
  past: 4,
};

export interface TripListItem {
  startDate: string | null;
  endDate: string | null;
  createdAt: Date;
}

/**
 * Comparator for the trips list: active/upcoming first, then sketching, then
 * past. Within the dated upcoming/active groups, soonest start first; within
 * sketching/past, newest first.
 */
export function compareForTripList(a: TripListItem, b: TripListItem, today: string): number {
  const pa = computeTripPhase({ startDate: a.startDate, endDate: a.endDate, today });
  const pb = computeTripPhase({ startDate: b.startDate, endDate: b.endDate, today });
  if (PHASE_RANK[pa] !== PHASE_RANK[pb]) return PHASE_RANK[pa] - PHASE_RANK[pb];

  // Same phase group.
  if (pa === "sketching" || pa === "past") {
    return b.createdAt.getTime() - a.createdAt.getTime(); // newest first
  }
  // Dated upcoming/active: soonest start first.
  return (a.startDate ?? "").localeCompare(b.startDate ?? "");
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run lib/trip-phase.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/trip-phase.ts lib/trip-phase.test.ts
git commit -m "feat(home): pure trip-phase engine"
```

---

## Task 2: Next-steps engine (`lib/next-steps.ts`)

**Files:**
- Create: `lib/next-steps.ts`
- Test: `lib/next-steps.test.ts`

Depends on the `Flag` type from `lib/flags.ts` and `TripPhase` from Task 1.

- [ ] **Step 1: Write the failing test**

```ts
// lib/next-steps.test.ts
import { describe, expect, it } from "vitest";
import { buildNextSteps, type NudgeInput } from "./next-steps";
import type { Flag } from "@/lib/flags";

const NO_NUDGES: NudgeInput = {
  hasDates: true,
  undatedChapterCount: 0,
  hasPackingList: true,
  hasPretripList: true,
  unbookedTransportCount: 0,
};

const warn = (id: string): Flag => ({ id, severity: "warning", message: `warn ${id}`, targetType: "STOP", targetId: id });
const info = (id: string): Flag => ({ id, severity: "info", message: `info ${id}`, targetType: "DAY", date: "2026-07-01" });

describe("buildNextSteps", () => {
  it("returns an empty list when there is nothing to do", () => {
    expect(buildNextSteps({ flags: [], phase: "planning", nudges: NO_NUDGES, tripBasePath: "/trips/t" })).toEqual([]);
  });

  it("ranks warnings above info flags", () => {
    const steps = buildNextSteps({ flags: [info("a"), warn("b")], phase: "planning", nudges: NO_NUDGES, tripBasePath: "/trips/t" });
    expect(steps.map((s) => s.id)).toEqual(["b", "a"]);
    expect(steps[0].severity).toBe("warning");
  });

  it("links STOP/TRANSPORT/TRIP flags to the plan canvas and DAY flags to the day", () => {
    const steps = buildNextSteps({ flags: [warn("b"), info("a")], phase: "planning", nudges: NO_NUDGES, tripBasePath: "/trips/t" });
    expect(steps.find((s) => s.id === "b")?.href).toBe("/trips/t/plan");
    expect(steps.find((s) => s.id === "a")?.href).toBe("/trips/t/day/2026-07-01");
  });

  it("adds forward nudges for gaps", () => {
    const steps = buildNextSteps({
      flags: [],
      phase: "planning",
      nudges: { hasDates: true, undatedChapterCount: 2, hasPackingList: false, hasPretripList: false, unbookedTransportCount: 3 },
      tripBasePath: "/trips/t",
    });
    const titles = steps.map((s) => s.title);
    expect(titles.some((t) => /chapter/i.test(t))).toBe(true);
    expect(titles.some((t) => /packing/i.test(t))).toBe(true);
    expect(steps.every((s) => s.source === "nudge")).toBe(true);
  });

  it("boosts packing/pretrip nudges to the top in final-prep", () => {
    const steps = buildNextSteps({
      flags: [info("empty-day")],
      phase: "final-prep",
      nudges: { hasDates: true, undatedChapterCount: 0, hasPackingList: false, hasPretripList: false, unbookedTransportCount: 0 },
      tripBasePath: "/trips/t",
    });
    // Packing should outrank an info flag in final-prep.
    expect(steps[0].title).toMatch(/packing/i);
  });

  it("nudges to set dates when the trip has none", () => {
    const steps = buildNextSteps({
      flags: [],
      phase: "sketching",
      nudges: { hasDates: false, undatedChapterCount: 0, hasPackingList: false, hasPretripList: false, unbookedTransportCount: 0 },
      tripBasePath: "/trips/t",
    });
    expect(steps[0].title).toMatch(/set your trip dates/i);
  });

  it("caps the list at the limit (default 4)", () => {
    const flags = [warn("a"), warn("b"), warn("c"), warn("d"), warn("e")];
    expect(buildNextSteps({ flags, phase: "planning", nudges: NO_NUDGES, tripBasePath: "/trips/t" })).toHaveLength(4);
    expect(buildNextSteps({ flags, phase: "planning", nudges: NO_NUDGES, tripBasePath: "/trips/t", limit: 2 })).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run lib/next-steps.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/next-steps.ts`**

```ts
/**
 * Pure "Next steps" engine for the trip Home.
 *
 * Combines detected Flags (problems) with forward-looking nudges (gaps that
 * aren't problems yet) into one ranked, deep-linked to-do list. See CONTEXT.md
 * ("Next steps") and ADR 0010. PURE — no Prisma/React.
 */
import type { Flag } from "@/lib/flags";
import type { TripPhase } from "@/lib/trip-phase";

export interface NextStep {
  id: string;
  title: string;
  href: string;
  severity: "warning" | "info";
  source: "flag" | "nudge";
}

/** Forward-looking gaps that detectFlags does not already cover. */
export interface NudgeInput {
  hasDates: boolean;
  undatedChapterCount: number;
  hasPackingList: boolean;
  hasPretripList: boolean;
  unbookedTransportCount: number;
}

export interface BuildNextStepsInput {
  flags: Flag[];
  phase: TripPhase;
  nudges: NudgeInput;
  tripBasePath: string; // e.g. "/trips/abc"
  limit?: number;
}

// Lower priority = more important (sorts earlier).
const WARNING_PRIORITY = 10;
const INFO_PRIORITY = 30;

function flagHref(flag: Flag, base: string): string {
  switch (flag.targetType) {
    case "DAY":
      return flag.date ? `${base}/day/${flag.date}` : `${base}/calendar`;
    case "STOP":
    case "TRANSPORT":
    case "ACCOMMODATION":
    case "TRIP":
    default:
      return `${base}/plan`;
  }
}

interface Candidate extends NextStep {
  priority: number;
}

export function buildNextSteps({
  flags,
  phase,
  nudges,
  tripBasePath,
  limit = 4,
}: BuildNextStepsInput): NextStep[] {
  const candidates: Candidate[] = [];

  // 1. Flags become steps.
  for (const flag of flags) {
    candidates.push({
      id: flag.id,
      title: flag.message,
      href: flagHref(flag, tripBasePath),
      severity: flag.severity,
      source: "flag",
      priority: flag.severity === "warning" ? WARNING_PRIORITY : INFO_PRIORITY,
    });
  }

  // 2. Forward nudges. In final-prep, prep nudges are boosted above info flags.
  const isFinalPrep = phase === "final-prep";
  const push = (
    cond: boolean,
    id: string,
    title: string,
    href: string,
    priority: number,
  ) => {
    if (cond) candidates.push({ id, title, href, severity: "info", source: "nudge", priority });
  };

  push(!nudges.hasDates, "nudge-set-dates", "Set your trip dates to start firming up.", `${tripBasePath}/plan`, 1);
  push(nudges.undatedChapterCount > 0, "nudge-undated-chapters", `Set dates for ${nudges.undatedChapterCount} chapter${nudges.undatedChapterCount === 1 ? "" : "s"}.`, `${tripBasePath}/plan`, 22);
  push(nudges.unbookedTransportCount > 0, "nudge-unbooked-transport", `${nudges.unbookedTransportCount} transport leg${nudges.unbookedTransportCount === 1 ? "" : "s"} have no times yet.`, `${tripBasePath}/plan`, isFinalPrep ? 9 : 20);
  push(!nudges.hasPackingList, "nudge-packing", "Start your packing list.", `${tripBasePath}/checklists`, isFinalPrep ? 6 : 26);
  push(!nudges.hasPretripList, "nudge-pretrip", "Add pre-trip to-dos (visas, insurance, eSIM).", `${tripBasePath}/checklists`, isFinalPrep ? 8 : 28);

  candidates.sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.id.localeCompare(b.id)));

  return candidates.slice(0, limit).map(({ priority: _priority, ...step }) => step);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run lib/next-steps.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/next-steps.ts lib/next-steps.test.ts
git commit -m "feat(home): pure next-steps ranking engine"
```

---

## Task 3: Presentational Home cards

**Files:**
- Create: `components/trip/home/countdown-hero.tsx`
- Create: `components/trip/home/next-steps-card.tsx`
- Create: `components/trip/home/budget-glance.tsx`
- Test: `components/trip/home/countdown-hero.test.tsx`
- Test: `components/trip/home/next-steps-card.test.tsx`

These are dumb presentational components (no data fetching). They take plain props.

- [ ] **Step 1: Write `countdown-hero.tsx`**

```tsx
import { formatDateRange } from "@/lib/dates";
import type { PhaseDescription } from "@/lib/trip-phase";

interface CountdownHeroProps {
  description: PhaseDescription;
  startDate: string | null;
  endDate: string | null;
  /** Visually escalate (final-prep). */
  urgent?: boolean;
}

/** Big "In 26 days" / "Day 5 of 11" hero block at the top of Home. */
export function CountdownHero({ description, startDate, endDate, urgent }: CountdownHeroProps) {
  const range = startDate && endDate ? formatDateRange(startDate, endDate) : null;
  return (
    <section
      className={
        "flex flex-col gap-1 rounded-2xl border p-6 shadow-soft " +
        (urgent ? "border-primary/40 bg-primary/5" : "border-border bg-card")
      }
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {description.label}
      </span>
      <p className="font-display text-3xl font-semibold tracking-tight text-foreground">
        {description.countdown}
      </p>
      {range && <p className="text-sm text-muted-foreground">{range}</p>}
    </section>
  );
}
```

- [ ] **Step 2: Write `next-steps-card.tsx`**

```tsx
import Link from "next/link";
import { AlertTriangle, Info, CheckCircle2, ChevronRight } from "lucide-react";
import type { NextStep } from "@/lib/next-steps";

interface NextStepsCardProps {
  steps: NextStep[];
  /** Link to the full flag list (Summary). Shown when steps were capped. */
  seeAllHref?: string;
}

/** The ranked to-do list. Empty state celebrates being on top of things. */
export function NextStepsCard({ steps, seeAllHref }: NextStepsCardProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft" aria-labelledby="next-steps-heading">
      <h2 id="next-steps-heading" className="mb-3 font-display text-lg font-semibold text-foreground">
        Next steps
      </h2>
      {steps.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
          You&apos;re all set — nothing needs attention right now.
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {steps.map((step) => (
            <li key={step.id}>
              <Link
                href={step.href}
                className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {step.severity === "warning" ? (
                  <AlertTriangle className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
                ) : (
                  <Info className="size-4 shrink-0 text-sky-500" aria-hidden="true" />
                )}
                <span className="flex-1 text-foreground">{step.title}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {seeAllHref && steps.length > 0 && (
        <Link href={seeAllHref} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
          See all in Summary →
        </Link>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Write `budget-glance.tsx`**

```tsx
import Link from "next/link";
import { DollarSign, ArrowRight } from "lucide-react";
import { formatMoney } from "@/lib/money";

interface BudgetGlanceProps {
  estimatedMinor: number;
  actualMinor: number;
  homeCurrency: string;
  href: string;
}

/** Compact estimated/actual budget summary linking to the Budget tab. */
export function BudgetGlance({ estimatedMinor, actualMinor, homeCurrency, href }: BudgetGlanceProps) {
  const hasActual = actualMinor > 0;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft transition-colors hover:bg-muted/40"
    >
      <DollarSign className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="flex flex-1 flex-col">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {hasActual ? "Spent so far" : "Estimated budget"}
        </span>
        <span className="font-mono text-xl font-semibold text-foreground">
          {formatMoney(hasActual ? actualMinor : estimatedMinor, homeCurrency)}
        </span>
        {hasActual && (
          <span className="text-xs text-muted-foreground">
            of {formatMoney(estimatedMinor, homeCurrency)} estimated
          </span>
        )}
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
```

- [ ] **Step 4: Write the render tests**

```tsx
// components/trip/home/countdown-hero.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CountdownHero } from "./countdown-hero";

describe("CountdownHero", () => {
  it("shows the label, countdown and date range", () => {
    render(
      <CountdownHero
        description={{ phase: "planning", label: "Planning", countdown: "In 26 days" }}
        startDate="2026-07-20"
        endDate="2026-07-30"
      />,
    );
    expect(screen.getByText("Planning")).toBeInTheDocument();
    expect(screen.getByText("In 26 days")).toBeInTheDocument();
  });
});
```

```tsx
// components/trip/home/next-steps-card.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NextStepsCard } from "./next-steps-card";

describe("NextStepsCard", () => {
  it("celebrates the empty state", () => {
    render(<NextStepsCard steps={[]} />);
    expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
  });

  it("renders steps as links to their hrefs", () => {
    render(
      <NextStepsCard
        steps={[{ id: "a", title: "No accommodation for Paris.", href: "/trips/t/plan", severity: "warning", source: "flag" }]}
      />,
    );
    const link = screen.getByRole("link", { name: /no accommodation for paris/i });
    expect(link).toHaveAttribute("href", "/trips/t/plan");
  });
});
```

- [ ] **Step 5: Run tests, then typecheck**

Run: `npx vitest run components/trip/home/` then `npx tsc --noEmit`
Expected: tests PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add components/trip/home/countdown-hero.tsx components/trip/home/next-steps-card.tsx components/trip/home/budget-glance.tsx components/trip/home/countdown-hero.test.tsx components/trip/home/next-steps-card.test.tsx
git commit -m "feat(home): presentational countdown/next-steps/budget cards"
```

---

## Task 4: Quick actions (`components/trip/home/quick-actions.tsx`)

**Files:**
- Create: `components/trip/home/quick-actions.tsx`

A client component: a small row of phase-appropriate actions. To keep scope tight, every action is a `Link` with intent (the destination tab already has its own add dialog) — no new dialog wiring. Reuse the `Button` component.

- [ ] **Step 1: Implement `quick-actions.tsx`**

```tsx
"use client";

import Link from "next/link";
import { MapPin, ListChecks, NotebookPen, Receipt, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TripPhase } from "@/lib/trip-phase";

interface QuickAction {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface QuickActionsProps {
  tripId: string;
  phase: TripPhase;
}

function actionsFor(tripId: string, phase: TripPhase): QuickAction[] {
  const base = `/trips/${tripId}`;
  switch (phase) {
    case "sketching":
      return [
        { label: "Add a place", href: `${base}/plan`, icon: MapPin },
        { label: "Wishlist", href: `${base}/wishlist`, icon: Plus },
      ];
    case "travelling":
      return [
        { label: "Journal", href: `${base}/journal`, icon: NotebookPen },
        { label: "Add a cost", href: `${base}/budget`, icon: Receipt },
      ];
    default: // planning | final-prep | past
      return [
        { label: "Add a place", href: `${base}/plan`, icon: MapPin },
        { label: "Add a cost", href: `${base}/budget`, icon: Receipt },
        { label: "Wishlist", href: `${base}/wishlist`, icon: Plus },
        { label: "Checklists", href: `${base}/checklists`, icon: ListChecks },
      ];
  }
}

/** Phase-aware row of quick links onto the relevant tab. */
export function QuickActions({ tripId, phase }: QuickActionsProps) {
  const actions = actionsFor(tripId, phase);
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Button key={a.label} asChild variant="outline" size="sm">
          <Link href={a.href}>
            <a.icon className="size-4" aria-hidden="true" />
            {a.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Confirm `Button` supports `asChild` and `size="sm"` — see `components/ui/button.tsx`; it does.)

- [ ] **Step 3: Commit**

```bash
git add components/trip/home/quick-actions.tsx
git commit -m "feat(home): phase-aware quick actions row"
```

---

## Task 5: Sketching phase (`components/trip/home/phase-sketching.tsx`)

**Files:**
- Create: `components/trip/home/phase-sketching.tsx`

A server component. Shows the shape of the sketch (chapters + rough stops, total rough nights), a prominent "set dates" CTA into the Plan canvas, and quick actions. Reuse `ChapterChip` (`components/trip/chapter-chip.tsx`) and `EmptyState` (`components/ui/empty-state.tsx`).

- [ ] **Step 1: Implement `phase-sketching.tsx`**

```tsx
import Link from "next/link";
import { MapPin, Compass } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ChapterChip } from "@/components/trip/chapter-chip";
import { QuickActions } from "@/components/trip/home/quick-actions";

interface PhaseSketchingProps {
  tripId: string;
  tripName: string;
}

export async function PhaseSketching({ tripId, tripName }: PhaseSketchingProps) {
  const [stops, chapters] = await Promise.all([
    db.stop.findMany({
      where: { tripId },
      orderBy: [{ chapterSortOrder: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, country: true, nights: true, chapterId: true, arriveDate: true },
    }),
    db.chapter.findMany({
      where: { tripId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, colour: true },
    }),
  ]);

  const totalNights = stops.reduce((n, s) => n + (s.nights ?? 0), 0);
  const chapterById = new Map(chapters.map((c) => [c.id, c]));

  if (stops.length === 0) {
    return (
      <EmptyState
        icon={Compass}
        title="Let's shape this trip"
        description="Add a place or a chapter to start sketching. Set dates whenever you're ready."
        action={
          <Button asChild>
            <Link href={`/trips/${tripId}/plan`}>Open the canvas</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sketching</span>
        <p className="font-display text-2xl font-semibold tracking-tight text-foreground">{tripName}</p>
        <p className="text-sm text-muted-foreground">
          {stops.length} place{stops.length === 1 ? "" : "s"} · ~{totalNights} night{totalNights === 1 ? "" : "s"} sketched
        </p>
        <div className="mt-3">
          <Button asChild>
            <Link href={`/trips/${tripId}/plan`}>Set dates / firm up →</Link>
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <h2 className="mb-3 font-display text-lg font-semibold text-foreground">Your shape so far</h2>
        <ul className="flex flex-col gap-2">
          {stops.map((s) => {
            const chapter = s.chapterId ? chapterById.get(s.chapterId) : undefined;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium text-foreground">{s.name}</span>
                {s.country && <span className="text-muted-foreground">{s.country}</span>}
                <span className="text-muted-foreground">~{s.nights ?? 0}n</span>
                {chapter && <ChapterChip name={chapter.name} colour={chapter.colour} />}
              </li>
            );
          })}
        </ul>
      </section>

      <QuickActions tripId={tripId} phase="sketching" />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Confirm `ChapterChip` prop names `name`/`colour` against `components/trip/chapter-chip.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add components/trip/home/phase-sketching.tsx
git commit -m "feat(home): sketching phase"
```

---

## Task 6: Planning + Final-prep phase (`components/trip/home/phase-planning.tsx`)

**Files:**
- Create: `components/trip/home/phase-planning.tsx`

The workhorse. A server component that fetches the trip's planning data, derives flags + next-steps + budget, and lays out the cards. The module order changes for `final-prep` (the next-steps card with boosted prep nudges and the countdown lead; quick actions follow). This task reuses: `detectFlags` + the `Flag*` input types (`lib/flags.ts`), `buildBudget` + budget input types (`lib/budget.ts`), `buildNextSteps` (Task 2), `describePhase` (Task 1), the cards (Task 3), `QuickActions` (Task 4), and `RouteMapLoader` + `RouteMapStop` (`components/trip/route-map-loader.tsx`, `components/trip/route-map.tsx`).

> **Reference for the data fetch + budget/flags assembly:** `app/(app)/trips/[tripId]/summary/page.tsx` does exactly this assembly (FX rate map, `buildBudget`, `detectFlags`, `mapStops` for the route map). Mirror its query shapes and the `costsWithRates`/`datedStops`/`datedChapters` derivations. Do **not** duplicate the per-stop itinerary rendering — Home only needs the route map, the budget grand total, the flags, and the nudge counts.

- [ ] **Step 1: Implement `phase-planning.tsx`**

```tsx
import { db } from "@/lib/db";
import { todayISO } from "@/lib/dates";
import { describePhase, type TripPhase } from "@/lib/trip-phase";
import { detectFlags, type FlagStop, type FlagTransport, type FlagAccommodation, type FlagItem } from "@/lib/flags";
import { buildBudget, type BudgetCost, type BudgetStopWithDates, type BudgetItem, type BudgetAccommodation, type BudgetTransport } from "@/lib/budget";
import { buildNextSteps } from "@/lib/next-steps";
import { chapterForStop } from "@/lib/chapters";
import { chapterColourSwatch } from "@/lib/chapter-colours";
import { CountdownHero } from "@/components/trip/home/countdown-hero";
import { NextStepsCard } from "@/components/trip/home/next-steps-card";
import { BudgetGlance } from "@/components/trip/home/budget-glance";
import { QuickActions } from "@/components/trip/home/quick-actions";
import { RouteMapLoader as RouteMap } from "@/components/trip/route-map-loader";
import type { RouteMapStop } from "@/components/trip/route-map";

const COST_SELECT = {
  id: true, estimatedMinor: true, actualMinor: true, currency: true,
  rateToHome: true, ownerType: true, ownerId: true, label: true, category: true,
} as const;

interface PhasePlanningProps {
  tripId: string;
  trip: { id: string; name: string; startDate: string | null; endDate: string | null; homeCurrency: string };
  today: string;
  phase: TripPhase; // "planning" | "final-prep"
}

export async function PhasePlanning({ tripId, trip, today, phase }: PhasePlanningProps) {
  const base = `/trips/${tripId}`;
  // Phase implies a start date exists; end falls back to start for windows.
  const startDate = trip.startDate!;
  const endDate = trip.endDate ?? startDate;
  const homeCurrency = trip.homeCurrency;

  const [datedStopsRaw, roughStops, transports, accommodations, items, costs, exchangeRates, datedChaptersRaw, undatedChapterCount, packingCount, pretripCount] =
    await Promise.all([
      db.stop.findMany({ where: { tripId, arriveDate: { not: null } }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, country: true, lat: true, lng: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true } }),
      db.stop.count({ where: { tripId, arriveDate: null } }),
      db.transport.findMany({ where: { tripId }, orderBy: { sortOrder: "asc" }, select: { id: true, mode: true, fromStopId: true, toStopId: true, depAt: true, arrAt: true } }),
      db.accommodation.findMany({ where: { tripId }, select: { id: true, stopId: true, name: true, checkIn: true, checkOut: true } }),
      db.item.findMany({ where: { tripId }, select: { id: true, stopId: true, category: true, date: true, startTime: true, endTime: true } }),
      db.cost.findMany({ where: { tripId }, orderBy: { createdAt: "asc" }, select: COST_SELECT }),
      db.exchangeRate.findMany({ where: { tripId }, select: { base: true, quote: true, rate: true } }),
      db.chapter.findMany({ where: { tripId, startDate: { not: null } }, orderBy: { startDate: "asc" }, select: { id: true, name: true, colour: true, startDate: true, endDate: true } }),
      db.chapter.count({ where: { tripId, startDate: null } }),
      db.checklistItem.count({ where: { tripId, kind: "PACKING" } }),
      db.checklistItem.count({ where: { tripId, kind: "PRETRIP" } }),
    ]);

  // FX rate map (mirrors summary page).
  const rateMap = new Map<string, number>();
  for (const r of exchangeRates) {
    rateMap.set(`${r.base}:${r.quote}`, r.rate);
    if (r.rate !== 0) rateMap.set(`${r.quote}:${r.base}`, 1 / r.rate);
  }
  const costsWithRates: BudgetCost[] = costs.map((c) => {
    let rateToHome = c.rateToHome ?? null;
    if (rateToHome === null && c.currency.toUpperCase() !== homeCurrency.toUpperCase()) {
      rateToHome = rateMap.get(`${c.currency.toUpperCase()}:${homeCurrency.toUpperCase()}`) ?? null;
    }
    return { ...c, rateToHome } as BudgetCost;
  });

  const datedStops = datedStopsRaw.map((s) => ({ ...s, arriveDate: s.arriveDate!, departDate: s.departDate! }));
  const datedChapters = datedChaptersRaw.map((c) => ({ ...c, startDate: c.startDate!, endDate: c.endDate! }));

  const budget = buildBudget({
    homeCurrency,
    costs: costsWithRates,
    stops: datedStops.map((s) => ({ id: s.id, name: s.name, timezone: s.timezone, arriveDate: s.arriveDate, departDate: s.departDate, sortOrder: s.sortOrder })) as BudgetStopWithDates[],
    items: items as BudgetItem[],
    accommodations: accommodations as BudgetAccommodation[],
    transports: transports as BudgetTransport[],
    tripStart: startDate,
    tripEnd: endDate,
    chapters: datedChapters,
  });

  const flags = detectFlags({
    stops: datedStops as FlagStop[],
    transports: transports as FlagTransport[],
    accommodations: accommodations as FlagAccommodation[],
    items: items as FlagItem[],
    tripStart: startDate,
    tripEnd: endDate,
    roughStopCount: roughStops,
  });

  const steps = buildNextSteps({
    flags,
    phase,
    nudges: {
      hasDates: true,
      undatedChapterCount,
      hasPackingList: packingCount > 0,
      hasPretripList: pretripCount > 0,
      unbookedTransportCount: transports.filter((t) => !t.depAt).length,
    },
    tripBasePath: base,
  });

  const description = describePhase({ startDate: trip.startDate, endDate: trip.endDate, today });
  const mapStops: RouteMapStop[] = datedStops.map((s) => {
    const ch = chapterForStop(s, datedChapters);
    return { id: s.id, name: s.name, lat: s.lat, lng: s.lng, arriveDate: s.arriveDate, departDate: s.departDate, chapterColour: ch ? chapterColourSwatch(ch.colour) : null, chapterName: ch?.name ?? null };
  });

  const hero = <CountdownHero key="hero" description={description} startDate={trip.startDate} endDate={trip.endDate} urgent={phase === "final-prep"} />;
  const nextSteps = <NextStepsCard key="steps" steps={steps} seeAllHref={`${base}/summary`} />;
  const actions = <div key="actions"><QuickActions tripId={tripId} phase={phase} /></div>;
  const money = <BudgetGlance key="budget" estimatedMinor={budget.grandTotal.estimatedMinor} actualMinor={budget.grandTotal.actualMinor} homeCurrency={homeCurrency} href={`${base}/budget`} />;
  const route = mapStops.length > 0 ? (
    <section key="route" className="rounded-2xl border border-border bg-card p-2 shadow-soft">
      <RouteMap stops={mapStops} height={280} />
    </section>
  ) : null;

  // Final prep leads with next steps (boosted prep nudges); planning leads with the budget/route glance.
  const order = phase === "final-prep"
    ? [hero, nextSteps, actions, money, route]
    : [hero, nextSteps, money, route, actions];

  return <div className="flex flex-col gap-6">{order}</div>;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If any budget/flags input type names differ, open `lib/budget.ts` / `lib/flags.ts` and align — do not invent fields.

- [ ] **Step 3: Commit**

```bash
git add components/trip/home/phase-planning.tsx
git commit -m "feat(home): planning + final-prep phase"
```

---

## Task 7: Travelling phase (`components/trip/home/phase-travelling.tsx`)

**Files:**
- Create: `components/trip/home/phase-travelling.tsx`
- Reference: `app/(app)/trips/[tripId]/today/page.tsx` (the source to port)

The live view. **Port the entire body of `today/page.tsx`** (from the `requireTripAccess`/trip fetch through the returned JSX, including the `buildTransportLabel` helper) into an exported `async function PhaseTravelling({ tripId }: { tripId: string })`. Changes from the original:

1. Drop the `params`/`requireTripAccess` lines (the Home router already guarded access) — fetch the trip dates directly.
2. Keep the date-less guard for safety (it won't trigger in this phase, but it keeps the port faithful and type-narrowing simple).
3. Add a "Day X of N · phase" context is **not** needed — keep the existing "Day {dayNum}" + chapter line.

- [ ] **Step 1: Create `phase-travelling.tsx` by porting Today**

Copy `today/page.tsx` verbatim into `components/trip/home/phase-travelling.tsx`, then apply this diff to the top:

```tsx
// REMOVE the default export signature:
//   export default async function TodayPage({ params }: { params: Promise<{ tripId: string }> }) {
//     const { tripId } = await params;
//     await requireTripAccess(tripId);
// REPLACE with:
export async function PhaseTravelling({ tripId }: { tripId: string }) {
```

Remove the now-unused `requireTripAccess` import. Leave everything else (data fetch, `buildItinerary`, `pickDayPlan`, the JSX, the `buildTransportLabel` helper at the bottom) unchanged.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. Remove any import that became unused (lint will flag them).

- [ ] **Step 3: Commit**

```bash
git add components/trip/home/phase-travelling.tsx
git commit -m "feat(home): travelling phase (ported from Today)"
```

---

## Task 8: Past phase (`components/trip/home/phase-past.tsx`)

**Files:**
- Create: `components/trip/home/phase-past.tsx`

A server component: a wrap-up. Final actual (or estimated) spend, nights/stops totals, the route recap map, a nudge to finish the Journal, and a "plan another trip" link. Reuse `buildBudget` the same way as Task 6 (you may copy the FX/budget assembly), `nightsBetween`, `RouteMap`.

- [ ] **Step 1: Implement `phase-past.tsx`**

```tsx
import Link from "next/link";
import { NotebookPen, PlaneTakeoff } from "lucide-react";
import { db } from "@/lib/db";
import { nightsBetween } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { buildBudget, type BudgetCost, type BudgetStopWithDates, type BudgetItem, type BudgetAccommodation, type BudgetTransport } from "@/lib/budget";
import { chapterForStop } from "@/lib/chapters";
import { chapterColourSwatch } from "@/lib/chapter-colours";
import { Button } from "@/components/ui/button";
import { RouteMapLoader as RouteMap } from "@/components/trip/route-map-loader";
import type { RouteMapStop } from "@/components/trip/route-map";

const COST_SELECT = {
  id: true, estimatedMinor: true, actualMinor: true, currency: true,
  rateToHome: true, ownerType: true, ownerId: true, label: true, category: true,
} as const;

interface PhasePastProps {
  tripId: string;
  trip: { id: string; name: string; startDate: string | null; endDate: string | null; homeCurrency: string };
}

export async function PhasePast({ tripId, trip }: PhasePastProps) {
  const base = `/trips/${tripId}`;
  const startDate = trip.startDate!;
  const endDate = trip.endDate ?? startDate;
  const homeCurrency = trip.homeCurrency;

  const [datedStopsRaw, transports, accommodations, items, costs, exchangeRates, datedChaptersRaw, journalCount] = await Promise.all([
    db.stop.findMany({ where: { tripId, arriveDate: { not: null } }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, lat: true, lng: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true } }),
    db.transport.findMany({ where: { tripId }, select: { id: true, mode: true, fromStopId: true, toStopId: true, depAt: true, arrAt: true } }),
    db.accommodation.findMany({ where: { tripId }, select: { id: true, stopId: true, name: true, checkIn: true, checkOut: true } }),
    db.item.findMany({ where: { tripId }, select: { id: true, stopId: true, category: true, date: true, startTime: true, endTime: true } }),
    db.cost.findMany({ where: { tripId }, orderBy: { createdAt: "asc" }, select: COST_SELECT }),
    db.exchangeRate.findMany({ where: { tripId }, select: { base: true, quote: true, rate: true } }),
    db.chapter.findMany({ where: { tripId, startDate: { not: null } }, orderBy: { startDate: "asc" }, select: { id: true, name: true, colour: true, startDate: true, endDate: true } }),
    db.journalEntry.count({ where: { tripId } }),
  ]);

  const rateMap = new Map<string, number>();
  for (const r of exchangeRates) {
    rateMap.set(`${r.base}:${r.quote}`, r.rate);
    if (r.rate !== 0) rateMap.set(`${r.quote}:${r.base}`, 1 / r.rate);
  }
  const costsWithRates: BudgetCost[] = costs.map((c) => {
    let rateToHome = c.rateToHome ?? null;
    if (rateToHome === null && c.currency.toUpperCase() !== homeCurrency.toUpperCase()) {
      rateToHome = rateMap.get(`${c.currency.toUpperCase()}:${homeCurrency.toUpperCase()}`) ?? null;
    }
    return { ...c, rateToHome } as BudgetCost;
  });

  const datedStops = datedStopsRaw.map((s) => ({ ...s, arriveDate: s.arriveDate!, departDate: s.departDate! }));
  const datedChapters = datedChaptersRaw.map((c) => ({ ...c, startDate: c.startDate!, endDate: c.endDate! }));

  const budget = buildBudget({
    homeCurrency, costs: costsWithRates,
    stops: datedStops.map((s) => ({ id: s.id, name: s.name, timezone: s.timezone, arriveDate: s.arriveDate, departDate: s.departDate, sortOrder: s.sortOrder })) as BudgetStopWithDates[],
    items: items as BudgetItem[], accommodations: accommodations as BudgetAccommodation[], transports: transports as BudgetTransport[],
    tripStart: startDate, tripEnd: endDate, chapters: datedChapters,
  });

  const totalNights = nightsBetween(startDate, endDate);
  const hasActual = budget.grandTotal.actualMinor > 0;
  const mapStops: RouteMapStop[] = datedStops.map((s) => {
    const ch = chapterForStop(s, datedChapters);
    return { id: s.id, name: s.name, lat: s.lat, lng: s.lng, arriveDate: s.arriveDate, departDate: s.departDate, chapterColour: ch ? chapterColourSwatch(ch.colour) : null, chapterName: ch?.name ?? null };
  });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">That&apos;s a wrap</span>
        <p className="font-display text-2xl font-semibold tracking-tight text-foreground">{trip.name}</p>
        <p className="text-sm text-muted-foreground">
          {datedStops.length} stop{datedStops.length === 1 ? "" : "s"} · {totalNights} night{totalNights === 1 ? "" : "s"} · {formatMoney(hasActual ? budget.grandTotal.actualMinor : budget.grandTotal.estimatedMinor, homeCurrency)} {hasActual ? "spent" : "estimated"}
        </p>
      </section>

      {mapStops.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-2 shadow-soft">
          <RouteMap stops={mapStops} height={280} />
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href={`${base}/journal`}>
            <NotebookPen className="size-4" aria-hidden="true" />
            {journalCount === 0 ? "Write your first journal entry" : "Finish your journal"}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/trips/new">
            <PlaneTakeoff className="size-4" aria-hidden="true" />
            Plan another trip
          </Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Confirm the journal model is `journalEntry` in `prisma/schema.prisma` — it is, `model JournalEntry`.)

- [ ] **Step 3: Commit**

```bash
git add components/trip/home/phase-past.tsx
git commit -m "feat(home): past phase wrap-up"
```

---

## Task 9: Move the canvas to `/plan` and wire the Home router

**Files:**
- Create: `app/(app)/trips/[tripId]/plan/page.tsx`
- Modify: `app/(app)/trips/[tripId]/page.tsx`
- Modify: `app/(app)/trips/[tripId]/today/page.tsx`

- [ ] **Step 1: Move the canvas to `/plan`**

Create `app/(app)/trips/[tripId]/plan/page.tsx` containing the **current full contents** of `app/(app)/trips/[tripId]/page.tsx` (the `TripOverviewPage` — the `ItineraryManager` data fetch and render). Rename the function to `TripPlanPage`. No other changes.

- [ ] **Step 2: Replace `page.tsx` with the Home router**

Overwrite `app/(app)/trips/[tripId]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { todayISO } from "@/lib/dates";
import { computeTripPhase } from "@/lib/trip-phase";
import { PhaseSketching } from "@/components/trip/home/phase-sketching";
import { PhasePlanning } from "@/components/trip/home/phase-planning";
import { PhaseTravelling } from "@/components/trip/home/phase-travelling";
import { PhasePast } from "@/components/trip/home/phase-past";

export default async function TripHomePage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { id: true, name: true, startDate: true, endDate: true, homeCurrency: true },
  });
  if (!trip) notFound();

  const today = todayISO();
  const phase = computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today });

  switch (phase) {
    case "sketching":
      return <PhaseSketching tripId={tripId} tripName={trip.name} />;
    case "travelling":
      return <PhaseTravelling tripId={tripId} />;
    case "past":
      return <PhasePast tripId={tripId} trip={trip} />;
    default: // planning | final-prep
      return <PhasePlanning tripId={tripId} trip={trip} today={today} phase={phase} />;
  }
}
```

- [ ] **Step 3: Redirect the old Today route**

Overwrite `app/(app)/trips/[tripId]/today/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

/** The Today view is now the Travelling phase of the trip Home. */
export default async function TodayRedirect({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  redirect(`/trips/${tripId}`);
}
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npx next build`
Expected: all clean. The Home renders per phase; `/plan` shows the canvas; `/today` redirects.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/trips/[tripId]/page.tsx" "app/(app)/trips/[tripId]/plan/page.tsx" "app/(app)/trips/[tripId]/today/page.tsx"
git commit -m "feat(home): wire adaptive Home router, move canvas to /plan, redirect Today"
```

---

## Task 10: Desktop nav — primary + "More" dropdown

**Files:**
- Modify: `components/trip/trip-nav.tsx`
- Create: `components/trip/nav-more-menu.tsx`
- Reference: `components/ui/dropdown-menu.tsx`

The nav must: land label "Overview" → **Home** (href `base`); add **Plan** (href `${base}/plan`); remove **Today**; keep the active-underline behaviour. Split into a `PRIMARY` set rendered as tabs and a `MORE` set rendered in a dropdown. Hide the bottom-bar concern here (Task 11 adds mobile). For now the desktop nav row is `hidden md:flex` and the dropdown shows on desktop.

- [ ] **Step 1: Define the shared nav model in `trip-nav.tsx`**

Replace the `navItems` function and `NavItem` interface with an exported model both desktop and mobile reuse:

```tsx
export interface NavItem {
  label: string;
  href: string;
}

export function primaryNav(tripId: string): NavItem[] {
  const base = `/trips/${tripId}`;
  return [
    { label: "Home", href: base },
    { label: "Plan", href: `${base}/plan` },
    { label: "Calendar", href: `${base}/calendar` },
    { label: "Budget", href: `${base}/budget` },
    { label: "Summary", href: `${base}/summary` },
  ];
}

export function moreNav(tripId: string): NavItem[] {
  const base = `/trips/${tripId}`;
  return [
    { label: "Wishlist", href: `${base}/wishlist` },
    { label: "Journal", href: `${base}/journal` },
    { label: "Checklists", href: `${base}/checklists` },
    { label: "Files", href: `${base}/files` },
    { label: "Settings", href: `${base}/settings` },
  ];
}

/** Exact-match for Home (base), prefix-match for everything else. */
export function isNavActive(href: string, pathname: string, base: string): boolean {
  if (href === base) return pathname === base;
  return pathname === href || pathname.startsWith(href + "/");
}
```

- [ ] **Step 2: Render desktop nav (primary tabs + More dropdown)**

Update the `TripNav` component body so the `<nav>` row is `hidden md:flex` and renders `primaryNav` tabs (reusing the existing active-underline markup) followed by `<NavMoreMenu tripId={tripId} />`. Keep `usePathname`. The base is `/trips/${tripId}`. Use `isNavActive` for the underline.

- [ ] **Step 3: Implement `nav-more-menu.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { moreNav, isNavActive } from "@/components/trip/trip-nav";
import { cn } from "@/lib/cn";

export function NavMoreMenu({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const base = `/trips/${tripId}`;
  const items = moreNav(tripId);
  const anyActive = items.some((i) => isNavActive(i.href, pathname, base));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex shrink-0 items-center gap-1 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          anyActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/80",
        )}
      >
        More
        <ChevronDown className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. Confirm `dropdown-menu.tsx` exports `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` and that `DropdownMenuItem` accepts `asChild` (align to the file's real API; adjust if names differ).

- [ ] **Step 5: Commit**

```bash
git add components/trip/trip-nav.tsx components/trip/nav-more-menu.tsx
git commit -m "feat(nav): desktop primary tabs + More dropdown; Home/Plan, drop Today"
```

---

## Task 11: Mobile bottom tab bar + "More" sheet

**Files:**
- Create: `components/trip/mobile-tab-bar.tsx`
- Modify: `app/(app)/trips/[tripId]/layout.tsx`
- Reference: `components/ui/sheet.tsx`

A fixed bottom bar on mobile only (`md:hidden`) with Home, Plan, Calendar, Budget, and a "More" button that opens a sheet containing `moreNav` + Summary. Add bottom padding to the trip layout so content clears the bar.

- [ ] **Step 1: Implement `mobile-tab-bar.tsx`**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map, CalendarDays, Wallet, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { moreNav, isNavActive } from "@/components/trip/trip-nav";
import { cn } from "@/lib/cn";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, Plan: Map, Calendar: CalendarDays, Budget: Wallet,
};

export function MobileTabBar({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const base = `/trips/${tripId}`;
  const [open, setOpen] = React.useState(false);

  const primary = [
    { label: "Home", href: base },
    { label: "Plan", href: `${base}/plan` },
    { label: "Calendar", href: `${base}/calendar` },
    { label: "Budget", href: `${base}/budget` },
  ];
  // Summary lives under More on mobile.
  const more = [{ label: "Summary", href: `${base}/summary` }, ...moreNav(tripId)];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 backdrop-blur md:hidden" aria-label="Trip sections">
      {primary.map((item) => {
        const Icon = ICONS[item.label] ?? Home;
        const active = isNavActive(item.href, pathname, base);
        return (
          <Link key={item.href} href={item.href} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-xs", active ? "text-primary" : "text-muted-foreground")} aria-current={active ? "page" : undefined}>
            <Icon className="size-5" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-muted-foreground">
          <Menu className="size-5" aria-hidden="true" />
          More
        </SheetTrigger>
        <SheetContent side="bottom">
          <div className="flex flex-col gap-1 p-2">
            {more.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50">
                {item.label}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
```

- [ ] **Step 2: Mount it in the trip layout**

In `app/(app)/trips/[tripId]/layout.tsx`: import `MobileTabBar`; render `<MobileTabBar tripId={tripId} />` just before the closing wrapper `</div>`; add `pb-20 md:pb-0` to the page-content wrapper (`<div className="py-6">`) so content clears the fixed bar.

- [ ] **Step 3: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npx next build`
Expected: clean. Confirm `sheet.tsx` exports `Sheet`, `SheetTrigger`, `SheetContent` and that `SheetContent` accepts `side="bottom"` (align to its real API).

- [ ] **Step 4: Commit**

```bash
git add components/trip/mobile-tab-bar.tsx "app/(app)/trips/[tripId]/layout.tsx"
git commit -m "feat(nav): mobile bottom tab bar + More sheet"
```

---

## Task 12: Trips list — phase badges + sort

**Files:**
- Modify: `components/trip/trip-card.tsx`
- Modify: `app/(app)/trips/page.tsx`
- Test: `components/trip/trip-card.test.tsx` (create)

- [ ] **Step 1: Add a phase badge to `TripCard`**

Add a `phase?: PhaseDescription` prop (import `PhaseDescription` from `@/lib/trip-phase`). When present, render its `label`/`countdown` as a small badge overlaid on the gradient cover. Concretely:

- Add to `TripCardProps`: `phase?: import("@/lib/trip-phase").PhaseDescription;`
- Inside the gradient cover `<div>`, when `phase` is set, add an absolutely-positioned chip:

```tsx
{phase && (
  <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-soft">
    {phase.phase === "travelling" || phase.phase === "past" ? phase.countdown : `${phase.label} · ${phase.countdown}`}
  </span>
)}
```

(Make the cover `relative`.) Keep the existing date range / stop count row unchanged.

- [ ] **Step 2: Compute phase + sort in the trips page**

In `app/(app)/trips/page.tsx`:
- Import `describePhase`, `compareForTripList` from `@/lib/trip-phase` and `todayISO` from `@/lib/dates`.
- After mapping `memberships` to `trips`, sort: `const today = todayISO(); const sorted = [...trips].sort((a, b) => compareForTripList(a, b, today));`
- Pass `phase={describePhase({ startDate: trip.startDate, endDate: trip.endDate, today })}` to each `TripCard`, iterating `sorted` instead of `trips`.

> `trip.createdAt` is needed by `compareForTripList`. The existing query already `include`s the trip; add `createdAt: true` to the trip selection if it isn't present (Prisma includes scalar fields by default with `include`, so `trip.createdAt` is available — verify and don't over-select).

- [ ] **Step 3: Write the trip-card test**

```tsx
// components/trip/trip-card.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripCard } from "./trip-card";

describe("TripCard", () => {
  it("shows a phase badge when provided", () => {
    render(
      <TripCard
        id="t" name="Europe" startDate="2026-07-20" endDate="2026-07-30" stopCount={3}
        phase={{ phase: "planning", label: "Planning", countdown: "In 26 days" }}
      />,
    );
    expect(screen.getByText(/planning · in 26 days/i)).toBeInTheDocument();
  });

  it("shows only the countdown for travelling trips", () => {
    render(
      <TripCard
        id="t" name="Europe" startDate="2026-06-20" endDate="2026-06-30" stopCount={3}
        phase={{ phase: "travelling", label: "Travelling", countdown: "Day 5 of 11" }}
      />,
    );
    expect(screen.getByText("Day 5 of 11")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `npx vitest run components/trip/trip-card.test.tsx && npx tsc --noEmit && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add components/trip/trip-card.tsx components/trip/trip-card.test.tsx "app/(app)/trips/page.tsx"
git commit -m "feat(trips): phase badge + active-first ordering on the trips list"
```

---

## Task 13: Full-suite gate + cleanup

**Files:** none (verification).

- [ ] **Step 1: Full typecheck, lint, test, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npx next build`
Expected: 0 type errors, lint clean, all tests pass (existing 1013 + the new lib/component tests), build succeeds.

- [ ] **Step 2: Grep for stragglers**

Run: `grep -rn "/today" app components --include=*.tsx`
Expected: any remaining links to `/today` (e.g. inside the ported travelling view's quick links, or elsewhere) should point at real destinations. The ported travelling view's quick links to `/day/...` and `/calendar` are fine. Fix any nav/link that still assumes a Today tab.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "chore(home): full-suite green + remove stale Today links"
```

---

## Self-Review

**1. Spec coverage**
- Adaptive Home with 5 phases → Tasks 5–9 (sketching/planning/final-prep/travelling/past + router). ✓
- Phase detection (start date switch, 14-day final-prep window, end→start fallback) → Task 1. ✓
- Home absorbs Today; Today tab removed; `/today` redirects; `day/[date]` stays → Tasks 7, 9, 10. ✓
- "Next steps" = flags + nudges, ranked, phase-aware, deep-linking → Task 2, used in Task 6. ✓
- Phase-aware quick actions on Home → Task 4, used in Tasks 5/6. ✓
- Canvas → "Plan" tab → Task 9. ✓
- Nav: primary (Home/Plan/Calendar/Budget/Summary) + More; mobile bottom bar + sheet → Tasks 10, 11. ✓
- Trips list: phase badge + active-first sort → Task 12. ✓
- Out of scope (global quick-add, ⌘K, grouped nav, richer cards, activity feed) → not built. ✓

**2. Placeholder scan** — no TODO/TBD; every code step has complete code or an exact port instruction with the source file named.

**3. Type consistency** — `TripPhase` and `PhaseDescription` (Task 1) are reused verbatim in Tasks 3/4/6/12. `NextStep`/`NudgeInput` (Task 2) reused in Tasks 3/6. `RouteMapStop` shape matches `summary/page.tsx`. Flag/budget input types are imported from their source modules, not redefined. Phase-component prop shapes match the Home router's call sites in Task 9 (`PhaseSketching{tripId,tripName}`, `PhasePlanning{tripId,trip,today,phase}`, `PhaseTravelling{tripId}`, `PhasePast{tripId,trip}`).

> **Note for implementers:** UI library prop names (`DropdownMenuItem asChild`, `SheetContent side`, `Button asChild/size`) are asserted from the components' existing usage but **verify against the actual files** before relying on them; if an API differs, adapt the call — do not change the UI primitives.
