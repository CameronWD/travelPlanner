import { describe, it, expect } from "vitest";
import { buildBudget } from "./budget";
import { dayRowsWithStandalone, type StandaloneDayCost } from "./standalone-days";

const cost = (o: Partial<StandaloneDayCost>): StandaloneDayCost => ({
  id: "c", costMinor: 0, paidMinor: null, currency: "EUR", rateToHome: 2, ownerType: "OTHER", ownerId: null,
  label: null, category: null, paidAt: null, refundMinor: null, refundedAt: null, dueDate: null, ...o,
});

describe("dayRowsWithStandalone", () => {
  it("puts a paid standalone Cost on its paid day, the undated one under Not on a day, and sums to the total", () => {
    const lunch = cost({ id: "lunch", costMinor: 2350, paidMinor: 2350, paidAt: new Date("2026-11-02") });
    const esim = cost({ id: "esim", costMinor: 3000, currency: "AUD", rateToHome: null });
    const budget = buildBudget({
      homeCurrency: "AUD", costs: [lunch, esim], stops: [], items: [], accommodations: [], transports: [],
      tripStart: "2026-11-01", tripEnd: "2026-11-03",
    });
    const rows = dayRowsWithStandalone({ budget, homeCurrency: "AUD", costs: [lunch, esim] });
    const day = rows.find((r) => r.key === "day:2026-11-02")!;
    expect(day.costMinor).toBe(4700);
    expect(day.paidMinor).toBe(4700);
    expect(rows.find((r) => r.label === "Not on a day")?.costMinor).toBe(3000);
    expect(rows.reduce((s, r) => s + r.costMinor, 0)).toBe(budget.grandTotal.costTotalMinor);
    expect(rows.reduce((s, r) => s + r.paidMinor, 0)).toBe(budget.grandTotal.paidTotalMinor);
  });

  it("uses the Due date when unpaid, and sends a date outside the trip to Not on a day", () => {
    const due = cost({ id: "visa", costMinor: 1000, currency: "AUD", dueDate: "2026-11-03" });
    const late = cost({ id: "late", costMinor: 500, currency: "AUD", dueDate: "2027-01-01" });
    const budget = buildBudget({
      homeCurrency: "AUD", costs: [due, late], stops: [], items: [], accommodations: [], transports: [],
      tripStart: "2026-11-01", tripEnd: "2026-11-03",
    });
    const rows = dayRowsWithStandalone({ budget, homeCurrency: "AUD", costs: [due, late] });
    expect(rows.find((r) => r.key === "day:2026-11-03")?.costMinor).toBe(1000);
    expect(rows.find((r) => r.label === "Not on a day")?.costMinor).toBe(500);
    expect(rows.reduce((s, r) => s + r.costMinor, 0)).toBe(1500);
  });
});
