import { describe, it, expect } from "vitest";
import { otherCostDefaults } from "./other-cost-defaults";

const PARIS = { arriveDate: "2026-07-01", departDate: "2026-07-05", countryCode: "fr" };
const TOKYO = { arriveDate: "2026-07-05", departDate: "2026-07-09", countryCode: "jp" };

describe("otherCostDefaults (spec 2026-10-06 §K)", () => {
  it("before the trip: Home currency, Before you go, unpaid", () => {
    expect(otherCostDefaults({ phase: "planning", homeCurrency: "AUD", today: "2026-06-01", stops: [PARIS] }))
      .toEqual({ currency: "AUD", settlement: "BEFORE", paidToday: false });
  });
  it("past keeps today's defaults too", () => {
    expect(otherCostDefaults({ phase: "past", homeCurrency: "AUD", today: "2026-08-01", stops: [PARIS] }))
      .toEqual({ currency: "AUD", settlement: "BEFORE", paidToday: false });
  });
  it("travelling: today's Stop currency, On the trip, paid today", () => {
    expect(otherCostDefaults({ phase: "travelling", homeCurrency: "AUD", today: "2026-07-03", stops: [PARIS, TOKYO] }))
      .toEqual({ currency: "EUR", settlement: "ON_TRIP", paidToday: true });
  });
  it("a Changeover day spends in the Stop you arrive at", () => {
    expect(otherCostDefaults({ phase: "travelling", homeCurrency: "AUD", today: "2026-07-05", stops: [PARIS, TOKYO] }).currency).toBe("JPY");
  });
  it("travelling with no Stop today, or no known currency, falls back to Home currency", () => {
    expect(otherCostDefaults({ phase: "travelling", homeCurrency: "AUD", today: "2026-07-20", stops: [PARIS] }).currency).toBe("AUD");
    expect(otherCostDefaults({ phase: "travelling", homeCurrency: "AUD", today: "2026-07-03",
      stops: [{ ...PARIS, countryCode: null }] }).currency).toBe("AUD");
    expect(otherCostDefaults({ phase: "travelling", homeCurrency: "AUD", today: "2026-07-03",
      stops: [{ ...PARIS, countryCode: "vn" }] }).currency).toBe("AUD");
  });
});
