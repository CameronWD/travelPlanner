import { describe, expect, it } from "vitest";
import { seedCost } from "./cost-seed";

describe("seedCost", () => {
  it("prefers a saved Cost, exactly as the forms seeded it before", () => {
    const saved = { id: "c1", costMinor: 12_345, paidMinor: 12_345, currency: "EUR", rateToHome: null, paidAt: new Date("2026-10-01T00:00:00Z"), dueDate: null, ownerType: "TRANSPORT", ownerId: "t1", label: null, category: null, settlement: "ON_TRIP" };
    expect(seedCost(saved, { costMinor: 1, currency: "AUD" }, "AUD")).toEqual({ costAmount: "123.45", currency: "EUR", paidAmount: "123.45", paidAt: "2026-10-01", paid: true, settlement: "ON_TRIP" });
  });
  it("seeds a Proposal's inline Cost", () => {
    expect(seedCost(null, { costMinor: 12_000, currency: "JPY", paidMinor: null, paidAt: null }, "AUD")).toEqual({ costAmount: "12000", currency: "JPY", paidAmount: "", paidAt: "", paid: false, settlement: "BEFORE" });
  });
  it("falls back to an empty Cost in the default currency", () => {
    expect(seedCost(null, undefined, "AUD")).toEqual({ costAmount: "", currency: "AUD", paidAmount: "", paidAt: "", paid: false, settlement: "BEFORE" });
  });
});
