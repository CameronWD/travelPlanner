# Trips Page Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/trips` index with the handoff's one-screen layout: a trip carousel with generated polaroid covers, a travels map with per-trip colours, a Planned/Been tally, a first-run state, mobile chrome, and the shell tweaks that go with it.

**Architecture:** Pure helpers in `lib/trips/` (status, colour, route sketch, tally) are unit-tested first; Server Components compose them; only the carousel, map, tally toggle, first-trip form and cover uploader are client islands. The old trips-list card, stats tiles, route render and monogram are deleted, not kept beside the new code.

**Tech Stack:** Next.js 16.3 App Router (read `node_modules/next/dist/docs/01-app/` before touching routes, actions or `cookies()`), React 19, Tailwind v4 tokens in `app/globals.css`, shadcn/Radix in `components/ui/`, lucide-react, Leaflet via `createMapLoader`, Prisma, vitest + Testing Library (jsdom, colocated `*.test.tsx`, `TZ=UTC`).

**Spec:** `docs/specs/2026-09-28-trips-page-carousel.md` (decisions D1–D6, P1–P10) and the handoff `design_handoff/trips-page-carousel-handoff/` (`TRIPS_PAGE.md`, `TRIP_COVER.md`) for every pixel, copy string and token. The spec wins where the two differ.

## Global Constraints

