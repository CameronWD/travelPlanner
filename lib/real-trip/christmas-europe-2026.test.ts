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

  // Golden data, transcribed independently from the booking confirmations in
  // task-3-brief.md (not copied out of the builder) — a second, separate
  // typing of the same source so the two are checked against each other, not
  // against themselves. This is what actually catches a transposed digit in a
  // cost, a mistyped PIN, or a currency slip; the structural checks above do
  // not, because they only compare the builder to its own sibling arrays.
  const GOLDEN_BEDS: {
    stopKey: string; name: string; checkIn: string; checkOut: string;
    confirmation: string; costMinor: number; currency: string;
  }[] = [
    { stopKey: "xmas26:stop:denpasar", name: "1 Bedroom private pool @Kuta", checkIn: "2026-12-04", checkOut: "2026-12-05", confirmation: "HM2EDZ4CB5", costMinor: 11520, currency: "AUD" },
    { stopKey: "xmas26:stop:munich", name: "B&B Hotel München-Hbf", checkIn: "2026-12-06", checkOut: "2026-12-10", confirmation: "5201106083", costMinor: 80609, currency: "AUD" },
    { stopKey: "xmas26:stop:strasbourg", name: "B&B Hotel Kehl", checkIn: "2026-12-10", checkOut: "2026-12-13", confirmation: "6031790255 PIN:4046", costMinor: 81000, currency: "AUD" },
    { stopKey: "xmas26:stop:frankfurt", name: "Premier Inn Frankfurt City Europaviertel", checkIn: "2026-12-13", checkOut: "2026-12-15", confirmation: "6925281379, PIN:8192", costMinor: 18700, currency: "AUD" },
    { stopKey: "xmas26:stop:paris", name: "Villa Margaux Opéra Montmartre", checkIn: "2026-12-15", checkOut: "2026-12-19", confirmation: "5887236633, PIN:7856", costMinor: 91652, currency: "AUD" },
    { stopKey: "xmas26:stop:london", name: "Zedwell Underground Hotel Tottenham Court Rd", checkIn: "2026-12-19", checkOut: "2026-12-22", confirmation: "5012646116, PIN:8416", costMinor: 54535, currency: "AUD" },
    { stopKey: "xmas26:stop:aghalee", name: "Clenaghans", checkIn: "2026-12-22", checkOut: "2026-12-29", confirmation: "HM855WTW9F", costMinor: 130417, currency: "AUD" },
    { stopKey: "xmas26:stop:dublin", name: "Point A Dublin The Liberties", checkIn: "2026-12-29", checkOut: "2026-12-30", confirmation: "HMKSN99TRQ", costMinor: 15642, currency: "AUD" },
    { stopKey: "xmas26:stop:como", name: "attico capicci", checkIn: "2026-12-30", checkOut: "2027-01-01", confirmation: "HMXAXCW8QE", costMinor: 116873, currency: "AUD" },
    { stopKey: "xmas26:stop:milan", name: "Ibis Milano Centro", checkIn: "2027-01-01", checkOut: "2027-01-02", confirmation: "5622902959, PIN:1094", costMinor: 16900, currency: "AUD" },
    { stopKey: "xmas26:stop:rome", name: "The Club Navona", checkIn: "2027-01-02", checkOut: "2027-01-07", confirmation: "6243212144 (PIN: 4820)", costMinor: 53610, currency: "EUR" },
  ];

  it("matches the golden booking data for every bed, value for value", () => {
    expect(t.accommodations).toHaveLength(GOLDEN_BEDS.length);
    const byStop = new Map(t.accommodations.map((a) => [a.stopKey, a]));
    for (const g of GOLDEN_BEDS) {
      const a = byStop.get(g.stopKey);
      expect(a, g.name).toBeTruthy();
      expect(a!.name, g.name).toBe(g.name);
      expect(a!.checkIn, g.name).toBe(g.checkIn);
      expect(a!.checkOut, g.name).toBe(g.checkOut);
      expect(a!.confirmation, g.name).toBe(g.confirmation);
      expect(a!.cost!.costMinor, g.name).toBe(g.costMinor);
      expect(a!.cost!.currency, g.name).toBe(g.currency);
    }
  });
});
