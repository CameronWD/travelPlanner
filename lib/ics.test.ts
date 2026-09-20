import { describe, expect, it } from "vitest";
import { buildICS, type IcsInput } from "./ics";

const GEN = new Date("2026-06-21T00:00:00Z");

const base: IcsInput = {
  tripName: "Europe 2026",
  stops: [{ id: "s-paris", name: "Paris", timezone: "Europe/Paris" }],
  items: [],
  transports: [],
  accommodations: [],
  generatedAt: GEN,
};

describe("buildICS", () => {
  it("emits a VCALENDAR envelope with CRLF line endings", () => {
    const ics = buildICS(base);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
  });

  it("emits a timed item as a UTC VEVENT in the stop timezone", () => {
    const ics = buildICS({
      ...base,
      items: [
        { id: "i1", title: "Louvre", category: "SIGHTSEEING", date: "2026-07-09", startTime: "10:00", endTime: "12:00", stopId: "s-paris", address: "Rue de Rivoli", link: null, booking: null, notes: null },
      ],
    });
    expect(ics).toContain("SUMMARY:Louvre");
    expect(ics).toContain("DTSTART:20260709T080000Z"); // 10:00 Paris = 08:00 UTC
    expect(ics).toContain("DTEND:20260709T100000Z");
    expect(ics).toContain("LOCATION:Rue de Rivoli");
    expect(ics).toContain("UID:item-i1@trip-planner");
  });

  it("emits an untimed item as an all-day event", () => {
    const ics = buildICS({
      ...base,
      items: [
        { id: "i2", title: "Colosseum", category: "SIGHTSEEING", date: "2026-07-10", startTime: null, endTime: null, stopId: null, address: null, link: null, booking: null, notes: null },
      ],
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260710");
    expect(ics).toContain("DTEND;VALUE=DATE:20260711"); // exclusive end = next day
  });

  it("emits transport as a UTC timed VEVENT with a route title", () => {
    const ics = buildICS({
      ...base,
      transports: [
        { id: "t1", mode: "FLIGHT", depPlace: "Paris", arrPlace: "Rome", depAt: new Date("2026-07-09T12:30:00Z"), arrAt: new Date("2026-07-09T14:40:00Z"), reference: "BA123" },
      ],
    });
    expect(ics).toContain("DTSTART:20260709T123000Z");
    expect(ics).toContain("DTEND:20260709T144000Z");
    expect(ics).toMatch(/SUMMARY:.*Paris . Rome.*BA123/);
  });

  it("emits accommodation as a multi-day all-day Stay block", () => {
    const ics = buildICS({
      ...base,
      accommodations: [
        { id: "a1", name: "Hotel Roma", checkIn: "2026-07-09", checkOut: "2026-07-12", address: "Via Roma 1", confirmation: "XYZ", notes: null },
      ],
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260709");
    expect(ics).toContain("DTEND;VALUE=DATE:20260712");
    expect(ics).toMatch(/SUMMARY:.*Stay.*Hotel Roma/);
  });

  it("escapes commas, semicolons and newlines in text", () => {
    const ics = buildICS({
      ...base,
      items: [
        { id: "i3", title: "Dinner, fancy; nice", category: "FOOD", date: "2026-07-09", startTime: null, endTime: null, stopId: null, address: null, link: null, booking: null, notes: "line1\nline2" },
      ],
    });
    expect(ics).toContain("SUMMARY:Dinner\\, fancy\\; nice");
    expect(ics).toContain("line1\\nline2");
  });
});

describe("alarms", () => {
  const base = {
    tripName: "Trip",
    stops: [{ id: "stop-1", name: "Vienna", timezone: "Europe/Vienna" }],
    items: [],
    transports: [],
    accommodations: [],
    generatedAt: new Date("2026-09-16T00:00:00Z"),
  };

  const flight = {
    id: "t1",
    mode: "FLIGHT",
    depPlace: "Sydney",
    arrPlace: "Vienna",
    depAt: new Date("2026-12-01T09:40:00Z"),
    arrAt: new Date("2026-12-01T21:40:00Z"),
  };
  const train = { ...flight, id: "t2", mode: "TRAIN" };

  it("emits no VALARM when alarms are not requested", () => {
    const ics = buildICS({ ...base, transports: [flight] });
    expect(ics).not.toContain("BEGIN:VALARM");
  });

  it("gives a flight a three-hour lead", () => {
    const ics = buildICS({
      ...base,
      transports: [flight],
      alarms: { transport: true, checkOut: false },
    });
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT180M");
    expect(ics).toContain("ACTION:DISPLAY");
  });

  it("gives other transport a two-hour lead", () => {
    const ics = buildICS({
      ...base,
      transports: [train],
      alarms: { transport: true, checkOut: false },
    });
    expect(ics).toContain("TRIGGER:-PT120M");
    expect(ics).not.toContain("TRIGGER:-PT180M");
  });

  it("emits a whole-number duration for a lead that is not whole hours", () => {
    // The guard the hour form did not have: `LEAD / 60` turns a 90-minute lead
    // into "-PT1.5H", which is not a valid RFC-5545 duration and which a
    // calendar app may drop silently — losing the Alarm rather than
    // mistiming it. Minutes cannot produce a fraction.
    const ics = buildICS({
      ...base,
      transports: [flight],
      alarms: { transport: true, checkOut: false },
    });
    const triggers = ics.match(/TRIGGER:-PT[^\r\n]*/g) ?? [];
    expect(triggers.length).toBeGreaterThan(0);
    for (const line of triggers) {
      expect(line).toMatch(/^TRIGGER:-PT\d+M$/);
    }
  });

  it("omits transport alarms when only check-out alarms are on", () => {
    const ics = buildICS({
      ...base,
      transports: [flight],
      alarms: { transport: false, checkOut: true },
    });
    expect(ics).not.toContain("BEGIN:VALARM");
  });

  it("triggers a check-out alarm at 08:00 in the stop's timezone", () => {
    const ics = buildICS({
      ...base,
      accommodations: [
        {
          id: "a1",
          name: "Hotel Sacher",
          checkIn: "2026-12-02",
          checkOut: "2026-12-05",
          checkOutTime: "10:00",
          stopId: "stop-1",
        },
      ],
      alarms: { transport: false, checkOut: true },
    });
    // Europe/Vienna is UTC+1 in December, so 08:00 local is 07:00Z.
    expect(ics).toContain("TRIGGER;VALUE=DATE-TIME:20261205T070000Z");
  });

  it("skips the check-out alarm (but still publishes the event) when the stay's stop has no timezone", () => {
    // A rough Stop (no arriveDate) never makes it into `stops`, so its
    // Accommodation's tz lookup misses. A UTC fallback here would fire the
    // alarm at a confidently wrong hour — 08:00Z lands mid-morning in Europe,
    // mid-afternoon in Australia — and TEEPEE can never tell whether an
    // Alarm fired to catch the mistake. No Alarm beats a wrong one; the
    // check-out itself must still be published.
    const ics = buildICS({
      ...base,
      stops: [],
      accommodations: [
        { id: "a1", name: "Hostel", checkIn: "2026-12-02", checkOut: "2026-12-05", stopId: "stop-gone" },
      ],
      alarms: { transport: false, checkOut: true },
    });
    expect(ics).not.toContain("BEGIN:VALARM");
    expect(ics).toContain("SUMMARY:🛏 Stay: Hostel");
  });

  it("names the check-out in the alarm description", () => {
    const ics = buildICS({
      ...base,
      accommodations: [
        { id: "a1", name: "Hotel Sacher", checkIn: "2026-12-02", checkOut: "2026-12-05", checkOutTime: "10:00", stopId: "stop-1" },
      ],
      alarms: { transport: false, checkOut: true },
    });
    expect(ics).toContain("DESCRIPTION:Check out of Hotel Sacher by 10:00");
  });

  it("keeps the alarm inside its own VEVENT", () => {
    const ics = buildICS({
      ...base,
      transports: [flight],
      alarms: { transport: true, checkOut: false },
    });
    const event = ics.slice(ics.indexOf("BEGIN:VEVENT"), ics.indexOf("END:VEVENT"));
    expect(event).toContain("BEGIN:VALARM");
    expect(event).toContain("END:VALARM");
  });
});
