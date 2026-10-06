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
// requireTripAccess now returns { user, membership } here too (I5): the page
// keeps them to compute isOwner for Make it fit's owner-only Drop half.
// isTripOwnerOrAdmin is the REAL predicate — it lives in lib/access.ts, which
// is framework- and db-free, so importing it here keeps the gate honest
// instead of hand-reimplementing it (same pattern as server/actions/trips.test.ts).
vi.mock("@/lib/guards", async () => {
  const { isTripOwnerOrAdmin } = await import("@/lib/access");
  return {
    requireTripAccess: vi.fn().mockResolvedValue({
      user: { id: "u1", email: "you@example.com" },
      membership: { role: "owner" },
    }),
    isTripOwnerOrAdmin,
  };
});
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
  // The single Stop read selects the date fields so the page can split dated
  // from rough rows itself (spec 2026-10-06 §C).
  arriveDate: null,
  departDate: null,
};

function setupStops(datedStops: unknown[], roughStops: unknown[]) {
  mockDb.stop.findMany.mockImplementation((args: { where: { arriveDate?: unknown } }) => {
    // Date-less Trips still read rough Stops only; a dated Trip reads every
    // Stop once (spec 2026-10-06 §C) and splits them itself.
    if (args.where.arriveDate === null) return Promise.resolve(roughStops);
    return Promise.resolve([...datedStops, ...roughStops]);
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

// ---------------------------------------------------------------------------
// Width safety — long Stop, accommodation and transport-place names must
// wrap/truncate inside their own cells instead of widening the page.
// ---------------------------------------------------------------------------

const longStop = "S".repeat(60);
const longAccom = "A".repeat(60);
const longPlace = "P".repeat(60);

// Second dated stop with a 60-char unbroken name, inside CHAPTER's band.
const LONG_STOP = {
  id: "s2",
  name: longStop,
  country: "France",
  lat: 48.8,
  lng: 2.3,
  timezone: "Europe/Paris",
  arriveDate: "2026-01-06",
  departDate: "2026-01-08",
  sortOrder: 1,
  pinned: false,
  nights: 2,
};

// Trailing stop so LONG_STOP is not the last stop (outbound transport is only
// rendered for non-last stops).
const TAIL_STOP = {
  id: "s3",
  name: "Tail",
  country: null,
  lat: 0,
  lng: 0,
  timezone: "UTC",
  arriveDate: "2026-01-09",
  departDate: "2026-01-10",
  sortOrder: 2,
  pinned: false,
  nights: 1,
};

describe("SummaryPage — long names don't widen the page", () => {
  it("wraps/truncates a long Stop name, accommodation name and transport place", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: true });
    setupStops([DATED_STOP, LONG_STOP, TAIL_STOP], [ROUGH_STOP]);
    mockDb.accommodation.findMany.mockResolvedValue([
      { id: "a1", stopId: "s2", name: longAccom, checkIn: "2026-01-06", checkOut: "2026-01-08" },
    ]);
    mockDb.transport.findMany.mockResolvedValue([
      {
        id: "t1",
        mode: "flight",
        fromStopId: "s2",
        toStopId: "s3",
        depPlace: longPlace,
        arrPlace: "Tail",
        depAt: "2026-01-08T10:00:00.000Z",
        arrAt: null,
        sortOrder: 0,
        depIsHome: false,
        arrIsHome: false,
      },
    ]);

    const jsx = await renderSummary();
    render(jsx);

    const stopName = screen.getByRole("heading", { level: 3, name: longStop });
    expect(stopName.className).toMatch(/\bbreak-words\b/);
    expect(stopName.className).toMatch(/\bmin-w-0\b/);
    expect(stopName.parentElement!.className).toMatch(/\bmin-w-0\b/); // flex row
    expect(stopName.parentElement!.parentElement!.className).toMatch(/\bmin-w-0\b/); // left column
    expect(screen.getByText(longAccom).className).toMatch(/\btruncate\b|\bbreak-words\b/);
    expect(screen.getByText(new RegExp(longPlace)).className).toMatch(/\bmin-w-0\b/);
  });
});

describe("SummaryPage reads (spec 2026-10-06 §C)", () => {
  it("reads Stops once and computes the projection from them, not with a second round of reads", async () => {
    const { getTripProjection } = await import("@/server/actions/stops");
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: false });
    render(await renderSummary());
    expect(mockDb.stop.findMany).toHaveBeenCalledTimes(1);
    expect(getTripProjection).not.toHaveBeenCalled();
  });
});

describe("SummaryPage — departure dates in the leg's timezone (spec 2026-10-06 §G)", () => {
  it("a 06:30 Sydney departure shows its own calendar day, not the UTC one", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: false });
    setupStops(
      [
        { ...DATED_STOP, id: "syd", name: "Sydney", country: "Australia", timezone: "Australia/Sydney", arriveDate: "2026-01-02", departDate: "2026-01-08" },
        TAIL_STOP,
      ],
      [],
    );
    mockDb.transport.findMany.mockResolvedValue([
      {
        id: "t1", mode: "flight", fromStopId: "syd", toStopId: "s3", depPlace: "SYD", arrPlace: "Tail",
        // 2026-01-07T19:30Z = 06:30 on 8 Jan in Sydney (AEDT, UTC+11).
        depAt: "2026-01-07T19:30:00.000Z", arrAt: null, sortOrder: 0, depIsHome: false, arrIsHome: false,
      },
    ]);
    render(await renderSummary());
    expect(screen.getByText("8 Jan")).toBeInTheDocument();
    expect(screen.queryByText("7 Jan")).toBeNull();
  });
});
