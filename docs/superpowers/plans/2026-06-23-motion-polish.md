# Motion & Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add subtle, tasteful motion (route transitions, list enter/exit/reorder, micro-interactions, entrance stagger) to the existing trip planner, making it feel alive without changing any features.

**Architecture:** A small shared motion layer built on the **Motion** library (`motion/react`, the React-19-compatible successor to Framer Motion), introduced for content/route/micro-interaction motion only. The existing hand-rolled `tp-*` CSS animations on Radix overlays (dialog, sheet, popover, dropdown, select, toast) are **left untouched** — see `docs/adr/0006-motion-library-for-content-and-route-motion.md` for why the split is intentional. Task 1 builds the foundation (dependency, a motion-vocabulary module, a global `MotionConfig` reduced-motion provider); every later task consumes it. Press feedback is done in pure CSS (not Motion) so the ubiquitous base `Button` need not become a client island.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4 (class-based dark mode, HSL tokens in `app/globals.css`), Radix UI, **Motion** (`motion`), Vitest + Testing Library (jsdom), lucide-react.

**Branch:** `feat/motion-polish` (already created off `main`). Do NOT touch `main`, switch branches, push, or deploy.

**Conventions every task must follow:**
- After each task: `npm run test` and `npm run build` must both exit 0. The suite is green at the start of this work — keep it green; do not reduce the passing count.
- Match house style (the files quoted below show it): `cn()` for classes, `cva` variants, `forwardRef` primitives, `"use client"` only where needed, lucide icons with `aria-hidden`, `aria-label`/`title` on icon-only controls.
- **Animations cannot be visually unit-tested in jsdom** (no layout/compositor). Tests in this plan assert *structure, final state, and accessibility* (e.g. the count-up's accessible label equals the final value); the *feel* is proven by `npm run build` + the manual QA checklist in Task 11.
- Reduced motion is handled centrally by Task 1's `<MotionConfig reducedMotion="user">` (Motion drops transform/layout animation, keeps opacity) plus the existing CSS `prefers-reduced-motion` rule. Do **not** hand-roll per-component reduced-motion branches except where a task explicitly says so (the count-up).
- Commit at the end of each task with the message given.

---

### Task 1: Install Motion + motion vocabulary + reduced-motion provider

**Files:**
- Modify: `package.json` (add dependency)
- Create: `lib/motion.ts`
- Create: `lib/motion.test.ts`
- Create: `components/ui/motion-provider.tsx`
- Modify: `app/layout.tsx`

> **Why:** Everything downstream needs the library, a single source of truth for durations/easings (today they're ad-hoc 150/200/250/300ms scattered in CSS), and a provider that makes *all* Motion respect the OS reduced-motion setting. `MotionConfig reducedMotion="user"` is the single switch that satisfies our accessibility requirement for every later task.

- [ ] **Step 1: Install Motion**

Run: `npm install motion`
Expected: `motion` added to `dependencies` in `package.json`; install exits 0 (peer-dep *warnings* are acceptable, errors are not). Confirm with: `node -e "console.log(require('motion/package.json').version)"` (prints a v11+ or v12+ version).

- [ ] **Step 2: Write the failing test — `lib/motion.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { DURATION, EASE_EMPHASIZED, STAGGER_STEP, SPRING_POP } from "./motion";

describe("motion vocabulary", () => {
  it("exposes the duration scale in seconds", () => {
    expect(DURATION.base).toBe(0.2);
    expect(DURATION.fast).toBe(0.12);
    expect(DURATION.exit).toBe(0.15);
    expect(DURATION.countUp).toBe(0.7);
  });
  it("exposes the emphasized easing as a cubic-bezier tuple", () => {
    expect(EASE_EMPHASIZED).toEqual([0.32, 0.72, 0, 1]);
  });
  it("exposes a small stagger step and a pop spring", () => {
    expect(STAGGER_STEP).toBe(0.03);
    expect(SPRING_POP.type).toBe("spring");
  });
});
```

Run: `npx vitest run lib/motion.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/motion.ts`**

```ts
// Single source of truth for the app's motion vocabulary. Durations are in
// SECONDS (Motion's unit). Keep this small and reuse it everywhere so motion
// stays consistent and tunable from one place.
import type { Transition } from "motion/react";

export const DURATION = {
  /** Taps / pops. */
  fast: 0.12,
  /** Standard enter / route transition. */
  base: 0.2,
  /** Exit — slightly quicker than enter. */
  exit: 0.15,
  /** Budget grand-total count-up. */
  countUp: 0.7,
} as const;

/** Emphasized easing reused from the existing tp-slide CSS curve. */
export const EASE_EMPHASIZED: [number, number, number, number] = [0.32, 0.72, 0, 1];
/** Gentle ease-out for plain fades. */
export const EASE_OUT: [number, number, number, number] = [0, 0, 0.2, 1];

/** Per-item delay used by mount stagger. */
export const STAGGER_STEP = 0.03;

/** Spring for satisfying pops (vote, checklist tick). */
export const SPRING_POP: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 28,
  mass: 0.6,
};
```

Run: `npx vitest run lib/motion.test.ts`
Expected: PASS.

- [ ] **Step 4: Create the provider — `components/ui/motion-provider.tsx`**

```tsx
"use client";

import { MotionConfig } from "motion/react";

/**
 * App-wide Motion configuration. `reducedMotion="user"` makes every Motion
 * component honour the OS "reduce motion" setting (transforms/layout animation
 * are skipped; opacity still cross-fades). This is the single accessibility
 * switch for all library-driven motion in the app.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
```

- [ ] **Step 5: Wire the provider into `app/layout.tsx`**

Import it and wrap the existing children inside `ThemeProvider`. Add the import after the `ThemeProvider` import:
```tsx
import { MotionProvider } from "@/components/ui/motion-provider";
```
Change the body content (currently lines 40–44) from:
```tsx
        <ThemeProvider>
          {children}
          <Toaster />
          <PwaRegister />
        </ThemeProvider>
```
to:
```tsx
        <ThemeProvider>
          <MotionProvider>
            {children}
            <Toaster />
            <PwaRegister />
          </MotionProvider>
        </ThemeProvider>
```

- [ ] **Step 6: Verify**

```bash
npm run test && npm run build
```
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/motion.ts lib/motion.test.ts components/ui/motion-provider.tsx app/layout.tsx
git commit -m "feat(motion): add Motion, motion vocabulary, and reduced-motion provider

Introduces the motion library (motion/react), a single lib/motion.ts
duration/easing vocabulary, and a global MotionConfig reducedMotion=\"user\"
provider so all library-driven motion honours the OS setting. See ADR 0006.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Press feedback on buttons and trip cards (CSS-only)

**Files:**
- Modify: `components/ui/button.tsx` (base variant string, line 10)
- Modify: `components/ui/button.test.tsx` (add assertion)
- Modify: `components/trip/trip-card.tsx` (Link className, line 84)

> **Why:** Tappable controls feel inert. A small press-down scale gives native-app tactility. Done in CSS with the `motion-safe:` variant (so it's automatically disabled under reduced motion) — no JS, so the base `Button` stays usable in server components without becoming a client island.

- [ ] **Step 1: Add press scale + transform transition to the Button base**

In `components/ui/button.tsx`, the base string passed to `cva` (line 10) currently starts:
```tsx
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors outline-none focus-visible:ring-2 ...",
```
Replace the `transition-colors` token with an explicit transition that includes `transform`, and add the press scale. Change `transition-colors` →
```
transition-[color,background-color,border-color,box-shadow,transform] duration-150 motion-safe:active:scale-[0.98]
```
Leave the rest of the base string and all variants unchanged. (Using an explicit `transition-[...]` property list is required: a bare `transition-transform` would conflict with `transition-colors` under `twMerge` and drop the colour transition.)

- [ ] **Step 2: Add the assertion in `components/ui/button.test.tsx`**

Add to the `describe("Button", ...)` block:
```tsx
  it("includes press-feedback scale on the base, gated by motion-safe", () => {
    render(<Button>Press me</Button>);
    expect(screen.getByRole("button")).toHaveClass("motion-safe:active:scale-[0.98]");
  });
```

Run: `npx vitest run components/ui/button.test.tsx`
Expected: PASS.

- [ ] **Step 3: Add press scale to the trip card**

In `components/trip/trip-card.tsx`, the `Link` className (line 84) already has `transition-all duration-200 hover:shadow-soft-lg hover:-translate-y-0.5 ...`. Add `motion-safe:active:scale-[0.99]` to that same string (the existing `transition-all` already covers `transform`, and Tailwind v4 composes translate + scale, so the hover lift and press scale coexist):
```tsx
        "transition-all duration-200 hover:shadow-soft-lg hover:-translate-y-0.5 motion-safe:active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
```

- [ ] **Step 4: Verify**

```bash
npm run test && npm run build
```
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/ui/button.tsx components/ui/button.test.tsx components/trip/trip-card.tsx
git commit -m "feat(motion): tactile press-down on buttons and trip cards

CSS-only motion-safe:active:scale so it disables under reduced motion and
keeps the base Button free of a client boundary.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Route transitions for trip sub-pages (enter-only fade + rise)

**Files:**
- Create: `components/ui/page-transition.tsx`
- Create: `components/ui/page-transition.test.tsx`
- Create: `app/(app)/trips/[tripId]/template.tsx`

> **Why:** Navigating between trip tabs (overview, calendar, wishlist, budget, summary, today…) is an instant cut. A `template.tsx` re-mounts on every navigation, so wrapping its children in a Motion element gives a reliable **enter** animation for the screen you arrive on, with no fragile frozen-router exit hack. Placing it at the **trip layout level only** means the trip header + nav (in `layout.tsx`, which persists) stay still while just the content area transitions — and avoids the double-animation a top-level `(app)/template.tsx` would cause on every sub-navigation. Under reduced motion the rise is dropped automatically (Task 1's provider) and it becomes a plain cross-fade.

- [ ] **Step 1: Write the failing test — `components/ui/page-transition.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageTransition } from "./page-transition";

describe("PageTransition", () => {
  it("renders its children", () => {
    render(
      <PageTransition>
        <p>Budget screen</p>
      </PageTransition>,
    );
    expect(screen.getByText("Budget screen")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run components/ui/page-transition.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement `components/ui/page-transition.tsx`**

```tsx
"use client";

import { motion } from "motion/react";
import { DURATION, EASE_EMPHASIZED } from "@/lib/motion";

/**
 * Enter-only screen transition: the incoming content fades in and rises a few
 * pixels. Used by a route `template.tsx`, which re-mounts on every navigation.
 * Reduced motion (handled by MotionProvider) drops the rise → plain cross-fade.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE_EMPHASIZED }}
    >
      {children}
    </motion.div>
  );
}
```

Run: `npx vitest run components/ui/page-transition.test.tsx`
Expected: PASS.

- [ ] **Step 3: Create the trip-level template — `app/(app)/trips/[tripId]/template.tsx`**

```tsx
import { PageTransition } from "@/components/ui/page-transition";

/**
 * Re-mounts on every navigation within a trip, giving each sub-page an
 * enter transition. The trip header + nav live in layout.tsx and persist.
 */
export default function TripTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageTransition>{children}</PageTransition>;
}
```

- [ ] **Step 4: Verify (and check no other route template exists)**

```bash
ls app/\(app\)/template.tsx 2>/dev/null && echo "WARNING: top-level (app) template exists — it would double-animate; do not add one" || echo "ok: no top-level (app) template"
npm run test && npm run build
```
Expected: "ok: no top-level (app) template"; both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/ui/page-transition.tsx components/ui/page-transition.test.tsx app/\(app\)/trips/\[tripId\]/template.tsx
git commit -m "feat(motion): enter transition on trip sub-page navigation

template.tsx at the trip layout level fades+rises content on each tab change
while the trip header/nav persist. Enter-only — no frozen-router exit hack.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: AnimatedList/AnimatedItem primitive + apply to the Stops list

**Files:**
- Create: `components/ui/animated-list.tsx`
- Create: `components/ui/animated-list.test.tsx`
- Modify: `components/trip/stops-manager.tsx`

> **Why:** Lists just appear/vanish on re-render. This primitive wraps `AnimatePresence` (enter/exit) + `layout` (neighbours slide on reorder) into two reusable pieces, with an optional mount stagger. We build it and apply it to the Stops list first as the exemplar (Stops are reorderable via Move-up/down and live on the overview — one of the two "landing" lists that gets the mount stagger).

- [ ] **Step 1: Write the failing test — `components/ui/animated-list.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnimatedList, AnimatedItem } from "./animated-list";

describe("AnimatedList", () => {
  it("renders all items inside the given container element", () => {
    render(
      <AnimatedList as="ul" className="list-grid">
        <AnimatedItem as="li" key="a">Paris</AnimatedItem>
        <AnimatedItem as="li" key="b">Rome</AnimatedItem>
      </AnimatedList>,
    );
    expect(screen.getByText("Paris")).toBeInTheDocument();
    expect(screen.getByText("Rome")).toBeInTheDocument();
    // Container is a <ul> carrying the passed className.
    const ul = screen.getByText("Paris").closest("ul");
    expect(ul).not.toBeNull();
    expect(ul).toHaveClass("list-grid");
    // Items are <li>.
    expect(screen.getByText("Paris").tagName).toBe("LI");
  });

  it("defaults to a div container and div items", () => {
    render(
      <AnimatedList className="wrap">
        <AnimatedItem key="x">solo</AnimatedItem>
      </AnimatedList>,
    );
    expect(screen.getByText("solo").tagName).toBe("DIV");
  });
});
```

Run: `npx vitest run components/ui/animated-list.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement `components/ui/animated-list.tsx`**

```tsx
"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { DURATION, EASE_EMPHASIZED, STAGGER_STEP } from "@/lib/motion";

type ListTag = "div" | "ul" | "ol";
type ItemTag = "div" | "li" | "section";

/**
 * Container for an animated list. Renders a plain element (div/ul/ol) wrapping
 * an AnimatePresence so its AnimatedItem children animate on add/remove.
 *
 * `staggerOnMount` lets the items present on first render animate in (used on
 * the two "landing" lists); otherwise the initial render is static and only
 * later add/remove/reorder animate.
 */
export function AnimatedList({
  children,
  className,
  as = "div",
  staggerOnMount = false,
}: {
  children: React.ReactNode;
  className?: string;
  as?: ListTag;
  staggerOnMount?: boolean;
}) {
  const Tag = as;
  return (
    <Tag className={className}>
      <AnimatePresence initial={staggerOnMount}>{children}</AnimatePresence>
    </Tag>
  );
}

/**
 * A single animated list row. `layout` makes neighbours slide when the list
 * reorders. `index` adds a small enter delay for mount stagger (leave 0 for
 * non-staggered lists). Reduced motion is handled by MotionProvider.
 */
export function AnimatedItem({
  children,
  className,
  as = "div",
  index = 0,
}: {
  children: React.ReactNode;
  className?: string;
  as?: ItemTag;
  index?: number;
}) {
  const Comp = as === "li" ? motion.li : as === "section" ? motion.section : motion.div;
  return (
    <Comp
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: DURATION.exit } }}
      transition={{ duration: DURATION.base, ease: EASE_EMPHASIZED, delay: index * STAGGER_STEP }}
      className={className}
    >
      {children}
    </Comp>
  );
}
```

Run: `npx vitest run components/ui/animated-list.test.tsx`
Expected: PASS.

- [ ] **Step 3: Apply to `components/trip/stops-manager.tsx`**

Add the import:
```tsx
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
```
Replace the stop-cards list block (currently lines 54–69):
```tsx
          {/* Stop cards list */}
          <div className="flex flex-col gap-3">
            {initialStops.map((stop, idx) => (
              <StopCard
                key={stop.id}
                stop={stop}
                isFirst={idx === 0}
                isLast={idx === initialStops.length - 1}
                isPending={pendingId === stop.id}
                onEdit={(s) => setEditingStop(s)}
                onMoveUp={(id) => handleMove(id, "up")}
                onMoveDown={(id) => handleMove(id, "down")}
                onDelete={handleDelete}
              />
            ))}
          </div>
```
with:
```tsx
          {/* Stop cards list — staggered entrance, animated add/remove/reorder */}
          <AnimatedList className="flex flex-col gap-3" staggerOnMount>
            {initialStops.map((stop, idx) => (
              <AnimatedItem key={stop.id} index={idx}>
                <StopCard
                  stop={stop}
                  isFirst={idx === 0}
                  isLast={idx === initialStops.length - 1}
                  isPending={pendingId === stop.id}
                  onEdit={(s) => setEditingStop(s)}
                  onMoveUp={(id) => handleMove(id, "up")}
                  onMoveDown={(id) => handleMove(id, "down")}
                  onDelete={handleDelete}
                />
              </AnimatedItem>
            ))}
          </AnimatedList>
```
(The `key` moves from `StopCard` to `AnimatedItem` — AnimatePresence keys on its direct children.)

- [ ] **Step 4: Verify**

```bash
npm run test && npm run build
```
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/ui/animated-list.tsx components/ui/animated-list.test.tsx components/trip/stops-manager.tsx
git commit -m "feat(motion): AnimatedList primitive; animate Stops add/remove/reorder + stagger

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Roll AnimatedList out to the other manager lists

**Files (apply the pattern; read each first):**
- Modify: `components/trip/wishlist-board.tsx`
- Modify: `components/trip/note-thread.tsx`
- Modify: `components/trip/checklist.tsx` (the items `<ul>`/`<li>` map only — NOT the checkbox; Task 8 owns that)
- Modify: `components/trip/itinerary-manager.tsx`
- Candidates — apply only if the list is in a client component and items are user add/remove/reorder: transport list, accommodation list, cost lists (`cost-editor.tsx`, `other-cost-editor.tsx`), `attachment-list.tsx`

> **Why:** Task 4 proved the pattern on Stops. Extend it to the rest of the add/removable lists for a consistent "things slide in and out" feel. This is deliberately pattern-driven rather than line-pinned because these lists live in components not yet quoted — read each before editing.

- [ ] **Step 1: Find the candidate lists**

```bash
grep -rn "\.map(" components/trip/wishlist-board.tsx components/trip/note-thread.tsx components/trip/checklist.tsx components/trip/itinerary-manager.tsx components/trip/cost-editor.tsx components/trip/other-cost-editor.tsx components/trip/attachment-list.tsx
```
For each hit, open the file and identify the `.map(...)` that renders a **list of user-managed rows** (things that can be added, deleted, or reordered) — not static label lists.

- [ ] **Step 2: Apply the Task 4 pattern to each qualifying list**

For each list, mirror the Stops change exactly:
1. Import: `import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";`
2. Replace the wrapping container element with `<AnimatedList>` (use `as="ul"` and `AnimatedItem as="li"` where the markup is a `<ul>`/`<li>`, e.g. the checklist and the calendar wishlist rail; otherwise default `div`). Keep the original container's `className`.
3. Move each row's `key` onto the `AnimatedItem`. Do **not** pass `index` here (these lists do not stagger on mount — only Stops and the Trips list do).
4. Leave all handlers, props, and inner markup unchanged.

The component **must be a client component** (`"use client"` at top) for this to work — every file listed above already is except where noted. If a candidate is a server component or its list isn't user-managed, **skip it and note the skip** in the commit body.

- [ ] **Step 3: Confirm the checklist boundary**

In `components/trip/checklist.tsx`, only wrap the `<ul>` of items + each `<li>` (the row at lines ~431–520 becomes the `AnimatedItem as="li"` body). Do not touch the checkbox `<button>` / `CheckSquare`/`Square` icons — Task 8 animates those. If the items already render inside a `<ul>`, set `AnimatedList as="ul"` and `AnimatedItem as="li"` and move the `key` to the `AnimatedItem`.

- [ ] **Step 4: Verify**

```bash
npm run test && npm run build
```
Expected: both exit 0. If any test asserted a specific wrapper tag/structure that changed, update it to match (the items must still be queryable by their text/role).

- [ ] **Step 5: Commit**

```bash
git add components/trip/wishlist-board.tsx components/trip/note-thread.tsx components/trip/checklist.tsx components/trip/itinerary-manager.tsx components/trip/cost-editor.tsx components/trip/other-cost-editor.tsx components/trip/attachment-list.tsx
git commit -m "feat(motion): animate add/remove/reorder across manager lists

Applies the AnimatedList primitive to wishlist, notes, checklist items,
itinerary, costs, and attachments. (Note any lists skipped and why.)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Entrance stagger on the Trips list

**Files:**
- Modify: `app/(app)/trips/page.tsx`

> **Why:** The Trips list is the other "landing" screen, and unlike trip sub-pages it has no route transition (it sits above the `[tripId]` template). Give its cards a brief staggered entrance using the same primitive. (Overview Stops already got their stagger via Task 4's `staggerOnMount`.)

- [ ] **Step 1: Wrap the trips grid with AnimatedList**

In `app/(app)/trips/page.tsx`, add the import:
```tsx
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
```
Replace the grid block (currently lines 56–67):
```tsx
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              id={trip.id}
              name={trip.name}
              startDate={trip.startDate}
              endDate={trip.endDate}
              stopCount={trip._count.stops}
            />
          ))}
        </div>
