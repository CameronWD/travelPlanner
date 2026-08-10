# Combined Chapters for Interleaved Routes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Trip's route revisits a country (its stops interleave two or more countries), the country auto-suggester proposes a single **combined chapter** over the tangled stretch (e.g. "Germany & France") instead of several confusingly same-named bands.

**Architecture:** Pure functions in a new `lib/chapter-suggest.ts` module compute the suggested chapters: build country-runs → detect interleaved zones (interval merge on recurring countries) → edge-peel substantial single-country stays off zone ends → name and disambiguate → seam-trim. The existing server action `suggestChaptersFromCountries` is repointed from `suggestChapterRuns` to the new `suggestChapters`. The domain model (ADR 0008: contiguous, non-overlapping, date-computed chapter bands) is **unchanged** — no schema migration, no UI changes. A combined chapter is an ordinary chapter row spanning the whole zone; transport with both endpoints inside it folds into its subtotal automatically.

**Tech Stack:** TypeScript, Next.js server actions, Prisma, Vitest.

## Global Constraints

- **Model unchanged (ADR 0008):** chapters stay contiguous, non-overlapping date bands; membership computed by a stop's arrive date. No schema change, no migration.
- **Suggester-only:** this changes the auto-suggester's *proposal* only. Manual create/rename/re-draw of chapters is untouched, and manual chapters are exempt from the naming rules.
- **Threshold:** a single-country run of **5 or more nights, run-total** (`SUBSTANTIAL_STAY_NIGHTS = 5`) at the **front or back** of a zone is peeled into its own chapter; a substantial stay **inside** a zone stays in the combined band.
- **Naming (combined chapters), first-appearance order, de-duplicated:** 2 → `"A & B"`; 3 → `"A, B & C"`; 4+ → `"Multi-country leg"`. On an **exact** name clash between two suggested chapters, append the anchor city: `"France (Paris)"`.
- **Date strings** are `YYYY-MM-DD`; string comparison is chronological. Nights via `nightsBetween` from `lib/dates.ts`.
- **Tests:** Vitest. Run a file with `npx vitest run <path>`; run the suite with `npm test`.
- **Commit** after each task. Do not merge, push, or touch `main`.

---

### Task 1: ADR 0034 — Combined chapters for interleaved routes

