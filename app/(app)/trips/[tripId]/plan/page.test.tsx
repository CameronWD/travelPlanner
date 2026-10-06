import { describe, it, expect, vi, beforeEach } from "vitest";
// React import needed for JSX in the rail mocks below (vi.mock calls
// are hoisted above every import, so this being written before or after
// them doesn't change execution order — top-of-file here for readability).
import React from "react";

// plan/page.tsx is a heavy async server component with DB calls. We assert
// the sticky-aside className via an exported constant, and exercise the
// zero-stops-vs-stops rendering split (Task 5 — LA-038, Review Focus #5)
// with the db layer mocked, mirroring the sibling home/phase-*.test.tsx and
// budget/page.test.tsx.

const mockDb = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  fork: { findFirst: vi.fn() },
  stop: { findMany: vi.fn() },
  transport: { findMany: vi.fn() },
  cost: { findMany: vi.fn() },
  chapter: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
  attachment: { findMany: vi.fn() },
  note: { findMany: vi.fn() },
  reminder: { findMany: vi.fn() },
  dayTitle: { findMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(async () => ({
    user: { id: "owner-1", email: "owner@example.com" },
    membership: { userId: "owner-1", role: "owner" },
  })),
  isTripOwnerOrAdmin: vi.fn(() => true),
}));
// Task 7: capture the props ItineraryManager is rendered with, so the
// remindersByStopId grouping can be asserted without a real DOM for it (the
// mock still renders null — every other test in this file relies on that).
const itineraryManagerCapture = vi.hoisted(() => ({
  props: undefined as Record<string, unknown> | undefined,
}));
vi.mock("@/components/trip/itinerary-manager", () => ({
  ItineraryManager: (props: Record<string, unknown>) => {
    itineraryManagerCapture.props = props;
    return null;
  },
}));
// The rail's pieces are covered by their own tests; here only their slot and
// the props the page builds for them matter.
const railCapture = vi.hoisted(() => ({
  jumpList: undefined as Record<string, unknown> | undefined,
  planBody: undefined as Record<string, unknown> | undefined,
  mapButton: undefined as Record<string, unknown> | undefined,
  fitTile: undefined as Record<string, unknown> | undefined,
}));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => null }));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: vi.fn(async () => "trip-1") }));
vi.mock("@/lib/ai", () => ({ isAiConfigured: () => false }));
vi.mock("@/components/plan/fit-tile", () => ({
  FitTile: (props: Record<string, unknown>) => {
    railCapture.fitTile = props;
    return <div data-testid="fit-tile" />;
  },
  FitStrip: () => null,
}));
vi.mock("@/components/plan/jump-list", () => ({
  JumpList: (props: Record<string, unknown>) => {
    railCapture.jumpList = props;
    return <div data-testid="jump-list" />;
  },
}));
vi.mock("@/components/plan/plan-mini-map", () => ({
  PlanMapButton: (props: Record<string, unknown>) => {
    railCapture.mapButton = props;
    return <div data-testid="map-button" />;
  },
  PlanMapDialog: () => null,
}));
vi.mock("@/components/plan/plan-body", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/plan/plan-body")>();
  return {
    ...actual,
    PlanBody: (props: React.ComponentProps<typeof actual.PlanBody>) => {
      railCapture.planBody = props;
      return <actual.PlanBody {...props} />;
    },
  };
});
vi.mock("@/components/trip/variant-banner", () => ({ VariantBanner: () => null }));

const { PLAN_ASIDE_CLASS, PLAN_GRID_CLASS, default: TripPlanPage } = await import("./page");
const { renderToStaticMarkup } = await import("react-dom/server");

const BASE_TRIP = {
  name: "Christmas in Europe",
  homeLat: null,
  homeLng: null,
  homeCurrency: "GBP",
  homeName: null,
  homeCountryCode: null,
  roundTrip: false,
  startDate: "2026-01-01",
  endDate: "2026-01-10",
  hardEndDate: null,
  drivingWindingFactor: 1.3,
  drivingAvgSpeedKph: 80,
  chaptersEnabled: true,
  forksEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.trip.findUnique.mockResolvedValue(BASE_TRIP);
  mockDb.fork.findFirst.mockResolvedValue(null);
  mockDb.stop.findMany.mockResolvedValue([]);
  mockDb.transport.findMany.mockResolvedValue([]);
  mockDb.cost.findMany.mockResolvedValue([]);
  mockDb.chapter.findMany.mockResolvedValue([]);
  mockDb.item.findMany.mockResolvedValue([]);
  mockDb.attachment.findMany.mockResolvedValue([]);
  mockDb.note.findMany.mockResolvedValue([]);
  mockDb.reminder.findMany.mockResolvedValue([]);
  mockDb.dayTitle.findMany.mockResolvedValue([]);
});

