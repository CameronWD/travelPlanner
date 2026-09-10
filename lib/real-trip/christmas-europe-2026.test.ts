import { describe, it, expect } from "vitest";
import { buildChristmasEurope2026, summariseRealTrip } from "./christmas-europe-2026";
import { hasOutboundLeg, hasReturnLeg } from "@/lib/home-base";
import { TRANSPORT_MODES } from "@/lib/enums";

const t = buildChristmasEurope2026();
const ordered = [...t.stops].sort((a, b) => a.sortOrder - b.sortOrder);
const SK_DUBLIN = "xmas26:stop:dublin";
const SK_COMO = "xmas26:stop:como";

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

describe("transports", () => {
  it("has 13 legs with unique keys, valid modes and real stop references", () => {
    expect(t.transports).toHaveLength(13);
    expect(new Set(t.transports.map((x) => x.key)).size).toBe(13);
    expect(new Set(t.transports.map((x) => x.sortOrder)).size).toBe(13);
    const stopKeys = new Set(t.stops.map((s) => s.key));
    for (const tr of t.transports) {
      expect(TRANSPORT_MODES, tr.key).toContain(tr.mode);
      if (tr.fromStopKey) expect(stopKeys.has(tr.fromStopKey), tr.key).toBe(true);
      if (tr.toStopKey) expect(stopKeys.has(tr.toStopKey), tr.key).toBe(true);
    }
  });

  it("closes the round trip from and back to the home base", () => {
    const legs = t.transports.map((x) => ({
      depIsHome: x.depIsHome, arrIsHome: x.arrIsHome,
      toStopId: x.toStopKey ?? null, fromStopId: x.fromStopKey ?? null,
    }));
    expect(hasOutboundLeg(legs, ordered[0].key)).toBe(true);
    expect(hasReturnLeg(legs, ordered[ordered.length - 1].key)).toBe(true);
  });

  it("connects every consecutive pair of stops", () => {
    for (let i = 0; i < ordered.length - 1; i++) {
      const leg = t.transports.find(
        (x) => x.fromStopKey === ordered[i].key && x.toStopKey === ordered[i + 1].key,
      );
      expect(leg, `${ordered[i].name} → ${ordered[i + 1].name}`).toBeTruthy();
    }
  });

  it("keeps the Malpensa transfer as between-legs travel", () => {
    const hop = t.transports.find((x) => x.key === "xmas26:tr:mxp-como")!;
    expect(hop.fromStopKey ?? null).toBeNull();
    expect(hop.toStopKey).toBe(SK_COMO);
    expect(hop.depPlace).toBe("Milan Malpensa (MXP)");
  });

  it("lands the Bangkok overnight in Munich on the 6th", () => {
    const leg = t.transports.find((x) => x.reference === "DHZU24")!;
    expect(leg.depAt).toBe("2026-12-05T19:00:00Z");
    expect(leg.arrAt).toBe("2026-12-06T06:45:00Z");
  });

  it("never lets a leg arrive before it departs", () => {
    for (const tr of t.transports) {
      if (tr.depAt && tr.arrAt) expect(tr.arrAt > tr.depAt, tr.key).toBe(true);
    }
  });

  it("leaves exactly the six unbooked legs without times or references", () => {
    const unbooked = t.transports.filter((x) => !x.depAt);
    expect(unbooked.map((x) => x.key).sort()).toEqual([
      "xmas26:tr:aghalee-dublin", "xmas26:tr:como-milan", "xmas26:tr:frankfurt-paris",
      "xmas26:tr:milan-rome", "xmas26:tr:mxp-como", "xmas26:tr:strasbourg-frankfurt",
    ]);
    for (const x of unbooked) {
      expect(x.arrAt ?? null, x.key).toBeNull();
      expect(x.cost ?? null, x.key).toBeNull();
    }
  });

  // Golden data, transcribed independently from the booking confirmations in
  // task-4-brief.md (not copied out of the builder) — a second, separate
  // typing of the same source so the two are checked against each other, not
  // against themselves. This is what actually catches a transposed digit in a
  // departure instant, a mistyped reference, or a place-name slip; the
  // structural checks above do not, because they only compare the builder to
  // its own sibling arrays.
  const GOLDEN_TRANSPORTS: {
    key: string; mode: string; fromStopKey: string | null; toStopKey: string | null;
    depPlace: string | null; depAt: string | null; arrPlace: string | null; arrAt: string | null;
    reference: string | null; costMinor?: number; currency?: string;
  }[] = [
    { key: "xmas26:tr:home-denpasar", mode: "FLIGHT", fromStopKey: null, toStopKey: "xmas26:stop:denpasar", depPlace: "Gold Coast (OOL)", depAt: "2026-12-04T17:50:00Z", arrPlace: "Denpasar (DPS)", arrAt: "2026-12-04T22:15:00Z", reference: "WNIQHG", costMinor: 89559, currency: "AUD" },
    { key: "xmas26:tr:denpasar-munich", mode: "FLIGHT", fromStopKey: "xmas26:stop:denpasar", toStopKey: "xmas26:stop:munich", depPlace: "Denpasar (DPS)", depAt: "2026-12-05T19:00:00Z", arrPlace: "Munich (MUC)", arrAt: "2026-12-06T06:45:00Z", reference: "DHZU24", costMinor: 163569, currency: "AUD" },
    { key: "xmas26:tr:munich-strasbourg", mode: "TRAIN", fromStopKey: "xmas26:stop:munich", toStopKey: "xmas26:stop:strasbourg", depPlace: "Munich Hbf", depAt: "2026-12-10T06:51:00Z", arrPlace: "Strasbourg", arrAt: "2026-12-10T10:40:00Z", reference: "300186503818", costMinor: 23521, currency: "AUD" },
    { key: "xmas26:tr:strasbourg-frankfurt", mode: "TRAIN", fromStopKey: "xmas26:stop:strasbourg", toStopKey: "xmas26:stop:frankfurt", depPlace: null, depAt: null, arrPlace: null, arrAt: null, reference: null },
    { key: "xmas26:tr:frankfurt-paris", mode: "TRAIN", fromStopKey: "xmas26:stop:frankfurt", toStopKey: "xmas26:stop:paris", depPlace: null, depAt: null, arrPlace: null, arrAt: null, reference: null },
    { key: "xmas26:tr:paris-london", mode: "TRAIN", fromStopKey: "xmas26:stop:paris", toStopKey: "xmas26:stop:london", depPlace: "Paris Gare du Nord", depAt: "2026-12-19T08:02:00Z", arrPlace: "London St Pancras", arrAt: "2026-12-19T09:30:00Z", reference: "WXFVKQ", costMinor: 41438, currency: "AUD" },
    { key: "xmas26:tr:london-aghalee", mode: "FLIGHT", fromStopKey: "xmas26:stop:london", toStopKey: "xmas26:stop:aghalee", depPlace: "London Heathrow (LHR)", depAt: "2026-12-22T09:15:00Z", arrPlace: "Belfast City (BHD)", arrAt: "2026-12-22T10:40:00Z", reference: "XHARUZ" },
    { key: "xmas26:tr:aghalee-dublin", mode: "TRAIN", fromStopKey: "xmas26:stop:aghalee", toStopKey: "xmas26:stop:dublin", depPlace: null, depAt: null, arrPlace: null, arrAt: null, reference: null },
    { key: "xmas26:tr:dublin-como", mode: "FLIGHT", fromStopKey: "xmas26:stop:dublin", toStopKey: "xmas26:stop:como", depPlace: "Dublin (DUB)", depAt: "2026-12-30T08:15:00Z", arrPlace: "Milan Malpensa (MXP)", arrAt: "2026-12-30T11:45:00Z", reference: "FR7799 · H4WP7Q", costMinor: 35862, currency: "EUR" },
    { key: "xmas26:tr:mxp-como", mode: "TRAIN", fromStopKey: null, toStopKey: "xmas26:stop:como", depPlace: "Milan Malpensa (MXP)", depAt: null, arrPlace: "Como", arrAt: null, reference: null },
    { key: "xmas26:tr:como-milan", mode: "TRAIN", fromStopKey: "xmas26:stop:como", toStopKey: "xmas26:stop:milan", depPlace: null, depAt: null, arrPlace: null, arrAt: null, reference: null },
    { key: "xmas26:tr:milan-rome", mode: "TRAIN", fromStopKey: "xmas26:stop:milan", toStopKey: "xmas26:stop:rome", depPlace: null, depAt: null, arrPlace: null, arrAt: null, reference: null },
    { key: "xmas26:tr:rome-home", mode: "FLIGHT", fromStopKey: "xmas26:stop:rome", toStopKey: null, depPlace: "Rome (FCO)", depAt: "2027-01-07T08:55:00Z", arrPlace: "Brisbane (BNE)", arrAt: "2027-01-08T17:30:00Z", reference: "8QPEWK" },
  ];

  it("matches the golden leg data for every transport, value for value", () => {
    expect(t.transports).toHaveLength(GOLDEN_TRANSPORTS.length);
    const byKey = new Map(t.transports.map((x) => [x.key, x]));
    for (const g of GOLDEN_TRANSPORTS) {
      const x = byKey.get(g.key);
      expect(x, g.key).toBeTruthy();
      expect(x!.mode, g.key).toBe(g.mode);
      expect(x!.fromStopKey ?? null, g.key).toBe(g.fromStopKey);
      expect(x!.toStopKey ?? null, g.key).toBe(g.toStopKey);
      expect(x!.depPlace ?? null, g.key).toBe(g.depPlace);
      expect(x!.depAt ?? null, g.key).toBe(g.depAt);
      expect(x!.arrPlace ?? null, g.key).toBe(g.arrPlace);
      expect(x!.arrAt ?? null, g.key).toBe(g.arrAt);
      expect(x!.reference ?? null, g.key).toBe(g.reference);
      if (g.costMinor !== undefined) {
        expect(x!.cost, g.key).toBeTruthy();
        expect(x!.cost!.costMinor, g.key).toBe(g.costMinor);
        expect(x!.cost!.currency, g.key).toBe(g.currency);
      } else {
        expect(x!.cost ?? null, g.key).toBeNull();
      }
    }
  });
});

