import { describe, it, expect, vi, beforeEach } from "vitest";

// day/[date]/page.tsx is a heavy async server component with DB calls.
// The reading-width/header-grid constants are asserted directly. The phase
// computation, the DayIdeas / "browse wishlist" / NearbyWishlist 3-way
// conditional, the broadened wishlist query, and the conditional
// things-to-do fetch (Task 16) are exercised by actually invoking DayPage
// with mocked db per-model methods (mirrors phase-travelling.test.tsx).

const {
  requireTripAccessMock,
  tripFindUniqueMock,
  stopFindManyMock,
  itemFindManyMock,
  transportFindManyMock,
  accommodationFindManyMock,
  journalEntryFindManyMock,
  attachmentFindManyMock,
  buildItineraryMock,
  isFreeFormDayMock,
  nearbyWishlistItemsMock,
  dayIdeasWishlistMock,
  todayISOInZoneMock,
  buildDayMapModelMock,
  buildItemDirectionsMock,
  flagTightConnectionsMock,
  daylightMock,
  getDayWeatherMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn(),
  tripFindUniqueMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn(),
  accommodationFindManyMock: vi.fn(),
  journalEntryFindManyMock: vi.fn(),
  attachmentFindManyMock: vi.fn(),
  buildItineraryMock: vi.fn(),
  isFreeFormDayMock: vi.fn(),
  nearbyWishlistItemsMock: vi.fn(),
  dayIdeasWishlistMock: vi.fn(),
  todayISOInZoneMock: vi.fn(),
  buildDayMapModelMock: vi.fn(),
  buildItemDirectionsMock: vi.fn(),
  flagTightConnectionsMock: vi.fn(),
  daylightMock: vi.fn(),
  getDayWeatherMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: tripFindUniqueMock },
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    journalEntry: { findMany: journalEntryFindManyMock },
    attachment: { findMany: attachmentFindManyMock },
  },
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
// Keep the real `addDays`/`daysBetween` — computeTripPhase (real,
// lib/trip-phase.ts) and the page's own adjustDate/buffer logic depend on
// date arithmetic that must stay correct even though display formatting is
// stubbed.
vi.mock("@/lib/dates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dates")>();
  return { ...actual, formatLongDate: vi.fn(), todayISO: vi.fn(), tzAbbrev: vi.fn() };
});
vi.mock("@/lib/tz", () => ({
  todayISOInZone: todayISOInZoneMock,
  currentTripTimezone: vi.fn().mockReturnValue("UTC"),
}));
vi.mock("@/lib/itinerary", () => ({
  buildItinerary: buildItineraryMock,
  isFreeFormDay: isFreeFormDayMock,
}));
vi.mock("@/lib/day-map", () => ({
  buildDayMapModel: buildDayMapModelMock,
  buildItemDirections: buildItemDirectionsMock,
}));
vi.mock("@/lib/nearby", () => ({
  nearbyWishlistItems: nearbyWishlistItemsMock,
  dayIdeasWishlist: dayIdeasWishlistMock,
}));
vi.mock("@/lib/flags", () => ({ flagTightConnections: flagTightConnectionsMock }));
vi.mock("@/lib/daylight", () => ({ daylight: daylightMock, utcHmToZone: vi.fn() }));
vi.mock("@/lib/weather", () => ({ getDayWeather: getDayWeatherMock }));
vi.mock("@/lib/time-display", () => ({ zoneLabel: vi.fn() }));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => null }));
vi.mock("@/components/trip/timeline", () => ({ Timeline: () => null }));
vi.mock("@/components/trip/day-nav", () => ({ DayNav: () => null }));
vi.mock("@/components/trip/day-map-panel", () => ({ DayMapPanel: () => null }));
vi.mock("@/components/trip/nearby-wishlist", () => ({ NearbyWishlist: () => null }));
vi.mock("@/components/trip/day-ideas", () => ({ DayIdeas: () => null }));
vi.mock("@/components/trip/day-feasibility", () => ({ DayFeasibility: () => null }));
vi.mock("@/components/trip/weather-daylight-card", () => ({ WeatherDaylightCard: () => null }));
vi.mock("@/components/trip/item-form-dialog", () => ({ AddItemButton: () => null }));
vi.mock("@/components/trip/journal-editor", () => ({ JournalEditor: () => null }));
// React import needed for JSX in mocks above
import React from "react";

