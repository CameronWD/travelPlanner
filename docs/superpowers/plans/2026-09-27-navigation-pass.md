# Navigation Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every sibling navigation in TEEPEE (day → day, section → section, rail destination → rail destination) hold the current page until the next one is ready, then swap with a short native transition — no page-wide skeleton, no remount-and-fade — with the tapped control lit at once and a thin progress bar only if the wait drags.

**Architecture:** Next 16 App Router keys a fresh Suspense boundary for every changing segment and uses the *parent folder's* `loading.tsx` as its fallback, so holding the old page means having no `loading.tsx` between the shared shell and the thing that changes. We delete all of them but `app/(app)/trips/loading.tsx`, delete the trip `template.tsx`, and replace the motion with React `<ViewTransition>` (a crossfade keyed on the layout's child segment; a directional slide on the Day body tagged by `transitionTypes`). A small client context reports in-flight navigations from a `Link` wrapper and a `useRouter` wrapper, which feeds both the immediate active state on nav controls and a delayed progress bar. `experimental.staleTimes.dynamic = 30` makes recently visited pages instant. Per-request `cache()` wrappers stop pages re-fetching what the trip layout already loaded.

**Tech Stack:** Next 16.3.4 (App Router; read `node_modules/next/dist/docs/` before touching routing), React 19.2.4 stable in `node_modules` (the App Router bundles a canary that exports `ViewTransition`; the stable package does not — hence the wrapper in Task 1), Tailwind v4, Vitest 4 + jsdom + Testing Library, Playwright 1.63 installed **globally** (not a dependency) with Chromium at `/ms-playwright`, Prisma.

**Spec:** `docs/specs/2026-09-27-navigation-pass.md` · **Decision record:** `docs/adr/0063-sibling-navigation-holds-the-current-page.md` (amends ADR 0006).

## Global Constraints

- **You are a subagent.** Do NOT run `npm run feedback:pull` or `npm run feedback:resolve` (they hit production). Do not run `next start` or `next build` (both load `.env.production.local`). `next dev`, `vitest`, `eslint` and `tsc` are fine.
- Work on the existing branch `feat/soft-navigation-2026-09-27`. Never touch `main`. Never deploy.
- **`loading.tsx` whitelist (ADR 0063):** after Task 6 the only `loading.tsx` under `app/(app)/` is `app/(app)/trips/loading.tsx`. No `template.tsx` anywhere under `app/(app)/`. Task 6 pins this with a test; do not add either file in any task.
- Every test run is `TZ=UTC npx vitest run <file>` for one file and `npm test` for the suite. `npm run lint` and `npx tsc --noEmit` must both be clean before each task's final commit.
- Code style matches the repo: double quotes, semicolons, 2-space indent, `"use client"` as the first line of client components, `@/` imports, `cn()` from `@/lib/cn` for class joins. Comments explain *why*, in the voice of the existing files.
- Terminology follows `CONTEXT.md`: Traveller, Trip, Stop, Day view, Plan, Home. "Days" is the nav label for the Day view.
- Commit after each task with a conventional message and this trailer as the final line:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- `useRouter().push(href, { transitionTypes })` and `<Link transitionTypes onNavigate>` exist in this Next version (`node_modules/next/dist/shared/lib/app-router-context.shared-runtime.d.ts:14`, `node_modules/next/dist/client/app-dir/link.d.ts:170-183`). `useSelectedLayoutSegment` is exported from `next/navigation`.
- Existing tests mock `next/link` with a plain `<a>` that spreads all props. Where a task makes a component pass `onNavigate` / `transitionTypes` to `Link`, update that test's mock to strip those two props (the exact mock is given in each task) so React does not warn about unknown DOM props.

## Review Focus

1. **Tapping the tab you are already on** (e.g. "Plan" while on Plan) must not leave a pending state that never settles — the URL does not change, so nothing would clear it. Pinned in Task 2 (`begin()` is a no-op for the current URL).
2. **Modifier-click / middle-click** (open in new tab) must not light the target or start the progress bar. `onNavigate` does not fire for those, and the test in Task 2 pins that `AppLink` only reports through `onNavigate`, never `onClick`.
3. **A navigation that never lands** (an error boundary that keeps the old URL, a cancelled fetch) must not pin the progress bar on forever. Task 2 pins the 15s safety timeout.
4. **Browser back/forward and `router.refresh()`** carry no transition type, so the Day body must not slide and the section wrapper must not crossfade twice. Task 5 pins `default: "none"` on the Day body's type maps; Task 6 pins `default="none"` on `SectionTransition`.
5. **A date-less Trip** has no default day, so the Days tab must keep pointing at `/trips/:id/day` (which redirects to Plan). Task 4 pins the null fallback.

---

### Task 1: `ViewTransition` primitive, its types, and the transition CSS

**Files:**
- Create: `types/react-view-transition.d.ts`
- Create: `components/ui/view-transition.tsx`
- Create: `components/ui/view-transition.test.tsx`
- Create: `app/globals.view-transition.test.ts`
- Modify: `app/globals.css` (append at the end of the file)

**Interfaces:**
- Produces: `ViewTransition` component from `@/components/ui/view-transition` with props `{ name?, default?, enter?, exit?, update?, share?, children }` where each animation prop is `string | { default?: string; [transitionType: string]: string | undefined }`. Also `hasNativeViewTransition: boolean`.
- Produces: CSS classes for view-transition pseudo-elements: `tp-crossfade`, `day-forward`, `day-back`; `@utility tp-nav-progress`.

- [ ] **Step 1: Write the failing tests**

`components/ui/view-transition.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ViewTransition, hasNativeViewTransition } from "./view-transition";

describe("ViewTransition", () => {
  it("renders its children (the stable React vitest resolves has no native ViewTransition, so this is the passthrough)", () => {
    render(
      <ViewTransition enter={{ "day-forward": "day-forward", default: "none" }} default="none">
        <p>Day body</p>
      </ViewTransition>,
    );
    expect(screen.getByText("Day body")).toBeInTheDocument();
  });

  it("reports whether the native component was found", () => {
    expect(typeof hasNativeViewTransition).toBe("boolean");
  });
});
```

`app/globals.view-transition.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(__dirname, "globals.css"), "utf8");

describe("globals.css view-transition rules (ADR 0063)", () => {
  it.each(["::view-transition-old(.tp-crossfade)", "::view-transition-new(.tp-crossfade)", "::view-transition-old(.day-forward)", "::view-transition-new(.day-forward)", "::view-transition-old(.day-back)", "::view-transition-new(.day-back)"])("defines %s", (selector) => {
    expect(css).toContain(selector);
  });
  it("lets clicks through while a transition runs", () => {
    expect(css).toMatch(/::view-transition\s*\{\s*pointer-events:\s*none;?\s*\}/);
  });
  it("collapses every view transition to a cut under prefers-reduced-motion", () => {
    const idx = css.indexOf("::view-transition-group(*)");
    expect(idx).toBeGreaterThan(-1);
    const block = css.slice(Math.max(0, idx - 400), idx + 400);
    expect(block).toContain("prefers-reduced-motion: reduce");
    expect(block).toContain("animation-duration: 0s !important");
  });
  it("defines the navigation progress utility", () => {
    expect(css).toContain("@utility tp-nav-progress");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run components/ui/view-transition.test.tsx app/globals.view-transition.test.ts`
Expected: FAIL — module `./view-transition` not found; CSS assertions fail.

- [ ] **Step 3: Add the type augmentation**

`types/react-view-transition.d.ts`:

```ts
import "react";

/**
 * React's <ViewTransition> and addTransitionType ship in the canary the Next
 * App Router bundles (node_modules/next/dist/compiled/react), not in the
 * stable `react` 19.2.4 in node_modules, whose @types/react therefore lack
 * them. This augmentation gives the App Router usage a type; the runtime
 * gap is bridged by components/ui/view-transition.tsx.
 */
declare module "react" {
  type ViewTransitionClassMap = string | { default?: string; [transitionType: string]: string | undefined };
  interface ViewTransitionProps {
    name?: string;
    default?: ViewTransitionClassMap;
    enter?: ViewTransitionClassMap;
    exit?: ViewTransitionClassMap;
    update?: ViewTransitionClassMap;
    share?: ViewTransitionClassMap;
    children?: ReactNode;
  }
  export const ViewTransition: ComponentType<ViewTransitionProps>;
  export function addTransitionType(type: string): void;
}
```

- [ ] **Step 4: Add the wrapper**

`components/ui/view-transition.tsx`:

```tsx
import * as React from "react";

export type ViewTransitionClassMap = string | { default?: string; [transitionType: string]: string | undefined };

export interface ViewTransitionProps {
  name?: string;
  default?: ViewTransitionClassMap;
  enter?: ViewTransitionClassMap;
  exit?: ViewTransitionClassMap;
  update?: ViewTransitionClassMap;
  share?: ViewTransitionClassMap;
  children?: React.ReactNode;
}

// React's <ViewTransition> ships in the canary the App Router bundles, not in
// the stable `react` package vitest resolves (19.2.4 exports no such thing).
// Read it off the namespace once so the stable build — tests, and any future
// React that drops it — degrades to a plain passthrough: content still swaps,
// just without the animation. No "use client": usable from server pages and
// client components alike (props are plain strings/objects, so serialisable).
const Native = (React as unknown as { ViewTransition?: React.ComponentType<ViewTransitionProps> }).ViewTransition;

export const hasNativeViewTransition = Native != null;

/** ADR 0063: the app's one route-motion primitive. */
export function ViewTransition(props: ViewTransitionProps) {
  if (!Native) return <>{props.children}</>;
  return <Native {...props} />;
}
```

- [ ] **Step 5: Append the CSS**

Append to the very end of `app/globals.css` (after the closing `}` of `@layer base`):

```css
/* ── Route motion (ADR 0063) ─────────────────────────────────────────────
   React <ViewTransition> classes. Section switches crossfade (tp-crossfade,
   components/navigation/section-transition.tsx); the Day body slides in the
   direction of travel (day-forward / day-back, tagged by the arrows, strip,
   keyboard and swipe via transitionTypes). Untyped transitions — browser
   back/forward, router.refresh(), Suspense reveals — map to "none" in the
   components, so nothing here fires for them. */
::view-transition { pointer-events: none; }

@keyframes tp-vt-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes tp-vt-slide { from { translate: var(--tp-vt-offset, 0) 0; } to { translate: 0 0; } }

::view-transition-old(.tp-crossfade) { animation: 120ms ease-in both tp-vt-fade reverse; }
::view-transition-new(.tp-crossfade) { animation: 180ms ease-out both tp-vt-fade; }

::view-transition-old(.day-forward) { --tp-vt-offset: -32px; animation: 120ms ease-in both tp-vt-fade reverse, 220ms cubic-bezier(0.32, 0.72, 0, 1) both tp-vt-slide reverse; }
::view-transition-new(.day-forward) { --tp-vt-offset: 32px; animation: 180ms ease-out 80ms both tp-vt-fade, 220ms cubic-bezier(0.32, 0.72, 0, 1) both tp-vt-slide; }
::view-transition-old(.day-back) { --tp-vt-offset: 32px; animation: 120ms ease-in both tp-vt-fade reverse, 220ms cubic-bezier(0.32, 0.72, 0, 1) both tp-vt-slide reverse; }
::view-transition-new(.day-back) { --tp-vt-offset: -32px; animation: 180ms ease-out 80ms both tp-vt-fade, 220ms cubic-bezier(0.32, 0.72, 0, 1) both tp-vt-slide; }

/* The `*` rule in @layer base does not reach these pseudo-elements. */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(*),
  ::view-transition-new(*),
  ::view-transition-group(*) {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
  }
}

/* NavigationProgress (components/navigation/navigation-progress.tsx): an
   indeterminate 2px bar that sweeps the viewport width. */
@keyframes tp-nav-progress { from { translate: -100% 0; } to { translate: 300% 0; } }
@utility tp-nav-progress { animation: tp-nav-progress 1.1s ease-in-out infinite; }
```

- [ ] **Step 6: Run the tests and the type check**

