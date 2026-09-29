# Day carousel and hard-cut section switches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Section and tab switches swap in one frame with no fade; the Day view becomes a paged carousel — the day before and after are rendered beside the day shown, a drag tracks the finger and snaps to a whole day, settling navigates; arrows, keys and adjacent chip taps glide there; the Day strip centres the day shown on the phone and moves with the body.

**Architecture:** `SectionTransition` drops its `<ViewTransition>` (a keyed div remains). The Day page loads three days with parallel `getDay` calls and hands them to a new client `DayCarousel` — a snap-mandatory horizontal scroller whose neighbours are `inert`, positioned on the day shown before first paint (a layout effect for client navigations, an inline script for the cold-load HTML). It exposes `goTo(href)` / `subscribe(progress)` / `isMoving()` through a context that the arrows, keyboard nav and strip consume. Far jumps from the strip keep a view transition, rewritten as a full-width page-turn. The phone strip centres its lit chip, glides with a small rAF tween, and follows the body's progress.

**Tech Stack:** Next.js 16.3 App Router (**read `node_modules/next/dist/docs/` before touching routing — this version differs from training data**), React 19.2 canary `<ViewTransition>` via `components/ui/view-transition.tsx`, Tailwind v4, Vitest + Testing Library (jsdom), Playwright 1.49.1 from the npx cache for the audit (see Global Constraints).

**Spec:** `docs/specs/2026-09-30-day-carousel-and-hard-cut.md` (decisions: ADR 0065, which amends ADR 0063; glossary: CONTEXT.md **Day view**, **Day strip**).

## Global Constraints

