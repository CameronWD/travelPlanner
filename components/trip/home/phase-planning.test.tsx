import { describe, it, expect, vi, beforeEach } from "vitest";
// React import needed for JSX in the reminders-slot test below.
import React from "react";

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
vi.mock("@/components/trip/upcoming-payments-card", () => ({ UpcomingPaymentsCard: () => null }));
// Task 16 (spec H4): the tile grids are wrapped in AnimatedList/AnimatedItem
// for a staggered mount. Real (unmocked) passthroughs here so the tree-walk
// helpers below still find the wrapped elements and the renderToStaticMarkup
// tests still see the forwarded className/data-testid — mirrors the mock in
// app/(app)/trips/page.test.tsx, but forwards props (via ...rest) since this
// file's tests query on data-testid/className.
vi.mock("@/components/ui/animated-list", () => ({
  AnimatedList: ({
    children,
    className,
    ...rest
  }: { children?: React.ReactNode; className?: string } & Record<string, unknown>) => (
    <div className={className} {...rest}>{children}</div>
  ),
  AnimatedItem: ({
    children,
    className,
    as = "div",
  }: {
    children?: React.ReactNode;
    className?: string;
    as?: string;
    index?: number;
  }) => React.createElement(as, { className }, children),
}));

const { PLANNING_DESKTOP_GRID_CLASS, PhasePlanning } = await import("./phase-planning");
const { AnimatedItem } = await import("@/components/ui/animated-list");
const { RouteMapLoader } = await import("@/components/trip/route-map-loader");
const { UpcomingPaymentsCard } = await import("@/components/trip/upcoming-payments-card");

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

