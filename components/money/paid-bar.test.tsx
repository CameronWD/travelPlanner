import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

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

const base = { paidMinor: 934000, totalMinor: 1482040, currency: "AUD" };

function renderPaidBar(tripId: string, props: Partial<typeof base> = {}) {
  return render(
    <MoneyEntrance tripId={tripId}>
      <PaidBar {...base} {...props} tripId={tripId} />
    </MoneyEntrance>,
  );
}

function fillTransform(): string {
  return (document.querySelector("[data-slot='paid-fill']") as HTMLElement).style.transform;
}

/**
 * PaidBar calls animate() up to four times per commit (fill, pct, paid,
 * to-go), so `.at(-1)` isn't reliable — effects fire in hook-declaration
 * order, and the fill isn't declared last. The fill's target is always
 * `pct / 100` (0–1); every other tweened value here is either the raw
 * integer percentage or a money amount, both always > 1, so filtering on
 * "target ≤ 1" reliably picks out the fill's own animate() call.
 */
function lastFillAnimateOptions(): unknown {
  const fillCalls = capturedAnimateCalls.filter((args) => typeof args[1] === "number" && (args[1] as number) <= 1);
  return fillCalls.at(-1)?.[2];
}

beforeEach(() => {
  sessionStorage.clear();
  capturedAnimateCalls.length = 0;
});

describe("PaidBar fill (MOTION.md M3–M4)", () => {
  it("a fresh session's fill starts at scaleX(0) (M3)", () => {
    renderPaidBar("fresh-fill");
    expect(fillTransform()).toContain("scaleX(0)");
  });

  it("an already-played session's fill renders at the target immediately, no entrance", () => {
    sessionStorage.setItem("money-count:static-fill", "1");
    renderPaidBar("static-fill");
    expect(fillTransform()).toContain("scaleX(0.63)");
  });

  it("the mount's first fill-in tweens with the 700ms/120ms-delay pop ease (M3)", () => {
    renderPaidBar("tween-fill");
    expect(lastFillAnimateOptions()).toEqual({ duration: 0.7, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] });
  });

  it("the fill is a transform on a full-width element, origin left, never a width (M3)", () => {
    renderPaidBar("transform-only");
    const fill = document.querySelector("[data-slot='paid-fill']") as HTMLElement;
    expect(fill.className).toContain("origin-left");
    expect(fill.className).toContain("w-full");
    expect(fill.style.width).toBe("");
  });

  it("a later paidMinor change springs the fill instead of re-running the mount tween (M4)", async () => {
    sessionStorage.setItem("money-count:spring-fill", "1"); // static — the mount's own first
    // fill-in still has nothing to actually animate from (skip stays true
    // until `first` settles), so the fix under test is that the *next* real
    // change uses `spring`, not the mount tween.
    const { rerender } = renderPaidBar("spring-fill");
    await Promise.resolve();
    await Promise.resolve();

    rerender(
      <MoneyEntrance tripId="spring-fill">
        <PaidBar {...base} paidMinor={1200000} tripId="spring-fill" />
      </MoneyEntrance>,
    );
    expect(lastFillAnimateOptions()).toEqual({ type: "spring", stiffness: 300, damping: 30 });
  });

  it('a play mount springs every update after its own first fill-in, even though phase stays "play" all session', async () => {
    const { rerender } = renderPaidBar("play-then-spring");
    expect(lastFillAnimateOptions()).toEqual({ duration: 0.7, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] });

    // Let the deferred microtask that flips `first` to false settle.
    await Promise.resolve();
    await Promise.resolve();

    rerender(
      <MoneyEntrance tripId="play-then-spring">
        <PaidBar {...base} paidMinor={1200000} tripId="play-then-spring" />
      </MoneyEntrance>,
    );
    expect(lastFillAnimateOptions()).toEqual({ type: "spring", stiffness: 300, damping: 30 });
  });
});
