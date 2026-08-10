# Plan-Editor Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nine plan-editor refinements to TEEPEE — spelled-out night counts, a self-consistent chapter model (headings, ordering, assignment), a working "Suggest from countries", merged transport actions, home base at trip creation, and route-render fixes (home bookend + always-fit).

**Architecture:** Keep changes additive and consistent with the existing ADRs. The load-bearing change is #7: a chapter's date band is recomputed from *the same membership definition used to render it* (ADR 0008 date-band membership, plus the ADR 0009/0021 explicit-`chapterId` anchor for freshly-firmed rough legs), so heading dates and on-screen contents can never diverge. Everything else is localized to one or two files each.

**Tech Stack:** Next.js (App Router, server actions), React, Prisma/Postgres, Zod, Vitest, Leaflet (summary map), SVG (cover render), Tailwind. Dates are `YYYY-MM-DD` UTC strings (`lib/dates.ts`).

## Global Constraints

- **Terminology (from `CONTEXT.md`) is binding in code and UI copy.** Use: Trip, Home base, Chapter, Stop (rough | scheduled | pinned), Transport, "thing to do" (never "Activity"), night(s). Avoid the listed synonyms.
- **`YYYY-MM-DD` UTC strings** for all calendar dates; compare with `<`/`>` or the helpers in `lib/dates.ts`. Never construct `Date` from a bare date string without the `T00:00:00Z` convention (`parseISODate`).
- **Server actions return `ActionResult`** (`lib/action-result.ts`): `{ success: true, ...payload } | { success: false, errors: FieldErrors }`. Extend the success branch via the generic; keep payload fields top-level.
- **Chapters cannot overlap** and membership for **scheduled** Stops is by **date band** (ADR 0008); explicit `chapterId` membership is for **rough** Stops (ADR 0009). Do not reverse this.
- **Concurrency:** stop/chapter mutations that renumber `sortOrder` use the `FOR UPDATE` locked-transaction pattern (ADR 0007). Reuse existing helpers; don't invent a new locking scheme.
- **Tests:** Vitest, `*.test.ts(x)` colocated with source. Run the full suite with `npm test`. Pure logic must be unit-tested; UI/DB-integration changes that can't be unit-tested get an explicit **browser verification** step (a human runs the app — these cannot be asserted in tests).
- **Commit after every task** with a conventional-commit message. Do **not** touch `main`, merge, or deploy.

---

### Task 1: Spell out night counts

**Files:**
- Modify: `lib/dates.ts` (add `formatNights`)
- Modify: `components/trip/stop-card.tsx` (rough badge ~line 428, scheduled badge ~line 612)
- Test: `lib/dates.test.ts` (add cases; create if absent)

**Interfaces:**
- Produces: `formatNights(nights: number, opts?: { rough?: boolean }): string`

- [ ] **Step 1: Write the failing test** — append to `lib/dates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatNights } from "./dates";

describe("formatNights", () => {
  it("pluralises correctly", () => {
    expect(formatNights(1)).toBe("1 night");
    expect(formatNights(3)).toBe("3 nights");
    expect(formatNights(0)).toBe("0 nights");
  });
  it("prefixes a tilde for rough estimates", () => {
    expect(formatNights(2, { rough: true })).toBe("~2 nights");
    expect(formatNights(1, { rough: true })).toBe("~1 night");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- lib/dates.test.ts` · Expected: FAIL (`formatNights` is not exported).

- [ ] **Step 3: Implement** — add to `lib/dates.ts`:

```ts
/**
 * Human night count: "1 night" / "3 nights"; rough estimates get a "~" prefix
 * ("~2 nights"). 0-night stays are shown as "Same-day visit" by the caller, not
 * here — this only formats a night total.
 */
export function formatNights(nights: number, opts?: { rough?: boolean }): string {
  const label = `${nights} ${nights === 1 ? "night" : "nights"}`;
  return opts?.rough ? `~${label}` : label;
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- lib/dates.test.ts` · Expected: PASS.

- [ ] **Step 5: Use it in the badges** — in `components/trip/stop-card.tsx`:
  - Import `formatNights` from `@/lib/dates`.
  - Rough badge (currently renders `~{stop.nights ?? 1}n`): replace the text with `{formatNights(stop.nights ?? 1, { rough: true })}`.
  - Scheduled badge (currently renders `{nights}n` inside `{nights > 0 && (…)}`): replace the text with `{formatNights(nights)}`. Leave the `nights > 0` guard and the existing "Same-day visit" branch untouched.
  - The pill has room; keep existing classes.

- [ ] **Step 6: Browser verification** — run the app, open a trip plan with a rough Stop and a scheduled multi-night Stop; confirm badges read "~2 nights" and "3 nights", a 1-night Stop reads "1 night", and a same-day Stop still reads "Same-day visit".

- [ ] **Step 7: Commit**

```bash
git add lib/dates.ts lib/dates.test.ts components/trip/stop-card.tsx
git commit -m "feat(plan): spell out night counts (\"3 nights\" not \"3n\")"
```

---

### Task 2: Chapter date band = the Stops actually shown in it (#7)

**Root cause:** `recomputeChapterSpans` (`server/actions/stops.ts`) computes a chapter's band from stops whose explicit `chapterId` matches, but the editor renders a *dated* Stop into a chapter by **date band** (`chapterForStop`, ADR 0008) — ignoring `chapterId`. So a Stop added *already-dated* into a chapter's range shows inside it but is excluded from the heading maths, and "Start a chapter here" on a dated Stop (which never sets `chapterId`) gets its band blanked on the next recompute.

**Fix:** recompute each chapter's band from the union of (a) dated Stops explicitly linked by `chapterId`, and (b) dated Stops with *no* `chapterId` whose arrive date falls in that chapter's current band. This mirrors how the chapter renders while still catching freshly-firmed rough legs.

**Files:**
- Modify: `lib/chapters.ts` (add `spanContributors`)
- Modify: `server/actions/stops.ts` (`recomputeChapterSpans`, ~lines 94–119)
- Test: `lib/chapters.test.ts` (create if absent)

**Interfaces:**
- Consumes: `chapterForDate`, `ChapterLike`, `chapterSpan` (from `lib/chapter-span.ts`).
- Produces: `spanContributors(chapter, stops, chapters): S[]` — the dated Stops that define a chapter's span.