```
with:
```tsx
        <AnimatedList className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" staggerOnMount>
          {trips.map((trip, idx) => (
            <AnimatedItem key={trip.id} index={idx}>
              <TripCard
                id={trip.id}
                name={trip.name}
                startDate={trip.startDate}
                endDate={trip.endDate}
                stopCount={trip._count.stops}
              />
            </AnimatedItem>
          ))}
        </AnimatedList>
```
(This server page renders the client `AnimatedList`/`AnimatedItem` with server-rendered `TripCard` children — `TripCard` is a plain `Link` with no handlers, so it's a valid serializable child.)

- [ ] **Step 2: Verify**

```bash
npm run test && npm run build
```
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/trips/page.tsx
git commit -m "feat(motion): staggered entrance for the trips list

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Vote pop micro-interaction

**Files:**
- Modify: `components/trip/vote-control.tsx`
- Create: `components/trip/vote-control.test.tsx`

> **Why:** Marking interest on a Wishlist Item is instant. A quick scale pop on the chosen level's emoji makes voting feel responsive and satisfying.

- [ ] **Step 1: Pop the active level's emoji**

In `components/trip/vote-control.tsx`, add imports:
```tsx
import { motion } from "motion/react";
import { SPRING_POP } from "@/lib/motion";
```
The `SegmentedItem` currently renders `<span aria-hidden="true">{LEVEL_EMOJI[level]}</span>` (line 118). Replace that emoji span with a Motion span that re-mounts (and so re-pops) whenever it becomes the active level, by keying it on its active state:
```tsx
            <motion.span
              aria-hidden="true"
              key={myVote?.level === level ? "on" : "off"}
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={SPRING_POP}
            >
              {LEVEL_EMOJI[level]}
            </motion.span>
