import { describe, it, expect } from "vitest";
import {
  bookingPartners,
  changeLabel,
  changeLabels,
  isConnection,
  journeyHome,
  journeyOut,
  meetingPlace,
  sameBooking,
  waitMinutes,
  type ConnectionLeg,
} from "./connections";

const a: ConnectionLeg = {
  id: "a", mode: "FLIGHT", depPlace: "Denpasar", arrPlace: "Bangkok (BKK)",
  depAt: new Date("2026-12-05T11:00:00Z"), arrAt: new Date("2026-12-05T15:15:00Z"),
  fromStopId: "dps", toStopId: null, reference: "DHZU24",
};
const b: ConnectionLeg = {
  id: "b", mode: "FLIGHT", depPlace: "bangkok (bkk) ", arrPlace: "Munich",
  depAt: new Date("2026-12-05T17:50:00Z"), arrAt: new Date("2026-12-06T01:00:00Z"),
  fromStopId: null, toStopId: "muc", reference: "dhzu24 ",
};

describe("meetingPlace", () => {
  it("names equal ignoring case and spaces", () => {
    expect(meetingPlace(a, b)).toBe("Bangkok (BKK)");
  });
  it("the same place id when the names differ", () => {
    expect(meetingPlace(
      { ...a, arrPlace: "Doha", arrPlaceId: "p1" },
      { ...b, depPlace: "Hamad International", depPlaceId: "p1" },
    )).toBe("Doha");
  });
  it("null when neither matches", () => {
    expect(meetingPlace(a, { ...b, depPlace: "Singapore" })).toBeNull();
  });
  it("null when a name is empty", () => {
    expect(meetingPlace({ ...a, arrPlace: " " }, { ...b, depPlace: "" })).toBeNull();
  });
});

describe("isConnection", () => {
  it("a place nobody stays at", () => {
    expect(isConnection(a, b)).toBe(true);
  });
  it("false when a arrives at a Stop", () => {
    expect(isConnection({ ...a, toStopId: "x" }, b)).toBe(false);
  });
  it("false when b departs Home", () => {
    expect(isConnection(a, { ...b, depIsHome: true })).toBe(false);
  });
  it("false when the places differ", () => {
    expect(isConnection(a, { ...b, depPlace: "Singapore" })).toBe(false);
  });
});

describe("waitMinutes", () => {
  it("whole minutes between arrival and departure", () => {
    expect(waitMinutes(a, b)).toBe(155);
  });
  it("null with a missing time", () => {
    expect(waitMinutes({ ...a, arrAt: null }, b)).toBeNull();
  });
  it("null when b leaves before a arrives", () => {
    expect(waitMinutes(a, { ...b, depAt: new Date("2026-12-05T14:00:00Z") })).toBeNull();
  });
  it("null at exactly 24 hours", () => {
    expect(waitMinutes(a, { ...b, depAt: new Date("2026-12-06T15:15:00Z") })).toBeNull();
  });
});

describe("changeLabel", () => {
  it("a flight pair is a layover with the wait", () => {
    expect(changeLabel(a, b)).toBe("Layover in Bangkok · 2h 35m");
  });
  it("a train pair is a change", () => {
    const t1: ConnectionLeg = { id: "t1", mode: "TRAIN", arrPlace: "Lyon Part-Dieu", arrAt: new Date("2026-12-05T10:00:00Z") };
    const t2: ConnectionLeg = { id: "t2", mode: "TRAIN", depPlace: "Lyon Part-Dieu", depAt: new Date("2026-12-05T10:12:00Z") };
    expect(changeLabel(t1, t2)).toBe("Change at Lyon Part-Dieu · 12m");
  });
  it("a flight and a train is a change", () => {
    expect(changeLabel(a, { ...b, mode: "TRAIN" })).toBe("Change at Bangkok · 2h 35m");
  });
  it("no times, no wait", () => {
    expect(changeLabel({ ...a, arrAt: null }, { ...b, depAt: null })).toBe("Layover in Bangkok");
  });
  it("two legs meeting at a Stop still get a label", () => {
    expect(changeLabel({ ...a, toStopId: "x" }, b)).toBe("Layover in Bangkok · 2h 35m");
  });
  it("null when they do not meet", () => {
    expect(changeLabel(a, { ...b, depPlace: "Singapore" })).toBeNull();
  });
});