Run: `TZ=UTC npx vitest run components/ui/view-transition.test.tsx app/globals.view-transition.test.ts && npx tsc --noEmit`
Expected: both test files PASS; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add types/react-view-transition.d.ts components/ui/view-transition.tsx components/ui/view-transition.test.tsx app/globals.view-transition.test.ts app/globals.css
git commit -m "feat(nav): ViewTransition primitive, type augmentation and route-motion CSS (ADR 0063)"
```

---

### Task 2: Navigation pending context, `AppLink`, `useAppRouter`, `NavigationProgress`

**Files:**
- Create: `components/navigation/navigation-pending.tsx`
- Create: `components/navigation/navigation-pending.test.tsx`
- Create: `components/navigation/app-link.tsx`
- Create: `components/navigation/app-link.test.tsx`
- Create: `components/navigation/use-app-router.ts`
- Create: `components/navigation/use-app-router.test.tsx`
- Create: `components/navigation/navigation-progress.tsx`
- Create: `components/navigation/navigation-progress.test.tsx`
- Modify: `app/(app)/layout.tsx` (mount the provider and the bar)
- Modify: `COMPONENTS.md` (catalog rows)

**Interfaces:**
- Produces: `NavigationPendingProvider`, `useNavigationPending(): PendingNavigation | null` where `PendingNavigation = { href: string; pathname: string; startedAt: number }`, `useBeginNavigation(): (href: string) => void`, `useEffectivePathname(): string`, `pathnameOf(href: string): string`, `PENDING_NAVIGATION_TIMEOUT_MS = 15_000`.
- Produces: `AppLink` — drop-in for `next/link` with an extra `pendingClassName?: string` prop.
- Produces: `useAppRouter()` — same shape as `useRouter()`; `push`/`replace` also call `begin(href)`.
- Produces: `NavigationProgress` with `delayMs` (default `NAVIGATION_PROGRESS_DELAY_MS = 300`); renders `[data-nav-progress="visible"|"hidden"]`.

- [ ] **Step 1: Write the failing tests**

`components/navigation/navigation-pending.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips/t1");
const mockUseSearchParams = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

import { NavigationPendingProvider, useBeginNavigation, useEffectivePathname, useNavigationPending, pathnameOf, PENDING_NAVIGATION_TIMEOUT_MS } from "./navigation-pending";

function Probe({ to }: { to: string }) {
  const begin = useBeginNavigation();
  const pending = useNavigationPending();
  const effective = useEffectivePathname();
  return (
    <div>
      <button onClick={() => begin(to)}>go</button>
      <output data-testid="pending">{pending?.href ?? "none"}</output>
      <output data-testid="effective">{effective}</output>
    </div>
  );
}

beforeEach(() => {
  mockUsePathname.mockReturnValue("/trips/t1");
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
});
afterEach(() => vi.useRealTimers());

describe("NavigationPendingProvider", () => {
  it("records a begun navigation and lights its pathname as the effective one", () => {
    render(<NavigationPendingProvider><Probe to="/trips/t1/plan?plan=f1" /></NavigationPendingProvider>);
    expect(screen.getByTestId("effective")).toHaveTextContent("/trips/t1");
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByTestId("pending")).toHaveTextContent("/trips/t1/plan?plan=f1");
    expect(screen.getByTestId("effective")).toHaveTextContent("/trips/t1/plan");
  });

  it("settles when the URL changes", () => {
    const { rerender } = render(<NavigationPendingProvider><Probe to="/trips/t1/plan" /></NavigationPendingProvider>);
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByTestId("pending")).toHaveTextContent("/trips/t1/plan");
    mockUsePathname.mockReturnValue("/trips/t1/plan");
    rerender(<NavigationPendingProvider><Probe to="/trips/t1/plan" /></NavigationPendingProvider>);
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
    expect(screen.getByTestId("effective")).toHaveTextContent("/trips/t1/plan");
  });

  it("is a no-op for the URL already shown (tapping the active tab), including a hash-only link", () => {
    render(<NavigationPendingProvider><Probe to="/trips/t1" /></NavigationPendingProvider>);
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
    render(<NavigationPendingProvider><Probe to="#stop-1" /></NavigationPendingProvider>);
    fireEvent.click(screen.getAllByText("go")[1]);
    expect(screen.getAllByTestId("pending")[1]).toHaveTextContent("none");
  });

  it("treats a ?search change as a different place", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("plan=f1"));
    render(<NavigationPendingProvider><Probe to="/trips/t1" /></NavigationPendingProvider>);
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByTestId("pending")).toHaveTextContent("/trips/t1");
  });

  it("gives up on a navigation that never lands after the safety timeout", () => {
    vi.useFakeTimers();
    render(<NavigationPendingProvider><Probe to="/trips/t1/plan" /></NavigationPendingProvider>);
    fireEvent.click(screen.getByText("go"));
    act(() => { vi.advanceTimersByTime(PENDING_NAVIGATION_TIMEOUT_MS + 1); });
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
  });

  it("works without a provider (tests and boundary shells): nothing pending, real pathname", () => {
    render(<Probe to="/trips/t1/plan" />);
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
    expect(screen.getByTestId("effective")).toHaveTextContent("/trips/t1");
  });
});

describe("pathnameOf", () => {
  it.each([
    ["/trips/t1/plan?plan=f1#stop-2", "/trips/t1/plan"],
    ["/trips/t1", "/trips/t1"],
    ["?plan=f1", "/"],
  ])("%s → %s", (href, expected) => {
    expect(pathnameOf(href)).toBe(expected);
  });
});
```

`components/navigation/app-link.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips/t1");
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => new URLSearchParams(),
}));
// A next/link stand-in that behaves like the real one for what AppLink needs:
// a plain left click is a client navigation and runs onNavigate; a
// modifier-click is left to the browser (no onNavigate). onClick runs for both.
vi.mock("next/link", () => ({
  default: ({ href, children, onNavigate, onClick, transitionTypes: _t, ...rest }: any) => (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        e.preventDefault();
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) onNavigate?.({ preventDefault() { (e as any).navPrevented = true; } });
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

import { AppLink } from "./app-link";
import { NavigationPendingProvider, useNavigationPending } from "./navigation-pending";

function Pending() {
  const p = useNavigationPending();
  return <output data-testid="pending">{p?.href ?? "none"}</output>;
}

describe("AppLink", () => {
  it("reports a plain click to the pending context and takes pendingClassName while in flight", () => {
    render(
      <NavigationPendingProvider>
        <AppLink href="/trips/t1/plan" className="base" pendingClassName="lit">Plan</AppLink>
        <Pending />
      </NavigationPendingProvider>,
    );
    const link = screen.getByText("Plan");
    expect(link).toHaveClass("base");
    expect(link).not.toHaveClass("lit");
    fireEvent.click(link);
    expect(screen.getByTestId("pending")).toHaveTextContent("/trips/t1/plan");
    expect(link).toHaveClass("lit");
  });

  it("does not report a modifier-click (new tab)", () => {
    render(
      <NavigationPendingProvider>
        <AppLink href="/trips/t1/plan">Plan</AppLink>
        <Pending />
      </NavigationPendingProvider>,
    );
    fireEvent.click(screen.getByText("Plan"), { metaKey: true });
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
  });

  it("does not report a navigation the caller's onNavigate prevented", () => {
    render(
      <NavigationPendingProvider>
        <AppLink href="/trips/t1/plan" onNavigate={(e) => e.preventDefault()}>Plan</AppLink>
        <Pending />
      </NavigationPendingProvider>,
    );
    fireEvent.click(screen.getByText("Plan"));
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
  });

  it("renders as a plain link without a provider", () => {
    render(<AppLink href="/trips">Trips</AppLink>);
    expect(screen.getByText("Trips")).toHaveAttribute("href", "/trips");
  });
});
```

`components/navigation/use-app-router.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/trips/t1",
  useSearchParams: () => new URLSearchParams(),
}));

import { useAppRouter } from "./use-app-router";
import { NavigationPendingProvider, useNavigationPending } from "./navigation-pending";

describe("useAppRouter", () => {
  it("push/replace forward to the router with their options and report to the pending context", () => {
    const { result } = renderHook(() => ({ router: useAppRouter(), pending: useNavigationPending() }), {
      wrapper: ({ children }) => <NavigationPendingProvider>{children}</NavigationPendingProvider>,
    });
    act(() => result.current.router.push("/trips/t1/day/2026-12-05", { transitionTypes: ["day-forward"] }));
    expect(push).toHaveBeenCalledWith("/trips/t1/day/2026-12-05", { transitionTypes: ["day-forward"] });
    expect(result.current.pending?.href).toBe("/trips/t1/day/2026-12-05");
    act(() => result.current.router.replace("/trips/t1/plan"));
    expect(replace).toHaveBeenCalledWith("/trips/t1/plan", undefined);
  });

  it("is a plain router without a provider", () => {
    const { result } = renderHook(() => useAppRouter());
    act(() => result.current.push("/x"));
    expect(push).toHaveBeenCalledWith("/x", undefined);
  });
});
```

`components/navigation/navigation-progress.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips/t1");
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => new URLSearchParams(),
}));

import { NavigationProgress } from "./navigation-progress";
import { NavigationPendingProvider, useBeginNavigation } from "./navigation-pending";

function Go() {
  const begin = useBeginNavigation();
  return <button onClick={() => begin("/trips/t1/plan")}>go</button>;
}

afterEach(() => vi.useRealTimers());

describe("NavigationProgress", () => {
  it("stays hidden until a navigation has been pending for the delay, then shows, then hides when it lands", () => {
    vi.useFakeTimers();
    const ui = (
      <NavigationPendingProvider>
        <NavigationProgress delayMs={300} />
        <Go />
      </NavigationPendingProvider>
    );
    const { rerender } = render(ui);
    const bar = () => document.querySelector("[data-nav-progress]")!;
    expect(bar()).toHaveAttribute("data-nav-progress", "hidden");
    fireEvent.click(screen.getByText("go"));
    act(() => { vi.advanceTimersByTime(200); });
    expect(bar()).toHaveAttribute("data-nav-progress", "hidden");
    act(() => { vi.advanceTimersByTime(150); });
    expect(bar()).toHaveAttribute("data-nav-progress", "visible");
    expect(bar()).not.toHaveAttribute("hidden");
    mockUsePathname.mockReturnValue("/trips/t1/plan");
    rerender(ui);
    expect(bar()).toHaveAttribute("data-nav-progress", "hidden");
  });

  it("never shows for a navigation that lands inside the delay", () => {
    vi.useFakeTimers();
    const ui = (
      <NavigationPendingProvider>
        <NavigationProgress delayMs={300} />
        <Go />
      </NavigationPendingProvider>
    );
    const { rerender } = render(ui);
    fireEvent.click(screen.getByText("go"));
    act(() => { vi.advanceTimersByTime(100); });
    mockUsePathname.mockReturnValue("/trips/t1/plan");
    rerender(ui);
    act(() => { vi.advanceTimersByTime(500); });
    expect(document.querySelector("[data-nav-progress]")).toHaveAttribute("data-nav-progress", "hidden");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run components/navigation`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the provider**

`components/navigation/navigation-pending.tsx`:

```tsx
"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

export interface PendingNavigation {
  /** The href as the control gave it (may carry ?search and #hash). */
  href: string;
  /** Its path part — what nav controls compare against to light up early. */
  pathname: string;
  startedAt: number;
}

interface NavigationPendingValue {
  pending: PendingNavigation | null;
  begin: (href: string) => void;
}

const NavigationPendingContext = React.createContext<NavigationPendingValue>({ pending: null, begin: () => {} });

/**
 * A navigation that never lands — an error boundary that kept the old URL, a
 * fetch the browser cancelled — must not pin the progress bar on forever.
 */
export const PENDING_NAVIGATION_TIMEOUT_MS = 15_000;

/** Path part of an href: drops ?search and #hash; a search-only href is "/". */
export function pathnameOf(href: string): string {
  return href.split("#")[0].split("?")[0] || "/";
}

function withoutHash(href: string): string {
  return href.split("#")[0];
}

/**
 * Tracks the one navigation in flight (ADR 0063). Holding the old page until
 * the new one is ready (no loading.tsx between the shell and the page) means
 * nothing on screen changes when a control is tapped — so the tapped control
 * reports here, nav controls read useEffectivePathname() to light the target
 * at once, and NavigationProgress shows a bar if the wait drags on.
 *
 * Fed by AppLink (via next/link's onNavigate, which fires only for a real
 * client-side navigation — never a modifier-click or a new tab) and by
 * useAppRouter's push/replace. Settles when the URL changes; a navigation to
 * the URL already shown is not recorded, because nothing would ever settle it.
 */
export function NavigationPendingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  const current = search ? `${pathname}?${search}` : pathname;
  const [pending, setPending] = React.useState<PendingNavigation | null>(null);

  // Settle on URL change. Adjusted during render (React's "adjusting state
  // when a prop changes" pattern, as day-swipe.tsx does) rather than in an
  // effect, which react-hooks/set-state-in-effect flags.
  const [seenCurrent, setSeenCurrent] = React.useState(current);
  if (seenCurrent !== current) {
    setSeenCurrent(current);
    setPending(null);
  }

  React.useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), PENDING_NAVIGATION_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pending]);

  const begin = React.useCallback(
    (href: string) => {
      if (href.startsWith("#")) return; // same page, different scroll position
      if (withoutHash(href) === current) return; // already here: nothing to wait for
      setPending({ href, pathname: pathnameOf(href), startedAt: Date.now() });
    },
    [current],
  );

  const value = React.useMemo(() => ({ pending, begin }), [pending, begin]);
  return <NavigationPendingContext.Provider value={value}>{children}</NavigationPendingContext.Provider>;
}