- [ ] **Step 1: Write the failing test** — create/append `lib/chapters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { spanContributors, type ChapterLike, type StopLike } from "./chapters";

const ch = (id: string, startDate: string | null, endDate: string | null): ChapterLike =>
  ({ id, name: id, colour: "#000", startDate, endDate });

const stop = (id: string, arriveDate: string | null, departDate: string | null, chapterId: string | null, sortOrder = 0): StopLike =>
  ({ id, arriveDate, departDate, chapterId, sortOrder });

describe("spanContributors", () => {
  const italy = ch("italy", "2026-07-03", "2026-07-06");
  const alps = ch("alps", "2026-07-20", "2026-07-25");
  const chapters = [italy, alps];

  it("includes a dated stop explicitly linked by chapterId", () => {
    const rome = stop("rome", "2026-07-03", "2026-07-06", "italy");
    expect(spanContributors(italy, [rome], chapters).map((s) => s.id)).toEqual(["rome"]);
  });

  it("includes a directly-dated stop (no chapterId) that falls in the band", () => {
    const verona = stop("verona", "2026-07-04", "2026-07-08", null);
    expect(spanContributors(italy, [verona], chapters).map((s) => s.id)).toEqual(["verona"]);
  });

  it("does not double-count: a chapterId'd stop only contributes to its own chapter", () => {
    // chapterId=alps but date sits inside italy's band → contributes to alps only, never italy.
    const odd = stop("odd", "2026-07-04", "2026-07-05", "alps");
    expect(spanContributors(italy, [odd], chapters)).toEqual([]);
    expect(spanContributors(alps, [odd], chapters).map((s) => s.id)).toEqual(["odd"]);
  });

  it("ignores rough (undated) stops — they don't define a span", () => {
    const rough = stop("x", null, null, "italy");
    expect(spanContributors(italy, [rough], chapters)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- lib/chapters.test.ts` · Expected: FAIL (`spanContributors` not exported).

- [ ] **Step 3: Implement `spanContributors`** — add to `lib/chapters.ts` (uses the existing `chapterForDate`):

```ts
/**
 * The dated Stops that define a chapter's date band. A dated Stop contributes to
 * chapter C when it is explicitly linked (`chapterId === C.id`) OR — when it has
 * no explicit chapterId — its arrive date falls inside C's current band. The
 * `chapterId != null → only its own chapter` rule prevents a Stop from feeding
 * two bands (which could push bands into overlap). Mirrors how the editor renders
 * a chapter's contents (ADR 0008) while still catching a just-firmed rough leg
 * whose chapter has no band yet (ADR 0009/0021). Pure.
 */
export function spanContributors<C extends ChapterLike, S extends StopLike>(
  chapter: C,
  stops: readonly S[],
  chapters: readonly C[],
): S[] {
  return stops.filter((s) => {
    if (s.arriveDate == null || s.departDate == null) return false; // rough: no span
    if (s.chapterId != null) return s.chapterId === chapter.id;
    return chapterForDate(s.arriveDate, chapters)?.id === chapter.id;
  });
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- lib/chapters.test.ts` · Expected: PASS.

- [ ] **Step 5: Wire it into `recomputeChapterSpans`** — in `server/actions/stops.ts`, replace the body of `recomputeChapterSpans` (keep the signature and doc-comment, but update the comment to describe the union rule). Change the chapter `select` to include the band, snapshot the chapters *before* updating, and compute members via `spanContributors`:

```ts
export async function recomputeChapterSpans(
  tx: Prisma.TransactionClient,
  tripId: string,
  forkId: PlanId,
): Promise<void> {
  const [chapters, stops] = await Promise.all([
    tx.chapter.findMany({
      where: { tripId, ...planScope(forkId) },
      select: { id: true, startDate: true, endDate: true },
    }),
    tx.stop.findMany({
      where: { tripId, ...planScope(forkId) },
      select: { id: true, chapterId: true, arriveDate: true, departDate: true, sortOrder: true },
    }),
  ]);

  // Snapshot bands so date-band membership is evaluated against the pre-update
  // state, not chapters we've already rewritten in this loop.
  const snapshot = chapters.map((c) => ({
    id: c.id, name: "", colour: "", startDate: c.startDate, endDate: c.endDate,
  }));

  for (const chapter of snapshot) {
    const members = spanContributors(chapter, stops, snapshot);
    const { startDate, endDate } = chapterSpan(members);
    await tx.chapter.update({ where: { id: chapter.id }, data: { startDate, endDate } });
  }
}
```

Add `spanContributors` to the existing `import … from "@/lib/chapters"` in this file (or add the import if none). `chapterSpan` is already imported.

- [ ] **Step 6: Run the full suite** — Run: `npm test` · Expected: PASS (no regressions in existing chapter/firm-up tests).

- [ ] **Step 7: Browser verification** — In a trip: (a) create a chapter via "Start a chapter here" on a **dated** Stop, then edit another Stop → the chapter keeps its dates (does not revert to "rough"). (b) Add a new **already-dated** Stop whose dates land inside an existing chapter → it appears in the chapter AND the heading date range widens to include it. (c) Firm up a rough chapter → its heading shows the dated span, chapter not stranded.

- [ ] **Step 8: Commit**

```bash
git add lib/chapters.ts lib/chapters.test.ts server/actions/stops.ts
git commit -m "fix(chapters): recompute band from rendered membership so headings match contents"
```

---

### Task 3: Order Stops within a chapter by a single `sortOrder` list (#3)

**Files:**
- Modify: `lib/chapters.ts` (`sortGroupStops`, ~lines 103–111)
- Test: `lib/chapters.test.ts`

**Interfaces:**
- Produces: `sortGroupStops(stops): S[]` — now a single stable sort by `sortOrder`.

- [ ] **Step 1: Write the failing test** — append to `lib/chapters.test.ts`:

```ts
import { sortGroupStops } from "./chapters";

describe("sortGroupStops", () => {
  it("orders by sortOrder, interleaving rough and dated (no dated-first hoist)", () => {
    const rome = stop("rome", "2026-07-03", "2026-07-06", null, 0);
    const florence = stop("florence", null, null, "italy", 1); // rough, placed mid-chapter
    const venice = stop("venice", "2026-07-08", "2026-07-10", null, 2);
    const out = sortGroupStops([venice, florence, rome]);
    expect(out.map((s) => s.id)).toEqual(["rome", "florence", "venice"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- lib/chapters.test.ts` · Expected: FAIL (current impl returns `[rome, venice, florence]` — rough sunk to the bottom).

- [ ] **Step 3: Implement** — replace `sortGroupStops` in `lib/chapters.ts`:

```ts
/**
 * Order stops within a rendered chapter group as a single list by `sortOrder`
 * (the arrangement spine). For dated stops sortOrder already tracks date order —
 * firm-up flows dates forward in sortOrder and drag-reorder reflows dates to the
 * new position (ADR 0021) — so this yields chronological order for dated stops
 * while letting rough stops hold the position the traveller put them in. Pure;
 * stable via the id tiebreak. Supersedes the old dated-first / rough-after split.
 */
export function sortGroupStops<S extends StopLike & { id: string }>(stops: readonly S[]): S[] {
  return [...stops].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- lib/chapters.test.ts` · Expected: PASS. Then `npm test` — Expected: PASS (update any existing `sortGroupStops` test that asserted the old dated-first ordering; the new contract is sortOrder order).

- [ ] **Step 5: Browser verification** — In a chapter with a rough Stop placed between two dated Stops, confirm it renders in the middle (not pushed to the bottom), and dated Stops read in date order.

- [ ] **Step 6: Commit**

```bash
git add lib/chapters.ts lib/chapters.test.ts
git commit -m "fix(chapters): order stops within a chapter by sortOrder, no dated-first hoist"
```

---

### Task 4: Assign a rough Stop to a chapter (#2)

**Files:**
- Modify: `server/actions/chapters.ts` (add `assignStopToChapter`)
- Modify: `components/trip/stop-card.tsx` (overflow menu; new `onAssignToChapter` prop + dated disabled item)
- Modify: `components/trip/itinerary-manager.tsx` (wire callback + chapter-picker dialog)
- Modify: the CardAction menu component if it lacks a `hint` field (see Step 4)
- Test: `server/actions/chapters.assign.test.ts` (pure guard test — see Step 1) OR extend an existing chapters test

**Interfaces:**
- Consumes: `requireTripAccess`, `db`, `revalidateChapterPaths`, `planScope` (all already in `server/actions/chapters.ts`).
- Produces: `assignStopToChapter(stopId: string, chapterId: string | null): Promise<ChapterActionResult>` — sets a **rough** Stop's `chapterId` (null = Ungrouped); rejects a dated Stop.

- [ ] **Step 1: Write the failing test** — create `server/actions/chapters.assign.test.ts`. Keep it to the pure guard logic by extracting a helper (avoids DB in unit tests):

Add to `server/actions/chapters.ts`:

```ts
/** A dated Stop's chapter follows its dates (ADR 0008); only rough Stops can be explicitly assigned. */
export function canAssignToChapter(stop: { arriveDate: string | null }): boolean {
  return stop.arriveDate == null;
}
```

Test:

```ts
import { describe, it, expect } from "vitest";
import { canAssignToChapter } from "./chapters";

describe("canAssignToChapter", () => {
  it("allows rough stops", () => expect(canAssignToChapter({ arriveDate: null })).toBe(true));
  it("blocks dated stops", () => expect(canAssignToChapter({ arriveDate: "2026-07-03" })).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- server/actions/chapters.assign.test.ts` · Expected: FAIL (`canAssignToChapter` not exported).

- [ ] **Step 3: Implement the action** — add to `server/actions/chapters.ts` (after `createChapter`):

```ts
export async function assignStopToChapter(
  stopId: string,
  chapterId: string | null,
): Promise<ChapterActionResult> {
  const stop = await db.stop.findUnique({
    where: { id: stopId },
    select: { id: true, tripId: true, forkId: true, arriveDate: true, chapterId: true },
  });
  if (!stop) notFound();
  await requireTripAccess(stop.tripId);

  if (!canAssignToChapter(stop)) {
    return { success: false, errors: { _: ["A dated stop's chapter follows its dates — drag or re-date it to move."] } };
  }

  if (chapterId) {
    const chapter = await db.chapter.findUnique({ where: { id: chapterId }, select: { tripId: true, forkId: true } });
    if (!chapter || chapter.tripId !== stop.tripId || chapter.forkId !== stop.forkId) {
      return { success: false, errors: { chapterId: ["Chapter does not belong to this plan"] } };
    }
  }

  // Append to the end of the target chapter's rough order.
  const siblings = await db.stop.findMany({
    where: { tripId: stop.tripId, forkId: stop.forkId, chapterId },
    select: { chapterSortOrder: true },
  });
  const nextOrder = siblings.reduce((max, s) => Math.max(max, (s.chapterSortOrder ?? 0) + 1), 0);

  await db.stop.update({ where: { id: stopId }, data: { chapterId, chapterSortOrder: nextOrder } });
  revalidateChapterPaths(stop.tripId);
  return { success: true };
}
```

- [ ] **Step 4: Run guard test** — Run: `npm test -- server/actions/chapters.assign.test.ts` · Expected: PASS.

