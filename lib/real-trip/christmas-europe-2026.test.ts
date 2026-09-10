import { describe, it, expect } from "vitest";
import { buildChristmasEurope2026 } from "./christmas-europe-2026";

const t = buildChristmasEurope2026();
const ordered = [...t.stops].sort((a, b) => a.sortOrder - b.sortOrder);
const SK_DUBLIN = "xmas26:stop:dublin";

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

describe("accommodations", () => {
  it("gives every stop exactly one bed", () => {
    expect(t.accommodations).toHaveLength(11);
    const byStop = new Map(t.accommodations.map((a) => [a.stopKey, a]));
    expect(byStop.size).toBe(11);
    for (const s of t.stops) expect(byStop.has(s.key), s.name).toBe(true);
  });

  it("matches each bed's dates to its stop's dates exactly", () => {
    const stopByKey = new Map(t.stops.map((s) => [s.key, s]));
    for (const a of t.accommodations) {
      const s = stopByKey.get(a.stopKey)!;
      expect(a.checkIn, a.name).toBe(s.arriveDate);
      expect(a.checkOut, a.name).toBe(s.departDate);
    }
  });

  it("carries an address, a confirmation and a real cost on every bed", () => {
    for (const a of t.accommodations) {
      expect(a.address, a.name).toBeTruthy();
      expect(a.confirmation, a.name).toBeTruthy();
      expect(a.cost, a.name).toBeTruthy();
      expect(a.cost!.costMinor, a.name).toBeGreaterThan(0);
    }
  });

  it("records the Dublin bed as paid on the day it was charged", () => {
    const dublin = t.accommodations.find((a) => a.stopKey.endsWith("dublin"))!;
    expect(dublin.name).toBe("Point A Dublin The Liberties");
    expect(dublin.cost).toMatchObject({
      costMinor: 15642, paidMinor: 15642, currency: "AUD", paid: true, paidAt: "2026-08-11",
    });
  });

  it("prices Rome in euro and leaves it unpaid — it is cash on arrival", () => {
    const rome = t.accommodations.find((a) => a.stopKey.endsWith("rome"))!;
    expect(rome.cost).toMatchObject({ costMinor: 53610, currency: "EUR" });
    expect(rome.cost!.paid ?? false).toBe(false);
  });

  it("leaves every other bed unpaid", () => {
    const paid = t.accommodations.filter((a) => a.cost?.paid);
    expect(paid.map((a) => a.stopKey)).toEqual([SK_DUBLIN]);
  });
});
