import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Wishlist page is an async server component with DB calls — pin the
// PageHeader wiring (Task 22, AUDIT.md): the h1 and the eyebrow.

const { tripFindUniqueMock, forkFindFirstMock, markerFindManyMock, costFindManyMock, noteFindManyMock, voteFindManyMock, itemFindManyMock, attachmentFindManyMock, stopFindManyMock, boardProps } =
  vi.hoisted(() => ({
    tripFindUniqueMock: vi.fn(),
    forkFindFirstMock: vi.fn(),
    markerFindManyMock: vi.fn().mockResolvedValue([]),
    costFindManyMock: vi.fn().mockResolvedValue([]),
    noteFindManyMock: vi.fn().mockResolvedValue([]),
    voteFindManyMock: vi.fn().mockResolvedValue([]),
    itemFindManyMock: vi.fn().mockResolvedValue([]),
    attachmentFindManyMock: vi.fn().mockResolvedValue([]),
    stopFindManyMock: vi.fn().mockResolvedValue([]),
    boardProps: {} as Record<string, unknown>,
  }));

vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: tripFindUniqueMock },
    fork: { findFirst: forkFindFirstMock },
    marker: { findMany: markerFindManyMock },
    cost: { findMany: costFindManyMock },
    note: { findMany: noteFindManyMock },
    vote: { findMany: voteFindManyMock },
    item: { findMany: itemFindManyMock },
    attachment: { findMany: attachmentFindManyMock },
    stop: { findMany: stopFindManyMock },
  },
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn().mockResolvedValue({ user: { id: "u1" } }),
}));
vi.mock("@/lib/ai", () => ({ isAiConfigured: () => false }));
vi.mock("@/lib/globe", () => ({ getUserGlobe: async () => null }));
vi.mock("@/lib/globe-suggestions", () => ({ suggestMarkersForTrip: () => [] }));
vi.mock("@/components/trip/variant-banner", () => ({ VariantBanner: () => null }));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => null }));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async () => "t1" }));
vi.mock("@/components/trip/wishlist-board", () => ({
  WishlistBoard: (props: Record<string, unknown>) => {
    Object.assign(boardProps, props);
    return <div data-testid="wishlist-board" />;
  },
}));

import WishlistPage from "./page";

async function renderPage(searchParams: { plan?: string } = {}) {
  render(await WishlistPage({
    params: Promise.resolve({ tripId: "t1" }),
    searchParams: Promise.resolve(searchParams),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  markerFindManyMock.mockResolvedValue([]);
  costFindManyMock.mockResolvedValue([]);
  noteFindManyMock.mockResolvedValue([]);
  voteFindManyMock.mockResolvedValue([]);
  itemFindManyMock.mockResolvedValue([]);
  attachmentFindManyMock.mockResolvedValue([]);
  stopFindManyMock.mockResolvedValue([]);
  for (const k of Object.keys(boardProps)) delete boardProps[k];
  tripFindUniqueMock.mockResolvedValue({
    id: "t1",
    name: "Europe",
    startDate: "2026-07-01",
    endDate: "2026-07-20",
    homeCurrency: "USD",
    forksEnabled: false,
    stops: [],
    items: [],
  });
});

describe("WishlistPage — PageHeader (Task 22, AUDIT.md)", () => {
  it("renders the h1 'Wishlist' with the trip eyebrow", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Wishlist" })).toBeInTheDocument();
    expect(screen.getByText("Europe 2026")).toBeInTheDocument();
    expect(screen.getByTestId("wishlist-board")).toBeInTheDocument();
  });
});

describe("WishlistPage — the current Plan's Stops for Schedule (spec 2026-10-05 §E)", () => {
  const ROW = { id: "s1", name: "Rome", lat: 41.9, lng: 12.5, arriveDate: "2026-07-01", departDate: "2026-07-04" };

  it("real plan: loads forkId-null Stops and hands them to the board", async () => {
    stopFindManyMock.mockResolvedValue([ROW]);
    await renderPage();
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "t1", forkId: null }, orderBy: { sortOrder: "asc" } }),
    );
    expect(boardProps.planStops).toEqual([ROW]);
  });

  it("Fork active: loads that Fork's Stops", async () => {
    tripFindUniqueMock.mockResolvedValue({
      id: "t1", name: "Europe", startDate: "2026-07-01", endDate: "2026-07-20",
      homeCurrency: "USD", forksEnabled: true, stops: [], items: [],
    });
    forkFindFirstMock.mockResolvedValue({ id: "fork-1", name: "Italy first" });
    await renderPage({ plan: "fork-1" });
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "t1", forkId: "fork-1" } }),
    );
  });
});