```
(The `key` flips when this level becomes/stops being the user's vote, remounting the span so the spring replays. Reduced motion is handled by the provider.)

- [ ] **Step 2: Write the test — `components/trip/vote-control.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoteControl, type VoteView } from "./vote-control";

vi.mock("@/server/actions/votes", () => ({
  setVote: vi.fn().mockResolvedValue(undefined),
  clearVote: vi.fn().mockResolvedValue(undefined),
}));
import { setVote } from "@/server/actions/votes";

const baseProps = {
  tripId: "t1",
  itemId: "i1",
  currentUserId: "u1",
  votes: [] as VoteView[],
};

describe("VoteControl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the three vote levels", () => {
    render(<VoteControl {...baseProps} />);
    expect(screen.getByRole("radio", { name: "Must" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Keen" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Meh" })).toBeInTheDocument();
  });

  it("calls setVote when a level is chosen", async () => {
    const user = userEvent.setup();
    render(<VoteControl {...baseProps} />);
    await user.click(screen.getByRole("radio", { name: "Must" }));
    expect(setVote).toHaveBeenCalledWith("t1", "i1", "MUST");
  });
});
```
> Note: `Segmented` renders Radix ToggleGroup items — confirm whether they expose `role="radio"` (single-type) or `role="button"`; if the role differs, adjust the queries to match what `Segmented`/`SegmentedItem` actually render (read `components/ui/segmented.tsx`). The behavioural assertion (setVote called with the level) is the point.

Run: `npx vitest run components/trip/vote-control.test.tsx`
Expected: PASS (after Step 1).

- [ ] **Step 3: Verify**

```bash
npm run test && npm run build
```
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add components/trip/vote-control.tsx components/trip/vote-control.test.tsx
git commit -m "feat(motion): pop the chosen level on the wishlist vote control

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Checklist tick micro-interaction

**Files:**
- Modify: `components/trip/checklist.tsx` (checkbox button, lines ~439–451)

> **Why:** Ticking a checklist item snaps. A small pop on the check icon as it swaps from empty→ticked makes completing items feel rewarding. (The label's struck-through/muted styling already exists via `transition-colors`; we only animate the icon.)

- [ ] **Step 1: Animate the checkbox icon swap**

In `components/trip/checklist.tsx`, ensure these imports exist (add if missing):
```tsx
import { motion } from "motion/react";
import { SPRING_POP } from "@/lib/motion";
```
The checkbox button currently renders (lines ~446–450):
```tsx
          {item.done ? (
            <CheckSquare className="size-5 text-primary" aria-hidden="true" />
          ) : (
            <Square className="size-5" aria-hidden="true" />
          )}