export function useNavigationPending(): PendingNavigation | null {
  return React.useContext(NavigationPendingContext).pending;
}

export function useBeginNavigation(): (href: string) => void {
  return React.useContext(NavigationPendingContext).begin;
}

/**
 * The pathname a nav control should light for: the tapped target while a
 * navigation is in flight, otherwise the real one. Outside the provider (a
 * boundary shell, a test) it is simply the real pathname.
 */
export function useEffectivePathname(): string {
  const real = usePathname() ?? "";
  const pending = useNavigationPending();
  return pending ? pending.pathname : real;
}
```

- [ ] **Step 4: Write `AppLink`**

`components/navigation/app-link.tsx`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useBeginNavigation, useNavigationPending } from "@/components/navigation/navigation-pending";

type LinkProps = React.ComponentProps<typeof Link>;

export interface AppLinkProps extends LinkProps {
  /** Classes added while THIS link's navigation is in flight (the Day arrows' pressed look). */
  pendingClassName?: string;
}

/**
 * `next/link` that reports its navigation to NavigationPendingProvider (ADR
 * 0063). Every in-app nav control uses this rather than next/link directly,
 * so the tapped target lights at once and NavigationProgress can show a bar.
 * `onNavigate` fires only for a client-side navigation — never a
 * modifier-click, a new tab or a download — so those never leave a pending
 * state behind. A non-string href (UrlObject) is passed through untracked.
 */
export const AppLink = React.forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { href, onNavigate, pendingClassName, className, ...rest },
  ref,
) {
  const begin = useBeginNavigation();
  const pending = useNavigationPending();
  const hrefString = typeof href === "string" ? href : null;
  const isPending = hrefString != null && pending?.href === hrefString;
  return (
    <Link
      ref={ref}
      href={href}
      className={cn(className, isPending && pendingClassName)}
      onNavigate={(e) => {
        let prevented = false;
        onNavigate?.({
          preventDefault() {
            prevented = true;
            e.preventDefault();
          },
        });
        if (!prevented && hrefString != null) begin(hrefString);
      }}
      {...rest}
    />
  );
});
```

- [ ] **Step 5: Write `useAppRouter`**

`components/navigation/use-app-router.ts`:

```ts
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useBeginNavigation } from "@/components/navigation/navigation-pending";

type Router = ReturnType<typeof useRouter>;

/**
 * `useRouter` whose push/replace also report to NavigationPendingProvider
 * (ADR 0063) — for controls that navigate programmatically: the Day keyboard
 * arrows and swipe, the command palette, the fork switcher, the route map.
 */
export function useAppRouter(): Router {
  const router = useRouter();
  const begin = useBeginNavigation();
  return React.useMemo<Router>(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<Router["push"]>[1]) => {
        begin(href);
        router.push(href, options);
      },
      replace: (href: string, options?: Parameters<Router["replace"]>[1]) => {
        begin(href);
        router.replace(href, options);
      },
    }),
    [router, begin],
  );
}
```

- [ ] **Step 6: Write `NavigationProgress`**

`components/navigation/navigation-progress.tsx`:

```tsx
"use client";

import * as React from "react";
import { useNavigationPending } from "@/components/navigation/navigation-pending";

export const NAVIGATION_PROGRESS_DELAY_MS = 300;

/**
 * A 2px bar across the top of the viewport that appears only once a
 * navigation has been pending longer than `delayMs` (ADR 0063): a fast
 * network never sees it; a slow one gets a signal without a skeleton.
 * Mounted once by app/(app)/layout.tsx. The sr-only status line gives screen
 * readers the same "still loading" cue.
 */
export function NavigationProgress({ delayMs = NAVIGATION_PROGRESS_DELAY_MS }: { delayMs?: number }) {
  const pending = useNavigationPending();
  const [shownFor, setShownFor] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!pending) return;
    const startedAt = pending.startedAt;
    const t = setTimeout(() => setShownFor(startedAt), delayMs);
    return () => clearTimeout(t);
  }, [pending, delayMs]);

  const visible = pending != null && shownFor === pending.startedAt;
  return (
    <>
      <div
        data-nav-progress={visible ? "visible" : "hidden"}
        aria-hidden="true"
        hidden={!visible}
        className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-[60] h-0.5 overflow-hidden print:hidden"
      >
        <span className="tp-nav-progress block h-full w-1/3 rounded-full bg-coral" />
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {visible ? "Loading the next page" : ""}
      </span>
    </>
  );
}
```

- [ ] **Step 7: Mount in the app layout**

In `app/(app)/layout.tsx` add the imports:

```tsx
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending";
import { NavigationProgress } from "@/components/navigation/navigation-progress";
```

and change the return so the provider wraps the shell and the bar is its first child:

```tsx
  return (
    <ShellUserProvider value={shellUser}>
    <NavigationPendingProvider>
    <div className="flex min-h-full flex-col">
      <NavigationProgress />
      <OfflineBanner />
      ...unchanged...
    </div>
    </NavigationPendingProvider>
    </ShellUserProvider>
  );
```

- [ ] **Step 8: Run the tests, lint and type check**

Run: `TZ=UTC npx vitest run components/navigation && npm run lint && npx tsc --noEmit`
Expected: all four test files PASS; lint and tsc clean.

- [ ] **Step 9: Document in `COMPONENTS.md`**

Add these rows to the Catalog table (after the `<InlineCostFields>` row):

```md
| `<AppLink>` | `components/navigation/app-link.tsx` | `next/link` that reports its navigation to the pending context (ADR 0063). Every in-app nav control uses it. Extra prop `pendingClassName`. |
| `useAppRouter` | `components/navigation/use-app-router.ts` | `useRouter` whose `push`/`replace` report to the pending context. Use instead of `useRouter` for programmatic navigation. |
| `useEffectivePathname` | `components/navigation/navigation-pending.tsx` | The pathname a nav control should light for: the tapped target while a navigation is in flight, else the real one. |
| `<NavigationProgress>` | `components/navigation/navigation-progress.tsx` | 2px top bar shown only after a navigation has been pending 300ms. Mounted once in `app/(app)/layout.tsx`. |
| `<ViewTransition>` | `components/ui/view-transition.tsx` | React `ViewTransition` with a passthrough fallback for the stable React vitest resolves. The one route-motion primitive. |
```

- [ ] **Step 10: Commit**

```bash
git add components/navigation app/\(app\)/layout.tsx COMPONENTS.md
git commit -m "feat(nav): pending-navigation context, AppLink, useAppRouter and NavigationProgress (ADR 0063)"
```

---

### Task 3: Per-request cached trip-shell reads; dedupe the Day and Home pages

