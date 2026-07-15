import { describe, it, expect, vi } from "vitest";

// phase-travelling.tsx is a heavy async server component with DB calls.
// We test the desktop grid className via an exported constant so we can assert
// the correct rail width and two-col wrapper without standing up the full DB/RSC stack.

// Mirrors the pattern from phase-planning.test.tsx.

vi.mock("@/lib/db", () => ({ db: { trip: {}, stop: {}, item: {}, transport: {}, accommodation: {}, cost: {}, reminder: {}, chapter: {}, attachment: {} } }));
vi.mock("@/lib/dates", () => ({ todayISO: vi.fn(), formatLongDate: vi.fn(), dayNumberInTrip: vi.fn() }));
vi.mock("@/lib/itinerary", () => ({ buildItinerary: vi.fn(), effectiveTodayISO: vi.fn(), pickDayPlan: vi.fn() }));
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
// React import needed for JSX in mocks above
import React from "react";

const { TRAVELLING_DESKTOP_GRID_CLASS } = await import("./phase-travelling");

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
