import { describe, it, expect } from "vitest";
import { DAY_BACK, DAY_FORWARD, DAY_BODY_TRANSITION, DAY_TEXT, DAY_TEXT_TRANSITION, dayTransitionType } from "./day-transition";

describe("day transitions", () => {
  it("a later date is forward, an earlier one back", () => {
    expect(dayTransitionType("2026-12-04", "2026-12-05")).toBe(DAY_FORWARD);
    expect(dayTransitionType("2026-12-04", "2026-11-30")).toBe(DAY_BACK);
    expect(dayTransitionType("2026-12-04", "2027-01-01")).toBe(DAY_FORWARD);
  });
  it("untyped transitions (back/forward, refresh) get no directional motion", () => {
    expect(DAY_BODY_TRANSITION.default).toBe("none");
    expect(DAY_BODY_TRANSITION.enter.default).toBe("none");
    expect(DAY_BODY_TRANSITION.exit.default).toBe("none");
    expect(DAY_BODY_TRANSITION.enter[DAY_FORWARD]).toBe(DAY_FORWARD);
    expect(DAY_BODY_TRANSITION.exit[DAY_BACK]).toBe(DAY_BACK);
  });
  it("the heading text crossfades on typed day changes and does nothing on untyped ones (spec 2026-09-29 D4)", () => {
    expect(DAY_TEXT).toBe("day-text");
    expect(DAY_TEXT_TRANSITION.enter[DAY_FORWARD]).toBe(DAY_TEXT);
    expect(DAY_TEXT_TRANSITION.enter[DAY_BACK]).toBe(DAY_TEXT);
    expect(DAY_TEXT_TRANSITION.exit[DAY_FORWARD]).toBe(DAY_TEXT);
    expect(DAY_TEXT_TRANSITION.exit[DAY_BACK]).toBe(DAY_TEXT);
    expect(DAY_TEXT_TRANSITION.enter.default).toBe("none");
    expect(DAY_TEXT_TRANSITION.default).toBe("none");
  });
});
