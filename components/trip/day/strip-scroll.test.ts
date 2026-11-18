import { describe, it, expect } from "vitest";
import { centredScrollLeft, phoneStripScroll, STRIP_CHIP_GAP_PX } from "./strip-scroll";

describe("centredScrollLeft (spec 2026-11-18 D2: the selected day holds the centre on a wide screen)", () => {
  // Desktop chips are 56px (w-14) with an 8px gap; the strip pads (900 - 56) / 2 at each end.
  it("the first day centres with the strip at its start", () => {
    expect(centredScrollLeft(0, 56, STRIP_CHIP_GAP_PX, 900)).toBe(0);
  });
  it("each later day moves the strip on by one chip and gap", () => {
    expect(centredScrollLeft(3, 56, STRIP_CHIP_GAP_PX, 900)).toBe(192);
    expect(centredScrollLeft(35, 56, STRIP_CHIP_GAP_PX, 900)).toBe(35 * 64);
  });
});

describe("phoneStripScroll (ADR 0065: the selected day sits in the centre)", () => {
  it("centres the selected chip in the strip's viewport", () => {
    expect(phoneStripScroll({ scrollLeft: 0, viewportWidth: 390, contentWidth: 2000, chipLeft: 471, chipWidth: 48, gap: 8 })).toBe(300);
  });
  it("clamps at the start", () => {
    expect(phoneStripScroll({ scrollLeft: 0, viewportWidth: 390, contentWidth: 2000, chipLeft: 100, chipWidth: 48, gap: 8 })).toBe(0);
  });
});
