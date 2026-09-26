import { describe, it, expect } from "vitest";
import { buildUpcomingPayments, type UpcomingPaymentsInput } from "./upcoming-payments";

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
      today: "2026-09-14",
    });
    expect(rows).toEqual([
      {
        costId: "acc",
        label: "Hotel Lutetia",
        costMinor: 45000,
        currency: "EUR",
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
        today: "2026-09-14",
      }),
    ).toEqual([]);
  });
});