- Work only on branch `feat/day-carousel-2026-09-30`. Never commit to `main`, never push, never deploy, never run `feedback:resolve`.
- Before any `npm`/`npx` command in a shell: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use` (node 22 per `.nvmrc`).
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No `Resolves-Feedback:` trailers (these are chat requests, not Feedback notes).
- Run tests with `npm test -- <path>` (sets `TZ=UTC`). Run `npx tsc --noEmit` and `npm run lint` before each commit; both must be clean.
- Do not create any `loading.tsx` or `template.tsx` (ADR 0063). Do not add dependencies.
- No comments that restate code; comment only a non-obvious why. No JSDoc on things a name explains.
- Timings: carousel glide `DAY_GLIDE_MS = 220` (ease-out cubic); settle quiet period `SETTLE_QUIET_MS = 120`; far-jump page-turn `300ms cubic-bezier(0.32, 0.72, 0, 1)`; heading text crossfade stays `150ms`. Reduced motion: every glide instant; dragging untouched.
- Every day change navigates with `scroll: false` (vertical position kept) and is a history entry (`push`, never `replace`).
- Phone bleed follows the trip content padding (`px-4`, `sm:px-6`, none from `md`): scroller `-mx-4 sm:-mx-6 md:mx-0`, panels `px-4 sm:px-6 md:px-0`; the phone strip (`md:hidden`) bleeds `-mx-4 sm:-mx-6`.
- Audit prerequisites (Task 9): a dev server `npx next dev -p 3100` (never `next start`), `ALLOW_DEV_LOGIN="true"` is already in `.env`, Docker Postgres is running on 5432. Playwright is **not** a dependency: `NODE_PATH=$HOME/.npm/_npx/360550e4913b8759/node_modules` (playwright 1.49.1; its chromium-1148 is in `~/Library/Caches/ms-playwright`). If that path is gone, `cd <scratchpad> && npm i playwright@1.49.1` and point `NODE_PATH` at that `node_modules`; never install it into the repo.

## Review Focus

1. **The Trip's first and last day.** Only two panels exist; the shown day is at index 0 (first day) or 1 (last day); the missing arrow stays a disabled span; dragging past the end bounces and never navigates. Expectation: nothing errors, `shownIndex` is right. (Test in Task 7: "first day: two panels, shown at index 0".)
2. **Two activations before the first lands** (a double tap on the arrow, → twice). Expectation: one navigation, no second push with a page-turn type. (Test in Task 4: "a second goTo while one is landing is swallowed".)
3. **Reduce Motion on.** Expectation: an arrow tap navigates at once with no glide, the strip catches up instantly. (Tests in Task 3 for the tween and Task 4 for `goTo`.)
4. **A chip tap on a far day** must not go through the carousel: it stays a link with the page-turn type and `scroll={false}`. Expectation: `goTo` returns false, AppLink's own pending report runs. (Test in Task 6.)
5. **The mount's own positioning fires a scroll event.** Setting `scrollLeft` in the layout effect (and the cold-load script) fires `scroll` with progress 0. Expectation: no navigation, no strip snap. (Test in Task 4: "a scroll that rests on the day shown does nothing".)

---

### Task 1: Section switches cut instead of crossfading

**Files:**
- Modify: `components/navigation/section-transition.tsx`
- Modify: `app/globals.css` (route-motion block, lines ~667–682)
- Modify: `app/globals.view-transition.test.ts`
- Test: `components/navigation/section-transition.test.tsx` (unchanged assertions still pass)

**Interfaces:**
- Produces: `SectionTransition({ children })` — same export, no `SECTION_CROSSFADE` export any more.

- [ ] **Step 1: Write the failing CSS test**

In `app/globals.view-transition.test.ts`:
- Change the `it.each([...])("defines %s")` list to `["::view-transition-old(.day-forward)", "::view-transition-new(.day-forward)", "::view-transition-old(.day-back)", "::view-transition-new(.day-back)", "::view-transition-old(.day-text)", "::view-transition-new(.day-text)"]` (drop both `.tp-crossfade` entries).
- Delete the whole `it("section crossfade is out-then-in: …")` test.
- Add:

```ts
  it("has no section crossfade: a section switch is a cut (ADR 0065)", () => {
    expect(css).not.toContain("tp-crossfade");
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- app/globals.view-transition.test.ts`
Expected: FAIL on "has no section crossfade" (css still contains `tp-crossfade`).

- [ ] **Step 3: Replace the component**

`components/navigation/section-transition.tsx` — full new content:

```tsx
"use client";

import * as React from "react";
import { useSelectedLayoutSegment } from "next/navigation";

/**
 * Keys a layout's child segment so the old section unmounts and the new one
 * mounts as a pair when the segment changes — Plan → Money, Trips → Globe —
 * and nothing happens for changes deeper down (day → day). The old page holds
 * until the new one is ready (ADR 0063) and then swaps in one frame: no view
 * transition, no fade (ADR 0065 — the crossfade still overlapped on the
 * iPhone PWA, and a cut depends on nothing the browser may not honour).
 */
export function SectionTransition({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment() ?? "__index";
  return (
    <div key={segment} data-section={segment} className="w-full">
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Edit the CSS**

In `app/globals.css`:
- Delete these two lines exactly:
  ```css
  ::view-transition-old(.tp-crossfade) { animation: 100ms ease-in both tp-vt-fade reverse; }
  ::view-transition-new(.tp-crossfade) { animation: 160ms ease-out 100ms both tp-vt-fade; }
  ```
- Replace the comment block that begins `/* ── Route motion (ADR 0063)` (ending at `so nothing here fires for them. */`) with:
  ```css
  /* ── Route motion (ADR 0063, amended by ADR 0065) ────────────────────────
     React <ViewTransition> classes. Section switches are a cut — no rule here
     (components/navigation/section-transition.tsx). The Day body runs a
     full-width page-turn only on a far jump from the strip (day-forward /
     day-back); adjacent days scroll in the carousel and navigate typed
     day-settle, which maps the body to "none" and the heading text to
     day-text. Untyped transitions — browser back/forward, router.refresh(),
     Suspense reveals — map to "none" in the components. */
  ```
- Confirm nothing else references the class: `grep -rn "tp-crossfade\|SECTION_CROSSFADE" app components scripts docs/specs --exclude-dir=node_modules` must print only spec/ADR prose (no code).

- [ ] **Step 5: Run the tests**

Run: `npm test -- app/globals.view-transition.test.ts components/navigation/section-transition.test.tsx`
Expected: PASS.

- [ ] **Step 6: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/navigation/section-transition.tsx app/globals.css app/globals.view-transition.test.ts
git commit -m "feat(nav): section switches cut in one frame instead of crossfading (ADR 0065)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Day transition types and the full-width page-turn

**Files:**
- Modify: `components/trip/day/day-transition.ts`
- Modify: `app/globals.css` (the `.day-forward` / `.day-back` rules and the `tp-vt-slide` keyframe)
- Modify: `app/globals.view-transition.test.ts`

**Interfaces:**
- Produces: `DAY_SETTLE = "day-settle"`; `DAY_BODY_TRANSITION` maps it to `"none"`; `DAY_TEXT_TRANSITION` maps it to `DAY_TEXT`. `DAY_FORWARD`, `DAY_BACK`, `DAY_TEXT`, `dayTransitionType` unchanged.

- [ ] **Step 1: Write the failing CSS test**

Add to `app/globals.view-transition.test.ts`:

```ts
  it("day page-turn: a far jump slides full-width with no fade, clipped to the body (ADR 0065)", () => {
    for (const cls of ["day-forward", "day-back"]) {
      const old = css.match(new RegExp(`::view-transition-old\\(\\.${cls}\\)\\s*\\{([^}]*)\\}`))?.[1] ?? "";
      const neu = css.match(new RegExp(`::view-transition-new\\(\\.${cls}\\)\\s*\\{([^}]*)\\}`))?.[1] ?? "";
      for (const block of [old, neu]) {
        expect(block).not.toContain("tp-vt-fade");
        expect(block).toContain("100%");
        expect(block).toContain("300ms");
      }
    }
    expect(css).toMatch(/::view-transition-image-pair\(\.day-forward\),\s*::view-transition-image-pair\(\.day-back\)\s*\{\s*overflow:\s*clip;?\s*\}/);
    expect(css).not.toContain("tp-vt-slide");
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- app/globals.view-transition.test.ts`
Expected: FAIL (blocks contain `tp-vt-fade`, no `overflow: clip` rule).

- [ ] **Step 3: Rewrite `day-transition.ts`**

Full new content:

```ts
/**
 * Day-to-day motion (ADR 0063, amended by ADR 0065). Adjacent days scroll in
 * the carousel (components/trip/day/day-carousel.tsx) and navigate typed
 * day-settle: the body is already in place, so it maps to "none", while the
 * heading text still crossfades. A far jump from the strip is typed by
 * direction and runs the full-width page-turn in app/globals.css. Untyped
 * navigations (browser back/forward, router.refresh(), a section switch
 * landing on a day) map to "none".
 */
export const DAY_FORWARD = "day-forward";
export const DAY_BACK = "day-back";
export const DAY_SETTLE = "day-settle";

export const DAY_BODY_TRANSITION = {
  enter: { [DAY_FORWARD]: DAY_FORWARD, [DAY_BACK]: DAY_BACK, [DAY_SETTLE]: "none", default: "none" },
  exit: { [DAY_FORWARD]: DAY_FORWARD, [DAY_BACK]: DAY_BACK, [DAY_SETTLE]: "none", default: "none" },
  default: "none",
} as const;

export function dayTransitionType(fromISO: string, toISO: string): typeof DAY_FORWARD | typeof DAY_BACK {
  return toISO > fromISO ? DAY_FORWARD : DAY_BACK;
}

/**
 * The Day header's changing text (date, eyebrow, Day title, sub line)
 * crossfades in place on every typed day change (spec 2026-09-29 D4). The
 * arrows sit outside it and never move.
 */
export const DAY_TEXT = "day-text";

export const DAY_TEXT_TRANSITION = {
  enter: { [DAY_FORWARD]: DAY_TEXT, [DAY_BACK]: DAY_TEXT, [DAY_SETTLE]: DAY_TEXT, default: "none" },
  exit: { [DAY_FORWARD]: DAY_TEXT, [DAY_BACK]: DAY_TEXT, [DAY_SETTLE]: DAY_TEXT, default: "none" },
  default: "none",
} as const;
```

- [ ] **Step 4: Rewrite the CSS rules**

In `app/globals.css`, replace the `tp-vt-slide` keyframe line and the four `.day-forward` / `.day-back` lines (currently `@keyframes tp-vt-slide …` and the four `::view-transition-old/new(.day-forward|.day-back)` rules) with:

```css
/* Day body page-turn (ADR 0065): a far jump from the strip slides the old
   body out one edge as the new one slides in from the other — both on screen
   for the whole 300ms, no fade. Clipped to the body's box so nothing crosses
   the rail. Adjacent days never run this: the carousel has already scrolled
   and the navigation is typed day-settle → "none". */
@keyframes tp-vt-page-out { from { translate: 0 0; } to { translate: var(--tp-vt-to) 0; } }
@keyframes tp-vt-page-in { from { translate: var(--tp-vt-from) 0; } to { translate: 0 0; } }
::view-transition-image-pair(.day-forward), ::view-transition-image-pair(.day-back) { overflow: clip; }
::view-transition-old(.day-forward) { --tp-vt-to: -100%; animation: 300ms cubic-bezier(0.32, 0.72, 0, 1) both tp-vt-page-out; }
::view-transition-new(.day-forward) { --tp-vt-from: 100%; animation: 300ms cubic-bezier(0.32, 0.72, 0, 1) both tp-vt-page-in; }
::view-transition-old(.day-back) { --tp-vt-to: 100%; animation: 300ms cubic-bezier(0.32, 0.72, 0, 1) both tp-vt-page-out; }
::view-transition-new(.day-back) { --tp-vt-from: -100%; animation: 300ms cubic-bezier(0.32, 0.72, 0, 1) both tp-vt-page-in; }
```

Keep the `tp-vt-fade` keyframe: `.day-text` still uses it. Keep every `tp-tab-bar` / `tp-top-bar` rule and the reduced-motion block.

- [ ] **Step 5: Run the tests**

Run: `npm test -- app/globals.view-transition.test.ts components/trip/day`
Expected: PASS.

- [ ] **Step 6: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/trip/day/day-transition.ts app/globals.css app/globals.view-transition.test.ts
git commit -m "feat(day): day-settle transition type; far jumps page-turn full-width with no fade

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Carousel maths, the scroll tween, and the centred phone strip rule

**Files:**
- Create: `components/trip/day/carousel-maths.ts`
- Create: `components/trip/day/carousel-maths.test.ts`
- Create: `components/trip/day/scroll-tween.ts`
- Create: `components/trip/day/scroll-tween.test.ts`
- Modify: `components/trip/day/strip-scroll.ts` (`phoneStripScroll` becomes the centred rule; doc comment)
- Modify: `components/trip/day/strip-scroll.test.ts`

**Interfaces:**
- Produces:
  - `DAY_GLIDE_MS = 220`; `easeOut(t: number): number`
  - `settledPanel(scrollLeft: number, panelWidth: number, tolerancePx?: number): number | null`
  - `panelProgress(scrollLeft: number, shownIndex: number, panelWidth: number): number`
  - `tweenScrollLeft(el: { scrollLeft: number }, to: number, opts: { reduced: boolean; durationMs?: number; onDone?: () => void; raf?: (cb: (t: number) => void) => number; now?: () => number }): () => void` (returns cancel)
  - `prefersReducedMotion(): boolean`
  - `phoneStripScroll(i: StripScrollInput): number` — centred (same name, new rule)

- [ ] **Step 1: Write the failing tests**

`components/trip/day/carousel-maths.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { easeOut, panelProgress, settledPanel } from "./carousel-maths";

describe("settledPanel", () => {
  it("names the panel a scroller rests on, within a pixel", () => {
    expect(settledPanel(0, 390)).toBe(0);
    expect(settledPanel(390, 390)).toBe(1);
    expect(settledPanel(781, 390)).toBe(2);
  });
  it("is null between two panels, or with no width", () => {
    expect(settledPanel(200, 390)).toBeNull();
    expect(settledPanel(390, 0)).toBeNull();
  });
});

describe("panelProgress", () => {
  it("is 0 on the day shown, +1 on the next, −1 on the previous, fractional between", () => {
    expect(panelProgress(390, 1, 390)).toBe(0);
    expect(panelProgress(780, 1, 390)).toBe(1);
    expect(panelProgress(0, 1, 390)).toBe(-1);
    expect(panelProgress(585, 1, 390)).toBe(0.5);
    expect(panelProgress(100, 1, 0)).toBe(0);
  });
});

describe("easeOut", () => {
  it("starts at 0, ends at 1, is fast early and clamps", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.8);
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });
});
```

`components/trip/day/scroll-tween.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { tweenScrollLeft } from "./scroll-tween";

function fakeFrames() {
  let t = 0;
  const queue: Array<(t: number) => void> = [];
  return {
    raf: (cb: (t: number) => void) => { queue.push(cb); return queue.length; },
    now: () => t,
    tick(ms: number) { t += ms; const cbs = queue.splice(0); for (const cb of cbs) cb(t); },
  };
}

describe("tweenScrollLeft", () => {
  it("glides scrollLeft to the target over the duration and reports done once", () => {
    const f = fakeFrames();
    const el = { scrollLeft: 0 };
    const onDone = vi.fn();
    tweenScrollLeft(el, 390, { reduced: false, durationMs: 200, onDone, raf: f.raf, now: f.now });
    f.tick(0);
    expect(el.scrollLeft).toBe(0);
    f.tick(100);
    expect(el.scrollLeft).toBeGreaterThan(300);
    expect(el.scrollLeft).toBeLessThan(390);
    f.tick(100);
    expect(el.scrollLeft).toBe(390);
    f.tick(16);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  it("is instant under reduced motion, and when already there", () => {
    const f = fakeFrames();
    const el = { scrollLeft: 10 };
    const onDone = vi.fn();
    tweenScrollLeft(el, 390, { reduced: true, onDone, raf: f.raf, now: f.now });
    expect(el.scrollLeft).toBe(390);
    expect(onDone).toHaveBeenCalledTimes(1);
    tweenScrollLeft(el, 390, { reduced: false, onDone, raf: f.raf, now: f.now });
    expect(onDone).toHaveBeenCalledTimes(2);
  });
  it("can be cancelled mid-glide", () => {
    const f = fakeFrames();
    const el = { scrollLeft: 0 };
    const onDone = vi.fn();
    const cancel = tweenScrollLeft(el, 390, { reduced: false, durationMs: 200, onDone, raf: f.raf, now: f.now });
    f.tick(50);
    const mid = el.scrollLeft;
    cancel();
    f.tick(200);
    expect(el.scrollLeft).toBe(mid);
    expect(onDone).not.toHaveBeenCalled();
  });
});
```

In `components/trip/day/strip-scroll.test.ts`, replace the `describe("phoneStripScroll (unchanged rule)", …)` block with:

```ts
describe("phoneStripScroll (ADR 0065: the selected day sits in the centre)", () => {
  it("centres the selected chip in the strip's viewport", () => {
    expect(phoneStripScroll({ scrollLeft: 0, viewportWidth: 390, contentWidth: 2000, chipLeft: 471, chipWidth: 48, gap: 8 })).toBe(300);
  });
  it("clamps at the start", () => {
    expect(phoneStripScroll({ scrollLeft: 0, viewportWidth: 390, contentWidth: 2000, chipLeft: 100, chipWidth: 48, gap: 8 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- components/trip/day/carousel-maths.test.ts components/trip/day/scroll-tween.test.ts components/trip/day/strip-scroll.test.ts`
Expected: the first two FAIL to import; the strip test FAILS on the centred value.

- [ ] **Step 3: Write the maths**

`components/trip/day/carousel-maths.ts`:

```ts
/** Pure carousel arithmetic (ADR 0065), testable without layout. */

export const DAY_GLIDE_MS = 220;

/** Ease-out cubic: the app's day-motion feel, near enough cubic-bezier(0.32, 0.72, 0, 1). */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

/** The panel index a scroller is resting on, or null while it sits between two. */
export function settledPanel(scrollLeft: number, panelWidth: number, tolerancePx = 1): number | null {
  if (panelWidth <= 0) return null;
  const idx = Math.round(scrollLeft / panelWidth);
  return Math.abs(scrollLeft - idx * panelWidth) <= tolerancePx ? idx : null;
}

/** How far the body has moved from the day shown, in panels: −1 (previous fully in view) … 0 … +1 (next). */
export function panelProgress(scrollLeft: number, shownIndex: number, panelWidth: number): number {
  if (panelWidth <= 0) return 0;
  return (scrollLeft - shownIndex * panelWidth) / panelWidth;
}
```

`components/trip/day/scroll-tween.ts`:

```ts
import { DAY_GLIDE_MS, easeOut } from "@/components/trip/day/carousel-maths";

export interface TweenOptions {
  reduced: boolean;
  durationMs?: number;
  onDone?: () => void;
  raf?: (cb: (t: number) => void) => number;
  now?: () => number;
}

/**
 * Glides `el.scrollLeft` to `to` on the day curve; instant under reduced
 * motion. Drives scrollLeft directly rather than scrollTo({behavior:
 * "smooth"}) so the duration and curve match the body and the strip, and so
 * jsdom can run it. Returns a cancel.
 */
export function tweenScrollLeft(el: { scrollLeft: number }, to: number, opts: TweenOptions): () => void {
  const raf = opts.raf ?? ((cb) => requestAnimationFrame(cb));
  const now = opts.now ?? (() => performance.now());
  const duration = opts.durationMs ?? DAY_GLIDE_MS;
  const from = el.scrollLeft;
  if (opts.reduced || duration <= 0 || from === to) {
    el.scrollLeft = to;
    opts.onDone?.();
    return () => {};
  }
  let cancelled = false;
  const start = now();
  const step = () => {
    if (cancelled) return;
    const t = Math.min(1, (now() - start) / duration);
    el.scrollLeft = from + (to - from) * easeOut(t);
    if (t < 1) raf(step);
    else opts.onDone?.();
  };
  raf(step);
  return () => {
    cancelled = true;
  };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
```

In `components/trip/day/strip-scroll.ts`, replace the file's header comment and `phoneStripScroll`:

```ts
/**
 * Day strip scroll rules. Pure so they can be tested without layout.
 *
 * Desktop (lg+, spec 2026-09-29 D2): the strip stays where it is unless the
 * selected day — with one day's margin either side — would be out of view,
 * and then moves only as far as needed. A trip whose days all fit never
 * scrolls.
 *
 * Phone (< lg, ADR 0065): the selected day sits in the centre of the strip's
 * viewport. The scroller's end padding lets the first and last day centre
 * too, so the far end never needs clamping; 0 is clamped for safety.
 */
```

```ts
export function phoneStripScroll(i: StripScrollInput): number {
  return Math.max(0, i.chipLeft - (i.viewportWidth - i.chipWidth) / 2);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/trip/day/carousel-maths.test.ts components/trip/day/scroll-tween.test.ts components/trip/day/strip-scroll.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/trip/day/carousel-maths.ts components/trip/day/carousel-maths.test.ts components/trip/day/scroll-tween.ts components/trip/day/scroll-tween.test.ts components/trip/day/strip-scroll.ts components/trip/day/strip-scroll.test.ts
git commit -m "feat(day): carousel maths, a scroll tween on the day curve, and the centred phone strip rule

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `DayCarousel` — the paged scroller and its context

**Files:**
- Create: `components/trip/day/day-carousel.tsx`
- Create: `components/trip/day/day-carousel.test.tsx`

**Interfaces:**
- Consumes: `settledPanel`, `panelProgress` (Task 3); `tweenScrollLeft`, `prefersReducedMotion` (Task 3); `DAY_SETTLE`, `DAY_BODY_TRANSITION` (Task 2); `useAppRouter`; `useBeginNavigation`; `ViewTransition`.
- Produces:
  ```ts
  export interface DayPanel { iso: string; href: string; content: React.ReactNode }
  export interface DayCarouselApi {
    goTo: (href: string) => boolean;      // true = handled (glide+navigate, or swallowed while landing); false = not a panel
    subscribe: (cb: (progress: number, settled: boolean) => void) => () => void;  // settled=true once from settle(), after the last scroll frame
    isMoving: () => boolean;
  }
  export const SETTLE_QUIET_MS = 120;
  // Amended after the Task 4 review (ledger ruling): the scroller's own snapping is switched off
  // (`el.style.scrollSnapType = "none"`) for the length of a goTo tween and restored on arrival —
  // Chrome snaps programmatic scrollLeft writes, so a per-frame tween would stall then jump; the
  // glide is cancelled only on unmount; `navigating` re-arms when the pending navigation clears
  // without this page going away; effects key on the shown day's iso, not its index.
  export const DayCarouselContext: React.Context<DayCarouselApi | null>;
  export function useDayCarousel(): DayCarouselApi | null;
  export function DayCarousel(props: { panels: DayPanel[]; shownIndex: number; chrome: React.ReactNode }): JSX.Element;
  ```
  DOM: `[data-day-carousel][data-shown=<iso>]` scroller; children `[data-day-panel=<iso>]`, the shown one `data-shown="true"`, the others `inert` + `aria-hidden="true"` + class `h-0`.

- [ ] **Step 1: Write the failing tests**

`components/trip/day/day-carousel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import * as React from "react";
import { NavigationPendingProvider, useNavigationPending } from "@/components/navigation/navigation-pending";
import { setMatchMedia } from "@/test/setup";
import { DayCarousel, SETTLE_QUIET_MS, useDayCarousel, type DayCarouselApi } from "@/components/trip/day/day-carousel";

const push = vi.fn();
const prefetch = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn() }),
  usePathname: () => "/trips/t1/day/2026-12-12",
  useSearchParams: () => new URLSearchParams(),
}));

