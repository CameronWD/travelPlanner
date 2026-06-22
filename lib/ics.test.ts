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