```
Wrap the chosen icon in a Motion span keyed on `item.done` so the spring replays on toggle:
```tsx
          <motion.span
            key={item.done ? "done" : "todo"}
            initial={{ scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={SPRING_POP}
            className="inline-flex"
          >
            {item.done ? (
              <CheckSquare className="size-5 text-primary" aria-hidden="true" />
            ) : (
              <Square className="size-5" aria-hidden="true" />
            )}
          </motion.span>
```
Leave the `<button>`, its `onClick={toggle}`, `aria-label`, and `disabled` exactly as-is. Reduced motion is handled by the provider.

- [ ] **Step 2: Verify**

```bash
npm run test && npm run build
```
Expected: both exit 0. If a checklist test queries the icon by structure, ensure it still finds it (the `aria-label` on the button is unchanged, so `getByRole("button", { name: ... })` keeps working).

- [ ] **Step 3: Commit**

```bash
git add components/trip/checklist.tsx
git commit -m "feat(motion): pop the checkbox when ticking a checklist item

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Budget grand-total count-up

**Files:**
- Create: `components/ui/animated-number.tsx`
- Create: `components/ui/animated-number.test.tsx`
- Create: `components/trip/animated-money.tsx`
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` (grand-total hero, lines 244 & 254)

> **Why:** The Budget hero totals snap to value. Counting up on mount gives the read-only number a sense of arrival. Scoped to the **grand total only** (estimated + spent-so-far) per the spec. Because the budget is read-only server data, count-up only ever shows on mount — so we count from 0 → target on mount, then animate from the previous value on any later change. This is the one place we read `useReducedMotion` directly: when reduced, the number renders its final value immediately (no count).

- [ ] **Step 1: Write the failing test — `components/ui/animated-number.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnimatedNumber } from "./animated-number";

describe("AnimatedNumber", () => {
  it("exposes the final value as an accessible label immediately", () => {
    render(<AnimatedNumber value={12300} format={(n) => String(Math.round(n))} />);
    // The accessible label is the final value even while the visible digits
    // are still counting up — assertable without advancing animation frames.
    expect(screen.getByLabelText("12300")).toBeInTheDocument();
  });

  it("renders a visible (aria-hidden) value node", () => {
    const { container } = render(
      <AnimatedNumber value={500} format={(n) => `$${Math.round(n)}`} />,
    );
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
  });
});
```

Run: `npx vitest run components/ui/animated-number.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement `components/ui/animated-number.tsx`**

```tsx
"use client";

import * as React from "react";
import { animate, useReducedMotion } from "motion/react";
import { DURATION, EASE_EMPHASIZED } from "@/lib/motion";

/**
 * Counts a number up to `value` and renders it via `format`. Counts from 0 on
 * first mount, then from the previous value on change. Under reduced motion it
 * renders the final value immediately. The accessible label is always the
 * final formatted value, so assistive tech never reads the intermediate digits.
 */
export function AnimatedNumber({
  value,
  format,
  durationSec = DURATION.countUp,
  className,
}: {
  value: number;
  format: (n: number) => string;
  durationSec?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = React.useState(reduce ? value : 0);
  const prev = React.useRef(reduce ? value : 0);

  React.useEffect(() => {
    if (reduce) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: durationSec,
      ease: EASE_EMPHASIZED,
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduce, durationSec]);

  return (
    <span className={className} aria-label={format(value)}>
      <span aria-hidden="true">{format(display)}</span>
    </span>
  );
}
```

Run: `npx vitest run components/ui/animated-number.test.tsx`
Expected: PASS.

- [ ] **Step 3: Implement the money wrapper — `components/trip/animated-money.tsx`**

```tsx
"use client";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { formatMoney } from "@/lib/money";

/**
 * Count-up wrapper around formatMoney for whole-currency totals (minor units).
 */
export function AnimatedMoney({
  minor,
  currency,
  className,
}: {
  minor: number;
  currency: string;
  className?: string;
}) {
  return (
    <AnimatedNumber
      value={minor}
      format={(n) => formatMoney(Math.round(n), currency)}
      className={className}
    />
  );
}
```
> Before relying on this, confirm `lib/money.ts`'s `formatMoney` is a pure function with no `server-only` import (it's used in `cost-summary.tsx`). If it imports `server-only`, instead pass the already-formatted endpoints differently — but it is expected to be safe to import client-side.