describe("changeLabels", () => {
  it("the line above each leg", () => {
    expect(changeLabels([a, b])).toEqual([null, "Layover in Bangkok · 2h 35m"]);
  });
  it("null for unrelated legs", () => {
    expect(changeLabels([a, { ...b, depPlace: "Singapore" }])).toEqual([null, null]);
  });
});

describe("sameBooking", () => {
  it("true for one booking", () => {
    expect(sameBooking(a, b)).toBe(true);
  });
  it("false with different references", () => {
    expect(sameBooking(a, { ...b, reference: "ZZZ" })).toBe(false);
  });
  it("false when either reference is blank", () => {
    expect(sameBooking({ ...a, reference: " " }, { ...b, reference: " " })).toBe(false);
    expect(sameBooking(a, { ...b, reference: null })).toBe(false);
  });
  it("false for the same reference at different places", () => {
    expect(sameBooking(a, { ...b, depPlace: "Singapore" })).toBe(false);
  });
});

describe("bookingPartners", () => {
  const l1: ConnectionLeg = { id: "l1", mode: "FLIGHT", arrPlace: "Doha", depAt: new Date("2026-12-05T01:00:00Z"), reference: "X1" };
  const l2: ConnectionLeg = { id: "l2", mode: "FLIGHT", depPlace: "Doha", arrPlace: "Rome", depAt: new Date("2026-12-05T05:00:00Z"), reference: "x1" };
  const l3: ConnectionLeg = { id: "l3", mode: "FLIGHT", depPlace: "Rome", depAt: new Date("2026-12-05T09:00:00Z"), reference: "X1" };

  it("each leg maps to the other two in travel order, whatever the input order", () => {
    const m = bookingPartners([l3, l1, l2]);
    expect(m.get("l1")?.map((l) => l.id)).toEqual(["l2", "l3"]);
    expect(m.get("l2")?.map((l) => l.id)).toEqual(["l1", "l3"]);
    expect(m.get("l3")?.map((l) => l.id)).toEqual(["l1", "l2"]);
  });
  it("a lone leg has no partners", () => {
    expect(bookingPartners([a]).get("a") ?? []).toEqual([]);
  });
});

describe("journeyHome", () => {
  const first: ConnectionLeg = { id: "r1", mode: "FLIGHT", fromStopId: "rome", toStopId: null, arrPlace: "Doha", depAt: new Date("2026-12-10T08:00:00Z"), arrAt: new Date("2026-12-10T14:00:00Z") };
  const second: ConnectionLeg = { id: "r2", mode: "FLIGHT", fromStopId: null, depPlace: "Doha", arrPlace: "Brisbane", arrIsHome: true, depAt: new Date("2026-12-10T17:00:00Z"), arrAt: new Date("2026-12-11T10:00:00Z") };
  it("chains the legs home in order", () => {
    expect(journeyHome([second, first], "rome").map((l) => l.id)).toEqual(["r1", "r2"]);
  });
  it("one leg straight home is that leg", () => {
    const direct: ConnectionLeg = { id: "d", mode: "FLIGHT", fromStopId: "rome", arrIsHome: true };
    expect(journeyHome([direct], "rome")).toEqual([direct]);
  });
  it("nothing leaves the last Stop", () => {
    expect(journeyHome([second], "rome")).toEqual([]);
  });
  it("does not take a later unrelated leg when an earlier one fits", () => {
    const later: ConnectionLeg = { ...second, id: "r3", depAt: new Date("2026-12-17T17:00:00Z"), arrAt: new Date("2026-12-18T10:00:00Z") };
    expect(journeyHome([later, first, second], "rome").map((l) => l.id)).toEqual(["r1", "r2"]);
  });
});

describe("journeyOut", () => {
  const out1: ConnectionLeg = { id: "o1", mode: "FLIGHT", depIsHome: true, arrPlace: "Singapore", depAt: new Date("2026-12-01T01:00:00Z"), arrAt: new Date("2026-12-01T08:00:00Z") };
  const out2: ConnectionLeg = { id: "o2", mode: "FLIGHT", depPlace: "Singapore", toStopId: "first", depAt: new Date("2026-12-01T10:00:00Z"), arrAt: new Date("2026-12-01T12:00:00Z") };
  it("chains the legs out in order", () => {
    expect(journeyOut([out2, out1], "first").map((l) => l.id)).toEqual(["o1", "o2"]);
  });
  it("nothing reaches the first Stop", () => {
    expect(journeyOut([out1], "first")).toEqual([]);
  });
});