describe("costs", () => {
  const inline = [
    ...t.transports.map((x) => x.cost),
    ...t.accommodations.map((a) => a.cost),
  ].filter(Boolean);
  const all = [...inline, ...t.costs];

  it("records 17 costs in total", () => {
    expect(all).toHaveLength(17);
  });

  it("never records a cost of zero — a Cost with no number is not a Cost", () => {
    for (const c of all) expect(c!.costMinor).toBeGreaterThan(0);
  });

  it("gives every paid cost a paid amount", () => {
    for (const c of all) {
      if (c!.paid) expect(typeof c!.paidMinor).toBe("number");
    }
  });

  it("totals 935935 AUD and 96472 EUR", () => {
    const sum = (cur: string) =>
      all.filter((c) => c!.currency === cur).reduce((n, c) => n + c!.costMinor, 0);
    expect(sum("AUD")).toBe(935935);
    expect(sum("EUR")).toBe(96472);
  });

  it("seeds a EUR rate so the euro costs convert to the home currency", () => {
    const currencies = new Set(all.map((c) => c!.currency));
    for (const cur of currencies) {
      if (cur === t.homeCurrency) continue;
      const rate = (t.exchangeRates ?? []).find((r) => r.base === cur);
      expect(rate, cur).toBeTruthy();
      expect(rate!.quote).toBe("AUD");
    }
  });

  it("carries the Rome city tax as a standalone other cost", () => {
    expect(t.costs).toHaveLength(1);
    expect(t.costs[0]).toMatchObject({
      ownerType: "OTHER", label: "Rome city tax", costMinor: 7000, currency: "EUR",
    });
  });

  it("records the two flights that previously showed a zero cost", () => {
    for (const ref of ["WNIQHG", "DHZU24"]) {
      const leg = t.transports.find((x) => x.reference === ref)!;
      expect(leg.cost!.costMinor, ref).toBe(leg.cost!.paidMinor);
      expect(leg.cost!.paid, ref).toBe(true);
    }
  });
});

