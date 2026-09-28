# Day View and Plan Editor Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close six Feedback notes: the Day view strip reaches every day, its arrows stop moving, page content stops painting over the phone chrome during a section crossfade, the Day title moves its entry point to the Day view, the Stop card shows the Accommodation in one place with an add affordance that follows the nights, and the collapsed Accommodation row lays out on phones.

**Architecture:** Pure helpers in `lib/` change first with unit tests (`tripDays`, `uncoveredNights`, `useDayTitleEditor`); the Day view loader and Server Components consume them; the only new client islands are the Day view's inline title editor and the existing rows. Nothing is added to the navigation model: the chrome fix is two CSS `view-transition-name`s. The Playwright nav audit gains phone-viewport checks for the three Day view notes.

**Tech Stack:** Next.js 16.3 App Router (read `node_modules/next/dist/docs/01-app/` before touching `app/` routes or server actions), React 19 (`<ViewTransition>` via `components/ui/view-transition`), Tailwind v4 (`pointer-coarse:` / `pointer-fine:` variants exist), Prisma, vitest + Testing Library (jsdom, colocated `*.test.ts(x)`, `TZ=UTC`), Playwright via `scripts/lib/audit-browser.ts` for `npm run audit:nav`.

**Spec:** `docs/specs/2026-09-28-day-view-and-plan-editor-feedback.md` (decisions D1–D7, detail §1.1–§1.7). This plan argues from it; where they differ the spec wins.

## Global Constraints

- Branch: `fix/day-view-plan-editor-feedback-2026-09-28`. Never touch `main`. Never deploy.
- Every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. The commit that closes a note carries `Resolves-Feedback: <id>` as a trailer (ADR 0040). Never run `npm run feedback:resolve` and never edit `docs/feedback/inbox.md`.
- Note ids: strip `cmukmzc35000204lecgcb1djo`; arrows `cmukmuzqg000004lerleg2ja2`; chrome flash `cmukmw2ks000104le2i7lbxtj`; NAME THIS DAY `cmukh0jjg000004kxwz9czuxp`; staying tile / multiple Accommodation `cmukh1ghk000104kx47j9g7oc`; vertical name `cmukh2bzz000204kxk8kxq04o`.
- Tokens only, never raw hex in components. 44px touch targets on phones (`pointer-coarse:min-h-11` where a control is text-sized).
- Copy: "Add a title" (Day view and plan editor add affordance), "Add accommodation" (uncovered stay), "Add another place" (covered stay), "Where you're staying" (unchanged heading), "No bed yet" (unchanged empty state). The phrase "Name this day" leaves every file under `components/`, `app/` and `lib/`.
- Dates on screen go through `lib/dates.ts` (`formatDayLabel`, `formatDateRange`); never ISO.
- Server Components by default; `"use client"` only where a task says.
- Glossary: **Day title**, **Accommodation**, **Stop**, **Changeover day**, **Day view** as defined in `CONTEXT.md`. Never "Days page", "hotel", "stay".
- Verify per task with `npx vitest run <paths>`; the final task runs `npm test`, `npm run lint`, `npx tsc --noEmit`.
- `npm run audit:nav` needs a signed-in `next dev`, which the sandbox cannot provide. Task 4 is verified by `npx tsc --noEmit` and its pure checks' unit tests; the run itself is for Cam on beta.

## Review Focus

1. **A one-day Trip** (start = end) must render a strip of exactly one chip with `isCurrent`, and both arrows inert. (Task 1 test "a one-day trip is one chip".)
2. **A gap day with no Stop** on the Day view has no Stop to own a title, so it must show no "Add a title" affordance and never call `setDayTitle` with a null Stop. (Task 5 test "no affordance without a Stop".)
3. **A Changeover day titled from the Day view** must be owned by the Stop the Day view treats as the day's Stop (the arriving one), so the loader's `dayTitleStopId` on such a day is the later Stop's id when no title exists yet. (Task 5 loader test "changeover day without a title offers the arriving Stop".)
4. **A Stop with two Accommodations that together cover every night** must show "Add another place", while one whose two bookings leave a night uncovered must still show "Add accommodation". (Task 8 tests "two bookings covering the stay" and "two bookings with a gap".)
5. **An Accommodation with no confirmation number, no costs and no warnings** must still lay out as two lines on phones without an empty second row collapsing to nothing. (Task 9 test "second line holds the dates even with nothing else".)

---

### Task 1: The strip holds every day of the Trip

**Files:**
- Modify: `lib/day-view-model.ts:32-38` (replace `dayStripWindow`)
- Modify: `lib/day-view-model.test.ts:36-41, 52`
- Modify: `lib/day-view-loader.ts:34-42, 54, 126, 283-289, 567-578`
- Modify: `lib/day-view-loader.test.ts:209-240`
- Modify: `components/trip/day/day-strip.tsx`
- Modify: `components/trip/day/day-strip.test.tsx`

**Interfaces:**
- Consumes: `addDays`, `daysBetween` from `lib/dates.ts`; `citySegments(window: string[], stops)` unchanged.
- Produces: `tripDays(tripStart: string, tripEnd: string): string[]` in `lib/day-view-model.ts` (every ISO date from start to end inclusive). `DayViewData.strip` shape unchanged. `DayStrip` props unchanged (`size` still selects phone vs desktop chip sizing; both are scrollers now).

- [ ] **Step 1: Replace the window test with `tripDays` tests**

In `lib/day-view-model.test.ts`, change the import line to import `tripDays` instead of `dayStripWindow`, and replace the `describe("dayStripWindow", …)` block (lines 36–41) with:

```ts
describe("tripDays (spec D1: the strip holds every day of the Trip)", () => {
  it("every day from start to end inclusive", () => expect(tripDays("2026-12-04", "2026-12-08")).toEqual(["2026-12-04", "2026-12-05", "2026-12-06", "2026-12-07", "2026-12-08"]));
  it("a one-day trip is one chip", () => expect(tripDays("2026-07-10", "2026-07-10")).toEqual(["2026-07-10"]));
  it("the December trip is 36 days", () => expect(tripDays(T.start, T.end)).toHaveLength(36));
});
```

In the `citySegments` describe (line 52), replace `const w = dayStripWindow("2026-12-12", "2026-12-06", "2026-12-20", 9); // 08..16` with `const w = tripDays("2026-12-08", "2026-12-16"); // 08..16` so the expected segments are unchanged.

- [ ] **Step 2: Run the model tests to see them fail**

Run: `npx vitest run lib/day-view-model.test.ts`
Expected: FAIL — `tripDays` is not exported.

- [ ] **Step 3: Implement `tripDays`**

In `lib/day-view-model.ts` replace the `dayStripWindow` function (lines 32–38) with:

```ts
/** Every calendar day of the Trip, start → end inclusive — the Day view strip shows them all (spec 2026-09-28 D1). */
export function tripDays(tripStart: string, tripEnd: string): string[] {
  const total = daysBetween(tripStart, tripEnd) + 1;
  return Array.from({ length: total }, (_, k) => addDays(tripStart, k));
}
```

- [ ] **Step 4: Run the model tests**

Run: `npx vitest run lib/day-view-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the loader test to expect the full range**

In `lib/day-view-loader.test.ts` change the test title on line 209 from `strip of 9 with counts from groupBy` to `strip of every day with counts from groupBy`, and replace lines 229–238 (`expect(d.strip.dates).toHaveLength(9)` through the `itemGroupByMock` assertion) with:

```ts
    expect(d.strip.dates).toHaveLength(36);
    expect(d.strip.dates[0].iso).toBe("2026-12-04");
    expect(d.strip.dates[35].iso).toBe("2027-01-08");
    expect(d.strip.dates.find((s) => s.iso === "2026-12-11")?.count).toBe(3);
    expect(d.strip.dates.find((s) => s.iso === "2026-12-12")).toEqual({ iso: "2026-12-12", count: 0, isCurrent: true, isToday: false });
    expect(d.strip.dates.filter((s) => s.isCurrent)).toHaveLength(1);
    // The dot counts are one grouped query over the Trip's whole range, not an `in` list of 36 dates.
    expect(itemGroupByMock).toHaveBeenCalledWith({
      by: ["date"],
      where: { tripId: TRIP_ID, forkId: null, date: { gte: "2026-12-04", lte: "2027-01-08" } },
      _count: { _all: true },
    });
```

- [ ] **Step 6: Run the loader test to see it fail**

Run: `npx vitest run lib/day-view-loader.test.ts`
Expected: FAIL on the length (9 vs 36) and the groupBy `where`.

- [ ] **Step 7: Switch the loader to the full range**

In `lib/day-view-loader.ts`:
- In the import from `@/lib/day-view-model` (lines 34–42) replace `dayStripWindow,` with `tripDays,`.
- Delete line 54 `const STRIP_DAYS = 9;`.
- Replace line 126 `const windowDates = dayStripWindow(effectiveDate, startDate, endDate, STRIP_DAYS);` with `const windowDates = tripDays(startDate, endDate);`.
- Replace the groupBy `where` (line 286) `where: { tripId, ...REAL_PLAN, date: { in: windowDates } },` with `where: { tripId, ...REAL_PLAN, date: { gte: startDate, lte: endDate } },`.
- Update the comment above the strip block (line 557 area) to read `// ── Strip: every day of the Trip (spec 2026-09-28 D1) ──`.

- [ ] **Step 8: Run the loader test**