- [ ] **Step 4: Use the count-up in the Budget hero**

In `app/(app)/trips/[tripId]/budget/page.tsx`, add the import (next to the existing `formatMoney` import on line 5):
```tsx
import { AnimatedMoney } from "@/components/trip/animated-money";
```
Replace line 244:
```tsx
                {formatMoney(budget.grandTotal.estimatedMinor, homeCurrency)}
```
with:
```tsx
                <AnimatedMoney minor={budget.grandTotal.estimatedMinor} currency={homeCurrency} />
```
Replace line 254:
```tsx
                  {formatMoney(budget.grandTotal.actualMinor, homeCurrency)}
```
with:
```tsx
                  <AnimatedMoney minor={budget.grandTotal.actualMinor} currency={homeCurrency} />
```
Leave every other `formatMoney` call on the page unchanged (only the two grand-total hero figures count up).

- [ ] **Step 5: Verify**

```bash
npm run test && npm run build
```
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add components/ui/animated-number.tsx components/ui/animated-number.test.tsx components/trip/animated-money.tsx app/\(app\)/trips/\[tripId\]/budget/page.tsx
git commit -m "feat(motion): count up the budget grand total

Adds an AnimatedNumber primitive (final value as the a11y label; snaps under
reduced motion) and applies it to the estimated + spent hero figures only.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Cross-fade the calendar Month ↔ Agenda switch

