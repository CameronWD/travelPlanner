import { describe, it, expect, vi, beforeEach } from "vitest";

// phase-travelling.tsx is a heavy async server component with DB calls.
// We test the desktop grid className via an exported constant so we can assert
// the correct rail width and two-col wrapper without standing up the full DB/RSC stack.
// We also assert the fork-scoping of every plan-entity where-clause by mocking
// db per-model methods directly (mirrors server/actions/search.test.ts).

const {
  tripFindUniqueMock,
  stopFindManyMock,
  itemFindManyMock,
  transportFindManyMock,
  accommodationFindManyMock,
  costFindManyMock,
  reminderFindManyMock,
  chapterFindManyMock,
  attachmentFindManyMock,
  buildItineraryMock,
} = vi.hoisted(() => ({
  tripFindUniqueMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn(),
  accommodationFindManyMock: vi.fn(),
  costFindManyMock: vi.fn(),
  reminderFindManyMock: vi.fn(),
  chapterFindManyMock: vi.fn(),
  attachmentFindManyMock: vi.fn(),
  buildItineraryMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: tripFindUniqueMock },
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    cost: { findMany: costFindManyMock },
    reminder: { findMany: reminderFindManyMock },
    chapter: { findMany: chapterFindManyMock },
    attachment: { findMany: attachmentFindManyMock },
  },
}));
// Keep the real `daysBetween` — lib/upcoming-payments.ts (exercised for real,
// not mocked) depends on it to compute daysUntil for the upcoming-payments card.
vi.mock("@/lib/dates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dates")>();
  return { ...actual, todayISO: vi.fn(), formatLongDate: vi.fn(), dayNumberInTrip: vi.fn() };
});
vi.mock("@/lib/itinerary", () => ({
  buildItinerary: buildItineraryMock,
  effectiveTodayISO: vi.fn(),
  pickDayPlan: vi.fn(),
}));
vi.mock("@/lib/day-map", () => ({ buildDayMapModel: vi.fn(), buildItemDirections: vi.fn() }));
vi.mock("@/lib/nearby", () => ({ nearbyWishlistItems: vi.fn() }));
vi.mock("@/lib/chapters", () => ({ chapterForDate: vi.fn() }));
vi.mock("@/lib/spend-so-far", () => ({ buildSpendSoFar: vi.fn() }));
vi.mock("@/lib/transport", () => ({ TRANSPORT_MODE_META: {} }));
vi.mock("@/lib/time-display", () => ({ zoneLabel: vi.fn() }));
vi.mock("@/lib/plan-scope", () => ({ WISHLIST_IDEA_WHERE: {} }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => null }));
vi.mock("@/components/trip/timeline", () => ({ Timeline: () => null }));
vi.mock("@/components/trip/day-map-panel", () => ({ DayMapPanel: () => null }));
vi.mock("@/components/trip/nearby-wishlist", () => ({ NearbyWishlist: () => null }));
vi.mock("@/components/trip/map-link", () => ({ MapLink: () => null }));
vi.mock("@/components/trip/transport-countdown", () => ({ TransportCountdown: () => null }));
vi.mock("@/components/trip/spend-so-far-card", () => ({ SpendSoFarCard: () => null }));
vi.mock("@/components/trip/reminders-card", () => ({ RemindersCard: () => null }));
vi.mock("@/components/trip/attachment-links", () => ({ AttachmentLinks: () => null }));
vi.mock("@/components/trip/chapter-chip", () => ({ ChapterChip: () => null }));
vi.mock("@/components/trip/upcoming-payments-card", () => ({ UpcomingPaymentsCard: () => null }));
// React import needed for JSX in mocks above
import React from "react";

const { TRAVELLING_DESKTOP_GRID_CLASS, PhaseTravelling } = await import("./phase-travelling");
const { UpcomingPaymentsCard } = await import("@/components/trip/upcoming-payments-card");

// Server components aren't run through a renderer here (see file-header note),
// so a mocked child is never actually invoked. To assert its props without
// standing up a full render, walk the returned React element tree by hand
// (mirrors components/trip/home/phase-planning.test.tsx).
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

