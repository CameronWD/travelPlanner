import { describe, expect, it } from "vitest";
import { shownCost, shownCostMinor } from "./cost-row";

const PAID = new Date("2026-07-26");
const RECEIVED = new Date("2026-12-01");

describe("shownCost", () => {
  it("shownCost of a Cost paid in Home is the paid amount less a received Refund, in Home", () => {
    const c = { costMinor: 55000, paidMinor: 90512, paidAt: PAID, refundMinor: 10000, refundedAt: RECEIVED, currency: "EUR", paidCurrency: "AUD" };
    expect(shownCost(c)).toEqual({ minor: 80512, currency: "AUD" });
  });
  it("shownCost of a Cost paid in its own currency is the paid amount less a received Refund, in its currency", () => {
    const c = { costMinor: 55000, paidMinor: 52000, paidAt: PAID, refundMinor: 2000, refundedAt: RECEIVED, currency: "eur", paidCurrency: null };
    expect(shownCost(c)).toEqual({ minor: 50000, currency: "EUR" });
  });
  it("shownCost of an unpaid Cost is its cost amount in its currency", () => {
    const c = { costMinor: 55000, paidMinor: 90512, paidAt: null, currency: "EUR", paidCurrency: "AUD" };
    expect(shownCost(c)).toEqual({ minor: 55000, currency: "EUR" });
  });
  it("shownCost of a legacy paid Cost with no amount is the cost amount", () => {
    const c = { costMinor: 55000, paidMinor: null, paidAt: PAID, currency: "EUR" };
    expect(shownCost(c)).toEqual({ minor: 55000, currency: "EUR" });
  });
  it("shownCostMinor equals shownCost().minor", () => {
    const rows = [
      { costMinor: 55000, paidMinor: 90512, paidAt: PAID, refundMinor: 10000, refundedAt: RECEIVED, currency: "EUR", paidCurrency: "AUD" },
      { costMinor: 55000, paidMinor: 52000, paidAt: PAID, refundMinor: 2000, refundedAt: RECEIVED, currency: "EUR" },
      { costMinor: 55000, paidMinor: 52000, paidAt: PAID, refundMinor: 52000, refundedAt: RECEIVED, currency: "EUR" },
      { costMinor: 55000, paidMinor: 52000, paidAt: PAID, refundMinor: 2000, refundedAt: null, currency: "EUR" },
      { costMinor: 55000, paidMinor: 55000, paidAt: null, currency: "EUR" },
      { costMinor: 55000, paidMinor: null, paidAt: PAID, currency: "EUR" },
      { costMinor: 55000, currency: "EUR" },
    ];
    for (const c of rows) expect(shownCostMinor(c)).toBe(shownCost(c).minor);
  });
});
