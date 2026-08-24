import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// summary/page.tsx is a heavy async server component with DB calls.
//
// Two test styles live in this file:
//  1. A className-only check via an exported constant (no DB/RSC stack needed).
//  2. A full-render harness (mirrors budget/budget-page.test.tsx): all DB
//     access is mocked, heavy client leaves (route map, flag list, make-it-fit)
//     are mocked to markers, but `@/lib/chapters` / `@/lib/dates` /
//     `@/lib/plan-order` are left REAL (pure, deterministic) so the actual
//     chapter-gating behaviour in page.tsx is exercised end to end, proving
//     a disabled trip renders flat (Task 13).

const mockDb = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  stop: { findMany: vi.fn() },
  transport: { findMany: vi.fn() },
  accommodation: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
  cost: { findMany: vi.fn() },
  exchangeRate: { findMany: vi.fn() },
  chapter: { findMany: vi.fn() },
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/money", () => ({ formatMoney: vi.fn((minor: number, currency: string) => `${minor}${currency}`) }));
vi.mock("@/lib/budget", () => ({
  buildBudget: vi.fn(() => ({
    grandTotal: { costTotalMinor: 0, paidTotalMinor: 0 },
    byCategory: [],
    byStop: [],
    byChapter: [],
    hasMissingRates: false,
    missingRates: [],
  })),
  applyFxRatesToCosts: vi.fn(({ costs }: { costs: unknown[] }) => costs),
}));
vi.mock("@/lib/flags", () => ({ detectFlags: vi.fn(() => []) }));
vi.mock("@/lib/home-base", () => ({ tripHomeBase: vi.fn(() => null) }));
vi.mock("@/lib/route-map", () => ({ homeMapPoint: vi.fn(() => null) }));
vi.mock("@/server/actions/stops", () => ({
  getTripProjection: vi.fn(async () => ({ projectedEnd: null, hardEndDate: null })),
}));
// `@/lib/chapters` and the `@/lib/dates` it depends on internally (isDateWithin)
// are left REAL — pure, deterministic functions — so chapter grouping actually
// reflects the gated `chapters` array built inside page.tsx. Mocking them
// would hide exactly the behaviour this suite needs to prove.
vi.mock("@/lib/chapter-colours", () => ({ chapterColourSwatch: vi.fn(() => "#000000") }));
vi.mock("@/components/trip/chapter-chip", () => ({
  ChapterChip: ({ name }: { name: string }) => <span data-testid="chapter-chip">{name}</span>,
}));
vi.mock("@/components/trip/cost-amounts", () => ({ CostAmounts: () => null }));
vi.mock("@/components/trip/route-map-loader", () => ({ RouteMapLoader: () => <div data-testid="route-map" /> }));
vi.mock("@/components/trip/flag-list", () => ({ FlagList: () => <div data-testid="flag-list" /> }));
vi.mock("@/components/trip/make-it-fit", () => ({ MakeItFit: () => <div data-testid="make-it-fit" /> }));

const { SUMMARY_DESKTOP_GRID_CLASS, default: SummaryPage } = await import("./page");

describe("Summary desktop rail width", () => {
  it("desktop grid uses 21.25rem rail (340 px) matching the mockup spec", () => {
    expect(SUMMARY_DESKTOP_GRID_CLASS).toContain("21.25rem");
  });
});

// ---------------------------------------------------------------------------
// Full-render chapter gating (Task 13)
// ---------------------------------------------------------------------------

const BASE_TRIP = {
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

// A dated stop that falls inside CHAPTER's date band, so a real
// `groupStopsByChapter` call groups it under that chapter when chapters flow
// through.
const DATED_STOP = {
  id: "s1",
  name: "Rome",
  country: "Italy",
  lat: 41.9,
  lng: 12.5,
  timezone: "Europe/Rome",
  arriveDate: "2026-01-02",
  departDate: "2026-01-05",
  sortOrder: 0,
  pinned: false,
  nights: 3,
};

const CHAPTER = { id: "c1", name: "Italy Leg", colour: "sky", startDate: "2026-01-01", endDate: "2026-01-10" };

// A rough (date-less) stop explicitly assigned to CHAPTER via chapterId —
// exercises the "Not yet scheduled" chip lookup, which reads the page's own
// (gated) `chapters` array directly rather than going through lib/chapters.
const ROUGH_STOP = {
  id: "r1",
  name: "Someday Place",
  nights: 2,
  country: "Spain",
  chapterId: "c1",
  pinned: false,
  sortOrder: 1,
};

function setupStops(datedStops: unknown[], roughStops: unknown[]) {
  mockDb.stop.findMany.mockImplementation((args: { where: { arriveDate?: unknown } }) => {
    if (args.where.arriveDate === null) return Promise.resolve(roughStops);
    return Promise.resolve(datedStops);
  });
}

function renderSummary() {
  const jsx = SummaryPage({
    params: Promise.resolve({ tripId: "trip-1" }),
  }) as unknown as Promise<React.ReactElement>;
  return jsx;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.transport.findMany.mockResolvedValue([]);
  mockDb.accommodation.findMany.mockResolvedValue([]);
  mockDb.item.findMany.mockResolvedValue([]);
  mockDb.cost.findMany.mockResolvedValue([]);
  mockDb.exchangeRate.findMany.mockResolvedValue([]);
  mockDb.chapter.findMany.mockResolvedValue([CHAPTER]);
  setupStops([DATED_STOP], [ROUGH_STOP]);
});

describe("SummaryPage chapter gating — dated trip (Task 13)", () => {
  it("renders flat and skips the chapters query when chaptersEnabled is false", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: false });

    const jsx = await renderSummary();
    render(jsx);

    expect(mockDb.chapter.findMany).not.toHaveBeenCalled();
    expect(screen.queryByText("Italy Leg")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chapter-chip")).not.toBeInTheDocument();
  });

  it("shows chapter chips for both dated and rough stops when chaptersEnabled is true", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: true });

    const jsx = await renderSummary();
    render(jsx);

    expect(mockDb.chapter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null, startDate: { not: null } }) }),
    );
    expect(screen.getAllByText("Italy Leg").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("chapter-chip").length).toBeGreaterThan(0);
  });
});

describe("SummaryPage chapter gating — date-less trip (Task 13)", () => {
  const DATELESS_ROUGH_STOP = {
    id: "r1",
    name: "Someday Place",
    nights: 2,
    country: "Spain",
    chapterId: "c1",
  };

  beforeEach(() => {
    setupStops([], [DATELESS_ROUGH_STOP]);
  });

  it("renders flat and skips the chapters query when chaptersEnabled is false", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, startDate: null, endDate: null, chaptersEnabled: false });

    const jsx = await renderSummary();
    render(jsx);

    expect(mockDb.chapter.findMany).not.toHaveBeenCalled();
    expect(screen.queryByText("Italy Leg")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chapter-chip")).not.toBeInTheDocument();
  });

  it("shows the chapter chip when chaptersEnabled is true", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, startDate: null, endDate: null, chaptersEnabled: true });

    const jsx = await renderSummary();
    render(jsx);

    expect(mockDb.chapter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1", forkId: null } }),
    );
    expect(screen.getByText("Italy Leg")).toBeInTheDocument();
    expect(screen.getByTestId("chapter-chip")).toBeInTheDocument();
  });
});