async function renderPlan() {
  const tree = await TripPlanPage({
    params: Promise.resolve({ tripId: "trip-1" }),
    searchParams: Promise.resolve({}),
  });
  const div = document.createElement("div");
  div.innerHTML = renderToStaticMarkup(tree as Parameters<typeof renderToStaticMarkup>[0]);
  return div;
}

describe("Plan overview sticky aside (LA-038)", () => {
  const STOP = {
    id: "s1",
    name: "Rome",
    country: "Italy",
    timezone: "Europe/Rome",
    arriveDate: "2026-01-01",
    departDate: "2026-01-05",
    sortOrder: 0,
    notes: null,
    lat: null,
    lng: null,
    nights: 4,
    pinned: false,
    chapterId: null,
    chapterSortOrder: 0,
    accommodations: [],
  };

  it("a dated return leg from the last Stop is the plan's deadline: the Fit tile and the add-stop line both read it (ADR 0068)", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, hardEndDate: "2026-01-20" });
    mockDb.stop.findMany.mockResolvedValue([STOP]);
    mockDb.transport.findMany.mockResolvedValue([{
      id: "t1", mode: "FLIGHT", fromStopId: "s1", toStopId: null, anchorStopId: null,
      depPlace: "FCO", depAt: new Date("2026-01-05T09:00:00Z"), depLat: null, depLng: null,
      arrPlace: "London", arrAt: new Date("2026-01-05T12:00:00Z"), arrLat: null, arrLng: null,
      reference: null, notes: null, sortOrder: 0, depIsHome: false, arrIsHome: true,
    }]);
    await renderPlan();
    expect(mockDb.transport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ arrIsHome: true, depIsHome: true }) }),
    );
    const summary = railCapture.fitTile!.summary as { deadline: unknown };
    // BASE_TRIP is roundTrip: false (a one-way trip fixture) — homeward follows it (R8).
    expect(summary.deadline).toEqual({ kind: "return-leg", date: "2026-01-05", mode: "FLIGHT", homeward: false });
    expect(itineraryManagerCapture.props!.hardEndDate).toBe("2026-01-05");
  });
  it("with no return leg the stored hard end date is the deadline", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, hardEndDate: "2026-01-20" });
    mockDb.stop.findMany.mockResolvedValue([STOP]);
    await renderPlan();
    expect((railCapture.fitTile!.summary as { deadline: unknown }).deadline).toEqual({ kind: "hard-end", date: "2026-01-20" });
    expect(itineraryManagerCapture.props!.hardEndDate).toBe("2026-01-20");
  });

  // No app top bar from md up (Task 11): the Dock / sidebar is the only
  // chrome there, so no 3.5rem header offset.
  it("the plan overview column sticks near the viewport top on desktop", () => {
    expect(PLAN_ASIDE_CLASS).toContain("lg:sticky");
    expect(PLAN_ASIDE_CLASS).toContain("lg:top-6");
    expect(PLAN_ASIDE_CLASS).not.toContain("3.5rem");
  });

  it("caps the aside's own height to the viewport so its scroll never outgrows the window", () => {
    expect(PLAN_ASIDE_CLASS).toContain("lg:max-h-[calc(100dvh-3rem)]");
    expect(PLAN_ASIDE_CLASS).toContain("lg:overflow-y-auto");
  });

  it("PageHeader: the h1 is Plan, the eyebrow the trip with year, the meta stops + range", async () => {
    mockDb.stop.findMany.mockResolvedValue([STOP]);
    const div = await renderPlan();
    expect(div.querySelector("h1")!.textContent).toBe("Plan");
    expect(div.textContent).toContain("Christmas in Europe 2026");
    expect(div.textContent).toContain("1 stop · Thu 1 – Sat 10 Jan");
  });
  it("the rail holds the Route map button, Fit tile and Jump list, in that order, after the list", async () => {
    mockDb.stop.findMany.mockResolvedValue([STOP]);
    const div = await renderPlan();
    const aside = div.querySelector("aside")!;
    expect(aside.className).toBe(PLAN_ASIDE_CLASS);
    expect([...aside.children].map((c) => c.firstElementChild!.getAttribute("data-testid"))).toEqual(["map-button", "fit-tile", "jump-list"]);
    // Spec 2026-10-04 §C: a button card, not a map tile — it needs no far-home pill.
    expect(Object.keys(railCapture.mapButton!).sort()).toEqual(["home", "stops"]);
    expect(PLAN_ASIDE_CLASS).toContain("lg:sticky");
    expect(PLAN_ASIDE_CLASS).toContain("lg:max-h-[calc(100dvh-3rem)]");
    expect(aside.parentElement!.className).toBe(PLAN_GRID_CLASS);
    expect(aside.previousElementSibling).not.toBeNull();
    expect(aside.nextElementSibling).toBeNull();
  });
  it("MOTION.md P1: the header and rail tiles rise in on first paint, staggered 0 / 60 / 120 / 180ms", async () => {
    mockDb.stop.findMany.mockResolvedValue([STOP]);
    const div = await renderPlan();
    const header = div.querySelector("h1")!.closest(".tp-rise-in")!;
    expect(header.getAttribute("style")).toContain("--tp-delay:0ms");
    const tiles = [...div.querySelector("aside")!.children];
    expect(tiles.map((t) => t.className)).toEqual([expect.stringContaining("tp-rise-in tp-stagger"), expect.stringContaining("tp-rise-in tp-stagger"), expect.stringContaining("tp-rise-in tp-stagger")]);
    expect(tiles.map((t) => t.getAttribute("style"))).toEqual(["--tp-delay:60ms", "--tp-delay:120ms", "--tp-delay:180ms"]);
  });
  it("no stops → no rail", async () => {
    const div = await renderPlan();
    expect(div.querySelector("aside")).toBeNull();
  });
  it("hands the manager the AI flag and opens the stop with plans by default", async () => {
    // Today (real clock) is outside Jan 2026's trip, so the default open stop is the first with plans.
    mockDb.stop.findMany.mockResolvedValue([STOP, { ...STOP, id: "s2", name: "Florence", arriveDate: "2026-01-05", departDate: "2026-01-08", sortOrder: 1 }]);
    mockDb.item.findMany.mockImplementation(async (args: { where: { date?: unknown } }) =>
      args.where.date
        ? [{ id: "i1", title: "Uffizi", category: "ACTIVITY", date: "2026-01-06", startTime: null, endTime: null, address: null, link: null, booking: null, notes: null, stopId: "s2", lat: null, lng: null, hiddenFromShares: false, photoAttachmentId: null }]
        : [],
    );
    await renderPlan();
    expect(itineraryManagerCapture.props!.aiConfigured).toBe(false);
    expect(railCapture.planBody!.initialOpen).toEqual(["s2"]);
  });
});