describe("PhasePlanning desktop tile grid (spec E1)", () => {
  it("uses the kit DHome three-column grid, two rows of tiles beside the hero", () => {
    expect(PLANNING_DESKTOP_GRID_CLASS).toBe(
      "grid grid-cols-1 gap-3.5 lg:grid-cols-3 lg:grid-rows-[auto_auto] lg:items-stretch",
    );
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
    chaptersEnabled: true,
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

  async function renderPlanning(tripOverrides: Partial<typeof baseTrip> = {}) {
    await PhasePlanning({
      tripId: "trip-1",
      trip: { ...baseTrip, ...tripOverrides },
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

describe("PhasePlanning route map order (ADR 0038)", () => {
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
    chaptersEnabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
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

  async function renderPlanning(tripOverrides: Partial<typeof baseTrip> = {}) {
    return PhasePlanning({
      tripId: "trip-1",
      trip: { ...baseTrip, ...tripOverrides },
      today: "2026-01-05",
      phase: "planning",
    });
  }

  it("orders the route map's stops chronologically, not by raw sortOrder", async () => {
    // sortOrder says Rome (0) then Florence (1), but Florence's dates come first.
    stopFindManyMock
      .mockResolvedValueOnce([
        {
          id: "rome", name: "Rome", country: "IT", lat: 41.9, lng: 12.5,
          timezone: "Europe/Rome", arriveDate: "2026-01-08", departDate: "2026-01-10", sortOrder: 0,
        },
        {
          id: "florence", name: "Florence", country: "IT", lat: 43.8, lng: 11.3,
          timezone: "Europe/Rome", arriveDate: "2026-01-01", departDate: "2026-01-03", sortOrder: 1,
        },
      ])
      .mockResolvedValueOnce([]); // allStopsRaw — order irrelevant here

    const tree = await renderPlanning();

    const routeMapEl = findElementByType(tree, RouteMapLoader);
    expect(routeMapEl).not.toBeNull();
    const stops = routeMapEl!.props.stops as Array<{ id: string }>;
    expect(stops.map((s) => s.id)).toEqual(["florence", "rome"]);
  });
});

describe("PhasePlanning chapter gating (Task 13)", () => {
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
    chaptersEnabled: true,
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
    // Chapters exist in the DB regardless of the toggle — gating hides the
    // presentation, the data stays.
    chapterFindManyMock.mockResolvedValue([
      { id: "c1", name: "Chapter One", colour: "sky", startDate: "2026-01-01", endDate: "2026-01-10" },
    ]);
    chapterCountMock.mockResolvedValue(2);
    checklistItemCountMock.mockResolvedValue(0);
    buildBudgetMock.mockReturnValue({ grandTotal: { costTotalMinor: 0, paidTotalMinor: 0 } });
    getTripProjectionMock.mockResolvedValue({ projectedEnd: null, hardEndDate: null });
  });

  async function renderPlanning(tripOverrides: Partial<typeof baseTrip> = {}) {
    await PhasePlanning({
      tripId: "trip-1",
      trip: { ...baseTrip, ...tripOverrides },
      today: "2026-01-05",
      phase: "planning",
    });
  }

  it("skips both chapter queries when chaptersEnabled is false, and passes no chapters into the budget build", async () => {
    await renderPlanning({ chaptersEnabled: false });
    expect(chapterFindManyMock).not.toHaveBeenCalled();
    expect(chapterCountMock).not.toHaveBeenCalled();
    expect(buildBudgetMock).toHaveBeenCalledWith(
      expect.objectContaining({ chapters: [] }),
    );
  });

  it("runs both chapter queries when chaptersEnabled is true and feeds them into the budget build", async () => {
    await renderPlanning({ chaptersEnabled: true });
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
    expect(chapterCountMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
    expect(buildBudgetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chapters: [
          expect.objectContaining({ id: "c1", name: "Chapter One" }),
        ],
      }),
    );
  });
});

describe("PhasePlanning upcoming payments mount", () => {
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
    chaptersEnabled: true,
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

  async function renderPlanning(tripOverrides: Partial<typeof baseTrip> = {}) {
    return PhasePlanning({
      tripId: "trip-1",
      trip: { ...baseTrip, ...tripOverrides },
      today: "2026-01-05",
      phase: "planning",
    });
  }

  it("mounts UpcomingPaymentsCard in the right rail, fed by unpaid dated costs", async () => {
    costFindManyMock.mockResolvedValue([
      {
        id: "c1",
        costMinor: 1000,
        currency: "GBP",
        paidAt: null,
        dueDate: "2026-01-08",
        ownerType: "OTHER",
        ownerId: null,
        label: "Deposit",
      },
    ]);

    const tree = await renderPlanning();

    const el = findElementByType(tree, UpcomingPaymentsCard);
    expect(el).not.toBeNull();
    expect(el!.props.tripId).toBe("trip-1");
    expect((el!.props.payments as unknown[]).length).toBe(1);
  });

  it("passes an empty payments list through when nothing is unpaid-with-a-due-date", async () => {
    const tree = await renderPlanning();

    const el = findElementByType(tree, UpcomingPaymentsCard);
    expect(el).not.toBeNull();
    expect(el!.props.payments).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Playground kit restyle (Task 10b) — kit DHome.jsx / Home.jsx "Planning"
// ---------------------------------------------------------------------------

describe("PhasePlanning Playground kit restyle (Task 10b)", () => {
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
    chaptersEnabled: false,
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

  const render = () =>
    PhasePlanning({ tripId: "trip-1", trip: baseTrip, today: "2025-12-01", phase: "planning" });

  const DATED = [
    { id: "a", name: "Rome", country: "Italy", lat: 41.9, lng: 12.5, timezone: "Europe/Rome", arriveDate: "2026-01-01", departDate: "2026-01-05", sortOrder: 0 },
  ];

  it("leads the tile grid with the countdown hero, the cover tile beside it (kit DHome grid)", async () => {
    const { CountdownHero } = await import("@/components/trip/home/countdown-hero");
    const tree = await PhasePlanning({
      tripId: "trip-1",
      trip: baseTrip,
      today: "2025-12-01",
      phase: "planning",
      cover: <div data-testid="cover-tile" />,
    });
    const g = findByTestId(tree, "planning-desktop-grid")!;
    const kids = ([] as unknown[]).concat(g.props.children).filter(Boolean) as {
      type: unknown;
      props: { children?: unknown };
    }[];
    // Task 16: every tile is now wrapped in an AnimatedItem for the mount stagger.
    expect(kids[0].type).toBe(AnimatedItem);
    expect((kids[0].props.children as { type: unknown }).type).toBe(CountdownHero);
    expect(kids[1].type).toBe(AnimatedItem);
    expect((kids[1].props.children as { props: Record<string, unknown> }).props["data-testid"]).toBe(
      "cover-tile",
    );
  });

  it("wraps the desktop tile grid and the tile row in AnimatedList with staggerOnMount (spec H4)", async () => {
    const { AnimatedList } = await import("@/components/ui/animated-list");
    const tree = await render();
    const grid = findByTestId(tree, "planning-desktop-grid")!;
    const row = findByTestId(tree, "planning-tile-row")!;
    expect((grid as unknown as { type: unknown }).type).toBe(AnimatedList);
    expect((grid.props as Record<string, unknown>).staggerOnMount).toBe(true);
    expect((row as unknown as { type: unknown }).type).toBe(AnimatedList);
    expect((row.props as Record<string, unknown>).staggerOnMount).toBe(true);
  });

  it("renders three StatTiles beside the hero: Cost so far, Next payment, Reminders", async () => {
    const { StatTile } = await import("@/components/trip/home/stat-tile");
    const tree = await render();
    const g = findByTestId(tree, "planning-desktop-grid")!;
    const tiles = findAllByType(g, StatTile);
    expect(tiles.map((t) => t.props.label)).toEqual(["Cost so far", "Next payment", "Reminders"]);
  });

  it("feeds the stat tiles from the data the home already loads (budget, upcoming payments, reminders)", async () => {
    const { StatTile } = await import("@/components/trip/home/stat-tile");
    buildBudgetMock.mockReturnValue({ grandTotal: { costTotalMinor: 120000, paidTotalMinor: 30000 } });
    costFindManyMock.mockResolvedValue([
      {
        id: "c1", costMinor: 5000, currency: "GBP", paidAt: null, dueDate: "2025-12-08",
        ownerType: "OTHER", ownerId: null, label: "Deposit",
      },
    ]);
    const tree = await PhasePlanning({
      tripId: "trip-1",
      trip: baseTrip,
      today: "2025-12-01",
      phase: "planning",
      reminderItems: [
        { id: "r1", title: "Book the ferry", date: "2025-12-03", stopId: null, stopName: null },
        { id: "r2", title: "Renew passport", date: "2025-12-09", stopId: null, stopName: null },
      ],
    });
    const { renderToStaticMarkup } = await import("react-dom/server");
    const [cost, next, rem] = findAllByType(tree, StatTile);
    const html = (el: unknown) => renderToStaticMarkup(el as Parameters<typeof renderToStaticMarkup>[0]);
    expect(html(cost)).toMatch(/1,200|1\.2k/);
    expect(html(next)).toContain("Deposit");
    expect(html(rem)).toContain(">2<");
    expect(html(rem)).toContain("Book the ferry");
  });

  it("draws the home map at a 4/3 tile aspect, not a fixed full-width height", async () => {
    stopFindManyMock.mockImplementation((args: { select?: { lat?: boolean } }) =>
      Promise.resolve(args.select?.lat ? DATED : [{ id: "a", name: "Rome", sortOrder: 0 }]),
    );
    const map = findElementByType(await render(), RouteMapLoader);
    expect(map).not.toBeNull();
    expect(map!.props.aspect).toBe("4/3");
    expect(map!.props.height).toBeUndefined();
  });

  it("keeps the phone order: hero, cover, route, next steps, money, actions, reminders", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { NextStepsCard } = await import("@/components/trip/home/next-steps-card");
    const { BudgetGlance } = await import("@/components/trip/home/budget-glance");
    const { QuickActions } = await import("@/components/trip/home/quick-actions");
    const { CountdownHero } = await import("@/components/trip/home/countdown-hero");
    stopFindManyMock.mockImplementation((args: { select?: { lat?: boolean } }) =>
      Promise.resolve(args.select?.lat ? DATED : [{ id: "a", name: "Rome", sortOrder: 0 }]),
    );
    const tree = await PhasePlanning({
      tripId: "trip-1",
      trip: baseTrip,
      today: "2025-12-01",
      phase: "planning",
      cover: <div data-testid="cover-tile" />,
      reminders: <div data-testid="reminders" />,
    });
    // Visible-on-phone order = DOM order minus the lg-only stat tiles.
    const order = flattenTypes(tree);
    const idx = (t: unknown) => order.indexOf(t);
    expect(idx(CountdownHero)).toBeLessThan(idx("cover-tile"));
    expect(idx("cover-tile")).toBeLessThan(idx(RouteMapLoader));
    expect(idx(RouteMapLoader)).toBeLessThan(idx(NextStepsCard));
    expect(idx(NextStepsCard)).toBeLessThan(idx(BudgetGlance));
    expect(idx(BudgetGlance)).toBeLessThan(idx(QuickActions));
    expect(idx(QuickActions)).toBeLessThan(idx("reminders"));
    // The stat tiles are the desktop's money; on a phone the money cards keep their slot.
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup(tree as Parameters<typeof renderToStaticMarkup>[0]);
    for (const tile of Array.from(div.querySelectorAll("[data-stat-tile]"))) {
      expect(tile.className).toMatch(/(^|\s)hidden(\s|$)/);
      expect(tile.className.split(/\s+/)).toContain("lg:flex");
      expect(tile.className).not.toContain("lg:block");
    }
    expect(div.querySelector("[data-home-money]")!.className).toContain("lg:hidden");
  });

  it("renders the route map bare — it draws its own kit frame, so no Card doubles the outline", async () => {
    stopFindManyMock.mockImplementation((args: { select?: { lat?: boolean } }) =>
      Promise.resolve(args.select?.lat ? DATED : [{ id: "a", name: "Rome", sortOrder: 0 }]),
    );
    const { Card } = await import("@/components/ui/card");
    const tree = await render();
    expect(findElementByType(tree, RouteMapLoader)).not.toBeNull();
    const parent = findParentOf(tree, RouteMapLoader);
    expect(parent?.type).not.toBe(Card);
  });

  it("renders the kit empty treatment in place of the route map when no stop has dates", async () => {
    const { EmptyState } = await import("@/components/ui/empty-state");
    const empty = findElementByType(await render(), EmptyState);
    expect(empty).not.toBeNull();
    expect(empty!.props.title).toBe("No stops yet");
    expect(findElementByType(await render(), RouteMapLoader)).toBeNull();
  });

  it("never frames money per person — shared pot only", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup((await render()) as Parameters<typeof renderToStaticMarkup>[0]);
    expect(html).not.toMatch(/per person|each owes|split/i);
  });
});

// ---------------------------------------------------------------------------
// Reminders slot (Task 5 — LA-029/045)
// ---------------------------------------------------------------------------

describe("PhasePlanning reminders slot (LA-029/045)", () => {
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
    chaptersEnabled: true,
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

  it("renders the Reminders card last, full width below the tile grids (spec E1)", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const tree = await PhasePlanning({
      tripId: "trip-1",
      trip: baseTrip,
      today: "2026-01-05",
      phase: "planning",
      reminders: <div data-testid="reminders" />,
    });
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup(tree as Parameters<typeof renderToStaticMarkup>[0]);
    const marker = div.querySelector('[data-testid="reminders"]');
    expect(marker).not.toBeNull();
    expect(marker!.closest("[data-testid='planning-desktop-grid']")).toBeNull();
    expect(marker!.closest("[data-testid='planning-tile-row']")).toBeNull();
    expect(marker!.parentElement!.lastElementChild).toBe(marker);
  });
});

function findByTestId(node: unknown, id: string): { props: Record<string, unknown> } | null {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findByTestId(n, id);
      if (f) return f;
    }
    return null;
  }
  const el = node as { props?: Record<string, unknown> };
  if (el.props?.["data-testid"] === id) return el as { props: Record<string, unknown> };
  return findByTestId(el.props?.children, id);
}

/** The nearest element whose direct children include an element of `type`. */
function findParentOf(node: unknown, type: unknown): { type?: unknown } | null {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findParentOf(n, type);
      if (f) return f;
    }
    return null;
  }
  const el = node as { type?: unknown; props?: { children?: unknown } };
  const kids = ([] as unknown[]).concat(el.props?.children ?? []);
  if (kids.some((k) => k && typeof k === "object" && (k as { type?: unknown }).type === type)) return el;
  return findParentOf(el.props?.children, type);
}

function findAllByType(node: unknown, type: unknown): { props: Record<string, unknown> }[] {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((n) => findAllByType(n, type));
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (el.type === type) return [node as { props: Record<string, unknown> }];
  return findAllByType(el.props?.children, type);
}

/** Depth-first element order: component types, plus data-testid markers. */
function flattenTypes(node: unknown): unknown[] {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(flattenTypes);
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  const self: unknown[] = [];
  if (typeof el.type === "function" || (typeof el.type === "object" && el.type !== null)) self.push(el.type);
  const tid = el.props?.["data-testid"];
  if (typeof tid === "string") self.push(tid);
  return [...self, ...flattenTypes(el.props?.children)];
}