const WIDTH = 390;
const hrefs = ["2026-12-11", "2026-12-12", "2026-12-13"].map((iso) => `/trips/t1/day/${iso}`);
const panels = ["2026-12-11", "2026-12-12", "2026-12-13"].map((iso, i) => ({ iso, href: hrefs[i], content: <p>{`day ${iso}`}</p> }));
const FAKE_TIMERS = { toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance", "requestAnimationFrame", "cancelAnimationFrame"] as const };

let api: DayCarouselApi | null = null;
let pendingPath: string | null = null;
function Probe() {
  api = useDayCarousel();
  pendingPath = useNavigationPending()?.pathname ?? null;
  return null;
}

function mount(over: Partial<React.ComponentProps<typeof DayCarousel>> = {}) {
  const r = render(
    <NavigationPendingProvider>
      <DayCarousel panels={panels} shownIndex={1} chrome={<Probe />} {...over} />
    </NavigationPendingProvider>,
  );
  return { ...r, scroller: r.container.querySelector("[data-day-carousel]") as HTMLElement };
}

beforeEach(() => {
  push.mockClear();
  prefetch.mockClear();
  api = null;
  // jsdom has no layout: give every element the phone's width so panel maths works.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => WIDTH });
});
afterEach(() => {
  delete (HTMLElement.prototype as unknown as { clientWidth?: number }).clientWidth;
  vi.useRealTimers();
});

describe("DayCarousel", () => {
  it("renders the days in order, the neighbours inert and hidden, and rests on the day shown", () => {
    const { container, scroller } = mount();
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-day-panel]"));
    expect(items.map((p) => p.dataset.dayPanel)).toEqual(["2026-12-11", "2026-12-12", "2026-12-13"]);
    expect(items[1]).toHaveAttribute("data-shown", "true");
    expect(items[1]).not.toHaveAttribute("inert");
    for (const n of [items[0], items[2]]) {
      expect(n).toHaveAttribute("inert");
      expect(n).toHaveAttribute("aria-hidden", "true");
      expect(n.className).toContain("h-0");
    }
    expect(scroller).toHaveAttribute("data-shown", "2026-12-12");
    expect(scroller.scrollLeft).toBe(WIDTH);
    expect(scroller.className).toContain("snap-mandatory");
    expect(scroller.className).toContain("overscroll-x-contain");
  });

  it("prefetches both neighbours' routes", () => {
    mount();
    expect(prefetch.mock.calls.map((c) => c[0]).sort()).toEqual([hrefs[0], hrefs[2]]);
  });

  it("a drag that settles on the next day navigates typed day-settle with the vertical position kept", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller } = mount();
    scroller.scrollLeft = 2 * WIDTH;
    fireEvent.scroll(scroller);
    expect(push).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(SETTLE_QUIET_MS + 10); });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(hrefs[2], { scroll: false, transitionTypes: ["day-settle"] });
  });

  it("a scroll that rests on the day shown — the mount's own positioning — does nothing (review focus 5)", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const heard = vi.fn();
    const { scroller } = mount();
    api!.subscribe(heard);
    scroller.scrollLeft = WIDTH;
    fireEvent.scroll(scroller);
    act(() => { vi.advanceTimersByTime(SETTLE_QUIET_MS + 10); });
    expect(push).not.toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled();
  });

  it("subscribers hear the body's progress in panels", () => {
    const heard = vi.fn();
    const { scroller } = mount();
    const off = api!.subscribe(heard);
    scroller.scrollLeft = 1.5 * WIDTH;
    fireEvent.scroll(scroller);
    expect(heard).toHaveBeenLastCalledWith(0.5);
    expect(api!.isMoving()).toBe(true);
    off();
    scroller.scrollLeft = WIDTH;
    fireEvent.scroll(scroller);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("goTo a neighbour lights the target at once, glides the body, then navigates once", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    const { scroller } = mount();
    let handled = false;
    act(() => { handled = api!.goTo(hrefs[2]); });
    expect(handled).toBe(true);
    expect(pendingPath).toBe(hrefs[2]);
    expect(push).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(120); });
    expect(scroller.scrollLeft).toBeGreaterThan(WIDTH);
    expect(scroller.scrollLeft).toBeLessThan(2 * WIDTH);
    act(() => { vi.advanceTimersByTime(400); });
    expect(scroller.scrollLeft).toBe(2 * WIDTH);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(hrefs[2], { scroll: false, transitionTypes: ["day-settle"] });
  });

  it("goTo a day that is not a panel is false; a second goTo while one is landing is swallowed (review focus 2)", () => {
    vi.useFakeTimers(FAKE_TIMERS);
    mount();
    expect(api!.goTo("/trips/t1/day/2026-12-20")).toBe(false);
    act(() => { api!.goTo(hrefs[2]); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(push).toHaveBeenCalledTimes(1);
    let again = false;
    act(() => { again = api!.goTo(hrefs[0]); });
    expect(again).toBe(true);
    act(() => { vi.advanceTimersByTime(500); });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("under reduced motion goTo navigates without a glide (review focus 3)", () => {
    setMatchMedia((q) => q.includes("prefers-reduced-motion"));
    const { scroller } = mount();
    act(() => { api!.goTo(hrefs[0]); });
    expect(scroller.scrollLeft).toBe(0);
    expect(push).toHaveBeenCalledWith(hrefs[0], { scroll: false, transitionTypes: ["day-settle"] });
  });

  it("first day: only two panels, shown at index 0, no prefetch of a missing neighbour", () => {
    const { container, scroller } = mount({ panels: panels.slice(1), shownIndex: 0 });
    expect(container.querySelectorAll("[data-day-panel]")).toHaveLength(2);
    expect(scroller.scrollLeft).toBe(0);
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith(hrefs[2]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/trip/day/day-carousel.test.tsx`
Expected: FAIL to import `day-carousel`.

- [ ] **Step 3: Write the component**

`components/trip/day/day-carousel.tsx`:

```tsx
"use client";

import * as React from "react";
import { useAppRouter } from "@/components/navigation/use-app-router";
import { useBeginNavigation } from "@/components/navigation/navigation-pending";
import { ViewTransition } from "@/components/ui/view-transition";
import { DAY_BODY_TRANSITION, DAY_SETTLE } from "@/components/trip/day/day-transition";
import { panelProgress, settledPanel } from "@/components/trip/day/carousel-maths";
import { prefersReducedMotion, tweenScrollLeft } from "@/components/trip/day/scroll-tween";
import { cn } from "@/lib/cn";

export interface DayPanel {
  iso: string;
  href: string;
  content: React.ReactNode;
}

export interface DayCarouselApi {
  /** Glides the body to that day's panel and navigates on arrival. True when handled (or swallowed while a navigation lands); false when the day is not a panel. */
  goTo: (href: string) => boolean;
  /** The body's offset from the day shown, in panels (−1…1), on every scroll frame; the strip follows it. */
  subscribe: (cb: (progress: number) => void) => () => void;
  /** True while a drag or glide is under way — the strip then follows progress, not the lit chip. */
  isMoving: () => boolean;
}

/** Quiet time on a snap point that counts as "settled" where the browser has no scrollend. */
export const SETTLE_QUIET_MS = 120;

export const DayCarouselContext = React.createContext<DayCarouselApi | null>(null);

export function useDayCarousel(): DayCarouselApi | null {
  return React.useContext(DayCarouselContext);
}

/**
 * The Day view's paged carousel (ADR 0065): the day before, the day shown and
 * the day after as full-width panels in one snap-mandatory scroller. A drag
 * tracks the finger and snaps to a whole day; settling on a neighbour
 * navigates there, and the next page paints with that day already in view.
 * `chrome` (header, strip, keyboard nav) renders inside the context so its
 * controls can glide the body instead of navigating cold.
 */
export function DayCarousel({ panels, shownIndex, chrome }: { panels: DayPanel[]; shownIndex: number; chrome: React.ReactNode }) {
  const router = useAppRouter();
  const begin = useBeginNavigation();
  const scroller = React.useRef<HTMLDivElement>(null);
  const listeners = React.useRef(new Set<(progress: number) => void>());
  const moving = React.useRef(false);
  const navigating = React.useRef(false);
  const cancelGlide = React.useRef<() => void>(() => {});

  // On the day shown before first paint: no animation, no flash of a neighbour.
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = shownIndex * el.clientWidth;
  }, [shownIndex]);

  // Neighbours clip to the shown panel's height (they start at h-0), so a
  // short day beside a long one leaves no dead space below. Kept in step as
  // the shown panel's weather streams in. Imperative on purpose: state set
  // from an effect is what react-hooks/set-state-in-effect forbids.
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const shown = el.querySelector<HTMLElement>('[data-day-panel][data-shown="true"]');
    if (!shown) return;
    const others = Array.from(el.querySelectorAll<HTMLElement>('[data-day-panel]:not([data-shown="true"])'));
    const fit = () => {
      const h = `${shown.offsetHeight}px`;
      for (const o of others) o.style.height = h;
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(shown);
    return () => ro.disconnect();
  }, [shownIndex]);

  React.useEffect(() => {
    for (const p of panels) if (p.iso !== panels[shownIndex]?.iso) router.prefetch(p.href);
  }, [panels, shownIndex, router]);

  const navigateTo = React.useCallback(
    (idx: number) => {
      if (navigating.current) return;
      navigating.current = true;
      router.push(panels[idx].href, { scroll: false, transitionTypes: [DAY_SETTLE] } as Parameters<typeof router.push>[1]);
    },
    [panels, router],
  );

  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      const idx = settledPanel(el.scrollLeft, el.clientWidth);
      if (idx == null) return;
      moving.current = false;
      if (idx !== shownIndex) navigateTo(idx);
    };
    const onScroll = () => {
      const p = panelProgress(el.scrollLeft, shownIndex, el.clientWidth);
      // The mount's own positioning fires a scroll at rest; that is not a gesture.
      if (!moving.current && Math.abs(p) < 0.001) return;
      moving.current = true;
      for (const cb of listeners.current) cb(p);
      if (timer) clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_QUIET_MS);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const hasScrollEnd = "onscrollend" in el;
    if (hasScrollEnd) el.addEventListener("scrollend", settle);
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (hasScrollEnd) el.removeEventListener("scrollend", settle);
      if (timer) clearTimeout(timer);
      cancelGlide.current();
    };
  }, [shownIndex, navigateTo]);

  const api = React.useMemo<DayCarouselApi>(
    () => ({
      goTo: (href) => {
        const idx = panels.findIndex((p) => p.href === href);
        const el = scroller.current;
        if (idx < 0 || idx === shownIndex || !el) return false;
        if (navigating.current) return true;
        moving.current = true;
        begin(href);
        cancelGlide.current();
        cancelGlide.current = tweenScrollLeft(el, idx * el.clientWidth, { reduced: prefersReducedMotion(), onDone: () => navigateTo(idx) });
        return true;
      },
      subscribe: (cb) => {
        listeners.current.add(cb);
        return () => {
          listeners.current.delete(cb);
        };
      },
      isMoving: () => moving.current,
    }),
    [panels, shownIndex, begin, navigateTo],
  );

  const shownIso = panels[shownIndex]?.iso;
  return (
    <DayCarouselContext.Provider value={api}>
      {chrome}
      {/* Only the body runs a view transition, and only on a far jump (ADR 0065); header and strip stay put. */}
      <ViewTransition {...DAY_BODY_TRANSITION}>
        <div>
          <div
            ref={scroller}
            data-day-carousel
            data-shown={shownIso}
            className="-mx-4 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 md:mx-0"
          >
            {panels.map((p, i) => {
              const shown = i === shownIndex;
              return (
                <div
                  key={p.iso}
                  data-day-panel={p.iso}
                  data-shown={shown ? "true" : undefined}
                  inert={shown ? undefined : true}
                  aria-hidden={shown ? undefined : "true"}
                  className={cn("w-full shrink-0 snap-start snap-always px-4 sm:px-6 md:px-0", !shown && "h-0 overflow-hidden")}
                >
                  {p.content}
                </div>
              );
            })}
          </div>
          {/* Cold load: the server HTML paints before hydration, and a scroller
              starts at 0 — the day BEFORE the one asked for. Position it while
              the HTML parses. React never executes a script it inserts on a
              client navigation; the layout effect above covers those. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var s=document.currentScript&&document.currentScript.previousElementSibling;if(s)s.scrollLeft=${shownIndex}*s.clientWidth;})()`,
            }}
          />
        </div>
      </ViewTransition>
    </DayCarouselContext.Provider>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/trip/day/day-carousel.test.tsx`
Expected: PASS. If `inert` fails the type check, React 19.2's `HTMLAttributes` has `inert?: boolean` — check `@types/react` is 19.2.x (`node -p "require('@types/react/package.json').version"`); it is 19.2.17 on this machine.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/trip/day/day-carousel.tsx components/trip/day/day-carousel.test.tsx
git commit -m "feat(day): DayCarousel — a paged scroller of neighbouring days that navigates on settle (ADR 0065)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Arrows and keyboard glide through the carousel; retire the swipe tests

**Files:**
- Create: `components/trip/day/day-arrow.tsx`
- Modify: `components/trip/day/day-header.tsx` (drop the local `Arrow`, `ARROW`, `ARROW_OFF`; import `DayArrow`)
- Modify: `components/trip/day/day-keyboard-nav.tsx`
- Modify: `components/trip/day/day-nav-islands.test.tsx` (keyboard tests updated; every `DaySwipe` test removed)

**Interfaces:**
- Consumes: `useDayCarousel`, `DayCarouselContext` (Task 4); `DAY_FORWARD`, `DAY_BACK` (Task 2).
- Produces: `DayArrow({ href: string | null; label: string | null; dir: "prev" | "next" })` — the same DOM as the old `Arrow` (an `AppLink` with `aria-label`, or the disabled `span[role=link][aria-disabled=true]`), plus `scroll={false}`.

- [ ] **Step 1: Write the failing tests**

Replace `components/trip/day/day-nav-islands.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { DayKeyboardNav } from "@/components/trip/day/day-keyboard-nav";
import { DayArrow } from "@/components/trip/day/day-arrow";
import { DayCarouselContext, type DayCarouselApi } from "@/components/trip/day/day-carousel";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/trips/t1/day/2026-12-04", useSearchParams: () => new URLSearchParams() }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: false }), default: ({ href, children, onNavigate, transitionTypes, scroll, ...rest }: any) => <a href={href} data-transition={Array.isArray(transitionTypes) ? transitionTypes.join(" ") : undefined} data-scroll={String(scroll)} onClick={(e) => { e.preventDefault(); onNavigate?.({ preventDefault() {} }); }} {...rest}>{children}</a> }));

function carousel(goTo: (href: string) => boolean): DayCarouselApi {
  return { goTo, subscribe: () => () => {}, isMoving: () => false };
}

describe("DayKeyboardNav", () => {
  beforeEach(() => push.mockClear());
  it("← and → navigate, keeping the vertical position, when there is no carousel", () => {
    render(<DayKeyboardNav prevHref="/p" nextHref="/n" />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(push.mock.calls).toEqual([["/n", { scroll: false, transitionTypes: ["day-forward"] }], ["/p", { scroll: false, transitionTypes: ["day-back"] }]]);
  });
  it("← and → glide the carousel when it has the neighbour, and fall back to a push when it does not", () => {
    const goTo = vi.fn((href: string) => href === "/n");
    render(<DayCarouselContext.Provider value={carousel(goTo)}><DayKeyboardNav prevHref="/p" nextHref="/n" /></DayCarouselContext.Provider>);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(goTo).toHaveBeenCalledWith("/n");
    expect(push).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(goTo).toHaveBeenCalledWith("/p");
    expect(push).toHaveBeenCalledWith("/p", { scroll: false, transitionTypes: ["day-back"] });
  });
  it("does nothing while typing or at the boundary", () => {
    render(<><DayKeyboardNav prevHref={null} nextHref="/n" /><textarea aria-label="j" /></>);
    fireEvent.keyDown(screen.getByLabelText("j"), { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(push).not.toHaveBeenCalled();
  });
  it("leaves arrow keys on the Day map to Leaflet", () => {
    render(<><DayKeyboardNav prevHref="/p" nextHref="/n" /><div className="leaflet-container"><button>map</button></div></>);
    fireEvent.keyDown(screen.getByText("map"), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByText("map"), { key: "ArrowLeft" });
    expect(push).not.toHaveBeenCalled();
  });
});

describe("DayArrow", () => {
  it("is a link typed by direction that keeps the vertical position; a missing day is a disabled span", () => {
    render(<><DayArrow href="/n" label="Next day: Sun" dir="next" /><DayArrow href={null} label={null} dir="prev" /></>);
    const next = screen.getByRole("link", { name: "Next day: Sun" });
    expect(next).toHaveAttribute("data-transition", "day-forward");
    expect(next).toHaveAttribute("data-scroll", "false");
    expect(screen.getByLabelText("Previous day")).toHaveAttribute("aria-disabled", "true");
  });
  it("hands the tap to the carousel when it has the neighbour, so the link's own navigation never starts", () => {
    const goTo = vi.fn(() => true);
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={carousel(goTo)}><DayArrow href="/n" label="Next day: Sun" dir="next" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    fireEvent.click(screen.getByRole("link", { name: "Next day: Sun" }));
    expect(goTo).toHaveBeenCalledWith("/n");
    expect(screen.getByRole("link", { name: "Next day: Sun" }).className).not.toContain("bg-coral");
  });
  it("stays a plain link when the carousel does not have the day (AppLink reports the navigation itself)", () => {
    const goTo = vi.fn(() => false);
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={carousel(goTo)}><DayArrow href="/n" label="Next day: Sun" dir="next" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    fireEvent.click(screen.getByRole("link", { name: "Next day: Sun" }));
    expect(screen.getByRole("link", { name: "Next day: Sun" }).className).toContain("bg-coral");
  });
});
```

(`AppLink` adds `pendingClassName` — `bg-coral` — while its own navigation is pending, which only happens when the carousel declined.)

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/trip/day/day-nav-islands.test.tsx`
Expected: FAIL to import `day-arrow`; keyboard expectations fail on the missing `scroll: false`.

- [ ] **Step 3: Write `DayArrow`**

`components/trip/day/day-arrow.tsx`:

```tsx
"use client";

import { AppLink } from "@/components/navigation/app-link";
import { DAY_BACK, DAY_FORWARD } from "@/components/trip/day/day-transition";
import { useDayCarousel } from "@/components/trip/day/day-carousel";
import { ChevronLeft, ChevronRight } from "lucide-react";

const ARROW =
  "pressable inline-grid size-11 shrink-0 place-items-center rounded-[12px] border-2 border-border bg-card text-foreground shadow-hard-1 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";
const ARROW_OFF = "inline-grid size-11 shrink-0 place-items-center rounded-[12px] border-2 border-border bg-card text-foreground opacity-40";

/**
 * 44px prev/next day arrow — a real link (works without JS); 40% and inert at
 * the trip's ends. With the carousel mounted it glides the body to the
 * neighbour and navigates on arrival (ADR 0065); otherwise the link runs the
 * page-turn. Either way the vertical position is kept.
 */
export function DayArrow({ href, label, dir }: { href: string | null; label: string | null; dir: "prev" | "next" }) {
  const carousel = useDayCarousel();
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const icon = <Icon className="size-5" strokeWidth={2.5} aria-hidden="true" />;
  if (!href) {
    return (
      <span aria-label={dir === "prev" ? "Previous day" : "Next day"} aria-disabled="true" role="link" className={ARROW_OFF}>
        {icon}
      </span>
    );
  }
  return (
    <AppLink
      href={href}
      scroll={false}
      aria-label={label ?? undefined}
      transitionTypes={[dir === "prev" ? DAY_BACK : DAY_FORWARD]}
      className={ARROW}
      // Lit the moment it is tapped: the page holds until the next day is ready (ADR 0063).
      pendingClassName="translate-y-px bg-coral shadow-none"
      onNavigate={(e) => {
        if (carousel?.goTo(href)) e.preventDefault();
      }}
    >
      {icon}
    </AppLink>
  );
}
```

- [ ] **Step 4: Point the header at it**

In `components/trip/day/day-header.tsx`:
- Delete the `ARROW` and `ARROW_OFF` constants and the whole local `function Arrow(...)`.
- Delete the imports of `AppLink`, `DAY_BACK`, `DAY_FORWARD`, `ChevronLeft`, `ChevronRight` (keep `DAY_TEXT_TRANSITION`).
- Add `import { DayArrow } from "@/components/trip/day/day-arrow";`
- Replace `<Arrow href={prevHref} label={prevLabel} dir="prev" />` with `<DayArrow href={prevHref} label={prevLabel} dir="prev" />` and the same for `next`.

- [ ] **Step 5: Rewrite the keyboard nav**

`components/trip/day/day-keyboard-nav.tsx`:

```tsx
"use client";
import * as React from "react";
import { useAppRouter } from "@/components/navigation/use-app-router";
import { useDayCarousel } from "@/components/trip/day/day-carousel";
import { DAY_BACK, DAY_FORWARD } from "@/components/trip/day/day-transition";

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

/** ← / → change day (DAY_VIEW §2), never while typing, inside a dialog, or
 *  on the Day map (Leaflet pans with the arrow keys). Through the carousel
 *  when it has the neighbour (ADR 0065), else a typed navigation. */
export function DayKeyboardNav({ prevHref, nextHref }: { prevHref: string | null; nextHref: string | null }) {
  const router = useAppRouter();
  const carousel = useDayCarousel();
  React.useEffect(() => {
    const go = (href: string, type: string) => {
      if (!carousel?.goTo(href)) router.push(href, { scroll: false, transitionTypes: [type] } as Parameters<typeof router.push>[1]);
    };
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && (TYPING.test(t.tagName) || (t as HTMLElement).isContentEditable || t.closest("[role=dialog],.leaflet-container"))) return;
      if (e.key === "ArrowRight" && nextHref) go(nextHref, DAY_FORWARD);
      else if (e.key === "ArrowLeft" && prevHref) go(prevHref, DAY_BACK);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, carousel, prevHref, nextHref]);
  return null;
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- components/trip/day`
Expected: PASS (the Day page test still mocks `DaySwipe`, which still exists until Task 7).

- [ ] **Step 7: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/trip/day/day-arrow.tsx components/trip/day/day-header.tsx components/trip/day/day-keyboard-nav.tsx components/trip/day/day-nav-islands.test.tsx
git commit -m "feat(day): arrows and arrow keys glide the carousel to the neighbour, keeping the vertical position

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The Day strip — centred on the phone, bleeding both edges, gliding, following the body

**Files:**
- Modify: `components/trip/day/day-strip.tsx` (full rewrite below)
- Modify: `components/trip/day/day-strip.test.tsx`

**Interfaces:**
- Consumes: `useDayCarousel` (Task 4) — its `subscribe` callback is `(progress: number, settled: boolean)`; `tweenScrollLeft`, `prefersReducedMotion` (Task 3); `phoneStripScroll` centred (Task 3).
- Snapping rule (amendment after the Task 4 review, ledger ruling): the phone strip is `snap-x snap-mandatory`, and Chrome snaps programmatic `scrollLeft` writes, so every programmatic move switches the strip's snapping off first (`nav.style.scrollSnapType = "none"`) and restores it (`""`) when the move is over: the follow callback restores on `settled === true`; the lit-change tween restores in its `onDone`.
- Produces: `DayStrip` with the same props. DOM changes: phone outer `-mx-4 sm:-mx-6`; phone scroller `snap-x snap-mandatory px-[calc(50%-1.5rem)]`; phone chips `snap-center`; chips carry `scroll={false}`.

- [ ] **Step 1: Write the failing tests**

In `components/trip/day/day-strip.test.tsx`:

- Replace the `next/link` mock with one that also exposes `scroll`:

```tsx
// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: false }), default: ({ href, children, onNavigate, transitionTypes, scroll, ...rest }: any) => <a href={href} data-transition={Array.isArray(transitionTypes) ? transitionTypes.join(" ") : undefined} data-scroll={String(scroll)} onClick={(e) => { e.preventDefault(); onNavigate?.({ preventDefault() {} }); }} {...rest}>{children}</a> }));
```

- Add the imports `import { act } from "@testing-library/react";` (fold into the existing import) and `import { DayCarouselContext, type DayCarouselApi } from "@/components/trip/day/day-carousel";`.

- In the test `"is a horizontal scroller at every width …"`, change the two phone assertions at the end to:

```tsx
    const phoneScroller = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
    expect(phoneScroller.className).toContain("snap-x");
    expect(phoneScroller.className).toContain("snap-mandatory");
    expect(phoneScroller.className).toContain("px-[calc(50%-1.5rem)]");
    expect(phoneScroller.className).not.toContain("pr-[18px]");
    expect((document.querySelector("[data-day-strip]") as HTMLElement).className).toContain("-mx-4");
    const fri = screen.getByRole("link", { name: /Fri 11 Dec/ });
    expect(fri.className).toContain("w-12");
    expect(fri.className).toContain("snap-center");
```

- Add these tests inside `describe("DayStrip", …)`:

```tsx
  it("every chip keeps the vertical position", () => {
    render(<DayStrip tripId="t1" dates={dates} line={segments} size="phone" />);
    for (const a of screen.getAllByRole("link")) expect(a).toHaveAttribute("data-scroll", "false");
  });
  it("phone: follows the body's progress through the carousel, and a far chip stays a link (review focus 4)", () => {
    let emit: (p: number, settled: boolean) => void = () => {};
    const goTo = vi.fn(() => false);
    const api: DayCarouselApi = { goTo, subscribe: (cb) => { emit = cb; return () => {}; }, isMoving: () => false };
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={api}><DayStrip tripId="t1" dates={dates} line={segments} size="phone" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    const scroller = document.querySelector("[data-day-strip-scroller]") as HTMLElement;
    scroller.scrollLeft = 0;
    act(() => emit(0.5, false));
    expect(scroller.scrollLeft).toBeGreaterThan(0);
    // Snapping is off while the body drives the strip, and back once it has settled.
    expect(scroller.style.scrollSnapType).toBe("none");
    act(() => emit(1, true));
    expect(scroller.style.scrollSnapType).toBe("");
    const links = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link");
    fireEvent.click(links[0]);
    expect(goTo).toHaveBeenCalledWith("/trips/t1/day/2026-12-09");
    expect(links[0]).toHaveAttribute("data-pending", "true");
  });
  it("an adjacent chip hands the tap to the carousel, so AppLink's own report never runs", () => {
    const goTo = vi.fn(() => true);
    const api: DayCarouselApi = { goTo, subscribe: () => () => {}, isMoving: () => false };
    render(<NavigationPendingProvider><DayCarouselContext.Provider value={api}><DayStrip tripId="t1" dates={dates} line={segments} size="phone" /></DayCarouselContext.Provider></NavigationPendingProvider>);
    const links = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("link");
    fireEvent.click(links[4]);
    expect(goTo).toHaveBeenCalledWith("/trips/t1/day/2026-12-13");
    expect(links[4]).not.toHaveAttribute("data-pending");
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/trip/day/day-strip.test.tsx`
Expected: FAIL on the new class assertions, `data-scroll`, and the carousel tests.

- [ ] **Step 3: Rewrite the strip**

`components/trip/day/day-strip.tsx` — full new content (the chip and line markup is unchanged from today; the scroll logic is new):

```tsx
"use client";

import * as React from "react";
import { AppLink } from "@/components/navigation/app-link";
import { useNavState } from "@/components/navigation/navigation-pending";
import { DAY_FORWARD, dayTransitionType } from "@/components/trip/day/day-transition";
import { useDayCarousel } from "@/components/trip/day/day-carousel";
import { prefersReducedMotion, tweenScrollLeft } from "@/components/trip/day/scroll-tween";
import { cn } from "@/lib/cn";
import { formatDayLabel, parseISODate } from "@/lib/dates";
import { stopDotClass } from "@/lib/stop-colours";
import { dotsFor, type StopLine } from "@/lib/day-view-model";
import { desktopStripScroll, phoneStripScroll, STRIP_CHIP_GAP_PX, type StripScrollInput } from "@/components/trip/day/strip-scroll";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import { useTripHref } from "@/components/trip/use-trip-href";

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * Where the Traveller left each strip, keyed `${tripId}:${size}`. The strip
 * lives inside the Day page, which remounts on every day change (ADR 0063),
 * so without this it would snap to the target on each remount instead of
 * gliding there. Module state: kept across client navigations, reset by a
 * full load — a first render is positioned cold, with no glide.
 */
const lastScrollLeft = new Map<string, number>();

/** The scroll position the rule for this size wants for `chip`, `shiftPx` to its right. */
function targetFor(nav: HTMLElement, chip: HTMLElement, useDesktopRule: boolean, from: number, shiftPx = 0): number {
  const rect = chip.getBoundingClientRect();
  const input: StripScrollInput = {
    scrollLeft: from,
    viewportWidth: nav.clientWidth,
    contentWidth: nav.scrollWidth,
    chipLeft: rect.left - nav.getBoundingClientRect().left + nav.scrollLeft + shiftPx,
    chipWidth: rect.width,
    gap: STRIP_CHIP_GAP_PX,
  };
  return useDesktopRule ? desktopStripScroll(input) : phoneStripScroll(input);
}

export function DayStrip({ tripId, dates, line, size }: { tripId: string; dates: Array<{ iso: string; count: number; isCurrent: boolean; isToday: boolean }>; line: StopLine; size: "desktop" | "phone" }) {
  const phone = size === "phone";
  const tripHref = useTripHref(tripId);
  const carousel = useDayCarousel();
  const scroller = React.useRef<HTMLDivElement>(null);
  const cancelGlide = React.useRef<() => void>(() => {});
  const memoryKey = `${tripId}:${size}`;

  // The chip lights the moment it is tapped (ADR 0063): while a navigation to
  // another day is in flight the effective pathname already names it. Any
  // other pending target (a section switch) keeps the server's answer.
  // aria-current="date" is the server's answer alone — the day actually shown.
  const { effectivePathname: path, pendingPathname } = useNavState();
  const serverCurrent = dates.find((d) => d.isCurrent)?.iso ?? null;
  const isLit = (iso: string) => (path.includes("/day/") ? path.endsWith(`/day/${iso}`) : iso === serverCurrent);
  const isPendingChip = (iso: string) => pendingPathname != null && pendingPathname.endsWith(tripHref(`/day/${iso}`));
  const litIndex = dates.findIndex((d) => isLit(d.iso));

  // Put the lit chip where its rule wants it (phone: centred; desktop at lg+:
  // the minimal-scroll rule, spec 2026-09-29 D2; the md–lg band shows the
  // desktop strip but is "< lg" and centres). A first render after a full load
  // is positioned cold; every later mount or lit change glides from where the
  // strip was — unless the carousel is driving it, which follows the body.
  React.useLayoutEffect(() => {
    const nav = scroller.current;
    if (!nav) return;
    const chip = nav.querySelector<HTMLElement>('[data-lit="true"]') ?? nav.querySelector<HTMLElement>('[aria-current="date"]');
    if (!chip) return;
    const useDesktopRule = !phone && window.matchMedia("(min-width: 1024px)").matches;
    const remembered = lastScrollLeft.get(memoryKey);
    const target = targetFor(nav, chip, useDesktopRule, remembered ?? nav.scrollLeft);
    if (remembered == null) {
      nav.scrollLeft = target;
      lastScrollLeft.set(memoryKey, target);
      return;
    }
    nav.scrollLeft = remembered;
    if (carousel?.isMoving()) return;
    cancelGlide.current();
    // Chrome snaps programmatic scrollLeft writes: snapping is off for the glide.
    nav.style.scrollSnapType = "none";
    cancelGlide.current = tweenScrollLeft(nav, target, {
      reduced: prefersReducedMotion(),
      onDone: () => {
        nav.style.scrollSnapType = "";
      },
    });
    return () => {
      cancelGlide.current();
      nav.style.scrollSnapType = "";
    };
  }, [phone, memoryKey, litIndex, carousel]);

  // Phone: the strip moves with the body. Progress is in panels from the day
  // shown (aria-current, not the lit chip: a glide lights its target at once
  // while progress still counts from the day shown).
  React.useEffect(() => {
    if (!phone || !carousel) return;
    const nav = scroller.current;
    if (!nav) return;
    return carousel.subscribe((progress, settled) => {
      const shown = nav.querySelector<HTMLElement>('[aria-current="date"]');
      if (!shown) return;
      cancelGlide.current();
      const stride = shown.getBoundingClientRect().width + STRIP_CHIP_GAP_PX;
      nav.style.scrollSnapType = "none";
      nav.scrollLeft = targetFor(nav, shown, false, nav.scrollLeft, progress * stride);
      if (settled) nav.style.scrollSnapType = "";
    });
  }, [phone, carousel]);

  // Desktop: a vertical wheel gesture over the strip scrolls it horizontally
  // instead — but only when the strip actually has overflow to scroll, and
  // only by *not* also scrolling the page vertically. React's onWheel is
  // registered passively at the root, so calling preventDefault from a
  // synthetic handler is a no-op (and can warn); a native listener with
  // `{ passive: false }` is required to actually suppress the page scroll.
  React.useEffect(() => {
    if (phone) return;
    const el = scroller.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || e.deltaX !== 0) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [phone]);

  // One highlight that moves, rather than each chip painting its own coral,
  // so the selection glides to the tapped day (spec 2026-09-29 D4). Chips are
  // fixed-width: phone 3rem (w-12), desktop 3.5rem (w-14), plus the 0.5rem gap.
  const strideRem = phone ? 3.5 : 4;

  const n = dates.length;
  return (
    <div data-day-strip className={cn("flex flex-col gap-2", phone && "-mx-4 sm:-mx-6")}>
      <div
        ref={scroller}
        data-day-strip-scroller
        // One scroll container for the chip nav and the desktop city legend
        // (DV-01: they used to scroll separately, so the legend's cells drifted
        // out from under their chips). Phone: chips snap to the centre and the
        // end padding lets the first and last day centre too (ADR 0065).
        className={cn("flex flex-col gap-2 overflow-x-auto [scrollbar-width:none]", phone && "snap-x snap-mandatory px-[calc(50%-1.5rem)]")}
        onScroll={(e) => lastScrollLeft.set(memoryKey, e.currentTarget.scrollLeft)}
      >
        <nav aria-label="Days" className="relative flex w-max gap-2">
          {litIndex >= 0 ? (
            <span
              data-strip-highlight
              aria-hidden="true"
              className={cn(
                "island pointer-events-none absolute left-0 top-0 rounded-[14px] border-2 border-border bg-coral shadow-hard-1 transition-transform duration-200 ease-out motion-reduce:transition-none",
                phone ? "h-[58px] w-12" : "h-[62px] w-14",
              )}
              style={{ transform: `translateX(${litIndex * strideRem}rem)` }}
            />
          ) : null}
          {dates.map((d) => {
            const dt = parseISODate(d.iso);
            const dots = dotsFor(d.count);
            const label = `${formatDayLabel(d.iso)}, ${d.count === 0 ? "nothing planned" : `${d.count} ${d.count === 1 ? "thing" : "things"} planned`}`;
            const href = tripHref(`/day/${d.iso}`);
            return (
              <AppLink
                key={d.iso}
                href={href}
                scroll={false}
                aria-current={d.isCurrent ? "date" : undefined}
                data-pending={isPendingChip(d.iso) ? "true" : undefined}
                data-lit={isLit(d.iso) ? "true" : undefined}
                aria-label={label}
                transitionTypes={[serverCurrent ? dayTransitionType(serverCurrent, d.iso) : DAY_FORWARD]}
                // A neighbour glides in the carousel; a far day is a page-turn (ADR 0065).
                onNavigate={(e) => {
                  if (carousel?.goTo(href)) e.preventDefault();
                }}
                className={cn(
                  "relative flex shrink-0 flex-col items-center justify-center rounded-[14px] border-2 border-border text-foreground",
                  phone ? "h-[58px] w-12 snap-center" : "h-[62px] w-14 snap-start",
                  isLit(d.iso) ? "island bg-transparent" : "bg-card",
                )}
              >
                <span className="text-[11px] font-bold leading-none">{WEEKDAY[dt.getUTCDay()]}</span>
                <span className="mt-0.5 font-display text-[20px] font-extrabold leading-none">{dt.getUTCDate()}</span>
                <span className="mt-1 flex h-1.5 gap-1">
                  {Array.from({ length: dots }, (_, i) => <span key={i} data-dot className="size-1.5 rounded-full bg-current" />)}
                </span>
                {d.isToday ? <span data-today-underline aria-hidden="true" className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-coral" /> : null}
              </AppLink>
            );
          })}
        </nav>
        {!phone && line.segments.length > 0 ? (
          <div className="grid w-max gap-2" style={{ gridTemplateColumns: `repeat(${n}, 3.5rem)` }} aria-hidden="true">
            {line.segments.map((s, i) => {
              const first = i === 0;
              const last = i === line.segments.length - 1;
              const Icon = s.kind === "gap" && s.mode ? TRANSPORT_MODE_META[s.mode].icon : null;
              return (
                <div
                  key={`${s.kind}-${s.startIndex}`}
                  data-line-segment={s.kind}
                  className="flex min-w-0 items-center gap-1.5"
                  style={{ gridColumn: `${s.startIndex + 1} / span ${s.span}` }}
                >
                  {first && line.homeStart ? (
                    <>
                      {/* The Home base, by name, styled like a Stop's dot (never "Home" — CONTEXT.md). */}
                      <span data-home-dot className="size-2 shrink-0 rounded-full border border-border bg-muted-foreground" />
                      <span className="truncate text-xs font-bold text-foreground">{line.homeStart}</span>
                    </>
                  ) : null}
                  {s.kind === "stop" ? (
                    <>
                      <span className={cn("size-2 shrink-0 rounded-full border border-border", stopDotClass(s.hueIndex))} />
                      <span className="truncate text-xs font-bold text-foreground">{s.name}</span>
                      <span className="h-0.5 min-w-2 flex-1 rounded-full bg-border-soft" />
                    </>
                  ) : (
                    <>
                      {Icon ? <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
                      {s.label ? <span className="truncate text-xs font-bold text-muted-foreground">{s.label}</span> : null}
                      <span data-line-dashed className="h-0 min-w-2 flex-1 border-t-2 border-dashed border-border-soft" />
                    </>
                  )}
                  {last && line.homeEnd ? (
                    <>
                      <span data-home-dot className="size-2 shrink-0 rounded-full border border-border bg-muted-foreground" />
                      <span className="truncate text-xs font-bold text-foreground">{line.homeEnd}</span>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/trip/day/day-strip.test.tsx components/trip/day/strip-scroll.test.ts`
Expected: PASS. (In jsdom every rect is 0 and `clientWidth` is 0, so the follow test's scrollLeft is `0.5 × 8px gap = 4` — the assertion only needs `> 0`.)

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/trip/day/day-strip.tsx components/trip/day/day-strip.test.tsx
git commit -m "feat(day): the strip centres the day shown on the phone, bleeds both edges, glides, and follows the body

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The Day page renders three days through the carousel; the swipe handler goes

**Files:**
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx` (full rewrite below)
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.test.tsx`
- Delete: `components/trip/day/day-swipe.tsx`

**Interfaces:**
- Consumes: `DayCarousel`, `DayPanel` (Task 4); `DayKeyboardNav` (Task 5); `DayStrip` (Task 6); `addDays` from `@/lib/dates`.
- Produces: the page calls `getDay` three times (date−1, date, date+1) in parallel; each panel's content root is `<div data-day-body>`; the header's h1 is outside the panels.

- [ ] **Step 1: Update the page test (failing first)**

In `app/(app)/trips/[tripId]/day/[date]/page.test.tsx`:

- Replace the `DaySwipe` mock line with a `DayCarousel` mock:

```tsx
vi.mock("@/components/trip/day/day-carousel", () => ({
  DayCarousel: ({ panels, shownIndex, chrome }: { panels: Array<{ iso: string; content: React.ReactNode }>; shownIndex: number; chrome: React.ReactNode }) => (
    <>
      {chrome}
      <div data-day-carousel>
        {panels.map((p, i) => (
          <div key={p.iso} data-day-panel={p.iso} data-shown={i === shownIndex ? "true" : undefined} aria-hidden={i === shownIndex ? undefined : "true"}>
            {p.content}
          </div>
        ))}
      </div>
    </>
  ),
}));
```

- Add `import { addDays } from "@/lib/dates";` and, after `fixture`, a per-date resolver used as the default mock:

```tsx
// getDay is asked for the day before, the day shown and the day after (ADR
// 0065). Same content, dated; a date outside the fixture Trip is out of range.
function dayFor(over: Partial<DayViewData> = {}) {
  return (_tripId: string, date: string) => {
    if (date < "2026-12-04" || date > "2027-01-08") return Promise.resolve("out-of-range" as const);
    return Promise.resolve(fixture({ date, prevDate: date === "2026-12-04" ? null : addDays(date, -1), nextDate: date === "2027-01-08" ? null : addDays(date, 1), isFirst: date === "2026-12-04", isLast: date === "2027-01-08", ...over }));
  };
}
const shownPanel = (container: HTMLElement) => container.querySelector('[data-day-panel][data-shown="true"]') as HTMLElement;
```

- In `beforeEach`, replace `getDayMock.mockResolvedValue(fixture());` with `getDayMock.mockImplementation(dayFor());`.
- Everywhere a test does `getDayMock.mockResolvedValue(fixture({ ... }))`, change it to `getDayMock.mockImplementation(dayFor({ ... }))` (the `invalid` / `out-of-range` / `dateless` test keeps `mockResolvedValue` with the string).
- In the first test, change `expect(getDayMock).toHaveBeenCalledWith("t1", "2026-12-12", "u1");` to:

```tsx
    expect(getDayMock.mock.calls.map((c) => c[1]).sort()).toEqual(["2026-12-11", "2026-12-12", "2026-12-13"]);
```

  and scope the body-only assertions to the shown panel: `screen.getByText("Opens on the day")` → `within(shownPanel(container)).getByText("Opens on the day")` (destructure `{ container }` from `renderPage()`); `screen.queryByTestId("journal-editor")` → `within(shownPanel(container)).queryByTestId("journal-editor")`.
- "emits both Tonight wrappers": `container.querySelectorAll(...)` → `shownPanel(container).querySelectorAll('[data-slot="tonight"]')`.
- "empty day … (spec 2026-09-29 D5)": `container.querySelectorAll<HTMLElement>('[data-slot="day-plan-empty"]')` → `shownPanel(container).querySelectorAll<HTMLElement>(...)`, and the `section[aria-labelledby…]` loop likewise scoped to `shownPanel(container)`.
- "phone order: strip → weather → plan → tonight → journal": `screen.getAllByText("Hôtel Cour du Corbeau")[0]` → `within(shownPanel(container)).getAllByText("Hôtel Cour du Corbeau")[0]` (the previous day's panel comes first in the DOM and has a Tonight card too).
- "a busy day keeps the max height": `container.querySelector('[data-slot="day-plan-body"][data-size="desktop"]')` → `shownPanel(container).querySelector(...)`.
- "both desktop columns are top-aligned": both `container.querySelector(...)` calls → `shownPanel(container).querySelector(...)`.
- "on the day with an entry: the editor shows straight away": `screen.getByTestId("journal-editor")` → `within(shownPanel(container)).getByTestId("journal-editor")` (destructure `container`).
- "on the day with nothing written": after the click, `screen.getByTestId("journal-editor")` → `within(shownPanel(container)).getByTestId("journal-editor")`.
- "last day hides Tonight": change the mock to `getDayMock.mockImplementation(dayFor())` and call `renderPage("2027-01-08")`; scope both the `queryByText("Hôtel Cour du Corbeau")` and the `[data-slot="tonight"]` query to `within(shownPanel(container))` / `shownPanel(container)` (the day before is not last and has a Tonight card); keep the `Next day` assertion.
- Add two tests:

```tsx
  it("renders the day before and after as hidden panels around the day shown (ADR 0065)", async () => {
    const { container } = await renderPage();
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-day-panel]"));
    expect(items.map((p) => p.dataset.dayPanel)).toEqual(["2026-12-11", "2026-12-12", "2026-12-13"]);
    expect(items[1]).toHaveAttribute("data-shown", "true");
    for (const p of items) expect(p.querySelector("[data-day-body]")).not.toBeNull();
    // The heading belongs to the page, not a panel.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("first day: two panels, shown at index 0 (review focus 1)", async () => {
    const { container } = await renderPage("2026-12-04");
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-day-panel]"));
    expect(items.map((p) => p.dataset.dayPanel)).toEqual(["2026-12-04", "2026-12-05"]);
    expect(items[0]).toHaveAttribute("data-shown", "true");
    expect(screen.getByLabelText("Previous day")).toHaveAttribute("aria-disabled", "true");
  });

  it("a neighbour the loader clamped back onto the day shown is not a panel", async () => {
    getDayMock.mockImplementation((_t: string, date: string) => Promise.resolve(fixture({ date: date > "2026-12-12" ? "2026-12-12" : date, prevDate: "2026-12-11", nextDate: null })));
    const { container } = await renderPage();
    expect(Array.from(container.querySelectorAll<HTMLElement>("[data-day-panel]")).map((p) => p.dataset.dayPanel)).toEqual(["2026-12-11", "2026-12-12"]);
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- "app/(app)/trips/[tripId]/day/[date]/page.test.tsx"`
Expected: FAIL (page still imports `DaySwipe`, calls `getDay` once, no panels).

- [ ] **Step 3: Rewrite the page**

`app/(app)/trips/[tripId]/day/[date]/page.tsx` — full new content:

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireTripAccess } from "@/lib/guards";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { dayTitle } from "@/lib/page-title";
import { addDays, formatDayLabel } from "@/lib/dates";
import { getDay, type DayViewData } from "@/lib/day-view-loader";
import { readTripShell, readUnreadActivityCount, readRecentActivity } from "@/lib/trip-shell-reads";
import { AddItemButton } from "@/components/trip/item-form-dialog";
import { WeatherCardSkeleton } from "@/components/weather/WeatherCardSkeleton";
import { DayCarousel, type DayPanel } from "@/components/trip/day/day-carousel";
import { DayHeader } from "@/components/trip/day/day-header";
import { DayTitleInline } from "@/components/trip/day/day-title-inline";
import { DayStrip } from "@/components/trip/day/day-strip";
import { DayKeyboardNav } from "@/components/trip/day/day-keyboard-nav";
import { DayPlanCard } from "@/components/trip/day/day-plan-card";
import { TonightCard } from "@/components/trip/day/tonight-card";
import { JournalCard } from "@/components/trip/day/journal-card";
import { DayWeather } from "@/components/trip/day/day-weather";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params }: { params: Promise<{ tripId: string; date: string }> }): Promise<Metadata> {
  const { date } = await params;
  return ISO_DATE.test(date) ? { title: dayTitle(date) } : {};
}

/**
 * The Day view (spec 2026-09-27 §C, DAY_VIEW.md; ADR 0065). The day shown and
 * the day either side come from `getDay`, in parallel, so the carousel has a
 * neighbour to drag into view; weather streams in its own Suspense boundary
 * per day. The phone and the desktop trees are both rendered and one is
 * hidden by breakpoint (the same pattern as the Home route).
 */
export default async function DayPage({ params }: { params: Promise<{ tripId: string; date: string }> }) {
  const { tripId, date } = await params;
  const { user } = await requireTripAccess(tripId);
  const wellFormed = ISO_DATE.test(date);
  // Policy (not a BND-2 spelling exemption): this dated view always shows the
  // real plan and ignores `?plan=` — see architecture-sitrep-2026-09-22.md.
  const [data, before, after, unreadCount, recent, shell, slug] = await Promise.all([
    getDay(tripId, date, user.id),
    wellFormed ? getDay(tripId, addDays(date, -1), user.id) : Promise.resolve("invalid" as const),
    wellFormed ? getDay(tripId, addDays(date, 1), user.id) : Promise.resolve("invalid" as const),
    readUnreadActivityCount(tripId),
    readRecentActivity(tripId, 10),
    readTripShell(tripId),
    tripSlugFor(tripId),
  ]);
  if (data === "dateless") redirect(tripPath(slug, "/plan"));
  if (data === "invalid" || data === "out-of-range") notFound();
  const d: DayViewData = data;
  // getDay clamps a date just outside the Trip to its end, which would hand
  // the day shown back as its own neighbour — only a different date is a panel.
  const days = [before, d, after].filter((r): r is DayViewData => typeof r !== "string").filter((r, i, all) => all.findIndex((x) => x.date === r.date) === i);
  const shownIndex = days.findIndex((x) => x.date === d.date);

  const base = tripPath(slug);
  const prevHref = d.prevDate ? `${base}/day/${d.prevDate}` : null;
  const nextHref = d.nextDate ? `${base}/day/${d.nextDate}` : null;

  // Every add opens the existing Item dialog with the panel's date preselected
  // (spec decision 7). AddItemButton draws the "+" as its icon, so labels
  // carry no leading "+".
  const addProps = (day: DayViewData) => ({
    tripId,
    stops: day.stopOptions,
    tripStartDate: day.date,
    defaultDate: day.date,
    defaultUnscheduled: false,
    homeCurrency: day.trip.homeCurrency,
  });
  const dashedAdd = (day: DayViewData, size: "desktop" | "phone") => (
    <AddItemButton
      {...addProps(day)}
      label={size === "desktop" ? "Add something else · a place, an activity, a note" : day.hasEntries ? "Add to this day" : "Add something else"}
      variant="dashed"
      size="md"
      className={
        size === "desktop"
          ? "h-[52px] w-full rounded-2xl border-border text-sm font-extrabold text-foreground"
          : "h-12 w-full rounded-2xl border-border text-sm font-extrabold text-foreground"
      }
    />
  );
  const headerAdd = (
    <AddItemButton {...addProps(d)} label="Add to this day" variant="primary" size="md" className="h-11 whitespace-nowrap rounded-full px-5 text-sm font-extrabold" />
  );

  // Weather needs a located Stop; a gap day (no Stop) has none.
  const weather = (day: DayViewData, size: "regular" | "compact") =>
    day.weatherInput && day.stop ? (
      <Suspense fallback={<WeatherCardSkeleton size={size} />}>
        <DayWeather input={day.weatherInput} dateISO={day.date} today={day.today} placeName={day.stop.name} size={size} />
      </Suspense>
    ) : null;

  // Tonight: a gap day with no bed shows nothing (there is no Stop to add a
  // stay to), and the trip's last day has no night to plan.
  const tonight = (day: DayViewData, size: "desktop" | "phone") =>
    !day.isLast && (day.tonight != null || day.stop != null) ? (
      <TonightCard tripId={tripId} tonight={day.tonight} isLastDay={day.isLast} stopId={day.stop?.id ?? null} size={size} />
    ) : null;

  const dayBody = (day: DayViewData) => {
    const phoneWeather = weather(day, "compact");
    const desktopWeather = weather(day, "regular");
    const phoneTonight = tonight(day, "phone");
    const desktopTonight = tonight(day, "desktop");
    return (
      <div data-day-body className="flex flex-col gap-3.5 lg:gap-[18px]">
        {phoneWeather ? <div className="md:hidden">{phoneWeather}</div> : null}
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-[18px]">
          <div className="md:hidden">
            <DayPlanCard data={day} size="phone" addButton={dashedAdd(day, "phone")} />
          </div>
          <div className="hidden md:block">
            <DayPlanCard data={day} size="desktop" addButton={dashedAdd(day, "desktop")} />
          </div>
          <div className="flex flex-col gap-3.5 lg:gap-[18px]">
            {desktopWeather ? <div className="hidden md:block">{desktopWeather}</div> : null}
            {phoneTonight ? <div data-slot="tonight" className="md:hidden">{phoneTonight}</div> : null}
            {desktopTonight ? <div data-slot="tonight" className="hidden md:block">{desktopTonight}</div> : null}
            <JournalCard tripId={tripId} date={day.date} dateLabel={formatDayLabel(day.date)} journal={day.journal} />
            <p className="text-[11px] font-semibold text-muted-foreground">
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                Weather by Open-Meteo
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  };

  const panels: DayPanel[] = days.map((day) => ({ iso: day.date, href: `${base}/day/${day.date}`, content: dayBody(day) }));

  return (
    <div className="flex flex-col gap-3.5 lg:gap-[18px]">
      <DayCarousel
        panels={panels}
        shownIndex={shownIndex}
        chrome={
          <>
            <DayKeyboardNav prevHref={prevHref} nextHref={nextHref} />
            <DayHeader
              tripId={tripId}
              tripSlug={slug}
              tripName={shell?.name ?? d.trip.name}
              eyebrow={d.eyebrow}
              heading={d.heading}
              subLine={d.subLine}
              subLineCompact={d.subLineCompact}
              dayTitle={<DayTitleInline stopId={d.dayTitleStopId} date={d.date} title={d.dayTitle} />}
              prevHref={prevHref}
              nextHref={nextHref}
              prevLabel={d.prevDate ? `Previous day: ${formatDayLabel(d.prevDate)}` : null}
              nextLabel={d.nextDate ? `Next day: ${formatDayLabel(d.nextDate)}` : null}
              unreadCount={unreadCount}
              recent={recent}
              members={(shell?.members ?? []).map((m) => m.user)}
              addButton={headerAdd}
            />
            <div className="md:hidden">
              <DayStrip tripId={tripId} dates={d.strip.dates} line={d.strip.line} size="phone" />
            </div>
            <div className="hidden md:block">
              <DayStrip tripId={tripId} dates={d.strip.dates} line={d.strip.line} size="desktop" />
            </div>
          </>
        }
      />
    </div>
  );
}
```

- [ ] **Step 4: Delete the swipe handler**

```bash
git rm components/trip/day/day-swipe.tsx
grep -rn "day-swipe\|DaySwipe" app components scripts docs/superpowers/plans/2026-09-30-day-carousel-and-hard-cut.md --exclude-dir=node_modules
```
The grep must show nothing in `app/`, `components/` or `scripts/` (the audit script's swipe simulation is rewritten in Task 8 and refers to `[data-day-body]`, not `DaySwipe`).

- [ ] **Step 5: Run the tests**

Run: `npm test -- "app/(app)/trips/[tripId]/day" components/trip/day`
Expected: PASS.

- [ ] **Step 6: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add "app/(app)/trips/[tripId]/day/[date]/page.tsx" "app/(app)/trips/[tripId]/day/[date]/page.test.tsx"
git commit -m "feat(day): the Day page renders the day either side through the carousel; the swipe handler goes (ADR 0065)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The navigation audit proves the cut and the carousel

**Files:**
- Modify: `scripts/nav-audit/checks.ts` (replace `crossfadeOverlapFrames` with `sectionCutViolations`)
- Modify: `scripts/nav-audit/checks.test.ts`
- Modify: `scripts/nav-audit.ts` (header comment; `checkPhoneSectionSwitch`; the swipe simulation; two new Day findings)

**Interfaces:**
- Produces: `export interface CutSample { t: number; sections: number; section: string }`; `export function sectionCutViolations(samples: CutSample[], expected: { sections: number; from: string; to: string }): string[]`. `sections` is the count of `[data-section]` wrappers in the DOM (two on a trip page: the app layout's `trips` and the trip layout's own) and `section` the innermost one's name.

- [ ] **Step 1: Write the failing check test**

In `scripts/nav-audit/checks.test.ts`, replace the `describe("crossfadeOverlapFrames", …)` block with:

```ts
describe("sectionCutViolations (ADR 0065)", () => {
  const expected = { sections: 2, from: "plan", to: "budget" };
  it("passes a clean cut: the resting number of sections every frame, the inner section goes straight from old to new", () => {
    const s = [
      { t: 0, sections: 2, section: "plan" },
      { t: 50, sections: 2, section: "plan" },
      { t: 100, sections: 2, section: "budget" },
      { t: 150, sections: 2, section: "budget" },
    ];
    expect(sectionCutViolations(s, expected)).toEqual([]);
  });
  it("flags an extra section in a frame, a missing or foreign section, and the old one coming back", () => {
    const s = [
      { t: 0, sections: 2, section: "plan" },
      { t: 50, sections: 3, section: "plan" },
      { t: 100, sections: 2, section: "" },
      { t: 150, sections: 2, section: "budget" },
      { t: 200, sections: 2, section: "plan" },
    ];
    expect(sectionCutViolations(s, expected)).toEqual(["3 sections at 50ms", 'section "" at 100ms', "old section back at 200ms"]);
  });
});
```

and update the import line to `import { …, sectionCutViolations, changedBarFrames } from "./checks";` (drop `crossfadeOverlapFrames`).

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- scripts/nav-audit/checks.test.ts`
Expected: FAIL (`sectionCutViolations` is not exported).

- [ ] **Step 3: Write the check**

In `scripts/nav-audit/checks.ts`, delete `VISIBLE` and `crossfadeOverlapFrames`, and add:

```ts
export interface CutSample {
  t: number;
  /** How many [data-section] wrappers are in the DOM (nested layouts each add one). */
  sections: number;
  /** The innermost wrapper's name — the section actually switching. */
  section: string;
}

/**
 * A section switch is a cut (ADR 0065): every frame has the resting number
 * of section wrappers (never an extra one for a leaving section), the inner
 * section is only ever the old one or the new one (never blank, never a
 * third), and once the new one is up the old never returns.
 */
export function sectionCutViolations(samples: CutSample[], expected: { sections: number; from: string; to: string }): string[] {
  const out: string[] = [];
  let switched = false;
  for (const s of samples) {
    if (s.sections !== expected.sections) out.push(`${s.sections} sections at ${s.t}ms`);
    if (s.section !== expected.from && s.section !== expected.to) out.push(`section "${s.section}" at ${s.t}ms`);
    if (s.section === expected.to) switched = true;
    else if (switched && s.section === expected.from) {
      out.push(`old section back at ${s.t}ms`);
      break;
    }
  }
  return out;
}
```

- [ ] **Step 4: Rewrite the phone section-switch check**

In `scripts/nav-audit.ts`:

- Import line: replace `crossfadeOverlapFrames` with `sectionCutViolations, type CutSample`.
- Replace the header paragraph beginning `On a phone it also slows a Plan → Money switch 20×` with:

```ts
 * On a phone it also samples a Plan → Money switch every 50ms: the DOM never
 * holds an extra section wrapper and the inner section goes straight from
 * plan to budget (a cut, ADR 0065), and nothing paints over the tab bar. It then proves the Day carousel: the scroller rests on the day
 * shown at first paint with a neighbour each side, a "swipe" (moving the
 * scroller one panel) lands on that day, and an arrow press keeps the
 * vertical position. Frames of a failure go to NAV_AUDIT_OUT (default
 * /tmp/nav-audit/<timestamp>; never inside the repo).
```

- Replace the whole `checkPhoneSectionSwitch` function (its doc comment included) with:

```ts
/**
 * Phone Plan → Money through the tab bar, sampled every 50ms until the new
 * page is up. Two hard findings: the switch is a cut (sectionCutViolations),
 * and the tab bar's pixels match the settled page's in every frame (nothing
 * paints over it). The bar's own CSS transitions are switched off for the
 * check: the tap lights Money at once (data-pending, ADR 0063), so the pill
 * already sits on Money for every sampled frame. The Next dev indicator is
 * hidden for the same reason. The bar is read with page.screenshot({ clip }).
 */
async function checkPhoneSectionSwitch(page: Page, planUrl: string, outDir: string): Promise<Finding[]> {
  const cutName = "Phone section switch: a cut — no extra section in any frame, old straight to new";
  const barName = "Phone section switch: the tab bar is untouched in every frame";
  await page.goto(planUrl, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
  const setAuditStyle = (off: boolean) =>
    page.evaluate((o) => {
      document.getElementById("nav-audit-no-bar-transitions")?.remove();
      if (!o) return;
      const style = document.createElement("style");
      style.id = "nav-audit-no-bar-transitions";
      style.textContent = "nav.tp-vt-tab-bar, nav.tp-vt-tab-bar * { transition: none !important; } nextjs-portal { display: none !important; }";
      document.head.append(style);
    }, off);
  await setAuditStyle(true);
  await page.waitForTimeout(400);
  const rect = await page.evaluate(() => {
    const r = document.querySelector("nav.tp-vt-tab-bar")?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  });
  if (!rect) {
    await setAuditStyle(false);
    return [cutName, barName].map((name) => ({ name, hard: true, ok: false, detail: "tab bar not found" }));
  }
  const clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  // The trip header's h1 is the Trip's name on every section, so the switch
  // is read off the innermost [data-section] wrapper (the app layout adds an
  // outer one, "trips", that never changes here).
  const readSections = () =>
    page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("[data-section]"));
      return { sections: all.length, section: all[all.length - 1]?.getAttribute("data-section") ?? "" };
    });
  const rest = await readSections();

  const samples: CutSample[] = [];
  const bars: { t: number; bar: string; png: Buffer }[] = [];
  await page.click('nav.tp-vt-tab-bar a:text-is("Money")');
  await page.waitForTimeout(30);
  const start = Date.now();
  for (;;) {
    const t = Date.now() - start;
    const s = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("[data-section]"));
      return { sections: all.length, section: all[all.length - 1]?.getAttribute("data-section") ?? "", url: location.pathname };
    });
    samples.push({ t, sections: s.sections, section: s.section });
    const png = await page.screenshot({ clip });
    bars.push({ t, bar: png.toString("base64"), png });
    if ((/\/budget$/.test(s.url) && s.section !== rest.section && t > 600) || t > 7_000) break;
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(400);
  const landed = await readSections();
  const baselinePng = await page.screenshot({ clip });
  const baseline = baselinePng.toString("base64");
  await setAuditStyle(false);

  const cut = sectionCutViolations(samples, { sections: rest.sections, from: rest.section, to: landed.section });
  const changed = changedBarFrames(baseline, bars);
  const save = (label: string, ts: number[]): string => {
    if (ts.length === 0) return "";
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, `${label}-baseline.png`), baselinePng);
    for (const f of bars.filter((b) => ts.includes(b.t))) writeFileSync(path.join(outDir, `${label}-t${f.t}.png`), f.png);
    return ` (frames in ${outDir})`;
  };
  return [
    { name: cutName, hard: true, ok: landed.section !== rest.section && cut.length === 0, detail: landed.section === rest.section ? `section did not change (${rest.section})` : cut.length ? `${cut.join("; ")} of ${samples.length} frames` : `${samples.length} frames, ${rest.section} → ${landed.section}` },
    { name: barName, hard: true, ok: changed.length === 0, detail: changed.length ? `bar changed at t=${changed.join(",")}ms of ${bars.length} frames${save("tab-bar", changed)}` : `${bars.length} frames` },
  ];
}
```

- [ ] **Step 5: Drive the carousel instead of faking touches, and add the two Day findings**

In `main()`:

- Replace the `const swipe = (from: number, to: number) => () => page.evaluate(...)` block and its two `findings.push(await checkHold(page, "Day: swipe left (phone)" …))` / `"Day: swipe right (phone)"` lines with:

```ts
    // A "swipe": move the scroller one panel. The settle detector (scrollend,
    // else 120ms of quiet on a snap point) navigates; the page holds meanwhile.
    const swipe = (dir: 1 | -1) => () =>
      page.evaluate((d) => {
        const el = document.querySelector("[data-day-carousel]") as HTMLElement;
        el.scrollLeft = el.scrollLeft + d * el.clientWidth;
      }, dir);
    findings.push(await checkHold(page, "Day: swipe to the next day (phone) — the settled carousel navigates", swipe(1), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${next}$`) }));
    findings.push(await checkHold(page, "Day: swipe back (phone)", swipe(-1), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${mid}$`) }));
```

- Directly after the `"Day (phone): the strip reaches the Trip's first and last day"` finding, add:

```ts
    // ── Day carousel (ADR 0065): resting position, vertical hold ──────────
    const pos = await page.evaluate(() => {
      const el = document.querySelector("[data-day-carousel]") as HTMLElement | null;
      if (!el) return null;
      const shown = el.querySelector('[data-day-panel][data-shown="true"]');
      const idx = shown ? Array.from(el.children).indexOf(shown) : -1;
      return { left: el.scrollLeft, expected: idx * el.clientWidth, idx, panels: el.querySelectorAll("[data-day-panel]").length };
    });
    findings.push({
      name: "Day (phone): the carousel rests on the day shown at first paint, a neighbour each side",
      hard: true,
      ok: pos != null && pos.panels === 3 && pos.idx === 1 && Math.abs(pos.left - pos.expected) <= 1,
      detail: pos ? `scrollLeft=${pos.left} expected=${pos.expected} panels=${pos.panels}` : "no carousel",
    });
    const canScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight >= 240);
    await page.evaluate(() => window.scrollTo(0, 240));
    await page.click('a[aria-label^="Next day"]');
    await page.waitForURL(new RegExp(`/day/${next}$`), { timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(400);
    const scrollY = await page.evaluate(() => window.scrollY);
    findings.push({
      name: "Day (phone): an arrow press keeps the vertical position",
      hard: canScroll,
      ok: !canScroll || scrollY >= 200,
      detail: canScroll ? `scrollY=${scrollY}` : "page too short to test",
    });
    await page.goto(`${baseUrl}${base}/day/${mid}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
```

(The `arrowBox` loop that follows navigates to each day itself, so the last `goto` only restores the expected starting page.)

- [ ] **Step 6: Run the unit tests and the type check**

Run: `npm test -- scripts/nav-audit/checks.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 7: Gates and commit**

```bash
npm run lint
git add scripts/nav-audit.ts scripts/nav-audit/checks.ts scripts/nav-audit/checks.test.ts
git commit -m "test(audit): nav audit proves the section cut and the Day carousel (ADR 0065)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Full gates, the browser audit, and the follow-up note

**Files:**
- Modify: `docs/open-follow-ups.md` (one bullet after `NAV-04`)
- Modify (only if the audit finds a real defect): whichever file the finding names — fix, re-run, commit with the fix.

**Interfaces:** none new.

- [ ] **Step 1: Run every gate**

```bash
npx tsc --noEmit && npm run lint && npm test
```
Expected: all clean, every test passing. Fix anything that fails before going on (a Radix focus-scope teardown banner from unrelated dialog tests is a known pre-existing warning, `LK-03` — a rerun is usually clean).

- [ ] **Step 2: Start a dev server and run the audit**

```bash
npx next dev -p 3100 > /tmp/tp-dev-3100.log 2>&1 &
sleep 12; curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/login   # expect 200
BASE_URL=http://localhost:3100 NODE_PATH=$HOME/.npm/_npx/360550e4913b8759/node_modules npm run audit:nav
```
Expected: exit 0, every hard check `PASS`, including the new ones:
- `Phone section switch: a cut — no extra section in any frame, old straight to new`
- `Day (phone): the carousel rests on the day shown at first paint, a neighbour each side`
- `Day (phone): an arrow press keeps the vertical position` (or `WARN … page too short`)
- `Day: swipe to the next day (phone) — the settled carousel navigates`

If `resolvePlaywright` cannot find Playwright, see Global Constraints (scratchpad install of `playwright@1.49.1`; never into the repo). If a hard check fails, read its detail and the saved frames, fix the cause in the component it names, re-run `npm test` for that area, and re-run the audit. Record the final PASS/FAIL lines in the commit body of the fix, or — with no fix needed — in Step 4's commit body.

- [ ] **Step 3: Stop the dev server**

```bash
kill %1 2>/dev/null || pkill -f "next dev -p 3100"
```

- [ ] **Step 4: Record the follow-up and commit**

In `docs/open-follow-ups.md`, directly after the bullet that begins `- **NAV-04` (after its last line, before the next bullet or heading), add:

```md
- **NAV-05 · A range loader for the Day view.** The Day page loads three days (the day
  before, shown, after) with three parallel `getDay` calls so the carousel has something to
  drag into view (ADR 0065). Each call repeats the trip, stops and items reads. Replace with
  one `getDays(tripId, dates, viewerId)` that reads the window once and projects each day.
  Also, if rapid swiping feels stuck on the phone (a second swipe before the first lands
  meets the end of the scroller): render two neighbours each side.
```

```bash
git add docs/open-follow-ups.md
git commit -m "docs(follow-ups): NAV-05 — a range loader for the Day view's three-day load

<one line per audit finding, PASS/WARN, copied from the audit's summary>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

- **Spec coverage.** A (cut): Task 1 + Task 8. B (carousel, three loads, inert, height clip, drag, settle→navigate, arrows/keys/adjacent chips glide, far chips page-turn, heading crossfade on every change, prefetch, DaySwipe removed, vertical position kept, history entries): Tasks 2, 4, 5, 6, 7. C (strip centred, both-edge bleed, follows the body, glides on lit change, highlight stays on the lit chip, flick only scrolls, desktop D2 glided): Task 6 (+ Task 3's rule). D (reduced motion): Task 3 tween, Task 4 goTo, Task 6 tween; CSS reduced-motion block untouched. E (verification): Tasks 8–9; WebKit is Cam's, stated in the spec. F (follow-ups): Task 9.
- **Types.** `DayCarouselApi { goTo, subscribe, isMoving }` is used identically in Tasks 4, 5, 6. `DayPanel { iso, href, content }` in Tasks 4 and 7. `phoneStripScroll(StripScrollInput)` in Tasks 3 and 6. `DAY_SETTLE` in Tasks 2, 4. `sectionCutViolations(CutSample[], { sections, from, to })` in Task 8 only. `tweenScrollLeft(el, to, { reduced, durationMs?, onDone?, raf?, now? })` in Tasks 3, 4, 6.
- **Review Focus.** 1 → Task 7 test; 2 → Task 4 test; 3 → Task 3 + Task 4 tests; 4 → Task 6 test; 5 → Task 4 test.
