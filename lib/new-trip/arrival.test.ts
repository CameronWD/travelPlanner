// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { ARRIVAL_KEY, markArrival, takeArrival } from "./arrival";

describe("trip-home arrival flag", () => {
  beforeEach(() => sessionStorage.clear());
  it("is taken once, by the trip it was marked for", () => {
    markArrival("t1");
    expect(takeArrival("t2")).toBe(false);
    expect(takeArrival("t1")).toBe(true);
    expect(sessionStorage.getItem(ARRIVAL_KEY)).toBeNull();
    expect(takeArrival("t1")).toBe(false);
  });
});
