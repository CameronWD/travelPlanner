import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { render } from "@testing-library/react";
import { paidPct } from "@/lib/money/summary-lines";

// Capture every call to motion's imperative animate() (used by use-tween.ts)
// so the fill's actual transition config — tween vs. spring — can be
// inspected directly: jsdom doesn't run real animation frames, so the
// *arguments* Motion was called with are what's actually testable. Only
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

import { MoneyEntrance } from "./money-entrance";
import { PaidBar } from "./paid-bar";
import { MotionProvider } from "@/components/ui/motion-provider";

const base = { paidMinor: 934000, totalMinor: 1482040, currency: "AUD" };

function renderPaidBar(tripId: string, props: Partial<typeof base> = {}) {
  return render(
    <MoneyEntrance tripId={tripId}>
      <PaidBar {...base} {...props} tripId={tripId} />
    </MoneyEntrance>,
    { wrapper: MotionProvider },
  );
}

function fillScaleX(): number {
  const transform = (document.querySelector("[data-slot='paid-fill']") as HTMLElement).style.transform;
  return Number(/scaleX\(([\d.]+)\)/.exec(transform)?.[1] ?? NaN);
}

/** The "· N%" label's current N, read off the DOM (not the underlying
 * MotionValue) so it reflects exactly what a viewer would see. */
function pctLabelValue(): number {
  const el = document.querySelector("[data-slot='paid-bar'] .hidden.md\\:inline") as HTMLElement;
  return Number(/(\d+)%/.exec(el.textContent ?? "")?.[1] ?? NaN);
}

/**
 * PaidBar calls animate() up to four times per commit (fill, pct, paid,
 * to-go). Identifying the fill's own calls by "target ≤ 1" is ambiguous at
 * the edges (pct itself can be 0 or 1), so instead compute the fill's exact
 * expected target from the real `paidPct` business logic for the given
 * fixture and match on that — deterministic regardless of what the other
 * three tweens' targets happen to be.
 */
function fillAnimateCalls(paidMinor: number, totalMinor: number): unknown[][] {
  const target = paidPct(paidMinor, totalMinor) / 100;
  return capturedAnimateCalls.filter((args) => typeof args[1] === "number" && Math.abs((args[1] as number) - target) < 1e-9);
}

function lastFillAnimateOptions(paidMinor: number, totalMinor: number): unknown {
  return fillAnimateCalls(paidMinor, totalMinor).at(-1)?.[2];
}

beforeEach(() => {
  sessionStorage.clear();
  capturedAnimateCalls.length = 0;
});

describe("PaidBar fill (MOTION.md M3–M4)", () => {
  it("a fresh session's fill starts at scaleX(0) (M3)", () => {
    renderPaidBar("fresh-fill");
    expect(fillScaleX()).toBe(0);
  });

  it("an already-played session's fill renders at the target immediately, no entrance", () => {
    sessionStorage.setItem("money-count:static-fill", "1");
    renderPaidBar("static-fill");
    expect(fillScaleX()).toBeCloseTo(0.63);
  });

  it("the mount's first fill-in tweens with the 700ms/120ms-delay pop ease (M3)", () => {
    renderPaidBar("tween-fill");
    expect(lastFillAnimateOptions(base.paidMinor, base.totalMinor)).toEqual({
      duration: 0.7,
      delay: 0.12,
      ease: [0.2, 0.8, 0.2, 1],
    });
  });

  it("the fill is a transform on a full-width element, origin left, never a width (M3)", () => {
    renderPaidBar("transform-only");
    const fill = document.querySelector("[data-slot='paid-fill']") as HTMLElement;
    expect(fill.className).toContain("origin-left");
    expect(fill.className).toContain("w-full");
    expect(fill.style.width).toBe("");
  });

  it("during the entrance there is exactly one animate() call for the fill, and it's the tween — settling `first` must not start a second one", async () => {
    // This is the exact shape of the regression: `first` (PaidBar's own
    // "is this still the initial commit" flag, unrelated to this value)
    // flipping in a deferred microtask shortly after mount must not itself
    // cut the in-flight 700ms entrance tween short and replace it with a
    // spring — useTweenThenSpring's effect deps deliberately exclude it.
    renderPaidBar("single-call");
    expect(fillAnimateCalls(base.paidMinor, base.totalMinor)).toHaveLength(1);
    expect(lastFillAnimateOptions(base.paidMinor, base.totalMinor)).toEqual({
      duration: 0.7,
      delay: 0.12,
      ease: [0.2, 0.8, 0.2, 1],
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Still just the one call — `first` settling didn't start another.
    expect(fillAnimateCalls(base.paidMinor, base.totalMinor)).toHaveLength(1);
  });

  it("samples mid-entrance: the fill is still ≈0 during the 120ms delay, then it and the pct label progress roughly together, both well short of final", async () => {
    renderPaidBar("mid-entrance");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    // Still inside the 120ms delay window.
    expect(fillScaleX()).toBeLessThan(0.05);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300)); // ~400ms total
    });
    const targetPct = paidPct(base.paidMinor, base.totalMinor); // 63
    const fillProgress = fillScaleX() / (targetPct / 100);
    const labelProgress = pctLabelValue() / targetPct;
    // Loose bounds — real setTimeout/rAF timing in a test runner isn't exact
    // — the property this guards is "roughly in step", asserted below; these
    // just confirm neither has snapped instantly to its final value (which
    // is what a spring standing in for the 700ms tween would look like).
    expect(fillProgress).toBeGreaterThan(0.05);
    expect(fillProgress).toBeLessThan(0.99);
    expect(labelProgress).toBeGreaterThan(0.05);
    expect(labelProgress).toBeLessThan(0.99);
    // "The label counts up with it" (M3) — both driven by their own
    // independent tween, so not pixel-identical, but clearly in step.
    expect(Math.abs(fillProgress - labelProgress)).toBeLessThan(0.3);

    // Still just the one (tween) call for the fill this whole time.
    expect(fillAnimateCalls(base.paidMinor, base.totalMinor)).toHaveLength(1);
  });

  it("a later paidMinor change springs the fill instead of re-running the mount tween (M4)", async () => {
    sessionStorage.setItem("money-count:spring-fill", "1"); // static — the mount's own first
    // fill-in still has nothing to actually animate from (skip stays true
    // until `first` settles), so the fix under test is that the *next* real
    // change uses `spring`, not the mount tween.
    const { rerender } = renderPaidBar("spring-fill");

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    rerender(
      <MoneyEntrance tripId="spring-fill">
        <PaidBar {...base} paidMinor={1200000} tripId="spring-fill" />
      </MoneyEntrance>,
    );
    expect(lastFillAnimateOptions(1200000, base.totalMinor)).toEqual({ type: "spring", stiffness: 300, damping: 30 });
  });

  it('a play mount springs every update after its own first fill-in, even though phase stays "play" all session', async () => {
    const { rerender } = renderPaidBar("play-then-spring");
    expect(lastFillAnimateOptions(base.paidMinor, base.totalMinor)).toEqual({
      duration: 0.7,
      delay: 0.12,
      ease: [0.2, 0.8, 0.2, 1],
    });

    // Let the deferred microtask that flips `first` to false settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    rerender(
      <MoneyEntrance tripId="play-then-spring">
        <PaidBar {...base} paidMinor={1200000} tripId="play-then-spring" />
      </MoneyEntrance>,
    );
    expect(lastFillAnimateOptions(1200000, base.totalMinor)).toEqual({ type: "spring", stiffness: 300, damping: 30 });
  });
});
