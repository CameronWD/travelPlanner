import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";

// Capture every call to motion's imperative animate() (used by use-tween.ts)
// so the fill's exact transition config — and how many times it's called —
// can be inspected directly, the same idiom as paid-bar.test.tsx. Only
// `animate` is wrapped; everything else in "motion/react" stays real.
const capturedAnimateCalls = vi.hoisted((): unknown[][] => []);
vi.mock("motion/react", async (orig) => {
  const actual = await orig<typeof import("motion/react")>();
  return {
    ...actual,
    animate: (...args: unknown[]) => {
      capturedAnimateCalls.push(args);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (actual.animate as any)(...args);
    },
  };
});

import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { paidPct } from "@/lib/money/summary-lines";
import { MoneyEntrance } from "./money-entrance";
import { MoneyCountUp } from "./money-count-up";
import { PaidBar } from "./paid-bar";

/**
 * CRITICAL fix (code review): the entrance decision used to be made during
 * render (a `useState` lazy initialiser reading sessionStorage directly),
 * which returns "pending" server-side but "play" on the very first *client*
 * render too — differing from the server-rendered markup and triggering a
 * React 19 "Hydration failed…" recoverable error, after which React
 * discards and re-renders the whole subtree client-only, re-running the
 * initialiser a second time — which now finds the sessionStorage key already
 * set and returns "static", so the count-up never actually plays on a real
 * page load. This test exercises the real SSR → hydrate path (not just a
 * plain client `render()`, which never surfaces this because it has no
 * server-rendered markup to mismatch against) and asserts hydration is
 * clean, the count-up then progresses, and the paid bar's fill (which a
 * `motion.div`'s `initial`/`animate` props can't drive correctly here, since
 * `MoneyEntrance` never mounts while `phase === "play"` — see
 * paid-bar.tsx/use-tween.ts's `useTweenThenSpring`) resets and re-fills too,
 * in step with its "N%" label and without a stray spring cutting it short.
 */
const FIXTURE = { paidMinor: 934000, totalMinor: 1482040 };

function App({ tripId }: { tripId: string }) {
  return (
    <MoneyEntrance tripId={tripId}>
      <MoneyCountUp minor={1482040} currency="AUD" tripId={tripId} />
      <PaidBar paidMinor={FIXTURE.paidMinor} totalMinor={FIXTURE.totalMinor} currency="AUD" tripId={tripId} />
    </MoneyEntrance>
  );
}

function whole(container: HTMLElement): string | null | undefined {
  return container.querySelector("[aria-hidden='true']")?.textContent;
}

/** The fill's current `scaleX(...)` as a number — a numeric read (rather
 * than string-matching "scaleX(0)") avoids flaking on however many
 * animation frames happen to have already run by the time of the assert. */
function fillScaleX(container: HTMLElement): number {
  const transform = (container.querySelector("[data-slot='paid-fill']") as HTMLElement).style.transform;
  return Number(/scaleX\(([\d.]+)\)/.exec(transform)?.[1] ?? NaN);
}

/** The "· N%" label's current N, read off the DOM. */
function pctLabelValue(container: HTMLElement): number {
  const el = container.querySelector(".hidden.md\\:inline") as HTMLElement;
  return Number(/(\d+)%/.exec(el?.textContent ?? "")?.[1] ?? NaN);
}

/** Identifies the fill's own animate() calls by its exact expected target
 * (`paidPct / 100`) rather than a fuzzy "≤ 1" heuristic — deterministic
 * regardless of the other three tweens' (pct/paid/to-go) targets. */
function fillAnimateCalls(): unknown[][] {
  const target = paidPct(FIXTURE.paidMinor, FIXTURE.totalMinor) / 100;
  return capturedAnimateCalls.filter((args) => typeof args[1] === "number" && Math.abs((args[1] as number) - target) < 1e-9);
}

const onRecoverableError = (error: unknown) => {
  throw error instanceof Error ? error : new Error(String(error));
};

// Tracked and unmounted after every test: money-entrance.tsx's `subscribers`
// set is process-wide (not scoped per tripId), so a root left hydrated from
// a previous test stays subscribed and gets woken by a later test's
// commit()/notify() — an extra, unrelated re-render that can shift timing
// enough to make an otherwise-static session look like it re-animated.
let roots: { root: Root; container: HTMLElement }[] = [];

