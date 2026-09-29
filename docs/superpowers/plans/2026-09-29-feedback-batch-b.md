# Feedback batch 2026-09-29b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close sixteen Feedback notes from the 2026-09-29 inbox: six small visual fixes, five medium changes (greeting, card colour, account layout, profile-photo focus point, Trip home stats) and five larger ones (New trip polish, persistent rail, full desktop sidebar with icons, help audit, Feedback vetting for non-admin testers).

**Architecture:** Next.js App Router (this repo's `next` is newer than your training data — read `node_modules/next/dist/docs/` before touching layouts or server actions). React Server Components with `"use client"` islands; Prisma 7 with hand-written SQL migrations in `prisma/migrations/`; Tailwind v4 with the Playground visual system (ADR 0060/0061: hard shadows, `island` accents, the hue ramp in `lib/hues.ts`). Tests are Vitest + jsdom next to the code as `*.test.ts(x)`; run one file with `npx vitest run <path>`; `npm test` runs everything with `TZ=UTC`.

**Tech Stack:** TypeScript, Next.js App Router, React 19, Prisma 7 (Postgres), Tailwind v4, Vitest, Leaflet (Globe map), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-09-29-feedback-batch-b.md` — read it first. Feedback ids in each task's commit trailer come from there.

## Global Constraints

- Work on branch `feat/feedback-batch-2026-09-29b`. Never commit to `main`. Never deploy. Never run `npm run feedback:resolve` or `npm run feedback:pull` (production database).
- Every commit that closes a note ends with `Resolves-Feedback: <id>` (one line per id), then `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR`.
- CONTEXT.md vocabulary is binding: "Traveller", "Trip", "Stop", "Plan" (never itinerary), "Profile photo" (never avatar for the picture), "Feedback note" (never bug/ticket), "Needs review" (the new status), "focus point" (never crop).
- No `loading.tsx` anywhere but `app/(app)/trips/loading.tsx`; no `template.tsx` (ADR 0063). `app/route-conventions.test.ts` pins this.
- No `max-w-5xl/6xl/7xl` in app or components (ADR 0062; `app/page-widths.test.ts` pins this). Use `max-w-page-wide`, `max-w-reading`, or an explicit rem value.
- Tailwind class strings are written out in full (the scanner cannot see `bg-hue-${x}`); hue classes come from `HUE_CLASSES` in `lib/hues.ts`.
- Icons: lucide-react only, `aria-hidden="true"` on decorative ones.
- Every `<button>` keeps a 44px hit target (`SM_HIT` from `components/ui/touch-target.ts` for small buttons).
- Copy is warm, plain, second person. No personal names in shipped UI text.
- After each task run `npx vitest run <the files you touched>`; before each commit run `npx tsc --noEmit -p .` (type errors fail the build on Vercel).

## Review Focus

1. **Persistent rail on a Trip that 404s or errors.** The rail must still show sensible rows (built from the URL segment) and never a permanent skeleton; the switcher card shows "Choose a trip" when nothing was published. Pinned in Task 15's `app-shell-rail.test.tsx`.
2. **A tester's note written on beta.** Vetting is by author, not site: a non-admin's note on any site is born `NEEDS_REVIEW`; an admin's on any site is born `OPEN`. Pinned in Task 13's `server/actions/feedback.test.ts`.
3. **An existing Profile photo (already centre-cropped) after the focus-point change.** With null focal columns every avatar must render exactly as before (`object-position: 50% 50%`). Pinned in Task 11's `traveller-avatar.test.tsx`.
4. **Trip home stats for a date-less Trip with no Stops.** Nights and Stops tiles must vanish rather than show "0 nights"; the row must not render at all when every stat is empty. Pinned in Task 10's `lib/home-stats.test.ts`.
5. **The New trip cover dropzone with no file chosen and with a rejected (non-image) file.** The field must still submit the form without a cover, and never throw on a file the compressor rejects. Pinned in Task 12's `new-trip-form.test.tsx`.

---

## Before Task 1 — commit the docs (done by the orchestrator)

The spec, this plan and the CONTEXT.md glossary edits (Needs review status, focus point) are committed on the branch before Task 1 starts:

```bash
git add CONTEXT.md docs/superpowers/specs/2026-09-29-feedback-batch-b.md docs/superpowers/plans/2026-09-29-feedback-batch-b.md
git commit -m "docs: spec, plan and glossary for feedback batch 2026-09-29b"
```

---

### Task 1: Pointer cursor on every enabled button

**Files:**
- Modify: `app/globals.css` (inside `@layer base`, right after the "Keyboard focus" rule around line 640)
- Test: `app/globals-cursor.test.ts` (create)

**Interfaces:** none.

- [ ] **Step 1: Write the failing test**

```ts
// app/globals-cursor.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");

describe("pointer cursor (Feedback cmumcrjs1000304l71nj6l4fk)", () => {
  it("gives every enabled button, role=button and summary a pointer cursor in one base rule", () => {
    expect(css).toMatch(
      /:where\(button, \[role="button"\], summary\):not\(:disabled, \[aria-disabled="true"\]\)\s*\{\s*cursor:\s*pointer;\s*\}/,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run app/globals-cursor.test.ts`
Expected: FAIL (regex does not match).

- [ ] **Step 3: Add the rule**

In `app/globals.css`, directly after the `:where(button, a, input, …):focus-visible { … }` block inside `@layer base`, add:

```css
  /* Tailwind v4's preflight leaves <button> at `cursor: default`, so the
     notification bell, the Feedback button and every other button read as
     inert on a desktop (Feedback cmumcrjs1000304l71nj6l4fk). One base rule,
     not per-component opt-ins. Disabled controls keep the default; Button's
     own `disabled:cursor-not-allowed` still wins where it is set. */
  :where(button, [role="button"], summary):not(:disabled, [aria-disabled="true"]) { cursor: pointer; }
```

- [ ] **Step 4: Run the test and the two components' tests**

Run: `npx vitest run app/globals-cursor.test.ts components/trip/notification-bell.test.tsx components/feedback`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/globals-cursor.test.ts
git commit -m "fix(ui): pointer cursor on every enabled button

Tailwind v4's preflight sets buttons to cursor: default, so the bell and the
Feedback launcher read as inert on desktop. One base-layer rule fixes all of
them.

Resolves-Feedback: cmumcrjs1000304l71nj6l4fk

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 2: Focus ring hugs the field

**Files:**
- Modify: `components/ui/input.tsx:26`, `components/ui/select.tsx:21`, `components/ui/textarea.tsx:25`
- Test: `components/ui/focus-ring.test.tsx` (create)

**Interfaces:** none.

Why: the shared field focus style lifts the box 2px and draws a 3px outline 2px outside it, so ~5px of ring sits above the box while the label is only 6px away (`gap-1.5` in `field.tsx`), and in two-column rows it rides into the field above (Feedback `cmumcjr3i000304l08xwwegwg`, "the border covers Trip name"). Dropping the offset to 0 keeps the lift and shadow and keeps the ring inside the gap.

- [ ] **Step 1: Write the failing test**

```tsx
// components/ui/focus-ring.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Select, SelectTrigger, SelectValue } from "./select";

function classesOf(el: Element): string[] {
  return el.className.split(/\s+/);
}

describe("field focus ring (Feedback cmumcjr3i000304l08xwwegwg)", () => {
  it("Input keeps the lift and shadow but the ring hugs the box (offset 0)", () => {
    render(<Input aria-label="Name" />);
    const c = classesOf(screen.getByLabelText("Name"));
    expect(c).toContain("focus-visible:-translate-y-0.5");
    expect(c).toContain("focus-visible:shadow-hard-2");
    expect(c).toContain("focus-visible:outline-offset-0");
    expect(c).not.toContain("focus-visible:outline-offset-2");
  });

  it("Textarea matches", () => {
    render(<Textarea aria-label="Notes" />);
    const c = classesOf(screen.getByLabelText("Notes"));
    expect(c).toContain("focus-visible:outline-offset-0");
    expect(c).not.toContain("focus-visible:outline-offset-2");
  });

  it("SelectTrigger matches", () => {
    render(
      <Select>
        <SelectTrigger aria-label="Currency">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
      </Select>,
    );
    const c = classesOf(screen.getByLabelText("Currency"));
    expect(c).toContain("focus-visible:outline-offset-0");
    expect(c).not.toContain("focus-visible:outline-offset-2");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run components/ui/focus-ring.test.tsx`
Expected: FAIL on `outline-offset-0`.

- [ ] **Step 3: Change the three class strings**

In each of `input.tsx`, `select.tsx` (the `SelectTrigger`) and `textarea.tsx`, replace `focus-visible:outline-offset-2` with `focus-visible:outline-offset-0` in the focus-visible class string. Nothing else changes. Add one comment above the Input's string:

```tsx
        // Offset 0, not 2: with the 2px lift a 3px ring at offset 2 reached
        // 5px past the box and over the label 6px above it (Feedback
        // cmumcjr3i000304l08xwwegwg). The lift and shadow are the focus cue;
        // the ring now hugs the border.
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run components/ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/input.tsx components/ui/select.tsx components/ui/textarea.tsx components/ui/focus-ring.test.tsx
git commit -m "fix(ui): focus ring hugs the field instead of covering the label

Resolves-Feedback: cmumcjr3i000304l08xwwegwg

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 3: Trips carousel has no vertical scroll

**Files:**
- Modify: `components/trips/trip-carousel.tsx:106-128` (CarouselTrack), `app/(app)/trips/page.tsx:54`
- Test: `components/trips/trip-carousel.test.tsx` (add a test)

**Interfaces:**
- Produces: `export const CAROUSEL_TRACK_HEIGHT_CLASS = "h-[256px] md:h-[286px]"` from `trip-carousel.tsx`.

Why: the page gives the track `h-[250px] md:h-[280px]`, exactly the card height, and the track has `pb-1.5` (6px). Border-box sizing leaves 274px for a 280px card, and `overflow-x: auto` turns `overflow-y` from visible into auto, so the track scrolls vertically by a few pixels. Cards also carry `shadow-hard-3` (5px). Fix: the track is card height plus its padding (6px ≥ 5px shadow), and clips vertical overflow explicitly.

- [ ] **Step 1: Write the failing test**

Append to `components/trips/trip-carousel.test.tsx` (look at its existing imports and render helper first; reuse them):

```tsx
describe("CarouselTrack height (Feedback cmumcg1u9000004l0rjio27w6)", () => {
  it("clips vertical overflow and is 6px taller than the cards so the shadow fits", () => {
    render(
      <TripCarousel>
        <CarouselTrack className={CAROUSEL_TRACK_HEIGHT_CLASS}>
          <div className="h-[250px] w-[220px] shrink-0 snap-start md:h-[280px]" />
        </CarouselTrack>
      </TripCarousel>,
    );
    const track = screen.getByRole("region", { name: "Your trips" });
    const c = track.className.split(/\s+/);
    expect(c).toContain("overflow-y-hidden");
    expect(c).toContain("pb-1.5");
    expect(c).toContain("h-[256px]");
    expect(c).toContain("md:h-[286px]");
    expect(c).not.toContain("h-[250px]");
  });
});
```

Import `CAROUSEL_TRACK_HEIGHT_CLASS` alongside the existing imports from `./trip-carousel`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run components/trips/trip-carousel.test.tsx`
Expected: FAIL (`CAROUSEL_TRACK_HEIGHT_CLASS` is not exported).

- [ ] **Step 3: Implement**

In `trip-carousel.tsx`, above `CarouselTrack`:

```tsx
/**
 * Card height (250 / 280) plus the track's 6px bottom padding, which is where
 * the cards' 5px hard shadow lands. The track used to be exactly card height
 * with padding inside it, so `overflow-x: auto` (which forces overflow-y to
 * auto too) produced a 6px vertical scroll (Feedback cmumcg1u9000004l0rjio27w6).
 */
export const CAROUSEL_TRACK_HEIGHT_CLASS = "h-[256px] md:h-[286px]";
```

In `CarouselTrack`'s class string change `"flex snap-x snap-mandatory gap-[18px] overflow-x-auto pb-1.5 …"` to `"flex snap-x snap-mandatory gap-[18px] overflow-x-auto overflow-y-hidden pb-1.5 …"`.

In `app/(app)/trips/page.tsx` line 54 replace `className="h-[250px] gap-3 md:h-[280px] md:gap-[18px]"` with `className={cn(CAROUSEL_TRACK_HEIGHT_CLASS, "gap-3 md:gap-[18px]")}` and import the constant from `@/components/trips/trip-carousel` (`cn` is already imported there).

- [ ] **Step 4: Run tests**

Run: `npx vitest run components/trips app/\(app\)/trips/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/trips/trip-carousel.tsx components/trips/trip-carousel.test.tsx "app/(app)/trips/page.tsx"
git commit -m "fix(trips): carousel track fits its cards, no vertical scroll

Resolves-Feedback: cmumcg1u9000004l0rjio27w6

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 4: Globe map does not wrap the world

**Files:**
- Modify: `components/globe/globe-map.tsx:101-112`
- Test: `components/globe/globe-map.test.tsx` (add a describe)

**Interfaces:** none. Mirror `components/trips/travel-map.tsx:106-122` exactly.

- [ ] **Step 1: Write the failing test**

Append to `components/globe/globe-map.test.tsx` (it already has `hoisted`, `globeElement()` and the `beforeEach` that re-mocks leaflet):

```tsx
describe("GlobeMap bounded world (Feedback cmumcnbmn000004l7h5efbdl0)", () => {
  it("bounds the map so North America cannot appear twice", async () => {
    render(globeElement());
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.maps[0].options).toMatchObject({
      worldCopyJump: false,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1,
      minZoom: 1,
    });
  });

  it("sets noWrap on the tile layer", async () => {
    render(globeElement());
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.tileLayers[0].options).toMatchObject({ noWrap: true });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run components/globe/globe-map.test.tsx`
Expected: FAIL (worldCopyJump is true, no maxBounds).

- [ ] **Step 3: Implement**

In `globe-map.tsx` replace the `L.map(...)` call and tile layer options:

```ts
      // Bounded to one world, like the Travel map and the route map: without
      // maxBounds/noWrap a zoomed-out wide viewport repeats the tiles and
      // North America shows twice (Feedback cmumcnbmn000004l7h5efbdl0).
      const map = L.map(mapRef.current, {
        zoomControl: true,
        worldCopyJump: false,
        maxBounds: [
          [-85, -180],
          [85, 180],
        ],
        maxBoundsViscosity: 1,
        minZoom: 1,
      });
```

and add `noWrap: true` to the `L.tileLayer(tiles.url, { … })` options. Leave `fitBounds` / `setView([20, 0], 2)` as they are (zoom 2 ≥ minZoom 1).

- [ ] **Step 4: Run tests**

Run: `npx vitest run components/globe`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/globe/globe-map.tsx components/globe/globe-map.test.tsx
git commit -m "fix(globe): bound the map to one world

Same maxBounds, viscosity, minZoom and noWrap as the Travel map and route map.

Resolves-Feedback: cmumcnbmn000004l7h5efbdl0

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 5: Edit-item photo section is centred

**Files:**
- Modify: `components/trip/item-form-dialog.tsx:263-316` (`ItemPhotoField` dropzone)
- Test: `components/trip/item-form-dialog.test.tsx` (add one test near line 1132, which already queries `[data-slot="item-photo-dropzone"]`)

**Interfaces:** none.

- [ ] **Step 1: Write the failing test**

Find the existing test around line 1132 that renders the dialog and queries `[data-slot="item-photo-dropzone"]`; copy its render setup into a new `it` in the same describe:

```tsx
    it("centres the dropzone's thumbnail, buttons and hint (Feedback cmumcvsu8000004jkjtit9tvs)", async () => {
      // <same render/open steps as the sibling test that finds the dropzone>
      const el = document.querySelector('[data-slot="item-photo-dropzone"]')!;
      const c = el.className.split(/\s+/);
      expect(c).toContain("justify-center");
      expect(c).toContain("text-center");
      const buttons = el.querySelector("[data-slot='item-photo-buttons']")!;
      expect(buttons.className.split(/\s+/)).toContain("items-center");
    });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run components/trip/item-form-dialog.test.tsx -t "centres the dropzone"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `ItemPhotoField`'s returned JSX:
- root `className`: `"flex flex-wrap items-center justify-center gap-3 rounded-md border-2 border-dashed p-2.5 text-center transition-colors motion-reduce:transition-none"` (added `justify-center` and `text-center`).
- the inner `<div className="flex flex-col items-start gap-1.5">` becomes `<div data-slot="item-photo-buttons" className="flex flex-col items-center gap-1.5">`.
- the `<p className="text-xs font-semibold text-muted-foreground">` gains `basis-full` so the hint sits on its own centred line under the controls: `"basis-full text-xs font-semibold text-muted-foreground"`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run components/trip/item-form-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/trip/item-form-dialog.tsx components/trip/item-form-dialog.test.tsx
git commit -m "fix(plan): centre the photo section in the edit-item dialog

Resolves-Feedback: cmumcvsu8000004jkjtit9tvs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 6: "Sort these out" shows six rows on desktop

**Files:**
- Modify: `lib/sort-these-out.ts:46,84-106`, `app/(app)/trips/[tripId]/page.tsx:376-381`, `components/trip/home/desktop/sort-these-out-tile.tsx:71-75` (doc comment)
- Test: `lib/sort-these-out.test.ts`

**Interfaces:**
- Produces: `sortTheseOut({ steps, reminders, today, basePath, limit? })` — `limit` defaults to `SORT_ROW_LIMIT` (4); new `export const SORT_ROW_LIMIT_DESKTOP = 6`.

- [ ] **Step 1: Write the failing test**

Append to `lib/sort-these-out.test.ts` inside `describe("sortTheseOut")`, reusing its `step`/`reminder` helpers and `BASE`:

```ts
  it("caps rows at the default 4, or at the limit given (desktop tile uses 6)", () => {
    const steps = Array.from({ length: 8 }, (_, i) => step(`nudge-${i}`, `Thing ${i}`));
    expect(sortTheseOut({ basePath: BASE, today, steps, reminders: [] }).rows).toHaveLength(4);
    expect(sortTheseOut({ basePath: BASE, today, steps, reminders: [], limit: SORT_ROW_LIMIT_DESKTOP }).rows).toHaveLength(6);
    expect(SORT_ROW_LIMIT_DESKTOP).toBe(6);
  });
```

Import `SORT_ROW_LIMIT_DESKTOP` from `./sort-these-out`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/sort-these-out.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `lib/sort-these-out.ts`:

```ts
export const SORT_ROW_LIMIT = 4;
/**
 * The desktop Home tile stretches to the route map's height, and four ~60px
 * rows left a gap above "See all" at 1000px+ viewports (Feedback
 * cmumcpixx000204l7pjg6h945). Six fills it without becoming a wall on a laptop.
 */
export const SORT_ROW_LIMIT_DESKTOP = 6;
```

Add `limit?: number;` to `SortTheseOutInput` (doc: "Rows to keep; default SORT_ROW_LIMIT."), destructure `limit = SORT_ROW_LIMIT` in `sortTheseOut`, and return `all.slice(0, limit)`.

In `page.tsx` add `limit: SORT_ROW_LIMIT_DESKTOP,` to the `sortTheseOut({...})` call and import it. Update the tile's doc comment "up to 4 rows" → "up to 6 rows (SORT_ROW_LIMIT_DESKTOP)".

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/sort-these-out.test.ts components/trip/home/desktop/sort-these-out-tile.test.tsx lib/trips`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sort-these-out.ts lib/sort-these-out.test.ts "app/(app)/trips/[tripId]/page.tsx" components/trip/home/desktop/sort-these-out-tile.tsx
git commit -m "feat(home): six Sort-these-out rows on desktop

Resolves-Feedback: cmumcpixx000204l7pjg6h945

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 7: Remove the "Hey Cam" greeting from the trips list

**Files:**
- Modify: `components/trips/trips-header.tsx:17-19`, `app/(app)/trips/loading.tsx` (the greeting skeleton line)
- Test: `components/trips/trips-header.test.tsx` (create)

**Interfaces:** `TripsHeader` keeps its `firstName` prop (the first-run welcome still uses it).

- [ ] **Step 1: Write the failing test**

```tsx
// components/trips/trips-header.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripsHeader } from "./trips-header";

vi.mock("@/components/trips/trip-carousel", () => ({ CarouselArrows: () => <div data-testid="arrows" /> }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a> }));

describe("TripsHeader greeting (Feedback cmumchfzu000104l0cv755cz8)", () => {
  it("shows no greeting line on a normal visit — the heading is the page", () => {
    render(<TripsHeader firstName="Cam" metaLine="2 trips" firstRun={false} />);
    expect(screen.queryByText(/Hey Cam/)).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Your trips" })).toBeInTheDocument();
  });

  it("keeps the first-run welcome, which has a job to do", () => {
    render(<TripsHeader firstName="Cam" metaLine="" firstRun />);
    expect(screen.getByText("Welcome to teepee, Cam")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run components/trips/trips-header.test.tsx`
Expected: FAIL (Hey Cam is rendered).

- [ ] **Step 3: Implement**

In `trips-header.tsx` replace the `<p>` greeting with:

```tsx
        {firstRun ? (
          <p className="text-sm font-medium text-muted-foreground md:text-[15px]">Welcome to teepee, {firstName}</p>
        ) : null}
```

and change `mt-0.5` on the h1 to `className={cn(firstRun && "mt-0.5", "font-display …")}` — or simply keep `mt-0.5` only when firstRun by rendering the h1 class as `${firstRun ? "mt-0.5 " : ""}font-display …`. Import `cn` from `@/lib/cn` if you use it.

In `app/(app)/trips/loading.tsx` remove the first `<Skeleton className="h-3.5 w-28" />` (the greeting placeholder) so the skeleton matches the page.

- [ ] **Step 4: Run tests**

Run: `npx vitest run components/trips app/\(app\)/trips`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/trips/trips-header.tsx components/trips/trips-header.test.tsx "app/(app)/trips/loading.tsx"
git commit -m "fix(trips): drop the greeting line above Your trips

Resolves-Feedback: cmumchfzu000104l0cv755cz8

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 8: Trip cards carry their Trip colour

**Files:**
- Modify: `components/trips/cover-stamp.tsx:44`, `components/trips/cover-route-sketch.tsx:31`, `components/trips/trip-card.tsx:49-60`
- Test: `components/trips/cover-stamp.test.tsx`, `components/trips/cover-route-sketch.test.tsx`, `components/trips/trip-card.test.tsx`

**Interfaces:** uses `HUE_CLASSES[hue].soft` and `.fill` from `lib/hues.ts`. `TripCardModel.cover.hue` is already a `Hue`.

- [ ] **Step 1: Write the failing tests**

In `cover-stamp.test.tsx`, inside `describe("CoverStamp")`:

```tsx
  it("sits on a soft wash of the Trip colour, not the bare card (Feedback cmumchso1000204l0s15n8asx)", () => {
    const { container } = render(<CoverStamp name="New Zealand" place="NZ" startDate={null} hue="teal" size="small" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className.split(/\s+/)).toContain("bg-hue-teal/25");
    expect(root.className.split(/\s+/)).not.toContain("bg-background");
  });
```

In `cover-route-sketch.test.tsx` (look at how it builds a `model`; reuse):

```tsx
  it("grounds the sketch in a soft wash of the Trip colour", () => {
    const { container } = render(<CoverRouteSketch model={model} size="small" hue="leaf" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className.split(/\s+/)).toContain("bg-hue-leaf/25");
  });
```

In `trip-card.test.tsx`, inside `describe("TripCard")`:

```tsx
  it("shows a slim Trip-colour strip on phones, where the cover is hidden", () => {
    const { container } = render(<TripCard model={{ ...hero, id: "t2", kind: "planning", name: "New Zealand", index: 1, cover: { ...cover, hue: "teal" } }} />);
    const strip = container.querySelector("[data-trip-colour-strip]") as HTMLElement;
    expect(strip).not.toBeNull();
    const c = strip.className.split(/\s+/);
    expect(c).toContain("bg-hue-teal");
    expect(c).toContain("md:hidden");
    expect(strip).toHaveAttribute("aria-hidden", "true");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run components/trips/cover-stamp.test.tsx components/trips/cover-route-sketch.test.tsx components/trips/trip-card.test.tsx`
Expected: three FAILs.

- [ ] **Step 3: Implement**

`cover-stamp.tsx`: import `HUE_CLASSES` from `@/lib/hues`; the root becomes
```tsx
    <div aria-hidden="true" className={cn("flex size-full items-center justify-center", HUE_CLASSES[hue].soft)}>
```
(update the docblock: "soft wash of the Trip colour behind the ink, so a card with no photo is never white-on-white — Feedback cmumchso1000204l0s15n8asx").

`cover-route-sketch.tsx`: import `HUE_CLASSES`; root `className={cn("relative size-full", HUE_CLASSES[hue].soft)}` replacing `bg-map-fill`. Keep the grid overlay.

`trip-card.tsx`: import `HUE_CLASSES` from `@/lib/hues`; inside the `<article>`, first child after `<StretchedLink>`:
```tsx
      {/* Phones hide the small cover, so the Trip colour would otherwise never
          reach the card there (Feedback cmumchso1000204l0s15n8asx). */}
      <span
        data-trip-colour-strip
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-x-0 top-0 h-1.5 md:hidden", HUE_CLASSES[model.cover.hue].fill)}
      />
```
The article already has `overflow-hidden` and a radius, so the strip follows the corners.

- [ ] **Step 4: Run tests**

Run: `npx vitest run components/trips`
Expected: PASS. If `trip-cover.test.tsx` asserted `bg-background`/`bg-map-fill`, update those assertions to the soft class.

- [ ] **Step 5: Commit**

```bash
git add components/trips/cover-stamp.tsx components/trips/cover-route-sketch.tsx components/trips/trip-card.tsx components/trips/*.test.tsx
git commit -m "feat(trips): generated covers sit on a Trip-colour wash; phone cards get a colour strip

Resolves-Feedback: cmumchso1000204l0s15n8asx

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 9: Account page — profile column on desktop

**Files:**
- Modify: `app/(app)/account/page.tsx:66-109`
- Test: `app/(app)/account/page.test.tsx`

**Interfaces:** none.

- [ ] **Step 1: Write the failing test**

Append to the existing describe in `page.test.tsx` (it already renders the page with mocks):

```tsx
  it("lays out You as a narrower left column with Devices and Digests stacked on the right from lg (Feedback cmumcobiy000104l71fkyacxo)", async () => {
    const { container } = await renderPage(); // use this file's existing render helper name
    const grid = container.querySelector("[data-account-grid]") as HTMLElement;
    expect(grid.className.split(/\s+/)).toEqual(expect.arrayContaining(["grid", "grid-cols-1", "lg:grid-cols-[minmax(0,22rem)_1fr]", "lg:items-start"]));
    const you = container.querySelector('[aria-labelledby="account-you"]')!;
    const right = container.querySelector("[data-account-right]")!;
    expect(grid.contains(you)).toBe(true);
    expect(grid.contains(right)).toBe(true);
    expect(right.querySelector('[aria-labelledby="account-devices"]')).not.toBeNull();
    expect(right.querySelector('[aria-labelledby="account-digests"]')).not.toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run app/\(app\)/account/page.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Replace the You card and the two-column grid in `page.tsx` with:

```tsx
      {/* Desktop: who you are on the left, what's true of you across Trips on
          the right (Feedback cmumcobiy000104l71fkyacxo — the You card used to
          run the full page width). Phones stack, You first. */}
      <div data-account-grid className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start lg:gap-[18px]">
        <Card role="region" aria-labelledby="account-you" className="p-[18px]">
          <CardTitle id="account-you">You</CardTitle>
          <div className="mt-3.5">
            <ProfileCard user={profileUser} />
          </div>
        </Card>

        <div data-account-right className="flex flex-col gap-3 lg:gap-[18px]">
          <Card role="region" aria-labelledby="account-devices" className="p-[18px]">
            …(unchanged Devices card body)…
          </Card>
          <Card role="region" aria-labelledby="account-digests" className="p-[18px]">
            …(unchanged Digests card body)…
          </Card>
        </div>
      </div>
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/\(app\)/account`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/account/page.tsx" "app/(app)/account/page.test.tsx"
git commit -m "fix(account): profile column beside Devices and Digests on desktop

Resolves-Feedback: cmumcobiy000104l71fkyacxo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 10: Trip home stats inside the countdown tile

**Files:**
- Create: `lib/home-stats.ts`, `lib/home-stats.test.ts`
- Modify: `components/trip/home/desktop/countdown-tile.tsx`, `components/trip/home/desktop/home-header.tsx:14-33`, `app/(app)/trips/[tripId]/page.tsx:288-303,385-395`
- Test: `components/trip/home/desktop/countdown-tile.test.tsx`, `components/trip/home/desktop/home-header.test.tsx`

**Interfaces:**
- Produces: `export interface HomeStat { label: string; value: string }` and `export function homeStats(i: { startDate: string | null; endDate: string | null; stops: { countryCode: string | null }[]; chaptersEnabled: boolean; chapterCount: number }): HomeStat[]` in `lib/home-stats.ts`.
- `CountdownTile` gains `stats?: HomeStat[]` (rendered between the chip and the number; nothing when empty).
- `homeMetaLine` drops nights and stops: returns `"4 Dec 2026 – 8 Jan 2027 · AUD"`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/home-stats.test.ts
import { describe, expect, it } from "vitest";
import { homeStats } from "./home-stats";

const stops = (codes: (string | null)[]) => codes.map((countryCode) => ({ countryCode }));

describe("homeStats (Feedback cmumctx4r000504l7lkixq9us)", () => {
  it("gives nights, Stops, countries and Chapters when the toggle is on", () => {
    expect(
      homeStats({ startDate: "2026-12-04", endDate: "2027-01-08", stops: stops(["FR", "IT", "IT", null]), chaptersEnabled: true, chapterCount: 3 }),
    ).toEqual([
      { label: "Nights", value: "35" },
      { label: "Stops", value: "4" },
      { label: "Countries", value: "2" },
      { label: "Chapters", value: "3" },
    ]);
  });

  it("singularises", () => {
    expect(homeStats({ startDate: "2026-12-04", endDate: "2026-12-05", stops: stops(["FR"]), chaptersEnabled: true, chapterCount: 1 }).map((s) => s.label)).toEqual([
      "Night", "Stop", "Country", "Chapter",
    ]);
  });

  it("omits Chapters when the toggle is off, and countries when none are located", () => {
    const out = homeStats({ startDate: "2026-12-04", endDate: "2027-01-08", stops: stops([null, null]), chaptersEnabled: false, chapterCount: 2 });
    expect(out.map((s) => s.label)).toEqual(["Nights", "Stops"]);
  });

  it("is empty for a date-less Trip with no Stops — the row must not render", () => {
    expect(homeStats({ startDate: null, endDate: null, stops: [], chaptersEnabled: false, chapterCount: 0 })).toEqual([]);
  });
});
```

In `countdown-tile.test.tsx` add:

```tsx
  it("shows the stat tiles between the chip and the number, and nothing when there are none", () => {
    const { rerender } = renderTile({ stats: [{ label: "Nights", value: "35" }, { label: "Stops", value: "11" }] });
    const row = screen.getByRole("list", { name: "Trip at a glance" });
    expect(within(row).getAllByRole("listitem")).toHaveLength(2);
    expect(within(row).getByText("35")).toBeInTheDocument();
    expect(within(row).getByText("Nights")).toBeInTheDocument();
    rerender(<CountdownTile href="/trips/trip-1/plan" status="PLANNING" countdown={{ kind: "sleeps", n: 68, unit: "sleeps" }} firstLeg={null} cover={null} tripId="trip-1" stats={[]} />);
    expect(screen.queryByRole("list", { name: "Trip at a glance" })).toBeNull();
  });
```

In `home-header.test.tsx` change the `homeMetaLine` expectations: `"4 Dec 2026 – 8 Jan 2027 · AUD"` for the first case, `"EUR"` for the date-less cases (stop count no longer matters), and the rendered header string likewise. Keep `stopCount` in the input type for now (the function ignores it) or remove it from both — remove it: the signature becomes `{ startDate, endDate, currency }`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/home-stats.test.ts components/trip/home/desktop/countdown-tile.test.tsx components/trip/home/desktop/home-header.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/home-stats.ts`**

```ts
import { nightsBetween } from "@/lib/dates";

export interface HomeStat {
  label: string;
  value: string;
}

/**
 * The desktop Home countdown tile's "at a glance" row (Feedback
 * cmumctx4r000504l7lkixq9us): the shape of the plan, never money or progress.
 * Every stat is omitted rather than shown as 0, so a Trip that is still an
 * idea gets an empty array and no row. Pure.
 */
export function homeStats(i: {
  startDate: string | null;
  endDate: string | null;
  stops: { countryCode: string | null }[];
  chaptersEnabled: boolean;
  chapterCount: number;
}): HomeStat[] {
  const out: HomeStat[] = [];
  const one = (n: number, s: string, p: string) => ({ label: n === 1 ? s : p, value: String(n) });
  if (i.startDate && i.endDate) {
    const nights = nightsBetween(i.startDate, i.endDate);
    if (nights > 0) out.push(one(nights, "Night", "Nights"));
  }
  if (i.stops.length > 0) out.push(one(i.stops.length, "Stop", "Stops"));
  const countries = new Set(i.stops.map((s) => s.countryCode).filter((c): c is string => !!c)).size;
  if (countries > 0) out.push(one(countries, "Country", "Countries"));
  if (i.chaptersEnabled && i.chapterCount > 0) out.push(one(i.chapterCount, "Chapter", "Chapters"));
  return out;
}
```

- [ ] **Step 4: Implement the tile and header**

`countdown-tile.tsx`: add `stats?: HomeStat[];` to the props (import the type from `@/lib/home-stats`), and build

```tsx
  const statsRow =
    stats && stats.length > 0 ? (
      <ul aria-label="Trip at a glance" className={cn("flex flex-wrap gap-2", hasPhoto ? "mt-5" : "mt-4")}>
        {stats.map((s) => (
          <li key={s.label} className="island flex min-w-[72px] flex-col rounded-[14px] border-2 border-border bg-card px-3 py-2 text-foreground">
            <span className="font-display text-[22px] font-extrabold leading-none tracking-[-0.03em]">{s.value}</span>
            <span className="text-label mt-1">{s.label}</span>
          </li>
        ))}
      </ul>
    ) : null;
```

Render `{statsRow}` directly after `{chip}` in both branches (with-photo: inside the left column right after `{chip}`; no-photo: after the `<div className="flex items-start justify-between gap-3">…</div>` row). Update the docblock's last sentence: "Dates and currency live only in the page header; nights, Stops, countries and Chapters are the at-a-glance row here."

`home-header.tsx`: `homeMetaLine({ startDate, endDate, currency })` → parts are the date range (no nights) and the currency. Update its docblock to `"4 Dec 2026 – 8 Jan 2027 · AUD"`.

`page.tsx`: remove `stopCount` from the `homeMetaLine` call (and the `header(...)` helper's first parameter if it becomes unused — keep the helper signature minimal). In the Planning branch pass

```tsx
            stats={homeStats({
              startDate: trip.startDate,
              endDate: trip.endDate,
              stops: planStops,
              chaptersEnabled: trip.chaptersEnabled,
              chapterCount: planning.datedChapters.length,
            })}
```

to `<CountdownTile>`; import `homeStats`. (`planStops` is `HomePlanStop[]` with `countryCode`; `trip.chaptersEnabled` is already selected on line 79.)

- [ ] **Step 5: Run tests and types**

Run: `npx vitest run lib/home-stats.test.ts components/trip/home/desktop app/\(app\)/trips/\[tripId\] && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/home-stats.ts lib/home-stats.test.ts components/trip/home/desktop/countdown-tile.tsx components/trip/home/desktop/countdown-tile.test.tsx components/trip/home/desktop/home-header.tsx components/trip/home/desktop/home-header.test.tsx "app/(app)/trips/[tripId]/page.tsx"
git commit -m "feat(home): at-a-glance stats fill the countdown tile on desktop

Nights, Stops, countries and Chapters (when on) sit between the status chip
and the big number; the header meta line keeps dates and currency only.

Resolves-Feedback: cmumctx4r000504l7lkixq9us

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 11: Profile photo focus point

**Files:**
- Create: `prisma/migrations/20260929120000_user_photo_focal/migration.sql`, `components/account/profile-photo-focal.tsx`
- Modify: `prisma/schema.prisma:41-51` (User), `lib/traveller.ts`, `components/ui/avatar.tsx`, `components/ui/traveller-avatar.tsx`, `server/actions/profile.ts`, `components/account/profile-card.tsx`
- Delete: `lib/crop-square.ts` (its only caller goes away; grep confirms)
- Test: `components/ui/traveller-avatar.test.tsx`, `components/account/profile-card.test.tsx`, `server/actions/profile.test.ts` (create if absent; mock `@/lib/db`, `@/lib/guards`, `next/cache`)

**Interfaces:**
- `TravellerLike` gains `photoFocalX?: number | null; photoFocalY?: number | null;` and `TRAVELLER_SELECT` selects both.
- New `export function travellerImagePosition(u: TravellerLike): string` → `"50% 50%"` when unset, else `"${x*100}% ${y*100}%"`.
- `AvatarImage` accepts `style` (already, via props spread) — `TravellerAvatar` passes `style={{ objectPosition }}`.
- New server action `setProfilePhotoFocal(x: number, y: number): Promise<ActionResult>`; `setProfilePhoto` resets the focal to null (a new picture starts centred); `removeProfilePhoto` clears it.
- `ProfilePhotoFocal` client component: shows the whole photo (`/api/avatars/<id>?v=…`) at its own aspect with a draggable/clickable marker, calls `setProfilePhotoFocal`, optimistic marker like `CoverImageField.onPickFocal`.

- [ ] **Step 1: Migration (additive, nullable — safe for the running old build, docs/DEPLOY.md §4b)**

```sql
-- Profile photo focus point (CONTEXT.md "Profile photo": the spot the
-- Traveller chose to sit at the centre of every avatar circle). Nullable and
-- additive: NULL means "centre", which is exactly how every existing photo —
-- already centre-cropped before upload — renders today.
ALTER TABLE "User" ADD COLUMN "photoFocalX" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "photoFocalY" DOUBLE PRECISION;
```

In `schema.prisma` after `photoUpdatedAt`:

```prisma
  /// Focus point of the uploaded Profile photo, 0–1 across and down, chosen
  /// on Account (CONTEXT.md "Profile photo"). NULL = centre. Mirrors
  /// Trip.coverFocalX/Y; rendered via object-position, never by cropping.
  photoFocalX Float?
  photoFocalY Float?
```

Run `npx prisma generate` (do NOT run `prisma migrate` — there is no local database in this sandbox; the migration runs on deploy).

- [ ] **Step 2: Failing tests — avatar rendering**

```tsx
// components/ui/traveller-avatar.test.tsx — add
  it("centres a photo with no focus point exactly as before (50% 50%)", () => {
    render(<TravellerAvatar traveller={{ id: "u1", name: "Cam", image: null, photoKey: "k", photoUpdatedAt: new Date(0) }} />);
    // Radix renders the <img> only once it loads; assert through the helper instead.
    expect(travellerImagePosition({ id: "u1", name: "Cam", image: null })).toBe("50% 50%");
  });
  it("puts the chosen focus point at the circle's centre", () => {
    expect(travellerImagePosition({ id: "u1", name: "Cam", image: null, photoFocalX: 0.25, photoFocalY: 0.8 })).toBe("25% 80%");
  });
```
Import `travellerImagePosition` from `@/lib/traveller`. Then read `traveller-avatar.tsx` and pass `style={{ objectPosition: travellerImagePosition(traveller) }}` to `<AvatarImage>`.

- [ ] **Step 3: Failing tests — server action**

```ts
// server/actions/profile.test.ts (create; follow the mocking style of an existing server/actions/*.test.ts)
describe("setProfilePhotoFocal", () => {
  it("clamps to 0–1 and stores both", async () => { /* update called with { photoFocalX: 1, photoFocalY: 0 } for (1.7, -0.2) */ });
  it("refuses a non-number", async () => { /* result.success false; db.user.update not called */ });
});
describe("setProfilePhoto", () => {
  it("does not crop: saves the file bytes as given and resets the focal point to null", async () => { /* update data includes photoFocalX: null, photoFocalY: null */ });
});
```

Implement in `profile.ts`:

```ts
function clampUnit(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Where the Profile photo's circle centres (CONTEXT.md "focus point"): x and
 * y are fractions 0–1 across and down the uploaded picture. The picture is
 * never altered — only framed. Mirrors setCoverFocal in cover.ts.
 */
export async function setProfilePhotoFocal(x: number, y: number): Promise<ActionResult> {
  const user = await requireUser();
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return fail({ _form: ["That point isn't on the photo."] });
  }
  await db.user.update({
    where: { id: user.id },
    data: { photoFocalX: clampUnit(x), photoFocalY: clampUnit(y) },
  });
  revalidatePath("/", "layout");
  return ok();
}
```

In `setProfilePhoto`'s final update add `photoFocalX: null, photoFocalY: null` (new picture, centred until repositioned); in `removeProfilePhoto` add the same nulls. Update the module comment: uploads are no longer cropped; the original (compressed) picture is kept so it can be reframed later.

- [ ] **Step 4: Failing tests — profile card**

In `profile-card.test.tsx` extend the `vi.mock("@/server/actions/profile", …)` with `setProfilePhotoFocal: vi.fn(async () => ({ success: true }))`, then add:

```tsx
  it("offers Reposition when there is a photo, opening the focus picker; none without a photo", async () => {
    const { rerender } = render(<ProfileCard user={{ ...base, photoKey: "k", photoUpdatedAt: new Date(0) }} />);
    await userEvent.click(screen.getByRole("button", { name: "Reposition" }));
    expect(screen.getByRole("button", { name: "Choose the part of your photo to keep in view" })).toBeInTheDocument();
    rerender(<ProfileCard user={{ ...base, photoKey: null }} />);
    expect(screen.queryByRole("button", { name: "Reposition" })).toBeNull();
  });

  it("uploads the compressed picture as-is (no square crop) so it can be reframed later", async () => {
    // spy on compressImage (vi.mock("@/lib/image-compress")) → returns a File named "orig.jpg";
    // choose a file; assert setProfilePhoto's FormData "file" is that same File object.
  });
```

- [ ] **Step 5: Implement the picker and the card**

`components/account/profile-photo-focal.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setProfilePhotoFocal } from "@/server/actions/profile";
import { toast } from "@/components/ui/use-toast";

export interface ProfilePhotoFocalProps {
  /** The served photo — travellerImageUrl(user). */
  src: string;
  focalX: number | null;
  focalY: number | null;
}

/**
 * Focus-point picker for the Profile photo (CONTEXT.md "focus point";
 * Feedback cmumd56py000004kygdjtwl7s). The whole picture is shown at its own
 * aspect so a click or drag position in the preview IS its position in the
 * photo — the same model as CoverImageField.onPickFocal. A circle overlay
 * previews the avatar crop around the marker.
 */
export function ProfilePhotoFocal({ src, focalX, focalY }: ProfilePhotoFocalProps) {
  const router = useRouter();
  const [focal, setFocal] = React.useState({ x: focalX ?? 0.5, y: focalY ?? 0.5 });
  const [pending, startTransition] = React.useTransition();
  const dragging = React.useRef(false);

  function pointToFocal(e: React.PointerEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    return { x: clamp((e.clientX - rect.left) / rect.width), y: clamp((e.clientY - rect.top) / rect.height) };
  }

  function commit(p: { x: number; y: number }) {
    setFocal(p);
    startTransition(async () => {
      const r = await setProfilePhotoFocal(p.x, p.y);
      if (!r.success) toast({ variant: "destructive", title: "Couldn't save that — please try again." });
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-muted-foreground">Drag or tap the part of your photo to keep in view.</p>
      <button
        type="button"
        aria-label="Choose the part of your photo to keep in view"
        disabled={pending}
        onPointerDown={(e) => { dragging.current = true; const p = pointToFocal(e); if (p) setFocal(p); }}
        onPointerMove={(e) => { if (!dragging.current) return; const p = pointToFocal(e); if (p) setFocal(p); }}
        onPointerUp={(e) => { dragging.current = false; const p = pointToFocal(e); if (p) commit(p); }}
        onPointerLeave={() => { dragging.current = false; }}
        className="relative block w-full max-w-xs cursor-crosshair touch-none overflow-hidden rounded-md border-2 border-border disabled:cursor-wait"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- member-gated dynamic blob */}
        <img src={src} alt="" draggable={false} className="block h-auto w-full select-none" />
        <span
          data-testid="profile-focal-marker"
          aria-hidden="true"
          className="pointer-events-none absolute size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-hard-1 [box-shadow:0_0_0_9999px_hsl(var(--foreground)/0.35)]"
          style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
        />
      </button>
    </div>
  );
}
```

`profile-card.tsx`:
- remove the `cropSquare` import and call; upload `compressed` directly. Update the docblock ("no crop: the picture is kept whole and framed by a focus point").
- add state `const [repositioning, setRepositioning] = React.useState(false);`
- beside "Change photo"/"Remove photo" add, when `hasPhoto`:
  ```tsx
  <Button type="button" variant="ghost" size="sm" className={SM_HIT} disabled={uploading} aria-pressed={repositioning} onClick={() => setRepositioning((v) => !v)}>Reposition</Button>
  ```
- under the avatar row, when `hasPhoto && repositioning`: `<ProfilePhotoFocal src={travellerImageUrl(user)!} focalX={user.photoFocalX ?? null} focalY={user.photoFocalY ?? null} />` (import `travellerImageUrl`).
- after a successful upload also `setRepositioning(true)` so the picker opens on the fresh picture, and set `photoFocalX: null, photoFocalY: null` on the optimistic user.

`lib/traveller.ts`: add the two optional fields to `TravellerLike`, add them to `TRAVELLER_SELECT`, and add:

```ts
/** CSS object-position for the Traveller's Profile photo: the chosen focus point, or the centre. */
export function travellerImagePosition(u: TravellerLike): string {
  const x = u.photoFocalX ?? 0.5;
  const y = u.photoFocalY ?? 0.5;
  return `${x * 100}% ${y * 100}%`;
}
```

Delete `lib/crop-square.ts`. Fix the fallback `profileUser` literal in `app/(app)/account/page.tsx` (add `photoFocalX: null, photoFocalY: null`) and any other hand-built `TravellerLike` literals `tsc` complains about (fields are optional, so most need nothing).

- [ ] **Step 6: Run tests and types**

Run: `npx vitest run components/ui/traveller-avatar.test.tsx components/account server/actions/profile.test.ts lib && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260929120000_user_photo_focal lib/traveller.ts components/ui/traveller-avatar.tsx components/ui/traveller-avatar.test.tsx server/actions/profile.ts server/actions/profile.test.ts components/account/profile-card.tsx components/account/profile-card.test.tsx components/account/profile-photo-focal.tsx "app/(app)/account/page.tsx"
git rm lib/crop-square.ts
git commit -m "feat(account): choose the focus point of your Profile photo

Uploads are no longer square-cropped; the whole picture is kept and every
avatar frames it on a chosen focus point (User.photoFocalX/Y, null = centre),
mirroring the Trip cover's focal point.

Resolves-Feedback: cmumd56py000004kygdjtwl7s

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 12: New trip page polish

**Files:**
- Create: `components/trips/cover-dropzone.tsx`, `components/trips/cover-dropzone.test.tsx`
- Modify: `app/(app)/trips/new/page.tsx`, `app/(app)/trips/new/new-trip-form.tsx`
- Test: `app/(app)/trips/new/new-trip-form.test.tsx`, `app/(app)/trips/new/page.test.tsx`

**Interfaces:**
- `CoverDropzone({ name, disabled }: { name: string; disabled?: boolean })` — an uncontrolled file input named `name` inside a dashed dropzone; shows a centred prompt, then a preview thumbnail (object URL) with "Replace" and "Remove" once a file is chosen. Drag-and-drop sets the input's `files` via `DataTransfer` so the form's `FormData` still reads `cover`.
- `NEW_TRIP_FORM_GRID_CLASS` stays exported (tests read it) and stays two columns from `lg`.

Design (spec A): same fields, same single page; one consistent column grid; header aligned with the form; the cover field becomes a dropzone with a preview; centred text.

- [ ] **Step 1: Failing dropzone tests**

```tsx
// components/trips/cover-dropzone.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CoverDropzone } from "./cover-dropzone";

describe("CoverDropzone (Feedback cmumckjjn000404l08xwwegwg)", () => {
  it("renders a centred prompt and a hidden file input named as asked", () => {
    render(<CoverDropzone name="cover" />);
    const zone = screen.getByTestId("cover-dropzone");
    expect(zone.className.split(/\s+/)).toEqual(expect.arrayContaining(["justify-center", "text-center"]));
    const input = screen.getByLabelText("Cover photo") as HTMLInputElement;
    expect(input.name).toBe("cover");
    expect(input.type).toBe("file");
    expect(screen.getByText(/drop a photo here/i)).toBeInTheDocument();
  });

  it("shows a preview with Replace and Remove once a file is chosen, and clears it on Remove", () => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });
    render(<CoverDropzone name="cover" />);
    const input = screen.getByLabelText("Cover photo") as HTMLInputElement;
    const file = new File(["x"], "beach.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByRole("img", { name: "Cover photo preview" })).toHaveAttribute("src", "blob:x");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("img", { name: "Cover photo preview" })).toBeNull();
    expect(input.value).toBe("");
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Implement `cover-dropzone.tsx`**

```tsx
"use client";

import * as React from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SM_HIT } from "@/components/ui/touch-target";
import { cn } from "@/lib/cn";

/**
 * Cover-photo field for New trip (Feedback cmumckjjn000404l08xwwegwg): a
 * dashed dropzone whose prompt is centred, and a preview once a file is
 * chosen. Uncontrolled on purpose — the form reads `FormData.get(name)`
 * exactly as it did from the bare <input type="file">. A drop is written
 * into the input's `files` so the same read works.
 */
export function CoverDropzone({ name, disabled }: { name: string; disabled?: boolean }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);

  React.useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function show(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    show(e.target.files?.[0] ?? null);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !inputRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    inputRef.current.files = dt.files;
    show(file);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    show(null);
  }

  return (
    <div
      data-testid="cover-dropzone"
      data-dragging={dragOver ? "" : undefined}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "flex min-h-40 flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-4 text-center transition-colors motion-reduce:transition-none",
        dragOver ? "border-border bg-muted" : "border-border-soft",
      )}
    >
      <input ref={inputRef} type="file" name={name} accept="image/*" aria-label="Cover photo" className="sr-only" onChange={onChange} disabled={disabled} />
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          <img src={preview} alt="Cover photo preview" className="h-28 w-40 rounded-md border-2 border-border object-cover" />
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" className={SM_HIT} disabled={disabled} onClick={() => inputRef.current?.click()}>Replace</Button>
            <Button type="button" variant="ghost" size="sm" className={SM_HIT} disabled={disabled} onClick={clear}>Remove</Button>
          </div>
        </>
      ) : (
        <>
          <span aria-hidden="true" className="island grid size-12 place-items-center rounded-lg border-2 border-border bg-sun"><ImagePlus className="size-6" /></span>
          <Button type="button" variant="secondary" size="sm" className={SM_HIT} disabled={disabled} onClick={() => inputRef.current?.click()}>Choose a photo</Button>
          <p className="text-xs font-semibold text-muted-foreground">{dragOver ? "Drop to use this photo" : "or drop a photo here — you can change it later in Settings"}</p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Failing form tests**

In `new-trip-form.test.tsx` add (keep every existing test green):

```tsx
  it("uses the cover dropzone, and still submits with no cover chosen", async () => {
    render(<NewTripForm />);
    expect(screen.getByTestId("cover-dropzone")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Trip name/), "Japan");
    fireEvent.submit(screen.getByRole("button", { name: "Create trip" }).closest("form")!);
    await waitFor(() => expect(createTripMock).toHaveBeenCalled());
    expect(createTripMock.mock.calls[0][1]).toBeNull(); // cover
  });

  it("keeps one column grid below lg and two from lg, with the actions row spanning both", () => {
    expect(NEW_TRIP_FORM_GRID_CLASS).toContain("grid-cols-1");
    expect(NEW_TRIP_FORM_GRID_CLASS).toContain("lg:grid-cols-2");
  });
```

(`createTripMock` is whatever this file already calls its mock of `@/server/actions/trips`.)

- [ ] **Step 4: Implement the form and page layout**

`new-trip-form.tsx`:
- Replace `<Input type="file" name="cover" accept="image/*" disabled={isPending} />` with `<CoverDropzone name="cover" disabled={isPending} />`; the Field's `description` becomes `"Optional. Shown on your trips list and the trip's home."`.
- Alignment: give every column group the same vertical rhythm. Change `NEW_TRIP_FORM_GRID_CLASS` to `"grid grid-cols-1 gap-6 lg:grid-cols-2 lg:grid-rows-[auto_1fr_auto] lg:gap-x-10 lg:gap-y-6"`; the Dates block's inner `grid gap-4 sm:grid-cols-2` becomes `grid gap-6 sm:grid-cols-2` so date inputs line up with the currency row beside them; the Dates block's heading row uses `<span className="text-sm font-bold text-foreground">` to match `Field`'s label weight (check `field.tsx`'s label class and copy it exactly).
- Guard the cover read: `const rawCover = coverFile && coverFile.size > 0 && coverFile.type.startsWith("image/") ? coverFile : null;` and wrap `compressImage` in try/catch falling back to `rawCover` (a rejected file never throws out of the submit).
- Actions row: `"flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end lg:col-span-2 lg:row-start-4"` so on phones Create trip is full-width on top and Cancel below (add `className="w-full sm:w-auto"` to both buttons).

`page.tsx`: the wrapper becomes `"mx-auto w-full max-w-[64rem] space-y-8 px-0"`; the header gets the same left edge as the form (it already does — both sit in the wrapper) and a stronger hierarchy: h1 `text-3xl lg:text-4xl`, subtitle `mt-1.5 max-w-reading text-[15px] font-medium text-muted-foreground`. Copy for the normal case: `"Name it, pick a currency, and add dates and a home base if you have them. Everything else can wait."`

- [ ] **Step 5: Check both widths in the browser**

Run `npm run dev` (background), open `http://localhost:3000/trips/new` at 390px and 1440px wide (a Playwright screenshot via `NODE_PATH=/usr/local/lib/node_modules node -e` following `scripts/lib/audit-browser.ts`'s login helper, or the `run` skill). Confirm: labels and fields share one left edge per column; the dropzone prompt is centred; nothing overlaps on focus. Fix what you see. Stop the dev server.

- [ ] **Step 6: Run tests and types**

Run: `npx vitest run components/trips/cover-dropzone.test.tsx app/\(app\)/trips/new && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/trips/cover-dropzone.tsx components/trips/cover-dropzone.test.tsx "app/(app)/trips/new"
git commit -m "feat(trips): New trip page — aligned grid, cover dropzone with preview

Resolves-Feedback: cmumckjjn000404l08xwwegwg

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 13: Feedback vetting — Needs review for non-admin authors

**Files:**
- Create: `scripts/feedback-accept.ts`, `lib/feedback-accept-args.ts`, `lib/feedback-accept-args.test.ts`, `server/actions/feedback.test.ts` (if absent)
- Modify: `lib/enums.ts:78`, `prisma/schema.prisma:854` (comment only), `server/actions/feedback.ts`, `lib/feedback-view.ts`, `lib/feedback-inbox.ts`, `lib/feedback-inbox.test.ts`, `lib/feedback-view.test.ts`, `scripts/feedback-pull.ts` (summary count), `package.json` (script), `CLAUDE.md` (Feedback inbox section), `docs/adr/0040-…md` (amendment)
- Test: as above

**Interfaces:**
- `FEEDBACK_STATUSES = ["NEEDS_REVIEW", "OPEN", "DONE", "WONTFIX"]`.
- `createFeedbackNote` sets `status: isAdminEmail(user.email) ? "OPEN" : "NEEDS_REVIEW"`.
- `toView` maps `NEEDS_REVIEW` → `"OPEN"` for the panel (the author sees Open; spec Q3-A).
- `renderInbox` adds a `## Needs review` section after the Open sections, same area grouping, and counts it separately in the summary line: `_16 open (Main 16), 2 needs review, 9 resolved · pulled …_`.
- `npm run feedback:accept -- <id> [--dry-run]` sets `NEEDS_REVIEW → OPEN`; refuses any other current status. Declining is `feedback:resolve -- <id> --wontfix --note "…"`, which must accept a `NEEDS_REVIEW` note (it already updates any status).

No migration: `status` is a free string column with a default of `"OPEN"`; the new value needs no schema change. Update the column comment in `schema.prisma` to mention the fourth value and ADR 0040's amendment date.

- [ ] **Step 1: Failing tests — enum, create action, view mapping**

```ts
// lib/enums.test.ts (create or extend)
it("Feedback statuses include Needs review, first", () => {
  expect(FEEDBACK_STATUSES).toEqual(["NEEDS_REVIEW", "OPEN", "DONE", "WONTFIX"]);
});
```

```ts
// server/actions/feedback.test.ts — mock @/lib/db (feedbackNote.upsert), @/lib/guards (requireUser), @/lib/admin (isAdminEmail), @/lib/feedback-site (feedbackSite → "main")
describe("createFeedbackNote vetting (Feedback cmumcswf7000404l75wwuptxb, ADR 0040 amendment 2026-09-29)", () => {
  it("a non-admin's note is born NEEDS_REVIEW", async () => { /* isAdminEmail → false; assert upsert create.status === "NEEDS_REVIEW" */ });
  it("an admin's note is born OPEN", async () => { /* isAdminEmail → true; create.status === "OPEN" */ });
  it("vetting is by author, not site: a non-admin on beta is still NEEDS_REVIEW", async () => { /* feedbackSite → "beta" */ });
});
```

```ts
// lib/feedback-view.test.ts — add
it("shows a Needs-review note to its author as Open (review is the operator's concern)", () => {
  expect(toView({ ...row, status: "NEEDS_REVIEW" }, "u1", "main").status).toBe("OPEN");
});
```

- [ ] **Step 2: Implement enum, action, view**

`lib/enums.ts`:
```ts
/** `FeedbackNote.status` — the lifecycle of a Feedback note (ADR 0040, amended 2026-09-29: NEEDS_REVIEW). */
export const FEEDBACK_STATUSES = ["NEEDS_REVIEW", "OPEN", "DONE", "WONTFIX"] as const;
```

`server/actions/feedback.ts`, in `createFeedbackNote`'s `create: {…}` add after `site`:
```ts
      // Vetting (ADR 0040, amended 2026-09-29): an Admin's remark joins the
      // backlog at once; anyone else's waits for the operator to accept it
      // (`npm run feedback:accept`) or decline it (`feedback:resolve --wontfix`).
      // By author, never by site — a tester on beta is still a tester.
      status: isAdminEmail(user.email) ? "OPEN" : "NEEDS_REVIEW",
```

`lib/feedback-view.ts` `toView`: `status: row.status === "NEEDS_REVIEW" ? "OPEN" : (row.status as FeedbackStatus),` with a comment pointing at CONTEXT.md "Feedback note" (the author's panel shows a Needs-review note exactly as an Open one).

- [ ] **Step 3: Failing tests — inbox rendering**

In `lib/feedback-inbox.test.ts` (reuse its note factory):
```ts
it("lists Needs-review notes in their own section after Open, and counts them in the summary", () => {
  const md = renderInbox([note({ id: "a", status: "OPEN" }), note({ id: "b", status: "NEEDS_REVIEW", authorName: "Tester" })], new Date("2026-09-29"));
  expect(md).toContain("_1 open (Main 1), 1 needs review, 0 resolved · pulled 2026-09-29_");
  expect(md.indexOf("## Open · Main")).toBeLessThan(md.indexOf("## Needs review"));
  expect(md).toMatch(/## Needs review\n\n### .+\n\n- \*\*.*Tester/);
  expect(md).not.toContain("## Other");
});
it("keeps an unknown status under Other", () => { /* existing behaviour still holds */ });
```

- [ ] **Step 4: Implement the inbox**

`lib/feedback-inbox.ts`:
- `STATUS_LABELS` gains `NEEDS_REVIEW: "Needs review"`.
- `toInboxNote`'s fallback stays `"OPEN"`.
- In `renderInbox`: `const needsReview = notes.filter((n) => n.status === "NEEDS_REVIEW").sort(byAuthoredAt)`; `other` excludes it. Summary: build `parts = [openPart, needsReview.length ? `${needsReview.length} needs review` : null, `${resolved.length} resolved`]` joined with `, `. After the Open sections (and before Other) render:
```ts
  if (needsReview.length > 0) {
    out.push("## Needs review", "", "Written by Travellers who are not Admins. **Not backlog yet** — accept with `npm run feedback:accept -- <id>`, or decline with `npm run feedback:resolve -- <id> --wontfix --note \"…\"`. Do not work these.", "");
    // group by area exactly as Open does, showSite: true
  }
```
Update the header sentence to mention acceptance. Update the module docblock ("Only open notes are listed" → open and needs-review).
- `scripts/feedback-pull.ts` final log: count `NEEDS_REVIEW` separately: `… — ${open} open, ${needs} needs review, ${resolved} resolved.`

- [ ] **Step 5: Failing tests — accept args**

```ts
// lib/feedback-accept-args.test.ts
import { describe, expect, it } from "vitest";
import { parseAcceptArgs } from "./feedback-accept-args";
describe("parseAcceptArgs", () => {
  it("takes an id and optional --dry-run", () => {
    expect(parseAcceptArgs(["n1"])).toEqual({ id: "n1", dryRun: false });
    expect(parseAcceptArgs(["n1", "--dry-run"])).toEqual({ id: "n1", dryRun: true });
  });
  it("rejects unknown flags, extra args and a missing id", () => {
    expect(parseAcceptArgs(["n1", "--note", "x"])).toEqual({ error: "Unknown flag --note" });
    expect(parseAcceptArgs(["n1", "n2"])).toEqual({ error: "Unexpected argument n2" });
    expect("error" in parseAcceptArgs([])).toBe(true);
  });
});
```

Implement `lib/feedback-accept-args.ts` in the style of `feedback-resolve-args.ts` (pure).

- [ ] **Step 6: The accept script**

`scripts/feedback-accept.ts` — copy `feedback-resolve.ts`'s shape (`import "./load-env"`, `targetHost()`, print `Database:` first):

```ts
/**
 * Accept a Feedback note written by a non-Admin (ADR 0040, amended 2026-09-29).
 *
 *   npm run feedback:accept -- <id> [--dry-run]
 *
 * NEEDS_REVIEW → OPEN, nothing else: an accepted note simply joins the backlog
 * the next `feedback:pull` prints. Refuses a note in any other status — an
 * Open note needs no accepting and a resolved one is history. Declining is
 * `feedback:resolve -- <id> --wontfix --note "…"`. Writes production, like
 * resolve; prints the database host before touching anything.
 */
```
Body: parse args → print host → `findUnique` (id, body, status) → not found exits 1 → if `status !== "NEEDS_REVIEW"` print `Not accepting: <id> is <status>, not NEEDS_REVIEW.` and exit 1 → dry-run prints the change → `update({ data: { status: "OPEN" } })` → `Accepted: <body slice>`.

`package.json`: `"feedback:accept": "tsx scripts/feedback-accept.ts"`.

- [ ] **Step 7: CLAUDE.md and ADR 0040**

`CLAUDE.md`, in "Feedback inbox — read this first", step 2 becomes: "Read the inbox and lead with what's open in it. **Never work a note under `## Needs review`** — those are from Travellers who are not Admins and wait for me to accept them (`npm run feedback:accept -- <id>`) or decline them (`feedback:resolve --wontfix`). Mention that they exist; do not plan them." Add `feedback:accept` to the parenthetical about writers: "(`feedback:resolve` and `feedback:accept` are the only writers — never run either to 'check' anything, not even with `--dry-run`.)"

Append to `docs/adr/0040-…md`:

```markdown
## Amendment — 2026-09-29: a note from anyone but an Admin is born Needs review

**Context.** A second tester is joining. Until now every note landed Open and
the inbox treated every Open note as work: an agent starting a session would
plan and build whatever anyone wrote. Cam wants to vet a tester's remarks
before they become backlog (Feedback `cmumcswf7000404l75wwuptxb`).

**Decision.** `FeedbackNote.status` gains a fourth value, `NEEDS_REVIEW`,
ordered first. At write time the server sets `OPEN` for an author
`isAdminEmail` recognises and `NEEDS_REVIEW` for anyone else — by author,
never by site. `npm run feedback:accept -- <id>` moves a note to `OPEN`;
declining is the existing `feedback:resolve --wontfix`. The inbox prints
Needs-review notes in their own section after Open, and the session
instructions forbid working them. The author's own panel shows a Needs-review
note as Open: review is the operator's concern, and "why is mine still under
review?" is a conversation the log is not for.

**Considered.** A section in the inbox grouped by author with no new status
(rejected: the database could not tell a vetted note from an unvetted one, so
the printout would have been the only record). An in-app admin triage screen
(deferred: a CLI matches how resolve already works; a button can come later
without changing the model).

**Consequences.** `FEEDBACK_STATUSES` and every switch over it gain a case;
`toInboxNote`'s unknown-status fallback stays `OPEN`. A note an Admin declines
carries `WONTFIX` and a resolution like any other, so the tester sees an
honest "Won't fix" rather than silence.
```

- [ ] **Step 8: Run everything touched and types**

Run: `npx vitest run lib/enums.test.ts lib/feedback-accept-args.test.ts lib/feedback-inbox.test.ts lib/feedback-view.test.ts server/actions/feedback.test.ts components/feedback && npx tsc --noEmit -p .`
Expected: PASS. Do NOT run the scripts.

- [ ] **Step 9: Commit**

```bash
git add lib/enums.ts lib/enums.test.ts prisma/schema.prisma server/actions/feedback.ts server/actions/feedback.test.ts lib/feedback-view.ts lib/feedback-view.test.ts lib/feedback-inbox.ts lib/feedback-inbox.test.ts lib/feedback-accept-args.ts lib/feedback-accept-args.test.ts scripts/feedback-accept.ts scripts/feedback-pull.ts package.json CLAUDE.md docs/adr/0040-feedback-notes-captured-in-product-exported-to-a-committed-inbox.md
git commit -m "feat(feedback): notes from non-Admins are born Needs review

New status NEEDS_REVIEW, set at write time by author. feedback:accept moves a
note to Open; feedback:resolve --wontfix declines it. The inbox prints them in
their own section and the session rules forbid working them. The author's
panel still reads Open. ADR 0040 amended.

Resolves-Feedback: cmumcswf7000404l75wwuptxb

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 14: Desktop sidebar shows every Trip section, with icons; "Across trips"

**Files:**
- Create: `components/trip/nav-icons.ts`
- Modify: `components/trip/trip-nav.tsx` (add `tripSidebarGroups`), `components/shell/sidebar-nav.tsx`, `components/trip/mobile-tab-bar.tsx` (pass icons), `components/trip/help-legend.tsx:238-262`
- Test: `components/shell/sidebar.test.tsx`, `components/shell/sidebar-nav.test.tsx`, `components/trip/trip-nav.test.tsx` (extend or create), `components/trip/help-legend.test.tsx` (if present)

**Interfaces:**
- `NAV_ICONS: Record<NavLabel, LucideIcon>` where `NavLabel = "Home" | "Plan" | "Days" | "Calendar" | "Money" | "Wishlist" | "Summary" | "Journal" | "Checklists" | "Files" | "Activity" | "Settings" | "Help" | "More"`. Icons: Home→`Home`, Plan→`Map`, Days→`CalendarDays`, Calendar→`Calendar`, Money→`Wallet`, Wishlist→`Heart`, Summary→`FileText`, Journal→`BookOpen`, Checklists→`ListChecks`, Files→`Paperclip`, Activity→`Activity`, Settings→`Settings`, Help→`CircleHelp`, More→`Menu`.
- `tripSidebarGroups(tripRef, planParam, daysHref): { heading: string | null; items: TripSidebarItem[] }[]` with `TripSidebarItem = { label: NavLabel; href: string; match: (p: string) => boolean }`. Groups: `Plan it` = Home, Plan, Days, Calendar, Money, Wishlist; `Keep` = Journal, Checklists, Files, Summary, Activity; `null` = Settings, Help. Every item's `match` comes from `isNavActive`/`isDaysActive` exactly as `tripRailItems` does. `tripRailItems` (the Dock's seven, with More) is unchanged.
- `SidebarNav` renders the groups (each `<p>` eyebrow + `<ul>`) instead of the seven rail items; each row shows `NAV_ICONS[label]` (`size-[18px]`, `aria-hidden`) before the label; the trips-level eyebrow reads **Across trips**.

- [ ] **Step 1: Failing tests**

`components/trip/trip-nav.test.tsx` (create if absent; mock `next/navigation` like `lib/help-guide.test.ts` does):

```ts
describe("tripSidebarGroups (Feedback cmumd26ny000104jywgykrva2)", () => {
  it("lists all thirteen sections in three groups with no More", () => {
    const groups = tripSidebarGroups("t1", null, null);
    expect(groups.map((g) => g.heading)).toEqual(["Plan it", "Keep", null]);
    expect(groups.flatMap((g) => g.items.map((i) => i.label))).toEqual([
      "Home", "Plan", "Days", "Calendar", "Money", "Wishlist",
      "Journal", "Checklists", "Files", "Summary", "Activity",
      "Settings", "Help",
    ]);
  });
  it("threads ?plan= onto Plan, Money and Wishlist only", () => {
    const items = tripSidebarGroups("t1", "f1", null).flatMap((g) => g.items);
    const href = (l: string) => items.find((i) => i.label === l)!.href;
    expect(href("Plan")).toBe("/trips/t1/plan?plan=f1");
    expect(href("Wishlist")).toBe("/trips/t1/wishlist?plan=f1");
    expect(href("Journal")).toBe("/trips/t1/journal");
  });
  it("Settings lights only on settings; Home only on the base", () => {
    const items = tripSidebarGroups("t1", null, null).flatMap((g) => g.items);
    const m = (l: string, p: string) => items.find((i) => i.label === l)!.match(p);
    expect(m("Settings", "/trips/t1/settings")).toBe(true);
    expect(m("Settings", "/trips/t1/more")).toBe(false);
    expect(m("Home", "/trips/t1")).toBe(true);
    expect(m("Home", "/trips/t1/plan")).toBe(false);
  });
  it("every label has an icon", () => {
    for (const g of tripSidebarGroups("t1", null, null)) for (const i of g.items) expect(NAV_ICONS[i.label]).toBeTypeOf("object");
  });
});
```

`components/shell/sidebar.test.tsx`: change "inside a trip renders the seven trip items in order, then Trips and Globe" to expect the thirteen labels above followed by Trips and Globe; change "lights Days on a single day page and More on Settings" to assert **Settings** is `aria-current` on `/trips/t1/settings` and that no row is labelled "More"; change "renders the ALL TRIPS eyebrow" to `screen.getByText("Across trips")`; add:

```tsx
  it("shows the section eyebrows Plan it and Keep, and an icon on every trip row", () => {
    renderInTrip("/trips/t1/plan"); // this file's helper
    expect(screen.getByText("Plan it")).toBeInTheDocument();
    expect(screen.getByText("Keep")).toBeInTheDocument();
    const home = screen.getByRole("link", { name: "Home" });
    expect(home.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });
```

- [ ] **Step 2: Implement `nav-icons.ts`**

```ts
import {
  Activity, BookOpen, Calendar, CalendarDays, CircleHelp, FileText, Heart, Home, ListChecks,
  Map, Menu, Paperclip, Settings, Wallet, type LucideIcon,
} from "lucide-react";

export type NavLabel =
  | "Home" | "Plan" | "Days" | "Calendar" | "Money" | "Wishlist" | "Summary"
  | "Journal" | "Checklists" | "Files" | "Activity" | "Settings" | "Help" | "More";

/**
 * One icon per Trip section, shared by the desktop sidebar, the phone tab bar
 * and the help legend, so the same section looks the same on every device
 * (Feedback cmumd26ny000104jywgykrva2). No React here: importable from
 * server and client components alike.
 */
export const NAV_ICONS: Record<NavLabel, LucideIcon> = {
  Home, Plan: Map, Days: CalendarDays, Calendar, Money: Wallet, Wishlist: Heart, Summary: FileText,
  Journal: BookOpen, Checklists: ListChecks, Files: Paperclip, Activity, Settings, Help: CircleHelp, More: Menu,
};
```

- [ ] **Step 3: Implement `tripSidebarGroups` in `trip-nav.tsx`**

```ts
export interface TripSidebarItem {
  label: NavLabel;
  href: string;
  match: (pathname: string) => boolean;
}

export interface TripSidebarGroup {
  /** Eyebrow above the group; null for the trailing Settings/Help pair. */
  heading: "Plan it" | "Keep" | null;
  items: TripSidebarItem[];
}

/**
 * The ≥1280px sidebar's full list (Feedback cmumd26ny000104jywgykrva2): every
 * section, no More. Hrefs and ?plan= threading still come from
 * primaryNav/moreNav; matching mirrors tripRailItems (Home exact, Days on the
 * /day prefix, everything else on its own prefix). The Dock keeps
 * tripRailItems — a 96px strip has no room for thirteen rows.
 */
export function tripSidebarGroups(tripRef: string, planParam?: string | null, daysHref?: string | null): TripSidebarGroup[] {
  const base = tripPath(tripRef);
  const all = [...primaryNav(tripRef, planParam), ...moreNav(tripRef, planParam)];
  const byLabel = (label: NavLabel) => all.find((i) => i.label === label)!;
  const item = (label: Exclude<NavLabel, "Days" | "More">): TripSidebarItem => {
    const href = byLabel(label).href;
    return { label, href, match: (p) => isNavActive(href, p, base) };
  };
  const daysIndexHref = byLabel("Days").href;
  const days: TripSidebarItem = { label: "Days", href: daysHref ?? daysIndexHref, match: (p) => isDaysActive(daysIndexHref, p, base) };
  return [
    { heading: "Plan it", items: [item("Home"), item("Plan"), days, item("Calendar"), item("Money"), item("Wishlist")] },
    { heading: "Keep", items: [item("Journal"), item("Checklists"), item("Files"), item("Summary"), item("Activity")] },
    { heading: null, items: [item("Settings"), item("Help")] },
  ];
}
```

Import `NavLabel` from `./nav-icons`.

- [ ] **Step 4: Implement the sidebar rows**

`sidebar-nav.tsx`:
- import `tripSidebarGroups` (instead of `tripRailItems`) and `NAV_ICONS`.
- `Row` gains `icon?: LucideIcon`; render `{Icon ? <Icon className="size-[18px] shrink-0" aria-hidden="true" /> : null}` before the label, and wrap icon+label in `<span className="flex min-w-0 items-center gap-2.5"><…/><span className="truncate">{label}</span></span>` so the count stays right-aligned.
- Extract the eyebrow class into `const EYEBROW = "mx-3 mb-1 mt-4 text-[11px] font-extrabold uppercase tracking-[0.08em] text-on-accent-muted";` (first group's eyebrow uses `mt-0`).
- Render: for each group, `{group.heading ? <p className={…}>{group.heading}</p> : <div className="mt-3" />}` then a `<ul>` of Rows (Plan/Wishlist counts as today). Then the eyebrow **Across trips** and the Trips/Globe rows (Trips with `NAV_ICONS`? — no: keep Trips/Globe text-only; they are a different level and the app tab bar's `LayoutGrid`/`Globe` icons belong to it. Leave them.)
- Update the docblock: thirteen rows in three groups.

`mobile-tab-bar.tsx`: pass `icon: NAV_ICONS.Home` etc. on the four `TabItem`s (TabBar already renders `it.icon`). The More trigger renders its own button: add `<Menu className="size-4" aria-hidden="true" />` above the word to match. Check `tab-bar.tsx` for how it stacks icon over label and copy its structure in the custom button.

`help-legend.tsx`: replace the hand-copied icon list with one built from `NAV_ICONS` (`["Home","Plan","Days","Money","More"]`), and add a second block after it:

```tsx
      {/* ── Desktop sidebar ── */}
      <div>
        <H className={BLOCK_HEADING}>The list down the side (on a bigger screen)</H>
        <p className="mb-2 text-sm text-muted-foreground">Every section of the trip, in three groups: <strong>Plan it</strong>, <strong>Keep</strong>, then Settings and Help. Under <strong>Across trips</strong> are your Trips list and the Globe.</p>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {(["Home","Plan","Days","Calendar","Money","Wishlist","Journal","Checklists","Files","Summary","Activity","Settings","Help"] as const).map((label) => { const Icon = NAV_ICONS[label]; return (<li key={label} className="flex items-center gap-2"><span aria-hidden="true" className="flex size-8 items-center justify-center text-muted-foreground"><Icon className="size-5" /></span><span className="text-sm text-foreground">{label}</span></li>); })}
        </ul>
      </div>
```

Remove the now-wrong "hand-copied from mobile-tab-bar.tsx:17-22" comment.

- [ ] **Step 5: Run tests and types**

Run: `npx vitest run components/shell components/trip/trip-nav.test.tsx components/trip/mobile-tab-bar.test.tsx components/trip/help-legend.test.tsx lib/help-guide.test.ts && npx tsc --noEmit -p .`
Expected: PASS (`lib/help-guide.test.ts`'s nav-label guard reads `primaryNav`/`moreNav`, which are unchanged).

- [ ] **Step 6: Commit**

```bash
git add components/trip/nav-icons.ts components/trip/trip-nav.tsx components/trip/trip-nav.test.tsx components/shell/sidebar-nav.tsx components/shell/sidebar.test.tsx components/shell/sidebar-nav.test.tsx components/trip/mobile-tab-bar.tsx components/trip/help-legend.tsx
git commit -m "feat(shell): desktop sidebar lists every Trip section with icons; Across trips

Thirteen rows in three groups (Plan it, Keep, Settings/Help) replace the
seven-plus-More set at ≥1280px. One shared icon map serves the sidebar, the
phone tab bar and the help legend. The Dock keeps its seven.

Resolves-Feedback: cmumd26ny000104jywgykrva2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 15: One persistent rail across Trip and trips-level pages

**Files:**
- Create: `components/shell/rail-trip.tsx` (context + publisher), `components/shell/app-shell-rail.tsx`, `components/shell/app-shell-rail.test.tsx`
- Modify: `app/(app)/layout.tsx:222-240`, `app/(app)/trips/[tripId]/layout.tsx:108-122`, `components/app-rail.tsx` (simplify `TripBoundaryRailShell`), `components/shell/sidebar.tsx` (accept `trip.ref`/`trip.daysHref`), `components/shell/sidebar-nav.tsx` (accept `tripRef`, `daysHref` props with context fallback), `components/trip/trip-nav.tsx` (`TripNav` accepts `tripRef`/`daysHref` props), `docs/adr/0062-wide-screen-shell.md` (amendment)
- Test: `components/app-rail.test.tsx`, `app/(app)/layout.test.tsx`, `app/(app)/not-found.test.tsx`, `app/(app)/trips/error.test.tsx`, `components/shell/sidebar.test.tsx`

**Interfaces:**
- `rail-trip.tsx` (client):
  ```ts
  export interface RailTrip { id: string; slug: string; name: string; daysHref: string | null; counts?: SidebarNavCounts; switcher?: ReactNode }
  export function RailTripProvider({ children })   // holds useState<RailTrip | null>
  export function useRailTrip(): { trip: RailTrip | null; publish: (t: RailTrip | null) => void }
  export function RailTripPublisher(props: RailTrip): null  // useEffect: publish(props); cleanup publish(null)
  ```
- `app-shell-rail.tsx` (client): `export function AppShellRail()` — renders, always, one `<Dock>` (with `DOCK_STICKY_CLASS`) and one `<Sidebar>`. On a trip path (`isTripPath`) the Dock's items are `tripRailItems(ref, planParam, daysHref)` plus the muted Trips/Globe/You (as `TripNav` does today), and the Sidebar gets `trip={{ id, name, ref, daysHref }}`, `switcher` and `counts` from the published trip **when `trip.id === seg || trip.slug === seg`**, else `trip={{ id: seg, name: null, ref: seg, daysHref: null }}` with `switcher={<SidebarTripSkeleton />}`. Off a trip path: the Trips/Globe/You Dock and the Sidebar with `trip={null}` and the BackToTripCard/placeholder switcher (moved here from the app layout; `lastTrip`/`trips` come from `useShellUser()`).
- `SidebarTripSkeleton` (in `sidebar.tsx`): the switcher card's shape with two `<Skeleton>` bars, `aria-hidden`.
- `Sidebar.trip` type becomes `{ id: string; name: string | null; ref?: string; daysHref?: string | null } | null`; `SidebarNav` gains `tripRef?: string | null; daysHref?: string | null` and uses `props.tripRef ?? useTripSlug(tripId)` / `props.daysHref ?? useDaysHref()` (call both hooks unconditionally, then pick).
- `TripNav({ tripId, tripRef?, daysHref? })` same fallback pattern, so existing tests keep passing.
- The trip layout no longer renders `<TripNav>` or `<SidebarFromContext>`; it renders `<RailTripPublisher id slug name daysHref counts={sidebarNavCounts(trip.id)} switcher={<TripSwitcherFromContext … variant="card" />} />` inside its existing `data-trip-shell` div (keep `data-trip-shell` and `data-trip-content` — `<main>`'s padding rules depend on them).
- `TripBoundaryRailShell` becomes a pass-through (`<>{children}</>`) with a comment: the rail now lives in the app layout and is on screen above any boundary. Keep the export; update its two tests to assert no second rail and that children render.

Why this shape works: the rail is one component in the app layout, so its DOM (`<nav>`, `<aside>`) persists across every navigation; only its rows and the switcher slot re-render. Rows never need the Trip: `tripRailItems` only needs the URL ref, which the pathname carries. Only the switcher card (name, status line) and the Plan/Wishlist counts wait for the trip layout, so those are the only things that show a skeleton.

- [ ] **Step 1: Failing tests — `app-shell-rail.test.tsx`**

Mock `next/navigation` (`usePathname`, `useSearchParams`, `useRouter`, `useSelectedLayoutSegment`) with a mutable pathname; wrap in `ShellUserProvider` (value with `trips: [{ id: "t1", slug: "christmas", name: "Christmas", statusLine: "68 sleeps" }]`, `lastTrip` the same) and `RailTripProvider`; mock `@/components/shell/search-field` and `@/components/shell/dock-extras` to nulls as `sidebar.test.tsx` does.

```tsx
describe("AppShellRail (Feedback cmumclo5t000004jyyll3imed)", () => {
  it("on /trips shows the Trips/Globe/You Dock and a sidebar with no trip rows and the Back-to card", () => { /* pathname "/trips"; expect link "Trips", no link "Plan", text "Back to" */ });
  it("on a trip path renders the trip rows from the URL ref before anything is published, with a skeleton switcher", () => {
    /* pathname "/trips/christmas/plan"; no publisher rendered */
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("href", "/trips/christmas/plan");
    expect(screen.getByTestId("sidebar-trip-skeleton")).toBeInTheDocument();
  });
  it("swaps the skeleton for the switcher once the trip layout publishes, without remounting the rail", () => {
    /* render with pathname "/trips/christmas"; capture aside = getByTestId("sidebar"); rerender with <RailTripPublisher id="t1" slug="christmas" name="Christmas" daysHref="/trips/christmas/day/2026-12-04" switcher={<div>SWITCHER</div>} /> inside the same providers */
    expect(screen.getByText("SWITCHER")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-trip-skeleton")).toBeNull();
    expect(screen.getByRole("link", { name: "Days" })).toHaveAttribute("href", "/trips/christmas/day/2026-12-04");
    expect(screen.getByTestId("sidebar")).toBe(aside); // same DOM node
  });
  it("ignores a stale publication for a different trip (URL says another slug)", () => { /* published slug "japan", pathname "/trips/christmas" → skeleton */ });
  it("keeps one rail on a trip path whose layout failed (no publication ever arrives): rows from the URL, Choose-a-trip never, skeleton switcher", () => { /* … */ });
});
```

- [ ] **Step 2: Implement `rail-trip.tsx`**

```tsx
"use client";

import * as React from "react";
import type { ReactNode } from "react";
import type { SidebarNavCounts } from "@/components/shell/sidebar-nav";

export interface RailTrip {
  id: string;
  /** URL ref (ADR 0064) — matched against the pathname's segment. */
  slug: string;
  name: string;
  daysHref: string | null;
  counts?: SidebarNavCounts;
  switcher?: ReactNode;
}

interface RailTripState {
  trip: RailTrip | null;
  publish: (t: RailTrip | null) => void;
}

const Ctx = React.createContext<RailTripState>({ trip: null, publish: () => {} });

/**
 * The one thing the persistent rail (AppShellRail) cannot read off the URL:
 * the Trip's name, its default Days date and its Plan/Wishlist counts. The
 * trip layout publishes them here as it renders; until then the rail shows
 * the rows built from the URL and a skeleton where the switcher card goes
 * (ADR 0062, amended 2026-09-29; Feedback cmumclo5t000004jyyll3imed).
 */
export function RailTripProvider({ children }: { children: ReactNode }) {
  const [trip, setTrip] = React.useState<RailTrip | null>(null);
  const value = React.useMemo(() => ({ trip, publish: setTrip }), [trip]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRailTrip(): RailTripState {
  return React.useContext(Ctx);
}

/** Rendered by the trip layout. Publishes on mount and whenever the Trip changes; clears on unmount. */
export function RailTripPublisher(props: RailTrip): null {
  const { publish } = useRailTrip();
  const { id, slug, name, daysHref, counts, switcher } = props;
  React.useEffect(() => {
    publish({ id, slug, name, daysHref, counts, switcher });
  }, [publish, id, slug, name, daysHref, counts, switcher]);
  React.useEffect(() => () => publish(null), [publish]);
  return null;
}
```

- [ ] **Step 3: Implement `app-shell-rail.tsx`**

```tsx
"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Dock, type DockItem } from "@/components/ui/dock";
import { DOCK_STICKY_CLASS, tripRailItems } from "@/components/trip/trip-nav";
import { DockAccountMenu, DockSearchButton } from "@/components/shell/dock-extras";
import { Sidebar, SidebarTripPlaceholder, SidebarTripSkeleton } from "@/components/shell/sidebar";
import { BackToTripCard } from "@/components/shell/back-to-trip-card";
import { useShellUser } from "@/components/shell/shell-user";
import { useRailTrip } from "@/components/shell/rail-trip";
import { isGlobeActive, isTripPath, isTripsActive } from "@/components/shell/app-paths";

const APP_ITEMS: DockItem[] = [
  { href: "/trips", label: "Trips", match: isTripsActive },
  { href: "/globe", label: "Globe", match: isGlobeActive },
  { href: "/account", label: "You", match: (p) => p === "/account" || p.startsWith("/account/") },
];

/**
 * The md+ rail, mounted once by app/(app)/layout.tsx and never unmounted
 * (ADR 0062, amended 2026-09-29). Inside a Trip its rows come straight from
 * the URL's trip segment (slug or id — tripRailItems only needs the ref), so
 * they paint at once; the switcher card and counts arrive from the trip
 * layout via RailTripPublisher and show a skeleton until then. Outside a
 * Trip it is the Trips/Globe/You Dock and the Back-to card.
 */
export function AppShellRail() {
  const path = usePathname();
  const planParam = useSearchParams().get("plan");
  const shell = useShellUser();
  const { trip } = useRailTrip();
  if (!shell) return null;

  const seg = isTripPath(path) ? path!.split("/")[2]! : null;
  const published = seg && trip && (trip.id === seg || trip.slug === seg) ? trip : null;

  if (!seg) {
    return (
      <>
        <Dock items={APP_ITEMS} aria-label="Teepee" search={<DockSearchButton />} className={DOCK_STICKY_CLASS}><DockAccountMenu /></Dock>
        <Sidebar
          {...shell}
          trip={null}
          switcher={shell.lastTrip ? <BackToTripCard trip={shell.lastTrip} trips={shell.trips} /> : <SidebarTripPlaceholder trip={null} />}
        />
      </>
    );
  }

  const ref = published?.slug ?? seg;
  const daysHref = published?.daysHref ?? null;
  const dockItems: DockItem[] = [
    ...tripRailItems(ref, planParam, daysHref).map(({ label, href, match }) => ({ label, href, match })),
    { href: "/trips", label: "Trips", muted: true, match: (p) => p === "/trips" },
    { href: "/globe", label: "Globe", muted: true },
    { href: "/account", label: "You", muted: true },
  ];
  return (
    <>
      <Dock items={dockItems} aria-label="Trip sections" search={<DockSearchButton />} className={DOCK_STICKY_CLASS}><DockAccountMenu /></Dock>
      <Sidebar
        {...shell}
        trip={{ id: published?.id ?? seg, name: published?.name ?? null, ref, daysHref }}
        switcher={published?.switcher ?? <SidebarTripSkeleton />}
        counts={published?.counts}
      />
    </>
  );
}
```

`SidebarTripSkeleton` in `sidebar.tsx`:
```tsx
/** The switcher slot while the trip layout is still streaming its name (AppShellRail). */
export function SidebarTripSkeleton() {
  return (
    <div data-testid="sidebar-trip-skeleton" aria-hidden="true" className="flex min-h-11 items-center gap-2.5 rounded-[14px] border-2 border-border bg-card px-3 py-2.5 shadow-hard-1">
      <span className="size-2.5 shrink-0 rounded-full border-2 border-border bg-coral" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5"><Skeleton className="h-3.5 w-28" /><Skeleton className="h-2.5 w-16" /></span>
    </div>
  );
}
```
(Import `Skeleton` from `@/components/ui/skeleton`.) `Sidebar`: `trip?.name` may be null now — `SidebarTripPlaceholder` shows the name only when present; `SearchField` gets `tripId={trip?.id ?? null}` as before. Pass `tripRef={trip?.ref}` and `daysHref={trip?.daysHref}` to `SidebarNav`.

- [ ] **Step 4: Wire the layouts**

`app/(app)/layout.tsx`: wrap the tree in `<RailTripProvider>` (inside `ShellUserProvider`); replace `<AppRail />` and the `<OutsideTrip><Sidebar …/></OutsideTrip>` block with `<AppShellRail />`. Remove the now-unused imports (`AppRail`, `OutsideTrip` if unused — `OnTripPath`/`OutsideTrip` are still used for the phone bars — check), `Sidebar`, `SidebarTripPlaceholder`, `BackToTripCard`. Update the layout docblock's 768–1279 / ≥1280 bullets: "one rail for every signed-in page, mounted here and never unmounted; inside a Trip its rows come from the URL and its switcher from the trip layout (RailTripPublisher)".

`app/(app)/trips/[tripId]/layout.tsx`: delete `<TripNav tripId={tripId} />` and the `<SidebarFromContext …/>` block; in their place render
```tsx
        <RailTripPublisher
          id={trip.id}
          slug={slug}
          name={trip.name}
          daysHref={daysHref}
          counts={sidebarNavCounts(trip.id)}
          switcher={<TripSwitcherFromContext tripId={trip.id} fallbackName={trip.name} variant="card" />}
        />
```
Keep `DaysHrefProvider` (the phone tab bar and Home header still read it). Remove unused imports. Update the comment above the JSX.

`components/app-rail.tsx`: keep `OnTripPath`/`OutsideTrip`; delete `AppRailDock` and `AppRail` (search for other importers first: `command-palette-mount.test.tsx` mentions AppRail — read it and adjust); `TripBoundaryRailShell` returns `<>{children}</>` with the explanatory comment. `app/(app)/layout.tsx` `<main>` keeps its `has-[[data-rail-shell]]` classes harmlessly, or drop them and the `data-rail-shell` mention together.

- [ ] **Step 5: Update existing tests**

- `components/app-rail.test.tsx`: drop the `AppRail`/`AppRailDock` describes (their coverage moves to `app-shell-rail.test.tsx`); `TripBoundaryRailShell` tests become "renders its children and adds no rail".
- `app/(app)/not-found.test.tsx`, `app/(app)/trips/error.test.tsx`: "keeps the rail" → these boundaries no longer own a rail; assert the content renders and there is no `nav[aria-label="Teepee"]` inside the boundary.
- `app/(app)/layout.test.tsx` "mounts the Teepee rail (Trips, Globe, You) on a non-trip page": still true via `AppShellRail` (mock `next/navigation` pathname `/trips`). Add: "on a trip path mounts the trip rows and a skeleton switcher" with pathname `/trips/t1/plan`.
- `components/shell/sidebar.test.tsx`: where it renders `<Sidebar trip={{ id, name }} …>` nothing changes; add a case that `trip={{ id: "t1", name: null, ref: "christmas", daysHref: null }}` builds hrefs from `christmas`.

- [ ] **Step 6: ADR 0062 amendment**

Append to `docs/adr/0062-wide-screen-shell.md`:

```markdown
## Amendment — 2026-09-29: one rail, mounted once, for every signed-in page

**Context.** The rail was two components: the app layout mounted a Dock and
Sidebar for trips-level pages and the trip layout mounted its own pair, each
hiding when the other applied. Crossing the boundary — "Back to {trip}" from
New trip, or Trips from inside a Trip — unmounted one and mounted the other,
so the whole left edge re-rendered (Feedback `cmumclo5t000004jyyll3imed`).

**Decision.** `AppShellRail`, mounted once in `app/(app)/layout.tsx`, is the
only md+ rail. It reads the pathname: on a Trip path its rows are built from
the URL's trip segment (slug or id), which is all `tripRailItems` needs; the
Trip's name, default Days date and Plan/Wishlist counts arrive from the trip
layout through `RailTripPublisher`/`RailTripProvider`, and the switcher card
shows a small skeleton until they do. Off a Trip path it shows Trips/Globe/You
and the Back-to card. The trip layout renders content only; `data-trip-shell`
stays on it for `<main>`'s full-bleed rule.

**Consequences.** The rail's DOM persists across every navigation; only rows
and the switcher slot re-render. A boundary above the trip layout
(`not-found`, `trips/error`) no longer needs to supply a rail; a Trip that
404s shows URL-built rows and a skeleton switcher, never a blank strip. ADR
0063's "sibling navigation holds the current page" now extends to the rail
across the trip boundary. `npm run audit:nav` remains the browser check.
```

- [ ] **Step 7: Run tests, types, and the browser check**

Run: `npx vitest run components/shell components/app-rail.test.tsx app/\(app\) components/command-palette-mount.test.tsx app/route-conventions.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

Then start `npm run dev` in the background with `ALLOW_DEV_LOGIN=true` and run `NODE_PATH=/usr/local/lib/node_modules npm run audit:nav`. Expected: exit 0. If Playwright is unavailable in this sandbox, say so explicitly in the task report and instead verify by hand in the dev server that navigating `/trips/new` → a trip → `/trips` keeps the `<aside data-testid="sidebar">` node (add a temporary `data-mounted-at={Date.now()}` in dev tools, or check React DevTools) — and remove any temporary code. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add components/shell/rail-trip.tsx components/shell/app-shell-rail.tsx components/shell/app-shell-rail.test.tsx components/shell/sidebar.tsx components/shell/sidebar-nav.tsx components/shell/sidebar.test.tsx components/trip/trip-nav.tsx components/app-rail.tsx components/app-rail.test.tsx "app/(app)/layout.tsx" "app/(app)/layout.test.tsx" "app/(app)/trips/[tripId]/layout.tsx" "app/(app)/not-found.test.tsx" "app/(app)/trips/error.test.tsx" docs/adr/0062-wide-screen-shell.md
git commit -m "feat(shell): one persistent rail across Trip and trips-level pages

The Dock and Sidebar mount once in the app layout. Inside a Trip the rows are
built from the URL segment at once; the trip layout publishes name, Days
target and counts into the rail, which shows a skeleton switcher until then.
ADR 0062 amended.

Resolves-Feedback: cmumclo5t000004jyyll3imed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

### Task 16: Help audit and the vertical 60-second version

**Files:**
- Modify: `components/trip/help-guide.tsx`, `lib/help-guide.ts` (sections, `GUIDE_NAV_LABELS`, `GUIDE_TRIP_SEGMENTS`, `GUIDE_UI_STRINGS`), `components/trip/help-legend.tsx` (if the audit finds drift)
- Test: `lib/help-guide.test.ts` (drift guards must stay green; add sections to its expectations only where it enumerates them)

**Interfaces:** `HELP_SECTIONS` gains new entries (ids below); `Section` keeps its API but the 60-second section no longer passes `bodyUnconstrained` (remove the prop entirely if nothing else uses it — grep).

Two deliverables in one task because they touch the same file: (a) the audit, (b) the 60-second restyle.

- [ ] **Step 1: Audit method (do this before touching prose)**

For every `<Section>` in `help-guide.tsx`, read the routes and components it describes and write a short list of claims that are stale into `/tmp/claude-1000/-work/…/scratchpad/help-audit.md` (scratchpad, not the repo). Sources of truth to read: `components/trip/trip-nav.tsx` (labels), `app/(app)/trips/[tripId]/*/page.tsx` (which pages exist), `components/trip/plan/*` (Stop card wording: "Where you're staying", "things to do"), `components/trip/day/*` (the Day view), `components/trips/*` (trips list: "Your trips", carousel, Travel map, tally), `components/feedback/feedback-launcher.tsx` (the Feedback panel), `app/(app)/account/page.tsx` (Account, Devices, Digests, Profile photo, focus point from Task 11), `components/shell/sidebar-nav.tsx` (the groups from Task 14), `docs/adr/0064` (readable links), `components/trip/journal/*`, `CONTEXT.md` (vocabulary). Anything the guide says a button is called must still be on screen — `GUIDE_UI_STRINGS` is asserted by test, so every quoted label you add goes in that list, and every one you remove comes out.

- [ ] **Step 2: Coverage — add these sections (spec Q5-B), each ≤ 120 words, warm second person, `Go` links where a segment exists**

Add to `HELP_SECTIONS` (group `everyday` unless noted), and write matching `<Section>` bodies:

| id | title | blurb | notes |
|---|---|---|---|
| `your-trips` | Your trips and your travels | The front page: every trip as a card, plus the map and tally of where you've been. | Trips list, cards wear a Phase label (Idea, Planning, Up next, On the road, Done), Travel map and stats count what has happened. |
| `the-day` | One day at a time | The Days screen: a single day, its plan, weather and map. | Day view, strip along the top, Gap days read "in transit", Changeover days appear under both Stops. |
| `journal` | Keeping a journal | Your own notes on each day, private to you. | ADR 0058: per Traveller. |
| `account` | You, on Account | Your photo, your name, your devices and which trips send you a digest. | Profile photo with a focus point ("Reposition"), display name, Devices, Digests. |
| `feedback` | Telling us what's wrong | The Feedback button on every screen — a note to the people who make Teepee. | Bottom-right button; private to you; statuses Done / Won't fix. Never mention Needs review (the author sees Open). |
| `links` | Sharing a link to a page | Trip links read like the trip's name and keep working after a rename. | ADR 0064, group `advanced`. |

Add `"day"` and `"help"` to `GUIDE_TRIP_SEGMENTS` only if a `Go` link uses them (both pages exist). Add `"Help"` to `GUIDE_NAV_LABELS` if the prose names it.

- [ ] **Step 3: Correctness — fix every stale claim from your audit list**

Known drift to fix at minimum: the legend's phone-bar note (fixed in Task 14 — confirm); the rail description at the end of the guide (`help-guide.tsx:~1327`, "the More section") must describe the three sidebar groups on a wide screen, the seven-plus-More Dock at tablet width, and the four-plus-More bar on a phone; anything that still says "Budget" for the Money tab; anything describing the old greeting or the old New trip cover field.

- [ ] **Step 4: The 60-second version, vertical with icons and colour**

Replace the `<ol … lg:columns-2 …>` in the `sixty-seconds` section with a single column of six steps, each a row with a numbered, hue-coloured tile and an icon:

```tsx
const SIXTY_STEPS: { icon: LucideIcon; hue: Hue; title: string; segment?: GuideTripSegment; body: React.ReactNode }[] = [
  { icon: Route, hue: "coral", title: "Open Plan", segment: "plan", body: <>This is your trip laid out in order, first day at the top.</> },
  { icon: Pin, hue: "sun", title: "Find the place", body: <>Each Stop is a card, with everything about it already on show.</> },
  { icon: Plus, hue: "leaf", title: "Add things to do", body: <>They sit under that place until you decide when.</> },
  { icon: CalendarDays, hue: "sky", title: "Give each one a day", segment: "calendar", body: <>The step everyone forgets — the next two sections are all about it.</> },
  { icon: Wallet, hue: "lilac", title: "Put a number on it", segment: "budget", body: <>Anything that costs money; watch the running total on Money.</> },
  { icon: BookOpen, hue: "teal", title: "Glance at Summary", segment: "summary", body: <>It reads the whole trip back to you and points out what&rsquo;s missing.</> },
];
```

Render:

```tsx
            <ol aria-label="The 60-second version" className="flex flex-col gap-3 max-w-reading">
              {SIXTY_STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <li key={s.title} className="flex items-start gap-3.5">
                    <span aria-hidden="true" className={cn("island relative grid size-11 shrink-0 place-items-center rounded-lg border-2 border-border", HUE_CLASSES[s.hue].fill)}>
                      <Icon className="size-5" />
                      <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full border-2 border-border bg-card font-display text-[11px] font-extrabold text-foreground">{i + 1}</span>
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-display text-base font-extrabold tracking-[-0.02em]">
                        {s.segment ? <Go tripId={tripId} segment={s.segment}>{s.title}</Go> : s.title}
                      </span>
                      <span className="text-sm text-muted-foreground">{s.body}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
```

Import `HUE_CLASSES` and `Hue` from `@/lib/hues`. Drop `bodyUnconstrained` from this `<Section>`; if no other caller passes it, remove the prop and its comment from `Section`. The 60-second section is the first card in `TOPIC_GRID` and stays `open`; check that `TOPIC_GRID`'s "hero-open" rule still reads well with a taller card (it spans the row when open — fine).

- [ ] **Step 5: Run the drift guards and types**

Run: `npx vitest run lib/help-guide.test.ts components/trip/help-guide.test.tsx components/trip/help-legend.test.tsx && npx tsc --noEmit -p .`
Expected: PASS. Every `GUIDE_UI_STRINGS` entry you added must be found on screen; if one fails, quote the real label or stop quoting it.

- [ ] **Step 6: Read the page**

Start `npm run dev`, open `/trips/<any>/help` and the standalone `/help`; read every section once end to end at 390px and 1440px. Fix awkward wraps. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add components/trip/help-guide.tsx lib/help-guide.ts lib/help-guide.test.ts components/trip/help-legend.tsx
git commit -m "docs(help): audit the guide against the current app; vertical 60-second version

New sections for the trips list, the Day view, Journal, Account, Feedback and
readable links; stale claims corrected; the six-step opener runs down the page
with a coloured icon tile per step.

Resolves-Feedback: cmumd0ulr000104jkpo7i9q27

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015i4ZkPPWeTNqsTtim1K9fR"
```

---

## After the last task (orchestrator)

1. `npm test` (whole suite) and `npx tsc --noEmit -p .` must pass on the branch.
2. `npx next build` once, to catch anything only the production build sees (RSC boundary errors, `loader` on the wrong side — see `lib/image-loader-boundary.test.ts`).
3. Do NOT merge, deploy, or run `feedback:resolve`. Report the branch and the sixteen `Resolves-Feedback:` trailers to Cam and wait.