**Files:**
- Modify: `components/trip/calendar-views.tsx` (body block, lines 172–219)

> **Why:** Toggling between Month and Agenda is an instant swap. A quick cross-fade (with `mode="wait"` so one leaves before the other enters) makes the view change feel intentional rather than jarring.

- [ ] **Step 1: Wrap the body in AnimatePresence keyed by view**

In `components/trip/calendar-views.tsx`, add imports:
```tsx
import { AnimatePresence, motion } from "motion/react";
import { DURATION } from "@/lib/motion";
```
The body is currently a bare conditional (lines 172–219): `{view === "month" ? ( <div…month…/> ) : ( <AgendaView … /> )}`. Wrap it so the two branches cross-fade. Replace the `{/* Body */}` conditional with:
```tsx
      {/* Body */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.fast }}
        >
          {view === "month" ? (
            <div className="flex flex-col gap-4 lg:flex-row">
              {/* …existing month block unchanged… */}
            </div>
          ) : (
            <AgendaView tripId={tripId} days={days} />
          )}
        </motion.div>
      </AnimatePresence>
```
Keep the entire existing month block (the `lg:flex-row` div with `MonthGrid` + the wishlist `aside`) and the `AgendaView` call **verbatim** inside — only the wrapping `AnimatePresence` + keyed `motion.div` are new. The `key={view}` is what drives the cross-fade on toggle.

