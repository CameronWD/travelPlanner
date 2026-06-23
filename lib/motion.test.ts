import { describe, it, expect } from "vitest";
import { DURATION, EASE_EMPHASIZED, EASE_OUT, STAGGER_STEP, SPRING_POP } from "./motion";

describe("motion vocabulary", () => {
  it("exposes the duration scale in seconds", () => {
    expect(DURATION.base).toBe(0.2);
    expect(DURATION.fast).toBe(0.12);
    expect(DURATION.exit).toBe(0.15);
    expect(DURATION.countUp).toBe(0.7);
  });
  it("exposes the easing curves as cubic-bezier tuples", () => {
    expect(EASE_EMPHASIZED).toEqual([0.32, 0.72, 0, 1]);
    expect(EASE_OUT).toEqual([0, 0, 0.2, 1]);
  });
  it("exposes a small stagger step and a pop spring", () => {
    expect(STAGGER_STEP).toBe(0.03);
    expect(SPRING_POP).toMatchObject({
      type: "spring",
      stiffness: 500,
      damping: 28,
      mass: 0.6,
    });
  });
});
