import { describe, it, expect } from "vitest";
import { buildChristmasEurope2026 } from "./christmas-europe-2026";

const t = buildChristmasEurope2026();
const ordered = [...t.stops].sort((a, b) => a.sortOrder - b.sortOrder);

describe("envelope", () => {
  it("is the real trip under Cam's home base", () => {
    expect(t.name).toBe("Christmas in Europe 2026");
    expect(t.startDate).toBe("2026-12-04");
    expect(t.endDate).toBe("2027-01-08");
    expect(t.hardEndDate ?? null).toBeNull();
    expect(t.homeCurrency).toBe("AUD");
    expect(t.roundTrip).toBe(true);
    expect(t.home).toEqual({
      name: "Gold Coast", lat: -28.0023731, lng: 153.4145987, countryCode: "au",
    });
  });

  it("has chapters switched off — no chapter rows at all", () => {
    expect(t.chapters).toHaveLength(0);
  });
});

describe("stops", () => {
  it("has 11 fully-dated stops with unique sort order", () => {
    expect(t.stops).toHaveLength(11);
    expect(new Set(t.stops.map((s) => s.sortOrder)).size).toBe(11);
    expect(new Set(t.stops.map((s) => s.key)).size).toBe(11);
  });

  it("gives every stop a date range, timezone, country and point", () => {
    for (const s of t.stops) {
      expect(s.arriveDate, s.name).toBeTruthy();
      expect(s.departDate, s.name).toBeTruthy();
      expect(s.timezone, s.name).toBeTruthy();
      expect(s.timezone, s.name).not.toBe("UTC");
      expect(s.countryCode, s.name).toBe(s.countryCode?.toLowerCase());
      expect(typeof s.lat, s.name).toBe("number");
      expect(typeof s.lng, s.name).toBe("number");
    }
  });

  it("runs strictly forward with no gap and no overlap between consecutive stops", () => {
    for (let i = 0; i < ordered.length - 1; i++) {
      const here = ordered[i];
      const next = ordered[i + 1];
      expect(here.departDate! > here.arriveDate!, here.name).toBe(true);
      // Denpasar → Munich is the one intentional break: an overnight flight via
      // Bangkok, so the night of the 5th is spent in the air, not in a bed.
      const expected = here.key.endsWith("denpasar") ? "2026-12-06" : here.departDate;
      expect(next.arriveDate, `${here.name} → ${next.name}`).toBe(expected);
    }
  });

  it("declares nights matching the date span", () => {
    const DAY = 86_400_000;
    for (const s of ordered) {
      const span = (Date.parse(s.departDate!) - Date.parse(s.arriveDate!)) / DAY;
      expect(s.nights, s.name).toBe(span);
    }
  });

  it("starts and ends inside the trip envelope", () => {
    expect(ordered[0].arriveDate).toBe(t.startDate);
    expect(ordered[ordered.length - 1].departDate! <= t.endDate!).toBe(true);
  });

  it("spends 33 nights in beds across the trip", () => {
    expect(ordered.reduce((n, s) => n + (s.nights ?? 0), 0)).toBe(33);
  });

  it("visits the expected route in order", () => {
    expect(ordered.map((s) => s.name)).toEqual([
      "Denpasar", "Munich", "Strasbourg", "Frankfurt", "Paris", "London",
      "Aghalee", "Dublin", "Como", "Milan", "Rome",
    ]);
  });
});