describe("PhaseTravelling desktop rail", () => {
  it("exports TRAVELLING_DESKTOP_GRID_CLASS with 21.25rem rail matching the E1 mockup spec", () => {
    expect(TRAVELLING_DESKTOP_GRID_CLASS).toContain("21.25rem");
  });

  it("uses grid with single column base and lg two-col breakpoint", () => {
    expect(TRAVELLING_DESKTOP_GRID_CLASS).toContain("grid");
    expect(TRAVELLING_DESKTOP_GRID_CLASS).toContain("grid-cols-1");
    expect(TRAVELLING_DESKTOP_GRID_CLASS).toContain("lg:grid-cols-[");
  });

  it("includes lg:items-start for top alignment of rail columns", () => {
    expect(TRAVELLING_DESKTOP_GRID_CLASS).toContain("lg:items-start");
  });
});

describe("PhaseTravelling fork-scoped plan queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tripFindUniqueMock.mockResolvedValue({
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      homeCurrency: "GBP",
      chaptersEnabled: true,
    });
    stopFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);
    reminderFindManyMock.mockResolvedValue([]);
    chapterFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([]);
    buildItineraryMock.mockReturnValue([]);
  });

  it("scopes the stops query to the real plan (dated views follow the real plan — CONTEXT.md)", async () => {
    await PhaseTravelling({ tripId: "trip-1" });
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the scheduled-items query to the real plan (not the wishlist-idea query)", async () => {
    await PhaseTravelling({ tripId: "trip-1" });
    // First item.findMany call is the scheduled-items query for the itinerary;
    // the second is the wishlist-idea query, which is trip-wide (WISHLIST_IDEA_WHERE).
    expect(itemFindManyMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the transports query to the real plan", async () => {
    await PhaseTravelling({ tripId: "trip-1" });
    expect(transportFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the accommodations query to the real plan", async () => {
    await PhaseTravelling({ tripId: "trip-1" });
    expect(accommodationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the costs query to the real plan", async () => {
    await PhaseTravelling({ tripId: "trip-1" });
    expect(costFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the chapters query to the real plan", async () => {
    await PhaseTravelling({ tripId: "trip-1" });
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("leaves the trip-wide reminders and attachments queries unscoped by forkId", async () => {
    await PhaseTravelling({ tripId: "trip-1" });
    expect(reminderFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1" } }),
    );
    expect(attachmentFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1" } }),
    );
  });
});

describe("PhaseTravelling chapter gating (Task 13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);
    reminderFindManyMock.mockResolvedValue([]);
    // Chapters exist in the DB regardless of the toggle — gating hides the
    // presentation, the data stays.
    chapterFindManyMock.mockResolvedValue([
      { id: "c1", name: "Chapter One", colour: "sky", startDate: "2026-01-01", endDate: "2026-01-10" },
    ]);
    attachmentFindManyMock.mockResolvedValue([]);
    buildItineraryMock.mockReturnValue([]);
  });

  it("skips the chapters query when the trip has chaptersEnabled: false", async () => {
    tripFindUniqueMock.mockResolvedValue({
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      homeCurrency: "GBP",
      chaptersEnabled: false,
    });
    await PhaseTravelling({ tripId: "trip-1" });
    expect(chapterFindManyMock).not.toHaveBeenCalled();
  });

  it("runs the chapters query when the trip has chaptersEnabled: true", async () => {
    tripFindUniqueMock.mockResolvedValue({
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      homeCurrency: "GBP",
      chaptersEnabled: true,
    });
    await PhaseTravelling({ tripId: "trip-1" });
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });
});

describe("PhaseTravelling upcoming payments mount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tripFindUniqueMock.mockResolvedValue({
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      homeCurrency: "GBP",
      chaptersEnabled: true,
    });
    stopFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);
    reminderFindManyMock.mockResolvedValue([]);
    chapterFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([]);
    buildItineraryMock.mockReturnValue([]);
  });

  it("mounts UpcomingPaymentsCard in the rail after Spend so far, fed by unpaid dated costs", async () => {
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

    const tree = await PhaseTravelling({ tripId: "trip-1" });

    const el = findElementByType(tree, UpcomingPaymentsCard);
    expect(el).not.toBeNull();
    expect(el!.props.tripId).toBe("trip-1");
    expect((el!.props.payments as unknown[]).length).toBe(1);
  });

  it("passes an empty payments list through when nothing is unpaid-with-a-due-date", async () => {
    const tree = await PhaseTravelling({ tripId: "trip-1" });

    const el = findElementByType(tree, UpcomingPaymentsCard);
    expect(el).not.toBeNull();
    expect(el!.props.payments).toEqual([]);
  });
});
