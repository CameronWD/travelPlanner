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