**Files:**
- Create: `lib/trip-shell-reads.ts`
- Create: `lib/trip-shell-reads.test.ts`
- Modify: `app/(app)/trips/[tripId]/layout.tsx:55-91`
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx:1-46,120-125`
- Modify: `app/(app)/trips/[tripId]/day/page.tsx`
- Modify: `app/(app)/trips/[tripId]/page.tsx:286-289,302-304` (and its imports)

**Interfaces:**
- Produces: `readTripShell(tripId): Promise<TripShell | null>` (`TripShell` has `id, name, startDate, endDate, homeCurrency, forksEnabled, members[{user}], stops[]` — the exact selection the trip layout makes today), `readUnreadActivityCount(tripId): Promise<number>`, `readRecentActivity(tripId, limit)`, all wrapped in React `cache()`.

- [ ] **Step 1: Write the failing test**

`lib/trip-shell-reads.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const findUnique = vi.fn(async () => ({ id: "t1", name: "EU" }));
vi.mock("@/lib/db", () => ({ db: { trip: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
const getUnreadActivityCount = vi.fn(async () => 3);
const getRecentActivity = vi.fn(async () => []);
vi.mock("@/server/actions/activity", () => ({
  getUnreadActivityCount: (...a: unknown[]) => getUnreadActivityCount(...a),
  getRecentActivity: (...a: unknown[]) => getRecentActivity(...a),
}));

import { readTripShell, readUnreadActivityCount, readRecentActivity, TRIP_SHELL_SELECT } from "./trip-shell-reads";

beforeEach(() => vi.clearAllMocks());

describe("trip-shell reads", () => {
  it("readTripShell selects everything the trip layout renders from", async () => {
    await readTripShell("t1");
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "t1" }, select: TRIP_SHELL_SELECT });
    for (const key of ["id", "name", "startDate", "endDate", "homeCurrency", "forksEnabled", "members", "stops"]) {
      expect(TRIP_SHELL_SELECT).toHaveProperty(key);
    }
  });

  it("the activity reads delegate with their arguments", async () => {
    expect(await readUnreadActivityCount("t1")).toBe(3);
    expect(getUnreadActivityCount).toHaveBeenCalledWith("t1");
    await readRecentActivity("t1", 10);
    expect(getRecentActivity).toHaveBeenCalledWith("t1", 10);
  });
});

// React's cache() only memoises inside a server render, so the dedupe is
// pinned structurally: the layout and the pages under it must go through the
// cached reads, never the raw actions or their own trip query.
describe("the trip layout, Home and Day pages share the cached reads", () => {
  const root = path.resolve(__dirname, "..", "app", "(app)", "trips", "[tripId]");
  it.each([
    ["layout.tsx", path.join(root, "layout.tsx")],
    ["page.tsx (Home)", path.join(root, "page.tsx")],
    ["day/[date]/page.tsx", path.join(root, "day", "[date]", "page.tsx")],
    ["day/page.tsx", path.join(root, "day", "page.tsx")],
  ])("%s", (_label, file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/from "@\/server\/actions\/activity"/);
    expect(src).not.toMatch(/db\.trip\.findUnique/);
    expect(src).toMatch(/from "@\/lib\/trip-shell-reads"/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `TZ=UTC npx vitest run lib/trip-shell-reads.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the reads**

`lib/trip-shell-reads.ts`:

```ts
import { cache } from "react";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { getUnreadActivityCount, getRecentActivity } from "@/server/actions/activity";

/**
 * Per-request memoised reads shared by the trip layout and the pages under
 * it (ADR 0063). The layout pays for these on every navigation; a page that
 * needs the same numbers for its own header — the Day view hides the layout's
 * (DAY_VIEW §3.1), Home renders its own — must not pay again. React `cache()`:
 * one call per distinct argument list per request, exactly like
 * requireTripAccess in lib/guards.ts.
 *
 * server/actions/activity.ts is a "use server" module, whose exports must be
 * plain async functions, so the cache() wrappers live here rather than there.
 */
export const readUnreadActivityCount = cache((tripId: string) => getUnreadActivityCount(tripId));
export const readRecentActivity = cache((tripId: string, limit: number) => getRecentActivity(tripId, limit));

/** The trip layout's selection, shared so the Day index and Day page can read the same row for free. */
export const TRIP_SHELL_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  homeCurrency: true,
  forksEnabled: true,
  members: { select: { user: { select: TRAVELLER_SELECT } } },
  stops: {
    where: { ...REAL_PLAN, arriveDate: { not: null } },
    orderBy: { sortOrder: "asc" as const },
    select: { id: true, sortOrder: true, timezone: true, arriveDate: true, departDate: true },
  },
} as const;

export const readTripShell = cache((tripId: string) => db.trip.findUnique({ where: { id: tripId }, select: TRIP_SHELL_SELECT }));

export type TripShell = NonNullable<Awaited<ReturnType<typeof readTripShell>>>;
```

- [ ] **Step 4: Use them in the trip layout**

In `app/(app)/trips/[tripId]/layout.tsx`: remove the imports of `db`, `REAL_PLAN`, `TRAVELLER_SELECT`, `getUnreadActivityCount`, `getRecentActivity` **only if nothing else in the file uses them** (the file still uses `db.attachment.findMany`, so keep `db`; `generateMetadata` uses `db.trip.findUnique` for the title — replace that with `readTripShell(tripId)` too and read `.name`). Add:

```ts
import { readTripShell, readUnreadActivityCount, readRecentActivity } from "@/lib/trip-shell-reads";
```

Replace the `const trip = await db.trip.findUnique({...})` block with `const trip = await readTripShell(tripId);` and in the `Promise.all` replace `getUnreadActivityCount(tripId)` → `readUnreadActivityCount(tripId)` and `getRecentActivity(tripId, 10)` → `readRecentActivity(tripId, 10)`.

- [ ] **Step 5: Use them in the Day page**

In `app/(app)/trips/[tripId]/day/[date]/page.tsx`: delete the imports of `db`, `TRAVELLER_SELECT`, `getUnreadActivityCount`, `getRecentActivity`; add `import { readTripShell, readUnreadActivityCount, readRecentActivity } from "@/lib/trip-shell-reads";`. Replace the `Promise.all` with:

```ts
  const [data, unreadCount, recent, shell] = await Promise.all([
    getDay(tripId, date, user.id),
    readUnreadActivityCount(tripId),
    readRecentActivity(tripId, 10),
    readTripShell(tripId),
  ]);
```

and in the JSX: `tripName={shell?.name ?? d.trip.name}` and `members={(shell?.members ?? []).map((m) => m.user)}`.

- [ ] **Step 6: Use them in the Day index redirect**

`app/(app)/trips/[tripId]/day/page.tsx` becomes:

```ts
import { redirect } from "next/navigation";
import { requireTripAccess } from "@/lib/guards";
import { readTripShell } from "@/lib/trip-shell-reads";
import { tripTodayISO } from "@/lib/trip-today";
import { defaultDayISO } from "@/lib/day-view-default";

/**
 * /trips/:id/day → the default day (spec decision 3); date-less → Plan. The
 * Days nav links straight at the default day (ADR 0063, DaysHrefProvider), so
 * this is only reached by deep links and bookmarks.
 */
export default async function DayIndexPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  await requireTripAccess(tripId);
  const trip = await readTripShell(tripId);
  if (!trip) redirect(`/trips/${tripId}`);
  const date = defaultDayISO({ startDate: trip.startDate, endDate: trip.endDate, today: tripTodayISO(trip.stops) });
  redirect(date ? `/trips/${tripId}/day/${date}` : `/trips/${tripId}/plan`);
}
```

- [ ] **Step 7: Use them on Home**

In `app/(app)/trips/[tripId]/page.tsx`: replace the import of `getUnreadActivityCount, getRecentActivity` from `@/server/actions/activity` with `import { readUnreadActivityCount, readRecentActivity } from "@/lib/trip-shell-reads";` and update both `Promise.all` sites (lines ~286-289 and ~302-304) to call `readUnreadActivityCount(tripId)` and `readRecentActivity(tripId, 10)`. If the file also calls `db.trip.findUnique` for the trip (line ~55) leave that query alone **unless** its `select` is a subset of `TRIP_SHELL_SELECT`; if it is a subset, replace it with `readTripShell(tripId)` and adjust field access. If it is not a subset, the structural test's `db.trip.findUnique` assertion for Home must be relaxed: change that test row to only assert the activity import and the trip-shell-reads import for `page.tsx (Home)`. Say which you did in the commit body.

- [ ] **Step 8: Run tests, lint, type check**

Run: `TZ=UTC npx vitest run lib/trip-shell-reads.test.ts && npm test && npm run lint && npx tsc --noEmit`
Expected: PASS; suite green; lint and tsc clean.

- [ ] **Step 9: Commit**

```bash
git add lib/trip-shell-reads.ts lib/trip-shell-reads.test.ts "app/(app)/trips/[tripId]"
git commit -m "perf(trip): share per-request cached shell reads between the trip layout and the Day/Home pages"
```

---

### Task 4: The Days tab links straight at the default day

**Files:**
- Create: `components/trip/days-href-context.tsx`
- Create: `components/trip/days-href-context.test.tsx`
- Modify: `components/trip/trip-nav.tsx:75-118,150-160`
- Modify: `components/shell/sidebar-nav.tsx:55-58`
- Modify: `components/trip/mobile-tab-bar.tsx:36-42`
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (compute + provide)
- Modify: `components/trip/trip-nav.test.tsx`, `components/shell/sidebar.test.tsx`, `components/trip/mobile-tab-bar.test.tsx` (add one case each)

**Interfaces:**
- Consumes: `defaultDayISO` (`lib/day-view-default.ts`), `tripTodayISO` (`lib/trip-today.ts`) — both already imported in the layout's vicinity.
- Produces: `DaysHrefProvider({ href: string | null })`, `useDaysHref(): string | null`; `tripRailItems(tripId, planParam?, daysHref?: string | null)` — third argument new, optional.

- [ ] **Step 1: Write the failing tests**

`components/trip/days-href-context.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DaysHrefProvider, useDaysHref } from "./days-href-context";

function Probe() {
  return <output>{useDaysHref() ?? "null"}</output>;
}

describe("DaysHrefProvider", () => {
  it("supplies the Days target to descendants and null outside it", () => {
    render(<DaysHrefProvider href="/trips/t1/day/2026-12-04"><Probe /></DaysHrefProvider>);
    expect(screen.getByText("/trips/t1/day/2026-12-04")).toBeInTheDocument();
    render(<Probe />);
    expect(screen.getByText("null")).toBeInTheDocument();
  });
});
```

Add to `components/trip/trip-nav.test.tsx` (inside the existing top-level `describe`, using the file's existing mocks):

```tsx
  it("tripRailItems points Days at the default day when given one, and still lights Days on any other date (ADR 0063)", () => {
    const items = tripRailItems("t1", null, "/trips/t1/day/2026-12-04");
    const days = items.find((i) => i.label === "Days")!;
    expect(days.href).toBe("/trips/t1/day/2026-12-04");
    expect(days.match("/trips/t1/day/2026-12-09")).toBe(true);
    expect(days.match("/trips/t1/calendar")).toBe(false);
    expect(tripRailItems("t1", null, null).find((i) => i.label === "Days")!.href).toBe("/trips/t1/day");
  });

  it("TripNav reads the Days target from DaysHrefProvider", () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    render(<DaysHrefProvider href="/trips/t1/day/2026-12-04"><TripNav tripId="t1" /></DaysHrefProvider>);
    expect(screen.getByRole("link", { name: "Days" })).toHaveAttribute("href", "/trips/t1/day/2026-12-04");
  });
```

with `import { DaysHrefProvider } from "@/components/trip/days-href-context";` at the top.

Add to `components/shell/sidebar.test.tsx` (its `renderSidebar` helper renders `<Sidebar …>` directly; this case renders the same element inside the provider — copy the props from `renderSidebar`):

```tsx
  it("links Days at the default day from DaysHrefProvider (ADR 0063)", () => {
    render(
      <DaysHrefProvider href="/trips/t1/day/2026-12-04">
        <Sidebar user={USER} isAdmin={false} pendingAccessRequests={0} trip={TRIP} switcher={<SidebarTripPlaceholder trip={TRIP} />} />
      </DaysHrefProvider>,
    );
    const href = (name: string) => within(mainNav()).getByRole("link", { name }).getAttribute("href");
    expect(href("Days")).toBe("/trips/t1/day/2026-12-04");
    expect(href("Calendar")).toBe("/trips/t1/calendar");
  });
```

Add to `components/trip/mobile-tab-bar.test.tsx`:

```tsx
  it("links Days at the default day from DaysHrefProvider and still lights it on another date (ADR 0063)", () => {
    mockUsePathname.mockReturnValue("/trips/t1/day/2026-12-09");
    render(<DaysHrefProvider href="/trips/t1/day/2026-12-04"><MobileTabBar tripId="t1" /></DaysHrefProvider>);
    const days = screen.getByRole("link", { name: "Days" });
    expect(days).toHaveAttribute("href", "/trips/t1/day/2026-12-04");
    expect(days).toHaveAttribute("aria-current", "page");
  });
```

Both files import `DaysHrefProvider` from `@/components/trip/days-href-context`.

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run components/trip/days-href-context.test.tsx components/trip/trip-nav.test.tsx components/shell/sidebar.test.tsx components/trip/mobile-tab-bar.test.tsx`
Expected: FAIL — module not found / hrefs are `/trips/t1/day`.

- [ ] **Step 3: Write the context**

`components/trip/days-href-context.tsx`:

```tsx
"use client";

import * as React from "react";

const DaysHrefContext = React.createContext<string | null>(null);

/**
 * The Days tab's real target — /trips/:id/day/<default date> — supplied by
 * the trip layout, which already knows the trip's dates, so the tab lands on
 * the day in one hop instead of via day/page.tsx's redirect (ADR 0063). Null
 * (a date-less Trip, or no provider in a test) falls back to /trips/:id/day.
 */
export function DaysHrefProvider({ href, children }: { href: string | null; children: React.ReactNode }) {
  return <DaysHrefContext.Provider value={href}>{children}</DaysHrefContext.Provider>;
}

export function useDaysHref(): string | null {
  return React.useContext(DaysHrefContext);
}
```

- [ ] **Step 4: Thread it through the three nav surfaces**

`components/trip/trip-nav.tsx` — change the signature and the Days item:

```ts
export function tripRailItems(tripId: string, planParam?: string | null, daysHref?: string | null): TripRailItem[] {
  ...
  // Matching stays on the /day prefix whatever the href says, so every dated
  // day lights the tab (isDaysActive); the href alone carries the default date.
  const daysIndexHref = byLabel("Days").href;

  return [
    simple("Home"),
    simple("Plan"),
    { label: "Days", href: daysHref ?? daysIndexHref, match: (p) => isDaysActive(daysIndexHref, p, base) },
    ...
```

and in `TripNav`: `import { useDaysHref } from "@/components/trip/days-href-context";` then `const daysHref = useDaysHref();` and `...tripRailItems(tripId, planParam, daysHref).map(...)`.

`components/shell/sidebar-nav.tsx`: import `useDaysHref`, `const daysHref = useDaysHref();`, `tripRailItems(tripId, planParam, daysHref)`.

`components/trip/mobile-tab-bar.tsx`: import `useDaysHref`, `const daysHref = useDaysHref();`, and the Days item becomes
`{ href: daysHref ?? byLabel("Days").href, label: "Days", match: (p) => isDaysActive(byLabel("Days").href, p, base) },`.

- [ ] **Step 5: Provide it from the trip layout**

In `app/(app)/trips/[tripId]/layout.tsx`: add
```ts
import { defaultDayISO } from "@/lib/day-view-default";
import { DaysHrefProvider } from "@/components/trip/days-href-context";
```
after `const today = tripTodayISO(trip.stops);` add
```ts
  // The Days tab's one-hop target (ADR 0063); null for a date-less Trip.
  const defaultDay = defaultDayISO({ startDate: trip.startDate, endDate: trip.endDate, today });
  const daysHref = defaultDay ? `/trips/${tripId}/day/${defaultDay}` : null;
```
and wrap the returned `<div data-trip-shell ...>` in `<DaysHrefProvider href={daysHref}>…</DaysHrefProvider>`.

- [ ] **Step 6: Run tests, lint, type check**

Run: `TZ=UTC npx vitest run components/trip components/shell && npm run lint && npx tsc --noEmit`
Expected: PASS; `lib/help-guide.test.ts`'s nav-label guard is untouched (labels unchanged).

- [ ] **Step 7: Commit**

```bash
git add components/trip/days-href-context.tsx components/trip/days-href-context.test.tsx components/trip/trip-nav.tsx components/trip/trip-nav.test.tsx components/shell/sidebar-nav.tsx components/shell/sidebar.test.tsx components/trip/mobile-tab-bar.tsx components/trip/mobile-tab-bar.test.tsx "app/(app)/trips/[tripId]/layout.tsx"
git commit -m "feat(nav): Days tab links straight at the default day (ADR 0063)"
```

---

### Task 5: Day view — hold the page, slide the body, light the tapped control

**Files:**
- Create: `components/trip/day/day-transition.ts`
- Create: `components/trip/day/day-transition.test.ts`
- Delete: `app/(app)/trips/[tripId]/day/[date]/loading.tsx`
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx:98-160`
- Modify: `components/trip/day/day-header.tsx:1-30`
- Modify: `components/trip/day/day-strip.tsx`
- Modify: `components/trip/day/day-keyboard-nav.tsx`
- Modify: `components/trip/day/day-swipe.tsx`
- Modify: `components/trip/day/day-header.test.tsx`, `components/trip/day/day-strip.test.tsx`, `components/trip/day/day-nav-islands.test.tsx`

**Interfaces:**
- Consumes: `AppLink` (`pendingClassName`, `transitionTypes`), `useAppRouter`, `useEffectivePathname` (Task 2); `ViewTransition` (Task 1).
- Produces: `DAY_FORWARD = "day-forward"`, `DAY_BACK = "day-back"`, `DAY_BODY_TRANSITION` (the enter/exit/default maps), `dayTransitionType(fromISO, toISO)`.

- [ ] **Step 1: Write the failing tests**

`components/trip/day/day-transition.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DAY_BACK, DAY_FORWARD, DAY_BODY_TRANSITION, dayTransitionType } from "./day-transition";