Run: `npx vitest run lib/day-view-loader.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the strip tests for one scroller at every width**

In `components/trip/day/day-strip.test.tsx` replace the test `"desktop shows the city line with one segment per stop; phone hides it"` with:

```tsx
  it("is a horizontal scroller at every width — desktop no longer squeezes the days into equal columns (spec D1)", () => {
    const { unmount } = render(<DayStrip tripId="t1" dates={dates} segments={segments} size="desktop" />);
    const desktopNav = screen.getByRole("navigation", { name: "Days" });
    expect(desktopNav.className).toContain("overflow-x-auto");
    expect(desktopNav.className).toContain("snap-x");
    expect(desktopNav.style.gridTemplateColumns).toBe("");
    // Desktop chips keep a fixed width so 36 of them scroll rather than shrink.
    expect(screen.getByRole("link", { name: /Fri 11 Dec/ }).className).toContain("w-14");
    unmount();
    render(<DayStrip tripId="t1" dates={dates} segments={segments} size="phone" />);
    const phoneNav = screen.getByRole("navigation", { name: "Days" });
    expect(phoneNav.className).toContain("snap-x");
    expect(screen.getByRole("link", { name: /Fri 11 Dec/ }).className).toContain("w-12");
  });
  it("desktop shows the city line as a scrolling row of fixed-width cells; phone hides it", () => {
    const { unmount } = render(<DayStrip tripId="t1" dates={dates} segments={segments} size="desktop" />);
    expect(screen.getByText("Paris")).toBeInTheDocument();
    const strasbourg = screen.getByText("Strasbourg").closest("[data-city-segment]") as HTMLElement;
    expect(strasbourg).toHaveStyle({ gridColumn: "2 / span 4" });
    const cityRow = strasbourg.parentElement as HTMLElement;
    expect(cityRow.style.gridTemplateColumns).toBe("repeat(5, 3.5rem)");
    unmount();
    render(<DayStrip tripId="t1" dates={dates} segments={segments} size="phone" />);
    expect(screen.queryByText("Paris")).toBeNull();
  });
```

- [ ] **Step 10: Run the strip tests to see them fail**

Run: `npx vitest run components/trip/day/day-strip.test.tsx`
Expected: FAIL — desktop nav still uses `grid` with `gridTemplateColumns: repeat(5, minmax(0, 1fr))` and chips have `min-w-0`, not `w-14`.

- [ ] **Step 11: Make the desktop strip a scroller of fixed-width chips**

In `components/trip/day/day-strip.tsx`:

Replace the `useLayoutEffect` (lines 22–33) so it runs at every width. New version:

```tsx
  // Put the current chip in view with scrollLeft (not scrollIntoView — DAY_VIEW §3.3).
  // useLayoutEffect (not useEffect) so the scroll offset is applied before the
  // browser paints — otherwise the chip visibly starts at the left edge and
  // jumps into place on the first frame. Every width scrolls now: the strip
  // holds every day of the Trip (spec 2026-09-28 D1).
  React.useLayoutEffect(() => {
    if (!scroller.current) return;
    const nav = scroller.current;
    const el = nav.querySelector<HTMLElement>('[aria-current="date"]');
    if (!el) return;
    // The chip's offset within the scroller (offsetLeft is relative to the
    // offsetParent, not the nav), less two chips (chip width + 8px gap each)
    // so the current day sits third with its two predecessors fully in view.
    const chipStride = el.getBoundingClientRect().width + 8;
    const offset = el.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
    nav.scrollLeft = Math.max(0, offset - 2 * chipStride);
  }, []);
```

Replace the `<nav>` opening (lines 69–76) with:

```tsx
      <nav
        ref={scroller}
        aria-label="Days"
        className={cn(
          "flex snap-x snap-mandatory gap-2 overflow-x-auto [scrollbar-width:none]",
          phone && "pr-[18px]",
        )}
      >