describe("summariseRealTrip", () => {
  const out = summariseRealTrip(t);

  it("names the trip and its span", () => {
    expect(out).toContain("Christmas in Europe 2026");
    expect(out).toContain("2026-12-04");
    expect(out).toContain("2027-01-08");
  });

  it("counts every row that will be written", () => {
    expect(out).toContain("11 stops");
    expect(out).toContain("11 accommodations");
    expect(out).toContain("13 transports");
    expect(out).toContain("17 costs");
  });

  it("lists every stop with its dates so the dry-run can be eyeballed", () => {
    for (const s of t.stops) expect(out).toContain(s.name);
    expect(out).toContain("2026-12-22 → 2026-12-29");
  });

  it("reports both currency totals", () => {
    expect(out).toContain("9359.35 AUD");
    expect(out).toContain("964.72 EUR");
  });

  it("reports the exchange rate row count", () => {
    // The real trip seeds exactly one rate (EUR -> AUD). A rate that failed
    // to appear here is exactly what this preview exists to catch, since a
    // missing rate means the persister leaves that currency's costs
    // unconverted.
    expect(t.exchangeRates).toHaveLength(1);
    expect(out).toContain("1 exchange rate");
  });

  it("would count a costed item if the trip ever had one", () => {
    // The real trip has no items (`items: []`) and must keep none — this
    // builds a modified copy of the descriptor rather than adding an item to
    // the real builder, purely to prove summariseRealTrip doesn't structurally
    // drop ITEM costs from the row/currency totals the moment one exists.
    const withCostedItem = {
      ...t,
      items: [
        {
          key: "test:item:not-in-real-trip",
          title: "Test-only item",
          category: "activity",
          cost: { costMinor: 5000, currency: "AUD" as const },
        },
      ],
    };
    const out2 = summariseRealTrip(withCostedItem);
    expect(out2).toContain("18 costs");
    expect(out2).toContain("9409.35 AUD");
  });
});
