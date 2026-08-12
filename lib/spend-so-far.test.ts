import { describe, it, expect } from "vitest";
import { buildSpendSoFar, type SpendCost } from "./spend-so-far";

const cost = (o: Partial<SpendCost>): SpendCost => ({
  id: "c", costMinor: 0, paidMinor: null, currency: "AUD", rateToHome: null,
  ownerType: "OTHER", ownerId: null, label: null, category: null, paidAt: null, ...o,
});

describe("buildSpendSoFar", () => {
  it("totals estimates, paid actuals, variance on paid items, and remaining", () => {
    const res = buildSpendSoFar({
      homeCurrency: "AUD",
      costs: [
        cost({ id: "a", costMinor: 10000, paidMinor: 11000, paidAt: new Date("2026-08-02") }), // paid, $10 over by $10
        cost({ id: "b", costMinor: 5000, paidMinor: 4000, paidAt: new Date("2026-08-03") }),   // paid, under by $10
        cost({ id: "c", costMinor: 8000, paidMinor: null, paidAt: null }),                      // not paid
      ],
      tripStart: "2026-08-01", tripEnd: "2026-08-11", today: "2026-08-06",
    });
    expect(res.costTotalMinor).toBe(23000);
    expect(res.paidSoFarMinor).toBe(15000);      // 11000 + 4000
    expect(res.paidCostMinor).toBe(15000);   // 10000 + 5000
    expect(res.varianceMinor).toBe(0);           // 15000 - 15000
    expect(res.costRemainingMinor).toBe(8000); // 23000 - 15000
    expect(res.tripElapsedPct).toBe(50);         // day 5 of 10
  });

  it("excludes missing-rate foreign costs and handles no dates", () => {
    const res = buildSpendSoFar({
      homeCurrency: "AUD",
      costs: [cost({ costMinor: 9999, currency: "JPY", rateToHome: null, paidAt: new Date() })],
      tripStart: null, tripEnd: null, today: "2026-08-06",
    });
    expect(res.costTotalMinor).toBe(0);
    expect(res.paidSoFarMinor).toBe(0);
    expect(res.tripElapsedPct).toBeNull();
  });

  it("counts the full paid amount for every paid cost", () => {
    const result = buildSpendSoFar({
      costs: [
        cost({ id: "c1", costMinor: 34000, paidMinor: 34000, currency: "GBP",
          rateToHome: null, paidAt: "2026-06-04" }),
      ],
      homeCurrency: "GBP",
      today: "2026-06-10",
    });
    expect(result.paidSoFarMinor).toBe(34000);
    expect(result.varianceMinor).toBe(0);
  });

  it("skips a legacy paid cost that has no paid amount, rather than counting it as zero", () => {
    // This is the display bug ADR 0037 exists to kill: the old code added 0 to
    // paidSoFar but the FULL cost to paidEstimate, so a £340 hotel marked paid
    // with no amount rendered as "Paid £0 · £340 under estimate". Skipping it
    // entirely keeps both figures honest.
    const result = buildSpendSoFar({
      costs: [
        cost({ id: "c1", costMinor: 34000, paidMinor: null, currency: "GBP",
          rateToHome: null, paidAt: "2026-06-04" }),
      ],
      homeCurrency: "GBP",
      today: "2026-06-10",
    });
    expect(result.paidSoFarMinor).toBe(0);
    expect(result.varianceMinor).toBe(0);      // NOT -34000
    expect(result.costTotalMinor).toBe(34000); // still counted as a cost
  });
});
