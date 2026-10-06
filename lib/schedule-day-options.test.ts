import { describe, it, expect } from "vitest";
import {
  NEAR_STOP_KM,
  dayChipLabel,
  scheduleDayOptions,
  type DayOptionStop,
} from "./schedule-day-options";

/** Degrees of latitude spanning `km` along a meridian, on haversineKm's own sphere (R = 6371). */
const latForKm = (km: number) => (km / (2 * Math.PI * 6371)) * 360;

function stop(overrides: Partial<DayOptionStop> & { id: string }): DayOptionStop {
  return { name: overrides.id, lat: null, lng: null, arriveDate: null, departDate: null, ...overrides };
}

const ROME = stop({ id: "rome", name: "Rome", lat: 41.9, lng: 12.5, arriveDate: "2026-09-19", departDate: "2026-09-21" });
const NAPLES = stop({ id: "nap", name: "Naples", lat: 40.85, lng: 14.27, arriveDate: "2026-09-21", departDate: "2026-09-24" });
const TIVOLI = stop({ id: "tiv", name: "Tivoli", lat: 41.96, lng: 12.8, arriveDate: "2026-09-25", departDate: "2026-09-26" });
const ROME_AGAIN = stop({ id: "rome-2", name: "Rome", lat: 41.9, lng: 12.5, arriveDate: "2026-10-01", departDate: "2026-10-02" });
const FLORENCE_ROUGH = stop({ id: "flo", name: "Florence", lat: 43.77, lng: 11.25 });
const FIESOLE = stop({ id: "fie", name: "Fiesole", lat: 43.806, lng: 11.293, arriveDate: "2026-10-03", departDate: "2026-10-04" });

const ROME_DAYS = ["2026-09-19", "2026-09-20", "2026-09-21"];
const NAPLES_DAYS = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"];

describe("scheduleDayOptions (spec 2026-10-05 §E)", () => {
  it("is a 50 km radius", () => {
    expect(NEAR_STOP_KM).toBe(50);
  });

  it("offers a near Stop's days, arrive → depart inclusive (as the plan editor's day sections)", () => {
    const idea = { lat: 41.9 + latForKm(10), lng: 12.5 };
    expect(scheduleDayOptions(idea, [ROME, NAPLES])).toEqual({
      near: true,
      roughStop: null,
      stays: [{ stopId: "rome", stopName: "Rome", days: ROME_DAYS }],
    });
  });

  it("exactly 50 km counts as near; 50.5 km does not", () => {
    expect(scheduleDayOptions({ lat: 41.9 + latForKm(50), lng: 12.5 }, [ROME, NAPLES]).near).toBe(true);
    const past = scheduleDayOptions({ lat: 41.9 + latForKm(50.5), lng: 12.5 }, [ROME, NAPLES]);
    expect(past.near).toBe(false);
    expect(past.stays.map((s) => s.stopId)).toEqual(["rome", "nap"]);
  });

  it("an idea near two Stops offers both stays, in date order", () => {
    const between = { lat: 41.93, lng: 12.65 };
    const result = scheduleDayOptions(between, [TIVOLI, NAPLES, ROME]);
    expect(result.near).toBe(true);
    expect(result.stays.map((s) => s.stopId)).toEqual(["rome", "tiv"]);
  });

  it("the same city visited twice is two separate stays", () => {
    const result = scheduleDayOptions({ lat: 41.9, lng: 12.5 }, [ROME_AGAIN, ROME]);
    expect(result.stays).toEqual([
      { stopId: "rome", stopName: "Rome", days: ROME_DAYS },
      { stopId: "rome-2", stopName: "Rome", days: ["2026-10-01", "2026-10-02"] },
    ]);
  });

  it("nearest Stop rough → offers its things to do, and still the dated near stays", () => {
    const atFlorence = { lat: 43.77, lng: 11.25 };
    expect(scheduleDayOptions(atFlorence, [FLORENCE_ROUGH, FIESOLE, ROME])).toEqual({
      near: true,
      roughStop: { id: "flo", name: "Florence" },
      stays: [{ stopId: "fie", stopName: "Fiesole", days: ["2026-10-03", "2026-10-04"] }],
    });
  });

  it("only a rough Stop near → no chips, just the offer", () => {
    expect(scheduleDayOptions({ lat: 43.77, lng: 11.25 }, [FLORENCE_ROUGH, ROME])).toEqual({
      near: true,
      roughStop: { id: "flo", name: "Florence" },
      stays: [],
    });
  });

  it("a rough Stop that is near but not nearest is not offered", () => {
    const atFiesole = { lat: 43.806, lng: 11.293 };
    const result = scheduleDayOptions(atFiesole, [FLORENCE_ROUGH, FIESOLE]);
    expect(result.roughStop).toBeNull();
    expect(result.stays.map((s) => s.stopId)).toEqual(["fie"]);
  });

  it("no coordinates → every Trip day, grouped by Stop (rough Stops skipped), not near", () => {
    expect(scheduleDayOptions({ lat: null, lng: null }, [NAPLES, FLORENCE_ROUGH, ROME])).toEqual({
      near: false,
      roughStop: null,
      stays: [
        { stopId: "rome", stopName: "Rome", days: ROME_DAYS },
        { stopId: "nap", stopName: "Naples", days: NAPLES_DAYS },
      ],
    });
  });

  it("nothing within 50 km → every Trip day, not near", () => {
    const paris = { lat: 48.85, lng: 2.35 };
    const result = scheduleDayOptions(paris, [ROME, NAPLES]);
    expect(result.near).toBe(false);
    expect(result.roughStop).toBeNull();
    expect(result.stays.map((s) => s.stopId)).toEqual(["rome", "nap"]);
  });

  it("a Stop with no coordinates is never near", () => {
    const romeNoCoords = { ...ROME, lat: null, lng: null };
    expect(scheduleDayOptions({ lat: 41.9, lng: 12.5 }, [romeNoCoords]).near).toBe(false);
  });

  it("a Trip with no dated Stops offers nothing", () => {
    expect(scheduleDayOptions({ lat: 48.85, lng: 2.35 }, [FLORENCE_ROUGH])).toEqual({ near: false, roughStop: null, stays: [] });
    expect(scheduleDayOptions({}, [])).toEqual({ near: false, roughStop: null, stays: [] });
  });
});

describe("dayChipLabel", () => {
  it("is the weekday and day of month", () => {
    expect(dayChipLabel("2026-09-19")).toBe("Sat 19");
    expect(dayChipLabel("2026-10-01")).toBe("Thu 1");
  });
});
