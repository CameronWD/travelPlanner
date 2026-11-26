import { describe, it, expect } from "vitest";
import { Car, Plane, Train } from "lucide-react";
import { legLabel, legSlotKind, missingLegLabel, placeCode } from "./leg-label";

const PARIS = { id: "p", name: "Paris", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-15" };
const ROME = { id: "r", name: "Rome", timezone: "Europe/Rome", arriveDate: "2026-12-15", departDate: "2026-12-22" };
const FLORENCE = { id: "f", name: "Florence", timezone: "Europe/Rome", arriveDate: "2026-12-22", departDate: "2026-12-27" };
const MUNICH = { id: "m", name: "Munich", timezone: null, arriveDate: null, departDate: null };
const BNE = { id: "bne", name: "Brisbane", timezone: "Australia/Brisbane", arriveDate: "2026-12-01", departDate: "2026-12-05" };
const TWD = { id: "twd", name: "Tweed Heads", timezone: "Australia/Sydney", arriveDate: "2026-12-05", departDate: "2026-12-08" };
const STOPS = [PARIS, ROME, FLORENCE, MUNICH, BNE, TWD];

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
    expect(l.accessibleName).toBe("Flight from Paris to Rome, Tuesday 15 December 10:05. Arrives 12:10. Edit.");
  });

  it("timed with no places: falls back to the stop names", () => {
    const l = legLabel(
      { mode: "TRAIN", depAt: new Date("2026-12-22T08:00:00Z"), arrAt: new Date("2026-12-22T09:40:00Z"), fromStopId: "r", toStopId: "f" },
      STOPS,
    );
    expect(l.label).toBe("Train Rome → Florence");
    expect(l.sub).toBe("Tue 22 Dec 09:00");
  });

  describe("a leg within one region names it once", () => {
    const drive = (depPlace: string, arrPlace: string) =>
      legLabel({ mode: "CAR", depPlace, arrPlace, depAt: new Date("2026-12-15T09:00:00Z"), fromStopId: "p", toStopId: "r" }, STOPS);

    it("the same name at both ends", () => {
      const l = drive("Northvale", "Northvale");
      expect(l.label).toBe("Drive in Northvale");
      expect(l.accessibleName).toContain("Drive from Paris to Rome");
      expect(legLabel({ mode: "CAR", depPlace: "Northvale", arrPlace: "northvale", depAt: new Date("2026-12-15T09:00:00Z") }, STOPS).accessibleName).toBe("Drive in Northvale, Tuesday 15 December 09:00. Edit.");
    });
    it("a town in brackets beside its region", () => {
      expect(drive("Northvale", "Eastby (Northvale)").label).toBe("Drive Northvale → Eastby");
    });
    it("two places that end in the same region", () => {
      expect(drive("Westby, Northvale", "Eastby, Northvale").label).toBe("Drive Westby → Eastby");
    });
    it("never collapses places whose short name is a three-capital code", () => {
      const l = drive("Springfield, Illinois, USA", "St Louis, Missouri, USA");
      expect(l.label).toBe("Drive USA → USA");
      expect(l.accessibleName).toContain("from Paris to Rome");
      const named = legLabel({ mode: "CAR", depPlace: "Springfield, Illinois, USA", arrPlace: "St Louis, Missouri, USA", depAt: new Date("2026-12-15T09:00:00Z") }, STOPS);
      expect(named.accessibleName).toBe("Drive from Springfield, Illinois, USA to St Louis, Missouri, USA, Tuesday 15 December 09:00. Edit.");
    });
    it("leaves other places alone", () => {
      expect(drive("Westby, Northvale", "Eastby, Southmoor").label).toBe("Drive Westby, Northvale → Eastby, Southmoor");
      expect(legLabel({ mode: "TRAIN", depPlace: "ABC", arrPlace: "XYZ", depAt: new Date("2026-12-15T09:00:00Z") }, STOPS).label).toBe("Train ABC → XYZ");
    });
  });

  it("a car with no times reads Drive with the drive estimate", () => {
    const l = legLabel({ mode: "CAR", fromStopId: "r", toStopId: "f", driveEstimate: { minutes: 200, roadKm: 240, estimated: true } }, STOPS);
    expect(l).toMatchObject({ icon: Car, label: "Drive", sub: "~3h 20m · 240 km (estimated)" });
    expect(l.accessibleName).toBe("Drive from Rome to Florence, ~3h 20m · 240 km (estimated). Edit.");
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

  it("a Home departure with a Trip homeTimezone shows the time in that zone", () => {
    const DPS = { id: "dps", name: "Bali", timezone: "Asia/Makassar", arriveDate: "2026-12-04", departDate: null };
    const l = legLabel(
      { mode: "FLIGHT", depIsHome: true, toStopId: "dps", depAt: new Date("2026-12-04T07:50:00Z") },
      [DPS],
      "Gold Coast",
      "Australia/Brisbane",
    );
    expect(l.sub).toMatch(/17:50$/);
  });

  it("no endpoints known: just the mode", () => {
    const l = legLabel({ mode: "BUS" }, STOPS);
    expect(l.label).toBe("Bus");
    expect(l.sub).toBe("");
    expect(l.accessibleName).toBe("Bus. Edit.");
  });
});

