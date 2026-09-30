import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { MotionValue } from "motion/react";
import { useTween } from "./use-tween";

function Probe({
  value,
  skip,
  restartOn,
  onValue,
}: {
  value: number;
  skip: boolean;
  restartOn?: boolean;
  onValue: (mv: MotionValue<number>) => void;
}) {
  const mv = useTween(value, { from: 0, duration: 0.7, skip, restartOn });
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

  it("restarts from `from` on the restartOn edge (not from wherever it sat while skipped)", () => {
    // `mv` is the same persistent MotionValue instance across re-renders
    // (useMotionValue's identity is stable), so reading it after `rerender`
    // (which flushes the effect) reflects the post-effect state — a plain
    // `latest` captured during render wouldn't, since setting a MotionValue
    // doesn't itself trigger a React re-render.
    let mv: MotionValue<number> | undefined;
    const { rerender } = render(<Probe value={1234} skip restartOn={false} onValue={(m) => (mv = m)} />);
    expect(mv!.get()).toBe(1234); // parked at the final value while skipped

    rerender(<Probe value={1234} skip={false} restartOn onValue={(m) => (mv = m)} />);
    // Without the fix this stays 1234 (animate(1234, 1234) is a no-op); with
    // it, the restartOn edge resets to `from` (0) and tweens upward.
    expect(mv!.get()).toBeLessThan(1234);
  });

  it("un-skipping WITHOUT a restartOn edge does not reset — e.g. a caller's unrelated bookkeeping settling, not a real entrance", () => {
    // This is the exact shape of the code-review regression: a "static"
    // session's `skip` can still flip false later (M9: later real changes
    // should still tween) purely because a caller-side `first` flag
    // settles — with no restartOn edge, that transition must stay a no-op,
    // not an unwanted reset-and-replay.
    let mv: MotionValue<number> | undefined;
    const { rerender } = render(<Probe value={1234} skip restartOn={false} onValue={(m) => (mv = m)} />);
    expect(mv!.get()).toBe(1234);

    rerender(<Probe value={1234} skip={false} restartOn={false} onValue={(m) => (mv = m)} />);
    expect(mv!.get()).toBe(1234);
  });
});
