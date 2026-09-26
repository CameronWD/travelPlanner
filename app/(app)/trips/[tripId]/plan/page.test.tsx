import { describe, it, expect, vi, beforeEach } from "vitest";
// React import needed for JSX in the PlanOverview mock below (vi.mock calls
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
vi.mock("@/components/trip/plan-overview", () => ({
  PlanOverview: () => <div data-testid="plan-overview-marker" />,
}));
vi.mock("@/components/trip/variant-banner", () => ({ VariantBanner: () => null }));

const { PLAN_ASIDE_CLASS, default: TripPlanPage } = await import("./page");
const { renderToStaticMarkup } = await import("react-dom/server");

const BASE_TRIP = {
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
  it("the plan overview column sticks under the header on desktop", () => {
    expect(PLAN_ASIDE_CLASS).toContain("lg:sticky");
    expect(PLAN_ASIDE_CLASS).toMatch(/lg:top-\[/);
  });

  it("caps the aside's own height to the viewport so its scroll never outgrows the window", () => {
    expect(PLAN_ASIDE_CLASS).toMatch(/lg:max-h-\[/);
    expect(PLAN_ASIDE_CLASS).toContain("lg:overflow-y-auto");
  });
});

describe("Plan page zero-stops layout (Review Focus #5)", () => {
  it("renders a single-column grid with no aside when the trip has no stops", async () => {
    mockDb.stop.findMany.mockResolvedValue([]);
    const div = await renderPlan();

    expect(div.querySelector('[data-testid="plan-overview-marker"]')).toBeNull();

    const grid = div.querySelector(".grid")!;
    expect(grid).not.toBeNull();
    expect(grid.className).not.toContain("lg:grid-cols-");
    expect(grid.className).not.toContain("lg:sticky");
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
      { id: "r1", title: "Reconfirm the tour", date: "2026-01-02", stopId: "s1" },
    ]);
  });

  it("puts the plan overview in the sticky aside column, not a dead empty rail", async () => {
    mockDb.stop.findMany.mockResolvedValue([STOP]);
    const div = await renderPlan();

    const marker = div.querySelector('[data-testid="plan-overview-marker"]');
    expect(marker).not.toBeNull();

    // The aside div is the nearest ancestor carrying the sticky classes.
    let node: HTMLElement | null = marker as HTMLElement | null;
    while (node && !node.className?.includes("lg:sticky")) {
      node = node.parentElement;
    }
    expect(node).not.toBeNull();
    expect(node!.className).toContain("lg:top-[");
    expect(node!.className).toContain("lg:max-h-[");
    expect(node!.className).toContain("lg:overflow-y-auto");

    const grid = div.querySelector(".grid")!;
    expect(grid.className).toContain("lg:grid-cols-[minmax(0,1fr)_20rem]");
  });
});