**Files:**
- Create: `docs/adr/0034-combined-chapters-for-interleaved-routes.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (documentation only).

- [ ] **Step 1: Write the ADR** in the house style of the existing `docs/adr/*.md` files (Context / Decision / Consequences), with this content:

```markdown
# Combined chapters for interleaved routes

Extends ADR 0008's point 4 ("auto-suggest-from-country only fills Ungrouped spans").

## Context

A Chapter is a contiguous, non-overlapping date band; membership is computed from
a Stop's arrive date (ADR 0008). Country auto-suggestion opens a new band each time
the country changes as it walks Stops in date order. This is perfect for the
canonical trip, where each country is one contiguous block (Finland → UK → Ireland
→ France → Italy).

It degrades badly when a route **revisits** a country — Munich (DE) → Strasbourg
(FR) → Frankfurt (DE) → Paris (FR). Grouping "all Germany / all France" is
impossible: those bands would overlap, which the model forbids. The suggester
therefore emitted four bands — `Germany, France, Germany, France` — two pairs
sharing a name, which reads as a mistake and adds ceremony instead of reducing
the scroll a chapter exists to tame.

We keep the model and make the suggester interleave-aware.

## Decision

1. **Detect interleaved zones.** After building country-runs, any country that
   appears in more than one (necessarily non-adjacent) run forces the span
   between its first and last run into one **zone**; overlapping spans merge.
   Runs in no zone stay standalone country chapters, exactly as before.

2. **One combined chapter per zone**, spanning the whole contiguous stretch,
   named for the countries it contains in first-appearance order, de-duplicated:
   `"Germany & France"`; three → `"A, B & C"`; four or more → `"Multi-country leg"`.

3. **Edge-peel substantial stays.** A single-country run of **5+ nights
   (run-total)** at the **front or back** of a zone is peeled into its own
   chapter. The interleaved core always merges regardless of night count; a
   substantial stay **sandwiched inside** a zone stays in the combined band —
   it cannot be extracted without re-fragmenting the contiguous stretch, and
   the band reads better than slivers.

4. **Disambiguate exact clashes.** If two suggested chapters would carry the
   identical name (e.g. a double edge-peel `Paris(7) · Munich(2) · Lyon(7)` →
   `France · Germany · France`), append each colliding chapter's anchor city:
   `France (Paris) · Germany · France (Lyon)`. Fires only on an exact match, so
   `France · Germany & France` (solo + combo) is left alone.

5. **Suggester-only.** No schema change, no migration, no UI change. A combined
   chapter is an ordinary chapter row; transport with both endpoints inside it
   is intra-chapter and folds into its subtotal (ADR 0008), so the short hops
   within a loop stop being between-legs lines while the big boundary hops in
   and out of the zone stay between-legs. Every chapter remains freely
   renamable and re-drawable; manual chapters are exempt from the naming rules.

## Consequences

- Interleaved trips get a small number of meaningful chapters instead of a pile
  of same-named single-stop bands. Per-loop budget rolls up under the combined
  chapter; boundary hops remain visible as between-legs travel.
- The suggester's output is a first proposal, not a constraint — the human keeps
  full control, which is why the threshold and edge-peel heuristics can be
  "good enough" rather than perfect.
- Purely additive to ADR 0008: the model, schema and roll-up code are untouched;
  this is logic inside the suggester. Reversible by reverting the suggester.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0034-combined-chapters-for-interleaved-routes.md
git commit -m "docs(adr): 0034 combined chapters for interleaved routes"
```

---

### Task 2: Naming helper (`combineName`) + module scaffold

**Files:**
- Create: `lib/chapter-suggest.ts`
- Test: `lib/chapter-suggest.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SUBSTANTIAL_STAY_NIGHTS: number` (= 5)
  - `interface SuggestStop { name: string; arriveDate: string | null; departDate: string | null; country: string | null }`
  - `interface CountryRun { country: string; anchorCity: string; startDate: string; endDate: string; nights: number }`
  - `combineName(countries: readonly string[]): string`

- [ ] **Step 1: Write the failing test** — create `lib/chapter-suggest.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { combineName } from "./chapter-suggest";

describe("combineName", () => {
  it("returns the single country unchanged", () => {
    expect(combineName(["Germany"])).toBe("Germany");
  });
  it("joins two countries with an ampersand", () => {
    expect(combineName(["Germany", "France"])).toBe("Germany & France");
  });
  it("uses Oxford-style for three", () => {
    expect(combineName(["Germany", "France", "Switzerland"])).toBe("Germany, France & Switzerland");
  });
  it("falls back to a generic label for four or more", () => {
    expect(combineName(["Germany", "France", "Switzerland", "Austria"])).toBe("Multi-country leg");
  });
  it("de-duplicates preserving first-appearance order before counting", () => {
    // Germany, France, Germany → two unique → "Germany & France"
    expect(combineName(["Germany", "France", "Germany"])).toBe("Germany & France");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/chapter-suggest.test.ts`
Expected: FAIL — cannot resolve `./chapter-suggest` / `combineName is not a function`.

- [ ] **Step 3: Create `lib/chapter-suggest.ts`** with the scaffold and `combineName`:

```typescript
import { addDays, nightsBetween } from "./dates";
import type { ChapterRun } from "./chapters";

/**
 * A dated Stop as consumed by the chapter suggester. Only stops with BOTH
 * arriveDate AND departDate are considered; a country-less stop breaks a run.
 */
export interface SuggestStop {
  name: string;
  arriveDate: string | null;
  departDate: string | null;
  country: string | null;
}

/** A maximal run of consecutive same-country dated stops. */
export interface CountryRun {
  country: string;
  anchorCity: string; // first stop's name — used only for name disambiguation
  startDate: string; // first stop's arriveDate
  endDate: string; // last stop's departDate
  nights: number; // run-total nights = nightsBetween(startDate, endDate)
}

/** Nights at or above this (run-total) let an edge run stand as its own chapter. */
export const SUBSTANTIAL_STAY_NIGHTS = 5;

/**
 * Build a combined-chapter name from the countries in it, de-duplicated
 * preserving first-appearance order:
 *   1  → "Germany"
 *   2  → "Germany & France"
 *   3  → "Germany, France & Switzerland"
 *   4+ → "Multi-country leg"
 */
export function combineName(countries: readonly string[]): string {
  const unique: string[] = [];
  for (const c of countries) if (!unique.includes(c)) unique.push(c);
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} & ${unique[1]}`;
  if (unique.length === 3) return `${unique[0]}, ${unique[1]} & ${unique[2]}`;
  return "Multi-country leg";
}
```

> Note: `addDays` and `nightsBetween` are imported now so later tasks in this file don't re-touch the import line; they're used in Tasks 3 and 6. If your linter flags them as unused at this step, that's expected and resolved by Task 3.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/chapter-suggest.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/chapter-suggest.ts lib/chapter-suggest.test.ts
git commit -m "feat(chapters): combineName helper for combined-chapter naming"
```

---

### Task 3: Build country-runs (`countryRuns`)

**Files:**
- Modify: `lib/chapter-suggest.ts`
- Test: `lib/chapter-suggest.test.ts`

**Interfaces:**
- Consumes: `SuggestStop`, `CountryRun`, `nightsBetween` (from `lib/dates.ts`).
- Produces: `countryRuns(stops: readonly SuggestStop[]): CountryRun[]`

- [ ] **Step 1: Write the failing test** — append to `lib/chapter-suggest.test.ts`:

```typescript
import { countryRuns } from "./chapter-suggest";