- [ ] **Step 5: Stop-card overflow item** — in `components/trip/stop-card.tsx`:
  - Add an optional prop `onAssignToChapter?: (stop: StopCardStop) => void` (match the existing `onStartChapter` prop's type for `stop`).
  - If the `CardActionItem` type has no `hint?: string` field, add one and render it as muted subtext (or a native `title`) in the menu-item component (find the component that renders `CardActionItem`, e.g. a `CardActionMenu`).
  - Add to `overflowItems`:

```tsx
if (onAssignToChapter) {
  overflowItems.push(
    isRough
      ? {
          key: "assign-chapter",
          label: "Assign to chapter",
          icon: <BookOpen className="size-4" aria-hidden="true" />,
          onSelect: () => onAssignToChapter(stop),
          disabled: isPending,
        }
      : {
          key: "assign-chapter",
          label: "Assign to chapter",
          icon: <BookOpen className="size-4" aria-hidden="true" />,
          onSelect: () => {},
          disabled: true,
          hint: "Grouped by its dates — drag or re-date to move",
        },
  );
}
```

- [ ] **Step 6: Chapter-picker in itinerary-manager** — in `components/trip/itinerary-manager.tsx`:
  - Import `assignStopToChapter`.
  - Add state: `const [assigningStop, setAssigningStop] = React.useState<StopCardStop | null>(null);`
  - Pass `onAssignToChapter={(s) => setAssigningStop(s)}` to each `StopCard`.
  - Render a dialog (reuse the app's `Dialog` primitive, as used elsewhere in this file) listing the trip's chapters as buttons plus a "Remove from chapter (Ungrouped)" option. On select, call the action inside the existing pending/transition pattern and update local state:

```tsx
{assigningStop && (
  <Dialog open onOpenChange={(o) => !o && setAssigningStop(null)}>
    <DialogContent>
      <DialogHeader><DialogTitle>Assign “{assigningStop.name}” to a chapter</DialogTitle></DialogHeader>
      <div className="flex flex-col gap-2">
        {localChapters.map((c) => (
          <Button key={c.id} variant="ghost" className="justify-start"
            onClick={() => handleAssign(assigningStop.id, c.id)}>{c.name}</Button>
        ))}
        <Button variant="ghost" className="justify-start text-muted-foreground"
          onClick={() => handleAssign(assigningStop.id, null)}>Remove from chapter</Button>
      </div>
    </DialogContent>
  </Dialog>
)}
```

  - `handleAssign(stopId, chapterId)`: optimistically update `localStops` (`chapterId` field), close the dialog, then `await assignStopToChapter(stopId, chapterId)`; on failure show the error toast and revert. Mirror the existing optimistic patterns in this file (e.g. the drag handler that sets `chapterId`).

- [ ] **Step 7: Browser verification** — On a rough Stop, open ⋯ → "Assign to chapter" → pick a chapter; the Stop moves into it (and to "Ungrouped" via Remove). On a dated Stop, the item is present but disabled with the hint. Works on a narrow (mobile) viewport without dragging.

- [ ] **Step 8: Commit**

```bash
git add server/actions/chapters.ts server/actions/chapters.assign.test.ts components/trip/stop-card.tsx components/trip/itinerary-manager.tsx components/trip/*card-action*
git commit -m "feat(chapters): assign a rough stop to a chapter from the menu (drag alternative)"
```

---

### Task 5: Derive country for rough Stops (#5 prerequisite)

Rough Stops are never geocoded, so they carry no `country`/`countryCode` and can't be grouped. Geocode them on save like scheduled Stops (best-effort; a failure just leaves coords null).

**Files:**
- Modify: `server/actions/stops.ts` (rough branches of `createStop` insert path ~line 227, append path ~line 399; rough branch of `updateStop` ~line 399/404)
- Test: covered by browser verification + existing geocode tests (geocoding is a network call, mocked elsewhere; no new unit test required)

- [ ] **Step 1: Locate the rough create branches** — in `server/actions/stops.ts`, find every place a rough Stop is created/updated (`mode === "rough"`) that currently writes `country: country ?? null` without a `countryCode`. There are three: insert-path rough create, append-path rough create, and rough `updateStop`.

- [ ] **Step 2: Geocode rough Stops** — for each rough branch, before the DB write, best-effort geocode `name` (+ typed `country` if present) and set `countryCode` (and `lat`/`lng` when available), exactly mirroring the scheduled branch. Pattern (network call must be **outside** any `FOR UPDATE` transaction — geocode first, then write):

```ts
// rough create/update: derive country like scheduled stops do
let derivedCountryCode: string | null = null;
let roughLat: number | undefined;
let roughLng: number | undefined;
const coords = await geocodePlaceDetailed([name, country].filter(Boolean).join(", "));
if (coords) {
  roughLat = coords.lat;
  roughLng = coords.lng;
  derivedCountryCode = coords.countryCode ?? null;
}
// …then in the stop create/update data:
//   country: country ?? null,
//   countryCode: derivedCountryCode,
//   ...(roughLat !== undefined ? { lat: roughLat, lng: roughLng } : {}),
```

`geocodePlaceDetailed` is already imported in this file. Keep the insert-path pattern of geocoding *before* opening the locked transaction.

- [ ] **Step 3: Run the suite** — Run: `npm test` · Expected: PASS (existing stop tests still green; ensure any geocode mock covers the rough path).

- [ ] **Step 4: Browser verification** — Add a rough Stop named "Kyoto"; confirm (via the map/cover once located, or DB) it now resolves a `countryCode`. A gibberish name still saves (coords null), no error.

- [ ] **Step 5: Commit**

```bash
git add server/actions/stops.ts
git commit -m "feat(stops): geocode rough stops so they carry a derived country"
```

---

### Task 6: "Suggest from countries" groups by derived country with real names (#5)

**Files:**
- Create: `lib/countries.ts` (`countryName`)
- Modify: `lib/chapter-suggest.ts` (`SuggestStop`, `countryRuns` → key by `countryCode`; name via `countryName`)
- Modify: `server/actions/chapters.ts` (`suggestChaptersFromCountries` — select `countryCode`)
- Test: `lib/countries.test.ts`, update `lib/chapter-suggest.test.ts`

**Interfaces:**
- Produces: `countryName(code: string | null | undefined): string` — display name for an ISO-3166 alpha-2 code (case-insensitive), or `""` for nullish, or the upper-cased code if `Intl` can't resolve it.
- Changed: `SuggestStop` now carries `countryCode: string | null` (replacing `country` as the grouping key); `CountryRun.country` holds the **display name**.

- [ ] **Step 1: Write the failing test** — create `lib/countries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { countryName } from "./countries";

describe("countryName", () => {
  it("maps alpha-2 codes (any case) to names", () => {
    expect(countryName("it")).toBe("Italy");
    expect(countryName("FR")).toBe("France");
  });
  it("is empty for nullish and falls back to the code when unresolvable", () => {
    expect(countryName(null)).toBe("");
    expect(countryName("")).toBe("");
    expect(countryName("zz")).toBe("ZZ");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- lib/countries.test.ts` · Expected: FAIL (module missing).

- [ ] **Step 3: Implement `countryName`** — create `lib/countries.ts`:

```ts
// Node/Next provide Intl.DisplayNames; construct once.
const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

/** Display name for an ISO 3166-1 alpha-2 country code (case-insensitive). */
export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  const upper = code.toUpperCase();
  try {
    return REGION_NAMES.of(upper) ?? upper;
  } catch {
    return upper;
  }
}
```

- [ ] **Step 4: Run test** — Run: `npm test -- lib/countries.test.ts` · Expected: PASS.

- [ ] **Step 5: Re-key the suggester** — in `lib/chapter-suggest.ts`:
  - Change `SuggestStop` to `{ name: string; arriveDate: string | null; departDate: string | null; countryCode: string | null }`.
  - In `countryRuns`, group by `stop.countryCode?.trim() || null` instead of `stop.country`; when opening a run, set the run's `country` (the display label) to `countryName(countryCode)` and keep `anchorCity: stop.name`. All downstream naming (`combineName`, `standalone`) already reads `run.country`, so passing the display name through keeps names correct.
  - Update `lib/chapter-suggest.test.ts` fixtures to supply `countryCode` (e.g. `"it"`, `"fr"`, `"de"`) instead of `country`, and assert names come out as "Italy"/"France"/"Germany"/"Germany & France".

- [ ] **Step 6: Feed `countryCode` from the action** — in `server/actions/chapters.ts` `suggestChaptersFromCountries`, change the stop `select` to include `countryCode: true` and pass stops as `{ name, arriveDate, departDate, countryCode }` into `suggestChapters`. (Remove the now-unused `country` select if nothing else uses it there.)

- [ ] **Step 7: Run the suite** — Run: `npm test` · Expected: PASS (chapter-suggest tests updated and green).

- [ ] **Step 8: Browser verification** — On a trip with **dated** Stops that have resolved countries (e.g. Rome, Florence, Paris), Settings → Chapters → "Suggest from countries" creates "Italy" and "France" chapters with correct date bands.

- [ ] **Step 9: Commit**

```bash
git add lib/countries.ts lib/countries.test.ts lib/chapter-suggest.ts lib/chapter-suggest.test.ts server/actions/chapters.ts
git commit -m "fix(chapters): suggest by derived country code with real country names"
```

---

### Task 7: "Suggest from countries" works while sketching → rough chapters (#5)

Group consecutive same-country **rough** Stops (by `sortOrder`) into **rough** chapters (no dates) with explicit `chapterId` membership (ADR 0009).

**Files:**
- Modify: `lib/chapter-suggest.ts` (add pure `suggestRoughChapters`)
- Modify: `server/actions/chapters.ts` (`suggestChaptersFromCountries` — also create rough chapters + link rough stops)
- Test: `lib/chapter-suggest.test.ts`

**Interfaces:**
- Produces: `suggestRoughChapters(stops: { id: string; countryCode: string | null; chapterId: string | null; sortOrder: number }[]): { name: string; stopIds: string[] }[]` — ordered rough-chapter proposals over **unchaptered rough** Stops.

- [ ] **Step 1: Write the failing test** — append to `lib/chapter-suggest.test.ts`:

```ts
import { suggestRoughChapters } from "./chapter-suggest";

describe("suggestRoughChapters", () => {
  const s = (id: string, countryCode: string | null, sortOrder: number, chapterId: string | null = null) =>
    ({ id, countryCode, chapterId, sortOrder });

  it("groups consecutive same-country rough stops in sortOrder", () => {
    const out = suggestRoughChapters([
      s("rome", "it", 0), s("florence", "it", 1), s("paris", "fr", 2), s("lyon", "fr", 3),
    ]);
    expect(out).toEqual([
      { name: "Italy", stopIds: ["rome", "florence"] },
      { name: "France", stopIds: ["paris", "lyon"] },
    ]);
  });

  it("skips stops already in a chapter and country-less stops (which break a run)", () => {
    const out = suggestRoughChapters([
      s("a", "it", 0, "existing"), s("b", null, 1), s("c", "it", 2),
    ]);
    expect(out).toEqual([{ name: "Italy", stopIds: ["c"] }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- lib/chapter-suggest.test.ts` · Expected: FAIL (`suggestRoughChapters` not exported).

- [ ] **Step 3: Implement** — add to `lib/chapter-suggest.ts`:

```ts
export interface RoughSuggestStop {
  id: string;
  countryCode: string | null;
  chapterId: string | null;
  sortOrder: number;
}

/**
 * Propose rough (date-less) chapters over the unchaptered rough Stops: maximal
 * runs of consecutive same-country Stops in sortOrder, named by country. Stops
 * already in a chapter, or with no resolvable country, break the current run and
 * are left Ungrouped. Single-Stop runs are kept (a lone country is still a leg).
 */
export function suggestRoughChapters(
  stops: readonly RoughSuggestStop[],
): { name: string; stopIds: string[] }[] {
  const ordered = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const out: { name: string; stopIds: string[] }[] = [];
  let currentCode: string | null = null;
  for (const s of ordered) {
    const code = s.chapterId == null ? (s.countryCode?.trim() || null) : null;
    if (code && code === currentCode) {
      out[out.length - 1].stopIds.push(s.id);
    } else if (code) {
      out.push({ name: countryName(code), stopIds: [s.id] });
      currentCode = code;
    } else {
      currentCode = null; // country-less or already-chaptered stop breaks the run
    }
  }
  return out;
}
```

Add `import { countryName } from "./countries";` at the top of `lib/chapter-suggest.ts`.

- [ ] **Step 4: Run test** — Run: `npm test -- lib/chapter-suggest.test.ts` · Expected: PASS.

- [ ] **Step 5: Wire rough chapters into the action** — in `server/actions/chapters.ts` `suggestChaptersFromCountries`, after the existing dated-chapter creation, also handle rough Stops. Broaden the stop `select` to include `id, chapterId, sortOrder, countryCode` (already need `countryCode` from Task 6). Compute `const roughProposals = suggestRoughChapters(stops.filter(s => s.arriveDate == null));`, then for each proposal create a rough chapter (`startDate: null, endDate: null`, next colour, next `sortOrder`) and update its member Stops' `chapterId` + `chapterSortOrder`. Wrap chapter+stop writes in a `db.$transaction`. Extend the returned count (see Task 8) to include rough chapters created. Import `suggestRoughChapters`.

```ts
// after dated `data` is created …
let roughCreated = 0;
const roughProposals = suggestRoughChapters(
  stops.filter((s) => s.arriveDate == null)
       .map((s) => ({ id: s.id, countryCode: s.countryCode, chapterId: s.chapterId, sortOrder: s.sortOrder })),
);
if (roughProposals.length > 0) {
  await db.$transaction(async (tx) => {
    let order = existing.length + data.length;
    for (const p of roughProposals) {
      const colour = nextChapterColour([...usedColours, ...data.map((d) => d.colour)]);
      usedColours.push(colour);
      const chapter = await tx.chapter.create({
        data: { tripId, forkId: null, name: p.name, colour, startDate: null, endDate: null, sortOrder: order++ },
      });
      await Promise.all(p.stopIds.map((id, i) =>
        tx.stop.update({ where: { id }, data: { chapterId: chapter.id, chapterSortOrder: i } })));
      roughCreated++;
    }
  });
}
```

(Adjust `usedColours` to be a mutable `let`/array in scope; it currently derives from `existing` — make it an array you can push to.)

- [ ] **Step 6: Run the suite** — Run: `npm test` · Expected: PASS.

- [ ] **Step 7: Browser verification** — On a **sketch** (rough Stops with resolved countries, no dates), run "Suggest from countries": rough chapters appear grouping the Stops by country, in order, with the Stops nested under them.

- [ ] **Step 8: Commit**

```bash
git add lib/chapter-suggest.ts lib/chapter-suggest.test.ts server/actions/chapters.ts
git commit -m "feat(chapters): suggest rough chapters from rough stops while sketching"
```

---

### Task 8: "Suggest from countries" — feedback + plan-page button (#5)

**Files:**
- Modify: `server/actions/chapters.ts` (`suggestChaptersFromCountries` returns a count)
- Modify: `components/trip/chapters-manager.tsx` (toast the outcome)
- Modify: `components/trip/itinerary-manager.tsx` (add the button on the plan page)

**Interfaces:**
- Changed: `suggestChaptersFromCountries(tripId): Promise<ActionResult<{ created: number }>>` — `created` = dated + rough chapters created this run.

- [ ] **Step 1: Return a count** — in `suggestChaptersFromCountries`, track `const created = data.length + roughCreated;` and `return { success: true, created };`. When `created === 0`, still return success with `created: 0` (no throw).

- [ ] **Step 2: Toast in chapters-manager** — in `components/trip/chapters-manager.tsx` `handleSuggest`, after `const result = await suggestChaptersFromCountries(tripId);`:

```ts
if (!result.success) {
  toast({ variant: "destructive", title: "Couldn’t suggest chapters", description: result.errors._?.[0] ?? "Something went wrong." });
} else if (result.created === 0) {
  toast({ title: "Nothing to group", description: "Add stops with a resolvable country (or dates) first — anything already grouped is left alone." });
} else {
  toast({ title: `Created ${result.created} ${result.created === 1 ? "chapter" : "chapters"}`, description: "Rename or redraw them any time." });
}
```

Use the app's existing toast hook (match how other actions in this file/component surface success/error). If `chapters-manager` doesn't already import a toast helper, use the same one `itinerary-manager` uses.

- [ ] **Step 3: Plan-page button** — in `components/trip/itinerary-manager.tsx`, next to the existing "New Chapter" button (~line 1868), add a "Suggest from countries" button (icon `Wand2` from `lucide-react`) that calls `suggestChaptersFromCountries(tripId)` inside the existing transition/pending pattern and shows the same three-way toast as Step 2. Reuse a shared handler if practical.

- [ ] **Step 4: Run the suite** — Run: `npm test` · Expected: PASS.

- [ ] **Step 5: Browser verification** — Click "Suggest from countries" from BOTH Settings → Chapters and the plan page: with groupable Stops → "Created N chapters" toast + chapters appear; with none → "Nothing to group" toast (button no longer feels dead).

- [ ] **Step 6: Commit**

```bash
git add server/actions/chapters.ts components/trip/chapters-manager.tsx components/trip/itinerary-manager.tsx
git commit -m "feat(chapters): feedback toast for suggest-from-countries + surface it on the plan page"
```

---

### Task 9: Merge the two transport buttons into one context-aware action (#6)

**Files:**
- Modify: `components/trip/itinerary-manager.tsx` (transport buttons ~lines 1394–1426)
- Test: browser verification (UI wiring; no pure logic to unit-test)

- [ ] **Step 1: Read the current region** — in `components/trip/itinerary-manager.tsx`, locate the two adjacent buttons: "Add transport here" (sets `{ anchorStopId: stop.id }`) and "Add Transport to {nextStop.name}" (sets `{ fromStopId, toStopId, anchorStopId }`, rendered only when `!isLast`).

- [ ] **Step 2: Replace with one button per slot** — render a single "＋ Add transport" per Stop slot whose defaults depend on whether there is a next Stop:

```tsx
<div className="flex justify-center">
  <Button
    variant="ghost"
    size="sm"
    className="h-8 text-xs text-muted-foreground hover:text-foreground"
    onClick={() =>
      setAddTransportDefaults(
        !isLast && nextStop
          ? { fromStopId: stop.id, toStopId: nextStop.id, anchorStopId: stop.id }
          : { fromStopId: stop.id, anchorStopId: stop.id },
      )
    }
  >
    <Plus className="size-3.5" aria-hidden="true" />
    Add transport
  </Button>
</div>
```

  - Delete the separate "Add transport here" button. The single button pre-fills the obvious connection (this Stop → next Stop) when there is one, otherwise pre-fills the from-Stop with an open arrival. All endpoints remain editable in the transport form (unchanged), so between-legs / non-Stop / second-leg cases are reached by editing endpoints.
  - Leave the **Home base** bookend buttons (`home-base-card.tsx`: "Add transport to {firstStop}" / "Add transport home to {homeBase}") untouched — they are separate outbound/return affordances.

- [ ] **Step 3: Run the suite** — Run: `npm test` · Expected: PASS (fix any test asserting the old "Add transport here" label).

- [ ] **Step 4: Browser verification** — Each point in the itinerary shows exactly one "Add transport" entry. Between two Stops it opens pre-filled A→B; at the last Stop it opens from-last with an open arrival; you can still create a between-legs leg by editing an endpoint. Home bookend buttons still present and working.

- [ ] **Step 5: Commit**

```bash
git add components/trip/itinerary-manager.tsx
git commit -m "feat(plan): merge transport actions into one context-aware Add transport button"
```

---

### Task 10: Home base at trip creation (#1)

**Files:**
- Modify: `app/(app)/trips/new/new-trip-form.tsx` (add Home base field + include in input)
- Modify: `server/actions/trips.ts` (`createTrip` — persist + geocode `homeName`, honour `roundTrip`)
- Test: browser verification (geocoding is a mocked network call; schema already validated)

- [ ] **Step 1: Form field** — in `new-trip-form.tsx`, add an optional Home base field after the currency field (mirror `trip-details-form.tsx`):

```tsx
<Field
  label="Home base (optional)"
  error={fieldError("homeName")}
  description="Where this trip departs from and returns to. Leave blank to add later."
>
  <Input name="homeName" placeholder="e.g. Sydney" disabled={isPending} />
</Field>
```

  Include it in the submitted `input` (only when non-empty):

```ts
const homeName = (data.get("homeName") as string)?.trim() || undefined;
const input = {
  name: data.get("name") as string,
  homeCurrency: data.get("homeCurrency") as string,
  ...(startDate ? { startDate } : {}),
  ...(endDate ? { endDate } : {}),
  ...(homeName ? { homeName } : {}),
};
```

  `roundTrip` defaults to `true` server-side; no toggle needed at creation.

- [ ] **Step 2: Persist + geocode in `createTrip`** — in `server/actions/trips.ts`, destructure `homeName` and `roundTrip` from `parsed.data`, geocode `homeName` when present (best-effort, before the transaction), and write the home fields on `tx.trip.create`:

```ts
const { name, startDate, endDate, homeCurrency, homeName: rawHomeName, roundTrip } = parsed.data;

let homeFields: { homeName: string; homeLat: number | null; homeLng: number | null; homeCountryCode: string | null } | null = null;
const trimmedHome = rawHomeName?.trim();
if (trimmedHome) {
  const geo = await geocodePlaceDetailed(trimmedHome);
  homeFields = {
    homeName: trimmedHome,
    homeLat: geo?.lat ?? null,
    homeLng: geo?.lng ?? null,
    homeCountryCode: geo?.countryCode ?? null,
  };
}
// …in tx.trip.create data:
//   ...(homeFields ?? {}),
//   ...(roundTrip !== undefined ? { roundTrip } : {}),
```

  Import `geocodePlaceDetailed` if not already imported in this file (it's used by `updateTrip`, so the import likely exists).

- [ ] **Step 3: Run the suite** — Run: `npm test` · Expected: PASS.

- [ ] **Step 4: Browser verification** — Create a trip with Home base "Sydney": the plan editor shows the home bookend from first render (outbound prompt above the first Stop). Create a trip with a blank Home base: no bookend, no error. Confirm it's still editable in Settings.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/trips/new/new-trip-form.tsx" server/actions/trips.ts
git commit -m "feat(trips): capture an optional home base at trip creation"
```

---

### Task 11: Route render — home bookend + always fits its box (#8, #9)

**Files:**
- Modify: `lib/route-render.ts` (`projectStops` gains an optional home point; add `buildRoutePath`)
- Modify: `components/trip/trip-cover.tsx` (`RouteRender`: draw home node + bookend legs; switch `slice`→`meet`)
- Modify: `app/(app)/trips/[tripId]/page.tsx` and `components/trip/trip-card.tsx` (pass home point + roundTrip into `TripCover`)
- Modify: `app/share/[token]/page.tsx` (pass `home` + `showReturn` to `RouteMap`)
- Test: `lib/route-render.test.ts`

**Interfaces:**
- Changed: `TripCover` gains `home?: LatLng | null` and `roundTrip?: boolean`. `RouteRender` plots `[home?, ...stops, home?(if roundTrip)]`.
- Produces (optional helper): `orderedRoutePoints(stops: LatLng[], home: LatLng | null, roundTrip: boolean): LatLng[]`.

- [ ] **Step 1: Write the failing test** — append to `lib/route-render.test.ts`:

```ts
import { orderedRoutePoints } from "./route-render";

describe("orderedRoutePoints", () => {
  const home = { lat: -33.87, lng: 151.21 };
  const a = { lat: 48.85, lng: 2.35 };
  const b = { lat: 41.9, lng: 12.5 };

  it("bookends with home at start, and end too on a round trip", () => {
    expect(orderedRoutePoints([a, b], home, true)).toEqual([home, a, b, home]);
  });
  it("one-way trip gets home only at the start", () => {
    expect(orderedRoutePoints([a, b], home, false)).toEqual([home, a, b]);
  });
  it("no home → stops unchanged", () => {
    expect(orderedRoutePoints([a, b], null, true)).toEqual([a, b]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- lib/route-render.test.ts` · Expected: FAIL (`orderedRoutePoints` missing).

- [ ] **Step 3: Implement `orderedRoutePoints`** — add to `lib/route-render.ts` (keep `projectStops` as-is; it already projects any `LatLng[]` into the viewbox):

```ts
/**
 * Ordered points for the cover route path: home base bookends the itinerary —
 * always at the start, and at the end too on a round trip (mirrors the Summary
 * map, ADR 0032). No home base → the stops unchanged.
 */
export function orderedRoutePoints(
  stops: LatLng[],
  home: LatLng | null,
  roundTrip: boolean,
): LatLng[] {
  if (!home) return stops;
  return roundTrip ? [home, ...stops, home] : [home, ...stops];
}
```

- [ ] **Step 4: Run test** — Run: `npm test -- lib/route-render.test.ts` · Expected: PASS.

- [ ] **Step 5: Update `RouteRender` / `TripCover`** — in `components/trip/trip-cover.tsx`:
  - Add `home?: LatLng | null` and `roundTrip?: boolean` to `TripCoverProps`; thread them into `RouteRender`.
  - In `RouteRender`, compute `const pts = projectStops(orderedRoutePoints(stops, home ?? null, roundTrip ?? false), VIEW_W, VIEW_H, PAD);`. Render the home node distinctly (first point, and last when it equals home) — e.g. a slightly larger ringed circle — while intermediate Stops stay plain dots. Keep `stops.length > 0` as the condition to use `RouteRender` (a home-only trip with zero located Stops still falls through to the monogram).
  - **Fit fix:** change `preserveAspectRatio="xMidYMid slice"` → `"xMidYMid meet"` so the whole route always fits inside the box regardless of container aspect ratio. The `bg-secondary` on the `<svg>` fills the letterbox area, so it still reads as a filled cover. Keep `PAD` so pins never touch the edge.

- [ ] **Step 6: Pass home into the two cover call sites:**
  - `app/(app)/trips/[tripId]/page.tsx` (Home hero, ~line 37): pass `home={trip.homeLat != null && trip.homeLng != null ? { lat: trip.homeLat, lng: trip.homeLng } : null}` and `roundTrip={trip.roundTrip ?? false}`. Ensure the trip query selects `homeLat`, `homeLng`, `roundTrip`.
  - `components/trip/trip-card.tsx` (~line 94): same, using the card's trip fields (add `homeLat`/`homeLng`/`roundTrip` to whatever query feeds the trips list, `app/(app)/trips/page.tsx`).

- [ ] **Step 7: Wire the share-page map** — in `app/share/[token]/page.tsx` (~line 270), change `<RouteMap stops={mapStops} height={340} />` to also pass `home={homeMapPoint(trip)}` and `showReturn={trip.roundTrip ?? false}` (import `homeMapPoint` from `@/lib/route-map`; ensure the share query selects `homeName`, `homeLat`, `homeLng`, `roundTrip`). Matches the private Summary (`summary/page.tsx:501`).

- [ ] **Step 8: Summary regression test / check** — the Summary map already passes `home`/`showReturn`; add or confirm a light assertion (or browser check) that it still renders the home marker. No code change expected there.

- [ ] **Step 9: Run the suite** — Run: `npm test` · Expected: PASS.

- [ ] **Step 10: Browser verification (critical — visual):** With a home base set, on **desktop** confirm: (a) the trips-list card and the trip Home hero route render **starts at home and ends at home** (round trip) / starts at home (one-way), with a distinct home node; (b) the whole route — including the home node — is **fully visible, never cropped** at the wide/short hero and card aspect ratios; (c) the share page map shows the home bookend like the Summary.

- [ ] **Step 11: Commit**

```bash
git add lib/route-render.ts lib/route-render.test.ts components/trip/trip-cover.tsx "app/(app)/trips/[tripId]/page.tsx" components/trip/trip-card.tsx "app/(app)/trips/page.tsx" "app/share/[token]/page.tsx"
git commit -m "feat(cover): bookend route render at home base and always fit it in the box"
```

---

### Task 12: ADR amendments & docs

**Files:**
- Create: `docs/adr/0035-chapter-band-from-rendered-membership.md`
- Create: `docs/adr/0036-suggester-country-code-and-rough-chapters.md`
- Modify: `CONTEXT.md` only if a term's definition changed (it should not — verify)

- [ ] **Step 1: ADR 0035** — record the Task 2 decision: a chapter's date band is recomputed from the union of explicit-`chapterId` dated members and no-`chapterId` dated members covered by the current band, so heading dates equal on-screen contents; amends ADR 0021 (self-healing bands) and reconciles it with ADR 0008/0009. Note the `chapterId != null → single chapter` guard that prevents band overlap. Use the repo's ADR format (Context / Decision / Consequences).

- [ ] **Step 2: ADR 0036** — record: the country auto-suggester keys off the derived `countryCode` (not free-text `country`), names chapters via `Intl.DisplayNames`, and now also proposes **rough** chapters from rough Stops during sketching (requires rough-Stop country derivation, Task 5). Amends ADR 0034/0009. Note it stays suggester-only and every chapter remains renamable/redrawable.

- [ ] **Step 3: Verify `CONTEXT.md`** — skim the glossary; these changes align code to existing definitions (Chapter "date range tracks its Stops"; night(s); Home base). If nothing changed, leave it. If a term drifted, update just that entry.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0035-chapter-band-from-rendered-membership.md docs/adr/0036-suggester-country-code-and-rough-chapters.md CONTEXT.md
git commit -m "docs(adr): record chapter-band membership and suggester country-code/rough-chapter decisions"
```

---

## Self-Review

**Spec coverage:**
- #1 Home base at creation → Task 10. ✓
- #2 Chapter heading dates → Task 2. ✓
- #3 Ordering within chapter → Task 3. ✓
- #4 Assign to chapter → Task 4. ✓
- #5 Suggest from countries (fix + sketch/rough + feedback + plan-page) → Tasks 5, 6, 7, 8. ✓
- #6 Merge transport buttons → Task 9. ✓
- #7 Night counts spelled out → Task 1. ✓
- #8 Route render home bookend (+ share map) → Task 11. ✓
- #9 Cover render always fits → Task 11 (`meet`). ✓
- ADR touches → Task 12. ✓

**Type consistency:** `spanContributors`/`sortGroupStops` operate on `StopLike` (+ `id`) and `ChapterLike` from `lib/chapters.ts`. `SuggestStop.countryCode` replaces `country` and is fed by the action's `select`. `countryName` used by both Task 6 and Task 7. `suggestChaptersFromCountries` returns `ActionResult<{ created: number }>` — consumed identically in Tasks 8's two call sites. `orderedRoutePoints`/`LatLng` shared by render + cover. `assignStopToChapter`/`canAssignToChapter` names match across action and test.

**Ordering/dependencies:** 1 (independent) → 2 → 3 (same file, sequential) → 4 (needs chapter model) → 5 (rough country) → 6 (countryCode + names) → 7 (rough chapters, needs 5+6) → 8 (feedback, needs 6+7 return shape) → 9, 10, 11 (independent) → 12 (docs last).

**Placeholder scan:** No TBDs; each code step shows the code; UI-only/DB-integration steps carry explicit browser-verification steps because they cannot be unit-asserted.
