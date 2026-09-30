import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { MotionValue } from "motion/react";
import { useTween } from "./use-tween";

function Probe({ value, skip, onValue }: { value: number; skip: boolean; onValue: (mv: MotionValue<number>) => void }) {
  const mv = useTween(value, { from: 0, duration: 0.7, skip });
  onValue(mv);
  return null;
}

describe("useTween", () => {
  it("jumps to the value at once when skipped (reduced motion / static)", () => {
    let latest = NaN;
    render(<Probe value={1234} skip onValue={(mv) => (latest = mv.get())} />);
    expect(latest).toBe(1234);
  });

  it("starts from `from` when animating", () => {
    let latest = NaN;
    render(<Probe value={1234} skip={false} onValue={(mv) => (latest = mv.get())} />);
    expect(latest).toBeLessThan(1234);
  });

  it("restarts from `from` (not from wherever it sat while skipped) when skip flips true → false", () => {
    // `mv` is the same persistent MotionValue instance across re-renders
    // (useMotionValue's identity is stable), so reading it after `rerender`
    // (which flushes the effect) reflects the post-effect state — a plain
    // `latest` captured during render wouldn't, since setting a MotionValue
    // doesn't itself trigger a React re-render.
    let mv: MotionValue<number> | undefined;
    const { rerender } = render(<Probe value={1234} skip onValue={(m) => (mv = m)} />);
    expect(mv!.get()).toBe(1234); // parked at the final value while skipped

    rerender(<Probe value={1234} skip={false} onValue={(m) => (mv = m)} />);
    // Without the fix this stays 1234 (animate(1234, 1234) is a no-op); with
    // it, the un-skip restarts from `from` (0) and is tweening upward.
    expect(mv!.get()).toBeLessThan(1234);
  });
});