- [ ] **Step 2: Verify**

```bash
npm run test && npm run build
```
Expected: both exit 0. (Note: the month nav toolbar above the body is outside this wrapper and does not animate.)

- [ ] **Step 3: Commit**

```bash
git add components/trip/calendar-views.tsx
git commit -m "feat(motion): cross-fade the calendar month/agenda switch

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Reduced-motion verification + full QA sweep

**Files:**
- Create: `components/ui/motion-provider.test.tsx`

> **Why:** Reduced motion is our key accessibility guarantee and the one cross-cutting behaviour worth pinning with a test. This task also runs the whole-suite + build gate and records the manual QA checklist that proves the *feel* (which jsdom can't).

- [ ] **Step 1: Test that the provider applies `reducedMotion="user"`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { motion } from "motion/react";
import { MotionProvider } from "./motion-provider";

describe("MotionProvider", () => {
  it("renders children within the MotionConfig context", () => {
    render(
      <MotionProvider>
        <motion.div data-testid="m">hi</motion.div>
      </MotionProvider>,
    );
    expect(screen.getByTestId("m")).toBeInTheDocument();
    expect(screen.getByTestId("m")).toHaveTextContent("hi");
  });
});
```
> jsdom can't read the OS reduce-motion setting (matchMedia is stubbed to `matches:false`), so this is a smoke test that the provider mounts and passes children through. The behavioural guarantee is exercised manually in Step 3.