describe("Plan page zero-stops layout (Review Focus #5)", () => {
  it("renders a single column with no rail, grid or Fit strip when the trip has no stops", async () => {
    mockDb.stop.findMany.mockResolvedValue([]);
    const div = await renderPlan();

    expect(div.querySelector('[data-testid="fit-tile"]')).toBeNull();
    expect(div.innerHTML).not.toContain("lg:grid-cols-");
    expect(div.innerHTML).not.toContain("lg:sticky");
  });
});

describe("Plan Stops list in the side panel (spec §G, feedback cmuhvbi4h)", () => {
  const STOP = {
    id: "s1",
    name: "Rome",
    country: "Italy",
    timezone: "Europe/Rome",
    arriveDate: "2026-01-01",
    departDate: "2026-01-05",
    sortOrder: 0,
    notes: null,
    lat: null,
    lng: null,
    nights: null,
    pinned: false,
    chapterId: null,
    chapterSortOrder: 0,
    accommodations: [],
  };

  it("passes the ordered Stops, their compact (year-less) date labels, rough flags and the Home base down to the Jump list", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, homeName: "Sydney", roundTrip: true });
    mockDb.stop.findMany.mockResolvedValue([
      STOP,
      { ...STOP, id: "s2", name: "Naples", arriveDate: null, departDate: null, nights: 3, sortOrder: 1 },
    ]);

    await renderPlan();

    const jl = railCapture.jumpList!;
    expect((jl.stops as Array<Record<string, unknown>>).map((s) => [s.name, s.dateLabel, s.rough])).toEqual([
      ["Rome", "1–5 Jan", false],
      ["Naples", "~3 nights", true],
    ]);
    expect(jl.homeBase).toEqual({ name: "Sydney", roundTrip: true });
  });
});

