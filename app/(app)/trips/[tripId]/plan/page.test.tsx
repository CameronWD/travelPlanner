import { describe, it, expect, vi, beforeEach } from "vitest";

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
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(async () => ({
    user: { id: "owner-1", email: "owner@example.com" },
    membership: { userId: "owner-1", role: "owner" },
  })),
  isTripOwnerOrAdmin: vi.fn(() => true),
}));
vi.mock("@/components/trip/itinerary-manager", () => ({ ItineraryManager: () => null }));
vi.mock("@/components/trip/plan-overview", () => ({
  PlanOverview: () => <div data-testid="plan-overview-marker" />,
}));
vi.mock("@/components/trip/variant-banner", () => ({ VariantBanner: () => null }));
// React import needed for JSX in the PlanOverview mock above.
import React from "react";

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