const { DAY_READING_WIDTH_CLASS, DAY_HEADER_GRID_CLASS } = await import("./page");
const DayPage = (await import("./page")).default;
const { NearbyWishlist } = await import("@/components/trip/nearby-wishlist");
const { DayIdeas } = await import("@/components/trip/day-ideas");
const { JournalEditor } = await import("@/components/trip/journal-editor");
// Not mocked — used by identity to find every place the day page renders a
// read-only entry for another Traveller.
const { JournalEntryView } = await import("@/components/trip/journal-entry-view");

// Server components aren't run through a renderer here — walk the returned
// React element tree by hand (mirrors phase-travelling.test.tsx).
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

// Same walk, but collects every match instead of stopping at the first —
// needed to assert exactly one read-only JournalEntryView renders (the
// other Traveller's), not the caller's own.
function findAllElementsByType(
  node: unknown,
  type: unknown,
  acc: { props: Record<string, unknown> }[] = [],
): { props: Record<string, unknown> }[] {
  if (node == null || typeof node !== "object") return acc;
  // A raw array shows up when a child is itself the result of `.map()`
  // (e.g. otherJournalEntries.map(...)) rather than a single element —
  // descend into each entry directly rather than treating the array as one
  // node (which has no .type/.props of its own).
  if (Array.isArray(node)) {
    for (const child of node) findAllElementsByType(child, type, acc);
    return acc;
  }
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (el.type === type) acc.push(node as { props: Record<string, unknown> });
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) findAllElementsByType(child, type, acc);
  } else {
    findAllElementsByType(children, type, acc);
  }
  return acc;
}

describe("Day page reading-width cap", () => {
  it("timeline+editor stack carries max-w-3xl to cap reading line length", () => {
    expect(DAY_READING_WIDTH_CLASS).toContain("max-w-3xl");
  });
});

describe("Day page header layout", () => {
  it("lays the header and weather side by side on desktop", () => {
    expect(DAY_HEADER_GRID_CLASS).toContain("lg:grid-cols-[minmax(0,1fr)_auto]");
  });
});

// A DayPlan-shaped stand-in matching what buildItinerary would produce, with
// only the fields DayPage actually touches populated.
function makeDayPlan(opts: {
  dateISO: string;
  stopId: string | null;
  timedItems?: unknown[];
  untimedItems?: unknown[];
}) {
  return {
    dateISO: opts.dateISO,
    stop: opts.stopId
      ? { id: opts.stopId, name: "Munich", country: "Germany", timezone: "Europe/Berlin" }
      : null,
    timedItems: opts.timedItems ?? [],
    untimedItems: opts.untimedItems ?? [],
    transportEntries: [],
    accommodationEntries: [],
  };
}

