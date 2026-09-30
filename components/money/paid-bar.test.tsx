import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// Capture every prop object motion.div is rendered with, so the fill's
// `initial`/`transition` can be inspected directly — jsdom doesn't run real
// animation frames, so the *values* Motion is configured with are what's
// actually testable, same idiom as components/trip/calendar-views.test.tsx.
// Everything else in "motion/react" (motion.span, useMotionValue,
// useTransform, animate, useReducedMotion, MotionValue) stays real via a
// Proxy fallthrough, since `motion` is itself a Proxy (no plain `.div`/`.span`
// own keys to spread).
const capturedDivProps = vi.hoisted((): Record<string, unknown>[] => []);
vi.mock("motion/react", async (orig) => {
  const actual = await orig<typeof import("motion/react")>();
  return {
    ...actual,
    motion: new Proxy(actual.motion, {
      get(target, prop, receiver) {
        if (prop === "div") {
          function CapturedMotionDiv(props: Record<string, unknown>) {
            capturedDivProps.push(props);
            return React.createElement(Reflect.get(target, "div", receiver), props);
          }
          return CapturedMotionDiv;
        }
        return Reflect.get(target, prop, receiver);
      },
    }),
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

beforeEach(() => {
  sessionStorage.clear();
  capturedDivProps.length = 0;
});

describe("PaidBar fill (MOTION.md M3–M4)", () => {
  it("a fresh session's fill starts at scaleX(0) (M3)", () => {
    renderPaidBar("fresh-fill");
    const fill = document.querySelector("[data-slot='paid-fill']") as HTMLElement;
    expect(fill.style.transform).toContain("scaleX(0)");
  });

  it("an already-played session's fill renders at the target immediately, no entrance", () => {
    sessionStorage.setItem("money-count:static-fill", "1");
    renderPaidBar("static-fill");
    const fill = document.querySelector("[data-slot='paid-fill']") as HTMLElement;
    expect(fill.style.transform).toContain("scaleX(0.63)");
  });

  it("the mount's first fill-in tweens with the 700ms/120ms-delay pop ease (M3)", () => {
    renderPaidBar("tween-fill");
    const last = capturedDivProps.at(-1);
    expect(last?.transition).toEqual({ duration: 0.7, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] });
    expect(last?.initial).toEqual({ scaleX: 0 });
  });

  it("a later paidMinor change springs the fill instead of re-running the mount tween (M4)", async () => {
    sessionStorage.setItem("money-count:spring-fill", "1"); // static — `initial=false`, so the very first
    // render's transition is moot (nothing to animate from); the fix under
    // test is that it's `spring`, not the mount tween, once `first` settles.
    const { rerender } = renderPaidBar("spring-fill");
    await Promise.resolve();
    await Promise.resolve();

    rerender(
      <MoneyEntrance tripId="spring-fill">
        <PaidBar {...base} paidMinor={1200000} tripId="spring-fill" />
      </MoneyEntrance>,
    );
    expect(capturedDivProps.at(-1)?.transition).toEqual({ type: "spring", stiffness: 300, damping: 30 });
  });

  it("a play mount springs every update after its own first fill-in, even though phase stays \"play\" all session", async () => {
    const { rerender } = renderPaidBar("play-then-spring");
    expect(capturedDivProps.at(-1)?.transition).toEqual({ duration: 0.7, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] });

    // Let the deferred microtask that flips `first` to false settle.
    await Promise.resolve();
    await Promise.resolve();

    rerender(
      <MoneyEntrance tripId="play-then-spring">
        <PaidBar {...base} paidMinor={1200000} tripId="play-then-spring" />
      </MoneyEntrance>,
    );
    expect(capturedDivProps.at(-1)?.transition).toEqual({ type: "spring", stiffness: 300, damping: 30 });
  });
});
