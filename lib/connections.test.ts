import { describe, it, expect } from "vitest";
import {
  bookingPartners,
  changeLabel,
  changeLabels,
  isConnection,
  journeyBetween,
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

describe("isConnection with times", () => {
  it("not when the second leaves a day or more after the first arrives", () => {
    expect(isConnection(a, { ...b, depAt: new Date("2026-12-06T15:15:00Z") })).toBe(false);
  });
  it("not when the second leaves before the first arrives", () => {
    expect(isConnection(a, { ...b, depAt: new Date("2026-12-05T14:00:00Z") })).toBe(false);
  });
  it("still a Connection when a time is missing", () => {
    expect(isConnection({ ...a, arrAt: null }, b)).toBe(true);
    expect(isConnection(a, { ...b, depAt: null })).toBe(true);
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
  it("leaves a bracket that is not the last group alone", () => {
    const x = { ...a, arrPlace: "St Pancras (London) International" };
    expect(changeLabel(x, { ...b, depPlace: "St Pancras (London) International" })).toBe("Layover in St Pancras (London) International · 2h 35m");
  });
  it("leaves a name with no brackets alone", () => {
    expect(changeLabel({ ...a, arrPlace: "Doha" }, { ...b, depPlace: "Doha" })).toBe("Layover in Doha · 2h 35m");
  });
  it("falls back to the raw text when only a bracket would remain", () => {
    expect(changeLabel({ ...a, arrPlace: "(BKK)" }, { ...b, depPlace: "(BKK)" })).toBe("Layover in (BKK) · 2h 35m");
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
  it("a middle leg with no departure time does not split its booking", () => {
    const mid = { ...l2, depAt: null };
    const m = bookingPartners([l3, mid, l1]);
    expect(m.get("l1")?.map((l) => l.id)).toEqual(["l3", "l2"]);
    expect(m.get("l2")?.map((l) => l.id)).toEqual(["l1", "l3"]);
    expect(m.get("l3")?.map((l) => l.id)).toEqual(["l1", "l2"]);
  });
  it("two legs that connect into each other are still one booking", () => {
    const x: ConnectionLeg = { id: "x", mode: "FLIGHT", depPlace: "Doha", arrPlace: "Rome", reference: "R" };
    const y: ConnectionLeg = { id: "y", mode: "FLIGHT", depPlace: "Rome", arrPlace: "Doha", reference: "R" };
    const m = bookingPartners([x, y]);
    expect(m.get("x")?.map((l) => l.id)).toEqual(["y"]);
    expect(m.get("y")?.map((l) => l.id)).toEqual(["x"]);
  });
  it("two legs into the same next leg are one booking of three", () => {
    const x: ConnectionLeg = { id: "x", mode: "FLIGHT", depPlace: "A", arrPlace: "P", reference: "R" };
    const y: ConnectionLeg = { id: "y", mode: "FLIGHT", depPlace: "B", arrPlace: "P", reference: "R" };
    const z: ConnectionLeg = { id: "z", mode: "FLIGHT", depPlace: "P", arrPlace: "C", reference: "R" };
    const m = bookingPartners([z, y, x]);
    expect(m.get("x")?.map((l) => l.id)).toEqual(["y", "z"]);
    expect(m.get("y")?.map((l) => l.id)).toEqual(["x", "z"]);
    expect(m.get("z")?.map((l) => l.id)).toEqual(["x", "y"]);
  });
  it("an unrelated leg departing between two legs of a booking does not split it", () => {
    const other: ConnectionLeg = { id: "o", mode: "TRAIN", depPlace: "Oslo", arrPlace: "Bergen", depAt: new Date("2026-12-05T03:00:00Z"), reference: "ZZ" };
    const m = bookingPartners([l1, other, l2, l3]);
    expect(m.get("l1")?.map((l) => l.id)).toEqual(["l2", "l3"]);
    expect(m.get("o") ?? []).toEqual([]);
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

describe("journeyHome a week later", () => {
  it("a leg from the same place a week later is not chained even when nothing earlier fits", () => {
    const first: ConnectionLeg = { id: "r1", mode: "FLIGHT", fromStopId: "rome", arrPlace: "Doha", arrAt: new Date("2026-12-10T14:00:00Z") };
    const late: ConnectionLeg = { id: "r3", mode: "FLIGHT", depPlace: "Doha", arrIsHome: true, depAt: new Date("2026-12-17T17:00:00Z") };
    expect(journeyHome([first, late], "rome").map((l) => l.id)).toEqual(["r1"]);
  });
});

describe("journeyOut", () => {
  it("picks the latest arrival at or before the next departure", () => {
    const o1: ConnectionLeg = { id: "o1", mode: "FLIGHT", depIsHome: true, arrPlace: "Singapore", arrAt: new Date("2026-12-01T08:00:00Z") };
    const o0: ConnectionLeg = { id: "o0", mode: "FLIGHT", depIsHome: true, arrPlace: "Singapore", arrAt: new Date("2026-12-01T05:00:00Z") };
    const o2: ConnectionLeg = { id: "o2", mode: "FLIGHT", depPlace: "Singapore", toStopId: "first", depAt: new Date("2026-12-01T10:00:00Z") };
    expect(journeyOut([o0, o2, o1], "first").map((l) => l.id)).toEqual(["o1", "o2"]);
  });
  const out1: ConnectionLeg = { id: "o1", mode: "FLIGHT", depIsHome: true, arrPlace: "Singapore", depAt: new Date("2026-12-01T01:00:00Z"), arrAt: new Date("2026-12-01T08:00:00Z") };
  const out2: ConnectionLeg = { id: "o2", mode: "FLIGHT", depPlace: "Singapore", toStopId: "first", depAt: new Date("2026-12-01T10:00:00Z"), arrAt: new Date("2026-12-01T12:00:00Z") };
  it("chains the legs out in order", () => {
    expect(journeyOut([out2, out1], "first").map((l) => l.id)).toEqual(["o1", "o2"]);
  });
  it("nothing reaches the first Stop", () => {
    expect(journeyOut([out1], "first")).toEqual([]);
  });
});

describe("one hub both ways, with no times", () => {
  const homeDoha: ConnectionLeg = { id: "o1", mode: "FLIGHT", depIsHome: true, depPlace: "Brisbane", arrPlace: "Doha" };
  const dohaParis: ConnectionLeg = { id: "o2", mode: "FLIGHT", depPlace: "Doha", arrPlace: "Paris", toStopId: "par" };
  const romeDoha: ConnectionLeg = { id: "r1", mode: "FLIGHT", fromStopId: "rom", depPlace: "Rome", arrPlace: "Doha" };
  const dohaHome: ConnectionLeg = { id: "r2", mode: "FLIGHT", depPlace: "Doha", arrPlace: "Brisbane", arrIsHome: true };

  it.each([
    ["in plan order", [homeDoha, dohaParis, romeDoha, dohaHome]],
    ["reversed", [dohaHome, romeDoha, dohaParis, homeDoha]],
  ])("an undated round trip through one hub keeps the journeys apart (%s)", (_, legs) => {
    expect(journeyOut(legs, "par").map((l) => l.id)).toEqual(["o1", "o2"]);
    expect(journeyHome(legs, "rom").map((l) => l.id)).toEqual(["r1", "r2"]);
  });

  it("journeyOut's order does not depend on input order when times are missing", () => {
    const fromSydney: ConnectionLeg = { id: "o9", mode: "FLIGHT", depPlace: "Sydney", arrPlace: "Doha" };
    expect(journeyOut([fromSydney, homeDoha, dohaParis], "par").map((l) => l.id)).toEqual(["o1", "o2"]);
    expect(journeyOut([homeDoha, fromSydney, dohaParis], "par").map((l) => l.id)).toEqual(["o1", "o2"]);
  });
});

describe("journeyBetween", () => {
  const parisMilan: ConnectionLeg = { id: "b1", mode: "TRAIN", fromStopId: "par", depPlace: "Paris", arrPlace: "Milano Centrale" };
  const milanRome: ConnectionLeg = { id: "b2", mode: "TRAIN", depPlace: "Milano Centrale", arrPlace: "Rome", toStopId: "rom" };

  it("the two legs in order, from one Stop through a hub to the next", () => {
    expect(journeyBetween([milanRome, parisMilan], "par", "rom").map((l) => l.id)).toEqual(["b1", "b2"]);
  });
  it("nothing when the chain starts at a different Stop", () => {
    expect(journeyBetween([{ ...parisMilan, fromStopId: "lyo" }, milanRome], "par", "rom")).toEqual([]);
  });
  it("nothing when the chain starts at Home", () => {
    expect(journeyBetween([{ ...parisMilan, fromStopId: null, depIsHome: true }, milanRome], "par", "rom")).toEqual([]);
  });
  it("nothing for a direct leg alone", () => {
    expect(journeyBetween([{ ...parisMilan, toStopId: "rom", arrPlace: "Rome" }], "par", "rom")).toEqual([]);
  });
  it("nothing when no leg arrives at the next Stop", () => {
    expect(journeyBetween([parisMilan, { ...milanRome, toStopId: null }], "par", "rom")).toEqual([]);
  });
});
