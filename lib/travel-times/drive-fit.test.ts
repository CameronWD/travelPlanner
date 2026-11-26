import { describe, expect, it } from "vitest";
import {
  driveFit,
  driveTimeOf,
  drivingMinutes,
  formDriveLine,
  planDriveLine,
  setArrivalLabel,
  type DriveTime,
} from "./drive-fit";

const real: DriveTime = { minutes: 72, roadKm: 95, estimated: false };
const dep = new Date("2026-12-04T23:00:00Z");
const arr = new Date("2026-12-05T00:00:00Z");

describe("drive-fit", () => {
  it("driveTimeOf keeps a real time's road distance and winds an estimate's", () => {
    expect(driveTimeOf({ minutes: 72.4, distanceKm: 95.2, mode: "drive", estimated: false, polyline: null }, 1.5)).toEqual(real);
    expect(driveTimeOf({ minutes: 71.6, distanceKm: 60, mode: "drive", estimated: true, polyline: null }, 1.5)).toEqual({ minutes: 72, roadKm: 90, estimated: true });
  });
  it("a cross-zone drive 09:00 Brisbane to 11:00 Sydney allows 60 minutes and is too short for 72", () => {
    expect(driveFit(real, dep, arr)).toEqual({ ...real, allowedMinutes: 60, tooShort: true, arriveAt: new Date("2026-12-05T00:12:00Z") });
  });
  it("an estimate is never too short", () => {
    expect(driveFit({ ...real, estimated: true }, dep, arr).tooShort).toBe(false);
  });
  it("times that allow the drive are not too short", () => {
    expect(driveFit(real, dep, new Date("2026-12-05T01:00:00Z")).tooShort).toBe(false);
  });
  it("no arrival, or an arrival not after departure, allows nothing and is not too short", () => {
    expect(driveFit(real, dep, null)).toMatchObject({ allowedMinutes: null, tooShort: false, arriveAt: new Date("2026-12-05T00:12:00Z") });
    expect(driveFit(real, dep, dep)).toMatchObject({ allowedMinutes: null, tooShort: false });
    expect(driveFit(real, null, null)).toMatchObject({ allowedMinutes: null, tooShort: false, arriveAt: null });
  });
  it("an unreadable departure suggests no arrival", () => {
    expect(driveFit(real, new Date(NaN), null).arriveAt).toBeNull();
  });
  it("a span exactly the road time is not too short", () => {
    expect(driveFit(real, dep, new Date(dep.getTime() + 72 * 60_000))).toMatchObject({ allowedMinutes: 72, tooShort: false });
  });
  it("drivingMinutes counts a real time shorter than the typed span, else the span", () => {
    const six = new Date("2026-12-05T05:00:00Z");
    expect(drivingMinutes({ minutes: 290, estimated: false }, dep, six)).toEqual({ minutes: 290, estimated: false });
    expect(drivingMinutes({ minutes: 290, estimated: true }, dep, six)).toEqual({ minutes: 360, estimated: false });
    expect(drivingMinutes({ minutes: 72, estimated: false }, dep, arr)).toEqual({ minutes: 60, estimated: false });
    expect(drivingMinutes({ minutes: 0, estimated: false }, dep, arr)).toEqual({ minutes: 60, estimated: false });
    expect(drivingMinutes({ minutes: 72, estimated: true }, null, null)).toEqual({ minutes: 72, estimated: true });
  });
  it("the Plan card line", () => {
    expect(planDriveLine(driveFit(real, dep, null))).toBe("95 km · about 1h 12m driving");
    expect(planDriveLine(driveFit({ ...real, estimated: true }, dep, null))).toBe("95 km · about 1h 12m driving (estimated)");
    expect(planDriveLine(driveFit(real, dep, arr))).toBe("95 km · about 1h 12m driving · longer than your times");
  });
  it("an estimated card line never says it is longer than the times", () => {
    expect(planDriveLine(driveFit({ ...real, estimated: true }, dep, arr))).toBe("95 km · about 1h 12m driving (estimated)");
  });
  it("thousands of kilometres are separated", () => {
    const long: DriveTime = { minutes: 860, roadKm: 1422, estimated: false };
    expect(planDriveLine(driveFit(long, dep, null))).toBe("1,422 km · about 14h 20m driving");
    expect(formDriveLine(driveFit(long, dep, null))).toBe("About 14h 20m · 1,422 km by road");
    expect(planDriveLine(driveFit(long, dep, arr))).toBe("1,422 km · about 14h 20m driving · longer than your times");
  });
  it("the form line", () => {
    expect(formDriveLine(driveFit(real, dep, null))).toBe("About 1h 12m · 95 km by road");
    expect(formDriveLine(driveFit({ ...real, estimated: true }, dep, arr))).toBe("About 1h 12m · 95 km by road (estimated)");
    expect(formDriveLine(driveFit(real, dep, arr))).toBe("About 1h 12m · 95 km by road. Your times allow 1h.");
  });
  it("the button names the arrival in its own zone, with the day when it is another day", () => {
    expect(setArrivalLabel(new Date("2026-12-05T00:12:00Z"), "Australia/Sydney", "2026-12-05")).toBe("Set arrival to 11:12");
    expect(setArrivalLabel(new Date("2026-12-05T14:42:00Z"), "Australia/Sydney", "2026-12-05")).toBe("Set arrival to Sun 6 Dec 01:42");
  });
});