Run: `npx vitest run components/ui/motion-provider.test.tsx`
Expected: PASS.

- [ ] **Step 2: Full verification**

```bash
npm run test && npm run build
```
Expected: both exit 0; suite still green with no reduced passing count.

- [ ] **Step 3: Manual QA checklist (record results in the commit body)**

Run `npm run dev` and verify, in a normal browser and then with **OS "Reduce motion" enabled**:
1. Navigating between trip tabs fades + rises the content; the trip header/nav stay still. (Reduced: plain cross-fade, no movement.)
2. Adding / deleting / reordering a Stop animates in/out and neighbours slide.
3. The Trips list and overview Stops stagger in on arrival (brief).
4. Buttons and trip cards scale slightly while pressed. (Reduced: no scale.)
5. Voting and ticking a checklist item pop. (Reduced: instant.)
6. The Budget grand total counts up on load. (Reduced: shows final value instantly.)
7. Toggling Month ↔ Agenda cross-fades.
8. Nothing janks on a phone-sized viewport; no layout shift from the animations.

- [ ] **Step 4: Commit**

```bash
git add components/ui/motion-provider.test.tsx
git commit -m "test(motion): provider smoke test; record manual QA sweep

Manual QA (normal + reduced-motion) results: <fill in from Step 3>.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Approach (Motion `motion/react`, used where it earns its keep; overlays' `tp-*` CSS untouched; global reduced-motion provider): T1. ADR 0006 already written.
- Motion vocabulary codified: `lib/motion.ts` (T1).
- Route transitions — enter-only fade + rise at trip layout level: T3.
- List add/remove/reorder: T4 (primitive + Stops) and T5 (rollout to wishlist, notes, checklist items, itinerary, costs, attachments).
- Micro-interactions: press feedback (T2, CSS), vote pop (T7), checklist tick (T8), budget count-up grand-total-only (T9).
- View/tab switch cross-fade: T10. Entrance stagger on the two landing lists: overview Stops (T4 `staggerOnMount`) + Trips list (T6).
- Reduced motion honoured everywhere: T1 provider; verified in T11. All agreed items covered.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to above". The two pattern-driven spots (T5 rollout, T7 role query) carry explicit grep commands, a concrete pattern to copy from T4, and "read the file first / adjust to what it renders" guidance — not hand-waving. Code is shown in full for every new module.

**3. Type/name consistency:** `DURATION`, `EASE_EMPHASIZED`, `STAGGER_STEP`, `SPRING_POP` (defined T1) are used with those exact names in T3/T4/T7/T8/T9/T10. `AnimatedList`/`AnimatedItem` (T4) reused verbatim in T5/T6. `AnimatedNumber` (T9) → `AnimatedMoney` (T9) → budget page. `MotionProvider` (T1) tested in T11. Durations are in seconds throughout (Motion's unit), matching `lib/motion.ts`.

**4. Risk notes:**
- **T5 is the highest-risk** (pattern applied across several un-quoted files) — mitigated by requiring a read of each file, an explicit client-component check, and a "skip + note" escape hatch. The two-stage review loop should scrutinise that the `key` moved to `AnimatedItem` and no handlers changed.
- **T9 count-up** depends on `formatMoney` being client-safe — Step 3 calls that out to verify before relying on it.
- **T3 + overview Stops (T4)** layer a container fade (route transition) over a per-item stagger on the overview; intended and subtle, but flagged in the T11 manual checklist to eyeball for busyness.
- No task changes server actions, data shapes, or behaviour — these are presentational additions. The full suite + build gate runs after every task.
```
