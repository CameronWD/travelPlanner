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
  costFindManyMock,
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
  costFindManyMock: vi.fn(),
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
    cost: { findMany: costFindManyMock },
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
vi.mock("@/lib/itinerary", async (importOriginal) => {
  // dayHasEntries stays real — it decides Timeline vs the kit empty state.
  const actual = await importOriginal<typeof import("@/lib/itinerary")>();
  return {
    buildItinerary: buildItineraryMock,
    isFreeFormDay: isFreeFormDayMock,
    dayHasEntries: actual.dayHasEntries,
  };
});
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
import type { DayEntryEditor } from "@/components/trip/day-entry-link";

const { DAY_READING_WIDTH_CLASS, DAY_HEADER_GRID_CLASS } = await import("./page");
const DayPage = (await import("./page")).default;
const { NearbyWishlist } = await import("@/components/trip/nearby-wishlist");
const { DayIdeas } = await import("@/components/trip/day-ideas");
const { JournalEditor } = await import("@/components/trip/journal-editor");
// Not mocked — used by identity to find every place the day page renders a
// read-only entry for another Traveller.
const { JournalEntryView } = await import("@/components/trip/journal-entry-view");
const { EmptyState } = await import("@/components/ui/empty-state");
const { Timeline } = await import("@/components/trip/timeline");
const { AddItemButton } = await import("@/components/trip/item-form-dialog");
const { DayFeasibility } = await import("@/components/trip/day-feasibility");
// Not mocked — the kit surface the timeline sits in.
const { Card } = await import("@/components/ui/card");

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

  it("shares the body's reading width (Task 15 H2)", () => {
    expect(DAY_HEADER_GRID_CLASS).toContain("max-w-3xl");
    expect(DAY_HEADER_GRID_CLASS).toContain("mx-auto");
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
    costFindManyMock.mockResolvedValue([]);
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
    costFindManyMock.mockResolvedValue([]);
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

describe("Day page — Playground kit (Task 12a)", () => {
  const STOP = {
    id: "stop-1",
    name: "Munich",
    country: "Germany",
    countryCode: "de",
    timezone: "Europe/Berlin",
    arriveDate: "2026-01-01",
    departDate: "2026-01-20",
    sortOrder: 0,
    lat: null,
    lng: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({ user: { id: "me" }, membership: {} });
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-01-01", endDate: "2026-01-20" });
    todayISOInZoneMock.mockReturnValue("2026-01-05");
    stopFindManyMock.mockResolvedValue([STOP]);
    itemFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);
    buildDayMapModelMock.mockReturnValue({});
    buildItemDirectionsMock.mockReturnValue({});
    nearbyWishlistItemsMock.mockReturnValue([]);
    dayIdeasWishlistMock.mockReturnValue([]);
    flagTightConnectionsMock.mockReturnValue([]);
    daylightMock.mockReturnValue(null);
    getDayWeatherMock.mockResolvedValue(null);
  });

  async function renderPlannedDay() {
    isFreeFormDayMock.mockReturnValue(false);
    buildItineraryMock.mockReturnValue([
      makeDayPlan({ dateISO: "2026-01-05", stopId: "stop-1", timedItems: [{ kind: "item", item: { id: "i1" } }] }),
    ]);
    return DayPage({ params: Promise.resolve({ tripId: "trip-1", date: "2026-01-05" }) });
  }

  it("hands the Timeline an editor built from the day's entities and costs", async () => {
    tripFindUniqueMock.mockResolvedValue({
      startDate: "2026-01-01", endDate: "2026-01-20", name: "Europe", homeCurrency: "AUD", homeName: "Sydney",
    });
    itemFindManyMock.mockResolvedValue([
      {
        id: "item-1", title: "Residenz", category: "SIGHTSEEING", date: "2026-01-05", startTime: null, endTime: null,
        sortOrder: 0, stopId: "stop-1", lat: null, lng: null, address: null, link: null, booking: null, notes: null,
      },
    ]);
    transportFindManyMock.mockResolvedValue([
      {
        id: "tr-1", mode: "TRAIN", fromStopId: "stop-1", toStopId: null, anchorStopId: "stop-1", depIsHome: false, arrIsHome: false,
        depPlace: "München Hbf", arrPlace: "Salzburg", depAt: null, arrAt: null, depLat: null, depLng: null, arrLat: null, arrLng: null,
        reference: null, notes: null, sortOrder: 3,
      },
    ]);
    accommodationFindManyMock.mockResolvedValue([
      {
        id: "acc-1", stopId: "stop-1", name: "Hotel Vier", address: null, checkIn: "2026-01-04", checkOut: "2026-01-06",
        checkInTime: null, checkOutTime: null, confirmation: null, notes: null, lat: null, lng: null,
      },
    ]);
    costFindManyMock.mockResolvedValue([
      { id: "c1", ownerType: "ITEM", ownerId: "item-1", costMinor: 1000, paidMinor: null, currency: "AUD", rateToHome: null, paidAt: null, dueDate: null, label: null, category: null },
    ]);

    const tree = await renderPlannedDay();
    const timeline = findElementByType(tree, Timeline);
    expect(timeline).not.toBeNull();
    const editor = timeline!.props.editor as DayEntryEditor;
    expect(editor.tripId).toBe("trip-1");
    expect(editor.homeCurrency).toBe("AUD");
    expect(editor.homeBaseName).toBe("Sydney");
    expect(editor.items["item-1"]).toEqual(expect.objectContaining({ id: "item-1", title: "Residenz" }));
    expect(editor.transports["tr-1"]).toEqual(
      expect.objectContaining({ id: "tr-1", mode: "TRAIN", sortOrder: 3, fromStopName: "Munich", toStopName: null }),
    );
    expect(editor.accommodations["acc-1"]).toEqual({
      accommodation: expect.objectContaining({ id: "acc-1", name: "Hotel Vier" }),
      stopDateRange: { arriveDate: "2026-01-01", departDate: "2026-01-20" },
    });
    expect(editor.costsByOwner["item-1"]).toHaveLength(1);
    expect(editor.stops).toEqual([{ id: "stop-1", name: "Munich", timezone: "Europe/Berlin", arriveDate: "2026-01-01" }]);
    // The day page is always the real plan — its cost query is scoped like the others.
    expect(costFindManyMock.mock.calls[0][0].where).toEqual(expect.objectContaining({ tripId: "trip-1", forkId: null }));
  });

  it("puts the day's timeline inside a kit Card", async () => {
    const tree = await renderPlannedDay();
    const card = findAllElementsByType(tree, Card).find((c) => findElementByType(c, Timeline));
    expect(card).toBeDefined();
    expect(findElementByType(tree, EmptyState)).toBeNull();
  });

  it("renders the kit empty treatment (EmptyState) instead of the Timeline on an empty day", async () => {
    isFreeFormDayMock.mockReturnValue(true);
    buildItineraryMock.mockReturnValue([makeDayPlan({ dateISO: "2026-01-05", stopId: "stop-1" })]);
    const tree = await DayPage({ params: Promise.resolve({ tripId: "trip-1", date: "2026-01-05" }) });
    const empty = findElementByType(tree, EmptyState);
    expect(empty).not.toBeNull();
    expect(empty!.props.title).toBe("Nothing planned");
    expect(findElementByType(tree, Timeline)).toBeNull();
  });

  it("folds the 'browse your wishlist' nudge into the empty state before departure, so it isn't said twice", async () => {
    todayISOInZoneMock.mockReturnValue("2025-12-20");
    isFreeFormDayMock.mockReturnValue(true);
    buildItineraryMock.mockReturnValue([makeDayPlan({ dateISO: "2026-01-05", stopId: "stop-1" })]);
    const tree = await DayPage({ params: Promise.resolve({ tripId: "trip-1", date: "2026-01-05" }) });
    const empty = findElementByType(tree, EmptyState);
    expect(JSON.stringify(empty!.props.description)).toContain("browse your wishlist");
    expect(JSON.stringify(tree).match(/browse your wishlist/g)).toHaveLength(1);
  });

  it("offers the kit '+ Add to this day' block secondary button", async () => {
    const tree = await renderPlannedDay();
    const add = findElementByType(tree, AddItemButton);
    expect(add!.props.label).toBe("Add to this day");
    expect(add!.props.variant).toBe("secondary");
    expect(String(add!.props.className)).toMatch(/\bw-full\b/);
  });

  it("keeps the feasibility advisory", async () => {
    const tree = await renderPlannedDay();
    expect(findElementByType(tree, DayFeasibility)).not.toBeNull();
  });

  it("has none of the pre-reskin page shapes and no per-person money language", async () => {
    const text = JSON.stringify(await renderPlannedDay());
    expect(text).not.toMatch(/rounded-xl border border-border|shadow-soft/);
    expect(text).not.toMatch(/per person|each owes|split/i);
  });
});
