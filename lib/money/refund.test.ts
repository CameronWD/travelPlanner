import { describe, expect, it } from "vitest";
import { netCostMinor, netPaidMinor, receivedRefundMinor, REFUND_MESSAGES, refundProblem, refundState } from "./refund";

const paid = { costMinor: 20000, paidMinor: 20000, paidAt: "2026-07-26", refundMinor: null, refundedAt: null };

describe("refund rules", () => {
  it("reads the state", () => {
    expect(refundState(paid)).toBe("none");
    expect(refundState({ refundMinor: 5000, refundedAt: null })).toBe("expected");
    expect(refundState({ refundMinor: 5000, refundedAt: "2026-12-01" })).toBe("received");
    expect(refundState({ refundMinor: 5000, refundedAt: new Date("2026-12-01") })).toBe("received");
    expect(refundState({ refundMinor: null, refundedAt: "2026-12-01" })).toBe("none");
    expect(refundState({ refundMinor: undefined, refundedAt: undefined })).toBe("none");
  });
  it("counts only a received Refund on a paid Cost", () => {
    expect(receivedRefundMinor({ ...paid, refundMinor: 5000, refundedAt: null })).toBe(0);
    expect(receivedRefundMinor({ ...paid, refundMinor: 5000, refundedAt: "2026-12-01" })).toBe(5000);
    expect(receivedRefundMinor({ paidAt: null, refundMinor: 5000, refundedAt: "2026-12-01" })).toBe(0);
  });
  it("nets a partial and a full Refund, and never goes below zero", () => {
    const part = { ...paid, refundMinor: 5000, refundedAt: "2026-12-01" };
    expect([netCostMinor(part), netPaidMinor(part)]).toEqual([15000, 15000]);
    const full = { ...paid, refundMinor: 20000, refundedAt: "2026-12-01" };
    expect([netCostMinor(full), netPaidMinor(full)]).toEqual([0, 0]);
    const overpaid = { costMinor: 20000, paidMinor: 22000, paidAt: "2026-07-26", refundMinor: 22000, refundedAt: "2026-12-01" };
    expect([netCostMinor(overpaid), netPaidMinor(overpaid)]).toEqual([0, 0]);
    expect(netPaidMinor({ ...paid, paidMinor: null })).toBeNull();
    const expected = { ...paid, refundMinor: 5000, refundedAt: null };
    expect([netCostMinor(expected), netPaidMinor(expected)]).toEqual([20000, 20000]);
  });
  it("names the rule a Cost breaks", () => {
    expect(refundProblem(paid)).toBeNull();
    expect(refundProblem({ ...paid, refundMinor: 20000 })).toBeNull();
    expect(refundProblem({ ...paid, refundMinor: 20001 })).toBe(REFUND_MESSAGES.tooMuch);
    expect(refundProblem({ ...paid, refundMinor: 0 })).toBe(REFUND_MESSAGES.tooSmall);
    expect(refundProblem({ ...paid, paidAt: null, refundMinor: 5000 })).toBe(REFUND_MESSAGES.notPaid);
    expect(refundProblem({ ...paid, refundMinor: null, refundedAt: "2026-12-01" })).toBe(REFUND_MESSAGES.dateNeedsAmount);
  });
  it("rejects negative, fractional and NaN amounts", () => {
    for (const bad of [-5, 1.5, NaN]) expect(refundProblem({ ...paid, refundMinor: bad })).toBe(REFUND_MESSAGES.tooSmall);
  });
  it("gives a Cost with no paid amount no Refund that counts", () => {
    const legacy = { ...paid, paidMinor: null, refundMinor: 100, refundedAt: "2026-12-01" };
    expect(receivedRefundMinor(legacy)).toBe(0);
    expect([netCostMinor(legacy), netPaidMinor(legacy)]).toEqual([20000, null]);
    expect(refundProblem(legacy)).toBe(REFUND_MESSAGES.notPaid);
  });
  it("counts a zero Refund as 0", () => {
    expect(receivedRefundMinor({ ...paid, refundMinor: 0, refundedAt: "2026-12-01" })).toBe(0);
  });
  it("allows a Refund above the cost amount when the paid amount covers it", () => {
    expect(refundProblem({ ...paid, paidMinor: 22000, refundMinor: 21000 })).toBeNull();
  });
  it("netCostMinor leaves the cost amount alone when the Refund is in another currency", () => {
    const homePaid = { costMinor: 55000, paidMinor: 90512, paidAt: "2026-07-26", refundMinor: 10000, refundedAt: "2026-12-01", currency: "EUR", paidCurrency: "AUD" };
    expect(netCostMinor(homePaid)).toBe(55000);
    expect(netPaidMinor(homePaid)).toBe(80512);
    expect(receivedRefundMinor(homePaid)).toBe(10000);
  });
  it("netCostMinor subtracts as before when no currency is given", () => {
    const part = { ...paid, refundMinor: 5000, refundedAt: "2026-12-01" };
    expect(netCostMinor(part)).toBe(15000);
    expect(netCostMinor({ ...part, currency: "EUR" })).toBe(15000);
    expect(netCostMinor({ ...part, currency: "EUR", paidCurrency: null })).toBe(15000);
    expect(netCostMinor({ ...part, currency: "EUR", paidCurrency: "eur" })).toBe(15000);
  });
});
