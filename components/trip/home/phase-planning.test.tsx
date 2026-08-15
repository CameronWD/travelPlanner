import { describe, it, expect, vi, beforeEach } from "vitest";

// phase-planning.tsx is a heavy async server component with DB calls.
// We test the desktop grid className via an exported constant so we can assert
// the correct rail width without standing up the full DB/RSC stack.
// We also assert the fork-scoping of every plan-entity where-clause by mocking
// db per-model methods directly (mirrors server/actions/search.test.ts).

const {
  stopFindManyMock,
  stopCountMock,
  transportFindManyMock,
  accommodationFindManyMock,
  itemFindManyMock,
  costFindManyMock,
  exchangeRateFindManyMock,
  chapterFindManyMock,
  chapterCountMock,
  checklistItemCountMock,
  buildBudgetMock,
  getTripProjectionMock,
} = vi.hoisted(() => ({
  stopFindManyMock: vi.fn(),
  stopCountMock: vi.fn(),
  transportFindManyMock: vi.fn(),
  accommodationFindManyMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  costFindManyMock: vi.fn(),
  exchangeRateFindManyMock: vi.fn(),
  chapterFindManyMock: vi.fn(),
  chapterCountMock: vi.fn(),
  checklistItemCountMock: vi.fn(),
  buildBudgetMock: vi.fn(),
  getTripProjectionMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    stop: { findMany: stopFindManyMock, count: stopCountMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    item: { findMany: itemFindManyMock },
    cost: { findMany: costFindManyMock },
    exchangeRate: { findMany: exchangeRateFindManyMock },
    chapter: { findMany: chapterFindManyMock, count: chapterCountMock },
    checklistItem: { count: checklistItemCountMock },
  },
}));
vi.mock("@/lib/dates", () => ({ daysBetween: vi.fn() }));
vi.mock("@/lib/trip-phase", () => ({ describePhase: vi.fn() }));
vi.mock("@/lib/flags", () => ({ detectFlags: vi.fn() }));
vi.mock("@/lib/budget", () => ({ buildBudget: buildBudgetMock, applyFxRatesToCosts: vi.fn() }));
vi.mock("@/lib/next-steps", () => ({ buildNextSteps: vi.fn() }));
vi.mock("@/lib/home-base", () => ({ tripHomeBase: vi.fn(), hasOutboundLeg: vi.fn(), hasReturnLeg: vi.fn() }));
vi.mock("@/server/actions/stops", () => ({ getTripProjection: getTripProjectionMock }));
vi.mock("@/lib/chapters", () => ({ chapterForStop: vi.fn() }));
vi.mock("@/lib/chapter-colours", () => ({ chapterColourSwatch: vi.fn() }));
vi.mock("@/components/trip/home/countdown-hero", () => ({ CountdownHero: () => null }));
vi.mock("@/components/trip/home/next-steps-card", () => ({ NextStepsCard: () => null }));
vi.mock("@/components/trip/home/budget-glance", () => ({ BudgetGlance: () => null }));
vi.mock("@/components/trip/home/quick-actions", () => ({ QuickActions: () => null }));
vi.mock("@/components/trip/route-map-loader", () => ({ RouteMapLoader: () => null }));

const { PLANNING_DESKTOP_GRID_CLASS, PhasePlanning } = await import("./phase-planning");

describe("PhasePlanning desktop rail width", () => {
  it("desktop grid uses 21.25rem rail (340 px) matching the mockup spec", () => {
    expect(PLANNING_DESKTOP_GRID_CLASS).toContain("21.25rem");
  });
});

describe("PhasePlanning fork-scoped plan queries", () => {
  const baseTrip = {
    id: "trip-1",
    name: "Test Trip",
    startDate: "2026-01-01",
    endDate: "2026-01-10",
    homeCurrency: "GBP",
    drivingWindingFactor: 1.3,
    drivingAvgSpeedKph: 80,
    homeName: null,
    homeLat: null,
    homeLng: null,
    homeCountryCode: null,
    roundTrip: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stopFindManyMock.mockResolvedValue([]);
    stopCountMock.mockResolvedValue(0);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);
    exchangeRateFindManyMock.mockResolvedValue([]);
    chapterFindManyMock.mockResolvedValue([]);
    chapterCountMock.mockResolvedValue(0);
    checklistItemCountMock.mockResolvedValue(0);
    buildBudgetMock.mockReturnValue({ grandTotal: { costTotalMinor: 0, paidTotalMinor: 0 } });
    getTripProjectionMock.mockResolvedValue({ projectedEnd: null, hardEndDate: null });
  });

  async function renderPlanning() {
    await PhasePlanning({
      tripId: "trip-1",
      trip: baseTrip,
      today: "2026-01-05",
      phase: "planning",
    });
  }

  it("scopes both stop queries (dated stops + all stops) to the real plan", async () => {
    await renderPlanning();
    expect(stopFindManyMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const call of stopFindManyMock.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }));
    }
  });

  it("scopes the rough-stop count to the real plan", async () => {
    await renderPlanning();
    expect(stopCountMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the transports query to the real plan", async () => {
    await renderPlanning();
    expect(transportFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the accommodations query to the real plan", async () => {
    await renderPlanning();
    expect(accommodationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the items query to the real plan", async () => {
    await renderPlanning();
    expect(itemFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the costs query to the real plan", async () => {
    await renderPlanning();
    expect(costFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the chapters query and the undated-chapter count to the real plan", async () => {
    await renderPlanning();
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
    expect(chapterCountMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("leaves the trip-wide exchange-rate and checklist queries unscoped by forkId", async () => {
    await renderPlanning();
    expect(exchangeRateFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1" } }),
    );
    expect(checklistItemCountMock).toHaveBeenCalled();
    for (const call of checklistItemCountMock.mock.calls) {
      expect(call[0].where).not.toHaveProperty("forkId");
    }
  });
});
