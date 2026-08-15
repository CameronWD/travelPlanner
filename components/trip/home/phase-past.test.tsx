import { describe, it, expect, vi, beforeEach } from "vitest";

// phase-past.tsx is a heavy async server component with DB calls.
// We assert the fork-scoping of every plan-entity where-clause by mocking
// db per-model methods directly (mirrors server/actions/search.test.ts and
// the sibling phase-planning.test.tsx / phase-travelling.test.tsx).

const {
  stopFindManyMock,
  transportFindManyMock,
  accommodationFindManyMock,
  itemFindManyMock,
  costFindManyMock,
  exchangeRateFindManyMock,
  chapterFindManyMock,
  journalEntryCountMock,
  buildBudgetMock,
  buildSpendSoFarMock,
} = vi.hoisted(() => ({
  stopFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn(),
  accommodationFindManyMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  costFindManyMock: vi.fn(),
  exchangeRateFindManyMock: vi.fn(),
  chapterFindManyMock: vi.fn(),
  journalEntryCountMock: vi.fn(),
  buildBudgetMock: vi.fn(),
  buildSpendSoFarMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    stop: { findMany: stopFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    item: { findMany: itemFindManyMock },
    cost: { findMany: costFindManyMock },
    exchangeRate: { findMany: exchangeRateFindManyMock },
    chapter: { findMany: chapterFindManyMock },
    journalEntry: { count: journalEntryCountMock },
  },
}));
vi.mock("@/lib/dates", () => ({ nightsBetween: vi.fn() }));
vi.mock("@/lib/money", () => ({ formatMoney: vi.fn() }));
vi.mock("@/lib/budget", () => ({ buildBudget: buildBudgetMock, applyFxRatesToCosts: vi.fn() }));
vi.mock("@/lib/spend-so-far", () => ({ buildSpendSoFar: buildSpendSoFarMock }));
vi.mock("@/lib/chapters", () => ({ chapterForStop: vi.fn() }));
vi.mock("@/lib/chapter-colours", () => ({ chapterColourSwatch: vi.fn() }));
vi.mock("@/lib/cn", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/trip/route-map-loader", () => ({ RouteMapLoader: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
// React import needed for JSX in mocks above
import React from "react";

const { PAST_DESKTOP_GRID_CLASS, PhasePast } = await import("./phase-past");

describe("PhasePast desktop rail width", () => {
  it("desktop grid uses 21.25rem rail (340 px) matching the mockup spec", () => {
    expect(PAST_DESKTOP_GRID_CLASS).toContain("21.25rem");
  });
});

describe("PhasePast fork-scoped plan queries", () => {
  const baseTrip = {
    id: "trip-1",
    name: "Test Trip",
    startDate: "2026-01-01",
    endDate: "2026-01-10",
    homeCurrency: "GBP",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stopFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);
    exchangeRateFindManyMock.mockResolvedValue([]);
    chapterFindManyMock.mockResolvedValue([]);
    journalEntryCountMock.mockResolvedValue(0);
    buildBudgetMock.mockReturnValue({
      grandTotal: { costTotalMinor: 0, paidTotalMinor: 0 },
    });
    buildSpendSoFarMock.mockReturnValue({
      costTotalMinor: 0,
      paidSoFarMinor: 0,
      paidCostMinor: 0,
      varianceMinor: 0,
      costRemainingMinor: 0,
      tripElapsedPct: 100,
    });
  });

  async function renderPast() {
    await PhasePast({ tripId: "trip-1", trip: baseTrip });
  }

  it("scopes the stops query to the real plan", async () => {
    await renderPast();
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the transports query to the real plan", async () => {
    await renderPast();
    expect(transportFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the accommodations query to the real plan", async () => {
    await renderPast();
    expect(accommodationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the items query to the real plan", async () => {
    await renderPast();
    expect(itemFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the costs query to the real plan", async () => {
    await renderPast();
    expect(costFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the chapters query to the real plan", async () => {
    await renderPast();
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("leaves the trip-wide exchange-rate and journal queries unscoped by forkId", async () => {
    await renderPast();
    expect(exchangeRateFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1" } }),
    );
    expect(journalEntryCountMock).toHaveBeenCalledWith({ where: { tripId: "trip-1" } });
  });
});
