import { describe, it, expect } from "vitest";
import {
  moneyMetaLine,
  perNightMinor,
  perPersonMinor,
  paidPct,
  missingRatesLine,
  ratesUpdatedNote,
} from "./summary-lines";

describe("moneyMetaLine", () => {
  it("reads currency · nights · costs in currencies", () => {
    expect(moneyMetaLine({ homeCurrency: "AUD", nights: 35, costCount: 14, currencyCount: 3 })).toBe(
      "In AUD · 35 nights · 14 costs in 3 currencies",
    );
  });
  it("leaves out zero parts, and the currency clause when everything is in the home currency", () => {
    expect(moneyMetaLine({ homeCurrency: "AUD", nights: 0, costCount: 0, currencyCount: 1 })).toBe("In AUD");
    expect(moneyMetaLine({ homeCurrency: "AUD", nights: 1, costCount: 1, currencyCount: 1 })).toBe(
      "In AUD · 1 night · 1 cost",
    );
    expect(moneyMetaLine({ homeCurrency: "GBP", nights: 0, costCount: 2, currencyCount: 2 })).toBe(
      "In GBP · 2 costs in 2 currencies",
    );
  });
});

describe("per night / per person", () => {
  it("divides and rounds to a minor unit", () => {
    expect(perNightMinor(1482040, 35)).toBe(42344);
    expect(perPersonMinor(1482040, 2)).toBe(741020);
    expect(perPersonMinor(1000, 3)).toBe(333);
  });
  it("is null with no nights, or fewer than two people", () => {
    expect(perNightMinor(1000, 0)).toBeNull();
    expect(perPersonMinor(1000, 1)).toBeNull();
    expect(perPersonMinor(1000, 0)).toBeNull();
  });
});

describe("paidPct", () => {
  it("rounds to a whole percent", () => {
    expect(paidPct(934000, 1482040)).toBe(63);
  });
  it("is 0 on a zero total and caps at 100", () => {
    expect(paidPct(0, 0)).toBe(0);
    expect(paidPct(2000000, 1482040)).toBe(100);
    expect(paidPct(1482040, 1482040)).toBe(100);
  });
  it("never reads 100 while something is still to go", () => {
    expect(paidPct(1482039, 1482040)).toBe(99);
  });
});

describe("missingRatesLine", () => {
  const costs = [{ currency: "IDR" }, { currency: "idr" }, { currency: "EUR" }, { currency: "VND" }, { currency: "THB" }];
  it("counts the costs a missing rate leaves out", () => {
    expect(missingRatesLine(costs, ["IDR"])).toBe("2 IDR costs left out of totals until you set a rate.");
    expect(missingRatesLine([{ currency: "IDR" }], ["IDR"])).toBe("1 IDR cost left out of totals until you set a rate.");
  });
  it("joins several currencies", () => {
    expect(missingRatesLine(costs, ["IDR", "VND"])).toBe(
      "2 IDR and 1 VND costs left out of totals until you set a rate.",
    );
    expect(missingRatesLine(costs, ["IDR", "VND", "THB"])).toBe(
      "2 IDR, 1 VND and 1 THB costs left out of totals until you set a rate.",
    );
  });
  it("is null when nothing is missing", () => {
    expect(missingRatesLine(costs, [])).toBeNull();
  });
});

describe("ratesUpdatedNote", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  it("says how long ago the newest fetched rate is", () => {
    expect(
      ratesUpdatedNote(
        [
          { manual: false, fetchedAt: new Date("2026-10-10T06:00:00Z") },
          { manual: false, fetchedAt: new Date("2026-10-10T10:00:00Z") },
        ],
        now,
      ),
    ).toBe("Updated 2h ago");
  });
  it("names manual rates instead", () => {
    expect(
      ratesUpdatedNote(
        [
          { manual: true, fetchedAt: new Date("2026-10-01T00:00:00Z") },
          { manual: false, fetchedAt: new Date("2026-10-10T11:59:30Z") },
        ],
        now,
      ),
    ).toBe("1 set by you");
  });
  it("is null with no stored rates", () => {
    expect(ratesUpdatedNote([], now)).toBeNull();
  });
});
