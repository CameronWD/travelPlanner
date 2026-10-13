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
// Surprise (ADR 0051): the page asks the visibility loader and spreads its
// fragments into its own queries; the loader itself is tested on its own.
const { loadSurpriseVisibilityMock } = vi.hoisted(() => ({ loadSurpriseVisibilityMock: vi.fn() }));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});
vi.mock("@/lib/globe", () => ({ getUserGlobe: async () => null }));
vi.mock("@/lib/globe-suggestions", () => ({ suggestMarkersForTrip: () => [] }));
vi.mock("@/components/trip/variant-banner", () => ({ VariantBanner: () => null }));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => null }));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async () => "t1" }));
vi.mock("@/components/trip/add-item-from-url", () => ({ AddItemFromUrl: () => null }));
vi.mock("@/components/trip/wishlist-board", () => ({
  WishlistBoard: (props: Record<string, unknown>) => {
    Object.assign(boardProps, props);
    return <div data-testid="wishlist-board" />;
  },
}));

import WishlistPage from "./page";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";

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
  loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
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

describe("WishlistPage — Stops for the chips and the item form (spec 2026-10-12 W18, LA-155)", () => {
  it("loads only the real plan's Stops, so a trip with Forks shows each place once", async () => {
    await renderPage();
    const arg = tripFindUniqueMock.mock.calls[0][0] as { select: { stops: { where?: unknown } } };
    expect(arg.select.stops.where).toEqual({ forkId: null });
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

describe("WishlistPage reads (spec 2026-10-06 §C)", () => {
  it("loads the current Plan's Stops in the same wave as the ideas' costs, notes and votes", async () => {
    tripFindUniqueMock.mockResolvedValue({
      id: "t1", name: "Europe", startDate: "2026-07-01", endDate: "2026-07-20", homeCurrency: "USD", forksEnabled: false, stops: [],
      items: [{
        id: "i1", title: "Louvre", category: "SIGHTSEEING", date: null, startTime: null, endTime: null, address: null, link: null,
        booking: null, notes: null, stopId: null, lat: null, lng: null, sourceMarkerId: null, hiddenFromShares: false,
        photoAttachmentId: null, stop: null,
      }],
    });
    let release!: (v: unknown) => void;
    stopFindManyMock.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const pending = WishlistPage({ params: Promise.resolve({ tripId: "t1" }), searchParams: Promise.resolve({}) });
    await vi.waitFor(() => {
      expect(costFindManyMock).toHaveBeenCalled();
      expect(noteFindManyMock).toHaveBeenCalled();
      expect(voteFindManyMock).toHaveBeenCalled();
    });
    release([]);
    await pending;
  });
});

describe("WishlistPage — Surprise (CONTEXT.md \"Surprise\", ADR 0051)", () => {
  const IDEA = {
    id: "i1", title: "Louvre", category: "SIGHTSEEING", date: null, startTime: null, endTime: null, address: null, link: null,
    booking: null, notes: null, stopId: null, lat: null, lng: null, sourceMarkerId: null, hiddenFromShares: false,
    photoAttachmentId: null, stop: null,
  };

  it("a placed copy inside a Surprise does not mark the idea: the \"in this plan\" query carries the Item fragment", async () => {
    tripFindUniqueMock.mockResolvedValue({
      id: "t1", name: "Europe", startDate: "2026-07-01", endDate: "2026-07-20",
      homeCurrency: "USD", forksEnabled: true, stops: [], items: [IDEA],
    });
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ viewerId: "u1", hiddenStopIds: ["s-secret"] }));
    await renderPage();
    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith("t1", "u1");
    expect(itemFindManyMock).toHaveBeenCalledTimes(1);
    expect(itemFindManyMock).toHaveBeenCalledWith({
      where: { tripId: "t1", forkId: null, sourceItemId: { in: ["i1"] }, ...MARKER_WHERE.item },
      select: { sourceItemId: true },
    });
  });

  it("the ideas themselves are trip-wide and never inside a Surprise: the Trip read carries no fragment", async () => {
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ viewerId: "u1", hiddenStopIds: ["s-secret"] }));
    await renderPage();
    expect(JSON.stringify(tripFindUniqueMock.mock.calls[0][0])).not.toContain("surpriseMarker");
  });
});
