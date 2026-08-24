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
const { RouteMapLoader } = await import("@/components/trip/route-map-loader");

// Server components aren't run through a renderer here (see file-header note),
// so a mocked child is never actually invoked. To assert its props without
// standing up a full render, walk the returned React element tree by hand.
function findElementByType(node: unknown, type: unknown): { props: Record<string, unknown> } | null {
  if (node == null || typeof node !== "object") return null;
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (el.type === type) return node as { props: Record<string, unknown> };
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElementByType(child, type);
      if (found) return found;
    }
    return null;
  }
  return findElementByType(children, type);
}

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
    chaptersEnabled: true,
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

  async function renderPast(tripOverrides: Partial<typeof baseTrip> = {}) {
    await PhasePast({ tripId: "trip-1", trip: { ...baseTrip, ...tripOverrides } });
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

describe("PhasePast route map order (ADR 0038)", () => {
  const baseTrip = {
    id: "trip-1",
    name: "Test Trip",
    startDate: "2026-01-01",
    endDate: "2026-01-10",
    homeCurrency: "GBP",
    chaptersEnabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);
    exchangeRateFindManyMock.mockResolvedValue([]);
    chapterFindManyMock.mockResolvedValue([]);
    journalEntryCountMock.mockResolvedValue(0);
    buildBudgetMock.mockReturnValue({ grandTotal: { costTotalMinor: 0, paidTotalMinor: 0 } });
    buildSpendSoFarMock.mockReturnValue({
      costTotalMinor: 0,
      paidSoFarMinor: 0,
      paidCostMinor: 0,
      varianceMinor: 0,
      costRemainingMinor: 0,
      tripElapsedPct: 100,
    });
  });

  async function renderPast(tripOverrides: Partial<typeof baseTrip> = {}) {
    return PhasePast({ tripId: "trip-1", trip: { ...baseTrip, ...tripOverrides } });
  }

  it("orders the route map's stops chronologically, not by raw sortOrder", async () => {
    // sortOrder says Rome (0) then Florence (1), but Florence's dates come first.
    stopFindManyMock.mockResolvedValue([
      {
        id: "rome", name: "Rome", lat: 41.9, lng: 12.5,
        timezone: "Europe/Rome", arriveDate: "2026-01-08", departDate: "2026-01-10", sortOrder: 0,
      },
      {
        id: "florence", name: "Florence", lat: 43.8, lng: 11.3,
        timezone: "Europe/Rome", arriveDate: "2026-01-01", departDate: "2026-01-03", sortOrder: 1,
      },
    ]);

    const tree = await renderPast();

    const routeMapEl = findElementByType(tree, RouteMapLoader);
    expect(routeMapEl).not.toBeNull();
    const stops = routeMapEl!.props.stops as Array<{ id: string }>;
    expect(stops.map((s) => s.id)).toEqual(["florence", "rome"]);
  });
});

describe("PhasePast chapter gating (Task 13)", () => {
  const baseTrip = {
    id: "trip-1",
    name: "Test Trip",
    startDate: "2026-01-01",
    endDate: "2026-01-10",
    homeCurrency: "GBP",
    chaptersEnabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stopFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);
    exchangeRateFindManyMock.mockResolvedValue([]);
    // Chapters exist in the DB regardless of the toggle — gating hides the
    // presentation, the data stays.
    chapterFindManyMock.mockResolvedValue([
      { id: "c1", name: "Chapter One", colour: "sky", startDate: "2026-01-01", endDate: "2026-01-10" },
    ]);
    journalEntryCountMock.mockResolvedValue(0);
    buildBudgetMock.mockReturnValue({ grandTotal: { costTotalMinor: 0, paidTotalMinor: 0 } });
    buildSpendSoFarMock.mockReturnValue({
      costTotalMinor: 0,
      paidSoFarMinor: 0,
      paidCostMinor: 0,
      varianceMinor: 0,
      costRemainingMinor: 0,
      tripElapsedPct: 100,
    });
  });

  async function renderPast(tripOverrides: Partial<typeof baseTrip> = {}) {
    await PhasePast({ tripId: "trip-1", trip: { ...baseTrip, ...tripOverrides } });
  }

  it("skips the chapters query when chaptersEnabled is false, and passes no chapters into the budget build", async () => {
    await renderPast({ chaptersEnabled: false });
    expect(chapterFindManyMock).not.toHaveBeenCalled();
    expect(buildBudgetMock).toHaveBeenCalledWith(
      expect.objectContaining({ chapters: [] }),
    );
  });

  it("runs the chapters query when chaptersEnabled is true and feeds it into the budget build", async () => {
    await renderPast({ chaptersEnabled: true });
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
    expect(buildBudgetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chapters: [expect.objectContaining({ id: "c1", name: "Chapter One" })],
      }),
    );
  });
});
