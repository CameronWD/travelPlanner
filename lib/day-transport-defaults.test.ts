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
});
