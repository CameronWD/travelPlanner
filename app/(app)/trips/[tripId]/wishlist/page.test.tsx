import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Wishlist page is an async server component with DB calls — pin the
// PageHeader wiring (Task 22, AUDIT.md): the h1 and the eyebrow.

const { tripFindUniqueMock, forkFindFirstMock, markerFindManyMock, costFindManyMock, noteFindManyMock, voteFindManyMock, itemFindManyMock, attachmentFindManyMock } =
  vi.hoisted(() => ({
    tripFindUniqueMock: vi.fn(),
    forkFindFirstMock: vi.fn(),
    markerFindManyMock: vi.fn().mockResolvedValue([]),
    costFindManyMock: vi.fn().mockResolvedValue([]),
    noteFindManyMock: vi.fn().mockResolvedValue([]),
    voteFindManyMock: vi.fn().mockResolvedValue([]),
    itemFindManyMock: vi.fn().mockResolvedValue([]),
    attachmentFindManyMock: vi.fn().mockResolvedValue([]),
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
  WishlistBoard: () => <div data-testid="wishlist-board" />,
}));

import WishlistPage from "./page";

async function renderPage() {
  render(await WishlistPage({
    params: Promise.resolve({ tripId: "t1" }),
    searchParams: Promise.resolve({}),
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
