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