describe("legLabel at a place with its own zone", () => {
  const DPS = { id: "dps", name: "Denpasar", timezone: "Asia/Makassar", arriveDate: "2026-12-01", departDate: "2026-12-05" };
  const toBangkok = { mode: "FLIGHT" as const, fromStopId: "dps", arrPlace: "Bangkok (BKK)", depAt: new Date("2026-12-05T11:00:00Z"), arrAt: new Date("2026-12-05T15:15:00Z") };

  it("a leg to a place with its own zone shows the arrival in that zone", () => {
    const l = legLabel({ ...toBangkok, arrTimezone: "Asia/Bangkok" }, [DPS]);
    expect(l.sub).toBe("Sat 5 Dec 19:00");
    expect(l.arrival).toBe("→ 22:15 · 4h 15m");
  });

  it("a leg with no stored zone reads exactly as before", () => {
    const l = legLabel({ ...toBangkok, arrTimezone: null }, [DPS]);
    expect(l.sub).toBe("Sat 5 Dec 19:00");
    expect(l.arrival).toBe("→ 23:15 · 4h 15m");
  });
});

describe("legLabel arrival and detail", () => {
  const train = { mode: "TRAIN" as const, fromStopId: "r", toStopId: "f", depAt: new Date("2026-12-22T08:28:00Z"), arrAt: new Date("2026-12-22T12:05:00Z") };
  const flight = (arrAt: string) => ({ mode: "FLIGHT" as const, fromStopId: "p", toStopId: "r", depAt: new Date("2026-12-15T22:00:00Z"), arrAt: new Date(arrAt) });

  it("a same-day train gives the arrival time and the duration", () => {
    expect(legLabel(train, STOPS).arrival).toBe("→ 13:05 · 3h 37m");
  });
  it("an arrival on a later local day gets +N", () => {
    const next = legLabel(flight("2026-12-16T01:00:00Z"), STOPS).arrival;
    expect(next.startsWith("→ ")).toBe(true);
    expect(next).toContain(" +1 · ");
    expect(legLabel(flight("2026-12-17T01:00:00Z"), STOPS).arrival).toContain(" +2 · ");
  });
  it("an arrival on an earlier local day gets a signed minus", () => {
    const AUCKLAND = { id: "a", name: "Auckland", timezone: "Pacific/Auckland", arriveDate: null, departDate: null };
    const HONOLULU = { id: "h", name: "Honolulu", timezone: "Pacific/Honolulu", arriveDate: null, departDate: null };
    const t = { mode: "FLIGHT" as const, fromStopId: "a", toStopId: "h", depAt: new Date("2026-12-15T12:00:00Z"), arrAt: new Date("2026-12-15T22:00:00Z") };
    const l = legLabel(t, [AUCKLAND, HONOLULU]);
    expect(l.arrival).toContain(" −1 · ");
    expect(l.accessibleName).toContain(" Arrives 12:00 −1.");
  });
  it("the day difference is local-date, not UTC-date", () => {
    const HONOLULU = { id: "h", name: "Honolulu", timezone: "Pacific/Honolulu", arriveDate: null, departDate: null };
    const AUCKLAND = { id: "a", name: "Auckland", timezone: "Pacific/Auckland", arriveDate: null, departDate: null };
    const t = { mode: "FLIGHT" as const, fromStopId: "h", toStopId: "a", depAt: new Date("2026-12-15T10:00:00Z"), arrAt: new Date("2026-12-15T20:00:00Z") };
    expect(legLabel(t, [HONOLULU, AUCKLAND]).arrival).toContain(" +1 · ");
    expect(legLabel({ ...t, depAt: new Date("2026-12-15T09:00:00Z") }, [HONOLULU, AUCKLAND]).arrival).toContain(" +2 · ");
  });
  it("the accessible name speaks the arrival and the detail", () => {
    const l = legLabel({ ...train, serviceNumber: "ICE 9572", seat: "42" }, STOPS);
    expect(l.accessibleName).toBe("Train from Rome to Florence, Tuesday 22 December 09:28. Arrives 13:05. ICE 9572 · Seat 42. Edit.");
  });
  it("no arrival time, no arrival line", () => {
    expect(legLabel({ ...train, arrAt: null }, STOPS).arrival).toBe("");
  });
  it("an arrival that is not after the departure leaves the duration off", () => {
    expect(legLabel({ ...train, arrAt: train.depAt }, STOPS).arrival).toBe("→ 09:28");
  });
  it("detail joins the Travel details and the reference", () => {
    expect(legLabel({ ...train, serviceNumber: "ICE 9572", coach: "7", seat: "42", reference: "QX7P2M" }, STOPS).detail).toBe("ICE 9572 · Coach 7 · Seat 42 · QX7P2M");
    expect(legLabel({ ...train, reference: " QX7P2M " }, STOPS).detail).toBe("QX7P2M");
    expect(legLabel(train, STOPS).detail).toBe("");
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
      arrival: "",
      detail: "",
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

describe("legLabel drive line", () => {
  const drive = { mode: "CAR", fromStopId: "bne", toStopId: "twd", depAt: new Date("2026-12-04T23:00:00Z"), arrAt: new Date("2026-12-05T00:00:00Z"), driveTime: { minutes: 72, roadKm: 95, estimated: false } } as const;
  it("a timed drive keeps its times and gains the drive line, short when the times allow less", () => {
    const l = legLabel(drive, STOPS);
    expect(l.arrival).toBe("→ 11:00 · 1h");
    expect(l.drive).toEqual({ text: "95 km · about 1h 12m driving", tooShort: true });
    expect(l.accessibleName).toContain("95 km · about 1h 12m driving.");
  });
  it("an estimated drive line is never short", () => {
    expect(legLabel({ ...drive, driveTime: { ...drive.driveTime, estimated: true } }, STOPS).drive).toEqual({ text: "95 km · about 1h 12m driving (estimated)", tooShort: false });
  });
  it("times that allow the drive are not short", () => {
    expect(legLabel({ ...drive, arrAt: new Date("2026-12-05T01:00:00Z") }, STOPS).drive?.tooShort).toBe(false);
  });
  it("a drive with a departure but no arrival shows the line and never the warning", () => {
    expect(legLabel({ ...drive, arrAt: null }, STOPS).drive).toEqual({ text: "95 km · about 1h 12m driving", tooShort: false });
  });
  it("a drive with no times reads exactly as before and has no drive line", () => {
    const l = legLabel({ mode: "CAR", fromStopId: "bne", toStopId: "twd", driveTime: drive.driveTime, driveEstimate: drive.driveTime }, STOPS);
    expect(l.sub).toBe("1h 12m · 95 km");
    expect(l.drive).toBeUndefined();
  });
  it("a timed train has no drive line", () => {
    expect(legLabel({ ...drive, mode: "TRAIN" }, STOPS).drive).toBeUndefined();
  });
});