- Tokens only, never raw hex in components. Hex is allowed only in `app/globals.css` and `lib/map-palette.ts`.
- Repo token names, not handoff names: `bg-background` (paper), `bg-card` (white), `bg-canvas` (#EFE9DF), `border-border` (ink), `border-border-soft`, `shadow-hard-1/2/3` (3/4/5px), `bg-coral`, `bg-sun`, `bg-teal`, `bg-lilac`, `text-muted-foreground`, `text-on-accent-muted`, `bg-primary text-primary-foreground` (ink fill, paper text).
- 2px ink borders and hard offset shadows; Bricolage 800 (`font-display font-extrabold`) for headings and numbers; Plus Jakarta Sans (`font-sans`) for everything else.
- Every label, chip and pill is `whitespace-nowrap shrink-0`.
- Touch targets ≥ 44px. Respect `prefers-reduced-motion` (`motion-safe:` utilities; `behavior: "auto"` scrolls under reduced motion).
- Dates go through `lib/dates.ts` helpers (`formatDateRangeCompact`, `formatDayLabel`, `formatMonthYear`); never ISO on screen.
- Sleeps and phases use the trip's own today: `tripTodayISO(stops)` from `lib/trip-today.ts`.
- Server Components by default; `"use client"` only where the task says.
- Commit after every task on the branch `feat/trips-page-carousel-2026-09-28`. Never touch `main`. Every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Verify per task with `npx vitest run <paths>`; the final task runs `npm test`, `npm run lint`, `npx tsc --noEmit`.

## Review Focus

1. **A trip whose only dated stop is in the past but whose trip dates are unset** must be Idea, never Done. (Task 2 test: `cardKind("sketching", false) === "idea"`.)
2. **Two stops in the same city (≤ 5 km apart)** must fall back to the stamp, not draw a degenerate sketch. (Task 3 test "same-city returns null".)
3. **A trip with more than eight trips in the account** must still get a colour (wrap the ramp), never `undefined`. (Task 1 test "wraps after eight".)
4. **A cookie naming a trip the viewer no longer belongs to** must fall back to the up-next trip, not render a "Back to" a foreign trip. (Task 11 test "ignores a cookie for an unknown trip".)
5. **A first-trip name of only whitespace** must keep the button disabled and never call the action. (Task 8 test "whitespace keeps the button disabled".)

---

### Task 1: Tokens, map fill and per-trip colour

**Files:**
- Modify: `app/globals.css` (light block after `--hue-stone-text`, dark block after its `--hue-stone-text`, `@theme inline` block after `--color-hue-stone-text`)
- Modify: `lib/map-palette.ts`
- Create: `lib/trips/trip-colour.ts`
- Test: `lib/trips/trip-colour.test.ts`, `lib/map-palette.test.ts` (append)

**Interfaces:**
- Produces: `assignTripHues(trips: { id: string; createdAt: Date }[]): Map<string, Hue>`; `TRIP_HUE_RAMP: readonly Hue[]`; `hueInkHex(hue: Hue, dark?: boolean): string`; `MAP_FILL: { light: string; dark: string }`; CSS tokens `--status-neutral`, `--map-fill`, `--hue-{hue}-ink` and Tailwind colours `bg-status-neutral`, `bg-map-fill`, `text-hue-coral-ink` etc.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/trips/trip-colour.test.ts
import { describe, it, expect } from "vitest";
import { assignTripHues, TRIP_HUE_RAMP } from "./trip-colour";

const t = (id: string, iso: string) => ({ id, createdAt: new Date(iso) });

describe("assignTripHues", () => {
  it("hands out the ramp in createdAt order, coral first", () => {
    const hues = assignTripHues([t("b", "2026-02-01"), t("a", "2026-01-01"), t("c", "2026-03-01")]);
    expect(hues.get("a")).toBe("coral");
    expect(hues.get("b")).toBe("teal");
    expect(hues.get("c")).toBe("leaf");
  });
  it("is stable however the input is ordered", () => {
    const x = assignTripHues([t("a", "2026-01-01"), t("b", "2026-02-01")]);
    const y = assignTripHues([t("b", "2026-02-01"), t("a", "2026-01-01")]);
    expect([...x.entries()]).toEqual([...y.entries()].sort());
  });
  it("wraps after eight", () => {
    const trips = Array.from({ length: 9 }, (_, i) => t(`t${i}`, `2026-01-0${i + 1}`.slice(0, 10)));
    const hues = assignTripHues(trips);
    expect(hues.get("t8")).toBe(TRIP_HUE_RAMP[0]);
    expect(hues.size).toBe(9);
  });
  it("never uses stone", () => {
    expect(TRIP_HUE_RAMP).not.toContain("stone");
    expect(TRIP_HUE_RAMP).toHaveLength(8);
  });
});
```

Append to `lib/map-palette.test.ts`:

```ts
import { hueInkHex, MAP_FILL } from "./map-palette";

describe("hueInkHex", () => {
  it("returns the handoff's ink shades for coral and teal", () => {
    expect(hueInkHex("coral")).toBe("#B8391D");
    expect(hueInkHex("teal")).toBe("#2E8A88");
  });
  it("has a value for every hue in both themes", () => {
    for (const h of ["sky", "sun", "leaf", "lilac", "pink", "teal", "coral", "indigo", "stone"] as const) {
      expect(hueInkHex(h, false)).toMatch(/^#[0-9A-F]{6}$/i);
      expect(hueInkHex(h, true)).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
  it("exposes the map fill", () => {
    expect(MAP_FILL.light).toBe("#EAF3F2");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/trips/trip-colour.test.ts lib/map-palette.test.ts`
Expected: FAIL — module `./trip-colour` not found; `hueInkHex` is not exported.

- [ ] **Step 3: Add the tokens to `app/globals.css`**

In the light block (`[data-theme="light"], :root`), directly after `--hue-stone-text: 39 21% 40%; /* #7C6D51 */`:

```css
  /* Dark ink shade per ramp hue: passport-stamp ink on paper, ≥ 4.5:1 (TRIP_COVER.md §4). */
  --hue-sky-ink: 195 70% 30%; /* #17697F */
  --hue-sun-ink: 43 79% 28%; /* #80600F */
  --hue-leaf-ink: 82 78% 24%; /* #486B0D */
  --hue-lilac-ink: 262 47% 44%; /* #5E3AA5 */
  --hue-pink-ink: 335 40% 44%; /* #9D4469 */
  --hue-teal-ink: 179 50% 36%; /* #2E8A88 */
  --hue-coral-ink: 11 73% 42%; /* #B8391D */
  --hue-indigo-ink: 232 58% 52%; /* #4557C9 */
  --hue-stone-ink: 39 21% 36%; /* #6F6249 */
  /* Neutral grey pill fill (TRIPS_PAGE.md tokens) and the travels map ground. */
  --status-neutral: 41 23% 86%; /* #E4DFD4 */
  --map-fill: 173 31% 94%; /* #EAF3F2 */
```

In the `.dark` block, after its `--hue-stone-text` line:

```css
  --hue-sky-ink: 198 47% 69%; /* #8CC0D6 */
  --hue-sun-ink: 42 68% 69%; /* #E6C57A */
  --hue-leaf-ink: 89 39% 63%; /* #A1C57A */
  --hue-lilac-ink: 259 53% 76%; /* #B5A0E2 */
  --hue-pink-ink: 338 58% 76%; /* #E6A0BA */
  --hue-teal-ink: 177 34% 58%; /* #6FB8B4 */
  --hue-coral-ink: 13 73% 67%; /* #E8866C */
  --hue-indigo-ink: 229 58% 69%; /* #8192DE */
  --hue-stone-ink: 38 9% 71%; /* #BCB7AE */
  --status-neutral: 40 9% 20%; /* #37342E */
  --map-fill: 180 8% 15%; /* #232A2A */
```

In `@theme inline`, after `--color-hue-stone-text`:

```css
  --color-hue-sky-ink: hsl(var(--hue-sky-ink));
  --color-hue-sun-ink: hsl(var(--hue-sun-ink));
  --color-hue-leaf-ink: hsl(var(--hue-leaf-ink));
  --color-hue-lilac-ink: hsl(var(--hue-lilac-ink));
  --color-hue-pink-ink: hsl(var(--hue-pink-ink));
  --color-hue-teal-ink: hsl(var(--hue-teal-ink));
  --color-hue-coral-ink: hsl(var(--hue-coral-ink));
  --color-hue-indigo-ink: hsl(var(--hue-indigo-ink));
  --color-hue-stone-ink: hsl(var(--hue-stone-ink));
  --color-status-neutral: hsl(var(--status-neutral));
  --color-map-fill: hsl(var(--map-fill));
```

- [ ] **Step 4: Add `hueInkHex` and `MAP_FILL` to `lib/map-palette.ts`**

After `hueHex`:

```ts
/** Dark ink shade per hue — mirrors --hue-*-ink in app/globals.css. Stamp ink, last-stop dot ring. */
const HUE_INK_HEX: Record<Hue, { light: string; dark: string }> = {
  sky:    { light: "#17697F", dark: "#8CC0D6" },
  sun:    { light: "#80600F", dark: "#E6C57A" },
  leaf:   { light: "#486B0D", dark: "#A1C57A" },
  lilac:  { light: "#5E3AA5", dark: "#B5A0E2" },
  pink:   { light: "#9D4469", dark: "#E6A0BA" },
  teal:   { light: "#2E8A88", dark: "#6FB8B4" },
  coral:  { light: "#B8391D", dark: "#E8866C" },
  indigo: { light: "#4557C9", dark: "#8192DE" },
  stone:  { light: "#6F6249", dark: "#BCB7AE" },
};

export function hueInkHex(hue: Hue, dark = false): string {
  return (HUE_INK_HEX[hue] ?? HUE_INK_HEX.stone)[dark ? "dark" : "light"];
}

/** The travels map ground behind the tiles — mirrors --map-fill. */
export const MAP_FILL = { light: "#EAF3F2", dark: "#232A2A" } as const;
```

- [ ] **Step 5: Create `lib/trips/trip-colour.ts`**

```ts
/**
 * Trip colour (CONTEXT.md): the hue a Trip is drawn in wherever a
 * Traveller's Trips sit side by side. Handed out from the ramp in the order
 * the Traveller's Trips were created, so a Trip keeps its colour for life and
 * the first eight never collide (spec D2). Derived, never stored. Pure.
 */
import type { Hue } from "@/lib/hues";

/** Coral first so the oldest (usually the Up-next) trip reads as the app's own colour. No stone. */
export const TRIP_HUE_RAMP: readonly Hue[] = ["coral", "teal", "leaf", "lilac", "sun", "sky", "pink", "indigo"];

export function assignTripHues(trips: { id: string; createdAt: Date }[]): Map<string, Hue> {
  const ordered = [...trips].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const out = new Map<string, Hue>();
  ordered.forEach((t, i) => out.set(t.id, TRIP_HUE_RAMP[i % TRIP_HUE_RAMP.length]));
  return out;
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run lib/trips/trip-colour.test.ts lib/map-palette.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css lib/map-palette.ts lib/map-palette.test.ts lib/trips/trip-colour.ts lib/trips/trip-colour.test.ts
git commit -m "feat(trips): hue ink tokens, map fill, and trip colour by creation order

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Trip status helpers for the cards and header

**Files:**
- Create: `lib/trips/trip-status.ts`
- Test: `lib/trips/trip-status.test.ts`

**Interfaces:**
- Consumes: `computeTripPhase`, `compareForTripList`, `TripPhase` from `@/lib/trip-phase`; `countdownFor` from `@/lib/countdown`; `formatDateRangeCompact`, `formatMonthYear`, `daysBetween` from `@/lib/dates`.
- Produces:
  ```ts
  export type TripCardKind = "up-next" | "on-the-road" | "planning" | "idea" | "done";
  export interface CardTrip { id: string; name: string; startDate: string | null; endDate: string | null; createdAt: Date; stopCount: number; }
  export function orderForCarousel<T extends CardTrip>(trips: T[], today: string, todayByTripId?: Map<string, string>): T[];
  export function cardKind(phase: TripPhase, isFirst: boolean): TripCardKind;
  export function cardLabel(kind: TripCardKind): string;             // "UP NEXT" | "ON THE ROAD" | "PLANNING" | "IDEA" | "DONE"
  export interface BigNumber { value: string; unit: [string, string] | null }
  export function cardBigNumber(i: { kind: TripCardKind; startDate: string | null; endDate: string | null; today: string }): BigNumber;
  export function cardDateLine(i: { kind: TripCardKind; startDate: string | null; endDate: string | null; stopCount: number; today: string; currentStop?: string | null }): string;
  export function tripsMetaLine(c: { upcoming: number; done: number }): string;
  export function cardAccessibleName(name: string, kind: TripCardKind, big: BigNumber): string;
  export function countUpcomingAndDone(trips: CardTrip[], today: string, todayByTripId?: Map<string, string>): { upcoming: number; done: number };
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/trips/trip-status.test.ts
import { describe, it, expect } from "vitest";
import {
  orderForCarousel, cardKind, cardLabel, cardBigNumber, cardDateLine, tripsMetaLine,
  cardAccessibleName, countUpcomingAndDone,
} from "./trip-status";

const TODAY = "2026-09-28";
const trip = (id: string, startDate: string | null, endDate: string | null, created = "2026-01-01", stopCount = 3) => ({
  id, name: id, startDate, endDate, createdAt: new Date(created), stopCount,
});

describe("orderForCarousel", () => {
  it("puts the nearest upcoming first, then other upcoming, ideas by creation, then done most recent first", () => {
    const trips = [
      trip("done-old", "2024-03-01", "2024-03-10", "2024-01-01"),
      trip("idea-new", null, null, "2026-05-01"),
      trip("far", "2027-04-23", "2027-05-03"),
      trip("done-new", "2025-03-01", "2025-03-10", "2023-01-01"),
      trip("near", "2026-12-04", "2027-01-08"),
      trip("idea-old", null, null, "2026-02-01"),
    ];
    expect(orderForCarousel(trips, TODAY).map((t) => t.id)).toEqual([
      "near", "far", "idea-new", "idea-old", "done-new", "done-old",
    ]);
  });
  it("puts a travelling trip ahead of everything", () => {
    const trips = [trip("near", "2026-12-04", "2027-01-08"), trip("now", "2026-09-20", "2026-10-05")];
    expect(orderForCarousel(trips, TODAY)[0].id).toBe("now");
  });
});

describe("cardKind / cardLabel", () => {
  it("names the first card up-next or on-the-road, the rest by phase", () => {
    expect(cardKind("planning", true)).toBe("up-next");
    expect(cardKind("final-prep", true)).toBe("up-next");
    expect(cardKind("travelling", true)).toBe("on-the-road");
    expect(cardKind("planning", false)).toBe("planning");
    expect(cardKind("final-prep", false)).toBe("planning");
    expect(cardKind("sketching", false)).toBe("idea");
    expect(cardKind("sketching", true)).toBe("idea");
    expect(cardKind("past", false)).toBe("done");
    expect(cardKind("past", true)).toBe("done");
  });
  it("labels", () => {
    expect(cardLabel("up-next")).toBe("UP NEXT");
    expect(cardLabel("on-the-road")).toBe("ON THE ROAD");
    expect(cardLabel("idea")).toBe("IDEA");
  });
});

describe("cardBigNumber", () => {
  it("sleeps to go for upcoming", () => {
    expect(cardBigNumber({ kind: "up-next", startDate: "2026-12-04", endDate: "2027-01-08", today: TODAY }))
      .toEqual({ value: "67", unit: ["sleeps", "to go"] });
    expect(cardBigNumber({ kind: "planning", startDate: "2026-09-29", endDate: null, today: TODAY }))
      .toEqual({ value: "1", unit: ["sleep", "to go"] });
  });
  it("Today on the departure day", () => {
    expect(cardBigNumber({ kind: "up-next", startDate: TODAY, endDate: "2026-10-02", today: TODAY }))
      .toEqual({ value: "Today", unit: null });
  });
  it("day n of m while on the road", () => {
    expect(cardBigNumber({ kind: "on-the-road", startDate: "2026-09-23", endDate: "2026-10-27", today: TODAY }))
      .toEqual({ value: "6", unit: ["of 35", "days"] });
  });
  it("year or ? for an idea", () => {
    expect(cardBigNumber({ kind: "idea", startDate: null, endDate: null, today: TODAY })).toEqual({ value: "?", unit: ["dates", "not set"] });
  });
  it("nights away for done", () => {
    expect(cardBigNumber({ kind: "done", startDate: "2025-03-01", endDate: "2025-03-10", today: TODAY }))
      .toEqual({ value: "9", unit: ["nights", "away"] });
  });
});

describe("cardDateLine", () => {
  it("formats each kind", () => {
    expect(cardDateLine({ kind: "up-next", startDate: "2026-12-04", endDate: "2027-01-08", stopCount: 11, today: TODAY })).toBe("4 Dec – 8 Jan · 11 stops");
    expect(cardDateLine({ kind: "on-the-road", startDate: "2026-09-23", endDate: "2026-10-27", stopCount: 11, today: TODAY, currentStop: "Paris" })).toBe("Day 6 of 35 · Paris");
    expect(cardDateLine({ kind: "on-the-road", startDate: "2026-09-23", endDate: "2026-10-27", stopCount: 11, today: TODAY })).toBe("Day 6 of 35");
    expect(cardDateLine({ kind: "planning", startDate: "2027-04-23", endDate: "2027-05-03", stopCount: 4, today: TODAY })).toBe("23 Apr – 3 May");
    expect(cardDateLine({ kind: "idea", startDate: null, endDate: null, stopCount: 0, today: TODAY })).toBe("Add dates");
    expect(cardDateLine({ kind: "done", startDate: "2025-03-01", endDate: "2025-03-10", stopCount: 4, today: TODAY })).toBe("Mar 2025 · 4 stops");
    expect(cardDateLine({ kind: "done", startDate: "2025-03-01", endDate: "2025-03-10", stopCount: 1, today: TODAY })).toBe("Mar 2025 · 1 stop");
  });
});

describe("tripsMetaLine / countUpcomingAndDone", () => {
  it("drops zero parts", () => {
    expect(tripsMetaLine({ upcoming: 3, done: 1 })).toBe("3 coming up · 1 done");
    expect(tripsMetaLine({ upcoming: 2, done: 0 })).toBe("2 coming up");
    expect(tripsMetaLine({ upcoming: 0, done: 2 })).toBe("2 done");
    expect(tripsMetaLine({ upcoming: 0, done: 0 })).toBe("Nothing planned yet");
  });
  it("counts ideas and travelling as coming up", () => {
    expect(countUpcomingAndDone([trip("a", null, null), trip("b", "2026-09-20", "2026-10-05"), trip("c", "2024-01-01", "2024-01-05")], TODAY))
      .toEqual({ upcoming: 2, done: 1 });
  });
});

describe("cardAccessibleName", () => {
  it("joins name, status and countdown", () => {
    expect(cardAccessibleName("Christmas in Europe 2026", "up-next", { value: "67", unit: ["sleeps", "to go"] }))
      .toBe("Christmas in Europe 2026, up next, 67 sleeps to go");
    expect(cardAccessibleName("Japan", "idea", { value: "?", unit: ["dates", "not set"] })).toBe("Japan, idea, dates not set");
    expect(cardAccessibleName("NZ", "up-next", { value: "Today", unit: null })).toBe("NZ, up next, Today");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/trips/trip-status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/trips/trip-status.ts`**

```ts
/**
 * Trips-page card status (spec 2026-09-28-trips-page-carousel D6, P3;
 * CONTEXT.md "Phase"): the card labels Idea / Planning / Up next / On the
 * road / Done are names for Phases on this page, not new states. Pure.
 */
import { computeTripPhase, compareForTripList, type TripPhase } from "@/lib/trip-phase";
import { countdownFor } from "@/lib/countdown";
import { formatDateRangeCompact, formatMonthYear, daysBetween } from "@/lib/dates";

export type TripCardKind = "up-next" | "on-the-road" | "planning" | "idea" | "done";

export interface CardTrip {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: Date;
  stopCount: number;
}

function phaseOf(t: CardTrip, today: string, byId?: Map<string, string>): TripPhase {
  return computeTripPhase({ startDate: t.startDate, endDate: t.endDate, today: byId?.get(t.id) ?? today });
}

/**
 * Handoff §4 card order: the nearest upcoming or in-progress trip; other
 * upcoming by start date; ideas newest-created first; done most recent
 * (latest end date) first. compareForTripList already does everything but
 * the done tie-break, which it orders by createdAt.
 */
export function orderForCarousel<T extends CardTrip>(trips: T[], today: string, todayByTripId?: Map<string, string>): T[] {
  return [...trips].sort((a, b) => {
    const pa = phaseOf(a, today, todayByTripId);
    const pb = phaseOf(b, today, todayByTripId);
    if (pa === "past" && pb === "past") {
      const ea = a.endDate ?? a.startDate ?? "";
      const eb = b.endDate ?? b.startDate ?? "";
      return eb.localeCompare(ea) || b.createdAt.getTime() - a.createdAt.getTime();
    }
    return compareForTripList(a, b, today, todayByTripId);
  });
}

export function cardKind(phase: TripPhase, isFirst: boolean): TripCardKind {
  if (phase === "past") return "done";
  if (phase === "sketching") return "idea";
  if (phase === "travelling") return "on-the-road";
  return isFirst ? "up-next" : "planning";
}

const LABELS: Record<TripCardKind, string> = {
  "up-next": "UP NEXT",
  "on-the-road": "ON THE ROAD",
  planning: "PLANNING",
  idea: "IDEA",
  done: "DONE",
};
export function cardLabel(kind: TripCardKind): string {
  return LABELS[kind];
}

export interface BigNumber {
  value: string;
  /** Two stacked lines under/beside the number; null when the value stands alone ("Today"). */
  unit: [string, string] | null;
}

export function cardBigNumber({ kind, startDate, endDate, today }: { kind: TripCardKind; startDate: string | null; endDate: string | null; today: string }): BigNumber {
  if (kind === "idea") {
    return { value: startDate ? startDate.slice(0, 4) : "?", unit: ["dates", "not set"] };
  }
  if (kind === "done") {
    const nights = startDate ? daysBetween(startDate, endDate ?? startDate) : 0;
    return { value: String(nights), unit: [nights === 1 ? "night" : "nights", "away"] };
  }
  const c = countdownFor({ startDate, endDate, today });
  switch (c.kind) {
    case "sleeps":
      return { value: String(c.n), unit: [c.unit, "to go"] };
    case "today":
      return { value: "Today", unit: null };
    case "day":
      return { value: String(c.n), unit: [`of ${c.of}`, "days"] };
    case "home":
      return { value: "Back home", unit: null };
    case "no-dates":
      return { value: "?", unit: ["dates", "not set"] };
  }
}

function stops(n: number): string {
  return n === 1 ? "1 stop" : `${n} stops`;
}

export function cardDateLine({ kind, startDate, endDate, stopCount, today, currentStop }: {
  kind: TripCardKind; startDate: string | null; endDate: string | null; stopCount: number; today: string; currentStop?: string | null;
}): string {
  if (kind === "idea" || !startDate) return "Add dates";
  const end = endDate ?? startDate;
  if (kind === "on-the-road") {
    const c = countdownFor({ startDate, endDate, today });
    const day = c.kind === "day" ? `Day ${c.n} of ${c.of}` : "Today";
    return currentStop ? `${day} · ${currentStop}` : day;
  }
  if (kind === "done") {
    return `${formatMonthYear(startDate).replace(/^(\w{3})\w* /, "$1 ")} · ${stops(stopCount)}`;
  }
  const range = formatDateRangeCompact(startDate, end);
  return kind === "up-next" ? `${range} · ${stops(stopCount)}` : range;
}

export function tripsMetaLine({ upcoming, done }: { upcoming: number; done: number }): string {
  const parts: string[] = [];
  if (upcoming > 0) parts.push(`${upcoming} coming up`);
  if (done > 0) parts.push(`${done} done`);
  return parts.length ? parts.join(" · ") : "Nothing planned yet";
}

export function countUpcomingAndDone(trips: CardTrip[], today: string, todayByTripId?: Map<string, string>): { upcoming: number; done: number } {
  let done = 0;
  for (const t of trips) if (phaseOf(t, today, todayByTripId) === "past") done++;
  return { upcoming: trips.length - done, done };
}

export function cardAccessibleName(name: string, kind: TripCardKind, big: BigNumber): string {
  const status = LABELS[kind].toLowerCase();
  const countdown = big.unit ? `${big.value} ${big.unit[0]} ${big.unit[1]}`.replace(/^\? /, "") : big.value;
  return `${name}, ${status}, ${countdown}`;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/trips/trip-status.test.ts`
Expected: PASS. If `formatMonthYear` gives "March 2025" the regex above shortens it to "Mar 2025"; keep the test's expectation.

- [ ] **Step 5: Commit**

```bash
git add lib/trips/trip-status.ts lib/trips/trip-status.test.ts
git commit -m "feat(trips): card kind, big number, date line and header meta helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Route sketch geometry

**Files:**
- Create: `lib/trips/route-sketch.ts`
- Test: `lib/trips/route-sketch.test.ts`

**Interfaces:**
- Consumes: `clusterStops`, `haversineKm` from `@/lib/geo-cluster`.
- Produces:
  ```ts
  export interface SketchStop { id: string; name: string; lat: number; lng: number; nights: number }
  export interface MainCluster<T> { main: T[]; offFrame: T[] }
  export function pickMainCluster<T extends SketchStop>(stops: T[]): MainCluster<T> | null;   // null when main has < 2 stops
  export interface Box { w: number; h: number; pad: number }
  export interface Point { x: number; y: number }
  export function projectToBox(points: { lat: number; lng: number }[], box: Box): Point[];
  export function sampleDotIndices(count: number, max?: number): number[];                       // max defaults to 14
  export interface SketchModel { points: Point[]; dotIndices: number[]; caption: string; chip: string | null; first: string; last: string }
  export function sketchModel(stops: SketchStop[], box: Box): SketchModel | null;                // null → show stamp
  export const SAME_CITY_KM = 5;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/trips/route-sketch.test.ts
import { describe, it, expect } from "vitest";
import { pickMainCluster, projectToBox, sampleDotIndices, sketchModel } from "./route-sketch";

const s = (id: string, lat: number, lng: number, nights: number) => ({ id, name: id, lat, lng, nights });

// Christmas in Europe: Sydney (home, excluded by the caller) → Bali 4n → London … Rome 31n.
const europe = [
  s("Bali", -8.65, 115.13, 4),
  s("London", 51.5, -0.12, 5),
  s("Paris", 48.85, 2.35, 4),
  s("Munich", 48.14, 11.58, 3),
  s("Vienna", 48.2, 16.37, 3),
  s("Venice", 45.44, 12.33, 4),
  s("Florence", 43.77, 11.25, 6),
  s("Rome", 41.9, 12.5, 6),
];

describe("pickMainCluster", () => {
  it("keeps Europe and puts Bali off-frame", () => {
    const r = pickMainCluster(europe)!;
    expect(r.main.map((x) => x.id)).toEqual(["London", "Paris", "Munich", "Vienna", "Venice", "Florence", "Rome"]);
    expect(r.offFrame.map((x) => x.id)).toEqual(["Bali"]);
  });
  it("picks the cluster with the most nights, not the most stops", () => {
    const r = pickMainCluster([s("Tokyo", 35.68, 139.69, 10), s("Kyoto", 35.01, 135.77, 9), s("Paris", 48.85, 2.35, 1), s("Lyon", 45.76, 4.84, 1), s("Nice", 43.7, 7.27, 1)])!;
    expect(r.main.map((x) => x.id)).toEqual(["Tokyo", "Kyoto"]);
  });
  it("breaks a nights tie by stop count, then by earliest", () => {
    const r = pickMainCluster([s("A1", 0, 0, 2), s("B1", 40, 40, 1), s("B2", 40.5, 40.5, 1)])!;
    expect(r.main.map((x) => x.id)).toEqual(["B1", "B2"]);
    const r2 = pickMainCluster([s("A1", 0, 0, 1), s("A2", 0.5, 0.5, 1), s("B1", 40, 40, 1), s("B2", 40.5, 40.5, 1)])!;
    expect(r2.main.map((x) => x.id)).toEqual(["A1", "A2"]);
  });
  it("returns null with fewer than 2 stops in the main cluster", () => {
    expect(pickMainCluster([])).toBeNull();
    expect(pickMainCluster([s("Solo", 0, 0, 3)])).toBeNull();
    expect(pickMainCluster([s("A", 0, 0, 3), s("B", 40, 40, 1)])).toBeNull();
  });
});

describe("projectToBox", () => {
  it("fits inside the padded box and keeps aspect", () => {
    const pts = projectToBox([{ lat: 51.5, lng: -0.12 }, { lat: 41.9, lng: 12.5 }], { w: 100, h: 133, pad: 0.12 });
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(12);
      expect(p.x).toBeLessThanOrEqual(88);
      expect(p.y).toBeGreaterThanOrEqual(133 * 0.12);
      expect(p.y).toBeLessThanOrEqual(133 * 0.88);
    }
    expect(pts[0].y).toBeLessThan(pts[1].y); // north is up
    expect(pts[0].x).toBeLessThan(pts[1].x);
  });
  it("centres a single point", () => {
    expect(projectToBox([{ lat: 10, lng: 10 }], { w: 100, h: 100, pad: 0.12 })).toEqual([{ x: 50, y: 50 }]);
  });
});

describe("sampleDotIndices", () => {
  it("keeps every index up to the cap", () => {
    expect(sampleDotIndices(5)).toEqual([0, 1, 2, 3, 4]);
    expect(sampleDotIndices(14)).toHaveLength(14);
  });
  it("keeps first and last and samples evenly above the cap", () => {
    const idx = sampleDotIndices(30);
    expect(idx).toHaveLength(14);
    expect(idx[0]).toBe(0);
    expect(idx[13]).toBe(29);
    expect(new Set(idx).size).toBe(14);
  });
});

describe("sketchModel", () => {
  it("builds caption, chip and points for Europe", () => {
    const m = sketchModel(europe, { w: 100, h: 133, pad: 0.12 })!;
    expect(m.caption).toBe("London → Rome");
    expect(m.chip).toBe("+ Bali");
    expect(m.points).toHaveLength(7);
    expect(m.dotIndices).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("counts extra off-frame stops in the chip", () => {
    const m = sketchModel([...europe, s("Sydney2", -33.87, 151.2, 2)], { w: 100, h: 100, pad: 0.12 })!;
    expect(m.chip).toBe("+ Bali +1");
  });
  it("has no chip when nothing is off-frame", () => {
    expect(sketchModel(europe.slice(1), { w: 100, h: 100, pad: 0.12 })!.chip).toBeNull();
  });
  it("same-city returns null", () => {
    expect(sketchModel([s("A", 48.85, 2.35, 2), s("B", 48.86, 2.36, 2)], { w: 100, h: 100, pad: 0.12 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/trips/route-sketch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/trips/route-sketch.ts`**

```ts
/**
 * Route sketch geometry (TRIP_COVER.md §3; spec P2). Groups a Trip's located
 * Stops with the shared single-linkage clustering (lib/geo-cluster.ts, 1500
 * km), picks the **main cluster** by most nights (tie: most stops, then
 * earliest), projects it into a box, and samples dots. The Home base is
 * excluded by the caller. Pure.
 */
import { clusterStops, haversineKm } from "@/lib/geo-cluster";

export interface SketchStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  nights: number;
}

export interface MainCluster<T> {
  main: T[];
  offFrame: T[];
}

export const SAME_CITY_KM = 5;
const MAX_DOTS = 14;

export function pickMainCluster<T extends SketchStop>(stops: T[]): MainCluster<T> | null {
  const clusters = clusterStops(stops);
  if (clusters.length === 0) return null;
  const index = new Map(stops.map((s, i) => [s.id, i]));
  const nights = (c: T[]) => c.reduce((n, s) => n + s.nights, 0);
  const earliest = (c: T[]) => Math.min(...c.map((s) => index.get(s.id) ?? 0));
  const best = [...clusters].sort((a, b) => nights(b) - nights(a) || b.length - a.length || earliest(a) - earliest(b))[0];
  if (best.length < 2) return null;
  const mainIds = new Set(best.map((s) => s.id));
  const main = stops.filter((s) => mainIds.has(s.id)); // itinerary order
  const offFrame = stops.filter((s) => !mainIds.has(s.id));
  return { main, offFrame };
}

export interface Box {
  w: number;
  h: number;
  /** Fraction of each side kept clear, e.g. 0.12. */
  pad: number;
}
export interface Point {
  x: number;
  y: number;
}

/** Equirectangular with x scaled by cos(mean lat); uniform scale, centred on the unused axis. */
export function projectToBox(points: { lat: number; lng: number }[], box: Box): Point[] {
  if (points.length === 0) return [];
  const meanLat = points.reduce((a, p) => a + p.lat, 0) / points.length;
  const kx = Math.cos((meanLat * Math.PI) / 180);
  const raw = points.map((p) => ({ x: p.lng * kx, y: -p.lat }));
  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const innerW = box.w * (1 - 2 * box.pad);
  const innerH = box.h * (1 - 2 * box.pad);
  const spanX = maxX - minX || 1e-9;
  const spanY = maxY - minY || 1e-9;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const usedW = spanX * scale;
  const usedH = spanY * scale;
  const offX = box.w * box.pad + (innerW - usedW) / 2;
  const offY = box.h * box.pad + (innerH - usedH) / 2;
  return raw.map((p) => ({
    x: Math.round(((p.x - minX) * scale + offX) * 100) / 100,
    y: Math.round(((p.y - minY) * scale + offY) * 100) / 100,
  }));
}

/** At most `max` dot indices: first, last, and evenly sampled between. */
export function sampleDotIndices(count: number, max: number = MAX_DOTS): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const out = new Set<number>([0, count - 1]);
  const inner = max - 2;
  for (let k = 1; k <= inner; k++) out.add(Math.round((k * (count - 1)) / (inner + 1)));
  return [...out].sort((a, b) => a - b).slice(0, max);
}

export interface SketchModel {
  points: Point[];
  dotIndices: number[];
  /** "London → Rome" */
  caption: string;
  /** "+ Bali", "+ Bali +2", or null. */
  chip: string | null;
  first: string;
  last: string;
}

function allWithin(stops: SketchStop[], km: number): boolean {
  for (let i = 0; i < stops.length; i++)
    for (let j = i + 1; j < stops.length; j++) if (haversineKm(stops[i], stops[j]) > km) return false;
  return true;
}

export function sketchModel(stops: SketchStop[], box: Box): SketchModel | null {
  const picked = pickMainCluster(stops);
  if (!picked) return null;
  if (allWithin(picked.main, SAME_CITY_KM)) return null;
  const { main, offFrame } = picked;
  const points = projectToBox(main, box);
  const chip = offFrame.length === 0 ? null : offFrame.length === 1 ? `+ ${offFrame[0].name}` : `+ ${offFrame[0].name} +${offFrame.length - 1}`;
  return {
    points,
    dotIndices: sampleDotIndices(points.length),
    caption: `${main[0].name} → ${main[main.length - 1].name}`,
    chip,
    first: main[0].name,
    last: main[main.length - 1].name,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/trips/route-sketch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/trips/route-sketch.ts lib/trips/route-sketch.test.ts
git commit -m "feat(trips): route sketch geometry — main cluster, projection, dot sampling

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Cover components — polaroid, route sketch, passport stamp, decision

**Files:**
- Create: `components/trips/polaroid.tsx`, `components/trips/cover-route-sketch.tsx`, `components/trips/cover-stamp.tsx`, `components/trips/trip-cover.tsx`, `components/trips/cover-add-photo.tsx` (client)
- Test: `components/trips/trip-cover.test.tsx`, `components/trips/cover-stamp.test.tsx`, `components/trips/cover-route-sketch.test.tsx`

**Interfaces:**
- Consumes: `sketchModel`, `SketchStop` (Task 3); `hueInkHex` is not needed here — the stamp uses Tailwind `text-hue-{hue}-ink` classes; `Hue` from `@/lib/hues`; `CoverUploaderDialog` from `@/components/trip/home/desktop/cover-uploader-dialog`; `formatDayLabel` no; dates via a local `stampDate`.
- Produces:
  ```ts
  export type PolaroidSize = "hero" | "small" | "mobile-hero";
  export interface TripCoverInput {
    tripId: string; name: string; hue: Hue;
    photo: { url: string; focalX: number | null; focalY: number | null } | null;
    stops: SketchStop[];            // located real-plan stops in plan order, home base excluded
    startDate: string | null;
    canEdit: boolean;
  }
  export function TripCover(props: TripCoverInput & { size: PolaroidSize; index?: number; className?: string }): JSX.Element;   // polaroid
  export function CoverArt(props: TripCoverInput & { size: "hero" | "small"; box?: "3:4" | "1:1" | "band"; className?: string }): JSX.Element; // fills any box, no frame
  export function Polaroid({ size, index, caption, children, className }): JSX.Element;
  export function CoverRouteSketch({ model, size, hue }): JSX.Element;
  export function CoverStamp({ name, place, startDate, hue, size }): JSX.Element;
  export function stampPlace(i: { stops: { name: string }[]; name: string; size: "hero" | "small" }): string;
  export function stampDate(iso: string): string;   // "04 DEC 26"
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
// components/trips/cover-stamp.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CoverStamp, stampPlace, stampDate } from "./cover-stamp";

describe("stampDate", () => {
  it("formats DD MON YY", () => {
    expect(stampDate("2026-12-04")).toBe("04 DEC 26");
  });
});

describe("stampPlace", () => {
  it("uses the one stop's name", () => {
    expect(stampPlace({ stops: [{ name: "Queenstown" }], name: "New Zealand", size: "small" })).toBe("Queenstown");
  });
  it("uses the trip name with 0 stops, abbreviated on small when over 8 chars", () => {
    expect(stampPlace({ stops: [], name: "New Zealand", size: "small" })).toBe("NZ");
    expect(stampPlace({ stops: [], name: "Bali", size: "small" })).toBe("Bali");
    expect(stampPlace({ stops: [], name: "New Zealand", size: "hero" })).toBe("New Zealand");
  });
});

describe("CoverStamp", () => {
  it("hero shows ARRIVED, place and date; is aria-hidden", () => {
    const { container } = render(<CoverStamp name="Christmas in Europe" place="EUROPE" startDate="2026-12-04" hue="coral" size="hero" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(/ARRIVED/)).toBeInTheDocument();
    expect(screen.getByText("EUROPE")).toBeInTheDocument();
    expect(screen.getByText("04 DEC 26")).toBeInTheDocument();
    expect(container.querySelector(".text-hue-coral-ink")).not.toBeNull();
  });
  it("no start date: SOMEDAY and no date row", () => {
    render(<CoverStamp name="Japan" place="JAPAN" startDate={null} hue="teal" size="hero" />);
    expect(screen.getByText(/SOMEDAY/)).toBeInTheDocument();
    expect(screen.queryByText(/\d{2} [A-Z]{3} \d{2}/)).toBeNull();
  });
  it("small omits ARRIVED", () => {
    render(<CoverStamp name="NZ" place="NZ" startDate="2027-04-23" hue="teal" size="small" />);
    expect(screen.queryByText(/ARRIVED/)).toBeNull();
    expect(screen.getByText("23 APR 27")).toBeInTheDocument();
  });
});
```

```tsx
// components/trips/cover-route-sketch.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CoverRouteSketch } from "./cover-route-sketch";
import { sketchModel } from "@/lib/trips/route-sketch";

const stops = [
  { id: "b", name: "Bali", lat: -8.65, lng: 115.13, nights: 4 },
  { id: "l", name: "London", lat: 51.5, lng: -0.12, nights: 5 },
  { id: "p", name: "Paris", lat: 48.85, lng: 2.35, nights: 4 },
  { id: "r", name: "Rome", lat: 41.9, lng: 12.5, nights: 6 },
];

describe("CoverRouteSketch", () => {
  it("draws a polyline through every point, dots, and the edge chip", () => {
    const model = sketchModel(stops, { w: 100, h: 133, pad: 0.12 })!;
    const { container } = render(<CoverRouteSketch model={model} size="hero" hue="coral" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    const poly = container.querySelector("polyline")!;
    expect(poly.getAttribute("points")!.split(" ")).toHaveLength(3);
    expect(container.querySelectorAll("[data-dot]")).toHaveLength(3);
    expect(container.querySelector("[data-dot='first']")).not.toBeNull();
    expect(container.querySelector("[data-dot='last']")).not.toBeNull();
    expect(screen.getByText("+ Bali")).toBeInTheDocument();
  });
  it("small size hides the chip when the box is under 80px", () => {
    const model = sketchModel(stops, { w: 100, h: 100, pad: 0.12 })!;
    render(<CoverRouteSketch model={model} size="small" hue="coral" boxPx={64} />);
    expect(screen.queryByText("+ Bali")).toBeNull();
  });
});
```

```tsx
// components/trips/trip-cover.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripCover, CoverArt } from "./trip-cover";

vi.mock("./cover-add-photo", () => ({ CoverAddPhoto: () => <div data-testid="add-photo" /> }));
vi.mock("next/image", () => ({ default: (p: Record<string, unknown>) => <img alt={String(p.alt)} src={String(p.src)} /> }));

const base = {
  tripId: "t1",
  name: "Christmas in Europe 2026",
  hue: "coral" as const,
  photo: null,
  startDate: "2026-12-04",
  canEdit: true,
};
const europe = [
  { id: "l", name: "London", lat: 51.5, lng: -0.12, nights: 5 },
  { id: "p", name: "Paris", lat: 48.85, lng: 2.35, nights: 4 },
  { id: "r", name: "Rome", lat: 41.9, lng: 12.5, nights: 6 },
];

describe("TripCover", () => {
  it("photo wins", () => {
    render(<TripCover {...base} photo={{ url: "/api/trips/t1/cover?v=k", focalX: null, focalY: null }} stops={europe} size="hero" />);
    expect(screen.getByRole("img", { name: "Christmas in Europe 2026 cover photo" })).toBeInTheDocument();
    expect(screen.queryByText("London → Rome")).toBeNull();
  });
  it("route sketch with ≥2 stops in the main cluster, with caption on hero", () => {
    const { container } = render(<TripCover {...base} stops={europe} size="hero" />);
    expect(container.querySelector("polyline")).not.toBeNull();
    expect(screen.getByText("London → Rome")).toBeInTheDocument();
  });
  it("stamp with 0 or 1 stops", () => {
    render(<TripCover {...base} stops={[]} size="small" />);
    expect(screen.queryByText(/→/)).toBeNull();
    expect(screen.getByText("04 DEC 26")).toBeInTheDocument();
  });
  it("shows the add-photo affordance only when the viewer can edit", () => {
    const { rerender } = render(<TripCover {...base} stops={[]} size="hero" />);
    expect(screen.getByTestId("add-photo")).toBeInTheDocument();
    rerender(<TripCover {...base} stops={[]} size="hero" canEdit={false} />);
    expect(screen.queryByTestId("add-photo")).toBeNull();
  });
  it("small frames alternate rotation by index", () => {
    const { container: c0 } = render(<TripCover {...base} stops={[]} size="small" index={0} />);
    const { container: c1 } = render(<TripCover {...base} stops={[]} size="small" index={1} />);
    expect(c0.firstElementChild!.className).toContain("-rotate-[5deg]");
    expect(c1.firstElementChild!.className).toContain("rotate-[4deg]");
  });
});

describe("CoverArt", () => {
  it("renders the stamp without a frame in band mode", () => {
    const { container } = render(<CoverArt {...base} stops={[]} size="hero" box="band" />);
    expect(container.querySelector("[data-polaroid]")).toBeNull();
    expect(screen.getByText("04 DEC 26")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/trips/cover-stamp.test.tsx components/trips/cover-route-sketch.test.tsx components/trips/trip-cover.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `components/trips/polaroid.tsx`** (Server Component)

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PolaroidSize = "hero" | "small" | "mobile-hero";

/** TRIP_COVER.md §2 frame table. Frame: white, 2px ink. Inner: 2px ink, overflow hidden. */
const FRAME: Record<PolaroidSize, string> = {
  hero: "w-[150px] rounded-[10px] p-[7px] pb-[24px] shadow-hard-2 rotate-[4deg] mr-3 self-center",
  small: "w-[92px] rounded-[8px] p-[5px] pb-[14px] shadow-hard-1",
  "mobile-hero": "w-[86px] rounded-[8px] p-[5px] pb-[14px] shadow-hard-1 rotate-[5deg]",
};
const INNER: Record<PolaroidSize, string> = {
  hero: "aspect-[3/4] rounded-[4px]",
  small: "aspect-square rounded-[3px]",
  "mobile-hero": "aspect-[3/4] rounded-[3px]",
};
const SMALL_TILT = ["-rotate-[5deg]", "rotate-[4deg]", "-rotate-[3deg]"];

export interface PolaroidProps {
  size: PolaroidSize;
  /** Standard-card index; small frames alternate -5°, +4°, -3°. */
  index?: number;
  /** Hero only: the caption strip text (route sketch). */
  caption?: string | null;
  className?: string;
  children: ReactNode;
}

export function Polaroid({ size, index = 0, caption, className, children }: PolaroidProps) {
  return (
    <div
      data-polaroid={size}
      className={cn(
        "relative shrink-0 border-2 border-border bg-card",
        FRAME[size],
        size === "small" && SMALL_TILT[index % SMALL_TILT.length],
        className,
      )}
    >
      <div className={cn("relative overflow-hidden border-2 border-border bg-background", INNER[size])}>{children}</div>
      {size === "hero" && caption ? (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-[5px] truncate px-1 text-center text-[11px] font-bold text-foreground">
          {caption}
        </span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Create `components/trips/cover-stamp.tsx`** (Server Component)

```tsx
import type { Hue } from "@/lib/hues";
import { cn } from "@/lib/cn";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "04 DEC 26" from YYYY-MM-DD. */
export function stampDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

/** Initials of a multi-word name ("New Zealand" → "NZ"), else the first 8 letters. */
function abbreviate(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length > 1) return words.map((w) => w[0]).join("").toUpperCase().slice(0, 4);
  return name.slice(0, 8);
}

/** TRIP_COVER.md §4 "Which place to show". */
export function stampPlace({ stops, name, size }: { stops: { name: string }[]; name: string; size: "hero" | "small" }): string {
  if (stops.length === 1) return stops[0].name;
  if (size === "small" && name.length > 8) return abbreviate(name);
  return name;
}

const INK: Record<Hue, string> = {
  sky: "text-hue-sky-ink border-hue-sky-ink", sun: "text-hue-sun-ink border-hue-sun-ink", leaf: "text-hue-leaf-ink border-hue-leaf-ink",
  lilac: "text-hue-lilac-ink border-hue-lilac-ink", pink: "text-hue-pink-ink border-hue-pink-ink", teal: "text-hue-teal-ink border-hue-teal-ink",
  coral: "text-hue-coral-ink border-hue-coral-ink", indigo: "text-hue-indigo-ink border-hue-indigo-ink", stone: "text-hue-stone-ink border-hue-stone-ink",
};

export interface CoverStampProps {
  name: string;
  place: string;
  startDate: string | null;
  hue: Hue;
  size: "hero" | "small";
}

/** Passport stamp: paper inner box, ringed circle in the Trip colour's ink shade. aria-hidden. */
export function CoverStamp({ place, startDate, hue, size }: CoverStampProps) {
  const ink = INK[hue];
  const hero = size === "hero";
  return (
    <div aria-hidden="true" className="flex size-full items-center justify-center bg-background">
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-full border-solid text-center",
          ink,
          hero ? "size-[108px] -rotate-[14deg] border-[3px]" : "size-[64px] rotate-[10deg] border-[2.5px]",
        )}
      >
        <div className={cn("flex size-full flex-col items-center justify-center rounded-full", hero && "m-[6px] border-[1.5px] border-solid", ink, hero && "size-[calc(100%-12px)]")}>
          {hero ? (
            <span className="text-[9px] font-extrabold tracking-[0.14em]">{startDate ? "★ ARRIVED ★" : "★ SOMEDAY ★"}</span>
          ) : null}
          <span
            className={cn(
              "font-display font-extrabold uppercase leading-none",
              hero ? "my-[3px] max-w-[88px] text-[22px] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden" : "text-[13px]",
            )}
          >
            {place}
          </span>
          {startDate ? (
            <span
              className={cn(
                "font-extrabold tracking-[0.1em]",
                hero ? "border-y-[1.5px] border-solid px-1 py-[2px] text-[10px]" : "text-[7px]",
                ink,
              )}
            >
              {stampDate(startDate)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `components/trips/cover-route-sketch.tsx`** (Server Component)

```tsx
import type { Hue } from "@/lib/hues";
import type { SketchModel } from "@/lib/trips/route-sketch";
import { cn } from "@/lib/cn";

const DOT_FILL: Record<Hue, string> = {
  sky: "bg-hue-sky", sun: "bg-hue-sun", leaf: "bg-hue-leaf", lilac: "bg-hue-lilac", pink: "bg-hue-pink",
  teal: "bg-hue-teal", coral: "bg-hue-coral", indigo: "bg-hue-indigo", stone: "bg-hue-stone",
};

export interface CoverRouteSketchProps {
  model: SketchModel;
  size: "hero" | "small";
  hue: Hue;
  /** Rendered inner-box width in px (small only): the edge chip needs ≥ 80. */
  boxPx?: number;
}

/**
 * TRIP_COVER.md §3 "Drawing": map-fill ground, faint grid, dashed polyline in
 * viewBox units, HTML dots positioned by %. Everything aria-hidden — the
 * card's link name carries the meaning.
 */
export function CoverRouteSketch({ model, size, hue, boxPx }: CoverRouteSketchProps) {
  const hero = size === "hero";
  const vbH = hero ? 133 : 100;
  const grid = hero ? 16 : 12;
  const pts = model.points.map((p) => `${p.x},${p.y}`).join(" ");
  const last = model.points.length - 1;
  const showChip = model.chip && (hero || (boxPx ?? 92) >= 80);
  return (
    <div aria-hidden="true" className="relative size-full bg-map-fill">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: `${grid}px ${grid}px`,
        }}
      />
      <svg viewBox={`0 0 100 ${vbH}`} preserveAspectRatio="none" className="absolute inset-0 size-full text-foreground">
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.6} strokeDasharray="3 2.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {model.dotIndices.map((i) => {
        const p = model.points[i];
        const kind = i === 0 ? "first" : i === last ? "last" : "mid";
        const big = kind !== "mid";
        const px = hero ? (big ? 14 : 10) : big ? 10 : 7;
        return (
          <span
            key={i}
            data-dot={kind}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-border",
              kind === "first" ? "bg-sun" : kind === "last" ? (hue === "coral" ? "bg-coral" : DOT_FILL[hue]) : "bg-card",
            )}
            style={{ left: `${p.x}%`, top: `${(p.y / vbH) * 100}%`, width: px, height: px }}
          />
        );
      })}
      {showChip ? (
        <span className="absolute bottom-[5px] left-[5px] whitespace-nowrap rounded-full border-[1.5px] border-border bg-card px-[6px] py-px text-[9px] font-extrabold text-foreground">
          {model.chip}
        </span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Create `components/trips/cover-add-photo.tsx`** (client, lazy uploader)

```tsx
"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/cn";

const CoverUploaderDialog = dynamic(
  () => import("@/components/trip/home/desktop/cover-uploader-dialog").then((m) => m.CoverUploaderDialog),
  { ssr: false },
);

export interface CoverAddPhotoProps {
  tripId: string;
  hasCover: boolean;
  coverVersion?: string | null;
  focalX?: number | null;
  focalY?: number | null;
}

/**
 * TRIP_COVER.md §2 "Adding a photo": an "Add photo" / "Change" pill over the
 * frame, visible on hover, focus, or touch (long-press is approximated by the
 * pill always being reachable on coarse pointers). Opens the existing cover
 * uploader, loaded lazily.
 */
export function CoverAddPhoto({ tripId, hasCover, coverVersion, focalX, focalY }: CoverAddPhotoProps) {
  return (
    <CoverUploaderDialog
      tripId={tripId}
      hasCover={hasCover}
      coverVersion={coverVersion}
      focalX={focalX}
      focalY={focalY}
      trigger={
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute inset-0 z-10 flex items-end justify-center rounded-[8px] pb-1 opacity-0 transition-opacity",
            "hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
            "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span className="whitespace-nowrap rounded-full border-2 border-border bg-card px-2.5 py-1 text-[11px] font-extrabold text-foreground shadow-hard-1">
            {hasCover ? "Change" : "Add photo"}
            <span className="sr-only"> cover photo</span>
          </span>
        </button>
      }
    />
  );
}
```

- [ ] **Step 7: Create `components/trips/trip-cover.tsx`** (Server Component)

```tsx
import Image, { type ImageLoader } from "next/image";
import type { Hue } from "@/lib/hues";
import { sketchModel, type SketchStop } from "@/lib/trips/route-sketch";
import { Polaroid, type PolaroidSize } from "@/components/trips/polaroid";
import { CoverRouteSketch } from "@/components/trips/cover-route-sketch";
import { CoverStamp, stampPlace } from "@/components/trips/cover-stamp";
import { CoverAddPhoto } from "@/components/trips/cover-add-photo";
import { cn } from "@/lib/cn";

/** The cover route is member-gated; the optimizer must never fetch it (see countdown-polaroid.tsx). */
const passthroughLoader: ImageLoader = ({ src }) => src;

export interface TripCoverInput {
  tripId: string;
  name: string;
  hue: Hue;
  /** Uploaded photo, or null → generated cover. `url` already carries `?v=`. */
  photo: { url: string; focalX: number | null; focalY: number | null; version?: string | null } | null;
  /** Located real-plan Stops in plan order, Home base excluded. */
  stops: SketchStop[];
  startDate: string | null;
  /** Show the Add photo / Change pill. */
  canEdit: boolean;
}

const BOX = { hero: { w: 100, h: 133, pad: 0.12 }, small: { w: 100, h: 100, pad: 0.12 } } as const;
const SIZES_PX: Record<PolaroidSize, string> = { hero: "300px", small: "184px", "mobile-hero": "172px" };

/** TRIP_COVER.md §1: photo → route sketch → passport stamp. The art alone; no frame. */
export function CoverArt({
  tripId, name, hue, photo, stops, startDate, canEdit, size, box = size === "hero" ? "3:4" : "1:1", sizesPx = "300px", className,
}: TripCoverInput & { size: "hero" | "small"; box?: "3:4" | "1:1" | "band"; sizesPx?: string; className?: string }) {
  let art: React.ReactNode;
  let caption: string | null = null;
  if (photo) {
    art = (
      <Image
        src={photo.url}
        alt={`${name} cover photo`}
        fill
        sizes={sizesPx}
        loader={passthroughLoader}
        className="object-cover"
        style={{ objectPosition: `${(photo.focalX ?? 0.5) * 100}% ${(photo.focalY ?? 0.5) * 100}%` }}
      />
    );
  } else {
    const model = sketchModel(stops, box === "1:1" ? BOX.small : BOX.hero);
    if (model) {
      caption = model.caption;
      art = <CoverRouteSketch model={model} size={size} hue={hue} />;
    } else {
      art = <CoverStamp name={name} place={stampPlace({ stops, name, size })} startDate={startDate} hue={hue} size={size} />;
    }
  }
  return (
    <div data-cover-caption={caption ?? undefined} className={cn("relative size-full", className)}>
      {art}
      {canEdit ? <CoverAddPhoto tripId={tripId} hasCover={photo != null} coverVersion={photo?.version} focalX={photo?.focalX} focalY={photo?.focalY} /> : null}
    </div>
  );
}

/** The tilted polaroid used on every trips-page card. */
export function TripCover({ size, index, className, ...input }: TripCoverInput & { size: PolaroidSize; index?: number; className?: string }) {
  const artSize = size === "small" ? "small" : "hero";
  const model = input.photo ? null : sketchModel(input.stops, artSize === "small" ? BOX.small : BOX.hero);
  return (
    <Polaroid size={size} index={index} caption={size === "hero" ? model?.caption : null} className={className}>
      <CoverArt {...input} size={artSize} sizesPx={SIZES_PX[size]} />
    </Polaroid>
  );
}
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run components/trips/`
Expected: PASS. If `next/image` complains about `fill` without a sized parent in jsdom, the mock in the test file already replaces it.

- [ ] **Step 9: Commit**

```bash
git add components/trips/polaroid.tsx components/trips/cover-stamp.tsx components/trips/cover-route-sketch.tsx components/trips/cover-add-photo.tsx components/trips/trip-cover.tsx components/trips/*.test.tsx
git commit -m "feat(trips): polaroid trip cover — photo, route sketch, passport stamp

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Carousel and the two card components

**Files:**
- Create: `components/trips/trip-carousel.tsx` (client), `components/trips/trip-card-hero.tsx`, `components/trips/trip-card.tsx`, `components/trips/status-pill.tsx`, `components/trips/next-step-chip.tsx`
- Test: `components/trips/trip-carousel.test.tsx`, `components/trips/trip-card.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`TripCardKind`, `BigNumber`, `cardLabel`, `cardAccessibleName`), Task 4 (`TripCover`, `TripCoverInput`), `SortRow`/`SortIcon`/`SortTone` from `@/lib/sort-these-out`, `AppLink` from `@/components/navigation/app-link`.
- Produces:
  ```ts
  // trip-carousel.tsx
  export function TripCarousel({ children }: { children: ReactNode }): JSX.Element;          // context provider
  export function CarouselArrows(): JSX.Element | null;                                     // hidden when everything fits
  export function CarouselTrack({ children, className }: { children: ReactNode; className?: string }): JSX.Element;
  export function CarouselDots({ className }: { className?: string }): JSX.Element | null;  // hidden with one page
  export const CARD_GAP_PX = 18; export const CARD_GAP_MOBILE_PX = 12;
  // trip-card.tsx / trip-card-hero.tsx
  export interface TripCardModel {
    id: string; name: string; kind: TripCardKind; big: BigNumber; dateLine: string; href: string;
    cover: TripCoverInput; index: number;
    /** up-next / on-the-road only */ nextStep?: SortRow | null;
  }
  export function TripCard({ model }: { model: TripCardModel }): JSX.Element;      // standard 300×280 desktop / 220 mobile
  export function TripCardHero({ model }: { model: TripCardModel }): JSX.Element;  // 600×280 desktop / 300×250 mobile
  export function StatusPill({ kind, className }): JSX.Element;
  export function NextStepChip({ row }: { row: SortRow }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
// components/trips/trip-carousel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TripCarousel, CarouselArrows, CarouselTrack, CarouselDots } from "./trip-carousel";

function mount(scrollWidth: number, clientWidth: number) {
  const ui = render(
    <TripCarousel>
      <CarouselArrows />
      <CarouselTrack>
        <div data-testid="card" style={{ width: 300 }} />
        <div data-testid="card" style={{ width: 300 }} />
      </CarouselTrack>
      <CarouselDots />
    </TripCarousel>,
  );
  const track = screen.getByRole("region", { name: "Your trips" }) as HTMLDivElement;
  Object.defineProperty(track, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(track, "clientWidth", { configurable: true, value: clientWidth });
  track.scrollBy = vi.fn();
  act(() => { fireEvent.scroll(track); });
  return { ...ui, track };
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

describe("TripCarousel", () => {
  it("hides arrows and dots when every card fits", () => {
    mount(600, 1000);
    expect(screen.queryByRole("button", { name: "Next trips" })).toBeNull();
    expect(document.querySelector("[data-carousel-dots]")).toBeNull();
  });
  it("shows arrows and one dot per page when it overflows", () => {
    mount(1236, 1000);
    expect(screen.getByRole("button", { name: "Previous trips" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next trips" })).toBeEnabled();
    expect(document.querySelectorAll("[data-carousel-dot]")).toHaveLength(2);
  });
  it("scrolls by one card plus the gap", () => {
    const { track } = mount(1236, 1000);
    const card = screen.getAllByTestId("card")[0];
    Object.defineProperty(card, "offsetWidth", { configurable: true, value: 300 });
    fireEvent.click(screen.getByRole("button", { name: "Next trips" }));
    expect(track.scrollBy).toHaveBeenCalledWith({ left: 318, behavior: "smooth" });
  });
  it("arrow keys scroll the focused track", () => {
    const { track } = mount(1236, 1000);
    const card = screen.getAllByTestId("card")[0];
    Object.defineProperty(card, "offsetWidth", { configurable: true, value: 300 });
    fireEvent.keyDown(track, { key: "ArrowRight" });
    expect(track.scrollBy).toHaveBeenCalledWith({ left: 318, behavior: "smooth" });
    fireEvent.keyDown(track, { key: "ArrowLeft" });
    expect(track.scrollBy).toHaveBeenCalledWith({ left: -318, behavior: "smooth" });
  });
});
```

```tsx
// components/trips/trip-card.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripCard, TripCardHero, type TripCardModel } from "./trip-card";

vi.mock("./trip-cover", () => ({ TripCover: (p: { size: string }) => <div data-testid="cover" data-size={p.size} /> }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a> }));

const cover = { tripId: "t1", name: "Christmas in Europe 2026", hue: "coral" as const, photo: null, stops: [], startDate: "2026-12-04", canEdit: true };
const hero: TripCardModel = {
  id: "t1", name: "Christmas in Europe 2026", kind: "up-next", big: { value: "67", unit: ["sleeps", "to go"] },
  dateLine: "4 Dec – 8 Jan · 11 stops", href: "/trips/t1", cover, index: 0,
  nextStep: { id: "n1", title: "Add times to 6 transport legs", href: "/trips/t1/plan", tone: "sun", icon: "plane" },
};

describe("TripCardHero", () => {
  it("is one link named from name, status and countdown, with a sibling next-step link", () => {
    render(<TripCardHero model={hero} />);
    const card = screen.getByRole("link", { name: "Christmas in Europe 2026, up next, 67 sleeps to go" });
    expect(card).toHaveAttribute("href", "/trips/t1");
    const chip = screen.getByRole("link", { name: /Add times to 6 transport legs/ });
    expect(chip).toHaveAttribute("href", "/trips/t1/plan");
    expect(card.contains(chip)).toBe(false);
    expect(screen.getByText("UP NEXT")).toBeInTheDocument();
    expect(screen.getByText("67")).toBeInTheDocument();
    expect(screen.getByTestId("cover")).toHaveAttribute("data-size", "hero");
  });
  it("hides the chip when there is nothing to do", () => {
    render(<TripCardHero model={{ ...hero, nextStep: null }} />);
    expect(screen.queryByRole("link", { name: /transport/ })).toBeNull();
  });
});

describe("TripCard", () => {
  it("renders the pill, big number, name and date line", () => {
    render(<TripCard model={{ ...hero, id: "t2", kind: "planning", big: { value: "208", unit: ["sleeps", "to go"] }, dateLine: "23 Apr – 3 May", name: "New Zealand", index: 1 }} />);
    expect(screen.getByRole("link", { name: "New Zealand, planning, 208 sleeps to go" })).toBeInTheDocument();
    expect(screen.getByText("PLANNING")).toBeInTheDocument();
    expect(screen.getByText("23 Apr – 3 May")).toBeInTheDocument();
    expect(screen.getByTestId("cover")).toHaveAttribute("data-size", "small");
  });
  it("idea cards link the date line to trip settings", () => {
    render(<TripCard model={{ ...hero, kind: "idea", big: { value: "?", unit: ["dates", "not set"] }, dateLine: "Add dates", index: 2 }} />);
    expect(screen.getByRole("link", { name: "Add dates" })).toHaveAttribute("href", "/trips/t1/settings");
  });
  it("done cards use the canvas fill", () => {
    const { container } = render(<TripCard model={{ ...hero, kind: "done", big: { value: "9", unit: ["nights", "away"] }, dateLine: "Mar 2025 · 4 stops", index: 0 }} />);
    expect(container.firstElementChild!.className).toContain("bg-canvas");
    expect(screen.getByText("DONE")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/trips/trip-carousel.test.tsx components/trips/trip-card.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `components/trips/trip-carousel.tsx`**

```tsx
"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export const CARD_GAP_PX = 18;
export const CARD_GAP_MOBILE_PX = 12;

interface CarouselState {
  trackRef: React.RefObject<HTMLDivElement | null>;
  pages: number;
  page: number;
  canPrev: boolean;
  canNext: boolean;
  overflows: boolean;
  scrollByCard: (dir: 1 | -1) => void;
}

const Ctx = React.createContext<CarouselState | null>(null);

function useCarousel(): CarouselState {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("Carousel parts must sit inside <TripCarousel>");
  return c;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Provider: arrows live in the header, the track and dots below — all share this state (TRIPS_PAGE.md §3–4). */
export function TripCarousel({ children }: { children: React.ReactNode }) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = React.useState({ pages: 1, page: 0, canPrev: false, canNext: false, overflows: false });

  const measure = React.useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    const overflows = scrollWidth > clientWidth + 1;
    const pages = Math.max(1, Math.ceil(scrollWidth / Math.max(1, clientWidth)));
    const page = Math.min(pages - 1, Math.round(scrollLeft / Math.max(1, clientWidth)));
    setMetrics({ pages, page, overflows, canPrev: scrollLeft > 1, canNext: scrollLeft + clientWidth < scrollWidth - 1 });
  }, []);

  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    measure();
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [measure]);

  const scrollByCard = React.useCallback((dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const gap = Number.parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap || "") || CARD_GAP_PX;
    const step = (first?.offsetWidth ?? 300) + gap;
    el.scrollBy({ left: dir * step, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  const value = React.useMemo<CarouselState>(() => ({ trackRef, ...metrics, scrollByCard }), [metrics, scrollByCard]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const ARROW =
  "grid size-11 shrink-0 place-items-center rounded-[12px] border-2 bg-card transition-colors " +
  "enabled:border-border enabled:text-foreground enabled:shadow-hard-1 " +
  "disabled:border-border-soft disabled:text-border-soft disabled:shadow-none " +
  "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Two 44×44 arrows; hidden entirely when every card fits. */
export function CarouselArrows() {
  const { overflows, canPrev, canNext, scrollByCard } = useCarousel();
  if (!overflows) return null;
  return (
    <div className="flex gap-2.5">
      <button type="button" className={ARROW} aria-label="Previous trips" disabled={!canPrev} onClick={() => scrollByCard(-1)}>
        <ChevronLeft className="size-[18px]" aria-hidden="true" />
      </button>
      <button type="button" className={ARROW} aria-label="Next trips" disabled={!canNext} onClick={() => scrollByCard(1)}>
        <ChevronRight className="size-[18px]" aria-hidden="true" />
      </button>
    </div>
  );
}

/** The scroll-snap row. Children are the cards (each `snap-start shrink-0`). */
export function CarouselTrack({ children, className }: { children: React.ReactNode; className?: string }) {
  const { trackRef, scrollByCard } = useCarousel();
  return (
    <div
      ref={trackRef}
      role="region"
      aria-label="Your trips"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); scrollByCard(1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); scrollByCard(-1); }
      }}
      className={cn(
        "flex snap-x snap-mandatory gap-[18px] overflow-x-auto pb-1.5 [scroll-padding-left:0] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-ring",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One dot per page; hidden with a single page. */
export function CarouselDots({ className }: { className?: string }) {
  const { pages, page, overflows } = useCarousel();
  if (!overflows || pages <= 1) return null;
  return (
    <div data-carousel-dots aria-hidden="true" className={cn("flex h-2 items-center gap-1.5", className)}>
      {Array.from({ length: pages }, (_, i) => (
        <span
          key={i}
          data-carousel-dot
          className={cn("h-2 rounded-full transition-[width]", i === page ? "w-[22px] bg-primary" : "w-2 bg-border-soft")}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `components/trips/status-pill.tsx`**

```tsx
import type { TripCardKind } from "@/lib/trips/trip-status";
import { cardLabel } from "@/lib/trips/trip-status";
import { cn } from "@/lib/cn";

const FILL: Record<TripCardKind, string> = {
  "up-next": "bg-card",
  "on-the-road": "bg-card",
  planning: "bg-teal",
  idea: "bg-lilac",
  done: "bg-card",
};

/** 11px / 800 / 0.08em pill, 2px ink border (TRIPS_PAGE.md §4a–b). */
export function StatusPill({ kind, className }: { kind: TripCardKind; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border-2 border-border px-2.5 py-[3px] text-[11px] font-extrabold tracking-[0.08em] text-foreground",
        FILL[kind],
        className,
      )}
    >
      {cardLabel(kind)}
    </span>
  );
}
```

- [ ] **Step 5: Create `components/trips/next-step-chip.tsx`**

Reuse the icon and tone maps that `components/trip/home/desktop/sort-these-out-tile.tsx` keeps privately: open that file, export its `ICONS` and `TONES` constants (add `export` in front of each), then:

```tsx
import { ChevronRight } from "lucide-react";
import { AppLink } from "@/components/navigation/app-link";
import type { SortRow } from "@/lib/sort-these-out";
import { ICONS, TONES } from "@/components/trip/home/desktop/sort-these-out-tile";
import { cn } from "@/lib/cn";

/**
 * The hero card's next-step chip (TRIPS_PAGE.md §4a): the first "Sort these
 * out" row, a separate link that sits beside the card's stretched link.
 */
export function NextStepChip({ row }: { row: SortRow }) {
  const Icon = ICONS[row.icon];
  return (
    <AppLink
      href={row.href ?? "#"}
      className="relative z-10 mt-3.5 inline-flex max-w-full shrink-0 items-center gap-2.5 self-start whitespace-nowrap rounded-[12px] border-2 border-border bg-card px-3 py-[7px] text-sm font-bold text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span aria-hidden="true" className={cn("grid size-[22px] shrink-0 place-items-center rounded-[7px] border-2 border-border", TONES[row.tone])}>
        <Icon className="size-3" strokeWidth={2.5} />
      </span>
      <span className="truncate">{row.title}</span>
      <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
    </AppLink>
  );
}
```

- [ ] **Step 6: Create `components/trips/trip-card.tsx` and `trip-card-hero.tsx`**

`trip-card.tsx` (Server Component; both cards share the model type):

```tsx
import Link from "next/link";
import type { SortRow } from "@/lib/sort-these-out";
import { cardAccessibleName, type BigNumber, type TripCardKind } from "@/lib/trips/trip-status";
import { TripCover, type TripCoverInput } from "@/components/trips/trip-cover";
import { StatusPill } from "@/components/trips/status-pill";
import { cn } from "@/lib/cn";

export interface TripCardModel {
  id: string;
  name: string;
  kind: TripCardKind;
  big: BigNumber;
  dateLine: string;
  href: string;
  cover: TripCoverInput;
  /** Position among the standard cards (polaroid tilt). */
  index: number;
  /** Up next / On the road only: the first "Sort these out" row. */
  nextStep?: SortRow | null;
}

/** Stretched link: the whole card is one link; siblings with `relative z-10` stay clickable. */
export function StretchedLink({ model, className }: { model: TripCardModel; className?: string }) {
  return (
    <Link
      href={model.href}
      aria-label={cardAccessibleName(model.name, model.kind, model.big)}
      className={cn("absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring", className)}
    />
  );
}

/** Big number + stacked two-line unit. */
export function BigNumberBlock({ big, numberClass, unitClass }: { big: BigNumber; numberClass: string; unitClass: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className={cn("font-display font-extrabold", numberClass)}>{big.value}</span>
      {big.unit ? (
        <span className={cn("whitespace-pre-line font-display font-extrabold", unitClass)}>{`${big.unit[0]}\n${big.unit[1]}`}</span>
      ) : null}
    </div>
  );
}

/** Standard card (TRIPS_PAGE.md §4b): 300×280 desktop, 220 wide mobile (cover hidden). */
export function TripCard({ model }: { model: TripCardModel }) {
  const { kind } = model;
  return (
    <article
      className={cn(
        "relative flex h-[250px] w-[220px] shrink-0 snap-start flex-col overflow-hidden rounded-[22px] border-2 border-border p-[18px] shadow-hard-2",
        "md:h-[280px] md:w-[300px] md:rounded-[24px] md:p-5 md:shadow-hard-3",
        kind === "done" ? "bg-canvas" : "bg-card",
      )}
    >
      <StretchedLink model={model} />
      <div className="pointer-events-none absolute right-[18px] top-[22px] hidden md:block">
        <div className="pointer-events-auto">
          <TripCover {...model.cover} size="small" index={model.index} />
        </div>
      </div>
      <StatusPill kind={kind} className="self-start" />
      <div className="mt-auto">
        <BigNumberBlock big={model.big} numberClass="text-[48px] leading-[0.85] tracking-[-0.05em] md:text-[56px]" unitClass="text-[14px] leading-[1.02] md:text-[16px]" />
        <h2 className="mt-3 truncate font-display text-[20px] font-extrabold leading-[1.1] md:text-[22px]">{model.name}</h2>
        {kind === "idea" ? (
          <Link href={`/trips/${model.id}/settings`} className="relative z-10 mt-1 inline-block text-[13px] font-semibold text-foreground underline-offset-2 hover:underline md:text-sm">
            {model.dateLine}
          </Link>
        ) : (
          <p className="mt-1 text-[13px] font-semibold text-foreground md:text-sm">{model.dateLine}</p>
        )}
      </div>
    </article>
  );
}
```

`trip-card-hero.tsx`:

```tsx
import { StatusPill } from "@/components/trips/status-pill";
import { NextStepChip } from "@/components/trips/next-step-chip";
import { TripCover } from "@/components/trips/trip-cover";
import { StretchedLink, BigNumberBlock, type TripCardModel } from "@/components/trips/trip-card";

/** "Up next" hero (TRIPS_PAGE.md §4a, §8): coral, 600×280 desktop; 300×250 mobile with the chip dropped. */
export function TripCardHero({ model }: { model: TripCardModel }) {
  return (
    <article className="island relative flex h-[250px] w-[300px] shrink-0 snap-start gap-5 overflow-hidden rounded-[22px] border-2 border-border bg-coral p-[18px] shadow-hard-2 md:h-[280px] md:w-[600px] md:rounded-[24px] md:px-6 md:py-[22px] md:shadow-hard-3">
      <StretchedLink model={model} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <StatusPill kind={model.kind} />
          <span className="hidden truncate text-[13px] font-bold md:block">{model.dateLine}</span>
        </div>
        <h2 className="mt-3 hidden font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.02em] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden md:[display:-webkit-box]">
          {model.name}
        </h2>
        <div className="mt-auto">
          <BigNumberBlock big={model.big} numberClass="text-[72px] leading-[0.85] tracking-[-0.06em] md:text-[96px]" unitClass="text-[18px] leading-[1.02] md:text-[24px]" />
          <h2 className="mt-2 font-display text-[20px] font-extrabold leading-[1.05] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden md:hidden">
            {model.name}
          </h2>
          <p className="mt-1 text-[13px] font-semibold md:hidden">{model.dateLine}</p>
        </div>
        {model.nextStep ? <div className="hidden md:block"><NextStepChip row={model.nextStep} /></div> : null}
      </div>
      <div className="pointer-events-none absolute right-4 top-[18px] md:static md:flex md:items-center">
        <div className="pointer-events-auto md:hidden"><TripCover {...model.cover} size="mobile-hero" /></div>
        <div className="pointer-events-auto hidden md:block"><TripCover {...model.cover} size="hero" /></div>
      </div>
    </article>
  );
}
```

Note the hero renders the name twice with `md:` visibility swaps (above the number on desktop, below it on mobile, per §4a vs §8); tests count links, not headings.

- [ ] **Step 7: Run tests**

Run: `npx vitest run components/trips/trip-carousel.test.tsx components/trips/trip-card.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/trips/trip-carousel.tsx components/trips/trip-card.tsx components/trips/trip-card-hero.tsx components/trips/status-pill.tsx components/trips/next-step-chip.tsx components/trip/home/desktop/sort-these-out-tile.tsx components/trips/trip-carousel.test.tsx components/trips/trip-card.test.tsx
git commit -m "feat(trips): scroll-snap carousel with arrows and dots; hero and standard trip cards

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Travels map with per-trip colours and filter chips

**Files:**
- Modify: `components/trips/travel-map.tsx` (rewrite), `components/trips/travel-map-loader.tsx` (unchanged API), `lib/map-palette.ts` (nothing new; uses `hueHex`, `MAP_FILL`)
- Create: `components/trips/travels-map-card.tsx` (client)
- Test: `components/trips/travel-map.test.tsx` (rewrite), `components/trips/travels-map-card.test.tsx`

**Interfaces:**
- Consumes: `Hue`, `hueHex`, `mapInk`, `pinHtml`, `cartoTiles`, `applyLeafletIconDefaults`, `useTheme`, `createLeafletMock` (tests), `Popover` from `@/components/ui/popover`.
- Produces:
  ```ts
  export interface TravelMapTrip { id: string; name: string; hue: Hue; when: "past" | "now" | "upcoming"; points: { lat: number; lng: number; name: string }[] }
  export interface TravelMapProps { trips: TravelMapTrip[]; filterTripId: string | null; variant: "desktop" | "mobile"; onFail?: () => void }
  export function TravelMap(props: TravelMapProps): JSX.Element;
  export function TravelsMapCard({ trips, variant, empty?: boolean }): JSX.Element;   // card + overlay chips + Globe pill + attribution; wraps TravelMapLoader
  ```

- [ ] **Step 1: Write the failing tests**

Replace `components/trips/travel-map.test.tsx`:

```tsx
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createLeafletMock } from "@/test/leaflet-mock";
import { hueHex } from "@/lib/map-palette";

const hoisted = vi.hoisted(() => ({
  leaflet: null as ReturnType<typeof import("@/test/leaflet-mock").createLeafletMock> | null,
  theme: "light" as "light" | "dark",
}));
vi.mock("@/components/ui/theme-provider", () => ({ useTheme: () => ({ theme: hoisted.theme, setTheme: vi.fn(), toggleTheme: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/trips", useSearchParams: () => new URLSearchParams() }));

import { TravelMap, type TravelMapTrip } from "./travel-map";

const europe: TravelMapTrip = { id: "t1", name: "Europe", hue: "coral", when: "upcoming", points: [{ lat: 51.5, lng: -0.12, name: "London" }, { lat: 41.9, lng: 12.5, name: "Rome" }] };
const nz: TravelMapTrip = { id: "t2", name: "NZ", hue: "leaf", when: "past", points: [{ lat: -45, lng: 168.7, name: "Queenstown" }] };

beforeEach(() => {
  hoisted.leaflet = createLeafletMock();
  hoisted.theme = "light";
  vi.doMock("leaflet", () => hoisted.leaflet!.module);
});

describe("TravelMap", () => {
  it("draws a 20px pin per point in the trip colour and a dashed ink line per trip, at full opacity for done trips", async () => {
    render(<TravelMap trips={[europe, nz]} filterTripId={null} variant="desktop" />);
    await waitFor(() => expect(hoisted.leaflet!.markers).toHaveLength(3));
    const html = String(hoisted.leaflet!.markers[0].options.icon.html);
    expect(html).toContain(hueHex("coral"));
    expect(html).toContain("width:20px");
    expect(hoisted.leaflet!.polylines).toHaveLength(1);
    expect(hoisted.leaflet!.polylines[0].options).toMatchObject({ dashArray: "6 5", weight: 1.5, opacity: 1 });
    expect(String(hoisted.leaflet!.markers[2].options.icon.html)).toContain(hueHex("leaf"));
  });
  it("fits bounds to the filtered trip only, with 40px padding", async () => {
    render(<TravelMap trips={[europe, nz]} filterTripId="t2" variant="desktop" />);
    await waitFor(() => expect(hoisted.leaflet!.maps[0].fitBounds).toHaveBeenCalled());
    const [bounds, opts] = hoisted.leaflet!.maps[0].fitBounds.mock.calls.at(-1)!;
    expect(opts).toEqual({ padding: [40, 40] });
    expect(JSON.stringify(bounds)).toContain("168.7");
    expect(JSON.stringify(bounds)).not.toContain("12.5");
  });
  it("has no zoom control and no scroll-wheel zoom", async () => {
    render(<TravelMap trips={[europe]} filterTripId={null} variant="desktop" />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.maps[0].options).toMatchObject({ zoomControl: false, scrollWheelZoom: false, dragging: true, attributionControl: false });
  });
  it("mobile uses 14px pins", async () => {
    render(<TravelMap trips={[europe]} filterTripId={null} variant="mobile" />);
    await waitFor(() => expect(hoisted.leaflet!.markers).toHaveLength(2));
    expect(String(hoisted.leaflet!.markers[0].options.icon.html)).toContain("width:14px");
  });
  it("with no trips shows the world", async () => {
    render(<TravelMap trips={[]} filterTripId={null} variant="desktop" />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.maps[0].setView).toHaveBeenCalledWith([20, 0], 1);
  });
});
```

Check `test/leaflet-mock.ts` for the exact names of its recorded arrays (`markers`, `polylines`, `maps`) and adjust the assertions to what it exposes.

```tsx
// components/trips/travels-map-card.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mapMock = vi.fn();
vi.mock("./travel-map-loader", () => ({ TravelMapLoader: (p: Record<string, unknown>) => { mapMock(p); return <div data-testid="map" />; } }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a> }));

import { TravelsMapCard } from "./travels-map-card";

const trips = ["a", "b", "c", "d", "e"].map((id, i) => ({ id, name: `Trip ${id}`, hue: "coral" as const, when: "upcoming" as const, points: [{ lat: i, lng: i, name: "x" }] }));

describe("TravelsMapCard", () => {
  it("shows the title pill, All trips active, at most 3 trip chips, then +N", () => {
    render(<TravelsMapCard trips={trips} variant="desktop" />);
    expect(screen.getByText("Your travels")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All trips" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /^Trip / })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "+2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Globe →" })).toHaveAttribute("href", "/globe");
    expect(screen.getByText("© OpenStreetMap · CARTO")).toBeInTheDocument();
  });
  it("selecting a chip filters the map", () => {
    render(<TravelsMapCard trips={trips} variant="desktop" />);
    fireEvent.click(screen.getByRole("button", { name: "Trip b" }));
    expect(mapMock).toHaveBeenLastCalledWith(expect.objectContaining({ filterTripId: "b" }));
    expect(screen.getByRole("button", { name: "Trip b" })).toHaveAttribute("aria-pressed", "true");
  });
  it("mobile has no chips and the whole card links to the Globe", () => {
    render(<TravelsMapCard trips={trips} variant="mobile" />);
    expect(screen.queryByRole("button", { name: "All trips" })).toBeNull();
    expect(screen.getByRole("link", { name: /Globe/ })).toHaveAttribute("href", "/globe");
  });
  it("empty state shows the hint and no chips", () => {
    render(<TravelsMapCard trips={[]} variant="desktop" empty />);
    expect(screen.getByText("Your map fills in as you go")).toBeInTheDocument();
    expect(screen.getByText("Every stop you add gets a pin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "All trips" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/trips/travel-map.test.tsx components/trips/travels-map-card.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite `components/trips/travel-map.tsx`**

Keep the file's structure (dynamic `import("leaflet")`, theme-swap effect, `applyLeafletIconDefaults`) and change:

```tsx
"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { useTheme } from "@/components/ui/theme-provider";
import { cartoTiles } from "@/lib/map-tiles";
import { applyLeafletIconDefaults } from "@/lib/map-icons";
import { pinHtml } from "@/lib/map-pins";
import { hueHex, mapInk } from "@/lib/map-palette";
import type { Hue } from "@/lib/hues";

export interface TravelMapPoint { lat: number; lng: number; name: string }
export type TravelWhen = "past" | "now" | "upcoming";
export interface TravelMapTrip { id: string; name: string; hue: Hue; when: TravelWhen; points: TravelMapPoint[] }
export interface TravelMapProps {
  trips: TravelMapTrip[];
  /** null = every trip. */
  filterTripId: string | null;
  variant: "desktop" | "mobile";
}

const WORLD: [[number, number], number] = [[20, 0], 1];

function pointIcon(L: typeof import("leaflet"), hue: Hue, dark: boolean, size: number) {
  return L.divIcon({
    html: pinHtml({ variant: "stop", fill: hueHex(hue, dark), dark, size }),
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * "Your travels" map (TRIPS_PAGE.md §5, §8; CONTEXT.md "Your travels", "Trip
 * colour"): every trip's located Stops as 20px pins (14px on mobile) in the
 * trip's colour, legs joined by a dashed ink line. Never a leg from the Home
 * base (the loader never includes it). Done trips draw at full opacity.
 */
export function TravelMap({ trips, filterTripId, variant }: TravelMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlaysRef = useRef<{ L: typeof import("leaflet"); layers: any[] } | null>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const pin = variant === "mobile" ? 14 : 20;
  const shown = filterTripId ? trips.filter((t) => t.id === filterTripId) : trips;

  // Build once.
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;
    import("leaflet").then((leaflet) => {
      const L = leaflet.default ?? leaflet;
      applyLeafletIconDefaults(L);
      if (!mapRef.current) return;
      const map = L.map(mapRef.current, {
        zoomControl: false,
        scrollWheelZoom: false,
        dragging: true,
        attributionControl: false,
        worldCopyJump: false,
        maxBounds: [[-85, -180], [85, 180]],
        maxBoundsViscosity: 1,
        minZoom: 1,
      });
      leafletMapRef.current = map;
      const tiles = cartoTiles(isDark);
      tileLayerRef.current = L.tileLayer(tiles.url, { subdomains: tiles.subdomains, maxZoom: tiles.maxZoom, noWrap: true }).addTo(map);
      overlaysRef.current = { L, layers: [] };
      draw();
    });
    return () => {
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
      overlaysRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const map = leafletMapRef.current;
    const o = overlaysRef.current;
    if (!map || !o) return;
    for (const layer of o.layers) layer.remove();
    o.layers = [];
    const k = mapInk(isDark);
    const all: [number, number][] = [];
    for (const trip of shown) {
      const latlngs = trip.points.map((p) => [p.lat, p.lng] as [number, number]);
      all.push(...latlngs);
      if (latlngs.length >= 2) {
        o.layers.push(o.L.polyline(latlngs, { color: k.ink, weight: 1.5, opacity: 1, dashArray: "6 5" }).addTo(map));
      }
      for (const [lat, lng] of latlngs) {
        o.layers.push(o.L.marker([lat, lng], { icon: pointIcon(o.L, trip.hue, isDark, pin), keyboard: false }).addTo(map));
      }
    }
    if (all.length > 0) {
      map.fitBounds(o.L.latLngBounds(all), { padding: [40, 40] });
      if (map.getZoom() < 1) map.setZoom(1);
    } else {
      map.setView(...WORLD);
    }
  }

  // Redraw on data / filter / theme change (theme swaps tiles in place; the map is never rebuilt).
  useEffect(() => {
    tileLayerRef.current?.setUrl(cartoTiles(isDark).url);
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, filterTripId, shown.map((t) => `${t.id}:${t.hue}:${t.points.length}`).join("|"), pin]);

  return <div ref={mapRef} className="tp-map absolute inset-0 bg-map-fill" aria-label="Your travels map" />;
}
```

Because `draw()` runs inside the first effect's `.then` before the second effect can see a map, the first draw happens from the build; the second effect's early call is a no-op until the map exists. Keep `draw` a plain function (not memoised).

- [ ] **Step 4: Create `components/trips/travels-map-card.tsx`**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { TravelMapLoader } from "@/components/trips/travel-map-loader";
import type { TravelMapTrip } from "@/components/trips/travel-map";
import { ErrorPanel } from "@/components/ui/error-panel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HUE_CLASSES } from "@/lib/hues";
import { cn } from "@/lib/cn";

const MAX_CHIPS = 3;
const CHIP = "inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-2 border-border px-3 text-[13px] font-bold";

class MapBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return <ErrorPanel layout="card" headingLevel={3} title="The map didn’t load" description="The rest of the page still works." className="absolute inset-4 justify-center border-0 bg-transparent px-4 py-4" />;
    }
    return this.props.children;
  }
}

function TripChip({ trip, selected, onSelect }: { trip: TravelMapTrip; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} className={cn(CHIP, selected ? "bg-primary text-primary-foreground" : "bg-card text-foreground")}>
      <span aria-hidden="true" className={cn("size-2.5 rounded-full", HUE_CLASSES[trip.hue].dot)} />
      {trip.name}
    </button>
  );
}

export interface TravelsMapCardProps {
  trips: TravelMapTrip[];
  variant: "desktop" | "mobile";
  /** First run: world view, no chips, centred hint. */
  empty?: boolean;
  className?: string;
}

/** TRIPS_PAGE.md §5 (desktop) and §8.4 (mobile). The map fills the card; chips overlay it. */
export function TravelsMapCard({ trips, variant, empty = false, className }: TravelsMapCardProps) {
  const [filter, setFilter] = React.useState<string | null>(null);
  const mobile = variant === "mobile";
  const visible = trips.slice(0, MAX_CHIPS);
  const overflow = trips.slice(MAX_CHIPS);
  const card = cn(
    "relative overflow-hidden border-2 border-border bg-map-fill",
    mobile ? "h-[190px] rounded-[22px] shadow-hard-2" : "h-full min-h-0 rounded-[24px] shadow-hard-3",
    className,
  );
  const body = (
    <>
      <MapBoundary>
        <TravelMapLoader trips={trips} filterTripId={filter} variant={variant} />
      </MapBoundary>
      <div className={cn("pointer-events-none absolute left-4 top-4 z-[500] flex items-center gap-2", mobile && "left-3.5 top-3.5")}>
        <span className={cn("shrink-0 whitespace-nowrap rounded-full border-2 border-border bg-card font-display font-extrabold text-foreground", mobile ? "px-3 py-0.5 text-[16px]" : "px-3.5 py-[3px] text-[20px]")}>
          Your travels
        </span>
        {!mobile && !empty && trips.length > 0 ? (
          <div className="pointer-events-auto flex items-center gap-2">
            <button type="button" aria-pressed={filter === null} onClick={() => setFilter(null)} className={cn(CHIP, filter === null ? "bg-primary text-primary-foreground" : "bg-card text-foreground")}>
              All trips
            </button>
            {visible.map((t) => <TripChip key={t.id} trip={t} selected={filter === t.id} onSelect={() => setFilter(t.id)} />)}
            {overflow.length > 0 ? (
              <Popover>
                <PopoverTrigger className={cn(CHIP, overflow.some((t) => t.id === filter) ? "bg-primary text-primary-foreground" : "bg-card text-foreground")}>+{overflow.length}</PopoverTrigger>
                <PopoverContent align="start" className="flex flex-col gap-1.5 p-2">
                  {overflow.map((t) => <TripChip key={t.id} trip={t} selected={filter === t.id} onSelect={() => setFilter(t.id)} />)}
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        ) : null}
      </div>
      {empty ? (
        <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center">
          {mobile ? (
            <span className="whitespace-nowrap rounded-[12px] border-2 border-border bg-card px-3 py-1.5 text-[13px] font-bold text-foreground">Pins appear as you add stops</span>
          ) : (
            <div className="flex items-center gap-3 whitespace-nowrap rounded-[16px] border-2 border-border bg-card px-[18px] py-3.5 shadow-hard-1">
              <span aria-hidden="true" className="size-[26px] rounded-full border-2 border-dashed border-border" />
              <span className="flex flex-col">
                <span className="text-[15px] font-bold text-foreground">Your map fills in as you go</span>
                <span className="text-[13px] text-muted-foreground">Every stop you add gets a pin</span>
              </span>
            </div>
          )}
        </div>
      ) : null}
      {!mobile ? (
        <Link href="/globe" className="absolute bottom-4 right-4 z-[500] whitespace-nowrap rounded-full border-2 border-border bg-card px-3.5 py-1.5 text-[13px] font-bold text-foreground shadow-hard-1">
          Open Globe →
        </Link>
      ) : (
        <span aria-hidden="true" className="absolute bottom-3.5 right-3.5 z-[500] whitespace-nowrap rounded-full border-2 border-border bg-card px-3 py-1 text-[12px] font-bold text-foreground">Globe →</span>
      )}
      <p className="pointer-events-none absolute bottom-3 left-4 z-[500] text-[11px] font-semibold text-muted-foreground">© OpenStreetMap · CARTO</p>
    </>
  );
  if (mobile) {
    return (
      <Link href="/globe" aria-label="Your travels — open the Globe" className={cn(card, "block")}>
        {body}
      </Link>
    );
  }
  return <section aria-label="Your travels" className={card}>{body}</section>;
}
```

Update `travel-map-loader.tsx` only if its `TravelMapProps` import path changed (it should not).

- [ ] **Step 5: Run tests**

Run: `npx vitest run components/trips/travel-map.test.tsx components/trips/travels-map-card.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/trips/travel-map.tsx components/trips/travel-map.test.tsx components/trips/travels-map-card.tsx components/trips/travels-map-card.test.tsx
git commit -m "feat(trips): travels map card — per-trip colours, filter chips, Globe pill

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Tally — pure helper and card

**Files:**
- Create: `lib/trips/tally.ts`, `components/trips/tally-card.tsx` (client), `components/trips/tally-empty.tsx`, `components/trips/tally-strip.tsx`
- Modify: `app/globals.css` (height container query rule)
- Test: `lib/trips/tally.test.ts`, `components/trips/tally-card.test.tsx`

**Interfaces:**
- Consumes: `TravelStats` from `@/lib/travel-stats`; `Segmented`, `SegmentedItem` from `@/components/ui/segmented`.
- Produces:
  ```ts
  export type TallyMode = "planned" | "been";
  export interface TallyCell { key: string; label: string; value: string }
  export function tallyFor(stats: TravelStats, mode: TallyMode): { countries: number; headline: [string, string]; cells: TallyCell[] };
  export function defaultTallyMode(hasDoneTrip: boolean): TallyMode;
  export function formatKm(km: number, short?: boolean): string;   // "36,309 km" | "36k km"
  export const TALLY_MODE_KEY = "teepee:tally-mode";
  export function TallyCard({ stats, hasDoneTrip }): JSX.Element;
  export function TallyEmpty(): JSX.Element;
  export function TallyStrip({ stats, hasDoneTrip }): JSX.Element;   // mobile 3-column, no toggle
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/trips/tally.test.ts
import { describe, it, expect } from "vitest";
import { tallyFor, defaultTallyMode, formatKm } from "./tally";
import type { TravelStats } from "@/lib/travel-stats";

const pair = (done: number, planned: number) => ({ done, planned });
const stats: TravelStats = {
  countries: { done: ["fr", "it", "nz"], planned: ["id", "jp"] },
  places: pair(4, 12), trips: pair(1, 3), nightsAway: pair(9, 45), accommodationNights: pair(0, 20),
  transport: { FLIGHT: pair(2, 6), TRAIN: pair(0, 3), BUS: pair(0, 0), FERRY: pair(0, 0), CAR: pair(0, 0) },
  distanceKm: pair(2140, 36309), longestTrip: null, mostVisitedCountry: null, farthestFromHome: null,
};

describe("tallyFor", () => {
  it("been: countries visited + places, nights, km, flights in order, zeros dropped", () => {
    const t = tallyFor(stats, "been");
    expect(t.countries).toBe(3);
    expect(t.headline).toEqual(["countries", "visited"]);
    expect(t.cells).toEqual([
      { key: "places", label: "places", value: "4" },
      { key: "nights", label: "nights away", value: "9" },
      { key: "km", label: "travelled", value: "2,140 km" },
      { key: "flights", label: "flights", value: "2" },
    ]);
  });
  it("planned: on the list + nights booked + trains", () => {
    const t = tallyFor(stats, "planned");
    expect(t.headline).toEqual(["countries", "on the list"]);
    expect(t.cells.map((c) => c.key)).toEqual(["places", "nights", "km", "booked", "flights", "trains"]);
    expect(t.cells.find((c) => c.key === "km")!.value).toBe("36,309 km");
  });
});

describe("defaultTallyMode", () => {
  it("been when a trip is done, else planned", () => {
    expect(defaultTallyMode(true)).toBe("been");
    expect(defaultTallyMode(false)).toBe("planned");
  });
});

describe("formatKm", () => {
  it("thousands separator and short form", () => {
    expect(formatKm(36309)).toBe("36,309 km");
    expect(formatKm(36309, true)).toBe("36k km");
    expect(formatKm(950, true)).toBe("950 km");
  });
});
```

```tsx
// components/trips/tally-card.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TallyCard, TallyStrip } from "./tally-card";
import type { TravelStats } from "@/lib/travel-stats";

const pair = (done: number, planned: number) => ({ done, planned });
const stats: TravelStats = {
  countries: { done: ["fr", "it", "nz"], planned: ["id", "jp"] },
  places: pair(4, 12), trips: pair(1, 3), nightsAway: pair(9, 45), accommodationNights: pair(0, 20),
  transport: { FLIGHT: pair(2, 6), TRAIN: pair(0, 3), BUS: pair(0, 0), FERRY: pair(0, 0), CAR: pair(0, 0) },
  distanceKm: pair(2140, 36309), longestTrip: null, mostVisitedCountry: null, farthestFromHome: null,
};

beforeEach(() => localStorage.clear());

describe("TallyCard", () => {
  it("defaults to Been when a trip is done and persists a switch", () => {
    render(<TallyCard stats={stats} hasDoneTrip />);
    expect(screen.getByRole("radio", { name: "Been" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Planned" }));
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/on the list/)).toBeInTheDocument();
    expect(localStorage.getItem("teepee:tally-mode")).toBe("planned");
  });
  it("reads the saved mode", () => {
    localStorage.setItem("teepee:tally-mode", "planned");
    render(<TallyCard stats={stats} hasDoneTrip />);
    expect(screen.getByRole("radio", { name: "Planned" })).toHaveAttribute("aria-checked", "true");
  });
  it("never shows 0 countries: with none done it starts in Planned", () => {
    render(<TallyCard stats={{ ...stats, countries: { done: [], planned: ["jp"] } }} hasDoneTrip={false} />);
    expect(screen.getByRole("radio", { name: "Planned" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("TallyStrip", () => {
  it("shows countries, nights and short km with a mode label", () => {
    render(<TallyStrip stats={stats} hasDoneTrip={false} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("36k km")).toBeInTheDocument();
    expect(screen.getByText("planned")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/trips/tally.test.ts components/trips/tally-card.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `lib/trips/tally.ts`**

```ts
/**
 * Tally (TRIPS_PAGE.md §6; spec P8): Planned vs Been aggregates straight
 * from computeTravelStats. Pure.
 */
import type { TravelStats } from "@/lib/travel-stats";

export type TallyMode = "planned" | "been";
export const TALLY_MODE_KEY = "teepee:tally-mode";

export interface TallyCell {
  key: string;
  label: string;
  value: string;
}

export function formatKm(km: number, short = false): string {
  const n = Math.round(km);
  if (short && n >= 1000) return `${Math.round(n / 1000)}k km`;
  return `${n.toLocaleString("en-AU")} km`;
}

export function defaultTallyMode(hasDoneTrip: boolean): TallyMode {
  return hasDoneTrip ? "been" : "planned";
}

export function tallyFor(stats: TravelStats, mode: TallyMode): { countries: number; headline: [string, string]; cells: TallyCell[] } {
  const k = mode === "been" ? "done" : "planned";
  const raw: { key: string; label: string; n: number; fmt?: (n: number) => string }[] = [
    { key: "places", label: "places", n: stats.places[k] },
    { key: "nights", label: "nights away", n: stats.nightsAway[k] },
    { key: "km", label: "travelled", n: stats.distanceKm[k], fmt: (n) => formatKm(n) },
    ...(mode === "planned" ? [{ key: "booked", label: "nights booked", n: stats.accommodationNights.planned }] : []),
    { key: "flights", label: "flights", n: stats.transport.FLIGHT[k] },
    ...(mode === "planned" ? [{ key: "trains", label: "trains", n: stats.transport.TRAIN.planned }] : []),
  ];
  return {
    countries: stats.countries[k].length,
    headline: mode === "been" ? ["countries", "visited"] : ["countries", "on the list"],
    cells: raw.filter((c) => c.n > 0).map((c) => ({ key: c.key, label: c.label, value: c.fmt ? c.fmt(c.n) : String(c.n) })),
  };
}
```

- [ ] **Step 4: Add the height container-query rule to `app/globals.css`** (after the `:root { --tp-tab-bar-h }` block)

```css
/* Tally card (TRIPS_PAGE.md §6): 4 stat cells at 900px tall, 6 when the card is ≥ 440px tall. */
.tally-card { container-type: size; }
.tally-cell-extra { display: none; }
@container (min-height: 440px) {
  .tally-cell-extra { display: block; }
}
```

- [ ] **Step 5: Create `components/trips/tally-card.tsx`**

```tsx
"use client";

import * as React from "react";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import type { TravelStats } from "@/lib/travel-stats";
import { tallyFor, defaultTallyMode, formatKm, TALLY_MODE_KEY, type TallyMode } from "@/lib/trips/tally";
import { cn } from "@/lib/cn";

function readSaved(): TallyMode | null {
  try {
    const v = window.localStorage.getItem(TALLY_MODE_KEY);
    return v === "planned" || v === "been" ? v : null;
  } catch {
    return null;
  }
}

function useTallyMode(hasDoneTrip: boolean): [TallyMode, (m: TallyMode) => void] {
  const [mode, setMode] = React.useState<TallyMode>(() => defaultTallyMode(hasDoneTrip));
  React.useEffect(() => {
    const saved = readSaved();
    if (saved) setMode(saved);
  }, []);
  const set = (m: TallyMode) => {
    setMode(m);
    try { window.localStorage.setItem(TALLY_MODE_KEY, m); } catch { /* private mode */ }
  };
  return [mode, set];
}

export interface TallyProps {
  stats: TravelStats;
  hasDoneTrip: boolean;
}

/** Desktop Tally (TRIPS_PAGE.md §6): sun card, Planned | Been toggle, headline, stats grid. */
export function TallyCard({ stats, hasDoneTrip }: TallyProps) {
  const [mode, setMode] = useTallyMode(hasDoneTrip);
  const t = tallyFor(stats, mode);
  return (
    <section aria-label="Tally" className="tally-card island flex h-full min-h-0 flex-col rounded-[24px] border-2 border-border bg-sun px-[22px] py-5 shadow-hard-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-on-accent-muted">Tally</span>
        <Segmented type="single" value={mode} onValueChange={(v) => v && setMode(v as TallyMode)} tone="ink" aria-label="Tally mode" className="gap-0 p-0 [&>button]:h-auto [&>button]:min-w-0 [&>button]:px-2.5 [&>button]:py-1 [&>button]:text-[12px]">
          <SegmentedItem value="planned">Planned</SegmentedItem>
          <SegmentedItem value="been">Been</SegmentedItem>
        </Segmented>
      </div>
      <div className="mt-2.5 flex items-baseline gap-2.5">
        <span className="font-display text-[56px] font-extrabold leading-[0.9] tracking-[-0.04em]">{t.countries}</span>
        <span className="whitespace-pre-line font-display text-[20px] font-extrabold leading-[1.02]">{`${t.headline[0]}\n${t.headline[1]}`}</span>
      </div>
      <dl className="mt-auto grid grid-cols-2 gap-x-4 border-t-2 border-border">
        {t.cells.map((c, i) => (
          <div key={c.key} className={cn("border-b-2 border-border/20 py-2", i >= 4 && "tally-cell-extra")}>
            <dd className="font-display text-[20px] font-extrabold leading-[1.1]">{c.value}</dd>
            <dt className="text-[13px] font-semibold text-on-accent-muted">{c.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Mobile tally strip (TRIPS_PAGE.md §8.5): countries, nights, km; no toggle. */
export function TallyStrip({ stats, hasDoneTrip }: TallyProps) {
  const mode = defaultTallyMode(hasDoneTrip);
  const k = mode === "been" ? "done" : "planned";
  const cells = [
    { v: String(stats.countries[k].length), l: "countries" },
    { v: String(stats.nightsAway[k]), l: "nights" },
    { v: formatKm(stats.distanceKm[k], true), l: mode },
  ];
  return (
    <section aria-label="Tally" className="island grid grid-cols-3 rounded-[22px] border-2 border-border bg-sun px-4 py-3.5 shadow-hard-2">
      {cells.map((c) => (
        <div key={c.l}>
          <div className="font-display text-[22px] font-extrabold leading-none">{c.v}</div>
          <div className="mt-1 text-[12px] font-semibold text-on-accent-muted">{c.l}</div>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 6: Create `components/trips/tally-empty.tsx`** (Server Component)

```tsx
/** First-run Tally (TRIPS_PAGE.md §7): dashed, no fill, no toggle, four "—" cells. */
export function TallyEmpty() {
  const cells = ["countries", "places", "nights away", "km travelled"];
  return (
    <section aria-label="Tally" className="flex h-full min-h-0 flex-col rounded-[24px] border-2 border-dashed border-border px-[22px] py-5">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Tally</span>
      <p className="mt-2 font-display text-[22px] font-extrabold leading-[1.1] text-foreground">Starts counting with your first trip</p>
      <dl className="mt-auto grid grid-cols-2 gap-x-4 border-t-2 border-border">
        {cells.map((l) => (
          <div key={l} className="border-b-2 border-border/20 py-2">
            <dd className="font-display text-[20px] font-extrabold leading-[1.1] text-border-soft">—</dd>
            <dt className="text-[13px] font-semibold text-muted-foreground">{l}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run lib/trips/tally.test.ts components/trips/tally-card.test.tsx`
Expected: PASS. If Radix ToggleGroup items report `role="radio"` only with `type="single"` (they do), the role queries hold.

- [ ] **Step 8: Commit**

```bash
git add lib/trips/tally.ts lib/trips/tally.test.ts components/trips/tally-card.tsx components/trips/tally-card.test.tsx components/trips/tally-empty.tsx app/globals.css
git commit -m "feat(trips): tally card with Planned/Been toggle, mobile strip, empty state

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: First-run cards and the `startFirstTrip` action

**Files:**
- Create: `app/(app)/trips/actions.ts`, `components/trips/first-trip-card.tsx` (client), `components/trips/past-trip-card.tsx`
- Test: `app/(app)/trips/actions.test.ts`, `components/trips/first-trip-card.test.tsx`

**Interfaces:**
- Consumes: `createTrip` from `@/server/actions/trips`; `DEFAULT_HOME_CURRENCY` from `@/lib/currencies`; `CreateTripResult`.
- Produces: `startFirstTrip(name: string): Promise<CreateTripResult>` (redirects on success); `FirstTripCard({ variant: "desktop" | "mobile" })`; `PastTripCard({ variant })`. The past-trip link is `/trips/new?past=1` (Task 13 makes the page honour it).

- [ ] **Step 1: Write the failing tests**

```ts
// app/(app)/trips/actions.test.ts
import { describe, it, expect, vi } from "vitest";

const createTripMock = vi.fn();
vi.mock("@/server/actions/trips", () => ({ createTrip: createTripMock }));

import { startFirstTrip } from "./actions";

describe("startFirstTrip", () => {
  it("creates with the default currency and no dates", async () => {
    createTripMock.mockResolvedValue({ success: true, tripId: "t1" });
    await startFirstTrip("  Japan in spring ");
    expect(createTripMock).toHaveBeenCalledWith({ name: "Japan in spring", homeCurrency: "AUD" }, null);
  });
  it("returns the validation failure", async () => {
    createTripMock.mockResolvedValue({ success: false, errors: { name: ["Trip name is required"] } });
    const r = await startFirstTrip("");
    expect(r).toEqual({ success: false, errors: { name: ["Trip name is required"] } });
  });
});
```

```tsx
// components/trips/first-trip-card.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const startFirstTrip = vi.fn();
vi.mock("@/app/(app)/trips/actions", () => ({ startFirstTrip: (n: string) => startFirstTrip(n) }));

import { FirstTripCard } from "./first-trip-card";

beforeEach(() => startFirstTrip.mockReset());

describe("FirstTripCard", () => {
  it("whitespace keeps the button disabled", () => {
    render(<FirstTripCard variant="desktop" />);
    const btn = screen.getByRole("button", { name: "Start planning" });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Trip name" }), { target: { value: "   " } });
    expect(btn).toBeDisabled();
    fireEvent.submit(btn.closest("form")!);
    expect(startFirstTrip).not.toHaveBeenCalled();
  });
  it("submits on Enter with the trimmed name and shows Starting…", async () => {
    startFirstTrip.mockImplementation(() => new Promise(() => {}));
    render(<FirstTripCard variant="desktop" />);
    const input = screen.getByRole("textbox", { name: "Trip name" });
    fireEvent.change(input, { target: { value: " Japan in spring " } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(startFirstTrip).toHaveBeenCalledWith("Japan in spring"));
    expect(screen.getByRole("button", { name: "Starting…" })).toBeInTheDocument();
  });
  it("shows an inline error", async () => {
    startFirstTrip.mockResolvedValue({ success: false, errors: { name: ["Trip name must be 120 characters or fewer"] } });
    render(<FirstTripCard variant="desktop" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Trip name" }), { target: { value: "x" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("120 characters");
  });
  it("renders the heading and placeholder copy", () => {
    render(<FirstTripCard variant="desktop" />);
    expect(screen.getByRole("heading", { name: /Where to first\?/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Name it, e.g. Japan in spring")).toBeInTheDocument();
    expect(screen.getByText("FIRST TRIP")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "app/(app)/trips/actions.test.ts" components/trips/first-trip-card.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `app/(app)/trips/actions.ts`**

```ts
"use server";

import { createTrip, type CreateTripResult } from "@/server/actions/trips";
import { DEFAULT_HOME_CURRENCY } from "@/lib/currencies";

/**
 * The first-run card's "Start planning" (TRIPS_PAGE.md §7; spec P4): a name
 * is all we ask. Delegates to the one createTrip, which validates, creates
 * the Trip and owner membership, and redirects to /trips/{id}.
 */
export async function startFirstTrip(name: string): Promise<CreateTripResult> {
  return createTrip({ name: name.trim(), homeCurrency: DEFAULT_HOME_CURRENCY }, null);
}
```

- [ ] **Step 4: Create `components/trips/first-trip-card.tsx`**

```tsx
"use client";

import * as React from "react";
import { startFirstTrip } from "@/app/(app)/trips/actions";
import { cn } from "@/lib/cn";

/** Empty hero polaroid: dashed inner box reading "+ Cover / photo" (desktop) or "+ Photo" (mobile). Decorative. */
function EmptyPolaroid({ mobile }: { mobile: boolean }) {
  return (
    <div aria-hidden="true" className={cn("shrink-0 border-2 border-border bg-card", mobile ? "w-[86px] rounded-[8px] p-[5px] pb-[14px] shadow-hard-1 rotate-[5deg]" : "mr-3 w-[150px] self-center rounded-[10px] p-[7px] pb-[24px] shadow-hard-2 rotate-[4deg]")}>
      <div className="grid aspect-[3/4] place-items-center rounded-[4px] border-2 border-dashed border-border bg-background text-center text-[12px] font-bold leading-tight text-foreground">
        {mobile ? "+ Photo" : <>+ Cover<br />photo</>}
      </div>
    </div>
  );
}

export function FirstTripCard({ variant }: { variant: "desktop" | "mobile" }) {
  const mobile = variant === "mobile";
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const ready = name.trim().length > 0;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready || pending) return;
    setError(null);
    startTransition(async () => {
      const r = await startFirstTrip(name.trim());
      // On success the action redirects; we only get here on failure.
      if (r && !r.success) setError(r.errors.name?.[0] ?? r.errors._?.[0] ?? "Something went wrong. Try again.");
    });
  }

  return (
    <section
      aria-label="First trip"
      className={cn(
        "island relative flex overflow-hidden border-2 border-border bg-coral",
        mobile ? "flex-col rounded-[22px] p-[18px] shadow-hard-2" : "gap-6 rounded-[24px] p-6 shadow-hard-3",
      )}
    >
      {mobile ? <div className="absolute right-[18px] top-[18px]"><EmptyPolaroid mobile /></div> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="self-start whitespace-nowrap rounded-full border-2 border-border bg-card px-2.5 py-[3px] text-[11px] font-extrabold tracking-[0.08em]">FIRST TRIP</span>
        <h2 className={cn("font-display font-extrabold leading-[0.9] tracking-[-0.04em]", mobile ? "mt-14 text-[44px]" : "mt-auto text-[64px]")}>
          Where to<br />first?
        </h2>
        <form onSubmit={onSubmit} className={cn("flex", mobile ? "mt-4 flex-col gap-2.5" : "mt-[18px] items-center gap-2.5")}>
          <input
            aria-label="Trip name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name it, e.g. Japan in spring"
            disabled={pending}
            className={cn("h-12 rounded-[14px] border-2 border-border bg-card px-3.5 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring", mobile ? "w-full" : "min-w-0 flex-1")}
          />
          <button
            type="submit"
            disabled={!ready || pending}
            className={cn("h-12 shrink-0 whitespace-nowrap rounded-full border-2 border-border bg-primary px-5 text-[15px] font-extrabold text-primary-foreground shadow-[4px_4px_0_hsl(var(--sun))] disabled:opacity-60 disabled:shadow-none", mobile && "w-full")}
          >
            {pending ? "Starting…" : "Start planning"}
          </button>
        </form>
        {error ? <p role="alert" className="mt-2 text-[13px] font-semibold text-foreground">{error}</p> : null}
      </div>
      {!mobile ? <EmptyPolaroid mobile={false} /> : null}
    </section>
  );
}
```

- [ ] **Step 5: Create `components/trips/past-trip-card.tsx`** (Server Component)

```tsx
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export const PAST_TRIP_HREF = "/trips/new?past=1";

/** "Already been?" tile (desktop, TRIPS_PAGE.md §7) or row (mobile, §8). Opens the new-trip flow with its past flag (spec D1). */
export function PastTripCard({ variant }: { variant: "desktop" | "mobile" }) {
  if (variant === "mobile") {
    return (
      <Link href={PAST_TRIP_HREF} className="flex min-h-14 items-center gap-3 rounded-[18px] border-2 border-border bg-card px-3.5 py-3 shadow-hard-1">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[10px] border-2 border-border bg-teal font-display text-lg font-extrabold">+</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold text-foreground">Already been somewhere?</span>
          <span className="text-[13px] text-muted-foreground">Log a past trip for your map</span>
        </span>
        <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <section aria-label="Already been?" className="flex flex-col rounded-[24px] border-2 border-border bg-card p-[22px] shadow-hard-3">
      <span className="self-start whitespace-nowrap rounded-full border-2 border-border bg-teal px-2.5 py-[3px] text-[11px] font-extrabold tracking-[0.08em] text-on-accent">ALREADY BEEN?</span>
      <h2 className="mt-auto font-display text-[26px] font-extrabold leading-[1.05]">Log a past trip</h2>
      <p className="mt-1.5 text-sm leading-[1.45] text-foreground">Add where you went and when. It goes on your map and counts toward your tally.</p>
      <Link href={PAST_TRIP_HREF} className="mt-4 inline-flex h-11 w-fit items-center whitespace-nowrap rounded-full border-2 border-border bg-card px-[18px] text-sm font-extrabold text-foreground shadow-hard-1">
        + Past trip
      </Link>
    </section>
  );
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run "app/(app)/trips/actions.test.ts" components/trips/first-trip-card.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/trips/actions.ts" "app/(app)/trips/actions.test.ts" components/trips/first-trip-card.tsx components/trips/first-trip-card.test.tsx components/trips/past-trip-card.tsx
git commit -m "feat(trips): first-run cards and startFirstTrip action

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The trips page — loader, layout, loading state, old code removed

**Files:**
- Create: `lib/trips/trips-page-loader.ts`, `components/trips/trips-header.tsx`
- Rewrite: `app/(app)/trips/page.tsx`, `app/(app)/trips/loading.tsx`, `app/(app)/trips/page.test.tsx`
- Modify: `app/(app)/layout.tsx` (one class on `<main>`)
- Delete: `components/trip/trip-card.tsx`, `components/trip/trip-card.test.tsx`, `components/trips/your-travels.tsx`, `components/trips/your-travels.test.tsx`, `components/trips/travel-stats-tiles.tsx`, `components/trips/travel-stats-tiles.test.tsx`
- Test: `lib/trips/trips-page-loader.test.ts`, `app/(app)/trips/page.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–8; `loadYourTravels` from `@/lib/travel-stats-loader`; `loadNextSteps`; `sortTheseOut`; `tripTodayISO`; `orderPlanStops`; `nightsBetween`; `travellerFirstName`, `TRAVELLER_SELECT`.
- Produces:
  ```ts
  export interface TripsPageData {
    firstName: string;
    cards: TripCardModel[];              // carousel order; cards[0] is the hero when kind is up-next / on-the-road
    counts: { upcoming: number; done: number };
    hasDoneTrip: boolean;
    anyStops: boolean;
    mapTrips: TravelMapTrip[];           // with hue
    stats: TravelStats | null;           // null when the stats query failed (spec §9: hide the Tally)
  }
  export async function loadTripsPage(userId: string, today?: string): Promise<TripsPageData>;
  export function TripsHeader(props: { firstName: string; metaLine: string; firstRun: boolean }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing loader test**

```ts
// lib/trips/trips-page-loader.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  userFind: vi.fn(),
  yourTravels: vi.fn(),
  nextSteps: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { tripMember: { findMany: m.findMany }, user: { findUnique: m.userFind } } }));
vi.mock("@/lib/travel-stats-loader", () => ({ loadYourTravels: m.yourTravels }));
vi.mock("@/lib/next-steps-loader", () => ({ loadNextSteps: m.nextSteps }));

import { loadTripsPage } from "./trips-page-loader";

const TODAY = "2026-09-28";
const stop = (id: string, name: string, lat: number, lng: number, arrive: string, depart: string, sortOrder: number) => ({
  id, name, lat, lng, arriveDate: arrive, departDate: depart, nights: null, sortOrder, timezone: "Europe/Paris", countryCode: "fr",
});
const trip = (over: Record<string, unknown>) => ({
  id: "t", name: "Trip", startDate: null, endDate: null, createdAt: new Date("2026-01-01"), coverImageKey: null,
  coverFocalX: null, coverFocalY: null, homeLat: null, homeLng: null, stops: [], ...over,
});

beforeEach(() => {
  m.userFind.mockResolvedValue({ id: "u", name: "Cameron Williams", image: null, displayName: null, photoKey: null, photoUpdatedAt: null });
  m.yourTravels.mockResolvedValue({ stats: { countries: { done: [], planned: [] }, places: { done: 0, planned: 0 }, trips: { done: 0, planned: 0 }, nightsAway: { done: 0, planned: 0 }, accommodationNights: { done: 0, planned: 0 }, transport: { FLIGHT: { done: 0, planned: 0 }, TRAIN: { done: 0, planned: 0 }, BUS: { done: 0, planned: 0 }, FERRY: { done: 0, planned: 0 }, CAR: { done: 0, planned: 0 } }, distanceKm: { done: 0, planned: 0 }, longestTrip: null, mostVisitedCountry: null, farthestFromHome: null }, mapTrips: [] });
  m.nextSteps.mockResolvedValue([]);
});

describe("loadTripsPage", () => {
  it("first run: no cards, Nothing planned yet, no stops", async () => {
    m.findMany.mockResolvedValue([]);
    const d = await loadTripsPage("u", TODAY);
    expect(d.firstName).toBe("Cameron");
    expect(d.cards).toEqual([]);
    expect(d.counts).toEqual({ upcoming: 0, done: 0 });
    expect(d.anyStops).toBe(false);
  });
  it("builds hero + standard models in carousel order with hues, covers and the next step", async () => {
    m.findMany.mockResolvedValue([
      { role: "owner", trip: trip({ id: "nz", name: "New Zealand", startDate: "2027-04-23", endDate: "2027-05-03", createdAt: new Date("2026-02-01") }) },
      { role: "owner", trip: trip({ id: "eu", name: "Christmas in Europe 2026", startDate: "2026-12-04", endDate: "2027-01-08", createdAt: new Date("2026-01-01"), coverImageKey: "k1", stops: [stop("s1", "London", 51.5, -0.12, "2026-12-08", "2026-12-13", 0), stop("s2", "Rome", 41.9, 12.5, "2026-12-13", "2027-01-08", 1)] }) },
      { role: "member", trip: trip({ id: "old", name: "Bali", startDate: "2025-03-01", endDate: "2025-03-10", createdAt: new Date("2025-01-01") }) },
    ]);
    m.nextSteps.mockResolvedValue([{ id: "nudge-transport-times", title: "Add times to 6 transport legs", href: "/trips/eu/plan", severity: "info", source: "nudge", kind: "transport" }]);
    m.yourTravels.mockResolvedValue({ ...(await m.yourTravels()), mapTrips: [{ id: "eu", name: "Christmas in Europe 2026", dateLabel: "x", when: "upcoming", points: [{ lat: 51.5, lng: -0.12, name: "London" }] }] });
    const d = await loadTripsPage("u", TODAY);
    expect(d.cards.map((c) => c.id)).toEqual(["eu", "nz", "old"]);
    expect(d.cards[0].kind).toBe("up-next");
    expect(d.cards[0].big).toEqual({ value: "67", unit: ["sleeps", "to go"] });
    expect(d.cards[0].dateLine).toBe("4 Dec – 8 Jan · 2 stops");
    expect(d.cards[0].nextStep?.title).toBe("Add times to 6 transport legs");
    expect(d.cards[0].cover.photo?.url).toBe("/api/trips/eu/cover?v=k1");
    expect(d.cards[0].cover.stops.map((s) => s.nights)).toEqual([5, 26]);
    expect(d.cards[0].cover.hue).toBe("teal");    // eu created 2026-01-01: second-oldest
    expect(d.cards[1].kind).toBe("planning");
    expect(d.cards[1].cover.hue).toBe("leaf");    // nz created 2026-02-01: third
    expect(d.cards[2].kind).toBe("done");
    expect(d.cards[2].cover.hue).toBe("coral");   // old created 2025-01-01: oldest → coral
    expect(d.counts).toEqual({ upcoming: 2, done: 1 });
    expect(d.hasDoneTrip).toBe(true);
    expect(d.anyStops).toBe(true);
    expect(d.mapTrips[0].hue).toBe(d.cards[0].cover.hue);
    expect(m.nextSteps).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/trips/trips-page-loader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/trips/trips-page-loader.ts`**

```ts
/**
 * Everything /trips needs, in one place (spec 2026-09-28-trips-page-carousel).
 * Plain lib module (takes userId from the page's own requireUser). Real plan
 * only. Each trip is judged against its own today (tripTodayISO).
 */
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { orderPlanStops } from "@/lib/plan-order";
import { nightsBetween, todayISO } from "@/lib/dates";
import { tripTodayISO } from "@/lib/trip-today";
import { computeTripPhase } from "@/lib/trip-phase";
import { TRAVELLER_SELECT, travellerFirstName } from "@/lib/traveller";
import { loadYourTravels } from "@/lib/travel-stats-loader";
import { loadNextSteps } from "@/lib/next-steps-loader";
import { sortTheseOut } from "@/lib/sort-these-out";
import type { TravelStats } from "@/lib/travel-stats";
import { assignTripHues } from "@/lib/trips/trip-colour";
import type { SketchStop } from "@/lib/trips/route-sketch";
import {
  orderForCarousel, cardKind, cardBigNumber, cardDateLine, countUpcomingAndDone, type CardTrip,
} from "@/lib/trips/trip-status";
import type { TripCardModel } from "@/components/trips/trip-card";
import type { TravelMapTrip } from "@/components/trips/travel-map";

export interface TripsPageData {
  firstName: string;
  cards: TripCardModel[];
  counts: { upcoming: number; done: number };
  hasDoneTrip: boolean;
  anyStops: boolean;
  mapTrips: TravelMapTrip[];
  /** Null when the stats failed to load — the page hides the Tally (§9). */
  stats: TravelStats | null;
}

export async function loadTripsPage(userId: string, today?: string): Promise<TripsPageData> {
  const [me, memberships] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: TRAVELLER_SELECT }),
    db.tripMember.findMany({
      where: { userId },
      select: {
        role: true,
        trip: {
          select: {
            id: true, name: true, startDate: true, endDate: true, createdAt: true,
            coverImageKey: true, coverFocalX: true, coverFocalY: true, homeLat: true, homeLng: true,
            stops: {
              where: REAL_PLAN,
              orderBy: { sortOrder: "asc" },
              select: { id: true, name: true, lat: true, lng: true, arriveDate: true, departDate: true, nights: true, sortOrder: true, timezone: true, countryCode: true },
            },
          },
        },
      },
    }),
  ]);
  const firstName = me ? travellerFirstName(me) : "there";
  const trips = memberships.map((m) => m.trip);
  const fallbackToday = today ?? todayISO();
  const todayByTripId = new Map(trips.map((t) => [t.id, today ?? tripTodayISO(t.stops)]));
  const hues = assignTripHues(trips);

  const cardTrips: CardTrip[] = trips.map((t) => ({ id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, createdAt: t.createdAt, stopCount: t.stops.length }));
  const ordered = orderForCarousel(cardTrips, fallbackToday, todayByTripId);
  const byId = new Map(trips.map((t) => [t.id, t]));

  // The hero's next step: one extra query set, for the first trip only.
  let firstNextStep: TripCardModel["nextStep"] = null;
  const first = ordered[0];
  const firstPhase = first ? computeTripPhase({ startDate: first.startDate, endDate: first.endDate, today: todayByTripId.get(first.id) ?? fallbackToday }) : null;
  if (first && firstPhase && firstPhase !== "past" && firstPhase !== "sketching") {
    try {
      const steps = await loadNextSteps(first.id, todayByTripId.get(first.id) ?? fallbackToday);
      const row = sortTheseOut({ steps, reminders: [], today: todayByTripId.get(first.id) ?? fallbackToday, basePath: `/trips/${first.id}` }).rows[0];
      firstNextStep = row?.href ? row : null;
    } catch {
      firstNextStep = null;
    }
  }

  let standardIndex = 0;
  const cards: TripCardModel[] = ordered.map((ct, i) => {
    const t = byId.get(ct.id)!;
    const tToday = todayByTripId.get(t.id) ?? fallbackToday;
    const kind = cardKind(computeTripPhase({ startDate: t.startDate, endDate: t.endDate, today: tToday }), i === 0);
    const plan = orderPlanStops(t.stops);
    const sketchStops: SketchStop[] = plan
      .filter((s): s is typeof s & { lat: number; lng: number } => s.lat != null && s.lng != null)
      .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, nights: s.arriveDate && s.departDate ? nightsBetween(s.arriveDate, s.departDate) : (s.nights ?? 0) }));
    const currentStop = plan.find((s) => s.arriveDate && s.departDate && s.arriveDate <= tToday && tToday <= s.departDate)?.name ?? null;
    const big = cardBigNumber({ kind, startDate: t.startDate, endDate: t.endDate, today: tToday });
    const isHero = kind === "up-next" || kind === "on-the-road";
    return {
      id: t.id,
      name: t.name,
      kind,
      big,
      dateLine: cardDateLine({ kind, startDate: t.startDate, endDate: t.endDate, stopCount: t.stops.length, today: tToday, currentStop }),
      href: `/trips/${t.id}`,
      index: isHero ? 0 : standardIndex++,
      nextStep: isHero ? firstNextStep : null,
      cover: {
        tripId: t.id,
        name: t.name,
        hue: hues.get(t.id) ?? "coral",
        photo: t.coverImageKey ? { url: `/api/trips/${t.id}/cover?v=${encodeURIComponent(t.coverImageKey)}`, focalX: t.coverFocalX, focalY: t.coverFocalY, version: t.coverImageKey } : null,
        stops: sketchStops,
        startDate: t.startDate,
        canEdit: true,
      },
    };
  });

  let stats: TravelStats | null = null;
  let mapTrips: TravelMapTrip[] = [];
  try {
    const travels = await loadYourTravels(userId, today);
    stats = travels.stats;
    mapTrips = travels.mapTrips.map((m) => ({ id: m.id, name: m.name, when: m.when, points: m.points, hue: hues.get(m.id) ?? "coral" }));
  } catch (err) {
    console.error("[trips] Your travels failed to load:", err);
  }

  const counts = countUpcomingAndDone(cardTrips, fallbackToday, todayByTripId);
  return {
    firstName,
    cards,
    counts,
    hasDoneTrip: counts.done > 0,
    anyStops: trips.some((t) => t.stops.length > 0),
    mapTrips,
    stats,
  };
}
```

- [ ] **Step 4: Run the loader test**

Run: `npx vitest run lib/trips/trips-page-loader.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `components/trips/trips-header.tsx`** (Server Component)

```tsx
import Link from "next/link";
import { Plus } from "lucide-react";
import { CarouselArrows } from "@/components/trips/trip-carousel";

export interface TripsHeaderProps {
  firstName: string;
  metaLine: string;
  /** No arrows and no "+ New trip": the first-trip card is the CTA (§7). */
  firstRun: boolean;
}

/** TRIPS_PAGE.md §3 (desktop) and §8.1 (mobile). Must sit inside <TripCarousel> for the arrows. */
export function TripsHeader({ firstName, metaLine, firstRun }: TripsHeaderProps) {
  return (
    <header className="flex items-end gap-4 pr-[18px] md:pr-10">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-muted-foreground md:text-[15px]">
          {firstRun ? `Welcome to teepee, ${firstName}` : `Hey ${firstName}`}
        </p>
        <h1 className="mt-0.5 font-display text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em] md:text-[40px]">Your trips</h1>
        <p className="mt-1.5 hidden text-[15px] font-semibold text-foreground md:block">{metaLine}</p>
      </div>
      {firstRun ? null : (
        <div className="flex items-center gap-2.5">
          <div className="hidden md:flex"><CarouselArrows /></div>
          <Link
            href="/trips/new"
            className="hidden h-11 shrink-0 items-center whitespace-nowrap rounded-full border-2 border-border bg-primary px-[18px] text-sm font-extrabold text-primary-foreground shadow-[4px_4px_0_hsl(var(--coral))] md:ml-1.5 md:inline-flex"
          >
            + New trip
          </Link>
          <Link
            href="/trips/new"
            aria-label="New trip"
            className="grid size-11 place-items-center rounded-full border-2 border-border bg-primary text-primary-foreground shadow-[3px_3px_0_hsl(var(--coral))] md:hidden"
          >
            <Plus className="size-5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 6: Rewrite `app/(app)/trips/page.tsx`**

```tsx
import type { Metadata } from "next";
import { requireUser } from "@/lib/guards";
import { WhatsNewBanner } from "@/components/whats-new/whats-new-banner";
import { loadTripsPage } from "@/lib/trips/trips-page-loader";
import { tripsMetaLine } from "@/lib/trips/trip-status";
import { TripsHeader } from "@/components/trips/trips-header";
import { TripCarousel, CarouselTrack, CarouselDots } from "@/components/trips/trip-carousel";
import { TripCard } from "@/components/trips/trip-card";
import { TripCardHero } from "@/components/trips/trip-card-hero";
import { TravelsMapCard } from "@/components/trips/travels-map-card";
import { TallyCard, TallyStrip } from "@/components/trips/tally-card";
import { TallyEmpty } from "@/components/trips/tally-empty";
import { FirstTripCard } from "@/components/trips/first-trip-card";
import { PastTripCard } from "@/components/trips/past-trip-card";
import { cn } from "@/lib/cn";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Your trips" };
}

/**
 * The page frame (TRIPS_PAGE.md §2, §8; spec P7). The app layout's <main>
 * drops its padding for this page ([data-trips-shell]); the page pads itself:
 * phones 4/18/110px, tablets like any page, ≥1280 `32px 0 32px 40px` locked to
 * one screen unless the viewport is shorter than 820px.
 */
const FRAME = cn(
  "flex flex-col gap-3.5 pl-[18px] pr-0 pt-1 pb-[calc(var(--tp-tab-bar-h)+1rem+env(safe-area-inset-bottom))]",
  "md:gap-[18px] md:px-6 md:py-8",
  "xl:min-h-0 xl:pl-10 xl:pr-0 xl:py-8 xl:h-dvh xl:overflow-hidden",
  "xl:[@media(max-height:819px)]:h-auto xl:[@media(max-height:819px)]:overflow-visible",
);
const TRAVELS_ROW = "grid grid-cols-12 gap-[18px] pr-[18px] md:pr-10 xl:min-h-0 xl:flex-1 xl:[@media(max-height:819px)]:min-h-[360px]";

export default async function TripsPage() {
  const user = await requireUser();
  // Always the real plan; never wire in ?plan= here (architecture-sitrep-2026-09-22).
  const data = await loadTripsPage(user.id);
  const firstRun = data.cards.length === 0;
  const hero = data.cards[0]?.kind === "up-next" || data.cards[0]?.kind === "on-the-road" ? data.cards[0] : null;
  const rest = hero ? data.cards.slice(1) : data.cards;
  const showTally = data.stats != null;
  const tallyEmpty = !data.anyStops;

  return (
    <TripCarousel>
      <div data-trips-shell className={FRAME}>
        <TripsHeader firstName={data.firstName} metaLine={tripsMetaLine(data.counts)} firstRun={firstRun} />
        <WhatsNewBanner className="mr-[18px] md:mr-10" />

        {firstRun ? (
          <>
            {/* Row 1 — desktop: first-trip 8 / past-trip 4; mobile: stacked. */}
            <div className="grid grid-cols-12 gap-3.5 pr-[18px] md:h-[280px] md:gap-[18px] md:pr-10">
              <div className="col-span-12 md:col-span-8"><div className="md:hidden"><FirstTripCard variant="mobile" /></div><div className="hidden h-full md:block"><FirstTripCard variant="desktop" /></div></div>
              <div className="col-span-12 md:col-span-4"><div className="md:hidden"><PastTripCard variant="mobile" /></div><div className="hidden h-full md:block"><PastTripCard variant="desktop" /></div></div>
            </div>
            <div className={cn(TRAVELS_ROW, "md:mt-2")}>
              <div className="col-span-12 min-h-[150px] md:col-span-8"><div className="md:hidden"><TravelsMapCard trips={[]} variant="mobile" empty /></div><div className="hidden h-full md:block"><TravelsMapCard trips={[]} variant="desktop" empty /></div></div>
              <div className="col-span-12 hidden md:col-span-4 md:block"><TallyEmpty /></div>
            </div>
          </>
        ) : (
          <>
            <CarouselTrack className="h-[250px] gap-3 md:h-[280px] md:gap-[18px]">
              {hero ? <TripCardHero model={hero} /> : null}
              {rest.map((m) => <TripCard key={m.id} model={m} />)}
            </CarouselTrack>
            <CarouselDots className="-mt-1 md:-mt-1" />
            <div className={TRAVELS_ROW}>
              <div className={cn("col-span-12", showTally ? "md:col-span-8" : "md:col-span-12")}>
                <div className="md:hidden"><TravelsMapCard trips={data.mapTrips} variant="mobile" empty={!data.anyStops} /></div>
                <div className="hidden h-full md:block"><TravelsMapCard trips={data.mapTrips} variant="desktop" empty={!data.anyStops} /></div>
              </div>
              {showTally ? (
                <div className="col-span-12 md:col-span-4">
                  <div className="md:hidden">{tallyEmpty ? null : <TallyStrip stats={data.stats!} hasDoneTrip={data.hasDoneTrip} />}</div>
                  <div className="hidden h-full md:block">{tallyEmpty ? <TallyEmpty /> : <TallyCard stats={data.stats!} hasDoneTrip={data.hasDoneTrip} />}</div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </TripCarousel>
  );
}
```

`TripCarousel` is a client provider; Server Components as children of a client component are fine (they are passed as `children`).

- [ ] **Step 7: Let `<main>` drop its padding on this page** — in `app/(app)/layout.tsx`, add to the `<main>` className:

```
has-[[data-trips-shell]]:p-0
```

(keep `max-w-page-wide`; the page's own left padding stands in for the gutter).

- [ ] **Step 8: Rewrite `app/(app)/trips/loading.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

/** TRIPS_PAGE.md §9: header at once; skeleton cards at real sizes; flat canvas map; tally title + 4 cells. */
export default function TripsLoading() {
  return (
    <div className="flex flex-col gap-3.5 pl-[18px] pt-1 md:gap-[18px] md:px-6 md:py-8 xl:pl-10 xl:pr-0">
      <span role="status" className="sr-only">Loading trips</span>
      <header className="pr-[18px] md:pr-10">
        <Skeleton className="h-3.5 w-28" />
        <h1 className="mt-1 font-display text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em] md:text-[40px]">Your trips</h1>
        <Skeleton className="mt-2 hidden h-3.5 w-36 md:block" />
      </header>
      <div aria-hidden="true" className="flex gap-3 overflow-hidden md:gap-[18px]">
        <div className="h-[250px] w-[300px] shrink-0 rounded-[22px] border-2 border-border-soft md:h-[280px] md:w-[600px] md:rounded-[24px]" />
        <div className="h-[250px] w-[220px] shrink-0 rounded-[22px] border-2 border-border-soft md:h-[280px] md:w-[300px] md:rounded-[24px]" />
        <div className="hidden h-[280px] w-[300px] shrink-0 rounded-[24px] border-2 border-border-soft md:block" />
      </div>
      <div aria-hidden="true" className="grid grid-cols-12 gap-[18px] pr-[18px] md:pr-10">
        <div className="col-span-12 h-[190px] rounded-[22px] border-2 border-border-soft bg-canvas md:col-span-8 md:h-[380px] md:rounded-[24px]" />
        <div className="col-span-12 hidden rounded-[24px] border-2 border-border-soft p-5 md:col-span-4 md:block">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="mt-3 h-12 w-24" />
          <div className="mt-8 grid grid-cols-2 gap-x-4">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="border-b-2 border-border-soft py-2"><Skeleton className="h-5 w-10" /><Skeleton className="mt-1 h-3 w-16" /></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Delete the old trips-list code and rewrite `page.test.tsx`**

```bash
git rm components/trip/trip-card.tsx components/trip/trip-card.test.tsx components/trips/your-travels.tsx components/trips/your-travels.test.tsx components/trips/travel-stats-tiles.tsx components/trips/travel-stats-tiles.test.tsx
```

Then `grep -rn "trip-card\"\|your-travels\"\|travel-stats-tiles" app components lib` must return nothing but the new `components/trips/trip-card` imports.

New `app/(app)/trips/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({ requireUser: vi.fn(), load: vi.fn(), map: vi.fn(), tally: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireUser: m.requireUser }));
vi.mock("@/lib/trips/trips-page-loader", () => ({ loadTripsPage: m.load }));
vi.mock("@/components/whats-new/whats-new-banner", () => ({ WhatsNewBanner: () => null }));
vi.mock("@/components/trips/travels-map-card", () => ({ TravelsMapCard: (p: Record<string, unknown>) => { m.map(p); return <div data-testid="map" />; } }));
vi.mock("@/components/trips/tally-card", () => ({ TallyCard: (p: Record<string, unknown>) => { m.tally(p); return <div data-testid="tally" />; }, TallyStrip: () => <div data-testid="tally-strip" /> }));
vi.mock("@/components/trips/trip-cover", () => ({ TripCover: () => <div data-testid="cover" /> }));
vi.mock("@/components/trips/first-trip-card", () => ({ FirstTripCard: () => <div data-testid="first-trip" /> }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a> }));

import TripsPage from "./page";

const stats = { countries: { done: [], planned: [] } } as never;
const card = (id: string, kind: string) => ({ id, name: id, kind, big: { value: "1", unit: ["sleep", "to go"] }, dateLine: "x", href: `/trips/${id}`, index: 0, nextStep: null, cover: { tripId: id, name: id, hue: "coral", photo: null, stops: [], startDate: null, canEdit: true } });

beforeEach(() => {
  vi.clearAllMocks();
  m.requireUser.mockResolvedValue({ id: "u" });
});

describe("TripsPage", () => {
  it("first run: welcome greeting, first-trip card, past-trip card, dashed tally, no New trip", async () => {
    m.load.mockResolvedValue({ firstName: "Cam", cards: [], counts: { upcoming: 0, done: 0 }, hasDoneTrip: false, anyStops: false, mapTrips: [], stats });
    render(await TripsPage());
    expect(screen.getByText("Welcome to teepee, Cam")).toBeInTheDocument();
    expect(screen.getAllByTestId("first-trip").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "+ Past trip" })[0]).toHaveAttribute("href", "/trips/new?past=1");
    expect(screen.getByText("Starts counting with your first trip")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "+ New trip" })).toBeNull();
    expect(m.map).toHaveBeenCalledWith(expect.objectContaining({ empty: true }));
  });
  it("populated: hero first, then standard cards, meta line, New trip, map and tally", async () => {
    m.load.mockResolvedValue({ firstName: "Cam", cards: [card("eu", "up-next"), card("nz", "planning"), card("old", "done")], counts: { upcoming: 2, done: 1 }, hasDoneTrip: true, anyStops: true, mapTrips: [], stats });
    render(await TripsPage());
    expect(screen.getByText("Hey Cam")).toBeInTheDocument();
    expect(screen.getByText("2 coming up · 1 done")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ New trip" })).toHaveAttribute("href", "/trips/new");
    const links = screen.getAllByRole("link", { name: /, (up next|planning|done), / });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/trips/eu", "/trips/nz", "/trips/old"]);
    expect(screen.getByTestId("tally")).toBeInTheDocument();
    expect(m.tally).toHaveBeenCalledWith(expect.objectContaining({ hasDoneTrip: true }));
  });
  it("hides the tally when stats failed", async () => {
    m.load.mockResolvedValue({ firstName: "Cam", cards: [card("eu", "up-next")], counts: { upcoming: 1, done: 0 }, hasDoneTrip: false, anyStops: true, mapTrips: [], stats: null });
    render(await TripsPage());
    expect(screen.queryByTestId("tally")).toBeNull();
  });
  it("ideas only, no stops: populated layout with the dashed tally", async () => {
    m.load.mockResolvedValue({ firstName: "Cam", cards: [card("j", "idea")], counts: { upcoming: 1, done: 0 }, hasDoneTrip: false, anyStops: false, mapTrips: [], stats });
    render(await TripsPage());
    expect(screen.getByText("Starts counting with your first trip")).toBeInTheDocument();
    expect(screen.queryByTestId("tally")).toBeNull();
  });
});
```

The carousel provider needs `ResizeObserver`/`matchMedia` only inside effects; jsdom has neither, so `TripCarousel` guards with `typeof ResizeObserver !== "undefined"` (it does) and `window.matchMedia?.` (it does).

- [ ] **Step 10: Run tests and type-check**

Run: `npx vitest run "app/(app)/trips" lib/trips components/trips && npx tsc --noEmit`
Expected: PASS and no type errors. Fix any remaining reference to the deleted files (e.g. `app/(app)/trips/page.test.tsx` old mocks are gone; `components/trip/trip-cover.tsx` still compiles until Task 10).

- [ ] **Step 11: Commit** (with the feedback trailers — this is the commit that makes the cards polaroids and removes the kebab)

```bash
git add -A app/\(app\)/trips app/\(app\)/layout.tsx lib/trips components/trips components/trip
git commit -m "feat(trips): one-screen trips page — carousel, travels map, tally, first run

Cards are single links with polaroid covers; the kebab menu is gone.

Resolves-Feedback: cmukh7ef0000104k226oa1o9g
Resolves-Feedback: cmukh8804000204k2cz7l1778

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Retire the old cover fallbacks everywhere

**Files:**
- Modify: `app/(app)/trips/[tripId]/page.tsx` (the phone cover band and tile, ~L95–130), `components/trip/trip-cover.tsx` → keep only `TripCoverCard`, moved to `components/trip/trip-cover-card.tsx`
- Delete: `components/trip/trip-cover.tsx`, `components/trip/trip-cover.test.tsx`, `lib/route-render.ts`, `lib/route-render.test.ts`
- Test: `app/(app)/trips/[tripId]/page.test.tsx` (adjust mocks), `components/trip/trip-cover-card.test.tsx`

**Interfaces:**
- Consumes: `CoverArt`, `TripCoverInput` (Task 4), `assignTripHues` (Task 1).
- Produces: `TripCoverCard({ className, children })` from `@/components/trip/trip-cover-card` (unchanged markup).

- [ ] **Step 1: Write the failing test**

```tsx
// components/trip/trip-cover-card.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TripCoverCard } from "./trip-cover-card";

describe("TripCoverCard", () => {
  it("is a 2xl card that clips its child", () => {
    const { container } = render(<TripCoverCard className="h-10"><span>x</span></TripCoverCard>);
    expect(container.firstElementChild!.className).toContain("overflow-hidden");
    expect(container.firstElementChild!.className).toContain("rounded-2xl");
  });
});
```

- [ ] **Step 2: Move `TripCoverCard`** to `components/trip/trip-cover-card.tsx` (copy the function and its doc comment verbatim from `components/trip/trip-cover.tsx`, importing `Card` and `cn`), then `git rm components/trip/trip-cover.tsx components/trip/trip-cover.test.tsx lib/route-render.ts lib/route-render.test.ts`.

- [ ] **Step 3: Switch the trip Home** — in `app/(app)/trips/[tripId]/page.tsx` replace the `coverProps` object and the two `TripCover` usages:

```tsx
import { TripCoverCard } from "@/components/trip/trip-cover-card";
import { CoverArt } from "@/components/trips/trip-cover";
import { assignTripHues } from "@/lib/trips/trip-colour";
import { nightsBetween } from "@/lib/dates";
// ...
// Trip colour is per viewer (creation order among the viewer's trips), so the
// Home asks for the viewer's trips' ids + createdAt once.
const myTrips = await db.tripMember.findMany({ where: { userId: user.id }, select: { trip: { select: { id: true, createdAt: true } } } });
const hue = assignTripHues(myTrips.map((m) => m.trip)).get(tripId) ?? "coral";
const coverArt = {
  tripId,
  name: trip.name,
  hue,
  photo: trip.coverImageKey ? { url: `/api/trips/${tripId}/cover?v=${encodeURIComponent(trip.coverImageKey)}`, focalX: trip.coverFocalX, focalY: trip.coverFocalY, version: trip.coverImageKey } : null,
  stops: coverStops.map((s) => ({ id: s.id, name: s.name, lat: s.lat as number, lng: s.lng as number, nights: s.arriveDate && s.departDate ? nightsBetween(s.arriveDate, s.departDate) : 0 })),
  startDate: trip.startDate,
  canEdit: false, // the Home has its own "+ Add a photo" / "Change" (countdown tile)
} as const;

const cover = (
  <TripCoverCard className="h-56 w-full sm:h-48">
    <CoverArt {...coverArt} size="hero" box="band" sizesPx="100vw" />
  </TripCoverCard>
);
const coverTile = (
  <TripCoverCard className="h-56 w-full sm:h-48 lg:h-auto lg:min-h-36">
    <CoverArt {...coverArt} size="hero" box="band" sizesPx="50vw" className="lg:absolute lg:inset-0" />
  </TripCoverCard>
);
```

Read the surrounding lines first: `coverStops` is already selected there — add `id`, `name`, `arriveDate`, `departDate` to that select if missing. `user` is already in scope from `requireUser()`/`requireTripAccess`; check the variable name used in that file.

- [ ] **Step 4: Fix the Home page test mocks** — in `app/(app)/trips/[tripId]/page.test.tsx`, replace any `vi.mock("@/components/trip/trip-cover", …)` with:

```tsx
vi.mock("@/components/trips/trip-cover", () => ({ CoverArt: () => <div data-testid="cover-art" /> }));
vi.mock("@/components/trip/trip-cover-card", () => ({ TripCoverCard: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> }));
```

and add `tripMember: { findMany: vi.fn().mockResolvedValue([]) }` to its `db` mock if the file mocks `@/lib/db` explicitly.

- [ ] **Step 5: Run, type-check, grep**

Run: `npx vitest run "app/(app)/trips/[tripId]/page.test.tsx" components/trip/trip-cover-card.test.tsx && npx tsc --noEmit && grep -rn "route-render\|MonogramCover\|RouteRender\|components/trip/trip-cover\"" app components lib`
Expected: PASS, no type errors, grep empty.

- [ ] **Step 6: Commit**

```bash
git add -A app components lib
git commit -m "refactor(cover): route sketch and stamp replace the route render and monogram everywhere

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Sidebar on trips-level pages — "Back to" card, Trips count, hidden at 0 trips

**Files:**
- Create: `server/actions/last-trip.ts`, `components/shell/remember-last-trip.tsx` (client), `components/shell/back-to-trip-card.tsx` (client), `lib/last-trip.ts`
- Modify: `components/shell/shell-user.tsx` (add `lastTrip`), `app/(app)/layout.tsx` (read cookie, pass `lastTrip`, mount card), `components/shell/sidebar.tsx` (hide switcher at 0 trips, count), `components/shell/sidebar-nav.tsx` (Trips count), `components/shell/trip-switcher.tsx` (export the menu items), `app/(app)/trips/[tripId]/layout.tsx` (mount `RememberLastTrip`)
- Test: `lib/last-trip.test.ts`, `components/shell/back-to-trip-card.test.tsx`, `components/shell/sidebar.test.tsx` (extend), `components/shell/sidebar-nav.test.tsx` (new)

**Interfaces:**
- Produces:
  ```ts
  export const LAST_TRIP_COOKIE = "teepee-last-trip";
  export function pickLastTrip<T extends { id: string }>(trips: T[], cookieId: string | null | undefined): T | null;  // lib/last-trip.ts, pure
  export async function rememberLastTrip(tripId: string): Promise<void>;   // server action, sets the cookie
  export function RememberLastTrip({ tripId }: { tripId: string }): null;   // client, fires the action once per tripId
  export function BackToTripCard({ trip, trips }: { trip: SwitcherTrip; trips: SwitcherTrip[] }): JSX.Element;
  export function TripMenuItems({ trips, currentId }: { trips: SwitcherTrip[]; currentId: string | null }): JSX.Element;  // from trip-switcher.tsx
  ShellUser gains `lastTrip: SwitcherTrip | null`; SidebarProps gains `trips?: SwitcherTrip[]`, `lastTrip?: SwitcherTrip | null`; SidebarNav gains `tripCount?: number`.
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/last-trip.test.ts
import { describe, it, expect } from "vitest";
import { pickLastTrip } from "./last-trip";

const trips = [{ id: "up-next" }, { id: "b" }, { id: "c" }];
describe("pickLastTrip", () => {
  it("returns the cookie's trip when it is one of the viewer's", () => {
    expect(pickLastTrip(trips, "c")).toEqual({ id: "c" });
  });
  it("ignores a cookie for an unknown trip and falls back to the first (up-next) trip", () => {
    expect(pickLastTrip(trips, "gone")).toEqual({ id: "up-next" });
    expect(pickLastTrip(trips, null)).toEqual({ id: "up-next" });
  });
  it("null with no trips", () => {
    expect(pickLastTrip([], "x")).toBeNull();
  });
});
```

```tsx
// components/shell/back-to-trip-card.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("next/navigation", () => ({ usePathname: () => "/trips", useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
import { BackToTripCard } from "./back-to-trip-card";

const trips = [{ id: "eu", name: "Christmas in Europe", statusLine: "67 sleeps to go" }, { id: "nz", name: "New Zealand", statusLine: "208 sleeps to go" }];

describe("BackToTripCard", () => {
  it("body links to the trip Home; chevron opens the switcher menu", () => {
    render(<BackToTripCard trip={trips[0]} trips={trips} />);
    expect(screen.getByText("Back to")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Christmas in Europe/ })).toHaveAttribute("href", "/trips/eu");
    expect(screen.getByRole("button", { name: "Switch trip" })).toBeInTheDocument();
  });
});
```

Extend `components/shell/sidebar.test.tsx` with two cases (read the file's existing render helper and follow it):

```tsx
it("shows the Trips row count and hides it at 0", () => {
  // render with trips of length 4 → within the Trips row, text "4"; with [] → no count
});
it("hides the switcher slot when the user has 0 trips, and widens the gap under search", () => {
  // render with trips=[] and switcher=<div data-testid="switcher"/> → queryByTestId("switcher") is null
  // and the search wrapper has class mb-6
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/last-trip.test.ts components/shell/back-to-trip-card.test.tsx components/shell/sidebar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `lib/last-trip.ts` and the server action**

```ts
// lib/last-trip.ts
/** The "Back to" trip (spec P1): the most recently opened, if still one of the viewer's trips; else the first in trips-list order. Pure. */
export const LAST_TRIP_COOKIE = "teepee-last-trip";

export function pickLastTrip<T extends { id: string }>(trips: T[], cookieId: string | null | undefined): T | null {
  if (trips.length === 0) return null;
  return (cookieId && trips.find((t) => t.id === cookieId)) || trips[0];
}
```

```ts
// server/actions/last-trip.ts
"use server";

import { cookies } from "next/headers";
import { LAST_TRIP_COOKIE } from "@/lib/last-trip";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Remember the trip just opened, for the trips-level sidebar's "Back to" card. Membership is re-checked on read (pickLastTrip). */
export async function rememberLastTrip(tripId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tripId)) return;
  const store = await cookies();
  if (store.get(LAST_TRIP_COOKIE)?.value === tripId) return;
  store.set(LAST_TRIP_COOKIE, tripId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: ONE_YEAR });
}
```

```tsx
// components/shell/remember-last-trip.tsx
"use client";

import { useEffect } from "react";
import { rememberLastTrip } from "@/server/actions/last-trip";

let lastSent: string | null = null;

/** Mounted by the trip layout: one tiny action per trip opened, never per page. */
export function RememberLastTrip({ tripId }: { tripId: string }) {
  useEffect(() => {
    if (lastSent === tripId) return;
    lastSent = tripId;
    rememberLastTrip(tripId).catch(() => { lastSent = null; });
  }, [tripId]);
  return null;
}
```

Mount it in `app/(app)/trips/[tripId]/layout.tsx` next to `<FeedbackTripMarker …/>`: `<RememberLastTrip tripId={tripId} />`.

- [ ] **Step 4: Export the menu items from `trip-switcher.tsx`**

Extract the `DropdownMenuContent` body of `TripSwitcher` into:

```tsx
export function TripMenuItems({ trips, currentId }: { trips: SwitcherTrip[]; currentId: string | null }) {
  return (
    <>
      {trips.map((trip) => { /* the existing per-trip DropdownMenuItem, aria-current when trip.id === currentId */ })}
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild><AppLink href="/trips">All trips</AppLink></DropdownMenuItem>
      <DropdownMenuItem asChild><AppLink href="/trips/new">+ New trip</AppLink></DropdownMenuItem>
    </>
  );
}
```

and have `TripSwitcher` render `<DropdownMenuContent align="start" className="min-w-56"><TripMenuItems trips={menuTrips} currentId={current.id} /></DropdownMenuContent>`. Existing `trip-switcher.test.tsx` must still pass unchanged.

- [ ] **Step 5: `components/shell/back-to-trip-card.tsx`**

```tsx
"use client";

import { ChevronDown } from "lucide-react";
import { AppLink } from "@/components/navigation/app-link";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { TripMenuItems } from "@/components/shell/trip-switcher";
import type { SwitcherTrip } from "@/components/shell/shell-user";

/** TRIPS_PAGE.md §1: "Back to / {name}", no shadow, body → trip Home, chevron → switcher menu. */
export function BackToTripCard({ trip, trips }: { trip: SwitcherTrip; trips: SwitcherTrip[] }) {
  return (
    <div className="flex min-h-11 items-stretch rounded-[14px] border-2 border-border bg-card">
      <AppLink href={`/trips/${trip.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-l-[12px] px-3 py-2">
        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border-2 border-border bg-coral" />
        <span className="flex min-w-0 flex-col text-left">
          <span className="text-[12px] font-medium leading-tight text-muted-foreground">Back to</span>
          <span className="truncate text-sm font-bold leading-tight">{trip.name}</span>
        </span>
      </AppLink>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Switch trip" className="grid w-10 shrink-0 place-items-center rounded-r-[12px] text-muted-foreground hover:text-foreground">
          <ChevronDown className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <TripMenuItems trips={trips} currentId={null} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 6: Sidebar and nav changes**

`shell-user.tsx`: add `lastTrip: SwitcherTrip | null;` to `ShellUser`.

`sidebar.tsx`: add `trips?: SwitcherTrip[]` and `lastTrip?: SwitcherTrip | null` to `SidebarProps`; compute `const tripCount = trips?.length ?? 0;` then:

```tsx
<div className={tripCount === 0 && !trip ? "mb-6" : "mb-2.5"}><SearchField tripId={trip?.id ?? null} /></div>
{tripCount === 0 && !trip ? null : <div className="mb-3.5">{switcher}</div>}
<SidebarNav tripId={trip?.id ?? null} counts={counts} tripCount={tripCount} />
```

`sidebar-nav.tsx`: add `tripCount?: number` and pass a count to the Trips row:

```tsx
<Row href="/trips" label="Trips" match={isTripsActive} nav={nav}
  count={tripCount ? <span className="text-[11px] font-extrabold">{tripCount}</span> : undefined} />
```

`app/(app)/layout.tsx`: after `trips` is built,

```ts
import { cookies } from "next/headers";
import { LAST_TRIP_COOKIE, pickLastTrip } from "@/lib/last-trip";
import { BackToTripCard } from "@/components/shell/back-to-trip-card";
// ...
const lastTrip = pickLastTrip(trips, (await cookies()).get(LAST_TRIP_COOKIE)?.value);
const shellUser: ShellUser = { user: traveller, isAdmin, pendingAccessRequests, trips, lastTrip };
// ...
<Sidebar {...shellUser} trip={null} switcher={lastTrip ? <BackToTripCard trip={lastTrip} trips={trips} /> : <SidebarTripPlaceholder trip={null} />} />
```

`SidebarFromContext` already spreads `shell`, so `trips` and `lastTrip` flow through. Every other place that builds a `ShellUser` literal (grep `ShellUser = {` and tests that construct one) gets `lastTrip: null`.

- [ ] **Step 7: Run tests and type-check**

Run: `npx vitest run components/shell lib/last-trip.test.ts "app/(app)/layout.test.tsx" && npx tsc --noEmit`
Expected: PASS. `layout.test.tsx` may need `cookies` mocked: `vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))`.

- [ ] **Step 8: Commit**

```bash
git add -A app components lib server
git commit -m "feat(shell): Back-to trip card on trips-level pages, Trips row count, switcher hidden at 0 trips

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Phone chrome on trips-level pages — tab bar in, top bar out, account extras

**Files:**
- Create: `components/shell/app-tab-bar.tsx` (client), `components/account/phone-extras.tsx` (client)
- Modify: `components/ui/tab-bar.tsx` (optional `icon` per item), `components/app-rail.tsx` (add `OnTripPath`), `app/(app)/layout.tsx` (wrap the phone header; mount the tab bar; phone bottom padding on `<main>`), `app/(app)/account/page.tsx` (mount `PhoneExtras`)
- Test: `components/shell/app-tab-bar.test.tsx`, `components/ui/tab-bar.test.tsx` (extend), `app/(app)/layout.test.tsx` (extend), `app/(app)/account/page.test.tsx` (extend)

**Interfaces:**
- Produces: `AppTabBar(): JSX.Element` (Trips / Globe / You with lucide `LayoutGrid`, `Globe`, `UserRound`); `OnTripPath({ children })` renders children only on `/trips/:id…`; `TabItem.icon?: LucideIcon`; `PhoneExtras({ isAdmin })` — a `md:hidden` card with the search field, theme toggle, Help, What's new, Admin (if admin) and Sign out.

- [ ] **Step 1: Write the failing tests**

```tsx
// components/shell/app-tab-bar.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("@/components/navigation/navigation-pending", () => ({ useNavState: () => ({ pathname: "/globe", effectivePathname: "/globe", pendingPathname: null }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/globe", useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
import { AppTabBar } from "./app-tab-bar";

describe("AppTabBar", () => {
  it("has Trips, Globe and You, with Globe current, on a sun bar", () => {
    render(<AppTabBar />);
    const nav = screen.getByRole("navigation", { name: "Teepee" });
    expect(nav.className).toContain("bg-sun");
    expect(screen.getByRole("link", { name: "Trips" })).toHaveAttribute("href", "/trips");
    expect(screen.getByRole("link", { name: "Globe" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "You" })).toHaveAttribute("href", "/account");
    expect(nav.querySelectorAll("svg")).toHaveLength(3);
  });
});
```

Extend `app/(app)/layout.test.tsx` (follow its existing mocks; it renders the layout with `usePathname` mocked):

```tsx
it("on /trips: no phone top bar, the app tab bar is mounted", async () => {
  // usePathname → "/trips"; expect screen.queryByRole("link", { name: "Teepee — go to your trips" }) to be null in the phones-only header
  // and screen.getByRole("navigation", { name: "Teepee" }) to exist (AppTabBar)
});
it("inside a trip: the phone top bar stays and there is no app tab bar", async () => {
  // usePathname → "/trips/t1/plan"
});
```

Extend `app/(app)/account/page.test.tsx`:

```tsx
it("offers search, theme, help, what's new and sign out for phones", async () => {
  // render(await AccountPage()); expect getByRole("region", { name: "Phone shortcuts" }) with links to /help and /whats-new and a "Switch to dark theme" button
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/shell/app-tab-bar.test.tsx "app/(app)/layout.test.tsx" "app/(app)/account/page.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: `TabItem.icon` in `components/ui/tab-bar.tsx`**

Add `icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>` to `TabItem`; in the default link render:

```tsx
<AppLink … className={cn("relative flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 truncate rounded-md text-xs …", …)}>
  {it.icon ? <it.icon className="size-4" aria-hidden="true" /> : null}
  {it.label}
</AppLink>
```

(`place-items-center` becomes the flex column above; the trip bar, which passes no icon, renders exactly as before — its test must still pass.)

- [ ] **Step 4: `components/shell/app-tab-bar.tsx`**

```tsx
"use client";

import { LayoutGrid, Globe, UserRound } from "lucide-react";
import { TabBar, type TabItem } from "@/components/ui/tab-bar";
import { isGlobeActive, isTripsActive } from "@/components/shell/app-paths";

const ITEMS: TabItem[] = [
  { href: "/trips", label: "Trips", match: isTripsActive, icon: LayoutGrid },
  { href: "/globe", label: "Globe", match: isGlobeActive, icon: Globe },
  { href: "/account", label: "You", match: (p) => p === "/account" || p.startsWith("/account/"), icon: UserRound },
];

/** Phone tab bar on trips-level pages (TRIPS_PAGE.md §8; spec D4). Same three as the tablet Dock. */
export function AppTabBar() {
  return <TabBar items={ITEMS} aria-label="Teepee" className="bg-sun" />;
}
```

- [ ] **Step 5: `OnTripPath` in `components/app-rail.tsx`**

```tsx
/** Children only inside a Trip — the inverse of OutsideTrip (the phone top bar stays there; spec D4). */
export function OnTripPath({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (!isTripPath(path)) return null;
  return <>{children}</>;
}
```

- [ ] **Step 6: `app/(app)/layout.tsx`**

- Wrap the existing `<header …md:hidden>` in `<OnTripPath>…</OnTripPath>`.
- After `</main>` (inside the flex wrapper is fine), add `<OutsideTrip><AppTabBar /></OutsideTrip>`.
- On `<main>`, change `py-8` to `pt-8 pb-[calc(2rem+var(--tp-tab-bar-h)+env(safe-area-inset-bottom))] md:pb-8` so phone content clears the bar; `has-[[data-trip-shell]]:p-0` and `has-[[data-trips-shell]]:p-0` already zero it where the page pads itself.
- Update the layout's doc comment: phones outside a Trip get the tab bar, not the top bar.

- [ ] **Step 7: `components/account/phone-extras.tsx` and mount it**

```tsx
"use client";

import Link from "next/link";
import { SearchField } from "@/components/shell/search-field";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SignOutMenuItem } from "@/components/ui/sign-out-button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { Card, CardTitle } from "@/components/ui/card";

const ROW = "flex min-h-11 items-center justify-between rounded-md px-2 text-sm font-semibold text-foreground hover:bg-muted/50";

/**
 * Phones only: what the removed top bar used to carry on trips-level pages
 * (spec D4) — search, the theme toggle, Help, What's new, Admin, Sign out.
 */
export function PhoneExtras({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Card role="region" aria-label="Phone shortcuts" className="p-[18px] md:hidden">
      <CardTitle>Find and settings</CardTitle>
      <div className="mt-3.5 flex flex-col gap-2">
        <SearchField tripId={null} />
        <div className={ROW}><span>Theme</span><ThemeToggle /></div>
        <Link href="/help" className={ROW}>How to use Teepee</Link>
        <Link href="/whats-new" className={ROW}>What&apos;s new</Link>
        {isAdmin ? <Link href="/admin" className={ROW}>Admin</Link> : null}
        <DropdownMenu>
          <DropdownMenuTrigger className={ROW + " w-full text-left"}>Sign out</DropdownMenuTrigger>
          <DropdownMenuContent align="start"><SignOutMenuItem /></DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
```

Read `components/ui/sign-out-button.tsx` first: if it also exports a plain button (or `SignOutMenuItem` can render outside a menu), use that instead of the dropdown wrapper. In `app/(app)/account/page.tsx`, compute `isAdmin` with `isAdminEmail(profile?.email ?? null)` (`@/lib/admin`) and render `<PhoneExtras isAdmin={isAdmin} />` directly under the `<h1>`.

- [ ] **Step 8: Run tests and type-check**

Run: `npx vitest run components/shell components/ui/tab-bar.test.tsx "app/(app)/layout.test.tsx" "app/(app)/account/page.test.tsx" components/trip/mobile-tab-bar.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A app components
git commit -m "feat(shell): phone tab bar (Trips / Globe / You) on trips-level pages; top bar stays inside trips only

Search, theme and the account menu's links move to the account page on phones.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Past-trip flow — `/trips/new?past=1`

**Files:**
- Modify: `app/(app)/trips/new/page.tsx`, `app/(app)/trips/new/new-trip-form.tsx`
- Test: `app/(app)/trips/new/page.test.tsx` (extend), `app/(app)/trips/new/new-trip-form.test.tsx` (extend)

**Interfaces:**
- Produces: `NewTripForm({ past?: boolean })`; the page reads `searchParams` (a Promise in Next 16 — read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` for the exact signature) and passes `past={sp.past === "1"}`.

- [ ] **Step 1: Write the failing tests**

Extend `new-trip-form.test.tsx`:

```tsx
it("past mode: dates are required, copy changes, submit reads Add trip", () => {
  render(<NewTripForm past />);
  expect(screen.getByText("When did you go?")).toBeInTheDocument();
  expect(screen.queryByText("optional — sketch first")).toBeNull();
  expect(screen.getByRole("button", { name: "Add trip" })).toBeInTheDocument();
});
it("past mode: submitting without dates shows errors and never calls createTrip", async () => {
  render(<NewTripForm past />);
  fireEvent.change(screen.getByPlaceholderText("Europe Summer 2026"), { target: { value: "Bali 2024" } });
  fireEvent.submit(screen.getByRole("button", { name: "Add trip" }).closest("form")!);
  expect(await screen.findAllByText("Add the dates you went")).toHaveLength(2);
  expect(createTripMock).not.toHaveBeenCalled();
});
```

Extend `page.test.tsx`:

```tsx
it("?past=1 titles the page Log a past trip and passes past to the form", async () => {
  render(await NewTripPage({ searchParams: Promise.resolve({ past: "1" }) }));
  expect(screen.getByRole("heading", { name: "Log a past trip" })).toBeInTheDocument();
  expect(formMock).toHaveBeenCalledWith(expect.objectContaining({ past: true }));
});
```

(Check how the existing page test invokes `NewTripPage` and mocks the form; mirror it.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "app/(app)/trips/new"`
Expected: FAIL.

- [ ] **Step 3: Page**

```tsx
export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ past?: string }> }) {
  await requireUser();
  const past = (await searchParams).past === "1";
  return (
    <div className="mx-auto w-full max-w-[64rem] space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">{past ? "Log a past trip" : "New trip"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {past ? "Name it and say when you went. It goes on your map and counts toward your tally." : "Give it a name, set your dates, and choose your home currency."}
        </p>
      </div>
      <NewTripForm past={past} />
    </div>
  );
}
```

- [ ] **Step 4: Form**

In `NewTripForm({ past = false }: { past?: boolean })`:
- In `handleSubmit`, before `startTransition`: `if (past && (!startDate || !endDate)) { setErrors({ ...(startDate ? {} : { startDate: ["Add the dates you went"] }), ...(endDate ? {} : { endDate: ["Add the dates you went"] }) }); return; }`
- Dates block: label `{past ? "When did you go?" : "Dates"}`; the "optional — sketch first" span and the "Leave dates blank…" hint render only when `!past`; `DateField`s get `required={past}`.
- Submit button text: `{past ? "Add trip" : "Create trip"}`.
- Cover field description stays. Nothing else changes; `createTrip` is untouched (D1).

- [ ] **Step 5: Run tests**

Run: `npx vitest run "app/(app)/trips/new" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/trips/new"
git commit -m "feat(trips): log a past trip — /trips/new?past=1 requires dates; Done follows from the dates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Whole-suite verification and docs

**Files:**
- Modify: `docs/specs/2026-09-28-trips-page-carousel.md` (append a short "Built" section listing deviations found during the build), `COMPONENTS.md` (one entry each for `TripCover`/`Polaroid`, `TripCarousel`, `TravelsMapCard`, `TallyCard`, `AppTabBar` in the same style as its neighbours)

- [ ] **Step 1: Run everything**

```bash
npm test 2>&1 | tail -30
npm run lint 2>&1 | tail -20
npx tsc --noEmit
```

Expected: all green. Fix anything that fails in the task that owns the code (small fixes here are fine; note them in the commit).

- [ ] **Step 2: Run the app and check the three screens**

Use the `run` skill (or `npm run dev`) and load `/trips` at 1440×900 with the dev database (`dev.db`), then at 390 wide, and once with a user that has no trips if one exists in `dev.db`. Confirm: no page scroll at 1440×900 with ≥3 trips; arrows and dots behave; the map draws coloured pins; the tally toggles; the phone tab bar shows and the top bar does not on `/trips`; inside a trip the top bar is still there.

- [ ] **Step 3: Docs**

Append to the spec:

```markdown
## Built (2026-09-28)

- Tab bar height keeps the shared `--tp-tab-bar-h` (76px + safe area) rather than the handoff's 88px, so phone chrome is one height inside and outside a trip.
- The Home route map keeps its largest-cluster pick (P2); the cover's most-nights pick lives in `lib/trips/route-sketch.ts`.
- <any further deviation discovered while building>
```

Add the `COMPONENTS.md` entries.

- [ ] **Step 4: Commit**

```bash
git add docs/specs/2026-09-28-trips-page-carousel.md COMPONENTS.md
git commit -m "docs: trips page carousel — built notes and component entries

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