async function ssrThenHydrate(tripId: string): Promise<HTMLElement> {
  const html = renderToString(<App tripId={tripId} />);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);

  await act(async () => {
    const root = hydrateRoot(container, <App tripId={tripId} />, { onRecoverableError });
    roots.push({ root, container });
    // Let the post-commit microtask-deferred bits (money-entrance's
    // useSyncExternalStore correction, use-tween's restart-from-`from`)
    // settle.
    await Promise.resolve();
    await Promise.resolve();
  });
  return container;
}

beforeEach(() => {
  sessionStorage.clear();
  capturedAnimateCalls.length = 0;
});

afterEach(() => {
  for (const { root, container } of roots) {
    root.unmount();
    container.remove();
  }
  roots = [];
});

describe("MoneyEntrance + MoneyCountUp + PaidBar: real SSR → hydrate (fresh session)", () => {
  it("hydrates with no recoverable error, then the total resets off its SSR value and counts up", async () => {
    const html = renderToString(<App tripId="hydrate-1" />);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    // SSR renders "pending" → skip → the final value, no animation.
    expect(whole(container)).toBe("$14,820");

    await act(async () => {
      const root = hydrateRoot(container, <App tripId="hydrate-1" />, { onRecoverableError });
      roots.push({ root, container });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The fix: entrance resolves to "play" after hydration and use-tween
    // restarts the total from 0 rather than leaving it parked at the
    // SSR-rendered final value (which would silently never animate).
    expect(whole(container)).not.toBe("$14,820");
  });

  it("a session that has already played goes straight to the final value with no reset", async () => {
    sessionStorage.setItem("money-count:hydrate-2", "1");

    const html = renderToString(<App tripId="hydrate-2" />);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    expect(whole(container)).toBe("$14,820");
    expect(fillScaleX(container)).toBeCloseTo(0.63);

    await act(async () => {
      const root = hydrateRoot(container, <App tripId="hydrate-2" />, { onRecoverableError });
      roots.push({ root, container });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Static: stays at the final value throughout — no reset, no replay.
    expect(whole(container)).toBe("$14,820");
    expect(fillScaleX(container)).toBeCloseTo(0.63);
  });

  it("the fill passes through scaleX(0) after hydration and ends at the final value, alongside the pct label (M3)", async () => {
    // SSR: phase "pending" → skip → the fill renders at its final position
    // (no flash-of-empty-bar on a no-JS/slow-JS first paint).
    const container = await ssrThenHydrate("hydrate-fill");

    // The regression this guards: a motion.div's `initial` prop only applies
    // at its literal mount, which is always while `phase` is still
    // "pending" (MoneyEntrance stays pending through hydration on purpose).
    // Driving scaleX from a MotionValue instead means it resets to (near) 0
    // here regardless of when the component happened to mount — "near"
    // because by the time this assertion runs, the real (rAF-driven) tween
    // may already have advanced a frame or two off the exact 0 it reset to.
    expect(fillScaleX(container)).toBeLessThan(0.1);

    // A second regression this guards: settling the "is this still the
    // initial commit" bookkeeping that gates the label's later re-tweens
    // must not itself cut the fill's in-flight entrance tween short and
    // replace it with a spring — exactly one animate() call for the fill
    // through the whole entrance.
    expect(fillAnimateCalls()).toHaveLength(1);
    expect(fillAnimateCalls()[0][2]).toEqual({ duration: 0.7, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] });

    // Sample mid-entrance: fill and pct label progressing roughly together,
    // both well short of final (a spring standing in for the fill's tween
    // would have it snap to final in well under half this time).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    const targetPct = paidPct(FIXTURE.paidMinor, FIXTURE.totalMinor); // 63
    const fillProgress = fillScaleX(container) / (targetPct / 100);
    const labelProgress = pctLabelValue(container) / targetPct;
    expect(fillProgress).toBeGreaterThan(0.05);
    expect(fillProgress).toBeLessThan(0.99);
    expect(Math.abs(fillProgress - labelProgress)).toBeLessThan(0.3);
    expect(fillAnimateCalls()).toHaveLength(1); // still just the one call

    // Let the real (rAF-driven) 700ms tween + 120ms delay actually finish.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    expect(fillScaleX(container)).toBeCloseTo(0.63);
    expect(whole(container)).toBe("$14,820");
    expect(fillAnimateCalls()).toHaveLength(1); // reaching the target is still that same one tween
  });
});
