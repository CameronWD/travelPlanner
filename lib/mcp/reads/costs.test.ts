import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convertMinor } from "@/lib/money";

const { requireTripAccess, tripFindUnique, costFindMany, exchangeRateFindMany, stopFindMany, itemFindMany } = vi.hoisted(
  () => ({
    requireTripAccess: vi.fn(),
    tripFindUnique: vi.fn(),
    costFindMany: vi.fn(),
    exchangeRateFindMany: vi.fn(),
    stopFindMany: vi.fn(),
    itemFindMany: vi.fn(),
  }),
);

vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: tripFindUnique },
    cost: { findMany: costFindMany },
    exchangeRate: { findMany: exchangeRateFindMany },
    stop: { findMany: stopFindMany },
    item: { findMany: itemFindMany },
  },
}));

import { loadCostsForMcp } from "./costs";

const TRIP_ID = "trip-1";

function baseCost(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "c1",
    costMinor: 54000,
    paidMinor: null,
    currency: "EUR",
    rateToHome: null,
    paidAt: null,
    dueDate: null,
    ownerType: "OTHER",
    ownerId: null,
    label: "Dinner",
    category: null,
    settlement: "BEFORE",
    ...overrides,
  };
}

describe("loadCostsForMcp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T12:00:00Z"));
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    tripFindUnique.mockResolvedValue({ homeCurrency: "AUD" });
    costFindMany.mockResolvedValue([]);
    exchangeRateFindMany.mockResolvedValue([]);
    stopFindMany.mockResolvedValue([]);
    itemFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("lists each cost with own-currency and home amounts (EUR 540.00 at rateToHome 1.6187 -> AUD home)", async () => {
    costFindMany.mockResolvedValue([baseCost({ rateToHome: 1.6187 })]);
    const { costs } = await loadCostsForMcp(TRIP_ID, {});
    const expectedHomeMinor = convertMinor(54000, "EUR", "AUD", 1.6187);
    expect(costs[0]!.amount).toEqual({ minor: 54000, currency: "EUR", formatted: "540.00" });
    expect(costs[0]!.home).toEqual({
      minor: expectedHomeMinor,
      currency: "AUD",
      formatted: (expectedHomeMinor / 100).toFixed(2),
    });
  });

  it("a foreign cost with no rate has home: null and still lists", async () => {
    costFindMany.mockResolvedValue([baseCost({ id: "c-noRate", currency: "JPY", costMinor: 500000, rateToHome: null })]);
    exchangeRateFindMany.mockResolvedValue([]);
    const { costs } = await loadCostsForMcp(TRIP_ID, {});
    expect(costs).toHaveLength(1);
    expect(costs[0]!.id).toBe("c-noRate");
    expect(costs[0]!.home).toBeNull();
  });

  it("a cost with no snapshot rate has home: null even when the trip has a rate table (matches the Budget)", async () => {
    costFindMany.mockResolvedValue([baseCost({ currency: "EUR", costMinor: 10000, rateToHome: null })]);
    exchangeRateFindMany.mockResolvedValue([{ base: "EUR", quote: "AUD", rate: 1.7 }]);
    const { costs } = await loadCostsForMcp(TRIP_ID, {});
    expect(costs[0]!.home).toBeNull();
  });

  it("paid costs carry paid amount and date; unpaid carry dueDate and daysUntilDue", async () => {
    costFindMany.mockResolvedValue([
      baseCost({
        id: "c-paid",
        currency: "AUD",
        costMinor: 20000,
        paidMinor: 19500,
        paidAt: new Date("2026-11-20T00:00:00Z"),
      }),
      baseCost({ id: "c-unpaid", currency: "AUD", costMinor: 5000, dueDate: "2026-12-10" }),
    ]);
    const { costs, today } = await loadCostsForMcp(TRIP_ID, {});
    expect(today).toBe("2026-12-01");
    const paid = costs.find((c) => c.id === "c-paid")!;
    expect(paid.paid).toEqual({ minor: 19500, formatted: "195.00", on: "2026-11-20" });
    expect(paid.dueDate).toBeNull();
    expect(paid.daysUntilDue).toBeNull();

    const unpaid = costs.find((c) => c.id === "c-unpaid")!;
    expect(unpaid.paid).toBeNull();
    expect(unpaid.dueDate).toBe("2026-12-10");
    expect(unpaid.daysUntilDue).toBe(9);
  });

  it("names owners; a cost whose owner is gone reads (removed)", async () => {
    costFindMany.mockResolvedValue([
      baseCost({ id: "c-item", ownerType: "ITEM", ownerId: "item-gone", currency: "AUD" }),
    ]);
    itemFindMany.mockImplementation(({ where }: { where: { id?: unknown } }) => {
      // The two item.findMany calls: one for effectiveCategory's lookup (no id
      // filter), one inside loadOwners (id: { in: [...] }) that finds nothing.
      if (where?.id) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    const { costs } = await loadCostsForMcp(TRIP_ID, {});
    expect(costs[0]!.owner).toEqual({ kind: "ITEM", label: "(removed)" });
  });

  it("names a live owner", async () => {
    costFindMany.mockResolvedValue([
      baseCost({ id: "c-item2", ownerType: "ITEM", ownerId: "item-live", currency: "AUD" }),
    ]);
    itemFindMany.mockImplementation(({ where }: { where: { id?: { in: string[] } } }) => {
      if (where?.id) {
        return Promise.resolve([{ id: "item-live", title: "Vatican tour", stopId: null, date: null, forkId: null }]);
      }
      return Promise.resolve([{ id: "item-live", category: "SIGHTSEEING" }]);
    });
    const { costs } = await loadCostsForMcp(TRIP_ID, {});
    expect(costs[0]!.owner).toEqual({ kind: "ITEM", label: "Thing to do: Vatican tour (Wishlist)" });
  });

  it("an OTHER cost with no ownerId uses its label, falling back to 'Other cost'", async () => {
    costFindMany.mockResolvedValue([
      baseCost({ id: "c-other", ownerType: "OTHER", ownerId: null, label: "Travel insurance", currency: "AUD" }),
      baseCost({ id: "c-other-nolabel", ownerType: "OTHER", ownerId: null, label: null, currency: "AUD" }),
    ]);
    const { costs } = await loadCostsForMcp(TRIP_ID, {});
    expect(costs.find((c) => c.id === "c-other")!.owner).toEqual({ kind: "OTHER", label: "Travel insurance" });
    expect(costs.find((c) => c.id === "c-other-nolabel")!.owner).toEqual({ kind: "OTHER", label: "Other cost" });
  });

  it("unpaidOnly drops paid costs", async () => {
    costFindMany.mockResolvedValue([
      baseCost({ id: "c-paid", currency: "AUD", paidMinor: 100, paidAt: new Date("2026-11-01T00:00:00Z") }),
      baseCost({ id: "c-unpaid", currency: "AUD" }),
    ]);
    const { costs } = await loadCostsForMcp(TRIP_ID, { unpaidOnly: true });
    expect(costs.map((c) => c.id)).toEqual(["c-unpaid"]);
  });

  it("dueWithinDays keeps unpaid costs due within N days, overdue included, and drops undated", async () => {
    costFindMany.mockResolvedValue([
      baseCost({ id: "c-soon", currency: "AUD", dueDate: "2026-12-05" }), // in 4 days
      baseCost({ id: "c-overdue", currency: "AUD", dueDate: "2026-11-20" }), // -11 days
      baseCost({ id: "c-far", currency: "AUD", dueDate: "2026-12-20" }), // 19 days, outside N=10
      baseCost({ id: "c-undated", currency: "AUD", dueDate: null }),
      baseCost({
        id: "c-paid-due-soon",
        currency: "AUD",
        dueDate: "2026-12-03",
        paidMinor: 100,
        paidAt: new Date("2026-11-01T00:00:00Z"),
      }),
    ]);
    const { costs } = await loadCostsForMcp(TRIP_ID, { dueWithinDays: 10 });
    expect(costs.map((c) => c.id).sort()).toEqual(["c-overdue", "c-soon"].sort());
  });

  it("orders due-dated costs soonest first, then the rest in createdAt order", async () => {
    // costFindMany is ordered by createdAt asc already (as loadBudget does) —
    // the mock's array order below IS that createdAt order.
    costFindMany.mockResolvedValue([
      baseCost({ id: "c-undated-1", currency: "AUD" }),
      baseCost({ id: "c-due-later", currency: "AUD", dueDate: "2026-12-20" }),
      baseCost({ id: "c-undated-2", currency: "AUD" }),
      baseCost({ id: "c-due-soon", currency: "AUD", dueDate: "2026-12-05" }),
      baseCost({
        id: "c-paid",
        currency: "AUD",
        dueDate: "2026-12-02",
        paidMinor: 100,
        paidAt: new Date("2026-11-01T00:00:00Z"),
      }),
    ]);
    const { costs } = await loadCostsForMcp(TRIP_ID, {});
    expect(costs.map((c) => c.id)).toEqual([
      "c-due-soon",
      "c-due-later",
      "c-undated-1",
      "c-undated-2",
      "c-paid",
    ]);
  });

  it("is real plan only and access-checked first", async () => {
    await loadCostsForMcp(TRIP_ID, {});
    const accessOrder = requireTripAccess.mock.invocationCallOrder[0]!;
    expect(costFindMany.mock.invocationCallOrder[0]!).toBeGreaterThan(accessOrder);
    expect(costFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: TRIP_ID, forkId: null }) }),
    );
    expect(stopFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: TRIP_ID, forkId: null }) }),
    );
  });
});