describe("day transitions", () => {
  it("a later date is forward, an earlier one back", () => {
    expect(dayTransitionType("2026-12-04", "2026-12-05")).toBe(DAY_FORWARD);
    expect(dayTransitionType("2026-12-04", "2026-11-30")).toBe(DAY_BACK);
    expect(dayTransitionType("2026-12-04", "2027-01-01")).toBe(DAY_FORWARD);
  });
  it("untyped transitions (back/forward, refresh) get no directional motion", () => {
    expect(DAY_BODY_TRANSITION.default).toBe("none");
    expect(DAY_BODY_TRANSITION.enter.default).toBe("none");
    expect(DAY_BODY_TRANSITION.exit.default).toBe("none");
    expect(DAY_BODY_TRANSITION.enter[DAY_FORWARD]).toBe(DAY_FORWARD);
    expect(DAY_BODY_TRANSITION.exit[DAY_BACK]).toBe(DAY_BACK);
  });
});
```

Update `components/trip/day/day-header.test.tsx`: replace the `next/link` mock (line 5) with one that records props and strips the non-DOM ones:

```tsx
// vi.hoisted: the mock factory runs when ./day-header is first imported,
// which is before a plain top-level `const` here would be initialised.
const hoisted = vi.hoisted(() => ({ links: [] as Array<Record<string, unknown>> }));
vi.mock("next/link", () => ({
  default: ({ href, children, onNavigate: _n, transitionTypes, ...r }: { href: string; children: React.ReactNode } & Record<string, unknown>) => {
    hoisted.links.push({ href, transitionTypes });
    return <a href={href} {...r}>{children}</a>;
  },
}));
```

and add a case:

```tsx
  it("tags the arrows' navigations as day-back / day-forward for the body's View Transition (ADR 0063)", () => {
    hoisted.links.length = 0;
    render(<DayHeader tripId="t1" eyebrow="E" heading="Sat 12 Dec" subLine="" subLineCompact="" dayTitle={null} prevHref="/trips/t1/day/2026-12-11" nextHref="/trips/t1/day/2026-12-13" prevLabel="Previous day: Fri 11 Dec" nextLabel="Next day: Sun 13 Dec" unreadCount={0} recent={[]} members={[]} addButton={<button>+</button>} />);
    expect(hoisted.links.find((l) => l.href === "/trips/t1/day/2026-12-11")?.transitionTypes).toEqual(["day-back"]);
    expect(hoisted.links.find((l) => l.href === "/trips/t1/day/2026-12-13")?.transitionTypes).toEqual(["day-forward"]);
  });
```

Update `components/trip/day/day-strip.test.tsx`: change the `next/link` mock (line 6) to
`vi.mock("next/link", () => ({ default: ({ href, children, onNavigate: _n, transitionTypes, ...rest }: any) => <a href={href} data-transition={Array.isArray(transitionTypes) ? transitionTypes.join(" ") : undefined} {...rest}>{children}</a> }));`
add `vi.mock("next/navigation", () => ({ usePathname: () => null, useSearchParams: () => new URLSearchParams() }));` (the strip now reads the effective pathname), and add a case:

```tsx
  it("tags chips before the current day as day-back and after it as day-forward", () => {
    render(<DayStrip tripId="t1" dates={dates} segments={[]} size="desktop" />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("data-transition", "day-back");
    expect(links[4]).toHaveAttribute("data-transition", "day-forward");
  });
```

Update `components/trip/day/day-nav-islands.test.tsx`:
- the `next/navigation` mock becomes `vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/trips/t1/day/2026-12-04", useSearchParams: () => new URLSearchParams() }));`
- in "← and → navigate": `expect(push.mock.calls).toEqual([["/n", { transitionTypes: ["day-forward"] }], ["/p", { transitionTypes: ["day-back"] }]]);`
- in the swipe test: `expect(push).toHaveBeenCalledWith("/n", { transitionTypes: ["day-forward"] });`
- **delete** the last test, "resets the leaving transition once navigation lands on the new day" — the hand-rolled slide-out is gone.

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run components/trip/day`
Expected: FAIL — `day-transition` missing; arrows carry no transitionTypes; push called without options.

- [ ] **Step 3: Write the transition constants**

`components/trip/day/day-transition.ts`:

```ts
/**
 * Day-to-day motion (ADR 0063): the body slides in the direction of travel.
 * Every input — arrows, strip, keyboard, swipe — tags its navigation with one
 * of these transition types; the body's <ViewTransition> maps them to the CSS
 * classes in app/globals.css. Untyped navigations (browser back/forward,
 * router.refresh(), a section switch landing on a day) map to "none".
 */
export const DAY_FORWARD = "day-forward";
export const DAY_BACK = "day-back";

export const DAY_BODY_TRANSITION = {
  enter: { [DAY_FORWARD]: DAY_FORWARD, [DAY_BACK]: DAY_BACK, default: "none" },
  exit: { [DAY_FORWARD]: DAY_FORWARD, [DAY_BACK]: DAY_BACK, default: "none" },
  default: "none",
} as const;

export function dayTransitionType(fromISO: string, toISO: string): typeof DAY_FORWARD | typeof DAY_BACK {
  return toISO > fromISO ? DAY_FORWARD : DAY_BACK;
}
```

- [ ] **Step 4: Arrows → `AppLink` with a type and a pressed look**

In `components/trip/day/day-header.tsx` replace `import Link from "next/link";` with

```ts
import Link from "next/link";
import { AppLink } from "@/components/navigation/app-link";
import { DAY_BACK, DAY_FORWARD } from "@/components/trip/day/day-transition";
```

(`Link` stays for the members link) and the enabled branch of `Arrow` becomes:

```tsx
  return (
    <AppLink
      href={href}
      aria-label={label ?? undefined}
      transitionTypes={[dir === "prev" ? DAY_BACK : DAY_FORWARD]}
      className={ARROW}
      // Lit the moment it is tapped: the page holds until the next day is ready (ADR 0063).
      pendingClassName="translate-y-px bg-coral shadow-none"
    >
      {icon}
    </AppLink>
  );
```

- [ ] **Step 5: Strip → `AppLink`, current chip from the effective pathname**

In `components/trip/day/day-strip.tsx`: replace `import Link from "next/link";` with
```ts
import { AppLink } from "@/components/navigation/app-link";
import { useEffectivePathname } from "@/components/navigation/navigation-pending";
import { DAY_FORWARD, dayTransitionType } from "@/components/trip/day/day-transition";
```
Inside the component, before `const n = dates.length;`:

```ts
  // The chip lights the moment it is tapped (ADR 0063): while a navigation to
  // another day is in flight the effective pathname already names it. Any
  // other pending target (a section switch) keeps the server's answer.
  const path = useEffectivePathname();
  const serverCurrent = dates.find((d) => d.isCurrent)?.iso ?? null;
  const isCurrent = (iso: string) => (path.includes("/day/") ? path.endsWith(`/day/${iso}`) : iso === serverCurrent);
```

and in the map, replace `<Link` with `<AppLink`, `</Link>` with `</AppLink>`, `aria-current={d.isCurrent ? "date" : undefined}` with `aria-current={isCurrent(d.iso) ? "date" : undefined}`, the `d.isCurrent ? "island bg-coral shadow-hard-1" : "bg-card"` with `isCurrent(d.iso) ? …`, and add the prop `transitionTypes={[serverCurrent ? dayTransitionType(serverCurrent, d.iso) : DAY_FORWARD]}`.

- [ ] **Step 6: Keyboard and swipe → `useAppRouter` with types; drop the hand-rolled slide**

`components/trip/day/day-keyboard-nav.tsx`: replace `import { useRouter } from "next/navigation";` with `import { useAppRouter } from "@/components/navigation/use-app-router"; import { DAY_BACK, DAY_FORWARD } from "@/components/trip/day/day-transition";`, `const router = useAppRouter();`, and the two pushes become `router.push(nextHref, { transitionTypes: [DAY_FORWARD] })` / `router.push(prevHref, { transitionTypes: [DAY_BACK] })`.

`components/trip/day/day-swipe.tsx` becomes:

```tsx
"use client";
import * as React from "react";
import { useAppRouter } from "@/components/navigation/use-app-router";
import { DAY_BACK, DAY_FORWARD } from "@/components/trip/day/day-transition";

const THRESHOLD = 40;
const IGNORE = "[data-day-strip],[data-journal],.leaflet-container,[data-day-map]";

/**
 * Horizontal swipe on the page body changes day (DAY_VIEW §3.4). The motion
 * itself is the body's View Transition (ADR 0063), tagged here by direction —
 * the page holds until the next day is ready, then slides.
 */
export function DaySwipe({ prevHref, nextHref, children }: { prevHref: string | null; nextHref: string | null; children: React.ReactNode }) {
  const router = useAppRouter();
  const start = React.useRef<{ x: number; y: number; ignore: boolean } | null>(null);

  return (
    <div
      onTouchStart={(e) => {
        const t = e.target as Node;
        // React touch events bubble through portals, so a gesture inside an
        // Item/edit dialog (Radix portal) reaches this handler even though
        // its node lives outside the wrapper — `contains` excludes those.
        // The strip and journal scroll on their own, and the Day map pans.
        const own = e.currentTarget.contains(t);
        const el = t instanceof Element ? t : t.parentElement;
        const ignore = !own || !!el?.closest(IGNORE);
        start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ignore };
      }}
      onTouchEnd={(e) => {
        const s = start.current; start.current = null;
        if (!s || s.ignore) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) < THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
        const href = dx < 0 ? nextHref : prevHref;
        if (!href) return;
        router.push(href, { transitionTypes: [dx < 0 ? DAY_FORWARD : DAY_BACK] });
      }}
    >
      {children}
    </div>
  );
}
```

(`cn` is no longer imported.)

- [ ] **Step 7: Wrap the Day body; delete the skeleton**

`git rm "app/(app)/trips/[tripId]/day/[date]/loading.tsx"`.

In `app/(app)/trips/[tripId]/day/[date]/page.tsx` add
```ts
import { ViewTransition } from "@/components/ui/view-transition";
import { DAY_BODY_TRANSITION } from "@/components/trip/day/day-transition";
```
(and drop the now-unused `WeatherCardSkeleton` import only if nothing else uses it — the weather `Suspense` fallback still does, so keep it). Replace the two siblings after the strip —

```tsx
        {phoneWeather ? <div className="md:hidden">{phoneWeather}</div> : null}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-[18px]">
          ...
        </div>
```

— with the same two nodes inside one body wrapper that the View Transition animates (the header and strip above it stay still):

```tsx
        {/* Only the body slides between days (ADR 0063); header and strip stay put. */}
        <ViewTransition {...DAY_BODY_TRANSITION}>
          <div data-day-body className="flex min-h-0 flex-1 flex-col gap-3.5 lg:gap-[18px]">
            {phoneWeather ? <div className="md:hidden">{phoneWeather}</div> : null}
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-[18px]">
              ...unchanged grid contents...
            </div>
          </div>
        </ViewTransition>
```

- [ ] **Step 8: Run tests, lint, type check**

Run: `TZ=UTC npx vitest run components/trip/day && npm test && npm run lint && npx tsc --noEmit`
Expected: PASS; suite green; clean.

- [ ] **Step 9: Commit**

```bash
git add -A components/trip/day "app/(app)/trips/[tripId]/day"
git commit -m "feat(day): hold the page between days, slide the body, light the tapped control (ADR 0063)"
```

---

### Task 6: Remove the skeletons and the template; crossfade section switches; client cache; convention test

**Files:**
- Create: `components/navigation/section-transition.tsx`
- Create: `components/navigation/section-transition.test.tsx`
- Create: `app/route-conventions.test.ts`
- Create: `next.config.test.ts`
- Delete: `app/(app)/trips/[tripId]/template.tsx`, `components/ui/page-transition.tsx`, `components/ui/page-transition.test.tsx`
- Delete (20 files): `app/(app)/{account,admin,globe,help,whats-new}/loading.tsx`, `app/(app)/trips/new/loading.tsx`, `app/(app)/trips/[tripId]/loading.tsx`, `app/(app)/trips/[tripId]/{activity,budget,calendar,checklists,compare,files,help,journal,plan,print,settings,summary,wishlist}/loading.tsx`
- Keep: `app/(app)/trips/loading.tsx`
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (wrap `{children}`), `app/(app)/layout.tsx` (wrap `{children}` inside `<main>`), `next.config.ts`

**Interfaces:**
- Consumes: `ViewTransition` (Task 1).
- Produces: `SectionTransition({ children })`, `SECTION_CROSSFADE = "tp-crossfade"`.

**In-page Suspense (spec WS-B, decided during planning):** no new boundaries. Every await left in the section pages is a local Prisma query; the only external fetch (weather) already streams behind its own `<Suspense>`. Do not wrap the Day body cards — holding them is the point.

- [ ] **Step 1: Write the failing tests**

`components/navigation/section-transition.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockSegment = vi.fn<() => string | null>(() => "plan");
vi.mock("next/navigation", () => ({ useSelectedLayoutSegment: () => mockSegment() }));