describe("countryRuns", () => {
  it("merges consecutive same-country stops into one run with run-total nights", () => {
    const runs = countryRuns([
      { name: "Helsinki", arriveDate: "2026-06-26", departDate: "2026-06-30", country: "Finland" },
      { name: "Rovaniemi", arriveDate: "2026-06-30", departDate: "2026-07-03", country: "Finland" },
      { name: "London", arriveDate: "2026-07-03", departDate: "2026-07-07", country: "United Kingdom" },
    ]);
    expect(runs).toEqual([
      { country: "Finland", anchorCity: "Helsinki", startDate: "2026-06-26", endDate: "2026-07-03", nights: 7 },
      { country: "United Kingdom", anchorCity: "London", startDate: "2026-07-03", endDate: "2026-07-07", nights: 4 },
    ]);
  });

  it("opens a fresh run each time the country changes, even when it recurs", () => {
    const runs = countryRuns([
      { name: "Munich", arriveDate: "2026-07-01", departDate: "2026-07-03", country: "Germany" },
      { name: "Strasbourg", arriveDate: "2026-07-03", departDate: "2026-07-05", country: "France" },
      { name: "Frankfurt", arriveDate: "2026-07-05", departDate: "2026-07-07", country: "Germany" },
      { name: "Paris", arriveDate: "2026-07-07", departDate: "2026-07-10", country: "France" },
    ]);
    expect(runs.map((r) => r.country)).toEqual(["Germany", "France", "Germany", "France"]);
    expect(runs.map((r) => r.anchorCity)).toEqual(["Munich", "Strasbourg", "Frankfurt", "Paris"]);
  });

  it("skips rough (date-less) and country-less stops, ordering by arrive date", () => {
    const runs = countryRuns([
      { name: "Late", arriveDate: "2026-07-10", departDate: "2026-07-12", country: "Italy" },
      { name: "Rough", arriveDate: null, departDate: null, country: "Spain" },
      { name: "Nowhere", arriveDate: "2026-07-01", departDate: "2026-07-03", country: null },
      { name: "Early", arriveDate: "2026-07-03", departDate: "2026-07-06", country: "France" },
    ]);
    expect(runs.map((r) => r.country)).toEqual(["France", "Italy"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/chapter-suggest.test.ts -t countryRuns`
Expected: FAIL — `countryRuns is not a function`.

- [ ] **Step 3: Add `countryRuns` to `lib/chapter-suggest.ts`** (below `combineName`):

```typescript
/**
 * Group dated stops into maximal runs of consecutive same-country stops, in
 * date order. Stops missing arrive/depart or country are skipped and break the
 * current run (they stay Ungrouped). Mirrors the run-building the previous
 * suggester used, but also carries run-total nights and an anchor city.
 */
export function countryRuns(stops: readonly SuggestStop[]): CountryRun[] {
  const dated = stops.filter(
    (s): s is SuggestStop & { arriveDate: string; departDate: string } =>
      s.arriveDate !== null && s.departDate !== null,
  );
  const ordered = [...dated].sort((a, b) => a.arriveDate.localeCompare(b.arriveDate));

  const runs: CountryRun[] = [];
  let current: CountryRun | null = null;
  let currentCountry: string | null = null;

  for (const stop of ordered) {
    const country = stop.country?.trim() || null;
    if (country && country === currentCountry && current) {
      current.endDate = stop.departDate;
      current.nights = nightsBetween(current.startDate, current.endDate);
    } else if (country) {
      current = {
        country,
        anchorCity: stop.name,
        startDate: stop.arriveDate,
        endDate: stop.departDate,
        nights: nightsBetween(stop.arriveDate, stop.departDate),
      };
      currentCountry = country;
      runs.push(current);
    } else {
      current = null;
      currentCountry = null;
    }
  }
  return runs;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/chapter-suggest.test.ts`
Expected: PASS (all `combineName` + `countryRuns` tests).

- [ ] **Step 5: Commit**

```bash
git add lib/chapter-suggest.ts lib/chapter-suggest.test.ts
git commit -m "feat(chapters): countryRuns with run-total nights and anchor city"
```

---

### Task 4: Detect interleaved zones (`zoneIntervals`)

**Files:**
- Modify: `lib/chapter-suggest.ts`
- Test: `lib/chapter-suggest.test.ts`

**Interfaces:**
- Consumes: `CountryRun`.
- Produces: `zoneIntervals(runs: readonly CountryRun[]): [number, number][]` — sorted, disjoint, inclusive `[startIdx, endIdx]` pairs. A run index inside a pair belongs to that zone; indices in no pair are standalone.

- [ ] **Step 1: Write the failing test** — append to `lib/chapter-suggest.test.ts`:

```typescript
import { zoneIntervals } from "./chapter-suggest";

// Minimal run factory — only country matters for zone detection.
function run(country: string): CountryRunForTest {
  return { country, anchorCity: country, startDate: "2026-01-01", endDate: "2026-01-02", nights: 1 };
}
type CountryRunForTest = { country: string; anchorCity: string; startDate: string; endDate: string; nights: number };

describe("zoneIntervals", () => {
  it("returns no zones when every country is unique", () => {
    expect(zoneIntervals([run("Finland"), run("United Kingdom"), run("Italy")])).toEqual([]);
  });

  it("spans a single recurring country from its first to last run", () => {
    // Germany, France, Germany → Germany recurs at 0 and 2
    expect(zoneIntervals([run("Germany"), run("France"), run("Germany")])).toEqual([[0, 2]]);
  });

  it("merges interlocking recurrences into one zone", () => {
    // Germany(0,2), France(1,3) → [0,2] and [1,3] merge → [0,3]
    expect(zoneIntervals([run("Germany"), run("France"), run("Germany"), run("France")])).toEqual([[0, 3]]);
  });

  it("keeps two separate tangles separate when a clean country sits between them", () => {
    // Germany(0,2), Italy(3) clean, Spain(4,6)
    const runs = [run("Germany"), run("France"), run("Germany"), run("Italy"), run("Spain"), run("Portugal"), run("Spain")];
    expect(zoneIntervals(runs)).toEqual([[0, 2], [4, 6]]);
  });

  it("does not merge adjacent-but-non-overlapping tangles", () => {
    // Germany(0,2), Spain(3,5) — touch at the 2|3 boundary but share no index
    const runs = [run("Germany"), run("France"), run("Germany"), run("Spain"), run("Portugal"), run("Spain")];
    expect(zoneIntervals(runs)).toEqual([[0, 2], [3, 5]]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/chapter-suggest.test.ts -t zoneIntervals`
Expected: FAIL — `zoneIntervals is not a function`.

- [ ] **Step 3: Add `zoneIntervals` to `lib/chapter-suggest.ts`:**

```typescript
/**
 * Index intervals of the interleaved zones — contiguous stretches of runs
 * within which a country recurs. A country appearing in more than one run
 * (necessarily non-adjacent, since runs are maximal) forces the span between
 * its first and last run into one zone; spans that share an index merge, but
 * spans that merely touch at a boundary (a clean gap between two tangles) do
 * not. Returns sorted, disjoint inclusive [startIdx, endIdx] pairs.
 */
export function zoneIntervals(runs: readonly CountryRun[]): [number, number][] {
  const firstIdx = new Map<string, number>();
  const lastIdx = new Map<string, number>();
  runs.forEach((r, i) => {
    if (!firstIdx.has(r.country)) firstIdx.set(r.country, i);
    lastIdx.set(r.country, i);
  });

  const spans: [number, number][] = [];
  for (const [country, first] of firstIdx) {
    const last = lastIdx.get(country)!;
    if (last > first) spans.push([first, last]);
  }
  spans.sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const [start, end] of spans) {
    const prev = merged[merged.length - 1];
    if (prev && start <= prev[1]) {
      prev[1] = Math.max(prev[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/chapter-suggest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/chapter-suggest.ts lib/chapter-suggest.test.ts
git commit -m "feat(chapters): zoneIntervals detects interleaved zones"
```

---

### Task 5: Assemble zones with edge-peel (`buildChapters`)

**Files:**
- Modify: `lib/chapter-suggest.ts`
- Test: `lib/chapter-suggest.test.ts`

**Interfaces:**
- Consumes: `CountryRun`, `zoneIntervals` output, `combineName`, `SUBSTANTIAL_STAY_NIGHTS`.
- Produces:
  - `interface PlacedChapter { name: string; startDate: string; endDate: string; anchorCity: string }` (exported for testing)
  - `buildChapters(runs: readonly CountryRun[], intervals: readonly [number, number][]): PlacedChapter[]`

- [ ] **Step 1: Write the failing test** — append to `lib/chapter-suggest.test.ts`:

```typescript
import { buildChapters } from "./chapter-suggest";

// Full run factory with dates + nights for edge-peel behavior.
function frun(country: string, city: string, start: string, end: string, nights: number): CountryRunForTest {
  return { country, anchorCity: city, startDate: start, endDate: end, nights };
}

describe("buildChapters", () => {
  it("emits standalone chapters for clean unique-country runs", () => {
    const runs = [
      frun("Finland", "Helsinki", "2026-06-26", "2026-07-03", 7),
      frun("United Kingdom", "London", "2026-07-03", "2026-07-07", 4),
    ];
    const out = buildChapters(runs, zoneIntervals(runs));
    expect(out.map((c) => c.name)).toEqual(["Finland", "United Kingdom"]);
  });

  it("combines a short interleaved zone into one chapter spanning it", () => {
    const runs = [
      frun("Germany", "Munich", "2026-07-01", "2026-07-03", 2),
      frun("France", "Strasbourg", "2026-07-03", "2026-07-05", 2),
      frun("Germany", "Frankfurt", "2026-07-05", "2026-07-07", 2),
      frun("France", "Paris", "2026-07-07", "2026-07-10", 3),
    ];
    const out = buildChapters(runs, zoneIntervals(runs));
    expect(out).toEqual([
      { name: "Germany & France", startDate: "2026-07-01", endDate: "2026-07-10", anchorCity: "Munich" },
    ]);
  });

  it("keeps a substantial stay sandwiched inside the zone in the combined band", () => {
    const runs = [
      frun("Germany", "Munich", "2026-07-01", "2026-07-03", 2),
      frun("France", "Paris", "2026-07-03", "2026-07-10", 7), // interior, 7 nights
      frun("Germany", "Frankfurt", "2026-07-10", "2026-07-12", 2),
    ];
    const out = buildChapters(runs, zoneIntervals(runs));
    expect(out.map((c) => c.name)).toEqual(["Germany & France"]);
    expect(out[0].startDate).toBe("2026-07-01");
    expect(out[0].endDate).toBe("2026-07-12");
  });

  it("peels a substantial run off the FRONT of a zone as its own chapter", () => {
    const runs = [
      frun("France", "Paris", "2026-07-01", "2026-07-08", 7), // front, 7 nights
      frun("Germany", "Munich", "2026-07-08", "2026-07-10", 2),
      frun("France", "Strasbourg", "2026-07-10", "2026-07-12", 2),
      frun("Germany", "Frankfurt", "2026-07-12", "2026-07-14", 2),
    ];
    const out = buildChapters(runs, zoneIntervals(runs));
    expect(out.map((c) => c.name)).toEqual(["France", "Germany & France"]);
    expect(out[0]).toMatchObject({ startDate: "2026-07-01", endDate: "2026-07-08", anchorCity: "Paris" });
    expect(out[1]).toMatchObject({ startDate: "2026-07-08", endDate: "2026-07-14" });
  });

  it("double edge-peel leaves two same-named standalones around the core", () => {
    // Paris(7) · Munich(2) · Lyon(7): both French weeks peel, Germany core remains.
    const runs = [
      frun("France", "Paris", "2026-07-01", "2026-07-08", 7),
      frun("Germany", "Munich", "2026-07-08", "2026-07-10", 2),
      frun("France", "Lyon", "2026-07-10", "2026-07-17", 7),
    ];
    const out = buildChapters(runs, zoneIntervals(runs));
    // Names still collide here; disambiguation is Task 6. Assert structure + order.
    expect(out.map((c) => c.name)).toEqual(["France", "Germany", "France"]);
    expect(out.map((c) => c.anchorCity)).toEqual(["Paris", "Munich", "Lyon"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/chapter-suggest.test.ts -t buildChapters`
Expected: FAIL — `buildChapters is not a function`.

- [ ] **Step 3: Add `PlacedChapter`, `buildChapters`, and the private zone helper to `lib/chapter-suggest.ts`:**

```typescript
/** A chapter positioned in the plan, before seam-trimming and final output. */
export interface PlacedChapter {
  name: string;
  startDate: string;
  endDate: string;
  anchorCity: string;
}

function standalone(r: CountryRun): PlacedChapter {
  return { name: r.country, startDate: r.startDate, endDate: r.endDate, anchorCity: r.anchorCity };
}

/**
 * Turn runs + zone intervals into positioned chapters, left to right. Runs
 * outside any zone become standalone country chapters. Each zone becomes a
 * combined chapter over its core, with substantial (>= SUBSTANTIAL_STAY_NIGHTS,
 * run-total) single-country runs at the zone's FRONT or BACK peeled off as
 * their own chapters.
 */
export function buildChapters(
  runs: readonly CountryRun[],
  intervals: readonly [number, number][],
): PlacedChapter[] {
  const zoneStartToEnd = new Map<number, number>();
  for (const [start, end] of intervals) zoneStartToEnd.set(start, end);

  const out: PlacedChapter[] = [];
  let i = 0;
  while (i < runs.length) {
    const end = zoneStartToEnd.get(i);
    if (end === undefined) {
      out.push(standalone(runs[i]));
      i += 1;
    } else {
      out.push(...buildZoneChapters(runs.slice(i, end + 1)));
      i = end + 1;
    }
  }
  return out;
}

/** Edge-peel a single zone into [leftPeeled..., core?, rightPeeled...]. */
function buildZoneChapters(zoneRuns: readonly CountryRun[]): PlacedChapter[] {
  let left = 0;
  let right = zoneRuns.length - 1;
  const leftPeeled: PlacedChapter[] = [];
  const rightPeeled: PlacedChapter[] = [];

  while (left <= right && zoneRuns[left].nights >= SUBSTANTIAL_STAY_NIGHTS) {
    leftPeeled.push(standalone(zoneRuns[left]));
    left += 1;
  }
  while (right >= left && zoneRuns[right].nights >= SUBSTANTIAL_STAY_NIGHTS) {
    rightPeeled.push(standalone(zoneRuns[right]));
    right -= 1;
  }

  const core: PlacedChapter[] = [];
  if (left <= right) {
    const coreRuns = zoneRuns.slice(left, right + 1);
    core.push({
      name: combineName(coreRuns.map((r) => r.country)),
      startDate: coreRuns[0].startDate,
      endDate: coreRuns[coreRuns.length - 1].endDate,
      anchorCity: coreRuns[0].anchorCity,
    });
  }

  return [...leftPeeled, ...core, ...rightPeeled.reverse()];
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/chapter-suggest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/chapter-suggest.ts lib/chapter-suggest.test.ts
git commit -m "feat(chapters): buildChapters assembles zones with edge-peel"
```

---

### Task 6: Disambiguate + orchestrate (`disambiguateNames`, `suggestChapters`)

**Files:**
- Modify: `lib/chapter-suggest.ts`
- Test: `lib/chapter-suggest.test.ts`

**Interfaces:**
- Consumes: `PlacedChapter`, `buildChapters`, `countryRuns`, `zoneIntervals`, `addDays` (from `lib/dates.ts`), `ChapterRun` (type, from `lib/chapters.ts`).
- Produces:
  - `disambiguateNames(chapters: readonly PlacedChapter[]): PlacedChapter[]`
  - `suggestChapters(stops: readonly SuggestStop[]): ChapterRun[]` — the public entry the action calls. `ChapterRun` is `{ name: string; startDate: string; endDate: string }`.

- [ ] **Step 1: Write the failing test** — append to `lib/chapter-suggest.test.ts`:

```typescript
import { disambiguateNames, suggestChapters } from "./chapter-suggest";

describe("disambiguateNames", () => {
  it("appends the anchor city to chapters that share an identical name", () => {
    const out = disambiguateNames([
      { name: "France", startDate: "2026-07-01", endDate: "2026-07-08", anchorCity: "Paris" },
      { name: "Germany", startDate: "2026-07-08", endDate: "2026-07-10", anchorCity: "Munich" },
      { name: "France", startDate: "2026-07-10", endDate: "2026-07-17", anchorCity: "Lyon" },
    ]);
    expect(out.map((c) => c.name)).toEqual(["France (Paris)", "Germany", "France (Lyon)"]);
  });
  it("leaves a solo+combo pair alone (not an exact clash)", () => {
    const out = disambiguateNames([
      { name: "France", startDate: "2026-07-01", endDate: "2026-07-08", anchorCity: "Paris" },
      { name: "Germany & France", startDate: "2026-07-08", endDate: "2026-07-14", anchorCity: "Munich" },
    ]);
    expect(out.map((c) => c.name)).toEqual(["France", "Germany & France"]);
  });
});

describe("suggestChapters (end to end)", () => {
  it("matches the previous suggester for clean country blocks (seam-trimmed)", () => {
    const runs = suggestChapters([
      { name: "Helsinki", arriveDate: "2026-06-26", departDate: "2026-06-30", country: "Finland" },
      { name: "Rovaniemi", arriveDate: "2026-06-30", departDate: "2026-07-03", country: "Finland" },
      { name: "London", arriveDate: "2026-07-03", departDate: "2026-07-07", country: "United Kingdom" },
    ]);
    expect(runs).toEqual([
      { name: "Finland", startDate: "2026-06-26", endDate: "2026-07-02" },
      { name: "United Kingdom", startDate: "2026-07-03", endDate: "2026-07-07" },
    ]);
  });

  it("combines the canonical ping-pong route into one chapter", () => {
    const runs = suggestChapters([
      { name: "Munich", arriveDate: "2026-07-01", departDate: "2026-07-03", country: "Germany" },
      { name: "Strasbourg", arriveDate: "2026-07-03", departDate: "2026-07-05", country: "France" },
      { name: "Frankfurt", arriveDate: "2026-07-05", departDate: "2026-07-07", country: "Germany" },
      { name: "Paris", arriveDate: "2026-07-07", departDate: "2026-07-10", country: "France" },
    ]);
    expect(runs).toEqual([
      { name: "Germany & France", startDate: "2026-07-01", endDate: "2026-07-10" },
    ]);
  });

  it("disambiguates a double edge-peel with the anchor city", () => {
    const runs = suggestChapters([
      { name: "Paris", arriveDate: "2026-07-01", departDate: "2026-07-08", country: "France" },
      { name: "Munich", arriveDate: "2026-07-08", departDate: "2026-07-10", country: "Germany" },
      { name: "Lyon", arriveDate: "2026-07-10", departDate: "2026-07-17", country: "France" },
    ]);
    expect(runs.map((r) => r.name)).toEqual(["France (Paris)", "Germany", "France (Lyon)"]);
  });

  it("returns no runs for an empty or fully-rough trip", () => {
    expect(suggestChapters([])).toEqual([]);
    expect(suggestChapters([{ name: "X", arriveDate: null, departDate: null, country: "Spain" }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/chapter-suggest.test.ts -t "suggestChapters"`
Expected: FAIL — `suggestChapters is not a function`.

- [ ] **Step 3: Add `disambiguateNames` and `suggestChapters` to `lib/chapter-suggest.ts`:**

```typescript
/**
 * Append the anchor city to every chapter in any group that shares an exact
 * name (e.g. two "France" bands from a double edge-peel → "France (Paris)" and
 * "France (Lyon)"). A solo + combined pair ("France" vs "Germany & France") is
 * not an exact clash and is left alone.
 */
export function disambiguateNames(chapters: readonly PlacedChapter[]): PlacedChapter[] {
  const counts = new Map<string, number>();
  for (const c of chapters) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  return chapters.map((c) =>
    (counts.get(c.name) ?? 0) > 1 ? { ...c, name: `${c.name} (${c.anchorCity})` } : c,
  );
}

/**
 * Suggest chapters for a Trip's dated stops (see ADR 0008 and ADR 0034). Clean,
 * unique-country blocks become one chapter each; an interleaved stretch becomes
 * a single combined chapter (with substantial edge stays peeled off). Adjacent
 * bands are seam-trimmed so they never share a boundary day — chaptersOverlap
 * is inclusive and stops hand off arrive == previous depart.
 */
export function suggestChapters(stops: readonly SuggestStop[]): ChapterRun[] {
  const runs = countryRuns(stops);
  const placed = disambiguateNames(buildChapters(runs, zoneIntervals(runs)));

  for (let i = 0; i < placed.length - 1; i++) {
    if (placed[i].endDate >= placed[i + 1].startDate) {
      const trimmed = addDays(placed[i + 1].startDate, -1);
      placed[i].endDate = trimmed >= placed[i].startDate ? trimmed : placed[i].startDate;
    }
  }

  return placed.map((c) => ({ name: c.name, startDate: c.startDate, endDate: c.endDate }));
}
```

- [ ] **Step 4: Run the full file to verify it passes**

Run: `npx vitest run lib/chapter-suggest.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add lib/chapter-suggest.ts lib/chapter-suggest.test.ts
git commit -m "feat(chapters): suggestChapters orchestration with disambiguation + seam-trim"
```

---

### Task 7: Wire the action to `suggestChapters`; retire `suggestChapterRuns`

**Files:**
- Modify: `server/actions/chapters.ts` (import at line 8; stop select ~lines 289-297; call at line 299)
- Modify: `lib/chapters.ts` (remove `suggestChapterRuns` function; drop now-unused `addDays` import; keep `ChapterRun` interface)
- Modify: `lib/chapters.test.ts` (remove `suggestChapterRuns` import + its `describe` block)
- Modify: `server/actions/chapters.test.ts` (add `name` to stop mocks; add a combined-chapter test; fix the stale comment)
- Modify: `server/actions/stops.ts` (line ~876 comment: `suggestChapterRuns` → `suggestChapters`)

**Interfaces:**
- Consumes: `suggestChapters` from `@/lib/chapter-suggest`.
- Produces: no new exports. `suggestChaptersFromCountries` behavior now emits combined chapters for interleaved routes.

- [ ] **Step 1: Update the action.** In `server/actions/chapters.ts`:

Change the import on line 8 from:

```typescript
import { chaptersOverlap, suggestChapterRuns } from "@/lib/chapters";
```

to:

```typescript
import { chaptersOverlap } from "@/lib/chapters";
import { suggestChapters } from "@/lib/chapter-suggest";
```

In `suggestChaptersFromCountries`, add `name: true` to the stop `select` (the anchor-city source):

```typescript
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN },
      select: { id: true, name: true, arriveDate: true, departDate: true, country: true, sortOrder: true },
    }),
```

Change the runs call from `const runs = suggestChapterRuns(stops);` to:

```typescript
  const runs = suggestChapters(stops);
```

- [ ] **Step 2: Remove the superseded function from `lib/chapters.ts`.** Delete the entire `suggestChapterRuns` function (from its doc comment through its closing brace — the `export function suggestChapterRuns(...) { ... }` block). **Keep** the `ChapterRun` interface (it is imported by `lib/chapter-suggest.ts`). Then change the first import line from:

```typescript
import { addDays, isDateWithin } from "./dates";
```

to:

```typescript
import { isDateWithin } from "./dates";
```

(`addDays` was only used by the deleted function.)

- [ ] **Step 3: Update `lib/chapters.test.ts`.** Remove `suggestChapterRuns` from the import block (line 9) and delete the whole `describe("suggestChapterRuns", () => { ... })` block (its `it(...)` cases, including the old `["France", "Italy", "France"]` expectation — that behavior now lives in `lib/chapter-suggest.test.ts`). Leave the other imports and the shared `stops` fixture intact.

- [ ] **Step 4: Update `server/actions/chapters.test.ts`.** Add `name` to each stop object in the three `suggestChaptersFromCountries` mocks (any value, e.g. `name: "City"`), fix the stale comment `// Empty stops → suggestChapterRuns yields no runs` to say `suggestChapters`, and add a new test proving the combined behavior:

```typescript
  it("creates a single combined chapter for an interleaved route", async () => {
    // Munich(DE) → Strasbourg(FR) → Frankfurt(DE) → Paris(FR): Germany & France interleave.
    stopFindManyMock.mockResolvedValue([
      { id: "a", name: "Munich", arriveDate: "2026-07-01", departDate: "2026-07-03", country: "Germany", sortOrder: 0 },
      { id: "b", name: "Strasbourg", arriveDate: "2026-07-03", departDate: "2026-07-05", country: "France", sortOrder: 1 },
      { id: "c", name: "Frankfurt", arriveDate: "2026-07-05", departDate: "2026-07-07", country: "Germany", sortOrder: 2 },
      { id: "d", name: "Paris", arriveDate: "2026-07-07", departDate: "2026-07-10", country: "France", sortOrder: 3 },
    ]);
    chapterFindManyMock.mockResolvedValue([]);
    const r = await suggestChaptersFromCountries("trip-1");
    expect(r.success).toBe(true);
    const callArg = chapterCreateManyMock.mock.calls[0][0] as { data: { name: string; startDate: string; endDate: string }[] };
    expect(callArg.data).toHaveLength(1);
    expect(callArg.data[0]).toMatchObject({ name: "Germany & France", startDate: "2026-07-01", endDate: "2026-07-10" });
  });
```

- [ ] **Step 5: Update the stale comment in `server/actions/stops.ts`** (~line 876): change `// Mirrors the seam trim in suggestChapterRuns.` to `// Mirrors the seam trim in suggestChapters.`

- [ ] **Step 6: Run the affected suites**

Run: `npx vitest run lib/chapters.test.ts lib/chapter-suggest.test.ts server/actions/chapters.test.ts`
Expected: PASS. No reference to `suggestChapterRuns` remains.

- [ ] **Step 7: Type-check and full suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; full Vitest suite green.

- [ ] **Step 8: Verify no dangling references**

Run: `rg -n "suggestChapterRuns" --glob '!node_modules'`
Expected: no matches (the only surviving mention is historical, in `docs/adr/*` if any — acceptable; code and tests must be clean).

- [ ] **Step 9: Commit**

```bash
git add server/actions/chapters.ts server/actions/chapters.test.ts lib/chapters.ts lib/chapters.test.ts server/actions/stops.ts
git commit -m "feat(chapters): suggest combined chapters for interleaved routes"
```

---

## Self-Review

**1. Spec coverage:**
- Detect interleaved zones → Task 4 (`zoneIntervals`). ✓
- Combined chapter per zone → Task 5 (`buildChapters` core) + Task 2 (`combineName`). ✓
- Edge-peel, 5+ nights run-total, front/back only, sandwiched stays kept → Task 5 (`buildZoneChapters`) + Task 3 (run-total `nights`). ✓
- Naming: first-appearance dedup, 2/3/4+ rules → Task 2. ✓
- Exact-clash city suffix → Task 6 (`disambiguateNames`). ✓
- Internal hops fold in / boundary hops stay between-legs → automatic via ADR 0008 (combined chapter is one date band); no code needed — documented in Task 1 ADR. ✓
- Clean blocks unchanged + seam-trim parity → Task 6 end-to-end regression test. ✓
- Suggester-only, no schema/UI change → Task 7 (action wiring only); ADR §5. ✓
- ADR drafted → Task 1. ✓

**2. Placeholder scan:** No TBD/TODO; every code and test step carries full content. ✓

**3. Type consistency:** `SuggestStop`, `CountryRun`, `PlacedChapter`, `ChapterRun` names and shapes are consistent across Tasks 2–7. `suggestChapters(stops: readonly SuggestStop[]): ChapterRun[]` matches the action's call site (stops carry extra `id`/`sortOrder` — allowed by structural typing since they're passed as a variable, not an object literal). `nightsBetween`/`addDays` signatures match `lib/dates.ts`. ✓