describe("Day page — Day ideas mount and phase gating (Task 16)", () => {
  const STOP = {
    id: "stop-1",
    name: "Munich",
    country: "Germany",
    countryCode: "de",
    timezone: "Europe/Berlin",
    arriveDate: "2026-01-01",
    departDate: "2026-01-10",
    sortOrder: 0,
    // No coordinates: keeps the daylight/weather branches (unrelated to
    // Task 16) untriggered so this suite can focus on the Day-ideas wiring.
    lat: null,
    lng: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    stopFindManyMock.mockResolvedValue([STOP]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    journalEntryFindManyMock.mockResolvedValue([]);
    // Both attachment.findMany calls (journal photos + all-attachments).
    attachmentFindManyMock.mockResolvedValue([]);
    buildDayMapModelMock.mockReturnValue({});
    buildItemDirectionsMock.mockReturnValue({});
    nearbyWishlistItemsMock.mockReturnValue([]);
    dayIdeasWishlistMock.mockReturnValue([]);
    flagTightConnectionsMock.mockReturnValue([]);
    daylightMock.mockReturnValue(null);
    getDayWeatherMock.mockResolvedValue(null);
  });

  it("renders DayIdeas (not NearbyWishlist) on a free-form day while Travelling, and scopes the things-to-do query to the day's stop", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-01-01", endDate: "2026-01-10" });
    // "Today" (system clock, in the trip's reference timezone) falls inside
    // the trip range → Travelling phase.
    todayISOInZoneMock.mockReturnValue("2026-01-05");
    isFreeFormDayMock.mockReturnValue(true);
    buildItineraryMock.mockReturnValue([
      makeDayPlan({ dateISO: "2026-01-05", stopId: "stop-1" }),
    ]);
    // item.findMany is called 3 times in this scenario: itinerary items,
    // wishlist ideas, then the stop-scoped things-to-do query.
    itemFindManyMock.mockResolvedValue([]);

    const tree = await DayPage({
      params: Promise.resolve({ tripId: "trip-1", date: "2026-01-05" }),
    });

    expect(findElementByType(tree, DayIdeas)).not.toBeNull();
    expect(findElementByType(tree, NearbyWishlist)).toBeNull();

    expect(itemFindManyMock.mock.calls.length).toBe(3);
    const thingsToDoCall = itemFindManyMock.mock.calls[2][0];
    expect(thingsToDoCall.where).toEqual(
      expect.objectContaining({ tripId: "trip-1", forkId: null, stopId: "stop-1", date: null }),
    );
  });

  it("renders the light 'browse your wishlist' line (not DayIdeas) on a free-form day before departure, and skips the things-to-do query", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-01-10", endDate: "2026-01-20" });
    // "Today" is before the trip's startDate → not yet Travelling.
    todayISOInZoneMock.mockReturnValue("2025-12-20");
    isFreeFormDayMock.mockReturnValue(true);
    buildItineraryMock.mockReturnValue([
      makeDayPlan({ dateISO: "2026-01-10", stopId: "stop-1" }),
    ]);
    itemFindManyMock.mockResolvedValue([]);

    const tree = await DayPage({
      params: Promise.resolve({ tripId: "trip-1", date: "2026-01-10" }),
    });

    expect(findElementByType(tree, DayIdeas)).toBeNull();
    expect(findElementByType(tree, NearbyWishlist)).toBeNull();
    const text = JSON.stringify(tree);
    expect(text).toContain("browse your wishlist");

    // Only the itinerary-items and wishlist-idea queries ran — no third call.
    expect(itemFindManyMock.mock.calls.length).toBe(2);
  });

  it("renders NearbyWishlist (not DayIdeas) on a planned day, and skips the things-to-do query", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-01-01", endDate: "2026-01-10" });
    todayISOInZoneMock.mockReturnValue("2026-01-05");
    isFreeFormDayMock.mockReturnValue(false);
    buildItineraryMock.mockReturnValue([
      makeDayPlan({
        dateISO: "2026-01-05",
        stopId: "stop-1",
        timedItems: [{ kind: "item", item: { id: "i1" } }],
      }),
    ]);
    itemFindManyMock.mockResolvedValue([]);

    const tree = await DayPage({
      params: Promise.resolve({ tripId: "trip-1", date: "2026-01-05" }),
    });

    expect(findElementByType(tree, NearbyWishlist)).not.toBeNull();
    expect(findElementByType(tree, DayIdeas)).toBeNull();
    expect(itemFindManyMock.mock.calls.length).toBe(2);
  });

  it("broadens the wishlist-idea query to select countryCode without a lat/lng filter", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-01-01", endDate: "2026-01-10" });
    todayISOInZoneMock.mockReturnValue("2026-01-05");
    isFreeFormDayMock.mockReturnValue(false);
    buildItineraryMock.mockReturnValue([
      makeDayPlan({ dateISO: "2026-01-05", stopId: "stop-1", timedItems: [{ kind: "item", item: { id: "i1" } }] }),
    ]);
    itemFindManyMock.mockResolvedValue([]);

    await DayPage({ params: Promise.resolve({ tripId: "trip-1", date: "2026-01-05" }) });

    // Second item.findMany call is the wishlist-idea query.
    const wishlistCall = itemFindManyMock.mock.calls[1][0];
    expect(wishlistCall.where).not.toHaveProperty("lat");
    expect(wishlistCall.where).not.toHaveProperty("lng");
    expect(wishlistCall.select).toEqual(expect.objectContaining({ countryCode: true }));
  });
});

