import { describe, expect, it } from "vitest";
import { nowNext, whereYouAre, type NowNextInput, type NowNextStop, type NowNextTransport, type NowNextTimed } from "./now-next";

const stop = (id: string, name: string, timezone: string, arriveDate: string, departDate: string, sortOrder: number): NowNextStop => ({
  id, name, timezone, arriveDate, departDate, sortOrder,
});

const STOPS: NowNextStop[] = [
  stop("dps", "Denpasar", "Asia/Makassar", "2026-12-04", "2026-12-05", 0),
  stop("muc", "Munich", "Europe/Berlin", "2026-12-06", "2026-12-10", 1),
  stop("sxb", "Strasbourg", "Europe/Paris", "2026-12-10", "2026-12-13", 2),
  stop("par", "Paris", "Europe/Paris", "2026-12-15", "2026-12-19", 3),
  stop("lon", "London", "Europe/London", "2026-12-19", "2026-12-23", 4),
  stop("rom", "Rome", "Europe/Rome", "2027-01-03", "2027-01-07", 5),
];

const leg = (over: Partial<NowNextTransport> & Pick<NowNextTransport, "id">): NowNextTransport => ({
  mode: "FLIGHT", fromStopId: null, toStopId: null, depPlace: null, arrPlace: null,
  depAt: null, arrAt: null, depIsHome: false, arrIsHome: false, ...over,
});

// 4 Dec 07:50 in Brisbane is 21:50Z on the 3rd; 7 Jan 07:55 in Rome is 06:55Z; 8 Jan 07:30 in Brisbane is 21:30Z on the 7th.
const HOME_TO_DPS = leg({ id: "home-dps", depIsHome: true, toStopId: "dps", depAt: new Date("2026-12-03T21:50:00Z"), arrAt: new Date("2026-12-04T04:50:00Z") });
const DPS_TO_MUC = leg({ id: "dps-muc", fromStopId: "dps", toStopId: "muc", depAt: new Date("2026-12-05T13:00:00Z"), arrAt: new Date("2026-12-06T06:00:00Z") });
const MUC_TO_SXB = leg({ id: "muc-sxb", mode: "CAR", fromStopId: "muc", toStopId: "sxb", depAt: new Date("2026-12-10T07:30:00Z"), arrAt: new Date("2026-12-10T15:00:00Z") });
// 19 Dec 07:02 in Paris is 06:02Z.
const PAR_TO_LON = leg({ id: "par-lon", mode: "TRAIN", fromStopId: "par", toStopId: "lon", depAt: new Date("2026-12-19T06:02:00Z"), arrAt: new Date("2026-12-19T08:30:00Z") });
const ROM_TO_HOME = leg({ id: "rom-home", fromStopId: "rom", arrIsHome: true, depAt: new Date("2027-01-07T06:55:00Z"), arrAt: new Date("2027-01-07T21:30:00Z") });
const ALL_LEGS = [HOME_TO_DPS, DPS_TO_MUC, MUC_TO_SXB, PAR_TO_LON, ROM_TO_HOME];

const HOME = { name: "Gold Coast", timezone: "Australia/Brisbane" };

const input = (over: Partial<NowNextInput> = {}): NowNextInput => ({
  stops: STOPS, transports: ALL_LEGS, todays: [], home: HOME, ...over,
});

const LOUVRE: NowNextTimed = {
  type: "item", id: "louvre", title: "Louvre", date: "2026-12-16", time: "10:00", stopId: "par",
  place: { lat: 48.86, lng: 2.34 }, address: "Rue de Rivoli, Paris",
};

