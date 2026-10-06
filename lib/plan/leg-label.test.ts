import { describe, it, expect } from "vitest";
import { Car, Plane, Train } from "lucide-react";
import { changeoverPlaces, legLabel, legSlotKind, missingLegLabel, placeCode } from "./leg-label";

const PARIS = { id: "p", name: "Paris", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-15" };
const ROME = { id: "r", name: "Rome", timezone: "Europe/Rome", arriveDate: "2026-12-15", departDate: "2026-12-22" };
const FLORENCE = { id: "f", name: "Florence", timezone: "Europe/Rome", arriveDate: "2026-12-22", departDate: "2026-12-27" };
const MUNICH = { id: "m", name: "Munich", timezone: null, arriveDate: null, departDate: null };
const STOPS = [PARIS, ROME, FLORENCE, MUNICH];

describe("placeCode", () => {
  it("pulls a three-letter code out of a place, else keeps the place", () => {
    expect(placeCode("Paris CDG")).toBe("CDG");
    expect(placeCode("FCO")).toBe("FCO");
    expect(placeCode("Roma Termini")).toBe("Roma Termini");
  });
});

describe("legLabel", () => {
  it("timed: mode + codes, the departure day and time in the departure zone", () => {
    const l = legLabel(
      { mode: "FLIGHT", depPlace: "Paris CDG", arrPlace: "Rome FCO", depAt: new Date("2026-12-15T09:05:00Z"), arrAt: new Date("2026-12-15T11:10:00Z"), fromStopId: "p", toStopId: "r" },
      STOPS,
    );
    expect(l).toMatchObject({ icon: Plane, label: "Flight CDG → FCO", sub: "Tue 15 Dec 10:05", missing: false });
    expect(l.accessibleName).toBe("Flight from Paris to Rome, Tuesday 15 December 10:05. Edit.");
  });

  it("timed with no places: falls back to the stop names", () => {
    const l = legLabel(
      { mode: "TRAIN", depAt: new Date("2026-12-22T08:00:00Z"), arrAt: new Date("2026-12-22T09:40:00Z"), fromStopId: "r", toStopId: "f" },
      STOPS,
    );
    expect(l.label).toBe("Train Rome → Florence");
    expect(l.sub).toBe("Tue 22 Dec 09:00");
  });

  it("a car with no times reads Drive with the drive estimate", () => {
    const l = legLabel({ mode: "CAR", fromStopId: "r", toStopId: "f", driveEstimate: { minutes: 200, roadKm: 240 } }, STOPS);
    expect(l).toMatchObject({ icon: Car, label: "Drive", sub: "~3h 20m · 240 km" });
    expect(l.accessibleName).toBe("Drive from Rome to Florence, ~3h 20m · 240 km. Edit.");
  });

  it("a car with no times and no estimate falls back to the change-over date", () => {
    expect(legLabel({ mode: "CAR", fromStopId: "r", toStopId: "f" }, STOPS).sub).toBe("Tue 22 Dec");
  });

  it("not a car, no times: the mode and the date only", () => {
    const l = legLabel({ mode: "TRAIN", fromStopId: "r", toStopId: "f" }, STOPS);
    expect(l).toMatchObject({ icon: Train, label: "Train", sub: "Tue 22 Dec" });
    expect(l.accessibleName).toBe("Train from Rome to Florence, Tuesday 22 December. Edit.");
  });

  it("names the Home base for a home endpoint and dates it by the arriving stop", () => {
    const l = legLabel({ mode: "FLIGHT", depIsHome: true, toStopId: "p" }, STOPS, "Sydney");
    expect(l.sub).toBe("Thu 10 Dec");
    expect(l.accessibleName).toBe("Flight from Sydney to Paris, Thursday 10 December. Edit.");
  });

  it("no endpoints known: just the mode", () => {
    const l = legLabel({ mode: "BUS" }, STOPS);
    expect(l.label).toBe("Bus");
    expect(l.sub).toBe("");
    expect(l.accessibleName).toBe("Bus. Edit.");
  });
});

describe("missingLegLabel", () => {
  it("asks how you're getting to the next stop", () => {
    expect(missingLegLabel({ name: "Rome" }, { name: "Florence" })).toEqual({
      icon: null,
      label: "How are you getting to Florence?",
      sub: "Add",
      missing: true,
      accessibleName: "Add transport from Rome to Florence",
    });
  });
});

describe("legSlotKind", () => {
  it("legs when any exist, missing between two dated stops, a bare line otherwise", () => {
    expect(legSlotKind(PARIS, ROME, 1)).toBe("legs");
    expect(legSlotKind(PARIS, ROME, 0)).toBe("missing");
    expect(legSlotKind(FLORENCE, MUNICH, 0)).toBe("line");
    expect(legSlotKind(MUNICH, MUNICH, 2)).toBe("legs");
  });
});

describe("changeoverPlaces (spec 2026-10-05 §F)", () => {
  it("names the place where one leg arrives and the next departs", () => {
    expect(
      changeoverPlaces([
        { depPlace: "Paris Gare de Lyon", arrPlace: "Milano Centrale" },
        { depPlace: "Milano Centrale", arrPlace: "Roma Termini" },
      ]),
    ).toEqual([null, "Milano Centrale"]);
  });

  it("matches trimmed and case-insensitively, showing the arriving leg's spelling", () => {
    expect(changeoverPlaces([{ arrPlace: " Milano Centrale " }, { depPlace: "milano centrale" }])).toEqual([null, "Milano Centrale"]);
  });

  it("three legs: each change-over sits with the leg that leaves from it", () => {
    expect(
      changeoverPlaces([
        { arrPlace: "Milano Centrale" },
        { depPlace: "Milano Centrale", arrPlace: "Bologna" },
        { depPlace: "Bologna" },
      ]),
    ).toEqual([null, "Milano Centrale", "Bologna"]);
  });

  it("unknown or mismatched places show nothing", () => {
    expect(changeoverPlaces([{ arrPlace: "Milano Centrale" }, { depPlace: "Milano Rogoredo" }])).toEqual([null, null]);
    expect(changeoverPlaces([{ arrPlace: null }, { depPlace: null }])).toEqual([null, null]);
    expect(changeoverPlaces([{ arrPlace: "Milano Centrale" }, {}])).toEqual([null, null]);
    expect(changeoverPlaces([{ arrPlace: "  " }, { depPlace: "  " }])).toEqual([null, null]);
  });

  it("a single leg or none has no change-over", () => {
    expect(changeoverPlaces([{ depPlace: "CDG", arrPlace: "FCO" }])).toEqual([null]);
    expect(changeoverPlaces([])).toEqual([]);
  });
});