describe("Plan page with stops (LA-038)", () => {
  const STOP = {
    id: "s1",
    name: "Rome",
    country: "Italy",
    timezone: "Europe/Rome",
    arriveDate: "2026-01-01",
    departDate: "2026-01-05",
    sortOrder: 0,
    notes: null,
    lat: null,
    lng: null,
    nights: 4,
    pinned: false,
    chapterId: null,
    chapterSortOrder: 0,
    accommodations: [],
  };

  // Task 7: a Reminder about a Stop is queried directly (not via
  // listRemindersForTrip's date-filtered/capped "upcoming" feed) and grouped
  // by stopId for the Stop card's own "Reminders" line.
  it("groups a Stop's reminders by stopId and passes them to ItineraryManager", async () => {
    mockDb.stop.findMany.mockResolvedValue([STOP]);
    mockDb.reminder.findMany.mockResolvedValue([
      { id: "r1", title: "Reconfirm the tour", date: "2026-01-02", stopId: "s1" },
    ]);

    await renderPlan();

    expect(mockDb.reminder.findMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1", stopId: { not: null } },
      orderBy: { date: "asc" },
      select: { id: true, title: true, date: true, stopId: true },
    });
    const remindersByStopId = itineraryManagerCapture.props?.remindersByStopId as Map<
      string,
      unknown[]
    >;
    expect(remindersByStopId.get("s1")).toEqual([
      {
        id: "r1",
        title: "Reconfirm the tour",
        date: "2026-01-02",
        stopId: "s1",
        stopName: "Rome",
      },
    ]);
  });

  // Task 5 (CONTEXT.md "Day title", spec §H): the loader resolves DayTitle
  // rows against the plan's Stops and passes a plain object (not a Map) down
  // to ItineraryManager, so it serialises to the client.
  it("loads Day titles for the plan's stops and passes a plain dayTitles object to ItineraryManager", async () => {
    mockDb.stop.findMany.mockResolvedValue([STOP]);
    mockDb.dayTitle.findMany.mockResolvedValue([
      { stopId: "s1", dayIndex: 1, title: "Sintra day trip" },
    ]);

    await renderPlan();

    expect(mockDb.dayTitle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stopId: { in: ["s1"] } } }),
    );
    expect(itineraryManagerCapture.props?.dayTitles).toEqual({
      "2026-01-02": { title: "Sintra day trip", stopId: "s1" },
    });
  });

  it("lays the list and rail on the 1fr + 280/320px grid", async () => {
    mockDb.stop.findMany.mockResolvedValue([STOP]);
    const div = await renderPlan();
    expect(div.querySelector("aside")!.parentElement!.className).toBe(PLAN_GRID_CLASS);
    expect(PLAN_GRID_CLASS).toContain("lg:grid-cols-[minmax(0,1fr)_280px]");
    expect(PLAN_GRID_CLASS).toContain("xl:grid-cols-[minmax(0,1fr)_320px]");
  });
});

describe("Plan page — plan variants opt-in", () => {
  async function renderWithPlan(plan: string) {
    const tree = await TripPlanPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({ plan }),
    });
    renderToStaticMarkup(tree as Parameters<typeof renderToStaticMarkup>[0]);
  }

  it("an old ?plan=<forkId> link shows the real plan when plan variants are off", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, forksEnabled: false });
    mockDb.fork.findFirst.mockResolvedValue({ id: "fork-1", name: "Plan B" });

    await renderWithPlan("fork-1");

    expect(mockDb.fork.findFirst).not.toHaveBeenCalled();
    expect(mockDb.stop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: null }) }),
    );
  });

  it("?plan=<forkId> selects the Fork when plan variants are on", async () => {
    mockDb.fork.findFirst.mockResolvedValue({ id: "fork-1", name: "Plan B" });

    await renderWithPlan("fork-1");

    expect(mockDb.fork.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "fork-1", tripId: "trip-1" } }),
    );
    expect(mockDb.stop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-1" }) }),
    );
  });
});

// Task 15 / final review #3: /plan?add=stop is handled client-side by
// ItineraryManager itself (useSearchParams — opens the dialog, then strips
// the param); the page no longer threads it as a prop.
describe("?add=stop", () => {
  it("is not threaded through as a prop any more", async () => {
    const tree = await TripPlanPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({ add: "stop" } as { plan?: string }),
    });
    renderToStaticMarkup(tree as Parameters<typeof renderToStaticMarkup>[0]);
    expect(itineraryManagerCapture.props).not.toHaveProperty("openAddStop");
  });
});