import { SectionTransition } from "./section-transition";

describe("SectionTransition", () => {
  it("wraps the layout's child segment in a keyed section", () => {
    render(<SectionTransition><p>Plan page</p></SectionTransition>);
    expect(screen.getByText("Plan page").closest("[data-section]")).toHaveAttribute("data-section", "plan");
  });
  it("names the index segment so Home is its own section", () => {
    mockSegment.mockReturnValue(null);
    render(<SectionTransition><p>Home</p></SectionTransition>);
    expect(screen.getByText("Home").closest("[data-section]")).toHaveAttribute("data-section", "__index");
  });
});
```

`app/route-conventions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const APP = path.resolve(__dirname, "(app)");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const files = (basename: string) => walk(APP).filter((f) => path.basename(f) === basename).map((f) => path.relative(APP, f)).sort();

/**
 * ADR 0063: a loading.tsx anywhere between the shared shell and a changing
 * segment replaces the page with a skeleton on every sibling switch. The one
 * boundary that keeps its skeleton is entering/switching a Trip.
 */
describe("route conventions under app/(app) (ADR 0063)", () => {
  it("has exactly one loading.tsx — trips/loading.tsx", () => {
    expect(files("loading.tsx")).toEqual(["trips/loading.tsx"]);
  });
  it("has no template.tsx (ADR 0063 amends ADR 0006: SectionTransition replaces the remount-and-fade)", () => {
    expect(files("template.tsx")).toEqual([]);
  });
});
```

`next.config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import config from "./next.config";

describe("next.config", () => {
  it("keeps dynamic pages in the client router cache for 30s (ADR 0063)", () => {
    expect(config.experimental?.staleTimes?.dynamic).toBe(30);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run components/navigation/section-transition.test.tsx app/route-conventions.test.ts next.config.test.ts`
Expected: FAIL — module missing; 22 loading files and one template found; staleTimes undefined.

- [ ] **Step 3: Write `SectionTransition`**

`components/navigation/section-transition.tsx`:

```tsx
"use client";

import * as React from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { ViewTransition } from "@/components/ui/view-transition";

export const SECTION_CROSSFADE = "tp-crossfade";

/**
 * Crossfades a layout's child segment when it changes — Plan → Money, Trips →
 * Globe — and does nothing for changes deeper down (day → day, which the Day
 * body animates itself) or for untyped updates. Keyed on the segment so the
 * old section exits and the new one enters as a pair; the old one stays on
 * screen until the new one's data has arrived (ADR 0063, replacing the trip
 * template.tsx + PageTransition remount-and-fade of ADR 0006).
 */
export function SectionTransition({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment() ?? "__index";
  return (
    <ViewTransition key={segment} enter={SECTION_CROSSFADE} exit={SECTION_CROSSFADE} default="none">
      <div data-section={segment} className="w-full">
        {children}
      </div>
    </ViewTransition>
  );
}
```

- [ ] **Step 4: Delete the template, the transition wrapper and the twenty skeletons**

```bash
git rm "app/(app)/trips/[tripId]/template.tsx" components/ui/page-transition.tsx components/ui/page-transition.test.tsx
git rm "app/(app)/account/loading.tsx" "app/(app)/admin/loading.tsx" "app/(app)/globe/loading.tsx" "app/(app)/help/loading.tsx" "app/(app)/whats-new/loading.tsx" "app/(app)/trips/new/loading.tsx" "app/(app)/trips/[tripId]/loading.tsx"
for s in activity budget calendar checklists compare files help journal plan print settings summary wishlist; do git rm "app/(app)/trips/[tripId]/$s/loading.tsx"; done
```

If a deleted skeleton exported something another file imported (grep `from "@/app/(app)` and `loading"` across `components/` and `app/`), inline the import's target into the importer or delete the import; do not keep a `loading.tsx`.

- [ ] **Step 5: Wrap the two layouts' children**

`app/(app)/trips/[tripId]/layout.tsx`: `import { SectionTransition } from "@/components/navigation/section-transition";` and replace `{children}` (inside the `py-6 …` div, after `FeedbackTripMarker`) with `<SectionTransition>{children}</SectionTransition>`.

`app/(app)/layout.tsx`: same import; inside `<main …>` replace `{children}` with `<SectionTransition>{children}</SectionTransition>`. (`main`'s `has-[[data-trip-shell]]` variant still matches: the trip shell is still a descendant.)

- [ ] **Step 6: Client cache**

`next.config.ts`:

```ts
const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
    // ADR 0063: a dynamic page seen in the last 30s is served from the client
    // router cache, so stepping back is instant. Every mutation revalidates or
    // refreshes, so the Traveller's own edits are never stale.
    staleTimes: { dynamic: 30 },
  },
  ...
```

- [ ] **Step 7: Run tests, lint, type check**

Run: `TZ=UTC npx vitest run components/navigation/section-transition.test.tsx app/route-conventions.test.ts next.config.test.ts && npm test && npm run lint && npx tsc --noEmit`
Expected: PASS; suite green (no test may still import `page-transition`); clean.

- [ ] **Step 8: Commit**

```bash
git add -A app components/navigation components/ui next.config.ts next.config.test.ts
git commit -m "feat(nav): hold the page on section switches — remove skeletons and template, crossfade via ViewTransition, 30s client cache (ADR 0063)"
```

---

### Task 7: Nav controls light the tapped target at once

**Files:**
- Modify: `components/ui/dock.tsx`, `components/ui/tab-bar.tsx`, `components/shell/sidebar-nav.tsx`, `components/trip/mobile-tab-bar.tsx`, `components/shell/trip-switcher.tsx`, `app/(app)/layout.tsx` (phone top-bar links), `components/command-palette-results.tsx:194-205`, `components/trip/home/desktop/route-map-tile.tsx`, `components/trip/fork-switcher.tsx`
- Create: `components/ui/dock.test.tsx`, `components/ui/tab-bar.test.tsx`

**Interfaces:**
- Consumes: `AppLink`, `useEffectivePathname`, `useAppRouter`, `NavigationPendingProvider` (Task 2).

- [ ] **Step 1: Write the failing tests**

`components/ui/dock.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips/t1");
vi.mock("next/navigation", () => ({ usePathname: () => mockUsePathname(), useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, children, onNavigate, transitionTypes: _t, ...rest }: any) => (
    <a href={href} onClick={(e) => { e.preventDefault(); onNavigate?.({ preventDefault() {} }); }} {...rest}>{children}</a>
  ),
}));

import { Dock } from "./dock";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending";

const items = [
  { href: "/trips/t1", label: "Home", match: (p: string) => p === "/trips/t1" },
  { href: "/trips/t1/plan", label: "Plan" },
];

describe("Dock", () => {
  it("lights the tapped item before the URL changes (ADR 0063)", () => {
    render(<NavigationPendingProvider><Dock items={items} /></NavigationPendingProvider>);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("link", { name: "Plan" }));
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });
});
```

`components/ui/tab-bar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips/t1");
vi.mock("next/navigation", () => ({ usePathname: () => mockUsePathname(), useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, children, onNavigate, transitionTypes: _t, ...rest }: any) => (
    <a href={href} onClick={(e) => { e.preventDefault(); onNavigate?.({ preventDefault() {} }); }} {...rest}>{children}</a>
  ),
}));

import { TabBar } from "./tab-bar";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending";

const items = [
  { href: "/trips/t1", label: "Home", match: (p: string) => p === "/trips/t1" },
  { href: "/trips/t1/plan", label: "Plan" },
];

