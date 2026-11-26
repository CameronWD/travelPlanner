import { describe, expect, it } from "vitest";
import { dayStartHop, wokeAt, type StartAccommodationRow } from "./day-start";
import { hopStopsById, toHopItem, type HopItem } from "./hops";

const stopsById = hopStopsById([{ id: "rome", timezone: "Europe/Rome", localTravelMode: null, lat: 41.9, lng: 12.5 }]);

const navona: StartAccommodationRow = { id: "navona", stopId: "rome", checkIn: "2027-01-02", checkOut: "2027-01-07", lat: 41.8977, lng: 12.4731 };

function thing(over: Partial<HopItem> & { id: string }): HopItem {
  return toHopItem({ date: "2027-01-03", startTime: "10:00", lat: 41.8986, lng: 12.4769, stopId: "rome", ...over });
}

function hop(over: { items?: HopItem[]; accommodations?: StartAccommodationRow[]; date?: string } = {}) {
  return dayStartHop({
    date: over.date ?? "2027-01-03",
    items: over.items ?? [thing({ id: "pantheon" })],
    accommodations: over.accommodations ?? [navona],
    stopsById,
    planTransports: [],
  });
}

describe("wokeAt", () => {
  it("wokeAt: a mid-stay day and the check-out day return the bed; the check-in day returns null", () => {
    expect(wokeAt([navona], "2027-01-03")?.id).toBe("navona");
    expect(wokeAt([navona], "2027-01-07")?.id).toBe("navona");
    expect(wokeAt([navona], "2027-01-02")).toBeNull();
  });

  it("wokeAt: two beds on one morning, the later check-in wins", () => {
    const later = { ...navona, id: "later", checkIn: "2027-01-03", checkOut: "2027-01-09" };
    expect(wokeAt([navona, later], "2027-01-04")?.id).toBe("later");
    expect(wokeAt([later, navona], "2027-01-04")?.id).toBe("later");
  });
});

describe("dayStartHop", () => {
  it("mid-stay day: a hop from the bed to the first located thing", () => {
    const h = hop();
    expect(h).toMatchObject({ accommodationId: "navona", toItemId: "pantheon", localMode: "TRANSIT" });
    expect(h?.from).toEqual({ lat: 41.8977, lng: 12.4731 });
    expect(h?.to).toEqual({ lat: 41.8986, lng: 12.4769 });
    expect(h?.departure?.toISOString()).toBe("2027-01-03T08:30:00.000Z");
  });

  it("an untimed first thing has no departure", () => {
    expect(hop({ items: [thing({ id: "pantheon", startTime: null })] })?.departure).toBeNull();
  });

  it("no hop on the arrival day", () => {
    expect(hop({ date: "2027-01-02", items: [thing({ id: "pantheon", date: "2027-01-02" })] })).toBeNull();
  });

  it("no hop when the bed has no coordinates", () => {
    expect(hop({ accommodations: [{ ...navona, lat: null, lng: null }] })).toBeNull();
  });

  it("no hop when the first thing belongs to another Stop", () => {
    expect(hop({ items: [thing({ id: "pantheon", stopId: "florence" })] })).toBeNull();
  });

  it("a first thing with no Stop still gets the hop", () => {
    expect(hop({ items: [thing({ id: "pantheon", stopId: null })] })?.toItemId).toBe("pantheon");
  });

  it("no hop when the bed and the thing are the same point", () => {
    expect(hop({ items: [thing({ id: "pantheon", lat: 41.8977, lng: 12.4731 })] })).toBeNull();
  });

  it("no hop on a day with no located thing", () => {
    expect(hop({ items: [thing({ id: "pantheon", lat: null, lng: null })] })).toBeNull();
    expect(hop({ items: [thing({ id: "pantheon", date: "2027-01-04" })] })).toBeNull();
  });

  it("the first thing is the earliest start, then sort order, never an unlocated one", () => {
    const items = [
      thing({ id: "late", startTime: "14:00" }),
      thing({ id: "unlocated", startTime: "07:00", lat: null, lng: null }),
      thing({ id: "b", startTime: "09:00", sortOrder: 2 }),
      thing({ id: "a", startTime: "09:00", sortOrder: 1 }),
    ];
    expect(hop({ items })?.toItemId).toBe("a");
  });
});
