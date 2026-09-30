import { describe, it, expect } from "vitest";
import { mergeToPay, type ToPayInput } from "./to-pay";

const TODAY = "2026-10-10"; // a Saturday
const OPTS = { today: TODAY, homeCurrency: "AUD" };

function cost(over: Partial<ToPayInput> & { id: string }): ToPayInput {
  return {
    displayLabel: over.id,
    costMinor: 10000,
    paidMinor: null,
    currency: "AUD",
    rateToHome: null,
    paidAt: null,
    dueDate: null,
    ownerType: "OTHER",
    settlement: "BEFORE",
    ...over,
  };
}

describe("mergeToPay order", () => {
  it("unpaid first — overdue, then by due date, then undated in created order — then paid, newest first", () => {
    const rows = mergeToPay(
      [
        cost({ id: "paidOld", paidMinor: 10000, paidAt: new Date("2026-09-01") }),
        cost({ id: "noDue1" }),
        cost({ id: "dueLater", dueDate: "2026-11-02" }),
        cost({ id: "overdue2", dueDate: "2026-10-05" }),
        cost({ id: "paidNew", paidMinor: 10000, paidAt: new Date("2026-09-20") }),
        cost({ id: "dueSoon", dueDate: "2026-10-15" }),
        cost({ id: "overdue1", dueDate: "2026-10-01" }),
        cost({ id: "noDue2" }),
      ],
      OPTS,
    );
    expect(rows.map((r) => r.id)).toEqual([
      "overdue1",
      "overdue2",
      "dueSoon",
      "dueLater",
      "noDue1",
      "noDue2",
      "paidNew",
      "paidOld",
    ]);
  });
});

describe("mergeToPay due lines", () => {
  const line = (c: ToPayInput) => {
    const [r] = mergeToPay([c], OPTS);
    return [r.dueLine, r.dueTone];
  };
  it("overdue, due soon (14 days inclusive), and later", () => {
    expect(line(cost({ id: "a", dueDate: "2026-10-01" }))).toEqual(["Overdue · Thu 1 Oct", "overdue"]);
    expect(line(cost({ id: "b", dueDate: TODAY }))).toEqual(["Due Sat 10 Oct", "soon"]);
    expect(line(cost({ id: "c", dueDate: "2026-10-24" }))).toEqual(["Due Sat 24 Oct", "soon"]);
    expect(line(cost({ id: "d", dueDate: "2026-10-25" }))).toEqual(["Due Sun 25 Oct", "later"]);
  });
  it("On the trip with no due date: check-in for accommodation, on the day otherwise", () => {
    expect(line(cost({ id: "a", settlement: "ON_TRIP", ownerType: "ACCOMMODATION" }))).toEqual(["Pay at check-in", "none"]);
    expect(line(cost({ id: "b", settlement: "ON_TRIP", ownerType: "ITEM" }))).toEqual(["Pay on the day", "none"]);
  });
  it("Before you go with no due date has no line", () => {
    expect(line(cost({ id: "a" }))).toEqual(["", "none"]);
  });
  it("paid reads the day it was paid", () => {
    expect(line(cost({ id: "a", paidMinor: 10000, paidAt: new Date("2026-09-02") }))).toEqual(["Paid 2 Sep", "paid"]);
  });
  it("legacy (an amount but no paid date) is unpaid, flagged, and says the date is missing", () => {
    const [r] = mergeToPay([cost({ id: "a", paidMinor: 5000 })], OPTS);
    expect(r.paid).toBe(false);
    expect(r.legacy).toBe(true);
    expect([r.dueLine, r.dueTone]).toEqual(["Paid · date missing", "legacy"]);
  });
  it("keeps what an unpaid row would read on a paid row, for an optimistic un-tick", () => {
    const [r] = mergeToPay([cost({ id: "a", dueDate: "2026-10-15", paidMinor: 10000, paidAt: new Date("2026-09-02") })], OPTS);
    expect([r.unpaidDueLine, r.unpaidDueTone]).toEqual(["Due Thu 15 Oct", "soon"]);
  });
});

describe("mergeToPay amounts", () => {
  it("converts a foreign cost to the home currency and keeps the original", () => {
    const [r] = mergeToPay([cost({ id: "a", currency: "EUR", costMinor: 76000, rateToHome: 2 })], OPTS);
    expect(r.foreign).toBe(true);
    expect(r.homeMinor).toBe(152000);
    expect(r.originalMinor).toBe(76000);
  });
  it("has no home amount when the rate is missing", () => {
    const [r] = mergeToPay([cost({ id: "a", currency: "IDR", costMinor: 100000, rateToHome: null })], OPTS);
    expect(r.homeMinor).toBeNull();
  });
  it("a paid row shows what was paid", () => {
    const [r] = mergeToPay([cost({ id: "a", costMinor: 10000, paidMinor: 8000, paidAt: new Date("2026-09-02") })], OPTS);
    expect(r.homeMinor).toBe(8000);
    expect(r.originalMinor).toBe(8000);
  });
  it("carries the label", () => {
    const [r] = mergeToPay([cost({ id: "a", displayLabel: "Rome apartment · balance" })], OPTS);
    expect(r.label).toBe("Rome apartment · balance");
  });
});