describe("TabBar", () => {
  it("lights the tapped tab before the URL changes (ADR 0063)", () => {
    render(<NavigationPendingProvider><TabBar items={items} /></NavigationPendingProvider>);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("link", { name: "Plan" }));
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run components/ui/dock.test.tsx components/ui/tab-bar.test.tsx`
Expected: FAIL — Plan not current after the click.

- [ ] **Step 3: Switch the controls**

In each of `components/ui/dock.tsx`, `components/ui/tab-bar.tsx`, `components/shell/sidebar-nav.tsx`, `components/trip/mobile-tab-bar.tsx`:
- replace `import Link from "next/link";` with `import { AppLink } from "@/components/navigation/app-link";` and every `<Link` / `</Link>` with `<AppLink` / `</AppLink>`;
- replace the `usePathname` import with `import { useEffectivePathname } from "@/components/navigation/navigation-pending";` (keep `useSearchParams` where used) and `usePathname()` with `useEffectivePathname()` — in `dock.tsx` (`const path`), `tab-bar.tsx` (`const path`), `sidebar-nav.tsx` (`const pathname`), `mobile-tab-bar.tsx` (`const pathname`, which drives `sheetActive`).
- Add a one-line comment at the swapped hook: `// The tapped target counts as current while its navigation is in flight (ADR 0063).`

`components/shell/trip-switcher.tsx`: `Link` → `AppLink` for the three menu links (trip, "All trips", "+ New trip"). It is a client component; leave `usePathname` usage (if any) alone.

`app/(app)/layout.tsx`: the wordmark and Globe `<Link>`s in the phone top bar → `<AppLink>` (import it; keep `next/link` only if something else in the file still uses it).

`components/command-palette-results.tsx`: `import { useRouter } from "next/navigation";` → `import { useAppRouter } from "@/components/navigation/use-app-router";` and `const router = useRouter();` → `const router = useAppRouter();` in `useRunCommand`.

`components/trip/home/desktop/route-map-tile.tsx` and `components/trip/fork-switcher.tsx`: same `useRouter` → `useAppRouter` swap (fork-switcher keeps its `usePathname, useSearchParams` import from `next/navigation`).

Do **not** change `components/app-rail.tsx` (`OutsideTrip`/`AppRail` decide which rail to *render* from the real pathname; using the pending one would drop the rail mid-navigation).

- [ ] **Step 4: Run tests, lint, type check**

Run: `TZ=UTC npx vitest run components/ui components/shell components/trip components/command-palette.test.tsx components/command-palette-results.test.tsx && npm test && npm run lint && npx tsc --noEmit`
Expected: PASS. If an existing test's `next/navigation` mock lacks `useRouter`/`useSearchParams` that a swapped component now needs, add the missing function to that mock (returning `{ push: vi.fn(), replace: vi.fn() }` / `new URLSearchParams()`); if an existing `next/link` mock spreads `onNavigate`/`transitionTypes` onto `<a>` and the test asserts on console output, strip those two props in the mock.

- [ ] **Step 5: Commit**

```bash
git add -A components app/\(app\)/layout.tsx
git commit -m "feat(nav): nav controls light the tapped target at once via AppLink and the effective pathname (ADR 0063)"
```

---

### Task 8: The travel-map popup links navigate client-side

**Files:**
- Modify: `components/trips/travel-map.tsx:63-75,105-115`
- Modify: `components/trips/travel-map.test.tsx`

**Interfaces:**
- Consumes: `useAppRouter` (Task 2).
- Produces: `popupHtml(trip)` exported (for the test).

- [ ] **Step 1: Write the failing test**

Add to `components/trips/travel-map.test.tsx` — a `next/navigation` mock at the top with the other mocks:

```tsx
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/trips", useSearchParams: () => new URLSearchParams() }));
```

import `popupHtml` alongside `TravelMap`, and a case:

```tsx
  it("navigates client-side from a popup link instead of reloading (ADR 0063)", async () => {
    const { container } = render(<TravelMap trips={[pastTrip]} />);
    await waitFor(() => expect(hoisted.leaflet!.markers.length).toBeGreaterThan(0));
    // Leaflet renders popups inside the map container; stand one up the same way.
    const popup = document.createElement("div");
    popup.innerHTML = popupHtml(pastTrip);
    container.firstElementChild!.appendChild(popup);
    const plan = popup.querySelector('a[data-nav-href="/trips/t1/plan"]')!;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    plan.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(push).toHaveBeenCalledWith("/trips/t1/plan");
    const meta = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, metaKey: true });
    plan.dispatchEvent(meta);
    expect(meta.defaultPrevented).toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `TZ=UTC npx vitest run components/trips/travel-map.test.tsx`
Expected: FAIL — `popupHtml` not exported / no `data-nav-href`.

- [ ] **Step 3: Implement**

In `components/trips/travel-map.tsx`:
- add `import { useAppRouter } from "@/components/navigation/use-app-router";`
- `export function popupHtml(...)` and give both anchors `data-nav-href="…"` with the same value as `href` (keep `href` so middle-click and no-JS still work):

```ts
        <a href="/trips/${escapeHtml(trip.id)}" data-nav-href="/trips/${escapeHtml(trip.id)}" class="…">Home</a>
        <a href="/trips/${escapeHtml(trip.id)}/plan" data-nav-href="/trips/${escapeHtml(trip.id)}/plan" class="…">Plan</a>
```
- inside `TravelMap`, after `const isDark = theme === "dark";`:

```ts
  const router = useAppRouter();

  // Leaflet popups are HTML strings, so their links are plain <a>s that would
  // hard-reload the app (the only real full reloads left, ADR 0063). Delegate
  // plain left-clicks on them to the router; modifier-clicks keep the
  // browser's own new-tab behaviour.
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      const link = target?.closest<HTMLAnchorElement>("a[data-nav-href]");
      const href = link?.getAttribute("data-nav-href");
      if (!href) return;
      e.preventDefault();
      router.push(href);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [router]);
```

Note `mapRef.current` is null when `located.length === 0` (the component returns null); the effect's early return handles it.

- [ ] **Step 4: Run tests, lint, type check**

Run: `TZ=UTC npx vitest run components/trips && npm run lint && npx tsc --noEmit`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add components/trips/travel-map.tsx components/trips/travel-map.test.tsx
git commit -m "fix(trips): travel-map popup links navigate client-side instead of reloading (ADR 0063)"
```

---

### Task 9: `npm run audit:nav` — Playwright navigation check against the dev server

**Files:**
- Create: `scripts/nav-audit.ts`
- Create: `scripts/nav-audit/checks.ts` (pure helpers)
- Create: `scripts/nav-audit/checks.test.ts`
- Modify: `scripts/types/playwright-shim.d.ts` (add `Route`, `Request`, `page.route/unroute/goBack/setViewportSize`, `Locator.textContent/innerText`)
- Modify: `package.json` (script)
- Modify: `docs/open-follow-ups.md` (NAV-02)

**Interfaces:**
- Consumes: `resolvePlaywright`, `ensureAuthenticated`, `deriveDayDates`, `middleDate` (`scripts/lib/audit-browser.ts`); `assertLocalBaseUrl` (`scripts/layout-audit/config.ts`); `NEXT_DEV_OVERLAY_SELECTOR`, `assertNextDev` (`scripts/layout-audit/run.ts`); `resolveTripIdByName`, `TRIP_NAMES` (`scripts/layout-audit/trips.ts`).
- Produces: `npm run audit:nav` (env `BASE_URL`, default `http://localhost:3000`; `NAV_RSC_DELAY_MS`, default 1500). Exit 0 all hard checks pass; 1 a hard check failed; 2 no usable trip.

- [ ] **Step 1: Write the failing test for the pure helpers**

`scripts/nav-audit/checks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarise, holdViolations, type Sample } from "./checks";

describe("holdViolations", () => {
  const before = { h1: "Sat 12 Dec", text: "Sat 12 Dec …" };
  it("passes when every sample before the URL change still shows the old page and the bar arrives after the delay", () => {
    const samples: Sample[] = [
      { t: 100, url: "/a", h1: "Sat 12 Dec", text: "Sat 12 Dec …", bar: false, skeleton: false },
      { t: 500, url: "/a", h1: "Sat 12 Dec", text: "Sat 12 Dec …", bar: true, skeleton: false },
      { t: 1600, url: "/b", h1: "Sun 13 Dec", text: "Sun 13 Dec …", bar: false, skeleton: false },
    ];
    expect(holdViolations(before, samples, { delayMs: 300, expectBar: true })).toEqual([]);
  });
  it("reports a blank/skeleton/changed page before the URL moved, a missing bar, and an early bar", () => {
    const samples: Sample[] = [
      { t: 100, url: "/a", h1: "Sat 12 Dec", text: "Sat 12 Dec …", bar: true, skeleton: false },
      { t: 500, url: "/a", h1: "", text: "", bar: false, skeleton: true },
    ];
    const v = holdViolations(before, samples, { delayMs: 300, expectBar: true });
    expect(v).toEqual(expect.arrayContaining([
      expect.stringContaining("progress bar visible at 100ms"),
      expect.stringContaining("h1 changed or vanished at 500ms"),
      expect.stringContaining("skeleton at 500ms"),
      expect.stringContaining("progress bar never appeared"),
    ]));
  });
  it("with expectBar false, any bar is a violation", () => {
    const samples: Sample[] = [{ t: 400, url: "/a", h1: "x", text: "x", bar: true, skeleton: false }];
    expect(holdViolations({ h1: "x", text: "x" }, samples, { delayMs: 300, expectBar: false })).toEqual([expect.stringContaining("progress bar visible at 400ms")]);
  });
});

describe("summarise", () => {
  it("exit 1 only when a hard check fails", () => {
    expect(summarise([{ name: "a", hard: true, ok: true, detail: "" }, { name: "b", hard: false, ok: false, detail: "soft" }]).exitCode).toBe(0);
    expect(summarise([{ name: "a", hard: true, ok: false, detail: "x" }]).exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `TZ=UTC npx vitest run scripts/nav-audit/checks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pure helpers**

`scripts/nav-audit/checks.ts`:

```ts
/**
 * Pure logic for scripts/nav-audit.ts — no Playwright, no DOM — so the
 * "did the page hold?" judgement is unit-tested here and the script only
 * gathers samples.
 */

export interface Sample {
  /** ms since the control was activated */
  t: number;
  url: string;
  h1: string;
  text: string;
  bar: boolean;
  skeleton: boolean;
}

export interface Finding {
  name: string;
  /** hard findings gate the exit code; soft ones are reported only */
  hard: boolean;
  ok: boolean;
  detail: string;
}

/**
 * Every sample taken while the URL is still the old one must show the old
 * page unchanged (its h1 and its text), never a skeleton; the progress bar
 * must be absent before `delayMs` and, when `expectBar`, present at least
 * once after it (the RSC response is being held back long enough).
 */
export function holdViolations(
  before: { h1: string; text: string },
  samples: Sample[],
  opts: { delayMs: number; expectBar: boolean },
): string[] {
  const out: string[] = [];
  const startUrl = samples[0]?.url;
  let barSeenAfterDelay = false;
  for (const s of samples) {
    if (s.url !== startUrl) break; // landed
    if (s.skeleton) out.push(`skeleton at ${s.t}ms`);
    if (s.h1 !== before.h1) out.push(`h1 changed or vanished at ${s.t}ms ("${s.h1}")`);
    else if (s.text !== before.text) out.push(`page text changed at ${s.t}ms`);
    if (s.bar && (s.t < opts.delayMs || !opts.expectBar)) out.push(`progress bar visible at ${s.t}ms`);
    if (s.bar && s.t >= opts.delayMs) barSeenAfterDelay = true;
  }
  if (opts.expectBar && !barSeenAfterDelay) out.push("progress bar never appeared while the navigation was held");
  return out;
}

export function summarise(findings: Finding[]): { exitCode: 0 | 1; lines: string[] } {
  const lines = findings.map((f) => `${f.ok ? "PASS" : f.hard ? "FAIL" : "WARN"}  ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  const exitCode = findings.some((f) => f.hard && !f.ok) ? 1 : 0;
  return { exitCode, lines };
}
```

- [ ] **Step 4: Extend the Playwright shim**

In `scripts/types/playwright-shim.d.ts`, inside `declare module "playwright"`, add:

```ts
  // Added for scripts/nav-audit.ts — holding back RSC responses to prove the
  // page holds, and reading text off a locator.
  export interface Request {
    url(): string;
    headers(): Record<string, string>;
  }
  export interface Route {
    request(): Request;
    continue(): Promise<void>;
  }
```

and to `interface Locator`: `textContent(): Promise<string | null>;` and `innerText(): Promise<string>;` (skip any that already exist), and to `interface Page`:

```ts
    route(url: string, handler: (route: Route) => Promise<void> | void): Promise<void>;
    unroute(url: string): Promise<void>;
    goBack(options?: GotoOptions): Promise<unknown>;
    click(selector: string, options?: ClickOptions): Promise<void>;
```

(`setViewportSize`, `keyboard`, `evaluate`, `waitForURL`, `waitForSelector`, `locator`, `getByRole` already exist.)

- [ ] **Step 5: Write the script**

`scripts/nav-audit.ts`:

```ts
/**
 * Navigation audit — `npm run audit:nav`. Proves ADR 0063 in a real browser
 * against a local `next dev`: on every sibling switch the current page holds
 * (no skeleton, no blank, the old heading and text stay) until the next page
 * lands; the tapped control is current before the URL changes; the progress
 * bar appears only after ~300ms of waiting, and never on a fast switch.
 *
 * It holds every RSC navigation response back by NAV_RSC_DELAY_MS (default
 * 1500) via page.route(), samples the DOM every 100ms, and judges the samples
 * with scripts/nav-audit/checks.ts (unit-tested).
 *
 * PREREQUISITES — identical to the layout audit:
 *   - a running `next dev` at BASE_URL (default http://localhost:3000). Never
 *     `next start`: it loads .env.production.local. The first page load is
 *     refused unless the Next dev overlay is present.
 *   - Playwright + Chromium, NOT a project dependency; resolved globally:
 *       NODE_PATH=/usr/local/lib/node_modules npm run audit:nav
 *   - ALLOW_DEV_LOGIN=true on the server (signs in via "Continue as You").
 *
 * What it cannot prove: "instant". Prefetching and the client cache only
 * behave fully in a production build; those checks are soft (WARN) here and
 * live on the beta checklist in docs/specs/2026-09-27-navigation-pass.md.
 *
 * Exit codes: 0 every hard check passed; 1 a hard check failed; 2 no trip
 * with dated days was found for the signed-in Traveller.
 */

import type { Page } from "playwright";
import { resolvePlaywright, ensureAuthenticated, deriveDayDates, middleDate } from "./lib/audit-browser";
import { assertLocalBaseUrl } from "./layout-audit/config";
import { NEXT_DEV_OVERLAY_SELECTOR, assertNextDev } from "./layout-audit/run";
import { resolveTripIdByName, TRIP_NAMES } from "./layout-audit/trips";
import { holdViolations, summarise, type Finding, type Sample } from "./nav-audit/checks";

const NAV_TIMEOUT_MS = 60_000;
const DEV_OVERLAY_WAIT_MS = 5_000;
const SAMPLE_EVERY_MS = 100;
const BAR_DELAY_MS = 300;

const DESKTOP = { width: 1100, height: 800 }; // md–xl: the Dock is the trip nav
const PHONE = { width: 390, height: 844 };

type Snapshot = { url: string; h1: string; text: string; bar: boolean; skeleton: boolean };

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const main = document.querySelector('[data-testid="app-main"]');
    return {
      url: location.pathname + location.search,
      h1: document.querySelector("h1")?.textContent?.trim() ?? "",
      text: (main as HTMLElement | null)?.innerText ?? "",
      bar: document.querySelector('[data-nav-progress="visible"]') != null,
      skeleton: document.querySelector('[role="status"][aria-label^="Loading"]') != null,
    };
  });
}

/** Holds every RSC navigation response back by `delayMs`; 0 removes the hold. */
async function holdRsc(page: Page, delayMs: number): Promise<void> {
  await page.unroute("**/*").catch(() => {});
  if (delayMs <= 0) return;
  await page.route("**/*", async (route) => {
    const h = route.request().headers();
    if (h["rsc"] === "1" || h["next-router-prefetch"] === "1") await new Promise((r) => setTimeout(r, delayMs));
    await route.continue();
  });
}

/**
 * Runs `act`, then samples until the URL changes (or `maxMs`), returning the
 * samples with `t` relative to activation.
 */
async function sampleThrough(page: Page, act: () => Promise<void>, maxMs: number): Promise<Sample[]> {
  const before = await snapshot(page);
  const start = Date.now();
  await act();
  const samples: Sample[] = [];
  for (;;) {
    const s = await snapshot(page);
    const t = Date.now() - start;
    samples.push({ t, ...s });
    if (s.url !== before.url || t > maxMs) break;
    await page.waitForTimeout(SAMPLE_EVERY_MS);
  }
  return samples;
}

