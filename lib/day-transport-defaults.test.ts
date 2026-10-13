import { describe, it, expect } from "vitest";
import { dayTransportDefaults } from "./day-transport-defaults";

const HOME = "__home__";
const stop = { id: "s1", arriveDate: "2026-11-04", departDate: "2026-11-06" };

describe("dayTransportDefaults (spec 2026-10-13 D5)", () => {
  it("arrive day: Home base to the Stop", () => {
    expect(dayTransportDefaults("2026-11-04", stop, HOME)).toEqual({ fromStopId: HOME, toStopId: "s1" });
  });
  it("depart day: the Stop to Home base", () => {
    expect(dayTransportDefaults("2026-11-06", stop, HOME)).toEqual({ fromStopId: "s1", toStopId: HOME });
  });
  it("mid-stay: from the Stop, destination unset", () => {
    expect(dayTransportDefaults("2026-11-05", stop, HOME)).toEqual({ fromStopId: "s1" });
  });
  it("arrive and depart on the same day prefers the outbound leg", () => {
    expect(dayTransportDefaults("2026-11-04", { ...stop, departDate: "2026-11-04" }, HOME)).toEqual({ fromStopId: HOME, toStopId: "s1" });
  });
  it("no Stop: both unset", () => {
    expect(dayTransportDefaults("2026-11-05", null, HOME)).toEqual({});
  });

  describe("changeover days (final review F3)", () => {
    const a = { id: "a", arriveDate: "2026-11-01", departDate: "2026-11-04", sortOrder: 0 };
    const b = { id: "s1", arriveDate: "2026-11-04", departDate: "2026-11-06", sortOrder: 1 };
    const c = { id: "c", arriveDate: "2026-11-06", departDate: "2026-11-09", sortOrder: 2 };
    const rough = { id: "r", arriveDate: null, departDate: null, sortOrder: 3 };
    // Passed out of order, with a rough Stop, to prove the scheduled ordering.
    const stops = [c, rough, b, a];

    it("arrive day with a previous Stop: the previous Stop to this one", () => {
      expect(dayTransportDefaults("2026-11-04", stop, HOME, stops)).toEqual({ fromStopId: "a", toStopId: "s1" });
    });
    it("depart day with a next Stop: this Stop to the next", () => {
      expect(dayTransportDefaults("2026-11-06", stop, HOME, stops)).toEqual({ fromStopId: "s1", toStopId: "c" });
    });
    it("the first Stop's arrive day with others after it: Home base to the Stop", () => {
      expect(dayTransportDefaults("2026-11-01", a, HOME, stops)).toEqual({ fromStopId: HOME, toStopId: "a" });
    });
    it("the last Stop's depart day: the Stop to Home base", () => {
      expect(dayTransportDefaults("2026-11-09", c, HOME, stops)).toEqual({ fromStopId: "c", toStopId: HOME });
    });
  });
});
