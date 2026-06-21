/**
 * Comprehensive tests for lib/budget.ts — pure budget roll-up logic.
 */

import { describe, it, expect } from "vitest";
import {
  convertCostToHome,
  effectiveCategory,
  stopIdForCost,
  buildBudget,
  type BudgetCost,
  type BudgetStop,
  type BudgetItem,
  type BudgetAccommodation,
  type BudgetTransport,
  type BuildBudgetInput,
} from "./budget";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCost(overrides: Partial<BudgetCost> = {}): BudgetCost {
  return {
    id: "cost-1",
    estimatedMinor: 5000,
    actualMinor: null,
    currency: "AUD",
    rateToHome: null,
    ownerType: "OTHER",
    ownerId: null,
    label: "Test cost",
    category: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// convertCostToHome
// ---------------------------------------------------------------------------

describe("convertCostToHome", () => {
  it("same currency → passthrough (no conversion needed)", () => {
    const cost = makeCost({ estimatedMinor: 10000, actualMinor: 8000, currency: "AUD", rateToHome: null });
    const result = convertCostToHome(cost, "AUD");
    expect(result.estimatedHome).toBe(10000);
    expect(result.actualHome).toBe(8000);
  });

  it("same currency, null actual → actualHome is 0", () => {
    const cost = makeCost({ estimatedMinor: 5000, actualMinor: null, currency: "AUD", rateToHome: null });
    const result = convertCostToHome(cost, "AUD");
    expect(result.estimatedHome).toBe(5000);
    expect(result.actualHome).toBe(0);
  });

  it("foreign currency with rate → converts both amounts", () => {
    // EUR → AUD at rate 1.65: €12.50 = 1250 minor EUR → A$20.625 → 2063 minor AUD
    const cost = makeCost({ estimatedMinor: 1250, actualMinor: 800, currency: "EUR", rateToHome: 1.65 });
    const result = convertCostToHome(cost, "AUD");
    expect(result.estimatedHome).toBe(2063); // round-half-up
    expect(result.actualHome).toBe(1320);   // 800 * 1.65 = 1320
  });

  it("foreign currency with rate, null actual → actualHome is 0", () => {
    const cost = makeCost({ estimatedMinor: 1000, actualMinor: null, currency: "USD", rateToHome: 1.5 });
    const result = convertCostToHome(cost, "AUD");
    expect(result.estimatedHome).toBe(1500);
    expect(result.actualHome).toBe(0);
  });

  it("foreign currency with null rate → both null", () => {
    const cost = makeCost({ estimatedMinor: 5000, actualMinor: 3000, currency: "JPY", rateToHome: null });
    const result = convertCostToHome(cost, "AUD");
    expect(result.estimatedHome).toBeNull();
    expect(result.actualHome).toBeNull();
  });

  it("case-insensitive currency comparison", () => {
    const cost = makeCost({ estimatedMinor: 2000, actualMinor: null, currency: "aud", rateToHome: null });
    const result = convertCostToHome(cost, "AUD");
    expect(result.estimatedHome).toBe(2000);
  });

  it("JPY (zero-decimal) conversion", () => {
    // ¥1000 * 0.011 AUD/JPY = A$11 = 1100 AUD minor
    const cost = makeCost({ estimatedMinor: 1000, actualMinor: null, currency: "JPY", rateToHome: 0.011 });
    const result = convertCostToHome(cost, "AUD");
    expect(result.estimatedHome).toBe(1100);
  });
});

// ---------------------------------------------------------------------------
// effectiveCategory
// ---------------------------------------------------------------------------

describe("effectiveCategory", () => {
  const itemCategoryById: Record<string, string> = {
    "item-1": "FOOD",
    "item-2": "SIGHTSEEING",
    "item-3": "ACTIVITY",
  };

  it("TRANSPORT → 'Transport'", () => {
    const cost = makeCost({ ownerType: "TRANSPORT", ownerId: "t-1" });
    expect(effectiveCategory(cost, {})).toBe("Transport");
  });

  it("ACCOMMODATION → 'Accommodation'", () => {
    const cost = makeCost({ ownerType: "ACCOMMODATION", ownerId: "a-1" });
    expect(effectiveCategory(cost, {})).toBe("Accommodation");
  });

  it("ITEM with known category → correct label", () => {
    const cost = makeCost({ ownerType: "ITEM", ownerId: "item-1" });
    expect(effectiveCategory(cost, itemCategoryById)).toBe("Food & Drink");
  });

  it("ITEM with SIGHTSEEING category → correct label", () => {
    const cost = makeCost({ ownerType: "ITEM", ownerId: "item-2" });
    expect(effectiveCategory(cost, itemCategoryById)).toBe("Sightseeing");
  });

  it("ITEM with no ownerId → fallback 'Activity'", () => {
    const cost = makeCost({ ownerType: "ITEM", ownerId: null });
    expect(effectiveCategory(cost, itemCategoryById)).toBe("Activity");
  });

  it("ITEM with unknown ownerId → fallback 'Activity'", () => {
    const cost = makeCost({ ownerType: "ITEM", ownerId: "unknown" });
    expect(effectiveCategory(cost, itemCategoryById)).toBe("Activity");
  });

  it("OTHER with category set → uses cost.category", () => {
    const cost = makeCost({ ownerType: "OTHER", ownerId: null, category: "Travel Insurance" });
    expect(effectiveCategory(cost, {})).toBe("Travel Insurance");
  });

  it("OTHER with null category → fallback 'Other'", () => {
    const cost = makeCost({ ownerType: "OTHER", ownerId: null, category: null });
    expect(effectiveCategory(cost, {})).toBe("Other");
  });
});

// ---------------------------------------------------------------------------
// stopIdForCost
// ---------------------------------------------------------------------------

describe("stopIdForCost", () => {
  const accommodations: BudgetAccommodation[] = [
    { id: "acc-1", stopId: "stop-london", checkIn: "2026-07-01", checkOut: "2026-07-04" },
  ];
  const items: BudgetItem[] = [
    { id: "item-1", stopId: "stop-paris", category: "SIGHTSEEING", date: "2026-07-05" },
    { id: "item-2", stopId: null, category: "ACTIVITY", date: null },
  ];
  const transports: BudgetTransport[] = [
    { id: "t-1", fromStopId: "stop-london", toStopId: "stop-paris", depAt: new Date("2026-07-04T08:00:00Z") },
    { id: "t-2", fromStopId: null, toStopId: "stop-paris", depAt: null },
  ];

  const lookups = {
    accommodationById: Object.fromEntries(accommodations.map((a) => [a.id, a])),
    itemById: Object.fromEntries(items.map((i) => [i.id, i])),
    transportById: Object.fromEntries(transports.map((t) => [t.id, t])),
  };

  it("ACCOMMODATION → returns accommodation's stopId", () => {
    const cost = makeCost({ ownerType: "ACCOMMODATION", ownerId: "acc-1" });
    expect(stopIdForCost(cost, lookups)).toBe("stop-london");
  });

  it("ITEM with stopId → returns item's stopId", () => {
    const cost = makeCost({ ownerType: "ITEM", ownerId: "item-1" });
    expect(stopIdForCost(cost, lookups)).toBe("stop-paris");
  });

  it("ITEM with null stopId → returns null", () => {
    const cost = makeCost({ ownerType: "ITEM", ownerId: "item-2" });
    expect(stopIdForCost(cost, lookups)).toBeNull();
  });

  it("TRANSPORT with fromStopId → returns fromStopId", () => {
    const cost = makeCost({ ownerType: "TRANSPORT", ownerId: "t-1" });
    expect(stopIdForCost(cost, lookups)).toBe("stop-london");
  });

  it("TRANSPORT with no fromStopId → fallback toStopId", () => {
    const cost = makeCost({ ownerType: "TRANSPORT", ownerId: "t-2" });
    expect(stopIdForCost(cost, lookups)).toBe("stop-paris");
  });

  it("OTHER → always null (trip-wide)", () => {
    const cost = makeCost({ ownerType: "OTHER", ownerId: null });
    expect(stopIdForCost(cost, lookups)).toBeNull();
  });

  it("ACCOMMODATION with unknown ownerId → null", () => {
    const cost = makeCost({ ownerType: "ACCOMMODATION", ownerId: "no-such-acc" });
    expect(stopIdForCost(cost, lookups)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildBudget — comprehensive integration tests
// ---------------------------------------------------------------------------

describe("buildBudget", () => {
  const baseStops: BudgetStop[] = [
    { id: "stop-london", name: "London", timezone: "Europe/London" },
    { id: "stop-paris", name: "Paris", timezone: "Europe/Paris" },
  ];

  const baseInput: BuildBudgetInput = {
    homeCurrency: "AUD",
    costs: [],
    stops: baseStops,
    items: [],
    accommodations: [],
    transports: [],
    tripStart: "2026-07-01",
    tripEnd: "2026-07-10",
  };

  it("empty costs → all zeros, no missing rates", () => {
    const result = buildBudget(baseInput);
    expect(result.grandTotal.estimatedMinor).toBe(0);
    expect(result.grandTotal.actualMinor).toBe(0);
    expect(result.missingRates).toEqual([]);
    expect(result.hasMissingRates).toBe(false);
    expect(result.byCategory).toEqual([]);
    expect(result.byStop).toEqual([]);
    // byDay has one entry per trip day (10 days: Jul 1–10 inclusive)
    expect(result.byDay).toHaveLength(10);
    expect(result.byDay[0].dateISO).toBe("2026-07-01");
    expect(result.byDay[9].dateISO).toBe("2026-07-10");
  });

  it("same-currency costs → correct grandTotal", () => {
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 10000, actualMinor: 8000, currency: "AUD", ownerType: "OTHER", label: "Insurance" }),
      makeCost({ id: "c2", estimatedMinor: 5000, actualMinor: null, currency: "AUD", ownerType: "OTHER", label: "Visa" }),
    ];
    const result = buildBudget({ ...baseInput, costs });
    expect(result.grandTotal.estimatedMinor).toBe(15000);
    expect(result.grandTotal.actualMinor).toBe(8000);
  });

  it("foreign-currency cost with rate → converts correctly", () => {
    const costs: BudgetCost[] = [
      // €100 = 10000 minor EUR at rate 1.65 = AUD 16500 minor
      makeCost({ id: "c1", estimatedMinor: 10000, actualMinor: null, currency: "EUR", rateToHome: 1.65, ownerType: "OTHER", label: "Hotel" }),
    ];
    const result = buildBudget({ ...baseInput, costs });
    expect(result.grandTotal.estimatedMinor).toBe(16500);
    expect(result.hasMissingRates).toBe(false);
  });

  it("missing-rate cost excluded from totals and reported in missingRates", () => {
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 5000, actualMinor: null, currency: "AUD", rateToHome: null, ownerType: "OTHER", label: "AUD cost" }),
      makeCost({ id: "c2", estimatedMinor: 3000, actualMinor: null, currency: "JPY", rateToHome: null, ownerType: "OTHER", label: "JPY cost (no rate)" }),
    ];
    const result = buildBudget({ ...baseInput, costs });
    // Only the AUD cost is included
    expect(result.grandTotal.estimatedMinor).toBe(5000);
    expect(result.missingRates).toEqual(["JPY"]);
    expect(result.hasMissingRates).toBe(true);
  });

  it("multiple missing-rate currencies are deduplicated and sorted", () => {
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 100, actualMinor: null, currency: "JPY", rateToHome: null, ownerType: "OTHER", label: "JPY 1" }),
      makeCost({ id: "c2", estimatedMinor: 200, actualMinor: null, currency: "JPY", rateToHome: null, ownerType: "OTHER", label: "JPY 2" }),
      makeCost({ id: "c3", estimatedMinor: 300, actualMinor: null, currency: "EUR", rateToHome: null, ownerType: "OTHER", label: "EUR" }),
    ];
    const result = buildBudget({ ...baseInput, costs });
    expect(result.missingRates).toEqual(["EUR", "JPY"]);
    expect(result.grandTotal.estimatedMinor).toBe(0);
  });

  it("byCategory grouping by ownerType", () => {
    const items: BudgetItem[] = [
      { id: "item-1", stopId: null, category: "FOOD", date: "2026-07-03" },
    ];
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 20000, actualMinor: null, currency: "AUD", ownerType: "TRANSPORT", ownerId: null, label: null }),
      makeCost({ id: "c2", estimatedMinor: 15000, actualMinor: null, currency: "AUD", ownerType: "ITEM", ownerId: "item-1", label: null }),
      makeCost({ id: "c3", estimatedMinor: 5000, actualMinor: null, currency: "AUD", ownerType: "OTHER", ownerId: null, label: "Visa", category: "Insurance" }),
    ];
    const result = buildBudget({ ...baseInput, costs, items });
    const catMap = Object.fromEntries(result.byCategory.map((c) => [c.category, c.estimatedMinor]));
    expect(catMap["Transport"]).toBe(20000);
    expect(catMap["Food & Drink"]).toBe(15000);
    expect(catMap["Insurance"]).toBe(5000);
  });

  it("byCategory sorted descending by estimated", () => {
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 5000, currency: "AUD", ownerType: "OTHER", label: "Small", category: "Small" }),
      makeCost({ id: "c2", estimatedMinor: 30000, currency: "AUD", ownerType: "OTHER", label: "Big", category: "Big" }),
      makeCost({ id: "c3", estimatedMinor: 15000, currency: "AUD", ownerType: "OTHER", label: "Medium", category: "Medium" }),
    ];
    const result = buildBudget({ ...baseInput, costs });
    expect(result.byCategory[0].estimatedMinor).toBe(30000);
    expect(result.byCategory[1].estimatedMinor).toBe(15000);
    expect(result.byCategory[2].estimatedMinor).toBe(5000);
  });

  it("byStop: ACCOMMODATION cost assigned to correct stop", () => {
    const accommodations: BudgetAccommodation[] = [
      { id: "acc-1", stopId: "stop-london", checkIn: "2026-07-01", checkOut: "2026-07-04" },
    ];
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 12000, currency: "AUD", ownerType: "ACCOMMODATION", ownerId: "acc-1", label: null }),
    ];
    const result = buildBudget({ ...baseInput, costs, accommodations });
    const londonEntry = result.byStop.find((s) => s.stopId === "stop-london");
    expect(londonEntry?.estimatedMinor).toBe(12000);
  });

  it("byStop: OTHER cost → trip-wide entry", () => {
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 8000, currency: "AUD", ownerType: "OTHER", label: "Insurance" }),
    ];
    const result = buildBudget({ ...baseInput, costs });
    const tripWide = result.byStop.find((s) => s.stopId === null);
    expect(tripWide?.estimatedMinor).toBe(8000);
    expect(tripWide?.stopName).toBe("Trip-wide / Other");
  });

  // ---------------------------------------------------------------------------
  // byDay — accommodation nightly spread
  // ---------------------------------------------------------------------------

  it("accommodation spread: 10000 over 3 nights → 3334 + 3333 + 3333", () => {
    const accommodations: BudgetAccommodation[] = [
      { id: "acc-1", stopId: "stop-london", checkIn: "2026-07-02", checkOut: "2026-07-05" },
    ];
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 10000, actualMinor: null, currency: "AUD", ownerType: "ACCOMMODATION", ownerId: "acc-1", label: null }),
    ];
    const result = buildBudget({ ...baseInput, costs, accommodations });

    const day2 = result.byDay.find((d) => d.dateISO === "2026-07-02");
    const day3 = result.byDay.find((d) => d.dateISO === "2026-07-03");
    const day4 = result.byDay.find((d) => d.dateISO === "2026-07-04");
    const day5 = result.byDay.find((d) => d.dateISO === "2026-07-05");

    expect(day2?.estimatedMinor).toBe(3334);
    expect(day3?.estimatedMinor).toBe(3333);
    expect(day4?.estimatedMinor).toBe(3333);
    // checkOut day is NOT a night
    expect(day5?.estimatedMinor).toBe(0);

    // Sum exactly equals the total
    const nightTotal = (day2?.estimatedMinor ?? 0) + (day3?.estimatedMinor ?? 0) + (day4?.estimatedMinor ?? 0);
    expect(nightTotal).toBe(10000);
  });

  it("accommodation spread: exact divisor → equal parts", () => {
    const accommodations: BudgetAccommodation[] = [
      { id: "acc-1", stopId: "stop-london", checkIn: "2026-07-01", checkOut: "2026-07-03" },
    ];
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 6000, actualMinor: null, currency: "AUD", ownerType: "ACCOMMODATION", ownerId: "acc-1", label: null }),
    ];
    const result = buildBudget({ ...baseInput, costs, accommodations });
    const day1 = result.byDay.find((d) => d.dateISO === "2026-07-01");
    const day2 = result.byDay.find((d) => d.dateISO === "2026-07-02");
    expect(day1?.estimatedMinor).toBe(3000);
    expect(day2?.estimatedMinor).toBe(3000);
  });

  it("accommodation spread: actual amounts also spread correctly", () => {
    const accommodations: BudgetAccommodation[] = [
      { id: "acc-1", stopId: "stop-london", checkIn: "2026-07-02", checkOut: "2026-07-05" },
    ];
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 10000, actualMinor: 9900, currency: "AUD", ownerType: "ACCOMMODATION", ownerId: "acc-1", label: null }),
    ];
    const result = buildBudget({ ...baseInput, costs, accommodations });
    const totalActual = result.byDay
      .filter((d) => ["2026-07-02", "2026-07-03", "2026-07-04"].includes(d.dateISO))
      .reduce((sum, d) => sum + d.actualMinor, 0);
    expect(totalActual).toBe(9900);
  });

  it("accommodation spread: large non-divisible amount — all parts sum exactly", () => {
    // 99 cents over 4 nights: 25+25+25+24 = 99 but remainder is on first nights
    const accommodations: BudgetAccommodation[] = [
      { id: "acc-1", stopId: "stop-london", checkIn: "2026-07-01", checkOut: "2026-07-05" },
    ];
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 99, actualMinor: null, currency: "AUD", ownerType: "ACCOMMODATION", ownerId: "acc-1", label: null }),
    ];
    const result = buildBudget({ ...baseInput, costs, accommodations });
    const nightDays = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"];
    const totalFromDays = nightDays.reduce((sum, d) => {
      const dayEntry = result.byDay.find((x) => x.dateISO === d);
      return sum + (dayEntry?.estimatedMinor ?? 0);
    }, 0);
    expect(totalFromDays).toBe(99);
  });

  // ---------------------------------------------------------------------------
  // byDay — transport on departure day
  // ---------------------------------------------------------------------------

  it("transport cost placed on departure day", () => {
    const transports: BudgetTransport[] = [
      { id: "t-1", fromStopId: "stop-london", toStopId: "stop-paris", depAt: new Date("2026-07-04T08:00:00Z") },
    ];
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 25000, actualMinor: null, currency: "AUD", ownerType: "TRANSPORT", ownerId: "t-1", label: null }),
    ];
    const result = buildBudget({ ...baseInput, costs, transports });
    const depDay = result.byDay.find((d) => d.dateISO === "2026-07-04");
    expect(depDay?.estimatedMinor).toBe(25000);
  });

  it("transport cost with no depAt → not placed on any day (still counted in grandTotal)", () => {
    const transports: BudgetTransport[] = [
      { id: "t-1", fromStopId: "stop-london", toStopId: "stop-paris", depAt: null },
    ];
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 25000, actualMinor: null, currency: "AUD", ownerType: "TRANSPORT", ownerId: "t-1", label: null }),
    ];
    const result = buildBudget({ ...baseInput, costs, transports });
    // Still in grandTotal (rate is AUD = home)
    expect(result.grandTotal.estimatedMinor).toBe(25000);
    // But not placed on any day
    const allDayTotal = result.byDay.reduce((s, d) => s + d.estimatedMinor, 0);
    expect(allDayTotal).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // byDay — item cost on its date
  // ---------------------------------------------------------------------------

  it("dated ITEM cost placed on item's date", () => {
    const items: BudgetItem[] = [
      { id: "item-1", stopId: "stop-paris", category: "SIGHTSEEING", date: "2026-07-06" },
    ];
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 3500, actualMinor: null, currency: "AUD", ownerType: "ITEM", ownerId: "item-1", label: null }),
    ];
    const result = buildBudget({ ...baseInput, costs, items });
    const day = result.byDay.find((d) => d.dateISO === "2026-07-06");
    expect(day?.estimatedMinor).toBe(3500);
  });

  it("undated ITEM cost not in byDay but IS in grandTotal", () => {
    const items: BudgetItem[] = [
      { id: "item-1", stopId: null, category: "ACTIVITY", date: null },
    ];
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 4000, actualMinor: null, currency: "AUD", ownerType: "ITEM", ownerId: "item-1", label: null }),
    ];
    const result = buildBudget({ ...baseInput, costs, items });
    expect(result.grandTotal.estimatedMinor).toBe(4000);
    const allDayTotal = result.byDay.reduce((s, d) => s + d.estimatedMinor, 0);
    expect(allDayTotal).toBe(0);
  });

  it("OTHER cost not in byDay but IS in grandTotal", () => {
    const costs: BudgetCost[] = [
      makeCost({ id: "c1", estimatedMinor: 12000, actualMinor: null, currency: "AUD", ownerType: "OTHER", label: "Travel insurance" }),
    ];
    const result = buildBudget({ ...baseInput, costs });
    expect(result.grandTotal.estimatedMinor).toBe(12000);
    const allDayTotal = result.byDay.reduce((s, d) => s + d.estimatedMinor, 0);
    expect(allDayTotal).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // byDay — correct structure
  // ---------------------------------------------------------------------------

  it("byDay includes every trip day with zeros for empty days", () => {
    const result = buildBudget(baseInput);
    expect(result.byDay).toHaveLength(10);
    for (const day of result.byDay) {
      expect(day.estimatedMinor).toBe(0);
      expect(day.actualMinor).toBe(0);
    }
  });

  it("byDay for single-day trip", () => {
    const result = buildBudget({ ...baseInput, tripStart: "2026-07-05", tripEnd: "2026-07-05" });
    expect(result.byDay).toHaveLength(1);
    expect(result.byDay[0].dateISO).toBe("2026-07-05");
  });

  // ---------------------------------------------------------------------------
  // Mixed-currency grandTotal
  // ---------------------------------------------------------------------------

  it("mixed currencies: converts and sums correctly, excludes missing-rate", () => {
    const costs: BudgetCost[] = [
      // AUD 100 = 10000 minor
      makeCost({ id: "c1", estimatedMinor: 10000, actualMinor: 9000, currency: "AUD", rateToHome: null, ownerType: "OTHER", label: "AUD cost" }),
      // EUR 50 = 5000 minor at 1.65 = AUD 8250 minor
      makeCost({ id: "c2", estimatedMinor: 5000, actualMinor: 4000, currency: "EUR", rateToHome: 1.65, ownerType: "OTHER", label: "EUR cost" }),
      // USD 30 = 3000 minor, no rate → excluded
      makeCost({ id: "c3", estimatedMinor: 3000, actualMinor: null, currency: "USD", rateToHome: null, ownerType: "OTHER", label: "USD cost" }),
    ];
    const result = buildBudget({ ...baseInput, costs });

    expect(result.grandTotal.estimatedMinor).toBe(10000 + 8250); // 18250
    expect(result.grandTotal.actualMinor).toBe(9000 + 6600); // 4000 * 1.65 = 6600
    expect(result.missingRates).toEqual(["USD"]);
    expect(result.hasMissingRates).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // homeCurrency exposed on result
  // ---------------------------------------------------------------------------

  it("result includes homeCurrency", () => {
    const result = buildBudget({ ...baseInput, homeCurrency: "EUR" });
    expect(result.homeCurrency).toBe("EUR");
  });

  // ---------------------------------------------------------------------------
  // Complex scenario: multiple cost types on one trip
  // ---------------------------------------------------------------------------

  it("realistic multi-type trip aggregates all breakdowns correctly", () => {
    const stops: BudgetStop[] = [
      { id: "stop-1", name: "London", timezone: "Europe/London" },
    ];
    const accommodations: BudgetAccommodation[] = [
      { id: "acc-1", stopId: "stop-1", checkIn: "2026-07-01", checkOut: "2026-07-03" },
    ];
    const transports: BudgetTransport[] = [
      { id: "t-1", fromStopId: "stop-1", toStopId: null, depAt: new Date("2026-07-03T10:00:00Z") },
    ];
    const items: BudgetItem[] = [
      { id: "item-1", stopId: "stop-1", category: "FOOD", date: "2026-07-02" },
    ];
    const costs: BudgetCost[] = [
      // Accommodation: AUD 600 over 2 nights = 300/night
      makeCost({ id: "c1", estimatedMinor: 60000, actualMinor: 60000, currency: "AUD", ownerType: "ACCOMMODATION", ownerId: "acc-1", label: null }),
      // Transport: AUD 200
      makeCost({ id: "c2", estimatedMinor: 20000, actualMinor: null, currency: "AUD", ownerType: "TRANSPORT", ownerId: "t-1", label: null }),
      // Item: AUD 50
      makeCost({ id: "c3", estimatedMinor: 5000, actualMinor: null, currency: "AUD", ownerType: "ITEM", ownerId: "item-1", label: null }),
      // Other: AUD 100
      makeCost({ id: "c4", estimatedMinor: 10000, actualMinor: null, currency: "AUD", ownerType: "OTHER", label: "Insurance" }),
    ];

    const result = buildBudget({
      homeCurrency: "AUD",
      costs,
      stops,
      items,
      accommodations,
      transports,
      tripStart: "2026-07-01",
      tripEnd: "2026-07-04",
    });

    expect(result.grandTotal.estimatedMinor).toBe(60000 + 20000 + 5000 + 10000); // 95000

    // Day 1: accommodation night 1 (30000)
    const d1 = result.byDay.find((d) => d.dateISO === "2026-07-01");
    expect(d1?.estimatedMinor).toBe(30000);

    // Day 2: accommodation night 2 (30000) + item (5000)
    const d2 = result.byDay.find((d) => d.dateISO === "2026-07-02");
    expect(d2?.estimatedMinor).toBe(35000);

    // Day 3: transport (20000)
    const d3 = result.byDay.find((d) => d.dateISO === "2026-07-03");
    expect(d3?.estimatedMinor).toBe(20000);

    // Day 4: nothing
    const d4 = result.byDay.find((d) => d.dateISO === "2026-07-04");
    expect(d4?.estimatedMinor).toBe(0);

    // byStop: stop-1 gets acc + transport + item = 85000
    const londonStop = result.byStop.find((s) => s.stopId === "stop-1");
    expect(londonStop?.estimatedMinor).toBe(85000);

    // byStop: trip-wide gets other = 10000
    const tripWide = result.byStop.find((s) => s.stopId === null);
    expect(tripWide?.estimatedMinor).toBe(10000);
  });
});