```

Replace the chip size classes (line 91) `phone ? "h-[58px] w-12" : "h-[62px] min-w-0",` with `phone ? "h-[58px] w-12" : "h-[62px] w-14",`.

Replace the city-segments row opening (line 106) `<div className="grid gap-2" style={{ gridTemplateColumns: \`repeat(${n}, minmax(0, 1fr))\` }} aria-hidden="true">` with:

```tsx
        <div className="grid gap-2 overflow-x-auto [scrollbar-width:none]" style={{ gridTemplateColumns: `repeat(${n}, 3.5rem)` }} aria-hidden="true">
```

`3.5rem` is `w-14`, so each city cell sits under its chip. The city row does not scroll in sync with the chips; that is accepted and logged in Task 10 — it is a legend, and the visible chips are what matter. Leave the wheel effect (and its `if (phone) return;` guard) exactly as it is; phones have no wheel.

- [ ] **Step 12: Run the strip tests**

Run: `npx vitest run components/trip/day/day-strip.test.tsx lib/day-view-model.test.ts lib/day-view-loader.test.ts`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add lib/day-view-model.ts lib/day-view-model.test.ts lib/day-view-loader.ts lib/day-view-loader.test.ts components/trip/day/day-strip.tsx components/trip/day/day-strip.test.tsx
git commit -m "fix(day): the strip holds every day of the Trip, scrolling at every width

The 9-day window centred on the current day meant a mid-trip day could only
reach four days ahead. The strip is now one horizontal scroller everywhere,
scrolled so the current day sits third; desktop gives up its equal columns.

Resolves-Feedback: cmukmzc35000204lecgcb1djo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The Day view arrows stay put

**Files:**
- Modify: `components/trip/day/day-header.tsx:101-112`
- Modify: `components/trip/day/day-header.test.tsx`

**Interfaces:**
- Consumes: `DayHeaderProps` unchanged in this task (`dayTitle: string | null`).
- Produces: `WIDEST_HEADING` (exported const, `"Wed 30 Dec 2026"`), `data-slot="day-title-block"` on the title block, `data-slot="day-title-line"` on the (always rendered) Day title line, `data-slot="day-sub-line"` on both sub-line elements. Task 5 swaps the title line's content for a client component; it relies on those slots.

- [ ] **Step 1: Write the failing layout-stability tests**

Append to `components/trip/day/day-header.test.tsx` inside the `describe("DayHeader", …)` block:

```tsx
  describe("the arrows stay put between days (spec 2026-09-28 D2)", () => {
    const base = { tripId: "t1", prevHref: "/trips/t1/day/2026-12-11", nextHref: "/trips/t1/day/2026-12-13", prevLabel: "Previous day: Fri 11 Dec", nextLabel: "Next day: Sun 13 Dec", unreadCount: 0, recent: [], members: [], addButton: <button>+</button> };
    const variants = [
      { eyebrow: "DAY 9 OF 36 · EUROPE", heading: "Sat 12 Dec", subLine: "Strasbourg, France · CET · night 3 of 4", subLineCompact: "Strasbourg · CET · night 3 of 4", dayTitle: null },
      { eyebrow: "DAY 9 OF 36", heading: "Wed 30 Dec 2026", subLine: "", subLineCompact: "", dayTitle: null },
      { eyebrow: "DAY 10 OF 36 · A VERY LONG CHAPTER NAME THAT GOES ON", heading: "Sun 13 Dec", subLine: "Colmar", subLineCompact: "Colmar", dayTitle: "Christmas markets" },
      { eyebrow: "DAY 11 OF 36 · TRAVEL DAY", heading: "Mon 14 Dec", subLine: "Colmar → Basel · CET", subLineCompact: "Colmar → Basel · CET", dayTitle: "" },
    ];
    function shape() {
      const block = document.querySelector('[data-slot="day-title-block"]') as HTMLElement;
      const children = Array.from(block.children).map((c) => `${c.tagName}:${c.className}`);
      const row = block.parentElement as HTMLElement;
      const prev = screen.getByRole("link", { name: /Previous day/ });
      const next = screen.getByRole("link", { name: /Next day/ });
      return { row: row.className, children, prev: prev.className, next: next.className };
    }
    it("renders the same row, block and arrow classes whatever the day's text", () => {
      const shapes = variants.map((v) => {
        const { unmount } = render(<DayHeader {...base} {...v} />);
        const s = shape();
        unmount();
        return s;
      });
      for (const s of shapes.slice(1)) expect(s).toEqual(shapes[0]);
    });
    it("phone: arrows are pinned to the row's edges by a 44px | 1fr | 44px grid; desktop keeps the arrows beside the title", () => {
      render(<DayHeader {...base} {...variants[0]} />);
      const row = (document.querySelector('[data-slot="day-title-block"]') as HTMLElement).parentElement as HTMLElement;
      expect(row.className).toContain("grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]");
      expect(row.className).toContain("md:flex");
    });
    it("desktop: a ghost of the widest heading sizes the block so the date's width never moves the arrows", () => {
      render(<DayHeader {...base} {...variants[0]} />);
      const ghost = document.querySelector('[data-slot="day-heading-ghost"]') as HTMLElement;
      expect(ghost).toHaveTextContent("Wed 30 Dec 2026");
      expect(ghost).toHaveAttribute("aria-hidden", "true");
      expect(ghost.className).toContain("hidden");
      expect(ghost.className).toContain("md:block");
      expect(ghost.className).toContain("h-0");
    });
    it("the title and sub-line slots are always rendered with a fixed height, empty when the day has none", () => {
      render(<DayHeader {...base} {...variants[1]} />);
      const title = document.querySelector('[data-slot="day-title-line"]') as HTMLElement;
      expect(title).toBeInTheDocument();
      expect(title.className).toContain("h-5");
      expect(title).toHaveTextContent("");
      const subs = document.querySelectorAll('[data-slot="day-sub-line"]');
      expect(subs).toHaveLength(2);
      for (const s of Array.from(subs)) expect(s.className).toContain("h-5");
    });
  });
```

- [ ] **Step 2: Run the header tests to see them fail**

Run: `npx vitest run components/trip/day/day-header.test.tsx`
Expected: FAIL — no `data-slot="day-title-block"`.

- [ ] **Step 3: Rebuild the header row**

In `components/trip/day/day-header.tsx` add, after `const MAX_AVATARS = 5;`:

```tsx
/**
 * The widest label `dayHeading` can produce, rendered invisibly in the same
 * font so the title block's min width (md+) never depends on the day shown —
 * the arrows sit in the same two spots on every day (spec 2026-09-28 D2).
 */
export const WIDEST_HEADING = "Wed 30 Dec 2026";
```

Replace lines 101–112 (from `<header className="flex items-end gap-4">` through the closing `</div>` after the next `<Arrow>`) with:

```tsx
      <header className="flex items-end gap-4">
        {/* Phone: a 44px | 1fr | 44px grid pins the arrows to the row's edges.
            md+: the arrows sit beside a title block whose min width comes
            from the invisible widest heading below. Every line in the block
            has a fixed height, so the optional Day title and sub-line can
            come and go without the arrows moving (spec 2026-09-28 D2). */}
        <div className="grid w-full grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-3.5 md:flex md:w-auto md:min-w-0 md:flex-1 md:justify-start">
          <Arrow href={prevHref} label={prevLabel} dir="prev" />
          {/* Only the ghost and the nowrap h1 size this block: the text lines are
              `w-0 min-w-full` (zero intrinsic contribution, full width at layout,
              so `truncate` clips to the block), and at md+ the block never shrinks. */}
          <div data-slot="day-title-block" className="flex min-w-0 flex-col items-center text-center md:shrink-0">
            <span data-slot="day-heading-ghost" aria-hidden="true" className="invisible hidden h-0 select-none overflow-hidden whitespace-nowrap font-display text-[40px] font-extrabold tracking-[-0.02em] md:block">
              {WIDEST_HEADING}
            </span>
            <p className="h-4 w-0 min-w-full truncate text-[10px] font-extrabold uppercase leading-4 tracking-[0.08em] text-muted-foreground md:text-[11px]">{eyebrow}</p>
            <p data-slot="day-title-line" className="h-5 w-0 min-w-full truncate text-sm font-bold leading-5 text-muted-foreground">{dayTitle || ""}</p>
            <h1 className="font-display whitespace-nowrap text-[30px] font-extrabold leading-none tracking-[-0.02em] text-foreground md:text-[40px]">{heading}</h1>
            <p data-slot="day-sub-line" className="mt-1 hidden h-5 w-0 min-w-full truncate text-[15px] font-semibold leading-5 text-foreground md:block">{subLine}</p>
            <p data-slot="day-sub-line" className="mt-1 h-5 w-0 min-w-full truncate text-[13px] font-semibold leading-5 text-foreground md:hidden">{subLineCompact}</p>
          </div>
          <Arrow href={nextHref} label={nextLabel} dir="next" />
        </div>
```

Keep everything from `<div className="hidden shrink-0 items-center gap-2.5 lg:flex">` onward unchanged.

- [ ] **Step 4: Run the header tests**

Run: `npx vitest run components/trip/day/day-header.test.tsx`
Expected: PASS, including the four pre-existing tests (`getByText("Christmas markets")` still finds the title line; the sub-line `md:block` / `md:hidden` assertions still hold).

- [ ] **Step 5: Commit**

```bash
git add components/trip/day/day-header.tsx components/trip/day/day-header.test.tsx
git commit -m "fix(day): the arrows stay in the same two spots on every day

Phone pins them to the header's edges with a 44px | 1fr | 44px grid; desktop
sizes the title block from an invisible widest heading. Every line in the
block has a fixed height so the Day title and sub-line no longer shift them.

Resolves-Feedback: cmukmuzqg000004lerleg2ja2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The phone chrome paints above the section crossfade

**Files:**
- Modify: `app/globals.css` (after the `::view-transition-old(root), ::view-transition-new(root) { animation: none; }` rule, around line 650)
- Modify: `components/ui/tab-bar.tsx:55`
- Modify: `app/(app)/layout.tsx:167`
- Modify: `components/ui/tab-bar.test.tsx`
- Modify: `app/(app)/layout.test.tsx`
- Modify: `docs/adr/0063-sibling-navigation-holds-the-current-page.md` (Consequences)

**Interfaces:**
- Produces: CSS classes `.tp-vt-tab-bar` and `.tp-vt-top-bar` in `app/globals.css`, each setting a `view-transition-name`. Task 4's audit reads the computed names `tp-tab-bar` and `tp-top-bar`.

- [ ] **Step 1: Write the failing tests**

Append to `components/ui/tab-bar.test.tsx` inside `describe("TabBar", …)`:

```tsx
  it("carries its own view-transition-name class so a section crossfade paints beneath it (spec 2026-09-28 D3)", () => {
    render(<NavigationPendingProvider><TabBar items={items} /></NavigationPendingProvider>);
    expect(screen.getByRole("navigation", { name: "Main" }).className.split(/\s+/)).toContain("tp-vt-tab-bar");
  });
```

In `app/(app)/layout.test.tsx`, find the existing test that asserts the phone header's content on a trip path (the one using `within(header()).getByRole("link", { name: "Teepee — go to your trips" })`, around line 189) and add directly after that assertion:

```tsx
    // Spec 2026-09-28 D3: the sticky phone top bar is its own View Transition
    // group, so the section crossfade cannot paint page content over it.
    expect(header().className.split(/\s+/)).toContain("tp-vt-top-bar");
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run components/ui/tab-bar.test.tsx "app/(app)/layout.test.tsx"`
Expected: FAIL on the two new assertions.

- [ ] **Step 3: Add the CSS and the classes**

In `app/globals.css`, directly after the rule `::view-transition-old(root), ::view-transition-new(root) { animation: none; }`, add:

```css
/* Fixed and sticky chrome outside any <ViewTransition> — the phone tab bar
   and the phone top bar — would otherwise be captured in the root snapshot
   and painted BENEATH the animating section, so for the 120–180ms of a
   section crossfade page content showed on top of the bar (Feedback
   cmukmw2ks000104le2i7lbxtj; ADR 0063 consequence). Each bar gets its own
   group, painted above the section, and does not animate. Only one element
   may carry a given name at a time: the two bars never render together
   (OnTripPath / OutsideTrip), and MobileTabBar and AppTabBar are likewise
   exclusive. */
.tp-vt-tab-bar { view-transition-name: tp-tab-bar; }
.tp-vt-top-bar { view-transition-name: tp-top-bar; }
::view-transition-old(tp-tab-bar), ::view-transition-new(tp-tab-bar),
::view-transition-old(tp-top-bar), ::view-transition-new(tp-top-bar) { animation: none; }
```

In `components/ui/tab-bar.tsx` line 55, add `tp-vt-tab-bar` to the `<nav>`'s class list: change `cn("fixed inset-x-0 bottom-0 z-40 …` to `cn("tp-vt-tab-bar fixed inset-x-0 bottom-0 z-40 …` (the rest unchanged).

In `app/(app)/layout.tsx` line 167, add `tp-vt-top-bar` to the `<header>`'s className: change `className="sticky top-0 z-40 …` to `className="tp-vt-top-bar sticky top-0 z-40 …` (the rest unchanged).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run components/ui/tab-bar.test.tsx "app/(app)/layout.test.tsx" components/trip/mobile-tab-bar.test.tsx components/shell/app-tab-bar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Amend ADR 0063**

Append to the `## Consequences` list in `docs/adr/0063-sibling-navigation-holds-the-current-page.md`:

```markdown
- Chrome that is fixed or sticky and sits *outside* every `<ViewTransition>` — the phone tab
  bar and the phone top bar — must carry its own `view-transition-name` (`.tp-vt-tab-bar`,
  `.tp-vt-top-bar` in `app/globals.css`). Without one the browser captures it in the root
  snapshot and paints it beneath the animating section, so for the length of a section
  crossfade page content shows on top of the bar (Feedback `cmukmw2ks000104le2i7lbxtj`,
  2026-09-28). A new bar of that kind needs a new name; the same name may not be on two
  elements at once.
```

- [ ] **Step 6: Commit**

```bash
git add app/globals.css components/ui/tab-bar.tsx "app/(app)/layout.tsx" components/ui/tab-bar.test.tsx "app/(app)/layout.test.tsx" docs/adr/0063-sibling-navigation-holds-the-current-page.md
git commit -m "fix(shell): phone tab bar and top bar paint above the section crossfade

Each bar gets its own view-transition-name, so the browser captures it as
its own group above the fading section instead of inside the root snapshot
beneath it. ADR 0063 records the rule.

Resolves-Feedback: cmukmw2ks000104le2i7lbxtj

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Nav audit checks for the three Day view notes (phone viewport)

**Files:**
- Modify: `scripts/nav-audit/checks.ts`
- Modify: `scripts/nav-audit/checks.test.ts`
- Modify: `scripts/nav-audit.ts` (after the phone swipe checks, before `await page.setViewportSize(DESKTOP);` at the end of the Day view block)

**Interfaces:**
- Consumes: the strip `nav[aria-label="Days"]`, arrows `a[aria-label^="Next day"]`, the bar `nav.tp-vt-tab-bar`, the header `header.tp-vt-top-bar`.
- Produces: pure `arrowDrift(boxes: Array<{ x: number; y: number; w: number; h: number }>): string[]` and `stripReach(hrefs: string[], first: string, last: string): string[]` in `checks.ts`.

- [ ] **Step 1: Write the failing unit tests for the pure checks**

Append to `scripts/nav-audit/checks.test.ts`:

```ts
import { arrowDrift, stripReach } from "./checks";

describe("arrowDrift (spec 2026-09-28 D2)", () => {
  it("empty when every box is identical", () => {
    expect(arrowDrift([{ x: 16, y: 120, w: 44, h: 44 }, { x: 16, y: 120, w: 44, h: 44 }])).toEqual([]);
  });
  it("names the sample and axis that moved", () => {
    expect(arrowDrift([{ x: 16, y: 120, w: 44, h: 44 }, { x: 22, y: 120, w: 44, h: 44 }, { x: 16, y: 131, w: 44, h: 44 }])).toEqual(["sample 2 x moved 16→22", "sample 3 y moved 120→131"]);
  });
});

describe("stripReach (spec 2026-09-28 D1)", () => {
  it("empty when the strip links the first and last day", () => {
    expect(stripReach(["/trips/t/day/2026-12-04", "/trips/t/day/2026-12-05", "/trips/t/day/2027-01-08"], "2026-12-04", "2027-01-08")).toEqual([]);
  });
  it("reports a missing end", () => {
    expect(stripReach(["/trips/t/day/2026-12-08", "/trips/t/day/2026-12-16"], "2026-12-04", "2027-01-08")).toEqual(["first day 2026-12-04 not in the strip", "last day 2027-01-08 not in the strip"]);
  });
});
```

If the file does not already import `describe`, `it`, `expect` from vitest, add that import at the top.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run scripts/nav-audit/checks.test.ts`
Expected: FAIL — `arrowDrift` / `stripReach` not exported.

- [ ] **Step 3: Implement the pure checks**

Append to `scripts/nav-audit/checks.ts`:

```ts
export interface Box { x: number; y: number; w: number; h: number }

/** Every box after the first must equal it; the arrows may not move between days (spec 2026-09-28 D2). */
export function arrowDrift(boxes: Box[]): string[] {
  const out: string[] = [];
  const first = boxes[0];
  if (!first) return out;
  boxes.forEach((b, i) => {
    if (i === 0) return;
    for (const k of ["x", "y", "w", "h"] as const) {
      if (b[k] !== first[k]) out.push(`sample ${i + 1} ${k} moved ${first[k]}→${b[k]}`);
    }
  });
  return out;
}

/** The strip must link the Trip's first and last day (spec 2026-09-28 D1). */
export function stripReach(hrefs: string[], first: string, last: string): string[] {
  const out: string[] = [];
  if (!hrefs.some((h) => h.endsWith(`/day/${first}`))) out.push(`first day ${first} not in the strip`);
  if (!hrefs.some((h) => h.endsWith(`/day/${last}`))) out.push(`last day ${last} not in the strip`);
  return out;
}
```

- [ ] **Step 4: Run the unit tests**

Run: `npx vitest run scripts/nav-audit/checks.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the phone checks to the script**

In `scripts/nav-audit.ts`, extend the import from `./nav-audit/checks` to `{ holdViolations, summarise, arrowDrift, stripReach, type Finding, type Sample, type Box }`.

Insert after the line `findings.push(await checkHold(page, "Day: swipe right (phone)", …));` and before `await page.setViewportSize(DESKTOP);`:

```ts
    // ── Phone Day view: strip reach, arrow drift, chrome names (spec 2026-09-28 D1–D3) ──
    await holdRsc(page, 0);
    await page.goto(`${baseUrl}${base}/day/${mid}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    const stripHrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('nav[aria-label="Days"] a')).map((a) => a.getAttribute("href") ?? ""),
    );
    const reach = stripReach(stripHrefs, dates[0], dates[dates.length - 1]);
    findings.push({ name: "Day (phone): the strip reaches the Trip's first and last day", hard: true, ok: reach.length === 0, detail: reach.join("; ") });

    const arrowBox = () =>
      page.evaluate((): Box | null => {
        const el = Array.from(document.querySelectorAll('a[aria-label^="Next day"], span[aria-label="Next day"]')).find((e) => (e as HTMLElement).checkVisibility()) as HTMLElement | undefined;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      });
    const boxes: Box[] = [];
    for (const iso of [prev, mid, next]) {
      await page.goto(`${baseUrl}${base}/day/${iso}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
      await page.evaluate(() => window.scrollTo(0, 0));
      const b = await arrowBox();
      if (b) boxes.push(b);
    }
    const drift = arrowDrift(boxes);
    findings.push({ name: "Day (phone): the next arrow's box is identical across three consecutive days", hard: true, ok: boxes.length === 3 && drift.length === 0, detail: boxes.length === 3 ? drift.join("; ") : `only ${boxes.length} boxes` });

    const chrome = await page.evaluate(() => {
      // No const-bound helper in here: tsx's keepNames would wrap it in a
      // `__name()` helper that does not exist inside the page (see the swipe
      // check above). Read each bar's computed name inline instead.
      const bar = document.querySelector("nav.tp-vt-tab-bar") as HTMLElement | null;
      const top = document.querySelector("header.tp-vt-top-bar") as HTMLElement | null;
      return {
        bar: bar ? ((getComputedStyle(bar) as unknown as { viewTransitionName?: string }).viewTransitionName ?? "") : "missing",
        top: top ? ((getComputedStyle(top) as unknown as { viewTransitionName?: string }).viewTransitionName ?? "") : "missing",
      };
    });
    findings.push({ name: "Phone chrome: tab bar and top bar carry their own view-transition-name", hard: true, ok: chrome.bar === "tp-tab-bar" && chrome.top === "tp-top-bar", detail: `bar=${chrome.bar}, top=${chrome.top}` });
    await holdRsc(page, delayMs);
```

- [ ] **Step 6: Type-check the script**

Run: `npx tsc --noEmit`
Expected: no errors. (The script cannot be run in the sandbox; Cam runs `npm run audit:nav` against a dev server on their machine.)

- [ ] **Step 7: Commit**

```bash
git add scripts/nav-audit/checks.ts scripts/nav-audit/checks.test.ts scripts/nav-audit.ts
git commit -m "test(nav-audit): phone Day view checks — strip reach, arrow drift, chrome names

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The Day view adds and edits the Day title

**Files:**
- Create: `components/trip/day-title-editor.ts` (shared hook)
- Create: `components/trip/day-title-editor.test.tsx`
- Create: `components/trip/day/day-title-inline.tsx`
- Create: `components/trip/day/day-title-inline.test.tsx`
- Modify: `lib/day-view-loader.ts:78, 294-298, 630`
- Modify: `lib/day-view-loader.test.ts`
- Modify: `components/trip/day/day-header.tsx` (`dayTitle` prop type)
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx:19, 143`

**Interfaces:**
- Consumes: `setDayTitle({ stopId, date, title })` from `server/actions/day-titles.ts`; `formatDayLabel` from `lib/dates.ts`.
- Produces:
  - `useDayTitleEditor({ stopId, date, title }): { editing, value, setValue, startEditing, save, cancel, onKeyDown }` in `components/trip/day-title-editor.ts` (Task 6 reuses it).
  - `DayTitleInline({ stopId: string | null; date: string; title: string | null })` client component.
  - `DayViewData.dayTitleStopId: string | null`.
  - `DayHeaderProps.dayTitle: React.ReactNode` (was `string | null`).

- [ ] **Step 1: Write the failing hook test**

Create `components/trip/day-title-editor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { setDayTitle } from "@/server/actions/day-titles";
import { toast } from "@/components/ui/use-toast";
import { useDayTitleEditor } from "./day-title-editor";

const args = { stopId: "s1", date: "2026-12-05", title: null as string | null };

describe("useDayTitleEditor (shared by the plan editor row and the Day view line)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts idle, seeds the value from the title when editing starts", () => {
    const { result } = renderHook(() => useDayTitleEditor({ ...args, title: "Rest day" }));
    expect(result.current.editing).toBe(false);
    act(() => result.current.startEditing());
    expect(result.current.editing).toBe(true);
    expect(result.current.value).toBe("Rest day");
  });

  it("save trims, calls setDayTitle once and refreshes; a trailing blur is a no-op", async () => {
    const { result } = renderHook(() => useDayTitleEditor(args));
    act(() => result.current.startEditing());
    act(() => result.current.setValue("  Sintra day trip "));
    await act(async () => { await result.current.save(); });
    await act(async () => { await result.current.save(); }); // the blur that follows Enter
    expect(setDayTitle).toHaveBeenCalledTimes(1);
    expect(setDayTitle).toHaveBeenCalledWith({ stopId: "s1", date: "2026-12-05", title: "Sintra day trip" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.editing).toBe(false);
  });

  it("an unchanged value saves nothing", async () => {
    const { result } = renderHook(() => useDayTitleEditor({ ...args, title: "Rest day" }));
    act(() => result.current.startEditing());
    await act(async () => { await result.current.save(); });
    expect(setDayTitle).not.toHaveBeenCalled();
  });

  it("a failed save toasts and reopens with the typed text", async () => {
    vi.mocked(setDayTitle).mockResolvedValueOnce({ success: false, errors: { title: ["Keep it under 80 characters."] } });
    const { result } = renderHook(() => useDayTitleEditor(args));
    act(() => result.current.startEditing());
    act(() => result.current.setValue("Too long"));
    await act(async () => { await result.current.save(); });
    expect(toast).toHaveBeenCalled();
    expect(result.current.editing).toBe(true);
    expect(result.current.value).toBe("Too long");
  });

  it("cancel restores the title and closes without saving", async () => {
    const { result } = renderHook(() => useDayTitleEditor({ ...args, title: "Rest day" }));
    act(() => result.current.startEditing());
    act(() => result.current.setValue("Changed"));
    act(() => result.current.cancel());
    expect(result.current.editing).toBe(false);
    expect(setDayTitle).not.toHaveBeenCalled();
  });

  it("without a Stop it never saves", async () => {
    const { result } = renderHook(() => useDayTitleEditor({ ...args, stopId: null }));
    act(() => result.current.startEditing());
    act(() => result.current.setValue("Orphan"));
    await act(async () => { await result.current.save(); });
    expect(setDayTitle).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run components/trip/day-title-editor.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `components/trip/day-title-editor.ts`:

```ts
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/use-toast";
import { setDayTitle } from "@/server/actions/day-titles";

/** CONTEXT.md "Day title" — kept short so it reads as a label, not a caption. Mirrors server/actions/day-titles.ts. */
export const DAY_TITLE_MAX_LENGTH = 80;

/**
 * The one edit flow for a Day title (CONTEXT.md "Day title"), shared by the
 * Day view's header line (the primary entry point, spec 2026-09-28 D4) and
 * the plan editor's day row. Enter or blur saves via `setDayTitle` (an empty
 * save clears the title); Escape reverts and cancels without saving.
 *
 * Enter/Escape both unmount the still-focused input, which fires a native
 * blur → `save` runs again with a stale closure. Whichever of {Enter's save,
 * Escape's cancel, a genuine blur-triggered save} runs FIRST flips
 * `committingRef` so a trailing blur from the same edit session is a no-op —
 * otherwise Enter double-submitted (two setDayTitle calls, two Activity
 * rows). Reset only when a fresh session starts or a failed save reopens.
 */
export function useDayTitleEditor({ stopId, date, title }: { stopId: string | null; date: string; title: string | null | undefined }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState("");
  const committingRef = React.useRef(false);
  const current = title ?? "";

  // Seeded here rather than synced via an effect, so a `title` that changed
  // while idle (router.refresh() after a save elsewhere) is never stale the
  // next time editing starts.
  const startEditing = React.useCallback(() => {
    committingRef.current = false;
    setValue(current);
    setEditing(true);
  }, [current]);

  const save = React.useCallback(async () => {
    if (committingRef.current) return;
    committingRef.current = true;
    const trimmed = value.trim();
    setEditing(false);
    if (trimmed === current) return;
    if (!stopId) return; // a gap day has no Stop to own a title (Review Focus 2)
    const res = await setDayTitle({ stopId, date, title: trimmed });
    if (!res.success) {
      toast({ title: "Couldn't save the day title", variant: "destructive" });
      // Reopen with what was typed rather than discarding it.
      committingRef.current = false;
      setEditing(true);
      return;
    }
    router.refresh();
  }, [value, current, stopId, date, router]);

  const cancel = React.useCallback(() => {
    committingRef.current = true;
    setValue(current);
    setEditing(false);
  }, [current]);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [save, cancel],
  );

  return { editing, value, setValue, startEditing, save, cancel, onKeyDown };
}
```

- [ ] **Step 4: Run the hook test**

Run: `npx vitest run components/trip/day-title-editor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing `DayTitleInline` test**

Create `components/trip/day/day-title-inline.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle: vi.fn().mockResolvedValue({ success: true }) }));
import { setDayTitle } from "@/server/actions/day-titles";
import { DayTitleInline } from "@/components/trip/day/day-title-inline";

describe("DayTitleInline — the Day view is the primary place to add and edit a Day title (spec 2026-09-28 D4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers 'Add a title' when the day has none, and saves what is typed on Enter", async () => {
    const user = userEvent.setup();
    render(<DayTitleInline stopId="s1" date="2026-12-05" title={null} />);
    await user.click(screen.getByRole("button", { name: "Add a title" }));
    const input = screen.getByRole("textbox", { name: "Day title for Sat 5 Dec" });
    expect(input).toHaveAttribute("maxlength", "80");
    await user.type(input, "Christmas markets{Enter}");
    expect(setDayTitle).toHaveBeenCalledTimes(1);
    expect(setDayTitle).toHaveBeenCalledWith({ stopId: "s1", date: "2026-12-05", title: "Christmas markets" });
  });

  it("shows the title as a button that opens the editor seeded with it; Escape cancels", async () => {
    const user = userEvent.setup();
    render(<DayTitleInline stopId="s1" date="2026-12-05" title="Christmas markets" />);
    expect(screen.getByText("Christmas markets")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit the day title, Christmas markets" }));
    const input = screen.getByRole("textbox", { name: "Day title for Sat 5 Dec" });
    expect(input).toHaveValue("Christmas markets");
    await user.type(input, " again{Escape}");
    expect(setDayTitle).not.toHaveBeenCalled();
    expect(screen.getByText("Christmas markets")).toBeInTheDocument();
  });

  it("no affordance without a Stop (a gap day): renders an empty line", () => {
    render(<DayTitleInline stopId={null} date="2026-12-05" title={null} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("never says 'Name this day'", () => {
    render(<DayTitleInline stopId="s1" date="2026-12-05" title={null} />);
    expect(document.body.textContent).not.toMatch(/name this day/i);
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `npx vitest run components/trip/day/day-title-inline.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `DayTitleInline`**

Create `components/trip/day/day-title-inline.tsx`:

```tsx
"use client";

import * as React from "react";
import { formatDayLabel } from "@/lib/dates";
import { useDayTitleEditor, DAY_TITLE_MAX_LENGTH } from "@/components/trip/day-title-editor";

/**
 * The Day view header's Day title line (CONTEXT.md "Day title") — the
 * primary place to add or edit one (spec 2026-09-28 D4). Fills the fixed
 * 20px slot `DayHeader` reserves: "Add a title" when empty, the title as a
 * button when set, an input while editing (the slot may grow while the input
 * is open; the arrows only need to be stable between days).
 *
 * `stopId` null is a gap day — no Stop can own a title, so nothing is offered.
 */
export function DayTitleInline({ stopId, date, title }: { stopId: string | null; date: string; title: string | null }) {
  const ed = useDayTitleEditor({ stopId, date, title });
  const inputId = React.useId();
  if (!stopId) return null;

  if (ed.editing) {
    return (
      <>
        <label htmlFor={inputId} className="sr-only">
          Day title for {formatDayLabel(date)}
        </label>
        <input
          id={inputId}
          autoFocus
          value={ed.value}
          onChange={(e) => ed.setValue(e.target.value)}
          onBlur={() => void ed.save()}
          onKeyDown={ed.onKeyDown}
          placeholder="Sintra day trip"
          maxLength={DAY_TITLE_MAX_LENGTH}
          className="h-8 w-full max-w-xs rounded-md border-2 border-input bg-card px-2 text-center text-sm font-semibold text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </>
    );
  }

  if (title) {
    return (
      <button
        type="button"
        onClick={ed.startEditing}
        aria-label={`Edit the day title, ${title}`}
        className="max-w-full truncate rounded px-1 text-sm font-bold leading-5 text-muted-foreground hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span>{title}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={ed.startEditing}
      className="rounded px-1 text-sm font-semibold leading-5 text-muted-foreground hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Add a title
    </button>
  );
}
```

- [ ] **Step 8: Run the inline test**

Run: `npx vitest run components/trip/day/day-title-inline.test.tsx`
Expected: PASS.

- [ ] **Step 9: Write the failing loader test for the owning Stop**

Append to `lib/day-view-loader.test.ts` inside `describe("getDay", …)`:

```ts
  it("dayTitleStopId: the title's owner when one exists, else the day's Stop — the arriving one on a changeover day (spec 2026-09-28 D4)", async () => {
    // 2026-12-10 is Paris's depart date and Strasbourg's arrive date.
    expect((await loadDay("2026-12-10")).dayTitleStopId).toBe(STRASBOURG.id);
    // A title owned by Paris on that date reports Paris.
    dayTitleFindManyMock.mockResolvedValue([{ stopId: PARIS.id, dayIndex: 4, title: "Onward" }]);
    const titled = await loadDay("2026-12-10");
    expect(titled.dayTitle).toBe("Onward");
    expect(titled.dayTitleStopId).toBe(PARIS.id);
  });
```

The fixtures already exist at the top of the file: `PARIS` (`s-paris`, 2026-12-06 → 2026-12-10) and `STRASBOURG` (`s-stras`, 2026-12-10 → 2026-12-13), so `dayIndex: 4` is 2026-12-10 for Paris.

- [ ] **Step 10: Run to see it fail**

Run: `npx vitest run lib/day-view-loader.test.ts`
Expected: FAIL — `dayTitleStopId` undefined.

- [ ] **Step 11: Expose `dayTitleStopId` from the loader**

In `lib/day-view-loader.ts`:
- After `dayTitle: string | null;` in `DayViewData` (line 78) add:
  ```ts
  /** The Stop that owns the title, or — when there is none — the Stop the Day view treats as the day's (the arriving one on a Changeover day); null on a gap day. */
  dayTitleStopId: string | null;
  ```
- Replace lines 294–298 with:
  ```ts
  const dayTitleEntry =
    (await loadDayTitles(stops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })))).get(effectiveDate) ?? null;
  const dayTitleText = dayTitleEntry?.title ?? null;
  ```
- In the return object, after `dayTitle: dayTitleText,` add `dayTitleStopId: dayTitleEntry?.stopId ?? dayStop?.id ?? null,`.

- [ ] **Step 12: Run the loader test**

Run: `npx vitest run lib/day-view-loader.test.ts`
Expected: PASS.

- [ ] **Step 13: Wire the header and page**

In `components/trip/day/day-header.tsx`:
- Change `dayTitle: string | null;` in `DayHeaderProps` to `/** The Day title line's content — `DayTitleInline` on the page; a plain string in tests. */ dayTitle: React.ReactNode;`.
- Replace the title line `<p data-slot="day-title-line" …>{dayTitle || ""}</p>` from Task 2 with a `<div>` (a `<p>` may not contain a `<button>`; React warns): `<div data-slot="day-title-line" className="flex h-5 w-0 min-w-full items-center justify-center text-sm font-bold leading-5 text-muted-foreground">{dayTitle}</div>`. The `h-5` and `w-0 min-w-full` stay so Task 2's stability tests keep passing (the line must not contribute width to the block).

In `app/(app)/trips/[tripId]/day/[date]/page.tsx`:
- Add `import { DayTitleInline } from "@/components/trip/day/day-title-inline";` beside the other `components/trip/day` imports.
- Replace `dayTitle={d.dayTitle}` with `dayTitle={<DayTitleInline stopId={d.dayTitleStopId} date={d.date} title={d.dayTitle} />}`.

- [ ] **Step 14: Run the Day view tests and type-check**

Run: `npx vitest run components/trip/day lib/day-view-loader.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors. In `day-header.test.tsx` the assertion `title.className` contains `h-5` still holds; `getByText("Christmas markets")` still finds the string rendered in the slot.

- [ ] **Step 15: Commit**

```bash
git add components/trip/day-title-editor.ts components/trip/day-title-editor.test.tsx components/trip/day/day-title-inline.tsx components/trip/day/day-title-inline.test.tsx lib/day-view-loader.ts lib/day-view-loader.test.ts components/trip/day/day-header.tsx "app/(app)/trips/[tripId]/day/[date]/page.tsx"
git commit -m "feat(day): add and edit the Day title from the Day view header

The Day view becomes the primary place for a Day title: 'Add a title' under
the date, tap the title to edit. On a changeover day a new title belongs to
the arriving Stop, which is the Stop the Day view already treats as the
day's. The edit flow is a shared hook the plan editor row adopts next.

Resolves-Feedback: cmukh0jjg000004kxwz9czuxp

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The plan editor stops prompting "NAME THIS DAY"

**Files:**
- Modify: `components/trip/stop-day-list.tsx:1-24 (imports), 261-372 (DayTitleRow)`
- Modify: `components/trip/stop-day-list.test.tsx:246-325`
- Modify: `components/trip/help-guide.tsx:599-604`
- Modify: `lib/help-guide.ts:281-282`

**Interfaces:**
- Consumes: `useDayTitleEditor`, `DAY_TITLE_MAX_LENGTH` from `components/trip/day-title-editor.ts` (Task 5).
- Produces: nothing new. `DayTitleRow` keeps its props `{ stopId, date, title, isPending }`.

- [ ] **Step 1: Rewrite the Day title tests**

In `components/trip/stop-day-list.test.tsx` replace the whole `describe("Day titles (Task 5, CONTEXT.md \"Day title\")", …)` block's tests from `"shows the muted 'Name this day' prompt…"` through `"Escape cancels the edit without saving"` (keep `"shows a day's title when one is set"` and the changeover test) with:

```tsx
  it("an untitled day shows no prompt — the add affordance is a quiet 'Add a title' that never says 'Name this day' (spec 2026-09-28 D4)", () => {
    render(<StopDayList {...baseProps} />);
    const row = screen.getByTestId("day-row-2026-12-05");
    expect(row.textContent).not.toMatch(/name this day/i);
    const add = within(row).getByRole("button", { name: "Add a title for Sat 5 Dec" });
    // Hover/focus-only on pointer-fine devices; a normal row item on touch.
    expect(add.className).toContain("pointer-fine:opacity-0");
    expect(add.className).toContain("pointer-fine:group-hover/day:opacity-100");
    expect(add.className).toContain("pointer-fine:focus-visible:opacity-100");
    expect(add.className).toContain("pointer-coarse:min-h-11");
  });

  it("a titled day renders the title in normal case (not uppercase) as a click-to-edit button", () => {
    render(<StopDayList {...baseProps} dayTitles={{ "2026-12-06": { title: "Sintra day trip", stopId: "s1" } }} />);
    const row = screen.getByTestId("day-row-2026-12-06");
    const button = within(row).getByRole("button", { name: "Edit the day title, Sintra day trip" });
    expect(button).toHaveTextContent("Sintra day trip");
    expect(button.className).not.toMatch(/(^|\s)uppercase(\s|$)/);
  });

  it("clicking 'Add a title', typing a title and pressing Enter saves it once via setDayTitle", async () => {
    const user = userEvent.setup();
    render(<StopDayList {...baseProps} />);
    const row = screen.getByTestId("day-row-2026-12-05");
    await user.click(within(row).getByRole("button", { name: "Add a title for Sat 5 Dec" }));
    const input = within(row).getByLabelText(/day title/i);
    await user.type(input, "Sintra day trip");
    await user.keyboard("{Enter}");
    expect(setDayTitle).toHaveBeenCalledWith({ stopId: "s1", date: "2026-12-05", title: "Sintra day trip" });
    expect(setDayTitle).toHaveBeenCalledTimes(1);
  });

  it("re-opens the input with the typed text (not discarded) when the save fails", async () => {
    vi.mocked(setDayTitle).mockResolvedValueOnce({ success: false, errors: { title: ["Keep it under 80 characters."] } });
    const user = userEvent.setup();
    render(<StopDayList {...baseProps} />);
    const row = screen.getByTestId("day-row-2026-12-05");
    await user.click(within(row).getByRole("button", { name: "Add a title for Sat 5 Dec" }));
    const input = within(row).getByLabelText(/day title/i);
    await user.type(input, "Sintra day trip");
    await user.keyboard("{Enter}");
    const reopened = await within(row).findByLabelText(/day title/i);
    expect(reopened).toHaveValue("Sintra day trip");
  });

  it("Escape cancels the edit without saving", async () => {
    const user = userEvent.setup();
    render(<StopDayList {...baseProps} />);
    const row = screen.getByTestId("day-row-2026-12-05");
    await user.click(within(row).getByRole("button", { name: "Add a title for Sat 5 Dec" }));
    await user.type(within(row).getByLabelText(/day title/i), "Sintra day trip");
    await user.keyboard("{Escape}");
    expect(setDayTitle).not.toHaveBeenCalled();
    expect(within(row).getByRole("button", { name: "Add a title for Sat 5 Dec" })).toBeInTheDocument();
  });
```

Also add `vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));` next to the other mocks at the top of the file if it is not already mocked.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run components/trip/stop-day-list.test.tsx`
Expected: FAIL — "Name this day" still rendered; no "Add a title for…" button.

- [ ] **Step 3: Rewrite `DayTitleRow` on the shared hook**

In `components/trip/stop-day-list.tsx`:
- Remove `import { setDayTitle } from "@/server/actions/day-titles";` and add `import { useDayTitleEditor, DAY_TITLE_MAX_LENGTH } from "./day-title-editor";`. Keep `toast` if other code in the file uses it (it does: `handleMove`).
- Give each day row the group name: change `<div key={day.dateISO} className="flex flex-col" data-testid={\`day-row-${day.dateISO}\`}>` to `<div key={day.dateISO} className="group/day flex flex-col" data-testid={\`day-row-${day.dateISO}\`}>`.
- Replace the whole `DayTitleRow` function (doc comment through its closing brace, lines 261–372) with:

```tsx
/**
 * A day row's Day title (CONTEXT.md "Day title"). The Day view is the
 * primary place to add one (spec 2026-09-28 D4); here the row stays quiet:
 * a titled day shows its title as a click-to-edit button, an untitled day
 * shows nothing until the row is hovered or focused on a pointer-fine
 * device, and on touch the "Add a title" item simply sits in the row at a
 * 44px height. Kept as its own sibling above `CollapsedDayRow`'s toggle
 * button rather than nested inside it — a button can't contain a button.
 * Forks keep Day titles through this path (the Day view is real-plan only).
 */
function DayTitleRow({ stopId, date, title, isPending }: { stopId: string; date: string; title: string | undefined; isPending: boolean }) {
  const ed = useDayTitleEditor({ stopId, date, title });
  const inputId = React.useId();

  if (ed.editing) {
    return (
      <div className="px-1.5 pb-1 pt-1.5">
        <label htmlFor={inputId} className="sr-only">
          Day title for {formatDayLabel(date)}
        </label>
        <input
          id={inputId}
          autoFocus
          value={ed.value}
          onChange={(e) => ed.setValue(e.target.value)}
          onBlur={() => void ed.save()}
          onKeyDown={ed.onKeyDown}
          disabled={isPending}
          placeholder="Sintra day trip"
          maxLength={DAY_TITLE_MAX_LENGTH}
          className="h-8 w-full max-w-xs rounded-md border-2 border-input bg-card px-2 text-sm font-semibold text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11"
        />
      </div>
    );
  }

  if (title) {
    return (
      <button
        type="button"
        onClick={ed.startEditing}
        disabled={isPending}
        aria-label={`Edit the day title, ${title}`}
        className="mx-1.5 mb-0.5 mt-1.5 flex max-w-fit items-center truncate rounded px-1 py-0.5 text-left text-xs font-semibold text-foreground hover:bg-muted/50 pointer-coarse:min-h-11"
      >
        {title}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={ed.startEditing}
      disabled={isPending}
      aria-label={`Add a title for ${formatDayLabel(date)}`}
      className={cn(
        "mx-1.5 flex max-w-fit items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        // Pointer-fine: out of the flow's way until the row is hovered or the button is focused.
        "pointer-fine:opacity-0 pointer-fine:transition-opacity pointer-fine:group-hover/day:opacity-100 pointer-fine:focus-visible:opacity-100",
        // Touch: a plain 44px row item.
        "pointer-coarse:min-h-11",
      )}
    >
      <Plus className="size-3" aria-hidden="true" />
      Add a title
    </button>
  );
}
```

`Plus` and `cn` are already imported in this file.

- [ ] **Step 4: Run the stop-day-list tests**

Run: `npx vitest run components/trip/stop-day-list.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update the help guide copy and its string list**

In `components/trip/help-guide.tsx` replace lines 599–604 (the sentence starting `You can also give the day itself a name —`) with:

```tsx
            <p>
              You can also give the day itself a name — open the day and tap{" "}
              <strong className="font-semibold">Add a title</strong> under the
              date, or hover a day row on this Stop&rsquo;s card. &ldquo;Sintra day
              trip&rdquo; or &ldquo;Rest day&rdquo; reads better than a bare
              date, and the name follows the day wherever it shows —{" "}
```

Keep the rest of that paragraph (the `<Go … segment="calendar">` link and what follows) exactly as it is.

In `lib/help-guide.ts` replace `"Name this day",` (line 282) with `"Add a title",`.

- [ ] **Step 6: Run the help-guide tests and the phrase sweep**

Run: `npx vitest run lib/help-guide.test.ts components/trip/help-guide.test.tsx && grep -rn "Name this day" components app lib; echo "grep exit $?"`
Expected: tests PASS; grep prints nothing and `grep exit 1`.

- [ ] **Step 7: Commit**

```bash
git add components/trip/stop-day-list.tsx components/trip/stop-day-list.test.tsx components/trip/help-guide.tsx lib/help-guide.ts
git commit -m "fix(plan): drop the standing NAME THIS DAY prompt above every day row

An untitled day shows nothing until hovered (pointer-fine) or a plain
'Add a title' row item on touch; a titled day shows its title in normal
case as a click-to-edit button. The row now uses the shared Day title
editor hook. Help guide copy points at the Day view first.

Resolves-Feedback: cmukh0jjg000004kxwz9czuxp

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The Accommodation lives in one place on the Stop card

**Files:**
- Modify: `components/trip/stop-card.tsx:165-170, 183-184, 186-193, 234, 390-397, 498-503, 522-528`
- Modify: `components/trip/stop-card.test.tsx:965-986`
- Modify: `components/trip/itinerary-manager.tsx:1669-1672`

**Interfaces:**
- Consumes: nothing new.
- Produces: `StopCardProps.accommodationName` removed; `STOP_CARD_ROW_CLASS` becomes a three-column grid. Task 8 adds a new prop to `StopCard`; it does not depend on this task's shape beyond the section staying.

- [ ] **Step 1: Rewrite the staying-tile tests**

In `components/trip/stop-card.test.tsx` replace the three tests `"the staying tile names the first Accommodation"`, `"the staying tile says 'No bed yet' on a rough stop with none"` and `"no staying tile when the caller does not wire Accommodation in"` (lines 967–986) with:

```tsx
  it("the header carries no staying tile at any width — the Accommodation lives only in 'Where you're staying' (spec 2026-09-28 D5)", () => {
    renderRow({ accommodations: <div>Hotel Artemide</div>, onAddAccommodation: () => {} });
    expect(screen.queryByTestId("stop-staying-tile")).not.toBeInTheDocument();
    const header = screen.getByTestId("stop-card-header");
    expect(header).not.toHaveTextContent("Hotel Artemide");
    expect(header.className).toContain("lg:grid-cols-[minmax(0,1fr)_14rem_auto]");
    expect(screen.getByTestId("stop-staying")).toHaveTextContent("Hotel Artemide");
  });

  it("'No bed yet' is the section's empty state at every width (no lg:hidden)", () => {
    renderRow({ stop: roughStop, onAddAccommodation: () => {} });
    const empty = within(screen.getByTestId("stop-staying")).getByText("No bed yet");
    expect(empty.className).not.toContain("lg:hidden");
    expect(screen.getByTestId("stop-card-header")).not.toHaveTextContent("No bed yet");
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run components/trip/stop-card.test.tsx`
Expected: FAIL — tile still rendered, header still four columns.

- [ ] **Step 3: Remove the tile**

In `components/trip/stop-card.tsx`:
- Delete the `accommodationName?: string;` prop and its doc comment (lines 165–170).
- Change `STOP_CARD_ROW_CLASS` to `"lg:grid lg:grid-cols-[minmax(0,1fr)_14rem_auto] lg:items-center lg:gap-4"` and its doc comment to `The Stop card's top block on \`lg+\`: place text | dates & nights | actions. Below \`lg\` the block keeps its stacked \`flex flex-col gap-3\`. The Accommodation is never summarised here — it lives only in "Where you're staying" (spec 2026-09-28 D5).`
- Remove `accommodationName,` from the destructured props (line 234).
- Delete the `stayingTile` const (lines 391–397), keeping `const showStaying = accommodations != null || onAddAccommodation != null;`.
- Change the actions column from `lg:col-start-4` to `lg:col-start-3` (the `<div className="flex shrink-0 items-center justify-end gap-2 lg:col-start-4 lg:row-start-1">`).
- Delete the block `{/* Compact staying tile — lg+ only; … */} {stayingTile && (<div data-testid="stop-staying-tile" …>…</div>)}` (lines 497–503).
- In the section, replace `<NoBedYet className="lg:hidden" />` and its comment with `<NoBedYet />`.
- Update the comment on the header block (lines 412–416) to `Top block. Phone: the stacked column (name row, then dates). lg+: place | dates & nights | actions.`.

In `components/trip/itinerary-manager.tsx` delete the `accommodationName={…}` prop and its comment (lines 1669–1672).

- [ ] **Step 4: Run the card and manager tests**

Run: `npx vitest run components/trip/stop-card.test.tsx components/trip/itinerary-manager.test.tsx && npx tsc --noEmit`
Expected: PASS; no type errors. Search once for leftovers: `grep -rn "accommodationName\|stop-staying-tile" components app lib` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add components/trip/stop-card.tsx components/trip/stop-card.test.tsx components/trip/itinerary-manager.tsx
git commit -m "fix(plan): the Stop card shows its Accommodation in one place

The lg+ header's purple staying tile repeated the name the 'Where you're
staying' section shows just below it. The tile goes; the header is place,
dates, actions; 'No bed yet' is the section's empty state at every width.

Resolves-Feedback: cmukh1ghk000104kx47j9g7oc

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The add-accommodation affordance follows the nights

**Files:**
- Create: `lib/accommodation-coverage.ts`
- Create: `lib/accommodation-coverage.test.ts`
- Modify: `lib/flags.ts:700-741`
- Modify: `components/trip/stop-card.tsx` (props, section)
- Modify: `components/trip/stop-card.test.tsx:748-760`
- Modify: `components/trip/itinerary-manager.tsx:1664-1668`

**Interfaces:**
- Consumes: `addDays`, `nightsBetween` from `lib/dates.ts`.
- Produces: `uncoveredNights(stop: { arriveDate: string; departDate: string }, accommodations: Array<{ checkIn: string; checkOut: string }>): number` in `lib/accommodation-coverage.ts`; `StopCardProps.stayCovered?: boolean`.

- [ ] **Step 1: Write the failing helper tests**

Create `lib/accommodation-coverage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { uncoveredNights } from "./accommodation-coverage";

const stay = { arriveDate: "2026-07-01", departDate: "2026-07-05" }; // 4 nights

describe("uncoveredNights (spec 2026-09-28 D6; shared with Flag rule 14)", () => {
  it("every night with no Accommodation at all", () => expect(uncoveredNights(stay, [])).toBe(4));
  it("zero when one booking covers the stay", () => expect(uncoveredNights(stay, [{ checkIn: "2026-07-01", checkOut: "2026-07-05" }])).toBe(0));
  it("two bookings covering the stay", () => expect(uncoveredNights(stay, [{ checkIn: "2026-07-01", checkOut: "2026-07-03" }, { checkIn: "2026-07-03", checkOut: "2026-07-05" }])).toBe(0));
  it("two bookings with a gap", () => expect(uncoveredNights(stay, [{ checkIn: "2026-07-01", checkOut: "2026-07-02" }, { checkIn: "2026-07-03", checkOut: "2026-07-05" }])).toBe(1));
  it("overlapping bookings still count each night once", () => expect(uncoveredNights(stay, [{ checkIn: "2026-07-01", checkOut: "2026-07-04" }, { checkIn: "2026-07-02", checkOut: "2026-07-05" }])).toBe(0));
  it("a zero-night stay has nothing to cover", () => expect(uncoveredNights({ arriveDate: "2026-07-01", departDate: "2026-07-01" }, [])).toBe(0));
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/accommodation-coverage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper and make the Flag use it**

Create `lib/accommodation-coverage.ts`:

```ts
import { addDays, nightsBetween } from "@/lib/dates";

/**
 * How many nights of a scheduled Stop's stay (arrive → depart) no
 * Accommodation covers. A night is covered when some booking has
 * checkIn <= night < checkOut. Shared by Flag rule 14 (lib/flags.ts) and
 * the Stop card's add affordance (spec 2026-09-28 D6): "Add accommodation"
 * while any night is uncovered, "Add another place" once every night is.
 */
export function uncoveredNights(
  stop: { arriveDate: string; departDate: string },
  accommodations: Array<{ checkIn: string; checkOut: string }>,
): number {
  const nights = nightsBetween(stop.arriveDate, stop.departDate);
  let uncovered = 0;
  for (let d = 0; d < nights; d++) {
    const night = addDays(stop.arriveDate, d);
    if (!accommodations.some((a) => a.checkIn <= night && night < a.checkOut)) uncovered++;
  }
  return uncovered;
}
```

In `lib/flags.ts` add `import { uncoveredNights } from "@/lib/accommodation-coverage";` with the other imports, and in `flagAccommodationCoverageGaps` replace the loop body from `let uncovered = 0;` through the closing brace of the `for (let d…)` loop with `const uncovered = uncoveredNights(stop, accoms);`.

- [ ] **Step 4: Run the helper and flag tests**

Run: `npx vitest run lib/accommodation-coverage.test.ts lib/flags.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing Stop card tests**

In `components/trip/stop-card.test.tsx`, after the test `"shows 'No bed yet' when there are no accommodations, and the add button calls onAddAccommodation"` (ends around line 760) add:

```tsx
  it("'Add accommodation' while the stay has an uncovered night; 'Add another place' once every night is covered (spec 2026-09-28 D6)", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { rerender } = render(
      <StopCard stop={scheduledStop} isFirst isLast accommodations={<div>Hotel A</div>} onAddAccommodation={onAdd} stayCovered={false} />,
    );
    const section = () => screen.getByTestId("stop-staying");
    expect(within(section()).getByRole("button", { name: "Add accommodation" })).toBeInTheDocument();
    expect(within(section()).queryByRole("button", { name: "Add another place" })).not.toBeInTheDocument();
    rerender(
      <StopCard stop={scheduledStop} isFirst isLast accommodations={<div>Hotel A</div>} onAddAccommodation={onAdd} stayCovered />,
    );
    expect(within(section()).queryByRole("button", { name: "Add accommodation" })).not.toBeInTheDocument();
    const quiet = within(section()).getByRole("button", { name: "Add another place" });
    expect(quiet.className).toContain("text-xs");
    await user.click(quiet);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("stayCovered is ignored when there is no Accommodation — a bare Stop always offers 'Add accommodation'", () => {
    render(<StopCard stop={scheduledStop} isFirst isLast onAddAccommodation={() => {}} stayCovered />);
    expect(within(screen.getByTestId("stop-staying")).getByRole("button", { name: "Add accommodation" })).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run to see them fail**

Run: `npx vitest run components/trip/stop-card.test.tsx`
Expected: FAIL — no `stayCovered` prop; "Add another place" never rendered.

- [ ] **Step 7: Add `stayCovered` and the quiet link**

In `components/trip/stop-card.tsx`:
- In `StopCardProps`, after `onAddAccommodation?: () => void;` add:
  ```ts
  /**
   * True once every night of the stay is covered by an Accommodation
   * (`lib/accommodation-coverage.ts`). The section then offers a quiet
   * "Add another place" instead of the "Add accommodation" button
   * (spec 2026-09-28 D6). Ignored when `accommodations` is nullish.
   */
  stayCovered?: boolean;
  ```
- Destructure `stayCovered = false,` after `onAddAccommodation,`.
- Replace the `{onAddAccommodation && (<div><Button …>Add accommodation</Button></div>)}` block in the section with:

```tsx
          {onAddAccommodation && (accommodations == null || !stayCovered) && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                disabled={isPending}
                onClick={onAddAccommodation}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Add accommodation
              </Button>
            </div>
          )}
          {onAddAccommodation && accommodations != null && stayCovered && (
            // Every night has a bed: the mid-stay move stays possible, quietly.
            <button
              type="button"
              disabled={isPending}
              onClick={onAddAccommodation}
              className="self-start rounded text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11"
            >
              Add another place
            </button>
          )}
```

In `components/trip/itinerary-manager.tsx`:
- Add `import { uncoveredNights } from "@/lib/accommodation-coverage";` with the other `@/lib` imports.
- After the `onAddAccommodation={() => handleAddAccommodationClick(stop)}` prop add:
  ```tsx
        stayCovered={
          stop.arriveDate && stop.departDate
            ? uncoveredNights({ arriveDate: stop.arriveDate, departDate: stop.departDate }, stop.accommodations) === 0
            : false
        }
  ```
- Update the comment above `onAddAccommodation` from `Add accommodation — always offered.` to `Add accommodation — always reachable; a covered stay gets the quiet "Add another place" (spec 2026-09-28 D6).` keeping the rest of that comment.

- [ ] **Step 8: Run the tests and type-check**

Run: `npx vitest run components/trip/stop-card.test.tsx components/trip/itinerary-manager.test.tsx lib/flags.test.ts && npx tsc --noEmit`
Expected: PASS. In `itinerary-manager.test.tsx` the fork-aware test still finds `/add accommodation/i` because its dated stop has no Accommodation.

- [ ] **Step 9: Commit**

```bash
git add lib/accommodation-coverage.ts lib/accommodation-coverage.test.ts lib/flags.ts components/trip/stop-card.tsx components/trip/stop-card.test.tsx components/trip/itinerary-manager.tsx
git commit -m "feat(plan): the add-accommodation affordance follows the nights

Several Accommodations per Stop stay allowed. 'Add accommodation' shows
while any night of the stay is uncovered; once every night has a bed it
becomes a quiet 'Add another place'. The coverage rule is one helper shared
with Flag rule 14.

Resolves-Feedback: cmukh1ghk000104kx47j9g7oc

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The collapsed Accommodation row lays out on phones

**Files:**
- Modify: `components/trip/accommodation-row.tsx:59-117`
- Modify: `components/trip/accommodation-row.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new. `AccommodationRowProps` unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `components/trip/accommodation-row.test.tsx`:

```tsx
describe("phone layout (spec 2026-09-28 D7)", () => {
  it("the name truncates at every width (never breaks inside a word), on a first line with the chevron", () => {
    render(<AccommodationRow accommodation={accommodation} stop={stop} />);
    const name = screen.getByText("Hotel du Louvre");
    expect(name.className).toContain("truncate");
    expect(name.className).not.toContain("break-words");
    const firstLine = name.parentElement as HTMLElement;
    expect(firstLine).toHaveAttribute("data-slot", "accommodation-row-line-1");
    expect(firstLine.querySelector("svg.lucide-chevron-down")).not.toBeNull();
  });

  it("dates and the paid badge sit on a second line below sm; the confirmation number is hidden there and only shown from sm up", () => {
    render(<AccommodationRow accommodation={accommodation} stop={stop} costs={[{ ...cost, paidAt: new Date("2026-11-01") }]} />);
    const secondLine = document.querySelector('[data-slot="accommodation-row-line-2"]') as HTMLElement;
    expect(secondLine).toHaveTextContent("5–7 Dec 2026");
    expect(secondLine).toHaveTextContent("paid ✓");
    const confirmation = screen.getByLabelText("Confirmation ABC123");
    expect(confirmation.className.split(/\s+/)).toContain("hidden");
    expect(confirmation.className.split(/\s+/)).toContain("sm:inline-flex");
  });

  it("second line holds the dates even with nothing else (no confirmation, no costs, no warning)", () => {
    render(<AccommodationRow accommodation={{ ...accommodation, confirmation: null }} stop={stop} />);
    const secondLine = document.querySelector('[data-slot="accommodation-row-line-2"]') as HTMLElement;
    expect(secondLine).toHaveTextContent("5–7 Dec 2026");
    expect(screen.queryByLabelText(/Confirmation/)).toBeNull();
  });
});
```

`describe` is not yet imported in this file: change the vitest import to `import { describe, it, expect, vi } from "vitest";`. `cost` is defined mid-file (line ~77); the new block is appended after it, so it is in scope.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run components/trip/accommodation-row.test.tsx`
Expected: FAIL — no `data-slot` lines; name has `break-words`.

- [ ] **Step 3: Restructure the button into two lines below sm**

In `components/trip/accommodation-row.tsx` replace the `<button …>…</button>` (lines 65–111) with:

```tsx
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        disabled={isPending}
        className={cn(
          // Below sm: two lines — name + chevron, then dates + badges — so a
          // long name never gets squeezed to one letter per line by the
          // fixed-width siblings (spec 2026-09-28 D7). From sm: one line.
          "flex w-full flex-col gap-1 px-3 py-2 text-left text-sm transition-colors hover:bg-hue-lilac/20 sm:flex-row sm:items-center sm:gap-2",
          isPending && "pointer-events-none opacity-60",
        )}
      >
        <span data-slot="accommodation-row-line-1" className="flex min-w-0 items-center gap-2 sm:contents">
          <Home className="size-4 shrink-0 text-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">{a.name}</span>
          <ChevronDown
            className={cn("size-3.5 shrink-0 text-foreground/80 transition-transform sm:hidden", open && "rotate-180")}
            aria-hidden="true"
          />
        </span>
        <span data-slot="accommodation-row-line-2" className="flex min-w-0 flex-wrap items-center gap-2 pl-6 sm:contents">
          <span className="shrink-0 text-xs text-foreground/80">{formatDateRange(a.checkIn, a.checkOut)}</span>
          {a.confirmation && (
            <span
              className="hidden shrink-0 items-center gap-1 font-mono text-xs text-foreground/80 sm:inline-flex"
              aria-label={`Confirmation ${a.confirmation}`}
            >
              <Hash className="size-3" aria-hidden="true" />
              {a.confirmation}
            </span>
          )}
          {paidState === "paid" && (
            <Badge variant="teal" className="shrink-0">
              paid ✓
            </Badge>
          )}
          {paidState === "unpaid" && (
            <Badge variant="muted" className="shrink-0">
              unpaid
            </Badge>
          )}
          {warnings.length > 0 && (
            <AlertTriangle className="size-3.5 shrink-0 text-sun-text" aria-label="Dates fall outside the stop" />
          )}
          <ChevronDown
            className={cn("hidden size-3.5 shrink-0 text-foreground/80 transition-transform sm:block", open && "rotate-180")}
            aria-hidden="true"
          />
        </span>
      </button>
```

`sm:contents` dissolves both line wrappers from `sm` up so the original single flex line is restored, with the chevron that renders being the `sm:block` one at the end.

- [ ] **Step 4: Run the row tests**

Run: `npx vitest run components/trip/accommodation-row.test.tsx components/trip/stop-card.test.tsx components/trip/itinerary-manager.test.tsx`
Expected: PASS. The pre-existing test `"shows the confirmation and 'paid ✓' on the collapsed row when a cost is paid"` still passes: jsdom applies no CSS, so `toHaveTextContent("ABC123")` and `getByLabelText("Confirmation ABC123")` still find the element.

- [ ] **Step 5: Commit**

```bash
git add components/trip/accommodation-row.tsx components/trip/accommodation-row.test.tsx
git commit -m "fix(plan): the collapsed Accommodation row is two lines on phones

Name and chevron, then dates and badges. The name truncates instead of
breaking one letter per line, and the confirmation number waits for the
expanded card below sm.

Resolves-Feedback: cmukh2bzz000204kxk8kxq04o

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Whole-suite verification and follow-ups note

**Files:**
- Modify: `docs/open-follow-ups.md` (append one entry)

- [ ] **Step 1: Run everything**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all PASS, no lint errors, no type errors. Fix anything that fails inside the task that owns it (amend nothing on `main`).

- [ ] **Step 2: Sweep for leftovers**

Run: `grep -rn "Name this day\|dayStripWindow\|STRIP_DAYS\|accommodationName\|stop-staying-tile" components app lib scripts docs/adr CONTEXT.md; echo "exit $?"`
Expected: no matches, `exit 1`. (`docs/specs/`, `docs/superpowers/` and `docs/feedback/` may still mention the old phrases as history; that is fine.)

- [ ] **Step 3: Record the follow-ups**

Append to `docs/open-follow-ups.md`:

```markdown
## 2026-09-28 · Day view and Plan editor feedback (spec 2026-09-28-day-view-and-plan-editor-feedback)

- **DV-01 · Desktop city legend under the strip does not scroll with the chips.** The strip is now
  a scroller at every width; the city row beneath it (desktop) is a separate grid of 3.5rem cells,
  so once the strip scrolls, the legend's cells no longer sit under their chips. Fix: scroll both
  in one container, or render the legend inside each chip. Cosmetic; noted, not blocking.
- **DV-02 · `npm run audit:nav` phone checks unrun in the sandbox.** Task 4 added strip-reach,
  arrow-drift and chrome-name checks; they type-check and their pure halves are unit-tested, but
  the script needs a signed-in `next dev`. Run once on a laptop before judging the notes closed.
```

- [ ] **Step 4: Commit**

```bash
git add docs/open-follow-ups.md
git commit -m "docs: follow-ups from the Day view and Plan editor feedback branch

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
