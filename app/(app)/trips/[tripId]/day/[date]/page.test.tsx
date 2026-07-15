import { describe, it, expect, vi } from "vitest";

// day/[date]/page.tsx is an async server component with DB calls.
// We test the reading-width wrapper via an exported constant.
// The DayMapPanel stays full-width; only timeline+editor are capped.

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/dates", () => ({ formatLongDate: vi.fn(), todayISO: vi.fn(), tzAbbrev: vi.fn() }));
vi.mock("@/lib/itinerary", () => ({ buildItinerary: vi.fn() }));
vi.mock("@/lib/day-map", () => ({ buildDayMapModel: vi.fn(), buildItemDirections: vi.fn() }));
vi.mock("@/lib/nearby", () => ({ nearbyWishlistItems: vi.fn() }));
vi.mock("@/lib/flags", () => ({ flagTightConnections: vi.fn() }));
vi.mock("@/lib/daylight", () => ({ daylight: vi.fn(), utcHmToZone: vi.fn() }));
vi.mock("@/lib/weather", () => ({ getDayWeather: vi.fn() }));
vi.mock("@/lib/time-display", () => ({ zoneLabel: vi.fn() }));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => null }));
vi.mock("@/components/trip/timeline", () => ({ Timeline: () => null }));
vi.mock("@/components/trip/day-nav", () => ({ DayNav: () => null }));
vi.mock("@/components/trip/day-map-panel", () => ({ DayMapPanel: () => null }));
vi.mock("@/components/trip/nearby-wishlist", () => ({ NearbyWishlist: () => null }));
vi.mock("@/components/trip/day-feasibility", () => ({ DayFeasibility: () => null }));
vi.mock("@/components/trip/weather-daylight-card", () => ({ WeatherDaylightCard: () => null }));
vi.mock("@/components/trip/item-form-dialog", () => ({ AddItemButton: () => null }));
vi.mock("@/components/trip/journal-editor", () => ({ JournalEditor: () => null }));

const { DAY_READING_WIDTH_CLASS } = await import("./page");

describe("Day page reading-width cap", () => {
  it("timeline+editor stack carries max-w-3xl to cap reading line length", () => {
    expect(DAY_READING_WIDTH_CLASS).toContain("max-w-3xl");
  });
});
