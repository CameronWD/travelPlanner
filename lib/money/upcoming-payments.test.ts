import { describe, it, expect } from "vitest";
import { buildUpcomingPayments, paymentAmountLabel, type UpcomingPaymentsInput } from "./upcoming-payments";

const cost = (o: Partial<UpcomingPaymentsInput["costs"][number]> & { id: string }): UpcomingPaymentsInput["costs"][number] => ({
  costMinor: 10000,
  currency: "AUD",
  paidAt: null,
  dueDate: null,
  ownerType: "OTHER",
  ownerId: null,
  label: "Cost",
  ...o,
});

describe("buildUpcomingPayments", () => {
  it("lists only unpaid costs with a due date, soonest first", () => {
    const rows = buildUpcomingPayments({
      costs: [
        cost({ id: "a", dueDate: "2026-11-20" }),
        cost({ id: "b", dueDate: "2026-10-01" }),
        cost({ id: "paid", dueDate: "2026-10-01", paidAt: new Date() }),
        cost({ id: "none", dueDate: null }),
      ],
      ownerNames: new Map(),
      homeCurrency: "AUD",
      today: "2026-09-14",
    });
    expect(rows.map((r) => r.costId)).toEqual(["b", "a"]);
  });

  it("leaves out an unpaid On the trip cost even when it has a due date", () => {
    const rows = buildUpcomingPayments({
      costs: [
        cost({ id: "before", dueDate: "2026-10-01", settlement: "BEFORE" }),
        cost({ id: "on-trip", dueDate: "2026-10-01", settlement: "ON_TRIP" }),
        cost({ id: "legacy", dueDate: "2026-10-02" }),
      ],
      ownerNames: new Map(),
      homeCurrency: "AUD",
      today: "2026-09-14",
    });
    expect(rows.map((r) => r.costId)).toEqual(["before", "legacy"]);
  });

  it("computes daysUntil including overdue as negative", () => {
    const rows = buildUpcomingPayments({
      costs: [
        cost({ id: "future", dueDate: "2026-09-17" }),
        cost({ id: "today", dueDate: "2026-09-14" }),
        cost({ id: "overdue", dueDate: "2026-09-10" }),
      ],
      ownerNames: new Map(),
      homeCurrency: "AUD",
      today: "2026-09-14",
    });
    const byId = new Map(rows.map((r) => [r.costId, r]));
    expect(byId.get("future")?.daysUntil).toBe(3);
    expect(byId.get("today")?.daysUntil).toBe(0);
    expect(byId.get("overdue")?.daysUntil).toBe(-4);
  });

  it("sorts by dueDate first, then by label when dates tie", () => {
    const rows = buildUpcomingPayments({
      costs: [
        cost({ id: "z", dueDate: "2026-10-01", label: "Zeppelin fees" }),
        cost({ id: "a", dueDate: "2026-10-01", label: "Airport transfer" }),
      ],
      ownerNames: new Map(),
      homeCurrency: "AUD",
      today: "2026-09-14",
    });
    expect(rows.map((r) => r.costId)).toEqual(["a", "z"]);
  });

  it("resolves each row's label, currency, and amount from the cost + owner-name map", () => {
    const rows = buildUpcomingPayments({
      costs: [
        cost({ id: "acc", dueDate: "2026-10-01", ownerType: "ACCOMMODATION", ownerId: "acc-1", label: null, costMinor: 45000, currency: "EUR" }),
      ],
      ownerNames: new Map([["acc-1", "Hotel Lutetia"]]),
      homeCurrency: "AUD",
      today: "2026-09-14",
    });
    expect(rows).toEqual([
      {
        costId: "acc",
        label: "Hotel Lutetia",
        costMinor: 45000,
        currency: "EUR",
        homeMinor: null,
        homeCurrency: "AUD",
        dueDate: "2026-10-01",
        daysUntil: 17,
      },
    ]);
  });

  it("returns an empty list when there is nothing unpaid and due", () => {
    expect(
      buildUpcomingPayments({
        costs: [cost({ id: "paid", dueDate: "2026-10-01", paidAt: new Date() })],
        ownerNames: new Map(),
        homeCurrency: "AUD",
        today: "2026-09-14",
      }),
    ).toEqual([]);
  });
});

describe("home-currency amount", () => {
  const run = (c: ReturnType<typeof cost>) =>
    buildUpcomingPayments({ costs: [c], ownerNames: new Map(), homeCurrency: "AUD", today: "2026-09-14" })[0];

  it("converts a foreign cost to the Home currency with its rate", () => {
    const r = run(cost({ id: "e", currency: "EUR", costMinor: 12000, rateToHome: 1.65, dueDate: "2026-12-03" }));
    expect(r.homeMinor).toBe(19800);
    expect(r.homeCurrency).toBe("AUD");
    expect(r.costMinor).toBe(12000);
    expect(r.currency).toBe("EUR");
  });

  it("leaves homeMinor null for a foreign cost with no rate", () => {
    const r = run(cost({ id: "e", currency: "EUR", rateToHome: null, dueDate: "2026-12-03" }));
    expect(r.homeMinor).toBeNull();
  });

  it("converts a zero-decimal currency through minor units", () => {
    const r = run(cost({ id: "j", currency: "JPY", costMinor: 10000, rateToHome: 0.011, dueDate: "2026-12-03" }));
    expect(r.homeMinor).toBe(11000);
  });

  it("treats a lower-case same currency as Home", () => {
    const r = run(cost({ id: "a", currency: "aud", dueDate: "2026-12-03" }));
    expect(r.homeMinor).toBe(10000);
  });
});

describe("paymentAmountLabel", () => {
  const fmt = (m: number, c: string) => `${c} ${m}`;

  it("shows Home first with the own amount in brackets for a foreign cost", () => {
    expect(paymentAmountLabel({ costMinor: 12000, currency: "EUR", homeMinor: 19800, homeCurrency: "AUD" }, fmt)).toBe("AUD 19800 (EUR 12000)");
  });

  it("falls back to the own amount with no Home amount", () => {
    expect(paymentAmountLabel({ costMinor: 12000, currency: "EUR", homeMinor: null, homeCurrency: "AUD" }, fmt)).toBe("EUR 12000");
  });

  it("shows only the own amount when the currency is Home", () => {
    expect(paymentAmountLabel({ costMinor: 10000, currency: "aud", homeMinor: 10000, homeCurrency: "AUD" }, fmt)).toBe("aud 10000");
  });
});
