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
  stop("dub", "Dublin", "Europe/Dublin", "2026-12-26", "2026-12-30", 5),
  stop("com", "Como", "Europe/Rome", "2026-12-30", "2027-01-02", 6),
  stop("rom", "Rome", "Europe/Rome", "2027-01-03", "2027-01-07", 7),
];

const leg = (over: Partial<NowNextTransport> & Pick<NowNextTransport, "id">): NowNextTransport => ({
  mode: "FLIGHT", fromStopId: null, toStopId: null, depPlace: null, arrPlace: null,
  depAt: null, arrAt: null, depIsHome: false, arrIsHome: false, ...over,
});

// 4 Dec 07:50 in Brisbane is 21:50Z on the 3rd; 7 Jan 07:55 in Rome is 06:55Z; 8 Jan 07:30 in Brisbane is 21:30Z on the 7th.
const HOME_TO_DPS = leg({ id: "home-dps", depIsHome: true, toStopId: "dps", depAt: new Date("2026-12-03T21:50:00Z"), arrAt: new Date("2026-12-04T04:50:00Z") });
// 5 Dec 11:00 in Denpasar is 03:00Z; it lands in Munich at 04:45Z on the 6th.
const DPS_TO_MUC = leg({ id: "dps-muc", fromStopId: "dps", toStopId: "muc", depAt: new Date("2026-12-05T03:00:00Z"), arrAt: new Date("2026-12-06T04:45:00Z") });
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
      arrivesName: "Strasbourg",
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

  it("with the departure exactly 24 hours away, is not within a day", () => {
    expect(nowNext(input(), new Date("2026-12-18T06:02:00Z"))).toMatchObject({ kind: "next-departure", transportId: "par-lon", withinDay: false });
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

  it("names an in-transit leg's arrival by its point when it has no Stop", () => {
    const flight = leg({ id: "dub-mxp", fromStopId: "dub", arrPlace: "Milan Malpensa", depAt: new Date("2026-12-30T10:00:00Z"), arrAt: new Date("2026-12-30T13:30:00Z") });
    const open = leg({ id: "x", fromStopId: "dub", depAt: new Date("2026-12-30T10:00:00Z"), arrAt: new Date("2026-12-30T13:30:00Z") });
    const at = new Date("2026-12-30T12:00:00Z");
    expect(nowNext(input({ transports: [flight] }), at)).toMatchObject({ kind: "in-transit", arrivesName: "Milan Malpensa" });
    expect(nowNext(input({ transports: [open] }), at)).toMatchObject({ kind: "in-transit", arrivesName: null });
  });

  it("on the overnight Rome to Home leg at 23:00 on the 7th (Brisbane), is in transit", () => {
    expect(nowNext(input(), new Date("2027-01-07T13:00:00Z"))).toEqual({
      kind: "in-transit",
      transportId: "rom-home",
      mode: "FLIGHT",
      routeLabel: "Rome to Gold Coast",
      arrivesName: "Gold Coast",
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

  it("on a Changeover day, is null while the train is moving and the arriving Stop once it arrives", () => {
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2026-12-19T07:00:00Z"))).toBeNull();
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2026-12-19T09:00:00Z"))).toEqual({ stopId: "lon", name: "London" });
  });

  it("leaves Denpasar when its 11:00 flight departs and names Munich only once it lands", () => {
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2026-12-05T02:00:00Z"))).toEqual({ stopId: "dps", name: "Denpasar" });
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2026-12-05T03:00:00Z"))).toBeNull();
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2026-12-05T15:00:00Z"))).toBeNull();
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2026-12-05T23:30:00Z"))).toBeNull();
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2026-12-06T05:00:00Z"))).toEqual({ stopId: "muc", name: "Munich" });
  });

  it("names the arriving Stop from the landing, even before its arrive date starts there", () => {
    const early = { ...DPS_TO_MUC, arrAt: new Date("2026-12-05T21:00:00Z") };
    expect(whereYouAre(STOPS, [early], new Date("2026-12-05T21:30:00Z"))).toEqual({ stopId: "muc", name: "Munich" });
  });

  it("is null at Home before the first leg and after the last", () => {
    // 05:00 on 4 Dec in Brisbane, before the 07:50 flight; then mid-flight.
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2026-12-03T19:00:00Z"))).toBeNull();
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2026-12-04T02:00:00Z"))).toBeNull();
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2026-12-04T06:00:00Z"))).toEqual({ stopId: "dps", name: "Denpasar" });
    expect(whereYouAre(STOPS, ALL_LEGS, new Date("2027-01-07T07:00:00Z"))).toBeNull();
  });

  it("on a two-leg Changeover day, is the same whichever order the legs come in", () => {
    // 30 Dec: Dublin 10:00 flight to Milan Malpensa (lands 13:30Z), then a 14:00Z bus to Como (arrives 15:30Z).
    const flight = leg({ id: "dub-mxp", fromStopId: "dub", arrPlace: "Milan Malpensa", depAt: new Date("2026-12-30T10:00:00Z"), arrAt: new Date("2026-12-30T13:30:00Z") });
    const bus = leg({ id: "mxp-com", mode: "BUS", depPlace: "Milan Malpensa", toStopId: "com", depAt: new Date("2026-12-30T14:00:00Z"), arrAt: new Date("2026-12-30T15:30:00Z") });
    for (const legs of [[flight, bus], [bus, flight]]) {
      expect(whereYouAre(STOPS, legs, new Date("2026-12-30T09:00:00Z"))).toEqual({ stopId: "dub", name: "Dublin" });
      expect(whereYouAre(STOPS, legs, new Date("2026-12-30T13:45:00Z"))).toBeNull();
      expect(whereYouAre(STOPS, legs, new Date("2026-12-30T16:00:00Z"))).toEqual({ stopId: "com", name: "Como" });
    }
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