// ARCH-DAT-6 fix round 1, Finding 2: pin the multi-entry read path so a
// later "simplification" back to journalEntries[0] (single entry) can't
// silently regress without a test failing.
describe("Day page — Journal entries are per-Traveller (ARCH-DAT-6)", () => {
  const STOP = {
    id: "stop-1",
    name: "Munich",
    country: "Germany",
    countryCode: "de",
    timezone: "Europe/Berlin",
    arriveDate: "2026-01-01",
    departDate: "2026-01-10",
    sortOrder: 0,
    lat: null,
    lng: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({ user: { id: "me" }, membership: {} });
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-01-01", endDate: "2026-01-10" });
    todayISOInZoneMock.mockReturnValue("2026-01-05");
    isFreeFormDayMock.mockReturnValue(false);
    stopFindManyMock.mockResolvedValue([STOP]);
    itemFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([]);
    buildItineraryMock.mockReturnValue([
      makeDayPlan({
        dateISO: "2026-01-05",
        stopId: "stop-1",
        timedItems: [{ kind: "item", item: { id: "i1" } }],
      }),
    ]);
    buildDayMapModelMock.mockReturnValue({});
    buildItemDirectionsMock.mockReturnValue({});
    nearbyWishlistItemsMock.mockReturnValue([]);
    dayIdeasWishlistMock.mockReturnValue([]);
    flagTightConnectionsMock.mockReturnValue([]);
    daylightMock.mockReturnValue(null);
    getDayWeatherMock.mockResolvedValue(null);
  });

  it("renders every Traveller's entry for the date — the caller's own editable, everyone else's read-only and attributed", async () => {
    journalEntryFindManyMock.mockResolvedValue([
      {
        id: "entry-me",
        body: "My account of the day",
        authorId: "me",
        updatedAt: new Date("2026-01-05T20:00:00Z"),
        author: { name: "Cam" },
      },
      {
        id: "entry-them",
        body: "Their account of the day",
        authorId: "them",
        updatedAt: new Date("2026-01-05T21:00:00Z"),
        author: { name: "Alex" },
      },
    ]);

    const tree = await DayPage({
      params: Promise.resolve({ tripId: "trip-1", date: "2026-01-05" }),
    });

    // The caller's own entry is the editable one, fed to JournalEditor.
    const editor = findElementByType(tree, JournalEditor);
    expect(editor).not.toBeNull();
    expect(editor!.props.initialBody).toBe("My account of the day");

    // Exactly one read-only entry renders — the other Traveller's, not the
    // caller's own (which must stay editor-only, not duplicated read-only).
    const readOnlyEntries = findAllElementsByType(tree, JournalEntryView);
    expect(readOnlyEntries).toHaveLength(1);
    expect(readOnlyEntries[0].props.body).toBe("Their account of the day");
    expect(readOnlyEntries[0].props.authorName).toBe("Alex");
  });

  it("passes an empty editable body and shows only the other Traveller's entry when the caller has none of their own", async () => {
    journalEntryFindManyMock.mockResolvedValue([
      {
        id: "entry-them",
        body: "Their account of the day",
        authorId: "them",
        updatedAt: new Date("2026-01-05T21:00:00Z"),
        author: { name: "Alex" },
      },
    ]);

    const tree = await DayPage({
      params: Promise.resolve({ tripId: "trip-1", date: "2026-01-05" }),
    });

    const editor = findElementByType(tree, JournalEditor);
    expect(editor!.props.initialBody).toBe("");
    expect(editor!.props.updatedAt).toBeNull();

    const readOnlyEntries = findAllElementsByType(tree, JournalEntryView);
    expect(readOnlyEntries).toHaveLength(1);
    expect(readOnlyEntries[0].props.authorName).toBe("Alex");
  });
});