async function checkHold(
  page: Page,
  name: string,
  act: () => Promise<void>,
  opts: { delayMs: number; expectBar: boolean; hard: boolean; expectLandingOn?: RegExp },
): Promise<Finding> {
  const before = await snapshot(page);
  const samples = await sampleThrough(page, act, opts.delayMs + 2_500);
  const violations = holdViolations({ h1: before.h1, text: before.text }, samples, { delayMs: opts.delayMs, expectBar: opts.expectBar });
  const landed = samples[samples.length - 1];
  if (landed.url === before.url) violations.push(`never landed within ${opts.delayMs + 2_500}ms`);
  else if (opts.expectLandingOn && !opts.expectLandingOn.test(landed.url)) violations.push(`landed on ${landed.url}`);
  await page.waitForTimeout(400); // let the view transition finish before the next check
  return { name, hard: opts.hard, ok: violations.length === 0, detail: violations.join("; ") };
}

/** aria-current on the tapped control, read ~50ms after the tap (before the held response can land). */
async function currentSoonAfter(page: Page, act: () => Promise<void>, selector: string): Promise<boolean> {
  await act();
  await page.waitForTimeout(50);
  const v = await page.evaluate((sel) => document.querySelector(sel)?.getAttribute("aria-current") ?? null, selector);
  return v === "page" || v === "date";
}

async function main(): Promise<void> {
  const baseUrl = assertLocalBaseUrl(process.env.BASE_URL ?? "http://localhost:3000").origin;
  const delayMs = Number(process.env.NAV_RSC_DELAY_MS ?? 1500);
  const { chromium } = resolvePlaywright("audit:nav");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  const findings: Finding[] = [];

  try {
    await ensureAuthenticated(page, baseUrl, {
      timeoutMs: NAV_TIMEOUT_MS,
      afterFirstLoad: async (first) => {
        const found = await first.waitForSelector(NEXT_DEV_OVERLAY_SELECTOR, { state: "attached", timeout: DEV_OVERLAY_WAIT_MS }).then(() => true, () => false);
        assertNextDev(baseUrl, found);
        console.log(`target: ${baseUrl} is \`next dev\``);
      },
    });

    // The deep trip by name, else any trip whose Days tab resolves to a date.
    let tripId = await resolveTripIdByName(page, baseUrl, TRIP_NAMES.deep);
    if (!tripId) {
      await page.goto(`${baseUrl}/trips`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
      const ids = await page.evaluate(() =>
        Array.from(new Set(Array.from(document.querySelectorAll("a[href^='/trips/']")).map((a) => a.getAttribute("href")!.match(/^\/trips\/([^/?#]+)$/)?.[1]).filter((x): x is string => !!x && x !== "new"))),
      );
      for (const id of ids) {
        await page.goto(`${baseUrl}/trips/${id}/day`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
        if (/\/day\/\d{4}-\d{2}-\d{2}$/.test(page.url())) { tripId = id; break; }
      }
    }
    if (!tripId) {
      console.error("nav-audit: no trip with dated days for the signed-in Traveller — seed one (npm run db:seed) and retry.");
      process.exitCode = 2;
      return;
    }
    const base = `/trips/${tripId}`;
    const dates = await deriveDayDates(page, baseUrl, tripId);
    const mid = middleDate(dates);
    if (!mid || dates.length < 3) {
      console.error(`nav-audit: trip ${tripId} has ${dates.length} day(s); need at least 3.`);
      process.exitCode = 2;
      return;
    }
    const next = dates[dates.indexOf(mid) + 1];
    const prev = dates[dates.indexOf(mid) - 1];
    console.log(`trip: ${tripId}; days ${dates[0]}…${dates[dates.length - 1]}; middle ${mid}`);

    // Warm every route once so dev compilation never masquerades as a slow navigation.
    for (const p of [`${base}`, `${base}/plan`, `${base}/budget`, `${base}/calendar`, `${base}/wishlist`, `${base}/day/${mid}`, `${base}/day/${next}`, `${base}/day/${prev}`, "/account", "/globe"]) {
      await page.goto(`${baseUrl}${p}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    }

    // ── Day view ──────────────────────────────────────────────────────────
    await page.goto(`${baseUrl}${base}/day/${mid}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    await holdRsc(page, delayMs);
    findings.push(await checkHold(page, "Day: next arrow holds the page, bar after delay", () => page.click('a[aria-label^="Next day"]'), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${next}$`) }));
    findings.push(await checkHold(page, "Day: previous arrow", () => page.click('a[aria-label^="Previous day"]'), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${mid}$`) }));
    findings.push({ name: "Day: tapped strip chip is current before the URL changes", hard: true, ok: await currentSoonAfter(page, () => page.click(`nav[aria-label="Days"] a[href$="/day/${next}"]`), `nav[aria-label="Days"] a[href$="/day/${next}"]`), detail: "" });
    await page.waitForURL(new RegExp(`/day/${next}$`), { timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(400);
    findings.push(await checkHold(page, "Day: strip chip holds the page", () => page.click(`nav[aria-label="Days"] a[href$="/day/${mid}"]`), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${mid}$`) }));
    findings.push(await checkHold(page, "Day: → key", () => page.keyboard.press("ArrowRight"), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${next}$`) }));
    findings.push(await checkHold(page, "Day: ← key", () => page.keyboard.press("ArrowLeft"), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${mid}$`) }));

    await page.setViewportSize(PHONE);
    await page.waitForTimeout(300);
    const swipe = (from: number, to: number) => () =>
      page.evaluate(([x0, x1]) => {
        const el = document.querySelector("[data-day-body]") as HTMLElement;
        const mk = (type: string, x: number) => {
          const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
          el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [touch], changedTouches: [touch] }));
        };
        mk("touchstart", x0);
        mk("touchend", x1);
      }, [from, to] as [number, number]);
    findings.push(await checkHold(page, "Day: swipe left (phone)", swipe(300, 100), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${next}$`) }));
    findings.push(await checkHold(page, "Day: swipe right (phone)", swipe(100, 300), { delayMs, expectBar: true, hard: true, expectLandingOn: new RegExp(`/day/${mid}$`) }));
    await page.setViewportSize(DESKTOP);

    // ── Trip sections via the Dock ────────────────────────────────────────
    await page.goto(`${baseUrl}${base}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    await holdRsc(page, delayMs);
    const dock = (label: string) => `nav[aria-label="Trip sections"] a:has-text("${label}")`;
    for (const [label, re] of [["Plan", /\/plan$/], ["Money", /\/budget$/], ["Calendar", /\/calendar$/], ["Wishlist", /\/wishlist$/], ["Days", /\/day\/\d{4}-\d{2}-\d{2}$/], ["Home", new RegExp(`${base}$`)]] as const) {
      findings.push({ name: `Section: ${label} is current before the URL changes`, hard: true, ok: await currentSoonAfter(page, () => page.click(dock(label)), dock(label)), detail: "" });
      await page.waitForURL(re, { timeout: NAV_TIMEOUT_MS });
      await page.waitForTimeout(400);
    }
    findings.push(await checkHold(page, "Section: Home → Plan holds the page", () => page.click(dock("Plan")), { delayMs, expectBar: true, hard: true, expectLandingOn: /\/plan$/ }));
    findings.push(await checkHold(page, "Section: Plan → Money holds the page", () => page.click(dock("Money")), { delayMs, expectBar: true, hard: true, expectLandingOn: /\/budget$/ }));
    findings.push(await checkHold(page, "Section: Money → Days lands on a date in one hop", () => page.click(dock("Days")), { delayMs, expectBar: true, hard: true, expectLandingOn: /\/day\/\d{4}-\d{2}-\d{2}$/ }));

    // ── Rail destinations ─────────────────────────────────────────────────
    await page.goto(`${baseUrl}/account`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    await holdRsc(page, delayMs);
    findings.push(await checkHold(page, "Rail: You → Globe holds the page", () => page.click('nav[aria-label="Teepee"] a:has-text("Globe")'), { delayMs, expectBar: true, hard: true, expectLandingOn: /\/globe$/ }));

    // ── Fast path: no bar on an unthrottled switch (soft — dev render time) ─
    await holdRsc(page, 0);
    await page.goto(`${baseUrl}${base}/day/${mid}`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    findings.push(await checkHold(page, "Fast: next arrow without throttling shows no bar (soft in dev)", () => page.click('a[aria-label^="Next day"]'), { delayMs: BAR_DELAY_MS, expectBar: false, hard: false, expectLandingOn: new RegExp(`/day/${next}$`) }));
    const t0 = Date.now();
    await page.goBack();
    await page.waitForURL(new RegExp(`/day/${mid}$`), { timeout: NAV_TIMEOUT_MS });
    const backMs = Date.now() - t0;
    findings.push({ name: "Fast: browser back within 30s is instant (soft in dev)", hard: false, ok: backMs < 300, detail: `${backMs}ms` });
  } finally {
    await browser.close();
  }

  const { exitCode, lines } = summarise(findings);
  console.log("\n" + lines.join("\n"));
  console.log(`\nnav-audit: ${findings.filter((f) => f.ok).length}/${findings.length} passed${exitCode ? " — HARD FAILURES" : ""}`);
  process.exitCode = exitCode;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

Notes for the implementer: the `:has-text()` pseudo-class is Playwright's own selector engine and is valid in `page.click`. If `page.unroute` on a pattern that was never routed throws in this Playwright version, the `.catch(() => {})` absorbs it. If the shim lacks a method you need (e.g. `page.click`), add it to the shim rather than casting.

- [ ] **Step 6: Wire the npm script**

`package.json` scripts, after `"audit:layout:crops"`:

```json
    "audit:nav": "tsx scripts/nav-audit.ts",
```

- [ ] **Step 7: Run the unit tests, lint, type check**

Run: `TZ=UTC npx vitest run scripts/nav-audit && npm run lint && npx tsc --noEmit`
Expected: PASS; clean (the shim additions must satisfy every call in the script).

- [ ] **Step 8: Run the audit against a dev server**

```bash
cd /work && (npm run dev > /tmp/claude-1000/-work/dev.log 2>&1 &) ; sleep 1
until grep -q "Ready in\|Local:" /tmp/claude-1000/-work/dev.log; do sleep 1; done
NODE_PATH=/usr/local/lib/node_modules npm run audit:nav; echo "exit=$?"
pkill -f "next dev" || true
```

Expected: `exit=0` with every hard line `PASS`. Soft lines may be `WARN` on the dev server; report them verbatim. If the run exits 2 (no dated trip for the dev-login Traveller), report that and stop — do not seed or create trips; the orchestrator decides. If a hard check fails, that is a real defect in an earlier task: fix it there (in that file), rerun, and say what you changed.

- [ ] **Step 9: Follow-up note**

Append to `docs/open-follow-ups.md`, directly after the `NAV-01` bullet inside the "Deferred on 2026-09-27" section:

```md
- **NAV-02 · Narrow the layout-wide revalidations after a save.** 34 server
  actions call `revalidatePath(…, "layout")` — two of them
  `revalidatePath("/", "layout")` (`server/actions/profile.ts:42,100`) — which
  rebuilds the whole tree on the next request. Not a navigation problem (the
  page still holds, ADR 0063) but it makes some saves feel heavier than they
  are. Audit each call and narrow it to the segment the mutation actually
  changed.
```

- [ ] **Step 10: Commit**

```bash
git add scripts/nav-audit.ts scripts/nav-audit scripts/types/playwright-shim.d.ts package.json docs/open-follow-ups.md
git commit -m "test(nav): Playwright navigation audit against next dev (npm run audit:nav); NAV-02 follow-up"
```

---

### Task 10: Whole-branch verification and handoff notes

**Files:**
- Modify: `docs/HANDOFF.md` (a short "Navigation pass" section)

- [ ] **Step 1: Full verification**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all green. Then `git status` must be clean apart from nothing (every task committed). Do not run `next build` (loads `.env.production.local`).

- [ ] **Step 2: Handoff section**

Append to `docs/HANDOFF.md`:

```md
## Navigation pass (2026-09-27, ADR 0063)

Sibling switches hold the current page until the next is ready, then crossfade
(sections) or slide (day → day). `loading.tsx` is whitelisted to
`app/(app)/trips/loading.tsx` and `template.tsx` is gone — `app/route-conventions.test.ts`
fails if either creeps back. Nav controls go through `AppLink` / `useAppRouter`
(`components/navigation/`), which feed `NavigationProgress` and the
"light the tapped target at once" behaviour. `experimental.staleTimes.dynamic = 30`.

- `npm run audit:nav` (needs `npm run dev` + `NODE_PATH=/usr/local/lib/node_modules`)
  proves the hold in a real browser; "instant" is only provable on beta — see the
  checklist at the end of `docs/specs/2026-09-27-navigation-pass.md`.
- Deferred: `NAV-01` (Cache Components) and `NAV-02` (narrow layout revalidations)
  in `docs/open-follow-ups.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/HANDOFF.md
git commit -m "docs: handoff notes for the navigation pass"
```
