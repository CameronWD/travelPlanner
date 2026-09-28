import { describe, it, expect } from "vitest";
import { pickLastTrip } from "./last-trip";

const trips = [{ id: "up-next" }, { id: "b" }, { id: "c" }];
describe("pickLastTrip", () => {
  it("returns the cookie's trip when it is one of the viewer's", () => {
    expect(pickLastTrip(trips, "c")).toEqual({ id: "c" });
  });
  it("ignores a cookie for an unknown trip and falls back to the first (up-next) trip", () => {
    expect(pickLastTrip(trips, "gone")).toEqual({ id: "up-next" });
    expect(pickLastTrip(trips, null)).toEqual({ id: "up-next" });
  });
  it("null with no trips", () => {
    expect(pickLastTrip([], "x")).toBeNull();
  });
});