describe("nowNext", () => {
  it("during a 08:30 to 16:00 drive, is that leg in transit with its arrival", () => {
    expect(nowNext(input(), new Date("2026-12-10T12:00:00Z"))).toEqual({
      kind: "in-transit",
      transportId: "muc-sxb",
      mode: "CAR",
      routeLabel: "Munich to Strasbourg",
      arrivesAt: "2026-12-10T15:00:00.000Z",
      arrivesZone: "Europe/Paris",
    });
  });

  it("before a 10:00 timed Item today, is that Item", () => {
    expect(nowNext(input({ todays: [LOUVRE] }), new Date("2026-12-16T07:00:00Z"))).toEqual({
      kind: "next-thing",
      target: { type: "item", id: "louvre" },
      title: "Louvre",
      startsAt: "2026-12-16T09:00:00.000Z",
      zone: "Europe/Paris",
      place: { lat: 48.86, lng: 2.34 },
      address: "Rue de Rivoli, Paris",
    });
  });

  it("after today's last timed Item has started, moves on to the next departure", () => {
    expect(nowNext(input({ todays: [LOUVRE] }), new Date("2026-12-16T09:30:00Z"))).toMatchObject({ kind: "next-departure", transportId: "par-lon" });
  });

  it("a timed Accommodation check-in is a next thing too", () => {
    const checkIn: NowNextTimed = {
      type: "accommodation", id: "acc-lon", title: "Check-in: The Hoxton", date: "2026-12-19", time: "15:00", stopId: "lon",
      place: null, address: "81 Great Eastern St",
    };
    expect(nowNext(input({ todays: [checkIn] }), new Date("2026-12-19T10:00:00Z"))).toMatchObject({
      kind: "next-thing", target: { type: "accommodation", id: "acc-lon" }, startsAt: "2026-12-19T15:00:00.000Z", zone: "Europe/London",
    });
  });

  it("with today empty and the departure 74 hours away, is the next departure, not within a day", () => {
    expect(nowNext(input(), new Date("2026-12-16T04:02:00Z"))).toEqual({
      kind: "next-departure",
      transportId: "par-lon",
      mode: "TRAIN",
      routeLabel: "Paris to London",
      departsAt: "2026-12-19T06:02:00.000Z",
      departsZone: "Europe/Paris",
      withinDay: false,
    });
  });

  it("with the departure 5 hours away, is within a day", () => {
    expect(nowNext(input(), new Date("2026-12-19T01:02:00Z"))).toMatchObject({ kind: "next-departure", transportId: "par-lon", withinDay: true });
  });

  it("shows a departure that leaves before today's next timed Item, not the Item after it", () => {
    const lunch: NowNextTimed = { type: "item", id: "lunch", title: "Borough Market", date: "2026-12-19", time: "14:00", stopId: "lon", place: null, address: null };
    expect(nowNext(input({ todays: [lunch] }), new Date("2026-12-19T05:00:00Z"))).toMatchObject({ kind: "next-departure", transportId: "par-lon" });
  });

  it("shows a timed Item that starts before the departure", () => {
    const breakfast: NowNextTimed = { type: "item", id: "cafe", title: "Breakfast", date: "2026-12-19", time: "06:15", stopId: "par", place: null, address: null };
    expect(nowNext(input({ todays: [breakfast] }), new Date("2026-12-19T04:30:00Z"))).toMatchObject({ kind: "next-thing", target: { id: "cafe" } });
  });

  it("with no Transport left, is nothing", () => {
    expect(nowNext(input(), new Date("2027-01-08T00:00:00Z"))).toEqual({ kind: "nothing" });
  });

  it("skips a Transport with no departure time", () => {
    const untimed = leg({ id: "sxb-fra", mode: "TRAIN", fromStopId: "sxb", depAt: null, arrAt: new Date("2026-12-13T12:00:00Z") });
    const next = nowNext(input({ transports: [untimed, PAR_TO_LON] }), new Date("2026-12-13T10:00:00Z"));
    expect(next).toMatchObject({ kind: "next-departure", transportId: "par-lon" });
  });

  it("labels a leg from Home with the Home base name", () => {
    expect(nowNext(input(), new Date("2026-12-03T12:00:00Z"))).toEqual({
      kind: "next-departure",
      transportId: "home-dps",
      mode: "FLIGHT",
      routeLabel: "Gold Coast to Denpasar",
      departsAt: "2026-12-03T21:50:00.000Z",
      departsZone: "Australia/Brisbane",
      withinDay: true,
    });
  });

  it("labels an end with no Stop by its departure or arrival point", () => {
    const transfer = leg({ id: "com-mxp", mode: "BUS", fromStopId: "sxb", arrPlace: "Milan Malpensa", depAt: new Date("2026-12-12T08:00:00Z") });
    expect(nowNext(input({ transports: [transfer] }), new Date("2026-12-12T07:00:00Z"))).toMatchObject({ routeLabel: "Strasbourg to Milan Malpensa" });
  });

  it("on the overnight Rome to Home leg at 23:00 on the 7th (Brisbane), is in transit", () => {
    expect(nowNext(input(), new Date("2027-01-07T13:00:00Z"))).toEqual({
      kind: "in-transit",
      transportId: "rom-home",
      mode: "FLIGHT",
      routeLabel: "Rome to Gold Coast",
      arrivesAt: "2027-01-07T21:30:00.000Z",
      arrivesZone: "Australia/Brisbane",
    });
  });
});

describe("whereYouAre", () => {
  it("names the Stop whose stay covers now", () => {
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2026-12-16T12:00:00Z"))).toEqual({ stopId: "par", name: "Paris" });
  });

  it("on a Changeover day before the 07:02 departure, is the Stop being left", () => {
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2026-12-19T05:30:00Z"))).toEqual({ stopId: "par", name: "Paris" });
  });

  it("on a Changeover day after the departure, is the arriving Stop", () => {
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2026-12-19T07:00:00Z"))).toEqual({ stopId: "lon", name: "London" });
  });

  it("on a Changeover day whose leg has no time, is the Stop being left until noon there", () => {
    const untimed = { ...PAR_TO_LON, depAt: null };
    expect(whereYouAre(STOPS, [untimed], new Date("2026-12-19T10:30:00Z"))).toEqual({ stopId: "par", name: "Paris" });
    expect(whereYouAre(STOPS, [untimed], new Date("2026-12-19T11:30:00Z"))).toEqual({ stopId: "lon", name: "London" });
  });

  it("on a Changeover day with no leg at all, also turns at noon in the Stop being left", () => {
    expect(whereYouAre(STOPS, [], new Date("2026-12-19T10:30:00Z"))).toEqual({ stopId: "par", name: "Paris" });
    expect(whereYouAre(STOPS, [], new Date("2026-12-19T11:30:00Z"))).toEqual({ stopId: "lon", name: "London" });
  });

  it("is null when no Stop's stay covers now", () => {
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2026-12-14T12:00:00Z"))).toBeNull();
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2027-01-08T12:00:00Z"))).toBeNull();
  });
});
